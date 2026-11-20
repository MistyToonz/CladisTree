// ==========================================
// MAGASIN D'IMAGES (assets) DE LA SESSION
// ==========================================
// Les nœuds Cytoscape ne portent plus l'image en base64 mais une RÉFÉRENCE « asset:<id> ».
// Conséquences : instantanés d'annulation légers, une seule copie d'une image utilisée plusieurs fois
// (copier-coller, même image sur plusieurs taxons, greffe d'un fichier qui la contient déjà).
// L'identifiant est dérivé du contenu : la même image reçoit toujours le même identifiant.
//
// Toute lecture d'image pour l'afficher ou l'exporter passe par resolveAsset().

import { contentId } from './migrate';

const REF_PREFIX = 'asset:';
const store = new Map<string, string>();

export const isAssetRef = (v: unknown): v is string => typeof v === 'string' && v.startsWith(REF_PREFIX);
export const assetIdOf = (ref: string): string => ref.slice(REF_PREFIX.length);
export const refOf = (id: string): string => REF_PREFIX + id;

/** Enregistre une image (data URI) sous l'identifiant `preferredId` si possible ; renvoie l'identifiant retenu. */
export const putAsset = (dataUri: string, preferredId?: string): string => {
    const base = preferredId || contentId(dataUri);
    let id = base, n = 1;
    // Même identifiant mais contenu différent (collision, ou identifiant repris d'un autre fichier) : on suffixe.
    while (store.has(id) && store.get(id) !== dataUri) id = `${base}-${n++}`;
    store.set(id, dataUri);
    return id;
};

/** Range une image et renvoie la référence à mettre dans le nœud. Une valeur vide ou déjà référencée est rendue telle quelle. */
export const toAssetRef = (value: unknown): string => {
    if (typeof value !== 'string' || value.trim() === '') return '';
    if (value.startsWith(REF_PREFIX)) return value;
    if (!value.startsWith('data:')) return value; // URL externe éventuelle : laissée telle quelle
    return refOf(putAsset(value));
};

/** Donne l'URL affichable (data URI) d'une valeur de champ image, référence ou non. */
export const resolveAsset = (value: unknown): string => {
    if (typeof value !== 'string' || value === '') return '';
    if (!isAssetRef(value)) return value;
    return store.get(assetIdOf(value)) || '';
};

export const getAsset = (id: string): string | undefined => store.get(id);

/** Vide le magasin (nouveau document). */
export const clearAssets = (): void => { store.clear(); };

/** Charge les images d'un document ; renvoie la correspondance ancien id → id retenu (souvent identique). */
export const loadAssets = (assets: Record<string, string>): Map<string, string> => {
    const remap = new Map<string, string>();
    Object.entries(assets || {}).forEach(([id, uri]) => {
        if (typeof uri === 'string' && uri !== '') remap.set(id, putAsset(uri, id));
    });
    return remap;
};
