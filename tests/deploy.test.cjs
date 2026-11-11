// 공개 설정 회귀 검사: 검색엔진 차단(noindex)과 도구 파일의 저장소·배포 제외가 빠지지 않게 한다
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const file = name => path.join(__dirname, '..', name);
const read = name => fs.readFileSync(file(name), 'utf8');
const rules = name => read(name).split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'));

test('index.html asks search engines not to index or follow the site', () => {
  assert.match(read('index.html'), /<meta name="robots" content="noindex, nofollow">/);
});

test('vercel.json only sets headers and sends X-Robots-Tag: noindex on every path', () => {
  const config = JSON.parse(read('vercel.json'));
  assert.deepEqual(Object.keys(config), ['headers'], 'no build settings for a build-less static site');
  const everyPath = config.headers.find(rule => rule.source === '/(.*)');
  assert.ok(everyPath, 'a header rule for every path');
  assert.ok(everyPath.headers.some(h => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)));
});

test('robots.txt, if present, does not block crawling (crawlers must be able to read noindex)', () => {
  if (!fs.existsSync(file('robots.txt'))) return;
  assert.doesNotMatch(read('robots.txt'), /^\s*Disallow:\s*\/\s*$/m);
});

test('tooling and macOS metadata stay out of git and out of the deployment', () => {
  for (const rule of ['.omc/', '.gstack/', '._*']) assert.ok(rules('.gitignore').includes(rule), `.gitignore lacks ${rule}`);
  for (const rule of ['.omc', '.gstack', '._*', 'tests/', 'QA_REPORT.md']) {
    assert.ok(rules('.vercelignore').includes(rule), `.vercelignore lacks ${rule}`);
  }
});
