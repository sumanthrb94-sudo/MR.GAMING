/* MR. GAMING birthdays (/birthdays): children × ₹675 + adults × ₹399; the enquiry goes to WhatsApp (nothing is saved).
   /birthdays?date=2026-11-07#bday-plan (the booking form's birthday card) fills in the date. */
(function () {
  'use strict';
  const { CONFIG, $, $$, inr, waUrl, setRoll, clock12, nowIst, reduced } = window.MG;

  const bday = $('#bday-send');
  if (bday) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const ist = nowIst();
    const dateIn = $('#bday-date'), startIn = $('#bday-start'), nameIn = $('#bday-name');
    const { perChild, perAdult, hours, minGuests, roomMax, advance, cancelFee } = CONFIG.birthday;
    let kids = minGuests, adults = 0;
    dateIn.min = `${ist.getFullYear()}-${pad2(ist.getMonth() + 1)}-${pad2(ist.getDate())}`;
    const asked = new URLSearchParams(location.search).get('date');
    if (asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && asked >= dateIn.min) dateIn.value = asked;
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
      $('#bday-sum').textContent = $('#bday-run-sum').textContent = `${kids} × ${inr(perChild)}${adults ? ` + ${adults} × ${inr(perAdult)}` : ''}`;
      $('#bday-run-total').textContent = inr(total);   // the running total under the counters
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
    // Arriving from the booking form's birthday card: light up the planner
    if (location.hash === '#bday-plan') {
      const plan = $('#bday-plan');
      plan.classList.add('is-lit'); setTimeout(() => plan.classList.remove('is-lit'), 2400);
      plan.classList.add('is-in');
    }
  }

  // Links to #birthday-terms open the terms before scrolling to them
  const terms = $('#birthday-terms');
  if (terms) {
    const openTerms = () => { if (location.hash === '#birthday-terms') { terms.open = true; terms.classList.add('is-in'); } };
    $$('a[href="#birthday-terms"]').forEach((l) => l.addEventListener('click', () => { terms.open = true; }));
    window.addEventListener('hashchange', openTerms); openTerms();
    if (location.hash === '#birthday-terms') requestAnimationFrame(() => terms.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }));
  }
})();
