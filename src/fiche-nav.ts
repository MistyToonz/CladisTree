// ==========================================
// NAVIGATION D'UNE FICHE À L'AUTRE (← / → et boutons de l'en-tête de la fiche)
// ==========================================
// Pour remplir rapidement les fiches : passer à celle du taxon terminal précédent / suivant, dans l'ordre
// vertical de l'arbre affiché (tree-utils › adjacentTerminal ; depuis une divergence : premier terminal de son
// clade, ou dernier terminal avant lui). La sélection du canevas suit, et la vue glisse si le taxon est caché.
//
// Les flèches du clavier ne le font que si la fiche est ouverte ET que la souris pointe dessus : sur le
// canevas, ← / → gardent leur sens habituel (parent / enfant). Pendant une saisie dans un champ, elles
// déplacent le curseur du texte (keyboard.ts n'appelle handleFicheArrow qu'en dehors des champs).
// Changer de fiche ne perd rien : les champs s'enregistrent à l'événement `change`, déclenché quand ils
// perdent le focus (clic sur un bouton ← / →).

import { state } from './graph-state';
import { adjacentTerminal, panIntoView } from './tree-utils';
import type { AppContext } from './app-context';

export function initFicheNav(ctx: AppContext) {
  const { cy, ui } = ctx;
  const panel = ui.sidePanel;
  const prevBtn = document.getElementById('fiche-prev') as HTMLButtonElement | null;
  const nextBtn = document.getElementById('fiche-next') as HTMLButtonElement | null;
  const navBox = document.getElementById('fiche-nav');

  let pointerInPanel = false;
  panel.addEventListener('mouseenter', () => { pointerInPanel = true; });
  panel.addEventListener('mouseleave', () => { pointerInPanel = false; });

  const isOpen = () => !panel.style.transform.includes('100%');
  /** Taxon de la fiche affichée (pas une boîte, toujours dans le graphe). */
  const current = () => {
      const n = state.activeNode;
      return n && n.length > 0 && n.inside() && !n.hasClass('box') ? n : null;
  };
  const neighbour = (dir: 1 | -1) => {
      const n = current();
      return n && n.visible() ? adjacentTerminal(cy, state.currentRootId, n, dir) : null;
  };

  /** Met à jour les boutons (appelé à chaque ouverture de fiche, cf. side-panel.ts). */
  const updateFicheNav = () => {
      const n = current();
      if (navBox) navBox.style.display = n ? 'flex' : 'none';
      if (!n) return;
      if (prevBtn) prevBtn.disabled = !neighbour(-1);
      if (nextBtn) nextBtn.disabled = !neighbour(1);
  };

  const go = (dir: 1 | -1) => {
      const next = neighbour(dir);
      if (!next) return;
      cy.$(':selected').unselect();
      next.select();
      ctx.openSidePanelForNode(next);
      panIntoView(cy, next, panel.offsetWidth);
  };
  prevBtn?.addEventListener('click', () => go(-1));
  nextBtn?.addEventListener('click', () => go(1));

  /** ← / → avec la souris sur la fiche ouverte. Renvoie vrai si la touche est prise en charge ici. */
  const handleFicheArrow = (e: KeyboardEvent): boolean => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return false;
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
      if (!pointerInPanel || !isOpen() || !current()) return false;
      e.preventDefault();
      go(e.key === 'ArrowRight' ? 1 : -1);
      return true;
  };

  return { handleFicheArrow, updateFicheNav };
}
