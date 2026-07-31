-- Minimal policy file for the Mindmap/Graph pages.
-- For a full project setup, prefer schema_cfms.sql followed by enable_rls_cfms.sql.

create table if not exists public.mindmaps (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- 관계도는 대학원생 공유·학부생 홍보용으로 공개 열람(anon SELECT)을 허용한다.
-- 쓰기(추가/수정/삭제)는 로그인한 사용자만 가능하다.
grant usage on schema public to anon, authenticated;
revoke all on public.mindmaps from anon;
grant select on public.mindmaps to anon;
grant select, insert, update, delete on public.mindmaps to authenticated;

alter table public.mindmaps enable row level security;

drop policy if exists "mindmaps anon read" on public.mindmaps;
create policy "mindmaps anon read"
on public.mindmaps for select
to anon
using (true);

drop policy if exists "mindmaps authenticated full access" on public.mindmaps;
create policy "mindmaps authenticated full access"
on public.mindmaps for all
to authenticated
using (true)
with check (true);
