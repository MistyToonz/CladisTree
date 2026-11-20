// ==========================================
// ROMÉROGRAMME (chronogramme sculpté, phase 3)
// ==========================================
// En mode chronogramme, les clades d'un niveau choisi (1 = enfants de la racine de la feuille) sont
// remplacés par des FUSEAUX : l'épaisseur verticale à un âge donné est le nombre de leurs taxons
// terminaux présents à cet âge (intervalle « début-fin », ou âge ponctuel compté dans sa tranche).
// L'ossature de l'arbre (ancêtres des clades) reste dessinée en chronogramme ; chaque fuseau commence
// à la divergence de son clade. Les fuseaux sont des nœuds Cytoscape de forme polygonale (classe
// `romer-spindle`) : affichage seul, jamais enregistrés (doc-session.ts les ignore), mais présents
// dans les exports. Même axe du temps que le chronogramme (chrono-axis.ts), échelles non linéaires comprises.
//
// Trois temps (refreshLayout, renderer.ts) :
//   1. `planRomer` après la mise en page : quels clades, leur profil, leur hauteur (indépendante des positions) ;
//   2. `romerReserve` : hauteur de chaque fuseau, réservée par la mise en page du chronogramme À LA PLACE des
//      lignes de ses taxons cachés (layout-engine.ts) — les fuseaux restent serrés comme des taxons voisins,
//      quel que soit le nombre de taxons qu'ils contiennent ; mise en page refaite si la réservation a changé ;
//   3. `drawRomer` : fuseaux centrés sur le nœud de leur clade.

import { t } from './i18n';
import type { AppContext } from './app-context';
import { chronoEdgeStyle, CHRONO_STYLE_SCRATCH, CHRONO_TRUNK_SCRATCH } from './chrono-axis';

/** depth : 1, 2, 3 = clades de ce niveau sous la racine de la feuille ; 0 = clades CHOISIS (`romerClade`). */
export type RomerSettings = { enabled: boolean; depth: number; step: number /* Ma ; 0 = automatique */ };
export const romerSettings: RomerSettings = { enabled: false, depth: 1, step: 0 };

/** Nombre écrit après le nom du fuseau. */
export type RomerCount = 'none' | 'max' | 'total' | 'both';
/** Disposition des fuseaux (bouton « Disposition »), retenue sur ce poste. */
export type RomerLayout = {
    thickness: number;            // px par taxon présent au même moment
    gap: number;                  // px entre deux fuseaux voisins
    font: number;                 // taille du nom (px) ; 0 = automatique (selon la hauteur du fuseau)
    count: RomerCount;
    labelPos: 'inside' | 'right'; // nom dans le fuseau, ou à sa droite
    shape: RomerShape;            // contour anguleux (profil par tranches) ou lissé
    colors: RomerColors;
    color: string;                // couleur unique (colors = 'single')
    opacity: number;              // remplissage, en %
    outline: 'none' | 'same' | 'ink'; // contour : aucun, couleur du fuseau, encre du thème
    outlineW: number;             // épaisseur du contour (px)
};
export type RomerShape = 'polygon' | 'smooth' | 'smoother';
export type RomerColors = 'varied' | 'soft' | 'single' | 'branch';
export const ROMER_LAYOUT_DEFAULTS: RomerLayout = {
    thickness: 24, gap: 16, font: 0, count: 'max', labelPos: 'inside',
    shape: 'polygon', colors: 'varied', color: '#56B4E9', opacity: 55, outline: 'same', outlineW: 1,
};
const LAYOUT_KEY = 'cladistree.romerLayout';
const loadLayout = (): RomerLayout => {
    try {
        const raw = JSON.parse(localStorage.getItem(LAYOUT_KEY) || 'null');
        if (raw && typeof raw === 'object') return { ...ROMER_LAYOUT_DEFAULTS, ...raw };
    } catch { /* stockage indisponible ou illisible : valeurs par défaut */ }
    return { ...ROMER_LAYOUT_DEFAULTS };
};
export const romerLayout: RomerLayout = loadLayout();
const saveLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(romerLayout)); } catch { /* sans stockage : réglage de la session */ } };

/** Palette des fuseaux (couleurs distinctes, lisibles sur fond clair ou sombre avec opacité). */
const PALETTE = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00', '#CC79A7', '#999999'];
/** Mêmes teintes, adoucies (« Couleurs douces »). */
const SOFT_PALETTE = ['#F2C879', '#A4D3F0', '#7FCDB4', '#F5EFA0', '#7FA9D1', '#EBA77F', '#E5B5D1', '#C7C7C7'];
const NICE_STEPS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];

const parseMa = (v: string) => parseFloat(v.replace(',', '.'));
/** Intervalle [plus ancien, plus récent] d'un taxon d'après son champ « période », ou null. */
export const ageRange = (period: unknown): [number, number] | null => {
    const p = String(period || '');
    const r = p.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
    if (r) { const a = parseMa(r[1]), b = parseMa(r[2]); return isFinite(a) && isFinite(b) ? [Math.max(a, b), Math.min(a, b)] : null; }
    const s = p.match(/([\d.,]+)/);
    if (s) { const a = parseMa(s[1]); return isFinite(a) ? [a, a] : null; }
    return null;
};

/** Pas de temps « rond » pour ~40 tranches sur l'étendue donnée. */
export const autoStep = (span: number) => NICE_STEPS.find(s => span / s <= 40) || NICE_STEPS[NICE_STEPS.length - 1];

/**
 * Profil de diversité : nombre de taxons présents par tranche, de l'origine (âge le plus ancien) au plus récent.
 * Fonction pure, testable sans Cytoscape.
 */
export const diversityProfile = (origin: number, ranges: [number, number][], step: number): { old: number; young: number; count: number }[] => {
    const youngest = Math.min(...ranges.map(r => r[1]));
    const bins: { old: number; young: number; count: number }[] = [];
    for (let old = origin; old > youngest + 1e-9; old -= step) {
        const young = Math.max(youngest, old - step);
        const count = ranges.filter(([s, e]) => (s === e ? (s <= old && s > young) || (young === youngest && s === young) : s > young && e < old)).length;
        bins.push({ old, young, count });
    }
    return bins;
};

/** Hauteur d'un fuseau : `max` taxons présents au même moment, `thickness` px chacun. */
export const spindleHeight = (max: number, thickness: number) => Math.max(8, max * Math.max(2, thickness));

/**
 * Texte du fuseau : nom puis, entre parenthèses, la diversité maximale (« max. 12 » = au plus 12 taxons présents
 * au même moment, endroit le plus épais) et/ou le nombre de taxons terminaux du clade (« 34 taxons »).
 */
export const romerLabelText = (name: string, max: number, total: number, count: RomerCount): string => {
    const maxTxt = t('romer.label_max').replace('%n', String(max));
    const totalTxt = t(total === 1 ? 'romer.label_total_one' : 'romer.label_total').replace('%n', String(total));
    const extra = count === 'max' ? maxTxt : count === 'total' ? totalTxt : count === 'both' ? `${totalTxt}, ${maxTxt}` : '';
    return extra ? `${name} (${extra})` : name;
};

/** Taille du nom : choisie, ou lisible à l'échelle du fuseau (un fuseau couvre souvent des centaines de Ma). */
export const romerFontSize = (height: number, font: number) => (font > 0 ? font : Math.round(Math.max(14, Math.min(64, height * 0.35))));

/** Règle de style des fuseaux (une fois) : la forme, les couleurs et le contour viennent des données du nœud. */
let styled = false;
const ensureRomerStyle = (cy: any) => {
    if (styled) return;
    styled = true;
    cy.style().selector('.romer-spindle').style({
        'shape': 'polygon', 'shape-polygon-points': (n: any) => n.data('romerPoints'),
        'width': 'data(romerW)', 'height': 'data(romerH)',
        'background-color': 'data(romerColor)', 'background-opacity': 'data(romerOpacity)',
        // Opacité explicite : la règle générale des nœuds la met à 0 (bordure jamais visible sinon).
        // Bordure INTÉRIEURE : Cytoscape (3.x) plante en calculant l'encombrement d'une bordure centrée ou extérieure
        // sur un polygone à points personnalisés (forme pas encore enregistrée : « hasMiterBounds » de undefined) ;
        // de plus, le fuseau garde ainsi exactement la hauteur réservée par la mise en page.
        'border-width': 'data(romerBorderW)', 'border-color': 'data(romerBorderColor)', 'border-opacity': 1, 'border-style': 'solid', 'border-position': 'inside',
        'label': 'data(romerLabel)', 'text-valign': 'center', 'text-halign': 'data(romerHAlign)', 'text-margin-x': 'data(romerTextX)',
        'font-size': 'data(romerFont)', 'font-style': 'italic', 'font-weight': 'bold', 'color': '#000000',
        'text-outline-color': '#ffffff', 'text-outline-width': 2, 'z-index': 8, 'z-index-compare': 'manual', 'events': 'no',
    }).update();
};

/**
 * Profil lissé : interpolation cubique MONOTONE (Fritsch-Carlson) entre les points du profil — courbe sans
 * dépassement (jamais plus épaisse que la tranche la plus peuplée, jamais négative). `pts` : [x, épaisseur], x croissants.
 */
export const smoothProfile = (pts: number[][], perPx = 4, maxPoints = 1500): number[][] => {
    const n = pts.length;
    if (n < 3) return pts;
    const m: number[] = [];
    for (let i = 0; i < n - 1; i++) m.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
    const tg: number[] = [m[0]];
    for (let i = 1; i < n - 1; i++) tg.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
    tg.push(m[n - 2]);
    for (let i = 0; i < n - 1; i++) {
        if (m[i] === 0) { tg[i] = 0; tg[i + 1] = 0; continue; }
        const a = tg[i] / m[i], b = tg[i + 1] / m[i], h = a * a + b * b;
        if (h > 9) { const k = 3 / Math.sqrt(h); tg[i] = k * a * m[i]; tg[i + 1] = k * b * m[i]; }
    }
    // Points par segment : un tous les `perPx` px, au plus 12, et au total ~maxPoints sur toute la longueur.
    const span = pts[n - 1][0] - pts[0][0];
    const density = Math.min(1, maxPoints / Math.max(1, span / perPx));
    const out: number[][] = [pts[0]];
    for (let i = 0; i < n - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], dx = x1 - x0;
        const steps = Math.max(1, Math.min(12, Math.round((dx / perPx) * density)));
        for (let k = 1; k <= steps; k++) {
            const u = k / steps, u2 = u * u, u3 = u2 * u;
            const y = (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * dx * tg[i] + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * dx * tg[i + 1];
            out.push([x0 + u * dx, Math.max(0, y)]);
        }
    }
    return out;
};
/** « Très arrondi » : moyenne glissante (1/4, 1/2, 1/4) du profil avant lissage ; la pointe d'origine et la fin restent. */
export const softenProfile = (pts: number[][], floor: number): number[][] =>
    pts.map((p, i) => (i === 0 || i === pts.length - 1 ? p : [p[0], Math.max(floor, 0.25 * pts[i - 1][1] + 0.5 * p[1] + 0.25 * pts[i + 1][1])]));

/** Retire les fuseaux (avant chaque mise en page : ils sont recalculés). */
export const removeRomer = (cy: any) => {
    cy.remove('.romer-spindle');
    // Rétablit exactement ce que le romérogramme a masqué (la mise en page suivante fait le reste).
    const hidden = cy.scratch('_romerHidden');
    if (hidden) { hidden.filter((e: any) => e.inside()).removeStyle('display'); cy.removeScratch('_romerHidden'); }
    const unlabeled = cy.scratch('_romerUnlabeled');
    if (unlabeled) { unlabeled.filter((e: any) => e.inside()).removeStyle('text-opacity'); cy.removeScratch('_romerUnlabeled'); }
};

/** Un fuseau à dessiner : tout sauf l'ordonnée, connue après la mise en page. */
export type RomerPlan = {
    clade: any; inner: any; isLeaf: boolean; index: number;
    bins: { old: number; young: number; count: number }[]; max: number; total: number; step: number;
    x0: number; x1: number; height: number;
    xOf: (age: number) => number;   // âge → abscisse (axe du chronogramme)
};

/**
 * Clades sculptés et leur profil. À appeler APRÈS une mise en page du chronogramme (visibilité à jour) ;
 * ne dépend pas des ordonnées.
 * @param ageToX conversion âge → abscisse du chronogramme en cours
 */
export const planRomer = (cy: any, rootId: string, ageToX: (age: number) => number): RomerPlan[] => {
    const root = cy.$id(rootId);
    if (root.length === 0) return [];
    const kidsOf = (n: any) => n.outgoers('node').not('.box, .romer-spindle').filter((c: any) => c.visible());
    let level: any;
    if (romerSettings.depth === 0) {
        // Clades CHOISIS par l'utilisateur (bouton « Fuseau : sélection ») visibles sur la feuille ; un clade
        // choisi à l'intérieur d'un autre clade choisi est compté dans celui-ci.
        const shown = root.union(root.successors('node')).not('.box, .romer-spindle').filter((n: any) => n.visible());
        const chosen = shown.filter((n: any) => !!n.data('romerClade'));
        level = chosen.filter((n: any) => n.predecessors('node').intersection(chosen).length === 0);
    } else {
        // Clades du niveau demandé (au-delà, les feuilles restent des feuilles).
        level = kidsOf(root);
        for (let d = 1; d < romerSettings.depth; d++) {
            const next = level.filter((n: any) => kidsOf(n).length > 0).map((n: any) => kidsOf(n));
            if (next.length === 0) break;
            level = cy.collection().union(level.filter((n: any) => kidsOf(n).length === 0)).union(next.reduce((a: any, b: any) => a.union(b), cy.collection()));
        }
    }
    const plans: RomerPlan[] = [];
    level.forEach((clade: any, i: number) => {
        const inner = clade.successors('node').not('.box, .romer-spindle').filter((n: any) => n.visible());
        // Un taxon terminal (ex. le taxon le plus basal, seul à côté d'un clade) forme son propre fuseau,
        // d'épaisseur 1, s'il est daté par un intervalle ; un âge ponctuel reste dessiné normalement.
        const isLeaf = inner.length === 0;
        const leaves = isLeaf ? clade : inner.filter((n: any) => kidsOf(n).length === 0);
        const ranges = leaves.map((n: any) => ageRange(n.data('period'))).filter((r: any) => r) as [number, number][];
        if (ranges.length === 0) return;                // clade non daté : dessiné normalement
        const own = ageRange(clade.data('period'));
        const origin = Math.max(own ? own[0] : -Infinity, ...ranges.map(r => r[0]));
        const span = origin - Math.min(...ranges.map(r => r[1]));
        // Pas choisi, mais au plus ~400 tranches (un pas de 1 Ma sur 4 000 Ma donnerait un contour énorme).
        const step = Math.max(romerSettings.step > 0 ? romerSettings.step : autoStep(Math.max(span, 1e-6)), span / 400);
        const bins = diversityProfile(origin, ranges, step);
        const max = Math.max(...bins.map(b => b.count));
        // Aucune étendue temporelle (ex. feuilles toutes actuelles « 0 », clade non daté) ou personne :
        // rien à sculpter, le clade est dessiné normalement.
        if (bins.length === 0 || !(max > 0)) return;
        plans.push({
            clade, inner, isLeaf, index: i, bins, max, total: leaves.length, step,
            x0: ageToX(origin), x1: ageToX(bins[bins.length - 1].young),
            height: spindleHeight(max, romerLayout.thickness), xOf: ageToX,
        });
    });
    return plans;
};

/** Hauteurs à réserver dans la mise en page (identifiant du clade → px) et écart entre fuseaux. */
export type RomerReserve = { heights: Map<string, number>; gap: number };
export const romerReserve = (plans: RomerPlan[]): RomerReserve =>
    ({ heights: new Map(plans.map(p => [p.clade.id(), p.height])), gap: Math.max(0, romerLayout.gap) });
export const sameReserve = (a: RomerReserve | null, b: RomerReserve): boolean =>
    !!a && a.gap === b.gap && a.heights.size === b.heights.size && [...b.heights].every(([k, v]) => a.heights.get(k) === v);

/** Encre du thème (contour « encre ») ; noir hors navigateur. */
const inkColor = (): string => {
    try { return getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000'; } catch { return '#000000'; }
};

/** Dessine les fuseaux planifiés, centrés sur le nœud de leur clade (positions de la mise en page). */
export const drawRomer = (cy: any, plans: RomerPlan[]): number => {
    const added: any[] = [];
    let toHide = cy.collection(), toUnlabel = cy.collection();
    const L = romerLayout;
    const ink = L.outline === 'ink' ? inkColor() : '';
    plans.forEach(p => {
        const { clade, inner, isLeaf, bins, max, height } = p;
        // Centré sur le nœud du clade : le fuseau prolonge la branche qui y arrive.
        const yMid = clade.position('y');
        // Le fuseau est la donnée de la figure : il commence à son origine RÉELLE (âge propre du clade ou plus ancien
        // de ses taxons), jamais déformé pour rejoindre l'arbre. C'est la branche qui le rejoint (voir plus bas) :
        // un clade sans âge propre est placé ≥ 1 Ma avant son plus ancien taxon (layout-engine.ts).
        const xStart = p.x0;
        const xEnd = Math.max(p.x1, xStart + 4);
        // Profil en px : [x, épaisseur relative]. Origine en pointe, puis le milieu de chaque tranche, puis la fin.
        // Une tranche sans taxon connu à l'intérieur de la durée du clade garde un COL fin : le clade persiste
        // de son origine à sa dernière occurrence (sinon le fuseau se brise en morceaux séparés).
        const neck = 0.3 / max;
        const thick = (count: number) => (count > 0 ? count / max : neck);
        let prof: number[][] = [[xStart, 0]];
        bins.forEach(b => { const x = p.xOf((b.old + b.young) / 2); if (x > prof[prof.length - 1][0] + 0.01) prof.push([x, thick(b.count)]); });
        if (xEnd > prof[prof.length - 1][0] + 0.01) prof.push([xEnd, thick(bins[bins.length - 1].count)]);
        if (L.shape === 'smoother') prof = softenProfile(prof, neck);
        if (L.shape !== 'polygon') prof = smoothProfile(prof);
        const width = xEnd - xStart, cx = (xStart + xEnd) / 2;
        const top = prof.map(([x, h]) => [(2 * (x - cx)) / width, -Math.min(1, h)]);
        const bottom = top.slice().reverse().map(([x, y]) => [x, -y]);
        const points = [...top, ...bottom].map(([x, y]) => `${x.toFixed(4)} ${y.toFixed(4)}`).join(' ');

        // Masquage différé : appliqué seulement une fois TOUS les fuseaux calculés (pas d'état à moitié fait).
        toHide = toHide.union(inner).union(clade.outgoers('edge').filter((e: any) => e.visible())); // déjà masqué : laissé tel quel (sinon removeRomer l'afficherait)
        if (!isLeaf) toUnlabel = toUnlabel.union(clade); // le nom du clade est porté par le fuseau (un terminal garde le sien et sa barre)
        // Branche du clade prolongée horizontalement jusqu'à la pointe du fuseau (tronc et coudes inchangés).
        // Le scratch de style est retiré : la mise en page suivante repose le style d'origine (romérogramme coupé…).
        const cx0 = clade.position('x');
        if (!isLeaf && xStart > cx0 + 0.5) {
            clade.incomers('edge').filter((e: any) => e.visible()).forEach((e: any) => {
                const trunk = e.scratch(CHRONO_TRUNK_SCRATCH);
                if (typeof trunk !== 'number') return;
                const sp = e.source().position();
                e.style(chronoEdgeStyle(sp.x, sp.y, xStart, yMid, trunk, xStart - cx0));
                e.removeScratch(CHRONO_STYLE_SCRATCH);
            });
        }
        const branch = clade.data('branch');
        const color = L.colors === 'single' ? L.color
            : L.colors === 'soft' ? SOFT_PALETTE[p.index % SOFT_PALETTE.length]
            : L.colors === 'branch' && branch && branch.color ? branch.color
            : PALETTE[p.index % PALETTE.length];
        const right = L.labelPos === 'right';
        added.push({
            group: 'nodes', classes: 'romer-spindle', selectable: false, grabbable: false,
            data: { id: `romer-${clade.id()}`, romerOf: clade.id(), romerMax: max, romerTotal: p.total, romerStep: p.step,
                    romerPoints: points, romerW: width, romerH: height, romerColor: color,
                    romerOpacity: Math.max(0, Math.min(100, L.opacity)) / 100,
                    romerBorderW: L.outline === 'none' ? 0 : Math.max(0.5, L.outlineW), romerBorderColor: L.outline === 'ink' ? ink : color,
                    romerLabel: isLeaf ? '' : romerLabelText(clade.data('name') || '', max, p.total, L.count),
                    romerFont: romerFontSize(height, L.font),
                    romerHAlign: right ? 'right' : 'center', romerTextX: right ? 8 : 0 },
            position: { x: cx, y: yMid },
        });
    });
    if (added.length) {
        ensureRomerStyle(cy);
        toHide.style('display', 'none'); cy.scratch('_romerHidden', toHide);
        // Opacité et non `label: ''` : Cytoscape ignore une étiquette vide posée en surcharge.
        toUnlabel.style('text-opacity', 0); cy.scratch('_romerUnlabeled', toUnlabel);
        cy.add(added);
    }
    return added.length;
};

/** Groupe « Romérogramme » de l'onglet Arbre (visible en mode chronogramme). */
export function initRomerUI(ctx: AppContext) {
  const toggle = document.getElementById('romer-toggle') as HTMLButtonElement | null;
  const depth = document.getElementById('romer-depth') as HTMLSelectElement | null;
  const step = document.getElementById('romer-step') as HTMLSelectElement | null;
  const pick = document.getElementById('romer-pick') as HTMLButtonElement | null;
  const layoutBtn = document.getElementById('romer-layout') as HTMLButtonElement | null;
  const refresh = () => {
      if (toggle) {
          toggle.classList.toggle('active', romerSettings.enabled);
          toggle.title = romerSettings.enabled ? t('romer.on_title') : t('romer.title');
      }
      if (depth) depth.disabled = !romerSettings.enabled;
      if (step) step.disabled = !romerSettings.enabled;
      if (layoutBtn) layoutBtn.disabled = !romerSettings.enabled;
      if (depth) depth.value = String(romerSettings.depth);
      if (!romerSettings.enabled) closePanel();
  };
  // « Fuseau : sélection » : marque (ou démarque, si tous le sont déjà) les taxons sélectionnés comme
  // clades du romérogramme, passe en mode « clades choisis » et affiche les fuseaux. Enregistré (style du nœud).
  pick?.addEventListener('click', () => {
      const sel = ctx.cy.$('node:selected').not('.box, .romer-spindle');
      if (sel.length === 0) { alert(t('romer.pick_none')); return; }
      ctx.saveState();
      const allChosen = sel.every((n: any) => !!n.data('romerClade'));
      sel.forEach((n: any) => { if (allChosen) n.removeData('romerClade'); else n.data('romerClade', true); });
      ctx.setUnsavedState(true);
      romerSettings.depth = 0;
      romerSettings.enabled = true;
      refresh();
      ctx.refreshLayout();
  });
  toggle?.addEventListener('click', () => { romerSettings.enabled = !romerSettings.enabled; refresh(); ctx.refreshLayout(true); });
  depth?.addEventListener('change', () => { const v = parseInt(depth.value, 10); romerSettings.depth = isFinite(v) ? v : 1; ctx.refreshLayout(); });
  step?.addEventListener('change', () => { romerSettings.step = parseFloat(step.value) || 0; ctx.refreshLayout(); });

  // --- Disposition : panneau flottant sous le bouton (épaisseur, écart, nom, nombre) ---
  let panel: HTMLDivElement | null = null;
  let relayout: ReturnType<typeof setTimeout> | undefined;
  const apply = () => { saveLayout(); clearTimeout(relayout); relayout = setTimeout(() => ctx.refreshLayout(), 120); };
  function closePanel() {
      if (!panel) return;
      panel.remove(); panel = null;
      document.removeEventListener('mousedown', onOutside, true);
      document.removeEventListener('keydown', onEsc, true);
  }
  const onOutside = (e: MouseEvent) => { if (panel && !panel.contains(e.target as Node) && e.target !== layoutBtn) closePanel(); };
  const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); closePanel(); } };
  const selectStyle = 'padding:3px 6px; font-size:12px; border-radius:3px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);';
  const openPanel = () => {
      if (!layoutBtn) return;
      const fontOpts = [0, 10, 12, 14, 18, 24, 32, 48, 64].map(v => `<option value="${v}">${v === 0 ? t('romer.font_auto') : v + ' px'}</option>`).join('');
      panel = document.createElement('div');
      panel.id = 'romer-layout-panel';
      panel.style.cssText = 'position:fixed; z-index:2000; width:300px; max-height:calc(100vh - 20px); overflow-y:auto; padding:12px 14px; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); box-shadow:var(--panel-shadow); font-size:12px; display:grid; grid-template-columns:auto 1fr; gap:8px 10px; align-items:center;';
      const sec = (key: string) => `<div style="grid-column:1 / -1; font-weight:bold; text-transform:uppercase; letter-spacing:1px; font-size:11px; opacity:0.7; margin-top:4px;">${t(key)}</div>`;
      const range = (id: string, min: number, max: number, stepV: number) =>
          `<span style="display:flex; align-items:center; gap:6px;"><input type="range" id="${id}" min="${min}" max="${max}" step="${stepV}" style="flex:1; min-width:0;"><span id="${id}-val" style="min-width:38px; text-align:right;"></span></span>`;
      panel.innerHTML = `
          ${sec('romer.sec_shape')}
          <label for="romer-thickness">${t('romer.thickness')}</label>${range('romer-thickness', 4, 60, 1)}
          <label for="romer-gap">${t('romer.gap')}</label>${range('romer-gap', 0, 120, 2)}
          <label for="romer-shape">${t('romer.shape')}</label>
          <select id="romer-shape" style="${selectStyle}"><option value="polygon">${t('romer.shape_polygon')}</option><option value="smooth">${t('romer.shape_smooth')}</option><option value="smoother">${t('romer.shape_smoother')}</option></select>
          ${sec('romer.sec_style')}
          <label for="romer-colors">${t('romer.colors')}</label>
          <span style="display:flex; align-items:center; gap:6px;"><select id="romer-colors" style="${selectStyle} flex:1; min-width:0;">
              <option value="varied">${t('romer.colors_varied')}</option><option value="soft">${t('romer.colors_soft')}</option>
              <option value="single">${t('romer.colors_single')}</option><option value="branch">${t('romer.colors_branch')}</option>
          </select><input type="color" id="romer-color" style="width:30px; height:24px; padding:0; border:1px solid var(--border-color); background:none; cursor:pointer;"></span>
          <label for="romer-opacity">${t('romer.opacity')}</label>${range('romer-opacity', 10, 100, 5)}
          <label for="romer-outline">${t('romer.outline')}</label>
          <select id="romer-outline" style="${selectStyle}"><option value="none">${t('romer.outline_none')}</option><option value="same">${t('romer.outline_same')}</option><option value="ink">${t('romer.outline_ink')}</option></select>
          <label for="romer-outlinew">${t('romer.outline_width')}</label>${range('romer-outlinew', 0.5, 6, 0.5)}
          ${sec('romer.sec_name')}
          <label for="romer-font">${t('romer.font')}</label>
          <select id="romer-font" style="${selectStyle}">${fontOpts}</select>
          <label for="romer-labelpos">${t('romer.label_pos')}</label>
          <select id="romer-labelpos" style="${selectStyle}"><option value="inside">${t('romer.label_inside')}</option><option value="right">${t('romer.label_right')}</option></select>
          <label for="romer-count">${t('romer.count')}</label>
          <select id="romer-count" style="${selectStyle}">
              <option value="max">${t('romer.count_max')}</option><option value="total">${t('romer.count_total')}</option>
              <option value="both">${t('romer.count_both')}</option><option value="none">${t('romer.count_none')}</option>
          </select>
          <div style="grid-column:1 / -1; opacity:0.75; line-height:1.4;">${t('romer.count_help')}</div>
          <div style="grid-column:1 / -1; text-align:right;"><button class="ribbon-btn" id="romer-layout-reset">${t('romer.layout_reset')}</button></div>`;
      document.body.appendChild(panel);
      const r = layoutBtn.getBoundingClientRect();
      panel.style.top = Math.round(Math.max(8, Math.min(r.bottom + 6, window.innerHeight - panel.offsetHeight - 8))) + 'px';
      panel.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - panel.offsetWidth - 8))) + 'px';

      const q = <T extends HTMLElement>(id: string) => panel!.querySelector('#' + id) as T;
      const thick = q<HTMLInputElement>('romer-thickness'), gap = q<HTMLInputElement>('romer-gap');
      const font = q<HTMLSelectElement>('romer-font'), pos = q<HTMLSelectElement>('romer-labelpos'), count = q<HTMLSelectElement>('romer-count');
      const shape = q<HTMLSelectElement>('romer-shape'), colors = q<HTMLSelectElement>('romer-colors'), color = q<HTMLInputElement>('romer-color');
      const opacity = q<HTMLInputElement>('romer-opacity'), outline = q<HTMLSelectElement>('romer-outline'), outlineW = q<HTMLInputElement>('romer-outlinew');
      const fill = () => {
          thick.value = String(romerLayout.thickness); q('romer-thickness-val').textContent = romerLayout.thickness + ' px';
          gap.value = String(romerLayout.gap); q('romer-gap-val').textContent = romerLayout.gap + ' px';
          shape.value = romerLayout.shape; colors.value = romerLayout.colors; color.value = romerLayout.color;
          color.style.display = romerLayout.colors === 'single' ? '' : 'none';
          opacity.value = String(romerLayout.opacity); q('romer-opacity-val').textContent = romerLayout.opacity + ' %';
          outline.value = romerLayout.outline; outlineW.value = String(romerLayout.outlineW); q('romer-outlinew-val').textContent = romerLayout.outlineW + ' px';
          outlineW.disabled = romerLayout.outline === 'none';
          // Taille hors liste (réglage d'une version future) : ajoutée pour rester affichée.
          if (![...font.options].some(o => o.value === String(romerLayout.font))) font.add(new Option(romerLayout.font + ' px', String(romerLayout.font)));
          font.value = String(romerLayout.font); pos.value = romerLayout.labelPos; count.value = romerLayout.count;
      };
      fill();
      thick.addEventListener('input', () => { romerLayout.thickness = parseInt(thick.value, 10) || ROMER_LAYOUT_DEFAULTS.thickness; fill(); apply(); });
      gap.addEventListener('input', () => { romerLayout.gap = Math.max(0, parseInt(gap.value, 10) || 0); fill(); apply(); });
      font.addEventListener('change', () => { romerLayout.font = parseInt(font.value, 10) || 0; apply(); });
      pos.addEventListener('change', () => { romerLayout.labelPos = pos.value === 'right' ? 'right' : 'inside'; apply(); });
      count.addEventListener('change', () => { romerLayout.count = count.value as RomerCount; apply(); });
      shape.addEventListener('change', () => { romerLayout.shape = shape.value as RomerShape; apply(); });
      colors.addEventListener('change', () => { romerLayout.colors = colors.value as RomerColors; fill(); apply(); });
      color.addEventListener('input', () => { romerLayout.color = color.value; apply(); });
      opacity.addEventListener('input', () => { romerLayout.opacity = parseInt(opacity.value, 10) || ROMER_LAYOUT_DEFAULTS.opacity; fill(); apply(); });
      outline.addEventListener('change', () => { romerLayout.outline = outline.value as RomerLayout['outline']; fill(); apply(); });
      outlineW.addEventListener('input', () => { romerLayout.outlineW = parseFloat(outlineW.value) || ROMER_LAYOUT_DEFAULTS.outlineW; fill(); apply(); });
      q('romer-layout-reset').addEventListener('click', () => { Object.assign(romerLayout, ROMER_LAYOUT_DEFAULTS); fill(); apply(); });
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onEsc, true);
  };
  layoutBtn?.addEventListener('click', () => { if (panel) closePanel(); else openPanel(); });
  refresh();
}
