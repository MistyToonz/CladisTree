// ==========================================
// SESSION DE DOCUMENT : document v2 ↔ copie de travail Cytoscape
// ==========================================
// Architecture 1.4 : le document (taxa, trees, assets) est conservé ici ; Cytoscape contient la copie
// de travail de la classification ACTIVE, nœuds « à plat » comme avant (le reste du code n'a pas
// à connaître le nouveau modèle). Chaque nœud Cytoscape porte en plus `taxonId`, et ses images sont
// des références « asset:<id> » (voir asset-store.ts).
//
//   ouverture : migrate(raw) → openDocument(doc) → éléments Cytoscape
//   sauvegarde : commitFromCy(cy) → PhyloDoc v2 (les autres classifications sont conservées telles quelles)

import { FORMAT_VERSION, DEFAULT_TREE_NAME, PhyloDoc, TaxonRecord, TreeRecord, BoxRecord } from './doc-model';
import { migrate, joinFlatNode, joinFlatBox, splitFlatNode, splitFlatBox, findTreeRoot } from './migrate';
import { clearAssets, loadAssets, refOf, isAssetRef, assetIdOf, putAsset, getAsset } from './asset-store';
import { taxaOutsideComposition } from './sheet-variants';

type Flat = Record<string, any>;
export type CyElementDef = { group: 'nodes' | 'edges'; classes?: string; data: Flat };

const emptyDoc = (): PhyloDoc => ({
    formatVersion: FORMAT_VERSION,
    taxa: {},
    trees: [{ id: 'tree-1', name: DEFAULT_TREE_NAME, nodes: {}, boxes: {}, view: { currentRootId: '' } }],
    activeTreeId: 'tree-1',
    assets: {},
});

let session: PhyloDoc = emptyDoc();

const activeTree = (doc: PhyloDoc): TreeRecord => doc.trees.find(t => t.id === doc.activeTreeId) || doc.trees[0];

let idCounter = 0;
const mintTaxonId = (taken: (id: string) => boolean): string => {
    let id: string;
    do { id = `tx-${Date.now().toString(36)}-${(idCounter++).toString(36)}`; } while (taken(id));
    return id;
};

/** Boîtes dans un ordre où un parent précède toujours ses enfants (exigé par Cytoscape). */
const orderBoxes = (boxes: Record<string, BoxRecord>): BoxRecord[] => {
    const out: BoxRecord[] = []; const seen = new Set<string>();
    const visit = (b: BoxRecord, depth: number) => {
        if (seen.has(b.id) || depth > 100) return;
        if (b.parentBox && boxes[b.parentBox]) visit(boxes[b.parentBox], depth + 1);
        seen.add(b.id); out.push(b);
    };
    Object.values(boxes).forEach(b => visit(b, 0));
    return out;
};

/** Éléments Cytoscape d'une classification. Charge ses images dans le magasin (sans le vider). */
export const docToCyElements = (doc: PhyloDoc, treeId?: string): { elements: CyElementDef[]; currentRootId: string } => {
    const tree = doc.trees.find(t => t.id === (treeId || doc.activeTreeId)) || doc.trees[0];
    const remap = loadAssets(doc.assets);
    const assetValue = (id: string) => (remap.has(id) ? refOf(remap.get(id)!) : '');

    const taxonToNode = new Map<string, string>();
    Object.values(tree.nodes).forEach(n => { if (n.taxonId) taxonToNode.set(n.taxonId, n.id); });

    const elements: CyElementDef[] = [];
    orderBoxes(tree.boxes).forEach(b => elements.push({ group: 'nodes', classes: 'box', data: joinFlatBox(b) }));

    const edges: CyElementDef[] = [];
    Object.values(tree.nodes).forEach(n => {
        const taxon: TaxonRecord = (n.taxonId && doc.taxa[n.taxonId]) || { id: n.taxonId || n.id, fields: {}, images: [], audio: null, synonymOf: null };
        const d = joinFlatNode(taxon, n, assetValue);
        const edgeData = d.__edge; delete d.__edge;
        // Divergence sans taxon : pas de fiche, et elle doit le rester à l'enregistrement.
        if (!n.taxonId) { delete d.taxonId; d.isDivergence = true; }

        d.synonymTargetId = null;
        if (taxon.synonymOf) {
            const target = taxonToNode.get(taxon.synonymOf);
            if (target) d.synonymTargetId = target;
            else d.synonymOfOutside = taxon.synonymOf; // valide absent de cette classification : conservé
        }
        elements.push({ group: 'nodes', classes: 'taxon', data: d });
        if (n.parent && tree.nodes[n.parent]) edges.push({ group: 'edges', data: { ...(edgeData || {}), source: n.parent, target: n.id } });
    });

    return { elements: [...elements, ...edges], currentRootId: tree.view.currentRootId || findTreeRoot(tree) || '' };
};

/** Remplace le document de la session (ouverture) et renvoie les éléments de la classification active. */
export const openDocument = (doc: PhyloDoc): { elements: CyElementDef[]; currentRootId: string } => {
    clearAssets();
    session = doc;
    return docToCyElements(doc);
};

/** Lit n'importe quel document reconnu (v1 ou v2) et l'ouvre. Voir migrate(). */
export const openRawDocument = (raw: unknown) => openDocument(migrate(raw));

/**
 * Remplace le document de la session par une version modifiée (ex. changement de classification d'une
 * feuille) SANS vider le magasin d'images, et renvoie les éléments de la vue composée.
 */
export const applyDocument = (doc: PhyloDoc): { elements: CyElementDef[]; currentRootId: string } => {
    session = doc;
    return docToCyElements(doc);
};

/** Nouveau document vide (bouton « Nouveau »). */
export const newDocument = (): void => { clearAssets(); session = emptyDoc(); };

/**
 * Éléments à greffer depuis un autre document : ses images rejoignent le magasin (dédoublonnées),
 * et ses taxons deviennent de NOUVEAUX taxons de ce document (identifiants attribués à l'enregistrement).
 */
export const graftElementsFrom = (raw: unknown): { elements: CyElementDef[]; currentRootId: string } => {
    const res = docToCyElements(migrate(raw));
    res.elements.forEach(e => { if (e.group === 'nodes') { delete e.data.taxonId; delete e.data.synonymOfOutside; } });
    return res;
};

/**
 * Document v2 reflétant la copie de travail. Met à jour la session et attribue un `taxonId`
 * aux nœuds qui n'en ont pas encore (nœuds créés pendant la session).
 */
export const commitFromCy = (cy: any, currentRootId: string, app?: string): PhyloDoc => {
    const prev = activeTree(session);
    const tree: TreeRecord = { id: prev.id, name: prev.name, nodes: {}, boxes: {}, view: { currentRootId } };
    // Classifications alternatives des feuilles et sous-arbres mis de côté : hors de Cytoscape, conservés tels quels.
    if (prev.sheetVariants) tree.sheetVariants = prev.sheetVariants;
    if (prev.detached) tree.detached = prev.detached;
    const otherTrees = session.trees.filter(t => t.id !== prev.id);

    // Taxons utilisés par les autres classifications : ne pas réattribuer leurs identifiants à un nouveau nœud.
    const usedElsewhere = new Set<string>();
    otherTrees.forEach(t => Object.values(t.nodes).forEach(n => { if (n.taxonId) usedElsewhere.add(n.taxonId); }));
    // Taxons placés seulement par une classification de feuille inactive : à conserver aussi.
    taxaOutsideComposition(prev).forEach(tid => usedElsewhere.add(tid));

    const taxa: Record<string, TaxonRecord> = {};
    const usedHere = new Set<string>();
    const nodeToTaxon = new Map<string, string>();
    const pendingSyn: { tid: string; targetNode: string | null; outside: string | null }[] = [];

    const toAssetId = (v: unknown): string | null => {
        if (isAssetRef(v)) return getAsset(assetIdOf(v)) !== undefined ? assetIdOf(v) : null;
        if (typeof v === 'string' && v.startsWith('data:')) return putAsset(v); // image restée en ligne
        return null;
    };

    cy.nodes().forEach((n: any) => {
        const id = n.id();
        if (id === 'ghost-node' || n.hasClass('export-chrono') || n.hasClass('romer-spindle')) return;
        const d = n.data();
        if (n.hasClass('box')) { tree.boxes[id] = splitFlatBox(d); return; }

        const { taxon, node } = splitFlatNode(d, toAssetId);
        if (d.isDivergence) { node.taxonId = null; tree.nodes[id] = node; return; }
        let tid = node.taxonId;
        // Sans identifiant, ou identifiant déjà pris dans cet arbre (nœud dupliqué) : nouveau taxon.
        if (!tid || usedHere.has(tid)) {
            const taken = (x: string) => usedHere.has(x) || usedElsewhere.has(x) || !!session.taxa[x] || !!taxa[x];
            tid = taken(id) ? mintTaxonId(taken) : id;
            n.data('taxonId', tid);
        }
        node.taxonId = tid;
        usedHere.add(tid);
        nodeToTaxon.set(id, tid);
        taxa[tid] = { id: tid, ...taxon };
        tree.nodes[id] = node;
        pendingSyn.push({ tid, targetNode: d.synonymTargetId || null, outside: d.synonymOfOutside || null });
    });

    cy.edges().forEach((e: any) => {
        if (e.id() === 'ghost-edge') return;
        const child = tree.nodes[e.target().id()];
        const src = e.source().id();
        if (child && tree.nodes[src] && child.parent === null) child.parent = src;
    });

    pendingSyn.forEach(p => {
        taxa[p.tid].synonymOf = p.targetNode ? (nodeToTaxon.get(p.targetNode) ?? null) : p.outside;
    });

    // Taxons présents seulement dans d'autres classifications : conservés tels quels.
    usedElsewhere.forEach(tid => { if (!taxa[tid] && session.taxa[tid]) taxa[tid] = session.taxa[tid]; });

    // Images effectivement utilisées.
    const assets: Record<string, string> = {};
    Object.values(taxa).forEach(t => t.images.forEach(img => {
        const uri = getAsset(img.asset) ?? session.assets[img.asset];
        if (uri) assets[img.asset] = uri;
    }));

    const trees = session.trees.map(t => (t.id === prev.id ? tree : t));
    const doc: PhyloDoc = { formatVersion: FORMAT_VERSION, ...(app ? { app } : {}), taxa, trees, activeTreeId: prev.id, assets };
    session = doc;
    return doc;
};

/** Document de la session (lecture seule). */
export const currentDocument = (): PhyloDoc => session;
