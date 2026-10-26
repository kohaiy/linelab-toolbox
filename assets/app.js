(function () {
  'use strict';

  var registry = window.LINELAB;
  if (!registry) return;

  var TOOLS = registry.tools.slice();
  var CATEGORIES = registry.categories.slice();
  var TOOL_MAP = Object.create(null);
  var CATEGORY_MAP = Object.create(null);
  var BASE_TITLE = '行间 LineLab · 浏览器工具箱';
  var BASE_DESCRIPTION = '行间是一组纯前端的日常工具：文本整理、JSON / CSV、开发辅助、随机生成、图片转换。无需登录，粘贴即用，数据不离开浏览器。';
  var STORAGE_OPTIONS = 'linelab:options:v1';
  var STORAGE_THEME = 'linelab:theme';

  TOOLS.forEach(function (tool) { TOOL_MAP[tool.id] = tool; });
  CATEGORIES.forEach(function (category) { CATEGORY_MAP[category.id] = category; });

  var CATEGORY_ORDER = Object.create(null);
  CATEGORIES.forEach(function (category, index) { CATEGORY_ORDER[category.id] = index; });
  TOOLS.sort(function (a, b) {
    return CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category];
  });

  var state = {
    route: null,
    activeToolId: null,
    inputs: Object.create(null),
    optionState: loadOptionState(),
    homeQuery: '',
    homeCategory: 'all',
    paletteOpen: false,
    paletteQuery: '',
    paletteItems: [],
    paletteIndex: 0,
    lastFocus: null,
    transformFrame: 0,
    transformToken: 0,
    toastTimer: null
  };

  var dom = {};

  /* ------------------------------------------------------------------ */
  /* 通用工具函数                                                        */
  /* ------------------------------------------------------------------ */

  function byId(id) {
    return document.getElementById(id);
  }

  function create(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(value);
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      /* 隐私模式下忽略持久化失败 */
    }
  }

  function loadOptionState() {
    var raw = readStorage(STORAGE_OPTIONS);
    if (!raw) return Object.create(null);
    try {
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return Object.create(null);
      return parsed;
    } catch (error) {
      return Object.create(null);
    }
  }

  function persistOptions() {
    writeStorage(STORAGE_OPTIONS, JSON.stringify(state.optionState));
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function coerceOption(option, value) {
    if (option.type === 'checkbox') {
      return value === true || value === 'true' || value === 1 || value === '1';
    }
    if (option.type === 'number') {
      var number = Number(value);
      if (!isFinite(number)) return option.value;
      if (option.min !== undefined) number = Math.max(option.min, number);
      if (option.max !== undefined) number = Math.min(option.max, number);
      return number;
    }
    if (option.type === 'select' || option.type === 'segmented') {
      for (var i = 0; i < option.choices.length; i += 1) {
        if (String(option.choices[i].value) === String(value)) return option.choices[i].value;
      }
      return option.value;
    }
    return value === undefined || value === null ? '' : String(value);
  }

  function ensureToolOptions(tool) {
    var saved = state.optionState[tool.id];
    var options = {};
    tool.options.forEach(function (option) {
      options[option.id] = saved && hasOwn(saved, option.id)
        ? coerceOption(option, saved[option.id])
        : option.value;
    });
    state.optionState[tool.id] = options;
    return options;
  }

  function defaultOptions(tool) {
    var options = {};
    tool.options.forEach(function (option) { options[option.id] = option.value; });
    return options;
  }

  function getActiveTool() {
    return state.activeToolId ? TOOL_MAP[state.activeToolId] : null;
  }

  function getCategory(tool) {
    return CATEGORY_MAP[tool.category] || { name: '其他', id: 'other' };
  }

  function countText(text) {
    if (!text) return { lines: 0, chars: 0 };
    var normalized = String(text).replace(/\r\n?/g, '\n');
    return {
      lines: normalized.split('\n').length,
      chars: Array.from(String(text)).length
    };
  }

  function statsLabel(text, emptyLabel) {
    var stats = countText(text);
    if (!stats.lines) return emptyLabel;
    return formatNumber(stats.lines) + ' 行 · ' + formatNumber(stats.chars) + ' 字符';
  }

  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes < 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }

  function escapeAttribute(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function isTypingTarget(target) {
    if (!target || !target.tagName) return false;
    var tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
  }

  function setDocumentMeta(tool) {
    document.title = tool ? tool.name + ' · 行间 LineLab' : BASE_TITLE;
    var description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute('content', tool ? tool.description : BASE_DESCRIPTION);
    }
  }

  /* ------------------------------------------------------------------ */
  /* 首页 / 目录                                                         */
  /* ------------------------------------------------------------------ */

  function matchesQuery(tool, query) {
    if (!query) return true;
    var category = getCategory(tool);
    var haystack = [
      tool.name,
      tool.short,
      tool.description,
      tool.keywords.join(' '),
      tool.tags.join(' '),
      category.name
    ].join(' ').toLocaleLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function renderCategoryChips() {
    if (!dom.categoryChips) return;
    dom.categoryChips.textContent = '';
    var chips = [{ id: 'all', name: '全部', count: TOOLS.length }].concat(CATEGORIES.map(function (category) {
      return {
        id: category.id,
        name: category.name,
        count: TOOLS.filter(function (tool) { return tool.category === category.id; }).length
      };
    }));

    chips.forEach(function (chip) {
      var button = create('button', 'category-chip');
      button.type = 'button';
      button.dataset.category = chip.id;
      button.setAttribute('aria-pressed', String(state.homeCategory === chip.id));
      if (state.homeCategory === chip.id) button.classList.add('is-active');
      button.appendChild(create('span', 'chip-name', chip.name));
      button.appendChild(create('span', 'chip-count', String(chip.count)));
      dom.categoryChips.appendChild(button);
    });
  }

  function setActiveCategory(categoryId) {
    state.homeCategory = categoryId;
    if (!dom.categoryChips) return;
    Array.prototype.forEach.call(dom.categoryChips.querySelectorAll('.category-chip'), function (button) {
      var active = button.dataset.category === categoryId;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function buildToolCard(tool, index) {
    var card = create('a', 'tool-card cat-' + tool.category);
    card.href = '#/' + tool.id;
    card.style.setProperty('--order', String(index));

    var top = create('div', 'card-top');
    var glyph = create('span', 'tool-glyph', tool.glyph);
    glyph.setAttribute('aria-hidden', 'true');
    top.appendChild(glyph);
    var arrow = create('span', 'card-arrow', '\u2197');
    arrow.setAttribute('aria-hidden', 'true');
    top.appendChild(arrow);
    card.appendChild(top);

    card.appendChild(create('span', 'card-category', getCategory(tool).name));
    card.appendChild(create('h3', 'card-title', tool.name));
    card.appendChild(create('p', 'card-short', tool.short));

    var foot = create('div', 'card-foot');
    var tags = create('div', 'card-tags');
    tool.tags.slice(0, 3).forEach(function (tag) {
      tags.appendChild(create('span', 'mini-tag', tag));
    });
    foot.appendChild(tags);
    foot.appendChild(create('span', 'card-go', '打开'));
    card.appendChild(foot);

    return card;
  }

  function renderCatalog() {
    if (!dom.toolGrid) return;
    var query = state.homeQuery.toLocaleLowerCase();
    var results = TOOLS.filter(function (tool) {
      var categoryMatch = state.homeCategory === 'all' || tool.category === state.homeCategory;
      return categoryMatch && matchesQuery(tool, query);
    });

    dom.toolGrid.textContent = '';
    var fragment = document.createDocumentFragment();
    results.forEach(function (tool, index) {
      fragment.appendChild(buildToolCard(tool, index));
    });
    dom.toolGrid.appendChild(fragment);
    dom.toolGrid.hidden = results.length === 0;

    if (dom.emptyState) {
      dom.emptyState.hidden = results.length !== 0;
      var message = dom.emptyState.querySelector('p');
      if (message) {
        if (state.homeQuery) {
          message.textContent = '没有找到与「' + state.homeQuery + '」匹配的工具，换个关键词试试。';
        } else {
          message.textContent = '这个分类下暂时没有工具，清除筛选后再看看。';
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* 工具页                                                             */
  /* ------------------------------------------------------------------ */

  function renderSidebar(activeId) {
    if (!dom.sidebarNav) return;
    dom.sidebarNav.textContent = '';
    CATEGORIES.forEach(function (category) {
      var categoryTools = TOOLS.filter(function (tool) { return tool.category === category.id; });
      if (!categoryTools.length) return;

      var group = create('div', 'nav-group');
      group.appendChild(create('p', 'nav-label', category.name));
      categoryTools.forEach(function (tool) {
        var link = create('a', 'nav-link');
        link.href = '#/' + tool.id;
        if (tool.id === activeId) {
          link.classList.add('is-active');
          link.setAttribute('aria-current', 'page');
        }
        link.appendChild(create('span', 'nav-glyph', tool.glyph));
        link.appendChild(create('span', 'nav-name', tool.name));
        group.appendChild(link);
      });
      dom.sidebarNav.appendChild(group);
    });
  }

  function renderToolHead(tool) {
    dom.crumbCategory.textContent = getCategory(tool).name;
    dom.crumbTool.textContent = tool.name;
    dom.toolTitle.textContent = tool.name;
    dom.toolDesc.textContent = tool.description;
    dom.toolGlyph.textContent = tool.glyph;
    dom.toolGlyph.className = 'tool-glyph tool-glyph-lg cat-' + tool.category;

    dom.toolTags.textContent = '';
    tool.tags.forEach(function (tag) {
      dom.toolTags.appendChild(create('span', 'tag', tag));
    });

    dom.inputText.placeholder = tool.inputPlaceholder || '在这里粘贴文本…';
    dom.outputText.placeholder = tool.outputPlaceholder || '结果会出现在这里…';
  }

  function renderTips(tool) {
    if (!dom.tipsList) return;
    dom.tipsList.textContent = '';
    tool.tips.forEach(function (tip, index) {
      var item = create('li', 'tip-item');
      item.appendChild(create('span', 'tip-index', String(index + 1).padStart(2, '0')));
      item.appendChild(create('p', null, tip));
      dom.tipsList.appendChild(item);
    });
  }

  function optionInputId(tool, option) {
    return 'opt-' + tool.id + '-' + option.id;
  }

  function renderOptions(tool) {
    var options = ensureToolOptions(tool);
    dom.optionsGrid.textContent = '';

    tool.options.forEach(function (option) {
      var wrapper = create('div', 'option');
      if (option.wide) wrapper.classList.add('option-wide');
      var inputId = optionInputId(tool, option);

      if (option.type === 'checkbox') {
        wrapper.classList.add('option-checkbox');
        var label = create('label', 'switch-row');
        label.setAttribute('for', inputId);

        var switchWrap = create('span', 'switch');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.id = inputId;
        input.dataset.option = option.id;
        input.checked = Boolean(options[option.id]);
        switchWrap.appendChild(input);
        switchWrap.appendChild(create('span', 'switch-track'));
        label.appendChild(switchWrap);

        var copy = create('span', 'switch-copy');
        copy.appendChild(create('span', 'option-name', option.label));
        if (option.hint) copy.appendChild(create('span', 'option-hint', option.hint));
        label.appendChild(copy);
        wrapper.appendChild(label);
        dom.optionsGrid.appendChild(wrapper);
        return;
      }

      var head = create('div', 'option-head');
      if (option.type === 'segmented') {
        var groupLabel = create('span', 'option-label', option.label);
        groupLabel.id = inputId + '-label';
        head.appendChild(groupLabel);
      } else {
        var labelText = create('label', 'option-label', option.label);
        labelText.setAttribute('for', inputId);
        head.appendChild(labelText);
      }
      wrapper.appendChild(head);

      if (option.type === 'segmented') {
        var group = create('div', 'segmented');
        group.setAttribute('role', 'group');
        group.setAttribute('aria-labelledby', inputId + '-label');
        option.choices.forEach(function (choice) {
          var button = create('button', 'segment', choice.label);
          button.type = 'button';
          button.dataset.option = option.id;
          button.dataset.value = String(choice.value);
          var active = String(options[option.id]) === String(choice.value);
          button.classList.toggle('is-active', active);
          button.setAttribute('aria-pressed', String(active));
          group.appendChild(button);
        });
        wrapper.appendChild(group);
      } else if (option.type === 'select') {
        var select = document.createElement('select');
        select.className = 'control control-select';
        select.id = inputId;
        select.dataset.option = option.id;
        option.choices.forEach(function (choice) {
          var item = document.createElement('option');
          item.value = String(choice.value);
          item.textContent = choice.label;
          select.appendChild(item);
        });
        select.value = String(options[option.id]);
        wrapper.appendChild(select);
      } else if (option.type === 'number') {
        var number = document.createElement('input');
        number.className = 'control';
        number.type = 'number';
        number.id = inputId;
        number.dataset.option = option.id;
        number.value = String(options[option.id]);
        if (option.min !== undefined) number.min = String(option.min);
        if (option.max !== undefined) number.max = String(option.max);
        if (option.step !== undefined) number.step = String(option.step);
        wrapper.appendChild(number);
      } else {
        var text = document.createElement('input');
        text.className = 'control';
        text.type = 'text';
        text.id = inputId;
        text.dataset.option = option.id;
        text.value = String(options[option.id] == null ? '' : options[option.id]);
        if (option.placeholder) text.placeholder = option.placeholder;
        text.autocomplete = 'off';
        text.spellcheck = false;
        wrapper.appendChild(text);
      }

      if (option.hint) {
        wrapper.appendChild(create('p', 'option-hint option-hint-block', option.hint));
      }
      dom.optionsGrid.appendChild(wrapper);
    });
  }

  function presetMatches(tool, preset, options) {
    return Object.keys(preset.options).every(function (key) {
      return String(options[key]) === String(preset.options[key]);
    });
  }

  function updatePresetStates(tool) {
    if (!dom.presetBar || !tool.presets) return;
    var options = ensureToolOptions(tool);
    Array.prototype.forEach.call(dom.presetBar.querySelectorAll('.preset-chip'), function (button) {
      var preset = tool.presets.filter(function (item) { return item.id === button.dataset.preset; })[0];
      var active = preset ? presetMatches(tool, preset, options) : false;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function renderPresets(tool) {
    if (!dom.presetBar) return;
    dom.presetBar.textContent = '';
    if (!tool.presets || !tool.presets.length) {
      dom.presetBar.hidden = true;
      return;
    }
    dom.presetBar.hidden = false;
    tool.presets.forEach(function (preset) {
      var button = create('button', 'preset-chip', preset.label);
      button.type = 'button';
      button.dataset.preset = preset.id;
      dom.presetBar.appendChild(button);
    });
    updatePresetStates(tool);
  }

  function renderInput(tool) {
    if (!hasOwn(state.inputs, tool.id)) {
      state.inputs[tool.id] = tool.sample;
    }
    dom.inputText.value = state.inputs[tool.id];
    dom.inputStats.textContent = statsLabel(dom.inputText.value, '等待输入');
  }

  function clearOutput() {
    dom.outputText.value = '';
    dom.outputPane.classList.remove('has-error');
    dom.outputError.hidden = true;
    dom.outputError.textContent = '';
    dom.outputStats.textContent = '等待输出';
    dom.outputDetail.textContent = '';
    dom.copyBtn.disabled = true;
    dom.downloadBtn.disabled = true;
    dom.swapBtn.disabled = true;
  }

  function showOutputError(message) {
    dom.outputPane.classList.add('has-error');
    dom.outputError.hidden = false;
    dom.outputError.textContent = message;
    dom.outputText.value = '';
    dom.outputStats.textContent = '转换失败';
    dom.outputDetail.textContent = '';
    dom.copyBtn.disabled = true;
    dom.downloadBtn.disabled = true;
    dom.swapBtn.disabled = true;
  }

  function showOutput(result) {
    var text = result && typeof result.text === 'string' ? result.text : '';
    dom.outputPane.classList.remove('has-error');
    dom.outputError.hidden = true;
    dom.outputError.textContent = '';
    dom.outputText.value = text;
    dom.outputStats.textContent = statsLabel(text, '等待输出');
    dom.outputDetail.textContent = result && result.detail ? result.detail : '';
    dom.copyBtn.disabled = text.length === 0;
    dom.downloadBtn.disabled = text.length === 0;
    dom.swapBtn.disabled = text.length === 0;
  }

  function runTransform() {
    var tool = getActiveTool();
    if (!tool || tool.custom) return;
    var input = hasOwn(state.inputs, tool.id) ? state.inputs[tool.id] : '';
    dom.inputStats.textContent = statsLabel(input, '等待输入');
    var token = ++state.transformToken;
    var result;
    try {
      result = tool.transform(input, ensureToolOptions(tool));
    } catch (error) {
      if (token === state.transformToken) showOutputError(error && error.message ? error.message : String(error));
      return;
    }

    if (result && typeof result.then === 'function') {
      dom.outputPane.classList.remove('has-error');
      dom.outputError.hidden = true;
      dom.outputStats.textContent = '计算中…';
      dom.outputDetail.textContent = '正在本地处理';
      dom.outputText.value = '';
      dom.copyBtn.disabled = true;
      dom.downloadBtn.disabled = true;
      dom.swapBtn.disabled = true;
      result.then(function (resolved) {
        if (token !== state.transformToken || state.activeToolId !== tool.id) return;
        if (typeof resolved === 'string') resolved = { text: resolved, detail: '' };
        showOutput(resolved || { text: '', detail: '' });
      }).catch(function (error) {
        if (token !== state.transformToken || state.activeToolId !== tool.id) return;
        showOutputError(error && error.message ? error.message : String(error));
      });
      return;
    }

    if (typeof result === 'string') result = { text: result, detail: '' };
    showOutput(result || { text: '', detail: '' });
  }

  function scheduleTransform() {
    if (state.transformFrame) return;
    state.transformFrame = window.requestAnimationFrame(function () {
      state.transformFrame = 0;
      runTransform();
    });
  }

  function showHome(options) {
    state.route = 'home';
    state.activeToolId = null;
    dom.homeView.hidden = false;
    dom.toolView.hidden = true;
    setDocumentMeta(null);
    renderCategoryChips();
    renderCatalog();
    if (!options || options.scroll !== false) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }

  function renderCustomTool(tool) {
    dom.customTool.textContent = '';
    if (!tool || tool.custom !== 'image-base64') return;

    var current = null;
    var wrapper = create('div', 'image-tool');

    var drop = create('div', 'image-drop');
    drop.tabIndex = 0;
    drop.setAttribute('role', 'button');
    drop.setAttribute('aria-label', '选择或拖入图片');

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    drop.appendChild(fileInput);

    var dropIcon = create('span', 'image-drop-icon', 'IMG');
    dropIcon.setAttribute('aria-hidden', 'true');
    drop.appendChild(dropIcon);
    drop.appendChild(create('h2', 'image-drop-title', '拖入图片，或点击选择'));
    drop.appendChild(create('p', 'image-drop-note', 'PNG · JPG · GIF · WebP · SVG，文件只在本地读取'));

    var workspace = create('div', 'image-workspace');
    workspace.hidden = true;

    var previewCard = create('div', 'image-preview-card');
    var preview = document.createElement('img');
    preview.alt = '图片预览';
    preview.className = 'image-preview';
    previewCard.appendChild(preview);
    workspace.appendChild(previewCard);

    var controls = create('div', 'image-controls');
    var meta = create('div', 'image-meta');
    var metaName = create('strong', 'image-file-name', '');
    var metaInfo = create('span', 'image-file-info', '');
    meta.appendChild(metaName);
    meta.appendChild(metaInfo);
    controls.appendChild(meta);

    var field = create('label', 'image-field');
    field.appendChild(create('span', 'image-field-label', '输出形式'));
    var outputType = document.createElement('select');
    outputType.className = 'control';
    [
      ['datauri', 'Data URI'],
      ['css', 'CSS background'],
      ['html', 'HTML <img>'],
      ['raw', '纯 Base64']
    ].forEach(function (entry) {
      var option = document.createElement('option');
      option.value = entry[0];
      option.textContent = entry[1];
      outputType.appendChild(option);
    });
    field.appendChild(outputType);
    controls.appendChild(field);

    var output = document.createElement('textarea');
    output.className = 'image-output';
    output.readOnly = true;
    output.wrap = 'off';
    output.spellcheck = false;
    output.placeholder = '转换结果会出现在这里…';
    output.setAttribute('aria-label', '图片转换结果');
    controls.appendChild(output);

    var outputInfo = create('p', 'image-output-info', '等待选择图片');
    controls.appendChild(outputInfo);

    var actions = create('div', 'image-actions');
    var copyButton = create('button', 'button image-action-primary', '复制结果');
    copyButton.type = 'button';
    copyButton.disabled = true;
    var downloadButton = create('button', 'button', '下载图片');
    downloadButton.type = 'button';
    downloadButton.disabled = true;
    var resetButton = create('button', 'button button-quiet', '换一张');
    resetButton.type = 'button';
    actions.appendChild(copyButton);
    actions.appendChild(downloadButton);
    actions.appendChild(resetButton);
    controls.appendChild(actions);
    controls.appendChild(create('p', 'image-privacy', '文件不会上传，所有转换都在当前页面完成。'));

    workspace.appendChild(controls);
    wrapper.appendChild(drop);
    wrapper.appendChild(workspace);
    dom.customTool.appendChild(wrapper);

    function updateOutput() {
      if (!current) {
        output.value = '';
        outputInfo.textContent = '等待选择图片';
        copyButton.disabled = true;
        downloadButton.disabled = true;
        return;
      }
      var type = outputType.value;
      var text;
      if (type === 'css') {
        text = 'background-image: url("' + current.dataUrl + '");';
      } else if (type === 'html') {
        text = '<img src="' + current.dataUrl + '" alt="' + escapeAttribute(current.name) + '">';
      } else if (type === 'raw') {
        text = current.dataUrl.slice(current.dataUrl.indexOf(',') + 1);
      } else {
        text = current.dataUrl;
      }
      output.value = text;
      outputInfo.textContent = formatNumber(text.length) + ' 字符 · ' + formatNumber(Math.round(text.length / 1024)) + ' KB';
      copyButton.disabled = false;
      downloadButton.disabled = false;
    }

    function readFile(file) {
      if (!file) return;
      var isImage = (file.type && file.type.indexOf('image/') === 0) || /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name || '');
      if (!isImage) {
        showToast('请选择图片文件');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        current = {
          name: file.name || 'image',
          type: file.type || 'image/png',
          size: file.size || 0,
          dataUrl: String(reader.result)
        };
        preview.src = current.dataUrl;
        preview.alt = current.name;
        metaName.textContent = current.name;
        metaInfo.textContent = formatBytes(current.size) + ' · ' + (current.type || 'image');
        drop.hidden = true;
        workspace.hidden = false;
        updateOutput();
      };
      reader.onerror = function () {
        showToast('读取图片失败，请换一个文件试试');
      };
      reader.readAsDataURL(file);
    }

    function resetImage() {
      current = null;
      fileInput.value = '';
      preview.removeAttribute('src');
      metaName.textContent = '';
      metaInfo.textContent = '';
      output.value = '';
      workspace.hidden = true;
      drop.hidden = false;
      copyButton.disabled = true;
      downloadButton.disabled = true;
      outputInfo.textContent = '等待选择图片';
      drop.focus();
    }

    drop.addEventListener('click', function (event) {
      if (event.target !== fileInput) fileInput.click();
    });
    drop.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        fileInput.click();
      }
    });
    drop.addEventListener('dragover', function (event) {
      event.preventDefault();
      drop.classList.add('is-dragover');
    });
    drop.addEventListener('dragleave', function () {
      drop.classList.remove('is-dragover');
    });
    drop.addEventListener('drop', function (event) {
      event.preventDefault();
      drop.classList.remove('is-dragover');
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        readFile(event.dataTransfer.files[0]);
      }
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files.length) readFile(fileInput.files[0]);
    });
    outputType.addEventListener('change', updateOutput);
    copyButton.addEventListener('click', function () {
      copyText(output.value, '图片代码已复制');
    });
    downloadButton.addEventListener('click', function () {
      if (!current) return;
      var link = document.createElement('a');
      link.href = current.dataUrl;
      link.download = current.name || 'image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('已开始下载图片');
    });
    resetButton.addEventListener('click', resetImage);
  }

  function showTool(tool, options) {
    var changed = state.activeToolId !== tool.id;
    var isCustom = Boolean(tool.custom);
    var hideInput = tool.showInput === false;
    state.route = 'tool';
    state.activeToolId = tool.id;
    dom.homeView.hidden = true;
    dom.toolView.hidden = false;
    setDocumentMeta(tool);

    renderSidebar(tool.id);
    renderToolHead(tool);
    renderTips(tool);

    dom.workbench.hidden = isCustom;
    dom.optionsPanel.hidden = isCustom;
    dom.customTool.hidden = !isCustom;
    dom.workbench.classList.toggle('is-single', hideInput);
    dom.inputPane.hidden = hideInput;
    if (dom.transfer) dom.transfer.hidden = hideInput;
    if (dom.swapBtn) dom.swapBtn.hidden = hideInput;
    if (dom.rerollBtn) dom.rerollBtn.hidden = !hideInput || isCustom;

    if (isCustom) {
      renderCustomTool(tool);
    } else {
      dom.customTool.textContent = '';
      renderOptions(tool);
      renderPresets(tool);
      renderInput(tool);
      clearOutput();
      runTransform();
    }

    if ((!options || options.scroll !== false) && changed) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
    if (changed) {
      window.requestAnimationFrame(function () {
        dom.toolTitle.focus({ preventScroll: true });
      });
    }
  }

  function handleRoute(options) {
    var hash = window.location.hash || '';
    var id = hash.replace(/^#\/?/, '').split('?')[0].trim();
    if (!id) {
      showHome(options);
      return;
    }
    var tool = TOOL_MAP[id];
    if (!tool) {
      try {
        window.history.replaceState(null, '', '#/');
      } catch (error) {
        window.location.hash = '#/';
      }
      showHome(options);
      showToast('没有找到这个工具，已回到工具目录');
      return;
    }
    showTool(tool, options);
  }

  /* ------------------------------------------------------------------ */
  /* 操作                                                               */
  /* ------------------------------------------------------------------ */

  function fallbackCopy(text) {
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
    } catch (error) {
      /* 忽略：用户仍可手动选择文本 */
    }
    document.body.removeChild(area);
  }

  function copyText(text, message) {
    if (!text) {
      showToast('没有可复制的内容');
      return;
    }
    var done = function () { showToast(message || '已复制到剪贴板'); };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text);
        done();
      });
    } else {
      fallbackCopy(text);
      done();
    }
  }

  function flashButton(button, label) {
    if (!button) return;
    var original = button.textContent;
    button.textContent = label;
    button.classList.add('is-flashing');
    window.setTimeout(function () {
      button.textContent = original;
      button.classList.remove('is-flashing');
    }, 1400);
  }

  function copyOutput() {
    if (!dom.outputText.value) {
      showToast('还没有可复制的输出');
      return;
    }
    copyText(dom.outputText.value, '输出已复制到剪贴板');
    flashButton(dom.copyBtn, '已复制');
  }

  function timestamp() {
    var now = new Date();
    function pad(value) { return String(value).padStart(2, '0'); }
    return now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '-' + pad(now.getHours()) + pad(now.getMinutes());
  }

  function downloadOutput() {
    var tool = getActiveTool();
    if (!tool || !dom.outputText.value) {
      showToast('还没有可下载的输出');
      return;
    }
    var blob = new Blob([dom.outputText.value], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = tool.id + '-' + timestamp() + '.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast('已开始下载 ' + link.download);
  }

  function swapOutput() {
    var tool = getActiveTool();
    if (!tool || !dom.outputText.value) {
      showToast('还没有可回填的内容');
      return;
    }
    state.inputs[tool.id] = dom.outputText.value;
    dom.inputText.value = dom.outputText.value;
    runTransform();
    showToast('已将输出回填到输入');
  }

  function loadSample() {
    var tool = getActiveTool();
    if (!tool) return;
    state.inputs[tool.id] = tool.sample;
    dom.inputText.value = tool.sample;
    runTransform();
    showToast('已载入示例');
  }

  function clearInput() {
    var tool = getActiveTool();
    if (!tool) return;
    state.inputs[tool.id] = '';
    dom.inputText.value = '';
    runTransform();
    showToast('已清空输入');
  }

  function resetOptions() {
    var tool = getActiveTool();
    if (!tool) return;
    state.optionState[tool.id] = defaultOptions(tool);
    persistOptions();
    renderOptions(tool);
    renderPresets(tool);
    runTransform();
    showToast('已恢复默认选项');
  }

  function applyOptionValue(input) {
    var tool = getActiveTool();
    if (!tool) return;
    var id = input.dataset.option;
    var definition = tool.options.filter(function (option) { return option.id === id; })[0];
    if (!definition) return;
    var raw = definition.type === 'checkbox' ? input.checked : input.value;
    var options = ensureToolOptions(tool);
    options[id] = coerceOption(definition, raw);
    persistOptions();
    updatePresetStates(tool);
    scheduleTransform();
  }

  function applySegment(button) {
    var tool = getActiveTool();
    if (!tool) return;
    var id = button.dataset.option;
    var definition = tool.options.filter(function (option) { return option.id === id; })[0];
    if (!definition) return;
    var options = ensureToolOptions(tool);
    options[id] = coerceOption(definition, button.dataset.value);
    persistOptions();

    var group = button.parentNode;
    Array.prototype.forEach.call(group.querySelectorAll('.segment'), function (item) {
      var active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });

    updatePresetStates(tool);
    scheduleTransform();
  }

  function applyPreset(presetId) {
    var tool = getActiveTool();
    if (!tool || !tool.presets) return;
    var preset = tool.presets.filter(function (item) { return item.id === presetId; })[0];
    if (!preset) return;
    var options = ensureToolOptions(tool);
    Object.keys(preset.options).forEach(function (key) {
      var definition = tool.options.filter(function (option) { return option.id === key; })[0];
      if (definition) options[key] = coerceOption(definition, preset.options[key]);
    });
    persistOptions();
    renderOptions(tool);
    renderPresets(tool);
    runTransform();
    showToast('已应用「' + preset.label + '」预设');
  }

  /* ------------------------------------------------------------------ */
  /* 主题                                                               */
  /* ------------------------------------------------------------------ */

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    writeStorage(STORAGE_THEME, theme);
    var meta = byId('themeColor');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0e1110' : '#f3efe6');
    if (dom.themeToggle) {
      dom.themeToggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
      dom.themeToggle.setAttribute('title', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    }
  }

  function toggleTheme() {
    applyTheme(currentTheme() === 'dark' ? 'light' : 'dark');
  }

  /* ------------------------------------------------------------------ */
  /* 搜索面板                                                           */
  /* ------------------------------------------------------------------ */

  function paletteResults(query) {
    var normalized = query.trim().toLocaleLowerCase();
    return TOOLS.filter(function (tool) {
      if (!normalized) return true;
      var category = getCategory(tool);
      var haystack = [
        tool.name,
        tool.short,
        tool.description,
        tool.keywords.join(' '),
        tool.tags.join(' '),
        category.name
      ].join(' ').toLocaleLowerCase();
      return haystack.indexOf(normalized) !== -1;
    });
  }

  function renderPalette() {
    var results = paletteResults(state.paletteQuery);
    state.paletteItems = results;
    state.paletteIndex = Math.min(state.paletteIndex, Math.max(0, results.length - 1));
    dom.paletteList.textContent = '';

    if (!results.length) {
      var empty = create('div', 'palette-empty');
      empty.appendChild(create('strong', null, '没有找到工具'));
      empty.appendChild(create('span', null, '试试「引号」「JSON」「编码」等关键词。'));
      dom.paletteList.appendChild(empty);
      dom.paletteInput.removeAttribute('aria-activedescendant');
      return;
    }

    results.forEach(function (tool, index) {
      var button = create('button', 'palette-item');
      button.type = 'button';
      button.dataset.tool = tool.id;
      button.id = 'palette-item-' + tool.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', 'false');
      button.appendChild(create('span', 'palette-glyph cat-' + tool.category, tool.glyph));

      var copy = create('span', 'palette-copy');
      copy.appendChild(create('strong', null, tool.name));
      copy.appendChild(create('small', null, tool.short));
      button.appendChild(copy);

      button.appendChild(create('span', 'palette-category', getCategory(tool).name));
      dom.paletteList.appendChild(button);
    });

    updatePaletteActive();
  }

  function updatePaletteActive() {
    var items = dom.paletteList.querySelectorAll('.palette-item');
    Array.prototype.forEach.call(items, function (item, index) {
      var active = index === state.paletteIndex;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-selected', String(active));
    });
    var activeItem = items[state.paletteIndex];
    if (activeItem) {
      dom.paletteInput.setAttribute('aria-activedescendant', activeItem.id);
      if (activeItem.scrollIntoView) activeItem.scrollIntoView({ block: 'nearest' });
    }
  }

  function movePalette(delta) {
    if (!state.paletteItems.length) return;
    state.paletteIndex = (state.paletteIndex + delta + state.paletteItems.length) % state.paletteItems.length;
    updatePaletteActive();
  }

  function setBackgroundInert(inert) {
    [dom.topbar, document.querySelector('main'), document.querySelector('.site-footer')].forEach(function (element) {
      if (!element) return;
      if (inert) element.setAttribute('inert', '');
      else element.removeAttribute('inert');
    });
  }

  function openPalette(prefill) {
    if (state.paletteOpen) {
      if (typeof prefill === 'string') {
        dom.paletteInput.value = prefill;
        state.paletteQuery = prefill;
        state.paletteIndex = 0;
        renderPalette();
      }
      dom.paletteInput.focus();
      return;
    }
    state.lastFocus = document.activeElement;
    state.paletteOpen = true;
    state.paletteQuery = typeof prefill === 'string' ? prefill : '';
    state.paletteIndex = 0;
    dom.paletteInput.value = state.paletteQuery;
    dom.palette.hidden = false;
    dom.searchTrigger.setAttribute('aria-expanded', 'true');
    dom.paletteInput.setAttribute('aria-expanded', 'true');
    document.documentElement.classList.add('palette-open');
    setBackgroundInert(true);
    renderPalette();
    window.requestAnimationFrame(function () {
      dom.palette.classList.add('is-open');
      dom.paletteInput.focus();
      dom.paletteInput.select();
    });
  }

  function closePalette() {
    if (!state.paletteOpen) return;
    state.paletteOpen = false;
    dom.palette.classList.remove('is-open');
    dom.palette.hidden = true;
    dom.searchTrigger.setAttribute('aria-expanded', 'false');
    dom.paletteInput.setAttribute('aria-expanded', 'false');
    document.documentElement.classList.remove('palette-open');
    setBackgroundInert(false);
    var previous = state.lastFocus;
    state.lastFocus = null;
    if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
      previous.focus();
    }
  }

  function activatePalette() {
    var tool = state.paletteItems[state.paletteIndex];
    if (!tool) return;
    closePalette();
    if (state.activeToolId === tool.id) {
      dom.paletteInput.blur();
      return;
    }
    window.location.hash = '#/' + tool.id;
  }

  /* ------------------------------------------------------------------ */
  /* 提示                                                               */
  /* ------------------------------------------------------------------ */

  function showToast(message) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.add('is-visible');
    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () {
      dom.toast.classList.remove('is-visible');
      state.toastTimer = null;
    }, 2400);
  }

  /* ------------------------------------------------------------------ */
  /* 事件绑定                                                           */
  /* ------------------------------------------------------------------ */

  function bindEvents() {
    dom.themeToggle.addEventListener('click', toggleTheme);
    dom.searchTrigger.addEventListener('click', function () { openPalette(); });

    dom.homeSearch.addEventListener('input', function () {
      state.homeQuery = dom.homeSearch.value.trim();
      renderCatalog();
    });
    dom.homeSearch.addEventListener('search', function () {
      state.homeQuery = dom.homeSearch.value.trim();
      renderCatalog();
    });

    dom.categoryChips.addEventListener('click', function (event) {
      var chip = event.target.closest('.category-chip');
      if (!chip) return;
      setActiveCategory(chip.dataset.category);
      renderCatalog();
    });

    dom.resetFilters.addEventListener('click', function () {
      state.homeQuery = '';
      state.homeCategory = 'all';
      dom.homeSearch.value = '';
      renderCategoryChips();
      renderCatalog();
      dom.homeSearch.focus();
    });

    dom.inputText.addEventListener('input', function () {
      var tool = getActiveTool();
      if (!tool) return;
      state.inputs[tool.id] = dom.inputText.value;
      dom.inputStats.textContent = statsLabel(dom.inputText.value, '等待输入');
      scheduleTransform();
    });

    dom.optionsGrid.addEventListener('input', function (event) {
      var target = event.target;
      if (!target.dataset || !target.dataset.option) return;
      var tool = getActiveTool();
      if (!tool) return;
      var definition = tool.options.filter(function (option) { return option.id === target.dataset.option; })[0];
      if (!definition || (definition.type !== 'text' && definition.type !== 'number')) return;
      applyOptionValue(target);
    });

    dom.optionsGrid.addEventListener('change', function (event) {
      var target = event.target;
      if (!target.dataset || !target.dataset.option) return;
      var tool = getActiveTool();
      if (!tool) return;
      var definition = tool.options.filter(function (option) { return option.id === target.dataset.option; })[0];
      if (!definition || (definition.type !== 'checkbox' && definition.type !== 'select')) return;
      applyOptionValue(target);
    });

    dom.optionsGrid.addEventListener('click', function (event) {
      var segment = event.target.closest('.segment');
      if (segment) {
        applySegment(segment);
      }
    });

    dom.presetBar.addEventListener('click', function (event) {
      var button = event.target.closest('.preset-chip');
      if (!button) return;
      applyPreset(button.dataset.preset);
    });

    dom.resetOptions.addEventListener('click', resetOptions);

    document.addEventListener('click', function (event) {
      var action = event.target.closest('[data-action]');
      if (!action) return;
      switch (action.dataset.action) {
        case 'sample': loadSample(); break;
        case 'clear-input': clearInput(); break;
        case 'copy': copyOutput(); break;
        case 'download': downloadOutput(); break;
        case 'swap': swapOutput(); break;
        case 'reroll': runTransform(); showToast('已重新生成'); break;
        case 'copy-link': copyText(window.location.href, '工具链接已复制'); break;
        default: break;
      }
    });

    dom.paletteInput.addEventListener('input', function () {
      state.paletteQuery = dom.paletteInput.value;
      state.paletteIndex = 0;
      renderPalette();
    });

    dom.paletteInput.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        movePalette(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        movePalette(-1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        activatePalette();
      }
    });

    dom.paletteList.addEventListener('click', function (event) {
      var item = event.target.closest('.palette-item');
      if (!item) return;
      var tool = TOOL_MAP[item.dataset.tool];
      if (!tool) return;
      closePalette();
      window.location.hash = '#/' + tool.id;
    });

    dom.paletteList.addEventListener('pointerover', function (event) {
      var item = event.target.closest('.palette-item');
      if (!item || !dom.paletteList.contains(item)) return;
      var items = Array.prototype.slice.call(dom.paletteList.querySelectorAll('.palette-item'));
      var index = items.indexOf(item);
      if (index !== -1 && index !== state.paletteIndex) {
        state.paletteIndex = index;
        updatePaletteActive();
      }
    });

    dom.paletteClose.addEventListener('click', closePalette);
    dom.palette.addEventListener('click', function (event) {
      if (event.target.closest('[data-palette-close]')) closePalette();
    });

    document.addEventListener('keydown', function (event) {
      var modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLocaleLowerCase() === 'k') {
        event.preventDefault();
        if (state.paletteOpen) closePalette();
        else openPalette();
        return;
      }

      if (event.key === 'Escape') {
        if (state.paletteOpen) {
          event.preventDefault();
          closePalette();
          return;
        }
        if (state.route === 'home' && document.activeElement === dom.homeSearch && dom.homeSearch.value) {
          event.preventDefault();
          dom.homeSearch.value = '';
          state.homeQuery = '';
          renderCatalog();
          return;
        }
      }

      if (event.key === '/' && !state.paletteOpen && !isTypingTarget(event.target)) {
        event.preventDefault();
        if (state.route === 'home') {
          dom.homeSearch.focus();
          dom.homeSearch.select();
        } else {
          openPalette();
        }
        return;
      }

      if (modifier && event.key === 'Enter' && state.route === 'tool' && !state.paletteOpen) {
        event.preventDefault();
        copyOutput();
        return;
      }

      if (event.key === 'Tab' && state.paletteOpen) {
        var focusable = [dom.paletteInput, dom.paletteClose];
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    });

    window.addEventListener('hashchange', function () { handleRoute(); });

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) updateThemeMeta();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 初始化                                                             */
  /* ------------------------------------------------------------------ */

  function updateThemeMeta() {
    var meta = byId('themeColor');
    if (meta) meta.setAttribute('content', currentTheme() === 'dark' ? '#0e1110' : '#f3efe6');
    if (dom.themeToggle) {
      dom.themeToggle.setAttribute('aria-label', currentTheme() === 'dark' ? '切换到浅色模式' : '切换到深色模式');
      dom.themeToggle.setAttribute('title', currentTheme() === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    }
  }

  function setShortcutLabels() {
    var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || '') || /Mac OS X/.test(navigator.userAgent || '');
    Array.prototype.forEach.call(document.querySelectorAll('[data-shortcut-mod]'), function (element) {
      element.textContent = isMac ? '\u2318' : 'Ctrl';
    });
  }

  function cacheDom() {
    dom.topbar = byId('topbar');
    dom.homeView = byId('homeView');
    dom.toolView = byId('toolView');
    dom.themeToggle = byId('themeToggle');
    dom.searchTrigger = byId('searchTrigger');
    dom.homeSearch = byId('homeSearch');
    dom.categoryChips = byId('categoryChips');
    dom.toolGrid = byId('toolGrid');
    dom.emptyState = byId('emptyState');
    dom.resetFilters = byId('resetFilters');
    dom.sidebarNav = byId('sidebarNav');
    dom.crumbCategory = byId('crumbCategory');
    dom.crumbTool = byId('crumbTool');
    dom.toolGlyph = byId('toolGlyph');
    dom.toolTitle = byId('toolTitle');
    dom.toolDesc = byId('toolDesc');
    dom.toolTags = byId('toolTags');
    dom.workbench = byId('workbench');
    dom.customTool = byId('customTool');
    dom.optionsPanel = byId('optionsPanel');
    dom.transfer = document.querySelector('.transfer');
    dom.inputText = byId('inputText');
    dom.inputStats = byId('inputStats');
    dom.outputText = byId('outputText');
    dom.outputStats = byId('outputStats');
    dom.outputDetail = byId('outputDetail');
    dom.outputError = byId('outputError');
    dom.inputPane = byId('inputPane');
    dom.outputPane = byId('outputPane');
    dom.copyBtn = byId('copyBtn');
    dom.downloadBtn = byId('downloadBtn');
    dom.swapBtn = byId('swapBtn');
    dom.rerollBtn = byId('rerollBtn');
    dom.optionsGrid = byId('optionsGrid');
    dom.presetBar = byId('presetBar');
    dom.resetOptions = byId('resetOptions');
    dom.tipsList = byId('tipsList');
    dom.palette = byId('palette');
    dom.paletteInput = byId('paletteInput');
    dom.paletteList = byId('paletteList');
    dom.paletteClose = byId('paletteClose');
    dom.toast = byId('toast');
  }

  function init() {
    cacheDom();
    setShortcutLabels();
    updateThemeMeta();
    byId('toolCount').textContent = String(TOOLS.length);
    renderCategoryChips();
    renderCatalog();
    bindEvents();
    handleRoute({ scroll: false });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
