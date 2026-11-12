// ---------- Aktivitetsrapportering (fanen «Aktivitetsrapportering», foreløpig kun systemadministrator) ----------
// To logger:
//  · Avvik – aktiviteter som slettes i Utkikksplan (med timene som ikke har noe sted å gå). Vurderes som utsett, utgår eller endring
//    (rapporteres til faseplan), eller «slett, skal ikke utføres» når det ikke er timer.
//  · Tilførte timer – aktiviteter som har fått timer uten at de kommer fra faseplanen (planleggingsaktiviteter uten overordnet
//    aktivitet, og grupper der delene har fått flere timer enn summen). Vurderes som endring eller mertid (kalkyle).
// Valgte rader kan skrives ut som en PDF-rapport; rapporten lagres og kan lastes ned igjen.
const AR_KEY = 'wrk2_aktrapp';
const AR_VURD = [['', 'Ikke vurdert'], ['utsett', 'Utsett, rapporteres til faseplan'], ['utgar', 'Utgår, rapporteres til faseplan'],
  ['endring', 'Endring, rapporteres til faseplan'], ['slett', 'Slett, aktivitet skal ikke utføres']];
const AR_TILF = [['', 'Ikke vurdert'], ['endring', 'Endring (tilfører timer)'], ['mertid', 'Mertid, kalkyle']];
const AR_GAMMEL = {faseplan: 'Rapporteres til faseplan (eldre valg)'};
const arVurdTekst = (v, liste = AR_VURD) => (liste.find(x => x[0] === v) || [, AR_GAMMEL[v] || v])[1];
let AR = null;
const arSynk = lagSynk(['arposter', 'arendringer', 'arrapporter', 'artilfort']);
const arNorm = m => {
  m = m && Array.isArray(m.poster) ? m : {poster: []};
  m.endringer = m.endringer || []; m.rapporter = m.rapporter || []; m.tilfort = m.tilfort || [];
  m.poster.sort((a, b) => String(b.tid).localeCompare(String(a.tid)));
  m.rapporter.sort((a, b) => String(b.tid).localeCompare(String(a.tid)));
  m.endringer.sort((a, b) => String(a.nr).localeCompare(String(b.nr)));
  return m;
};
function arLast() {
  if (AR) return AR;
  try { AR = JSON.parse(localStorage.getItem(AR_KEY)); } catch (e) { AR = null; }
  return (AR = arNorm(AR));
}
// Én post, én endringstittel og én rapport per dokument i skyen (se lagSynk i utkikk.js).
const arDocs = () => { const R = arLast(); return {arposter: tilKart(R.poster), arendringer: tilKart(R.endringer), arrapporter: tilKart(R.rapporter), artilfort: tilKart(R.tilfort)}; };
let arLagreT = null;
function arLagre() {
  clearTimeout(arLagreT);
  arLagreT = setTimeout(() => {
    try { localStorage.setItem(AR_KEY, JSON.stringify(AR)); } catch (e) {}
    if (typeof CLOUD !== 'undefined' && CLOUD && arSynk.klar && window.cloudSkrivDocs) {
      const ops = arSynk.endringer(arDocs());
      if (ops.length) window.cloudSkrivDocs(ops);
    }
  }, 300);
}
window.arFraSamlinger = remote => {
  const lokal = arSynk.klar ? (clearTimeout(arLagreT), arDocs()) : null;
  const d = arSynk.flett(remote, lokal);
  AR = arNorm({poster: fraKart(d.arposter), endringer: fraKart(d.arendringer), rapporter: fraKart(d.arrapporter), tilfort: fraKart(d.artilfort)});
  try { localStorage.setItem(AR_KEY, JSON.stringify(AR)); } catch (e) {}
  if (lokal) arLagre();
  const a = document.activeElement;
  if (arPa() && !(a && a.closest && a.closest('#ar-root') && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) renderAktrapp();
};
// Engangsflytting fra det gamle dokumentet config/aktrapp.
window.arMigrer = gammel => { AR = arNorm(JSON.parse(JSON.stringify(gammel))); arLagre(); if (arPa()) renderAktrapp(); };
const arPa = () => typeof currentTab !== 'undefined' && currentTab === 'aktrapp';
const arNr = (pre, liste) => pre + '-' + String(liste.reduce((n, x) => Math.max(n, +String(x.nr || '').split('-').pop() || 0), 0) + 1).padStart(3, '0');
const arT = t => `${String(Math.round((+t || 0) * 10) / 10).replace('.', ',')} t`;
const arDato = iso => iso ? fmtNo(iso.slice(0, 10)) : '';
const arValgt = new Set();
let arVis = 'alle';

// Kalles fra Utkikksplan når timer sendes hit.
window.arNyPost = d => {
  const R = arLast(), u = me();
  const post = {id: uid(), nr: arNr('R', R.poster), tid: new Date().toISOString(), av: u.name || '', vurdering: '', endring: '', kommentar: '', rapportert: [], ...d};
  R.poster.unshift(post);
  arLagre();
  if (typeof logg === 'function') logg('Aktivitetsrapportering: ny post', d.mor || '', `${post.nr} ${d.akt} – ${arT(d.timer)}`);
  return post;
};

// Tilførte timer regnes ut fra Utkikksplan hver gang; vurderingen lagres per rad (samlingen artilfort).
function arTilfortRader() {
  if (typeof ukLast !== 'function') return [];
  const M = ukLast(), R = arLast(), rader = [];
  M.akt.filter(p => !p.ny && !p.mor && (+p.timer || 0) > 0).forEach(p => rader.push({id: 't:' + p.id, navn: ukNavn(p.id), type: 'Ny aktivitet uten timeverk fra faseplan',
    timer: +p.timer, soner: ukSonerAv(p.id), fra: p.fra, til: p.til}));
  const morer = new Set(M.akt.filter(p => p.mor).map(p => p.mor));
  morer.forEach(m => { const rest = ukRest(m); if (rest < -0.05) rader.push({id: 't:over:' + m, navn: ukIdTekst(m) + ukNavn(m), type: 'Delene har fått flere timer enn faseplanen har', timer: -rest, soner: ukSonerAv(m)}); });
  return rader.map(x => ({...x, ...(R.tilfort.find(t => t.id === x.id) || {vurdering: '', endring: '', kommentar: '', rapportert: []})}));
}
const arSum = l => l.reduce((n, p) => n + (+p.timer || 0), 0);
function arEndringSelect(rad, kind) {
  const R = arLast();
  return `<select data-arf="endring" data-kind="${kind}" data-id="${esc(rad.id)}"><option value="">– velg endring –</option>${R.endringer.map(e => `<option value="${esc(e.id)}" ${rad.endring === e.id ? 'selected' : ''}>${esc(e.nr + ' ' + e.tittel)}</option>`).join('')}<option value="__ny">＋ Ny endringstittel …</option></select>`;
}
function renderAktrapp() {
  const R = arLast(), root = document.getElementById('ar-root'), tilf = arTilfortRader();
  const filtrert = R.poster.filter(p => arVis === 'alle' || (arVis === 'apne' ? !p.vurdering : arVis === 'ikkerapp' ? !p.rapportert.length : p.vurdering === arVis));
  [...arValgt].forEach(id => { if (!R.poster.some(p => p.id === id) && !tilf.some(t => t.id === id)) arValgt.delete(id); });
  const velg = id => `<td><input type="checkbox" data-arvelg="${esc(id)}" ${arValgt.has(id) ? 'checked' : ''}></td>`;
  const rapp = l => `<td>${(l || []).length ? l.map(n => `<span class="badge">${esc(n)}</span>`).join(' ') : '<span class="sub">–</span>'}</td>`;
  const tid = x => x.fra ? ' · ' + esc(ukTidTekst(ukT(x.fra), ukT(x.til))) : '';
  root.innerHTML = `<div class="panel">
    <h2>Aktivitetsrapportering</h2>
    <p class="intro">To logger fra Utkikksplan: <b>avvik</b> når aktiviteter slettes, og <b>tilførte timer</b> når aktiviteter har fått timer som ikke kommer fra faseplanen. Vurder hver rad, kryss av det som skal med, og lag en PDF-rapport – rapporten lagres og kan lastes ned igjen.</p>
    <div class="toolbar">
      <button class="btn" data-action="ar-velg-alle">☑ Velg alle som vises</button>
      <button class="btn primary" data-action="ar-pdf" ${arValgt.size ? '' : 'disabled'}>📄 Lag PDF-rapport av valgte (${arValgt.size})</button>
    </div>
  </div>
  <div class="panel">
    <h3>Avvik – slettede aktiviteter</h3>
    <div class="toolbar"><label>Vis: <select id="ar-vis">${[['alle', 'Alle'], ['apne', 'Ikke vurdert'], ...AR_VURD.slice(1), ['ikkerapp', 'Ikke tatt med i rapport']].map(([k, l]) => `<option value="${k}" ${arVis === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label></div>
    <div class="stats"><span><b>${R.poster.length}</b> poster · ${arT(arSum(R.poster))}</span><span><b>${R.poster.filter(p => !p.vurdering).length}</b> ikke vurdert</span>${AR_VURD.slice(1).map(([k, l]) => { const l2 = R.poster.filter(p => p.vurdering === k); return l2.length ? `<span><b>${l2.length}</b> ${esc(l.split(',')[0].toLowerCase())} · ${arT(arSum(l2))}</span>` : ''; }).join('')}</div>
    ${filtrert.length ? `<div class="ar-tabell-wrap"><table class="ar-tabell"><tr><th></th><th>Nr</th><th>Dato</th><th>Aktivitet</th><th>Timer</th><th>Vurdering</th><th>Endring</th><th>Kommentar</th><th>Rapport</th></tr>
      ${filtrert.map(p => { const null_ = !(+p.timer > 0), valg = AR_VURD.filter(([k]) => !k || (null_ ? k === 'slett' : k !== 'slett'));
        if (p.vurdering && !valg.some(([k]) => k === p.vurdering)) valg.push([p.vurdering, arVurdTekst(p.vurdering)]);
        return `<tr>${velg(p.id)}
        <td class="nr">${esc(p.nr)}</td><td>${arDato(p.tid)}<div class="sub">${esc(p.av)}</div></td>
        <td><b>${esc(p.akt)}</b><div class="sub">${p.morNavn ? 'Fra ' + esc(p.morNavn) + ' · ' : ''}${(p.soner || []).map(z => esc(z)).join(', ')}${tid(p)}${p.hvor ? ' · timene ' + esc(p.hvor) : ''}</div></td>
        <td class="c"><b>${arT(p.timer)}</b></td>
        <td><select data-arf="vurdering" data-kind="post" data-id="${esc(p.id)}">${valg.map(([k, l]) => `<option value="${k}" ${p.vurdering === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        <td>${p.vurdering === 'endring' ? arEndringSelect(p, 'post') : '<span class="sub">–</span>'}</td>
        <td><input type="text" data-arf="kommentar" data-kind="post" data-id="${esc(p.id)}" value="${esc(p.kommentar)}" placeholder="Begrunnelse / notat" maxlength="300"></td>
        ${rapp(p.rapportert)}</tr>`; }).join('')}</table></div>`
      : `<p class="sub">${R.poster.length ? 'Ingen poster i dette utvalget.' : 'Ingen avvik ennå. De kommer hit når en aktivitet slettes i Utkikksplan.'}</p>`}
  </div>
  <div class="panel">
    <h3>Tilførte timer – uten timeverk fra faseplan</h3>
    <p class="sub">Her handler det ikke om å rapportere, men om å tilføre timer: enten som en <b>endring</b> eller som <b>mertid (kalkyle)</b>. Listen følger Utkikksplan: en planleggingsaktivitet som får en overordnet aktivitet, forsvinner herfra.</p>
    <div class="stats"><span><b>${tilf.length}</b> rader · ${arT(arSum(tilf))}</span><span><b>${tilf.filter(t => !t.vurdering).length}</b> ikke vurdert</span><span><b>${arT(arSum(tilf.filter(t => t.vurdering === 'endring')))}</b> som endring</span><span><b>${arT(arSum(tilf.filter(t => t.vurdering === 'mertid')))}</b> mertid</span></div>
    ${tilf.length ? `<div class="ar-tabell-wrap"><table class="ar-tabell"><tr><th></th><th>Aktivitet</th><th>Hva</th><th>Timer</th><th>Vurdering</th><th>Endring</th><th>Kommentar</th><th>Rapport</th></tr>
      ${tilf.map(t => `<tr>${velg(t.id)}<td><b>${esc(t.navn)}</b><div class="sub">${(t.soner || []).map(z => esc(z)).join(', ')}${tid(t)}</div></td><td class="sub">${esc(t.type)}</td>
        <td class="c"><b>${arT(t.timer)}</b></td>
        <td><select data-arf="vurdering" data-kind="tilf" data-id="${esc(t.id)}">${AR_TILF.map(([k, l]) => `<option value="${k}" ${t.vurdering === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        <td>${t.vurdering === 'endring' ? arEndringSelect(t, 'tilf') : '<span class="sub">–</span>'}</td>
        <td><input type="text" data-arf="kommentar" data-kind="tilf" data-id="${esc(t.id)}" value="${esc(t.kommentar || '')}" placeholder="Begrunnelse / notat" maxlength="300"></td>
        ${rapp(t.rapportert)}</tr>`).join('')}</table></div>` : '<p class="sub">Ingen aktiviteter har fått timer utenom faseplanen.</p>'}
  </div>
  <div class="panel">
    <h3>Endringstitler</h3>
    <div class="toolbar"><input type="text" id="ar-ny-tittel" placeholder="Ny endringstittel, f.eks. «Ekstra armering fundament akse B»" maxlength="120" style="flex:1;min-width:260px"><button class="btn" data-action="ar-ny-endring">＋ Opprett endringstittel</button></div>
    ${R.endringer.length ? `<table class="ar-tabell"><tr><th>Nr</th><th>Tittel</th><th>Opprettet</th><th>Avvik</th><th>Tilført</th></tr>
      ${R.endringer.map(e => { const l = R.poster.filter(p => p.vurdering === 'endring' && p.endring === e.id), t = tilf.filter(x => x.vurdering === 'endring' && x.endring === e.id);
        return `<tr><td class="nr">${esc(e.nr)}</td><td>${esc(e.tittel)}</td><td>${arDato(e.tid)} <span class="sub">${esc(e.av)}</span></td><td class="c">${l.length} · ${arT(arSum(l))}</td><td class="c">${t.length} · ${arT(arSum(t))}</td></tr>`; }).join('')}</table>` : '<p class="sub">Ingen endringstitler ennå.</p>'}
  </div>
  <div class="panel">
    <h3>Lagrede rapporter</h3>
    ${R.rapporter.length ? `<table class="ar-tabell"><tr><th>Nr</th><th>Laget</th><th>Avvik</th><th>Tilført</th><th></th></tr>
      ${R.rapporter.map(r => `<tr><td class="nr">${esc(r.nr)}</td><td>${arDato(r.tid)} <span class="sub">${esc(r.av)}</span></td><td class="c">${r.poster.length} · ${arT(arSum(r.poster))}</td><td class="c">${(r.tilfort || []).length} · ${arT(arSum(r.tilfort || []))}</td><td><button class="btn" data-action="ar-last-ned" data-id="${esc(r.id)}">⬇ PDF</button></td></tr>`).join('')}</table>` : '<p class="sub">Ingen rapporter ennå.</p>'}
  </div>`;
}

function arRapportHtml(r) {
  const R = arLast(), endrNavn = g => { const e = (r.endringer || []).find(x => x.id === g) || R.endringer.find(x => x.id === g); return e ? e.nr + ' ' + e.tittel : '(uten tittel)'; };
  const rad = p => `<tr><td>${esc(p.nr || '')}</td><td>${p.tid ? arDato(p.tid) : ''}</td><td><b>${esc(p.akt || p.navn)}</b>${p.morNavn ? `<div class="sub">Fra ${esc(p.morNavn)}</div>` : p.type ? `<div class="sub">${esc(p.type)}</div>` : ''}</td><td>${(p.soner || []).map(z => esc(z)).join(', ')}</td><td style="text-align:right">${arT(p.timer)}</td><td>${esc(p.kommentar || '')}</td></tr>`;
  const tabell = l => `<table class="rp-tabell"><tr><th>Nr</th><th>Dato</th><th>Aktivitet</th><th>Sone</th><th>Timer</th><th>Kommentar</th></tr>${l.map(rad).join('')}<tr><td colspan="4"><b>Sum</b></td><td style="text-align:right"><b>${arT(arSum(l))}</b></td><td></td></tr></table>`;
  const seksjon = (tittel, l) => l.length ? `<h4>${esc(tittel)} (${arT(arSum(l))})</h4>${tabell(l)}` : '';
  const perEndring = (pre, l) => [...new Set(l.map(p => p.endring))].map(g => seksjon(`${pre} ${endrNavn(g)}`, l.filter(p => p.endring === g))).join('');
  const P = r.poster || [], T = r.tilfort || [];
  return `<div class="rp-topptekst">Aktivitetsrapportering WRK – ${esc(r.nr)}</div>
    <div class="sub">Laget ${arDato(r.tid)} av ${esc(r.av)} · ${P.length} avvik (${arT(arSum(P))}) · ${T.length} med tilførte timer (${arT(arSum(T))})</div>
    ${P.length ? '<h3>Avvik – rapporteres til faseplan</h3>' : ''}
    ${seksjon('Utsett, rapporteres til faseplan', P.filter(p => p.vurdering === 'utsett'))}
    ${seksjon('Utgår, rapporteres til faseplan', P.filter(p => p.vurdering === 'utgar'))}
    ${perEndring('Endring, rapporteres til faseplan –', P.filter(p => p.vurdering === 'endring'))}
    ${seksjon('Rapporteres til faseplan (eldre valg)', P.filter(p => p.vurdering === 'faseplan'))}
    ${seksjon('Slett, aktivitet skal ikke utføres', P.filter(p => p.vurdering === 'slett'))}
    ${seksjon('Avvik, ikke vurdert', P.filter(p => !p.vurdering))}
    ${T.length ? '<h3>Tilførte timer – uten timeverk fra faseplan</h3>' : ''}
    ${perEndring('Endring –', T.filter(p => p.vurdering === 'endring'))}
    ${seksjon('Mertid, kalkyle', T.filter(p => p.vurdering === 'mertid'))}
    ${seksjon('Tilførte timer, ikke vurdert', T.filter(p => !p.vurdering))}`;
}
async function arLagPdf(r) {
  let boks = null;
  try {
    await lastSkript('vendor/pdfgen/html2canvas.min.js'); await lastSkript('vendor/pdfgen/jspdf.umd.min.js');
    boks = document.createElement('div'); boks.className = 'rp-pdf-boks';
    boks.style.cssText = 'position:absolute;left:-1400px;top:0;width:1000px;background:#fff;padding:20px;font-family:Arial,Helvetica,sans-serif';
    boks.innerHTML = arRapportHtml(r);
    document.body.appendChild(boks);
    await lagPdf(boks, `Aktivitetsrapportering ${r.nr} ${r.tid.slice(0, 10)}.pdf`, `Aktivitetsrapportering WRK - ${r.nr} - ${arDato(r.tid)}`);
  } catch (e) { alert('Kunne ikke lage PDF: ' + (e.message || e)); }
  if (boks) boks.remove();
}

// Vurderingen av en rad med tilførte timer (lages første gang den endres).
function arTilfDok(id) {
  const R = arLast();
  let d = R.tilfort.find(t => t.id === id);
  if (!d) { d = {id, vurdering: '', endring: '', kommentar: '', rapportert: []}; R.tilfort.push(d); }
  return d;
}
function arNyEndring(tittel) {
  tittel = String(tittel || '').trim();
  if (!tittel) return null;
  const R = arLast(), u = me(), e = {id: uid(), nr: arNr('E', R.endringer), tittel, tid: new Date().toISOString(), av: u.name || ''};
  R.endringer.push(e);
  if (typeof logg === 'function') logg('Aktivitetsrapportering: ny endringstittel', '', `${e.nr} ${e.tittel}`);
  return e;
}
function arAction(action, btn) {
  if (!isSys()) return;
  const R = arLast();
  if (action === 'ar-ny-endring') { const el = document.getElementById('ar-ny-tittel'); if (arNyEndring(el.value)) { arLagre(); renderAktrapp(); } else el.focus(); return; }
  if (action === 'ar-velg-alle') { document.querySelectorAll('#ar-root [data-arvelg]').forEach(x => arValgt.add(x.dataset.arvelg)); renderAktrapp(); return; }
  if (action === 'ar-last-ned') { const r = R.rapporter.find(x => x.id === btn.dataset.id); if (r) arLagPdf(r); return; }
  if (action === 'ar-pdf') {
    const poster = R.poster.filter(p => arValgt.has(p.id)), tilf = arTilfortRader().filter(t => arValgt.has(t.id));
    if (!poster.length && !tilf.length) return;
    const u = me(), r = {id: uid(), nr: arNr('AR', R.rapporter), tid: new Date().toISOString(), av: u.name || '', poster: JSON.parse(JSON.stringify(poster)),
      tilfort: JSON.parse(JSON.stringify(tilf)), endringer: R.endringer.filter(e => [...poster, ...tilf].some(p => p.endring === e.id))};
    R.rapporter.unshift(r);
    poster.forEach(p => { p.rapportert = [...(p.rapportert || []), r.nr]; });
    tilf.forEach(t => { const d = arTilfDok(t.id); d.rapportert = [...(d.rapportert || []), r.nr]; });
    arValgt.clear();
    if (typeof logg === 'function') logg('Aktivitetsrapportering: rapport', '', `${r.nr} med ${poster.length} avvik og ${tilf.length} tilførte (${[...poster.map(p => p.nr), ...tilf.map(t => t.navn)].join(', ')})`);
    arLagre(); renderAktrapp(); arLagPdf(r);
  }
}
document.addEventListener('change', e => {
  const el = e.target;
  if (!arPa() || !el.closest || !el.closest('#ar-root')) return;
  if (el.id === 'ar-vis') { arVis = el.value; renderAktrapp(); return; }
  if (el.dataset.arvelg) { el.checked ? arValgt.add(el.dataset.arvelg) : arValgt.delete(el.dataset.arvelg); renderAktrapp(); return; }
  if (!el.dataset.arf || !isSys()) return;
  const tilfRad = el.dataset.kind === 'tilf', p = tilfRad ? arTilfDok(el.dataset.id) : arLast().poster.find(x => x.id === el.dataset.id);
  if (!p) return;
  const f = el.dataset.arf, navn = tilfRad ? (arTilfortRader().find(t => t.id === p.id) || {}).navn : p.nr + ' ' + p.akt;
  if (f === 'endring' && el.value === '__ny') {
    const e = arNyEndring(prompt('Tittel på den nye endringen:'));
    p.endring = e ? e.id : p.endring;
  } else if (f === 'kommentar') p.kommentar = el.value.trim();
  else p[f] = el.value;
  if (f === 'vurdering' && p.vurdering !== 'endring') p.endring = '';
  if (typeof logg === 'function' && f !== 'kommentar') logg(tilfRad ? 'Aktivitetsrapportering: tilførte timer' : 'Aktivitetsrapportering: vurdering', p.mor || '', `${navn}: ${arVurdTekst(p.vurdering, tilfRad ? AR_TILF : AR_VURD)}${p.endring ? ' – ' + ((arLast().endringer.find(x => x.id === p.endring) || {}).nr || '') : ''}`);
  arLagre(); renderAktrapp();
});
document.addEventListener('keydown', e => { if (arPa() && e.key === 'Enter' && e.target.id === 'ar-ny-tittel') { e.preventDefault(); arAction('ar-ny-endring'); } });
