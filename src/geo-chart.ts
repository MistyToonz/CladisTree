// ==========================================
// FIGURE D'AIDE : FRISE DES TEMPS GÉOLOGIQUES (phase 4)
// ==========================================
// Charte chronostratigraphique détaillée, consultable à tout moment (onglet Aide, et groupe Chronogramme
// de l'onglet Arbre) : éons, ères, périodes, époques et étages aux couleurs officielles, âge de chaque base
// avec son incertitude, et nature de la limite : clou d'or (GSSP ratifié), âge numérique (GSSA) ou limite
// pas encore ratifiée. Toutes les données viennent de chrono-data.ts (âges : GEO_DETAILS, seule source).
// Un clic sur une unité affiche ses détails ; en chronogramme, « Voir dans le chronogramme » y amène la caméra.

import { t, currentLang, LANG_LOCALES, colonSep } from './i18n';
import { state } from './graph-state';
import {
    PHANEROZOIC_PERIODS, PRECAMBRIAN_UNITS, EPOCHS, PHANEROZOIC_ERAS, EON_COLORS, STAGE_COLORS, BOUNDARIES,
    ICS_CHART_VERSION, BoundaryDef,
} from './chrono-data';
import type { AppContext } from './app-context';

/** Unité affichable : nom, intervalle, rang, chaîne des unités englobantes (pour le détail). */
type ChartUnit = { key: string; base: number; top: number; rank: string; parents: string[] };

const SPIKE_SVG = '<svg class="gc-ico gc-spike" viewBox="0 0 16 12" aria-hidden="true"><path d="M1 6 L6.5 3.6 H12.5 V8.4 H6.5 Z" fill="#E2B33B" stroke="#6E520C" stroke-width="0.9" stroke-linejoin="round"/><rect x="12.5" y="1.5" width="2.4" height="9" rx="0.6" fill="#C99A22" stroke="#6E520C" stroke-width="0.9"/></svg>';
const CLOCK_SVG = '<svg class="gc-ico gc-clock" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 3.6 V7 L9.4 8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

const numberFmt = () => new Intl.NumberFormat(LANG_LOCALES[currentLang], { maximumFractionDigits: 4 });
const fmtMa = (v: number) => numberFmt().format(v);
const fmtBase = (base: number, b?: BoundaryDef) => fmtMa(base) + (b && b.err ? ` <span class="gc-err">± ${fmtMa(b.err)}</span>` : '');
/** Texte noir ou blanc selon la clarté du fond (couleurs ICS très variées). */
const textOn = (hex: string) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? '#ffffff' : '#141414';
};
const marker = (b?: BoundaryDef) => (b && b.kind === 'gssp' ? `<span title="${t('geochart.legend.gssp')}">${SPIKE_SVG}</span>`
    : b && b.kind === 'gssa' ? `<span title="${t('geochart.legend.gssa')}">${CLOCK_SVG}</span>`
    : `<span class="gc-none" title="${t('geochart.legend.none')}">–</span>`);
const cell = (key: string, color: string, rowspan: number, cls: string, colspan = 1) =>
    `<td class="gc-unit ${cls}" data-unit="${key}" rowspan="${rowspan}" colspan="${colspan}" style="background:${color}; color:${textOn(color)}"><span>${t(key)}</span></td>`;
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lignes du tableau (une par étage au Phanérozoïque, une par période / ère au Précambrien) et index des unités. */
const buildTable = () => {
    const units = new Map<string, ChartUnit>();
    const rows: string[] = [];
    const periodOf = new Map(PHANEROZOIC_PERIODS.map(p => [p.key, p]));
    const phanerozoicRows = PHANEROZOIC_PERIODS.reduce((n, p) => n + p.subs.length, 0);
    let first = true;
    PHANEROZOIC_ERAS.forEach(era => {
        const eraPeriods = era.periods.map(k => periodOf.get(k)!);
        const eraRows = eraPeriods.reduce((n, p) => n + p.subs.length, 0);
        units.set(era.key, { key: era.key, base: eraPeriods[eraPeriods.length - 1].start, top: eraPeriods[0].end, rank: 'era', parents: ['geo.eon.phanerozoic'] });
        let eraFirst = true;
        eraPeriods.forEach(period => {
            units.set(period.key, { key: period.key, base: period.start, top: period.end, rank: 'period', parents: [era.key, 'geo.eon.phanerozoic'] });
            let periodFirst = true;
            EPOCHS.filter(e => e.period === period.key).forEach(epoch => {
                const st = epoch.stages.map(k => period.subs.find(s => s.k === k)!);
                units.set(epoch.key, { key: epoch.key, base: st[st.length - 1].s, top: st[0].e, rank: 'epoch', parents: [period.key, era.key, 'geo.eon.phanerozoic'] });
                st.forEach((stage, k) => {
                    units.set(stage.k, { key: stage.k, base: stage.s, top: stage.e, rank: 'stage', parents: [epoch.key, period.key, era.key, 'geo.eon.phanerozoic'] });
                    const b = BOUNDARIES[stage.k];
                    rows.push(`<tr data-row="${stage.k}">`
                        + (first ? cell('geo.eon.phanerozoic', EON_COLORS['geo.eon.phanerozoic'], phanerozoicRows, 'gc-eon gc-vertical') : '')
                        + (eraFirst ? cell(era.key, era.color, eraRows, 'gc-era gc-vertical') : '')
                        + (periodFirst ? cell(period.key, period.color, period.subs.length, 'gc-period') : '')
                        + (k === 0 ? cell(epoch.key, epoch.color, st.length, 'gc-epoch') : '')
                        + cell(stage.k, STAGE_COLORS[stage.k], 1, 'gc-stage')
                        + `<td class="gc-age">${fmtBase(stage.s, b)}</td><td class="gc-mark">${marker(b)}</td></tr>`);
                    first = eraFirst = periodFirst = false;
                });
            });
        });
    });
    // Précambrien : Protérozoïque (ères → périodes), Archéen (ères), Hadéen.
    units.set('geo.eon.phanerozoic', { key: 'geo.eon.phanerozoic', base: PHANEROZOIC_PERIODS[PHANEROZOIC_PERIODS.length - 1].start, top: 0, rank: 'eon', parents: [] });
    const proterozoic = PRECAMBRIAN_UNITS.filter(u => u.subs.length > 0);
    const archean = PRECAMBRIAN_UNITS.filter(u => u.key.startsWith('geo.era.') && u.subs.length === 0);
    const hadean = PRECAMBRIAN_UNITS.filter(u => u.key.startsWith('geo.eon.'));
    const proRows = proterozoic.reduce((n, u) => n + u.subs.length, 0);
    units.set('geo.eon.proterozoic', { key: 'geo.eon.proterozoic', base: proterozoic[proterozoic.length - 1].start, top: proterozoic[0].end, rank: 'eon', parents: [] });
    units.set('geo.eon.archean', { key: 'geo.eon.archean', base: archean[archean.length - 1].start, top: archean[0].end, rank: 'eon', parents: [] });
    rows.push(`<tr class="gc-sep"><td colspan="7">${t('geochart.precambrian')}</td></tr>`);
    first = true;
    proterozoic.forEach(era => {
        units.set(era.key, { key: era.key, base: era.start, top: era.end, rank: 'era', parents: ['geo.eon.proterozoic'] });
        era.subs.forEach((p, k) => {
            units.set(p.k, { key: p.k, base: p.s, top: p.e, rank: 'period', parents: [era.key, 'geo.eon.proterozoic'] });
            const b = BOUNDARIES[p.k];
            rows.push(`<tr data-row="${p.k}">`
                + (first ? cell('geo.eon.proterozoic', EON_COLORS['geo.eon.proterozoic'], proRows, 'gc-eon gc-vertical') : '')
                + (k === 0 ? cell(era.key, era.color, era.subs.length, 'gc-era gc-vertical') : '')
                + cell(p.k, STAGE_COLORS[p.k] || era.color, 1, 'gc-period', 3)
                + `<td class="gc-age">${fmtBase(p.s, b)}</td><td class="gc-mark">${marker(b)}</td></tr>`);
            first = false;
        });
    });
    first = true;
    archean.forEach(era => {
        units.set(era.key, { key: era.key, base: era.start, top: era.end, rank: 'era', parents: ['geo.eon.archean'] });
        const b = BOUNDARIES[era.key];
        rows.push(`<tr data-row="${era.key}">`
            + (first ? cell('geo.eon.archean', EON_COLORS['geo.eon.archean'], archean.length, 'gc-eon gc-vertical') : '')
            + cell(era.key, era.color, 1, 'gc-era', 4)
            + `<td class="gc-age">${fmtBase(era.start, b)}</td><td class="gc-mark">${marker(b)}</td></tr>`);
        first = false;
    });
    hadean.forEach(eon => {
        units.set(eon.key, { key: eon.key, base: eon.start, top: eon.end, rank: 'eon', parents: [] });
        const b = BOUNDARIES[eon.key];
        rows.push(`<tr data-row="${eon.key}">${cell(eon.key, eon.color, 1, 'gc-eon', 5)}<td class="gc-age">${fmtBase(eon.start, b)}</td><td class="gc-mark">${marker(b)}</td></tr>`);
    });
    return { html: rows.join(''), units };
};

export function initGeoChart(ctx: AppContext) {
  let overlay: HTMLDivElement | null = null;
  let units = new Map<string, ChartUnit>();
  let selected: string | null = null;

  const build = () => {
      const table = buildTable();
      units = table.units;
      overlay = document.createElement('div');
      overlay.id = 'geo-chart-overlay';
      overlay.className = 'gc-overlay';
      overlay.innerHTML = `
        <div class="gc-panel" role="dialog" aria-label="${t('geochart.title')}">
          <header class="gc-head">
            <div>
              <div class="gc-title">${t('geochart.title')}</div>
              <div class="gc-sub">${t('geochart.subtitle').replace('{v}', ICS_CHART_VERSION)}</div>
            </div>
            <input type="search" class="gc-search" placeholder="${t('geochart.search')}" aria-label="${t('geochart.search')}">
            <button class="gc-close" title="${t('btn.close')}" aria-label="${t('btn.close')}">&#x2715;</button>
          </header>
          <div class="gc-legend">
            <span>${SPIKE_SVG} ${t('geochart.legend.gssp')}</span>
            <span>${CLOCK_SVG} ${t('geochart.legend.gssa')}</span>
            <span><span class="gc-none">–</span> ${t('geochart.legend.none')}</span>
          </div>
          <div class="gc-body">
            <table class="gc-table">
              <thead><tr>
                <th>${t('geochart.col.eon')}</th><th>${t('geochart.col.era')}</th><th>${t('geochart.col.period')}</th>
                <th>${t('geochart.col.epoch')}</th><th>${t('geochart.col.stage')}</th><th class="gc-age">${t('geochart.col.base')}</th><th></th>
              </tr></thead>
              <tbody><tr class="gc-present"><td colspan="5"></td><td class="gc-age">${t('geochart.present')} · 0</td><td></td></tr>${table.html}</tbody>
            </table>
          </div>
          <footer class="gc-foot">
            <div class="gc-detail">${t('geochart.hint')}</div>
            <button class="gc-show" disabled>${t('geochart.show')}</button>
          </footer>
        </div>`;
      document.body.appendChild(overlay);

      overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
      overlay.querySelector('.gc-close')!.addEventListener('click', close);
      overlay.querySelector('tbody')!.addEventListener('click', (e) => {
          const td = (e.target as HTMLElement).closest('td.gc-unit') as HTMLElement | null;
          const tr = (e.target as HTMLElement).closest('tr[data-row]') as HTMLElement | null;
          const key = td ? td.dataset.unit : tr ? tr.dataset.row : null;
          if (key) select(key);
      });
      overlay.querySelector('.gc-show')!.addEventListener('click', showInChronogram);
      const search = overlay.querySelector('.gc-search') as HTMLInputElement;
      search.addEventListener('input', () => {
          const q = normalize(search.value.trim());
          if (q.length < 2) return;
          const hit = [...units.keys()].find(k => normalize(t(k)).includes(q));
          if (hit) select(hit, true);
      });
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter' && selected) showInChronogram(); });
  };

  /** Sélectionne une unité : mise en évidence, détail en bas, défilement si demandé. */
  const select = (key: string, scroll = false) => {
      if (!overlay) return;
      const u = units.get(key);
      if (!u) return;
      selected = key;
      overlay.querySelectorAll('.gc-sel').forEach(el => el.classList.remove('gc-sel'));
      overlay.querySelectorAll(`[data-unit="${key}"]`).forEach(el => el.classList.add('gc-sel'));
      const b = BOUNDARIES[key] || (u.rank !== 'stage' ? BOUNDARIES[oldestStageOf(key)] : undefined);
      const kind = b && b.kind ? t('geochart.kind.' + b.kind) : t('geochart.legend.none');
      const chain = u.parents.map(p => t(p)).join(' · ');
      (overlay.querySelector('.gc-detail') as HTMLElement).innerHTML =
          `<b>${t(key)}</b>${chain ? ` <span class="gc-chain">${chain}</span>` : ''}<br>`
          + `${fmtMa(u.base)} → ${fmtMa(u.top)} Ma <span class="gc-chain">(${t('geochart.duration')} ${fmtMa(Math.round((u.base - u.top) * 1000) / 1000)} Ma)</span> · ${t('geochart.base')}${colonSep()} ${kind}${b && b.err ? ` (± ${fmtMa(b.err)} Ma)` : ''}`;
      const btn = overlay.querySelector('.gc-show') as HTMLButtonElement;
      btn.disabled = state.layoutMode !== 'chrono';
      btn.title = btn.disabled ? t('geochart.need_chrono') : '';
      if (scroll) overlay.querySelector(`[data-unit="${key}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  /** Étage (ou unité précambrienne) le plus ancien d'une unité : sa base est celle de l'unité. */
  const oldestStageOf = (key: string): string => {
      const p = PHANEROZOIC_PERIODS.find(x => x.key === key);
      if (p) return p.subs[p.subs.length - 1].k;
      const e = EPOCHS.find(x => x.key === key);
      if (e) return e.stages[e.stages.length - 1];
      const era = PHANEROZOIC_ERAS.find(x => x.key === key);
      if (era) return oldestStageOf(era.periods[era.periods.length - 1]);
      const pre = PRECAMBRIAN_UNITS.find(x => x.key === key);
      if (pre && pre.subs.length) return pre.subs[pre.subs.length - 1].k;
      return key;
  };
  /** Chronogramme : caméra centrée sur l'unité, au zoom actuel. */
  const showInChronogram = () => {
      const u = selected ? units.get(selected) : null;
      if (!u || state.layoutMode !== 'chrono') return;
      const cy = ctx.cy;
      // Cadrage : l'unité occupe ~80 % de la largeur (dans les limites du zoom), centrée, à la même hauteur.
      const x0 = ctx.chronoAgeToX(u.base), x1 = ctx.chronoAgeToX(u.top);
      const span = Math.max(1, Math.abs(x1 - x0));
      const zoom = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), (cy.width() * 0.8) / span));
      const cyMid = (cy.height() / 2 - cy.pan().y) / cy.zoom(); // ordonnée (modèle) au centre de la vue
      close();
      cy.animate({ zoom, pan: { x: cy.width() / 2 - ((x0 + x1) / 2) * zoom, y: cy.height() / 2 - cyMid * zoom } }, { duration: 500, easing: 'ease-in-out-cubic' });
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && overlay && overlay.style.display !== 'none') { e.preventDefault(); e.stopPropagation(); close(); } };
  const open = () => {
      if (!overlay) build();
      overlay!.style.display = 'flex';
      window.addEventListener('keydown', onKey, true);
      if (selected) select(selected); // bouton « Voir » selon la disposition actuelle
      requestAnimationFrame(() => (overlay!.querySelector('.gc-search') as HTMLInputElement).focus());
  };
  const close = () => {
      if (!overlay) return;
      overlay.style.display = 'none';
      window.removeEventListener('keydown', onKey, true);
  };

  document.getElementById('btn-geo-chart')?.addEventListener('click', open);
  document.getElementById('btn-geo-chart-chrono')?.addEventListener('click', open);
  return { openGeoChart: open };
}
