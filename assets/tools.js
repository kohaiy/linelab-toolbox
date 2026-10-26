/*
 * 行间 LineLab — 工具内核
 * 纯函数、无依赖，浏览器与 Node 测试共用。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LINELAB = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* 基础工具函数                                                        */
  /* ------------------------------------------------------------------ */

  var CATEGORIES = [
    { id: 'text', name: '文本处理', en: 'TEXT PROCESSING' },
    { id: 'data', name: '数据格式', en: 'DATA FORMATS' },
    { id: 'dev', name: '开发工具', en: 'DEVELOPER TOOLS' },
    { id: 'generate', name: '生成器', en: 'GENERATORS' },
    { id: 'image', name: '图片工具', en: 'IMAGE TOOLS' }
  ];

  var CASE_LABELS = {
    camel: 'camelCase',
    pascal: 'PascalCase',
    snake: 'snake_case',
    kebab: 'kebab-case',
    constant: 'CONSTANT_CASE',
    dot: 'dot.case',
    title: 'Title Case',
    lower: '全小写',
    upper: '全大写'
  };

  var HTML_ENTITIES = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: '\u00a0',
    copy: '\u00a9',
    reg: '\u00ae',
    trade: '\u2122',
    hellip: '\u2026',
    mdash: '\u2014',
    ndash: '\u2013',
    laquo: '\u00ab',
    raquo: '\u00bb',
    times: '\u00d7',
    divide: '\u00f7',
    middot: '\u00b7',
    bull: '\u2022',
    deg: '\u00b0',
    plusmn: '\u00b1',
    frac12: '\u00bd',
    eacute: '\u00e9'
  };

  function splitLines(text) {
    return String(text).replace(/\r\n?/g, '\n').split('\n');
  }

  function fmt(n) {
    return new Intl.NumberFormat('zh-CN').format(n);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function stripBom(value) {
    return String(value).replace(/^\uFEFF/, '');
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  function describeError(err) {
    return err && err.message ? err.message : String(err);
  }

  function decodeEscapes(value) {
    return String(value).replace(
      /\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[nrtbfv0\\'"`])/g,
      function (match, code) {
        if (code.charAt(0) === 'u') {
          var hex = code.charAt(1) === '{' ? code.slice(2, -1) : code.slice(1);
          var point = parseInt(hex, 16);
          if (!isFinite(point) || point < 0 || point > 0x10ffff) return match;
          return String.fromCodePoint(point);
        }
        if (code.charAt(0) === 'x') {
          return String.fromCharCode(parseInt(code.slice(1), 16));
        }
        switch (code) {
          case 'n': return '\n';
          case 'r': return '\r';
          case 't': return '\t';
          case 'b': return '\b';
          case 'f': return '\f';
          case 'v': return '\v';
          case '0': return '\0';
          case '\\': return '\\';
          case "'": return "'";
          case '"': return '"';
          case '`': return '`';
          default: return match;
        }
      }
    );
  }

  /* ------------------------------------------------------------------ */
  /* 列表 / 引号                                                         */
  /* ------------------------------------------------------------------ */

  function buildQuotedList(input, options) {
    var lines = splitLines(input);
    if (options.trim) lines = lines.map(function (line) { return line.trim(); });
    if (options.skipEmpty) lines = lines.filter(function (line) { return line !== ''; });

    if (options.dedupe) {
      var seen = new Set();
      lines = lines.filter(function (line) {
        if (seen.has(line)) return false;
        seen.add(line);
        return true;
      });
    }

    var quote = options.customQuote ? String(options.customQuote) : String(options.quote || "'");
    if (!quote) quote = "'";

    var items = lines.map(function (line) {
      var value = line;
      if (options.escape === 'sql') {
        value = value.split(quote).join(quote + quote);
      } else if (options.escape === 'backslash') {
        value = value.replace(/\\/g, '\\\\');
        value = value.split(quote).join('\\' + quote);
      }
      return quote + value + quote + (options.comma ? ',' : '');
    });

    if (!items.length) {
      return { text: '', detail: '0 项' };
    }

    var output = [];
    if (options.prefix) output.push(String(options.prefix));
    output = output.concat(items);
    if (options.suffix) output.push(String(options.suffix));

    return {
      text: output.length ? output.join('\n') : '',
      detail: items.length + ' 项' + (options.comma ? ' · 行尾逗号' : ' · 无逗号')
    };
  }

  function splitCommaLine(line) {
    var result = [];
    var buffer = '';
    var quote = null;
    var escaped = false;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line.charAt(i);
      if (escaped) {
        buffer += ch;
        escaped = false;
        continue;
      }
      if (quote && ch === '\\') {
        buffer += ch;
        escaped = true;
        continue;
      }
      if (quote) {
        buffer += ch;
        if (ch === quote) {
          if (line.charAt(i + 1) === quote) {
            buffer += line.charAt(i + 1);
            i += 1;
          } else {
            quote = null;
          }
        }
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        quote = ch;
        buffer += ch;
      } else if (ch === ',') {
        result.push(buffer);
        buffer = '';
      } else {
        buffer += ch;
      }
    }
    // 行尾逗号会产生一个空 buffer，不应被当作一个空项。
    if (buffer !== '') result.push(buffer);
    return result;
  }

  function cleanListItem(raw, options) {
    var value = options.trim ? raw.trim() : raw;
    value = value.replace(/^[,;]\s*/, '').replace(/[,;]\s*$/, '');
    if (options.trim) value = value.trim();

    var quoteMatch = /^(['"`])([\s\S]*)\1$/.exec(value);
    if (quoteMatch) {
      value = quoteMatch[2];
      if (options.unescape && (quoteMatch[1] === "'" || quoteMatch[1] === '"')) {
        var doubled = quoteMatch[1] + quoteMatch[1];
        value = value.split(doubled).join(quoteMatch[1]);
      }
    }

    if (options.unescape) value = decodeEscapes(value);
    return value;
  }

  function restoreList(input, options) {
    var text = String(input);
    if (!text.trim()) return { text: '', detail: '等待输入' };

    var items = null;
    var fromJson = false;
    var trimmed = text.trim();

    if (trimmed.charAt(0) === '[' && trimmed.charAt(trimmed.length - 1) === ']') {
      try {
        var parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          fromJson = true;
          items = parsed.map(function (item) {
            if (item === null || item === undefined) return '';
            if (typeof item === 'string') return item;
            if (typeof item === 'number' || typeof item === 'boolean') return String(item);
            return JSON.stringify(item);
          });
        }
      } catch (err) {
        items = null;
      }
    }

    if (items === null) {
      text = text.trim();
      text = text.replace(/^\s*IN\s*\(\s*/i, '');
      text = text.replace(/^\s*[\[(]\s*/, '');
      text = text.replace(/\s*[\])]\s*;?\s*$/, '');
      var chunks = splitLines(text);
      if (options.splitCommas) {
        chunks = chunks.reduce(function (all, line) {
          return all.concat(splitCommaLine(line));
        }, []);
      }
      items = chunks.map(function (chunk) { return cleanListItem(chunk, options); });
    } else if (options.trim) {
      items = items.map(function (item) { return item.trim(); });
    }

    if (options.skipEmpty) {
      items = items.filter(function (item) { return item.trim() !== ''; });
    }

    if (options.dedupe) {
      var seen = new Set();
      items = items.filter(function (item) {
        if (seen.has(item)) return false;
        seen.add(item);
        return true;
      });
    }

    return {
      text: items.join('\n'),
      detail: items.length + ' 项' + (fromJson ? ' · 来自 JSON 数组' : '')
    };
  }

  function addLinePrefixes(input, options) {
    var lines = splitLines(input);
    if (options.trim) lines = lines.map(function (line) { return line.trim(); });
    if (options.skipEmpty) lines = lines.filter(function (line) { return line !== ''; });

    var start = Number(options.start);
    if (!isFinite(start)) start = 1;
    var separator = String(options.separator == null ? '. ' : options.separator);

    var output = lines.map(function (line, index) {
      var numbered = options.numberLines ? String(start + index) + separator : '';
      return String(options.prefix || '') + numbered + line + String(options.suffix || '');
    });

    return {
      text: output.join('\n'),
      detail: output.length + ' 行' + (options.numberLines ? ' · 已编号' : '')
    };
  }

  /* ------------------------------------------------------------------ */
  /* 文本整理                                                            */
  /* ------------------------------------------------------------------ */

  function dedupeAndSort(input, options) {
    var lines = splitLines(input);
    if (options.trim) lines = lines.map(function (line) { return line.trim(); });
    if (options.skipEmpty) lines = lines.filter(function (line) { return line !== ''; });

    var before = lines.length;
    var collator = new Intl.Collator('zh-Hans-CN', {
      numeric: true,
      sensitivity: options.ignoreCase ? 'base' : 'variant'
    });

    if (options.dedupe) {
      var seen = new Set();
      lines = lines.filter(function (line) {
        var key = options.ignoreCase ? line.toLocaleLowerCase() : line;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    if (options.sort === 'asc') {
      lines.sort(function (a, b) { return collator.compare(a, b); });
    } else if (options.sort === 'desc') {
      lines.sort(function (a, b) { return collator.compare(b, a); });
    } else if (options.sort === 'length-asc') {
      lines.sort(function (a, b) { return a.length - b.length || collator.compare(a, b); });
    } else if (options.sort === 'length-desc') {
      lines.sort(function (a, b) { return b.length - a.length || collator.compare(a, b); });
    }

    return {
      text: lines.join('\n'),
      detail: before + ' 行 → ' + lines.length + ' 行' + (before !== lines.length ? ' · 移除 ' + (before - lines.length) : '')
    };
  }

  function cleanWhitespace(input, options) {
    var lines = splitLines(input);
    var tabWidth = Math.max(1, Math.min(16, Number(options.tabWidth) || 4));

    if (options.tabsToSpaces) {
      lines = lines.map(function (line) {
        return line.replace(/\t/g, new Array(tabWidth + 1).join(' '));
      });
    }
    if (options.collapseSpaces) {
      lines = lines.map(function (line) { return line.replace(/[ \t]+/g, ' '); });
    }
    if (options.trim) {
      lines = lines.map(function (line) { return line.trim(); });
    }
    if (options.removeBlank) {
      lines = lines.filter(function (line) { return line !== ''; });
    }

    return {
      text: lines.join('\n'),
      detail: lines.length + ' 行 · 已清理'
    };
  }

  function findAndReplace(input, options) {
    var needle = String(options.find == null ? '' : options.find);
    var replacement = String(options.replace == null ? '' : options.replace);
    if (needle === '') {
      return { text: input, detail: '请填写查找内容' };
    }

    var source = options.regex ? needle : escapeRegExp(needle);
    if (options.wholeWord) {
      source = '(?<![\\p{L}\\p{N}_])(?:' + source + ')(?![\\p{L}\\p{N}_])';
    }

    var flags = 'g';
    if (!options.caseSensitive) flags += 'i';
    if (options.multiline) flags += 'm';
    if (options.dotAll) flags += 's';
    if (options.regex || options.wholeWord) flags += 'u';

    var regex;
    try {
      regex = new RegExp(source, flags);
    } catch (err) {
      throw new Error('正则表达式无效：' + describeError(err));
    }

    var count = 0;
    var text;
    try {
      var matches = input.match(regex);
      count = matches ? matches.length : 0;
      text = options.regex
        ? input.replace(regex, replacement)
        : input.replace(regex, function () { return replacement; });
    } catch (err) {
      throw new Error('替换失败：' + describeError(err));
    }

    return {
      text: text,
      detail: '替换 ' + count + ' 处' + (options.regex ? ' · 正则模式' : '')
    };
  }

  function splitWords(value) {
    return String(value)
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function capitalize(value) {
    if (!value) return '';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function convertCaseLine(line, style) {
    if (style === 'lower') return line.toLocaleLowerCase();
    if (style === 'upper') return line.toLocaleUpperCase();
    var words = splitWords(line);
    if (!words.length) return '';

    var lower = words.map(function (word) { return word.toLocaleLowerCase(); });
    switch (style) {
      case 'camel':
        return lower[0] + lower.slice(1).map(capitalize).join('');
      case 'pascal':
        return lower.map(capitalize).join('');
      case 'snake':
        return lower.join('_');
      case 'kebab':
        return lower.join('-');
      case 'constant':
        return lower.join('_').toLocaleUpperCase();
      case 'dot':
        return lower.join('.');
      case 'title':
        return lower.map(capitalize).join(' ');
      default:
        return line;
    }
  }

  function convertCase(input, options) {
    var style = CASE_LABELS[options.style] ? options.style : 'camel';
    var lines = splitLines(input).map(function (line) {
      return line === '' ? '' : convertCaseLine(line, style);
    });
    return {
      text: lines.join('\n'),
      detail: lines.length + ' 行 · ' + CASE_LABELS[style]
    };
  }

  /* ------------------------------------------------------------------ */
  /* JSON / CSV                                                          */
  /* ------------------------------------------------------------------ */

  function describeJsonError(err, input) {
    var raw = describeError(err);
    var position = typeof err.jsonPosition === 'number' ? err.jsonPosition : null;
    var positionMatch = /position\s+(\d+)/i.exec(raw);
    var lineMatch = /line\s+(\d+)\s+column\s+(\d+)/i.exec(raw);
    if (position === null && positionMatch) position = Number(positionMatch[1]);
    var line = lineMatch ? Number(lineMatch[1]) : null;
    var column = lineMatch ? Number(lineMatch[2]) : null;

    if (line === null && position !== null) {
      var before = String(input).slice(0, position);
      line = splitLines(before).length;
      column = position - before.lastIndexOf('\n');
    }

    var snippet = '';
    if (position !== null) {
      var start = Math.max(0, position - 35);
      var end = Math.min(String(input).length, position + 35);
      snippet = String(input).slice(start, end).replace(/\n/g, '\u21b5');
      if (start > 0) snippet = '\u2026' + snippet;
      if (end < String(input).length) snippet += '\u2026';
    }

    var clean = raw
      .replace(/^JSON\.parse:\s*/i, '')
      .replace(/\s+in JSON at position \d+.*$/i, '')
      .replace(/\s*\(line \d+ column \d+\)\s*$/i, '')
      .trim();

    var result = 'JSON 解析失败';
    if (line !== null && column !== null) {
      result += '（第 ' + line + ' 行，第 ' + column + ' 列）';
    }
    if (clean) result += '\n' + clean;
    if (snippet) result += '\n\n' + snippet;
    return result;
  }

  /*
   * 原生 JSON.parse 的部分错误信息不包含位置。这里用一个轻量扫描器
   * 在解析失败时重新定位，给用户行号、列号和附近的字符片段。
   */
  function parseJsonDetailed(input) {
    var source = String(input);
    var index = 0;
    var length = source.length;

    function fail(message, position) {
      var error = new Error(message);
      error.jsonPosition = Math.max(0, Math.min(position == null ? index : position, length));
      throw error;
    }

    function skipWhitespace() {
      while (index < length) {
        var ch = source.charAt(index);
        if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') index += 1;
        else break;
      }
    }

    function parseString() {
      var start = index;
      index += 1;
      while (index < length) {
        var ch = source.charAt(index);
        if (ch === '"') {
          index += 1;
          return JSON.parse(source.slice(start, index));
        }
        if (ch === '\\') {
          index += 1;
          if (index >= length) fail('字符串中的转义序列不完整', index);
          var escape = source.charAt(index);
          if ('"\\/bfnrt'.indexOf(escape) !== -1) {
            index += 1;
            continue;
          }
          if (escape === 'u') {
            var hex = source.slice(index + 1, index + 5);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
              fail('\\u 转义需要 4 位十六进制数字', index + 1);
            }
            index += 5;
            continue;
          }
          fail("无效的转义字符 '\\" + escape + "'", index);
        }
        if (source.charCodeAt(index) < 0x20) {
          fail('字符串中不能包含未转义的控制字符', index);
        }
        index += 1;
      }
      fail('字符串缺少结束引号', index);
    }

    function parseNumber() {
      var match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(source.slice(index));
      if (!match) fail('无效的数字', index);
      var raw = match[0];
      index += raw.length;
      return JSON.parse(raw);
    }

    function parseLiteral(word, value) {
      if (source.slice(index, index + word.length) !== word) {
        fail('无效的字面量，应为 ' + word, index);
      }
      index += word.length;
      return value;
    }

    function parseArray() {
      index += 1;
      skipWhitespace();
      var result = [];
      if (source.charAt(index) === ']') {
        index += 1;
        return result;
      }
      while (true) {
        result.push(parseValue());
        skipWhitespace();
        var ch = source.charAt(index);
        if (ch === ']') {
          index += 1;
          return result;
        }
        if (ch !== ',') fail("数组元素之间需要 ','", index);
        index += 1;
        skipWhitespace();
        if (source.charAt(index) === ']') fail('数组末尾不能有多余的逗号', index);
      }
    }

    function parseObject() {
      index += 1;
      skipWhitespace();
      var result = {};
      if (source.charAt(index) === '}') {
        index += 1;
        return result;
      }
      while (true) {
        skipWhitespace();
        if (source.charAt(index) !== '"') fail('对象的键名必须是双引号字符串', index);
        var key = parseString();
        skipWhitespace();
        if (source.charAt(index) !== ':') fail("键名后需要 ':'", index);
        index += 1;
        result[key] = parseValue();
        skipWhitespace();
        var ch = source.charAt(index);
        if (ch === '}') {
          index += 1;
          return result;
        }
        if (ch !== ',') fail("对象属性之间需要 ','", index);
        index += 1;
        skipWhitespace();
        if (source.charAt(index) === '}') fail('对象末尾不能有多余的逗号', index);
      }
    }

    function parseValue() {
      skipWhitespace();
      if (index >= length) fail('期待一个值，但输入已结束', index);
      var ch = source.charAt(index);
      if (ch === '{') return parseObject();
      if (ch === '[') return parseArray();
      if (ch === '"') return parseString();
      if (ch === 't') return parseLiteral('true', true);
      if (ch === 'f') return parseLiteral('false', false);
      if (ch === 'n') return parseLiteral('null', null);
      if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber();
      fail("意外的字符 '" + ch + "'", index);
    }

    var value = parseValue();
    skipWhitespace();
    if (index < length) {
      fail("JSON 末尾存在多余内容 '" + source.slice(index, index + 20) + "'", index);
    }
    return value;
  }

  function parseJson(input) {
    var source = stripBom(String(input));
    try {
      return JSON.parse(source);
    } catch (nativeError) {
      try {
        parseJsonDetailed(source);
      } catch (detailedError) {
        throw new Error(describeJsonError(detailedError, source));
      }
      throw new Error(describeJsonError(nativeError, source));
    }
  }

  function sortJsonKeys(value) {
    if (Array.isArray(value)) return value.map(sortJsonKeys);
    if (isPlainObject(value)) {
      var output = {};
      Object.keys(value).sort(function (a, b) {
        return a.localeCompare(b, 'zh-Hans-CN');
      }).forEach(function (key) {
        output[key] = sortJsonKeys(value[key]);
      });
      return output;
    }
    return value;
  }

  function analyzeJson(value) {
    var info = { objects: 0, arrays: 0, depth: 0 };
    function walk(node, depth) {
      if (depth > info.depth) info.depth = depth;
      if (Array.isArray(node)) {
        info.arrays += 1;
        node.forEach(function (child) { walk(child, depth + 1); });
      } else if (isPlainObject(node)) {
        info.objects += 1;
        Object.keys(node).forEach(function (key) { walk(node[key], depth + 1); });
      }
    }
    walk(value, 0);
    return info;
  }

  function formatJson(input, options) {
    if (!String(input).trim()) return { text: '', detail: '等待输入' };
    var parsed = parseJson(input);
    if (options.sortKeys) parsed = sortJsonKeys(parsed);

    var indent = options.indent === 'tab' ? '\t' : Number(options.indent) || 2;
    var text = options.mode === 'minify'
      ? JSON.stringify(parsed)
      : JSON.stringify(parsed, null, indent);
    var info = analyzeJson(parsed);

    return {
      text: text,
      detail: (options.mode === 'minify' ? '已压缩' : '已格式化') +
        ' · 对象 ' + info.objects + ' · 数组 ' + info.arrays + ' · 深度 ' + info.depth
    };
  }

  function countDelimiterOutsideQuotes(line, delimiter) {
    var count = 0;
    var inQuotes = false;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line.charAt(i);
      if (ch === '"') {
        if (inQuotes && line.charAt(i + 1) === '"') {
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && ch === delimiter) {
        count += 1;
      }
    }
    return count;
  }

  function detectDelimiter(input) {
    var candidates = [',', '\t', ';', '|'];
    var lines = splitLines(stripBom(input)).filter(function (line) {
      return line.trim() !== '';
    }).slice(0, 12);
    if (!lines.length) return ',';

    var best = ',';
    var bestScore = -Infinity;
    candidates.forEach(function (delimiter) {
      var counts = lines.map(function (line) {
        return countDelimiterOutsideQuotes(line, delimiter);
      });
      var positive = counts.filter(function (n) { return n > 0; });
      if (!positive.length) return;
      var equal = counts.every(function (n) { return n === counts[0]; });
      var score = (equal ? 1000 : 0) + Math.min.apply(null, positive) * 20 + positive.length;
      if (score > bestScore) {
        bestScore = score;
        best = delimiter;
      }
    });
    return best;
  }

  function parseCsvRows(input, delimiter) {
    var source = stripBom(String(input));
    if (!source) return [];

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var line = 1;
    var i = 0;

    while (i < source.length) {
      var ch = source.charAt(i);
      if (inQuotes) {
        if (ch === '"') {
          if (source.charAt(i + 1) === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i += 1;
          continue;
        }
        if (ch === '\r') {
          if (source.charAt(i + 1) === '\n') {
            field += '\n';
            i += 2;
            line += 1;
            continue;
          }
          field += '\n';
          i += 1;
          line += 1;
          continue;
        }
        if (ch === '\n') {
          field += '\n';
          i += 1;
          line += 1;
          continue;
        }
        field += ch;
        i += 1;
        continue;
      }

      if (ch === '"') {
        if (field === '') {
          inQuotes = true;
        } else {
          field += '"';
        }
        i += 1;
        continue;
      }
      if (ch === delimiter) {
        row.push(field);
        field = '';
        i += 1;
        continue;
      }
      if (ch === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i += 1;
        line += 1;
        continue;
      }
      if (ch === '\r') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
        i += 1;
        if (source.charAt(i) === '\n') i += 1;
        line += 1;
        continue;
      }
      field += ch;
      i += 1;
    }

    if (inQuotes) {
      throw new Error('CSV 解析失败：第 ' + line + ' 行存在未闭合的引号');
    }
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function delimiterValue(value) {
    if (value === 'tab') return '\t';
    return String(value || ',');
  }

  function delimiterLabel(value) {
    var map = { ',': '逗号', '\t': 'Tab', ';': '分号', '|': '竖线' };
    return map[value] || value;
  }

  function makeUniqueHeaders(values) {
    var used = new Set();
    return values.map(function (value, index) {
      var base = String(value == null ? '' : value).trim() || 'column_' + (index + 1);
      var candidate = base;
      var suffix = 1;
      while (used.has(candidate)) {
        suffix += 1;
        candidate = base + '_' + suffix;
      }
      used.add(candidate);
      return candidate;
    });
  }

  function inferCell(value) {
    if (typeof value !== 'string') return value;
    var text = value.trim();
    if (text === '') return '';
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text)) {
      var number = Number(text);
      if (isFinite(number)) return number;
    }
    if (/^(?:true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^null$/i.test(text)) return null;
    return value;
  }

  function csvToJson(input, options) {
    if (!String(input).trim()) return { text: '', detail: '等待输入' };

    var delimiter = options.delimiter === 'auto'
      ? detectDelimiter(input)
      : delimiterValue(options.delimiter);

    var rows = parseCsvRows(input, delimiter).filter(function (row) {
      return !(row.length === 1 && row[0].trim() === '');
    });
    if (!rows.length) return { text: '', detail: '没有可转换的数据行' };

    var columnCount = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    var data;
    var jsonIndent = options.indent === 'tab' ? '\t' : Number(options.indent) || 2;

    if (options.hasHeader) {
      var headers = makeUniqueHeaders(rows[0]);
      data = rows.slice(1).map(function (row) {
        var record = {};
        headers.forEach(function (header, index) {
          var value = row[index] == null ? '' : row[index];
          record[header] = options.inferTypes ? inferCell(value) : value;
        });
        return record;
      });
    } else {
      data = rows.map(function (row) {
        var values = [];
        for (var i = 0; i < columnCount; i += 1) {
          var value = row[i] == null ? '' : row[i];
          values.push(options.inferTypes ? inferCell(value) : value);
        }
        return values;
      });
    }

    return {
      text: JSON.stringify(data, null, jsonIndent),
      detail: rows.length + ' 行 × ' + columnCount + ' 列 · ' + delimiterLabel(delimiter) + (options.hasHeader ? ' · 首行为表头' : ' · 无表头')
    };
  }

  function csvEscape(value, delimiter) {
    var text = value === null || value === undefined ? '' : String(value);
    if (
      text.indexOf('"') !== -1 ||
      text.indexOf(delimiter) !== -1 ||
      /[\r\n]/.test(text) ||
      /^\s|\s$/.test(text)
    ) {
      return '"' + text.split('"').join('""') + '"';
    }
    return text;
  }

  function cellToString(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  function flattenObject(object, prefix, output) {
    var result = output || {};
    var head = prefix || '';
    Object.keys(object).forEach(function (key) {
      var value = object[key];
      var path = head ? head + '.' + key : key;
      if (isPlainObject(value)) {
        flattenObject(value, path, result);
      } else {
        result[path] = value;
      }
    });
    return result;
  }

  function jsonToCsv(input, options) {
    if (!String(input).trim()) return { text: '', detail: '等待输入' };
    var data = parseJson(input);
    if (!Array.isArray(data)) {
      throw new Error('请输入 JSON 数组，例如 [{"name":"Ada"}]');
    }
    if (!data.length) return { text: '', detail: 'JSON 数组为空' };

    var delimiter = delimiterValue(options.delimiter);
    var rows = [];
    var headers = null;
    var allObjects = data.every(isPlainObject);
    var allArrays = data.every(Array.isArray);

    if (allObjects) {
      var normalized = data.map(function (item) {
        return options.flatten ? flattenObject(item) : item;
      });
      var keys = [];
      var seen = new Set();
      normalized.forEach(function (item) {
        Object.keys(item).forEach(function (key) {
          if (!seen.has(key)) {
            seen.add(key);
            keys.push(key);
          }
        });
      });
      headers = keys;
      rows = normalized.map(function (item) {
        return keys.map(function (key) { return cellToString(item[key]); });
      });
      if (options.includeHeader) rows.unshift(keys);
    } else if (allArrays) {
      var columnCount = Math.max.apply(null, data.map(function (row) { return row.length; }));
      rows = data.map(function (row) {
        var values = [];
        for (var i = 0; i < columnCount; i += 1) {
          values.push(cellToString(row[i]));
        }
        return values;
      });
    } else if (data.every(function (item) { return item === null || typeof item !== 'object'; })) {
      headers = ['value'];
      rows = data.map(function (item) { return [cellToString(item)]; });
      if (options.includeHeader) rows.unshift(headers);
    } else {
      throw new Error('JSON 数组的元素需要全部是对象、数组或基础值');
    }

    var text = rows.map(function (row) {
      return row.map(function (value) { return csvEscape(value, delimiter); }).join(delimiter);
    }).join('\n');

    var width = headers ? headers.length : (rows.length ? rows[0].length : 0);
    return {
      text: text,
      detail: rows.length + ' 行 × ' + width + ' 列 · ' + delimiterLabel(delimiter)
    };
  }

  /* ------------------------------------------------------------------ */
  /* 编码 / 统计                                                         */
  /* ------------------------------------------------------------------ */

  function encodeBase64(value) {
    var bytes = new TextEncoder().encode(String(value));
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function decodeBase64(value) {
    var source = String(value).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(source)) {
      throw new Error('Base64 内容包含无效字符');
    }
    var remainder = source.length % 4;
    if (remainder === 1) throw new Error('Base64 长度无效');
    if (remainder) source += new Array(4 - remainder + 1).join('=');

    var binary;
    try {
      binary = atob(source);
    } catch (err) {
      throw new Error('Base64 解码失败，请检查内容');
    }
    var bytes = Uint8Array.from(binary, function (char) { return char.charCodeAt(0); });
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (err) {
      throw new Error('Base64 解码结果不是有效的 UTF-8 文本');
    }
  }

  function encodeBase64Url(value) {
    return encodeBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function encodeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function decodeHtml(value) {
    return String(value).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]+);/g, function (match, code) {
      if (code.charAt(0) === '#') {
        var isHex = code.charAt(1).toLowerCase() === 'x';
        var point = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        if (isFinite(point) && point >= 0 && point <= 0x10ffff) {
          return String.fromCodePoint(point);
        }
        return match;
      }
      var named = HTML_ENTITIES[code];
      return named === undefined ? match : named;
    });
  }

  function unicodeEscape(value) {
    var output = '';
    for (var char of String(value)) {
      var point = char.codePointAt(0);
      if (point < 0x20 || point > 0x7e) {
        if (point <= 0xffff) {
          output += '\\u' + point.toString(16).toUpperCase().padStart(4, '0');
        } else {
          var shifted = point - 0x10000;
          var high = 0xd800 + (shifted >> 10);
          var low = 0xdc00 + (shifted & 0x3ff);
          output += '\\u' + high.toString(16).toUpperCase().padStart(4, '0');
          output += '\\u' + low.toString(16).toUpperCase().padStart(4, '0');
        }
      } else {
        output += char;
      }
    }
    return output;
  }

  function unicodeUnescape(value) {
    return String(value).replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, function (match, braced, four) {
      var point = parseInt(braced || four, 16);
      if (!isFinite(point) || point > 0x10ffff) return match;
      return String.fromCodePoint(point);
    });
  }

  function encodeHex(value) {
    var bytes = new TextEncoder().encode(String(value));
    var output = [];
    for (var i = 0; i < bytes.length; i += 1) {
      output.push(bytes[i].toString(16).toUpperCase().padStart(2, '0'));
    }
    return output.join(' ');
  }

  function decodeHex(value) {
    var clean = String(value).replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
    if (!clean) return '';
    if (clean.length % 2 !== 0) throw new Error('十六进制内容长度必须为偶数');
    var bytes = new Uint8Array(clean.length / 2);
    for (var i = 0; i < bytes.length; i += 1) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (err) {
      throw new Error('十六进制解码结果不是有效的 UTF-8 文本');
    }
  }

  function encodeJsonString(value) {
    return JSON.stringify(String(value)).slice(1, -1);
  }

  function decodeJsonString(value) {
    var raw = String(value);
    var trimmed = raw.trim();
    try {
      if (trimmed.charAt(0) === '"' && trimmed.charAt(trimmed.length - 1) === '"') {
        return JSON.parse(trimmed);
      }
      return JSON.parse('"' + raw.replace(/(^|[^\\])"/g, '$1\\"') + '"');
    } catch (err) {
      throw new Error('JSON 字符串解码失败：请检查转义序列');
    }
  }

  function encodeDecode(input, options) {
    var mode = options.mode === 'decode' ? 'decode' : 'encode';
    var codec = options.codec;
    var text = String(input);
    var labels = {
      url: 'URL 组件',
      base64: 'Base64',
      base64url: 'Base64 URL-safe',
      html: 'HTML 实体',
      unicode: 'Unicode 转义',
      hex: 'Hex UTF-8',
      json: 'JSON 字符串'
    };

    try {
      var output;
      if (codec === 'base64' || codec === 'base64url') {
        output = mode === 'encode'
          ? (codec === 'base64' ? encodeBase64(text) : encodeBase64Url(text))
          : decodeBase64(text);
      } else if (codec === 'html') {
        output = mode === 'encode' ? encodeHtml(text) : decodeHtml(text);
      } else if (codec === 'unicode') {
        output = mode === 'encode' ? unicodeEscape(text) : unicodeUnescape(text);
      } else if (codec === 'hex') {
        output = mode === 'encode' ? encodeHex(text) : decodeHex(text);
      } else if (codec === 'json') {
        output = mode === 'encode' ? encodeJsonString(text) : decodeJsonString(text);
      } else {
        output = mode === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text);
      }
      return {
        text: output,
        detail: (labels[codec] || '编码') + ' · ' + (mode === 'encode' ? '编码' : '解码')
      };
    } catch (err) {
      if (err instanceof URIError) {
        throw new Error('URL 解码失败：包含无效的百分号编码');
      }
      throw err;
    }
  }

  function analyzeText(input, options) {
    if (input === '') return { text: '', detail: '等待输入' };

    var lines = splitLines(input);
    var nonEmptyLines = lines.filter(function (line) { return line.trim() !== ''; });
    var chars = Array.from(input).length;
    var visibleChars = Array.from(input.replace(/\s/gu, '')).length;
    var bytes = new TextEncoder().encode(input).length;
    var cjkMatches = input.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) || [];
    var latinTokens = input.match(/[A-Za-z0-9]+(?:['\u2019-][A-Za-z0-9]+)*/g) || [];
    var wordCount = cjkMatches.length + latinTokens.length;
    var paragraphs = input.trim()
      ? input.trim().split(/\n\s*\n/).filter(function (part) { return part.trim() !== ''; }).length
      : 0;
    var uniqueLines = new Set(nonEmptyLines).size;
    var readingMinutes = Math.max(1, Math.ceil(cjkMatches.length / 350 + latinTokens.length / 220));
    var topN = Math.max(0, Number(options.topN) || 0);

    var frequency = '';
    if (topN > 0) {
      var counts = new Map();
      function addToken(token) {
        var key = options.ignoreCase ? token.toLocaleLowerCase() : token;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      latinTokens.forEach(addToken);
      cjkMatches.forEach(addToken);
      var top = Array.from(counts.entries())
        .sort(function (a, b) {
          return b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hans-CN');
        })
        .slice(0, topN);

      if (top.length) {
        frequency = '\n\n高频词 / 字 Top ' + top.length + '\n' + repeatLine(18) + '\n' +
          top.map(function (entry, index) {
            return String(index + 1).padStart(2, ' ') + '. ' + entry[0] + '  ' + fmt(entry[1]);
          }).join('\n');
      }
    }

    var report = [
      '文本概览',
      repeatLine(18),
      '字符（含空白）：' + fmt(chars),
      '字符（不含空白）：' + fmt(visibleChars),
      '行数：' + fmt(lines.length),
      '非空行：' + fmt(nonEmptyLines.length),
      '段落：' + fmt(paragraphs),
      '词数（中英估算）：' + fmt(wordCount),
      'UTF-8 字节：' + fmt(bytes),
      '唯一行：' + fmt(uniqueLines),
      '预计阅读：约 ' + fmt(readingMinutes) + ' 分钟'
    ].join('\n') + frequency;

    return {
      text: report,
      detail: '已分析 ' + fmt(chars) + ' 个字符'
    };
  }

  function repeatLine(length) {
    return new Array(length + 1).join('\u2500');
  }

  /* ------------------------------------------------------------------ */
  /* 开发工具                                                            */
  /* ------------------------------------------------------------------ */

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function formatLocalDate(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate()) +
      ' ' + pad2(date.getHours()) + ':' + pad2(date.getMinutes()) + ':' + pad2(date.getSeconds());
  }

  function formatUtcDate(date) {
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate()) +
      ' ' + pad2(date.getUTCHours()) + ':' + pad2(date.getUTCMinutes()) + ':' + pad2(date.getUTCSeconds()) + ' UTC';
  }

  function relativeTime(date, now) {
    var difference = date.getTime() - now;
    var absolute = Math.abs(difference);
    var units = [
      [31536000000, '年'],
      [2592000000, '个月'],
      [604800000, '周'],
      [86400000, '天'],
      [3600000, '小时'],
      [60000, '分钟'],
      [1000, '秒']
    ];
    for (var i = 0; i < units.length; i += 1) {
      if (absolute >= units[i][0]) {
        return Math.round(absolute / units[i][0]) + ' ' + units[i][1] + (difference > 0 ? '后' : '前');
      }
    }
    return '刚刚';
  }

  function parseDateValue(value) {
    var text = String(value).trim();
    if (!text) return null;
    var normalized = text.replace(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2})?)$/, '$1T$2');
    var date = new Date(normalized);
    return isNaN(date.getTime()) ? null : date;
  }

  function convertTimestamp(input, options) {
    var text = String(input).trim();
    if (!text) return { text: '', detail: '等待输入' };

    if (options.direction === 'toTimestamp') {
      var parsed = parseDateValue(text);
      if (!parsed) {
        throw new Error('无法识别这个日期。试试 2026-10-26 或 2026-10-26 14:30:00。');
      }
      return {
        text: [
          'Unix 秒：' + Math.floor(parsed.getTime() / 1000),
          'Unix 毫秒：' + parsed.getTime(),
          'ISO 8601：' + parsed.toISOString(),
          '本地时间：' + formatLocalDate(parsed)
        ].join('\n'),
        detail: '日期 → 时间戳'
      };
    }

    var numeric = Number(text.replace(/[,\s]/g, ''));
    var date;
    var detected = '毫秒';
    if (isFinite(numeric) && numeric !== 0) {
      if (options.unit === 'seconds' || (options.unit === 'auto' && Math.abs(numeric) < 1e11)) {
        numeric *= 1000;
        detected = '秒';
      }
      date = new Date(numeric);
    } else if (numeric === 0) {
      date = new Date(0);
      if (options.unit === 'seconds' || options.unit === 'auto') detected = '秒';
    } else {
      date = parseDateValue(text);
    }

    if (!date || isNaN(date.getTime())) {
      throw new Error('无法识别这个时间戳或日期。');
    }

    return {
      text: [
        'ISO 8601：' + date.toISOString(),
        'UTC：' + formatUtcDate(date),
        '本地：' + formatLocalDate(date),
        'Unix 秒：' + Math.floor(date.getTime() / 1000),
        'Unix 毫秒：' + date.getTime(),
        '相对现在：' + relativeTime(date, Date.now())
      ].join('\n'),
      detail: '时间戳 → 日期 · 按' + detected + '解析'
    };
  }

  function parseBase64Json(part, label) {
    var raw;
    try {
      raw = decodeBase64(part);
    } catch (error) {
      throw new Error(label + ' 解码失败：' + describeError(error));
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      throw new Error(label + ' 不是有效的 JSON：' + describeError(error));
    }
  }

  function decodeJwt(input, options) {
    var token = String(input).trim();
    if (!token) return { text: '', detail: '等待输入' };
    var parts = token.split('.');
    if (parts.length < 2) {
      throw new Error('这不像一个 JWT：至少需要 header.payload 两段。');
    }

    var header = parseBase64Json(parts[0], 'Header');
    var payload = parseBase64Json(parts[1], 'Payload');
    var indent = options.pretty ? 2 : 0;
    var chunks = [
      'Header',
      JSON.stringify(header, null, indent),
      '',
      'Payload',
      JSON.stringify(payload, null, indent)
    ];

    if (options.showSignature) {
      chunks.push('', 'Signature', parts[2] || '（空）', '', '⚠ 仅解码，未验证签名。');
    }

    return {
      text: chunks.join('\n'),
      detail: 'JWT 解码完成 · 未验证签名'
    };
  }

  function safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  function parseUrlTool(input, options) {
    var text = String(input).trim();
    if (!text) return { text: '', detail: '等待输入' };

    var candidate = text;
    if (options.assumeHttps && !/^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) && candidate.indexOf('//') !== 0) {
      candidate = 'https://' + candidate;
    }

    var url;
    try {
      url = new URL(candidate);
    } catch (error) {
      throw new Error('URL 解析失败：' + describeError(error));
    }

    var query = {};
    url.searchParams.forEach(function (value, key) {
      var decodedValue = options.decode ? safeDecode(value) : value;
      var decodedKey = options.decode ? safeDecode(key) : key;
      if (hasOwn(query, decodedKey)) {
        if (Array.isArray(query[decodedKey])) query[decodedKey].push(decodedValue);
        else query[decodedKey] = [query[decodedKey], decodedValue];
      } else {
        query[decodedKey] = decodedValue;
      }
    });

    var result = {
      href: options.decode ? safeDecode(url.href) : url.href,
      protocol: url.protocol,
      host: url.host,
      hostname: url.hostname,
      port: url.port,
      origin: url.origin,
      username: options.decode ? safeDecode(url.username) : url.username,
      password: options.decode ? safeDecode(url.password) : url.password,
      pathname: options.decode ? safeDecode(url.pathname) : url.pathname,
      search: options.decode ? safeDecode(url.search) : url.search,
      hash: options.decode ? safeDecode(url.hash) : url.hash,
      query: query
    };

    return {
      text: JSON.stringify(result, null, 2),
      detail: '主机 ' + url.hostname + ' · 查询参数 ' + Object.keys(query).length + ' 个'
    };
  }

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function namedColor(value) {
    var colors = {
      black: [0, 0, 0, 1],
      white: [255, 255, 255, 1],
      red: [255, 0, 0, 1],
      lime: [0, 255, 0, 1],
      green: [0, 128, 0, 1],
      blue: [0, 0, 255, 1],
      yellow: [255, 255, 0, 1],
      orange: [255, 165, 0, 1],
      purple: [128, 0, 128, 1],
      pink: [255, 192, 203, 1],
      gray: [128, 128, 128, 1],
      grey: [128, 128, 128, 1],
      silver: [192, 192, 192, 1],
      teal: [0, 128, 128, 1],
      navy: [0, 0, 128, 1],
      maroon: [128, 0, 0, 1],
      olive: [128, 128, 0, 1],
      aqua: [0, 255, 255, 1],
      fuchsia: [255, 0, 255, 1],
      transparent: [0, 0, 0, 0]
    };
    return colors[value] || null;
  }

  function parseAlpha(value) {
    var text = String(value).trim();
    if (text.charAt(text.length - 1) === '%') {
      return clampNumber(parseFloat(text) / 100, 0, 1);
    }
    var number = parseFloat(text);
    return isFinite(number) ? clampNumber(number, 0, 1) : 1;
  }

  function hslToRgb(hue, saturation, lightness) {
    var h = (((hue % 360) + 360) % 360) / 360;
    var s = clampNumber(saturation, 0, 1);
    var l = clampNumber(lightness, 0, 1);
    if (s === 0) {
      var gray = Math.round(l * 255);
      return [gray, gray, gray];
    }
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    function channel(t) {
      var value = t;
      if (value < 0) value += 1;
      if (value > 1) value -= 1;
      if (value < 1 / 6) return p + (q - p) * 6 * value;
      if (value < 1 / 2) return q;
      if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6;
      return p;
    }
    return [
      Math.round(channel(h + 1 / 3) * 255),
      Math.round(channel(h) * 255),
      Math.round(channel(h - 1 / 3) * 255)
    ];
  }

  function rgbToHsl(r, g, b) {
    var red = r / 255;
    var green = g / 255;
    var blue = b / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var lightness = (max + min) / 2;
    var hue = 0;
    var saturation = 0;
    if (max !== min) {
      var delta = max - min;
      saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue /= 6;
    }
    return [Math.round(hue * 360), Math.round(saturation * 100), Math.round(lightness * 100)];
  }

  function rgbToHsv(r, g, b) {
    var red = r / 255;
    var green = g / 255;
    var blue = b / 255;
    var max = Math.max(red, green, blue);
    var min = Math.min(red, green, blue);
    var delta = max - min;
    var hue = 0;
    if (delta !== 0) {
      if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
      else if (max === green) hue = (blue - red) / delta + 2;
      else hue = (red - green) / delta + 4;
      hue /= 6;
    }
    return [Math.round(hue * 360), Math.round((max === 0 ? 0 : delta / max) * 100), Math.round(max * 100)];
  }

  function parseColor(value) {
    var text = String(value).trim().toLowerCase();
    var named = namedColor(text);
    if (named) return { r: named[0], g: named[1], b: named[2], a: named[3] };

    if (/^#([0-9a-f]{3,8})$/i.test(text)) {
      var hex = text.slice(1);
      if (hex.length === 3 || hex.length === 4) {
        hex = hex.split('').map(function (char) { return char + char; }).join('');
      }
      if (hex.length !== 6 && hex.length !== 8) return null;
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1
      };
    }

    var rgbMatch = /^rgba?\(([^)]+)\)$/.exec(text);
    if (rgbMatch) {
      var rgbParts = rgbMatch[1].split(/[\s,\/]+/).filter(Boolean);
      if (rgbParts.length < 3) return null;
      var channels = rgbParts.slice(0, 3).map(function (part) {
        var number = parseFloat(part);
        if (!isFinite(number)) number = 0;
        if (part.charAt(part.length - 1) === '%') number = number / 100 * 255;
        return clampNumber(Math.round(number), 0, 255);
      });
      return {
        r: channels[0],
        g: channels[1],
        b: channels[2],
        a: rgbParts.length > 3 ? parseAlpha(rgbParts[3]) : 1
      };
    }

    var hslMatch = /^hsla?\(([^)]+)\)$/.exec(text);
    if (hslMatch) {
      var hslParts = hslMatch[1].split(/[\s,\/]+/).filter(Boolean);
      if (hslParts.length < 3) return null;
      var hue = parseFloat(hslParts[0]);
      var saturation = parseFloat(hslParts[1]) / 100;
      var lightness = parseFloat(hslParts[2]) / 100;
      if (!isFinite(hue)) hue = 0;
      if (!isFinite(saturation)) saturation = 0;
      if (!isFinite(lightness)) lightness = 0;
      var rgba = hslToRgb(hue, saturation, lightness);
      return {
        r: rgba[0],
        g: rgba[1],
        b: rgba[2],
        a: hslParts.length > 3 ? parseAlpha(hslParts[3]) : 1
      };
    }

    return null;
  }

  function alphaText(alpha) {
    return String(Number(alpha.toFixed(2)));
  }

  function colorConvert(input, options) {
    var value = String(input).trim();
    if (!value) return { text: '', detail: '等待输入' };
    var color = parseColor(value);
    if (!color) {
      throw new Error('无法识别这个颜色。支持 #hex、rgb()、rgba()、hsl()、hsla() 和常见颜色名。');
    }

    var hex = '#' + [color.r, color.g, color.b].map(function (channel) {
      return channel.toString(16).padStart(2, '0');
    }).join('').toUpperCase();
    if (color.a < 1) hex += Math.round(color.a * 255).toString(16).padStart(2, '0').toUpperCase();

    var alpha = alphaText(color.a);
    var rgb = color.a < 1
      ? 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', ' + alpha + ')'
      : 'rgb(' + color.r + ', ' + color.g + ', ' + color.b + ')';
    var rgba = 'rgba(' + color.r + ', ' + color.g + ', ' + color.b + ', ' + alpha + ')';
    var hsl = rgbToHsl(color.r, color.g, color.b);
    var hsv = rgbToHsv(color.r, color.g, color.b);
    var hslText = color.a < 1
      ? 'hsla(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%, ' + alpha + ')'
      : 'hsl(' + hsl[0] + ', ' + hsl[1] + '%, ' + hsl[2] + '%)';

    var lines = [
      'HEX    ' + hex,
      'RGB    ' + rgb,
      'RGBA   ' + rgba,
      'HSL    ' + hslText,
      'HSV    hsv(' + hsv[0] + ', ' + hsv[1] + '%, ' + hsv[2] + '%)'
    ];
    if (options.cssVar) {
      lines.push('CSS    --color: ' + hex + ';');
    }

    return {
      text: lines.join('\n'),
      detail: 'RGB ' + color.r + ', ' + color.g + ', ' + color.b
    };
  }

  function testRegex(input, options) {
    var pattern = String(options.pattern == null ? '' : options.pattern);
    if (!pattern) return { text: '', detail: '请填写正则表达式' };
    var flags = String(options.flags == null ? '' : options.flags).replace(/[^gimsu]/g, '');
    flags = Array.from(new Set(flags.split(''))).join('');
    if (flags.indexOf('g') === -1) flags += 'g';

    var regex;
    try {
      regex = new RegExp(pattern, flags);
    } catch (error) {
      throw new Error('正则表达式无效：' + describeError(error));
    }

    var matches = Array.from(input.matchAll(regex));
    if (!matches.length) {
      return { text: '没有匹配到内容', detail: '0 处匹配' };
    }

    var max = clampNumber(Number(options.maxMatches) || 100, 1, 1000);
    var shown = matches.slice(0, max);
    var lines = [
      '匹配到 ' + matches.length + ' 处' + (matches.length > shown.length ? '（只显示前 ' + shown.length + ' 处）' : ''),
      ''
    ];

    shown.forEach(function (match, index) {
      var before = input.slice(0, match.index);
      var lineNumber = splitLines(before).length;
      var column = match.index - before.lastIndexOf('\n');
      var text = match[0].replace(/\n/g, '\\n');
      lines.push('[' + (index + 1) + '] "' + text + '"  @ 第 ' + lineNumber + ' 行，第 ' + column + ' 列');
      if (options.showGroups) {
        match.slice(1).forEach(function (group, groupIndex) {
          lines.push('    分组 ' + (groupIndex + 1) + '：' + (group === undefined ? '未参与匹配' : '"' + group.replace(/\n/g, '\\n') + '"'));
        });
        if (match.groups) {
          Object.keys(match.groups).forEach(function (name) {
            var group = match.groups[name];
            lines.push('    命名分组 ' + name + '：' + (group === undefined ? '未参与匹配' : '"' + group.replace(/\n/g, '\\n') + '"'));
          });
        }
      }
    });

    return {
      text: lines.join('\n'),
      detail: matches.length + ' 处匹配'
    };
  }

  function hashText(input, options) {
    var cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoObject || !cryptoObject.subtle) {
      return Promise.reject(new Error('当前环境不支持 Web Crypto，请使用 HTTPS 或 localhost 打开页面。'));
    }
    return cryptoObject.subtle.digest(options.algorithm, new TextEncoder().encode(String(input))).then(function (buffer) {
      var bytes = new Uint8Array(buffer);
      var hex = Array.from(bytes).map(function (byte) {
        return byte.toString(16).padStart(2, '0');
      }).join('');
      if (options.uppercase) hex = hex.toUpperCase();
      var base64 = btoa(String.fromCharCode.apply(null, bytes));
      var lines = ['算法：' + options.algorithm, ''];
      if (options.format === 'base64') {
        lines.push('Base64', base64);
      } else if (options.format === 'both') {
        lines.push('Hex', hex, '', 'Base64', base64);
      } else {
        lines.push('Hex', hex);
      }
      return {
        text: lines.join('\n'),
        detail: options.algorithm + ' · ' + bytes.length + ' 字节摘要'
      };
    }).catch(function (error) {
      throw new Error('哈希计算失败：' + describeError(error));
    });
  }

  /* ------------------------------------------------------------------ */
  /* 生成器                                                              */
  /* ------------------------------------------------------------------ */

  function getCrypto() {
    var cryptoObject = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoObject || typeof cryptoObject.getRandomValues !== 'function') {
      throw new Error('当前环境不支持安全随机数。');
    }
    return cryptoObject;
  }

  function randomInt(max) {
    if (!isFinite(max) || max <= 0) throw new Error('随机范围无效。');
    if (max > 0x100000000) throw new Error('随机范围过大。');
    var cryptoObject = getCrypto();
    var limit = Math.floor(0x100000000 / max) * max;
    var buffer = new Uint32Array(1);
    do {
      cryptoObject.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % max;
  }

  function fallbackUuid() {
    var bytes = new Uint8Array(16);
    getCrypto().getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = Array.from(bytes).map(function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  function generateUuid(_input, options) {
    var count = clampNumber(Math.round(Number(options.count) || 1), 1, 100);
    var output = [];
    for (var i = 0; i < count; i += 1) {
      var hasRandomUuid = typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function';
      var uuid = hasRandomUuid ? globalThis.crypto.randomUUID() : fallbackUuid();
      if (!options.hyphens) uuid = uuid.replace(/-/g, '');
      if (options.uppercase) uuid = uuid.toUpperCase();
      output.push(uuid);
    }
    return {
      text: output.join('\n'),
      detail: count + ' 个 UUID v4'
    };
  }

  function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i -= 1) {
      var j = randomInt(i + 1);
      var temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  function pickRandom(value) {
    return value.charAt(randomInt(value.length));
  }

  function generatePasswords(_input, options) {
    var length = clampNumber(Math.round(Number(options.length) || 16), 4, 128);
    var count = clampNumber(Math.round(Number(options.count) || 5), 1, 50);
    var ambiguous = 'Il1O0o';
    var sets = [];
    if (options.lowercase) sets.push('abcdefghijklmnopqrstuvwxyz');
    if (options.uppercase) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    if (options.digits) sets.push('0123456789');
    if (options.symbols) sets.push('!@#$%^&*()-_=+[]{};:,.?/');

    sets = sets.map(function (set) {
      return options.excludeAmbiguous
        ? set.split('').filter(function (char) { return ambiguous.indexOf(char) === -1; }).join('')
        : set;
    }).filter(function (set) { return set.length > 0; });

    if (!sets.length) throw new Error('至少选择一种字符类型。');
    if (length < sets.length) throw new Error('密码长度不能小于所选字符类型的数量（' + sets.length + '）。');

    var pool = sets.join('');
    var passwords = [];
    for (var i = 0; i < count; i += 1) {
      var chars = sets.map(pickRandom);
      while (chars.length < length) chars.push(pickRandom(pool));
      shuffleArray(chars);
      passwords.push(chars.join(''));
    }

    return {
      text: passwords.join('\n'),
      detail: count + ' 个密码 · ' + length + ' 位'
    };
  }

  function generateRandomNumbers(_input, options) {
    var min = Math.ceil(Number(options.min));
    var max = Math.floor(Number(options.max));
    if (!isFinite(min) || !isFinite(max) || min > max) {
      throw new Error('请输入有效的范围：最小值不能大于最大值。');
    }
    var range = max - min + 1;
    var count = clampNumber(Math.round(Number(options.count) || 1), 1, 1000);
    if (options.unique && count > range) {
      throw new Error('范围内只有 ' + range + ' 个整数，无法生成 ' + count + ' 个不重复数字。');
    }

    var output = [];
    var used = new Set();
    while (output.length < count) {
      var value = min + randomInt(range);
      if (options.unique) {
        if (used.has(value)) continue;
        used.add(value);
      }
      output.push(value);
    }

    return {
      text: output.join('\n'),
      detail: count + ' 个随机整数 · ' + min + ' ~ ' + max
    };
  }

  function shuffleLines(input, options) {
    var lines = splitLines(input);
    if (options.trim) lines = lines.map(function (line) { return line.trim(); });
    if (options.skipEmpty) lines = lines.filter(function (line) { return line !== ''; });
    shuffleArray(lines);
    return {
      text: lines.join('\n'),
      detail: lines.length + ' 行 · 已打乱'
    };
  }

  /* ------------------------------------------------------------------ */
  /* 图片 / SVG                                                          */
  /* ------------------------------------------------------------------ */

  function svgToDataUri(input, options) {
    var svg = String(input).trim();
    if (!svg) return { text: '', detail: '等待输入' };

    var payload;
    if (options.encoding === 'base64') {
      payload = 'data:image/svg+xml;base64,' + encodeBase64(svg);
    } else {
      payload = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    var output;
    if (options.output === 'css') {
      output = 'background-image: url("' + payload + '");';
    } else if (options.output === 'html') {
      output = '<img src="' + payload + '" alt="SVG image">';
    } else {
      output = payload;
    }

    return {
      text: output,
      detail: 'SVG · ' + (options.encoding === 'base64' ? 'Base64' : 'URL 编码') + ' Data URI'
    };
  }

  /* ------------------------------------------------------------------ */
  /* 工具注册表                                                          */
  /* ------------------------------------------------------------------ */

  var tools = [
    {
      id: 'line-quotes',
      name: '行转引号',
      short: '每一行 → 带引号、逗号的列表项',
      description: '把多行文本逐行包上引号并按需补上逗号，直接用于 SQL IN、数组和代码列表。',
      category: 'text',
      glyph: "'\u2026'",
      keywords: ['引号', 'quote', 'sql', 'in', '数组', 'array', '逗号', 'comma', '列表', 'list'],
      tags: ['SQL', 'JSON', 'JS'],
      inputPlaceholder: '每行一个值，例如：\n123\n456\nO\'Reilly',
      outputPlaceholder: "'123',\n'456',\n'O''Reilly',",
      sample: "123\n456\nO'Reilly",
      options: [
        {
          id: 'quote', type: 'segmented', label: '引号', value: "'",
          choices: [{ value: "'", label: "' 单引号" }, { value: '"', label: '" 双引号' }, { value: '`', label: '` 反引号' }]
        },
        { id: 'customQuote', type: 'text', label: '自定义引号', value: '', placeholder: '可选，例如 «', hint: '填写后优先于上方选择', wide: true },
        { id: 'comma', type: 'checkbox', label: '行尾逗号', value: true },
        {
          id: 'escape', type: 'select', label: '引号转义', value: 'sql',
          choices: [
            { value: 'sql', label: '双写引号（SQL）' },
            { value: 'backslash', label: '反斜杠（JS / Python）' },
            { value: 'none', label: '不转义' }
          ]
        },
        { id: 'trim', type: 'checkbox', label: '去除首尾空白', value: true },
        { id: 'skipEmpty', type: 'checkbox', label: '跳过空行', value: true },
        { id: 'dedupe', type: 'checkbox', label: '去重', value: false },
        { id: 'prefix', type: 'text', label: '前缀行', value: '', placeholder: '例如 IN (' },
        { id: 'suffix', type: 'text', label: '后缀行', value: '', placeholder: '例如 )' }
      ],
      presets: [
        {
          id: 'sql', label: 'SQL IN',
          options: { quote: "'", customQuote: '', comma: true, escape: 'sql', trim: true, skipEmpty: true, dedupe: false, prefix: 'IN (', suffix: ')' }
        },
        {
          id: 'array', label: 'JS / Python 数组',
          options: { quote: "'", customQuote: '', comma: true, escape: 'backslash', trim: true, skipEmpty: true, dedupe: false, prefix: '[', suffix: ']' }
        },
        {
          id: 'plain', label: '纯列表',
          options: { quote: "'", customQuote: '', comma: true, escape: 'sql', trim: true, skipEmpty: true, dedupe: false, prefix: '', suffix: '' }
        }
      ],
      tips: [
        'SQL 单引号按标准双写转义：O\'Reilly → O\'\'Reilly。JS / Python 可切换为反斜杠。',
        '选择「SQL IN」预设会自动加上 IN ( … ) 包裹。',
        '按 Ctrl / ⌘ + Enter 可直接复制输出结果。'
      ],
      transform: buildQuotedList
    },
    {
      id: 'strip-list',
      name: '列表还原',
      short: '去掉引号、逗号和括号，还原成纯文本',
      description: '把带引号、逗号、括号的列表还原成干净的纯文本，每行一个值；也支持 JSON 字符串数组。',
      category: 'text',
      glyph: '\u232b',
      keywords: ['去引号', '还原', 'strip', 'unquote', 'list', 'sql', 'json', '逗号', '反转'],
      tags: ['SQL', 'JSON', '反转'],
      inputPlaceholder: "粘贴列表，例如：\n'123',\n'456',\n'O''Reilly',",
      outputPlaceholder: '123\n456\nO\'Reilly',
      sample: "'123',\n'456',\n'O''Reilly',",
      options: [
        { id: 'splitCommas', type: 'checkbox', label: '按逗号拆分同一行', value: true, hint: '引号内的逗号不会被拆开' },
        { id: 'unescape', type: 'checkbox', label: '还原转义字符', value: true },
        { id: 'trim', type: 'checkbox', label: '去除首尾空白', value: true },
        { id: 'skipEmpty', type: 'checkbox', label: '跳过空项', value: true },
        { id: 'dedupe', type: 'checkbox', label: '去重', value: false }
      ],
      tips: [
        '整段 JSON 字符串数组（如 ["a","b"]）也可以直接粘贴。',
        '默认按引号外的逗号拆分同一行里的多个值。',
        '支持 SQL 的双写单引号与常见的反斜杠转义。'
      ],
      transform: restoreList
    },
    {
      id: 'line-prefix',
      name: '行号与前后缀',
      short: '批量加行号、前缀、后缀',
      description: '为每一行批量添加前缀、后缀或行号，适合生成 Markdown 列表、代码注释和编号清单。',
      category: 'text',
      glyph: '#',
      keywords: ['行号', '前缀', '后缀', 'prefix', 'suffix', 'number', '编号', 'markdown'],
      tags: ['Markdown', '编号', '批处理'],
      inputPlaceholder: '每行一条内容…',
      outputPlaceholder: '1. 第一行\n2. 第二行',
      sample: 'Write the spec\nShip the tool\n\nReview feedback',
      options: [
        { id: 'prefix', type: 'text', label: '每行前缀', value: '', placeholder: '例如 - ' },
        { id: 'suffix', type: 'text', label: '每行后缀', value: '', placeholder: '例如 ;' },
        { id: 'numberLines', type: 'checkbox', label: '添加行号', value: true },
        { id: 'start', type: 'number', label: '起始编号', value: 1, step: 1 },
        { id: 'separator', type: 'text', label: '编号分隔符', value: '. ', placeholder: '. ' },
        { id: 'trim', type: 'checkbox', label: '去除首尾空白', value: true },
        { id: 'skipEmpty', type: 'checkbox', label: '跳过空行', value: true }
      ],
      tips: [
        '前缀会加在行号之前，后缀会加在整行末尾。',
        '做 Markdown 列表时，把前缀设为「- 」并关闭行号。',
        '起始编号支持负数与 0。'
      ],
      transform: addLinePrefixes
    },
    {
      id: 'dedupe-sort',
      name: '去重排序',
      short: '按行去重、排序、清理空行',
      description: '按行去重、排序和清理空行，支持忽略大小写、自然排序与按长度排序。',
      category: 'text',
      glyph: '\u2195',
      keywords: ['去重', '排序', 'unique', 'dedupe', 'sort', '自然排序', '空行'],
      tags: ['去重', '排序', '清理'],
      inputPlaceholder: '每行一项，允许重复…',
      outputPlaceholder: '去重并排序后的结果…',
      sample: 'apple\nBanana\napple\n42\n7\n  banana  ',
      options: [
        { id: 'dedupe', type: 'checkbox', label: '去除重复行', value: true },
        {
          id: 'sort', type: 'select', label: '排序方式', value: 'asc',
          choices: [
            { value: 'none', label: '保持原顺序' },
            { value: 'asc', label: '升序（自然排序）' },
            { value: 'desc', label: '降序' },
            { value: 'length-asc', label: '按长度：短 → 长' },
            { value: 'length-desc', label: '按长度：长 → 短' }
          ]
        },
        { id: 'ignoreCase', type: 'checkbox', label: '忽略大小写', value: false },
        { id: 'trim', type: 'checkbox', label: '去除首尾空白', value: true },
        { id: 'skipEmpty', type: 'checkbox', label: '移除空行', value: true }
      ],
      tips: [
        '自然排序会把「item2」排在「item10」之前。',
        '开启忽略大小写后，Apple 与 apple 会被视为重复项。',
        '长度排序使用字符数（包括空格）。'
      ],
      transform: dedupeAndSort
    },
    {
      id: 'whitespace-clean',
      name: '空白清理',
      short: '清理多余空格、空行与制表符',
      description: '清理多余空格、空行与制表符，让从 PDF、表格或聊天记录里复制来的文本恢复整洁。',
      category: 'text',
      glyph: '\u2423',
      keywords: ['空格', '空白', 'whitespace', 'trim', '空行', 'tab', '制表符', '清理'],
      tags: ['空格', '空行', 'Tab'],
      inputPlaceholder: '粘贴格式混乱的文本…',
      outputPlaceholder: '整洁的文本…',
      sample: '  Hello   world  \nThis   line   has   gaps\n\n\tTabbed\tline\n',
      options: [
        { id: 'trim', type: 'checkbox', label: '去除每行首尾空白', value: true },
        { id: 'collapseSpaces', type: 'checkbox', label: '合并连续空格', value: false, hint: '会压缩代码缩进，按需开启' },
        { id: 'removeBlank', type: 'checkbox', label: '删除空行', value: false },
        { id: 'tabsToSpaces', type: 'checkbox', label: 'Tab 转为空格', value: false },
        { id: 'tabWidth', type: 'number', label: 'Tab 宽度', value: 4, min: 1, max: 16, step: 1 }
      ],
      tips: [
        '空白清理是保守模式：默认只去掉每行首尾空白。',
        '「合并连续空格」会压掉代码缩进，处理代码时请谨慎。',
        '空行删除在去首尾空白之后执行。'
      ],
      transform: cleanWhitespace
    },
    {
      id: 'find-replace',
      name: '查找替换',
      short: '支持正则的批量查找与替换',
      description: '查找并替换文本，支持正则表达式、大小写控制和整词匹配，实时统计替换次数。',
      category: 'text',
      glyph: '\u2315',
      keywords: ['查找', '替换', 'replace', 'find', 'regex', '正则', '批量'],
      tags: ['正则', '替换', '实时'],
      inputPlaceholder: '粘贴需要处理的文本…',
      outputPlaceholder: '替换后的结果…',
      sample: 'Hello world\nHello 行间\nHELLO again',
      options: [
        { id: 'find', type: 'text', label: '查找内容', value: 'Hello', placeholder: '要查找的文本或正则', wide: true },
        { id: 'replace', type: 'text', label: '替换为', value: 'Hi', placeholder: '留空表示删除', wide: true },
        { id: 'regex', type: 'checkbox', label: '使用正则表达式', value: false, hint: '替换内容支持 $1 分组引用' },
        { id: 'caseSensitive', type: 'checkbox', label: '区分大小写', value: true },
        { id: 'wholeWord', type: 'checkbox', label: '整词匹配', value: false },
        { id: 'multiline', type: 'checkbox', label: '多行模式', value: false, hint: '^ 与 $ 匹配每行首尾' },
        { id: 'dotAll', type: 'checkbox', label: '. 匹配换行', value: false }
      ],
      tips: [
        '正则无效时会在输出区给出具体错误。',
        '纯文本替换按字面量处理；正则替换支持 $1、$& 等语法。',
        '整词匹配基于 Unicode 字母、数字与下划线边界。'
      ],
      transform: findAndReplace
    },
    {
      id: 'case-convert',
      name: '命名转换',
      short: 'camelCase / snake_case / kebab-case…',
      description: '在 camelCase、PascalCase、snake_case、kebab-case 等命名风格之间批量转换。',
      category: 'text',
      glyph: 'Aa',
      keywords: ['命名', '大小写', 'camel', 'pascal', 'snake', 'kebab', 'case', '转换'],
      tags: ['命名', '大小写', '批量'],
      inputPlaceholder: '每行一个名称…',
      outputPlaceholder: '转换后的名称…',
      sample: 'user profile\nHTTPResponse\norder_id\nfoo-bar\nJSONData',
      options: [
        {
          id: 'style', type: 'select', label: '目标风格', value: 'camel',
          choices: [
            { value: 'camel', label: 'camelCase' },
            { value: 'pascal', label: 'PascalCase' },
            { value: 'snake', label: 'snake_case' },
            { value: 'kebab', label: 'kebab-case' },
            { value: 'constant', label: 'CONSTANT_CASE' },
            { value: 'dot', label: 'dot.case' },
            { value: 'title', label: 'Title Case' },
            { value: 'lower', label: '全小写' },
            { value: 'upper', label: '全大写' }
          ]
        }
      ],
      tips: [
        '自动识别空格、下划线、连字符以及大小写边界。',
        'HTTPResponse 会拆分为 HTTP + Response。',
        '空行会保留，不会被删除。'
      ],
      transform: convertCase
    },
    {
      id: 'json-format',
      name: 'JSON 格式化',
      short: '美化、压缩、校验与键名排序',
      description: '格式化、压缩和校验 JSON，可选键名排序，并给出精确的错误位置。',
      category: 'data',
      glyph: '{}',
      keywords: ['json', '格式化', 'format', 'pretty', '压缩', 'minify', '校验', '排序'],
      tags: ['JSON', '格式化', '校验'],
      inputPlaceholder: '粘贴 JSON…',
      outputPlaceholder: '格式化后的 JSON…',
      sample: '{"name":"行间","version":1,"tags":["text","data"],"settings":{"theme":"dark","auto":true}}',
      options: [
        {
          id: 'mode', type: 'segmented', label: '输出模式', value: 'pretty',
          choices: [{ value: 'pretty', label: '格式化' }, { value: 'minify', label: '压缩' }]
        },
        {
          id: 'indent', type: 'select', label: '缩进', value: '2',
          choices: [{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }, { value: 'tab', label: 'Tab' }]
        },
        { id: 'sortKeys', type: 'checkbox', label: '按键名排序', value: false, hint: '递归排序所有对象键名' }
      ],
      tips: [
        '解析失败时会标出出错的行、列以及附近的字符片段。',
        '压缩模式会移除所有非必要空白。',
        '键名排序会递归应用到嵌套对象。'
      ],
      transform: formatJson
    },
    {
      id: 'csv-json',
      name: 'CSV 转 JSON',
      short: 'CSV / TSV → JSON 数组',
      description: '把 CSV / TSV 数据转换为 JSON 数组，自动识别分隔符、表头和常见数据类型。',
      category: 'data',
      glyph: 'CSV',
      keywords: ['csv', 'tsv', 'json', '表格', '转换', '数据', '分隔符'],
      tags: ['CSV', 'JSON', '数据'],
      inputPlaceholder: '粘贴 CSV / TSV，首行可作为表头…',
      outputPlaceholder: '[\n  { "name": "Ada" }\n]',
      sample: 'name,role,score\nAda,engineer,98\nLin,designer,91\nMika,writer,87',
      options: [
        {
          id: 'delimiter', type: 'select', label: '分隔符', value: 'auto',
          choices: [
            { value: 'auto', label: '自动识别' },
            { value: ',', label: '逗号 ,' },
            { value: 'tab', label: 'Tab' },
            { value: ';', label: '分号 ;' },
            { value: '|', label: '竖线 |' }
          ]
        },
        { id: 'hasHeader', type: 'checkbox', label: '首行作为表头', value: true },
        { id: 'inferTypes', type: 'checkbox', label: '推断数字 / 布尔 / null', value: true },
        {
          id: 'indent', type: 'select', label: 'JSON 缩进', value: '2',
          choices: [{ value: '2', label: '2 空格' }, { value: '4', label: '4 空格' }, { value: 'tab', label: 'Tab' }]
        }
      ],
      tips: [
        '支持引号字段、字段内换行和双写引号转义。',
        '自动识别逗号、Tab、分号与竖线四种分隔符。',
        '关闭「首行作为表头」会输出二维数组。'
      ],
      transform: csvToJson
    },
    {
      id: 'json-csv',
      name: 'JSON 转 CSV',
      short: 'JSON 数组 → CSV 表格',
      description: '把 JSON 数组转换为 CSV 表格，支持嵌套对象展开与标准 CSV 转义。',
      category: 'data',
      glyph: '\u21c4',
      keywords: ['json', 'csv', '表格', '转换', 'flatten', '展开', '导出'],
      tags: ['JSON', 'CSV', '表格'],
      inputPlaceholder: '粘贴 JSON 对象数组或二维数组…',
      outputPlaceholder: 'name,role,score\nAda,engineer,98',
      sample: '[{"name":"Ada","role":"engineer","score":98},{"name":"Lin","role":"designer","score":91},{"name":"Mika","role":"writer","score":87}]',
      options: [
        {
          id: 'delimiter', type: 'select', label: '分隔符', value: ',',
          choices: [
            { value: ',', label: '逗号 ,' },
            { value: 'tab', label: 'Tab' },
            { value: ';', label: '分号 ;' },
            { value: '|', label: '竖线 |' }
          ]
        },
        { id: 'includeHeader', type: 'checkbox', label: '输出表头', value: true, hint: '仅对对象数组和基础值数组生效' },
        { id: 'flatten', type: 'checkbox', label: '展开嵌套对象', value: false, hint: '用点号连接键名：user.name' }
      ],
      tips: [
        '对象数组会合并所有出现过的键作为表头。',
        '字段中的逗号、引号和换行会自动按 CSV 规则转义。',
        '二维数组按原样输出，不额外添加表头。'
      ],
      transform: jsonToCsv
    },
    {
      id: 'encode-decode',
      name: '编码解码',
      short: 'URL / Base64 / HTML / Unicode / Hex',
      description: 'URL、Base64、HTML 实体、Unicode 与十六进制编码的双向转换，完整支持中文。',
      category: 'dev',
      glyph: '%',
      keywords: ['编码', '解码', 'encode', 'decode', 'base64', 'url', 'html', 'unicode', 'hex'],
      tags: ['URL', 'Base64', 'Unicode'],
      inputPlaceholder: '粘贴需要编码或解码的内容…',
      outputPlaceholder: '转换结果…',
      sample: '你好，行间！hello world',
      options: [
        {
          id: 'codec', type: 'select', label: '编码格式', value: 'url',
          choices: [
            { value: 'url', label: 'URL 组件' },
            { value: 'base64', label: 'Base64' },
            { value: 'base64url', label: 'Base64 URL-safe' },
            { value: 'html', label: 'HTML 实体' },
            { value: 'unicode', label: 'Unicode 转义' },
            { value: 'hex', label: 'Hex UTF-8' },
            { value: 'json', label: 'JSON 字符串' }
          ]
        },
        {
          id: 'mode', type: 'segmented', label: '方向', value: 'encode',
          choices: [{ value: 'encode', label: '编码' }, { value: 'decode', label: '解码' }]
        }
      ],
      tips: [
        'Base64 与 Hex 均按 UTF-8 处理，中文不会乱码。',
        'Unicode 转义只转义非 ASCII 字符，可安全用于源码。',
        '解码失败时会在输出区指出具体原因。'
      ],
      transform: encodeDecode
    },
    {
      id: 'text-stats',
      name: '文本统计',
      short: '字符、词数、行数、字节与高频词',
      description: '统计字符、词数、行数、段落、UTF-8 字节与高频词，快速了解一段文本。',
      category: 'text',
      glyph: '\u03a3',
      keywords: ['统计', '字数', '字符', '词数', 'bytes', '行数', '高频词', 'stats'],
      tags: ['统计', '字数', '分析'],
      inputPlaceholder: '粘贴要统计的文本…',
      outputPlaceholder: '统计报告…',
      sample: '行间是一个纯前端的文本工具箱。\nPaste, transform, copy — data stays in your browser.\nNo uploads. No tracking. Just text.',
      options: [
        {
          id: 'topN', type: 'select', label: '高频词数量', value: 5,
          choices: [
            { value: 0, label: '不显示' },
            { value: 5, label: 'Top 5' },
            { value: 10, label: 'Top 10' },
            { value: 20, label: 'Top 20' }
          ]
        },
        { id: 'ignoreCase', type: 'checkbox', label: '高频词忽略大小写', value: true }
      ],
      tips: [
        '词数为中英混合估算：中文按字、英文按词。',
        '字节数按 UTF-8 编码计算，与文件大小一致。',
        '预计阅读时间按中文 350 字/分钟、英文 220 词/分钟估算。'
      ],
      transform: analyzeText
    },
    {
      id: 'timestamp',
      name: '时间戳转换',
      short: 'Unix 时间戳 ⇄ 日期时间',
      description: '在 Unix 时间戳和日期之间转换，同时给出 ISO、UTC、本地时间与相对时间。',
      category: 'dev',
      glyph: 'TS',
      keywords: ['时间戳', 'timestamp', 'unix', '日期', 'date', '时间', 'time', '时区'],
      tags: ['Unix', '日期', '时区'],
      inputPlaceholder: '粘贴时间戳，或输入 2026-10-26 14:30:00…',
      outputPlaceholder: 'ISO 8601、UTC、本地时间…',
      sample: '1792987200',
      options: [
        {
          id: 'direction', type: 'segmented', label: '方向', value: 'toDate',
          choices: [{ value: 'toDate', label: '时间戳 → 日期' }, { value: 'toTimestamp', label: '日期 → 时间戳' }]
        },
        {
          id: 'unit', type: 'select', label: '时间戳单位', value: 'auto',
          choices: [
            { value: 'auto', label: '自动识别' },
            { value: 'seconds', label: '秒（10 位）' },
            { value: 'milliseconds', label: '毫秒（13 位）' }
          ],
          hint: '仅「时间戳 → 日期」方向生效'
        }
      ],
      tips: [
        '自动识别会把小于 100000000000 的数字当作秒级时间戳。',
        '本地时间使用浏览器所在时区。',
        '切到「日期 → 时间戳」后，输入 2026-10-26 14:30:00 这类日期即可。'
      ],
      transform: convertTimestamp
    },
    {
      id: 'jwt-decode',
      name: 'JWT 解码',
      short: '查看 JWT 的 Header 与 Payload',
      description: '在本地解析 JWT 的头部和载荷，格式化展示其中的 JSON 内容，不发送到任何服务器。',
      category: 'dev',
      glyph: 'JWT',
      keywords: ['jwt', 'token', '解码', 'decode', 'payload', 'header', 'json', '登录'],
      tags: ['JWT', 'Token', '调试'],
      inputPlaceholder: '粘贴 JWT（header.payload.signature）…',
      outputPlaceholder: 'Header 与 Payload 的 JSON 内容…',
      sample: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MTQzMzIwMH0.demo-signature-not-verified',
      options: [
        { id: 'pretty', type: 'checkbox', label: '格式化 JSON', value: true },
        { id: 'showSignature', type: 'checkbox', label: '显示签名段', value: true }
      ],
      tips: [
        '这里只解码、不验证签名，不能用来判断 Token 是否可信。',
        'Payload 中的内容对任何持有 Token 的人都是可见的，不要放敏感信息。',
        '支持 Base64URL 编码，缺少 padding 也能正常解析。'
      ],
      transform: decodeJwt
    },
    {
      id: 'url-parse',
      name: 'URL 解析',
      short: '拆解协议、主机、路径与查询参数',
      description: '把一个 URL 拆解成协议、主机、路径、哈希和查询参数，并以 JSON 展示。',
      category: 'dev',
      glyph: 'URL',
      keywords: ['url', 'uri', '解析', 'parse', '查询参数', 'query', '链接'],
      tags: ['URL', 'Query', '调试'],
      inputPlaceholder: '粘贴一个 URL…',
      outputPlaceholder: '解析后的 JSON…',
      sample: 'https://shop.example.com:8443/products/list?tag=text&tag=data&q=行间#reviews',
      options: [
        { id: 'decode', type: 'checkbox', label: '解码百分号编码', value: true, hint: '路径与查询参数中文化显示' },
        { id: 'assumeHttps', type: 'checkbox', label: '缺少协议时补 https://', value: true }
      ],
      tips: [
        '重复的查询参数会合并成数组。',
        'URL 的 origin 不包含路径和查询字符串。',
        '用户名与密码中的特殊字符也会按需解码。'
      ],
      transform: parseUrlTool
    },
    {
      id: 'color-convert',
      name: '颜色转换',
      short: 'HEX / RGB / HSL / HSV 互转',
      description: '在 HEX、RGB、HSL 与 HSV 之间转换颜色，支持透明度与常见颜色名称。',
      category: 'dev',
      glyph: 'RGB',
      keywords: ['颜色', 'color', 'hex', 'rgb', 'hsl', 'hsv', 'css', '设计'],
      tags: ['CSS', 'HEX', '设计'],
      inputPlaceholder: '输入 #cf5a2c、rgb(207,90,44) 或 hsl(17,63%,49%)…',
      outputPlaceholder: '不同格式的颜色值…',
      sample: '#cf5a2c',
      options: [
        { id: 'cssVar', type: 'checkbox', label: '附加 CSS 变量', value: true }
      ],
      tips: [
        '支持 #rgb、#rgba、#rrggbb、#rrggbbaa。',
        '带透明度的颜色会额外输出 8 位 HEX 与 rgba。',
        '常见颜色名（red、teal、transparent 等）也可以直接输入。'
      ],
      transform: colorConvert
    },
    {
      id: 'regex-test',
      name: '正则测试',
      short: '实时查看匹配结果与分组',
      description: '输入正则表达式和测试文本，实时查看匹配位置、捕获分组与命名分组。',
      category: 'dev',
      glyph: '.*',
      keywords: ['正则', 'regex', 'regexp', '匹配', 'match', '测试', '分组'],
      tags: ['Regex', '调试', '匹配'],
      inputPlaceholder: '粘贴测试文本…',
      outputPlaceholder: '匹配结果、位置与分组…',
      sample: '行间 LineLab\nhello world\n工具 toolbox',
      options: [
        { id: 'pattern', type: 'text', label: '正则表达式', value: '\\b[a-z]+\\b', placeholder: '例如 \\d+', wide: true },
        { id: 'flags', type: 'text', label: 'Flags', value: 'gi', placeholder: 'gimsu' },
        { id: 'showGroups', type: 'checkbox', label: '显示捕获分组', value: true },
        { id: 'maxMatches', type: 'number', label: '最多显示', value: 100, min: 1, max: 1000, step: 10 }
      ],
      tips: [
        'Flags 会自动补上 g，方便统计全部匹配。',
        '匹配位置会换算成行号与列号。',
        '支持命名分组，例如 (?<year>\\d{4})。'
      ],
      transform: testRegex
    },
    {
      id: 'hash',
      name: '哈希计算',
      short: 'SHA-1 / SHA-256 / SHA-384 / SHA-512',
      description: '使用浏览器内置 Web Crypto 计算文本摘要，支持 Hex 与 Base64 输出。',
      category: 'dev',
      glyph: 'SHA',
      keywords: ['哈希', 'hash', 'sha', 'sha256', '摘要', '校验', 'crypto'],
      tags: ['SHA', '摘要', '校验'],
      inputPlaceholder: '粘贴需要计算摘要的文本…',
      outputPlaceholder: '哈希摘要…',
      sample: '行间 LineLab',
      options: [
        {
          id: 'algorithm', type: 'select', label: '算法', value: 'SHA-256',
          choices: [
            { value: 'SHA-256', label: 'SHA-256' },
            { value: 'SHA-1', label: 'SHA-1' },
            { value: 'SHA-384', label: 'SHA-384' },
            { value: 'SHA-512', label: 'SHA-512' }
          ]
        },
        {
          id: 'format', type: 'select', label: '输出格式', value: 'hex',
          choices: [{ value: 'hex', label: 'Hex' }, { value: 'base64', label: 'Base64' }, { value: 'both', label: '两者都输出' }]
        },
        { id: 'uppercase', type: 'checkbox', label: 'Hex 使用大写', value: false }
      ],
      tips: [
        'SHA 是单向摘要，不能用来还原原文。',
        'SHA-1 已不推荐用于安全场景，只适合做简单校验。',
        '计算在浏览器本地完成，但 Web Crypto 需要 HTTPS 或 localhost。'
      ],
      transform: hashText
    },
    {
      id: 'uuid',
      name: 'UUID 生成',
      short: '批量生成随机 UUID v4',
      description: '使用安全随机数批量生成 UUID v4，可选大写与去掉连字符。',
      category: 'generate',
      glyph: 'ID',
      keywords: ['uuid', 'guid', '唯一', 'id', '生成器', '随机'],
      tags: ['UUID', '随机', 'ID'],
      inputPlaceholder: '',
      outputPlaceholder: '生成的 UUID 会出现在这里…',
      sample: '',
      showInput: false,
      options: [
        { id: 'count', type: 'number', label: '生成数量', value: 5, min: 1, max: 100, step: 1 },
        { id: 'uppercase', type: 'checkbox', label: '大写', value: false },
        { id: 'hyphens', type: 'checkbox', label: '保留连字符', value: true }
      ],
      tips: [
        'UUID v4 使用密码学安全随机数生成。',
        '标准格式为 8-4-4-4-12 位十六进制字符。',
        '需要重新生成时，点击输出区的「重新生成」。'
      ],
      transform: generateUuid
    },
    {
      id: 'password',
      name: '随机密码',
      short: '可配置字符集的强密码生成器',
      description: '使用安全随机数生成多个强密码，可配置长度、字符集与易混淆字符。',
      category: 'generate',
      glyph: 'PW',
      keywords: ['密码', 'password', '随机', '生成器', '安全', '强度'],
      tags: ['密码', '安全', '随机'],
      inputPlaceholder: '',
      outputPlaceholder: '生成的密码会出现在这里…',
      sample: '',
      showInput: false,
      options: [
        { id: 'length', type: 'number', label: '密码长度', value: 16, min: 4, max: 128, step: 1 },
        { id: 'count', type: 'number', label: '生成数量', value: 5, min: 1, max: 50, step: 1 },
        { id: 'lowercase', type: 'checkbox', label: '小写字母', value: true },
        { id: 'uppercase', type: 'checkbox', label: '大写字母', value: true },
        { id: 'digits', type: 'checkbox', label: '数字', value: true },
        { id: 'symbols', type: 'checkbox', label: '符号', value: true },
        { id: 'excludeAmbiguous', type: 'checkbox', label: '排除易混淆字符', value: true, hint: 'I l 1 O 0 o' }
      ],
      tips: [
        '每个密码都会至少包含一种所选字符集中的字符。',
        '密码只在本页生成，刷新后不会保留。',
        '生成后建议保存到可信的密码管理器中。'
      ],
      transform: generatePasswords
    },
    {
      id: 'random-number',
      name: '随机数',
      short: '指定范围批量生成随机整数',
      description: '在指定范围内批量生成随机整数，支持不重复模式。',
      category: 'generate',
      glyph: 'RND',
      keywords: ['随机数', 'random', 'number', '抽奖', '生成器', '范围'],
      tags: ['随机', '整数', '抽奖'],
      inputPlaceholder: '',
      outputPlaceholder: '随机数会出现在这里…',
      sample: '',
      showInput: false,
      options: [
        { id: 'min', type: 'number', label: '最小值', value: -100, step: 1 },
        { id: 'max', type: 'number', label: '最大值', value: 100, step: 1 },
        { id: 'count', type: 'number', label: '生成数量', value: 10, min: 1, max: 1000, step: 1 },
        { id: 'unique', type: 'checkbox', label: '不重复', value: false }
      ],
      tips: [
        '使用安全随机数，适合抽奖和简单分配。',
        '开启「不重复」时，数量不能超过范围内的整数个数。',
        '包含最小值和最大值。'
      ],
      transform: generateRandomNumbers
    },
    {
      id: 'shuffle',
      name: '随机打乱',
      short: '按行随机重排文本',
      description: '把多行文本随机打乱顺序，适合抽签、随机分组和测试数据重排。',
      category: 'generate',
      glyph: 'SHF',
      keywords: ['打乱', 'shuffle', '随机', '排序', '抽签', '洗牌'],
      tags: ['随机', '洗牌', '抽签'],
      inputPlaceholder: '每行一项，例如参与抽签的名字…',
      outputPlaceholder: '打乱后的顺序…',
      sample: '苹果\n香蕉\n橙子\n葡萄\n西瓜',
      options: [
        { id: 'trim', type: 'checkbox', label: '去除首尾空白', value: true },
        { id: 'skipEmpty', type: 'checkbox', label: '跳过空行', value: true }
      ],
      tips: [
        '每次输入或修改选项都会重新打乱。',
        '需要保持一组结果时，先复制输出。',
        '使用密码学安全随机数，而不是 Math.random。'
      ],
      transform: shuffleLines
    },
    {
      id: 'image-base64',
      name: '图片转 Base64',
      short: '图片 → Data URI / CSS / HTML',
      description: '选择一张本地图片，转换为 Data URI、CSS 背景或 HTML 标签代码。文件不会被上传。',
      category: 'image',
      glyph: 'IMG',
      keywords: ['图片', 'image', 'base64', 'data uri', 'css', 'html', '转换'],
      tags: ['图片', 'Base64', 'Data URI'],
      inputPlaceholder: '',
      outputPlaceholder: '选择图片后生成 Data URI…',
      sample: '',
      showInput: false,
      custom: 'image-base64',
      options: [],
      tips: [
        '文件只由浏览器读取，不会上传到服务器。',
        'Base64 体积通常比原文件大约 33%。',
        '大图片更适合用独立文件或图床，而不是内联 Data URI。'
      ]
    },
    {
      id: 'svg-data-uri',
      name: 'SVG 转 Data URI',
      short: '内联 SVG 代码 → 可直接使用的 URL',
      description: '把 SVG 源码转换成 Data URI、CSS background 或 HTML img 标签，便于内联使用。',
      category: 'image',
      glyph: 'SVG',
      keywords: ['svg', 'data uri', '图片', '内联', 'css', 'html', '编码'],
      tags: ['SVG', 'Data URI', 'CSS'],
      inputPlaceholder: '粘贴 SVG 源码…',
      outputPlaceholder: 'Data URI 或 CSS 代码…',
      sample: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#171a17"/><text x="32" y="42" font-size="30" text-anchor="middle" fill="#ff8456">“”</text></svg>',
      options: [
        {
          id: 'encoding', type: 'segmented', label: '编码方式', value: 'url',
          choices: [{ value: 'url', label: 'URL 编码' }, { value: 'base64', label: 'Base64' }]
        },
        {
          id: 'output', type: 'select', label: '输出形式', value: 'datauri',
          choices: [
            { value: 'datauri', label: 'Data URI' },
            { value: 'css', label: 'CSS background' },
            { value: 'html', label: 'HTML img' }
          ]
        }
      ],
      tips: [
        'URL 编码通常更短，Base64 对复杂字符更稳。',
        '内联 SVG 中如果引用了外部资源，Data URI 之后可能无法加载。',
        '生成的 CSS 可直接作为 background-image 使用。'
      ],
      transform: svgToDataUri
    }
  ];

  return {
    categories: CATEGORIES,
    tools: tools,
    caseLabels: CASE_LABELS
  };
});
