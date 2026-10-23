/* MR. GAMING home (/): hero headline, pointer glow, and the real hours left today from the booking database. */
(function () {
  'use strict';
  const { CONFIG, $, $$, reduced, nowIst } = window.MG;

  /* ---------- hero headline: word-by-word fade-in ---------- */
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

  /* ---------- hours left today (or tomorrow once today's last slot has started), any console ----------
     Only from the database: the line stays hidden until it answers. Same rules as the booking form (book.js):
     an hour counts when it starts 15+ minutes from now and is free on the PS5 or the Xbox. */
  const live = $('#hero-live');
  if (live) {
    const pad = (n) => String(n).padStart(2, '0');
    const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const t = nowIst(), mins = t.getHours() * 60 + t.getMinutes();
    const today = mins <= (CONFIG.close - 1) * 60 - 15;
    const d0 = new Date(t.getFullYear(), t.getMonth(), t.getDate() + (today ? 0 : 1)), d1 = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + 1);
    const free = (taken, from) => { let n = 0; for (let h = from; h < CONFIG.close; h++) if (!taken.has(`ps5_${h}`) || !taken.has(`xbox_${h}`)) n++; return n; };
    const paint = (week) => {
      const left = free(week.get(key(d0)) || new Set(), today ? Math.max(CONFIG.open, Math.ceil((mins + 15) / 60)) : CONFIG.open);
      const when = today ? 'today' : 'tomorrow';
      $('#hero-live-text').textContent = left ? `${left <= 3 ? 'Only ' : ''}${left} hour${left > 1 ? 's' : ''} free ${when} · book now`
        : `${today ? 'Today' : 'Tomorrow'} is fully booked · ${free(week.get(key(d1)) || new Set(), CONFIG.open)} hours open ${today ? 'tomorrow' : 'the day after'}`;
      live.classList.toggle('is-few', left > 0 && left <= 3);
      live.hidden = false;
    };
    const read = () => window.MGDB && window.MGDB.takenRange(key(d0), key(d1)).then(paint).catch(() => { live.hidden = true; });
    import('/assets/js/booking-db.js').then(read).catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') read(); });
  }
})();
