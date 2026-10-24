/* The customer's account, on every screen: the welcome form after a first sign-in, "Edit profile" (the same form) and
   the account sheet that opens from the top bar's name. Loaded on demand (account.js brings the Firebase bundle), so
   the first paint of a page never waits for it: main.js labels the top bar from the cached profile and imports this
   file only when the name is tapped; pass.js, book.js (via book-account.js) and order.js import it after a sign-in.
   - ensureProfile(user, { name })  no users/{uid} yet: the welcome form (verified number, full name, email, WhatsApp
     opt-in), then resolves with the saved profile, so the booking or order carries on where it was. Returning
     customers skip it (cached profile or one read). Resolves null if the profile can't be read or the customer skips
     after a failed save: nothing they were doing is blocked.
   - editProfile()  the same form, filled in.
   - openAccountSheet()  name, verified number, email, My orders & bookings, My passes & meal plans, Edit profile, Sign out.
   Everything typed is shown with textContent only. firestore.rules check the profile again (phone = the verified number). */
import { ready, currentUser, getProfile, saveProfile, cachedProfile, signOut } from '/assets/js/account.js';

const $ = (s, r = document) => r.querySelector(s);
const pretty = (p) => { const d = String(p || '').replace(/\D/g, '').slice(-10); return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p || ''); };
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;   // the same shape firestore.rules accept
const firstOf = (n) => String(n || '').trim().split(/\s+/)[0].slice(0, 20);
const open = (d) => { if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); } };
const shut = (d) => { if (d.open) { if (d.close) d.close(); else d.removeAttribute('open'); } };
const X = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';

/* ---------- the welcome / edit form ---------- */
let form = null;
function formEl() {
  if (form) return form;
  document.body.insertAdjacentHTML('beforeend', `
  <dialog class="acct" id="acct-form" aria-labelledby="acct-form-title">
    <form class="acct-body" novalidate>
      <div class="acct-head">
        <div><p class="acct-eyebrow" data-f="eyebrow">Welcome</p><h2 class="acct-title" id="acct-form-title" data-f="title"></h2></div>
        <button class="acct-x" type="button" data-f="x" aria-label="Close">${X}</button>
      </div>
      <p class="acct-lede" data-f="lede"></p>
      <div class="acct-field"><span class="acct-label">Mobile number</span><p class="acct-phone"><b data-f="phone"></b><span class="acct-tag">Verified</span></p></div>
      <label class="acct-field"><span class="acct-label">Full name</span><input class="acct-input" data-f="name" name="name" maxlength="40" autocomplete="name" required enterkeyhint="next" placeholder="Your full name"></label>
      <label class="acct-field"><span class="acct-label">Email <small>optional</small></span><input class="acct-input" data-f="email" name="email" type="email" inputmode="email" maxlength="100" autocomplete="email" enterkeyhint="done" placeholder="you@example.com"></label>
      <label class="acct-check"><input type="checkbox" data-f="wa"><span>Send me offers and booking updates on WhatsApp</span></label>
      <p class="acct-err" data-f="err" role="alert"></p>
      <button class="btn btn-accent btn-block press" type="submit" data-f="save">Save and continue</button>
      <button class="acct-skip" type="button" data-f="skip" hidden>Skip for now</button>
    </form>
  </dialog>`);
  form = $('#acct-form');
  return form;
}
const ff = (k) => $(`[data-f="${k}"]`, formEl());

// mode 'new' (welcome) or 'edit'. Resolves with the saved profile, or null if closed / skipped.
function showForm(u, mode, prev, typedName) {
  const d = formEl(), isNew = mode === 'new';
  ff('eyebrow').textContent = isNew ? 'Welcome' : 'Your account';
  ff('title').textContent = isNew ? 'Welcome to MR. Gaming & MR. Sandwich' : 'Edit profile';
  ff('lede').textContent = isNew ? 'One quick step, once: so we know who is booking and ordering.' : 'Changes show on your next booking or order.';
  ff('phone').textContent = pretty(u.phoneNumber);
  ff('name').value = (prev && prev.name) || typedName || '';
  ff('email').value = (prev && prev.email) || '';
  ff('wa').checked = !!(prev && prev.waOptIn);
  ff('err').textContent = ''; ff('skip').hidden = true; ff('x').hidden = isNew;
  ff('save').textContent = isNew ? 'Save and continue' : 'Save';
  ff('save').disabled = false;
  ['name', 'email'].forEach((k) => ff(k).removeAttribute('aria-invalid'));
  return new Promise((resolve) => {
    let done = false;
    const finish = (p) => { if (done) return; done = true; d.removeEventListener('cancel', onCancel); $('form', d).onsubmit = null; ff('x').onclick = null; ff('skip').onclick = null; shut(d); resolve(p); };
    // The welcome form isn't dismissed by Esc: the name is needed for the booking or order. Editing closes freely.
    const onCancel = (e) => { e.preventDefault(); if (!isNew) finish(null); };
    d.addEventListener('cancel', onCancel);
    ff('x').onclick = () => finish(null);
    ff('skip').onclick = () => finish(null);
    $('form', d).onsubmit = async (e) => {
      e.preventDefault();
      const name = ff('name').value.trim().replace(/\s+/g, ' '), email = ff('email').value.trim();
      ff('err').textContent = '';
      if (!name) { ff('name').setAttribute('aria-invalid', 'true'); ff('name').focus(); ff('err').textContent = 'Add your full name.'; return; }
      ff('name').removeAttribute('aria-invalid');
      if (email && !EMAIL.test(email)) { ff('email').setAttribute('aria-invalid', 'true'); ff('email').focus(); ff('err').textContent = 'That email doesn’t look right. Check it, or leave it empty.'; return; }
      ff('email').removeAttribute('aria-invalid');
      ff('save').disabled = true; ff('save').textContent = 'Saving…';
      try {
        const fresh = isNew ? null : await getProfile(u);   // editing: keep the saved createdAt exactly
        finish(await saveProfile(u, { name, email, waOptIn: ff('wa').checked }, fresh || prev));
      } catch (err) {
        console.warn('Profile not saved:', err && err.code);
        ff('save').disabled = false; ff('save').textContent = isNew ? 'Save and continue' : 'Save';
        ff('err').textContent = "Couldn't save right now. Check your connection and try again.";
        if (isNew) ff('skip').hidden = false;
      }
    };
    open(d);
    setTimeout(() => (ff('name').value ? (isNew ? ff('save') : ff('name')) : ff('name')).focus(), 60);
  });
}

// After a sign-in: the profile if there is one, else the welcome form
export async function ensureProfile(u = currentUser(), { name = '' } = {}) {
  if (!u) return null;
  const c = cachedProfile();
  if (c && c.uid === u.uid && c.name) return c;
  let p;
  try { p = await getProfile(u); } catch (e) { console.warn('Profile not read:', e && e.code); return null; }
  return p || showForm(u, 'new', null, name).then((made) => made && Object.assign(made, { created: true }));
}

export async function editProfile() {
  const u = await ready.then(() => currentUser());
  if (!u) return null;
  let p = null;
  try { p = await getProfile(u); } catch (e) { p = cachedProfile(); }
  return showForm(u, p ? 'edit' : 'new', p, '');
}

/* ---------- the account sheet (the top bar's name) ---------- */
let sheet = null;
function sheetEl() {
  if (sheet) return sheet;
  document.body.insertAdjacentHTML('beforeend', `
  <dialog class="acct" id="acct-sheet" aria-labelledby="acct-name">
    <div class="acct-body">
      <div class="acct-head">
        <div class="acct-me"><span class="acct-av" data-s="av" aria-hidden="true"></span><div><p class="acct-eyebrow">Signed in</p><h2 class="acct-title" id="acct-name" data-s="name"></h2></div></div>
        <button class="acct-x" type="button" data-s="x" aria-label="Close">${X}</button>
      </div>
      <dl class="acct-dl">
        <div><dt>Mobile</dt><dd><span data-s="phone"></span> <span class="acct-tag">Verified</span></dd></div>
        <div><dt>Email</dt><dd data-s="email"></dd></div>
      </dl>
      <nav class="acct-links" aria-label="Your account">
        <a href="/pass#mine">My orders &amp; bookings</a>
        <a href="/pass">My passes &amp; meal plans</a>
        <button type="button" data-s="edit">Edit profile</button>
      </nav>
      <p class="acct-err" data-s="msg" role="status"></p>
      <button class="btn btn-block press acct-out" type="button" data-s="out">Sign out</button>
    </div>
  </dialog>`);
  sheet = $('#acct-sheet');
  const s = (k) => $(`[data-s="${k}"]`, sheet);
  s('x').addEventListener('click', () => shut(sheet));
  sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('.acct-links a')) shut(sheet); });   // outside the panel, or a link
  s('edit').addEventListener('click', async () => { shut(sheet); const p = await editProfile(); if (p) openAccountSheet(); });
  s('out').addEventListener('click', async () => {
    s('out').disabled = true; s('out').textContent = 'Signing out…'; s('msg').textContent = '';
    try { await signOut(); shut(sheet); document.dispatchEvent(new CustomEvent('mg-signed-out')); }
    catch (e) { s('msg').textContent = "Couldn't sign out right now. Try again."; }
    s('out').disabled = false; s('out').textContent = 'Sign out';
  });
  return sheet;
}
function paintSheet(p, u) {
  const s = (k) => $(`[data-s="${k}"]`, sheetEl()), name = (p && p.name) || '';
  s('av').textContent = firstOf(name).charAt(0).toUpperCase(); s('av').hidden = !name;
  s('name').textContent = name || 'Your account';
  s('phone').textContent = pretty((u && u.phoneNumber) || (p && p.phone));
  s('email').textContent = (p && p.email) || 'Not added';
  s('email').classList.toggle('is-none', !(p && p.email));
}
export async function openAccountSheet() {
  const d = sheetEl(), cached = cachedProfile();
  paintSheet(cached, null); $('[data-s="msg"]', d).textContent = cached ? '' : 'Loading…';
  open(d);
  // The real sign-in decides: a session that has gone (signed out elsewhere, cleared storage) goes back to "Log in"
  const u = await ready.then(() => currentUser());
  if (!u) { shut(d); location.href = '/pass'; return; }
  try {
    const p = await getProfile(u);
    if (!p) { shut(d); const made = await showForm(u, 'new', null, ''); if (made) openAccountSheet(); return; }
    paintSheet(p, u); $('[data-s="msg"]', d).textContent = '';
  } catch (e) { paintSheet(cached, u); $('[data-s="msg"]', d).textContent = cached ? '' : "Couldn't load your profile right now."; }
}
