/* MR. GAMING "My pass" (/pass).
   Two ways in:
   - /pass?id=...  the link the owner sends: reads that one pass card (first name and hours only, no sign-in)
   - /pass         the customer signs in with their mobile number + SMS code and sees every pass saved
                   under that number (firestore.rules lets a signed-in number read only its own passes).
                   The same login serves the owner: a number listed in /admins is sent to /admin.
   Hours are re-read every 30 seconds and when the page comes back into view. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence,
  RecaptchaVerifier, signInWithPhoneNumber, signOut, onAuthStateChanged,
  getFirestore, collection, query, where, getDocs, getDoc, doc
} from '/assets/vendor/firebase-account.582e56a7.js';
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
    <a class="btn btn-accent press" data-f="book" href="/#book">Book with my pass <svg class="i"><use href="#i-arrow"/></svg></a>
    <a class="btn btn-ghost press" data-f="wa" href="https://wa.me/${WA}" target="_blank" rel="noopener"><svg class="i"><use href="#i-wa"/></svg> WhatsApp us</a>
  </div>`;

// passes: [{ id, first, type, hoursTotal, hoursUsed, expires }]; cards are updated in place so numbers count and bars slide
function renderPasses(passes) {
  $('#status').hidden = true; $('#foot').hidden = false;
  const box = $('#cards'), keep = new Set(passes.map((p) => p.id));
  box.querySelectorAll('[data-id]').forEach((el) => { if (!keep.has(el.dataset.id)) el.remove(); });
  passes.forEach((p, i) => {
    let card = box.querySelector(`[data-id="${CSS.escape(p.id)}"]`);
    if (!card) { card = document.createElement('section'); card.className = 'card pass-card'; card.dataset.id = p.id; card.innerHTML = CARD; }
    box.appendChild(card);   // keeps the sort order
    const f = (k) => $(`[data-f="${k}"]`, card);
    const total = p.hoursTotal || 0, left = Math.max(0, total - (p.hoursUsed || 0));
    const exp = p.expires && p.expires.toDate ? p.expires.toDate() : null, expired = !!exp && exp.getTime() < Date.now();
    const label = LABEL[p.type] || 'Pass', date = exp ? exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
    f('kind').textContent = label;
    f('hi').textContent = i === 0 ? `Hi ${p.first || 'there'},` : 'Another pass';
    countTo(f('left'), left);
    f('of').textContent = `${left === 1 ? 'hr' : 'hrs'} left of ${total}`;
    f('fill').style.width = total ? `${(left / total) * 100}%` : '0%';
    const member = !expired && left === 0, kind = p.type === 'duo' ? 'duo' : 'solo';
    f('meta').textContent = expired ? `Expired on ${date}. Ask us about topping up.`
      : member ? `All hours used. Until ${date} you play at the member rate: ₹${MEMBER[kind]}/hr.` : exp ? `Valid till ${date}` : '';
    card.classList.toggle('is-dim', expired);
    f('book').hidden = expired;
    f('book').href = `/?pass=${kind}${member ? '&rate=member' : ''}#book`;
    f('book').firstChild.textContent = member ? 'Book at member rate ' : 'Book with my pass ';
    f('wa').href = waLink(`Hi MR. GAMING! About my ${label.toLowerCase()} (${left} hrs left).`);
  });
}
const active = (p) => (p.hoursTotal || 0) - (p.hoursUsed || 0) > 0 && !(p.expires?.toDate && p.expires.toDate() < new Date());

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
    const passes = snap.docs.map((d) => { const p = d.data(); return { id: d.id, first: firstName(p.name), type: p.type, hoursTotal: p.hoursTotal, hoursUsed: p.hoursUsed, expires: p.expires }; })
      .sort((a, b) => (active(b) - active(a)) || ((b.expires?.toMillis?.() || 0) - (a.expires?.toMillis?.() || 0)));
    if (!passes.length) {
      $('#status-wa').href = waLink(`Hi MR. GAMING! I can't see my pass when I sign in with ${prettyPhone(user.phoneNumber)}.`);
      return showStatus(`No pass on ${prettyPhone(user.phoneNumber)} yet. Bought one with a different number? Sign out and use that one, or ask us on WhatsApp.`, true);
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
        : "We couldn't send a code right now. Ask us on WhatsApp for your hours, or try again later.");
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
    $('#foot').textContent = user ? `Signed in as ${prettyPhone(user.phoneNumber)}. Updates on its own when we add or use hours.` : '';
    $('#signout').hidden = !user;
    $('#login').hidden = !!user;
    if (!user) { $('#status').hidden = true; $('#cards').innerHTML = ''; $('#foot').hidden = true; $('#code-form').hidden = true; $('#phone-form').hidden = false; $('#code').value = ''; return; }
    showStatus('Loading your hours…', false);
    // One login for everyone: a number on the owner list (/admins) opens the owner dashboard instead.
    // The owner check and the passes read go out together (one wait, not two).
    const passes = myPasses(); passes.catch(() => {});
    getDoc(doc(db, 'admins', u.uid)).then((a) => {
      if (a.exists()) { try { localStorage.setItem('mg-owner', u.uid); } catch (e) {} showStatus('Opening the owner dashboard…', false); location.replace('/admin'); } else loadMine(passes);
    }).catch(() => loadMine(passes));
  });
}

const refresh = () => { if (document.visibilityState === 'visible') (linkId !== null ? loadLink : loadMine)(); };
if (linkId !== null) loadLink(); else startAccount();
setInterval(refresh, 30000);
document.addEventListener('visibilitychange', refresh);
