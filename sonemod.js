// ---------- Sonemodul (fanen «Sonemodul», foreløpig kun systemadministrator) ----------
// Den logiske oppbyggingen av soner: fra de mest detaljerte finsonene (ruter mellom aksene på kartet fra AT-koordinering)
// via grovsoner, i et tre per fase. Marker ruter, lag en sone av dem, og knytt sonen til en overliggende sone.
// Foreløpig brukes Sonemodul bare av Utkikksplan (sonetreet der); resten av appen påvirkes ikke.
// Lagring: ett dokument per fase og per sone i samlingen «sonemod» (se lagSynk i utkikk.js).
const SM_KEY = 'wrk2_sonemod';
const SM_FARGER = ['#2da44e', '#1f6feb', '#bf3989', '#d4a72c', '#8250df', '#cf222e', '#0e7c86', '#fb8500', '#57606a', '#1a7f37', '#953800', '#0969da'];
let SM = null;
const smSynk = lagSynk(['sonemod']);
const smUi = {fase: null, valgt: null, merket: new Set(), maler: null, visAlle: true};

// ----- rutenett: ruter mellom aksene (vertikale F/W/S-akser og radaksene), bare der det er bygg -----
let smCelleCache = null;
function smLinjer() {
  const sl = (liste, tol) => { const ut = []; liste.sort((a, b) => a.v - b.v).forEach(l => { const s = ut[ut.length - 1]; if (s && l.v - s.v < tol) { s.navn = s.navn || l.navn; } else ut.push({...l}); }); return ut; };
  const xs = sl([...AX_TOP.map(([n, x]) => ({v: x, navn: n})), ...AX_S.map(([n, x]) => ({v: x, navn: n})), {v: 1780, navn: ''}], 8);
  const rader = [...AX_ROWS.map(([n, y]) => ({v: y, navn: n})), ...AX_ROWS_R.map(([n, y]) => ({v: y, navn: n}))];
  const ys = [113, 165, 257, 299, 343, 386, 427, 468, 505, 540, 585, 615, 665].map(v => { const a = rader.filter(r => Math.abs(r.v - v) <= 8).map(r => r.navn); return {v, navn: a.join('/')}; });
  return {xs, ys};
}
function smInne(x, y, pts) {
  let inne = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inne = !inne;
  }
  return inne;
}
function smCeller() {
  if (smCelleCache) return smCelleCache;
  const {xs, ys} = smLinjer(), celler = [];
  for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
    const x0 = xs[i].v, x1 = xs[i + 1].v, y0 = ys[j].v, y1 = ys[j + 1].v, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const bygg = ZONES.filter(z => smInne(cx, cy, z.pts)).map(z => z.navn);
    if (!bygg.length) continue;
    const kol = (xs[i].navn || Math.round(x0)) + '–' + (xs[i + 1].navn || Math.round(x1)), rad = (ys[j].navn || Math.round(y0)) + '–' + (ys[j + 1].navn || Math.round(y1));
    celler.push({id: `c${Math.round(x0)}_${y0}`, x0, x1, y0, y1, cx, cy, navn: `${kol} / ${rad}`, bygg});
  }
  return (smCelleCache = celler);
}

// ----- standardoppsett: soner med samme navn som i planen, og kjelleren delt i B1–B4 og OpCB -----
function smStandard() {
  const fase = {id: 'f' + uid(), type: 'fase', navn: 'Grunn og betong', utkikk: true, rekkefolge: 0};
  const soner = [];
  let n = 0;
  const ny = (navn, forelder, celler = [], merknad = '') => { const s = {id: 's' + uid(), type: 'sone', fase: fase.id, navn, forelder: forelder ? forelder.id : null, celler, farge: SM_FARGER[n % SM_FARGER.length], rekkefolge: n++, merknad}; soner.push(s); return s; };
  const C = smCeller(), i = navn => C.filter(c => c.bygg.includes(navn)).map(c => c.id);
  const kj = c => c.bygg.some(b => b.startsWith('8302 - Kjeller / ') && b !== '8302 - Kjeller / Kjellerinnkjøring');
  const kjDel = (f) => C.filter(c => kj(c) && f(c)).map(c => c.id);
  ny('8300 - Utomhus', null, [], 'Resten av tomten');
  ny('8301 - Ovnshall', null, i('8301 - Ovnshall'));
  const kjeller = ny('8302 - Kjeller', null, [], 'Kjeller / U1-nivå');
  const vest = ny('Vest', kjeller), ost = ny('Øst', kjeller);
  ny('B1', vest, kjDel(c => (c.cy < 345 && c.cx < 603) || (c.cy >= 345 && c.cy < 427 && c.cx < 715)));
  ny('B3', vest, kjDel(c => c.cy >= 427 && c.cx < 715));
  ny('B2', ost, kjDel(c => c.cy >= 345 && c.cy < 427 && c.cx >= 715));
  ny('B4', ost, kjDel(c => c.cy >= 427 && c.cx >= 715));
  ny('OpCB', kjeller, kjDel(c => c.cy < 345 && c.cx >= 753), 'Tilhører 8303 Driftssenter, ligger i kjeller (U1)');
  const inn = ny('Kjellerinnkjøring', kjeller);
  const rampe = i('8302 - Kjeller / Kjellerinnkjøring');
  ny('Rampe', inn, rampe.filter(id => C.find(c => c.id === id).cx < 543));
  ny('Uteplass kjeller', inn, rampe.filter(id => C.find(c => c.id === id).cx >= 543));
  ['8302 - Trådhall', '8302 - Kontrollsenter', '8303 - Driftssenter', '8304 - Lagerhall', 'Pallelager'].forEach(z => ny(z, null, i(z)));
  return {faser: [fase], soner};
}

// ----- lagring -----
function smNorm(m) {
  m = m && Array.isArray(m.faser) ? m : {faser: [], soner: []};
  m.soner = m.soner || [];
  m.faser.sort((a, b) => (a.rekkefolge || 0) - (b.rekkefolge || 0));
  m.soner.sort((a, b) => (a.rekkefolge || 0) - (b.rekkefolge || 0));
  return m;
}
function smLast() {
  if (SM) return SM;
  try { SM = JSON.parse(localStorage.getItem(SM_KEY)); } catch (e) { SM = null; }
  SM = smNorm(SM);
  if (!SM.faser.length && (typeof CLOUD === 'undefined' || !CLOUD)) SM = smStandard();
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
  // Første gang i skyen: legg inn standardoppsettet.
  if (!SM.faser.length && smErSys()) { SM = smStandard(); smLagre(); }
  else if (lokal) smLagre();
  try { localStorage.setItem(SM_KEY, JSON.stringify(SM)); } catch (e) {}
  if (smPa()) renderSonemod();
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
const smAlleCeller = id => [...new Set(smUnder(id).flatMap(x => (smSone(x) || {}).celler || []))];
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
  if (!f && smErSys() && (typeof CLOUD === 'undefined' || !CLOUD || smSynk.klar)) { SM = smStandard(); smLagre(); return renderSonemod(); }
  if (!f) { root.innerHTML = '<div class="panel"><h2>Sonemodul</h2><p class="sub">Laster …</p></div>'; return; }
  smUi.fase = f.id;
  if (smUi.valgt && !smSone(smUi.valgt)) smUi.valgt = null;
  const soner = smSonerI(f.id), valgt = smUi.valgt && smSone(smUi.valgt);
  const C = smCeller(), valgtCeller = new Set(valgt ? smAlleCeller(valgt.id) : []);
  const egneFarger = new Map();
  if (!valgt && smUi.visAlle) soner.filter(s => !smBarn(s.id).length).forEach(s => (s.celler || []).forEach(c => { if (!egneFarger.has(c)) egneFarger.set(c, s.farge); }));
  const rute = c => {
    const m = smUi.merket.has(c.id), v = valgtCeller.has(c.id), farge = v ? valgt.farge : egneFarger.get(c.id);
    return `<rect class="sm-c${m ? ' merket' : ''}${v ? ' valgt' : ''}" data-celle="${c.id}" x="${c.x0}" y="${c.y0}" width="${c.x1 - c.x0}" height="${c.y1 - c.y0}" style="${farge && !m ? `fill:${farge};fill-opacity:${v ? .45 : .22}` : ''}"><title>${esc(c.navn)} · ${esc(c.bygg.join(', '))}</title></rect>`;
  };
  // Navn på sonene midt i rutene deres: bladene i fasen, eller den valgte sonens blader.
  const etiketter = (valgt ? smUnder(valgt.id).map(smSone).filter(s => !smBarn(s.id).length) : soner.filter(s => !smBarn(s.id).length))
    .filter(s => (s.celler || []).length).map(s => {
      const cs = s.celler.map(id => C.find(c => c.id === id)).filter(Boolean);
      if (!cs.length) return '';
      const x = cs.reduce((n, c) => n + c.cx, 0) / cs.length, y = cs.reduce((n, c) => n + c.cy, 0) / cs.length;
      return `<text x="${x}" y="${y + 5}" text-anchor="middle" class="sm-etikett" fill="${s.farge}">${esc(s.navn)}</text>`;
    }).join('');
  const overlay = `<svg class="sm-overlay" viewBox="0 0 ${MAP_W} ${MAP_H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">${C.map(rute).join('')}${etiketter}</svg>`;
  const tre = [], dfs = (s, d) => { tre.push({s, d}); smBarn(s.id).forEach(c => dfs(c, d + 1)); };
  soner.filter(s => !s.forelder).forEach(s => dfs(s, 0));
  const kanVaereForelder = (s, kand) => kand.id !== s.id && !smUnder(s.id).includes(kand.id);
  const rad = ({s, d}) => {
    const barn = smBarn(s.id), n = smAlleCeller(s.id).length;
    return `<div class="sm-rad${valgt && valgt.id === s.id ? ' valgt' : ''}" data-smsone="${s.id}" style="padding-left:${6 + d * 18}px">
      <span class="sm-farge" style="background:${s.farge}"></span>
      <input type="text" class="sm-navn" data-smf="navn" data-id="${s.id}" value="${esc(s.navn)}" title="Navnet på sonen">
      <span class="sub">${barn.length ? `${barn.length} under` : 'finsone'} · ${n} rute${n === 1 ? '' : 'r'}${s.merknad ? ' · ' + esc(s.merknad) : ''}</span>
      <select data-smf="forelder" data-id="${s.id}" title="Overliggende sone"><option value="">(øverst)</option>${soner.filter(k => kanVaereForelder(s, k)).map(k => `<option value="${k.id}" ${s.forelder === k.id ? 'selected' : ''}>${esc(smSti(k))}</option>`).join('')}</select>
      <button class="link-btn" data-action="sm-slett" data-id="${s.id}" title="Slett sonen (undersonene flyttes opp)">✕</button></div>`;
  };
  root.innerHTML = `<div class="panel">
    <h2>Sonemodul <span class="readonly-tag">Brukes foreløpig bare av Utkikksplan</span></h2>
    <p class="intro">Bygg opp sonene fra de minste rutene mellom aksene: <b>marker ruter</b> på kartet (trykk eller dra), <b>lag en sone</b> av dem, og <b>knytt den til en overliggende sone</b>. Hver fase har sitt eget sonetre. Fasen som er valgt for Utkikksplan, styrer sonene der.</p>
    <div class="toolbar">
      <label>Fase: <select id="sm-fase">${M.faser.map(x => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${esc(x.navn)}${x.utkikk ? ' (Utkikksplan)' : ''}</option>`).join('')}</select></label>
      <button class="btn" data-action="sm-fase-ny" title="Ny fase som kopi av denne">＋ Ny fase</button>
      <button class="btn" data-action="sm-fase-navn">✎ Gi nytt navn</button>
      ${f.utkikk ? '<span class="badge">Brukes i Utkikksplan</span>' : '<button class="btn" data-action="sm-fase-utkikk">Bruk denne i Utkikksplan</button>'}
      ${M.faser.length > 1 ? '<button class="btn danger" data-action="sm-fase-slett">Slett fase</button>' : ''}
    </div>
  </div>
  <div class="sm-grid">
    <div class="panel sm-kart-panel">
      <div class="toolbar">
        <b>${smUi.merket.size} rute${smUi.merket.size === 1 ? '' : 'r'} markert</b>
        <button class="btn primary" data-action="sm-ny-fra" ${smUi.merket.size ? '' : 'disabled'}>＋ Lag sone av markerte</button>
        ${valgt ? `<button class="btn" data-action="sm-legg-til" ${smUi.merket.size ? '' : 'disabled'}>Legg markerte til «${esc(valgt.navn)}»</button><button class="btn" data-action="sm-fjern" ${smUi.merket.size ? '' : 'disabled'}>Fjern markerte fra «${esc(valgt.navn)}»</button><button class="btn" data-action="sm-merk-valgt">Marker rutene til «${esc(valgt.navn)}»</button>` : ''}
        <button class="btn" data-action="sm-tom" ${smUi.merket.size ? '' : 'disabled'}>Tøm markering</button>
        <label class="sv-switch"><input type="checkbox" id="sm-visalle" ${smUi.visAlle ? 'checked' : ''}><span class="sl"></span>Vis alle finsoner</label>
      </div>
      <div class="sm-kart">${zoneSvg({})}${overlay}</div>
      <p class="sub">Rutene følger aksene (F/W/S og radaksene). Samme rute kan høre til flere soner, f.eks. kjeller (U1) og hallen over. Hold over en rute for aksenavnet.</p>
    </div>
    <div class="panel sm-tre-panel">
      <h3>Soner i «${esc(f.navn)}»</h3>
      <div class="toolbar"><button class="btn" data-action="sm-ny-grov">＋ Ny overliggende sone</button>${valgt ? `<button class="btn" data-action="sm-velg-ingen">Fjern valg</button>` : ''}</div>
      <div class="sm-tre">${tre.map(rad).join('') || '<p class="sub">Ingen soner ennå.</p>'}</div>
      <p class="sub">Trykk på en sone for å se rutene dens. Velg overliggende sone i lista til høyre på raden. Endrer du navn eller plassering, følger aktivitetene i Utkikksplan med.</p>
    </div>
  </div>`;
}

// ----- handlinger -----
function smNySone(navn, forelder, celler) {
  const f = smFase(), M = smLast(), soner = smSonerI(f.id);
  const s = {id: 's' + uid(), type: 'sone', fase: f.id, navn, forelder: forelder || null, celler: celler || [], farge: SM_FARGER[soner.length % SM_FARGER.length], rekkefolge: Math.max(0, ...M.soner.map(x => x.rekkefolge || 0)) + 1, merknad: ''};
  M.soner.push(s);
  return s;
}
function smAction(action, btn) {
  if (!isSys()) return;
  const M = smLast(), f = smFase(), valgt = smUi.valgt && smSone(smUi.valgt);
  if (action === 'sm-tom') { smUi.merket.clear(); renderSonemod(); return; }
  if (action === 'sm-velg-ingen') { smUi.valgt = null; renderSonemod(); return; }
  if (action === 'sm-merk-valgt' && valgt) { smUi.merket = new Set(smAlleCeller(valgt.id)); renderSonemod(); return; }
  if (action === 'sm-ny-fra') {
    const navn = (prompt(`Navn på den nye sonen (${smUi.merket.size} ruter):`) || '').trim();
    if (!navn) return;
    smEndre(() => { const s = smNySone(navn, valgt && smBarn(valgt.id).length ? valgt.id : valgt ? valgt.forelder : null, [...smUi.merket]); smUi.valgt = s.id; smUi.merket.clear(); });
    if (typeof logg === 'function') logg('Sonemodul: ny sone', '', `${navn} (${f.navn})`);
    return;
  }
  if (action === 'sm-legg-til' && valgt) { smEndre(() => { valgt.celler = [...new Set([...(valgt.celler || []), ...smUi.merket])]; smUi.merket.clear(); }); return; }
  if (action === 'sm-fjern' && valgt) { smEndre(() => { const m = smUi.merket; smUnder(valgt.id).forEach(id => { const s = smSone(id); s.celler = (s.celler || []).filter(c => !m.has(c)); }); m.clear(); }); return; }
  if (action === 'sm-ny-grov') {
    const navn = (prompt('Navn på den overliggende sonen:') || '').trim();
    if (!navn) return;
    smEndre(() => { const s = smNySone(navn, null, []); smUi.valgt = s.id; });
    return;
  }
  if (action === 'sm-slett') {
    const s = smSone(btn.dataset.id); if (!s) return;
    if (!confirm(`Slette sonen «${smSti(s)}»?${smBarn(s.id).length ? ' Undersonene flyttes opp ett nivå.' : ''}`)) return;
    smEndre(() => { smBarn(s.id).forEach(c => { c.forelder = s.forelder; }); M.soner = M.soner.filter(x => x !== s); });
    if (typeof logg === 'function') logg('Sonemodul: slettet sone', '', `${s.navn} (${f.navn})`);
    return;
  }
  if (action === 'sm-fase-ny') {
    const navn = (prompt('Navn på den nye fasen (sonetreet kopieres fra denne):', f.navn + ' (kopi)') || '').trim();
    if (!navn) return;
    const nf = {id: 'f' + uid(), type: 'fase', navn, utkikk: false, rekkefolge: M.faser.length};
    const idMap = new Map(smSonerI(f.id).map(s => [s.id, 's' + uid()]));
    smSonerI(f.id).forEach(s => M.soner.push({...JSON.parse(JSON.stringify(s)), id: idMap.get(s.id), fase: nf.id, forelder: s.forelder ? idMap.get(s.forelder) : null}));
    M.faser.push(nf); smUi.fase = nf.id; smUi.valgt = null;
    smLagre(); renderSonemod(); return;
  }
  if (action === 'sm-fase-navn') { const navn = (prompt('Nytt navn på fasen:', f.navn) || '').trim(); if (navn) { f.navn = navn; smLagre(); renderSonemod(); } return; }
  if (action === 'sm-fase-utkikk') {
    const gammel = M.faser.find(x => x.utkikk);
    M.faser.forEach(x => { x.utkikk = x === f; });
    smLagre(); renderSonemod();
    showToast(`Utkikksplan bruker nå sonene i «${f.navn}».${gammel ? ' Aktiviteter i soner som ikke finnes her, vises som egne rader.' : ''}`);
    return;
  }
  if (action === 'sm-fase-slett') {
    if (f.utkikk) { alert('Fasen brukes i Utkikksplan. Velg en annen fase for Utkikksplan først.'); return; }
    if (!confirm(`Slette fasen «${f.navn}» med alle sonene?`)) return;
    M.soner = M.soner.filter(s => s.fase !== f.id); M.faser = M.faser.filter(x => x !== f); smUi.fase = null; smUi.valgt = null;
    smLagre(); renderSonemod();
  }
}

// Marker ruter: trykk for å slå av/på, dra for å male flere (samme retning som første rute).
document.addEventListener('pointerdown', e => {
  if (!smPa() || e.button > 0) return;
  const c = e.target.closest && e.target.closest('#sm-root [data-celle]');
  if (!c) return;
  e.preventDefault();
  const id = c.dataset.celle;
  smUi.maler = smUi.merket.has(id) ? 'av' : 'pa';
  smMal(c);
});
function smMal(el) {
  const id = el.dataset.celle;
  if (smUi.maler === 'pa') smUi.merket.add(id); else smUi.merket.delete(id);
  el.classList.toggle('merket', smUi.maler === 'pa');
}
document.addEventListener('pointermove', e => {
  if (!smPa() || !smUi.maler) return;
  const el = document.elementFromPoint(e.clientX, e.clientY), c = el && el.closest && el.closest('#sm-root [data-celle]');
  if (c) smMal(c);
});
document.addEventListener('pointerup', () => { if (smPa() && smUi.maler) { smUi.maler = null; renderSonemod(); } });
document.addEventListener('click', e => {
  if (!smPa()) return;
  const r = e.target.closest('#sm-root .sm-rad');
  if (r && !e.target.closest('input, select, button')) { smUi.valgt = smUi.valgt === r.dataset.smsone ? null : r.dataset.smsone; renderSonemod(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (!smPa() || !el.closest || !el.closest('#sm-root')) return;
  if (el.id === 'sm-fase') { smUi.fase = el.value; smUi.valgt = null; smUi.merket.clear(); renderSonemod(); return; }
  if (el.id === 'sm-visalle') { smUi.visAlle = el.checked; renderSonemod(); return; }
  const s = smSone(el.dataset.id);
  if (!s || !isSys()) return;
  if (el.dataset.smf === 'navn') { const v = el.value.trim(); if (!v || v === s.navn) { el.value = s.navn; return; } smEndre(() => { s.navn = v; }); }
  else if (el.dataset.smf === 'forelder') smEndre(() => { s.forelder = el.value || null; });
});
