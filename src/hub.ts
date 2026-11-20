// ==========================================
// HUB D'ACCUEIL (phase 4)
// ==========================================
// Comportement du hub (HTML : utils.ts › getWelcomeHTML ; styles : visual.ts) :
//  - nouveau document à partir d'un modèle : cladogramme, dendrogramme (peigne), chronogramme ;
//  - ouvrir un fichier (même action que Fichier › Ouvrir) ; projets récents (file-io.ts › loadRecentFilesUI) ;
//  - Fichier › Accueil le rouvre par-dessus le document, avec « Retour au document » (et Échap) ;
//  - premier lancement : choix de la langue, avant tout le reste.
// Fermeture en fondu par `hideHub` : toute fermeture passe par là (ouverture de fichier, glisser-déposer…).

import { t, setLang, currentLang, Lang } from './i18n';
import type { AppContext } from './app-context';

const FADE_MS = 200;
const HIDING = 'hub-hiding'; // classe de fondu (visual.ts)
const hub = () => document.getElementById('welcome-overlay');
let hideTimer: number | undefined;

export const isHubVisible = () => { const h = hub(); return !!h && h.style.display !== 'none' && !h.classList.contains(HIDING); };

/** Ferme le hub en fondu. */
export const hideHub = () => {
    const h = hub();
    if (!h || h.style.display === 'none') return;
    h.classList.add(HIDING);
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { h.style.display = 'none'; h.classList.remove(HIDING); }, FADE_MS);
};

// ---------- Cladogramme décoratif des listes (Nouveau, Ouvrir) ----------
// Topologie dans data-topology : « ; » sépare les branches de la racine, « , » regroupe des feuilles
// sœurs (« standard,comb;chrono » = ((Cladogramme, Dendrogramme), Chronogramme)). Traits calculés depuis
// la position RÉELLE des boutons (hauteurs variables, retours à la ligne) : jamais décentrés ni déconnectés.
type Topo = string | Topo[];
const parseTopology = (s: string): Topo[] => s.split(';').map(part => (part.includes(',') ? part.split(',') : part));
const leavesOf = (t: Topo): string[] => (typeof t === 'string' ? [t] : ([] as string[]).concat(...t.map(leavesOf)));
const depthOf = (t: Topo): number => (typeof t === 'string' ? 0 : 1 + Math.max(...t.map(depthOf)));

const drawHubTree = (ul: HTMLElement) => {
    const topo = parseTopology(ul.dataset.topology || '');
    const items = new Map<string, { y: number; x: number }>();
    ul.querySelectorAll<HTMLElement>(':scope > li[data-key]').forEach(li => items.set(li.dataset.key!, { y: Math.round(li.offsetTop + li.offsetHeight / 2), x: li.offsetLeft }));
    if (items.size === 0 || [...items.values()].some(v => !isFinite(v.y))) return;
    const xEnd = Math.min(...[...items.values()].map(v => v.x));
    const levels = depthOf(topo) + 1; // la racine, puis chaque regroupement
    const step = Math.max(8, Math.floor((xEnd - 4) / (levels + 1)));
    const xAt = (depth: number) => 4 + (depth + 1) * step;
    const lines: { x1: number; y1: number; x2: number; y2: number; keys: string[] }[] = [];
    const place = (t: Topo, depth: number): number => {
        if (typeof t === 'string') return items.get(t)?.y ?? 0;
        const ys = t.map(c => place(c, depth + 1));
        const x = xAt(depth);
        t.forEach((c, k) => lines.push({ x1: x, y1: ys[k], x2: typeof c === 'string' ? xEnd : xAt(depth + 1), y2: ys[k], keys: leavesOf(c) }));
        if (t.length > 1) lines.push({ x1: x, y1: Math.min(...ys), x2: x, y2: Math.max(...ys), keys: leavesOf(t) });
        return Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
    };
    const rootY = place(topo, 0);
    lines.push({ x1: 0, y1: rootY, x2: xAt(0), y2: rootY, keys: leavesOf(topo) }); // tronc d'entrée
    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = ul.querySelector<SVGSVGElement>(':scope > svg.hub-tree-svg');
    if (!svg) { svg = document.createElementNS(svgNS, 'svg') as SVGSVGElement; svg.setAttribute('class', 'hub-tree-svg'); svg.setAttribute('aria-hidden', 'true'); ul.prepend(svg); }
    svg.setAttribute('width', String(xEnd)); svg.setAttribute('height', String(ul.offsetHeight));
    // Traits opaques dans un groupe rendu transparent d'un bloc : aucune surépaisseur aux jonctions.
    // Le chemin survolé est recopié dans un second groupe, au-dessus.
    svg.innerHTML = '<g class="base"></g><g class="hl"></g>';
    const base = svg.querySelector('g.base')!;
    lines.forEach(l => {
        const el = document.createElementNS(svgNS, 'line');
        el.setAttribute('x1', String(l.x1)); el.setAttribute('y1', String(l.y1)); el.setAttribute('x2', String(l.x2)); el.setAttribute('y2', String(l.y2));
        el.dataset.keys = ' ' + l.keys.join(' ') + ' ';
        base.appendChild(el);
    });
    if (ul.dataset.hover) highlightPath(ul, ul.dataset.hover);
};
/** Survol d'un élément : le chemin depuis la racine s'allume. */
const highlightPath = (ul: HTMLElement, key: string | null) => {
    ul.dataset.hover = key || '';
    const hl = ul.querySelector('svg.hub-tree-svg g.hl');
    if (!hl) return;
    hl.innerHTML = '';
    if (!key) return;
    ul.querySelectorAll<SVGLineElement>('svg.hub-tree-svg g.base line').forEach(l => { if ((l.dataset.keys || '').includes(' ' + key + ' ')) hl.appendChild(l.cloneNode()); });
};
const drawAllHubTrees = () => document.querySelectorAll<HTMLElement>('#welcome-overlay ul[data-topology]').forEach(drawHubTree);

/** Premier lancement : aucune trace d'une utilisation précédente (langue, réglages, projets récents). */
const isFirstLaunch = () => {
    try { return ['cladistree_lang', 'cladistree_settings', 'cladistree_recents'].every(k => localStorage.getItem(k) === null); }
    catch { return false; }
};

export function initHub(ctx: AppContext) {
  const { ui } = ctx;
  const closeBtn = document.getElementById('hub-close') as HTMLButtonElement | null;

  /** Affiche le hub ; `returnable` : un document est ouvert derrière (bouton « Retour au document »). */
  const showHub = (returnable: boolean) => {
      const h = hub();
      if (!h) return;
      window.clearTimeout(hideTimer);
      h.classList.remove(HIDING);
      ctx.loadRecentFilesUI();
      if (closeBtn) closeBtn.style.display = returnable ? '' : 'none';
      h.dataset.returnable = returnable ? '1' : '';
      h.style.display = 'flex'; // réaffiché : les animations d'entrée se rejouent
      requestAnimationFrame(drawAllHubTrees);
  };

  // Traits du cladogramme : dessinés une fois la mise en page connue, puis à chaque changement de taille.
  document.querySelectorAll<HTMLElement>('#welcome-overlay ul[data-topology]').forEach(ul => {
      ul.addEventListener('mouseover', (e) => { const li = (e.target as HTMLElement).closest('li[data-key]') as HTMLElement | null; highlightPath(ul, li ? li.dataset.key! : null); });
      ul.addEventListener('mouseleave', () => highlightPath(ul, null));
      ul.addEventListener('focusin', (e) => { const li = (e.target as HTMLElement).closest('li[data-key]') as HTMLElement | null; if (li) highlightPath(ul, li.dataset.key!); });
      ul.addEventListener('focusout', () => highlightPath(ul, null));
      // Différé : redessiner dans le rappel même provoquerait l'erreur « ResizeObserver loop » (voir CLAUDE.md).
      new ResizeObserver(() => requestAnimationFrame(() => drawHubTree(ul))).observe(ul);
  });
  requestAnimationFrame(drawAllHubTrees);
  document.fonts?.ready.then(drawAllHubTrees);

  // Nouveau document à partir d'un modèle : document neuf, puis disposition choisie.
  const layoutButtons: Record<string, HTMLElement | null> = { standard: ui.btnLayoutNormal, comb: ui.btnLayoutComb, chrono: ui.btnLayoutChrono };
  document.querySelectorAll<HTMLButtonElement>('#welcome-overlay [data-template]').forEach(btn => {
      btn.addEventListener('click', () => {
          if (!ctx.createNewTree()) return; // annulé (modifications non enregistrées)
          const mode = btn.dataset.template || 'standard';
          // Chronogramme : sans âge, l'arbre neuf s'empilerait à 0 Ma. Âges d'exemple, à remplacer dans les fiches.
          if (mode === 'chrono') {
              const ages: Record<string, string> = { root: '100', n1: '80', l1: '75-66', l2: '72-0' };
              Object.entries(ages).forEach(([id, age]) => ctx.cy.$id(id).data('period', age));
          }
          layoutButtons[mode]?.click();
          hideHub();
      });
  });
  // Ouvrir : même chemin que Fichier › Ouvrir (le hub se ferme si un fichier est effectivement ouvert).
  document.getElementById('hub-open')?.addEventListener('click', () => ui.btnLoad.click());
  closeBtn?.addEventListener('click', hideHub);
  window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isHubVisible() && hub()?.dataset.returnable === '1') { e.preventDefault(); e.stopPropagation(); hideHub(); }
  }, true);
  document.getElementById('btn-hub')?.addEventListener('click', () => showHub(true));

  // Langue au premier lancement : l'interface est construite dans la langue courante, d'où le
  // rechargement si l'autre langue est choisie (rien n'est encore ouvert à ce moment-là).
  const langPanel = document.getElementById('hub-lang');
  const showLanguageChooser = () => { if (langPanel) langPanel.style.display = 'flex'; };
  langPanel?.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
          const lang = btn.dataset.lang as Lang;
          const changed = lang !== currentLang;
          setLang(lang); // mémorisé : le choix n'est plus proposé
          if (changed) location.reload();
          else if (langPanel) langPanel.style.display = 'none';
      });
  });
  if (isFirstLaunch()) showLanguageChooser();
  (window as any)._hubShowLanguageChooser = showLanguageChooser; // test de fumée

  return { showHub, hideHub };
}
