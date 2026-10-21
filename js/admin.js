import { app, db } from './firebase.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, setDoc, addDoc, deleteDoc, serverTimestamp, getCountFromServer, getAggregateFromServer, sum, runTransaction, writeBatch, updateDoc, onSnapshot, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const $ = (i) => document.getElementById(i), auth = getAuth(app);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bn = (n) => Number(n).toLocaleString('bn-BD');
const toast = (m, ok = true) => { $('toast').innerHTML = `<div class="msg ${ok ? 'ok' : 'err'}">${esc(m)}</div>`; setTimeout(() => ($('toast').textContent = ''), 5000); };
const PH = /^(01[3-9]\d{8})?$/;
let orders = [], cursor = null, products = [];

$('showPw').onchange = (e) => ($('pw').type = e.target.checked ? 'text' : 'password');
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('loginBtn').disabled = true; $('loginMsg').textContent = '';
  try { await signInWithEmailAndPassword(auth, $('em').value, $('pw').value); }
  catch { $('loginMsg').innerHTML = '<div class="msg err">ইমেইল বা পাসওয়ার্ড ভুল।</div>'; }
  finally { $('loginBtn').disabled = false; }
});
$('logout').onclick = () => { ordUnsub?.(); ordUnsub = null; seen = null; signOut(auth); };
onAuthStateChanged(auth, async (u) => {
  $('app').hidden = true; $('loginForm').hidden = !!u;
  if (!u) return;
  let ok = false; // UI গেট মাত্র: admin না হলে rules orders পড়তে দেয় না। আসল নিরাপত্তা firestore.rules-এ (ইমেইল + UID)
  try { await getDocs(query(collection(db, 'orders'), limit(1))); ok = true; } catch { ok = false; }
  if (!ok) { $('loginForm').hidden = false; $('loginMsg').innerHTML = '<div class="msg err">এই অ্যাকাউন্টে Admin অনুমতি নেই।</div>'; await signOut(auth); return; }
  $('app').hidden = false; show('dash'); watchOrders();
});
document.querySelector('.side').addEventListener('click', (e) => { const b = e.target.closest('[data-v]'); if (b) show(b.dataset.v); });
function show(v) {
  ['dash', 'prod', 'ord', 'rev', 'rep', 'set'].forEach((x) => { $('v-' + x).hidden = x !== v; });
  document.querySelectorAll('.side [data-v]').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  if (v === 'ord') clearBadge();
  ({ dash: stats, prod: loadProducts, ord: () => loadOrders(true), rev: loadReviews, rep: loadReport, set: loadSettings })[v]();
}
// ---------- রিভিউ মডারেশন ----------
const RL = { pending: 'অপেক্ষমাণ', approved: 'অনুমোদিত', rejected: 'লুকানো' };
let reviews = [];
async function loadReviews() {
  try {
    reviews = (await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(100)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    $('rBody').innerHTML = reviews.map((r) => `<tr><td>${esc(r.name)}<br><small>${esc(dstr(r))}</small></td><td><span style="color:#f08a24">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span><br>${esc(r.text)}</td><td><span class="rb ${esc(r.status)}">${RL[r.status] || esc(r.status)}</span></td>
<td><div style="display:flex;gap:6px;flex-wrap:wrap;min-width:150px">${r.status !== 'approved' ? `<button class="btn alt" data-rs="approved" data-id="${r.id}">অনুমোদন</button>` : ''}${r.status !== 'rejected' ? `<button class="btn" data-rs="rejected" data-id="${r.id}">লুকান</button>` : ''}<button class="btn sm" style="background:#c0392b;color:#fff" data-rdel="${r.id}" aria-label="রিভিউ মুছুন" title="মুছুন"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></td></tr>`).join('') || '<tr><td colspan="4">কোনো রিভিউ নেই।</td></tr>';
  } catch (e) { toast('রিভিউ লোড হয়নি: ' + (e.code || e.message), false); }
}
$('rBody').addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return; const id = b.dataset.id || b.dataset.rdel; if (!id) return;
  try {
    if (b.dataset.rdel) { if (!confirm('এই রিভিউ স্থায়ীভাবে মুছে ফেলবেন?')) return toast('মোছা বাতিল করা হয়েছে।'); await deleteDoc(doc(db, 'reviews', id)); toast('✅ রিভিউ মুছে ফেলা হয়েছে।'); }
    else { await updateDoc(doc(db, 'reviews', id), { status: b.dataset.rs, updatedAt: serverTimestamp() }); toast(b.dataset.rs === 'approved' ? '✅ রিভিউ অনুমোদিত — এখন ওয়েবসাইটে দেখাবে।' : '✅ রিভিউ লুকানো হয়েছে।'); }
  } catch (er) { toast('❌ ব্যর্থ: ' + (er.code === 'permission-denied' ? 'অনুমতি নেই (নতুন rules Publish করুন)' : er.message || er.code), false); }
  loadReviews();
});

// ---------- বিক্রির রিপোর্ট ----------
const bnd = (s) => String(s).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[d]);
const shortD = (k) => bnd(k.slice(8) + '/' + k.slice(5, 7));
function barSvg(rows) {
  const W = Math.max(520, rows.length * 36), H = 240, pl = 52, pb = 36, pt = 20, ch = H - pt - pb, max = Math.max(1, ...rows.map((r) => r.v));
  const p10 = 10 ** Math.floor(Math.log10(max)), top = Math.ceil(max / p10) * p10, bw = (W - pl - 8) / rows.length, step = Math.ceil(rows.length / 12);
  const grid = [0, 0.5, 1].map((k) => { const y = pt + ch * (1 - k); return `<line x1="${pl}" x2="${W - 8}" y1="${y}" y2="${y}" stroke="#d9e3dc"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#5b6b61">${bn(Math.round(top * k))}</text>`; }).join('');
  const bars = rows.map((r, i) => { const h = ch * r.v / top, x = pl + i * bw + bw * 0.18, w = bw * 0.64;
    return `<rect x="${x}" y="${pt + ch - h}" width="${w}" height="${Math.max(h, r.v ? 1 : 0)}" rx="3" fill="#1b8a45"><title>${r.l}: ৳${bn(r.v)}</title></rect>`
      + (rows.length <= 14 && r.v ? `<text x="${x + w / 2}" y="${pt + ch - h - 4}" text-anchor="middle" font-size="10" fill="#0b3d2e">${bn(r.v)}</text>` : '')
      + (i % step === 0 ? `<text x="${x + w / 2}" y="${H - 14}" text-anchor="middle" font-size="11" fill="#5b6b61">${r.l}</text>` : ''); }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:${Math.min(W, 520)}px" role="img" aria-label="বিক্রির চার্ট">${grid}${bars}</svg>`;
}
async function loadReport() {
  const days = Number($('rRange').value), group = $('rGroup').value;
  const addDays = (k, n) => { const d = new Date(k + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }), startKey = addDays(todayKey, -(days - 1));
  $('rStats').textContent = 'লোড হচ্ছে…';
  try {
    const s = await getDocs(query(collection(db, 'orders'), where('createdAt', '>=', Timestamp.fromDate(new Date(startKey + 'T00:00:00+06:00'))), orderBy('createdAt', 'desc'), limit(1000)));
    const all = s.docs.map((d) => d.data()), live = all.filter((o) => o.orderStatus !== 'cancelled');
    const wk = (k) => addDays(k, -((new Date(k + 'T00:00:00Z').getUTCDay() + 1) % 7)), bucket = group === 'week' ? wk : (k) => k, map = new Map();
    for (let i = 0; i < days; i++) { const b = bucket(addDays(startKey, i)); if (!map.has(b)) map.set(b, 0); }
    live.forEach((o) => { const k = dkey(o); if (k) { const b = bucket(k); map.set(b, (map.get(b) || 0) + o.total); } });
    const rev = live.reduce((a, o) => a + o.total, 0), kg = live.reduce((a, o) => a + o.totalKg, 0);
    $('rStats').innerHTML = [['অর্ডার (বাতিল বাদে)', bn(live.length), 'receipt', ''], ['মোট বিক্রি ৳', bn(rev), 'sack-dollar', ''], ['মোট কেজি', bn(kg), 'weight-hanging', 'b'], ['গড় অর্ডার ৳', bn(live.length ? Math.round(rev / live.length) : 0), 'calculator', 'y'], ['বাতিল অর্ডার', bn(all.length - live.length), 'ban', 'r']]
      .map(([l, n, ic, t]) => `<div class="stat ${t}"><b>${n}</b><span>${l}</span><i class="fa-solid fa-${ic}" aria-hidden="true"></i></div>`).join('') + (s.size >= 1000 ? '<div class="msg err" style="grid-column:1/-1">১০০০টি অর্ডারের সীমায় পৌঁছেছে; ছোট সময় বেছে নিন।</div>' : '');
    $('rChart').innerHTML = barSvg([...map].map(([k, v]) => ({ l: shortD(k), v })));
    const top = new Map(); live.forEach((o) => o.items.forEach((i) => { const m = top.get(i.nameBn) || { kg: 0, tk: 0 }; m.kg += i.qtyKg; m.tk += i.lineTotal; top.set(i.nameBn, m); }));
    const tl = [...top].sort((a, b) => b[1].kg - a[1].kg).slice(0, 8), mx = Math.max(1, ...tl.map((x) => x[1].kg));
    $('rTop').innerHTML = tl.length ? `<table><thead><tr><th>আম</th><th>কেজি</th><th>বিক্রি ৳</th><th></th></tr></thead><tbody>${tl.map(([n, m], i) => `<tr><td>${i === 0 ? '🏆 ' : ''}${esc(n)}</td><td>${bn(m.kg)}</td><td>৳${bn(m.tk)}</td><td style="width:35%"><div class="bar"><i style="width:${Math.round(m.kg / mx * 100)}%"></i></div></td></tr>`).join('')}</tbody></table>` : '<p>এই সময়ে কোনো বিক্রি নেই।</p>';
  } catch (e) { $('rStats').innerHTML = '<div class="msg err">রিপোর্ট লোড হয়নি: ' + esc(e.code || e.message) + '</div>'; }
}
['rRange', 'rGroup'].forEach((i) => $(i).addEventListener('change', loadReport));

// ---------- নতুন অর্ডারের শব্দ ও ব্যাজ (Admin পেজ খোলা থাকলে) ----------
let actx = null, soundOn = localStorage.getItem('sa_snd') !== '0', ordUnsub = null, seen = null, newCount = 0;
document.addEventListener('click', () => { try { actx ||= new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {} });
const paintSnd = () => { $('snd').textContent = soundOn ? '🔔 শব্দ: চালু' : '🔕 শব্দ: বন্ধ'; };
$('snd').onclick = () => { soundOn = !soundOn; try { localStorage.setItem('sa_snd', soundOn ? '1' : '0'); } catch {} paintSnd(); if (soundOn) beep(); }; paintSnd();
function beep() { if (!soundOn || !actx) return; try { [0, 0.22].forEach((t) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination); g.gain.setValueAtTime(0.2, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.18); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.2); }); } catch {} }
function paintBadge() { $('ordBadge').hidden = !newCount; $('ordBadge').textContent = bn(newCount); document.title = (newCount ? `(${bn(newCount)}) নতুন অর্ডার • ` : '') + 'Admin'; }
function clearBadge() { newCount = 0; paintBadge(); }
function watchOrders() {
  if (ordUnsub) return;
  ordUnsub = onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), limit(5)), (snap) => {
    if (seen === null) { seen = new Set(snap.docs.map((d) => d.id)); return; } // প্রথম স্ন্যাপশট শুধু ভিত্তি
    let fresh = 0;
    snap.docChanges().forEach((c) => { if (c.type !== 'added' || seen.has(c.doc.id)) return; seen.add(c.doc.id); const t = c.doc.data().createdAt?.toDate?.(); if (!t || Date.now() - t < 120000) fresh++; });
    if (!fresh) return;
    if ($('v-ord').hidden) newCount += fresh; paintBadge(); beep(); toast(`🔔 ${bn(fresh)}টি নতুন অর্ডার এসেছে!`);
    if (!$('v-ord').hidden) loadOrders(true); if (!$('v-dash').hidden) stats();
  }, (er) => console.error('order watch:', er.code, er.message));
}
async function stats() {
  try {
    const O = collection(db, 'orders'), safe = (pr) => pr.catch((e) => { console.error('stats:', e.code, e.message); return null; }),
      c = (...w) => safe(getCountFromServer(query(O, ...w)).then((r) => r.data().count));
    const [all, pend, proc, ship, canc, pay, rev] = await Promise.all([c(), c(where('orderStatus', '==', 'pending')), c(where('orderStatus', 'in', ['confirmed', 'processing'])),
      c(where('orderStatus', 'in', ['shipped', 'delivered'])), c(where('orderStatus', '==', 'cancelled')), c(where('paymentStatus', '==', 'pending')),
      safe(getAggregateFromServer(query(O, where('paymentStatus', '==', 'paid')), { s: sum('total') }).then((r) => r.data().s || 0))]);
    const items = [['মোট অর্ডার', all, 'receipt', ''], ['নতুন অর্ডার', pend, 'bell', 'y'], ['প্রসেসিং/কনফার্মড', proc, 'spinner', 'b'], ['Shipped/Delivered', ship, 'truck-fast', ''], ['বাতিল', canc, 'ban', 'r'], ['Pending পেমেন্ট (বাতিলসহ)', pay, 'hourglass-half', 'y'], ['যাচাইকৃত বিক্রি ৳', rev, 'sack-dollar', '']];
    $('stats').innerHTML = items.map(([l, n, ic, t]) => `<div class="stat ${t}"><b>${n == null ? '—' : bn(n)}</b><span>${l}</span><i class="fa-solid fa-${ic}" aria-hidden="true"></i></div>`).join('');
  } catch (e) { $('stats').innerHTML = '<div class="msg err">পরিসংখ্যান লোড হয়নি: ' + esc(e.code || e.message) + '</div>'; }
}
const discEff = (p) => p.discountType === 'percent' ? Math.floor(p.pricePerKg * (100 - p.discountValue) / 100) : p.discountType === 'fixed' ? p.pricePerKg - p.discountValue : p.pricePerKg;
function discPreview() {
  const price = Number($('p-price').value), t = $('p-dtype').value, v = Number($('p-dval').value) || 0;
  $('p-dval').disabled = t === 'none';
  if (t === 'none' || !price) { $('p-dprev').textContent = ''; return; }
  const e = discEff({ pricePerKg: price, discountType: t, discountValue: v });
  $('p-dprev').textContent = `ডিসকাউন্টের পর দাম: ৳${bn(e)}/কেজি (আগের ৳${bn(price)}); ১১ কেজির প্যাকেজ ৳${bn(e * 11)}`;
}
['p-price', 'p-dtype', 'p-dval'].forEach((i) => $(i).addEventListener('input', discPreview));
async function loadProducts() {
  try {
    products = (await getDocs(query(collection(db, 'products'), orderBy('sortOrder'), limit(100)))).docs.map((d) => ({ id: d.id, ...d.data() }));
    $('pBody').innerHTML = products.map((p) => `<tr><td>${esc(p.nameBn)}${p.sample ? ' <small>(উদাহরণ)</small>' : ''}</td><td>${discEff(p) < p.pricePerKg ? `<s>৳${bn(p.pricePerKg)}</s> ৳${bn(discEff(p))}<br><small>${p.discountType === 'percent' ? bn(p.discountValue) + '% ছাড়' : '৳' + bn(p.discountValue) + '/কেজি ছাড়'}</small>` : '৳' + bn(p.pricePerKg)}</td><td>${p.active ? 'সক্রিয়' : 'নিষ্ক্রিয়'}${p.soldOut ? ' <span class="rb rejected">স্টক শেষ</span>' : ''}</td>
<td data-l="কাজ"><div class="acts"><button class="btn alt" data-sold="${p.id}">${p.soldOut ? 'স্টকে ফেরান' : 'স্টক শেষ'}</button><button class="btn alt" data-edit="${p.id}">এডিট</button><button class="btn" data-del="${p.id}">মুছুন</button></div></td></tr>`).join('') || '<tr><td colspan="5">কোনো পণ্য নেই।</td></tr>';
  } catch (e) { toast('পণ্য লোড হয়নি: ' + (e.code || e.message), false); }
}
$('pBody').addEventListener('click', async (e) => {
  const id = e.target.dataset.edit || e.target.dataset.del || e.target.dataset.sold; if (!id) return; const p = products.find((x) => x.id === id);
  if (e.target.dataset.sold) { try { await setDoc(doc(db, 'products', id), { soldOut: !p.soldOut, updatedAt: serverTimestamp() }, { merge: true }); toast(p.soldOut ? 'স্টকে ফেরানো হয়েছে' : 'স্টক শেষ করা হয়েছে — সাইটে অর্ডার বন্ধ'); } catch (er) { toast(er.code || er.message, false); } return loadProducts(); }
  if (e.target.dataset.edit) { $('p-id').value = id; $('p-nameBn').value = p.nameBn; $('p-nameEn').value = p.nameEn || ''; $('p-price').value = p.pricePerKg; $('p-img').value = p.imageUrl || ''; $('p-sort').value = p.sortOrder ?? 0; $('p-desc').value = p.description || ''; $('p-active').checked = p.active; $('p-sold').checked = !!p.soldOut; $('p-dtype').value = p.discountType || 'none'; $('p-dval').value = p.discountValue || 0; discPreview(); scrollTo(0, 0); }
  else if (confirm(`"${p.nameBn}" মুছে ফেলবেন? এটি ফেরানো যাবে না।`)) { try { await deleteDoc(doc(db, 'products', id)); toast('মুছে ফেলা হয়েছে'); loadProducts(); } catch (er) { toast(er.code, false); } }
});
$('pReset').onclick = () => { $('pForm').reset(); $('p-id').value = ''; discPreview(); };
$('pForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const price = Number($('p-price').value), img = $('p-img').value.trim(), name = $('p-nameBn').value.trim();
  if (!name || !Number.isInteger(price) || price < 0 ) return toast('নাম ও দাম সঠিক (পূর্ণসংখ্যা) দিন', false);
  const dtype = $('p-dtype').value; let dval = dtype === 'none' ? 0 : Number($('p-dval').value);
  if (dtype === 'percent' && (!Number.isInteger(dval) || dval < 1 || dval > 90)) return toast('শতাংশ ডিসকাউন্ট ১ থেকে ৯০-এর মধ্যে পূর্ণসংখ্যা হতে হবে', false);
  if (dtype === 'fixed' && (!Number.isInteger(dval) || dval < 1 || dval >= price)) return toast('টাকার ডিসকাউন্ট ১ বা তার বেশি এবং দামের চেয়ে কম পূর্ণসংখ্যা হতে হবে', false);
  if (img && !/^https:\/\//.test(img)) return toast('ছবির URL https:// দিয়ে শুরু হতে হবে', false);
  const data = { nameBn: name, nameEn: $('p-nameEn').value.trim(), description: $('p-desc').value.trim(), pricePerKg: price, discountType: dtype, discountValue: dval, imageUrl: img,
    active: $('p-active').checked, soldOut: $('p-sold').checked, sortOrder: Number($('p-sort').value) || 0, unit: 'kg', sample: false, updatedAt: serverTimestamp() };
  try {
    const id = $('p-id').value;
    if (id) await setDoc(doc(db, 'products', id), data, { merge: true }); else await addDoc(collection(db, 'products'), { ...data, createdAt: serverTimestamp() });
    toast('সংরক্ষিত'); $('pReset').click(); loadProducts();
  } catch (er) { toast('সংরক্ষণ ব্যর্থ: ' + (er.code || er.message), false); }
});
async function loadOrders(reset) {
  if (reset) { orders = []; cursor = null; }
  try {
    const s = await getDocs(query(collection(db, 'orders'), orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(25)));
    cursor = s.docs[s.docs.length - 1] || cursor; $('more').hidden = s.size < 25;
    orders.push(...s.docs.map((d) => d.data())); renderOrders();
  } catch (e) { toast('অর্ডার লোড হয়নি: ' + (e.code || e.message), false); }
}
const dstr = (o) => (o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka' }) : '');
const dkey = (o) => (o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }) : '');
const OS = { pending: 'অপেক্ষমাণ', confirmed: 'নিশ্চিত', processing: 'প্রস্তুত হচ্ছে', shipped: 'পাঠানো হয়েছে', delivered: 'ডেলিভারি হয়েছে', cancelled: 'বাতিল' };
const PS = { pending: 'অপেক্ষমাণ', paid: 'পরিশোধিত', failed: 'ব্যর্থ', refunded: 'ফেরত দেওয়া হয়েছে' };
const sel = (name, map, cur, id) => `<select data-${name}="${id}" aria-label="${name === 'ps' ? 'পেমেন্ট অবস্থা' : 'অর্ডার স্ট্যাটাস'}">${Object.entries(map).map(([v, l]) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const waNum = (p) => { const d = String(p).replace(/\D/g, ''); return d.startsWith('880') ? d : d.startsWith('0') ? '88' + d : '880' + d; };
const WA = { pending: 'অর্ডারটি পেয়েছি, শীঘ্রই নিশ্চিত করা হবে।', confirmed: 'অর্ডারটি নিশ্চিত করা হয়েছে।', processing: 'আপনার আম বাছাই ও প্যাক করা হচ্ছে।', shipped: 'অর্ডারটি কুরিয়ারে পাঠানো হয়েছে।', delivered: 'অর্ডারটি ডেলিভারি হয়েছে। আম কেমন লাগল জানালে খুশি হব।', cancelled: 'দুঃখিত, অর্ডারটি বাতিল করা হয়েছে।' };
const waMsg = (o) => `আসসালামু আলাইকুম ${o.customerName}, সাপাহার আমের হাট থেকে আপনার অর্ডার ${o.orderId} (মোট ৳${bn(o.total)}): ${WA[o.orderStatus] || OS[o.orderStatus] || o.orderStatus}${o.orderStatus === 'shipped' && o.courierInfo ? ' কুরিয়ার/ট্র্যাকিং: ' + o.courierInfo + '।' : ''}${o.orderStatus === 'shipped' && o.paymentMethod === 'cod' && o.paymentStatus !== 'paid' ? ' ডেলিভারির সময় ৳' + bn(o.total) + ' দিতে হবে।' : ''} ধন্যবাদ।`;
const itemsText = (o) => o.items.map((i) => `${i.nameBn} × ${bn(i.qtyKg)} কেজি`).join(', ');
function filtered() { const q = $('oq').value.trim().toLowerCase(), d = $('od').value; return orders.filter((o) => (!q || o.orderId.toLowerCase().includes(q) || o.phone.includes(q)) && (!d || dkey(o) === d)); }
function renderOrders() {
  $('oBody').innerHTML = filtered().map((o) => `<tr><td data-l="অর্ডার"><input type="checkbox" data-ck="${esc(o.orderId)}" ${selOrd.has(o.orderId) ? 'checked' : ''} aria-label="বাছাই করুন" style="width:auto;margin-right:6px">${esc(o.orderId)}<br><small>${esc(dstr(o))}</small></td><td data-l="গ্রাহক">${esc(o.customerName)}<br>${esc(o.phone)}<br><small>${esc(o.district)}, ${esc(o.upazila)}, ${esc(o.address)}</small></td>
<td data-l="আইটেম">${o.items.map((i) => esc(i.nameBn) + ' × ' + bn(i.qtyKg) + ' কেজি').join('<br>')}${o.courierInfo ? '<br><small>🚚 ' + esc(o.courierInfo) + '</small>' : ''}${o.adminNote ? '<br><small>📝 ' + esc(o.adminNote) + '</small>' : ''}</td><td data-l="মোট">৳${bn(o.total)}<br><small>ডেলি. ৳${bn(o.deliveryCharge)}</small></td>
<td data-l="পেমেন্ট">${esc(o.paymentMethod)}${o.transactionId ? '<br>TRX: ' + esc(o.transactionId) : ''}<br>${sel('ps', PS, o.paymentStatus, o.orderId)}</td><td data-l="স্ট্যাটাস">${sel('os', OS, o.orderStatus, o.orderId)}</td><td data-l="কাজ"><div style="display:flex;gap:6px;flex-wrap:wrap;min-width:136px"><button class="btn alt sm" data-print="${esc(o.orderId)}" aria-label="প্যাকিং স্লিপ প্রিন্ট" title="প্রিন্ট"><i class="fa-solid fa-print" aria-hidden="true"></i></button><a class="btn alt sm" style="text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${waNum(o.phone)}?text=${encodeURIComponent(waMsg(o))}" aria-label="WhatsApp-এ মেসেজ" title="WhatsApp"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i></a><a class="btn alt sm" style="text-decoration:none" href="tel:${esc(o.phone)}" aria-label="কল করুন" title="কল"><i class="fa-solid fa-phone" aria-hidden="true"></i></a><button class="btn alt sm" data-courier="${esc(o.orderId)}" aria-label="কুরিয়ার ট্র্যাকিং নম্বর" title="কুরিয়ার/ট্র্যাকিং"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i></button><button class="btn alt sm" data-note="${esc(o.orderId)}" aria-label="ইন্টারনাল নোট" title="ইন্টারনাল নোট"><i class="fa-solid fa-note-sticky" aria-hidden="true"></i></button><button class="btn sm" style="background:#c0392b;color:#fff" data-del="${esc(o.orderId)}" aria-label="অর্ডার ${esc(o.orderId)} মুছুন" title="অর্ডার মুছুন"><i class="fa-solid fa-trash" aria-hidden="true"></i></button></div></td></tr>`).join('') || '<tr><td colspan="7">কোনো অর্ডার নেই।</td></tr>';
  updateBulk();
}
const selOrd = new Set();
['oq', 'od'].forEach((i) => $(i).addEventListener('input', renderOrders)); $('more').onclick = () => loadOrders(false);
// ---------- একাধিক অর্ডার একসাথে (স্ট্যাটাস বদল / স্লিপ প্রিন্ট) ----------
function updateBulk() {
  [...selOrd].forEach((id) => { if (!orders.some((o) => o.orderId === id)) selOrd.delete(id); });
  const vis = filtered().map((o) => o.orderId); $('bulk').hidden = !selOrd.size; $('bcount').textContent = bn(selOrd.size) + 'টি বাছাই';
  $('bAll').checked = vis.length > 0 && vis.every((id) => selOrd.has(id));
}
$('oBody').addEventListener('change', (e) => { const c = e.target.dataset.ck; if (!c) return; e.target.checked ? selOrd.add(c) : selOrd.delete(c); updateBulk(); });
$('bAll').onchange = (e) => { filtered().forEach((o) => (e.target.checked ? selOrd.add(o.orderId) : selOrd.delete(o.orderId))); renderOrders(); };
$('bClear').onclick = () => { selOrd.clear(); renderOrders(); };
$('bPrint').onclick = () => { const l = orders.filter((o) => selOrd.has(o.orderId)); if (l.length) printSlips(l); };
$('bApply').onclick = async () => {
  const st = $('bst').value; if (!st || !selOrd.size) return toast('আগে নতুন স্ট্যাটাস বাছুন', false);
  let reason; if (st === 'cancelled') { reason = prompt('বাতিলের কারণ লিখুন'); if (!reason) return; }
  if (!confirm(`${bn(selOrd.size)}টি অর্ডার "${OS[st]}" করবেন?`)) return;
  let ok = 0, bad = 0; for (const id of [...selOrd]) { try { await setStatus({ orderId: id, orderStatus: st, reason }); ok++; } catch { bad++; } }
  selOrd.clear(); toast(`${bn(ok)}টি আপডেট হয়েছে` + (bad ? `, ${bn(bad)}টি হয়নি (বাতিল অর্ডার বদলানো যায় না)` : ''), !bad); loadOrders(true);
};
// অর্ডার স্ট্যাটাস/পেমেন্ট বদল + লগ (একটি Firestore transaction-এ)
async function setStatus({ orderId, orderStatus, paymentStatus, reason, adminNote, courierInfo }) {
  const ref = doc(db, 'orders', orderId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('অর্ডার নেই');
    const o = snap.data(), tref = doc(db, 'tracking', orderId), tsnap = await tx.get(tref); // সব read আগে, তারপর write
    if (o.orderStatus === 'cancelled' && orderStatus && orderStatus !== 'cancelled') throw new Error('বাতিল অর্ডার পুনরায় চালু করা যাবে না');
    const upd = { updatedAt: serverTimestamp() };
    if (paymentStatus) upd.paymentStatus = paymentStatus;
    if (orderStatus) upd.orderStatus = orderStatus;
    if (orderStatus === 'cancelled') upd.cancelReason = reason || '';
    if (adminNote !== undefined) upd.adminNote = adminNote;
    if (courierInfo !== undefined) upd.courierInfo = courierInfo;
    tx.update(ref, upd);
    const nOS = orderStatus || o.orderStatus, nPS = paymentStatus || o.paymentStatus; // গ্রাহকের ট্র্যাকিং পেজ একই সাথে হালনাগাদ (পুরনো অর্ডারে না থাকলে তৈরি)
    if (tsnap.exists()) tx.update(tref, { orderStatus: nOS, paymentStatus: nPS, ...(courierInfo !== undefined ? { courierInfo } : {}), updatedAt: serverTimestamp() });
    else tx.set(tref, { orderId: o.orderId, orderStatus: nOS, paymentStatus: nPS, total: o.total, itemsText: itemsText(o), phoneHash: await sha(`${o.orderId}:${o.phone}`), courierInfo: courierInfo ?? o.courierInfo ?? '', createdAt: o.createdAt, updatedAt: serverTimestamp() });
    if (orderStatus || paymentStatus) tx.set(doc(collection(db, 'orderStatusLogs')), { orderId: o.orderId, actor: auth.currentUser.uid,
      from: { orderStatus: o.orderStatus, paymentStatus: o.paymentStatus }, to: { orderStatus: orderStatus || null, paymentStatus: paymentStatus || null },
      reason: reason || '', at: serverTimestamp() });
  });
}
$('oBody').addEventListener('change', async (e) => {
  const t = e.target, id = t.dataset.os || t.dataset.ps; if (!id) return; const payload = { orderId: id };
  if (t.dataset.os) { payload.orderStatus = t.value; if (t.value === 'cancelled') { payload.reason = prompt('বাতিলের কারণ লিখুন'); if (!payload.reason) return loadOrders(true); } } else payload.paymentStatus = t.value;
  if (!confirm(`${id}: "${t.options[t.selectedIndex].text}" করবেন?`)) return loadOrders(true);
  try { await setStatus(payload); toast('আপডেট হয়েছে'); } catch (er) { toast(er.message || er.code, false); }
  loadOrders(true);
});
// প্যাকিং স্লিপ প্রিন্ট (লুকানো iframe; পপআপ ব্লকার সমস্যা নেই)
async function slipHtml(o) {
  let s = {}; try { s = (await getDoc(doc(db, 'settings/store'))).data() || {}; } catch {}
  const cod = o.paymentMethod === 'cod' && o.paymentStatus !== 'paid', pm = { cod: 'ক্যাশ অন ডেলিভারি', bkash: 'bKash', nagad: 'Nagad' }[o.paymentMethod] || o.paymentMethod;
  const rows = o.items.map((i) => `<tr><td>${esc(i.nameBn)}</td><td>${bn(i.qtyKg)} কেজি</td><td>৳${bn(i.pricePerKg)}</td><td>৳${bn(i.lineTotal)}</td></tr>`).join('');
  const html = `<!doctype html><html lang="bn"><head><meta charset="utf-8"><title>${esc(o.orderId)}</title><style>
@page{size:A5;margin:10mm}*{box-sizing:border-box}body{font-family:'Noto Sans Bengali','Hind Siliguri',Arial,sans-serif;color:#111;font-size:13px;margin:0}
h1{font-size:18px;margin:0}h2{font-size:14px;margin:14px 0 4px;border-bottom:1px solid #999;padding-bottom:3px}.top{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:6px}
table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #888;padding:5px 6px;text-align:left}td:nth-child(n+2),th:nth-child(n+2){text-align:right}
.tot{margin-top:8px;text-align:right;line-height:1.7}.due{margin-top:10px;border:2px solid #111;padding:8px;text-align:center;font-size:16px;font-weight:700}.small{color:#444;font-size:11px;margin-top:10px}
</style></head><body>
<div class="top"><div><h1>সাপাহার আমের হাট</h1>${s.contactPhone ? '<div>ফোন: ' + esc(s.contactPhone) + '</div>' : ''}</div><div style="text-align:right"><b>${esc(o.orderId)}</b><br>${esc(dstr(o))}</div></div>
<h2>প্রাপক</h2><div><b>${esc(o.customerName)}</b><br>মোবাইল: ${esc(o.phone)}<br>${esc(o.address)}, ${esc(o.upazila)}, ${esc(o.district)}</div>
<h2>আইটেম</h2><table><thead><tr><th>আম</th><th>পরিমাণ</th><th>দর/কেজি</th><th>দাম</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot">সাবটোটাল: ৳${bn(o.subtotal)}<br>ডেলিভারি চার্জ: ৳${bn(o.deliveryCharge)}<br><b>সর্বমোট: ৳${bn(o.total)}</b></div>
<div class="due">${cod ? 'ক্যাশ অন ডেলিভারি — প্রাপ্য টাকা: ৳' + bn(o.total) : 'পেমেন্ট: ' + esc(pm) + ' • ' + esc(PS[o.paymentStatus] || o.paymentStatus)}</div>
<div class="small">ধন্যবাদ! ডেলিভারির সময় পণ্য দেখে বুঝে নিন।</div></body></html>`;
  return html;
}
const printSlip = (o) => printSlips([o]);
async function printSlips(list) {
  const hs = []; for (const o of list) hs.push(await slipHtml(o));
  const head = hs[0].split('<body>')[0].replace('</style>', '.pb{page-break-after:always}</style>'), bodies = hs.map((h) => h.split('<body>')[1].split('</body>')[0]);
  const html = head + '<body>' + bodies.join('<div class="pb"></div>') + '</body></html>';
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'; document.body.appendChild(f);
  f.onload = () => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (er) { toast('প্রিন্ট চালু করা যায়নি: ' + er.message, false); } setTimeout(() => f.remove(), 60000); };
  f.srcdoc = html;
}
$('oBody').addEventListener('click', (e) => { const b = e.target.closest('button[data-print]'); if (!b) return; const o = orders.find((x) => x.orderId === b.dataset.print); if (o) printSlip(o); else toast('অর্ডার পাওয়া যায়নি', false); });
// ইন্টারনাল নোট ও কুরিয়ার/ট্র্যাকিং নম্বর (কুরিয়ার তথ্য গ্রাহক ট্র্যাকিং পেজেও দেখে)
$('oBody').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-note],button[data-courier]'); if (!b) return;
  const isC = !!b.dataset.courier, id = b.dataset.courier || b.dataset.note, o = orders.find((x) => x.orderId === id); if (!o) return;
  const v = prompt(isC ? 'কুরিয়ারের নাম ও ট্র্যাকিং নম্বর লিখুন (গ্রাহক ট্র্যাকিং পেজে দেখবে; খালি রাখলে মুছে যাবে)' : 'ইন্টারনাল নোট লিখুন (শুধু আপনি দেখবেন; খালি রাখলে মুছে যাবে)', (isC ? o.courierInfo : o.adminNote) || '');
  if (v === null) return;
  const val = v.trim().slice(0, isC ? 120 : 300);
  try { await setStatus({ orderId: id, ...(isC ? { courierInfo: val } : { adminNote: val }) }); toast(isC ? `✅ ${id}: কুরিয়ার তথ্য সংরক্ষিত হয়েছে (গ্রাহক ট্র্যাকিং পেজে দেখবে)` : `✅ ${id}: নোট সংরক্ষিত হয়েছে`); }
  catch (er) { toast('❌ সংরক্ষণ ব্যর্থ: ' + (er.message || er.code), false); }
  loadOrders(true);
});
// অর্ডার মোছা: নিশ্চিতকরণ পপআপ → মুছে ফেলা → স্পষ্ট সফল/ব্যর্থ বার্তা (মুছলে আর ফেরত আনা যায় না)
$('oBody').addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-del]'); if (!b) return;
  const id = b.dataset.del, o = orders.find((x) => x.orderId === id);
  const info = o ? `\nগ্রাহক: ${o.customerName} (${o.phone})\nমোট: ৳${bn(o.total)}\nস্ট্যাটাস: ${OS[o.orderStatus] || o.orderStatus}, পেমেন্ট: ${PS[o.paymentStatus] || o.paymentStatus}` : '';
  if (!confirm(`⚠️ অর্ডার ${id} স্থায়ীভাবে মুছে ফেলবেন?${info}\n\nএটি আর ফেরত আনা যাবে না।`)) return toast('মোছা বাতিল করা হয়েছে; অর্ডারটি আগের মতোই আছে।');
  b.disabled = true;
  try {
    const bt = writeBatch(db); bt.delete(doc(db, 'orders', id)); bt.delete(doc(db, 'tracking', id)); await bt.commit(); // অর্ডার + ট্র্যাকিং দুটোই
    try { await addDoc(collection(db, 'orderStatusLogs'), { orderId: id, actor: auth.currentUser.uid, action: 'deleted', reason: 'admin deleted order', at: serverTimestamp() }); } catch {}
    toast(`✅ অর্ডার ${id} সফলভাবে মুছে ফেলা হয়েছে।`);
  } catch (er) {
    console.error('delete failed', er.code, er.message);
    toast(`❌ অর্ডার ${id} মোছা যায়নি: ` + (er.code === 'permission-denied' ? 'অনুমতি নেই — নতুন firestore.rules Publish করা হয়েছে কি দেখুন।' : er.code === 'unavailable' ? 'ইন্টারনেট সংযোগ সমস্যা, আবার চেষ্টা করুন।' : (er.message || er.code || 'অজানা ত্রুটি')), false);
  }
  loadOrders(true);
});
$('csv').onclick = () => {
  const cell = (v) => { v = String(v ?? ''); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }; // CSV injection রোধ
  const rows = [['orderId', 'date', 'name', 'phone', 'district', 'upazila', 'address', 'items', 'subtotal', 'delivery', 'total', 'payMethod', 'payStatus', 'orderStatus']].concat(
    filtered().map((o) => [o.orderId, dstr(o), o.customerName, o.phone, o.district, o.upazila, o.address, o.items.map((i) => i.nameBn + ' ' + i.qtyKg + ' কেজি').join('; '), o.subtotal, o.deliveryCharge, o.total, o.paymentMethod, o.paymentStatus, o.orderStatus]));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' })); a.download = 'orders.csv'; a.click();
};
async function loadSettings() {
  try {
    const s = (await getDoc(doc(db, 'settings/store'))).data() || {}, set = (i, v) => ($(i).value = v ?? '');
    ['shopName', 'slogan', 'contactPhone', 'bkashNumber', 'nagadNumber'].forEach((k) => set('s-' + k, s[k]));
    set('s-charge', s.deliveryChargePerPackage ?? 120); set('s-pkg', s.packageKg ?? 11); set('s-min', s.minOrderKg ?? 0); set('s-note', s.deliveryNote); $('s-open').checked = s.ordersOpen !== false;
  } catch (e) { toast('সেটিংস লোড হয়নি', false); }
}
$('sForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const g = (i) => $('s-' + i).value.trim();
  const d = { shopName: g('shopName'), slogan: g('slogan'), contactPhone: g('contactPhone'), bkashNumber: g('bkashNumber'), nagadNumber: g('nagadNumber'),
    deliveryChargePerPackage: Number(g('charge')), packageKg: Number(g('pkg')), minOrderKg: Number(g('min')) || 0, deliveryNote: g('note'), ordersOpen: $('s-open').checked };
  if (![d.contactPhone, d.bkashNumber, d.nagadNumber].every((p) => PH.test(p))) return toast('ফোন/পেমেন্ট নম্বর সঠিক নয় (01XXXXXXXXX)', false);
  if (!(d.deliveryChargePerPackage >= 0) || !Number.isInteger(d.packageKg) || d.packageKg < 1) return toast('ডেলিভারি চার্জ/প্যাকেজ সঠিক দিন', false);
  if (!confirm('সেটিংস সংরক্ষণ করবেন? এটি সব গ্রাহকের জন্য প্রযোজ্য হবে।')) return;
  try { await setDoc(doc(db, 'settings/store'), { ...d, updatedAt: serverTimestamp() }, { merge: true }); toast('সেটিংস সংরক্ষিত'); } catch (er) { toast('ব্যর্থ: ' + (er.code || er.message), false); }
});

// ---------- সাইডবার (ড্রয়ার): ক্লিকে খোলা/বন্ধ; রিলোড করলে সবসময় বন্ধ (কিছু সেভ করা হয় না) ----------
const sideBtn = $('sideToggle'), appEl = $('app');
const paintSide = () => { const closed = appEl.classList.contains('collapsed'); sideBtn.setAttribute('aria-expanded', String(!closed)); sideBtn.title = closed ? 'মেনু খুলুন' : 'মেনু বন্ধ করুন'; sideBtn.querySelector('i').className = closed ? 'fa-solid fa-bars' : 'fa-solid fa-xmark'; };
sideBtn.onclick = () => { appEl.classList.toggle('collapsed'); paintSide(); };
document.querySelectorAll('.side [data-v], #logout').forEach((b) => { b.title = b.querySelector('span').textContent.trim(); });
paintSide();
