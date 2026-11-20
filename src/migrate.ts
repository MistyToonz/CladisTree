// ==========================================
// MIGRATION DES DOCUMENTS .phylo
// ==========================================
// migrate(raw) est le point d'entrée UNIQUE de toute donnée de document qui entre dans l'application
// (ouverture, fichiers récents, feuilles liées, greffe). Il reconnaît :
//   - v2  : { formatVersion: 2, taxa, trees, assets }                       → vérifié et complété
//   - v1  : { version: "1.0", currentRootId, graph: cy.json() } (≤ 1.3)    → converti
//   - variantes v1 anciennes : graph.elements en tableau ou en { nodes, edges }, state.currentRootId
// et produit toujours un PhyloDoc v2. Fonctions pures (aucun accès à Cytoscape ni au magasin d'images).
//
// Les conversions nœud « à plat » (format Cytoscape) ↔ taxon + nœud d'arbre sont aussi ici,
// car la copie de travail 1.4 dans Cytoscape garde la forme à plat (voir doc-session.ts).

import {
    FORMAT_VERSION, DEFAULT_TREE_NAME, FutureFormatError,
    TAXON_FIELDS, IMAGE_FIELDS, STRUCTURE_FIELDS, STYLE_FIELDS, COMPUTED_FIELDS, SESSION_FIELDS,
    PhyloDoc, TaxonRecord, TreeNode, TreeRecord, BoxRecord, TaxonImage, SheetVariants,
} from './doc-model';

type Flat = Record<string, any>;
type CyElement = { group: 'nodes' | 'edges'; data: Flat; classes?: string | string[] };

const KNOWN = new Set<string>([...TAXON_FIELDS, ...IMAGE_FIELDS, ...STRUCTURE_FIELDS, ...STYLE_FIELDS, ...COMPUTED_FIELDS, ...SESSION_FIELDS]);
const COMPUTED = new Set<string>(COMPUTED_FIELDS);

const pick = (d: Flat, keys: readonly string[]): Flat => {
    const out: Flat = {};
    keys.forEach(k => { if (d[k] !== undefined) out[k] = d[k]; });
    return out;
};
const num = (v: unknown): number | undefined => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isFinite(n) ? n : undefined;
};
const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const dropUndefined = <T extends Flat>(o: T): T => {
    Object.keys(o).forEach(k => { if (o[k] === undefined) delete o[k]; });
    return o;
};
const hasClass = (el: CyElement, cls: string): boolean => {
    const c = el.classes;
    if (Array.isArray(c)) return c.includes(cls);
    return typeof c === 'string' && c.split(/\s+/).includes(cls);
};

/** Empreinte de contenu (même algorithme que le magasin d'images) pour nommer les images migrées. */
export const contentId = (str: string): string => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

// ------------------------------------------
// Nœud à plat ↔ taxon + nœud d'arbre
// ------------------------------------------

/**
 * Découpe les données à plat d'un nœud Cytoscape en un taxon et un nœud d'arbre.
 * @param toAssetId convertit la valeur d'un champ image (data URI ou référence) en identifiant d'asset, ou null.
 * Le parent dans l'arbre et `synonymOf` sont résolus par l'appelant (ils dépendent des autres nœuds).
 */
export const splitFlatNode = (d: Flat, toAssetId: (v: unknown) => string | null): { taxon: Omit<TaxonRecord, 'id'>; node: TreeNode } => {
    const fields = pick(d, TAXON_FIELDS);
    const images: TaxonImage[] = [];

    const treeAsset = toAssetId(d.imgUrl);
    if (treeAsset) images.push(dropUndefined({ asset: treeAsset, role: 'tree' as const, name: nonEmpty(d.imgName), ratio: num(d.imgRatio) }));

    const sheetAsset = toAssetId(d.sheetImage);
    if (sheetAsset) images.push(dropUndefined({ asset: sheetAsset, role: 'sheet' as const, credits: nonEmpty(d.imgCredits), ratio: num(d.sheetImageRatio) }));
    // Crédits saisis sans illustration : conservés comme champ de fiche.
    else if (nonEmpty(d.imgCredits)) fields.imgCredits = d.imgCredits;

    if (Array.isArray(d.extraImages)) {
        d.extraImages.forEach((img: TaxonImage) => {
            const asset = toAssetId(img && img.asset);
            if (asset) images.push({ ...img, asset });
        });
    }

    const extra: Flat = {};
    Object.keys(d).forEach(k => { if (!KNOWN.has(k) && d[k] !== undefined) extra[k] = d[k]; });

    const node: TreeNode = {
        id: String(d.id),
        taxonId: nonEmpty(d.taxonId) ?? null,
        parent: null,
        box: nonEmpty(d.parent) ?? null,
        sortIndex: num(d.sortIndex) ?? 0,
        structure: pick(d, STRUCTURE_FIELDS),
        style: pick(d, STYLE_FIELDS),
        support: d.support ?? null,
        highlight: nonEmpty(d.highlight) ?? null,
        branch: d.branch ?? null,
    };
    if (Object.keys(extra).length > 0) node.extra = extra;

    return { taxon: { fields, images, audio: d.audio ?? null, synonymOf: null }, node };
};

/**
 * Inverse de splitFlatNode : données à plat d'un nœud Cytoscape.
 * @param assetValue valeur à mettre dans un champ image pour un identifiant d'asset (référence ou data URI).
 */
export const joinFlatNode = (taxon: TaxonRecord, node: TreeNode, assetValue: (id: string) => string): Flat => {
    const tree = taxon.images.find(i => i.role === 'tree');
    const sheet = taxon.images.find(i => i.role === 'sheet');
    const others = taxon.images.filter(i => i !== tree && i !== sheet);

    const d: Flat = {
        ...(node.extra || {}),
        ...taxon.fields,
        ...node.structure,
        ...node.style,
        id: node.id,
        taxonId: taxon.id,
        sortIndex: node.sortIndex,
        imgUrl: tree ? assetValue(tree.asset) : '',
        imgName: tree?.name ?? '',
        imgRatio: tree?.ratio ?? 1,
        sheetImage: sheet ? assetValue(sheet.asset) : '',
        imgCredits: sheet?.credits ?? (taxon.fields.imgCredits as string | undefined) ?? '',
    };
    if (sheet?.ratio !== undefined) d.sheetImageRatio = sheet.ratio;
    if (others.length > 0) d.extraImages = others.map(i => ({ ...i, asset: assetValue(i.asset) }));
    if (node.box) d.parent = node.box;
    if (node.support) d.support = node.support;
    if (node.highlight) d.highlight = node.highlight;
    if (node.branch) d.branch = node.branch;
    if (taxon.audio) d.audio = taxon.audio;
    return d;
};

export const splitFlatBox = (d: Flat): BoxRecord => {
    const data: Flat = {};
    Object.keys(d).forEach(k => { if (k !== 'id' && k !== 'parent' && !COMPUTED.has(k) && d[k] !== undefined) data[k] = d[k]; });
    return { id: String(d.id), parentBox: nonEmpty(d.parent) ?? null, data };
};

export const joinFlatBox = (b: BoxRecord): Flat => {
    const d: Flat = { ...b.data, id: b.id };
    if (b.parentBox) d.parent = b.parentBox;
    return d;
};

/** Racine réelle d'un arbre : le nœud sans parent (le premier rencontré s'il y en a plusieurs). */
export const findTreeRoot = (tree: TreeRecord): string | null => {
    const ids = Object.keys(tree.nodes);
    return ids.find(id => tree.nodes[id].parent === null) ?? ids[0] ?? null;
};

// ------------------------------------------
// v1 (≤ 1.3) → v2
// ------------------------------------------

const flattenElements = (graph: any): CyElement[] => {
    const els = graph && graph.elements;
    if (Array.isArray(els)) return els;
    if (els && typeof els === 'object') {
        return [
            ...(els.nodes || []).map((n: any) => ({ group: 'nodes', ...n })),
            ...(els.edges || []).map((e: any) => ({ group: 'edges', ...e })),
        ];
    }
    return [];
};

const isGhost = (id: unknown) => id === 'ghost-node' || id === 'ghost-edge';

/** Construit un document v2 à partir d'éléments Cytoscape à plat dont les images sont des data URI. */
export const elementsToDoc = (elements: CyElement[], currentRootId: string | undefined): PhyloDoc => {
    const assets: Record<string, string> = {};
    const toAssetId = (v: unknown): string | null => {
        if (typeof v !== 'string' || !v.startsWith('data:')) return null;
        const id = contentId(v);
        assets[id] = v;
        return id;
    };

    const taxa: Record<string, TaxonRecord> = {};
    const tree: TreeRecord = { id: 'tree-1', name: DEFAULT_TREE_NAME, nodes: {}, boxes: {}, view: { currentRootId: '' } };
    const synonymByNode = new Map<string, string>();

    elements.forEach(el => {
        const d = el.data || {};
        const isNode = el.group === 'nodes' || (el.group === undefined && d.source === undefined);
        if (!isNode || isGhost(d.id) || d.id === undefined) return;
        if (hasClass(el, 'box')) { tree.boxes[String(d.id)] = splitFlatBox(d); return; }

        const { taxon, node } = splitFlatNode(d, toAssetId);
        // En v1, l'identité du taxon est celle du nœud.
        const taxonId = node.taxonId || node.id;
        node.taxonId = taxonId;
        taxa[taxonId] = { id: taxonId, ...taxon };
        tree.nodes[node.id] = node;
        if (nonEmpty(d.synonymTargetId)) synonymByNode.set(taxonId, d.synonymTargetId);
    });

    elements.forEach(el => {
        const d = el.data || {};
        const isEdge = el.group === 'edges' || d.source !== undefined;
        if (!isEdge || isGhost(d.id)) return;
        const child = tree.nodes[d.target];
        if (!child || !tree.nodes[d.source]) return;
        if (child.parent === null) child.parent = String(d.source); // un seul parent par nœud dans un arbre
        const edgeExtra = Object.keys(d).filter(k => !['id', 'source', 'target'].includes(k));
        if (edgeExtra.length > 0) child.extra = { ...(child.extra || {}), __edge: pick(d, edgeExtra) };
    });

    synonymByNode.forEach((targetNodeId, taxonId) => {
        const target = tree.nodes[targetNodeId];
        if (target && target.taxonId) taxa[taxonId].synonymOf = target.taxonId;
    });

    const root = findTreeRoot(tree);
    tree.view.currentRootId = (currentRootId && tree.nodes[currentRootId]) ? currentRootId : (root || '');

    return { formatVersion: FORMAT_VERSION, taxa, trees: [tree], activeTreeId: tree.id, assets };
};

// ------------------------------------------
// v2 : vérification et valeurs par défaut
// ------------------------------------------

const normalizeNodes = (raw: any): Record<string, TreeNode> => {
    const nodes: Record<string, TreeNode> = {};
    Object.entries(raw || {}).forEach(([id, n]: [string, any]) => {
        nodes[id] = {
            id,
            taxonId: nonEmpty(n.taxonId) ?? null,
            parent: nonEmpty(n.parent) ?? null,
            box: nonEmpty(n.box) ?? null,
            sortIndex: num(n.sortIndex) ?? 0,
            structure: n.structure || {},
            style: n.style || {},
            support: n.support ?? null,
            highlight: nonEmpty(n.highlight) ?? null,
            branch: n.branch ?? null,
            ...(n.extra ? { extra: n.extra } : {}),
        };
    });
    return nodes;
};
const normalizeBoxes = (raw: any): Record<string, BoxRecord> => {
    const boxes: Record<string, BoxRecord> = {};
    Object.entries(raw || {}).forEach(([id, b]: [string, any]) => { boxes[id] = { id, parentBox: nonEmpty(b.parentBox) ?? null, data: b.data || {} }; });
    return boxes;
};

const normalizeV2 = (raw: any): PhyloDoc => {
    const taxa: Record<string, TaxonRecord> = {};
    Object.entries(raw.taxa || {}).forEach(([id, t]: [string, any]) => {
        taxa[id] = {
            id,
            fields: (t && typeof t.fields === 'object' && t.fields) || {},
            images: Array.isArray(t && t.images) ? t.images.filter((i: any) => i && typeof i.asset === 'string') : [],
            audio: (t && t.audio && typeof t.audio.path === 'string') ? t.audio : null,
            synonymOf: nonEmpty(t && t.synonymOf) ?? null,
        };
    });
    const trees: TreeRecord[] = (Array.isArray(raw.trees) ? raw.trees : []).map((tr: any, i: number) => {
        const nodes = normalizeNodes(tr.nodes);
        const boxes = normalizeBoxes(tr.boxes);
        const tree: TreeRecord = { id: nonEmpty(tr.id) ?? `tree-${i + 1}`, name: nonEmpty(tr.name) ?? `Classification ${i + 1}`, nodes, boxes, view: { currentRootId: '' } };
        const cr = tr.view && tr.view.currentRootId;
        tree.view.currentRootId = (cr && nodes[cr]) ? cr : (findTreeRoot(tree) || '');
        // Classifications alternatives par feuille (sheet-variants.ts) et sous-arbres mis de côté.
        if (tr.sheetVariants && typeof tr.sheetVariants === 'object') {
            const sv: Record<string, SheetVariants> = {};
            Object.entries(tr.sheetVariants).forEach(([tid, e]: [string, any]) => {
                const variants = (Array.isArray(e && e.variants) ? e.variants : []).filter((v: any) => v && nonEmpty(v.id)).map((v: any) => ({
                    id: String(v.id), name: nonEmpty(v.name) ?? String(v.id),
                    ...(v.nodes ? { nodes: normalizeNodes(v.nodes) } : {}),
                    ...(v.boxes ? { boxes: normalizeBoxes(v.boxes) } : {}),
                }));
                if (variants.length > 1 && variants.some((v: any) => v.id === e.active)) sv[tid] = { active: e.active, variants };
            });
            if (Object.keys(sv).length) tree.sheetVariants = sv;
        }
        if (tr.detached && typeof tr.detached === 'object' && Object.keys(tr.detached).length) tree.detached = normalizeNodes(tr.detached);
        return tree;
    });
    if (trees.length === 0) throw new Error('document v2 sans arbre');
    const activeTreeId = trees.some(t => t.id === raw.activeTreeId) ? raw.activeTreeId : trees[0].id;
    const assets: Record<string, string> = {};
    Object.entries(raw.assets || {}).forEach(([id, uri]) => { if (typeof uri === 'string') assets[id] = uri; });
    return { formatVersion: FORMAT_VERSION, app: raw.app, taxa, trees, activeTreeId, assets };
};

// ------------------------------------------
// Point d'entrée
// ------------------------------------------

/** Convertit n'importe quel document reconnu en PhyloDoc v2. Lève FutureFormatError ou Error sinon. */
export const migrate = (raw: any): PhyloDoc => {
    if (!raw || typeof raw !== 'object') throw new Error('document vide ou illisible');

    const fv = num(raw.formatVersion);
    if (fv !== undefined) {
        if (fv > FORMAT_VERSION) throw new FutureFormatError(fv);
        if (fv === 2) return normalizeV2(raw);
    }

    // v1 : le champ "version" valait toujours "1.0", on se fie donc à la présence de graph.
    if (raw.graph) {
        const currentRootId = (raw.state && raw.state.currentRootId) || raw.currentRootId;
        return elementsToDoc(flattenElements(raw.graph), currentRootId);
    }
    throw new Error('format de document inconnu');
};

// ------------------------------------------
// v2 → v1 (copie compatible CladisTree 1.3)
// ------------------------------------------

/**
 * Document au format ≤ 1.3 pour une classification. Pertes : autres classifications, images au-delà
 * de la vignette et de l'illustration, audio, supports, surlignage, styles de branche.
 */
export const toLegacyV1 = (doc: PhyloDoc, treeId?: string): { version: string; currentRootId: string; graph: { elements: CyElement[] } } => {
    const tree = doc.trees.find(t => t.id === (treeId || doc.activeTreeId)) || doc.trees[0];
    const taxonToNode = new Map<string, string>();
    Object.values(tree.nodes).forEach(n => { if (n.taxonId) taxonToNode.set(n.taxonId, n.id); });

    const LEGACY_DROP = ['taxonId', 'support', 'highlight', 'branch', 'audio', 'extraImages'];
    const elements: CyElement[] = [];
    Object.values(tree.boxes).forEach(b => elements.push({ group: 'nodes', classes: 'box', data: joinFlatBox(b) }));
    Object.values(tree.nodes).forEach(n => {
        const taxon = (n.taxonId && doc.taxa[n.taxonId]) || { id: n.id, fields: {}, images: [], audio: null, synonymOf: null };
        const d = joinFlatNode(taxon, n, id => doc.assets[id] || '');
        LEGACY_DROP.forEach(k => delete d[k]);
        const edge = d.__edge; delete d.__edge;
        d.synonymTargetId = (taxon.synonymOf && taxonToNode.get(taxon.synonymOf)) || null;
        elements.push({ group: 'nodes', classes: 'taxon', data: d });
        if (n.parent) elements.push({ group: 'edges', data: { ...(edge || {}), source: n.parent, target: n.id } });
    });
    return { version: '1.0', currentRootId: findTreeRoot(tree) || tree.view.currentRootId, graph: { elements } };
};
