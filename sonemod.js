// ---------- Sonemodul (fanen «Sonemodul», foreløpig kun systemadministrator) ----------
// Den logiske oppbyggingen av soner, i et tre per fase (f.eks. «Grunn og betong» og «Innvendige arbeider»): fra overliggende
// soner (bygg) til finere inndeling. Hver sone tegnes som et omriss på kartet fra AT-koordinering. En underliggende sone ligger
// alltid helt inne i én overliggende sone (den er en finere inndeling av den, og krysser ikke over i en annen).
// En sone uten eget omriss (f.eks. «Vest») får området sitt fra undersonene.
// Foreløpig brukes Sonemodul bare av Utkikksplan og Aktivitetstillatelse; resten av appen påvirkes ikke.
// Lagring: ett dokument per fase og per sone i samlingen «sonemod» (se lagSynk i utkikk.js).
const SM_KEY = 'wrk2_sonemod', SM_GEO = 2;   // SM_GEO: versjon av soneformatet (2 = tegnede omriss)
const SM_FARGER = ['#2da44e', '#1f6feb', '#bf3989', '#d4a72c', '#8250df', '#cf222e', '#0e7c86', '#fb8500', '#57606a', '#1a7f37', '#953800', '#0969da'];
let SM = null;
const smSynk = lagSynk(['sonemod']);
const smUi = {fase: null, valgt: null, zoom: null, tegn: null};

// ----- geometri -----
function smInne(x, y, pts) {
  let inne = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}
function smAvstandKant(x, y, pts) {
  let min = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
    const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l)) : 0;
    min = Math.min(min, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return min;
}
const smInneTol = (x, y, pts, tol = 2) => smInne(x, y, pts) || smAvstandKant(x, y, pts) <= tol;
// Området til en sone: eget omriss, ellers omrissene til undersonene.
const smGeom = id => { const s = smSone(id); if (!s) return []; return s.pts && s.pts.length > 2 ? [s.pts] : smBarn(id).flatMap(c => smGeom(c.id)); };
function smBbox(polys) {
  const xs = polys.flat().map(p => p[0]), ys = polys.flat().map(p => p[1]);
  return xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
}
const smAreal = pts => Math.abs(pts.reduce((n, [x, y], i) => { const [x2, y2] = pts[(i + 1) % pts.length]; return n + x * y2 - x2 * y; }, 0)) / 2;
// Punkter på et rutenett inne i områdene (brukes til dekning og til å finne et punkt inne i sonen).
function smProver(polys, steg) {
  const b = smBbox(polys); if (!b) return [];
  const ut = [];
  for (let x = b[0] + steg / 2; x < b[2]; x += steg) for (let y = b[1] + steg / 2; y < b[3]; y += steg) if (polys.some(p => smInne(x, y, p))) ut.push([x, y]);
  return ut;
}
// Et punkt midt i området (tyngdepunktet til det største omrisset, eller nærmeste punkt inne i det).
function smSentrum(polys) {
  if (!polys.length) return null;
  const p = [...polys].sort((a, b) => smAreal(b) - smAreal(a))[0];
  let a = 0, cx = 0, cy = 0;
  p.forEach(([x, y], i) => { const [x2, y2] = p[(i + 1) % p.length], f = x * y2 - x2 * y; a += f; cx += (x + x2) * f; cy += (y + y2) * f; });
  const c = a ? [cx / (3 * a), cy / (3 * a)] : p[0];
  if (smInne(c[0], c[1], p)) return c;
  const b = smBbox([p]), pr = smProver([p], Math.max(4, (b[2] - b[0]) / 30));
  return pr.sort((u, v) => Math.hypot(u[0] - c[0], u[1] - c[1]) - Math.hypot(v[0] - c[0], v[1] - c[1]))[0] || c;
}
// Omrisset en underliggende sone må holde seg innenfor: nærmeste overliggende sone med eget omriss.
function smBeholder(s) { let f = s && smSone(s.forelder), n = 0; while (f && n++ < 12) { if (f.pts && f.pts.length > 2) return f; f = smSone(f.forelder); } return null; }
function smInnenfor(pts, beholder) {
  if (!beholder) return true;
  const B = beholder.pts, mid = pts.map((p, i) => { const q = pts[(i + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  return [...pts, ...mid].every(([x, y]) => smInneTol(x, y, B, 3));
}
// Festepunkter: aksene og hjørnene til de andre sonene og byggene.
function smFest([x, y], tol) {
  const f = smFase(), hj = [...ZONES.flatMap(z => z.pts), ...(f ? smSonerI(f.id).flatMap(s => s.pts || []) : [])];
  const nar = hj.filter(([a, b]) => Math.hypot(a - x, b - y) <= tol).sort((p, q) => Math.hypot(p[0] - x, p[1] - y) - Math.hypot(q[0] - x, q[1] - y))[0];
  if (nar) return [nar[0], nar[1]];
  const xs = [...AX_TOP, ...AX_S].map(a => a[1]).concat(hj.map(p => p[0])), ys = [...AX_ROWS, ...AX_ROWS_R].map(a => a[1]).concat(hj.map(p => p[1]));
  const n = (v, l) => { const b = l.reduce((m, w) => Math.abs(w - v) < Math.abs(m - v) ? w : m, Infinity); return Math.abs(b - v) <= tol ? b : Math.round(v); };
  return [n(x, xs), n(y, ys)];
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
// Utsnitt rundt et område, med luft rundt og ikke smalere enn 4:3.
function smUtsnitt(polys) {
  const b = polys && polys.length ? smBbox(polys) : null;
  if (!b) return [0, 0, MAP_W, MAP_H];
  const pad = Math.max(30, (b[2] - b[0]) * .08);
  const box = [b[0] - pad, b[1] - pad, b[2] - b[0] + 2 * pad, b[3] - b[1] + 2 * pad];
  if (box[2] / box[3] < 4 / 3) { const w = box[3] * 4 / 3; box[0] -= (w - box[2]) / 2; box[2] = w; }
  return box;
}

// ----- standardoppsett: byggene fra kartet, og kjelleren delt opp for to faser (etter sonetegningene for U.etg) -----
const SM_KJELLER = [[228, 113], [708, 113], [760, 165], [850, 165], [850, 345], [890, 345], [890, 540], [550, 540], [550, 345], [543, 345], [543, 165], [228, 165]];
const smR = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
function smStandard() {
  const faser = [], soner = [];
  const slug = t => t.toLowerCase().replace(/[^a-z0-9æøå]+/g, '-').replace(/^-|-$/g, '');
  const lagFase = (kode, navn, utkikk, kjellerdeler) => {
    const fase = {id: 'f-' + kode, type: 'fase', navn, utkikk, rekkefolge: faser.length, geo: SM_GEO};
    faser.push(fase);
    let n = 0;
    const ny = (navn, forelder, pts = null, merknad = '') => { const s = {id: 's-' + kode + '-' + (forelder ? forelder.id.split('-').slice(2).join('-') + '-' : '') + slug(navn), type: 'sone', fase: fase.id, navn, forelder: forelder ? forelder.id : null, pts, farge: SM_FARGER[n % SM_FARGER.length], rekkefolge: n++, merknad}; soner.push(s); return s; };
    const z = navn => (ZONES.find(q => q.navn === navn) || {}).pts;
    ny('8300 - Utomhus', null, null, 'Resten av tomten');
    ny('8301 - Ovnshall', null, z('8301 - Ovnshall'));
    const kjeller = ny('8302 - Kjeller', null, SM_KJELLER, 'Kjeller / U1-nivå');
    kjellerdeler(ny, kjeller);
    // Utvendig: Rampe er RA/RB fra F1 til F10; resten av innkjøringen er «Uteplass kjeller».
    const inn = ny('Kjellerinnkjøring', kjeller, [[228, 113], [708, 113], [760, 165], [228, 165]]);
    ny('Rampe', inn, smR(228, 113, 545, 165), 'RA/RB, F1–F10');
    ny('Uteplass kjeller', inn, [[545, 113], [708, 113], [760, 165], [545, 165]]);
    ['8302 - Trådhall', '8302 - Kontrollsenter', '8303 - Driftssenter', '8304 - Lagerhall', 'Pallelager'].forEach(q => ny(q, null, z(q)));
  };
  // Grunn og betong: B1–B4 og OpCB. Vest = B1 + B3 og Øst = B2 + B4 (aktivitetene i planen ligger i Vest/Øst).
  lagFase('gb', 'Grunn og betong', true, (ny, kj) => {
    const vest = ny('Vest', kj), ost = ny('Øst', kj);
    ny('B1', vest, [[543, 165], [609, 165], [609, 345], [715, 345], [715, 420], [550, 420], [550, 345], [543, 345]]);
    ny('B3', vest, smR(550, 420, 715, 540));
    ny('B2', ost, smR(715, 345, 890, 420));
    ny('B4', ost, smR(715, 420, 890, 540));
    ny('OpCB', kj, smR(743, 165, 850, 345), 'Tilhører 8303 Driftssenter, ligger i kjeller (U1)');
  });
  // Innvendige arbeider: B-3.1 til B-3.13.
  lagFase('ia', 'Innvendige arbeider', false, (ny, kj) => {
    ny('B-3.1', kj, smR(543, 165, 576, 212));
    ny('B-3.2', kj, smR(576, 165, 606, 212));
    ny('B-3.3', kj, smR(543, 212, 606, 345));
    ny('B-3.4', kj, smR(613, 345, 646, 401));
    ny('B-3.5', kj, [[550, 345], [613, 345], [613, 401], [646, 401], [646, 345], [704, 345], [704, 437], [550, 437]]);
    ny('B-3.6', kj, smR(550, 437, 704, 540));
    ny('B-3.7', kj, [[704, 385], [800, 385], [800, 345], [890, 345], [890, 540], [704, 540]]);
    ny('B-3.8', kj, smR(704, 345, 800, 385));
    ny('B-3.9', kj, smR(742, 315, 771, 345));
    ny('B-3.10', kj, smR(771, 315, 800, 345));
    ny('B-3.11', kj, smR(742, 184, 771, 315));
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
// Soner i det gamle formatet (ruter mellom aksene) erstattes av standardoppsettet med tegnede omriss.
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
  // Første gang i skyen (eller gammelt format): legg inn standardoppsettet.
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

// ----- visning -----
function renderSonemod() {
  const M = smLast(), root = document.getElementById('sm-root'), f = smFase();
  const skyFeil = typeof CLOUD !== 'undefined' && CLOUD && (window.samlingFeil || {}).sonemod;
  smUi.fase = f.id;
  if (smUi.valgt && !smSone(smUi.valgt)) smUi.valgt = null;
  if (smUi.zoom && !smSone(smUi.zoom)) smUi.zoom = null;
  const soner = smSonerI(f.id), valgt = smUi.valgt && smSone(smUi.valgt), zoom = smUi.zoom && smSone(smUi.zoom);
  const box = zoom ? smUtsnitt(smGeom(zoom.id)) : [0, 0, MAP_W, MAP_H];
  // Sonene med eget omriss tegnes; de dypeste øverst. Innzoomet vises sonen og alt under den.
  const omfang = zoom ? smUnder(zoom.id) : soner.map(s => s.id);
  const dybde = s => { let d = 0, x = s; while (x && x.forelder && d < 12) { d++; x = smSone(x.forelder); } return d; };
  const tegnes = omfang.map(smSone).filter(s => s && s.pts && s.pts.length > 2).sort((a, b) => dybde(a) - dybde(b));
  const iValgt = new Set(valgt ? smUnder(valgt.id) : []);
  const poly = s => `<polygon class="sm-poly${valgt && valgt.id === s.id ? ' valgt' : iValgt.has(s.id) ? ' under' : ''}" data-smsone="${s.id}" points="${s.pts.map(q => q.join(',')).join(' ')}" style="fill:${s.farge};fill-opacity:${smBarn(s.id).length ? .08 : .3};stroke:${s.farge}" vector-effect="non-scaling-stroke"><title>${esc(smSti(s))}</title></polygon>`;
  const fs = box[2] / 75;
  const etiketter = tegnes.filter(s => !smUnder(s.id).slice(1).some(id => (smSone(id).pts || []).length > 2)).map(s => { const c = smSentrum([s.pts]); return c ? `<text x="${c[0]}" y="${c[1] + fs * .35}" text-anchor="middle" class="sm-etikett" font-size="${fs}" stroke-width="${fs * .25}" fill="${s.farge}">${esc(s.navn)}</text>` : ''; }).join('');
  const t = smUi.tegn, pkt = box[2] / 180;
  const tegning = t ? `<polyline points="${t.pts.map(q => q.join(',')).join(' ')}${t.pts.length > 2 ? ' ' + t.pts[0].join(',') : ''}" fill="#1f6feb" fill-opacity=".18" stroke="#1f6feb" stroke-width="2" stroke-dasharray="8 5" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`
    + t.pts.map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="${pkt}" fill="#fff" stroke="#1f6feb" stroke-width="2" vector-effect="non-scaling-stroke" style="pointer-events:none"/>`).join('')
    + (t.beholder ? `<polygon points="${t.beholder.pts.map(q => q.join(',')).join(' ')}" fill="none" stroke="#cf222e" stroke-width="2" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" style="pointer-events:none"/>` : '') : '';
  const overlay = `<svg class="sm-overlay" viewBox="${box.join(' ')}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${tegnes.map(poly).join('')}${etiketter}${tegning}</svg>`;
  const tre = [], dfs = (s, d) => { tre.push({s, d}); smBarn(s.id).forEach(c => dfs(c, d + 1)); };
  soner.filter(s => !s.forelder).forEach(s => dfs(s, 0));
  const kanVaereForelder = (s, kand) => kand.id !== s.id && !smUnder(s.id).includes(kand.id);
  const rad = ({s, d}) => {
    const barn = smBarn(s.id), harOmr = s.pts && s.pts.length > 2;
    return `<div class="sm-rad${valgt && valgt.id === s.id ? ' valgt' : ''}" data-smsone="${s.id}" style="padding-left:${6 + d * 18}px">
      <span class="sm-farge" style="background:${s.farge}"></span>
      <input type="text" class="sm-navn" data-smf="navn" data-id="${s.id}" value="${esc(s.navn)}" title="Navnet på sonen">
      <span class="sub">${barn.length ? `${barn.length} under` : 'finsone'} · ${harOmr ? 'omriss tegnet' : barn.length ? 'området fra undersonene' : '<span class="warn">ikke tegnet</span>'}${s.merknad ? ' · ' + esc(s.merknad) : ''}</span>
      <select data-smf="forelder" data-id="${s.id}" title="Overliggende sone"><option value="">(øverst)</option>${soner.filter(k => kanVaereForelder(s, k)).map(k => `<option value="${k.id}" ${s.forelder === k.id ? 'selected' : ''}>${esc(smSti(k))}</option>`).join('')}</select>
      <button class="link-btn" data-action="sm-slett" data-id="${s.id}" title="Slett sonen (undersonene flyttes opp)">✕</button></div>`;
  };
  const sti = []; let z = zoom, n = 0; while (z && n++ < 12) { sti.unshift(z); z = smSone(z.forelder); }
  root.innerHTML = `<div class="panel">
    <h2>Sonemodul <span class="readonly-tag">Brukes foreløpig av Utkikksplan og Aktivitetstillatelse</span></h2>
    ${skyFeil ? '<p class="sub warn"><b>Lagres ikke i skyen ennå:</b> databasereglene for Sonemodul er ikke publisert. Kopier firestore.rules fra GitHub og publiser i Firebase-konsollen (Firestore Database → Rules → Publish), og last siden på nytt. Til da lagres endringer bare i denne nettleseren.</p>' : ''}
    <p class="intro">Bygg opp sonene lag for lag, per fase: velg en sone og <b>tegn omrisset</b> på kartet (punktene festes til aksene og hjørnene). En underliggende sone må ligge helt inne i den overliggende – den er en finere inndeling av den. Trykk på en sone med undersoner for å zoome inn. Fasen som er valgt for Utkikksplan, styrer sonene der og i Aktivitetstillatelse.</p>
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
      <div class="toolbar">
        ${t ? `<b>Tegner «${esc((smSone(t.id) || {}).navn || '')}»:</b> trykk for hjørnepunkter (${t.pts.length} satt). Dobbelttrykk eller Enter for ferdig.${t.beholder ? ` Må ligge inne i «${esc(t.beholder.navn)}» (rød stiplet).` : ''}
          <button class="btn primary" data-action="sm-tegn-ferdig" ${t.pts.length < 3 ? 'disabled' : ''}>Ferdig</button><button class="btn" data-action="sm-tegn-angre" ${t.pts.length ? '' : 'disabled'}>Angre punkt</button><button class="btn" data-action="sm-tegn-avbryt">Avbryt</button>`
        : valgt ? `<b>${esc(smSti(valgt))}</b>
          <button class="btn primary" data-action="sm-tegn">✏️ ${valgt.pts && valgt.pts.length > 2 ? 'Tegn omrisset på nytt' : 'Tegn omriss'}</button>
          <button class="btn" data-action="sm-ny-under">＋ Undersone</button>
          ${smBarn(valgt.id).length || (valgt.pts && valgt.pts.length > 2) ? `<button class="btn" data-action="sm-zoom" data-id="${valgt.id}">🔍 Zoom hit</button>` : ''}
          ${valgt.pts && valgt.pts.length > 2 ? '<button class="btn" data-action="sm-fjern-omr">Fjern omrisset</button>' : ''}`
        : '<span class="sub">Velg en sone på kartet eller i lista.</span>'}
      </div>
      <div class="sm-kart${t ? ' tegner' : ''}" data-box="${box.join(',')}" style="aspect-ratio:${box[2]} / ${box[3]};max-width:calc(640px * ${box[2] / box[3]})">${smGrunnSvg(box)}${overlay}</div>
    </div>
    <div class="panel sm-tre-panel">
      <h3>Soner i «${esc(f.navn)}»</h3>
      <div class="toolbar"><button class="btn" data-action="sm-ny-grov">＋ Ny sone øverst</button>${valgt ? `<button class="btn" data-action="sm-velg-ingen">Fjern valg</button>` : ''}</div>
      <div class="sm-tre">${tre.map(rad).join('') || '<p class="sub">Ingen soner ennå.</p>'}</div>
      <p class="sub">Velg overliggende sone i lista på raden. Endrer du navn eller plassering, følger aktivitetene i Utkikksplan med.</p>
    </div>
  </div>`;
}

// ----- handlinger -----
function smNySone(navn, forelder) {
  const f = smFase(), M = smLast(), soner = smSonerI(f.id);
  const s = {id: 's' + uid(), type: 'sone', fase: f.id, navn, forelder: forelder || null, pts: null, farge: SM_FARGER[soner.length % SM_FARGER.length], rekkefolge: Math.max(0, ...M.soner.map(x => x.rekkefolge || 0)) + 1, merknad: ''};
  M.soner.push(s);
  return s;
}
function smTegnStart(s) { smUi.tegn = {id: s.id, pts: [], beholder: smBeholder(s)}; renderSonemod(); }
function smTegnFerdig() {
  const t = smUi.tegn, s = t && smSone(t.id);
  if (!s || t.pts.length < 3) return;
  if (!smInnenfor(t.pts, t.beholder)) { showToast(`Omrisset må ligge helt inne i «${t.beholder.navn}». Juster punktene (Angre punkt) og prøv igjen.`); return; }
  smUi.tegn = null;
  smEndre(() => { s.pts = t.pts.map(([x, y]) => [Math.round(x), Math.round(y)]); });
  if (typeof logg === 'function') logg('Sonemodul: tegnet omriss', '', `${smSti(s)} (${smFase().navn})`);
}
function smAction(action, btn) {
  if (!isSys()) return;
  const M = smLast(), f = smFase(), valgt = smUi.valgt && smSone(smUi.valgt);
  if (action === 'sm-velg-ingen') { smUi.valgt = null; renderSonemod(); return; }
  if (action === 'sm-zoom') { if (smUi.tegn) return; const s = btn.dataset.id && smSone(btn.dataset.id); smUi.zoom = s ? s.id : null; renderSonemod(); return; }
  if (action === 'sm-tegn' && valgt) { smTegnStart(valgt); return; }
  if (action === 'sm-tegn-angre') { if (smUi.tegn) smUi.tegn.pts.pop(); renderSonemod(); return; }
  if (action === 'sm-tegn-avbryt') { smUi.tegn = null; renderSonemod(); return; }
  if (action === 'sm-tegn-ferdig') { smTegnFerdig(); return; }
  if (action === 'sm-fjern-omr' && valgt) { if (!confirm(`Fjerne omrisset til «${valgt.navn}»?`)) return; smEndre(() => { valgt.pts = null; }); return; }
  if (action === 'sm-ny-under' && valgt) {
    const navn = (prompt(`Navn på den nye undersonen i «${valgt.navn}»:`) || '').trim();
    if (!navn) return;
    let s; smEndre(() => { s = smNySone(navn, valgt.id); smUi.valgt = s.id; if (valgt.pts && valgt.pts.length > 2 && !smUi.zoom) smUi.zoom = valgt.id; });
    smTegnStart(s);
    if (typeof logg === 'function') logg('Sonemodul: ny sone', '', `${smSti(s)} (${f.navn})`);
    return;
  }
  if (action === 'sm-ny-grov') {
    const navn = (prompt('Navn på den nye sonen:') || '').trim();
    if (!navn) return;
    smEndre(() => { const s = smNySone(navn, null); smUi.valgt = s.id; });
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
    const navn = (prompt('Navn på den nye fasen (sonetreet kopieres fra denne):', f.navn + ' (kopi)') || '').trim();
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

// Kartet: under tegning settes hjørnepunkter (festet til akser og hjørner); ellers velges sonen, og et nytt trykk zoomer inn.
const smKartPunkt = (kart, e) => { const [bx, by, bw, bh] = kart.dataset.box.split(',').map(Number), r = kart.getBoundingClientRect(); return [bx + (e.clientX - r.left) / r.width * bw, by + (e.clientY - r.top) / r.height * bh]; };
document.addEventListener('click', e => {
  if (!smPa()) return;
  const kart = e.target.closest && e.target.closest('#sm-root .sm-kart');
  if (kart && smUi.tegn) { const bw = +kart.dataset.box.split(',')[2]; smUi.tegn.pts.push(smFest(smKartPunkt(kart, e), bw / 90)); renderSonemod(); return; }
  const p = e.target.closest && e.target.closest('#sm-root .sm-poly');
  if (p) {
    const s = smSone(p.dataset.smsone);
    if (s && smUi.valgt === s.id && smBarn(s.id).length && smUi.zoom !== s.id) smUi.zoom = s.id; else smUi.valgt = s ? s.id : null;
    renderSonemod(); return;
  }
  const r = e.target.closest('#sm-root .sm-rad');
  if (r && !e.target.closest('input, select, button')) { smUi.valgt = smUi.valgt === r.dataset.smsone ? null : r.dataset.smsone; renderSonemod(); }
});
document.addEventListener('dblclick', e => { if (smPa() && smUi.tegn && e.target.closest && e.target.closest('#sm-root .sm-kart')) { smUi.tegn.pts.pop(); smTegnFerdig(); } });
document.addEventListener('keydown', e => {
  if (!smPa() || !smUi.tegn) return;
  if (e.key === 'Enter') { e.preventDefault(); smTegnFerdig(); }
  else if (e.key === 'Escape') { smUi.tegn = null; renderSonemod(); }
  else if (e.key === 'Backspace' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); smUi.tegn.pts.pop(); renderSonemod(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!smPa() || !el.closest || !el.closest('#sm-root')) return;
  if (el.id === 'sm-fase') { smUi.fase = el.value; smUi.valgt = null; smUi.zoom = null; smUi.tegn = null; renderSonemod(); return; }
  const s = smSone(el.dataset.id);
  if (!s || !isSys()) return;
  if (el.dataset.smf === 'navn') { const v = el.value.trim(); if (!v || v === s.navn) { el.value = s.navn; return; } smEndre(() => { s.navn = v; }); }
  else if (el.dataset.smf === 'forelder') {
    // En sone med omriss kan bare flyttes til en overliggende sone den ligger inne i.
    const ny = el.value || null, beh = ny ? (smSone(ny).pts && smSone(ny).pts.length > 2 ? smSone(ny) : smBeholder(smSone(ny))) : null;
    if (s.pts && s.pts.length > 2 && beh && !smInnenfor(s.pts, beh)) { showToast(`«${s.navn}» ligger ikke inne i «${beh.navn}». Tegn omrisset på nytt etter flyttingen.`); }
    smEndre(() => { s.forelder = ny; });
  }
});
