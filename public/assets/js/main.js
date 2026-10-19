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

  /* ---------- booking funnel: tap a live slot, add a name, hold it (bill goes to WhatsApp, slots held in Firestore) ----------
     Everything that sounds urgent comes from real data: hours left and "next free" from the database, "starts in" from
     the clock, and the 3-hour hold from firestore.rules (an unconfirmed hold stops blocking its slot after 3 hours). */
  const builder = $('.builder');
  if (builder) {
    const names = { ps5: 'PS5', xbox: 'Xbox', squad: 'Whole room' };
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

    const availDays = $('#avail-days'), grid = $('#avail-grid'), availNote = $('#avail-note'), liveStrip = $('#live-strip');
    availDays.insertAdjacentHTML('afterbegin', days.map((d, i) => `<button type="button" data-value="${d.key}" aria-pressed="${i === 0}"><b>${d.label}</b><small></small></button>`).join(''));
    const segs = Object.fromEntries($$('.seg[data-key]', builder).map((s) => [s.dataset.key, s]));
    $$('[data-pick-game]').forEach((a) => $('.seg-ind', segs.game).insertAdjacentHTML('beforebegin', `<button type="button" data-value="${a.dataset.pickGame}" aria-pressed="false">${a.dataset.pickGame}</button>`));   // bookable games come from the game cards (not GTA VI, a pre-order)

    // live: null while loading, true once the database answered, false if it can't be reached
    const state = { station: 'ps5', players: '1', time: '1', plan: 'hourly', food: 'none', date: days[0].key, start: null, game: 'any', week: new Map(), live: null };
    const takenOn = (key) => state.week.get(key) || new Set();
    // Opened from a pass card (/?pass=duo#book): pay with the pass
    const params = new URLSearchParams(location.search), passKind = params.get('pass');
    if (passKind === 'solo' || passKind === 'duo') {
      Object.assign(state, { plan: params.get('rate') === 'member' ? 'member' : 'use-pass', players: passKind === 'duo' ? '2' : '1' });
      select(segs.plan, state.plan); select(segs.players, state.players); $('#sum-pass').open = true;
    }
    const nameInput = $('#book-name'), sendBtn = $('#send-booking');
    try { nameInput.value = localStorage.getItem('mg-name') || ''; } catch (e) {}

    // Whole room splits players across both consoles: 2 = two solos, 3 = duo + solo, 4 = two duos
    const squadSplit = { 2: ['solo', 'solo'], 3: ['duo', 'solo'], 4: ['duo', 'duo'] };
    const splitLabel = { 2: '2 solos', 3: 'duo + solo', 4: '2 duos' };
    const KIND = { 1: 'solo', 2: 'duo', 3: 'trio', 4: 'quad' };
    const KIND_LABEL = { solo: 'Solo, 1 player', duo: 'Duo, 2 players on one console', trio: '3 players on one console', quad: '4 players on one console' };
    const minHours = () => (state.station === 'squad' ? CONFIG.squadMinHours : 1);
    const consolesOf = (station) => (station === 'squad' ? ['ps5', 'xbox'] : [station]);
    // Can this session be booked? Inside opening hours, not started, and every hour free on every console it needs
    const fits = (key, station, h0, n) => {
      const day = days.find((d) => d.key === key), taken = takenOn(key);
      if (!day || h0 < earliestOf(day) || h0 + n > CONFIG.close || n > MAX_ONLINE_HOURS) return false;
      return consolesOf(station).every((c) => Array.from({ length: n }, (_, i) => h0 + i).every((h) => !taken.has(`${c}_${h}`)));
    };
    // Hours still open on a console that day, and hours with room for this group (either console, or both for the whole room)
    const openOn = (day, c) => hoursOpen.filter((h) => h >= earliestOf(day) && !takenOn(day.key).has(`${c}_${h}`)).length;
    const roomyHours = (day) => hoursOpen.filter((h) => h >= earliestOf(day) && (state.station === 'squad' ? fits(day.key, 'squad', h, 1) : fits(day.key, 'ps5', h, 1) || fits(day.key, 'xbox', h, 1))).length;
    const startsIn = (day, h) => { if (!day.today) return ''; const t = nowIst(), m = h * 60 - (t.getHours() * 60 + t.getMinutes()); return m > 0 && m <= 180 ? `Starts in ${m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60 ? (m % 60) + ' min' : ''}`.trim() : m + ' min'}` : ''; };

    const render = () => {
      const players = +state.players, squad = state.station === 'squad';
      // The whole room is for 2-4 players; groups of 3-4 on one console and the whole room pay by the hour
      if (squad && players < 2) state.station = 'ps5';
      const group = state.station !== 'squad' && players >= 3;
      $('#room-toggle').hidden = players < 2;
      $('#room-check').checked = state.station === 'squad';
      $('#room-price').textContent = players >= 2 ? `${inr(squadSplit[players].reduce((sum, k) => sum + CONFIG.rates[k], 0))}/hr` : '';
      $$('button', segs.plan).forEach((b) => { b.disabled = (state.station === 'squad' || group) && b.dataset.value !== 'hourly'; });
      if ((state.station === 'squad' || group) && state.plan !== 'hourly') { state.plan = 'hourly'; select(segs.plan, 'hourly'); }
      if (+state.time < minHours()) state.time = String(minHours());

      const day = days.find((d) => d.key === state.date), hours = +state.time;
      // Keep the pick only while it can still be booked (the database may have changed, or the group size)
      if (state.start !== null && !(state.live === false ? +state.start >= earliestOf(day) && +state.start + hours <= CONFIG.close : fits(state.date, state.station, +state.start, hours))) state.start = null;

      const kind = state.station === 'squad' ? 'solo' : KIND[players];
      const rate = state.station === 'squad' ? squadSplit[players].reduce((sum, k) => sum + CONFIG.rates[k], 0) : CONFIG.rates[kind];
      const memberRate = state.plan === 'member' ? CONFIG.memberRates[kind] : 0;
      const gaming = state.plan === 'buy-pass' ? CONFIG.passes[kind] : state.plan === 'use-pass' ? 0 : (memberRate || rate) * hours;
      const foodPrice = CONFIG.food[state.food].price, perk = Math.round(foodPrice * CONFIG.foodPerk), total = gaming + foodPrice - perk;
      const passName = kind === 'duo' ? 'Duo pass' : 'Solo pass';
      const s0 = state.start === null ? null : +state.start, picked = s0 !== null;

      // Checkout panel
      const who = state.station === 'squad' ? `Whole room · ${players} players` : `${names[state.station]} · ${players === 1 ? 'Solo' : players === 2 ? 'Duo' : players + ' players'}`;
      $('#sum-title').textContent = picked ? who : 'Pick a slot';
      $('#sum-when').textContent = picked ? `${day.today ? 'Today, ' : day.label === 'Tomorrow' ? 'Tomorrow, ' : ''}${dayLabel(day.date)} · ${span(s0, s0 + hours)}` : 'Tap an open hour on the board';
      const soon = picked ? startsIn(day, s0) : '';
      $('#sum-soon').hidden = !soon; $('#sum-soon').textContent = soon;
      $('#sum-hours').hidden = !picked;
      $('#hrs-out').textContent = hours;
      $('#hrs-minus').disabled = !picked || hours <= minHours();
      $('#hrs-plus').disabled = !picked || hours >= MAX_ONLINE_HOURS || !(state.live === false ? s0 + hours < CONFIG.close : fits(state.date, state.station, s0, hours + 1));
      $('#sel-hint').textContent = state.station === 'squad' ? `${splitLabel[players]}, ${inr(rate)}/hr` : group ? `${inr(rate)}/hr · needs a game with ${players}-player couch play` : kind === 'duo' ? `${inr(CONFIG.rates.duo / 2)} each` : `up to ${MAX_ONLINE_HOURS} online`;
      $('#plan-hint').textContent = state.station === 'squad' ? 'Passes are for one console. The whole room is paid by the hour.'
        : group ? 'Passes are for 1 or 2 players. Groups of 3 or 4 on one console pay by the hour.'
        : state.plan === 'buy-pass' ? `${passName} ${inr(CONFIG.passes[kind])}: ${CONFIG.passHours} hours within 30 days. This visit uses ${hours} of them.`
        : state.plan === 'use-pass' ? `We take ${hours} hour${hours > 1 ? 's' : ''} off your ${passName.toLowerCase()}. Food is still charged.`
        : state.plan === 'member' ? `Member rate for ${passName.toLowerCase()} holders who have used all 6 hours, until the pass's 30 days end: ${inr(memberRate)}/hr instead of ${inr(rate)}. We check your pass when we confirm.` : '';
      $('#sum-gaming-label').textContent = state.plan === 'buy-pass' ? `${passName} (${CONFIG.passHours} hrs)` : state.plan === 'use-pass' ? `Gaming (from your ${passName.toLowerCase()})` : state.plan === 'member' ? `Gaming (member rate ${inr(memberRate)}/hr)` : `Gaming (${inr(rate)}/hr × ${hours})`;
      $('#sum-gaming').textContent = inr(picked ? gaming : 0);
      $('#sum-food-row').hidden = $('#sum-perk-row').hidden = !foodPrice;
      $('#sum-food').textContent = inr(foodPrice);
      $('#sum-perk').textContent = '−' + inr(perk);
      setRoll($('#sum-total'), picked ? total : 0);
      sendBtn.disabled = !picked;

      // Phone bar
      $('#bar-what').textContent = picked ? `${names[state.station]} · ${day.label === 'Today' || day.label === 'Tomorrow' ? day.label : dayLabel(day.date)} ${span(s0, s0 + hours)}` : '';
      $('#bar-when').textContent = picked ? (soon || `${hours} hr${hours > 1 ? 's' : ''} · ${players === 1 ? 'solo' : players + ' players'}`) : '';
      $('#bar-price').textContent = inr(total);
      Object.assign(state, { total, gaming, foodPrice, perk, hours, squad: state.station === 'squad', day, rate, kind, passName, memberRate });
      renderLive(day); renderDays(); renderQuick(); renderBoard(day); renderHero();
      paintBar();
      $$('.seg', builder).forEach(placeInd);
    };

    // Live strip: real hours left for the chosen day, and the next free slot today
    const renderLive = (day) => {
      liveStrip.classList.toggle('is-live', state.live === true);
      if (state.live === false) { availNote.textContent = "Live slots aren't loading right now. Tap a time and we'll confirm it on WhatsApp."; return; }
      if (state.live === null) { availNote.textContent = 'Checking live slots…'; return; }
      const ps = openOn(day, 'ps5'), xb = openOn(day, 'xbox'), when = day.today ? 'Today' : day.label;
      if (!ps && !xb) { availNote.textContent = `${when} is fully booked. Pick another day.`; return; }
      const few = (n) => (n <= 3 ? `only ${n}` : n);
      let text = `${when}: ${few(ps)} hr${ps === 1 ? '' : 's'} left on PS5 · ${few(xb)} on Xbox`;
      if (day.today) {
        const next = hoursOpen.find((h) => h >= earliestOf(day) && (fits(day.key, 'ps5', h, 1) || fits(day.key, 'xbox', h, 1)));
        const soon = next !== undefined && startsIn(day, next);
        if (soon) text += ` · next free ${clock(next)}, ${soon.toLowerCase()}`;
      }
      availNote.textContent = text;
    };
    // Hero: real hours left today (or tomorrow once today is over), any console
    const anyFree = (day) => hoursOpen.filter((h) => h >= earliestOf(day) && (fits(day.key, 'ps5', h, 1) || fits(day.key, 'xbox', h, 1))).length;
    const renderHero = () => {
      const el = $('#hero-live'); if (!el) return;
      el.hidden = state.live !== true; if (state.live !== true) return;
      const d0 = days[0], left = anyFree(d0), d1 = days[1], when = d0.today ? 'today' : 'tomorrow';
      $('#hero-live-text').textContent = left ? `${left <= 3 ? 'Only ' : ''}${left} hour${left > 1 ? 's' : ''} left ${when} · see live slots`
        : d1 ? `${d0.today ? 'Today' : 'Tomorrow'} is fully booked · ${anyFree(d1)} hours open ${d1.label === 'Tomorrow' ? 'tomorrow' : d1.label}` : '';
      el.classList.toggle('is-few', left > 0 && left <= 3);
    };
    // Day chips: "Full" or "N hrs left" when that's true (from the database), nothing while loading
    const renderDays = () => {
      $$('button', availDays).forEach((b) => {
        const day = days.find((d) => d.key === b.dataset.value), left = state.live === true ? roomyHours(day) : null;
        const small = $('small', b);
        small.textContent = left === null ? '' : left === 0 ? 'Full' : left <= 4 ? `${left} hr${left > 1 ? 's' : ''} left` : '';
        b.classList.toggle('is-full', left === 0); b.classList.toggle('is-few', left > 0 && left <= 4);
      });
    };
    // "Next free": the first three bookable starts from now, across the week (one tap picks it and opens checkout)
    const renderQuick = () => {
      const box = $('#quick-slots'), row = $('#quick-row'), out = [];
      if (state.live === true) {
        const n = minHours(), order = state.station === 'xbox' ? ['xbox', 'ps5'] : ['ps5', 'xbox'];
        for (const day of days) {
          for (const h of hoursOpen) {
            const c = state.station === 'squad' ? (fits(day.key, 'squad', h, n) ? 'squad' : null) : order.find((x) => fits(day.key, x, h, n));
            if (c) out.push({ day, h, c, n });
            if (out.length === 3) break;
          }
          if (out.length === 3) break;
        }
      }
      box.hidden = !out.length;
      row.innerHTML = out.map((q) => `<button type="button" class="quick-slot press" data-date="${q.day.key}" data-hour="${q.h}" data-console="${q.c}" data-hours="${q.n}"><b>${q.day.today ? 'Today' : q.day.label === 'Tomorrow' ? 'Tomorrow' : dayLabel(q.day.date)} ${span(q.h, q.h + q.n)}</b><small>${names[q.c]}${startsIn(q.day, q.h) ? ' · ' + startsIn(q.day, q.h).toLowerCase() : ''}</small></button>`).join('');
    };

    // Board: PS5 and Xbox by hour for the chosen day. Never shows "Open" unless the database answered;
    // without it the hours read "Request" and we confirm on WhatsApp.
    const renderBoard = (day) => {
      const rows = hoursOpen.filter((h) => h >= earliestOf(day)), taken = takenOn(day.key);
      $('.avail-legend').hidden = state.live !== true;
      const s0 = state.start === null ? -1 : +state.start, picked = (c, h) => consolesOf(state.station).includes(c) && h >= s0 && h < s0 + state.hours;
      grid.innerHTML = !rows.length ? '' : `<span style="--r:1;--c:1"></span><span class="avail-con" style="--r:1;--c:2">PS5</span><span class="avail-con" style="--r:1;--c:3">Xbox</span>`
        + rows.map((h, i) => `<span class="avail-time" style="--r:${i + 2};--c:1">${span(h, h + 1)}</span>` + ['ps5', 'xbox'].map((c, j) => {
          const loading = state.live === null, unknown = state.live === false, booked = !unknown && taken.has(`${c}_${h}`);
          const cls = loading ? 'is-loading' : booked ? 'is-booked' : picked(c, h) ? 'is-picked' : unknown ? 'is-unknown' : 'is-open';
          const label = loading ? '' : booked ? 'Booked' : cls === 'is-picked' ? 'Picked' : unknown ? 'Request' : 'Open';
          return `<button type="button" class="avail-cell ${cls}" style="--r:${i + 2};--c:${j + 2}" data-console="${c}" data-hour="${h}" ${loading || booked ? 'disabled' : ''} aria-pressed="${cls === 'is-picked'}" aria-label="${names[c]} ${span(h, h + 1)}: ${label || 'loading'}">${label}</button>`;
        }).join('')).join('');
    };

    // Tap open hours to build a session: a tap next to the picked hours adds that hour (up to MAX_ONLINE_HOURS),
    // a tap on the first or last picked hour drops it, any other tap starts again from that hour.
    const ok = (station, h0, n) => (state.live === false ? h0 >= earliestOf(state.day) && h0 + n <= CONFIG.close && n <= MAX_ONLINE_HOURS : fits(state.date, station, h0, n));
    const setSession = (station, start, hours) => {
      if (!ok(station, start, hours)) return false;
      Object.assign(state, { station, start: String(start), time: String(hours) }); render(); return true;
    };
    let note = '';
    const pickSlot = (c, h) => {
      const squad = state.station === 'squad', onSel = state.start !== null && (squad || state.station === c);
      const st = +state.start, len = +state.time, end = st + len - 1;
      note = '';
      if (onSel && h === end + 1 && len < MAX_ONLINE_HOURS) setSession(state.station, st, len + 1) || (note = 'That hour is taken.');
      else if (onSel && h === st - 1 && len < MAX_ONLINE_HOURS) setSession(state.station, h, len + 1) || (note = 'That hour is taken.');
      else if (onSel && (h === end + 1 || h === st - 1)) note = `Up to ${MAX_ONLINE_HOURS} hours online. For longer, ask us on WhatsApp.`;
      else if (onSel && len > minHours() && h === st) setSession(state.station, st + 1, len - 1);
      else if (onSel && len > minHours() && h === end) setSession(state.station, st, len - 1);
      else if (!(onSel && h >= st && h <= end)) {
        // Start again from this hour: the whole room needs both consoles for its minimum, otherwise this console for 1 hour
        if (!(squad && setSession('squad', h, CONFIG.squadMinHours))) {
          if (squad) note = `The whole room needs both consoles free for ${CONFIG.squadMinHours} hours from ${clock(h)}. Booked ${names[c]} for 1 hour instead.`;
          setSession(c, h, 1);
        }
      }
      if (note) availNote.textContent = note;
    };
    grid.addEventListener('click', (e) => { const b = e.target.closest('button.avail-cell'); if (b && !b.disabled) pickSlot(b.dataset.console, +b.dataset.hour); });
    const setDate = (key) => { if (state.date !== key) state.start = null; state.date = key; select(availDays, key); render(); };
    availDays.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setDate(b.dataset.value); });
    $('#quick-row').addEventListener('click', (e) => {
      const b = e.target.closest('.quick-slot'); if (!b) return;
      state.date = b.dataset.date; select(availDays, state.date);
      if (setSession(b.dataset.console, +b.dataset.hour, +b.dataset.hours)) openSheet();
    });
    $('#hrs-plus').addEventListener('click', () => setSession(state.station, +state.start, +state.time + 1));
    $('#hrs-minus').addEventListener('click', () => setSession(state.station, +state.start, +state.time - 1));
    $('#room-check').addEventListener('change', (e) => {
      if (e.target.checked) {
        const s0 = state.start === null ? null : +state.start;
        state.station = 'squad'; state.time = String(Math.max(+state.time, CONFIG.squadMinHours));
        if (s0 !== null && !ok('squad', s0, +state.time)) { state.start = null; render(); availNote.textContent = 'Both consoles aren\'t free for that time. Pick a new slot.'; return; }
      } else state.station = 'ps5';
      render();
    });
    // "See when it's free" on the console cards, and the game cards
    $$('[data-pick]').forEach((a) => a.addEventListener('click', () => { if (state.station !== 'squad') state.station = a.dataset.pick; render(); }));
    $$('[data-pick-game]').forEach((a) => a.addEventListener('click', () => { state.game = a.dataset.pickGame; select(segs.game, state.game); $('#sum-extras').open = true; render(); }));
    Object.entries(segs).forEach(([key, seg]) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        state[key] = b.dataset.value; select(seg, b.dataset.value); render();
      });
    });

    // Phones: checkout is a bottom sheet; a bar with the pick and price follows you while the booking section is on screen
    const sheet = $('#checkout'), scrim = $('#sheet-scrim'), bar = $('#book-bar'), phone = matchMedia('(max-width: 959px)');
    let bookInView = false;
    const paintBar = () => { bar.hidden = !(phone.matches && bookInView && state.start !== null && !sheet.classList.contains('is-open')); };
    function openSheet() {
      if (!phone.matches) { (nameInput.value ? sendBtn : nameInput).focus({ preventScroll: true }); return; }
      sheet.classList.add('is-open'); scrim.hidden = false; root.classList.add('sheet-open');
      sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      paintBar(); if (!nameInput.value) setTimeout(() => nameInput.focus(), 350);
    }
    const closeSheet = () => {
      sheet.classList.remove('is-open'); scrim.hidden = true; root.classList.remove('sheet-open');
      sheet.removeAttribute('role'); sheet.removeAttribute('aria-modal'); paintBar();
    };
    $('#bar-go').addEventListener('click', openSheet);
    $('#sheet-close').addEventListener('click', closeSheet);
    scrim.addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet(); });
    phone.addEventListener('change', () => { if (!phone.matches) closeSheet(); paintBar(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => { bookInView = e.isIntersecting; paintBar(); }, { rootMargin: '0px 0px -25% 0px' }).observe($('#book'));

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
    const refreshQuiet = () => { if (document.visibilityState === 'visible' && window.MGDB) refreshTaken(true); };
    setInterval(refreshQuiet, 60000);
    document.addEventListener('visibilitychange', refreshQuiet);

    const statusEl = $('#book-status');
    sendBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); nameInput.setAttribute('aria-invalid', 'true'); return; }
      nameInput.removeAttribute('aria-invalid');
      try { localStorage.setItem('mg-name', name); } catch (e) {}
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
      sendBtn.disabled = true; statusEl.textContent = 'Holding your slot…';
      const res = await window.MGDB.reserve({
        id, name, date: st.date, start: s0, hours: st.hours, station: st.station, players: p, plan: st.plan,
        game: st.game === 'any' ? '' : st.game, food: st.foodPrice ? CONFIG.food[st.food].name : '', total: st.total
      });
      sendBtn.disabled = false;
      if (res.reason === 'taken') {
        if (tab) tab.close();
        state.week.set(st.date, res.taken); render();
        statusEl.textContent = 'Someone just booked that time. Pick another slot.';
        return;
      }
      statusEl.textContent = res.ok ? `Held for you for 3 hours (${id}). Confirm on WhatsApp to lock it in.` : '';
      if (res.ok) refreshTaken(true);
      if (tab) tab.location.href = url; else window.location.href = url;
    });

    render();
    const placeAll = () => { $$('.seg', builder).forEach(placeInd); placeInd(availDays); };
    window.addEventListener('resize', placeAll);
    document.fonts && document.fonts.ready.then(placeAll);
    $$('.sum-extras').forEach((d) => d.addEventListener('toggle', placeAll));
  }
})();
