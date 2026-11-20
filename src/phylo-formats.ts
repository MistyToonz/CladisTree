// ==========================================
// FORMATS D'ARBRES : NEWICK, NEXUS, TNT (phase 3) — fonctions pures
// ==========================================
// Lecture → arbre simple (SimpleNode) → document au format 1.3 (`toLegacyDoc`), qui passe ensuite par
// migrate() comme tout document entrant (ouverture ou greffe). Écriture : depuis un arbre simple.
//   - Newick : étiquettes entre apostrophes ('' = apostrophe), « _ » = espace hors apostrophes,
//     commentaires [ … ] ignorés, longueurs de branche « :x » conservées (`branchLength`).
//   - Étiquettes INTERNES : nom de clade ou valeur de support (bootstrap, probabilité postérieure).
//     Mode « auto » : un nombre = support, sinon nom ; l'utilisateur peut imposer l'un ou l'autre.
//   - NEXUS : bloc TREES (TRANSLATE pris en compte), premier arbre ; à l'écriture, blocs TAXA et TREES.
//   - TNT : commandes `tread` (taxons par numéro, à partir de 0, ou par nom ; arbres séparés par « * »),
//     noms pris dans `xread` ou `taxname`. Étiquettes d'arbre TNT (`ttags` : supports, bootstrap,
//     jackknife…) lues par un lecteur dédié, AVANT toute conversion (les crochets ne sont pas des
//     commentaires ici) : « =11 » valeur ; « =[19] » valeur entre crochets (groupe contredit par un groupe
//     plus fréquent : `supportBracketed`) ; « =6/? » plusieurs valeurs (« ? » ou vide = aucune ; 1re gardée,
//     `chooseSupportColumn` pour une autre) ; « = » ou « =/ » sur un taxon terminal : ignoré.

/** Une valeur d'étiquette TNT : nombre (ou null pour « ? » / vide), entre crochets ou non. */
export type TntValue = { value: number | null; bracketed: boolean };
/**
 * `rank` : valeur canonique de la fiche (« Genre », « Espèce », « Sous-espèce »), posée par inferTaxonomy.
 * `supportBracketed` : valeur de support écrite entre crochets par TNT (« [19] »).
 * `tags` : toutes les valeurs d'une étiquette TNT (« 6/? »), pour choisir laquelle sert de support.
 */
export type SimpleNode = { name: string; length?: number; support?: number; supportBracketed?: boolean; tags?: TntValue[]; rank?: string; children: SimpleNode[] };
export type InternalLabels = 'auto' | 'support' | 'name';

const isNumeric = (s: string) => /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());

// ------------------------------------------
// Newick
// ------------------------------------------

/** Lit UN arbre Newick (jusqu'au « ; »). */
export const parseNewick = (text: string, internal: InternalLabels = 'auto'): SimpleNode => {
    let i = 0;
    const s = text;
    const skipSpaceAndComments = () => {
        for (;;) {
            while (i < s.length && /\s/.test(s[i])) i++;
            if (s[i] === '[') { const j = s.indexOf(']', i); if (j < 0) throw new Error('commentaire [ … ] non fermé'); i = j + 1; continue; }
            break;
        }
    };
    const readLabel = (): string => {
        skipSpaceAndComments();
        if (s[i] === "'") {
            let out = ''; i++;
            for (;;) {
                if (i >= s.length) throw new Error("étiquette entre apostrophes non fermée");
                if (s[i] === "'") { if (s[i + 1] === "'") { out += "'"; i += 2; continue; } i++; break; }
                out += s[i++];
            }
            return out;
        }
        let out = '';
        while (i < s.length && !/[(),:;[\]\s]/.test(s[i])) out += s[i++];
        return out.replace(/_/g, ' ');
    };
    const readNode = (): SimpleNode => {
        skipSpaceAndComments();
        const node: SimpleNode = { name: '', children: [] };
        if (s[i] === '(') {
            i++;
            for (;;) {
                node.children.push(readNode());
                skipSpaceAndComments();
                if (s[i] === ',') { i++; continue; }
                if (s[i] === ')') { i++; break; }
                throw new Error(`« , » ou « ) » attendu en position ${i}`);
            }
        }
        const label = readLabel().trim();
        if (label) {
            if (node.children.length > 0 && internal !== 'name' && isNumeric(label)) node.support = parseFloat(label);
            else if (node.children.length > 0 && internal === 'support' && !isNumeric(label)) node.name = label; // non numérique : forcément un nom
            else node.name = label;
        }
        skipSpaceAndComments();
        if (s[i] === ':') { i++; skipSpaceAndComments(); let num = ''; while (i < s.length && /[0-9eE.+-]/.test(s[i])) num += s[i++]; const v = parseFloat(num); if (isFinite(v)) node.length = v; }
        return node;
    };
    skipSpaceAndComments();
    if (s[i] !== '(' && !/[^\s;]/.test(s[i] || '')) throw new Error('arbre Newick vide');
    const root = readNode();
    skipSpaceAndComments();
    if (s[i] !== ';' && i < s.length) throw new Error(`« ; » attendu en position ${i}`);
    return root;
};

const quoteLabel = (name: string) => (/^[^\s(),:;'[\]_]+$/.test(name) ? name : (/^[^(),:;'[\]_]+$/.test(name) ? name.replace(/ /g, '_') : `'${name.replace(/'/g, "''")}'`));

/** Écrit un arbre Newick. Étiquettes internes : noms de clades (défaut) ou valeurs de support. */
export const writeNewick = (root: SimpleNode, internal: 'name' | 'support' = 'name', label: (n: SimpleNode) => string = n => quoteLabel(n.name)): string => {
    const w = (n: SimpleNode): string => {
        let out = '';
        if (n.children.length) {
            out += '(' + n.children.map(w).join(',') + ')';
            // Une seule étiquette interne possible : la préférée, sinon l'autre (rien n'est perdu sans raison).
            const sup = n.support !== undefined ? String(n.support) : '';
            const nm = n.name ? label(n) : '';
            out += internal === 'support' ? (sup || nm) : (nm || sup);
        } else out += label(n);
        if (n.length !== undefined) out += ':' + n.length;
        return out;
    };
    return w(root) + ';';
};

// ------------------------------------------
// NEXUS
// ------------------------------------------

const renameLeaves = (n: SimpleNode, map: Map<string, string>) => {
    if (n.children.length === 0 && map.has(n.name)) n.name = map.get(n.name)!;
    n.children.forEach(c => renameLeaves(c, map));
};

/** Premier arbre du bloc TREES d'un fichier NEXUS (TRANSLATE appliqué). */
export const parseNexus = (text: string, internal: InternalLabels = 'auto'): ParsedTreeFile => {
    // Bloc lu jusqu'à « END; » ou, à défaut, jusqu'à la fin du fichier (fichier non refermé).
    const block = text.match(/begin\s+trees\s*;([\s\S]*?)(?:\bend(?:block)?\s*;|$)/i);
    if (!block) throw new NoTreeError('nexus');
    const body = block[1];
    const map = new Map<string, string>();
    // Sans TRANSLATE, des feuilles numérotées renvoient à TAXLABELS (bloc TAXA, numérotation à partir de 1).
    const labels = text.match(/\btaxlabels\b([\s\S]*?);/i);
    if (labels) (labels[1].match(/'(?:[^']|'')*'|[^\s']+/g) || []).forEach((l, k) =>
        map.set(String(k + 1), l.startsWith("'") ? l.slice(1, -1).replace(/''/g, "'") : l.replace(/_/g, ' ')));
    const tr = body.match(/translate([\s\S]*?);/i);
    if (tr) {
        tr[1].split(',').forEach(entry => {
            const m = entry.trim().match(/^(\S+)\s+('(?:[^']|'')*'|\S+)$/);
            if (m) map.set(m[1], m[2].startsWith("'") ? m[2].slice(1, -1).replace(/''/g, "'") : m[2].replace(/_/g, ' '));
        });
    }
    // Chaque arbre jusqu'à son « ; » (le dernier peut en manquer) ; « ; » hors apostrophes et commentaires.
    const trees = [...body.matchAll(/\btree\s+[^=]+=\s*((?:'(?:[^']|'')*'|\[[^\]]*\]|[^;'[])*)(?:;|$)/gi)].filter(m => m[1].includes('('));
    if (trees.length === 0) throw new Error('aucun arbre dans le bloc TREES');
    const all = trees.map(m => { const tree = parseNewick(m[1] + ';', internal); if (map.size) renameLeaves(tree, map); return tree; });
    return { tree: all[0], all, treeCount: trees.length };
};

export const writeNexus = (root: SimpleNode, internal: 'name' | 'support' = 'name'): string => {
    const leaves: string[] = [];
    const collect = (n: SimpleNode) => { if (n.children.length === 0) leaves.push(n.name); n.children.forEach(collect); };
    collect(root);
    const idx = new Map(leaves.map((name, k) => [name, String(k + 1)]));
    const q = (name: string) => `'${name.replace(/'/g, "''")}'`;
    return [
        '#NEXUS', '',
        'BEGIN TAXA;', `    DIMENSIONS NTAX=${leaves.length};`, `    TAXLABELS ${leaves.map(q).join(' ')};`, 'END;', '',
        'BEGIN TREES;', '    TRANSLATE',
        leaves.map((name, k) => `        ${k + 1} ${q(name)}`).join(',\n') + ';',
        `    TREE tree1 = ${writeNewick(root, internal, n => (n.children.length === 0 ? idx.get(n.name)! : quoteLabel(n.name)))}`,
        'END;', '',
    ].join('\n');
};

// ------------------------------------------
// TNT
// ------------------------------------------

/** Fichier sans arbre (matrice de données seule) : message explicite plutôt qu'une erreur d'analyse. */
export class NoTreeError extends Error {
    constructor(public kind: 'tnt' | 'nexus') { super(kind === 'tnt' ? 'commande tread introuvable' : 'bloc TREES introuvable'); }
}

export type ParsedTreeFile = {
    tree: SimpleNode; treeCount: number;
    /** Tous les arbres du fichier (le premier = `tree`). */
    all?: SimpleNode[];
    /** TNT : des feuilles sont restées numérotées (noms absents du fichier d'arbres). */
    numbered?: boolean;
    /** TNT : fichier de données indiqué par TNT dans le commentaire de `tread` (« for data in … »). */
    dataPath?: string;
    /** TNT : pour chaque arbre de `all`, porte-t-il au moins une valeur d'étiquette (support) ? */
    labeled?: boolean[];
};

/** Noms des taxons d'un fichier TNT, dans l'ordre (numéro = position) : `xread` puis `taxname+`. */
export const tntTaxonNames = (text: string): string[] => {
    const clean = text.replace(/'[^']*'/g, ' ');
    const names: string[] = [];
    const xr = clean.match(/\bxread\b([\s\S]*?);/i);
    if (xr) {
        const lines = xr[1].split(/\r?\n/).map(l => l.trim()).filter(l => l);
        const dims = lines.findIndex(l => /^\d+\s+\d+$/.test(l));
        lines.slice(dims + 1).forEach(l => { const name = l.split(/\s+/)[0]; if (name && !/^[&[]/.test(name)) names.push(name.replace(/_/g, ' ')); });
    }
    [...clean.matchAll(/\btaxname\s*\+\s*(\S+)/gi)].forEach(m => names.push(m[1].replace(/_/g, ' ')));
    return names;
};

const TNT_PLACEHOLDER = /^Taxon (\d+)$/;
/** Nomme les feuilles restées numérotées (« Taxon 3 ») avec la liste de noms d'un fichier de données TNT. */
export const nameTntLeaves = (tree: SimpleNode, names: string[]): number => {
    let named = 0;
    const walk = (n: SimpleNode) => {
        const m = n.children.length === 0 && n.name.match(TNT_PLACEHOLDER);
        if (m && names[parseInt(m[1], 10)]) { n.name = names[parseInt(m[1], 10)]; named++; }
        n.children.forEach(walk);
    };
    walk(tree);
    return named;
};

/** « 6/[3]/? » → valeurs (sans le « = »). « ? », vide ou non numérique = pas de valeur. */
export const parseTntTag = (raw: string): TntValue[] => raw.split('/').map(part => {
    const t = part.trim();
    const m = t.match(/^\[(.*)\]$/);
    const inner = m ? m[1].trim() : t;
    return isNumeric(inner) ? { value: parseFloat(inner), bracketed: !!m } : { value: null, bracketed: false };
});

/** Pose comme support la valeur n° `k` (à partir de 0) des étiquettes TNT de tout l'arbre. */
export const chooseSupportColumn = (tree: SimpleNode, k: number) => {
    const walk = (n: SimpleNode) => {
        if (n.tags) {
            const v = n.tags[k];
            if (v && v.value !== null) { n.support = v.value; if (v.bracketed) n.supportBracketed = true; else delete n.supportBracketed; }
            else { delete n.support; delete n.supportBracketed; }
        }
        n.children.forEach(walk);
    };
    walk(tree);
};

/** Nombre de valeurs utiles par étiquette (dernière position portant une valeur, sur tout l'arbre). */
export const supportColumnsOf = (tree: SimpleNode): number => {
    let cols = 0;
    const walk = (n: SimpleNode) => {
        (n.tags || []).forEach((v, k) => { if (v.value !== null) cols = Math.max(cols, k + 1); });
        n.children.forEach(walk);
    };
    walk(tree);
    return cols;
};

/** Étiquettes TNT à plusieurs valeurs, telles qu'écrites (« 6/3 »), pour les montrer à l'utilisateur. */
export const tntTagExamples = (tree: SimpleNode, max = 4): string[] => {
    const out: string[] = [];
    const fmt = (v: TntValue) => (v.value === null ? '?' : v.bracketed ? `[${v.value}]` : String(v.value));
    const walk = (n: SimpleNode) => {
        if (out.length < max && n.tags && n.tags.length > 1 && n.tags.some(v => v.value !== null)) out.push(n.tags.map(fmt).join('/'));
        n.children.forEach(walk);
    };
    walk(tree);
    return out;
};

/**
 * UN arbre TNT, du premier « ( » jusqu'à la parenthèse qui le referme et son étiquette ; le reste est ignoré
 * (« proc/ » d'un fichier refermé…). Éléments séparés par des espaces (virgules tolérées) ; étiquette
 * « =… » collée ou non à ce qu'elle suit.
 */
const readTntTree = (src: string): SimpleNode => {
    type Tok = { k: '(' | ')' | 'w' | 'l'; v: string };
    const toks: Tok[] = [];
    for (let i = 0; i < src.length;) {
        const c = src[i];
        if (/[\s,]/.test(c)) { i++; continue; }
        if (c === '(' || c === ')') { toks.push({ k: c, v: c }); i++; continue; }
        let j = i + 1;
        if (c === '=') { while (j < src.length && !/[\s()]/.test(src[j])) j++; toks.push({ k: 'l', v: src.slice(i + 1, j) }); }
        else { while (j < src.length && !/[\s(),=]/.test(src[j])) j++; toks.push({ k: 'w', v: src.slice(i, j) }); }
        i = j;
    }
    let p = 0;
    const readNode = (): SimpleNode => {
        const tk = toks[p];
        let node: SimpleNode;
        if (tk.k === '(') {
            p++;
            node = { name: '', children: [] };
            for (;;) {
                if (p >= toks.length) throw new Error('arbre TNT : parenthèse non fermée');
                if (toks[p].k === ')') { p++; break; }
                if (toks[p].k === 'l') { p++; continue; }   // étiquette sans nœud : ignorée
                node.children.push(readNode());
            }
        } else if (tk.k === 'w') {
            p++;
            node = { name: tk.v.replace(/_/g, ' '), children: [] };
        } else throw new Error('arbre TNT : « ( » ou un taxon attendu');
        // Étiquette(s) qui suivent : support d'un nœud interne ; sur un taxon terminal, ignorée (« =/ »).
        while (p < toks.length && toks[p].k === 'l') {
            const tags = parseTntTag(toks[p++].v);
            if (node.children.length > 0 && !node.tags) {
                node.tags = tags;
                const first = tags[0];
                if (first && first.value !== null) { node.support = first.value; if (first.bracketed) node.supportBracketed = true; }
            }
        }
        return node;
    };
    if (toks.length === 0 || toks[0].k !== '(') throw new Error('arbre TNT vide');
    return readNode();
};

/**
 * Arbres d'un fichier TNT (`tread`). Taxons numérotés à partir de 0, nommés via `xread` ou `taxname` du
 * même fichier ; sinon « Taxon n » et `numbered` (les noms sont dans le fichier de données, souvent
 * indiqué par TNT lui-même : `tread 'tree(s) from TNT, for data in C:\…\données.tnt'`).
 * Étiquettes d'arbre (`ttags`) : voir l'en-tête du fichier ; `labeled` dit quels arbres en portent.
 */
export const parseTnt = (text: string): ParsedTreeFile => {
    const names = tntTaxonNames(text);
    const dataPath = (text.match(/\btread\s*'[^']*?for data in\s+([^']+?)\s*'/i) || [])[1];
    const clean = text.replace(/'[^']*'/g, ' ');
    // Jusqu'au « ; » ou, à défaut, à la fin du fichier : TNT laisse le fichier ouvert tant que « tsave » n'est
    // pas refermé (« tsave / ; »), et le dernier arbre (souvent le consensus) n'a alors ni « ; » ni « proc ».
    const tr = clean.match(/\btread\b([^;]*)(?:;|$)/i);
    if (!tr) throw new NoTreeError('tnt');
    // Arbres séparés par « * » ; chacun commence à sa première parenthèse.
    const trees = tr[1].split('*').map(x => x.slice(Math.max(0, x.indexOf('(')))).filter(x => x.trim().startsWith('('));
    if (trees.length === 0) throw new NoTreeError('tnt');
    let numbered = false;
    const rename = (n: SimpleNode) => {
        if (n.children.length === 0 && /^\d+$/.test(n.name)) {
            const k = parseInt(n.name, 10);
            if (names[k]) n.name = names[k]; else { n.name = `Taxon ${k}`; numbered = true; }
        }
        n.children.forEach(rename);
    };
    const all = trees.map(t => { const tree = readTntTree(t); rename(tree); return tree; });
    const labeled = all.map(tree => supportColumnsOf(tree) > 0);
    return { tree: all[0], all, treeCount: trees.length, labeled, ...(numbered ? { numbered } : {}), ...(dataPath ? { dataPath } : {}) };
};

/**
 * Octets d'un fichier texte → texte. UTF-8 si valide, sinon Windows-1252 (fichiers écrits par TNT,
 * PAUP ou d'anciens logiciels sous Windows : « é » sur un seul octet).
 */
export const decodeText = (bytes: Uint8Array): string => {
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { text = new TextDecoder('windows-1252').decode(bytes); }
    return text.replace(/^\uFEFF/, '');
};

// ------------------------------------------
// Conversions
// ------------------------------------------

/** Arbre simple depuis un nœud Cytoscape (descendants dans l'ordre d'affichage ; fuseaux et boîtes exclus). */
export const fromCyNode = (n: any): SimpleNode => {
    const kids = n.outgoers('node').filter((c: any) => !c.hasClass('box') && !c.hasClass('romer-spindle') && c.id() !== 'ghost-node')
        .sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0));
    const sup = n.data('support');
    // Entre crochets (TNT) : exportée comme simple nombre, les crochets étant des commentaires en Newick.
    const value = sup && sup.value !== undefined && sup.value !== '' ? parseFloat(String(sup.value).replace(/[[\]\s]/g, '')) : NaN;
    const len = parseFloat(String(n.data('branchLength')));
    // Genre à une seule espèce (rangement de CladisTree) : sauté à l'export, le nom de l'espèce contient déjà
    // le genre et beaucoup de logiciels lisent mal les nœuds à un seul descendant. Longueurs additionnées.
    if (kids.length === 1 && n.data('rank') === 'Genre') {
        const only = fromCyNode(kids[0]);
        if (isFinite(len)) only.length = parseFloat(((only.length || 0) + len).toPrecision(12)); // pas de 0.30000000000000004
        return only;
    }
    return { name: String(n.data('name') || ''), ...(isFinite(value) ? { support: value } : {}), ...(isFinite(len) ? { length: len } : {}), children: kids.map(fromCyNode) };
};

// ------------------------------------------
// Taxonomie des arbres importés
// ------------------------------------------

/** Genre d'un nom d'espèce ou de sous-espèce (« Triceratops horridus » → « Triceratops »), sinon null. */
const speciesRankOf = (name: string): { rank: string; genus: string } | null => {
    const m = name.trim().replace(/^[†+]\s*/, '').match(/^([A-Z][a-z]+)\s+(?:\(([A-Z][a-z]+)\)\s+)?([a-z][\w.-]*)(\s+[a-z][\w.-]*)?$/);
    return m ? { rank: m[4] ? 'Sous-espèce' : 'Espèce', genus: m[1] } : null;
};

/**
 * Reconnaissance Genre / Espèce d'un arbre importé (Newick, NEXUS, TNT), pour que l'affichage des noms
 * complets / raccourcis et la taxonomie intelligente s'appliquent comme sur un arbre saisi à la main, où
 * chaque espèce est rangée sous son genre :
 *  - feuille au nom binominal (ou trinominal) → rang Espèce (Sous-espèce) ;
 *  - genre dont les espèces (au moins deux) forment à elles seules un clade (genre monophylétique ici) :
 *    ce clade devient le nœud Genre s'il est sans nom ; s'il porte déjà un nom, un nœud Genre est inséré
 *    au-dessus de lui ;
 *  - sinon (espèce seule de son genre, ou genre éclaté dans l'arbre) : un nœud Genre est inséré juste
 *    au-dessus de chaque espèce.
 * En noms complets, un genre qui a des enfants n'est pas affiché (comportement habituel de CladisTree).
 * Modifie l'arbre ; renvoie le nombre de nœuds Genre (nommés ou insérés).
 */
export const inferTaxonomy = (root: SimpleNode): number => {
    const parentOf = new Map<SimpleNode, SimpleNode>();
    const byGenus = new Map<string, SimpleNode[]>();
    const walk = (n: SimpleNode) => {
        if (n.children.length === 0) {
            const sp = speciesRankOf(n.name);
            if (sp) {
                n.rank = n.rank || sp.rank;
                if (!byGenus.has(sp.genus)) byGenus.set(sp.genus, []);
                byGenus.get(sp.genus)!.push(n);
            }
        }
        n.children.forEach(c => { parentOf.set(c, n); walk(c); });
    };
    walk(root);
    // Insère un nœud Genre entre `n` et son parent (à la même place parmi les enfants).
    const wrap = (n: SimpleNode, genus: string) => {
        const parent = parentOf.get(n);
        if (!parent || (parent.rank === 'Genre' && parent.name === genus)) return false; // déjà sous ce genre
        const g: SimpleNode = { name: genus, rank: 'Genre', children: [n] };
        parent.children[parent.children.indexOf(n)] = g;
        parentOf.set(g, parent); parentOf.set(n, g);
        return true;
    };
    const leafCount = (n: SimpleNode): number => (n.children.length === 0 ? 1 : n.children.reduce((s, c) => s + leafCount(c), 0));
    let genera = 0;
    byGenus.forEach((leaves, genus) => {
        if (leaves.length >= 2) {
            // Plus petit clade contenant toutes les espèces du genre : remonte depuis la première.
            const inside = new Set(leaves);
            const countIn = (n: SimpleNode): number => (n.children.length === 0 ? (inside.has(n) ? 1 : 0) : n.children.reduce((s, c) => s + countIn(c), 0));
            let mrca: SimpleNode | undefined = parentOf.get(leaves[0]);
            while (mrca && countIn(mrca) < leaves.length) mrca = parentOf.get(mrca);
            if (mrca && leafCount(mrca) === leaves.length) {
                if (!mrca.name.trim() && mrca !== root) { mrca.name = genus; mrca.rank = 'Genre'; genera++; }
                else if (wrap(mrca, genus)) genera++;
                return;
            }
        }
        leaves.forEach(leaf => { if (wrap(leaf, genus)) genera++; });
    });
    return genera;
};

/** Document au format 1.3 (passé ensuite par migrate) ; supports et longueurs de branche conservés. */
export const toLegacyDoc = (root: SimpleNode): { version: string; currentRootId: string; graph: { elements: any[] } } => {
    const elements: any[] = [];
    let k = 0;
    const add = (n: SimpleNode, parent: string | null, order: number): string => {
        const id = `imp-${k++}`;
        const data: any = { id, name: n.name, sortIndex: order };
        if (n.support !== undefined) data.support = { value: n.support, kind: 'support', ...(n.supportBracketed ? { bracketed: true } : {}) };
        if (n.length !== undefined) data.branchLength = n.length;
        if (n.rank) data.rank = n.rank;
        if (n.rank || (n.children.length === 0 && /^[A-Z][a-z]+ [a-z]+/.test(n.name))) data.isItalic = true; // nom latin (genre, espèce)
        elements.push({ group: 'nodes', classes: 'taxon', data });
        if (parent) elements.push({ group: 'edges', data: { source: parent, target: id } });
        n.children.forEach((c, j) => add(c, id, j));
        return id;
    };
    const rootId = add(root, null, 0);
    return { version: '1.0', currentRootId: rootId, graph: { elements } };
};

// ------------------------------------------
// Consensus
// ------------------------------------------

/**
 * Consensus STRICT : uniquement les clades présents dans TOUS les arbres (même ensemble de feuilles exigé,
 * sinon null). Ordre d'affichage : celui des feuilles du premier arbre. Longueurs et supports non repris.
 */
export const strictConsensus = (trees: SimpleNode[]): SimpleNode | null => {
    if (trees.length === 0) return null;
    const leavesOf = (n: SimpleNode): string[] => (n.children.length === 0 ? [n.name] : ([] as string[]).concat(...n.children.map(leavesOf)));
    const order = leavesOf(trees[0]);
    const rank = new Map(order.map((name, k) => [name, k]));
    if (rank.size !== order.length) return null; // noms de feuilles en double : clades ambigus
    const sig = (names: string[]) => names.map(n => rank.get(n)!).sort((a, b) => a - b).join(',');
    const fullSig = sig(order);
    const cladesOf = (t: SimpleNode): Set<string> | null => {
        const out = new Set<string>();
        let ok = true;
        const walk = (n: SimpleNode): string[] => {
            if (n.children.length === 0) { if (!rank.has(n.name)) ok = false; return [n.name]; }
            const names = ([] as string[]).concat(...n.children.map(walk));
            if (names.length > 1) out.add(sig(names));
            return names;
        };
        const all = walk(t);
        return ok && all.length === order.length ? out : null;
    };
    let common: Set<string> | null = cladesOf(trees[0]);
    for (let k = 1; k < trees.length && common; k++) {
        const c = cladesOf(trees[k]);
        if (!c) return null;
        common = new Set([...common].filter(s => c.has(s)));
    }
    if (!common) return null;
    common.add(fullSig);
    // Reconstruction : chaque clade sous le plus petit clade qui le contient.
    const clades = [...common].map(s => s.split(',').map(Number)).sort((a, b) => b.length - a.length);
    const build = (members: number[]): SimpleNode => {
        const inside = new Set(members);
        const subs = clades.filter(c => c.length < members.length && c.every(x => inside.has(x)));
        const maximal = subs.filter(c => !subs.some(d => d.length > c.length && c.every(x => d.includes(x))));
        const covered = new Set(([] as number[]).concat(...maximal));
        const kids: { first: number; node: SimpleNode }[] = [
            ...maximal.map(c => ({ first: Math.min(...c), node: build(c) })),
            ...members.filter(x => !covered.has(x)).map(x => ({ first: x, node: { name: order[x], children: [] } as SimpleNode })),
        ];
        kids.sort((a, b) => a.first - b.first);
        return { name: '', children: kids.map(k => k.node) };
    };
    const root = build(order.map((_, k) => k));
    root.name = trees[0].name || '';
    return root;
};

/** Lit un fichier selon son extension. */
export const parseTreeFile = (text: string, ext: string, internal: InternalLabels = 'auto'): ParsedTreeFile => {
    const e = ext.toLowerCase();
    if (/^\s*#nexus/i.test(text) || ((e === 'nex' || e === 'nexus') && !/\btread\b/i.test(text))) return parseNexus(text, internal);
    if (e === 'tnt' || /\b(tread|xread)\b/i.test(text)) return parseTnt(text);
    // Plusieurs arbres Newick à la suite (un par « ; », hors étiquettes et commentaires).
    const chunks: string[] = [];
    let cur = '', inQuote = false, depth = 0;
    for (const ch of text) {
        cur += ch;
        if (ch === "'") inQuote = !inQuote;
        else if (!inQuote && ch === '[') depth++;
        else if (!inQuote && ch === ']') depth = Math.max(0, depth - 1);
        else if (!inQuote && depth === 0 && ch === ';') { if (cur.trim() !== ';') chunks.push(cur); cur = ''; }
    }
    if (cur.trim()) chunks.push(cur);
    const all = chunks.map(c => parseNewick(c, internal));
    return { tree: all[0], all, treeCount: all.length };
};

/** Étiquettes internes numériques présentes ? (pour demander : supports ou noms de clades). */
export const hasNumericInternalLabels = (text: string): boolean => /\)\s*(\d+\.?\d*|\.\d+)\s*[:,);[]/.test(text);
