/* One bill (/bill?id=...): the link the console shares on WhatsApp and the customer sees in My orders & bookings.
   bills/{id} is readable one at a time by its unguessable id, never listed (firestore.rules). It holds the customer's
   first name only, the lines, the totals and how it was paid. Titled "Tax invoice" with the GSTIN and the GST lines when
   the owner had set a GSTIN when it was billed; otherwise "Bill", with no GST.
   ?print=receipt prints it straight away on an 80 mm receipt printer; the buttons print A4 or the receipt. */
import { initializeApp, getFirestore, doc, getDoc } from '/assets/vendor/firebase-public.2b1547c7.js';
import { firebaseConfig } from '/assets/js/firebase-config.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const { CONFIG } = window.MG;
const params = new URLSearchParams(location.search), id = params.get('id');
const money = (n, paise) => '₹' + (+n || 0).toLocaleString('en-IN', paise ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
const phone = `+${CONFIG.whatsapp.slice(0, 2)} ${CONFIG.whatsapp.slice(2, 7)} ${CONFIG.whatsapp.slice(7)}`;
const BRAND = { food: 'MR. Sandwich', meals: 'MR. Sandwich', gaming: 'MR. GAMING', pass: 'MR. GAMING', birthday: 'MR. GAMING · MR. Sandwich' };
const KIND = { food: 'Food order', meals: 'Meal plan', gaming: 'Gaming', pass: 'Gaming pass', birthday: 'Birthday party' };
const METHOD = { cash: 'Cash', upi: 'UPI', card: 'Card' };
const when = (ts) => {
  if (!ts || !ts.toMillis) return '';
  const d = new Date(ts.toMillis() + 330 * 60000), h = d.getUTCHours();
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
const status = (text) => { $('#bill').innerHTML = `<p class="bill-status">${esc(text)}</p>`; };

function render(b) {
  const gst = b.gst && b.gst.gstin ? b.gst : null, paise = !!gst;
  document.title = `${gst ? 'Tax invoice' : 'Bill'} ${b.no} · ${BRAND[b.kind] || 'MR. Sandwich'}`;
  const rows = [['Subtotal', money(b.subtotal, paise)]];
  (b.taxes || []).forEach((t) => {
    rows.push([`${t.label}: taxable value${gst.pricesExclusive ? '' : ' (prices include GST)'}`, money(t.taxable, true)]);
    rows.push([`CGST ${t.rate / 2}%`, money(t.cgst, true)], [`SGST ${t.rate / 2}%`, money(t.sgst, true)]);
  });
  if (b.roundOff) rows.push(['Round off', money(b.roundOff, true)]);
  $('#bill').innerHTML = `
    ${b.void ? `<p class="bill-void" role="alert"><b>Void</b> ${esc(b.void.reason)}</p>` : ''}
    <header class="bill-head">
      <div class="bill-from">
        <p class="bill-brand">${esc(BRAND[b.kind] || 'MR. Sandwich')}</p>
        ${gst && gst.legalName ? `<p class="bill-legal">${esc(gst.legalName)}</p>` : ''}
        <p>${esc(CONFIG.address.replace(/^MR\. Sandwich,\s*/, ''))}</p>
        <p>Phone ${esc(phone)}</p>
        ${gst ? `<p class="bill-gstin">GSTIN ${esc(gst.gstin)}</p>` : ''}
      </div>
      <div class="bill-meta">
        <h1 class="bill-title">${gst ? 'Tax invoice' : 'Bill'}</h1>
        <dl>
          <div><dt>No.</dt><dd>${esc(b.no)}</dd></div>
          <div><dt>Date</dt><dd>${esc(when(b.createdAt))}</dd></div>
          ${b.first ? `<div><dt>Customer</dt><dd>${esc(b.first)}</dd></div>` : ''}
          <div><dt>For</dt><dd>${esc(KIND[b.kind] || b.kind)}${b.mode === 'delivery' ? ' · delivery' : b.mode === 'pickup' ? ' · pickup' : ''}${b.ref && b.ref.id && /^(FO|MG)-/.test(b.ref.id) ? ` · ${esc(b.ref.id)}` : ''}</dd></div>
        </dl>
      </div>
    </header>
    <table class="bill-lines">
      <thead><tr><th scope="col">Item</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Rate</th>${gst ? '<th scope="col" class="num">GST</th>' : ''}<th scope="col" class="num">Amount</th></tr></thead>
      <tbody>${(b.lines || []).map((l) => `<tr>
        <td>${esc(l.name)}</td><td class="num">${esc(l.qty)}</td><td class="num">${money(l.price, paise)}</td>${gst ? `<td class="num">${esc(l.gst ?? 0)}%</td>` : ''}<td class="num">${money(l.amount, paise)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <dl class="bill-sum">
      ${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
      <div class="bill-total"><dt>Total</dt><dd>${money(b.total)}</dd></div>
    </dl>
    <p class="bill-paid">Paid by ${esc(METHOD[b.method] || b.method)}${b.paidAt ? ` · ${esc(when(b.paidAt))}` : ''}</p>
    <p class="bill-thanks">Thank you for visiting MR. Sandwich and MR. GAMING. Questions about this bill? WhatsApp ${esc(phone)}.</p>`;
  $('#bill-acts').hidden = false;
}

// Print: the page size is set just before printing (A4, or an 80 mm roll as long as the bill)
function print(receipt) {
  const root = document.documentElement;
  root.classList.toggle('receipt', receipt);
  let st = $('#page-size'); if (!st) { st = document.createElement('style'); st.id = 'page-size'; document.head.append(st); }
  const mm = receipt ? Math.ceil(($('#bill').getBoundingClientRect().height * 25.4) / 96) + 12 : 0;
  st.textContent = receipt ? `@page { size: 80mm ${mm}mm; margin: 4mm 3mm; }` : '@page { size: A4; margin: 14mm; }';
  window.print();
}
window.addEventListener('afterprint', () => document.documentElement.classList.remove('receipt'));
$('#print-a4').addEventListener('click', () => print(false));
$('#print-receipt').addEventListener('click', () => print(true));

(async () => {
  if (!id || !/^[A-Za-z0-9]{10,40}$/.test(id)) return status("This bill link isn't complete. Ask us on WhatsApp for a fresh one.");
  try {
    const snap = await getDoc(doc(getFirestore(initializeApp(firebaseConfig)), 'bills', id));
    if (!snap.exists()) return status("We can't find this bill. Ask us on WhatsApp.");
    render(snap.data());
    if (params.get('print') === 'receipt') setTimeout(() => print(true), 300);
  } catch (e) { status("Couldn't load the bill right now. Try again in a minute."); }
})();
