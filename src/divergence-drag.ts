// ==========================================
// MODE « GLISSER LES DIVERGENCES » (phase 3) — à activer depuis l'onglet Arbre, jamais automatique
// ==========================================
// Une divergence est un nœud qui a des descendants visibles. Dans ce mode, la glisser horizontalement
// la déplace le long de la branche qui y mène :
//   - cladogramme (mode standard) : décalage `branchOffset` (px) propre à la classification ; tout le
//     sous-arbre suit. La divergence reste à droite de la barre verticale de son parent ;
//   - chronogramme : l'axe horizontal EST le temps, donc on modifie l'ÂGE du nœud (champ « période »),
//     borné entre l'âge du parent et celui du plus ancien enfant. Fonctionne sur toutes les échelles
//     (linéaire comprimée, racine, log, rang) : l'âge est retrouvé en inversant l'axe par dichotomie ;
//   - peigne : sans effet (la mise en page aligne déjà les feuilles).
// Pendant ce mode, le glisser-déposer habituel (rattacher un clade à un autre parent) est suspendu.
// Raccourci G : déplace la divergence sélectionnée (souris, sans bouton enfoncé), sans activer le mode.

import { state } from './graph-state';
import { t } from './i18n';
import { EARTH_AGE } from './chrono-data';
import { MIN_BRANCH_GAP, MIN_BRANCH_OFFSET, CHRONO_TRUNK_GAP } from './layout-engine';
import { toast } from './visual';
import type { AppContext } from './app-context';


/** Événement partagé par les modes d'outil exclusifs (pinceau, divergences). */
export const TOOL_MODE_EVENT = 'cladistree:tool-mode';

type DragState = { node: any; startX: number; startY: number; minX: number; maxX: number; followers: { node: any; dx: number }[] };

export function initDivergenceDrag(ctx: AppContext) {
  const { cy } = ctx;
  const toggleBtn = document.getElementById('tree-divergence-toggle') as HTMLButtonElement | null;

  const visibleKids = (n: any) => n.outgoers('node').not('.box').filter((c: any) => c.visible() && c.id() !== 'ghost-node');
  const isDivergence = (n: any) => !n.hasClass('box') && n.id() !== 'ghost-node' && visibleKids(n).length > 0;
  const usable = () => state.layoutMode === 'standard' || state.layoutMode === 'chrono';

  const setMode = (on: boolean) => {
      state.divergenceMode = on;
      if (toggleBtn) {
          toggleBtn.classList.toggle('active', on);
          toggleBtn.title = on ? t('divergence.mode_on_title') : t('divergence.mode_title');
      }
      const app = document.getElementById('app');
      if (app) app.style.cursor = on ? 'ew-resize' : '';
      if (on) window.dispatchEvent(new CustomEvent(TOOL_MODE_EVENT, { detail: 'divergence' }));
  };
  window.addEventListener(TOOL_MODE_EVENT, (e: Event) => { if ((e as CustomEvent).detail !== 'divergence' && state.divergenceMode) setMode(false); });
  toggleBtn?.addEventListener('click', () => setMode(!state.divergenceMode));
  window.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Escape' && state.divergenceMode) setMode(false); });

  /** Âge correspondant à une abscisse du chronogramme (axe décroissant avec l'âge), par dichotomie. */
  const xToAge = (x: number): number => {
      let young = 0, old = EARTH_AGE;
      for (let i = 0; i < 60; i++) {
          const mid = (young + old) / 2;
          if (ctx.chronoAgeToX(mid) > x) young = mid; else old = mid;
      }
      return (young + old) / 2;
  };
  const leftEdge = (n: any) => { const w = n.data('cWidth') || 0; return w > 2 ? n.position('x') - w / 2 : n.position('x'); };

  let drag: DragState | null = null;

  /**
   * Prépare le déplacement d'une divergence : bornes et nœuds qui suivent. null si le nœud ne peut pas bouger.
   * Bornes : la divergence reste à droite de la barre verticale de son parent, avec un bout de branche
   * horizontal (sinon la branche repart vers la gauche et passe sous la barre) ; en chronogramme, elle reste
   * aussi plus vieille que ses enfants. Une divergence déjà plus proche (ancien fichier, âges) peut rester où elle est.
   */
  const beginMove = (n: any): DragState | null => {
      if (!usable() || !isDivergence(n) || n.id() === state.currentRootId) return null;
      const parent = n.incomers('node').not('.box').first();
      if (parent.length === 0) return null;
      const p = n.position();
      let minX: number, maxX: number;
      if (state.layoutMode === 'chrono') {
          // Barre du parent à CHRONO_TRUNK_GAP de lui au minimum ; bout horizontal de 6 px au-delà.
          minX = Math.min(p.x, parent.position('x') + CHRONO_TRUNK_GAP + 6);
          maxX = Math.min(...visibleKids(n).map(leftEdge)) - 1;                 // plus vieux que ses enfants
      } else {
          const parentRight = parent.position('x') + (parent.data('renderWidth') || 1) / 2;
          minX = Math.min(p.x, parentRight + MIN_BRANCH_GAP + (n.data('renderWidth') || 1) / 2);
          maxX = Infinity;
      }
      if (!(maxX > minX)) return null;
      // En cladogramme, le sous-arbre suit pendant le glissement (aperçu) ; en chronogramme les âges des enfants ne bougent pas.
      const followers = state.layoutMode === 'chrono' ? [] : n.successors('node').not('.box').map((d: any) => ({ node: d, dx: d.position('x') - p.x }));
      return { node: n, startX: p.x, startY: p.y, minX, maxX, followers };
  };
  /** Place la divergence en cours de déplacement (abscisse bornée), le long de sa branche seulement. */
  const moveTo = (d: DragState, rawX: number) => {
      const x = Math.max(d.minX, Math.min(d.maxX, rawX));
      d.node.position({ x, y: d.startY });
      d.followers.forEach(f => f.node.position({ x: x + f.dx, y: f.node.position('y') }));
  };
  /** Enregistre la nouvelle place (âge en chronogramme, décalage en cladogramme) ; remet tout en place si `commit` est faux. */
  const finishMove = (d: DragState, commit: boolean) => {
      const x = d.node.position('x');
      const dx = x - d.startX;
      if (!commit || Math.abs(dx) < 0.5) { ctx.refreshLayout(); return; }
      ctx.saveState();
      if (state.layoutMode === 'chrono') {
          const age = Math.round(xToAge(x) * 100) / 100;
          const period = String(d.node.data('period') || '');
          const range = period.match(/^\s*[\d.,]+\s*-\s*([\d.,]+)\s*$/);
          d.node.data('period', range ? `${age}-${range[1]}` : String(age));
      } else {
          const offset = Math.max(MIN_BRANCH_OFFSET, (d.node.data('branchOffset') || 0) + dx);
          if (Math.abs(offset) < 0.5) d.node.removeData('branchOffset'); else d.node.data('branchOffset', Math.round(offset));
      }
      ctx.setUnsavedState(true);
      ctx.refreshLayout();
  };

  // --- À la souris, dans le mode « glisser les divergences »
  cy.on('grab', 'node', (e: any) => {
      drag = null;
      if (!state.divergenceMode || grab) return;
      const n = e.target;
      drag = beginMove(n);
      // Cytoscape déplace toute la sélection : on ne garde que le nœud saisi.
      if (drag) cy.nodes(':selected').not(n).unselect();
  });

  cy.on('drag', 'node', (e: any) => {
      if (!drag || e.target.id() !== drag.node.id()) return;
      moveTo(drag, e.target.position('x'));
  });

  cy.on('free', 'node', (e: any) => {
      if (!drag || e.target.id() !== drag.node.id()) return;
      const d = drag; drag = null;
      finishMove(d, true);
  });

  // --- Au clavier : G sur la divergence sélectionnée, sans activer le mode. La divergence suit la souris
  // (sans bouton enfoncé) ; clic gauche ou Entrée valide, Échap ou clic droit annule.
  let grab: { d: DragState; clientX: number } | null = null;
  let lastClientX = 0;
  let swallowContextMenu = false;
  let grabHintShown = false;
  window.addEventListener('mousemove', (e: MouseEvent) => {
      lastClientX = e.clientX;
      if (grab) moveTo(grab.d, grab.d.startX + (e.clientX - grab.clientX) / cy.zoom());
  });
  const endGrab = (commit: boolean) => {
      if (!grab) return;
      const g = grab; grab = null;
      const app = document.getElementById('app');
      if (app) app.style.cursor = state.divergenceMode ? 'ew-resize' : '';
      finishMove(g.d, commit);
  };
  // Phase de capture : le clic qui valide ne doit pas atteindre Cytoscape (sélection, déplacement de la vue).
  window.addEventListener('mousedown', (e: MouseEvent) => {
      if (!grab) return;
      e.preventDefault(); e.stopPropagation();
      if (e.button === 2) swallowContextMenu = true;
      endGrab(e.button === 0);
  }, true);
  window.addEventListener('contextmenu', (e: MouseEvent) => {
      if (!swallowContextMenu) return;
      swallowContextMenu = false; e.preventDefault(); e.stopPropagation();
  }, true);

  /**
   * Appelé en tête du gestionnaire clavier (keyboard.ts) : G démarre la saisie ; pendant la saisie, Entrée
   * valide, Échap annule et les autres touches sont ignorées. Renvoie vrai si la touche est prise en charge ici.
   */
  const handleGrabKey = (e: KeyboardEvent): boolean => {
      if (grab) {
          e.preventDefault();
          if (e.key === 'Enter') endGrab(true);
          else if (e.key === 'Escape') endGrab(false);
          return true;
      }
      if (e.key.toLowerCase() !== 'g' || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return false;
      const el = document.activeElement as HTMLElement | null;
      if (ctx.isEditing || (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable))) return false;
      e.preventDefault();
      const sel = cy.$('node:selected').not('.box');
      const d = sel.length === 1 ? beginMove(sel[0]) : null;
      if (!d) { toast(t('divergence.grab_need'), '', 'info'); return true; }
      grab = { d, clientX: lastClientX };
      const app = document.getElementById('app');
      if (app) app.style.cursor = 'ew-resize';
      if (!grabHintShown) { grabHintShown = true; toast(t('divergence.grab_on'), '', 'info', 2400); } // une fois par session
      return true;
  };

  /** Remet les divergences à leur place calculée : la sélection, ou toute la feuille si rien n'est sélectionné. */
  document.getElementById('tree-divergence-reset')?.addEventListener('click', () => {
      const sel = cy.$('node:selected').not('.box');
      const scope = sel.length > 0 ? sel : cy.nodes('.taxon');
      const touched = scope.filter((n: any) => n.data('branchOffset') !== undefined);
      if (touched.length === 0) return;
      ctx.saveState();
      touched.forEach((n: any) => n.removeData('branchOffset'));
      ctx.refreshLayout();
  });

  return { setDivergenceMode: setMode, handleGrabKey };
}
