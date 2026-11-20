// ==========================================
// AXE DU TEMPS DU CHRONOGRAMME (âge en Ma → abscisse en px)
// ==========================================
// Source unique de la conversion, partagée par le calcul de mise en page (layout-engine.ts)
// et par la frise / l'export (renderer.ts) : les deux doivent rester rigoureusement identiques.
//
// Échelle linéaire PAR MORCEAUX : le Phanérozoïque est à CHRONO_PX_PER_MA, le Précambrien est
// comprimé d'un facteur PRECAMBRIAN_COMPRESSION. Chaque segment reste linéaire (durées comparables
// à l'intérieur d'un segment, âges lisibles sur la frise) ; la rupture d'échelle est signalée sur la frise.
// Un arbre entièrement phanérozoïque n'est pas affecté.

import { PHANEROZOIC_BASE, PHANEROZOIC_PERIODS, PRECAMBRIAN_UNITS, stagesOf } from './chrono-data';

export const CHRONO_PX_PER_MA = 20;
/** Le Précambrien est dessiné PRECAMBRIAN_COMPRESSION fois plus court (2 px/Ma). */
export const PRECAMBRIAN_COMPRESSION = 10;
/** Âge (Ma) de la rupture d'échelle. */
export const SCALE_BREAK_AGE = PHANEROZOIC_BASE;

export type ChronoAxisMode = 'linear' | 'sqrt' | 'log' | 'rank';

// ==========================================
// BORNES DE LA FRISE (bouton « Bornes : période / cladogramme »)
// ==========================================
//  'period' → étendues aux périodes géologiques entières touchées par l'arbre ;
//  'tight'  → intervalle réellement occupé par l'arbre, élargi de 10 % de son amplitude (2 Ma minimum).
export type ChronoBoundsMode = 'period' | 'tight';

/** Unités de calage en mode 'period' : les périodes (Phanérozoïque, Protérozoïque) ; là où la charte
 *  n'en définit pas (Archéen, Hadéen), l'ère ou l'éon. Jamais l'éon entier quand une période existe. */
const BOUND_UNITS: { s: number; e: number }[] = [
    ...PHANEROZOIC_PERIODS.map(p => ({ s: p.start, e: p.end })),
    ...PRECAMBRIAN_UNITS.flatMap(u => stagesOf(u).map(st => ({ s: st.s, e: st.e }))),
];

/**
 * Bornes [min, max] (Ma) de la frise.
 * @param oldest   âge le plus ancien à afficher (nœuds datés ET âges déduits des nœuds internes)
 * @param youngest âge le plus récent daté
 */
export const computeChronoBounds = (mode: ChronoBoundsMode, oldest: number, youngest: number): { min: number; max: number } => {
    if (!isFinite(oldest) || !isFinite(youngest)) return { min: 0, max: 100 };
    const pad = Math.max((oldest - youngest) * 0.10, 2);
    if (mode === 'tight') return { min: Math.max(0, youngest - pad), max: oldest + pad };

    // Unité qui contient l'âge le plus ancien : on remonte à sa base.
    const older = BOUND_UNITS.find(u => oldest > u.e && oldest <= u.s);
    // Unité qui contient l'âge le plus récent : on descend à son sommet.
    const younger = BOUND_UNITS.find(u => youngest >= u.e && youngest < u.s);
    return {
        min: youngest <= 0 || !younger ? 0 : younger.e,
        max: older ? older.s : oldest + pad, // au-delà de l'âge de la Terre : marge simple
    };
};

/** Distance (px) entre le présent et `age`, échelle linéaire par morceaux. Croissante. */
export const axisDistance = (age: number): number => {
    const a = Math.max(0, age);
    if (a <= SCALE_BREAK_AGE) return a * CHRONO_PX_PER_MA;
    return SCALE_BREAK_AGE * CHRONO_PX_PER_MA + (a - SCALE_BREAK_AGE) * (CHRONO_PX_PER_MA / PRECAMBRIAN_COMPRESSION);
};

/** Vrai si la rupture d'échelle est visible : axe linéaire et intervalle affiché qui la traverse. */
export const hasScaleBreak = (mode: ChronoAxisMode, lo: number, hi: number): boolean =>
    mode === 'linear' && lo < SCALE_BREAK_AGE && hi > SCALE_BREAK_AGE;

const warp = (mode: ChronoAxisMode, rankAges: number[], age: number): number => {
    const a = Math.max(0, age);
    if (mode === 'sqrt') return Math.sqrt(a);
    if (mode === 'log') return Math.log1p(a);
    if (mode === 'rank') {
        const n = rankAges.length;
        if (n === 0) return a;
        if (a <= rankAges[0]) return 0;
        if (a >= rankAges[n - 1]) return n - 1;
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (rankAges[mid] <= a) lo = mid; else hi = mid;
        }
        const span = rankAges[hi] - rankAges[lo];
        return span <= 0 ? lo : lo + (a - rankAges[lo]) / span;
    }
    return a;
};

/**
 * Abscisse (px, négative vers le passé) d'un âge.
 * - 'linear' : échelle par morceaux ci-dessus.
 * - 'sqrt' / 'log' / 'rank' : déformation répartie sur la même largeur totale que l'échelle linéaire
 *   entre `lo` et `hi` (le Précambrien y est donc aussi raccourci, sans rupture visible).
 */
export const chronoAgeToX = (mode: ChronoAxisMode, lo: number, hi: number, rankAges: number[], age: number): number => {
    const linear = -axisDistance(age);
    if (mode === 'linear') return linear;
    if (!(hi > lo)) return linear;
    const wLo = warp(mode, rankAges, lo);
    const wHi = warp(mode, rankAges, hi);
    if (!(wHi > wLo)) return linear;
    const u = (warp(mode, rankAges, age) - wLo) / (wHi - wLo);
    return -axisDistance(lo) - u * (axisDistance(hi) - axisDistance(lo));
};

// ==========================================
// BRANCHES DU CHRONOGRAMME
// ==========================================
/** Scratch Cytoscape : signature du style posé par le chronogramme (layout-engine.ts › applyChronoStyle). */
export const CHRONO_STYLE_SCRATCH = '_chronoStyle';
/** Scratch Cytoscape d'une arête : abscisse de son tronc vertical (barre partagée par les enfants d'un parent). */
export const CHRONO_TRUNK_SCRATCH = '_chronoTrunkX';

/**
 * Style d'une branche du chronogramme : du parent (sx, sy), horizontale jusqu'au tronc `trunkX`, verticale jusqu'à
 * la ligne de l'enfant, puis horizontale jusqu'au point d'arrivée (ex, ey). `targetOffsetX` : décalage du point
 * d'arrivée par rapport au centre du nœud enfant (bord gauche d'une barre de durée, pointe d'un fuseau…).
 */
export const chronoEdgeStyle = (sx: number, sy: number, ex: number, ey: number, trunkX: number, targetOffsetX: number): Record<string, string> => {
    const dx = ex - sx, dy = ey - sy;
    const distSq = dx * dx + dy * dy, dist = Math.sqrt(distSq);
    const turn = trunkX - sx;
    // Coudes exprimés en poids (le long de la corde) et distances (perpendiculaires), relatifs aux extrémités.
    const w1 = (turn * dx) / distSq, d1 = (-turn * dy) / dist;
    const w2 = (turn * dx + dy * dy) / distSq, d2 = (dy * dx - turn * dy) / dist;
    return {
        'curve-style': 'segments',
        'segment-weights': `${w1} ${w2}`,
        'segment-distances': `${d1} ${d2}`,
        'source-endpoint': '0px 0px',
        'target-endpoint': `${targetOffsetX}px 0px`,
        'edge-distances': 'endpoints',
    };
};
