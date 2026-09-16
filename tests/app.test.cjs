const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8').split('/* ===== 초기화 ===== */')[0];
function app(vocab = [['2026-10-02', '你好', 'nǐ hǎo', '안녕']]) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, dataset: {}, style: {}, value: '', innerHTML: '', textContent: '', attrs: {},
      classList: { toggle() {} }, addEventListener(type, fn) { this[type] = fn; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
      focus() { document.activeElement = this; }, querySelector() { return node('heading'); }, querySelectorAll() { return []; }, closest() { return null; } });
    return nodes.get(id);
  };
  const document = { getElementById: node, querySelector: () => node('heading'), querySelectorAll: () => [], addEventListener(type, fn) { this[type] = fn; }, body: { style: {} }, activeElement: null };
  const ctx = vm.createContext({ document, window: { addEventListener() {}, scrollTo() {} }, location: { hash: '' }, requestAnimationFrame() {}, setTimeout, clearTimeout,
    PROGRESS: { updated: '2026-10-02', end: '2026-12-01' }, CAL: [], VOCAB: vocab,
    LESSONS: [{ n: 123, date: '2026-10-02', day: '금', pct: 75, theme: '주제', items: [{ zh: '你好', py: 'nǐ hǎo', gr: '문법' }], words: ['你好'] }] });
  node("lesson-modal").hidden = true;
  vm.runInContext(source, ctx);
  return { node, document, run: code => vm.runInContext(code, ctx) };
}
test('pinyin and lesson numbers are searchable', () => {
  const a = app();
  assert.equal(a.run("lessonMatches(LESSONS[0], 'nǐ')"), true);
  assert.equal(a.run("lessonMatches(LESSONS[0], '123')"), true);
});
test('whitespace-free vocabulary preserves the entire word', () => {
  const a = app(); a.run('renderLessons()');
  assert.match(a.node('lesson-list').innerHTML, /<b[^>]*>你好<\/b>/);
  assert.match(a.run('lessonItemsHtml(LESSONS[0])'), /<b[^>]*>你好<\/b>/);
});
test('global search resets month and synchronizes both inputs', () => {
  const a = app(); a.run("lessonMonth = '04'; setLessonSearch('nǐ', true)");
  assert.equal(a.run('lessonMonth'), 'all');
  assert.equal(a.node('lesson-search').value, 'nǐ');
  assert.equal(a.node('global-search').value, 'nǐ');
  assert.match(a.node('lesson-list').innerHTML, /<mark>nǐ<\/mark>/);
});
test('empty results have a recovery button', () => {
  const a = app(); a.run("lessonQuery = 'missing'; renderLessons()");
  assert.match(a.node('lesson-list').innerHTML, /data-reset-lessons/);
});
test('quiz reveal toggles while retaining its control', () => {
  const a = app(); a.run('quizNext(); quizReveal()');
  assert.equal(a.node('quiz-reveal').hidden, false);
  assert.equal(a.node('quiz-reveal').attrs['aria-expanded'], 'true');
  a.run('quizReveal()');
  assert.equal(a.node('quiz-answer').hidden, true);
});
test('quiz handles an empty vocabulary', () => {
  const a = app([]); assert.doesNotThrow(() => a.run('quizNext(); quizReveal()'));
  assert.equal(a.node('quiz-next').disabled, true);
});
test('month derives from progress and future month labels exist', () => {
  const a = app(); assert.equal(a.run('CURRENT_MONTH'), '10');
  a.run("lessonMonth = '10'; renderSideStats()");
  assert.match(a.node('side-stats').innerHTML, /10월/);
});
test('routing leaves hidden content and preserves global typing focus', () => {
  const a = app(); a.node('quiz-reveal').focus();
  a.run("location.hash = '#lessons'; route({ type: 'hashchange' })");
  assert.equal(a.node('view-vocab').hidden, true);
  assert.equal(a.document.activeElement, a.node('heading'));
  a.node('global-search').focus(); a.run('route({ type: "hashchange" })');
  assert.equal(a.document.activeElement, a.node('global-search'));
});
test('modal traps both tab boundaries and Escape restores opener', () => {
  const a = app(); const first = a.node('first'), last = a.node('last');
  a.node('lesson-modal').querySelectorAll = () => [first, last];
  a.run('modal.hidden = false; modalOpener = document.getElementById("opener")');
  let prevented = false;
  last.focus(); a.document.keydown({ key: 'Tab', preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(a.document.activeElement, first);
  a.document.keydown({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(a.document.activeElement, last);
  a.document.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(a.node('lesson-modal').hidden, true);
  assert.equal(a.document.activeElement, a.node('opener'));
});
test('hash navigation closes modal without restoring a hidden opener', () => {
  const a = app();
  a.run('modal.hidden = false; modalOpener = document.getElementById("opener"); location.hash = "#vocab"; route({})');
  assert.equal(a.node('lesson-modal').hidden, true);
  assert.equal(a.document.activeElement, a.node('heading'));
});
test('hidden home strip is not measured or rendered', () => {
  const a = app(); a.node('view-home').hidden = true;
  a.run('renderWeekStrip()'); assert.equal(a.node('week-strip').innerHTML, '');
});
test('search recovery clears both fields and returns keyboard focus', () => {
  const a = app(); a.run("setupLessonControls(); setLessonSearch('missing', true)");
  a.node('lesson-list').click({ target: { closest: () => ({}) } });
  assert.equal(a.node('lesson-search').value, '');
  assert.equal(a.node('global-search').value, '');
  assert.equal(a.document.activeElement, a.node('lesson-search'));
  assert.match(a.node('lesson-list').innerHTML, /class="lesson"/);
});
test('calendar modal makes background inert and linked search clears month', () => {
  const a = app(); const background = [a.node('appbar'), a.node('shell')];
  a.document.querySelectorAll = selector => selector === '.appbar, .shell' ? background : [];
  a.node('cell').dataset = { state: 'att', key: '10', day: '2', n: '123' };
  a.run('CAL.push({ name: "2026년 10월", key: "10" }); lessonMonth = "04"; openDayModal(document.getElementById("cell"))');
  assert.equal(background.every(el => el.inert), true);
  assert.equal(a.node('lesson-modal').hidden, false);
  a.node('modal-link').onclick();
  assert.equal(background.every(el => !el.inert), true);
  assert.equal(a.run('lessonMonth'), 'all');
  assert.equal(a.node('global-search').value, '2026-10-02');
  assert.equal(a.node('lesson-search').value, '2026-10-02');
  assert.match(a.node('lesson-list').innerHTML, /class="lesson"/);
});
test('calendar labels state and date; course note uses data end date', () => {
  const a = app();
  a.run('CAL.push({ name: "2026년 10월", key: "10", blanks: 4, days: 2, att: {2: 123}, abs: [], cancel: [], pp: [], rp: [] }); renderDashboard()');
  assert.match(a.node('cals').innerHTML, /aria-label="2026년 10월 2일 · 출석 · 123회차"/);
  assert.match(a.node('course-note').textContent, /2026-12-01/);
});
