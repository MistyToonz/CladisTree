// ==========================================
// ZONE DE CLIC DES DIVERGENCES SANS NOM
// ==========================================
// Une divergence sans nom est un nœud de 0,1 px (rien n'est dessiné) : Cytoscape ne le détecte qu'à
// 2 px près, il était donc presque impossible à sélectionner ou à saisir. Cytoscape n'ayant pas de zone
// de clic distincte du dessin, on complète sa recherche de l'élément sous le pointeur (renderer
// `findNearestElements`, utilisée pour le survol, le clic, le double-clic et le glisser) : si aucun nœud
// n'est touché, la divergence sans nom la plus proche dans un rayon de HIT_RADIUS pixels d'écran est
// retenue, de préférence à une branche (elle se trouve toujours à la jonction de plusieurs branches).
// Le dessin n'est pas modifié.

export const HIT_RADIUS = 12; // pixels d'écran, quel que soit le zoom

export function enlargeEmptyNodeHitbox(cy: any) {
    const renderer = cy.renderer && cy.renderer();
    if (!renderer || typeof renderer.findNearestElements !== 'function') return;
    // Liste des divergences sans nom, recalculée seulement après un changement (ajout, retrait, données).
    let empties: any = null;
    const invalidate = () => { empties = null; };
    cy.on('add remove data', 'node', invalidate);
    const emptyNodes = () => (empties = empties || cy.nodes('[?isEmpty]').not('.box'));

    const original = renderer.findNearestElements;
    renderer.findNearestElements = function (x: number, y: number, interactiveOnly: boolean, isTouch: boolean) {
        const found: any[] = original.call(this, x, y, interactiveOnly, isTouch);
        if (found.some(e => e.isNode())) return found;
        const r = (isTouch ? HIT_RADIUS * 1.5 : HIT_RADIUS) / cy.zoom();
        let best: any = null, bestD = r * r;
        emptyNodes().forEach((n: any) => {
            if (!n.visible()) return;
            const p = n.position();
            const dx = p.x - x, dy = p.y - y;
            if (Math.abs(dx) > r || Math.abs(dy) > r) return;
            const d = dx * dx + dy * dy;
            if (d <= bestD) { bestD = d; best = n; }
        });
        return best ? [best, ...found.filter(e => !e.isNode())] : found;
    };
}
