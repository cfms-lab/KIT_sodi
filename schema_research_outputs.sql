-- research_outputs: papers + project_nodes 를 합친 단일 테이블.
-- 볼트 Rules/업적통합_설계안.md 4단계.
--
-- 왜 하나로 — mindmap.html 과 upjuk.html 은 「통합해야 할 두 시스템」이 아니라
-- 같은 목록의 두 필터다. 노드가 출판 단계를 받으면 upjuk 쪽으로 옮겨 가는데, 표가
-- 둘이면 그게 '이사'가 되고 표가 하나면 `stage` 한 칸이 바뀌는 일이 된다.
--
-- 실행 순서 (Supabase SQL Editor)
--   1) 이 파일 — 테이블 + 권한 + 기존 두 표에서 이관
--   2) 볼트에서: node scripts/publish-research-outputs.mjs        (미리보기)
--      그 다음:  node scripts/publish-research-outputs.mjs --push (볼트 값으로 채움)
--
-- ⚠️ 이 파일은 **더하기만 한다.** `papers` 와 `project_nodes` 를 건드리지 않으므로
--    지금 돌아가는 세 페이지는 그대로 동작한다. 페이지를 이 표로 옮기는 것은 다음 단계이고,
--    옮긴 뒤 한동안 두 표를 남겨 두었다가 문제가 없으면 그때 지운다.
--
-- 되돌리기: drop table if exists public.research_outputs;

create table if not exists public.research_outputs (
  -- 안정 키. 노드는 project_nodes.id 그대로, 업적은 'p' || papers."ID".
  -- (충돌 없음을 2026-09-12 에 확인했다 — p+숫자 꼴 노드 id 는 하나도 없다)
  id            text primary key,

  -- 이 행이 무엇인가. 세 페이지가 이걸로 거른다.
  --   node   마인드맵·그래프의 프로젝트 노드 (진행 중이거나 구조 노드)
  --   output 업적 기록 (저널·학회·특허·저서·수상·초청강연·보직)
  kind          text not null check (kind in ('node', 'output')),

  -- 볼트에서 이 행을 소유한 노트 이름. null 이면 웹에서만 사는 것(아이디어 노드 등)이고
  -- 볼트 발행이 건드리지 않는다.
  vault_note    text,

  -- 통합 단계 어휘. 볼트 scripts/lib/stage.mjs 가 정본이다.
  --   published inprint accepted revision submitted draft undecided blocked cancelled idea
  stage         text,

  -- 업적 분류. IJ DJ IC DC PT PB AW IL ETC. 진행 중인 노드는 null.
  categ         text,
  title         text,

  ---- 노드 쪽 열 (옛 project_nodes) ----
  mindmap_id    text,
  grade         text,          -- 상 중 하 ToDo Closed 등급 없음 그룹
  badge         text,
  grade_note    text,
  bottleneck    text,
  brief         text,
  note          text,
  url           text,
  project_path  text,
  pos_x         integer,
  pos_y         integer,

  ---- 업적 쪽 열 (옛 papers) ----
  papers_id     bigint,        -- 옛 papers."ID"
  mdb_id        bigint,        -- 원본 s_record.mdb 의 PAPERS.ID (볼트 upjuk_id). 저널 64건만 있다
  authors       text,
  journal_name  text,
  volume        text,
  page          text,
  p_year        integer,
  p_month       integer,
  p_day         integer,
  doi           text,
  pdf           text,
  funding       text,
  country       text,
  scistatus     integer,
  scifactor     text,
  memo          text,

  ---- 이음매 ----
  -- 이 업적을 낳은 프로젝트 (옛 papers."PROJECT_ID"). 반대 방향은 볼트 노트의 papers_ids.
  project_id    text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists research_outputs_kind_idx    on public.research_outputs (kind);
create index if not exists research_outputs_stage_idx   on public.research_outputs (stage);
create index if not exists research_outputs_categ_idx   on public.research_outputs (categ);
create index if not exists research_outputs_year_idx    on public.research_outputs (p_year desc);
create index if not exists research_outputs_mindmap_idx on public.research_outputs (mindmap_id);
create index if not exists research_outputs_project_idx on public.research_outputs (project_id);
create index if not exists research_outputs_papers_idx  on public.research_outputs (papers_id);

---------------------------------------------------------------------------
-- 권한 — project_nodes 와 같은 규칙. 열람은 anon 공개, 편집은 로그인 사용자만.
---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on public.research_outputs from anon;
grant select on public.research_outputs to anon;
grant select, insert, update, delete on public.research_outputs to authenticated;

alter table public.research_outputs enable row level security;

drop policy if exists "research_outputs anon read" on public.research_outputs;
create policy "research_outputs anon read"
on public.research_outputs for select
to anon
using (true);

drop policy if exists "research_outputs authenticated full access" on public.research_outputs;
create policy "research_outputs authenticated full access"
on public.research_outputs for all
to authenticated
using (true)
with check (true);

---------------------------------------------------------------------------
-- 이관 — 기존 두 표에서 옮겨 담는다.
-- `on conflict do nothing` 이라 **여러 번 돌려도 안전하고, 이미 있는 행을 덮지 않는다.**
-- 볼트가 정본인 열은 그 뒤 publish-research-outputs.mjs 가 채운다.
---------------------------------------------------------------------------

-- ① 업적 (papers). draft(PrintStatus=5)는 RLS 로 anon 에게 안 보이지만 SQL Editor 는
--    service 권한이라 전부 옮겨진다.
insert into public.research_outputs (
  id, kind, stage, categ, title,
  papers_id, authors, journal_name, volume, page,
  p_year, p_month, p_day, doi, pdf, funding, country, scistatus, scifactor, memo,
  project_id
)
select
  'p' || p."ID",
  'output',
  case p."PrintStatus"
    when 1 then 'published' when 2 then 'inprint' when 3 then 'accepted'
    when 4 then 'submitted' when 5 then 'draft' else null end,
  p."CATEG",
  p."TITLE",
  p."ID", p."AUTHORS", p."JOURNAL_NAME", p."VOLUME", p."PAGE",
  p."P_YEAR", p."P_MONTH", p."P_DAY", p."DOI", p."PDF", p."FUNDING",
  p."COUNTRY", p."SCISTATUS", p."SCIFACTOR", p."MEMO",
  p."PROJECT_ID"
from public.papers p
on conflict (id) do nothing;

-- ② 노드 (project_nodes). stage 열은 2026-09-12 에 추가했고 볼트 발행이 채워 둔 상태다.
insert into public.research_outputs (
  id, kind, stage, title,
  mindmap_id, grade, badge, grade_note, bottleneck, brief, note, url, project_path,
  pos_x, pos_y, created_at, updated_at
)
select
  n.id,
  'node',
  coalesce(n.stage, n.status),
  n.title,
  n.mindmap_id, n.grade, n.badge, n.grade_note, n.bottleneck, n.brief, n.note,
  n.url, n.project_path, n.pos_x, n.pos_y, n.created_at, n.updated_at
from public.project_nodes n
on conflict (id) do nothing;

---------------------------------------------------------------------------
-- 확인
---------------------------------------------------------------------------
select kind, count(*) from public.research_outputs group by kind order by kind;
select stage, count(*) from public.research_outputs group by stage order by count(*) desc;
select categ, count(*) from public.research_outputs where kind = 'output' group by categ order by count(*) desc;

-- 기대값 (2026-09-12 기준)
--   kind   node 95 · output 244 이상 (draft 포함이면 더 많다)
--   합계   339 이상
