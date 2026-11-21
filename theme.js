/* theme.js — 다크 모드 공용 스위치 (2026-11-21, 사용자 지시 — 「흰 배경이 밤에 너무 눈부시다」).
 *
 * index · upjuk · timetable · jobgis · mindmap · graph · portfolio · backup 이 <head> 에서 <script src="theme.js"> 로 읽는다.
 * graph3d 는 처음부터 어두운 화면이라 뺀다(사용자 지시). sftf-webtoy · sftf-apps · lostpuppy 도 이미 어둡다.
 *
 *   - 기본은 시각이다 — 18시~6시(방문자 컴퓨터의 시계)에는 어둡게, 6시~18시에는 밝게(사용자 지시, 같은 날).
 *     기기 설정(prefers-color-scheme)은 따르지 않는다 — 사용자 PC 의 Windows 가 늘 어두운 테마라 낮에도 어두워진다.
 *     페이지를 열어 둔 채 6시 · 18시가 지나도 그 자리에서 바뀐다.
 *   - 체크박스로 고른 값은 **다음 6시 또는 18시까지만** 간다 — localStorage `cfms_theme` 에 {"mode":"dark","until":밀리초}로 두고
 *     모든 페이지가 같이 쓴다(한 페이지에서 켜면 다른 페이지도, 이미 열린 다른 탭도 따라간다). 그래서 밤에 한 번 끈 것이
 *     다음 날 밤의 자동 켜짐을 막지 않는다. 값이 그냥 'dark' · 'light' 글자면 기한 없이 그 값이다(시험용).
 *   - <head> 에서 곧바로 <html data-theme="dark|light"> 와 color-scheme 을 정하므로 첫 그림부터 어둡다(흰 화면이 번쩍이지 않는다).
 *     color-scheme 이 입력칸 · 스크롤바 · 체크박스 같은 브라우저 기본 부품을 같이 어둡게 한다.
 *   - 페이지의 어두운 색은 각 페이지 <style> 의 html[data-theme="dark"] 규칙이다. 공용 색은 아래 --dk-* 변수로 둔다.
 *   - 체크박스는 페이지의 [data-theme-toggle] 자리에 들어간다(자리가 없으면 왼쪽 아래에 띄운다). 머리줄을 스크립트로
 *     다시 그리는 페이지는 그린 뒤 CFMS_THEME.mount(자리) 를 부른다.
 *   - 캔버스 · 스크립트가 칠하는 색처럼 CSS 가 닿지 않는 것은 CFMS_THEME.dark 를 읽어 칠하고, CFMS_THEME.onChange(fn) 로
 *     바뀔 때 다시 칠한다.
 *   - 인쇄할 때는 잠시 밝게 돌렸다가 되돌린다.
 *
 * 색은 저시력 · 눈부심을 고려해 골랐다. 순검정 바탕에 순백 글자(21:1)는 글자 둘레가 번져 보이고, 대비가 너무 낮으면 안 읽힌다.
 * 그래서 바탕 #1a1d21 · 본문 #dde1e6(12.9:1), 흐린 글자 #a7afb9(7.6:1, AAA), 가장 흐린 보조 글자 #8b939d(5.4:1)이다.
 * 넓은 면은 밝은 파스텔 대신 어두운 색조로 낮추고, 작은 표시(점 · 선 · 글자)는 밝기를 올려 바탕과 구분되게 한다.
 */
(function (root) {
  'use strict';
  var doc = root.document;
  if (!doc) return;
  var KEY = 'cfms_theme';
  var html = doc.documentElement;
  var listeners = [];
  var dark = null;
  var printing = false;

  var BASE_CSS = [
    ':root{--dk-bg:#1a1d21;--dk-surface:#22262b;--dk-raised:#2a2f35;--dk-hover:#323840;--dk-border:#454c55;--dk-border-soft:#353b43;',
    '--dk-text:#dde1e6;--dk-strong:#eceff3;--dk-muted:#a7afb9;--dk-faint:#8b939d;--dk-link:#8fb8f0;',
    '--dk-blue:#8fb8f0;--dk-green:#7cc48a;--dk-red:#f08a80;--dk-amber:#e6b35c;--dk-violet:#c3a6f0;--dk-teal:#6cc7bb;',
    '--dk-shadow:0 6px 22px rgba(0,0,0,.45)}',
    'html[data-theme="dark"] body{background:var(--dk-bg);color:var(--dk-text)}',
    '.cfms-theme-toggle{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:1;cursor:pointer;',
    'user-select:none;-webkit-user-select:none;white-space:nowrap;vertical-align:middle}',
    '.cfms-theme-toggle input{margin:0;cursor:pointer;width:14px;height:14px}',
    '.cfms-theme-toggle.cfms-floating{position:fixed;left:10px;bottom:10px;z-index:2147483000;padding:6px 11px;border-radius:999px;',
    'background:#fff;color:#1f2937;border:1px solid #cbd5e1;box-shadow:0 2px 8px rgba(15,23,42,.15);font-family:"Segoe UI","Malgun Gothic",sans-serif}',
    'html[data-theme="dark"] .cfms-theme-toggle.cfms-floating{background:var(--dk-raised);color:var(--dk-text);border-color:var(--dk-border);',
    'box-shadow:0 2px 8px rgba(0,0,0,.5)}',
    '@media print{.cfms-theme-toggle{display:none!important}}'
  ].join('');

  /* 18시~6시가 밤이다(방문자 컴퓨터의 시계). */
  var NIGHT_FROM = 18, NIGHT_TO = 6;
  function nightAt(t) { var h = new Date(t).getHours(); return h >= NIGHT_FROM || h < NIGHT_TO; }
  /* t 다음에 오는 6시 또는 18시(밀리초). */
  function nextBoundary(t) {
    var d = new Date(t);
    var c = new Date(d.getFullYear(), d.getMonth(), d.getDate(), NIGHT_TO, 0, 0, 0);
    while (c.getTime() <= t) {
      c = c.getHours() === NIGHT_TO
        ? new Date(c.getFullYear(), c.getMonth(), c.getDate(), NIGHT_FROM, 0, 0, 0)
        : new Date(c.getFullYear(), c.getMonth(), c.getDate() + 1, NIGHT_TO, 0, 0, 0);
    }
    return c.getTime();
  }

  /* 손으로 고른 값. 기한이 지났으면 없는 것으로 본다. 그냥 'dark' · 'light' 글자는 기한 없음(시험용). */
  function saved(now) {
    var raw = null;
    try { raw = root.localStorage.getItem(KEY); } catch (e) { return null; }
    if (raw === 'dark' || raw === 'light') return raw;
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && (o.mode === 'dark' || o.mode === 'light') && typeof o.until === 'number' && now < o.until) return o.mode;
    } catch (e) {}
    return null;
  }
  function wanted() { var now = Date.now(); var s = saved(now); return s ? s === 'dark' : nightAt(now); }

  function boxes() { return doc.querySelectorAll ? doc.querySelectorAll('input[data-cfms-theme]') : []; }
  function syncBoxes() {
    var list = boxes();
    for (var i = 0; i < list.length; i++) list[i].checked = !!dark;
  }

  function apply(next, why) {
    next = !!next;
    if (next === dark) return;
    dark = next;
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    html.style.colorScheme = dark ? 'dark' : 'light';
    syncBoxes();
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](dark, why || ''); } catch (e) { if (root.console) root.console.error(e); }
    }
    try { doc.dispatchEvent(new root.CustomEvent('cfms-theme', { detail: { dark: dark, why: why || '' } })); } catch (e) {}
  }

  /* 체크박스로 고른 값은 다음 6시 · 18시까지만 간다. 시각 규칙과 같은 값을 고르면 따로 적지 않는다. */
  function set(next) {
    next = !!next;
    var now = Date.now();
    try {
      if (next === nightAt(now)) root.localStorage.removeItem(KEY);
      else root.localStorage.setItem(KEY, JSON.stringify({ mode: next ? 'dark' : 'light', until: nextBoundary(now) }));
    } catch (e) {}
    apply(next, 'user');
  }

  function makeToggle(floating) {
    var label = doc.createElement('label');
    label.className = 'cfms-theme-toggle' + (floating ? ' cfms-floating' : '');
    label.title = '어두운 화면 — 18시~6시에는 저절로 켜집니다. 손으로 바꾸면 다음 6시 · 18시까지 그대로이고, 이 사이트의 모든 페이지에 같이 적용됩니다';
    var box = doc.createElement('input');
    box.type = 'checkbox';
    box.setAttribute('data-cfms-theme', '');
    box.checked = !!dark;
    box.addEventListener('change', function () { set(box.checked); });
    label.appendChild(box);
    label.appendChild(doc.createTextNode('다크 모드'));
    return label;
  }

  /* 자리 하나에 체크박스를 넣는다. 이미 들어 있으면 상태만 맞춘다. */
  function mount(slot) {
    if (!slot) return null;
    var have = slot.querySelector('input[data-cfms-theme]');
    if (have) { have.checked = !!dark; return have; }
    var label = makeToggle(false);
    slot.appendChild(label);
    return label.querySelector('input');
  }

  function mountAll() {
    var slots = doc.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < slots.length; i++) mount(slots[i]);
    if (!slots.length && !doc.querySelector('input[data-cfms-theme]') && doc.body) doc.body.appendChild(makeToggle(true));
  }

  /* 1) 첫 그림 전에 정한다. */
  try {
    var style = doc.createElement('style');
    style.id = 'cfms-theme-base';
    style.textContent = BASE_CSS;
    (doc.head || html).appendChild(style);
  } catch (e) {}
  apply(wanted(), 'init');

  /* 2) 체크박스 */
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mountAll);
  else mountAll();

  /* 3) 다른 탭 · 시계 · 인쇄 */
  root.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === null) apply(wanted(), 'storage');
  });
  /* 열어 둔 페이지도 6시 · 18시에 바뀐다. 손으로 고른 값의 기한도 그 경계라 경계 하나만 기다리면 된다.
     잠자기 뒤에는 타이머가 늦으므로 페이지가 다시 보일 때도 맞춘다. */
  var timer = null;
  function schedule() {
    if (timer) root.clearTimeout(timer);
    var now = Date.now();
    timer = root.setTimeout(function () {
      if (!printing) apply(wanted(), 'clock');
      schedule();
    }, Math.min(nextBoundary(now) - now + 1000, 2147483000));
  }
  function recheck() { if (!printing) apply(wanted(), 'clock'); schedule(); }
  schedule();
  doc.addEventListener('visibilitychange', function () { if (!doc.hidden) recheck(); });
  root.addEventListener('pageshow', recheck);
  root.addEventListener('beforeprint', function () { printing = true; apply(false, 'print'); });
  root.addEventListener('afterprint', function () { printing = false; apply(wanted(), 'print'); });

  var api = {
    KEY: KEY,
    NIGHT_FROM: NIGHT_FROM,
    NIGHT_TO: NIGHT_TO,
    set: set,
    toggle: function () { set(!dark); },
    onChange: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    mount: mount
  };
  Object.defineProperty(api, 'dark', { get: function () { return !!dark; }, enumerable: true });
  root.CFMS_THEME = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
