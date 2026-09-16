const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../data.js'), 'utf8');
const { PROGRESS, CAL, LESSONS, VOCAB } = vm.runInNewContext(
  `${source}\n;({ PROGRESS, CAL, LESSONS, VOCAB });`
);
const statuses = ['abs', 'cancel', 'pp', 'rp'];
const year = PROGRESS.start.slice(0, 4);
const calendarDate = (month, day) => `${year}-${month.key}-${String(day).padStart(2, '0')}`;

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

test('course progress has valid dates, bounded counts and a rounded completion percentage', () => {
  for (const key of ['start', 'end', 'updated']) date(PROGRESS[key], `PROGRESS.${key}`);
  assert.ok(PROGRESS.start <= PROGRESS.updated, 'update must not precede the course');
  assert.ok(PROGRESS.start <= PROGRESS.end, 'end must not precede start');
  integer(PROGRESS.total, 1, Number.MAX_SAFE_INTEGER, 'PROGRESS.total');
  integer(PROGRESS.done, 0, PROGRESS.total, 'PROGRESS.done');
  assert.equal(PROGRESS.pct, Math.round(PROGRESS.done * 100 / PROGRESS.total));
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

test('calendar month lengths and leading blanks place days on the correct weekdays', () => {
  const keys = new Set();
  for (const month of CAL) {
    assert.match(month.key, /^(0[1-9]|1[0-2])$/, 'calendar month key');
    assert.ok(!keys.has(month.key), `duplicate calendar month ${month.key}`);
    keys.add(month.key);
    const first = date(calendarDate(month, 1), `${month.key} first day`);
    assert.equal(month.name, `${year}년 ${Number(month.key)}월`);
    assert.equal(month.blanks, first.getUTCDay(), `${month.key} leading blanks`);
    assert.equal(month.days, new Date(Date.UTC(Number(year), Number(month.key), 0)).getUTCDate(),
      `${month.key} day count`);
    if (month.start !== undefined) {
      integer(month.start, 1, month.days, `${month.key} start marker`);
      assert.equal(calendarDate(month, month.start), PROGRESS.start, 'course start marker');
    }
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

test('lesson records provide renderable sentence or correction items and word arrays', () => {
  assert.ok(Array.isArray(LESSONS) && LESSONS.length > 0, 'lessons must be a nonempty array');
  for (const lesson of LESSONS) {
    const label = `lesson ${lesson.n}`;
    text(lesson.theme, `${label} theme`);
    integer(lesson.pct, 0, 100, `${label} percentage`);
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
    lesson.words.forEach((word, i) => text(word, `${label} word ${i + 1}`));
  }
});

test('vocabulary rows contain four text fields and valid source dates through the latest update', () => {
  assert.ok(Array.isArray(VOCAB), 'vocabulary must be an array');
  for (const [i, row] of VOCAB.entries()) {
    const label = `vocabulary row ${i + 1}`;
    assert.ok(Array.isArray(row), label);
    assert.equal(row.length, 4, `${label}: date, Chinese, pinyin, meaning`);
    row.forEach((value, j) => text(value, `${label} field ${j + 1}`));
    assert.match(row[0], /^\d{2}-\d{2}$/, `${label} date format`);
    const recorded = `${year}-${row[0]}`;
    date(recorded, label);
    assert.ok(recorded >= PROGRESS.start && recorded <= PROGRESS.updated,
      `${label}: source date outside recorded course period`);
  }
});
