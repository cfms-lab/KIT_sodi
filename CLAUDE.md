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
