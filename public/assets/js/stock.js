/* MR. Sandwich stock page (/stock): products, batches with an expiry date, first expiry first out (FEFO).
   - A batch is one delivery of one product with one expiry date (or none, e.g. plates). Two bread packets with
     different dates are two batches. "Use" takes from the earliest-expiry batch that hasn't expired, spilling into
     the next; a batch at 0 is deleted. Expired batches are not used: they show under Expired with "Throw away".
   - Every add / use / throw away writes a move to /stockMoves (history per product, newest first, last 50).
   - Use and Throw away run in a transaction, so two phones can't take the same stock twice.
   Access is enforced by firestore.rules: owners (/admins) and stock staff (/stockStaff). Everyone logs in on /pass,
   which sends stock staff here. Firestore Lite has no live listeners: everything re-reads every 30 s while the page
   is on screen, when it comes back into view, and right after any change made here. */
import {
  initializeApp, initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence, signOut, onAuthStateChanged,
  getFirestore, collection, query, where, limit, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  runTransaction, serverTimestamp, Timestamp
} from '/assets/vendor/firebase-account.0e285128.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const app = initializeApp(firebaseConfig);
const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence, browserSessionPersistence] }), db = getFirestore(app);
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const DAY_MS = 24 * 60 * 60 * 1000, SOON_DAYS = 3, EVERY = 30000;
const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CATS = ['bread', 'masala', 'drinks', 'dairy', 'veg', 'sauces', 'packing'];
const PLURAL = { packet: 'packets', carton: 'cartons', box: 'boxes', piece: 'pieces', bottle: 'bottles', tin: 'tins', bag: 'bags', litre: 'litres' };
const show = (id) => ['login', 'denied', 'dash'].forEach((x) => { $('#' + x).hidden = x !== id; });

/* ---------- dates: the shop runs on India time; an expiry is a calendar day (usable through that day) ---------- */
const istKey = (ms) => new Date(ms + 330 * 60000).toISOString().slice(0, 10);   // 'YYYY-MM-DD' in IST
const todayKey = () => istKey(Date.now());
const keyMs = (key) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
const expiryTs = (key) => Timestamp.fromMillis(keyMs(key) - 330 * 60000);        // midnight IST at the start of that day
const expKey = (b) => (b.expiry?.toMillis ? istKey(b.expiry.toMillis()) : null);   // null = no expiry
const daysLeft = (b) => { const k = expKey(b); return k === null ? Infinity : Math.round((keyMs(k) - keyMs(todayKey())) / DAY_MS); };
const isExpired = (b) => daysLeft(b) < 0;
const dayLabel = (key) => { const d = new Date(keyMs(key)); return `${WEEK[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`; };   // "Thu 23 Oct"
const whenLabel = (ts) => {
  if (!ts?.toMillis) return 'just now';
  const ms = ts.toMillis(), d = new Date(ms + 330 * 60000), h = d.getUTCHours();
  return `${dayLabel(istKey(ms))}, ${h % 12 || 12}:${pad(d.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
};
const expiryText = (b) => {
  const n = daysLeft(b), k = expKey(b);
  if (k === null) return 'No expiry';
  if (n < 0) return `Expired ${dayLabel(k)}`;
  if (n === 0) return 'Expires today';
  if (n === 1) return `Expires tomorrow · ${dayLabel(k)}`;
  return n <= SOON_DAYS ? `Expires in ${n} days · ${dayLabel(k)}` : `Expires ${dayLabel(k)}`;
};

/* ---------- quantities: decimals allowed (kg, litre…), kept to 3 places so 0.1 + 0.2 stays 0.3 ---------- */
const round = (q) => Math.round(q * 1000) / 1000;
const num = (q) => round(+q || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
const qtyUnit = (q, unit) => `${num(q)} ${q === 1 ? unit : PLURAL[unit] || unit}`;
// FEFO: earliest expiry first, no-expiry last; same date → older batch first
const fefo = (a, b) => (daysLeft(a) - daysLeft(b)) || ((a.addedAt?.toMillis?.() || 0) - (b.addedAt?.toMillis?.() || 0));
// Move ids sort newest first (inverted client time), so "productId == X, limit 50" returns the latest 50 without a composite index
const moveRef = () => doc(db, 'stockMoves', `${String(9999999999999 - Date.now()).padStart(13, '0')}-${Math.random().toString(36).slice(2, 8)}`);

/* ---------- reads: Firestore Lite has no live listeners, so each list re-reads on a timer ---------- */
const watchers = new Set();
function watch(q, cb) {
  const w = { seq: 0, done: 0, at: 0, run() {
    const n = ++w.seq; w.at = Date.now();
    getDocs(q).then((s) => { if (watchers.has(w) && n > w.done) { w.done = n; online(true); cb(s); } })
      .catch((e) => { console.warn('read failed', e.code || e); online(false); });
  } };
  watchers.add(w); w.run();
  return () => watchers.delete(w);
}
const refreshAll = () => watchers.forEach((w) => w.run());
setInterval(() => { if (document.visibilityState === 'visible') watchers.forEach((w) => { if (Date.now() - w.at >= EVERY - 1000) w.run(); }); }, 5000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshAll(); });
const online = (ok) => { $('#offline').hidden = ok; };

/* ---------- sign in happens on /pass (one login for everyone); it sends stock staff here ---------- */
$('#signout').addEventListener('click', () => signOut(auth));
const STOCK_KEY = 'mg-stock';
let known = null; try { known = localStorage.getItem(STOCK_KEY) || localStorage.getItem('mg-owner'); } catch (e) {}
let me = '', started = false;
const stopAll = () => { watchers.clear(); started = false; };
const begin = () => { if (!started) { started = true; show('dash'); startStock(); } };
const has = (col, uid) => getDoc(doc(db, col, uid)).then((a) => a.exists()).catch(() => false);
onAuthStateChanged(auth, async (user) => {
  $('#signout').hidden = !user; $('#who').textContent = user ? (user.phoneNumber || '') : '';
  me = user?.phoneNumber || '';
  if (!user) { stopAll(); try { localStorage.removeItem(STOCK_KEY); } catch (e) {} show('login'); location.replace('/pass'); return; }
  if (known && known !== user.uid) stopAll();
  const checks = Promise.all([has('admins', user.uid), has('stockStaff', user.uid)]);
  if (known === user.uid) begin();   // this device opened stock before: show it straight away (the rules still decide)
  const [owner, staff] = await checks;
  $('#owner-link').hidden = !owner;
  if (!owner && !staff) { stopAll(); try { localStorage.removeItem(STOCK_KEY); } catch (e) {} $('#uid').textContent = user.uid; return show('denied'); }
  try { localStorage.setItem(STOCK_KEY, user.uid); } catch (e) {}
  begin();
});

/* ---------- data ---------- */
let products = {}, batches = [], loadedP = false, loadedB = false, openId = null, moves = [], movesFor = null;
function startStock() {
  watch(collection(db, 'stockProducts'), (s) => { products = Object.fromEntries(s.docs.map((d) => [d.id, { id: d.id, ...d.data() }])); loadedP = true; render(); });
  watch(collection(db, 'stockBatches'), (s) => { batches = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.qty > 0); loadedB = true; render(); });
}
const batchesOf = (pid) => batches.filter((b) => b.productId === pid).sort(fefo);
// What a product has: usable stock (not expired), its next expiry, and how much has expired
function stateOf(p) {
  const all = batchesOf(p.id), good = all.filter((b) => !isExpired(b)), bad = all.filter(isExpired);
  const total = round(good.reduce((t, b) => t + b.qty, 0));
  return { all, good, bad, total, next: good[0] || null, low: total <= (+p.low || 0) };
}
const byName = (a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

/* ---------- render ---------- */
function render() {
  if (!loadedP || !loadedB) return;
  const list = Object.values(products).sort(byName), st = Object.fromEntries(list.map((p) => [p.id, stateOf(p)]));
  const unitOf = (pid) => products[pid]?.unit || '';
  const nameOf = (pid) => products[pid]?.name || 'Unknown product';

  // Expired: every expired batch, oldest first, each with "Throw away"
  const expired = batches.filter(isExpired).sort(fefo);
  fill('expired', expired.map((b) => `
    <li class="stock-row is-expired">
      <button type="button" class="stock-row-main" data-open="${esc(b.productId)}">
        <strong>${esc(nameOf(b.productId))}</strong>
        <span class="stock-row-meta">${esc(qtyUnit(b.qty, unitOf(b.productId)))} · ${esc(expiryText(b))}</span>
      </button>
      <button type="button" class="btn btn-sm stock-btn-danger press" data-waste="${esc(b.id)}">Throw away</button>
    </li>`), 'Nothing expired.');

  // Expires in 3 days or less (today included)
  const soon = batches.filter((b) => { const n = daysLeft(b); return n >= 0 && n <= SOON_DAYS; }).sort(fefo);
  fill('soon', soon.map((b) => `
    <li class="stock-row is-soon">
      <button type="button" class="stock-row-main" data-open="${esc(b.productId)}">
        <strong>${esc(nameOf(b.productId))}</strong>
        <span class="stock-row-meta">${esc(qtyUnit(b.qty, unitOf(b.productId)))} · <b class="stock-when">${esc(expiryText(b))}</b></span>
      </button>
    </li>`), 'Nothing expires in the next 3 days.');

  // Running low: usable stock at or under the product's low level
  const low = list.filter((p) => st[p.id].low);
  fill('low', low.map((p) => `
    <li class="stock-row is-low">
      <button type="button" class="stock-row-main" data-open="${esc(p.id)}">
        <strong>${esc(p.name)}</strong>
        <span class="stock-row-meta">${st[p.id].total ? `${esc(qtyUnit(st[p.id].total, p.unit))} left` : '<b class="stock-out">Out of stock</b>'} · low at ${esc(num(p.low))}</span>
      </button>
      <button type="button" class="btn btn-sm btn-ghost press" data-add="${esc(p.id)}">Add stock</button>
    </li>`), 'Nothing running low.');

  renderProducts(list, st);
  renderAddOptions(list);
  if (openId) renderProduct();
}
function fill(key, rows, empty) {
  $('#n-' + key).textContent = rows.length ? `(${rows.length})` : '';
  $('#l-' + key).innerHTML = rows.length ? rows.join('') : `<li class="admin-empty">${empty}</li>`;
  $('#l-' + key).closest('.stock-alert').classList.toggle('has-rows', rows.length > 0);
}
function renderProducts(list = Object.values(products).sort(byName), st = Object.fromEntries(list.map((p) => [p.id, stateOf(p)]))) {
  const q = $('#search').value.trim().toLowerCase();
  const rows = q ? list.filter((p) => p.name.toLowerCase().includes(q) || (p.category || '').toLowerCase().includes(q)) : list;
  $('#n-all').textContent = list.length ? `(${list.length})` : '';
  if (!list.length) { $('#products').innerHTML = '<li class="admin-empty">No products yet. Tap “New product” to add the first one.</li>'; return; }
  if (!rows.length) { $('#products').innerHTML = `<li class="admin-empty">Nothing matches “${esc(q)}”.</li>`; return; }
  $('#products').innerHTML = rows.map((p) => {
    const s = st[p.id];
    const next = s.next ? expiryText(s.next) : s.total ? 'No expiry' : 'No stock';
    return `<li><button type="button" class="stock-prod${s.low ? ' is-low' : ''}" data-open="${esc(p.id)}">
      <span class="stock-prod-name"><strong>${esc(p.name)}</strong>${p.category ? `<span class="pill">${esc(p.category)}</span>` : ''}</span>
      <span class="stock-prod-qty">${esc(qtyUnit(s.total, p.unit))}</span>
      <span class="stock-prod-meta">${esc(next)}${s.bad.length ? ` · <b class="stock-out">${s.bad.length} expired</b>` : ''}</span>
    </button></li>`;
  }).join('');
}
$('#search').addEventListener('input', () => renderProducts());

/* ---------- one product: use, batches, history ---------- */
function openProduct(pid) {
  if (!products[pid]) return;
  openId = pid; moves = movesFor === pid ? moves : []; $('#use-msg').textContent = ''; $('#use-qty').value = '1';
  renderProduct(); openSheet('#prod-dlg'); watchMoves();
}
let movesUnsub = null;
function watchMoves() {
  if (movesUnsub) movesUnsub();
  const pid = openId;
  movesUnsub = watch(query(collection(db, 'stockMoves'), where('productId', '==', pid), limit(50)), (s) => {
    if (openId !== pid) return;
    movesFor = pid; moves = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at?.toMillis?.() ?? Infinity) - (a.at?.toMillis?.() ?? Infinity));
    renderMoves();
  });
}
$('#prod-dlg').addEventListener('close', () => { openId = null; if (movesUnsub) { movesUnsub(); movesUnsub = null; } });
function renderProduct() {
  const p = products[openId];
  if (!p) { closeSheet('#prod-dlg'); return; }
  const s = stateOf(p), first = s.next;
  $('#prod-h').textContent = p.name;
  $('#prod-sub').textContent = `${qtyUnit(s.total, p.unit)} in stock${p.category ? ' · ' + p.category : ''} · low at ${num(p.low)}`;
  $('#use-unit').textContent = p.unit;
  $('#use-btn').disabled = !s.total;
  $('#prod-del').hidden = s.all.length > 0;
  $('#prod-batches').innerHTML = s.all.length ? s.all.map((b) => `
    <li class="stock-batch${isExpired(b) ? ' is-expired' : daysLeft(b) <= SOON_DAYS ? ' is-soon' : ''}${b === first ? ' is-first' : ''}">
      <div class="stock-batch-top">
        <strong>${esc(qtyUnit(b.qty, p.unit))}</strong>
        ${b === first ? '<span class="pill stock-first">Use this first</span>' : isExpired(b) ? '<span class="pill stock-pill-danger">Expired</span>' : ''}
      </div>
      <p class="stock-row-meta">${esc(expiryText(b))}</p>
      ${b.note ? `<p class="stock-row-meta">${esc(b.note)}</p>` : ''}
      <p class="stock-row-meta">Added ${esc(whenLabel(b.addedAt))}${b.addedBy ? ' by ' + esc(who(b.addedBy)) : ''}</p>
      <div class="admin-actions"><button type="button" class="btn btn-sm ${isExpired(b) ? 'stock-btn-danger' : 'btn-ghost'} press" data-waste="${esc(b.id)}">Throw away</button></div>
    </li>`).join('') : '<li class="admin-empty">No stock. Tap “Add stock” when a delivery comes in.</li>';
  renderMoves();
}
const MOVE = { add: 'Added', use: 'Used', waste: 'Thrown away' };
const who = (by) => (by && by === me ? 'you' : prettyPhone(by));
const prettyPhone = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p || ''); };
function renderMoves() {
  const p = products[openId]; if (!p) return;
  $('#prod-moves').innerHTML = movesFor !== openId ? '<li class="admin-empty">Loading…</li>'
    : moves.length ? moves.map((m) => `
      <li class="stock-move is-${esc(m.type)}">
        <span class="stock-move-what"><b>${esc(MOVE[m.type] || m.type)}</b> ${esc(qtyUnit(m.qty, p.unit))}</span>
        <span class="stock-row-meta">${esc(whenLabel(m.at))} · ${esc(who(m.by))}</span>
      </li>`).join('') : '<li class="admin-empty">Nothing yet.</li>';
}

// Use: takes from the earliest-expiry batch that hasn't expired, then the next. The batches are read again inside
// the transaction, so a second phone using the same stock at the same moment can't take it twice.
async function useStock(pid, want) {
  const ids = (await getDocs(query(collection(db, 'stockBatches'), where('productId', '==', pid)))).docs.map((d) => d.id);
  return runTransaction(db, async (tx) => {
    const snaps = await Promise.all(ids.map((id) => tx.get(doc(db, 'stockBatches', id))));
    const live = snaps.filter((x) => x.exists()).map((x) => ({ id: x.id, ...x.data() })).filter((b) => b.qty > 0 && !isExpired(b)).sort(fefo);
    const have = round(live.reduce((t, b) => t + b.qty, 0));
    if (have < want) throw Object.assign(new Error('short'), { have });
    let left = want; const taken = [];
    for (const b of live) {
      if (left <= 0) break;
      const take = round(Math.min(b.qty, left)), rest = round(b.qty - take), ref = doc(db, 'stockBatches', b.id);
      if (rest <= 0) tx.delete(ref); else tx.update(ref, { qty: rest });
      tx.set(moveRef(), { productId: pid, batchId: b.id, type: 'use', qty: take, at: serverTimestamp(), by: me });
      taken.push({ take, b }); left = round(left - take);
    }
    return taken;
  });
}
$('#use-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = products[openId], want = round(+$('#use-qty').value), msg = $('#use-msg');
  if (!p) return;
  if (!(want > 0)) { msg.textContent = 'Enter how many you used.'; return; }
  $('#use-btn').disabled = true; msg.textContent = 'Saving…';
  try {
    const taken = await useStock(p.id, want);
    msg.textContent = `Used ${qtyUnit(want, p.unit)}: ` + taken.map(({ take, b }) => `${num(take)} from the batch ${b.expiry ? 'expiring ' + dayLabel(expKey(b)) : 'with no expiry'}`).join(', then ') + '.';
    $('#use-qty').value = '1';
  } catch (err) {
    msg.textContent = err.have !== undefined
      ? (err.have ? `Only ${qtyUnit(err.have, p.unit)} left that hasn't expired. Nothing was taken.` : 'None left that hasn’t expired. Nothing was taken.')
      : 'Could not save. Check your connection.';
  }
  $('#use-btn').disabled = false;
  refreshAll();
});

// Throw away: records the waste and removes the batch (read again in the transaction, so it's thrown away once)
async function throwAway(bid) {
  const b = batches.find((x) => x.id === bid), p = b && products[b.productId];
  if (!b || !confirm(`Throw away ${qtyUnit(b.qty, p?.unit || '')} of ${p?.name || 'this product'} (${expiryText(b)})? This removes the batch.`)) return;
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, 'stockBatches', bid), snap = await tx.get(ref);
      if (!snap.exists()) throw Object.assign(new Error('gone'), { gone: true });
      tx.delete(ref);
      tx.set(moveRef(), { productId: snap.data().productId, batchId: bid, type: 'waste', qty: snap.data().qty, at: serverTimestamp(), by: me });
    });
  } catch (err) { alert(err.gone ? 'Someone already removed this batch.' : 'Could not save. Check your connection.'); }
  refreshAll();
}

/* ---------- sheets (dialogs) ---------- */
function openSheet(sel) { const d = $(sel); if (!d.open) d.showModal(); }
function closeSheet(sel) { const d = $(sel); if (d.open) d.close(); }
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (e) => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });   // tap outside or ×
});
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-open], [data-waste], [data-add]'); if (!t) return;
  if (t.dataset.waste) return throwAway(t.dataset.waste);
  if (t.dataset.add) { closeSheet('#prod-dlg'); return openAdd(t.dataset.add); }
  if (t.dataset.open) openProduct(t.dataset.open);
});

/* ---------- add stock ---------- */
function renderAddOptions(list) {
  const sel = $('#add-product'), keep = sel.value;
  sel.innerHTML = '<option value="">Choose a product</option>' + list.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.category ? ' · ' + esc(p.category) : ''}</option>`).join('');
  if (products[keep]) sel.value = keep;
  addUnit();
}
const addUnit = () => { const p = products[$('#add-product').value]; $('#add-unit').textContent = p ? p.unit : ''; };
$('#add-product').addEventListener('change', addUnit);
$('#add-noexp').addEventListener('change', (e) => { $('#add-expiry').disabled = e.target.checked; $('#add-expiry').required = !e.target.checked; });
function openAdd(pid = '') {
  $('#add-form').reset(); $('#add-expiry').disabled = false; $('#add-expiry').required = true; $('#add-msg').textContent = '';
  $('#add-expiry').min = todayKey();
  renderAddOptions(Object.values(products).sort(byName));
  $('#add-product').value = products[pid] ? pid : ''; addUnit();
  openSheet('#add-dlg');
  (pid ? $('#add-qty') : $('#add-product')).focus();
}
$('#open-add').addEventListener('click', () => openAdd());
$('#prod-add').addEventListener('click', () => { const pid = openId; closeSheet('#prod-dlg'); openAdd(pid); });
$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = products[$('#add-product').value], qty = round(+$('#add-qty').value), none = $('#add-noexp').checked, exp = $('#add-expiry').value, msg = $('#add-msg');
  if (!p) { msg.textContent = 'Choose a product (or add it with “New product”).'; return; }
  if (!(qty > 0 && qty <= 100000)) { msg.textContent = 'Enter a quantity above 0.'; return; }
  if (!none && !/^\d{4}-\d{2}-\d{2}$/.test(exp)) { msg.textContent = 'Pick the expiry date, or tick “No expiry”.'; return; }
  if (!none && exp < todayKey() && !confirm(`That date (${dayLabel(exp)}) has already passed. Add it as expired stock?`)) return;
  msg.textContent = 'Saving…';
  try {
    const ref = doc(collection(db, 'stockBatches')), batch = writeBatch(db);
    batch.set(ref, { productId: p.id, qty, expiry: none ? null : expiryTs(exp), note: $('#add-note').value.trim().slice(0, 100), addedAt: serverTimestamp(), addedBy: me });
    batch.set(moveRef(), { productId: p.id, batchId: ref.id, type: 'add', qty, at: serverTimestamp(), by: me });
    await batch.commit();
    closeSheet('#add-dlg');
    refreshAll(); openProduct(p.id);
    $('#use-msg').textContent = `Added ${qtyUnit(qty, p.unit)}${none ? ', no expiry' : `, expiring ${dayLabel(exp)}`}.`;
  } catch (err) { msg.textContent = 'Could not save. Check your connection.'; refreshAll(); }
});

/* ---------- new / edit product ---------- */
let editing = null;
const unitValue = () => ($('#new-unit').value || $('#new-unit-other').value.trim()).slice(0, 20);
function unitUi() {
  const other = $('#new-unit').value === '';
  $('#new-unit-other-wrap').hidden = !other; $('#new-unit-other').required = other;
  $('#new-low-unit').textContent = unitValue();
}
$('#new-unit').addEventListener('change', unitUi);
$('#new-unit-other').addEventListener('input', unitUi);
function openNew(pid = null) {
  editing = pid && products[pid] ? pid : null;
  const p = editing ? products[editing] : null, form = $('#new-form');
  form.reset(); $('#new-msg').textContent = '';
  const cats = [...new Set([...CATS, ...Object.values(products).map((x) => (x.category || '').toLowerCase()).filter(Boolean)])].sort();
  $('#cats').innerHTML = cats.map((c) => `<option value="${esc(c)}"></option>`).join('');
  $('#new-h').textContent = p ? 'Edit product' : 'New product';
  $('#new-submit').textContent = p ? 'Save' : 'Add product';
  if (p) {
    $('#new-name').value = p.name; $('#new-cat').value = p.category || ''; $('#new-low').value = String(p.low ?? 0);
    const known = [...$('#new-unit').options].some((o) => o.value && o.value === p.unit);
    $('#new-unit').value = known ? p.unit : ''; $('#new-unit-other').value = known ? '' : p.unit;
  }
  unitUi(); openSheet('#new-dlg'); $('#new-name').focus();
}
$('#open-new').addEventListener('click', () => openNew());
$('#prod-edit').addEventListener('click', () => { const pid = openId; closeSheet('#prod-dlg'); openNew(pid); });
$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#new-name').value.trim().replace(/\s+/g, ' ').slice(0, 60), unit = unitValue(), category = $('#new-cat').value.trim().toLowerCase().slice(0, 30), low = round(+$('#new-low').value), msg = $('#new-msg');
  if (!name) { msg.textContent = 'Enter the product name.'; return; }
  if (!unit) { msg.textContent = 'Choose or type the unit.'; return; }
  if (!(low >= 0 && low <= 100000)) { msg.textContent = 'Running low at must be 0 or more.'; return; }
  const twin = Object.values(products).find((x) => x.id !== editing && x.name.toLowerCase() === name.toLowerCase());
  if (twin) { msg.textContent = `“${name}” is already a product. Add stock to it instead.`; return; }
  msg.textContent = 'Saving…';
  try {
    let pid = editing;
    if (editing) await updateDoc(doc(db, 'stockProducts', editing), { name, unit, category, low });
    else { const ref = doc(collection(db, 'stockProducts')); pid = ref.id; await setDoc(ref, { name, unit, category, low, createdAt: serverTimestamp() }); products[pid] = { id: pid, name, unit, category, low }; }
    closeSheet('#new-dlg');
    refreshAll();
    if (editing) openProduct(pid); else openAdd(pid);   // a new product usually comes with its first delivery
  } catch (err) { msg.textContent = 'Could not save. Check your connection.'; }
});
$('#prod-del').addEventListener('click', async () => {
  const p = products[openId]; if (!p || batchesOf(p.id).length) return;
  if (!confirm(`Delete ${p.name}? It has no stock. Its history stays in the database.`)) return;
  try { await deleteDoc(doc(db, 'stockProducts', p.id)); delete products[p.id]; closeSheet('#prod-dlg'); } catch (err) { alert('Could not delete. Check your connection.'); }
  refreshAll();
});
