// ---------- Aktivitetstillatelse (fanen «Aktivitetstillatelse», foreløpig kun systemadministrator) ----------
// Prøve på en ny type arbeidstillatelse per aktivitet og dag. Velg en dag (eller periode/time) på datolinjen – samme datolinje
// som i Utkikksplan, 3 uker fram. Aktivitetene som pågår da, vises på kartet fra Sonemodul. Trykk på en overliggende sone for å
// zoome inn og se den finere inndelingen; velg en aktivitet og marker sonene den skal være i den dagen.
// AT-numrene er som før. Aktivitetene og sonene hentes fra Utkikksplan/Sonemodul; tillatelsene lagres i samlingen «akttil».
const AT2_KEY = 'wrk2_akttil', AT2_UKER = 3;
let AT2 = null;
const at2Synk = lagSynk(['akttil']);
const at2Ui = {uker: new Set(), dager: new Set(), perioder: new Set(), valgt: null, zoom: null, akt: null};

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
  const zoom = at2Ui.zoom && smSone(at2Ui.zoom), C = smCeller();
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
  // Utsnitt: rutene til sonen det er zoomet inn på, med litt luft rundt.
  const celler = zoom ? smAlleCeller(zoom.id).map(id => C.find(c => c.id === id)).filter(Boolean) : C;
  let box = [0, 0, MAP_W, MAP_H];
  if (zoom && celler.length) {
    const x0 = Math.min(...celler.map(c => c.x0)), x1 = Math.max(...celler.map(c => c.x1)), y0 = Math.min(...celler.map(c => c.y0)), y1 = Math.max(...celler.map(c => c.y1));
    const pad = Math.max(30, (x1 - x0) * .08);
    box = [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad];
    // Ikke smalere enn 4:3, så kartet ikke blir høyt og smalt.
    if (box[2] / box[3] < 4 / 3) { const w = box[3] * 4 / 3; box[0] -= (w - box[2]) / 2; box[2] = w; }
  }
  const vb = box.join(' ');
  // Områdene tegnes med fargen sin; merkede soner for valgt aktivitet får aktivitetens farge.
  const omrCeller = omraader.map(o => ({o, sti: smSti(o), celler: smAlleCeller(o.id)}));
  const eier = new Map();
  omrCeller.forEach(({o, celler: cs}) => cs.forEach(id => { if (!eier.has(id) || smBarn(o.id).length) eier.set(id, o); }));
  // Innzoomet: bygningene tegnes enkelt med tynne streker og aksene langs kanten (strekene i AT-kartet blir for grove forstørret).
  const fs = box[2] / 70;
  const grunn = !zoom ? zoneSvg({}) : `<svg viewBox="${box.join(' ')}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#fbfcf8"/>
    ${ZONES.map(z => `<polygon points="${z.pts.map(q => q.join(',')).join(' ')}" fill="${z.fill}" stroke="#8a8a8a" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('')}
    ${[...AX_TOP, ...AX_S].filter(([, x]) => x > box[0] && x < box[0] + box[2]).map(([t, x]) => `<line x1="${x}" y1="${box[1]}" x2="${x}" y2="${box[1] + box[3]}" stroke="#c8c8c8" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/><text x="${x}" y="${box[1] + fs * 1.2}" font-size="${fs}" text-anchor="middle" fill="#8c959f" font-family="Arial">${t}</text>`).join('')}
    ${[...AX_ROWS, ...AX_ROWS_R].filter(([, y]) => y > box[1] && y < box[1] + box[3]).map(([t, y]) => `<line x1="${box[0]}" y1="${y}" x2="${box[0] + box[2]}" y2="${y}" stroke="#c8c8c8" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/><text x="${box[0] + fs * .4}" y="${y - fs * .25}" font-size="${fs}" fill="#8c959f" font-family="Arial">${t}</text>`).join('')}</svg>`;
  const ruter = [...eier.entries()].map(([id, o]) => {
    const c = C.find(q => q.id === id); if (!c) return '';
    const erMerket = merket.has(o.id), n = iOmr(o).length;
    return `<rect class="at2-c${erMerket ? ' merket' : ''}" data-at2sone="${o.id}" x="${c.x0}" y="${c.y0}" width="${c.x1 - c.x0}" height="${c.y1 - c.y0}" vector-effect="non-scaling-stroke" style="fill:${erMerket ? valgtAkt.farge : o.farge};fill-opacity:${erMerket ? .6 : n ? .28 : .1}"><title>${esc(smSti(o))}</title></rect>`;
  }).join('');
  const sentrum = cs => { const l = cs.map(id => C.find(c => c.id === id)).filter(Boolean); return l.length ? [l.reduce((n, c) => n + c.cx, 0) / l.length, l.reduce((n, c) => n + c.cy, 0) / l.length] : null; };
  const pst = ([x, y]) => [(x - box[0]) / box[2] * 100, (y - box[1]) / box[3] * 100];
  // Aktivitetene står som lapper midt i området sitt (maks 4, så «+N»).
  const lapper = omrCeller.map(({o, celler: cs}) => {
    const s = sentrum(cs); if (!s) return '';
    const l = iOmr(o), [px, py] = pst(s);
    return `<div class="at2-omr" style="left:${px}%;top:${py}%">
      <button class="at2-omrnavn" data-action="at2-zoom" data-id="${o.id}" title="${smBarn(o.id).length ? 'Zoom inn på ' + esc(o.navn) : esc(o.navn)}">${esc(o.navn)}${smBarn(o.id).length ? ' 🔍' : ''}${l.length ? ` <b>${l.length}</b>` : ''}</button>
      ${l.slice(0, 4).map(x => `<div class="at2-lapp${valgtAkt && valgtAkt.id === x.id ? ' valgt' : ''}${at2Til(x.id) ? ' har' : ''}" data-action="at2-akt" data-id="${esc(x.id)}" style="border-left-color:${x.farge}" title="${esc((x.a ? x.id + ' ' : '') + x.navn)}">${x.a ? `<b>${esc(x.id)}</b> ` : ''}${esc(x.navn.length > 26 ? x.navn.slice(0, 25) + '…' : x.navn)}</div>`).join('')}
      ${l.length > 4 ? `<div class="at2-lapp mer">+${l.length - 4} til</div>` : ''}</div>`;
  }).join('') + (zoom && direkte.length ? `<div class="at2-omr at2-direkte"><span class="at2-omrnavn">I ${esc(zoom.navn)}, ikke fordelt <b>${direkte.length}</b></span>
      ${direkte.slice(0, 6).map(x => `<div class="at2-lapp${valgtAkt && valgtAkt.id === x.id ? ' valgt' : ''}${at2Til(x.id) ? ' har' : ''}" data-action="at2-akt" data-id="${esc(x.id)}" style="border-left-color:${x.farge}">${x.a ? `<b>${esc(x.id)}</b> ` : ''}${esc(x.navn.length > 26 ? x.navn.slice(0, 25) + '…' : x.navn)}</div>`).join('')}${direkte.length > 6 ? `<div class="at2-lapp mer">+${direkte.length - 6} til</div>` : ''}</div>` : '');
  const sti = []; let s = zoom, n = 0; while (s && n++ < 10) { sti.unshift(s); s = smSone(s.forelder); }
  const tidTekst = ukTidTekst(v.t0, v.t1);
  const radAkt = x => { const t = at2Til(x.id), sonerTxt = t ? t.soner.map(id => (smSone(id) || {}).navn).filter(Boolean).join(', ') : '';
    return `<div class="at2-rad${valgtAkt && valgtAkt.id === x.id ? ' valgt' : ''}" data-action="at2-akt" data-id="${esc(x.id)}" style="border-left-color:${x.farge}">
      <div><b>${x.a ? esc(x.id) + ' ' : ''}${esc(x.navn)}</b></div>
      <div class="sub">${esc(x.soner.map(z => z.split(' / ').pop()).join(', '))}${x.firma ? ' · ' + esc(x.firma) : ''}${x.at.length ? ' · AT ' + esc(x.at.join(', ')) : ' · ⚠ mangler AT'}</div>
      <div class="at2-status">${t && t.soner.length ? `✅ Tillatelse: ${esc(sonerTxt)}` : '<span class="sub">Ingen soner markert</span>'}</div></div>`; };
  root.innerHTML = `<div class="panel">
    <h2>Aktivitetstillatelse <span class="readonly-tag">Prøve – AT-numrene er som før</span></h2>
    <p class="intro">Velg dag på datolinjen (trykk på en uke for å se dagene; trykk på en valgt dag igjen for å dele den i perioder). Aktivitetene som pågår da, vises på kartet. Trykk på en overliggende sone (🔍) for å zoome inn. Velg en aktivitet, og trykk på sonene den skal være i.</p>
    ${at2Tidslinje(akt)}
  </div>
  <div class="at2-grid">
    <div class="panel at2-kartpanel">
      <div class="at2-sti"><button class="link-btn" data-action="at2-zoom" data-id="">Hele anlegget</button>${sti.map(x => ` › <button class="link-btn" data-action="at2-zoom" data-id="${x.id}">${esc(x.navn)}</button>`).join('')}
        <span class="sub"> · ${esc(tidTekst)} · ${synlige.length} aktivitet${synlige.length === 1 ? '' : 'er'}</span></div>
      ${valgtAkt ? `<div class="at2-hint">✏️ <b>${esc((valgtAkt.a ? valgtAkt.id + ' ' : '') + valgtAkt.navn)}:</b> trykk på sonene på kartet for å markere/fjerne. ${zoom || !omraader.some(o => smBarn(o.id).length) ? '' : 'Zoom inn for finere soner.'} <button class="link-btn" data-action="at2-akt" data-id="">Ferdig</button></div>` : ''}
      <div class="at2-kart" style="aspect-ratio:${box[2]} / ${box[3]};max-width:calc(620px * ${box[2] / box[3]})">${grunn}<svg class="at2-overlay" viewBox="${vb}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${ruter}</svg>${lapper}</div>
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
function at2SettSone(soneId) {
  const x = at2Ui.akt; if (!x || !at2Ui.valgt) return;
  const M = at2Last(), tid = at2Nokkel(), u = me();
  let t = M.til.find(q => q.aktId === x && q.tid === tid);
  if (!t) { t = {id: (tid + '_' + x).replace(/[^\w:-]/g, '_'), aktId: x, tid, soner: [], merknad: '', av: u.name || '', endret: ''}; M.til.push(t); }
  t.soner = t.soner.includes(soneId) ? t.soner.filter(z => z !== soneId) : [...t.soner, soneId];
  t.endret = new Date().toISOString(); t.av = u.name || '';
  if (!t.soner.length && !t.merknad) M.til = M.til.filter(q => q !== t);
  const s = smSone(soneId);
  if (typeof logg === 'function') logg('Aktivitetstillatelse', ukErData(x) ? x : '', `${ukIdTekst(x) + ukNavn(x)} ${ukTidTekst(at2Ui.valgt.t0, at2Ui.valgt.t1)}: ${t.soner.includes(soneId) ? 'la til' : 'fjernet'} ${s ? smSti(s) : soneId}`);
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
  if (action === 'at2-zoom') { const s = btn.dataset.id && smSone(btn.dataset.id); if (s && !smBarn(s.id).length) { if (at2Ui.akt) at2SettSone(s.id); return; } at2Ui.zoom = s ? s.id : null; renderAkttil(); return; }
  if (action === 'at2-akt') { at2Ui.akt = btn.dataset.id && at2Ui.akt !== btn.dataset.id ? btn.dataset.id : null; renderAkttil(); }
}
// Trykk på kartet: med en aktivitet valgt markeres sonen; ellers zoomes det inn på en sone som har undersoner.
document.addEventListener('click', e => {
  if (!at2Pa()) return;
  const c = e.target.closest && e.target.closest('#at2-root [data-at2sone]');
  if (!c) return;
  const s = smSone(c.dataset.at2sone); if (!s) return;
  if (at2Ui.akt) { at2SettSone(s.id); return; }
  if (smBarn(s.id).length) { at2Ui.zoom = s.id; renderAkttil(); }
});
document.addEventListener('change', e => {
  if (!at2Pa() || e.target.id !== 'at2-merknad' || !at2Ui.akt) return;
  const M = at2Last(), tid = at2Nokkel(), x = at2Ui.akt;
  let t = M.til.find(q => q.aktId === x && q.tid === tid);
  if (!t) { t = {id: (tid + '_' + x).replace(/[^\w:-]/g, '_'), aktId: x, tid, soner: [], merknad: '', av: me().name || '', endret: ''}; M.til.push(t); }
  t.merknad = e.target.value.trim(); t.endret = new Date().toISOString();
  at2Lagre();
});
window.addEventListener('resize', () => { clearTimeout(window.at2ResizeT); window.at2ResizeT = setTimeout(() => { if (at2Pa()) renderAkttil(); }, 200); });
