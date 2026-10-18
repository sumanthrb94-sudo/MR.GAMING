/* MR. GAMING — page behaviour. No dependencies. */
(function () {
  'use strict';

  /* ---------- business details: edit here ---------- */
  const CONFIG = {
    whatsapp: '917337230311',
    rate: 199,          // ₹ per person per hour
    pass: 799,          // ₹ per person, 6 hours within 30 days
    squadMinHours: 2,   // squad room: whole room, 2-4 players at the same per-person rate
    foodPerk: 0.10,     // 10% off food for console bookers
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
  if (dock && heroActions && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => dock.classList.toggle('is-visible', !e.isIntersecting && e.boundingClientRect.top < 0)).observe(heroActions);
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

  /* ---------- booking builder ---------- */
  const builder = $('.builder');
  if (builder) {
    const segs = Object.fromEntries($$('.seg', builder).map((s) => [s.dataset.key, s]));
    const state = { station: 'ps5', players: '1', time: '2', food: 'none' };
    const names = { ps5: 'PS5', xbox: 'Xbox', squad: 'Squad room' };

    const render = () => {
      const squad = state.station === 'squad';
      // Squad room takes 2-4 players; a single console takes 1-2
      $$('button', segs.players).forEach((b) => { const n = +b.dataset.value; b.hidden = squad ? n < 2 : n > 2; });
      if (squad && +state.players < 2) { state.players = '2'; select(segs.players, '2'); }
      if (!squad && +state.players > 2) { state.players = '2'; select(segs.players, '2'); }
      $$('button', segs.time).forEach((b) => { b.disabled = squad && (+b.dataset.value < CONFIG.squadMinHours || b.dataset.value === 'pass'); });
      if (squad && (state.time === '1' || state.time === 'pass')) { state.time = '2'; select(segs.time, '2'); }

      const pass = state.time === 'pass', hours = pass ? 6 : +state.time, players = +state.players;
      const gaming = (pass ? CONFIG.pass : CONFIG.rate * hours) * players;
      const food = CONFIG.food[state.food].price, perk = Math.round(food * CONFIG.foodPerk), total = gaming + food - perk;

      $('#time-hint').textContent = squad ? 'The whole room for your group. Minimum 2 hours.'
        : pass ? '6 hours to use any time within 30 days.' : '';
      $('#sum-title').textContent = `${names[state.station]} · ${pass ? '6-hr monthly pass' : hours + (hours > 1 ? ' hrs' : ' hr')} · ${players} player${players > 1 ? 's' : ''}`;
      $('#sum-gaming').textContent = inr(gaming);
      $('#sum-food').textContent = inr(food);
      $('#sum-perk').textContent = '−' + inr(perk);
      setRoll($('#sum-total'), total);
      state.total = total;
      $$('.seg', builder).forEach(placeInd);
    };

    Object.entries(segs).forEach(([key, seg]) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || b.disabled) return;
        state[key] = b.dataset.value; select(seg, b.dataset.value); render();
      });
    });

    $('#send-booking').addEventListener('click', () => {
      const squad = state.station === 'squad', pass = state.time === 'pass';
      const lines = [
        'Hi MR. GAMING! I\'d like to book:',
        '',
        `• ${squad ? 'Squad room (whole room)' : names[state.station]}`,
        `• ${pass ? '6-hour monthly pass' : state.time + ' hour(s)'}`,
        `• ${state.players} player(s)`,
        `• Food: ${CONFIG.food[state.food].name}`,
        `• Estimated total: ${inr(state.total)} (incl. 10% off food)`,
        '',
        'Is a slot free? When can I come?'
      ].filter((l) => l !== null);
      window.open(waUrl(lines.join('\n')), '_blank', 'noopener');
    });

    render();
    window.addEventListener('resize', () => $$('.seg', builder).forEach(placeInd));
    document.fonts && document.fonts.ready.then(() => $$('.seg', builder).forEach(placeInd));
  }
})();
