/* MR. GAMING — page behaviour. No dependencies. */
(function () {
  'use strict';

  /* ---------- business details: edit here ---------- */
  const CONFIG = {
    whatsapp: '917337230311',
    // Per console, per hour: 1 player = solo, 2 players on one console = duo
    // 3 or 4 players can also share one console (games with couch play); passes stay for 1-2 players
    rates: { solo: 199, duo: 320, trio: 420, quad: 499 },
    // 6-hour passes, valid 30 days
    passes: { solo: 899, duo: 1499 },
    // Member rate: once a pass's 6 hours are used, until its 30 days end. Between the pass and the regular rate.
    memberRates: { solo: 169, duo: 279 },
    passHours: 6,
    squadMinHours: 2,   // squad room: whole room, 2-4 players at the same per-person rate
    open: 11,           // opening hour, 24h clock (11 am)
    close: 23,          // closing hour (11 pm); sessions must end by then
    foodPerk: 0.10,     // 10% off food for console bookers
    // Birthday package: 3 hours, food included, ₹600 a child, ₹299 an adult. Minimum 10 guests (adults count towards it).
    // Up to roomMax guests get the game room to themselves; more than that get the whole restaurant.
    // Advance to book; on cancellation cancelFee is kept and the rest refunded
    birthday: { perChild: 600, perAdult: 299, hours: 3, minGuests: 10, roomMax: 15, advance: 3000, cancelFee: 1000 },
    food: {
      'none': { name: 'No food', price: 0 },
      'paneer-sub': { name: 'Mr. Paneer Sub', price: 129 },
      'paneer-pizza': { name: 'Paneer Pizza', price: 249 },
      'sub-combo': { name: 'Mr. Veggie Sub + Salted Fries + Cold Coffee', price: 300 }
    }
  };

  const root = document.documentElement;
  root.classList.add('js');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const waUrl = (text) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;

  /* ---------- WhatsApp links ---------- */
  $$('[data-wa]').forEach((a) => { a.href = waUrl(a.dataset.wa); });

  /* ---------- homepage food list (featured items from menu-data.js) ---------- */
  const foodList = $('#food-list');
  if (foodList && window.MENU) {
    const featured = [];
    window.MENU.sections.forEach((s) => s.groups.forEach((g) => g.items.forEach((it) => { if (it.featured) featured.push(it); })));
    foodList.innerHTML = featured.map((it) => {
      const price = it.prices ? `from ${inr(it.prices[0])}` : inr(it.price);
      return `<li class="food-item" data-reveal><h3>${it.short || it.name}</h3><span class="price">${price}</span>${it.desc ? `<p>${it.desc}</p>` : ''}</li>`;
    }).join('');
  }

  /* ---------- rolling digits ---------- */
  function setRoll(el, value) {
    const text = (el.dataset.prefix || '') + Math.round(value).toLocaleString('en-IN');
    if (el.dataset.text && el.dataset.text.length === text.length) {
      [...text].forEach((ch, i) => {
        const col = el.children[i] && el.children[i].firstElementChild;
        if (col && /\d/.test(ch)) col.style.transform = `translateY(-${ch}em)`;
      });
    } else {
      el.innerHTML = [...text].map((ch) => /\d/.test(ch)
        ? `<span class="d"><span>${'0123456789'.split('').map((n) => `<i>${n}</i>`).join('')}</span></span>`
        : `<span class="d">${ch}</span>`).join('');
      const cols = $$('.d > span', el);
      const digits = [...text].filter((c) => /\d/.test(c));
      if (reduced) cols.forEach((c, i) => { c.style.transform = `translateY(-${digits[i]}em)`; });
      else requestAnimationFrame(() => requestAnimationFrame(() => cols.forEach((c, i) => {
        c.style.transitionDelay = `${i * 60}ms`;
        c.style.transform = `translateY(-${digits[i]}em)`;
      })));
    }
    el.dataset.text = text;
    el.setAttribute('aria-label', text);
  }

  /* ---------- birthday package: children × ₹600 + adults × ₹299, enquiry goes to WhatsApp ---------- */
  const bday = $('#bday-send');
  if (bday) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const clock12 = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
    const ist = (() => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); })();
    const dateIn = $('#bday-date'), startIn = $('#bday-start'), nameIn = $('#bday-name');
    const { perChild, perAdult, hours, minGuests, roomMax, advance, cancelFee } = CONFIG.birthday;
    let kids = minGuests, adults = 0;
    dateIn.min = `${ist.getFullYear()}-${pad2(ist.getMonth() + 1)}-${pad2(ist.getDate())}`;
    // Start times so the 3 hours end by closing time
    for (let h = CONFIG.open; h + hours <= CONFIG.close; h++) startIn.insertAdjacentHTML('beforeend', `<option value="${h}">${clock12(h)} – ${clock12(h + hours)}</option>`);
    startIn.value = '16';
    const paint = () => {
      const guests = kids + adults, total = kids * perChild + adults * perAdult;
      $('#bday-kids').textContent = kids; $('#bday-adults').textContent = adults;
      // Never below 10 guests in total, and always at least one child
      $('#bday-kids-minus').disabled = kids <= 1 || guests <= minGuests;
      $('#bday-adults-minus').disabled = adults <= 0 || guests <= minGuests;
      const space = guests > roomMax ? 'Whole restaurant' : 'Exclusive game room';
      $('#bday-space').textContent = space;
      $('#bday-min').textContent = `${guests} guests. Minimum 10 in total; adults count towards it.`;
      $('#bday-sum').textContent = `${kids} × ${inr(perChild)}${adults ? ` + ${adults} × ${inr(perAdult)}` : ''}`;
      setRoll($('#bday-total'), total);
      const h = +startIn.value, day = dateIn.value ? new Date(dateIn.value + 'T00:00') : null;
      const time = `${clock12(h)} – ${clock12(h + hours)}`;
      bday.href = waUrl([
        "Hi MR. GAMING! I'd like to book the birthday package.",
        '',
        nameIn.value.trim() ? `Name: ${nameIn.value.trim()}` : null,
        `When: ${day ? day.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : 'date to be decided'}, ${time}`,
        `Guests: ${kids} ${kids === 1 ? 'child' : 'children'}${adults ? ` + ${adults} ${adults === 1 ? 'adult' : 'adults'}` : ''} (${guests} in total)`,
        `Space: ${space}`,
        `Package (${hours} hours): ${kids} × ${inr(perChild)}${adults ? ` + ${adults} × ${inr(perAdult)}` : ''} = ${inr(total)}`,
        `Advance to book: ${inr(advance)} (if cancelled, ${inr(cancelFee)} is kept and ${inr(advance - cancelFee)} refunded)`,
        '',
        'Please confirm the date and details.'
      ].filter((l) => l !== null).join('\n'));
    };
    const step = (id, fn) => $(id).addEventListener('click', () => { fn(); paint(); });
    step('#bday-kids-minus', () => { if (kids > 1 && kids + adults > minGuests) kids--; });
    step('#bday-kids-plus', () => { kids = Math.min(99, kids + 1); });
    step('#bday-adults-minus', () => { if (adults > 0 && kids + adults > minGuests) adults--; });
    step('#bday-adults-plus', () => { adults = Math.min(99, adults + 1); });
    [dateIn, startIn, nameIn].forEach((el) => el.addEventListener('input', paint));
    paint();
  }

  // Links to #birthday-terms open the terms before scrolling to them
  const terms = $('#birthday-terms');
  if (terms) {
    const openTerms = () => { if (location.hash === '#birthday-terms') terms.open = true; };
    $$('a[href="#birthday-terms"]').forEach((l) => l.addEventListener('click', () => { terms.open = true; }));
    window.addEventListener('hashchange', openTerms); openTerms();
  }

  /* ---------- hero headline: word-by-word fade-in-blur ---------- */
  const title = $('#hero-title');
  if (title) {
    let w = 0;
    $$('.line', title).forEach((line) => {
      const em = $('em', line);
      if (em) { em.classList.add('w'); em.style.setProperty('--w', w++); return; }
      line.innerHTML = line.textContent.trim().split(/\s+/).map((word) => `<span class="w" style="--w:${w++}">${word}</span>`).join(' ');
    });
    requestAnimationFrame(() => requestAnimationFrame(() => title.classList.add('is-in')));
    setTimeout(() => { const s = $('.shine', title); if (s) s.classList.add('is-shining'); }, 900);
  }

  /* ---------- scroll reveals (once) ---------- */
  $$('[data-stagger]').forEach((g) => $$('[data-reveal]', g).forEach((el, i) => el.style.setProperty('--i', i)));
  const onReveal = (el) => {
    el.classList.add('is-in');
    $$('[data-roll]', el).forEach((r) => setRoll(r, +r.dataset.roll));
  };
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) { onReveal(e.target); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    $$('[data-reveal]').forEach((el) => io.observe(el));
  } else {
    $$('[data-reveal]').forEach(onReveal);
  }

  /* ---------- top bar, dock, active nav ---------- */
  const topbar = $('#topbar'), dock = $('#dock'), heroActions = $('.hero .actions');
  const onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // Mobile dock: show once past the hero buttons, hide while the booking form or the birthday planner is on screen
  if (dock && heroActions && 'IntersectionObserver' in window) {
    let pastHero = false;
    const covering = new Set();
    const paint = () => dock.classList.toggle('is-visible', pastHero && !covering.size);
    new IntersectionObserver(([e]) => { pastHero = !e.isIntersecting && e.boundingClientRect.top < 0; paint(); }).observe(heroActions);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) covering.add(e.target); else covering.delete(e.target); });
      paint();
    }, { rootMargin: '-20% 0px -20% 0px' });
    ['#book', '#birthday'].forEach((sel) => { const el = $(sel); if (el) io.observe(el); });
  }

  const nav = $('.nav'), navInd = $('.nav-ind');
  const moveNavInd = (link) => {
    if (!link) { navInd.style.opacity = 0; return; }
    navInd.style.opacity = 1;
    navInd.style.width = link.offsetWidth + 'px';
    navInd.style.transform = `translateX(${link.offsetLeft}px)`;
  };
  if (nav && 'IntersectionObserver' in window) {
    const links = $$('a[href^="#"]', nav);
    const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
    const seen = new Map();
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => seen.set(e.target.id, e.intersectionRatio));
      let best = null, ratio = 0;
      seen.forEach((r, id) => { if (r > ratio) { ratio = r; best = id; } });
      links.forEach((a) => a.classList.remove('is-active'));
      const link = best && map.get(best);
      if (link) link.classList.add('is-active');
      moveNavInd(link);
    }, { threshold: [0, .25, .5, .75, 1], rootMargin: '-64px 0px -40% 0px' });
    map.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- theme ---------- */
  const themeBtn = $('#theme-toggle'), metaTheme = $('meta[name="theme-color"]');
  const effectiveTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  const paintMeta = () => { metaTheme.content = effectiveTheme() === 'light' ? '#F4F3EE' : '#0B0B0A'; };
  paintMeta();
  themeBtn.addEventListener('click', () => {
    const next = effectiveTheme() === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintMeta();
  });

  /* ---------- hero glow follows the pointer ---------- */
  const hero = $('.hero'), glow = $('.hero-glow');
  if (hero && glow && !reduced && matchMedia('(pointer: fine)').matches) {
    let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
    const tick = () => {
      x += (tx - x) * .08; y += (ty - y) * .08;
      glow.style.transform = `translate(${x}px, ${y}px)`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > .5 ? requestAnimationFrame(tick) : 0;
    };
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect(); tx = e.clientX - r.left; ty = e.clientY - r.top;
      if (!hero.classList.contains('has-glow')) { x = tx; y = ty; hero.classList.add('has-glow'); }
      if (!raf) raf = requestAnimationFrame(tick);
    });
    hero.addEventListener('pointerleave', () => hero.classList.remove('has-glow'));
  }

  /* ---------- segmented controls with a sliding indicator ---------- */
  function placeInd(seg) {
    const on = $('button[aria-pressed="true"]', seg), ind = $('.seg-ind', seg);
    if (!on || !ind) return;
    ind.style.width = on.offsetWidth + 'px';
    ind.style.height = on.offsetHeight + 'px';
    ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
  }
  function select(seg, value) {
    $$('button', seg).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
    placeInd(seg);
  }

  /* ---------- booking request builder + availability board (bill goes to WhatsApp, slots held in Firestore) ---------- */
  const builder = $('.builder');
  if (builder) {
    const names = { ps5: 'PS5', xbox: 'Xbox', squad: 'Squad room' };
    const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const clock = (h) => `${h % 12 || 12}${h < 12 ? ' am' : ' pm'}`;
    // "8–9 pm", "11 am–12 pm": an hour range, with am/pm once when both ends share it
    const span = (a, b) => { const ap = (h) => (h < 12 || h === 24 ? 'am' : 'pm'); return ap(a) === ap(b) ? `${a % 12 || 12}–${b % 12 || 12} ${ap(b)}` : `${clock(a)}–${clock(b)}`; };
    const MAX_ONLINE_HOURS = 3;   // the longest session the form and firestore.rules accept
    // "Now" in Hyderabad, whatever the visitor's phone timezone is
    const nowIst = () => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); };
    const dayLabel = (d) => `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;

    // Fill the day, start-time and game choices
    const now = nowIst();
    const days = [];
    for (let i = 0; i < 8 && days.length < 7; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      // Skip today once the last 1-hour slot has started
      if (i === 0 && now.getHours() * 60 + now.getMinutes() > (CONFIG.close - 1) * 60 - 15) continue;
      days.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : dayLabel(d), date: d, today: i === 0 });
    }
    const segDate = $('.seg[data-key="date"]', builder), segStart = $('.seg[data-key="start"]', builder), segGame = $('.seg[data-key="game"]', builder);
    const dayButtons = days.map((d, i) => `<button type="button" data-value="${d.key}" aria-pressed="${i === 0}">${d.label}</button>`).join('');
    segDate.insertAdjacentHTML('afterbegin', dayButtons);
    const availDays = $('#avail-days'), grid = $('#avail-grid'), availNote = $('#avail-note');
    availDays.insertAdjacentHTML('afterbegin', dayButtons);
    const hoursOpen = []; for (let h = CONFIG.open; h < CONFIG.close; h++) hoursOpen.push(h);
    segStart.insertAdjacentHTML('afterbegin', hoursOpen.map((h) => `<button type="button" data-value="${h}" aria-pressed="false">${clock(h)}</button>`).join(''));
    $$('.games-list li').forEach((li) => $('.seg-ind', segGame).insertAdjacentHTML('beforebegin', `<button type="button" data-value="${li.textContent.trim()}" aria-pressed="false">${li.textContent.trim()}</button>`));

    const segs = Object.fromEntries($$('.seg', builder).map((s) => [s.dataset.key, s]));
    // live: null while loading a day's slots, true once loaded, false if the database can't be reached
    const state = { station: 'ps5', players: '1', time: '2', plan: 'hourly', food: 'none', date: days[0].key, start: null, game: 'any', taken: new Set(), live: null };
    // Opened from a pass card (/?pass=duo#book): pay with the pass
    const passKind = new URLSearchParams(location.search).get('pass');
    if (passKind === 'solo' || passKind === 'duo') {
      // From My pass: "Use my pass", or the member rate once the hours are used (?rate=member)
      const member = new URLSearchParams(location.search).get('rate') === 'member';
      Object.assign(state, { plan: member ? 'member' : 'use-pass', players: passKind === 'duo' ? '2' : '1' });
      select(segs.plan, state.plan); select(segs.players, state.players);
    }
    const nameInput = $('#book-name'), sendBtn = $('#send-booking');

    // Squad room splits players across both consoles: 2 = two solos, 3 = duo + solo, 4 = two duos
    const squadSplit = { 2: ['solo', 'solo'], 3: ['duo', 'solo'], 4: ['duo', 'duo'] };
    const splitLabel = { 2: '2 solos', 3: 'duo + solo', 4: '2 duos' };
    // Players on one console -> rate
    const KIND = { 1: 'solo', 2: 'duo', 3: 'trio', 4: 'quad' };
    const KIND_LABEL = { solo: 'Solo, 1 player', duo: 'Duo, 2 players on one console', trio: '3 players on one console', quad: '4 players on one console' };

    const render = () => {
      const squad = state.station === 'squad';
      // Squad room takes 2-4 players; a single console takes 1-4
      $$('button', segs.players).forEach((b) => { const n = +b.dataset.value; b.hidden = squad && n < 2; });
      if (squad && +state.players < 2) { state.players = '2'; select(segs.players, '2'); }
      const group = !squad && +state.players >= 3;
      $$('button', segs.time).forEach((b) => { b.disabled = squad && +b.dataset.value < CONFIG.squadMinHours; });
      if (squad && +state.time < CONFIG.squadMinHours) { state.time = String(CONFIG.squadMinHours); select(segs.time, state.time); }
      // Passes are for 1-2 players on one console, so the squad room and groups of 3-4 pay by the hour
      $$('button', segs.plan).forEach((b) => { b.disabled = (squad || group) && b.dataset.value !== 'hourly'; });
      if ((squad || group) && state.plan !== 'hourly') { state.plan = 'hourly'; select(segs.plan, 'hourly'); }

      const hours = +state.time, players = +state.players;
      const kind = squad ? 'solo' : KIND[players];
      const rate = squad ? squadSplit[players].reduce((sum, k) => sum + CONFIG.rates[k], 0) : CONFIG.rates[kind];
      const memberRate = state.plan === 'member' ? CONFIG.memberRates[kind] : 0;
      const gaming = state.plan === 'buy-pass' ? CONFIG.passes[kind] : state.plan === 'use-pass' ? 0 : (memberRate || rate) * hours;
      const foodPrice = CONFIG.food[state.food].price, perk = Math.round(foodPrice * CONFIG.foodPerk), total = gaming + foodPrice - perk;

      // Start times: inside opening hours for the whole session, and not already past today
      const day = days.find((d) => d.key === state.date), t = nowIst();
      const earliest = day.today ? Math.ceil((t.getHours() * 60 + t.getMinutes() + 15) / 60) : CONFIG.open;
      const latest = CONFIG.close - hours;
      // Taken: any hour of the session already held on a console this booking needs
      const consoles = squad ? ['ps5', 'xbox'] : [state.station];
      const isTaken = (h0) => consoles.some((c) => Array.from({ length: hours }, (_, i) => h0 + i).some((h) => state.taken.has(`${c}_${h}`)));
      let anyTaken = false;
      $$('button', segs.start).forEach((b) => {
        const h = +b.dataset.value, taken = isTaken(h);
        b.textContent = span(h, h + hours);
        b.disabled = h < earliest || h > latest || taken;
        b.classList.toggle('is-taken', taken);
        b.title = taken ? 'Taken' : '';
        if (taken) anyTaken = true;
      });
      const valid = $$('button:not(:disabled)', segs.start).map((b) => b.dataset.value);
      if (!valid.includes(state.start)) state.start = valid[0] || null;
      select(segs.start, state.start);
      $('#start-hint').textContent = !state.start ? 'No slots left that day for this length. Pick another day or a shorter session.'
        : anyTaken ? 'Crossed-out times are already booked.' : '';

      const passName = kind === 'duo' ? 'Duo pass' : 'Solo pass';
      $('#time-hint').textContent = squad ? `Squad room for ${players}: ${splitLabel[players]}, ${inr(rate)}/hr. Minimum ${CONFIG.squadMinHours} hours.`
        : kind === 'duo' ? `Duo: two players on one console, ${inr(CONFIG.rates.duo)}/hr.`
        : group ? `${players} players on one console, ${inr(rate)}/hr. Needs a game that supports ${players} players on one screen; ask us on WhatsApp what's on.` : '';
      $('#plan-hint').textContent = squad ? 'Passes are for one console. The squad room is paid by the hour.'
        : group ? 'Passes are for 1 or 2 players. Groups of 3 or 4 on one console pay by the hour.'
        : state.plan === 'buy-pass' ? `${passName} ${inr(CONFIG.passes[kind])}: ${CONFIG.passHours} hours within 30 days. This visit uses ${hours} of them.`
        : state.plan === 'use-pass' ? `We take ${hours} hour${hours > 1 ? 's' : ''} off your ${passName.toLowerCase()}. Food is still charged.`
        : state.plan === 'member' ? `Member rate for ${passName.toLowerCase()} holders who have used all 6 hours, until the pass's 30 days end: ${inr(memberRate)}/hr instead of ${inr(rate)}. We check your pass when we confirm.` : '';

      $('#sum-title').textContent = `${names[state.station]} · ${hours} hr${hours > 1 ? 's' : ''} · ${players} player${players > 1 ? 's' : ''}${kind === 'duo' ? ' (duo)' : ''}`;
      const s0 = +state.start;
      $('#sum-when').textContent = state.start ? `${day.today ? 'Today, ' : ''}${dayLabel(day.date)} · ${clock(s0)} – ${clock(s0 + hours)}` : 'Pick a start time';
      $('#sum-gaming-label').textContent = state.plan === 'buy-pass' ? `${passName} (${CONFIG.passHours} hrs)` : state.plan === 'use-pass' ? `Gaming (from your ${passName.toLowerCase()})` : state.plan === 'member' ? `Gaming (member rate ${inr(memberRate)}/hr)` : `Gaming (${inr(rate)}/hr)`;
      $('#sum-gaming').textContent = inr(gaming);
      $('#sum-food').textContent = inr(foodPrice);
      $('#sum-perk').textContent = '−' + inr(perk);
      setRoll($('#sum-total'), total);
      sendBtn.disabled = !state.start;
      Object.assign(state, { total, gaming, foodPrice, perk, hours, squad, day, rate, kind, passName, memberRate });
      renderBoard(day, earliest, consoles);
      $$('.seg', builder).forEach(placeInd); placeInd(availDays);
    };

    // Availability board: PS5 and Xbox by hour for the chosen day. Never shows "Open" unless the database answered.
    // Today, hours that have already started are left off.
    const renderBoard = (day, earliest, consoles) => {
      grid.hidden = $('.avail-legend').hidden = state.live === false;
      const rows = hoursOpen.filter((h) => h >= earliest);
      availNote.textContent = state.live === false ? "Live availability isn't loading right now. Pick a time below and we'll confirm on WhatsApp."
        : state.live === null ? 'Checking…' : !rows.length ? `No more hours ${day.today ? 'today' : 'that day'}. Pick another day.`
        : `${day.label}, live. Tap open hours next to each other to book them together (up to ${MAX_ONLINE_HOURS}).`;
      if (state.live === false) return;
      const s0 = state.start === null ? -1 : +state.start, picked = (c, h) => consoles.includes(c) && h >= s0 && h < s0 + state.hours;
      grid.innerHTML = `<span style="--r:1;--c:1"></span><span class="avail-con" style="--r:1;--c:2">PS5</span><span class="avail-con" style="--r:1;--c:3">Xbox</span>`
        + rows.map((h, i) => `<span class="avail-time" style="--r:${i + 2};--c:1">${span(h, h + 1)}</span>` + ['ps5', 'xbox'].map((c, j) => {
          const booked = state.taken.has(`${c}_${h}`), loading = state.live === null;
          const cls = loading ? 'is-loading' : booked ? 'is-booked' : picked(c, h) ? 'is-picked' : 'is-open';
          const label = loading ? '' : booked ? 'Booked' : cls === 'is-picked' ? 'Picked' : 'Open';
          return `<button type="button" class="avail-cell ${cls}" style="--r:${i + 2};--c:${j + 2}" data-console="${c}" data-hour="${h}" ${loading || booked ? 'disabled' : ''} aria-pressed="${cls === 'is-picked'}" aria-label="${names[c]} ${span(h, h + 1)}: ${label || 'loading'}">${label}</button>`;
        }).join('')).join('');
    };

    // Tap open hours to build a session: a tap next to the picked hours adds that hour (up to MAX_ONLINE_HOURS),
    // a tap on the first or last picked hour drops it, any other tap starts again from that hour.
    const free = (c, h) => !state.taken.has(`${c}_${h}`);
    const setSession = (station, start, hours) => {
      state.station = station; select(segs.station, station);
      state.time = String(hours); select(segs.time, state.time);
      state.start = String(start); render();
      return state.start === String(start) && state.time === String(hours);
    };
    const pickSlot = (c, h) => {
      const squad = state.station === 'squad', bothFree = free('ps5', h) && free('xbox', h);
      const onSelection = state.start !== null && (squad ? bothFree : state.station === c);
      const st = +state.start, len = +state.time, end = st + len - 1;
      let msg = '';
      if (onSelection && h === end + 1 && len < MAX_ONLINE_HOURS) setSession(state.station, st, len + 1);
      else if (onSelection && h === st - 1 && len < MAX_ONLINE_HOURS) setSession(state.station, h, len + 1);
      else if (onSelection && (h === end + 1 || h === st - 1)) msg = `Up to ${MAX_ONLINE_HOURS} hours can be booked online. For longer, ask us on WhatsApp.`;
      else if (onSelection && len > 1 && h === st && !(squad && len - 1 < CONFIG.squadMinHours)) setSession(state.station, st + 1, len - 1);
      else if (onSelection && len > 1 && h === end && !(squad && len - 1 < CONFIG.squadMinHours)) setSession(state.station, st, len - 1);
      else if (!(onSelection && h >= st && h <= end)) {
        // Start again from this hour: the squad room needs 2 hours on both consoles, otherwise book this console for 1 hour
        const ok = squad && bothFree && setSession('squad', h, CONFIG.squadMinHours);
        if (!ok) setSession(c, h, 1);
      }
      const s0 = +state.start, n = +state.time;
      availNote.textContent = msg || `${names[state.station]} ${span(s0, s0 + n)} picked (${n} hr${n > 1 ? 's' : ''}). ${n < MAX_ONLINE_HOURS ? 'Tap the next hour to add it, or finish' : 'Finish'} your request below.`;
    };
    grid.addEventListener('click', (e) => { const b = e.target.closest('button.avail-cell'); if (b && !b.disabled) pickSlot(b.dataset.console, +b.dataset.hour); });
    const setDate = (key) => { state.date = key; select(segs.date, key); select(availDays, key); refreshTaken(); };
    availDays.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setDate(b.dataset.value); });
    // "See when it's free" on the console cards
    $$('[data-pick]').forEach((a) => a.addEventListener('click', () => { state.station = a.dataset.pick; select(segs.station, state.station); render(); }));

    Object.entries(segs).forEach(([key, seg]) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        if (key === 'date') { setDate(b.dataset.value); return; }
        state[key] = b.dataset.value; select(seg, b.dataset.value); render();
      });
    });

    // Live availability from the booking database (loaded on demand; the form works without it)
    let dbFailed = false;
    const refreshTaken = (quiet) => {
      if (!window.MGDB) { if (dbFailed) state.live = false; render(); return; }
      const date = state.date;
      if (!quiet) Object.assign(state, { taken: new Set(), live: null });
      render();
      window.MGDB.takenFor(date).then((taken) => { if (state.date === date) { Object.assign(state, { taken, live: true }); render(); } })
        .catch(() => { if (state.date === date) { state.live = false; render(); } });
    };
    window.addEventListener('mgdb-ready', () => refreshTaken());
    import('/assets/js/booking-db.js').catch(() => { dbFailed = true; refreshTaken(); });   // offline or blocked: WhatsApp-only requests
    const refreshQuiet = () => { if (document.visibilityState === 'visible' && window.MGDB) refreshTaken(true); };
    setInterval(refreshQuiet, 60000);
    document.addEventListener('visibilitychange', refreshQuiet);

    const statusEl = $('#book-status');
    sendBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); nameInput.setAttribute('aria-invalid', 'true'); return; }
      nameInput.removeAttribute('aria-invalid');
      const st = state, s0 = +st.start, d = st.day.date, p = +st.players, hrs = `${st.hours} hr${st.hours > 1 ? 's' : ''}`;
      const id = `MG-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(s0)}00-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const who = st.squad ? `Squad room (whole room) · ${p} players, ${splitLabel[p]}` : `${names[st.station]} · ${KIND_LABEL[st.kind]}`;
      const gamingLine = st.plan === 'buy-pass' ? `${st.passName} (${CONFIG.passHours} hrs, valid 30 days) = ${inr(st.gaming)}\nThis visit uses ${st.hours} of ${CONFIG.passHours} hrs`
        : st.plan === 'use-pass' ? `Gaming: ${hrs} from my ${st.passName.toLowerCase()} = ₹0`
        : st.plan === 'member' ? `Gaming at member rate (my ${st.passName.toLowerCase()} hours are used up): ${inr(st.memberRate)}/hr × ${hrs} = ${inr(st.gaming)}`
        : `Gaming: ${inr(st.rate)}/hr × ${hrs} = ${inr(st.gaming)}`;
      const lines = [
        `Hi MR. GAMING! Booking request ${id}`,
        '',
        `Name: ${name}`,
        `When: ${dayLabel(d)}, ${clock(s0)} – ${clock(s0 + st.hours)}`,
        `Console: ${who}`,
        st.game !== 'any' ? `Game: ${st.game}` : null,
        '',
        '*Bill*',
        gamingLine,
        st.foodPrice ? `Food: ${CONFIG.food[st.food].name} = ${inr(st.foodPrice)}` : null,
        st.perk ? `Gamer perk (10% off food): −${inr(st.perk)}` : null,
        `*Total: ${inr(st.total)}*`,
        '',
        st.total ? 'Please confirm and send the UPI QR for the advance.' : 'Please confirm my slot.'
      ].filter((l) => l !== null);
      const url = waUrl(lines.join('\n'));

      if (!window.MGDB) { window.open(url, '_blank', 'noopener'); return; }
      // Open the tab now (browsers block pop-ups opened after a wait), then fill it once the slot is reserved
      const tab = window.open('', '_blank');
      sendBtn.disabled = true; statusEl.textContent = 'Reserving your slot…';
      const res = await window.MGDB.reserve({
        id, name, date: st.date, start: s0, hours: st.hours, station: st.station, players: p, plan: st.plan,
        game: st.game === 'any' ? '' : st.game, food: st.foodPrice ? CONFIG.food[st.food].name : '', total: st.total
      });
      sendBtn.disabled = false;
      if (res.reason === 'taken') {
        if (tab) tab.close();
        state.taken = res.taken; render();
        statusEl.textContent = 'Someone just booked that time. Pick another slot.';
        return;
      }
      statusEl.textContent = res.ok ? `Slot held for you (${id}). We'll confirm on WhatsApp.` : '';
      if (tab) tab.location.href = url; else window.location.href = url;
    });

    render();
    const placeAll = () => { $$('.seg', builder).forEach(placeInd); placeInd(availDays); };
    window.addEventListener('resize', placeAll);
    document.fonts && document.fonts.ready.then(placeAll);
  }
})();
