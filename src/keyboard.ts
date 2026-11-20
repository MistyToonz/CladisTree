// ==========================================
// RACCOURCIS CLAVIER
// ==========================================
// Gestionnaire unique des touches : Échap, F11, recherche, couper/copier/coller, annuler/rétablir,
// enregistrer, création et navigation dans l'arbre, repli, édition.
// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de
// l'application passent par `ctx` (voir app-context.ts), résolues au moment de l'appel.

import { state } from './graph-state';
import { EMPTY_DATA } from './config';
import { t } from './i18n';
import { isTreeRoot, findTreeRootId, isShownTerminal, adjacentTerminal, panIntoView } from './tree-utils';
import type { AppContext } from './app-context';

export function initKeyboard(ctx: AppContext) {
  const { ui, cy } = ctx;

  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName; 

    // Déplacement au clavier d'une divergence (G, divergence-drag.ts) : Échap / Entrée / autres touches pendant la saisie.
    if (ctx.handleGrabKey(e)) return;

    if (e.key === 'Escape') {
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        (document.activeElement as HTMLElement).blur();
      }
      if (ui.sidePanel.style.display === 'block') {
        ctx.closeSidePanel();
      }
      return; 
    }

    if (e.key === 'F11') {
      e.preventDefault();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn("Erreur de plein écran :", err);
        });
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) { 
      if (e.key === ' ') { 
          const currentSelection = cy.nodes(':selected'); 
          
          if (currentSelection.length > 0 && !currentSelection[0].hasClass('box')) {
              const node = currentSelection[0];

              if (node.data('hasNewSheet') && node.id() !== state.currentRootId) { 
                  e.preventDefault(); 
                  state.currentRootId = node.id(); 
                  ctx.refreshLayout(true); 
                  ctx.closeSidePanel(); 
                  return; 
              } 

              if (node.id() === state.currentRootId && !isTreeRoot(node)) {
                  e.preventDefault();
                  const incoming = node.incomers('node');
                  if (incoming.length > 0) {
                      const parentNode = incoming.first();
                      state.currentRootId = ctx.getSheetRootForNode(parentNode);
                      ctx.refreshLayout(true);
                      ctx.closeSidePanel();
                      
                      cy.$(':selected').unselect();
                      node.select();
                      setTimeout(() => cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 }), 50);
                  }
                  return;
              }
          } 
      }
      
      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        cy.nodes().filter((n: any) => !n.hasClass('box') && n.visible()).select();
        ctx.updateCounters();
        return;
      }
      
      if (e.key.toLowerCase() === 'f') { 
        e.preventDefault(); 
        const selectedAll = cy.$('node:selected');
        
        if (e.shiftKey && selectedAll.length === 1 && !selectedAll[0].hasClass('box')) {
            ctx.saveState(); 
            selectedAll[0].data('hasNewSheet', true); 
            ctx.refreshLayout();
            return;
        }
        if (selectedAll.length === 1) {
           ctx.openSidePanelForNode(selectedAll[0]);
        } else {
           ui.searchInput.focus(); 
        }
        return; 
      }
      
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        ctx.executeSave(false);
        return;
      }

      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        ui.btnLoad.click();
        return;
      }
    }

    if (ctx.isEditing || activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

    // Fiche ouverte et souris sur la fiche : ← / → passent à la fiche du taxon terminal voisin (fiche-nav.ts).
    if (ctx.handleFicheArrow(e)) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); ctx.undo(); return; }
      if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); ctx.redo(); return; }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); ctx.redo(); return; }
    }

    const selected = cy.$('node:selected');
    
    if (selected.length > 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const node = selected[0]; 
      if (!node.hasClass('box')) {
        if (e.key === 'ArrowLeft') { const parents = node.incomers('node'); if (parents.length > 0) { e.preventDefault(); node.unselect(); parents.first().select(); } }
        if (e.key === 'ArrowRight') { if (!node.data('hasNewSheet')) { const children = node.outgoers('node').filter((n:any)=>!n.hasClass('box')); if (children.length > 0) { e.preventDefault(); node.unselect(); const sortedChildren = children.toArray().sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)); sortedChildren[0].select(); } } }
        // Dendrogramme : les taxons terminaux sont tous alignés, ↑ / ↓ passe de l'un à l'autre, même d'un clade à l'autre.
        if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && state.layoutMode === 'comb' && isShownTerminal(node)) {
          e.preventDefault();
          const next = adjacentTerminal(cy, state.currentRootId, node, e.key === 'ArrowDown' ? 1 : -1);
          if (next) { node.unselect(); next.select(); panIntoView(cy, next); }
          return;
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const incomers = node.incomers('node'); const siblingsArray = incomers.length === 0 ? cy.nodes().roots().toArray() : incomers[0].outgoers('node').filter((n:any)=>!n.hasClass('box')).toArray(); siblingsArray.sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)); const currentIndex = siblingsArray.findIndex((n: any) => n.id() === node.id()); if (e.key === 'ArrowUp' && currentIndex > 0) { node.unselect(); siblingsArray[currentIndex - 1].select(); } else if (e.key === 'ArrowDown' && currentIndex < siblingsArray.length - 1) { node.unselect(); siblingsArray[currentIndex + 1].select(); } }
      }
    }

    if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        ctx.createNewTree();
        return;
      }

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'x') { if (selected.length > 0 && !selected[0].hasClass('box')) { e.preventDefault(); ctx.cutClade(selected[0]); } return; }
      if (e.key.toLowerCase() === 'c') { 
          if (selected.length > 0 && !selected[0].hasClass('box')) { 
              e.preventDefault(); 
              ctx.copyClade(selected[0]);  // interne + système (Newick, document complet pour une autre fenêtre)
          } 
          return; 
      }
      if (e.key.toLowerCase() === 'v') { 
          if (selected.length > 0 && !selected[0].hasClass('box')) { 
              e.preventDefault(); 
              // Presse-papiers du système d'abord (clade CladisTree, Newick) ; sinon comportement habituel.
              ctx.pasteFromSystem(selected[0]).then(handled => (handled ? null : navigator.clipboard.readText())).then((text: string | null) => {
                  if (text === null) return;
                  if (text && text.trim() !== '') {
                      ctx.saveState(); 
                      const node = selected[0]; 
                      const parentId = node.id(); 
                      const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
                      const nodeData = { ...EMPTY_DATA, id: newId, name: text.trim(), parent: node.data('parent') || null, extinct: false, isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: Date.now() };
                      const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]);  
                      
                      const newNode = added.filter('node');
                      ctx.propagateBoxMembership(node, newNode.toArray());
                      ctx.checkAutoRank(newNode[0]); 

                      cy.nodes().unselect(); newNode.select();
                      if (node.data('hasNewSheet')) { state.currentRootId = node.id(); ctx.refreshLayout(true); } else if (node.data('collapsed')) { ctx.toggleCollapse(node); } else { ctx.refreshLayout(); } 
                      cy.animate({ center: { eles: newNode } }, { duration: 250 });
                  } 
                  else if (state.clipboard) {
                      ctx.pasteClade(selected[0]);
                  }
              }).catch(() => {
                  if (state.clipboard) ctx.pasteClade(selected[0]);
              });
          } 
          return; 
      }
      if (e.key === ' ') { if (selected.length > 0 && !selected[0].hasClass('box') && selected[0].outgoers('node').length > 0) { e.preventDefault(); ctx.toggleCollapse(selected[0]); } return; }
      
      if (e.key === 'Enter') { 
        if (selected.length === 1 && !selected[0].hasClass('box')) { 
          e.preventDefault(); const node = selected[0]; if (node.id() === state.currentRootId || isTreeRoot(node)) return;
          const incomingEdges = node.incomers('edge'); 
          if (incomingEdges.length > 0) { 
            ctx.saveState(); const parentId = incomingEdges[0].data('source'); cy.remove(incomingEdges[0]);
            const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
            const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: false, isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: node.data('sortIndex') };
            const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }, { group: 'edges', data: { source: newId, target: node.id() } }]);
            
            const newNode = added.filter('node');
            ctx.propagateBoxMembership(node, newNode.toArray());

            cy.nodes().unselect(); newNode.select(); ctx.refreshLayout();
            cy.animate({ center: { eles: newNode } }, { duration: 250 });
            ctx.openInlineEditor(newNode, true);
          } 
        }
        return;
      }
    }

    // Raccourci Alt + S : Assigne ou désassigne Espèce au noeud et Genre au premier ancêtre nommé
    if (e.altKey && e.key.toLowerCase() === 's') {
      if (selected.length === 1 && !selected[0].hasClass('box')) {
        e.preventDefault();
        ctx.saveState();
        
        const node = selected[0] as any;
        
        // 1. Trouver l'ancêtre le plus proche
        let curr = node.incomers('node').first();
        let parentGenusNode = null;

        while (curr && curr.length > 0 && !curr.hasClass('box')) {
            const pName = curr.data('name');
            if (pName && pName.trim() !== '' && pName !== t('default.unnamed_branch')) {
                parentGenusNode = curr;
                break;
            }
            curr = curr.incomers('node').first();
        }

        // 2. Action réversible
        if (node.data('rank') === 'Espèce') {
            // ANNULATION : On retire le rang et l'italique
            node.data('rank', 'Clade (non-classé)');
            node.data('isItalic', false);

            if (parentGenusNode && parentGenusNode.data('rank') === 'Genre') {
                parentGenusNode.data('rank', 'Clade (non-classé)');
                parentGenusNode.data('isItalic', false);
            }
        } else {
            // APPLICATION : On assigne les rangs et l'italique
            node.data('rank', 'Espèce');
            node.data('isItalic', true);

            if (parentGenusNode) {
                parentGenusNode.data('rank', 'Genre');
                parentGenusNode.data('isItalic', true);
            }
        }

        ctx.refreshLayout();
        ctx.setUnsavedState(true);
      }
      return;
    }

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (selected.length > 0 && !selected[0].hasClass('box')) { e.preventDefault(); const node = selected[0]; let siblingsArray = []; const incomers = node.incomers('node'); if (incomers.length === 0) siblingsArray = cy.nodes().roots().toArray(); else { const parent = incomers[0]; siblingsArray = parent.outgoers('node').filter((n:any)=>!n.hasClass('box')).toArray(); } siblingsArray.sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)); const currentIndex = siblingsArray.findIndex((n: any) => n.id() === node.id()); let swapped = false; if (e.key === 'ArrowUp' && currentIndex > 0) { [siblingsArray[currentIndex - 1], siblingsArray[currentIndex]] = [siblingsArray[currentIndex], siblingsArray[currentIndex - 1]]; swapped = true; } else if (e.key === 'ArrowDown' && currentIndex < siblingsArray.length - 1) { [siblingsArray[currentIndex], siblingsArray[currentIndex + 1]] = [siblingsArray[currentIndex + 1], siblingsArray[currentIndex]]; swapped = true; } if (swapped) { ctx.saveState(); siblingsArray.forEach((sib: any, i: number) => sib.data('sortIndex', i)); ctx.refreshLayout(); } } return; 
    }

    if (e.ctrlKey || e.metaKey) { 
      if (e.key.toLowerCase() === 'b') { 
        if (selected.length > 0) { 
          e.preventDefault(); ctx.saveState(); 
          const targetState = !selected[0].data('isBold');
          selected.forEach((n:any) => n.data('isBold', targetState)); 
          ctx.refreshLayout(); 
        } 
        return; 
      }
      if (e.key.toLowerCase() === 'i') { 
        if (selected.length > 0) { 
          e.preventDefault(); ctx.saveState(); 
          const targetState = !selected[0].data('isItalic');
          selected.forEach((n:any) => n.data('isItalic', targetState)); 
          ctx.refreshLayout(); 
        } 
        return; 
      }
      if (e.key.toLowerCase() === 'e') { 
        if (selected.length > 0 && !selected[0].hasClass('box')) { 
          e.preventDefault(); ctx.saveState(); 
          const targetState = !selected[0].data('extinct');
          selected.forEach((n:any) => n.union(n.successors()).data('extinct', targetState)); 
          ctx.refreshLayout(); 
        } 
        return; 
      }
    }

    if (e.key === ' ') {
      if (selected.length === 1) {
        e.preventDefault(); 
        ctx.openInlineEditor(selected[0]);
      }
    }

    if (e.key === 'Enter') { 
      if (selected.length === 1 && !selected[0].hasClass('box')) { 
        e.preventDefault(); const node = selected[0]; if (node.id() === state.currentRootId) return; const incomingEdges = node.incomers('edge'); 
        if (incomingEdges.length > 0) { 
          ctx.saveState(); const parentId = incomingEdges[0].data('source'); 
          const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
          const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: node.data('extinct'), isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: (node.data('sortIndex') || 0) + 0.1 };
          const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]); 
          
          const newNode = added.filter('node');
          ctx.propagateBoxMembership(node, newNode.toArray());

          cy.nodes().unselect(); newNode.select(); ctx.refreshLayout(); 
          cy.animate({ center: { eles: newNode } }, { duration: 250 });
          ctx.openInlineEditor(newNode, true);
        } 
      }
    }

    if (e.key === 'Tab') { 
      if (selected.length === 1 && !selected[0].hasClass('box')) { 
        e.preventDefault(); ctx.saveState(); const node = selected[0]; const parentId = node.id(); const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
        const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: node.data('extinct'), isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: Date.now() };
        const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]);  
        
        const newNode = added.filter('node');
        ctx.propagateBoxMembership(node, newNode.toArray());

        cy.nodes().unselect(); newNode.select();
        if (node.data('hasNewSheet')) { state.currentRootId = node.id(); ctx.refreshLayout(true); } else if (node.data('collapsed')) { ctx.toggleCollapse(node); } else { ctx.refreshLayout(); } 
        cy.animate({ center: { eles: newNode } }, { duration: 250 });
        ctx.openInlineEditor(newNode, true);
      }
    }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Feuille imbriquée placée par une autre classification : retrait de la classification active seulement.
      if (ctx.interceptNestedSheetDeletion()) { e.preventDefault(); return; }
      const selectedBoxes = cy.$('.box:selected');
      // (Cytoscape ne connaît pas « :not() » : on filtre avec .not().)
      const selectedTaxons = cy.$('node:selected').not('.box').union(cy.$('edge:selected'));

      if (selectedBoxes.length > 0 || selectedTaxons.length > 0) { 
          e.preventDefault();
          ctx.saveState();
          
          if (selectedBoxes.length > 0) {
              selectedBoxes.forEach((box: any) => {
                  box.children().move({ parent: null }); 
                  cy.remove(box); 
              });
          }
          else if (selectedTaxons.length > 0) {
              // La racine n'est jamais supprimée (quel que soit son identifiant, cf. imports XMind).
              const cladeToDelete = selectedTaxons.union(selectedTaxons.successors()).filter((ele: any) => !(ele.isNode() && isTreeRoot(ele)));
              if (cladeToDelete.length > 0) {
                  const viewRemoved = cladeToDelete.contains(cy.$id(state.currentRootId));
                  cy.remove(cladeToDelete);
                  if (viewRemoved) state.currentRootId = findTreeRootId(cy);
              }
          }
          
          ctx.closeSidePanel();
          ctx.refreshLayout(); 
      }
    }
  });

  return {  };
}
