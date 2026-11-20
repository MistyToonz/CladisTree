// ==========================================
// ÉCRAN DE CHARGEMENT (phase 4)
// ==========================================
// Affiché dès l'import de ce module (début du script de l'application, avant la construction de
// l'interface), retiré en fondu quand l'application est prête (`bootDone`). Réutilisé pour l'ouverture
// d'un gros fichier (`showLoading` / `hideLoading`).
// Couleurs et police du thème ENREGISTRÉ, lues directement : à ce stade, les variables CSS du thème
// n'existent pas encore. Média : BRAND.loading (logo fixe en attendant l'animation, voir brand.ts).

import { BRAND, brandMediaHTML } from './brand';
import { t } from './i18n';

/** Couleurs de chaque thème (mêmes valeurs que APP_CSS dans utils.ts : --bg-panel, --text-main, --ui-font). */
const THEME_LOOK: Record<string, { bg: string; fg: string; font: string }> = {
    museum: { bg: '#f2eee5', fg: '#1e2329', font: "'Bahnschrift', 'Segoe UI', system-ui, sans-serif" },
    light: { bg: '#f4f4f4', fg: '#000000', font: 'system-ui, -apple-system, sans-serif' },
    dark: { bg: '#2a2a2a', fg: '#eeeeee', font: 'system-ui, -apple-system, sans-serif' },
    sepia: { bg: '#eee8d5', fg: '#4a3b2c', font: "'Times New Roman', Times, serif" },
    ingen: { bg: '#c0c0c0', fg: '#000000', font: "'Courier New', Courier, monospace" },
    console: { bg: '#050505', fg: '#00ff41', font: "'Courier New', Courier, monospace" },
    'high-contrast': { bg: '#000000', fg: '#ffffff', font: 'system-ui, -apple-system, sans-serif' },
    dimmed: { bg: '#2b2b2b', fg: '#a9a9a9', font: 'system-ui, -apple-system, sans-serif' },
};

const savedTheme = (): string => {
    try { const s = JSON.parse(localStorage.getItem('cladistree_settings') || '{}'); return THEME_LOOK[s.theme] ? s.theme : 'museum'; }
    catch { return 'museum'; }
};

const FADE_MS = 220;
let overlay: HTMLDivElement | null = null;
let hideTimer: number | undefined;

const ensureOverlay = (theme = document.body?.getAttribute('data-theme') || savedTheme()) => {
    const look = THEME_LOOK[theme] || THEME_LOOK.light;
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.setAttribute('role', 'status');
        // Styles en ligne : ce calque existe avant la feuille de style de l'application.
        overlay.style.cssText = `position:fixed; inset:0; z-index:10050; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; transition:opacity ${FADE_MS}ms ease-out; opacity:1;`;
        overlay.innerHTML = `
            ${brandMediaHTML(BRAND.loading, 'loading-media', 'CladisTree', theme)}
            <div class="loading-label" style="font-size:13px; letter-spacing:0.5px; opacity:0.8;"></div>
            <div class="loading-bar" style="position:relative; width:160px; height:2px; overflow:hidden; background:rgba(127,127,127,0.25);">
                <span style="position:absolute; top:0; bottom:0; width:40%; background:#2196F3; animation:cl-loading-slide 1.1s ease-in-out infinite;"></span>
            </div>`;
        const media = overlay.querySelector('.loading-media') as HTMLElement;
        media.style.cssText = 'width:120px; height:120px; object-fit:contain; user-select:none;';
        if (!document.getElementById('cl-loading-keyframes')) {
            const st = document.createElement('style');
            st.id = 'cl-loading-keyframes';
            st.textContent = `@keyframes cl-loading-slide { 0% { left:-40%; } 100% { left:100%; } }
                @media (prefers-reduced-motion: reduce) { #loading-overlay .loading-bar span { animation-duration: 3s !important; } }`;
            document.head.appendChild(st);
        }
        (document.body || document.documentElement).appendChild(overlay);
    }
    overlay.style.background = look.bg;
    overlay.style.color = look.fg;
    overlay.style.fontFamily = look.font;
    return overlay;
};

/** Affiche le calque de chargement (immédiatement : il doit être peint AVANT un travail bloquant). */
export const showLoading = (label = t('loading.text')) => {
    window.clearTimeout(hideTimer);
    const el = ensureOverlay();
    (el.querySelector('.loading-label') as HTMLElement).textContent = label;
    el.style.display = 'flex';
    el.style.opacity = '1';
};

/** Retire le calque en fondu. */
export const hideLoading = () => {
    if (!overlay) return;
    overlay.style.opacity = '0';
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => { if (overlay) overlay.style.display = 'none'; }, FADE_MS);
};

/** Laisse le navigateur peindre le calque avant un travail synchrone long (deux images). */
export const paintFirst = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Fin du démarrage : l'interface est construite, le calque s'efface. */
export const bootDone = () => hideLoading();

(window as any)._cladisLoading = { showLoading, hideLoading }; // test de fumée

// Démarrage : visible dès maintenant (le script de l'application s'exécute).
if (document.body) showLoading(t('loading.boot'));
else document.addEventListener('DOMContentLoaded', () => showLoading(t('loading.boot')), { once: true });
