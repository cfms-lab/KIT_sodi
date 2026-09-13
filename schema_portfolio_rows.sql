-- portfolio_rows: portfolio.html 이 읽는 「포트폴리오 한눈에」 표.
--
-- 왜 표로 옮기나 — GitHub Pages 는 파일을 누구에게나 그대로 내준다. 표를 HTML 에 구워 두면
-- 로그인 화면을 씌워도 소스 보기 한 번이면 다 읽힌다. **로그인한 사람만 보게 하려면 데이터가
-- 페이지 밖에 있어야 한다.** 그래서 이 표에는 anon 권한을 아예 주지 않는다(research_outputs
-- 와 다른 점이다 — 그쪽은 열람 공개가 맞는 자료고, 이쪽은 연구실 내부 판정이 담긴 표다).
--
-- 정본은 여전히 옵시디언 볼트다. 이 표는 볼트에서 발행한 사본이고, 웹에서 고치지 않는다.
--
-- 실행 순서 (Supabase SQL Editor)
--   1) 이 파일
--   2) 저장소에서:  node scripts/publish-portfolio.mjs          (미리보기)
--      그 다음:     node scripts/publish-portfolio.mjs --push   (볼트 값으로 채움)
--
-- 되돌리기: drop table if exists public.portfolio_rows;

create table if not exists public.portfolio_rows (
  -- 행은 프로젝트 id (SFTF_HeatMethod 꼴), 메타는 '__meta__' 하나.
  id          text primary key,

  -- row  표의 한 줄
  -- meta  열 이름·투고 단계 팔레트·구운 날짜처럼 표를 그리는 데 필요한 부속 정보
  kind        text not null check (kind in ('row', 'meta')),

  -- 기본 정렬(프로젝트 이름 가나다순)에서의 자리. 페이지는 이 순서로 받아 자기 규칙으로 다시 정렬한다.
  sort_index  integer,

  -- 행 전체를 jsonb 로 담는다. 볼트 노트가 열을 늘리거나 줄여도 스키마를 따라 고칠 일이 없다 —
  -- 어차피 표를 그리는 쪽(portfolio.html)과 굽는 쪽(publish-portfolio.mjs)만 이 모양을 안다.
  data        jsonb not null,

  updated_at  timestamptz not null default now()
);

create index if not exists portfolio_rows_kind_idx on public.portfolio_rows (kind, sort_index);

---------------------------------------------------------------------------
-- 권한 — **anon 에게는 아무것도 주지 않는다.** 로그인 사용자만 읽고 쓴다.
---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on public.portfolio_rows from anon;
grant select, insert, update, delete on public.portfolio_rows to authenticated;

alter table public.portfolio_rows enable row level security;

-- anon 정책은 만들지 않는다. RLS 가 켜져 있고 정책이 없으면 anon 에게는 0행이다.
drop policy if exists "portfolio_rows authenticated full access" on public.portfolio_rows;
create policy "portfolio_rows authenticated full access"
on public.portfolio_rows for all
to authenticated
using (true)
with check (true);

---------------------------------------------------------------------------
-- 확인
---------------------------------------------------------------------------
select kind, count(*) from public.portfolio_rows group by kind order by kind;

-- 기대값: 발행 뒤 row 75 · meta 1 (2026-09-13 기준. 볼트의 프로젝트 노트 수에 따라 달라진다)
