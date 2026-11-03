-- portfolio_links: portfolio.html 툴바에 붙는 「지도·문서」 링크 목록.
--
-- 왜 표로 두나 — portfolio_rows 와 같은 이유다. GitHub Pages 는 파일을 누구에게나 내주므로
-- 주소를 HTML 에 적으면 로그인 화면을 씌워도 소스 보기 한 번이면 읽힌다. 로그인한 사람에게만
-- 보이려면 주소가 페이지 밖에 있어야 한다. 그래서 anon 권한을 주지 않는다.
--
-- 첫 행(2026-11-03): SFTF 7편 지도 — 일곱 원고가 파이프라인의 어느 칸을 바꾸는지 그린 Artifact.
-- Artifact 자체도 비공개라, 링크를 봐도 공유 받은 계정이 아니면 열리지 않는다.
--
-- 행을 더하거나 고칠 때는 Supabase SQL Editor 에서 upsert 한다. 볼트가 발행하는 표가 아니므로
-- publish-portfolio.mjs 는 이 표를 건드리지 않는다.
--
-- 되돌리기: drop table if exists public.portfolio_links;

create table if not exists public.portfolio_links (
  id          text primary key,            -- 짧은 슬러그 (sftf-seven-map 꼴)
  label       text not null,               -- 칩에 보이는 글자
  url         text not null,               -- https 주소만 (portfolio.html 이 그 밖은 그리지 않는다)
  note        text,                        -- 칩 툴팁
  sort_index  integer not null default 100,
  updated_at  timestamptz not null default now()
);

---------------------------------------------------------------------------
-- 권한 — anon 에게는 아무것도 주지 않는다. 로그인 사용자만 읽고 쓴다.
---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
revoke all on public.portfolio_links from anon;
grant select, insert, update, delete on public.portfolio_links to authenticated;

alter table public.portfolio_links enable row level security;

drop policy if exists "portfolio_links authenticated full access" on public.portfolio_links;
create policy "portfolio_links authenticated full access"
on public.portfolio_links for all
to authenticated
using (true)
with check (true);

---------------------------------------------------------------------------
-- 첫 행
---------------------------------------------------------------------------
insert into public.portfolio_links (id, label, url, note, sort_index) values
  ('sftf-seven-map', 'SFTF 7편 지도',
   'https://claude.ai/artifact/DJ8HXsfJ3hzRZuM7JZvUGL',
   'SFTF 계열 7편이 공유 파이프라인의 어느 칸을 바꾸는지 · 인용 계보 · 헷갈리는 쌍 (2026-11-03). 비공개 Artifact — 공유 받은 계정만 열린다',
   10)
on conflict (id) do update
  set label = excluded.label, url = excluded.url, note = excluded.note,
      sort_index = excluded.sort_index, updated_at = now();

---------------------------------------------------------------------------
-- 확인
---------------------------------------------------------------------------
select id, label, sort_index from public.portfolio_links order by sort_index;
