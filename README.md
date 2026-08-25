# KIT 소재디자인공학과 · CFMS 연구실 클라우드

금오공대 소재디자인공학과(CFMS Lab) 연구실 데이터를 GitHub Pages와 Supabase로 운영하는 정적 웹앱 모음입니다.
화면은 이 저장소의 HTML 파일에서 제공하고, 데이터는 Supabase에 저장합니다.

## 접속

- 홈페이지: https://cfms-lab.github.io/KIT_sodi/
- 공개 조회는 로그인 없이 가능합니다.
- 프로젝트 관계도(`mindmap.html`)와 프로젝트 그래프(`graph.html`)는 로그인 없이 누구나 열람할 수 있습니다.
- 추가, 수정, 삭제, PDF 원문은 우측 상단 로그인 후 사용할 수 있습니다.
- 로그인 세션은 `localStorage`의 `cfms_session`으로 앱 간 공유됩니다.

## 앱 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 포털 홈 |
| `upjuk.html` | 논문/업적 관리, draft 숨김, PDF 원문 업로드/열람 |
| `timetable.html` | 학기별 수업 시간표, 드래그 이동/복사, 학기 복제 |
| `jobgis.html` | 졸업생 취업 현황 지도, 공개 조회 시 이름 마스킹 |
| `mindmap.html` | 연구/개발 프로젝트 관계도, 공개 열람 · 편집은 로그인 |
| `graph.html` | 옵시디언 볼트 내용을 조회해 관리하는 공개 프로젝트 그래프 (정적 파일) |
| `graph3d.html` | `graph.html`을 실시간으로 읽는 WebGL 3D 그래프 뷰어 |
| `backup.html` | Supabase 데이터 백업 도구 |
| `scripts/build-vault-graph.mjs` | Markdown/Obsidian 볼트에서 `vault-graph.json` 생성 |

## Supabase 재구성 파일

새 Supabase 프로젝트를 만들거나 스키마를 복구할 때 SQL Editor에서 아래 순서로 실행합니다.

1. `schema_cfms.sql`: 테이블, 공개 취업 뷰, PDF 버킷 생성
2. `enable_rls_cfms.sql`: RLS, anon/authenticated 권한, PDF storage 정책 적용
3. `enable_rls_mindmaps.sql`: 관계도 테이블만 빠르게 보강할 때 쓰는 최소 정책 파일 (anon 열람 + 로그인 편집)

기본 내장 연결 정보는 각 HTML의 `BAKED_URL`, `BAKED_KEY`에 있습니다. 공개 저장소에 들어간 키는 Supabase `anon` 키이며, 실제 보안은 RLS와 storage 정책이 담당합니다.

## 백업

`backup.html`에서 로그인 후 백업을 받습니다.

- 공개 저장소에는 `backup/` 폴더의 마스킹 백업만 커밋합니다.
- `*_FULL_*` 파일은 학생 실명이 들어갈 수 있으므로 개인 PC나 비공개 저장소에만 보관합니다.
- 로그인 백업은 draft 논문과 `mindmaps`까지 포함합니다.
- 비로그인 백업은 공개 조회 가능한 데이터만 포함하며, 로그인 전용 테이블은 건너뜁니다.

## 시간표 사용 메모

- 이동: 과목 블록을 원하는 요일, 학년, 교시 칸으로 드래그합니다.
- 복사: `Alt` 키를 누른 채 드래그합니다.
- 삭제: 과목 클릭 후 `Delete` 또는 `Backspace`, 또는 더블클릭 후 삭제 버튼.
- 수정: 과목 더블클릭.
- 새 학기: `학기 복제`에서 원본 학기를 대상 학기로 복사합니다.

모든 편집은 Supabase에 바로 저장되며, 다른 PC에서는 새로고침 후 반영됩니다.

## 연구 그래프·마인드맵 운영

`graph.html`과 `mindmap.html`의 공개 정본은 이 저장소 루트에만 둡니다. Obsidian 볼트
`D:\cfms-research-vault`는 연구 노트 입력이며, 볼트 루트에 별도 `graphify-out` 그래프를
유지하지 않습니다. 상세 경계와 명령은 [`graphify-out/README.md`](graphify-out/README.md)에 있습니다.

볼트 프로젝트 노트와 두 HTML의 포함 여부를 읽기 전용으로 점검하고 구문을 검증하려면:

```powershell
node scripts/audit-vault-projects.mjs D:\cfms-research-vault
pwsh -File scripts/publish-research-views.ps1 -VaultPath D:\cfms-research-vault
```

검증한 `graph.html`·`mindmap.html` 변경만 `cfms-lab/KIT_sodi`의 `main`으로 올리려면
마지막 명령에 `-Push`를 붙입니다. 스크립트는 원격이 앞서 있거나 관련 없는 작업 파일이
있으면 push를 중단합니다.

## graph.html 로컬 3D 뷰어

`graph.py`는 실행할 때마다 `graph.html` 안의 노드, 엣지, `POS`, hyperedge를 직접 읽고 Polyscope로 표시합니다. 뷰어가 열린 동안에도 `graph.html` 변경을 1초 간격으로 감지해 노드 수와 위치를 자동 갱신합니다. XY 배치는 같은 비율로 유지되며 Z 좌표는 방향과 무관한 고유 이웃 수(Degree)입니다.

연결 표시는 기본적으로 `Selected` 모드입니다. 노드 sphere를 클릭하면 그 노드의 1-hop 연결만 곡선과 halo로 표시되며, 주황은 outgoing, 파랑은 incoming, 보라는 양방향입니다. 패널의 `Connections`에서 `Off / Selected / All`을 선택할 수 있습니다.

```powershell
uv sync
uv run python graph.py
```

GUI를 열지 않고 데이터만 검증하려면 `uv run python graph.py --check`, 실행 중 자동 갱신을 끄려면 `--no-watch`를 사용합니다.

### WebGL 3D 뷰어

`graph3d.html`은 별도 빌드 없이 Three.js로 렌더링되며, `graph.html`의 노드·위치·연결·hyperedge 변경을 1.5초 간격으로 자동 반영합니다. 브라우저 보안 정책상 파일을 직접 더블클릭하지 말고 저장소 루트에서 로컬 서버를 실행합니다.

```powershell
uv run python -m http.server 8000
```

그다음 `http://localhost:8000/graph3d.html`을 엽니다. 서버 없이 열었을 때는 화면의 `graph.html 선택` 버튼으로 정본 파일을 직접 불러올 수도 있습니다.
