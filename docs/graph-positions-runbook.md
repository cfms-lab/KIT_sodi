# graph.html 노드 좌표 재배포 런북

## 평소에는 이 문서가 필요 없다 (2026-09-13)

노드를 끌어 놓고 **노드 저장** 을 누르면 끝이다. 좌표가 Supabase `graph_positions` 로
올라가고, 다음 방문자부터 모두 그 배치를 본다. 저장소를 건드리지 않으므로 커밋도 배포도
없다. 저장은 로그인한 사용자만 할 수 있고(다른 랩 웹앱과 같은 계정), 열람은 누구나 한다.

우선순위는 **내 미저장 드래그(localStorage) > 표의 공유 좌표 > 파일의 `POS`** 다.
저장하는 순간 로컬 스크래치는 버려진다 — 「내 화면만 다른」 상태를 남기지 않기 위해서다.
**위치 초기화** 는 이제 공유 배치로 돌아간다(표가 비어 있으면 파일의 `POS` 로).

표가 없거나 오프라인이면 페이지는 조용히 파일의 `POS` 로 그린다. 그래서 파일 값도 죽은
값이 아니라 **씨앗**이다.

### 그래도 파일을 만져야 하는 두 경우

- **3D 뷰어가 옛 배치를 보인다.** `graph3d.html` 은 표가 아니라 `graph.html` 파일을 직접
  읽는다. 웹 저장은 그 파일을 바꾸지 않으므로, 3D 를 맞추려면 아래 `pull` 을 돌려 커밋한다.
- **오프라인 사본·백업의 기본 배치를 지금 배치로 굳히고 싶다.**

```powershell
node scripts/pull-graph-positions.mjs            # 표 → layout_findings.py → graph.html → 가드
node scripts/pull-graph-positions.mjs --dry-run  # 무엇이 움직이는지만
```

`pull` 은 아래 「한 줄로 하기」와 같은 일을 하되, 붙여넣기 대신 표에서 좌표를 가져온다.
처음 한 번은 `schema_graph_positions.sql` 을 Supabase SQL Editor 에서 돌려 표를 만들고,
`node scripts/pull-graph-positions.mjs --seed` 로 만든 SQL 을 붙여넣어 지금 배치를 채운다.

## 붙여넣은 POS 한 줄로 하기 (예전 경로)

아래는 **위치 복사** 버튼으로 얻은 `const POS = {...};` 한 줄을 파일 기본값으로 승격하는
절차다. 웹 저장이 생긴 뒤로는 잘 쓰지 않지만, 표 없이 파일만 고칠 때는 여전히 이 길이다.

```powershell
Get-Clipboard | node scripts/apply-graph-positions.mjs
pwsh -File scripts/publish-research-views.ps1
git add graph.html layout_findings.py scripts/check-graph-html.mjs
git commit -m "graph: redeploy user-adjusted node positions"
git push origin main
```

클립보드 대신 파일로 넘겨도 된다: `node scripts/apply-graph-positions.mjs pasted.txt`.
`--dry-run` 을 붙이면 어떤 노드가 어디로 움직이는지만 찍고 파일은 건드리지 않는다.

스크립트는 붙여넣은 좌표에 노드가 빠져 있거나 모르는 노드가 섞여 있으면 아무것도
쓰지 않고 멈춘다. 새 노드는 좌표만으로 끝나지 않기 때문이다(아래 "새 노드" 참고).

## 정본은 graph.html 이 아니라 layout_findings.py 다

| 파일 | 역할 |
| --- | --- |
| `layout_findings.py` 의 `POS` dict | **좌표 정본.** 여기만 고친다 |
| `graph.html` 의 `const POS` / `const CURATED_POSITIONS` | 생성물. `python layout_findings.py` 가 통째로 덮어쓴다 |
| `scripts/check-graph-html.mjs` 의 `expectedPositions` | 배포 좌표 스냅샷 가드. 병합 결과와 **문자열까지** 같아야 통과 |

`graph.html` 을 손으로 고치면 다음 재생성 때 조용히 사라진다. 2026-09-07 에 실제로
SFTF_Holonomy 의 좌표·등급 행과 품질 보드 날짜가 이렇게 되돌아갔다.

## 스크립트가 하는 일 (손으로 할 때의 절차)

1. 붙여넣은 `POS` 의 값을 `layout_findings.py` 의 `POS` dict 에 반영한다.
   키 순서와 주석은 그대로 두고 좌표 값만 교체한다.
2. 재생성한다. `graph.html` 의 `POS` 와 `CURATED_POSITIONS` 가 함께 갱신된다.

   ```powershell
   .venv\Scripts\python.exe layout_findings.py
   # 또는: uv run python layout_findings.py
   ```

3. `scripts/check-graph-html.mjs` 의 `expectedPositions` 를 재생성된 `graph.html` 의
   `POS` + `CURATED_POSITIONS` **병합 결과**로 교체한다. 키 순서는 `POS` 순서를 따르고,
   `POS` 에 없는 큐레이션 키만 뒤에 붙는다.
4. `node scripts/check-graph-html.mjs` 와 `node scripts/check-mindmap-html.mjs` 로 검증한다.
   `positions` 가 노드 수와 같으면 통과다: `{"inlineScripts":4,"nodes":37,...,"positions":37,...}`

그다음 `pwsh -File scripts/publish-research-views.ps1` 로 볼트 감사까지 포함한 전체 검증을
돌리고, 커밋해서 `main` 에 푸시한다. GitHub Pages 는 `main` 을 그대로 서비스한다.

검증 스크립트에 `-Push` 를 붙이는 길은 쓸 수 없다. 그 경로는 html 4 개 외의 파일이
바뀌어 있으면 push 를 중단하는데, 좌표 작업은 `layout_findings.py` 와 검증 스크립트를
반드시 함께 건드린다.

## 자주 걸리는 함정

- **`CURATED_POSITIONS` 가 `POS` 를 덮는다.** `graph.html` 은
  `Object.assign(POS, CURATED_POSITIONS)` 를 하므로, `graph.html` 의 `POS` 만 고치면
  `cfmsAutoSew`, `cfmsAutoPlace_IJCST`, `cfmsAutoPlace_JCDE`, `cfmsDrapeSCAN`,
  `SFTF_Holonomy` 다섯 개는 옛 자리에 그대로 남는다. 정본(`layout_findings.py`)에서
  고치면 두 상수가 같은 값으로 함께 나가므로 이 함정이 없다.
- **`graph.html` 의 앵커 문자열을 고치면 재생성이 멈춘다.** `layout_findings.py` 는
  스크립트 경계 주석이나 함수 선언 같은 고정 문자열을 앵커로 잡아 그 앞뒤에 블록을
  끼워 넣는다(`grep -n "anchor" layout_findings.py`). `graph.html` 에서 그 문장을
  손보면 다음 재생성이 `AssertionError: ... anchor not found` 로 죽으므로
  `layout_findings.py` 의 앵커도 같은 커밋에서 함께 고친다. 2026-09-12 에 Supabase
  주석을 `project_nodes` → `research_outputs, kind='node'` 로 바꾸면서 실제로 이렇게
  멈췄고, 다음 좌표 작업 때야 드러났다.
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
