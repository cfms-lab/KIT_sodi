// portfolio.html 가드.
//
// 이 페이지의 약속은 하나다 — **데이터를 파일에 담지 않는다.** GitHub Pages 는 파일을
// 누구에게나 내주므로, 표가 HTML 안에 있으면 로그인 화면은 장식이 된다. 그래서 아래 검사는
// 대부분 「없어야 할 것이 없는가」를 본다. 데이터 자체는 Supabase portfolio_rows 에 있고
// RLS 가 지킨다(schema_portfolio_rows.sql).
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../portfolio.html", import.meta.url), "utf8");
if (/^(<<<<<<<|=======|>>>>>>>)/m.test(html)) {
  throw new Error("portfolio.html contains unresolved Git conflict markers");
}

const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[0]))
  .map(match => match[1]);
if (!scripts.length) throw new Error("portfolio.html has no inline scripts");
for (const [index, script] of scripts.entries()) {
  try {
    new Function(script);
  } catch (error) {
    throw new Error(`portfolio.html inline script ${index + 1} is invalid: ${error.message}`);
  }
}

// ① 구워 넣은 표가 없어야 한다. 옛 판(2026-09-13 이전)은 /*ROWS_START*/[{…}] 한 줄로
//    75행을 담고 있었다. 그 자리로 되돌아가면 여기서 멈춘다.
if (/\/\*ROWS_(START|END)\*\//.test(html)) {
  throw new Error("portfolio.html still has the baked ROWS markers; the table must live in Supabase");
}
if (html.includes('[{"')) {
  throw new Error("portfolio.html contains an inline JSON array; page data must come from Supabase at runtime");
}
for (const leak of ["completenessKey\":", "coauthorKey\":", "stageRank\":"]) {
  if (html.includes(leak)) throw new Error(`portfolio.html looks like it carries row data (${leak})`);
}

// ② 로그인 게이트가 있어야 하고, 표는 기본으로 감춰져 있어야 한다.
if (!/id="gate"/.test(html)) throw new Error("portfolio.html is missing the login gate");
if (!/id="view"\s+hidden/.test(html)) throw new Error("portfolio.html must keep the table hidden until login");
if (!/id="toolbar"\s+hidden/.test(html)) throw new Error("portfolio.html must keep the toolbar hidden until login");

// ③ 표는 **사용자 토큰**으로만 읽어야 한다. anon 키로 읽으면 RLS 가 막아 주더라도
//    코드의 의도가 흐려지므로 여기서 못 박는다.
if (!/rest\/v1\/portfolio_rows\?/.test(html)) {
  throw new Error("portfolio.html does not read portfolio_rows");
}
if (!/Authorization:\s*"Bearer "\s*\+\s*SESSION\.access_token/.test(html)) {
  throw new Error("portfolio.html must read portfolio_rows with the signed-in user's token");
}

// ④ 정렬 규칙이 쓰는 볼트 쪽 이름표. 볼트에서 새 이름이 오면 페이지가 조용히 정렬을 빠뜨리므로
//    두 곳이 같은 낱말을 쓰는지 본다.
for (const field of ["순서", "완성도", "등급", "공저자키", "투고"]) {
  if (!html.includes(field)) throw new Error(`portfolio.html lost the BLANK_FIELD entry for ${field}`);
}

console.log(JSON.stringify({
  inlineScripts: scripts.length,
  bakedRows: 0,
  loginGate: true,
  source: "supabase:portfolio_rows (RLS, authenticated only)",
}));
