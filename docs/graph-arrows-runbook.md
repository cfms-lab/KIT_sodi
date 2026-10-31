# graph.html 화살표 런북 — 방향 · 투고 의존 선 · 곡률

2026-10-31 에 화살표 규칙이 둘 바뀌었다(커밋 3c20a8a · 9abf26c). 노드 좌표는 [graph-positions-runbook.md](graph-positions-runbook.md),
훌 색은 [coauthor-color-runbook.md](coauthor-color-runbook.md) 다. 여기는 **선**만 다룬다.

## 한 줄 요약

| 규칙 | 뜻 | 어디서 |
|---|---|---|
| 방향 | **먼저 투고하는(한) 편 → 나중 편**. 마인드맵 «관계선 방향 통일»(앞 편 → 뒷 편)과 같다 | `graph.html` `EDGE_DIRECTION_FIXES`(«옛 from, 옛 to», RAW 방향) |
| 투고 의존 선 | 미투고 논문끼리 「X 가 나가야 Y 를 낸다」는 선. 점선·잠정, 범주 통합 | `layout_findings.py` `SUBMIT_DEPENDENCY_EDGES` → `--edges-only` 재생성 |
| 곡률 | 일직선 노드·캡션을 비켜 가는 휨. 화면 방향 «from, to» 가 키 | `graph.html` `EDGE_SMOOTH_OVERRIDES`(직선은 `STRAIGHT_EDGES`) |

순서·의존의 **정본은 볼트**다 — `Dashboards/프로젝트현황.md` 의 `투고순서`(portfolio_rows `order` 로 발행), 각 `Projects/*.md` 의 `next_gate`·
`submission`, `Papers/SFTF_4편_투고순서_2026-09-22.md`. frontmatter `depends_on` 은 **코드·저장소 의존(방향 반대)**이라 쓰지 않는다.

## 1. 방향을 다시 맞출 때 (투고순서가 바뀌었을 때)

1. 비교 규칙: 이미 나간 원고(published·accepted·submitted)는 순서 1. **양끝 모두 순서가 있는 쌍만** 비교한다 — 엔진·미정 노드
   (cfmsDrape·cfmsMiindo·cfmsDrapeInverse·SFTF_ActiveOverprint 등)가 낀 선과 동률은 그대로. 이미 투고된 논문에 닿는 선은 손대지 않는다(사용자).
2. 분석은 10-31 의 스크래치 스크립트 꼴로: `RAW_EDGES` + **큐레이션 배열**(CURATED_GARMENT_EDGES·SFTF_HOLONOMY_EDGES·HIPDETECT_EDGES·
   TOMO_SHELL_EDGES)을 합치고 → `EDGE_DIRECTION_FIXES` 적용 → `EDGE_PRUNE_PAIRS` 제외 → 양끝 order 비교. 큐레이션 배열을 빠뜨리면
   HeatMethod → Holonomy 같은 선을 놓친다(가드는 합쳐서 본다).
3. 뒤집을 쌍을 `EDGE_DIRECTION_FIXES` 에 더한다(재생성 불필요). **같이 고칠 것**: `STRAIGHT_EDGES`·`EDGE_SMOOTH_OVERRIDES`·`EDGE_PRUNE_PAIRS`
   의 그 쌍(화면 방향 키). 곡률은 방향을 뒤집으면서 **CW↔CCW 도 바꾼다** — vis 가 수직이등분선 거울상을 그려 같은 쪽으로 휘고 휨 크기가
   같다(중점은 옮겨진다).
4. 가드 `scripts/check-graph-html.mjs` 가 방향을 고정한 자리를 고친다: 곡률 리터럴 목록, Holonomy 분리선(`holonomyEdges[0].from`),
   SEM 사슬(`expectedSemChain` 첫 선). CRLF 파일이라 node 로 「정확히 한 번」 치환한다.

## 2. 투고 의존 선을 더하거나 걷을 때

1. 근거를 노트에서 찾는다 — `next_gate`·`submission` 의 「선행 조건」·「먼저 나가」·「preprint DOI 뒤」·「accept 뒤」·「A 투고 뒤 B」 문장.
2. `layout_findings.py` `SUBMIT_DEPENDENCY_EDGES` 에 `_submit_dependency_edge(선행, 대기, 라벨, 근거)` 한 줄. 라벨은 캡션이라 짧게.
   선행 편이 나가면 그 선을 실선으로 올리거나(의존 해소) 걷는다.
3. `"$APPDATA/uv/python/cpython-3.13.13-windows-x86_64-none/python.exe" -X utf8 layout_findings.py --edges-only` (좌표·훌 안 건드림, 두 번 돌려 같은 파일인지).
4. 가드의 `expectedSubmitDependencyEdges` 에 같은 쌍·라벨을 적는다. Holonomy·SEM 처럼 **「그 노드에 닿는 선은 하나」**로 세는 가드가
   있으면 필터를 좁힌다.

## 3. 곡률 고르기 (일직선·캡션 관통)

새 선이 다른 노드와 일직선이면 기본 곡선(continuous)이 그 노드를 관통한다. 10-31 의 `measure-cands.js` 꼴로 헤드리스 크롬에서 잰다 —
`tmp/geometry/run_inject.py --src graph.html --inject <js> --pre-id <id> --out <json>` 에 넣는 스크립트가 `edgesDS.update({id, smooth})` 로
후보(CW/CCW × 0.15~0.4)를 바꿔 가며 `edgeType.getPoint(t)` 를 떠서 **다른 노드 중심(−19px)·`network.getBoundingBox` 캡션 상자**까지의
최소 여유와 휨을 적는다. 상자 밖 10px 이상인 가장 작은 roundness 를 고르고, `tmp/geometry/verify.js`(WATCH 바꿔서)로 **캡션이 선 위인지와
교차 수**를 본다 — 교차가 늘면 반대쪽(CW↔CCW)도 재 본다(SFTFSoft → QEM 은 CW 가 점선 교차를 없앴다). 어느 쪽도 못 피하면 배치 문제다
(PartialCost 선의 교차 4) — 사용자가 웹에서 노드를 옮겨 저장하면 풀린다.

## 4. 검증·배포

```bash
node scripts/check-graph-html.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/publish-research-views.ps1   # 푸시 없음
git add graph.html layout_findings.py scripts/check-graph-html.mjs && git commit -m "graph: … (사용자, YYYY-MM-DD)" && git push origin main
```

## 5. 함정

- 기본 continuous 곡선은 출발 노드 쪽에 제어점이 있어 **방향을 뒤집으면 봉우리가 반대 끝으로** 옮겨 보인다(정상).
- 노드 정보의 「차수 (in/out)」는 생성기 RAW 기준이라 화면 방향과 다를 수 있다(전부터 그랬다).
- `EDGE_PRUNE_PAIRS` 는 **점선만** 뺄 수 있고 「노드마다 부모 하나」 가드가 있다. 실선을 화면에서 걷으려면 생성기 `lineage_pairs` 로
  관계째 걷어야 한다 — 그래서 10-31 에는 계보 선을 그대로 두고 의존 선만 더했다(사용자 선택).
- 웹 배치는 사용자가 자주 다시 저장한다(10-31 에만 두 번). 잴 때마다 `graph_positions` 의 `updated_at` 부터 본다.
- 10-31 의 측정 스크립트(`edge-order.mjs`·`measure-cands.js`·`measure-mid.js`)는 세션 스크래치패드에만 있었다. 다시 쓰려면 위 설명대로
  `tmp/geometry/verify.js` 를 본떠 새로 쓴다.
