// ==========================================
// DISTINCTION MOLETTE DE SOURIS / PAVÉ TACTILE
// ==========================================
// Les navigateurs n'indiquent pas la source d'un événement `wheel`. Ancienne heuristique :
// « |deltaY| >= 50 ⇒ molette », or un glissement rapide au pavé tactile dépasse aussi 50 → zoom intempestif.
//
// Principe retenu : on classe le GESTE, pas l'événement isolé. Un geste = une rafale d'événements
// séparés de moins de GESTURE_GAP_MS. Un geste de pavé tactile commence toujours par de petits deltas
// (l'accélération et l'inertie viennent ensuite) : on décide donc sur le début de la rafale, et une fois
// qu'un geste est reconnu comme « pavé tactile », il le reste jusqu'à sa fin, même si les deltas grossissent.

export type WheelSource = 'mouse' | 'trackpad';

const GESTURE_GAP_MS = 120;
/** Sous Chromium, un cran de molette produit wheelDeltaY = ±120 × n. */
const WHEEL_NOTCH = 120;

let currentSource: WheelSource | null = null;
let lastEventTime = 0;

/** Indices propres à un événement isolé. `null` = indécidable sur ce seul événement. */
const sourceHint = (e: WheelEvent): WheelSource | null => {
    // Lignes ou pages : uniquement les molettes (Firefox, certaines souris sous Linux).
    if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return 'mouse';
    // Défilement horizontal simultané : pavé tactile (ou molette inclinable, rare et sans gravité).
    if (e.deltaX !== 0) return 'trackpad';
    // Deltas fractionnaires : pavés tactiles de précision et Magic Mouse.
    if (!Number.isInteger(e.deltaY)) return 'trackpad';
    // API historique non standard (Chromium/Electron) : les crans de molette sont des multiples de 120.
    const legacy = (e as any).wheelDeltaY;
    if (typeof legacy === 'number' && legacy !== 0) {
        return legacy % WHEEL_NOTCH === 0 ? 'mouse' : 'trackpad';
    }
    // Repli : petits deltas entiers = pavé tactile, gros deltas = molette.
    return Math.abs(e.deltaY) < 50 ? 'trackpad' : 'mouse';
};

/** Source probable de l'événement, stable sur toute la durée d'un geste. */
export const classifyWheel = (e: WheelEvent): WheelSource => {
    const now = e.timeStamp || performance.now();
    const newGesture = currentSource === null || now - lastEventTime > GESTURE_GAP_MS;
    lastEventTime = now;

    const hint = sourceHint(e);
    if (newGesture) {
        currentSource = hint ?? 'mouse';
    } else if (hint === 'trackpad') {
        // En cours de geste, on peut basculer vers « pavé tactile », jamais l'inverse :
        // l'inertie d'un glissement rapide ressemble à une molette mais doit continuer à défiler.
        currentSource = 'trackpad';
    }
    return currentSource;
};
