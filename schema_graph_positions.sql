-- graph_positions: graph.html 의 노드 좌표를 웹에서 바로 저장하는 표.
--
-- 왜 research_outputs 가 아니라 별도 표인가 — 그 표에도 pos_x/pos_y 가 있지만 **볼트가
-- 정본**이라 `publish-research-outputs.mjs` 가 발행할 때마다 노트의 node_pos 로 덮어쓴다.
-- 웹에서 끌어 놓은 배치는 볼트가 모르는 값이므로, 충돌하지 않는 자리에 따로 둔다.
-- (볼트 발행과 웹 저장이 서로를 덮는 양방향 쓰기는 2026-09-12 에 이미 한 번 걷어냈다.)
--
-- 읽기는 공개다. 그래프 자체가 공개 페이지이고 좌표는 화면에 이미 보이는 값이라 숨길 것이
-- 없다. 쓰기만 로그인 사용자로 막는다.
--
-- 실행: Supabase SQL Editor 에 붙여넣고 Run. 그 뒤 graph.html 의 「노드 저장」이 동작한다.
-- 되돌리기: drop table if exists public.graph_positions;

create table if not exists public.graph_positions (
  -- graph.html 의 노드 id (Tomo_SFTF, PFTF_VisCull_kDop …). layout_findings.py 의 POS 키와 같다.
  id          text primary key,
  x           integer not null,
  y           integer not null,
  updated_at  timestamptz not null default now(),
  -- 누가 마지막으로 저장했는지. 여럿이 쓸 때 되돌릴 근거가 된다.
  updated_by  uuid default auth.uid()
);

create index if not exists graph_positions_updated_idx on public.graph_positions (updated_at desc);

---------------------------------------------------------------------------
-- 권한 — 열람은 누구나, 저장은 로그인 사용자만. project_nodes 와 같은 규칙이다.
---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on public.graph_positions from anon;
grant select on public.graph_positions to anon;
grant select, insert, update, delete on public.graph_positions to authenticated;

alter table public.graph_positions enable row level security;

drop policy if exists "graph_positions anon read" on public.graph_positions;
create policy "graph_positions anon read"
on public.graph_positions for select
to anon
using (true);

drop policy if exists "graph_positions authenticated write" on public.graph_positions;
create policy "graph_positions authenticated write"
on public.graph_positions for all
to authenticated
using (true)
with check (true);

---------------------------------------------------------------------------
-- 첫 채움 — 지금 배포본의 좌표를 그대로 넣어 두면 첫 로드부터 화면이 같다.
-- 비워 두어도 된다(표가 비면 graph.html 은 파일에 내장된 POS 로 그린다).
-- 채우려면 저장소에서:  node scripts/pull-graph-positions.mjs --seed
---------------------------------------------------------------------------
select count(*) as rows from public.graph_positions;
