-- Minimal policy file for the Mindmap/Graph pages.
-- For a full project setup, prefer schema_cfms.sql followed by enable_rls_cfms.sql.

create table if not exists public.mindmaps (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

grant usage on schema public to authenticated;
revoke all on public.mindmaps from anon;
grant select, insert, update, delete on public.mindmaps to authenticated;

alter table public.mindmaps enable row level security;

drop policy if exists "mindmaps authenticated full access" on public.mindmaps;
create policy "mindmaps authenticated full access"
on public.mindmaps for all
to authenticated
using (true)
with check (true);
