-- 2026-2 timetable import from "시간표작성회의결과(07-01)_ccw.jpg".
-- Run this in Supabase SQL Editor.
--
-- Notes
-- - This replaces only public.tt_courses rows for semester '2026-2'.
-- - public.tt_professors and public.tt_rooms are preserved; missing names are added.
-- - Photo reading is approximate where post-it notes overlap grid lines.
-- - User correction applied: 수요일 6-7교시 고급프로그래밍언어 is entered as 2학년.

begin;

delete from public.tt_courses
where semester = '2026-2';

insert into public.tt_professors (semester, "sProfName", "sProfColor")
select '2026-2', v."sProfName", v."sProfColor"
from (
  values
    ('교양교직부', '#D0CECE'),
    ('장진호', 'orange'),
    ('설인환', 'green'),
    ('배근열', '#FF66FF'),
    ('은종현', '#5B9BD5'),
    ('이희란', '#937FCB'),
    ('정인희', 'yellow'),
    ('ROTC', '#F4FAA8'),
    ('학과', '#D9EAF7'),
    ('장진호, 배근열, 은종현', '#F4B183')
) as v("sProfName", "sProfColor")
where not exists (
  select 1
  from public.tt_professors p
  where p.semester = '2026-2'
    and p."sProfName" = v."sProfName"
);

insert into public.tt_rooms (semester, "sRoomName")
select '2026-2', v."sRoomName"
from (
  values
    ('G147'),
    ('G331'),
    ('G418'),
    ('G425'),
    ('G431'),
    ('G470'),
    ('G532'),
    ('G801'),
    ('GB109')
) as v("sRoomName")
where not exists (
  select 1
  from public.tt_rooms r
  where r.semester = '2026-2'
    and r."sRoomName" = v."sRoomName"
);

with course_blocks (
  "sClassDay",
  "sClassYear",
  "sClassName",
  "sClassProfName",
  "sClassType",
  "sClassRoom",
  times
) as (
  values
    ('월', '1학년', '귀가뚫리는영어', '교양교직부', '교양', '', array['3']),
    ('월', '1학년', '일반화학2', '은종현', 'MSC', 'G418', array['4']),
    ('월', '1학년', '글로벌커뮤니케이션', '교양교직부', '교양', 'G418', array['6','7']),
    ('월', '2학년', '★유기화학2', '장진호', '전필', 'G425', array['1','2']),
    ('월', '2학년', '☆고급프로그래밍언어', '설인환', 'MSC', 'G801', array['3']),
    ('월', '3학년', '★신소재가공학', '장진호', '전필', 'G425', array['3']),
    ('월', '3학년', '신소재기기분석', '배근열', '전선', 'G425', array['5']),
    ('월', '3학년', '소재기획', '정인희', '전선', 'G801', array['6','7','8','9']),
    ('월', '대학원', '석사논문연구', '장진호', '대학원', 'G470', array['1','2','3']),
    ('월', '대학원', '고분자신소재특론', '배근열', '대학원', 'G470', array['6','7','8']),

    ('화', '1학년', '귀가뚫리는영어', '교양교직부', '교양', '', array['3']),
    ('화', '1학년', '대학수학2', '교양교직부', 'MSC', 'G532', array['5']),
    ('화', '1학년', '★창의입문설계', '이희란', '전필', 'GB109', array['6','7','8']),
    ('화', '2학년', '★텍스타일재료학', '은종현', '전필', 'G425', array['3','4']),
    ('화', '3학년', '기능성어패럴제품설계', '이희란', '전선', 'G425', array['2']),
    ('화', '3학년', '☆염색가공실험', '장진호, 배근열, 은종현', '전선', 'G425', array['6','7','8','9']),
    ('화', '4학년', '소재디자인산업진로분석', '정인희', '전선', 'G801', array['3','4']),

    ('수', '1학년', '대학수학2', '교양교직부', 'MSC', 'G418', array['1','2']),
    ('수', '1학년', '일반화학실험2', '교양교직부', 'MSC', 'G147', array['3']),
    ('수', '1학년', '일반물리학2', '교양교직부', 'MSC', 'G431', array['4']),
    ('수', '1학년', '(자율전공) 소재와디자인', '교양교직부', '교양', 'GB109', array['6','7']),
    ('수', '1학년', '일반물리학실험2', '교양교직부', 'MSC', '', array['6','7']),
    ('수', '2학년', '★유기화학2', '장진호', '전필', 'G425', array['1']),
    ('수', '2학년', '전공회의', '학과', '회의', 'G470', array['4']),
    ('수', '2학년', '☆고급프로그래밍언어', '설인환', 'MSC', 'G801', array['6','7']),
    ('수', '2학년', '재료과학', '배근열', '전선', 'G425', array['8','9']),
    ('수', '3학년', '3D어패럴캐드', '설인환', '전선', 'G801', array['3']),
    ('수', '3학년', '전공회의', '학과', '회의', 'G470', array['4']),
    ('수', '3학년', '신소재기능복식', '배근열', '전선', 'G425', array['8','9']),
    ('수', '4학년', '★소재디자인공학창의종합설계2', '학과', '전필', '', array['2','3']),
    ('수', '4학년', '소재디자인산업진로분석', '정인희', '전선', 'G801', array['5']),

    ('목', '1학년', '일반화학2', '은종현', 'MSC', 'G331', array['2']),
    ('목', '1학년', '일반화학2', '은종현', 'MSC', 'G418', array['3','4']),
    ('목', '1학년', '대학수학2', '교양교직부', 'MSC', 'G418', array['5']),
    ('목', '1학년', '일반화학실험2', '교양교직부', 'MSC', 'G147', array['7','8']),
    ('목', '2학년', '재료과학', '배근열', '전선', 'G425', array['5']),
    ('목', '2학년', '★텍스타일재료학', '은종현', '전필', 'G425', array['6']),
    ('목', '3학년', '★신소재가공학', '장진호', '전필', 'G425', array['1','2']),
    ('목', '3학년', '기능성어패럴제품설계', '이희란', '전선', 'G425', array['3','4']),
    ('목', '3학년', '3D어패럴캐드', '설인환', '전선', 'G801', array['6','7']),
    ('목', '4학년', '군사학', 'ROTC', '교양', '', array['1','2']),

    ('금', '1학년', '일반물리학2', '교양교직부', 'MSC', 'G418', array['3','4']),
    ('금', '4학년', '군사학', 'ROTC', '교양', '', array['5','6','7','8']),
    ('금', '대학원', '어패럴테크놀로지와 3D패턴', '이희란', '대학원', 'G470', array['1','2','3','4']),
    ('금', '대학원', '어패럴디자인연구', '이희란', '대학원', 'G470', array['6','7','8'])
)
insert into public.tt_courses (
  semester,
  "sClassProfName",
  "sClassYear",
  "sClassName",
  "sClassDay",
  "sClassTime",
  "sClassRoom",
  "sClassType"
)
select
  '2026-2',
  cb."sClassProfName",
  cb."sClassYear",
  cb."sClassName",
  cb."sClassDay",
  t."sClassTime",
  cb."sClassRoom",
  cb."sClassType"
from course_blocks cb
cross join lateral unnest(cb.times) as t("sClassTime");

commit;

-- Quick checks after execution.
select count(*) as inserted_2026_2_courses
from public.tt_courses
where semester = '2026-2';

select
  "sClassDay",
  "sClassYear",
  "sClassTime",
  count(*) as courses_in_same_slot,
  string_agg("sClassName", ' / ' order by "sClassName") as course_names
from public.tt_courses
where semester = '2026-2'
group by "sClassDay", "sClassYear", "sClassTime"
having count(*) > 1
order by "sClassDay", "sClassYear", "sClassTime";
