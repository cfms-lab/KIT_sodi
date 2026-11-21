# KIT_sodi 작업 메모

## 투고·게재 같은 사건을 홈페이지에 반영할 때

[docs/homepage-update-runbook.md](docs/homepage-update-runbook.md) 를 따른다 — 볼트 노트를 먼저
고치고, `tmp/research-outputs-{날짜}-{이름}.sql`(손으로) + `tmp/portfolio-rows-partial.sql`
(`node scripts/publish-portfolio.mjs --sql --only A,B`)를 만들어 **Supabase MCP 의 `execute_sql` 로 직접
보낸다** — 사용자가 승인 창에서 SQL 을 보고 허용한다(2026-10-21~). 보낸 뒤 select 로 확인한다.
전체 판 `tmp/portfolio-rows.sql`(`--sql`, 약 140KB)과 MCP 가 안 붙은 세션은 예전처럼 사용자가 SQL Editor 에서 돌린다.

## 연구 그래프 노드 좌표

2026-09-13 부터 **평소 경로는 웹이다.** 사용자가 `graph.html` 에서 노드를 끌어 놓고
**노드 저장** 을 누르면 좌표가 Supabase `graph_positions` 로 올라가고, 모든 방문자가 그
배치를 본다. 저장소는 건드릴 일이 없다 — 이때는 커밋할 것도, 재배포할 것도 없다.

저장소 쪽 일이 생기는 때는 둘뿐이다.

- **파일 씨앗을 굳힐 때**: `node scripts/pull-graph-positions.mjs` 가 표의 좌표를
  `layout_findings.py` 의 `POS` 로 되받아 재생성·가드 동기화까지 한다. 파일 `POS` 는
  표가 비었거나 오프라인일 때, 그리고 **`graph3d.html` 이 `graph.html` 을 직접 읽을 때**
  쓰이므로 3D 뷰가 옛 배치로 보이면 이걸 돌려 커밋한다.
- **사용자가 `const POS = {...};` 한 줄을 붙여넣을 때**: 예전 경로다. 붙여넣은 좌표를
  파일로 저장한 뒤 `node scripts/apply-graph-positions.mjs <파일>` 하나면 정본 갱신·재생성·
  가드 동기화·검증이 끝난다.

절차와 함정은 [docs/graph-positions-runbook.md](docs/graph-positions-runbook.md) 에 있다.

- 좌표 정본은 `layout_findings.py` 의 `POS` dict 다. `graph.html` 은 생성물이므로
  직접 편집하지 않는다 — `python layout_findings.py` 가 `POS` 와 `CURATED_POSITIONS`
  를 덮어써서 손댄 내용이 조용히 사라진다.
- `scripts/check-graph-html.mjs` 의 `expectedPositions` 는 배포 좌표와 문자열까지
  같아야 하므로 함께 갱신한다.
- 검증은 `pwsh -File scripts/publish-research-views.ps1` (푸시 없이). 이 스크립트의
  `-Push` 는 html 외 파일이 바뀌면 중단하므로, 좌표 작업은 커밋과 `git push origin main`
  을 직접 한다.

## 투고 단계 어휘 · 파이 모양 · 깜빡임 · 투고 사이트

2026-11-21 부터 **`stages.js` 한 곳**이다 — graph·mindmap·portfolio·upjuk 이 `<script src="stages.js">` 로 같이 읽는다.
단계를 더하거나 모양·박자를 바꾸거나 새 저널의 투고 시스템 주소(`SUBMISSION_SITES`)를 더할 때는 이 파일을 고친다(재생성 불필요).
예외: graph3d 가 graph.html 소스를 읽으므로 graph.html 의 `const STAGE_PIE = {…}` 리터럴을 글자까지 같게 고친다 —
`node scripts/check-stages-js.mjs` 가 다르면 멈춘다. portfolio 범례·툴팁 문구는 볼트 「파이단계」(메타 행)이고 볼트 투고셀() 은 따로다.
SFTF 7편 지도(볼트 노트 + artifact)의 파이는 표를 못 읽으므로 `node scripts/sync-sftf-map.mjs` 로 다시 그리고 artifact 에 `stages.js` ·
`tmp/sftf-map/sftf-pies.js` 두 파일을 올린다 — SFTF 일곱 편의 단계 · 등급이 바뀌거나 `stages.js` 파이를 고칠 때(runbook 4. 함정).

## 다크 모드

2026-11-21 부터 index · upjuk · timetable · jobgis · mindmap · graph · portfolio · backup 이 `<head>` 에서 **`theme.js`** 를 읽는다(graph3d 는 뺀다 — 사용자 지시).
18시~6시(방문자 컴퓨터 시계)에는 저절로 어둡고, 체크박스 「다크 모드」로 바꾼 값은 다음 6시 · 18시까지만 간다(localStorage `cfms_theme`, 모든 페이지 · 탭 공용).
기기 설정(prefers-color-scheme)은 따르지 않는다. 어두운 색은 각 페이지 `<style>` 의 `html[data-theme="dark"]` 규칙과 theme.js 의 `--dk-*` 변수이고,
캔버스 · 스크립트가 칠하는 색은 `CFMS_THEME.dark` 를 읽고 `CFMS_THEME.onChange` 로 다시 칠한다. 페이지에 색을 더하거나 새 페이지를 만들면
밝은 화면과 어두운 화면을 둘 다 헤드리스 크롬으로 본다 — 어두운 화면은 넓은 흰 면 · 파스텔 면이 남지 않게, 글자는 4.5:1 이상(본문 7:1)으로.
가드는 `node scripts/check-theme-js.mjs`(검증 스크립트에 들어 있다).

## graph · portfolio 「ToDo」 한 줄

2026-11-21 부터 **볼트가 정본**이다 — 노트 frontmatter `todo:`, 분리 트랙은 대시보드 분리트랙 항목의 `할일:`.
`node scripts/publish-portfolio.mjs --sql --todo-only --only A,B`(또는 투고 반영 때의 `--sql --only` 부분 판)가
Supabase `todo_lines` 로 올리고, `todo.js` 는 그 표를 받아 오는 로더다 — todo.js 를 고치거나 커밋할 일은 없다.
표는 **anon 읽기**라 발행기 `공개금지()` 가 리젝 · 심사 경위 · 이메일 · 주소 같은 낱말을 막는다. 키는 노트 · 트랙 이름
(research_outputs 노드 행 id 와 다르다 — TSE_SEM 트랙 · TSE_TomoSh4/5).

## 새 노드 — 노트의 node_parent

2026-11-21 부터 새 논문 노드는 **볼트 노트에 `node_parent:`(와 graph 훌 `node_hull:`)를 적고 `--sql --only 이름` 으로 보내면** 끝이다.
발행 SQL 이 노드 행을 만들고(부모 칸이 있는 노트만), graph 는 부모 옆에 선 · 훌과 함께, mindmap 은 부모 밑에 로딩 때 붙인다 —
생성기 재생성 · applyXxx 마이그레이션 · 커밋이 필요 없다. 칸이 빈 행(기존 104개)은 아무 일도 없다. mindmap 에서 지운 노드는
문서 `dismissedTableNodes`(그 전 것은 `TABLE_NODE_SEED_DISMISSED`)가 기억한다. 생성기 `HIDDEN_NODE_IDS` 노드에 부모 칸이 있으면
발행기가 멈춘다. 절차는 [docs/homepage-update-runbook.md](docs/homepage-update-runbook.md) ⑤ 「새 노드」, 표 칸은 `schema_node_parent.sql`.

## 예비값 — 표를 못 읽을 때

2026-11-21 부터 graph · mindmap · upjuk · ToDo 줄은 표(Supabase)를 못 읽으면(장애 · 일시 중지 · 10초 응답 없음) **예비값**으로 그린다 —
graph 는 파일에 구운 값, 나머지는 `fallback/*.json`. 예비값은 표에 다시 쓰지 않는다(mindmap 은 읽기 전용, graph 「노드 저장」은 공유 배치를
받기 전에는 멈춘다). 예비값을 지금 표로 굳히는 일은 가끔 `node scripts/bake-fallbacks.mjs`(`--check` 로 먼저 본다) 뒤 `fallback/` 커밋이고,
손으로 고치지 않는다. 화면 시험은 `node scripts/check-offline.mjs`(크롬). 절차는 [docs/homepage-update-runbook.md](docs/homepage-update-runbook.md) ⑥.

## 공저자 색 · 훌(그룹) 재편

upjuk 저자 이름 배경(2026-11-13~, 전에는 행 배경)·portfolio 공저자 이름 배경·graph 훌 면색·mindmap 노드 면색은
**공저자 파스텔 한 벌**이고 네 파일에 따로 박혀 있다. upjuk·portfolio 는 같은 `--au-*` 값과 `.au-name` 을 쓴다.
portfolio 의 `공저자칸()` 은 HTML 이스케이프 뒤 이희란·은종현·김우석 이름만 칠한다. 이름 강조만 고칠 때는
SQL·재생성이 없으며 portfolio 로그인 게이트는 유지한다.
공저자를 넣거나, 훌 색·구성원을 바꾸거나, 마인드맵을 다시 묶을 때는
[docs/coauthor-color-runbook.md](docs/coauthor-color-runbook.md) 를 따른다 — 팔레트 정본은 `layout_findings.py`
`HYPEREDGES` 앞 주석, 마인드맵 재편은 `applyXxx` 마이그레이션(실제 문서로 시뮬레이션한 뒤 커밋).

## graph.html 화살표 (방향 · 투고 의존 선 · 곡률)

화살표는 **먼저 투고하는 편 → 나중 편**이고, 미투고 논문 간 투고 의존은 생성기 `SUBMIT_DEPENDENCY_EDGES`(점선)다.
방향을 다시 맞추거나 의존 선을 더할 때는 [docs/graph-arrows-runbook.md](docs/graph-arrows-runbook.md) 를 따른다 — 정본은 볼트의
투고순서·`next_gate`(frontmatter `depends_on` 은 코드 의존이라 아님), 곡률은 헤드리스 크롬으로 재서 고른다.
