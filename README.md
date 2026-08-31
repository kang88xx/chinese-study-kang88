# 电话汉语 학습장 — chinese.study.kang88.io

전화중국어 수업(맛있는 비즈니스 중국어 LEVEL 4) 기록을 모아 보는 정적 사이트.
중국교육센터 일일강사평 메일을 IMAP로 자동 수집한 데이터가 원본입니다.

- **대시보드** — 진도(78/120회), 출석 달력 (2026-04 개강 ~ )
- **수업 기록** — 날짜별 어법·문장 + 한국어 번역, 월 필터·검색
- **단어장** — 누적 130단어, 검색 + 플래시카드 퀴즈
- **교정 노트** — 강사가 바로잡아 준 표현 모음 (✗ → ◯)

## 구조
순수 정적 사이트 (빌드 없음): `index.html` + `styles.css` + `app.js` + `data.js`(수집 데이터).
새 수업이 추가되면 `data.js`의 `PROGRESS` / `CAL` / `LESSONS` / `VOCAB`에 항목을 추가하고 푸시하면 됩니다.

## 배포
GitHub Pages (main 브랜치 루트) + `CNAME`(chinese.study.kang88.io).
DNS: `chinese.study` CNAME → `kang88xx.github.io`
