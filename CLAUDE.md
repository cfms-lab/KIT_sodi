# KIT_sodi 작업 메모

## 연구 그래프 노드 좌표

사용자가 `const POS = {...};` 한 줄을 붙여넣고 "재배포"를 요청하는 일이 잦다.
그때는 [docs/graph-positions-runbook.md](docs/graph-positions-runbook.md) 를 따른다.

- 좌표 정본은 `layout_findings.py` 의 `POS` dict 다. `graph.html` 은 생성물이므로
  직접 편집하지 않는다 — `python layout_findings.py` 가 `POS` 와 `CURATED_POSITIONS`
  를 덮어써서 손댄 내용이 조용히 사라진다.
- `scripts/check-graph-html.mjs` 의 `expectedPositions` 는 배포 좌표와 문자열까지
  같아야 하므로 함께 갱신한다.
- 검증은 `pwsh -File scripts/publish-research-views.ps1` (푸시 없이). 이 스크립트의
  `-Push` 는 html 외 파일이 바뀌면 중단하므로, 좌표 작업은 커밋과 `git push origin main`
  을 직접 한다.
