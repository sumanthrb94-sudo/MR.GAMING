/* MR. Console (/admin): the manager's screens for MR. Gaming and MR. Sandwich, one at a time.
   Orders      new website bookings and MR. Sandwich food orders pop up (sheet, optional chime, browser notification,
               "(2)" in the tab title); bookings: Seen / Arrived / Done / No-show / Cancel; food orders (admin-shop.js):
               accept → preparing → out for delivery / ready → delivered / picked up, or cancel with a reason.
               Summary numbers at the top, all from the database.
   Bills       (admin-shop.js) "Bill" on every food order, booking, birthday, pass and meal plan; today's takings by
               kind and by cash / UPI / card, from the bills; CSV for any dates.
   Schedule    each day's grid per console (block / free hours) and that day's bookings.
   Passes      gaming passes and MR. Sandwich meal plans: add, use hours or meals, send the link.
   Birthdays   upcoming parties (station 'party') and "Add a birthday".
   Menu        today's price, "Sold out today" and "Hide" per item, saved in /menuOverrides (read by /menu, home, booking).
   Stock       expired, expiring in 3 days and running low, worked out like stock.js; the full stock page is /stock.
   Customers   the profiles customers save after their first sign-in (users/{uid}: name, verified number, email,
               WhatsApp opt-in), searchable; opening one reads their bookings and food orders (one query each).
               Bookings and food orders show the profile's name when the customer has one.
   Settings    (admin-shop.js) the shop location for delivery, the free-delivery radius, delivery on/off, GSTIN and GST.
   Access is enforced by firestore.rules (owner = signed-in user listed in /admins).
   Owners log in on /pass like everyone else; it sees their /admins entry and opens this page.
   Reads use Firestore Lite (plain HTTPS, no live listeners). A tiny "anything new?" query (requests created after the
   newest one we have, usually 0 documents) runs every 6 s while the page is on screen and every 30 s in a background tab,
   so a website booking pops up within about 10 s without re-reading every booking. The full lists re-read on slower
   timers, when the page comes back into view, and right after any change made here. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, signOut, onAuthStateChanged,
  getFirestore, collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch,
  runTransaction, serverTimestamp, Timestamp, increment
} from '/assets/vendor/firebase-account.0e285128.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';
import { initShop } from '/assets/js/admin-shop.js';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }), db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const pad = (n) => String(n).padStart(2, '0');
const clock = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const OPEN = 11, CLOSE = 23, PASS = { solo: { price: 899, label: 'Solo pass' }, duo: { price: 1499, label: 'Duo pass' } };
const MEALS = { days: 30, plans: [{ meals: 5, price: 1350 }, { meals: 8, price: 2040 }, { meals: 10, price: 2400 }] };   // same as MENU.mealPlans in menu-data.js
const MEMBER = { solo: 169, duo: 279 };   // member rate once a pass's hours are used (CONFIG.memberRates in main.js)
// Two controllers per console: one console takes 1-2 players; 3-4 players take the whole room (both consoles), 2 hours or more
const RATES = { solo: 199, duo: 320 }, KIND = { 1: 'solo', 2: 'duo' }, SQUAD = { 2: ['solo', 'solo'], 3: ['duo', 'solo'], 4: ['duo', 'duo'] }, SQUAD_MIN = 2;   // same as CONFIG in main.js
const STALE_MS = 3 * 60 * 60 * 1000, DAY_MS = 24 * 60 * 60 * 1000;   // old 'pending' holds stop counting after 3 hours (firestore.rules); 'booked' never do
const NAMES = { ps5: 'PS5', xbox: 'Xbox', squad: 'Whole room', party: 'Birthday party' };
const BDAY = { perChild: 675, perAdult: 399, hours: 3, minGuests: 10, roomMax: 15, advance: 4000, cancelFee: 1000 };   // same as CONFIG.birthday in main.js
const LIVE = ['booked', 'pending', 'confirmed'];   // still going ahead
const nowIst = () => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); };
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const dayName = (key) => dateOf(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const todayIst = () => keyOf(nowIst());
const timeOf = (ts) => { if (!ts?.toMillis) return ''; const d = new Date(ts.toMillis() + 330 * 60000), h = d.getUTCHours(); return `${h % 12 || 12}:${pad(d.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`; };
const show = (id) => ['login', 'denied', 'dash'].forEach((x) => { $('#' + x).hidden = x !== id; });
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }, del(k) { try { localStorage.removeItem(k); } catch (e) {} } };

/* ---------- sign in happens on /pass (one login for everyone); it sends owners here ---------- */
// Signing out here signs this browser out of the customer pages too (their top bar reads mg-auth / mg-profile)
$('#signout').addEventListener('click', () => { ['mg-auth', 'mg-profile', 'mg-name', 'mg-phone'].forEach((k) => store.del(k)); signOut(auth); });

/* ---------- reads: Firestore Lite has no live listeners, so each list re-reads on a timer ---------- */
const watchers = new Set();
// Runs the query now, then every `every` ms while the page is on screen (`hidden` ms in a background tab; 0 = not then),
// only while `when()` is true (e.g. its screen is open), and on refreshAll(). `q` may be a function, so a query that
// names today's date is rebuilt after midnight. A reply that arrives after a newer one, or after unwatching, is ignored.
function watch(q, cb, { every = 20000, hidden = 0, when = () => true } = {}) {
  const w = { seq: 0, done: 0, at: 0, when, run() {
    const n = ++w.seq; w.at = Date.now();
    return getDocs(typeof q === 'function' ? q() : q).then((s) => { if (watchers.has(w) && n > w.done) { w.done = n; online(true); cb(s); } })
      .catch((e) => { console.warn('read failed', e.code || e); online(false); });
  } };
  w.due = () => w.when() && (document.visibilityState === 'visible' ? Date.now() - w.at >= every - 500 : hidden && Date.now() - w.at >= hidden - 500);
  watchers.add(w); if (when()) w.run();
  return w;
}
const refreshAll = () => watchers.forEach((w) => { if (w.when()) w.run(); });
setInterval(() => watchers.forEach((w) => { if (w.due()) w.run(); }), 2000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
window.addEventListener('focus', refreshAll);
let lastOk = 0;
function online(ok) {
  $('#offline').hidden = ok;
  if (ok) lastOk = Date.now();
  const live = $('#live'); live.hidden = false;
  live.classList.toggle('is-off', !ok);
  live.textContent = ok ? 'Live' : 'Offline';
  live.title = lastOk ? `Last checked ${new Date(lastOk).toLocaleTimeString('en-IN')}` : '';
}

// This device signed in as an owner before: show the console straight away (data follows; the rules still decide)
const OWNER_KEY = 'mg-owner';
let knownOwner = store.get(OWNER_KEY), started = false, me = '';
const stopAll = () => { watchers.clear(); started = false; menuReady = null; };
const begin = () => { if (!started) { started = true; show('dash'); startConsole(); } };
if (knownOwner) queueMicrotask(begin);   // after this file has finished setting up (the console code is further down)
onAuthStateChanged(auth, async (user) => {
  $('#signout').hidden = !user; $('#who').textContent = user ? (user.phoneNumber || '') : '';
  me = user?.phoneNumber || '';
  if (!user) { stopAll(); store.del(OWNER_KEY); show('login'); location.replace('/pass'); return; }
  if (knownOwner && knownOwner !== user.uid) stopAll();
  const owner = getDoc(doc(db, 'admins', user.uid)).then((a) => a.exists()).catch(() => false);
  if (knownOwner === user.uid) begin();   // reads go out alongside the owner check (Firestore waits for the sign-in itself)
  if (!(await owner)) { stopAll(); store.del(OWNER_KEY); $('#uid').textContent = user.uid; return show('denied'); }
  store.set(OWNER_KEY, user.uid);
  begin();
});

/* ---------- screens: #orders, #schedule, #bills, #passes, #birthdays, #menu, #stock, #customers, #settings ---------- */
const VIEWS = ['orders', 'schedule', 'bills', 'passes', 'birthdays', 'menu', 'stock', 'customers', 'settings'];
let shop = null;   // admin-shop.js: food orders, bills and settings
let view = 'orders';
const isView = (v) => () => view === v;
function setView(v) {
  view = VIEWS.includes(v) ? v : 'orders';
  $$('.con-view').forEach((s) => { s.hidden = s.dataset.view !== view; });
  $$('.con-tab').forEach((a) => { const on = a.dataset.view === view; a.classList.toggle('is-active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (view === 'schedule') markDay();
  if (view === 'menu' && started) openMenu();
  if (shop) shop.viewChanged(view);
  if (started) watchers.forEach((w) => { if (w.when() && Date.now() - w.at > 3000) w.run(); });   // the screen just opened: fresh data
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', () => setView(location.hash.slice(1)));
$('#stats').addEventListener('click', (e) => {
  const a = e.target.closest('[data-jump]'); if (!a) return;
  e.preventDefault(); if (view !== 'orders') location.hash = 'orders';
  // "New orders" with only food orders new opens the food list; the rest are gaming numbers
  if (shop) shop.showOrders(a.dataset.jump === 'o-new' && !freshGaming && shop.freshFood() ? 'food' : 'gaming');
  if (a.dataset.jump === 'o-new' && $('#o-gaming').hidden) return;
  $('#' + a.dataset.jump).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});

function startConsole() {
  shop = shop || initShop({
    db, me: () => me, watch, refreshAll, toast, esc, inr, pad, clock, dayName, timeOf, istKey, todayIst, nowIst, telHref, waDigits, firstName, nameHtml,
    badge, countOf, loadScript, isView, popNew, registerPop, paintNew, NAMES, PASS, MEALS, BDAY, PLANS, KIND,
    record: { requests: (id) => orders.get(id) || dayRequests.find((x) => x.id === id), passes: (id) => (passData[id] ? { id, ...passData[id] } : null) }
  });
  $('#gear').hidden = false; $('#people').hidden = false;
  setView(location.hash.slice(1));
  shop.start();
  startDays(); watchOrders(); watchPasses(); watchStock(); watchCustomers(); fillBookingForm(); alertsUi();
  $('#bday-rules').textContent = `Party package: ${BDAY.hours} hours in the game room, ${inr(BDAY.perChild)} per child, ${inr(BDAY.perAdult)} per adult, at least ${BDAY.minGuests} guests (more than ${BDAY.roomMax} takes the whole restaurant). ${inr(BDAY.advance)} advance to confirm.`;
}

/* ---------- orders: every booking from today on ---------- */
let orders = new Map(), loaded = false, newest = 0;
const isNew = (r) => (r.status === 'booked' || r.status === 'pending') && r.ack !== true;
const createdMs = (r) => r.createdAt?.toMillis?.() || 0;
const holdIds = (r) => (r.station === 'squad' || r.station === 'party' ? ['ps5', 'xbox'] : [r.station])
  .flatMap((c) => Array.from({ length: r.hours }, (_, i) => `${r.date}_${c}_${r.start + i}`));
const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');
const waDigits = (p) => { let d = String(p || '').replace(/\D/g, '').replace(/^0/, ''); if (d.length === 10) d = '91' + d; return d.length === 12 ? d : ''; };
const firstName = (n) => String(n).trim().split(/\s+/)[0].slice(0, 20);
const waHref = (r) => `https://wa.me/${waDigits(r.phone)}?text=${encodeURIComponent(`Hi ${firstName(r.name)}, your MR. GAMING booking on ${dayName(r.date)} ${clock(r.start)} is confirmed`)}`;
const SOURCES = { owner: 'added by you', phone: 'phone call', 'walk-in': 'walk-in', whatsapp: 'WhatsApp' };
const sourceOf = (r) => SOURCES[r.source] || 'website';
const PLANS = { hourly: 'hourly', 'use-pass': 'uses pass', 'buy-pass': 'buys pass', member: 'member rate', party: 'birthday package' };
const statusText = (r) => (isNew(r) ? 'new' : r.status === 'confirmed' && r.arrivedAt ? 'playing' : r.status);

function mergeOrders(docs) {
  docs.forEach((d) => { const r = d.data(); orders.set(r.id || d.id, { ...r, id: r.id || d.id }); newest = Math.max(newest, createdMs(r)); });
}
function watchOrders() {
  // The full list: re-read every 90 s on screen (and after any change); a background tab relies on the probe below
  watch(() => query(collection(db, 'requests'), where('date', '>=', todayIst())), (s) => {
    orders = new Map(); mergeOrders(s.docs); loaded = true; renderOrders();
  }, { every: 90000 });
  // "Anything new?": requests created after the newest one we have. Usually 0 documents (billed as one read)
  watch(() => query(collection(db, 'requests'), where('createdAt', '>', Timestamp.fromMillis(newest || Date.now() - 10 * 60000))), (s) => {
    if (!loaded || s.empty) return;
    mergeOrders(s.docs.filter((d) => d.data().date >= todayIst())); renderOrders();
  }, { every: 6000, hidden: 30000, when: () => loaded });
}

function orderCard(r, { day = true } = {}) {
  const id = esc(r.id), party = r.station === 'party', live = LIVE.includes(r.status), wa = waDigits(r.phone);
  const who = party ? `${r.players} guests${r.adults ? ` (${r.players - r.adults} children + ${r.adults} adults)` : ''}${r.players > BDAY.roomMax ? ' · whole restaurant' : ''}`
    : `${r.players} player${r.players > 1 ? 's' : ''} · ${esc(PLANS[r.plan] || r.plan)}`;
  return `<li class="card admin-item status-${esc(r.status)}${isNew(r) ? ' is-new' : ''}" data-order="${id}">
    <div class="admin-item-top">
      <strong>${day ? esc(dayName(r.date)) + ' · ' : ''}${clock(r.start)} – ${clock(r.start + r.hours)}</strong>
      <span class="pill">${esc(statusText(r))}</span>
    </div>
    <p class="admin-item-name">${nameHtml(r)} <span class="dim">· ${esc(NAMES[r.station] || r.station)}</span></p>
    <p class="admin-item-meta">${who}${r.game ? ' · ' + esc(r.game) : ''}</p>
    ${r.food ? `<p class="admin-item-meta con-food">Food: ${esc(r.food)}</p>` : ''}
    <p class="admin-item-meta">${esc(sourceOf(r))}${r.createdAt?.toMillis ? ' · booked ' + esc(dayName(istKey(r.createdAt.toMillis()))) + ', ' + esc(timeOf(r.createdAt)) : ''}${r.arrivedAt ? ' · arrived ' + esc(timeOf(r.arrivedAt)) : ''} · <span class="dim">${id}</span></p>
    <div class="con-item-foot">
      <p class="admin-item-total">${inr(r.total)}</p>
      ${r.phone ? `<div class="con-contact">
        <a class="btn btn-sm btn-ghost press" href="${esc(telHref(r.phone))}"><svg class="i"><use href="#i-phone"/></svg>${esc(r.phone)}</a>
        ${r.uid ? '<span class="con-verified" title="Booked while signed in with this number (SMS code)"><svg class="i"><use href="#i-check"/></svg>verified</span>' : ''}
        ${wa ? `<a class="btn btn-sm btn-ghost press" href="${esc(waHref(r))}" target="_blank" rel="noopener"><svg class="i"><use href="#i-wa"/></svg>WhatsApp</a>` : ''}
      </div>` : ''}
    </div>
    ${live ? `<div class="admin-actions">
      ${isNew(r) ? `<button class="btn btn-sm btn-accent press" data-act="seen" data-id="${id}">Seen</button>` : ''}
      ${!r.arrivedAt ? `<button class="btn btn-sm ${isNew(r) ? 'btn-ghost' : 'btn-accent'} press" data-act="arrived" data-id="${id}">Arrived</button>` : ''}
      <button class="btn btn-sm btn-ghost press" data-act="done" data-id="${id}">Done</button>
      <button class="btn btn-sm btn-ghost press" data-act="noshow" data-id="${id}">No-show</button>
      <button class="btn btn-sm btn-ghost press con-danger" data-act="cancel" data-id="${id}">Cancel</button>
    </div>` : ''}
    ${billActs('requests', r)}
  </li>`;
}
// "Bill" (admin-shop.js) on a booking, birthday or pass that went ahead; once billed, its number opens the bill
const billActs = (col, r) => (r.status === 'cancelled' || r.status === 'no-show' ? '' : r.bill?.id
  ? `<div class="admin-actions con-billed"><a class="btn btn-sm btn-ghost press" href="/bill?id=${esc(r.bill.id)}" target="_blank" rel="noopener">Bill ${esc(r.bill.no)}</a><button class="btn btn-sm btn-ghost press" data-share-bill="${esc(col)}" data-id="${esc(r.id)}">Share bill</button></div>`
  : `<div class="admin-actions"><button class="btn btn-sm btn-ghost press" data-bill="${esc(col)}" data-id="${esc(r.id)}">Bill</button></div>`);
const byWhen = (a, b) => a.date.localeCompare(b.date) || a.start - b.start;
const fillList = (sel, rows, empty, opts) => { $(sel).innerHTML = rows.length ? rows.map((r) => orderCard(r, opts)).join('') : `<li class="admin-empty">${empty}</li>`; };
const countOf = (sel, n) => { $(sel).textContent = n ? `(${n})` : ''; };

function renderOrders() {
  const all = [...orders.values()], today = todayIst();
  const fresh = all.filter(isNew).sort((a, b) => createdMs(b) - createdMs(a));   // newest first
  const todays = all.filter((r) => r.date === today && !isNew(r)).sort(byWhen);
  const later = all.filter((r) => r.date > today && !isNew(r) && LIVE.includes(r.status) && r.station !== 'party').sort(byWhen);
  fillList('#list-new', fresh, 'No new orders. New website bookings pop up here.');
  fillList('#list-today', todays, 'Nothing else booked today.', { day: false });
  fillList('#list-up', later.slice(0, 40), 'Nothing booked after today yet.');
  countOf('#c-new', fresh.length); countOf('#c-today', todays.length); countOf('#c-up', later.length);

  // Summary: numbers only from what the database returned
  const todayLive = all.filter((r) => r.date === today && r.status !== 'cancelled');
  freshGaming = fresh.length;
  $('#st-today').textContent = todayLive.length;
  $('#st-rev').textContent = inr(todayLive.reduce((t, r) => t + (+r.total || 0), 0));
  const hr = nowIst().getHours();
  const next = all.filter((r) => LIVE.includes(r.status) && (r.date > today || r.start >= hr)).sort(byWhen)[0];
  $('#st-next').textContent = next ? `${next.date === today ? '' : dayName(next.date) + ', '}${clock(next.start)} · ${firstName(next.name)}` : 'None booked';
  paintNew();

  renderBirthdays(all);
  if (view === 'schedule') renderDayList();
  popNew('g', fresh);
}
const badge = (sel, n) => { const b = $(sel); b.hidden = !n; b.textContent = n > 99 ? '99+' : n; };
// New gaming bookings + new food orders: the stat, the tab badges and "(3)" in the browser tab
let freshGaming = 0;
function paintNew() {
  const g = freshGaming, f = shop ? shop.freshFood() : 0;
  $('#st-new').textContent = loaded ? g + f : '–';
  $('#st-new-split').textContent = f ? `${g} gaming · ${f} food` : '';
  badge('#b-orders', g + f); badge('#sw-gaming', g); badge('#sw-food', f);
  document.title = (g + f ? `(${g + f}) ` : '') + 'MR. Console';
}

// Seen / Arrived / Done / No-show / Cancel. Reads the hours from the database (not the on-screen schedule) and only
// touches the ones this request still holds: an old stale 'pending' hold may since have gone to someone else.
async function act(r, what) {
  if (what === 'cancel' && !confirm(`Cancel ${r.name}'s booking and free the slot?`)) return false;
  if (what === 'noshow' && !confirm(`Mark ${r.name} as a no-show and free the slot?`)) return false;
  const seen = { ack: true, ackAt: serverTimestamp(), ackBy: me };
  await runTransaction(db, async (tx) => {
    const snaps = await Promise.all(holdIds(r).map((id) => tx.get(doc(db, 'holds', id))));
    const mine = snaps.filter((x) => x.exists() && x.data().requestId === r.id).map((x) => x.ref);
    const ref = doc(db, 'requests', r.id), ackNow = r.ack === true ? {} : seen;
    if (what === 'seen') {
      // A website booking stays 'booked'. An old-style 'pending' one is confirmed, so its hours no longer expire
      if (r.status === 'pending') { tx.update(ref, { status: 'confirmed', ...seen }); mine.forEach((h) => tx.update(h, { status: 'confirmed' })); }
      else tx.update(ref, seen);
    } else if (what === 'arrived') {
      tx.update(ref, { status: 'confirmed', arrivedAt: serverTimestamp(), ...ackNow });
      mine.forEach((h) => tx.update(h, { status: 'confirmed' }));
    } else {
      tx.update(ref, { status: { done: 'done', noshow: 'no-show', cancel: 'cancelled' }[what], ...ackNow });
      if (what !== 'done') mine.forEach((h) => tx.delete(h));
    }
  });
  return true;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const r = orders.get(b.dataset.id) || dayRequests.find((x) => x.id === b.dataset.id); if (!r) return;
  b.disabled = true;
  try {
    if (await act(r, b.dataset.act)) toast({ seen: 'Marked as seen.', arrived: `${firstName(r.name)} has arrived.`, done: 'Marked done.', noshow: 'No-show. The hours are free again.', cancel: 'Cancelled. The hours are free again.' }[b.dataset.act]);
    else b.disabled = false;
  } catch (err) { console.warn(err); alert('Could not save. Check your connection.'); b.disabled = false; }
  await refreshAll();
});

/* ---------- new-order pop-up: sheet + optional chime + browser notification ----------
   One queue for both kinds: 'g:<id>' gaming bookings (here) and 'f:<id>' food orders (admin-shop.js registers 'f'). */
const popped = new Set(), popSrc = {};
let popIds = [];
const registerPop = (kind, src) => { popSrc[kind] = src; };
function popNew(kind, fresh) {
  const keys = fresh.map((r) => `${kind}:${r.id}`), arrived = keys.filter((k) => !popped.has(k));
  arrived.forEach((k) => popped.add(k));
  popIds = popIds.filter((k) => !k.startsWith(kind + ':') || keys.includes(k));   // seen elsewhere (another phone) → gone from the sheet
  arrived.reverse().forEach((k) => popIds.unshift(k));
  renderPop();
  if (!arrived.length) return;
  chime();
  const last = arrived[arrived.length - 1], r = popSrc[kind].get(last.slice(2));
  if ('Notification' in window && Notification.permission === 'granted' && r) {
    try {
      const { title, body } = popSrc[kind].note(r, arrived.length);
      const n = new Notification(title, { body, icon: '/assets/images/logo-96.png', tag: 'mg-order-' + r.id });
      n.onclick = () => { window.focus(); location.hash = 'orders'; if (shop) shop.showOrders(kind === 'f' ? 'food' : 'gaming'); n.close(); };
    } catch (e) {}   // phones only allow notifications from an installed app's service worker; the sheet and title still show
  }
}
function renderPop() {
  const pop = $('#pop'), k = popIds[0] || '', src = popSrc[k.slice(0, 1)], r = src && src.get(k.slice(2));
  if (!r || !src.isNew(r)) { pop.hidden = true; return; }
  pop.innerHTML = src.html(r, popIds.length);
  pop.hidden = false;
}
registerPop('g', {
  get: (id) => orders.get(id), isNew,
  note: (r, n) => ({ title: n > 1 ? `${n} new bookings` : 'New booking', body: `${r.name} · ${dayName(r.date)} ${clock(r.start)} · ${NAMES[r.station] || r.station} · ${inr(r.total)}` }),
  html: (r, n) => `
    <div class="con-pop-top"><span class="pill">New booking${n > 1 ? ` · ${n}` : ''}</span><button class="icon-btn press" type="button" data-pop="close" aria-label="Hide"><svg class="i"><use href="#i-x"/></svg></button></div>
    <p class="con-pop-when">${esc(dayName(r.date))} · ${clock(r.start)} – ${clock(r.start + r.hours)}</p>
    <p class="admin-item-name">${nameHtml(r)} <span class="dim">· ${esc(NAMES[r.station] || r.station)} · ${r.players} ${r.station === 'party' ? 'guests' : 'player' + (r.players > 1 ? 's' : '')}</span></p>
    <p class="admin-item-meta">${esc(sourceOf(r))}${r.food ? ' · ' + esc(r.food) : ''} · <b class="admin-left">${inr(r.total)}</b></p>
    <div class="admin-actions">
      <button class="btn btn-sm btn-accent press" data-act="seen" data-id="${esc(r.id)}">Seen</button>
      ${waDigits(r.phone) ? `<a class="btn btn-sm btn-ghost press" href="${esc(waHref(r))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      <a class="btn btn-sm btn-ghost press" href="#orders" data-pop="open" data-go="gaming">Open orders</a>
    </div>`
});
$('#pop').addEventListener('click', (e) => {
  const b = e.target.closest('[data-pop]'); if (!b) return;
  if (b.dataset.pop === 'close') { popIds.shift(); renderPop(); }
  if (b.dataset.pop === 'open') { popIds = []; renderPop(); if (shop && b.dataset.go) shop.showOrders(b.dataset.go); }
});

// Chime: browsers only allow sound after a tap, so it's a switch the owner turns on (remembered on this device;
// after a reload the first tap anywhere wakes the sound up again)
const SOUND_KEY = 'mg-console-sound';
let audio = null, soundOn = store.get(SOUND_KEY) === '1';
const wake = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === 'suspended') audio.resume(); } catch (e) {} };
function chime() {
  if (!soundOn || !audio || audio.state !== 'running') return;
  const t = audio.currentTime;
  [[880, 0], [1320, 0.18]].forEach(([f, at]) => {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(0.3, t + at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.35);
    o.connect(g).connect(audio.destination); o.start(t + at); o.stop(t + at + 0.4);
  });
}
function alertsUi() {
  const s = $('#sound'), n = $('#notify');
  const paint = () => {
    s.setAttribute('aria-pressed', String(soundOn)); $('span', s).textContent = soundOn ? 'Chime on' : 'Chime off';
    n.hidden = !('Notification' in window) || Notification.permission !== 'default';
  };
  s.hidden = false; paint();
  s.onclick = () => { soundOn = !soundOn; store.set(SOUND_KEY, soundOn ? '1' : '0'); if (soundOn) { wake(); setTimeout(chime, 60); } paint(); toast(soundOn ? 'Chime on for new orders.' : 'Chime off.'); };
  n.onclick = async () => { try { await Notification.requestPermission(); } catch (e) {} paint(); if (Notification.permission === 'granted') toast('Alerts on: new bookings and food orders show as notifications.'); };
  if (soundOn) document.addEventListener('pointerdown', wake, { once: true });
}

let toastT = 0;
function toast(text) {
  if (!text) return;
  const t = $('#toast'); t.textContent = text; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 3500);
}

/* ---------- customers: users/{uid}, the profile a customer saves after their first sign-in ---------- */
let profiles = new Map(), profilesLoaded = false;
const custOpen = new Set(), custMore = new Map();
// A booking's or order's name: the customer's profile name when they have one (the name typed on it, if different, after)
function nameHtml(r) {
  const p = r.uid && profiles.get(r.uid), typed = String(r.name || '').trim();
  if (!p || !p.name) return esc(typed);
  return esc(p.name) + (typed && typed.toLowerCase() !== p.name.toLowerCase() ? ` <span class="dim">(as ${esc(typed)})</span>` : '');
}
const joinedOf = (p) => (p.createdAt?.toMillis ? dayName(istKey(p.createdAt.toMillis())) + ' ' + new Date(p.createdAt.toMillis() + 330 * 60000).getUTCFullYear() : '');
function watchCustomers() {
  // Every profile (a small collection): the names on orders need them too. Re-read every 2 minutes on screen
  watch(() => collection(db, 'users'), (s) => {
    profiles = new Map(s.docs.map((d) => [d.id, d.data()])); profilesLoaded = true;
    renderCustomers(); if (loaded) renderOrders(); if (shop) shop.rerender();
  }, { every: 120000 });
}
function custCard(uid, p) {
  const wa = waDigits(p.phone), open = custOpen.has(uid);
  return `<li class="card admin-item con-cust" data-cust="${esc(uid)}">
    <div class="admin-item-top"><strong>${esc(p.name || 'No name')}</strong><span class="pill${p.waOptIn ? ' is-on' : ''}">${p.waOptIn ? 'WhatsApp offers: yes' : 'WhatsApp offers: no'}</span></div>
    <p class="admin-item-meta">${p.email ? `<a class="text-link" href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : 'No email'}${joinedOf(p) ? ` · joined ${esc(joinedOf(p))}` : ''}</p>
    <div class="con-contact">
      ${p.phone ? `<a class="btn btn-sm btn-ghost press" href="${esc(telHref(p.phone))}"><svg class="i"><use href="#i-phone"/></svg>${esc(p.phone)}</a>` : ''}
      ${wa ? `<a class="btn btn-sm btn-ghost press" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener"><svg class="i"><use href="#i-wa"/></svg>WhatsApp</a>` : ''}
      <button class="btn btn-sm btn-ghost press" type="button" data-cust-more="${esc(uid)}" aria-expanded="${open}">${open ? 'Hide' : 'Bookings &amp; orders'}</button>
    </div>
    ${open ? `<div class="con-cust-more">${custMore.get(uid) || '<p class="admin-item-meta">Loading…</p>'}</div>` : ''}
  </li>`;
}
function renderCustomers() {
  if (!profilesLoaded) return;
  const q = $('#cust-search').value.trim().toLowerCase(), digits = q.replace(/\D/g, '');
  const all = [...profiles.entries()].sort(([, a], [, b]) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  const rows = q ? all.filter(([, p]) => (p.name || '').toLowerCase().includes(q) || (p.email || '').toLowerCase().includes(q) || (digits.length >= 3 && String(p.phone || '').replace(/\D/g, '').includes(digits))) : all;
  $('#cust-count').textContent = q ? `${rows.length} of ${all.length}` : `${all.length} customer${all.length === 1 ? '' : 's'} · ${all.filter(([, p]) => p.waOptIn).length} want WhatsApp offers`;
  $('#customers').innerHTML = rows.length ? rows.map(([uid, p]) => custCard(uid, p)).join('') : `<li class="admin-empty">${q ? 'No customer matches that.' : 'No customer profiles yet. They appear here once customers sign in and fill in the welcome form.'}</li>`;
}
$('#cust-search').addEventListener('input', renderCustomers);
// Opening a customer: their bookings and food orders, one query each (only then)
async function loadCustomerMore(uid) {
  try {
    const [req, food] = await Promise.all([
      getDocs(query(collection(db, 'requests'), where('uid', '==', uid))),
      getDocs(query(collection(db, 'foodOrders'), where('uid', '==', uid)))
    ]);
    const bookings = req.docs.map((d) => d.data()).sort((a, b) => `${b.date}${pad(b.start)}`.localeCompare(`${a.date}${pad(a.start)}`));
    const orders = food.docs.map((d) => d.data()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const live = (r) => !['cancelled', 'no-show'].includes(r.status);
    const spent = bookings.filter(live).reduce((t, r) => t + (+r.total || 0), 0) + orders.filter((o) => o.status !== 'cancelled').reduce((t, o) => t + (+o.subtotal || 0), 0);
    custMore.set(uid, `<p class="admin-item-meta"><b>${bookings.length} booking${bookings.length === 1 ? '' : 's'} · ${orders.length} food order${orders.length === 1 ? '' : 's'}</b>${spent ? ` · ${inr(spent)} not cancelled` : ''}</p>
      <ul class="con-lines">${[
        ...bookings.slice(0, 5).map((r) => `<li><span>${esc(dayName(r.date))} ${clock(r.start)} · ${esc(NAMES[r.station] || r.station)} · ${esc(r.status)} <span class="dim">${esc(r.id)}</span></span><b>${inr(r.total)}</b></li>`),
        ...orders.slice(0, 5).map((o) => `<li><span>Food ${o.createdAt?.toMillis ? esc(dayName(istKey(o.createdAt.toMillis()))) + ' ' + esc(timeOf(o.createdAt)) : ''} · ${o.mode === 'delivery' ? 'delivery' : 'pickup'} · ${esc(o.status)} <span class="dim">${esc(o.id)}</span></span><b>${inr(o.subtotal)}</b></li>`)
      ].join('')}</ul>`);
  } catch (e) { console.warn('customer history not read', e.code || e); custMore.set(uid, '<p class="admin-item-meta">Couldn\'t load their bookings and orders. Try again.</p>'); custOpen.delete(uid); }
  renderCustomers();
}
$('#customers').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cust-more]'); if (!b) return;
  const uid = b.dataset.custMore;
  if (custOpen.has(uid)) { custOpen.delete(uid); renderCustomers(); return; }
  custOpen.add(uid); custMore.delete(uid); renderCustomers(); loadCustomerMore(uid);
});

/* ---------- schedule: one day ---------- */
let day = todayIst(), dayRequests = [], holds = [];
function startDays() {
  // Day chips: yesterday to 7 days ahead; "Other day" picks any date
  const t = nowIst(), days = $('#days');
  days.querySelectorAll('button').forEach((b) => b.remove());
  for (let i = -1; i <= 7; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : i === -1 ? 'Yesterday' : dayName(keyOf(d));
    $('.seg-ind', days).insertAdjacentHTML('beforebegin', `<button type="button" data-value="${keyOf(d)}" aria-pressed="${keyOf(d) === day}">${label}</button>`);
  }
  days.onclick = (e) => { const b = e.target.closest('button'); if (b) setDay(b.dataset.value); };
  $('#day-pick').onchange = (e) => { if (e.target.value) setDay(e.target.value); };
  watch(() => query(collection(db, 'requests'), where('date', '==', day)), (s) => { dayRequests = s.docs.map((d) => d.data()); renderDayList(); renderSched(); }, { every: 20000, when: isView('schedule') });
  watch(() => query(collection(db, 'holds'), where('date', '==', day)), (s) => { holds = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderSched(); }, { every: 20000, when: isView('schedule') });
  setDay(day);
}
function setDay(key) {
  if (key !== day) { dayRequests = []; holds = []; }
  day = key; markDay(); $('#sched-day').textContent = key === todayIst() ? 'Today' : dayName(key);
  renderSched(); renderDayList();
  if (view === 'schedule') refreshAll();
}
function markDay() {
  const days = $('#days'), ind = $('.seg-ind', days);
  days.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === day)));
  $('#day-pick').value = day;
  const on = days.querySelector('[aria-pressed="true"]');
  ind.style.opacity = on ? 1 : 0;
  if (on) Object.assign(ind.style, { width: on.offsetWidth + 'px', height: on.offsetHeight + 'px', transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
}
function renderDayList() {
  // The day's bookings: from the day's own read, with anything fresher from the orders list
  const rows = dayRequests.map((r) => orders.get(r.id) || r).sort((a, b) => a.start - b.start);
  countOf('#req-count', rows.length);
  fillList('#requests', rows, 'No bookings this day.', { day: false });
}
function renderSched() {
  const byId = Object.fromEntries(holds.map((h) => [h.id, h]));
  const reqName = Object.fromEntries(dayRequests.map((r) => [r.id, r.name]));
  const hours = []; for (let h = OPEN; h < CLOSE; h++) hours.push(h);
  $('#sched').innerHTML = `<div class="sched-head"><span></span><span>PS5</span><span>Xbox</span></div>` + hours.map((h) => `
    <div class="sched-row"><span class="sched-time">${clock(h)}</span>${['ps5', 'xbox'].map((c) => {
      const hold = byId[`${day}_${c}_${h}`];
      const label = !hold ? 'Free' : hold.status === 'blocked' ? 'Blocked' : esc(reqName[hold.requestId] || hold.status);
      return `<button type="button" class="sched-cell ${hold ? 'is-' + esc(hold.status) : 'is-free'}" data-console="${c}" data-hour="${h}">${label}</button>`;
    }).join('')}</div>`).join('');
}
$('#sched').addEventListener('click', async (e) => {
  const b = e.target.closest('.sched-cell'); if (!b) return;
  const id = `${day}_${b.dataset.console}_${b.dataset.hour}`;
  const hold = holds.find((h) => h.id === id);
  try {
    if (!hold) await setDoc(doc(db, 'holds', id), { date: day, console: b.dataset.console, hour: +b.dataset.hour, requestId: 'blocked', status: 'blocked', createdAt: serverTimestamp() });
    else if (hold.status === 'blocked') await deleteDoc(doc(db, 'holds', id));
    else alert('This hour belongs to a booking. Cancel the booking to free it.');
  } catch (err) { alert('Could not save. Check your connection.'); }
  refreshAll();
});

/* ---------- add a booking or birthday (phone, walk-in, WhatsApp): confirmed straight away, shows as booked on the website ---------- */
const bk = (id) => $('#bk-' + id);
const dlg = $('#book-dlg');
function fillBookingForm() {
  const hrs = []; for (let h = OPEN; h < CLOSE; h++) hrs.push(h);
  bk('start').innerHTML = hrs.map((h) => `<option value="${h}">${clock(h)}</option>`).join('');
  bk('start').value = '18';
  // 3-4 players don't fit one console (two controllers each): switch to the whole room; back to one console for 1 player
  bk('players').addEventListener('change', () => { const n = +bk('players').value; if (n >= 3 && ['ps5', 'xbox'].includes(bk('station').value)) { bk('station').value = 'squad'; bk('msg').textContent = '3-4 players take the whole room (both consoles, 2 hours or more).'; } if (n === 1 && bk('station').value === 'squad') bk('station').value = 'ps5'; });
  ['station', 'players', 'start', 'hours', 'plan', 'kids', 'adults'].forEach((k) => bk(k).addEventListener('change', bookingTotal));
  ['kids', 'adults'].forEach((k) => bk(k).addEventListener('input', bookingTotal));
  bookingTotal();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const party = b.dataset.add === 'party';
  bk('station').value = party ? 'party' : (bk('station').value === 'party' ? 'ps5' : bk('station').value);
  if (party) bk('start').value = '16';
  bk('date').min = todayIst();
  bk('date').value = view === 'schedule' && day >= todayIst() ? day : todayIst();
  $('#bk-title').textContent = party ? 'Add a birthday' : 'Add a booking';
  bk('msg').textContent = ''; bookingTotal();
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  bk('name').focus();
});
bk('close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });   // tap outside the card
function bookingDraft() {
  const station = bk('station').value, squad = station === 'squad';
  if (station === 'party') {
    // Birthday package: fixed 3 hours, whole game room, ₹675 a child + ₹399 an adult, at least 10 guests in total
    const adults = Math.max(0, Math.min(99, Math.round(+bk('adults').value) || 0));
    const kids = Math.max(1, BDAY.minGuests - adults, Math.min(99, Math.round(+bk('kids').value) || 0));
    const start = Math.min(+bk('start').value, CLOSE - BDAY.hours);
    return { station, players: kids + adults, kids, adults, start, hours: BDAY.hours, plan: 'party', total: kids * BDAY.perChild + adults * BDAY.perAdult };
  }
  let players = +bk('players').value;
  if (squad) players = Math.max(2, players);
  else players = Math.min(2, players);   // one console: two controllers
  const minHours = squad ? SQUAD_MIN : 1, start = Math.min(+bk('start').value, CLOSE - minHours), maxHours = CLOSE - start;
  const hoursSel = bk('hours'), keep = +hoursSel.value || 2;
  hoursSel.innerHTML = Array.from({ length: Math.min(6, maxHours) - minHours + 1 }, (_, i) => `<option value="${i + minHours}">${i + minHours} hr${i + minHours > 1 ? 's' : ''}</option>`).join('');
  hoursSel.value = String(Math.max(minHours, Math.min(keep, maxHours)));
  const hours = +hoursSel.value, plan = squad ? 'hourly' : bk('plan').value;   // passes are for 1-2 players on one console
  const kind = squad ? 'solo' : KIND[players];
  const rate = squad ? SQUAD[players].reduce((sum, k) => sum + RATES[k], 0) : RATES[kind];
  const total = plan === 'buy-pass' ? PASS[kind].price : plan === 'use-pass' ? 0 : (plan === 'member' ? MEMBER[kind] : rate) * hours;
  return { station, players, start, hours, plan, total };
}
function bookingTotal() {
  const b = bookingDraft(), party = b.station === 'party';
  $('#bk-players-wrap').hidden = $('#bk-plan-wrap').hidden = party; $('#bk-kids-wrap').hidden = $('#bk-adults-wrap').hidden = !party;
  bk('hours').disabled = party;
  bk('submit').textContent = party ? 'Add birthday' : 'Add booking';
  if (party) {
    bk('start').value = String(b.start);
    bk('hours').innerHTML = `<option value="${BDAY.hours}">${BDAY.hours} hrs</option>`;
    const raised = +bk('kids').value !== b.kids ? ` (children raised to ${b.kids} for the 10-guest minimum)` : '';
    bk('total').textContent = `${clock(b.start)} – ${clock(b.start + b.hours)} · ${b.players} guests · ${inr(b.total)} · ${b.players > BDAY.roomMax ? 'whole restaurant' : 'game room'} · ${inr(BDAY.advance)} advance${raised}`;
    return;
  }
  bk('players').value = String(b.players); bk('plan').value = b.plan; bk('start').value = String(b.start);
  bk('plan').disabled = b.station === 'squad';
  bk('total').textContent = `${clock(b.start)} – ${clock(b.start + b.hours)} · ${inr(b.total)}${b.station === 'squad' ? ` · whole room, ${SQUAD_MIN} hrs or more` : ''}`;
}
$('#book-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = bookingDraft(), name = bk('name').value.trim(), phone = bk('phone').value.trim(), msgEl = bk('msg'), date = bk('date').value;
  if (!date || date < todayIst()) { msgEl.textContent = 'Pick today or a later day.'; return; }
  const d = dateOf(date);
  const id = `MG-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(b.start)}00-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const r = { id, name, phone, date, start: b.start, hours: b.hours, station: b.station, players: b.players, plan: b.plan, game: '', food: '', total: b.total, status: 'confirmed', source: bk('source').value, ack: true, ...(b.station === 'party' ? { adults: b.adults } : {}) };
  msgEl.textContent = 'Saving…'; bk('submit').disabled = true;
  try {
    await runTransaction(db, async (tx) => {
      const ids = holdIds(r), snaps = await Promise.all(ids.map((hid) => tx.get(doc(db, 'holds', hid))));
      const clash = snaps.find((x) => x.exists() && !(x.data().status === 'pending' && Date.now() - (x.data().createdAt?.toMillis?.() || Date.now()) > STALE_MS));
      if (clash) { const [, c, h] = clash.id.split('_'); throw Object.assign(new Error('taken'), { slot: `${NAMES[c]} ${clock(+h)}` }); }
      tx.set(doc(db, 'requests', id), { ...r, createdAt: serverTimestamp(), ackAt: serverTimestamp(), ackBy: me });
      // Same hour list as the clash check above: squad rooms and birthday parties take both consoles
      ids.forEach((hid) => { const [, c, h] = hid.split('_'); tx.set(doc(db, 'holds', hid), { date, console: c, hour: +h, requestId: id, status: 'confirmed', createdAt: serverTimestamp() }); });
    });
    dlg.close();
    toast(`Added. ${name} is booked ${dayName(date)}, ${clock(b.start)} – ${clock(b.start + b.hours)}.`);
    bk('name').value = ''; bk('phone').value = ''; msgEl.textContent = '';
  } catch (err) {
    msgEl.textContent = err.slot ? `${err.slot} is already taken that day. Pick another time.` : 'Could not save. Check your connection.';
  }
  bk('submit').disabled = false;
  refreshAll();
});

/* ---------- birthdays: upcoming parties ---------- */
function renderBirthdays(all) {
  const rows = all.filter((r) => r.station === 'party' && LIVE.includes(r.status)).sort(byWhen);
  countOf('#c-bdays', rows.length); badge('#b-bdays', rows.filter((r) => r.date === todayIst()).length);
  fillList('#list-bdays', rows, 'No birthday parties booked yet.');
}

/* ---------- passes and meal plans: /passes holds the owner's record (name, phone, price); /passCards is what the
   customer's link shows (first name and hours or meals only). Every change writes both in one batch.
   A gaming pass (type 'solo' | 'duo') counts hoursTotal / hoursUsed and "Add hours" renews it.
   A MR. Sandwich meal plan (type 'meals', plan 5 | 8 | 10) counts mealsTotal / mealsUsed and has no hours. It is valid
   MEALS.days from the day it's bought and its unused meals expire with it, so buying again starts a new plan.
   Payments: when the gateway is live, paid passes will be written here by it; nothing does that yet. ---------- */
let passData = {}, passDocs = [];
const passLink = (id) => `${location.origin}/pass?id=${id}`;
// Indian mobile as +91XXXXXXXXXX: the customer signs in at /pass with this number to see their passes
const toE164 = (p) => { let d = String(p || '').replace(/\D/g, '').replace(/^0/, ''); if (d.length === 12 && d.startsWith('91')) d = d.slice(2); return /^[6-9]\d{9}$/.test(d) ? '+91' + d : ''; };
const isMeals = (p) => p.type === 'meals';
const mealPlan = (value) => MEALS.plans.find((m) => `meals-${m.meals}` === value);   // the form's option value, e.g. 'meals-8'
const planName = (p) => `${+p.plan || +p.mealsTotal || 0}-meal plan`;
// [total, used] field names: meals on a meal plan, hours on a gaming pass
const counts = (p) => (isMeals(p) ? ['mealsTotal', 'mealsUsed'] : ['hoursTotal', 'hoursUsed']);
// The customer's card: first name and hours or meals only (never the phone, full name or price)
const cardOf = (p) => (isMeals(p)
  ? { first: firstName(p.name), type: 'meals', plan: +p.plan || 0, mealsTotal: p.mealsTotal || 0, mealsUsed: p.mealsUsed || 0, expires: p.expires, updatedAt: serverTimestamp() }
  : { first: firstName(p.name), type: p.type, hoursTotal: p.hoursTotal || 0, hoursUsed: p.hoursUsed || 0, expires: p.expires, updatedAt: serverTimestamp() });
const shortDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const isExpired = (p) => (p.expires?.toMillis?.() ?? Infinity) < Date.now();
// A meal plan bought today
const mealPlanOf = (name, phone, phoneE164, m) => ({ name, phone, phoneE164, type: 'meals', plan: m.meals, price: m.price, mealsTotal: m.meals, mealsUsed: 0, expires: Timestamp.fromMillis(Date.now() + MEALS.days * DAY_MS) });
// Saves a new pass or meal plan: the owner's record and the customer's card in one batch
function addPass(pass) {
  const ref = doc(collection(db, 'passes')), batch = writeBatch(db);
  batch.set(ref, { ...pass, createdAt: serverTimestamp() });
  batch.set(doc(db, 'passCards', ref.id), cardOf(pass));
  return batch.commit();
}
function watchPasses() {
  watch(query(collection(db, 'passes'), orderBy('createdAt', 'desc')), (s) => {
    passData = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
    passDocs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPasses();
  }, { every: 60000, when: isView('passes') });
}
function renderPasses() {
  const list = $('#passes'), qy = $('#pass-search').value.trim().toLowerCase(), digits = qy.replace(/\D/g, '');
  const rows = passDocs.filter((p) => !qy || String(p.name).toLowerCase().includes(qy) || (digits.length >= 3 && String(p.phone || '').replace(/\D/g, '').includes(digits)));
  $('#pass-count').textContent = passDocs.length ? `${rows.length} of ${passDocs.length}` : '';
  if (!rows.length) { list.innerHTML = `<li class="admin-empty">${passDocs.length ? 'No pass or meal plan matches.' : 'No passes or meal plans yet.'}</li>`; return; }
  const now = Date.now();
  list.innerHTML = rows.map((p) => {
    const meals = isMeals(p), [tk, uk] = counts(p), total = +p[tk] || 0, left = total - (+p[uk] || 0), id = esc(p.id);
    const exp = p.expires?.toDate ? p.expires.toDate() : null, expired = exp && exp.getTime() < now;
    // Meal plans lead with "Use 1 meal": it's what the owner taps at the counter (not once the plan has expired).
    // "Undo 1 meal" fixes a wrong tap; "New plan" is for buying again (meals don't carry over).
    const acts = meals ? `
        <button class="btn btn-sm btn-accent press" data-pass="${id}" data-use="1" ${left < 1 || expired ? 'disabled' : ''}>Use 1 meal</button>
        <button class="btn btn-sm btn-ghost press" data-pass="${id}" data-use="-1" ${+p.mealsUsed > 0 ? '' : 'disabled'}>Undo 1 meal</button>
        <button class="btn btn-sm btn-ghost press" data-pass="${id}" data-renew="1">New plan</button>` : `
        <button class="btn btn-sm btn-ghost press" data-pass="${id}" data-use="1" ${left < 1 ? 'disabled' : ''}>Use 1 hr</button>
        <button class="btn btn-sm btn-ghost press" data-pass="${id}" data-use="2" ${left < 2 ? 'disabled' : ''}>Use 2 hrs</button>
        <button class="btn btn-sm btn-accent press" data-pass="${id}" data-add="1">Add hours</button>`;
    return `<li class="card admin-item ${expired || left <= 0 ? 'is-dim' : ''}">
      <div class="admin-item-top"><strong>${esc(p.name)}</strong><span class="pill">${esc(meals ? planName(p) : PASS[p.type]?.label || p.type)}</span></div>
      <p class="admin-item-meta">${p.phoneE164 ? esc(p.phone) + ' (can sign in) · ' : p.phone ? esc(p.phone) + ' · ' : 'no mobile, link only · '}<b class="admin-left">${left} of ${total} ${meals ? 'meals' : 'hrs'} left</b> · ${exp ? (expired ? 'expired ' : 'valid till ') + shortDate(exp) : ''}</p>
      <div class="admin-actions">${acts}
        <button class="btn btn-sm btn-ghost press" data-pass="${id}" data-send="1">Send link</button>
        <button class="btn btn-sm btn-ghost press con-danger" data-pass="${id}" data-del="1">Delete</button>
      </div>
      ${billActs('passes', p)}
    </li>`;
  }).join('');
}
$('#pass-search').addEventListener('input', renderPasses);
// Add form: the meal plans come from MEALS; a plan's meal count is fixed, so the hours box goes (disabled, so it isn't checked)
$('#pass-meals').innerHTML = MEALS.plans.map((m) => `<option value="meals-${m.meals}">${m.meals} meals · ${inr(m.price)}</option>`).join('');
function passType() {
  const plan = !!mealPlan($('#pass-type').value);
  $('#pass-form').classList.toggle('is-meals', plan);
  $('#pass-hours-wrap').hidden = $('#pass-hours').disabled = plan;
  $('#pass-submit').textContent = plan ? 'Add meal plan' : 'Add pass';
}
$('#pass-type').addEventListener('change', passType); passType();
$('#pass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = $('#pass-type').value, plan = mealPlan(type), hours = Math.round(+$('#pass-hours').value), name = $('#pass-name').value.trim();
  const phone = $('#pass-phone').value.trim(), phoneE164 = toE164(phone), what = plan ? 'meal plan' : 'pass';
  if (!plan && !(hours >= 1 && hours <= 99)) { alert('Hours must be between 1 and 99.'); return; }
  if (phone && !phoneE164) { alert('Enter a 10-digit Indian mobile number, or leave it empty.'); return; }
  if (!phone && !confirm(`No mobile number: the customer can only see this ${what} through the link you send. Add it anyway?`)) return;
  const pass = plan ? mealPlanOf(name, phone, phoneE164, plan)
    : { name, phone, phoneE164, type, price: PASS[type].price, hoursTotal: hours, hoursUsed: 0, expires: Timestamp.fromMillis(Date.now() + 30 * DAY_MS) };
  try { await addPass(pass); e.target.reset(); passType(); toast(`${plan ? 'Meal plan' : 'Pass'} added for ${name}.`); } catch (err) { alert(`Could not save the ${what}.`); }
  refreshAll();
});
$('#passes').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-pass]'); if (!b) return;
  const pid = b.dataset.pass, p = passData[pid]; if (!p) return;
  const ref = doc(db, 'passes', pid), card = doc(db, 'passCards', pid), batch = writeBatch(db);
  const [tk, uk] = counts(p), what = isMeals(p) ? 'meal plan' : 'pass';
  if (b.dataset.send) return sendPass(pid, p);
  if (b.dataset.renew) return renewPlan(p);
  if (b.dataset.del) {
    if (!confirm(`Delete ${p.name}'s ${what}? Their link stops working.`)) return;
    batch.delete(ref); batch.delete(card);
  } else if (b.dataset.add) {
    const n = Math.round(+prompt(`Add how many hours to ${p.name}'s pass? This also renews it for 30 days from today.`, '6'));
    if (!(n >= 1 && n <= 99)) return;
    // Renew: valid 30 days from today, unless it already runs longer
    const until = Math.max(p.expires?.toMillis?.() || 0, Date.now() + 30 * DAY_MS), expires = Timestamp.fromMillis(until);
    batch.update(ref, { [tk]: increment(n), expires });
    batch.set(card, cardOf({ ...p, [tk]: (p[tk] || 0) + n, expires }));
  } else {
    const n = +b.dataset.use;   // -1 is "Undo 1 meal"
    batch.update(ref, { [uk]: increment(n) });
    batch.set(card, cardOf({ ...p, [uk]: (p[uk] || 0) + n }));
  }
  b.disabled = true;
  try { await batch.commit(); } catch (err) { alert('Could not save.'); b.disabled = false; }
  refreshAll();
});
// Buying again: a new plan for the same customer, valid MEALS.days from today; the old one keeps its own date
async function renewPlan(p) {
  const sizes = MEALS.plans.map((m) => m.meals), or = (a) => a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
  const answer = prompt(`New meal plan for ${p.name}, valid ${MEALS.days} days from today (this plan keeps its own date). How many meals: ${or(MEALS.plans.map((m) => `${m.meals} (${inr(m.price)})`))}?`, String(+p.plan || sizes[0]));
  if (answer === null) return;
  const m = MEALS.plans.find((x) => x.meals === Math.round(+answer));
  if (!m) { alert(`Meal plans come with ${or(sizes)} meals.`); return; }
  try { await addPass(mealPlanOf(p.name, p.phone || '', p.phoneE164 || '', m)); } catch (err) { alert('Could not save the meal plan.'); }
  refreshAll();
}
function sendPass(pid, p) {
  const meals = isMeals(p), [tk, uk] = counts(p), left = (p[tk] || 0) - (p[uk] || 0), link = passLink(pid), what = meals ? 'meal plan' : 'pass';
  const text = (meals
    ? `Hi ${firstName(p.name)}! Your MR. Sandwich ${planName(p)} ${isExpired(p) ? `expired on ${shortDate(p.expires.toDate())}` : `has ${left} meal${left === 1 ? '' : 's'} left`}. See your meals any time: ${link}`
    : `Hi ${firstName(p.name)}! Your MR. GAMING ${(PASS[p.type]?.label || 'pass').toLowerCase()} has ${left} hrs left. See your hours any time: ${link}`)
    + (p.phoneE164 ? ` or sign in with this number at ${location.origin}/pass` : '');
  const digits = waDigits(p.phone);
  if (digits) { window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => alert(`No phone number on this ${what}. Link copied:\n${link}`), () => prompt(`No phone number on this ${what}. Copy the link:`, link));
}

/* ---------- stock alerts (MR. Sandwich): the same sums as stock.js, on India-time calendar days ---------- */
const SOON_DAYS = 3, WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PLURAL = { packet: 'packets', carton: 'cartons', box: 'boxes', piece: 'pieces', bottle: 'bottles', tin: 'tins', bag: 'bags', litre: 'litres' };
const istKey = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);
const keyMs = (key) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
const expKey = (b) => (b.expiry?.toMillis ? istKey(b.expiry.toMillis()) : null);   // null = no expiry
const daysLeft = (b) => { const k = expKey(b); return k === null ? Infinity : Math.round((keyMs(k) - keyMs(istKey(Date.now()))) / DAY_MS); };
const stockDay = (key) => { const d = new Date(keyMs(key)); return `${WEEK[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };   // "Thu 15 Jul 2027", like stock.js
const expiryText = (b) => { const n = daysLeft(b), k = expKey(b); return n < 0 ? `Expired ${stockDay(k)}` : n === 0 ? 'Expires today' : n === 1 ? 'Expires tomorrow' : `Expires in ${n} days · ${stockDay(k)}`; };
const round = (q) => Math.round(q * 1000) / 1000;
const qtyUnit = (q, unit) => `${round(+q || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${q === 1 ? unit : PLURAL[unit] || unit}`;
const fefo = (a, b) => (daysLeft(a) - daysLeft(b)) || ((a.addedAt?.toMillis?.() || 0) - (b.addedAt?.toMillis?.() || 0));
let sProducts = null, sBatches = null;
const ALERT_KEY = 'mg-console-stock-seen';
function watchStock() {
  // Stock changes slowly: every 3 minutes (and when the page comes back into view or the Stock screen opens)
  watch(collection(db, 'stockProducts'), (s) => { sProducts = Object.fromEntries(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); renderStock(); }, { every: 180000 });
  watch(collection(db, 'stockBatches'), (s) => { sBatches = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.qty > 0); renderStock(); }, { every: 180000 });
}
function renderStock() {
  if (!sProducts || !sBatches) return;
  const nameOf = (pid) => sProducts[pid]?.name || 'Unknown product', unitOf = (pid) => sProducts[pid]?.unit || '';
  const expired = sBatches.filter((b) => daysLeft(b) < 0).sort(fefo);
  const soon = sBatches.filter((b) => { const n = daysLeft(b); return n >= 0 && n <= SOON_DAYS; }).sort(fefo);
  const low = Object.values(sProducts).map((p) => {
    const total = round(sBatches.filter((b) => b.productId === p.id && daysLeft(b) >= 0).reduce((t, b) => t + b.qty, 0));
    return { p, total, low: total <= (+p.low || 0) };
  }).filter((x) => x.low).sort((a, b) => a.p.name.localeCompare(b.p.name, 'en', { sensitivity: 'base' }));
  const row = (title, meta, cls = '') => `<li class="con-row ${cls}"><strong>${esc(title)}</strong><span class="admin-item-meta">${esc(meta)}</span></li>`;
  const fill = (sel, items, empty) => { $(sel).innerHTML = items.length ? items.join('') : `<li class="admin-empty">${empty}</li>`; };
  fill('#s-exp', expired.map((b) => row(nameOf(b.productId), `${qtyUnit(b.qty, unitOf(b.productId))} · ${expiryText(b)}`, 'is-bad')), 'Nothing expired.');
  fill('#s-soon', soon.map((b) => row(nameOf(b.productId), `${qtyUnit(b.qty, unitOf(b.productId))} · ${expiryText(b)}`, 'is-soon')), 'Nothing expires in the next 3 days.');
  fill('#s-low', low.map((x) => row(x.p.name, `${qtyUnit(x.total, x.p.unit)} left · alert at ${round(+x.p.low || 0)}`)), 'Nothing running low.');
  countOf('#c-exp', expired.length); countOf('#c-soon', soon.length); countOf('#c-low', low.length);
  [['#s-exp', expired], ['#s-soon', soon], ['#s-low', low]].forEach(([sel, xs]) => $(sel).closest('.con-alert-card').classList.toggle('is-on', xs.length > 0));
  const n = expired.length + soon.length + low.length;
  badge('#b-stock', n); $('#st-stock').textContent = n;

  // Pop up only for alerts this device hasn't shown yet (remembered for the day, so a reload doesn't repeat them)
  const keys = [...expired.map((b) => 'x' + b.id), ...soon.map((b) => 's' + b.id), ...low.map((x) => 'l' + x.p.id)];
  let seen = {}; try { seen = JSON.parse(store.get(ALERT_KEY) || '{}'); } catch (e) {}
  const today = istKey(Date.now()), before = new Set(seen.day === today ? seen.keys : []);
  const fresh = keys.filter((k) => !before.has(k));
  store.set(ALERT_KEY, JSON.stringify({ day: today, keys }));
  if (fresh.length) {
    const parts = [['x', 'expired'], ['s', 'expiring soon'], ['l', 'running low']].map(([p, w]) => [fresh.filter((k) => k[0] === p).length, w]).filter(([c]) => c).map(([c, w]) => `${c} ${w}`);
    toast(`Stock: ${parts.join(', ')}. Open the Stock tab.`);
  }
}

/* ---------- menu (MR. Sandwich): today's changes over the printed menu, in /menuOverrides ----------
   Doc id per item (and per price column) comes from menu-live.js, the same module /menu, home and booking use, so the
   two sides can't drift. Fields: price (int, only when it differs from the printed price), soldOut, hidden,
   updatedAt, by. An item back to normal has no document. menu-data.js and menu-live.js load only when this screen opens. */
let menuReady = null, menuRows = [], overrides = {}, edits = {}, menuSection = '';
const loadScript = (src) => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.append(s); });
function openMenu() {
  if (!menuReady) {
    menuReady = Promise.all([window.MENU ? null : loadScript('/assets/js/menu-data.js'), import('/assets/js/menu-live.js')])
      .then(([, live]) => { buildMenu(window.MENU, live); watch(collection(db, 'menuOverrides'), (s) => {
        // A read that set off before a change made here may land after it: keep this device's last 15 s of edits
        const next = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
        Object.entries(edits).forEach(([id, e]) => { if (Date.now() - e.at < 15000) { if (e.data) next[id] = e.data; else delete next[id]; } });
        overrides = next; paintMenu();
      }, { every: 60000, when: isView('menu') }); })
      .catch((e) => { console.warn(e); menuReady = null; $('#menu-list').innerHTML = '<p class="admin-empty">Could not load the menu. Check your connection and open Menu again.</p>'; });
  }
  return menuReady;
}
// One row per price: { id, section, name, col, printed }
function buildMenu(MENU, live) {
  const ids = live.idsFor(MENU);   // item -> doc id; live.docIds adds '-0' / '-1' for a two-price item
  menuRows = [];
  MENU.sections.forEach((s) => s.groups.forEach((g) => g.items.forEach((it) => {
    live.docIds(it, ids.get(it)).forEach((id, c) => menuRows.push({ id, section: s, group: g.title || '', name: it.name, col: it.prices ? g.cols?.[c] || `Price ${c + 1}` : '', printed: it.prices ? it.prices[c] : it.price }));
  })));
  $('#menu-sections').innerHTML = `<button type="button" data-sec="" aria-pressed="true">All</button>` + MENU.sections.map((s) => `<button type="button" data-sec="${esc(s.id)}" aria-pressed="false">${esc(s.title)}</button>`).join('');
  $('#menu-list').innerHTML = MENU.sections.map((s) => `
    <section class="mn-sec" data-sec="${esc(s.id)}"><h2 class="admin-h">${esc(s.title)}</h2><ul class="mn-list">${menuRows.filter((r) => r.section === s).map((r) => `
      <li class="mn-row" data-id="${esc(r.id)}" data-find="${esc((r.name + ' ' + r.col + ' ' + r.group + ' ' + s.title).toLowerCase())}">
        <div class="mn-name"><strong>${esc(r.name)}</strong>${r.col || r.group ? `<span class="admin-item-meta">${esc([r.group, r.col].filter(Boolean).join(' · '))}</span>` : ''}<span class="admin-item-meta mn-printed">Printed ${inr(r.printed)}</span></div>
        <div class="mn-ctrl">
          <label class="mn-price"><span>₹</span><input class="field" type="number" inputmode="numeric" min="1" max="10000" step="1" placeholder="${esc(r.printed)}" aria-label="Today's price for ${esc(r.name)}${r.col ? ' (' + esc(r.col) + ')' : ''}" data-price></label>
          <button type="button" class="mn-tog press" data-tog="soldOut" aria-pressed="false" title="Sold out today">Sold out</button>
          <button type="button" class="mn-tog press" data-tog="hidden" aria-pressed="false">Hide</button>
          <button type="button" class="btn btn-sm btn-ghost press" data-reset>Reset</button>
        </div>
      </li>`).join('')}</ul></section>`).join('');
  filterMenu();
}
const rowById = (id) => menuRows.filter((r) => r.id === id);
function paintMenu() {
  let changed = 0, sold = 0;
  $$('.mn-row').forEach((li) => {
    const o = overrides[li.dataset.id] || {}, input = $('[data-price]', li), r = rowById(li.dataset.id)[0];
    if (document.activeElement !== input) input.value = o.price && o.price !== r?.printed ? o.price : '';
    $('[data-tog="soldOut"]', li).setAttribute('aria-pressed', String(!!o.soldOut));
    $('[data-tog="hidden"]', li).setAttribute('aria-pressed', String(!!o.hidden));
    const on = !!(o.soldOut || o.hidden || (o.price && o.price !== r?.printed));
    li.classList.toggle('is-changed', on); li.classList.toggle('is-sold', !!o.soldOut); li.classList.toggle('is-hidden', !!o.hidden);
    $('[data-reset]', li).disabled = !on;
  });
  Object.values(overrides).forEach((o) => { changed++; if (o.soldOut) sold++; });
  $('#menu-reset-sold').disabled = !sold;
  $('#menu-reset-sold').textContent = sold ? `Reset all sold-out (${sold})` : 'Reset all sold-out';
  badge('#b-menu', sold);
  $('#menu-count').textContent = changed ? `${changed} changed today` : 'As printed';
}
// Writes one item's whole override (or deletes it when nothing differs from the printed menu)
function saveOverride(id, next) {
  const r = rowById(id)[0], price = +next.price && +next.price !== r?.printed ? Math.round(+next.price) : 0;
  const data = { ...(price ? { price } : {}), ...(next.soldOut ? { soldOut: true } : {}), ...(next.hidden ? { hidden: true } : {}) };
  const prev = overrides[id];
  if (Object.keys(data).length) overrides[id] = data; else delete overrides[id];
  edits[id] = { data: overrides[id], at: Date.now() };
  paintMenu();
  const ref = doc(db, 'menuOverrides', id);
  return (Object.keys(data).length ? setDoc(ref, { ...data, updatedAt: serverTimestamp(), by: me }) : deleteDoc(ref))
    .catch((e) => { console.warn(e); delete edits[id]; if (prev) overrides[id] = prev; else delete overrides[id]; paintMenu(); alert('Could not save. Check your connection.'); });
}
$('#menu-list').addEventListener('click', (e) => {
  const li = e.target.closest('.mn-row'); if (!li) return;
  const id = li.dataset.id, o = overrides[id] || {};
  const t = e.target.closest('[data-tog]');
  if (t) { const k = t.dataset.tog; saveOverride(id, { ...o, [k]: !o[k] }).then(() => toast(`${rowById(id)[0]?.name}: ${k === 'soldOut' ? (!o[k] ? 'sold out today' : 'back on') : (!o[k] ? 'hidden' : 'shown again')}.`)); }
  if (e.target.closest('[data-reset]')) saveOverride(id, {}).then(() => toast(`${rowById(id)[0]?.name}: back to the printed menu.`));
});
$('#menu-list').addEventListener('change', (e) => {
  const input = e.target.closest('[data-price]'); if (!input) return;
  const id = input.closest('.mn-row').dataset.id, v = input.value.trim(), n = Math.round(+v);
  if (v && !(n >= 1 && n <= 10000)) { alert('Price must be between ₹1 and ₹10,000.'); input.value = overrides[id]?.price || ''; return; }
  saveOverride(id, { ...(overrides[id] || {}), price: v ? n : 0 }).then(() => toast(`${rowById(id)[0]?.name}: ${v ? inr(n) + ' today' : 'printed price'}.`));
});
$('#menu-list').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-price]')) e.target.blur(); });
$('#menu-reset-sold').addEventListener('click', async () => {
  const ids = Object.keys(overrides).filter((id) => overrides[id].soldOut);
  if (!ids.length || !confirm(`Put ${ids.length} sold-out item${ids.length > 1 ? 's' : ''} back on the menu?`)) return;
  const batch = writeBatch(db);
  ids.forEach((id) => {
    const { soldOut, ...rest } = overrides[id], ref = doc(db, 'menuOverrides', id);
    const keep = { ...(rest.price ? { price: rest.price } : {}), ...(rest.hidden ? { hidden: true } : {}) };
    if (Object.keys(keep).length) batch.set(ref, { ...keep, updatedAt: serverTimestamp(), by: me }); else batch.delete(ref);
    edits[id] = { data: Object.keys(keep).length ? keep : null, at: Date.now() };
  });
  try { await batch.commit(); toast('Every item is back on.'); } catch (e) { alert('Could not save. Check your connection.'); }
  refreshAll();
});
function filterMenu() {
  const qy = $('#menu-search').value.trim().toLowerCase();
  $$('.mn-sec').forEach((sec) => {
    let any = false;
    $$('.mn-row', sec).forEach((li) => { const on = (!menuSection || sec.dataset.sec === menuSection) && (!qy || li.dataset.find.includes(qy)); li.hidden = !on; any ||= on; });
    sec.hidden = !any;
  });
}
$('#menu-search').addEventListener('input', filterMenu);
$('#menu-sections').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sec]'); if (!b) return;
  menuSection = b.dataset.sec;
  $$('#menu-sections button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  filterMenu();
});
