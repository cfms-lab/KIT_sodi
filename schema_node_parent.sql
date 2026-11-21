-- research_outputs 노드 행의 부모 · 훌 칸 (2026-11-21, 사용자 지시 — 「새 노드를 표에서 자동으로」).
--
-- 전에는 새 논문 노드가 세 화면에 뜨려면 손이 셋 들었다 — graph 는 생성기(layout_findings.py)에 노드 · 선 · 훌 ·
-- 좌표를 적고 재생성, mindmap 은 applyXxx 마이그레이션, 표는 손 SQL INSERT. 이제 볼트 노트에
--   node_parent: SFTF_ActiveOverprint   # 부모 노드(노트 이름 · graph 노드 id · 분리 트랙 이름)
--   node_hull: Physics-AI               # (골라서) graph 훌 이름 — 공저자 훌이면 「이희란 교수님」 꼴
-- 를 적고 scripts/publish-portfolio.mjs --sql (--only 이름) 으로 보내면, 발행기가 노드 행이 없을 때 만들고(이 칸이
-- 있는 노트만) 두 화면이 로딩 때 붙인다 — graph 는 부모 옆(저장한 좌표가 있으면 그 자리) + 부모→자식 선 + 훌,
-- mindmap 은 부모 밑(부모가 문서에 없으면 훌 이름과 같은 최상위 가지 밑).
--
-- **칸이 빈 행은 아무 일도 일어나지 않는다.** 2026-11-21 에 노드 행 104개 가운데 graph 에 있는 것은 46개뿐이다 —
-- 나머지는 mindmap 전용이거나 내린 노드라, 「표에 있으면 붙인다」로 하면 화면이 쏟아진다. 그래서 옵트인이다.
-- 지도에서 사용자가 지운 노드는 mindmap 문서의 dismissedTableNodes 가 기억해 다시 붙이지 않는다.
-- 볼트 쪽 publish-research-outputs.mjs 는 이 두 칸을 모른다(보내는 칸만 upsert 하므로 지우지도 않는다).
--
-- 읽기는 research_outputs 의 기존 정책 그대로(anon 읽기) — 부모 이름과 훌 이름은 graph.html 에 이미 공개된 값이다.
--
-- 되돌리기: alter table public.research_outputs drop column if exists node_parent, drop column if exists node_hull;

alter table public.research_outputs add column if not exists node_parent text;
alter table public.research_outputs add column if not exists node_hull text;

comment on column public.research_outputs.node_parent is
  '부모 노드 — 볼트 노트 frontmatter node_parent (2026-11-21~). 채워진 노드 행만 graph · mindmap 이 화면에 없을 때 붙인다';
comment on column public.research_outputs.node_hull is
  'graph 훌 이름 — 볼트 노트 frontmatter node_hull (2026-11-21~). mindmap 은 부모가 없을 때 같은 이름의 최상위 가지로 쓴다';
