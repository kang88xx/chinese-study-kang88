const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8').split('/* ===== 초기화 ===== */')[0];
const dataSource = fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8');
// 실제 data.js 의 사본 (테스트마다 새로 만들어 서로의 변경이 섞이지 않게 한다)
const realData = () => JSON.parse(JSON.stringify(
  vm.runInNewContext(`${dataSource}\n;({ PROGRESS, TERMS, CAL, LESSONS, VOCAB })`)));
// 2026년분만 남긴 사본 — 한 해 표기(4월, 11-10)를 확인하는 테스트가 2027년 데이터가 들어와도 깨지지 않게 한다
const data2026 = () => {
  const d = realData();
  d.CAL = d.CAL.filter(m => m.key.startsWith('2026'));
  d.LESSONS = d.LESSONS.filter(l => l.date.startsWith('2026'));
  d.VOCAB = d.VOCAB.filter(v => v[0].startsWith('2026'));
  d.PROGRESS.updated = d.LESSONS[0].date;
  return d;
};
function sample(vocab = [['2026-10-02', '你好', 'nǐ hǎo', '안녕']]) {
  return {
    PROGRESS: { done: 123, total: 230, start: '2026-04-07', end: '2026-12-01', updated: '2026-10-02' },
    TERMS: [{ start: '2026-04-07', end: '2026-12-01', first: 1 }],
    CAL: [], VOCAB: vocab,
    LESSONS: [{ n: 123, date: '2026-10-02', day: '금', theme: '주제', items: [{ zh: '你好', py: 'nǐ hǎo', gr: '문법' }], words: ['你好'] }]
  };
}
function app(data = sample()) {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { hidden: false, dataset: {}, style: {}, value: '', innerHTML: '', textContent: '', attrs: {},
      classList: { toggle() {} }, addEventListener(type, fn) { this[type] = fn; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; },
      focus() { document.activeElement = this; }, querySelector() { return node('heading'); }, querySelectorAll() { return []; }, closest() { return null; } });
    return nodes.get(id);
  };
  const document = { getElementById: node, querySelector: () => node('heading'), querySelectorAll: () => [], addEventListener(type, fn) { this[type] = fn; }, body: { style: {} }, activeElement: null };
  const ctx = vm.createContext({ document, window: { addEventListener() {}, scrollTo() {} }, location: { hash: '' }, requestAnimationFrame() {}, setTimeout, clearTimeout, ...data });
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
  const a = app(); a.run("lessonMonth = '2026-04'; setLessonSearch('nǐ', true)");
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
  const a = app(sample([])); assert.doesNotThrow(() => a.run('quizNext(); quizReveal()'));
  assert.equal(a.node('quiz-next').disabled, true);
});
test('month derives from progress and future month labels exist', () => {
  const a = app(); assert.equal(a.run('CURRENT_MONTH'), '2026-10');
  a.run("lessonMonth = '2026-10'; renderSideStats()");
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
  a.node('cell').dataset = { state: 'att', key: '2026-10', day: '2', n: '123' };
  a.run('CAL.push({ name: "2026년 10월", key: "2026-10" }); lessonMonth = "2026-04"; openDayModal(document.getElementById("cell"))');
  assert.equal(background.every(el => el.inert), true);
  assert.equal(a.node('lesson-modal').hidden, false);
  a.node('modal-link').onclick();
  assert.equal(background.every(el => !el.inert), true);
  assert.equal(a.run('lessonMonth'), 'all');
  assert.equal(a.node('global-search').value, '2026-10-02');
  assert.equal(a.node('lesson-search').value, '2026-10-02');
  assert.match(a.node('lesson-list').innerHTML, /class="lesson"/);
});
test('calendar labels state and date; course note uses the current term', () => {
  const a = app();
  a.run('CAL.push({ name: "2026년 10월", key: "2026-10", blanks: 4, days: 2, att: {2: 123}, abs: [], cancel: [], pp: [], rp: [] }); renderDashboard()');
  assert.match(a.node('cals').innerHTML, /aria-label="2026년 10월 2일 · 출석 · 123회차"/);
  assert.equal(a.node('course-note').textContent,
    '현재 수강권(2026-04-07 시작)의 종료 예정일은 2026-12-01입니다. 휴강·연기하면 그만큼 뒤로 밀리고, 결석은 회차에 포함되지 않습니다.');
});

/* ===== 2026-11 재등록 이후 데이터 형식 회귀 테스트 ===== */
test('progress % is computed from the cumulative number on cards, dashboard and modal', () => {
  const a = app(); a.run('renderLessons(); renderDashboard()');
  assert.match(a.node('lesson-list').innerHTML, /123회 · 53%/);
  assert.equal(a.node('ab-progress').textContent, '123 / 230회 · 53%');

  const data = realData();
  const { done, total } = data.PROGRESS;
  const r = app(data); r.run('renderLessons(); renderDashboard()');
  const list = r.node('lesson-list').innerHTML;
  for (const n of [1, 110, 111]) assert.match(list, new RegExp(`>${n}회 · ${Math.round(n * 100 / total)}%<`));
  assert.equal(r.node('ab-progress').textContent, `${done} / ${total}회 · ${Math.round(done * 100 / total)}%`);
  r.node('cell').dataset = { state: 'att', key: '2026-11', day: '10', n: '111' };
  r.run('openDayModal(document.getElementById("cell"))');
  assert.equal(r.node('modal-eyebrow').textContent, '2026년 11월 10일 · 출석 · 111회차');
  assert.match(r.node('modal-body').innerHTML, new RegExp(`수업 기록일 2026-11-10 \\(화\\) · 진도 ${Math.round(111 * 100 / total)}%`));
});
test('dashboard sentence describes the current term from TERMS', () => {
  const data = realData();
  const term = data.TERMS[data.TERMS.length - 1];
  const a = app(data); a.run('renderDashboard()');
  assert.equal(a.node('course-note').textContent,
    `현재 수강권(${term.start} 시작)의 종료 예정일은 ${term.end}입니다. 휴강·연기하면 그만큼 뒤로 밀리고, 결석은 회차에 포함되지 않습니다.`);
});
test('every term start gets the same 개강 badge, label and month chip', () => {
  const data = data2026();
  const a = app(data); a.run('renderDashboard(); setupLessonControls()');
  const cals = a.node('cals').innerHTML, chips = a.node('month-chips').innerHTML;
  const shown = data.TERMS.filter(t => data.CAL.some(m => m.key === t.start.slice(0, 7)));
  assert.ok(shown.length >= 2, 'both the first course and the re-enrolment start are in the calendar');
  assert.equal((cals.match(/<span class="start-badge">개강<\/span>/g) || []).length, shown.length);
  assert.match(cals, /aria-label="2026년 4월 7일 · 출석 · 1회차 · 개강"/);
  assert.match(cals, /aria-label="2026년 11월 10일 · 출석 · 111회차 · 개강"/);
  for (const t of shown) assert.match(chips, new RegExp(`data-m="${t.start.slice(0, 7)}"[^>]*>[^<]*\\(개강\\)<`));
  assert.match(chips, /data-m="2026-04"[^>]*>4월 \(개강\)</);
  assert.match(chips, /data-m="2026-11"[^>]*>11월 \(개강\)</);
  assert.match(chips, /data-m="2026-05"[^>]*>5월</);
});
test('pinyin search ignores tones, case, spaces, apostrophes and ü/v', () => {
  const a = app(realData());
  for (const q of ['liugan', 'liu gan', 'LiuGan', 'liúgǎn', '流感', '독감']) {
    assert.equal(a.run(`lessonMatches(LESSONS.find(l => l.date === '2026-11-10'), ${JSON.stringify(q)})`), true, q);
  }
  a.run("setLessonSearch('liu gan', true)");
  assert.match(a.node('lesson-list').innerHTML, /<span class="date">11-10 \(화\)<\/span>/);
  assert.match(a.node('lesson-list').innerHTML, /<mark>liúgǎn<\/mark>/);
  a.run("renderVocab('liugan')");
  assert.match(a.node('vocab-body').innerHTML, /<td class="zh" lang="zh-CN">流感<\/td><td class="py"><mark>liúgǎn<\/mark><\/td>/);
  a.run("setLessonSearch('faner', true)"); // fǎn'ér 反而
  assert.match(a.node('lesson-list').innerHTML, /<mark>fǎn&#39;ér<\/mark>/);

  const highlight = a.run('highlight');
  assert.equal(highlight('liú gǎn', 'liugan'), '<mark>liú gǎn</mark>');
  assert.equal(highlight('rúguǒ bú shì liúgǎn dehuà', 'LIU GAN'), 'rúguǒ bú shì <mark>liúgǎn</mark> dehuà');
  assert.equal(highlight('去旅行 qù lǚxíng', 'lvxing'), '去旅行 qù <mark>lǚxíng</mark>');
  assert.equal(highlight('绿色 lǜsè', 'luse'), '绿色 <mark>lǜsè</mark>');
  assert.equal(highlight('lia\u030cng', 'lia'), '<mark>lia\u030c</mark>ng'); // 떨어진 성조 부호도 같은 글자로 표시
});
test('Korean and hanzi queries still match whole syllables and characters', () => {
  const a = app();
  const lesson = "({ date: '2026-10-02', theme: '독감 예방', n: 1, items: [{ zh: '不用担心。', ko: '걱정할 필요 없다' }], words: [] })";
  assert.equal(a.run(`lessonMatches(${lesson}, '독감')`), true);
  assert.equal(a.run(`lessonMatches(${lesson}, '도')`), false, 'a partial syllable must not match 독');
  assert.equal(a.run(`lessonMatches(${lesson}, '担心')`), true);
  const highlight = a.run('highlight');
  assert.equal(highlight('독감이 아니면 걱정 없음', '걱정 없음'), '독감이 아니면 <mark>걱정 없음</mark>');
  assert.equal(highlight('不用担心', '担心'), '不用<mark>担心</mark>');
  assert.equal(a.run('renderVocab("안녕"); document.getElementById("vocab-count").textContent'), '1 / 1개');
});
test('one- or two-letter Latin queries match literally (AI must not match ài, zài, hái)', () => {
  const data = sample([['2026-10-05', '人工智能', 'réngōng zhìnéng', 'AI, 인공지능'], ['2026-10-02', '爱', 'ài', '사랑하다']]);
  data.LESSONS = [
    { n: 2, date: '2026-10-05', day: '월', theme: 'AI 활용', items: [{ zh: '用AI写报告。', ko: 'AI로 보고서를 쓴다' }], words: [] },
    { n: 1, date: '2026-10-02', day: '금', theme: '사랑', items: [{ zh: '我在家。', py: 'wǒ zài jiā. wǒ ài tā. hái hǎo.', ko: '집에 있다' }], words: [] }
  ];
  const a = app(data);
  a.run("setLessonSearch('AI', true)");
  assert.equal(a.node('lesson-count').textContent, '1개 수업');
  assert.match(a.node('lesson-list').innerHTML, /<mark>AI<\/mark> 활용/);
  a.run("renderVocab('ai')");
  assert.equal(a.node('vocab-count').textContent, '1 / 2개');
  assert.equal(a.run('highlight')('wǒ zài jiā', 'ai'), 'wǒ zài jiā');
  assert.equal(a.run("lessonMatches(LESSONS[1], 'zai')"), true, 'three letters and more still ignore tones');
});
test('an exact date query returns only the lesson recorded on that date', () => {
  const data = sample();
  data.LESSONS.unshift({ n: 124, date: '2026-10-05', day: '월', theme: '2026-10-02 수업에 이어', items: [{ zh: '你好', ko: '안녕' }], words: [] });
  const a = app(data);
  a.run("setLessonSearch('2026-10-02', true)");
  assert.equal(a.node('lesson-count').textContent, '1개 수업');
  assert.match(a.node('lesson-list').innerHTML, /<span class="date">10-02 \(금\)<\/span>/);
  assert.doesNotMatch(a.node('lesson-list').innerHTML, /10-05/);
  a.run("setLessonSearch('2026-10', true)"); // 날짜 전체가 아니면 예전처럼 부분 검색
  assert.equal(a.node('lesson-count').textContent, '2개 수업');
});
test('word chips show the headword in bold', () => {
  const data = sample();
  data.LESSONS[0].words = ['决心 juéxīn 결심(하다) [10/29 수업]', '长期/短期 chángqī/duǎnqī 장기/단기'];
  const a = app(data); a.run('renderLessons()');
  for (const html of [a.node('lesson-list').innerHTML, a.run('lessonItemsHtml(LESSONS[0])')]) {
    assert.match(html, /<span><b lang="zh-CN">决心<\/b>juéxīn 결심\(하다\) \[10\/29 수업\]<\/span>/);
    assert.match(html, /<span><b lang="zh-CN">长期\/短期<\/b>chángqī\/duǎnqī 장기\/단기<\/span>/);
  }
});
test('flashcards show every word once per round and never the same word twice in a row', () => {
  const words = ['一', '二', '三'];
  const a = app(sample(words.map((w, i) => ['2026-10-02', w, 'py', `뜻 ${i}`])));
  const seen = [];
  for (let i = 0; i < 300; i++) { a.run('quizNext()'); seen.push(a.node('quiz-word').textContent); }
  for (let i = 0; i < seen.length; i += words.length) {
    assert.deepEqual(seen.slice(i, i + words.length).sort(), [...words].sort(), `round ${i / words.length + 1}`);
  }
  for (let i = 1; i < seen.length; i++) assert.notEqual(seen[i], seen[i - 1], `draw ${i + 1} repeats the previous word`);
  const one = app(); // 단어가 하나뿐이면 같은 단어를 계속 낸다
  assert.doesNotThrow(() => one.run('quizNext(); quizNext(); quizNext()'));
  assert.equal(one.node('quiz-word').textContent, '你好');
});
test('modal grammar chips use the hanzi font and esc() escapes quotes', () => {
  const a = app();
  assert.match(a.run('lessonItemsHtml(LESSONS[0])'), /<span class="gr hanzi">문법<\/span>/);
  assert.equal(a.run('esc')(`<a title="x">it's & co</a>`), '&lt;a title=&quot;x&quot;&gt;it&#39;s &amp; co&lt;/a&gt;');
});
test('single-year data shows short dates; a second year keeps 2026-04 and 2027-04 apart', () => {
  const single = app(data2026());
  single.run('renderVocab()');
  assert.match(single.node('vocab-body').innerHTML, /<td class="date">11-10<\/td><td class="zh" lang="zh-CN">流感<\/td>/);

  const data = realData();
  const april2026 = data.LESSONS.filter(l => l.date.startsWith('2026-04')).length;
  const n = data.PROGRESS.done;
  data.CAL.push(
    { name: '2027년 1월', key: '2027-01', blanks: 5, days: 31, att: { 5: n + 1 }, abs: [], cancel: [], pp: [], rp: [] },
    { name: '2027년 4월', key: '2027-04', blanks: 4, days: 30, att: { 6: n + 2 }, abs: [7], cancel: [], pp: [], rp: [] });
  data.LESSONS.unshift({ date: '2027-04-06', day: '화', n: n + 2, theme: '봄 소풍',
    items: [{ zh: '春天来了。', py: 'chūntiān lái le.', ko: '봄이 왔다.' }], words: ['春天 chūntiān 봄'] });
  data.VOCAB.unshift(['2027-04-06', '春天', 'chūntiān', '봄']);
  data.PROGRESS.updated = '2027-04-06';
  const a = app(data);
  assert.equal(a.run('CURRENT_MONTH'), '2027-04');

  a.run('setupLessonControls()');
  const chips = a.node('month-chips').innerHTML;
  assert.match(chips, /data-m="2026-04"[^>]*>2026년 4월 \(개강\)</);
  assert.match(chips, /data-m="2026-11"[^>]*>2026년 11월 \(개강\)</);
  assert.match(chips, /data-m="2027-04"[^>]*>2027년 4월</);

  a.run('lessonMonth = "2027-04"; renderLessons()');
  assert.equal(a.node('lesson-count').textContent, '1개 수업');
  assert.match(a.node('lesson-list').innerHTML, /2027년 4월 · 수업 1회/);
  assert.match(a.node('side-stats').innerHTML, /2027년 4월</);
  a.run('lessonMonth = "2026-04"; renderLessons()');
  assert.equal(a.node('lesson-count').textContent, `${april2026}개 수업`);
  assert.doesNotMatch(a.node('lesson-list').innerHTML, /봄 소풍|2027/);
  assert.match(a.node('side-stats').innerHTML, /2026년 4월 \(개강\)/);

  a.run('renderVocab()');
  assert.match(a.node('vocab-body').innerHTML, /<td class="date">2027-04-06<\/td>/);
  assert.match(a.node('vocab-body').innerHTML, /<td class="date">2026-11-10<\/td>/);
  a.run('quizIdx = 0; quizReveal()');
  assert.match(a.node('quiz-answer').innerHTML, /\(2027-04-06 수업\)/);

  assert.equal(a.run('dayStatus(new Date(2027, 3, 6))'), 'att');
  assert.equal(a.run('dayStatus(new Date(2027, 3, 7))'), 'abs');
  assert.equal(a.run('dayStatus(new Date(2026, 3, 7))'), 'att');
  assert.equal(a.run('dayStatus(new Date(2026, 3, 28))'), 'abs');
  a.run('renderDashboard()');
  const cals = a.node('cals').innerHTML;
  assert.equal((cals.match(/calwrap current/g) || []).length, 1);
  assert.match(cals, /calwrap current">\s*<h3>2027년 4월/);
  assert.match(cals, new RegExp(`aria-label="2027년 4월 6일 · 출석 · ${n + 2}회차" data-state="att" data-key="2027-04"`));
});
