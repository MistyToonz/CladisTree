// ==========================================
// PRESSE-PAPIERS : COPIER / COUPER / COLLER DES CLADES
// ==========================================
// Copier = nouveaux taxons au collage ; couper = déplacement (mêmes taxons, une seule fois).
// Le presse-papiers garde les images en ligne pour survivre à l'ouverture d'un autre fichier.
// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de
// l'application passent par `ctx` (voir app-context.ts), résolues au moment de l'appel.

import { state } from './graph-state';
import { resolveAsset, toAssetRef } from './asset-store';
import { isTreeRoot, findTreeRootId } from './tree-utils';
import { elementsToDoc } from './migrate';
import { fromCyNode, writeNewick, parseNewick, toLegacyDoc, inferTaxonomy } from './phylo-formats';

/** Identifie cette fenêtre : un clade copié ici se recolle ici en interne. */
const INSTANCE_ID = Math.random().toString(36).slice(2) + Date.now().toString(36);
import type { AppContext } from './app-context';

export function initClipboard(ctx: AppContext) {
  const { cy, ui } = ctx;

  // Le presse-papiers garde les images EN LIGNE (pas de références au magasin) : il survit ainsi
  // à l'ouverture d'un autre fichier, qui vide le magasin d'images.
  const IMAGE_KEYS = ['imgUrl', 'sheetImage'];
  /** Éléments d'un clade, images EN LIGNE (indépendants du magasin d'images, donc d'une fenêtre ou d'un fichier). */
  function serializeClade(node: any): any[] {
      const clade = node.union(node.successors());
      return clade.map((ele: any) => {
          const data = { ...ele.data() };
          IMAGE_KEYS.forEach(k => { if (data[k]) data[k] = resolveAsset(data[k]); });
          if (Array.isArray(data.extraImages)) data.extraImages = data.extraImages.map((i: any) => ({ ...i, asset: resolveAsset(i.asset) }));
          return { group: ele.group(), data, classes: ele.classes() };
      });
  }
  /** Copier (et couper, qui copie avant de retirer) : presse-papiers interne ET presse-papiers du système. */
  function copyClade(node: any) {
      const elements = serializeClade(node);
      state.clipboard = { rootId: node.id(), elements };
      copyToSystemClipboard(node, elements);
  }

  /**
   * Copie aussi vers le presse-papiers du SYSTÈME : texte Newick (collable dans d'autres logiciels) et
   * document v2 complet du clade (fiches, images) pour une autre fenêtre CladisTree.
   * Sans cela, un Ctrl+V après « couper » lirait un texte copié ailleurs et créerait un taxon de ce nom.
   */
  function copyToSystemClipboard(node: any, serialized: any[]) {
      try {
          const elements = serialized.map((e: any) => (e.group === 'nodes' ? { ...e, data: { ...e.data, taxonId: undefined } } : e));
          const payload = JSON.stringify({ instance: INSTANCE_ID, doc: elementsToDoc(elements, node.id()) });
          window.electronAPI.writeTreeClipboard(writeNewick(fromCyNode(node)), payload);
      } catch (err) { console.warn('Copie vers le presse-papiers du système impossible :', err); }
  }

  /**
   * Ctrl+V : collage depuis le presse-papiers du système. Renvoie true si le collage a été pris en charge :
   *  - clade copié dans CETTE fenêtre → collage interne habituel (garde « couper = déplacer ») ;
   *  - clade copié dans une AUTRE fenêtre CladisTree → greffe du document complet ;
   *  - Newick copié depuis un autre logiciel → greffe de l'arbre importé.
   * Sinon false : le texte ordinaire garde son comportement (nouveau taxon portant ce nom).
   */
  const pasteFromSystem = async (node: any): Promise<boolean> => {
      let clip: { json: string | null; text: string };
      try { clip = await window.electronAPI.readTreeClipboard(); } catch { return false; }
      if (clip.json) {
          let payload: any = null;
          try { payload = JSON.parse(clip.json); } catch { payload = null; }
          if (payload && payload.doc) {
              if (payload.instance === INSTANCE_ID && state.clipboard) { pasteClade(node); return true; }
              await ctx.graftDocument(payload.doc, node);
              return true;
          }
      }
      const text = (clip.text || '').trim();
      if (/^\([\s\S]*\)[^()]*;?$/.test(text) && text.includes(',')) {
          try {
              const tree = parseNewick(text.endsWith(';') ? text : text + ';');
              if (state.appSettings.smartTaxonomy) inferTaxonomy(tree); // Genre / Espèce, comme à l'import d'un fichier
              await ctx.graftDocument(toLegacyDoc(tree), node);
              return true;
          } catch { return false; }
      }
      return false;
  };
  
  function cutClade(node: any) {
    // La racine (quel que soit son identifiant, cf. imports XMind) ne se coupe pas : tout l'arbre partirait.
    if (isTreeRoot(node)) return;
    ctx.saveState();
    copyClade(node);
    state.clipboard.isCut = true; // déplacement : le prochain collage garde l'identité des taxons

    const cladeToDelete = node.union(node.successors());
    if (cladeToDelete.length > 0) {
      const viewRemoved = cladeToDelete.contains(cy.$id(state.currentRootId));
      cy.remove(cladeToDelete);
      if (viewRemoved) state.currentRootId = findTreeRootId(cy);
    }
    ctx.refreshLayout();
    
    if (ui.sidePanel.style.display === 'block') {
        ui.sidePanel.style.display = 'none';
    }
  }
  function propagateBoxMembership(sourceNode: any, newNodes: any[]) {
      if (!sourceNode || !newNodes || newNodes.length === 0) return;
      
      cy.nodes('.box').forEach((box: any) => {
          let targets = box.data('targets') || [];
          if (targets.includes(sourceNode.id())) {
              let modified = false;
              newNodes.forEach((n: any) => {
                  if (!targets.includes(n.id()) && !n.hasClass('box')) {
                      targets.push(n.id());
                      modified = true;
                  }
              });
              if (modified) box.data('targets', targets);
          }
      });
  }
  
  function pasteClade(targetNode: any) { 
      if (!state.clipboard) return; 
      ctx.saveState(); 
      const idMap: { [key: string]: string } = {};
      const newElements: any[] = [];
      // Couper-coller = déplacement : mêmes taxons (taxonId conservé). Copier-coller = nouveaux taxons.
      // Un « couper » ne vaut déplacement qu'une fois : les collages suivants sont des copies.
      const keepTaxa = !!state.clipboard.isCut;
      state.clipboard.isCut = false;

      state.clipboard.elements.filter((e: any) => e.group === 'nodes').forEach((n: any) => {
          const oldId = n.data.id;
          const newId = 'taxon-' + Date.now() + Math.random().toString(36).substr(2, 5);
          idMap[oldId] = newId;
          const data = { ...n.data, id: newId };
          if (!keepTaxa) { delete data.taxonId; delete data.synonymOfOutside; }
          IMAGE_KEYS.forEach(k => { if (data[k]) data[k] = toAssetRef(data[k]); }); // de nouveau dans le magasin (dédoublonné)
          if (Array.isArray(data.extraImages)) data.extraImages = data.extraImages.map((i: any) => ({ ...i, asset: toAssetRef(i.asset) }));
          newElements.push({ group: 'nodes', classes: n.classes, data });
      });
      
      state.clipboard.elements.filter((e: any) => e.group === 'edges').forEach((e: any) => { 
          if (idMap[e.data.source] && idMap[e.data.target]) { 
              newElements.push({ group: 'edges', data: { source: idMap[e.data.source], target: idMap[e.data.target] } }); 
          } 
      }); 
      
      newElements.push({ group: 'edges', data: { source: targetNode.id(), target: idMap[state.clipboard.rootId] } }); 
      
      const added = cy.add(newElements); 
      propagateBoxMembership(targetNode, added.filter('node').toArray()); 
      
      ctx.refreshLayout(); 
  }
  document.getElementById('cmenu-cut')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) cutClade(state.activeNode); });
  document.getElementById('cmenu-copy')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) copyClade(state.activeNode); });
  document.getElementById('cmenu-paste')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && state.clipboard && !state.activeNode.hasClass('box')) pasteClade(state.activeNode); });

  return { propagateBoxMembership, cutClade, copyClade, pasteClade, serializeClade, pasteFromSystem };
}
