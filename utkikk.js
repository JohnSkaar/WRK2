// Utkikksplan: prøveversjon av statustavlen, 12 uker fram med zoom per uke, dag, dagsperiode og time.
// Trykk på en uke for å vise dagene, på en dag for å vise periodene og på en periode for å vise timene. Et nytt trykk lukker nivået igjen.
// Ukene etter de første åtte er grå, med mindre «Fargelegg 8 uker+» er slått på.
const UK_UKER = 12, UK_FARGE_UKER = 8, UK_LANE = 28, UK_PAD = 7, UK_GRA = '#c4c9cf';
const UK_BREDDE = {uke: 112, dag: 64, periode: 56, time: 34};   // minstebredde i px; tidslinjen strekkes ut når det er plass
const UK_PERIODER = [[0, 7, '24–07'], [7, 11, '07–11'], [11, 16, '11–16'], [16, 19.5, '16–19:30'], [19.5, 24, '19:30–24']];
const UK_DAGNAVN = ['ma', 'ti', 'ons', 'tor', 'fre', 'lør', 'søn'];
let ukItems = [], ukLeaves = [];
const ukKl = h => String(Math.floor(h)).padStart(2, '0') + (h % 1 ? ':' + String(Math.round(h % 1 * 60)).padStart(2, '0') : '');

// Tidslinjen er en liste med blader (minste synlige enhet) i rekkefølge, hver med tid i timer fra første mandag.
function ukBygg(from, skala) {
  const st = ui.utkikk, leaves = [], hode = {uke: [], dag: [], periode: [], time: []};
  let x = 0;
  const blad = (t0, t1, w, niva, d) => { leaves.push({t0, t1, x0: x, w: w * skala, niva, d}); x += w * skala; };
  for (let i = 0; i < UK_UKER; i++) {
    const wk = addDays(from, i * 7), xu = x;
    if (!st.uker.has(wk)) blad(i * 168, (i + 1) * 168, UK_BREDDE.uke, 'uke', wk);
    else for (let j = 0; j < 7; j++) {
      const d = addDays(wk, j), td = (i * 7 + j) * 24, xd = x;
      if (!st.dager.has(d)) blad(td, td + 24, UK_BREDDE.dag, 'dag', d);
      else UK_PERIODER.forEach(([p0, p1, navn], pi) => {
        const xp = x, nok = d + '|' + pi;
        if (!st.perioder.has(nok)) blad(td + p0, td + p1, UK_BREDDE.periode, 'periode', d);
        else {
          const grenser = [...new Set([p0, ...Array.from({length: Math.ceil(p1) - Math.floor(p0) + 1}, (_, k) => Math.floor(p0) + k).filter(h => h > p0 && h < p1), p1])];
          grenser.slice(0, -1).forEach((h, k) => { const xh = x; blad(td + h, td + grenser[k + 1], UK_BREDDE.time, 'time', d); hode.time.push({x0: xh, w: x - xh, txt: ukKl(h)}); });
        }
        hode.periode.push({x0: xp, w: x - xp, txt: navn, key: nok, apen: st.perioder.has(nok), helg: j >= 5});
      });
      hode.dag.push({x0: xd, w: x - xd, txt: `${UK_DAGNAVN[j]} ${fmtShort(d)}`, key: d, apen: st.dager.has(d), helg: j >= 5});
    }
    hode.uke.push({x0: xu, w: x - xu, txt: `Uke ${isoWeek(wk)}`, sub: `${fmtShort(wk)}–${fmtShort(addDays(wk, 6))}`, key: wk, apen: st.uker.has(wk), na: i === 0, etter: i >= UK_FARGE_UKER});
  }
  return {leaves, hode, bredde: x};
}
function ukX(t) {
  const L = ukLeaves;
  if (!L.length) return 0;
  if (t <= L[0].t0) return 0;
  for (const l of L) if (t <= l.t1) return l.x0 + (t - l.t0) / (l.t1 - l.t0) * l.w;
  const s = L[L.length - 1]; return s.x0 + s.w;
}
function ukNaturligBredde(st) {
  let w = 0;
  for (let i = 0; i < UK_UKER; i++) {
    const wk = addDays(mondayOf(TODAY), i * 7);
    if (!st.uker.has(wk)) { w += UK_BREDDE.uke; continue; }
    for (let j = 0; j < 7; j++) {
      const d = addDays(wk, j);
      if (!st.dager.has(d)) { w += UK_BREDDE.dag; continue; }
      UK_PERIODER.forEach(([p0, p1], pi) => { w += st.perioder.has(d + '|' + pi) ? (Math.ceil(p1) - Math.floor(p0)) * UK_BREDDE.time : UK_BREDDE.periode; });
    }
  }
  return w;
}


// ---------- Planleggingsaktiviteter (egne for Utkikksplan, påvirker ikke den vanlige planen) ----------
// En planleggingsaktivitet: {id, navn, mor, omrade, fra, til, timer, laast}. fra/til er 'ÅÅÅÅ-MM-DDTtt:mm'.
// «mor» er en aktivitet i planen (eller en annen planleggingsaktivitet). Navnet vises som «Mor - Navn», og timeverket
// til mora er en fast sum som deles mellom delene; det som ikke er fordelt, ligger igjen på mora. Uten mor blir den grå.
const UK_KEY = 'wrk2_utkikk', UK_UTEN_MOR = '#8c959f';
let UKP = null;
function ukLast() {
  if (UKP) return UKP;
  try { UKP = JSON.parse(localStorage.getItem(UK_KEY)); } catch (e) { UKP = null; }
  if (!UKP || !Array.isArray(UKP.akt)) UKP = {akt: [], restLaast: {}};
  if (!UKP.restLaast) UKP.restLaast = {};
  return UKP;
}
let ukLagreT = null;
function ukLagre() {
  clearTimeout(ukLagreT);
  ukLagreT = setTimeout(() => {
    const ut = {...UKP, akt: UKP.akt.filter(p => !p.ny)};
    try { localStorage.setItem(UK_KEY, JSON.stringify(ut)); } catch (e) {}
    if (typeof CLOUD !== 'undefined' && CLOUD && window.cloudUkLagre) window.cloudUkLagre(JSON.parse(JSON.stringify(ut)));
  }, 400);
}
// Fra skyen (cloud.js): erstatter planleggingsaktivitetene når en annen økt har lagret, men ikke mens dialogen er åpen.
window.ukFraSky = m => {
  if (!m || !Array.isArray(m.akt) || ukDlg) return;
  if (UKP && JSON.stringify(m) === JSON.stringify({...UKP, akt: UKP.akt.filter(p => !p.ny)})) return;
  UKP = {restLaast: {}, ...m};
  try { localStorage.setItem(UK_KEY, JSON.stringify(UKP)); } catch (e) {}
  if (ukPa()) renderUtkikk();
};

// Tid regnes i timer fra mandag denne uken.
const ukFra = () => mondayOf(TODAY);
const ukT = dt => daysBetween(ukFra(), dt.slice(0, 10)) * 24 + (+dt.slice(11, 13) || 0) + (+dt.slice(14, 16) || 0) / 60;
function ukDt(t) {
  let d = Math.floor(t / 24), min = Math.round((t - d * 24) * 60);
  if (min >= 1440) { d++; min -= 1440; }
  return `${addDays(ukFra(), d)}T${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}
const ukTidTekst = (t0, t1) => { const a = ukDt(t0), b = ukDt(t1), kl = s => s.slice(11) === '00:00' ? '' : ' ' + s.slice(11); return `${fmtShort(a.slice(0, 10))}${kl(a)} – ${fmtShort(b.slice(0, 10))}${kl(b)}`; };
// Foreløpig timeverk: 2 personer à 12 timer hver dag fra mandag til lørdag (kortere enn et døgn: timene i intervallet, maks 12).
function ukStdTimer(t0, t1) {
  let sum = 0;
  for (let d = Math.floor(t0 / 24); d * 24 < t1; d++) {
    if (((d % 7) + 7) % 7 === 6) continue;
    sum += Math.min(12, Math.min(t1, (d + 1) * 24) - Math.max(t0, d * 24)) * 2;
  }
  return Math.round(sum * 10) / 10;
}
const ukDataT = a => [daysBetween(ukFra(), a.startdato) * 24, (daysBetween(ukFra(), endDate(a)) + 1) * 24];
const ukPlan = id => ukLast().akt.find(p => p.id === id);
const ukErData = id => !ukPlan(id) && !!actById(id);
function ukNavn(id, n = 0) {
  const p = ukPlan(id);
  if (!p) { const a = actById(id); return a ? a.navn : '(slettet aktivitet)'; }
  return p.mor && n < 8 ? ukNavn(p.mor, n + 1) + ' - ' + p.navn : p.navn;
}
const ukIdTekst = id => ukErData(id) ? id + ' ' : '';
function ukTotal(id) { const p = ukPlan(id); if (p) return +p.timer || 0; const a = actById(id); return a ? ukStdTimer(...ukDataT(a)) : 0; }
const ukBarn = id => ukLast().akt.filter(p => p.mor === id);
const ukRest = id => Math.round((ukTotal(id) - ukBarn(id).reduce((n, p) => n + (+p.timer || 0), 0)) * 10) / 10;
// Fargen og firmaet kommer fra den øverste aktiviteten i planen; uten mor blir det grått.
function ukRotData(p) { let n = 0; while (p && n++ < 10) { if (!ukPlan(p.mor)) return actById(p.mor) || null; p = ukPlan(p.mor); } return null; }
const ukEtterkommer = (id, kand) => { let p = ukPlan(kand), n = 0; while (p && n++ < 10) { if (p.id === id) return true; p = ukPlan(p.mor); } return false; };
const ukGyldigMor = (id, kand) => kand && kand !== id && !ukEtterkommer(id, kand);
// Timer settes på én del; differansen tas fra (eller gis til) de åpne delene i samme gruppe, inkludert det som ikke er fordelt på mora.
function ukFordel(morId, key, v) {
  const parts = [...ukBarn(morId).map(p => ({key: p.id, t: +p.timer || 0, laast: !!p.laast})), {key: 'rest', t: ukRest(morId), laast: !!ukLast().restLaast[morId]}];
  const meg = parts.find(p => p.key === key), andre = parts.filter(p => p !== meg && !p.laast);
  if (!meg || !andre.length) return false;
  const ledig = andre.reduce((n, p) => n + Math.max(0, p.t), 0);
  v = Math.max(0, Math.min(v, meg.t + ledig));
  const delta = v - meg.t;
  if (delta > 0) andre.forEach(p => { p.t -= ledig ? delta * Math.max(0, p.t) / ledig : 0; });
  else if (delta < 0) andre.forEach(p => { p.t += -delta / andre.length; });
  meg.t = v;
  parts.forEach(p => { if (p.key !== 'rest') ukPlan(p.key).timer = Math.round(p.t * 10) / 10; });
  return true;
}
function ukKnytt(p, morId) {
  p.mor = morId || null;
  if (p.ny) p.timer = ukStdTimer(ukT(p.fra), ukT(p.til));
  if (p.mor) { const r = ukRest(p.mor); if (r < 0) p.timer = Math.max(0, Math.round((p.timer + r) * 10) / 10); }
}
let ukNr = 0;
const ukNyId = () => 'P' + Date.now().toString(36).slice(-5) + (ukNr++);

// ---------- Soner: hierarki som kan åpnes og lukkes, slik som tidslinjen ----------
const UK_SONETRE = {
  '8302 - Kjeller': ['8302 - Kjeller / Vest', '8302 - Kjeller / Øst', '8302 - Kjeller / Kjellerinnkjøring'],
  '8302 - Kjeller / Kjellerinnkjøring': ['8302 - Kjeller / Kjellerinnkjøring / Rampe', '8302 - Kjeller / Kjellerinnkjøring / Uteplass kjeller']
};
function ukSoner(omrader) {
  const barn = new Map(Object.entries(UK_SONETRE).map(([k, v]) => [k, [...v]])), forelder = new Map();
  barn.forEach((l, k) => l.forEach(c => forelder.set(c, k)));
  const alle = [...SK_ZONE_ORDER, ...[...new Set(omrader)].filter(z => !SK_ZONE_ORDER.includes(z)).sort()];
  alle.forEach(z => {
    if (barn.has(z) || forelder.has(z)) return;
    const p = [...barn.keys()].filter(k => z.startsWith(k + ' / ')).sort((x, y) => y.length - x.length)[0];
    if (p) { barn.get(p).push(z); forelder.set(z, p); }
  });
  const rot = z => { let n = 0; while (forelder.has(z) && n++ < 10) z = forelder.get(z); return z; };
  const topp = [];
  alle.forEach(z => { const r = rot(z); if (!topp.includes(r)) topp.push(r); });
  const alleNokler = [];
  const dfs = (z, d) => { alleNokler.push({z, d}); (barn.get(z) || []).forEach(c => dfs(c, d + 1)); };
  topp.forEach(z => dfs(z, 0));
  return {topp, barn, forelder, alleNokler};
}
const ukSoneNavn = (z, forelder) => forelder.has(z) ? z.slice(forelder.get(z).length + 3) : z;

let ukSoneInfo = null;
function renderUtkikk() {
  const st = ui.utkikk;
  ukLast();
  renderFirmFilter('utkikk');
  document.getElementById('uk-lys').value = st.lys;
  document.getElementById('uk-farg').checked = st.farg;
  document.getElementById('uk-reset').hidden = !st.uker.size;
  const pb = document.getElementById('uk-plan-btn');
  pb.classList.toggle('on', st.plan); pb.textContent = st.plan ? '✔ Avslutt planleggingsmodus' : '🛠 Planleggingsmodus';
  const from = ukFra(), to = addDays(from, UK_UKER * 7 - 1), tMax = UK_UKER * 168;
  const panel = document.getElementById('uk-panel');
  panel.classList.toggle('planlegg', st.plan);
  const tilgjengelig = Math.max(400, (panel.clientWidth || 1200) - 202);
  const skala = Math.max(1, tilgjengelig / ukNaturligBredde(st));
  const {leaves, hode, bredde} = ukBygg(from, skala);
  ukLeaves = leaves;
  const tGrense = UK_FARGE_UKER * 168, xGrense = ukX(tGrense);

  const items = DATA.filter(a => !a.generell && matches(a, st) && a.startdato <= to && endDate(a) >= from).map(a => {
    const [t0, t1] = ukDataT(a);
    return {a, s: totalStatus(a), id: a.id, omrade: a.omrade, t0, t1, navn: a.navn, farge: firmColor(a.firma), start: a.startdato, ferdig: a.status === 'Utført'};
  }).filter(({s}) => !st.lys || (st.lys === 'avvik' ? s.lys === 'rod' || s.lys === 'gul' : s.lys === st.lys));
  // Planleggingsaktivitetene vises bare når «Vis» står på alle (de har ikke statuslys).
  if (!st.lys) ukLast().akt.forEach(p => {
    const t0 = ukT(p.fra), t1 = ukT(p.til), rot = ukRotData(p), q = st.search.trim().toLowerCase();
    if (t1 <= 0 || t0 >= tMax) return;
    if (st.firms && !(rot && st.firms.has(rot.firma))) return;
    if (q && ![ukNavn(p.id), p.omrade].some(x => String(x).toLowerCase().includes(q))) return;
    items.push({p, plan: true, id: p.id, omrade: p.omrade, t0, t1, navn: ukNavn(p.id), farge: p.mor ? (rot ? firmColor(rot.firma) : '#6e7781') : UK_UTEN_MOR, start: p.fra});
  });

  const S = ukSoneInfo = ukSoner([...DATA.map(a => a.omrade), ...ukLast().akt.map(p => p.omrade)]);
  const under = z => [z, ...(S.barn.get(z) || []).flatMap(under)];
  const forfedre = z => { const l = []; let n = 0; while (S.forelder.has(z) && n++ < 10) { z = S.forelder.get(z); l.push(z); } return l; };
  const filter = st.soneFilter;
  const synlig = z => !filter || filter.has(z) || forfedre(z).some(f => filter.has(f));
  const valgtUnder = z => (S.barn.get(z) || []).some(c => filter.has(c) || valgtUnder(c));
  const rader = [];
  const besok = (z, d) => {
    const barn = S.barn.get(z) || [], erF = barn.length > 0, apen = erF && st.sonerApne.has(z);
    if (synlig(z)) { rader.push({z, d, erF, apen, soner: apen ? [z] : under(z)}); if (apen) barn.forEach(c => besok(c, d + 1)); }
    else if (filter && valgtUnder(z)) barn.forEach(c => besok(c, d));
  };
  S.topp.forEach(z => besok(z, 0));

  ukItems = [];
  const rows = rader.map(r => {
    const zs = items.filter(x => r.soner.includes(x.omrade)).sort((p, q) => p.t0 - q.t0 || p.id.localeCompare(q.id));
    const lanes = [];
    zs.forEach(it => {
      const x0 = ukX(Math.max(0, it.t0)), x1 = ukX(Math.min(tMax, it.t1)), tekst = ((it.a ? it.id + ' ' : '') + it.navn).length * 6.3 + 30;
      const ute = x1 - x0 < Math.min(tekst, 140);
      const opptatt = ute ? x1 + 6 + Math.min(it.navn.length, 34) * 6.3 + 40 : x1;
      let k = lanes.findIndex(end => end < x0 + 1);
      if (k < 0) { k = lanes.length; lanes.push(0); }
      lanes[k] = opptatt;
      Object.assign(it, {k, x0, x1, ute, cutL: it.t0 < 0, cutR: it.t1 > tMax});
    });
    const h = zs.length ? lanes.length * UK_LANE + UK_PAD * 2 - 6 : 38;
    const bars = zs.map(it => {
      const i = ukItems.push(it) - 1, c = it.farge;
      // Etter 8 uker blir stolpen grå (også den delen av en stolpe som strekker seg forbi grensen).
      let bg = c, fg = svTextColor(c);
      if (!st.farg && it.x1 > xGrense) {
        if (it.x0 >= xGrense) { bg = UK_GRA; fg = '#24292f'; }
        else bg = `linear-gradient(to right, ${c} 0 ${xGrense - it.x0}px, ${UK_GRA} ${xGrense - it.x0}px)`;
      }
      const idTxt = it.a ? esc(it.id) + ' ' : '';
      const lab = it.ute ? `<div class="sv-lab uk-lab${it.ferdig ? ' done' : ''}" data-i="${i}" style="left:${it.x1 + 3}px;top:${UK_PAD + it.k * UK_LANE}px">${it.cutL ? '◂ ' : ''}${it.a ? `<b>${esc(it.id)}</b> ` : ''}${esc(it.navn.length > 34 ? it.navn.slice(0, 33) + '…' : it.navn)}</div>` : '';
      return `<div class="sv-bar uk-bar${it.plan ? ' uk-plan' : ''}${it.cutL ? ' cut-l' : ''}${it.cutR ? ' cut-r' : ''}${it.ferdig ? ' done' : ''}${ukDlg && ukDlg.id === it.id ? ' uk-valgt' : ''}${it.p && it.p.ny ? ' uk-ny' : ''}" data-i="${i}"
        style="left:${it.x0}px;width:${Math.max(4, it.x1 - it.x0 - 2)}px;top:${UK_PAD + it.k * UK_LANE}px;background:${bg};color:${fg}">
        ${it.a ? `<span class="sv-lys ${it.s.lys}"></span>` : ''}${it.ute ? '' : `<span class="txt">${it.cutL ? '◂ ' : ''}${idTxt}${esc(it.navn)}</span>`}${st.plan ? '<span class="uk-splitt" title="Splitt aktiviteten: lag en ny del rett bak">✂</span>' : ''}</div>${lab}`;
    }).join('');
    const valgt = st.velger ? st.valgte.has(r.z) : false;
    return `<div class="sv-row" data-zone="${esc(r.z)}">
      <div class="sv-left uk-sone${valgt ? ' valgt' : ''}${r.d ? ' barn' : ''}" data-sone="${esc(r.z)}" style="padding-left:${10 + r.d * 16}px" title="${r.erF ? (r.apen ? 'Trykk for å lukke undersonene' : 'Trykk for å vise undersonene') : ''}${st.plan ? (r.erF ? ' · ' : '') + 'Ctrl + trykk for å velge sonen' : ''}">
        <span>${r.erF ? `<span class="uk-caret">${r.apen ? '▾' : '▸'}</span>` : ''}${esc(ukSoneNavn(r.z, S.forelder))}</span>${zs.length ? `<span class="cnt">${zs.length} aktivitet${zs.length === 1 ? '' : 'er'}${r.erF && !r.apen ? ' i alt' : ''}</span>` : ''}</div>
      <div class="sv-time" style="height:${h}px;width:${bredde}px;flex:none">${bars}</div>
    </div>`;
  }).join('');

  // Bakgrunn: en kolonne per blad, helg markert når dagene vises; ukene etter de første åtte litt skyggelagt.
  const bg = leaves.map(l => {
    const dag = new Date(l.d + 'T12:00:00').getDay(), helg = l.niva !== 'uke' && (dag === 0 || dag === 6);
    return `<div class="uk-bg${helg ? ' we' : ''}${l.t0 % 168 === 0 ? ' wk' : l.t0 % 24 === 0 ? ' dg' : ''} uk-${l.niva}" style="left:${l.x0}px;width:${l.w}px"></div>`;
  }).join('') + `<div class="uk-etter" style="left:${xGrense}px"></div>`;
  const naa = new Date(), tNaa = daysBetween(from, TODAY) * 24 + naa.getHours() + naa.getMinutes() / 60;
  const celle = (c, niva) => `<div class="uk-c uk-${niva}${c.apen ? ' apen' : ''}${c.na ? ' now' : ''}${c.helg ? ' we' : ''}${c.etter ? ' etter' : ''}" style="left:${c.x0}px;width:${c.w}px"${c.key ? ` data-action="uk-zoom" data-niva="${niva}" data-key="${esc(c.key)}" title="${c.apen ? 'Trykk for å lukke' : niva === 'uke' ? 'Trykk for å vise dagene' : niva === 'dag' ? 'Trykk for å vise periodene' : 'Trykk for å vise timene'}"` : ''}>${esc(c.txt)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</div>`;
  const hodeRad = niva => hode[niva].length ? `<div class="uk-hrad uk-h-${niva}">${hode[niva].map(c => celle(c, niva)).join('')}</div>` : '';

  document.getElementById('uk-chart').innerHTML = `<div class="sv-scroll"><div class="sv-grid" style="width:${bredde + 200}px;min-width:0">
    <div class="sv-head">
      <div class="sv-left">Sone</div>
      <div class="sv-time" style="width:${bredde}px;flex:none">${hodeRad('uke')}${hodeRad('dag')}${hodeRad('periode')}${hodeRad('time')}</div>
    </div>
    <div style="position:relative">
      <div class="uk-bgwrap" style="position:absolute;top:0;bottom:0;left:200px;width:${bredde}px;pointer-events:none">${bg}<div class="sv-today" style="left:${ukX(tNaa)}px" title="Nå"></div></div>
      ${rows}
    </div>
  </div></div>`;

  const firmsShown = FIRMS.map(f => f.navn).filter(n => items.some(x => x.a && x.a.firma === n));
  document.getElementById('uk-legend').innerHTML = `<span><b>Totalstatus:</b></span>
    <span><span class="sv-lys rod"></span> Rød – noe er ikke avklart</span><span><span class="sv-lys gul"></span> Gul – under avklaring</span>
    <span><span class="sv-lys ikke"></span> Grå – ikke ferdig vurdert</span><span><span class="sv-lys gronn"></span> Grønn – alt avklart</span>
    ${firmsShown.length ? `<span style="margin-left:10px"><b>Firma:</b></span>${firmsShown.map(f => firmBadge(f)).join(' ')}` : ''}
    <span class="muted">${st.farg ? '' : 'Grå stolpe = etter 8 uker · '}Blek stolpe = utført · ◂ = startet før denne uken · trykk på uke, dag eller periode i overskriften for å zoome · ▸ ved en sone viser undersonene</span>
    ${st.plan ? `<span class="uk-planhint">🛠 <b>Planleggingsmodus:</b> pek i planen og trykk ＋ for ny aktivitet · dobbeltrykk på en aktivitet for detaljer og timeverk · ✂ splitter · Ctrl + trykk på soner og Enter for å velge soner · stiplet ramme = planleggingsaktivitet, grå = uten overordnet aktivitet</span>` : ''}`;
  ukSonebar();
}

// Knappene nederst ved sonene: «Velg flere soner» og «Vis alle soner».
function ukSonebar() {
  const st = ui.utkikk, el = document.getElementById('uk-sonebar');
  const r = document.getElementById('uk-panel').getBoundingClientRect();
  el.style.left = Math.max(8, r.left + 6) + 'px';
  el.innerHTML = st.velger
    ? `<div class="sub"><b>Velg soner:</b> trykk på sonene (eller Ctrl + trykk). ${st.valgte.size} valgt.</div>
       <button class="btn small-btn primary" data-action="uk-sone-ok">Vis valgte (Enter)</button><button class="btn small-btn" data-action="uk-sone-avbryt">Avbryt (Esc)</button>`
    : `<button class="btn small-btn" data-action="uk-sone-velg">Velg flere soner</button>${st.soneFilter ? `<button class="btn small-btn" data-action="uk-sone-alle">Vis alle soner</button><div class="sub">Viser ${st.soneFilter.size} valgt${st.soneFilter.size === 1 ? '' : 'e'} sone${st.soneFilter.size === 1 ? '' : 'r'}</div>` : ''}`;
}

// ---------- Boble ----------
function ukTimeTipHtml(it) {
  const id = it.id, rader = (morId) => {
    const barn = ukBarn(morId), rest = ukRest(morId);
    return `<ul>${barn.map(c => `<li><span>${c.laast ? '🔒' : '·'}</span><span>${esc(c.navn)}: <b>${fmtTimer(c.timer)}</b></span></li>`).join('')}
      <li><span>${ukLast().restLaast[morId] ? '🔒' : '·'}</span><span>Ikke fordelt: <b style="${rest < 0 ? 'color:var(--red)' : ''}">${fmtTimer(rest)}</b></span></li></ul>`;
  };
  const p = it.p, mor = p && p.mor;
  return `<h4>${it.a ? esc(id) + ' ' : ''}${esc(it.navn)}</h4>
    <div class="sub">${esc(ukSoneInfo ? ukSoneNavn(it.omrade, ukSoneInfo.forelder) : it.omrade)} · ${it.a ? `${fmtNo(it.a.startdato)}–${fmtNo(endDate(it.a))}` : ukTidTekst(it.t0, it.t1)}</div>
    <div class="tot ikke">⏱ Timeverk: ${fmtTimer(ukTotal(id))}</div>
    ${it.a ? '<div class="sub">Foreløpig: 2 personer × 12 timer per dag, mandag–lørdag.</div>' : ''}
    ${p && !mor ? '<div class="sub">Uten overordnet aktivitet (grå).</div>' : ''}
    ${mor ? `<div class="sec">Del av ${esc(ukIdTekst(mor) + ukNavn(mor))} · fast sum ${fmtTimer(ukTotal(mor))}</div>${rader(mor)}` : ''}
    ${ukBarn(id).length ? `<div class="sec">Fordelt på delene</div>${rader(id)}` : ''}
    ${ui.utkikk.plan ? '<div class="sub" style="margin-top:6px">Dobbeltrykk for å endre · ✂ for å splitte</div>' : ''}`;
}
const fmtTimer = t => `${String(Math.round((+t || 0) * 10) / 10).replace('.', ',')} t`;
function ukShowTip(bar) {
  const tip = document.getElementById('uk-tip');
  document.querySelectorAll('.uk-bar.hover').forEach(x => x !== bar && x.classList.remove('hover'));
  if (!bar || ukDlg) { tip.hidden = true; return; }
  if (tip.dataset.i === bar.dataset.i && !tip.hidden) return;
  bar.classList.add('hover');
  tip.dataset.i = bar.dataset.i;
  const it = ukItems[Number(bar.dataset.i)];
  // I planleggingsmodus vises timeverket i stedet for sunnheten.
  tip.innerHTML = ui.utkikk.plan || it.plan ? ukTimeTipHtml(it) : svTipHtml(it);
  tip.hidden = false;
  const panel = document.getElementById('uk-panel').getBoundingClientRect(), r = bar.getBoundingClientRect();
  const w = tip.offsetWidth, h = tip.offsetHeight;
  const anchor = Math.max(r.left, Math.min(r.right, r.left + 40)) - panel.left;
  const left = Math.max(4, Math.min(anchor - 30, panel.width - w - 4));
  const above = r.top - h - 12 > 0;
  tip.classList.toggle('above', above); tip.classList.toggle('below', !above);
  tip.style.left = left + 'px';
  tip.style.top = (above ? r.top - panel.top - h - 10 : r.bottom - panel.top + 10) + 'px';
  tip.style.setProperty('--ax', Math.max(10, Math.min(w - 22, anchor - left - 6)) + 'px');
}
// Hendelser kan komme før hovedskriptet (med currentTab) er lastet.
const ukPa = () => typeof currentTab !== 'undefined' && currentTab === 'utkikk';
const ukBarOf = el => {
  const x = el && el.closest && el.closest('.uk-bar, .uk-lab');
  return x ? (x.classList.contains('uk-bar') ? x : document.querySelector(`#uk-chart .uk-bar[data-i="${x.dataset.i}"]`)) : null;
};

// ---------- Ny aktivitet og splitt ----------
function ukNy(omrade, t0, t1, mor) {
  const p = {id: ukNyId(), navn: '', mor: null, omrade, fra: ukDt(t0), til: ukDt(t1), timer: ukStdTimer(t0, t1), laast: false, ny: true};
  ukLast().akt.push(p);
  if (mor) ukKnytt(p, mor);
  return p;
}
function ukSplitt(it) {
  const mor = it.p ? (it.p.mor || it.p.id) : it.id, len = it.t1 - it.t0;
  const p = {id: ukNyId(), navn: 'Ny del', mor, omrade: it.omrade, fra: ukDt(it.t1), til: ukDt(it.t1 + len), timer: 0, laast: false};
  // Den nye delen får halvparten av det som ikke er fordelt på mora.
  p.timer = Math.max(0, Math.round(ukRest(mor) / 2 * 10) / 10);
  ukLast().akt.push(p);
  ukLagre(); renderUtkikk();
  ukApne(p.id, true);
}

// ---------- Dialog ----------
let ukDlg = null, ukSvelg = 0;
function ukApne(id, fokusNavn) {
  ukDlg = {id, morAktiv: false, morSok: null};
  document.getElementById('uk-tip').hidden = true;
  ukDlgRender(true);
  renderUtkikk();
  const el = document.querySelector(`#uk-dlg [data-ukf="navn"]`);
  if (el && fokusNavn) { el.focus(); el.select(); }
}
function ukLukk(lagre) {
  if (!ukDlg) return;
  const p = ukPlan(ukDlg.id);
  if (p && p.ny) {
    if (lagre) { delete p.ny; if (!p.navn.trim()) p.navn = 'Ny aktivitet'; showToast(`«${ukNavn(p.id)}» er lagt inn.`); }
    else UKP.akt = UKP.akt.filter(x => x !== p);
  }
  ukDlg = null;
  document.getElementById('uk-dlg').hidden = true;
  ukLagre(); renderUtkikk();
}
function ukFordelingHtml(morId, egen) {
  const barn = ukBarn(morId), rest = ukRest(morId), restL = !!ukLast().restLaast[morId];
  const laas = (key, on) => `<button type="button" class="uk-laas${on ? ' on' : ''}" data-uklaas="${esc(key)}" title="${on ? 'Låst – beholder timene. Trykk for å låse opp' : 'Åpen – gir og får timer når andre endres. Trykk for å låse'}">${on ? '🔒' : '🔓'}</button>`;
  return `<table class="uk-ford">
    ${barn.map(c => `<tr class="${c.id === egen ? 'meg' : ''}"><td>${esc(c.navn || '(uten navn)')}${c.id === egen ? ' <span class="sub">(denne)</span>' : ''}</td>
      <td><input type="number" min="0" step="0.5" data-ukt="${esc(c.id)}" value="${Math.round((+c.timer || 0) * 10) / 10}"> t</td><td>${laas(c.id, c.laast)}</td></tr>`).join('')}
    <tr class="rest"><td>Ikke fordelt (på ${esc(ukNavn(morId))})</td><td><b style="${rest < 0 ? 'color:var(--red)' : ''}">${fmtTimer(rest)}</b></td><td>${laas('rest:' + morId, restL)}</td></tr>
    </table><div class="sub">Fast sum ${fmtTimer(ukTotal(morId))}.${rest < 0 ? ' <b style="color:var(--red)">Delene har flere timer enn summen.</b>' : ''} Endrer du timene på en del, tas eller gis differansen til de åpne (🔓).</div>`;
}
function ukMorListe() {
  const q = (ukDlg.morSok || '').trim().toLowerCase(), id = ukDlg.id;
  const kand = [...DATA.filter(a => !a.generell).map(a => ({id: a.id, txt: a.id + ' ' + a.navn, sub: a.omrade})),
    ...ukLast().akt.filter(p => !p.ny).map(p => ({id: p.id, txt: ukNavn(p.id), sub: p.omrade}))]
    .filter(k => ukGyldigMor(id, k.id) && (!q || (k.txt + ' ' + k.sub).toLowerCase().includes(q))).slice(0, 40);
  return `<div data-ukmor="">— Ingen (blir grå) —</div>` + kand.map(k => `<div data-ukmor="${esc(k.id)}"><b>${esc(k.txt)}</b> <span class="sub">${esc(k.sub)}</span></div>`).join('');
}
function ukDlgRender(plasser) {
  const box = document.getElementById('uk-dlg'), id = ukDlg.id, p = ukPlan(id), a = !p && actById(id);
  if (!p && !a) { ukLukk(false); return; }
  const S = ukSoneInfo || ukSoner([]);
  let html;
  if (a) {
    const [t0, t1] = ukDataT(a);
    html = `<h4>${esc(a.id)} ${esc(a.navn)}</h4>
      <div class="sub">${esc(a.omrade)} · ${fmtNo(a.startdato)}–${fmtNo(endDate(a))} · ${firmBadge(a.firma)}</div>
      <div class="uk-tim"><b>Timeverk:</b> ${fmtTimer(ukStdTimer(t0, t1))} <span class="sub">(foreløpig 2 personer × 12 t per dag, man–lør)</span></div>
      ${ukBarn(id).length ? `<div class="uk-sec">Fordeling på delene</div>${ukFordelingHtml(id)}` : '<div class="sub" style="margin-top:6px">Ingen deler ennå. Bruk ✂ Splitt, eller lag en ny aktivitet med denne som overordnet.</div>'}
      <div class="uk-knapper"><button class="btn" data-action="uk-dlg-splitt">✂ Splitt</button><span style="flex:1"></span><button class="btn primary" data-action="uk-dlg-ok">Lukk</button></div>`;
  } else {
    const morTxt = p.mor ? ukIdTekst(p.mor) + ukNavn(p.mor) : '';
    html = `<h4>${p.ny ? 'Ny aktivitet' : 'Planleggingsaktivitet'}</h4>
      <div class="uk-tittel">${esc(ukNavn(id) || '(skriv navn)')}</div>
      <label class="f">Navn</label><input type="text" data-ukf="navn" value="${esc(p.navn)}" placeholder="F.eks. Armering" maxlength="80">
      <label class="f">Overordnet aktivitet <span class="sub">(mor – navnet blir «Mor - Navn»)</span></label>
      <div class="uk-mor${ukDlg.morAktiv ? ' aktiv' : ''}"><input type="text" data-ukf="mor" value="${esc(ukDlg.morSok !== null ? ukDlg.morSok : morTxt)}" placeholder="Søk, eller trykk på en aktivitet i planen" autocomplete="off">
        ${ukDlg.morAktiv ? `<div class="uk-morhint">Velg i listen, eller trykk på en aktivitet i planen.</div><div class="uk-morliste">${ukMorListe()}</div>` : ''}</div>
      ${p.mor ? '' : '<div class="sub warn">Uten overordnet aktivitet blir den grå.</div>'}
      <label class="f">Sone</label><select data-ukf="omrade">${S.alleNokler.map(({z, d}) => `<option value="${esc(z)}" ${z === p.omrade ? 'selected' : ''}>${' '.repeat(d)}${esc(ukSoneNavn(z, S.forelder))}</option>`).join('')}${S.alleNokler.some(x => x.z === p.omrade) ? '' : `<option selected>${esc(p.omrade)}</option>`}</select>
      <div class="uk-to"><div><label class="f">Fra</label><input type="datetime-local" data-ukf="fra" value="${esc(p.fra)}"></div><div><label class="f">Til</label><input type="datetime-local" data-ukf="til" value="${esc(p.til)}"></div></div>
      <label class="f">Timeverk</label><div class="uk-tim"><input type="number" min="0" step="0.5" data-ukf="timer" value="${Math.round((+p.timer || 0) * 10) / 10}"> t
        <button type="button" class="uk-laas${p.laast ? ' on' : ''}" data-uklaas="${esc(p.id)}" title="Lås timene">${p.laast ? '🔒' : '🔓'}</button>
        <span class="sub">Timene er ikke bundet til timene i døgnet.</span></div>
      ${p.mor ? `<div class="uk-sec">Fordeling fra ${esc(ukIdTekst(p.mor) + ukNavn(p.mor))}</div>${ukFordelingHtml(p.mor, p.id)}` : ''}
      ${ukBarn(p.id).length ? `<div class="uk-sec">Fordeling på delene av denne</div>${ukFordelingHtml(p.id)}` : ''}
      <div class="uk-knapper">${p.ny ? '' : '<button class="btn" data-action="uk-dlg-splitt">✂ Splitt</button><button class="btn" data-action="uk-dlg-slett">🗑 Slett</button>'}<span style="flex:1"></span>
        ${p.ny ? '<button class="btn" data-action="uk-dlg-avbryt">Avbryt</button>' : ''}<button class="btn primary" data-action="uk-dlg-ok">${p.ny ? 'Opprett (Enter)' : 'Ferdig (Enter)'}</button></div>`;
  }
  // Fokus beholdes i samme felt når dialogen tegnes på nytt.
  const f = document.activeElement, fk = f && f.closest && f.closest('#uk-dlg') && f.dataset ? (f.dataset.ukf ? `[data-ukf="${f.dataset.ukf}"]` : f.dataset.ukt !== undefined ? `[data-ukt="${f.dataset.ukt}"]` : '') : '';
  box.innerHTML = html;
  box.hidden = false;
  if (fk && !(fk.includes('"mor"') && !ukDlg.morAktiv)) { const n = box.querySelector(fk); if (n) n.focus(); }
  if (plasser) {
    const bar = [...document.querySelectorAll('#uk-chart .uk-bar')].find(b => ukItems[+b.dataset.i] && ukItems[+b.dataset.i].id === id);
    const r = bar ? bar.getBoundingClientRect() : {left: innerWidth / 2 - 200, bottom: 120, top: 100};
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - box.offsetWidth - 8)) + 'px';
    const top = r.bottom + 8 + box.offsetHeight < innerHeight ? r.bottom + 8 : Math.max(8, r.top - box.offsetHeight - 8);
    box.style.top = Math.max(8, Math.min(top, innerHeight - box.offsetHeight - 8)) + 'px';
  }
}
function ukSettMor(morId) {
  const p = ukPlan(ukDlg.id);
  if (!p) return;
  if (morId && !ukGyldigMor(p.id, morId)) { showToast('Kan ikke velge aktiviteten selv eller en av delene av den.'); return; }
  ukKnytt(p, morId);
  ukDlg.morAktiv = false; ukDlg.morSok = null;
  ukLagre(); renderUtkikk(); ukDlgRender();
}
// Feltene i dialogen lagres med en gang (en ny aktivitet blir likevel ikke opprettet før Enter/Opprett).
function ukDlgFelt(el) {
  if (!ukDlg) return;
  const p = ukPlan(ukDlg.id);
  if (el.dataset.ukt !== undefined) {
    const c = ukPlan(el.dataset.ukt), v = Math.max(0, +el.value || 0);
    if (c && c.mor && !ukFordel(c.mor, c.id, v)) showToast('Lås opp en annen del (🔓) for å flytte timer.');
  } else if (p && el.dataset.ukf) {
    const f = el.dataset.ukf;
    if (f === 'navn') { p.navn = el.value.trim(); ukLagre(); renderUtkikk(); return; }
    else if (f === 'omrade') p.omrade = el.value;
    else if (f === 'timer') { const v = Math.max(0, +el.value || 0); if (p.mor) { if (!ukFordel(p.mor, p.id, v)) showToast('Lås opp en annen del (🔓) for å flytte timer.'); } else p.timer = v; }
    else if (f === 'fra' && el.value) { const len = ukT(p.til) - ukT(p.fra); p.fra = el.value; p.til = ukDt(ukT(p.fra) + len); }
    else if (f === 'til' && el.value) p.til = ukT(el.value) > ukT(p.fra) ? el.value : ukDt(ukT(p.fra) + 1);
    else return;
  } else return;
  ukLagre(); renderUtkikk();
  // Tegnes på nytt etter at fokus har flyttet seg, så Tab og klikk i neste felt virker.
  setTimeout(() => { if (ukDlg) ukDlgRender(); }, 0);
}

function ukAction(action, btn) {
  const st = ui.utkikk;
  if (action === 'uk-zoom') {
    const k = btn.dataset.key, sett = {uke: st.uker, dag: st.dager, periode: st.perioder}[btn.dataset.niva];
    if (sett.has(k)) {
      sett.delete(k);
      // Lukkes en uke eller dag, lukkes også nivåene under den.
      if (btn.dataset.niva === 'uke') for (let j = 0; j < 7; j++) { const d = addDays(k, j); st.dager.delete(d); UK_PERIODER.forEach((_, pi) => st.perioder.delete(d + '|' + pi)); }
      if (btn.dataset.niva === 'dag') UK_PERIODER.forEach((_, pi) => st.perioder.delete(k + '|' + pi));
    } else sett.add(k);
    ukShowTip(null); renderUtkikk(); if (ukDlg) ukDlgRender(); return;
  }
  if (action === 'uk-reset') { st.uker.clear(); st.dager.clear(); st.perioder.clear(); renderUtkikk(); return; }
  if (action === 'uk-plan') { st.plan = !st.plan; if (!st.plan) ukLukk(false); ukHl(null); renderUtkikk(); return; }
  if (action === 'uk-sone-velg') { st.velger = true; st.valgte = new Set(st.soneFilter || []); renderUtkikk(); return; }
  if (action === 'uk-sone-ok') { ukSoneOk(); return; }
  if (action === 'uk-sone-avbryt') { st.velger = false; renderUtkikk(); return; }
  if (action === 'uk-sone-alle') { st.soneFilter = null; renderUtkikk(); return; }
  if (action === 'uk-ny') {
    const z = btn.dataset.sone, l = ukLeaves[+btn.dataset.leaf];
    if (!l) return;
    const p = ukNy(z, l.t0, l.t1);
    ukHl(null); renderUtkikk(); ukApne(p.id, true); return;
  }
  if (!ukDlg) return;
  if (action === 'uk-dlg-ok') { ukLukk(true); return; }
  if (action === 'uk-dlg-avbryt') { ukLukk(false); return; }
  if (action === 'uk-dlg-splitt') { const it = ukItems.find(x => x.id === ukDlg.id); if (it) { ukLukk(true); ukSplitt(it); } return; }
  if (action === 'uk-dlg-slett') {
    const p = ukPlan(ukDlg.id); if (!p) return;
    const barn = ukBarn(p.id);
    if (!confirm(`Slette «${ukNavn(p.id)}»?${barn.length ? ` ${barn.length} del${barn.length === 1 ? '' : 'er'} av den blir uten overordnet aktivitet.` : ''}`)) return;
    barn.forEach(c => { c.mor = null; });
    UKP.akt = UKP.akt.filter(x => x !== p); delete UKP.restLaast[p.id];
    ukDlg = null; document.getElementById('uk-dlg').hidden = true; ukLagre(); renderUtkikk();
  }
}
function ukSoneOk() {
  const st = ui.utkikk;
  st.soneFilter = st.valgte.size ? new Set(st.valgte) : null;
  st.velger = false; renderUtkikk();
}

// Markeringen med ＋ der musepekeren står (planleggingsmodus): et felt i tid (enheten tidslinjen står i) og sone.
function ukHl(e) {
  let hl = document.getElementById('uk-hl');
  if (!e) { if (hl) hl.remove(); return; }
  if (e.target.closest && e.target.closest('#uk-hl')) return;   // står på ＋: ikke flytt den
  const time = e.target.closest && e.target.closest('#uk-chart .sv-row .sv-time');
  if (!time || ukBarOf(e.target) || ukDlg) { if (hl && !(e.target.closest && e.target.closest('#uk-hl'))) hl.remove(); return; }
  const r = time.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
  const li = ukLeaves.findIndex(l => x >= l.x0 && x < l.x0 + l.w);
  if (li < 0) return;
  const l = ukLeaves[li], z = time.parentElement.dataset.zone;
  if (!hl) { hl = document.createElement('div'); hl.id = 'uk-hl'; hl.className = 'uk-hl'; }
  if (hl.parentElement !== time) time.appendChild(hl);
  hl.style.left = l.x0 + 'px'; hl.style.width = l.w + 'px';
  const ty = Math.max(10, Math.min(r.height - 10, y)), pb = hl.querySelector('.uk-plus');
  if (pb && pb.dataset.leaf === String(li) && pb.dataset.sone === z) { pb.style.top = ty + 'px'; return; }
  const enhet = {uke: 'en uke', dag: 'en dag', periode: 'perioden', time: 'en time'}[l.niva];
  hl.innerHTML = `<button type="button" class="uk-plus" data-action="uk-ny" data-leaf="${li}" data-sone="${esc(z)}" style="top:${ty}px" title="Ny aktivitet her (${enhet})">＋</button>`;
}

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'uk-farg') { ui.utkikk.farg = el.checked; renderUtkikk(); }
  else if (el.id === 'uk-lys') { ui.utkikk.lys = el.value; renderUtkikk(); }
  else if (el.closest && el.closest('#uk-dlg') && el.dataset.ukf !== 'mor') ukDlgFelt(el);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (!ukDlg || !el.closest || !el.closest('#uk-dlg')) return;
  if (el.dataset.ukf === 'mor') {
    ukDlg.morSok = el.value; ukDlg.morAktiv = true;
    const l = document.querySelector('#uk-dlg .uk-morliste'); if (l) l.innerHTML = ukMorListe();
  } else if (el.dataset.ukf === 'navn') {
    const p = ukPlan(ukDlg.id); if (p) { p.navn = el.value.trim(); document.querySelector('#uk-dlg .uk-tittel').textContent = ukNavn(p.id) || '(skriv navn)'; }
  }
});
document.addEventListener('focusin', e => {
  if (!ukDlg || !e.target.closest || !e.target.closest('#uk-dlg')) return;
  const morFelt = e.target.dataset.ukf === 'mor';
  if (morFelt && !ukDlg.morAktiv) {
    ukDlg.morAktiv = true; ukDlgRender();
    const el = document.querySelector('#uk-dlg [data-ukf="mor"]'); if (el) { el.focus(); el.select(); }
  } else if (!morFelt && ukDlg.morAktiv && !e.target.closest('.uk-mor')) { ukDlg.morAktiv = false; ukDlg.morSok = null; setTimeout(() => { if (ukDlg) ukDlgRender(); }, 0); }
});
// Trykk utenfor dialogen lukker den – unntatt når «Overordnet aktivitet» er aktiv: da velger et trykk på en aktivitet i planen mora.
document.addEventListener('pointerdown', e => {
  if (!ukPa() || !ukDlg) return;
  const t = e.target;
  if (t.closest('#uk-dlg')) {
    const m = t.closest('[data-ukmor]');
    if (m) { e.preventDefault(); ukSettMor(m.dataset.ukmor || null); }
    else if (t.closest('[data-uklaas]')) {
      e.preventDefault();
      const k = t.closest('[data-uklaas]').dataset.uklaas;
      if (k.startsWith('rest:')) { const m2 = k.slice(5); UKP.restLaast[m2] = !UKP.restLaast[m2]; } else { const c = ukPlan(k); if (c) c.laast = !c.laast; }
      ukLagre(); ukDlgRender();
    }
    return;
  }
  ukSvelg = Date.now();
  if (ukDlg.morAktiv) {
    e.preventDefault();
    const bar = ukBarOf(t);
    if (bar) ukSettMor(ukItems[+bar.dataset.i].id);
    return;
  }
  ukLukk(true);
}, true);
document.addEventListener('keydown', e => {
  if (!ukPa()) return;
  const st = ui.utkikk;
  if (ukDlg) {
    if (e.key === 'Escape') { e.preventDefault(); if (ukDlg.morAktiv) { ukDlg.morAktiv = false; ukDlg.morSok = null; ukDlgRender(); } else ukLukk(false); }
    else if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const el = document.activeElement;
      if (el && el.dataset && el.dataset.ukf === 'mor' && ukDlg.morSok) { const f = document.querySelector('#uk-dlg .uk-morliste [data-ukmor]:nth-child(2)'); if (f) ukSettMor(f.dataset.ukmor); return; }
      if (el && el.closest && el.closest('#uk-dlg') && (el.dataset.ukf || el.dataset.ukt !== undefined)) ukDlgFelt(el);
      ukLukk(true);
    }
    return;
  }
  if (st.velger && e.key === 'Enter') { e.preventDefault(); ukSoneOk(); }
  else if (st.velger && e.key === 'Escape') { st.velger = false; renderUtkikk(); }
});
document.addEventListener('pointerover', e => {
  if (!ukPa() || e.pointerType === 'touch') return;
  ukShowTip(ukBarOf(e.target));
});
document.addEventListener('pointermove', e => { if (ukPa() && ui.utkikk.plan) ukHl(e); });
document.addEventListener('click', e => {
  if (!ukPa() || Date.now() - ukSvelg < 400) return;
  const st = ui.utkikk;
  const sone = e.target.closest('#uk-chart .uk-sone');
  if (sone) {
    const z = sone.dataset.sone, erF = !!sone.querySelector('.uk-caret');
    if (st.velger || ((e.ctrlKey || e.metaKey) && st.plan)) {
      if (!st.velger) { st.velger = true; st.valgte = new Set(st.soneFilter || []); }
      st.valgte.has(z) ? st.valgte.delete(z) : st.valgte.add(z);
      renderUtkikk(); return;
    }
    if (erF) { st.sonerApne.has(z) ? st.sonerApne.delete(z) : st.sonerApne.add(z); renderUtkikk(); }
    return;
  }
  const bar = ukBarOf(e.target);
  if (bar && st.plan && e.target.closest('.uk-splitt')) { ukShowTip(null); ukSplitt(ukItems[+bar.dataset.i]); return; }
  if (bar) ukShowTip(bar); else if (!e.target.closest('#uk-tip')) ukShowTip(null);
});
document.addEventListener('dblclick', e => {
  if (!ukPa() || !ui.utkikk.plan || Date.now() - ukSvelg < 400) return;
  const bar = ukBarOf(e.target);
  if (bar && !e.target.closest('.uk-splitt')) { ukShowTip(null); ukApne(ukItems[+bar.dataset.i].id); }
});
document.addEventListener('scroll', e => { if (ukPa() && !(e.target.closest && e.target.closest('#uk-dlg'))) ukShowTip(null); }, true);
window.addEventListener('resize', () => { clearTimeout(window.ukResizeT); window.ukResizeT = setTimeout(() => { if (ukPa()) renderUtkikk(); }, 200); });
