// Firebase config - STEG 2: Bytt ut disse verdiene når Firebase-prosjektet er opprettet
// Se: https://console.firebase.google.com/

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDummyKey_REPLACE_THIS",
  authDomain: "wrk2-project.firebaseapp.com",
  projectId: "wrk2-project",
  storageBucket: "wrk2-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123def456"
};

// Initialisering av Firebase (når det skal knyttes til backend)
async function initializeFirebase() {
  console.log('Firebase config lastet. Klar for tilkobling i Steg 2.');
  // In future: firebase.initializeApp(FIREBASE_CONFIG);
}

// Funksjon for deling (Steg 2)
async function generateShareLink() {
  console.log('Deling av data - implementeres i Steg 2');
  // In future: Lagre til Firestore og generer del-link
}

// Funksjon for syncing til Firestore (Steg 2+)
async function syncToFirebase(aktiviteter) {
  console.log('Syncing til Firebase - implementeres i Steg 2');
  // In future: sync data til Firestore
}
