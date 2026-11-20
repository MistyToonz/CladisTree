// ==========================================
// SOURCE UNIQUE DES ÂGES GÉOLOGIQUES
// ==========================================
// Charte chronostratigraphique internationale (ICS), version 2026/06.
//   Charte : https://stratigraphy.org/chart
//   Données : https://github.com/i-c-stratigraphy/chart (source/chart-nolabels.ttl)
// Âges en Ma : `start`/`s` = base (le plus ancien), `end`/`e` = sommet.
// Couleurs des périodes/systèmes = couleurs officielles ICS (les étages sont teintés à l'affichage).
// Toute frise, tout export ou calcul doit lire ces tableaux : ne JAMAIS recopier d'âges ailleurs.
// Pour mettre à jour : comparer avec la nouvelle version de la charte et changer ICS_CHART_VERSION.

export const ICS_CHART_VERSION = '2026/06';

/** Base du Phanérozoïque (= base du Cambrien), en Ma. */
export const PHANEROZOIC_BASE = 538.8;
/** Âge de la Terre (base de l'Hadéen), en Ma : borne de la frise « temps profond ». */
export const EARTH_AGE = 4567;
/** Borne gauche de la frise Phanérozoïque (inclut une tranche de Précambrien pour le contexte), en Ma. */
export const PHANEROZOIC_TIMELINE_MAX = 600;

export type GeoStage = { k: string; s: number; e: number };
export type GeoPeriod = { key: string; abbr: string; abbrPdf: string; start: number; end: number; color: string; subs: GeoStage[] };

/** Périodes (systèmes) du Phanérozoïque, de la plus récente à la plus ancienne, avec leurs étages.
 *  Remarques : l'Holocène est regroupé en un seul étage ; le Pridoli (série sans étage) est traité comme un étage ;
 *  la base de l'Aquitanien est alignée sur celle du Néogène (23,04 Ma ; la charte 2026/06 indique encore 23,03 pour l'étage). */
export const PHANEROZOIC_PERIODS: GeoPeriod[] = [
    { key: "geo.period.quaternary", abbr: "Q", abbrPdf: "Q", start: 2.58, end: 0, color: "#F9F97F", subs: [{k:"geo.holocene", s:0.0117, e:0}, {k:"geo.tarantian", s:0.129, e:0.0117}, {k:"geo.chibanian", s:0.774, e:0.129}, {k:"geo.calabrian", s:1.8, e:0.774}, {k:"geo.gelasian", s:2.58, e:1.8}] },
    { key: "geo.period.neogene", abbr: "Ng", abbrPdf: "Ng", start: 23.04, end: 2.58, color: "#FFE619", subs: [{k:"geo.piacenzian", s:3.6, e:2.58}, {k:"geo.zanclean", s:5.333, e:3.6}, {k:"geo.messinian", s:7.246, e:5.333}, {k:"geo.tortonian", s:11.63, e:7.246}, {k:"geo.serravallian", s:13.82, e:11.63}, {k:"geo.langhian", s:15.98, e:13.82}, {k:"geo.burdigalian", s:20.45, e:15.98}, {k:"geo.aquitanian", s:23.04, e:20.45}] },
    { key: "geo.period.paleogene", abbr: "Pg", abbrPdf: "Pg", start: 66, end: 23.04, color: "#FD9A52", subs: [{k:"geo.chattian", s:27.3, e:23.04}, {k:"geo.rupelian", s:33.9, e:27.3}, {k:"geo.priabonian", s:37.71, e:33.9}, {k:"geo.bartonian", s:41.03, e:37.71}, {k:"geo.lutetian", s:48.07, e:41.03}, {k:"geo.ypresian", s:56, e:48.07}, {k:"geo.thanetian", s:59.24, e:56}, {k:"geo.selandian", s:61.66, e:59.24}, {k:"geo.danian", s:66, e:61.66}] },
    { key: "geo.period.cretaceous", abbr: "K", abbrPdf: "K", start: 143.1, end: 66, color: "#7FC64E", subs: [{k:"geo.maastrichtian", s:72.2, e:66}, {k:"geo.campanian", s:83.6, e:72.2}, {k:"geo.santonian", s:85.7, e:83.6}, {k:"geo.coniacian", s:89.8, e:85.7}, {k:"geo.turonian", s:93.9, e:89.8}, {k:"geo.cenomanian", s:100.5, e:93.9}, {k:"geo.albian", s:113.2, e:100.5}, {k:"geo.aptian", s:121.4, e:113.2}, {k:"geo.barremian", s:125.77, e:121.4}, {k:"geo.hauterivian", s:132.6, e:125.77}, {k:"geo.valanginian", s:137.05, e:132.6}, {k:"geo.berriasian", s:143.1, e:137.05}] },
    { key: "geo.period.jurassic", abbr: "J", abbrPdf: "J", start: 201.4, end: 143.1, color: "#34B2C9", subs: [{k:"geo.tithonian", s:149.2, e:143.1}, {k:"geo.kimmeridgian", s:154.8, e:149.2}, {k:"geo.oxfordian", s:161.5, e:154.8}, {k:"geo.callovian", s:165.3, e:161.5}, {k:"geo.bathonian", s:168.2, e:165.3}, {k:"geo.bajocian", s:170.9, e:168.2}, {k:"geo.aalenian", s:174.7, e:170.9}, {k:"geo.toarcian", s:184.2, e:174.7}, {k:"geo.pliensbachian", s:192.9, e:184.2}, {k:"geo.sinemurian", s:199.5, e:192.9}, {k:"geo.hettangian", s:201.4, e:199.5}] },
    { key: "geo.period.triassic", abbr: "T", abbrPdf: "T", start: 251.902, end: 201.4, color: "#812B92", subs: [{k:"geo.rhaetian", s:205.7, e:201.4}, {k:"geo.norian", s:227.3, e:205.7}, {k:"geo.carnian", s:237, e:227.3}, {k:"geo.ladinian", s:241.464, e:237}, {k:"geo.anisian", s:247, e:241.464}, {k:"geo.olenekian", s:250.8, e:247}, {k:"geo.induan", s:251.902, e:250.8}] },
    { key: "geo.period.permian", abbr: "P", abbrPdf: "P", start: 298.9, end: 251.902, color: "#F04028", subs: [{k:"geo.changhsingian", s:254.14, e:251.902}, {k:"geo.wuchiapingian", s:259.857, e:254.14}, {k:"geo.capitanian", s:264.28, e:259.857}, {k:"geo.wordian", s:266.9, e:264.28}, {k:"geo.roadian", s:274.4, e:266.9}, {k:"geo.kungurian", s:283.3, e:274.4}, {k:"geo.artinskian", s:290.1, e:283.3}, {k:"geo.sakmarian", s:293.52, e:290.1}, {k:"geo.asselian", s:298.9, e:293.52}] },
    { key: "geo.period.carboniferous", abbr: "C", abbrPdf: "C", start: 358.86, end: 298.9, color: "#67A599", subs: [{k:"geo.gzhelian", s:303.7, e:298.9}, {k:"geo.kasimovian", s:307, e:303.7}, {k:"geo.moscovian", s:315.2, e:307}, {k:"geo.bashkirian", s:323.4, e:315.2}, {k:"geo.serpukhovian", s:330.3, e:323.4}, {k:"geo.visean", s:346.7, e:330.3}, {k:"geo.tournaisian", s:358.86, e:346.7}] },
    { key: "geo.period.devonian", abbr: "D", abbrPdf: "D", start: 419.62, end: 358.86, color: "#CB8C37", subs: [{k:"geo.famennian", s:372.15, e:358.86}, {k:"geo.frasnian", s:382.31, e:372.15}, {k:"geo.givetian", s:387.95, e:382.31}, {k:"geo.eifelian", s:393.47, e:387.95}, {k:"geo.emsian", s:410.62, e:393.47}, {k:"geo.pragian", s:413.02, e:410.62}, {k:"geo.lochkovian", s:419.62, e:413.02}] },
    { key: "geo.period.silurian", abbr: "S", abbrPdf: "S", start: 443.1, end: 419.62, color: "#B3E1B6", subs: [{k:"geo.pridoli", s:422.7, e:419.62}, {k:"geo.ludfordian", s:425, e:422.7}, {k:"geo.gorstian", s:426.7, e:425}, {k:"geo.homerian", s:430.6, e:426.7}, {k:"geo.sheinwoodian", s:432.9, e:430.6}, {k:"geo.telychian", s:438.6, e:432.9}, {k:"geo.aeronian", s:440.5, e:438.6}, {k:"geo.rhuddanian", s:443.1, e:440.5}] },
    { key: "geo.period.ordovician", abbr: "O", abbrPdf: "O", start: 486.85, end: 443.1, color: "#009270", subs: [{k:"geo.hirnantian", s:445.2, e:443.1}, {k:"geo.katian", s:452.8, e:445.2}, {k:"geo.sandbian", s:458.2, e:452.8}, {k:"geo.darriwilian", s:469.4, e:458.2}, {k:"geo.dapingian", s:471.3, e:469.4}, {k:"geo.floian", s:477.1, e:471.3}, {k:"geo.tremadocian", s:486.85, e:477.1}] },
    { key: "geo.period.cambrian", abbr: "Ꞓ", abbrPdf: "Cm", start: 538.8, end: 486.85, color: "#7FA056", subs: [{k:"geo.stage10", s:491, e:486.85}, {k:"geo.jiangshanian", s:494.2, e:491}, {k:"geo.paibian", s:497, e:494.2}, {k:"geo.guzhangian", s:500.5, e:497}, {k:"geo.drumian", s:504.5, e:500.5}, {k:"geo.wuliuan", s:506.5, e:504.5}, {k:"geo.stage4", s:514.5, e:506.5}, {k:"geo.stage3", s:521, e:514.5}, {k:"geo.stage2", s:529, e:521}, {k:"geo.fortunian", s:538.8, e:529}] }
];

/** Précambrien, découpé pour la frise à deux rangées (rangée basse = ère, rangée haute = période).
 *  Seul le Protérozoïque a des périodes ; les ères archéennes et l'Hadéen n'ont pas de subdivision :
 *  `stagesOf` les fait alors occuper aussi la rangée haute. */
export const PRECAMBRIAN_UNITS: GeoPeriod[] = [
    { key: "geo.era.neoproterozoic", abbr: "NP", abbrPdf: "NP", start: 1000, end: 538.8, color: "#FEB342", subs: [{k:"geo.ediacaran", s:635, e:538.8}, {k:"geo.cryogenian", s:720, e:635}, {k:"geo.tonian", s:1000, e:720}] },
    { key: "geo.era.mesoproterozoic", abbr: "MP", abbrPdf: "MP", start: 1600, end: 1000, color: "#FDB462", subs: [{k:"geo.stenian", s:1200, e:1000}, {k:"geo.ectasian", s:1400, e:1200}, {k:"geo.calymmian", s:1600, e:1400}] },
    { key: "geo.era.paleoproterozoic", abbr: "PP", abbrPdf: "PP", start: 2500, end: 1600, color: "#F74370", subs: [{k:"geo.statherian", s:1800, e:1600}, {k:"geo.orosirian", s:2050, e:1800}, {k:"geo.rhyacian", s:2300, e:2050}, {k:"geo.siderian", s:2500, e:2300}] },
    { key: "geo.era.neoarchean", abbr: "NA", abbrPdf: "NA", start: 2800, end: 2500, color: "#F99BC1", subs: [] },
    { key: "geo.era.mesoarchean", abbr: "MA", abbrPdf: "MA", start: 3200, end: 2800, color: "#F768A9", subs: [] },
    { key: "geo.era.paleoarchean", abbr: "PA", abbrPdf: "PA", start: 3600, end: 3200, color: "#F4449F", subs: [] },
    { key: "geo.era.eoarchean", abbr: "EA", abbrPdf: "EA", start: 4031, end: 3600, color: "#DA037F", subs: [] },
    { key: "geo.eon.hadean", abbr: "H", abbrPdf: "H", start: EARTH_AGE, end: 4031, color: "#AE027E", subs: [] },
];

/** Toutes les unités de la frise du chronogramme, de 0 à EARTH_AGE, de la plus récente à la plus ancienne. */
export const GEO_DETAILS: GeoPeriod[] = [...PHANEROZOIC_PERIODS, ...PRECAMBRIAN_UNITS];

/** Subdivisions à afficher dans la rangée haute / le zoom. Une unité sans subdivision se représente elle-même
 *  (sa clé est alors celle de l'unité : tester `sub.k === unit.key` pour ne pas répéter l'étiquette). */
export const stagesOf = (unit: GeoPeriod): GeoStage[] =>
    unit.subs.length > 0 ? unit.subs : [{ k: unit.key, s: unit.start, e: unit.end }];

/** Clés i18n des unités, dans l'ordre de GEO_DETAILS. */
export const CHRONO_PERIOD_KEYS = GEO_DETAILS.map(p => p.key);

/** Frise Phanérozoïque (de la plus ancienne à la plus récente), précédée d'un bloc « Précambrien »
 *  tronqué à PHANEROZOIC_TIMELINE_MAX (bloc d'affichage, pas une unité ICS : couleur conservée). */
export const GEOLOGICAL_PERIODS: { key: string; abbr: string; abbrPdf: string; start: number; end: number; color: string }[] = [
    { key: 'geo.period.precambrian', abbr: 'PreꞒ', abbrPdf: 'PréC', start: PHANEROZOIC_TIMELINE_MAX, end: PHANEROZOIC_BASE, color: '#F0A0B0' },
    ...PHANEROZOIC_PERIODS.slice().reverse().map(({ key, abbr, abbrPdf, start, end, color }) => ({ key, abbr, abbrPdf, start, end, color })),
];

/** Éons (frise « temps profond »). Âges ICS ; couleurs propres à l'application (texte blanc lisible). */
export const PRECAMBRIAN_EONS = [
    { key: 'geo.eon.hadean', abbr: 'Had', start: EARTH_AGE, end: 4031, color: '#6A5ACD' },
    { key: 'geo.eon.archean', abbr: 'Arch', start: 4031, end: 2500, color: '#A020F0' },
    { key: 'geo.eon.proterozoic', abbr: 'Prot', start: 2500, end: PHANEROZOIC_BASE, color: '#F08080' },
    { key: 'geo.eon.phanerozoic', abbr: 'Phan', start: PHANEROZOIC_BASE, end: 0, color: '#99C68E' },
];

export function adjustColorLightness(hex: string, percent: number): string {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);
    
    if (percent > 0) {
        r = r + Math.round((255 - r) * (percent / 100));
        g = g + Math.round((255 - g) * (percent / 100));
        b = b + Math.round((255 - b) * (percent / 100));
    } else {
        r = r + Math.round(r * (percent / 100));
        g = g + Math.round(g * (percent / 100));
        b = b + Math.round(b * (percent / 100));
    }
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}
// ---------- Charte détaillée : figure d'aide « Frise des temps géologiques » (phase 4) ----------
// Données reprises de la même charte (gts:ratifiedGSSP / gts:ratifiedGSSA, marginOfError, couleurs officielles).
// Aucun âge ici : les bornes se lisent dans GEO_DETAILS ci-dessus (source unique) ; ces tables ajoutent le
// regroupement en séries et en ères, les couleurs officielles des étages et la nature de chaque limite.

/** Nature de la limite INFÉRIEURE (base) d'une unité : clou d'or (GSSP ratifié), âge numérique (GSSA, Précambrien)
 *  ou pas encore de définition ratifiée (null). err = incertitude de l'âge de la base, en Ma (si la charte la donne). */
export type BoundaryDef = { kind: 'gssp' | 'gssa' | null; err?: number };
/** Par clé d'étage (Phanérozoïque) ou d'unité précambrienne. La base d'une période est celle de son étage le plus ancien. */
export const BOUNDARIES: Record<string, BoundaryDef> = {
    "geo.holocene": { kind: "gssp" },
    "geo.tarantian": { kind: null },
    "geo.chibanian": { kind: "gssp" },
    "geo.calabrian": { kind: "gssp" },
    "geo.gelasian": { kind: "gssp" },
    "geo.piacenzian": { kind: "gssp" },
    "geo.zanclean": { kind: "gssp" },
    "geo.messinian": { kind: "gssp" },
    "geo.tortonian": { kind: "gssp" },
    "geo.serravallian": { kind: "gssp" },
    "geo.langhian": { kind: "gssp" },
    "geo.burdigalian": { kind: null },
    "geo.aquitanian": { kind: "gssp" },
    "geo.chattian": { kind: "gssp" },
    "geo.rupelian": { kind: "gssp" },
    "geo.priabonian": { kind: "gssp" },
    "geo.bartonian": { kind: null },
    "geo.lutetian": { kind: "gssp" },
    "geo.ypresian": { kind: "gssp" },
    "geo.thanetian": { kind: "gssp" },
    "geo.selandian": { kind: "gssp" },
    "geo.danian": { kind: "gssp" },
    "geo.maastrichtian": { kind: "gssp", err: 0.2 },
    "geo.campanian": { kind: "gssp", err: 0.2 },
    "geo.santonian": { kind: "gssp", err: 0.2 },
    "geo.coniacian": { kind: "gssp", err: 0.3 },
    "geo.turonian": { kind: "gssp", err: 0.2 },
    "geo.cenomanian": { kind: "gssp", err: 0.1 },
    "geo.albian": { kind: "gssp", err: 0.3 },
    "geo.aptian": { kind: null, err: 0.6 },
    "geo.barremian": { kind: "gssp" },
    "geo.hauterivian": { kind: "gssp", err: 0.6 },
    "geo.valanginian": { kind: "gssp", err: 0.2 },
    "geo.berriasian": { kind: null, err: 0.6 },
    "geo.tithonian": { kind: null, err: 0.7 },
    "geo.kimmeridgian": { kind: "gssp", err: 0.8 },
    "geo.oxfordian": { kind: null, err: 1 },
    "geo.callovian": { kind: null, err: 1.1 },
    "geo.bathonian": { kind: "gssp", err: 1.2 },
    "geo.bajocian": { kind: "gssp", err: 0.8 },
    "geo.aalenian": { kind: "gssp", err: 0.8 },
    "geo.toarcian": { kind: "gssp", err: 0.3 },
    "geo.pliensbachian": { kind: "gssp", err: 0.3 },
    "geo.sinemurian": { kind: "gssp", err: 0.3 },
    "geo.hettangian": { kind: "gssp", err: 0.2 },
    "geo.rhaetian": { kind: null },
    "geo.norian": { kind: null },
    "geo.carnian": { kind: "gssp" },
    "geo.ladinian": { kind: "gssp", err: 0.28 },
    "geo.anisian": { kind: null },
    "geo.olenekian": { kind: null },
    "geo.induan": { kind: "gssp", err: 0.024 },
    "geo.changhsingian": { kind: "gssp", err: 0.07 },
    "geo.wuchiapingian": { kind: "gssp", err: 0.084 },
    "geo.capitanian": { kind: "gssp", err: 0.16 },
    "geo.wordian": { kind: "gssp", err: 0.4 },
    "geo.roadian": { kind: "gssp", err: 0.4 },
    "geo.kungurian": { kind: null, err: 0.4 },
    "geo.artinskian": { kind: "gssp", err: 0.26 },
    "geo.sakmarian": { kind: "gssp", err: 0.17 },
    "geo.asselian": { kind: "gssp", err: 0.15 },
    "geo.gzhelian": { kind: null, err: 0.1 },
    "geo.kasimovian": { kind: null, err: 0.1 },
    "geo.moscovian": { kind: null, err: 0.2 },
    "geo.bashkirian": { kind: "gssp", err: 0.4 },
    "geo.serpukhovian": { kind: null, err: 0.4 },
    "geo.visean": { kind: "gssp", err: 0.4 },
    "geo.tournaisian": { kind: "gssp", err: 0.19 },
    "geo.famennian": { kind: "gssp", err: 0.46 },
    "geo.frasnian": { kind: "gssp", err: 1.36 },
    "geo.givetian": { kind: "gssp", err: 1.04 },
    "geo.eifelian": { kind: "gssp", err: 0.99 },
    "geo.emsian": { kind: "gssp", err: 1.95 },
    "geo.pragian": { kind: "gssp", err: 1.91 },
    "geo.lochkovian": { kind: "gssp", err: 1.36 },
    "geo.pridoli": { kind: "gssp", err: 1.6 },
    "geo.ludfordian": { kind: "gssp", err: 1.5 },
    "geo.gorstian": { kind: "gssp", err: 1.5 },
    "geo.homerian": { kind: "gssp", err: 1.3 },
    "geo.sheinwoodian": { kind: "gssp", err: 1.2 },
    "geo.telychian": { kind: "gssp", err: 1 },
    "geo.aeronian": { kind: "gssp", err: 1 },
    "geo.rhuddanian": { kind: "gssp", err: 1 },
    "geo.hirnantian": { kind: "gssp", err: 0.9 },
    "geo.katian": { kind: "gssp", err: 0.7 },
    "geo.sandbian": { kind: "gssp", err: 0.7 },
    "geo.darriwilian": { kind: "gssp", err: 0.9 },
    "geo.dapingian": { kind: "gssp", err: 1.4 },
    "geo.floian": { kind: "gssp", err: 1.2 },
    "geo.tremadocian": { kind: "gssp", err: 1.5 },
    "geo.stage10": { kind: null },
    "geo.jiangshanian": { kind: "gssp" },
    "geo.paibian": { kind: "gssp" },
    "geo.guzhangian": { kind: "gssp" },
    "geo.drumian": { kind: "gssp" },
    "geo.wuliuan": { kind: "gssp" },
    "geo.stage4": { kind: null },
    "geo.stage3": { kind: null },
    "geo.stage2": { kind: null },
    "geo.fortunian": { kind: "gssp", err: 0.6 },
    "geo.era.neoproterozoic": { kind: "gssa" }, // base = celle du Tonien (1000 Ma, GSSA) ; la charte marque aussi l'ère « GSSP »
    "geo.ediacaran": { kind: "gssp" },
    "geo.cryogenian": { kind: null },
    "geo.tonian": { kind: "gssa" },
    "geo.era.mesoproterozoic": { kind: "gssa" },
    "geo.stenian": { kind: "gssa" },
    "geo.ectasian": { kind: "gssa" },
    "geo.calymmian": { kind: "gssa" },
    "geo.era.paleoproterozoic": { kind: "gssa" },
    "geo.statherian": { kind: "gssa" },
    "geo.orosirian": { kind: "gssa" },
    "geo.rhyacian": { kind: "gssa" },
    "geo.siderian": { kind: "gssa" },
    "geo.era.neoarchean": { kind: "gssa" },
    "geo.era.mesoarchean": { kind: "gssa" },
    "geo.era.paleoarchean": { kind: "gssa" },
    "geo.era.eoarchean": { kind: "gssa", err: 3 },
    "geo.eon.hadean": { kind: "gssa" },
};

/** Couleurs officielles ICS des étages et des périodes du Protérozoïque (la frise du chronogramme les teinte d'après la période). */
export const STAGE_COLORS: Record<string, string> = { "geo.holocene": "#FEEBD2", "geo.tarantian": "#FFF2D3", "geo.chibanian": "#FFF2C7", "geo.calabrian": "#FFF2BA", "geo.gelasian": "#FFEDB3", "geo.piacenzian": "#FFFFBF", "geo.zanclean": "#FFFFB3", "geo.messinian": "#FFFF73", "geo.tortonian": "#FFFF66", "geo.serravallian": "#FFFF59", "geo.langhian": "#FFFF4D", "geo.burdigalian": "#FFFF41", "geo.aquitanian": "#FFFF33", "geo.chattian": "#FEE6AA", "geo.rupelian": "#FED99A", "geo.priabonian": "#FDCDA1", "geo.bartonian": "#FDC091", "geo.lutetian": "#FDB482", "geo.ypresian": "#FCA773", "geo.thanetian": "#FDBF6F", "geo.selandian": "#FEBF65", "geo.danian": "#FDB462", "geo.maastrichtian": "#F2FA8C", "geo.campanian": "#E6F47F", "geo.santonian": "#D9EF74", "geo.coniacian": "#CCE968", "geo.turonian": "#BFE35D", "geo.cenomanian": "#B3DE53", "geo.albian": "#CCEA97", "geo.aptian": "#BFE48A", "geo.barremian": "#B3DF7F", "geo.hauterivian": "#A6D975", "geo.valanginian": "#99D36A", "geo.berriasian": "#8CCD60", "geo.tithonian": "#D9F1F7", "geo.kimmeridgian": "#CCECF4", "geo.oxfordian": "#BFE7F1", "geo.callovian": "#BFE7E5", "geo.bathonian": "#B3E2E3", "geo.bajocian": "#A6DDE0", "geo.aalenian": "#9AD9DD", "geo.toarcian": "#99CEE3", "geo.pliensbachian": "#80C5DD", "geo.sinemurian": "#67BCD8", "geo.hettangian": "#4EB3D3", "geo.rhaetian": "#E3B9DB", "geo.norian": "#D6AAD3", "geo.carnian": "#C99BCB", "geo.ladinian": "#C983BF", "geo.anisian": "#BC75B7", "geo.olenekian": "#B051A5", "geo.induan": "#A4469F", "geo.changhsingian": "#FCC0B2", "geo.wuchiapingian": "#FCB4A2", "geo.capitanian": "#FB9A85", "geo.wordian": "#FB8D76", "geo.roadian": "#FB8069", "geo.kungurian": "#E38776", "geo.artinskian": "#E37B68", "geo.sakmarian": "#E36F5C", "geo.asselian": "#E36350", "geo.gzhelian": "#CCD4C7", "geo.kasimovian": "#BFD0C5", "geo.moscovian": "#B3CBB9", "geo.bashkirian": "#99C2B5", "geo.serpukhovian": "#BFC26B", "geo.visean": "#A6B96C", "geo.tournaisian": "#8CB06C", "geo.famennian": "#F2EDB3", "geo.frasnian": "#F2EDAD", "geo.givetian": "#F1E185", "geo.eifelian": "#F1D576", "geo.emsian": "#E5D075", "geo.pragian": "#E5C468", "geo.lochkovian": "#E5B75A", "geo.pridoli": "#E6F5E1", "geo.ludfordian": "#D9F0DF", "geo.gorstian": "#CCECDD", "geo.homerian": "#CCEBD1", "geo.sheinwoodian": "#BFE6C3", "geo.telychian": "#BFE6CF", "geo.aeronian": "#B3E1C2", "geo.rhuddanian": "#A6DCB5", "geo.hirnantian": "#A6DBAB", "geo.katian": "#99D69F", "geo.sandbian": "#8CD094", "geo.darriwilian": "#74C69C", "geo.dapingian": "#66C092", "geo.floian": "#41B087", "geo.tremadocian": "#33A97E", "geo.stage10": "#E6F5C9", "geo.jiangshanian": "#D9F0BB", "geo.paibian": "#CCEBAE", "geo.guzhangian": "#CCDFAA", "geo.drumian": "#BFD99D", "geo.wuliuan": "#B3D492", "geo.stage4": "#B3CA8E", "geo.stage3": "#A6C583", "geo.stage2": "#A6BA80", "geo.fortunian": "#99B575", "geo.ediacaran": "#FED96A", "geo.cryogenian": "#FECC5C", "geo.tonian": "#FEBF4E", "geo.stenian": "#FED99A", "geo.ectasian": "#FDCC8A", "geo.calymmian": "#FDC07A", "geo.statherian": "#F875A7", "geo.orosirian": "#F76898", "geo.rhyacian": "#F75B89", "geo.siderian": "#F74F7C" };

/** Séries / époques du Phanérozoïque (couleur officielle), avec leurs étages du plus récent au plus ancien. */
export type ChartEpoch = { key: string; period: string; color: string; stages: string[] };
export const EPOCHS: ChartEpoch[] = [
    { key: "geo.epoch.holocene", period: "geo.period.quaternary", color: "#FEEBD2", stages: ["geo.holocene"] },
    { key: "geo.epoch.pleistocene", period: "geo.period.quaternary", color: "#FFEFAF", stages: ["geo.tarantian", "geo.chibanian", "geo.calabrian", "geo.gelasian"] },
    { key: "geo.epoch.pliocene", period: "geo.period.neogene", color: "#FFFF99", stages: ["geo.piacenzian", "geo.zanclean"] },
    { key: "geo.epoch.miocene", period: "geo.period.neogene", color: "#FFFF00", stages: ["geo.messinian", "geo.tortonian", "geo.serravallian", "geo.langhian", "geo.burdigalian", "geo.aquitanian"] },
    { key: "geo.epoch.oligocene", period: "geo.period.paleogene", color: "#FEC07A", stages: ["geo.chattian", "geo.rupelian"] },
    { key: "geo.epoch.eocene", period: "geo.period.paleogene", color: "#FDB46C", stages: ["geo.priabonian", "geo.bartonian", "geo.lutetian", "geo.ypresian"] },
    { key: "geo.epoch.paleocene", period: "geo.period.paleogene", color: "#FDA75F", stages: ["geo.thanetian", "geo.selandian", "geo.danian"] },
    { key: "geo.epoch.upper_cretaceous", period: "geo.period.cretaceous", color: "#A6D84A", stages: ["geo.maastrichtian", "geo.campanian", "geo.santonian", "geo.coniacian", "geo.turonian", "geo.cenomanian"] },
    { key: "geo.epoch.lower_cretaceous", period: "geo.period.cretaceous", color: "#8CCD57", stages: ["geo.albian", "geo.aptian", "geo.barremian", "geo.hauterivian", "geo.valanginian", "geo.berriasian"] },
    { key: "geo.epoch.upper_jurassic", period: "geo.period.jurassic", color: "#B3E3EE", stages: ["geo.tithonian", "geo.kimmeridgian", "geo.oxfordian"] },
    { key: "geo.epoch.middle_jurassic", period: "geo.period.jurassic", color: "#80CFD8", stages: ["geo.callovian", "geo.bathonian", "geo.bajocian", "geo.aalenian"] },
    { key: "geo.epoch.lower_jurassic", period: "geo.period.jurassic", color: "#42AED0", stages: ["geo.toarcian", "geo.pliensbachian", "geo.sinemurian", "geo.hettangian"] },
    { key: "geo.epoch.upper_triassic", period: "geo.period.triassic", color: "#BD8CC3", stages: ["geo.rhaetian", "geo.norian", "geo.carnian"] },
    { key: "geo.epoch.middle_triassic", period: "geo.period.triassic", color: "#B168B1", stages: ["geo.ladinian", "geo.anisian"] },
    { key: "geo.epoch.lower_triassic", period: "geo.period.triassic", color: "#983999", stages: ["geo.olenekian", "geo.induan"] },
    { key: "geo.epoch.lopingian", period: "geo.period.permian", color: "#FBA794", stages: ["geo.changhsingian", "geo.wuchiapingian"] },
    { key: "geo.epoch.guadalupian", period: "geo.period.permian", color: "#FB745C", stages: ["geo.capitanian", "geo.wordian", "geo.roadian"] },
    { key: "geo.epoch.cisuralian", period: "geo.period.permian", color: "#EF5845", stages: ["geo.kungurian", "geo.artinskian", "geo.sakmarian", "geo.asselian"] },
    { key: "geo.epoch.upper_pennsylvanian", period: "geo.period.carboniferous", color: "#BFD0BA", stages: ["geo.gzhelian", "geo.kasimovian"] },
    { key: "geo.epoch.middle_pennsylvanian", period: "geo.period.carboniferous", color: "#A6C7B7", stages: ["geo.moscovian"] },
    { key: "geo.epoch.lower_pennsylvanian", period: "geo.period.carboniferous", color: "#8CBEB4", stages: ["geo.bashkirian"] },
    { key: "geo.epoch.upper_mississippian", period: "geo.period.carboniferous", color: "#B3BE6C", stages: ["geo.serpukhovian"] },
    { key: "geo.epoch.middle_mississippian", period: "geo.period.carboniferous", color: "#99B46C", stages: ["geo.visean"] },
    { key: "geo.epoch.lower_mississippian", period: "geo.period.carboniferous", color: "#80AB6C", stages: ["geo.tournaisian"] },
    { key: "geo.epoch.upper_devonian", period: "geo.period.devonian", color: "#F1E19D", stages: ["geo.famennian", "geo.frasnian"] },
    { key: "geo.epoch.middle_devonian", period: "geo.period.devonian", color: "#F1C868", stages: ["geo.givetian", "geo.eifelian"] },
    { key: "geo.epoch.lower_devonian", period: "geo.period.devonian", color: "#E5AC4D", stages: ["geo.emsian", "geo.pragian", "geo.lochkovian"] },
    { key: "geo.epoch.pridoli", period: "geo.period.silurian", color: "#E6F5E1", stages: ["geo.pridoli"] },
    { key: "geo.epoch.ludlow", period: "geo.period.silurian", color: "#BFE6CF", stages: ["geo.ludfordian", "geo.gorstian"] },
    { key: "geo.epoch.wenlock", period: "geo.period.silurian", color: "#B3E1C2", stages: ["geo.homerian", "geo.sheinwoodian"] },
    { key: "geo.epoch.llandovery", period: "geo.period.silurian", color: "#99D7B3", stages: ["geo.telychian", "geo.aeronian", "geo.rhuddanian"] },
    { key: "geo.epoch.upper_ordovician", period: "geo.period.ordovician", color: "#7FCA93", stages: ["geo.hirnantian", "geo.katian", "geo.sandbian"] },
    { key: "geo.epoch.middle_ordovician", period: "geo.period.ordovician", color: "#4DB47E", stages: ["geo.darriwilian", "geo.dapingian"] },
    { key: "geo.epoch.lower_ordovician", period: "geo.period.ordovician", color: "#1A9D6F", stages: ["geo.floian", "geo.tremadocian"] },
    { key: "geo.epoch.furongian", period: "geo.period.cambrian", color: "#B3E095", stages: ["geo.stage10", "geo.jiangshanian", "geo.paibian"] },
    { key: "geo.epoch.miaolingian", period: "geo.period.cambrian", color: "#A6CF86", stages: ["geo.guzhangian", "geo.drumian", "geo.wuliuan"] },
    { key: "geo.epoch.cambrian_series2", period: "geo.period.cambrian", color: "#99C078", stages: ["geo.stage4", "geo.stage3"] },
    { key: "geo.epoch.terreneuvian", period: "geo.period.cambrian", color: "#8CB06C", stages: ["geo.stage2", "geo.fortunian"] },
];

/** Ères du Phanérozoïque et leurs périodes (du plus récent au plus ancien). */
export const PHANEROZOIC_ERAS: { key: string; color: string; periods: string[] }[] = [
    { key: "geo.era.cenozoic", color: "#F2F91D", periods: ["geo.period.quaternary", "geo.period.neogene", "geo.period.paleogene"] },
    { key: "geo.era.mesozoic", color: "#67C5CA", periods: ["geo.period.cretaceous", "geo.period.jurassic", "geo.period.triassic"] },
    { key: "geo.era.paleozoic", color: "#99C08D", periods: ["geo.period.permian", "geo.period.carboniferous", "geo.period.devonian", "geo.period.silurian", "geo.period.ordovician", "geo.period.cambrian"] },
];

/** Couleurs officielles des éons. */
export const EON_COLORS: Record<string, string> = {"geo.eon.phanerozoic": "#9AD9DD", "geo.eon.proterozoic": "#F73563", "geo.eon.archean": "#F0047F", "geo.eon.hadean": "#AE027E"};
