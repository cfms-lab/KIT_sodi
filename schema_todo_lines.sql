-- todo_lines: graph.html · portfolio.html 의 「ToDo」 칸 — 저자 관점의 다음 할 일 한 줄 (2026-11-21, 사용자 지시).
--
-- 전에는 KIT_sodi 의 todo.js 에 손으로 적어 두었다. 사건(투고 · 판정)이 생기면 볼트 노트를 고치고, 발행하고,
-- todo.js 를 따로 고쳐 커밋 · 푸시해야 했다. 이제 정본은 볼트다 —
--   · 노트가 있는 프로젝트: Projects/{이름}.md frontmatter `todo:`
--   · 분리 트랙(한 노트가 논문 여럿): Dashboards/프로젝트현황.md 분리트랙 항목의 `할일:`
-- scripts/publish-portfolio.mjs --sql (--only a,b) 가 이 표로 올리고, todo.js 가 로딩 때 읽어 두 화면에 준다.
--
-- 왜 research_outputs 의 칸이 아니라 따로인가 — 키가 다르다. 화면은 이 줄을 **프로젝트 · 트랙 이름**
-- (todo.js 때와 같은 키, 대소문자 · 밑줄을 지운 이름으로도 찾는다)으로 찾는데, 노드 행의 id 는 트랙에서 그 이름과
-- 어긋나거나(TSE_SEM 세 트랙은 nuzx6yz7 · n9ccnpv1 · nggbas52) 아예 행이 없다(TSE_TomoSh4 · 5).
--
-- 값: 빈 문자열('')은 「할 일 없음」(게재 완료 등)이고, 행이 없으면 화면이 옛 문장(병목 · 다음 게이트)으로 떨어진다.
-- 읽기는 공개다 — 두 화면 모두 로그인 전에도 이 줄을 쓰고, todo.js 때도 공개 파일이었다. 그래서 여기에는
-- 공개해도 되는 한 줄만 들어간다(발행기가 리젝 · 심사 경위 · 이메일 같은 낱말을 막는다). 쓰기는 로그인 사용자와
-- 서비스 역할(MCP 발행)만.
--
-- 되돌리기: drop table if exists public.todo_lines;

create table if not exists public.todo_lines (
  id          text primary key,                 -- 볼트 노트 이름 또는 분리 트랙 이름 (Tomo_SFTF, TSE_SEM1_Bezier …)
  todo        text not null default '',
  updated_at  timestamptz not null default now()
);

grant usage on schema public to anon, authenticated;
revoke all on public.todo_lines from anon;
grant select on public.todo_lines to anon;
grant select, insert, update, delete on public.todo_lines to authenticated;

alter table public.todo_lines enable row level security;

drop policy if exists "todo_lines anon read" on public.todo_lines;
create policy "todo_lines anon read"
on public.todo_lines for select
to anon
using (true);

drop policy if exists "todo_lines authenticated full access" on public.todo_lines;
create policy "todo_lines authenticated full access"
on public.todo_lines for all
to authenticated
using (true)
with check (true);
