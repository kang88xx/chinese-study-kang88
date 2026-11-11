const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8');
const { PROGRESS, TERMS, CAL, LESSONS, VOCAB } = vm.runInNewContext(
  `${source}\n;({ PROGRESS, TERMS, CAL, LESSONS, VOCAB });`
);
const statuses = ['abs', 'cancel', 'pp', 'rp'];
const calendarDate = (month, day) => `${month.key}-${String(day).padStart(2, '0')}`;
// 공식 출석일과 누적 회차, 날짜순
const attendanceDays = () => CAL
  .flatMap(month => Object.entries(month.att).map(([day, n]) => ({ date: calendarDate(month, Number(day)), n })))
  .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

function date(value, label) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/, label);
  const parsed = new Date(`${value}T00:00:00Z`);
  assert.ok(Number.isFinite(parsed.getTime()), `${label}: invalid date ${value}`);
  assert.equal(parsed.toISOString().slice(0, 10), value, `${label}: invalid date ${value}`);
  return parsed;
}

function text(value, label) {
  assert.equal(typeof value, 'string', label);
  assert.ok(value.trim().length > 0, `${label}: must not be empty`);
}

function integer(value, minimum, maximum, label) {
  assert.ok(Number.isInteger(value) && value >= minimum && value <= maximum,
    `${label}: expected integer ${minimum}..${maximum}, got ${value}`);
}

test('course progress has valid dates and bounded counts that match the terms', () => {
  for (const key of ['start', 'end', 'updated']) date(PROGRESS[key], `PROGRESS.${key}`);
  assert.ok(PROGRESS.start <= PROGRESS.updated, 'update must not precede the course');
  assert.ok(PROGRESS.start <= PROGRESS.end, 'end must not precede start');
  integer(PROGRESS.total, 1, Number.MAX_SAFE_INTEGER, 'PROGRESS.total');
  integer(PROGRESS.done, 0, PROGRESS.total, 'PROGRESS.done');
  // 화면이 Math.round(n * 100 / total) 로 계산하므로 PROGRESS 에 pct 를 저장하지 않는다
  assert.ok(!('pct' in PROGRESS), 'PROGRESS.pct is computed on screen; do not store it');
  assert.equal(PROGRESS.start, TERMS[0].start, 'course start must be the first term start');
  assert.equal(PROGRESS.end, TERMS[TERMS.length - 1].end, 'course end must be the current term end');
});

test('progress attendance and status totals agree with the calendar', () => {
  assert.ok(Array.isArray(CAL) && CAL.length > 0, 'calendar must contain months');
  const attendance = CAL.reduce((sum, month) => sum + Object.keys(month.att).length, 0);
  assert.equal(PROGRESS.done, attendance, 'completed lessons must equal attended days');
  assert.equal(PROGRESS.att, attendance, 'attendance total must equal attended days');
  for (const status of statuses) {
    integer(PROGRESS[status], 0, Number.MAX_SAFE_INTEGER, `PROGRESS.${status}`);
    assert.equal(PROGRESS[status], CAL.reduce((sum, month) => sum + month[status].length, 0),
      `${status} total must match calendar entries`);
  }
});

test('calendar months are unique YYYY-MM keys in order with names, blanks and lengths of their own year', () => {
  let previous = '';
  for (const month of CAL) {
    assert.match(month.key, /^\d{4}-(0[1-9]|1[0-2])$/, `calendar month key ${month.key}`);
    assert.ok(month.key > previous, `${month.key}: calendar months must be unique and in ascending order`);
    previous = month.key;
    const [year, mon] = month.key.split('-').map(Number);
    assert.equal(month.name, `${year}년 ${mon}월`, `${month.key} name`);
    assert.equal(month.blanks, new Date(Date.UTC(year, mon - 1, 1)).getUTCDay(), `${month.key} leading blanks`);
    assert.equal(month.days, new Date(Date.UTC(year, mon, 0)).getUTCDate(), `${month.key} day count`);
  }
  assert.ok(CAL[0].key <= PROGRESS.start.slice(0, 7), 'calendar must begin by the course start month');
  assert.ok(CAL[CAL.length - 1].key >= PROGRESS.updated.slice(0, 7), 'calendar must reach the latest update month');
});

test('calendar start markers are exactly the term starts', () => {
  const markers = [];
  for (const month of CAL) {
    if (month.start === undefined) continue;
    integer(month.start, 1, month.days, `${month.key} start marker`);
    markers.push(calendarDate(month, month.start));
  }
  const starts = TERMS.map(term => term.start);
  for (const marker of markers) assert.ok(starts.includes(marker), `${marker}: start marker without a TERMS entry`);
  const first = CAL[0].key, last = CAL[CAL.length - 1].key;
  for (const start of starts) {
    if (start.slice(0, 7) < first || start.slice(0, 7) > last) continue;
    assert.ok(markers.includes(start), `${start}: TERMS start without a calendar start marker`);
  }
});

test('terms are ordered and each first number continues the cumulative attendance count', () => {
  assert.ok(Array.isArray(TERMS) && TERMS.length > 0, 'TERMS must list at least one term');
  const days = attendanceDays();
  days.forEach((day, i) => assert.equal(day.n, i + 1, `${day.date}: attendance numbers must count 1, 2, 3 … in date order`));
  TERMS.forEach((term, i) => {
    const label = `TERMS[${i}]`;
    date(term.start, `${label}.start`);
    date(term.end, `${label}.end`);
    assert.ok(term.start <= term.end, `${label}: end must not precede start`);
    integer(term.first, 1, PROGRESS.total, `${label}.first`);
    if (i > 0) assert.ok(TERMS[i - 1].end < term.start, `${label}: terms must be in order and must not overlap`);
    assert.equal(term.first, 1 + days.filter(day => day.date < term.start).length,
      `${label}.first must be 1 + lessons attended before ${term.start}`);
  });
  for (const day of days) {
    assert.ok(TERMS.some(term => term.start <= day.date && day.date <= term.end),
      `${day.date}: attendance outside every term (extend TERMS end after a postponement?)`);
  }
});

test('calendar statuses use valid, distinct days within the recorded course period', () => {
  for (const month of CAL) {
    assert.ok(month.att && typeof month.att === 'object' && !Array.isArray(month.att), `${month.key} attendance map`);
    const occupied = new Set();
    const entries = [['att', Object.keys(month.att).map(Number)]];
    for (const status of statuses) {
      assert.ok(Array.isArray(month[status]), `${month.key}.${status} must be an array`);
      entries.push([status, month[status]]);
    }
    for (const [status, days] of entries) {
      for (const day of days) {
        integer(day, 1, month.days, `${month.key}.${status} day`);
        assert.ok(!occupied.has(day), `${month.key}-${day}: duplicate or conflicting status`);
        occupied.add(day);
        const recorded = calendarDate(month, day);
        date(recorded, `${status} date`);
        assert.ok(recorded >= PROGRESS.start && recorded <= PROGRESS.updated,
          `${recorded}: status must fall between start and latest update`);
      }
    }
  }
});

test('attendance and lesson numbers are unique and join in both directions', () => {
  const attendance = CAL.flatMap(month => Object.values(month.att));
  const lessons = LESSONS.map(lesson => lesson.n);
  for (const [label, numbers] of [['attendance', attendance], ['lessons', lessons]]) {
    for (const n of numbers) integer(n, 1, PROGRESS.total, `${label} lesson number`);
    assert.equal(new Set(numbers).size, numbers.length, `${label} numbers must be unique`);
  }
  // Official attendance dates and teacher-email dates are separate source records.
  assert.deepEqual(Array.from(attendance).sort((a, b) => a - b), Array.from(lessons).sort((a, b) => a - b),
    'every attendance number must have exactly one lesson record');
});

test('no lesson is recorded before the attendance day with the same number', () => {
  const attended = new Map(attendanceDays().map(day => [day.n, day.date]));
  for (const lesson of LESSONS) {
    const day = attended.get(lesson.n);
    assert.ok(day, `lesson ${lesson.n}: no attendance day`);
    assert.ok(lesson.date >= day, `lesson ${lesson.n}: recorded ${lesson.date} before its attendance day ${day}`);
  }
});

test('lesson dates match their weekday and do not exceed the latest update', () => {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  let previous = PROGRESS.updated;
  for (const lesson of LESSONS) {
    assert.equal(lesson.day, weekdays[date(lesson.date, `lesson ${lesson.n}`).getUTCDay()],
      `lesson ${lesson.n}: weekday`);
    assert.ok(lesson.date >= PROGRESS.start && lesson.date <= PROGRESS.updated,
      `lesson ${lesson.n}: source date outside recorded course period`);
    assert.ok(lesson.date <= previous, `lesson ${lesson.n}: records must be newest first`);
    previous = lesson.date;
  }
});

test('lesson records provide renderable items, headword-first words and no stored percentage', () => {
  assert.ok(Array.isArray(LESSONS) && LESSONS.length > 0, 'lessons must be a nonempty array');
  for (const lesson of LESSONS) {
    const label = `lesson ${lesson.n}`;
    text(lesson.theme, `${label} theme`);
    assert.ok(!('pct' in lesson), `${label}: pct is computed on screen, do not store it`);
    assert.ok(Array.isArray(lesson.items) && lesson.items.length > 0, `${label} items`);
    for (const [i, item] of lesson.items.entries()) {
      const itemLabel = `${label} item ${i + 1}`;
      text(item.ko, `${itemLabel} translation`);
      if (item.fix !== undefined) {
        assert.ok(item.fix && typeof item.fix === 'object', `${itemLabel} correction`);
        text(item.fix.bad, `${itemLabel} original`);
        text(item.fix.good, `${itemLabel} corrected`);
      } else {
        text(item.zh, `${itemLabel} Chinese`);
      }
      for (const optional of ['py', 'gr']) {
        if (item[optional] !== undefined) text(item[optional], `${itemLabel} ${optional}`);
      }
    }
    assert.ok(Array.isArray(lesson.words), `${label} words`);
    lesson.words.forEach((word, i) => {
      text(word, `${label} word ${i + 1}`);
      // 화면은 첫 공백 앞을 굵은 표제어로 보여 준다 → 한자 표제어로 시작해야 한다 ("[10/29] 决心 …" 은 안 됨)
      assert.match(word, /^[\u3400-\u9fff]/, `${label} word ${i + 1} must start with its Chinese headword: ${word}`);
    });
  }
});

test('vocabulary rows have four text fields and full dates within the recorded period, newest first', () => {
  assert.ok(Array.isArray(VOCAB), 'vocabulary must be an array');
  let previous = PROGRESS.updated;
  for (const [i, row] of VOCAB.entries()) {
    const label = `vocabulary row ${i + 1}`;
    assert.ok(Array.isArray(row), label);
    assert.equal(row.length, 4, `${label}: date, Chinese, pinyin, meaning`);
    row.forEach((value, j) => text(value, `${label} field ${j + 1}`));
    date(row[0], `${label} date (YYYY-MM-DD)`);
    assert.ok(row[0] >= PROGRESS.start && row[0] <= PROGRESS.updated,
      `${label}: ${row[0]} outside the recorded course period`);
    assert.ok(row[0] <= previous, `${label}: rows must be newest first`);
    previous = row[0];
  }
});
