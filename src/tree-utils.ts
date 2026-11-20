// ==========================================
// OUTILS DE STRUCTURE DE L'ARBRE
// ==========================================
// La racine d'un arbre n'est pas toujours le nœud d'identifiant « root » : un arbre importé d'XMind,
// par exemple, a pour racine l'identifiant du sujet central. La racine est donc le nœud taxon SANS
// parent (les boîtes sont des nœuds composés, pas des parents dans l'arbre).

/** Vrai si le nœud est une racine de l'arbre (aucun parent taxon). */
export const isTreeRoot = (node: any): boolean =>
    !!node && node.length > 0 && !node.hasClass('box')
    && node.incomers('node').filter((n: any) => !n.hasClass('box') && n.id() !== 'ghost-node').length === 0;

/** Identifiant de la racine de l'arbre (premier nœud taxon sans parent), ou 'root' à défaut. */
export const findTreeRootId = (cy: any): string => {
    const root = cy.nodes('.taxon').filter((n: any) => n.id() !== 'ghost-node' && isTreeRoot(n)).first();
    return root.length > 0 ? root.id() : 'root';
};

/** Enfants affichés d'un nœud, dans l'ordre de l'arbre (`sortIndex`). Un nœud replié ou un renvoi de feuille n'en a pas. */
const shownChildren = (node: any): any[] =>
    node.outgoers('node')
        .filter((c: any) => !c.hasClass('box') && !c.hasClass('romer-spindle') && c.id() !== 'ghost-node' && c.visible())
        .toArray()
        .sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0));

/**
 * Nœuds affichés de la feuille courante en ordre préfixe (parent avant ses enfants, enfants dans l'ordre de
 * `sortIndex`) : c'est l'ordre vertical de toutes les mises en page (cladogramme, dendrogramme, chronogramme).
 */
export const displayOrder = (cy: any, rootId: string): any[] => {
    const out: any[] = [];
    const root = cy.$id(rootId);
    if (root.length === 0 || !root.visible()) return out;
    const stack = [root];
    while (stack.length) {
        const n = stack.pop();
        out.push(n);
        const kids = shownChildren(n);
        for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
    }
    return out;
};

/** Vrai si le nœud est un taxon terminal À L'ÉCRAN (aucun enfant affiché : feuille, clade replié, renvoi de feuille). */
export const isShownTerminal = (node: any): boolean => shownChildren(node).length === 0;

/**
 * Taxon terminal affiché le plus proche dans le sens donné (+1 = suivant / plus bas, -1 = précédent / plus haut).
 * Depuis une divergence : suivant = premier terminal de son clade, précédent = dernier terminal avant lui.
 */
export const adjacentTerminal = (cy: any, rootId: string, node: any, dir: 1 | -1): any | null => {
    const order = displayOrder(cy, rootId);
    const i = order.findIndex(n => n.id() === node.id());
    if (i < 0) return null;
    for (let j = i + dir; j >= 0 && j < order.length; j += dir) {
        if (isShownTerminal(order[j])) return order[j];
    }
    return null;
};

/**
 * Fait glisser la vue (sans zoomer) pour que le nœud soit visible, s'il ne l'est pas déjà.
 * `insetRight` : largeur masquée à droite du canevas (fiche ouverte), en pixels d'écran.
 */
export const panIntoView = (cy: any, node: any, insetRight = 0) => {
    const W = cy.width() - insetRight, H = cy.height(), m = 60;
    const p = node.renderedPosition();
    if (p.x > m && p.x < W - m && p.y > m && p.y < H - m) return;
    const pan = cy.pan();
    const dx = p.x < m || p.x > W - m ? W / 2 - p.x : 0;
    const dy = p.y < m || p.y > H - m ? H / 2 - p.y : 0;
    cy.stop(true, true);
    cy.animate({ pan: { x: pan.x + dx, y: pan.y + dy } }, { duration: 200 });
};
