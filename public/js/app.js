import { openStore } from './store.js';

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
};
const icon = (markup) => { const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild; };
const I = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.4 1-4 2.5-5.2-.2 2 .6 3.2 1.8 3.7C10.8 8.5 11 5 12 2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/></svg>',
  mark: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 15.5h18M5 15.5l2-5h8.5l3 5" stroke="#160700" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="17" r="2" fill="#160700"/><circle cx="16.5" cy="17" r="2" fill="#160700"/></svg>',
};
const gbp = (v) => '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (v === null || v === undefined ? 'n/a' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%');
const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
const pad3 = (n) => (n ? String(n).padStart(3, '0') : '');
const dateGB = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
let toastT;
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); };

const TYPE = {
  super_treasure_hunt: { label: 'Super Treasure Hunt', short: 'Super', cls: 'sth', edge: '#F4BE3A', side: '#6B5212', rim: '#E7EAEE', glow: 'rgba(244,190,58,.24)', group: 'S' },
  treasure_hunt: { label: 'Treasure Hunt', short: 'TH', cls: 'th', edge: '#C9CFD6', side: '#4A5059', rim: '#8A9099', glow: 'rgba(201,207,214,.18)', group: 'T' },
  mainline: { label: 'Mainline', short: 'Mainline', cls: '', edge: '#3A3F4B', side: '#22252D', rim: '#8A9099', glow: 'rgba(255,94,34,.14)', group: 'O' },
  premium: { label: 'Premium', short: 'Premium', cls: '', edge: '#3A3F4B', side: '#22252D', rim: '#E7EAEE', glow: 'rgba(255,94,34,.14)', group: 'O' },
  other: { label: 'Other', short: 'Other', cls: '', edge: '#3A3F4B', side: '#22252D', rim: '#8A9099', glow: 'rgba(255,94,34,.14)', group: 'O' },
  unknown: { label: 'Not sure', short: '?', cls: '', edge: '#3A3F4B', side: '#22252D', rim: '#8A9099', glow: 'rgba(255,94,34,.14)', group: 'O' },
};
const T = (type) => TYPE[type] || TYPE.unknown;

/* ---------- the car drawing and the 3D pack ---------- */
const PAINT = [
  [/pink|magenta/, '#E86AA5'], [/purple|violet/, '#7A3CFF'], [/light blue|teal|aqua|turquoise/, '#1E9BD7'], [/blue/, '#2F6BFF'],
  [/red|maroon/, '#C0322B'], [/orange/, '#E2480C'], [/gold|yellow/, '#F4BE3A'], [/green/, '#3FB66B'], [/brown|bronze|copper/, '#9A6634'],
  [/cream|beige/, '#EFE3C2'], [/white|pearl/, '#E8E8E8'], [/black/, '#2B2F38'], [/grey|gray|silver|zamac|chrome/, '#9AA3AE'],
];
const paintOf = (text) => { const t = String(text || '').toLowerCase(); for (const [re, hex] of PAINT) if (re.test(t)) return hex; return '#9AA3AE'; };
const carSvg = (paint, rim) => '<svg viewBox="0 0 120 48" aria-hidden="true"><ellipse cx="62" cy="45" rx="52" ry="3" fill="#000" opacity=".5"/>'
  + `<path d="M6 35 C6 29 10 27 18 26 L38 23 C46 15 56 12 70 12 C82 12 90 16 98 23 L110 26 C114 27 116 30 116 35 L116 38 L6 38 Z" fill="${paint}"/>`
  + '<path d="M45 23.5 C51 17 58 15.5 68 15.5 C77 15.5 83 18 89 23.5 Z" fill="#07080B" opacity=".9"/><path d="M14 28 C40 23.5 80 21.5 110 28.5 L110 30 C80 24 40 26 14 30 Z" fill="#fff" opacity=".55"/>'
  + `<circle cx="30" cy="38" r="7.5" fill="#0B0C0F"/><circle cx="30" cy="38" r="3.8" fill="${rim}"/><circle cx="94" cy="38" r="7.5" fill="#0B0C0F"/><circle cx="94" cy="38" r="3.8" fill="${rim}"/></svg>`;
const carArt = (type, paintText) => icon(carSvg(paintOf(paintText), T(type).rim));
const picture = (src, type, paintText) => {
  if (!src) return carArt(type, paintText);
  const img = h('img', { src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(carArt(type, paintText)), { once: true });
  return img;
};
const sideShadow = (type, ry, px = 7, drop = '0 30px 30px -18px rgba(0,0,0,.95)') => (ry > 0 ? -px : px) + 'px 0 0 ' + T(type).side + ', ' + drop;
// o: { type, w, h, ry, rx, z, big, top:[l,r], bottom:[l,r], name, src, paint, cls }
const pack = (o) => {
  const t = T(o.type);
  const tf = `rotateY(${o.ry || 0}deg) rotateX(${o.rx || 0}deg)` + (o.z ? ` translateZ(${o.z}px)` : '');
  const lbl = (pair) => pair && h('div', { class: 'lbl' }, h('span', { text: pair[0] }), h('span', { text: pair[1] }));
  return h('div', {
    class: 'pack' + (o.big ? ' big' : '') + (o.cls ? ' ' + o.cls : ''),
    style: `--edge:${t.edge};width:${o.w}px;height:${o.h}px;transform:${tf};box-shadow:${o.shadow || sideShadow(o.type, o.ry || 0, o.px)}`,
  },
  h('div', { class: 'hang' }), lbl(o.top), h('div', { class: 'win' }, picture(o.src, o.type, o.paint)),
  o.name ? h('div', { class: 'nm', text: o.name, style: o.fs ? `font-size:${o.fs}px` : null }) : null, lbl(o.bottom),
  h('div', { class: 'shine', 'aria-hidden': 'true' }));
};

/* ---------- catalog (models + prices) ---------- */
let CAT = { cars: [], shelf: 1.35, superAvg: 0, thAvg: 0, pricesSaved: '' };
let byId = new Map();
let byName = new Map();
const isHunt = (c) => c.type === 'super_treasure_hunt' || c.type === 'treasure_hunt';
const hunts2026 = () => CAT.cars.filter((c) => c.y === 2026 && isHunt(c));
const loadCatalog = async () => {
  const r = await fetch('/data/catalog.json');
  if (!r.ok) throw new Error('catalog');
  CAT = await r.json();
  byId = new Map(CAT.cars.map((c) => [c.id, c]));
  byName = new Map();
  for (const c of CAT.cars) { const k = norm(c.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(c); }
};
const findRow = (name, type) => {
  const rows = byName.get(norm(name));
  if (!rows) return null;
  return rows.find((c) => c.type === type && c.y === 2026) || rows.find((c) => c.type === type) || (isHunt({ type }) ? null : rows.find((c) => !isHunt(c))) || null;
};
const rowFor = (it) => (it.catalogId && byId.get(it.catalogId)) || (it.match ? findRow(it.match, it.type) : null);
const valueFor = (row, type) => {
  if (row && row.now) return { value: row.now, est: false, basis: 'Value now for this exact car' };
  if (row && row.status === 'upcoming') return { value: null, est: true, basis: 'Not out yet: no sales to price it from' };
  if (type === 'super_treasure_hunt') return { value: CAT.superAvg, est: true, basis: 'Estimate: the average for a 2026 Super' };
  if (type === 'treasure_hunt') return { value: CAT.thAvg, est: true, basis: 'Estimate: the average for a 2026 Treasure Hunt' };
  if (type === 'mainline') return { value: CAT.shelf, est: true, basis: 'Mainline cars sell for about the shop price' };
  return { value: null, est: true, basis: 'No price data for this kind of car' };
};
const itemValue = (it) => { const row = rowFor(it); return row && row.now ? row.now : Number(it.value) || 0; };

/* ---------- album store ---------- */
let store = null;
let items = [];
const reload = async () => { items = await store.list(); updateBadges(); };
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const owned = () => new Set(items.map((it) => rowFor(it)?.id).filter(Boolean));
const worth = () => items.reduce((s, it) => s + itemValue(it), 0);
const ranked = () => [...items].sort((a, b) => itemValue(b) - itemValue(a));
const updateBadges = () => { const b = $('#album-badge'); b.textContent = items.length; b.hidden = !items.length; };
const itemFromRow = (row, extra = {}) => ({
  id: newId(), catalogId: row.id, name: row.name, type: row.type, match: row.name,
  value: valueFor(row, row.type).value, est: !row.now, caseLetter: row.case || null, colour: row.paint || '',
  condition: 'carded', paid: null, confidence: null, thumb: null, addedAt: new Date().toISOString(), ...extra,
});

/* ---------- share ---------- */
const shareCar = async (name, type, value) => {
  const text = `${name}: ${T(type).label}${value ? ', worth about ' + gbp(value) : ''}. Found with Peg Hunter.`;
  try {
    if (navigator.share) { await navigator.share({ title: 'Peg Hunter', text, url: location.origin }); return; }
    await navigator.clipboard.writeText(text + ' ' + location.origin);
    toast('Copied, ready to paste');
  } catch (err) { if (err && err.name !== 'AbortError') toast('Could not share'); }
};

/* ---------- common bits ---------- */
const typePill = (type) => h('span', { class: 'pill ' + T(type).cls }, type === 'super_treasure_hunt' ? icon(I.star) : type === 'treasure_hunt' ? icon(I.flame) : null, T(type).label);
const topbar = (back, title, right) => h('div', { class: 'topbar' },
  h('a', { class: 'round', href: back, 'aria-label': 'Back' }, icon(I.back)),
  h('span', { class: 'ttl', text: title }), right || h('span', { style: 'width:44px', 'aria-hidden': 'true' }));
const brandbar = () => h('div', { class: 'topbar ruled' },
  h('a', { class: 'brand', href: '#album', 'aria-label': 'Peg Hunter home' }, h('div', { class: 'mark', 'aria-hidden': 'true' }, icon(I.mark)), h('span', { class: 'brand-name' }, 'Peg', h('span', { text: 'Hunter' }))),
  h('div', { class: 'worth' }, h('small', { text: 'Album worth' }), h('b', { class: 'num', text: gbp(worth()) })));
const stat = (k, v, cls) => h('div', {}, h('span', { class: 'label', text: k }), h('span', { class: 'disp num ' + (cls || ''), text: v }));
const chgCls = (c) => (c < 0 ? 'down' : c > 0 ? 'up' : '');
const multiStrip = (value, type) => {
  if (!value) return null;
  const x = value / CAT.shelf;
  if (x >= 2) return h('div', { class: 'multi' }, h('span', { class: 'disp num', text: Math.round(x) + '×' }),
    h('span', { text: `the ${gbp(CAT.shelf)} shop price. ${isHunt({ type }) ? 'Buy it and keep it in the pack: loose cars sell for less.' : 'Worth keeping in the pack.'}` }));
  return h('div', { class: 'multi plain' }, h('span', { class: 'disp', text: '1×' }), h('span', { text: 'About the shop price. Buy it if you like it.' }));
};
const SPOT = {
  super_treasure_hunt: { title: 'How to spot a Super', tick: '', list: [
    ['Spectraflame paint', 'Deep, shiny metallic colour, not flat paint'], ['Real Riders rubber tyres', 'Soft rubber, not hard plastic wheels'],
    ['"TH" printed on the car', 'Usually small, on the side or the back'], ['Gold flame logo on the card', 'Behind the car, inside the blister']] },
  treasure_hunt: { title: 'How to spot a Treasure Hunt', tick: 'th', list: [
    ['Flame logo on the car', 'A small circle-flame printed on the body'], ['Silver flame logo on the card', 'Behind the car, inside the blister'],
    ['Normal paint and plastic wheels', 'That is what tells it apart from a Super']] },
};
const spotList = (type) => {
  const s = SPOT[type];
  if (!s) return null;
  return h('div', { class: 'stack' }, h('span', { class: 'h2', text: s.title }),
    h('div', { class: 'panel checks' }, s.list.map(([b, sub]) => h('div', {}, h('span', { class: 'tick ' + s.tick }, icon(I.check)), h('div', {}, h('b', { text: b }), h('span', { text: sub }))))));
};
const factsPanel = (row) => row && h('div', { class: 'panel market' },
  h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('span', { class: 'h2', text: 'In the range' }), h('span', { class: 'meta', text: row.status === 'upcoming' ? 'Coming in ' + row.y : row.y + ' mainline' })),
  h('div', { class: 'row2' },
    h('div', { class: 'field' }, h('span', { text: 'Collector number' }), h('b', { class: 'disp num', style: 'font-size:26px', text: row.col ? '#' + pad3(row.col) + ' / 250' : 'TBC' })),
    h('div', { class: 'field' }, h('span', { text: 'Series' }), h('b', { style: 'font-size:15px', text: row.series + (row.sno ? ' ' + row.sno : '') }))),
  h('p', { class: 'foot', text: ['Toy ' + row.id, row.v > 1 ? 'colour ' + row.v + (row.variant ? ' (' + row.variant + ')' : '') : null, row.excl ? row.excl + ' exclusive' : null, row.new ? 'new casting' : null].filter(Boolean).join(' · ') + '.' }));

/* ---------- SCAN ---------- */
let scanOk = false;
let mode = (() => { try { return localStorage.getItem('peghunter.mode') || 'sweep'; } catch { return 'sweep'; } })();
const sc = { state: 'idle', stream: null, track: null, still: null, sweep: null, torch: false };
const initAI = async () => {
  try { const r = await fetch('/api/scan'); scanOk = r.ok && (await r.json()).enabled === true; } catch { scanOk = false; }
};
const WALL = ['#2747C9', '#B8301D', '#2747C9', '#C98A10', '#1F7A55', '#2747C9', '#6A28B0', '#B8301D', '#C98A10', '#2747C9', '#2747C9', '#B8301D', '#1F7A55', '#C98A10', '#2747C9', '#6A28B0'];
const WALL_PAINT = ['#D9DDE3', '#1E9BD7', '#E2480C', '#F2F2F2', '#F4BE3A', '#9AA3AE', '#2B2F38', '#3FB66B', '#C0322B', '#5E6AD2', '#7A3CFF', '#E8E8E8', '#FFB020', '#2F6BFF', '#B33A3A', '#E2E2E2'];
const drawWall = () => {
  const box = $('#wall-cards');
  if (box.childElementCount) return;
  WALL.forEach((bg, i) => box.append(h('div', { class: 'peg' }, h('i'),
    h('div', { class: 'pack', style: `--card:${bg}` }, h('div', { class: 'hang' }), h('div', { class: 'win' }, icon(carSvg(WALL_PAINT[i], '#8A9099')))))));
};
const setMode = (m) => {
  mode = m;
  try { localStorage.setItem('peghunter.mode', m); } catch {}
  document.querySelectorAll('#modes [data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  $('#live-mode').textContent = m === 'sweep' ? 'Peg sweep' : 'One card';
  if (sc.state === 'live') $('#hint').textContent = m === 'sweep' ? 'Move slowly along the pegs. Hold still, then tap scan.' : 'Fill the frame with one card, then tap scan.';
  renderTally();
};
const renderTally = () => {
  const s = sc.sweep;
  const chips = $('#tally-chips');
  if (s && mode === 'sweep') {
    const sth = s.cards.filter((c) => c.type === 'super_treasure_hunt').length;
    const th = s.cards.filter((c) => c.type === 'treasure_hunt').length;
    $('#tally-k').textContent = 'This peg wall';
    $('#tally-v').textContent = s.cards.length + ' card' + (s.cards.length === 1 ? '' : 's') + ' checked';
    chips.replaceChildren(h('span', { class: 'pill sth soft', text: sth + ' Super' }), h('span', { class: 'pill th soft', text: th + ' TH' }));
  } else {
    $('#tally-k').textContent = mode === 'sweep' ? 'Peg sweep' : 'One card';
    $('#tally-v').textContent = !scanOk ? 'AI scan is off' : mode === 'sweep' ? 'Scan the whole wall' : 'Check one car';
    chips.replaceChildren();
  }
};
const setLive = (on, label) => {
  $('#live-dot').className = on ? 'blink' : 'off';
  $('#live-k').textContent = label || (on ? 'LIVE' : 'PAUSED');
};
const showMsg = (title, text, ...actions) => {
  const m = $('#scan-msg');
  m.replaceChildren(h('b', { text: title }), h('p', { text }), ...actions);
  m.hidden = false;
};
const startCamera = async () => {
  $('#scan-msg').hidden = true;
  if (!navigator.mediaDevices?.getUserMedia) return noCamera('This browser cannot use the camera. Pick a photo instead.');
  try {
    sc.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  } catch (err) {
    return noCamera(err && err.name === 'NotAllowedError' ? 'Camera access is blocked. Allow it in your browser settings, or pick a photo.' : 'No camera found. Pick a photo instead.');
  }
  if (location.hash !== '#scan') { stopCamera(); return; }
  sc.track = sc.stream.getVideoTracks()[0];
  const v = $('#feed');
  v.srcObject = sc.stream;
  v.hidden = false;
  $('#wall').hidden = true;
  await v.play().catch(() => {});
  const caps = sc.track.getCapabilities ? sc.track.getCapabilities() : {};
  $('#torch').hidden = !caps.torch; $('#torch-gap').hidden = !!caps.torch;
  sc.state = 'live';
  $('#beam').hidden = false;
  setLive(true);
  setMode(mode);
};
const stopCamera = () => {
  sc.stream?.getTracks().forEach((t) => t.stop());
  sc.stream = null; sc.track = null; sc.torch = false;
  $('#torch').setAttribute('aria-pressed', 'false');
  $('#feed').srcObject = null;
  $('#feed').hidden = true;
  $('#beam').hidden = true;
};
const noCamera = (why) => {
  stopCamera();
  sc.state = 'nocam';
  $('#wall').hidden = false; drawWall();
  $('#torch').hidden = true; $('#torch-gap').hidden = false;
  setLive(false, 'NO CAMERA');
  $('#hint').textContent = 'Pick a photo of the pegs or of one card.';
  showMsg('Camera is off', why, h('button', { class: 'btn', type: 'button', onclick: () => startCamera(), text: 'Try the camera again' }));
};
const resetScan = () => {
  sc.sweep = null; sc.still = null;
  $('#still').hidden = true; $('#still').removeAttribute('src');
  $('#boxes').replaceChildren();
  $('#busy').hidden = true;
  renderTally();
};
const enterScan = () => {
  setMode(mode);
  if (sc.state === 'results' || sc.state === 'busy') { layoutBoxes(); return; }
  resetScan();
  startCamera();
};
const leaveScan = () => { stopCamera(); if (sc.state === 'live') sc.state = 'idle'; };

const toCanvas = (src, max, crop) => {
  const sw = crop ? crop.w : (src.videoWidth || src.naturalWidth || src.width);
  const shh = crop ? crop.h : (src.videoHeight || src.naturalHeight || src.height);
  const k = Math.min(1, max / Math.max(sw, shh));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(shh * k));
  c.getContext('2d').drawImage(src, crop ? crop.x : 0, crop ? crop.y : 0, sw, shh, 0, 0, c.width, c.height);
  return c;
};
const loadImage = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => res(img);
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
  img.src = url;
});
const SCAN_MSG = {
  disabled: 'AI scanning is switched off on this site. You can still find your car in Prices.',
  rate_limited: 'Too many scans in a short time. Wait a minute and try again.',
  image_rejected: 'This photo could not be used. Try another one.',
  too_large: 'This photo is too big. Try a smaller one.',
  refused: 'The scanner could not check this photo. Try another one.',
  invalid_json: 'The answer could not be read. Scan again.',
  network: 'No connection. Check your signal and scan again.',
};
const api = async (image, m) => {
  let r;
  try { r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image, mode: m }) }); }
  catch { throw new Error('network'); }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'server');
  return body.result;
};
const capture = () => {
  if (sc.state === 'busy') return;
  if (sc.state === 'results' || sc.state === 'failed') { resetScan(); sc.state = 'idle'; startCamera(); return; }
  const v = $('#feed');
  if (sc.state !== 'live' || !v.videoWidth) { $('#in-gallery').click(); return; }
  run(toCanvas(v, 2000));
};
const onPick = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try { const img = await loadImage(file); run(toCanvas(img, 2000)); URL.revokeObjectURL(img.src); }
  catch { toast('This photo could not be opened'); }
};
const run = async (canvas) => {
  const m = mode;
  stopCamera();
  resetScan();
  sc.still = canvas;
  const still = $('#still');
  still.src = canvas.toDataURL('image/jpeg', 0.9);
  still.hidden = false;
  $('#wall').hidden = true;
  $('#scan-msg').hidden = true;
  setLive(false, 'PAUSED');
  if (!scanOk) { sc.state = 'failed'; showMsg('AI scan is off', SCAN_MSG.disabled, h('a', { class: 'btn', href: '#db', text: 'Open Prices' })); $('#hint').textContent = 'Tap scan to go back to the camera.'; return; }
  sc.state = 'busy';
  $('#busy').hidden = false;
  $('#busy span').textContent = m === 'sweep' ? 'Checking every card…' : 'Checking the car…';
  try {
    const big = toCanvas(canvas, m === 'sweep' ? 1600 : 1280).toDataURL('image/jpeg', 0.85);
    const result = await api(big, m);
    $('#busy').hidden = true;
    if (m === 'card') {
      sc.state = 'failed';
      if (result.found === false) { showMsg('No car found', 'Fill the frame with the car and its card, in good light.'); $('#hint').textContent = 'Tap scan to try again.'; return; }
      pending = { result, thumb: toCanvas(canvas, 420).toDataURL('image/jpeg', 0.72) };
      location.hash = '#result';
      return;
    }
    sc.sweep = result;
    sc.state = 'results';
    renderTally();
    layoutBoxes();
    const hits = result.cards.filter((c) => isHunt(c)).length;
    $('#hint').textContent = result.cards.length ? (hits ? 'Tap a highlighted card to see it. Tap scan to go again.' : 'No hunts here. Tap any card to check it, or scan again.') : 'No cards found. Get closer and scan again.';
  } catch (err) {
    $('#busy').hidden = true;
    sc.state = 'failed';
    showMsg('Scan failed', SCAN_MSG[err.message] || 'The scan did not finish. Try again.');
    $('#hint').textContent = 'Tap scan to try again.';
  }
};
// Map a box in image fractions onto the screen, matching object-fit: cover.
const layoutBoxes = () => {
  const root = $('#boxes');
  root.replaceChildren();
  const s = sc.sweep; const c = sc.still;
  if (!s || !c) return;
  const W = root.clientWidth; const H = root.clientHeight;
  const k = Math.max(W / c.width, H / c.height);
  const ox = (W - c.width * k) / 2; const oy = (H - c.height * k) / 2;
  const order = [...s.cards].sort((a, b) => (isHunt(a) ? 1 : 0) - (isHunt(b) ? 1 : 0));
  for (const card of order) {
    const x = ox + card.x * c.width * k; const y = oy + card.y * c.height * k;
    const w = card.w * c.width * k; const hh = card.h * c.height * k;
    const open = () => openSweepCard(card);
    const hunt = isHunt(card);
    const t = T(card.type);
    const row = card.catalogId ? byId.get(card.catalogId) : null;
    const name = (row && row.name) || card.name || 'Unknown car';
    const box = h('button', { class: 'hit' + (hunt ? '' : ' plain'), type: 'button', 'aria-label': name + ', ' + t.label, onclick: open, style: `left:${x}px;top:${y}px;width:${w}px;height:${hh}px;--c:${t.edge}` },
      hunt ? [h('i', { class: 'cn' }), h('i', { class: 'cn' }), h('i', { class: 'cn' }), h('i', { class: 'cn' })] : null,
      card.type === 'super_treasure_hunt' ? h('span', { class: 'ring pulse', 'aria-hidden': 'true' }) : null);
    root.append(box);
    if (!hunt) continue;
    const v = valueFor(row, card.type).value;
    const cw = card.type === 'super_treasure_hunt' ? 214 : 190;
    const cx = Math.min(Math.max(8, x + w / 2 - cw / 2), W - cw - 8);
    let cy = y - 66;
    if (cy < 110) cy = y + hh + 8;
    root.append(h('button', { class: 'callout ' + t.cls, type: 'button', onclick: open, style: `left:${cx}px;top:${cy}px;width:${cw}px;--c:${t.edge}`, 'aria-hidden': 'true', tabindex: '-1' },
      h('span', { class: 'k' }, card.type === 'super_treasure_hunt' ? icon(I.star) : null, t.label),
      h('span', { class: 'v' }, h('span', { text: name }), h('span', { class: 'num', text: v ? gbp(v) : '?' }))));
  }
};
const openSweepCard = (card) => {
  const c = sc.still;
  const padX = card.w * 0.06; const padY = card.h * 0.06;
  const crop = {
    x: Math.max(0, (card.x - padX) * c.width), y: Math.max(0, (card.y - padY) * c.height),
    w: Math.min(c.width, (card.w + padX * 2) * c.width), h: Math.min(c.height, (card.h + padY * 2) * c.height),
  };
  crop.w = Math.min(crop.w, c.width - crop.x); crop.h = Math.min(crop.h, c.height - crop.y);
  const row = card.catalogId ? byId.get(card.catalogId) : null;
  pending = {
    result: { found: true, type: card.type, name: (row && row.name) || card.name, match: row ? row.name : null, catalogId: card.catalogId, carded: true, colour: '', confidence: card.confidence, evidence: [], tip: '' },
    thumb: toCanvas(c, 420, crop).toDataURL('image/jpeg', 0.72),
    fromSweep: true,
  };
  location.hash = '#result';
};
const toggleTorch = async () => {
  if (!sc.track) return;
  sc.torch = !sc.torch;
  try { await sc.track.applyConstraints({ advanced: [{ torch: sc.torch }] }); $('#torch').setAttribute('aria-pressed', String(sc.torch)); }
  catch { sc.torch = false; toast('Torch not available'); }
};

/* ---------- RESULT ---------- */
let pending = null;
const renderResult = () => {
  const root = $('#v-result');
  if (!pending) { location.replace('#scan'); return; }
  const { result: r, thumb } = pending;
  const type = TYPE[r.type] ? r.type : 'unknown';
  const t = T(type);
  const row = (r.catalogId && byId.get(r.catalogId)) || (r.match ? findRow(r.match, type) : null);
  const v = valueFor(row, type);
  const name = (row && row.name) || String(r.name || '') || 'Unknown car';
  const paint = (row && row.paint) || r.colour || '';
  let cond = r.carded === false ? 'loose' : 'carded';
  const meta = [row && row.case ? 'Case ' + row.case : null, paint ? paint[0].toUpperCase() + paint.slice(1) : null, cond === 'loose' ? 'Loose' : 'In pack', row && row.col ? '#' + pad3(row.col) + ' ' + row.series : r.collector_number || null].filter(Boolean).join(' · ');
  const condSeg = h('div', { class: 'seg sm', role: 'group', 'aria-label': 'Condition' });
  const drawCond = () => condSeg.replaceChildren(...[['carded', 'In pack'], ['loose', 'Loose']].map(([k, l]) => h('button', { type: 'button', 'aria-pressed': String(cond === k), onclick: () => { cond = k; drawCond(); }, text: l })));
  drawCond();
  const paid = h('input', { class: 'input', id: 'paid', inputmode: 'decimal', placeholder: String(CAT.shelf) });
  const add = h('button', { class: 'btn go', type: 'button' }, icon(I.plus), 'Add to album');
  add.addEventListener('click', async () => {
    add.disabled = true;
    const it = {
      id: newId(), catalogId: row ? row.id : null, name, type, match: row ? row.name : null, value: v.value, est: v.est,
      caseLetter: row ? row.case || null : null, colour: paint, condition: cond,
      paid: paid.value ? Number(String(paid.value).replace(/[^0-9.]/g, '')) || null : null,
      confidence: r.confidence || null, thumb, evidence: Array.isArray(r.evidence) ? r.evidence.slice(0, 4) : [], addedAt: new Date().toISOString(),
    };
    try { await store.add(it); await reload(); toast(name + ' added'); location.hash = '#album'; }
    catch { add.disabled = false; toast('Could not save. Try again.'); }
  });
  const conf = r.confidence ? h('span', { class: 'pill soft' }, h('span', { class: 'dot ' + (r.confidence === 'high' ? '' : r.confidence === 'medium' ? 'med' : 'low') }), r.confidence[0].toUpperCase() + r.confidence.slice(1) + ' confidence') : null;
  root.replaceChildren(
    topbar('#scan', 'Scan result', h('button', { class: 'round', type: 'button', 'aria-label': 'Share this find', onclick: () => shareCar(name, type, v.value) }, icon(I.share))),
    h('div', { class: 'stage', style: `height:340px;--glow:${t.glow};--ring:${t.edge}4d` },
      h('div', { class: 'shadow', style: 'bottom:30px;width:220px;height:28px;margin-left:-110px', 'aria-hidden': 'true' }),
      h('div', { class: 'ring', style: 'bottom:22px;width:280px;height:44px;margin-left:-140px', 'aria-hidden': 'true' }),
      h('div', { class: 'float' }, pack({ type, w: 196, h: 262, ry: -20, rx: 7, big: true, px: 9, shadow: `9px 0 0 ${t.side}, 0 44px 50px -26px rgba(0,0,0,.95)`, top: [row ? String(row.y) : (r.year || '—'), row && row.case ? 'CASE ' + row.case : row && row.col ? '#' + pad3(row.col) : ''], name, src: thumb, paint }))),
    h('div', { class: 'pad', style: 'padding-top:4px' },
      h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;align-items:center' }, typePill(type), conf, row && row.status === 'upcoming' ? h('span', { class: 'pill up', text: 'Upcoming 2027' }) : null),
      h('div', { class: 'stack', style: 'gap:6px' }, h('h1', { class: 'h1 md', text: name }), meta ? h('div', { class: 'meta', text: meta }) : null),
      h('div', { class: 'panel', style: 'overflow:hidden' },
        h('div', { class: 'stats3' }, stat(v.est ? 'Estimate' : 'Value now', v.value ? gbp(v.value) : 'n/a', 'big'), stat('6-mo avg', row && row.avg ? gbp(row.avg) : '–'), stat('Change', row && row.now ? pct(row.chg) : '–', row ? chgCls(row.chg) : '')),
        multiStrip(v.value, type)),
      Array.isArray(r.evidence) && r.evidence.length ? h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'label', text: 'What the scan saw' }), h('div', { class: 'chips' }, r.evidence.slice(0, 4).map((e) => h('span', { class: 'chip', text: String(e) })))) : null,
      r.tip ? h('p', { class: 'meta', style: 'margin:0', text: String(r.tip) }) : null,
      h('div', { class: 'row2' }, h('div', { class: 'field' }, h('span', { text: 'Condition' }), condSeg), h('div', { class: 'field' }, h('label', { for: 'paid', text: 'You paid (£)' }), paid)),
      h('div', { class: 'stack' }, add, h('a', { class: 'btn ghost', href: '#scan', text: pending.fromSweep ? 'Back to the wall' : 'Keep scanning' }),
        h('a', { class: 'link', href: '#db?q=' + encodeURIComponent(name === 'Unknown car' ? '' : name), style: 'align-self:center' }, 'Wrong car? Find it in Prices', icon(I.chev))),
      h('p', { class: 'foot', text: v.basis + '. Values are mostly US eBay sold prices over 6 months, in pounds.' })));
};

/* ---------- ALBUM ---------- */
let afilter = 'all';
const renderAlbum = () => {
  const root = $('#v-album');
  const list = ranked();
  const counts = { all: items.length, S: 0, T: 0, O: 0 };
  for (const it of items) counts[T(it.type).group]++;
  const top = list.filter((it) => itemValue(it) > 0).slice(0, 3);
  const tilt = 18;
  let show;
  if (top.length) {
    const order = top.length === 3 ? [top[1], top[0], top[2]] : top;
    show = order.map((it) => {
      const rank = top.indexOf(it) + 1; const center = rank === 1;
      const ry = center || top.length < 3 ? 0 : (order.indexOf(it) === 0 ? tilt : -tilt);
      const row = rowFor(it);
      return h('a', { class: 'spot', href: '#car/' + it.id, 'aria-label': it.name + ', ' + gbp(itemValue(it)) },
        h('span', { class: 'rank', text: '#' + rank }),
        pack({ type: it.type, w: center ? 124 : 100, h: center ? 166 : 134, ry, rx: 4, z: center ? 24 : 0, name: row ? row.name : it.name, fs: center ? 15 : 13, src: it.thumb || row?.img, paint: it.colour }),
        h('div', { class: 'pool', 'aria-hidden': 'true' }), h('span', { class: 'price num', text: gbp(itemValue(it)) }));
    });
  }
  const own = owned();
  const sets = hunts2026();
  const sthAll = sets.filter((c) => c.type === 'super_treasure_hunt'); const thAll = sets.filter((c) => c.type === 'treasure_hunt');
  const sthHave = sthAll.filter((c) => own.has(c.id)).length; const thHave = thAll.filter((c) => own.has(c.id)).length;
  const next = [...sthAll, ...thAll].filter((c) => !own.has(c.id)).sort((a, b) => (b.now || 0) - (a.now || 0))[0];
  const bar = (label, have, all, c) => h('div', { class: 'bar' }, h('div', {}, h('span', { text: label }), h('span', { class: 'num', style: 'color:' + c, text: have + ' / ' + all })),
    h('div', { class: 'track' }, h('i', { style: `width:${all ? (have / all) * 100 : 0}%;--c:${c}` })));
  const fdefs = [['all', 'All'], ['S', 'Supers'], ['T', 'Treasure Hunts'], ['O', 'Others']].filter(([k]) => k !== 'O' || counts.O);
  const shown = list.filter((it) => afilter === 'all' || T(it.type).group === afilter);
  const card = (it, i) => {
    const t = T(it.type); const row = rowFor(it);
    const ry = (i % 2 === 0 ? 1 : -1) * Math.round(tilt * 0.5);
    return h('a', { class: 'gcard', href: '#car/' + it.id },
      h('div', { class: 'holder' }, pack({ type: it.type, w: 120, h: 160, ry, rx: 5, src: it.thumb || row?.img, paint: it.colour, bottom: [row ? String(row.y) : '', it.caseLetter ? 'CASE ' + it.caseLetter : row && row.col ? '#' + pad3(row.col) : ''] })),
      h('div', { class: 'name', text: it.name }),
      h('div', { class: 'bottom' }, h('span', { class: 'disp num' }, itemValue(it) ? gbp(itemValue(it)) : row && row.status === 'upcoming' ? 'TBC' : 'n/a', itemValue(it) && it.est && !(row && row.now) ? h('small', { text: 'est.' }) : null),
        h('span', { class: 'tag ' + t.cls, text: t.short })));
  };
  const summary = items.length ? [items.length + ' car' + (items.length === 1 ? '' : 's'), counts.S + ' Super' + (counts.S === 1 ? '' : 's'), counts.T + ' Treasure Hunt' + (counts.T === 1 ? '' : 's')].join(' · ') : 'Nothing here yet';
  const importIn = h('input', { type: 'file', accept: 'application/json,.json', onchange: importBackup });
  root.replaceChildren(
    brandbar(),
    h('div', { class: 'pad', style: 'padding-top:18px' },
      h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'eyebrow', text: 'Your collection' }), h('h1', { class: 'h1', text: 'Album' }), h('span', { class: 'meta', text: summary })),
      h('div', { class: 'show' }, h('div', { class: 'lamp', 'aria-hidden': 'true' }), h('div', { class: 'floor', 'aria-hidden': 'true' }), h('div', { class: 'gloss', 'aria-hidden': 'true' }),
        h('div', { class: 'head' }, h('span', { text: 'Showcase · Top ' + (top.length || 3) }), h('span', { text: top.length ? 'Tap a car' : '' })),
        top.length ? h('div', { class: 'row' }, show) : h('div', { class: 'empty' }, h('span', { class: 'h2', style: 'color:var(--fg)', text: 'Your best three go here' }), h('span', { text: 'Scan a car in a shop or add one from Prices.' }), h('a', { class: 'btn go', href: '#scan', style: 'min-height:48px;padding:0 22px', text: 'Scan a car' }))),
      h('div', { class: 'panel sets' },
        h('div', { class: 'top' }, h('span', { class: 'h2', text: '2026 sets' }), h('span', { text: (sthHave + thHave) + ' of ' + sets.length + ' found' })),
        bar('Super Treasure Hunts', sthHave, sthAll.length, '#F4BE3A'), bar('Treasure Hunts', thHave, thAll.length, '#C9CFD6'),
        next ? h('a', { class: 'link', href: '#db/' + next.id, style: 'align-self:flex-start' }, `Next to hunt: ${next.name}${next.case ? ', case ' + next.case : ''}`, icon(I.chev)) : h('span', { class: 'meta', text: 'Full set. Legend.' })),
      items.length ? h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter cars' }, fdefs.map(([k, l]) => h('button', { class: 'fchip', type: 'button', 'aria-pressed': String(afilter === k), onclick: () => { afilter = k; renderAlbum(); } }, l, h('span', { class: 'num', text: String(counts[k]) })))) : null,
      h('div', { class: 'grid' }, shown.length ? shown.map(card) : h('div', { class: 'empty-grid' }, h('span', { text: items.length ? 'No cars in this group yet.' : 'Cars you add show up here, best first.' }))),
      h('div', { class: 'stack', style: 'gap:6px;margin-top:6px' },
        h('p', { class: 'foot', text: store.kind === 'device' ? 'Your album is saved on this device. Export a backup now and then, or to move it to another phone.' : 'This browser blocks saving, so your album only lasts until you close the page. Export a backup to keep it.' }),
        h('div', { class: 'backup' },
          h('button', { class: 'link', type: 'button', onclick: exportBackup, disabled: !items.length, text: 'Export backup' }),
          h('label', { class: 'link' }, 'Import backup', importIn),
          installPrompt ? h('button', { class: 'link', type: 'button', onclick: install, text: 'Install app' }) : null),
        h('p', { class: 'foot', text: 'Peg Hunter is a fan project, not linked to Mattel or Hot Wheels.' }))));
};
const exportBackup = () => {
  const blob = new Blob([JSON.stringify({ app: 'peghunter', version: 2, exportedAt: new Date().toISOString(), items }, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: 'peghunter-album-' + new Date().toISOString().slice(0, 10) + '.json' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
const importBackup = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const incoming = (Array.isArray(data) ? data : data.items || []).filter((x) => x && x.id && x.name);
    if (!incoming.length) throw new Error('empty');
    const known = new Set(items.map((x) => x.id));
    const fresh = incoming.filter((x) => !known.has(x.id));
    for (const it of fresh) await store.add(it);
    await reload(); render();
    toast(fresh.length ? fresh.length + ' car' + (fresh.length === 1 ? '' : 's') + ' imported' : 'Those cars are already in your album');
  } catch { toast('That file is not a Peg Hunter backup'); }
};

/* ---------- CAR DETAIL (album item or database row) ---------- */
const ANGLES = { front: ['Front', 0, 0, 0], tilt: ['Angle', -26, 8, 9], side: ['Side', -62, 4, 15] };
const renderCar = (kind, id) => {
  const root = $('#v-car');
  const it = kind === 'album' ? items.find((x) => x.id === id) : null;
  const row = kind === 'album' ? (it && rowFor(it)) : byId.get(id);
  if ((kind === 'album' && !it) || (kind === 'db' && !row)) { location.replace(kind === 'album' ? '#album' : '#db'); return; }
  const type = it ? it.type : row.type;
  const t = T(type);
  const name = it ? it.name : row.name;
  const v = it ? { value: itemValue(it), est: !(row && row.now) && it.est } : valueFor(row, type);
  const paint = (it && it.colour) || (row && row.paint) || '';
  const rank = it ? ranked().findIndex((x) => x.id === it.id) + 1 : 0;
  let angle = 'tilt';
  const card = pack({ type, w: 220, h: 294, big: true, cls: 'turn', top: [row ? String(row.y) : '', row && row.case ? 'CASE ' + row.case : row && row.col ? '#' + pad3(row.col) : ''], name, src: (it && it.thumb) || row?.img, paint, ry: -26, rx: 8, shadow: `9px 0 0 ${t.side}, 0 48px 50px -26px rgba(0,0,0,.95)` });
  card.querySelector('.nm').style.fontSize = '24px';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Turn the pack', style: 'width:100%' });
  const drawSeg = () => {
    const [, ry, rx, edge] = ANGLES[angle];
    card.style.transform = `rotateY(${ry}deg) rotateX(${rx}deg)`;
    card.style.boxShadow = `${edge}px 0 0 ${t.side}, 0 48px 50px -26px rgba(0,0,0,.95)`;
    seg.replaceChildren(...Object.entries(ANGLES).map(([k, [l]]) => h('button', { type: 'button', 'aria-pressed': String(angle === k), onclick: () => { angle = k; drawSeg(); }, text: l })));
  };
  drawSeg();
  const pills = [typePill(type)];
  if (it) pills.push(h('span', { class: 'pill soft', text: it.condition === 'loose' ? 'Loose' : 'In pack' }));
  if (row && row.status === 'upcoming') pills.push(h('span', { class: 'pill up', text: 'Upcoming ' + row.y }));
  if (row && row.new) pills.push(h('span', { class: 'pill soft', text: 'New casting' }));
  if (row && row.excl) pills.push(h('span', { class: 'pill soft', text: row.excl + ' only' }));
  const meta = [row && row.case ? 'Case ' + row.case : null, paint ? paint[0].toUpperCase() + paint.slice(1) : null, it ? 'Added ' + dateGB(it.addedAt) : row && row.col ? '#' + pad3(row.col) + ' · ' + row.series : null].filter(Boolean).join(' · ');
  let tiles;
  if (it) {
    const profit = it.paid && v.value ? v.value - it.paid : null;
    tiles = h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('span', { class: 'label', text: v.est ? 'Estimate' : 'Value now' }), h('span', { class: 'disp num', style: 'color:var(--accent)', text: v.value ? gbp(v.value) : 'n/a' })),
      h('div', { class: 'tile' }, h('span', { class: 'label', text: 'You paid' }), h('span', { class: 'disp num', text: it.paid ? gbp(it.paid) : '–' })),
      h('div', { class: 'tile' + (profit > 0 ? ' ok' : '') }, h('span', { class: 'label', text: 'Profit' }), h('span', { class: 'disp num ' + (profit < 0 ? 'down' : ''), text: profit === null ? '–' : (profit >= 0 ? '+' : '−') + gbp(Math.abs(profit)) })));
  } else {
    tiles = h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('span', { class: 'label', text: v.est ? 'Estimate' : 'Value now' }), h('span', { class: 'disp num', style: 'color:var(--accent)', text: v.value ? gbp(v.value) : 'TBC' })),
      h('div', { class: 'tile' }, h('span', { class: 'label', text: 'Shop price' }), h('span', { class: 'disp num', text: gbp(CAT.shelf) })),
      h('div', { class: 'tile' }, h('span', { class: 'label', text: 'Number' }), h('span', { class: 'disp num', text: row.col ? '#' + pad3(row.col) : 'TBC' })));
  }
  const market = row && row.now ? h('div', { class: 'panel market' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' }, h('span', { class: 'h2', text: 'Market' }), h('span', { class: 'meta', text: row.sales + ' sale' + (row.sales === 1 ? '' : 's') + ' · 6 months' })),
    h('div', { class: 'row2' }, h('div', { class: 'field' }, h('span', { text: '6-month average' }), h('b', { class: 'disp num', text: gbp(row.avg) })), h('div', { class: 'field' }, h('span', { text: 'Change' }), h('b', { class: 'disp num ' + chgCls(row.chg), text: pct(row.chg) }))),
    h('p', { class: 'foot', style: 'color:var(--muted)', text: 'Mostly US eBay sold prices, converted to pounds' + (row.thin ? '. Only a few sales so far, so treat this price with care.' : '. A loose car usually sells for less than one in its pack.') })) : null;
  const actions = it
    ? (() => {
      let armed = false;
      const del = h('button', { class: 'btn danger', type: 'button', text: 'Remove' });
      del.addEventListener('click', async () => {
        if (!armed) { armed = true; del.textContent = 'Tap again to remove'; return; }
        del.disabled = true;
        try { await store.remove(it.id); await reload(); toast('Removed'); location.hash = '#album'; } catch { del.disabled = false; toast('Could not remove. Try again.'); }
      });
      return h('div', { class: 'row2' }, h('button', { class: 'btn', type: 'button', onclick: () => shareCar(name, type, v.value), text: 'Share card' }), del);
    })()
    : (() => {
      const add = h('button', { class: 'btn go', type: 'button' }, icon(I.plus), 'Add to album');
      add.addEventListener('click', async () => {
        add.disabled = true;
        try { await store.add(itemFromRow(row)); await reload(); toast(row.name + ' added'); add.replaceChildren(icon(I.check), 'In your album'); } catch { add.disabled = false; toast('Could not save. Try again.'); }
      });
      return h('div', { class: 'stack' }, add, h('button', { class: 'btn', type: 'button', onclick: () => shareCar(name, type, v.value), text: 'Share' }));
    })();
  root.replaceChildren(
    topbar(it ? '#album' : '#db', it ? '#' + rank + ' in your album' : row.status === 'upcoming' ? 'Coming in ' + row.y : 'Prices', h('button', { class: 'round', type: 'button', 'aria-label': 'Share card', onclick: () => shareCar(name, type, v.value) }, icon(I.share))),
    h('div', { class: 'stage', style: `height:400px;perspective:1100px;--glow:${t.glow};--ring:${t.edge}66` },
      h('div', { class: 'plinth', style: 'bottom:18px;width:300px;height:64px;margin-left:-150px', 'aria-hidden': 'true' }),
      h('div', { class: 'ring', style: 'bottom:26px;width:250px;height:48px;margin-left:-125px;border-style:dashed', 'aria-hidden': 'true' }),
      h('div', { class: 'shadow', style: 'bottom:34px;width:200px;height:26px;margin-left:-100px', 'aria-hidden': 'true' }),
      h('div', { class: 'float', style: 'margin-bottom:30px' }, card)),
    h('div', { class: 'pad' },
      h('div', { class: 'stack', style: 'align-items:center;gap:8px' }, seg, h('span', { class: 'foot', text: 'Turn the pack to check the paint and tyres' })),
      h('div', { class: 'stack', style: 'gap:8px' }, h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' }, pills), h('h1', { class: 'h1 md', text: name }), meta ? h('div', { class: 'meta', text: meta }) : null),
      tiles, market, factsPanel(row), spotList(type),
      it && it.evidence && it.evidence.length ? h('div', { class: 'stack', style: 'gap:8px' }, h('span', { class: 'label', text: 'What the scan saw' }), h('div', { class: 'chips' }, it.evidence.map((e) => h('span', { class: 'chip', text: e })))) : null,
      actions,
      row && row.img && !(it && it.thumb) ? h('p', { class: 'foot', text: 'Photo: Hot Wheels Wiki, CC BY-SA.' }) : null));
};

/* ---------- DATABASE / PRICES ---------- */
const db = { year: 2026, f: 'hunts', q: '', limit: 60 };
const renderDb = () => {
  const root = $('#v-db');
  const own = owned();
  const input = h('input', { class: 'input', type: 'search', placeholder: 'Search a car, series, case or number', 'aria-label': 'Search', value: db.q });
  const listBox = h('div', { class: 'list' });
  const more = h('button', { class: 'btn', type: 'button', text: 'Show more' });
  const yearSeg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Year' });
  const chipBox = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter' });
  const pool = () => CAT.cars.filter((c) => c.y === db.year);
  const FILTERS = [['hunts', 'Hunts'], ['S', 'Supers'], ['T', 'Treasure Hunts'], ['new', 'New castings'], ['all', 'All']];
  const match = (c) => {
    if (db.f === 'hunts' && !isHunt(c)) return false;
    if (db.f === 'S' && c.type !== 'super_treasure_hunt') return false;
    if (db.f === 'T' && c.type !== 'treasure_hunt') return false;
    if (db.f === 'new' && !c.new) return false;
    if (!db.q) return true;
    const hay = (c.name + ' ' + c.series + ' ' + (c.case ? 'case ' + c.case : '') + ' ' + (c.col ? '#' + c.col + ' ' + pad3(c.col) : '') + ' ' + (c.paint || '') + ' ' + (c.excl || '') + ' ' + c.id).toLowerCase();
    return db.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
  };
  const lrow = (c) => {
    const t = T(c.type); const v = valueFor(c, c.type);
    const tags = [isHunt(c) ? h('span', { class: 'tag ' + t.cls, text: t.short }) : null, c.new ? h('span', { class: 'tag new', text: 'New' }) : null, c.excl ? h('span', { class: 'tag', text: c.excl }) : null, own.has(c.id) ? h('span', { class: 'own', text: 'Owned' }) : null].filter(Boolean);
    return h('a', { class: 'lrow', href: '#db/' + c.id },
      h('div', { class: 'thumb', style: '--edge:' + (isHunt(c) ? t.edge : 'var(--line)') }, picture(c.img, c.type, c.paint)),
      h('div', { class: 't' }, h('b', { text: c.name + (c.v > 1 ? ' (' + (c.variant || 'colour ' + c.v) + ')' : '') }),
        h('span', { text: [c.col ? '#' + pad3(c.col) : null, c.series + (c.sno ? ' ' + c.sno : ''), c.case ? 'Case ' + c.case : null].filter(Boolean).join(' · ') }),
        tags.length ? h('div', { class: 'tags' }, tags) : null),
      h('div', { class: 'p' }, h('span', { class: 'disp num', text: v.value ? gbp(v.value) : '–' }), h('small', { text: c.status === 'upcoming' ? 'not out yet' : v.est ? 'estimate' : pct(c.chg) })));
  };
  const draw = () => {
    yearSeg.replaceChildren(...[[2026, '2026'], [2027, '2027 · Upcoming']].map(([y, l]) => h('button', { type: 'button', 'aria-pressed': String(db.year === y), onclick: () => { db.year = y; db.limit = 60; draw(); }, text: l })));
    const base = pool();
    const count = (k) => base.filter((c) => (k === 'hunts' ? isHunt(c) : k === 'S' ? c.type === 'super_treasure_hunt' : k === 'T' ? c.type === 'treasure_hunt' : k === 'new' ? c.new : true)).length;
    chipBox.replaceChildren(...FILTERS.map(([k, l]) => h('button', { class: 'fchip', type: 'button', 'aria-pressed': String(db.f === k), onclick: () => { db.f = k; db.limit = 60; draw(); } }, l, h('span', { class: 'num', text: String(count(k)) }))));
    let rows = base.filter(match);
    rows = db.f === 'hunts' || db.f === 'S' || db.f === 'T' ? rows.sort((a, b) => (b.now || 0) - (a.now || 0) || (a.col || 999) - (b.col || 999)) : rows.sort((a, b) => (a.col || 999) - (b.col || 999) || a.v - b.v);
    listBox.replaceChildren(...(rows.length ? rows.slice(0, db.limit).map(lrow) : [h('div', { class: 'notice', text: db.q ? 'No car matches "' + db.q + '". Try fewer words, or the other year.' : 'Nothing here yet.' })]));
    more.hidden = rows.length <= db.limit;
  };
  let qT;
  input.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { db.q = input.value.trim(); db.limit = 60; draw(); }, 120); });
  more.addEventListener('click', () => { db.limit += 120; draw(); });
  const total = CAT.cars.length;
  root.replaceChildren(
    brandbar(),
    h('div', { class: 'pad', style: 'padding-top:18px' },
      h('div', { class: 'stack', style: 'gap:4px' }, h('span', { class: 'eyebrow', text: 'Prices · saved ' + CAT.pricesSaved }), h('h1', { class: 'h1', text: 'Prices' }),
        h('span', { class: 'meta', text: total + ' cars: the 2026 range and what is coming in 2027' })),
      h('div', { class: 'search' }, icon(I.search), input), yearSeg, chipBox, listBox, more,
      h('p', { class: 'foot', text: 'Models and photos: Hot Wheels Wiki (CC BY-SA), updated ' + dateGB(CAT.updated) + '. Hunt prices: mostly US eBay sold listings, converted to pounds. 2027 lists grow as Mattel reveals cases.' })));
  draw();
};

/* ---------- router ---------- */
const VIEWS = ['scan', 'result', 'album', 'car', 'db'];
const scrollMemo = {};
let current = '';
const parse = () => {
  const raw = location.hash.slice(1) || 'scan';
  const [path, query] = raw.split('?');
  const [v, arg] = path.split('/');
  return { v, arg, q: new URLSearchParams(query || '') };
};
const render = () => {
  const { v, arg, q } = parse();
  const key = location.hash;
  if (current && current !== key) scrollMemo[current] = window.scrollY;
  let view = v;
  if (v === 'db' && arg) view = 'car';
  if (!VIEWS.includes(view)) { location.replace('#scan'); return; }
  for (const k of VIEWS) $('#v-' + k).hidden = k !== view;
  $('#tabs').hidden = !(view === 'album' || view === 'db');
  document.querySelectorAll('.tab').forEach((t) => (t.dataset.v === view ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  document.body.style.overflow = view === 'scan' ? 'hidden' : '';
  if (view === 'scan') enterScan(); else leaveScan();
  if (view === 'result') renderResult();
  if (view === 'album') renderAlbum();
  if (view === 'db') { if (q.has('q')) db.q = q.get('q'); if (q.has('q')) db.f = 'all'; renderDb(); }
  if (view === 'car') renderCar(v === 'db' ? 'db' : 'album', arg);
  window.scrollTo(0, view === 'album' || view === 'db' ? scrollMemo[key] || 0 : 0);
  current = key;
};

/* ---------- PWA ---------- */
let installPrompt = null;
const install = async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice.catch(() => {}); installPrompt = null; render(); };
const initPWA = () => {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e; if (parse().v === 'album') renderAlbum(); });
  const net = () => { $('#offline').hidden = navigator.onLine; };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
};

/* ---------- boot ---------- */
document.querySelectorAll('#modes [data-mode]').forEach((b) => b.addEventListener('click', () => { if (!b.disabled) setMode(b.dataset.mode); }));
$('#shutter').addEventListener('click', capture);
$('#in-gallery').addEventListener('change', onPick);
$('#torch').addEventListener('click', toggleTorch);
window.addEventListener('resize', () => { if (sc.state === 'results') layoutBoxes(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && sc.stream) leaveScan(); else if (!document.hidden && parse().v === 'scan' && sc.state !== 'results' && !sc.stream) enterScan(); });

initPWA();
(async () => {
  const [cat, opened] = await Promise.allSettled([loadCatalog(), openStore(), initAI()]);
  if (cat.status === 'rejected') toast('Price list could not load. Check your connection.');
  store = opened.value;
  await reload();
  setMode(mode);
  window.addEventListener('hashchange', render);
  if (!location.hash) location.replace(items.length ? '#album' : '#scan');
  render();
})();
