/* MR. Sandwich food ordering on /menu: home delivery or pickup, paid on delivery / at pickup (cash or UPI).
   menu.js loads this once the owner's live changes (menuOverrides) have been read, so every price here is the live
   one: menu-data.js plus today's overrides (menu-live.js priceList). If they can't be read there is no online ordering
   and the menu stays as printed. Nothing here is above the fold or waits on the first paint.
   - "+" on every item that isn't sold out (two-price items: pick the column, e.g. Aloo or Veg patty), the cart bar
     above the tab bar, and the sheet: cart with quantities, notes, delivery or pickup, address, the total.
   - Delivery: free within the owner's radius (settings/shop, shop.js) from the shop's location, measured in a straight
     line from "Use my location". Beyond it: "We don't deliver there yet — ask us on WhatsApp". Until the owner has set
     the shop location: "Delivery coming soon — pickup available".
   - Orders only while we're open (CONFIG.open/close in main.js, India time); otherwise it says when we open.
   - Placing needs the same mobile + SMS code sign-in as /book (account.js, loaded only when the cart opens); after a
     first sign-in the welcome form (profile.js) asks for name, email and WhatsApp opt-in, then the order goes on. The order
     goes to foodOrders/{id} with the caller's uid and verified number (its lines also as parts/0..4 of six, so the
     rules can check each one); firestore.rules check the lines, the subtotal, the hours and the delivery distance. Then the sheet tracks it (re-read every 15 s while open; no listeners).
   The cart and the last order id are kept in this browser only (localStorage), for convenience. */
import { withDefaults, deliveryOpen, distanceKm, billMath, loadShop } from '/assets/js/shop.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const inr2 = (n) => '₹' + (+n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const CART_KEY = 'mg-cart', ORDER_KEY = 'mg-food-order';
const BUNDLE = '/assets/vendor/firebase-account.0e285128.js';
const MAX_LINES = 30, MAX_QTY = 20;   // firestore.rules: at most 30 lines, 1-20 of each
const STEPS = {
  delivery: [['placed', 'Placed'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['out', 'Out for delivery'], ['delivered', 'Delivered']],
  pickup: [['placed', 'Placed'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['ready', 'Ready for pickup'], ['picked', 'Picked up']]
};
const STATE = {
  placed: 'Placed. Waiting for the kitchen to accept it.', accepted: 'Accepted by the kitchen.', preparing: 'Being prepared.',
  out: 'Out for delivery.', ready: 'Ready for pickup.', delivered: 'Delivered.', picked: 'Picked up.', cancelled: 'Cancelled.'
};
const FINAL = ['delivered', 'picked', 'cancelled'];

export function start({ MENU, live, ov }) {
  const { CONFIG, waUrl, clock12, nowIst } = window.MG;
  const root = document.documentElement, main = $('#menu'), sheet = $('#sheet'), form = $('#cart');
  let prices = live.priceList(MENU, ov);
  const ids = live.idsFor(MENU);

  /* ---------- open hours (India time), the same hours as the open-now status ---------- */
  const isOpen = () => { const t = nowIst(), m = t.getHours() * 60 + t.getMinutes(); return m >= CONFIG.open * 60 && m < CONFIG.close * 60; };
  const opensText = () => `Online orders open at ${clock12(CONFIG.open)}${nowIst().getHours() < CONFIG.open ? ' today' : ' tomorrow'}.`;

  /* ---------- the cart: Map(menu doc id -> qty), kept in this browser ---------- */
  const cart = new Map();
  try { (JSON.parse(store.get(CART_KEY) || '[]') || []).forEach(([id, q]) => { if (prices.has(id) && q >= 1) cart.set(id, Math.min(MAX_QTY, Math.round(q))); }); } catch (e) {}
  const saveCart = () => { if (cart.size) store.set(CART_KEY, JSON.stringify([...cart])); else store.del(CART_KEY); };
  const lines = () => [...cart].map(([id, qty]) => ({ ...prices.get(id), qty })).filter((l) => l.name);
  const subtotal = () => lines().reduce((t, l) => t + l.price * l.qty, 0);
  const count = () => [...cart.values()].reduce((t, q) => t + q, 0);
  const canSell = (p) => p && !p.hidden && !p.soldOut;
  function setQty(id, q) {
    const p = prices.get(id); if (!p) return;
    q = Math.max(0, Math.min(MAX_QTY, q));
    if (q && !cart.has(id) && cart.size >= MAX_LINES) { toastLine(`Up to ${MAX_LINES} different items in one order.`); return; }
    if (q) cart.set(id, q); else cart.delete(id);
    saveCart(); paintControls(); paintBar(); if (sheet.open && view === 'cart') paintCart();
  }

  /* ---------- "+" on each item (stepper once it's in the cart) ---------- */
  const itemOf = (k) => { const [si, gi, i] = k.split('.').map(Number); return MENU.sections[si].groups[gi].items[i]; };
  const stepper = (id, name) => {
    const q = cart.get(id) || 0;
    return q ? `<span class="step"><button type="button" data-dec="${esc(id)}" aria-label="One less ${esc(name)}">−</button><b aria-live="polite">${q}</b><button type="button" data-inc="${esc(id)}" aria-label="One more ${esc(name)}"${q >= MAX_QTY ? ' disabled' : ''}>+</button></span>`
      : `<button type="button" class="add-btn" data-inc="${esc(id)}" aria-label="Add ${esc(name)}">+</button>`;
  };
  $$('.item[data-k]', main).forEach((li) => {
    const it = itemOf(li.dataset.k), docs = live.docIds(it, ids.get(it)).map((id) => prices.get(id)).filter((p) => p && !p.hidden);
    if (!docs.length) return;
    const row = $('.item-row', li);
    if (!it.prices) { row.insertAdjacentHTML('beforeend', `<span class="add" data-ctrl="${esc(docs[0].id)}"></span>`); return; }
    // Two prices: "+" opens the choice of column under the item
    row.insertAdjacentHTML('beforeend', `<span class="add"><button type="button" class="add-btn" data-pick aria-expanded="false" aria-label="Add ${esc(it.name)}: choose ${esc(docs.map((d) => d.col).join(' or '))}">+</button></span>`);
    li.insertAdjacentHTML('beforeend', `<div class="add-pick" hidden>${docs.map((d) => `
      <span class="pick${d.soldOut ? ' is-out' : ''}"><span class="pick-name">${esc(d.col)} · ${inr(d.price)}</span>${d.soldOut ? '<span class="sold">Sold out today</span>' : `<span class="add" data-ctrl="${esc(d.id)}"></span>`}</span>`).join('')}</div>`);
  });
  function paintControls() {
    $$('[data-ctrl]', main).forEach((el) => {
      const p = prices.get(el.dataset.ctrl);
      el.innerHTML = canSell(p) ? stepper(p.id, p.col ? `${p.name} (${p.col})` : p.name) : '';
    });
    // the two-price "+" shows how many of that item are in the cart
    $$('.item[data-k]', main).forEach((li) => {
      const btn = $('[data-pick]', li); if (!btn) return;
      const it = itemOf(li.dataset.k), n = live.docIds(it, ids.get(it)).reduce((t, id) => t + (cart.get(id) || 0), 0);
      btn.textContent = n ? String(n) : '+'; btn.classList.toggle('has-n', n > 0);
    });
  }
  main.addEventListener('click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (pick) { const box = $('.add-pick', pick.closest('.item')), open = box.hidden; box.hidden = !open; pick.setAttribute('aria-expanded', String(open)); return; }
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    if (inc) setQty(inc.dataset.inc, (cart.get(inc.dataset.inc) || 0) + 1);
    if (dec) setQty(dec.dataset.dec, (cart.get(dec.dataset.dec) || 0) - 1);
  });

  /* ---------- shop settings: location, free radius, delivery on/off, GST (public read) ---------- */
  let shop, shopErr = false;   // shop: undefined = not read yet, null = the owner hasn't saved any
  const readShop = () => loadShop().then((s) => { shop = s ? withDefaults(s) : null; shopErr = false; }, () => { shopErr = true; })
    .then(() => { paintLine(); if (sheet.open) paintCart(); });
  const canDeliver = () => !shopErr && !!shop && deliveryOpen(shop);
  const radius = () => +(shop && shop.freeRadiusKm) || 0;

  /* ---------- the line under the masthead and the cart bar ---------- */
  const line = $('#order-line');
  function paintLine() {
    const open = isOpen();
    root.classList.toggle('order-closed', !open);
    line.hidden = false;
    line.innerHTML = open ? `<b>Order online</b> for ${canDeliver() ? `free delivery within ${esc(radius())} km or pickup` : 'pickup'}: tap <span class="add-btn add-demo" aria-hidden="true">+</span> on a dish.`
      : `<b>${esc(opensText())}</b> You can still browse the menu.`;
  }
  const bar = $('#cartbar');
  function activeOrder() {
    try { const o = JSON.parse(store.get(ORDER_KEY) || 'null'); return o && o.id && Date.now() - o.at < 24 * 3600e3 ? o : null; } catch (e) { return null; }
  }
  function paintBar() {
    const n = count(), o = activeOrder();
    bar.hidden = !n && !o;
    document.body.classList.toggle('has-cartbar', !bar.hidden);
    if (bar.hidden) return;
    $('#cartbar-n').textContent = n || '';
    if (n) {
      $('#cartbar-text').innerHTML = `${n} item${n > 1 ? 's' : ''} · <b>${inr(subtotal())}</b>`;
      $('#cartbar-go').textContent = isOpen() ? 'View cart' : 'Opens ' + clock12(CONFIG.open);
    } else {
      $('#cartbar-text').innerHTML = `Your order <b>${esc(o.id)}</b>`;
      $('#cartbar-go').textContent = 'Track';
    }
  }
  let toastT = 0;
  function toastLine(t) {
    if (!sheet.open) { alert(t); return; }
    const el = $('#o-err'); el.textContent = t; clearTimeout(toastT); toastT = setTimeout(() => { el.textContent = ''; }, 4000);
  }

  /* ---------- the sheet ---------- */
  let view = 'cart';
  $('#cartbar-btn').addEventListener('click', () => { const o = activeOrder(); if (!count() && o) openTrack(o.id); else openCart(); });
  $('#sheet-x').addEventListener('click', () => sheet.close());
  sheet.addEventListener('click', (e) => { if (e.target === sheet) sheet.close(); });   // tap outside the sheet
  sheet.addEventListener('close', () => { stopTrack(); document.body.classList.remove('sheet-open'); paintBar(); });
  const showSheet = () => { if (!sheet.open) { if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); } document.body.classList.add('sheet-open'); };
  function openCart() {
    view = 'cart'; form.hidden = false; $('#track').hidden = true; $('#sheet-title').textContent = 'Your order';
    stopTrack(); showSheet(); loadAccount();
    readShop();   // one small read each time: delivery, radius and GST are always the owner's latest
    paintCart();
  }

  /* ---------- delivery or pickup ---------- */
  let mode = 'delivery', modePicked = false, here = null, locating = false, locErr = '';
  $('#o-addr').textContent = CONFIG.address.replace(/^MR\. Sandwich,\s*/, '');
  $('#o-mode').addEventListener('click', (e) => { const b = e.target.closest('button[data-mode]'); if (!b || b.disabled) return; mode = b.dataset.mode; modePicked = true; paintCart(); });
  const dist = () => (here && shop && canDeliver() ? distanceKm(shop, here) : null);
  $('#o-locate').addEventListener('click', () => {
    if (!('geolocation' in navigator)) { locErr = "This browser can't share your location. Choose pickup, or order on WhatsApp."; paintCart(); return; }
    locating = true; locErr = ''; paintCart();
    navigator.geolocation.getCurrentPosition((pos) => {
      locating = false; here = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }; paintCart();
    }, (err) => {
      locating = false; here = null;
      locErr = err && err.code === 1 ? 'Location is blocked for this site. Allow it in the browser, choose pickup, or order on WhatsApp.' : "We couldn't find your location. Try again, choose pickup, or order on WhatsApp.";
      paintCart();
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });

  /* ---------- paint the cart and checkout ---------- */
  const deliveryText = () => (shopErr ? "We can't check delivery right now. Pickup is available."
    : shop === undefined ? 'Checking delivery…'
    : !canDeliver() ? 'Delivery coming soon — pickup available.'
    : `Free delivery within ${radius()} km of the shop (straight line).`);
  function paintCart() {
    const ls = lines();
    $('#cart-list').innerHTML = ls.length ? ls.map((l) => `
      <li class="cart-row${canSell(l) ? '' : ' is-out'}">
        <span class="cart-name">${esc(l.name)}${l.col ? `<small>${esc(l.col)}</small>` : ''}${canSell(l) ? '' : '<span class="sold">Sold out today</span>'}</span>
        ${canSell(l) ? stepper(l.id, l.col ? `${l.name} (${l.col})` : l.name) : `<button type="button" class="o-link" data-dec="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">Remove</button>`}
        <b class="cart-amt">${inr(l.price * l.qty)}</b>
      </li>`).join('') : '<li class="cart-empty">Your cart is empty. Tap + on any dish.</li>';
    // Delivery once the owner has set the shop location (and left delivery on); pickup always
    if (!canDeliver()) { if (shop !== undefined || shopErr) mode = 'pickup'; } else if (!modePicked) mode = 'delivery';
    $$('#o-mode button').forEach((b) => { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); b.disabled = b.dataset.mode === 'delivery' && !canDeliver(); });
    $('#o-radius').textContent = deliveryText();
    $('#o-delivery').hidden = mode !== 'delivery' || !canDeliver();
    $('#o-pickup').hidden = mode !== 'pickup';
    const d = dist(), far = d !== null && d > radius();
    $('#o-locate').disabled = locating;
    $('#o-locate').lastChild.textContent = locating ? 'Finding you…' : here ? 'Update my location' : 'Use my location';
    const distEl = $('#o-dist');
    if (d !== null) distEl.innerHTML = far
      ? `<b>${d.toFixed(1)} km away.</b> We don't deliver there yet — <a href="${esc(waUrl(orderText(true)))}" target="_blank" rel="noopener">ask us on WhatsApp</a>, or choose pickup.`
      : `<b>${d.toFixed(1)} km away</b> · free delivery.`;
    else distEl.textContent = locating ? '' : locErr || (mode === 'delivery' && canDeliver() ? 'Tap "Use my location" so we can check the distance.' : '');
    // Totals: GST only when the owner has set a GSTIN (shop.js billMath); otherwise the plain sum
    const m = billMath(ls.map((l) => ({ qty: l.qty, price: l.price, tax: 'food' })), shop);
    const rows = [['Subtotal', inr(m.subtotal)]];
    if (mode === 'delivery') rows.push(['Delivery', 'Free']);
    m.taxes.forEach((t) => rows.push([`${m.gst.pricesExclusive ? '' : 'Includes '}GST ${t.rate}%`, inr2(t.tax)]));
    if (m.roundOff) rows.push(['Round off', inr2(m.roundOff)]);
    rows.push(['Total', inr(m.total)]);
    $('#o-sum').innerHTML = rows.map(([k, v], i) => `<div class="${i === rows.length - 1 ? 'o-total' : ''}"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('');
    paintSign();
    const place = $('#o-place');
    place.disabled = busy || !ls.length || !isOpen();
    place.textContent = !isOpen() ? opensText()
      : busy ? busyText
      : !user && sign === 'phone' ? 'Send code'
      : !user && sign === 'code' ? `Confirm & place order · ${inr(m.total)}`
      : `Place order · ${inr(m.total)}`;
    $('#o-wa').href = waUrl(orderText(true));
  }
  form.addEventListener('input', (e) => {
    if (e.target.id === 'o-code') { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); if (e.target.value.length === 6 && !busy) place(); }
    $('#o-wa').href = waUrl(orderText(true));
  });
  $('#cart-list').addEventListener('click', (e) => {
    const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
    if (inc) setQty(inc.dataset.inc, (cart.get(inc.dataset.inc) || 0) + 1);
    if (dec) setQty(dec.dataset.dec, canSell(prices.get(dec.dataset.dec)) ? (cart.get(dec.dataset.dec) || 0) - 1 : 0);
  });

  // The order as a WhatsApp message (also the fallback when online ordering can't be used)
  function orderText(draft, o) {
    const ls = o ? o.items : lines(), sum = o ? o.subtotal : subtotal(), how = o ? o.mode : mode;
    const addr = o ? o.address : $('#o-address').value.trim(), lm = o ? o.landmark : $('#o-landmark').value.trim(), note = o ? o.note : $('#o-note').value.trim();
    return [
      o ? `Hi MR. Sandwich! I ordered online: ${o.id}` : "Hi MR. Sandwich! I'd like to order:",
      '', ...ls.map((l) => `${l.qty} × ${l.name}${l.col ? ` (${l.col})` : ''} = ${inr(l.price * l.qty)}`),
      `Subtotal: ${inr(sum)}`,
      note ? `Note: ${note}` : null,
      how === 'delivery' ? `Delivery to: ${addr || '(address)'}${lm ? `, near ${lm}` : ''}` : 'Pickup',
      draft ? 'My name is:' : null
    ].filter((x) => x !== null).join('\n');
  }

  /* ---------- sign-in: account.js, the same as /book ---------- */
  // sign: checking / phone (type the number) / code (type the SMS code) / done / offline
  let acct = null, acctLoad = null, user = null, sign = 'checking', busy = false, busyText = '';
  const pretty = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p || ''); };
  const nameIn = $('#o-name'), phoneIn = $('#o-phone'), codeIn = $('#o-code');
  nameIn.value = store.get('mg-name') || ''; phoneIn.value = store.get('mg-phone') || '';
  function paintSign() {
    $('#sg-checking').hidden = sign !== 'checking' && sign !== 'offline';
    $('#sg-checking').textContent = sign === 'offline' ? "Sign-in isn't loading right now. You can still order on WhatsApp." : 'Checking sign-in…';
    $('#sg-phone').hidden = sign !== 'phone';
    $('#sg-code').hidden = sign !== 'code';
    $('#sg-done').hidden = sign !== 'done';
    $('#sg-phone-no').textContent = user ? pretty(user.phoneNumber) : '';
  }
  const loadAccount = () => acctLoad || (acctLoad = Promise.all([import('/assets/js/account.js'), import(BUNDLE)]).then(([m, fb]) => {
    acct = { ...m, fb };
    m.onUser((u) => {
      // Signed in: the name from the profile (users/{uid}) when the field is empty. The top bar follows (account.js)
      if (u && !nameIn.value.trim()) {
        const c = m.cachedProfile();
        if (c && c.uid === u.uid && c.name) nameIn.value = c.name;
        else m.getProfile(u).then((p) => { if (p && p.name && !nameIn.value.trim()) nameIn.value = p.name; }).catch(() => {});
      }
      if (!u && user && sign === 'done') { nameIn.value = ''; phoneIn.value = ''; }   // signed out here or from the account sheet
      user = u;
      sign = u ? 'done' : sign === 'code' ? 'code' : 'phone';
      if (sheet.open && view === 'cart') paintCart();
      if (sheet.open && view === 'track') readTrack();
    });
    return m.ready.then(() => acct);
  }).catch(() => { acct = false; sign = 'offline'; if (sheet.open) paintCart(); return null; }));
  $('#sg-change').addEventListener('click', () => { if (acct) acct.forgetCode(); sign = 'phone'; codeIn.value = ''; paintCart(); phoneIn.focus(); });
  $('#sg-out').addEventListener('click', () => { if (acct) acct.signOut(); });

  /* ---------- place the order ---------- */
  const SEND_ERR = { 'auth/too-many-requests': 'Too many tries. Wait a while and try again.', 'auth/invalid-phone-number': 'That number looks wrong. Check it and try again.' };
  const CODE_ERR = { 'auth/invalid-verification-code': 'That code is wrong. Check the SMS and try again.', 'auth/code-expired': 'That code has expired. Use a different number or send it again.' };
  const err = (t) => { clearTimeout(toastT); $('#o-err').textContent = t; return false; };
  const work = (t) => { busy = !!t; busyText = t || ''; paintCart(); };
  const newId = () => {
    const t = nowIst(), p = (n) => String(n).padStart(2, '0'), A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(4));
    return `FO-${p(t.getMonth() + 1)}${p(t.getDate())}-${p(t.getHours())}${p(t.getMinutes())}-${[...r].map((x) => A[x % A.length]).join('')}`;
  };
  // Checks the cart against the menu as it is right now (the owner may have changed a price or sold something out)
  async function pricesStill() {
    const fresh = live.priceList(MENU, await live.loadOverrides());
    const changed = lines().some((l) => { const f = fresh.get(l.id); return !f || f.price !== l.price || !canSell(f); });
    prices = fresh; paintControls(); paintBar();
    return !changed;
  }
  async function place() {
    if (busy) return;
    err('');
    const ls = lines();
    if (!ls.length) return err('Add something from the menu first.');
    if (!isOpen()) return err(opensText());
    if (ls.some((l) => !canSell(l))) return err('Something in your cart is sold out today. Remove it to order.');
    const d = dist();
    if (mode === 'delivery') {
      if (!canDeliver()) return err('Delivery coming soon — choose pickup.');
      if (d === null) return err('Tap "Use my location" so we can check the distance.');
      if (d > radius()) return err("We don't deliver there yet. Choose pickup, or ask us on WhatsApp.");
      if ($('#o-address').value.trim().length < 5) { $('#o-address').focus(); return err('Add your address for the delivery.'); }
    }
    let name = nameIn.value.trim();
    if (!name) { nameIn.focus(); return err('Add your name.'); }
    store.set('mg-name', name);
    if (!acct) { work('Checking sign-in…'); await loadAccount(); work(''); if (!acct) return err("Sign-in isn't loading right now. Order on WhatsApp instead (link below)."); if (!user) return; }

    if (!user && sign === 'phone') {
      const p = phoneIn.value.replace(/\D/g, '').replace(/^0/, '').replace(/^91(?=\d{10}$)/, '');
      if (!/^[6-9]\d{9}$/.test(p)) { phoneIn.focus(); return err('Enter your 10-digit mobile number.'); }
      store.set('mg-phone', p);
      work('Sending code…');
      const r = await acct.sendCode('+91' + p, $('#o-recaptcha'));
      work('');
      if (!r.ok) return err(SEND_ERR[r.code] || "We couldn't send a code right now. Try again in a minute, or order on WhatsApp.");
      sign = 'code'; codeIn.value = ''; $('#sg-to').textContent = `sent to ${pretty(p)}`; paintCart(); codeIn.focus();
      return;
    }
    if (!user && sign === 'code') {
      const c = codeIn.value.replace(/\D/g, '');
      if (c.length !== 6) { codeIn.focus(); return err('Enter the 6-digit code from the SMS.'); }
      work('Checking the code…');
      const r = await acct.confirmCode(c);
      work('');
      if (!r.ok) { codeIn.focus(); return err(CODE_ERR[r.code] || "We couldn't check the code. Try again."); }
      user = r.user; sign = 'done';
    }
    if (!user) return;
    // A first sign-in: the welcome form (profile.js), then the order carries on. Returning customers skip it.
    work('Checking your profile…');
    const prof = await import('/assets/js/profile.js').then((m) => m.ensureProfile(user, { name })).catch(() => null);
    if (prof && prof.name && prof.created) { nameIn.value = prof.name; name = prof.name; store.set('mg-name', name); }

    work('Placing your order…');
    try {
      if (!(await pricesStill())) { work(''); paintCart(); return err('The menu just changed (a price or something sold out). Check your order and place it again.'); }
      if (mode === 'delivery') {
        await readShop();
        const d2 = dist();
        if (!canDeliver() || d2 === null || d2 > radius()) { work(''); return err("Delivery isn't available to this location right now. Choose pickup, or ask us on WhatsApp."); }
      }
      const { fb } = acct, id = newId(), dNow = mode === 'delivery' ? dist() : null, items = lines().map((l) => ({ id: l.id, name: l.name.slice(0, 120), col: l.col, price: l.price, qty: l.qty }));
      const order = {
        id, uid: user.uid, phone: user.phoneNumber, name: name.slice(0, 40), items, subtotal: items.reduce((t, l) => t + l.price * l.qty, 0), mode,
        address: mode === 'delivery' ? $('#o-address').value.trim().slice(0, 200) : '', landmark: mode === 'delivery' ? $('#o-landmark').value.trim().slice(0, 100) : '',
        lat: mode === 'delivery' ? Math.round(here.lat * 1e6) / 1e6 : null, lng: mode === 'delivery' ? Math.round(here.lng * 1e6) / 1e6 : null,
        distanceKm: mode === 'delivery' ? Math.round(dNow * 100) / 100 : null,
        note: $('#o-note').value.trim().slice(0, 200), status: 'placed', payment: { method: 'cod', status: 'unpaid' }, createdAt: fb.serverTimestamp()
      };
      // The order, and its lines again in parts of six (foodOrders/{id}/parts/0..4) so firestore.rules can check every
      // line: rules evaluate at most 1,000 expressions per document. One batch: all or nothing.
      const batch = fb.writeBatch(acct.db);
      batch.set(fb.doc(acct.db, 'foodOrders', id), order);
      for (let i = 0; i < items.length; i += 6) {
        const part = items.slice(i, i + 6);
        batch.set(fb.doc(acct.db, 'foodOrders', id, 'parts', String(i / 6)), { lines: part, sum: part.reduce((t, l) => t + l.price * l.qty, 0) });
      }
      await Promise.race([batch.commit(), new Promise((_, no) => setTimeout(() => no(new Error('timeout')), 15000))]);
      store.set(ORDER_KEY, JSON.stringify({ id, at: Date.now() }));
      cart.clear(); saveCart(); $('#o-note').value = '';
      work(''); paintControls(); paintBar();
      openTrack(id, { ...order, createdAt: null });
    } catch (e) {
      console.warn('Order not placed:', e && (e.code || e.message));
      work('');
      err(isOpen() ? "We couldn't place your order. Try again, or order on WhatsApp (link below)." : opensText());
    }
  }
  form.addEventListener('submit', (e) => { e.preventDefault(); place(); });
  phoneIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); place(); } });

  /* ---------- tracking: re-read the order every 15 s while the sheet shows it ---------- */
  let trackId = null, trackTimer = 0, trackData = null;
  const stopTrack = () => { clearInterval(trackTimer); trackTimer = 0; };
  function openTrack(id, local) {
    view = 'track'; trackId = id; trackData = local || null;
    form.hidden = true; $('#track').hidden = false; $('#sheet-title').textContent = 'Your order';
    $('#t-id').textContent = id;
    showSheet(); paintTrack();
    stopTrack(); trackTimer = setInterval(() => { if (document.visibilityState === 'visible') readTrack(); }, 15000);
    loadAccount().then(readTrack);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sheet.open && view === 'track') readTrack(); });
  async function readTrack() {
    if (!acct || view !== 'track' || !trackId) return;
    await acct.ready;
    if (!acct.currentUser()) { $('#t-state').textContent = 'Sign in on My pass with the number you ordered with to follow this order.'; return; }
    try {
      const snap = await acct.fb.getDoc(acct.fb.doc(acct.db, 'foodOrders', trackId));
      if (!snap.exists()) { $('#t-state').textContent = "We can't find this order. Message us on WhatsApp."; return; }
      trackData = snap.data(); paintTrack();
    } catch (e) { if (!trackData) $('#t-state').textContent = "Couldn't load your order right now. Trying again shortly."; }
  }
  const timeOf = (ts) => { if (!ts || !ts.toMillis) return ''; const d = new Date(ts.toMillis() + 330 * 60000), h = d.getUTCHours(); return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  function paintTrack() {
    const o = trackData;
    if (!o) { $('#t-state').textContent = 'Loading your order…'; $('#t-steps').innerHTML = ''; $('#t-items').innerHTML = ''; return; }
    const steps = STEPS[o.mode] || STEPS.pickup, at = steps.findIndex(([k]) => k === o.status), off = o.status === 'cancelled';
    $('#t-state').textContent = off ? `Cancelled${o.cancelReason ? `: ${o.cancelReason}` : '.'}` : STATE[o.status] || o.status;
    $('#t-steps').innerHTML = steps.map(([k, label], i) => {
      const when = k === 'placed' ? timeOf(o.createdAt) : timeOf(o.steps && o.steps[k]);
      return `<li class="${!off && i < at ? 'is-done' : !off && i === at ? 'is-now' : ''}"><span>${esc(label)}</span>${when && !off && i <= at ? `<small>${esc(when)}</small>` : ''}</li>`;
    }).join('');
    $('#track').classList.toggle('is-off', off);
    $('#t-items').innerHTML = (o.items || []).map((l) => `<li><span>${esc(l.qty)} × ${esc(l.name)}${l.col ? ` <small>(${esc(l.col)})</small>` : ''}</span><b>${inr(l.price * l.qty)}</b></li>`).join('')
      + `<li class="t-total"><span>Subtotal${o.mode === 'delivery' ? ' · delivery free' : ''}</span><b>${inr(o.subtotal || 0)}</b></li>`;
    $('#t-meta').textContent = (o.mode === 'delivery' ? `Delivery to ${o.address}${o.landmark ? `, near ${o.landmark}` : ''}.` : `Pickup at MR. Sandwich, ${CONFIG.address.replace(/^MR\. Sandwich,\s*/, '')}.`)
      + (o.payment && o.payment.status === 'paid' ? ' Paid, thank you.' : ` Pay ${o.mode === 'delivery' ? 'on delivery' : 'at pickup'}: cash or UPI.`);
    $('#t-wa').href = waUrl(orderText(false, o));
    const bill = o.bill && o.bill.id;
    $('#t-bill').hidden = !bill; if (bill) $('#t-bill').href = `/bill?id=${encodeURIComponent(bill)}`;
    if (FINAL.includes(o.status)) stopTrack();
  }
  $('#t-new').addEventListener('click', () => {
    if (!trackData || FINAL.includes(trackData.status)) store.del(ORDER_KEY);
    openCart();
  });

  /* ---------- go ---------- */
  paintControls(); paintLine(); paintBar(); readShop();
  setInterval(() => { paintLine(); paintBar(); if (sheet.open && view === 'cart') paintCart(); }, 60000);
  const asked = new URLSearchParams(location.search).get('order');   // from My orders on /pass
  if (asked && /^FO-[0-9]{4}-[0-9]{4}-[A-Z0-9]{4}$/.test(asked)) { store.set(ORDER_KEY, JSON.stringify({ id: asked, at: Date.now() })); paintBar(); openTrack(asked); }
}
