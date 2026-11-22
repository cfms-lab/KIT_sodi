/* stages.js — 투고 단계의 공용 규칙 (2026-11-21, 사용자 지시 — 「페이지마다 따로 고치지 않게」).
 *
 * graph.html · mindmap.html · portfolio.html · upjuk.html 이 todo.js 처럼 <script src="stages.js"> 로 같이 읽는다.
 * 전에는 아래 규칙이 네 파일에 한 벌씩 박혀 있어서, 단계 하나를 더하거나(revision2) 모양 하나를 바꾸면(초고 점)
 * 네 곳을 손으로 맞춰야 했고, 한 곳이 늦으면 그 화면에서만 아이콘이 빠졌다.
 *
 *   PIE               단계 어휘(볼트의 통합 단계 — research_outputs.stage)와 파이 모양 · 이름
 *   BLINK_STAGES …    깜빡이는 단계와 주기
 *   blinkEnabled …    깜빡임 켜기/끄기 — 네 화면 공용 값(localStorage cfms_blink, 2026-11-22~)
 *   pieInk            흰 등급색(ToDo)을 테두리 색으로 바꾸는 규칙
 *   pieSvg            SVG 파이 하나(portfolio · upjuk · mindmap). graph 는 캔버스라 drawNodePie 가 같은 PIE 를 읽어 그린다.
 *   SUBMISSION_SITES  저널 → 투고 시스템 주소(graph Node Info 의 「투고 사이트」 버튼)
 *
 * 단계를 더하거나 모양 · 박자 · 저널을 바꿀 때는 이 파일만 고친다. 따로 남는 사본은 둘이다.
 *   - graph.html 의 `const STAGE_PIE = {…}` 리터럴. graph3d.html 이 graph.html 소스를 읽어 노드 높이를 정하므로
 *     리터럴로 남겨 둔다. graph 화면은 이 파일 값을 쓰고, scripts/check-stages-js.mjs 가 두 값이 같은지 본다.
 *   - 볼트 Dashboards/프로젝트현황.md 의 파이단계(옵시디언 안에서 그리는 투고셀()). portfolio 범례 · 툴팁의 문구와
 *     순서는 거기서 발행된 메타 행(META.stages · META.rank)을 따르고, 모양 · 크기 · 박자는 이 파일을 따른다.
 *
 * 공개 파일이다 — 원고별 주소(투고 id 가 든 주소)나 심사 경위는 여기에 적지 않는다.
 */
(function (root) {
  'use strict';

  /* 단계표. 순서는 진도가 높은 것부터이고 graph 범례가 이 순서다(mindmap 범례는 거꾸로).
     frac  = 진도(0~1). 크기 · 깜빡임 주기 · graph3d 높이가 이 값을 탄다.
     fill  = 그리는 채움(없으면 frac). 투고 1/4 · 1차 심사 수정 1/3 · 2차 2/3 (2026-11-13 · 11-15, 사용자 지시).
     done  = 꽉 찬 원 + 체크(출판).
     dot   = 빈 원 가운데 점(초고, 2026-11-13 — 전에는 1/4 파이).
     x     = ⛔ 꽉 찬 원 + 가로 막대(보류, 2026-09-18 — 전에는 빗금 한 획이라 취소와 한 획 차이였다).
     xx    = 빈 원 + ✕(취소).
     표시 없는 frac 0 = 빈 원(미정 · 아이디어).
     2026-09-14: 미정과 보류는 「손을 댔는가」로 가른다 — 아예 시작하지 않은 것이 미정, 하다가 미룬 것이 보류다. */
  const PIE = {
    published: { frac: 1,      done: true,  label: '출판(published)' },
    inprint:   { frac: 0.875,               label: '인쇄중(in print)' },
    accepted:  { frac: 0.75,                label: '게재확정(accepted)' },
    revision2: { frac: 0.6875, fill: 2 / 3, label: '2차 심사 수정(revision2)' },
    revision:  { frac: 0.625,  fill: 1 / 3, label: '1차 심사 수정(revision)' },
    submitted: { frac: 0.5,    fill: 0.25,  label: '투고(submitted)' },
    draft:     { frac: 0.25,   dot: true,   label: '초고(draft)' },
    undecided: { frac: 0,                   label: '미정(undecided) · 원고 없음' },
    blocked:   { frac: 0,      x: true,     label: '보류(blocked) · 하다가 미룸' },
    cancelled: { frac: 0,      xx: true,    label: '취소(cancelled)' },
    idea:      { frac: 0,                   label: '아이디어(idea)' },
  };
  Object.values(PIE).forEach(Object.freeze);
  Object.freeze(PIE);
  const ORDER = Object.freeze(Object.keys(PIE));

  // 옛 표기. 읽을 때만 받아 준다(데이터는 그대로 둔다). 예: mindmap 문서의 Tomo_SFTF 'submit'.
  const ALIAS = Object.freeze({ submit: 'submitted' });
  const key = (stage) => ALIAS[stage] || stage;
  // 단계 이름(문자열)이나 이미 꺼낸 단계 객체를 받아 단계 객체를 돌려준다. 모르는 단계는 null.
  const info = (stage) => (typeof stage === 'string' ? PIE[key(stage)] || null : stage || null);
  // 「미정(undecided) · 원고 없음」의 앞토막. 줄 하나에 들어가는 범례(mindmap) · 툴팁(upjuk)이 쓴다.
  const shortLabel = (stage) => {
    const s = info(stage);
    return s ? String(s.label).split(' · ')[0] : '';
  };

  /* 깜빡임 (2026-09-19, 사용자 지시). 깜빡이는 단계는 저널 손에 가 있고 아직 결판이 안 난 것뿐이다 —
     전부 깜빡이니 정신이 없었다. 쓰는 중(초고) · 끝난 것(출판) · 미정 · 보류 · 취소 · 아이디어는 가만히 둔다.
     인쇄중은 사용자가 든 목록에 없어 함께 빼 두었다.
     주기는 frac 사다리를 거꾸로 탄다 — frac 0 이 2400ms, 출판(1)이 800ms. 제일 빠른 것이 1.25Hz 라
     초당 3회(WCAG 2.3.1 광과민성 기준)를 넘지 않는다. 멈추는 스위치는 화면마다 있다(WCAG 2.2.2). */
  const BLINK_STAGES = new Set(['submitted', 'revision', 'revision2', 'accepted']);
  const BLINK_T_SLOW = 2400, BLINK_T_FAST = 800;
  const blinks = (stage) => typeof stage === 'string' && BLINK_STAGES.has(key(stage));
  function blinkPeriod(stage) {
    const s = info(stage);
    const frac = s ? (s.done ? 1 : (s.x || s.xx ? 0 : (s.frac || 0))) : 0;
    return BLINK_T_SLOW - (BLINK_T_SLOW - BLINK_T_FAST) * frac;
  }

  /* 깜빡임 스위치 — 네 화면이 한 값을 쓴다 (2026-11-22, 사용자 지시 「다크 모드처럼 전역으로」).
     graph · portfolio · upjuk 의 체크박스와 mindmap 의 「깜빡임」 버튼이 이 값 하나를 읽고 쓴다. 다크 모드(theme.js 의
     cfms_theme)와 같은 방식이다 — 같은 사이트의 localStorage 한 칸(cfms_blink, '1' | '0')이고, 한 화면에서 바꾸면
     열려 있는 다른 탭도 storage 이벤트로 바로 따라온다. 기본은 켜짐(사용자 지시, 2026-09-19).
     전에는 화면마다 키가 따로였다(OLD_BLINK_KEYS) — 그래서 한 화면에서 끈 것이 다른 화면에 안 옮겨 갔다. 옛 값은
     옮기지 않고(넷이 서로 달랐을 수 있어 고를 근거가 없다) 이 파일이 처음 불릴 때 지운다.
     localStorage 를 못 쓰는 브라우저(쿠키 · 사이트 데이터 차단)에서는 그 페이지 안에서만 기억한다.
     WCAG 2.2.2(멈출 수 있을 것)는 이 스위치가, 2.3.1(초당 3회)은 위 사다리가 맡는다. */
  const BLINK_PREF_KEY = 'cfms_blink';
  const OLD_BLINK_KEYS = Object.freeze(['graphify_graph_blink_v1', 'cfms_mindmap_blink_v1', 'cfms_portfolio_blink_v1', 'cfms_upjuk_blink_v1']);
  const store = () => { try { return root.localStorage || null; } catch (e) { return null; } };
  let blinkMemo = true;
  function blinkEnabled() {
    const ls = store();
    if (ls) {
      try {
        const v = ls.getItem(BLINK_PREF_KEY);
        return v === null ? true : v !== '0';
      } catch (e) { /* 아래 기억값 */ }
    }
    return blinkMemo;
  }
  const blinkListeners = [];
  let blinkLast = blinkEnabled();
  function tellBlink(on, why) {
    if (on === blinkLast) return;
    blinkLast = on;
    blinkListeners.slice().forEach((fn) => { try { fn(on, why); } catch (e) { /* 한 화면의 오류가 다른 구독을 막지 않게 */ } });
  }
  function setBlink(on) {
    const next = !!on;
    blinkMemo = next;
    const ls = store();
    if (ls) { try { ls.setItem(BLINK_PREF_KEY, next ? '1' : '0'); } catch (e) { /* 기억값만 */ } }
    tellBlink(next, 'user');
  }
  // fn(on, why) — why 는 'user'(이 탭에서 바꿈) | 'storage'(다른 탭에서 바꿈). 같은 탭의 다른 스위치도 이걸로 맞춘다.
  function onBlinkChange(fn) { if (typeof fn === 'function') blinkListeners.push(fn); }
  {
    const ls = store();
    if (ls) OLD_BLINK_KEYS.forEach((k) => { try { ls.removeItem(k); } catch (e) { /* 없어도 그만 */ } });
  }
  if (typeof root.addEventListener === 'function') {
    root.addEventListener('storage', (e) => {
      if (e.key === BLINK_PREF_KEY || e.key === null) tellBlink(blinkEnabled(), 'storage');
    });
  }

  /* 진도 자국을 그릴 색 (2026-09-14). 파이는 흰 바탕에 등급 색으로 자국을 내는데, ToDo 등급의 색은
     흰색이라 흰 바탕에 흰 자국이 되어 아무것도 안 보였다. 너무 밝으면 테두리 색으로 그린다. */
  function pieInk(fill, border) {
    const m = /^#([0-9a-f]{6})$/i.exec(fill || '');
    if (!m) return fill;
    const v = parseInt(m[1], 16);
    const lum = 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255);
    return lum > 230 ? (border || '#333333') : fill;
  }

  /* SVG 파이 하나의 안쪽 그림(<svg> 껍데기와 깜빡임 감싸개는 화면이 붙인다).
     기하는 r=6(viewBox 16 의 가운데 8,8)을 기준으로 잡혀 있고, 다른 반지름이면 그 비율 그대로 늘린다.
       color  자국 색(등급 색 — 화면이 pieInk 로 고른다)
       mark   꽉 찬 원 위의 체크 · 막대 색(기본 흰색)
       blank  빈 원의 안쪽(portfolio · upjuk 은 'none', mindmap 은 흰색 — 파스텔 가지 면 위라서)
       halo   주면 바깥에 그 색 링을 둘러 배경에서 떼어 놓는다(mindmap 노드). 링의 안쪽 가장자리가
              아이콘 바깥선에 붙게 꽉 찬 모양은 1.1r, 빈 원 모양은 1.2333r 에 둔다. */
  function pieSvg(stage, opts) {
    const s = info(stage);
    if (!s) return '';
    const o = opts || {};
    const cx = o.cx ?? 8, cy = o.cy ?? 8, r = o.r ?? 6, k = r / 6;
    const c = o.color || '#94a3b8', mark = o.mark || '#ffffff', blank = o.blank || 'none';
    const filled = !!(s.done || s.x);
    let out = o.halo
      ? `<circle cx="${cx}" cy="${cy}" r="${(filled ? 1.1 : 1.2333) * r}" fill="none" stroke="${o.halo}" stroke-width="${1.2 * k}"/>`
      : '';
    if (s.done) {
      return out + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`
        + `<path d="M${cx - 2.9 * k},${cy + 0.2 * k} l${2.1 * k},${2.2 * k} l${3.9 * k},${-4.4 * k}" fill="none" stroke="${mark}"`
        + ` stroke-width="${1.8 * k}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (s.x) {
      return out + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>`
        + `<path d="M${cx - 3.5 * k},${cy} L${cx + 3.5 * k},${cy}" fill="none" stroke="${mark}"`
        + ` stroke-width="${2.4 * k}" stroke-linecap="round"/>`;
    }
    out += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${blank}" stroke="${c}" stroke-width="${1.6 * k}"/>`;
    if (s.xx) {
      return out + `<path d="M${cx - 3.2 * k},${cy + 3.2 * k} L${cx + 3.2 * k},${cy - 3.2 * k}`
        + ` M${cx - 3.2 * k},${cy - 3.2 * k} L${cx + 3.2 * k},${cy + 3.2 * k}" fill="none" stroke="${c}"`
        + ` stroke-width="${1.6 * k}" stroke-linecap="round"/>`;
    }
    if (s.dot) return out + `<circle cx="${cx}" cy="${cy}" r="${1.8 * k}" fill="${c}"/>`;
    const f = s.fill ?? s.frac ?? 0;
    if (!(f > 0)) return out;                       // 미정 · 아이디어: 빈 원
    const a = 2 * Math.PI * f;                      // 12시에서 시계방향으로 채운다
    const ex = cx + r * Math.sin(a), ey = cy - r * Math.cos(a), big = f > 0.5 ? 1 : 0;
    return out + `<path d="M${cx},${cy} L${cx},${cy - r} A${r},${r} 0 ${big} 1 ${ex},${ey} Z" fill="${c}"/>`;
  }

  /* 투고 사이트 (2026-11-21, 사용자 지시) — graph Node Info 의 버튼이 여는 저널 투고 시스템.
     투고(submitted)부터 인쇄중(inprint)까지인 노드에 단다. 저널은 노드 배지(STATUS_BADGES — Supabase 표가 덮는다)의
     **머리**에 적힌 저널 이름으로 찾는다. 새 저널에 투고하면 아래 표에 한 줄 더한다 — 못 찾는 노드는
     scripts/check-graph-html.mjs 가 잡는다. 주소는 저널마다 하나이고, 원고별 주소(원고 id 가 든 주소)는 넣지 않는다. */
  const SUBMISSION_SITE_STAGES = new Set(['submitted', 'revision', 'revision2', 'accepted', 'inprint']);
  const SUBMISSION_SITES = [
    { key: 'TSE', journal: '한국섬유공학회지 (Textile Science and Engineering)', names: ['한국섬유공학회지', 'Textile Science and Engineering', 'TSE'],
      system: 'manuscriptlink', url: 'https://www.manuscriptlink.com/journals/tse' },
    { key: 'CR', journal: '한국복합재료학회지 (Composites Research)', names: ['한국복합재료학회지', 'Composites Research', 'CR'],
      system: '저널 홈', url: 'http://www.compositesres.org/', home: true,
      note: '투고 시스템 주소를 확인하지 못해 저널 홈으로 잇는다 — 공저자 측 투고' },
    { key: 'KOSDI', journal: '한국재난정보학회논문집', names: ['한국재난정보학회논문집', 'KOSDI'],
      system: '저널 홈', url: 'https://journal.kosdi.or.kr/', home: true,
      note: '투고 시스템 주소를 확인하지 못해 저널 홈으로 잇는다 — 공저자 측 투고' },
    { key: 'RPJ', journal: 'Rapid Prototyping Journal', names: ['Rapid Prototyping Journal', 'RPJ'],
      system: 'ScholarOne', url: 'https://mc.manuscriptcentral.com/rpj' },
    { key: 'IJCST', journal: 'International Journal of Clothing Science and Technology', names: ['International Journal of Clothing Science and Technology', 'IJCST'],
      system: 'ScholarOne', url: 'https://mc.manuscriptcentral.com/ijcst' },
    { key: 'TDP', journal: '3D Printing and Additive Manufacturing', names: ['3D Printing and Additive Manufacturing', 'TDP'],
      system: 'ScholarOne', url: 'https://mc.manuscriptcentral.com/3dp' },
    { key: 'MAM', journal: 'Microscopy and Microanalysis', names: ['Microscopy and Microanalysis', 'MAM'],   // 2026-11-21 약어 M&M → MAM(사용자 지시)
      system: 'ScholarOne', url: 'https://mc.manuscriptcentral.com/mam' },
    { key: 'JCDE', journal: 'Journal of Computational Design and Engineering', names: ['Journal of Computational Design and Engineering', 'JCDE'],
      system: 'ScholarOne', url: 'https://mc.manuscriptcentral.com/jcde' },
    { key: 'IJAMT', journal: 'The International Journal of Advanced Manufacturing Technology', names: ['The International Journal of Advanced Manufacturing Technology', 'IJAMT'],
      system: 'Editorial Manager', url: 'https://www.editorialmanager.com/jamt/' },
    { key: 'FnP', journal: 'Fibers and Polymers', names: ['Fibers and Polymers', 'FnP'],
      system: 'Editorial Manager', url: 'https://www.editorialmanager.com/fipo/' },
    { key: 'J. Microscopy', journal: 'Journal of Microscopy', names: ['Journal of Microscopy', 'J. Microscopy'],
      system: 'Wiley Research Exchange', url: 'https://authors.wiley.com/dashboard' },
    { key: 'TVC', journal: 'The Visual Computer', names: ['The Visual Computer', 'TVC'],
      system: 'Springer Nature SNAPP', url: 'https://submission.springernature.com/your-submissions' },
    // 2026-11-22 SFTF_Holonomy 투고. 약어는 ISO 「Appl. Compos. Mater.」 — 「ACM」은 Advanced Composite Materials(T&F)와 겹쳐 쓰지 않는다.
    { key: 'Appl. Compos. Mater.', journal: 'Applied Composite Materials', names: ['Applied Composite Materials', 'Appl. Compos. Mater.'],
      system: 'Springer Nature SNAPP', url: 'https://submission.springernature.com/your-submissions' },
  ];
  SUBMISSION_SITES.forEach((site) => { Object.freeze(site.names); Object.freeze(site); });
  Object.freeze(SUBMISSION_SITES);
  // 단계가 투고~인쇄중이고 배지 머리가 아는 저널이면 그 저널 줄을, 아니면 null.
  // 이름 바로 뒤가 글자 · 숫자면 다른 낱말의 앞토막이라 버린다. 겹치면 긴 이름이 이긴다(「CR」 < 「Composites Research」).
  function submissionSite(stage, badge) {
    if (!SUBMISSION_SITE_STAGES.has(key(stage))) return null;
    const head = String(badge || '').trim();
    let best = null, bestLength = 0;
    for (const site of SUBMISSION_SITES) {
      for (const name of site.names) {
        if (name.length > bestLength && head.startsWith(name)
            && !/^[0-9A-Za-z가-힣]/.test(head.slice(name.length))) {
          best = site;
          bestLength = name.length;
        }
      }
    }
    return best;
  }

  root.CFMS_STAGES = Object.freeze({
    PIE, ORDER, ALIAS, key, info, shortLabel,
    BLINK_STAGES, BLINK_T_SLOW, BLINK_T_FAST, blinks, blinkPeriod,
    BLINK_PREF_KEY, OLD_BLINK_KEYS, blinkEnabled, setBlink, onBlinkChange,
    pieInk, pieSvg,
    SUBMISSION_SITE_STAGES, SUBMISSION_SITES, submissionSite,
  });
})(typeof window !== 'undefined' ? window : globalThis);
