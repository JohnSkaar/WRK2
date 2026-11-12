// ---------- Aktivitetsrapportering (fanen «Aktivitetsrapportering», foreløpig kun systemadministrator) ----------
// Timer som ikke har noe sted å gå når en aktivitet slettes i Utkikksplan, havner her som poster. For hver post vurderes det
// om timeverket skal rapporteres opp til faseplanen (timeverk som ikke er med), eller om det opprettes som en endring
// under en endringstittel. Valgte poster kan skrives ut som en PDF-rapport; rapporten lagres og kan lastes ned igjen.
const AR_KEY = 'wrk2_aktrapp';
const AR_VURD = [['', 'Ikke vurdert'], ['faseplan', 'Rapporteres til faseplan (timeverk som ikke er med)'], ['endring', 'Opprettes som endring']];
let AR = null;
function arLast() {
  if (AR) return AR;
  try { AR = JSON.parse(localStorage.getItem(AR_KEY)); } catch (e) { AR = null; }
  if (!AR || !Array.isArray(AR.poster)) AR = {poster: [], endringer: [], rapporter: []};
  AR.endringer = AR.endringer || []; AR.rapporter = AR.rapporter || [];
  return AR;
}
let arLagreT = null;
function arLagre() {
  clearTimeout(arLagreT);
  arLagreT = setTimeout(() => {
    try { localStorage.setItem(AR_KEY, JSON.stringify(AR)); } catch (e) {}
    if (typeof CLOUD !== 'undefined' && CLOUD && window.cloudArLagre) window.cloudArLagre(JSON.parse(JSON.stringify(AR)));
  }, 300);
}
window.arFraSky = m => {
  if (!m || !Array.isArray(m.poster)) return;
  if (AR && JSON.stringify(m) === JSON.stringify(AR)) return;
  AR = {endringer: [], rapporter: [], ...m};
  try { localStorage.setItem(AR_KEY, JSON.stringify(AR)); } catch (e) {}
  const a = document.activeElement;
  if (arPa() && !(a && a.closest && a.closest('#ar-root') && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName))) renderAktrapp();
};
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

function renderAktrapp() {
  const R = arLast(), root = document.getElementById('ar-root');
  const endrNavn = id => { const e = R.endringer.find(x => x.id === id); return e ? `${e.nr} ${e.tittel}` : ''; };
  const filtrert = R.poster.filter(p => arVis === 'alle' || (arVis === 'apne' ? !p.vurdering : arVis === 'ikkerapp' ? !p.rapportert.length : p.vurdering === arVis));
  const sum = l => l.reduce((n, p) => n + (+p.timer || 0), 0);
  [...arValgt].forEach(id => { if (!R.poster.some(p => p.id === id)) arValgt.delete(id); });
  root.innerHTML = `<div class="panel">
    <h2>Aktivitetsrapportering</h2>
    <p class="intro">Timeverk som ikke har noe sted å gå når en aktivitet slettes i Utkikksplan. Vurder om timene skal <b>rapporteres opp til faseplanen</b> som timeverk som ikke er med, eller <b>opprettes som en endring</b> under en endringstittel. Kryss av postene som skal med, og lag en PDF-rapport – rapporten lagres og kan lastes ned igjen.</p>
    <div class="toolbar">
      <label>Vis: <select id="ar-vis"><option value="alle" ${arVis === 'alle' ? 'selected' : ''}>Alle</option><option value="apne" ${arVis === 'apne' ? 'selected' : ''}>Ikke vurdert</option><option value="faseplan" ${arVis === 'faseplan' ? 'selected' : ''}>Til faseplan</option><option value="endring" ${arVis === 'endring' ? 'selected' : ''}>Endringer</option><option value="ikkerapp" ${arVis === 'ikkerapp' ? 'selected' : ''}>Ikke tatt med i rapport</option></select></label>
      <button class="btn" data-action="ar-velg-alle">☑ Velg alle som vises</button>
      <button class="btn primary" data-action="ar-pdf" ${arValgt.size ? '' : 'disabled'}>📄 Lag PDF-rapport av valgte (${arValgt.size})</button>
    </div>
    <div class="stats"><span><b>${R.poster.length}</b> poster · ${arT(sum(R.poster))}</span><span><b>${R.poster.filter(p => !p.vurdering).length}</b> ikke vurdert</span><span><b>${arT(sum(R.poster.filter(p => p.vurdering === 'faseplan')))}</b> til faseplan</span><span><b>${arT(sum(R.poster.filter(p => p.vurdering === 'endring')))}</b> som endring</span></div>
    ${filtrert.length ? `<div class="ar-tabell-wrap"><table class="ar-tabell"><tr><th></th><th>Nr</th><th>Dato</th><th>Aktivitet</th><th>Timer</th><th>Vurdering</th><th>Endring</th><th>Kommentar</th><th>Rapport</th></tr>
      ${filtrert.map(p => `<tr>
        <td><input type="checkbox" data-arvelg="${esc(p.id)}" ${arValgt.has(p.id) ? 'checked' : ''}></td>
        <td class="nr">${esc(p.nr)}</td><td>${arDato(p.tid)}<div class="sub">${esc(p.av)}</div></td>
        <td><b>${esc(p.akt)}</b><div class="sub">${p.morNavn ? 'Fra ' + esc(p.morNavn) + ' · ' : ''}${(p.soner || []).map(z => esc(z)).join(', ')}${p.fra ? ' · ' + esc(ukTidTekst ? ukTidTekst(ukT(p.fra), ukT(p.til)) : '') : ''}</div></td>
        <td class="c"><b>${arT(p.timer)}</b></td>
        <td><select data-arf="vurdering" data-id="${esc(p.id)}">${AR_VURD.map(([k, l]) => `<option value="${k}" ${p.vurdering === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
        <td>${p.vurdering === 'endring' ? `<select data-arf="endring" data-id="${esc(p.id)}"><option value="">– velg endring –</option>${R.endringer.map(e => `<option value="${esc(e.id)}" ${p.endring === e.id ? 'selected' : ''}>${esc(e.nr + ' ' + e.tittel)}</option>`).join('')}<option value="__ny">＋ Ny endringstittel …</option></select>` : '<span class="sub">–</span>'}</td>
        <td><input type="text" data-arf="kommentar" data-id="${esc(p.id)}" value="${esc(p.kommentar)}" placeholder="Begrunnelse / notat" maxlength="300"></td>
        <td>${p.rapportert.length ? p.rapportert.map(n => `<span class="badge">${esc(n)}</span>`).join(' ') : '<span class="sub">–</span>'}</td></tr>`).join('')}</table></div>`
      : `<p class="sub">${R.poster.length ? 'Ingen poster i dette utvalget.' : 'Ingen poster ennå. De kommer hit når en aktivitet slettes i Utkikksplan og timene sendes til Aktivitetsrapportering.'}</p>`}
  </div>
  <div class="panel">
    <h3>Endringstitler</h3>
    <div class="toolbar"><input type="text" id="ar-ny-tittel" placeholder="Ny endringstittel, f.eks. «Ekstra armering fundament akse B»" maxlength="120" style="flex:1;min-width:260px"><button class="btn" data-action="ar-ny-endring">＋ Opprett endringstittel</button></div>
    ${R.endringer.length ? `<table class="ar-tabell"><tr><th>Nr</th><th>Tittel</th><th>Opprettet</th><th>Poster</th><th>Timer</th></tr>
      ${R.endringer.map(e => { const l = R.poster.filter(p => p.vurdering === 'endring' && p.endring === e.id); return `<tr><td class="nr">${esc(e.nr)}</td><td>${esc(e.tittel)}</td><td>${arDato(e.tid)} <span class="sub">${esc(e.av)}</span></td><td class="c">${l.length}</td><td class="c">${arT(sum(l))}</td></tr>`; }).join('')}</table>` : '<p class="sub">Ingen endringstitler ennå.</p>'}
  </div>
  <div class="panel">
    <h3>Lagrede rapporter</h3>
    ${R.rapporter.length ? `<table class="ar-tabell"><tr><th>Nr</th><th>Laget</th><th>Poster</th><th>Timer</th><th></th></tr>
      ${R.rapporter.map(r => `<tr><td class="nr">${esc(r.nr)}</td><td>${arDato(r.tid)} <span class="sub">${esc(r.av)}</span></td><td class="c">${r.poster.length}</td><td class="c">${arT(sum(r.poster))}</td><td><button class="btn" data-action="ar-last-ned" data-id="${esc(r.id)}">⬇ PDF</button></td></tr>`).join('')}</table>` : '<p class="sub">Ingen rapporter ennå.</p>'}
  </div>`;
}

function arRapportHtml(r) {
  const R = arLast(), sum = l => l.reduce((n, p) => n + (+p.timer || 0), 0);
  const rad = p => `<tr><td>${esc(p.nr)}</td><td>${arDato(p.tid)}</td><td><b>${esc(p.akt)}</b>${p.morNavn ? `<div class="sub">Fra ${esc(p.morNavn)}</div>` : ''}</td><td>${(p.soner || []).map(z => esc(z)).join(', ')}</td><td style="text-align:right">${arT(p.timer)}</td><td>${esc(p.kommentar || '')}</td></tr>`;
  const tabell = l => `<table class="rp-tabell"><tr><th>Nr</th><th>Dato</th><th>Aktivitet</th><th>Sone</th><th>Timer</th><th>Kommentar</th></tr>${l.map(rad).join('')}<tr><td colspan="4"><b>Sum</b></td><td style="text-align:right"><b>${arT(sum(l))}</b></td><td></td></tr></table>`;
  const fase = r.poster.filter(p => p.vurdering === 'faseplan'), endr = r.poster.filter(p => p.vurdering === 'endring'), ikke = r.poster.filter(p => !p.vurdering);
  const grupper = [...new Set(endr.map(p => p.endring))];
  return `<div class="rp-topptekst">Aktivitetsrapportering WRK – ${esc(r.nr)}</div>
    <div class="sub">Laget ${arDato(r.tid)} av ${esc(r.av)} · ${r.poster.length} poster · ${arT(sum(r.poster))}</div>
    ${fase.length ? `<h4>Rapporteres til faseplan – timeverk som ikke er med (${arT(sum(fase))})</h4>${tabell(fase)}` : ''}
    ${grupper.map(g => { const l = endr.filter(p => p.endring === g), e = (r.endringer || R.endringer).find(x => x.id === g); return `<h4>Endring ${esc(e ? e.nr + ' ' + e.tittel : '(uten tittel)')} (${arT(sum(l))})</h4>${tabell(l)}`; }).join('')}
    ${ikke.length ? `<h4>Ikke vurdert (${arT(sum(ikke))})</h4>${tabell(ikke)}` : ''}`;
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
    const poster = R.poster.filter(p => arValgt.has(p.id));
    if (!poster.length) return;
    const u = me(), r = {id: uid(), nr: arNr('AR', R.rapporter), tid: new Date().toISOString(), av: u.name || '', poster: JSON.parse(JSON.stringify(poster)),
      endringer: R.endringer.filter(e => poster.some(p => p.endring === e.id))};
    R.rapporter.unshift(r);
    poster.forEach(p => { p.rapportert = [...(p.rapportert || []), r.nr]; });
    arValgt.clear();
    if (typeof logg === 'function') logg('Aktivitetsrapportering: rapport', '', `${r.nr} med ${poster.length} poster (${poster.map(p => p.nr).join(', ')})`);
    arLagre(); renderAktrapp(); arLagPdf(r);
  }
}
document.addEventListener('change', e => {
  const el = e.target;
  if (!arPa() || !el.closest || !el.closest('#ar-root')) return;
  if (el.id === 'ar-vis') { arVis = el.value; renderAktrapp(); return; }
  if (el.dataset.arvelg) { el.checked ? arValgt.add(el.dataset.arvelg) : arValgt.delete(el.dataset.arvelg); renderAktrapp(); return; }
  const p = arLast().poster.find(x => x.id === el.dataset.id);
  if (!p || !el.dataset.arf || !isSys()) return;
  const f = el.dataset.arf;
  if (f === 'endring' && el.value === '__ny') {
    const e = arNyEndring(prompt('Tittel på den nye endringen:'));
    p.endring = e ? e.id : p.endring;
  } else if (f === 'kommentar') p.kommentar = el.value.trim();
  else p[f] = el.value;
  if (f === 'vurdering' && p.vurdering !== 'endring') p.endring = '';
  if (typeof logg === 'function' && f !== 'kommentar') logg('Aktivitetsrapportering: vurdering', p.mor || '', `${p.nr} ${p.akt}: ${AR_VURD.find(x => x[0] === p.vurdering)[1]}${p.endring ? ' – ' + ((arLast().endringer.find(x => x.id === p.endring) || {}).nr || '') : ''}`);
  arLagre(); renderAktrapp();
});
document.addEventListener('keydown', e => { if (arPa() && e.key === 'Enter' && e.target.id === 'ar-ny-tittel') { e.preventDefault(); arAction('ar-ny-endring'); } });
