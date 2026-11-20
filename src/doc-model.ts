// ==========================================
// MODÈLE DE DOCUMENT .phylo — FORMAT v2 (CladisTree 1.4)
// ==========================================
// Principes (voir docs/roadmap-1.4.md, « Classifications alternatives ») :
//  - un TAXON (fiche, images, audio, synonymie…) existe une seule fois, dans `taxa` ;
//  - un ARBRE (une classification) est fait de NŒUDS qui référencent des taxons ; tout ce qui dépend
//    de la position (parent, ordre, boîtes, feuilles, repli, supports, styles de branche) appartient à l'arbre ;
//  - les relations de position (groupe frère, lignée, descendants) ne sont JAMAIS stockées : on les recalcule ;
//  - les images sont dans `assets` (une seule copie par contenu), les fiches n'en gardent que l'identifiant.
//
// Toute donnée entrante passe par migrate() (migrate.ts), qui produit ce format.

export const FORMAT_VERSION = 2;

/** Image rattachée à un taxon. `role` = où elle s'affiche aujourd'hui. */
export type TaxonImage = {
    asset: string;              // clé dans PhyloDoc.assets
    role: 'tree' | 'sheet';     // 'tree' = vignette sur l'arbre, 'sheet' = illustration de la fiche
    name?: string;              // nom du fichier d'origine
    credits?: string;
    ratio?: number;             // largeur / hauteur
};

/** Son rattaché à un taxon : chemin RELATIF au fichier .phylo (non embarqué, non exporté). */
export type TaxonAudio = { path: string; name?: string };

export type TaxonRecord = {
    id: string;
    /** Champs de la fiche (nom, rang, statut, période, auteur, notes, etc.). Voir TAXON_FIELDS. */
    fields: Record<string, unknown>;
    images: TaxonImage[];
    audio: TaxonAudio | null;
    /** Taxon valide dont celui-ci est synonyme (identifiant de TAXON, pas de nœud). */
    synonymOf: string | null;
};

/** Valeur de support d'une divergence (bootstrap, probabilité postérieure, etc.). */
/** `bracketed` : valeur écrite entre crochets par TNT (groupe contredit par un groupe plus fréquent), affichée « [19] ». */
export type NodeSupport = { value: number | string; kind?: string; bracketed?: boolean };

export type BranchStyle = { color?: string; width?: number; dash?: string };

export type TreeNode = {
    id: string;
    /** null = divergence sans taxon associé (prévu ; la 1.4 associe encore un taxon à chaque nœud). */
    taxonId: string | null;
    parent: string | null;      // nœud parent dans CET arbre
    box: string | null;         // boîte (groupe) qui contient le nœud
    sortIndex: number;
    /** Structure des feuilles, repli, épinglage (voir STRUCTURE_FIELDS). */
    structure: Record<string, unknown>;
    /** Apparence du nom / de la vignette sur l'arbre (voir STYLE_FIELDS). */
    style: Record<string, unknown>;
    support: NodeSupport | null;
    /** Surlignage du NOM sur l'arbre (couleur), uniquement l'arbre, pas la fiche. */
    highlight: string | null;
    /** Style de la branche qui ARRIVE sur ce nœud (pinceau, phase 3). */
    branch: BranchStyle | null;
    /** Champs non classés, conservés tels quels pour ne rien perdre. */
    extra?: Record<string, unknown>;
};

export type BoxRecord = { id: string; parentBox: string | null; data: Record<string, unknown> };

/**
 * Une classification alternative d'une FEUILLE : le contenu propre de la feuille (descendants de sa
 * racine jusqu'aux feuilles imbriquées, qui n'y figurent que comme liens). La variante ACTIVE n'a pas
 * de `nodes` ici : son contenu est dans TreeRecord.nodes (la vue composée). Voir sheet-variants.ts.
 */
export type SheetVariant = { id: string; name: string; nodes?: Record<string, TreeNode>; boxes?: Record<string, BoxRecord> };
export type SheetVariants = { active: string; variants: SheetVariant[] };

export type TreeRecord = {
    id: string;
    name: string;
    /** Vue composée : pour chaque feuille, le contenu de sa classification active. */
    nodes: Record<string, TreeNode>;
    boxes: Record<string, BoxRecord>;
    /** Feuille actuellement affichée (nœud racine de la vue). */
    view: { currentRootId: string };
    /** Classifications alternatives par feuille, indexées par le TAXON racine de la feuille. */
    sheetVariants?: Record<string, SheetVariants>;
    /**
     * Sous-arbres de feuilles imbriquées que la classification active de la feuille parente ne place pas
     * (racine avec parent null). Conservés pour être rattachés quand une variante les replace.
     */
    detached?: Record<string, TreeNode>;
};

export type PhyloDoc = {
    formatVersion: number;
    app?: string;
    taxa: Record<string, TaxonRecord>;
    trees: TreeRecord[];
    activeTreeId: string;
    /** Images en data URI, indexées par identifiant de contenu. */
    assets: Record<string, string>;
};

// ------------------------------------------
// Classement des champs portés par les nœuds Cytoscape (format ≤ 1.3 et copie de travail 1.4)
// ------------------------------------------

/** Champs de fiche : propres au taxon, partagés par toutes les classifications. */
export const TAXON_FIELDS = [
    'name', 'status', 'rank', 'discoveryDate', 'author', 'distribution', 'size', 'mass', 'period',
    'synapomorphies', 'notes', 'iucn', 'diagnose', 'biblio', 'extinct',
    'linkedFileName', 'linkedFilePath',
] as const;

/** Champs d'image (ancien format à plat) convertis en TaxonImage. */
export const IMAGE_FIELDS = ['imgUrl', 'imgName', 'imgCredits', 'imgRatio', 'sheetImage', 'sheetImageRatio'] as const;

/** Structure de l'arbre portée par le nœud. */
export const STRUCTURE_FIELDS = ['hasNewSheet', 'parentSheetId', 'sheetOrder', 'collapsed', 'isPinned', 'branchOffset'] as const;

/** Apparence sur l'arbre. */
export const STYLE_FIELDS = [
    'fontSize', 'fontFamily', 'isBold', 'isItalic', 'hasFrame', 'frameColor',
    'imgSize', 'imgPos', 'imgOffsetX', 'imgOffsetY', 'textAbove',
    'romerClade', // clade choisi comme fuseau du romérogramme (mode « clades choisis »)
] as const;

/** Champs recalculés à chaque mise en page : jamais enregistrés. */
export const COMPUTED_FIELDS = [
    'bgUrls', 'bgWidthsStr', 'bgHeightsStr', 'bgPosXsStr', 'bgPosYsStr', 'bgFitsStr',
    'computedLabel', 'labelW', 'labelH', 'renderWidth', 'renderHeight', 'isEmpty',
    'width', 'height', 'fontWeight', 'fontStyle',
    'cWidth', 'cHeight', 'cShape', 'cBgCol', 'cBgOpac', 'cBorderCol', 'cBorderW', 'cTextMarginX', 'cTextMarginY',
    'isMonophyletic', 'isDraggingReal',
] as const;

/** Champs propres à la copie de travail 1.4 dans Cytoscape (jamais enregistrés tels quels). */
export const SESSION_FIELDS = ['id', 'parent', 'taxonId', 'isDivergence', 'sortIndex', 'synonymTargetId', 'synonymOfOutside', 'support', 'highlight', 'branch', 'audio', 'extraImages'] as const;

export const DEFAULT_TREE_NAME = 'Classification 1';

/** Erreur levée pour un fichier créé par une version plus récente de CladisTree. */
export class FutureFormatError extends Error {
    constructor(public readonly version: number) { super(`formatVersion ${version} > ${FORMAT_VERSION}`); }
}
