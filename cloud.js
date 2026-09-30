// Innlogging og database (Firebase Auth + Firestore). Lastes av oversikt.html når siden ikke åpnes som lokal fil.
import { app, auth, useEmulator } from './fb.js';
import {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendEmailVerification, sendPasswordResetEmail, signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore, connectFirestoreEmulator, collection, doc, onSnapshot, setDoc, deleteDoc, getDoc, getDocs, writeBatch,
  addDoc, query, orderBy, limit
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
// Hjelp når e-posten fra noreply@wrk2.no ikke kommer frem (søppelpost eller karantene i Microsoft 365).
const MAIL_HELP = `<details class="sub mail-help" style="margin-top:10px">
    <summary style="cursor:pointer">Får du ikke e-posten?</summary>
    <ol style="margin:6px 0 0 18px;line-height:1.5">
      <li>Vent et par minutter, og sjekk mappen for søppelpost / uønsket e-post.</li>
      <li>Bruker firmaet Microsoft 365 / Outlook, kan e-posten ligge i karantene. Åpne
        <a href="https://security.microsoft.com/quarantine" target="_blank" rel="noopener">security.microsoft.com/quarantine</a>,
        logg inn med jobbkontoen, finn e-posten fra <b>noreply@wrk2.no</b> og velg «Frigi» (Release).</li>
      <li>Ser du den ikke der, be IT-avdelingen om å frigi den og å godkjenne avsenderen <b>noreply@wrk2.no</b>.</li>
      <li>Lenken i e-posten er engangs og utløper etter en stund. Be om en ny lenke hvis den ikke virker.</li>
    </ol>
  </details>`;
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
        <label>Invitasjonskode <span class="muted" style="font-weight:400">(bare første gang)</span><input type="text" id="li-kode" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX" value="${esc(getKode())}"></label>
        <div class="login-actions">
          <button class="btn primary" type="submit">Logg inn</button>
          <button class="btn" type="button" data-login="register">Opprett konto</button>
          <button class="link-btn" type="button" data-login="reset">Glemt passord?</button>
        </div>
        <p class="login-msg" id="login-msg">${esc(info)}</p>
        <p class="sub">Du må være invitert av en systemadministrator. Første gang skriver du inn e-postadressen du ble invitert med, velger et passord, limer inn invitasjonskoden og trykker «Opprett konto». Med koden trenger du ikke vente på e-post.</p>
        ${MAIL_HELP}
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
      <form id="kode-form" style="margin-top:12px">
        <label>Har du fått en invitasjonskode? Da slipper du e-posten.<input type="text" id="li-kode" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX-XXXX" value="${esc(getKode())}"></label>
        <div class="login-actions"><button class="btn primary" type="submit">Bruk koden</button></div>
      </form>
      ${MAIL_HELP}`;
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

// Invitasjonskoden kan komme i lenken (?kode=…) og huskes i fanen til kontoen er opprettet.
const normKode = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
function getKode() { try { return sessionStorage.getItem('wrk2_kode') || ''; } catch (e) { return ''; } }
function setKode(k) { try { k ? sessionStorage.setItem('wrk2_kode', k) : sessionStorage.removeItem('wrk2_kode'); } catch (e) { /* privat modus */ } }
{
  const q = new URLSearchParams(location.search);
  if (q.has('kode')) {
    setKode(normKode(q.get('kode')));
    const rest = location.search.slice(1).split('&').filter(x => x && !/^kode(=|$)/.test(x)).join('&');
    history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
  }
}
const kodeInput = () => { const el = $('li-kode'); const k = normKode(el && el.value); setKode(k); return k; };

document.addEventListener('submit', async e => {
  if (e.target.id === 'kode-form') {
    e.preventDefault();
    if (!kodeInput()) { msg('Lim inn invitasjonskoden først.'); return; }
    msg('Sjekker koden …');
    handleUser(auth.currentUser);
    return;
  }
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  kodeInput();
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
      const kode = kodeInput();
      msg('Oppretter konto …');
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      // Med invitasjonskode sendes ingen e-post; koden beviser at invitasjonen er din.
      if (!kode) await sendEmailVerification(cred.user);
    } else if (act === 'reset') {
      const email = $('li-email').value.trim();
      if (!email) { msg('Skriv inn e-postadressen din først.'); return; }
      await sendPasswordResetEmail(auth, email);
      msg('Hvis e-postadressen har en konto, er det sendt en lenke for å lage nytt passord.');
      const h = document.querySelector('#login-body .mail-help'); if (h) h.open = true;
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
// Endringslogg: legges til som nye dokumenter og kan ikke endres eller slettes (se firestore.rules).
window.cloudLog = e => {
  if (!started || !myUid) return;
  addDoc(collection(db, 'endringslogg'), {...e, uid: myUid}).catch(err => console.warn('Endringsloggen kunne ikke skrives:', err.code || err));
};

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
const settingsDoc = () => ({skrastrek: !!SETTINGS.skrastrek, atkoord: SETTINGS.atkoord !== false, plansett: SETTINGS.plansett || 0, atsett: SETTINGS.atsett || 0, mbrydd: SETTINGS.mbrydd || 0, planImport: SETTINGS.planImport || null, metodesett: SETTINGS.metodesett || 0, registersett: SETTINGS.registersett || 0});
const userDoc = u => ({name: u.name, email: (u.email || '').toLowerCase(), firma: u.firma, rolle: u.rolle, ...(u.pending && u.kode ? {kode: u.kode} : {})});
const codeDoc = u => ({name: u.name, email: (u.email || '').toLowerCase(), firma: u.firma, rolle: u.rolle});

// ---------- innlogget bruker ----------
let unsubs = [], started = false, myUid = null;
let base = {akt: new Map(), ats: new Map(), avh: new Map(), firms: '', metoder: '', register: '', settings: '', users: new Map()};
let readOnly = '';

onAuthStateChanged(auth, user => handleUser(user));

async function handleUser(user) {
  unsubs.forEach(f => f()); unsubs = []; started = false; myUid = null;
  if (!user) { view('signin'); return; }
  view('loading');
  try {
    const profile = await ensureProfile(user);
    if (profile === 'shown') return;
    if (!profile) { user.emailVerified ? view('noaccess', user.email) : view('verify', user.email); return; }
    startSync(user.uid);
  } catch (err) { view('error', 'Kunne ikke logge inn: ' + errText(err)); }
}

async function ensureProfile(user) {
  const email = user.email.toLowerCase();
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const kode = getKode();
  if (kode) {
    const ks = await getDoc(doc(db, 'invitekoder', kode)).catch(() => null);
    const k = ks && ks.exists() ? ks.data() : null;
    if (!k || k.email !== email) {
      setKode('');
      if (!user.emailVerified) { view('verify', user.email); msg(k ? `Koden gjelder en annen e-postadresse enn ${email}.` : 'Invitasjonskoden er ugyldig eller allerede brukt. Sjekk at du har limt inn hele koden.'); return 'shown'; }
    } else {
      const profile = {name: k.name || email.split('@')[0], email, firma: k.firma, rolle: k.rolle, kode};
      await setDoc(ref, profile);
      setKode('');
      await deleteDoc(doc(db, 'invitekoder', kode)).catch(() => {});
      await deleteDoc(doc(db, 'invites', email)).catch(() => {});
      return profile;
    }
  }
  if (!user.emailVerified) return null;
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
  const st = {users: null, invites: [], firms: null, metoder: null, register: null, settings: null, akt: null, ats: null, atsDenied: false, avh: null};
  let importing = false, importingAt = false, rydding = false, loggOn = false, invitesOn = false, seeding = false, migrating = false;
  const fail = err => { view('error', 'Mistet kontakten med databasen: ' + errText(err)); };

  const apply = async () => {
    if (!st.users || !st.firms || !st.metoder || !st.register || !st.settings || !st.akt || !st.ats || !st.avh) return;
    const meDoc = st.users.find(u => u.id === uid);
    if (!meDoc) { unsubs.forEach(f => f()); unsubs = []; view('noaccess', auth.currentUser ? auth.currentUser.email : ''); return; }
    const sys = meDoc.rolle === 'systemadmin';
    if (sys && !invitesOn) {
      invitesOn = true;
      unsubs.push(onSnapshot(collection(db, 'invites'), s => { st.invites = s.docs.map(d => d.data()); apply(); }, () => {}));
    }
    // Endringsloggen (siste 1000) leses bare av systemadministratorer.
    if (sys && !loggOn) {
      loggOn = true;
      unsubs.push(onSnapshot(query(collection(db, 'endringslogg'), orderBy('tid', 'desc'), limit(1000)),
        s => { LOGG = s.docs.map(d => d.data()); if (currentTab === 'admin') renderLogg(); }, () => {}));
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
    DATA = acts; ATS = ats; AVH = st.avh.map(d => ({...d}));
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
      avh: new Map(AVH.map(d => [d.id, stable(d)])),
      firms: stable(FIRMS), metoder: stable(METHODS), register: stable(REGISTER), settings: stable(settingsDoc()),
      users: new Map(USERS.map(u => [u.id, stable(userDoc(u))]))
    };
    if (!started) { started = true; unlock(); startApp(); } else scheduleRender();
    if (readOnly) showToast('Endringer kan ikke lagres ennå: ' + readOnly);
    if (sys && !readOnly && (applyMetodesett() | applyRegistersett())) { window.cloudSync(); renderCurrent(); }
    // Sitedrive-planen importeres én gang, i én samlet skriving, når de andre engangsoppdateringene er lagret.
    else if (sys && !readOnly && !importing && (st.settings.plansett || 0) < PLANSETT
      && (st.settings.metodesett || 0) >= METODESETT && (st.settings.registersett || 0) >= REGISTERSETT) { importing = true; await importPlan(); }
    // Deretter byttes AT-ene ut med de gjeldende fra AT-systemet, også i én samlet skriving.
    else if (sys && !readOnly && !importingAt && (st.settings.plansett || 0) >= PLANSETT && (st.settings.atsett || 0) < ATSETT) { importingAt = true; await importAts(); }
    else if (sys && !readOnly && !rydding && (st.settings.atsett || 0) >= ATSETT && (st.settings.mbrydd || 0) < MBRYDD) { rydding = true; await ryddMb(); }
  };

  unsubs.push(onSnapshot(collection(db, 'users'), s => { st.users = s.docs.map(d => ({id: d.id, ...d.data()})); apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'firmaregister'), s => { st.register = s.exists() ? (s.data().list || []) : []; apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'metoder'), s => { st.metoder = s.exists() ? (s.data().list || []) : []; apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'firms'), s => { st.firms = s.exists() ? (s.data().list || []) : []; apply(); }, fail));
  unsubs.push(onSnapshot(doc(db, 'config', 'settings'), s => { st.settings = s.exists() ? s.data() : {}; apply(); }, fail));
  unsubs.push(onSnapshot(collection(db, 'at'), s => { st.ats = s.docs.map(d => d.data()); st.atsDenied = false; apply(); },
    () => { st.ats = []; st.atsDenied = true; apply(); }));
  // Avhengigheter: blir tom liste hvis sikkerhetsreglene ikke er oppdatert ennå.
  unsubs.push(onSnapshot(collection(db, 'avhengigheter'), s => { window.cloudAvhDenied = false; st.avh = s.docs.map(d => d.data()); apply(); }, () => {
    window.cloudAvhDenied = true; st.avh = []; apply();
    if (sysOrAdmin()) showToast('Avhengigheter kan ikke lagres før sikkerhetsreglene i Firebase er publisert på nytt (firestore.rules fra GitHub).');
  }));
  unsubs.push(onSnapshot(collection(db, 'aktiviteter'), s => { st.akt = s.docs.map(d => d.data()); apply(); }, fail));
}

// Import av Sitedrive-planen: alle endringer skrives i én batch, slik at øyeblikksbildene ikke blander gammel og ny plan.
async function importPlan() {
  const gamle = new Set(DATA.map(a => a.id)), gamleAvh = new Set(AVH.map(d => d.id));
  if (!applyPlansett()) return;
  const batch = writeBatch(db), byId = new Map(DATA.map(a => [a.id, a]));
  DATA.forEach(a => batch.set(doc(db, 'aktiviteter', a.id), toDoc(a)));
  gamle.forEach(id => { if (!byId.has(id)) batch.delete(doc(db, 'aktiviteter', id)); });
  ATS.forEach(t => batch.set(doc(db, 'at', t.id), toATDoc(t, id => byId.get(id))));
  const nyAvh = new Set(AVH.map(d => d.id));
  gamleAvh.forEach(id => { if (!nyAvh.has(id)) batch.delete(doc(db, 'avhengigheter', id)); });
  batch.set(doc(db, 'config', 'firms'), {list: FIRMS});
  batch.set(doc(db, 'config', 'settings'), settingsDoc());
  try { await batch.commit(); showToast(`Sitedrive-planen er importert: ${SETTINGS.planImport.ny} nye, ${SETTINGS.planImport.oppdatert} oppdatert, ${SETTINGS.planImport.fjernet} fjernet.`); }
  catch (err) { showToast('Importen av Sitedrive-planen feilet: ' + errText(err)); }
}

// Rydding av direkte MB-koblinger og aktiviteter utenfor planen, i én batch.
async function ryddMb() {
  const gamle = DATA.map(a => a.id), atFor = new Map(ATS.map(t => [t.id, t.aktiviteter.join(',')]));
  if (!applyMbrydd()) return;
  const batch = writeBatch(db), byId = new Map(DATA.map(a => [a.id, a]));
  gamle.forEach(id => { if (!byId.has(id)) batch.delete(doc(db, 'aktiviteter', id)); });
  DATA.forEach(a => batch.set(doc(db, 'aktiviteter', a.id), toDoc(a)));
  // Bare AT-er der en slettet aktivitet er fjernet fra koblingene, skrives.
  ATS.filter(t => atFor.get(t.id) !== t.aktiviteter.join(',')).forEach(t => batch.update(doc(db, 'at', t.id), {aktiviteter: t.aktiviteter}));
  batch.set(doc(db, 'config', 'settings'), settingsDoc());
  try { await batch.commit(); showToast('Metodebeskrivelsene er ryddet: aktivitetene kobles nå bare via AT-er.'); }
  catch (err) { showToast('Ryddingen feilet: ' + errText(err)); }
}

async function importAts() {
  // Alle AT-dokumenter i databasen hentes, så også AT-er som ikke er lastet i denne økten blir fjernet.
  let gamle = ATS.map(t => t.id);
  try { gamle = [...new Set([...gamle, ...(await getDocs(collection(db, 'at'))).docs.map(d => d.id)])]; } catch (err) { /* bruk lokal liste */ }
  if (!applyAtsett()) return;
  const batch = writeBatch(db), nye = new Set(ATS.map(t => t.id));
  gamle.forEach(id => { if (!nye.has(id)) batch.delete(doc(db, 'at', id)); });
  ATS.forEach(t => batch.set(doc(db, 'at', t.id), toATDoc(t)));
  batch.set(doc(db, 'config', 'settings'), settingsDoc());
  try { await batch.commit(); showToast(`AT-ene er byttet ut: ${ATS.length} AT-er fra AT-systemet.`); }
  catch (err) { showToast('Utbyttingen av AT-er feilet: ' + errText(err)); }
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
const sysOrAdmin = () => ['systemadmin', 'firmaadmin'].includes((USERS.find(u => u.id === myUid) || {}).rolle);
const avhFail = err => showToast(err && err.code === 'permission-denied'
  ? 'Avhengigheten ble ikke lagret: sikkerhetsreglene i Firebase må publiseres på nytt (firestore.rules fra GitHub), eller du mangler tilgang til begge aktivitetene.'
  : 'Kunne ikke lagre avhengigheten: ' + errText(err));
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
  const curAvh = new Map(AVH.map(d => [d.id, JSON.parse(JSON.stringify(d))]));
  for (const [id, d] of curAvh) {
    const s = stable(d);
    if (base.avh.get(id) !== s) { base.avh.set(id, s); setDoc(doc(db, 'avhengigheter', id), d).catch(avhFail); }
  }
  for (const id of [...base.avh.keys()]) if (!curAvh.has(id)) { base.avh.delete(id); deleteDoc(doc(db, 'avhengigheter', id)).catch(avhFail); }
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
    if (base.users.get(id) !== s) {
      base.users.set(id, s);
      setDoc(ref(u), userDoc(u)).catch(saveFail);
      if (u.pending && u.kode) setDoc(doc(db, 'invitekoder', u.kode), codeDoc(u)).catch(saveFail);
    }
  }
  for (const id of [...base.users.keys()]) if (!now.has(id)) {
    const old = JSON.parse(base.users.get(id) || '{}');
    base.users.delete(id);
    deleteDoc(id.startsWith('invite:') ? doc(db, 'invites', id.slice(7)) : doc(db, 'users', id)).catch(saveFail);
    if (id.startsWith('invite:') && old.kode) deleteDoc(doc(db, 'invitekoder', old.kode)).catch(() => {});
  }
};
