/* 电话汉语 학습장 — 렌더링 & 인터랙션 */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ===== 라우팅 (해시 탭) ===== */
const TABS = ["home", "lessons", "vocab", "fix"];
function route() {
  const tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  TABS.forEach(t => {
    document.getElementById("view-" + t).hidden = t !== tab;
    document.querySelectorAll(`.rail a[data-tab="${t}"]`)
      .forEach(a => a.classList.toggle("active", t === tab));
  });
  window.scrollTo({ top: 0 });
}
window.addEventListener("hashchange", route);

/* ===== 대시보드 ===== */
const CURRENT_MONTH = "09"; // 최신 기록 월 (강조 표시)

/* 최신 기록일이 포함된 주(일~토) 스트립 — Meet 날짜 행 스타일 */
function renderWeekStrip() {
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  const [y, m, d] = PROGRESS.updated.split("-").map(Number);
  const anchor = new Date(y, m - 1, d);
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - anchor.getDay());

  document.getElementById("today-title").textContent =
    `${m}월 ${d}일 (${DOW[anchor.getDay()]}) · 최근 수업`;

  let html = "";
  for (let i = 0; i < 7; i++) {
    const cur = new Date(sunday);
    cur.setDate(sunday.getDate() + i);
    const key = String(cur.getMonth() + 1).padStart(2, "0");
    const day = cur.getDate();
    const mo = CAL.find(c => c.key === key);
    let cls = "wd";
    if (mo) {
      if (mo.att[day] !== undefined) cls += " att";
      else if (mo.abs.includes(day)) cls += " abs";
      else if (mo.cancel.includes(day)) cls += " cancel";
      else if (mo.pp.includes(day)) cls += " pp";
      else if (mo.rp.includes(day)) cls += " rp";
    }
    if (cur.getTime() === anchor.getTime()) cls += " today";
    html += `<div class="${cls}"><span>${DOW[i]}</span><span class="n">${day}</span></div>`;
  }
  document.getElementById("week-strip").innerHTML = html;
}

function renderDashboard() {
  document.getElementById("ab-progress").textContent = `${PROGRESS.done} / ${PROGRESS.total}회 · ${PROGRESS.pct}%`;
  document.getElementById("ab-updated").textContent = `수강기간 ${PROGRESS.start} ~ ${PROGRESS.end}`;
  document.getElementById("footer-updated").textContent = "마지막 갱신: " + PROGRESS.updated;
  renderWeekStrip();

  const fixCount = LESSONS.reduce((a, l) => a + l.items.filter(i => i.fix).length, 0);
  const remain = PROGRESS.total - PROGRESS.done;

  // --- 진도 링 (SVG 도넛) + 벤토 타일 ---
  const R = 82, C = 2 * Math.PI * R;
  const off = C * (1 - PROGRESS.pct / 100);
  const ring = `
    <div class="bento-ring">
      <div class="ring">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <circle class="ring-track" cx="100" cy="100" r="${R}"></circle>
          <circle class="ring-fill" cx="100" cy="100" r="${R}"
            stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}"
            data-off="${off.toFixed(1)}" transform="rotate(-90 100 100)"></circle>
        </svg>
        <div class="ring-center">
          <b>${PROGRESS.done}</b><span>/ ${PROGRESS.total}회</span><em>${PROGRESS.pct}%</em>
        </div>
      </div>
      <div class="bento-ring-meta">
        <p class="bento-ring-title">전체 진도</p>
        <p class="bento-ring-sub">남은 수업 <b>${remain}회</b> · 출석 <b>${PROGRESS.att}회</b>가 곧 진도</p>
      </div>
    </div>`;

  const tiles = [
    { cls: "t-att wide", v: PROGRESS.att, u: "회", label: "출석", sub: `전체 ${PROGRESS.total}회 중`, accent: "att" },
    { cls: "t-abs", v: PROGRESS.abs, u: "일", label: "결석", accent: "abs" },
    { cls: "t-pp", v: PROGRESS.pp + PROGRESS.rp, u: "일", label: "연기", accent: "pp" },
    { cls: "t-cancel", v: PROGRESS.cancel, u: "일", label: "휴강", accent: "cancel" },
    { cls: "t-vocab wide", v: VOCAB.length, u: "개", label: "누적 단어", sub: `${CAL.length}개월간 수집`, accent: "vocab" },
    { cls: "t-fix", v: fixCount, u: "건", label: "교정받은 표현", accent: "fix" }
  ];
  const tileHtml = tiles.map(t => `
    <div class="tile ${t.cls}">
      <span class="tile-val"><b>${t.v}</b>${t.u}</span>
      <span class="tile-label">${esc(t.label)}</span>
      ${t.sub ? `<span class="tile-sub">${esc(t.sub)}</span>` : ""}
    </div>`).join("");

  document.getElementById("bento").innerHTML = ring + tileHtml;
  // 링 애니메이션
  requestAnimationFrame(() => {
    const f = document.querySelector(".ring-fill");
    if (f) requestAnimationFrame(() => { f.style.strokeDashoffset = f.dataset.off; });
  });

  // --- 출석 달력 ---
  const DOW = ["일", "월", "화", "수", "목", "금", "토"];
  document.getElementById("cals").innerHTML = CAL.map(mo => {
    const attN = Object.keys(mo.att).length;
    const cur = mo.key === CURRENT_MONTH ? " current" : "";
    let cells = DOW.map((d, i) => `<div class="dow${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${d}</div>`).join("");
    cells += `<div class="day empty"></div>`.repeat(mo.blanks);
    for (let d = 1; d <= mo.days; d++) {
      const wd = (mo.blanks + d - 1) % 7;
      const dcls = wd === 0 ? "d sun" : wd === 6 ? "d sat" : "d";
      let cls = "day", tag = "";
      if (mo.att[d] !== undefined) { cls += " att"; tag = `<span class="tag">${mo.att[d]}회</span>`; }
      else if (mo.abs.includes(d)) { cls += " abs"; tag = `<span class="tag">결석</span>`; }
      else if (mo.cancel.includes(d)) { cls += " cancel"; tag = `<span class="tag">휴강</span>`; }
      else if (mo.pp.includes(d)) { cls += " pp"; tag = `<span class="tag">연기</span>`; }
      else if (mo.rp.includes(d)) { cls += " rp"; tag = `<span class="tag">연기</span>`; }
      const startMark = mo.start === d ? `<span class="start-badge">개강</span>` : "";
      cells += `<div class="${cls}"><span class="${dcls}">${d}</span>${startMark}${tag}</div>`;
    }
    // 월 요약 칩
    const miss = mo.abs.length, pp = mo.pp.length + mo.rp.length, cxl = mo.cancel.length;
    const chips = [
      `<span class="mc mc-att">출석 ${attN}</span>`,
      miss ? `<span class="mc mc-abs">결석 ${miss}</span>` : "",
      pp ? `<span class="mc mc-pp">연기 ${pp}</span>` : "",
      cxl ? `<span class="mc mc-cancel">휴강 ${cxl}</span>` : ""
    ].join("");
    return `<div class="calwrap${cur}">
      <h3>${esc(mo.name)}${cur ? `<span class="now-badge">최신</span>` : ""}</h3>
      <div class="mchips">${chips}</div>
      <div class="cal">${cells}</div></div>`;
  }).join("");
}

/* ===== 수업 기록 ===== */
const MONTH_NAMES = { "04": "4월 (개강)", "05": "5월", "06": "6월", "07": "7월", "08": "8월", "09": "9월" };
let lessonMonth = "all";
let lessonQuery = "";

function highlight(text, q) {
  if (!q) return esc(text);
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(text);
  return esc(text.slice(0, i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length));
}

function lessonMatches(l, q) {
  if (!q) return true;
  const hay = [l.date, l.theme, ...l.items.flatMap(i => [i.zh || "", i.ko || "", i.gr || "", i.fix ? i.fix.bad + i.fix.good : ""]), ...l.words];
  return hay.some(s => s.toLowerCase().includes(q.toLowerCase()));
}

function renderLessons() {
  const q = lessonQuery.trim();
  const list = LESSONS.filter(l =>
    (lessonMonth === "all" || l.date.slice(5, 7) === lessonMonth) && lessonMatches(l, q)
  );
  document.getElementById("lesson-count").textContent =
    list.length ? `${list.length}개 수업` : "검색 결과가 없습니다";

  let html = "", curMonth = "";
  list.forEach(l => {
    const mon = l.date.slice(0, 7);
    if (mon !== curMonth) {
      curMonth = mon;
      const mm = l.date.slice(5, 7);
      const monthLessons = LESSONS.filter(x => x.date.slice(0, 7) === mon).length;
      html += `<p class="month-head">${mon.slice(0, 4)}년 ${Number(mm)}월 · 수업 ${monthLessons}회</p>`;
    }
    const open = q || list.length <= 3 ? " open" : "";
    const items = l.items.map(it => {
      let s = `<div class="sent">`;
      if (it.gr) s += `<span class="gr hanzi">${esc(it.gr)}</span>`;
      if (it.fix) {
        s += `<span class="zh"><span class="bad">${highlight(it.fix.bad, q)}</span> → <span class="good">${highlight(it.fix.good, q)}</span></span>`;
      } else if (it.zh && it.zh !== "—") {
        s += `<span class="zh">${highlight(it.zh, q)}</span>`;
      }
      if (it.py) s += `<span class="py">${esc(it.py)}</span>`;
      if (it.ko) s += `<span class="ko">${highlight(it.ko, q)}</span>`;
      return s + `</div>`;
    }).join("");
    const words = l.words.length
      ? `<div class="words">${l.words.map(w => {
          const sp = w.indexOf(" ");
          return `<span><b>${highlight(w.slice(0, sp), q)}</b>${highlight(w.slice(sp + 1), q)}</span>`;
        }).join("")}</div>`
      : "";
    const fixN = l.items.filter(i => i.fix).length;
    const badge = fixN ? `<span class="fix-badge">교정 ${fixN}</span>` : "";
    html += `<details class="lesson"${open}>
      <summary><span class="date">${l.date.slice(5)} (${l.day})</span><span class="cnt">${l.n}회 · ${l.pct}%</span><span class="theme">${esc(l.theme)}</span>${badge}</summary>
      <div class="lbody">${items}${words}</div>
    </details>`;
  });
  document.getElementById("lesson-list").innerHTML = html;
  renderSideStats();
}

function renderSideStats() {
  const scope = lessonMonth === "all"
    ? LESSONS
    : LESSONS.filter(l => l.date.slice(5, 7) === lessonMonth);
  const lessons = scope.length;
  const fixes = scope.reduce((a, l) => a + l.items.filter(i => i.fix).length, 0);
  const words = scope.reduce((a, l) => a + l.words.length, 0);
  const title = lessonMonth === "all" ? "전체 기간" : MONTH_NAMES[lessonMonth];
  const rows = [["수업", lessons + "회"], ["단어", words + "개"], ["교정", fixes + "건"]];
  document.getElementById("side-stats").innerHTML =
    `<p class="side-stats-title">${esc(title)}</p>` +
    rows.map(([k, v]) => `<div class="side-stat"><span>${k}</span><b>${v}</b></div>`).join("");
}

function setupLessonControls() {
  const months = ["all", ...CAL.map(m => m.key)];
  document.getElementById("month-chips").innerHTML = months.map(m =>
    `<button data-m="${m}" class="${m === "all" ? "active" : ""}">${m === "all" ? "전체" : MONTH_NAMES[m]}</button>`
  ).join("");
  document.getElementById("month-chips").addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    lessonMonth = b.dataset.m;
    document.querySelectorAll("#month-chips button").forEach(x => x.classList.toggle("active", x === b));
    renderLessons();
  });
  document.getElementById("lesson-search").addEventListener("input", e => {
    lessonQuery = e.target.value;
    renderLessons();
  });
}

/* ===== 단어장 ===== */
function renderVocab(q = "") {
  const list = VOCAB.filter(v => !q || v.some(s => s.toLowerCase().includes(q.toLowerCase())));
  document.getElementById("vocab-count").textContent = `${list.length} / ${VOCAB.length}개`;
  document.getElementById("vocab-body").innerHTML = list.map(v =>
    `<tr><td class="date">${esc(v[0])}</td><td class="zh">${highlight(v[1], q)}</td><td class="py">${highlight(v[2], q)}</td><td>${highlight(v[3], q)}</td></tr>`
  ).join("");
}

/* 플래시카드 */
document.getElementById("quiz-total").textContent = VOCAB.length;
let quizIdx = -1;
function quizNext() {
  let i;
  do { i = Math.floor(Math.random() * VOCAB.length); } while (i === quizIdx && VOCAB.length > 1);
  quizIdx = i;
  document.getElementById("quiz-word").textContent = VOCAB[i][1];
  const ans = document.getElementById("quiz-answer");
  ans.hidden = true;
  ans.innerHTML = "";
  document.getElementById("quiz-reveal").hidden = false;
}
function quizReveal() {
  if (quizIdx < 0) return;
  const v = VOCAB[quizIdx];
  const ans = document.getElementById("quiz-answer");
  ans.innerHTML = `<span class="py">${esc(v[2])}</span><span class="ko">${esc(v[3])}</span><span class="src">(${esc(v[0])} 수업)</span>`;
  ans.hidden = false;
  document.getElementById("quiz-reveal").hidden = true;
}

/* ===== 교정 노트 ===== */
function renderFixes() {
  const fixes = [];
  LESSONS.forEach(l => l.items.forEach(it => {
    if (it.fix) fixes.push({ date: l.date, n: l.n, bad: it.fix.bad, good: it.fix.good, why: it.ko || "" });
  }));
  document.getElementById("fix-list").innerHTML = fixes.map(f =>
    `<div class="fix-item">
      <div class="pair"><span class="bad">${esc(f.bad)}</span><span class="arrow">→</span><span class="good">${esc(f.good)}</span></div>
      <div class="why">${esc(f.why)}</div>
      <div class="src">${esc(f.date)} · ${f.n}회 수업</div>
    </div>`
  ).join("");
}

/* ===== 초기화 ===== */
renderDashboard();
setupLessonControls();
renderLessons();
renderVocab();
renderFixes();
quizNext();
document.getElementById("quiz-reveal").addEventListener("click", quizReveal);
document.getElementById("quiz-word").addEventListener("click", quizReveal);
document.getElementById("quiz-next").addEventListener("click", quizNext);
document.getElementById("vocab-search").addEventListener("input", e => renderVocab(e.target.value.trim()));
document.getElementById("global-search").addEventListener("input", e => {
  lessonQuery = e.target.value;
  document.getElementById("lesson-search").value = lessonQuery;
  if (lessonQuery && location.hash !== "#lessons") location.hash = "#lessons";
  renderLessons();
});
route();
