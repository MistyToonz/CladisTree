declare global {
  interface Window {
    electronAPI: {
      saveFile: (data: string, filePath?: string) => Promise<{ success: boolean, canceled?: boolean, filePath?: string, error?: string }>;
      openFile: () => Promise<{ success: boolean, canceled?: boolean, filePath?: string, fileName?: string, data?: Uint8Array, error?: string }>;
      onOpenFileFromOS: (callback: (filePath: string) => void) => void;
      readFileDirect: (filePath: string) => Promise<{ success: boolean, filePath?: string, fileName?: string, data?: Uint8Array, error?: string }>;
      saveExport: (data: string, defaultName: string, ext: string) => Promise<{ success: boolean, canceled?: boolean, filePath?: string, error?: string }>;
      openNewInstance: () => void;
      appVersion: string;
      checkForUpdate: () => Promise<{ success: boolean, version?: string, url?: string, name?: string, publishedAt?: string, status?: number, error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean, error?: string }>;
    }
  }
}
import cytoscape from 'cytoscape';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
import svg from 'cytoscape-svg';
import { jsPDF } from 'jspdf';

// @ts-ignore
import logoPT from './PT.png';
// @ts-ignore
import logoNormal from './Logo_normal.png';
// @ts-ignore
import logoPeigne from './Logo_peigne.png';
// @ts-ignore
import logoChrono from './Logo_chrono.png';
import { EMPTY_DATA } from './config';
import { measureTextWidth, getImageRatio } from './utils';
import { initUI } from './ui';
import { t, setLang, currentLang, Lang } from './i18n';

cytoscape.use(svg);

let ui: ReturnType<typeof initUI>;

// Version reelle du paquet (package.json), transmise par le processus
// principal. Elle remplace les trois valeurs qui etaient ecrites en dur.
const APP_VERSION = (window as any).electronAPI?.appVersion || '';

interface AppSettings {
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
}

let appSettings: AppSettings = {
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
    autoUpdateCheck: true
};

const startApp = () => {
  const container = document.getElementById('app') as HTMLElement; 
  if (!container) return;

  let layoutMode: 'standard' | 'comb' | 'chrono' = 'standard';
  let currentRootId = 'root';
  let currentFilePath: string | undefined = undefined;
  let clipboard: any = null; 
  let activeNode: any = null;
  let hasUnsavedChanges = false; 
  let isInitializing = true; 
  let isForceClosing = false;
  let undoStack: string[] = []; 
  let redoStack: string[] = [];
  let currentCSVData = '';
  let currentXlsxRows: { v: string, italic?: boolean }[][] = [];
  let currentXlsxTitle = '';
  let isBoxSelecting = false; 
  let isMiddlePanning = false;
  let boxStartX = 0, boxStartY = 0;
  let currentMouseX = 0, currentMouseY = 0;
  let autoPanId: number | null = null;
  let draggedNode: any = null;
  let ghostEdge: any = null;
  let currentDragTarget: any = null;
  let possibleTargets: any[] = []; 
  let currentParentId: string | null = null; 
  let draggedDescendants: { node: any, dx: number, dy: number }[] = []; 
  let isEditing = false;
  let editedNode: any = null; 
  let closeCurrentEditor: (() => void) | null = null; 
  let sidePanelTimeout: ReturnType<typeof setTimeout>;
  let panelTimeout: ReturnType<typeof setTimeout>;

  function closeSidePanel() { 
      ui.sidePanel.style.transform = 'translateX(100%)'; 
      const vScroll = document.getElementById('custom-vscroll');
      const hScroll = document.getElementById('custom-hscroll');
      if (vScroll) vScroll.style.right = '0px';
      if (hScroll) hScroll.style.right = '15px';
  }

  function openSidePanelForNode(node: any) {
      activeNode = node; 
      const isBox = node.hasClass('box');
      const rawName = node.data('name'); 
      const displayName = (!rawName || rawName.trim() === '') ? (isBox ? 'Cadre' : t('default.unnamed_branch')) : rawName; 
      const extinctMark = node.data('extinct') && !isBox && displayName !== t('default.unnamed_branch') ? '\u2020 ' : ''; 
      
      ui.panelTitle.innerText = extinctMark + displayName;

      // Affiche la barre de recherche uniquement si le statut est "Synonyme"
      if (node.data('status') === 'Synonyme') {
          ui.containerSynonym.style.display = 'flex';
      } else {
          ui.containerSynonym.style.display = 'none';
      }

      // NOUVEAU : Affichage du lien Hypertexte "Synonyme de"

      // NOUVEAU : Affichage du lien Hypertexte "Synonyme de"
      const synId = node.data('synonymTargetId');
      if (synId) {
          const targetNode = cy.$id(synId);
          if (targetNode.length > 0) {
              // Force l'affichage complet (non contracté) du nom cible
              const targetName = getDynamicNodeName(targetNode, 'full');
              ui.panelSubtitleSynonym.innerHTML = '= ' + targetName;
              ui.panelSubtitleSynonym.style.display = 'block';
              ui.inpSynonymTarget.value = targetNode.data('name') || '';
          } else {
              ui.panelSubtitleSynonym.style.display = 'none';
              ui.inpSynonymTarget.value = '';
          }
      } else {
          ui.panelSubtitleSynonym.style.display = 'none';
          ui.inpSynonymTarget.value = '';
      }
      
      Object.keys(ui.formInputs).forEach(key => { (ui.formInputs as any)[key].value = node.data(key) || ""; }); 
      updateTimeline((ui.formInputs as any)['period'].value as string); 
      
      const sheetImg = node.data('sheetImage');
      const creditsField = document.getElementById('inp-imgCredits'); 
      
      if (sheetImg) {
          ui.previewSheetImage.src = sheetImg;
          ui.previewSheetImage.style.display = 'block';
          ui.btnClearSheetImage.style.display = 'block';
          if (creditsField) creditsField.style.display = 'block';
      } else {
          ui.previewSheetImage.src = '';
          ui.previewSheetImage.style.display = 'none';
          ui.btnClearSheetImage.style.display = 'none';
          if (creditsField) creditsField.style.display = 'none';
      }
      
      if (isBox) {
          ui.lineageContainer.style.display = 'none';
      } else {
          ui.lineageContainer.style.display = 'block';
          ui.lineageContainer.innerHTML = `<strong>${t('label.lineage')}</strong><br><span style="color:var(--text-main); opacity:0.7;">${buildLineageString(node)}</span>`;
      }
      
      // NOUVEAU : Affichage du Fichier Lié
      const linkedName = node.data('linkedFileName');
      if (linkedName) {
          ui.inpLinkedFileName.value = linkedName;
          ui.btnOpenLinkedFile.style.display = 'block';
          ui.btnClearLinkedFile.style.display = 'block';
      } else {
          ui.inpLinkedFileName.value = '';
          ui.btnOpenLinkedFile.style.display = 'none';
          ui.btnClearLinkedFile.style.display = 'none';
      }

      ui.sidePanel.style.transform = 'translateX(0)';

      const vScroll = document.getElementById('custom-vscroll');
      const hScroll = document.getElementById('custom-hscroll');
      if (vScroll) vScroll.style.right = '400px';
      if (hScroll) hScroll.style.right = '415px'; 
  }

  function buildLineageString(node: any, full: boolean = false) {
    let path: string[] = []; let curr: any = node;
    while (curr && curr.length > 0) { 
      if (!curr.hasClass('box')) { 
        const d = curr.data(); 
        if (d.name && d.name.trim() !== '') {
            let name = (d.extinct ? '\u2020 ' : '') + d.name; 
            if (d.isItalic) name = `<i>${name}</i>`; 
            path.unshift(name); 
        }
      } 
      curr = curr.incomers('node').first(); 
    }
    
    // Raccourci UI si plus de 4 éléments et qu'on ne force pas l'affichage complet (ex: PDF)
    if (!full && path.length > 4) {
        // Nettoyage des balises <i> pour le texte pur de la bulle d'aide
        const fullText = path.join(' > ').replace(/<[^>]+>/g, '').replace(/"/g, '&quot;');
        return `${path[0]} > <span title="${fullText}" style="cursor:help; font-weight:bold; letter-spacing:2px; color:#2196F3;">...</span> > ${path[path.length - 2]} > ${path[path.length - 1]}`;
    }
    
    return path.join(' > ');
  }

  function updateRibbonForNode(node: any) {
      activeNode = node; 
      const selFont = document.getElementById('style-font') as HTMLSelectElement; 
      const inpSize = document.getElementById('style-size') as HTMLInputElement; 
      const btnBold = document.getElementById('style-bold') as HTMLButtonElement; 
      const btnItalic = document.getElementById('style-italic') as HTMLButtonElement; 
      const inpImgFile = document.getElementById('style-img-file') as HTMLInputElement; 
      const inpImgSize = document.getElementById('style-img-size') as HTMLInputElement; 
      const selImgPos = document.getElementById('style-img-pos') as HTMLSelectElement; 
      const btnImgClear = document.getElementById('style-img-clear') as HTMLButtonElement; 
      const boxSection = document.getElementById('style-box-section') as HTMLElement; 
      const imgSection = document.getElementById('style-img-section') as HTMLElement; 
      const boxColor = document.getElementById('style-box-color') as HTMLInputElement; 
      const boxName = document.getElementById('style-box-name') as HTMLInputElement; 
      const boxOpacity = document.getElementById('style-box-opacity') as HTMLInputElement; 
      const boxBorderStyle = document.getElementById('style-box-border-style') as HTMLSelectElement; 
      const boxBorderWidth = document.getElementById('style-box-border-width') as HTMLInputElement;
      
      const nodeFrameSection = document.getElementById('style-node-frame-section') as HTMLElement;
      const chkNodeFrame = document.getElementById('style-node-frame') as HTMLInputElement;
      const colNodeFrame = document.getElementById('style-node-frame-color') as HTMLInputElement;
      const styleTextAbove = document.getElementById('style-text-above') as HTMLInputElement;

      selFont.onchange = null; inpSize.onchange = null; btnBold.onclick = null; btnItalic.onclick = null;
      inpImgFile.onchange = null; inpImgSize.oninput = null; selImgPos.oninput = null; btnImgClear.onclick = null;
      boxColor.onchange = null; boxName.oninput = null; boxOpacity.oninput = null; boxBorderStyle.onchange = null; boxBorderWidth.oninput = null;
      chkNodeFrame.onchange = null; colNodeFrame.oninput = null; if(styleTextAbove) styleTextAbove.onchange = null;

      if (node.hasClass('box')) {
          boxSection.style.display = 'flex'; imgSection.style.display = 'none'; nodeFrameSection.style.display = 'none';
          
          boxColor.value = node.data('boxColor') || '#FF9800'; 
          boxName.value = node.data('name') || ''; 
          boxOpacity.value = ((node.data('boxOpacity') !== undefined ? node.data('boxOpacity') : 0.1) * 100).toString(); 
          boxBorderStyle.value = node.data('boxBorderStyle') || 'dashed'; 
          boxBorderWidth.value = node.data('boxBorderWidth') !== undefined ? node.data('boxBorderWidth') : 2;

          if (ui.styleBoxShape) {
              ui.styleBoxShape.value = node.data('boxShape') || 'round-rectangle';
              ui.styleBoxShape.onchange = (ev) => { node.data('boxShape', (ev.target as HTMLSelectElement).value); refreshLayout(); setUnsavedState(true); };
          }
          if (ui.styleBoxVertical) {
              // La case se coche si la box est à 90° ET qu'on est en mode peigne
              ui.styleBoxVertical.checked = layoutMode === 'comb' ? !!node.data('boxTextVertical') : false;
              ui.styleBoxVertical.onchange = (ev) => {
                  if (layoutMode === 'standard') {
                      ui.styleBoxVertical.checked = false;
                      return;
                  }
                  node.data('boxTextVertical', (ev.target as HTMLInputElement).checked); 
                  refreshLayout(); 
                  setUnsavedState(true); 
              };
          }
          if (ui.styleBoxGradient) {
              // La case se coche si la box a un dégradé ET qu'on est en mode peigne
              ui.styleBoxGradient.checked = layoutMode === 'comb' ? !!node.data('boxGradient') : false;
              ui.styleBoxGradient.onchange = (ev) => {
                  if (layoutMode === 'standard') {
                      ui.styleBoxGradient.checked = false;
                      return;
                  }
                  node.data('boxGradient', (ev.target as HTMLInputElement).checked); 
                  refreshLayout(); 
                  setUnsavedState(true); 
              };
          }

          boxColor.onchange = (ev) => { node.data('boxColor', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 
          // OPTIM 5 - un relayout complet par frappe de touche et par cran de
          // curseur : temporise a 90 ms, comme le panneau lateral le fait deja.
          boxName.oninput = (ev) => { node.data('name', (ev.target as any).value); debounced('boxEdit', 90, refreshLayout); setUnsavedState(true); }; 
          boxOpacity.oninput = (ev) => { node.data('boxOpacity', parseInt((ev.target as any).value) / 100); debounced('boxEdit', 90, refreshLayout); setUnsavedState(true); }; 
          boxBorderStyle.onchange = (ev) => { node.data('boxBorderStyle', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 
          boxBorderWidth.oninput = (ev) => { node.data('boxBorderWidth', parseInt((ev.target as any).value)); debounced('boxEdit', 90, refreshLayout); setUnsavedState(true); };
      } else { 
          boxSection.style.display = 'none'; 
          imgSection.style.display = 'flex'; 
          nodeFrameSection.style.display = 'flex'; 
          
          if (styleTextAbove) {
              styleTextAbove.checked = !!node.data('textAbove');
              styleTextAbove.onchange = (ev: any) => { 
                  const val = (ev.target as HTMLInputElement).checked;
                  cy.$('node:selected').forEach((n:any) => {
                      if (!n.hasClass('box')) n.data('textAbove', val);
                  });
                  refreshLayout(); 
                  setUnsavedState(true); 
              };
          }

          chkNodeFrame.checked = !!node.data('hasFrame');
          colNodeFrame.value = node.data('frameColor') || '#000000';
          
          chkNodeFrame.onchange = (ev) => { const val = (ev.target as HTMLInputElement).checked; cy.$('node:selected').forEach((n:any) => n.data('hasFrame', val)); refreshLayout(); setUnsavedState(true); };
          colNodeFrame.onchange = (ev) => { const val = (ev.target as HTMLInputElement).value; cy.$('node:selected').forEach((n:any) => n.data('frameColor', val)); refreshLayout(); setUnsavedState(true); };
      }

      selFont.value = node.data('fontFamily') || 'serif'; inpSize.value = node.data('fontSize') || 16; btnBold.style.background = node.data('isBold') ? 'var(--bg-hover)' : 'var(--bg-input)'; btnItalic.style.background = node.data('isItalic') ? 'var(--bg-hover)' : 'var(--bg-input)'; inpImgSize.value = node.data('imgSize') || 150; selImgPos.value = node.data('imgPos') || 'left'; inpImgFile.value = ''; 
      
      // continuousKey non nul => geste continu (curseur) : un seul etat
      // d'annulation pour tout le geste, et relayout temporise.
      const applyStyleToSelection = (action: (node: any) => void, continuousKey?: string) => {
        if (!continuousKey || !debounceTimers.has('style-' + continuousKey)) saveState();
        const selected = cy.nodes(':selected').filter('node:not(.box)');
        const targets = selected.length > 0 ? selected : cy.collection([node]);
        targets.forEach(n => action(n));
        if (continuousKey) {
            debounced('style-' + continuousKey, 90, refreshLayout);
        } else {
            refreshLayout();
        }
        setUnsavedState(true);
      };

      selFont.onchange = (ev) => applyStyleToSelection(n => n.data('fontFamily', (ev.target as any).value));
      inpSize.onchange = (ev) => applyStyleToSelection(n => n.data('fontSize', parseInt((ev.target as any).value) || 16));
      
      btnBold.onclick = () => {
        const val = !node.data('isBold');
        btnBold.style.background = val ? 'var(--bg-hover)' : 'var(--bg-input)';
        applyStyleToSelection(n => n.data('isBold', val));
      };
      
      btnItalic.onclick = () => {
        const val = !node.data('isItalic');
        btnItalic.style.background = val ? 'var(--bg-hover)' : 'var(--bg-input)';
        applyStyleToSelection(n => n.data('isItalic', val));
      };

      inpImgFile.onchange = (ev) => { const file = (ev.target as HTMLInputElement).files?.[0]; if (file) { const reader = new FileReader(); reader.onload = (eLoad) => { const base64Image = eLoad.target?.result as string; const img = new Image(); img.onload = () => { const ratio = img.width / img.height; applyStyleToSelection(n => { n.data('imgRatio', ratio); n.data('imgUrl', base64Image); }); }; img.src = base64Image; }; reader.readAsDataURL(file); } };
      // OPTIM 5 - applyStyleToSelection empile un etat d'annulation ET relance un
      // layout complet : sur un curseur, cela faisait une centaine des deux pour
      // un seul geste. On temporise, et on n'empile l'etat qu'au premier cran.
      inpImgSize.oninput = (ev) => {
          const v = parseInt((ev.target as any).value) || 150;
          applyStyleToSelection(n => n.data('imgSize', v), 'imgSize');
      };
      selImgPos.oninput = (ev) => {
          const v = (ev.target as any).value;
          applyStyleToSelection(n => n.data('imgPos', v), 'imgPos');
      };
      btnImgClear.onclick = () => applyStyleToSelection(n => n.data('imgUrl', ''));
  }

  // OPTIM 4 - cy.json() appelle ele.json() sur chaque element, qui fait un
  // util.copy PROFOND de l'objet data (verifie dans collection/index.js). Avec
  // des images base64 dans les donnees, chaque annulation recopiait tout le
  // document avant meme de le serialiser. Ici JSON.stringify lit directement
  // l'objet data vivant : plus de copie intermediaire.
  function getLightweightState() {
    const elements: any[] = [];
    cy.elements().forEach((e: any) => {
        elements.push({
            group: e.isNode() ? 'nodes' : 'edges',
            data: e.data(),
            classes: e.classes().join(' '),
            selected: e.selected()
        });
    });
    return JSON.stringify({ elements: elements, root: currentRootId });
  }

  function saveState() { 
    undoStack.push(getLightweightState()); 
    if (undoStack.length > 15) undoStack.shift(); 
    redoStack = []; 
    setUnsavedState(true); 
  }

  function undo() { 
    if (undoStack.length === 0) return; 
    const currentPan = cy.pan();
    const currentZoom = cy.zoom();
    redoStack.push(getLightweightState()); 
    const s = JSON.parse(undoStack.pop() as string); 
    cy.startBatch();
    cy.elements().remove(); 
    cy.add(s.elements); 
    currentRootId = s.root; 
    refreshLayout(false); 
    cy.endBatch();
    cy.viewport({ zoom: currentZoom, pan: currentPan }); 
    setUnsavedState(true); 
  }

  function redo() { 
    if (redoStack.length === 0) return; 
    const currentPan = cy.pan();
    const currentZoom = cy.zoom();
    undoStack.push(getLightweightState()); 
    const s = JSON.parse(redoStack.pop() as string); 
    cy.startBatch();
    cy.elements().remove(); 
    cy.add(s.elements); 
    currentRootId = s.root; 
    refreshLayout(false); 
    cy.endBatch();
    cy.viewport({ zoom: currentZoom, pan: currentPan });
    setUnsavedState(true); 
  }

  function setUnsavedState(state: boolean) { 
      if (isInitializing) return; 
      hasUnsavedChanges = state; 
      ui.btnSave.style.color = state ? "#e53935" : "#4CAF50"; 
      ui.btnSave.innerText = state ? t('topbar.file.save') + " \u25CF" : t('topbar.file.save'); 
  }

  const MAX_RECENT_FILES = 3;

  function saveToRecentFiles(fileName: string, exportData: any, pathToSave?: string) {
    try {
      let recents = JSON.parse(localStorage.getItem('cladistree_recents') || '[]');
      recents = recents.filter((f: any) => f.name !== fileName);
      // NOUVEAU : On sauvegarde la variable path
      recents.unshift({ name: fileName, date: new Date().toLocaleDateString() + ' à ' + new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), data: exportData, path: pathToSave });
      if (recents.length > MAX_RECENT_FILES) recents = recents.slice(0, MAX_RECENT_FILES);
      localStorage.setItem('cladistree_recents', JSON.stringify(recents));
      loadRecentFilesUI();
    } catch (e) { console.warn(t('alert.file_too_large')); }
  }

  function loadRecentFilesUI() {
    const container = document.getElementById('recent-files-container');
    const list = document.getElementById('recent-files-list');
    if (!container || !list) return;

    try {
      const recents = JSON.parse(localStorage.getItem('cladistree_recents') || '[]');
      if (recents.length > 0) {
        container.style.display = 'block'; list.innerHTML = '';
        recents.forEach((file: any) => {
          const btn = document.createElement('button');
          btn.style.cssText = "padding:8px; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:3px; text-align:left; font-size:12px; display:flex; justify-content:space-between; align-items:center;";
          btn.onmouseover = () => btn.style.background = 'var(--bg-hover)'; btn.onmouseout = () => btn.style.background = 'var(--bg-input)';
          btn.innerHTML = `<strong style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:60%;">${file.name}</strong> <span style="font-size:10px; opacity:0.7;">${file.date}</span>`;
          
          // La fonction devient asynchrone pour interroger le disque dur
          btn.onclick = async () => {
            try {
              let treeData = file.data;
              
              // CORRECTIF : Si le fichier possède un chemin absolu, on lit la version fraîche du disque
              if (file.path && window.electronAPI && window.electronAPI.readFileDirect) {
                  const result = await window.electronAPI.readFileDirect(file.path);
                  if (result.success && result.data) {
                      const decoder = new TextDecoder('utf-8');
                      const text = decoder.decode(result.data);
                      treeData = JSON.parse(text);
                  }
              }
              
              currentFilePath = file.path;
              cy.startBatch();
              cy.elements().remove(); 
              cy.add(treeData.graph.elements); 
              currentRootId = treeData.currentRootId || 'root'; 
              if (treeData.theme) applyTheme(treeData.theme); 
              refreshLayout(true); 
              cy.endBatch();
              
              setTimeout(() => { hasUnsavedChanges = false; setUnsavedState(false); undoStack = []; redoStack = []; }, 100);
              if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
            } catch (err) { alert(t('alert.recent_error')); }
          };
          list.appendChild(btn);
        });
      }
    } catch (e) { console.warn(t('alert.history_read_error')); }
  }

  function createNewTree() {
      if (hasUnsavedChanges) {
          if (!confirm(t('confirm.new_tree'))) return;
      }
      
      // Sécurité : on réinitialise l'état d'édition
      if (closeCurrentEditor) closeCurrentEditor();
      isEditing = false;
      activeNode = null;
      clipboard = null;
      
      cy.startBatch();
      cy.elements().remove();
      // On génère la racine AVEC un premier enfant éditable
      cy.add([
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'root', name: t('default.root'), extinct: false, isBold: true, isItalic: false, sortIndex: 0, period: "" } },
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'n1', name: t('default.unnamed_branch'), extinct: false, isBold: false, isItalic: false, sortIndex: 0, period: "" } },
          { group: 'edges', data: { source: 'root', target: 'n1' } }
      ]);
      
      currentRootId = 'root';
      currentFilePath = undefined;
      
      layoutMode = appSettings.defaultLayout;
      ui.btnLayoutNormal.style.background = layoutMode === 'standard' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = layoutMode === 'standard' ? 'invert(1) brightness(2)' : 'none';
      ui.btnLayoutComb.style.background = layoutMode === 'comb' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = layoutMode === 'comb' ? 'invert(1) brightness(2)' : 'none';

      refreshLayout(true);
      cy.endBatch();
      
      setTimeout(() => { 
          hasUnsavedChanges = false; 
          setUnsavedState(false); 
          undoStack = []; 
          redoStack = []; 
      }, 100);
      
      if (ui.sidePanel.style.display === 'block') closeSidePanel();
  }

  async function executeSave(forceSaveAs = false) { 
      let trueRoot: any = cy.$id(currentRootId);
      while (trueRoot.incomers('node').filter((n: any) => !n.hasClass('box')).length > 0) {
          trueRoot = trueRoot.incomers('node').filter((n: any) => !n.hasClass('box')).first();
      }
      
      let rootName = 'Arbre_Phylogenetique';
      if (trueRoot.length > 0 && trueRoot.data('name') && trueRoot.data('name').trim() !== '') {
          rootName = trueRoot.data('name');
      }
      const absoluteRootId = trueRoot.id();

      const exportData = { version: "1.0", currentRootId: absoluteRootId, theme: appSettings.theme, graph: cy.json() }; 

      try {
          const dataStr = JSON.stringify(exportData);
          const targetPath = forceSaveAs ? undefined : currentFilePath;
          
          // --- LIGNE DE DEBUG POUR COMPRENDRE LE BUG ---
          // alert(`Mode Enregistrer-sous forcé ? : ${forceSaveAs} \nChemin actuel en mémoire : ${currentFilePath || "VIDE / INCONNU"}`);
          
          const response = await window.electronAPI.saveFile(dataStr, targetPath);
          
          if (response.success && response.filePath) {
              currentFilePath = response.filePath; 
              saveToRecentFiles(rootName, exportData, currentFilePath); 
              setUnsavedState(false);
              
              // NOUVEAU : Message de confirmation visuelle
              alert("Fichier sauvegardé avec succès dans :\n" + response.filePath);
              
          } else if (response.error) {
              alert(t('alert.save_error') + response.error);
          }
      } catch (err) {
          console.error(t('alert.backend_error'), err);
      }
  }

  function copyClade(node: any) { 
      const clade = node.union(node.successors()); 
      clipboard = { rootId: node.id(), elements: clade.map((ele: any) => ({ group: ele.group(), data: { ...ele.data() }, classes: ele.classes() })) }; 
  }
  
  function cutClade(node: any) {
    if (node.id() === 'root') return; 
    saveState();
    copyClade(node); 
    
    const cladeToDelete = node.union(node.successors());
    if (cladeToDelete.length > 0) {
      if (cladeToDelete.contains(cy.$id(currentRootId))) currentRootId = 'root';
      cy.remove(cladeToDelete);
    }
    refreshLayout();
    
    if (ui.sidePanel.style.display === 'block') {
        ui.sidePanel.style.display = 'none';
    }
  }

  // --- Fonction d'héritage automatique pour les cadres paraphylétiques ---
  function propagateBoxMembership(sourceNode: any, newNodes: any[]) {
      if (!sourceNode || !newNodes || newNodes.length === 0) return;
      
      cy.nodes('.box').forEach((box: any) => {
          let targets = box.data('targets') || [];
          // Si le nœud d'origine est dans la boîte, les nouveaux héritent de l'appartenance
          if (targets.includes(sourceNode.id())) {
              let modified = false;
              newNodes.forEach((n: any) => {
                  if (!targets.includes(n.id()) && !n.hasClass('box')) {
                      targets.push(n.id());
                      modified = true;
                  }
              });
              if (modified) box.data('targets', targets);
          }
      });
  }
  
  function pasteClade(targetNode: any) { 
      if (!clipboard) return; 
      saveState(); 
      const idMap: { [key: string]: string } = {}; 
      const newElements: any[] = []; 
      
      clipboard.elements.filter((e: any) => e.group === 'nodes').forEach((n: any) => { 
          const oldId = n.data.id; 
          const newId = 'taxon-' + Date.now() + Math.random().toString(36).substr(2, 5); 
          idMap[oldId] = newId; 
          newElements.push({ group: 'nodes', classes: n.classes, data: { ...n.data, id: newId } }); 
      }); 
      
      clipboard.elements.filter((e: any) => e.group === 'edges').forEach((e: any) => { 
          if (idMap[e.data.source] && idMap[e.data.target]) { 
              newElements.push({ group: 'edges', data: { source: idMap[e.data.source], target: idMap[e.data.target] } }); 
          } 
      }); 
      
      newElements.push({ group: 'edges', data: { source: targetNode.id(), target: idMap[clipboard.rootId] } }); 
      
      const added = cy.add(newElements); // On récupère les éléments ajoutés
      propagateBoxMembership(targetNode, added.filter('node').toArray()); // On propage !
      
      refreshLayout(); 
  }
  
  function toggleCollapse(node: any) { 
      saveState(); 
      const isCollapsed = !node.data('collapsed'); 
      node.data('collapsed', isCollapsed); 
      refreshLayout(); 
  }
  // =========================================================================
  // INITIALISATION DE L'INTERFACE UTILISATEUR
  // =========================================================================

  const sheetContextMenu = document.createElement('div');
  sheetContextMenu.id = 'sheet-context-menu';
  sheetContextMenu.style.cssText = "position:fixed; display:none; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); padding:4px 0; box-shadow:var(--panel-shadow); z-index:10000; font-size:12px; border-radius:var(--btn-radius);";
  document.body.appendChild(sheetContextMenu);

  window.addEventListener('click', () => { sheetContextMenu.style.display = 'none'; });

  ui = initUI(logoPT, logoNormal, logoPeigne, logoChrono);

  function loadSettings() {
      const saved = localStorage.getItem('cladistree_settings');
      if (saved) {
          try { appSettings = { ...appSettings, ...JSON.parse(saved) }; } 
          catch(e) {}
      }
      ui.setTheme.value = appSettings.theme;
      ui.setLang.value = appSettings.lang;
      ui.setCanvasBg.checked = appSettings.canvasBgLinked;
      if (ui.setAutoUpdate) ui.setAutoUpdate.checked = appSettings.autoUpdateCheck !== false;
      ui.setLayout.value = appSettings.defaultLayout;
      ui.setSmartTax.checked = appSettings.smartTaxonomy;
      ui.setAutoItalic.checked = appSettings.autoItalic !== undefined ? appSettings.autoItalic : true;
      ui.setZoomSens.value = appSettings.zoomSensitivity.toString();
      ui.setFicheColor.value = appSettings.ficheColor;
      ui.setPdfTimeline.checked = appSettings.pdfTimeline;
      ui.setIndicatorFiche.checked = !!appSettings.showFicheIndicator;
      ui.setCountInvalid.checked = appSettings.countInvalid !== undefined ? appSettings.countInvalid : false;
      
      applyTheme(appSettings.theme);
  }

  function updateAllUITexts() {
      // 1. Textes génériques de l'accueil
      const subtitle = document.querySelector('#welcome-overlay p');
      if (subtitle) subtitle.innerHTML = t('welcome.subtitle');
      
      const btnStart = document.getElementById('btn-start');
      if (btnStart) btnStart.innerHTML = t('welcome.new_project');
      
      const tip = document.querySelector('#welcome-overlay i');
      if (tip) tip.innerHTML = t('welcome.tip');
      
      const recentTitle = document.querySelector('#recent-files-container div');
      if (recentTitle) recentTitle.innerHTML = t('welcome.recent');

      // 2. Bouton Raccourcis (et sa modale si on voulait aller plus loin, 
      // mais on gère ici au moins le bouton principal)
      const btnShortcuts = document.getElementById('btn-shortcuts');
      if (btnShortcuts) btnShortcuts.innerHTML = t('btn.shortcuts');

      // 3. Titres du panneau latéral
      const labels = ui.sidePanel.querySelectorAll('label');
      if (labels.length >= 10) {
          labels[0].innerHTML = t('label.status') + ' :';
          labels[1].innerHTML = t('label.rank') + ' :';
          labels[2].innerHTML = t('label.date') + ' :';
          labels[3].innerHTML = t('label.author') + ' :';
          labels[4].innerHTML = t('label.dist') + ' :';
          labels[5].innerHTML = t('label.size') + ' :';
          labels[6].innerHTML = t('label.mass') + ' :';
          labels[7].innerHTML = t('label.period') + ' :';
          labels[8].innerHTML = t('label.synapo') + ' :';
          labels[9].innerHTML = t('label.notes') + ' :';
      }

      const btnExportFiche = document.getElementById('btn-export-fiche');
      if (btnExportFiche) btnExportFiche.innerHTML = t('sidepanel.export');

      const btnClosePanel = document.getElementById('btn-close-panel');
      if (btnClosePanel) btnClosePanel.innerHTML = t('btn.close');

      // 4. Champs de saisie (Placeholders)
      ui.formInputs.period.placeholder = t('placeholder.period');
      ui.formInputs.synapomorphies.placeholder = t('placeholder.synapo');
      ui.formInputs.imgCredits.placeholder = t('placeholder.img_credits');
      ui.searchInput.placeholder = t('search.placeholder');

      // 5. Boutons Image
      ui.btnUploadSheetImage.innerHTML = t('btn.upload_illus');
      ui.btnClearSheetImage.innerHTML = t('btn.delete_illus');

      // 6. Barres et Menus dynamiques
      updateSheetsBar();
      updateCounters();
      
      // Note : Les menus déroulants (Fichier, Affichage, Aide) et la fenêtre des paramètres 
      // pourraient aussi être traduits ici en ciblant leurs IDs ou classes.
  }

  function saveSettings() {
      appSettings.theme = ui.setTheme.value;
      appSettings.lang = ui.setLang.value;
      appSettings.canvasBgLinked = ui.setCanvasBg.checked;
      if (ui.setAutoUpdate) appSettings.autoUpdateCheck = ui.setAutoUpdate.checked;
      appSettings.defaultLayout = ui.setLayout.value as 'standard' | 'comb';
      appSettings.smartTaxonomy = ui.setSmartTax.checked;
      appSettings.autoItalic = ui.setAutoItalic.checked;
      appSettings.zoomSensitivity = parseInt(ui.setZoomSens.value) || 5;
      appSettings.ficheColor = ui.setFicheColor.value;
      appSettings.pdfTimeline = ui.setPdfTimeline.checked;
      appSettings.showFicheIndicator = ui.setIndicatorFiche.checked;
      appSettings.countInvalid = ui.setCountInvalid.checked;
      
      localStorage.setItem('cladistree_settings', JSON.stringify(appSettings));
  }


  // =====================================================================
  // VÉRIFICATION DES MISES À JOUR
  //
  // Interrogation de la dernière release publiée sur GitHub, comparaison
  // avec la version du package.json, puis simple notification. Rien n'est
  // téléchargé ni installé automatiquement : le bouton renvoie sur le site.
  //
  // Trois garde-fous :
  //  - au plus une vérification automatique par 24 h ;
  //  - un échec (hors ligne, quota, aucune release) reste silencieux ;
  //  - une version peut être ignorée définitivement.
  // =====================================================================
  const UPDATE_SITE_URL = 'https://mistytoonz.github.io/CladisTree/#';
  const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
  const LS_LAST_CHECK = 'cladistree_update_lastcheck';
  const LS_SKIPPED = 'cladistree_update_skipped';

  // Comparaison numérique champ à champ : une comparaison de chaînes
  // placerait « 1.9.0 » après « 1.10.0 », ce qui est faux.
  const compareVersions = (a: string, b: string): number => {
      const pa = String(a).split('.').map(x => parseInt(x, 10) || 0);
      const pb = String(b).split('.').map(x => parseInt(x, 10) || 0);
      const len = Math.max(pa.length, pb.length);
      for (let i = 0; i < len; i++) {
          const x = pa[i] || 0;
          const y = pb[i] || 0;
          if (x !== y) return x > y ? 1 : -1;
      }
      return 0;
  };

  const dismissUpdateToast = () => {
      document.getElementById('update-toast')?.remove();
  };

  const showUpdateToast = (latest: string) => {
      dismissUpdateToast();

      const box = document.createElement('div');
      box.id = 'update-toast';
      box.style.cssText = "position:fixed; right:18px; bottom:48px; z-index:9997; width:290px;"
          + " background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color);"
          + " border-left:4px solid #4CAF50; border-radius:var(--btn-radius);"
          + " box-shadow:0 8px 28px rgba(0,0,0,0.28); padding:14px 16px; font-size:12px;"
          + " font-family:var(--ui-font); opacity:0; transform:translateY(10px); transition:opacity .25s, transform .25s;";

      box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
          <strong style="font-size:13px;">${t('update.available')}</strong>
          <span id="update-toast-close" title="${t('btn.close')}" style="cursor:pointer; opacity:.55; line-height:1; font-size:15px;">&#10005;</span>
        </div>
        <div style="margin-top:9px; opacity:.85; line-height:1.55;">
          ${t('update.current')} : <b>${APP_VERSION || '?'}</b><br>
          ${t('update.latest')} : <b style="color:#4CAF50;">${latest}</b>
        </div>
        <div style="display:flex; gap:7px; margin-top:13px;">
          <button id="update-toast-go" style="flex:1; padding:6px 9px; cursor:pointer; background:#4CAF50; color:#fff; border:none; border-radius:var(--btn-radius); font-weight:bold; font-size:12px;">${t('update.download')}</button>
          <button id="update-toast-skip" style="padding:6px 9px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px;">${t('update.skip')}</button>
        </div>`;

      document.body.appendChild(box);
      requestAnimationFrame(() => { box.style.opacity = '1'; box.style.transform = 'none'; });

      document.getElementById('update-toast-close')?.addEventListener('click', dismissUpdateToast);
      document.getElementById('update-toast-go')?.addEventListener('click', async () => {
          await window.electronAPI.openExternal(UPDATE_SITE_URL);
          dismissUpdateToast();
      });
      document.getElementById('update-toast-skip')?.addEventListener('click', () => {
          try { localStorage.setItem(LS_SKIPPED, latest); } catch (e) {}
          dismissUpdateToast();
      });
  };

  // manual = déclenché depuis le menu Aide : on répond toujours quelque chose,
  // y compris « à jour » ou « échec ». En automatique, on ne parle que s'il y a
  // effectivement une nouvelle version.
  const runUpdateCheck = async (manual: boolean) => {
      if (!window.electronAPI?.checkForUpdate) return;

      if (!manual) {
          try {
              const last = parseInt(localStorage.getItem(LS_LAST_CHECK) || '0', 10);
              if (last && Date.now() - last < UPDATE_CHECK_INTERVAL) return;
          } catch (e) {}
      }

      const res = await window.electronAPI.checkForUpdate();

      // L'horodatage n'est écrit qu'en cas de succès : après une coupure
      // réseau, la vérification est retentée au prochain démarrage.
      if (res && res.success) {
          try { localStorage.setItem(LS_LAST_CHECK, String(Date.now())); } catch (e) {}
      }

      if (!res || !res.success || !res.version) {
          // 404 = aucune release publiée sur le dépôt. Ce n'est pas une panne :
          // il n'existe simplement rien de plus récent.
          if (manual) alert(res && res.status === 404 ? t('update.uptodate') : t('update.failed'));
          return;
      }

      const isNewer = APP_VERSION ? compareVersions(res.version, APP_VERSION) > 0 : false;
      if (!isNewer) {
          if (manual) alert(t('update.uptodate'));
          return;
      }

      if (!manual) {
          try {
              if (localStorage.getItem(LS_SKIPPED) === res.version) return;
          } catch (e) {}
      }
      showUpdateToast(res.version);
  };

  ui.btnCheckUpdate?.addEventListener('click', () => { runUpdateCheck(true); });

  // Au démarrage : différé, pour ne pas concurrencer le chargement de l'arbre.
  if (appSettings.autoUpdateCheck !== false) {
      setTimeout(() => { runUpdateCheck(false).catch(() => {}); }, 6000);
  }

  ui.btnSettings.onclick = () => {
      loadSettings(); 
      ui.settingsModal.style.display = 'flex';
  };
  ui.btnCloseSettings.onclick = () => {
      ui.settingsModal.style.display = 'none';
  };

  const saveAndApplyTheme = () => {
      saveSettings();
      applyTheme(appSettings.theme);
  };

  ui.setTheme.onchange = saveAndApplyTheme;
  ui.setCanvasBg.onchange = saveAndApplyTheme;
  ui.setLayout.onchange = saveSettings;
  ui.setSmartTax.onchange = saveSettings;
  ui.setAutoItalic.onchange = saveSettings;
  ui.setZoomSens.onchange = saveSettings;
  ui.setFicheColor.onchange = saveSettings;
  ui.setPdfTimeline.onchange = saveSettings;
  ui.setIndicatorFiche.onchange = () => { saveSettings(); refreshLayout(); };
  ui.setCountInvalid.onchange = () => { saveSettings(); updateCounters(); };

  ui.setLang.onchange = () => {
      if (hasUnsavedChanges) {
          if (!confirm(t('confirm.reload'))) {
              ui.setLang.value = currentLang;
              return;
          }
      }
      saveSettings();
      setLang(ui.setLang.value as Lang);
      location.reload();
  };

  ui.btnClearHistory.onclick = () => {
      if(confirm(t('confirm.clear_history'))) {
          localStorage.removeItem('cladistree_recents');
          loadRecentFilesUI();
          ui.settingsModal.style.display = 'none';
      }
  };

  ui.btnResetSettings.onclick = () => {
      if(confirm(t('confirm.reset_settings'))) {
          localStorage.removeItem('cladistree_settings');
          appSettings = {
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
              autoUpdateCheck: true
          };
          loadSettings();
      }
  };
  
  ui.btnClosePanel.addEventListener('click', closeSidePanel); 
  ui.btnCloseCross.addEventListener('click', closeSidePanel);
  ui.btnNew.onclick = createNewTree;
  ui.btnNewWindow.onclick = () => window.electronAPI.openNewInstance();
  ui.btnLoad.onclick = async () => {
      if (window.electronAPI && window.electronAPI.openFile) {
          const result = await window.electronAPI.openFile(); // Ouvre l'explorateur Windows/Mac
          if (result.success && result.data && result.fileName) {
              // On court-circuite le navigateur et on donne la mémoire brute + le chemin absolu au moteur
              await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
              if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
          }
      } else {
          ui.fileInput.click(); // Sécurité si exécuté sur un vrai navigateur web
      }
  };

  const btnShortcuts = document.getElementById('btn-shortcuts');

  const shortcutsOverlay = document.createElement('div');
  shortcutsOverlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:none; justify-content:center; align-items:center; z-index:9998; backdrop-filter:blur(4px);";
  
  shortcutsOverlay.innerHTML = `
    <div style="background:var(--bg-topbar); color:var(--text-topbar); padding:30px 40px; border-radius:8px; max-width:650px; max-height:85vh; overflow-y:auto; border:1px solid var(--border-color); box-shadow:0 10px 40px rgba(0,0,0,0.5); font-size:13px; line-height:1.6;">
       <h2 style="margin-top:0; color:#2196F3; border-bottom:2px solid var(--border-color); padding-bottom:10px;">${t('sc.title')}</h2>
       
       <div style="display:flex; gap:20px; text-align:left;">
           <div style="flex:1;">
               <h3 style="color:#FF9800; margin-bottom:5px;">${t('sc.nav')}</h3>
               <ul style="margin-top:0; padding-left:20px; list-style-type:none; margin-left:-20px;">
                   <li>${t('sc.nav.arrows')}</li>
                   <li>${t('sc.nav.alt')}</li>
                   <li>${t('sc.nav.drag')}</li>
                   <li>${t('sc.nav.zoom')}</li>
                   <li>${t('sc.nav.search')}</li>
                   <li>${t('sc.nav.full')}</li>
               </ul>
               
               <h3 style="color:#4CAF50; margin-bottom:5px;">${t('sc.actions')}</h3>
               <ul style="margin-top:0; padding-left:20px; list-style-type:none; margin-left:-20px;">
                   <li>${t('sc.act.copy')}</li>
                   <li>${t('sc.act.cut')}</li>
                   <li>${t('sc.act.paste')}</li>
                   <li>${t('sc.act.undo')}</li>
                   <li>${t('sc.act.redo')}</li>
                   <li>${t('sc.act.save')}</li>
               </ul>
           </div>
           
           <div style="flex:1;">
               <h3 style="color:#2196F3; margin-bottom:5px;">${t('sc.edit')}</h3>
               <ul style="margin-top:0; padding-left:20px; list-style-type:none; margin-left:-20px;">
                   <li>${t('sc.edit.enter')}</li>
                   <li>${t('sc.edit.tab')}</li>
                   <li>${t('sc.edit.c_enter')}</li>
                   <li>${t('sc.edit.c_space')}</li>
                   <li>${t('sc.edit.space')}</li>
                   <li>${t('sc.edit.del')}</li>
                   <li>${t('sc.edit.all')}</li>
               </ul>

               <h3 style="color:#9C27B0; margin-bottom:5px;">${t('sc.style')}</h3>
               <ul style="margin-top:0; padding-left:20px; list-style-type:none; margin-left:-20px;">
                   <li>${t('sc.style.bold')}</li>
                   <li>${t('sc.style.italic')}</li>
                   <li>${t('sc.style.extinct')}</li>
               </ul>
           </div>
       </div>

       <div style="text-align:center; margin-top:25px; border-top:1px solid var(--border-color); padding-top:15px;">
          <button id="btn-close-shortcuts" style="padding:8px 25px; font-size:13px; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); cursor:pointer; font-weight:bold; box-shadow:var(--panel-shadow);">${t('btn.close')}</button>
       </div>
    </div>
  `;
  document.body.appendChild(shortcutsOverlay);

  if (btnShortcuts) {
      btnShortcuts.onclick = () => shortcutsOverlay.style.display = 'flex';
  }  const btnCloseShortcuts = document.getElementById('btn-close-shortcuts');
  if (btnCloseShortcuts) btnCloseShortcuts.onclick = () => shortcutsOverlay.style.display = 'none';

  const btnPatch = document.getElementById('btn-patch');

  const patchOverlay = document.createElement('div');
  patchOverlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:none; justify-content:center; align-items:center; z-index:9998; backdrop-filter:blur(4px);";
  
  patchOverlay.innerHTML = `
    <div style="background:var(--bg-topbar); color:var(--text-topbar); padding:30px 40px; border-radius:8px; max-width:750px; max-height:85vh; overflow-y:auto; border:1px solid var(--border-color); box-shadow:0 10px 40px rgba(0,0,0,0.5); font-size:13px; line-height:1.5;">
       <h2 style="margin-top:0; color:#2196F3; border-bottom:2px solid var(--border-color); padding-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
           <span>${t('patch.title')}</span>
           <span style="font-size:14px; background:#4CAF50; color:white; padding:4px 8px; border-radius:4px;">${t('patch.version')} ${APP_VERSION}</span>
       </h2>

       <h3 style="color:#FF9800; margin-bottom:5px;">${t('patch.cat1.title')}</h3>
       <ul style="margin-top:0; padding-left:20px;">
           ${t('patch.cat1.list')}
       </ul>

       <h3 style="color:#9C27B0; margin-bottom:5px;">${t('patch.cat2.title')}</h3>
       <ul style="margin-top:0; padding-left:20px;">
           ${t('patch.cat2.list')}
       </ul>

       <h3 style="color:#2196F3; margin-bottom:5px;">${t('patch.cat3.title')}</h3>
       <ul style="margin-top:0; padding-left:20px;">
           ${t('patch.cat3.list')}
       </ul>

       <h3 style="color:#4CAF50; margin-bottom:5px;">${t('patch.cat4.title')}</h3>
       <ul style="margin-top:0; padding-left:20px;">
           ${t('patch.cat4.list')}
       </ul>

       <h3 style="color:#E53935; margin-bottom:5px;">${t('patch.cat5.title')}</h3>
       <ul style="margin-top:0; padding-left:20px;">
           ${t('patch.cat5.list')}
       </ul>

       <div style="text-align:center; margin-top:25px; border-top:1px solid var(--border-color); padding-top:15px;">
          <button id="btn-close-patch" style="padding:8px 25px; font-size:13px; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); cursor:pointer; font-weight:bold; box-shadow:var(--panel-shadow);">${t('btn.close')}</button>
       </div>
    </div>
  `;
  document.body.appendChild(patchOverlay);

  if (btnPatch) {
      btnPatch.onclick = () => patchOverlay.style.display = 'flex';
  }
  const btnClosePatch = document.getElementById('btn-close-patch');
  if (btnClosePatch) btnClosePatch.onclick = () => patchOverlay.style.display = 'none';

  loadRecentFilesUI();

  if (ui.btnStart && ui.welcomeOverlay) {
      ui.btnStart.onclick = () => {
          ui.welcomeOverlay.style.display = 'none';
      };
    }
  if (ui.btnCredits && ui.creditsOverlay && ui.btnCloseCredits) {
      ui.btnCredits.onclick = () => {
          ui.creditsOverlay.style.display = 'flex';
      };
      ui.btnCloseCredits.onclick = () => {
          ui.creditsOverlay.style.display = 'none';
      };
  }
  
  // Helper pour formater facilement un nom d'espèce
  // Helper pour formater facilement un nom d'espèce (Ne modifie jamais les données sources)
  function formatSpeciesName(rawSpeciesName: string, rawGenusName: string, format: 'full' | 'abbrev'): string {
      if (!rawSpeciesName || rawSpeciesName.trim() === '') return '';
      
      let gNameClean = rawGenusName.replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim();
      let gFirstWord = gNameClean.split(/\s+/)[0] || '';
      
      if (!gFirstWord) return rawSpeciesName; // Sécurité si le genre est vide

      // Extraction des préfixes (ex: † ") et suffixes (ex: ")
      let prefixMatch = rawSpeciesName.match(/^[†+”"«“'’\s]+/);
      let prefix = prefixMatch ? prefixMatch[0] : '';
      let sClean = rawSpeciesName.substring(prefix.length).trim();
      
      let suffixMatch = sClean.match(/[”"»”'’\s]+$/);
      let suffix = suffixMatch ? suffixMatch[0] : '';
      if (suffix) sClean = sClean.substring(0, sClean.length - suffix.length);

      let epithet = sClean.trim();
      
      // Nettoyage de l'épithète : on retire le genre complet s'il était tapé
      if (epithet.toLowerCase().startsWith(gFirstWord.toLowerCase() + ' ')) {
          epithet = epithet.substring(gFirstWord.length + 1).trim();
      } 
      // Nettoyage de l'épithète : on retire l'abréviation si elle était tapée (ex: "T.rex", "T?. rex")
      else {
          epithet = epithet.replace(/^[a-z][.?]+\s*/i, '').trim();
      }

      // Application du format demandé
      if (format === 'abbrev') {
          return prefix + gFirstWord.charAt(0).toUpperCase() + '. ' + epithet + suffix;
      } else {
          return prefix + gFirstWord.charAt(0).toUpperCase() + gFirstWord.slice(1).toLowerCase() + ' ' + epithet + suffix;
      }
  }

  function getDynamicNodeName(node: any, forceFormat?: 'full' | 'abbrev'): string {
      if (!node) return '';
      const rawName = node.data('name');
      if (!rawName || rawName.trim() === '') return '';
      
      const rank = node.data('rank');
      const formatToUse = forceFormat || appSettings.speciesFormat;
      
      // En mode "Noms complets", le Genre s'effface : c'est l'espece descendante
      // qui affiche le binome complet ("Tyrannosaurus rex").
      // MAIS un genre SANS descendance n'a personne pour porter son nom : il
      // devenait un tiret anonyme. On ne l'efface donc que s'il a des enfants.
      if (formatToUse === 'full' && rank === 'Genre') {
          const hasChildren = node.outgoers && node.outgoers('node').length > 0;
          if (hasChildren) return '';
      }
      
      // Formatage pour les Espèces et Sous-espèces
      if (rank === 'Espèce' || rank === 'Sous-espèce') {
          let parentGenusNode = null;
          
          if (node.incomers) {
              let curr = node.incomers('node').first();
              while(curr && curr.length > 0 && !curr.hasClass('box')) {
                   if (curr.data('rank') === 'Genre') { parentGenusNode = curr; break; }
                   curr = curr.incomers('node').first();
              }
          }
          
          if (parentGenusNode) {
              return formatSpeciesName(rawName, parentGenusNode.data('name') || '', formatToUse);
          }
      }
      
      return rawName;
  }

  // OPTIM 2 - constante au lieu d'une reconstruction + encodeURIComponent par
  // noeud et par refresh.
  const TEXT_ABOVE_BAR_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2"><rect x="0" y="0" width="100" height="2" fill="black"/></svg>');

  const cy = cytoscape({
    container: container, 
    autoungrabify: false, 
    userZoomingEnabled: false, 
    userPanningEnabled: false, 
    boxSelectionEnabled: false,
    desktopTapThreshold: 20, 
    touchTapThreshold: 30,   
    pixelRatio: 'auto', 
    textureOnViewport: true, 
    motionBlur: true, 
    elements: [
      { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'root', name: t('default.root'), extinct: false, isBold: true, isItalic: false, sortIndex: 0, period: "" } }, 
      { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'n1', name: 'Clade A', extinct: false, isBold: false, isItalic: false, sortIndex: 0, period: "" } },
      { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'l1', name: 'Taxon 1', extinct: false, isBold: false, isItalic: true, rank: "Espèce", sortIndex: 0, period: "" } },
      { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'l2', name: 'Taxon 2', extinct: false, isBold: false, isItalic: true, rank: "Espèce", sortIndex: 1, period: "" } },
      { group: 'edges', data: { source: 'root', target: 'n1' } }, { group: 'edges', data: { source: 'n1', target: 'l1' } }, { group: 'edges', data: { source: 'n1', target: 'l2' } }
    ],
    style: [
      { 
        selector: '.taxon', 
        style: { 
          'z-index': 10,
          'z-index-compare': 'manual',
          'shape': 'rectangle',
          'text-valign': 'center', 
          'text-halign': 'center', 
          'active-bg-opacity': 0, 
          'active-bg-size': 0,
          'overlay-opacity': 0,
          'text-wrap': 'wrap',
          'line-height': 1.2,
          // OPTIM 2 - textMarginY contient DEJA le decalage du "texte au-dessus"
          // (calcule dans la boucle de mesure). L'ancien mapper y rajoutait un
          // baseOffset, ce qui doublait l'offset ; le style inline masquait le
          // probleme en ecrasant le mapper. Lecture simple, resultat identique.
          'text-margin-y': (n: any) => n.data('textMarginY') || 0,
          
          'label': (node: any) => { 
              // OPTIM 3 - getDynamicNodeName remonte la chaine d'ancetres avec
              // incomers('node').first(), donc alloue une Collection par cran.
              // Or un mapper est reevalue a chaque invalidation de style, pas une
              // fois par refresh. Le nom est desormais memorise par la boucle de
              // mesure ; le fallback ne sert qu'aux noeuds hors passe (ghost).
              const cached = node.data('displayName');
              const dynamicName = cached !== undefined ? cached : getDynamicNodeName(node); 
              if (dynamicName === '') return ''; 
              
              let labelText = node.data('extinct') && !dynamicName.startsWith('\u2020') ? '\u2020 ' + dynamicName : dynamicName; 
              if (node.data('collapsed')) labelText += ' [+]';
              if (node.data('linkedFileName')) {
                  labelText += ' \u2197'; 
              } 
              if (node.data('hasNewSheet') && node.id() !== currentRootId) labelText += ' \u2794';
              
              // --- INDICATEUR DE FICHE REMPLIE ---
              // OPTIM 3 - les dix tests de champs sont faits une fois par refresh
              // et memorises dans hasSheetContent, au lieu d'etre refaits a chaque
              // dessin de l'etiquette.
              if (appSettings.showFicheIndicator) {
                  const cachedFlag = node.data('hasSheetContent');
                  let hasUserContent: boolean;
                  if (cachedFlag !== undefined) {
                      hasUserContent = cachedFlag;
                  } else {
                      const d = node.data();
                      hasUserContent = !!(
                          (d.discoveryDate && d.discoveryDate.trim() !== '') ||
                          (d.author && d.author.trim() !== '') ||
                          (d.distribution && d.distribution.trim() !== '') ||
                          (d.size && d.size.trim() !== '') ||
                          (d.mass && d.mass.trim() !== '') ||
                          (d.period && d.period.trim() !== '') ||
                          (d.synapomorphies && d.synapomorphies.trim() !== '') ||
                          (d.notes && d.notes.trim() !== '') ||
                          (d.iucn && d.iucn.trim() !== '') ||
                          (d.sheetImage && d.sheetImage.trim() !== ''));
                  }

                  if (hasUserContent) {
                      labelText += ' 🗏';
                  }
              }
              
              return labelText; 
          },
          'color': '#000000', 'text-outline-width': 0,
          'background-image-crossorigin': 'anonymous', 'background-fit': 'contain', 'background-clip': 'none',
          
          'border-width': (node: any) => node.data('hasFrame') ? 2 : 0,
          'border-color': (node: any) => node.data('frameColor') || '#000000',
          'background-color': (node: any) => node.data('hasFrame') ? (node.data('frameColor') || '#000000') : '#ffffff',
          'background-opacity': (node: any) => node.data('hasFrame') ? 0.05 : 0.001,
          
          'width': (node: any) => node.data('renderWidth') || 0.1,
          'height': (node: any) => node.data('renderHeight') || 0.1,
          'font-family': (node: any) => node.data('fontFamily') || 'serif',
          'font-size': (node: any) => node.data('fontSize') || 16,
          'font-weight': (node: any) => node.data('fontWeight') || 'normal',
          'font-style': (node: any) => node.data('fontStyle') || 'normal',
          // OPTIM 4 - bgUrl dupliquait l'image base64 deja presente dans imgUrl.
          // ele.json() fait une copie PROFONDE des donnees, donc chaque snapshot
          // d'annulation recopiait deux fois toutes les images du document, quinze
          // fois dans la pile. Le mapper recompose la liste a la volee, avec
          // exactement les memes conditions que la boucle de mesure.
          'background-image': (node: any) => {
              const img = node.data('imgUrl');
              const parts: string[] = [];
              if (img && img.trim() !== '') parts.push(img);
              if (node.data('textAbove') && !node.data('isEmpty')) parts.push(TEXT_ABOVE_BAR_SVG);
              return parts.length > 0 ? parts.join(', ') : 'none';
          },
          'background-width': (node: any) => node.data('bgWidth') || '0px',
          'background-height': (node: any) => node.data('bgHeight') || '0px',
          'background-position-x': (node: any) => node.data('bgPosX') || '50%',
          'background-position-y': (node: any) => node.data('bgPosY') || '50%',
          'text-margin-x': (node: any) => node.data('textMarginX') || 0
        } 
      },
      {
        selector: '.box',
        style: {
          'z-index': 0,
          'z-index-compare': 'manual',
          'shape': (n: any) => n.data('boxShape') || 'round-rectangle',
          'background-opacity': (n: any) => n.data('boxOpacity') !== undefined ? n.data('boxOpacity') : 0.1,
          'background-color': (n: any) => n.data('boxColor') || '#FF9800',
          'border-width': (n: any) => n.data('boxBorderWidth') !== undefined ? n.data('boxBorderWidth') : 2,
          'border-style': (n: any) => n.data('boxBorderStyle') || 'dashed',
          'border-color': (n: any) => n.data('boxColor') || '#FF9800',
          
          'text-valign': 'center',
          'text-halign': 'center',
          
          'text-outline-width': 2, 
          'text-outline-color': '#ffffff', 
          'color': (n: any) => n.data('boxColor') || '#FF9800',
          'label': 'data(name)', 
          'text-wrap': 'wrap',
          'line-height': 1.2,
          'font-weight': 'bold',
          'font-family': (n: any) => n.data('fontFamily') || 'serif',
          'font-size': (n: any) => n.data('fontSize') || 14,
          'font-style': (n: any) => n.data('isItalic') ? 'italic' : 'normal'
        }
      },
      {
          selector: 'node[!name], node[name = ""]',
          style: {
              'background-opacity': 0, 
              'border-opacity': 0, 
              'border-width': '0px',
              'padding': '0px',
              'width': '0.1px',
              'height': '0.1px'
          }
      },
      {
          selector: 'node[!name]:selected, node[name = ""]:selected',
          style: {
              'background-color': '#2196F3',
              'background-opacity': 0.5,
              'border-width': '2px',
              'border-style': 'dashed',
              'border-color': '#2196F3',
              'border-opacity': 1, 
              'width': '18px',
              'height': '18px',
          }
      },
      { selector: 'node:selected', style: { 'background-color': '#2196F3', 'background-opacity': 0.3 } },
      {
          selector: 'edge',
          style: {
              'z-index': 5,
              'z-index-compare': 'manual',
              'width': 2, 
              'line-color': '#000000', 
              'curve-style': 'taxi', 
              'taxi-direction': 'rightward',
              'taxi-turn': '20px',
              'target-arrow-shape': 'none',
              
              'source-endpoint': (edge: any) => edge.source().data('textAbove') ? 'inside-to-node' : 'outside-to-node',
              'target-endpoint': (edge: any) => {
                  const target = edge.target();
                  return (target.data('isEmpty') || target.data('textAbove')) ? 'inside-to-node' : 'outside-to-node';
              }
          }
      },
      {
          selector: 'node[imgUrl != ""]', 
          style: {
              'text-valign': 'center',
              'text-halign': 'center',
              'background-fit': 'none', 
              'padding': '5px' 
          }
      }
    ],
  });

  function checkAutoRank(node: any) {
    if (!appSettings.smartTaxonomy) return;

    let name = node.data('name') || '';
    let cleanName = name.replace(/^[†+]\s*/, '').replace(/^["'«“]\s*/, '').replace(/\s*["'»”]$/, '').trim(); 
    
    // Ignore les noms génériques pour ne pas les classer en Espèce
    if (cleanName.toLowerCase().includes('clade') || cleanName.toLowerCase().includes('taxon') || cleanName.toLowerCase().includes('groupe')) return;

    let currentRank = node.data('rank');

    // Détection Sous-espèce (3 mots)
    if (/^[A-Z][\w.\?]*\s+[\w.\?]+\s+[\w.\?]+/.test(cleanName)) {
      if (currentRank === 'Clade (non-classé)') { 
          currentRank = 'Sous-espèce'; 
          node.data('rank', currentRank); 
      }
    }
    // Détection Espèce (2 mots ou abréviation)
    else if (/^[A-Z][.?]+\s*\S+/.test(cleanName) || /^[A-Z][a-z]+\s+[a-z]+/.test(cleanName)) {
      if (currentRank === 'Clade (non-classé)') { 
          currentRank = 'Espèce'; 
          node.data('rank', currentRank); 
      }
      
      // On isole la première lettre de l'espèce (ex: "C" pour Carnotaurus ou C. sastrei)
      let genusHint = cleanName.split(/\s+/)[0];
      let genusInitial = genusHint.charAt(0).toUpperCase();

      let curr = node.incomers('node').first();
      while (curr && curr.length > 0 && !curr.hasClass('box')) {
        const pRank = curr.data('rank');
        const pName = curr.data('name');
        
        if (pRank === 'Genre') break; 
        
        if (pRank === 'Clade (non-classé)' && pName && pName.trim() !== '' && pName !== t('default.unnamed_branch')) {
          const pClean = pName.replace(/^[†+]\s*/, '').replace(/^["'«“]\s*/, '').replace(/\s*["'»”]$/, '').trim();
          
          // SÉCURITÉ : On ne transforme le parent en Genre QUE s'il commence par la bonne lettre !
          if (pClean.toUpperCase().startsWith(genusInitial)) {
              curr.data('rank', 'Genre');
              if (appSettings.autoItalic) curr.data('isItalic', true);
          }
          break; // Quoi qu'il arrive, on s'arrête au premier vrai parent nommé pour ne pas tout dérégler
        }
        curr = curr.incomers('node').first();
      }
    }

    if (appSettings.autoItalic) {
        if (currentRank === 'Espèce' || currentRank === 'Sous-espèce' || currentRank === 'Genre') {
            node.data('isItalic', true);
        }
    }
  }

  // --- MOTEUR DE DÉGRADÉ DE COULEURS ---
  function adjustColorLightness(hex: string, percent: number): string {
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

  // --- DICTIONNAIRE STRATIGRAPHIQUE (CONNECTÉ AUX TRADUCTIONS) ---
  const GEO_DETAILS = [
    { start: 2.58, end: 0, color: "#F9F97F", subs: [{k:"geo.holocene", s:0.0117, e:0}, {k:"geo.tarantian", s:0.129, e:0.0117}, {k:"geo.chibanian", s:0.774, e:0.129}, {k:"geo.calabrian", s:1.80, e:0.774}, {k:"geo.gelasian", s:2.58, e:1.80}] },
    { start: 23.03, end: 2.58, color: "#FFE619", subs: [{k:"geo.piacenzian", s:3.6, e:2.58}, {k:"geo.zanclean", s:5.33, e:3.6}, {k:"geo.messinian", s:7.25, e:5.33}, {k:"geo.tortonian", s:11.63, e:7.25}, {k:"geo.serravallian", s:13.82, e:11.63}, {k:"geo.langhian", s:15.97, e:13.82}, {k:"geo.burdigalian", s:20.44, e:15.97}, {k:"geo.aquitanian", s:23.03, e:20.44}] },
    { start: 66.0, end: 23.03, color: "#FD9A52", subs: [{k:"geo.chattian", s:27.82, e:23.03}, {k:"geo.rupelian", s:33.9, e:27.82}, {k:"geo.priabonian", s:37.8, e:33.9}, {k:"geo.bartonian", s:41.2, e:37.8}, {k:"geo.lutetian", s:47.8, e:41.2}, {k:"geo.ypresian", s:56.0, e:47.8}, {k:"geo.thanetian", s:59.2, e:56.0}, {k:"geo.selandian", s:61.6, e:59.2}, {k:"geo.danian", s:66.0, e:61.6}] },
    { start: 145.0, end: 66.0, color: "#7FC64E", subs: [{k:"geo.maastrichtian", s:72.1, e:66.0}, {k:"geo.campanian", s:83.6, e:72.1}, {k:"geo.santonian", s:86.3, e:83.6}, {k:"geo.coniacian", s:89.8, e:86.3}, {k:"geo.turonian", s:93.9, e:89.8}, {k:"geo.cenomanian", s:100.5, e:93.9}, {k:"geo.albian", s:113.0, e:100.5}, {k:"geo.aptian", s:121.4, e:113.0}, {k:"geo.barremian", s:125.77, e:121.4}, {k:"geo.hauterivian", s:132.6, e:125.77}, {k:"geo.valanginian", s:139.8, e:132.6}, {k:"geo.berriasian", s:145.0, e:139.8}] },
    { start: 201.3, end: 145.0, color: "#34B2C9", subs: [{k:"geo.tithonian", s:152.1, e:145.0}, {k:"geo.kimmeridgian", s:157.3, e:152.1}, {k:"geo.oxfordian", s:163.5, e:157.3}, {k:"geo.callovian", s:166.1, e:163.5}, {k:"geo.bathonian", s:168.3, e:166.1}, {k:"geo.bajocian", s:170.3, e:168.3}, {k:"geo.aalenian", s:174.1, e:170.3}, {k:"geo.toarcian", s:182.7, e:174.1}, {k:"geo.pliensbachian", s:190.8, e:182.7}, {k:"geo.sinemurian", s:199.3, e:190.8}, {k:"geo.hettangian", s:201.3, e:199.3}] },
    { start: 251.9, end: 201.3, color: "#812B92", subs: [{k:"geo.rhaetian", s:208.5, e:201.3}, {k:"geo.norian", s:227.0, e:208.5}, {k:"geo.carnian", s:237.0, e:227.0}, {k:"geo.ladinian", s:242.0, e:237.0}, {k:"geo.anisian", s:247.2, e:242.0}, {k:"geo.olenekian", s:251.2, e:247.2}, {k:"geo.induan", s:251.9, e:251.2}] },
    { start: 298.9, end: 251.9, color: "#F04028", subs: [{k:"geo.changhsingian", s:254.1, e:251.9}, {k:"geo.wuchiapingian", s:259.1, e:254.1}, {k:"geo.capitanian", s:265.1, e:259.1}, {k:"geo.wordian", s:268.8, e:265.1}, {k:"geo.roadian", s:272.9, e:268.8}, {k:"geo.kungurian", s:283.5, e:272.9}, {k:"geo.artinskian", s:290.1, e:283.5}, {k:"geo.sakmarian", s:293.5, e:290.1}, {k:"geo.asselian", s:298.9, e:293.5}] },
    { start: 358.9, end: 298.9, color: "#67A599", subs: [{k:"geo.gzhelian", s:303.7, e:298.9}, {k:"geo.kasimovian", s:307.0, e:303.7}, {k:"geo.moscovian", s:315.2, e:307.0}, {k:"geo.bashkirian", s:323.2, e:315.2}, {k:"geo.serpukhovian", s:330.9, e:323.2}, {k:"geo.visean", s:346.7, e:330.9}, {k:"geo.tournaisian", s:358.9, e:346.7}] },
    { start: 419.2, end: 358.9, color: "#CB8C37", subs: [{k:"geo.famennian", s:372.2, e:358.9}, {k:"geo.frasnian", s:382.7, e:372.2}, {k:"geo.givetian", s:387.7, e:382.7}, {k:"geo.eifelian", s:393.3, e:387.7}, {k:"geo.emsian", s:407.6, e:393.3}, {k:"geo.pragian", s:410.8, e:407.6}, {k:"geo.lochkovian", s:419.2, e:410.8}] },
    { start: 443.8, end: 419.2, color: "#B3E1B6", subs: [{k:"geo.pridoli", s:423.0, e:419.2}, {k:"geo.ludfordian", s:425.6, e:423.0}, {k:"geo.gorstian", s:427.4, e:425.6}, {k:"geo.homerian", s:430.5, e:427.4}, {k:"geo.sheinwoodian", s:433.4, e:430.5}, {k:"geo.telychian", s:438.5, e:433.4}, {k:"geo.aeronian", s:440.8, e:438.5}, {k:"geo.rhuddanian", s:443.8, e:440.8}] },
    { start: 485.4, end: 443.8, color: "#009270", subs: [{k:"geo.hirnantian", s:445.2, e:443.8}, {k:"geo.katian", s:453.0, e:445.2}, {k:"geo.sandbian", s:458.4, e:453.0}, {k:"geo.darriwilian", s:467.3, e:458.4}, {k:"geo.dapingian", s:470.0, e:467.3}, {k:"geo.floian", s:477.7, e:470.0}, {k:"geo.tremadocian", s:485.4, e:477.7}] },
    { start: 538.8, end: 485.4, color: "#99C68E", subs: [{k:"geo.stage10", s:489.5, e:485.4}, {k:"geo.jiangshanian", s:494.0, e:489.5}, {k:"geo.paibian", s:497.0, e:494.0}, {k:"geo.guzhangian", s:500.5, e:497.0}, {k:"geo.drumian", s:504.5, e:500.5}, {k:"geo.wuliuan", s:509.0, e:504.5}, {k:"geo.stage4", s:514.0, e:509.0}, {k:"geo.stage3", s:521.0, e:514.0}, {k:"geo.stage2", s:529.0, e:521.0}, {k:"geo.fortunian", s:538.8, e:529.0}] }
  ];

  function updateTimeline(val: string) {
    const parseMa = (s: string) => parseFloat(s.replace(',', '.'));  
    let start: number | null = null;  
    let end: number | null = null;
    
    const rangeMatch = val.match(/([\d.,]+)\s*-\s*([\d.,]+)/);  
    if (rangeMatch) {  
        start = parseMa(rangeMatch[1]);  
        end = parseMa(rangeMatch[2]);  
    } else {  
        const singleMatch = val.match(/([\d.,]+)/);  
        if (singleMatch) {  
            start = parseMa(singleMatch[1]);  
            end = start;  
        }  
    }
    
    const layerNormal = document.getElementById('timeline-layer-normal');
    const layerDeep = document.getElementById('timeline-layer-deep');
    
    // --- RÉINITIALISATION ---
    ui.timelineIndicator.style.display = 'none';
    if(ui.timelineZoomContainer) ui.timelineZoomContainer.style.display = 'none';
    if(ui.timelineZoomIndicator) ui.timelineZoomIndicator.style.display = 'none';

    if (start !== null && end !== null && !isNaN(start) && !isNaN(end)) {  
        if (start < end) { const temp = start; start = end; end = temp; }  
        
        const isDeepPrecambrian = start > 541 || end > 541;
        ui.timelineIndicator.style.display = 'block';  
        
        // --- 1. AFFICHAGE FRISE GLOBALE ---
        if (isDeepPrecambrian) {
            if (layerNormal) layerNormal.style.display = 'none';
            if (layerDeep) layerDeep.style.display = 'block';
            
            const displayStart = Math.min(4500, Math.max(0, start));  
            const displayEnd = Math.min(4500, Math.max(0, end));  
            const leftPct = ((4500 - displayStart) / 4500) * 100;  
            const widthPct = start === end ? 0 : ((displayStart - displayEnd) / 4500) * 100;  
            
            ui.timelineIndicator.style.left = leftPct + '%';  
            ui.timelineIndicator.style.width = start === end ? '2px' : widthPct + '%';  
        } else {
            if (layerNormal) layerNormal.style.display = 'block';
            if (layerDeep) layerDeep.style.display = 'none';
            
            const displayStart = Math.min(600, Math.max(0, start));  
            const displayEnd = Math.min(600, Math.max(0, end));  
            const leftPct = ((600 - displayStart) / 600) * 100;  
            const widthPct = start === end ? 0 : ((displayStart - displayEnd) / 600) * 100;  
            
            ui.timelineIndicator.style.left = leftPct + '%';  
            ui.timelineIndicator.style.width = start === end ? '2px' : widthPct + '%';  
        }

        // --- 2. LOGIQUE DU ZOOM STRATIGRAPHIQUE (DÉGRADÉS INCLUS) ---
        if (ui.timelineZoomContainer && ui.timelineZoomContent && ui.timelineZoomIndicator) {
            const intersectingPeriods = GEO_DETAILS.filter(p => (start! > p.end && end! < p.start));
            
            // On affiche le zoom si l'espèce traverse 1 ou 2 ères grand maximum
            if (intersectingPeriods.length > 0 && intersectingPeriods.length <= 2) {
                // Tri de l'ancien vers le récent
                intersectingPeriods.sort((a, b) => b.start - a.start);
                
                const zoomStart = intersectingPeriods[0].start;
                const zoomEnd = intersectingPeriods[intersectingPeriods.length - 1].end;
                const zoomDuration = zoomStart - zoomEnd;
                
                ui.timelineZoomContent.innerHTML = '';
                
                intersectingPeriods.forEach(period => {
                    period.subs.forEach((sub, i) => {
                        const subDuration = sub.s - sub.e;
                        const subWidthPct = (subDuration / zoomDuration) * 100;
                        
                        // Création du dégradé : de -20% (plus sombre) à +20% (plus clair)
                        const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                        const stageColor = adjustColorLightness(period.color, shadeAmount);
                        
                        const subDiv = document.createElement('div');
                        subDiv.style.cssText = `width:${subWidthPct}%; height:100%; background-color:${stageColor}; border-right:1px solid rgba(0,0,0,0.15); box-sizing:border-box; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:9px; color:rgba(0,0,0,0.8); white-space:nowrap; text-overflow:clip; cursor:help; padding:0 2px;`;
                        subDiv.title = `${t(sub.k)} (${sub.s} - ${sub.e} Ma)`;
                        if (subWidthPct > 6) subDiv.innerText = t(sub.k);
                        
                        ui.timelineZoomContent.appendChild(subDiv);
                    });
                });

                // Indicateur de la loupe
                const zDisplayStart = Math.min(zoomStart, Math.max(zoomEnd, start));
                const zDisplayEnd = Math.min(zoomStart, Math.max(zoomEnd, end));
                
                const zLeftPct = ((zoomStart - zDisplayStart) / zoomDuration) * 100;
                const zWidthPct = start === end ? 0 : ((zDisplayStart - zDisplayEnd) / zoomDuration) * 100;
                
                ui.timelineZoomIndicator.style.left = zLeftPct + '%';
                ui.timelineZoomIndicator.style.width = start === end ? '2px' : zWidthPct + '%';
                
                ui.timelineZoomContainer.style.display = 'block';
                ui.timelineZoomIndicator.style.display = 'block';
            }
        }
    }
  }

  function calculateTaxaCounts(nodes: any) {
    const uniqueGenera = new Set<string>();
    const uniqueSpecies = new Set<string>();

    nodes.forEach((n: any) => {
        // --- 1. Filtre des taxons invalides ---
        if (!appSettings.countInvalid) {
            const status = n.data('status');
            // Si un statut existe, qu'il n'est pas vide et n'est pas "Valide" -> on l'ignore
            if (status && status !== 'Valide' && status.trim() !== '') return;
        }

        let rawName = n.data('name');
        if (!rawName || rawName.trim() === '') return;

        let cleanName = rawName.replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim().toLowerCase();
        if (cleanName === '' || cleanName === t('default.unnamed_branch').toLowerCase()) return;

        const explicitRank = n.data('rank');
        const words = cleanName.split(/\s+/);
        
        const isSpeciesRank = explicitRank === 'Espèce' || explicitRank === 'Sous-espèce' || (appSettings.smartTaxonomy && (!explicitRank || explicitRank === 'Clade (non-classé)') && words.length >= 2);

        // --- 2. Comptage par reconstitution parfaite du binôme ---
        if (isSpeciesRank) {
            let trueGenus = '';
            let parentGenusNode = null;
            if (n.incomers) {
                let curr = n.incomers('node').first();
                while(curr && curr.length > 0 && !curr.hasClass('box')) {
                    if (curr.data('rank') === 'Genre') { parentGenusNode = curr; break; }
                    curr = curr.incomers('node').first();
                }
            }

            // On récupère le vrai nom du genre parent (S'il existe)
            if (parentGenusNode) {
                let pName = parentGenusNode.data('name') || '';
                trueGenus = pName.replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim().split(/\s+/)[0].toLowerCase();
            }

            let firstWord = words[0];
            let epithet = cleanName;
            
            // On nettoie l'épithète pour ne garder que le nom d'espèce pur, en retirant l'abréviation ou le genre complet
            if (trueGenus && epithet.startsWith(trueGenus + ' ')) {
                epithet = epithet.substring(trueGenus.length + 1).trim();
            } else if (/^[a-z][.?]+\s*/.test(epithet)) {
                epithet = epithet.replace(/^[a-z][.?]+\s*/, '').trim();
            } else {
                if (!trueGenus && !firstWord.includes('.') && firstWord.length >= 3) {
                    trueGenus = firstWord;
                }
                if (!parentGenusNode && trueGenus && epithet.startsWith(trueGenus + ' ')) {
                    epithet = epithet.substring(trueGenus.length).trim();
                }
            }

            // On construit une clé unique universelle (Ex: "tyrannosaurus rex") et on l'ajoute au Set
            const universalBinomial = (trueGenus || "unknown") + " " + epithet;
            uniqueSpecies.add(universalBinomial);

            if (trueGenus) {
                uniqueGenera.add(trueGenus);
            }
        } 
        else if (explicitRank === 'Genre') {
            let firstWord = words[0];
            if (firstWord && !firstWord.includes('.')) {
                uniqueGenera.add(firstWord);
            }
        }
    });

    return {
        genera: uniqueGenera.size,
        species: uniqueSpecies.size
    };
  }

  function updateCounters() {
    // OPTIM 10 - cy.$('...') reparse le selecteur a chaque appel ; cy.nodes(':selected')
    // passe par le pool de selection deja indexe. Le comptage lui-meme reste
    // exact a chaque refresh : le memoiser demanderait une invalidation sur le
    // rang et le statut, trop facile a oublier pour le gain.
    const allNodes = cy.nodes().filter((n: any) => !n.hasClass('box'));
    const total = calculateTaxaCounts(allNodes);

    const selected = cy.nodes(':selected').filter((n: any) => !n.hasClass('box'));
    
    if (selected.length > 0) {
      const clade = selected.union(selected.successors('node')).filter((n: any) => !n.hasClass('box'));
      const cladeCounts = calculateTaxaCounts(clade);
      ui.counterBar.innerText = `${t('counters.genera')} ${cladeCounts.genera} (${total.genera}) | ${t('counters.species')} ${cladeCounts.species} (${total.species})`;
    } else {
      ui.counterBar.innerText = `${t('counters.genera')} ${total.genera} | ${t('counters.species')} ${total.species}`;
    }
  }

  function applyTheme(themeName: string) { 
      const themesList = ['light', 'dark', 'sepia', 'ingen', 'console', 'high-contrast', 'dimmed']; 
      if (!themesList.includes(themeName)) themeName = 'light'; 
      document.body.setAttribute('data-theme', themeName); 

      if (appSettings.canvasBgLinked) {
          // On force la transparence avec 'important' pour écraser la règle CSS de base
          container.style.setProperty('background-color', 'transparent', 'important');
          
          setTimeout(() => {
              const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
              const lineColor = getComputedStyle(document.body).getPropertyValue('--border-color').trim() || '#000000';
              cy.style().selector('.taxon').style({ 'color': textColor }).update();
              cy.style().selector('edge').style({ 'line-color': lineColor }).update();
          }, 10);
      } else {
          // On force le retour au blanc brut
          container.style.setProperty('background-color', '#ffffff', 'important');
          cy.style().selector('.taxon').style({ 'color': '#000000' }).update();
          cy.style().selector('edge').style({ 'line-color': '#000000' }).update();
      }
  }

  function updateBreadcrumbs() {
    let path: any[] = []; let curr: any = cy.$id(currentRootId);
    
    // 1. Construction du chemin complet
    while (curr.length > 0) { 
        const rawName = curr.data('name'); 
        if (rawName && rawName.trim() !== '') { path.unshift({ id: curr.id(), name: rawName }); } 
        curr = curr.incomers('node').first(); 
    }
    if (path.length === 0) path.push({ id: currentRootId, name: t('default.unnamed_sheet') }); 
    
    ui.breadcrumbsBar.innerHTML = '';

    // 2. Fonction pour dessiner un maillon cliquable
    const renderCrumb = (p: any, isLast: boolean) => {
      const span = document.createElement('span'); 
      span.innerText = p.name; 
      span.style.cursor = "pointer"; 
      span.style.color = isLast ? "var(--text-main)" : "#2196F3"; 
      span.style.fontWeight = isLast ? "bold" : "normal"; 
      span.style.textDecoration = isLast ? "none" : "underline";
      span.onclick = () => { saveState(); currentRootId = p.id; refreshLayout(true); }; 
      ui.breadcrumbsBar.appendChild(span);
      
      if (!isLast) { 
          const sep = document.createElement('span'); 
          sep.innerText = " > "; sep.style.opacity = "0.5"; sep.style.textDecoration = "none"; 
          ui.breadcrumbsBar.appendChild(sep); 
      }
    };

    // 3. Logique de réduction (Raccourci si > 4 éléments)
    if (path.length > 4) {
      // On affiche le 1er (Racine)
      renderCrumb(path[0], false);
      
      // On affiche les points de suspension interactifs
      const ellipsis = document.createElement('span');
      ellipsis.innerText = "...";
      ellipsis.title = path.map(p => p.name).join(' > '); // Bulle d'aide au survol
      ellipsis.style.cssText = "cursor:help; font-weight:bold; letter-spacing:2px; color:#2196F3;";
      ui.breadcrumbsBar.appendChild(ellipsis);
      
      const sep = document.createElement('span'); 
      sep.innerText = " > "; sep.style.opacity = "0.5"; sep.style.textDecoration = "none"; 
      ui.breadcrumbsBar.appendChild(sep);

      // On affiche les deux derniers (Parent + Actuel)
      renderCrumb(path[path.length - 2], false);
      renderCrumb(path[path.length - 1], true);
      
    } else {
      // Comportement normal si l'arbre est court
      path.forEach((p, index) => {
          renderCrumb(p, index === path.length - 1);
      });
    }
  }

  function updateSheetsBar() {
    ui.sheetsBar.style.display = 'flex';
    ui.sheetsBar.style.alignItems = 'center';
    ui.sheetsBar.style.overflow = 'hidden'; 
    
    ui.sheetsBar.innerHTML = `
        <span style="font-weight:bold; font-size:14px; margin-right:10px; flex-shrink:0;">${t('sheets.title')}</span>
        <div id="sheets-sticky-zone" style="display:flex; flex-shrink:0; align-items:center; border-right:1px solid var(--border-color); padding-right:8px; margin-right:8px; gap:6px;"></div>
        <div id="sheets-scroll-zone" style="display:flex; flex:1; overflow-x:auto; align-items:center; gap:6px; padding-bottom:2px;"></div>
    `;

    const stickyZone = document.getElementById('sheets-sticky-zone') as HTMLElement;
    const scrollZone = document.getElementById('sheets-scroll-zone') as HTMLElement;

    requestAnimationFrame(() => {
        if (ui.counterBar && ui.sheetsBar) {
            const counterLeft = ui.counterBar.getBoundingClientRect().left;
            const spaceForCounter = window.innerWidth - counterLeft + 20; 
            scrollZone.style.paddingRight = spaceForCounter + 'px'; 
        }
    });
    
    const absoluteRoot = cy.nodes().roots().first();
    if (!absoluteRoot || absoluteRoot.length === 0) return;

    const allSheetNodes = cy.nodes().filter((n: any) => (n.data('hasNewSheet') || n.data('isFolder')) && n.id() !== absoluteRoot.id()).toArray();
    const parentIds = new Set(allSheetNodes.map(n => n.data('parentSheetId')).filter(id => id != null));

    // --- 1. Cartographie Hiérarchique ---
    const sheetChildrenMap = new Map<string, any[]>();
    const topLevelSheets: any[] = [];

    allSheetNodes.forEach(n => {
        const parentId = n.data('parentSheetId');
        // Un dossier est au 1er niveau s'il n'a pas de parent, si son parent est la racine absolue, ou s'il est épinglé
        if (!parentId || parentId === absoluteRoot.id() || n.data('isPinned')) {
            topLevelSheets.push(n);
        } else {
            if (!sheetChildrenMap.has(parentId)) sheetChildrenMap.set(parentId, []);
            sheetChildrenMap.get(parentId)!.push(n);
        }
    });

    const sortSheets = (arr: any[]) => {
        arr.sort((a, b) => {
            const pinA = a.data('isPinned') ? 1 : 0;
            const pinB = b.data('isPinned') ? 1 : 0;
            if (pinA !== pinB) return pinB - pinA; 
            return (a.data('sheetOrder') || 0) - (b.data('sheetOrder') || 0);
        });
    };

    // --- 2. Construction du Chemin Actif (pour le mode accordéon) ---
    const activePath = new Set<string>();
    let curr = cy.$id(currentRootId);
    while (curr && curr.length > 0 && curr.id() !== absoluteRoot.id()) {
        activePath.add(curr.id());
        const pid = curr.data('parentSheetId');
        curr = pid ? cy.$id(pid) : (null as any);
    }

    // --- 3. Générateur de bouton isolé ---
    const createSheetButton = (n: any) => {
        const btn = document.createElement('button');
        const rawName = n.data('name');
        let displayName = (!rawName || rawName.trim() === '') ? t('default.unnamed') : rawName;
        
        const isPinned = n.data('isPinned');
        const isAbsoluteRoot = n.id() === absoluteRoot.id();
        const isActive = n.id() === currentRootId;

        // Étoile Unicode pour les favoris
        if (isPinned && !isAbsoluteRoot) displayName = '\u2605 ' + displayName;

        btn.innerText = displayName;
        
        let borderCol = isActive ? '#1976D2' : (isAbsoluteRoot ? '#FF9800' : 'var(--border-color)');
        let bgCol = isActive ? '#2196F3' : 'var(--bg-input)';

        btn.style.cssText = `flex-shrink:0; padding:6px 10px; font-size:13px; cursor:pointer; border:1px solid ${borderCol}; border-radius:var(--btn-radius); background:${bgCol}; color:${isActive ? '#fff' : 'var(--text-input)'}; font-weight:${isActive || isAbsoluteRoot || parentIds.has(n.id()) ? 'bold' : 'normal'}; white-space:nowrap; transition:all 0.2s; box-shadow:var(--panel-shadow);`;
        
        if (!isAbsoluteRoot) {
            btn.draggable = true;
            btn.ondragstart = (e) => { e.dataTransfer?.setData('text/plain', n.id()); };
            btn.ondragover = (e) => { e.preventDefault(); btn.style.border = "2px solid #2196F3"; };
            btn.ondragleave = () => { btn.style.border = `1px solid ${borderCol}`; };

            btn.ondrop = (e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer?.getData('text/plain');
                if (!draggedId || draggedId === n.id()) return;
                
                // Sécurité anti-boucle infinie (empêche de glisser un dossier dans son propre enfant)
                let currentDropTarget = n;
                let isCircular = false;
                while (currentDropTarget && currentDropTarget.length > 0 && currentDropTarget.id() !== absoluteRoot.id()) {
                    if (currentDropTarget.id() === draggedId) {
                        isCircular = true;
                        break;
                    }
                    const pId = currentDropTarget.data('parentSheetId');
                    currentDropTarget = pId ? cy.$id(pId) : (null as any);
                }
                
                if (isCircular) {
                    btn.style.border = `1px solid ${borderCol}`;
                    return; 
                }

                const draggedNode = cy.$id(draggedId);
                saveState();
                draggedNode.data('parentSheetId', n.id());
                draggedNode.data('isPinned', false); // Désépingle s'il entre dans un dossier
                refreshLayout(false);
            };

            btn.oncontextmenu = (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                sheetContextMenu.innerHTML = `
                    <div class="menu-item" id="smenu-pin" style="padding:6px 12px; cursor:pointer;">\u2605 ${t('menu.sheet_pin')}</div>
                    <div class="menu-item" id="smenu-out" style="padding:6px 12px; cursor:pointer; display:${n.data('parentSheetId')?'block':'none'};">\u21E1 ${t('menu.sheet_out')}</div>
                `;

                sheetContextMenu.style.display = 'block';
                const menuRect = sheetContextMenu.getBoundingClientRect();
                let posX = e.pageX; let posY = e.pageY;
                if (posX + menuRect.width > window.innerWidth) posX = window.innerWidth - menuRect.width - 5;
                if (posY + menuRect.height > window.innerHeight) posY = e.pageY - menuRect.height - 5;

                sheetContextMenu.style.left = posX + 'px';
                sheetContextMenu.style.top = posY + 'px';

                document.getElementById('smenu-pin')?.addEventListener('click', () => {
                    saveState(); n.data('isPinned', !n.data('isPinned')); refreshLayout(false);
                });
                document.getElementById('smenu-out')?.addEventListener('click', () => {
                    saveState(); n.data('parentSheetId', null); refreshLayout(false);
                });
            };
        }

        btn.onclick = () => { currentRootId = n.id(); refreshLayout(true); };
        return btn;
    };

    // --- 4. Fonction Récursive d'Affichage Accordéon Horizontal ---
    const processNodeHierarchy = (node: any, parentContainer: HTMLElement) => {
        const nId = node.id();
        const pId = node.data('parentSheetId');
        const isPinned = node.data('isPinned');
        const isTopLevel = !pId || pId === absoluteRoot.id() || isPinned;
        
        // Connecteur fléché dynamique (uniquement si ce n'est pas le premier niveau)
        if (!isTopLevel) {
            const separator = document.createElement('span');
            // Si c'est un parent dans le chemin en cours d'ouverture (mais pas la feuille finale ciblée)
            if (activePath.has(nId) && nId !== currentRootId) {
                separator.innerText = '\u2192'; // Flèche droite (chemin ascendant)
            } else {
                separator.innerText = '\u21B3'; // Flèche d'angle (branche/feuille finale)
            }
            separator.style.cssText = "color:var(--text-main); opacity:0.6; font-weight:bold; margin:0 2px; flex-shrink:0;";
            parentContainer.appendChild(separator);
        }

        const btn = createSheetButton(node);
        if (btn) parentContainer.appendChild(btn);

        // Si le dossier est "ouvert" (fait partie du chemin actif), on affiche ses enfants directs
        if (activePath.has(nId) || nId === absoluteRoot.id()) {
            const children = sheetChildrenMap.get(nId) || [];
            if (children.length > 0) {
                sortSheets(children);
                children.forEach(child => {
                    processNodeHierarchy(child, parentContainer);
                });
            }
        }
    };

    // --- 5. Déploiement UI ---
    const absoluteRootBtn = createSheetButton(absoluteRoot);
    if (absoluteRootBtn) stickyZone.appendChild(absoluteRootBtn);

    sortSheets(topLevelSheets);
    topLevelSheets.forEach(node => {
        const targetZone = node.data('isPinned') ? stickyZone : scrollZone;
        processNodeHierarchy(node, targetZone);
    });

    // Nettoyage esthétique de la zone d'épinglage
    if (stickyZone.children.length === 1) {
        stickyZone.style.borderRight = 'none';
        stickyZone.style.paddingRight = '0px';
        stickyZone.style.marginRight = '0px';
    }
  }

  const textWidthCache = new Map<string, number>();

  // OPTIM 12 - La cle du cache contient le nom complet : chaque frappe au clavier
  // y laissait une entree definitive. On plafonne, purge FIFO.
  const TEXT_CACHE_MAX = 4000;
  const cacheTextWidth = (key: string, value: number) => {
      if (textWidthCache.size >= TEXT_CACHE_MAX) {
          const oldest = textWidthCache.keys().next().value;
          if (oldest !== undefined) textWidthCache.delete(oldest);
      }
      textWidthCache.set(key, value);
  };

  // OPTIM 5 - Un seul utilitaire de temporisation pour tous les curseurs et
  // champs texte : un relayout complet par frappe de touche etait la principale
  // source de saccade a l'edition.
  const debounceTimers = new Map<string, any>();
  const debounced = (key: string, delay: number, fn: () => void) => {
      const prev = debounceTimers.get(key);
      if (prev) clearTimeout(prev);
      debounceTimers.set(key, setTimeout(() => {
          debounceTimers.delete(key);
          fn();
      }, delay));
  };

  // OPTIM 1 - cy.elements().boundingBox() etait recalculee a chaque image par
  // syncScrollbars. La boite du modele ne change pourtant qu'a l'ajout, la
  // suppression, le deplacement ou le redimensionnement d'un element : ni le pan
  // ni le zoom ne la modifient. On la met donc en cache.
  let cachedGraphBB: any = null;
  let graphBBVersion = 0;
  const invalidateGraphBB = () => { cachedGraphBB = null; graphBBVersion++; };
  const getGraphBB = () => {
      if (!cachedGraphBB) cachedGraphBB = cy.elements().boundingBox();
      return cachedGraphBB;
  };

  // OPTIM 8 - Index de recherche construit une fois par version du graphe, au
  // lieu d'un parcours complet (avec remontee d'ancetres) a chaque frappe.
  let searchIndex: { node: any, strings: string[] }[] | null = null;
  let searchIndexVersion = -1;
  const invalidateSearchIndex = () => { searchIndex = null; };
  let isFirstLoad = true;

  // --- MOTEUR CHRONOGRAMME : ANALYSEUR DE TEMPS ---
  let globalTimeMax = 0; 
  let globalTimeMin = 0; 

  // Rafraichissement de la frise : pilote par requestAnimationFrame plutot que
  // par les evenements Cytoscape. Selon la facon dont la camera bouge (molette,
  // inertie, scrollbars custom, cy.pan programmatique), 'pan'/'zoom'/'render'
  // ne sont pas tous emis de facon fiable : la frise restait figee jusqu'au
  // refreshLayout suivant (declenche par la selection d'un taxon). Un poll rAF
  // qui sort en deux comparaisons est infaillible et coute ~0.
  let chronoRulerUpdater: (() => void) | null = null;
  let chronoRafRunning = false;

  // OPTIM 11 - La boucle tournait en permanence en mode chronogramme, meme au
  // repos. Elle s'arrete desormais apres CHRONO_IDLE_FRAMES images sans
  // mouvement, et n'importe quel evenement de camera la relance pour une
  // nouvelle salve. C'est robuste la ou un pur pilotage par evenements avait
  // echoue : un evenement ne fait que REVEILLER la boucle, qui verifie ensuite
  // elle-meme pendant une trentaine d'images.
  const CHRONO_IDLE_FRAMES = 30;
  let chronoIdleFrames = 0;
  let chronoLastSeen = { z: NaN, x: NaN };

  const chronoRafLoop = () => {
      if (layoutMode !== 'chrono' || !chronoRulerUpdater) {
          chronoRafRunning = false;
          return;
      }

      const z = cy.zoom();
      const x = cy.pan().x;
      if (z === chronoLastSeen.z && x === chronoLastSeen.x) {
          chronoIdleFrames++;
      } else {
          chronoIdleFrames = 0;
          chronoLastSeen.z = z;
          chronoLastSeen.x = x;
      }

      chronoRulerUpdater();

      if (chronoIdleFrames >= CHRONO_IDLE_FRAMES) {
          chronoRafRunning = false; // en veille : un evenement de camera relancera
          return;
      }
      requestAnimationFrame(chronoRafLoop);
  };

  const startChronoRaf = () => {
      chronoIdleFrames = 0;
      if (chronoRafRunning) return;
      chronoRafRunning = true;
      requestAnimationFrame(chronoRafLoop);
  };

  // Echelle unique partagee par le layout, la frise, les scrollbars et le "bouclier".
  // Cles des periodes geologiques, dans l'ordre de GEO_DETAILS (du plus recent
  // au plus ancien). PERIOD_NAMES etait un tableau francais en dur, duplique
  // deux fois : la frise et l'export PDF affichaient "Crétacé" meme en anglais.
  const CHRONO_PERIOD_KEYS = [
      'geo.period.quaternary', 'geo.period.neogene', 'geo.period.paleogene',
      'geo.period.cretaceous', 'geo.period.jurassic', 'geo.period.triassic',
      'geo.period.permian', 'geo.period.carboniferous', 'geo.period.devonian',
      'geo.period.silurian', 'geo.period.ordovician', 'geo.period.cambrian',
      'geo.period.precambrian'
  ];

  const CHRONO_PX_PER_MA = 20;
  const CHRONO_EDGE_PAD = 40; // respiration en bout de frise

  // ===================================================================
  // PHASE 9 - AXE DU TEMPS
  //
  // Toute conversion age -> abscisse passe par chronoAgeToX(). C'est la
  // condition pour que l'arbre, les bandes stratigraphiques, le ruban de la
  // frise, le bornage du pan et l'export restent d'accord entre eux.
  //
  // Les modes non lineaires conservent la LARGEUR TOTALE du mode lineaire et
  // ne redistribuent que l'interieur : le cadrage ne saute pas quand on change
  // de mode. Seul 'linear' est metriquement exact ; les autres sont des aides
  // a la lecture quand les divergences se concentrent sur une periode courte.
  // ===================================================================
  type ChronoAxisMode = 'linear' | 'sqrt' | 'log' | 'rank';
  let chronoAxisMode: ChronoAxisMode = 'linear';
  let chronoAxisLo = 0;    // borne recente de reference (= globalTimeMin)
  let chronoAxisHi = 100;  // borne ancienne de reference (= globalTimeMax)
  let chronoRankAges: number[] = []; // ages distincts presents, croissants

  // Bornes de la frise :
  //  'period' -> etendues aux periodes geologiques entieres touchees ;
  //  'tight'  -> intervalle reellement occupe par le cladogramme, +/- 10 %.
  // Le second mode sert quand on ne travaille que sur une portion de periode :
  // les blocs sont alors rognes, donc leurs titres se recentrent sur ce qu'on
  // regarde vraiment.
  type ChronoBoundsMode = 'period' | 'tight';
  let chronoBoundsMode: ChronoBoundsMode = 'period';

  // PHASE 8 - separation des barres verticales quasi confondues.
  let chronoLanesEnabled = false;
  // Nombre de barres effectivement decalees au dernier layout : sert a dire a
  // l'utilisateur si le mode "lisible" a change quelque chose ou non.
  let chronoLaneCount = 0;
  const CHRONO_LANE_MIN = 8;       // unites modele : en dessous, 2 barres se confondent
  const CHRONO_LANE_STEP = 3;      // decalage par couloir
  const CHRONO_LANE_MAX_TURN = 12; // plafond absolu du coude

  // Fonction monotone croissante appliquee a l'age.
  const chronoWarp = (age: number): number => {
      const a = Math.max(0, age);
      if (chronoAxisMode === 'sqrt') return Math.sqrt(a);
      if (chronoAxisMode === 'log') return Math.log1p(a);
      if (chronoAxisMode === 'rank') {
          const n = chronoRankAges.length;
          if (n === 0) return a;
          if (a <= chronoRankAges[0]) return 0;
          if (a >= chronoRankAges[n - 1]) return n - 1;
          // Interpolation lineaire entre deux rangs consecutifs : indispensable
          // pour que la frise (dont les bornes ne sont pas des ages de noeuds)
          // suive exactement la meme deformation que l'arbre.
          let lo = 0;
          let hi = n - 1;
          while (hi - lo > 1) {
              const mid = (lo + hi) >> 1;
              if (chronoRankAges[mid] <= a) lo = mid; else hi = mid;
          }
          const span = chronoRankAges[hi] - chronoRankAges[lo];
          return span <= 0 ? lo : lo + (a - chronoRankAges[lo]) / span;
      }
      return a;
  };

  // Les X sont NEGATIFS : le present est a droite, le passe part vers la gauche.
  const chronoAgeToX = (age: number): number => {
      const a = Math.max(0, age);
      const linear = -(a * CHRONO_PX_PER_MA);
      if (chronoAxisMode === 'linear') return linear;

      const lo = chronoAxisLo;
      const hi = chronoAxisHi;
      if (!(hi > lo)) return linear;

      const wLo = chronoWarp(lo);
      const wHi = chronoWarp(hi);
      if (!(wHi > wLo)) return linear;

      const u = (chronoWarp(a) - wLo) / (wHi - wLo);
      return -(lo * CHRONO_PX_PER_MA) - u * ((hi - lo) * CHRONO_PX_PER_MA);
  };

  // PHASE 1 : le bord droit du contenu (glyphe le plus recent + son etiquette)
  // est MESURE a chaque layout. L'ancienne constante de 400 px suffisait pour
  // "T. rex" mais tronquait "Tyrannosaurus rex" : l'etiquette existait, mais le
  // bornage du pan interdisait de scroller jusqu'a elle.
  let chronoContentRight = 0;

  // Bord GAUCHE reel du contenu. Depuis que le nom des clades se lit a gauche
  // de leur barre, l'etiquette de la racine deborde du plus vieil age : sans
  // cela, le bornage du pan la coupait, surtout en mode "cladogramme" ou la
  // marge n'est que de 10 % de l'amplitude.
  let chronoContentLeft = 0;

  // --- Geometrie du ruban de la frise (un seul endroit a regler) -----------
  // CHRONO_RULER_BOTTOM se mesure depuis le bas de #app. La scrollbar
  // horizontale est en position:fixed a 45 px du bas de la fenetre et #app
  // s'arrete a 35 px : elle occupe donc les 10 a 25 premiers pixels de #app.
  // On garde une marge confortable au-dessus.
  const CHRONO_RULER_BOTTOM = 100;
  const CHRONO_STAGE_H = 40;
  const CHRONO_PERIOD_H = 24;
  const CHRONO_RULER_H = CHRONO_STAGE_H + CHRONO_PERIOD_H;

  // En chronogramme les X sont NEGATIFS : x = -(age * CHRONO_PX_PER_MA).
  // Le present (0 Ma) est donc a x = 0, et le passe part vers la gauche.
  const getChronoWorldBounds = () => {
      const x1 = Math.min(chronoAgeToX(globalTimeMax), chronoContentLeft) - CHRONO_EDGE_PAD;
      const x2 = Math.max(chronoAgeToX(globalTimeMin), chronoContentRight) + CHRONO_EDGE_PAD;
      return { x1: x1, x2: x2, w: x2 - x1 };
  };

  function analyzeTimeBounds() {
      if (layoutMode !== 'chrono') return;
      
      let maxAge = -Infinity;
      let minAge = Infinity;

      cy.nodes(':visible').forEach((node: any) => {
          if (node.hasClass('box')) return;
          const period = node.data('period');
          
          if (period && period.trim() !== '') {
              const parseMa = (s: string) => parseFloat(s.replace(',', '.'));
              const rangeMatch = period.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
              const singleMatch = period.match(/([\d.,]+)/);
              
              let start = null, end = null;
              if (rangeMatch) {
                  start = parseMa(rangeMatch[1]);
                  end = parseMa(rangeMatch[2]);
              } else if (singleMatch) {
                  start = parseMa(singleMatch[1]);
                  end = start;
              }

              if (start !== null && end !== null && !isNaN(start) && !isNaN(end)) {
                  if (start < end) { const temp = start; start = end; end = temp; }
                  if (start > maxAge) maxAge = start;
                  if (end < minAge) minAge = end;
              }
          }
      });

      if (maxAge === -Infinity || minAge === Infinity) {
          globalTimeMax = 100;
          globalTimeMin = 0;
      } else {
          // Bornes = ages extremes +/- 10 % de l'amplitude.
          // Valeur provisoire : le bloc chronogramme la recalcule avec les ages
          // reellement CALCULES (un ancetre non date peut sortir de cette plage).
          const padding = Math.max((maxAge - minAge) * 0.10, 2);
          globalTimeMax = maxAge + padding;
          globalTimeMin = Math.max(0, minAge - padding);
      }
      
      console.log(`[Chrono] Échelle calculée : De ${globalTimeMax.toFixed(1)} à ${globalTimeMin.toFixed(1)}`);
  }

  function refreshLayout(fitCamera = false) {
    cy.startBatch(); 
    updateBreadcrumbs(); 
    updateSheetsBar(); 
    updateCounters();
    analyzeTimeBounds();
    
    const nodesById = new Map<string, any>();
    const childrenMap = new Map<string, any[]>();
    
    // OPTIM 6 - Ecrire node.data('rendered', false) sur TOUS les noeuds coutait
    // n invalidations de style par refresh (le setter 'data' porte
    // updateStyle:true dans Cytoscape), pour un champ lu uniquement ici. Le Set
    // visibleNodes construit plus bas suffit.
    cy.nodes().forEach(node => {
        nodesById.set(node.id(), node);
    });

    cy.edges().forEach(e => {
        if (e.id() === 'ghost-edge') return;
        const src = e.data('source');
        const tgt = e.data('target');
        if (!childrenMap.has(src)) childrenMap.set(src, []);
        const targetNode = nodesById.get(tgt);
        if (targetNode && !targetNode.hasClass('box')) {
            childrenMap.get(src)!.push(targetNode);
        }
    });

    childrenMap.forEach(arr => {
        arr.sort((a, b) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0));
    });

    const visibleNodes = new Set<string>();
    const traverseVisibility = (nodeId: string) => {
        visibleNodes.add(nodeId);
        const node = nodesById.get(nodeId);
        if (!node) return;
        
        const isSheetBreak = node.data('hasNewSheet') && nodeId !== currentRootId;
        const isCollapsed = node.data('collapsed');
        
        if (!isSheetBreak && !isCollapsed) {
            const children = childrenMap.get(nodeId) || [];
            children.forEach(c => traverseVisibility(c.id()));
        }
    };
    if (nodesById.has(currentRootId)) traverseVisibility(currentRootId);
    if (nodesById.has('ghost-node')) visibleNodes.add('ghost-node');

    visibleNodes.forEach(nodeId => {
        const node = nodesById.get(nodeId);
        if (!node || node.hasClass('box') || nodeId === 'ghost-node') return;
        
        
        const hasLink = node.data('hasNewSheet') && nodeId !== currentRootId;
        const rawName = node.data('name');
        const imgUrlData = node.data('imgUrl');
        const hasImage = imgUrlData && imgUrlData.trim() !== '';
        const dynamicName = getDynamicNodeName(node);
        const isEmptyBranch = (dynamicName === '') && !hasImage;
        
        node.data('isEmpty', isEmptyBranch);

        let w = 1, h = 1; 
        let measuredTextW = 0, measuredTextH = 0; // conserves pour le chronogramme
        let hasSheetContent = false;
        let marginX = 0, marginY = 0, posX = '50%', posY = '50%', iWidth = 0, iHeight = 0, bgUrl = 'none';

        if (!isEmptyBranch) {
            const extinct = node.data('extinct');
            const isBold = node.data('isBold');
            const isItalic = node.data('isItalic');
            const collapsed = node.data('collapsed');
            const fontSize = node.data('fontSize') || 16;
            const fontFamily = node.data('fontFamily') || 'serif';
            
            const cacheKey = `${dynamicName}_${extinct}_${isBold}_${isItalic}_${collapsed}_${hasLink}_${fontSize}_${fontFamily}`;
            let textW = textWidthCache.get(cacheKey);
            if (textW === undefined) {
                textW = measureTextWidth(dynamicName, extinct, isBold, isItalic, collapsed, hasLink, fontSize, fontFamily);
                cacheTextWidth(cacheKey, textW);
            }
            
            const linesCount = dynamicName ? dynamicName.split('\n').length : 1;
            const textH = Math.max(24, linesCount * (fontSize * 1.2));
            measuredTextW = textW;
            measuredTextH = textH;
            const PADDING = node.data('hasFrame') ? 18 : 10; 
            
            if (hasImage) { 
                bgUrl = imgUrlData; 
                const iSize = node.data('imgSize') || 150; 
                const ratio = node.data('imgRatio') || 1; 
                iWidth = iSize; 
                iHeight = iSize / ratio; 
                const iPos = node.data('imgPos') || 'right'; 
                const GAP = 10; 

                if (iPos === 'left') { 
                    w = PADDING + iWidth + GAP + textW + PADDING; 
                    h = PADDING + Math.max(iHeight, textH) + PADDING; 
                    posX = PADDING + 'px'; posY = '50%'; 
                    marginX = (PADDING + iWidth + GAP + (textW / 2)) - (w / 2); marginY = 0; 
                } else if (iPos === 'right') { 
                    w = PADDING + textW + GAP + iWidth + PADDING; 
                    h = PADDING + Math.max(textH, iHeight) + PADDING; 
                    posX = (PADDING + textW + GAP) + 'px'; posY = '50%'; 
                    marginX = (PADDING + (textW / 2)) - (w / 2); marginY = 0; 
                } else if (iPos === 'top') { 
                    w = PADDING + Math.max(textW, iWidth) + PADDING; 
                    h = PADDING + iHeight + GAP + textH + PADDING; 
                    posX = '50%'; posY = PADDING + 'px'; 
                    marginX = 0; marginY = (PADDING + iHeight + GAP + (textH / 2)) - (h / 2); 
                } else if (iPos === 'bottom') { 
                    w = PADDING + Math.max(textW, iWidth) + PADDING; 
                    h = PADDING + textH + GAP + iHeight + PADDING; 
                    posX = '50%'; posY = (PADDING + textH + GAP) + 'px'; 
                    marginX = 0; marginY = (PADDING + (textH / 2)) - (h / 2); 
                }
            } else {
                w = textW + (PADDING * 2); 
                h = textH + (PADDING * 2);
            }
            
            if (node.data('textAbove')) {
                marginY += -((fontSize * 0.8) + 8);
            }
        }

        let finalW = isEmptyBranch ? 0.1 : w;
        let finalH = isEmptyBranch ? 0.1 : h;
        
        let bgUrls: string[] = [];
        let bgWidths: string[] = [];
        let bgHeights: string[] = [];
        let bgPosXs: string[] = [];
        let bgPosYs: string[] = [];

        if (bgUrl !== 'none' && bgUrl !== '') {
            bgUrls.push(bgUrl);
            bgWidths.push(iWidth + 'px');
            bgHeights.push(iHeight + 'px');
            bgPosXs.push(posX);
            bgPosYs.push(posY);
        }

        if (node.data('textAbove') && !isEmptyBranch) {
            // OPTIM 2 - le SVG etait reconstruit et re-encode pour chaque noeud a
            // chaque refresh ; c'est une constante.
            bgUrls.push(TEXT_ABOVE_BAR_SVG);
            bgWidths.push('100%');
            bgHeights.push('2px');
            bgPosXs.push('50%');
            bgPosYs.push('50%'); 
        }

        // OPTIM 2 - Plus de node.style({...}) ici.
        // La feuille de style de base possede deja un mapper data(...) pour
        // chacune de ces quatorze proprietes : l'appel inline refaisait donc
        // exactement le meme travail une seconde fois, en plus couteux (parsing
        // du bloc + invalidation), et le bypass rendait le mapper inutile.
        // Les proprietes multi-valeurs (background-*) sont stockees deja jointes
        // pour que les mappers n'aient qu'a les lire.
        
        const d0 = node.data();
        hasSheetContent = !!(
            (d0.discoveryDate && d0.discoveryDate.trim() !== '') ||
            (d0.author && d0.author.trim() !== '') ||
            (d0.distribution && d0.distribution.trim() !== '') ||
            (d0.size && d0.size.trim() !== '') ||
            (d0.mass && d0.mass.trim() !== '') ||
            (d0.period && d0.period.trim() !== '') ||
            (d0.synapomorphies && d0.synapomorphies.trim() !== '') ||
            (d0.notes && d0.notes.trim() !== '') ||
            (d0.iucn && d0.iucn.trim() !== '') ||
            (d0.sheetImage && d0.sheetImage.trim() !== ''));

        node.data({
            width: finalW, 
            height: finalH, 
            labelW: isEmptyBranch ? 0 : measuredTextW,
            labelH: isEmptyBranch ? 0 : measuredTextH,
            renderWidth: finalW,
            renderHeight: finalH,
            // OPTIM 3 - resultats memorises pour le mapper 'label'
            displayName: dynamicName,
            hasSheetContent: hasSheetContent,
            // OPTIM 2 - listes deja jointes ; plus de bgUrl (cf. OPTIM 4)
            bgWidth: bgWidths.length > 0 ? bgWidths.join(', ') : '0px',
            bgHeight: bgHeights.length > 0 ? bgHeights.join(', ') : '0px',
            bgPosX: bgPosXs.length > 0 ? bgPosXs.join(', ') : '50%',
            bgPosY: bgPosYs.length > 0 ? bgPosYs.join(', ') : '50%',
            textMarginX: marginX, 
            textMarginY: marginY,
            fontWeight: node.data('isBold') ? 'bold' : 'normal',
            fontStyle: node.data('isItalic') ? 'italic' : 'normal'
        });
    });

    let currentY = 0; 
    const xGap = 40;     
    const yGap = layoutMode === 'comb' ? 16 : 60;   
    
    const calculatedPositions = new Map<string, {x: number, y: number}>();
    
    let maxLeafLeftX = 0;
    
    if (layoutMode === 'comb') {
        const dryWalkX = (nodeId: string, currentLeftX: number) => {
            const node = nodesById.get(nodeId);
            if (!node) return;
            
            const isSheetBreak = node.data('hasNewSheet') && nodeId !== currentRootId;
            const isCollapsed = node.data('collapsed');
            const childrenArray = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
            
            if (childrenArray.length === 0) {
                if (currentLeftX > maxLeafLeftX) maxLeafLeftX = currentLeftX;
            } else {
                const myWidth = node.data('width') || 1;
                const rightX = currentLeftX + myWidth;
                const childrenLeftX = rightX + xGap; 
                childrenArray.forEach(child => dryWalkX(child.id(), childrenLeftX));
            }
        };
        if (nodesById.has(currentRootId)) dryWalkX(currentRootId, 0);
    }

    const fastWalk = (nodeId: string, leftX: number): number => {
        const node = nodesById.get(nodeId);
        if (!node) return 0;
        
        const isSheetBreak = node.data('hasNewSheet') && nodeId !== currentRootId; 
        const isCollapsed = node.data('collapsed');
        const childrenArray = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
        
        const myWidth = node.data('width') || 1; 
        const myHeight = node.data('height') || 24; 
        
        let actualLeftX = leftX; 
        
        if (layoutMode === 'comb' && childrenArray.length === 0) {
            actualLeftX = maxLeafLeftX;
        }

        const myCenterX = actualLeftX + (myWidth / 2); 
        const rightX = actualLeftX + myWidth;
        
        if (childrenArray.length === 0) { 
            const nodeY = currentY + (myHeight / 2);
            calculatedPositions.set(nodeId, { x: myCenterX, y: nodeY }); 
            currentY = nodeY + (myHeight / 2) + yGap; 
            return nodeY; 
        } else {
            let sumY = 0; 
            const childrenLeftX = rightX + xGap; 
            
            childrenArray.forEach(child => { 
                sumY += fastWalk(child.id(), childrenLeftX); 
            }); 
            
            const avgY = sumY / childrenArray.length; 
            calculatedPositions.set(nodeId, { x: myCenterX, y: avgY }); 
            return avgY; 
        }
    };
    
    if (nodesById.has(currentRootId)) fastWalk(currentRootId, 0);

    cy.nodes().forEach(n => {
        if (n.hasClass('box')) return;
        
        if (visibleNodes.has(n.id())) {
            n.style('display', 'element');
            const pos = calculatedPositions.get(n.id());
            if (pos) n.position(pos);
        } else {
            n.style('display', 'none');
        }
    });

    const boxDataArray: any[] = [];

    cy.nodes('.box').forEach(box => {
        box.ungrabify(); 
        
        const targetIds = box.data('targets') || [];
        const isMono = box.data('isMonophyletic'); 
        
        let targetCollection = cy.collection();
        targetIds.forEach((tid: string) => {
            const n = cy.$id(tid);
            if (n.length > 0) targetCollection = targetCollection.union(n);
        });
        
        let expandedTargets = targetCollection;
        if (isMono) {
            expandedTargets = targetCollection.union(targetCollection.successors('node:not(.box)'));
        }
        
        const ids = new Set(expandedTargets.map((n: any) => n.id()));
        
        boxDataArray.push({
            box: box,
            expandedTargets: expandedTargets, 
            ids: ids,
            level: 0, 
            childBoxes: [],
            finalMinX: Infinity, finalMaxX: -Infinity, finalMinY: Infinity, finalMaxY: -Infinity,
            paddedMinX: 0, paddedMaxX: 0, paddedMinY: 0, paddedMaxY: 0,
            hasVisible: false
        });
    });

    boxDataArray.sort((a, b) => a.ids.size - b.ids.size);

    // OPTIM 7 - Le tableau est trie par taille croissante. Deux tests O(1) avant
    // la boucle complete ecartent la grande majorite des couples : un cadre plus
    // petit ou egal ne peut pas etre un sous-ensemble strict, et si le premier
    // element du petit cadre est absent du grand, c'est termine.
    for (let i = 0; i < boxDataArray.length; i++) {
        const firstId = boxDataArray[i].ids.values().next().value;
        for (let j = i + 1; j < boxDataArray.length; j++) {
            if (boxDataArray[j].ids.size <= boxDataArray[i].ids.size) continue;
            if (firstId !== undefined && !boxDataArray[j].ids.has(firstId)) continue;

            let isSubset = true;
            for (let id of boxDataArray[i].ids) {
                if (!boxDataArray[j].ids.has(id)) {
                    isSubset = false;
                    break;
                }
            }
            if (isSubset && boxDataArray[j].ids.size > boxDataArray[i].ids.size) {
                boxDataArray[j].level = Math.max(boxDataArray[j].level, boxDataArray[i].level + 1);
                boxDataArray[j].childBoxes.push(boxDataArray[i]);
            }
        }
    }

    boxDataArray.forEach(data => {
        data.expandedTargets.forEach((tNode: any) => {
            const tid = tNode.id();
            const pos = calculatedPositions.get(tid);
            if (pos && visibleNodes.has(tid)) {
                data.hasVisible = true;
                
                const nameLen = (tNode.data('name') || '').length;
                const w = layoutMode === 'comb' ? (tNode.data('renderWidth') || 100) : (nameLen * 7 + 10);
                const h = 14; 
                
                if (pos.x - w/2 < data.finalMinX) data.finalMinX = pos.x - w/2;
                if (pos.x + w/2 > data.finalMaxX) data.finalMaxX = pos.x + w/2;
                if (pos.y - h/2 < data.finalMinY) data.finalMinY = pos.y - h/2;
                if (pos.y + h/2 > data.finalMaxY) data.finalMaxY = pos.y + h/2;
            }
        });

        data.childBoxes.forEach((child: any) => {
            if (child.hasVisible) {
                if (child.paddedMinX < data.finalMinX) data.finalMinX = child.paddedMinX;
                if (child.paddedMaxX > data.finalMaxX) data.finalMaxX = child.paddedMaxX;
                if (child.paddedMinY < data.finalMinY) data.finalMinY = child.paddedMinY;
                if (child.paddedMaxY > data.finalMaxY) data.finalMaxY = child.paddedMaxY;
            }
        });

        if (data.hasVisible) {
            const fontSize = data.box.data('fontSize') || 14;
            
            const paddingLeft = layoutMode === 'comb' ? 4 : 20; 
            const paddingRight = layoutMode === 'comb' ? 35 : 20; 
            const paddingTop = layoutMode === 'comb' ? 2 : (fontSize + 15);
            const paddingBottom = layoutMode === 'comb' ? 2 : 20;

            data.paddedMinX = data.finalMinX - paddingLeft;
            data.paddedMaxX = data.finalMaxX + paddingRight;
            data.paddedMinY = data.finalMinY - paddingTop;
            data.paddedMaxY = data.finalMaxY + paddingBottom;

            data.boxW = data.paddedMaxX - data.paddedMinX;
            data.boxH = data.paddedMaxY - data.paddedMinY;
            data.boxX = (data.paddedMinX + data.paddedMaxX) / 2;
            data.boxY = (data.paddedMinY + data.paddedMaxY) / 2;
        }
    });

    boxDataArray.forEach(data => {
        const box = data.box;
        
        if (data.hasVisible) {
            let boxW = data.boxW;
            let boxH = data.boxH;
            let boxX = data.boxX;
            let boxY = data.boxY;
            
            const boxColor = box.data('boxColor') || '#FF9800';
            const fontSize = box.data('fontSize') || 14;
            const boxName = box.data('name') || '';

            let vAlign = 'center';
            let hAlign = 'center';
            let marginX = 0;
            let marginY = 0;
            let rotation = '0deg';
            
            let bgOpacity = box.data('boxOpacity') !== undefined ? box.data('boxOpacity') : 0.1;
            let bgImage = 'none';
            
            let bgFit = 'cover';
            let bgWidth = '100%';
            let bgHeight = '100%';
            let bgPosX = '50%';
            let bgPosY = '50%';
            let boxShape = box.data('boxShape') || 'round-rectangle';

            if (layoutMode === 'comb') {
                const isVertical = box.data('boxTextVertical');
                const hasGradient = box.data('boxGradient');
                
                if (boxShape === 'bracket') {
                    rotation = '0deg';
                    hAlign = 'right'; 
                    vAlign = 'center'; 
                    marginX = 15; 
                    marginY = 0;

                    const strokeW = box.data('boxBorderWidth') !== undefined ? box.data('boxBorderWidth') : 2;
                    const halfH = boxH / 2;
                    
                    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="${boxH}" viewBox="0 0 20 ${boxH}"><path d="M 0,2 L 15,2 L 15,${halfH} L 20,${halfH} M 15,${halfH} L 15,${boxH - 2} L 0,${boxH - 2}" fill="none" stroke="${boxColor}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;

                    bgImage = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
                    bgOpacity = 0; 
                    bgFit = 'none';
                    bgWidth = '20px';
                    bgHeight = `${boxH}px`;
                    bgPosX = '100%'; 
                    bgPosY = '50%';
                    
                    boxShape = 'rectangle'; 
                    box.style({ 'border-width': 0 }); 

                } else {
                    box.style({ 
                        'border-width': box.data('boxBorderWidth') !== undefined ? box.data('boxBorderWidth') : 2,
                        'border-style': box.data('boxBorderStyle') || 'dashed'
                    });

                    if (isVertical) {
                        rotation = '90deg';
                        hAlign = 'center'; 
                        vAlign = 'center'; 
                        marginX = (boxW / 2) - 10; 
                        marginY = 0;
                    } else {
                        rotation = '0deg';
                        hAlign = 'right'; 
                        vAlign = 'center'; 
                        marginX = 15; 
                        marginY = 0;
                    }
                    
                    if (hasGradient) {
                        const targetAlpha = Math.min(1, bgOpacity + 0.4); 
                        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="${boxColor}" stop-opacity="0"/><stop offset="100%" stop-color="${boxColor}" stop-opacity="${targetAlpha}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
                        bgImage = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
                        bgOpacity = 0; 
                    }
                }
            } else {
                box.style({ 
                    'border-width': box.data('boxBorderWidth') !== undefined ? box.data('boxBorderWidth') : 2,
                    'border-style': box.data('boxBorderStyle') || 'dashed'
                });

                if (boxShape === 'bracket') boxShape = 'round-rectangle';

                vAlign = 'center';
                hAlign = 'center'; 
                
                const lines = boxName.split('\n');
                const linesCount = lines.length;
                let maxLineLen = 0;
                lines.forEach((l: string) => { if (l.length > maxLineLen) maxLineLen = l.length; });
                
                const textW = maxLineLen * (fontSize * 0.55); 
                const textH = linesCount * (fontSize * 1.2);

                if (textW + 30 > boxW) boxW = textW + 30;
                if (textH + 40 > boxH) boxH = textH + 40;

                marginX = 0; 
                marginY = -(boxH / 2) + (textH / 2) + 10;
            }

            box.style('display', 'element');
            box.position({ x: boxX, y: boxY });
            
            box.style({
                'shape': boxShape,
                'width': boxW + 'px',
                'height': boxH + 'px',
                'z-index': -data.level,
                'text-valign': vAlign,
                'text-halign': hAlign,
                'text-margin-x': marginX,
                'text-margin-y': marginY,
                'text-rotation': rotation,
                'background-color': boxColor,
                'background-opacity': bgOpacity,
                'background-image': bgImage,
                'background-fit': bgFit,
                'background-width': bgWidth,
                'background-height': bgHeight,
                'background-position-x': bgPosX,
                'background-position-y': bgPosY
            });
        } else {
            box.style('display', 'none');
        }
    });
    
    // =================================================================
    // CONNEXION PARFAITE DES BRANCHES AU CENTRE DES NOEUDS
    // =================================================================
    cy.edges().forEach(e => {
        if (e.id() === 'ghost-edge') return;

        if (layoutMode === 'chrono') {
            // Geometrie appliquee plus bas, une fois les ages et les formes connus.
            return;
        }

        const isSourceAbove = e.source().data('textAbove');
        const isTargetAbove = e.target().data('isEmpty') || e.target().data('textAbove');
        
        e.style({
            'curve-style': 'taxi',
            'taxi-direction': 'rightward',
            'taxi-turn': 15,
            'taxi-turn-min-distance': 10,
            'source-endpoint': isSourceAbove ? 'inside-to-node' : 'outside-to-node',
            'target-endpoint': isTargetAbove ? 'inside-to-node' : 'outside-to-node'
        });
    });

    if (layoutMode !== 'chrono') {
        cy.edges().forEach((e: any) => {
            e.removeStyle('segment-weights segment-distances segment-radii edge-distances opacity');
        });
        cy.nodes().forEach((n: any) => {
            if (!n.hasClass('box')) {
                n.removeStyle('underlay-color underlay-opacity underlay-padding underlay-shape');
                n.data('isChrono', false);
                n.data('chronoInterval', false);
                n.data('chronoOuterWidth', 0);
                n.style({ 
                    'width': '', 'height': '', 'shape': '', 
                    'border-width': '', 'border-color': '', 
                    'background-color': '', 'background-opacity': '',
                    'text-halign': '', 'text-valign': '', 
                    'text-margin-x': '', 'text-margin-y': '',
                    'text-background-opacity': '0'
                });
            }
        });
    }

    // =================================================================
    // --- OVERRIDE CHRONOGRAMME : CALCUL DE HAUT EN BAS (POST-ORDER) ---
    // =================================================================
    cy.$('.strato-bg').remove(); 

    if (layoutMode === 'chrono' && currentRootId) {
        const pxPerMa = CHRONO_PX_PER_MA;
        const parseMa = (val: any) => parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.'));
        const PERIOD_NAMES = CHRONO_PERIOD_KEYS.map(k => t(k));

        const getStartAge = (periodStr: string) => {
            if (!periodStr) return null;
            const pLower = periodStr.toLowerCase().trim();
            for (let i = 0; i < GEO_DETAILS.length; i++) {
                const p = GEO_DETAILS[i];
                if (PERIOD_NAMES[i] && PERIOD_NAMES[i].toLowerCase() === pLower) return p.start;
                if (p.subs) {
                    for (const sub of p.subs) {
                        if (t(sub.k).toLowerCase() === pLower || sub.k.replace('geo.', '').toLowerCase() === pLower) return sub.s;
                    }
                }
            }
            const rangeMatch = periodStr.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
            if (rangeMatch) return Math.max(parseMa(rangeMatch[1]), parseMa(rangeMatch[2]));
            const singleMatch = periodStr.match(/([\d.,]+)/);
            if (singleMatch) return parseMa(singleMatch[1]);
            return null;
        };

        const nodeAges = new Map<string, number>();
        const visitingAge = new Set<string>();
        const undatedNodes = new Set<string>();

        // =====================================================================
        // ANCRAGES
        //
        // Un noeud "date" est un noeud portant une periode saisie : c'est un
        // point de calibration. Pour chaque noeud on prepare deux informations,
        // calculees UNIQUEMENT a partir des saisies de l'utilisateur (donc avant
        // tout calcul d'age) :
        //
        //   datedFloor(u)  age du plus vieux descendant DATE de u, ou null.
        //                  C'est la contrainte basse incompressible.
        //   heightBelow(u) longueur de la plus longue chaine de divergences NON
        //                  datees sous u. C'est le nombre d'intervalles a loger
        //                  entre u et sa contrainte basse.
        //
        // Ces deux valeurs permettent de savoir, avant de dater quoi que ce soit,
        // si une date saisie est reellement impossible ou simplement serree.
        // =====================================================================
        const datedFloor = new Map<string, number | null>();
        const heightBelow = new Map<string, number>();
        const undatedHeight = new Map<string, number>();
        const visitedAnchor = new Set<string>();

        const visualChildrenOf = (nId: string) => {
            const node = nodesById.get(nId);
            if (!node) return [] as any[];
            const isSheetBreak = node.data('hasNewSheet') && nId !== currentRootId;
            const isCollapsed = node.data('collapsed');
            return (isSheetBreak || isCollapsed) ? [] as any[] : (childrenMap.get(nId) || []);
        };

        const computeAnchors = (nId: string): void => {
            if (visitedAnchor.has(nId)) return;
            visitedAnchor.add(nId);

            const node = nodesById.get(nId);
            if (!node) { datedFloor.set(nId, null); heightBelow.set(nId, 0); undatedHeight.set(nId, 0); return; }

            const kids = visualChildrenOf(nId);
            kids.forEach((c: any) => computeAnchors(c.id()));

            let floor: number | null = null;
            let below = 0;
            kids.forEach((c: any) => {
                const cid = c.id();
                const cExp = getStartAge(c.data('period'));

                const cFloor = cExp !== null ? cExp : (datedFloor.get(cid) ?? null);
                if (cFloor !== null && (floor === null || cFloor > floor)) floor = cFloor;

                const cH = cExp !== null ? 0 : (undatedHeight.get(cid) ?? 0);
                if (cH > below) below = cH;
            });

            const selfDated = getStartAge(node.data('period')) !== null;
            datedFloor.set(nId, floor);
            heightBelow.set(nId, below);
            undatedHeight.set(nId, (selfDated || kids.length === 0) ? 0 : 1 + below);
        };

        cy.nodes().forEach((n: any) => {
            if (!n.hasClass('box')) computeAnchors(n.id());
        });

        // PHASE 1 - Invariant : age(parent) >= age(enfant) + SEP_MIN_MA.
        // A ecart nul la branche est de longueur nulle : le coude "taxi" degenere
        // (routage de secours) et deux barres verticales se confondent.
        // 0.25 Ma = 5 unites modele, largement au-dessus de taxi-turn (1).
        const SEP_MIN_MA = 0.25;
        const dateConflicts = new Set<string>();

        // REGLE DES GENRES
        // Un genre n'est pas un evenement de divergence : il ne se place pas
        // "15 % avant" ses especes comme un clade quelconque.
        //  - monospecifique -> il se confond avec son unique espece ;
        //  - sinon -> une toute petite avance sur la plus ancienne.
        const GENUS_RANKS = new Set(['Genre', 'Sous-genre']);
        const GENUS_LEAD_RATIO = 0.005; // 0,5 % de l'age
        const GENUS_LEAD_MIN = 0.5;     // plancher, en Ma

        // Calcul recursif (feuilles -> racine).
        // CORRECTIF MAJEUR : on descend TOUJOURS dans les enfants, meme quand le
        // noeud possede une periode explicite. L'ancienne version faisait un
        // "return" anticipe, si bien que tout le sous-arbre situe sous un noeud
        // date restait sans age -> aucun repositionnement -> branches fantomes.
        const calculateAge = (nId: string): number => {
            if (nodeAges.has(nId)) return nodeAges.get(nId)!;
            const node = nodesById.get(nId);
            if (!node) return 0;
            if (visitingAge.has(nId)) return 0; // securite anti-cycle
            visitingAge.add(nId);

            const isSheetBreak = node.data('hasNewSheet') && nId !== currentRootId;
            const isCollapsed = node.data('collapsed');
            const children = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nId) || []);

            let maxChildAge = -Infinity;
            children.forEach(c => {
                const cAge = calculateAge(c.id());
                if (cAge > maxChildAge) maxChildAge = cAge;
            });

            const explicitAge = getStartAge(node.data('period'));
            let assignedAge: number;

            if (children.length === 0) {
                if (explicitAge !== null) {
                    assignedAge = explicitAge;
                } else {
                    // Aucune information : on ne tranche PAS ici (l'ancien code
                    // renvoyait 0, ce qui projetait tout nouveau taxon a 0 Ma).
                    // La 2e passe, descendante, le placera pres de son parent.
                    undatedNodes.add(nId);
                    assignedAge = 0;
                }
            } else if (explicitAge !== null) {
                // La borne a respecter n'est PAS l'empilement calcule plus bas
                // (qui n'est qu'une valeur d'attente, redistribuee ensuite par
                // l'interpolation), mais le minimum PHYSIQUEMENT faisable :
                // le plus vieux descendant date, plus un intervalle minimal par
                // divergence non datee a intercaler.
                // Sans cette distinction, dater la racine d'une famille profonde
                // voyait sa date ecrasee par l'empilement des 15 % successifs.
                const floor = datedFloor.get(nId) ?? null;
                const minFeasible = floor === null
                    ? SEP_MIN_MA
                    : floor + SEP_MIN_MA * ((heightBelow.get(nId) ?? 0) + 1);

                if (explicitAge < minFeasible) {
                    // Reellement impossible : on corrige, et on le signale.
                    dateConflicts.add(nId);
                    assignedAge = minFeasible;
                } else {
                    assignedAge = explicitAge;
                }
            } else {
                // Enfants tous non dates : le noeud l'est aussi.
                const datedChildren = children.filter(c => !undatedNodes.has(c.id()));
                if (datedChildren.length === 0) {
                    undatedNodes.add(nId);
                    assignedAge = 0;
                } else if (GENUS_RANKS.has(node.data('rank'))) {
                    assignedAge = children.length <= 1
                        ? maxChildAge
                        : maxChildAge + Math.max(GENUS_LEAD_MIN, maxChildAge * GENUS_LEAD_RATIO);
                } else {
                    const padding = Math.max(10, maxChildAge * 0.15);
                    assignedAge = maxChildAge + padding;
                }
            }

            visitingAge.delete(nId);
            nodeAges.set(nId, assignedAge);
            return assignedAge;
        };

        // On calcule pour TOUS les noeuds (et pas seulement les racines) :
        // memoisation oblige, le cout reste lineaire.
        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            calculateAge(n.id());
        });

        // =====================================================================
        // INTERPOLATION ENTRE ANCRAGES (descendante)
        //
        // Une divergence non datee coincee entre un ancetre date et un
        // descendant date n'a aucune raison de se placer "15 % avant son plus
        // vieil enfant" : cette regle ignore l'ancetre et, sur une famille
        // profonde, finit par le depasser.
        //
        // On repartit donc l'ecart disponible sur les niveaux restants :
        //     age(u) = plancher + (ageParent - plancher) x n / (n + 1)
        // ou n est le nombre de divergences non datees restant sous u, u compris.
        // Applique de proche en proche depuis la racine, cela donne un
        // echelonnement regulier : dater la racine d'une famille et ses especes
        // suffit, les divergences intermediaires se placent seules.
        //
        // Un noeud sans ancetre date OU sans descendant date n'est pas touche :
        // il garde le comportement d'origine.
        // =====================================================================
        const interpolated = new Set<string>();

        const interpolateAges = (nId: string, parentAge: number | null, ancestorDated: boolean) => {
            if (interpolated.has(nId)) return;
            interpolated.add(nId);

            const node = nodesById.get(nId);
            if (!node) return;

            const exp = getStartAge(node.data('period'));
            const selfDated = exp !== null;
            const kids = visualChildrenOf(nId);

            let age = nodeAges.get(nId) ?? 0;

            if (!selfDated && kids.length > 0 && ancestorDated && parentAge !== null) {
                const floor = datedFloor.get(nId) ?? null;
                if (floor !== null) {
                    const levels = Math.max(1, undatedHeight.get(nId) ?? 1);
                    const span = parentAge - floor;
                    age = span > SEP_MIN_MA * (levels + 1)
                        ? floor + span * (levels / (levels + 1))
                        : floor + SEP_MIN_MA * levels;
                    nodeAges.set(nId, age);
                }
            }

            kids.forEach((c: any) => interpolateAges(c.id(), age, ancestorDated || selfDated));
        };

        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            if (n.incomers('edge').length === 0) interpolateAges(n.id(), null, false);
        });
        cy.nodes().forEach((n: any) => {
            if (!n.hasClass('box')) interpolateAges(n.id(), null, false);
        });

        // --- 2e PASSE, DESCENDANTE : placement des noeuds non dates ---------
        // Un taxon qu'on vient de creer n'a pas de periode. Plutot que de le
        // renvoyer a 0 Ma (donc a l'autre bout de la frise), on le pose juste
        // apres son parent : c'est ce qu'on attend en edition.
        const NEW_NODE_OFFSET_RATIO = 0.08; // 8 % plus jeune que le parent
        const NEW_NODE_OFFSET_MIN = 2;      // au moins 2 Ma d'ecart
        const ROOT_FALLBACK_AGE = 100;      // arbre totalement vierge

        // CORRECTION : On suit TOUS les nœuds visités, et non plus que les racines
        const visitedPlace = new Set<string>();

        const placeUndated = (nId: string, parentAge: number | null) => {
            visitedPlace.add(nId); // On marque le nœud comme traité !
            let age = nodeAges.get(nId) ?? 0;

            if (undatedNodes.has(nId)) {
                if (parentAge === null) {
                    age = ROOT_FALLBACK_AGE;
                } else {
                    const gap = Math.max(NEW_NODE_OFFSET_MIN, parentAge * NEW_NODE_OFFSET_RATIO);
                    age = Math.max(0, parentAge - gap);
                }
                nodeAges.set(nId, age);
            }

            const node = nodesById.get(nId);
            if (!node) return;
            const isSheetBreak = node.data('hasNewSheet') && nId !== currentRootId;
            const isCollapsed = node.data('collapsed');
            const children = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nId) || []);
            children.forEach(c => placeUndated(c.id(), age));
        };

        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            if (n.incomers('edge').length > 0) return; // pas une racine
            if (visitedPlace.has(n.id())) return;
            placeUndated(n.id(), null);
        });
        
        // --- 3e PASSE : regle des genres, apres coup -------------------------
        // Un genre dont l'espece etait elle aussi non datee a ete place par la
        // 2e passe AVANT son espece, donc trop tot. On recale ici, une fois tous
        // les ages connus. L'operation ne fait que RAJEUNIR le genre, elle ne
        // peut donc pas violer l'invariant de son propre parent.
        const genusFixed = new Set<string>();
        const applyGenusRule = (nId: string) => {
            if (genusFixed.has(nId)) return;
            genusFixed.add(nId);

            const node = nodesById.get(nId);
            if (!node) return;

            const isSheetBreak = node.data('hasNewSheet') && nId !== currentRootId;
            const isCollapsed = node.data('collapsed');
            const children = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nId) || []);
            children.forEach(c => applyGenusRule(c.id()));

            if (children.length === 0) return;
            if (!GENUS_RANKS.has(node.data('rank'))) return;
            if (getStartAge(node.data('period')) !== null) return; // datation explicite respectee

            let maxChildAge = -Infinity;
            children.forEach(c => {
                const a = nodeAges.get(c.id());
                if (a !== undefined && a > maxChildAge) maxChildAge = a;
            });
            if (!isFinite(maxChildAge)) return;

            nodeAges.set(nId, children.length <= 1
                ? maxChildAge
                : maxChildAge + Math.max(GENUS_LEAD_MIN, maxChildAge * GENUS_LEAD_RATIO));
        };
        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            if (n.incomers('edge').length === 0) applyGenusRule(n.id());
        });
        cy.nodes().forEach((n: any) => {
            if (!n.hasClass('box')) applyGenusRule(n.id());
        });

        // Filet de securite : sous-arbres detaches d'aucune racine detectee.
        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            // Grâce à visitedPlace, on ne touche plus aux enfants légitimes de l'arbre !
            if (undatedNodes.has(n.id()) && !visitedPlace.has(n.id())) {
                nodeAges.set(n.id(), ROOT_FALLBACK_AGE);
            }
        });

        // =====================================================================
        // PHASE 1 & 3 - GEOMETRIE DE CHAQUE NOEUD
        //
        // ORDRE IMPOSE PAR LA PHASE 9 : les bornes de la frise doivent etre
        // connues AVANT de calculer les abscisses, puisque les axes non
        // lineaires s'y calibrent. La sequence est donc :
        //   1. ages extremes  2. bornes de la frise  3. calibrage de l'axe
        //   4. abscisses et hauteurs de ligne  5. affectation des lignes
        // =====================================================================
        const CHRONO_BAR_H = 12;          // hauteur d'une barre d'intervalle
        const CHRONO_TICK_H = 14;         // hauteur du tiret d'un taxon ponctuel
        const CHRONO_ROW_MIN = 18;        // hauteur de ligne plancher
        const CHRONO_LABEL_GAP = 6;       // ecart glyphe -> etiquette
        const CHRONO_GAP_MIN = 12;        // ecart vertical de base entre 2 lignes
        const CHRONO_K_LABEL = 8;         // supplement si 2 etiquettes se recouvrent en X
        const CHRONO_K_LANE = 2;          // supplement par couloir de barre verticale

        // TAXONS VIDES : non prioritaires.
        // Un noeud sans nom (branche anonyme, ou genre efface en mode noms
        // complets) reclamait une ligne pleine et un ecart plein, exactement
        // comme un taxon nomme. Il ne porte pourtant rien a lire. Il n'obtient
        // plus que le minimum vital : sa place se deduit de celle des autres.
        const CHRONO_EMPTY_ROW = 8;       // hauteur de ligne d'un noeud vide
        const CHRONO_GAP_EMPTY = 4;       // ecart de base au contact d'un noeud vide

        // PHASE 7 - false : etiquettes collees au glyphe ("au fil").
        //           true  : toutes alignees dans une colonne a droite.
        const CHRONO_LABEL_COLUMN = false;

        type ChronoRaw = {
            startAge: number; endAge: number;
            isInterval: boolean; isLeaf: boolean; isEmpty: boolean;
            labelW: number; labelH: number;
        };
        type ChronoGeom = ChronoRaw & {
            glyphL: number; glyphR: number; rowH: number;
        };

        const chronoRaw = new Map<string, ChronoRaw>();
        const chronoGeom = new Map<string, ChronoGeom>();

        let oldestAge = 0;
        let youngestAge = Infinity;

        // --- 1. Lecture des ages et des extremes -----------------------------
        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            const startAge = nodeAges.get(n.id());
            if (startAge === undefined) return;

            const nSheetBreak = n.data('hasNewSheet') && n.id() !== currentRootId;
            const nCollapsed = n.data('collapsed');
            const visualChildren = (nSheetBreak || nCollapsed) ? [] : (childrenMap.get(n.id()) || []);
            const isLeaf = visualChildren.length === 0;
            const isEmpty = !!n.data('isEmpty');

            let endAge = startAge;
            let isInterval = false;
            const period = n.data('period');
            if (isLeaf && period && period.trim() !== '') {
                const rangeMatch = period.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
                if (rangeMatch) {
                    const a = parseMa(rangeMatch[1]);
                    const b = parseMa(rangeMatch[2]);
                    const e = Math.min(a, b);
                    if (startAge - e > 0.1) { endAge = e; isInterval = true; }
                }
            }

            chronoRaw.set(n.id(), {
                startAge, endAge, isInterval, isLeaf, isEmpty,
                labelW: isEmpty ? 0 : (n.data('labelW') || 0),
                labelH: isEmpty ? 0 : (n.data('labelH') || 0)
            });

            if (startAge > oldestAge) oldestAge = startAge;
            if (endAge < youngestAge) youngestAge = endAge;
        });

        // --- 2. BORNES DE LA FRISE : Périodes entières (Unités) --------------
        if (!isFinite(youngestAge)) youngestAge = 0;
        if (oldestAge <= 0) oldestAge = 100;

        if (chronoBoundsMode === 'tight') {
            // Bornes calculees sur le cladogramme : intervalle occupe, elargi de
            // 10 % de son amplitude.
            const span = Math.max(oldestAge - youngestAge, 1);
            const pad = span * 0.10;
            globalTimeMax = oldestAge + pad;
            globalTimeMin = Math.max(0, youngestAge - pad);
        } else {
            let snappedMax = oldestAge;
            let snappedMin = Math.max(0, youngestAge);

            // On étend au début de la période la plus ancienne touchée
            for (const period of GEO_DETAILS) {
                if (oldestAge > period.end && oldestAge <= period.start) {
                    snappedMax = period.start;
                    break;
                }
            }

            // On étend à la fin de la période la plus récente touchée
            for (const period of GEO_DETAILS) {
                if (youngestAge >= period.end && youngestAge < period.start) {
                    snappedMin = period.end;
                    break;
                }
            }

            // Si l'âge déborde dans le futur ou vaut 0, on s'arrête à 0 Ma
            if (youngestAge <= 0) snappedMin = 0;

            // Filet de sécurité pour le Précambrien profond (> 538.8 Ma, non listé)
            if (snappedMax === oldestAge && oldestAge > 538.8) {
                snappedMax = Math.ceil(oldestAge / 100) * 100;
            }

            globalTimeMax = snappedMax;
            globalTimeMin = Math.max(0, snappedMin);
        }

        // --- 3. PHASE 9 : calibrage de l'axe --------------------------------
        chronoAxisLo = globalTimeMin;
        chronoAxisHi = globalTimeMax;

        if (chronoAxisMode === 'rank') {
            // Table des rangs : tous les ages effectivement presents, dedoublonnes.
            // Les bornes de la frise y sont ajoutees pour que l'interpolation
            // couvre toute la plage affichee.
            const seen = new Set<number>();
            const ages: number[] = [];
            const push = (v: number) => {
                const r = Math.round(v * 1000) / 1000;
                if (!seen.has(r)) { seen.add(r); ages.push(r); }
            };
            push(globalTimeMin);
            push(globalTimeMax);
            chronoRaw.forEach(r => { push(r.startAge); if (r.isInterval) push(r.endAge); });
            ages.sort((a, b) => a - b);
            chronoRankAges = ages;
        } else {
            chronoRankAges = [];
        }

        // --- 4. PHASE 1 & 3 : abscisses et hauteurs de ligne ----------------
        chronoRaw.forEach((r, id) => {
            const glyphL = chronoAgeToX(r.startAge);
            const glyphR = r.isInterval ? chronoAgeToX(r.endAge)
                                        : (r.isLeaf ? glyphL + 1 : glyphL);
            const glyphH = r.isInterval ? CHRONO_BAR_H : (r.isLeaf ? CHRONO_TICK_H : 0);

            // PHASE 3 - la ligne doit contenir le glyphe ET l'etiquette.
            // L'ancien layout reprenait la hauteur de la BOITE de cladogramme
            // (~44 px) plus un yGap de 60 : des lignes a 104 px pour un glyphe
            // de 12, et un rythme irregulier des qu'un noeud etait vide.
            // Un noeud vide ne reserve que le minimum : il ne doit pas ecarter
            // les taxons nommes qui l'entourent.
            const rowH = r.isEmpty
                ? Math.max(CHRONO_EMPTY_ROW, glyphH)
                : Math.max(CHRONO_ROW_MIN, glyphH, r.labelH);

            chronoGeom.set(id, { ...r, glyphL, glyphR, rowH });
        });

        // =====================================================================
        // PHASE 2, 4 & 5 - AFFECTATION DES LIGNES
        //
        // Phase 2 : l'ordre des feuilles est l'ordre de visite d'un DFS, ce qui
        //           garantit qu'aucune branche ne se croise (les descendants d'un
        //           noeud occupent un intervalle contigu de lignes).
        // Phase 4 : l'ecart entre deux lignes s'ouvre la ou c'est necessaire :
        //             + K_LABEL si les deux etiquettes se recouvrent en X
        //                       (sinon elles peuvent etre tres proches sans gener)
        //             + K_LANE x couloirs, ou couloirs = profondeur(LCA) + 1
        //                       = nombre de barres verticales qui passent entre
        //                         les deux lignes.
        // Phase 5 : la barre verticale d'un noeud s'etend entre le PREMIER et le
        //           DERNIER de ses ENFANTS DIRECTS. Pour que la branche entrante
        //           la coupe en son milieu, il faut donc
        //               y(u) = (min y(enfant) + max y(enfant)) / 2
        //           et non la moyenne des y des enfants comme le fait fastWalk.
        //           Les deux coincident pour 2 enfants ; elles divergent des
        //           qu'il y a une polytomie a sous-arbres inegaux (enfants en
        //           y = 50, 60, 172 : moyenne 94, milieu de barre 111).
        // =====================================================================
        const chronoY = new Map<string, number>();
        const visitedY = new Set<string>();
        let cursorY = 0;
        let prevLeafId: string | null = null;
        let pendingLcaDepth = 0;

        const labelsOverlapX = (aId: string, bId: string) => {
            const a = chronoGeom.get(aId);
            const b = chronoGeom.get(bId);
            if (!a || !b) return false;
            const aRight = a.glyphR + (a.labelW > 0 ? CHRONO_LABEL_GAP + a.labelW : 0);
            const bRight = b.glyphR + (b.labelW > 0 ? CHRONO_LABEL_GAP + b.labelW : 0);
            return a.glyphL < bRight && b.glyphL < aRight;
        };

        const layoutChronoY = (nId: string, depth: number): number | null => {
            if (visitedY.has(nId)) return null; // securite anti-cycle
            visitedY.add(nId);

            const node = nodesById.get(nId);
            if (!node) return null;

            const g = chronoGeom.get(nId);
            const rowH = g ? g.rowH : CHRONO_ROW_MIN;

            const isSheetBreak = node.data('hasNewSheet') && nId !== currentRootId;
            const isCollapsed = node.data('collapsed');
            const kids = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nId) || []);

            if (kids.length === 0) {
                let gapBefore = 0;
                if (prevLeafId !== null) {
                    const prevEmpty = chronoGeom.get(prevLeafId)?.isEmpty === true;
                    const selfEmpty = g?.isEmpty === true;
                    if (prevEmpty || selfEmpty) {
                        // On conserve le terme de couloir, qui est une contrainte
                        // geometrique (des barres verticales passent la), mais on
                        // supprime l'ecart de confort et le terme d'etiquette :
                        // il n'y a aucun texte a degager.
                        gapBefore = CHRONO_GAP_EMPTY + CHRONO_K_LANE * (pendingLcaDepth + 1);
                    } else {
                        gapBefore = CHRONO_GAP_MIN
                                  + (labelsOverlapX(prevLeafId, nId) ? CHRONO_K_LABEL : 0)
                                  + CHRONO_K_LANE * (pendingLcaDepth + 1);
                    }
                }
                const y = cursorY + gapBefore + rowH / 2;
                chronoY.set(nId, y);
                cursorY = y + rowH / 2;
                prevLeafId = nId;
                return y;
            }

            // Bornes de la BARRE VERTICALE = y des enfants directs.
            let minChildY = Infinity;
            let maxChildY = -Infinity;
            kids.forEach((child: any, k: number) => {
                // En repartant sur un frere, le LCA avec la feuille precedente
                // est le noeud courant : c'est la que se compte le couloir.
                if (k > 0) pendingLcaDepth = depth;
                const childY = layoutChronoY(child.id(), depth + 1);
                if (childY !== null) {
                    if (childY < minChildY) minChildY = childY;
                    if (childY > maxChildY) maxChildY = childY;
                }
            });

            if (!isFinite(minChildY)) { // aucun enfant n'a pu etre place
                const y = cursorY + rowH / 2;
                chronoY.set(nId, y);
                cursorY = y + rowH / 2;
                return y;
            }

            const y = (minChildY + maxChildY) / 2;
            chronoY.set(nId, y);
            return y;
        };

        if (nodesById.has(currentRootId)) layoutChronoY(currentRootId, 0);

        // Colonne d'etiquettes : abscisse du glyphe terminal le plus recent.
        let chronoLeafGlyphMaxR = -Infinity;
        chronoGeom.forEach((g, id) => {
            if (g.isLeaf && chronoY.has(id) && g.glyphR > chronoLeafGlyphMaxR) {
                chronoLeafGlyphMaxR = g.glyphR;
            }
        });
        if (!isFinite(chronoLeafGlyphMaxR)) chronoLeafGlyphMaxR = 0;

        // PHASE 1 - bord droit reel du contenu, pour le bornage du pan.
        // Seules les feuilles portent desormais leur etiquette a DROITE ; celle
        // des clades passe a gauche, elle n'etend donc plus le bord droit.
        chronoContentRight = 0;
        chronoGeom.forEach((g, id) => {
            if (!chronoY.has(id)) return;
            const anchorR = (CHRONO_LABEL_COLUMN && g.isLeaf) ? chronoLeafGlyphMaxR : g.glyphR;
            const right = (g.isLeaf && g.labelW > 0) ? anchorR + CHRONO_LABEL_GAP + g.labelW : anchorR;
            if (right > chronoContentRight) chronoContentRight = right;
        });

        // =====================================================================
        // PHASE 8 - COULOIRS : separation des barres verticales confondues
        //
        // Deux divergences d'ages tres proches produisent deux barres verticales
        // superposees : on ne sait plus quel enfant appartient a quel noeud.
        //
        // Politique "fidele" (defaut) : on ne touche a rien. C'est le seul
        // comportement metriquement exact ; il suffit de zoomer.
        // Politique "lisible" : on attribue a chaque barre d'un groupe confondu
        // un numero de couloir, et on decale SEUL LE TRAIT VERTICAL. Les
        // segments horizontaux gardent leur abscisse reelle et atteignent bien
        // le glyphe de l'enfant.
        //
        // Le decalage se fait via taxi-turn, qui est precisement la distance
        // entre le centre du parent et le coude. Toutes les aretes d'un meme
        // parent partagent la valeur, donc leurs barres restent fusionnees.
        // =====================================================================
        const chronoLaneOffset = new Map<string, number>();
        chronoLaneCount = 0;

        if (chronoLanesEnabled) {
            type ChronoBar = { id: string; x: number; y1: number; y2: number; maxTurn: number };
            const bars: ChronoBar[] = [];

            chronoGeom.forEach((g, id) => {
                if (g.isLeaf || !chronoY.has(id)) return;
                const node = nodesById.get(id);
                if (!node) return;

                const isSheetBreak = node.data('hasNewSheet') && id !== currentRootId;
                const isCollapsed = node.data('collapsed');
                const kids = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(id) || []);

                let y1 = Infinity;
                let y2 = -Infinity;
                let minLen = Infinity;
                kids.forEach((c: any) => {
                    const cY = chronoY.get(c.id());
                    const cG = chronoGeom.get(c.id());
                    if (cY === undefined || !cG) return;
                    if (cY < y1) y1 = cY;
                    if (cY > y2) y2 = cY;
                    const len = cG.glyphL - g.glyphL;
                    if (len < minLen) minLen = len;
                });
                if (!isFinite(y1)) return;

                // Plafond : jamais plus de 40 % de la plus courte branche, sinon
                // getIsTooClose() rebascule taxi en routage de secours.
                const room = isFinite(minLen) ? minLen * 0.4 : 0;
                const maxTurn = Math.max(1, Math.min(CHRONO_LANE_MAX_TURN, room));

                bars.push({ id, x: g.glyphL, y1, y2, maxTurn });
            });

            bars.sort((a, b) => a.x - b.x);

            // Balayage : on ne garde actives que les barres encore proches en X,
            // et on prend le plus petit couloir libre parmi celles qui se
            // recouvrent aussi en Y.
            const active: { bar: ChronoBar; lane: number }[] = [];
            bars.forEach(bar => {
                for (let i = active.length - 1; i >= 0; i--) {
                    if (bar.x - active[i].bar.x >= CHRONO_LANE_MIN) active.splice(i, 1);
                }
                const taken = new Set<number>();
                active.forEach(a => {
                    if (bar.y1 <= a.bar.y2 && a.bar.y1 <= bar.y2) taken.add(a.lane);
                });
                let lane = 0;
                while (taken.has(lane)) lane++;
                active.push({ bar, lane });

                if (lane > 0) {
                    const offset = Math.min(lane * CHRONO_LANE_STEP, bar.maxTurn - 1);
                    if (offset > 0) {
                        chronoLaneOffset.set(bar.id, offset);
                        chronoLaneCount++;
                    }
                }
            });
        }

        // =====================================================================
        // ETIQUETTES DE CLADES : a GAUCHE de la barre verticale
        //
        // Le nom annote la branche qui MENE au clade, pas celles qui en partent :
        // il se lit donc a gauche du trait vertical, le long du segment entrant.
        // Reste a choisir de quel cote de ce segment l'ecrire, et a quelle
        // distance, pour ne croiser ni une autre branche, ni une barre verticale,
        // ni une etiquette deja posee.
        //
        // On teste quatre positions par clade (dessus, dessous, dessus eloigne,
        // dessous eloigne) et on retient la premiere sans collision ; a defaut,
        // celle qui en compte le moins. Les obstacles sont indexes par tranche
        // horizontale pour que le test reste local.
        // =====================================================================
        const CHRONO_LABEL_PAD_X = 4;   // ecart etiquette -> barre verticale
        const CHRONO_LABEL_PAD_Y = 3;   // ecart etiquette -> trait horizontal
        const OBSTACLE_BUCKET = 64;

        type Rect = { x1: number, x2: number, y1: number, y2: number };
        const obstacleBuckets = new Map<number, Rect[]>();

        const addObstacle = (r: Rect) => {
            const b1 = Math.floor(r.y1 / OBSTACLE_BUCKET);
            const b2 = Math.floor(r.y2 / OBSTACLE_BUCKET);
            for (let b = b1; b <= b2; b++) {
                let arr = obstacleBuckets.get(b);
                if (!arr) { arr = []; obstacleBuckets.set(b, arr); }
                arr.push(r);
            }
        };

        const hitsObstacle = (box: Rect): number => {
            let hits = 0;
            const b1 = Math.floor(box.y1 / OBSTACLE_BUCKET);
            const b2 = Math.floor(box.y2 / OBSTACLE_BUCKET);
            const seen = new Set<Rect>();
            for (let b = b1; b <= b2; b++) {
                const arr = obstacleBuckets.get(b);
                if (!arr) continue;
                for (const r of arr) {
                    if (seen.has(r)) continue;
                    seen.add(r);
                    if (r.x2 > box.x1 && r.x1 < box.x2 && r.y2 > box.y1 && r.y1 < box.y2) hits++;
                }
            }
            return hits;
        };

        // --- Obstacles : segments horizontaux, barres verticales, etiquettes --
        chronoGeom.forEach((g, id) => {
            if (!chronoY.has(id)) return;
            const y = chronoY.get(id)!;

            // Etiquette d'un taxon terminal (posee a droite de son glyphe)
            if (g.isLeaf && g.labelW > 0) {
                const anchorR = CHRONO_LABEL_COLUMN ? chronoLeafGlyphMaxR : g.glyphR;
                addObstacle({
                    x1: anchorR + CHRONO_LABEL_GAP, x2: anchorR + CHRONO_LABEL_GAP + g.labelW,
                    y1: y - g.rowH / 2, y2: y + g.rowH / 2
                });
            }
            // Glyphe lui-meme
            addObstacle({ x1: g.glyphL, x2: Math.max(g.glyphR, g.glyphL + 2), y1: y - 7, y2: y + 7 });

            if (g.isLeaf) return;

            const node = nodesById.get(id);
            if (!node) return;
            const isSheetBreak = node.data('hasNewSheet') && id !== currentRootId;
            const isCollapsed = node.data('collapsed');
            const kids = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(id) || []);

            const barX = g.glyphL + 1 + (chronoLaneOffset.get(id) || 0);
            let y1 = Infinity, y2 = -Infinity;
            kids.forEach((c: any) => {
                const cY = chronoY.get(c.id());
                const cG = chronoGeom.get(c.id());
                if (cY === undefined || !cG) return;
                if (cY < y1) y1 = cY;
                if (cY > y2) y2 = cY;
                // Segment horizontal parent -> enfant
                addObstacle({ x1: barX, x2: cG.glyphL, y1: cY - 1, y2: cY + 1 });
            });
            if (isFinite(y1)) addObstacle({ x1: barX - 1, x2: barX + 1, y1: y1, y2: y2 });
        });

        // --- Choix de la position de chaque nom de clade ---------------------
        const chronoLabelY = new Map<string, number>();

        const cladesToPlace: { id: string, g: ChronoGeom, y: number }[] = [];
        chronoGeom.forEach((g, id) => {
            if (g.isLeaf || g.isEmpty || g.labelW <= 0) return;
            const y = chronoY.get(id);
            if (y === undefined) return;
            cladesToPlace.push({ id, g, y });
        });
        // Ordre stable : du haut vers le bas, puis du plus ancien au plus recent.
        cladesToPlace.sort((a, b) => (a.y - b.y) || (a.g.glyphL - b.g.glyphL));

        cladesToPlace.forEach(({ id, g, y }) => {
            const h = Math.max(g.labelH, 12);
            const x2 = g.glyphL - CHRONO_LABEL_PAD_X;
            const x1 = x2 - g.labelW;

            const offsets = [
                -(h / 2 + CHRONO_LABEL_PAD_Y),
                 (h / 2 + CHRONO_LABEL_PAD_Y),
                -(h * 1.5 + CHRONO_LABEL_PAD_Y),
                 (h * 1.5 + CHRONO_LABEL_PAD_Y)
            ];

            let bestOffset = offsets[0];
            let bestHits = Infinity;
            for (const off of offsets) {
                const box: Rect = { x1, x2, y1: y + off - h / 2, y2: y + off + h / 2 };
                const hits = hitsObstacle(box);
                if (hits < bestHits) { bestHits = hits; bestOffset = off; }
                if (hits === 0) break;
            }

            chronoLabelY.set(id, bestOffset);
            // L'etiquette posee devient a son tour un obstacle pour les suivantes.
            addObstacle({ x1, x2, y1: y + bestOffset - h / 2, y2: y + bestOffset + h / 2 });
        });

        // Bord gauche reel : le nom d'un clade (la racine en particulier) deborde
        // a gauche de son glyphe. Sans cela le bornage du pan le coupait.
        chronoContentLeft = 0;
        chronoGeom.forEach((g, id) => {
            if (!chronoY.has(id)) return;
            const left = (!g.isLeaf && !g.isEmpty && g.labelW > 0)
                ? g.glyphL - CHRONO_LABEL_PAD_X - g.labelW
                : g.glyphL;
            if (left < chronoContentLeft) chronoContentLeft = left;
        });

        // =====================================================================
        // PHASE 6 & 7 - GLYPHES ET ETIQUETTES
        // =====================================================================
        const themeTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
        const CHRONO_CONFLICT_COLOR = '#d32f2f';

        cy.nodes().forEach((n: any) => {
            if (n.hasClass('box')) return;
            const g = chronoGeom.get(n.id());
            if (!g) return;

            const y = chronoY.get(n.id()) ?? calculatedPositions.get(n.id())?.y ?? 0;
            const conflict = dateConflicts.has(n.id());

            n.removeStyle('text-background-opacity text-background-color text-background-shape text-background-padding overlay-opacity');
            n.data('isChrono', true);
            n.data('chronoInterval', g.isInterval);
            n.data('chronoLeaf', g.isLeaf);
            n.data('chronoDateConflict', conflict);

            // PHASE 7 - en mode colonne, on pousse l'etiquette jusqu'a l'abscisse
            // commune ; sinon elle reste collee au glyphe.
            const labelMarginX = (CHRONO_LABEL_COLUMN && g.isLeaf)
                ? (chronoLeafGlyphMaxR - g.glyphR) + CHRONO_LABEL_GAP
                : CHRONO_LABEL_GAP;

            if (g.isInterval) {
                // La largeur se deduit des abscisses, pas de la duree : en axe
                // non lineaire les deux ne sont plus proportionnelles.
                const rectWidth = Math.max(g.glyphR - g.glyphL, 2);
                const centerX = (g.glyphL + g.glyphR) / 2;

                n.position({ x: centerX, y: y });
                n.data('chronoOuterWidth', rectWidth + 2);

                n.style({
                    'width': rectWidth,
                    'height': CHRONO_BAR_H,
                    'shape': 'rectangle',
                    'border-width': conflict ? 2 : 1,
                    'border-style': 'solid',
                    'border-color': conflict ? CHRONO_CONFLICT_COLOR : themeTextColor,
                    'background-color': '#90A4AE',
                    'background-opacity': 1,
                    'text-halign': 'right',
                    'text-valign': 'center',
                    'text-margin-x': labelMarginX,
                    'text-margin-y': 0,
                    'text-events': 'yes',
                    'underlay-opacity': 0
                });
            } else if (g.isLeaf) {
                n.position({ x: g.glyphL, y: y });
                n.data('chronoOuterWidth', 2);

                n.style({
                    'width': 2,
                    'height': g.isEmpty ? 8 : CHRONO_TICK_H,
                    'shape': 'rectangle',
                    'border-width': 0,
                    'background-color': conflict ? CHRONO_CONFLICT_COLOR : themeTextColor,
                    'background-opacity': 1,
                    'text-halign': 'right',
                    'text-valign': 'center',
                    'text-margin-x': labelMarginX,
                    'text-margin-y': 0,
                    'text-events': 'yes',
                    'underlay-opacity': 0
                });
            } else {
                n.position({ x: g.glyphL, y: y });
                n.data('chronoOuterWidth', 0.1);

                // NOEUDS INTERNES (points de divergence)
                //
                // ATTENTION : la taille de ce noeud est CRITIQUE.
                // En curve-style taxi, findEndpoints() force
                // srcManEndptVal = 'outside-to-node', qui appelle
                // intersectLineEllipse(premierCoude, centre, rx, ry).
                // Cette fonction renvoie [] des que le point vise est A
                // L'INTERIEUR de la forme :
                //     let newLength = len - 1; if (newLength < 0) return [];
                // rs.startX vaut alors undefined -> rs.badLine = true ->
                // l'arete n'est PAS DESSINEE DU TOUT. Le noeud doit donc rester
                // plus petit que taxi-turn. Le point reste visible grace a
                // underlay-*, qui n'entre pas dans outerWidth().
                n.style({
                    'width': 0.1,
                    'height': 0.1,
                    'shape': 'ellipse',
                    'border-width': 0,
                    'background-opacity': 0,
                    'underlay-color': conflict ? CHRONO_CONFLICT_COLOR : themeTextColor,
                    // PHASE 7 - un noeud vide (genre efface en mode noms complets)
                    // n'est qu'un point de routage : ni glyphe, ni point.
                    'underlay-opacity': (g.isEmpty && !conflict) ? 0 : 1,
                    'underlay-padding': 2.5,
                    'underlay-shape': 'ellipse',
                    // Le nom du clade annote la branche ENTRANTE : il se lit donc
                    // a gauche de la barre verticale. Le decalage vertical est
                    // choisi plus haut de facon a ne croiser ni branche, ni barre,
                    // ni etiquette voisine.
                    'text-halign': 'left',
                    'text-valign': 'center',
                    'text-margin-x': -CHRONO_LABEL_PAD_X,
                    'text-margin-y': chronoLabelY.get(n.id()) ?? -(CHRONO_LABEL_PAD_Y + 6),
                    'text-events': 'yes'
                });
            }
        });

        // =============================================================
        // GEOMETRIE DES BRANCHES EN CHRONOGRAMME (angles droits stricts)
        //
        // findTaxiPoints() produit, en routage "ideal", exactement DEUX points :
        //     segpts = [ x, yParent,  x, yEnfant ]   avec x = xParent + d
        // soit la barre verticale + les horizontales voulues.
        //
        // Encore faut-il ne pas declencher le routage de secours :
        //     getIsTooClose(d) = |d| < minD || |d| >= |l|
        //     isTooCloseTgt    = getIsTooClose(|l| - |d|)
        // Avec taxi-turn:'0%' on a d = 0, donc |l| - 0 >= |l| est TOUJOURS vrai
        // => secours systematique (les diagonales de la v1).
        // Avec d = 1px et minD = 0, les deux tests sont faux : routage ideal.
        // Le decalage d'1 px de la barre verticale est cache sous le point du
        // noeud parent (6 px de large).
        //
        // A noter : findEndpoints() force `overrideEndpts = self || taxi`, donc
        // source-endpoint / target-endpoint sont IGNORES en curve-style taxi.
        // C'est sans importance : 'outside-to-node' attaque la barre d'intervalle
        // par son bord gauche, ce qui est justement l'age de depart du taxon.
        // =============================================================
        cy.edges().forEach((e: any) => {
            if (e.id() === 'ghost-edge') return;
            e.removeStyle('segment-weights segment-distances segment-radii');
            // Un genre monospecifique se confond avec son espece : la branche est
            // de longueur nulle. Cytoscape la tracerait comme un artefact
            // (routage de secours sur une distance nulle) : on la masque.
            const sg = chronoGeom.get(e.source().id());
            const tg = chronoGeom.get(e.target().id());
            const degenerate = !!sg && !!tg && (tg.glyphL - sg.glyphL) < 1;

            e.style({
                'curve-style': 'taxi',
                'taxi-direction': 'rightward',
                'opacity': degenerate ? 0 : 1,
                // PHASE 8 : 1 = coude cale sur le parent ; + offset = couloir.
                'taxi-turn': 1 + (chronoLaneOffset.get(e.source().id()) || 0),
                'taxi-turn-min-distance': 0,
                'edge-distances': 'node-position', // coude cale sur le CENTRE du parent
                'source-endpoint': 'outside-to-node',
                'target-endpoint': 'outside-to-node'
            });
        });

        // =============================================================
        // DEUX CALQUES DISTINCTS
        //  - #chrono-bg    : bandes stratigraphiques, DERRIERE l'arbre
        //                    (premier enfant de #app, z-index 0)
        //  - #chrono-ruler : le ruban de la frise, DEVANT l'arbre
        //                    (dernier enfant de #app, z-index 5)
        // Rappel : #app est en position:absolute sans z-index, il ne cree donc
        // pas de contexte d'empilement ; un z-index negatif passerait derriere
        // son fond blanc opaque (c'etait la cause de la frise invisible).
        // =============================================================
        const appContainer = document.getElementById('app');

        let chronoBg = document.getElementById('chrono-bg');
        if (!chronoBg && appContainer) {
            chronoBg = document.createElement('div');
            chronoBg.id = 'chrono-bg';
            chronoBg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0; overflow:hidden; background-color:#ffffff;";
            appContainer.insertBefore(chronoBg, appContainer.firstChild);
        }

        let chronoRuler = document.getElementById('chrono-ruler');
        if (!chronoRuler && appContainer) {
            chronoRuler = document.createElement('div');
            chronoRuler.id = 'chrono-ruler';
            // Le calque EST le ruban : hauteur exacte, bornes exactes. Plus aucun
            // decalage possible entre le fond colore et les liseres.
            chronoRuler.style.cssText = "position:absolute; left:0; right:0; box-sizing:border-box; pointer-events:none; z-index:5; overflow:hidden; box-shadow:0 -4px 10px rgba(0,0,0,0.15);";
            appContainer.appendChild(chronoRuler);
        }
        if (chronoBg) chronoBg.style.display = 'block';
        if (chronoRuler) {
            // Repose a chaque layout : la constante de hauteur devient reellement
            // le seul point de reglage (le cssText n'etait applique qu'a la
            // creation de l'element).
            chronoRuler.style.bottom = CHRONO_RULER_BOTTOM + 'px';
            chronoRuler.style.height = CHRONO_RULER_H + 'px';
            chronoRuler.style.display = 'block';
        }

        // lastFrame* : etat de la derniere IMAGE (sortie rapide si rien n'a bouge)
        // built*     : etat du dernier RENDU HTML (declenche la reconstruction)
        // Confondre les deux empechait toute reconstruction pendant un
        // deplacement continu : chaque image bougeait de quelques pixels, le
        // seuil n'etait jamais franchi et la frise restait vide au-dela de la
        // fenetre initialement dessinee.
        // Etiquettes de la frise : elles vivent hors du track (donc non
        // translatees) et sont repositionnees a chaque image sur la partie
        // VISIBLE de leur bloc. C'est ce qui rend le nom de periode toujours
        // lisible, quel que soit le zoom et la position.
        type RulerLabel = { el: HTMLElement, cs: number, ce: number, minW: number };
        let rulerLabels: RulerLabel[] = [];

        const positionRulerLabels = (zoom: number, panX: number, vpW: number) => {
            for (const L of rulerLabels) {
                const xs = chronoAgeToX(L.cs) * zoom + panX;
                const xe = chronoAgeToX(L.ce) * zoom + panX;
                const visL = Math.max(xs, 2);
                const visR = Math.min(xe, vpW - 2);
                const visW = visR - visL;
                if (visW < L.minW) {
                    if (L.el.style.display !== 'none') L.el.style.display = 'none';
                    continue;
                }
                if (L.el.style.display !== 'block') L.el.style.display = 'block';
                L.el.style.left = ((visL + visR) / 2) + 'px';
                L.el.style.maxWidth = visW + 'px';
            }
        };

        let lastFrameZoom = NaN;
        let lastFramePanX = NaN;
        let builtZoom = NaN;
        let builtPanX = NaN;

        const updateChronoRuler = () => {
            const bgEl = document.getElementById('chrono-bg');
            const rulerEl = document.getElementById('chrono-ruler');
            if (!bgEl || !rulerEl) return;
            
            const zoom = cy.zoom();
            const panX = cy.pan().x;
            if (zoom === lastFrameZoom && panX === lastFramePanX) return; // rien n'a bouge
            lastFrameZoom = zoom;
            lastFramePanX = panX;
            
            const vpW = bgEl.clientWidth || cy.width();
            const themeTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';

            // Le culling est relatif au dernier RENDU, pas a la derniere image :
            // on reconstruit des qu'on s'est eloigne d'un demi-ecran de l'endroit
            // ou le HTML a ete genere.
            const needsRebuild = (zoom !== builtZoom) || isNaN(builtPanX)
                                 || Math.abs(panX - builtPanX) > vpW * 0.5
                                 || !document.getElementById('chrono-track-bg');

            if (!needsRebuild) {
                // Chemin rapide : seul le pan HORIZONTAL est repercute.
                // (translateX uniquement : la frise et le fond ne bougent
                //  jamais verticalement, comme sur un vrai chronogramme.)
                const tBg = document.getElementById('chrono-track-bg');
                const tRl = document.getElementById('chrono-track-ruler');
                if (tBg) tBg.style.transform = `translateX(${panX}px)`;
                if (tRl) tRl.style.transform = `translateX(${panX}px)`;
                // Les etiquettes ne suivent pas le track : elles se recalent sur
                // la partie visible de leur bloc.
                positionRulerLabels(zoom, panX, vpW);
                return;
            }

            builtZoom = zoom;
            builtPanX = panX;

            const viewMin = -panX - 400;
            const viewMax = vpW - panX + 400;
            const isVisible = (x: number, w: number) => (x + w) > viewMin && x < viewMax;

            // Rogne un intervalle geologique [debut, fin] sur les bornes de la
            // frise. Renvoie null si l'intervalle est entierement hors plage.
            const clipSpan = (s: number, e: number) => {
                const cs = Math.min(s, globalTimeMax);
                const ce = Math.max(e, globalTimeMin);
                if (cs <= ce) return null;
                // PHASE 9 : la frise subit EXACTEMENT la meme deformation que
                // l'arbre, sinon les bandes geologiques ne correspondent plus.
                const xs = chronoAgeToX(cs) * zoom;
                const xe = chronoAgeToX(ce) * zoom;
                return { x: xs, w: Math.max(0, xe - xs), cs: cs, ce: ce };
            };
            const showZero = globalTimeMin <= 0;

            // ---------- CALQUE 1 : bandes stratigraphiques (derriere l'arbre) ----
            let bgHtml = `<div id="chrono-track-bg" style="position:absolute; left:0; top:0; width:1px; height:100%; transform:translateX(${panX}px); transform-origin:left center;">`;
            bgHtml += `<div style="position:absolute; top:0; left:0; width:1px; bottom:${CHRONO_RULER_BOTTOM + CHRONO_RULER_H}px; pointer-events:none;">`;
            GEO_DETAILS.forEach((period: any) => {
                if (period.subs && period.subs.length > 0) {
                    period.subs.forEach((sub: any, i: number) => {
                        const c = clipSpan(sub.s, sub.e);
                        if (!c || !isVisible(c.x, c.w)) return;
                        const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                        const stageColor = adjustColorLightness(period.color, shadeAmount);
                        bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:100%; background-color:${stageColor}; opacity:0.12;"></div>`;
                        if (c.cs === sub.s) bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:1px; height:100%; background-color:${themeTextColor}; opacity:0.25;"></div>`;
                    });
                } else {
                    const c = clipSpan(period.start, period.end);
                    if (!c || !isVisible(c.x, c.w)) return;
                    bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:100%; background-color:${period.color}; opacity:0.12;"></div>`;
                    if (c.cs === period.start) bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:1px; height:100%; background-color:${themeTextColor}; opacity:0.25;"></div>`;
                }
            });
            if (showZero) bgHtml += `<div style="position:absolute; left:0px; top:0; width:1px; height:100%; background-color:${themeTextColor}; opacity:0.25;"></div>`;
            bgHtml += `</div></div>`;
            bgEl.innerHTML = bgHtml;

            // ---------- CALQUE 2 : le ruban de la frise (devant l'arbre) ---------
            // 1. fond pleine largeur   2. blocs colores   3. liseres PAR-DESSUS
            // Les liseres sont poses en dernier : ils affleurent donc toujours
            // les blocs, quel que soit l'arrondi de sous-pixel.
            const labelDefs: { name: string, cs: number, ce: number, top: number, h: number, fs: number, fw: string, ls: string, minW: number }[] = [];

            let rlHtml = `<div style="position:absolute; top:0; left:0; right:0; bottom:0; background:var(--bg-panel, #ffffff);"></div>`;
            rlHtml += `<div id="chrono-track-ruler" style="position:absolute; left:0; top:0; width:1px; height:100%; transform:translateX(${panX}px); transform-origin:left center;">`;
            rlHtml += `<div style="position:absolute; top:0; left:0; width:1px; height:${CHRONO_RULER_H}px; pointer-events:auto;">`;

            GEO_DETAILS.forEach((period: any, idx: number) => {
                if (period.subs && period.subs.length > 0) {
                    period.subs.forEach((sub: any, i: number) => {
                        const c = clipSpan(sub.s, sub.e);
                        if (!c || !isVisible(c.x, c.w)) return;
                        const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                        const stageColor = adjustColorLightness(period.color, shadeAmount);
                        const stageName = t(sub.k) !== sub.k ? t(sub.k) : sub.k.replace('geo.', '');
                        const tooltip = `${stageName} (${sub.s} - ${sub.e} Ma)`;
                        const showTick = c.w > 22 && c.cs === sub.s;
                        // Le bloc ne porte plus son texte : l'etiquette est posee
                        // dans le calque collant (voir plus bas).
                        rlHtml += `
                            <div title="${tooltip}" style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:${CHRONO_STAGE_H}px; background-color:${stageColor}; border-right:1px solid rgba(0,0,0,0.3); box-sizing:border-box; overflow:hidden; cursor:help;"></div>`;
                        labelDefs.push({ name: stageName, cs: c.cs, ce: c.ce, top: CHRONO_STAGE_H - 16, h: 14, fs: 10, fw: '700', ls: '0', minW: 34 });
                        if (showTick) {
                            rlHtml += `
                            <div style="position:absolute; left:${c.x}px; top:2px; width:1px; height:6px; background-color:#000000; z-index:2;"></div>
                            <div style="position:absolute; left:${c.x - 30}px; top:9px; width:60px; text-align:center; font-size:9px; font-weight:bold; color:#000000; z-index:2; pointer-events:none;">${sub.s}</div>`;
                        }
                    });
                }

                const pc = clipSpan(period.start, period.end);
                if (pc && isVisible(pc.x, pc.w)) {
                    const pName = PERIOD_NAMES[idx] || "";
                    const tooltip = `${pName} (${period.start} - ${period.end} Ma)`;
                    rlHtml += `
                        <div title="${tooltip}" style="position:absolute; left:${pc.x}px; top:${CHRONO_STAGE_H}px; width:${pc.w}px; height:${CHRONO_PERIOD_H}px; background-color:${period.color}; border-right:1px solid rgba(0,0,0,0.5); border-top:1px solid rgba(0,0,0,0.5); box-sizing:border-box; overflow:hidden; cursor:help;"></div>`;
                    if (pName) labelDefs.push({ name: pName, cs: pc.cs, ce: pc.ce, top: CHRONO_STAGE_H, h: CHRONO_PERIOD_H, fs: 12, fw: '900', ls: '1px', minW: 46 });
                }
            });

            if (showZero) {
                rlHtml += `
                <div style="position:absolute; left:0px; top:2px; width:1px; height:6px; background-color:#000000; z-index:2;"></div>
                <div style="position:absolute; left:-30px; top:9px; width:60px; text-align:center; font-size:9px; font-weight:bold; color:#000000; z-index:2; pointer-events:none;">0</div>`;
            }
            rlHtml += `</div></div>`;
            // Liseres haut/bas, poses APRES le track pour qu'ils passent devant.
            rlHtml += `<div style="position:absolute; top:0; left:0; right:0; height:2px; background:var(--text-main, #000);"></div>`;
            rlHtml += `<div style="position:absolute; bottom:0; left:0; right:0; height:2px; background:var(--text-main, #000);"></div>`;
            // Calque des etiquettes : hors du track, donc jamais translate.
            rlHtml += `<div id="chrono-ruler-labels" style="position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden; pointer-events:none;"></div>`;
            rulerEl.innerHTML = rlHtml;

            const labelHost = document.getElementById('chrono-ruler-labels');
            rulerLabels = [];
            if (labelHost) {
                labelDefs.forEach(def => {
                    const el = document.createElement('span');
                    el.textContent = def.name;
                    el.style.cssText = `position:absolute; top:${def.top}px; height:${def.h}px; line-height:${def.h}px;`
                        + ` transform:translateX(-50%); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`
                        + ` font-size:${def.fs}px; font-weight:${def.fw}; letter-spacing:${def.ls}; color:#000000; display:none;`;
                    labelHost.appendChild(el);
                    rulerLabels.push({ el: el, cs: def.cs, ce: def.ce, minW: def.minW });
                });
            }
            positionRulerLabels(zoom, panX, vpW);
        };
        
        lastFrameZoom = NaN;
        lastFramePanX = NaN;
        builtZoom = NaN;
        builtPanX = NaN;
        updateChronoRuler();

        // La boucle rAF prend le relais : elle suit la camera image par image,
        // quelle que soit l'origine du deplacement (scroll horizontal compris).
        chronoRulerUpdater = updateChronoRuler;
        startChronoRaf();
        
    } else {
        const bgEl = document.getElementById('chrono-bg');
        const rulerEl = document.getElementById('chrono-ruler');
        if (bgEl) bgEl.style.display = 'none';
        if (rulerEl) rulerEl.style.display = 'none';
        chronoRulerUpdater = null; // la boucle rAF s'arretera d'elle-meme
    }
    
    cy.endBatch(); 

    if (isFirstLoad || fitCamera) { 
        setTimeout(() => {
            cy.fit(cy.nodes(':visible'), 50);
            if (layoutMode === 'chrono') {
                // On laisse la place a la frise (135 px en bas) et on force un
                // redessin complet du ruban a la nouvelle echelle.
                cy.panBy({ x: 0, y: -70 });
                cy.emit('zoom');
            }
        }, 10);
        isFirstLoad = false; 
    }
  }

  async function handleGraft(file: File, targetNode: any) {
    saveState(); 
    const ext = file.name.split('.').pop()?.toLowerCase();
    const idSuffix = '-' + Date.now().toString(36); 
    const newElements: any[] = [];
    let importedRootId: string | null = null;

    if (ext === 'xmind') {
      try {
        const arrayBuffer = await file.arrayBuffer(); 
        const unzipped = unzipSync(new Uint8Array(arrayBuffer));
        const contentJsonData = unzipped['content.json']; 
        if (!contentJsonData) throw new Error(t('alert.json_not_found'));
        
        const contentStr = strFromU8(contentJsonData); 
        const xmindData = JSON.parse(contentStr); 
        const rootTopic = xmindData[0].rootTopic; 
        importedRootId = rootTopic.id + idSuffix;

        const parseNode = async (node: any, parentId: string | null, depth: number) => {
            const id = node.id + idSuffix; 
            let rawTitle = node.title || ""; 
            if (node.attributedTitle) rawTitle = node.attributedTitle.map((part: any) => part.text).join('');
            let extinct = false; 
            if (rawTitle.startsWith('\u2020 ')) { extinct = true; rawTitle = rawTitle.substring(2); } 
            else if (rawTitle.startsWith('\u2020')) { extinct = true; rawTitle = rawTitle.substring(1); }
            const styleProps = node.style?.properties || {}; 
            const isBold = styleProps["fo:font-weight"] === "700" || styleProps["fo:font-weight"] === "bold"; 
            const isItalic = styleProps["fo:font-style"] === "italic"; 
            let notes = "";
            if (node.labels && node.labels.length > 0) {
                const cleanLabels = node.labels.filter((l: string) => !l.toLowerCase().includes('extinct') && !l.includes('†'));
                if (cleanLabels.length > 0) {
                    notes = "Étiquettes XMind : " + cleanLabels.join(', ');
                }
            }
            
            let imgUrl = ""; let imgRatio = 1;
            if (node.image && node.image.src && node.image.src.startsWith("xap:resources/")) {
                const resourcePath = node.image.src.replace("xap:", ""); const imgData = unzipped[resourcePath];
                if (imgData) { 
                  const chunks = []; const chunkSize = 8192; for (let i = 0; i < imgData.length; i += chunkSize) { chunks.push(String.fromCharCode.apply(null, Array.from(imgData.subarray(i, i + chunkSize)))); } const base64 = btoa(chunks.join('')); const fileExt = resourcePath.split('.').pop()?.toLowerCase(); const mime = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' : fileExt === 'svg' ? 'image/svg+xml' : 'image/png'; 
                  imgUrl = `data:${mime};base64,${base64}`; imgRatio = await getImageRatio(imgUrl);
                }
            }
            newElements.push({ group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: id, name: rawTitle, parent: null, extinct: extinct, isBold: isBold, isItalic: isItalic, notes: notes, imgUrl: imgUrl, imgRatio: imgRatio, sortIndex: depth } });
            if (parentId) newElements.push({ group: 'edges', data: { source: parentId, target: id } });
            if (node.children && node.children.attached) { let sortCounter = 0; for (const child of node.children.attached) { await parseNode(child, id, sortCounter++); } }
        };
        await parseNode(rootTopic, null, 0); 

      } catch (err) { alert(t('alert.graft_error') + err); return; }
    } else {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const idMap: { [key: string]: string } = {};

        let elementsArray: any[] = [];
        if (Array.isArray(parsed.graph.elements)) {
            elementsArray = parsed.graph.elements;
        } else if (parsed.graph.elements) {
            elementsArray = [
                ...(parsed.graph.elements.nodes || []),
                ...(parsed.graph.elements.edges || [])
            ];
        }

        const allNodeIds = new Set<string>();
        const allTargetIds = new Set<string>();
        elementsArray.forEach((ele: any) => {
            if (ele.group === 'nodes') allNodeIds.add(ele.data.id);
            if (ele.group === 'edges') allTargetIds.add(ele.data.target);
        });

        let trueRootId = parsed.currentRootId || 'root';
        for (const id of allNodeIds) {
            if (!allTargetIds.has(id)) { 
                trueRootId = id;
                break;
            }
        }
        importedRootId = trueRootId + idSuffix;

        elementsArray.forEach((ele: any) => {
            if (ele.group === 'nodes') {
                const oldId = ele.data.id;
                const newId = oldId + idSuffix;
                idMap[oldId] = newId;
                const newParent = ele.data.parent ? ele.data.parent + idSuffix : null;
                
                newElements.push({ 
                    group: 'nodes', 
                    classes: ele.classes, 
                    data: { ...ele.data, id: newId, parent: newParent } 
                });
            }
        });

        elementsArray.forEach((ele: any) => {
            if (ele.group === 'edges') {
                if (idMap[ele.data.source] && idMap[ele.data.target]) {
                    const edgeData = { ...ele.data };
                    if (edgeData.id) edgeData.id = edgeData.id + idSuffix;
                    edgeData.source = idMap[ele.data.source];
                    edgeData.target = idMap[ele.data.target];

                    newElements.push({ group: 'edges', classes: ele.classes, data: edgeData });
                }
            }
        });
      } catch (err) { 
        alert(t('alert.phylo_error') + err); 
        return; 
      }
    }

    if (importedRootId) {
        newElements.push({ group: 'edges', data: { source: targetNode.id(), target: importedRootId } });
    }

    cy.startBatch();
    const added = cy.add(newElements);
    propagateBoxMembership(targetNode, added.filter('node').toArray());

    cy.nodes().forEach((node: any) => {
        if (node.id().endsWith(idSuffix) && !node.hasClass('box')) {
            checkAutoRank(node);
        }
    });

    refreshLayout();
    cy.endBatch();
  }

  // --- MOTEUR DE LECTURE 100% NATIF ---
  async function loadTreeFromBuffer(buffer: Uint8Array, fileName: string, filePath?: string) {
    currentFilePath = filePath;
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (ext === 'xmind') {
      currentFilePath = undefined; // Force "Save As" pour ne pas écraser le XMind
      try {
        const unzipped = unzipSync(buffer);
        const contentJsonData = unzipped['content.json']; if (!contentJsonData) throw new Error(t('alert.json_not_found'));
        const contentStr = strFromU8(contentJsonData); const xmindData = JSON.parse(contentStr); const rootTopic = xmindData[0].rootTopic; const newElements: any[] = [];
        
        const parseNode = async (node: any, parentId: string | null, depth: number) => {
            const id = node.id; let rawTitle = node.title || ""; if (node.attributedTitle) rawTitle = node.attributedTitle.map((part: any) => part.text).join('');
            let extinct = false; if (rawTitle.startsWith('\u2020 ')) { extinct = true; rawTitle = rawTitle.substring(2); } else if (rawTitle.startsWith('\u2020')) { extinct = true; rawTitle = rawTitle.substring(1); }
            const styleProps = node.style?.properties || {}; const isBold = styleProps["fo:font-weight"] === "700" || styleProps["fo:font-weight"] === "bold"; const isItalic = styleProps["fo:font-style"] === "italic"; let notes = "";
            if (node.labels && node.labels.length > 0) {
                // On filtre pour exclure les étiquettes contenant "extinct" ou "†"
                const cleanLabels = node.labels.filter((l: string) => !l.toLowerCase().includes('extinct') && !l.includes('†'));
                if (cleanLabels.length > 0) {
                    notes = "Étiquettes XMind : " + cleanLabels.join(', ');
                }
            }
            let imgUrl = ""; let imgRatio = 1;
            if (node.image && node.image.src && node.image.src.startsWith("xap:resources/")) {
                const resourcePath = node.image.src.replace("xap:", ""); const imgData = unzipped[resourcePath];
                if (imgData) { 
                  const chunks = []; const chunkSize = 8192; for (let i = 0; i < imgData.length; i += chunkSize) { chunks.push(String.fromCharCode.apply(null, Array.from(imgData.subarray(i, i + chunkSize)))); } const base64 = btoa(chunks.join('')); const fileExt = resourcePath.split('.').pop()?.toLowerCase(); const mime = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' : fileExt === 'svg' ? 'image/svg+xml' : 'image/png'; 
                  imgUrl = `data:${mime};base64,${base64}`; imgRatio = await getImageRatio(imgUrl);
                }
            }
            newElements.push({ group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: id, name: rawTitle, parent: null, extinct: extinct, isBold: isBold, isItalic: isItalic, notes: notes, imgUrl: imgUrl, imgRatio: imgRatio, sortIndex: depth } });
            if (parentId) newElements.push({ group: 'edges', data: { source: parentId, target: id } });
            if (node.children && node.children.attached) { let sortCounter = 0; for (const child of node.children.attached) { await parseNode(child, id, sortCounter++); } }
        };
        await parseNode(rootTopic, null, 0); 
        cy.startBatch();
        cy.elements().remove(); 
        cy.add(newElements); 
        currentRootId = rootTopic.id; 
        
        cy.nodes().forEach(node => {
            if (node.id() !== 'root' && !node.hasClass('box')) {
                checkAutoRank(node);
            }
        });

        refreshLayout(true);
        cy.endBatch();
        setTimeout(() => { hasUnsavedChanges = false; setUnsavedState(false); undoStack = []; redoStack = []; }, 100);
      } catch (err) { alert(t('alert.xmind_error') + err); }
    } else {
      try { 
          const decoder = new TextDecoder('utf-8');
          const text = decoder.decode(buffer);
          const parsed = JSON.parse(text); 
          const baseName = fileName.replace('.phylo', '').replace('.json', '');
          saveToRecentFiles(baseName, parsed, currentFilePath); 

          cy.startBatch();
          cy.elements().remove(); 
          cy.add(parsed.graph.elements); 
          currentRootId = parsed.currentRootId || 'root'; 
          if (parsed.theme) applyTheme(parsed.theme); 
          refreshLayout(true); 
          cy.endBatch();
          
          setTimeout(() => { hasUnsavedChanges = false; setUnsavedState(false); undoStack = []; redoStack = []; }, 100); 
      } catch (err) { alert(t('alert.corrupt_file')); } 
    }
  }

  // --- PONT POUR LE GLISSER-DÉPOSER ---
  async function handleFileOpen(file: File) {
    const filePath = (file as any).path;
    if (filePath && window.electronAPI && window.electronAPI.readFileDirect) {
        const result = await window.electronAPI.readFileDirect(filePath);
        if (result.success && result.data && result.fileName) {
            await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
        }
    } else {
        const arrayBuffer = await file.arrayBuffer();
        await loadTreeFromBuffer(new Uint8Array(arrayBuffer), file.name, undefined);
    }
    ui.fileInput.value = ''; 
  }

  function openInlineEditor(node: any, isNewNode: boolean = false) {
    if (closeCurrentEditor) closeCurrentEditor();

    isEditing = true; 
    editedNode = node;

    const input = document.createElement('textarea'); 
    input.id = 'inline-taxon-editor';
    input.value = node.data('name') || '';
    input.style.cssText = "position:fixed; top:10%; left:50%; transform:translateX(-50%); z-index:1300; padding:10px; font-size:16px; border:2px solid var(--border-color); background:var(--bg-input); color:var(--text-input); outline:none; border-radius:var(--btn-radius); box-shadow:var(--panel-shadow); resize:none; overflow:hidden; width:250px; text-align:center; white-space:pre-wrap; font-family:var(--ui-font);";    document.body.appendChild(input); 
    
    input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
    });
    input.style.height = input.scrollHeight + 'px';
    
    const commitChanges = () => {
      if (!isEditing) return; 
      isEditing = false; 
      input.onblur = null;
      
      const newValue = input.value.trim();
      if (!isNewNode) saveState(); 
      
      node.data('name', newValue); 
      checkAutoRank(node);
      
      if (ui.sidePanel.style.display === 'block' && activeNode && activeNode.id() === node.id()) { 
          const isBoxNode = node.hasClass('box');
          const newDisplayName = (!newValue || newValue === '') ? (isBoxNode ? 'Cadre' : t('default.unnamed_branch')) : newValue; 
          const newExtinctMark = node.data('extinct') && !isBoxNode && newDisplayName !== t('default.unnamed_branch') ? '\u2020 ' : ''; 
          ui.panelTitle.innerText = newExtinctMark + newDisplayName; 
      }
      
      if (document.body.contains(input)) {
          document.body.removeChild(input); 
      }
      
      editedNode = null;
      closeCurrentEditor = null;
      refreshLayout(); 
    };

    closeCurrentEditor = commitChanges;

    setTimeout(() => {
        if (!document.body.contains(input)) return;
        input.focus(); 
        input.setSelectionRange(input.value.length, input.value.length);
        input.addEventListener('blur', commitChanges);
    }, 50);

    input.addEventListener('keydown', (ev) => {
      if (ev.isComposing) return;
      
      if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey) { 
        ev.preventDefault(); 
        commitChanges(); 
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        commitChanges();
      }
      ev.stopPropagation(); 
    });
  }

  // =========================================================================
  // GESTIONNAIRES D'ÉVÉNEMENTS UI ET CYTOSCAPE
  // =========================================================================

  loadSettings();
  refreshLayout(true);
  document.fonts.ready.then(() => refreshLayout(true));

  ui.btnRecenter.onclick = () => { cy.fit(cy.nodes(':visible').not('.strato-bg'), 50); };
  ui.btnCenterRoot.onclick = () => {
      const rootNode = cy.$id(currentRootId);
      if (rootNode && rootNode.length > 0) {
          cy.animate({ center: { eles: rootNode }, zoom: 1.5 }, { duration: 300 });
      }
  };
  // Controles chronogramme (phases 8 et 9). Volontairement NON persistes dans
  // appSettings : le format de fichier n'est pas touche.
  const updateChronoToolsUI = () => {
      if (ui.chronoTools) ui.chronoTools.style.display = layoutMode === 'chrono' ? 'flex' : 'none';
      if (ui.chronoAxisSelect) ui.chronoAxisSelect.value = chronoAxisMode;
      if (ui.btnChronoLanes) {
          const on = chronoLanesEnabled;
          // Le compteur dit explicitement si le mode a change quelque chose :
          // sur un arbre ou aucune divergence n'est confondue, il affiche (0).
          ui.btnChronoLanes.innerText = on ? `${t('chrono.lanes.readable')} (${chronoLaneCount})` : t('chrono.lanes.faithful');
          ui.btnChronoLanes.style.background = on ? 'rgba(33, 150, 243, 0.12)' : 'var(--bg-input)';
          ui.btnChronoLanes.style.color = on ? '#2196F3' : 'var(--text-main)';
          ui.btnChronoLanes.style.borderColor = on ? '#2196F3' : 'var(--border-color)';
      }
      if (ui.btnChronoBounds) {
          const tight = chronoBoundsMode === 'tight';
          ui.btnChronoBounds.innerText = tight ? t('chrono.bounds.tight') : t('chrono.bounds.period');
          ui.btnChronoBounds.style.background = tight ? 'rgba(33, 150, 243, 0.12)' : 'var(--bg-input)';
          ui.btnChronoBounds.style.color = tight ? '#2196F3' : 'var(--text-main)';
          ui.btnChronoBounds.style.borderColor = tight ? '#2196F3' : 'var(--border-color)';
      }
  };

  if (ui.chronoAxisSelect) {
      ui.chronoAxisSelect.onchange = () => {
          const v = ui.chronoAxisSelect.value;
          chronoAxisMode = (v === 'sqrt' || v === 'log' || v === 'rank') ? v : 'linear';
          updateChronoToolsUI();
          if (layoutMode === 'chrono') refreshLayout(true);
      };
  }

  if (ui.btnChronoLanes) {
      ui.btnChronoLanes.onclick = () => {
          chronoLanesEnabled = !chronoLanesEnabled;
          if (layoutMode === 'chrono') refreshLayout();
          updateChronoToolsUI(); // apres le layout : chronoLaneCount est a jour
      };
  }

  if (ui.btnChronoBounds) {
      ui.btnChronoBounds.onclick = () => {
          chronoBoundsMode = chronoBoundsMode === 'tight' ? 'period' : 'tight';
          updateChronoToolsUI();
          if (layoutMode === 'chrono') refreshLayout(true);
      };
  }

  const updateLayoutButtonsUI = () => {
      ui.btnLayoutNormal.style.background = layoutMode === 'standard' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = layoutMode === 'standard' ? 'invert(1) brightness(2)' : 'none';
      
      ui.btnLayoutComb.style.background = layoutMode === 'comb' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = layoutMode === 'comb' ? 'invert(1) brightness(2)' : 'none';

      if (ui.btnLayoutChrono) {
          ui.btnLayoutChrono.style.background = layoutMode === 'chrono' ? '#2196F3' : 'var(--bg-input)';
          (ui.btnLayoutChrono.querySelector('img') as HTMLElement).style.filter = layoutMode === 'chrono' ? 'invert(1) brightness(2)' : 'none';
      }

      updateChronoToolsUI();
  };

  ui.btnLayoutNormal.onclick = () => {
      layoutMode = 'standard';
      updateLayoutButtonsUI();
      if (activeNode && activeNode.hasClass('box')) updateRibbonForNode(activeNode);
      refreshLayout(true);
  };

  ui.btnLayoutComb.onclick = () => {
      layoutMode = 'comb';
      updateLayoutButtonsUI();
      if (activeNode && activeNode.hasClass('box')) updateRibbonForNode(activeNode);
      refreshLayout(true);
  };

  ui.btnLayoutChrono.onclick = () => {
      layoutMode = 'chrono';
      updateLayoutButtonsUI();
      if (activeNode && activeNode.hasClass('box')) updateRibbonForNode(activeNode);
      refreshLayout(true);
  };

  ui.btnLayoutComb.onclick = () => {
      layoutMode = 'comb';
      ui.btnLayoutComb.style.background = '#2196F3';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = 'invert(1) brightness(2)';
      ui.btnLayoutNormal.style.background = 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = 'none';
      
      // Restaure l'état coché visuel des options du ruban selon les données mémorisées du cadre
      if (activeNode && activeNode.hasClass('box')) {
          updateRibbonForNode(activeNode);
      }
      
      refreshLayout(true);
  };
  ui.btnExpandAll.onclick = () => { saveState(); cy.nodes().data('collapsed', false); refreshLayout(); };

  if (ui.btnToggleAbbrev) {
      // Met le texte correctement au chargement
      ui.btnToggleAbbrev.innerText = appSettings.speciesFormat === 'full' ? t('topbar.btn.format.full') : t('topbar.btn.format.compact');
      
      ui.btnToggleAbbrev.onclick = () => {
          // Change la variable, sauvegarde et rafraîchit l'UI dynamique
          appSettings.speciesFormat = appSettings.speciesFormat === 'full' ? 'abbrev' : 'full';
          saveSettings();
          ui.btnToggleAbbrev.innerText = appSettings.speciesFormat === 'full' ? t('topbar.btn.format.full') : t('topbar.btn.format.compact');
          refreshLayout(false);
      };
  }

  ui.btnGuide.onclick = () => {
      window.open('https://docs.google.com/document/d/1DDLvsZN7iBfwNCN5d-rpir2A8vN5jVssbKU1yYn0424/edit?usp=sharing', '_blank');
  };
  
  const getSheetRootForNode = (node: any) => {
    let curr = node;
    while (curr.length > 0 && curr.id() !== 'root' && !curr.data('hasNewSheet') && !curr.data('isFolder')) { 
        curr = curr.incomers('node').first(); 
    }
    return curr.length > 0 ? curr.id() : 'root';
  };

  // --- MOTEUR DE RECHERCHE INTELLIGENT ET CENTRALISÉ ---
  let isCameraLocked = false;
  let cameraLockTimer: any = null;

  function focusCameraOnNode(node: any) {
      cy.stop(true, true);
      isCameraLocked = true; 
      if (cameraLockTimer) clearTimeout(cameraLockTimer);

      cy.animate({ center: { eles: node }, zoom: 1.5 }, { 
          duration: 300,
          complete: () => {
              // CORRECTION : Plus de conflit avec syncScrollbars ici !
              cameraLockTimer = setTimeout(() => { isCameraLocked = false; }, 400);
          }
      });
  }

  function getNodeSearchStrings(node: any): string[] {
      if (node.hasClass('box')) return [];
      const rawName = (node.data('name') || '').toLowerCase();
      let fullName = rawName;
      let abbrevName = rawName;
      
      const rank = node.data('rank');
      if (rank === 'Espèce' || rank === 'Sous-espèce') {
          let parentGenusNode = null;
          let curr = node.incomers('node').first();
          while(curr && curr.length > 0 && !curr.hasClass('box')) {
              if (curr.data('rank') === 'Genre') { parentGenusNode = curr; break; }
              curr = curr.incomers('node').first();
          }
          if (parentGenusNode) {
              const pName = parentGenusNode.data('name') || '';
              fullName = formatSpeciesName(node.data('name'), pName, 'full').toLowerCase();
              abbrevName = formatSpeciesName(node.data('name'), pName, 'abbrev').toLowerCase();
          }
      }
      return [rawName, fullName, abbrevName];
  }

  // OPTIM 8 - index construit a la demande puis reutilise, et frappe temporisee.
  // Avant : parcours de tous les noeuds a chaque touche, avec pour chaque espece
  // une remontee d'ancetres allouant une Collection par cran.
  const SEARCH_MAX_RESULTS = 60;
  const getSearchIndex = () => {
      if (searchIndex === null) {
          const idx: { node: any, strings: string[] }[] = [];
          cy.nodes().forEach((n: any) => {
              if (n.hasClass('box')) return;
              idx.push({ node: n, strings: getNodeSearchStrings(n) });
          });
          searchIndex = idx;
      }
      return searchIndex;
  };

  const runSearch = () => {
      const val = ui.searchInput.value.toLowerCase().trim(); 
      ui.searchDropdown.innerHTML = '';
      if (!val) { ui.searchDropdown.style.display = 'none'; return; }
      
      const matches: any[] = [];
      for (const entry of getSearchIndex()) {
          if (entry.node.removed()) continue;
          if (entry.strings.some(s => s.includes(val))) {
              matches.push(entry.node);
              if (matches.length >= SEARCH_MAX_RESULTS) break;
          }
      }
      
      if (matches.length > 0) {
          ui.searchDropdown.style.display = 'block';
          const rect = ui.searchInput.getBoundingClientRect();
          ui.searchDropdown.style.position = 'fixed';
          ui.searchDropdown.style.top = rect.bottom + 'px';
          ui.searchDropdown.style.left = rect.left + 'px';
          ui.searchDropdown.style.width = rect.width + 'px';

          matches.forEach((node: any) => {
              const item = document.createElement('div');
              item.style.cssText = "padding:6px 10px; cursor:pointer; border-bottom:1px solid var(--border-color);";
              const displayItemName = getDynamicNodeName(node);
              item.innerText = (node.data('extinct') && !displayItemName.startsWith('\u2020') ? '\u2020 ' : '') + displayItemName;
              
              item.onmouseover = () => item.style.background = 'var(--bg-hover)'; 
              item.onmouseout = () => item.style.background = 'transparent';
              item.onclick = () => { 
                  ui.searchDropdown.style.display = 'none'; 
                  ui.searchInput.value = node.data('name'); 
                  const nodeRootId = getSheetRootForNode(node); 
                  if (nodeRootId !== currentRootId) { 
                      currentRootId = nodeRootId; 
                      refreshLayout(false); 
                  } 
                  cy.$(':selected').unselect(); 
                  node.select(); 
                  focusCameraOnNode(node);
                  if (!ui.sidePanel.style.transform.includes('100%')) openSidePanelForNode(node); 
              };
              ui.searchDropdown.appendChild(item);
          });
      } else { 
          ui.searchDropdown.style.display = 'none'; 
      }
  };

  ui.searchInput.addEventListener('input', () => debounced('search', 120, runSearch));

  ui.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          const val = ui.searchInput.value.toLowerCase().trim();
          if (!val) return;
          const matches = cy.nodes().filter((n: any) => {
              if (n.hasClass('box')) return false;
              return getNodeSearchStrings(n).some(s => s.includes(val));
          });
          if (matches.length === 1) {
              const node = matches[0];
              ui.searchDropdown.style.display = 'none';
              ui.searchInput.value = node.data('name');
              const nodeRootId = getSheetRootForNode(node);
              if (nodeRootId !== currentRootId) {
                  currentRootId = nodeRootId;
                  refreshLayout(false);
              }
              cy.$(':selected').unselect();
              node.select();
              setTimeout(() => focusCameraOnNode(node), 50);
              if (!ui.sidePanel.style.transform.includes('100%')) openSidePanelForNode(node); 
              ui.searchInput.blur();
          }
      }
  });

  window.addEventListener('click', (e) => { 
      if (e.target !== ui.searchInput && !ui.searchDropdown.contains(e.target as Node)) { 
          ui.searchDropdown.style.display = 'none'; 
      } 
  });

  // --- RECHERCHE ET LIEN HYPERTEXTE : SYNONYMES ---
  ui.inpSynonymTarget.addEventListener('input', () => {
      const val = ui.inpSynonymTarget.value.toLowerCase().trim();
      ui.synonymDropdown.innerHTML = '';
      if (!val) { 
          ui.synonymDropdown.style.display = 'none'; 
          if (activeNode) {
              activeNode.data('synonymTargetId', null);
              ui.panelSubtitleSynonym.style.display = 'none';
              setUnsavedState(true);
          }
          return; 
      }
      const matches = cy.nodes().filter((n: any) => {
          if (n.hasClass('box') || (activeNode && n.id() === activeNode.id())) return false;
          return getNodeSearchStrings(n).some(s => s.includes(val));
      });
      if (matches.length > 0) {
          ui.synonymDropdown.style.display = 'block';
          matches.forEach((node: any) => {
              const item = document.createElement('div');
              item.style.cssText = "padding:6px 10px; cursor:pointer; border-bottom:1px solid var(--border-color);";
              const displayItemName = getDynamicNodeName(node);
              item.innerText = (node.data('extinct') && !displayItemName.startsWith('\u2020') ? '\u2020 ' : '') + displayItemName;
              item.onmouseover = () => item.style.background = 'var(--bg-hover)';
              item.onmouseout = () => item.style.background = 'transparent';
              item.onclick = () => {
                  ui.synonymDropdown.style.display = 'none';
                  ui.inpSynonymTarget.value = node.data('name');
                  if (activeNode) {
                      saveState();
                      activeNode.data('synonymTargetId', node.id());
                      const targetName = getDynamicNodeName(node, 'full');
                      ui.panelSubtitleSynonym.innerHTML = '= ' + targetName;
                      ui.panelSubtitleSynonym.style.display = 'block';
                      setUnsavedState(true);
                  }
              };
              ui.synonymDropdown.appendChild(item);
          });
      } else {
          ui.synonymDropdown.style.display = 'none';
      }
  });

  ui.inpSynonymTarget.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
          e.preventDefault(); e.stopPropagation();
          const val = ui.inpSynonymTarget.value.toLowerCase().trim();
          if (!val) return;
          const matches = cy.nodes().filter((n: any) => {
              if (n.hasClass('box') || (activeNode && n.id() === activeNode.id())) return false;
              return getNodeSearchStrings(n).some(s => s.includes(val));
          });
          if (matches.length >= 1) {
              const node = matches[0];
              ui.synonymDropdown.style.display = 'none';
              ui.inpSynonymTarget.value = node.data('name');
              if (activeNode) {
                  saveState();
                  activeNode.data('synonymTargetId', node.id());
                  const targetName = getDynamicNodeName(node, 'full');
                  ui.panelSubtitleSynonym.innerHTML = '= ' + targetName;
                  ui.panelSubtitleSynonym.style.display = 'block';
                  setUnsavedState(true);
              }
              ui.inpSynonymTarget.blur();
          }
      }
  });

  window.addEventListener('click', (e) => { 
      if (e.target !== ui.inpSynonymTarget && ui.synonymDropdown && !ui.synonymDropdown.contains(e.target as Node)) { 
          ui.synonymDropdown.style.display = 'none'; 
      } 
  });

  ui.panelSubtitleSynonym.onclick = () => {
      if (!activeNode) return;
      const synId = activeNode.data('synonymTargetId');
      if (synId) {
          const targetNode = cy.$id(synId);
          if (targetNode.length > 0) {
              const nodeRootId = getSheetRootForNode(targetNode); 
              if (nodeRootId !== currentRootId) { 
                  currentRootId = nodeRootId; 
                  refreshLayout(false); 
              } 
              cy.$(':selected').unselect();
              targetNode.select();
              focusCameraOnNode(targetNode);
              openSidePanelForNode(targetNode);
          }
      }
  };
  // --- FIN DE TOUTES LES RECHERCHES ---

  setTimeout(() => { isInitializing = false; }, 800);
  
  window.addEventListener('beforeunload', (e) => { 
      if (hasUnsavedChanges && !isForceClosing) { 
          e.preventDefault(); 
          e.returnValue = false; 
          
          setTimeout(() => {
              const fallbackText = "⚠️ Vous avez des modifications non sauvegardées.\nVoulez-vous vraiment quitter ?";
              const translatedText = t('confirm.quit') !== 'confirm.quit' ? t('confirm.quit') : fallbackText;
              
              const userWantsToQuit = confirm(translatedText);
              
              if (userWantsToQuit) {
                  isForceClosing = true;
                  window.close();
              }
          }, 10);
      } 
  });

  document.body.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.body.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.body.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) { handleFileOpen(e.dataTransfer.files[0]); ui.welcomeOverlay.style.display = 'none'; } });

  // La case n'a de sens que pour les formats a canal alpha : on la grise
  // pour les autres plutot que de laisser croire qu'elle agit.
  const syncTransparentOption = () => {
      if (!ui.exportTransparent || !ui.exportTransparentRow) return;
      const alpha = (ui.exportSelect.value === 'png' || ui.exportSelect.value === 'svg');
      ui.exportTransparent.disabled = !alpha;
      ui.exportTransparentRow.style.opacity = alpha ? '1' : '0.45';
      ui.exportTransparentRow.style.cursor = alpha ? 'pointer' : 'not-allowed';
  };
  ui.exportSelect?.addEventListener('change', syncTransparentOption);
  syncTransparentOption();

  ui.btnExport.onclick = async () => {
    cy.elements().unselect();
    const format = ui.exportSelect.value; 
    const scaleFactor = parseInt(ui.exportScaleSelect.value) || 1; 
    // JPEG n'a pas de canal alpha et une page PDF est blanche par nature :
    // le fond transparent ne s'applique qu'au PNG et au SVG.
    const supportsAlpha = (format === 'png' || format === 'svg');
    const wantTransparent = supportsAlpha && ui.exportTransparent?.checked !== false;
    const exportBg = wantTransparent ? 'transparent' : '#ffffff'; 
    const fileName = `phylogenie_export.${format}`;
    
    let tempChronoElements: any = cy.collection();
    let chronoLanesNeutralized = false;

    // Nettoyage commun aux trois formats.
    const finishChronoExport = () => {
        if (layoutMode !== 'chrono') return;
        cy.remove(tempChronoElements);
        if (chronoLanesNeutralized) {
            chronoLanesNeutralized = false;
            refreshLayout(); // restitue les couloirs, sans bouger la camera
        }
    };

    // 1. INJECTION TEMPORAIRE DE LA FRISE POUR L'EXPORT
    if (layoutMode === 'chrono') {
        const parseMa = (val: any) => parseFloat(String(val).replace(',', '.'));

        // PHASE 8 - les couloirs sont un artifice de lecture : on les neutralise
        // le temps de l'export pour que le fichier produit reste exact.
        if (chronoLanesEnabled) {
            chronoLanesNeutralized = true;
            cy.edges().style('taxi-turn', 1);
        }
        const PERIOD_NAMES = CHRONO_PERIOD_KEYS.map(k => t(k));
        const themeTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
        
        const bb = cy.elements(':visible').not('.export-chrono').boundingBox();
        const treeTopY = bb.y1 === Infinity ? 0 : bb.y1 - 50;
        const treeBottomY = bb.y2 === -Infinity ? 500 : bb.y2;
        const rulerStartY = treeBottomY + 80; 
        const bgHeight = rulerStartY - treeTopY;
        const bgCenterY = treeTopY + (bgHeight / 2);

        const timelineNodes: any[] = [];

        GEO_DETAILS.forEach((period: any, idx: number) => {
            if (period.subs && period.subs.length > 0) {
                period.subs.forEach((sub: any, i: number) => {
                    const sStart = parseMa(sub.s);
                    const sEnd = parseMa(sub.e);
                    if (isNaN(sStart) || isNaN(sEnd)) return;
                    
                    if (sEnd >= globalTimeMax || sStart <= globalTimeMin) return;
                    const renderStart = Math.min(globalTimeMax, sStart);
                    const renderEnd = Math.max(globalTimeMin, sEnd);
                    if (renderStart <= renderEnd) return;
                    
                    const xStart = chronoAgeToX(renderStart);
                    const xEnd = chronoAgeToX(renderEnd);
                    const w = Math.max(1, xEnd - xStart);
                    const cx = (xStart + xEnd) / 2; 
                    
                    const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                    const stageColor = adjustColorLightness(period.color, shadeAmount);
                    const stageName = t(sub.k) !== sub.k ? t(sub.k) : sub.k.replace('geo.', '');
                    
                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-bg-sub-' + idx + '-' + i, name: 'bg' },
                        position: { x: cx, y: bgCenterY },
                        style: { 'width': w, 'height': bgHeight, 'shape': 'rectangle', 'background-color': stageColor, 'background-opacity': 0.12, 'border-width': 0, 'z-index': -999, 'events': 'no', 'label': '' }
                    });
                    
                    const tickX = chronoAgeToX(renderStart);
                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-tick-sub-' + idx + '-' + i, name: 'tick' },
                        position: { x: tickX, y: bgCenterY },
                        style: { 'width': 1, 'height': bgHeight, 'shape': 'rectangle', 'background-color': themeTextColor, 'background-opacity': 0.3, 'border-width': 0, 'padding': 0, 'z-index': -998, 'events': 'no', 'label': '' }
                    });

                    // CORRECTION 1 : Le bloc de couleur n'a plus aucune bordure
                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-sub-' + idx + '-' + i, name: stageName },
                        position: { x: cx, y: rulerStartY + 20 }, 
                        style: { 'width': w, 'height': 40, 'shape': 'rectangle', 'background-color': stageColor, 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'label': w > 40 ? stageName : '', 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', 'color': '#000000', 'font-weight': 'bold', 'text-wrap': 'ellipsis', 'text-max-width': Math.max(1, w - 4), 'z-index': 100 }
                    });
                    
                    // CORRECTION 2 : On génère manuellement une ligne noire verticale épaisse de 1.5
                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-tick-' + idx + '-' + i, name: 'rulertick' },
                        position: { x: tickX, y: rulerStartY + 20 },
                        style: { 'width': 1.5, 'height': 40, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'events': 'no', 'label': '' }
                    });

                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-label-sub-' + idx + '-' + i, name: 'label' },
                        position: { x: tickX, y: rulerStartY + 5 },
                        style: { 'width': 0.1, 'height': 0.1, 'background-opacity': 0, 'border-width': 0, 'label': sStart.toString(), 'font-size': 9, 'font-weight': 'bold', 'color': '#000000', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -2, 'z-index': 105 }
                    });
                });
            }

            const pStart = parseMa(period.start);
            const pEnd = parseMa(period.end);
            if (!isNaN(pStart) && !isNaN(pEnd) && pEnd < globalTimeMax && pStart > globalTimeMin) {
                const renderStart = Math.min(globalTimeMax, pStart);
                const renderEnd = Math.max(globalTimeMin, pEnd);
                if (renderStart > renderEnd) {
                    const xStart = chronoAgeToX(renderStart);
                    const xEnd = chronoAgeToX(renderEnd);
                    const w = Math.max(1, xEnd - xStart);
                    const cx = (xStart + xEnd) / 2;
                    const pName = PERIOD_NAMES[idx] || "";
                    
                    // Boîte sans bordure
                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-per-' + idx, name: pName },
                        position: { x: cx, y: rulerStartY + 50 }, 
                        style: { 'width': w, 'height': 20, 'shape': 'rectangle', 'background-color': period.color, 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'label': w > 40 ? pName : '', 'font-size': 11, 'text-valign': 'center', 'text-halign': 'center', 'color': '#000000', 'font-weight': 'bold', 'text-wrap': 'ellipsis', 'text-max-width': Math.max(1, w - 4), 'z-index': 101 }
                    });

                    // Ligne noire verticale épaisse de 2
                    const tickX = chronoAgeToX(renderStart);
                    timelineNodes.push({
                        group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-pertick-' + idx, name: 'pertick' },
                        position: { x: tickX, y: rulerStartY + 50 },
                        style: { 'width': 2, 'height': 20, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'events': 'no', 'label': '' }
                    });
                }
            }
        });

        const firstStageEnd = parseMa(GEO_DETAILS[0]?.subs?.[0]?.e ?? GEO_DETAILS[0]?.end); 
        if (!isNaN(firstStageEnd) && firstStageEnd >= globalTimeMin && firstStageEnd <= globalTimeMax) {
            const tickX = chronoAgeToX(firstStageEnd);
            
            timelineNodes.push({
                group: 'nodes', classes: 'export-chrono', data: { id: 'export-tick-zero', name: 'tick' },
                position: { x: tickX, y: bgCenterY },
                style: { 'width': 1, 'height': bgHeight, 'shape': 'rectangle', 'background-color': themeTextColor, 'background-opacity': 0.3, 'border-width': 0, 'padding': 0, 'z-index': -998, 'events': 'no', 'label': '' }
            });

            timelineNodes.push({
                group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-tick-zero', name: 'rulertick' },
                position: { x: tickX, y: rulerStartY + 30 },
                style: { 'width': 2, 'height': 60, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'events': 'no', 'label': '' }
            });

            timelineNodes.push({
                group: 'nodes', classes: 'export-chrono', data: { id: 'export-label-zero', name: '0' },
                position: { x: tickX, y: rulerStartY + 5 },
                style: { 'width': 0.1, 'height': 0.1, 'background-opacity': 0, 'border-width': 0, 'label': firstStageEnd.toString(), 'color': '#000000', 'font-weight': 'bold', 'font-size': 9, 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -2, 'z-index': 105 }
            });
        }
        
        // CORRECTION 3 : Lignes horizontales pour encadrer la frise
        const xOldest = chronoAgeToX(globalTimeMax);
        const xYoungest = chronoAgeToX(globalTimeMin);
        const totalW = Math.max(1, xYoungest - xOldest);
        const totalCx = (xOldest + xYoungest) / 2;

        // Ligne du Haut
        timelineNodes.push({
            group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-hline-top', name: 'hline' },
            position: { x: totalCx, y: rulerStartY },
            style: { 'width': totalW, 'height': 2.5, 'shape': 'rectangle', 'background-color': '#000000', 'border-width': 0, 'padding': 0, 'z-index': 105, 'events': 'no', 'label': '' }
        });
        // Ligne du Milieu
        timelineNodes.push({
            group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-hline-mid', name: 'hline' },
            position: { x: totalCx, y: rulerStartY + 40 },
            style: { 'width': totalW, 'height': 2, 'shape': 'rectangle', 'background-color': '#000000', 'border-width': 0, 'padding': 0, 'z-index': 105, 'events': 'no', 'label': '' }
        });
        // Ligne du Bas
        timelineNodes.push({
            group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-hline-bot', name: 'hline' },
            position: { x: totalCx, y: rulerStartY + 60 },
            style: { 'width': totalW, 'height': 2.5, 'shape': 'rectangle', 'background-color': '#000000', 'border-width': 0, 'padding': 0, 'z-index': 105, 'events': 'no', 'label': '' }
        });

        tempChronoElements = cy.add(timelineNodes);
    }

    if (format === 'png' || format === 'jpeg') {
      const b64 = format === 'png' 
        ? cy.png({ full: true, bg: exportBg, scale: scaleFactor }) 
        : cy.jpg({ full: true, bg: '#ffffff', scale: scaleFactor });
      
      finishChronoExport(); 
      await window.electronAPI.saveExport(b64, fileName, format);
      
    } else if (format === 'svg') {
      const svgContent = (cy as any).svg({ full: true, bg: exportBg, scale: scaleFactor }); 
      
      finishChronoExport(); 
      await window.electronAPI.saveExport(svgContent, fileName, format);
      
    } else if (format === 'pdf') {
      const b64 = cy.png({ full: true, bg: '#ffffff', scale: scaleFactor }); 
      
      finishChronoExport(); 
      
      const img = new Image(); img.src = b64;
      img.onload = async () => {
        const orientation = img.width > img.height ? 'landscape' : 'portrait'; const doc = new jsPDF({ orientation: orientation, unit: 'mm', format: 'a4' });
        const pdfWidth = doc.internal.pageSize.getWidth(); const pdfHeight = doc.internal.pageSize.getHeight(); const ratio = Math.min(pdfWidth / img.width, pdfHeight / img.height);
        const xOffset = (pdfWidth - (img.width * ratio)) / 2; const yOffset = (pdfHeight - (img.height * ratio)) / 2;
        doc.addImage(b64, 'PNG', xOffset, yOffset, img.width * ratio, img.height * ratio); 
        const pdfDataUri = doc.output('datauristring');
        await window.electronAPI.saveExport(pdfDataUri, fileName, 'pdf');
      };
    }
  };


  // ---------------------------------------------------------------
  // Generation de classeur Excel (.xlsx) sans dependance nouvelle
  // ---------------------------------------------------------------
  type XlsxCol = { title: string; width: number };

  const xmlEsc = (v: any): string =>
      String(v ?? '')
          // Les caracteres de controle sont interdits en XML 1.0 et
          // rendraient le fichier illisible par Excel.
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const colLetter = (i: number): string => {
      let s = '';
      i += 1;
      while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); }
      return s;
  };

  const u8ToBase64 = (u8: Uint8Array): string => {
      let bin = '';
      const CHUNK = 0x8000; // par tranches, sinon la pile deborde sur un gros tableau
      for (let i = 0; i < u8.length; i += CHUNK) {
          bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + CHUNK)) as any);
      }
      return btoa(bin);
  };

  const buildXlsx = (sheetName: string, cols: XlsxCol[], rows: { v: string, italic?: boolean }[][]): Uint8Array => {
      const nCols = cols.length;
      const lastCol = colLetter(nCols - 1);
      const nRows = rows.length + 1;
      // Excel refuse certains caracteres dans un nom d'onglet, et le limite a 31.
      const safeSheet = (sheetName || 'Data').replace(/[\\\/\?\*\[\]:]/g, ' ')
                          .replace(/\s+/g, ' ').trim().slice(0, 31).trim() || 'Data';

      const colsXml = cols.map((c, i) =>
          `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`).join('');

      const headXml = '<row r="1" ht="26" customHeight="1">' + cols.map((c, i) =>
          `<c r="${colLetter(i)}1" s="1" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.title)}</t></is></c>`).join('') + '</row>';

      const bodyXml = rows.map((r, ri) => {
          const cells = r.map((cell, ci) => {
              const txt = xmlEsc(cell.v);
              if (txt === '') return '';
              return `<c r="${colLetter(ci)}${ri + 2}" s="${cell.italic ? 3 : 2}" t="inlineStr">`
                   + `<is><t xml:space="preserve">${txt}</t></is></c>`;
          }).join('');
          return `<row r="${ri + 2}">${cells}</row>`;
      }).join('');

      const sheet =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastCol}${nRows}"/><sheetViews><sheetView tabSelected="1" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${colsXml}</cols><sheetData>${headXml}${bodyXml}</sheetData><autoFilter ref="A1:${lastCol}${nRows}"/></worksheet>`;

      const styles =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font><font><i/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E5A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

      const workbook =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEsc(safeSheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;

      const contentTypes =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

      const rootRels =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

      const wbRels =
`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

      return zipSync({
          '[Content_Types].xml': strToU8(contentTypes),
          '_rels/.rels': strToU8(rootRels),
          'xl/workbook.xml': strToU8(workbook),
          'xl/_rels/workbook.xml.rels': strToU8(wbRels),
          'xl/styles.xml': strToU8(styles),
          'xl/worksheets/sheet1.xml': strToU8(sheet)
      }, { level: 6 });
  };

  document.getElementById('cmenu-compile')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode) { ui.compileModal.style.display = 'flex'; } });
  document.getElementById('compile-cancel')?.addEventListener('click', () => ui.compileModal.style.display = 'none');
  document.getElementById('compile-generate')?.addEventListener('click', () => { 
    ui.compileModal.style.display = 'none'; 
    if (!activeNode) return; 
    
    const targetRank = (document.getElementById('compile-rank') as HTMLSelectElement).value; 
    let nodesToCompile = activeNode.union(activeNode.successors('node')); 
    if (targetRank !== 'Tous') { 
        nodesToCompile = nodesToCompile.filter((n: any) => n.data('rank') === targetRank); 
    } 
    
    let htmlContent = ''; 
    currentXlsxRows = [];
    currentXlsxTitle = activeNode.data('name') || t('table.sheet_name');
    let csvContent = `${t('label.name')};${t('label.status')};${t('label.rank')};${t('label.period')};${t('label.author')};${t('label.date')};${t('label.size')};${t('label.mass')};${t('label.dist')};${t('label.iucn')};${t('label.diagnose')};${t('label.synapo')};${t('label.notes')};${t('label.biblio')}\n`; 
    const escapeCSV = (str: string) => `"${(str || '').replace(/"/g, '""')}"`; 
    
    nodesToCompile.forEach((n: any) => { 
      if (!n.data('name') || n.data('name').trim() === '' || n.hasClass('box')) return; 
      const d = n.data(); 
      const displayName = (d.extinct ? '\u2020 ' : '') + d.name; 
      
      const displayRank = t('rank.' + d.rank) !== ('rank.' + d.rank) ? t('rank.' + d.rank) : (d.rank || '');
      const displayStatus = t('data.' + d.status?.toLowerCase()) !== ('data.' + d.status?.toLowerCase()) ? t('data.' + d.status?.toLowerCase()) : (d.status || '');

      htmlContent += `<tr style="border-bottom:1px solid var(--border-color);"><td style="padding:6px; border:1px solid var(--border-color); font-style:${d.isItalic?'italic':'normal'}; font-weight:${d.isBold?'bold':'normal'};">${displayName}</td><td style="padding:6px; border:1px solid var(--border-color);">${displayStatus}</td><td style="padding:6px; border:1px solid var(--border-color);">${displayRank}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.period || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.author || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.discoveryDate || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.size || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.mass || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.distribution || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.diagnose || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.synapomorphies || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.notes || ''}</td><td style="padding:6px; border:1px solid var(--border-color);">${d.biblio || ''}</td></tr>`; 
      
      csvContent += `${escapeCSV(displayName)};${escapeCSV(displayStatus)};${escapeCSV(displayRank)};${escapeCSV(d.period)};${escapeCSV(d.author)};${escapeCSV(d.discoveryDate)};${escapeCSV(d.size)};${escapeCSV(d.mass)};${escapeCSV(d.distribution)};${escapeCSV(d.iucn)};${escapeCSV(d.diagnose)};${escapeCSV(d.synapomorphies)};${escapeCSV(d.notes)};${escapeCSV(d.biblio)}\n`; 

      // Meme contenu, conserve tel quel pour le classeur Excel. Le nom du
      // taxon garde son italique, comme dans le tableau a l'ecran.
      currentXlsxRows.push([
          { v: displayName, italic: !!d.isItalic }, { v: displayStatus }, { v: displayRank },
          { v: d.period }, { v: d.author }, { v: d.discoveryDate }, { v: d.size },
          { v: d.mass }, { v: d.distribution }, { v: d.iucn }, { v: d.diagnose },
          { v: d.synapomorphies }, { v: d.notes }, { v: d.biblio }
      ]); 
    });
    
    const tbody = document.getElementById('data-table-body'); 
    if(tbody) tbody.innerHTML = htmlContent; 
    currentCSVData = csvContent; 
    
    const title = document.getElementById('table-title'); 
    if(title) title.innerText = `${t('compile.table_data')} ${activeNode.data('name')} (${targetRank})`; 
    ui.tableModal.style.display = 'flex'; 
  });
  document.getElementById('table-close')?.addEventListener('click', () => ui.tableModal.style.display = 'none');
  document.getElementById('table-export')?.addEventListener('click', async () => { 
      const csvData = '\uFEFF' + currentCSVData; 
      await window.electronAPI.saveExport(csvData, `export_${activeNode.data('name')}.csv`, 'csv');
  });

  // --- Bouton d'export Excel ---------------------------------------
  (() => {
      const csvBtn = document.getElementById('table-export');
      if (!csvBtn || document.getElementById('table-export-xlsx')) return;

      const btn = document.createElement('button');
      btn.id = 'table-export-xlsx';
      btn.innerText = t('table.export_xlsx');
      btn.style.cssText = csvBtn.getAttribute('style') || '';
      btn.style.background = '#1F6FEB';
      csvBtn.parentElement?.insertBefore(btn, csvBtn);

      btn.addEventListener('click', async () => {
          // Largeurs choisies champ par champ : c'est tout l'interet du
          // classeur par rapport au CSV, ou Excel donne la meme a toutes.
          const cols = [
              { title: t('label.name'),     width: 34 },
              { title: t('label.status'),   width: 16 },
              { title: t('label.rank'),     width: 22 },
              { title: t('label.period'),   width: 18 },
              { title: t('label.author'),   width: 20 },
              { title: t('label.date'),     width: 14 },
              { title: t('label.size'),     width: 14 },
              { title: t('label.mass'),     width: 12 },
              { title: t('label.dist'),     width: 36 },
              { title: t('label.iucn'),     width: 24 },
              { title: t('label.diagnose'), width: 46 },
              { title: t('label.synapo'),   width: 46 },
              { title: t('label.notes'),    width: 46 },
              { title: t('label.biblio'),   width: 36 }
          ];
          try {
              const zip = buildXlsx(currentXlsxTitle, cols, currentXlsxRows);
              const uri = 'data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,'
                        + u8ToBase64(zip);
              const res = await window.electronAPI.saveExport(uri, `export_${currentXlsxTitle || 'data'}.xlsx`, 'xlsx');
              if (res && res.success === false && !res.canceled) throw new Error(res.error || 'saveExport failed');
          } catch (err) {
              console.error('XLSX export failed:', err);
              alert(t('alert.xlsx_error'));
          }
      });
  })();
  ui.btnExportFiche.onclick = async () => {
    if (!activeNode) return;
    const doc = new jsPDF(); 
    const d = activeNode.data(); 
    
    let frameColor = appSettings.ficheColor;
    const r = parseInt(frameColor.slice(1, 3), 16);
    const g = parseInt(frameColor.slice(3, 5), 16);
    const b = parseInt(frameColor.slice(5, 7), 16);

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness < 128 ? 255 : 0;

    let y = 20;
    const boxW = 170; 
    
    doc.setFont('times', d.isItalic ? 'italic' : 'bold');
    doc.setFontSize(22);
    const displayName = (d.extinct ? '\u2020 ' : '') + (d.name || t('default.unnamed_taxon'));
    const splitName = doc.splitTextToSize(displayName, boxW - 10);
    
    let boxH = 6 + (splitName.length * 8); 
    
    let authorDate = [];
    if (d.author && d.author.trim() !== '') authorDate.push(d.author);
    if (d.discoveryDate && d.discoveryDate.trim() !== '') authorDate.push(d.discoveryDate);
    
    let splitAuthor: string[] = [];
    if (authorDate.length > 0) {
        doc.setFont('times', 'italic');
        doc.setFontSize(12);
        splitAuthor = doc.splitTextToSize(authorDate.join(', '), boxW - 10);
        boxH += splitAuthor.length * 5;
    }

    let synNameStr = '';
    if (d.synonymTargetId) {
        const tNode = cy.$id(d.synonymTargetId);
        if (tNode.length > 0) {
            synNameStr = '= ' + getDynamicNodeName(tNode, 'full');
            boxH += 7; // On agrandit le cadre du titre
        }
    }
    
    boxH += 4;

    doc.setFillColor(r, g, b);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(20, y, boxW, boxH, 'FD');
    
    doc.setTextColor(textColor);
    
    let textY = y + 10;
    doc.setFont('times', d.isItalic ? 'italic' : 'bold');
    doc.setFontSize(22);
    doc.text(splitName, 25, textY);
    
    textY += (splitName.length * 8);

    if (splitAuthor.length > 0) {
        doc.setFont('times', 'italic');
        doc.setFontSize(12);
        doc.text(splitAuthor, 25, textY - 2);
        textY += (splitAuthor.length * 5); // Décalage vers le bas
    }

    if (synNameStr !== '') {
        doc.setFont('times', 'italic');
        doc.setFontSize(14);
        doc.setTextColor(33, 150, 243); // Bleu hypertexte
        doc.text(synNameStr, 25, textY - 1);
    }

    y += boxH + 10;
    doc.setTextColor(0, 0, 0);
    doc.setFont('times', 'normal');

    if (d.sheetImage && d.sheetImageRatio) {
        const maxWidth = 170; 
        const maxHeight = 80; 
        let imgW = maxWidth;
        let imgH = imgW / d.sheetImageRatio;

        if (imgH > maxHeight) {
            imgH = maxHeight;
            imgW = imgH * d.sheetImageRatio;
        }

        if (y + imgH > 275) { doc.addPage(); y = 20; }
        
        const imgX = 20 + (maxWidth - imgW) / 2; 
        const formatStr = d.sheetImage.substring(d.sheetImage.indexOf('/') + 1, d.sheetImage.indexOf(';')).toUpperCase();
        const safeFormat = formatStr === 'JPEG' || formatStr === 'JPG' ? 'JPEG' : 'PNG';
        
        doc.addImage(d.sheetImage, safeFormat, imgX, y, imgW, imgH);
        y += imgH + 3;

        if (d.imgCredits && d.imgCredits.trim() !== '') {
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150); 
            doc.setFont('times', 'italic');
            const textWidth = doc.getTextWidth(d.imgCredits);
            doc.text(d.imgCredits, 20 + (maxWidth - textWidth) / 2, y + 2); 
            doc.setFont('times', 'normal');
            doc.setTextColor(0, 0, 0); 
            y += 6;
        } else {
            y += 4;
        }
        y += 6;
    }

    doc.setFontSize(11);
    let periodFormatted = d.period || '';
    periodFormatted = periodFormatted.replace(/Cambrien/gi, 'C').replace(/Précambrien/gi, 'PréC').replace(/\uA792/g, 'C');
    
    if (periodFormatted.trim() !== '') {
        doc.setFont('times', 'bold'); doc.text('Période :', 20, y); doc.setFont('times', 'normal');
        doc.text(periodFormatted, 55, y);
        y += 8;
    }

    if (appSettings.pdfTimeline) {
        if (y > 250) { doc.addPage(); y = 20; } 
        const startX = 20; const timelineWidth = 170; const timelineHeight = 8;
        doc.setFontSize(7); doc.setLineWidth(0.1);
        
        // 1. Analyse et décodage de la période pour choisir la frise
        const parseMa = (s: string) => parseFloat(s.replace(',', '.'));
        let pStart: number | null = null; 
        let pEnd: number | null = null;
        
        if (d.period) {
            const rangeMatch = d.period.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
            if (rangeMatch) {
                pStart = parseMa(rangeMatch[1]); pEnd = parseMa(rangeMatch[2]);
            } else {
                const singleMatch = d.period.match(/([\d.,]+)/);
                if (singleMatch) {
                    pStart = parseMa(singleMatch[1]); pEnd = pStart;
                }
            }
        }

        if (pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd) && pStart < pEnd) { 
            const temp = pStart; pStart = pEnd; pEnd = temp; 
        }

        // Détection du mode : Précambrien profond (> 541 Ma)
        const isDeepPrecambrian = (pStart !== null && pStart > 541) || (pEnd !== null && pEnd > 541);

        if (isDeepPrecambrian) {
            // --- MODE PDF : PRÉCAMBRIEN PROFOND (0 - 4500 Ma) ---
            const precambrianPeriods = [
                { abbr: "Had", start: 4500, end: 4000, hex: "6A5ACD" },
                { abbr: "Arch", start: 4000, end: 2500, hex: "A020F0" },
                { abbr: "Prot", start: 2500, end: 538.8, hex: "F08080" },
                { abbr: "Phan", start: 538.8, end: 0, hex: "99C68E" }
            ];

            precambrianPeriods.forEach(p => {
                const pctWidth = ((p.start - p.end) / 4500) * timelineWidth;
                const pctLeft = ((4500 - p.start) / 4500) * timelineWidth;
                const pr = parseInt(p.hex.substring(0,2), 16); const pg = parseInt(p.hex.substring(2,4), 16); const pb = parseInt(p.hex.substring(4,6), 16);
                
                doc.setFillColor(pr, pg, pb);
                doc.rect(startX + pctLeft, y, pctWidth, timelineHeight, 'FD');
                doc.setTextColor(255, 255, 255); // Texte blanc pour lisibilité sur couleurs sombres
                if (pctWidth > 4) { doc.setFont('times', 'bold'); doc.text(p.abbr, startX + pctLeft + (pctWidth/2) - 1.5, y + 5.5); }
            });

            // Dessin de l'indicateur rouge sur l'échelle 4500 Ma
            if (pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd)) {
                const iStart = Math.min(4500, Math.max(0, pStart)); const iEnd = Math.min(4500, Math.max(0, pEnd));
                const iWidth = pStart === pEnd ? 0 : ((iStart - iEnd) / 4500) * timelineWidth;
                const iLeft = ((4500 - iStart) / 4500) * timelineWidth;

                doc.setDrawColor(255, 0, 0); 
                if (pStart === pEnd) {
                    doc.setLineWidth(0.5);
                    doc.line(startX + iLeft, y, startX + iLeft, y + timelineHeight); 
                } else {
                    doc.setLineWidth(0.8);
                    doc.line(startX + iLeft, y + timelineHeight, startX + iLeft + iWidth, y + timelineHeight); 
                }
                doc.setDrawColor(0,0,0); doc.setLineWidth(0.1); 
            }
        } else {
            // --- MODE PDF : PHANÉROZOÏQUE CLASSIQUE (0 - 600 Ma) ---
            const periods = [
                { abbr: "PréC", start: 600, end: 541, hex: "F08080" }, { abbr: "C", start: 541, end: 485, hex: "99C68E" },
                { abbr: "O", start: 485, end: 443, hex: "009270" }, { abbr: "S", start: 443, end: 419, hex: "B3E1B6" },
                { abbr: "D", start: 419, end: 358, hex: "CB8C37" }, { abbr: "C", start: 358, end: 298, hex: "67A599" },
                { abbr: "P", start: 298, end: 252, hex: "F04028" }, { abbr: "T", start: 252, end: 201, hex: "812B92" },
                { abbr: "J", start: 201, end: 145, hex: "34B2C9" }, { abbr: "K", start: 145, end: 66, hex: "7FC64E" },
                { abbr: "Pg", start: 66, end: 23, hex: "FD9A52" }, { abbr: "Ng", start: 23, end: 2.5, hex: "FFE619" },
                { abbr: "Q", start: 2.5, end: 0, hex: "F9F97F" }
            ];

            periods.forEach(p => {
                const pctWidth = ((p.start - p.end) / 600) * timelineWidth;
                const pctLeft = ((600 - p.start) / 600) * timelineWidth;
                const pr = parseInt(p.hex.substring(0,2), 16); const pg = parseInt(p.hex.substring(2,4), 16); const pb = parseInt(p.hex.substring(4,6), 16);
                
                doc.setFillColor(pr, pg, pb);
                doc.rect(startX + pctLeft, y, pctWidth, timelineHeight, 'FD');
                doc.setTextColor(0,0,0);
                if (pctWidth > 4) { doc.setFont('times', 'normal'); doc.text(p.abbr, startX + pctLeft + (pctWidth/2) - 1.5, y + 5.5); }
            });

            // Dessin de l'indicateur rouge sur l'échelle 600 Ma
            if (pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd)) {
                const iStart = Math.min(600, Math.max(0, pStart)); const iEnd = Math.min(600, Math.max(0, pEnd));
                const iWidth = pStart === pEnd ? 0 : ((iStart - iEnd) / 600) * timelineWidth;
                const iLeft = ((600 - iStart) / 600) * timelineWidth;

                doc.setDrawColor(255, 0, 0); 
                if (pStart === pEnd) {
                    doc.setLineWidth(0.5);
                    doc.line(startX + iLeft, y, startX + iLeft, y + timelineHeight); 
                } else {
                    doc.setLineWidth(0.8);
                    doc.line(startX + iLeft, y + timelineHeight, startX + iLeft + iWidth, y + timelineHeight); 
                }
                doc.setDrawColor(0,0,0); doc.setLineWidth(0.1); 
            }
        }
        // --- 2. DESSIN DE LA FRISE ZOOMÉE DANS LE PDF ---
        if (!isDeepPrecambrian && pStart !== null && pEnd !== null && !isNaN(pStart) && !isNaN(pEnd)) {
            const intersectingPeriods = GEO_DETAILS.filter(p => (pStart! > p.end && pEnd! < p.start));
            
            if (intersectingPeriods.length > 0 && intersectingPeriods.length <= 2) {
                y += timelineHeight + 4; // Petit espace sous la frise principale
                
                intersectingPeriods.sort((a, b) => b.start - a.start);
                const zoomStart = intersectingPeriods[0].start;
                const zoomEnd = intersectingPeriods[intersectingPeriods.length - 1].end;
                const zoomDuration = zoomStart - zoomEnd;
                
                intersectingPeriods.forEach((period) => {
                    period.subs.forEach((sub, i) => {
                        const subDuration = sub.s - sub.e;
                        const subWidth = (subDuration / zoomDuration) * timelineWidth;
                        const subLeft = ((zoomStart - sub.s) / zoomDuration) * timelineWidth;
                        
                        // Mêmes dégradés calculés que sur l'interface UI
                        const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                        const stageColor = adjustColorLightness(period.color, shadeAmount);
                        const pr = parseInt(stageColor.substring(1,3), 16);
                        const pg = parseInt(stageColor.substring(3,5), 16);
                        const pb = parseInt(stageColor.substring(5,7), 16);
                        
                        doc.setFillColor(pr, pg, pb);
                        doc.setDrawColor(0,0,0); doc.setLineWidth(0.1);
                        doc.rect(startX + subLeft, y, subWidth, timelineHeight, 'FD');
                        
                        if (subWidth > 8) {
                            doc.setTextColor(0, 0, 0);
                            doc.setFontSize(6);
                            const stageName = t(sub.k); 
                            const textW = doc.getTextWidth(stageName);
                            if (textW < subWidth - 1) {
                                doc.text(stageName, startX + subLeft + (subWidth - textW) / 2, y + 5.5);
                            }
                        }
                    });
                });

                // Dessin de l'indicateur rouge sur le PDF zoomé
                const zDisplayStart = Math.min(zoomStart, Math.max(zoomEnd, pStart!));
                const zDisplayEnd = Math.min(zoomStart, Math.max(zoomEnd, pEnd!));
                const zWidth = pStart === pEnd ? 0 : ((zDisplayStart - zDisplayEnd) / zoomDuration) * timelineWidth;
                const zLeft = ((zoomStart - zDisplayStart) / zoomDuration) * timelineWidth;

                doc.setDrawColor(255, 0, 0); 
                if (pStart === pEnd) {
                    doc.setLineWidth(0.5);
                    doc.line(startX + zLeft, y, startX + zLeft, y + timelineHeight); 
                } else {
                    doc.setLineWidth(0.8);
                    doc.line(startX + zLeft, y + timelineHeight, startX + zLeft + zWidth, y + timelineHeight); 
                }
                doc.setDrawColor(0,0,0); doc.setLineWidth(0.1); 
            }
        }

        y += timelineHeight + 10; // Espacement final avant le texte (Diagnose etc.)
    }

    doc.setFontSize(11);
    const addLine = (label: string, text: string) => {
      if (text && text.trim() !== '') {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.setFont('times', 'bold'); doc.text(label, 20, y); doc.setFont('times', 'normal');
        const cleanText = text.replace(/<[^>]+>/g, '');
        const splitText = doc.splitTextToSize(cleanText, 130); 
        doc.text(splitText, 55, y); 
        y += 6 * splitText.length + 2;
      }
    };

    if (d.status && d.status !== 'Valide' && d.status !== '') {
        doc.setFont('times', 'bold');
        if (d.status === 'Synonyme') {
            doc.text(`= ${t('status.synonym')}`, 20, y);
        } else {
            // Le statut lui-même est déjà traduit dans displayStatus si on utilisait une variable, 
            // mais on s'assure de traduire au moins le mot "Statut"
            const displayStatus = t('data.' + d.status.toLowerCase()) !== ('data.' + d.status.toLowerCase()) ? t('data.' + d.status.toLowerCase()) : d.status;
            doc.text(`${t('label.status')} : ${displayStatus}`, 20, y);
        }
        doc.setFont('times', 'normal');
        y += 8;
    }

    addLine('Rang :', d.rank); 
    addLine('Répartition :', d.distribution); 
    addLine('Taille :', d.size); 
    addLine('Masse :', d.mass); 
    if (!d.extinct && d.iucn && d.iucn.trim() !== '') { addLine('Menace IUCN :', d.iucn); }
    
    y += 4;

    const addTextBlock = (title: string, text: string) => {
        if (text && text.trim() !== '') {
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFont('times', 'bold');
            doc.text(title, 20, y);
            doc.setFont('times', 'normal');
            y += 6;
            const cleanText = text.replace(/<[^>]+>/g, '');
            const splitText = doc.splitTextToSize(cleanText, 170);
            doc.text(splitText, 20, y);
            y += 6 * splitText.length + 6;
        }
    };

    addTextBlock('Diagnose :', d.diagnose);
    addTextBlock('Synapomorphies :', d.synapomorphies);
    addTextBlock('Notes :', d.notes);

    // MOTEUR DE LIENS HYPERTEXTES POUR LA BIBLIOGRAPHIE
    const addBiblioBlock = (title: string, text: string) => {
        if (text && text.trim() !== '') {
            if (y > 260) { doc.addPage(); y = 20; }
            doc.setFont('times', 'bold');
            doc.text(title, 20, y);
            doc.setFont('times', 'normal');
            y += 6;
            
            const lines = text.split('\n');
            lines.forEach((line: string) => {
                const cleanLine = line.replace(/<[^>]+>/g, '');
                const splitLine = doc.splitTextToSize(cleanLine, 170);
                
                splitLine.forEach((l: string) => {
                    if (y > 280) { doc.addPage(); y = 20; }
                    
                    // Détecte une URL dans la ligne
                    const urlMatch = l.match(/(https?:\/\/[^\s]+)/);
                    if (urlMatch) {
                        doc.setTextColor(33, 150, 243); // Texte en bleu
                        // doc.textWithLink est la fonction native jsPDF pour rendre une zone cliquable
                        doc.textWithLink(l, 20, y, { url: urlMatch[0] });
                        doc.setTextColor(0, 0, 0); // Retour au noir pour le reste
                    } else {
                        doc.text(l, 20, y);
                    }
                    y += 6;
                });
            });
            y += 6;
        }
    };

    addBiblioBlock('Bibliographie :', d.biblio);

    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(8); doc.setTextColor(150);
    const lineage = buildLineageString(activeNode).replace(/<[^>]+>/g, ''); 
    const splitLineage = doc.splitTextToSize(t('pdf.lineage') + lineage, 170); doc.text(splitLineage, 20, y);
    y += 6 * splitLineage.length + 3;

    doc.setFont('times', 'italic');
    doc.text("Créé avec Cladis Tree", 20, y);

    const pdfDataUri = doc.output('datauristring');
    await window.electronAPI.saveExport(pdfDataUri, `fiche_${d.name || 'taxon'}.pdf`, 'pdf');
  };

  document.getElementById('cmenu-box-add')?.addEventListener('click', (e) => { 
      e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
      const selectedNodes = cy.$('node:selected').filter((n: any) => !n.hasClass('box')); 
      
      if (selectedNodes.length > 0) { 
          saveState(); 
          const newBoxId = 'box-' + Date.now(); 
          let targetIds: string[] = [];
          let defaultName = 'Groupe Paraphylétique';
          let isMono = false;

          if (selectedNodes.length === 1) {
              isMono = true; 
              const rootNode = selectedNodes[0];
              targetIds = [rootNode.id()]; 
              const taxonName = rootNode.data('name');
              defaultName = (taxonName && taxonName.trim() !== '') ? `Clade ${taxonName}` : 'Clade Monophylétique';
          } else {
              isMono = false; 
              targetIds = selectedNodes.map((n: any) => n.id()); 
          }

          cy.add({ 
              group: 'nodes', 
              classes: 'box', 
              grabbable: false,
              data: { 
                  id: newBoxId, 
                  name: defaultName, 
                  targets: targetIds, 
                  isMonophyletic: isMono, 
                  boxColor: '#FF9800', boxOpacity: 0.1, boxBorderStyle: 'dashed', boxBorderWidth: 2 
              } 
          }); 
          refreshLayout(); 
      } 
  });

  document.getElementById('cmenu-box-out')?.addEventListener('click', (e) => { 
      e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
      saveState(); 
      const selectedNodes = cy.$('node:selected').filter((n: any) => !n.hasClass('box')); 
      
      cy.nodes('.box').forEach((box: any) => {
          let targets = box.data('targets') || [];
          let modified = false;
          selectedNodes.forEach((sn: any) => {
              const idx = targets.indexOf(sn.id());
              if (idx > -1) { targets.splice(idx, 1); modified = true; }
          });
          if (modified) box.data('targets', targets);
      });
      refreshLayout(); 
  });

  document.getElementById('cmenu-box-remove')?.addEventListener('click', (e) => { 
      e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
      if (activeNode && activeNode.hasClass('box')) { 
          saveState(); 
          cy.remove(activeNode); 
          refreshLayout(); 
      } 
  });
  
  cy.on('cxttap', 'node', (e) => {
    activeNode = e.target; 
    const pasteBtn = document.getElementById('cmenu-paste'); 
    if(pasteBtn) pasteBtn.style.color = clipboard ? "var(--text-main)" : "var(--border-color)";
    
    const isBreak = activeNode.data('hasNewSheet'); 
    const isRoot = activeNode.id() === currentRootId; 
    const isBox = activeNode.hasClass('box'); 
    const hasParent = activeNode.data('parent');
    
    const bNew = document.getElementById('cmenu-sheet-new'); 
    const bOpen = document.getElementById('cmenu-sheet-open'); 
    const bRem = document.getElementById('cmenu-sheet-remove'); 
    const bBoxAdd = document.getElementById('cmenu-box-add'); 
    const bBoxOut = document.getElementById('cmenu-box-out'); 
    const bBoxRem = document.getElementById('cmenu-box-remove'); 
    const bEdit = document.getElementById('cmenu-edit'); 
    const bComp = document.getElementById('cmenu-compile');
    const bGraft = document.getElementById('cmenu-graft'); 

    if(bNew) bNew.style.display = (!isBreak && !isRoot && !isBox) ? 'block' : 'none'; 
    if(bOpen) bOpen.style.display = (isBreak && !isRoot && !isBox) ? 'block' : 'none'; 
    if(bRem) bRem.style.display = (isBreak && !isRoot && !isBox) ? 'block' : 'none';
    if(bBoxAdd) bBoxAdd.style.display = (!isBox) ? 'block' : 'none'; 
    if(bBoxOut) bBoxOut.style.display = (hasParent) ? 'block' : 'none'; 
    if(bBoxRem) bBoxRem.style.display = (isBox) ? 'block' : 'none'; 
    if(bEdit) bEdit.style.display = (!isBox) ? 'block' : 'none'; 
    if(bComp) bComp.style.display = (!isBox) ? 'block' : 'none';
    if(bGraft) bGraft.style.display = (!isBox) ? 'block' : 'none'; 
    
    ui.contextMenu.style.left = e.originalEvent.pageX + 'px'; 
    ui.contextMenu.style.top = e.originalEvent.pageY + 'px'; 
    ui.contextMenu.style.display = 'block';
  });

  // 1. Clic simple : Sélectionner un noeud (avec scanner de proximité pour les noeuds invisibles)
  cy.on('tap', (e: any) => { 
      ui.contextMenu.style.display = 'none'; 
      
      if (e.target === cy) {
          const clickPos = e.position; 
          const currentZoom = cy.zoom();
          const threshold = 30 / currentZoom; // Rayon de tolérance pour le clic
          
          let closestNode: any = null;
          let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              // LE CORRECTIF : On cible les noeuds vides, invisibles ou physiquement minuscules (< 5px)
              if (!node.data('name') || node.data('name').trim() === '' || node.data('isEmpty') || node.width() < 5) {
                  const nodePos = node.position();
                  const distance = Math.hypot(nodePos.x - clickPos.x, nodePos.y - clickPos.y);
                  
                  if (distance < minDistance) {
                      minDistance = distance;
                      closestNode = node;
                  }
              }
          });

          if (closestNode) {
              cy.nodes().unselect();
              closestNode.select();
          }
      }
  });

  // 2. Double-clic classique : Sur un noeud dont le corps est assez grand pour être visé
  cy.on('dbltap', 'node', (e: any) => {
      const node = e.target;
      if (node.id() !== 'root' && node.id() !== currentRootId) {
          openInlineEditor(node);
      }
  });

  // 3. NOUVEAU - Double-clic dans le vide : Scanner de proximité pour éditer les noeuds fantômes !
  cy.on('dbltap', (e: any) => {
      if (e.target === cy) {
          const clickPos = e.position; 
          const currentZoom = cy.zoom();
          const threshold = 30 / currentZoom; 
          
          let closestNode: any = null;
          let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              // Même logique : on attrape le noeud invisible le plus proche
              if (!node.data('name') || node.data('name').trim() === '' || node.data('isEmpty') || node.width() < 5) {
                  const nodePos = node.position();
                  const distance = Math.hypot(nodePos.x - clickPos.x, nodePos.y - clickPos.y);
                  
                  if (distance < minDistance) {
                      minDistance = distance;
                      closestNode = node;
                  }
              }
          });

          if (closestNode && closestNode.id() !== 'root' && closestNode.id() !== currentRootId) {
              openInlineEditor(closestNode);
          }
      }
  });

  const btnToggleRibbon = document.getElementById('btn-toggle-ribbon');
  const btnCloseRibbon = document.getElementById('btn-close-ribbon');

  if (btnToggleRibbon && btnCloseRibbon) {
      btnToggleRibbon.onclick = () => {
          const isHidden = ui.styleMenu.style.display === 'none';
          ui.styleMenu.style.display = isHidden ? 'flex' : 'none';
          btnToggleRibbon.style.background = isHidden ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.1)';
          setTimeout(() => cy.fit(cy.nodes(':visible').not('.strato-bg'), 50), 50); 
      };
      
      btnCloseRibbon.onclick = () => {
          ui.styleMenu.style.display = 'none';
          btnToggleRibbon.style.background = 'rgba(33, 150, 243, 0.1)';
          setTimeout(() => cy.fit(cy.nodes(':visible').not('.strato-bg'), 50), 50);
      };
  }

  document.getElementById('cmenu-edit')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && !activeNode.hasClass('box')) openSidePanelForNode(activeNode); });
  document.getElementById('cmenu-sheet-new')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && !activeNode.hasClass('box')) { saveState(); activeNode.data('hasNewSheet', true); refreshLayout(); } });
  document.getElementById('cmenu-sheet-open')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && !activeNode.hasClass('box')) { saveState(); currentRootId = activeNode.id(); refreshLayout(true); } });
  document.getElementById('cmenu-sheet-remove')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && !activeNode.hasClass('box')) { saveState(); activeNode.data('hasNewSheet', false); refreshLayout(); } });
  document.getElementById('cmenu-cut')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && !activeNode.hasClass('box')) cutClade(activeNode); });
  document.getElementById('cmenu-copy')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && !activeNode.hasClass('box')) copyClade(activeNode); });
  document.getElementById('cmenu-paste')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (activeNode && clipboard && !activeNode.hasClass('box')) pasteClade(activeNode); });
  document.getElementById('cmenu-graft')?.addEventListener('click', (e) => { 
    e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
    if (activeNode && !activeNode.hasClass('box')) { 
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.phylo,.xmind';
      input.onchange = (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (file) handleGraft(file, activeNode);
      };
      input.click(); 
    } 
  });

  const inputKeys = Object.keys(ui.formInputs);
  ui.btnUploadSheetImage.onclick = () => ui.inpSheetImageFile.click();
  
  ui.inpSheetImageFile.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file && activeNode && !activeNode.hasClass('box')) {
          const reader = new FileReader();
          reader.onload = async (eLoad) => {
              const base64 = eLoad.target?.result as string;
              const ratio = await getImageRatio(base64); 
              saveState();
              activeNode.data('sheetImage', base64);
              activeNode.data('sheetImageRatio', ratio);
              ui.previewSheetImage.src = base64;
              ui.previewSheetImage.style.display = 'block';
              ui.btnClearSheetImage.style.display = 'block';
              
              const creditsField = document.getElementById('inp-imgCredits');
              if (creditsField) creditsField.style.display = 'block';
              
              setUnsavedState(true);
          };
          reader.readAsDataURL(file);
      }
      ui.inpSheetImageFile.value = ''; 
  };

  ui.btnClearSheetImage.onclick = () => {
      if (activeNode && !activeNode.hasClass('box')) {
          saveState();
          activeNode.data('sheetImage', '');
          ui.previewSheetImage.src = '';
          ui.previewSheetImage.style.display = 'none';
          ui.btnClearSheetImage.style.display = 'none';
          
          const creditsField = document.getElementById('inp-imgCredits');
          if (creditsField) creditsField.style.display = 'none';
          
          setUnsavedState(true);
      }
  };
  
  // =========================================================
  // GESTION DU CADRE DE SÉLECTION (Natif & Infaillible)
  // =========================================================
  // La sélection devient native : Pas d'événements JS qui se bloquent, Cytoscape gère tout seul !
  cy.style().append([
      { selector: 'node[?isChrono]', style: { 'overlay-opacity': 0 } }, 
      { selector: 'node[?isChrono]:selected', style: { 'text-background-color': '#99CCFF', 'text-background-opacity': 0.5, 'text-background-shape': 'roundrectangle', 'text-background-padding': '4px' } } 
  ]).update();

  // 3. Ouvrir et Voyager vers le Fichier
  ui.btnOpenLinkedFile.onclick = async () => {
      if (!activeNode || activeNode.hasClass('box')) return;
      
      const linkedPath = activeNode.data('linkedFilePath');
      const linkedName = activeNode.data('linkedFileName');
      if (!linkedName) return;

      // Protection anti-perte de données
      if (hasUnsavedChanges) {
          if (confirm(t('confirm.save_before_switch'))) {
              await executeSave(false);
          }
      }

      // Fonction utilitaire pour extraire le dossier de l'arbre actuel
      const getDirectory = (filePath: string) => {
          if (!filePath) return '';
          const sep = filePath.includes('\\') ? '\\' : '/';
          const parts = filePath.split(sep);
          parts.pop();
          return parts.join(sep) + sep;
      };

      let loaded = false;

      // TENTATIVE 1 : Chemin Absolu d'origine
      if (linkedPath) {
          const res1 = await window.electronAPI.readFileDirect(linkedPath);
          if (res1.success && res1.data) {
              await loadTreeFromBuffer(res1.data as Uint8Array, res1.fileName!, res1.filePath);
              loaded = true;
          }
      }

      // TENTATIVE 2 : Chemin Relatif (On cherche dans le même dossier que l'arbre actuel)
      if (!loaded && currentFilePath) {
          const dir = getDirectory(currentFilePath);
          const fallbackPath = dir + linkedName;
          const res2 = await window.electronAPI.readFileDirect(fallbackPath);
          if (res2.success && res2.data) {
              // Si on le trouve ici, on répare silencieusement le chemin absolu sur le noeud
              activeNode.data('linkedFilePath', res2.filePath); 
              await loadTreeFromBuffer(res2.data as Uint8Array, res2.fileName!, res2.filePath);
              loaded = true;
          }
      }

      // TENTATIVE 3 : Relocalisation Manuelle (Ancre de secours)
      if (!loaded) {
          alert(`Le fichier "${linkedName}" a été déplacé ou est introuvable.\nVeuillez le localiser manuellement pour réparer le lien.`);
          const res3 = await window.electronAPI.openFile();
          if (res3.success && res3.data && res3.fileName) {
              // Réparation du lien avec le nouveau chemin choisi par l'utilisateur
              activeNode.data('linkedFilePath', res3.filePath);
              activeNode.data('linkedFileName', res3.fileName);
              await loadTreeFromBuffer(res3.data as Uint8Array, res3.fileName, res3.filePath);
          }
      }
      
      if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
      closeSidePanel();
  };

  // =========================================================
  // BOUCLIER ANTI-PARADOXE TEMPOREL & GESTION DES CHAMPS
  // =========================================================

  // Fonction d'Alerte Customisée (Empêche définitivement le blocage natif de Chromium/Electron)
  const showCustomAlert = (msg: string) => {
      const overlay = document.createElement('div');
      overlay.style.cssText = "position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.5); z-index:10000; display:flex; justify-content:center; align-items:center;";
      
      const box = document.createElement('div');
      box.style.cssText = "background:var(--bg-panel); color:var(--text-main); padding:25px; border-radius:8px; border:2px solid #e53935; box-shadow:0 10px 40px rgba(0,0,0,0.5); max-width:450px; text-align:center; font-family:sans-serif;";
      
      box.innerHTML = `<h3 style="color:#e53935; margin-top:0; margin-bottom:15px; font-size:18px;">\u26A0 Action impossible</h3><p style="font-size:14px; line-height:1.5;">${msg}</p><button id="btn-custom-alert" style="margin-top:20px; padding:8px 25px; cursor:pointer; background:#e53935; color:white; border:none; border-radius:4px; font-weight:bold;">OK</button>`;
      
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      
      const btn = document.getElementById('btn-custom-alert');
      if (btn) {
          btn.onclick = () => document.body.removeChild(overlay);
          btn.focus(); // On force le focus sur le bouton OK pour libérer l'interface
      }
  };

  inputKeys.forEach((key, index) => { 
      const inputEl = (ui.formInputs as any)[key] as HTMLElement;
      
      // 1. Écoute de la saisie en direct (Sans bloquer l'interface)
      inputEl.addEventListener('input', (e: any) => { 
          if (activeNode && !activeNode.hasClass('box')) { 
              const val = e.target.value; 
              activeNode.data(key, val); 
              if (key === 'period') updateTimeline(val); 
              
              if (key === 'status') {
                  ui.containerSynonym.style.display = val === 'Synonyme' ? 'flex' : 'none';
              }
              
              setUnsavedState(true); 
              
              clearTimeout(sidePanelTimeout);
              sidePanelTimeout = setTimeout(() => refreshLayout(), 80);
          } 
      });

      // 2. Validation au changement de case : Le Bouclier
      inputEl.addEventListener('change', (e: any) => {
          if (key === 'period' && activeNode && !activeNode.hasClass('box')) {
              const val = e.target.value;
              
              if (val && val.trim() !== '') {
                  const parseMa = (s: string) => parseFloat(s.replace(',', '.'));
                  const getStartAge = (p: string) => {
                      if (!p) return null;
                      const rangeMatch = p.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
                      const singleMatch = p.match(/([\d.,]+)/);
                      if (rangeMatch) return Math.max(parseMa(rangeMatch[1]), parseMa(rangeMatch[2]));
                      if (singleMatch) return parseMa(singleMatch[1]);
                      return null;
                  };

                  const newAge = getStartAge(val);
                  if (newAge !== null) {
                      let isParadox = false;
                      let message = '';

                      const parent = activeNode.incomers('node');
                      if (parent.length > 0) {
                          const pAge = getStartAge(parent[0].data('period'));
                          if (pAge !== null && pAge < newAge) { 
                              isParadox = true;
                              message = "Le parent est apparu il y a <b>" + pAge + " Ma</b>.<br>Vous ne pouvez pas placer son descendant avant lui (" + newAge + " Ma).";
                          }
                      }

                      if (!isParadox) {
                          activeNode.outgoers('node').forEach((child: any) => {
                              if (isParadox) return;
                              const cAge = getStartAge(child.data('period'));
                              if (cAge !== null && cAge > newAge) {
                                  isParadox = true;
                                  message = "Le descendant est apparu il y a <b>" + cAge + " Ma</b>.<br>Vous ne pouvez pas placer son ancêtre après lui (" + newAge + " Ma).";
                              }
                          });
                      }

                      if (isParadox) {
                          // L'action correctrice : on vide la case et on affiche notre fenêtre non-bloquante
                          const inputNative = inputEl as HTMLInputElement;
                          inputNative.blur(); // Sécurité : on retire le focus du champ pour éviter le gel
                          
                          inputNative.value = '';
                          activeNode.data('period', '');
                          updateTimeline('');
                          refreshLayout(false);
                          
                          showCustomAlert(message);
                          return; // Empêche l'enregistrement d'une mauvaise donnée
                      }
                  }
              }
          }
          saveState();
      });

      inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
              e.stopPropagation(); // LA CORRECTION : Absorbe la touche pour empêcher la création d'un frère !
              if (inputEl.tagName === 'INPUT' || inputEl.tagName === 'SELECT') {
                  e.preventDefault(); 
                  const nextKey = inputKeys[index + 1];
                  if (nextKey) {
                      const nextEl = (ui.formInputs as any)[nextKey] as HTMLElement;
                      nextEl.focus(); 
                      if (nextEl.tagName === 'INPUT') {
                          (nextEl as HTMLInputElement).select();
                      }
                  }
              }
          }
      });
  });
  

  container.addEventListener('wheel', (e: WheelEvent) => { 
      e.preventDefault(); 
      
      // Détection : S'agit-il d'une vraie souris classique ?
      // Une molette classique fait des sauts brusques (souvent > 50) sans aucun mouvement horizontal (deltaX = 0)
      // Ou elle possède un deltaMode === 1 (Mode ligne plutôt que pixel)
      const isMouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0);
      
      // Si on fait "Pincer pour zoomer" (Ctrl) OU que l'on utilise une vraie molette -> ZOOM
      if (e.ctrlKey || e.metaKey || isMouseWheel) {
          const direction = e.deltaY > 0 ? -1 : 1; 
          const baseSpeed = Math.abs(e.deltaY) >= 50 ? 0.04 : 0.02;
          const zoomSpeed = baseSpeed * appSettings.zoomSensitivity; 
          
          let currentZoom = cy.zoom(); 
          let newZoom = currentZoom * (1 + direction * zoomSpeed); 
          
          newZoom = Math.max(0.1, Math.min(newZoom, 4)); 
          
          cy.zoom({ level: newZoom, renderedPosition: { x: e.offsetX, y: e.offsetY } }); 
      } 
      // Sinon (Glissement à deux doigts sur pavé tactile) -> NAVIGATION (Panoramique)
      else {
          const pan = cy.pan();
          cy.pan({ x: pan.x - e.deltaX * 1.5, y: pan.y - e.deltaY * 1.5 });
      }
  }, { passive: false });

  const autoPanLoop = () => {
      if (!isBoxSelecting) {
          autoPanId = null;
          return;
      }

      const threshold = 60; 
      const speed = 15; 

      let panX = 0;
      let panY = 0;

      if (currentMouseX < threshold) panX = speed;
      else if (currentMouseX > window.innerWidth - threshold) panX = -speed;

      if (currentMouseY < threshold) panY = speed;
      else if (currentMouseY > window.innerHeight - threshold) panY = -speed;

      if (panX !== 0 || panY !== 0) {
          cy.panBy({ x: panX, y: panY });
          
          boxStartX += panX;
          boxStartY += panY;

          ui.customBox.style.left = Math.min(boxStartX, currentMouseX) + 'px';
          ui.customBox.style.top = Math.min(boxStartY, currentMouseY) + 'px';
          ui.customBox.style.width = Math.abs(currentMouseX - boxStartX) + 'px';
          ui.customBox.style.height = Math.abs(currentMouseY - boxStartY) + 'px';
      }

      autoPanId = requestAnimationFrame(autoPanLoop);
  };

  cy.on('grab', 'node', (e: any) => {
    const target = e.target as any;
    if (target.id() === currentRootId || target.hasClass('box')) return;
    
    draggedNode = cy.$id(target.id()); 
    
    const incomingEdges = target.incomers('edge');
    currentParentId = incomingEdges.length > 0 ? incomingEdges[0].data('source') : null;

    const successors = target.successors('node');

    possibleTargets = cy.nodes(':visible').filter((n: any) => 
        !n.hasClass('box') && n.id() !== target.id() && !successors.contains(n)
    ).map((n: any) => ({
        node: n,
        pos: n.position()
    }));

    const startPos = target.position();
    draggedDescendants = successors.map((n: any) => {
        const p = n.position();
        return { node: n, dx: p.x - startPos.x, dy: p.y - startPos.y };
    });
  });

  cy.on('drag', 'node', (e: any) => {
    if (!draggedNode || draggedNode.id() !== (e.target as any).id()) return;
    
    if (!draggedNode.data('isDraggingReal')) {
        draggedNode.data('isDraggingReal', true);
        draggedNode.incomers('edge').style('opacity', 0);
    }

    const cursorDragPos = (e.target as any).position(); 

    draggedDescendants.forEach(desc => {
        desc.node.position({
            x: cursorDragPos.x + desc.dx,
            y: cursorDragPos.y + desc.dy
        });
    });

    let targetParent: any = null;
    let minDistance = Infinity;

    possibleTargets.forEach((target) => {
      const distance = Math.hypot(target.pos.x - cursorDragPos.x, target.pos.y - cursorDragPos.y);
      if (distance < minDistance) {
        minDistance = distance;
        targetParent = target.node;
      }
    });

    if (targetParent && draggedNode.successors('node').contains(targetParent)) {
        targetParent = null;
    }

    currentDragTarget = targetParent;

    if (currentDragTarget) {
        let gNode = cy.$id('ghost-node');
        if (gNode.length === 0) {
            cy.add({ group: 'nodes', data: { id: 'ghost-node', name: '' } });
            gNode = cy.$id('ghost-node');
            gNode.style({ 'width': '1px', 'height': '1px', 'background-opacity': 0, 'border-width': 0, 'label': '' });
        }

        const myWidth = currentDragTarget.data('width') || 100;
        const rightX = currentDragTarget.position().x + (myWidth / 2);
        const childrenLeftX = rightX + 40; 
        const draggedWidth = draggedNode.data('width') || 100;
        const targetX = childrenLeftX + (draggedWidth / 2);

        let targetY = currentDragTarget.position().y;
        
        const children = currentDragTarget.outgoers('node').filter((n:any) => !n.hasClass('box') && n.id() !== draggedNode.id() && n.id() !== 'ghost-node');
        
        if (children.length > 0) {
            let maxY = -Infinity;
            children.forEach((c: any) => {
                if (c.position().y > maxY) maxY = c.position().y;
            });
            const draggedHeight = draggedNode.data('height') || 24;
            targetY = maxY + Math.max(35, draggedHeight + 15);
        }

        gNode.position({ x: targetX, y: targetY });

        if (!ghostEdge) {
            ghostEdge = cy.add({ group: 'edges', data: { id: 'ghost-edge', source: currentDragTarget.id(), target: 'ghost-node' } });
            ghostEdge.style({ 'line-color': '#2196F3', 'line-style': 'dashed', 'opacity': 0.8, 'width': 4, 'curve-style': 'taxi', 'taxi-direction': 'rightward' });
        } else if (ghostEdge.data('source') !== currentDragTarget.id()) {
            cy.remove(ghostEdge);
            ghostEdge = cy.add({ group: 'edges', data: { id: 'ghost-edge', source: currentDragTarget.id(), target: 'ghost-node' } });
            ghostEdge.style({ 'line-color': '#2196F3', 'line-style': 'dashed', 'opacity': 0.8, 'width': 4, 'curve-style': 'taxi', 'taxi-direction': 'rightward' });
        }
    } else {
        if (ghostEdge) { cy.remove(ghostEdge); ghostEdge = null; }
        const gNode = cy.$id('ghost-node');
        if (gNode.length > 0) cy.remove(gNode);
    }
  });

  cy.on('free', 'node', (e: any) => {
    const target = e.target as any;
    
    target.incomers('edge').removeStyle('opacity');
    target.data('isDraggingReal', false); 

    if (!draggedNode || draggedNode.id() !== target.id()) return;
    
    draggedNode = null;
    possibleTargets = [];
    draggedDescendants = []; 
    
    if (ghostEdge) { cy.remove(ghostEdge); ghostEdge = null; }
    const gNode = cy.$id('ghost-node');
    if (gNode.length > 0) cy.remove(gNode);

    if (currentDragTarget && currentDragTarget.id() !== currentParentId) {
        saveState();
        
        const incomingEdges = target.incomers('edge').filter((edge: any) => edge.id() !== 'ghost-edge');
        if (incomingEdges.length > 0) cy.remove(incomingEdges);
        
        cy.add({ group: 'edges', data: { source: currentDragTarget.id(), target: target.id() } });
        checkAutoRank(target);

        // --- PROPAGATION PUISSANTE ---
        // Si la cible du glisser-déposer est dans une boîte, le taxon déplacé ET tous ses enfants entrent dans la boîte !
        propagateBoxMembership(currentDragTarget, target.union(target.successors('node:not(.box)')).toArray());
    }

    currentDragTarget = null;
    currentParentId = null;
    refreshLayout(); 
  });

  // Clic molette universel : Fonctionne même en cliquant SUR un taxon
  container.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 1) { 
          e.preventDefault();
          isMiddlePanning = true;
          boxStartX = e.clientX; 
          boxStartY = e.clientY;
          container.style.cursor = 'grabbing';
      }
  });

  cy.on('mousedown', (e) => {
    const originalEvent = e.originalEvent as MouseEvent;
    if (e.target === cy && originalEvent) {
      if (originalEvent.button === 0) { // Clic Gauche : Boîte de sélection (Seulement sur le fond)
        isBoxSelecting = true;
        boxStartX = originalEvent.clientX;
        boxStartY = originalEvent.clientY;
        currentMouseX = boxStartX;
        currentMouseY = boxStartY;
        
        ui.customBox.style.left = boxStartX + 'px';
        ui.customBox.style.top = boxStartY + 'px';
        ui.customBox.style.width = '0px';
        ui.customBox.style.height = '0px';
        ui.customBox.style.display = 'block';

        if (!autoPanId) autoPanLoop();
      } 
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (isMiddlePanning) {
      const dx = e.clientX - boxStartX;
      const dy = e.clientY - boxStartY;
      cy.panBy({ x: dx, y: dy });
      boxStartX = e.clientX;
      boxStartY = e.clientY;
    } else if (isBoxSelecting) {
      currentMouseX = e.clientX; 
      currentMouseY = e.clientY;
      ui.customBox.style.left = Math.min(boxStartX, currentMouseX) + 'px';
      ui.customBox.style.top = Math.min(boxStartY, currentMouseY) + 'px';
      ui.customBox.style.width = Math.abs(currentMouseX - boxStartX) + 'px';
      ui.customBox.style.height = Math.abs(currentMouseY - boxStartY) + 'px';
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button === 1 && isMiddlePanning) {
      isMiddlePanning = false;
      container.style.cursor = 'default';
    } else if (isBoxSelecting) {
      isBoxSelecting = false; 
      ui.customBox.style.display = 'none';

      if (autoPanId) {
          cancelAnimationFrame(autoPanId);
          autoPanId = null;
      }
      const dx = Math.abs(e.clientX - boxStartX); 
      const dy = Math.abs(e.clientY - boxStartY);

      if (dx > 5 || dy > 5) {
        const rect = container.getBoundingClientRect();
        const left = Math.min(boxStartX, e.clientX) - rect.left; 
        const right = Math.max(boxStartX, e.clientX) - rect.left;
        const top = Math.min(boxStartY, e.clientY) - rect.top; 
        const bottom = Math.max(boxStartY, e.clientY) - rect.top;

        if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
          cy.nodes().unselect();
        }

        cy.nodes().filter((n:any) => !n.hasClass('box') && n.visible()).forEach((n:any) => {
          const p = n.renderedPosition();
          if (p.x >= left && p.x <= right && p.y >= top && p.y <= bottom) {
            if (e.shiftKey) {
              n.unselect();
            } else {
              n.select();
            }
          }
        });
        updateCounters();
      }
    }
  });

  cy.on('remove', 'node', (e) => {
      if (isEditing && editedNode && e.target.id() === editedNode.id() && closeCurrentEditor) {
          closeCurrentEditor();
      }
  });

  window.addEventListener('keydown', (e) => {
    const activeTag = document.activeElement?.tagName; 

    if (e.key === 'Escape') {
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        (document.activeElement as HTMLElement).blur();
      }
      if (ui.sidePanel.style.display === 'block') {
        closeSidePanel();
      }
      return; 
    }

    if (e.key === 'F11') {
      e.preventDefault();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn("Erreur de plein écran :", err);
        });
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      }
      return;
    }

    if (e.ctrlKey || e.metaKey) { 
      if (e.key === ' ') { 
          const currentSelection = cy.nodes(':selected'); 
          
          if (currentSelection.length > 0 && !currentSelection[0].hasClass('box')) {
              const node = currentSelection[0];

              if (node.data('hasNewSheet') && node.id() !== currentRootId) { 
                  e.preventDefault(); 
                  currentRootId = node.id(); 
                  refreshLayout(true); 
                  closeSidePanel(); 
                  return; 
              } 

              if (node.id() === currentRootId && currentRootId !== 'root') {
                  e.preventDefault();
                  const incoming = node.incomers('node');
                  if (incoming.length > 0) {
                      const parentNode = incoming.first();
                      currentRootId = getSheetRootForNode(parentNode);
                      refreshLayout(true);
                      closeSidePanel();
                      
                      cy.$(':selected').unselect();
                      node.select();
                      setTimeout(() => cy.animate({ center: { eles: node }, zoom: 1.5 }, { duration: 300 }), 50);
                  }
                  return;
              }
          } 
      }
      
      if (e.key.toLowerCase() === 'a') {
        e.preventDefault();
        cy.nodes().filter((n: any) => !n.hasClass('box') && n.visible()).select();
        updateCounters();
        return;
      }
      
      if (e.key.toLowerCase() === 'f') { 
        e.preventDefault(); 
        const selectedAll = cy.$('node:selected');
        
        if (e.shiftKey && selectedAll.length === 1 && !selectedAll[0].hasClass('box')) {
            saveState(); 
            selectedAll[0].data('hasNewSheet', true); 
            refreshLayout();
            return;
        }
        if (selectedAll.length === 1) {
           openSidePanelForNode(selectedAll[0]);
        } else {
           ui.searchInput.focus(); 
        }
        return; 
      }
      
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        executeSave(false); // Appel direct de la fonction au lieu du "click()"
        return;
      }

      if (e.key.toLowerCase() === 'o') {
        e.preventDefault();
        ui.btnLoad.click();
        return;
      }
    }

    if (isEditing || activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (e.key.toLowerCase() === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
      if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    }

    const selected = cy.$('node:selected');
    
    if (selected.length > 0 && !e.altKey && !e.ctrlKey && !e.metaKey) {
      const node = selected[0]; 
      if (!node.hasClass('box')) {
        if (e.key === 'ArrowLeft') { const parents = node.incomers('node'); if (parents.length > 0) { e.preventDefault(); node.unselect(); parents.first().select(); } }
        if (e.key === 'ArrowRight') { if (!node.data('hasNewSheet')) { const children = node.outgoers('node').filter((n:any)=>!n.hasClass('box')); if (children.length > 0) { e.preventDefault(); node.unselect(); const sortedChildren = children.toArray().sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)); sortedChildren[0].select(); } } }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); const incomers = node.incomers('node'); const siblingsArray = incomers.length === 0 ? cy.nodes().roots().toArray() : incomers[0].outgoers('node').filter((n:any)=>!n.hasClass('box')).toArray(); siblingsArray.sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)); const currentIndex = siblingsArray.findIndex((n: any) => n.id() === node.id()); if (e.key === 'ArrowUp' && currentIndex > 0) { node.unselect(); siblingsArray[currentIndex - 1].select(); } else if (e.key === 'ArrowDown' && currentIndex < siblingsArray.length - 1) { node.unselect(); siblingsArray[currentIndex + 1].select(); } }
      }
    }

    if (e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createNewTree();
        return;
      }

    if (e.ctrlKey || e.metaKey) {
      if (e.key.toLowerCase() === 'x') { if (selected.length > 0 && !selected[0].hasClass('box')) { e.preventDefault(); cutClade(selected[0]); } return; }
      if (e.key.toLowerCase() === 'c') { 
          if (selected.length > 0 && !selected[0].hasClass('box')) { 
              e.preventDefault(); 
              copyClade(selected[0]); 
              navigator.clipboard.writeText(''); // Vide le presse-papier de l'OS pour donner priorité au clade copié
          } 
          return; 
      }
      if (e.key.toLowerCase() === 'v') { 
          if (selected.length > 0 && !selected[0].hasClass('box')) { 
              e.preventDefault(); 
              // 1. On tente d'abord de lire le presse-papier de l'ordinateur (Texte natif)
              navigator.clipboard.readText().then(text => {
                  if (text && text.trim() !== '') {
                      saveState(); 
                      const node = selected[0]; 
                      const parentId = node.id(); 
                      const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
                      // On injecte directement le texte collé comme nom de taxon
                      const nodeData = { ...EMPTY_DATA, id: newId, name: text.trim(), parent: node.data('parent') || null, extinct: false, isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: Date.now() };
                      const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]);  
                      
                      const newNode = added.filter('node');
                      propagateBoxMembership(node, newNode.toArray());
                      checkAutoRank(newNode[0]); // Va lancer l'auto-italique !

                      cy.nodes().unselect(); newNode.select();
                      if (node.data('hasNewSheet')) { currentRootId = node.id(); refreshLayout(true); } else if (node.data('collapsed')) { toggleCollapse(node); } else { refreshLayout(); } 
                      cy.animate({ center: { eles: newNode } }, { duration: 250 });
                  } 
                  // 2. Si le presse-papier de l'ordinateur est vide, on colle le Clade copié dans l'application
                  else if (clipboard) {
                      pasteClade(selected[0]);
                  }
              }).catch(() => {
                  // Sécurité au cas où l'OS bloque la lecture du texte
                  if (clipboard) pasteClade(selected[0]);
              });
          } 
          return; 
      }
      if (e.key === ' ') { if (selected.length > 0 && !selected[0].hasClass('box') && selected[0].outgoers('node').length > 0) { e.preventDefault(); toggleCollapse(selected[0]); } return; }
      
      if (e.key === 'Enter') { // Insertion au milieu
        if (selected.length === 1 && !selected[0].hasClass('box')) { 
          e.preventDefault(); const node = selected[0]; if (node.id() === currentRootId || node.id() === 'root') return; 
          const incomingEdges = node.incomers('edge'); 
          if (incomingEdges.length > 0) { 
            saveState(); const parentId = incomingEdges[0].data('source'); cy.remove(incomingEdges[0]);
            const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
            const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: false, isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: node.data('sortIndex') };
            const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }, { group: 'edges', data: { source: newId, target: node.id() } }]);
            
            const newNode = added.filter('node');
            propagateBoxMembership(node, newNode.toArray());

            cy.nodes().unselect(); newNode.select(); refreshLayout();
            cy.animate({ center: { eles: newNode } }, { duration: 250 });
            openInlineEditor(newNode, true);
          } 
        }
        return;
      }
    }

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      if (selected.length > 0 && !selected[0].hasClass('box')) { e.preventDefault(); const node = selected[0]; let siblingsArray = []; const incomers = node.incomers('node'); if (incomers.length === 0) siblingsArray = cy.nodes().roots().toArray(); else { const parent = incomers[0]; siblingsArray = parent.outgoers('node').filter((n:any)=>!n.hasClass('box')).toArray(); } siblingsArray.sort((a: any, b: any) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)); const currentIndex = siblingsArray.findIndex((n: any) => n.id() === node.id()); let swapped = false; if (e.key === 'ArrowUp' && currentIndex > 0) { [siblingsArray[currentIndex - 1], siblingsArray[currentIndex]] = [siblingsArray[currentIndex], siblingsArray[currentIndex - 1]]; swapped = true; } else if (e.key === 'ArrowDown' && currentIndex < siblingsArray.length - 1) { [siblingsArray[currentIndex], siblingsArray[currentIndex + 1]] = [siblingsArray[currentIndex + 1], siblingsArray[currentIndex]]; swapped = true; } if (swapped) { saveState(); siblingsArray.forEach((sib: any, i: number) => sib.data('sortIndex', i)); refreshLayout(); } } return; 
    }

    if (e.ctrlKey || e.metaKey) { 
      if (e.key.toLowerCase() === 'b') { 
        if (selected.length > 0) { 
          e.preventDefault(); saveState(); 
          const targetState = !selected[0].data('isBold');
          selected.forEach((n:any) => n.data('isBold', targetState)); 
          refreshLayout(); 
        } 
        return; 
      }
      if (e.key.toLowerCase() === 'i') { 
        if (selected.length > 0) { 
          e.preventDefault(); saveState(); 
          const targetState = !selected[0].data('isItalic');
          selected.forEach((n:any) => n.data('isItalic', targetState)); 
          refreshLayout(); 
        } 
        return; 
      }
      if (e.key.toLowerCase() === 'e') { 
        if (selected.length > 0 && !selected[0].hasClass('box')) { 
          e.preventDefault(); saveState(); 
          const targetState = !selected[0].data('extinct');
          selected.forEach((n:any) => n.union(n.successors()).data('extinct', targetState)); 
          refreshLayout(); 
        } 
        return; 
      }
    }

    if (e.key === ' ') {
      if (selected.length === 1) {
        e.preventDefault(); 
        openInlineEditor(selected[0]);
      }
    }

    if (e.key === 'Enter') { // Créer un frère
      if (selected.length === 1 && !selected[0].hasClass('box')) { 
        e.preventDefault(); const node = selected[0]; if (node.id() === currentRootId) return; const incomingEdges = node.incomers('edge'); 
        if (incomingEdges.length > 0) { 
          saveState(); const parentId = incomingEdges[0].data('source'); 
          const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
          const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: node.data('extinct'), isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: (node.data('sortIndex') || 0) + 0.1 };
          const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]); 
          
          // --- PROPAGATION ---
          const newNode = added.filter('node');
          propagateBoxMembership(node, newNode.toArray());

          cy.nodes().unselect(); newNode.select(); refreshLayout(); 
          cy.animate({ center: { eles: newNode } }, { duration: 250 });
          openInlineEditor(newNode, true);
        } 
      }
    }

    if (e.key === 'Tab') { // Créer un enfant
      if (selected.length === 1 && !selected[0].hasClass('box')) { 
        e.preventDefault(); saveState(); const node = selected[0]; const parentId = node.id(); const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
        const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: node.data('extinct'), isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: Date.now() };
        const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]);  
        
        // --- PROPAGATION ---
        const newNode = added.filter('node');
        propagateBoxMembership(node, newNode.toArray());

        cy.nodes().unselect(); newNode.select();
        if (node.data('hasNewSheet')) { currentRootId = node.id(); refreshLayout(true); } else if (node.data('collapsed')) { toggleCollapse(node); } else { refreshLayout(); } 
        cy.animate({ center: { eles: newNode } }, { duration: 250 });
        openInlineEditor(newNode, true);
      }
    }
    
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const selectedBoxes = cy.$('.box:selected');
      const selectedTaxons = cy.$('node:selected:not(.box), edge:selected');

      if (selectedBoxes.length > 0 || selectedTaxons.length > 0) { 
          e.preventDefault();
          saveState();
          
          if (selectedBoxes.length > 0) {
              selectedBoxes.forEach((box: any) => {
                  box.children().move({ parent: null }); 
                  cy.remove(box); 
              });
          }
          else if (selectedTaxons.length > 0) {
              const cladeToDelete = selectedTaxons.union(selectedTaxons.successors()).filter((ele: any) => ele.id() !== 'root'); 
              if (cladeToDelete.length > 0) {
                  if (cladeToDelete.contains(cy.$id(currentRootId))) currentRootId = 'root'; 
                  cy.remove(cladeToDelete); 
              }
          }
          
          closeSidePanel();
          refreshLayout(); 
      }
    }
  });
  
  cy.on('select unselect', 'node', () => { 
    clearTimeout(panelTimeout);
    panelTimeout = setTimeout(() => {
      const selectedAll = cy.$('node:selected'); 
      
      const isPanelOpen = !ui.sidePanel.style.transform.includes('100%');

      if (isPanelOpen) {
        if (selectedAll.length === 1) {
            openSidePanelForNode(selectedAll[0]); 
        } else {
            closeSidePanel(); 
        }
      }

      if (ui.styleMenu.style.display === 'flex' && selectedAll.length === 1) {
          updateRibbonForNode(selectedAll[0]);
      }

      updateCounters(); 
    }, 50); 
  });

  const hScroll = document.createElement('div');
  hScroll.id = 'custom-hscroll';
  hScroll.style.cssText = "position:fixed; bottom:45px; left:0; right:15px; height:15px; overflow-x:auto; overflow-y:hidden; z-index:700; background:var(--bg-panel); border-top:1px solid var(--border-color); opacity:0.9; transition:right 0.3s ease;";
  const hContent = document.createElement('div');
  hContent.style.height = "1px";
  hScroll.appendChild(hContent);

  const vScroll = document.createElement('div');
  vScroll.id = 'custom-vscroll';
  vScroll.style.cssText = "position:fixed; top:70px; right:0; width:15px; bottom:60px; overflow-y:auto; overflow-x:hidden; z-index:700; background:var(--bg-panel); border-left:1px solid var(--border-color); opacity:0.9; transition:right 0.3s ease;";
  const vContent = document.createElement('div');
  vContent.style.width = "1px";
  vScroll.appendChild(vContent);

  document.body.appendChild(hScroll);
  document.body.appendChild(vScroll);

  const stopPropag = (e: Event) => e.stopPropagation();
  hScroll.addEventListener('mousedown', stopPropag);
  vScroll.addEventListener('mousedown', stopPropag);
  hScroll.addEventListener('touchstart', stopPropag);
  vScroll.addEventListener('touchstart', stopPropag);
  hScroll.addEventListener('dblclick', stopPropag);
  vScroll.addEventListener('dblclick', stopPropag);

  let isScrolling = false;
  let isClamping = false;

  // OPTIM 1 - Dernier etat ecrit dans le DOM. Ecrire scrollLeft force un
  // recalcul de layout du navigateur ; le faire a chaque image en alternance
  // avec des lectures produisait du layout thrashing.
  const lastScrollWrite = { vw: -1, vh: -1, sl: -1, st: -1 };
  const lastScrollInput = { zoom: -1, px: NaN, py: NaN, bbv: -1, vpW: -1, vpH: -1 };

  const syncScrollbars = () => {
      if (isScrolling) return;

      const zoom = cy.zoom();
      const pan = cy.pan();
      const vpW = cy.width();
      const vpH = cy.height();

      // Sortie immediate si rien de ce dont depend le calcul n'a bouge : le cas
      // de loin le plus frequent, l'evenement 'render' etant emis en rafale.
      if (zoom === lastScrollInput.zoom && pan.x === lastScrollInput.px
          && pan.y === lastScrollInput.py && graphBBVersion === lastScrollInput.bbv
          && vpW === lastScrollInput.vpW && vpH === lastScrollInput.vpH) return;

      lastScrollInput.zoom = zoom;
      lastScrollInput.px = pan.x;
      lastScrollInput.py = pan.y;
      lastScrollInput.bbv = graphBBVersion;
      lastScrollInput.vpW = vpW;
      lastScrollInput.vpH = vpH;

      isScrolling = true;

      // Boite du modele mise en cache : ni le pan ni le zoom ne la modifient.
      const cached = getGraphBB();
      const bb = { x1: cached.x1, x2: cached.x2, y1: cached.y1, y2: cached.y2, w: cached.w, h: cached.h };

      if (layoutMode === 'chrono') {
          // CORRECTIF : en chronogramme les X sont NEGATIFS (x = -(age*20)).
          // L'ancien calcul supposait un axe positif partant de baseX=150, ce qui
          // decalait la scrollbar de toute la largeur du graphe.
          const cb = getChronoWorldBounds();
          bb.x1 = cb.x1;
          bb.x2 = cb.x2;
          bb.w = cb.w;
      }

      if (bb.w === Infinity || bb.h === Infinity) {
          isScrolling = false;
          return;
      }

      const virtualW = (bb.w * zoom) + (vpW * 2);
      const virtualH = (bb.h * zoom) + (vpH * 2);

      // On n'ecrit que ce qui change reellement.
      if (virtualW !== lastScrollWrite.vw) {
          hContent.style.width = virtualW + 'px';
          lastScrollWrite.vw = virtualW;
      }
      if (virtualH !== lastScrollWrite.vh) {
          vContent.style.height = virtualH + 'px';
          lastScrollWrite.vh = virtualH;
      }

      const scrollLeftPos = -pan.x + (bb.x1 * zoom) + vpW;
      const scrollTopPos = -pan.y + (bb.y1 * zoom) + vpH;

      if (Math.round(scrollLeftPos) !== lastScrollWrite.sl) {
          hScroll.scrollLeft = scrollLeftPos;
          lastScrollWrite.sl = Math.round(scrollLeftPos);
      }
      if (Math.round(scrollTopPos) !== lastScrollWrite.st) {
          vScroll.scrollTop = scrollTopPos;
          lastScrollWrite.st = Math.round(scrollTopPos);
      }

      isScrolling = false;
  };

  cy.on('render pan zoom', syncScrollbars);

  // OPTIM 11 - reveil de la boucle de la frise.
  cy.on('render pan zoom viewport resize', () => {
      if (layoutMode === 'chrono' && chronoRulerUpdater) startChronoRaf();
  });

  // OPTIM 1 / 8 - Seuls ces evenements modifient la boite du modele ou les noms.
  // La boite du modele depend aussi des donnees et du style : width et height
  // viennent de mappers data(...), donc une ecriture de data peut la changer.
  // L'invalidation ne fait qu'annuler un cache, le recalcul est differe a la
  // premiere lecture (une fois par image au maximum, grace a la sortie precoce).
  cy.on('add remove position data style', () => { invalidateGraphBB(); });
  cy.on('add remove data', 'node', invalidateSearchIndex);

  // === LE BOUCLIER HORIZONTAL ===
  cy.on('pan', () => {
      if (layoutMode !== 'chrono' || isClamping) return;
      
      const z = cy.zoom();
      const pan = cy.pan();
      const vpW = cy.width();
      
      // CORRECTIF MAJEUR : l'ancien bouclier bornait pan.x a 150 max, en supposant
      // un graphe a X positifs. Comme le chronogramme vit a X negatifs, il fallait
      // pan.x ~ +age*20*zoom pour voir quoi que ce soit : la camera etait donc
      // ramenee de force loin a droite du graphe, arbre ET frise hors ecran.
      const cb = getChronoWorldBounds();
      
      // Bornage STRICT : impossible de sortir de la frise.
      //   bord gauche de la frise jamais a droite du bord gauche de la vue :
      //       cb.x1 * z + panX <= 0        =>  panX <= -cb.x1 * z
      //   bord droit jamais a gauche du bord droit de la vue :
      //       cb.x2 * z + panX >= vpW      =>  panX >= vpW - cb.x2 * z
      let maxPanX = -(cb.x1 * z);
      let minPanX = vpW - (cb.x2 * z);

      if (minPanX > maxPanX) {
          const center = (minPanX + maxPanX) / 2;
          minPanX = center;
          maxPanX = center;
      }

      let clampedX = pan.x;
      if (pan.x > maxPanX) clampedX = maxPanX;
      if (pan.x < minPanX) clampedX = minPanX;

      if (clampedX !== pan.x) {
          isClamping = true;
          cy.pan({ x: clampedX, y: pan.y });
          isClamping = false;
      }
  });

  hScroll.addEventListener('scroll', () => {
      if (isScrolling || isCameraLocked) return;
      isScrolling = true;
      const bb = cy.elements().boundingBox();
      if (layoutMode === 'chrono') {
          bb.x1 = getChronoWorldBounds().x1; // Aligne le scroll natif avec le bouclier
      }
      const zoom = cy.zoom();
      const vpW = cy.width();
      
      cy.pan({ x: -hScroll.scrollLeft + (bb.x1 * zoom) + vpW, y: cy.pan().y });
      isScrolling = false;
  });

  vScroll.addEventListener('scroll', () => {
      if (isScrolling || isCameraLocked) return;
      isScrolling = true;
      const bb = cy.elements().boundingBox();
      const zoom = cy.zoom();
      const vpH = cy.height();
      
      cy.pan({ x: cy.pan().x, y: -vScroll.scrollTop + (bb.y1 * zoom) + vpH });
      isScrolling = false;
  });

  if (window.electronAPI && window.electronAPI.onOpenFileFromOS) {
      window.electronAPI.onOpenFileFromOS(async (filePath: string) => {
          const result = await window.electronAPI.readFileDirect(filePath);
          
          if (result.success && result.data && result.fileName) {
              // On appelle directement le moteur natif avec la mémoire et le chemin
              await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
              if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
          } else if (result.error) {
              alert("Erreur de lecture du fichier : " + result.error);
          }
      });
  }
};

window.addEventListener('DOMContentLoaded', startApp);