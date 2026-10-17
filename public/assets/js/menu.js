/* MR. Sandwich menu page: renders window.MENU, search, sticky category chips. */
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

  const main = $('#menu'), chips = $('#chips'), ind = $('.chip-ind'), empty = $('#empty');

  /* ---------- render ---------- */
  const itemHtml = (it, two) => `
    <li class="item" data-text="${esc((it.name + ' ' + (it.desc || '')).toLowerCase())}">
      <div class="item-row">
        <span class="item-name">${esc(it.name)}</span><span class="leader" aria-hidden="true"></span>
        ${two ? `<span class="price price-2">${it.prices.map((p) => `<span>${inr(p)}</span>`).join('')}</span>` : `<span class="price">${inr(it.price)}</span>`}
      </div>
      ${it.desc ? `<p class="item-desc">${esc(it.desc)}</p>` : ''}
    </li>`;

  main.insertAdjacentHTML('beforeend', M.sections.map((s) => `
    <section class="sec" id="${s.id}" data-reveal>
      <header class="sec-head"><h2 class="sec-title">${esc(s.title)}</h2></header>
      ${s.note ? `<p class="sec-note">${esc(s.note)}</p>` : ''}
      ${s.groups.map((g) => `
        <div class="group">
          ${g.title ? `<h3 class="group-title">${esc(g.title)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</h3>` : ''}
          ${g.cols ? `<div class="cols" aria-hidden="true">${g.cols.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
          <ul>${g.items.map((it) => itemHtml(it, !!g.cols)).join('')}</ul>
        </div>`).join('')}
    </section>`).join(''));

  chips.insertAdjacentHTML('beforeend', M.sections.map((s) => `<a class="chip" href="#${s.id}" data-id="${s.id}">${esc(s.title)}</a>`).join(''));
  $('#notes').innerHTML = M.notes.map((n) => `<li>${esc(n)}</li>`).join('');

  /* ---------- reveals ---------- */
  const reveal = (el) => el.classList.add('is-in');
  if ('IntersectionObserver' in window && !reduced) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { reveal(e.target); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px', threshold: .05 });
    $$('[data-reveal]').forEach((el, i) => { if (el.closest('.mast')) el.style.setProperty('--i', i); io.observe(el); });
  } else $$('[data-reveal]').forEach(reveal);

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
  window.addEventListener('resize', () => { const a = active; active = null; setActive(a); });
  document.fonts && document.fonts.ready.then(() => { active = null; pick(); });
  pick();

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
    active = null; pick();
  });
})();
