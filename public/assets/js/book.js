/* MR. GAMING booking (/book), in three steps like a flight: 1 slot, 2 fare (the 6-hr pass is the upgrade), 3 confirm.
   Booking needs a verified mobile: at step 3 a visitor who isn't signed in gets the number and SMS code right here
   (same sign-in as My pass), then the booking is saved to Firestore as 'booked' (book-account.js, loaded at step 2 so
   the first paint never waits for it) and the ticket shows, with a calendar file and the same bill for WhatsApp.
   Live slots come from booking-db.js (no sign-in). If the database or the sign-in can't be reached it falls back to
   a WhatsApp request (nothing saved), which is not booked until we reply. Everything that sounds urgent is real:
   slots left and "last console" from the database, "starts in" from the clock.
   Deep links: /book?slot=2026-10-20_ps5_18&hrs=1 (the members' board), /book?pass=duo[&rate=member] (My pass),
   /book?game=FC%2027 (the game cards on the home page). */
(function () {
  'use strict';
  const { CONFIG, $, $$, inr, waUrl, setRoll, reduced, nowIst } = window.MG;
  const root = document.documentElement;
  const builder = $('.builder');
  if (!builder) return;

  /* ---------- segmented controls with a sliding indicator ---------- */
  function placeInd(seg) {
    const on = $('button[aria-pressed="true"]', seg), ind = $('.seg-ind', seg);
    if (!on || !ind) return;
    ind.style.width = on.offsetWidth + 'px';
    ind.style.height = on.offsetHeight + 'px';
    ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
    // Day chips scroll sideways on phones: keep the picked one in view
    if (seg.scrollWidth > seg.clientWidth) {
      const left = on.offsetLeft - 4, right = on.offsetLeft + on.offsetWidth + 4 - seg.clientWidth;
      if (left < seg.scrollLeft) seg.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
      else if (right > seg.scrollLeft) seg.scrollTo({ left: right, behavior: reduced ? 'auto' : 'smooth' });
    }
  }
  function select(seg, value) {
    $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
    placeInd(seg);
  }

  const names = { ps5: 'PS5', xbox: 'Xbox', squad: 'Whole room' };
  const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (h) => `${h % 12 || 12}${h < 12 ? ' am' : ' pm'}`;
  const hm = (h) => `${h % 12 || 12}:00 ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
  // "8–9 pm", "11 am–12 pm": an hour range, with am/pm once when both ends share it
  const span = (a, b) => { const ap = (h) => (h < 12 || h === 24 ? 'am' : 'pm'); return ap(a) === ap(b) ? `${a % 12 || 12}–${b % 12 || 12} ${ap(b)}` : `${clock(a)}–${clock(b)}`; };
  const MAX_ONLINE_HOURS = 3;   // the longest session the form and firestore.rules accept
  const dayLabel = (d) => `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
  const hrs = (n) => `${n} hr${n === 1 ? '' : 's'}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // The next 7 days (today drops off once its last 1-hour slot has started)
  const now = nowIst();
  const days = [];
  for (let i = 0; i < 8 && days.length < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (i === 0 && now.getHours() * 60 + now.getMinutes() > (CONFIG.close - 1) * 60 - 15) continue;
    days.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(d), date: d, today: i === 0 });
  }
  const hoursOpen = []; for (let h = CONFIG.open; h < CONFIG.close; h++) hoursOpen.push(h);
  // Today, hours that have already started (or start within 15 min) can't be booked
  const earliestOf = (day) => { if (!day.today) return CONFIG.open; const t = nowIst(); return Math.max(CONFIG.open, Math.ceil((t.getHours() * 60 + t.getMinutes() + 15) / 60)); };
  const dayWord = (day) => (day.today ? 'Today' : day.label === 'Tomorrow' ? 'Tomorrow' : dayLabel(day.date));

  const availDays = $('#avail-days'), availNote = $('#avail-note'), liveStrip = $('#live-strip');
  availDays.insertAdjacentHTML('afterbegin', days.map((d, i) => `<button type="button" data-value="${d.key}" aria-pressed="${i === 0}"><b>${d.label}</b><small></small></button>`).join(''));
  const segs = Object.fromEntries($$('.seg[data-key]', builder).map((x) => [x.dataset.key, x]));
  $('.seg-ind', segs.game).insertAdjacentHTML('beforebegin', CONFIG.games.map((g) => `<button type="button" data-value="${esc(g)}" aria-pressed="false">${esc(g)}</button>`).join(''));

  // con: the console filter (any / ps5 / xbox / room); station: what's booked (ps5 / xbox / squad = whole room)
  // live: null while loading, true once the database answered, false if it can't be reached
  // passPlan: the visitor's own pass ('use-pass' / 'member') once they arrive from My pass or pick it, so the fare step leads with it
  // booked: the booking id once saved
  const state = { step: 1, con: 'any', station: 'ps5', players: '1', time: '1', plan: 'hourly', passPlan: null, food: {}, date: days[0].key, start: null, game: 'any', week: new Map(), live: null, booked: null };
  const takenOn = (key) => state.week.get(key) || new Set();
  const params = new URLSearchParams(location.search);
  // Opened from a pass card (/book?pass=duo): pay with the pass
  const passKind = params.get('pass');
  if (passKind === 'solo' || passKind === 'duo') {
    Object.assign(state, { plan: params.get('rate') === 'member' ? 'member' : 'use-pass', players: passKind === 'duo' ? '2' : '1' });
    select(segs.plan, state.plan); select(segs.players, state.players); $('#sum-pass').open = true;
  }
  // The "3–4 players" card on the home page (/book?players=3): the whole room for 3
  const playersParam = params.get('players');
  if (playersParam === '3' || playersParam === '4') { Object.assign(state, { players: playersParam, con: 'room', station: 'squad', time: String(CONFIG.squadMinHours) }); select(segs.players, playersParam); select(segs.con, 'room'); select(segs.time, state.time); }
  // A game card on the home page (/book?game=FC%2027): that game is picked
  const gameParam = params.get('game');
  if (gameParam && CONFIG.games.includes(gameParam)) { state.game = gameParam; select(segs.game, gameParam); $('#sum-game').open = true; }
  // A slot link from the members' board (/book?slot=2026-10-20_ps5_18&hrs=1): opens the fare step on that slot once live slots have loaded
  const slotParam = (params.get('slot') || '').match(/^(\d{4}-\d{2}-\d{2})_(ps5|xbox|squad)_(\d{1,2})$/);
  let pendingSlot = slotParam ? { date: slotParam[1], station: slotParam[2], hour: +slotParam[3], hours: Math.min(MAX_ONLINE_HOURS, Math.max(1, +(params.get('hrs') || 1))) } : null;

  // Name (and the number last used to sign in): remembered on this phone for next time
  const nameInput = $('#book-name'), phoneInput = $('#book-phone'), codeInput = $('#book-code'), phoneErr = $('#phone-err');
  try { nameInput.value = localStorage.getItem('mg-name') || ''; phoneInput.value = localStorage.getItem('mg-phone') || ''; } catch (e) {}
  // A 10-digit Indian mobile (6-9 first), typed with or without +91, 0, spaces or dashes
  const mobile = (v) => { const d = String(v).replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''); return /^[6-9]\d{9}$/.test(d) ? d : null; };
  const checkPhone = (strict) => {
    const v = phoneInput.value.trim(), ok = mobile(v);
    const msg = ok || (!strict && v.replace(/\D/g, '').length < 10) ? '' : v ? 'Enter a 10-digit mobile number, like 98765 43210.' : 'Add your mobile number so we can reach you.';
    phoneErr.textContent = msg;
    if (msg) phoneInput.setAttribute('aria-invalid', 'true'); else phoneInput.removeAttribute('aria-invalid');
    return ok;
  };
  phoneInput.addEventListener('input', () => { phoneInput.value = phoneInput.value.replace(/[^\d+\s-]/g, ''); checkPhone(false); });
  phoneInput.addEventListener('blur', () => { if (phoneInput.value.trim()) checkPhone(true); });
  nameInput.addEventListener('input', () => { if (nameInput.value.trim()) { nameInput.removeAttribute('aria-invalid'); statusEl.textContent = ''; } });
  nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (sign === 'phone') phoneInput.focus(); else if (sign === 'code') codeInput.focus(); else primary(); } });
  phoneInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); primary(); } });
  // The SMS code: digits only; the sixth digit books it
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); phoneErr.textContent = ''; codeInput.removeAttribute('aria-invalid');
    if (codeInput.value.length === 6 && !busy) primary();
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); primary(); } });

  /* ---------- sign-in (book-account.js): the same Firebase sign-in as My pass, so a signed-in phone just books ---------- */
  // acct: the module (null while loading, false if it can't load); user: the signed-in phone user
  // sign: checking / phone (type the number) / code (type the SMS code) / done (signed in) / offline
  let acct = null, acctLoad = null, user = null, sign = 'checking';
  const pretty = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p || ''); };
  const paintSign = () => {
    $('#sign-checking').hidden = sign !== 'checking' && sign !== 'offline';
    $('#sign-checking').textContent = sign === 'offline' ? "Sign-in isn't loading right now. You can still send the request on WhatsApp." : 'Checking sign-in…';
    $('#sign-phone').hidden = sign !== 'phone';
    $('#sign-code').hidden = sign !== 'code';
    $('#sign-done').hidden = sign !== 'done';
    $('#sign-copy').hidden = sign !== 'phone' && sign !== 'code';
    $('#verified-phone').textContent = user ? pretty(user.phoneNumber) : '';
    if (sign === 'done' || sign === 'offline') { phoneErr.textContent = ''; $('#sign-wa').hidden = true; }
  };
  const loadAccount = () => acctLoad || (acctLoad = import('/assets/js/book-account.js').then((m) => {
    acct = m;
    m.onUser((u) => {
      user = u;
      // Signed in: the name from the profile (users/{uid}), else the one typed last time. The top bar follows (account.js)
      if (u && !nameInput.value.trim()) {
        const c = m.cachedProfile();
        nameInput.value = (c && c.uid === u.uid && c.name) || (() => { try { return localStorage.getItem('mg-name') || ''; } catch (e) { return ''; } })();
        if (!c || c.uid !== u.uid) m.getProfile(u).then((p) => { if (p && p.name && !nameInput.value.trim()) nameInput.value = p.name; }).catch(() => {});
      }
      if (!u && user === null && sign === 'done') nameInput.value = '';   // signed out from here or the account sheet
      sign = u ? 'done' : sign === 'code' ? 'code' : 'phone';
      if (!state.booked) { paintSign(); render(); }
    });
    return m.ready.then(() => m);
  }).catch(() => { acct = false; sign = 'offline'; paintSign(); render(); return null; }));
  $('#change-number').addEventListener('click', () => {
    if (acct) acct.forgetCode();
    sign = 'phone'; codeInput.value = ''; phoneErr.textContent = ''; statusEl.textContent = '';
    paintSign(); render(); phoneInput.focus();
  });
  $('#sign-out').addEventListener('click', () => { if (acct) acct.signOut(); });

  // Food: the menu's Top Combos, each with the gamer price (10% off, rounded to the rupee).
  // Live changes from the owner (menuOverrides: price, sold out, hidden) are applied once they load (menu-live.js).
  const comboSec = window.MENU && window.MENU.sections.find((x) => x.id === 'combos');
  const withPrice = (c, price) => Object.assign(c, { price, off: Math.round(price * CONFIG.foodPerk) });
  let COMBOS = comboSec ? comboSec.groups.flatMap((g) => g.items).filter((it) => it.price).map((it, i) => withPrice({ id: 'c' + i, item: it, name: it.name, soldOut: false }, it.price)) : [];
  const foodLines = () => COMBOS.filter((c) => state.food[c.id] > 0).map((c) => ({ ...c, qty: state.food[c.id] }));
  if (COMBOS.length) import('/assets/js/menu-live.js').then((m) => m.loadOverrides().then((ov) => {
    const ids = m.idsFor(window.MENU);
    COMBOS = COMBOS.filter((c) => {
      const live = m.liveItem(c.item, ids.get(c.item), ov);
      if (live.hidden) { delete state.food[c.id]; return false; }
      withPrice(c, live.price); c.soldOut = live.soldOut;
      if (c.soldOut) delete state.food[c.id];
      return true;
    });
    if (!state.booked) render();
  })).catch(() => {});   // keep menu-data.js

  // Whole room splits players across both consoles: 2 = two solos, 3 = duo + solo, 4 = two duos
  const squadSplit = { 2: ['solo', 'solo'], 3: ['duo', 'solo'], 4: ['duo', 'duo'] };
  const splitLabel = { 2: '2 solos', 3: 'duo + solo', 4: '2 duos' };
  // Up to 2 players per console (two controllers each); 3 or 4 players take the whole room
  const KIND = { 1: 'solo', 2: 'duo' };
  const KIND_LABEL = { solo: 'Solo, 1 player', duo: 'Duo, 2 players on one console' };
  const consolesOf = (station) => (station === 'squad' ? ['ps5', 'xbox'] : [station]);
  // Can this session be booked? Inside opening hours, not started, and every hour free on every console it needs
  const fits = (key, station, h0, n) => {
    const day = days.find((d) => d.key === key), taken = takenOn(key);
    if (!day || h0 < earliestOf(day) || h0 + n > CONFIG.close || n > MAX_ONLINE_HOURS) return false;
    if (state.live === false) return true;   // no database: anything inside opening hours can be requested on WhatsApp
    return consolesOf(station).every((c) => Array.from({ length: n }, (_, i) => h0 + i).every((h) => !taken.has(`${c}_${h}`)));
  };
  const openOn = (day, c) => hoursOpen.filter((h) => h >= earliestOf(day) && !takenOn(day.key).has(`${c}_${h}`)).length;
  const anyFree = (day) => hoursOpen.filter((h) => fits(day.key, 'ps5', h, 1) || fits(day.key, 'xbox', h, 1)).length;
  const startsIn = (day, h) => { if (!day.today) return ''; const t = nowIst(), m = h * 60 - (t.getHours() * 60 + t.getMinutes()); return m > 0 && m <= 180 ? `Starts in ${m >= 60 ? `${hrs(Math.floor(m / 60))} ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : m + ' min'}` : ''; };
  // What a fare costs for the current pick: plan = hourly / buy-pass / use-pass / member
  const price = (plan) => {
    const players = +state.players, squad = state.station === 'squad', n = +state.time;
    const kind = squad ? 'solo' : KIND[players];
    const rate = squad ? squadSplit[players].reduce((sum, k) => sum + CONFIG.rates[k], 0) : CONFIG.rates[kind];
    const memberRate = plan === 'member' ? CONFIG.memberRates[kind] : 0;
    const gaming = plan === 'buy-pass' ? CONFIG.passes[kind] : plan === 'use-pass' ? 0 : (memberRate || rate) * n;
    const lines = foodLines(), foodPrice = lines.reduce((sum, c) => sum + c.price * c.qty, 0), perk = lines.reduce((sum, c) => sum + c.off * c.qty, 0);
    return { kind, rate, memberRate, gaming, foodPrice, perk, total: gaming + foodPrice - perk, passName: kind === 'duo' ? 'Duo pass' : 'Solo pass' };
  };
  const passOk = () => state.station !== 'squad' && +state.players <= 2;
  // Slots for the results: each start hour that has room for this group and length, with the consoles that are free
  const slotsFor = (day) => {
    const n = +state.time, out = [];
    hoursOpen.forEach((h) => {
      const free = state.con === 'room' ? (fits(day.key, 'squad', h, n) ? ['squad'] : []) : (state.con === 'any' ? ['ps5', 'xbox'] : [state.con]).filter((c) => fits(day.key, c, h, n));
      if (h >= earliestOf(day) && h + n <= CONFIG.close) out.push({ h, free });
    });
    return out;
  };
  const canBook = () => !!window.MGDB && state.live !== false && acct !== false;

  const render = () => {
    const players = +state.players;
    // The whole room is for 2-4 players and needs its minimum hours; 3 or 4 players can only take the whole room
    // (up to 2 players per console), and the whole room pays by the hour
    $('[data-key="con"] [data-value="room"]', builder).hidden = players < 2;
    if (players < 2 && state.con === 'room') { state.con = 'any'; state.station = 'ps5'; select(segs.con, 'any'); }
    if (players > 2 && state.con !== 'room') { state.con = 'room'; state.station = 'squad'; select(segs.con, 'room'); }
    $$('button', segs.con).forEach((b) => { if (b.dataset.value !== 'room') b.disabled = players > 2; });
    if (state.con === 'room' && +state.time < CONFIG.squadMinHours) { state.time = String(CONFIG.squadMinHours); select(segs.time, state.time); }
    $$('button', segs.time).forEach((b) => { b.disabled = state.con === 'room' && +b.dataset.value < CONFIG.squadMinHours; });
    if (state.start !== null && !fits(state.date, state.station, +state.start, +state.time)) { state.start = null; if (state.step > 1) goStep(1); }
    if (!passOk() && state.plan !== 'hourly') state.plan = 'hourly';
    if (state.plan === 'use-pass' || state.plan === 'member') state.passPlan = state.plan;
    $$('button', segs.plan).forEach((b) => { b.disabled = !passOk(); b.setAttribute('aria-pressed', String(b.dataset.value === state.plan)); });
    const day = days.find((d) => d.key === state.date), n = +state.time, P = price(state.plan), picked = state.start !== null, s0 = +state.start;
    Object.assign(state, { day, hours: n, squad: state.station === 'squad' }, P);

    renderSearch(day); renderTrip(day, P); renderFares(P); renderCombos(); renderTicket(day, P);
    $('#game-pick').textContent = state.game === 'any' ? 'Optional' : state.game;
    $('#bday-upsell').href = `/birthdays?date=${state.date}#bday-plan`;

    // Fare summary (laptop) and the bottom bar (phones)
    $('#sum-when').textContent = picked ? `${names[state.station]} · ${dayWord(day)}, ${span(s0, s0 + n)}` : 'Pick a slot';
    if (state.step === 1 && picked && state.plan === 'buy-pass') { state.plan = 'hourly'; return render(); }   // back on step 1: quote hourly, offer the pass again on step 2
    $('#sum-gaming-label').textContent = state.plan === 'buy-pass' ? `6-hr ${P.passName.toLowerCase()}` : state.plan === 'use-pass' ? `Gaming (from your ${P.passName.toLowerCase()})` : state.plan === 'member' ? `Gaming (member rate ${inr(P.memberRate)}/hr × ${n})` : `Gaming (${inr(P.rate)}/hr × ${n})`;
    $('#sum-gaming').textContent = inr(picked ? P.gaming : 0);
    $('#sum-food-row').hidden = $('#sum-perk-row').hidden = !P.foodPrice;
    $('#sum-food').textContent = inr(P.foodPrice); $('#sum-perk').textContent = '−' + inr(P.perk);
    setRoll($('#sum-total'), picked ? P.total : 0);
    const cta = state.step < 3 ? 'Continue' : fallbackUrl ? 'Open WhatsApp' : !canBook() ? 'Send on WhatsApp'
      : sign === 'phone' ? 'Send code' : sign === 'code' ? 'Verify & book' : 'Book now';
    $('#side-go').textContent = cta; $('#bar-go').textContent = cta;
    $('#side-go').disabled = !picked || busy; $('#bar-go').disabled = busy;
    $('#bar-price').textContent = picked ? inr(state.step === 1 ? price('hourly').total : P.total) : '';
    $('#bar-what').textContent = picked ? `${names[state.station]} · ${dayWord(day)} ${span(s0, s0 + n)}` : '';
    // Step bar: done steps can be revisited
    $$('#steps-bar [data-go]').forEach((b) => { const k = +b.dataset.go; b.disabled = k > state.step && !(k === 2 && picked); if (k === state.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); b.classList.toggle('is-done', k < state.step); });
    paintBar();
    $$('.seg', builder).forEach(placeInd);
  };

  // Step 1: live strip, day chips and the results list
  const renderSearch = (day) => {
    liveStrip.classList.toggle('is-live', state.live === true);
    $$('button', availDays).forEach((b) => {
      const d = days.find((x) => x.key === b.dataset.value), left = state.live === true ? anyFree(d) : null;
      $('small', b).textContent = left === null ? '' : left === 0 ? 'Full' : left <= 4 ? `${left} hr${left > 1 ? 's' : ''} left` : '';
      b.classList.toggle('is-full', left === 0); b.classList.toggle('is-few', left > 0 && left <= 4);
    });
    const slots = slotsFor(day), open = slots.filter((x) => x.free.length), gone = slots.length - open.length;
    if (state.live === null) availNote.textContent = 'Checking live slots…';
    else if (state.live === false) availNote.textContent = "Live slots aren't loading right now. Pick a time and we'll confirm it on WhatsApp.";
    else if (!open.length) availNote.textContent = `${dayWord(day)} is fully booked for ${hrs(+state.time)}${state.con === 'any' ? '' : ' on ' + (state.con === 'room' ? 'the whole room' : names[state.con])}. Try another day or a shorter time.`;
    else availNote.textContent = `${open.length <= 3 ? 'Only ' : ''}${open.length} slot${open.length > 1 ? 's' : ''} left ${day.today ? 'today' : 'on ' + dayWord(day)}${gone ? ` · ${gone} already booked` : ''} · PS5 ${hrs(openOn(day, 'ps5'))}, Xbox ${hrs(openOn(day, 'xbox'))} free`;
    const band = (h) => (h < 17 ? 'Afternoon · 11 am – 5 pm' : h < 21 ? 'Evening · 5 – 9 pm' : 'Night · 9 – 11 pm');
    let last = '', html = '';
    if (state.live === null) html = '<div class="slot-card is-loading"></div>'.repeat(3);
    else open.forEach(({ h, free }) => {
      if (band(h) !== last) { last = band(h); html += `<p class="results-band">${last}</p>`; }
      const n = +state.time, tags = [];
      if (state.live === true && state.con === 'any' && free.length === 1) tags.push('<em class="is-hot">Last console</em>');
      const soon = startsIn(day, h); if (soon) tags.push(`<em>${soon}</em>`);
      const cons = free.map((c) => `<span class="con con-${c}">${names[c]}</span>`).join('');
      html += `<button type="button" class="slot-card press" data-hour="${h}" data-console="${free[0]}">
        <span class="slot-time"><b>${hm(h)}</b><span class="slot-line" aria-hidden="true"></span><b>${hm(h + n)}</b></span>
        <span class="slot-meta">${hrs(n)} · ${cons}</span>
        <span class="slot-price">${inr(state.con === 'room' ? squadSplit[+state.players].reduce((sum, k) => sum + CONFIG.rates[k], 0) * n : CONFIG.rates[KIND[+state.players]] * n)}<small>${+state.players > 1 ? 'for ' + state.players : 'total'}</small></span>
        ${tags.length ? `<span class="slot-tags">${tags.join('')}</span>` : ''}
      </button>`;
    });
    $('#results').innerHTML = html;
  };

  // Step 2: the chosen slot (with a console switch) and the fares
  const renderTrip = (day) => {
    if (state.start === null) { $('#trip').innerHTML = ''; return; }
    const s0 = +state.start, n = +state.time;
    const sw = state.station === 'squad' ? '' : `<div class="seg seg-chips trip-con" aria-label="Console">${['ps5', 'xbox'].map((c) => `<button type="button" data-con="${c}" aria-pressed="${state.station === c}" ${fits(state.date, c, s0, n) ? '' : 'disabled'}>${names[c]}</button>`).join('')}<span class="seg-ind" aria-hidden="true"></span></div>`;
    $('#trip').innerHTML = `<div class="trip-main"><p class="trip-when">${dayWord(day)}, ${dayLabel(day.date)}</p>
      <p class="trip-time"><b>${hm(s0)}</b><span class="slot-line" aria-hidden="true"></span><b>${hm(s0 + n)}</b></p>
      <p class="trip-meta">${hrs(n)} · ${state.station === 'squad' ? `Whole room · ${state.players} players (${splitLabel[state.players]})` : `${+state.players === 1 ? 'Solo' : +state.players === 2 ? 'Duo' : state.players + ' players'}`}${startsIn(day, s0) ? ' · ' + startsIn(day, s0).toLowerCase() : ''}</p></div>
      ${sw}<button type="button" class="link-btn trip-change" data-go="1">Change slot</button>`;
  };
  const renderFares = (P) => {
    if (state.start === null) { $('#fares').innerHTML = ''; return; }
    const n = +state.time, hourly = price('hourly'), pass = price('buy-pass'), perHr = Math.round(CONFIG.passes[P.kind] / CONFIG.passHours);
    const save = CONFIG.rates[P.kind] * CONFIG.passHours - CONFIG.passes[P.kind];
    const own = passOk() && state.passPlan;   // a pass holder: their pass first, no "Best value" upsell above it
    const card = (plan, title, amount, lines, badge = '') => `<button type="button" class="fare ${plan === (own || 'buy-pass') ? 'fare-pass' : ''}" role="radio" aria-checked="${state.plan === plan}" data-plan="${plan}">
      <span class="fare-head"><b>${title}</b>${badge}</span><span class="fare-price">${amount}</span>
      <span class="fare-lines">${lines.map((l) => `<span>${l}</span>`).join('')}</span></button>`;
    const buyLines = [`${inr(perHr)}/hr · save ${inr(save)} vs hourly`, `Today uses ${hrs(n)} · ${hrs(CONFIG.passHours - n)} left for 30 days`, `Then ${inr(CONFIG.memberRates[P.kind])}/hr member rate till day 30`];
    let html = '';
    if (own) {
      const mine = price(own);
      html += card(own, own === 'use-pass' ? `My ${P.passName.toLowerCase()}` : 'Member rate', inr(mine.gaming), [own === 'use-pass' ? `${hrs(n)} off your pass` : `${inr(mine.memberRate)}/hr × ${hrs(n)} · pass hours used up`, 'We check your pass at the counter']);
    }
    html += card('hourly', 'Pay per hour', inr(hourly.gaming), [`${inr(hourly.rate)}/hr × ${hrs(n)}`, passOk() && !own && state.plan === 'hourly' ? `<em>Play 6 hrs this month? The pass saves you ${inr(save)}.</em>` : 'Pay for today only']);
    if (passOk()) {
      // Hours left on the pass: no new pass on offer. Hours used up (member rate): a new pass, last and untagged
      if (!own) html += card('buy-pass', `6-hr ${P.passName}`, inr(pass.gaming), buyLines, '<span class="tag">Best value</span>');
      else if (own === 'member') html += card('buy-pass', `New 6-hr ${P.passName.toLowerCase()}`, inr(pass.gaming), buyLines);
    } else html += `<p class="fare-note">The 6-hr pass is for 1–2 players on one console. The whole room is paid by the hour.</p>`;
    $('#fares').innerHTML = html;
    $('#plan-hint').textContent = !passOk() ? 'Passes are for 1 or 2 players on one console.'
      : state.plan === 'use-pass' ? `We take ${hrs(n)} off your ${P.passName.toLowerCase()}. Food is still charged.`
      : state.plan === 'member' ? `For ${P.passName.toLowerCase()} holders who have used all 6 hours, until the pass's 30 days end: ${inr(price('member').memberRate)}/hr instead of ${inr(P.rate)}.` : '';
  };
  // Step 2: combos with the gamer price; Add, then − n +. Sold out today: shown, can't be added
  const renderCombos = () => {
    $('#combos').innerHTML = COMBOS.map((c) => {
      const q = state.food[c.id] || 0;
      return `<div class="combo ${q ? 'is-in' : ''} ${c.soldOut ? 'is-out' : ''}" data-id="${c.id}">
        <p class="combo-items">${c.name.split(' + ').map((x) => `<span>${esc(x)}</span>`).join('<i aria-hidden="true">+</i>')}</p>
        <p class="combo-price"><s aria-label="was ${inr(c.price)}">${inr(c.price)}</s><b>${inr(c.price - c.off)}</b><span class="tag">10% off</span></p>
        <div class="combo-qty">${c.soldOut ? '<span class="tag tag-out">Sold out today</span>' : q ? `<button type="button" class="icon-btn press" data-dec aria-label="One less">−</button><output aria-label="Quantity">${q}</output><button type="button" class="icon-btn press" data-inc aria-label="One more" ${q >= 9 ? 'disabled' : ''}>+</button>` : '<button type="button" class="btn btn-sm btn-ghost press" data-inc>Add</button>'}</div>
      </div>`;
    }).join('');
  };
  // Step 3 and the booked screen: a boarding-pass style ticket
  const fareLine = (P, n) => (state.plan === 'buy-pass' ? `6-hr ${P.passName.toLowerCase()} · uses ${n} of ${CONFIG.passHours} hrs` : state.plan === 'use-pass' ? `My ${P.passName.toLowerCase()}` : state.plan === 'member' ? `Member rate ${inr(P.memberRate)}/hr` : `Hourly ${inr(P.rate)}/hr`);
  const ticketHtml = (day, P, label) => {
    const s0 = +state.start, n = +state.time;
    return `<div class="ticket-top"><span class="ticket-brand">MR. GAMING</span><span class="ticket-id">${label}</span></div>
      <div class="ticket-route"><div><small>Start</small><b>${hm(s0)}</b></div><span class="slot-line" aria-hidden="true"></span><div><small>End</small><b>${hm(s0 + n)}</b></div></div>
      <dl class="ticket-grid"><div><dt>Date</dt><dd>${dayLabel(day.date)}</dd></div><div><dt>Console</dt><dd>${names[state.station]}</dd></div>
      <div><dt>Players</dt><dd>${state.players}</dd></div><div><dt>Time</dt><dd>${hrs(n)}</dd></div></dl>
      <div class="ticket-cut" aria-hidden="true"></div>
      <dl class="ticket-bill"><div><dt>${fareLine(P, n)}</dt><dd>${inr(P.gaming)}</dd></div>${foodLines().map((c) => `<div><dt>${c.qty} × ${esc(c.name)}</dt><dd>${inr(c.price * c.qty)}</dd></div>`).join('')}${P.perk ? `<div><dt>Gamer perk −10% on food</dt><dd>−${inr(P.perk)}</dd></div>` : ''}
      <div class="ticket-total"><dt>Total</dt><dd>${inr(P.total)}</dd></div></dl>`;
  };
  const renderTicket = (day, P) => { $('#ticket').innerHTML = state.start === null ? '' : ticketHtml(day, P, 'Your booking'); };

  // Steps: one panel at a time; on phones the bottom bar carries the price and the next step, and the phone's
  // back button goes back a step
  const phone = matchMedia('(max-width: 959px)'), bar = $('#book-bar');
  let bookInView = true, busy = false, fallbackUrl = '';   // fallbackUrl: the WhatsApp request once booking online failed
  function goStep(k, push = true) {
    if (state.booked) return;
    if (k > 1 && state.start === null) k = 1;
    const was = state.step; state.step = k;
    $$('.step-panel', builder).forEach((p) => { p.hidden = +p.dataset.step !== k; });
    if (push && k !== was && history.pushState) history.pushState({ mgStep: k }, '', location.pathname + location.search);
    if (k !== was) {
      // Scroll to the top of the step: below the sticky header and the sticky step bar on phones, with the step bar in view on laptops
      const top = (phone.matches ? $('#availability').getBoundingClientRect().top - $('#steps-bar').offsetHeight : $('#steps-bar').getBoundingClientRect().top) + scrollY - $('#topbar').offsetHeight - 12;
      if (Math.abs(top - scrollY) > 4) scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
    }
    if (k >= 2) loadAccount();   // the sign-in code, only once the visitor is on the way to booking
    if (k === 3) setTimeout(() => { const empty = !nameInput.value.trim() ? nameInput : sign === 'phone' && !mobile(phoneInput.value) ? phoneInput : sign === 'code' ? codeInput : null; if (empty) empty.focus({ preventScroll: true }); }, 400);
    render();
  }
  window.addEventListener('popstate', (e) => { if (e.state && e.state.mgStep) goStep(e.state.mgStep, false); else if (state.step > 1) goStep(1, false); });
  function paintBar() {
    const show = phone.matches && state.start !== null && bookInView && !state.booked;
    bar.hidden = !show; root.classList.toggle('in-checkout', show && state.step > 1);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { bookInView = e.isIntersecting; paintBar(); }, { rootMargin: '-25% 0px -35% 0px' }).observe($('#book .wrap'));
  phone.addEventListener('change', paintBar);

  // Choices
  $('#results').addEventListener('click', (e) => {
    const b = e.target.closest('.slot-card[data-hour]'); if (!b) return;
    // A fresh pick starts on the hourly fare; the pass is offered on the fare step (keep "use my pass" / member from My pass)
    Object.assign(state, { start: b.dataset.hour, station: b.dataset.console, plan: state.plan === 'buy-pass' ? 'hourly' : state.plan });
    statusEl.textContent = ''; fallbackUrl = '';
    goStep(2);
  });
  $('#trip').addEventListener('click', (e) => {
    const c = e.target.closest('[data-con]'); if (c && !c.disabled) { state.station = c.dataset.con; render(); }
    if (e.target.closest('[data-go]')) goStep(1);
  });
  $('#fares').addEventListener('click', (e) => { const f = e.target.closest('.fare'); if (f) { state.plan = f.dataset.plan; render(); } });
  $('#combos').addEventListener('click', (e) => {
    const card = e.target.closest('.combo'), b = e.target.closest('[data-inc], [data-dec]'); if (!card || !b) return;
    const id = card.dataset.id, c = COMBOS.find((x) => x.id === id); if (!c || c.soldOut) return;
    const q = (state.food[id] || 0) + (b.hasAttribute('data-inc') ? 1 : -1);
    if (q > 0) state.food[id] = Math.min(q, 9); else delete state.food[id];
    render();
    const again = $(`.combo[data-id="${id}"] [data-inc]`); if (again) again.focus({ preventScroll: true });
  });
  $('#steps-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b && !b.disabled) goStep(+b.dataset.go); });
  availDays.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (state.date !== b.dataset.value) state.start = null; state.date = b.dataset.value; select(availDays, state.date); render(); });
  Object.entries(segs).forEach(([key, seg]) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      state[key] = b.dataset.value; select(seg, b.dataset.value);
      if (key === 'con') state.station = b.dataset.value === 'room' ? 'squad' : state.station === 'squad' ? 'ps5' : state.station;
      if (key === 'con' || key === 'time' || key === 'players') state.start = state.step === 1 ? null : state.start;
      render();
    });
  });

  // Live availability for the whole week in one read (the form works without it, as a WhatsApp request)
  let dbFailed = false;
  const refreshTaken = (quiet) => {
    if (!window.MGDB) { if (dbFailed) state.live = false; render(); return; }
    if (!quiet) state.live = null;
    render();
    window.MGDB.takenRange(days[0].key, days[days.length - 1].key)
      .then((week) => { Object.assign(state, { week, live: true }); if (!state.booked) render(); openPendingSlot(); })
      .catch(() => { state.live = false; if (!state.booked) render(); });
  };
  // The board's "next free slot" link: pick that slot and go to the fare step, if it is still free
  const openPendingSlot = () => {
    const q = pendingSlot; if (!q) return; pendingSlot = null;
    if (!days.some((d) => d.key === q.date)) return;
    if (q.station === 'squad') { state.con = 'room'; select(segs.con, 'room'); if (+state.players < 2) { state.players = '2'; select(segs.players, '2'); } }
    state.date = q.date; select(availDays, q.date); state.time = String(Math.max(q.hours, q.station === 'squad' ? CONFIG.squadMinHours : 1)); select(segs.time, state.time);
    if (fits(q.date, q.station, q.hour, +state.time)) { Object.assign(state, { start: String(q.hour), station: q.station, plan: state.plan === 'buy-pass' ? 'hourly' : state.plan }); goStep(2); }
    else { render(); availNote.textContent = 'That slot just went. Here are the ones still open.'; }
  };
  if (window.MGDB) refreshTaken(); else window.addEventListener('mgdb-ready', () => refreshTaken(), { once: true });
  import('/assets/js/booking-db.js').catch(() => { dbFailed = true; refreshTaken(); });   // offline or blocked: WhatsApp-only requests
  const refreshQuiet = () => { if (document.visibilityState === 'visible' && window.MGDB && !state.booked && !busy) refreshTaken(true); };
  setInterval(refreshQuiet, 60000);
  document.addEventListener('visibilitychange', refreshQuiet);

  /* ---------- the bill, for WhatsApp and the calendar ---------- */
  // phoneNo: 10 digits, or '' when the visitor couldn't sign in (WhatsApp shows us their number anyway)
  const billLines = (st, id, name, phoneNo) => {
    const s0 = +st.start, d = st.day.date, p = +st.players, hh = hrs(st.hours);
    const who = st.squad ? `Whole room (PS5 + Xbox) · ${p} players, ${splitLabel[p]}` : `${names[st.station]} · ${KIND_LABEL[st.kind]}`;
    const gamingLine = st.plan === 'buy-pass' ? `${st.passName} (${CONFIG.passHours} hrs, valid 30 days) = ${inr(st.gaming)}\nThis visit uses ${st.hours} of ${CONFIG.passHours} hrs`
      : st.plan === 'use-pass' ? `Gaming: ${hh} from my ${st.passName.toLowerCase()} = ₹0`
      : st.plan === 'member' ? `Gaming at member rate (my ${st.passName.toLowerCase()} hours are used up): ${inr(st.memberRate)}/hr × ${hh} = ${inr(st.gaming)}`
      : `Gaming: ${inr(st.rate)}/hr × ${hh} = ${inr(st.gaming)}`;
    return [
      `Name: ${name}`,
      phoneNo ? `Mobile: +91 ${phoneNo.slice(0, 5)} ${phoneNo.slice(5)}${user ? ' (verified)' : ''}` : null,
      `When: ${dayLabel(d)}, ${clock(s0)} – ${clock(s0 + st.hours)}`,
      `Console: ${who}`,
      st.game !== 'any' ? `Game: ${st.game}` : null,
      '',
      '*Bill*',
      gamingLine,
      ...foodLines().map((c) => `Food: ${c.qty} × ${c.name} = ${inr(c.price * c.qty)}`),
      st.perk ? `Gamer perk (10% off food): −${inr(st.perk)}` : null,
      `*Total: ${inr(st.total)}*`
    ].filter((l) => l !== null);
  };
  // An .ics file made on the phone: the session in UTC (IST is UTC+5:30), with the address and the booking id
  const icsHref = (st, id) => {
    const d = st.day.date, s0 = +st.start;
    const utc = (h) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h) - 330 * 60000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const txt = (s) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MR. GAMING//Booking//EN', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
      `UID:${id}@mr-gaming`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`, `DTSTART:${utc(s0)}`, `DTEND:${utc(s0 + st.hours)}`,
      `SUMMARY:${txt(`MR. GAMING · ${names[st.station]}, ${hrs(st.hours)}`)}`, `LOCATION:${txt(CONFIG.address)}`,
      `DESCRIPTION:${txt(`Booking ${id}. Total ${inr(st.total)}, pay at the venue. Questions: +91 73372 30311`)}`,
      'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', 'DESCRIPTION:MR. GAMING in 1 hour', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  };

  // Booked: the ticket, then calendar and WhatsApp; the steps, bars and summary step aside
  const showBooked = (st, id, waBooked) => {
    state.booked = id;
    const box = $('#booked'), s0 = +st.start;
    box.innerHTML = `<div class="booked-head"><span class="booked-ic"><svg class="i"><use href="#i-check"/></svg></span>
        <div><h2 class="booked-title">Booked</h2><p class="booked-sub">${dayWord(st.day)}, ${dayLabel(st.day.date)} · ${span(s0, s0 + st.hours)} · ${names[st.station]}</p></div></div>
      <div class="ticket">${ticketHtml(st.day, st, 'Booked')}</div>
      <p class="booked-id">Booking id <b>${id}</b></p>
      <p class="booked-pay"><strong>Pay at the venue — no advance.</strong> UPI, cash or card. Show this screen or tell us your name at the counter.</p>
      <div class="booked-acts">
        <a class="btn btn-accent press" href="${icsHref(st, id)}" download="mr-gaming-${id}.ics"><svg class="i"><use href="#i-cal-plus"/></svg> Add to calendar</a>
        <a class="btn btn-ghost press" href="${esc(waBooked)}" target="_blank" rel="noopener"><svg class="i"><use href="#i-wa"/></svg> Send on WhatsApp</a>
      </div>
      <p class="booked-more">Need to change it? <a class="text-link" href="${esc(waUrl(`Hi MR. GAMING! I'd like to change my booking ${id}.`))}" target="_blank" rel="noopener">Message us</a> or call <a class="text-link" href="tel:+917337230311">73372 30311</a>. <a class="text-link" href="/book">Book another slot</a></p>`;
    $$('.step-panel', builder).forEach((p) => { p.hidden = true; });
    $('#steps-bar').hidden = true; $('#checkout').hidden = true; $('#bday-upsell').hidden = true;
    box.hidden = false; builder.classList.add('is-booked');
    paintBar();
    const top = $('#book').getBoundingClientRect().top + scrollY - $('#topbar').offsetHeight;
    scrollTo({ top: Math.max(0, top), behavior: reduced ? 'auto' : 'smooth' });
    box.focus({ preventScroll: true });
  };

  // The main button: Continue (steps 1-2), Book now (step 3)
  const statusEl = $('#book-status');
  const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r({ ok: false, reason: 'offline' }), ms))]);
  const newId = (st) => { const d = st.day.date; return `MG-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(+st.start)}00-${Math.random().toString(36).slice(2, 6).toUpperCase()}`; };
  // The WhatsApp request (nothing saved): for when booking online can't happen. It isn't booked until we reply.
  const waRequestFor = (st, id, name, phoneNo) => waUrl([`Hi MR. GAMING! Booking request ${id}`, '', ...billLines(st, id, name, phoneNo), '', 'Please confirm my slot. (Not booked until you reply.)'].join('\n'));
  const fallback = (why, url) => {
    fallbackUrl = url;
    statusEl.textContent = `${why} We've opened WhatsApp with your request. It isn't booked until we reply.`;
    render();
    // ('noopener' would make window.open return null, so the opener is cut by hand; blocked pop-up: go there)
    const tab = window.open(url, '_blank');
    if (tab) tab.opener = null; else window.location.href = url;
  };
  const SEND_ERR = { 'auth/too-many-requests': 'Too many tries. Wait a while and try again.', 'auth/invalid-phone-number': 'That number looks wrong. Check it and try again.' };
  const CODE_ERR = { 'auth/invalid-verification-code': 'That code is wrong. Check the SMS and try again.', 'auth/code-expired': 'That code has expired. Use a different number or send it again.' };
  const primary = async () => {
    if (state.start === null || busy || state.booked) return;
    if (state.step < 3) return goStep(state.step + 1);
    if (fallbackUrl) { window.open(fallbackUrl, '_blank', 'noopener'); return; }
    let name = nameInput.value.trim();
    if (!name) { nameInput.focus(); nameInput.setAttribute('aria-invalid', 'true'); statusEl.textContent = 'Add your name to book.'; return; }
    nameInput.removeAttribute('aria-invalid');
    try { localStorage.setItem('mg-name', name); } catch (e) {}
    const st = { ...state };
    const typed = () => mobile(phoneInput.value) || '';
    // No database (it never loaded) or no sign-in: the WhatsApp request only
    if (!canBook()) return fallback('Online booking isn\'t available right now.', waRequestFor(st, newId(st), name, user ? pretty(user.phoneNumber).replace(/\D/g, '').slice(-10) : typed()));
    if (!acct || sign === 'checking') {
      busy = true; render(); statusEl.textContent = 'Checking sign-in…';
      await loadAccount(); busy = false; statusEl.textContent = '';
      if (!acct) return fallback('Sign-in isn\'t available right now.', waRequestFor(st, newId(st), name, typed()));
      render();
      if (!user) return;   // now showing the number field
    }

    // Not signed in yet: send the code, then check it (the booking is saved straight after)
    if (!user && sign === 'phone') {
      const p = checkPhone(true);
      if (!p) { phoneInput.focus(); statusEl.textContent = ''; return; }
      try { localStorage.setItem('mg-phone', p); } catch (e) {}
      busy = true; render(); statusEl.textContent = 'Sending code…';
      const r = await acct.sendCode('+91' + p, $('#book-recaptcha'));
      busy = false; statusEl.textContent = '';
      if (!r.ok) {
        phoneErr.textContent = SEND_ERR[r.code] || "We couldn't send a code right now. Try again in a minute.";
        $('#sign-wa-link').href = waRequestFor(st, newId(st), name, p); $('#sign-wa').hidden = false;
        render(); return;
      }
      sign = 'code'; $('#code-to').textContent = `sent to ${pretty(p)}`; codeInput.value = '';
      paintSign(); render(); codeInput.focus();
      return;
    }
    if (!user && sign === 'code') {
      const c = codeInput.value.replace(/\D/g, '');
      if (c.length !== 6) { phoneErr.textContent = 'Enter the 6-digit code from the SMS.'; codeInput.focus(); return; }
      busy = true; render(); statusEl.textContent = 'Checking the code…';
      const r = await acct.confirmCode(c);
      if (!r.ok) {
        busy = false; statusEl.textContent = ''; codeInput.setAttribute('aria-invalid', 'true');
        phoneErr.textContent = CODE_ERR[r.code] || "We couldn't check the code. Try again.";
        render(); codeInput.focus(); return;
      }
      busy = false; user = r.user; sign = 'done'; paintSign();
    }
    if (!user) return;
    // A first sign-in: the welcome form (profile.js) before the booking goes in, then the booking carries on.
    // Returning customers skip it (cached profile); a profile that can't be read never blocks the booking.
    busy = true; render();
    const prof = await acct.ensureProfile(user, { name }).catch(() => null);
    busy = false;
    if (prof && prof.name && (prof.created || !nameInput.value.trim())) { nameInput.value = prof.name; name = prof.name; }

    const phoneNo = pretty(user.phoneNumber).replace(/\D/g, '').slice(-10), s0 = +st.start, id = newId(st);
    const waBooked = waUrl([`Hi MR. GAMING! I booked online: ${id}`, '', ...billLines(st, id, name, phoneNo), '', 'Paying at the venue.'].join('\n'));
    busy = true; render(); statusEl.textContent = 'Booking your slot…';
    const res = await withTimeout(acct.reserve({
      id, name, date: st.date, start: s0, hours: st.hours, station: st.station, players: +st.players, plan: st.plan,
      game: st.game === 'any' ? '' : st.game, food: foodLines().map((c) => `${c.qty} × ${c.name}`).join('; ').slice(0, 300), total: st.total
    }), 15000);
    busy = false;
    if (res.ok) { statusEl.textContent = ''; showBooked(st, id, waBooked); return; }
    if (res.reason === 'taken') {
      state.week.set(st.date, res.taken); state.start = null; statusEl.textContent = ''; goStep(1);
      availNote.textContent = 'Someone just booked that time. Pick another slot.';
      return;
    }
    render();
    fallback("We couldn't reach our booking system.", waRequestFor(st, id, name, phoneNo));
  };
  $('#bar-go').addEventListener('click', primary);
  $('#side-go').addEventListener('click', primary);

  render();
  const placeAll = () => $$('.seg', builder).forEach(placeInd);
  window.addEventListener('resize', placeAll);
  document.fonts && document.fonts.ready.then(placeAll);
  $$('.sum-extras').forEach((d) => d.addEventListener('toggle', placeAll));
})();
