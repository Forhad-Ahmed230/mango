// চালান: npm i && npm run test:rules  (Java + Firebase emulator লাগবে)
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { doc, getDoc, setDoc, updateDoc, getDocs, collection, serverTimestamp, writeBatch } = require('firebase/firestore');
const { test, before, after } = require('node:test');
const fs = require('fs');
let env;
const prod = { nameBn: 'ল্যাংড়া', pricePerKg: 100, active: true };
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'sapahar-test', firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  await env.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'products/aaa'), prod); await setDoc(doc(d, 'products/bbb'), { ...prod, nameBn: 'হিমসাগর', pricePerKg: 120 });
    await setDoc(doc(d, 'products/hid'), { ...prod, active: false });
    await setDoc(doc(d, 'products/pct'), { ...prod, nameBn: 'আম্রপালি', pricePerKg: 99, discountType: 'percent', discountValue: 10 }); // কার্যকর ৮৯ (৮৯.১ → নিচে)
    await setDoc(doc(d, 'products/fix'), { ...prod, nameBn: 'বারি', pricePerKg: 100, discountType: 'fixed', discountValue: 15 }); // কার্যকর ৮৫
    await setDoc(doc(d, 'settings/store'), { deliveryChargePerPackage: 120, packageKg: 11, ordersOpen: true });
    await setDoc(doc(d, 'orders/SA-0000000001'), { orderId: 'SA-0000000001', orderStatus: 'pending', paymentStatus: 'pending', total: 1220, phone: '01700000000' });
  });
});
after(() => env.cleanup());
const anon = () => env.unauthenticatedContext().firestore();
const user = () => env.authenticatedContext('u1').firestore();
// firestore.rules-এ যে UID/ইমেইল বসাবেন, এখানেও তাই দিন
const ADMIN_UID = 'kLFjenATMOXQXqywd4prMOYuUwO2', ADMIN_EMAIL = 'contacts2forhad@gmail.com';
const admin = () => env.authenticatedContext(ADMIN_UID, { email: ADMIN_EMAIL }).firestore();
const otherAdminEmail = () => env.authenticatedContext(ADMIN_UID, { email: 'someone@gmail.com' }).firestore();
const order = (o = {}) => ({ orderId: 'SA-ABCDEF1234', customerName: 'রহিম', phone: '01712345678', district: 'নওগাঁ', upazila: 'সাপাহার', address: 'গ্রাম, ডাকঘর',
  items: [{ productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 11, pricePerKg: 100, lineTotal: 1100 }], subtotal: 1100, deliveryCharge: 120, total: 1220, totalKg: 11,
  paymentMethod: 'cod', paymentStatus: 'pending', orderStatus: 'pending', transactionId: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
const put = (db, o, id = 'SA-ABCDEF1234') => setDoc(doc(db, 'orders', id), o);

// প্রোডাক্ট/সেটিংস
test('anon: active product পড়তে পারে', () => assertSucceeds(getDoc(doc(anon(), 'products/aaa'))));
test('anon: inactive product পড়তে পারে না', () => assertFails(getDoc(doc(anon(), 'products/hid'))));
test('anon: product write নিষিদ্ধ', () => assertFails(setDoc(doc(anon(), 'products/aaa'), { ...prod, pricePerKg: 1 })));
test('anon: settings পড়তে পারে, লিখতে পারে না', async () => { await assertSucceeds(getDoc(doc(anon(), 'settings/store'))); await assertFails(setDoc(doc(anon(), 'settings/store'), { deliveryChargePerPackage: 0, packageKg: 11 })); });
test('সাধারণ লগইন user: admin নয়, product লিখতে পারে না', () => assertFails(setDoc(doc(user(), 'products/aaa'), prod)));
test('admin: product write ঠিক, ঋণাত্মক দাম প্রত্যাখ্যাত', async () => { await assertSucceeds(setDoc(doc(admin(), 'products/n'), prod)); await assertFails(setDoc(doc(admin(), 'products/n'), { ...prod, pricePerKg: -5 })); });
test('UID মিললেও ইমেইল না মিললে admin নয়', () => assertFails(getDocs(collection(otherAdminEmail(), 'orders'))));

// অর্ডার তৈরি
test('anon: সঠিক অর্ডার জমা হয়', () => assertSucceeds(put(anon(), order())));
test('anon: ২২ কেজি (২x) ডেলিভারি ২৪০', () => assertSucceeds(put(anon(), order({ orderId: 'SA-AAAAAAAAA1', items: [{ productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 22, pricePerKg: 100, lineTotal: 2200 }], subtotal: 2200, totalKg: 22, deliveryCharge: 240, total: 2440 }), 'SA-AAAAAAAAA1')));
test('দুই পণ্যের অর্ডার জমা হয়', () => assertSucceeds(put(anon(), order({ orderId: 'SA-BBBBBBBBB2', items: [{ productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 11, pricePerKg: 100, lineTotal: 1100 }, { productId: 'bbb', nameBn: 'হিমসাগর', qtyKg: 11, pricePerKg: 120, lineTotal: 1320 }], subtotal: 2420, totalKg: 22, deliveryCharge: 240, total: 2660 }), 'SA-BBBBBBBBB2')));
test('anon: ভুল (কম) দাম প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ items: [{ productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 11, pricePerKg: 1, lineTotal: 11 }], subtotal: 11, total: 131 }), 'SA-ABCDEF1234')));
test('anon: ডেলিভারি চার্জ কমানো প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ deliveryCharge: 0, total: 1100 }), 'SA-ABCDEF1234')));
test('anon: মোট কমানো প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ total: 100 }), 'SA-ABCDEF1234')));
test('anon: ১২ কেজি (প্যাকেজ নয়) প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ items: [{ productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 12, pricePerKg: 100, lineTotal: 1200 }], subtotal: 1200, totalKg: 12, total: 1440, deliveryCharge: 240 }), 'SA-ABCDEF1234')));
test('anon: inactive পণ্যের অর্ডার প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ items: [{ productId: 'hid', nameBn: 'ল্যাংড়া', qtyKg: 11, pricePerKg: 100, lineTotal: 1100 }] }), 'SA-ABCDEF1234')));
test('anon: paymentStatus paid দিয়ে শুরু প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ paymentStatus: 'paid' }), 'SA-ABCDEF1234')));
test('anon: অতিরিক্ত ফিল্ড প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ hack: 1 }), 'SA-ABCDEF1234')));
test('anon: ভুল ফোন নম্বর প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ phone: '12345' }), 'SA-ABCDEF1234')));
test('anon: bKash-এ Transaction ID ছাড়া প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ paymentMethod: 'bkash', transactionId: '' }), 'SA-ABCDEF1234')));
test('anon: ডকুমেন্ট আইডি ও orderId না মিললে প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ orderId: 'SA-ABCDEF1234' }), 'SA-ZZZZZZZZZZ')));
test('anon: একই পণ্য দুইবার (ডুপ্লিকেট) প্রত্যাখ্যাত', () => assertFails(put(anon(), order({ items: [{ productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 11, pricePerKg: 100, lineTotal: 1100 }, { productId: 'aaa', nameBn: 'ল্যাংড়া', qtyKg: 11, pricePerKg: 100, lineTotal: 1100 }], subtotal: 2200, totalKg: 22, deliveryCharge: 240, total: 2440 }), 'SA-ABCDEF1234')));
test('অর্ডার বন্ধ থাকলে প্রত্যাখ্যাত', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'settings/store'), { deliveryChargePerPackage: 120, packageKg: 11, ordersOpen: false }));
  await assertFails(put(anon(), order(), 'SA-ABCDEF1234'));
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'settings/store'), { deliveryChargePerPackage: 120, packageKg: 11, ordersOpen: true }));
});

// অর্ডার পড়া/বদলানো
test('anon ও সাধারণ user: orders পড়তে/list করতে পারে না', async () => { await assertFails(getDocs(collection(anon(), 'orders'))); await assertFails(getDoc(doc(user(), 'orders/SA-0000000001'))); });
test('anon: আগের অর্ডার বদলাতে পারে না', () => assertFails(updateDoc(doc(anon(), 'orders/SA-0000000001'), { orderStatus: 'delivered' })));
test('admin: orders পড়তে পারে', () => assertSucceeds(getDoc(doc(admin(), 'orders/SA-0000000001'))));
test('admin: status বদলাতে পারে', () => assertSucceeds(updateDoc(doc(admin(), 'orders/SA-0000000001'), { orderStatus: 'confirmed', updatedAt: serverTimestamp() })));
test('admin: total বদলাতে পারে না', () => assertFails(updateDoc(doc(admin(), 'orders/SA-0000000001'), { total: 1 })));
test('কেউ idempotency/অজানা কালেকশন পড়তে পারে না', () => assertFails(getDoc(doc(admin(), 'idempotency/x'))));
test('anon: অর্ডার মুছতে পারে না', () => assertFails(env.unauthenticatedContext().firestore() && require('firebase/firestore').deleteDoc(doc(anon(), 'orders/SA-0000000001'))));
test('admin: অর্ডার মুছতে পারে', () => assertSucceeds(require('firebase/firestore').deleteDoc(doc(admin(), 'orders/SA-0000000001'))));

// ট্র্যাকিং
const trk = (o = {}) => ({ orderId: 'SA-ABCDEF1234', orderStatus: 'pending', paymentStatus: 'pending', total: 1220, itemsText: 'ল্যাংড়া × ১১ কেজি', phoneHash: 'a'.repeat(64), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...o });
const both = (db, id, o, t) => { const b = writeBatch(db); b.set(doc(db, 'orders', id), o); b.set(doc(db, 'tracking', id), t); return b.commit(); };
test('অর্ডারের সাথে batch-এ ট্র্যাকিং তৈরি হয়', () => assertSucceeds(both(anon(), 'SA-ABCDEF1234', order(), trk())));
test('অর্ডার ছাড়া একা ট্র্যাকিং তৈরি প্রত্যাখ্যাত', () => assertFails(setDoc(doc(anon(), 'tracking/SA-CCCCCCCCC3'), trk({ orderId: 'SA-CCCCCCCCC3' }))));
test('ট্র্যাকিংয়ের total অর্ডারের সাথে না মিললে প্রত্যাখ্যাত', () => assertFails(both(anon(), 'SA-ABCDEF1234', order(), trk({ total: 1 }))));
test('anon: ট্র্যাকিং get পারে, list/update পারে না', async () => {
  await env.withSecurityRulesDisabled((c) => setDoc(doc(c.firestore(), 'tracking/SA-0000000001'), trk({ orderId: 'SA-0000000001', createdAt: new Date(), updatedAt: new Date() })));
  await assertSucceeds(getDoc(doc(anon(), 'tracking/SA-0000000001')));
  await assertFails(getDocs(collection(anon(), 'tracking')));
  await assertFails(updateDoc(doc(anon(), 'tracking/SA-0000000001'), { orderStatus: 'delivered' }));
});
test('admin: ট্র্যাকিং বদলাতে ও list করতে পারে', async () => { await assertSucceeds(updateDoc(doc(admin(), 'tracking/SA-0000000001'), { orderStatus: 'confirmed' })); await assertSucceeds(getDocs(collection(admin(), 'tracking'))); });

// ডিসকাউন্ট
const line = (id, nm, p) => [{ productId: id, nameBn: nm, qtyKg: 11, pricePerKg: p, lineTotal: p * 11 }];
const ord1 = (id, nm, p, oid) => order({ orderId: oid, items: line(id, nm, p), subtotal: p * 11, total: p * 11 + 120 });
test('শতাংশ ডিসকাউন্টের কার্যকর দামে (৮৯) অর্ডার চলে', () => assertSucceeds(put(anon(), ord1('pct', 'আম্রপালি', 89, 'SA-DDDDDDDDD4'), 'SA-DDDDDDDDD4')));
test('শতাংশ ডিসকাউন্ট থাকা পণ্যে আসল দামে (৯৯) অর্ডার প্রত্যাখ্যাত', () => assertFails(put(anon(), ord1('pct', 'আম্রপালি', 99, 'SA-EEEEEEEEE5'), 'SA-EEEEEEEEE5')));
test('টাকার ডিসকাউন্টের কার্যকর দামে (৮৫) অর্ডার চলে', () => assertSucceeds(put(anon(), ord1('fix', 'বারি', 85, 'SA-FFFFFFFFF6'), 'SA-FFFFFFFFF6')));
test('ডিসকাউন্ট থাকা পণ্যে আরও কম দামে অর্ডার প্রত্যাখ্যাত', () => assertFails(put(anon(), ord1('fix', 'বারি', 50, 'SA-A1A1A1A1A1'), 'SA-A1A1A1A1A1')));
test('admin: ভুল ডিসকাউন্ট (৯১%, দামের বেশি টাকা) প্রত্যাখ্যাত', async () => {
  await assertFails(setDoc(doc(admin(), 'products/n2'), { ...prod, discountType: 'percent', discountValue: 91 }));
  await assertFails(setDoc(doc(admin(), 'products/n3'), { ...prod, discountType: 'fixed', discountValue: 100 }));
  await assertSucceeds(setDoc(doc(admin(), 'products/n4'), { ...prod, discountType: 'percent', discountValue: 20 }));
});
// রিভিউ
const rv = (o = {}) => ({ name: 'রহিম', rating: 5, text: 'খুব ভালো আম', status: 'pending', createdAt: serverTimestamp(), ...o });
test('anon: pending রিভিউ জমা দিতে পারে', () => assertSucceeds(setDoc(doc(anon(), 'reviews/r1'), rv())));
test('anon: approved হিসেবে জমা প্রত্যাখ্যাত', () => assertFails(setDoc(doc(anon(), 'reviews/r2'), rv({ status: 'approved' }))));
test('anon: রেটিং ৬ প্রত্যাখ্যাত', () => assertFails(setDoc(doc(anon(), 'reviews/r3'), rv({ rating: 6 }))));
test('anon: শুধু approved রিভিউ পড়তে পারে', async () => {
  await env.withSecurityRulesDisabled(async (c) => { await setDoc(doc(c.firestore(), 'reviews/ra'), rv({ status: 'approved', createdAt: new Date() })); await setDoc(doc(c.firestore(), 'reviews/rp'), rv({ createdAt: new Date() })); });
  await assertSucceeds(getDoc(doc(anon(), 'reviews/ra')));
  await assertFails(getDoc(doc(anon(), 'reviews/rp')));
});
test('admin: রিভিউ অনুমোদন করতে পারে; anon পারে না', async () => { await assertSucceeds(updateDoc(doc(admin(), 'reviews/rp'), { status: 'approved', updatedAt: serverTimestamp() })); await assertFails(updateDoc(doc(anon(), 'reviews/ra'), { status: 'rejected' })); });
// নোট ও কুরিয়ার
test('admin: adminNote ও courierInfo বদলাতে পারে', () => assertSucceeds(updateDoc(doc(admin(), 'orders/SA-0000000001'), { adminNote: 'কুরিয়ারে দেওয়া হয়েছে', courierInfo: 'Sundarban 12345', updatedAt: serverTimestamp() })));
test('anon: adminNote লিখতে পারে না', () => assertFails(updateDoc(doc(anon(), 'orders/SA-0000000001'), { adminNote: 'x' })));
