-- CFMS Lab / KIT_sodi Supabase RLS and grants
-- Run after schema_cfms.sql.

grant usage on schema public to anon, authenticated;

grant select on public.papers to anon;
grant select, insert, update, delete on public.papers to authenticated;

grant select on public.tt_courses, public.tt_professors, public.tt_rooms to anon;
grant select, insert, update, delete on public.tt_courses, public.tt_professors, public.tt_rooms to authenticated;

revoke all on public.jobgis_jobs from anon;
grant select, insert, update, delete on public.jobgis_jobs to authenticated;
grant select on public.jobgis_jobs_public to anon, authenticated;

grant select on public.jobgis_office_types to anon;
grant select, insert, update, delete on public.jobgis_office_types to authenticated;

revoke all on public.mindmaps from anon;
grant select, insert, update, delete on public.mindmaps to authenticated;

grant usage, select on all sequences in schema public to authenticated;

alter table public.papers enable row level security;
alter table public.tt_courses enable row level security;
alter table public.tt_professors enable row level security;
alter table public.tt_rooms enable row level security;
alter table public.jobgis_jobs enable row level security;
alter table public.jobgis_office_types enable row level security;
alter table public.mindmaps enable row level security;

drop policy if exists "papers anon read published" on public.papers;
create policy "papers anon read published"
on public.papers for select
to anon
using (coalesce("PrintStatus", 1) <> 5);

drop policy if exists "papers authenticated full access" on public.papers;
create policy "papers authenticated full access"
on public.papers for all
to authenticated
using (true)
with check (true);

drop policy if exists "tt_courses anon read" on public.tt_courses;
create policy "tt_courses anon read"
on public.tt_courses for select
to anon
using (true);

drop policy if exists "tt_courses authenticated full access" on public.tt_courses;
create policy "tt_courses authenticated full access"
on public.tt_courses for all
to authenticated
using (true)
with check (true);

drop policy if exists "tt_professors anon read" on public.tt_professors;
create policy "tt_professors anon read"
on public.tt_professors for select
to anon
using (true);

drop policy if exists "tt_professors authenticated full access" on public.tt_professors;
create policy "tt_professors authenticated full access"
on public.tt_professors for all
to authenticated
using (true)
with check (true);

drop policy if exists "tt_rooms anon read" on public.tt_rooms;
create policy "tt_rooms anon read"
on public.tt_rooms for select
to anon
using (true);

drop policy if exists "tt_rooms authenticated full access" on public.tt_rooms;
create policy "tt_rooms authenticated full access"
on public.tt_rooms for all
to authenticated
using (true)
with check (true);

drop policy if exists "jobgis_jobs authenticated full access" on public.jobgis_jobs;
create policy "jobgis_jobs authenticated full access"
on public.jobgis_jobs for all
to authenticated
using (true)
with check (true);

drop policy if exists "jobgis_office_types anon read" on public.jobgis_office_types;
create policy "jobgis_office_types anon read"
on public.jobgis_office_types for select
to anon
using (true);

drop policy if exists "jobgis_office_types authenticated full access" on public.jobgis_office_types;
create policy "jobgis_office_types authenticated full access"
on public.jobgis_office_types for all
to authenticated
using (true)
with check (true);

drop policy if exists "mindmaps authenticated full access" on public.mindmaps;
create policy "mindmaps authenticated full access"
on public.mindmaps for all
to authenticated
using (true)
with check (true);

drop policy if exists "pdfs authenticated read" on storage.objects;
create policy "pdfs authenticated read"
on storage.objects for select
to authenticated
using (bucket_id = 'pdfs');

drop policy if exists "pdfs authenticated insert" on storage.objects;
create policy "pdfs authenticated insert"
on storage.objects for insert
to authenticated
with check (bucket_id = 'pdfs');

drop policy if exists "pdfs authenticated update" on storage.objects;
create policy "pdfs authenticated update"
on storage.objects for update
to authenticated
using (bucket_id = 'pdfs')
with check (bucket_id = 'pdfs');

drop policy if exists "pdfs authenticated delete" on storage.objects;
create policy "pdfs authenticated delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'pdfs');
