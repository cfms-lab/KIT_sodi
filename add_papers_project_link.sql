-- papers ↔ project_nodes 연결 열 추가 + 기존 논문 연결 시드.
-- Supabase SQL Editor에서 실행한다 (schema_project_nodes.sql 이후, 재실행 안전).
--
-- PROJECT_ID 가 연결된 논문은 upjuk.html 에서 출판상태·메모를 mindmap 노드의
-- 상태·메모와 동기화해 보여주고, 논문 수정 창에서 저장하면 역방향으로도 반영된다.

alter table public.papers add column if not exists "PROJECT_ID" text;
create index if not exists papers_project_idx on public.papers ("PROJECT_ID");

-- 확실한 기존 연결 (제목의 프로젝트 태그 기준). 이미 연결돼 있으면 건드리지 않는다.
update public.papers set "PROJECT_ID"='Tomo_SFTF'       where "ID"=101 and coalesce("PROJECT_ID",'')='';  -- (sftf) The Support Flow Tensor Field ...
update public.papers set "PROJECT_ID"='SFTF_DrapePrior' where "ID"=253 and coalesce("PROJECT_ID",'')='';  -- (drapePrior) 의복 드레이프 시뮬레이션 품질 평가의 재현성
update public.papers set "PROJECT_ID"='cfmsCIPC'        where "ID"=256 and coalesce("PROJECT_ID",'')='';  -- (cfmsCIPC) 충돌 강건성 검증 프로토콜
update public.papers set "PROJECT_ID"='cfmsDispersity'  where "ID"=73  and coalesce("PROJECT_ID",'')='';  -- (dispersity) 입자 분산도 정적 kNN 에너지 지표
