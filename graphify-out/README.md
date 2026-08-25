# KIT_sodi 그래프 운영 경계

이 디렉터리는 `KIT_sodi`가 Graphify 기반 연구 그래프의 **운영 주체**임을 표시하는 문서 위치다.
그래프 산출물을 이 안에 한 벌 더 만들지 않는다.

## 정본과 입력

- 공개 정본: 저장소 루트의 `graph.html`, `mindmap.html`, `graph3d.html`
- 연구 입력: `D:\cfms-research-vault\Projects\*.md`와 필요한 볼트 노트
- 볼트 고유 그래프: Obsidian 자체 그래프와 `vault-graph.json`
- 공개 저장소: <https://github.com/cfms-lab/KIT_sodi>
- 공개 페이지: <https://cfms-lab.github.io/KIT_sodi/graph.html>, <https://cfms-lab.github.io/KIT_sodi/mindmap.html>

볼트 루트에는 별도의 `graphify-out/`을 두지 않는다. 연차별 연구노트나 다른 프로젝트 안의
`graphify-out/`은 각각의 독립 분석 산출물이므로 이 규칙의 삭제 대상이 아니다.

## 갱신 순서

저장소 루트에서 다음을 실행한다.

```powershell
node scripts/audit-vault-projects.mjs D:\cfms-research-vault
pwsh -File scripts/publish-research-views.ps1 -VaultPath D:\cfms-research-vault
```

첫 명령은 볼트 `Projects` 노트와 두 공개 HTML의 포함 여부를 읽기 전용으로 비교한다.
둘째 명령은 HTML 구문과 Git 충돌 마커를 검사한다. 검증된 변경을 `origin/main`에 올릴
때만 `-Push`를 추가한다.

```powershell
pwsh -File scripts/publish-research-views.ps1 -VaultPath D:\cfms-research-vault -Push
```

`mindmap.html`의 실제 노드 데이터 정본은 Supabase의 `mindmaps` 행이다. HTML 수정으로
마이그레이션 코드를 배포한 뒤 로그인 상태로 페이지를 열어 저장 완료까지 확인해야 한다.

## 공개 경계

볼트의 연구 진행률, 병목, `grade_note`, `next_gate` 같은 내부 판단을 공개 HTML이나 이 공개
저장소의 생성기 데이터로 복사하지 않는다. 공개 관계·소개·저장소 링크에 필요한 최소 정보만
반영하고, push 전 `git diff`와 브라우저 표시를 확인한다.

루트의 `layout_findings.py`는 과거 수동 배치 보존용이다. 전체 재생성은 공개 HTML에 내부
메타데이터를 되살리거나 수동 좌표를 되돌릴 수 있으므로 일상 갱신 명령에 포함하지 않는다.
필요한 노드·엣지·배치만 `graph.html`과 스크립트에 함께 반영하고 검증한다.
