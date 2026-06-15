/* ════════════════════════════════════════════════════════════════
   Lull — app logic. Tabs, the sky, the clock, the night journal,
   the breathing ritual and the alarm.
   ════════════════════════════════════════════════════════════════ */

import { engine, synthRingtones } from './audio.js';
import { native, store } from './native.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────────────────────── tiny stores ─────────────────────────── */

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (_) { return fallback; }
};
const save = (key, value) => {
  const raw = JSON.stringify(value);
  localStorage.setItem(key, raw);
  store.mirror(key, raw);          // write-through to durable native storage
};

const journal = load('lull.journal', {});
const settings = load('lull.settings', { volume: 80, cues: false, pattern: '478' });

const pad = (n) => String(n).padStart(2, '0');
const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fmtTime = (d) =>
  d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/* ─────────────────────────── the sky ─────────────────────────── */

function buildSky() {
  const field = $('#stars');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 72; i++) {
    const s = document.createElement('i');
    s.className = 'star';
    const size = 1 + Math.random() * 1.8;
    s.style.width = s.style.height = size.toFixed(1) + 'px';
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.top = (Math.random() * 60).toFixed(2) + '%';   // keep stars in the sky, above the dunes
    s.style.setProperty('--o', (0.25 + Math.random() * 0.65).toFixed(2));
    s.style.setProperty('--tw', (2.6 + Math.random() * 4).toFixed(1) + 's');
    s.style.setProperty('--twd', (Math.random() * 5).toFixed(1) + 's');
    frag.appendChild(s);
  }
  field.appendChild(frag);

  if (!reducedMotion) scheduleShootingStar();
}

function scheduleShootingStar() {
  const star = $('#shooting');
  setTimeout(() => {
    star.classList.remove('go');
    star.style.top = (5 + Math.random() * 38) + '%';
    star.style.left = (10 + Math.random() * 55) + '%';
    void star.offsetWidth; // restart the animation
    star.classList.add('go');
    scheduleShootingStar();
  }, 12000 + Math.random() * 16000);
}

/* ─────────────────────────── tabs ─────────────────────────── */

const PANELS = ['tonight', 'sounds', 'breathe', 'alarm', 'history', 'health'];

function showPanel(name) {
  $$('.panel').forEach((p) => p.classList.toggle('is-active', p.id === `panel-${name}`));
  $$('.tab').forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle('is-active', on);
    t.setAttribute('aria-selected', String(on));
  });
  window.scrollTo({ top: 0 });
  history.replaceState(null, '', name === 'tonight' ? location.pathname : `#${name}`);
  if (name === 'alarm') onAlarmShown();
  if (name === 'history') renderHistory();
  if (name === 'health') renderHealth();
}

function initTabs() {
  // stagger indices for the load-in reveal
  $$('.panel').forEach((panel) => {
    $$('.reveal', panel).forEach((el, i) => el.style.setProperty('--i', i));
  });
  $$('.tab').forEach((t) => t.addEventListener('click', () => showPanel(t.dataset.tab)));
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => showPanel(b.dataset.goto)));

  const fromHash = () => {
    const h = location.hash.slice(1) || 'tonight';
    if (PANELS.includes(h)) showPanel(h);
  };
  window.addEventListener('hashchange', fromHash);
  if (location.hash) fromHash();
}

/* ─────────────────────────── clock & greeting ─────────────────────────── */

function tickClock() {
  const now = new Date();
  let h = now.getHours();
  const mer = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  $('#clock').childNodes[0].nodeValue = `${h}:${pad(now.getMinutes())}`;
  $('#meridiem').textContent = mer;
  $('#dateline').textContent = now.toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric',
  });
}

function setGreeting() {
  const h = new Date().getHours();
  let text;
  if (h >= 5 && h < 11) text = 'Up with the sun — or still up?';
  else if (h >= 11 && h < 17) text = 'Good afternoon.';
  else if (h >= 17 && h < 22) text = 'The day is folding up.';
  else text = 'The night is yours.';
  $('#greeting').textContent = text;
}

/* ─────────────────────────── night journal ─────────────────────────── */

const MOODS = ['restless', 'foggy', 'okay', 'settled', 'peaceful'];

function moonSVG(phase, uid) {
  const lit = [
    '',
    '<circle cx="12" cy="12" r="9" fill="#fff"/><circle cx="7.6" cy="10.8" r="8.6" fill="#000"/>',
    '<rect x="12" y="3" width="9" height="18" fill="#fff"/>',
    '<circle cx="12" cy="12" r="9" fill="#fff"/><circle cx="4.2" cy="12" r="6.8" fill="#000"/>',
    '<circle cx="12" cy="12" r="9" fill="#fff"/>',
  ][phase];
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${
    lit
      ? `<mask id="${uid}"><rect width="24" height="24" fill="#000"/>${lit}</mask>` +
        `<circle cx="12" cy="12" r="9" fill="currentColor" mask="url(#${uid})"/>`
      : ''
  }<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="1.5"/></svg>`;
}

function initJournal() {
  const moodsEl = $('#moods');
  moodsEl.innerHTML = MOODS.map((label, i) =>
    `<button class="mood" role="radio" aria-checked="false" data-mood="${i}">` +
    `${moonSVG(i, `mood-${i}`)}<span>${label}</span></button>`
  ).join('');

  const today = dateKey();
  const entry = journal[today] || {};

  const markPicked = (idx) => {
    $$('.mood', moodsEl).forEach((b) => {
      const on = Number(b.dataset.mood) === idx;
      b.classList.toggle('is-picked', on);
      b.setAttribute('aria-checked', String(on));
    });
  };

  if (entry.mood != null) markPicked(entry.mood);
  if (entry.note) $('#note').value = entry.note;

  moodsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.mood');
    if (!btn) return;
    const idx = Number(btn.dataset.mood);
    journal[today] = { ...journal[today], mood: idx };
    save('lull.journal', journal);
    markPicked(idx);
    renderWeek();
  });

  $('#saveNote').addEventListener('click', () => {
    journal[today] = { ...journal[today], note: $('#note').value.trim() };
    save('lull.journal', journal);
    const msg = $('#savedMsg');
    msg.textContent = 'tucked in ✶';
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2200);
  });

  renderWeek();
}

function renderWeek() {
  const row = $('#weekRow');
  const cells = [];
  for (let back = 6; back >= 0; back--) {
    const d = new Date();
    d.setDate(d.getDate() - back);
    const key = dateKey(d);
    const entry = journal[key];
    const letter = d.toLocaleDateString([], { weekday: 'narrow' });
    const has = entry && entry.mood != null;
    cells.push(
      `<div class="week-cell ${has ? '' : 'is-empty'} ${back === 0 ? 'is-today' : ''}">` +
      `${moonSVG(has ? entry.mood : 0, `wk-${back}`)}<em>${letter}</em></div>`
    );
  }
  row.innerHTML = cells.join('');
}

/* ─────────────────────────── history — a year of moons ─────────────────────────── */

let historyYear = null;

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// every day someone logged a mood, as YYYY-MM-DD
const trackedKeys = () =>
  Object.keys(journal).filter((k) => journal[k] && journal[k].mood != null);

function longestStreak(keys) {
  if (!keys.length) return 0;
  const days = [...new Set(keys.map((k) => Date.parse(k)))].sort((a, b) => a - b);
  let best = 1, cur = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((days[i] - days[i - 1]) / 86400000);
    if (gap === 1) cur += 1; else cur = 1;
    if (cur > best) best = cur;
  }
  return best;
}

function yearBounds() {
  const cur = new Date().getFullYear();
  const years = trackedKeys().map((k) => Number(k.slice(0, 4)));
  return { min: years.length ? Math.min(...years, cur) : cur, max: cur };
}

function renderStats(year) {
  const all = trackedKeys();
  const inYear = all.filter((k) => k.startsWith(`${year}-`));
  const longest = longestStreak(inYear);
  $('#statRow').innerHTML = `
    <div class="stat"><span class="stat-num">${inYear.length}</span><span class="stat-lbl">nights in ${year}</span></div>
    <div class="stat"><span class="stat-num">${longest}</span><span class="stat-lbl">longest streak</span></div>
    <div class="stat"><span class="stat-num">${all.length}</span><span class="stat-lbl">nights all-time</span></div>`;
}

function updateYearArrows() {
  const { min, max } = yearBounds();
  $('#yearPrev').disabled = historyYear <= min;
  $('#yearNext').disabled = historyYear >= max;
}

function renderHistory() {
  if (historyYear == null) return;
  const year = historyYear;
  const today = dateKey();
  const months = [];

  for (let mo = 0; mo < 12; mo++) {
    const daysInMonth = new Date(year, mo + 1, 0).getDate();
    const cells = [];
    for (let d = 1; d <= 31; d++) {
      if (d > daysInMonth) { cells.push('<span class="moon-cell is-void"></span>'); continue; }
      const key = `${year}-${pad(mo + 1)}-${pad(d)}`;
      const entry = journal[key];
      const lit = entry && entry.mood != null ? `t m${entry.mood}` : '';
      const today_ = key === today ? 'is-today' : '';
      const future = key > today ? 'is-future' : '';
      cells.push(
        `<button class="moon-cell ${lit} ${today_} ${future}" data-day="${key}" aria-label="${key}"></button>`
      );
    }
    const name = new Date(year, mo, 1).toLocaleDateString([], { month: 'short' });
    months.push(
      `<div class="moon-month"><span class="moon-month-name">${name}</span>` +
      `<div class="moon-days">${cells.join('')}</div></div>`
    );
  }

  $('#moonYear').innerHTML = months.join('');
  $('#yearLabel').textContent = year;
  renderStats(year);
  updateYearArrows();
}

function clearDetail() {
  $('#dayDetail').innerHTML = '<p class="detail-empty">Tap a moon to revisit that night.</p>';
}

function showDay(key) {
  const entry = journal[key];
  const d = new Date(`${key}T00:00:00`);
  const nice = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const detail = $('#dayDetail');
  if (!entry || entry.mood == null) {
    detail.innerHTML = `<p class="detail-date">${nice}</p><p class="detail-empty">No moon logged that night.</p>`;
    return;
  }
  detail.innerHTML = `
    <div class="detail-head">
      <span class="detail-moon">${moonSVG(entry.mood, `detail-${key}`)}</span>
      <div>
        <p class="detail-date">${nice}</p>
        <p class="detail-mood">felt ${MOODS[entry.mood]}</p>
      </div>
    </div>
    ${entry.note ? `<p class="detail-note">${escapeHtml(entry.note)}</p>` : '<p class="detail-empty">no words that night</p>'}`;
}

function initHistory() {
  historyYear = new Date().getFullYear();

  $('#yearPrev').addEventListener('click', () => { historyYear -= 1; renderHistory(); clearDetail(); });
  $('#yearNext').addEventListener('click', () => { historyYear += 1; renderHistory(); clearDetail(); });

  $('#moonYear').addEventListener('click', (e) => {
    const cell = e.target.closest('.moon-cell');
    if (!cell || cell.classList.contains('is-void') || cell.classList.contains('is-future')) return;
    $$('#moonYear .moon-cell.is-sel').forEach((c) => c.classList.remove('is-sel'));
    cell.classList.add('is-sel');
    showDay(cell.dataset.day);
  });

  clearDetail();
  renderHistory();
}

/* ─────────────────────────── sleep & health ───────────────────────────
   All grounded in published sleep science:
   · adults need 7–9 h (National Sleep Foundation consensus, 2015)
   · healthy architecture ≈ light 50–60% · deep (N3) 15–25% · REM 20–25%
   · sleep efficiency ≥ 85% is good; onset latency 10–20 min is normal
   · day-to-day regularity independently predicts cardiometabolic & mortality risk
   Stage split is *estimated* from duration with typical architecture — not measured. */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const REC_MIN = 7, REC_MAX = 9;                    // recommended adult range (hours)
const EFF_GOOD = 85, LAT_LO = 10, LAT_HI = 20;     // %, minutes
const LAT_OPTS = [{ v: 3, l: '<5' }, { v: 15, l: '~15' }, { v: 30, l: '~30' }, { v: 45, l: '~45' }, { v: 60, l: '60+' }];
const WAKE_OPTS = [{ v: 0, l: '0' }, { v: 1, l: '1' }, { v: 2, l: '2' }, { v: 3, l: '3+' }];

let logLat = 15, logWakeups = 0;

const parseHM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const fmtDur = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h > 0 ? `${h}h ${pad(m)}m` : `${m}m`; };

function nightMetrics(entry) {
  const s = entry && entry.sleep;
  if (!s || !s.bed || !s.wake) return null;
  const bed = parseHM(s.bed), wake = parseHM(s.wake);
  let tib = wake - bed; if (tib <= 0) tib += 1440;          // crossed midnight
  const lat = s.lat ?? 15;
  const waso = (s.wakeups ?? 0) * 9;                         // ~9 min per awakening (estimate)
  const asleep = Math.max(30, tib - lat - waso);
  const eff = clamp((asleep / tib) * 100, 0, 100);
  return { tib, lat, waso, asleep, eff, bed, wake };
}

// estimate stage split from duration — deep saturates, REM grows in later cycles
function estimateStages(asleep) {
  const hrs = asleep / 60;
  const deep = Math.min(asleep * 0.22, 110);
  const rem = asleep * Math.min(0.27, 0.18 + Math.max(0, hrs - 5) * 0.02);
  const light = Math.max(0, asleep - deep - rem);
  return { light, deep, rem };
}

const stdev = (a) => { if (a.length < 2) return 0; const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
const bedAxis = (bedMin) => { let v = bedMin - 1080; if (v < -180) v += 1440; return v; };  // minutes from 18:00

function loggedNights() {
  return Object.keys(journal)
    .filter((k) => nightMetrics(journal[k]))
    .sort()
    .map((k) => ({ key: k, ...nightMetrics(journal[k]) }));
}

function durationScore(asleepMin) {
  const h = asleepMin / 60;
  if (h >= REC_MIN && h <= REC_MAX) return 100;
  if (h < REC_MIN) return clamp(100 - (REC_MIN - h) * 22, 0, 100);
  return clamp(100 - (h - REC_MAX) * 18, 0, 100);
}
const efficiencyScore = (eff) => clamp(Math.round((eff - 60) / (92 - 60) * 100), 0, 100);
function latencyScore(lat) {
  if (lat >= LAT_LO && lat <= LAT_HI) return 100;
  if (lat < LAT_LO) return clamp(100 - (LAT_LO - lat) * 4, 40, 100);
  return clamp(100 - (lat - LAT_HI) * 2.2, 0, 100);
}

function healthSummary() {
  const nights = loggedNights();
  if (!nights.length) return { nights };
  const recent = nights.slice(-7);
  const mean = (f) => recent.reduce((a, n) => a + f(n), 0) / recent.length;
  const avgAsleep = mean((n) => n.asleep);
  const avgEff = mean((n) => n.eff);
  const avgLat = mean((n) => n.lat);
  const sdAvg = (stdev(recent.map((n) => bedAxis(n.bed))) + stdev(recent.map((n) => n.wake))) / 2;
  const consistency = recent.length >= 3 ? clamp(Math.round(100 - (sdAvg - 15) * 0.95), 0, 100) : null;
  // debt = shortfall below the 7 h recommended floor (keeps it consistent with the score)
  const debt = recent.reduce((a, n) => a + Math.max(0, REC_MIN * 60 - n.asleep), 0);
  const cScore = consistency == null ? 70 : consistency;
  const score = Math.round(0.35 * durationScore(avgAsleep) + 0.25 * efficiencyScore(avgEff) + 0.25 * cScore + 0.15 * latencyScore(avgLat));
  return { nights, recent, avgAsleep, avgEff, avgLat, sdAvg, consistency, debt, score };
}

/* ---------- charts (hand-built SVG, no libraries) ---------- */

function heroRingSVG(score) {
  const frac = clamp(score, 0, 100) / 100;
  return `<svg viewBox="0 0 128 128" class="hero-ring">
    <circle cx="64" cy="64" r="46" class="ring-bg"/>
    <circle cx="64" cy="64" r="46" class="ring-fg" pathLength="100" stroke-dasharray="100" style="--target:${(100 - frac * 100).toFixed(1)}" transform="rotate(-90 64 64)"/>
    <text x="64" y="62" class="ring-score">${score}</text>
    <text x="64" y="82" class="ring-of">/ 100</text>
  </svg>`;
}

function durationChartSVG() {
  const W = 324, H = 170, L = 28, R = 12, T = 16, B = 26, yLo = 3, yHi = 11;
  const x = (i) => L + (W - L - R) * (i / 13);
  const y = (h) => T + (H - T - B) * (1 - (clamp(h, yLo, yHi) - yLo) / (yHi - yLo));
  const days = [];
  for (let i = 13; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(dateKey(d)); }
  const pts = days.map((k, i) => { const m = nightMetrics(journal[k]); return { i, h: m ? m.asleep / 60 : null, k }; });

  let grid = '';
  for (const hh of [4, 6, 8, 10]) { const yy = y(hh); grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(yy + 3).toFixed(1)}" class="ax-y">${hh}h</text>`; }

  const segs = []; let cur = [];
  pts.forEach((p) => { if (p.h == null) { if (cur.length) { segs.push(cur); cur = []; } } else cur.push(p); });
  if (cur.length) segs.push(cur);
  const lastI = Math.max(-1, ...pts.filter((p) => p.h != null).map((p) => p.i));
  const areas = segs.filter((s) => s.length > 1).map((seg) => {
    const inner = seg.map((p) => `${x(p.i).toFixed(1)},${y(p.h).toFixed(1)}`).join(' ');
    return `<polygon class="darea" points="${x(seg[0].i).toFixed(1)},${(H - B).toFixed(1)} ${inner} ${x(seg[seg.length - 1].i).toFixed(1)},${(H - B).toFixed(1)}"/>`;
  }).join('');
  const lines = segs.map((seg) => `<polyline class="dline" pathLength="100" points="${seg.map((p) => `${x(p.i).toFixed(1)},${y(p.h).toFixed(1)}`).join(' ')}"/>`).join('');
  const dots = pts.filter((p) => p.h != null).map((p) => `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.h).toFixed(1)}" r="${p.i === lastI ? 3.6 : 2.4}" class="ddot${p.i === lastI ? ' last' : ''}"/>`).join('');
  let xl = '';
  days.forEach((k, i) => { if (i % 2 === 1) { const d = new Date(`${k}T00:00:00`); xl += `<text x="${x(i).toFixed(1)}" y="${H - 8}" class="ax-x">${d.toLocaleDateString([], { weekday: 'narrow' })}</text>`; } });

  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">
    <rect x="${L}" y="${y(REC_MAX).toFixed(1)}" width="${W - L - R}" height="${(y(REC_MIN) - y(REC_MAX)).toFixed(1)}" class="band"/>
    <text x="${W - R}" y="${(y(REC_MAX) - 4).toFixed(1)}" class="band-lbl">7–9h zone</text>
    ${grid}${areas}${lines}${dots}${xl}
  </svg>`;
}

function timingChartSVG() {
  const nights = loggedNights().slice(-10);
  if (!nights.length) return '<p class="chart-empty">Log a couple of nights to see how steady your timing is.</p>';
  const L = 30, R = 10, T = 6, rowH = 22, W = 324, H = T + nights.length * rowH + 22, axisHi = 1080;
  const xx = (min) => L + (W - L - R) * clamp(min, 0, axisHi) / axisHi;
  const ticks = [{ m: 180, l: '9p' }, { m: 360, l: '12' }, { m: 540, l: '3a' }, { m: 720, l: '6a' }, { m: 900, l: '9a' }];
  const grid = ticks.map((t) => `<line x1="${xx(t.m).toFixed(1)}" y1="${T}" x2="${xx(t.m).toFixed(1)}" y2="${H - 18}" class="grid"/><text x="${xx(t.m).toFixed(1)}" y="${H - 6}" class="ax-x">${t.l}</text>`).join('');
  const medBed = nights.map((n) => Math.max(0, bedAxis(n.bed))).sort((a, b) => a - b)[Math.floor(nights.length / 2)];
  const medWake = nights.map((n) => (n.wake + 360) % 1440).sort((a, b) => a - b)[Math.floor(nights.length / 2)];
  const guides = `<line x1="${xx(medBed).toFixed(1)}" y1="${T}" x2="${xx(medBed).toFixed(1)}" y2="${H - 18}" class="guide"/><line x1="${xx(medWake).toFixed(1)}" y1="${T}" x2="${xx(medWake).toFixed(1)}" y2="${H - 18}" class="guide"/>`;
  const rows = nights.map((n, i) => {
    const yTop = T + i * rowH + 4;
    const x1 = xx(Math.max(0, bedAxis(n.bed))), x2 = xx((n.wake + 360) % 1440);
    const lbl = new Date(`${n.key}T00:00:00`).toLocaleDateString([], { weekday: 'short' });
    const op = (0.5 + n.eff / 220).toFixed(2);
    return `<text x="0" y="${(yTop + 11).toFixed(1)}" class="ax-row">${lbl}</text>` +
      `<rect x="${x1.toFixed(1)}" y="${yTop.toFixed(1)}" width="${Math.max(3, x2 - x1).toFixed(1)}" height="13" rx="6" class="bar" style="--op:${op}"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" class="chart-svg">${grid}${guides}${rows}</svg>`;
}

function stageChartSVG(summary) {
  const recent = summary.recent;
  let light = 0, deep = 0, rem = 0, awake = 0;
  recent.forEach((n) => { const s = estimateStages(n.asleep); light += s.light; deep += s.deep; rem += s.rem; awake += n.lat + n.waso; });
  const tot = (light + deep + rem + awake) || 1;
  const segs = [
    { label: 'Deep', val: deep, cls: 's-deep' },
    { label: 'REM', val: rem, cls: 's-rem' },
    { label: 'Light', val: light, cls: 's-light' },
    { label: 'Awake', val: awake, cls: 's-awake' },
  ];
  const r = 52, C = 2 * Math.PI * r;
  let off = 0;
  const arcs = segs.map((s) => {
    const frac = s.val / tot;
    const el = `<circle cx="64" cy="64" r="${r}" class="donut-seg ${s.cls}" stroke-dasharray="${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}" stroke-dashoffset="${(-off * C).toFixed(2)}"/>`;
    off += frac; return el;
  }).join('');
  const avgAsleep = recent.reduce((a, n) => a + n.asleep, 0) / recent.length;
  const legend = segs.map((s) => `<li class="lg ${s.cls}"><span class="lg-dot"></span><span class="lg-name">${s.label}</span><span class="lg-val">${Math.round(s.val / tot * 100)}%</span></li>`).join('');
  return `<div class="donut-wrap">
    <svg viewBox="0 0 128 128" class="donut"><g transform="rotate(-90 64 64)">${arcs}</g>
      <text x="64" y="60" class="donut-num">${fmtDur(avgAsleep)}</text>
      <text x="64" y="79" class="donut-lbl">asleep</text>
    </svg>
    <ul class="donut-legend">${legend}</ul>
  </div>`;
}

function sleepInsight(s) {
  const tips = [];
  const h = s.avgAsleep / 60;
  if (h < REC_MIN) tips.push({ sev: REC_MIN - h, text: `You're averaging <b>${fmtDur(s.avgAsleep)}</b> asleep — under the 7–9&nbsp;h adults need. A chronic shortfall dulls focus and mood and strains cardiometabolic health.` });
  if (s.consistency != null && s.consistency < 70) tips.push({ sev: (70 - s.consistency) / 18, text: `Your bed &amp; wake times swing by about <b>±${Math.round(s.sdAvg)}&nbsp;min</b>. Irregular timing — independent of how long you sleep — is linked to higher cardiometabolic and mortality risk. A steadier rhythm helps most.` });
  if (s.avgEff < EFF_GOOD) tips.push({ sev: (EFF_GOOD - s.avgEff) / 14, text: `Your sleep efficiency is about <b>${Math.round(s.avgEff)}%</b>, below the 85% mark. Time spent restless in bed eats into restorative deep &amp; REM sleep.` });
  if (s.avgLat > LAT_HI) tips.push({ sev: (s.avgLat - LAT_HI) / 18, text: `You take roughly <b>${Math.round(s.avgLat)}&nbsp;min</b> to drop off. Regularly over ~20&nbsp;min can mean a too-early bedtime or a busy mind — a few rounds in Breathe can help.` });
  if (!tips.length) return `<p class="insight-good">✶ Your sleep is in great shape — duration, timing, and efficiency all sit in healthy ranges. Keep the rhythm.</p>`;
  tips.sort((a, b) => b.sev - a.sev);
  const lead = s.score >= 85 ? 'One small thing' : 'Worth focusing on';
  return `<p class="insight-lead">${lead}</p><p class="insight-text">${tips[0].text}</p>`;
}

function renderHealth() {
  const s = healthSummary();
  const hero = $('#healthHero'), stats = $('#sleepStats'), insight = $('#sleepInsight');

  if (!s.nights.length) {
    hero.innerHTML = `${heroRingSVG(0)}<div class="hero-meta"><p class="hero-label">sleep score</p><p class="hero-verdict">No data yet</p><p class="hero-debt">Log a few nights and your score, trends, and stages appear here.</p></div>`;
    stats.innerHTML = ['avg sleep', 'consistency', 'efficiency'].map((l) => `<div class="stat"><span class="stat-num">—</span><span class="stat-lbl">${l}</span></div>`).join('');
    $('#durationChart').innerHTML = durationChartSVG();   // shows the 7–9h target zone even when empty
    $('#timingChart').innerHTML = timingChartSVG();
    $('#stageChart').innerHTML = '<p class="chart-empty">Your estimated Light / Deep / REM / Awake mix shows here once you log a night.</p>';
    insight.innerHTML = '';
    insight.style.display = 'none';
    drawHealth();
    return;
  }

  const verdict = s.score >= 85 ? 'Thriving' : s.score >= 70 ? 'Solid' : s.score >= 55 ? 'Getting there' : 'Needs care';
  const debtText = s.debt > 30 ? `<b>${fmtDur(s.debt)}</b> sleep debt this week` : 'No sleep debt — nicely balanced';
  hero.innerHTML = `${heroRingSVG(s.score)}<div class="hero-meta"><p class="hero-label">sleep score · last ${s.recent.length} nights</p><p class="hero-verdict">${verdict}</p><p class="hero-debt">${debtText}</p></div>`;

  const dur = `${fmtDur(s.avgAsleep)}`;
  stats.innerHTML = `
    <div class="stat"><span class="stat-num">${dur}</span><span class="stat-lbl">avg asleep</span></div>
    <div class="stat"><span class="stat-num">${s.consistency == null ? '—' : s.consistency}</span><span class="stat-lbl">consistency</span></div>
    <div class="stat"><span class="stat-num">${Math.round(s.avgEff)}%</span><span class="stat-lbl">efficiency</span></div>`;

  $('#durationChart').innerHTML = durationChartSVG();
  $('#timingChart').innerHTML = timingChartSVG();
  $('#stageChart').innerHTML = stageChartSVG(s);
  insight.style.display = '';
  insight.innerHTML = sleepInsight(s);
  drawHealth();
}

// (re)trigger the draw-in animations
function drawHealth() {
  const panel = $('#panel-health');
  panel.classList.remove('drawn');
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('drawn')));
}

function chipRow(el, opts, current, onPick) {
  el.innerHTML = opts.map((o) => `<button class="chip ${o.v === current ? 'is-active' : ''}" data-v="${o.v}">${o.l}</button>`).join('');
  el.addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    [...el.children].forEach((c) => c.classList.toggle('is-active', c === b));
    onPick(Number(b.dataset.v));
  });
}

function initHealth() {
  chipRow($('#logLat'), LAT_OPTS, logLat, (v) => { logLat = v; });
  chipRow($('#logWakeups'), WAKE_OPTS, logWakeups, (v) => { logWakeups = v; });

  // prefill from a night already logged today
  const today = dateKey();
  const cur = journal[today] && journal[today].sleep;
  if (cur) {
    if (cur.bed) $('#logBed').value = cur.bed;
    if (cur.wake) $('#logWake').value = cur.wake;
    logLat = cur.lat ?? logLat;
    logWakeups = cur.wakeups ?? logWakeups;
    [...$('#logLat').children].forEach((c) => c.classList.toggle('is-active', Number(c.dataset.v) === logLat));
    [...$('#logWakeups').children].forEach((c) => c.classList.toggle('is-active', Number(c.dataset.v) === logWakeups));
  }
  // default the "woke" time to the daily alarm, unless tonight is already logged
  if (!cur || !cur.wake) $('#logWake').value = `${pad(alarm.h)}:${pad(alarm.m)}`;

  $('#logSave').addEventListener('click', () => {
    const bed = $('#logBed').value, wake = $('#logWake').value;
    if (!bed || !wake) return;
    journal[today] = { ...journal[today], sleep: { bed, wake, lat: logLat, wakeups: logWakeups } };
    save('lull.journal', journal);
    const msg = $('#logSaved');
    msg.textContent = 'logged ✶';
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2200);
    renderHealth();
  });

  renderHealth();
}

/* ─────────────────────────── sounds ─────────────────────────── */

function initSounds() {
  $$('.sound').forEach((card) => {
    card.addEventListener('click', () => {
      const on = engine.toggle(card.dataset.sound);
      card.classList.toggle('is-on', on);
      card.setAttribute('aria-pressed', String(on));
    });
  });

  const vol = $('#volume');
  vol.value = settings.volume;
  const applyVol = () => {
    const v = Number(vol.value);
    vol.style.setProperty('--fill', v + '%');
    engine.setVolume(v / 100);
    settings.volume = v;
    save('lull.settings', settings);
  };
  vol.addEventListener('input', applyVol);
  vol.style.setProperty('--fill', vol.value + '%');
  engine.volume = Number(vol.value) / 100;

  // sleep timer
  const chips = $$('#timerChips .chip');
  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      chips.forEach((c) => c.classList.toggle('is-active', c === chip));
      engine.setTimer(Number(chip.dataset.min));
    });
  });

  const status = $('#timerStatus');
  setInterval(() => {
    const ms = engine.timerRemaining();
    if (ms == null) { status.textContent = ''; return; }
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    status.textContent = `the sounds will fade in ${m}:${pad(s)}`;
  }, 1000);

  engine.onTimerEnd = () => {
    $$('.sound').forEach((c) => {
      c.classList.remove('is-on');
      c.setAttribute('aria-pressed', 'false');
    });
    chips.forEach((c) => c.classList.toggle('is-active', c.dataset.min === '0'));
    status.textContent = 'sleep well ✶';
    setTimeout(() => { if (!engine.timerEnd) status.textContent = ''; }, 6000);
  };
}

/* ─────────────────────────── breathe ─────────────────────────── */

const PATTERNS = {
  478: {
    meta: 'in 4 · hold 7 · out 8 — the classic drowsy rhythm',
    phases: [
      { kind: 'in', label: 'breathe in…', dur: 4, scale: 1 },
      { kind: 'hold', label: 'hold it softly', dur: 7, scale: 1 },
      { kind: 'out', label: 'let it all go', dur: 8, scale: 0.62 },
    ],
  },
  box: {
    meta: 'in 4 · hold 4 · out 4 · hold 4 — steady as a heartbeat',
    phases: [
      { kind: 'in', label: 'breathe in…', dur: 4, scale: 1 },
      { kind: 'hold', label: 'hold', dur: 4, scale: 1 },
      { kind: 'out', label: 'breathe out…', dur: 4, scale: 0.62 },
      { kind: 'hold', label: 'rest empty', dur: 4, scale: 0.62 },
    ],
  },
  sigh: {
    meta: 'in 4 · out 6 — a long sigh, again and again',
    phases: [
      { kind: 'in', label: 'breathe in…', dur: 4, scale: 1 },
      { kind: 'out', label: 'sigh it out…', dur: 6, scale: 0.62 },
    ],
  },
};

const breath = { running: false, pattern: '478', rounds: 0, phaseTimer: null, countTimer: null };

function setOrb(scale, dur) {
  const orb = $('#orb');
  orb.style.transitionDuration = dur + 's';
  orb.style.transform = `scale(${scale})`;
}

function setPhaseLabel(text) {
  const label = $('#phaseLabel');
  label.classList.add('dim');
  setTimeout(() => {
    label.textContent = text;
    label.classList.remove('dim');
  }, 220);
}

function runPhase(idx) {
  const { phases } = PATTERNS[breath.pattern];
  const phase = phases[idx];

  setPhaseLabel(phase.label);
  setOrb(phase.scale, phase.dur);

  if ($('#cueToggle').checked) {
    engine.playCue(phase.kind);
    if (navigator.vibrate) navigator.vibrate(35);
  }

  let left = phase.dur;
  $('#phaseCount').textContent = left;
  clearInterval(breath.countTimer);
  breath.countTimer = setInterval(() => {
    left -= 1;
    if (left > 0) $('#phaseCount').textContent = left;
  }, 1000);

  breath.phaseTimer = setTimeout(() => {
    const next = (idx + 1) % phases.length;
    if (next === 0) {
      breath.rounds += 1;
      updateBreathMeta();
    }
    runPhase(next);
  }, phase.dur * 1000);
}

function updateBreathMeta() {
  const base = PATTERNS[breath.pattern].meta;
  $('#breathMeta').textContent = breath.rounds > 0
    ? `${base}  ·  ${breath.rounds} round${breath.rounds === 1 ? '' : 's'} tonight`
    : base;
}

function stopBreathing() {
  breath.running = false;
  clearTimeout(breath.phaseTimer);
  clearInterval(breath.countTimer);
  $('#breathBtn').textContent = 'begin';
  $('#phaseCount').textContent = '';
  setPhaseLabel('ready when you are');
  setOrb(0.62, 1.2);
}

function initBreathe() {
  breath.pattern = settings.pattern in PATTERNS ? settings.pattern : '478';
  $$('#patternChips .chip').forEach((chip) => {
    chip.classList.toggle('is-active', chip.dataset.pattern === breath.pattern);
    chip.addEventListener('click', () => {
      $$('#patternChips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
      breath.pattern = chip.dataset.pattern;
      settings.pattern = breath.pattern;
      save('lull.settings', settings);
      breath.rounds = 0;
      updateBreathMeta();
      if (breath.running) { stopBreathing(); startBreathing(); }
    });
  });

  const cue = $('#cueToggle');
  cue.checked = !!settings.cues;
  cue.addEventListener('change', () => {
    settings.cues = cue.checked;
    save('lull.settings', settings);
  });

  $('#breathBtn').addEventListener('click', () => {
    if (breath.running) stopBreathing();
    else startBreathing();
  });

  updateBreathMeta();
}

function startBreathing() {
  breath.running = true;
  $('#breathBtn').textContent = 'enough for tonight';
  runPhase(0);
}

/* ─────────────────────────── alarm ─────────────────────────── */

const alarm = load('lull.alarm', { h: 7, m: 0, enabled: false, ring: 'chimes', fireAt: 0 });

// every ringtone we can play: synthesized presets, folder mp3s, and custom uploads
let ringtones = [];
const ringById = (id) => ringtones.find((r) => r.id === id);

const ITEM_H = 46;          // must match --item-h in the wheel CSS
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));
const MERIDIEM = ['AM', 'PM'];

let wheelH, wheelM, wheelAP;   // wheel handles
let wheelsBuilt = false;

/* ---- a single turnable wheel, driven by native scroll-snap ---- */
function makeWheel(el, values, onChange) {
  el.innerHTML = values
    .map((v, i) => `<div class="wheel-item" role="option" data-i="${i}">${v}</div>`)
    .join('');
  const items = [...el.children];
  let lock = false, settle = null, unlock = null;

  const highlight = (idx) =>
    items.forEach((it, i) => it.classList.toggle('is-sel', i === idx));
  const indexFromScroll = () =>
    Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ITEM_H)));

  const setIndex = (idx, smooth) => {
    lock = true;
    el.scrollTo({ top: idx * ITEM_H, behavior: smooth ? 'smooth' : 'auto' });
    highlight(idx);
    clearTimeout(unlock);
    unlock = setTimeout(() => { lock = false; }, smooth ? 440 : 70);
  };

  el.addEventListener('scroll', () => {
    highlight(indexFromScroll());
    if (lock) return;
    clearTimeout(settle);
    settle = setTimeout(() => {
      const idx = indexFromScroll();
      setIndex(idx, false);            // snap dead-centre
      onChange(idx, values[idx]);
    }, 110);
  });

  items.forEach((it, i) => it.addEventListener('click', () => {
    setIndex(i, true);
    onChange(i, values[i]);
  }));

  return { setIndex, index: indexFromScroll };
}

/* ---- time math ---- */
function wheelToHM() {
  const h12 = wheelH.index() + 1;          // 1..12
  const pm = wheelAP.index() === 1;
  return { h: (h12 % 12) + (pm ? 12 : 0), m: wheelM.index() };
}

function hmToWheel(h, m) {
  const pm = h >= 12 ? 1 : 0;
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { hIdx: h12 - 1, mIdx: m, apIdx: pm };
}

function fmt12(h, m) {
  const pm = h >= 12;
  let h12 = h % 12; if (h12 === 0) h12 = 12;
  return { h12, m: pad(m), mer: pm ? 'PM' : 'AM' };
}

function nextFire(h, m) {
  const now = new Date();
  const f = new Date(now);
  f.setHours(h, m, 0, 0);
  if (f <= now) f.setDate(f.getDate() + 1);
  return f.getTime();
}

function fmtCountdown(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h > 0) return `rings in ${h}h ${pad(m)}m`;
  if (m > 1) return `rings in ${m} min`;
  return 'rings in under a minute';
}

/* ---- the readout + set/cancel state ---- */
function refreshReadout() {
  const { h, m } = wheelToHM();
  const t = fmt12(h, m);
  $('#alarmReadout').innerHTML = `${t.h12}:${t.m}<small>${t.mer}</small>`;
}

function refreshAlarmUI() {
  const when = $('#alarmWhen');
  const toggle = $('#alarmToggle');
  if (alarm.enabled) {
    when.textContent = fmtCountdown(alarm.fireAt - Date.now());
    when.classList.add('is-set');
    toggle.textContent = 'cancel alarm';
  } else {
    when.textContent = 'alarm off';
    when.classList.remove('is-set');
    toggle.textContent = 'set alarm';
  }
}

function onWheelChange() {
  const { h, m } = wheelToHM();
  alarm.h = h; alarm.m = m;
  refreshReadout();
  if (alarm.enabled) {
    alarm.fireAt = nextFire(h, m);
    refreshAlarmUI();
  }
  save('lull.alarm', alarm);
}

// position the wheels — only works once the panel is actually visible
function onAlarmShown() {
  if (!wheelsBuilt) return;
  const { hIdx, mIdx, apIdx } = hmToWheel(alarm.h, alarm.m);
  requestAnimationFrame(() => {
    wheelH.setIndex(hIdx, false);
    wheelM.setIndex(mIdx, false);
    wheelAP.setIndex(apIdx, false);
    refreshReadout();
  });
  refreshAlarmUI();
}

/* ---- ringtone list ---- */
function renderRingtones() {
  const list = $('#ringList');
  if (!ringById(alarm.ring) && ringtones.length) alarm.ring = ringtones[0].id;

  list.innerHTML = ringtones.map((r) => `
    <button class="ring ${r.id === alarm.ring ? 'is-sel' : ''}" data-ring="${r.id}">
      <span class="ring-ico"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
      <span class="ring-name">${r.name}</span>
      ${r.removable ? '<span class="ring-del" data-del="' + r.id + '" role="button" aria-label="Remove">×</span>' : ''}
      <span class="ring-check"><svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg></span>
    </button>`).join('');
}

function selectRing(id) {
  const r = ringById(id);
  if (!r) return;
  alarm.ring = id;
  save('lull.alarm', alarm);
  $$('#ringList .ring').forEach((el) => {
    const on = el.dataset.ring === id;
    el.classList.toggle('is-sel', on);
  });
  // a little taste of the chosen tone
  $$('#ringList .ring').forEach((el) => el.classList.remove('is-playing'));
  const card = $(`#ringList .ring[data-ring="${CSS.escape(id)}"]`);
  if (card) {
    card.classList.add('is-playing');
    setTimeout(() => card.classList.remove('is-playing'), 5000);
  }
  engine.preview(r);
}

/* ---- folder mp3s + custom uploads ---- */
async function loadFolderRingtones() {
  try {
    const res = await fetch('ringtones/ringtones.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const list = await res.json();
    return (Array.isArray(list) ? list : [])
      .filter((e) => e && e.file)
      .map((e) => ({
        id: `folder:${e.file}`,
        name: e.name || e.file.replace(/\.[^.]+$/, ''),
        kind: 'mp3',
        src: `ringtones/${e.file}`,
      }));
  } catch (_) {
    return [];   // no folder, no manifest — that's fine
  }
}

async function loadCustomRingtones() {
  try {
    const saved = await idbAll();
    return saved.map(({ key, blob }) => ({
      id: key,                       // "custom:<name>"
      name: key.slice('custom:'.length),
      kind: 'mp3',
      src: URL.createObjectURL(blob),
      removable: true,
    }));
  } catch (_) {
    return [];
  }
}

async function addCustomRingtone(file) {
  const name = file.name.replace(/\.[^.]+$/, '');
  const id = `custom:${name}`;
  try { await idbPut(id, file); } catch (_) { /* private mode, maybe — keep it for the session */ }
  // drop any previous entry with the same id, then add fresh
  ringtones = ringtones.filter((r) => r.id !== id);
  ringtones.push({ id, name, kind: 'mp3', src: URL.createObjectURL(file), removable: true });
  renderRingtones();
  selectRing(id);
}

async function removeCustomRingtone(id) {
  engine.stopRing();
  try { await idbDel(id); } catch (_) { /* nothing to delete */ }
  const gone = ringtones.find((r) => r.id === id);
  if (gone && gone.src.startsWith('blob:')) URL.revokeObjectURL(gone.src);
  ringtones = ringtones.filter((r) => r.id !== id);
  if (alarm.ring === id) alarm.ring = ringtones[0] ? ringtones[0].id : 'chimes';
  save('lull.alarm', alarm);
  renderRingtones();
}

/* ---- the ring itself ---- */
let vibeAt = 0;

// keep the native (Android) alarm in step with our state — a no-op on the web
function syncNativeAlarm() {
  if (alarm.enabled) native.scheduleAlarm(alarm.fireAt);
  else native.cancelAlarm();
}

function fireAlarm() {
  native.cancelAlarm();                       // app's awake — don't also ding the notification
  engine.stopAll(0.4);                        // hush the soundscapes
  const r = ringById(alarm.ring) || ringtones[0];
  engine.startAlarm(r);
  const t = fmt12(alarm.h, alarm.m);
  $('#ringTime').textContent = `${t.h12}:${t.m} ${t.mer}`;
  $('#alarmOverlay').classList.add('show');
  vibeAt = 0;                                 // pulse vibration immediately
}

function dismissAlarm() {
  engine.stopRing();
  if (navigator.vibrate) navigator.vibrate(0);
  $('#alarmOverlay').classList.remove('show');
  alarm.enabled = false;
  alarm.fireAt = 0;
  save('lull.alarm', alarm);
  syncNativeAlarm();
  refreshAlarmUI();
}

function snoozeAlarm() {
  engine.stopRing();
  if (navigator.vibrate) navigator.vibrate(0);
  $('#alarmOverlay').classList.remove('show');
  alarm.fireAt = Date.now() + 5 * 60000;
  save('lull.alarm', alarm);
  syncNativeAlarm();
  refreshAlarmUI();
}

// one heartbeat a second: fire on time, keep the countdown honest, throb the phone
function alarmTick() {
  if (engine.ringing) {
    const now = Date.now();
    if (navigator.vibrate && now - vibeAt > 2000) {
      navigator.vibrate([450, 200, 450]);
      vibeAt = now;
    }
    return;
  }
  if (!alarm.enabled) return;
  if (Date.now() >= alarm.fireAt) {
    fireAlarm();
    return;
  }
  if ($('#panel-alarm').classList.contains('is-active')) refreshAlarmUI();
}

async function initAlarm() {
  // build the wheels
  wheelH = makeWheel($('#wheelH'), HOURS, onWheelChange);
  wheelM = makeWheel($('#wheelM'), MINUTES, onWheelChange);
  wheelAP = makeWheel($('#wheelAP'), MERIDIEM, onWheelChange);
  wheelsBuilt = true;

  // ringtones: synth presets first, then folder mp3s, then custom uploads
  ringtones = synthRingtones.map((r) => ({ ...r, kind: 'synth' }));
  renderRingtones();

  const [folder, custom] = await Promise.all([loadFolderRingtones(), loadCustomRingtones()]);
  ringtones = ringtones.concat(folder, custom);
  renderRingtones();

  // ringtone interactions
  $('#ringList').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); removeCustomRingtone(del.dataset.del); return; }
    const ring = e.target.closest('.ring');
    if (ring) selectRing(ring.dataset.ring);
  });

  $('#ringAdd').addEventListener('click', () => $('#ringFile').click());
  $('#ringFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) addCustomRingtone(file);
    e.target.value = '';
  });

  // set / cancel
  $('#alarmToggle').addEventListener('click', () => {
    if (alarm.enabled) {
      alarm.enabled = false;
      alarm.fireAt = 0;
    } else {
      engine.ensure();                         // unlock audio while we have a gesture
      const { h, m } = wheelToHM();
      alarm.h = h; alarm.m = m;
      alarm.enabled = true;
      alarm.fireAt = nextFire(h, m);
      // keep the sleep-log's "woke" default in step with the alarm (unless already logged)
      const lw = $('#logWake'), t = dateKey();
      if (lw && !(journal[t] && journal[t].sleep && journal[t].sleep.wake)) lw.value = `${pad(h)}:${pad(m)}`;
    }
    save('lull.alarm', alarm);
    syncNativeAlarm();
    refreshAlarmUI();
  });

  $('#alarmDismiss').addEventListener('click', dismissAlarm);
  $('#alarmSnooze').addEventListener('click', snoozeAlarm);

  // tapping the Android alarm notification opens the app — ring here too
  native.onAlarmTapped(() => fireAlarm());

  // be honest about reach: native rings in the background, web only while open
  $('.alarm-foot').textContent = native.isNative
    ? 'Rings even when Lull is closed.'
    : '';

  // a stale "enabled" alarm from a past session shouldn't ring instantly
  if (alarm.enabled && Date.now() >= alarm.fireAt) {
    alarm.fireAt = nextFire(alarm.h, alarm.m);
    save('lull.alarm', alarm);
  }
  // make sure the native schedule matches whatever we restored
  syncNativeAlarm();

  refreshReadout();
  refreshAlarmUI();
  setInterval(alarmTick, 1000);
}

/* ---------- a tiny IndexedDB box for custom ringtones ---------- */
function idb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('lull-alarm', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('ringtones');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbPut(key, blob) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('ringtones', 'readwrite');
    tx.objectStore('ringtones').put(blob, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(key) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('ringtones', 'readwrite');
    tx.objectStore('ringtones').delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbAll() {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction('ringtones', 'readonly');
    const store = tx.objectStore('ringtones');
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    tx.oncomplete = () => res(keysReq.result.map((k, i) => ({ key: k, blob: valsReq.result[i] })));
    tx.onerror = () => rej(tx.error);
  });
}

/* ─────────────────────────── boot ─────────────────────────── */

buildSky();
setGreeting();
tickClock();
setInterval(tickClock, 1000);

(async () => {
  await native.init();
  // pull durable copies (native) into our stores before anything reads them
  await store.hydrate(['lull.journal', 'lull.settings', 'lull.alarm']);
  Object.assign(journal, load('lull.journal', {}));
  Object.assign(settings, load('lull.settings', {}));
  Object.assign(alarm, load('lull.alarm', {}));

  initJournal();
  initHistory();
  initHealth();
  initSounds();
  initBreathe();
  initAlarm();
  initTabs();          // last, so hash routing finds every panel ready
})();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is a nicety, not a need */ });
  });
}
