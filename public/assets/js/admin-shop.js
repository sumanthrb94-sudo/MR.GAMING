/* MR. Console (/admin), MR. Sandwich side: food orders, bills and the shop settings. admin.js calls initShop() once the
   owner is signed in and passes its helpers (reads on timers, toasts, the new-order pop-up).
   Food orders  foodOrders from /menu (order.js): a tiny "anything new?" query every 6 s on screen (30 s in a background
                tab) pops new ones up like bookings (sheet, chime, notification, title count; ack/ackAt/ackBy when seen).
                placed → accepted → preparing → out for delivery (delivery) / ready for pickup (pickup) → delivered /
                picked up; or cancelled with a reason the customer sees. Call, WhatsApp (the status as a message), Maps.
                Each line is checked against today's menu price (menu-data.js + menuOverrides): a difference is flagged.
   Bills        "Bill" on a food order, booking, birthday, pass or meal plan: the lines are filled in from it and can be
                edited, then one transaction takes the next number from counters/bills-<FY> (MS-2026-27-0001 …), writes
                bills/{random id} and marks the order or booking with { bill: { id, no } }. GST only when settings/shop
                has a GSTIN (shop.js billMath). A bill never changes; an owner can void it with a reason (the order can
                then be billed again). Today's takings by kind and by cash / UPI / card come from the bills; CSV for any dates.
   Settings     settings/shop: "Set shop location" (this phone's GPS, once, at the shop), free-delivery radius, delivery
                on/off, GSTIN, legal name, food and gaming GST %, menu prices before or including GST.
   Every value that came from a customer goes through esc() before it is put in HTML. */
import {
  collection, query, where, orderBy, getDocs, doc, getDoc, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, Timestamp
} from '/assets/vendor/firebase-account.0e285128.js';
import { withDefaults, hasLocation, billMath, fyOf, GSTIN_RE } from '/assets/js/shop.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const DAY_MS = 24 * 60 * 60 * 1000;
const FOOD_PERK = 0.10;   // 10% off food for console bookers (CONFIG.foodPerk in main.js)
const FINAL = ['delivered', 'picked', 'cancelled'];
const NEXT = { placed: 'accepted', accepted: 'preparing', out: 'delivered', ready: 'picked' };
const nextOf = (o) => (o.status === 'preparing' ? (o.mode === 'delivery' ? 'out' : 'ready') : NEXT[o.status]);
const STEP_BTN = { accepted: 'Accept', preparing: 'Preparing', out: 'Out for delivery', ready: 'Ready for pickup', delivered: 'Delivered', picked: 'Picked up' };
const STATUS = { placed: 'new', accepted: 'accepted', preparing: 'preparing', out: 'out for delivery', ready: 'ready', delivered: 'delivered', picked: 'picked up', cancelled: 'cancelled' };
// What the customer reads on WhatsApp for each status
const WA_STATUS = {
  placed: 'has reached us', accepted: 'is accepted', preparing: 'is being prepared', out: 'is out for delivery',
  ready: 'is ready for pickup', delivered: 'is delivered. Thank you!', picked: 'is picked up. Thank you!', cancelled: 'is cancelled'
};
const KIND = { food: 'Food', gaming: 'Gaming', birthday: 'Birthday', pass: 'Gaming pass', meals: 'Meal plan' };
const METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card' };

export function initShop(c) {
  const { db, esc, inr, pad, clock, dayName, timeOf, istKey, waDigits, telHref, firstName } = c;
  const inr2 = (n) => '₹' + (+n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // India-time midnight, `days` from today, in ms
  const dayStart = (days = 0, key = istKey(Date.now())) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) - 330 * 60000 + days * DAY_MS;
  const ms = (ts) => ts?.toMillis?.() || 0;
  const billUrl = (id, receipt) => `${location.origin}/bill?id=${encodeURIComponent(id)}${receipt ? '&print=receipt' : ''}`;

  /* ---------- settings/shop ---------- */
  let saved = null, settings = withDefaults(null), settingsAt = 0;
  async function readSettings() {
    try { const s = await getDoc(doc(db, 'settings', 'shop')); saved = s.exists() ? s.data() : null; settings = withDefaults(saved); settingsAt = Date.now(); }
    catch (e) { console.warn('settings read failed', e.code || e); }
    paintGstNote();
    return settings;
  }
  const settingsFresh = () => (Date.now() - settingsAt < 60000 ? Promise.resolve(settings) : readSettings());

  /* ---------- today's menu prices, to check each food order line against ---------- */
  let livePrices = null, pricesAt = 0, pricesLoad = null;
  function ensurePrices() {
    if (pricesLoad && Date.now() - pricesAt < 120000) return pricesLoad;
    pricesLoad = Promise.all([window.MENU ? null : c.loadScript('/assets/js/menu-data.js'), import('/assets/js/menu-live.js'), getDocs(collection(db, 'menuOverrides'))])
      .then(([, live, snap]) => { livePrices = live.priceList(window.MENU, new Map(snap.docs.map((d) => [d.id, d.data()]))); pricesAt = Date.now(); renderFood(); })
      .catch((e) => { console.warn('menu prices not loaded', e); pricesLoad = null; });
    return pricesLoad;
  }

  /* ---------- food orders ---------- */
  let food = new Map(), foodLoaded = false, newest = 0, tab = store.get('mg-console-orders') === 'food' ? 'food' : 'gaming';
  const isNew = (o) => o.status === 'placed' && o.ack !== true;
  const merge = (docs) => docs.forEach((d) => { const o = { ...d.data(), id: d.id }; food.set(o.id, o); newest = Math.max(newest, ms(o.createdAt)); });
  function watchFood() {
    // Yesterday and today: the full list every 30 s on screen (and after any change); the probe below covers a background tab
    c.watch(() => query(collection(db, 'foodOrders'), where('createdAt', '>=', Timestamp.fromMillis(dayStart(-1)))), (s) => {
      food = new Map(); merge(s.docs); foodLoaded = true; renderFood();
    }, { every: 30000 });
    // "Anything new?": orders created after the newest one we have (usually 0 documents)
    c.watch(() => query(collection(db, 'foodOrders'), where('createdAt', '>', Timestamp.fromMillis(newest || Date.now() - 10 * 60000))), (s) => {
      if (!foodLoaded || s.empty) return;
      merge(s.docs); renderFood();
    }, { every: 6000, hidden: 30000, when: () => foodLoaded });
  }
  const itemsText = (o) => (o.items || []).map((l) => `${l.qty} × ${l.name}${l.col ? ` (${l.col})` : ''}`).join(', ');
  const count = (o) => (o.items || []).reduce((t, l) => t + (+l.qty || 0), 0);
  const modeText = (o) => (o.mode === 'delivery' ? `Delivery${o.distanceKm != null ? ` · ${(+o.distanceKm).toFixed(1)} km` : ''}` : 'Pickup');
  const waStatus = (o) => `https://wa.me/${waDigits(o.phone)}?text=${encodeURIComponent(`Hi ${firstName(o.name)}, your MR. Sandwich order ${o.id} ${WA_STATUS[o.status] || 'is with us'}${o.status === 'cancelled' && o.cancelReason ? `: ${o.cancelReason}` : '.'}`)}`;
  const mapsUrl = (o) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.lat},${o.lng}`)}`;
  // A line whose price isn't today's menu price (or that is no longer on the menu) is flagged for the owner
  const priceFlag = (l) => {
    if (!livePrices) return '';
    const now = livePrices.get(l.id);
    if (!now || now.hidden) return '<span class="con-warn">not on the menu now</span>';
    return now.price !== l.price ? `<span class="con-warn">menu price now ${inr(now.price)}</span>` : '';
  };
  function foodCard(o) {
    const id = esc(o.id), next = nextOf(o), wa = waDigits(o.phone), live = !FINAL.includes(o.status);
    return `<li class="card admin-item con-food-item status-${esc(o.status)}${isNew(o) ? ' is-new' : ''}" data-food-order="${id}">
      <div class="admin-item-top"><strong>${esc(timeOf(o.createdAt))}${o.createdAt && istKey(ms(o.createdAt)) !== istKey(Date.now()) ? ' yesterday' : ''} · ${esc(modeText(o))}</strong><span class="pill">${esc(isNew(o) ? 'new' : STATUS[o.status] || o.status)}</span></div>
      <p class="admin-item-name">${esc(o.name)} <span class="dim">· ${count(o)} item${count(o) === 1 ? '' : 's'} · ${id}</span></p>
      <ul class="con-lines">${(o.items || []).map((l) => `<li><span>${esc(l.qty)} × ${esc(l.name)}${l.col ? ` <span class="dim">(${esc(l.col)})</span>` : ''} ${priceFlag(l)}</span><b>${inr(l.price * l.qty)}</b></li>`).join('')}</ul>
      ${o.note ? `<p class="admin-item-meta con-food">Note: ${esc(o.note)}</p>` : ''}
      ${o.mode === 'delivery' ? `<p class="admin-item-meta con-food">To: ${esc(o.address)}${o.landmark ? ` · near ${esc(o.landmark)}` : ''}</p>` : ''}
      ${o.status === 'cancelled' ? `<p class="admin-item-meta">Cancelled: ${esc(o.cancelReason || '')}</p>` : ''}
      <div class="con-item-foot">
        <p class="admin-item-total">${inr(o.subtotal)} <small class="dim">${o.payment?.status === 'paid' ? 'paid · ' + esc(METHOD[o.payment.method] || o.payment.method) : 'pay on ' + (o.mode === 'delivery' ? 'delivery' : 'pickup')}</small></p>
        <div class="con-contact">
          ${o.phone ? `<a class="btn btn-sm btn-ghost press" href="${esc(telHref(o.phone))}"><svg class="i"><use href="#i-phone"/></svg>Call</a>` : ''}
          ${o.uid ? '<span class="con-verified" title="Ordered while signed in with this number (SMS code)"><svg class="i"><use href="#i-check"/></svg>verified</span>' : ''}
          ${wa ? `<a class="btn btn-sm btn-ghost press" href="${esc(waStatus(o))}" target="_blank" rel="noopener"><svg class="i"><use href="#i-wa"/></svg>WhatsApp</a>` : ''}
          ${o.mode === 'delivery' && Number.isFinite(o.lat) ? `<a class="btn btn-sm btn-ghost press" href="${esc(mapsUrl(o))}" target="_blank" rel="noopener"><svg class="i"><use href="#i-pin"/></svg>Maps</a>` : ''}
        </div>
      </div>
      <div class="admin-actions">
        ${live && next ? `<button class="btn btn-sm btn-accent press" data-food="next" data-id="${id}">${esc(STEP_BTN[next])}</button>` : ''}
        ${live ? `<button class="btn btn-sm btn-ghost press con-danger" data-food="cancel" data-id="${id}">Cancel</button>` : ''}
        ${o.status === 'cancelled' ? '' : o.bill?.id
          ? `<a class="btn btn-sm btn-ghost press" href="/bill?id=${esc(o.bill.id)}" target="_blank" rel="noopener">Bill ${esc(o.bill.no)}</a><button class="btn btn-sm btn-ghost press" data-share-bill="foodOrders" data-id="${id}">Share bill</button>`
          : `<button class="btn btn-sm btn-ghost press" data-bill="foodOrders" data-id="${id}">Bill</button>`}
      </div>
    </li>`;
  }
  function renderFood() {
    if (!foodLoaded) return;
    const all = [...food.values()], today = istKey(Date.now());
    const fresh = all.filter(isNew).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    const going = all.filter((o) => !isNew(o) && !FINAL.includes(o.status)).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    const done = all.filter((o) => FINAL.includes(o.status) && istKey(ms(o.createdAt)) === today).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    const fill = (sel, rows, empty) => { $(sel).innerHTML = rows.length ? rows.map(foodCard).join('') : `<li class="admin-empty">${empty}</li>`; };
    fill('#food-new', fresh, 'No new food orders. Orders from /menu pop up here.');
    fill('#food-live', going, 'Nothing being prepared or on its way.');
    fill('#food-done', done, 'No finished orders today yet.');
    c.countOf('#c-fnew', fresh.length); c.countOf('#c-flive', going.length); c.countOf('#c-fdone', done.length);
    if (all.length && !livePrices) ensurePrices();
    c.paintNew();
    c.popNew('f', fresh);
  }
  c.registerPop('f', {
    get: (id) => food.get(id), isNew,
    note: (o, n) => ({ title: n > 1 ? `${n} new food orders` : 'New food order', body: `${o.name} · ${modeText(o)} · ${count(o)} item${count(o) === 1 ? '' : 's'} · ${inr(o.subtotal)}` }),
    html: (o, n) => `
      <div class="con-pop-top"><span class="pill">New food order${n > 1 ? ` · ${n}` : ''}</span><button class="icon-btn press" type="button" data-pop="close" aria-label="Hide"><svg class="i"><use href="#i-x"/></svg></button></div>
      <p class="con-pop-when">${esc(modeText(o))} · ${inr(o.subtotal)}</p>
      <p class="admin-item-name">${esc(o.name)} <span class="dim">· ${count(o)} item${count(o) === 1 ? '' : 's'}</span></p>
      <p class="admin-item-meta">${esc(itemsText(o))}</p>
      <div class="admin-actions">
        <button class="btn btn-sm btn-accent press" data-food="next" data-id="${esc(o.id)}">Accept</button>
        ${waDigits(o.phone) ? `<a class="btn btn-sm btn-ghost press" href="${esc(waStatus(o))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        <a class="btn btn-sm btn-ghost press" href="#orders" data-pop="open" data-go="food">Open orders</a>
      </div>`
  });
  async function foodAct(o, what) {
    const ref = doc(db, 'foodOrders', o.id), seen = o.ack === true ? {} : { ack: true, ackAt: serverTimestamp(), ackBy: c.me() };
    if (what === 'cancel') {
      const reason = prompt(`Cancel ${o.name}'s order ${o.id}? The reason is shown to the customer:`, '');
      if (reason === null) return false;
      if (!reason.trim()) { alert('Add a reason so the customer knows why.'); return false; }
      await updateDoc(ref, { status: 'cancelled', cancelReason: reason.trim().slice(0, 200), 'steps.cancelled': serverTimestamp(), ...seen });
      return 'Order cancelled.';
    }
    const next = nextOf(o); if (!next) return false;
    await updateDoc(ref, { status: next, [`steps.${next}`]: serverTimestamp(), ...seen });
    return `${firstName(o.name)}'s order: ${STATUS[next]}.`;
  }
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-food]'); if (!b) return;
    const o = food.get(b.dataset.id); if (!o) return;
    b.disabled = true;
    try { const done = await foodAct(o, b.dataset.food); if (done) c.toast(done); else b.disabled = false; }
    catch (err) { console.warn(err); alert('Could not save. Check your connection.'); b.disabled = false; }
    await c.refreshAll();
  });
  // Gaming bookings or food orders on the Orders screen
  function showOrders(which) {
    tab = which === 'food' ? 'food' : 'gaming'; store.set('mg-console-orders', tab);
    $('#o-gaming').hidden = tab !== 'gaming'; $('#o-food').hidden = tab !== 'food';
    $$('#o-switch button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.orders === tab)));
    if (tab === 'food') ensurePrices();
  }
  $('#o-switch').addEventListener('click', (e) => { const b = e.target.closest('button[data-orders]'); if (b) showOrders(b.dataset.orders); });

  /* ---------- bills: the dialog ---------- */
  const dlg = $('#bill-dlg');
  let draft = null;   // { col, id, kind, first, mode, phone, lines: [{ name, tax, qty, price }], method }
  const record = (col, id) => (col === 'foodOrders' ? food.get(id) : c.record[col]?.(id));
  // A booking: the gaming fare, the Top Combos it carried (today's price) and the 10% gamer discount on them
  function gamingLines(r) {
    const n = +r.players || 1, kind = c.KIND[n] || 'solo', pass = c.PASS[kind]?.label || 'Pass';
    const what = `${c.NAMES[r.station] || r.station} · ${n} player${n > 1 ? 's' : ''} · ${r.hours} hr${r.hours > 1 ? 's' : ''} · ${dayName(r.date)}, ${clock(r.start)}`;
    const food = String(r.food || '').split(';').map((x) => x.trim()).filter(Boolean).map((x) => {
      const m = x.match(/^(\d+)\s*×\s*(.+)$/), name = m ? m[2] : x, hit = livePrices && [...livePrices.values()].find((p) => p.name === name && !p.col);
      return { name, tax: 'food', qty: m ? +m[1] : 1, price: hit ? hit.price : 0 };
    });
    const foodSum = food.reduce((t, l) => t + l.qty * l.price, 0), perk = food.reduce((t, l) => t + l.qty * Math.round(l.price * FOOD_PERK), 0);
    const fare = Math.max(0, (+r.total || 0) - (foodSum - perk));
    const label = r.plan === 'buy-pass' ? `${pass} (6 hrs, valid 30 days) · ${what}` : r.plan === 'use-pass' ? `${what} · from ${pass.toLowerCase()}` : r.plan === 'member' ? `${what} · member rate` : what;
    return [{ name: label, tax: 'gaming', qty: 1, price: fare }, ...food, ...(perk ? [{ name: 'Gamer 10% off food', tax: 'food', qty: 1, price: -perk }] : [])];
  }
  function draftFor(col, r) {
    if (col === 'foodOrders') {
      const lines = (r.items || []).map((l) => ({ name: l.col ? `${l.name} (${l.col})` : l.name, tax: 'food', qty: l.qty, price: l.price }));
      if (r.mode === 'delivery') lines.push({ name: 'Delivery', tax: 'food', qty: 1, price: 0 });
      return { kind: 'food', first: firstName(r.name), mode: r.mode, phone: r.phone, lines, title: `Food order ${r.id} · ${r.name}` };
    }
    if (col === 'passes') {
      const meals = r.type === 'meals';
      const line = meals ? { name: `${+r.plan || r.mealsTotal}-meal plan (valid ${c.MEALS.days} days)`, tax: 'food', qty: 1, price: +r.price || 0 }
        : { name: `${c.PASS[r.type]?.label || 'Pass'} (${r.hoursTotal} hrs, valid 30 days)`, tax: 'gaming', qty: 1, price: +r.price || 0 };
      return { kind: meals ? 'meals' : 'pass', first: firstName(r.name), mode: 'venue', phone: r.phone, lines: [line], title: `${meals ? 'Meal plan' : 'Pass'} · ${r.name}` };
    }
    if (r.station === 'party') {
      const adults = +r.adults || 0, kids = Math.max(0, (+r.players || 0) - adults);
      // The package includes food and the game room; it's billed as food here. Change a line's GST type if your accountant says so
      const lines = [{ name: `Birthday package · child (${c.BDAY.hours} hrs, food included)`, tax: 'food', qty: kids, price: c.BDAY.perChild }];
      if (adults) lines.push({ name: 'Birthday package · adult', tax: 'food', qty: adults, price: c.BDAY.perAdult });
      return { kind: 'birthday', first: firstName(r.name), mode: 'venue', phone: r.phone, lines, title: `Birthday · ${dayName(r.date)} · ${r.name}` };
    }
    return { kind: 'gaming', first: firstName(r.name), mode: 'venue', phone: r.phone, lines: gamingLines(r), title: `Booking ${r.id} · ${r.name}` };
  }
  async function openBill(col, id) {
    const r = record(col, id); if (!r) return;
    if (col === 'requests' && r.food) await ensurePrices();
    await settingsFresh();
    draft = { col, id, method: 'cash', ...draftFor(col, r) };
    $('#bill-form').hidden = false; $('#bl-done').hidden = true; $('#bl-msg').textContent = '';
    $('#bl-for').textContent = draft.title + (settings.gstin ? ` · GSTIN ${settings.gstin}` : ' · no GSTIN set, so no GST');
    paintMethod(); paintLines();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function paintLines() {
    $('#bl-lines').innerHTML = draft.lines.map((l, i) => `
      <div class="con-bl-line" data-i="${i}">
        <input class="field" data-k="name" value="${esc(l.name)}" maxlength="120" aria-label="Item ${i + 1}">
        <select class="field" data-k="tax" aria-label="GST type, item ${i + 1}"><option value="food"${l.tax === 'food' ? ' selected' : ''}>Food</option><option value="gaming"${l.tax === 'gaming' ? ' selected' : ''}>Gaming</option></select>
        <input class="field" data-k="qty" type="number" inputmode="numeric" min="1" max="99" step="1" value="${esc(l.qty)}" aria-label="Quantity, item ${i + 1}">
        <input class="field" data-k="price" type="number" inputmode="numeric" min="-100000" max="100000" step="1" value="${esc(l.price)}" aria-label="Price each in rupees, item ${i + 1}">
        <b class="con-bl-amt">${inr((+l.qty || 0) * (+l.price || 0))}</b>
        <button class="icon-btn press" type="button" data-rm="${i}" aria-label="Remove item ${i + 1}"><svg class="i"><use href="#i-x"/></svg></button>
      </div>`).join('');
    paintSum();
  }
  function paintSum() {
    const m = billMath(draft.lines, settings), money = m.gst ? inr2 : inr, rows = [['Subtotal', money(m.subtotal)]];
    m.taxes.forEach((t) => rows.push([`${t.label} GST ${t.rate}% (CGST + SGST)${m.gst.pricesExclusive ? '' : ', included'}`, inr2(t.tax)]));
    if (m.roundOff) rows.push(['Round off', inr2(m.roundOff)]);
    $('#bl-sum').innerHTML = rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('') + `<div class="con-bl-total"><dt>Total</dt><dd>${inr(m.total)}</dd></div>`;
    $$('.con-bl-line').forEach((row) => { const l = draft.lines[+row.dataset.i]; if (l) $('.con-bl-amt', row).textContent = inr((+l.qty || 0) * (+l.price || 0)); });
  }
  const paintMethod = () => $$('#bl-method button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.method === draft.method)));
  $('#bl-method').addEventListener('click', (e) => { const b = e.target.closest('button[data-method]'); if (b) { draft.method = b.dataset.method; paintMethod(); } });
  $('#bl-lines').addEventListener('input', (e) => {
    const el = e.target.closest('[data-k]'), row = e.target.closest('.con-bl-line'); if (!el || !row) return;
    const l = draft.lines[+row.dataset.i], k = el.dataset.k;
    l[k] = k === 'qty' || k === 'price' ? Math.round(+el.value || 0) : el.value;
    paintSum();
  });
  $('#bl-lines').addEventListener('change', (e) => { if (e.target.matches('select[data-k]')) paintSum(); });
  $('#bl-lines').addEventListener('click', (e) => { const b = e.target.closest('[data-rm]'); if (b) { draft.lines.splice(+b.dataset.rm, 1); paintLines(); } });
  $('#bl-add').addEventListener('click', () => { if (draft.lines.length >= 40) return; draft.lines.push({ name: '', tax: draft.kind === 'gaming' || draft.kind === 'pass' ? 'gaming' : 'food', qty: 1, price: 0 }); paintLines(); $$('#bl-lines [data-k="name"]').pop().focus(); });
  $('#bl-close').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg || e.target.closest('[data-close-bill]')) dlg.close(); });

  // One transaction: the next number for this financial year, the bill, and the bill's id on the order or booking
  async function createBill() {
    const msg = $('#bl-msg'), lines = draft.lines.map((l) => ({ ...l, name: String(l.name).trim().slice(0, 120) }));
    if (!lines.length) { msg.textContent = 'Add at least one line.'; return; }
    if (lines.some((l) => !l.name)) { msg.textContent = 'Every line needs a name.'; return; }
    if (lines.some((l) => !(Number.isInteger(l.qty) && l.qty >= 1 && l.qty <= 99))) { msg.textContent = 'Quantities are 1 to 99.'; return; }
    if (lines.some((l) => !Number.isInteger(l.price) || Math.abs(l.price) > 100000)) { msg.textContent = 'Prices are whole rupees.'; return; }
    await readSettings();
    const m = billMath(lines, settings);
    if (m.total < 0) { msg.textContent = "The total can't be below zero."; return; }
    if (m.gst) {
      const pct = (t) => `${t.label} ${t.rate}%`;
      if (!confirm(`Tax invoice with GSTIN ${m.gst.gstin}: ${m.taxes.length ? m.taxes.map(pct).join(', ') : 'no GST on these lines'}. Total ${inr(m.total)}, paid by ${METHOD[draft.method]}. Create it?`)) return;
    }
    const { col, id, kind, first, mode, method } = draft, fy = fyOf(), billRef = doc(collection(db, 'bills'));
    msg.textContent = 'Saving…'; $('#bl-submit').disabled = true;
    try {
      const no = await runTransaction(db, async (tx) => {
        const refDoc = doc(db, col, id), cRef = doc(db, 'counters', `bills-${fy}`);
        const [rs, cs] = await Promise.all([tx.get(refDoc), tx.get(cRef)]);
        if (!rs.exists()) throw Object.assign(new Error('gone'), { why: 'This order or booking no longer exists.' });
        const prev = rs.data().bill;
        if (prev?.id) { const ps = await tx.get(doc(db, 'bills', prev.id)); if (ps.exists() && !ps.data().void) throw Object.assign(new Error('billed'), { why: `Already billed: ${ps.data().no}.` }); }
        const seq = (cs.exists() ? +cs.data().n || 0 : 0) + 1, no = `MS-${fy}-${String(seq).padStart(4, '0')}`;
        tx.set(cRef, { n: seq, updatedAt: serverTimestamp() });
        tx.set(billRef, {
          no, seq, fy, kind, ref: { col, id }, first: String(first || '').slice(0, 20), mode: mode || 'venue',
          lines: m.lines.map((l) => ({ name: l.name, tax: l.tax, qty: l.qty, price: l.price, amount: l.amount, ...(m.gst ? { gst: l.gst } : {}) })),
          subtotal: m.subtotal, taxes: m.taxes, tax: m.tax, roundOff: m.roundOff, total: m.total, gst: m.gst,
          method, paidAt: serverTimestamp(), by: c.me(), createdAt: serverTimestamp()
        });
        tx.update(refDoc, { bill: { id: billRef.id, no }, ...(col === 'foodOrders' ? { payment: { method, status: 'paid' } } : {}) });
        return no;
      });
      draft.done = { id: billRef.id, no, total: m.total };
      $('#bill-form').hidden = true; $('#bl-done').hidden = false;
      $('#bl-no').textContent = no; $('#bl-total').textContent = `${inr(m.total)} · ${METHOD[method]}${m.gst ? ' · tax invoice' : ''}`;
      $('#bl-open').href = billUrl(billRef.id); $('#bl-receipt').href = billUrl(billRef.id, true);
      $('#bl-wa').href = shareUrl(draft.phone, first, no, billRef.id);
      c.toast(`Bill ${no} created.`);
    } catch (err) {
      console.warn(err);
      msg.textContent = err.why || 'Could not save the bill. Check your connection.';
    }
    $('#bl-submit').disabled = false;
    c.refreshAll();
  }
  $('#bill-form').addEventListener('submit', (e) => { e.preventDefault(); createBill(); });
  $('#bl-copy').addEventListener('click', () => {
    const link = billUrl(draft.done.id);
    (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(() => c.toast('Bill link copied.'), () => prompt('Copy the bill link:', link));
  });
  const shareUrl = (phone, first, no, id) => {
    const text = `Hi ${first || 'there'}! Your bill ${no} from MR. Sandwich · MR. GAMING: ${billUrl(id)}`, d = waDigits(phone);
    return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;   // no number: WhatsApp asks who to send it to
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-bill]');
    if (b) { openBill(b.dataset.bill, b.dataset.id); return; }
    const s = e.target.closest('button[data-share-bill]');
    if (s) { const r = record(s.dataset.shareBill, s.dataset.id); if (r?.bill?.id) window.open(shareUrl(r.phone, firstName(r.name || ''), r.bill.no, r.bill.id), '_blank', 'noopener'); }
  });

  /* ---------- bills: today's takings, the list, void, CSV ---------- */
  let todays = [];
  function watchBills() {
    c.watch(() => query(collection(db, 'bills'), where('createdAt', '>=', Timestamp.fromMillis(dayStart(0))), orderBy('createdAt', 'desc')), (s) => {
      todays = s.docs.map((d) => ({ id: d.id, ...d.data() })); renderBills();
    }, { every: 30000, when: c.isView('bills') });
  }
  function renderBills() {
    const ok = todays.filter((b) => !b.void), sum = (f) => ok.filter(f).reduce((t, b) => t + (+b.total || 0), 0);
    const cells = [
      ['Total', sum(() => true), `${ok.length} bill${ok.length === 1 ? '' : 's'}`, 'con-stat-wide'],
      ['Gaming', sum((b) => b.kind === 'gaming')], ['Food', sum((b) => b.kind === 'food')],
      ['Passes & meals', sum((b) => b.kind === 'pass' || b.kind === 'meals')], ['Birthdays', sum((b) => b.kind === 'birthday')],
      ['Cash', sum((b) => b.method === 'cash')], ['UPI', sum((b) => b.method === 'upi')], ['Card', sum((b) => b.method === 'card')]
    ];
    $('#takings').innerHTML = cells.map(([k, v, small, cls]) => `<div class="con-stat ${cls || ''}"><span class="con-stat-k">${esc(k)}</span><b>${inr(v)}</b>${small ? `<small>${esc(small)}</small>` : ''}</div>`).join('');
    c.countOf('#c-bills', todays.length);
    $('#bills-today').innerHTML = todays.length ? todays.map((b) => `
      <li class="card admin-item${b.void ? ' is-dim' : ''}">
        <div class="admin-item-top"><strong>${esc(b.no)}</strong><span class="pill">${esc(b.void ? 'void' : KIND[b.kind] || b.kind)}</span></div>
        <p class="admin-item-meta">${esc(timeOf(b.createdAt))} · ${esc(b.first || 'no name')} · ${esc(METHOD[b.method] || b.method)}${b.gst ? ' · tax invoice' : ''}${b.ref?.id ? ` · <span class="dim">${esc(b.ref.id)}</span>` : ''}${b.void ? ` · void: ${esc(b.void.reason)}` : ''}</p>
        <div class="con-item-foot">
          <p class="admin-item-total">${inr(b.total)}</p>
          <div class="con-contact">
            <a class="btn btn-sm btn-ghost press" href="/bill?id=${esc(b.id)}" target="_blank" rel="noopener">Open</a>
            <a class="btn btn-sm btn-ghost press" href="/bill?id=${esc(b.id)}&amp;print=receipt" target="_blank" rel="noopener">Receipt</a>
            ${b.void ? '' : `<button class="btn btn-sm btn-ghost press con-danger" data-void="${esc(b.id)}">Void</button>`}
          </div>
        </div>
      </li>`).join('') : '<li class="admin-empty">No bills yet today. "Bill" is on every food order, booking, birthday and pass.</li>';
  }
  // Void: the bill stays (numbers never go back); its order or booking can be billed again
  $('#bills-today').addEventListener('click', async (e) => {
    const b = e.target.closest('button[data-void]'); if (!b) return;
    const bill = todays.find((x) => x.id === b.dataset.void); if (!bill) return;
    const reason = prompt(`Void bill ${bill.no} (${inr(bill.total)})? It stays in the records, marked void. Reason:`, '');
    if (reason === null) return;
    if (!reason.trim()) { alert('Add a reason.'); return; }
    b.disabled = true;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'bills', bill.id), { void: { reason: reason.trim().slice(0, 200), at: serverTimestamp(), by: c.me() } });
      if (bill.ref?.col && bill.ref?.id) {
        const ref = doc(db, bill.ref.col, bill.ref.id), s = await getDoc(ref);
        if (s.exists() && s.data().bill?.id === bill.id) batch.update(ref, { bill: null });
      }
      await batch.commit(); c.toast(`Bill ${bill.no} is void.`);
    } catch (err) { console.warn(err); alert('Could not void the bill.'); b.disabled = false; }
    c.refreshAll();
  });
  function paintGstNote() {
    const s = settings;
    $('#bills-gst').textContent = s.gstin
      ? `GSTIN ${s.gstin}: new bills are tax invoices with GST (food ${s.foodGst}%, gaming ${s.gamingGst}%, menu prices ${s.pricesExclusive ? 'before' : 'including'} GST).`
      : 'No GSTIN set: bills are titled "Bill" and carry no GST. Add the GSTIN in Settings when you have it.';
  }
  // CSV of the bills between two India-time dates (both included)
  const csvCell = (v) => { let t = String(v ?? ''); if (/^[=+\-@\t]/.test(t) && typeof v === 'string') t = "'" + t; return `"${t.replace(/"/g, '""')}"`; };
  $('#ex-from').value = $('#ex-to').value = istKey(Date.now());
  $('#export').addEventListener('submit', async (e) => {
    e.preventDefault();
    const from = $('#ex-from').value, to = $('#ex-to').value, msg = $('#ex-msg');
    if (!from || !to || to < from) { msg.textContent = 'Pick a start date and an end date on or after it.'; return; }
    msg.textContent = 'Reading bills…';
    try {
      const snap = await getDocs(query(collection(db, 'bills'), where('createdAt', '>=', Timestamp.fromMillis(dayStart(0, from))), where('createdAt', '<', Timestamp.fromMillis(dayStart(1, to))), orderBy('createdAt')));
      const head = ['Bill no', 'Date', 'Time', 'For', 'Order or booking', 'Customer', 'Subtotal', 'Taxable value', 'CGST', 'SGST', 'Round off', 'Total', 'Paid by', 'GSTIN', 'Billed by', 'Void reason'];
      const rows = snap.docs.map((d) => {
        const b = d.data(), t = b.taxes || [], add = (k) => Math.round(t.reduce((s, x) => s + (+x[k] || 0), 0) * 100) / 100;
        return [b.no, istKey(ms(b.createdAt)), timeOf(b.createdAt), KIND[b.kind] || b.kind, b.ref?.id || '', b.first || '', b.subtotal, t.length ? add('taxable') : '', t.length ? add('cgst') : '', t.length ? add('sgst') : '', b.roundOff || 0, b.total, METHOD[b.method] || b.method, b.gst?.gstin || '', String(b.by || '').replace(/^\+/, ''), b.void?.reason || ''];
      });
      const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      a.download = `mr-bills-${from}${to !== from ? '-to-' + to : ''}.csv`;
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      msg.textContent = `${rows.length} bill${rows.length === 1 ? '' : 's'} downloaded.`;
    } catch (err) { console.warn(err); msg.textContent = 'Could not read the bills. Check your connection.'; }
  });

  /* ---------- settings screen ---------- */
  const f = (id) => $('#set-' + id);
  function paintSettings() {
    const s = settings;
    if (hasLocation(saved)) {
      const at = saved.locatedAt?.toDate ? saved.locatedAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
      f('loc').innerHTML = `<b>${saved.lat.toFixed(6)}, ${saved.lng.toFixed(6)}</b>${saved.accuracy ? ` · accurate to about ${Math.round(saved.accuracy)} m` : ''}${at ? ` · set ${esc(at)}` : ''}`;
      f('map').hidden = false; f('map').href = `https://www.google.com/maps/search/?api=1&query=${saved.lat},${saved.lng}`;
      f('locate').lastChild.textContent = 'Set it again';
    } else {
      f('loc').textContent = 'Not set yet. Customers see "Delivery coming soon — pickup available" until it is.';
      f('map').hidden = true; f('locate').lastChild.textContent = 'Set shop location';
    }
    f('deliv').checked = s.deliveryOn !== false; f('radius').value = s.freeRadiusKm;
    f('gstin').value = s.gstin || ''; f('legal').value = s.legalName || ''; f('food').value = s.foodGst; f('gaming').value = s.gamingGst;
    f('excl').checked = s.pricesExclusive !== false;
  }
  const locFields = () => (hasLocation(saved) ? { lat: saved.lat, lng: saved.lng, accuracy: saved.accuracy ?? null, cosLat: saved.cosLat ?? Math.cos((saved.lat * Math.PI) / 180), locatedAt: saved.locatedAt ?? null } : {});
  const writeSettings = (data) => setDoc(doc(db, 'settings', 'shop'), { ...data, updatedAt: serverTimestamp(), by: c.me() });
  f('locate').addEventListener('click', () => {
    const msg = f('msg');
    if (!('geolocation' in navigator)) { msg.textContent = "This browser can't share its location. Try Chrome or Safari on your phone."; return; }
    if (hasLocation(saved) && !confirm('Replace the saved shop location with where this phone is now?')) return;
    f('locate').disabled = true; msg.textContent = 'Finding this phone… stay in the shop.';
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const s = withDefaults(saved);
      try {
        await writeSettings({
          lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, accuracy: Math.round(accuracy), cosLat: Math.cos((lat * Math.PI) / 180), locatedAt: serverTimestamp(),
          freeRadiusKm: +s.freeRadiusKm, deliveryOn: s.deliveryOn !== false, gstin: s.gstin || '', legalName: s.legalName || '', foodGst: +s.foodGst, gamingGst: +s.gamingGst, pricesExclusive: s.pricesExclusive !== false
        });
        await readSettings(); paintSettings();
        msg.textContent = `Shop location saved: ${lat.toFixed(6)}, ${lng.toFixed(6)} (about ±${Math.round(accuracy)} m).${accuracy > 100 ? ' That is not very precise: try again near a window or the door.' : ''}`;
      } catch (err) { console.warn(err); msg.textContent = 'Could not save the location. Check your connection.'; }
      f('locate').disabled = false;
    }, (err) => {
      f('locate').disabled = false;
      msg.textContent = err && err.code === 1 ? 'Location is blocked for this site. Allow it in the browser settings and tap again.' : "Couldn't get this phone's location. Try again.";
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
  f('gstin').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/\s/g, ''); });
  $('#set-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = f('msg'), radius = +f('radius').value, food = +f('food').value, gaming = +f('gaming').value, gstin = f('gstin').value.trim().toUpperCase(), legal = f('legal').value.trim();
    if (!(radius >= 0.5 && radius <= 30)) { msg.textContent = 'The free delivery distance is 0.5 to 30 km.'; return; }
    if (![food, gaming].every((x) => Number.isFinite(x) && x >= 0 && x <= 28) || f('food').value === '' || f('gaming').value === '') { msg.textContent = 'GST rates are 0 to 28 %.'; return; }
    if (gstin && !GSTIN_RE.test(gstin)) { msg.textContent = 'That GSTIN does not look right: 15 characters, like 36ABCDE1234F1Z5. Leave it empty if you have none yet.'; return; }
    if (gstin && !legal && !confirm('No legal name: bills will show the GSTIN with the shop name only. Save anyway?')) return;
    if (gstin !== (settings.gstin || '') && !confirm(gstin ? `From now on bills are tax invoices with GSTIN ${gstin} and GST (food ${food}%, gaming ${gaming}%). Bills already made don't change. Save?` : 'Remove the GSTIN? New bills will carry no GST. Bills already made keep theirs.')) return;
    f('save').disabled = true; msg.textContent = 'Saving…';
    try {
      await writeSettings({ ...locFields(), freeRadiusKm: radius, deliveryOn: f('deliv').checked, gstin, legalName: legal, foodGst: food, gamingGst: gaming, pricesExclusive: f('excl').checked });
      await readSettings(); paintSettings(); msg.textContent = 'Saved. /menu uses it from the next time the cart opens.';
    } catch (err) { console.warn(err); msg.textContent = 'Could not save. Check your connection.'; }
    f('save').disabled = false;
  });

  return {
    start() { readSettings(); watchFood(); watchBills(); showOrders(tab); },
    freshFood: () => [...food.values()].filter(isNew).length,
    showOrders,
    viewChanged(v) {
      if (v === 'settings') readSettings().then(paintSettings);
      if (v === 'bills') { paintGstNote(); if (Date.now() - settingsAt > 60000) readSettings(); }
    }
  };
}
