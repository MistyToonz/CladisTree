// ==========================================
// IMAGES DES FICHES : PLACEMENT + COMPOSITION À L'EXPORT
// ==========================================
// À l'écran, les images sont des <img> dans un calque HTML posé sur le canevas Cytoscape
// (#html-image-layer, voir syncHtmlImages dans renderer.ts). cy.png()/cy.jpg()/cy.svg() ne capturent
// que le canevas : il faut donc recomposer les images sur le résultat de l'export.
// Le placement est calculé ici, en coordonnées du modèle, et partagé par l'écran et l'export.

import { resolveAsset } from './asset-store';

/** Une image à dessiner, en coordonnées du modèle Cytoscape (centre + taille). */
export type ImagePlacement = {
    id: string;
    url: string;
    cx: number;
    cy: number;
    w: number;
    h: number;
    selected: boolean;
};

type BBox = { x1: number; y1: number; x2: number; y2: number; w: number; h: number };

/** Images visibles du graphe, mêmes règles que l'affichage. */
export const getImagePlacements = (cy: any, layoutMode: string, currentRootId: string | null): ImagePlacement[] => {
    const out: ImagePlacement[] = [];
    // Clades dessinés en fuseau par le romérogramme (nom porté par le fuseau) : pas d'image, le fuseau occupe la place.
    const romerClades = cy.scratch('_romerUnlabeled');
    // Image d'abord (lecture de donnée, peu coûteuse), visibilité ensuite (calcul de style) : sur un grand arbre,
    // la plupart des nœuds n'ont pas d'image.
    cy.nodes().forEach((n: any) => {
        const raw = n.data('imgUrl');
        if (!raw || n.hasClass('box') || !n.visible()) return;

        // En chronogramme, tous les taxons sont illustrés (placement : layout-engine.ts, bande réservée / après le nom).
        if (layoutMode === 'chrono' && romerClades && romerClades.has(n)) return;

        // Référence « asset:<id> » (format 1.4) ou data URI : toujours résolue en URL affichable.
        const url = resolveAsset(raw);
        if (!url || String(url).trim() === '') return;

        const pos = n.position();
        const size = n.data('imgSize') || 150;
        const ratio = n.data('imgRatio') || 1;
        out.push({
            id: n.id(),
            url,
            cx: pos.x + (n.data('imgOffsetX') || 0),
            cy: pos.y + (n.data('imgOffsetY') || 0),
            w: size,
            h: size / ratio,
            selected: n.selected(),
        });
    });
    return out;
};

/** Boîte englobante (modèle) du graphe et des images : les images peuvent dépasser du graphe. */
const unionBox = (bb: BBox, imgs: ImagePlacement[]) => {
    let x1 = bb.x1, y1 = bb.y1, x2 = bb.x2, y2 = bb.y2;
    imgs.forEach(p => {
        x1 = Math.min(x1, p.cx - p.w / 2); x2 = Math.max(x2, p.cx + p.w / 2);
        y1 = Math.min(y1, p.cy - p.h / 2); y2 = Math.max(y2, p.cy + p.h / 2);
    });
    return { x1, y1, x2, y2, w: x2 - x1, h: y2 - y1 };
};

const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
});

/** Rectangle « object-fit: contain » de l'image naturelle dans la boîte (x, y, w, h). */
const containRect = (natW: number, natH: number, x: number, y: number, w: number, h: number) => {
    if (!natW || !natH) return { x, y, w, h };
    const k = Math.min(w / natW, h / natH);
    const dw = natW * k, dh = natH * k;
    return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
};

/**
 * Compose les images sur un export raster de Cytoscape (`cy.png/jpg({ full: true })`).
 * @param graphUri  data URI renvoyée par Cytoscape
 * @param bb        cy.mutableElements().boundingBox() au moment de l'export (origine utilisée par Cytoscape)
 * @param bg        couleur de fond, ou 'transparent'
 */
export const composeImagesOnRaster = async (
    graphUri: string, bb: BBox, imgs: ImagePlacement[], bg: string, mime: 'image/png' | 'image/jpeg'
): Promise<string> => {
    if (imgs.length === 0) return graphUri;

    const graph = await loadImage(graphUri);
    // Échelle réelle (facteur d'export × densité de pixels), déduite de la taille produite par Cytoscape.
    const s = graph.width / Math.max(1, Math.ceil(bb.w));
    const u = unionBox(bb, imgs);

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(u.w * s);
    canvas.height = Math.ceil(u.h * s);
    const ctx = canvas.getContext('2d');
    if (!ctx) return graphUri;

    if (bg && bg !== 'transparent') {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(graph, (bb.x1 - u.x1) * s, (bb.y1 - u.y1) * s);

    for (const p of imgs) {
        try {
            const img = await loadImage(p.url);
            const r = containRect(img.naturalWidth, img.naturalHeight,
                (p.cx - p.w / 2 - u.x1) * s, (p.cy - p.h / 2 - u.y1) * s, p.w * s, p.h * s);
            ctx.drawImage(img, r.x, r.y, r.w, r.h);
        } catch (err) {
            console.warn(`Image du nœud ${p.id} ignorée à l'export :`, err);
        }
    }
    return canvas.toDataURL(mime, 0.95);
};

/** Ajoute les images dans un export SVG de cytoscape-svg (`cy.svg({ full: true })`). */
export const injectImagesInSvg = (svgText: string, bb: BBox, imgs: ImagePlacement[], bg: string): string => {
    if (imgs.length === 0) return svgText;

    const SVG_NS = 'http://www.w3.org/2000/svg';
    const XLINK_NS = 'http://www.w3.org/1999/xlink';
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.documentElement;
    if (!root || root.nodeName !== 'svg') return svgText;

    const oldW = parseFloat(root.getAttribute('width') || '0');
    const s = oldW / Math.max(1, Math.ceil(bb.w));
    if (!s || !isFinite(s)) return svgText;
    const u = unionBox(bb, imgs);
    const dx = (bb.x1 - u.x1) * s, dy = (bb.y1 - u.y1) * s;
    const newW = Math.ceil(u.w * s), newH = Math.ceil(u.h * s);

    // Décale le dessin existant (tout sauf <defs>) si les images agrandissent le cadre.
    const content = doc.createElementNS(SVG_NS, 'g');
    if (dx !== 0 || dy !== 0) content.setAttribute('transform', `translate(${dx},${dy})`);
    Array.from(root.childNodes).forEach(child => {
        if (child.nodeName !== 'defs') content.appendChild(child);
    });
    if (bg && bg !== 'transparent' && (newW !== oldW || dx !== 0 || dy !== 0)) {
        const rect = doc.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', '0'); rect.setAttribute('y', '0');
        rect.setAttribute('width', String(newW)); rect.setAttribute('height', String(newH));
        rect.setAttribute('fill', bg);
        root.appendChild(rect);
    }
    root.appendChild(content);
    root.setAttribute('width', String(newW));
    root.setAttribute('height', String(newH));

    const layer = doc.createElementNS(SVG_NS, 'g');
    layer.setAttribute('id', 'taxon-images');
    imgs.forEach(p => {
        const el = doc.createElementNS(SVG_NS, 'image');
        el.setAttribute('x', String((p.cx - p.w / 2 - u.x1) * s));
        el.setAttribute('y', String((p.cy - p.h / 2 - u.y1) * s));
        el.setAttribute('width', String(p.w * s));
        el.setAttribute('height', String(p.h * s));
        el.setAttribute('preserveAspectRatio', 'xMidYMid meet'); // = object-fit: contain
        el.setAttribute('href', p.url);
        el.setAttributeNS(XLINK_NS, 'xlink:href', p.url); // anciens logiciels (Inkscape < 1.0, Illustrator)
        layer.appendChild(el);
    });
    root.appendChild(layer);

    return new XMLSerializer().serializeToString(doc);
};
