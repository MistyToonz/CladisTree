// ==========================================
// ANNOTATIONS DE L'ARBRE : SURLIGNAGE DES NOMS ET PINCEAU DES BRANCHES (phase 3)
// ==========================================
// Les deux appartiennent à la classification (TreeNode.highlight / TreeNode.branch, voir doc-model.ts),
// pas à la fiche du taxon : ils ne concernent que le dessin de l'arbre.
//   - Surlignage : fond coloré derrière le NOM sur l'arbre (text-background de Cytoscape, donc présent
//     dans les exports PNG/JPEG/PDF/SVG). Ctrl+H bascule le surlignage de la sélection.
//   - Pinceau : couleur (et épaisseur) de la branche qui ARRIVE sur un nœud. Mode pinceau activable :
//     clic sur une branche = cette branche ; clic sur un NOM = tout le clade (le nœud et ses descendants,
//     coloration monophylétique) ; Maj+clic sur un nom = sa seule branche.
//     « Peindre la sélection » applique la couleur aux branches des nœuds sélectionnés.
//     Dessin (refreshBranchPaint) : tant que les frères d'un nœud peint ne le sont pas tous, seul le
//     DERNIER segment (horizontal, jusqu'au nœud) prend la couleur ; quand tous les enfants d'un parent
//     sont peints, le chemin entier (coude et trait vertical partagés) est peint, épaisseur comprise.
//     Le dernier segment seul = dégradé à arrêt net calé sur le dernier coude de l'arête : le dégradé
//     de Cytoscape va de l'extrémité source à l'extrémité cible, et le tracé en coudes est monotone dans
//     cette direction, donc tout ce qui suit le coude (et seulement cela) est au-delà de l'arrêt.
//
// Les règles de style sont ajoutées EN FIN de feuille de style et réappliquées après chaque
// changement de thème (applyTheme ajoute ses propres règles « edge » qui, sinon, les masqueraient).

import { t } from './i18n';
import { TOOL_MODE_EVENT } from './divergence-drag';
import type { AppContext } from './app-context';

export type BranchStyle = { color: string; width?: number };

/** Règles Cytoscape des annotations, à (ré)appliquer après toute règle générale de couleur. */
export const reapplyAnnotationStyles = (cy: any) => {
    cy.style()
        .selector('.taxon[highlight]:unselected').style({
            'text-background-color': 'data(highlight)', 'text-background-opacity': 0.85,
            'text-background-shape': 'roundrectangle', 'text-background-padding': '3px',
        })
        .selector('edge[branchColor]').style({ 'line-color': 'data(branchColor)' })
        .selector('edge[branchWidth]').style({ 'width': 'data(branchWidth)' })
        .selector('edge[supportLabel]').style({
            'target-label': 'data(supportLabel)', 'target-text-offset': 22, 'font-size': 11, 'color': '#555555',
            'text-background-color': '#ffffff', 'text-background-opacity': 0.8, 'text-background-padding': '1px',
        })
        .update();
};

const GRADIENT_PROPS = 'line-fill line-gradient-stop-colors line-gradient-stop-positions';
const paintOf = (n: any): BranchStyle | null => { const b = n.data('branch'); return b && b.color ? b : null; };
const toHex = (c: string) => {
    const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : String(c);
};

/** Fraction de l'arête (de la source à la cible) où commence son dernier segment : le dernier coude. */
const cornerFraction = (edge: any) => {
    const s = edge.sourceEndpoint(), e = edge.targetEndpoint();
    const pts = edge.segmentPoints() || [];
    const dx = e.x - s.x, dy = e.y - s.y, len2 = dx * dx + dy * dy;
    let p = 0;
    if (pts.length && len2 > 1e-6) { const c = pts[pts.length - 1]; p = ((c.x - s.x) * dx + (c.y - s.y) * dy) / len2; }
    return Math.min(1, Math.max(0, p));
};
/** Dernier segment seulement : dégradé à arrêt net au dernier coude (couleur de base = celle de l'arête). */
const lastSegmentOnly = (edge: any, color: string) => {
    const base = toHex(edge.style('line-color'));
    const at = (cornerFraction(edge) * 100).toFixed(3) + '%';
    edge.style({ 'line-fill': 'linear-gradient', 'line-gradient-stop-colors': `${base} ${base} ${color} ${color}`, 'line-gradient-stop-positions': `0% ${at} ${at} 100%` });
};

/**
 * Dessine le pinceau sur toutes les arêtes. À appeler après chaque mise en page (les positions des coudes
 * changent, et la mise en page standard efface les styles posés sur les arêtes) et après chaque peinture.
 */
export const refreshBranchPaint = (cy: any) => {
    const fullParent = new Map<string, boolean>(); // parent → tous ses enfants sont peints
    const allKidsPainted = (parent: any) => {
        const id = parent.id();
        if (!fullParent.has(id)) fullParent.set(id, parent.outgoers('node').not('.box, .romer-spindle').every((c: any) => !!paintOf(c)));
        return fullParent.get(id)!;
    };
    cy.batch(() => {
        const previous = cy.scratch('_paintPartial') || cy.collection();
        let partial = cy.collection();
        // Données écrites seulement si elles changent : sur un grand arbre, réécrire (ou retirer) une donnée sur
        // chaque arête faisait recalculer le style de toutes les arêtes à chaque mise en page.
        const setOrRemove = (edge: any, key: string, value: any) => {
            if (value !== undefined && value !== null) { if (edge.data(key) !== value) edge.data(key, value); }
            else if (edge.data(key) !== undefined) edge.removeData(key);
        };
        cy.edges().forEach((edge: any) => {
            const b = paintOf(edge.target());
            const full = !!b && allKidsPainted(edge.source());
            setOrRemove(edge, 'branchColor', b && full ? b.color : null);
            setOrRemove(edge, 'branchWidth', b && full && b.width ? b.width : null);
            if (!b || full || edge.style('display') === 'none') return;
            lastSegmentOnly(edge, b.color);
            partial = partial.union(edge);
        });
        previous.difference(partial).filter((e: any) => e.inside()).removeStyle(GRADIENT_PROPS);
        cy.scratch('_paintPartial', partial);
    });
};

// ---------- Aperçu du pinceau (survol) ----------
// Affiche en bleu ce que le clic va peindre, avec les mêmes règles que la peinture réelle (dernier
// segment seul, ou chemin entier quand tous les enfants d'un parent seront peints). Uniquement des styles
// posés sur les arêtes (jamais de données) : ni le document ni l'historique ne sont touchés.
export const BRUSH_PREVIEW_COLOR = '#2196F3';
const PREVIEW_PROPS = 'line-color line-fill line-gradient-stop-colors line-gradient-stop-positions width';
export const clearBrushPreview = (cy: any) => {
    const prev = cy.scratch('_paintPreview');
    if (!prev) return;
    cy.removeScratch('_paintPreview');
    prev.filter((e: any) => e.inside()).removeStyle(PREVIEW_PROPS);
    refreshBranchPaint(cy); // rétablit les dégradés réels effacés par l'aperçu
};
export const previewBrush = (cy: any, nodes: any, width?: number) => {
    clearBrushPreview(cy);
    if (!nodes || nodes.length === 0) return;
    const ids = new Set<string>(nodes.map((n: any) => n.id()));
    const painted = (n: any) => ids.has(n.id()) || !!paintOf(n);
    // Arêtes concernées : celles qui mènent aux nœuds visés, et celles de leurs frères (chemin entier possible).
    let edges = cy.collection();
    nodes.forEach((n: any) => { edges = edges.union(n.incomers('edge')).union(n.incomers('node').outgoers('edge')); });
    cy.batch(() => {
        edges.forEach((edge: any) => {
            if (edge.style('display') === 'none') return;
            const target = edge.target();
            const full = edge.source().outgoers('node').not('.box, .romer-spindle').every(painted);
            if (ids.has(target.id())) {
                if (full) edge.style({ 'line-fill': 'solid', 'line-color': BRUSH_PREVIEW_COLOR, ...(width ? { width } : {}) });
                else lastSegmentOnly(edge, BRUSH_PREVIEW_COLOR);
            } else if (full && paintOf(target)) {
                // Frère déjà peint : le clic va prolonger sa couleur sur tout le chemin.
                const b = paintOf(target)!;
                edge.style({ 'line-fill': 'solid', 'line-color': b.color, ...(b.width ? { width: b.width } : {}) });
            }
        });
    });
    cy.scratch('_paintPreview', edges);
};

/** Valeur de support du nœud recopiée sur l'arête qui y arrive (le dessin du pinceau : refreshBranchPaint). */
const syncEdge = (edge: any) => {
    // Valeur de support (bootstrap, probabilité…) du nœud : affichée près de lui, sur sa branche.
    const sup = edge.target().data('support');
    // Valeur entre crochets (TNT : groupe contredit par un groupe plus fréquent) : affichée « [19] ».
    if (sup && sup.value !== undefined && sup.value !== '') edge.data('supportLabel', sup.bracketed ? `[${sup.value}]` : String(sup.value)); else edge.removeData('supportLabel');
};

export function initAnnotations(ctx: AppContext) {
  const { cy } = ctx;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

  reapplyAnnotationStyles(cy);
  // Redessin du pinceau regroupé (une fois par image) : après un ajout d'arête (ouverture, collage, greffe,
  // annulation) ou un déplacement de nœuds (glisser, divergences). refreshLayout l'appelle aussi directement.
  let pending = false;
  const schedulePaint = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; refreshBranchPaint(cy); });
  };
  cy.on('add', 'edge', (e: any) => { syncEdge(e.target); schedulePaint(); });
  cy.on('position', 'node', schedulePaint);
  cy.edges().forEach(syncEdge);
  refreshBranchPaint(cy);

  const selectedTaxa = () => cy.$('node:selected').not('.box');

  // --- Surlignage
  const highlightColor = () => $<HTMLInputElement>('style-highlight-color')?.value || '#FFF176';
  const setHighlight = (nodes: any, color: string | null) => {
      if (nodes.length === 0) return;
      ctx.saveState();
      nodes.forEach((n: any) => { if (color) n.data('highlight', color); else n.removeData('highlight'); });
  };
  /** Ctrl+H : surligne la sélection, ou retire le surlignage si toute la sélection est déjà surlignée. */
  const toggleHighlight = () => {
      const nodes = selectedTaxa();
      if (nodes.length === 0) return;
      const allOn = nodes.every((n: any) => !!n.data('highlight'));
      setHighlight(nodes, allOn ? null : highlightColor());
  };
  $('style-highlight-apply')?.addEventListener('click', () => setHighlight(selectedTaxa(), highlightColor()));
  $('style-highlight-clear')?.addEventListener('click', () => setHighlight(selectedTaxa(), null));
  window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'h' || e.altKey) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ctx.isEditing) return;
      e.preventDefault();
      toggleHighlight();
  });

  // --- Pinceau
  const brush = (): BranchStyle => {
      const width = parseFloat($<HTMLSelectElement>('style-brush-width')?.value || '');
      return { color: $<HTMLInputElement>('style-brush-color')?.value || '#E53935', ...(isFinite(width) && width !== 2 ? { width } : {}) };
  };
  /** Applique (ou retire, si style = null) le style de branche aux nœuds donnés, en une seule annulation. */
  const paint = (nodes: any, style: BranchStyle | null) => {
      const targets = nodes.filter((n: any) => !n.hasClass('box') && n.incomers('edge').length > 0);
      if (targets.length === 0) return;
      ctx.saveState();
      targets.forEach((n: any) => { if (style) n.data('branch', { ...style }); else n.removeData('branch'); });
      refreshBranchPaint(cy);
  };
  let brushOn = false;
  const toggleBtn = $<HTMLButtonElement>('style-brush-toggle');
  const setBrushMode = (on: boolean) => {
      brushOn = on;
      if (toggleBtn) {
          toggleBtn.classList.toggle('active', on);
          toggleBtn.title = on ? t('brush.mode_on_title') : t('brush.mode_title');
      }
      const app = $('app');
      if (app) app.style.cursor = on ? 'crosshair' : '';
      if (!on) clearBrushPreview(cy);
      if (on) window.dispatchEvent(new CustomEvent(TOOL_MODE_EVENT, { detail: 'brush' }));
  };
  window.addEventListener(TOOL_MODE_EVENT, (e: Event) => { if ((e as CustomEvent).detail !== 'brush' && brushOn) setBrushMode(false); });
  toggleBtn?.addEventListener('click', () => setBrushMode(!brushOn));
  $('style-brush-selection')?.addEventListener('click', () => paint(selectedTaxa(), brush()));
  $('style-brush-clear')?.addEventListener('click', () => paint(selectedTaxa(), null));
  // Clic en mode pinceau : sur une branche = cette branche ; sur un nom = tout le clade (monophylétique) ;
  // Maj+clic sur un nom = sa seule branche.
  /** Nœuds visés par le pinceau pour un élément sous le pointeur (même règle au survol et au clic). */
  const brushTargets = (el: any, shift: boolean) => {
      const node = el.isEdge() ? el.target() : el;
      if (node.hasClass('box') || node.hasClass('romer-spindle')) return null;
      const clade = el.isNode() && !shift;
      return clade ? node.union(node.successors('node')).not('.box, .romer-spindle') : node;
  };
  cy.on('tap', 'node, edge', (e: any) => {
      if (!brushOn) return;
      const targets = brushTargets(e.target, !!(e.originalEvent && e.originalEvent.shiftKey));
      if (!targets) return;
      clearBrushPreview(cy);
      paint(targets, brush());
  });
  // Aperçu au survol : la ou les branches qui vont être peintes, en bleu.
  cy.on('mouseover', 'node, edge', (e: any) => {
      if (!brushOn) return;
      const targets = brushTargets(e.target, !!(e.originalEvent && e.originalEvent.shiftKey));
      previewBrush(cy, targets ? targets.filter((n: any) => n.incomers('edge').length > 0) : null, brush().width);
  });
  cy.on('mouseout', 'node, edge', () => { if (brushOn) clearBrushPreview(cy); });
  // Échap quitte le mode pinceau.
  window.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && brushOn) setBrushMode(false); });

  return { toggleHighlight, setBrushMode };
}
