-- cfmsDispersity → cfmsDispersityKNN 개명 (2026-09-24).
-- 형제 cfmsDispersityProp · cfmsHMDispersity 와 이름을 맞추려고 볼트 Projects/cfmsDispersity.md 가
-- cfmsDispersityKNN.md 로, 저장소·작업폴더가 cfmsDispersity2026_Dev → cfmsDispersityKNN_Dev 로 바뀌었다.
-- 공유 표들의 행 id 가 노드 id(= 노트 이름)와 같아야 하므로 행 id 자체를 옮긴다.
-- mindmap 노드 id(mindmap_id = 'nc593kj6')는 그대로 둔다 — 제목·주소·폴더는 mindmap.html 의
-- applyDispersityKNNRename20260924 가 클라우드 문서를 열 때 바꾼다.
-- Supabase SQL Editor 에서 실행한다. 재실행 안전: 새 id 행이 이미 있으면 그 값을 이기지 않고 옛 행만 지운다.

begin;

-- ① project_nodes (graph · mindmap · upjuk 공유 노드)
update public.project_nodes
   set id           = 'cfmsDispersityKNN',
       title        = case when title in ('Dispersity', 'cfmsDispersity') then 'cfmsDispersityKNN' else title end,
       url          = 'https://github.com/cfms-lab/cfmsDispersityKNN_Dev',
       project_path = 'D:\__KIT_projects\cfmsDispersityKNN_Dev',
       updated_at   = now()
 where id = 'cfmsDispersity'
   and not exists (select 1 from public.project_nodes where id = 'cfmsDispersityKNN');
delete from public.project_nodes
 where id = 'cfmsDispersity'
   and exists (select 1 from public.project_nodes where id = 'cfmsDispersityKNN');

-- ② graph_positions — 웹에서 끌어 놓은 좌표를 새 id 로 옮긴다. 안 옮기면 옛 id 로 고아가 되고
--    노드는 파일 씨앗 자리로 조용히 돌아간다(docs/graph-positions-runbook.md).
update public.graph_positions p
   set id = 'cfmsDispersityKNN', updated_at = now()
 where p.id = 'cfmsDispersity'
   and not exists (select 1 from public.graph_positions q where q.id = 'cfmsDispersityKNN');
delete from public.graph_positions where id = 'cfmsDispersity';

-- ③ research_outputs — 노드 행(id = 노트 이름)과 업적 행 p73(TSE 63(4) 248-257)
update public.research_outputs
   set id           = 'cfmsDispersityKNN',
       vault_note   = 'cfmsDispersityKNN',
       title        = case when title in ('Dispersity', 'cfmsDispersity') then 'cfmsDispersityKNN' else title end,
       url          = 'https://github.com/cfms-lab/cfmsDispersityKNN_Dev',
       project_path = 'D:\__KIT_projects\cfmsDispersityKNN_Dev',
       updated_at   = now()
 where id = 'cfmsDispersity'
   and not exists (select 1 from public.research_outputs where id = 'cfmsDispersityKNN');
delete from public.research_outputs
 where id = 'cfmsDispersity'
   and exists (select 1 from public.research_outputs where id = 'cfmsDispersityKNN');

update public.research_outputs
   set vault_note = 'cfmsDispersityKNN',
       project_id = 'cfmsDispersityKNN',
       title      = regexp_replace(title, '^\(cfmsDispersity\)', '(cfmsDispersityKNN)'),
       updated_at = now()
 where id = 'p73'
   and (vault_note = 'cfmsDispersity' or project_id = 'cfmsDispersity' or title like '(cfmsDispersity)%');

-- ④ papers — 논문 ↔ 노드 연결(add_papers_project_link.sql)이 옛 id 를 가리키면 따라간다.
update public.papers
   set "PROJECT_ID" = 'cfmsDispersityKNN'
 where "PROJECT_ID" = 'cfmsDispersity';

-- ⑤ portfolio_rows — 행 id 와 행 안의 이름·노트·경로를 옮긴다. 나머지 열은
--    node scripts/publish-portfolio.mjs --push (또는 --sql) 가 볼트 값으로 다시 채운다.
update public.portfolio_rows
   set id   = 'cfmsDispersityKNN',
       data = data || jsonb_build_object(
                'id', 'cfmsDispersityKNN',
                'name', 'cfmsDispersityKNN',
                'note', 'Projects/cfmsDispersityKNN.md',
                'repo', 'https://github.com/cfms-lab/cfmsDispersityKNN_Dev',
                'projectPath', 'D:\__KIT_projects\cfmsDispersityKNN_Dev',
                'workspace', 'KIT'),
       updated_at = now()
 where id = 'cfmsDispersity'
   and not exists (select 1 from public.portfolio_rows where id = 'cfmsDispersityKNN');
delete from public.portfolio_rows where id = 'cfmsDispersity';

commit;

-- 확인 (옛 id 는 0행이어야 한다):
-- select 'project_nodes', count(*) from public.project_nodes where id = 'cfmsDispersity'
-- union all select 'graph_positions', count(*) from public.graph_positions where id = 'cfmsDispersity'
-- union all select 'research_outputs', count(*) from public.research_outputs where id = 'cfmsDispersity' or project_id = 'cfmsDispersity'
-- union all select 'papers', count(*) from public.papers where "PROJECT_ID" = 'cfmsDispersity'
-- union all select 'portfolio_rows', count(*) from public.portfolio_rows where id = 'cfmsDispersity';
