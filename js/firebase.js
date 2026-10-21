import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initializeAppCheck, ReCaptchaV3Provider } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-check.js';
import { getAnalytics, isSupported } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js';
import { firebaseConfig, APPCHECK_SITE_KEY } from './config.js';
export const app = initializeApp(firebaseConfig);
if (APPCHECK_SITE_KEY) initializeAppCheck(app, { provider: new ReCaptchaV3Provider(APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
export const db = getFirestore(app);
// Analytics শুধু গ্রাহকের পেজে (Admin পেজে নয়)
if (!location.pathname.endsWith('admin.html')) isSupported().then((ok) => ok && getAnalytics(app)).catch(() => {});
// লোকাল Emulator দিয়ে টেস্ট: http://localhost:PORT/index.html?emulator=1 (শুধু localhost-এ কাজ করে)
if (['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).has('emulator')) connectFirestoreEmulator(db, '127.0.0.1', 8080);
