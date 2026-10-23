/* MR. GAMING — shared by every customer screen (/, /book, /birthdays, /menu, /pass). No dependencies.
   Business details (CONFIG), WhatsApp links, open-now status, theme, top bar, reveals and rolling digits.
   Each screen adds its own small script after this one (home.js, book.js, birthday.js, menu.js, pass.js) and reads
   what it needs from window.MG. */
(function () {
  'use strict';

  /* ---------- business details: edit here ---------- */
  const CONFIG = {
    whatsapp: '917337230311',
    // Per console, per hour: 1 player = solo, 2 players on one console = duo. Up to 2 players per console (two
    // controllers each): 3 or 4 players take the whole room (3 = duo + solo, 4 = two duos). Passes are for 1-2 players
    rates: { solo: 199, duo: 320 },
    // 6-hour passes, valid 30 days
    passes: { solo: 899, duo: 1499 },
    // Member rate: once a pass's 6 hours are used, until its 30 days end. Between the pass and the regular rate.
    memberRates: { solo: 169, duo: 279 },
    passHours: 6,
    squadMinHours: 2,   // squad room: whole room, 2-4 players at the same per-person rate
    open: 11,           // opening hour, 24h clock (11 am)
    close: 23,          // closing hour (11 pm); sessions must end by then
    foodPerk: 0.10,     // 10% off food for console bookers
    // Birthday package: 3 hours, food included, ₹675 a child, ₹399 an adult. Minimum 10 guests (adults count towards it).
    // Up to roomMax guests get the game room to themselves; more than that get the whole restaurant.
    // Advance to book; on cancellation cancelFee is kept and the rest refunded
    birthday: { perChild: 675, perAdult: 399, hours: 3, minGuests: 10, roomMax: 15, advance: 4000, cancelFee: 1000 },
    // Bookable games for the booking form's game picker: the same titles as the game cards on the home page
    // (index.html #game-cards; not GTA VI, a pre-order). Change both together.
    games: ['FC 27', 'Call of Duty', 'GTA V', 'God of War', 'Tekken', 'Rocket League', 'WWE 2K', 'AO Tennis', 'Spider-Man', 'Forza', 'Fortnite', 'Minecraft'],
    address: 'MR. Sandwich, 110, My Home Vihanga Rd, Gachibowli, Hyderabad, Telangana 500032'
    // Food add-ons in the booking are the menu's Top Combos (menu-data.js), 10% off (foodPerk) for console bookers
  };

  const root = document.documentElement;
  root.classList.add('js');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const waUrl = (text) => `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(text)}`;
  const clock12 = (h) => `${h % 12 || 12} ${h < 12 ? 'am' : 'pm'}`;
  // "Now" in Hyderabad, whatever the visitor's phone timezone is
  const nowIst = () => { const d = new Date(); return new Date(d.getTime() + (330 + d.getTimezoneOffset()) * 60000); };

  /* ---------- WhatsApp links: data-wa holds the message (the plain wa.me href is the no-JS fallback) ---------- */
  const wireWa = (scope = document) => $$('[data-wa]', scope).forEach((a) => { a.href = waUrl(a.dataset.wa); });
  wireWa();

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

  /* ---------- scroll reveals (once): start a little before the element enters the screen, so it is in by the time it is seen ---------- */
  const onReveal = (el) => {
    el.classList.add('is-in');
    $$('[data-roll]', el).forEach((r) => setRoll(r, +r.dataset.roll));
  };
  const io = 'IntersectionObserver' in window && !reduced
    ? new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { onReveal(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px 15% 0px', threshold: 0 })
    : null;
  const reveal = (scope = document) => {
    $$('[data-stagger]', scope).forEach((g) => $$('[data-reveal]', g).forEach((el, i) => el.style.setProperty('--i', i)));
    $$('[data-reveal]:not(.is-in)', scope).forEach((el) => (io ? io.observe(el) : onReveal(el)));
  };
  // menu.js runs its own reveals for the newspaper page
  if (!document.body.classList.contains('menu-page')) reveal();

  /* ---------- top bar: a hairline once the page scrolls ---------- */
  const topbar = $('#topbar');
  if (topbar) {
    const onScroll = () => topbar.classList.toggle('is-scrolled', window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }

  /* ---------- open now? (Hyderabad time, from CONFIG.open/close) ---------- */
  const statuses = $$('#open-status, [data-open-status]');
  if (statuses.length) {
    const paintOpen = () => {
      const h = nowIst().getHours();
      const open = h >= CONFIG.open && h < CONFIG.close;
      const text = open ? `Open now · till ${clock12(CONFIG.close)}` : h < CONFIG.open ? `Opens today at ${clock12(CONFIG.open)}` : `Closed now · opens ${clock12(CONFIG.open)} tomorrow`;
      statuses.forEach((el) => { el.classList.toggle('is-open', open); $('.open-text', el).textContent = text; });
    };
    paintOpen(); setInterval(paintOpen, 60000);
  }

  /* ---------- theme (same "theme" key on every screen) ---------- */
  const themeBtn = $('#theme-toggle'), metaTheme = $('meta[name="theme-color"]');
  const effectiveTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  // the browser bar takes the page background (lime pages and the menu's paper alike)
  const paintMeta = () => { if (metaTheme) metaTheme.content = getComputedStyle(root).getPropertyValue('--bg').trim() || metaTheme.content; };
  paintMeta();
  if (themeBtn) themeBtn.addEventListener('click', () => {
    const next = effectiveTheme() === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    paintMeta();
  });

  window.MG = { CONFIG, $, $$, inr, waUrl, wireWa, setRoll, reveal, reduced, clock12, nowIst };
})();
