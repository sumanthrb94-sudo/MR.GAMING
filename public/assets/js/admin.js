/* MR. GAMING owner page: requests, schedule (block / free hours) and passes.
   Access is enforced by firestore.rules (owner = signed-in user listed in /admins). */
import {
  initializeApp, getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail,
  getFirestore, collection, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  addDoc, serverTimestamp, Timestamp, increment
} from '/assets/vendor/firebase-admin.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app), db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const pad = (n) => String(n).padStart(2, '0');
const clock = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
const OPEN = 11, CLOSE = 23, PASS = { solo: { price: 899, label: 'Solo pass' }, duo: { price: 1499, label: 'Duo pass' } };
const NAMES = { ps5: 'PS5', xbox: 'Xbox', squad: 'Squad room' };
const nowIst = () => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); };
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const show = (id) => ['login', 'denied', 'dash'].forEach((x) => { $('#' + x).hidden = x !== id; });

/* ---------- sign in ---------- */
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-msg').textContent = 'Signing in…';
  try { await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value); $('#login-msg').textContent = ''; }
  catch (err) { $('#login-msg').textContent = 'Wrong email or password.'; }
});
$('#forgot').addEventListener('click', async () => {
  const email = $('#email').value.trim();
  if (!email) { $('#login-msg').textContent = 'Type your email first.'; return; }
  try { await sendPasswordResetEmail(auth, email); $('#login-msg').textContent = 'Reset link sent. Check your email.'; }
  catch (err) { $('#login-msg').textContent = 'Could not send the reset link.'; }
});
$('#signout').addEventListener('click', () => signOut(auth));

let unsub = [];
onAuthStateChanged(auth, async (user) => {
  unsub.forEach((u) => u()); unsub = [];
  $('#signout').hidden = !user; $('#who').textContent = user ? user.email : '';
  if (!user) return show('login');
  const isOwner = (await getDoc(doc(db, 'admins', user.uid)).catch(() => null))?.exists();
  if (!isOwner) { $('#uid').textContent = user.uid; return show('denied'); }
  show('dash'); startDashboard();
});

/* ---------- dashboard ---------- */
let day = keyOf(nowIst()), requests = [], holds = [];

function startDashboard() {
  // Day chips: yesterday to 7 days ahead
  const t = nowIst(), days = $('#days');
  days.querySelectorAll('button').forEach((b) => b.remove());
  for (let i = -1; i <= 7; i++) {
    const d = new Date(t.getFullYear(), t.getMonth(), t.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : i === -1 ? 'Yesterday' : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    $('.seg-ind', days).insertAdjacentHTML('beforebegin', `<button type="button" data-value="${keyOf(d)}" aria-pressed="${keyOf(d) === day}">${label}</button>`);
  }
  days.onclick = (e) => { const b = e.target.closest('button'); if (b) { day = b.dataset.value; markDay(); watchDay(); } };
  markDay(); watchDay(); watchPasses();
}
function markDay() {
  const days = $('#days');
  days.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === day)));
  const on = days.querySelector('[aria-pressed="true"]'), ind = $('.seg-ind', days);
  Object.assign(ind.style, { width: on.offsetWidth + 'px', height: on.offsetHeight + 'px', transform: `translate(${on.offsetLeft}px, ${on.offsetTop}px)` });
}

let dayUnsub = [];
function watchDay() {
  dayUnsub.forEach((u) => u());
  dayUnsub = [
    onSnapshot(query(collection(db, 'requests'), where('date', '==', day)), (s) => { requests = s.docs.map((d) => d.data()); renderRequests(); }),
    onSnapshot(query(collection(db, 'holds'), where('date', '==', day)), (s) => { holds = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderSched(); })
  ];
  unsub.push(...dayUnsub);
}

/* requests */
const holdIds = (r) => (r.station === 'squad' ? ['ps5', 'xbox'] : [r.station])
  .flatMap((c) => Array.from({ length: r.hours }, (_, i) => `${r.date}_${c}_${r.start + i}`));

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
      <p class="admin-item-meta">${esc(NAMES[r.station] || r.station)} · ${r.players} player${r.players > 1 ? 's' : ''} · ${esc(r.plan === 'use-pass' ? 'uses pass' : r.plan === 'buy-pass' ? 'buys pass' : 'hourly')}${r.game ? ' · ' + esc(r.game) : ''}${r.food ? ' · ' + esc(r.food) : ''}</p>
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
  const batch = writeBatch(db), ref = doc(db, 'requests', r.id);
  if (act === 'confirm') { batch.update(ref, { status: 'confirmed' }); holdIds(r).forEach((id) => batch.set(doc(db, 'holds', id), { status: 'confirmed' }, { merge: true })); }
  if (act === 'done') batch.update(ref, { status: 'done' });
  if (act === 'noshow') { batch.update(ref, { status: 'no-show' }); holdIds(r).forEach((id) => batch.delete(doc(db, 'holds', id))); }
  if (act === 'cancel') { batch.update(ref, { status: 'cancelled' }); holdIds(r).forEach((id) => batch.delete(doc(db, 'holds', id))); }
  b.disabled = true;
  try { await batch.commit(); } catch (err) { alert('Could not save. Check your connection.'); b.disabled = false; }
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
});

/* passes */
function watchPasses() {
  unsub.push(onSnapshot(query(collection(db, 'passes'), orderBy('createdAt', 'desc')), (s) => {
    const list = $('#passes');
    if (s.empty) { list.innerHTML = '<li class="admin-empty">No passes yet.</li>'; return; }
    const now = Date.now();
    list.innerHTML = s.docs.map((d) => {
      const p = d.data(), left = (p.hoursTotal || 6) - (p.hoursUsed || 0);
      const exp = p.expires?.toDate ? p.expires.toDate() : null, expired = exp && exp.getTime() < now;
      return `<li class="card admin-item ${expired || left <= 0 ? 'is-dim' : ''}">
        <div class="admin-item-top"><strong>${esc(p.name)}</strong><span class="pill">${esc(PASS[p.type]?.label || p.type)}</span></div>
        <p class="admin-item-meta">${p.phone ? esc(p.phone) + ' · ' : ''}${left} of ${p.hoursTotal || 6} hrs left · ${exp ? (expired ? 'expired ' : 'valid till ') + exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}</p>
        <div class="admin-actions">
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-use="1" ${left < 1 ? 'disabled' : ''}>Use 1 hr</button>
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-use="2" ${left < 2 ? 'disabled' : ''}>Use 2 hrs</button>
          <button class="btn btn-sm btn-ghost press" data-pass="${d.id}" data-del="1">Delete</button>
        </div>
      </li>`;
    }).join('');
  }));
}
$('#pass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = $('#pass-type').value;
  const expires = Timestamp.fromMillis(Date.now() + 30 * 24 * 60 * 60 * 1000);
  try {
    await addDoc(collection(db, 'passes'), { name: $('#pass-name').value.trim(), phone: $('#pass-phone').value.trim(), type, price: PASS[type].price, hoursTotal: 6, hoursUsed: 0, expires, createdAt: serverTimestamp() });
    e.target.reset();
  } catch (err) { alert('Could not save the pass.'); }
});
$('#passes').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-pass]'); if (!b) return;
  const ref = doc(db, 'passes', b.dataset.pass);
  try {
    if (b.dataset.del) { if (confirm('Delete this pass?')) await deleteDoc(ref); }
    else await updateDoc(ref, { hoursUsed: increment(+b.dataset.use) });
  } catch (err) { alert('Could not save.'); }
});

