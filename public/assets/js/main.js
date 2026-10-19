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

  /* ---------- top bar, phone tab bar, active nav ---------- */
  const topbar = $('#topbar');
  const onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  // Phone tab bar: the tab for the section under the middle of the screen lights up
  const tabbar = $('#tabbar');
  if (tabbar && 'IntersectionObserver' in window) {
    const TAB_FOR = { top: 'top', stations: 'top', prices: 'top', book: 'book', birthday: 'birthday', food: 'food', fifa: 'food' };
    const tabs = $$('[data-tab]', tabbar);
    const light = (id) => tabs.forEach((t) => {
      const on = t.dataset.tab === TAB_FOR[id];
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    });
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) light(e.target.id); }), { rootMargin: '-50% 0px -50% 0px' });
    $$('main > section[id]').forEach((sec) => io.observe(sec));
  }

  /* ---------- open now? (Hyderabad time, from CONFIG.open/close) ---------- */
  const statuses = $$('#open-status, [data-open-status]');
  if (statuses.length) {
    const clock12 = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
    const paintOpen = () => {
      const d = new Date(), ist = new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000), h = ist.getHours();
      const open = h >= CONFIG.open && h < CONFIG.close;
      const text = open ? `Open now · till ${clock12(CONFIG.close)}` : h < CONFIG.open ? `Opens today at ${clock12(CONFIG.open)}` : `Closed now · opens ${clock12(CONFIG.open)} tomorrow`;
      statuses.forEach((el) => { el.classList.toggle('is-open', open); $('.open-text', el).textContent = text; });
    };
    paintOpen(); setInterval(paintOpen, 60000);
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

  /* ---------- booking, in three steps like a flight: 1 slot, 2 fare (the 6-hr pass is the upgrade), 3 confirm & hold ----------
     The bill goes to WhatsApp and the hours are held in Firestore. Everything that sounds urgent is real: slots left and
     "last console" from the database, "starts in" from the clock, the 3-hour hold from firestore.rules
     (an unconfirmed hold stops blocking its slot after 3 hours). */
  const builder = $('.builder');
  if (builder) {
    const names = { ps5: 'PS5', xbox: 'Xbox', squad: 'Whole room' };
    const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad = (n) => String(n).padStart(2, '0');
    const clock = (h) => `${h % 12 || 12}${h < 12 ? ' am' : ' pm'}`;
    const hm = (h) => `${h % 12 || 12}:00 ${h < 12 || h === 24 ? 'AM' : 'PM'}`;
    // "8–9 pm", "11 am–12 pm": an hour range, with am/pm once when both ends share it
    const span = (a, b) => { const ap = (h) => (h < 12 || h === 24 ? 'am' : 'pm'); return ap(a) === ap(b) ? `${a % 12 || 12}–${b % 12 || 12} ${ap(b)}` : `${clock(a)}–${clock(b)}`; };
    const MAX_ONLINE_HOURS = 3;   // the longest session the form and firestore.rules accept
    // "Now" in Hyderabad, whatever the visitor's phone timezone is
    const nowIst = () => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); };
    const dayLabel = (d) => `${DAY[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
    const hrs = (n) => `${n} hr${n === 1 ? '' : 's'}`;

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
    $$('[data-pick-game]').forEach((a) => $('.seg-ind', segs.game).insertAdjacentHTML('beforebegin', `<button type="button" data-value="${a.dataset.pickGame}" aria-pressed="false">${a.dataset.pickGame}</button>`));   // bookable games come from the game cards (not GTA VI, a pre-order)

    // con: the console filter (any / ps5 / xbox / room); station: what's booked (ps5 / xbox / squad = whole room)
    // live: null while loading, true once the database answered, false if it can't be reached
    const state = { step: 1, con: 'any', station: 'ps5', players: '1', time: '1', plan: 'hourly', food: 'none', date: days[0].key, start: null, game: 'any', week: new Map(), live: null, held: null };
    const takenOn = (key) => state.week.get(key) || new Set();
    // Opened from a pass card (/?pass=duo#book): pay with the pass
    const params = new URLSearchParams(location.search), passKind = params.get('pass');
    if (passKind === 'solo' || passKind === 'duo') {
      Object.assign(state, { plan: params.get('rate') === 'member' ? 'member' : 'use-pass', players: passKind === 'duo' ? '2' : '1' });
      select(segs.plan, state.plan); select(segs.players, state.players); $('#sum-pass').open = true;
    }
    const nameInput = $('#book-name');
    try { nameInput.value = localStorage.getItem('mg-name') || ''; } catch (e) {}

    // Whole room splits players across both consoles: 2 = two solos, 3 = duo + solo, 4 = two duos
    const squadSplit = { 2: ['solo', 'solo'], 3: ['duo', 'solo'], 4: ['duo', 'duo'] };
    const splitLabel = { 2: '2 solos', 3: 'duo + solo', 4: '2 duos' };
    const KIND = { 1: 'solo', 2: 'duo', 3: 'trio', 4: 'quad' };
    const KIND_LABEL = { solo: 'Solo, 1 player', duo: 'Duo, 2 players on one console', trio: '3 players on one console', quad: '4 players on one console' };
    const consolesOf = (station) => (station === 'squad' ? ['ps5', 'xbox'] : [station]);
    // Can this session be booked? Inside opening hours, not started, and every hour free on every console it needs
    const fits = (key, station, h0, n) => {
      const day = days.find((d) => d.key === key), taken = takenOn(key);
      if (!day || h0 < earliestOf(day) || h0 + n > CONFIG.close || n > MAX_ONLINE_HOURS) return false;
      if (state.live === false) return true;   // no database: anything inside opening hours can be requested
      return consolesOf(station).every((c) => Array.from({ length: n }, (_, i) => h0 + i).every((h) => !taken.has(`${c}_${h}`)));
    };
    const openOn = (day, c) => hoursOpen.filter((h) => h >= earliestOf(day) && !takenOn(day.key).has(`${c}_${h}`)).length;
    const anyFree = (day) => hoursOpen.filter((h) => fits(day.key, 'ps5', h, 1) || fits(day.key, 'xbox', h, 1)).length;
    const startsIn = (day, h) => { if (!day.today) return ''; const t = nowIst(), m = h * 60 - (t.getHours() * 60 + t.getMinutes()); return m > 0 && m <= 180 ? `Starts in ${m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : m + ' min'}` : ''; };
    // What a fare costs for the current pick: plan = hourly / buy-pass / use-pass / member
    const price = (plan) => {
      const players = +state.players, squad = state.station === 'squad', n = +state.time;
      const kind = squad ? 'solo' : KIND[players];
      const rate = squad ? squadSplit[players].reduce((sum, k) => sum + CONFIG.rates[k], 0) : CONFIG.rates[kind];
      const memberRate = plan === 'member' ? CONFIG.memberRates[kind] : 0;
      const gaming = plan === 'buy-pass' ? CONFIG.passes[kind] : plan === 'use-pass' ? 0 : (memberRate || rate) * n;
      const foodPrice = CONFIG.food[state.food].price, perk = Math.round(foodPrice * CONFIG.foodPerk);
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

    const render = () => {
      const players = +state.players;
      // The whole room is for 2-4 players and needs its minimum hours; groups of 3-4 and the whole room pay by the hour
      $('[data-key="con"] [data-value="room"]', builder).hidden = players < 2;
      if (players < 2 && state.con === 'room') { state.con = 'any'; select(segs.con, 'any'); }
      if (state.con === 'room' && +state.time < CONFIG.squadMinHours) { state.time = String(CONFIG.squadMinHours); select(segs.time, state.time); }
      $$('button', segs.time).forEach((b) => { b.disabled = state.con === 'room' && +b.dataset.value < CONFIG.squadMinHours; });
      if (state.start !== null && !fits(state.date, state.station, +state.start, +state.time)) { state.start = null; if (state.step > 1) goStep(1); }
      if (!passOk() && state.plan !== 'hourly') state.plan = 'hourly';
      $$('button', segs.plan).forEach((b) => { b.disabled = !passOk(); b.setAttribute('aria-pressed', String(b.dataset.value === state.plan)); });
      const day = days.find((d) => d.key === state.date), n = +state.time, P = price(state.plan), picked = state.start !== null, s0 = +state.start;
      Object.assign(state, { day, hours: n, squad: state.station === 'squad' }, P);

      renderSearch(day); renderTrip(day, P); renderFares(P); renderTicket(day, P); renderHero();
      $('#game-pick').textContent = state.game === 'any' ? 'Optional' : state.game;

      // Fare summary (laptop) and the bottom bar (phones)
      $('#sum-when').textContent = picked ? `${names[state.station]} · ${dayWord(day)}, ${span(s0, s0 + n)}` : 'Pick a slot';
      $('#sum-gaming-label').textContent = state.plan === 'buy-pass' ? `6-hr ${P.passName.toLowerCase()}` : state.plan === 'use-pass' ? `Gaming (from your ${P.passName.toLowerCase()})` : state.plan === 'member' ? `Gaming (member rate ${inr(P.memberRate)}/hr × ${n})` : `Gaming (${inr(P.rate)}/hr × ${n})`;
      $('#sum-gaming').textContent = inr(picked ? P.gaming : 0);
      $('#sum-food-row').hidden = $('#sum-perk-row').hidden = !P.foodPrice;
      $('#sum-food').textContent = inr(P.foodPrice); $('#sum-perk').textContent = '−' + inr(P.perk);
      setRoll($('#sum-total'), picked ? P.total : 0);
      const cta = state.step === 3 ? (state.held ? 'Open WhatsApp' : 'Hold my slot') : 'Continue';
      $('#side-go').textContent = cta; $('#bar-go').textContent = cta;
      $('#side-go').disabled = !picked;
      $('#bar-price').textContent = picked ? inr(P.total) : '';
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
      if (state.live === false) availNote.textContent = "Live slots aren't loading right now. Pick a time and we'll confirm it on WhatsApp.";
      const band = (h) => (h < 17 ? 'Afternoon · 11 am – 5 pm' : h < 21 ? 'Evening · 5 – 9 pm' : 'Night · 9 – 11 pm');
      let last = '', html = '';
      if (state.live === null) html = '<div class="slot-card is-loading"></div>'.repeat(3);
      else open.forEach(({ h, free }) => {
        if (band(h) !== last) { last = band(h); html += `<p class="results-band">${last}</p>`; }
        const n = +state.time, P = price('hourly'), tags = [];
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
      $('#results').innerHTML = html || (state.live === true ? '' : '');
    };

    // Step 2: the chosen slot (with a console switch) and the fares
    const renderTrip = (day, P) => {
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
      const card = (plan, title, amount, lines, badge = '') => `<button type="button" class="fare ${plan === 'buy-pass' ? 'fare-pass' : ''}" role="radio" aria-checked="${state.plan === plan}" data-plan="${plan}">
        <span class="fare-head"><b>${title}</b>${badge}</span><span class="fare-price">${amount}</span>
        <span class="fare-lines">${lines.map((l) => `<span>${l}</span>`).join('')}</span></button>`;
      let html = card('hourly', 'Pay per hour', inr(hourly.gaming), [`${inr(hourly.rate)}/hr × ${hrs(n)}`, passOk() && state.plan === 'hourly' ? `<em>Play 6 hrs this month? The pass saves you ${inr(save)}.</em>` : 'Pay for today only']);
      if (passOk()) {
        html += card('buy-pass', `6-hr ${P.passName}`, inr(pass.gaming), [`${inr(perHr)}/hr · save ${inr(save)} vs hourly`, `Today uses ${hrs(n)} · ${hrs(CONFIG.passHours - n)} left for 30 days`, `Then ${inr(CONFIG.memberRates[P.kind])}/hr member rate till day 30`], '<span class="tag">Best value</span>');
        if (state.plan === 'use-pass' || state.plan === 'member') {
          const mine = price(state.plan);
          html += card(state.plan, state.plan === 'use-pass' ? `My ${P.passName.toLowerCase()}` : 'Member rate', inr(mine.gaming), [state.plan === 'use-pass' ? `${hrs(n)} off your pass` : `${inr(mine.memberRate)}/hr × ${hrs(n)} · pass hours used up`, 'We check your pass when we confirm']);
        }
      } else html += `<p class="fare-note">The 6-hr pass is for 1–2 players on one console. ${state.station === 'squad' ? 'The whole room' : 'Groups of 3–4'} pay by the hour.</p>`;
      $('#fares').innerHTML = html;
      $('#plan-hint').textContent = !passOk() ? 'Passes are for 1 or 2 players on one console.'
        : state.plan === 'use-pass' ? `We take ${hrs(n)} off your ${P.passName.toLowerCase()}. Food is still charged.`
        : state.plan === 'member' ? `For ${P.passName.toLowerCase()} holders who have used all 6 hours, until the pass's 30 days end: ${inr(price('member').memberRate)}/hr instead of ${inr(P.rate)}.` : '';
    };
    // Step 3: a boarding-pass style ticket
    const renderTicket = (day, P) => {
      if (state.start === null) { $('#ticket').innerHTML = ''; return; }
      const s0 = +state.start, n = +state.time;
      const fare = state.plan === 'buy-pass' ? `6-hr ${P.passName.toLowerCase()} · uses ${n} of ${CONFIG.passHours} hrs` : state.plan === 'use-pass' ? `My ${P.passName.toLowerCase()}` : state.plan === 'member' ? `Member rate ${inr(P.memberRate)}/hr` : `Hourly ${inr(P.rate)}/hr`;
      $('#ticket').innerHTML = `<div class="ticket-top"><span class="ticket-brand">MR. GAMING</span><span class="ticket-id">${state.held ? 'HELD · ' + state.held : 'BOOKING REQUEST'}</span></div>
        <div class="ticket-route"><div><small>Start</small><b>${hm(s0)}</b></div><span class="slot-line" aria-hidden="true"></span><div><small>End</small><b>${hm(s0 + n)}</b></div></div>
        <dl class="ticket-grid"><div><dt>Date</dt><dd>${dayLabel(day.date)}</dd></div><div><dt>Console</dt><dd>${names[state.station]}</dd></div>
        <div><dt>Players</dt><dd>${state.players}</dd></div><div><dt>Time</dt><dd>${hrs(n)}</dd></div></dl>
        <div class="ticket-cut" aria-hidden="true"></div>
        <dl class="ticket-bill"><div><dt>${fare}</dt><dd>${inr(P.gaming)}</dd></div>${P.foodPrice ? `<div><dt>${CONFIG.food[state.food].name}</dt><dd>${inr(P.foodPrice)}</dd></div><div><dt>Gamer perk −10%</dt><dd>−${inr(P.perk)}</dd></div>` : ''}
        <div class="ticket-total"><dt>Total</dt><dd>${inr(P.total)}</dd></div></dl>`;
    };
    // Hero: real hours left today (or tomorrow once today is over), any console
    const renderHero = () => {
      const el = $('#hero-live'); if (!el) return;
      el.hidden = state.live !== true; if (state.live !== true) return;
      const d0 = days[0], left = anyFree(d0), d1 = days[1], when = d0.today ? 'today' : 'tomorrow';
      $('#hero-live-text').textContent = left ? `${left <= 3 ? 'Only ' : ''}${left} hour${left > 1 ? 's' : ''} left ${when} · see live slots`
        : d1 ? `${d0.today ? 'Today' : 'Tomorrow'} is fully booked · ${anyFree(d1)} hours open ${d1.label === 'Tomorrow' ? 'tomorrow' : d1.label}` : '';
      el.classList.toggle('is-few', left > 0 && left <= 3);
    };

    // Steps: one panel at a time; on phones the bottom bar carries the price and the next step, and the phone's
    // back button goes back a step
    const phone = matchMedia('(max-width: 959px)'), bar = $('#book-bar');
    let bookInView = false;
    function goStep(k, push = true) {
      if (k > 1 && state.start === null) k = 1;
      const was = state.step; state.step = k;
      $$('.step-panel', builder).forEach((p) => { p.hidden = +p.dataset.step !== k; });
      if (push && k !== was && history.pushState) history.pushState({ mgStep: k }, '', '#book');
      if (k !== was) {
        // Scroll to the top of the step: below the sticky header and the sticky step bar on phones, with the step bar in view on laptops
        const top = (phone.matches ? $('#availability').getBoundingClientRect().top - $('#steps-bar').offsetHeight : $('#steps-bar').getBoundingClientRect().top) + scrollY - $('#topbar').offsetHeight - 12;
        if (Math.abs(top - scrollY) > 4) scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' });
      }
      if (k === 3 && !nameInput.value) setTimeout(() => nameInput.focus({ preventScroll: true }), 400);
      render();
    }
    window.addEventListener('popstate', (e) => { if (e.state && e.state.mgStep) goStep(e.state.mgStep, false); else if (state.step > 1) goStep(1, false); });
    function paintBar() {
      const show = phone.matches && state.start !== null && (state.step > 1 || bookInView);
      bar.hidden = !show; root.classList.toggle('in-checkout', show && state.step > 1);
    }
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { bookInView = e.isIntersecting; paintBar(); }, { rootMargin: '0px 0px -20% 0px' }).observe($('#book'));
    phone.addEventListener('change', paintBar);

    // Choices
    $('#results').addEventListener('click', (e) => {
      const b = e.target.closest('.slot-card[data-hour]'); if (!b) return;
      Object.assign(state, { start: b.dataset.hour, station: b.dataset.console, held: null });
      $('#book-status').textContent = '';
      goStep(2);
    });
    $('#trip').addEventListener('click', (e) => {
      const c = e.target.closest('[data-con]'); if (c && !c.disabled) { state.station = c.dataset.con; render(); }
      if (e.target.closest('[data-go]')) goStep(1);
    });
    $('#fares').addEventListener('click', (e) => { const f = e.target.closest('.fare'); if (f) { state.plan = f.dataset.plan; render(); } });
    $('#steps-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b && !b.disabled) goStep(+b.dataset.go); });
    availDays.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (state.date !== b.dataset.value) state.start = null; state.date = b.dataset.value; select(availDays, state.date); render(); });
    Object.entries(segs).forEach(([key, seg]) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        state[key] = b.dataset.value; select(seg, b.dataset.value);
        if (key === 'plan' && state.plan === b.dataset.value) $$('button', seg).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        if (key === 'con') state.station = b.dataset.value === 'room' ? 'squad' : state.station === 'squad' ? 'ps5' : state.station;
        if (key === 'con' || key === 'time' || key === 'players') state.start = state.step === 1 ? null : state.start;
        render();
      });
    });
    // "See when it's free" on the console cards, and the game cards
    $$('[data-pick]').forEach((a) => a.addEventListener('click', () => { state.con = a.dataset.pick; select(segs.con, state.con); goStep(1); }));
    $$('[data-pick-game]').forEach((a) => a.addEventListener('click', () => { state.game = a.dataset.pickGame; select(segs.game, state.game); $('#sum-game').open = true; render(); }));

    // Live availability for the whole week in one read (loaded on demand; the form works without it)
    let dbFailed = false;
    const refreshTaken = (quiet) => {
      if (!window.MGDB) { if (dbFailed) state.live = false; render(); return; }
      if (!quiet) state.live = null;
      render();
      const read = window.MGDB.takenRange ? window.MGDB.takenRange(days[0].key, days[days.length - 1].key)
        : window.MGDB.takenFor(state.date).then((t) => new Map([[state.date, t]]));
      read.then((week) => { Object.assign(state, { week, live: true }); render(); })
        .catch(() => { state.live = false; render(); });
    };
    window.addEventListener('mgdb-ready', () => refreshTaken());
    import('/assets/js/booking-db.js').catch(() => { dbFailed = true; refreshTaken(); });   // offline or blocked: WhatsApp-only requests
    const refreshQuiet = () => { if (document.visibilityState === 'visible' && window.MGDB && !state.held) refreshTaken(true); };
    setInterval(refreshQuiet, 60000);
    document.addEventListener('visibilitychange', refreshQuiet);

    // The main button: Continue (steps 1-2), Hold my slot (step 3)
    const statusEl = $('#book-status');
    let waLink = '';
    const primary = async () => {
      if (state.start === null) return;
      if (state.step < 3) return goStep(state.step + 1);
      if (state.held) { window.open(waLink, '_blank', 'noopener'); return; }
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); nameInput.setAttribute('aria-invalid', 'true'); statusEl.textContent = 'Add your name to hold the slot.'; return; }
      nameInput.removeAttribute('aria-invalid');
      try { localStorage.setItem('mg-name', name); } catch (e) {}
      const st = state, s0 = +st.start, d = st.day.date, p = +st.players, hh = hrs(st.hours);
      const id = `MG-${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(s0)}00-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const who = st.squad ? `Squad room (whole room) · ${p} players, ${splitLabel[p]}` : `${names[st.station]} · ${KIND_LABEL[st.kind]}`;
      const gamingLine = st.plan === 'buy-pass' ? `${st.passName} (${CONFIG.passHours} hrs, valid 30 days) = ${inr(st.gaming)}\nThis visit uses ${st.hours} of ${CONFIG.passHours} hrs`
        : st.plan === 'use-pass' ? `Gaming: ${hh} from my ${st.passName.toLowerCase()} = ₹0`
        : st.plan === 'member' ? `Gaming at member rate (my ${st.passName.toLowerCase()} hours are used up): ${inr(st.memberRate)}/hr × ${hh} = ${inr(st.gaming)}`
        : `Gaming: ${inr(st.rate)}/hr × ${hh} = ${inr(st.gaming)}`;
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
      $('#bar-go').disabled = $('#side-go').disabled = true; statusEl.textContent = 'Holding your slot…';
      const res = await window.MGDB.reserve({
        id, name, date: st.date, start: s0, hours: st.hours, station: st.station, players: p, plan: st.plan,
        game: st.game === 'any' ? '' : st.game, food: st.foodPrice ? CONFIG.food[st.food].name : '', total: st.total
      });
      $('#bar-go').disabled = $('#side-go').disabled = false;
      if (res.reason === 'taken') {
        if (tab) tab.close();
        state.week.set(st.date, res.taken); state.start = null; goStep(1);
        availNote.textContent = 'Someone just booked that time. Pick another slot.';
        return;
      }
      if (res.ok) { state.held = id; waLink = url; statusEl.textContent = `Held for you for 3 hours (${id}). Confirm on WhatsApp to lock it in.`; render(); }
      if (tab) tab.location.href = url; else window.location.href = url;
    };
    $('#bar-go').addEventListener('click', primary);
    $('#side-go').addEventListener('click', primary);

    render();
    const placeAll = () => $$('.seg', builder).forEach(placeInd);
    window.addEventListener('resize', placeAll);
    document.fonts && document.fonts.ready.then(placeAll);
    $$('.sum-extras').forEach((d) => d.addEventListener('toggle', placeAll));
  }
})();
