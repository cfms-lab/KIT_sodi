# 홈페이지 갱신 런북 — 투고·원고번호·게재 같은 사건을 화면에 반영하기

> 2026-10-16 정리. SFTF_DrapeOverprint 한국섬유공학회지 투고를 반영하면서 그동안의 선례
> (`tmp/research-outputs-*.sql`, 커밋 `f0dbe50` · `9421378`)를 한곳에 모았다.
> 좌표 작업은 따로 있다 — [graph-positions-runbook.md](graph-positions-runbook.md).

## 한 줄 요약

**볼트 노트를 먼저 고치고, SQL 을 만들어 클로드가 Supabase MCP 로 보낸다(사용자는 승인 창에서 허용).**
화면 글자까지 바꾸려면 저장소 파일(그래프·마인드맵·todo)도 고쳐 푸시한다.

**2026-10-21 부터 쓰기 경로가 바뀌었다.** 그전에는 클로드 셸에 쓰기 자격이 없어 사용자가 SQL 을
SQL Editor 에 붙여넣었다. 이제 Claude Code 에 Supabase 공식 MCP 서버가 붙어 있다(사용자 범위 `-s user`,
`--project-ref=ijutjirouxgqcldjyhma --features=database`, 토큰은 사용자 PAT). 클로드는 `execute_sql` 로
SQL 을 직접 보내고, 사용자는 **승인 창에 뜬 SQL 전문을 보고 허용**한다. 읽기도 같은 도구로 한다 —
anon 키로는 못 읽던 `portfolio_rows`(로그인 전용)까지 보인다.

- 승인 창에서 읽을 수 있게 **부분 SQL** 을 보낸다: `node scripts/publish-portfolio.mjs --sql --only A,B`
  (아래 ③ (나)). 전체 판(`--sql`, 약 140KB)은 승인 창으로 보내지 않고 예전처럼 SQL Editor 에 붙인다.
- MCP 가 안 붙어 있으면(도구 목록에 `mcp__supabase__*` 가 없으면) 예전 길 — SQL 파일을 넘기고 사용자가
  SQL Editor 에서 Run — 로 돌아간다. 다시 붙이는 명령은 맨 아래 「참고」.

## 1. 어느 화면이 어디서 읽나

| 화면 | 읽는 곳 | 사건이 바꾸는 것 |
|---|---|---|
| `graph.html` | 파일에 구운 값(`layout_findings.py` → `graph.html`) 위에 **`research_outputs` kind='node'** 를 덮는다(`r.id` = 그래프 노드 id). 좌표만 `graph_positions` | 단계 파이(stage) · 배지 · 등급 설명 · 병목 · 소개 |
| `mindmap.html` | 클라우드 문서 `mindmaps`(id `cfms`) 위에 **`research_outputs` kind='node'** 를 덮는다(`mindmap_id` 또는 `id` 로 짝지음) | 노드 상태·메모. ⚠ **트리에 이미 있는 노드만** 덮는다 |
| `upjuk.html` | **`research_outputs` kind='output'** (업적 행). grade='ToDo' 인 노드 행은 TODO 로 보인다 | 업적 목록·배지(Submit/Accept/…) |
| `portfolio.html` | **`portfolio_rows`** (로그인 필요). 볼트에서 생성 | 단계 · 저널 · 투고순서 · 완성도 · 다음 게이트 |
| `todo.js` | 저장소 파일 | 그래프·포트폴리오의 「할 일」 한 줄(DB 값보다 먼저 쓴다) |

`research_outputs` 한 표가 노드 행과 업적 행을 모두 갖는다(`schema_research_outputs.sql`).

## 2. 순서

### ① 볼트를 고친다 (정본)

`D:\cfms-research-vault\Projects\{프로젝트}.md` frontmatter:

| 키 | 투고 때 | 비고 |
|---|---|---|
| `stage` | `submitted` | 어휘: published inprint accepted revision submitted draft undecided blocked cancelled idea |
| `badge` | `"한국섬유공학회지 투고 완료 (2026-10-16, 원고번호 할당중)"` | 그래프 배지로 그대로 뜬다 |
| `submission` · `next_gate` · `bottleneck` | 투고 사실 · 「원고번호 발급 대기」 · 「심사 대기 …」 | 병목은 그래프 「남은 병목」 |
| `paper_completeness` | `1` (+ `_commit` · `_date`) | **투고본은 1** 이 규칙 |
| `mindmap_id` | 노드 행 키. 없으면 노트 이름으로 새로 만든다 | 이게 있어야 발행 SQL 이 노드 행을 갱신한다 |
| `papers_ids` | `[262]` 처럼 업적 행 번호 | 진행 중 원고는 UPJUK 노트 없이 프로젝트 노트가 업적 행을 소유한다 |

그리고 `Dashboards\프로젝트현황.md` 의 `const 투고순서 = {…}` 에 **`"{프로젝트}": 1`** —
나간 원고는 투고순서도 1 이다. 한 노트에 논문이 여럿이면(TSE_SEM, Tomo_Shell2026) 같은 파일의
`분리트랙` 배열을 고친다.

### ② 표에 행이 있는지 읽어 본다

있으면 UPDATE, 없으면 INSERT 다. **새 프로젝트는 노드 행도 업적 행도 없는 경우가 많다**
(그래프 노드와 좌표만 세워 둔 상태). MCP 가 붙어 있으면 `execute_sql` 에 select 하나로 끝난다:

```sql
select id, kind, stage, mindmap_id, papers_id from public.research_outputs
 where id = 'SFTF_X' or mindmap_id = 'SFTF_X' or project_id = 'SFTF_X';
select max(papers_id) from public.research_outputs where kind = 'output';   -- 다음 빈 번호는 +1
```

MCP 가 없을 때의 anon 조회(`portfolio_rows` 는 못 읽는다):

```js
// 저장소 밖 스크래치 폴더에 .mjs 로 저장해 `node 파일.mjs` 로 돌린다(SFTF_X 를 바꿔서).
// anon 키는 publish-portfolio.mjs 에서 읽는다.
import { readFileSync } from "node:fs";
const s = readFileSync("D:/IIS_Home/KIT_sodi/scripts/publish-portfolio.mjs", "utf8");
const URL = s.match(/"(https:\/\/[a-z0-9]+\.supabase\.co)"/)[1], KEY = s.match(/\|\|\s*"(eyJ[^"]+)"/)[1];
const q = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }).then((r) => r.json());
console.log(await q("research_outputs?or=(id.eq.SFTF_X,mindmap_id.eq.SFTF_X,project_id.eq.SFTF_X)&select=id,kind,stage,mindmap_id,papers_id"));
console.log(await q("research_outputs?kind=eq.output&select=id,papers_id&order=papers_id.desc.nullslast&limit=1")); // 다음 빈 번호
```

### ③ SQL 두 파일을 만든다

**(가) 손으로 쓰는 것** — `tmp/research-outputs-{날짜}-{이름}.sql` (`tmp/` 는 gitignore)

- **노드 행이 없으면 INSERT**: `id` = `mindmap_id` = `vault_note` = 노트 이름, `kind='node'`, 값은 볼트
  frontmatter 그대로(grade·badge·grade_note·bottleneck·brief·repository→url·path→project_path).
  선례: `Cho_MoldWarpDIC`(볼트 `tmp/publish-2026-09-22.sql`), `SFTF_DrapeOverprint`(이 저장소 `tmp/`, 10-16).
- **업적 행이 없으면 INSERT**: `id = 'p{다음 번호}'`, `papers_id` 같은 번호, `kind='output'`,
  `vault_note`·`project_id` = 노트 이름. 앞에 번호가 비었는지 확인하는 `do $$ … raise exception … $$` 를 둔다.
  선례: `upjuk-urbantraffic.sql`(p261), `research-outputs-2026-10-16-drapeoverprint.sql`(p262).
- **이미 있으면 UPDATE**: `where kind = … and id = …` 에 `and (stage is distinct from …)` 를 붙여
  여러 번 돌려도 안전하게. 선례: `research-outputs-2026-10-09-tensor.sql`.
- 맨 아래에 확인 `select` 를 둔다(이웃 행까지 같이 보이게).

**업적 행 칸 쓰는 법** (같은 학회지 이웃 행을 먼저 읽고 따른다)

| 칸 | 값 |
|---|---|
| `title` | `(약칭) 논문 제목` — 예 `(SFTF_DrapePrior) 의복 드레이프 …` |
| `categ` | `DJ` 국내저널 · `IJ` 해외저널 · `DC`/`IC` 학회 |
| `authors` | 투고본 표제 순서. 교신이 여럿이면 `*` 표시(`강지언, 설인환*, 이희란*`), 단독이면 `설인환` |
| `volume` · `page` · `doi` | 게재 전에는 빈 문자열 `''` |
| `p_year` · `p_month` · `p_day` | **투고일이 아니라 예상 게재일.** TSE 는 짝수달 말 발행 |
| `memo` | 투고 사실 — 날짜 · 트랙 · 분야 · 교신 · 원고번호(없으면 「할당중」) · 영문 제목 |
| `funding` | `중견과제2026년` 등 이웃 행과 같은 표기 |

`stage` 가 `draft` 에서 벗어나면 비로그인 방문자에게도 upjuk 에 보인다 — 나간 원고는 그게 맞다.

**(나) 생성하는 것** — `tmp/portfolio-rows.sql`

```powershell
cd D:\IIS_Home\KIT_sodi
node scripts/publish-portfolio.mjs --sql
```

볼트 전체에서 `portfolio_rows` 를 다시 만들고(**볼트에 없는 행은 지운다**), 같은 파일 ② 에서
`research_outputs` 노드 행을 `mindmap_id` 로 UPDATE 한다(행을 만들지는 않는다). 다른 세션이 볼트를
고쳐 둔 것도 함께 실린다 — 돌리기 전 사본을 떠 두고 행 id 를 비교해 의도하지 않은 추가·삭제가
없는지 본다.

**부분 판(평소에 쓰는 것)** — `tmp/portfolio-rows-partial.sql`

```powershell
node scripts/publish-portfolio.mjs --sql --only SFTF_HeatMethod,SFTF_Holonomy
```

사건이 건드린 프로젝트의 포트폴리오 행과 노드 행만 담는다(수 KB). 메타 행과 삭제는 없다.
`--only` 에는 포트폴리오 행 id(분리 트랙은 `TSE_SEM1_Bezier` 꼴)나 노트 이름·`mindmap_id` 를 쓰고,
어디에도 없는 id 는 오타로 보고 멈춘다. 보내기 전에 표의 지금 값과 볼트 값을 대조해, 바뀌는 칸이
의도한 것뿐인지 본다 — **다른 세션이 같은 노트를 고치는 중이면 그 값도 함께 실린다**
(2026-10-21 HeatMethod·Holonomy 저장소 개명이 그랬다).

### ④ 보낸다

**(가) → (나) 순서.** (나) 의 노드 UPDATE 는 행이 있어야 닿으므로 INSERT 가 먼저다.

- **MCP 가 있을 때**: 파일 내용을 그대로 `execute_sql` 로 보낸다. 사용자가 승인 창에서 허용한다.
  보낸 뒤 확인 `select` 를 따로 한 번 돌려 값이 들어갔는지 본다(여러 문장을 한 번에 보내면 결과는
  마지막 문장 것만 온다). 처음 쓰는 모양의 SQL 은 끝의 `commit;` 을 `rollback;` 으로 바꿔 한 번
  시험해 보고 보낸다 — 부분 판은 2026-10-21 PFTF 로 그렇게 시험했고, 갱신 시각이 그대로인 것으로
  rollback 을 확인했다.
- **전체 판이나 MCP 가 없을 때**: 사용자가 SQL Editor 에 통째로 붙여넣고 Run. 파일 끝의 확인
  `select` 결과를 본다.

### ⑤ (선택) 저장소의 구운 글자

SQL 만으로 바뀌지 않는 것들이다. 필요하면 고쳐서 커밋·푸시한다.

- **그래프 툴팁·등급 행** — `layout_findings.py` 의 `NODE_TITLES` · `QUALITY_ROWS` · `STATUS_BADGES` ·
  `REMAINING_BOTTLENECKS` 를 고치고 `.venv\Scripts\python.exe layout_findings.py` 로 `graph.html` 재생성.
  `graph.html` 을 직접 고치지 않는다(재생성 때 사라진다). 공개 파일에는 판정 수치를 싣지 않는다.
  - ⚠ `NODE_TITLES` 는 **새 노드를 주입할 때만** 읽힌다. 이미 그래프에 있는 노드는 등급 접두어(`— 하:`)만
    맞춰지고 본문은 그대로다. 본문까지 바꾸려면 그 id 를 `TITLE_REFRESH_IDS` 에 넣는다 — 넣기 전에 그 노드의
    `NODE_TITLES` 문구가 graph.html 의 현재 문구보다 새로운지 확인한다(2026-10-16 발견).
  - 재생성 뒤에는 HEAD 와 상수별(`RAW_NODES` · `QUALITY_ROWS` · `STATUS_BADGES` · `VAULT_STAGES` · `POS` …)로
    키를 비교해 **의도한 노드만** 바뀌었는지 보고, 두 번 돌려 해시가 같은지 본다.
- **마인드맵** — 트리에 노드가 없으면 표만으로는 안 뜬다. `mindmap.html` 에
  `apply{이름}{YYYYMMDD}(data)` 마이그레이션을 넣고 호출부 넷(기본 DATA 체인 · loadDoc · catch 폴백 ·
  importJSON)에 끼운 뒤 `APP_VERSION` 을 올린다. `scripts/check-mindmap-html.mjs` 에 검사를 더한다.
  배포 뒤 로그인한 사용자가 페이지를 열어야 클라우드 문서에 저장된다.
- **할 일 한 줄** — `todo.js` 에 `"{프로젝트}": "심사 대기"` 같은 한 줄.
- 검증: `pwsh -File scripts/publish-research-views.ps1` (푸시 없이). 그다음 커밋과 `git push origin main`.

## 3. 사건별 값

| 사건 | 노드 행 | 업적 행 | 볼트 |
|---|---|---|---|
| 투고 | stage `submitted`, badge 「… 투고 완료 (날짜, 원고번호 할당중)」 | 없으면 INSERT, stage `submitted` | 위 ① 전부 |
| 원고번호 수령 | badge 의 「할당중」 → 번호 | memo 에 번호 | `submission` · `badge` |
| 수정 요청 | stage `revision` | stage `revision` | `next_gate` |
| 게재확정 | stage `accepted` | stage `accepted` | `badge` |
| 출판 | stage `published`, badge 「… 출판 (날짜, 권호)」 | `published`, volume `63(5)` 꼴, 쪽·DOI, 실제 발행일 | `todo.js` 는 빈 칸으로 |
| 등급 변경 | grade · grade_note | — | `grade` 와 `grade_note` 첫머리(「날짜 A → B (사용자 지정)」), 노트 머리 콜아웃. 저장소는 `QUALITY_ROWS` 등급 · `NODE_TITLES` 접두어(+ 본문을 바꾸면 `TITLE_REFRESH_IDS`). 등급은 사용자가 정한다 |

## 4. 함정

- `portfolio-rows.sql` 은 **볼트에 없는 행을 지운다.** 볼트에서 노트를 옮기거나 지운 직후라면 먼저 확인한다.
- 노드 행 짝짓기는 `mindmap_id` 다. 볼트 노트에 `mindmap_id` 가 없으면 생성 SQL 의 노드 UPDATE 가 그 행에 닿지 않는다.
- 업적 번호(`p…`)는 SQL 을 쓰는 날의 최대값 + 1 이다. 다른 SQL 을 아직 안 돌렸다면 번호가 겹칠 수 있으니
  INSERT 앞의 확인 블록을 빼지 않는다.
- 업적 노트(`Papers/UPJUK/**`)에서 태어난 업적은 번호가 `v-DJ-2026-01` 꼴이고 볼트
  `node scripts/publish-research-outputs.mjs --push --allow-new` 로 넣는다(볼트 `Rules/새업적_등록절차.md`).
  진행 중 원고는 이 길이 아니라 위의 `p…` + `papers_ids` 다.
- 볼트 `Projects/*.md` 와 `Dashboards/프로젝트현황.md` 는 사용자가 커밋한다.
- MCP 의 `execute_sql` 은 RLS 를 거치지 않는 관리 권한으로 돈다(SQL Editor 와 같다). 그래서 `delete`·
  `drop`·조건 없는 `update` 는 승인 창에서 한 번 더 본다. 스키마 변경은 `apply_migration` 이 따로 있다.

## 5. 참고 — Supabase MCP 다시 붙이기

토큰(PAT)이 만료됐거나 도구 목록에 `mcp__supabase__*` 가 없으면 사용자가 새 토큰을 만들어(Supabase
대시보드 → Account preferences → Access Tokens, 만료일 지정) 직접 실행한다. 토큰은 채팅에 붙이지 않는다.

```powershell
claude mcp remove supabase -s user   # 옛 등록이 있으면
claude mcp add supabase -s user -e SUPABASE_ACCESS_TOKEN=<토큰> '--' cmd /c npx -y @supabase/mcp-server-supabase@0.14.0 --project-ref=ijutjirouxgqcldjyhma --features=database
```

- PowerShell 에서는 `--` 를 **작은따옴표로 감싼다.** `claude` 가 `claude.ps1` 래퍼라 맨 `--` 가 지워져
  `error: unknown option '-y'` 가 난다(2026-10-21). `claude.cmd --% mcp add …` 도 된다.
- 범위는 `-s user` 다. 이 저장소는 `~/.claude.json` 에 `d:/…` 와 `D:/…` 두 경로로 따로 잡혀 있어
  `-s local` 은 세션이 어느 쪽으로 열리느냐에 따라 안 보일 수 있다.
- 등록 뒤 VS Code 에서 **Developer: Reload Window**. 토큰은 `~/.claude.json` 에 평문으로 남는다.
