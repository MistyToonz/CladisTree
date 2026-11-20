// layout-engine.ts
import cytoscape from 'cytoscape';
import { measureTextWidth } from './utils';
import { chronoAgeToX as axisAgeToX, ChronoAxisMode, ChronoBoundsMode, computeChronoBounds, chronoEdgeStyle, CHRONO_STYLE_SCRATCH, CHRONO_TRUNK_SCRATCH } from './chrono-axis';
export { CHRONO_STYLE_SCRATCH };

/** Espacement horizontal parent → enfant (modes standard et peigne). */
export const STANDARD_X_GAP = 40;
/** Cladogramme : distance (px) entre le bord droit d'un parent et la barre verticale de ses branches (`taxi-turn`). */
export const TAXI_TURN = 15;
/**
 * Distance minimale (px) entre le bord droit du parent et un enfant décalé à la main : l'enfant reste à droite
 * de la barre verticale, avec un bout de branche horizontal (sinon la branche repart vers la gauche et passe
 * sous la barre).
 */
export const MIN_BRANCH_GAP = TAXI_TURN + 10;
/** Plus petit décalage manuel d'une divergence (mode « glisser les divergences »). */
export const MIN_BRANCH_OFFSET = MIN_BRANCH_GAP - STANDARD_X_GAP;

export const CHRONO_EDGE_PAD = 40;
export const CHRONO_BAR_H = 12; 
export const CHRONO_TICK_H = 14; 
export const CHRONO_ROW_MIN = 18;
export const CHRONO_LABEL_GAP = 6; 
export const CHRONO_GAP_MIN = 12; 
export const CHRONO_K_LANE = 2;
export const CHRONO_EMPTY_ROW = 8; 
export const CHRONO_GAP_EMPTY = 4;
export const CHRONO_LABEL_COLUMN = false;
/** Chronogramme : la barre verticale d'une divergence est à au moins 12 px d'elle et à 12 px de son enfant le plus à gauche. */
export const CHRONO_TRUNK_GAP = 12;
/** Chronogramme : écart entre un nom (ou une divergence) et son image. */
export const CHRONO_IMG_GAP = 10;

// --- Écritures minimales (performances, grand arbre) ---
// Chaque donnée, position ou style réécrit sur un élément fait recalculer son style par Cytoscape : le
// chronogramme ne touche donc qu'à ce qui a changé depuis la mise en page précédente.

/** Écrit les données d'un élément seulement si elles changent (même règle que setDataIfChanged dans renderer.ts). */
const setDataIfChanged = (ele: any, values: Record<string, any>) => {
    const changed: Record<string, any> = {};
    let any = false;
    for (const k in values) {
        const v = values[k]; const cur = ele.data(k);
        const same = v !== null && typeof v === 'object' ? JSON.stringify(v) === JSON.stringify(cur) : v === cur;
        if (!same) { changed[k] = v; any = true; }
    }
    if (any) ele.data(changed);
};
const setPositionIfChanged = (n: any, x: number, y: number) => {
    const cur = n.position();
    if (cur.x !== x || cur.y !== y) n.position({ x, y });
};
/**
 * Scratch où est gardé le dernier style posé par le chronogramme sur un élément. Le style n'est effacé et
 * reposé que s'il diffère. Quiconque efface TOUS les styles posés d'un élément (removeStyle() sans argument,
 * cf. refreshLayout au retour en standard) doit retirer ce scratch.
 */
const applyChronoStyle = (ele: any, style: Record<string, any>) => {
    const sig = JSON.stringify(style);
    if (ele.scratch(CHRONO_STYLE_SCRATCH) === sig) return;
    ele.removeStyle();
    ele.style(style);
    ele.scratch(CHRONO_STYLE_SCRATCH, sig);
};

/**
 * Nom d'espèce abrégé écrit sans espace (« H.sapiens ») : remis sous la forme « H. sapiens », pour que
 * l'initiale soit reconnue comme genre (noms complets / compacts, rang automatique).
 */
export const normalizeAbbrev = (s: string): string => s.replace(/^([A-Za-z])([.?]+)(?=[A-Za-z])/, '$1$2 ');

export class LayoutEngine {
    
    static formatSpeciesName(rawSpeciesName: string, shouldAbbreviate: boolean, parentGenus: string = ''): string {
        if (!rawSpeciesName || rawSpeciesName.trim() === '') return '';
        
        const lines = rawSpeciesName.split('\n');
        const firstLine = lines[0];
        const otherLines = lines.slice(1).join('\n');
        
        let prefixMatch = firstLine.match(/^[†+”"«“'’\s]+/);
        let prefix = prefixMatch ? prefixMatch[0] : '';
        let sClean = firstLine.substring(prefix.length).trim();
        
        let suffixMatch = sClean.match(/[”"»”'’\s]+$/);
        let suffix = suffixMatch ? suffixMatch[0] : '';
        if (suffix) sClean = sClean.substring(0, sClean.length - suffix.length);
        sClean = normalizeAbbrev(sClean);

        const words = sClean.split(/[ \t]+/);
        let genus = '';
        let epithets = '';

        if (words.length < 2) {
            if (!parentGenus) return rawSpeciesName; 
            genus = parentGenus;
            epithets = words[0];
        } else {
            genus = words[0];
            epithets = words.slice(1).join(' ');
            
            if (parentGenus && (genus.length <= 2 || genus.replace(/\./g, '').toLowerCase() === parentGenus.toLowerCase())) {
                genus = parentGenus;
            }
        }

        let initial = genus.charAt(0).toUpperCase();
        let fullGenus = initial + (genus.length > 1 ? genus.slice(1).toLowerCase() : '.');

        let formattedFirstLine = '';
        if (shouldAbbreviate && genus.length > 0) {
            formattedFirstLine = prefix + initial + '. ' + epithets + suffix;
        } else {
            formattedFirstLine = prefix + fullGenus + ' ' + epithets + suffix;
        }
        
        return otherLines.length > 0 ? formattedFirstLine + '\n' + otherLines : formattedFirstLine;
    }

    static getDynamicNodeName(node: any, state: any, forceFormat?: 'full' | 'abbrev'): string {
        if (!node) return '';
        const rawName = node.data('name');
        if (!rawName || rawName.trim() === '') return '';
        
        const rank = node.data('rank');
        
        // Format imposé par l'appelant (fiche, PDF) ; sinon, en chronogramme, toujours complet (réglage ignoré).
        const formatToUse = forceFormat || (state.layoutMode === 'chrono' ? 'full' : state.appSettings.speciesFormat);
        
        // Le nom du genre est systématiquement masqué s'il a des enfants et qu'on est en mode complet
        if (formatToUse === 'full' && rank === 'Genre') {
            const hasChildren = node.outgoers && node.outgoers('node').length > 0;
            if (hasChildren) return '';
        }
        
        // VÉRIFICATION STRICTE DU RANG : Le formatage est bloqué pour les taxons non classés
        const isSpeciesRank = rank === 'Espèce' || rank === 'Sous-espèce';

        if (isSpeciesRank) {
            const firstLine = rawName.split('\n')[0];
            let prefixMatch = firstLine.match(/^[†+”"«“'’\s]+/);
            let sClean = normalizeAbbrev(firstLine.substring(prefixMatch ? prefixMatch[0].length : 0).trim());
            let genusHint = sClean.split(/[ \t]+/)[0].replace(/\./g, '').toLowerCase(); 
            
            let parentGenus = '';
            
            if (node.incomers) {
                let curr = node.incomers('node').first();
                while(curr && curr.length > 0 && !curr.hasClass('box')) {
                     const pRank = curr.data('rank');
                     let pName = (curr.data('name') || '').split('\n')[0].replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim();
                     let pWord = pName.split(/[ \t]+/)[0];
                     
                     if (pRank === 'Genre') {
                         parentGenus = pWord;
                         break;
                     }
                     if (pWord.toLowerCase() === genusHint || (genusHint.length <= 2 && pWord.toLowerCase().startsWith(genusHint.replace(/\./g, '')))) { 
                         parentGenus = pWord;
                         break; 
                     }
                     curr = curr.incomers('node').first();
                }
            }
            
            const shouldAbbrev = formatToUse === 'abbrev';
            return this.formatSpeciesName(rawName, shouldAbbrev, parentGenus);
        }
        
        return rawName;
    }

    static applyLayout(cy: cytoscape.Core, state: any, themeTextColor: string, textWidthCache: Map<string, number>, chronoAxisMode: string = 'linear', chronoBoundsMode: ChronoBoundsMode = 'period', romerReserve: { heights: Map<string, number>, gap: number } | null = null): { globalTimeMax: number, globalTimeMin: number } {
        const nodesById = new Map<string, any>();
        const childrenMap = new Map<string, any[]>();
        
        cy.nodes().forEach(node => { nodesById.set(node.id(), node); });
        cy.edges().forEach(e => {
            if (e.id() === 'ghost-edge') return;
            const src = e.data('source');
            if (!childrenMap.has(src)) childrenMap.set(src, []);
            const targetNode = nodesById.get(e.data('target'));
            if (targetNode && !targetNode.hasClass('box')) childrenMap.get(src)!.push(targetNode);
        });
        childrenMap.forEach(arr => arr.sort((a, b) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)));

        const visibleNodes = new Set<string>();
        const traverseVisibility = (nodeId: string) => {
            visibleNodes.add(nodeId);
            const node = nodesById.get(nodeId);
            if (!node) return;
            if (!node.data('hasNewSheet') || nodeId === state.currentRootId) {
                if (!node.data('collapsed')) (childrenMap.get(nodeId) || []).forEach(c => traverseVisibility(c.id()));
            }
        };
        if (nodesById.has(state.currentRootId)) traverseVisibility(state.currentRootId);
        if (nodesById.has('ghost-node')) visibleNodes.add('ghost-node');

        const getStartAgeSafe = (p: string) => {
            if (!p || p.trim() === '') return null;
            const parseMa = (s: string) => parseFloat(s.replace(',', '.'));
            const rangeMatch = p.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
            if (rangeMatch) return Math.max(parseMa(rangeMatch[1]), parseMa(rangeMatch[2]));
            const singleMatch = p.match(/([\d.,]+)/);
            if (singleMatch) return parseMa(singleMatch[1]);
            return null;
        };

        visibleNodes.forEach(nodeId => {
            const node = nodesById.get(nodeId);
            if (!node || node.hasClass('box') || nodeId === 'ghost-node') return;
            
            const hasLink = node.data('hasNewSheet') && nodeId !== state.currentRootId;
            const imgUrlData = node.data('imgUrl');
            
            const isSheetBreak = node.data('hasNewSheet') && nodeId !== state.currentRootId;
            const isCollapsed = node.data('collapsed');
            const visualChildren = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
            const isLeaf = visualChildren.length === 0;

            // En chronogramme, l'image est placée À CÔTÉ du dessin (après le nom d'un terminal, dans une bande
            // réservée au-dessus du clade d'une divergence) : elle ne fait pas partie du bloc du nom.
            const hasImage = !!imgUrlData && imgUrlData.trim() !== '' && state.layoutMode !== 'chrono';

            const dynamicName = this.getDynamicNodeName(node, state);
            const isEmptyBranch = (dynamicName === '') && !hasImage;
            if (node.data('isEmpty') !== isEmptyBranch) node.data('isEmpty', isEmptyBranch);

            const fontSize = node.data('fontSize') || 16;
            const cacheKey = `${dynamicName}_${node.data('extinct')}_${node.data('isBold')}_${node.data('isItalic')}_${node.data('collapsed')}_${hasLink}_${fontSize}_${node.data('fontFamily') || 'serif'}`;
            let textW = textWidthCache.get(cacheKey);
            if (textW === undefined) {
                textW = measureTextWidth(dynamicName, node.data('extinct'), node.data('isBold'), node.data('isItalic'), node.data('collapsed'), hasLink, fontSize, node.data('fontFamily') || 'serif');
                if (textWidthCache.size < 4000) textWidthCache.set(cacheKey, textW);
            }
            const linesCount = dynamicName ? dynamicName.split('\n').length : 1;
            const textH = Math.max(24, linesCount * (fontSize * 1.2));
            
            let blockW = textW, blockH = textH;
            let imgOffsetX = 0, imgOffsetY = 0, txtOffsetX = 0, txtOffsetY = 0;
            
            if (hasImage) {
                const iW = node.data('imgSize') || 150; 
                const iH = iW / (node.data('imgRatio') || 1);
                const GAP = 12;
                
                const iPos = node.data('imgPos') || 'left';

                if (iPos === 'left') { blockW = iW + GAP + textW; blockH = Math.max(iH, textH); imgOffsetX = -blockW/2 + iW/2; txtOffsetX = blockW/2 - textW/2; } 
                else if (iPos === 'right') { blockW = textW + GAP + iW; blockH = Math.max(textH, iH); txtOffsetX = -blockW/2 + textW/2; imgOffsetX = blockW/2 - iW/2; } 
                else if (iPos === 'top') { blockW = Math.max(textW, iW); blockH = iH + GAP + textH; imgOffsetY = -blockH/2 + iH/2; txtOffsetX = 0; txtOffsetY = blockH/2 - textH/2; } 
                else { blockW = Math.max(textW, iW); blockH = textH + GAP + iH; txtOffsetY = -blockH/2 + textH/2; imgOffsetX = 0; imgOffsetY = blockH/2 - iH/2; }
            }

            let originalTxtOffsetY = txtOffsetY;
            if (node.data('textAbove')) txtOffsetY -= (fontSize * 0.8) + 8;

            const pad = node.data('hasFrame') ? 18 : 10;
            const finalW = isEmptyBranch ? 0.1 : blockW + pad*2;
            const finalH = isEmptyBranch ? 0.1 : blockH + pad*2;
            
            const isNameEmpty = (!dynamicName || dynamicName.trim() === '');
            let labelText = node.data('extinct') && !isNameEmpty && !dynamicName.startsWith('\u2020') ? '\u2020 ' + dynamicName : dynamicName; 
            if (node.data('collapsed')) labelText += ' [+]';
            if (node.data('linkedFileName')) labelText += ' \u2197'; 
            if (node.data('hasNewSheet') && nodeId !== state.currentRootId) labelText += ' \u2794';

            let bgUrls: string[] = []; let bgWidths: string[] = []; let bgHeights: string[] = []; let bgPosXs: string[] = []; let bgPosYs: string[] = []; let bgFits: string[] = [];
            
            if (node.data('textAbove') && !isEmptyBranch && state.layoutMode !== 'chrono') {
                const lineColor = themeTextColor.replace('#', '%23');
                const dynamicSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2"><rect x="0" y="0" width="100" height="2" fill="${lineColor}"/></svg>`);
                bgUrls.push(dynamicSvg); bgWidths.push(finalW + 'px'); bgHeights.push('2px'); bgFits.push('none'); bgPosXs.push('50%'); bgPosYs.push('50%');
            }

            // En chronogramme, cWidth (largeur de la barre) et le décalage de l'image sont écrits plus bas, une fois
            // la géométrie connue : les écrire aussi ici changerait la donnée deux fois à chaque mise en page.
            const chronoLater = state.layoutMode === 'chrono' ? {} : { imgOffsetX, imgOffsetY, cWidth: finalW };
            setDataIfChanged(node, {
                ...chronoLater,
                renderWidth: finalW, renderHeight: finalH,
                textMarginX: txtOffsetX, textMarginY: txtOffsetY,
                labelW: blockW, labelH: blockH, displayName: dynamicName, computedLabel: labelText,
                cHeight: finalH, cTextMarginX: txtOffsetX, cTextMarginY: txtOffsetY,
                bgUrls: bgUrls.length > 0 ? bgUrls : null, bgWidthsStr: bgWidths.length > 0 ? bgWidths.join(', ') : '0px', 
                bgHeightsStr: bgHeights.length > 0 ? bgHeights.join(', ') : '0px', bgPosXsStr: bgPosXs.length > 0 ? bgPosXs.join(', ') : '50%', 
                bgPosYsStr: bgPosYs.length > 0 ? bgPosYs.join(', ') : '50%', bgFitsStr: bgFits.length > 0 ? bgFits.join(', ') : 'none'
            });
        });

        const calculatedPositions = new Map<string, {x: number, y: number}>();
        let globalTimeMax = 100, globalTimeMin = 0;

        if (state.layoutMode === 'chrono') {
            const parseMa = (val: any) => parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.'));
            
            let maxAge = -Infinity, minAge = Infinity;
            cy.nodes(':visible').forEach((n: any) => {
                if (n.hasClass('box')) return;
                const p = n.data('period');
                if (p && p.trim() !== '') {
                    const rM = p.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
                    const sM = p.match(/([\d.,]+)/);
                    let s = null, e = null;
                    if (rM) { s = parseMa(rM[1]); e = parseMa(rM[2]); }
                    else if (sM) { s = parseMa(sM[1]); e = s; }
                    if (s !== null && e !== null && !isNaN(s) && !isNaN(e)) {
                        if (s < e) { const t = s; s = e; e = t; }
                        if (s > maxAge) maxAge = s; if (e < minAge) minAge = e;
                    }
                }
            });

            // Bornes de la frise : calculées plus bas, une fois les âges des nœuds internes déduits.

            const nodeAges = new Map<string, number>();
            const undatedNodes = new Set<string>();
            const dateConflicts = new Set<string>();

            const calculateAge = (nId: string): number => {
                if (nodeAges.has(nId)) return nodeAges.get(nId)!;
                const n = nodesById.get(nId);
                const explicit = getStartAgeSafe(n.data('period'));
                const kids = childrenMap.get(nId) || [];
                
                let maxK = -Infinity;
                kids.forEach(k => { const a = calculateAge(k.id()); if (a > maxK) maxK = a; });
                
                let age = 0;
                if (kids.length === 0) {
                    age = explicit !== null ? explicit : 0;
                } else {
                    const minReq = maxK + 1.0; 
                    if (explicit !== null) {
                        if (explicit < minReq) { age = minReq; dateConflicts.add(nId); } 
                        else { age = explicit; }
                    } else {
                        age = minReq + 0.5; 
                    }
                }
                
                if (kids.length === 0 && explicit === null) undatedNodes.add(nId);
                nodeAges.set(nId, age);
                return age;
            };
            cy.nodes().forEach(n => { if (!n.hasClass('box')) calculateAge(n.id()); });

            // --- BORNES DE LA FRISE (bouton « Bornes : période / cladogramme », voir chrono-axis.ts) ---
            // Le plus ancien tient compte des nœuds internes non datés (placés avant leurs descendants),
            // sinon la racine pourrait sortir de la frise une fois calée sur une période.
            if (maxAge !== -Infinity && minAge !== Infinity) {
                let oldest = maxAge;
                cy.nodes(':visible').forEach((n: any) => {
                    if (n.hasClass('box') || undatedNodes.has(n.id())) return;
                    const a = nodeAges.get(n.id());
                    if (a !== undefined && a > oldest) oldest = a;
                });
                const b = computeChronoBounds(chronoBoundsMode, oldest, minAge);
                globalTimeMax = b.max; globalTimeMin = b.min;
            } else {
                globalTimeMax = 100; globalTimeMin = 0;
            }

            let chronoRankAges: number[] = [];
            if (chronoAxisMode === 'rank') {
                const seen = new Set<number>();
                const ages: number[] = [];
                const push = (v: number) => { const r = Math.round(v * 1000) / 1000; if (!seen.has(r)) { seen.add(r); ages.push(r); } };
                push(globalTimeMin); push(globalTimeMax);
                cy.nodes().forEach((n: any) => {
                    if (n.hasClass('box')) return;
                    push(nodeAges.get(n.id()) || 0);
                    const kids = childrenMap.get(n.id()) || [];
                    if (kids.length === 0) {
                        const rM = (n.data('period') || '').match(/([\d.,]+)\s*-\s*([\d.,]+)/);
                        if (rM) push(Math.min(parseMa(rM[1]), parseMa(rM[2])));
                    }
                });
                ages.sort((a, b) => a - b);
                chronoRankAges = ages;
            }

            // Conversion âge → abscisse : source unique dans chrono-axis.ts (échelle par morceaux, Précambrien comprimé).
            const chronoAgeToX = (age: number): number =>
                axisAgeToX(chronoAxisMode as ChronoAxisMode, globalTimeMin, globalTimeMax, chronoRankAges, age);

            // Enfants affichés : un clade replié ou un renvoi de feuille est dessiné comme un terminal, sans
            // réserver de lignes pour ses descendants cachés (les âges, eux, tiennent compte de tout le clade).
            const shownKids = (nId: string): any[] => {
                const n = nodesById.get(nId);
                if (!n || (n.data('hasNewSheet') && nId !== state.currentRootId) || n.data('collapsed')) return [];
                return childrenMap.get(nId) || [];
            };
            /** Taille de l'image de la fiche, ou null (mêmes champs qu'en cladogramme : imgSize, imgRatio). */
            const imageOf = (n: any): { w: number, h: number } | null => {
                const raw = n.data('imgUrl');
                if (!raw || String(raw).trim() === '') return null;
                const w = n.data('imgSize') || 150;
                return { w, h: w / (n.data('imgRatio') || 1) };
            };

            const chronoGeom = new Map<string, any>();
            cy.nodes().forEach((n: any) => {
                if (n.hasClass('box')) return;
                const s = nodeAges.get(n.id()) || 0;
                const kids = shownKids(n.id());
                let e = s; let isInter = false;
                if (kids.length === 0) {
                    const rM = (n.data('period') || '').match(/([\d.,]+)\s*-\s*([\d.,]+)/);
                    if (rM) { const ev = Math.min(parseMa(rM[1]), parseMa(rM[2])); if (s - ev > 0.1) { e = ev; isInter = true; } }
                }
                const gL = chronoAgeToX(s);
                const gR = isInter ? chronoAgeToX(e) : (kids.length === 0 ? gL + 1 : gL);
                chronoGeom.set(n.id(), { isInterval: isInter, isLeaf: kids.length === 0, glyphL: gL, glyphR: gR, labelW: n.data('isEmpty') ? 0 : n.data('labelW') });
            });

            // --- LIGNES (axe vertical ; l'axe horizontal = le temps n'est jamais touché par les images) ---
            // Terminal : une ligne, agrandie à la hauteur de son image (dessinée après son nom, sur sa ligne :
            // à droite d'un nom terminal, rien d'autre n'est dessiné, les branches de ses ancêtres étant à sa gauche).
            // Divergence illustrée : bande de la hauteur de l'image réservée juste AU-DESSUS de son clade ; l'image
            // s'y place à droite du point de divergence, zone qu'aucune branche ni barre ne traverse (les troncs des
            // ancêtres sont à gauche de la divergence, ses propres branches partent sous la bande).
            let cursorY = 0;
            const chronoY = new Map<string, number>();
            const imageBandTop = new Map<string, number>();
            // Fuseau du romérogramme (romer.ts › romerReserve) : une seule bande de la hauteur du fuseau, à la place
            // des lignes de ses taxons (cachés) ; les fuseaux restent serrés comme des taxons voisins.
            const pinSubtree = (nId: string, y: number) => shownKids(nId).forEach(k => { chronoY.set(k.id(), y); pinSubtree(k.id(), y); });
            const layoutChronoY = (nId: string): number => {
                const kids = shownKids(nId);
                const reserved = romerReserve ? romerReserve.heights.get(nId) : undefined;
                if (reserved !== undefined) {
                    const half = reserved / 2 + romerReserve!.gap / 2;
                    const y = Math.round(cursorY + Math.max(CHRONO_GAP_MIN + 9, half));
                    chronoY.set(nId, y); pinSubtree(nId, y);
                    cursorY = y + Math.max(28, half); return y;
                }
                const n = nodesById.get(nId);
                const img = n ? imageOf(n) : null;
                if (kids.length === 0) {
                    const above = img ? Math.max(9, img.h / 2) : 9;
                    const below = img ? Math.max(28, img.h / 2 + 10) : 28;
                    const y = Math.round(cursorY + CHRONO_GAP_MIN + above);
                    chronoY.set(nId, y); cursorY = y + below; return y;
                }
                if (img) {
                    const top = cursorY + CHRONO_GAP_MIN;
                    imageBandTop.set(nId, top);
                    cursorY = top + img.h + 6;
                }
                let sY = 0;
                kids.forEach(k => sY += layoutChronoY(k.id()));
                const y = Math.round(sY / kids.length);
                chronoY.set(nId, y); return y;
            };
            if (nodesById.has(state.currentRootId)) layoutChronoY(state.currentRootId);

            cy.nodes().forEach((n: any) => {
                if (n.hasClass('box')) { n.style('display', 'none'); return; } // boîtes : stylées ensuite par refreshLayout
                if (!visibleNodes.has(n.id())) { applyChronoStyle(n, { 'display': 'none' }); return; }
                const g = chronoGeom.get(n.id());
                if (!g) { n.style('display', 'element'); return; }
                const y = chronoY.get(n.id()) || 0;
                
                let nw = 0.1, nh = 0.1, bgOp = 0, tH = 'left', tV = 'top', txtX = 0, txtY = 0;
                const conflict = dateConflicts.has(n.id());
                const borderColor = conflict ? '#d32f2f' : themeTextColor;
                
                if (g.isInterval) {
                    nw = Math.max(g.glyphR - g.glyphL, 2); nh = CHRONO_BAR_H; bgOp = 1;
                    setPositionIfChanged(n, (g.glyphL + g.glyphR)/2, y);
                    tH = 'right'; tV = 'center'; txtX = CHRONO_LABEL_GAP; txtY = 0;
                } else if (g.isLeaf) {
                    nw = 2; nh = CHRONO_TICK_H; bgOp = 1;
                    setPositionIfChanged(n, g.glyphL, y);
                    tH = 'right'; tV = 'center'; txtX = CHRONO_LABEL_GAP; txtY = 0;
                } else {
                    nw = 0.1; nh = 0.1; bgOp = 0;
                    setPositionIfChanged(n, g.glyphL, y);
                    
                    // --- PLACEMENT INTELLIGENT DU TEXTE ---
                    // 1. Calcul de la longueur de la branche (distance entre le parent et ce noeud)
                    const incomers = n.incomers('node');
                    let parentX = g.glyphL;
                    if (incomers && incomers.length > 0) {
                        const pId = incomers.first().id();
                        const pGeom = chronoGeom.get(pId);
                        if (pGeom) parentX = pGeom.glyphL;
                    }
                    
                    const branchLength = g.glyphL - parentX;
                    const textW = n.data('labelW') || 0;

                    if (textW < branchLength) {
                        // 2A. Le mot est plus court que la branche :
                        // Centré par rapport à la longueur, au-dessus de la ligne.
                        tH = 'center';
                        tV = 'top'; 
                        txtX = -(branchLength / 2);
                        txtY = -4; 
                    } else {
                        // 2B. Le mot est plus long (ou égal) à la branche :
                        // Coupé en son axe longitudinal par la ligne, et placé AVANT la divergence parente.
                        tH = 'left';    // Place le texte à gauche du point de repère
                        tV = 'center';  // Coupe le mot en son axe longitudinal
                        txtX = -branchLength; // Recul total (longueur de branche + 6px de marge) pour passer avant le parent
                        txtY = 0;
                    }
                }

                // Image de la fiche (calque HTML, export-images.ts) : décalage depuis la position du nœud.
                const img = imageOf(n);
                let imgOffsetX = 0, imgOffsetY = 0;
                if (img) {
                    if (g.isLeaf) {
                        imgOffsetX = nw / 2 + CHRONO_LABEL_GAP + (g.labelW || 0) + CHRONO_IMG_GAP + img.w / 2;   // après le nom
                    } else {
                        const top = imageBandTop.get(n.id());
                        imgOffsetX = CHRONO_IMG_GAP + img.w / 2;                                              // à droite de la divergence
                        imgOffsetY = top !== undefined ? top + img.h / 2 - y : 0;                            // dans la bande réservée
                    }
                }
                setDataIfChanged(n, { imgOffsetX, imgOffsetY });

                const bw = g.isInterval ? (conflict ? 2 : 1) : 0;

                // Sans 'display' : l'élément visible n'a pas de visibilité posée (valeur par défaut = affiché).
                applyChronoStyle(n, {
                    'width': nw+'px', 'height': nh+'px', 'background-opacity': bgOp,
                    'text-halign': tH, 'text-valign': tV, 'text-margin-x': txtX+'px', 'text-margin-y': txtY+'px',
                    'background-color': '#90A4AE', 'border-width': bw + 'px', 'border-style': 'solid',
                    'border-color': borderColor, 'border-opacity': 1, 'shape': 'rectangle', 'padding': '0px'
                });

                setDataIfChanged(n, { cWidth: nw, chronoOuterWidth: g.isInterval ? nw + 2 : (g.isLeaf ? 2 : 0.1) });
            });

            // GÉOMÉTRIE MATHÉMATIQUE INFAILLIBLE : Alignement absolu sur le bord cible
            const minChildLeftXByParent = new Map<string, number>();
            cy.edges().forEach(e => {
                if (e.id() === 'ghost-edge') return;
                const pId = e.source().id();
                const tgt = e.target();
                const w = tgt.data('cWidth') || 0;
                const leftX = w > 2 ? tgt.position('x') - (w/2) : tgt.position('x');
                
                if (!minChildLeftXByParent.has(pId) || leftX < minChildLeftXByParent.get(pId)!) {
                    minChildLeftXByParent.set(pId, leftX);
                }
            });

            cy.edges().forEach(e => {
                if (e.id() === 'ghost-edge') return;

                const source = e.source();
                const target = e.target();

                const sx = source.position('x');
                const sy = source.position('y');
                
                const tx = target.position('x');
                const ty = target.position('y');

                const tgtW = target.data('cWidth') || 0;
                const targetOffsetX = tgtW > 2 ? -Math.round(tgtW / 2) : 0;

                // L'ALIGNEMENT ULTIME : 
                // On base toute la géométrie EXCLUSIVEMENT sur la bordure gauche du cadre.
                // Cela force les coudes à se calculer parfaitement dans le bon axe.
                const ex = tx + targetOffsetX;
                const ey = ty;

                const dx = ex - sx;
                const dy = ey - sy;
                const distSq = dx * dx + dy * dy;

                if (distSq < 0.0001) {
                    applyChronoStyle(e, { 'display': 'none' });
                    return;
                }

                const minLeftX = minChildLeftXByParent.get(source.id()) || sx;
                const targetTrunkX = Math.max(sx + CHRONO_TRUNK_GAP, minLeftX - CHRONO_TRUNK_GAP);
                // Tronc mémorisé : le romérogramme prolonge la branche jusqu'à la pointe d'un fuseau sans le déplacer.
                e.scratch(CHRONO_TRUNK_SCRATCH, targetTrunkX);
                applyChronoStyle(e, chronoEdgeStyle(sx, sy, ex, ey, targetTrunkX, targetOffsetX));
            });

        } else {
            let currentY = 0; const xGap = STANDARD_X_GAP; const yGap = state.layoutMode === 'comb' ? 16 : 60;   
            let maxLeafLeftX = 0; 
            const stepsToLeafMap = new Map<string, number>();
            const tightDistMap = new Map<string, number>();
            
            if (state.layoutMode === 'comb') {
                const calcMaxX = (nodeId: string, currentX: number) => {
                    const n = nodesById.get(nodeId);
                    if (!n) return;
                    const w = n.data('renderWidth') || 1;
                    const isSheetBreak = n.data('hasNewSheet') && nodeId !== state.currentRootId;
                    const isCollapsed = n.data('collapsed');
                    const kids = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
                    if (kids.length === 0) { if (currentX > maxLeafLeftX) maxLeafLeftX = currentX; } 
                    else { kids.forEach(c => calcMaxX(c.id(), currentX + w + xGap)); }
                };
                if (nodesById.has(state.currentRootId)) calcMaxX(state.currentRootId, 0);

                const computeMetrics = (nodeId: string): { steps: number, tight: number } => {
                    const node = nodesById.get(nodeId);
                    const childrenArray = (!node || (node.data('hasNewSheet') && nodeId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nodeId) || []);
                    if (childrenArray.length === 0) {
                        stepsToLeafMap.set(nodeId, 0); tightDistMap.set(nodeId, 0); return { steps: 0, tight: 0 };
                    } else {
                        let maxSteps = 0, maxTight = 0;
                        const myWidth = node ? (node.data('renderWidth') || 1) : 1;
                        childrenArray.forEach(child => {
                            const m = computeMetrics(child.id());
                            if (m.steps > maxSteps) maxSteps = m.steps;
                            const tight = myWidth + xGap + m.tight;
                            if (tight > maxTight) maxTight = tight;
                        });
                        stepsToLeafMap.set(nodeId, maxSteps + 1); tightDistMap.set(nodeId, maxTight); return { steps: maxSteps + 1, tight: maxTight };
                    }
                };
                if (nodesById.has(state.currentRootId)) computeMetrics(state.currentRootId);
            }

            const fastWalk = (nodeId: string, leftX: number): number => {
                const node = nodesById.get(nodeId);
                if (!node) return 0;
                const childrenArray = ((node.data('hasNewSheet') && nodeId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nodeId) || []);
                const myWidth = node.data('renderWidth') || 1; 
                const myHeight = node.data('renderHeight') || 24; 
                
                let actualLeftX = leftX; 
                if (state.layoutMode === 'comb' && childrenArray.length === 0) {
                    actualLeftX = Math.max(leftX, maxLeafLeftX);
                }

                const myCenterX = actualLeftX + (myWidth / 2); 
                const rightX = actualLeftX + myWidth;
                
                if (childrenArray.length === 0) { 
                    const nodeY = currentY + (myHeight / 2);
                    calculatedPositions.set(nodeId, { x: myCenterX, y: nodeY }); 
                    currentY = nodeY + (myHeight / 2) + yGap; 
                    return nodeY; 
                } else {
                    let startY = currentY; let sumY = 0; 
                    childrenArray.forEach(child => { 
                        // Décalage manuel de la divergence le long de sa branche (mode « glisser les divergences »).
                        const manualOffset = state.layoutMode === 'standard' ? Math.max(MIN_BRANCH_OFFSET, child.data('branchOffset') || 0) : 0;
                        let nextLeftX = rightX + xGap + manualOffset; 
                        if (state.layoutMode === 'comb') {
                            const childSteps = stepsToLeafMap.get(child.id()) || 0;
                            const childTight = tightDistMap.get(child.id()) || 0;
                            const slack = Math.max(0, (maxLeafLeftX - actualLeftX) - ((myWidth + xGap) + childTight));
                            nextLeftX = rightX + xGap + (slack / (childSteps + 1));
                        }
                        sumY += fastWalk(child.id(), nextLeftX); 
                    }); 
                    let avgY = sumY / childrenArray.length; 
                    
                    const topBleed = startY - (avgY - myHeight / 2);
                    if (topBleed > 0) {
                        const shiftDescendants = (nId: string) => {
                            const pos = calculatedPositions.get(nId);
                            if (pos) pos.y += topBleed;
                            (childrenMap.get(nId) || []).forEach(c => shiftDescendants(c.id()));
                        };
                        childrenArray.forEach(c => shiftDescendants(c.id()));
                        avgY += topBleed; currentY += topBleed;
                    }
                    if (avgY + (myHeight / 2) + yGap > currentY) currentY = avgY + (myHeight / 2) + yGap;
                    calculatedPositions.set(nodeId, { x: myCenterX, y: avgY }); 
                    return avgY; 
                }
            };
                  
            if (nodesById.has(state.currentRootId)) fastWalk(state.currentRootId, 0);

            cy.nodes().forEach(n => {
                if (n.hasClass('box')) return;
                n.removeStyle(); 
                if (visibleNodes.has(n.id())) {
                    n.style('display', 'element');
                    const pos = calculatedPositions.get(n.id());
                    if (pos) n.position(pos);
                    
                    const d = n.data();
                    let bgUrls: string[] = []; let bgWidths: string[] = []; let bgHeights: string[] = []; let bgPosXs: string[] = []; let bgPosYs: string[] = []; let bgFits: string[] = [];
                    if (d.textAbove && !d.isEmpty) {
                        const lineColor = themeTextColor.replace('#', '%23');
                        const dynamicSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2"><rect x="0" y="0" width="100" height="2" fill="${lineColor}"/></svg>`);
                        bgUrls.push(dynamicSvg); bgWidths.push(d.renderWidth + 'px'); bgHeights.push('2px'); bgFits.push('none'); bgPosXs.push('50%'); bgPosYs.push('50%');
                    }

                    n.style({
                        'width': d.renderWidth + 'px', 'height': d.renderHeight + 'px', 'shape': d.cShape, 'padding': '0px',
                        'border-width': d.cBorderW + 'px', 'border-style': 'solid', 'border-color': d.cBorderCol, 'border-opacity': 1,
                        'background-color': d.cBgCol, 'background-opacity': d.cBgOpac,
                        'text-halign': 'center', 'text-valign': 'center', 'text-margin-x': d.textMarginX + 'px', 'text-margin-y': d.textMarginY + 'px',
                        'background-image': bgUrls.length > 0 ? bgUrls.join(', ') : 'none',
                        'background-width': bgWidths.length > 0 ? bgWidths.join(', ') : '0px',
                        'background-height': bgHeights.length > 0 ? bgHeights.join(', ') : '0px',
                        'background-position-x': bgPosXs.length > 0 ? bgPosXs.join(', ') : '50%',
                        'background-position-y': bgPosYs.length > 0 ? bgPosYs.join(', ') : '50%',
                        'background-fit': bgFits.length > 0 ? bgFits.join(', ') : 'none'
                    } as any);

                } else n.style('display', 'none');
            });

            cy.edges().forEach(e => {
                if (e.id() === 'ghost-edge') return;
                e.removeStyle(); 
            });
        }

        return { globalTimeMax, globalTimeMin };
    }
}