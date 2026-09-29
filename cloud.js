// Innlogging og database (Firebase Auth + Firestore). Lastes av oversikt.html når siden ikke åpnes som lokal fil.
import { app, auth, useEmulator } from './fb.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const db = getFirestore(app);
if (useEmulator) connectFirestoreEmulator(db, 'localhost', 8080);

const $ = id => document.getElementById(id);
const ERR = {
  'auth/invalid-credential': 'Feil e-post eller passord.',
  'auth/wrong-password': 'Feil e-post eller passord.',
  'auth/user-not-found': 'Feil e-post eller passord.',
  'auth/invalid-email': 'E-postadressen er ikke gyldig.',
  'auth/email-already-in-use': 'Det finnes allerede en konto med denne e-postadressen. Logg inn i stedet.',
  'auth/weak-password': 'Passordet må ha minst 6 tegn.',
  'auth/too-many-requests': 'For mange forsøk. Vent litt og prøv igjen.',
  'auth/network-request-failed': 'Får ikke kontakt med innloggingstjenesten. Sjekk nettforbindelsen.',
  'permission-denied': 'Du har ikke tilgang til dette.'
};
const errText = e => ERR[e && e.code] || (e && e.message) || String(e);

// ---------- innloggingsskjerm ----------
function lock() { document.body.classList.add('locked'); $('login-screen').hidden = false; }
function unlock() { document.body.classList.remove('locked'); $('login-screen').hidden = true; }
function view(state, info = '') {
  lock();
  const body = $('login-body');
  if (state === 'loading') { body.innerHTML = '<p class="muted">Laster …</p>'; return; }
  if (state === 'signin') {
    body.innerHTML = `<form id="login-form" autocomplete="on">
        <label>E-post<input type="email" id="li-email" autocomplete="username" required></label>
        <label>Passord<input type="password" id="li-pass" autocomplete="current-password" required minlength="6"></label>
        <div class="login-actions">
          <button class="btn primary" type="submit">Logg inn</button>
          <button class="btn" type="button" data-login="register">Opprett konto</button>
          <button class="link-btn" type="button" data-login="reset">Glemt passord?</button>
        </div>
        <p class="login-msg" id="login-msg">${esc(info)}</p>
        <p class="sub">Du må være invitert av en systemadministrator. Første gang velger du «Opprett konto» med e-postadressen du ble invitert med.</p>
      </form>`;
    return;
  }
  if (state === 'verify') {
    body.innerHTML = `<p>Vi har sendt en bekreftelseslenke til <b>${esc(info)}</b>. Åpne e-posten, trykk på lenken og deretter på knappen <b>«Bekreft e-postadressen»</b> på siden som åpnes. Kom så tilbake hit.</p>
      <div class="login-actions">
        <button class="btn primary" data-login="check">Jeg har bekreftet</button>
        <button class="btn" data-login="resend">Send lenken på nytt</button>
        <button class="btn" data-login="logout">Logg ut</button>
      </div>
      <p class="login-msg" id="login-msg"></p>
      <p class="sub">Finner du ikke e-posten, sjekk søppelpost.</p>`;
    return;
  }
  if (state === 'noaccess') {
    body.innerHTML = `<p>Du er logget inn som <b>${esc(info)}</b>, men har ikke fått tilgang til WRK2 ennå.</p>
      <p class="sub">Be en systemadministrator om å invitere denne e-postadressen under Admin, og logg inn på nytt.</p>
      <div class="login-actions"><button class="btn" data-login="logout">Logg ut</button></div>`;
    return;
  }
  body.innerHTML = `<p class="login-msg">${esc(info)}</p><div class="login-actions"><button class="btn" data-login="logout">Logg ut</button></div>`;
}
function msg(t) { const m = $('login-msg'); if (m) m.textContent = t; }

document.addEventListener('submit', async e => {
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  msg('Logger inn …');
  try { await signInWithEmailAndPassword(auth, $('li-email').value.trim(), $('li-pass').value); }
  catch (err) { msg(errText(err)); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-login]');
  if (!b) return;
  const act = b.dataset.login;
  try {
    if (act === 'register') {
      const email = $('li-email').value.trim(), pass = $('li-pass').value;
      if (!email || !pass) { msg('Skriv inn e-post og et passord (minst 6 tegn) først.'); return; }
      msg('Oppretter konto …');
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await sendEmailVerification(cred.user);
    } else if (act === 'reset') {
      const email = $('li-email').value.trim();
      if (!email) { msg('Skriv inn e-postadressen din først.'); return; }
      await sendPasswordResetEmail(auth, email);
      msg('Hvis e-postadressen har en konto, er det sendt en lenke for å lage nytt passord.');
    } else if (act === 'check') {
      await auth.currentUser.reload();
      if (!auth.currentUser.emailVerified) { msg('E-postadressen er ikke bekreftet ennå.'); return; }
      await auth.currentUser.getIdToken(true);
      handleUser(auth.currentUser);
    } else if (act === 'resend') {
      await sendEmailVerification(auth.currentUser);
      msg('Ny lenke er sendt.');
    } else if (act === 'logout') {
      await signOut(auth);
    }
  } catch (err) { msg(errText(err)); }
});
window.cloudSignOut = () => signOut(auth);

// ---------- dataformat ----------
// Firestore tillater ikke lister i lister, så områdepunktene lagres som {x, y}.
const pToDoc = ps => (ps || []).map(p => ({...p, omrade: p.omrade ? p.omrade.map(([x, y]) => ({x, y})) : null}));
const pFromDoc = ps => (ps || []).map(p => ({...p, omrade: p.omrade ? p.omrade.map(q => [q.x, q.y]) : null}));
// Aktiviteter lagres uten AT-er; a.at er en kjøretidsliste (ikke-tellbar) og blir ikke med i JSON.
function toDoc(a) {
  const c = JSON.parse(JSON.stringify(a));
  delete c.at;
  c.atFirmaer = [...new Set((a.at || []).map(t => t.firma))];
  return c;
}
// Eldre dokumenter kan ha AT-ene innebygd i aktiviteten; de flyttes til samlingen «at» av systemadministratoren.
function fromDoc(d) {
  const c = {...d};
  delete c.atFirmaer;
  if (Array.isArray(c.at)) c.at = c.at.map(t => ({...t, plasseringer: pFromDoc(t.plasseringer)}));
  return c;
}
function toATDoc(t, lookup = actById) {
  const c = JSON.parse(JSON.stringify(t));
  c.plasseringer = pToDoc(t.plasseringer);
  c.aktFirmaer = [...new Set(t.aktiviteter.map(id => (lookup(id) || {}).firma).filter(Boolean))];
  return c;
}
function fromATDoc(d) { const c = {...d}; delete c.aktFirmaer; c.plasseringer = pFromDoc(d.plasseringer); return c; }
function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
const settingsDoc = () => ({skrastrek: !!SETTINGS.skrastrek, metodesett: SETTINGS.metodesett || 0, registersett: SETTINGS.registersett || 0});
const userDoc = u => ({name: u.name, email: (u.email || '').toLowerCase(), firma: u.firma, rolle: u.rolle});

// ---------- innlogget bruker ----------
let unsubs = [], started = false, myUid = null;
let base = {akt: new Map(), ats: new Map(), firms: '', metoder: '', register: '', settings: '', users: new Map()};
let readOnly = '';

onAuthStateChanged(auth, user => handleUser(user));

async function handleUser(user) {
  unsubs.forEach(f => f()); unsubs = []; started = false; myUid = null;
  if (!user) { view('signin'); return; }
  if (!user.emailVerified) { view('verify', user.email); return; }
  view('loading');
  try {
    const profile = await ensureProfile(user);
    if (!profile) { view('noaccess', user.email); return; }
    startSync(user.uid);
  } catch (err) { view('error', 'Kunne ikke logge inn: ' + errText(err)); }
}

async function ensureProfile(user) {
  const email = user.email.toLowerCase();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  let inv = null;
  try { const s = await getDoc(doc(db, 'invites', email)); if (s.exists()) inv = s.data(); } catch (e) { /* ingen invitasjon */ }
  // Uten invitasjon forsøkes oppstart som første systemadministrator; sikkerhetsreglene tillater det bare for én e-postadresse.
  const profile = inv
    ? {name: inv.name || email.split('@')[0], email, firma: inv.firma, rolle: inv.rolle}
    : {name: email.split('@')[0], email, firma: 'Skanska', rolle: 'systemadmin'};
  try { await setDoc(ref, profile); }
  catch (e) { if (!inv && e.code === 'permission-denied') return null; throw e; }
  if (inv) { try { await deleteDoc(doc(db, 'invites', email)); } catch (e) { /* ryddes av admin */ } }
  return profile;
}

function startSync(uid) {
  myUid = uid;
  const st = {users: null, invites: [], firms: null, metoder: null, register: null, settings: null, akt: null, ats: null, atsDenied: false};
  let invitesOn = false, seeding = false, migrating = false;
  const fail = err => { view('error', 'Mistet kontakten med databasen: ' + errText(err)); };

  const apply = async () => {
    if (!st.users || !st.firms || !st.metoder || !st.register || !st.settings || !st.akt || !st.ats) return;
    const meDoc = st.users.find(u => u.id === uid);
    if (!meDoc) { unsubs.forEach(f => f()); unsubs = []; view('noaccess', auth.currentUser ? auth.currentUser.email : ''); return; }
    const sys = meDoc.rolle === 'systemadmin';
    if (sys && !invitesOn) {
      invitesOn = true;
      unsubs.push(onSnapshot(collection(db, 'invites'), s => { st.invites = s.docs.map(d => d.data()); apply(); }, () => {}));
    }
    if (sys && !seeding && (!st.akt.length || !st.firms.length || !st.metoder.length)) { seeding = true; await seed(st); return; }

    const acts = st.akt.map(fromDoc);
    const legacy = acts.some(a => Array.isArray(a.at) && a.at.length);
    let ats;
    if (st.ats.length || !legacy) { acts.forEach(a => { delete a.at; }); ats = st.ats.map(fromATDoc); readOnly = ''; }
    else {
      if (sys && !st.atsDenied && !migrating) { migrating = true; await migrateAts(acts); return; }
      ({ats} = splitLegacy(migrate(acts)));
      readOnly = st.atsDenied ? 'sikkerhetsreglene i Firebase må oppdateres (se firestore.rules).' : 'en systemadministrator må logge inn én gang for å oppgradere databasen.';
    }
    DATA = acts; ATS = ats;
    FIRMS = st.firms.length ? st.firms : DEFAULT_FIRMS.map(f => ({...f}));
    METHODS = st.metoder.length ? st.metoder : DEFAULT_METHODS.map(m => ({...m}));
    REGISTER = st.register;
    SETTINGS = {skrastrek: false, fuIkkeVurdert: true, metodesett: 0, registersett: 0, ...st.settings};
    normalizeAll();
    USERS = [...st.users, ...(sys ? st.invites.map(i => ({...i, id: 'invite:' + i.email, pending: true})) : [])];
    currentUserId = uid;
    base = {
      akt: new Map(DATA.map(a => [a.id, stable(toDoc(a))])),
      ats: new Map(ATS.map(t => [t.id, stable(toATDoc(t))])),
      firms: stable(FIRMS), metoder: stable(METHODS), register: stable(REGISTER), settings: stable(settingsDoc()),
      users: new Map(USERS.map(u => [u.id, stable(userDoc(u))]))
    };
    if (!started) { started = true; unlock(); startApp(); } else scheduleRender();
    if (readOnly) showToast('Endringer kan ikke lagres ennå: ' + readOnly);
    if (sys && !readOnly && (applyMetodesett() | applyRegistersett())) { window.cloudSync(); renderCurrent(); }
  };

  unsubs.push(onSnapshot(collection(db, 'users'), s => { st.users = s.docs.map(d => ({id: d.id, ...d.data()})); apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'firmaregister'), s => { st.register = s.exists() ? (s.data().list || []) : []; apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'metoder'), s => { st.metoder = s.exists() ? (s.data().list || []) : []; apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'firms'), s => { st.firms = s.exists() ? (s.data().list || []) : []; apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'settings'), s => { st.settings = s.exists() ? s.data() : {}; apply(); }, fail));
  unsubs.push(onSnapshot(collection(db, 'at'), s => { st.ats = s.docs.map(d => d.data()); st.atsDenied = false; apply(); },
    () => { st.ats = []; st.atsDenied = true; apply(); }));
  unsubs.push(onSnapshot(collection(db, 'aktiviteter'), s => { st.akt = s.docs.map(d => d.data()); apply(); }, fail));
}

// Engangsoppgradering: AT-er som ligger inni aktivitetene flyttes til egen samling.
async function migrateAts(acts) {
  const {acts: a2, ats} = splitLegacy(migrate(acts));
  const byId = new Map(a2.map(a => [a.id, a]));
  const batch = writeBatch(db);
  ats.forEach(t => batch.set(doc(db, 'at', t.id), toATDoc(t, id => byId.get(id))));
  a2.forEach(a => batch.set(doc(db, 'aktiviteter', a.id), toDoc(a)));
  await batch.commit();
}

// Første gang databasen er tom, lastes planen fra denne nettleseren (eller Excel-utdraget) opp av systemadministratoren.
async function seed(st) {
  const batch = writeBatch(db);
  if (!st.akt.length) {
    const local = readJSON('wrk2_v6'), localAts = readJSON('wrk2_at');
    const {acts, ats} = Array.isArray(local) && local.length
      ? (Array.isArray(localAts) ? {acts: local, ats: localAts} : splitLegacy(migrate(local)))
      : freshData();
    if (!(readJSON('wrk2_settings') || {}).fuIkkeVurdert) { acts.forEach(a => { a.forutsetninger = ikkeVurdert(); }); ats.forEach(t => { t.forutsetninger = ikkeVurdert(); }); }
    const byId = new Map(acts.map(a => [a.id, a]));
    acts.forEach(a => batch.set(doc(db, 'aktiviteter', a.id), toDoc(a)));
    ats.forEach(t => { if (!t.id) t.id = t.nr; if (!Array.isArray(t.aktiviteter)) t.aktiviteter = []; batch.set(doc(db, 'at', t.id), toATDoc(t, id => byId.get(id))); });
  }
  if (!st.firms.length) batch.set(doc(db, 'config', 'firms'), {list: normalizeFirms(readJSON('wrk2_firms_v6'))});
  if (!st.metoder.length) batch.set(doc(db, 'config', 'metoder'), {list: readJSON('wrk2_metoder') || DEFAULT_METHODS});
  if (!Object.keys(st.settings).length) batch.set(doc(db, 'config', 'settings'), {skrastrek: !!(readJSON('wrk2_settings') || {}).skrastrek});
  await batch.commit();
}

// ---------- lagring av endringer ----------
const saveFail = err => showToast('Kunne ikke lagre: ' + errText(err) + ' Endringen er rullet tilbake.');
window.cloudSync = () => {
  if (!started) return;
  if (readOnly) { showToast('Endringer kan ikke lagres ennå: ' + readOnly); return; }
  const cur = new Map(DATA.map(a => [a.id, toDoc(a)]));
  for (const [id, d] of cur) {
    const s = stable(d);
    if (base.akt.get(id) !== s) { base.akt.set(id, s); setDoc(doc(db, 'aktiviteter', id), d).catch(saveFail); }
  }
  for (const id of [...base.akt.keys()]) if (!cur.has(id)) { base.akt.delete(id); deleteDoc(doc(db, 'aktiviteter', id)).catch(saveFail); }
  const curAt = new Map(ATS.map(t => [t.id, toATDoc(t)]));
  for (const [id, d] of curAt) {
    const s = stable(d);
    if (base.ats.get(id) !== s) { base.ats.set(id, s); setDoc(doc(db, 'at', id), d).catch(saveFail); }
  }
  for (const id of [...base.ats.keys()]) if (!curAt.has(id)) { base.ats.delete(id); deleteDoc(doc(db, 'at', id)).catch(saveFail); }
  if (!isSys()) return;
  if (stable(REGISTER) !== base.register) { base.register = stable(REGISTER); setDoc(doc(db, 'config', 'firmaregister'), {list: REGISTER}).catch(saveFail); }
  if (stable(METHODS) !== base.metoder) { base.metoder = stable(METHODS); setDoc(doc(db, 'config', 'metoder'), {list: METHODS}).catch(saveFail); }
  if (stable(FIRMS) !== base.firms) { base.firms = stable(FIRMS); setDoc(doc(db, 'config', 'firms'), {list: FIRMS}).catch(saveFail); }
  const set = settingsDoc();
  if (stable(set) !== base.settings) { base.settings = stable(set); setDoc(doc(db, 'config', 'settings'), set).catch(saveFail); }
  const ref = u => u.pending ? doc(db, 'invites', u.email.toLowerCase()) : doc(db, 'users', u.id);
  const now = new Map(USERS.map(u => [u.id, u]));
  for (const [id, u] of now) {
    const s = stable(userDoc(u));
    if (base.users.get(id) !== s) { base.users.set(id, s); setDoc(ref(u), userDoc(u)).catch(saveFail); }
  }
  for (const id of [...base.users.keys()]) if (!now.has(id)) {
    base.users.delete(id);
    deleteDoc(id.startsWith('invite:') ? doc(db, 'invites', id.slice(7)) : doc(db, 'users', id)).catch(saveFail);
  }
};
