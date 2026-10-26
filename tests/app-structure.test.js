'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8');
const api = require('../assets/tools.js');

const htmlIds = new Set(Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]));
const byIdCalls = new Set(Array.from(app.matchAll(/byId\('([^']+)'\)/g), (match) => match[1]));

test('every static element referenced by app.js exists in index.html', () => {
  for (const id of byIdCalls) {
    assert.ok(htmlIds.has(id), `app.js references missing #${id}`);
  }
});

test('index.html has no duplicate ids', () => {
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), (match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('all asset and page links resolve to existing files', () => {
  const paths = Array.from(html.matchAll(/(?:src|href)="\.\/([^"#?]+)"/g), (match) => match[1]);
  for (const asset of paths) {
    assert.ok(fs.existsSync(path.join(root, asset)), `missing asset: ${asset}`);
  }
});

test('every tool category exists and every category has tools', () => {
  const categories = new Set(api.categories.map((category) => category.id));
  for (const tool of api.tools) {
    assert.ok(categories.has(tool.category), `${tool.id} uses missing category`);
  }
  for (const category of api.categories) {
    assert.ok(api.tools.some((tool) => tool.category === category.id), `${category.id} has no tools`);
  }
});

test('displayed tool count matches the registry', () => {
  assert.match(html, new RegExp('id="toolCount">' + api.tools.length + '<'));
});

test('GitHub Pages workflow publishes the static entry files', () => {
  const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'pages.yml'), 'utf8');
  for (const file of ['index.html', 'assets', '.nojekyll', 'robots.txt']) {
    assert.match(workflow, new RegExp(file.replace('.', '\\.')));
  }
});
