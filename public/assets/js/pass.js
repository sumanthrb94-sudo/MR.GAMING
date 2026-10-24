/* MR. GAMING "My pass" (/pass): gaming passes (hours left) and MR. Sandwich meal plans (meals left, type 'meals').
   Two ways in:
   - /pass?id=...  the link the owner sends: reads that one pass card (first name and hours or meals only, no sign-in)
   - /pass         the customer signs in with their mobile number + SMS code and sees every pass and meal plan saved
                   under that number (firestore.rules lets a signed-in number read only its own passes).
                   The same login serves the owner: a number listed in /admins is sent to /admin,
                   and stock staff (listed in /stockStaff) are sent to /stock.
   Signed in, "My orders & bookings" lists the MR. Sandwich food orders (foodOrders) and the gaming bookings (requests)
   made with this sign-in (whose uid is the caller's; firestore.rules allow no others), newest orders and upcoming slots
   first, each with a link to its bill once billed (/bill?id=...) and food orders with "Track" (/menu?order=...).
   Changes and cancellations go through us on WhatsApp.
   The sign-in is account.js (shared with /book, /menu and the top bar's account sheet). After a customer's first sign-in
   (no users/{uid} profile yet) the welcome form asks for their name, email and WhatsApp opt-in (profile.js); the
   passes load behind it. The "Signed in" card has Edit profile and Sign out.
   Hours, meals and bookings are re-read every 30 seconds and when the page comes back into view. */
import { collection, query, where, getDocs, getDoc, doc } from '/assets/vendor/firebase-account.0e285128.js';
import { db, onUser, sendCode, confirmCode, forgetCode, signOut, cachedProfile } from '/assets/js/account.js';

const $ = (s, r = document) => r.querySelector(s);
const WA = '917337230311';
const LABEL = { solo: 'Solo pass', duo: 'Duo pass' };
const MEMBER = { solo: 169, duo: 279 };   // member rate per hour once the hours are used, until the pass's 30 days end (CONFIG.memberRates in main.js)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const linkId = new URLSearchParams(location.search).get('id');
const firstName = (n) => String(n || '').trim().split(/\s+/)[0].slice(0, 20);
const prettyPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p; };
const waLink = (text) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const isMeals = (p) => p.type === 'meals';
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// What a pass holds: hours on a gaming pass, meals on a meal plan
const count = (p) => { const total = (isMeals(p) ? p.mealsTotal : p.hoursTotal) || 0; return { total, left: Math.max(0, total - ((isMeals(p) ? p.mealsUsed : p.hoursUsed) || 0)) }; };

/* ---------- views ---------- */
function showStatus(text, withActions) {
  $('#status').hidden = false; $('#status-text').textContent = text;
  $('#status-actions').hidden = !withActions;
  $('#cards').innerHTML = ''; $('#foot').hidden = true;
}
function countTo(el, to) {
  const from = el.dataset.n === undefined ? 0 : +el.dataset.n; el.dataset.n = to;
  if (reduced || from === to) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const CARD = `
  <p class="eyebrow" data-f="kind"></p>
  <h2 class="pass-hi" data-f="hi"></h2>
  <div class="pass-hours"><span class="pass-left" data-f="left"></span><span class="pass-of" data-f="of"></span></div>
  <div class="pass-bar"><span data-f="fill"></span></div>
  <p class="pass-meta" data-f="meta"></p>
  <div class="actions">
    <a class="btn btn-accent press" data-f="book" href="/book">Book with my pass <svg class="i"><use href="#i-arrow"/></svg></a>
    <a class="btn btn-ghost press" data-f="wa" href="https://wa.me/${WA}" target="_blank" rel="noopener"><svg class="i"><use href="#i-wa"/></svg> WhatsApp us</a>
  </div>`;

// passes: [{ id, first, type: 'solo' | 'duo', hoursTotal, hoursUsed, expires } or a meal plan { id, first, type: 'meals', plan, mealsTotal, mealsUsed, expires }];
// cards are updated in place so numbers count and bars slide
function renderPasses(passes) {
  $('#status').hidden = true; $('#foot').hidden = false;
  const box = $('#cards'), keep = new Set(passes.map((p) => p.id));
  box.querySelectorAll('[data-id]').forEach((el) => { if (!keep.has(el.dataset.id)) el.remove(); });
  let mealCards = 0, gameCards = 0;
  passes.forEach((p, i) => {
    let card = box.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    if (!card) { card = document.createElement('section'); card.className = 'card pass-card'; card.dataset.id = p.id; card.innerHTML = CARD; }
    box.appendChild(card);   // keeps the sort order
    const f = (k) => $(`[data-f="${k}"]`, card);
    const { total, left } = count(p);
    const exp = p.expires && p.expires.toDate ? p.expires.toDate() : null, expired = !!exp && exp.getTime() < Date.now();
    const date = exp ? exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    card.classList.toggle('is-meals', isMeals(p));
    if (isMeals(p)) return renderMeals(card, f, p, { i, nth: mealCards++, total, left, exp, expired, date });
    const label = LABEL[p.type] || 'Pass', nth = gameCards++;
    f('kind').textContent = label;
    f('hi').textContent = i === 0 ? `Hi ${p.first || 'there'},` : nth ? 'Another pass' : 'Your gaming pass';
    countTo(f('left'), left);
    f('of').textContent = `${left === 1 ? 'hr' : 'hrs'} left of ${total}`;
    f('fill').style.width = total ? `${(left / total) * 100}%` : '0%';
    const member = !expired && left === 0, kind = p.type === 'duo' ? 'duo' : 'solo';
    f('meta').textContent = expired ? `Expired on ${date}. Ask us about topping up.`
      : member ? `All hours used. Until ${date} you play at the member rate: ₹${MEMBER[kind]}/hr.` : exp ? `Valid till ${date}` : '';
    card.classList.toggle('is-dim', expired);
    f('book').hidden = expired;
    f('book').href = `/book?pass=${kind}${member ? '&rate=member' : ''}`;
    f('book').firstChild.textContent = member ? 'Book at member rate ' : 'Book with my pass ';
    f('wa').href = waLink(`Hi MR. GAMING! About my ${label.toLowerCase()} (${left} hrs left).`);
  });
}
// A MR. Sandwich meal plan on the same card: meals left, the bar in one step per meal, and the menu instead of booking.
// Meals not used by the end date expire with the plan, so an expired plan shows 0 left.
function renderMeals(card, f, p, { i, nth, total, left: unused, exp, expired, date }) {
  const plan = `${+p.plan || total}-meal plan`, meals = (n) => (n === 1 ? 'meal' : 'meals'), left = expired ? 0 : unused;
  f('kind').textContent = `MR. Sandwich · ${plan}`;
  f('hi').textContent = i === 0 ? `Hi ${p.first || 'there'},` : nth ? 'Another meal plan' : 'Your meal plan';
  countTo(f('left'), left);
  f('of').textContent = `${meals(left)} left of\u00a0${total}`;   // "of 10" wraps as one piece at 360px
  const bar = f('fill').parentNode;
  bar.classList.toggle('is-steps', total > 1 && total <= 12); bar.style.setProperty('--n', total);
  f('fill').style.width = total ? `${(left / total) * 100}%` : '0%';
  f('meta').textContent = expired ? `Expired on ${date}. Ask us on WhatsApp about a new plan.`
    : left === 0 ? 'All meals used. Ask us on WhatsApp about a new plan.' : exp ? `Valid till ${date}` : '';
  card.classList.toggle('is-dim', expired);
  f('book').hidden = expired;
  f('book').href = '/menu#meal-plans';
  f('book').firstChild.textContent = 'See the menu ';
  f('wa').href = waLink(`Hi MR. Sandwich! About my ${plan} (${expired ? `expired on ${date}` : `${left} ${meals(left)} left`}).`);
}
const active = (p) => count(p).left > 0 && !(p.expires?.toDate && p.expires.toDate() < new Date());

/* ---------- way 1: the owner's link (/pass?id=...) ---------- */
let loaded = false;
async function loadLink() {
  if (!/^[A-Za-z0-9]{10,40}$/.test(linkId)) return showStatus("This pass link isn't complete. Ask us on WhatsApp for a fresh one.", true);
  try {
    const snap = await getDoc(doc(db, 'passCards', linkId));
    if (!snap.exists()) return showStatus("We can't find this pass. Ask us on WhatsApp.", true);
    renderPasses([{ id: snap.id, ...snap.data() }]); loaded = true;
  } catch (e) { if (!loaded) showStatus("Couldn't load your pass right now. Try again in a minute.", true); }
}

/* ---------- My bookings (signed in) ---------- */
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CONSOLE = { ps5: 'PS5', xbox: 'Xbox', squad: 'Whole room' };
const STATUS = { booked: 'Booked', pending: 'Requested', confirmed: 'Confirmed', done: 'Done', 'no-show': 'No-show', cancelled: 'Cancelled' };
const OFF = ['done', 'no-show', 'cancelled'];
const hr = (h) => `${h % 12 || 12} ${h < 12 || h === 24 ? 'am' : 'pm'}`;
const dayOf = (key) => { const [y, m, d] = String(key).split('-').map(Number); return new Date(y, m - 1, d); };
// "Now" in Hyderabad as "YYYY-MM-DD" and the hour, whatever the phone's timezone
const istNow = () => { const d = new Date(Date.now() + (330 + new Date().getTimezoneOffset()) * 60000); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, hour: d.getHours() }; };
const FOOD_STATUS = { placed: 'Placed', accepted: 'Accepted', preparing: 'Preparing', out: 'On the way', ready: 'Ready', delivered: 'Delivered', picked: 'Picked up', cancelled: 'Cancelled' };
const FOOD_DONE = ['delivered', 'picked', 'cancelled'];
const billLink = (r) => (r.bill && r.bill.id ? ` · <a class="text-link" href="/bill?id=${encodeURIComponent(r.bill.id)}">Bill</a>` : '');
const isPast = (r, now) => OFF.includes(r.status) || r.date < now.key || (r.date === now.key && +r.start + +r.hours <= now.hour);
function renderBookings(rows) {
  const now = istNow(), list = rows.map((r) => ({ ...r, past: isPast(r, now) }));
  const at = (r) => `${r.date}_${String(r.start).padStart(2, '0')}`;
  const upcoming = list.filter((r) => !r.past).sort((a, b) => at(a).localeCompare(at(b)));
  const past = list.filter((r) => r.past).sort((a, b) => at(b).localeCompare(at(a))).slice(0, 5);
  $('#booking-list').innerHTML = [...upcoming, ...past].map((r) => {
    const d = dayOf(r.date), s0 = +r.start, n = +r.hours, players = +r.players || 1;
    return `<li class="booking-row${r.past ? ' is-past' : ''}${OFF.includes(r.status) ? ' is-off' : ''}">
      <div><span class="booking-when">${esc(DAY[d.getDay()])} ${d.getDate()} ${esc(MON[d.getMonth()])} · ${esc(hr(s0))} – ${esc(hr(s0 + n))}</span>
        <span class="booking-what">${esc(CONSOLE[r.station] || r.station)} · ${players} player${players > 1 ? 's' : ''} · <span class="dim">${esc(r.id)}</span>${billLink(r)}</span></div>
      <div class="booking-right"><span class="tag">${esc(STATUS[r.status] || r.status)}</span><b>₹${Math.round(+r.total || 0).toLocaleString('en-IN')}</b></div>
    </li>`;
  }).join('');
  $('#slots-sub').hidden = !list.length || !foodRows.length;
  $('#bookings-note').innerHTML = !list.length && !foodRows.length ? 'No orders or bookings with this number yet. <a class="text-link" href="/book">Book a slot</a> or <a class="text-link" href="/menu">order food</a>.'
    : `Pay at the venue, on delivery or at pickup. To change or cancel, <a class="text-link" href="${esc(waLink('Hi MR. GAMING! About my booking or order'))}" target="_blank" rel="noopener">message us on WhatsApp</a>.`;
  $('#mine').hidden = false;
  if (location.hash === '#mine' && !scrolledToMine) { scrolledToMine = true; $('#mine').scrollIntoView({ block: 'start' }); }
}
let scrolledToMine = false;
// Food orders: the ones still on their way first, then the latest few
let foodRows = [];
function renderOrders(rows) {
  const ms = (o) => (o.createdAt && o.createdAt.toMillis ? o.createdAt.toMillis() : 0);
  foodRows = [...rows.filter((o) => !FOOD_DONE.includes(o.status)), ...rows.filter((o) => FOOD_DONE.includes(o.status)).sort((a, b) => ms(b) - ms(a)).slice(0, 5)];
  $('#order-list').innerHTML = foodRows.map((o) => {
    const t = ms(o), d = new Date(t + 330 * 60000), h = d.getUTCHours(), n = (o.items || []).reduce((s, l) => s + (+l.qty || 0), 0), off = FOOD_DONE.includes(o.status);
    const when = t ? `${DAY[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}` : '';
    return `<li class="booking-row${off ? ' is-past' : ''}${o.status === 'cancelled' ? ' is-off' : ''}">
      <div><span class="booking-when">${esc(when)} · ${o.mode === 'delivery' ? 'Delivery' : 'Pickup'}</span>
        <span class="booking-what">${n} item${n === 1 ? '' : 's'} · <span class="dim">${esc(o.id)}</span>${off ? '' : ` · <a class="text-link" href="/menu?order=${encodeURIComponent(o.id)}">Track</a>`}${billLink(o)}</span></div>
      <div class="booking-right"><span class="tag">${esc(FOOD_STATUS[o.status] || o.status)}</span><b>₹${Math.round(+o.subtotal || 0).toLocaleString('en-IN')}</b></div>
    </li>`;
  }).join('');
  $('#orders-sub').hidden = !foodRows.length;
}
let bookingsLoaded = false;
async function loadBookings() {
  if (!user) return;
  try {
    const [snap, food] = await Promise.all([
      getDocs(query(collection(db, 'requests'), where('uid', '==', user.uid))),
      getDocs(query(collection(db, 'foodOrders'), where('uid', '==', user.uid))).catch(() => null)
    ]);
    if (!user) return;
    if (food) renderOrders(food.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderBookings(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); bookingsLoaded = true;
  } catch (e) {
    if (!bookingsLoaded) { $('#booking-list').innerHTML = ''; $('#bookings-note').textContent = "Couldn't load your orders and bookings right now. Try again in a minute."; $('#mine').hidden = false; }
  }
}

/* ---------- way 2: sign in with mobile number (account.js) ---------- */
let user = null;
const msg = (t) => { $('#login-msg').textContent = t; };

const myPasses = () => getDocs(query(collection(db, 'passes'), where('phoneE164', '==', user.phoneNumber)));
async function loadMine(started) {
  if (!user) return;
  try {
    const snap = await (started || myPasses());
    const passes = snap.docs.map((d) => { const p = d.data(); return { id: d.id, first: firstName(p.name), type: p.type, hoursTotal: p.hoursTotal, hoursUsed: p.hoursUsed, plan: p.plan, mealsTotal: p.mealsTotal, mealsUsed: p.mealsUsed, expires: p.expires }; })
      .sort((a, b) => (active(b) - active(a)) || ((b.expires?.toMillis?.() || 0) - (a.expires?.toMillis?.() || 0)));
    if (!passes.length) {
      $('#status-wa').href = waLink(`Hi MR. GAMING! I can't see my pass or meal plan when I sign in with ${prettyPhone(user.phoneNumber)}.`);
      return showStatus(`No pass or meal plan on ${prettyPhone(user.phoneNumber)} yet. Bought one with a different number? Sign out and use that one, or ask us on WhatsApp.`, true);
    }
    renderPasses(passes); loaded = true;
  } catch (e) { if (!loaded) showStatus("Couldn't load your passes right now. Try again in a minute.", true); }
}

// The "Signed in" card: the profile's name (or just the number until the welcome form is saved)
function paintMe() {
  const p = cachedProfile(), name = p && user && p.uid === user.uid ? p.name : '';
  $('#me').hidden = !user;
  if (!user) return;
  $('#me-av').textContent = firstName(name).charAt(0).toUpperCase(); $('#me-av').hidden = !name;
  $('#me-name').textContent = name || 'Your account';
  $('#me-phone').textContent = prettyPhone(user.phoneNumber);
}
const profile = () => import('/assets/js/profile.js');

function startAccount() {
  $('#phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const digits = $('#phone').value.replace(/\D/g, '').replace(/^0/, '').replace(/^91(?=\d{10}$)/, '');
    if (digits.length !== 10) { msg('Enter your 10-digit mobile number.'); return; }
    $('#send-code').disabled = true; msg('Sending code…');
    const r = await sendCode('+91' + digits, $('#recaptcha'));
    $('#send-code').disabled = false;
    if (r.ok) {
      $('#phone-form').hidden = true; $('#code-form').hidden = false; $('#code').focus();
      msg(`Code sent to +91 ${digits.slice(0, 5)} ${digits.slice(5)}.`);
    } else {
      msg(r.code === 'auth/too-many-requests' ? 'Too many tries. Wait a while and try again.'
        : r.code === 'auth/invalid-phone-number' ? 'That number looks wrong. Check it and try again.'
        : "We couldn't send a code right now. Ask us on WhatsApp for your hours or meals, or try again later.");
    }
  });
  $('#code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    msg('Checking…');
    const r = await confirmCode($('#code').value.trim());
    msg(r.ok ? '' : r.code === 'no-code' ? 'Send the code again.' : 'That code is wrong or expired.');
  });
  $('#change-number').addEventListener('click', () => {
    forgetCode();
    $('#code-form').hidden = true; $('#phone-form').hidden = false; $('#code').value = ''; msg('');
  });
  $('#signout').addEventListener('click', async () => {
    $('#signout').disabled = true;
    try { await signOut(); } catch (e) { msg("Couldn't sign out right now. Try again."); }
    $('#signout').disabled = false;
  });
  $('#me-edit').addEventListener('click', () => profile().then((m) => m.editProfile()).then(paintMe));
  onUser((u) => {
    if (u && user && u.uid === user.uid) return;   // the same sign-in again (no change)
    user = u; loaded = false; bookingsLoaded = false;
    paintMe();
    $('#login').hidden = !!user;
    if (!user) { $('#mine').hidden = true; $('#booking-list').innerHTML = ''; $('#order-list').innerHTML = ''; foodRows = []; $('#status').hidden = true; $('#cards').innerHTML = ''; $('#foot').hidden = true; $('#code-form').hidden = true; $('#phone-form').hidden = false; $('#code').value = ''; msg(''); return; }
    $('#foot').textContent = `Updates on its own when we add or use hours or meals.`;
    showStatus('Loading your hours and meals…', false);
    // One login for everyone: a number on the owner list (/admins) opens the owner dashboard instead,
    // and one on the stock list (/stockStaff, and not an owner) opens the stock page.
    // The owner check, the stock check and the passes read go out together (one wait, not two).
    const passes = myPasses(); passes.catch(() => {});
    const has = (col) => getDoc(doc(db, col, u.uid)).then((a) => a.exists()).catch(() => false);
    Promise.all([has('admins'), has('stockStaff')]).then(([owner, stock]) => {
      if (user !== u) return;
      if (owner) { try { localStorage.setItem('mg-owner', u.uid); } catch (e) {} showStatus('Opening the owner dashboard…', false); location.replace('/admin'); }
      else if (stock) { try { localStorage.setItem('mg-stock', u.uid); } catch (e) {} showStatus('Opening the stock page…', false); location.replace('/stock'); }
      else {
        loadMine(passes); loadBookings();
        // A customer's first sign-in: the welcome form (name, email, WhatsApp), over the passes loading behind it
        profile().then((m) => m.ensureProfile(u)).then(paintMe).catch(() => {});
      }
    });
  });
}

const refresh = () => { if (document.visibilityState !== 'visible') return; if (linkId !== null) loadLink(); else { loadMine(); loadBookings(); } };
if (linkId !== null) loadLink(); else startAccount();
setInterval(refresh, 30000);
document.addEventListener('visibilitychange', refresh);
