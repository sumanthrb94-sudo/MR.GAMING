/* MR. Sandwich menu page (/menu, the Food tab): renders window.MENU (meal plans after Top Combos), search and sticky
   category chips, then applies the owner's live changes (menuOverrides via menu-live.js: price, sold out today, hidden).
   The table-QR layout (?src=qr) is set before paint by the script in menu.html. Runs after main.js (window.MG). */
(function () {
  'use strict';
  const M = window.MENU;
  const root = document.documentElement;
  root.classList.add('js');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const inr = (n) => '₹' + n.toLocaleString('en-IN');
  // The shell (main.js) wires WhatsApp links, the open-now status, the theme and the top bar; CONFIG lives there
  const { CONFIG } = window.MG;
  const waUrl = window.MG.waUrl;
  const clock12 = window.MG.clock12;
  const hoursLine = $('#hours-line');
  if (hoursLine) hoursLine.textContent = `Open ${clock12(CONFIG.open)} – ${clock12(CONFIG.close)}, every day`;

  const main = $('#menu'), chips = $('#chips'), ind = $('.chip-ind'), empty = $('#empty');

  /* ---------- meal plans: every number comes from M.mealPlans, the combo list from the combos section ---------- */
  const P = M.mealPlans;
  const plans = P ? P.plans.map((p) => ({ ...p, per: Math.round(p.price / p.meals), save: p.meals * P.mealValue - p.price })) : [];
  const best = plans.reduce((b, p) => (b && b.price / b.meals <= p.price / p.meals ? b : p), null);   // lowest price a meal
  const counts = plans.map((p) => p.meals).join(', ').replace(/, (\d+)$/, ' or $1');   // "5, 8 or 10"
  const mealCombos = P ? M.sections.filter((s) => s.id === 'combos').flatMap((s) => s.groups.flatMap((g) => g.items)).filter((it) => it.price === P.mealValue) : [];
  const upTo = Math.max(0, ...plans.map((p) => Math.floor(100 * p.save / (p.meals * P.mealValue))));   // floor: "up to" never overstates

  const plansHtml = !P ? '' : `
    <section class="sec" id="meal-plans" data-reveal>
      <header class="sec-head"><h2 class="sec-title">Meal Plans</h2></header>
      <p class="sec-note">Save up to ${upTo}% vs ${inr(P.mealValue)} a meal</p>
      <ul class="plan-list">${plans.map((p) => `
        <li class="item plan" data-text="${esc(`${p.meals} meals a month, meal plans, ${inr(p.per)} a meal, save ${inr(p.save)}`.toLowerCase())}">
          <div class="item-row">
            <span class="item-name">${p.meals} meals</span>${p === best ? '<span class="plan-tag">Best value</span>' : ''}<span class="leader" aria-hidden="true"></span>
            <span class="price">${inr(p.price)}</span>
          </div>
          <p class="item-desc">${inr(p.per)} a meal · <b>save ${inr(p.save)}</b></p>
        </li>`).join('')}
      </ul>
      <p class="plan-valid">Valid ${P.days} days from the day you buy. Meals not used by then expire.</p>
      <div class="plan-more">
        <div>
          <h3 class="plan-head">What's a meal?</h3>
          <p class="plan-lede">Any one ${inr(P.mealValue)} <a href="#combos">Top Combo</a>:</p>
          <ul class="plan-combos">${mealCombos.map((c) => `<li data-combo="${esc(c.name)}">${esc(c.name)}</li>`).join('')}</ul>
        </div>
        <div>
          <h3 class="plan-head">How to start</h3>
          <ol class="plan-steps">
            <li>Message us on WhatsApp, or ask at the counter.</li>
            <li>We add the plan to your mobile number.</li>
            <li>See your meals left on <a href="/pass">My pass</a>: sign in with that number, or open the link we send.</li>
          </ol>
          <a class="plan-wa" href="${esc(waUrl(`Hi MR. Sandwich! I'd like a meal plan.\nMeals (${counts}):\nMy name is:`))}" target="_blank" rel="noopener">Start a plan on WhatsApp<span aria-hidden="true">→</span></a>
          <p class="plan-ask">Anything else? <a href="${esc(waUrl('Hi MR. Sandwich! I have a question about the meal plans.'))}" target="_blank" rel="noopener">Ask us on WhatsApp</a>.</p>
        </div>
      </div>
    </section>`;

  const perk = $('#plans-perk');
  if (!P) perk.remove();
  else $('.perk-copy', perk).innerHTML = `${counts} meals a month, from <strong>${inr(best.per)}&nbsp;a&nbsp;meal</strong>`;
  const planLine = $('.perk-line a[href="#meal-plans"]');   // the table-QR one-liner
  if (planLine && !P) { planLine.nextSibling.remove(); planLine.remove(); }

  /* ---------- render ---------- */
  const itemHtml = (it, two, key) => `
    <li class="item" data-k="${key}" data-text="${esc((it.name + ' ' + (it.desc || '')).toLowerCase())}">
      <div class="item-row">
        <span class="item-name">${esc(it.name)}</span><span class="leader" aria-hidden="true"></span>
        ${two ? `<span class="price price-2">${it.prices.map((p) => `<span>${inr(p)}</span>`).join('')}</span>` : `<span class="price">${inr(it.price)}</span>`}
      </div>
      ${it.desc ? `<p class="item-desc">${esc(it.desc)}</p>` : ''}
    </li>`;

  // meal plans go right after Top Combos (a meal is one of those combos), so the food still comes first on a phone
  const at = M.sections.findIndex((s) => s.id === 'combos') + 1;
  const withPlans = (list, plan) => (P ? [...list.slice(0, at), plan, ...list.slice(at)] : list);

  main.insertAdjacentHTML('beforeend', withPlans(M.sections.map((s, si) => `
    <section class="sec" id="${s.id}" data-reveal>
      <header class="sec-head"><h2 class="sec-title">${esc(s.title)}</h2></header>
      ${s.note ? `<p class="sec-note">${esc(s.note)}</p>` : ''}
      ${s.groups.map((g, gi) => `
        <div class="group">
          ${g.title ? `<h3 class="group-title">${esc(g.title)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</h3>` : ''}
          ${g.cols ? `<div class="cols" aria-hidden="true">${g.cols.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
          <ul>${g.items.map((it, k) => itemHtml(it, !!g.cols, `${si}.${gi}.${k}`)).join('')}</ul>
        </div>`).join('')}
    </section>`), plansHtml).join(''));

  chips.insertAdjacentHTML('beforeend', withPlans(M.sections, { id: 'meal-plans', title: 'Meal Plans' }).map((s) => `<a class="chip" href="#${s.id}" data-id="${s.id}">${esc(s.title)}</a>`).join(''));
  $('#notes').innerHTML = M.notes.map((n) => `<li>${esc(n)}</li>`).join('');

  /* ---------- reveals ---------- */
  const reveal = (el) => el.classList.add('is-in');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: .05 });
    $$('[data-reveal]').forEach((el) => io.observe(el));
  } else $$('[data-reveal]').forEach(reveal);

  /* ---------- chips: fade the edge that has more to swipe to ---------- */
  const chipsWrap = chips.parentElement;
  const paintEdges = () => {
    chipsWrap.classList.toggle('is-scrolled', chips.scrollLeft > 4);
    chipsWrap.classList.toggle('at-end', chips.scrollLeft + chips.clientWidth >= chips.scrollWidth - 4);
  };
  chips.addEventListener('scroll', paintEdges, { passive: true });

  /* ---------- active chip with a sliding indicator ---------- */
  let active = null;
  const setActive = (id) => {
    if (id === active) return; active = id;
    $$('.chip', chips).forEach((c) => c.classList.toggle('is-active', c.dataset.id === id));
    const c = $(`.chip[data-id="${id}"]`, chips);
    if (!c) { ind.style.width = '0'; return; }
    ind.style.width = c.offsetWidth + 'px';
    ind.style.transform = `translateX(${c.offsetLeft}px)`;
    const target = c.offsetLeft - (chips.clientWidth - c.offsetWidth) / 2;
    chips.scrollTo({ left: target, behavior: reduced ? 'auto' : 'smooth' });
  };
  const sections = $$('.sec', main);
  const pick = () => {
    const line = $('.cats').getBoundingClientRect().bottom + 56;
    let id = null;
    for (const s of sections) { if (s.hidden) continue; if (s.getBoundingClientRect().top <= line) id = s.id; }
    setActive(id || (sections.find((s) => !s.hidden) || {}).id);
  };
  let ticking = false;
  window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(() => { pick(); ticking = false; }); } }, { passive: true });
  window.addEventListener('resize', () => { const a = active; active = null; setActive(a); paintEdges(); });
  document.fonts && document.fonts.ready.then(() => { active = null; pick(); paintEdges(); });
  pick(); paintEdges();

  /* ---------- search ---------- */
  const q = $('#q');
  q.addEventListener('input', () => {
    const term = q.value.trim().toLowerCase();
    let any = false;
    sections.forEach((s) => {
      let shown = 0;
      $$('.item', s).forEach((it) => {
        const hit = !term || it.dataset.text.includes(term);
        it.hidden = !hit; if (hit) shown++;
        const name = $('.item-name', it), raw = name.textContent;
        name.innerHTML = term && hit ? esc(raw).replace(new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>') : esc(raw);
      });
      $$('.group', s).forEach((g) => { g.hidden = !$$('.item', g).some((i) => !i.hidden); });
      s.hidden = shown === 0; if (shown) any = true;
      if (term) reveal(s);
    });
    empty.hidden = any;
    $$('.chip', chips).forEach((c) => { c.hidden = !!document.getElementById(c.dataset.id).hidden; });
    active = null; pick(); paintEdges();
  });

  /* ---------- live changes from the owner (menuOverrides), after the menu is on screen ----------
     A new price replaces the shown one, "Sold out today" is tagged, hidden items go. If Firestore can't be read the
     menu stays as in menu-data.js. */
  const SOLD = '<span class="sold">Sold out today</span>';
  const applyLive = (m, ov) => {
    if (!ov.size) return;
    const ids = m.idsFor(M);
    M.sections.forEach((sec, si) => sec.groups.forEach((g, gi) => g.items.forEach((it, k) => {
      const li = $(`.item[data-k="${si}.${gi}.${k}"]`, main); if (!li) return;
      const live = m.liveItem(it, ids.get(it), ov);
      if (live.hidden) { li.remove(); return; }
      if (live.cols) $$('.price-2 span', li).forEach((sp, i) => { const c = live.cols[i]; sp.textContent = c.hidden ? '—' : inr(c.price); sp.classList.toggle('is-out', c.soldOut && !c.hidden); });
      else $('.price', li).textContent = inr(live.price);
      li.classList.toggle('is-out', live.soldOut);
      if (live.soldOut) $('.item-name', li).insertAdjacentHTML('afterend', SOLD);
      if (sec.id === 'combos') $$(`.plan-combos [data-combo="${CSS.escape(it.name)}"]`).forEach((c) => { if (live.hidden) c.remove(); else if (live.soldOut) c.insertAdjacentHTML('beforeend', ' ' + SOLD); });
    })));
    $$('.group', main).forEach((g) => { if (!$('.item', g)) g.remove(); });
    sections.forEach((sec) => { if (!$('.item', sec)) { sec.hidden = true; const c = $(`.chip[data-id="${sec.id}"]`, chips); if (c) c.hidden = true; } });
    if (q.value.trim()) q.dispatchEvent(new Event('input'));
    active = null; pick(); paintEdges();
  };
  const goLive = () => import('/assets/js/menu-live.js').then((m) => m.loadOverrides().then((ov) => applyLive(m, ov))).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(goLive, { timeout: 1500 }); else setTimeout(goLive, 300);
})();
