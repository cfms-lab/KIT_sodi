/* todo.js — 저자(설인환) 관점의 「ToDo」 한 줄을 Supabase 표 todo_lines 에서 받아 graph.html · portfolio.html 에 준다.
 *
 * 왜 따로 두나 — portfolio.html 의 「다음 게이트」와 graph.html 의 「남은 병목」은 볼트가 발행한 진행상황 문장이라
 * 길고 기술적이다. 저자가 실제로 다음에 움직일 일은 「심사 대기」, 「공저자 작업 중」, 「직물 촬영 필요」처럼
 * 한 줄이면 끝난다. 두 화면은 이 한 줄을 DB 의 옛 문장보다 **먼저** 쓰고, 이 줄이 없을 때만 옛 문장으로 떨어진다.
 *
 * 정본은 볼트다 (2026-11-21~, 사용자 지시 — 전에는 이 파일에 71줄을 손으로 적었다. 그 판은 git 이력에 있다).
 *   · 노트가 있는 프로젝트: Projects/{이름}.md frontmatter `todo:`
 *   · 분리 트랙(한 노트가 논문 여럿 — TSE_TomoSh4 · 5, TSE_SEM 세 편, cfmsAutoPlace 두 편): Dashboards/프로젝트현황.md 분리트랙 항목의 `할일:`
 * 고치는 법 — 볼트 줄을 고치고 `node scripts/publish-portfolio.mjs --sql --todo-only --only 이름` 이 만든
 * tmp/todo-lines.sql 을 Supabase 로 보낸다(투고 반영 때 쓰는 --sql --only 부분 판에도 같이 들어간다).
 * 이 파일은 고칠 일이 없다 — 커밋 · 푸시도 없다.
 *
 * 키는 노트 · 트랙 이름이다. 값은 한 줄이고, 빈 문자열("")은 「할 일 없음」이다.
 *
 * 받는 순서 — 지난번에 받은 줄(localStorage)을 먼저 깔고, 표를 다시 받아 덮는다. 받으면 `cfms-todo` 이벤트를
 * 쏘고 `window.cfmsTodoReady` 가 true 로 풀린다. 표를 못 읽으면(장애 · 일시 중지 · 10초 응답 없음) 지난번 줄을
 * 그대로 쓰고 false 로 풀린다. 지난번 줄도 없으면 굳혀 둔 예비 줄 fallback/todo-lines.json(scripts/bake-fallbacks.mjs
 * 가 쓴다 — 2026-11-21 4단계 「파일에 구운 값은 표를 못 읽을 때의 예비값」)을 깔고 "fallback" 으로 풀린다. 그것도
 * 없으면 옛 문장이다. 화면은 풀린 값이 참이면 ToDo 칸을 다시 그린다.
 */
(function () {
  const TODO = {};
  const BY_NORM = {};
  let known = false;   // 한 번이라도 줄을 깔았나 — 아직이면 모든 조회가 null(=모름)이다

  /* 화면마다 id 표기가 조금씩 다르다 — 표는 볼트 노트 이름(HipDetect)을, 그래프는 노드
     id(HIPDetect)를 쓴다.  대소문자와 밑줄·점을 지운 이름으로 한 번 더 찾아, 같은 프로젝트를
     두 화면이 같은 한 줄로 부른다 (2026-09-21). */
  const norm = v => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, "");

  function fill(rows) {
    for (const k of Object.keys(TODO)) delete TODO[k];
    for (const k of Object.keys(BY_NORM)) delete BY_NORM[k];
    for (const row of rows) {
      if (!row || typeof row.id !== "string" || !row.id) continue;
      TODO[row.id] = row.todo == null ? "" : String(row.todo);
    }
    for (const key of Object.keys(TODO)) BY_NORM[norm(key)] = TODO[key];
    known = true;
  }

  window.CFMS_TODO = TODO;

  /* 조회기.  **없으면 null** 이다 — 빈 문자열("")은 「할 일 없음」이라는 뜻이라
     호출부가 옛 문장으로 떨어지면 안 된다.  그래서 「모름」과 「빈 칸」을 구분한다. */
  window.cfmsTodo = function (...ids) {
    if (!known) return null;
    for (const id of ids) {
      if (!id) continue;
      if (Object.prototype.hasOwnProperty.call(TODO, id)) return TODO[id];
      const k = norm(id);
      if (k && Object.prototype.hasOwnProperty.call(BY_NORM, k)) return BY_NORM[k];
    }
    return null;
  };

  /* 쿠키 · 사이트 데이터가 막힌 브라우저에서는 localStorage 접근 자체가 예외를 던진다 — 전부 감싼다. */
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  const CACHE_KEY = "cfms_todo_lines";
  try {
    const cached = JSON.parse(lsGet(CACHE_KEY) || "null");
    if (cached && Array.isArray(cached.rows)) fill(cached.rows);
  } catch (e) {}

  /* 같은 계정 · 같은 localStorage 키를 graph · portfolio · upjuk · mindmap 과 같이 쓴다. anon 키는 공개 값이고,
     todo_lines 는 anon 읽기만 열려 있다(schema_todo_lines.sql). */
  const normUrl = u => (u || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "").replace(/\/auth\/v1$/i, "").replace(/\/+$/, "");
  const BAKED_URL = "https://ijutjirouxgqcldjyhma.supabase.co";
  const BAKED_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlqdXRqaXJvdXhncWNsZGp5aG1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0MDk4MDAsImV4cCI6MjA5Nzk4NTgwMH0.gIAwf6a2oY-DkTXaf5eM2L4ROMCKim5WsevGfjol7tE";
  const url = normUrl(lsGet("cfms_url") || BAKED_URL);
  const key = (lsGet("cfms_key") || BAKED_KEY).trim();

  /* 응답이 없는 표(일시 중지된 Supabase 등)를 끝없이 기다리지 않는다. 가드는 window.CFMS_TABLE_TIMEOUT_MS 로 줄여 시험한다. */
  const TIMEOUT_MS = Number(window.CFMS_TABLE_TIMEOUT_MS) || 10000;
  const timeout = (promise, what) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(what + " 응답 없음")), TIMEOUT_MS);
    promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
  });
  /* 예비 줄은 표도 지난번 줄도 없을 때만 깐다 — 지난번 줄이 있으면 그쪽이 대개 더 새롭고, 표에서 지운 줄이 되살아나면 안 된다. */
  function fallback() {
    if (known || typeof fetch !== "function") return Promise.resolve(false);
    return timeout(fetch("fallback/todo-lines.json"), "fallback/todo-lines.json")
      .then(res => { if (!res.ok) throw new Error("fallback " + res.status); return res.json(); })
      .then(data => {
        if (!data || !Array.isArray(data.rows) || !data.rows.length) return false;
        fill(data.rows);
        return "fallback";
      })
      .catch(() => false);
  }

  window.cfmsTodoReady = (typeof fetch === "function"
    ? timeout(fetch(url + "/rest/v1/todo_lines?select=id,todo", { headers: { apikey: key, Authorization: "Bearer " + key } }), "todo_lines")
    : Promise.reject(new Error("fetch 없음")))
    .then(res => { if (!res.ok) throw new Error("todo_lines " + res.status); return res.json(); })
    .then(rows => {
      if (!Array.isArray(rows)) throw new Error("todo_lines 응답이 배열이 아니다");
      fill(rows);
      lsSet(CACHE_KEY, JSON.stringify({ at: new Date().toISOString(), rows: rows.map(r => ({ id: r.id, todo: r.todo })) }));
      try { window.dispatchEvent(new CustomEvent("cfms-todo", { detail: { count: rows.length } })); } catch (e) {}
      return true;
    })
    .catch(e => { try { console.warn("todo.js: ToDo 줄을 받지 못했다 —", e && e.message); } catch (_) {} return fallback(); });
})();
