/* MR. GAMING pass card (/pass?id=...): the holder's first name and hours left, read from Firestore passCards.
   The owner changes hours in /admin; this page re-reads every 30 seconds and when it comes back into view. */
import { initializeApp, getFirestore, doc, getDoc } from '/assets/vendor/firebase-public.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const $ = (s) => document.querySelector(s);
const WA = '917337230311';
const LABEL = { solo: 'Solo pass', duo: 'Duo pass' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const id = new URLSearchParams(location.search).get('id') || '';
const db = getFirestore(initializeApp(firebaseConfig));

let shown = null;
function countTo(el, to) {
  const from = shown === null ? 0 : shown; shown = to;
  if (reduced || from === to) { el.textContent = to; return; }
  const t0 = performance.now(), dur = 700;
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function fail(text) {
  $('#pass-hi').textContent = text;
  ['#pass-hours', '#pass-bar'].forEach((s) => { $(s).hidden = true; });
  $('#pass-actions').hidden = false; $('#pass-book').hidden = true;
  $('#pass-meta').textContent = '';
}

async function load() {
  if (!/^[A-Za-z0-9]{10,40}$/.test(id)) return fail("This pass link isn't complete. Ask us on WhatsApp for a fresh one.");
  let snap;
  try { snap = await getDoc(doc(db, 'passCards', id)); } catch (e) { if (shown === null) fail("Couldn't load your pass right now. Try again in a minute."); return; }
  if (!snap.exists()) return fail("We can't find this pass. Ask us on WhatsApp.");
  const p = snap.data(), total = p.hoursTotal || 0, left = Math.max(0, total - (p.hoursUsed || 0));
  const exp = p.expires && p.expires.toDate ? p.expires.toDate() : null, expired = exp && exp.getTime() < Date.now();
  const label = LABEL[p.type] || 'Pass';
  $('#pass-kind').textContent = label;
  $('#pass-hi').textContent = `Hi ${p.first || 'there'},`;
  $('#pass-hours').hidden = $('#pass-bar').hidden = false;
  countTo($('#pass-left'), left);
  $('#pass-of').textContent = `${left === 1 ? 'hr' : 'hrs'} left of ${total}`;
  $('#pass-fill').style.width = total ? `${(left / total) * 100}%` : '0%';
  const date = exp ? exp.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  $('#pass-meta').textContent = expired ? `Expired on ${date}. Ask us about topping up.` : left === 0 ? 'All hours used. Ask us about topping up.' : exp ? `Valid till ${date}` : '';
  $('#pass').classList.toggle('is-dim', !!expired || left === 0);
  $('#pass-actions').hidden = false;
  $('#pass-book').hidden = !!expired || left === 0;
  $('#pass-book').href = `/?pass=${p.type === 'duo' ? 'duo' : 'solo'}#book`;
  $('#pass-wa').href = `https://wa.me/${WA}?text=${encodeURIComponent(`Hi MR. GAMING! About my ${label.toLowerCase()} (${left} hrs left).`)}`;
}

load();
setInterval(() => { if (document.visibilityState === 'visible') load(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
