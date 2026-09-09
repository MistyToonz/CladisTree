export interface AppSettings {
    theme: string;
    lang: string;
    canvasBgLinked: boolean;
    defaultLayout: 'standard' | 'comb' | 'chrono';
    smartTaxonomy: boolean;
    zoomSensitivity: number;
    ficheColor: string;
    pdfTimeline: boolean;
    showFicheIndicator: boolean;
    autoItalic: boolean;
    speciesFormat: 'full' | 'abbrev';
    countInvalid: boolean;
    autoUpdateCheck: boolean;
    wallpaper: string;
    wallpaperOpacity: number;
}

export const defaultSettings: AppSettings = {
    theme: 'light',
    lang: 'fr',
    canvasBgLinked: false,
    defaultLayout: 'standard',
    smartTaxonomy: true,
    zoomSensitivity: 5,
    ficheColor: '#4CAF50',
    pdfTimeline: true,
    showFicheIndicator: false,
    autoItalic: true,
    speciesFormat: 'full',
    countInvalid: false,
    autoUpdateCheck: true,
    wallpaper: '',
    wallpaperOpacity: 100
};

export const state = {
    appSettings: { ...defaultSettings },
    layoutMode: 'standard' as 'standard' | 'comb' | 'chrono',
    currentRootId: 'root',
    currentFilePath: undefined as string | undefined,
    clipboard: null as any,
    activeNode: null as any,
    hasUnsavedChanges: false,
    isInitializing: true,
    isForceClosing: false,
    undoStack: [] as string[],
    redoStack: [] as string[],
    currentCSVData: '',
    currentXlsxRows: [] as any[],
    currentXlsxTitle: ''
};

export const stateManager = {
    getLightweightState(cy: any): string {
        const elements: any[] = [];
        cy.elements().forEach((e: any) => {
            elements.push({
                group: e.isNode() ? 'nodes' : 'edges',
                data: e.data(),
                classes: e.classes().join(' '),
                selected: e.selected()
            });
        });
        return JSON.stringify({ elements: elements, root: state.currentRootId });
    },

    saveState(cy: any, onUnsavedChange: (unsaved: boolean) => void) {
        state.undoStack.push(this.getLightweightState(cy));
        if (state.undoStack.length > 15) state.undoStack.shift();
        state.redoStack = [];
        state.hasUnsavedChanges = true;
        onUnsavedChange(true);
    },

    undo(cy: any, refreshLayout: (fit: boolean) => void, onUnsavedChange: (unsaved: boolean) => void) {
        if (state.undoStack.length === 0) return;
        const currentPan = cy.pan();
        const currentZoom = cy.zoom();
        state.redoStack.push(this.getLightweightState(cy));
        const s = JSON.parse(state.undoStack.pop() as string);
        
        cy.startBatch();
        cy.elements().remove();
        cy.add(s.elements);
        state.currentRootId = s.root;
        refreshLayout(false);
        cy.endBatch();
        
        cy.viewport({ zoom: currentZoom, pan: currentPan });
        state.hasUnsavedChanges = true;
        onUnsavedChange(true);
    },

    redo(cy: any, refreshLayout: (fit: boolean) => void, onUnsavedChange: (unsaved: boolean) => void) {
        if (state.redoStack.length === 0) return;
        const currentPan = cy.pan();
        const currentZoom = cy.zoom();
        state.undoStack.push(this.getLightweightState(cy));
        const s = JSON.parse(state.redoStack.pop() as string);
        
        cy.startBatch();
        cy.elements().remove();
        cy.add(s.elements);
        state.currentRootId = s.root;
        refreshLayout(false);
        cy.endBatch();
        
        cy.viewport({ zoom: currentZoom, pan: currentPan });
        state.hasUnsavedChanges = true;
        onUnsavedChange(true);
    },

    resetStacks() {
        state.undoStack = [];
        state.redoStack = [];
    }
};