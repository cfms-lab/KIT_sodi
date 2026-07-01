# KIT 소재디자인공학과 · CFMS 연구실 클라우드

금오공대 소재디자인공학과(CFMS Lab) 연구실 데이터를 GitHub Pages와 Supabase로 운영하는 정적 웹앱 모음입니다.
화면은 이 저장소의 HTML 파일에서 제공하고, 데이터는 Supabase에 저장합니다.

## 접속

- 홈페이지: https://cfms-lab.github.io/KIT_sodi/
- 공개 조회는 로그인 없이 가능합니다.
- 추가, 수정, 삭제, PDF 원문, 내부 관계도는 우측 상단 로그인 후 사용할 수 있습니다.
- 로그인 세션은 `localStorage`의 `cfms_session`으로 앱 간 공유됩니다.

## 앱 구성

| 파일 | 내용 |
|---|---|
| `index.html` | 포털 홈 |
| `upjuk.html` | 논문/업적 관리, draft 숨김, PDF 원문 업로드/열람 |
| `timetable.html` | 학기별 수업 시간표, 드래그 이동/복사, 학기 복제 |
| `jobgis.html` | 졸업생 취업 현황 지도, 공개 조회 시 이름 마스킹 |
| `mindmap.html` | 연구/개발 프로젝트 관계도, 로그인 전용 |
| `graph.html` | 옵시디언 볼트 기반 프로젝트 그래프, 로그인 전용 |
| `backup.html` | Supabase 데이터 백업 도구 |
| `scripts/build-vault-graph.mjs` | Markdown/Obsidian 볼트에서 `vault-graph.json` 생성 |

## Supabase 재구성 파일

새 Supabase 프로젝트를 만들거나 스키마를 복구할 때 SQL Editor에서 아래 순서로 실행합니다.

1. `schema_cfms.sql`: 테이블, 공개 취업 뷰, PDF 버킷 생성
2. `enable_rls_cfms.sql`: RLS, anon/authenticated 권한, PDF storage 정책 적용
3. `enable_rls_mindmaps.sql`: 관계도 테이블만 빠르게 보강할 때 쓰는 최소 정책 파일

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

## 프로젝트 그래프 갱신

Markdown/Obsidian 볼트에서 그래프 JSON을 다시 만들 때:

```powershell
node scripts/build-vault-graph.mjs D:\path\to\_Research_Vault vault-graph.json
```

생성된 `vault-graph.json`은 `graph.html`의 `볼트에서 불러오기` 버튼으로 업로드하면 Supabase의 `mindmaps` 테이블에 저장됩니다.
