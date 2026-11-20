import { COMPUTED_FIELDS } from './doc-model';

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
    theme: 'museum', // phase 4 : thème par défaut des nouvelles installations
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
    /** Mode « glisser les divergences » (onglet Arbre), voir divergence-drag.ts. */
    divergenceMode: false,
    undoStack: [] as string[],
    redoStack: [] as string[],
    currentCSVData: '',
    currentXlsxRows: [] as any[],
    currentXlsxTitle: ''
};

export const stateManager = {
    /**
     * Instantané d'annulation. Sans les champs recalculés à chaque mise en page (COMPUTED_FIELDS : fonds SVG,
     * libellés, tailles…) ni les éléments de décoration (fuseaux, fonds et repères du chronogramme, fantôme de
     * glisser) : l'annulation relance la mise en page, qui les recrée. (Phase 5 : instantané ÷ ~2 sur un grand arbre.)
     */
    getLightweightState(cy: any): string {
        const elements: any[] = [];
        cy.elements().forEach((e: any) => {
            if (e.hasClass('romer-spindle') || e.hasClass('strato-bg') || e.hasClass('export-chrono')) return;
            const id = e.id();
            if (id === 'ghost-node' || id === 'ghost-edge') return;
            const data = { ...e.data() };
            COMPUTED_FIELDS.forEach(k => { delete data[k]; });
            elements.push({
                group: e.isNode() ? 'nodes' : 'edges',
                data,
                classes: e.classes().join(' '),
                selected: e.selected()
            });
        });
        return JSON.stringify({ elements: elements, root: state.currentRootId });
    },

    /**
     * Rétablit un instantané en n'appliquant que les DIFFÉRENCES avec l'état actuel (phase 5) : avant, tous les
     * éléments étaient supprimés puis recréés, ce qui vidait les caches de dessin de Cytoscape (~1 s pour annuler
     * une mise en gras sur un arbre de 2 400 nœuds). Éléments absents de l'instantané retirés, nouveaux ajoutés,
     * données / classes / boîte parente / sélection mises à jour seulement là où elles diffèrent.
     */
    applySnapshot(cy: any, s: { elements: any[]; root: string }) {
        const computed = new Set<string>(COMPUTED_FIELDS as readonly string[]);
        const want = new Map<string, any>();
        s.elements.forEach(e => want.set(e.data.id, e));
        const strip = (d: any) => { const o: any = {}; Object.keys(d).forEach(k => { if (!computed.has(k)) o[k] = d[k]; }); return o; };
        const toRemove: any[] = [];
        cy.elements().forEach((e: any) => {
            const w = want.get(e.id());
            // Absent, autre nature, ou arête reliée autrement (source / cible non modifiables) : à recréer.
            if (!w || (w.group === 'nodes') !== e.isNode() || (e.isEdge() && (e.data('source') !== w.data.source || e.data('target') !== w.data.target))) toRemove.push(e);
        });
        cy.remove(cy.collection(toRemove)); // (retirer une boîte retire aussi ses nœuds : ils sont rajoutés ci-dessous)
        // Nœuds manquants d'abord, boîtes en premier (parents des autres), puis mises à jour, arêtes en dernier.
        const missing = [...want.values()].filter(w => cy.getElementById(w.data.id).length === 0);
        const missingNodes = missing.filter(w => w.group === 'nodes');
        const isBox = (w: any) => String(w.classes || '').split(' ').includes('box');
        if (missingNodes.length) cy.add([...missingNodes.filter(isBox), ...missingNodes.filter(w => !isBox(w))]);
        const toAdd: any[] = missing.filter(w => w.group !== 'nodes');
        const justAdded = new Set(missingNodes);
        want.forEach((w, id) => {
            const e = cy.getElementById(id);
            if (e.length === 0 || justAdded.has(w)) return;
            if (e.isNode() && (e.data('parent') || null) !== (w.data.parent || null)) e.move({ parent: w.data.parent || null });
            const cur = strip(e.data());
            const next = strip(w.data);
            if (JSON.stringify(cur) !== JSON.stringify(next)) {
                const gone = Object.keys(cur).filter(k => !(k in next) && k !== 'id' && k !== 'parent' && k !== 'source' && k !== 'target');
                if (gone.length) e.removeData(gone.join(' '));
                const changed: any = {};
                Object.keys(next).forEach(k => { if (k !== 'id' && k !== 'parent' && k !== 'source' && k !== 'target' && JSON.stringify(cur[k]) !== JSON.stringify(next[k])) changed[k] = next[k]; });
                if (Object.keys(changed).length) e.data(changed);
            }
            if (e.classes().join(' ') !== (w.classes || '')) e.classes(w.classes || '');
            if (!!w.selected !== e.selected()) { if (w.selected) e.select(); else e.unselect(); }
        });
        if (toAdd.length) cy.add(toAdd);
        state.currentRootId = s.root;
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
        this.applySnapshot(cy, s);
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
        this.applySnapshot(cy, s);
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