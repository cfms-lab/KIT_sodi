# graph.html 노드 좌표 재배포 런북

브라우저에서 `graph.html` 노드를 드래그해 배치를 바꾼 뒤 **위치 복사** 버튼으로 얻은
`const POS = {...};` 한 줄을 파일 기본값으로 승격하고 GitHub Pages에 올리는 절차다.

## 정본은 graph.html 이 아니라 layout_findings.py 다

| 파일 | 역할 |
| --- | --- |
| `layout_findings.py` 의 `POS` dict | **좌표 정본.** 여기만 고친다 |
| `graph.html` 의 `const POS` / `const CURATED_POSITIONS` | 생성물. `python layout_findings.py` 가 통째로 덮어쓴다 |
| `scripts/check-graph-html.mjs` 의 `expectedPositions` | 배포 좌표 스냅샷 가드. 병합 결과와 **문자열까지** 같아야 통과 |

`graph.html` 을 손으로 고치면 다음 재생성 때 조용히 사라진다. 2026-09-07 에 실제로
SFTF_Holonomy 의 좌표·등급 행과 품질 보드 날짜가 이렇게 되돌아갔다.

## 절차

1. 붙여넣은 `POS` 의 값을 `layout_findings.py` 의 `POS` dict 에 반영한다.
   키 순서와 주석은 그대로 두고 좌표 값만 교체한다.
   새 노드가 들어 있으면 dict 끝에 추가한다(아래 "새 노드" 참고).
2. 재생성한다. `graph.html` 의 `POS` 와 `CURATED_POSITIONS` 가 함께 갱신된다.

   ```powershell
   .venv\Scripts\python.exe layout_findings.py
   # 또는: uv run python layout_findings.py
   ```

3. `scripts/check-graph-html.mjs` 의 `expectedPositions` 를 재생성된 `graph.html` 의
   `POS` + `CURATED_POSITIONS` **병합 결과**로 교체한다. 키 순서는 `POS` 순서를 따르고,
   `POS` 에 없는 큐레이션 키만 뒤에 붙는다.
4. 검증한다. 볼트 감사 + `graph.html`·`mindmap.html` 구문 + 좌표 가드가 모두 돈다.

   ```powershell
   pwsh -File scripts/publish-research-views.ps1
   ```

   `positions` 가 노드 수와 같으면 통과다: `{"inlineScripts":4,"nodes":37,...,"positions":37,...}`
5. 커밋하고 `main` 에 푸시한다. GitHub Pages 는 `main` 을 그대로 서비스한다.

   ```powershell
   git add graph.html layout_findings.py scripts/check-graph-html.mjs
   git commit -m "graph: redeploy user-adjusted node positions"
   git push origin main
   ```

   4 단계에 `-Push` 를 붙이는 길은 쓸 수 없다. 그 경로는 html 4 개 외의 파일이 바뀌어
   있으면 push 를 중단하는데, 좌표 작업은 `layout_findings.py` 와 검증 스크립트를
   반드시 함께 건드린다.

## 자주 걸리는 함정

- **`CURATED_POSITIONS` 가 `POS` 를 덮는다.** `graph.html` 은
  `Object.assign(POS, CURATED_POSITIONS)` 를 하므로, `graph.html` 의 `POS` 만 고치면
  `cfmsAutoSew`, `cfmsAutoPlace_IJCST`, `cfmsAutoPlace_JCDE`, `cfmsDrapeSCAN`,
  `SFTF_Holonomy` 다섯 개는 옛 자리에 그대로 남는다. 정본(`layout_findings.py`)에서
  고치면 두 상수가 같은 값으로 함께 나가므로 이 함정이 없다.
- **브라우저 저장본이 파일 기본값을 이긴다.** 한 번이라도 노드를 드래그한 브라우저는
  `localStorage` 의 `graphify_graph_positions_v5` 를 우선한다. 새 배치를 보려면 화면의
  **위치 초기화** 를 누른다. 모든 방문자에게 강제하려면 `layout_findings.py` 의
  `POS_STORE_KEY` 버전을 올리면 되지만, 남이 저장해 둔 배치는 버려진다.
- **새 노드**(`RAW_NODES` 밖에 큐레이션으로 덧붙는 노드)는 좌표만으로 끝나지 않는다.
  `layout_findings.py` 의 `POS`, `QUALITY_ROWS`, `curated_position_ids` 세 곳과 품질 보드
  하드코딩 날짜, 그리고 `scripts/check-graph-html.mjs` 의 `expectedVaultGrades` 까지
  맞춰야 재생성 뒤에 살아남는다.
- **재생성은 멱등하다.** 의심스러우면 두 번 돌려 `git diff` 가 그대로인지 본다.

## 참고

- 그래프·마인드맵 운영 경계: [README.md](../README.md) 의 "연구 그래프·마인드맵 운영"
- 볼트와 공개 HTML 의 경계: [graphify-out/README.md](../graphify-out/README.md)
