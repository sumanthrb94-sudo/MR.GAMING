/* MR. GAMING "My pass" (/pass): gaming passes (hours left) and MR. Sandwich meal plans (meals left, type 'meals').
   Two ways in:
   - /pass?id=...  the link the owner sends: reads that one pass card (first name and hours or meals only, no sign-in)
   - /pass         the customer signs in with their mobile number + SMS code and sees every pass and meal plan saved
                   under that number (firestore.rules lets a signed-in number read only its own passes).
                   The same login serves the owner: a number listed in /admins is sent to /admin,
                   and stock staff (listed in /stockStaff) are sent to /stock.
   Hours and meals are re-read every 30 seconds and when the page comes back into view. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged,
  getFirestore, collection, query, where, getDocs, getDoc, doc
} from '/assets/vendor/firebase-account.0e285128.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const $ = (s, r = document) => r.querySelector(s);
const WA = '917337230311';
const LABEL = { solo: 'Solo pass', duo: 'Duo pass' };
const MEMBER = { solo: 169, duo: 279 };   // member rate per hour once the hours are used, until the pass's 30 days end (CONFIG.memberRates in main.js)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = initializeApp(firebaseConfig), db = getFirestore(app);
const linkId = new URLSearchParams(location.search).get('id');
const firstName = (n) => String(n || '').trim().split(/\s+/)[0].slice(0, 20);
const prettyPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : p; };
const waLink = (text) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;
const isMeals = (p) => p.type === 'meals';
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

/* ---------- way 2: sign in with mobile number ---------- */
let user = null, verifier = null, confirmation = null;
const msg = (t) => { $('#login-msg').textContent = t; };
const resetVerifier = () => { if (verifier) { verifier.clear(); verifier = null; } };

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

function startAccount() {
  // Same persistence list as getAuth(), so existing sign-ins carry over
  const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }); auth.languageCode = 'en';
  $('#phone-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const digits = $('#phone').value.replace(/\D/g, '').replace(/^0/, '').replace(/^91(?=\d{10}$)/, '');
    if (digits.length !== 10) { msg('Enter your 10-digit mobile number.'); return; }
    $('#send-code').disabled = true; msg('Sending code…');
    try {
      resetVerifier();
      verifier = new RecaptchaVerifier(auth, 'recaptcha', { size: 'invisible' });
      confirmation = await signInWithPhoneNumber(auth, '+91' + digits, verifier);
      $('#phone-form').hidden = true; $('#code-form').hidden = false; $('#code').focus();
      msg(`Code sent to +91 ${digits.slice(0, 5)} ${digits.slice(5)}.`);
    } catch (err) {
      resetVerifier();
      msg(err.code === 'auth/too-many-requests' ? 'Too many tries. Wait a while and try again.'
        : err.code === 'auth/invalid-phone-number' ? 'That number looks wrong. Check it and try again.'
        : "We couldn't send a code right now. Ask us on WhatsApp for your hours or meals, or try again later.");
      if (err.code) console.warn('Sign-in code not sent:', err.code);
    } finally { $('#send-code').disabled = false; }
  });
  $('#code-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!confirmation) return;
    msg('Checking…');
    try { await confirmation.confirm($('#code').value.trim()); msg(''); } catch (err) { msg('That code is wrong or expired.'); }
  });
  $('#change-number').addEventListener('click', () => {
    confirmation = null; resetVerifier();
    $('#code-form').hidden = true; $('#phone-form').hidden = false; $('#code').value = ''; msg('');
  });
  $('#signout').addEventListener('click', () => signOut(auth));
  onAuthStateChanged(auth, (u) => {
    user = u && u.phoneNumber ? u : null; loaded = false;
    $('#who').textContent = user ? prettyPhone(user.phoneNumber) : '';
    $('#foot').textContent = user ? `Signed in as ${prettyPhone(user.phoneNumber)}. Updates on its own when we add or use hours or meals.` : '';
    $('#signout').hidden = !user;
    $('#login').hidden = !!user;
    if (!user) { $('#status').hidden = true; $('#cards').innerHTML = ''; $('#foot').hidden = true; $('#code-form').hidden = true; $('#phone-form').hidden = false; $('#code').value = ''; return; }
    showStatus('Loading your hours and meals…', false);
    // One login for everyone: a number on the owner list (/admins) opens the owner dashboard instead,
    // and one on the stock list (/stockStaff, and not an owner) opens the stock page.
    // The owner check, the stock check and the passes read go out together (one wait, not two).
    const passes = myPasses(); passes.catch(() => {});
    const has = (col) => getDoc(doc(db, col, u.uid)).then((a) => a.exists()).catch(() => false);
    Promise.all([has('admins'), has('stockStaff')]).then(([owner, stock]) => {
      if (owner) { try { localStorage.setItem('mg-owner', u.uid); } catch (e) {} showStatus('Opening the owner dashboard…', false); location.replace('/admin'); }
      else if (stock) { try { localStorage.setItem('mg-stock', u.uid); } catch (e) {} showStatus('Opening the stock page…', false); location.replace('/stock'); }
      else loadMine(passes);
    });
  });
}

const refresh = () => { if (document.visibilityState === 'visible') (linkId !== null ? loadLink : loadMine)(); };
if (linkId !== null) loadLink(); else startAccount();
setInterval(refresh, 30000);
document.addEventListener('visibilitychange', refresh);
