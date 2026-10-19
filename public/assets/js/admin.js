/* MR. GAMING owner page: upcoming bookings, each day's requests, adding phone / walk-in bookings,
   schedule (block / free hours) and passes (add or use hours, send the customer their pass link).
   Access is enforced by firestore.rules (owner = signed-in user listed in /admins).
   Owners log in on /pass like everyone else; it sees their /admins entry and opens this page.
   Reads use Firestore Lite (small, plain HTTPS): bookings re-read every 20 s and passes every minute while the
   page is on screen, everything re-reads when it comes back into view and right after any change made here. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, signOut, onAuthStateChanged,
  getFirestore, collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, deleteDoc, writeBatch,
  runTransaction, serverTimestamp, Timestamp, increment
} from '/assets/vendor/firebase-account.0e285128.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }), db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const pad = (n) => String(n).padStart(2, '0');
const clock = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const OPEN = 11, CLOSE = 23, PASS = { solo: { price: 899, label: 'Solo pass' }, duo: { price: 1499, label: 'Duo pass' } };
const MEMBER = { solo: 169, duo: 279 };   // member rate once a pass's hours are used (CONFIG.memberRates in main.js)
const RATES = { solo: 199, duo: 320, trio: 420, quad: 499 }, KIND = { 1: 'solo', 2: 'duo', 3: 'trio', 4: 'quad' }, SQUAD = { 2: ['solo', 'solo'], 3: ['duo', 'solo'], 4: ['duo', 'duo'] };   // same as CONFIG in main.js
const STALE_MS = 3 * 60 * 60 * 1000, DAY_MS = 24 * 60 * 60 * 1000;   // unconfirmed holds stop counting after 3 hours (firestore.rules)
const NAMES = { ps5: 'PS5', xbox: 'Xbox', squad: 'Whole room', party: 'Birthday party' };
const BDAY = { perChild: 599, perAdult: 299, hours: 3, minGuests: 10, roomMax: 15, advance: 3000, cancelFee: 1000 };   // same as CONFIG.birthday in main.js
const nowIst = () => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); };
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dateOf = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const dayName = (key) => dateOf(key).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const show = (id) => ['login', 'denied', 'dash'].forEach((x) => { $('#' + x).hidden = x !== id; });

/* ---------- sign in happens on /pass (one login for everyone); it sends owners here ---------- */
$('#signout').addEventListener('click', () => signOut(auth));

/* ---------- reads: Firestore Lite has no live listeners, so each list re-reads on a timer ---------- */
const watchers = new Set();
// Runs the query now, then every `every` ms while the page is on screen, and on refreshAll();
// a reply that arrives after a newer one, or after unwatching, is ignored
function watch(q, cb, every = 20000) {
  const w = { seq: 0, done: 0, at: 0, every, run() { const n = ++w.seq; w.at = Date.now(); getDocs(q).then((s) => { if (watchers.has(w) && n > w.done) { w.done = n; cb(s); } }).catch((e) => console.warn('read failed', e.code || e)); } };
  watchers.add(w); w.run();
  return () => watchers.delete(w);
}
const refreshAll = () => watchers.forEach((w) => w.run());
setInterval(() => { if (document.visibilityState === 'visible') watchers.forEach((w) => { if (Date.now() - w.at >= w.every - 1000) w.run(); }); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });

// This device signed in as an owner before: show the dashboard straight away (data follows; the rules still decide)
const OWNER_KEY = 'mg-owner';
let knownOwner = null; try { knownOwner = localStorage.getItem(OWNER_KEY); } catch (e) {}
let unsub = [], started = false;
const stopAll = () => { unsub.forEach((u) => u()); unsub = []; watchers.clear(); started = false; };
const begin = () => { if (!started) { started = true; show('dash'); startDashboard(); } };
if (knownOwner) queueMicrotask(begin);   // after this file has finished setting up (the dashboard code is further down)
onAuthStateChanged(auth, async (user) => {
  $('#signout').hidden = !user; $('#who').textContent = user ? (user.phoneNumber || '') : '';
  if (!user) { stopAll(); try { localStorage.removeItem(OWNER_KEY); } catch (e) {} show('login'); location.replace('/pass'); return; }
  if (knownOwner && knownOwner !== user.uid) stopAll();
  const owner = getDoc(doc(db, 'admins', user.uid)).then((a) => a.exists()).catch(() => false);
  if (knownOwner === user.uid) begin();   // reads go out alongside the owner check (Firestore waits for the sign-in itself)
  if (!(await owner)) { stopAll(); try { localStorage.removeItem(OWNER_KEY); } catch (e) {} $('#uid').textContent = user.uid; return show('denied'); }
  try { localStorage.setItem(OWNER_KEY, user.uid); } catch (e) {}
  begin();
});

/* ---------- dashboard ---------- */
let day = keyOf(nowIst()), requests = [], holds = [], passData = {};

function startDashboard() {
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
  setDay(day); watchUpcoming(); watchPasses(); fillBookingForm();
}
function setDay(key) { day = key; markDay(); watchDay(); $('#bk-day').textContent = dayName(day); }
function markDay() {
  const days = $('#days'), ind = $('.seg-ind', days);
  days.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === day)));
  $('#day-pick').value = day;
  const on = days.querySelector('[aria-pressed="true"]');
  ind.style.opacity = on ? 1 : 0;
  if (on) Object.assign(ind.style, { width: on.offsetWidth + 'px', height: on.offsetHeight + 'px', transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
}

let dayUnsub = [];
function watchDay() {
  dayUnsub.forEach((u) => u());
  dayUnsub = [
    watch(query(collection(db, 'requests'), where('date', '==', day)), (s) => { requests = s.docs.map((d) => d.data()); renderRequests(); renderSched(); }),
    watch(query(collection(db, 'holds'), where('date', '==', day)), (s) => { holds = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderSched(); })
  ];
  unsub.push(...dayUnsub);
}

/* upcoming: every live booking from today on, all days */
function watchUpcoming() {
  unsub.push(watch(query(collection(db, 'requests'), where('date', '>=', keyOf(nowIst()))), (s) => {
    const rows = s.docs.map((d) => d.data()).filter((r) => ['pending', 'confirmed'].includes(r.status))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
    $('#up-count').textContent = rows.length ? `(${rows.length})` : '';
    $('#upcoming').innerHTML = rows.length ? rows.map((r) => `
      <li><button type="button" class="admin-up-row status-${esc(r.status)}" data-day="${esc(r.date)}">
        <span class="admin-up-when">${esc(dayName(r.date))} · ${clock(r.start)} – ${clock(r.start + r.hours)}</span>
        <span class="admin-up-who">${esc(NAMES[r.station] || r.station)} · ${esc(r.name)}</span>
        <span class="pill">${esc(r.status)}</span>
      </button></li>`).join('') : '<li class="admin-empty">No upcoming bookings.</li>';
  }));
}
$('#upcoming').addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (b) setDay(b.dataset.day); });

/* requests */
const holdIds = (r) => (r.station === 'squad' || r.station === 'party' ? ['ps5', 'xbox'] : [r.station])
  .flatMap((c) => Array.from({ length: r.hours }, (_, i) => `${r.date}_${c}_${r.start + i}`));
const telHref = (p) => 'tel:' + String(p).replace(/[^\d+]/g, '');

function renderRequests() {
  const list = $('#requests');
  const rows = requests.slice().sort((a, b) => a.start - b.start);
  $('#req-count').textContent = rows.length ? `(${rows.length})` : '';
  if (!rows.length) { list.innerHTML = '<li class="admin-empty">No requests for this day.</li>'; return; }
  list.innerHTML = rows.map((r) => `
    <li class="card admin-item status-${esc(r.status)}">
      <div class="admin-item-top">
        <strong>${clock(r.start)} – ${clock(r.start + r.hours)}</strong>
        <span class="pill">${esc(r.status)}</span>
      </div>
      <p class="admin-item-name">${esc(r.name)} <span class="dim">· ${esc(r.id)}</span></p>
      <p class="admin-item-meta">${esc(NAMES[r.station] || r.station)} · ${r.station === 'party' ? `${r.players} guests${r.adults ? ` (${r.players - r.adults} children + ${r.adults} adults)` : ''}${r.players > BDAY.roomMax ? ' · whole restaurant' : ''}` : `${r.players} player${r.players > 1 ? 's' : ''} · ${esc(r.plan === 'use-pass' ? 'uses pass' : r.plan === 'buy-pass' ? 'buys pass' : r.plan === 'member' ? 'member rate' : 'hourly')}`}${r.game ? ' · ' + esc(r.game) : ''}${r.food ? ' · ' + esc(r.food) : ''}${r.source === 'owner' ? ' · added by you' : ''}</p>
      ${r.phone ? `<p class="admin-item-meta"><a class="admin-tel" href="${esc(telHref(r.phone))}">${esc(r.phone)}</a></p>` : ''}
      <p class="admin-item-total">${inr(r.total)}</p>
      <div class="admin-actions">
        ${r.status === 'pending' ? `<button class="btn btn-sm btn-accent press" data-act="confirm" data-id="${esc(r.id)}">Confirm</button>` : ''}
        ${['pending', 'confirmed'].includes(r.status) ? `<button class="btn btn-sm btn-ghost press" data-act="done" data-id="${esc(r.id)}">Done</button>
        <button class="btn btn-sm btn-ghost press" data-act="noshow" data-id="${esc(r.id)}">No-show</button>
        <button class="btn btn-sm btn-ghost press" data-act="cancel" data-id="${esc(r.id)}">Cancel</button>` : ''}
      </div>
    </li>`).join('');
}
$('#requests').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-act]'); if (!b) return;
  const r = requests.find((x) => x.id === b.dataset.id); if (!r) return;
  const act = b.dataset.act;
  if (act === 'cancel' && !confirm(`Cancel ${r.name}'s booking and free the slot?`)) return;
  b.disabled = true;
  try {
    // Read the hours from the database (not the on-screen schedule, which may still be loading) and only touch
    // the ones this request still holds: a stale hold may since have gone to someone else
    await runTransaction(db, async (tx) => {
      const snaps = await Promise.all(holdIds(r).map((id) => tx.get(doc(db, 'holds', id))));
      const mine = snaps.filter((x) => x.exists() && x.data().requestId === r.id).map((x) => x.ref);
      tx.update(doc(db, 'requests', r.id), { status: { confirm: 'confirmed', done: 'done', noshow: 'no-show', cancel: 'cancelled' }[act] });
      if (act === 'confirm') mine.forEach((ref) => tx.update(ref, { status: 'confirmed' }));
      if (act === 'noshow' || act === 'cancel') mine.forEach((ref) => tx.delete(ref));
    });
  } catch (err) { alert('Could not save. Check your connection.'); b.disabled = false; }
  refreshAll();
});

/* add a booking (phone or walk-in): confirmed straight away, shows as booked on the website */
const bk = (id) => $('#bk-' + id);
function fillBookingForm() {
  const hrs = []; for (let h = OPEN; h < CLOSE; h++) hrs.push(h);
  bk('start').innerHTML = hrs.map((h) => `<option value="${h}">${clock(h)}</option>`).join('');
  bk('start').value = '18';
  ['station', 'players', 'start', 'hours', 'plan', 'kids', 'adults'].forEach((k) => bk(k).addEventListener('change', bookingTotal));
  ['kids', 'adults'].forEach((k) => bk(k).addEventListener('input', bookingTotal));
  bookingTotal();
}
function bookingDraft() {
  const station = bk('station').value, squad = station === 'squad';
  if (station === 'party') {
    // Birthday package: fixed 3 hours, whole game room, ₹599 a child + ₹299 an adult, at least 10 guests in total
    const adults = Math.max(0, Math.min(99, Math.round(+bk('adults').value) || 0));
    const kids = Math.max(1, BDAY.minGuests - adults, Math.min(99, Math.round(+bk('kids').value) || 0));
    const start = Math.min(+bk('start').value, CLOSE - BDAY.hours);
    return { station, players: kids + adults, kids, adults, start, hours: BDAY.hours, plan: 'party', total: kids * BDAY.perChild + adults * BDAY.perAdult };
  }
  let players = +bk('players').value;
  if (squad) players = Math.max(2, players);
  const start = +bk('start').value, maxHours = CLOSE - start;
  const hoursSel = bk('hours'), keep = +hoursSel.value || 2;
  hoursSel.innerHTML = Array.from({ length: Math.min(6, maxHours) }, (_, i) => `<option value="${i + 1}">${i + 1} hr${i ? 's' : ''}</option>`).join('');
  hoursSel.value = String(Math.min(keep, maxHours));
  const hours = +hoursSel.value, plan = squad || players >= 3 ? 'hourly' : bk('plan').value;   // passes are for 1-2 players
  const kind = squad ? 'solo' : KIND[players];
  const rate = squad ? SQUAD[players].reduce((sum, k) => sum + RATES[k], 0) : RATES[kind];
  const total = plan === 'buy-pass' ? PASS[kind].price : plan === 'use-pass' ? 0 : (plan === 'member' ? MEMBER[kind] : rate) * hours;
  return { station, players, start, hours, plan, total };
}
function bookingTotal() {
  const b = bookingDraft(), party = b.station === 'party';
  bk('players').hidden = bk('plan').hidden = party; $('#bk-kids-wrap').hidden = $('#bk-adults-wrap').hidden = !party;
  bk('hours').disabled = party;
  if (party) {
    bk('start').value = String(b.start);
    bk('hours').innerHTML = `<option value="${BDAY.hours}">${BDAY.hours} hrs</option>`;
    const raised = +bk('kids').value !== b.kids ? ` (children raised to ${b.kids} for the 10-guest minimum)` : '';
    bk('total').textContent = `${clock(b.start)} – ${clock(b.start + b.hours)} · ${b.players} guests · ${inr(b.total)} · ${b.players > BDAY.roomMax ? 'whole restaurant' : 'game room'} · ${inr(BDAY.advance)} advance${raised}`;
    return;
  }
  bk('players').value = String(b.players); bk('plan').value = b.plan;
  bk('total').textContent = `${clock(b.start)} – ${clock(b.start + b.hours)} · ${inr(b.total)}`;
}
$('#book-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const b = bookingDraft(), name = bk('name').value.trim(), phone = bk('phone').value.trim(), msgEl = bk('msg');
  if (day < keyOf(nowIst())) { msgEl.textContent = 'Pick today or a later day.'; return; }
  const d = dateOf(day);
  const id = `MG-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(b.start)}00-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const r = { id, name, phone, date: day, start: b.start, hours: b.hours, station: b.station, players: b.players, plan: b.plan, game: '', food: '', total: b.total, status: 'confirmed', source: 'owner', ...(b.station === 'party' ? { adults: b.adults } : {}) };
  msgEl.textContent = 'Saving…';
  try {
    await runTransaction(db, async (tx) => {
      const ids = holdIds(r), snaps = await Promise.all(ids.map((hid) => tx.get(doc(db, 'holds', hid))));
      const clash = snaps.find((x) => x.exists() && !(x.data().status === 'pending' && Date.now() - (x.data().createdAt?.toMillis?.() || Date.now()) > STALE_MS));
      if (clash) { const [, c, h] = clash.id.split('_'); throw Object.assign(new Error('taken'), { slot: `${NAMES[c]} ${clock(+h)}` }); }
      tx.set(doc(db, 'requests', id), { ...r, createdAt: serverTimestamp() });
      // Same hour list as the clash check above: squad rooms and birthday parties take both consoles
      ids.forEach((hid) => { const [, c, h] = hid.split('_'); tx.set(doc(db, 'holds', hid), { date: day, console: c, hour: +h, requestId: id, status: 'confirmed', createdAt: serverTimestamp() }); });
    });
    msgEl.textContent = `Added. ${name} is booked ${dayName(day)}, ${clock(b.start)} – ${clock(b.start + b.hours)}.`;
    bk('name').value = ''; bk('phone').value = '';
  } catch (err) {
    msgEl.textContent = err.slot ? `${err.slot} is already taken that day. Pick another time.` : 'Could not save. Check your connection.';
  }
  refreshAll();
});

/* schedule */
function renderSched() {
  const byId = Object.fromEntries(holds.map((h) => [h.id, h]));
  const reqName = Object.fromEntries(requests.map((r) => [r.id, r.name]));
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

/* passes: /passes holds the owner's record (name, phone, price); /passCards is what the customer's link shows
   (first name and hours only). Every change writes both in one batch. */
const passLink = (id) => `${location.origin}/pass?id=${id}`;
// Indian mobile as +91XXXXXXXXXX: the customer signs in at /pass with this number to see their passes
const toE164 = (p) => { let d = String(p || '').replace(/\D/g, '').replace(/^0/, ''); if (d.length === 12 && d.startsWith('91')) d = d.slice(2); return /^[6-9]\d{9}$/.test(d) ? '+91' + d : ''; };
const firstName = (n) => String(n).trim().split(/\s+/)[0].slice(0, 20);
function watchPasses() {
  unsub.push(watch(query(collection(db, 'passes'), orderBy('createdAt', 'desc')), (s) => {
    const list = $('#passes');
    passData = Object.fromEntries(s.docs.map((d) => [d.id, d.data()]));
    if (s.empty) { list.innerHTML = '<li class="admin-empty">No passes yet.</li>'; return; }
    const now = Date.now();
    list.innerHTML = s.docs.map((d) => {
      const p = d.data(), total = p.hoursTotal || 0, left = total - (p.hoursUsed || 0);
      const exp = p.expires?.toDate ? p.expires.toDate() : null, expired = exp && exp.getTime() < now;
      return `<li class="card admin-item ${expired || left <= 0 ? 'is-dim' : ''}">
        <div class="admin-item-top"><strong>${esc(p.name)}</strong><span class="pill">${esc(PASS[p.type]?.label || p.type)}</span></div>
        <p class="admin-item-meta">${p.phoneE164 ? esc(p.phone) + ' (can sign in) · ' : p.phone ? esc(p.phone) + ' · ' : 'no mobile, link only · '}<b class="admin-left">${left} of ${total} hrs left</b> · ${exp ? (expired ? 'expired ' : 'valid till ') + exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</p>
        <div class="admin-actions">
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-use="1" ${left < 1 ? 'disabled' : ''}>Use 1 hr</button>
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-use="2" ${left < 2 ? 'disabled' : ''}>Use 2 hrs</button>
          <button class="btn btn-sm btn-accent press" data-pass="${d.id}" data-add="1">Add hours</button>
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-send="1">Send link</button>
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-del="1">Delete</button>
        </div>
      </li>`;
    }).join('');
  }, 60000));
}
$('#pass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = $('#pass-type').value, hours = Math.round(+$('#pass-hours').value), name = $('#pass-name').value.trim();
  const phone = $('#pass-phone').value.trim(), phoneE164 = toE164(phone);
  if (!(hours >= 1 && hours <= 99)) { alert('Hours must be between 1 and 99.'); return; }
  if (phone && !phoneE164) { alert('Enter a 10-digit Indian mobile number, or leave it empty.'); return; }
  if (!phone && !confirm('No mobile number: the customer can only see this pass through the link you send. Add it anyway?')) return;
  const expires = Timestamp.fromMillis(Date.now() + 30 * DAY_MS), ref = doc(collection(db, 'passes'));
  const batch = writeBatch(db);
  batch.set(ref, { name, phone, phoneE164, type, price: PASS[type].price, hoursTotal: hours, hoursUsed: 0, expires, createdAt: serverTimestamp() });
  batch.set(doc(db, 'passCards', ref.id), { first: firstName(name), type, hoursTotal: hours, hoursUsed: 0, expires, updatedAt: serverTimestamp() });
  try { await batch.commit(); e.target.reset(); } catch (err) { alert('Could not save the pass.'); }
  refreshAll();
});
$('#passes').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-pass]'); if (!b) return;
  const pid = b.dataset.pass, p = passData[pid]; if (!p) return;
  const ref = doc(db, 'passes', pid), card = doc(db, 'passCards', pid), batch = writeBatch(db);
  if (b.dataset.send) return sendPass(pid, p);
  if (b.dataset.del) {
    if (!confirm(`Delete ${p.name}'s pass? Their link stops working.`)) return;
    batch.delete(ref); batch.delete(card);
  } else if (b.dataset.add) {
    const n = Math.round(+prompt(`Add how many hours to ${p.name}'s pass? This also renews it for 30 days from today.`, '6'));
    if (!(n >= 1 && n <= 99)) return;
    // Renew: valid 30 days from today, unless it already runs longer
    const until = Math.max(p.expires?.toMillis?.() || 0, Date.now() + 30 * DAY_MS), expires = Timestamp.fromMillis(until);
    batch.update(ref, { hoursTotal: increment(n), expires });
    batch.set(card, { first: firstName(p.name), type: p.type, hoursTotal: (p.hoursTotal || 0) + n, hoursUsed: p.hoursUsed || 0, expires, updatedAt: serverTimestamp() });
  } else {
    const n = +b.dataset.use;
    batch.update(ref, { hoursUsed: increment(n) });
    batch.set(card, { first: firstName(p.name), type: p.type, hoursTotal: p.hoursTotal || 0, hoursUsed: (p.hoursUsed || 0) + n, expires: p.expires, updatedAt: serverTimestamp() });
  }
  b.disabled = true;
  try { await batch.commit(); } catch (err) { alert('Could not save.'); b.disabled = false; }
  refreshAll();
});
function sendPass(pid, p) {
  const left = (p.hoursTotal || 0) - (p.hoursUsed || 0), link = passLink(pid);
  const text = `Hi ${firstName(p.name)}! Your MR. GAMING ${(PASS[p.type]?.label || 'pass').toLowerCase()} has ${left} hrs left. See your hours any time: ${link}`
    + (p.phoneE164 ? ` or sign in with this number at ${location.origin}/pass` : '');
  let digits = String(p.phone || '').replace(/\D/g, '').replace(/^0/, '');
  if (digits.length === 10) digits = '91' + digits;
  if (digits.length === 12) { window.open(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); return; }
  (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => alert(`No phone number on this pass. Link copied:\n${link}`), () => prompt('No phone number on this pass. Copy the link:', link));
}
