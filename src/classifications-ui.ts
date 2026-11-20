// ==========================================
// FICHE : CLASSIFICATIONS ALTERNATIVES DE LA FEUILLE (phase 3)
// ==========================================
// Visible seulement dans la fiche d'une RACINE DE FEUILLE (racine de l'arbre ou nœud « nouvelle
// feuille ») : menu des classifications, « + Ajouter une classification alternative » (copie de
// l'active), renommer, supprimer. La logique est dans sheet-variants.ts (fonctions pures sur le
// document) ; ici on enregistre l'état de Cytoscape dans la session, on applique l'opération, puis on
// recharge la vue composée. L'historique d'annulation est alors vidé (comme à l'ouverture d'un fichier) :
// il ne peut pas suivre une opération faite sur le document hors de Cytoscape.
//
// Garde-fous : Suppr sur une feuille imbriquée placée par une autre classification propose de la
// retirer de la classification ACTIVE seulement (contenu conservé) ; retirer une feuille qui a des
// classifications demande confirmation (seule l'active est gardée).

import { state, stateManager } from './graph-state';
import { t } from './i18n';
import { commitFromCy, applyDocument, currentDocument } from './doc-session';
import { listVariants, addVariant, switchVariant, renameVariant, deleteVariant, dropSheetVariants, detachFromComposition, placedByInactiveVariant, duplicateTaxa } from './sheet-variants';
import { isTreeRoot, findTreeRootId } from './tree-utils';
import { PhyloDoc } from './doc-model';
import type { AppContext } from './app-context';

const fmt = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export function initSheetClassifications(ctx: AppContext) {
  const { cy, ui } = ctx;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const box = $('sheet-classification');
  const select = $<HTMLSelectElement>('sheet-variant-select');
  const nameInput = $<HTMLInputElement>('sheet-variant-name');
  const warning = $('sheet-variant-warning');
  let rootNodeId: string | null = null;

  const isSheetRootNode = (n: any) => !!n && n.length > 0 && !n.hasClass('box') && (!!n.data('hasNewSheet') || isTreeRoot(n));
  const activeTreeOf = (doc: PhyloDoc) => doc.trees.find(tr => tr.id === doc.activeTreeId) || doc.trees[0];
  const taxonName = (doc: PhyloDoc, tid: string) => String((doc.taxa[tid]?.fields as any)?.name || tid);

  /** Enregistre Cytoscape dans la session, applique `op` au document, recharge la vue composée. */
  const apply = (op: (doc: PhyloDoc) => PhyloDoc, reopenId?: string) => {
      const doc = op(commitFromCy(cy, state.currentRootId));
      const { elements } = applyDocument(doc);
      cy.startBatch();
      cy.elements().remove();
      cy.add(elements as any);
      if (cy.$id(state.currentRootId).length === 0) state.currentRootId = findTreeRootId(cy);
      cy.endBatch();
      ctx.refreshLayout(true);
      stateManager.resetStacks();
      ctx.setUnsavedState(true);
      const n = reopenId ? cy.$id(reopenId) : null;
      if (n && n.length > 0) { state.activeNode = n; ctx.openSidePanelForNode(n); }
  };

  /** Appelé à l'ouverture de la fiche (side-panel.ts). */
  const renderSheetClassification = (n: any) => {
      if (!box) return;
      if (!isSheetRootNode(n)) { box.style.display = 'none'; rootNodeId = null; return; }
      const doc = commitFromCy(cy, state.currentRootId); // attribue aussi un taxon aux nœuds créés depuis l'ouverture
      if (!activeTreeOf(doc).nodes[n.id()]?.taxonId) { box.style.display = 'none'; rootNodeId = null; return; }
      rootNodeId = n.id();
      box.style.display = 'block';
      if (nameInput) nameInput.style.display = 'none';
      if (select) {
          select.style.display = '';
          select.innerHTML = '';
          listVariants(doc, n.id()).forEach(v => {
              const o = document.createElement('option');
              o.value = v.id; o.textContent = v.name; o.selected = v.active;
              select.appendChild(o);
          });
      }
      const del = $<HTMLButtonElement>('sheet-variant-delete');
      if (del) del.disabled = listVariants(doc, n.id()).length < 2;
      const dups = duplicateTaxa(activeTreeOf(doc));
      if (warning) {
          warning.style.display = dups.length ? 'block' : 'none';
          warning.textContent = dups.length ? `⚠ ${t('variant.duplicates')} ${dups.slice(0, 4).map(tid => taxonName(doc, tid)).join(', ')}${dups.length > 4 ? '…' : ''}` : '';
      }
  };

  select?.addEventListener('change', () => {
      if (!rootNodeId || !select.value) return;
      const id = rootNodeId, target = select.value;
      apply(doc => switchVariant(doc, id, target), id);
  });
  $('sheet-variant-add')?.addEventListener('click', () => {
      if (!rootNodeId) return;
      const id = rootNodeId;
      apply(doc => addVariant(doc, id).doc, id);
  });
  $('sheet-variant-delete')?.addEventListener('click', () => {
      if (!rootNodeId || !select || !select.value) return;
      const name = select.options[select.selectedIndex]?.text || '';
      if (!confirm(fmt(t('variant.confirm_delete'), { name }))) return;
      const id = rootNodeId, target = select.value;
      apply(doc => deleteVariant(doc, id, target), id);
  });
  // Renommer : champ à la place du menu ; Entrée ou sortie du champ valide, Échap annule.
  $('sheet-variant-rename')?.addEventListener('click', () => {
      if (!rootNodeId || !select || !nameInput) return;
      nameInput.value = select.options[select.selectedIndex]?.text || '';
      select.style.display = 'none';
      nameInput.style.display = '';
      nameInput.focus(); nameInput.select();
  });
  const commitRename = (save: boolean) => {
      if (!rootNodeId || !select || !nameInput || nameInput.style.display === 'none') return;
      nameInput.style.display = 'none';
      select.style.display = '';
      if (!save || !nameInput.value.trim()) return;
      const id = rootNodeId, target = select.value, name = nameInput.value;
      // Pas de changement de structure : on met seulement le document de la session à jour.
      applyDocument(renameVariant(commitFromCy(cy, state.currentRootId), id, target, name));
      ctx.setUnsavedState(true);
      renderSheetClassification(cy.$id(id));
  };
  nameInput?.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Enter') commitRename(true);
      if (e.key === 'Escape') commitRename(false);
  });
  nameInput?.addEventListener('blur', () => commitRename(true));

  // --- Garde-fou : Suppr sur une feuille imbriquée qu'une autre classification place.
  // Appelé par le gestionnaire de Suppr de keyboard.ts AVANT toute suppression (appel direct : un
  // écouteur concurrent dépendrait de l'ordre de déclenchement des événements). Renvoie true si la
  // suppression a été prise en charge ici (ou annulée) : keyboard.ts ne doit alors rien supprimer.
  const interceptNestedSheetDeletion = (): boolean => {
      const tree = activeTreeOf(currentDocument());
      if (!tree.sheetVariants) return false;
      const protectedNodes = cy.$('node:selected').not('.box').filter((n: any) => n.data('hasNewSheet') && placedByInactiveVariant(tree, n.id()));
      if (protectedNodes.length === 0) return false;
      const names = protectedNodes.map((n: any) => n.data('name')).join(', ');
      if (!confirm(fmt(t('variant.confirm_detach'), { name: names }))) return true;
      const ids = protectedNodes.map((n: any) => n.id());
      apply(doc => ids.reduce((d: PhyloDoc, id: string) => detachFromComposition(d, id), doc));
      return true;
  };

  // --- Garde-fou : retirer une feuille qui a des classifications alternatives.
  document.getElementById('cmenu-sheet-remove')?.addEventListener('click', (e) => {
      const n = state.activeNode;
      if (!n || n.hasClass('box')) return;
      const doc = commitFromCy(cy, state.currentRootId);
      const tid = activeTreeOf(doc).nodes[n.id()]?.taxonId;
      const entry = tid ? activeTreeOf(doc).sheetVariants?.[tid] : undefined;
      if (!entry || !tid) return;
      if (!confirm(fmt(t('variant.confirm_remove_sheet'), { n: entry.variants.length }))) {
          e.stopImmediatePropagation();
          ui.contextMenu.style.display = 'none';
          return;
      }
      applyDocument(dropSheetVariants(doc, tid)); // la suite (retrait de la feuille) : gestionnaire habituel
  }, true);

  return { renderSheetClassification, interceptNestedSheetDeletion };
}
