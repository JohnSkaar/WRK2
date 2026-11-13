// ---------- Sonemodul (fanen «Sonemodul», foreløpig kun systemadministrator) ----------
// Soneinndelingen, i et tre per fase (f.eks. «Grunn og betong» og «Innvendige arbeider»): fra overliggende soner (bygg) til
// finere inndeling. Hver sone tegnes som et omriss. Generell regel: de overliggende sonene tegnes først, og de underliggende
// plasseres inne i dem – en underliggende sone er alltid en finere inndeling av én overliggende sone.
// Er bare én underliggende sone igjen utegnet, fyller den resten av den overliggende («resten»). Utomhus er resten av tomta.
// Oppbyggingen er lik Aktivitetstillatelse: trykk på en sone for å zoome inn; sonene som ennå ikke er tegnet, står som lapper
// som kan dras dit teksten skal stå, og så tegnes omrisset.
// Foreløpig brukes Sonemodul bare av Utkikksplan og Aktivitetstillatelse; resten av appen påvirkes ikke.
// Lagring: ett dokument per fase og per sone i samlingen «sonemod» (se lagSynk i utkikk.js).
const SM_KEY = 'wrk2_sonemod', SM_GEO = 3;   // SM_GEO: versjon av soneformatet/standardoppsettet
const SM_FARGER = ['#2da44e', '#1f6feb', '#bf3989', '#d4a72c', '#8250df', '#cf222e', '#0e7c86', '#fb8500', '#57606a', '#1a7f37', '#953800', '#0969da'];
const SM_TOMT = [[8, 8], [1885, 8], [1885, 788], [8, 788]];   // tomta: hele kartet, til en egen tomtegrense er tegnet
let SM = null;
const smSynk = lagSynk(['sonemod']);
const smUi = {fase: null, valgt: null, zoom: null, tegn: null, fest: true};

// ----- geometri -----
function smInne(x, y, pts) {
  let inne = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}
function smNarmestPaKant(x, y, pts) {
  let best = null;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0, px = ax + t * dx, py = ay + t * dy, d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = {d, p: [px, py]};
  }
  return best;
}
const smInneTol = (x, y, pts, tol = 2) => smInne(x, y, pts) || smNarmestPaKant(x, y, pts).d <= tol;
const harOmr = s => !!(s && s.pts && s.pts.length > 2);
// Formen til en sone: {pos, neg} – inne i en av pos og ikke i noen av neg.
//  · eget omriss → det;  · «resten» → den overliggende sonens form minus søsknene som er tegnet;
//  · ellers → undersonenes former samlet.
function smForm(id, n = 0) {
  const s = smSone(id);
  if (!s || n > 12) return {pos: [], neg: []};
  if (harOmr(s)) return {pos: [s.pts], neg: []};
  if (s.rest) {
    const sosken = (s.forelder ? smBarn(s.forelder) : smSonerI(s.fase).filter(x => !x.forelder)).filter(x => x.id !== s.id);
    const ytre = s.forelder ? smForm(s.forelder, n + 1) : {pos: [(smLast().faser.find(f => f.id === s.fase) || {}).tomt || SM_TOMT], neg: []};
    return {pos: ytre.pos, neg: [...ytre.neg, ...sosken.filter(x => !x.rest).flatMap(x => smForm(x.id, n + 1).pos)]};
  }
  const barn = smBarn(id).map(c => smForm(c.id, n + 1));
  return {pos: barn.flatMap(f => f.pos), neg: barn.flatMap(f => f.neg)};
}
const smFormInne = (f, x, y) => f.pos.some(p => smInne(x, y, p)) && !f.neg.some(p => smInne(x, y, p));
const smFormTom = f => !f.pos.length;
const smFormSti = f => [...f.pos, ...f.neg].map(p => 'M' + p.map(q => q.join(',')).join('L') + 'Z').join('');
function smBbox(polys) {
  const xs = polys.flat().map(p => p[0]), ys = polys.flat().map(p => p[1]);
  return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
}
// Punkter på et rutenett inne i formen (brukes til dekning, tyngdepunkt og nærmeste punkt inne i sonen).
function smProver(f, steg) {
  const b = smBbox(f.pos); if (!b) return [];
  const ut = [];
  for (let x = b[0] + steg / 2; x < b[2]; x += steg) for (let y = b[1] + steg / 2; y < b[3]; y += steg) if (smFormInne(f, x, y)) ut.push([x, y]);
  return ut;
}
// Et punkt midt i formen: nærmeste prøvepunkt til gjennomsnittet av prøvepunktene (ligger alltid inne i sonen).
function smSentrum(f) {
  const b = smBbox(f.pos); if (!b) return null;
  const pr = smProver(f, Math.max(2, Math.max(b[2] - b[0], b[3] - b[1]) / 40));
  if (!pr.length) return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const mx = pr.reduce((n, p) => n + p[0], 0) / pr.length, my = pr.reduce((n, p) => n + p[1], 0) / pr.length;
  return pr.sort((u, v) => Math.hypot(u[0] - mx, u[1] - my) - Math.hypot(v[0] - mx, v[1] - my))[0];
}
// Teksten står der admin har plassert den, ellers midt i sonen.
const smTekstPos = s => s.tekst || smSentrum(smForm(s.id));
// Den overliggende sonen omrisset må holde seg innenfor: nærmeste overliggende sone som har en form.
function smBeholder(s) { let f = s && smSone(s.forelder), n = 0; while (f && n++ < 12) { const fo = smForm(f.id); if (!smFormTom(fo)) return {sone: f, form: fo}; f = smSone(f.forelder); } return null; }
function smInnenfor(pts, beh) {
  if (!beh) return true;
  const mid = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  return [...pts, ...mid].every(([x, y]) => beh.form.pos.some(p => smInneTol(x, y, p, 3)) && !beh.form.neg.some(p => smInne(x, y, p) && smNarmestPaKant(x, y, p).d > 3));
}
// Festing: hjørnene og kantene til den overliggende sonen og søsknene, så aksene. Kan slås av.
function smFest([x, y], tol, s) {
  if (!smUi.fest) return [Math.round(x), Math.round(y)];
  const beh = s && smBeholder(s), sosken = s ? (s.forelder ? smBarn(s.forelder) : []).filter(q => q.id !== s.id && harOmr(q)) : [];
  const flater = [...(beh ? [...beh.form.pos, ...beh.form.neg] : []), ...sosken.map(q => q.pts)];
  const hj = flater.flat();
  const nar = hj.filter(([a, b]) => Math.hypot(a - x, b - y) <= tol).sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0];
  if (nar) return [nar[0], nar[1]];
  // Akser først (punktet låses til aksekryss/akse), så kanter på den overliggende sonen og søsknene.
  const ax = [...AX_TOP, ...AX_S].map(a => a[1]).concat(hj.map(p => p[0])), ay = [...AX_ROWS, ...AX_ROWS_R].map(a => a[1]).concat(hj.map(p => p[1]));
  const n = (v, l) => { const b = l.reduce((m, w) => Math.abs(w - v) < Math.abs(m - v) ? w : m, Infinity); return Math.abs(b - v) <= tol ? b : null; };
  const fx = n(x, ax), fy = n(y, ay);
  if (fx !== null || fy !== null) return [fx !== null ? fx : Math.round(x), fy !== null ? fy : Math.round(y)];
  const kant = flater.map(p => smNarmestPaKant(x, y, p)).filter(k => k && k.d <= tol).sort((a, b) => a.d - b.d)[0];
  return kant ? [Math.round(kant.p[0]), Math.round(kant.p[1])] : [Math.round(x), Math.round(y)];
}
// Grunnkartet: hele kartet fra AT-koordinering, eller (innzoomet) byggene med tynne streker og aksene langs kanten.
function smGrunnSvg(box) {
  if (!box || (box[0] === 0 && box[2] === MAP_W)) return zoneSvg({});
  const fs = box[2] / 70;
  return `<svg viewBox="${box.join(' ')}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#fbfcf8"/>
    ${ZONES.map(z => `<polygon points="${z.pts.map(q => q.join(',')).join(' ')}" fill="${z.fill}" stroke="#8a8a8a" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`).join('')}
    ${[...AX_TOP, ...AX_S].filter(([, x]) => x > box[0] && x < box[0] + box[2]).map(([t, x]) => `<line x1="${x}" y1="${box[1]}" x2="${x}" y2="${box[1] + box[3]}" stroke="#c8c8c8" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/><text x="${x}" y="${box[1] + fs * 1.2}" font-size="${fs}" text-anchor="middle" fill="#8c959f" font-family="Arial">${t}</text>`).join('')}
    ${[...AX_ROWS, ...AX_ROWS_R].filter(([, y]) => y > box[1] && y < box[1] + box[3]).map(([t, y]) => `<line x1="${box[0]}" y1="${y}" x2="${box[0] + box[2]}" y2="${y}" stroke="#c8c8c8" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/><text x="${box[0] + fs * .4}" y="${y - fs * .25}" font-size="${fs}" fill="#8c959f" font-family="Arial">${t}</text>`).join('')}</svg>`;
}
// Utsnitt rundt en form, med luft rundt og ikke smalere enn 4:3. Utomhus/tomta gir hele kartet.
function smUtsnitt(f) {
  const b = f && f.pos.length ? smBbox(f.pos) : null;
  if (!b || (b[2] - b[0] > MAP_W * .9)) return [0, 0, MAP_W, MAP_H];
  const pad = Math.max(30, (b[2] - b[0]) * .08);
  const box = [b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad];
  if (box[2] / box[3] < 4 / 3) { const w = box[3] * 4 / 3; box[0] -= (w - box[2]) / 2; box[2] = w; }
  return box;
}

// ----- standardoppsett: byggene fra kartet, og kjelleren delt opp for to faser (etter sonetegningene for U.etg) -----
const SM_KJELLER = [[228, 113], [708, 113], [760, 165], [850, 165], [850, 345], [890, 345], [890, 540], [550, 540], [550, 345], [545, 345], [545, 165], [228, 165]];
const smR = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function smStandard() {
  const faser = [], soner = [];
  const slug = t => t.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '');
  const lagFase = (kode, navn, utkikk, kjellerdeler) => {
    const fase = {id: 'f-' + kode, type: 'fase', navn, utkikk, rekkefolge: faser.length, geo: SM_GEO};
    faser.push(fase);
    let n = 0;
    const ny = (navn, forelder, pts = null, merknad = '', rest = false) => { const s = {id: 's-' + kode + '-' + (forelder ? forelder.id.split('-').slice(2).join('-') + '-' : '') + slug(navn), type: 'sone', fase: fase.id, navn, forelder: forelder ? forelder.id : null, pts, rest, farge: SM_FARGER[n % SM_FARGER.length], rekkefolge: n++, merknad}; soner.push(s); return s; };
    const z = navn => (ZONES.find(q => q.navn === navn) || {}).pts;
    ny('8300 - Utomhus', null, null, 'Resten av tomta (utenfor byggene)', true).tekst = [130, 720];
    ny('8301 - Ovnshall', null, z('8301 - Ovnshall'));
    const kjeller = ny('8302 - Kjeller', null, SM_KJELLER, 'Kjeller / U1-nivå');
    // Kjellerinnkjøringen (rampen, RA/RB) går fra F1 til F10; øst for F10 er det Uteplass kjeller.
    ny('Kjellerinnkjøring', kjeller, smR(228, 113, 545, 165), 'Rampe, RA/RB fra F1 til F10');
    kjellerdeler(ny, kjeller);
    ['8302 - Trådhall', '8302 - Kontrollsenter', '8303 - Driftssenter', '8304 - Lagerhall', 'Pallelager'].forEach(q => ny(q, null, z(q)));
  };
  // Grunn og betong: Vest og Øst skilles i akse W5. Uteplass kjeller (innkjøringen øst for F10 og det åpne området ned i
  // kjelleren) er delt på W5 mellom dem. Vest = B1, B3, Uteplass vest; Øst = B2, B4, OpCB, Uteplass øst.
  lagFase('gb', 'Grunn og betong', true, (ny, kj) => {
    const vest = ny('Vest', kj, [[545, 113], [708, 113], [715, 120], [715, 540], [550, 540], [550, 345], [545, 345]]);
    const ost = ny('Øst', kj, [[715, 120], [760, 165], [850, 165], [850, 345], [890, 345], [890, 540], [715, 540]]);
    ny('B1', vest, [[545, 165], [609, 165], [609, 345], [715, 345], [715, 420], [550, 420], [550, 345], [545, 345]]);
    ny('B3', vest, smR(550, 420, 715, 540));
    ny('Uteplass kjeller vest', vest, [[545, 113], [708, 113], [715, 120], [715, 345], [609, 345], [609, 165], [545, 165]], 'Del av Uteplass kjeller');
    ny('B2', ost, smR(715, 345, 890, 420));
    ny('B4', ost, smR(715, 420, 890, 540));
    ny('OpCB', ost, smR(743, 165, 850, 345), 'Tilhører 8303 Driftssenter, ligger i kjeller (U1)');
    ny('Uteplass kjeller øst', ost, [[715, 120], [760, 165], [743, 165], [743, 345], [715, 345]], 'Del av Uteplass kjeller');
  });
  // Innvendige arbeider: B-3.1 til B-3.13, og Uteplass kjeller samlet.
  lagFase('ia', 'Innvendige arbeider', false, (ny, kj) => {
    ny('Uteplass kjeller', kj, [[545, 113], [708, 113], [760, 165], [743, 165], [743, 345], [609, 345], [609, 165], [545, 165]]);
    ny('B-3.1', kj, smR(545, 165, 576, 212));
    ny('B-3.2', kj, smR(576, 165, 606, 212));
    ny('B-3.3', kj, smR(545, 212, 606, 345));
    ny('B-3.4', kj, smR(613, 345, 646, 401));
    ny('B-3.5', kj, [[550, 345], [613, 345], [613, 401], [646, 401], [646, 345], [704, 345], [704, 437], [550, 437]]);
    ny('B-3.6', kj, smR(550, 437, 704, 540));
    ny('B-3.7', kj, [[704, 385], [800, 385], [800, 345], [890, 345], [890, 540], [704, 540]]);
    ny('B-3.8', kj, smR(704, 345, 800, 385));
    ny('B-3.9', kj, smR(743, 315, 771, 345));
    ny('B-3.10', kj, smR(771, 315, 800, 345));
    ny('B-3.11', kj, smR(743, 184, 771, 315));
    ny('B-3.12', kj, smR(771, 175, 800, 315));
    ny('B-3.13', kj, smR(800, 193, 850, 315));
  });
  return {faser, soner};
}

// ----- lagring -----
function smNorm(m) {
  m = m && Array.isArray(m.faser) ? m : {faser: [], soner: []};
  m.soner = m.soner || [];
  m.faser.sort((a, b) => (a.rekkefolge || 0) - (b.rekkefolge || 0));
  m.soner.sort((a, b) => (a.rekkefolge || 0) - (b.rekkefolge || 0));
  return m;
}
// Soner i et eldre format/oppsett erstattes av standardoppsettet.
const smGammel = m => !m.faser.length || m.faser.some(f => f.geo !== SM_GEO);
function smLast() {
  if (SM) return SM;
  try { SM = JSON.parse(localStorage.getItem(SM_KEY)); } catch (e) { SM = null; }
  SM = smNorm(SM);
  // Vises med en gang, også før skyen har svart; svaret fra skyen erstatter det etterpå.
  if (smGammel(SM)) SM = smStandard();
  return SM;
}
const smDocs = () => ({sonemod: tilKart([...smLast().faser, ...smLast().soner])});
let smLagreT = null;
function smLagre() {
  clearTimeout(smLagreT);
  smLagreT = setTimeout(() => {
    try { localStorage.setItem(SM_KEY, JSON.stringify(SM)); } catch (e) {}
    if (typeof CLOUD !== 'undefined' && CLOUD && smSynk.klar && window.cloudSkrivDocs) { const ops = smSynk.endringer(smDocs()); if (ops.length) window.cloudSkrivDocs(ops); }
  }, 300);
}
window.smFraSamlinger = remote => {
  const lokal = smSynk.klar ? (clearTimeout(smLagreT), smDocs()) : null;
  const alle = fraKart(smSynk.flett(remote, lokal).sonemod);
  SM = smNorm({faser: alle.filter(d => d.type === 'fase'), soner: alle.filter(d => d.type === 'sone')});
  // Første gang i skyen (eller eldre format): legg inn standardoppsettet.
  if (smGammel(SM)) { SM = smStandard(); smLagre(); }
  else if (lokal) smLagre();
  try { localStorage.setItem(SM_KEY, JSON.stringify(SM)); } catch (e) {}
  if (smPa()) renderSonemod();
  if (typeof at2Pa === 'function' && at2Pa()) renderAkttil();
};
window.smMigrer = () => {};
// Rollen kan være ukjent rett etter innlogging (profilen lastes etter samlingene).
const smErSys = () => { try { return isSys(); } catch (e) { return false; } };
const smPa = () => typeof currentTab !== 'undefined' && currentTab === 'sonemod';

// ----- tre og navn -----
const smFase = () => { const M = smLast(); return M.faser.find(f => f.id === smUi.fase) || M.faser[0] || null; };
const smSonerI = faseId => smLast().soner.filter(s => s.fase === faseId);
const smSone = id => smLast().soner.find(s => s.id === id);
const smBarn = id => smLast().soner.filter(s => s.forelder === id);
function smSti(s) { const navn = []; let n = 0; while (s && n++ < 12) { navn.unshift(s.navn); s = smSone(s.forelder); } return navn.join(' / '); }
const smUnder = id => [id, ...smBarn(id).flatMap(c => smUnder(c.id))];
const smKart = faseId => new Map(smSonerI(faseId).map(s => [s.id, smSti(s)]));
const smTegnet = s => harOmr(s) || s.rest || (smBarn(s.id).length > 0 && smBarn(s.id).every(smTegnet));
// Sonetreet til Utkikksplan: fasen som er valgt for Utkikksplan, som stier («8302 - Kjeller / Vest / B1»).
window.smTre = () => {
  const M = smLast(), f = M.faser.find(x => x.utkikk) || M.faser[0];
  if (!f) return null;
  const ut = [], dfs = (s, d) => { ut.push({sti: smSti(s), forelder: s.forelder ? smSti(smSone(s.forelder)) : null, d}); smBarn(s.id).forEach(c => dfs(c, d + 1)); };
  smSonerI(f.id).filter(s => !s.forelder).forEach(s => dfs(s, 0));
  return ut;
};
// Endringer i navn eller plassering endrer stien; Utkikksplan får beskjed, så aktivitetene følger med.
function smEndre(fn) {
  const f = smFase(), for_ = f ? smKart(f.id) : new Map();
  fn();
  if (f && f.utkikk && typeof window.ukOmdoepSoner === 'function') {
    const etter = smKart(f.id), par = [];
    for_.forEach((sti, id) => { const ny = etter.get(id); if (ny && ny !== sti) par.push([sti, ny]); });
    if (par.length) window.ukOmdoepSoner(par);
  }
  smLagre(); renderSonemod();
}
// Er bare én underliggende sone igjen utegnet, fyller den resten av den overliggende.
function smFyllRest(forelderId) {
  const barn = forelderId ? smBarn(forelderId) : [];
  const igjen = barn.filter(c => !harOmr(c) && !c.rest && !smBarn(c.id).length);
  if (barn.length >= 2 && igjen.length === 1 && barn.filter(c => harOmr(c)).length === barn.length - 1) { igjen[0].rest = true; return igjen[0]; }
  return null;
}

// ----- visning (lik Aktivitetstillatelse) -----
function renderSonemod() {
  const M = smLast(), root = document.getElementById('sm-root'), f = smFase();
  const skyFeil = typeof CLOUD !== 'undefined' && CLOUD && (window.samlingFeil || {}).sonemod;
  smUi.fase = f.id;
  if (smUi.valgt && !smSone(smUi.valgt)) smUi.valgt = null;
  if (smUi.zoom && !smSone(smUi.zoom)) smUi.zoom = null;
  const soner = smSonerI(f.id), zoom = smUi.zoom && smSone(smUi.zoom), valgt = smUi.valgt && smSone(smUi.valgt);
  const omraader = zoom ? smBarn(zoom.id) : soner.filter(s => !s.forelder);
  const zoomForm = zoom ? smForm(zoom.id) : null;
  const box = zoom ? smUtsnitt(zoomForm) : [0, 0, MAP_W, MAP_H];
  const pst = ([x, y]) => [(x - box[0]) / box[2] * 100, (y - box[1]) / box[3] * 100];
  // Områdene: sonene på dette nivået med formen sin (utegnede vises ikke før de er tegnet). Den innzoomede sonen har tykk kant.
  const omrSvg = (zoom ? `<path d="${smFormSti(zoomForm)}" fill="none" stroke="#24292f" stroke-width="3" fill-rule="evenodd" vector-effect="non-scaling-stroke" style="pointer-events:none"/>` : '')
    + omraader.map(o => { const fo = smForm(o.id); if (smFormTom(fo)) return '';
      return `<path class="sm-poly${valgt && valgt.id === o.id ? ' valgt' : ''}" data-smsone="${o.id}" d="${smFormSti(fo)}" fill-rule="evenodd" vector-effect="non-scaling-stroke" style="fill:${o.farge};fill-opacity:${o.rest ? .12 : .3};stroke:${o.farge}${o.rest ? ';stroke-dasharray:6 4' : ''}"><title>${esc(smSti(o))}</title></path>`; }).join('');
  const t = smUi.tegn, pkt = box[2] / 180, tsone = t && smSone(t.id);
  const tegning = t ? `<polyline points="${t.pts.map(q => q.join(',')).join(' ')}${t.pts.length > 2 ? ' ' + t.pts[0].join(',') : ''}" fill="${tsone ? tsone.farge : '#1f6feb'}" fill-opacity=".25" stroke="${tsone ? tsone.farge : '#1f6feb'}" stroke-width="2.5" stroke-dasharray="8 5" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`
    + t.pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="${pkt}" fill="#fff" stroke="#24292f" stroke-width="2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`).join('') : '';
  // Navnelapper: tegnede soner på tekstplassen sin (kan dras), utegnede soner på tekstplassen hvis den er satt.
  const ikkeTegnet = omraader.filter(o => !smTegnet(o));
  const lapp = (o, x, y) => { const [px, py] = pst([x, y]), barn = smBarn(o.id).length;
    return `<div class="sm-lapp${smTegnet(o) ? '' : ' utegnet'}${valgt && valgt.id === o.id ? ' valgt' : ''}" data-smdrag="${o.id}" style="left:${px}%;top:${py}%;border-color:${o.farge}" title="${smTegnet(o) ? 'Trykk for å zoome inn · dra for å flytte teksten' : 'Ikke tegnet – dra teksten dit sonen skal være, og tegn omrisset'}">${esc(o.navn)}${o.rest ? ' <span class="sub">(resten)</span>' : ''}${smTegnet(o) ? (barn ? ' 🔍' : '') : ' ✏️'}</div>`; };
  const lapper = omraader.map(o => { const p = o.tekst || (smTegnet(o) ? smSentrum(smForm(o.id)) : null); return p ? lapp(o, p[0], p[1]) : ''; }).join('');
  const ventende = ikkeTegnet.filter(o => !o.tekst);
  const sti = []; let z = zoom, n = 0; while (z && n++ < 12) { sti.unshift(z); z = smSone(z.forelder); }
  const tre = [], dfs = (s, d) => { tre.push({s, d}); smBarn(s.id).forEach(c => dfs(c, d + 1)); };
  soner.filter(s => !s.forelder).forEach(s => dfs(s, 0));
  const rad = ({s, d}) => {
    const sym = harOmr(s) ? '<span class="sm-sym ok" title="Tegnet">✓</span>' : s.rest ? '<span class="sm-sym rest" title="Fyller resten av den overliggende sonen">◐</span>'
      : smBarn(s.id).length ? (smTegnet(s) ? '<span class="sm-sym ok" title="Området fra undersonene">✓</span>' : '<span class="sm-sym" title="Noen undersoner er ikke tegnet">…</span>') : '<span class="sm-sym mangler" title="Ikke tegnet">✏️</span>';
    return `<div class="sm-rad${valgt && valgt.id === s.id ? ' valgt' : ''}${zoom && zoom.id === s.id ? ' zoom' : ''}" data-smsone="${s.id}" style="padding-left:${6 + d * 18}px">
      <span class="sm-farge" style="background:${s.farge}"></span>
      <input type="text" class="sm-navn" data-smf="navn" data-id="${s.id}" value="${esc(s.navn)}" title="Navnet på sonen">${sym}
      ${s.merknad ? `<span class="sub">${esc(s.merknad)}</span>` : ''}
      <button class="link-btn sm-x" data-action="sm-slett" data-id="${s.id}" title="Slett sonen (undersonene flyttes opp)">✕</button></div>`;
  };
  const beh = valgt && smBeholder(valgt);
  root.innerHTML = `<div class="panel">
    <h2>Sonemodul <span class="readonly-tag">Brukes foreløpig av Utkikksplan og Aktivitetstillatelse</span></h2>
    ${skyFeil ? '<p class="sub warn"><b>Lagres ikke i skyen ennå:</b> databasereglene for Sonemodul er ikke publisert. Kopier firestore.rules fra GitHub og publiser i Firebase-konsollen (Firestore Database → Rules → Publish), og last siden på nytt. Til da lagres endringer bare i denne nettleseren.</p>' : ''}
    <p class="intro">Tegn de overliggende sonene først, og plasser så de underliggende inne i dem. Trykk på en sone for å zoome inn. Sonene som ikke er tegnet (✏️), står som lapper: dra teksten dit sonen skal være, og tegn omrisset. Er bare én underliggende sone igjen, fyller den resten (◐). Utomhus er resten av tomta, utenfor byggene.</p>
    <div class="toolbar">
      <label>Fase: <select id="sm-fase">${M.faser.map(x => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${esc(x.navn)}${x.utkikk ? ' (Utkikksplan)' : ''}</option>`).join('')}</select></label>
      <button class="btn" data-action="sm-fase-ny" title="Ny fase som kopi av denne">＋ Ny fase</button>
      <button class="btn" data-action="sm-fase-navn">✎ Gi nytt navn</button>
      ${f.utkikk ? '<span class="badge">Brukes i Utkikksplan</span>' : '<button class="btn" data-action="sm-fase-utkikk">Bruk denne i Utkikksplan</button>'}
      ${M.faser.length > 1 ? '<button class="btn danger" data-action="sm-fase-slett">Slett fase</button>' : ''}
      <button class="btn" data-action="sm-standard" title="Legg inn standardoppsettet på nytt (alle faser)">↺ Standardoppsett</button>
    </div>
  </div>
  <div class="sm-grid">
    <div class="panel sm-kart-panel">
      <div class="at2-sti"><button class="link-btn" data-action="sm-zoom" data-id="">Hele anlegget</button>${sti.map(x => ` › <button class="link-btn" data-action="sm-zoom" data-id="${x.id}">${esc(x.navn)}</button>`).join('')}</div>
      <div class="toolbar sm-verktoy">
        ${t ? `<b>Tegner «${esc(tsone ? tsone.navn : '')}»:</b> trykk for hjørnepunkter (${t.pts.length} satt). Dobbelttrykk eller Enter for ferdig.${t.beh ? ` Må ligge inne i «${esc(t.beh.sone.navn)}».` : ''}
          <button class="btn primary" data-action="sm-tegn-ferdig" ${t.pts.length < 3 ? 'disabled' : ''}>Ferdig</button><button class="btn" data-action="sm-tegn-angre" ${t.pts.length ? '' : 'disabled'}>Angre punkt</button><button class="btn" data-action="sm-tegn-avbryt">Avbryt</button>`
        : valgt ? `<b>${esc(valgt.navn)}</b>${valgt.rest ? ' <span class="sub">fyller resten</span>' : ''}
          <button class="btn primary" data-action="sm-tegn" data-id="${valgt.id}">✏️ ${harOmr(valgt) ? 'Tegn omrisset på nytt' : 'Tegn omriss'}</button>
          ${harOmr(valgt) || valgt.rest ? `<button class="btn" data-action="sm-fjern-omr">Fjern ${valgt.rest ? '«resten»' : 'omrisset'}</button>` : ''}
          ${!harOmr(valgt) && !valgt.rest && valgt.forelder ? '<button class="btn" data-action="sm-rest" title="Sonen blir det som er igjen av den overliggende sonen">◐ Fyll resten</button>' : ''}
          ${zoom ? '<button class="btn" data-action="sm-ny-under">＋ Undersone</button>' : ''}<button class="btn" data-action="sm-velg-ingen">Lukk</button>`
        : zoom ? `<b>${esc(zoom.navn)}</b>
          <button class="btn" data-action="sm-tegn" data-id="${zoom.id}">✏️ ${harOmr(zoom) ? 'Tegn omrisset på nytt' : 'Tegn omriss'}</button>
          <button class="btn" data-action="sm-ny-under">＋ Undersone</button>`
        : '<span class="sub">Trykk på en sone for å zoome inn, eller på en lapp for å tegne den.</span><button class="btn" data-action="sm-ny-under">＋ Ny sone øverst</button>'}
        <label class="sv-switch" title="Fest punktene til den overliggende sonen, nabosonene og aksene"><input type="checkbox" id="sm-fest" ${smUi.fest ? 'checked' : ''}><span class="sl"></span>Fest til soner og akser</label>
      </div>
      ${ventende.length ? `<div class="sm-ventende"><b>Ønskes tegnet:</b> ${ventende.map(o => `<span class="sm-lapp utegnet fri${valgt && valgt.id === o.id ? ' valgt' : ''}" data-smdrag="${o.id}" style="border-color:${o.farge}" title="Dra inn på kartet dit sonen skal være">${esc(o.navn)} ✏️</span>`).join(' ')}</div>` : ''}
      <div class="sm-kart${t ? ' tegner' : ''}" data-box="${box.join(',')}" style="aspect-ratio:${box[2]} / ${box[3]};max-width:calc(640px * ${box[2] / box[3]})">${smGrunnSvg(box)}<svg class="sm-overlay" viewBox="${box.join(' ')}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${omrSvg}${tegning}</svg>${lapper}</div>
      ${beh && !t ? `<p class="sub">«${esc(valgt.navn)}» må ligge inne i «${esc(beh.sone.navn)}».</p>` : ''}
    </div>
    <div class="panel sm-tre-panel">
      <h3>Soneinndeling</h3>
      <div class="sm-tre">${tre.map(rad).join('') || '<p class="sub">Ingen soner ennå.</p>'}</div>
      <p class="sub">✓ tegnet · ✏️ ikke tegnet · ◐ fyller resten av den overliggende · … noen undersoner mangler. Trykk på en sone for å gå til den. Endrer du navn, følger aktivitetene i Utkikksplan med.</p>
    </div>
  </div>`;
}

// ----- handlinger -----
function smNySone(navn, forelder) {
  const f = smFase(), M = smLast(), soner = smSonerI(f.id);
  const s = {id: 's' + uid(), type: 'sone', fase: f.id, navn, forelder: forelder || null, pts: null, rest: false, farge: SM_FARGER[soner.length % SM_FARGER.length], rekkefolge: Math.max(0, ...M.soner.map(x => x.rekkefolge || 0)) + 1, merknad: ''};
  M.soner.push(s);
  return s;
}
function smTegnStart(s) { smUi.valgt = s.id; smUi.tegn = {id: s.id, pts: [], beh: smBeholder(s)}; renderSonemod(); }
function smTegnFerdig() {
  const t = smUi.tegn, s = t && smSone(t.id);
  if (!s || t.pts.length < 3) return;
  if (!smInnenfor(t.pts, t.beh)) { showToast(`Omrisset må ligge inne i «${t.beh.sone.navn}». Juster punktene (Angre punkt), eller slå av festing og prøv igjen.`); return; }
  smUi.tegn = null;
  let rest = null;
  smEndre(() => { s.pts = t.pts.map(([x, y]) => [Math.round(x), Math.round(y)]); s.rest = false; rest = smFyllRest(s.forelder); });
  if (rest) showToast(`«${rest.navn}» fyller resten av «${(smSone(rest.forelder) || {}).navn}».`);
  if (typeof logg === 'function') logg('Sonemodul: tegnet omriss', '', `${smSti(s)} (${smFase().navn})`);
}
function smAction(action, btn) {
  if (!isSys()) return;
  const M = smLast(), f = smFase(), valgt = smUi.valgt && smSone(smUi.valgt);
  if (action === 'sm-velg-ingen') { smUi.valgt = null; renderSonemod(); return; }
  if (action === 'sm-zoom') { if (smUi.tegn) return; const s = btn.dataset.id && smSone(btn.dataset.id); smUi.zoom = s ? s.id : null; smUi.valgt = null; renderSonemod(); return; }
  if (action === 'sm-tegn') { const s = smSone(btn.dataset.id); if (s) smTegnStart(s); return; }
  if (action === 'sm-tegn-angre') { if (smUi.tegn) smUi.tegn.pts.pop(); renderSonemod(); return; }
  if (action === 'sm-tegn-avbryt') { smUi.tegn = null; renderSonemod(); return; }
  if (action === 'sm-tegn-ferdig') { smTegnFerdig(); return; }
  if (action === 'sm-fjern-omr' && valgt) { if (!confirm(`Fjerne ${valgt.rest ? '«resten»' : 'omrisset'} til «${valgt.navn}»?`)) return; smEndre(() => { valgt.pts = null; valgt.rest = false; }); return; }
  if (action === 'sm-rest' && valgt) { smEndre(() => { valgt.rest = true; }); return; }
  if (action === 'sm-ny-under') {
    const forelder = smUi.zoom && smSone(smUi.zoom);
    const navn = (prompt(forelder ? `Navn på den nye undersonen i «${forelder.navn}»:` : 'Navn på den nye sonen:') || '').trim();
    if (!navn) return;
    smEndre(() => { const s = smNySone(navn, forelder ? forelder.id : null); smUi.valgt = s.id; });
    if (typeof logg === 'function') logg('Sonemodul: ny sone', '', `${navn} (${f.navn})`);
    return;
  }
  if (action === 'sm-slett') {
    const s = smSone(btn.dataset.id); if (!s) return;
    if (!confirm(`Slette sonen «${smSti(s)}»?${smBarn(s.id).length ? ' Undersonene flyttes opp ett nivå.' : ''}`)) return;
    smEndre(() => { smBarn(s.id).forEach(c => { c.forelder = s.forelder; }); M.soner = M.soner.filter(x => x !== s); });
    if (typeof logg === 'function') logg('Sonemodul: slettet sone', '', `${s.navn} (${f.navn})`);
    return;
  }
  if (action === 'sm-standard') {
    if (!confirm('Legge inn standardoppsettet på nytt? Alle faser og soner i Sonemodul erstattes.')) return;
    SM = smStandard(); smUi.fase = null; smUi.valgt = null; smUi.zoom = null; smLagre(); renderSonemod(); return;
  }
  if (action === 'sm-fase-ny') {
    const navn = (prompt('Navn på den nye fasen (soneinndelingen kopieres fra denne):', f.navn + ' (kopi)') || '').trim();
    if (!navn) return;
    const nf = {id: 'f' + uid(), type: 'fase', navn, utkikk: false, rekkefolge: M.faser.length, geo: SM_GEO};
    const idMap = new Map(smSonerI(f.id).map(s => [s.id, 's' + uid()]));
    smSonerI(f.id).forEach(s => M.soner.push({...JSON.parse(JSON.stringify(s)), id: idMap.get(s.id), fase: nf.id, forelder: s.forelder ? idMap.get(s.forelder) : null}));
    M.faser.push(nf); smUi.fase = nf.id; smUi.valgt = null; smUi.zoom = null;
    smLagre(); renderSonemod(); return;
  }
  if (action === 'sm-fase-navn') { const navn = (prompt('Nytt navn på fasen:', f.navn) || '').trim(); if (navn) { f.navn = navn; smLagre(); renderSonemod(); } return; }
  if (action === 'sm-fase-utkikk') {
    M.faser.forEach(x => { x.utkikk = x === f; });
    smLagre(); renderSonemod();
    showToast(`Utkikksplan og Aktivitetstillatelse bruker nå sonene i «${f.navn}». Aktiviteter i soner som ikke finnes her, vises som egne rader.`);
    return;
  }
  if (action === 'sm-fase-slett') {
    if (f.utkikk) { alert('Fasen brukes i Utkikksplan. Velg en annen fase for Utkikksplan først.'); return; }
    if (!confirm(`Slette fasen «${f.navn}» med alle sonene?`)) return;
    M.soner = M.soner.filter(s => s.fase !== f.id); M.faser = M.faser.filter(x => x !== f); smUi.fase = null; smUi.valgt = null; smUi.zoom = null;
    smLagre(); renderSonemod();
  }
}

// Kartet: under tegning settes hjørnepunkter; ellers zoomer et trykk på en sone inn på den.
const smKartPunkt = (kart, e) => { const [bx, by, bw, bh] = kart.dataset.box.split(',').map(Number), r = kart.getBoundingClientRect(); return [bx + (e.clientX - r.left) / r.width * bw, by + (e.clientY - r.top) / r.height * bh]; };
let smDrag = null, smDragSlutt = 0;
function smVelg(s) {
  // Tegnet: zoom inn. Ikke tegnet: velg den, så omrissverktøyet kommer fram.
  if (smTegnet(s) && (harOmr(s) || smBarn(s.id).length || s.rest)) { smUi.zoom = s.id; smUi.valgt = null; }
  else smUi.valgt = s.id;
  renderSonemod();
}
document.addEventListener('click', e => {
  if (!smPa() || Date.now() - smDragSlutt < 300) return;
  const kart = e.target.closest && e.target.closest('#sm-root .sm-kart');
  if (kart && smUi.tegn) { const bw = +kart.dataset.box.split(',')[2]; smUi.tegn.pts.push(smFest(smKartPunkt(kart, e), bw / 90, smSone(smUi.tegn.id))); renderSonemod(); return; }
  const l = e.target.closest && e.target.closest('#sm-root [data-smdrag]');
  if (l) { const s = smSone(l.dataset.smdrag); if (s) smVelg(s); return; }
  const p = e.target.closest && e.target.closest('#sm-root .sm-poly');
  if (p) { const s = smSone(p.dataset.smsone); if (s) smVelg(s); return; }
  const r = e.target.closest('#sm-root .sm-rad');
  if (r && !e.target.closest('input, select, button')) {
    // Fra soneinndelingen: gå til sonen (zoom til den, eller til den overliggende og velg den når den ikke er tegnet).
    const s = smSone(r.dataset.smsone); if (!s) return;
    if (smTegnet(s) && (harOmr(s) || s.rest || smBarn(s.id).length)) { smUi.zoom = s.id; smUi.valgt = null; } else { smUi.zoom = s.forelder || null; smUi.valgt = s.id; }
    renderSonemod();
  }
});
document.addEventListener('dblclick', e => { if (smPa() && smUi.tegn && e.target.closest && e.target.closest('#sm-root .sm-kart')) { smUi.tegn.pts.pop(); smTegnFerdig(); } });
document.addEventListener('keydown', e => {
  if (!smPa() || !smUi.tegn) return;
  if (e.key === 'Enter') { e.preventDefault(); smTegnFerdig(); }
  else if (e.key === 'Escape') { smUi.tegn = null; renderSonemod(); }
  else if (e.key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); smUi.tegn.pts.pop(); renderSonemod(); }
});
// Dra en sonelapp dit teksten skal stå; en utegnet sone blir valgt, så omrissverktøyet kommer fram.
document.addEventListener('pointerdown', e => {
  if (!smPa() || smUi.tegn || e.button > 0) return;
  const el = e.target.closest && e.target.closest('#sm-root [data-smdrag]');
  if (!el) return;
  smDrag = {id: el.dataset.smdrag, el, x0: e.clientX, y0: e.clientY, moved: false, spokelse: null};
});
document.addEventListener('pointermove', e => {
  const d = smDrag; if (!d) return;
  if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 6) return;
  if (!d.moved) { d.moved = true; d.spokelse = d.el.cloneNode(true); d.spokelse.className = 'sm-lapp sm-spokelse'; document.body.appendChild(d.spokelse); document.body.classList.add('at2-drar'); }
  d.spokelse.style.left = e.clientX + 'px'; d.spokelse.style.top = e.clientY + 'px';
});
document.addEventListener('pointerup', e => {
  const d = smDrag; if (!d) return;
  smDrag = null;
  if (!d.moved) return;
  smDragSlutt = Date.now();
  d.spokelse.remove(); document.body.classList.remove('at2-drar');
  const kart = document.querySelector('#sm-root .sm-kart'), r = kart && kart.getBoundingClientRect(), s = smSone(d.id);
  if (!s || !r || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
  const pos = smKartPunkt(kart, e), beh = smBeholder(s);
  if (beh && !smFormInne(beh.form, pos[0], pos[1])) { showToast(`Teksten må stå inne i «${beh.sone.navn}».`); return; }
  s.tekst = [Math.round(pos[0]), Math.round(pos[1])];
  if (!smTegnet(s)) smUi.valgt = s.id;
  smLagre(); renderSonemod();
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!smPa() || !el.closest || !el.closest('#sm-root')) return;
  if (el.id === 'sm-fase') { smUi.fase = el.value; smUi.valgt = null; smUi.zoom = null; smUi.tegn = null; renderSonemod(); return; }
  if (el.id === 'sm-fest') { smUi.fest = el.checked; return; }
  const s = smSone(el.dataset.id);
  if (!s || !isSys()) return;
  if (el.dataset.smf === 'navn') { const v = el.value.trim(); if (!v || v === s.navn) { el.value = s.navn; return; } smEndre(() => { s.navn = v; }); }
});
