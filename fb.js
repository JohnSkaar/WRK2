// Felles Firebase-oppsett for oversikt.html (via cloud.js) og konto.html.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyBxfixz2HjuZmz1LUYKRNXuJB03n0fWrSU',
  authDomain: 'wrk2-utkikk.firebaseapp.com',
  projectId: 'wrk2-utkikk',
  storageBucket: 'wrk2-utkikk.firebasestorage.app',
  messagingSenderId: '697255744604',
  appId: '1:697255744604:web:6a0c45285d9403a49e4299'
};
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
auth.languageCode = 'no';
export const useEmulator = location.hostname === 'localhost' && new URLSearchParams(location.search).has('emulator');
if (useEmulator) connectAuthEmulator(auth, 'http://localhost:9099', {disableWarnings: true});
