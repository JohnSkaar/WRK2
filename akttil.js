// ---------- Aktivitetstillatelse (fanen «Aktivitetstillatelse», foreløpig kun systemadministrator) ----------
// Prøve på en ny type arbeidstillatelse per aktivitet og dag. Velg en dag (eller periode/time) på datolinjen – samme datolinje
// som i Utkikksplan, 3 uker fram. Aktivitetene som pågår da, vises på kartet fra Sonemodul. Trykk på en overliggende sone for å
// zoome inn og se den finere inndelingen; velg en aktivitet og marker sonene den skal være i den dagen.
// AT-numrene er som før. Aktivitetene og sonene hentes fra Utkikksplan/Sonemodul; tillatelsene lagres i samlingen «akttil».
const AT2_KEY = 'wrk2_akttil', AT2_UKER = 3;
let AT2 = null;
const at2Synk = lagSynk(['akttil']);
const at2Ui = {uker: new Set(), dager: new Set(), perioder: new Set(), valgt: null, zoom: null, akt: null, tegn: null};

// ----- lagring: én tillatelse per aktivitet og dag/tidsrom -----
function at2Last() {
  if (AT2) return AT2;
  try { AT2 = JSON.parse(localStorage.getItem(AT2_KEY)); } catch (e) { AT2 = null; }
  if (!AT2 || !Array.isArray(AT2.til)) AT2 = {til: []};
  return AT2;
}
const at2Docs = () => ({akttil: tilKart(at2Last().til)});
let at2LagreT = null;
function at2Lagre() {
  clearTimeout(at2LagreT);
  at2LagreT = setTimeout(() => {
    try { localStorage.setItem(AT2_KEY, JSON.stringify(AT2)); } catch (e) {}
    if (typeof CLOUD !== 'undefined' && CLOUD && at2Synk.klar && window.cloudSkrivDocs) { const ops = at2Synk.endringer(at2Docs()); if (ops.length) window.cloudSkrivDocs(ops); }
  }, 300);
}
window.at2FraSamlinger = remote => {
  const lokal = at2Synk.klar ? (clearTimeout(at2LagreT), at2Docs()) : null;
  AT2 = {til: fraKart(at2Synk.flett(remote, lokal).akttil)};
  if (lokal) at2Lagre();
  try { localStorage.setItem(AT2_KEY, JSON.stringify(AT2)); } catch (e) {}
  if (at2Pa()) renderAkttil();
};
window.at2Migrer = () => {};
const at2Pa = () => typeof currentTab !== 'undefined' && currentTab === 'akttil';
// Tillatelsen gjelder det valgte tidsrommet (en dag, en periode eller en time); nøkkelen er start–slutt i klokkeslett.
const at2Nokkel = () => at2Ui.valgt ? `${ukDt(at2Ui.valgt.t0)}_${ukDt(at2Ui.valgt.t1)}` : '';
const at2Til = aktId => at2Last().til.find(t => t.aktId === aktId && t.tid === at2Nokkel());

// ----- soner fra Sonemodul (fasen som brukes i Utkikksplan) -----
function at2Fase() { const M = smLast(); return M.faser.find(f => f.utkikk) || M.faser[0]; }
const at2Rot = () => smLast().soner.filter(s => s.fase === at2Fase().id && !s.forelder);
const at2Under = (sti, z) => z === sti || (z && z.startsWith(sti + ' / '));

// ----- aktivitetene i valgt tidsrom (samme kilde som Utkikksplan: planen + planleggingsaktivitetene) -----
function at2Aktiviteter() {
  const v = at2Ui.valgt;
  if (!v) return [];
  const M = ukLast(), ut = [];
  DATA.filter(a => !a.generell && !M.skjult[a.id] && a.status !== 'Utført').forEach(a => {
    const [t0, t1] = ukDataTid(a);
    if (t0 < v.t1 && t1 > v.t0) ut.push({id: a.id, a, navn: a.navn, soner: ukSonerAv(a.id), farge: firmColor(a.firma), firma: a.firma, at: a.at.map(t => t.nr), t0, t1});
  });
  M.akt.filter(p => !p.ny).forEach(p => {
    const t0 = ukT(p.fra), t1 = ukT(p.til), rot = ukRotData(p);
    if (t0 < v.t1 && t1 > v.t0) ut.push({id: p.id, p, navn: ukNavn(p.id), soner: ukSonerAv(p.id), farge: rot ? firmColor(rot.firma) : '#8c959f', firma: rot ? rot.firma : '', at: rot ? rot.at.map(t => t.nr) : [], t0, t1});
  });
  return ut;
}

// ----- datolinjen (samme oppbygging som Utkikksplan): et trykk velger, et trykk til åpner neste nivå -----
function at2Tidslinje(akt) {
  const panel = document.getElementById('at2-root');
  const from = mondayOf(TODAY), tilgj = Math.max(400, (panel.clientWidth || 1200) - 24);
  const skala = Math.max(1, tilgj / ukNaturligBredde(at2Ui, AT2_UKER));
  const {leaves, hode, bredde} = ukBygg(from, skala, at2Ui, AT2_UKER);
  const v = at2Ui.valgt, x = t => { for (const l of leaves) if (t <= l.t1) return l.x0 + Math.max(0, t - l.t0) / (l.t1 - l.t0) * l.w; const s = leaves[leaves.length - 1]; return s.x0 + s.w; };
  // Tidsrommet til en celle i overskriften: uke = 7 døgn, dag = døgnet, periode = periodens timer.
  const tid = (niva, key) => {
    if (niva === 'uke') { const t = daysBetween(from, key) * 24; return [t, t + 168]; }
    if (niva === 'dag') { const t = daysBetween(from, key) * 24; return [t, t + 24]; }
    const [d, pi] = key.split('|'), t = daysBetween(from, d) * 24, [p0, p1] = UK_PERIODER[+pi]; return [t + p0, t + p1];
  };
  const celle = (c, niva) => {
    const [a0, a1] = c.key ? tid(niva, c.key) : [0, 0], valgt = v && c.key && niva !== 'uke' && a0 === v.t0 && a1 === v.t1;
    const n = c.key && niva !== 'uke' ? akt.filter(x => x.t0 < a1 && x.t1 > a0).length : 0;
    return `<div class="uk-c uk-${niva}${c.apen ? ' apen' : ''}${c.na ? ' now' : ''}${c.helg ? ' we' : ''}${valgt ? ' at2-valgt' : ''}" style="left:${c.x0}px;width:${c.w}px"${c.key ? ` data-action="at2-tid" data-niva="${niva}" data-key="${esc(c.key)}" title="${niva === 'uke' ? (c.apen ? 'Trykk for å lukke dagene' : 'Trykk for å vise dagene') : valgt ? (c.apen ? 'Trykk for å lukke' : 'Trykk igjen for å dele opp') : 'Trykk for å velge'}"` : ''}>${esc(c.txt)}${c.sub ? `<small>${esc(c.sub)}</small>` : ''}${n ? `<span class="at2-n">${n}</span>` : ''}</div>`;
  };
  const rad = niva => hode[niva].length ? `<div class="uk-hrad uk-h-${niva}">${hode[niva].map(c => celle(c, niva)).join('')}</div>` : '';
  const timer = hode.time.map(c => { const l = leaves.find(q => Math.abs(q.x0 - c.x0) < 0.5); return l ? {...c, t0: l.t0, t1: l.t1} : null; }).filter(Boolean);
  const timeRad = timer.length ? `<div class="uk-hrad uk-h-time">${timer.map(c => { const valgt = v && c.t0 === v.t0 && c.t1 === v.t1;
    return `<div class="uk-c uk-time${valgt ? ' at2-valgt' : ''}" style="left:${c.x0}px;width:${c.w}px" data-action="at2-time" data-t0="${c.t0}" data-t1="${c.t1}" title="Trykk for å velge timen">${esc(c.txt)}</div>`; }).join('')}</div>` : '';
  const naa = new Date(), tNaa = daysBetween(from, TODAY) * 24 + naa.getHours() + naa.getMinutes() / 60;
  return `<div class="sv-scroll at2-tidslinje"><div style="position:relative;width:${bredde}px">${rad('uke')}${rad('dag')}${rad('periode')}${timeRad}
    ${v ? `<div class="at2-markor" style="left:${x(v.t0)}px;width:${Math.max(3, x(v.t1) - x(v.t0))}px"></div>` : ''}<div class="sv-today" style="left:${x(tNaa)}px" title="Nå"></div></div></div>`;
}

// ----- kartet: overliggende soner, eller undersonene til sonen det er zoomet inn på -----
function renderAkttil() {
  const root = document.getElementById('at2-root');
  if (!at2Ui.valgt) {
    const t = daysBetween(mondayOf(TODAY), TODAY) * 24;
    at2Ui.valgt = {t0: t, t1: t + 24};
    at2Ui.uker.add(mondayOf(TODAY));
  }
  const akt = at2Aktiviteter(), v = at2Ui.valgt;
  const zoom = at2Ui.zoom && smSone(at2Ui.zoom);
  const omraader = zoom ? smBarn(zoom.id) : at2Rot();
  const zoomSti = zoom ? smSti(zoom) : null;
  // Aktivitetene innenfor sonen det er zoomet inn på (alle når det ikke er zoomet), fordelt på områdene som vises.
  const synlige = zoom ? akt.filter(x => x.soner.some(z => at2Under(zoomSti, z))) : akt;
  // I et område: planlagt der (i Utkikksplan), eller med tillatelse i området eller en undersone av det.
  const iOmr = o => { const sti = smSti(o), under = new Set(smUnder(o.id)); return synlige.filter(x => x.soner.some(z => at2Under(sti, z)) || (at2Til(x.id) || {soner: []}).soner.some(id => under.has(id))); };
  const direkte = zoom ? synlige.filter(x => !omraader.some(o => x.soner.some(z => at2Under(smSti(o), z)))) : synlige.filter(x => !at2Rot().some(o => x.soner.some(z => at2Under(smSti(o), z))));
  const valgtAkt = at2Ui.akt && synlige.find(x => x.id === at2Ui.akt);
  if (at2Ui.akt && !valgtAkt) at2Ui.akt = null;
  const til = valgtAkt ? at2Til(valgtAkt.id) : null, merket = new Set(til ? til.soner : []);
  // Utsnitt rundt sonen det er zoomet inn på; grunnkartet og omrissene kommer fra Sonemodul.
  const box = zoom ? smUtsnitt(smGeom(zoom.id)) : [0, 0, MAP_W, MAP_H];
  const vb = box.join(' ');
  const pst = ([x, y]) => [(x - box[0]) / box[2] * 100, (y - box[1]) / box[3] * 100];
  const omrGeo = omraader.map(o => ({o, sti: smSti(o), polys: smGeom(o.id)}));
  const grunn = smGrunnSvg(box);
  // Områdene tegnes med omrisset sitt (eller undersonenes); farget sterkere når det er aktiviteter der.
  const ruter = omrGeo.map(({o, polys}) => { const n = iOmr(o).length;
    return polys.map(pts => `<polygon class="at2-c" data-at2sone="${o.id}" points="${pts.map(q => q.join(',')).join(' ')}" vector-effect="non-scaling-stroke" style="fill:${o.farge};fill-opacity:${n ? .28 : .1};stroke:${o.farge}"><title>${esc(smSti(o))}</title></polygon>`).join(''); }).join('');
  // Tegnede områder: den valgte aktivitetens fylt i fargen dens, de andres som tynn stiplet kant.
  const pkt = box[2] / 160;
  const omrSvg = synlige.flatMap(x => ((at2Til(x.id) || {}).omrader || []).map(o => ({x, o}))).map(({x, o}) => {
    const v = valgtAkt && valgtAkt.id === x.id;
    return `<polygon points="${o.pts.map(q => q.join(',')).join(' ')}" fill="${x.farge}" fill-opacity="${v ? .35 : .08}" stroke="${x.farge}" stroke-width="${v ? 2.5 : 1.5}" ${v ? '' : 'stroke-dasharray="6 4"'} vector-effect="non-scaling-stroke" style="pointer-events:none"/>`;
  }).join('') + (at2Ui.tegn ? `<polyline points="${at2Ui.tegn.pts.map(q => q.join(',')).join(' ')}${at2Ui.tegn.pts.length > 2 ? ' ' + at2Ui.tegn.pts[0].join(',') : ''}" fill="${valgtAkt ? valgtAkt.farge : '#1f6feb'}" fill-opacity=".2" stroke="${valgtAkt ? valgtAkt.farge : '#1f6feb'}" stroke-width="2" stroke-dasharray="8 5" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`
    + at2Ui.tegn.pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="${pkt}" fill="#fff" stroke="#24292f" stroke-width="1.5" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`).join('') : '')
    // Sonen aktiviteten har i Utkikksplan, markert med kant når den er valgt (der den holder seg).
    + (valgtAkt ? (at2Tillatt(valgtAkt) || []).map(pts => `<polygon points="${pts.map(q => q.join(',')).join(' ')}" fill="none" stroke="${valgtAkt.farge}" stroke-width="2.5" stroke-dasharray="7 4" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`).join('') : '');
  // Aktiviteter som er dratt på plass, står der de er plassert (og ikke i lappene midt i sonen).
  const plassert = new Set(synlige.filter(x => { const t = at2Til(x.id); return t && t.pos; }).map(x => x.id));
  const lapp = (x, ekstra = '') => `<div class="at2-lapp${valgtAkt && valgtAkt.id === x.id ? ' valgt' : ''}${at2Til(x.id) ? ' har' : ''}${ekstra}" data-action="at2-akt" data-at2drag="${esc(x.id)}" data-id="${esc(x.id)}" style="border-left-color:${x.farge}" title="${esc((x.a ? x.id + ' ' : '') + x.navn)} – dra for å plassere innenfor sonen">${x.a ? `<b>${esc(x.id)}</b> ` : ''}${esc(x.navn.length > 26 ? x.navn.slice(0, 25) + '…' : x.navn)}</div>`;
  const plasserte = synlige.filter(x => plassert.has(x.id)).map(x => { const [px, py] = pst(at2Til(x.id).pos);
    return px < 0 || px > 100 || py < 0 || py > 100 ? '' : `<div class="at2-pin" style="left:${px}%;top:${py}%">${lapp(x, ' pin')}</div>`; }).join('');
  // Aktivitetene står som lapper midt i området sitt (maks 4, så «+N»).
  const lapper = omrGeo.map(({o, polys}) => {
    const s = smSentrum(polys); if (!s) return '';
    const l = iOmr(o).filter(x => !plassert.has(x.id)), [px, py] = pst(s), alle = iOmr(o).length;
    return `<div class="at2-omr" style="left:${px}%;top:${py}%">
      <button class="at2-omrnavn" data-action="at2-zoom" data-id="${o.id}" title="${smBarn(o.id).length ? 'Zoom inn på ' + esc(o.navn) : esc(o.navn)}">${esc(o.navn)}${smBarn(o.id).length ? ' 🔍' : ''}${alle ? ` <b>${alle}</b>` : ''}</button>
      ${l.slice(0, 4).map(x => lapp(x)).join('')}
      ${l.length > 4 ? `<div class="at2-lapp mer">+${l.length - 4} til</div>` : ''}</div>`;
  }).join('') + (zoom && direkte.length ? `<div class="at2-omr at2-direkte"><span class="at2-omrnavn">I ${esc(zoom.navn)}, ikke fordelt <b>${direkte.length}</b></span>
      ${direkte.filter(x => !plassert.has(x.id)).slice(0, 6).map(x => lapp(x)).join('')}${direkte.length > 6 ? `<div class="at2-lapp mer">+${direkte.length - 6} til</div>` : ''}</div>` : '');
  const sti = []; let s = zoom, n = 0; while (s && n++ < 10) { sti.unshift(s); s = smSone(s.forelder); }
  const tidTekst = ukTidTekst(v.t0, v.t1);
  const radAkt = x => { const t = at2Til(x.id), sonerTxt = t ? (t.soner || []).map(id => (smSone(id) || {}).navn).filter(Boolean).join(', ') : '';
    return `<div class="at2-rad${valgtAkt && valgtAkt.id === x.id ? ' valgt' : ''}" data-action="at2-akt" data-at2drag="${esc(x.id)}" data-id="${esc(x.id)}" style="border-left-color:${x.farge}">
      <div><b>${x.a ? esc(x.id) + ' ' : ''}${esc(x.navn)}</b></div>
      <div class="sub">${esc(x.soner.map(z => z.split(' / ').pop()).join(', '))}${x.firma ? ' · ' + esc(x.firma) : ''}${x.at.length ? ' · AT ' + esc(x.at.join(', ')) : ' · ⚠ mangler AT'}</div>
      <div class="at2-status">${t && t.soner.length ? `✅ Tillatelse: ${esc(sonerTxt)}` : t && t.pos ? '📍 Plassert, ikke tegnet' : '<span class="sub">Ikke plassert eller tegnet</span>'}</div>
      ${valgtAkt && valgtAkt.id === x.id && t && (t.omrader || []).length ? `<div class="at2-omrliste">${t.omrader.map((o, i) => `<div>Område ${i + 1}: ${esc(o.soner.map(z => { const sz = smSone(z), d = (o.dekning || {})[z]; return (sz ? sz.navn : '?') + (d ? ` (${d[1] === 100 ? d[0] + ' %' : d[0] + '/' + d[1] + ' ruter'})` : ''); }).join(', ') || 'ingen soner')} <button class="link-btn" data-action="at2-fjern-omr" data-i="${i}">✕ fjern</button></div>`).join('')}</div>` : ''}
      ${valgtAkt && valgtAkt.id === x.id && t && t.pos ? `<div class="at2-omrliste">📍 Plassert${t.posSone && smSone(t.posSone) ? ' i ' + esc(smSone(t.posSone).navn) : ''} <button class="link-btn" data-action="at2-fjern-pos">✕ fjern plassering</button></div>` : ''}</div>`; };
  root.innerHTML = `<div class="panel">
    <h2>Aktivitetstillatelse <span class="readonly-tag">Prøve – AT-numrene er som før</span></h2>
    <p class="intro">Velg dag på datolinjen (trykk på en uke for å se dagene; trykk på en valgt dag igjen for å dele den i perioder). Aktivitetene som pågår da, vises på kartet. Trykk på en overliggende sone (🔍) for å zoome inn. Aktivitetene står i sonen sin fra Utkikksplan. Dra teksten dit i sonen aktiviteten skal være, og tegn området rundt den – området gjøres om til sonene det dekker.</p>
    ${at2Tidslinje(akt)}
  </div>
  <div class="at2-grid">
    <div class="panel at2-kartpanel">
      <div class="at2-sti"><button class="link-btn" data-action="at2-zoom" data-id="">Hele anlegget</button>${sti.map(x => ` › <button class="link-btn" data-action="at2-zoom" data-id="${x.id}">${esc(x.navn)}</button>`).join('')}
        <span class="sub"> · ${esc(tidTekst)} · ${synlige.length} aktivitet${synlige.length === 1 ? '' : 'er'}</span></div>
      ${valgtAkt ? `<div class="at2-hint">✏️ <b>${esc((valgtAkt.a ? valgtAkt.id + ' ' : '') + valgtAkt.navn)}:</b>
        ${at2Ui.tegn ? `trykk på kartet for å sette hjørnepunkter rundt området (${at2Ui.tegn.pts.length} satt, minst 3). Dobbelttrykk eller Enter for ferdig.
          <button class="btn small-btn primary" data-action="at2-tegn-ferdig" ${at2Ui.tegn.pts.length < 3 ? 'disabled' : ''}>Ferdig</button> <button class="btn small-btn" data-action="at2-tegn-angre" ${at2Ui.tegn.pts.length ? '' : 'disabled'}>Angre punkt</button> <button class="btn small-btn" data-action="at2-tegn-avbryt">Avbryt</button>`
        : `sonen fra Utkikksplan er markert med stiplet kant. Dra teksten dit i sonen aktiviteten skal være, og <button class="btn small-btn primary" data-action="at2-tegn">✏️ Tegn område</button> rundt den – området gjøres om til sonene det dekker. ${zoom || !omraader.some(o => smBarn(o.id).length) ? '' : 'Zoom inn først for finere soner.'} <button class="link-btn" data-action="at2-akt" data-id="">Lukk</button>`}</div>` : ''}
      <div class="at2-kart${at2Ui.tegn ? ' tegner' : ''}" data-box="${box.join(',')}" style="aspect-ratio:${box[2]} / ${box[3]};max-width:calc(620px * ${box[2] / box[3]})">${grunn}<svg class="at2-overlay" viewBox="${vb}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${ruter}${omrSvg}</svg>${lapper}${plasserte}</div>
      ${direkte.length ? `<p class="sub">${direkte.length} aktivitet${direkte.length === 1 ? '' : 'er'} ligger i ${zoom ? esc(zoom.navn) + ' uten underliggende sone' : 'soner som ikke finnes i Sonemodul'}: ${direkte.map(x => esc((x.a ? x.id + ' ' : '') + x.navn)).join(', ')}</p>` : ''}
    </div>
    <div class="panel at2-liste">
      <h3>Aktiviteter ${zoom ? 'i ' + esc(zoom.navn) : ''} – ${esc(tidTekst)}</h3>
      ${synlige.length ? synlige.map(radAkt).join('') : '<p class="sub">Ingen aktiviteter i dette tidsrommet.</p>'}
      ${valgtAkt ? `<label class="f" style="display:block;margin-top:8px;font-weight:600">Merknad til tillatelsen</label><input type="text" id="at2-merknad" value="${esc(til ? til.merknad || '' : '')}" placeholder="F.eks. bare formiddag, sperring mot B2 …" maxlength="200" style="width:100%;box-sizing:border-box;padding:6px;border:1px solid #d0d7de;border-radius:6px">` : ''}
    </div>
  </div>`;
}

// ----- handlinger -----
// Området til sonen(e) aktiviteten har i Utkikksplan (omriss fra Sonemodul). Teksten holder seg der, og tegnede områder
// regnes bare innenfor. null når sonen ikke finnes eller ikke er tegnet i Sonemodul (da er det ingen begrensning).
function at2Tillatt(x) {
  const soner = smLast().soner.filter(s => s.fase === at2Fase().id && x.soner.includes(smSti(s)));
  const polys = soner.flatMap(s => smGeom(s.id));
  return polys.length ? polys : null;
}
function at2Blader() {
  const zoom = at2Ui.zoom && smSone(at2Ui.zoom);
  return (zoom ? smUnder(zoom.id) : smLast().soner.filter(s => s.fase === at2Fase().id).map(s => s.id)).map(smSone).filter(s => s && !smBarn(s.id).length);
}
// Det tegnede området gjøres om til sonene det dekker. Området prøves med et fint rutenett av punkter: en finsone er med når
// noen av punktene dens ligger inne i det tegnede (og innenfor aktivitetens sone fra Utkikksplan); dekningen er andelen av sonen.
function at2Dekning(pts, x) {
  const zoom = at2Ui.zoom && smSone(at2Ui.zoom), tillatt = x ? at2Tillatt(x) : null, dekning = {};
  const blader = at2Blader().filter(b => (b.pts || []).length > 2);
  const b = smBbox(zoom ? smGeom(zoom.id) : blader.map(q => q.pts)) || [0, 0, MAP_W, MAP_H], steg = Math.max(1.5, (b[2] - b[0]) / 120);
  blader.forEach(sone => {
    const pr = smProver([sone.pts], steg), inne = pr.filter(([px, py]) => smInne(px, py, pts) && (!tillatt || tillatt.some(t => smInne(px, py, t))));
    if (inne.length) dekning[sone.id] = [Math.max(1, Math.round(inne.length / pr.length * 100)), 100];
  });
  return {soner: Object.keys(dekning), dekning};
}
function at2TilFor(x) {
  const M = at2Last(), tid = at2Nokkel(), u = me();
  let t = M.til.find(q => q.aktId === x && q.tid === tid);
  if (!t) { t = {id: (tid + '_' + x).replace(/[^\w:-]/g, '_'), aktId: x, tid, soner: [], omrader: [], merknad: '', av: u.name || '', endret: ''}; M.til.push(t); }
  t.omrader = t.omrader || [];
  return t;
}
// Sonene i tillatelsen: det de tegnede områdene dekker, og finsonen teksten er plassert i.
function at2Oppdater(t) {
  t.soner = [...new Set([...t.omrader.flatMap(o => o.soner), ...(t.posSone ? [t.posSone] : [])])];
  t.endret = new Date().toISOString(); t.av = me().name || '';
  if (!t.omrader.length && !t.pos && !t.merknad) at2Last().til = at2Last().til.filter(q => q !== t);
}
function at2TegnFerdig() {
  const x = at2Ui.akt, d = at2Ui.tegn, akt = at2Aktiviteter().find(q => q.id === x);
  if (!x || !d || d.pts.length < 3) return;
  const rr = v => Math.round(v * 10) / 10, pts = d.pts.map(([a, b]) => [rr(a), rr(b)]), dk = at2Dekning(pts, akt), t = at2TilFor(x);
  t.omrader.push({id: uid(), pts, soner: dk.soner, dekning: dk.dekning});
  at2Oppdater(t);
  at2Ui.tegn = null;
  const navn = dk.soner.map(z => (smSone(z) || {}).navn).join(', ');
  if (typeof logg === 'function') logg('Aktivitetstillatelse', ukErData(x) ? x : '', `${ukIdTekst(x) + ukNavn(x)} ${ukTidTekst(at2Ui.valgt.t0, at2Ui.valgt.t1)}: tegnet område – ${navn || 'ingen soner'}`);
  showToast(dk.soner.length ? `Området dekker ${navn}.` : 'Området dekker ingen soner innenfor aktivitetens sone – tegn innenfor den stiplede kanten.');
  at2Lagre(); renderAkttil();
}
// Plasser teksten innenfor sonen fra Utkikksplan: slippes den utenfor, flyttes den til nærmeste punkt inne i sonen.
function at2Plasser(x, pos) {
  const akt = at2Aktiviteter().find(q => q.id === x), tillatt = akt ? at2Tillatt(akt) : null;
  if (tillatt && !tillatt.some(t => smInne(pos[0], pos[1], t))) {
    const b = smBbox(tillatt), pr = smProver(tillatt, Math.max(2, (b[2] - b[0]) / 60));
    const nar = pr.sort((u, v) => Math.hypot(u[0] - pos[0], u[1] - pos[1]) - Math.hypot(v[0] - pos[0], v[1] - pos[1]))[0];
    if (nar) { pos = nar; showToast('Aktiviteten holder seg i sonen sin fra Utkikksplan.'); }
  }
  // Finsonen der teksten står (blant sonene som vises, ellers i hele fasen).
  const finn = l => l.find(q => (q.pts || []).length > 2 && smInne(pos[0], pos[1], q.pts));
  const sone = finn(at2Blader()) || finn(smLast().soner.filter(q => q.fase === at2Fase().id && !smBarn(q.id).length));
  const t = at2TilFor(x);
  t.pos = [Math.round(pos[0]), Math.round(pos[1])]; t.posSone = sone ? sone.id : '';
  at2Oppdater(t);
  at2Ui.akt = x;
  if (typeof logg === 'function') logg('Aktivitetstillatelse', ukErData(x) ? x : '', `${ukIdTekst(x) + ukNavn(x)} ${ukTidTekst(at2Ui.valgt.t0, at2Ui.valgt.t1)}: plassert${sone ? ' i ' + smSti(sone) : ''}`);
  at2Lagre(); renderAkttil();
}
function at2Action(action, btn) {
  if (action === 'at2-tid') {
    const niva = btn.dataset.niva, k = btn.dataset.key, from = mondayOf(TODAY);
    if (niva === 'uke') {
      if (at2Ui.uker.has(k)) { at2Ui.uker.delete(k); for (let j = 0; j < 7; j++) { const d = addDays(k, j); at2Ui.dager.delete(d); UK_PERIODER.forEach((_, pi) => at2Ui.perioder.delete(d + '|' + pi)); } }
      else at2Ui.uker.add(k);
    } else {
      const [t0, t1] = niva === 'dag' ? [daysBetween(from, k) * 24, daysBetween(from, k) * 24 + 24] : (() => { const [d, pi] = k.split('|'), t = daysBetween(from, d) * 24; return [t + UK_PERIODER[+pi][0], t + UK_PERIODER[+pi][1]]; })();
      const sett = niva === 'dag' ? at2Ui.dager : at2Ui.perioder;
      if (at2Ui.valgt && at2Ui.valgt.t0 === t0 && at2Ui.valgt.t1 === t1) { if (sett.has(k)) { sett.delete(k); if (niva === 'dag') UK_PERIODER.forEach((_, pi) => at2Ui.perioder.delete(k + '|' + pi)); } else sett.add(k); }
      else at2Ui.valgt = {t0, t1};
    }
    renderAkttil(); return;
  }
  if (action === 'at2-time') { at2Ui.valgt = {t0: +btn.dataset.t0, t1: +btn.dataset.t1}; renderAkttil(); return; }
  if (action === 'at2-zoom') { if (at2Ui.tegn) return; const s = btn.dataset.id && smSone(btn.dataset.id); if (s && !smBarn(s.id).length) return; at2Ui.zoom = s ? s.id : null; renderAkttil(); return; }
  if (action === 'at2-akt') { if (at2Ui.tegn || Date.now() - at2DragSlutt < 300) return; at2Ui.akt = btn.dataset.id && at2Ui.akt !== btn.dataset.id ? btn.dataset.id : null; renderAkttil(); return; }
  if (action === 'at2-tegn') { at2Ui.tegn = {pts: []}; renderAkttil(); return; }
  if (action === 'at2-tegn-angre') { if (at2Ui.tegn) at2Ui.tegn.pts.pop(); renderAkttil(); return; }
  if (action === 'at2-tegn-avbryt') { at2Ui.tegn = null; renderAkttil(); return; }
  if (action === 'at2-tegn-ferdig') { at2TegnFerdig(); return; }
  if (action === 'at2-fjern-omr' || action === 'at2-fjern-pos') {
    const t = at2Til(at2Ui.akt); if (!t) return;
    if (action === 'at2-fjern-pos') { delete t.pos; delete t.posSone; } else t.omrader.splice(+btn.dataset.i, 1);
    at2Oppdater(t); at2Lagre(); renderAkttil();
  }
}
// Trykk på kartet: med en aktivitet valgt markeres sonen; ellers zoomes det inn på en sone som har undersoner.
const at2KartPunkt = (kart, e) => { const [bx, by, bw, bh] = kart.dataset.box.split(',').map(Number), r = kart.getBoundingClientRect(); return [bx + (e.clientX - r.left) / r.width * bw, by + (e.clientY - r.top) / r.height * bh]; };
document.addEventListener('click', e => {
  if (!at2Pa() || Date.now() - at2DragSlutt < 300) return;
  const kart = e.target.closest && e.target.closest('#at2-root .at2-kart');
  if (kart && at2Ui.tegn) { at2Ui.tegn.pts.push(at2KartPunkt(kart, e)); renderAkttil(); return; }
  const c = e.target.closest && e.target.closest('#at2-root [data-at2sone]');
  if (!c) return;
  const s = smSone(c.dataset.at2sone);
  if (s && smBarn(s.id).length) { at2Ui.zoom = s.id; renderAkttil(); }
});
document.addEventListener('dblclick', e => { if (at2Pa() && at2Ui.tegn && e.target.closest && e.target.closest('#at2-root .at2-kart')) { at2Ui.tegn.pts.pop(); at2TegnFerdig(); } });
document.addEventListener('keydown', e => {
  if (!at2Pa() || !at2Ui.tegn) return;
  if (e.key === 'Enter') { e.preventDefault(); at2TegnFerdig(); }
  else if (e.key === 'Escape') { at2Ui.tegn = null; renderAkttil(); }
  else if (e.key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); at2Ui.tegn.pts.pop(); renderAkttil(); }
});
// Dra en aktivitet (lapp på kartet eller rad i lista) og slipp den der den skal være på kartet.
let at2Drag = null, at2DragSlutt = 0;
document.addEventListener('pointerdown', e => {
  if (!at2Pa() || at2Ui.tegn || e.button > 0) return;
  const el = e.target.closest && e.target.closest('#at2-root [data-at2drag]');
  if (!el || e.target.closest('button, input')) return;
  at2Drag = {id: el.dataset.at2drag, el, x0: e.clientX, y0: e.clientY, moved: false, spokelse: null};
});
document.addEventListener('pointermove', e => {
  const d = at2Drag; if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
  if (!d.moved) {
    d.moved = true;
    d.spokelse = document.createElement('div'); d.spokelse.className = 'at2-lapp at2-spokelse'; d.spokelse.innerHTML = d.el.querySelector('b') ? d.el.querySelector('b').outerHTML + ' ' + esc(ukNavn(d.id)).slice(0, 30) : esc(ukNavn(d.id)).slice(0, 30);
    d.spokelse.style.borderLeftColor = d.el.style.borderLeftColor;
    document.body.appendChild(d.spokelse); document.body.classList.add('at2-drar');
  }
  d.spokelse.style.left = e.clientX + 'px'; d.spokelse.style.top = e.clientY + 'px';
});
document.addEventListener('pointerup', e => {
  const d = at2Drag; if (!d) return;
  at2Drag = null;
  if (!d.moved) return;
  at2DragSlutt = Date.now();
  d.spokelse.remove(); document.body.classList.remove('at2-drar');
  const kart = document.querySelector('#at2-root .at2-kart'), r = kart && kart.getBoundingClientRect();
  if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) at2Plasser(d.id, at2KartPunkt(kart, e));
});
document.addEventListener('change', e => {
  if (!at2Pa() || e.target.id !== 'at2-merknad' || !at2Ui.akt) return;
  const M = at2Last(), tid = at2Nokkel(), x = at2Ui.akt;
  const t = at2TilFor(x);
  t.merknad = e.target.value.trim(); t.endret = new Date().toISOString();
  at2Lagre();
});
window.addEventListener('resize', () => { clearTimeout(window.at2ResizeT); window.at2ResizeT = setTimeout(() => { if (at2Pa()) renderAkttil(); }, 200); });
