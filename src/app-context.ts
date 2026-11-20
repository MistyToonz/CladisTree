// ==========================================
// CONTEXTE PARTAGÉ ENTRE renderer.ts ET SES MODULES
// ==========================================
// Généré par tests/tools/gen-context.js : ne pas modifier à la main (relancer l'outil).
// Chaque propriété est un accesseur vers une variable ou fonction de startApp() (renderer.ts),
// lu au moment de l'appel. Les propriétés modifiables correspondent à des `let` partagés.

import type cytoscape from 'cytoscape';
import type { initUI } from './ui';
import type { ChronoAxisMode } from './chrono-axis';

export interface AppContext {
    readonly cy: cytoscape.Core;
    readonly ui: ReturnType<typeof initUI>;
    readonly checkAutoRank: (node: any) => void;
    readonly chronoAgeToX: (age: number) => number;
    chronoAxisMode: ChronoAxisMode;
    closeCurrentEditor: (() => void) | null;
    readonly closeSidePanel: () => void;
    readonly container: HTMLElement;
    readonly copyClade: (node: any) => void;
    readonly createNewTree: () => boolean;
    readonly cutClade: (node: any) => void;
    readonly executeSave: (forceSaveAs?: boolean) => Promise<void>;
    readonly focusCameraOnNode: (node: any) => void;
    readonly getChronoWorldBounds: () => { x1: number; x2: number; w: number; };
    readonly getGraphBB: () => any;
    readonly getNodeSearchStrings: (node: any) => string[];
    readonly getSheetRootForNode: (node: any) => any;
    globalTimeMax: number;
    globalTimeMin: number;
    readonly graftDocument: (raw: any, targetNode: any) => Promise<void>;
    graphBBVersion: number;
    readonly handleFicheArrow: (e: KeyboardEvent) => boolean;
    readonly handleGrabKey: (e: KeyboardEvent) => boolean;
    readonly interceptNestedSheetDeletion: () => boolean;
    isCameraLocked: boolean;
    isEditing: boolean;
    readonly loadRecentFilesUI: () => void;
    readonly openInlineEditor: (node: any, isNewNode?: boolean) => void;
    readonly openSidePanelForNode: (node: any) => void;
    readonly pasteClade: (targetNode: any) => void;
    readonly pasteFromSystem: (node: any) => Promise<boolean>;
    readonly propagateBoxMembership: (sourceNode: any, newNodes: any[]) => void;
    readonly redo: () => void;
    readonly refreshLayout: (fitCamera?: boolean) => void;
    readonly renderFicheMedia: (n: any) => void;
    readonly renderSheetClassification: (n: any) => void;
    readonly saveState: () => void;
    readonly serializeClade: (node: any) => any[];
    readonly setUnsavedState: (newState: boolean) => void;
    readonly showCustomAlert: (msg: string) => void;
    readonly toggleCollapse: (node: any) => void;
    readonly undo: () => void;
    readonly updateCounters: () => void;
    readonly updateFicheNav: () => void;
    readonly updateRibbonForNode: (node: any) => void;
}
