-- project_nodes: graph.html / mindmap.html / upjuk.html 이 공유하는 프로젝트 노드 정본 테이블.
-- id 는 프로젝트 키워드(예: 'Tomo_SFTF', 'PFTF_VisCull_kDop')로 세 페이지가 동일하게 쓴다.
-- mindmap 전용 구조 노드(교수님방 등)는 mindmap 노드 id 를 그대로 id 로 쓴다.
--
-- 실행 순서 (Supabase SQL Editor):
--   1) 이 파일 (테이블 + 권한)
--   2) seed_project_nodes.sql (초기 데이터 78건)
--
-- 열람은 anon 공개(SELECT), 편집은 로그인 사용자만 — mindmaps 테이블과 같은 규칙.

create table if not exists public.project_nodes (
  id text primary key,            -- 프로젝트 키워드 (graph.html 노드 id와 동일)
  mindmap_id text,                -- mindmaps 문서(id='cfms') 안의 노드 id (양방향 매핑)
  title text,                     -- 표시 이름 (mindmap에서 편집)
  grade text,                     -- 상 / 중 / 하 / ToDo / 등급 없음 / Closed / 그룹 (graph paper quality = mindmap kind)
  status text,                    -- draft / submitted / accepted / inprint / published / cancelled
  badge text,                     -- 원고 상태 배지 (graph.html STATUS_BADGES, 예: 'TDP,submit,08-13')
  grade_note text,                -- 등급 근거 (graph.html QUALITY_ROWS note)
  bottleneck text,                -- 남은 병목 (graph.html REMAINING_BOTTLENECKS)
  brief text,                     -- 7어절 이하 소개 (타 학과 공저자용)
  note text,                      -- 메모 (mindmap note)
  url text,                       -- 링크 (github 등)
  project_path text,              -- 로컬 프로젝트 폴더 (VSCODE로 열기)
  pos_x integer,                  -- graph.html 기본 배치 좌표
  pos_y integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists project_nodes_grade_idx on public.project_nodes (grade);
create index if not exists project_nodes_mindmap_idx on public.project_nodes (mindmap_id);

grant usage on schema public to anon, authenticated;
revoke all on public.project_nodes from anon;
grant select on public.project_nodes to anon;
grant select, insert, update, delete on public.project_nodes to authenticated;

alter table public.project_nodes enable row level security;

drop policy if exists "project_nodes anon read" on public.project_nodes;
create policy "project_nodes anon read"
on public.project_nodes for select
to anon
using (true);

drop policy if exists "project_nodes authenticated full access" on public.project_nodes;
create policy "project_nodes authenticated full access"
on public.project_nodes for all
to authenticated
using (true)
with check (true);
