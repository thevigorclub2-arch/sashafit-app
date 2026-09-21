/* SashaFit: Telegram Mini App. Один файл логіки, без збирання. */
(function () {
'use strict';

const CFG = window.SASHAFIT || {};
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const tg = window.Telegram && window.Telegram.WebApp;
const app = document.getElementById('app');
let sb = null;

/* ---------- утиліти ---------- */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isNaN(n) ? 0 : n; };
const r0 = v => Math.round(v);
const r1 = v => Math.round(v * 10) / 10;
const fmt = v => String(r1(Number(v))).replace('.', ',');
const sgn = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v));
const pad = n => String(n).padStart(2, '0');
const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseISO = s => { const p = String(s).slice(0, 10).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); };
const todayISO = () => iso(new Date());
const mondayISO = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const addDaysISO = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const addMonthsISO = (s, m) => { const d = parseISO(s); d.setMonth(d.getMonth() + m); return iso(d); };
const daysLeft = s => (s ? Math.round((parseISO(s) - parseISO(todayISO())) / 86400000) : null);
const fmtDate = s => parseISO(s).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
const fmtDateLong = s => parseISO(s).toLocaleDateString('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' });
const first = n => String(n || '').split(' ')[0];
const isUrl = u => /^https?:\/\//i.test(u || '');
const MEALS = [{ id: 'b', n: 'Сніданок' }, { id: 'l', n: 'Обід' }, { id: 's', n: 'Перекус' }, { id: 'd', n: 'Вечеря' }];
const GROUPS = ['Ноги', 'Сідниці', 'Спина', 'Груди', 'Плечі', 'Руки', 'Кор'];

async function one(p) { const r = await p; if (r && r.error) throw r.error; return r ? r.data : null; }
function errMsg(e) {
  if (e && e.code === '23503') return 'Вправа є в програмі. Спочатку прибери її звідти';
  if (e && e.code === '23505') return 'Такий запис уже існує';
  return 'Щось пішло не так. Спробуй ще раз';
}
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
function hap(kind) {
  try {
    if (!tg || !tg.HapticFeedback) return;
    if (kind === 'success') tg.HapticFeedback.notificationOccurred('success');
    else tg.HapticFeedback.impactOccurred('light');
  } catch (e) { /* ігноруємо */ }
}
async function run(fn, okMsg) {
  try { await fn(); if (okMsg) toast(okMsg); }
  catch (e) { console.error(e); toast(errMsg(e)); }
  render();
}

/* ---------- стан ---------- */
const S = {
  mode: 'loading', stage: '', role: null, uid: null, me: null, err: null,
  tab: 'today', ctab: 'overview',
  // клієнт
  intake: null, sessions: [], checkins: [], program: null, workouts: [], items: [], exMap: {}, lastPerf: {},
  log: {}, logFor: null, finished: false, pf: null, pfEdit: false, editCi: false,
  foodDate: todayISO(), entries: [], add: null, recents: [], offCache: {}, fd: null, weekEntries: [], sl: null, slPick: '', form: null, histOpen: {}, setLogs: {},
  // тренер
  overview: [], remLog: [], settings: null, clients: [], exercises: [], programs: [],
  detailId: null, dtab: 'checkin', d: null, nc: null, newClient: null, exf: null, exq: '', exgf: '', pb: null, ind: '', urlCache: {}
};
const newForm = () => ({ w: '', waist: '', hips: '', mood: 0, comment: '', photos: [null, null, null] });
S.form = newForm();

/* ---------- Telegram ---------- */
function applyTheme() {
  let dark = false;
  try { dark = tg && tg.colorScheme ? tg.colorScheme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* ігноруємо */ }
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
function initTelegram() {
  applyTheme();
  if (!tg) return;
  try {
    tg.ready(); tg.expand();
    if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
    if (tg.onEvent) tg.onEvent('themeChanged', applyTheme);
    if (tg.BackButton) tg.BackButton.onClick(goBack);
  } catch (e) { /* ігноруємо */ }
}
function syncBack() {
  if (!tg || !tg.BackButton) return;
  try { (S.role === 'coach' && (S.detailId || S.pb)) ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) { /* ігноруємо */ }
}
function goBack() {
  if (S.pb) S.pb = null; else if (S.detailId) { S.detailId = null; S.d = null; }
  render();
}

/* ---------- підписка ---------- */
function subInfo(c) {
  const d = daysLeft(c.sub_end);
  if (d == null) return { t: 'Підписку не задано', s: 'Без підписки', k: 'plain' };
  if (d < 0) return { t: 'Прострочено ' + (-d) + ' дн.', s: 'Прострочено', k: 'bad' };
  if (d === 0) return { t: 'Закінчується сьогодні', s: 'Скоро кінець', k: 'warn' };
  if (d <= 7) return { t: 'Закінчується за ' + d + ' дн.', s: 'Скоро кінець', k: 'warn' };
  return { t: 'Активна до ' + fmtDate(c.sub_end), s: 'Активна', k: 'good' };
}

/* ---------- графіки ---------- */
function chart(ws, w, h, label) {
  if (ws.length < 2) return '<p class="muted sm">Потрібно щонайменше два виміри, щоб побудувати графік.</p>';
  const pad2 = 26, min = Math.min.apply(null, ws) - 0.5, max = Math.max.apply(null, ws) + 0.5;
  const x = i => pad2 + i * (w - 2 * pad2) / (ws.length - 1);
  const y = v => h - pad2 - (v - min) / (max - min) * (h - 2 * pad2);
  const pts = ws.map((v, i) => [x(i), y(v)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const last = pts.length - 1;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(label)}">
    <line x1="${pad2}" y1="${h - pad2}" x2="${w - pad2}" y2="${h - pad2}" stroke="var(--line)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i === last ? 5 : 3.5}" fill="${i === last ? 'var(--accent)' : 'var(--surface)'}" stroke="var(--accent)" stroke-width="2"/>`).join('')}
    <text x="${pts[0][0].toFixed(1)}" y="${(pts[0][1] - 10).toFixed(1)}" font-size="12">${fmt(ws[0])}</text>
    <text x="${pts[last][0].toFixed(1)}" y="${(pts[last][1] - 10).toFixed(1)}" font-size="12" font-weight="600" text-anchor="end">${fmt(ws[last])}</text>
    <text x="${pad2}" y="${h - 6}" font-size="11">початок</text><text x="${w - pad2}" y="${h - 6}" font-size="11" text-anchor="end">зараз</text></svg>`;
}
function bars(vals, w, h, label) {
  const pad2 = 24, max = Math.max.apply(null, vals) || 1, bw = (w - 2 * pad2) / vals.length;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="${esc(label)}">
    <line x1="${pad2}" y1="${h - pad2}" x2="${w - pad2}" y2="${h - pad2}" stroke="var(--line)"/>
    ${vals.map((v, i) => { const bh = (h - 2 * pad2 - 14) * v / max, x = pad2 + i * bw + bw * 0.18;
      return `<rect x="${x.toFixed(1)}" y="${(h - pad2 - bh).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="var(--accent)" fill-opacity="${i === vals.length - 1 ? 1 : 0.4}"/>
      <text x="${(x + bw * 0.32).toFixed(1)}" y="${(h - pad2 - bh - 6).toFixed(1)}" font-size="11" text-anchor="middle">${r0(v)}</text>`; }).join('')}
    <text x="${pad2}" y="${h - 6}" font-size="11">раніше</text><text x="${w - pad2}" y="${h - 6}" font-size="11" text-anchor="end">останнє</text></svg>`;
}
function nutBars(t, N) {
  const row = (l, v, max, u) => `<div class="bar-row"><div class="bar-l"><span>${l}</span><span>${r0(v)} / ${max} ${u}</span></div><div class="bar"><i class="${v > max * 1.05 ? 'over' : ''}" style="width:${Math.min(100, max ? v / max * 100 : 0).toFixed(0)}%"></i></div></div>`;
  return row('Калорії', t.k, N.kcal, 'ккал') + row('Білки', t.p, N.p, 'г') + row('Жири', t.f, N.f, 'г') + row('Вуглеводи', t.c, N.c, 'г');
}
const normOf = c => ({ kcal: c.norm_kcal, p: c.norm_protein, f: c.norm_fat, c: c.norm_carbs });
function totalsOf(entries) {
  const t = { k: 0, p: 0, f: 0, c: 0 };
  entries.forEach(e => { t.k += Number(e.kcal); t.p += Number(e.protein); t.f += Number(e.fat); t.c += Number(e.carbs); });
  return t;
}
// Сила по вправах: найкращий підхід за кожне тренування
async function loadStrength(clientId, sessions) {
  const dates = {}; sessions.forEach(x => { dates[x.id] = x.performed_on; });
  if (!sessions.length) return { names: [], by: {} };
  const logs = await one(sb.from('set_logs').select('*').eq('client_id', clientId).limit(4000));
  const by = {};
  logs.forEach(l => {
    if (!l.done) return;
    const d = dates[l.session_id]; if (!d) return;
    const n = l.exercise_name; by[n] = by[n] || {};
    const kg = Number(l.weight_kg), rp = Number(l.reps), cur = by[n][d];
    if (!cur || kg > cur.kg || (kg === cur.kg && rp > cur.rp)) by[n][d] = { kg: kg, rp: rp };
  });
  const out = {};
  Object.keys(by).forEach(n => { out[n] = Object.keys(by[n]).sort().map(d => ({ d: d, kg: by[n][d].kg, rp: by[n][d].rp })); });
  const names = Object.keys(out).sort((a, b) => out[b].length - out[a].length || a.localeCompare(b));
  return { names: names, by: out };
}
function strengthBoxHTML(sl, pick) {
  if (!sl || !sl.names.length) return '<p class="muted sm">Поки немає виконаних підходів.</p>';
  const name = sl.by[pick] ? pick : sl.names[0], pts = sl.by[name];
  const useKg = pts.some(p => p.kg > 0);
  const vals = pts.map(p => (useKg ? p.kg : p.rp));
  const unit = useKg ? 'кг' : 'повторень';
  const sum = vals.length >= 2 ? `${fmt(vals[0])} → ${fmt(vals[vals.length - 1])} ${unit} (${sgn(vals[vals.length - 1] - vals[0])})` : 'Поки один запис: ' + fmt(vals[0]) + ' ' + unit;
  return `<div class="muted sm">Найкращий підхід за тренування, ${unit}</div>${chart(vals, 340, 150, 'Графік прогресу у вправі ' + name)}<div class="muted sm" style="margin-top:4px">${sum}</div>`;
}
// Харчування за 7 днів: калорії по днях відносно норми
function weekHTML(entries, N) {
  const days = []; for (let i = 6; i >= 0; i--) days.push(addDaysISO(todayISO(), -i));
  const by = {};
  entries.forEach(e => { const b = by[e.eaten_on] = by[e.eaten_on] || { k: 0, p: 0 }; b.k += Number(e.kcal); b.p += Number(e.protein); });
  const logged = days.filter(d => by[d]);
  if (!logged.length) return '<p class="muted sm">За останні 7 днів записів про їжу немає.</p>';
  const avgK = logged.reduce((x, d) => x + by[d].k, 0) / logged.length, avgP = logged.reduce((x, d) => x + by[d].p, 0) / logged.length;
  const inNorm = logged.filter(d => Math.abs(by[d].k - N.kcal) <= N.kcal * 0.1).length;
  const w = 340, h = 170, pad2 = 24, max = Math.max.apply(null, [N.kcal * 1.25].concat(days.map(d => (by[d] ? by[d].k : 0))));
  const bw = (w - 2 * pad2) / 7, yv = v => h - pad2 - (h - 2 * pad2 - 14) * v / max;
  const bars2 = days.map((d, i) => {
    const k = by[d] ? by[d].k : 0, x = pad2 + i * bw + bw * 0.18;
    const wd = parseISO(d).toLocaleDateString('uk-UA', { weekday: 'short' });
    const color = !k ? 'var(--line)' : k > N.kcal * 1.1 ? 'var(--bad)' : 'var(--accent)';
    const op = !k ? 0.6 : k < N.kcal * 0.9 ? 0.45 : 1;
    return (k ? `<rect x="${x.toFixed(1)}" y="${yv(k).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(h - pad2 - yv(k)).toFixed(1)}" rx="4" fill="${color}" fill-opacity="${op}"/><text x="${(x + bw * 0.32).toFixed(1)}" y="${(yv(k) - 5).toFixed(1)}" font-size="10" text-anchor="middle">${r0(k)}</text>` : '')
      + `<text x="${(x + bw * 0.32).toFixed(1)}" y="${h - 6}" font-size="11" text-anchor="middle">${wd}</text>`;
  }).join('');
  return `<div class="tiles"><div class="stat"><b>${r0(avgK)}</b><span>ккал у середньому</span></div><div class="stat"><b>${inNorm}/${logged.length}</b><span>днів у межах ±10% норми</span></div>
    <div class="stat"><b>${r0(avgP)}</b><span>білка, г у середньому</span></div><div class="stat"><b>${N.kcal}</b><span>норма, ккал</span></div></div>
    <svg viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Калорії за 7 днів" style="margin-top:10px"><line x1="${pad2}" y1="${h - pad2}" x2="${w - pad2}" y2="${h - pad2}" stroke="var(--line)"/>
    <line x1="${pad2}" y1="${yv(N.kcal).toFixed(1)}" x2="${w - pad2}" y2="${yv(N.kcal).toFixed(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${w - pad2}" y="${(yv(N.kcal) - 4).toFixed(1)}" font-size="10" text-anchor="end">норма</text>${bars2}</svg>
    <p class="muted sm">Дні без записів не враховуються в середньому.</p>`;
}
function analyticsHTML(checkins, sessions, ctx) {
  const ws = checkins.map(c => Number(c.weight_kg));
  const wa = checkins.filter(c => c.waist_cm != null).map(c => Number(c.waist_cm));
  const wh = checkins.filter(c => c.hips_cm != null && Number(c.hips_cm) > 0).map(c => Number(c.hips_cm));
  const cutoff = addDaysISO(todayISO(), -28);
  const last28 = sessions.filter(x => x.performed_on >= cutoff).length;
  const asc = sessions.slice().sort((a, b) => (a.performed_on < b.performed_on ? -1 : a.performed_on > b.performed_on ? 1 : 0));
  const vols = asc.slice(-6).map(x => Number(x.volume_kg));
  let trend = '—';
  if (asc.length >= 2) { const a = Number(asc[asc.length - 1].volume_kg), b = Number(asc[asc.length - 2].volume_kg); if (b > 0) { const p = Math.round((a - b) / b * 100); trend = (p >= 0 ? '+' : '−') + Math.abs(p) + '%'; } }
  const dw = ws.length >= 2 ? sgn(ws[ws.length - 1] - ws[0]) : '—';
  const dwa = wa.length >= 2 ? sgn(wa[wa.length - 1] - wa[0]) : '—';
  let strength = '', week = '';
  if (ctx && ctx.sl) {
    const pick = ctx.slPick && ctx.sl.by[ctx.slPick] ? ctx.slPick : ctx.sl.names[0];
    strength = `<div class="sec"><h3>Сила по вправах</h3>${ctx.sl.names.length ? `<select data-in="slpick" data-scope="${ctx.scope}" aria-label="Вправа">${ctx.sl.names.map(n => `<option value="${esc(n)}"${n === pick ? ' selected' : ''}>${esc(n)} (${ctx.sl.by[n].length})</option>`).join('')}</select>` : ''}<div id="slbox" style="margin-top:8px">${strengthBoxHTML(ctx.sl, pick)}</div></div>`;
  }
  if (ctx && ctx.week) week = `<div class="sec"><h3>Харчування за 7 днів</h3>${weekHTML(ctx.week, ctx.norm)}</div>`;
  return `<div class="tiles"><div class="stat"><b>${dw}</b><span>вага від початку, кг</span></div><div class="stat"><b>${dwa}</b><span>талія від початку, см</span></div>
    <div class="stat"><b>${last28}</b><span>тренувань за 4 тижні</span></div><div class="stat"><b>${trend}</b><span>обсяг до попереднього</span></div></div>
    <div class="sec"><h3>Вага, кг</h3>${chart(ws, 340, 160, 'Графік ваги')}</div>
    <div class="sec"><h3>Талія, см</h3>${chart(wa, 340, 160, 'Графік талії')}</div>
    ${wh.length >= 2 ? `<div class="sec"><h3>Стегна, см</h3>${chart(wh, 340, 160, 'Графік стегон')}</div>` : ''}
    ${strength}${week}
    <div class="sec"><h3>Обсяг тренувань, кг</h3>${vols.length ? bars(vols, 340, 160, 'Обсяг останніх тренувань') : '<p class="muted sm">Тренувань поки немає.</p>'}
    <p class="muted sm">Обсяг = вага × повторення за всі виконані підходи.</p></div>`;
}
function icon(n) {
  const P = {
    today: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>',
    food: '<path d="M6 3v8a3 3 0 0 0 3 3v7M9 3v6M12 3v8a3 3 0 0 1-3 3M18 3c-2 2-3 5-3 8h3v10"/>',
    check: '<rect x="5" y="4" width="14" height="17" rx="3"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
    prog: '<path d="M3 17l6-6 4 4 8-9M15 6h6v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    dumb: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    tick: '<path d="M5 12l5 5 9-10"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;
}

/* =====================================================================
   КЛІЄНТ: завантаження даних
   ===================================================================== */
async function refreshMe() {
  const me = await one(sb.from('clients').select('*').eq('id', S.me.id).maybeSingle());
  if (me) S.me = me;
}
async function loadProgram() {
  S.program = null; S.workouts = []; S.items = [];
  const exs = await one(sb.from('exercises').select('*'));
  S.exMap = {}; exs.forEach(e => { S.exMap[e.id] = e; });
  if (!S.me.program_id) return;
  S.program = await one(sb.from('programs').select('*').eq('id', S.me.program_id).maybeSingle());
  if (!S.program) return;
  S.workouts = await one(sb.from('program_workouts').select('*').eq('program_id', S.program.id).order('position'));
  const ids = S.workouts.map(w => w.id);
  S.items = ids.length ? await one(sb.from('workout_items').select('*').in('workout_id', ids).order('position')) : [];
}
async function loadSessions() {
  S.sessions = await one(sb.from('workout_sessions').select('*').eq('client_id', S.me.id).order('performed_on', { ascending: false }).order('created_at', { ascending: false }).limit(300));
}
async function loadCheckins() {
  S.checkins = await one(sb.from('checkins').select('*').eq('client_id', S.me.id).order('week_start', { ascending: true }));
}
async function loadEntries() {
  S.entries = await one(sb.from('food_entries').select('*').eq('client_id', S.me.id).eq('eaten_on', S.foodDate).order('created_at', { ascending: true }));
}
async function loadLastPerf() {
  S.lastPerf = {};
  const ids = Array.from(new Set(S.items.map(i => i.exercise_id)));
  if (!ids.length || !S.sessions.length) return;
  const logs = await one(sb.from('set_logs').select('*').eq('client_id', S.me.id).in('exercise_id', ids).limit(800));
  const order = {}; S.sessions.forEach((s, i) => { order[s.id] = i; });
  const latest = {};
  logs.forEach(l => { if (!l.done) return; const o = order[l.session_id]; if (o === undefined) return; if (latest[l.exercise_id] === undefined || o < latest[l.exercise_id]) latest[l.exercise_id] = o; });
  const best = {};
  logs.forEach(l => {
    if (!l.done || order[l.session_id] !== latest[l.exercise_id]) return;
    const kg = Number(l.weight_kg), rp = Number(l.reps), b = best[l.exercise_id];
    if (!b || kg > b.kg || (kg === b.kg && rp > b.rp)) best[l.exercise_id] = { kg: kg, rp: rp };
  });
  Object.keys(best).forEach(id => { const b = best[id]; S.lastPerf[id] = b.kg ? fmt(b.kg) + ' кг × ' + b.rp : b.rp + ' повт.'; });
}
async function loadProgressExtras() {
  S.weekEntries = await one(sb.from('food_entries').select('*').eq('client_id', S.me.id).gte('eaten_on', addDaysISO(todayISO(), -6)).order('eaten_on', { ascending: true }));
  S.sl = await loadStrength(S.me.id, S.sessions);
}
async function loadClientData() {
  const id = S.me.id;
  S.intake = await one(sb.from('intake').select('*').eq('client_id', id).maybeSingle());
  S.pf = pfFromIntake(S.intake);
  await Promise.all([loadSessions(), loadCheckins(), loadProgram(), loadEntries()]);
  await loadLastPerf();
}
async function refreshClient() { await refreshMe(); await loadProgram(); await loadSessions(); await loadLastPerf(); }

/* ---------- тренування: допоміжне ---------- */
function curWorkout() {
  if (!S.program || !S.workouts.length) return null;
  const ids = new Set(S.workouts.map(w => w.id));
  const done = S.sessions.filter(s => ids.has(s.workout_id)).length;
  return S.workouts[done % S.workouts.length];
}
const wkItems = w => S.items.filter(i => i.workout_id === w.id).sort((a, b) => a.position - b.position);
const exName = id => (S.exMap[id] ? S.exMap[id].name : 'Вправа');
const dk = w => 'sf_draft_' + S.me.id + '_' + w.id;
function loadDraft(w) { try { return JSON.parse(localStorage.getItem(dk(w)) || '{}'); } catch (e) { return {}; } }
function saveDraft(w) { try { localStorage.setItem(dk(w), JSON.stringify(S.log)); } catch (e) { /* ігноруємо */ } }
function syncLog(w) { if (S.logFor !== w.id) { S.log = loadDraft(w); S.logFor = w.id; } }
function getSet(k) {
  if (!S.log[k]) {
    const p = k.split(':'), w = curWorkout(), it = w ? wkItems(w)[+p[0]] : null;
    S.log[k] = { kg: it ? it.weight_kg : 0, reps: it ? it.reps : 0, done: false };
  }
  return S.log[k];
}
async function finishWorkout() {
  const w = curWorkout(); if (!w) return;
  const items = wkItems(w); let sets = 0, vol = 0; const rows = [];
  items.forEach((it, i) => {
    for (let s = 0; s < it.sets; s++) {
      const L = S.log[i + ':' + s];
      if (L && L.done) { const kg = num(L.kg), rp = num(L.reps); sets++; vol += kg * rp; rows.push({ exercise_id: it.exercise_id, exercise_name: exName(it.exercise_id), set_no: s + 1, weight_kg: kg, reps: rp, done: true }); }
    }
  });
  if (!sets) { toast('Відміть хоча б один підхід'); return; }
  const sess = await one(sb.from('workout_sessions').insert({ client_id: S.me.id, workout_id: w.id, title: S.program.name + ' · ' + w.name, performed_on: todayISO(), total_sets: sets, volume_kg: Math.round(vol) }).select().single());
  await one(sb.from('set_logs').insert(rows.map(r => Object.assign({ session_id: sess.id, client_id: S.me.id }, r))));
  try { localStorage.removeItem(dk(w)); } catch (e) { /* ігноруємо */ }
  S.log = {}; S.logFor = null; S.finished = true;
  await loadSessions(); await loadLastPerf();
  hap('success'); toast('Тренування збережено в щоденнику');
}

/* ---------- анкета ---------- */
function pfFromIntake(i) {
  i = i || {};
  return { goal: i.goal || '', experience: i.experience || '', days: i.days_per_week ? String(i.days_per_week) : '', place: i.place || '',
    age: i.age ? String(i.age) : '', height: i.height_cm ? String(i.height_cm) : '', target: i.target_weight_kg ? String(i.target_weight_kg) : '',
    injuries: i.injuries || '', diet: i.diet_notes || '' };
}
async function saveIntake() {
  const p = S.pf;
  if (!p.goal || !p.experience || !p.days || !p.place) { toast('Обери ціль, досвід, кількість тренувань і місце'); return; }
  const row = { client_id: S.me.id, goal: p.goal, experience: p.experience, days_per_week: parseInt(p.days, 10), place: p.place,
    age: p.age ? parseInt(p.age, 10) : null, height_cm: p.height ? num(p.height) : null, target_weight_kg: p.target ? num(p.target) : null,
    injuries: p.injuries.trim() || null, diet_notes: p.diet.trim() || null, completed_at: new Date().toISOString() };
  await one(sb.from('intake').upsert(row, { onConflict: 'client_id' }));
  S.intake = await one(sb.from('intake').select('*').eq('client_id', S.me.id).maybeSingle());
  S.pfEdit = false; hap('success'); toast('Анкету збережено');
}

/* ---------- харчування ---------- */
function newAdd(meal) { return { meal: meal, q: '', results: [], off: [], offBusy: false, offErr: '', food: null, grams: '', custom: false, cf: { n: '', k: '', p: '', f: '', c: '', g: '100' } }; }
let searchTimer;
async function searchFoods(q) {
  q = q.trim();
  if (q.length < 2) return [];
  const rows = await one(sb.from('foods').select('*').ilike('name', '%' + q + '%').limit(40));
  const lq = q.toLowerCase();
  const rank = f => { const n = f.name.toLowerCase(); return (n.indexOf(lq) === 0 ? 0 : n.split(/[\s,()]+/).some(w => w.indexOf(lq) === 0) ? 1 : 2) * 1000 + n.length; };
  return rows.sort((a, b) => rank(a) - rank(b)).slice(0, 10);
}
// Недавні продукти: беремо з щоденника і повертаємо значення на 100 г
async function loadRecents() {
  const rows = await one(sb.from('food_entries').select('*').eq('client_id', S.me.id).order('created_at', { ascending: false }).limit(150));
  const seen = {}, out = [];
  rows.forEach(e => {
    const k = String(e.food_name).toLowerCase(), g = Number(e.grams);
    if (seen[k] || !(g > 0)) return;
    seen[k] = 1;
    out.push({ id: 'recent:' + out.length, name: e.food_name, kcal_100: r1(Number(e.kcal) / g * 100), protein_100: r1(Number(e.protein) / g * 100), fat_100: r1(Number(e.fat) / g * 100), carbs_100: r1(Number(e.carbs) / g * 100), default_g: r0(g), source: 'recent' });
  });
  S.recents = out.slice(0, 8);
}
// Open Food Facts: безкоштовна відкрита база продуктів зі штрихкодами
const OFF_FIELDS = 'code,product_name,product_name_uk,brands,nutriments,serving_quantity';
function offToFood(p) {
  const n = p.nutriments || {};
  let kcal = n['energy-kcal_100g'];
  if ((kcal == null || isNaN(Number(kcal))) && n['energy_100g'] != null) kcal = Number(n['energy_100g']) / 4.184;
  if (kcal == null || isNaN(Number(kcal))) return null;
  const name = String(p.product_name_uk || p.product_name || '').trim();
  if (!name) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  return { id: 'off:' + p.code, name: brand ? name + ' (' + brand + ')' : name, kcal_100: r1(Number(kcal)), protein_100: r1(Number(n.proteins_100g || 0)), fat_100: r1(Number(n.fat_100g || 0)), carbs_100: r1(Number(n.carbohydrates_100g || 0)), default_g: r0(num(p.serving_quantity)) || 100, source: 'openfoodfacts', external_id: p.code };
}
async function offSearch(q) {
  const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q) + '&search_simple=1&action=process&json=1&page_size=12&fields=' + OFF_FIELDS;
  const r = await fetch(url);
  if (!r.ok) throw new Error('off ' + r.status);
  const j = await r.json();
  return (j.products || []).map(offToFood).filter(Boolean);
}
async function offBarcode(code) {
  const r = await fetch('https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(code) + '.json?fields=' + OFF_FIELDS);
  if (!r.ok) throw new Error('off ' + r.status);
  const j = await r.json();
  if (j.status !== 1 || !j.product) return [];
  const f = offToFood(Object.assign({ code: code }, j.product));
  return f ? [f] : [];
}
let offTimer, lastOff = 0;
// Запит до Open Food Facts: оновлює лише блок результатів, щоб не збивати введення тексту
function doOff(kind, auto) {
  const ad = S.add;
  if (!ad || ad.offBusy) return;
  const q = ad.q.trim(), key = kind + ':' + q;
  if (auto && Date.now() - lastOff < 4000 && !S.offCache[key]) return; // не частіше, ніж дозволяє сервіс
  ad.offBusy = true; ad.offErr = '';
  const paint = () => { const r = document.getElementById('results'); if (r) r.innerHTML = resultsHTML(); };
  paint();
  (async () => {
    try {
      let res = S.offCache[key];
      if (!res) { lastOff = Date.now(); res = kind === 'offbarcode' ? await offBarcode(q) : await offSearch(q); S.offCache[key] = res; }
      if (ad.q.trim() === q) { ad.off = res; if (!res.length) ad.offErr = 'В Open Food Facts нічого не знайдено.'; }
    } catch (err) { console.error(err); ad.offErr = 'Не вдалося звернутися до Open Food Facts. Спробуй пізніше або додай як «Свій продукт».'; }
    ad.offBusy = false; if (S.add === ad) paint();
  })();
}
const portion = (f, g) => ({ k: r1(Number(f.kcal_100) * g / 100), p: r1(Number(f.protein_100) * g / 100), f: r1(Number(f.fat_100) * g / 100), c: r1(Number(f.carbs_100) * g / 100) });
async function addEntry(meal, food, g) {
  const v = portion(food, g);
  await one(sb.from('food_entries').insert({ client_id: S.me.id, eaten_on: S.foodDate, meal: meal, food_name: food.name, grams: g, kcal: v.k, protein: v.p, fat: v.f, carbs: v.c }));
  await loadEntries();
}

/* ---------- check-in ---------- */
function compress(file) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280; let w = img.width, h = img.height; const sc = Math.min(1, max / Math.max(w, h));
      w = Math.round(w * sc); h = Math.round(h * sc);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url);
      let q = 0.72;
      const tryQ = () => cv.toBlob(b => { if (!b) return rej(new Error('compress')); if (b.size > 900 * 1024 && q > 0.3) { q -= 0.1; return tryQ(); } res(b); }, 'image/jpeg', q);
      tryQ();
    };
    img.onerror = () => rej(new Error('image'));
    img.src = url;
  });
}
async function submitCheckin() {
  const f = S.form, w = num(f.w);
  if (!(w >= 30 && w <= 250)) { toast('Вкажи вагу, наприклад 70,5'); return; }
  const week = mondayISO(), ex = S.checkins.find(c => c.week_start === week);
  const paths = ex && ex.photo_paths && ex.photo_paths.length === 3 ? ex.photo_paths.slice() : ['', '', ''];
  for (let i = 0; i < 3; i++) {
    const p = f.photos[i];
    if (p) {
      const path = S.me.id + '/' + week + '-' + i + '.jpg';
      const r = await sb.storage.from('progress-photos').upload(path, p.blob, { contentType: 'image/jpeg', upsert: true });
      if (r.error) throw r.error;
      paths[i] = path;
    }
  }
  const row = { client_id: S.me.id, week_start: week, weight_kg: w, waist_cm: f.waist ? num(f.waist) : null, hips_cm: f.hips ? num(f.hips) : null, mood: f.mood || null, comment: f.comment.trim() || null, photo_paths: paths };
  if (ex) await one(sb.from('checkins').update(row).eq('id', ex.id)); else await one(sb.from('checkins').insert(row));
  await loadCheckins(); S.editCi = false; S.form = newForm();
  hap('success'); toast('Check-in надіслано тренеру');
}

/* =====================================================================
   КЛІЄНТ: екрани
   ===================================================================== */
function clientHTML() {
  const c = S.me, sub = subInfo(c);
  const tabs = [['today', 'Тренування', 'today'], ['food', 'Харчування', 'food'], ['check', 'Check-in', 'check'], ['prog', 'Прогрес', 'prog'], ['me', 'Профіль', 'user']];
  const body = S.tab === 'today' ? clientToday() : S.tab === 'food' ? clientFood() : S.tab === 'check' ? clientCheckin() : S.tab === 'prog' ? clientProgress(sub) : clientProfile(sub);
  return `<div class="wrap"><div class="ph-head"><div class="muted sm">${esc(fmtDateLong(todayISO()))}</div><h1 class="hello">Привіт, ${esc(first(c.name))}</h1><span class="chip ${sub.k}">${esc(sub.t)}</span></div>
    <div class="ph-body">${body}</div></div>
    <div class="tabbar"><nav class="tabs" aria-label="Розділи">${tabs.map(t => `<button data-act="tab" data-tab="${t[0]}"${S.tab === t[0] ? ' aria-current="page"' : ''}>${icon(t[2])}${t[1]}</button>`).join('')}</nav></div>`;
}
function feedbackBox() {
  const week = S.checkins.slice().reverse().find(c => c.coach_feedback);
  return week ? `<div class="callout"><b>Відгук тренера</b><p>${esc(week.coach_feedback)}</p></div>` : '';
}
function histHTML(list, open, logs, act) {
  if (!list.length) return '<p class="muted sm">Записів поки немає.</p>';
  return list.map(h => {
    const isOpen = open[h.id];
    let sub = '';
    if (isOpen) {
      const L = logs[h.id];
      if (!L) sub = '<div class="subrows">Завантаження…</div>';
      else {
        const by = {}; L.forEach(l => { (by[l.exercise_name] = by[l.exercise_name] || []).push(l); });
        sub = '<div class="subrows">' + Object.keys(by).map(n => `<div><b>${esc(n)}:</b> ${by[n].map(l => `${fmt(l.weight_kg)}×${l.reps}`).join(', ')}</div>`).join('') + '</div>';
      }
    }
    return `<button class="hist btn-like" data-act="${act}" data-id="${h.id}"><span>${fmtDate(h.performed_on)} · ${esc(h.title)}</span><span class="muted">${h.total_sets} підх. · ${r0(Number(h.volume_kg))} кг</span></button>${sub}`;
  }).join('');
}
function clientToday() {
  const banner = S.intake && S.intake.completed_at ? '' : `<div class="callout"><b>Заповни анкету</b><p>Це займе дві хвилини, і тренер підбере програму під тебе.</p><button class="btn sm" style="margin-top:10px" data-act="tab" data-tab="me">Відкрити анкету</button></div>`;
  const w = curWorkout();
  const hist = `<div class="sec"><h3>Щоденник тренувань</h3>${histHTML(S.sessions.slice(0, 5), S.histOpen, S.setLogs, 'hist')}</div>`;
  const weekN = S.sessions.filter(s => s.performed_on >= mondayISO()).length;
  const weekly = `<div class="muted sm" style="margin-top:4px">Цього тижня: ${weekN} з ${S.me.workouts_plan}</div>`;
  if (!w) return banner + feedbackBox() + '<div class="prog-title">Програму ще не призначено</div><p class="muted">Тренер призначить програму найближчим часом.</p>' + hist;
  syncLog(w);
  const items = wkItems(w); let total = 0, done = 0;
  const exHTML = items.map((it, i) => {
    let rows = '';
    for (let s = 0; s < it.sets; s++) {
      const k = i + ':' + s, L = S.log[k] || { kg: it.weight_kg, reps: it.reps, done: false };
      total++; if (L.done) done++;
      rows += `<div class="set"><span class="setn">${s + 1}</span>
        <label class="unit"><input type="number" inputmode="decimal" min="0" data-in="kg" data-k="${k}" value="${esc(L.kg)}" aria-label="Вага, підхід ${s + 1}"><span>кг</span></label>
        <label class="unit"><input type="number" inputmode="numeric" min="0" data-in="reps" data-k="${k}" value="${esc(L.reps)}" aria-label="Повторення, підхід ${s + 1}"><span>повт.</span></label>
        <button class="tick" data-act="tick" data-k="${k}" aria-pressed="${!!L.done}" aria-label="Підхід ${s + 1} виконано">${icon('tick')}</button></div>`;
    }
    const e = S.exMap[it.exercise_id], meta = [];
    if (S.lastPerf[it.exercise_id]) meta.push('Минулого разу: ' + esc(S.lastPerf[it.exercise_id]));
    if (e && e.note) meta.push(esc(e.note));
    return `<section class="ex"><div class="inline between"><h3>${esc(exName(it.exercise_id))}</h3>${e && isUrl(e.video_url) ? `<a class="sm" href="${esc(e.video_url)}" target="_blank" rel="noopener">Відео</a>` : ''}</div>
      ${meta.length ? `<div class="muted sm">${meta.join(' · ')}</div>` : ''}${rows}</section>`;
  }).join('');
  const segs = Array.from({ length: total }, (_, k) => `<i class="${k < done ? 'on' : ''}"></i>`).join('');
  const saved = S.finished ? '<div class="callout"><b>Тренування збережено в щоденнику.</b> Нижче наступне за програмою.</div>' : '';
  return `${banner}${feedbackBox()}${saved}<div class="prog-title">${esc(S.program.name)}</div><div class="muted sm">${esc(w.name)} · ${items.length} вправ</div>
    <div class="big">${done}<small>/${total}</small></div><div class="muted sm">підходів виконано</div>${weekly}<div class="segs" aria-hidden="true">${segs}</div>${exHTML}
    <button class="btn" data-act="finish" style="margin-top:12px">Завершити тренування</button>${hist}`;
}

function foodRow(f, tag) {
  return `<button class="res" data-act="pickfood" data-fid="${esc(f.id)}"><span>${esc(f.name)}${f.owner_client_id ? ' <span class="chip plain">свій</span>' : ''}${tag ? ` <span class="chip plain">${tag}</span>` : ''}</span><span class="muted sm">${fmt(f.kcal_100)} ккал/100 г</span></button>`;
}
function resultsHTML() {
  const a = S.add;
  if (a.food) return `<div class="res" style="cursor:default"><span><b>${esc(a.food.name)}</b><br><span class="muted sm">на 100 г: ${fmt(a.food.kcal_100)} ккал · Б ${fmt(a.food.protein_100)} · Ж ${fmt(a.food.fat_100)} · В ${fmt(a.food.carbs_100)}</span></span><button class="btn sm alt" data-act="unpick">Змінити</button></div>`;
  const q = a.q.trim();
  if (q.length < 2) {
    if (!S.recents.length) return '<p class="muted sm">Почни вводити назву продукту.</p>';
    return '<p class="muted sm">Недавні продукти</p>' + S.recents.map(f => foodRow(f)).join('');
  }
  let html = a.results.length ? a.results.map(f => foodRow(f)).join('') : '<p class="muted sm">У базі нічого не знайдено.</p>';
  html += a.off.map(f => foodRow(f, 'Open Food Facts')).join('');
  if (a.offBusy) html += '<p class="muted sm" style="margin-top:8px">Шукаю в Open Food Facts…</p>';
  else {
    if (a.offErr) html += `<p class="muted sm" style="margin-top:8px">${esc(a.offErr)}</p>`;
    if (!a.off.length) html += /^\d{8,14}$/.test(q)
      ? '<button class="btn sm alt" style="margin-top:8px" data-act="offbarcode">Знайти за штрихкодом</button>'
      : '<button class="btn sm alt" style="margin-top:8px" data-act="offsearch">Шукати ще в Open Food Facts</button>';
  }
  if (a.off.length) html += '<p class="muted sm" style="margin-top:8px">Дані: Open Food Facts (ODbL). Значення вносять користувачі, перевір їх на упаковці.</p>';
  return html;
}
function pvalsHTML() {
  const a = S.add; if (!a.food) return '';
  const g = num(a.grams), v = portion(a.food, g > 0 ? g : 0);
  return `<span class="muted sm">У порції: ${fmt(v.k)} ккал · Б ${fmt(v.p)} · Ж ${fmt(v.f)} · В ${fmt(v.c)}</span>`;
}
function addPanelHTML() {
  const a = S.add;
  const modes = `<div class="opts"><button data-act="addmode" data-v="search" aria-pressed="${!a.custom}">Пошук</button><button data-act="addmode" data-v="custom" aria-pressed="${a.custom}">Свій продукт</button></div>`;
  if (!a.custom) {
    return `<div class="addp">${modes}<input type="search" data-in="q" value="${esc(a.q)}" placeholder="Наприклад: гречка, куряче філе" aria-label="Пошук продукту">
      <div id="results">${resultsHTML()}</div>
      ${a.food ? `<label class="unit"><input type="text" inputmode="decimal" data-in="grams" value="${esc(a.grams)}" aria-label="Вага порції"><span>г</span></label><div id="pvals">${pvalsHTML()}</div><button class="btn sm" data-act="addfood">Додати в щоденник</button>` : ''}
      <button class="ghost" data-act="addclose">Закрити</button></div>`;
  }
  const cf = a.cf, f = (k, l, u) => `<label class="unit"><input type="text" inputmode="decimal" data-in="cf_${k}" value="${esc(cf[k])}" placeholder="${l}" aria-label="${l}"><span>${u}</span></label>`;
  return `<div class="addp">${modes}<input type="text" data-in="cf_n" value="${esc(cf.n)}" placeholder="Назва продукту" aria-label="Назва продукту">
    <p class="muted sm">Поживність на 100 г:</p><div class="grid2">${f('k', 'Калорії', 'ккал')}${f('p', 'Білки', 'г')}${f('f', 'Жири', 'г')}${f('c', 'Вуглеводи', 'г')}</div>
    ${f('g', 'Вага порції', 'г')}<button class="btn sm" data-act="addcustom">Зберегти й додати</button><button class="ghost" data-act="addclose">Закрити</button></div>`;
}
function clientFood() {
  const t = totalsOf(S.entries), N = normOf(S.me);
  const meals = MEALS.map(m => {
    const list = S.entries.filter(e => e.meal === m.id), sum = list.reduce((s, e) => s + Number(e.kcal), 0);
    const rows = list.map(e => `<div class="ent"><div class="grow"><b>${esc(e.food_name)}</b><div class="muted sm">${fmt(e.grams)} г · Б ${fmt(e.protein)} · Ж ${fmt(e.fat)} · В ${fmt(e.carbs)}</div></div><span>${r0(Number(e.kcal))}</span>
      <button class="x" data-act="delent" data-id="${e.id}" aria-label="Видалити ${esc(e.food_name)}">×</button></div>`).join('');
    const open = S.add && S.add.meal === m.id;
    return `<section class="meal"><div class="inline between"><h3>${m.n}</h3><span class="muted sm">${r0(sum)} ккал</span></div>${rows}
      ${open ? addPanelHTML() : `<button class="btn sm alt" style="margin-top:10px" data-act="addopen" data-m="${m.id}">+ Додати продукт</button>`}</section>`;
  }).join('');
  return `<div class="datebar"><button data-act="fdate" data-n="-1" aria-label="Попередній день">‹</button><div class="prog-title">${S.foodDate === todayISO() ? 'Сьогодні' : esc(fmtDateLong(S.foodDate))}</div><button data-act="fdate" data-n="1" aria-label="Наступний день">›</button></div>
    <div class="muted sm">Норма від тренера: ${N.kcal} ккал</div><div class="big">${r0(t.k)}<small> ккал</small></div>${nutBars(t, N)}<div style="margin-top:14px">${meals}</div>`;
}

function photoSlots(existing, editable) {
  const names = ['Спереду', 'Збоку', 'Ззаду'];
  return '<div class="photos">' + names.map((n, i) => {
    const p = S.form.photos[i], path = existing && existing[i];
    const inner = p ? `<img src="${p.url}" alt="${n}">` : path ? `<img data-path="${esc(path)}" alt="${n}">` : '';
    return `<button data-act="pickphoto" data-i="${i}" aria-pressed="${!!(p || path)}" aria-label="Фото ${n}">${inner}<span style="position:relative">${p || path ? '' : '+ ' + n}</span></button><input type="file" accept="image/*" hidden id="ph${i}" data-in="photo" data-i="${i}">`;
  }).join('') + '</div>';
}
function clientCheckin() {
  const week = mondayISO(), ex = S.checkins.find(c => c.week_start === week);
  if (ex && !S.editCi) {
    return `<div class="prog-title">Check-in за цей тиждень</div>
      <div class="callout"><b>Надіслано тренеру.</b> ${ex.coach_feedback ? 'Відгук нижче.' : 'Відгук з’явиться тут.'}</div>
      <div class="grid2" style="margin-top:14px"><div class="stat"><b>${fmt(ex.weight_kg)}</b><span>вага, кг</span></div><div class="stat"><b>${ex.mood || '—'}/5</b><span>самопочуття</span></div>
      <div class="stat"><b>${ex.waist_cm != null ? fmt(ex.waist_cm) : '—'}</b><span>талія, см</span></div><div class="stat"><b>${ex.hips_cm != null ? fmt(ex.hips_cm) : '—'}</b><span>стегна, см</span></div></div>
      ${ex.coach_feedback ? `<div class="callout"><b>Відгук тренера</b><p>${esc(ex.coach_feedback)}</p></div>` : `<button class="btn alt" style="margin-top:14px" data-act="editci">Змінити check-in</button>`}`;
  }
  if (ex && S.editCi && !S.form.w && !S.form.touched) {
    S.form = Object.assign(newForm(), { w: fmt(ex.weight_kg), waist: ex.waist_cm != null ? fmt(ex.waist_cm) : '', hips: ex.hips_cm != null ? fmt(ex.hips_cm) : '', mood: ex.mood || 0, comment: ex.comment || '', touched: true });
  }
  const f = S.form;
  return `<div class="prog-title">Щотижневий check-in</div><div class="muted sm">Займає близько хвилини</div>
    <label class="field"><span>Вага зранку</span><span class="unit"><input type="text" inputmode="decimal" data-in="w" value="${esc(f.w)}" placeholder="70,5"><span>кг</span></span></label>
    <div class="grid2"><label class="field"><span>Талія</span><span class="unit"><input type="text" inputmode="decimal" data-in="waist" value="${esc(f.waist)}"><span>см</span></span></label>
    <label class="field"><span>Стегна</span><span class="unit"><input type="text" inputmode="decimal" data-in="hips" value="${esc(f.hips)}"><span>см</span></span></label></div>
    <span class="lbl">Самопочуття за тиждень</span><div class="mood">${[1, 2, 3, 4, 5].map(v => `<button data-act="mood" data-v="${v}" aria-pressed="${f.mood === v}">${v}</button>`).join('')}</div>
    <div class="muted sm" style="margin-top:6px">1 — виснажено, 5 — повно енергії</div>
    <span class="lbl">Фото прогресу</span>${photoSlots(ex ? ex.photo_paths : null, true)}
    <label class="field"><span>Коментар</span><textarea data-in="comment" placeholder="Що вдалося, що було складно">${esc(f.comment)}</textarea></label>
    <button class="btn" data-act="submit" style="margin-top:16px">Надіслати тренеру</button>`;
}

function clientProgress(sub) {
  return `<div class="prog-title">Твій прогрес</div><div style="margin-top:10px">${analyticsHTML(S.checkins, S.sessions, { scope: 'c', sl: S.sl, slPick: S.slPick, week: S.weekEntries, norm: normOf(S.me) })}</div>
    <div class="callout"><b>${esc(S.me.tariff || 'Тариф не вказано')}</b><p>${esc(sub.t)}</p></div>`;
}

function optsHTML(f, vals) {
  return '<div class="opts">' + vals.map(v => `<button data-act="pf" data-f="${f}" data-v="${esc(v)}" aria-pressed="${S.pf[f] === v}">${esc(v)}</button>`).join('') + '</div>';
}
function intakeKV(i) {
  const v = x => (x ? esc(x) : '—');
  return `<dl class="kv"><dt>Ціль</dt><dd>${v(i.goal)}</dd><dt>Досвід</dt><dd>${v(i.experience)}</dd><dt>Тренувань на тиждень</dt><dd>${v(i.days_per_week)}</dd>
    <dt>Де тренується</dt><dd>${v(i.place)}</dd><dt>Вік</dt><dd>${v(i.age)}</dd><dt>Зріст</dt><dd>${i.height_cm ? fmt(i.height_cm) + ' см' : '—'}</dd>
    <dt>Бажана вага</dt><dd>${i.target_weight_kg ? fmt(i.target_weight_kg) + ' кг' : '—'}</dd><dt>Травми, обмеження</dt><dd>${v(i.injuries)}</dd><dt>Харчові обмеження</dt><dd>${v(i.diet_notes)}</dd></dl>`;
}
function clientProfile(sub) {
  const c = S.me;
  if (S.intake && S.intake.completed_at && !S.pfEdit) {
    return `<div class="prog-title">${esc(c.name)}</div><div class="muted sm">${esc(c.goal || '')}</div>
      <div class="callout"><b>Анкета заповнена.</b> Тренер бачить її у твоєму профілі.</div><div style="margin-top:16px">${intakeKV(S.intake)}</div>
      <button class="btn alt" style="margin-top:16px" data-act="pfedit">Змінити анкету</button>
      <div class="callout"><b>${esc(c.tariff || 'Тариф не вказано')}</b><p>${esc(sub.t)}</p></div>`;
  }
  const p = S.pf;
  return `<div class="prog-title">Анкета</div><div class="muted sm">Відповіді бачить лише твій тренер</div>
    <span class="lbl">Головна ціль</span>${optsHTML('goal', ['Схуднення', "Набір м'язів", 'Підтягнути тіло', 'Сила та витривалість'])}
    <span class="lbl">Досвід тренувань</span>${optsHTML('experience', ['Початківець', 'Середній', 'Досвідчений'])}
    <span class="lbl">Тренувань на тиждень</span>${optsHTML('days', ['2', '3', '4', '5'])}
    <span class="lbl">Де тренуєшся</span>${optsHTML('place', ['Зал', 'Вдома', 'Змішано'])}
    <div class="grid2"><label class="field"><span>Вік</span><input type="text" inputmode="numeric" data-in="pf_age" value="${esc(p.age)}"></label>
    <label class="field"><span>Зріст</span><span class="unit"><input type="text" inputmode="numeric" data-in="pf_height" value="${esc(p.height)}"><span>см</span></span></label></div>
    <label class="field"><span>Бажана вага</span><span class="unit"><input type="text" inputmode="decimal" data-in="pf_target" value="${esc(p.target)}"><span>кг</span></span></label>
    <label class="field"><span>Травми та обмеження</span><textarea data-in="pf_injuries" placeholder="Наприклад: болить коліно. Або «немає»">${esc(p.injuries)}</textarea></label>
    <label class="field"><span>Харчові обмеження та алергії</span><textarea data-in="pf_diet" placeholder="Що не їси, на що є алергія">${esc(p.diet)}</textarea></label>
    <button class="btn" data-act="pfsave" style="margin-top:16px">Зберегти анкету</button>`;
}

/* =====================================================================
   ТРЕНЕР: завантаження даних
   ===================================================================== */
async function loadCoach() {
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const [ov, clients, settings, ex, progs, rem] = await Promise.all([
    one(sb.from('client_overview').select('*')),
    one(sb.from('clients').select('*').order('name', { ascending: true })),
    one(sb.from('coach_settings').select('*').limit(1).maybeSingle()),
    one(sb.from('exercises').select('*').order('name', { ascending: true })),
    one(sb.from('programs').select('*').order('created_at', { ascending: true })),
    one(sb.from('reminders_log').select('*').gte('sent_at', midnight.toISOString()))
  ]);
  S.overview = ov; S.clients = clients; S.settings = settings; S.exercises = ex; S.programs = progs; S.remLog = rem;
  if (!S.exf) S.exf = { id: null, name: '', group: 'Ноги', video: '', note: '' };
}
async function reloadCoachLists() {
  const [ov, clients] = await Promise.all([one(sb.from('client_overview').select('*')), one(sb.from('clients').select('*').order('name', { ascending: true }))]);
  S.overview = ov; S.clients = clients;
}
async function loadDetailEntries() {
  S.d.entries = await one(sb.from('food_entries').select('*').eq('client_id', S.d.c.id).eq('eaten_on', S.d.date).order('created_at', { ascending: true }));
}
async function openClient(id, dtab) {
  const c = S.clients.find(x => x.id === id);
  if (!c) return;
  S.detailId = id; if (dtab) S.dtab = dtab;
  const [intake, sessions, checkins, payments] = await Promise.all([
    one(sb.from('intake').select('*').eq('client_id', id).maybeSingle()),
    one(sb.from('workout_sessions').select('*').eq('client_id', id).order('performed_on', { ascending: false }).order('created_at', { ascending: false }).limit(60)),
    one(sb.from('checkins').select('*').eq('client_id', id).order('week_start', { ascending: true })),
    one(sb.from('payments').select('*').eq('client_id', id).order('paid_on', { ascending: false }))
  ]);
  S.d = { c: c, intake: intake, sessions: sessions, checkins: checkins, payments: payments, date: todayISO(), entries: [], logs: {}, open: {}, norm: null, sub: null, fb: null, edit: null, sl: null, slPick: '', week: [] };
  await loadDetailEntries();
  S.d.week = await one(sb.from('food_entries').select('*').eq('client_id', id).gte('eaten_on', addDaysISO(todayISO(), -6)).order('eaten_on', { ascending: true }));
  S.d.sl = await loadStrength(id, sessions);
}
async function refreshDetail() { const id = S.detailId, t = S.dtab; await reloadCoachLists(); await openClient(id, t); }
async function remind(clientId, kind) {
  await one(sb.from('reminders_log').insert({ client_id: clientId, kind: kind }));
  S.remLog.push({ client_id: clientId, kind: kind });
}
const reminded = (id, kind) => S.remLog.some(r => r.client_id === id && r.kind === kind);

/* ---------- тренер: екрани ---------- */
function attentionList() {
  const L = [];
  S.overview.forEach(o => {
    if (o.days_left != null && o.days_left < 0) L.push({ o: o, k: 'bad', t: 'підписка прострочена ' + (-o.days_left) + ' дн.', btn: 'Нагадати про оплату', act: 'remind', kind: 'pay' });
    else if (o.days_left != null && o.days_left <= 7) L.push({ o: o, k: 'warn', t: 'підписка скоро закінчується', btn: 'Нагадати про оплату', act: 'remind', kind: 'pay' });
    if (!o.intake_done) L.push({ o: o, k: 'warn', t: 'анкета не заповнена', btn: 'Нагадати', act: 'remind', kind: 'intake' });
    if (o.awaiting_feedback) L.push({ o: o, k: 'good', t: 'check-in чекає на відгук', act: 'open', dtab: 'checkin' });
    if (!o.checkin_this_week) L.push({ o: o, k: 'warn', t: 'check-in ще не надіслано', btn: 'Нагадати', act: 'remind', kind: 'checkin' });
    if (Number(o.sessions_this_week) === 0) L.push({ o: o, k: 'warn', t: 'жодного тренування цього тижня', btn: 'Нагадати', act: 'remind', kind: 'workout' });
  });
  const ord = { bad: 0, warn: 1, good: 2 };
  return L.sort((a, b) => ord[a.k] - ord[b.k]);
}
function coachHTML() {
  const tabs = [['overview', 'Огляд', 'today'], ['clients', 'Клієнти', 'user'], ['exercises', 'Вправи', 'dumb'], ['programs', 'Програми', 'list'], ['foods', 'Продукти', 'food']];
  let body;
  if (S.ctab === 'overview') body = overviewHTML();
  else if (S.ctab === 'clients') body = S.detailId && S.d ? detailHTML() : clientsListHTML();
  else if (S.ctab === 'exercises') body = exercisesHTML();
  else if (S.ctab === 'foods') body = foodsHTML();
  else body = S.pb ? builderHTML() : programsListHTML();
  return `<div class="wrap"><div class="ph-head"><div class="muted sm">${esc(fmtDateLong(todayISO()))}</div><h1 class="c-title">${{ overview: 'Огляд', clients: 'Клієнти', exercises: 'Вправи', programs: 'Програми', foods: 'Продукти' }[S.ctab]}</h1></div>
    <div class="ph-body">${body}</div></div>
    <div class="tabbar"><nav class="tabs" aria-label="Розділи">${tabs.map(t => `<button data-act="ctab" data-tab="${t[0]}"${S.ctab === t[0] ? ' aria-current="page"' : ''}>${icon(t[2])}${t[1]}</button>`).join('')}</nav></div>`;
}
function overviewHTML() {
  const att = attentionList();
  const active = S.overview.filter(o => o.days_left != null && o.days_left >= 0).length;
  const waiting = S.overview.filter(o => o.awaiting_feedback).length;
  const attHTML = att.map(a => {
    const sent = a.kind && reminded(a.o.id, a.kind);
    const btn = a.act === 'open' ? `<button class="btn sm alt" data-act="open" data-id="${a.o.id}" data-tab="${a.dtab}">Відкрити</button>`
      : `<button class="btn sm alt" data-act="remind" data-id="${a.o.id}" data-kind="${a.kind}"${sent ? ' disabled' : ''}>${sent ? 'Надіслано' : a.btn}</button>`;
    return `<div class="att"><span class="dot ${a.k}"></span><div class="grow"><b>${esc(a.o.name)}</b> <span class="muted">${a.t}</span></div>${btn}</div>`;
  }).join('');
  const st = S.settings || {};
  const autoRows = [['remind_checkin', 'Нагадувати про check-in у неділю о 10:00'], ['remind_pay', 'Нагадувати про оплату за 3 дні до кінця підписки'], ['remind_workout', 'Писати клієнту, якщо пропущено 2 тренування поспіль']]
    .map(r => `<div class="sw-row"><span>${r[1]}</span><button class="sw" role="switch" aria-label="${r[1]}" aria-checked="${!!st[r[0]]}" data-act="auto" data-k="${r[0]}"></button></div>`).join('');
  return `<div class="tiles"><div class="stat"><b>${S.overview.length}</b><span>клієнтів</span></div><div class="stat"><b>${active}</b><span>активних підписок</span></div>
    <div class="stat"><b>${waiting}</b><span>check-in чекають відгуку</span></div><div class="stat"><b>${att.length}</b><span>потребують уваги</span></div></div>
    <div class="card"><h2>Потребує уваги сьогодні</h2>${attHTML || '<p class="muted">Нічого термінового.</p>'}</div>
    <div class="card"><h2>Працює без тебе</h2><p class="muted sm">Автоматичні нагадування, які не треба писати вручну.</p>${autoRows}</div>`;
}
function inviteLink(c) { return (CFG.INVITE_BASE_URL || '') + c.invite_code; }
function clientsListHTML() {
  const list = S.clients.map(x => { const s = subInfo(x); return `<button class="row" data-act="sel" data-id="${x.id}"><span><b>${esc(x.name)}</b><br><span class="muted sm">${esc(x.goal || '')}</span></span><span class="chip ${s.k}">${s.s}</span></button>`; }).join('');
  let form = '';
  if (S.nc) {
    const n = S.nc;
    form = `<div class="card"><h2>Новий клієнт</h2>
      <label class="field"><span>Імʼя</span><input type="text" data-in="nc_name" value="${esc(n.name)}"></label>
      <label class="field"><span>Ціль</span><input type="text" data-in="nc_goal" value="${esc(n.goal)}" placeholder="Наприклад: схуднення, −6 кг"></label>
      <label class="field"><span>Тариф</span><input type="text" data-in="nc_tariff" value="${esc(n.tariff)}" placeholder="Супровід 1 міс"></label>
      <div class="grid2"><label class="field"><span>Початок</span><input type="date" data-in="nc_sub_start" value="${esc(n.sub_start)}"></label><label class="field"><span>Кінець</span><input type="date" data-in="nc_sub_end" value="${esc(n.sub_end)}"></label></div>
      <span class="lbl">Норма харчування на день</span><div class="grid2">
      <label class="unit"><input type="text" inputmode="numeric" data-in="nc_kcal" value="${esc(n.kcal)}" aria-label="Калорії"><span>ккал</span></label><label class="unit"><input type="text" inputmode="numeric" data-in="nc_p" value="${esc(n.p)}" aria-label="Білки"><span>Б, г</span></label>
      <label class="unit"><input type="text" inputmode="numeric" data-in="nc_f" value="${esc(n.f)}" aria-label="Жири"><span>Ж, г</span></label><label class="unit"><input type="text" inputmode="numeric" data-in="nc_c" value="${esc(n.c)}" aria-label="Вуглеводи"><span>В, г</span></label></div>
      <div class="inline" style="margin-top:14px"><button class="btn" style="flex:1" data-act="createclient">Створити</button><button class="ghost" data-act="cancelnc">Скасувати</button></div></div>`;
  }
  let invite = '';
  if (S.newClient) invite = `<div class="callout"><b>Клієнта створено: ${esc(S.newClient.name)}</b><p>Надішли це посилання клієнту. Воно спрацює один раз.</p><div class="invite">${esc(inviteLink(S.newClient))}</div>
    <button class="btn sm" style="margin-top:10px" data-act="copyinv" data-id="${S.newClient.id}">Копіювати посилання</button></div>`;
  return `${invite}${S.nc ? form : '<button class="btn" data-act="newclient">+ Новий клієнт</button>'}<div class="card"><h2>Усі клієнти</h2>${list || '<p class="muted">Клієнтів ще немає.</p>'}</div>`;
}
function detailHTML() {
  const d = S.d, c = d.c, sub = subInfo(c);
  const dt = [['profile', 'Профіль'], ['training', 'Тренування'], ['food', 'Харчування'], ['checkin', 'Check-in'], ['analytics', 'Аналітика'], ['sub', 'Підписка']];
  let body;
  if (S.dtab === 'profile') body = dProfile(); else if (S.dtab === 'training') body = dTraining(); else if (S.dtab === 'food') body = dFood();
  else if (S.dtab === 'checkin') body = dCheckin(); else if (S.dtab === 'analytics') body = analyticsHTML(d.checkins, d.sessions, { scope: 'd', sl: d.sl, slPick: d.slPick, week: d.week, norm: normOf(d.c) }); else body = dSub();
  return `<button class="back" data-act="back">‹ Усі клієнти</button>
    <div class="card" style="margin-top:0"><div class="inline between"><div><h2 style="margin:0">${esc(c.name)}</h2><div class="muted">${esc(c.goal || '')}</div></div><span class="chip ${sub.k}">${esc(sub.t)}</span></div>
    <div class="opts" style="margin:14px 0 6px" role="group" aria-label="Розділи клієнта">${dt.map(t => `<button data-act="dtab" data-tab="${t[0]}" aria-pressed="${S.dtab === t[0]}">${t[1]}</button>`).join('')}</div>${body}</div>`;
}
function dProfile() {
  const d = S.d, c = d.c;
  const inv = !c.profile_id ? `<div class="callout" style="margin-top:14px"><b>Клієнт ще не підключився</b><div class="invite">${esc(inviteLink(c))}</div><button class="btn sm" style="margin-top:10px" data-act="copyinv" data-id="${c.id}">Копіювати посилання</button></div>` : '';
  const ed = d.edit || { name: c.name, goal: c.goal || '' };
  const editForm = `<div class="sec" style="margin-top:14px"><h3>Основні дані</h3><label class="field" style="margin-top:0"><span>Імʼя</span><input type="text" data-in="ce_name" value="${esc(ed.name)}"></label>
    <label class="field"><span>Ціль</span><input type="text" data-in="ce_goal" value="${esc(ed.goal)}"></label><button class="btn sm alt" style="margin-top:10px" data-act="cesave">Зберегти</button></div>`;
  if (!d.intake || !d.intake.completed_at) return `${inv}${editForm}<div class="callout"><b>Анкета ще не заповнена.</b></div><button class="btn sm alt" style="margin-top:10px" data-act="remind" data-id="${c.id}" data-kind="intake"${reminded(c.id, 'intake') ? ' disabled' : ''}>${reminded(c.id, 'intake') ? 'Нагадування збережено' : 'Нагадати про анкету'}</button>`;
  return `${inv}${editForm}<div class="sec"><h3>Анкета</h3>${intakeKV(d.intake)}</div>`;
}
function dTraining() {
  const d = S.d, c = d.c;
  const options = S.programs.map(p => `<option value="${p.id}"${(S.pickProg || c.program_id) === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  const cur = S.programs.find(p => p.id === c.program_id);
  return `<div class="sec"><h3>Програма клієнта</h3><div class="inline"><select data-in="pick" aria-label="Програма">${S.programs.length ? options : '<option>Немає програм</option>'}</select><button class="btn sm" data-act="assign">Призначити</button></div>
    <p class="muted sm" style="margin-top:8px">Зараз: ${cur ? esc(cur.name) : 'програму не призначено'}. Програми створюються в розділі «Програми».</p></div>
    <div class="sec"><h3>Щоденник тренувань</h3>${histHTML(d.sessions.slice(0, 10), d.open, d.logs, 'chist')}</div>`;
}
function dFood() {
  const d = S.d, c = d.c, t = totalsOf(d.entries), N = normOf(c);
  const nv = d.norm || { kcal: N.kcal, p: N.p, f: N.f, c: N.c };
  const nf = (k, l, u) => `<label class="unit"><input type="text" inputmode="numeric" data-in="norm" data-k="${k}" value="${esc(nv[k])}" aria-label="${l}"><span>${u}</span></label>`;
  const list = MEALS.map(m => { const l = d.entries.filter(e => e.meal === m.id); return l.length ? `<div class="hist" style="cursor:default"><span><b>${m.n}</b><br><span class="muted sm">${l.map(e => esc(e.food_name) + ' ' + fmt(e.grams) + ' г').join(', ')}</span></span><span class="muted">${r0(l.reduce((s, e) => s + Number(e.kcal), 0))} ккал</span></div>` : ''; }).join('');
  return `<div class="sec"><h3>Норма клієнта</h3><div class="grid2">${nf('kcal', 'Калорії', 'ккал')}${nf('p', 'Білки', 'Б, г')}${nf('f', 'Жири', 'Ж, г')}${nf('c', 'Вуглеводи', 'В, г')}</div>
    <button class="btn sm" style="margin-top:10px" data-act="normsave">Зберегти норму</button></div>
    <div class="sec"><div class="datebar"><button data-act="cfdate" data-n="-1" aria-label="Попередній день">‹</button><h3 style="margin:0">${d.date === todayISO() ? 'Сьогодні' : esc(fmtDateLong(d.date))}</h3><button data-act="cfdate" data-n="1" aria-label="Наступний день">›</button></div>
    ${nutBars(t, N)}<div style="margin-top:12px">${list || '<p class="muted sm">За цей день записів немає.</p>'}</div></div>`;
}
function dCheckin() {
  const d = S.d, c = d.c, list = d.checkins.slice().reverse();
  if (!list.length) return `<p class="muted" style="margin-top:14px">Check-in'ів поки немає.</p><button class="btn sm alt" style="margin-top:10px" data-act="remind" data-id="${c.id}" data-kind="checkin"${reminded(c.id, 'checkin') ? ' disabled' : ''}>${reminded(c.id, 'checkin') ? 'Нагадування збережено' : 'Нагадати про check-in'}</button>`;
  const L = list[0], names = ['Спереду', 'Збоку', 'Ззаду'], paths = L.photo_paths || [];
  const draft = d.fb !== null ? d.fb : (L.coach_feedback || '');
  const prev = list.slice(1, 7).map(k => `<div class="hist" style="cursor:default"><span>${fmtDate(k.week_start)}</span><span class="muted">${fmt(k.weight_kg)} кг${k.waist_cm != null ? ' · талія ' + fmt(k.waist_cm) : ''}</span></div>`).join('');
  return `<div class="sec"><h3>Останній check-in · ${fmtDate(L.week_start)}</h3><div class="tiles"><div class="stat"><b>${fmt(L.weight_kg)}</b><span>вага, кг</span></div><div class="stat"><b>${L.waist_cm != null ? fmt(L.waist_cm) : '—'}</b><span>талія, см</span></div>
    <div class="stat"><b>${L.hips_cm != null ? fmt(L.hips_cm) : '—'}</b><span>стегна, см</span></div><div class="stat"><b>${L.mood || '—'}/5</b><span>самопочуття</span></div></div>
    <div class="shots" style="margin-top:10px">${names.map((n, i) => `<div>${paths[i] ? `<img data-path="${esc(paths[i])}" alt="${n}">` : 'Без фото'}</div>`).join('')}</div>
    ${L.comment ? `<p style="margin-top:12px"><span class="muted">Коментар клієнта:</span> ${esc(L.comment)}</p>` : ''}
    <label class="field"><span>${L.coach_feedback ? 'Відгук надіслано. Можеш оновити' : 'Твій відгук клієнту'}</span><textarea data-in="fb" placeholder="Що добре, що змінити на наступному тижні">${esc(draft)}</textarea></label>
    <button class="btn sm" style="margin-top:10px" data-act="sendfb" data-id="${L.id}">${L.coach_feedback ? 'Оновити відгук' : 'Надіслати відгук'}</button></div>
    ${prev ? `<div class="sec"><h3>Попередні</h3>${prev}</div>` : ''}`;
}
function dSub() {
  const d = S.d, c = d.c, sub = subInfo(c);
  const sv = d.sub || { tariff: c.tariff || '', sub_start: c.sub_start || '', sub_end: c.sub_end || '' };
  const pays = d.payments.map(p => `<div class="hist" style="cursor:default"><span>${fmtDate(p.paid_on)}</span><span class="muted">${p.months} міс${p.amount != null ? ' · ' + fmt(p.amount) : ''}</span></div>`).join('');
  return `<div class="sec"><div class="inline between"><b>${esc(c.tariff || 'Тариф не вказано')}</b><span class="chip ${sub.k}">${esc(sub.t)}</span></div>
    <label class="field"><span>Тариф</span><input type="text" data-in="sub_tariff" value="${esc(sv.tariff)}"></label>
    <div class="grid2"><label class="field"><span>Початок</span><input type="date" data-in="sub_start" value="${esc(sv.sub_start)}"></label><label class="field"><span>Кінець</span><input type="date" data-in="sub_end" value="${esc(sv.sub_end)}"></label></div>
    <button class="btn sm alt" style="margin-top:10px" data-act="subsave">Зберегти зміни</button></div>
    <div class="sec"><h3>Позначити оплату</h3><div class="grid2"><label class="unit"><input type="text" inputmode="numeric" data-in="pay_months" value="${esc(S.payMonths || '1')}" aria-label="Місяців"><span>міс</span></label>
    <label class="unit"><input type="text" inputmode="decimal" data-in="pay_amount" value="${esc(S.payAmount || '')}" placeholder="Сума" aria-label="Сума"><span>грн</span></label></div>
    <button class="btn" style="margin-top:10px" data-act="pay">Позначити оплату</button></div>
    <div class="sec"><h3>Історія оплат</h3>${pays || '<p class="muted sm">Оплат поки немає.</p>'}</div>`;
}

/* ---------- тренер: база продуктів ---------- */
const newFd = () => ({ q: '', list: [], f: { id: null, name: '', k: '', p: '', f: '', c: '', g: '100' } });
let fdTimer;
async function loadFoodsAdmin() {
  const q = S.fd.q.trim();
  let req = sb.from('foods').select('*').is('owner_client_id', null);
  if (q.length >= 2) req = req.ilike('name', '%' + q + '%');
  S.fd.list = await one(req.order('name', { ascending: true }).limit(60));
}
function foodListHTML() {
  const l = S.fd.list;
  if (!l.length) return '<p class="muted sm" style="margin-top:12px">Нічого не знайдено.</p>';
  return l.map(f => `<div class="exrow"><div class="grow"><b>${esc(f.name)}</b><div class="muted sm">${fmt(f.kcal_100)} ккал · Б ${fmt(f.protein_100)} · Ж ${fmt(f.fat_100)} · В ${fmt(f.carbs_100)} на 100 г</div></div>
    <button class="btn sm alt" data-act="fdedit" data-id="${f.id}">Змінити</button><button class="x" data-act="fddel" data-id="${f.id}" aria-label="Видалити ${esc(f.name)}">×</button></div>`).join('')
    + (l.length >= 60 ? '<p class="muted sm" style="margin-top:10px">Показано перші 60. Використовуй пошук.</p>' : '');
}
function foodsHTML() {
  if (!S.fd) S.fd = newFd();
  const f = S.fd.f;
  const fi = (k, l, u) => `<label class="unit"><input type="text" inputmode="decimal" data-in="fd_${k}" value="${esc(f[k])}" placeholder="${l}" aria-label="${l}"><span>${u}</span></label>`;
  return `<div class="card" style="margin-top:0"><h2>${f.id ? 'Змінити продукт' : 'Новий продукт'}</h2>
    <label class="field"><span>Назва</span><input type="text" data-in="fd_name" value="${esc(f.name)}" placeholder="Наприклад: Гречка, варена"></label>
    <span class="lbl">Поживність на 100 г</span><div class="grid2">${fi('k', 'Калорії', 'ккал')}${fi('p', 'Білки', 'г')}${fi('f', 'Жири', 'г')}${fi('c', 'Вуглеводи', 'г')}</div>
    <span class="lbl">Стандартна порція</span>${fi('g', 'Порція', 'г')}
    <div class="inline" style="margin-top:12px"><button class="btn" style="flex:1" data-act="fdsave">${f.id ? 'Зберегти' : 'Додати продукт'}</button>${f.id ? '<button class="ghost" data-act="fdcancel">Скасувати</button>' : ''}</div></div>
    <div class="card"><h2>Спільна база продуктів</h2><p class="muted sm">Її бачать усі клієнти при пошуку. Значення на 100 г.</p>
    <input type="search" style="margin-top:8px" data-in="fdq" value="${esc(S.fd.q)}" placeholder="Пошук продукту" aria-label="Пошук продукту"><div id="fdlist">${foodListHTML()}</div></div>`;
}

function exercisesHTML() {
  const f = S.exf;
  const q = S.exq.trim().toLowerCase();
  const filtered = S.exercises.filter(e => (!S.exgf || e.muscle_group === S.exgf) && (!q || e.name.toLowerCase().indexOf(q) !== -1));
  const groups = GROUPS.map(g => {
    const list = filtered.filter(e => e.muscle_group === g);
    if (!list.length) return '';
    return `<div class="sec"><h3>${g} <span class="muted sm">${list.length}</span></h3>${list.map(e => `<div class="exrow"><div class="grow"><b>${esc(e.name)}</b>${e.note ? `<div class="muted sm">${esc(e.note)}</div>` : ''}${isUrl(e.video_url) ? `<a class="sm" href="${esc(e.video_url)}" target="_blank" rel="noopener">Відео</a>` : ''}</div>
      <button class="btn sm alt" data-act="exedit" data-id="${e.id}">Змінити</button><button class="x" data-act="exdel" data-id="${e.id}" aria-label="Видалити ${esc(e.name)}">×</button></div>`).join('')}</div>`;
  }).join('');
  return `<div class="card" style="margin-top:0"><h2>${f.id ? 'Змінити вправу' : 'Нова вправа'}</h2>
    <label class="field"><span>Назва</span><input type="text" data-in="exn" value="${esc(f.name)}" placeholder="Назва вправи"></label>
    <label class="field"><span>Група м’язів</span><select data-in="exg">${GROUPS.map(g => `<option${f.group === g ? ' selected' : ''}>${g}</option>`).join('')}</select></label>
    <label class="field"><span>Посилання на відео</span><input type="text" data-in="exv" value="${esc(f.video)}" placeholder="https://… (необов’язково)"></label>
    <label class="field"><span>Підказка для клієнта</span><input type="text" data-in="exnote" value="${esc(f.note)}" placeholder="Техніка, темп, дихання"></label>
    <div class="inline" style="margin-top:12px"><button class="btn" style="flex:1" data-act="exsave">${f.id ? 'Зберегти' : 'Додати вправу'}</button>${f.id ? '<button class="ghost" data-act="excancel">Скасувати</button>' : ''}</div></div>
    <div class="card"><h2>Бібліотека вправ</h2><input type="search" style="margin-top:8px" data-in="exq" value="${esc(S.exq)}" placeholder="Пошук вправи" aria-label="Пошук вправи">
    <div class="opts" style="margin-top:10px"><button data-act="exgf" data-g="" aria-pressed="${!S.exgf}">Усі</button>${GROUPS.map(g => `<button data-act="exgf" data-g="${g}" aria-pressed="${S.exgf === g}">${g}</button>`).join('')}</div>
    <div id="exlist">${groups || '<p class="muted sm" style="margin-top:12px">Нічого не знайдено.</p>'}</div></div>`;
}

function programsListHTML() {
  const list = S.programs.map(p => `<button class="row" data-act="pgsel" data-id="${p.id}"><span><b>${esc(p.name)}</b></span><span class="muted">›</span></button>`).join('');
  return `<button class="btn" data-act="pgnew">+ Нова програма</button><div class="card"><h2>Програми</h2>${list || '<p class="muted">Програм ще немає.</p>'}
    <p class="muted sm" style="margin-top:10px">Призначити програму клієнту можна в картці клієнта.</p></div>`;
}
function exOptions(sel) {
  return GROUPS.map(g => { const l = S.exercises.filter(e => e.muscle_group === g); return l.length ? `<optgroup label="${g}">${l.map(e => `<option value="${e.id}"${e.id === sel ? ' selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>` : ''; }).join('');
}
function builderHTML() {
  const pb = S.pb;
  const wks = pb.wks.map((w, wi) => {
    const rows = w.items.map((it, i) => `<div class="itrow"><select data-in="iex" data-w="${w.id}" data-i="${i}" aria-label="Вправа">${exOptions(it.ex)}</select>
      <label class="unit"><input type="number" min="1" data-in="isets" data-w="${w.id}" data-i="${i}" value="${it.sets}" aria-label="Підходи"><span>підх.</span></label>
      <label class="unit"><input type="number" min="1" data-in="ireps" data-w="${w.id}" data-i="${i}" value="${it.reps}" aria-label="Повторення"><span>повт.</span></label>
      <label class="unit"><input type="number" min="0" step="0.5" data-in="ikg" data-w="${w.id}" data-i="${i}" value="${it.kg}" aria-label="Вага"><span>кг</span></label>
      <div class="mv"><button class="x" data-act="itup" data-w="${w.id}" data-i="${i}" aria-label="Вгору">↑</button><button class="x" data-act="itdn" data-w="${w.id}" data-i="${i}" aria-label="Вниз">↓</button><button class="x" data-act="itdel" data-w="${w.id}" data-i="${i}" aria-label="Прибрати">×</button></div></div>`).join('');
    return `<div class="wk"><div class="inline"><input type="text" style="flex:1" data-in="wname" data-w="${w.id}" value="${esc(w.name)}" aria-label="Назва тренування">
      <button class="x" data-act="wkup" data-w="${w.id}" aria-label="Тренування вгору"${wi === 0 ? ' disabled' : ''}>↑</button><button class="x" data-act="wkdn" data-w="${w.id}" aria-label="Тренування вниз"${wi === pb.wks.length - 1 ? ' disabled' : ''}>↓</button>
      ${pb.wks.length > 1 ? `<button class="btn sm alt" data-act="wkdel" data-w="${w.id}">Видалити день</button>` : ''}</div>
      ${rows || '<p class="muted sm" style="margin-top:10px">Додай першу вправу.</p>'}
      <div class="inline" style="margin-top:12px"><select data-in="addex" data-w="${w.id}" aria-label="Вправа для додавання">${exOptions(S.addEx && S.addEx[w.id])}</select><button class="btn sm" data-act="itadd" data-w="${w.id}">Додати вправу</button></div></div>`;
  }).join('');
  return `<button class="back" data-act="back">‹ Усі програми</button>
    <div class="card" style="margin-top:0"><label class="field" style="margin-top:0"><span>Назва програми</span><input type="text" data-in="pname" value="${esc(pb.name)}"></label>
    <div class="saved" id="savedInd" style="margin-top:6px">${esc(S.ind)}</div>
    <p class="muted sm" style="margin-top:6px">Програма складається з тренувань (днів). Клієнт проходить їх по черзі.</p>${wks}
    <button class="btn alt" style="margin-top:14px" data-act="wkadd">+ Додати тренування (день)</button></div>`;
}

/* ---------- конструктор програм: збереження ---------- */
const timers = {};
function setInd(t) { S.ind = t; const el = document.getElementById('savedInd'); if (el) el.textContent = t; }
function later(key, fn) {
  clearTimeout(timers[key]); setInd('Зберігаю…');
  timers[key] = setTimeout(async () => { try { await fn(); setInd('Збережено'); } catch (e) { console.error(e); setInd(''); toast(errMsg(e)); } }, 600);
}
async function saveWk(w, idx) {
  await one(sb.from('program_workouts').update({ name: w.name, position: idx }).eq('id', w.id));
  await one(sb.from('workout_items').delete().eq('workout_id', w.id));
  if (w.items.length) await one(sb.from('workout_items').insert(w.items.map((it, i) => ({ workout_id: w.id, position: i, exercise_id: it.ex, sets: it.sets, reps: it.reps, weight_kg: it.kg }))));
}
async function savePositions() { for (let i = 0; i < S.pb.wks.length; i++) await one(sb.from('program_workouts').update({ position: i }).eq('id', S.pb.wks[i].id)); }
async function openProgram(id) {
  const p = S.programs.find(x => x.id === id);
  const wks = await one(sb.from('program_workouts').select('*').eq('program_id', id).order('position'));
  const ids = wks.map(w => w.id);
  const items = ids.length ? await one(sb.from('workout_items').select('*').in('workout_id', ids).order('position')) : [];
  S.addEx = {};
  S.pb = { id: id, name: p.name, wks: wks.map(w => ({ id: w.id, name: w.name, items: items.filter(i => i.workout_id === w.id).sort((a, b) => a.position - b.position).map(i => ({ ex: i.exercise_id, sets: i.sets, reps: i.reps, kg: Number(i.weight_kg) })) })) };
  S.ind = '';
}
const findWk = id => (S.pb ? S.pb.wks.find(w => w.id === id) : null);

/* =====================================================================
   Рендер
   ===================================================================== */
function box(inner) { return `<div class="center"><div class="box">${inner}</div></div>`; }
function render(top) {
  let html = '';
  if (S.mode === 'loading') html = box('<div class="spinner"></div><p class="muted">Завантаження…</p>');
  else if (S.mode === 'nottg') html = box(`<h1>SashaFit</h1><p class="muted">Відкрий застосунок через Telegram-бота свого тренера.</p><p style="margin-top:14px"><a href="?demo=client">Переглянути демо</a></p>`);
  else if (S.mode === 'noinvite') html = box(`<h1>Потрібне запрошення</h1><p class="muted">${esc(S.err || 'Попроси в тренера персональне посилання-запрошення.')}</p>`);
  else if (S.mode === 'error') { const em = S.err ? (S.err.message || S.err.code || String(S.err)) : ''; html = box(`<h1>Не вдалося відкрити</h1><p class="muted">Перевір інтернет і спробуй ще раз.</p><p class="muted sm" style="margin-top:12px;word-break:break-word">Деталі (покажи тренеру або розробнику): ${esc(S.stage || '')} · ${esc(em)}${S.err && S.err.code ? ' [' + esc(S.err.code) + ']' : ''}</p><button class="btn" style="margin-top:14px" data-act="retry">Спробувати ще</button>`); }
  else html = (DEMO ? '<div class="demo">Демо-режим · <a href="?demo=client">Клієнт</a> · <a href="?demo=coach">Тренер</a></div>' : '') + (S.role === 'coach' ? coachHTML() : clientHTML());
  app.innerHTML = html;
  hydrateImages(); syncBack();
  if (top && typeof window.scrollTo === 'function') window.scrollTo(0, 0);
}
async function hydrateImages() {
  if (!sb || typeof app.querySelectorAll !== 'function') return;
  const imgs = app.querySelectorAll('img[data-path]');
  for (let i = 0; i < imgs.length; i++) {
    const img = imgs[i], path = img.dataset.path;
    if (S.urlCache[path]) { img.src = S.urlCache[path]; continue; }
    try {
      const r = await sb.storage.from('progress-photos').createSignedUrl(path, 3600);
      if (r.data && r.data.signedUrl) { S.urlCache[path] = r.data.signedUrl; img.src = r.data.signedUrl; }
    } catch (e) { /* ігноруємо */ }
  }
}

/* =====================================================================
   Дії
   ===================================================================== */
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(() => toast('Посилання скопійовано')).catch(() => toast(text));
  toast(text); return Promise.resolve();
}
const monthsAdd = (from, m) => addMonthsISO(from && from > todayISO() ? from : todayISO(), m);

document.addEventListener('click', e => {
  const b = e.target.closest ? e.target.closest('[data-act]') : null;
  if (!b) return;
  const ds = b.dataset, a = ds.act, id = ds.id;
  switch (a) {
    case 'retry': location.reload(); break;
    /* --- клієнт --- */
    case 'tab': run(async () => { S.tab = ds.tab; S.add = null; if (S.tab === 'today' || S.tab === 'food') { await refreshClient(); await loadEntries(); } if (S.tab === 'check') await loadCheckins(); if (S.tab === 'prog') { await loadCheckins(); await loadSessions(); await refreshMe(); await loadProgressExtras(); } }); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break;
    case 'tick': { const L = getSet(ds.k); L.done = !L.done; S.finished = false; const w = curWorkout(); if (w) saveDraft(w); hap(); render(); break; }
    case 'finish': run(finishWorkout); break;
    case 'hist': {
      S.histOpen[id] = !S.histOpen[id]; render();
      if (S.histOpen[id] && !S.setLogs[id]) run(async () => { S.setLogs[id] = await one(sb.from('set_logs').select('*').eq('session_id', id).order('set_no', { ascending: true })); });
      break;
    }
    case 'pf': S.pf[ds.f] = ds.v; hap(); render(); break;
    case 'pfedit': S.pfEdit = true; S.pf = pfFromIntake(S.intake); render(); break;
    case 'pfsave': run(saveIntake); break;
    case 'addopen': S.add = newAdd(ds.m); render(); run(loadRecents); break;
    case 'addclose': S.add = null; render(); break;
    case 'addmode': S.add.custom = ds.v === 'custom'; render(); break;
    case 'pickfood': { const f = S.add.results.concat(S.add.off, S.recents).find(x => x.id === ds.fid); if (f) { S.add.food = f; S.add.grams = String(f.default_g); } render(); break; }
    case 'offsearch': case 'offbarcode': doOff(a, false); break;
    case 'unpick': S.add.food = null; S.add.grams = ''; render(); break;
    case 'addfood': {
      const ad = S.add, g = num(ad.grams);
      if (!ad.food || !(g > 0)) { toast('Обери продукт і вкажи вагу в грамах'); break; }
      run(async () => { await addEntry(ad.meal, ad.food, g); S.add = null; hap('success'); }, 'Додано в щоденник'); break;
    }
    case 'addcustom': {
      const ad = S.add, cf = ad.cf, g = num(cf.g);
      if (!cf.n.trim() || cf.k === '' || !(g > 0)) { toast('Вкажи назву, калорії на 100 г і вагу порції'); break; }
      run(async () => {
        const food = await one(sb.from('foods').insert({ name: cf.n.trim(), kcal_100: num(cf.k), protein_100: num(cf.p), fat_100: num(cf.f), carbs_100: num(cf.c), default_g: r0(g), source: 'custom', owner_client_id: S.me.id }).select().single());
        await addEntry(ad.meal, food, g); S.add = null; hap('success');
      }, 'Продукт збережено й додано'); break;
    }
    case 'delent': run(async () => { await one(sb.from('food_entries').delete().eq('id', id)); await loadEntries(); }); break;
    case 'fdate': run(async () => { S.foodDate = addDaysISO(S.foodDate, +ds.n); S.add = null; await loadEntries(); }); break;
    case 'mood': S.form.mood = +ds.v; S.form.touched = true; render(); break;
    case 'pickphoto': { const el = document.getElementById('ph' + ds.i); if (el) el.click(); break; }
    case 'editci': S.editCi = true; S.form = newForm(); render(); break;
    case 'submit': run(submitCheckin); break;
    /* --- тренер --- */
    case 'ctab': run(async () => { S.ctab = ds.tab; S.pb = null; S.detailId = null; S.d = null; if (S.ctab === 'overview' || S.ctab === 'clients') await reloadCoachLists(); if (S.ctab === 'foods') { if (!S.fd) S.fd = newFd(); await loadFoodsAdmin(); } }); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break;
    case 'remind': run(async () => { await remind(id, ds.kind); hap('success'); }, 'Нагадування збережено'); break;
    case 'open': run(async () => { S.ctab = 'clients'; await openClient(id, ds.tab || 'checkin'); }); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break;
    case 'sel': run(async () => { await openClient(id, S.dtab || 'checkin'); }); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break;
    case 'back': goBack(); break;
    case 'dtab': S.dtab = ds.tab; S.pickProg = null; render(); break;
    case 'auto': run(async () => { const k = ds.k, v = !S.settings[k]; await one(sb.from('coach_settings').update({ [k]: v }).eq('id', true)); S.settings[k] = v; hap(); }); break;
    case 'newclient': S.nc = { name: '', goal: '', tariff: '', sub_start: todayISO(), sub_end: addMonthsISO(todayISO(), 1), kcal: '2000', p: '100', f: '60', c: '220' }; S.newClient = null; render(); break;
    case 'cancelnc': S.nc = null; render(); break;
    case 'createclient': {
      const n = S.nc;
      if (!n.name.trim()) { toast('Вкажи імʼя клієнта'); break; }
      run(async () => {
        const row = await one(sb.from('clients').insert({ name: n.name.trim(), goal: n.goal.trim() || null, tariff: n.tariff.trim() || null, sub_start: n.sub_start || null, sub_end: n.sub_end || null,
          norm_kcal: r0(num(n.kcal)) || 2000, norm_protein: r0(num(n.p)) || 100, norm_fat: r0(num(n.f)) || 60, norm_carbs: r0(num(n.c)) || 220 }).select().single());
        S.newClient = row; S.nc = null; await reloadCoachLists(); hap('success');
      }); break;
    }
    case 'copyinv': { const c = S.clients.find(x => x.id === id) || S.newClient; if (c) copyText(inviteLink(c)); break; }
    case 'cesave': run(async () => {
      const c = S.d.c, e = S.d.edit || { name: c.name, goal: c.goal || '' };
      if (!e.name.trim()) { toast('Вкажи імʼя'); return; }
      await one(sb.from('clients').update({ name: e.name.trim(), goal: e.goal.trim() || null }).eq('id', c.id));
      await refreshDetail(); toast('Збережено');
    }); break;
    case 'assign': run(async () => {
      const c = S.d.c, v = S.pickProg || c.program_id;
      if (!v) { toast('Спочатку створи програму'); return; }
      await one(sb.from('clients').update({ program_id: v, next_workout: 0 }).eq('id', c.id));
      const p = S.programs.find(x => x.id === v); await refreshDetail(); S.pickProg = null; toast('Програму «' + (p ? p.name : '') + '» призначено');
    }); break;
    case 'chist': {
      S.d.open[id] = !S.d.open[id]; render();
      if (S.d.open[id] && !S.d.logs[id]) run(async () => { S.d.logs[id] = await one(sb.from('set_logs').select('*').eq('session_id', id).order('set_no', { ascending: true })); });
      break;
    }
    case 'cfdate': run(async () => { S.d.date = addDaysISO(S.d.date, +ds.n); await loadDetailEntries(); }); break;
    case 'normsave': run(async () => {
      const v = S.d.norm; if (!v) { toast('Норму не змінено'); return; }
      await one(sb.from('clients').update({ norm_kcal: r0(num(v.kcal)), norm_protein: r0(num(v.p)), norm_fat: r0(num(v.f)), norm_carbs: r0(num(v.c)) }).eq('id', S.d.c.id));
      await refreshDetail(); toast('Норму збережено');
    }); break;
    case 'sendfb': run(async () => {
      const text = (S.d.fb !== null ? S.d.fb : '').trim();
      const cur = S.d.checkins.slice().reverse().find(k => k.id === id);
      const value = S.d.fb !== null ? text : (cur && cur.coach_feedback) || '';
      if (!value) { toast('Напиши кілька слів відгуку'); return; }
      await one(sb.from('checkins').update({ coach_feedback: value, feedback_at: new Date().toISOString() }).eq('id', id));
      await refreshDetail(); hap('success'); toast('Відгук надіслано');
    }); break;
    case 'subsave': run(async () => {
      const v = S.d.sub; if (!v) { toast('Змін немає'); return; }
      await one(sb.from('clients').update({ tariff: v.tariff.trim() || null, sub_start: v.sub_start || null, sub_end: v.sub_end || null }).eq('id', S.d.c.id));
      await refreshDetail(); toast('Збережено');
    }); break;
    case 'pay': run(async () => {
      const c = S.d.c, m = Math.max(1, r0(num(S.payMonths || '1')) || 1), amount = S.payAmount ? num(S.payAmount) : null;
      const newEnd = monthsAdd(c.sub_end, m);
      await one(sb.from('payments').insert({ client_id: c.id, months: m, amount: amount, paid_on: todayISO() }));
      await one(sb.from('clients').update({ sub_end: newEnd, sub_start: c.sub_start || todayISO() }).eq('id', c.id));
      S.payMonths = '1'; S.payAmount = ''; await refreshDetail(); hap('success'); toast('Оплату відмічено. Підписка до ' + fmtDate(newEnd));
    }); break;
    /* --- продукти --- */
    case 'fdsave': {
      const f = S.fd.f;
      if (!f.name.trim()) { toast('Вкажи назву продукту'); break; }
      if (f.k === '' || num(f.k) < 0) { toast('Вкажи калорії на 100 г'); break; }
      run(async () => {
        const row = { name: f.name.trim(), kcal_100: num(f.k), protein_100: num(f.p), fat_100: num(f.f), carbs_100: num(f.c), default_g: r0(num(f.g)) || 100 };
        if (f.id) await one(sb.from('foods').update(row).eq('id', f.id));
        else await one(sb.from('foods').insert(Object.assign({ source: 'coach', owner_client_id: null }, row)));
        S.fd.f = newFd().f; await loadFoodsAdmin(); hap('success');
      }, f.id ? 'Збережено' : 'Продукт додано'); break;
    }
    case 'fdedit': { const x = S.fd.list.find(v => v.id === id); if (x) S.fd.f = { id: x.id, name: x.name, k: String(x.kcal_100), p: String(x.protein_100), f: String(x.fat_100), c: String(x.carbs_100), g: String(x.default_g) }; render(); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break; }
    case 'fdcancel': S.fd.f = newFd().f; render(); break;
    case 'fddel': {
      const x = S.fd.list.find(v => v.id === id); if (!x) break;
      if (typeof confirm === 'function' && !confirm('Видалити «' + x.name + '» зі спільної бази?')) break;
      run(async () => { await one(sb.from('foods').delete().eq('id', id)); await loadFoodsAdmin(); }, 'Продукт видалено'); break;
    }
    /* --- вправи --- */
    case 'exsave': {
      const f = S.exf;
      if (!f.name.trim()) { toast('Вкажи назву вправи'); break; }
      if (f.video.trim() && !isUrl(f.video.trim())) { toast('Посилання має починатися з http:// або https://'); break; }
      run(async () => {
        const row = { name: f.name.trim(), muscle_group: f.group, video_url: f.video.trim() || null, note: f.note.trim() || null };
        if (f.id) await one(sb.from('exercises').update(row).eq('id', f.id)); else await one(sb.from('exercises').insert(row));
        S.exercises = await one(sb.from('exercises').select('*').order('name', { ascending: true }));
        S.exf = { id: null, name: '', group: f.group, video: '', note: '' }; hap('success');
      }, f.id ? 'Збережено' : 'Вправу додано'); break;
    }
    case 'exedit': { const x = S.exercises.find(v => v.id === id); if (x) S.exf = { id: x.id, name: x.name, group: x.muscle_group, video: x.video_url || '', note: x.note || '' }; render(); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break; }
    case 'excancel': S.exf = { id: null, name: '', group: 'Ноги', video: '', note: '' }; render(); break;
    case 'exdel': {
      const x = S.exercises.find(v => v.id === id);
      if (!x) break;
      if (typeof confirm === 'function' && !confirm('Видалити вправу «' + x.name + '»?')) break;
      run(async () => { await one(sb.from('exercises').delete().eq('id', id)); S.exercises = S.exercises.filter(v => v.id !== id); }, 'Вправу видалено'); break;
    }
    case 'exgf': S.exgf = ds.g || ''; render(); break;
    /* --- програми --- */
    case 'pgsel': run(async () => { await openProgram(id); }); if (typeof window.scrollTo === 'function') window.scrollTo(0, 0); break;
    case 'pgnew': run(async () => {
      const p = await one(sb.from('programs').insert({ name: 'Нова програма' }).select().single());
      await one(sb.from('program_workouts').insert({ program_id: p.id, position: 0, name: 'Тренування 1' }));
      S.programs = await one(sb.from('programs').select('*').order('created_at', { ascending: true })); await openProgram(p.id);
    }); break;
    case 'wkadd': run(async () => {
      const w = await one(sb.from('program_workouts').insert({ program_id: S.pb.id, position: S.pb.wks.length, name: 'Тренування ' + (S.pb.wks.length + 1) }).select().single());
      S.pb.wks.push({ id: w.id, name: w.name, items: [] });
    }); break;
    case 'wkdel': {
      if (typeof confirm === 'function' && !confirm('Видалити це тренування?')) break;
      run(async () => { await one(sb.from('program_workouts').delete().eq('id', ds.w)); S.pb.wks = S.pb.wks.filter(w => w.id !== ds.w); await savePositions(); }); break;
    }
    case 'wkup': case 'wkdn': run(async () => {
      const i = S.pb.wks.findIndex(w => w.id === ds.w), j = a === 'wkup' ? i - 1 : i + 1;
      if (j < 0 || j >= S.pb.wks.length) return;
      const t = S.pb.wks[i]; S.pb.wks[i] = S.pb.wks[j]; S.pb.wks[j] = t; await savePositions();
    }); break;
    case 'itadd': { const w = findWk(ds.w); if (!w || !S.exercises.length) { toast('Спочатку додай вправи в бібліотеку'); break; } const ex = (S.addEx && S.addEx[ds.w]) || S.exercises[0].id; w.items.push({ ex: ex, sets: 3, reps: 10, kg: 0 }); render(); later(ds.w, () => saveWk(w, S.pb.wks.indexOf(w))); break; }
    case 'itdel': { const w = findWk(ds.w); if (!w) break; w.items.splice(+ds.i, 1); render(); later(ds.w, () => saveWk(w, S.pb.wks.indexOf(w))); break; }
    case 'itup': case 'itdn': {
      const w = findWk(ds.w); if (!w) break;
      const i = +ds.i, j = a === 'itup' ? i - 1 : i + 1;
      if (j < 0 || j >= w.items.length) break;
      const t = w.items[i]; w.items[i] = w.items[j]; w.items[j] = t; render(); later(ds.w, () => saveWk(w, S.pb.wks.indexOf(w))); break;
    }
  }
});

document.addEventListener('input', e => {
  const t = e.target, f = t.dataset ? t.dataset.in : null;
  if (!f) return;
  if (f === 'kg' || f === 'reps') { getSet(t.dataset.k)[f] = t.value; const w = curWorkout(); if (w) saveDraft(w); }
  else if (f === 'w' || f === 'waist' || f === 'hips') { S.form[f] = t.value; S.form.touched = true; }
  else if (f === 'comment') { S.form.comment = t.value; S.form.touched = true; }
  else if (f.indexOf('pf_') === 0) S.pf[f.slice(3)] = t.value;
  else if (f === 'q') {
    S.add.q = t.value; S.add.off = []; S.add.offErr = ''; clearTimeout(searchTimer); clearTimeout(offTimer);
    searchTimer = setTimeout(async () => {
      try { S.add.results = await searchFoods(S.add.q); } catch (err) { S.add.results = []; }
      const r = document.getElementById('results'); if (r) r.innerHTML = resultsHTML();
      // Якщо у своїй базі майже нічого немає, автоматично шукаємо в Open Food Facts
      const q = S.add.q.trim(); clearTimeout(offTimer);
      if (S.add.results.length < 3 && q.length >= 3 && !/^\d{8,14}$/.test(q)) offTimer = setTimeout(() => { if (S.add && !S.add.food && S.add.q.trim() === q && !S.add.off.length) doOff('offsearch', true); }, 500);
    }, 250);
    const r = document.getElementById('results'); if (r && S.add.q.trim().length < 2) r.innerHTML = resultsHTML();
  }
  else if (f === 'grams') { S.add.grams = t.value; const pv = document.getElementById('pvals'); if (pv) pv.innerHTML = pvalsHTML(); }
  else if (f.indexOf('cf_') === 0) S.add.cf[f.slice(3)] = t.value;
  else if (f.indexOf('nc_') === 0) S.nc[f.slice(3)] = t.value;
  else if (f === 'pick') S.pickProg = t.value;
  else if (f === 'ce_name' || f === 'ce_goal') { if (!S.d.edit) S.d.edit = { name: S.d.c.name, goal: S.d.c.goal || '' }; S.d.edit[f.slice(3)] = t.value; }
  else if (f === 'slpick') {
    const sc = t.dataset.scope; if (sc === 'd') S.d.slPick = t.value; else S.slPick = t.value;
    const box = document.getElementById('slbox'); if (box) box.innerHTML = strengthBoxHTML(sc === 'd' ? S.d.sl : S.sl, t.value);
  }
  else if (f === 'fb') S.d.fb = t.value;
  else if (f === 'norm') { const c = S.d.c; if (!S.d.norm) S.d.norm = { kcal: c.norm_kcal, p: c.norm_protein, f: c.norm_fat, c: c.norm_carbs }; S.d.norm[t.dataset.k] = t.value; }
  else if (f === 'sub_tariff' || f === 'sub_start' || f === 'sub_end') { const c = S.d.c; if (!S.d.sub) S.d.sub = { tariff: c.tariff || '', sub_start: c.sub_start || '', sub_end: c.sub_end || '' }; S.d.sub[f === 'sub_tariff' ? 'tariff' : f] = t.value; }
  else if (f === 'pay_months') S.payMonths = t.value;
  else if (f === 'pay_amount') S.payAmount = t.value;
  else if (f.indexOf('fd_') === 0) S.fd.f[f.slice(3)] = t.value;
  else if (f === 'fdq') {
    S.fd.q = t.value; clearTimeout(fdTimer);
    fdTimer = setTimeout(async () => { try { await loadFoodsAdmin(); } catch (err) { console.error(err); } const l = document.getElementById('fdlist'); if (l) l.innerHTML = foodListHTML(); }, 300);
  }
  else if (f === 'exn') S.exf.name = t.value;
  else if (f === 'exg') S.exf.group = t.value;
  else if (f === 'exv') S.exf.video = t.value;
  else if (f === 'exnote') S.exf.note = t.value;
  else if (f === 'exq') { S.exq = t.value; const l = document.getElementById('exlist'); if (l) render(); }
  else if (f === 'pname') { if (S.pb) { S.pb.name = t.value; const p = S.programs.find(x => x.id === S.pb.id); if (p) p.name = t.value; later('pname', () => one(sb.from('programs').update({ name: S.pb.name }).eq('id', S.pb.id))); } }
  else if (f === 'wname') { const w = findWk(t.dataset.w); if (w) { w.name = t.value; later(w.id, () => saveWk(w, S.pb.wks.indexOf(w))); } }
  else if (f === 'addex') { S.addEx = S.addEx || {}; S.addEx[t.dataset.w] = t.value; }
  else if (f === 'iex' || f === 'isets' || f === 'ireps' || f === 'ikg') {
    const w = findWk(t.dataset.w), it = w && w.items[+t.dataset.i]; if (!it) return;
    if (f === 'iex') it.ex = t.value; else if (f === 'isets') it.sets = Math.max(1, r0(num(t.value)) || 1); else if (f === 'ireps') it.reps = Math.max(1, r0(num(t.value)) || 1); else it.kg = num(t.value);
    later(w.id, () => saveWk(w, S.pb.wks.indexOf(w)));
  }
});

document.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset && t.dataset.in === 'photo') {
    const i = +t.dataset.i, file = t.files && t.files[0];
    if (!file) return;
    try { const blob = await compress(file); S.form.photos[i] = { blob: blob, url: URL.createObjectURL(blob) }; S.form.touched = true; render(); }
    catch (err) { toast('Не вдалося обробити фото'); }
  }
});

/* =====================================================================
   Старт
   ===================================================================== */
async function realAuth() {
  // Функція входу зазвичай називається telegram-auth, але Supabase міг дати їй іншу назву (наприклад dynamic-task).
  // Неіснуюча функція для браузера виглядає як помилка мережі, тому пробуємо наступну назву і при 404, і при збої запиту.
  const names = [CFG.AUTH_FUNCTION, 'telegram-auth', 'dynamic-task'].filter(Boolean);
  let r = null, lastErr = null;
  for (let i = 0; i < names.length; i++) {
    try {
      r = await fetch(CFG.SUPABASE_URL + '/functions/v1/' + names[i], {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY },
        body: JSON.stringify({ initData: tg.initData })
      });
      lastErr = null;
      if (r.status !== 404) break;
    } catch (e) { lastErr = e; r = null; }
  }
  if (!r) throw new Error('немає звʼязку з функцією входу (' + (lastErr && lastErr.message ? lastErr.message : lastErr) + '). Перевірені назви: ' + names.join(', '));
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token_hash) throw new Error('функція входу відповіла ' + r.status + ': ' + (j.error || j.message || j.msg || j.code || 'без пояснення'));
  S.stage = 'session';
  const res = await sb.auth.verifyOtp({ token_hash: j.token_hash, type: 'magiclink' });
  if (res.error) throw new Error('не вдалося створити сесію: ' + res.error.message);
  S.uid = res.data.user.id; S.role = j.role;
}
async function loadMe() {
  let me = await one(sb.from('clients').select('*').eq('profile_id', S.uid).maybeSingle());
  if (!me) {
    const code = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (code) {
      const r = await sb.rpc('claim_invite', { code: code });
      if (r.error) { S.err = 'Це посилання-запрошення вже використано або недійсне. Попроси в тренера нове.'; return null; }
      me = await one(sb.from('clients').select('*').eq('profile_id', S.uid).maybeSingle());
    }
  }
  return me;
}
async function boot() {
  initTelegram(); render();
  try {
    if (DEMO) {
      S.stage = 'demo';
      sb = window.createDemoClient(); S.role = params.get('demo') === 'coach' ? 'coach' : 'client';
      if (S.role === 'client') S.me = await one(sb.from('clients').select('*').eq('id', sb.__meId).maybeSingle());
    } else if (!tg || !tg.initData) {
      S.mode = 'nottg'; return render();
    } else {
      S.stage = 'налаштування';
      if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_URL.indexOf('ТВІЙ') !== -1) throw new Error('у config.js не заповнено адресу або ключ Supabase');
      if (!window.supabase || !window.supabase.createClient) throw new Error('не завантажилась бібліотека Supabase');
      CFG.SUPABASE_URL = CFG.SUPABASE_URL.replace(/\/+$/, '').replace(/\/rest\/v1$/, '');
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
      S.stage = 'вхід';
      await realAuth();
      S.stage = 'профіль';
      if (S.role === 'client') { S.me = await loadMe(); if (!S.me) { S.mode = 'noinvite'; return render(); } }
    }
    S.stage = 'завантаження даних';
    if (S.role === 'client') await loadClientData(); else await loadCoach();
    S.mode = 'app';
  } catch (e) { console.error(e); S.mode = 'error'; S.err = e; }
  render();
}
boot();
})();
