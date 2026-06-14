/* ════════════════════════════════════════════════════════════════
   Lull — app logic. Tabs, the sky, the clock, the night journal,
   the breathing ritual and the alarm.
   ════════════════════════════════════════════════════════════════ */

import { engine, synthRingtones } from './audio.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─────────────────────────── tiny stores ─────────────────────────── */

const load = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch (_) { return fallback; }
};
const save = (key, value) => localStorage.setItem(key, JSON.stringify(value));

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
  for (let i = 0; i < 110; i++) {
    const s = document.createElement('i');
    s.className = 'star';
    const size = 1 + Math.random() * 1.8;
    s.style.width = s.style.height = size.toFixed(1) + 'px';
    s.style.left = (Math.random() * 100).toFixed(2) + '%';
    s.style.top = (Math.random() * 100).toFixed(2) + '%';
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

const PANELS = ['tonight', 'sounds', 'breathe', 'alarm'];

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

function fireAlarm() {
  engine.stopAll(0.4);                       // hush the soundscapes
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
  refreshAlarmUI();
}

function snoozeAlarm() {
  engine.stopRing();
  if (navigator.vibrate) navigator.vibrate(0);
  $('#alarmOverlay').classList.remove('show');
  alarm.fireAt = Date.now() + 5 * 60000;
  save('lull.alarm', alarm);
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
    }
    save('lull.alarm', alarm);
    refreshAlarmUI();
  });

  $('#alarmDismiss').addEventListener('click', dismissAlarm);
  $('#alarmSnooze').addEventListener('click', snoozeAlarm);

  // a stale "enabled" alarm from a past session shouldn't ring instantly
  if (alarm.enabled && Date.now() >= alarm.fireAt) alarm.fireAt = nextFire(alarm.h, alarm.m);

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
initTabs();
setGreeting();
tickClock();
setInterval(tickClock, 1000);
initJournal();
initSounds();
initBreathe();
initAlarm();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* offline shell is a nicety, not a need */ });
  });
}
