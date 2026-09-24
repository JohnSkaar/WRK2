# WRK2 Aktivitetsoversikt - Setup og Implementering

## Oversikt

Dette prosjektet er en web-basert aktivitetsoversikt for WRK2-byggeplassen, med 5 implementeringssteg:

1. **Steg 1** ✅ Excel-variant som web-app (`oversikt.html`)
2. **Steg 2** Deling med andre (med del-link)
3. **Steg 3** Innlogging
4. **Steg 4** Brukere kan oppdatere egne data
5. **Steg 5** Epostvarslinger og automatiske purringer

---

## Steg 1: Kjøre web-appen lokalt (GJORT)

### Filer
- `oversikt.html` - Hovedapp, åpen den direkte i nettleseren
- `firebase.config.js` - Firebase-konfigurering (plasseholder)

### Funksjoner
✅ **84 aktiviteter** fra SiteDrive-planen  
✅ **7 forutsetninger** med checkboxer (Mannskap, Materialer, Foregaende, Plass, Informasjon, Ytre faktorer, Utstyr)  
✅ **Startdato** for hver aktivitet  
✅ **Statistikk** (klare, ufullstendige, mangler dato)  
✅ **Filtrering** (søk, område, status)  
✅ **Eksport** til JSON og CSV  
✅ **Lokal lagring** - data lagres automatisk i nettleseren  

### Hvordan bruke
1. Åpne `oversikt.html` i nettleseren
2. Kryss av forutsetninger for hver aktivitet
3. Legg inn startdatoer
4. Data lagres automatisk
5. Eksporter når du vil (JSON eller CSV)

---

## Steg 2: Deling og databaseoppkobling

### Hva som skal gjøres
- [ ] Opprett Firebase-prosjekt på https://firebase.google.com/
- [ ] Aktivér Firestore Database (gratis tier)
- [ ] Oppdater `firebase.config.js` med dine Firebase-nøkler
- [ ] Lag deling med share-link (read-only eller edit)
- [ ] Synkroniser data mellom lokal lagring og Firestore

### Teknologi
- **Firestore** - NoSQL database
- **Firebase Authentication** - E-post autentisering (klar i Steg 3)
- **Firebase Storage** - For dokumenter (hvis drag-and-drop)

### Estimat
2-3 dager for en utvikler

---

## Steg 3: Innlogging

### Hva som skal gjøres
- [ ] Setup Firebase Authentication (E-post + Passord)
- [ ] Lag login-side
- [ ] Lagre PC/device som "bekreftet"
- [ ] Auto-login ved neste besøk
- [ ] Brukerroller (Admin+, Admin, Admin-, Prosjektledelse, Fagarbeider)

### Sikkerhet
- Midlertidig passord ved invitasjon
- Session timeout
- Audit log (hvem logget inn når)

### Estimat
3-4 dager

---

## Steg 4: Brukeroppdateringer

### Hva som skal gjøres
- [ ] Admin-panel for brukerhåndtering
- [ ] Invitasjons-system med e-post
- [ ] Rollebasert tilgangskontroll
- [ ] Brukerlogger (login history, hvem inviterte)
- [ ] Mulighet for å sende nye invitasjonsposter

### Estimat
3-5 dager

---

## Steg 5: Varsler og Purringer

### Hva som skal gjøres
- [ ] E-postvarsler ved store endringer
- [ ] Automatiske purringer (e.g. "Mangel forutsetning i A001")
- [ ] Daglig/ukentlig oversiktsrapport
- [ ] SMS/push-varsler (valgfritt)

### Estimat
2-3 dager

---

## Teknologi Stack

```
Frontend:     HTML/CSS/JavaScript (Vue.js for interaktivitet i senere steg)
Backend:      Node.js + Express (kan legges til senere)
Database:     Firebase Firestore (gratis, NoSQL)
Auth:         Firebase Authentication
Hosting:      Netlify eller Vercel (gratis)
E-post:       SendGrid eller Firebase Functions
```

---

## Deploy til produksjon (Netlify - gratis)

### Kort versjon
1. Push koden til GitHub
2. Koble Netlify til GitHub-repoet
3. Sett `oversikt.html` som build output
4. Deploy automatisk ved hver push

### Detaljert
```bash
# 1. Sørg for at du har pushet til GitHub
git add .
git commit -m "Steg 1: Web-basert aktivitetsoversikt"
git push origin claude/aktivitetsoversikt-excel-t4ujca

# 2. Logg inn på Netlify.com
# 3. Klikk "New site from Git"
# 4. Velg GitHub + wrk2 repo
# 5. Build command: leave blank
# 6. Publish directory: . (rot)
# 7. Deploy
```

Din app blir tilgjengelig på `wrk2.netlify.app` (eller med ditt domene wrk2.no)

---

## Filstruktur

```
WRK2/
├── oversikt.html           # Hovedapp (Steg 1)
├── firebase.config.js      # Firebase-config (for Steg 2+)
├── netlify.toml            # Deploy-konfigurering
├── SETUP.md                # Denne filen
├── WRK2_Aktivitetsoversikt.xlsx  # Opprinnelig Excel-fil
└── index.js / app.js       # Backend kommer senere (Steg 3+)
```

---

## Neste steg

1. **Test Steg 1** lokalt i nettleseren
2. **Deploy til Netlify** (kostnadsfritt)
3. **Bruk i praksis** og gi tilbakemelding
4. **Planlegg Steg 2** når Steg 1 er stabil

---

## Kontakt / Spørsmål

Se git history for detaljerte commits og endringer.
