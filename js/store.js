import { db } from './firebase.js';
import { collection, query, where, getDocs, doc, getDoc, writeBatch, addDoc, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $ = (id) => document.getElementById(id);
const bn = (n) => Number(n).toLocaleString('bn-BD');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eff = (p) => p.discountType === 'percent' ? Math.floor(p.pricePerKg * (100 - p.discountValue) / 100) : p.discountType === 'fixed' ? p.pricePerKg - p.discountValue : p.pricePerKg; // কার্যকর দাম/কেজি (rules-এও একই সূত্র)
const hasDisc = (p) => eff(p) < p.pricePerKg;
const discLabel = (p) => p.discountType === 'percent' ? `${bn(p.discountValue)}% ছাড়` : `৳${bn(p.discountValue)}/কেজি ছাড়`;
const MAX_ITEMS = 6; // Firestore rules একবারে সর্বোচ্চ ৬ ধরনের আম যাচাই করে
let products = [], settings = {}, cart = {}, sel = {};
const qlabel = (n) => `${bn(n)}x`, kglabel = (n) => `${bn(n * pk())} কেজি`;
const pk = () => settings.packageKg || 11, maxPk = () => Math.max(1, Math.floor(200 / pk())), pkgOK = () => true; // একটি আইটেমে সর্বোচ্চ ২০০ কেজি (rules-এর সীমা)
try { cart = JSON.parse(localStorage.getItem('sa_cart') || '{}'); } catch { cart = {}; }
const save = () => { try { localStorage.setItem('sa_cart', JSON.stringify(cart)); } catch {} };

async function load() {
  $('status').textContent = 'আম লোড হচ্ছে…';
  try {
    const [ps, ss] = await Promise.all([getDocs(query(collection(db, 'products'), where('active', '==', true))), getDoc(doc(db, 'settings/store'))]);
    products = ps.docs.map((d) => ({ id: d.id, ...d.data() })); settings = ss.exists() ? ss.data() : {};
    $('status').textContent = products.length ? '' : 'এখনো কোনো আম যোগ করা হয়নি।';
    $('deliveryNote').textContent = settings.deliveryNote || 'ডেলিভারি তথ্য শীঘ্রই যোগ হবে।';
    if (settings.contactPhone) $('contactInfo').textContent = 'ফোন: ' + settings.contactPhone + ' • সাপাহার, নওগাঁ';
    // ডিস্ক-এ থাকা পুরনো কার্টের অবৈধ পণ্য বাদ
    for (const id of Object.keys(cart)) { const p = products.find((x) => x.id === id); if (!p) { delete cart[id]; continue; } cart[id] = Math.min(Math.floor(cart[id] / pk()), maxPk(p)) * pk(); if (cart[id] < 1) delete cart[id]; }
  } catch (e) { $('status').innerHTML = '<div class="msg err">ডেটা লোড করা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।</div>'; }
  render(); renderCart();
}
function render() {
  const l = [...products].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)); // Admin-এর দেওয়া ক্রম অনুযায়ী
  $('grid').innerHTML = l.map((p) => `<article class="card">${hasDisc(p) ? `<span class="dbadge">${discLabel(p)}</span>` : ''}${p.imageUrl ? `<img src="${esc(p.imageUrl)}" alt="${esc(p.nameBn)}" loading="lazy" width="400" height="300">` : '<div class="ph" aria-hidden="true"><i class="fa-solid fa-leaf"></i></div>'}
<div class="bd"><h3 style="margin:0">${esc(p.nameBn)}</h3><small>${esc(p.nameEn)}</small><p style="margin:0">${esc(p.description)}</p>
<div class="price">${hasDisc(p) ? `<s class="old">৳${bn(p.pricePerKg)}</s>` : ''}৳${bn(eff(p))} / কেজি</div>${p.sample ? '<span class="tag">উদাহরণ দাম</span>' : ''}
<div class="qrow" role="group" aria-label="পরিমাণ"><span class="qg"><button class="btn alt sm xs" data-pdec="${p.id}" aria-label="কমান"><i class="fa-solid fa-minus" aria-hidden="true"></i></button><span class="qty" id="pq-${p.id}">${qlabel(sel[p.id] || 1)}</span><button class="btn alt sm xs" data-pinc="${p.id}" aria-label="বাড়ান"><i class="fa-solid fa-plus" aria-hidden="true"></i></button></span><span class="qkg" id="pk-${p.id}">${kglabel(sel[p.id] || 1)}</span><span class="ptot">মোট দাম: <b id="pt-${p.id}">৳${bn(eff(p) * pk() * (sel[p.id] || 1))}</b>${hasDisc(p) ? `<span class="sv" id="sv-${p.id}">(সাশ্রয় ৳${bn((p.pricePerKg - eff(p)) * pk() * (sel[p.id] || 1))})</span>` : ''}</span></div>${p.soldOut ? '<button class="btn" disabled>স্টক শেষ</button>' : `<button class="btn alt" data-add="${p.id}">কার্টে যোগ করুন</button>
<button class="btn" data-buy="${p.id}">এখনই অর্ডার করুন</button>`}</div></article>`).join('') || '<p>কোনো আম পাওয়া যায়নি।</p>';
}
function add(id) {
  const p = products.find((x) => x.id === id); if (!p || p.soldOut || !pkgOK(p)) return;
  if (!cart[id] && Object.keys(cart).length >= MAX_ITEMS) { alert(`একবারে সর্বোচ্চ ${MAX_ITEMS} ধরনের আম অর্ডার করা যায়।`); return; }
  cart[id] = Math.min((cart[id] || 0) + (sel[id] || 1) * pk(), maxPk(p) * pk()); save(); renderCart();
}
function calc() { // প্রদর্শন ও অর্ডার তৈরির হিসাব; Firestore rules একই হিসাব মিলিয়ে দেখে, না মিললে অর্ডার প্রত্যাখ্যাত
  let sub = 0, kg = 0; for (const [id, q] of Object.entries(cart)) { const p = products.find((x) => x.id === id); if (p) { sub += eff(p) * q; kg += q; } }
  const del = kg ? Math.ceil(kg / (settings.packageKg || 11)) * (settings.deliveryChargePerPackage ?? 120) : 0; return { sub, kg, del, total: sub + del };
}
function need() { // Firestore rules-এও একই নিয়ম যাচাই হয়; এটি শুধু ব্যবহারকারীকে আগে জানায়
  const kg = calc().kg, min = settings.minOrderKg || 0, pk = settings.packageKg || 11;
  if (settings.ordersOpen === false) return 'এখন অর্ডার গ্রহণ বন্ধ আছে';
  if (Object.keys(cart).length > MAX_ITEMS) return `একবারে সর্বোচ্চ ${MAX_ITEMS} ধরনের আম অর্ডার করা যায়`;
  if (kg < min) return `সর্বনিম্ন ${Math.ceil(min / pk)}x অর্ডার করতে হবে`;
  if (kg % pk) return 'পরিমাণ প্যাকেজ অনুযায়ী (1x, 2x…) হতে হবে';
  return '';
}
function renderCart() {
  const ids = Object.keys(cart); $('cartCount').textContent = bn(ids.length); $('cartCount').hidden = !ids.length; $('cartBtn').setAttribute('aria-label', ids.length ? `কার্ট, ${bn(ids.length)}টি আম` : 'কার্ট');
  $('cartLines').innerHTML = ids.length ? ids.map((id) => { const p = products.find((x) => x.id === id); return `<div class="line"><span>${esc(p.nameBn)}</span>
<span class="row"><button class="btn alt sm" data-dec="${id}" aria-label="কমান"><i class="fa-solid fa-minus" aria-hidden="true"></i></button><span class="qty">${cart[id] / pk()}x<br><small>৳${bn(eff(p) * cart[id])}</small></span><button class="btn alt sm" data-inc="${id}" aria-label="বাড়ান"><i class="fa-solid fa-plus" aria-hidden="true"></i></button><button class="btn sm" data-rm="${id}" aria-label="সরান"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></span></div>`; }).join('') : '<p>আপনার কার্ট খালি। আম বেছে নিন।</p>';
  const t = calc(); $('totals').innerHTML = ids.length ? `<p>কার্টে আম: ${bn(ids.length)}টি<br>সাবটোটাল: ৳${bn(t.sub)}<br>ডেলিভারি (আনুমানিক): ৳${bn(t.del)}<br><b>মোট: ৳${bn(t.total)}</b><br><small>অর্ডারের সময় দাম আবার যাচাই হবে।</small></p>` : '';
  const w = ids.length ? need() : '';
  if (w) $('totals').insertAdjacentHTML('beforeend', `<div class="msg err" role="alert">${esc(w)}</div>`);
  $('toCheckout').hidden = !ids.length; $('toCheckout').disabled = !!w; $('submitBtn').disabled = !!w;
}
const openCart = () => $('drawer').classList.add('open');
document.addEventListener('click', (e) => {
  const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
  if (d.add) { add(d.add); openCart(); } else if (d.buy) { add(d.buy); openCart(); showCheckout(); }
  else if (d.inc) { const p = products.find((x) => x.id === d.inc); if (cart[d.inc] + pk() <= maxPk(p) * pk()) cart[d.inc] += pk(); save(); renderCart(); }
  else if (d.pinc || d.pdec) { const id = d.pinc || d.pdec, p = products.find((x) => x.id === id); sel[id] = Math.max(1, Math.min(maxPk(p), (sel[id] || 1) + (d.pinc ? 1 : -1))); $('pq-' + id).textContent = qlabel(sel[id]); $('pk-' + id).textContent = kglabel(sel[id]); $('pt-' + id).textContent = '৳' + bn(eff(p) * pk() * sel[id]); if ($('sv-' + id)) $('sv-' + id).textContent = `(সাশ্রয় ৳${bn((p.pricePerKg - eff(p)) * pk() * sel[id])})`; }
  else if (d.dec) { cart[d.dec] -= pk(); if (cart[d.dec] < 1) delete cart[d.dec]; save(); renderCart(); }
  else if (d.rm) { delete cart[d.rm]; save(); renderCart(); }
});
$('cartBtn').onclick = openCart; $('orderNow').onclick = () => { openCart(); showCheckout(); };
$('closeCart').onclick = () => $('drawer').classList.remove('open');
function showCheckout() { $('orderMsg').textContent = ''; if (Object.keys(cart).length && !need()) { $('checkout').hidden = false; $('toCheckout').hidden = true; payInfo(); } }
$('toCheckout').onclick = showCheckout;
function payInfo() {
  const m = $('pm').value, num = m === 'bkash' ? settings.bkashNumber : m === 'nagad' ? settings.nagadNumber : '';
  $('trxWrap').hidden = m === 'cod';
  $('payInfo').innerHTML = m === 'cod' ? '' : num ? `<div class="msg ok">${m} নম্বর: <b>${esc(num)}</b>। টাকা পাঠিয়ে Transaction ID দিন। দোকান যাচাই না করা পর্যন্ত পেমেন্ট "Pending" থাকবে।</div>` : '<div class="msg err">এই পেমেন্ট নম্বর এখনো সেট করা হয়নি। ক্যাশ অন ডেলিভারি বেছে নিন।</div>';
}
$('pm').onchange = payInfo;
// অর্ডার আইডি একবার বানানো হয়; নেটওয়ার্ক-ব্যর্থতায় আবার চাপলে একই আইডি ব্যবহার হয় (একই ডকুমেন্ট, ডুপ্লিকেট নয়)
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const waLink = (txt) => { const d = String(settings.contactPhone || '').replace(/\D/g, ''); if (!d) return ''; const n = d.startsWith('880') ? d : d.startsWith('0') ? '88' + d : '880' + d; return `https://wa.me/${n}?text=${encodeURIComponent(txt)}`; };
let lastOrder = null; try { lastOrder = JSON.parse(localStorage.getItem('sa_last') || 'null'); } catch {}
const newOrderId = () => 'SA-' + [...crypto.getRandomValues(new Uint8Array(5))].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
let pendingId = null, netFailed = false;
const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), ms))]);
$('checkout').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = new FormData(e.target), msg = $('orderMsg'), btn = $('submitBtn');
  const phone = String(f.get('phone') || '').trim();
  if (!/^01[3-9]\d{8}$/.test(phone)) { msg.innerHTML = '<div class="msg err">সঠিক মোবাইল নম্বর দিন (01XXXXXXXXX)</div>'; return; }
  if (need()) { msg.innerHTML = `<div class="msg err">${esc(need())}</div>`; return; }
  const method = f.get('paymentMethod'), trx = method === 'cod' ? '' : String(f.get('transactionId') || '').trim();
  if (method !== 'cod' && !trx) { msg.innerHTML = '<div class="msg err">Transaction ID দিন</div>'; return; }
  // আইটেম productId অনুযায়ী সাজানো (rules ক্রমবর্ধমান ক্রম চায়)
  const items = Object.keys(cart).sort().map((id) => { const p = products.find((x) => x.id === id), q = cart[id];
    return { productId: id, nameBn: p.nameBn, qtyKg: q, pricePerKg: eff(p), lineTotal: eff(p) * q }; });
  const t = calc(); pendingId ||= newOrderId();
  const order = { orderId: pendingId, customerName: String(f.get('name') || '').trim(), phone,
    district: String(f.get('district') || '').trim(), upazila: String(f.get('upazila') || '').trim(), address: String(f.get('address') || '').trim(),
    items, subtotal: t.sub, deliveryCharge: t.del, total: t.total, totalKg: t.kg, paymentMethod: method, paymentStatus: 'pending', orderStatus: 'pending',
    transactionId: trx, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  btn.disabled = true; msg.textContent = 'অর্ডার পাঠানো হচ্ছে…';
  try {
    // অর্ডার + ট্র্যাকিং ডকুমেন্ট একসাথে (একটি batch); ট্র্যাকিং ডকুমেন্টে ঠিকানা/ফোন নেই, শুধু ফোনের হ্যাশ
    const b = writeBatch(db);
    b.set(doc(db, 'orders', pendingId), order);
    b.set(doc(db, 'tracking', pendingId), { orderId: pendingId, orderStatus: 'pending', paymentStatus: 'pending', total: t.total,
      itemsText: items.map((i) => `${i.nameBn} × ${bn(i.qtyKg)} কেজি`).join(', '), phoneHash: await sha(`${pendingId}:${phone}`), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    await withTimeout(b.commit(), 20000);
    cart = {}; save(); const id = pendingId; lastOrder = { id, phone }; try { localStorage.setItem('sa_last', JSON.stringify(lastOrder)); } catch {} pendingId = null; netFailed = false; renderCart(); e.target.hidden = true;
    msg.innerHTML = `<div class="msg ok"><b>অর্ডার সফল!</b><br>অর্ডার আইডি: <b>${esc(id)}</b><br>সংরক্ষণ করে রাখুন।<br>
${items.map((i) => `${esc(i.nameBn)} × ${i.qtyKg / pk()}x = ৳${bn(i.lineTotal)}`).join('<br>')}<br>ডেলিভারি: ৳${bn(order.deliveryCharge)} • <b>মোট: ৳${bn(order.total)}</b><br>পেমেন্ট: যাচাইয়ের অপেক্ষায়</div>
<div class="row" style="margin-top:8px"><a class="btn alt" href="#track" data-gotrack="${esc(id)}"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> অর্ডার ট্র্যাক করুন</a>${waLink(`আসসালামু আলাইকুম, আমি ${order.customerName}। আমার অর্ডার আইডি ${id}, মোট ৳${bn(order.total)}।`) ? `<a class="btn" target="_blank" rel="noopener" href="${esc(waLink(`আসসালামু আলাইকুম, আমি ${order.customerName}। আমার অর্ডার আইডি ${id}, মোট ৳${bn(order.total)}।`))}"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp-এ জানান</a>` : ''}</div>`;
    msg.scrollIntoView({ behavior: 'smooth', block: 'center' }); load();
  } catch (err) {
    console.error('order failed:', err.code, err.message);
    let m;
    if (err.code === 'permission-denied' && netFailed) m = `আপনার আগের চেষ্টাতেই অর্ডারটি জমা হয়ে থাকতে পারে (আইডি: ${pendingId})। নিশ্চিত হতে দোকানে ফোন করুন; না হলে পেজ রিফ্রেশ করে আবার অর্ডার দিন।`;
    else if (err.code === 'permission-denied') { m = 'অর্ডার গ্রহণ করা যায়নি: আমের দাম বদলে গেছে বা আমটি আর তালিকায় নেই, কিংবা অর্ডার বন্ধ হয়ে গেছে হতে পারে। তালিকা নতুন করে লোড করা হলো — কার্ট দেখে আবার চেষ্টা করুন।'; netFailed = false; load(); }
    else { netFailed = true; m = 'ইন্টারনেট সমস্যায় অর্ডার নিশ্চিত হয়নি। আবার "অর্ডার নিশ্চিত করুন" চাপুন (একই অর্ডার আইডি ব্যবহার হবে)। (কোড: ' + (err.code || err.name || 'unknown') + ')'; }
    msg.innerHTML = `<div class="msg err">${esc(m)}</div>`; msg.scrollIntoView({ block: 'center' });
  }
  finally { btn.disabled = !!need(); }
});
// ---------- অর্ডার ট্র্যাকিং ----------
const STEPS = [['pending', 'অর্ডার পাওয়া গেছে'], ['confirmed', 'অর্ডার নিশ্চিত হয়েছে'], ['processing', 'প্যাকেজিং চলছে'], ['shipped', 'পাঠানো হয়েছে'], ['delivered', 'ডেলিভারি সম্পন্ন']];
const PAYL = { pending: 'পেমেন্ট যাচাইয়ের অপেক্ষায়', paid: 'পেমেন্ট গৃহীত', failed: 'পেমেন্ট ব্যর্থ', refunded: 'টাকা ফেরত দেওয়া হয়েছে' };
async function track(id, phone) {
  const out = $('trackOut'), bad = (m) => (out.innerHTML = `<div class="msg err">${esc(m)}</div>`);
  id = String(id || '').trim().toUpperCase(); phone = String(phone || '').trim();
  if (!/^SA-[0-9A-F]{10}$/.test(id) || !/^01[3-9]\d{8}$/.test(phone)) return bad('অর্ডার আইডি (SA-XXXXXXXXXX) ও মোবাইল নম্বর সঠিকভাবে দিন।');
  out.textContent = 'খোঁজা হচ্ছে…';
  try {
    const s = await getDoc(doc(db, 'tracking', id)), d = s.exists() ? s.data() : null;
    if (!d || d.phoneHash !== await sha(`${id}:${phone}`)) return bad('এই আইডি ও নম্বর দিয়ে কোনো অর্ডার পাওয়া যায়নি। আইডি ও নম্বর আবার মিলিয়ে দেখুন।');
    const cur = STEPS.findIndex((x) => x[0] === d.orderStatus), dt = d.createdAt?.toDate ? d.createdAt.toDate().toLocaleDateString('bn-BD') : '';
    const steps = d.orderStatus === 'cancelled' ? '<div class="msg err"><b>এই অর্ডারটি বাতিল হয়েছে।</b> বিস্তারিত জানতে আমাদের সাথে যোগাযোগ করুন।</div>'
      : `<ol class="steps">${STEPS.map(([k, l], i) => `<li class="${i < cur ? 'done' : i === cur ? 'now' : ''}">${esc(l)}</li>`).join('')}</ol>`;
    out.innerHTML = `<div class="msg ok"><b>অর্ডার ${esc(d.orderId)}</b>${dt ? ' • ' + dt : ''}<br>${esc(d.itemsText)}<br>মোট: ৳${bn(d.total)} • ${esc(PAYL[d.paymentStatus] || '')}${d.courierInfo ? '<br>🚚 কুরিয়ার: ' + esc(d.courierInfo) : ''}</div>${steps}`;
  } catch (e) { console.error('track failed', e.code, e.message); bad('তথ্য আনা যায়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।'); }
}
$('trackForm').addEventListener('submit', (e) => { e.preventDefault(); track($('trackId').value, $('trackPhone').value); });
$('orderMsg').addEventListener('click', (e) => { const a = e.target.closest('a[data-gotrack]'); if (!a) return; $('drawer').classList.remove('open'); $('trackId').value = a.dataset.gotrack; if (lastOrder) $('trackPhone').value = lastOrder.phone; track(a.dataset.gotrack, lastOrder?.phone); });
if (lastOrder) { $('trackId').value = lastOrder.id; $('trackPhone').value = lastOrder.phone; }
load();

// ---------- গ্রাহকের রিভিউ (Admin অনুমোদন করলে তবেই দেখায়) ----------
async function loadReviews() {
  try {
    const s = await getDocs(query(collection(db, 'reviews'), where('status', '==', 'approved'), limit(30)));
    const l = s.docs.map((d) => d.data()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    $('revGrid').innerHTML = l.map((r) => `<div class="rev"><div class="st" aria-label="${r.rating} স্টার">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div><p>${esc(r.text)}</p><b>${esc(r.name)}</b></div>`).join('');
    $('revEmpty').hidden = l.length > 0;
  } catch (e) { console.error('reviews:', e.code, e.message); }
}
$('revForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = new FormData(e.target), msg = $('revMsg'), btn = $('revBtn');
  const bad = (m) => (msg.innerHTML = `<div class="msg err">${esc(m)}</div>`);
  if (f.get('website')) return; // স্প্যাম-বট ফাঁদ
  const name = String(f.get('rname') || '').trim(), text = String(f.get('rtext') || '').trim(), rating = Number(f.get('rrating'));
  if (!name || text.length < 5) return bad('নাম ও মন্তব্য (কমপক্ষে ৫ অক্ষর) লিখুন।');
  const last = Number(localStorage.getItem('sa_rev_ts') || 0); if (Date.now() - last < 300000) return bad('অনুগ্রহ করে ৫ মিনিট পরে আবার রিভিউ দিন।');
  btn.disabled = true; msg.textContent = 'জমা হচ্ছে…';
  try {
    await withTimeout(addDoc(collection(db, 'reviews'), { name, rating, text, status: 'pending', createdAt: serverTimestamp() }), 20000);
    try { localStorage.setItem('sa_rev_ts', String(Date.now())); } catch {}
    e.target.reset(); msg.innerHTML = '<div class="msg ok"><b>ধন্যবাদ!</b> আপনার রিভিউ জমা হয়েছে। অনুমোদনের পর এখানে দেখা যাবে।</div>';
  } catch (er) { console.error('review failed', er.code, er.message); bad('রিভিউ জমা হয়নি। ইন্টারনেট দেখে আবার চেষ্টা করুন।'); }
  finally { btn.disabled = false; }
});
loadReviews();
