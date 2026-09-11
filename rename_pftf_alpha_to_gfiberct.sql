-- PFTF_alpha → PFTF_GFiberCT 개명 (2026-09-11).
-- 볼트 Projects/PFTF_alpha.md 가 PFTF_GFiberCT.md 로 바뀐 데 맞춰 공유 노드 행의 id 를 바꾼다.
-- project_nodes.id 는 graph.html 노드 id 와 같아야 하므로 행 id 자체를 바꾸고,
-- mindmap 노드 id(mindmap_id = 'nzyk4gd6')는 그대로 둔다.
-- Supabase SQL Editor 에서 실행한다 (schema_project_nodes.sql 이후, 재실행 안전).
--
-- 실행 전에는 mindmap.html 이 개명 이관(applyGFiberCTRename20260911)으로 노드 제목만 바꾸고,
-- 저장 때는 mindmap_id 대응표를 따라 여전히 옛 id 'PFTF_alpha' 행에 upsert 한다.
-- graph.html 은 노드 id 'PFTF_GFiberCT' 로 행을 찾으므로, 이 파일을 실행해야
-- 마인드맵에서 고친 메모·상태가 다시 그래프에 덮어써진다.

update public.project_nodes
   set id           = 'PFTF_GFiberCT',
       title        = 'PFTF_GFiberCT',
       badge        = '한국섬유공학회지,draft',
       url          = replace(url, 'PFTF_alpha', 'PFTF_GFiberCT'),
       project_path = replace(project_path, 'PFTF_alpha', 'PFTF_GFiberCT'),
       updated_at   = now()
 where id = 'PFTF_alpha'
   and not exists (select 1 from public.project_nodes where id = 'PFTF_GFiberCT');

-- 새 id 의 행이 이미 있으면 옛 행만 지운다.
delete from public.project_nodes
 where id = 'PFTF_alpha'
   and exists (select 1 from public.project_nodes where id = 'PFTF_GFiberCT');

-- 논문 ↔ 노드 연결(add_papers_project_link.sql)이 옛 id 를 가리키면 따라간다.
update public.papers
   set "PROJECT_ID" = 'PFTF_GFiberCT'
 where "PROJECT_ID" = 'PFTF_alpha';
