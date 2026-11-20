// ==========================================
// CLASSIFICATIONS ALTERNATIVES PAR FEUILLE (phase 3) — fonctions pures sur le document
// ==========================================
// Une FEUILLE = sa racine (racine de l'arbre ou nœud `hasNewSheet`) et son CONTENU PROPRE : les
// descendants jusqu'aux racines des feuilles imbriquées, qui n'y figurent que comme liens (leurs
// descendants appartiennent à leur propre feuille). Une feuille peut avoir plusieurs classifications
// (variantes) de ce contenu ; la racine elle-même n'en fait pas partie (elle est placée par la feuille
// parente). Les variantes sont indexées par le TAXON de la racine : elles suivent la racine si elle
// est déplacée.
//
// Invariant : TreeRecord.nodes = vue composée (variante active de chaque feuille). Les variantes
// inactives gardent leurs nœuds dans sheetVariants ; les sous-arbres de feuilles imbriquées que la
// variante active ne place pas sont mis de côté dans TreeRecord.detached (jamais perdus).
// Limite assumée : déplacer un taxon d'une feuille à une autre se fait dans les deux feuilles ; un
// taxon présent deux fois dans la vue composée est signalé (duplicateTaxa), pas interdit.

import { PhyloDoc, TreeRecord, TreeNode, BoxRecord, SheetVariants, DEFAULT_TREE_NAME } from './doc-model';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
const activeTree = (doc: PhyloDoc): TreeRecord => doc.trees.find(t => t.id === doc.activeTreeId) || doc.trees[0];

const childrenOf = (nodes: Record<string, TreeNode>) => {
    const map = new Map<string, string[]>();
    Object.values(nodes).forEach(n => { if (n.parent) { if (!map.has(n.parent)) map.set(n.parent, []); map.get(n.parent)!.push(n.id); } });
    return map;
};

/** Racine de feuille : racine de l'arbre ou début de feuille. */
export const isSheetRoot = (tree: TreeRecord, nodeId: string): boolean => {
    const n = tree.nodes[nodeId];
    return !!n && (n.parent === null || !!n.structure.hasNewSheet);
};

/** Identifiants du contenu propre de la feuille (sans la racine ; racines imbriquées incluses, sans leurs descendants). */
export const ownContentIds = (nodes: Record<string, TreeNode>, rootId: string): string[] => {
    const kids = childrenOf(nodes);
    const out: string[] = [];
    const walk = (id: string) => (kids.get(id) || []).forEach(c => {
        out.push(c);
        if (!nodes[c].structure.hasNewSheet) walk(c);
    });
    walk(rootId);
    return out;
};

/** Tous les descendants d'un nœud (sans lui), dans un ensemble de nœuds donné. */
const descendantIds = (nodes: Record<string, TreeNode>, rootId: string): string[] => {
    const kids = childrenOf(nodes);
    const out: string[] = [];
    const walk = (id: string) => (kids.get(id) || []).forEach(c => { out.push(c); walk(c); });
    walk(rootId);
    return out;
};

/** Boîtes dont tous les membres sont dans `ids` (elles partent et reviennent avec la variante). */
const boxesOwnedBy = (tree: TreeRecord, ids: Set<string>): Record<string, BoxRecord> => {
    const members = new Map<string, string[]>();
    Object.values(tree.nodes).forEach(n => { if (n.box) { if (!members.has(n.box)) members.set(n.box, []); members.get(n.box)!.push(n.id); } });
    const out: Record<string, BoxRecord> = {};
    members.forEach((m, boxId) => { if (tree.boxes[boxId] && m.every(id => ids.has(id))) out[boxId] = clone(tree.boxes[boxId]); });
    return out;
};

let counter = 0;
const freshId = (prefix: string, taken: (id: string) => boolean) => {
    let id: string;
    do { id = `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`; } while (taken(id));
    return id;
};

/** Variantes d'une feuille pour l'interface. Sans entrée : une seule « Classification 1 ». */
export const listVariants = (doc: PhyloDoc, rootNodeId: string): { id: string; name: string; active: boolean }[] => {
    const tree = activeTree(doc);
    const tid = tree.nodes[rootNodeId]?.taxonId;
    const entry = tid ? tree.sheetVariants?.[tid] : undefined;
    if (!entry) return [{ id: 'v1', name: DEFAULT_TREE_NAME, active: true }];
    return entry.variants.map(v => ({ id: v.id, name: v.name, active: v.id === entry.active }));
};

const rootTaxonOf = (tree: TreeRecord, rootNodeId: string): string => {
    const n = tree.nodes[rootNodeId];
    if (!n || !isSheetRoot(tree, rootNodeId)) throw new Error(`« ${rootNodeId} » n'est pas une racine de feuille`);
    if (!n.taxonId) throw new Error('racine de feuille sans taxon');
    return n.taxonId;
};
const ensureEntry = (tree: TreeRecord, tid: string): SheetVariants => {
    tree.sheetVariants = tree.sheetVariants || {};
    if (!tree.sheetVariants[tid]) tree.sheetVariants[tid] = { active: 'v1', variants: [{ id: 'v1', name: DEFAULT_TREE_NAME }] };
    return tree.sheetVariants[tid];
};
/** Range le contenu actif de la feuille dans sa variante (copie), sans toucher à la vue composée. */
const snapshotActive = (tree: TreeRecord, rootNodeId: string, entry: SheetVariants) => {
    const ids = ownContentIds(tree.nodes, rootNodeId);
    const v = entry.variants.find(x => x.id === entry.active)!;
    v.nodes = {};
    ids.forEach(id => { v.nodes![id] = clone(tree.nodes[id]); });
    v.boxes = boxesOwnedBy(tree, new Set(ids));
    return ids;
};

/** Ajoute une classification alternative : copie de la classification active, qui devient la nouvelle active. */
export const addVariant = (doc0: PhyloDoc, rootNodeId: string, name?: string): { doc: PhyloDoc; variantId: string } => {
    const doc = clone(doc0);
    const tree = activeTree(doc);
    const entry = ensureEntry(tree, rootTaxonOf(tree, rootNodeId));
    snapshotActive(tree, rootNodeId, entry);          // l'ancienne active garde sa copie
    const id = freshId('v', x => entry.variants.some(v => v.id === x));
    entry.variants.push({ id, name: name || `Classification ${entry.variants.length + 1}` });
    entry.active = id;                                 // contenu identique : la vue composée ne change pas
    return { doc, variantId: id };
};

/** Active une autre classification de la feuille. */
export const switchVariant = (doc0: PhyloDoc, rootNodeId: string, targetId: string): PhyloDoc => {
    const doc = clone(doc0);
    const tree = activeTree(doc);
    const tid = rootTaxonOf(tree, rootNodeId);
    const entry = tree.sheetVariants?.[tid];
    if (!entry || entry.active === targetId) return doc;
    const target = entry.variants.find(v => v.id === targetId);
    if (!target) throw new Error(`classification inconnue : ${targetId}`);
    tree.detached = tree.detached || {};
    const detached = tree.detached;

    // 1. Le contenu actif devient la copie de la variante courante, puis quitte la vue composée.
    const current = entry.variants.find(v => v.id === entry.active)!;
    const curIds = snapshotActive(tree, rootNodeId, entry);
    const nestedCur = curIds.filter(id => tree.nodes[id].structure.hasNewSheet);
    curIds.forEach(id => { delete tree.nodes[id]; });
    Object.keys(current.boxes || {}).forEach(b => { delete tree.boxes[b]; });

    // 2. Contenu de la variante cible ; les identifiants déjà pris ailleurs sont renommés.
    const recs = clone(target.nodes || {});
    const boxes = clone(target.boxes || {});
    const idMap = new Map<string, string>();
    // La racine d'un sous-arbre mis de côté n'est PAS une collision : la cible la replace (étape 4).
    const collides = (id: string) => !!tree.nodes[id] || (!!detached[id] && detached[id].parent !== null);
    Object.keys(recs).forEach(id => {
        if (collides(id)) idMap.set(id, freshId(id, x => !!tree.nodes[x] || !!detached[x] || !!recs[x]));
    });
    const boxMap = new Map<string, string>();
    Object.keys(boxes).forEach(b => { if (tree.boxes[b]) boxMap.set(b, freshId(b, x => !!tree.boxes[x] || !!boxes[x])); });
    Object.values(recs).forEach(n => {
        const id = idMap.get(n.id) || n.id;
        const parent = n.parent ? (idMap.get(n.parent) || n.parent) : n.parent;
        const box = n.box ? (boxMap.get(n.box) || n.box) : n.box;
        tree.nodes[id] = { ...n, id, parent, box };
    });
    Object.values(boxes).forEach(b => {
        const id = boxMap.get(b.id) || b.id;
        tree.boxes[id] = { ...b, id, parentBox: b.parentBox ? (boxMap.get(b.parentBox) || b.parentBox) : null };
    });
    target.nodes = undefined; target.boxes = undefined;
    entry.active = targetId;
    const targetIds = new Set(Object.keys(recs).map(id => idMap.get(id) || id));

    // 3. Feuilles imbriquées que la cible ne place plus : leur sous-arbre est mis de côté.
    nestedCur.filter(n => !targetIds.has(n)).forEach(n => {
        detached[n] = { ...clone(current.nodes![n]), parent: null };
        descendantIds(tree.nodes, n).forEach(d => { detached[d] = tree.nodes[d]; delete tree.nodes[d]; });
    });
    // 4. Feuilles imbriquées que la cible replace : leur sous-arbre mis de côté revient.
    targetIds.forEach(n => {
        if (!detached[n] || !tree.nodes[n]?.structure.hasNewSheet) return;
        descendantIds(detached, n).forEach(d => { tree.nodes[d] = detached[d]; delete detached[d]; });
        delete detached[n]; // la racine imbriquée vient de la variante cible (position propre à celle-ci)
    });
    if (Object.keys(detached).length === 0) delete tree.detached;
    return doc;
};

export const renameVariant = (doc0: PhyloDoc, rootNodeId: string, variantId: string, name: string): PhyloDoc => {
    const doc = clone(doc0);
    const tree = activeTree(doc);
    const entry = ensureEntry(tree, rootTaxonOf(tree, rootNodeId));
    const v = entry.variants.find(x => x.id === variantId);
    if (v && name.trim()) v.name = name.trim();
    return doc;
};

/** Supprime une classification (l'active d'abord remplacée par une autre). Une seule restante : la feuille redevient simple. */
export const deleteVariant = (doc0: PhyloDoc, rootNodeId: string, variantId: string): PhyloDoc => {
    let doc = clone(doc0);
    let tree = activeTree(doc);
    const tid = rootTaxonOf(tree, rootNodeId);
    let entry = tree.sheetVariants?.[tid];
    if (!entry || entry.variants.length <= 1) return doc;
    if (entry.active === variantId) {
        doc = switchVariant(doc, rootNodeId, entry.variants.find(v => v.id !== variantId)!.id);
        tree = activeTree(doc);
        entry = tree.sheetVariants![tid];
    }
    entry.variants = entry.variants.filter(v => v.id !== variantId);
    if (entry.variants.length === 1) delete tree.sheetVariants![tid];
    if (tree.sheetVariants && Object.keys(tree.sheetVariants).length === 0) delete tree.sheetVariants;
    return pruneDetached(doc);
};

/** Abandonne toutes les variantes d'une feuille (ex. la feuille est retirée) : seule l'active reste. */
export const dropSheetVariants = (doc0: PhyloDoc, rootTaxonId: string): PhyloDoc => {
    const doc = clone(doc0);
    const tree = activeTree(doc);
    if (tree.sheetVariants) delete tree.sheetVariants[rootTaxonId];
    if (tree.sheetVariants && Object.keys(tree.sheetVariants).length === 0) delete tree.sheetVariants;
    return pruneDetached(doc);
};

/** Retire les sous-arbres mis de côté qu'aucune variante inactive ne place plus. */
export const pruneDetached = (doc: PhyloDoc): PhyloDoc => {
    const tree = activeTree(doc);
    if (!tree.detached) return doc;
    const placed = new Set<string>();
    Object.values(tree.sheetVariants || {}).forEach(e => e.variants.forEach(v => Object.keys(v.nodes || {}).forEach(id => placed.add(id))));
    Object.values(tree.detached).filter(n => n.parent === null && !placed.has(n.id)).forEach(root => {
        descendantIds(tree.detached!, root.id).forEach(d => { delete tree.detached![d]; });
        delete tree.detached![root.id];
    });
    if (Object.keys(tree.detached).length === 0) delete tree.detached;
    return doc;
};

/**
 * Retire une feuille imbriquée de la classification ACTIVE seulement : sa racine et son sous-arbre sont
 * mis de côté (une autre classification qui la place les retrouvera), au lieu d'être supprimés.
 */
export const detachFromComposition = (doc0: PhyloDoc, nodeId: string): PhyloDoc => {
    const doc = clone(doc0);
    const tree = activeTree(doc);
    const n = tree.nodes[nodeId];
    if (!n || n.parent === null) return doc;
    tree.detached = tree.detached || {};
    descendantIds(tree.nodes, nodeId).forEach(d => { tree.detached![d] = tree.nodes[d]; delete tree.nodes[d]; });
    tree.detached[nodeId] = { ...n, parent: null };
    delete tree.nodes[nodeId];
    return doc;
};

/** Variante(s) inactive(s) d'une feuille qui placent ce nœud : sa suppression ne doit pas détruire son contenu. */
export const placedByInactiveVariant = (tree: TreeRecord, nodeId: string): boolean =>
    Object.values(tree.sheetVariants || {}).some(e => e.variants.some(v => v.id !== e.active && !!v.nodes?.[nodeId]));

/** Taxons présents plusieurs fois dans la vue composée (signalés à l'utilisateur, pas interdits). */
export const duplicateTaxa = (tree: TreeRecord): string[] => {
    const seen = new Map<string, number>();
    Object.values(tree.nodes).forEach(n => { if (n.taxonId) seen.set(n.taxonId, (seen.get(n.taxonId) || 0) + 1); });
    return [...seen.entries()].filter(([, c]) => c > 1).map(([t]) => t);
};

/** Taxons référencés hors de la vue composée (variantes inactives, sous-arbres mis de côté) : à conserver. */
export const taxaOutsideComposition = (tree: TreeRecord): Set<string> => {
    const out = new Set<string>();
    Object.values(tree.sheetVariants || {}).forEach(e => e.variants.forEach(v => Object.values(v.nodes || {}).forEach(n => { if (n.taxonId) out.add(n.taxonId); })));
    Object.values(tree.detached || {}).forEach(n => { if (n.taxonId) out.add(n.taxonId); });
    Object.keys(tree.sheetVariants || {}).forEach(tid => out.add(tid));
    return out;
};
