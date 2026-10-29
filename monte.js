// ---------- Monte Carlo-simulering av fremdrift (fanen «Monte Carlo-simulering», kun systemadministrator) ----------
// Modellen er egen og påvirker ikke planen: aktiviteter med estimert varighet (fordeling), avhengigheter,
// datolåser/tidsrom, «ikke samtidig»-grupper og risikohendelser. Simuleringen gir sannsynlighetskurve,
// persentiler, kritikalitet per aktivitet og tornadodiagram.
'use strict';
const MC_KEY = 'wrk2_montecarlo';
const MC_FORD = [['pert', 'PERT (beta)'], ['trekant', 'Trekant'], ['uniform', 'Uniform'], ['normal', 'Normal'], ['lognormal', 'Lognormal'], ['fast', 'Fast (ingen usikkerhet)']];
const MC_AVH = [['FS', 'FS – slutt→start'], ['SS', 'SS – start→start'], ['FF', 'FF – slutt→slutt'], ['SF', 'SF – start→slutt'],
  ['SAM', 'Start samtidig'], ['NS', 'Ikke samtidig (fri rekkefølge)']];
const MC_LAAS = [['', 'Ingen'], ['snet', 'Start tidligst'], ['mso', 'Må starte på'], ['fnet', 'Ferdig tidligst'], ['fnlt', 'Ferdig senest (frist)'],
  ['vindu', 'Start innenfor tidsrom']];
let MC = null, mcRes = null, mcKjorer = false;
const mcNy = () => ({navn: 'Monte Carlo – WRK2', start: mondayOf(TODAY), iter: 3000, kalender: 'arbeid', maal: '', seed: 1, akt: [], avh: []});
function mcLast() {
  if (MC) return MC;
  try { MC = JSON.parse(localStorage.getItem(MC_KEY)); } catch (e) { MC = null; }
  if (!MC || !Array.isArray(MC.akt)) MC = mcNy();
  return MC;
}
let mcLagreT = null;
function mcLagre() {
  clearTimeout(mcLagreT);
  mcLagreT = setTimeout(() => {
    try { localStorage.setItem(MC_KEY, JSON.stringify(MC)); } catch (e) {}
    if (typeof CLOUD !== 'undefined' && CLOUD && window.cloudMcLagre) window.cloudMcLagre(JSON.parse(JSON.stringify(MC)));
  }, 400);
}
// Fra skyen (cloud.js): erstatter modellen når en annen økt har lagret, men ikke midt i redigering.
window.mcFraSky = m => {
  if (!m || !Array.isArray(m.akt)) return;
  if (MC && JSON.stringify(m) === JSON.stringify(MC)) return;
  MC = m;
  try { localStorage.setItem(MC_KEY, JSON.stringify(MC)); } catch (e) {}
  const a = document.activeElement;
  if (currentTab === 'monte' && !(a && a.closest && a.closest('#page-monte') && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) renderMonte();
};

// ----- kalender: arbeidsdager (man–fre) eller kalenderdager, regnet fra modellens startdato -----
function mcErArbeid(d) { const w = parseD(d).getDay(); return w !== 0 && w !== 6; }
function mcDatoTilDag(d) {
  if (!d) return null;
  if (MC.kalender !== 'arbeid') return daysBetween(MC.start, d);
  let n = 0, x = MC.start;
  if (d >= x) { while (x < d) { if (mcErArbeid(x)) n++; x = addDays(x, 1); } }
  else { while (x > d) { x = addDays(x, -1); if (mcErArbeid(x)) n--; } }
  return n;
}
function mcDagTilDato(t) {
  const n = Math.max(0, Math.ceil(t - 1e-9));
  if (MC.kalender !== 'arbeid') return addDays(MC.start, n);
  let x = MC.start; while (!mcErArbeid(x)) x = addDays(x, 1);
  for (let k = 0; k < n; k++) { x = addDays(x, 1); while (!mcErArbeid(x)) x = addDays(x, 1); }
  return x;
}
// Sluttdato: siste dag aktiviteten pågår (slutt-tidspunkt t betyr at dag t-1 er siste arbeidsdag).
const mcSluttDato = t => t <= 0 ? MC.start : mcDagTilDato(Math.max(0, Math.ceil(t - 1e-9) - 1));

// ----- trekning -----
function mcRng(seed) { let a = seed >>> 0 || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function mcNormal(r) { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function mcGamma(r, k) {
  if (k < 1) return mcGamma(r, k + 1) * Math.pow(r(), 1 / k);
  const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x, v; do { x = mcNormal(r); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = r();
    if (u < 1 - .0331 * x ** 4 || Math.log(u) < .5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
function mcTrekk(r, ford, min, ml, max) {
  min = +min || 0; ml = +ml || 0; max = +max || 0;
  if (max < min) [min, max] = [max, min];
  ml = Math.min(Math.max(ml, min), max);
  if (ford === 'fast' || max === min) return ml;
  if (ford === 'uniform') return min + r() * (max - min);
  if (ford === 'trekant') { const u = r(), f = (ml - min) / (max - min); return u < f ? min + Math.sqrt(u * (max - min) * (ml - min)) : max - Math.sqrt((1 - u) * (max - min) * (max - ml)); }
  if (ford === 'normal') return Math.max(0, ml + mcNormal(r) * (max - min) / 6);
  if (ford === 'lognormal') {
    const m = Math.max(ml, .01), s = (max - min) / 6, sig2 = Math.log(1 + (s * s) / (m * m));
    return Math.exp(Math.log(m) - sig2 / 2 + Math.sqrt(sig2) * mcNormal(r));
  }
  // PERT: beta-fordeling med vekt 4 på mest sannsynlig.
  const a = 1 + 4 * (ml - min) / (max - min), b = 1 + 4 * (max - ml) / (max - min), x = mcGamma(r, a), y = mcGamma(r, b);
  return min + (x / (x + y)) * (max - min);
}

// ----- simulering -----
// Kontroll av modellen: ukjente aktiviteter i avhengigheter og sykler gir feil.
function mcSjekk() {
  const feil = [], idx = new Map(MC.akt.map((a, i) => [a.id, i]));
  MC.avh.forEach(d => { if (!idx.has(d.fra) || !idx.has(d.til)) feil.push(`Avhengigheten ${d.fra} → ${d.til} peker på en aktivitet som ikke finnes.`); if (d.fra === d.til) feil.push(`${d.fra} kan ikke avhenge av seg selv.`); });
  const n = MC.akt.length, sett = [];
  // Sykeltest (topologisk sortering) over alle avhengigheter unntatt «ikke samtidig».
  const inn2 = new Array(n).fill(0), ut2 = Array.from({length: n}, () => []);
  MC.avh.filter(d => d.type !== 'NS' && idx.has(d.fra) && idx.has(d.til) && d.fra !== d.til).forEach(d => { const f = idx.get(d.fra), t = idx.get(d.til); ut2[f].push(t); inn2[t]++; });
  const q = [...inn2.keys()].filter(i => !inn2[i]);
  while (q.length) { const i = q.shift(); sett.push(i); ut2[i].forEach(j => { if (!--inn2[j]) q.push(j); }); }
  if (sett.length < n) feil.push('Avhengighetene går i ring (sykel): ' + MC.akt.filter((a, i) => !sett.includes(i)).map(a => a.id).join(', '));
  MC.akt.forEach(a => {
    if (!(+a.max >= +a.min)) feil.push(`${a.id}: «verst» må være større enn eller lik «best».`);
    if (a.laas && a.laas.type && !a.laas.d1) feil.push(`${a.id}: datolåsen mangler dato.`);
    if (a.laas && a.laas.type === 'vindu' && !a.laas.d2) feil.push(`${a.id}: tidsrommet mangler sluttdato.`);
  });
  return feil;
}
function mcModell() {
  const n = MC.akt.length, idx = new Map(MC.akt.map((a, i) => [a.id, i]));
  const forg = Array.from({length: n}, () => []), etter = Array.from({length: n}, () => []), ns = Array.from({length: n}, () => new Set());
  MC.avh.forEach(d => {
    if (!idx.has(d.fra) || !idx.has(d.til) || d.fra === d.til) return;
    const f = idx.get(d.fra), t = idx.get(d.til), lag = +d.lag || 0;
    if (d.type === 'NS') { ns[f].add(t); ns[t].add(f); return; }
    forg[t].push({i: f, type: d.type === 'SAM' ? 'SS' : d.type, lag});
    etter[f].push(t);
  });
  // Grupper («ikke samtidig»): alle aktiviteter med samme gruppenavn kan ikke pågå samtidig.
  const grp = new Map();
  MC.akt.forEach((a, i) => String(a.gruppe || '').split(',').map(s => s.trim()).filter(Boolean).forEach(g => { if (!grp.has(g)) grp.set(g, []); grp.get(g).push(i); }));
  grp.forEach(l => l.forEach(i => l.forEach(j => { if (i !== j) ns[i].add(j); })));
  const laas = MC.akt.map(a => { const l = a.laas || {}; return {type: l.type || '', d1: l.type ? mcDatoTilDag(l.d1) : null, d2: l.type === 'vindu' ? mcDatoTilDag(l.d2) : null}; });
  return {n, forg, etter, ns: ns.map(s => [...s]), laas};
}
// Én iterasjon: seriell planlegging der klare aktiviteter (alle forgjengere planlagt) tas i rekkefølge etter tidligste start.
function mcPlanlegg(M, dur, s, f, drv, brudd) {
  const {n, forg, etter, ns, laas} = M, igjen = forg.map(l => l.length), ferdig = new Uint8Array(n), klar = [];
  for (let i = 0; i < n; i++) if (!igjen[i]) klar.push(i);
  const es = new Float64Array(n), esDrv = new Int32Array(n).fill(-1);
  const beregn = j => {
    let t = 0, dv = -1;
    for (const p of forg[j]) {
      const i = p.i, v = p.type === 'FS' ? f[i] + p.lag : p.type === 'SS' ? s[i] + p.lag : p.type === 'FF' ? f[i] + p.lag - dur[j] : s[i] + p.lag - dur[j];
      if (v > t + 1e-9) { t = v; dv = i; }
    }
    const l = laas[j];
    if (l.type === 'snet' || l.type === 'vindu') { if (l.d1 > t) { t = l.d1; dv = -2; } }
    else if (l.type === 'fnet') { if (l.d1 - dur[j] > t) { t = l.d1 - dur[j]; dv = -2; } }
    else if (l.type === 'mso') { if (t > l.d1 + 1e-9) brudd[j] |= 1; t = l.d1; dv = -2; }
    es[j] = t; esDrv[j] = dv;
  };
  klar.forEach(beregn);
  let gjort = 0;
  while (klar.length) {
    let bi = 0; for (let k = 1; k < klar.length; k++) if (es[klar[k]] < es[klar[bi]] - 1e-9 || (Math.abs(es[klar[k]] - es[klar[bi]]) < 1e-9 && klar[k] < klar[bi])) bi = k;
    const j = klar.splice(bi, 1)[0];
    let t = es[j], dv = esDrv[j];
    // Ikke samtidig: skyv til etter de som allerede er planlagt og ville overlappet.
    if (ns[j].length) {
      let flytt = true;
      while (flytt) { flytt = false; for (const k of ns[j]) if (ferdig[k] && s[k] < t + dur[j] - 1e-9 && f[k] > t + 1e-9) { t = f[k]; dv = k; flytt = true; } }
    }
    s[j] = t; f[j] = t + dur[j]; drv[j] = dv; ferdig[j] = 1; gjort++;
    const l = laas[j];
    if (l.type === 'vindu' && t > l.d2 + 1e-9) brudd[j] |= 2;
    if (l.type === 'fnlt' && f[j] > l.d1 + 1 + 1e-9) brudd[j] |= 4; // frist = siste dag (slutt-tidspunkt d1+1)
    for (const k of etter[j]) if (!--igjen[k]) { klar.push(k); beregn(k); }
  }
  return gjort === n;
}
function mcVarighet(a, r) {
  let d = mcTrekk(r, a.ford, a.min, a.ml, a.max);
  const rk = a.risiko || {};
  if (+rk.p > 0 && r() * 100 < +rk.p) d += mcTrekk(r, 'trekant', rk.min, rk.ml, rk.max);
  return Math.max(0, d);
}
function mcDeterministisk() {
  const M = mcModell(), n = M.n, dur = new Float64Array(n), s = new Float64Array(n), f = new Float64Array(n), drv = new Int32Array(n), b = new Uint8Array(n);
  MC.akt.forEach((a, i) => { dur[i] = Math.max(0, +a.ml || 0); });
  mcPlanlegg(M, dur, s, f, drv, b);
  return {s, f, slutt: n ? Math.max(...f) : 0};
}
async function mcKjor(fremdrift) {
  const M = mcModell(), n = M.n, N = Math.max(100, Math.min(20000, +MC.iter || 3000)), r = mcRng(+MC.seed || 1);
  const durs = Array.from({length: n}, () => new Float32Array(N)), slutt = new Float32Array(N), aktSlutt = Array.from({length: n}, () => new Float32Array(N));
  const krit = new Uint32Array(n), bruddN = Array.from({length: 3}, () => new Uint32Array(n));
  const dur = new Float64Array(n), s = new Float64Array(n), f = new Float64Array(n), drv = new Int32Array(n), b = new Uint8Array(n);
  for (let it = 0; it < N; it++) {
    for (let i = 0; i < n; i++) { dur[i] = mcVarighet(MC.akt[i], r); durs[i][it] = dur[i]; }
    b.fill(0);
    mcPlanlegg(M, dur, s, f, drv, b);
    let maks = 0, sist = -1; for (let i = 0; i < n; i++) { aktSlutt[i][it] = f[i]; if (f[i] > maks) { maks = f[i]; sist = i; } }
    slutt[it] = maks;
    // Kritisk vei: følg det som styrte starten bakover fra aktiviteten som slutter sist.
    const sett = new Uint8Array(n);
    for (let k = sist; k >= 0 && !sett[k]; k = drv[k]) { sett[k] = 1; krit[k]++; }
    for (let i = 0; i < n; i++) { if (b[i] & 1) bruddN[0][i]++; if (b[i] & 2) bruddN[1][i]++; if (b[i] & 4) bruddN[2][i]++; }
    if (fremdrift && it % 250 === 249) { fremdrift((it + 1) / N); await new Promise(ok => setTimeout(ok, 0)); }
  }
  return mcAnalyser({N, n, durs, slutt, aktSlutt, krit, bruddN});
}
const mcPct = (sortert, p) => sortert.length ? sortert[Math.min(sortert.length - 1, Math.max(0, Math.round(p / 100 * (sortert.length - 1))))] : 0;
function mcAnalyser({N, n, durs, slutt, aktSlutt, krit, bruddN}) {
  const sortert = Float32Array.from(slutt).sort(), snitt = slutt.reduce((x, y) => x + y, 0) / N;
  const det = mcDeterministisk();
  const pDato = t => mcSluttDato(t);
  const pers = [5, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95].map(p => ({p, t: mcPct(sortert, p), dato: pDato(mcPct(sortert, p))}));
  const sannTil = d => { if (!d) return null; const g = mcDatoTilDag(d) + 1; let k = 0; for (let i = 0; i < N; i++) if (slutt[i] <= g + 1e-6) k++; return k / N; };
  // Tornado: for hver aktivitet med usikkerhet – gjennomsnittlig prosjektslutt når varigheten er i laveste vs. høyeste tidel,
  // og korrelasjonen mellom varighet og prosjektslutt.
  const sd = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  const sdS = sd(slutt), torn = [];
  for (let i = 0; i < n; i++) {
    const d = durs[i], sdD = sd(d); if (sdD < 1e-6) continue;
    const mD = d.reduce((x, y) => x + y, 0) / N; let cov = 0; for (let k = 0; k < N; k++) cov += (d[k] - mD) * (slutt[k] - snitt);
    const kor = sdS > 1e-9 ? cov / N / (sdD * sdS) : 0;
    const ord = Array.from({length: N}, (_, k) => k).sort((x, y) => d[x] - d[y]), ti = Math.max(1, Math.floor(N / 10));
    let lav = 0, hoy = 0; for (let k = 0; k < ti; k++) { lav += slutt[ord[k]]; hoy += slutt[ord[N - 1 - k]]; }
    torn.push({i, kor, lav: lav / ti - snitt, hoy: hoy / ti - snitt, d10: d[ord[ti]], d90: d[ord[N - 1 - ti]]});
  }
  torn.sort((x, y) => (y.hoy - y.lav) - (x.hoy - x.lav));
  const akt = MC.akt.map((a, i) => { const so = Float32Array.from(aktSlutt[i]).sort();
    return {id: a.id, navn: a.navn, krit: krit[i] / N, p50: pDato(mcPct(so, 50)), p80: pDato(mcPct(so, 80)), det: pDato(det.f[i]), snittDur: durs[i].reduce((x, y) => x + y, 0) / N,
      mso: bruddN[0][i] / N, vindu: bruddN[1][i] / N, frist: bruddN[2][i] / N, laas: a.laas || {}}; });
  return {N, n, sortert, snitt, snittDato: pDato(snitt), det: det.slutt, detDato: pDato(det.slutt), pDet: sannTil(pDato(det.slutt)), maal: MC.maal, pMaal: sannTil(MC.maal), pers, torn, akt, tid: new Date().toISOString()};
}

// ----- visning -----
const mcOpt = (liste, v) => liste.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('');
const mcNyId = () => { let k = MC.akt.length + 1; while (MC.akt.some(a => a.id === 'M' + k)) k++; return 'M' + k; };
function renderMonte() {
  mcLast();
  mcSynkPlan();
  const el = document.getElementById('mc-root'); if (!el) return;
  const ids = MC.akt.map(a => a.id), feil = mcSjekk();
  const aktRad = (a, i) => { const l = a.laas || {}, rk = a.risiko || {};
    return `<tr data-mci="${i}">
      <td><input class="mc-id" data-mc="id" value="${esc(a.id)}" maxlength="12"></td>
      <td>${a.ref ? `<b>${esc(a.navn)}</b><div class="sub">${a.auto ? '🔗 har avhengighet i planen' : 'fra planen'} · ${esc(a.ref)}${+a.min === +a.ml && +a.max === +a.ml ? ' · <span class="mc-ingen">ingen usikkerhet ennå</span>' : ''}</div>` : `<input class="mc-navn" data-mc="navn" value="${esc(a.navn)}" maxlength="80">`}</td>
      <td><select data-mc="ford">${mcOpt(MC_FORD, a.ford)}</select></td>
      <td><input type="number" step="0.5" min="0" class="mc-n" data-mc="min" value="${a.min}"></td>
      <td><input type="number" step="0.5" min="0" class="mc-n" data-mc="ml" value="${a.ml}"></td>
      <td><input type="number" step="0.5" min="0" class="mc-n" data-mc="max" value="${a.max}"></td>
      <td><select data-mc="laas.type">${mcOpt(MC_LAAS, l.type || '')}</select>
        ${l.auto ? '<div class="sub">planlagt start (følger planen)</div>' : ''}
        ${l.type ? `<div class="mc-dat"><input type="date" data-mc="laas.d1" value="${esc(l.d1 || '')}">${l.type === 'vindu' ? `–<input type="date" data-mc="laas.d2" value="${esc(l.d2 || '')}">` : ''}</div>` : ''}</td>
      <td><input class="mc-grp" data-mc="gruppe" value="${esc(a.gruppe || '')}" placeholder="f.eks. kran" title="Aktiviteter med samme gruppenavn kan ikke pågå samtidig (flere grupper skilles med komma)"></td>
      <td class="mc-risk"><input type="number" min="0" max="100" class="mc-n" data-mc="risiko.p" value="${rk.p || 0}" title="Sannsynlighet (%)">%
        ${+rk.p ? `<div class="sub">+<input type="number" min="0" class="mc-n" data-mc="risiko.min" value="${rk.min || 0}" title="Ekstra dager – best">/<input type="number" min="0" class="mc-n" data-mc="risiko.ml" value="${rk.ml || 0}" title="Ekstra dager – sannsynlig">/<input type="number" min="0" class="mc-n" data-mc="risiko.max" value="${rk.max || 0}" title="Ekstra dager – verst"> d</div>` : ''}</td>
      <td><button class="mb-x" data-action="mc-akt-slett" data-i="${i}" title="Slett aktiviteten">🗑</button></td></tr>`; };
  const avhRad = (d, i) => `<tr data-mcd="${i}">
      <td><select data-mcd-f="fra">${ids.map(x => `<option ${x === d.fra ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
      <td><select data-mcd-f="type">${mcOpt(MC_AVH, d.type)}</select></td>
      <td><select data-mcd-f="til">${ids.map(x => `<option ${x === d.til ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></td>
      <td>${d.type === 'NS' ? '<span class="sub">–</span>' : `<input type="number" step="0.5" class="mc-n" data-mcd-f="lag" value="${+d.lag || 0}"> d`}</td>
      <td class="sub">${mcAvhTekst(d)}</td>
      <td><button class="mb-x" data-action="mc-avh-slett" data-i="${i}" title="Slett avhengigheten">🗑</button></td></tr>`;
  el.innerHTML = `<div class="panel">
      <h2>Monte Carlo-simulering <span class="readonly-tag">Kun systemadministrator</span></h2>
      <p class="intro">En egen modell for usikkerhet i fremdriften. Legg inn aktivitetene med varighet som <b>best / sannsynlig / verst</b> (arbeidsdager eller kalenderdager) og en fordeling, koble dem med avhengigheter, lås datoer eller tidsrom, og angi hva som ikke kan pågå samtidig.
        Simuleringen trekker varighetene mange ganger og gir sannsynligheten for å bli ferdig til en dato, kritikalitet per aktivitet og et tornadodiagram over hva som driver usikkerheten. Modellen endrer ikke planen.</p>
      <div class="mc-innst">
        <label>Navn<input data-mcs="navn" value="${esc(MC.navn)}" maxlength="80"></label>
        <label>Startdato<input type="date" data-mcs="start" value="${esc(MC.start)}"></label>
        <label>Kalender<select data-mcs="kalender">${mcOpt([['arbeid', 'Arbeidsdager (man–fre)'], ['kalender', 'Kalenderdager']], MC.kalender)}</select></label>
        <label>Måldato (frist)<input type="date" data-mcs="maal" value="${esc(MC.maal || '')}"></label>
        <label>Iterasjoner<input type="number" min="100" max="20000" step="100" data-mcs="iter" value="${MC.iter}"></label>
        <label>Startverdi (seed)<input type="number" min="1" data-mcs="seed" value="${MC.seed}" title="Samme startverdi gir samme resultat"></label>
      </div>
    </div>
    <div class="panel">
      <h3>Aktiviteter <span class="sub">${MC.akt.length} stk.</span></h3>
      <div class="toolbar"><button class="btn" data-action="mc-akt-ny">+ Ny aktivitet</button>
        <button class="btn" data-action="mc-hent">⤓ Hent fra planen …</button>
        ${MC.akt.some(a => +a.min === +a.ml && +a.max === +a.ml) ? `<button class="btn" data-action="mc-std-usikker" title="Gir alle aktiviteter som ennå ikke har usikkerhet: best 80 %, verst 150 % av sannsynlig">± Standard usikkerhet (80–150 %) på ${MC.akt.filter(a => +a.min === +a.ml && +a.max === +a.ml).length} uten</button>` : ''}
        ${MC.akt.length ? '<button class="btn danger" data-action="mc-tom">Tøm modellen</button>' : ''}
        <span class="sub">Varighet i ${MC.kalender === 'arbeid' ? 'arbeidsdager' : 'kalenderdager'}. Normal/lognormal bruker «sannsynlig» som midtverdi og (verst − best)/6 som standardavvik.</span></div>
      <div class="mc-hent" id="mc-hent" hidden></div>
      ${MC.akt.length ? `<div class="mc-tab-wrap"><table class="mc-tab"><tr><th>ID</th><th>Aktivitet</th><th>Fordeling</th><th>Best</th><th>Sannsynlig</th><th>Verst</th><th>Datolås / tidsrom</th><th title="Aktiviteter i samme gruppe kan ikke pågå samtidig">Ikke samtidig (gruppe)</th><th title="Risikohendelse: sannsynlighet og ekstra varighet (best/sannsynlig/verst)">Risiko</th><th></th></tr>
        ${MC.akt.map(aktRad).join('')}</table></div>` : '<p class="muted">Ingen aktiviteter ennå. Legg inn nye, eller hent fra planen.</p>'}
    </div>
    <div class="panel">
      <h3>Avhengigheter <span class="sub">${MC.avh.length} stk.</span></h3>
      <div class="toolbar">${MC.akt.length >= 2 ? '<button class="btn" data-action="mc-avh-ny">+ Ny avhengighet</button>' : ''}
        <span class="sub">FS: B starter når A er ferdig · SS: B starter når A starter · FF: B blir ferdig når A er ferdig · SF: B blir ferdig når A starter · Start samtidig: B starter når A starter · Ikke samtidig: A og B kan ikke pågå samtidig. Forskyvning kan være negativ (overlapp).</span></div>
      ${MC.avh.length ? `<table class="mc-tab"><tr><th>Fra (A)</th><th>Type</th><th>Til (B)</th><th>Forskyvning</th><th>Betyr</th><th></th></tr>${MC.avh.map(avhRad).join('')}</table>` : ''}
    </div>
    <div class="panel">
      <h3>Simulering</h3>
      ${feil.length ? `<div class="mc-feil">${feil.map(x => '⚠ ' + esc(x)).join('<br>')}</div>` : ''}
      <div class="toolbar"><button class="btn primary" data-action="mc-kjor" ${feil.length || !MC.akt.length || mcKjorer ? 'disabled' : ''}>▶ Kjør simulering (${MC.iter} iterasjoner)</button>
        <span class="sub" id="mc-fremdrift">${mcKjorer ? 'Kjører …' : mcRes ? `Sist kjørt ${fmtNo(mcRes.tid.slice(0, 10))} ${mcRes.tid.slice(11, 16)} · ${mcRes.N} iterasjoner` : ''}</span></div>
      <div id="mc-res">${mcRes ? mcResHtml(mcRes) : ''}</div>
    </div>`;
}
function mcAvhTekst(d) {
  const lag = +d.lag || 0, l = lag ? ` ${lag > 0 ? '+' : '−'} ${Math.abs(lag)} d` : '';
  return {FS: `${esc(d.til)} starter tidligst når ${esc(d.fra)} er ferdig${l}`, SS: `${esc(d.til)} starter tidligst når ${esc(d.fra)} starter${l}`,
    FF: `${esc(d.til)} blir tidligst ferdig når ${esc(d.fra)} er ferdig${l}`, SF: `${esc(d.til)} blir tidligst ferdig når ${esc(d.fra)} starter${l}`,
    SAM: `${esc(d.til)} starter når ${esc(d.fra)} starter${l}`, NS: `${esc(d.fra)} og ${esc(d.til)} kan ikke pågå samtidig`}[d.type] || '';
}
function mcResHtml(R) {
  const p = k => R.pers.find(x => x.p === k), pr = v => v === null ? '–' : Math.round(v * 100) + ' %';
  const kort = (t, v, sub, farge) => `<div class="hr-tall"><span>${t}</span><b style="color:${farge || '#1b1f24'}">${v}</b><span class="sub">${sub || ''}</span></div>`;
  const brudd = R.akt.filter(a => a.mso || a.vindu || a.frist || a.laas.type === 'fnlt' || a.laas.type === 'vindu');
  return `<div class="hr-tallrad">
      ${kort('Planlagt slutt (sannsynlig varighet)', fmtNo(R.detDato), `Sannsynlighet for å holde: <b>${pr(R.pDet)}</b>`)}
      ${kort('P50', fmtNo(p(50).dato), '50 % sannsynlighet for å være ferdig')}
      ${kort('P80', fmtNo(p(80).dato), '80 % sannsynlighet', '#9a6700')}
      ${kort('P90', fmtNo(p(90).dato), '90 % sannsynlighet', 'var(--red)')}
      ${R.maal ? kort('Måldato ' + fmtNo(R.maal), pr(R.pMaal), 'sannsynlighet for å være ferdig', R.pMaal >= .8 ? 'var(--green)' : R.pMaal >= .5 ? '#9a6700' : 'var(--red)') : ''}
    </div>
    <div class="mc-graf">${mcHistogramSvg(R)}</div>
    <h4>Persentiler for prosjektslutt</h4>
    <table class="sd-tab mc-pers"><tr>${R.pers.map(x => `<th class="c">P${x.p}</th>`).join('')}</tr><tr>${R.pers.map(x => `<td class="c">${fmtShort(x.dato)}</td>`).join('')}</tr></table>
    <h4>Tornadodiagram <span class="sub">– endring i gjennomsnittlig prosjektslutt når aktivitetens varighet er i laveste (grønn) eller høyeste (rød) tidel</span></h4>
    <div class="mc-graf">${mcTornadoSvg(R)}</div>
    <h4>Aktiviteter</h4>
    <table class="sd-tab"><tr><th>Aktivitet</th><th class="c" title="Andel av iterasjonene der aktiviteten lå på kritisk vei">Kritikalitet</th><th class="c">Snitt varighet</th><th>Planlagt slutt</th><th>P50 slutt</th><th>P80 slutt</th></tr>
      ${[...R.akt].sort((x, y) => y.krit - x.krit).map(a => `<tr><td><b>${esc(a.id)}</b> ${esc(a.navn)}</td><td class="c"><span class="mc-krit" style="--k:${Math.round(a.krit * 100)}%">${Math.round(a.krit * 100)} %</span></td>
        <td class="c">${a.snittDur.toFixed(1)} d</td><td>${fmtShort(a.det)}</td><td>${fmtShort(a.p50)}</td><td>${fmtShort(a.p80)}</td></tr>`).join('')}</table>
    ${brudd.length ? `<h4>Datolåser og frister</h4><table class="sd-tab"><tr><th>Aktivitet</th><th>Lås</th><th class="c">Sannsynlighet for å holde</th></tr>${brudd.map(a => {
      const l = a.laas, navn = (MC_LAAS.find(([k]) => k === l.type) || [, ''])[1], v = l.type === 'fnlt' ? 1 - a.frist : l.type === 'vindu' ? 1 - a.vindu : l.type === 'mso' ? 1 - a.mso : null;
      return `<tr><td><b>${esc(a.id)}</b> ${esc(a.navn)}</td><td class="sub">${esc(navn)} ${l.d1 ? fmtShort(l.d1) : ''}${l.d2 ? '–' + fmtShort(l.d2) : ''}</td><td class="c"><b style="color:${v === null ? 'inherit' : v >= .8 ? 'var(--green)' : v >= .5 ? '#9a6700' : 'var(--red)'}">${v === null ? '–' : Math.round(v * 100) + ' %'}</b></td></tr>`; }).join('')}</table>
      <p class="sub">«Må starte på»: andelen der forgjengerne var ferdige i tide. «Start innenfor tidsrom»: andelen der aktiviteten kunne starte før tidsrommet var ute. «Ferdig senest»: andelen der fristen ble holdt.</p>` : ''}
    <div style="margin-top:10px"><button class="btn" data-action="mc-pdf">📄 Last ned resultatet som PDF</button></div>`;
}
function mcHistogramSvg(R) {
  const W = 900, H = 260, ml = 50, mr = 50, mt = 14, mb = 46, s = R.sortert, N = s.length;
  const lo = s[0], hi = s[N - 1], span = Math.max(1, hi - lo), nb = Math.min(30, Math.max(8, Math.ceil(span)));
  const bw = span / nb, bins = new Array(nb).fill(0);
  for (const v of s) bins[Math.min(nb - 1, Math.floor((v - lo) / bw))]++;
  const maxB = Math.max(...bins), x = v => ml + (v - lo) / span * (W - ml - mr), y = c => H - mb - c / maxB * (H - mt - mb), yC = q => H - mb - q * (H - mt - mb);
  let cum = '', k = 0; for (let i = 0; i < N; i += Math.max(1, Math.floor(N / 200))) { k = i; cum += `${cum ? 'L' : 'M'}${x(s[i]).toFixed(1)},${yC(i / (N - 1)).toFixed(1)}`; }
  void k;
  const merk = (t, txt, farge) => t >= lo - 1e-9 && t <= hi + 1e-9 ? `<line x1="${x(t)}" x2="${x(t)}" y1="${mt}" y2="${H - mb}" stroke="${farge}" stroke-dasharray="4 3"/><text x="${x(t) + 3}" y="${mt + 10}" font-size="11" fill="${farge}">${txt}</text>` : '';
  const ticks = []; for (let i = 0; i <= 6; i++) { const v = lo + span * i / 6; ticks.push(`<text x="${x(v)}" y="${H - mb + 16}" font-size="11" text-anchor="middle" fill="#57606a">${fmtShort(mcSluttDato(v))}</text>`); }
  const maalT = R.maal ? mcDatoTilDag(R.maal) + 1 : null;
  return `<svg viewBox="0 0 ${W} ${H}" class="mc-svg" role="img" aria-label="Fordeling og S-kurve for prosjektslutt">
    ${bins.map((c, i) => `<rect x="${x(lo + i * bw) + 1}" y="${y(c)}" width="${Math.max(1, (W - ml - mr) / nb - 2)}" height="${H - mb - y(c)}" fill="#9cc3f5"><title>${fmtShort(mcSluttDato(lo + i * bw))}–${fmtShort(mcSluttDato(lo + (i + 1) * bw))}: ${c} iterasjoner (${(c / N * 100).toFixed(1)} %)</title></rect>`).join('')}
    <path d="${cum}" fill="none" stroke="#0b3d91" stroke-width="2.2"/>
    ${[0, .25, .5, .75, 1].map(q => `<text x="${W - mr + 6}" y="${yC(q) + 4}" font-size="11" fill="#0b3d91">${q * 100} %</text><line x1="${ml}" x2="${W - mr}" y1="${yC(q)}" y2="${yC(q)}" stroke="#eaeef2"/>`).join('')}
    <line x1="${ml}" x2="${W - mr}" y1="${H - mb}" y2="${H - mb}" stroke="#8c959f"/>
    ${ticks.join('')}
    ${merk(R.det, 'Planlagt', '#57606a')}${merk(R.pers.find(p => p.p === 50).t, 'P50', '#0b3d91')}${merk(R.pers.find(p => p.p === 80).t, 'P80', '#9a6700')}${maalT !== null ? merk(maalT, 'Mål', '#1a7f37') : ''}
    <text x="${ml}" y="${H - 8}" font-size="11" fill="#57606a">Stolper: andel iterasjoner per sluttdato · Linje: sannsynlighet for å være ferdig (S-kurve, høyre akse)</text>
  </svg>`;
}
function mcTornadoSvg(R) {
  const l = R.torn.filter(t => t.hoy - t.lav >= .5).slice(0, 15);
  if (!l.length) return '<p class="sub">Ingen aktiviteter påvirker prosjektslutten merkbart (mer enn et halvt døgn).</p>';
  // Navn i egen kolonne til venstre; søylene tegnes fra midtlinjen (snittet) mot venstre (kortere) og høyre (lengre).
  const W = 900, rad = 24, H = l.length * rad + 40, navnB = 330, felt = W - navnB - 70, midt = navnB + felt / 2;
  const maks = Math.max(...l.map(t => Math.max(Math.abs(t.lav), Math.abs(t.hoy))), .5), sk = (felt / 2 - 34) / maks;
  const navn = i => { const a = MC.akt[i], s = `${a.id} ${a.navn}`; return s.length > 44 ? s.slice(0, 43) + '…' : s; };
  const fm = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  const sole = (v, y, farge, tittel, tekst = true) => { const x = midt + v * sk, x0 = Math.min(midt, x), w = Math.max(1, Math.abs(x - midt));
    return `<rect x="${x0}" y="${y}" width="${w}" height="${rad - 8}" fill="${farge}" fill-opacity="${tekst ? 1 : .85}"><title>${tittel}</title></rect>
      ${tekst ? `<text x="${v >= 0 ? x + 4 : x - 4}" y="${y + 12}" font-size="11" text-anchor="${v >= 0 ? 'start' : 'end'}" fill="${farge === '#4ac26b' ? '#1a7f37' : '#b42318'}">${fm(v)}</text>` : ''}`; };
  return `<svg viewBox="0 0 ${W} ${H}" class="mc-svg" role="img" aria-label="Tornadodiagram">
    <line x1="${midt}" x2="${midt}" y1="10" y2="${H - 24}" stroke="#57606a"/>
    ${l.map((t, k) => { const y = 14 + k * rad;
      return `<text x="${navnB - 8}" y="${y + 13}" font-size="12" text-anchor="end" fill="#1b1f24">${esc(navn(t.i))}<title>${esc(MC.akt[t.i].id + ' ' + MC.akt[t.i].navn)}</title></text>
        ${Math.sign(t.lav) === Math.sign(t.hoy) && t.lav !== 0
          ? sole(t.hoy, y, '#e5534b', `Lang varighet: ${fm(t.hoy)} d`, false) + sole(t.lav, y + 3, '#4ac26b', `Kort varighet: ${fm(t.lav)} d`, false)
            + `<text x="${midt + (t.hoy >= 0 ? Math.max(t.lav, t.hoy) * sk + 4 : Math.min(t.lav, t.hoy) * sk - 4)}" y="${y + 12}" font-size="11" text-anchor="${t.hoy >= 0 ? 'start' : 'end'}" fill="#57606a">${fm(t.lav)} / ${fm(t.hoy)}</text>`
          : sole(t.lav, y, '#4ac26b', `Kort varighet (≤ ${t.d10.toFixed(1)} d): ${fm(t.lav)} d`) + sole(t.hoy, y, '#e5534b', `Lang varighet (≥ ${t.d90.toFixed(1)} d): ${fm(t.hoy)} d`)}
        <text x="${W - 4}" y="${y + 12}" font-size="10" text-anchor="end" fill="#57606a">r=${t.kor.toFixed(2)}</text>`; }).join('')}
    <text x="${midt}" y="${H - 6}" font-size="11" text-anchor="middle" fill="#57606a">Endring i prosjektslutt (dager) i forhold til snittet · r = korrelasjon mellom varighet og prosjektslutt</text>
  </svg>`;
}
function mcHentHtml() {
  const kand = DATA.filter(a => !a.generell && !erArkiv(a) && a.status !== 'Utført' && !MC.akt.some(m => m.ref === a.id))
    .sort((x, y) => x.startdato.localeCompare(y.startdato) || x.id.localeCompare(y.id));
  return `<div class="sub" style="margin-bottom:6px">Aktiviteter med avhengigheter i planen er allerede med. Her kan du ta med flere. Varigheten i planen blir «sannsynlig», og best = verst = sannsynlig til du legger inn usikkerhet. Avhengigheter mellom aktivitetene tas med.</div>
    <div class="toolbar"><button class="btn small-dark" data-action="mc-hent-alle">Velg alle</button><button class="btn small-dark" data-action="mc-hent-ingen">Ingen</button>
      <span style="flex:1"></span><button class="btn" data-action="mc-hent-avbryt">Avbryt</button><button class="btn primary" data-action="mc-hent-ok">Legg til valgte</button></div>
    <div class="mc-hent-liste">${kand.map(a => `<label><input type="checkbox" value="${esc(a.id)}"> <b>${esc(a.id)}</b> ${esc(a.navn)} <span class="sub">${esc(a.omrade)} · ${fmtShort(a.startdato)}–${fmtShort(endDate(a))} · ${a.varighet} d</span></label>`).join('') || '<span class="sub">Ingen flere aktiviteter å hente.</span>'}</div>`;
}
// ----- speiling av planen -----
// Varighet fra planen (arbeidsdager eller kalenderdager etter modellens kalender).
function mcPlanVarighet(a) {
  if (MC.kalender !== 'arbeid') return Math.max(1, a.varighet);
  let n = 0; for (let k = 0; k < a.varighet; k++) if (mcErArbeid(addDays(a.startdato, k))) n++;
  return Math.max(1, n);
}
const mcAvhType = t => ['FS', 'SS', 'FF', 'SF'].includes(t) ? t : t === 'SAM' ? 'SAM' : 'FS';
// Ny aktivitet fra planen: varigheten i planen er «sannsynlig», og best = verst = sannsynlig til usikkerheten legges inn.
function mcFraPlan(a, auto) {
  const d = mcPlanVarighet(a), mid = MC.akt.some(x => x.id === a.id) ? mcNyId() : a.id;
  const m = {id: mid, ref: a.id, navn: a.navn, ford: 'pert', min: d, ml: d, max: d, laas: {type: '', d1: '', d2: ''}, gruppe: '', risiko: {p: 0, min: 0, ml: 0, max: 0}};
  if (auto) m.auto = true;
  MC.akt.push(m);
  return m;
}
// Holder modellen lik planen på Statustavlen: aktiviteter som har avhengigheter i planen tas med automatisk,
// navn og varighet oppdateres, planlagt start legges inn som «start tidligst» der aktiviteten ikke styres av en forgjenger,
// og avhengighetene fra planen speiles. Usikkerhet som er lagt inn (best/verst), beholdes.
function mcSynkPlan() {
  const for_ = JSON.stringify(MC), utelatt = new Set(MC.utelatt || []);
  const gyldig = a => a && !a.generell && a.status !== 'Utført' && !erArkiv(a);
  const linket = new Set(AVH.flatMap(d => [d.fra, d.til]).filter(id => gyldig(actById(id)) && !utelatt.has(id)));
  // Automatisk tatt med, men ikke lenger koblet i planen (eller borte/utført): tas ut.
  const ut = new Set(MC.akt.filter(m => m.auto && !linket.has(m.ref)).map(m => m.id));
  MC.akt.filter(m => m.ref && !m.auto && !gyldig(actById(m.ref))).forEach(m => ut.add(m.id));
  if (ut.size) { MC.akt = MC.akt.filter(m => !ut.has(m.id)); MC.avh = MC.avh.filter(d => !ut.has(d.fra) && !ut.has(d.til)); }
  linket.forEach(id => { if (!MC.akt.some(m => m.ref === id)) mcFraPlan(actById(id), true); });
  const refs = new Map(MC.akt.filter(m => m.ref).map(m => [m.ref, m]));
  // Avhengigheter fra planen (merket med planens id) – legges til, oppdateres og fjernes i takt med planen.
  const planAvh = AVH.filter(d => refs.has(d.fra) && refs.has(d.til));
  const planIds = new Set(planAvh.map(d => d.id));
  MC.avh = MC.avh.filter(d => !d.plan || planIds.has(d.plan));
  planAvh.forEach(d => {
    const fra = refs.get(d.fra).id, til = refs.get(d.til).id, x = MC.avh.find(y => y.plan === d.id);
    if (x) Object.assign(x, {fra, til, type: mcAvhType(d.type), lag: +d.lag || 0});
    else if (!MC.avh.some(y => y.fra === fra && y.til === til)) MC.avh.push({id: uid(), plan: d.id, fra, til, type: mcAvhType(d.type), lag: +d.lag || 0});
  });
  refs.forEach((m, ref) => {
    const a = actById(ref); if (!a) return;
    m.navn = a.navn;
    const d = mcPlanVarighet(a);
    if (m.ml !== d) {
      const utenUsikkerhet = +m.min === +m.ml && +m.max === +m.ml;
      if (utenUsikkerhet) { m.min = d; m.max = d; }
      else { const dl = d - m.ml; m.min = Math.max(0, +m.min + dl); m.max = Math.max(d, +m.max + dl); }
      m.ml = d;
    }
    // Planlagt start som «start tidligst» når aktiviteten ikke har forgjengere i modellen (låsen er merket auto og følger planen).
    const harForg = MC.avh.some(x => x.til === m.id && x.type !== 'NS');
    const auto = !m.laas || !m.laas.type || m.laas.auto;
    if (auto) m.laas = !harForg && a.startdato > MC.start ? {type: 'snet', d1: a.startdato, d2: '', auto: true} : {type: '', d1: '', d2: ''};
  });
  if (JSON.stringify(MC) !== for_) { mcRes = null; mcLagre(); }
}
function mcHentLeggTil(ids) {
  const utelatt = new Set(MC.utelatt || []);
  ids.forEach(id => { const a = actById(id); if (a && !MC.akt.some(m => m.ref === id)) { mcFraPlan(a, false); utelatt.delete(id); } });
  MC.utelatt = [...utelatt];
  mcSynkPlan();
}
function mcAction(action, btn) {
  if (!isSys()) return;
  mcLast();
  if (action === 'mc-akt-ny') { MC.akt.push({id: mcNyId(), navn: 'Ny aktivitet', ford: 'pert', min: 4, ml: 5, max: 8, laas: {type: '', d1: '', d2: ''}, gruppe: '', risiko: {p: 0, min: 0, ml: 0, max: 0}}); mcRes = null; mcLagre(); renderMonte(); return; }
  if (action === 'mc-akt-slett') { const a = MC.akt[+btn.dataset.i]; if (!a || !confirm(`Slette ${a.id} ${a.navn}?`)) return; MC.akt.splice(+btn.dataset.i, 1); MC.avh = MC.avh.filter(d => d.fra !== a.id && d.til !== a.id); if (a.ref) MC.utelatt = [...new Set([...(MC.utelatt || []), a.ref])]; mcRes = null; mcLagre(); renderMonte(); return; }
  if (action === 'mc-avh-ny') { const [x, y] = MC.akt.slice(-2).map(a => a.id); MC.avh.push({id: uid(), fra: x, til: y, type: 'FS', lag: 0}); mcRes = null; mcLagre(); renderMonte(); return; }
  if (action === 'mc-avh-slett') { MC.avh.splice(+btn.dataset.i, 1); mcRes = null; mcLagre(); renderMonte(); return; }
  if (action === 'mc-tom') { if (!confirm('Tømme modellen? Aktivitetene med avhengigheter i planen hentes inn igjen automatisk; alt du har lagt inn av usikkerhet forsvinner.')) return; MC.akt = []; MC.avh = []; MC.utelatt = []; mcRes = null; mcLagre(); renderMonte(); return; }
  if (action === 'mc-std-usikker') {
    MC.akt.filter(a => +a.min === +a.ml && +a.max === +a.ml).forEach(a => { a.min = Math.max(0, Math.round(a.ml * .8 * 2) / 2); a.max = Math.round(a.ml * 1.5 * 2) / 2; });
    mcRes = null; mcLagre(); renderMonte(); return;
  }
  if (action === 'mc-hent') { const b = document.getElementById('mc-hent'); b.hidden = !b.hidden; if (!b.hidden) b.innerHTML = mcHentHtml(); return; }
  if (action === 'mc-hent-alle' || action === 'mc-hent-ingen') { document.querySelectorAll('#mc-hent input[type=checkbox]').forEach(x => { x.checked = action === 'mc-hent-alle'; }); return; }
  if (action === 'mc-hent-avbryt') { document.getElementById('mc-hent').hidden = true; return; }
  if (action === 'mc-hent-ok') { const ids = [...document.querySelectorAll('#mc-hent input:checked')].map(x => x.value); if (!ids.length) return; mcHentLeggTil(ids); mcRes = null; mcLagre(); renderMonte(); showToast(`${ids.length} aktiviteter lagt til i modellen.`); return; }
  if (action === 'mc-kjor') {
    if (mcKjorer || mcSjekk().length) return;
    mcKjorer = true; renderMonte();
    const fr = document.getElementById('mc-fremdrift');
    setTimeout(async () => {
      try { mcRes = await mcKjor(p => { if (fr) fr.textContent = `Kjører … ${Math.round(p * 100)} %`; }); }
      catch (e) { alert('Simuleringen feilet: ' + (e.message || e)); }
      mcKjorer = false; renderMonte();
    }, 20);
    return;
  }
  if (action === 'mc-pdf' && mcRes) {
    (async () => {
      let boks = null;
      try {
        await lastSkript('vendor/pdfgen/html2canvas.min.js'); await lastSkript('vendor/pdfgen/jspdf.umd.min.js');
        boks = document.createElement('div'); boks.className = 'rp-pdf-boks';
        boks.style.cssText = 'position:absolute;left:-1400px;top:0;width:1000px;background:#fff;padding:20px;font-family:Arial,Helvetica,sans-serif';
        boks.innerHTML = `<div class="rp-topptekst">Monte Carlo-simulering · ${esc(MC.navn)}</div><div class="sub">Start ${fmtNo(MC.start)} · ${MC.akt.length} aktiviteter · ${MC.avh.length} avhengigheter · ${mcRes.N} iterasjoner · ${MC.kalender === 'arbeid' ? 'arbeidsdager' : 'kalenderdager'} · kjørt ${fmtNo(mcRes.tid.slice(0, 10))}</div>` + mcResHtml(mcRes);
        boks.querySelectorAll('button').forEach(x => x.remove());
        document.body.appendChild(boks);
        await lagPdf(boks, `Monte Carlo ${TODAY}.pdf`, `Monte Carlo-simulering WRK - ${fmtNo(TODAY)}`);
      } catch (e) { alert('Kunne ikke lage PDF: ' + (e.message || e)); }
      finally { if (boks) boks.remove(); }
    })();
  }
}
document.addEventListener('change', e => {
  const el = e.target; if (!el.closest || !el.closest('#page-monte') || !isSys()) return;
  mcLast();
  if (el.dataset.mcs) { const k = el.dataset.mcs; MC[k] = ['iter', 'seed'].includes(k) ? Math.max(1, Math.round(+el.value || 1)) : el.value; if (k === 'start' && !el.value) MC.start = mondayOf(TODAY); mcRes = null; mcLagre(); renderMonte(); return; }
  const tr = el.closest('tr');
  if (el.dataset.mc && tr && tr.dataset.mci !== undefined) {
    const a = MC.akt[+tr.dataset.mci]; if (!a) return;
    const k = el.dataset.mc, tall = ['min', 'ml', 'max', 'risiko.p', 'risiko.min', 'risiko.ml', 'risiko.max'].includes(k);
    let v = tall ? Math.max(0, +el.value || 0) : el.value.trim();
    if (k === 'id') {
      v = v.replace(/\s+/g, ''); if (!v || MC.akt.some(x => x !== a && x.id === v)) { alert('ID-en må være unik og kan ikke være tom.'); renderMonte(); return; }
      MC.avh.forEach(d => { if (d.fra === a.id) d.fra = v; if (d.til === a.id) d.til = v; });
    }
    const [p, q] = k.split('.');
    if (q) { a[p] = {...(a[p] || {}), [q]: v}; } else a[k] = v;
    mcRes = null; mcLagre();
    if (['ford', 'laas.type', 'risiko.p', 'id'].includes(k)) renderMonte();
    return;
  }
  if (el.dataset.mcdF && tr && tr.dataset.mcd !== undefined) {
    const d = MC.avh[+tr.dataset.mcd]; if (!d) return;
    d[el.dataset.mcdF] = el.dataset.mcdF === 'lag' ? +el.value || 0 : el.value;
    mcRes = null; mcLagre(); renderMonte();
  }
});
