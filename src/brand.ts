// ==========================================
// IDENTITÉ VISUELLE : LOGO ET ANIMATIONS (phase 4)
// ==========================================
// Point d'entrée UNIQUE des médias de marque : le hub d'accueil et l'écran de chargement ne référencent
// que BRAND. Logo transparent généré depuis src/PT.png par tests/tools/make-logo.py (variante « dark »
// aux traits clairs pour les thèmes sombres).
//
// Animations : pour l'instant, le logo fixe. Pour brancher les vraies animations, déposer les fichiers
// dans src/assets/animations/ (voir le README de ce dossier) et remplacer les deux entrées `hub` et
// `loading` ci-dessous (`kind: 'video'` pour .webm / .mp4 ; `'image'` pour .gif / .webp / .png / .svg).

import logoLight from './assets/brand/logo-512.png';
import logoDark from './assets/brand/logo-dark-512.png';

export type BrandMedia = { kind: 'image' | 'video'; light: string; dark: string };

/** Thèmes à fond sombre : logo aux traits clairs. */
export const DARK_THEMES = ['dark', 'dimmed', 'console', 'high-contrast'];
/** Thèmes dont la barre du haut (--bg-topbar) est sombre, même si le fond est clair (InGen : bleu marine). */
export const DARK_TOPBAR_THEMES = [...DARK_THEMES, 'ingen', 'museum'];
/** Surface sur laquelle le média est posé : le fond (--bg-panel) ou la barre du haut (--bg-topbar). */
export type BrandSurface = 'panel' | 'topbar';
const isDarkSurface = (theme: string, surface: BrandSurface) => (surface === 'topbar' ? DARK_TOPBAR_THEMES : DARK_THEMES).includes(theme);

export const BRAND = {
    logo: { kind: 'image', light: logoLight, dark: logoDark } as BrandMedia,
    /** Logo du hub d'accueil. */
    hub: { kind: 'image', light: logoLight, dark: logoDark } as BrandMedia,
    /** Écran de chargement (démarrage, ouverture d'un gros fichier). */
    loading: { kind: 'image', light: logoLight, dark: logoDark } as BrandMedia,
};

const currentTheme = () => document.body.getAttribute('data-theme') || 'light';

/** URL du média adaptée au thème et à la surface (`theme` par défaut : celui de la page). */
export const mediaSrc = (m: BrandMedia, theme = currentTheme(), surface: BrandSurface = 'panel') => (isDarkSurface(theme, surface) ? m.dark : m.light);

/** Élément HTML du média (image ou vidéo en boucle, sans son). Classe `brand-media` pour le changement de thème. */
export const brandMediaHTML = (m: BrandMedia, cls: string, alt = 'CladisTree', theme?: string, surface: BrandSurface = 'panel') => {
    const src = mediaSrc(m, theme, surface);
    const data = `data-light="${m.light}" data-dark="${m.dark}" data-surface="${surface}"`;
    return m.kind === 'video'
        ? `<video class="brand-media ${cls}" ${data} src="${src}" autoplay loop muted playsinline aria-label="${alt}"></video>`
        : `<img class="brand-media ${cls}" ${data} src="${src}" alt="${alt}" draggable="false">`;
};

/** Après un changement de thème : bascule chaque média de marque sur sa variante claire ou sombre. */
export const refreshBrandMedia = (theme = currentTheme()) => {
    document.querySelectorAll<HTMLImageElement | HTMLVideoElement>('.brand-media').forEach(el => {
        const want = isDarkSurface(theme, (el.dataset.surface as BrandSurface) || 'panel') ? el.dataset.dark : el.dataset.light;
        if (want && el.getAttribute('src') !== want) el.setAttribute('src', want);
    });
};
