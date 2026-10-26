'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../assets/tools.js');

const tools = api.tools;
const byId = new Map(tools.map((tool) => [tool.id, tool]));

function getTool(id) {
  const tool = byId.get(id);
  assert.ok(tool, `missing tool: ${id}`);
  return tool;
}

function defaults(id) {
  const tool = getTool(id);
  return Object.fromEntries(tool.options.map((option) => [option.id, option.value]));
}

function run(id, input, overrides = {}) {
  return getTool(id).transform(input, { ...defaults(id), ...overrides });
}

function decodeBase64ForTest(value) {
  return Buffer.from(value, 'base64').toString('utf8');
}

test('registry is internally consistent', () => {
  assert.equal(tools.length, 24);
  assert.equal(api.categories.length, 5);
  assert.equal(new Set(tools.map((tool) => tool.id)).size, tools.length);

  const categoryIds = new Set(api.categories.map((category) => category.id));
  for (const tool of tools) {
    assert.ok(categoryIds.has(tool.category), `${tool.id} has unknown category`);
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.short, 'string');
    assert.equal(typeof tool.description, 'string');
    assert.ok(Array.isArray(tool.options));
    assert.ok(Array.isArray(tool.tips));

    const optionIds = new Set();
    for (const option of tool.options) {
      assert.ok(!optionIds.has(option.id), `${tool.id} duplicate option ${option.id}`);
      optionIds.add(option.id);
      assert.ok(['text', 'number', 'checkbox', 'select', 'segmented'].includes(option.type));
      if (option.type === 'select' || option.type === 'segmented') {
        assert.ok(option.choices.some((choice) => choice.value === option.value), `${tool.id}.${option.id} default not in choices`);
      }
    }

    if (tool.custom) {
      assert.equal(tool.id, 'image-base64');
      continue;
    }

    assert.equal(typeof tool.transform, 'function');
    const result = tool.transform(tool.sample, defaults(tool.id));
    const isPromise = result && typeof result.then === 'function';
    assert.ok(isPromise || (result && typeof result.text === 'string'), `${tool.id} transform returned nothing`);
    if (result && typeof result.text === 'string') {
      assert.ok(result.text.length > 0, `${tool.id} sample produced empty output`);
    }
  }
});

/* ------------------------------------------------------------------ */
/* 行转引号                                                           */
/* ------------------------------------------------------------------ */

test('line-quotes: core example matches the requested conversion', () => {
  assert.equal(run('line-quotes', '123\n123').text, "'123',\n'123',");
});

test('line-quotes: comma can be disabled and CRLF is normalized', () => {
  assert.equal(run('line-quotes', 'a\r\nb', { comma: false }).text, "'a'\n'b'");
});

test('line-quotes: trims, skips blank lines and dedupes', () => {
  const result = run('line-quotes', '  a  \n\n b \na\n', { dedupe: true });
  assert.equal(result.text, "'a',\n'b',");
  assert.equal(result.detail, '2 项 · 行尾逗号');
});

test('line-quotes: SQL doubles single quotes by default', () => {
  assert.equal(run('line-quotes', "O'Reilly").text, "'O''Reilly',");
});

test('line-quotes: backslash escaping escapes the backslash first', () => {
  assert.equal(
    run('line-quotes', "O'Reilly\\n", { escape: 'backslash' }).text,
    "'O\\'Reilly\\\\n',"
  );
});

test('line-quotes: can disable escaping and change quote character', () => {
  assert.equal(run('line-quotes', "it's", { escape: 'none' }).text, "'it's',");
  assert.equal(run('line-quotes', 'say "hi"', { quote: '"' }).text, '"say ""hi""",');
});

test('line-quotes: custom quote, prefix and suffix', () => {
  const result = run('line-quotes', 'a\nb', {
    customQuote: '|',
    prefix: 'IN (',
    suffix: ')',
    escape: 'none'
  });
  assert.equal(result.text, 'IN (\n|a|,\n|b|,\n)');
});

test('line-quotes: empty input stays empty', () => {
  assert.equal(run('line-quotes', '', {}).text, '');
  assert.equal(run('line-quotes', '\n\n', {}).text, '');
  assert.equal(run('line-quotes', '', { prefix: 'IN (', suffix: ')' }).text, '');
});

/* ------------------------------------------------------------------ */
/* 列表还原                                                           */
/* ------------------------------------------------------------------ */

test('strip-list: restores a multi-line SQL-style list', () => {
  assert.equal(
    run('strip-list', "'123',\n'456',\n'O''Reilly',").text,
    "123\n456\nO'Reilly"
  );
});

test('strip-list: splits comma-separated values on one line', () => {
  assert.equal(run('strip-list', "'a', 'b', \"c\"").text, 'a\nb\nc');
});

test('strip-list: accepts a JSON string array', () => {
  const result = run('strip-list', '["a","b","c"]');
  assert.equal(result.text, 'a\nb\nc');
  assert.match(result.detail, /JSON/);
});

test('strip-list: removes IN (...) wrapper and trailing semicolon', () => {
  assert.equal(run('strip-list', "IN ('a', 'b', 'c');").text, 'a\nb\nc');
});

test('strip-list: decodes backslash escapes and dedupes', () => {
  assert.equal(
    run('strip-list', "'a\\nb',\n'b',\n'a\\nb',", { dedupe: true }).text,
    'a\nb\nb'
  );
});

test('strip-list: can keep duplicates and intentional empty items', () => {
  const result = run('strip-list', "'a',\n'a',\n''", { dedupe: false, skipEmpty: false });
  assert.equal(result.text, 'a\na\n');
});

/* ------------------------------------------------------------------ */
/* 行号与前后缀                                                       */
/* ------------------------------------------------------------------ */

test('line-prefix: numbers non-empty lines by default', () => {
  assert.equal(
    run('line-prefix', 'one\ntwo\n\nthree').text,
    '1. one\n2. two\n3. three'
  );
});

test('line-prefix: custom start, prefix, suffix and numbering off', () => {
  assert.equal(
    run('line-prefix', 'a\nb', {
      numberLines: false,
      prefix: '- ',
      suffix: ';'
    }).text,
    '- a;\n- b;'
  );

  assert.equal(
    run('line-prefix', 'a\nb', { start: 0, separator: ') ', prefix: '[' , suffix: ']' }).text,
    '[0) a]\n[1) b]'
  );
});

test('line-prefix: can keep blank lines', () => {
  assert.equal(
    run('line-prefix', 'a\n\nb', { skipEmpty: false }).text,
    '1. a\n2. \n3. b'
  );
});

/* ------------------------------------------------------------------ */
/* 去重排序                                                           */
/* ------------------------------------------------------------------ */

test('dedupe-sort: dedupes and sorts naturally', () => {
  assert.equal(
    run('dedupe-sort', 'item10\nitem2\nitem2\nitem1').text,
    'item1\nitem2\nitem10'
  );
});

test('dedupe-sort: ignores case for dedupe', () => {
  assert.equal(
    run('dedupe-sort', 'Apple\napple\nAPPLE', { ignoreCase: true, sort: 'none' }).text,
    'Apple'
  );
});

test('dedupe-sort: supports descending and length ordering', () => {
  assert.equal(run('dedupe-sort', 'a\nccc\nbb', { sort: 'desc' }).text, 'ccc\nbb\na');
  assert.equal(run('dedupe-sort', 'ccc\na\nbb', { sort: 'length-asc' }).text, 'a\nbb\nccc');
  assert.equal(run('dedupe-sort', 'a\nccc\nbb', { sort: 'length-desc' }).text, 'ccc\nbb\na');
});

test('dedupe-sort: trims and removes blank lines', () => {
  assert.equal(run('dedupe-sort', '  b  \n\n a ', { sort: 'asc' }).text, 'a\nb');
});

/* ------------------------------------------------------------------ */
/* 空白清理                                                           */
/* ------------------------------------------------------------------ */

test('whitespace-clean: trims each line by default', () => {
  assert.equal(run('whitespace-clean', '  a  \n\tb\t').text, 'a\nb');
});

test('whitespace-clean: collapses spaces and removes blank lines', () => {
  assert.equal(
    run('whitespace-clean', 'a   b\n\n c  d ', {
      collapseSpaces: true,
      removeBlank: true
    }).text,
    'a b\nc d'
  );
});

test('whitespace-clean: converts tabs with configured width', () => {
  assert.equal(
    run('whitespace-clean', 'a\tb', { tabsToSpaces: true, tabWidth: 2 }).text,
    'a  b'
  );
});

/* ------------------------------------------------------------------ */
/* 查找替换                                                           */
/* ------------------------------------------------------------------ */

test('find-replace: replaces plain text and counts matches', () => {
  const result = run('find-replace', 'Hello world\nHello 行间\nHELLO again');
  assert.equal(result.text, 'Hi world\nHi 行间\nHELLO again');
  assert.match(result.detail, /2/);
});

test('find-replace: case-insensitive mode replaces all variants', () => {
  const result = run('find-replace', 'Hello\nHELLO\nhello', {
    replace: 'Hi',
    caseSensitive: false
  });
  assert.equal(result.text, 'Hi\nHi\nHi');
  assert.match(result.detail, /3/);
});

test('find-replace: regex capture groups work', () => {
  const result = run('find-replace', 'ada@example.com\nlin@test.io', {
    find: '([\\w.]+)@([\\w.]+)',
    replace: '$2@$1',
    regex: true
  });
  assert.equal(result.text, 'example.com@ada\ntest.io@lin');
});

test('find-replace: whole-word matching does not hit substrings', () => {
  const result = run('find-replace', 'cat scatter cat', {
    find: 'cat',
    replace: 'dog',
    wholeWord: true
  });
  assert.equal(result.text, 'dog scatter dog');
});

test('find-replace: multiline anchors work with the multiline flag', () => {
  const result = run('find-replace', 'a1\nb2', {
    find: '^[a-z]',
    replace: '',
    regex: true,
    multiline: true
  });
  assert.equal(result.text, '1\n2');
});

test('find-replace: invalid regex throws a helpful error', () => {
  assert.throws(
    () => run('find-replace', 'abc', { find: '(', regex: true }),
    /正则表达式无效/
  );
});

test('find-replace: empty search term is a no-op', () => {
  const result = run('find-replace', 'abc', { find: '' });
  assert.equal(result.text, 'abc');
  assert.match(result.detail, /填写/);
});

/* ------------------------------------------------------------------ */
/* 命名转换                                                           */
/* ------------------------------------------------------------------ */

test('case-convert: supports the common naming styles', () => {
  assert.equal(run('case-convert', 'user profile', { style: 'camel' }).text, 'userProfile');
  assert.equal(run('case-convert', 'user profile', { style: 'pascal' }).text, 'UserProfile');
  assert.equal(run('case-convert', 'user profile', { style: 'snake' }).text, 'user_profile');
  assert.equal(run('case-convert', 'user profile', { style: 'kebab' }).text, 'user-profile');
  assert.equal(run('case-convert', 'user profile', { style: 'constant' }).text, 'USER_PROFILE');
  assert.equal(run('case-convert', 'user profile', { style: 'dot' }).text, 'user.profile');
  assert.equal(run('case-convert', 'user profile', { style: 'title' }).text, 'User Profile');
  assert.equal(run('case-convert', 'User Profile', { style: 'lower' }).text, 'user profile');
  assert.equal(run('case-convert', 'user profile', { style: 'upper' }).text, 'USER PROFILE');
});

test('case-convert: splits acronyms and separators', () => {
  assert.equal(run('case-convert', 'HTTPResponse').text, 'httpResponse');
  assert.equal(run('case-convert', 'JSONData').text, 'jsonData');
  assert.equal(run('case-convert', 'order_id-2').text, 'orderId2');
});

test('case-convert: keeps blank lines', () => {
  assert.equal(run('case-convert', 'foo bar\n\nbaz_qux').text, 'fooBar\n\nbazQux');
});

/* ------------------------------------------------------------------ */
/* JSON 格式化                                                        */
/* ------------------------------------------------------------------ */

test('json-format: pretty prints with two spaces by default', () => {
  const result = run('json-format', '{"b":2,"a":{"x":1}}');
  assert.equal(result.text, '{\n  "b": 2,\n  "a": {\n    "x": 1\n  }\n}');
  assert.match(result.detail, /对象/);
});

test('json-format: minifies and supports four spaces', () => {
  assert.equal(run('json-format', '{ "a": 1 }', { mode: 'minify' }).text, '{"a":1}');
  assert.equal(run('json-format', '{"a":1}', { indent: '4' }).text, '{\n    "a": 1\n}');
});

test('json-format: sorts keys recursively', () => {
  const result = run('json-format', '{"b":1,"a":{"d":2,"c":3}}', {
    sortKeys: true,
    mode: 'minify'
  });
  assert.equal(result.text, '{"a":{"c":3,"d":2},"b":1}');
});

test('json-format: reports line and column for invalid JSON', () => {
  assert.throws(
    () => run('json-format', '{\n  "a": 1,\n  "b": }'),
    (error) => {
      assert.match(error.message, /JSON 解析失败/);
      assert.match(error.message, /第 3 行/);
      return true;
    }
  );
});

test('json-format: empty input is a no-op', () => {
  assert.equal(run('json-format', '   ').text, '');
});

/* ------------------------------------------------------------------ */
/* CSV 转 JSON                                                        */
/* ------------------------------------------------------------------ */

test('csv-json: converts a header row to objects with inferred types', () => {
  const result = run('csv-json', 'name,score,active\nAda,98,true\nLin,91,false');
  assert.deepEqual(JSON.parse(result.text), [
    { name: 'Ada', score: 98, active: true },
    { name: 'Lin', score: 91, active: false }
  ]);
});

test('csv-json: keeps leading-zero identifiers as strings', () => {
  const result = run('csv-json', 'id,name\n001,Ada');
  assert.deepEqual(JSON.parse(result.text), [{ id: '001', name: 'Ada' }]);
});

test('csv-json: auto-detects tab-delimited input', () => {
  const result = run('csv-json', 'name\tage\nAda\t36\nLin\t29');
  assert.deepEqual(JSON.parse(result.text), [
    { name: 'Ada', age: 36 },
    { name: 'Lin', age: 29 }
  ]);
  assert.match(result.detail, /Tab/);
});

test('csv-json: handles quoted commas and newlines inside fields', () => {
  const result = run('csv-json', 'name,note\n"Ada, A.","line one\nline two"\n"Lin","say ""hi"""');
  assert.deepEqual(JSON.parse(result.text), [
    { name: 'Ada, A.', note: 'line one\nline two' },
    { name: 'Lin', note: 'say "hi"' }
  ]);
});

test('csv-json: can output arrays when there is no header', () => {
  const result = run('csv-json', 'Ada,98\nLin,91', { hasHeader: false });
  assert.deepEqual(JSON.parse(result.text), [['Ada', 98], ['Lin', 91]]);
});

test('csv-json: makes duplicate and empty headers unique', () => {
  const result = run('csv-json', 'name,name,,name\nA,B,C,D');
  assert.deepEqual(JSON.parse(result.text), [{ name: 'A', name_2: 'B', column_3: 'C', name_3: 'D' }]);
});

test('csv-json: supports semicolon delimiter', () => {
  const result = run('csv-json', 'name;score\nAda;98', { delimiter: ';' });
  assert.deepEqual(JSON.parse(result.text), [{ name: 'Ada', score: 98 }]);
});

test('csv-json: unclosed quotes throw', () => {
  assert.throws(() => run('csv-json', 'name,note\nAda,"oops'), /未闭合/);
});

test('csv-json: can disable type inference', () => {
  const result = run('csv-json', 'id,active\n001,true', { inferTypes: false });
  assert.deepEqual(JSON.parse(result.text), [{ id: '001', active: 'true' }]);
});

/* ------------------------------------------------------------------ */
/* JSON 转 CSV                                                        */
/* ------------------------------------------------------------------ */

test('json-csv: converts an object array to CSV', () => {
  const result = run('json-csv', '[{"name":"Ada","score":98},{"name":"Lin","score":91}]');
  assert.equal(result.text, 'name,score\nAda,98\nLin,91');
});

test('json-csv: merges keys from every object', () => {
  const result = run('json-csv', '[{"a":1},{"b":2}]');
  assert.equal(result.text, 'a,b\n1,\n,2');
});

test('json-csv: escapes commas, quotes and newlines', () => {
  const result = run('json-csv', JSON.stringify([{ text: 'a,b', quote: 'say "hi"', line: 'x\ny' }]));
  assert.equal(result.text, 'text,quote,line\n"a,b","say ""hi""","x\ny"');
});

test('json-csv: supports headerless arrays of arrays', () => {
  const result = run('json-csv', '[["a","b"],["c","d"]]');
  assert.equal(result.text, 'a,b\nc,d');
});

test('json-csv: flattens nested objects with dot keys', () => {
  const result = run('json-csv', '[{"id":1,"user":{"name":"Ada","city":"上海"}}]', { flatten: true });
  assert.equal(result.text, 'id,user.name,user.city\n1,Ada,上海');
});

test('json-csv: supports tab delimiter and disabling headers', () => {
  const result = run('json-csv', '[{"a":1,"b":2}]', { delimiter: 'tab', includeHeader: false });
  assert.equal(result.text, '1\t2');
});

test('json-csv: primitive arrays become a value column', () => {
  const result = run('json-csv', '["a","b"]');
  assert.equal(result.text, 'value\na\nb');
});

test('json-csv: rejects non-array JSON', () => {
  assert.throws(() => run('json-csv', '{"a":1}'), /JSON 数组/);
});

/* ------------------------------------------------------------------ */
/* 编码解码                                                           */
/* ------------------------------------------------------------------ */

test('encode-decode: URL component round-trips Chinese', () => {
  const encoded = run('encode-decode', '你好 世界', { codec: 'url' }).text;
  assert.equal(encoded, '%E4%BD%A0%E5%A5%BD%20%E4%B8%96%E7%95%8C');
  assert.equal(
    run('encode-decode', encoded, { codec: 'url', mode: 'decode' }).text,
    '你好 世界'
  );
});

test('encode-decode: Base64 round-trips Unicode', () => {
  const encoded = run('encode-decode', '行间 LineLab', { codec: 'base64' }).text;
  assert.equal(
    run('encode-decode', encoded, { codec: 'base64', mode: 'decode' }).text,
    '行间 LineLab'
  );
});

test('encode-decode: Base64 URL-safe has no padding or plus slash', () => {
  const encoded = run('encode-decode', '??>>中文', { codec: 'base64url' }).text;
  assert.doesNotMatch(encoded, /[+/=]/);
  assert.equal(
    run('encode-decode', encoded, { codec: 'base64url', mode: 'decode' }).text,
    '??>>中文'
  );
});

test('encode-decode: HTML entities round-trip', () => {
  const encoded = run('encode-decode', '<a href="x">A & B</a>', { codec: 'html' }).text;
  assert.equal(encoded, '&lt;a href=&quot;x&quot;&gt;A &amp; B&lt;/a&gt;');
  assert.equal(
    run('encode-decode', encoded, { codec: 'html', mode: 'decode' }).text,
    '<a href="x">A & B</a>'
  );
});

test('encode-decode: Unicode escapes non-ASCII and handles emoji', () => {
  const encoded = run('encode-decode', 'A你😀', { codec: 'unicode' }).text;
  assert.equal(encoded, 'A\\u4F60\\uD83D\\uDE00');
  assert.equal(
    run('encode-decode', encoded, { codec: 'unicode', mode: 'decode' }).text,
    'A你😀'
  );
});

test('encode-decode: Hex UTF-8 round-trips', () => {
  const encoded = run('encode-decode', '行间', { codec: 'hex' }).text;
  assert.equal(encoded, 'E8 A1 8C E9 97 B4');
  assert.equal(run('encode-decode', encoded, { codec: 'hex', mode: 'decode' }).text, '行间');
});

test('encode-decode: JSON string escaping round-trips', () => {
  const encoded = run('encode-decode', 'line "one"\nline\\two', { codec: 'json' }).text;
  assert.equal(encoded, 'line \\"one\\"\\nline\\\\two');
  assert.equal(
    run('encode-decode', encoded, { codec: 'json', mode: 'decode' }).text,
    'line "one"\nline\\two'
  );
});

test('encode-decode: invalid URL encoding throws a friendly error', () => {
  assert.throws(
    () => run('encode-decode', '%E4%ZZ', { codec: 'url', mode: 'decode' }),
    /URL 解码失败/
  );
});

test('encode-decode: invalid Base64 throws', () => {
  assert.throws(
    () => run('encode-decode', 'not base64!', { codec: 'base64', mode: 'decode' }),
    /Base64/
  );
});

/* ------------------------------------------------------------------ */
/* 文本统计                                                           */
/* ------------------------------------------------------------------ */

test('text-stats: reports characters, lines, bytes and frequency', () => {
  const result = run('text-stats', 'hello hello\n你好世界\n\nhello', { topN: 5 });
  assert.match(result.text, /字符（含空白）：/);
  assert.match(result.text, /行数：4/);
  assert.match(result.text, /非空行：3/);
  assert.match(result.text, /段落：2/);
  assert.match(result.text, /高频词/);
  assert.match(result.text, /hello\s+3/);
  assert.match(result.text, /UTF-8 字节/);
});

test('text-stats: can hide the frequency section', () => {
  const result = run('text-stats', 'a b c', { topN: 0 });
  assert.doesNotMatch(result.text, /高频词/);
});

test('text-stats: empty input is a no-op', () => {
  assert.equal(run('text-stats', '').text, '');
});

/* ------------------------------------------------------------------ */
/* 开发工具                                                           */
/* ------------------------------------------------------------------ */

test('timestamp: converts a seconds timestamp into ISO and UTC', () => {
  const result = run('timestamp', '1792987200');
  assert.match(result.text, /2026-10-26T04:00:00\.000Z/);
  assert.match(result.text, /2026-10-26 04:00:00 UTC/);
  assert.match(result.text, /Unix 秒：1792987200/);
  assert.match(result.detail, /秒/);
});

test('timestamp: auto-detects milliseconds and supports explicit units', () => {
  assert.match(run('timestamp', '1792987200000').text, /2026-10-26T04:00:00\.000Z/);
  assert.match(run('timestamp', '1792987200', { unit: 'milliseconds' }).text, /1970-01-21/);
});

test('timestamp: converts a date back to a timestamp', () => {
  const result = run('timestamp', '2026-10-26T04:00:00Z', { direction: 'toTimestamp' });
  assert.match(result.text, /Unix 秒：1792987200/);
  assert.match(result.text, /Unix 毫秒：1792987200000/);
});

test('timestamp: rejects invalid dates', () => {
  assert.throws(() => run('timestamp', 'nope', { direction: 'toTimestamp' }), /无法识别/);
});

test('jwt-decode: decodes header and payload without verifying', () => {
  const result = run('jwt-decode', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSIsInJvbGUiOiJhZG1pbiIsImlhdCI6MTc2MTQzMzIwMH0.demo-signature-not-verified');
  assert.match(result.text, /"alg": "HS256"/);
  assert.match(result.text, /"name": "Ada"/);
  assert.match(result.text, /demo-signature-not-verified/);
  assert.match(result.text, /未验证签名/);
});

test('jwt-decode: rejects malformed tokens', () => {
  assert.throws(() => run('jwt-decode', 'not-a-jwt'), /至少需要/);
});

test('url-parse: parses URL parts and repeated query params', () => {
  const result = run('url-parse', 'https://shop.example.com:8443/products/list?tag=text&tag=data&q=行间#reviews');
  const parsed = JSON.parse(result.text);
  assert.equal(parsed.protocol, 'https:');
  assert.equal(parsed.hostname, 'shop.example.com');
  assert.equal(parsed.port, '8443');
  assert.equal(parsed.pathname, '/products/list');
  assert.deepEqual(parsed.query.tag, ['text', 'data']);
  assert.equal(parsed.query.q, '行间');
  assert.equal(parsed.hash, '#reviews');
});

test('url-parse: assumes https when the protocol is missing', () => {
  const parsed = JSON.parse(run('url-parse', 'example.com/path').text);
  assert.equal(parsed.href, 'https://example.com/path');
});

test('url-parse: rejects an invalid URL when protocol is required', () => {
  assert.throws(() => run('url-parse', 'not a url', { assumeHttps: false }), /URL 解析失败/);
});

test('color-convert: converts hex to rgb/hsl/hsv and css', () => {
  const result = run('color-convert', '#cf5a2c');
  assert.match(result.text, /HEX {4}#CF5A2C/);
  assert.match(result.text, /rgb\(207, 90, 44\)/);
  assert.match(result.text, /hsl\(17, 65%, 49%\)/);
  assert.match(result.text, /--color: #CF5A2C/);
});

test('color-convert: handles rgba, hsl and named colors', () => {
  assert.match(run('color-convert', 'rgba(0, 0, 0, 0.5)').text, /rgba\(0, 0, 0, 0.5\)/);
  assert.match(run('color-convert', 'hsl(0, 100%, 50%)').text, /rgb\(255, 0, 0\)/);
  assert.match(run('color-convert', 'teal').text, /#008080/);
});

test('color-convert: rejects unknown colors', () => {
  assert.throws(() => run('color-convert', 'nope'), /无法识别/);
});

test('regex-test: lists matches with line and column', () => {
  const result = run('regex-test', '行间 LineLab\nhello world\n工具箱 toolbox');
  assert.match(result.text, /匹配到 4 处/);
  assert.match(result.text, /LineLab/);
  assert.match(result.text, /第 1 行/);
  assert.match(result.text, /第 2 行/);
});

test('regex-test: shows capture groups and named groups', () => {
  const result = run('regex-test', 'date: 2026-10-26', {
    pattern: '(?<year>\\d{4})-(\\d{2})-(\\d{2})',
    flags: 'g',
    showGroups: true
  });
  assert.match(result.text, /分组 1："2026"/);
  assert.match(result.text, /命名分组 year："2026"/);
});

test('regex-test: reports no matches and invalid patterns', () => {
  assert.match(run('regex-test', 'abc', { pattern: '\\d+' }).text, /没有匹配/);
  assert.throws(() => run('regex-test', 'abc', { pattern: '(' }), /正则表达式无效/);
});

test('hash: computes SHA-256 asynchronously', async () => {
  const result = await run('hash', 'abc');
  assert.match(result.text, /ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/i);
  assert.match(result.detail, /SHA-256/);
});

test('hash: supports base64 and uppercase hex', async () => {
  const result = await run('hash', 'abc', { format: 'both', uppercase: true });
  assert.match(result.text, /BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD/);
  assert.match(result.text, /Base64/);
});

/* ------------------------------------------------------------------ */
/* 生成器                                                             */
/* ------------------------------------------------------------------ */

test('uuid: generates the requested count with valid v4 format', () => {
  const result = run('uuid', '', { count: 5 });
  const lines = result.text.split('\n');
  assert.equal(lines.length, 5);
  for (const line of lines) {
    assert.match(line, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  }
});

test('uuid: supports uppercase and compact forms', () => {
  const result = run('uuid', '', { count: 2, uppercase: true, hyphens: false });
  const lines = result.text.split('\n');
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.match(line, /^[0-9A-F]{32}$/);
  }
});

test('password: generates the requested length and count', () => {
  const result = run('password', '', { length: 20, count: 3, excludeAmbiguous: false });
  const lines = result.text.split('\n');
  assert.equal(lines.length, 3);
  for (const line of lines) {
    assert.equal(line.length, 20);
    assert.match(line, /^[\x21-\x7e]+$/);
  }
});

test('password: requires at least one character set', () => {
  assert.throws(
    () => run('password', '', { lowercase: false, uppercase: false, digits: false, symbols: false }),
    /至少选择一种/
  );
});

test('random-number: respects range and count', () => {
  const result = run('random-number', '', { min: 1, max: 3, count: 20, unique: false });
  const values = result.text.split('\n').map(Number);
  assert.equal(values.length, 20);
  for (const value of values) assert.ok(value >= 1 && value <= 3);
});

test('random-number: unique mode never repeats', () => {
  const result = run('random-number', '', { min: 1, max: 10, count: 10, unique: true });
  const values = result.text.split('\n');
  assert.equal(new Set(values).size, 10);
});

test('random-number: rejects impossible unique ranges', () => {
  assert.throws(
    () => run('random-number', '', { min: 1, max: 2, count: 5, unique: true }),
    /无法生成/
  );
});

test('shuffle: keeps every line exactly once', () => {
  const input = 'a\nb\nc\nd\ne';
  const result = run('shuffle', input);
  assert.deepEqual(result.text.split('\n').sort(), input.split('\n').sort());
  assert.match(result.detail, /5 行/);
});

test('shuffle: trims and skips empty lines', () => {
  const result = run('shuffle', ' a \n\n b \n');
  assert.deepEqual(result.text.split('\n').sort(), ['a', 'b']);
});

/* ------------------------------------------------------------------ */
/* 图片工具                                                           */
/* ------------------------------------------------------------------ */

test('svg-data-uri: encodes SVG as a URL-encoded data URI', () => {
  const result = run('svg-data-uri', '<svg viewBox="0 0 1 1"></svg>');
  assert.match(result.text, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.match(result.text, /%3Csvg/);
});

test('svg-data-uri: supports base64, CSS and HTML output', () => {
  const base64 = run('svg-data-uri', '<svg></svg>', { encoding: 'base64' });
  assert.match(base64.text, /^data:image\/svg\+xml;base64,/);
  assert.equal(
    decodeBase64ForTest(base64.text.split(',')[1]),
    '<svg></svg>'
  );

  assert.match(run('svg-data-uri', '<svg></svg>', { output: 'css' }).text, /^background-image: url\("data:image\/svg\+xml/);
  assert.match(run('svg-data-uri', '<svg></svg>', { output: 'html' }).text, /^<img src="data:image\/svg\+xml/);
});

test('image-base64 registry entry is a custom tool', () => {
  const tool = getTool('image-base64');
  assert.equal(tool.custom, 'image-base64');
  assert.equal(tool.showInput, false);
  assert.equal(tool.options.length, 0);
});

