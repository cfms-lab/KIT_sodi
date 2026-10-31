# 공저자 색 · 훌(그룹) 재편 런북 — upjuk · graph · mindmap

2026-10-31 에 세 화면의 색 규칙을 **공저자** 기준으로 바꿨다(커밋 a923a39 → 2faab39 → 80547b4 → 417a133).
다음에 공저자를 넣거나, 훌 색을 바꾸거나, 훌을 새로 세우거나, 마인드맵을 다시 묶을 때 이 문서대로 한다.

## 한 줄 요약

세 화면이 **공저자 파스텔 한 벌**을 쓴다. 같은 값이 **세 파일에 따로** 박혀 있고 발행 경로(볼트 → 표 → 화면)가
없으므로 손으로 같이 고친다. 팔레트의 정본 표는 `layout_findings.py` 의 `HYPEREDGES` 바로 앞 주석이다.

| 화면 | 값이 있는 곳 | 무엇을 칠하나 | 판정 기준 |
|---|---|---|---|
| `upjuk.html` | `:root` 의 `--au-lee` `--au-eun` `--au-kim` · `AUTHOR_COLORS` · `rowPaint()` | 업적 한 줄의 배경 | 저자 칸에 교수 이름이 있나(저자 필터와 같은 `checkName`) |
| `graph.html` | `layout_findings.py` `HYPEREDGES` 의 `fill`(면) · `color`(테두리·점선) · `labelColor` → 재생성이 `const hyperedges` 한 줄에 굽는다 | 훌(hyperedge)의 면·테두리·라벨 | 훌 구성원 목록(`nodes`) |
| `mindmap.html` | `GROUP_FILLS`(렌더) · `HULL_GROUPS`(재편 마이그레이션) | 노드 **면색 = 최상위 가지**, **테두리 = 등급(KIND)** | 노드가 속한 최상위 가지. 가지는 id 로 먼저, 없으면 제목 정규식 |

### 팔레트 (2026-10-31)

| 묶음 | fill(면) | color(테두리) | labelColor | 비고 |
|---|---|---|---|---|
| 이희란 | `#c9bfe5` | `#937fcb` | `#5b45a3` | 사용자 지정. timetable 교수 색 `#937FCB` 를 흰색에 50% |
| 은종현 | `#adcdea` | `#5b9bd5` | `#2f6ea8` | 사용자 지정. timetable `#5B9BD5` 를 50% |
| 김우석 | `#e0e0e0` | `#9e9e9e` | `#616161` | 사용자 지정. 시간표에 없음. 50% 로 밝히면 흰 줄과 구별이 안 돼 **원색 유지** |
| 3D프린팅 | `#bfe6d6` | `#2f8f7a` | `#1f6b5a` | 민트 |
| Physics-AI | `#f6e7a9` | `#c9a227` | `#8a6d0f` | 버터 |
| Rendering | `#f5c6d5` | `#d4789a` | `#9d3f63` | 로즈 |
| Drape | `#f9d3b4` | `#e8955a` | `#b35f24` | 피치 |
| 전석진 | `#d3e8b5` | `#8ab65a` | `#4f7a24` | 연두 |
| 방대석 | `#d9cdb4` | `#a89470` | `#6e5a35` | 모래 |

- timetable 의 교수 색은 Supabase `tt_professors.sProfColor` 다(학기마다 같은 값). MCP 가 붙어 있으면
  `select semester,"sProfName","sProfColor" from tt_professors where "sProfName" in ('…')` 로 읽는다.
- 50% 섞기는 채널마다 `(원색 + 255) / 2` 다. 원색 그대로 줄 전체를 덮으면 너무 짙다(사용자, 10-31).
- 파스텔 면에서 글자 대비: upjuk 은 색칠된 줄(`.paper.au`)에서만 DOI 를 제목 파랑, 연구비를 `--green-d` 로
  낮춘다(WCAG AA 4.5:1). mindmap 은 글자를 늘 잉크색(`INK`)으로 둔다.

## 1. 공저자 한 사람을 새로 넣을 때 (upjuk)

1. 표의 저자 표기를 먼저 본다 — 한글·영문이 섞여 있다.
   ```sql
   select id, p_year, authors from research_outputs
    where kind = 'output' and (authors ilike '%김우석%' or authors ilike '%Woosuk%') order by p_year desc;
   ```
2. `upjuk.html` `PEOPLE` 에 한 줄: `{NAME:"김우석",ENGNAME_FIRST:"Woosuk",ENGNAME_SECOND:"",ENGNAME_LAST:"Kim"}`.
   한글은 `checkName` 의 부분 일치로, 영문은 First/Last 토큰 일치로 잡힌다(「김우석*」·「Woosuk Kim」 둘 다).
   같은 성의 다른 저자(「Sung min Kim」·「Jae Ryoung Kim」)가 안 잡히는지 확인한다.
3. 색까지 주려면 `:root` 에 `--au-xxx`, `AUTHOR_COLORS` 에 `{NAME:"…",COLOR:"var(--au-xxx)"}` 한 줄. 둘 이상이
   같이 쓴 줄은 `rowPaint` 가 세로 띠(linear-gradient)로 나눈다.
4. 검증은 브라우저 없이도 된다 — `<script>` 를 node `vm` 에서 돌려(`document`·`localStorage`·`fetch` 를 빈 객체로
   흉내) `authorColors({AUTHORS:"…"})` 를 표의 실제 저자 문자열로 찍어 본다. 10-31 에 쓴 스크립트의 요지:
   ```js
   const src = html.match(/<script>([\s\S]*?)<\/script>/)[1] + ";globalThis.__t={checkName,authorEng,authorColors,rowPaint,PEOPLE};";
   vm.runInContext(src, sandbox);   // sandbox.document.getElementById = () => ({value:"",style:{},classList:{toggle(){}}, …})
   ```
5. 커밋·푸시(`upjuk.html` 한 파일). 재생성·SQL 없음.

## 2. 훌 색만 바꿀 때 (graph + mindmap 의 같은 값)

1. **작업 트리가 깨끗한지** 보고, 생성기를 **드라이런**으로 한 번 돌려 `git diff` 가 비는지 확인한다. 비지
   않으면 파일에 없는 노드의 좌표·등급이 되돌아가는 것이므로 [graph-positions-runbook.md](graph-positions-runbook.md)
   의 `pull` 부터 한다. 2026-10-31 은 diff 없음이었다.
   ```bash
   PY="$APPDATA/uv/python/cpython-3.13.13-windows-x86_64-none/python.exe"   # .venv 는 죽어 있다
   "$PY" -X utf8 layout_findings.py && git diff --stat
   ```
2. `layout_findings.py` `HYPEREDGES` 에서 그 훌의 `fill` · `color` · `labelColor` 를 고치고, 앞 주석의 팔레트 표도 같이.
3. 생성기를 **두 번** 돌려 두 결과가 같은지(`cmp`) 본다. `git diff -U0 -- graph.html | grep ^@@` 가 `const hyperedges`
   한 줄(1753 부근)만 가리켜야 한다.
4. `mindmap.html` `GROUP_FILLS` 의 같은 묶음 `fill`·`stroke` 를 같은 값으로. upjuk 은 교수 셋만 해당(`--au-*`).
5. 검증 → 커밋·푸시 (아래 3절).

그리기 구조(10-31~): 면은 `network.on('beforeDrawing')` 이 볼록껍질을 계산해 칠하고 `_hullFrame` 에 다각형을
남긴다(노드·엣지 **뒤**). `afterDrawing` 은 같은 다각형에 테두리·라벨만 올린다. `fillAlpha` 는 1.0 이다
(graph3d.html 은 0.24 로 자르고 자기 `HULL_PALETTE` 를 쓴다 — 3D 는 이 색을 안 받는다).

## 3. 훌을 새로 세우거나 구성원을 바꿀 때 (graph → mindmap 재편)

### graph 쪽

1. `HYPEREDGES` 에 항목을 넣거나 `nodes` 를 고친다(한 노드는 한 훌). `scripts/check-graph-html.mjs` 의
   `expectedHulls` 가 라벨·구성원을 **고정**하므로 거기도 같이 고친다.
2. 구성원 변경은 `--edges-only` 로는 안 되고 **전체 재생성**이다 — 2절 1·3 의 드라이런·두 번 돌리기 그대로.
3. 배포본의 실제 구성원은 `graph.html` 의 `const hyperedges` 한 줄 + `CURATED_HYPEREDGE_MEMBERS`(런타임에 붙는
   큐레이션 노드)다. 읽을 때:
   ```bash
   sed -n 1753p graph.html | sed 's/^const hyperedges = //; s/;$//' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const h of JSON.parse(s))console.log(h.label,"|",h.nodes.join(","))})'
   ```

### mindmap 쪽 — 재편은 마이그레이션이다

마인드맵의 실제 트리는 파일이 아니라 Supabase `mindmaps`(id `cfms`) 의 `data` 다. anon 키는 읽기만 되므로 구조
변경은 **로드 때 도는 `applyXxxYYYYMMDD(data)`** 로 한다. 로그인한 사용자가 페이지를 한 번 열어야 저장된다.

1. **실제 문서를 받아 본다** (파일의 `DEFAULT_DATA` 는 낡았다).
   ```bash
   URL=$(grep -o 'BAKED_URL="[^"]*"' mindmap.html | cut -d'"' -f2); KEY=$(grep -o 'BAKED_KEY="[^"]*"' mindmap.html | cut -d'"' -f2)
   curl -s "$URL/rest/v1/mindmaps?id=eq.cfms&select=data" -H "apikey: $KEY" -H "Authorization: Bearer $KEY" -o <스크래치>/mindmap-doc.json
   ```
   트리는 node 한 줄로 찍는다(`JSON.parse(..)[0].data.root` 를 재귀로 `id | title | kind`).
2. **graph id → 마인드맵 노드 id** 대응은 `research_outputs` kind='node' 의 `mindmap_id` 로 시작하되 **실제 문서로
   확인**한다. 표가 낡은 예: cfmsAutoSew 는 표에 `n3k56wq4`, 실제는 `nq1owe91`. 문서에 없는 구성원
   (SFTF_DrapeOverprint · SFTF_HeatMethod · cfmsAutoGrading · cfmsPINNCAD)은 건너뛴다.
3. 새 마이그레이션을 `//==PURE_START` ~ `//==PURE_END` 안, 직전 마이그레이션 뒤에 쓴다. 10-31 의
   `applyHullRegroup20261031` 이 본보기이고, 재편 규칙은 이것이다 — 다음 재편도 같은 규칙으로:
   - 훌 구성원은 자기 훌 가지 아래로. 다만 **가장 가까운 훌 조상(훌 구성원 또는 훌 가지)이 같은 훌**이면 그 밑에
     남아 계보를 지킨다(Tomo_DFSVR 밑 DFSVR 셋, HIPDetect 밑 PFTF_Compression).
   - 훌에 없는 노드는 부모를 따라간다(PFTF 는 Tomo_SFTF 밑, 지진 응용은 DTS 밑). 어느 구성원 밑에도 없으면 제자리(기타).
   - 기존 방(id)은 그대로 가지로 쓰고 옛 제목일 때만 새 제목. 새 그룹(`hull_*`)은 구성원이 문서에 있을 때만 세운다.
   - 끊기는 부모→자식 계보는 관계선 `{from,to,label:'계보',type:'engine'}` 으로 남긴다. 부모가 그룹이거나 어느
     방향으로든 선이 이미 있으면 긋지 않는다.
   - 옮길 대상은 **옮기기 전 트리**로 정하고, 버전 도장(`data.xxxVersion`)을 찍어 한 번만 돈다. 사용자가 끌어 옮긴
     것은 되감지 않는다.
4. **호출부 네 곳**에 끼운다: 기본 `DATA` 체인(`applyChoMoldWarpRetire20261027(DATA);` 다음), `loadDoc` 의
   `const xxxMigrated=…` + `if(created||…||xxxMigrated||kindsMigrated) await saveDoc(true)`, `catch` 폴백 체인,
   `importJSON` 체인. `grep -n "applyChoMoldWarpRetire20261027" mindmap.html` 이 네 자리를 다 보여 준다.
5. `scripts/check-mindmap-html.mjs`: 노출 줄(`globalThis.__applyXxx=applyXxx…;` 를 `__validate` 앞에)과 샘플 테스트
   (실행됨 · 멱등 · 자식 순서 · 관계선 · 노드 수 · `__validate` ok · 노드 없는 문서는 도장만). 10-31 의 `hullSample`
   이 실제 문서의 축소판이라 복사해서 고치면 된다.
6. `APP_VERSION` 을 올린다(화면 태그로 배포 확인).
7. **실제 문서로 시뮬레이션**한다 — PURE 구간을 `vm` 으로 돌려 1 에서 받은 문서에 적용하고 트리·새 관계선·노드 수·
   멱등·validate 를 찍는다(10-31 결과: 92→96 노드, 13→16 선). 결과 트리를 눈으로 훑은 뒤 커밋한다.
8. `GROUP_FILLS` 에 새 가지 한 줄(`id` + 제목 정규식 + 팔레트). 색은 렌더가 최상위 가지로 정하므로 마이그레이션은
   구조만 바꾼다.

### 방을 손으로 만들거나 이름을 바꿀 때

색은 `GROUP_FILLS` 가 id → 제목 정규식 차례로 찾으므로, 제목에 교수 이름(「이희란」 등)이 들어가면 그대로 색이
붙는다. 새 교수·새 주제는 `GROUP_FILLS` 한 줄이면 되고 재편 마이그레이션은 필요 없다(노드는 사용자가 끌어 옮긴다).

## 4. 검증 · 배포 명령

```bash
node scripts/check-graph-html.mjs                     # 훌 라벨·구성원·좌표·가드 리터럴
node scripts/check-mindmap-html.mjs                   # 마이그레이션 샘플 테스트 포함
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/publish-research-views.ps1   # 통합(푸시 없음). pwsh 는 없다
git add graph.html layout_findings.py mindmap.html scripts/check-mindmap-html.mjs scripts/check-graph-html.mjs
git commit -m "graph·mindmap: … (사용자, YYYY-MM-DD)" && git push origin main
```

`publish-research-views.ps1 -Push` 는 html 외 파일이 바뀌면 중단하므로 이 작업은 커밋·푸시를 직접 한다.

## 5. 함정

- **생성기가 다시 쓰는 문구를 건드리지 않는다.** `graph.html` 에서 `// afterDrawing passes ctx already transformed …`
  주석(라벨 헬퍼 삽입 기준점), `network.on('afterDrawing', function(ctx) {` + `if (!showHyper) return;` 두 줄,
  8칸 들여쓴 `// Label …` ~ `ctx.setLineDash([]);` 블록, `*_BEGIN/*_END` 마커 블록. 새 코드는 마커 블록 **밖**
  (10-31 은 `_roundedPolyPath` 뒤, `HYPEREDGE_LABEL_HELPERS_BEGIN` 앞)에 둔다. 확인은 「재생성 두 번 → 같은 파일」.
- `scripts/check-graph-html.mjs` 는 `if (positions.length < 1) return;` 리터럴을 요구한다(단일 노드 훌 가드).
- `scripts/check-mindmap-html.mjs` 는 `none:  {fill:'#94a3b8'` 리터럴을 요구하므로 `KIND` 표는 그대로 둔다 —
  면색을 바꾸고 싶으면 렌더(`render`·`renderLegend`)에서 바꾼다.
- 전체 재생성은 파일에 없는 노드의 좌표·등급을 되돌린다 — 반드시 드라이런으로 `git diff` 가 비는지 먼저.
- 마인드맵 마이그레이션은 **비로그인 방문자에게는 저장되지 않는다**(화면만 바뀐다). 배포 뒤 로그인해서 한 번 연다.
- upjuk 의 「printed」는 stage `published` 다(특허·학회·저널 모두).
- 파일은 모두 LF 다. 커밋 때 나오는 「LF will be replaced by CRLF」는 autocrlf 안내일 뿐이다.
- 세 파일의 같은 값을 **한 곳만** 고치면 upjuk 줄·graph 훌·mindmap 가지가 다른 색으로 갈린다.

## 6. 참고

- [graph-positions-runbook.md](graph-positions-runbook.md) — 좌표·재생성·`pull`
- [homepage-update-runbook.md](homepage-update-runbook.md) — 업적 행·노드 행 SQL
- 메모리 `coauthor-pastel-palette-sync` · `mindmap-cloud-doc-migration` · `graph-edges-only-regeneration`
- 10-31 커밋: a923a39(upjuk 저자·행 배경) · 2faab39(50% 밝힘) · 80547b4(김우석 #e0e0e0) · 417a133(graph 훌·mindmap 재편)
