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

function renderUtkikk() {
  const st = ui.utkikk;
  renderFirmFilter('utkikk');
  document.getElementById('uk-lys').value = st.lys;
  document.getElementById('uk-farg').checked = st.farg;
  document.getElementById('uk-reset').hidden = !st.uker.size;
  const from = mondayOf(TODAY), to = addDays(from, UK_UKER * 7 - 1);
  const panel = document.getElementById('uk-panel');
  const tilgjengelig = Math.max(400, (panel.clientWidth || 1200) - 202);
  const skala = Math.max(1, tilgjengelig / ukNaturligBredde(st));
  const {leaves, hode, bredde} = ukBygg(from, skala);
  ukLeaves = leaves;
  const tGrense = UK_FARGE_UKER * 168, xGrense = ukX(tGrense);

  const items = DATA.filter(a => !a.generell && matches(a, st) && a.startdato <= to && endDate(a) >= from).map(a => ({a, s: totalStatus(a)}))
    .filter(({s}) => !st.lys || (st.lys === 'avvik' ? s.lys === 'rod' || s.lys === 'gul' : s.lys === st.lys));
  const zones = [...SK_ZONE_ORDER, ...[...new Set(items.map(x => x.a.omrade))].filter(z => !SK_ZONE_ORDER.includes(z)).sort()];
  ukItems = [];
  const rows = zones.map((z, zi) => {
    const zs = items.filter(x => x.a.omrade === z).sort((p, q) => p.a.startdato.localeCompare(q.a.startdato) || p.a.id.localeCompare(q.a.id));
    const lanes = [];
    zs.forEach(it => {
      const a = it.a, t0 = Math.max(0, daysBetween(from, a.startdato) * 24), t1 = Math.min(UK_UKER * 168, (daysBetween(from, endDate(a)) + 1) * 24);
      const x0 = ukX(t0), x1 = ukX(t1), tekst = (a.id + ' ' + a.navn).length * 6.3 + 30;
      const ute = x1 - x0 < Math.min(tekst, 140);
      const opptatt = ute ? x1 + 6 + Math.min(a.navn.length, 34) * 6.3 + 40 : x1;
      let k = lanes.findIndex(end => end < x0 + 1);
      if (k < 0) { k = lanes.length; lanes.push(0); }
      lanes[k] = opptatt;
      Object.assign(it, {k, x0, x1, ute, cutL: a.startdato < from, cutR: endDate(a) > to});
    });
    const h = zs.length ? lanes.length * UK_LANE + UK_PAD * 2 - 6 : 38;
    const [grp, sub] = z.includes(' / ') ? z.split(' / ') : [null, z];
    const firstInGrp = grp && !(zones[zi - 1] || '').startsWith(grp + ' / ');
    const bars = zs.map(it => {
      const i = ukItems.push(it) - 1, a = it.a, c = st.sunnhet ? SUNN_FARGE[sunnhet(a)] : firmColor(a.firma);
      // Etter 8 uker blir stolpen grå (også den delen av en stolpe som strekker seg forbi grensen).
      let bg = c, fg = svTextColor(c);
      if (!st.farg && it.x1 > xGrense) {
        if (it.x0 >= xGrense) { bg = UK_GRA; fg = '#24292f'; }
        else bg = `linear-gradient(to right, ${c} 0 ${xGrense - it.x0}px, ${UK_GRA} ${xGrense - it.x0}px)`;
      }
      const lab = it.ute ? `<div class="sv-lab uk-lab${a.status === 'Utført' ? ' done' : ''}" data-i="${i}" style="left:${it.x1 + 3}px;top:${UK_PAD + it.k * UK_LANE}px">${it.cutL ? '◂ ' : ''}<b>${esc(a.id)}</b> ${esc(a.navn.length > 34 ? a.navn.slice(0, 33) + '…' : a.navn)}</div>` : '';
      return `<div class="sv-bar uk-bar${it.cutL ? ' cut-l' : ''}${it.cutR ? ' cut-r' : ''}${a.status === 'Utført' ? ' done' : ''}" data-i="${i}"
        style="left:${it.x0}px;width:${Math.max(4, it.x1 - it.x0 - 2)}px;top:${UK_PAD + it.k * UK_LANE}px;background:${bg};color:${fg}">
        <span class="sv-lys ${it.s.lys}"></span>${it.ute ? '' : `<span class="txt">${it.cutL ? '◂ ' : ''}${esc(a.id)} ${esc(a.navn)}</span>`}</div>${lab}`;
    }).join('');
    return `<div class="sv-row" data-zone="${esc(z)}">
      <div class="sv-left">${grp ? `${firstInGrp ? `<span class="grp">${esc(grp)}</span>` : ''}<span class="sub-z">${esc(sub)}</span>` : `<span>${esc(z)}</span>`}${zs.length ? `<span class="cnt">${zs.length} aktivitet${zs.length === 1 ? '' : 'er'}</span>` : ''}</div>
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

  const firmsShown = FIRMS.map(f => f.navn).filter(n => items.some(x => x.a.firma === n));
  document.getElementById('uk-legend').innerHTML = `<span><b>Totalstatus:</b></span>
    <span><span class="sv-lys rod"></span> Rød – noe er ikke avklart</span><span><span class="sv-lys gul"></span> Gul – under avklaring</span>
    <span><span class="sv-lys ikke"></span> Grå – ikke ferdig vurdert</span><span><span class="sv-lys gronn"></span> Grønn – alt avklart</span>
    ${firmsShown.length ? `<span style="margin-left:10px"><b>Firma:</b></span>${firmsShown.map(f => firmBadge(f)).join(' ')}` : ''}
    <span class="muted">${st.farg ? '' : 'Grå stolpe = etter 8 uker · '}Blek stolpe = utført · ◂ = startet før denne uken · trykk på uke, dag eller periode i overskriften for å zoome</span>`;
}

function ukShowTip(bar) {
  const tip = document.getElementById('uk-tip');
  document.querySelectorAll('.uk-bar.hover').forEach(x => x !== bar && x.classList.remove('hover'));
  if (!bar) { tip.hidden = true; return; }
  if (tip.dataset.i === bar.dataset.i && !tip.hidden) return;
  bar.classList.add('hover');
  tip.dataset.i = bar.dataset.i;
  tip.innerHTML = svTipHtml(ukItems[Number(bar.dataset.i)]);
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
    ukShowTip(null); renderUtkikk(); return;
  }
  if (action === 'uk-reset') { st.uker.clear(); st.dager.clear(); st.perioder.clear(); renderUtkikk(); }
}

document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'uk-farg') { ui.utkikk.farg = el.checked; renderUtkikk(); }
  else if (el.id === 'uk-lys') { ui.utkikk.lys = el.value; renderUtkikk(); }
});
document.addEventListener('pointerover', e => {
  if (!ukPa() || e.pointerType === 'touch') return;
  ukShowTip(ukBarOf(e.target));
});
document.addEventListener('click', e => {
  if (!ukPa()) return;
  const bar = ukBarOf(e.target);
  if (bar) ukShowTip(bar); else if (!e.target.closest('#uk-tip')) ukShowTip(null);
});
document.addEventListener('scroll', () => { if (ukPa()) ukShowTip(null); }, true);
window.addEventListener('resize', () => { clearTimeout(window.ukT); window.ukT = setTimeout(() => { if (ukPa()) renderUtkikk(); }, 200); });
