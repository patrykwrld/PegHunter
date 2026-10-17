import { openStore } from './store.js';

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
const gbp = (v) => '£' + Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => (v === null || v === undefined ? 'n/a' : (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1) + '%');
const TYPE = {
  super_treasure_hunt: { label: 'Super Treasure Hunt', cls: 'sth', group: 'sth' },
  treasure_hunt: { label: 'Treasure Hunt', cls: 'th', group: 'th' },
  mainline: { label: 'Normal car', cls: '', group: 'other' },
  premium: { label: 'Premium', cls: '', group: 'other' },
  other: { label: 'Other', cls: '', group: 'other' },
  unknown: { label: 'Not sure', cls: '', group: 'other' },
};
const carIcon = () => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 64 32'); s.setAttribute('class', 'ph-car'); s.setAttribute('aria-hidden', 'true');
  s.innerHTML = '<path d="M4 22h56M9 22l6-9h22l10 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="17" cy="24" r="4" fill="currentColor"/><circle cx="47" cy="24" r="4" fill="currentColor"/>';
  return s;
};

let toastT;
const toast = (msg) => { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600); };

let DATA = { cars: [], superAvg: 0, thAvg: 0, shelf: 0, saved: '' };
let byName = new Map();
let items = [];
let store = null;

/* ---------- value logic ---------- */
const valueFor = (type, match) => {
  const row = match ? byName.get(String(match).toLowerCase()) : null;
  if (row) return { row, value: row.now, est: false, basis: 'Value now for this exact car' };
  if (type === 'super_treasure_hunt') return { row: null, value: DATA.superAvg, est: true, basis: 'Not in the 2026 list: average for a 2026 Super' };
  if (type === 'treasure_hunt') return { row: null, value: DATA.thAvg, est: true, basis: 'Not in the 2026 list: average for a 2026 Treasure Hunt' };
  if (type === 'mainline') return { row: null, value: DATA.shelf, est: true, basis: 'Normal cars sell for about the shop price' };
  return { row: null, value: null, est: true, basis: 'No price data for this kind of car' };
};

/* ---------- album store ---------- */
const reload = async () => { items = await store.list(); renderAlbum(); };
const addItem = async (it) => { await store.add(it); await reload(); };
const renderStoreNote = () => {
  $('#store-note').textContent = store.kind === 'device'
    ? 'Your album is saved on this device. Export a backup now and then, or to move it to another phone.'
    : 'This browser blocks saving, so your album only lasts until you close the page. Export a backup to keep it.';
};
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- backup ---------- */
const exportBackup = () => {
  const blob = new Blob([JSON.stringify({ app: 'peghunter', version: 1, exportedAt: new Date().toISOString(), items }, null, 1)], { type: 'application/json' });
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
    await reload();
    toast(fresh.length ? fresh.length + ' car' + (fresh.length === 1 ? '' : 's') + ' imported' : 'Those cars are already in your album');
  } catch {
    toast('That file is not a Peg Hunter backup');
  }
};

/* ---------- images ---------- */
const loadImage = (file) => new Promise((res, rej) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => res({ img, url });
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
  img.src = url;
});
const toCanvas = (img, max) => {
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
};

/* ---------- AI scan (server: /api/scan) ---------- */
let scanOk = false;
const initAI = async () => {
  try {
    const r = await fetch('/api/scan', { headers: { accept: 'application/json' } });
    scanOk = r.ok && (await r.json()).enabled === true;
  } catch { scanOk = false; }
  const n = $('#ai-notice');
  n.hidden = scanOk;
  if (!scanOk) n.replaceChildren(h('b', { text: 'AI scanning is not available right now. ' }), 'You can still pick a car from the Prices tab and add it to your album.');
};

class ScanError extends Error { constructor(code) { super(code); this.code = code; } }
const scan = async (dataUrl, signal) => {
  let r;
  try {
    r = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl }), signal });
  } catch (err) {
    throw new ScanError(err && err.name === 'AbortError' ? 'cancelled' : 'network');
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new ScanError(body.error || 'server');
  return body.result;
};
const SCAN_MSG = {
  disabled: 'AI scanning is switched off. You can still add cars from the Prices tab.',
  rate_limited: 'Too many scans in a short time. Wait a minute and try again.',
  image_rejected: 'This photo could not be used. Try another photo.',
  too_large: 'This photo is too big. Try a smaller photo.',
  refused: 'The scanner could not check this photo. Try another photo.',
  invalid_json: 'The answer could not be read. Take the photo again.',
};

let busy = null;
const onPick = async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let loaded;
  try { loaded = await loadImage(file); } catch { showError('This photo could not be opened. Try a JPEG or PNG photo.'); return; }
  const { img, url } = loaded;
  const finder = $('#finder');
  finder.querySelectorAll('img,.beam,.status').forEach((n) => { if (n.tagName === 'IMG') URL.revokeObjectURL(n.src); n.remove(); });
  $('#finder-empty').hidden = true;
  finder.append(h('img', { src: url, alt: 'Your photo' }));
  const thumb = toCanvas(img, 420).toDataURL('image/jpeg', 0.72);
  const big = toCanvas(img, 1280).toDataURL('image/jpeg', 0.85);
  $('#result').replaceChildren();
  if (!scanOk) { renderResult({ found: true, type: 'unknown', name: '', match: null, confidence: 'low', evidence: [], tip: 'AI scanning is off here. Find the car in the Prices tab instead.' }, thumb); return; }
  const beam = h('div', { class: 'beam' });
  const status = h('div', { class: 'status', text: 'Checking the car…' });
  finder.append(beam, status);
  busy?.abort();
  const ctl = new AbortController(); busy = ctl;
  try {
    const r = await scan(big, ctl.signal);
    if (busy !== ctl) return;
    renderResult(r && typeof r === 'object' ? r : {}, thumb);
  } catch (err) {
    if (err && err.code === 'cancelled') return;
    showError(SCAN_MSG[err && err.code] || 'The scan did not finish. Check your connection and try again.');
  } finally {
    beam.remove(); status.remove();
  }
};
const showError = (msg) => $('#result').replaceChildren(h('div', { class: 'notice' }, h('b', { text: 'Scan failed. ' }), msg));

const renderResult = (r, thumb) => {
  if (r.found === false) { showError('No die-cast car found in this photo. Fill the frame with the car and its card.'); return; }
  const type = TYPE[r.type] ? r.type : 'unknown';
  const t = TYPE[type];
  const v = valueFor(type, r.match);
  const name = (v.row && v.row.car) || String(r.name || '') || 'Unknown car';
  const meta = [v.row ? 'Case ' + v.row.cs : null, r.colour, r.collector_number, r.series, r.carded === false ? 'Loose' : r.carded ? 'In pack' : null, r.confidence ? r.confidence + ' confidence' : null].filter(Boolean).join(' · ');
  const nameIn = h('input', { id: 'f-name', value: name });
  const cond = h('select', { id: 'f-cond' }, h('option', { value: 'carded', text: 'In pack' }), h('option', { value: 'loose', text: 'Loose' }));
  if (r.carded === false) cond.value = 'loose';
  const paid = h('input', { id: 'f-paid', inputmode: 'decimal', placeholder: 'e.g. 1.35' });
  const saveBtn = h('button', { class: 'btn primary', type: 'button', text: 'Add to album' });
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const it = {
      id: newId(), name: nameIn.value.trim() || name, type, match: v.row ? v.row.car : null,
      value: v.value, est: v.est, caseLetter: v.row ? v.row.cs : null, colour: r.colour || (v.row ? v.row.spot : ''),
      condition: cond.value, paid: paid.value ? Number(String(paid.value).replace(/[^0-9.]/g, '')) || null : null,
      confidence: r.confidence || null, thumb, addedAt: new Date().toISOString(),
    };
    try { await addItem(it); toast('Added to your album'); saveBtn.textContent = 'Added'; }
    catch { saveBtn.disabled = false; toast('Could not save. Try again.'); }
  });
  const price = h('div', { class: 'price' },
    h('div', { class: 'big' }, h('small', { text: v.est ? 'Estimate' : 'Value now' }), h('b', { class: 'num', text: v.value === null ? 'n/a' : gbp(v.value) })),
    h('div', {}, h('small', { text: '6-mo avg' }), h('b', { class: 'num', text: v.row ? gbp(v.row.avg) : '–' })),
    h('div', {}, h('small', { text: 'Change' }), h('b', { class: 'num ' + (v.row && v.row.chg < 0 ? 'down' : v.row && v.row.chg > 0 ? 'up' : ''), text: v.row ? pct(v.row.chg) : '–' })),
  );
  $('#result').replaceChildren(h('article', { class: 'result' },
    h('div', { class: 'result-top' },
      h('span', { class: 'badge ' + t.cls, text: t.label }),
      h('div', { class: 'r-name', text: name }),
      meta ? h('div', { class: 'r-meta', text: meta }) : null),
    Array.isArray(r.evidence) && r.evidence.length ? h('div', { class: 'evidence' }, r.evidence.slice(0, 4).map((x) => h('span', { class: 'chip', text: String(x) }))) : null,
    price,
    h('p', { class: 'tipline', text: v.basis + '.' + (r.tip ? ' ' + String(r.tip) : '') }),
    h('div', { class: 'save' },
      h('div', { class: 'field full' }, h('label', { for: 'f-name', text: 'Name' }), nameIn),
      h('div', { class: 'field' }, h('label', { for: 'f-cond', text: 'Condition' }), cond),
      h('div', { class: 'field' }, h('label', { for: 'f-paid', text: 'You paid (£)' }), paid),
      saveBtn),
  ));
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ---------- album render ---------- */
let filter = 'all';
let EXAMPLES = [];
const photo = (it) => (it.thumb ? h('img', { src: it.thumb, alt: '' }) : carIcon());
const worth = () => items.reduce((s, it) => s + (Number(it.value) || 0), 0);

const renderAlbum = () => {
  const total = worth();
  $('#hdr-worth').textContent = gbp(total);
  $('#st-worth').textContent = gbp(total);
  $('#st-count').textContent = items.length;
  $('#st-sth').textContent = items.filter((i) => i.type === 'super_treasure_hunt').length;
  $('#btn-export').disabled = !items.length;

  const top = [...items].filter((i) => i.value).sort((a, b) => b.value - a.value).slice(0, 3);
  const sc = $('#showcase');
  if (top.length) {
    const order = top.length === 3 ? [top[1], top[0], top[2]] : top;
    sc.replaceChildren(h('div', { class: 'shelf' },
      h('div', { class: 'eyebrow', style: 'margin-bottom:10px', text: 'Showcase · top ' + top.length }),
      h('div', { class: 'shelf-row' }, order.map((it) => h('button', { class: 'plinth', type: 'button', style: 'border:0;background:none;padding:0', onclick: () => openSheet(it) },
        h('span', { class: 'rank', text: '#' + (top.indexOf(it) + 1) }),
        h('div', { class: 'ph' }, photo(it)),
        h('b', { class: 'num', text: gbp(it.value) }),
        h('small', { text: it.name }))))));
  } else sc.replaceChildren();

  const list = items.filter((i) => filter === 'all' || (TYPE[i.type] || TYPE.unknown).group === filter)
    .sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  const grid = $('#album-grid');
  const card = (it) => {
    const t = TYPE[it.type] || TYPE.unknown;
    return h('button', { class: 'card' + (it.example ? ' example' : ''), type: 'button', onclick: it.example ? () => switchView('scan') : () => openSheet(it) },
      h('div', { class: 'ph' }, photo(it), h('span', { class: 'badge ' + (it.example ? 'example' : t.cls), text: it.example ? 'Example' : t.label })),
      h('div', { class: 'body' }, h('div', { class: 'name', text: it.name }),
        h('div', { class: 'val num' }, it.value ? gbp(it.value) : 'n/a', it.est ? h('small', { text: 'est.' }) : null)));
  };
  if (!items.length) {
    grid.replaceChildren(
      h('div', { class: 'empty', style: 'grid-column:1/-1' },
        h('h2', { text: 'No cars yet' }),
        h('p', { text: 'Scan your first car, or add one from the Prices tab. These examples show how your cars will look.' }),
        h('button', { class: 'btn primary', type: 'button', onclick: () => switchView('scan'), text: 'Scan a car' })),
      ...EXAMPLES.map(card));
  } else if (!list.length) {
    grid.replaceChildren(h('div', { class: 'empty', style: 'grid-column:1/-1' }, h('p', { text: 'No cars in this group yet.' })));
  } else grid.replaceChildren(...list.map(card));
};

const openSheet = (it) => {
  const t = TYPE[it.type] || TYPE.unknown;
  const row = it.match ? byName.get(String(it.match).toLowerCase()) : null;
  const root = $('#sheet-root');
  const close = () => { root.replaceChildren(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  let armed = false;
  const del = h('button', { class: 'btn danger', type: 'button', text: 'Remove' });
  del.addEventListener('click', async () => {
    if (!armed) { armed = true; del.textContent = 'Tap again to remove'; return; }
    del.disabled = true;
    try { await store.remove(it.id); await reload(); close(); toast('Removed'); }
    catch { del.disabled = false; toast('Could not remove. Try again.'); }
  });
  const profit = it.paid && it.value ? it.value - it.paid : null;
  const closeBtn = h('button', { class: 'btn', type: 'button', onclick: close, text: 'Close' });
  const scrim = h('div', { class: 'sheet-scrim', onclick: (e) => { if (e.target === scrim) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': it.name },
      h('div', { class: 'big-ph' }, photo(it)),
      h('span', { class: 'badge ' + t.cls, text: t.label }),
      h('div', { class: 'r-name', text: it.name }),
      h('div', { class: 'r-meta', text: [it.caseLetter ? 'Case ' + it.caseLetter : null, it.colour, it.condition === 'loose' ? 'Loose' : 'In pack', it.addedAt ? 'Added ' + new Date(it.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null].filter(Boolean).join(' · ') }),
      h('div', { class: 'kv' },
        h('div', {}, h('small', { text: it.est ? 'Estimate' : 'Value now' }), h('b', { class: 'num', text: it.value ? gbp(it.value) : 'n/a' })),
        h('div', {}, h('small', { text: 'You paid' }), h('b', { class: 'num', text: it.paid ? gbp(it.paid) : '–' })),
        h('div', {}, h('small', { text: 'Profit' }), h('b', { class: 'num ' + (profit > 0 ? 'up' : profit < 0 ? 'down' : ''), text: profit === null ? '–' : (profit >= 0 ? '+' : '-') + gbp(Math.abs(profit)) }))),
      row ? h('p', { class: 'note', style: 'margin:0', text: '6-month average ' + gbp(row.avg) + ', change ' + pct(row.chg) + ', from ' + row.sales + ' sales.' + (it.condition === 'loose' ? ' Loose cars usually sell for less than carded ones.' : '') }) : null,
      h('div', { class: 'row2' }, del, closeBtn)));
  root.replaceChildren(scrim);
  closeBtn.focus();
};

/* ---------- prices ---------- */
let pfilter = 'all';
const renderPrices = () => {
  const q = $('#q').value.trim().toLowerCase();
  const rows = DATA.cars
    .filter((c) => pfilter === 'all' || c.t === pfilter)
    .filter((c) => !q || (c.car + ' ' + c.spot + ' case ' + c.cs).toLowerCase().includes(q))
    .sort((a, b) => b.now - a.now);
  $('#plist').replaceChildren(...(rows.length ? rows.map((c) => {
    const add = h('button', { class: 'mini', type: 'button', text: '+ Add' });
    add.addEventListener('click', async () => {
      add.disabled = true;
      try {
        await addItem({ id: newId(), name: c.car, type: c.t === 'S' ? 'super_treasure_hunt' : 'treasure_hunt', match: c.car, value: c.now, est: false, caseLetter: c.cs, colour: c.spot, condition: 'carded', paid: null, confidence: null, thumb: null, addedAt: new Date().toISOString() });
        toast(c.car + ' added'); add.textContent = 'Added';
      } catch { add.disabled = false; toast('Could not save. Try again.'); }
    });
    return h('div', { class: 'prow' + (c.low ? ' low' : '') },
      h('div', { class: 'pn', text: c.car }),
      h('div', { class: 'ps' }, h('span', { class: 'badge ' + (c.t === 'S' ? 'sth' : 'th'), style: 'font-size:10px;padding:2px 7px', text: c.t === 'S' ? 'Super' : 'TH' }), 'Case ' + c.cs + ' · ' + c.spot,
        h('span', { class: c.chg < 0 ? 'down' : c.chg > 0 ? 'up' : '', text: pct(c.chg) }), c.low ? '· only ' + c.sales + ' sale' + (c.sales === 1 ? '' : 's') : null),
      h('div', { class: 'pv' }, h('b', { class: 'num', text: gbp(c.now) }), add));
  }) : [h('p', { class: 'note', text: 'No car matches that search.' })]));
};

/* ---------- navigation (hash routes: #scan, #album, #prices) ---------- */
const views = { scan: '#v-scan', album: '#v-album', prices: '#v-prices' };
const switchView = (v) => {
  if (!views[v]) v = 'scan';
  for (const [k, sel] of Object.entries(views)) $(sel).hidden = k !== v;
  document.querySelectorAll('.tab').forEach((t) => (t.getAttribute('data-v') === v ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
  if (location.hash.slice(1) !== v) history.replaceState(null, '', '#' + v);
  window.scrollTo(0, 0);
};

/* ---------- PWA ---------- */
const initPWA = () => {
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  let deferred = null;
  const btn = $('#btn-install');
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; btn.hidden = false; });
  btn.addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; btn.hidden = true; });
  window.addEventListener('appinstalled', () => { btn.hidden = true; });
  const net = () => { $('#offline').hidden = navigator.onLine; };
  window.addEventListener('online', net); window.addEventListener('offline', net); net();
};

/* ---------- boot ---------- */
const loadPrices = async () => {
  const r = await fetch('/data/prices.json');
  if (!r.ok) throw new Error('prices');
  DATA = await r.json();
  byName = new Map(DATA.cars.map((c) => [c.car.toLowerCase(), c]));
  EXAMPLES = ['Ferrari F40 Competizione', "'70 Plymouth AAR Cuda", 'Nissan Skyline HT 2000GT-X'].map((n) => byName.get(n.toLowerCase())).filter(Boolean).map((c) => (
    { id: 'ex-' + c.car, name: c.car, type: c.t === 'S' ? 'super_treasure_hunt' : 'treasure_hunt', value: c.now, est: false, example: true }));
  $('#saved').textContent = DATA.saved;
};

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => switchView(t.dataset.v)));
document.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => {
  filter = b.dataset.f; document.querySelectorAll('[data-f]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderAlbum();
}));
document.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => {
  pfilter = b.dataset.p; document.querySelectorAll('[data-p]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderPrices();
}));
$('#q').addEventListener('input', renderPrices);
$('#in-camera').addEventListener('change', onPick);
$('#in-gallery').addEventListener('change', onPick);
$('#btn-export').addEventListener('click', exportBackup);
$('#in-import').addEventListener('change', importBackup);
window.addEventListener('hashchange', () => switchView(location.hash.slice(1)));

switchView(location.hash.slice(1) || 'scan');
initPWA();
initAI();
(async () => {
  const [prices, opened] = await Promise.allSettled([loadPrices(), openStore()]);
  if (prices.status === 'rejected') toast('Price list could not load. Check your connection.');
  store = opened.value;
  renderStoreNote();
  renderPrices();
  await reload();
})();
