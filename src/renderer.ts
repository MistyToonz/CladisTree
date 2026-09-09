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
import { saveExcelFile, exportGraphToPdf, generateFichePdf, XlsxCol } from './export';
import { GEO_DETAILS, CHRONO_PERIOD_KEYS, adjustColorLightness } from './chrono-data';
import { state, stateManager } from './graph-state';

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

let pendingOSFile: string | null = null;
let isAppReady = false;

// On capture l'événement le plus tôt possible, avant même que l'UI ne soit chargée
if (window.electronAPI && window.electronAPI.onOpenFileFromOS) {
    window.electronAPI.onOpenFileFromOS(async (filePath: string) => {
        if (isAppReady && (window as any)._loadOSFile) {
            await (window as any)._loadOSFile(filePath);
        } else {
            pendingOSFile = filePath;
        }
    });
}


const startApp = () => {
  const container = document.getElementById('app') as HTMLElement; 
  if (!container) return;

  let isBoxSelecting = false; 
  let isMiddlePanning = false;
  let isFittingCamera = false; 
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
      state.activeNode = node; 
      const isBox = node.hasClass('box');
      const rawName = node.data('name'); 
      const displayName = (!rawName || rawName.trim() === '') ? (isBox ? t('default.box') : t('default.unnamed_branch')) : rawName; 
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
      state.activeNode = node; 
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

      // Nettoyage pour éviter les conflits d'anciens événements
      selFont.onchange = null; inpSize.onchange = null; inpSize.onkeydown = null; btnBold.onclick = null; btnItalic.onclick = null;
      inpImgFile.onchange = null; inpImgSize.oninput = null; inpImgSize.onchange = null; inpImgSize.onkeydown = null; selImgPos.oninput = null; selImgPos.onchange = null; btnImgClear.onclick = null;
      boxColor.onchange = null; boxName.oninput = null; boxName.onchange = null; boxName.onkeydown = null; boxOpacity.oninput = null; boxBorderStyle.onchange = null; boxBorderWidth.oninput = null; boxBorderWidth.onchange = null; boxBorderWidth.onkeydown = null;
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
              ui.styleBoxVertical.checked = state.layoutMode === 'comb' ? !!node.data('boxTextVertical') : false;
              ui.styleBoxVertical.onchange = (ev) => {
                  if (state.layoutMode === 'standard') {
                      ui.styleBoxVertical.checked = false;
                      return;
                  }
                  node.data('boxTextVertical', (ev.target as HTMLInputElement).checked); 
                  refreshLayout(); 
                  setUnsavedState(true); 
              };
          }
          if (ui.styleBoxGradient) {
              ui.styleBoxGradient.checked = state.layoutMode === 'comb' ? !!node.data('boxGradient') : false;
              ui.styleBoxGradient.onchange = (ev) => {
                  if (state.layoutMode === 'standard') {
                      ui.styleBoxGradient.checked = false;
                      return;
                  }
                  node.data('boxGradient', (ev.target as HTMLInputElement).checked); 
                  refreshLayout(); 
                  setUnsavedState(true); 
              };
          }

          boxColor.onchange = (ev) => { node.data('boxColor', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 
          
          // CORRECTION: Changement sur blur ou Entrée pour le nom du cadre
          boxName.onchange = (ev) => { node.data('name', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 

          // L'opacité reste en oninput car le glisser doit être fluide
          boxOpacity.oninput = (ev) => { node.data('boxOpacity', parseInt((ev.target as any).value) / 100); debounced('boxEdit', 90, refreshLayout); setUnsavedState(true); }; 
          
          boxBorderStyle.onchange = (ev) => { node.data('boxBorderStyle', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 
          
          // CORRECTION: Changement sur blur ou Entrée pour l'épaisseur de la bordure
          boxBorderWidth.onchange = (ev) => { node.data('boxBorderWidth', parseInt((ev.target as any).value)); refreshLayout(); setUnsavedState(true); };
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

      selFont.value = node.data('fontFamily') || 'serif'; 
      inpSize.value = node.data('fontSize') || 16; 
      btnBold.style.background = node.data('isBold') ? 'var(--bg-hover)' : 'var(--bg-input)'; 
      btnItalic.style.background = node.data('isItalic') ? 'var(--bg-hover)' : 'var(--bg-input)'; 
      inpImgSize.value = node.data('imgSize') || 150; 
      selImgPos.value = node.data('imgPos') || 'left'; 
      inpImgFile.value = ''; 
      
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
      
      // CORRECTION: Validation sur la taille du texte
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

      // --- NOUVEAU : GESTION DE L'AFFICHAGE DU NOM DE FICHIER ---
      let labelSpan = document.getElementById('style-img-name-label');
      if (!labelSpan) {
          labelSpan = document.createElement('span');
          labelSpan.id = 'style-img-name-label';
          labelSpan.style.cssText = 'font-size:12px; margin-left:8px; opacity:0.8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:140px; display:inline-block; vertical-align:middle;';
          inpImgFile.parentNode?.insertBefore(labelSpan, inpImgFile.nextSibling);
      }

      const currentImgUrl = node.data('imgUrl');
      const currentImgName = node.data('imgName');
      if (currentImgUrl && currentImgUrl.trim() !== '') {
          labelSpan.innerText = currentImgName ? `\u25A3 ${currentImgName}` : t('style.img_loaded');
          labelSpan.title = currentImgName || '';
          inpImgFile.style.color = 'transparent'; // Cache la phrase "Aucun fichier choisi"
      } else {
          labelSpan.innerText = '';
          inpImgFile.style.color = ''; // Restaure le texte par défaut
      }

      const handleImageUpload = async (base64Image: string, fileName: string) => {
          const ratio = await getImageRatio(base64Image);
          let blockedInChrono = false;
          
          applyStyleToSelection(n => { 
              const isIntermediate = n.outgoers('node').length > 0;
              if (state.layoutMode === 'chrono' && isIntermediate) {
                  blockedInChrono = true;
                  return; 
              }
              n.data('imgRatio', ratio); 
              n.data('imgUrl', base64Image); 
              n.data('imgName', fileName); 
          });
          
          if (blockedInChrono) {
              showCustomAlert(t('alert.chrono_img_error'));
          } else {
              if (labelSpan) {
                  labelSpan.innerText = `\u25A3 ${fileName}`;
                  labelSpan.title = fileName;
              }
              inpImgFile.style.color = 'transparent';
          }
      };

      inpImgFile.onclick = (ev) => { (ev.target as HTMLInputElement).value = ''; };
      inpImgFile.onchange = (ev) => { 
          const file = (ev.target as HTMLInputElement).files?.[0]; 
          if (file) { 
              const reader = new FileReader(); 
              reader.onload = (eLoad) => { 
                  const base64Image = eLoad.target?.result as string; 
                  handleImageUpload(base64Image, file.name);
              }; 
              reader.readAsDataURL(file); 
          } 
      };
      
      inpImgSize.onchange = (ev) => {
          const v = parseInt((ev.target as any).value) || 150;
          applyStyleToSelection(n => n.data('imgSize', v));
      };

      selImgPos.onchange = (ev) => {
          const v = (ev.target as any).value;
          applyStyleToSelection(n => n.data('imgPos', v));
      };

      const stopEnter = (ev: KeyboardEvent, el: HTMLElement) => {
          if (ev.key === 'Enter') {
              ev.preventDefault();  
              ev.stopPropagation(); 
              el.blur();            
          }
      };

      boxName.onkeydown = (ev) => stopEnter(ev, boxName);
      boxBorderWidth.onkeydown = (ev) => stopEnter(ev, boxBorderWidth);
      inpSize.onkeydown = (ev) => stopEnter(ev, inpSize);
      inpImgSize.onkeydown = (ev) => stopEnter(ev, inpImgSize);
      
      btnImgClear.onclick = () => {
          applyStyleToSelection(n => {
              n.data('imgUrl', '');
              n.data('imgName', '');
          });
          if (labelSpan) labelSpan.innerText = '';
          inpImgFile.style.color = '';
      };
  }

  // OPTIM 4 - cy.json() appelle ele.json() sur chaque element, qui fait un
  // util.copy PROFOND de l'objet data (verifie dans collection/index.js). Avec
  // des images base64 dans les donnees, chaque annulation recopiait tout le
  // document avant meme de le serialiser. Ici JSON.stringify lit directement
  // l'objet data vivant : plus de copie intermediaire.
  function saveState() { 
      stateManager.saveState(cy, setUnsavedState);
  }

  function undo() { 
      stateManager.undo(cy, refreshLayout, setUnsavedState);
  }

  function redo() { 
      stateManager.redo(cy, refreshLayout, setUnsavedState);
  }

  function setUnsavedState(newState: boolean) { 
    if (state.isInitializing) return; 
    state.hasUnsavedChanges = newState; 
    ui.btnSave.style.color = newState ? "#e53935" : "#4CAF50"; 
    ui.btnSave.innerText = newState ? t('topbar.file.save') + " \u25CF" : t('topbar.file.save'); 
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
              
              state.currentFilePath = file.path;
              cy.startBatch();
              cy.elements().remove(); 
              cy.add(treeData.graph.elements); 
              state.currentRootId = treeData.state.currentRootId || 'root'; 
              refreshLayout(true); 
              cy.endBatch();
              
              setTimeout(() => { state.hasUnsavedChanges = false; setUnsavedState(false); stateManager.resetStacks(); stateManager.resetStacks(); }, 100);
              if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
            } catch (err) { alert(t('alert.recent_error')); }
          };
          list.appendChild(btn);
        });
      }
    } catch (e) { console.warn(t('alert.history_read_error')); }
  }

  function createNewTree() {
      if (state.hasUnsavedChanges) {
          if (!confirm(t('confirm.new_tree'))) return;
      }
      
      // Sécurité : on réinitialise l'état d'édition
      if (closeCurrentEditor) closeCurrentEditor();
      isEditing = false;
      state.activeNode = null;
      state.clipboard = null;
      
      cy.startBatch();
      cy.elements().remove();
      // On génère la racine AVEC un premier enfant éditable
      cy.add([
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'root', name: t('default.root'), extinct: false, isBold: true, isItalic: false, sortIndex: 0, period: "" } },
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'n1', name: t('default.unnamed_branch'), extinct: false, isBold: false, isItalic: false, sortIndex: 0, period: "" } },
          { group: 'edges', data: { source: 'root', target: 'n1' } }
      ]);
      
      state.currentRootId = 'root';
      state.currentFilePath = undefined;
      
      state.layoutMode = state.appSettings.defaultLayout;
      ui.btnLayoutNormal.style.background = state.layoutMode === 'standard' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'standard' ? 'invert(1) brightness(2)' : 'none';
      ui.btnLayoutComb.style.background = state.layoutMode === 'comb' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'comb' ? 'invert(1) brightness(2)' : 'none';

      refreshLayout(true);
      cy.endBatch();
      
      setTimeout(() => { 
          state.hasUnsavedChanges = false; 
          setUnsavedState(false); 
          stateManager.resetStacks(); 
          stateManager.resetStacks(); 
      }, 100);
      
      if (ui.sidePanel.style.display === 'block') closeSidePanel();
  }

  async function executeSave(forceSaveAs = false) { 
      let trueRoot: any = cy.$id(state.currentRootId);
      while (trueRoot.incomers('node').filter((n: any) => !n.hasClass('box')).length > 0) {
          trueRoot = trueRoot.incomers('node').filter((n: any) => !n.hasClass('box')).first();
      }
      
      let rootName = 'Arbre_Phylogenetique';
      if (trueRoot.length > 0 && trueRoot.data('name') && trueRoot.data('name').trim() !== '') {
          rootName = trueRoot.data('name');
      }
      const absoluteRootId = trueRoot.id();

      const exportData = { version: "1.0", currentRootId: absoluteRootId, graph: cy.json() }; 

      try {
          const dataStr = JSON.stringify(exportData);
          const targetPath = forceSaveAs ? undefined : state.currentFilePath;
          
          // --- LIGNE DE DEBUG POUR COMPRENDRE LE BUG ---
          // alert(`Mode Enregistrer-sous forcé ? : ${forceSaveAs} \nChemin actuel en mémoire : ${state.currentFilePath || "VIDE / INCONNU"}`);
          
          const response = await window.electronAPI.saveFile(dataStr, targetPath);
          
          if (response.success && response.filePath) {
              state.currentFilePath = response.filePath; 
              saveToRecentFiles(rootName, exportData, state.currentFilePath); 
              setUnsavedState(false);
              
              // NOUVEAU : Message de confirmation visuelle
              alert(t('alert.save_success') + response.filePath);
              
          } else if (response.error) {
              alert(t('alert.save_error') + response.error);
          }
      } catch (err) {
          console.error(t('alert.backend_error'), err);
      }
  }

  function copyClade(node: any) { 
      const clade = node.union(node.successors()); 
      state.clipboard = { rootId: node.id(), elements: clade.map((ele: any) => ({ group: ele.group(), data: { ...ele.data() }, classes: ele.classes() })) }; 
  }
  
  function cutClade(node: any) {
    if (node.id() === 'root') return; 
    saveState();
    copyClade(node); 
    
    const cladeToDelete = node.union(node.successors());
    if (cladeToDelete.length > 0) {
      if (cladeToDelete.contains(cy.$id(state.currentRootId))) state.currentRootId = 'root';
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
      if (!state.clipboard) return; 
      saveState(); 
      const idMap: { [key: string]: string } = {}; 
      const newElements: any[] = []; 
      
      state.clipboard.elements.filter((e: any) => e.group === 'nodes').forEach((n: any) => { 
          const oldId = n.data.id; 
          const newId = 'taxon-' + Date.now() + Math.random().toString(36).substr(2, 5); 
          idMap[oldId] = newId; 
          newElements.push({ group: 'nodes', classes: n.classes, data: { ...n.data, id: newId } }); 
      }); 
      
      state.clipboard.elements.filter((e: any) => e.group === 'edges').forEach((e: any) => { 
          if (idMap[e.data.source] && idMap[e.data.target]) { 
              newElements.push({ group: 'edges', data: { source: idMap[e.data.source], target: idMap[e.data.target] } }); 
          } 
      }); 
      
      newElements.push({ group: 'edges', data: { source: targetNode.id(), target: idMap[state.clipboard.rootId] } }); 
      
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
          try { state.appSettings = { ...state.appSettings, ...JSON.parse(saved) }; } 
          catch(e) {}
      }
      ui.setTheme.value = state.appSettings.theme;
      ui.setLang.value = state.appSettings.lang;
      ui.setCanvasBg.checked = state.appSettings.canvasBgLinked;
      if (ui.setAutoUpdate) ui.setAutoUpdate.checked = state.appSettings.autoUpdateCheck !== false;
      ui.setLayout.value = state.appSettings.defaultLayout;
      ui.setSmartTax.checked = state.appSettings.smartTaxonomy;
      ui.setAutoItalic.checked = state.appSettings.autoItalic !== undefined ? state.appSettings.autoItalic : true;
      ui.setZoomSens.value = state.appSettings.zoomSensitivity.toString();
      ui.setFicheColor.value = state.appSettings.ficheColor;
      ui.setPdfTimeline.checked = state.appSettings.pdfTimeline;
      ui.setIndicatorFiche.checked = !!state.appSettings.showFicheIndicator;
      ui.setCountInvalid.checked = state.appSettings.countInvalid !== undefined ? state.appSettings.countInvalid : false;

      if (ui.setWallpaperOpacity && state.appSettings.wallpaperOpacity !== undefined) {
          ui.setWallpaperOpacity.value = state.appSettings.wallpaperOpacity.toString();
      }
      
      applyTheme(state.appSettings.theme);
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
      state.appSettings.theme = ui.setTheme.value;
      state.appSettings.lang = ui.setLang.value;
      state.appSettings.canvasBgLinked = ui.setCanvasBg.checked;
      if (ui.setAutoUpdate) state.appSettings.autoUpdateCheck = ui.setAutoUpdate.checked;
      state.appSettings.defaultLayout = ui.setLayout.value as 'standard' | 'comb';
      state.appSettings.smartTaxonomy = ui.setSmartTax.checked;
      state.appSettings.autoItalic = ui.setAutoItalic.checked;
      state.appSettings.zoomSensitivity = parseInt(ui.setZoomSens.value) || 5;
      state.appSettings.ficheColor = ui.setFicheColor.value;
      state.appSettings.pdfTimeline = ui.setPdfTimeline.checked;
      state.appSettings.showFicheIndicator = ui.setIndicatorFiche.checked;
      state.appSettings.countInvalid = ui.setCountInvalid.checked;
      if (ui.setWallpaperOpacity) {
          state.appSettings.wallpaperOpacity = parseInt(ui.setWallpaperOpacity.value);
          if (isNaN(state.appSettings.wallpaperOpacity)) state.appSettings.wallpaperOpacity = 100;
      }
      
      try {
          localStorage.setItem('cladistree_settings', JSON.stringify(state.appSettings));
      } catch (e) {
          alert(t('alert.wallpaper_too_large'));
          state.appSettings.wallpaper = ''; // On vide l'image pour éviter de bloquer le logiciel
          localStorage.setItem('cladistree_settings', JSON.stringify(state.appSettings));
          applyTheme(state.appSettings.theme); // On rafraîchit visuellement
      }
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
  if (state.appSettings.autoUpdateCheck !== false) {
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
      applyTheme(state.appSettings.theme);
  };

  // NOUVEAU : Mécanique du fond d'écran et de son opacité
  if (ui.btnUploadWallpaper) {
      ui.btnUploadWallpaper.onclick = () => ui.setWallpaperFile.click();
      ui.setWallpaperFile.onchange = (e: any) => {
          const file = e.target.files?.[0];
          if (file) {
              const reader = new FileReader();
              reader.onload = (eLoad) => {
                  state.appSettings.wallpaper = eLoad.target?.result as string;
                  saveAndApplyTheme();
              };
              reader.readAsDataURL(file);
          }
          ui.setWallpaperFile.value = ''; // Reset l'input
      };
      ui.btnClearWallpaper.onclick = () => {
          state.appSettings.wallpaper = '';
          saveAndApplyTheme();
      };
      ui.setWallpaperOpacity.oninput = () => {
          state.appSettings.wallpaperOpacity = parseInt(ui.setWallpaperOpacity.value);
          saveAndApplyTheme();
      };
  }

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
      if (state.hasUnsavedChanges) {
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
          state.appSettings = {
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
              wallpaper :'',
              wallpaperOpacity:100
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
  
  // Helper pour formater facilement un nom d'espèce (Ne modifie jamais les données sources)
  function formatSpeciesName(rawSpeciesName: string, shouldAbbreviate: boolean): string {
      if (!rawSpeciesName || rawSpeciesName.trim() === '') return '';
      
      // Extraction des préfixes (ex: † ") et suffixes (ex: ")
      let prefixMatch = rawSpeciesName.match(/^[†+”"«“'’\s]+/);
      let prefix = prefixMatch ? prefixMatch[0] : '';
      let sClean = rawSpeciesName.substring(prefix.length).trim();
      
      let suffixMatch = sClean.match(/[”"»”'’\s]+$/);
      let suffix = suffixMatch ? suffixMatch[0] : '';
      if (suffix) sClean = sClean.substring(0, sClean.length - suffix.length);

      const words = sClean.split(/\s+/);
      if (words.length < 2) return rawSpeciesName; // Pas un binôme (ou polynôme)

      let genus = words[0];
      let initial = genus.charAt(0).toUpperCase();
      let epithets = words.slice(1).join(' ');

      if (shouldAbbreviate) {
          // Format compact : initiale du genre suivie d'un point
          return prefix + initial + '. ' + epithets + suffix;
      } else {
          // Format complet : on s'assure d'avoir la majuscule sur le genre
          let fullGenus = initial + (genus.length > 1 ? genus.slice(1).toLowerCase() : '.');
          return prefix + fullGenus + ' ' + epithets + suffix;
      }
  }

  function getDynamicNodeName(node: any, forceFormat?: 'full' | 'abbrev'): string {
      if (!node) return '';
      const rawName = node.data('name');
      if (!rawName || rawName.trim() === '') return '';
      
      const rank = node.data('rank');
      const formatToUse = forceFormat || state.appSettings.speciesFormat;
      
      // En mode "Noms complets", le Genre s'efface : c'est l'espèce descendante
      // qui affiche le binôme complet ("Tyrannosaurus rex").
      if (formatToUse === 'full' && rank === 'Genre') {
          const hasChildren = node.outgoers && node.outgoers('node').length > 0;
          if (hasChildren) return '';
      }
      
      const isSpeciesRank = rank === 'Espèce' || rank === 'Sous-espèce';
      const seemsLikeSpecies = rawName.split(/\s+/).length >= 2;

      if (isSpeciesRank || seemsLikeSpecies) {
          let prefixMatch = rawName.match(/^[†+”"«“'’\s]+/);
          let sClean = rawName.substring(prefixMatch ? prefixMatch[0].length : 0).trim();
          let genusHint = sClean.split(/\s+/)[0].replace(/\./g, '').toLowerCase(); 
          
          let parentMatchFound = false;
          
          if (node.incomers) {
              let curr = node.incomers('node').first();
              while(curr && curr.length > 0 && !curr.hasClass('box')) {
                   const pRank = curr.data('rank');
                   let pName = (curr.data('name') || '').replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim();
                   let pWord = pName.split(/\s+/)[0].toLowerCase();
                   
                   // Si le mot complet correspond, on valide l'abréviation
                   if (pWord === genusHint || (genusHint.length === 1 && pWord.startsWith(genusHint))) { 
                       parentMatchFound = true; 
                       break; 
                   }
                   
                   // On s'arrête si on croise formellement un genre différent (ex: Pan troglodytes sous la famille Hominidae)
                   if (pRank === 'Genre') {
                       break;
                   }
                   curr = curr.incomers('node').first();
              }
          }
          
          // On abrège SI : le format global est sur "Abrégé" ET que l'ancêtre exact a été trouvé
          const shouldAbbrev = (formatToUse === 'abbrev') && parentMatchFound;
          return formatSpeciesName(rawName, shouldAbbrev);
      }
      
      return rawName;
  }

  // OPTIM 2 - constante au lieu d'une reconstruction + encodeURIComponent par
  // noeud et par refresh.
  const TEXT_ABOVE_BAR_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2"><rect x="0" y="0" width="100" height="2" fill="black"/></svg>');

  const cy = cytoscape({
    container: container, 
    autoungrabify: false, userZoomingEnabled: false, userPanningEnabled: false, boxSelectionEnabled: false,
    desktopTapThreshold: 20, touchTapThreshold: 30, pixelRatio: 'auto', textureOnViewport: true, motionBlur: true,
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
          'z-index': 10, 'z-index-compare': 'manual', 
          'shape': (n: any) => n.data('cShape') || 'rectangle',
          'text-valign': 'center', 'text-halign': 'center', 
          'active-bg-opacity': 0, 'active-bg-size': 0, 'overlay-opacity': 0,
          'text-wrap': 'wrap', 'line-height': 1.2,
          'text-margin-y': (n: any) => n.data('cTextMarginY') || 0,
          'text-margin-x': (n: any) => n.data('cTextMarginX') || 0,
          'width': (n: any) => n.data('cWidth') || 0.1,
          'height': (n: any) => n.data('cHeight') || 0.1,
          'label': (n: any) => n.data('computedLabel') || '',
          'color': '#000000', 'text-outline-width': 0, 'background-clip': 'none',
          'border-width': (n: any) => n.data('cBorderW') !== undefined ? n.data('cBorderW') : (n.data('hasFrame') ? 2 : 0),
          'border-color': (n: any) => n.data('cBorderCol') || n.data('frameColor') || '#000000',
          'background-color': (n: any) => n.data('cBgCol') || (n.data('hasFrame') ? (n.data('frameColor') || '#000000') : '#ffffff'),
          'background-opacity': (n: any) => n.data('cBgOpac') !== undefined ? n.data('cBgOpac') : (n.data('hasFrame') ? 0.05 : 0.001),
          'font-family': (n: any) => n.data('fontFamily') || 'serif',
          'font-size': (n: any) => n.data('fontSize') || 16,
          'font-weight': (n: any) => n.data('fontWeight') || 'normal',
          'font-style': (n: any) => n.data('fontStyle') || 'normal',
          'text-background-color': 'transparent', // Fini les carrés gris !
          'text-background-opacity': 0,
          'background-image': (n: any) => n.data('bgUrls') || 'none',
          'background-width': (n: any) => n.data('bgWidthsStr') || '0px',
          'background-height': (n: any) => n.data('bgHeightsStr') || '0px',
          'background-position-x': (n: any) => n.data('bgPosXsStr') || '50%',
          'background-position-y': (n: any) => n.data('bgPosYsStr') || '50%',
          'background-fit': (n: any) => n.data('bgFitsStr') || 'none',
          'text-events': 'yes' // Règle miracle : rend les taxons terminaux sélectionnables au clic !
        } 
      },
      {
        selector: '.box',
        style: {
          'z-index': 0, 'z-index-compare': 'manual', 'shape': (n: any) => n.data('boxShape') || 'round-rectangle',
          'background-opacity': (n: any) => n.data('boxOpacity') !== undefined ? n.data('boxOpacity') : 0.1,
          'background-color': (n: any) => n.data('boxColor') || '#FF9800',
          'border-width': (n: any) => n.data('boxBorderWidth') !== undefined ? n.data('boxBorderWidth') : 2,
          'border-style': (n: any) => n.data('boxBorderStyle') || 'dashed',
          'border-color': (n: any) => n.data('boxColor') || '#FF9800',
          'text-valign': 'center', 'text-halign': 'center', 'text-outline-width': 2, 
          'text-outline-color': '#ffffff', 'color': (n: any) => n.data('boxColor') || '#FF9800',
          'label': 'data(name)', 'text-wrap': 'wrap', 'line-height': 1.2, 'font-weight': 'bold',
          'font-family': (n: any) => n.data('fontFamily') || 'serif',
          'font-size': (n: any) => n.data('fontSize') || 14,
          'font-style': (n: any) => n.data('isItalic') ? 'italic' : 'normal'
        }
      },
      {
          selector: 'node[!name], node[name = ""]',
          style: { 'background-opacity': 0, 'border-opacity': 0, 'border-width': '0px', 'padding': '0px', 'width': '0.1px', 'height': '0.1px' }
      },
      { 
          selector: '.taxon:selected', 
          style: { 
              'text-background-color': '#99CCFF', 
              'text-background-opacity': 0.6,
              'text-background-shape': 'roundrectangle', 
              'text-background-padding': '4px'
          } as any 
      },
      { 
          selector: '.box:selected', 
          style: { 
              'border-width': 4, 'border-style': 'dashed', 'border-color': '#2196F3'
          } as any 
      },
      { selector: 'node[?isChrono]', style: { 'overlay-opacity': 0 } as any },
      {
          selector: 'edge',
          style: {
              'z-index': 5, 'z-index-compare': 'manual', 'width': 2, 'line-color': '#000000', 
              'curve-style': 'taxi', 'taxi-direction': 'rightward', 'taxi-turn': '15px', 'target-arrow-shape': 'none',
              'source-endpoint': 'outside-to-node', 'target-endpoint': 'outside-to-node'
          }
      },
      {
          selector: 'node[imgUrl != ""]', 
          style: { 'text-valign': 'center', 'text-halign': 'center', 'background-fit': 'none', 'padding': '5px' }
      }
    ]
  });

  function checkAutoRank(node: any) {
    if (!state.appSettings.smartTaxonomy) return;

    let name = node.data('name') || '';
    let prefixMatch = name.match(/^[†+”"«“'’\s]+/);
    let prefix = prefixMatch ? prefixMatch[0] : '';
    let cleanName = name.substring(prefix.length).replace(/[”"»”'’\s]+$/, '').trim(); 
    
    // Ignore les noms génériques pour ne pas les classer en Espèce
    if (cleanName.toLowerCase().includes('clade') || cleanName.toLowerCase().includes('taxon') || cleanName.toLowerCase().includes('groupe')) return;

    let currentRank = node.data('rank');
    let words = cleanName.split(/\s+/);

    // 1. Détection de saisie abrégée (ex: "C. apertus") et auto-expansion en mémoire
    if (words.length >= 2 && /^[a-zA-Z][.?]+$/.test(words[0])) {
        const initial = words[0].charAt(0).toUpperCase();
        let curr = node.incomers('node').first();
        while (curr && curr.length > 0 && !curr.hasClass('box')) {
            let pName = (curr.data('name') || '').replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim();
            let pFirstWord = pName.split(/\s+/)[0];
            
            if (pFirstWord && pFirstWord.toUpperCase().startsWith(initial)) {
                // Correspondance ! On remplace la donnée pure par le nom complet en mémoire
                const fullName = prefix + pFirstWord + ' ' + words.slice(1).join(' ');
                node.data('name', fullName);
                cleanName = pFirstWord + ' ' + words.slice(1).join(' ');
                words = cleanName.split(/\s+/); // Mise à jour pour la suite de l'analyse
                break;
            }
            curr = curr.incomers('node').first();
        }
    }

    // 2. Assignation automatique des rangs
    if (/^[A-Z][\w.\?]*\s+[\w.\?]+\s+[\w.\?]+/.test(cleanName)) {
      if (currentRank === 'Clade (non-classé)') { 
          currentRank = 'Sous-espèce'; 
          node.data('rank', currentRank); 
      }
    }
    else if (/^[A-Z][.?]+\s*\S+/.test(cleanName) || /^[A-Z][a-z]+\s+[a-z]+/.test(cleanName)) {
      if (currentRank === 'Clade (non-classé)') { 
          currentRank = 'Espèce'; 
          node.data('rank', currentRank); 
      }
      
      let genusHint = words[0].toLowerCase();
      
      let curr = node.incomers('node').first();
      while (curr && curr.length > 0 && !curr.hasClass('box')) {
        const pRank = curr.data('rank');
        const pName = curr.data('name');
        
        if (pRank === 'Genre') break; 
        
        if (pRank === 'Clade (non-classé)' && pName && pName.trim() !== '' && pName !== t('default.unnamed_branch')) {
          const pClean = pName.replace(/^[†+]\s*/, '').replace(/^["'«“]\s*/, '').replace(/\s*["'»”]$/, '').trim();
          const pWord = pClean.split(/\s+/)[0].toLowerCase();
          
          // SÉCURITÉ MAJEURE : On assigne le rang parent à Genre QUE si le mot exact correspond !
          if (pWord === genusHint) {
              curr.data('rank', 'Genre');
              if (state.appSettings.autoItalic) curr.data('isItalic', true);
          }
          break; 
        }
        curr = curr.incomers('node').first();
      }
    }

    if (state.appSettings.autoItalic) {
        if (currentRank === 'Espèce' || currentRank === 'Sous-espèce' || currentRank === 'Genre') {
            node.data('isItalic', true);
        }
    }
  }

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
        if (!state.appSettings.countInvalid) {
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
        
        const isSpeciesRank = explicitRank === 'Espèce' || explicitRank === 'Sous-espèce' || (state.appSettings.smartTaxonomy && (!explicitRank || explicitRank === 'Clade (non-classé)') && words.length >= 2);

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

      // GESTION DU FOND D'ÉCRAN (via un calque dédié pour gérer l'opacité sans affecter le reste)
      let wpLayer = document.getElementById('wallpaper-layer');
      if (!wpLayer) {
          wpLayer = document.createElement('div');
          wpLayer.id = 'wallpaper-layer';
          wpLayer.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; pointer-events:none; z-index:-1;";
          document.body.insertBefore(wpLayer, document.body.firstChild);
      }

      const hasWallpaper = state.appSettings.wallpaper && state.appSettings.wallpaper.trim() !== '';

      if (hasWallpaper) {
          wpLayer.style.backgroundImage = `url(${state.appSettings.wallpaper})`;
          wpLayer.style.backgroundSize = 'cover';
          wpLayer.style.backgroundPosition = 'center';
          wpLayer.style.opacity = (state.appSettings.wallpaperOpacity / 100).toString();
          
          if (ui.btnClearWallpaper) ui.btnClearWallpaper.style.display = 'block';
          if (ui.containerWallpaperOpacity) ui.containerWallpaperOpacity.style.display = 'flex';
          
          container.style.setProperty('background-color', 'transparent', 'important');
      } else {
          wpLayer.style.backgroundImage = 'none';
          if (ui.btnClearWallpaper) ui.btnClearWallpaper.style.display = 'none';
          if (ui.containerWallpaperOpacity) ui.containerWallpaperOpacity.style.display = 'none';

          if (state.appSettings.canvasBgLinked) {
              container.style.setProperty('background-color', 'transparent', 'important');
          } else {
              container.style.setProperty('background-color', '#ffffff', 'important');
          }
      }

      // CORRECTION DES LIGNES (Finies les lignes grises !)
      setTimeout(() => {
          if (state.appSettings.canvasBgLinked || hasWallpaper) {
              // Si le fond est lié/transparent, les lignes prennent la couleur forte du texte (ex: Blanc sur Dark, Noir sur Light)
              const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
              cy.style().selector('.taxon').style({ 'color': textColor }).update();
              cy.style().selector('edge').style({ 'line-color': textColor }).update();
          } else {
              // Si le fond est blanc par défaut, les lignes et le texte sont strictement noirs.
              cy.style().selector('.taxon').style({ 'color': '#000000' }).update();
              cy.style().selector('edge').style({ 'line-color': '#000000' }).update();
          }
      }, 10);
  }

  function updateBreadcrumbs() {
    let path: any[] = []; let curr: any = cy.$id(state.currentRootId);
    
    // 1. Construction du chemin complet
    while (curr.length > 0) { 
        const rawName = curr.data('name'); 
        if (rawName && rawName.trim() !== '') { path.unshift({ id: curr.id(), name: rawName }); } 
        curr = curr.incomers('node').first(); 
    }
    if (path.length === 0) path.push({ id: state.currentRootId, name: t('default.unnamed_sheet') }); 
    
    ui.breadcrumbsBar.innerHTML = '';

    // 2. Fonction pour dessiner un maillon cliquable
    const renderCrumb = (p: any, isLast: boolean) => {
      const span = document.createElement('span'); 
      span.innerText = p.name; 
      span.style.cursor = "pointer"; 
      span.style.color = isLast ? "var(--text-main)" : "#2196F3"; 
      span.style.fontWeight = isLast ? "bold" : "normal"; 
      span.style.textDecoration = isLast ? "none" : "underline";
      span.onclick = () => { saveState(); state.currentRootId = p.id; refreshLayout(true); }; 
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
    let curr = cy.$id(state.currentRootId);
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
        const isActive = n.id() === state.currentRootId;

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

        btn.onclick = () => { state.currentRootId = n.id(); refreshLayout(true); };
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
            if (activePath.has(nId) && nId !== state.currentRootId) {
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
      if (state.layoutMode !== 'chrono' || !chronoRulerUpdater) {
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
      if (state.layoutMode !== 'chrono') return;
      
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
      const themeBgColor = getComputedStyle(document.body).getPropertyValue('--bg-panel').trim() || '#ffffff';
      const themeTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
      
      cy.startBatch(); 
      updateBreadcrumbs(); 
      updateSheetsBar(); 
      updateCounters();
      analyzeTimeBounds();
      
      const nodesById = new Map<string, any>();
      const childrenMap = new Map<string, any[]>();
      
      cy.nodes().forEach(node => { nodesById.set(node.id(), node); });
      cy.edges().forEach(e => {
          if (e.id() === 'ghost-edge') return;
          const src = e.data('source');
          if (!childrenMap.has(src)) childrenMap.set(src, []);
          const targetNode = nodesById.get(e.data('target'));
          if (targetNode && !targetNode.hasClass('box')) childrenMap.get(src)!.push(targetNode);
      });
      childrenMap.forEach(arr => arr.sort((a, b) => (a.data('sortIndex') || 0) - (b.data('sortIndex') || 0)));

      const visibleNodes = new Set<string>();
      const traverseVisibility = (nodeId: string) => {
          visibleNodes.add(nodeId);
          const node = nodesById.get(nodeId);
          if (!node) return;
          if (!node.data('hasNewSheet') || nodeId === state.currentRootId) {
              if (!node.data('collapsed')) (childrenMap.get(nodeId) || []).forEach(c => traverseVisibility(c.id()));
          }
      };
      if (nodesById.has(state.currentRootId)) traverseVisibility(state.currentRootId);
      if (nodesById.has('ghost-node')) visibleNodes.add('ghost-node');

      const getStartAgeSafe = (p: string) => {
          if (!p || p.trim() === '') return null;
          const parseMa = (s: string) => parseFloat(s.replace(',', '.'));
          const rangeMatch = p.match(/([\d.,]+)\s*-\s*([\d.,]+)/);
          if (rangeMatch) return Math.max(parseMa(rangeMatch[1]), parseMa(rangeMatch[2]));
          const singleMatch = p.match(/([\d.,]+)/);
          if (singleMatch) return parseMa(singleMatch[1]);
          return null;
      };

      visibleNodes.forEach(nodeId => {
          const node = nodesById.get(nodeId);
          if (!node || node.hasClass('box') || nodeId === 'ghost-node') return;
          
          const hasLink = node.data('hasNewSheet') && nodeId !== state.currentRootId;
          const imgUrlData = node.data('imgUrl');
          
          // Vérification absolue du statut terminal (prend en compte les clades fermés)
          const isSheetBreak = node.data('hasNewSheet') && nodeId !== state.currentRootId;
          const isCollapsed = node.data('collapsed');
          const visualChildren = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
          const isLeaf = visualChildren.length === 0;

          // DÉSACTIVATION : Si Chronogramme + Intermédiaire, on simule l'absence d'image
          let hasImage = imgUrlData && imgUrlData.trim() !== '';
          if (state.layoutMode === 'chrono' && !isLeaf) {
              hasImage = false;
          }

          const dynamicName = getDynamicNodeName(node);
          const isEmptyBranch = (dynamicName === '') && !hasImage;
          node.data('isEmpty', isEmptyBranch);

          const fontSize = node.data('fontSize') || 16;
          const cacheKey = `${dynamicName}_${node.data('extinct')}_${node.data('isBold')}_${node.data('isItalic')}_${node.data('collapsed')}_${hasLink}_${fontSize}_${node.data('fontFamily') || 'serif'}`;
          let textW = textWidthCache.get(cacheKey);
          if (textW === undefined) {
              textW = measureTextWidth(dynamicName, node.data('extinct'), node.data('isBold'), node.data('isItalic'), node.data('collapsed'), hasLink, fontSize, node.data('fontFamily') || 'serif');
              cacheTextWidth(cacheKey, textW);
          }
          const linesCount = dynamicName ? dynamicName.split('\n').length : 1;
          const textH = Math.max(24, linesCount * (fontSize * 1.2));
          
          let blockW = textW, blockH = textH;
          let imgOffsetX = 0, imgOffsetY = 0, txtOffsetX = 0, txtOffsetY = 0;
          
          if (hasImage) {
              const iW = node.data('imgSize') || 150; 
              const iH = iW / (node.data('imgRatio') || 1);
              const GAP = 12;
              
              // NOUVELLE LOGIQUE : Top forcé si le taxon ou un ancêtre est daté
              let iPos = node.data('imgPos') || 'left';
              if (state.layoutMode === 'chrono' && !isLeaf) {
                  let explicitlyDated = false;
                  if (getStartAgeSafe(node.data('period')) !== null) explicitlyDated = true; 
                  else {
                      let curr = node.incomers('node').first();
                      while (curr && curr.length > 0 && !curr.hasClass('box')) {
                          if (getStartAgeSafe(curr.data('period')) !== null) { explicitlyDated = true; break; }
                          curr = curr.incomers('node').first();
                      }
                  }
                  iPos = explicitlyDated ? 'top' : 'left';
              }

              if (iPos === 'left') {
                  blockW = iW + GAP + textW; blockH = Math.max(iH, textH);
                  imgOffsetX = -blockW/2 + iW/2; txtOffsetX = blockW/2 - textW/2;
              } else if (iPos === 'right') {
                  blockW = textW + GAP + iW; blockH = Math.max(textH, iH);
                  txtOffsetX = -blockW/2 + textW/2; imgOffsetX = blockW/2 - iW/2;
              } else if (iPos === 'top') {
                  blockW = Math.max(textW, iW); blockH = iH + GAP + textH;
                  imgOffsetY = -blockH/2 + iH/2; txtOffsetX = 0; txtOffsetY = blockH/2 - textH/2;
              } else {
                  blockW = Math.max(textW, iW); blockH = textH + GAP + iH;
                  txtOffsetY = -blockH/2 + textH/2; imgOffsetX = 0; imgOffsetY = blockH/2 - iH/2;
              }
          }

          if (node.data('textAbove')) txtOffsetY -= (fontSize * 0.8) + 8;

          const pad = node.data('hasFrame') ? 18 : 10;
          const finalW = isEmptyBranch ? 0.1 : blockW + pad*2;
          const finalH = isEmptyBranch ? 0.1 : blockH + pad*2;
          
          let labelText = node.data('extinct') && !dynamicName.startsWith('\u2020') ? '\u2020 ' + dynamicName : dynamicName; 
          if (node.data('collapsed')) labelText += ' [+]';
          if (node.data('linkedFileName')) labelText += ' \u2197'; 
          if (node.data('hasNewSheet') && nodeId !== state.currentRootId) labelText += ' \u2794';
          const d0 = node.data();
          const hasSheetContent = !!((d0.discoveryDate && d0.discoveryDate.trim() !== '') || (d0.author && d0.author.trim() !== '') || (d0.distribution && d0.distribution.trim() !== '') || (d0.size && d0.size.trim() !== '') || (d0.mass && d0.mass.trim() !== '') || (d0.period && d0.period.trim() !== '') || (d0.synapomorphies && d0.synapomorphies.trim() !== '') || (d0.notes && d0.notes.trim() !== '') || (d0.iucn && d0.iucn.trim() !== '') || (d0.sheetImage && d0.sheetImage.trim() !== ''));
          if (state.appSettings.showFicheIndicator && hasSheetContent) labelText += ' \u{1F5CF}';

          node.data({
              renderWidth: finalW, renderHeight: finalH,
              imgOffsetX: imgOffsetX, imgOffsetY: imgOffsetY, textMarginX: txtOffsetX, textMarginY: txtOffsetY,
              labelW: blockW, labelH: blockH, displayName: dynamicName, computedLabel: labelText, hasSheetContent: hasSheetContent,
              fontWeight: node.data('isBold') ? 'bold' : 'normal', fontStyle: node.data('isItalic') ? 'italic' : 'normal',
              
              // Initialisation vitale des variables pour la feuille de style
              cWidth: finalW, cHeight: finalH, cTextMarginX: txtOffsetX, cTextMarginY: txtOffsetY,
              cTxtBgCol: 'transparent', cTxtBgOpac: 0, cShape: 'rectangle',
              cBorderW: node.data('hasFrame') ? 2 : 0, cBorderCol: node.data('frameColor') || '#000000',
              cBgCol: node.data('hasFrame') ? (node.data('frameColor') || '#000000') : '#ffffff',
              cBgOpac: node.data('hasFrame') ? 0.05 : 0.001
          });
      });

      let currentY = 0; const xGap = 40; const yGap = state.layoutMode === 'comb' ? 16 : 60;   
      const calculatedPositions = new Map<string, {x: number, y: number}>();
      let maxLeafLeftX = 0; const stepsToLeafMap = new Map<string, number>();
      
      if (state.layoutMode === 'comb') {
          // 1. Calcul de la largeur totale nécessaire de l'arbre pour placer la ligne d'arrivée
          const calcMaxX = (nodeId: string, currentX: number) => {
              const n = nodesById.get(nodeId);
              if (!n) return;
              const w = n.data('renderWidth') || 1;
              const isSheetBreak = n.data('hasNewSheet') && nodeId !== state.currentRootId;
              const isCollapsed = n.data('collapsed');
              const kids = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
              
              if (kids.length === 0) {
                  if (currentX > maxLeafLeftX) maxLeafLeftX = currentX;
              } else {
                  kids.forEach(c => calcMaxX(c.id(), currentX + w + xGap));
              }
          };
          if (nodesById.has(state.currentRootId)) calcMaxX(state.currentRootId, 0);

          // 2. Calcul du nombre de descendants directs (étapes) jusqu'à la feuille pour chaque branche
          const computeSteps = (nodeId: string): number => {
              if (stepsToLeafMap.has(nodeId)) return stepsToLeafMap.get(nodeId)!;
              const node = nodesById.get(nodeId);
              const childrenArray = (!node || (node.data('hasNewSheet') && nodeId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nodeId) || []);
              if (childrenArray.length === 0) { stepsToLeafMap.set(nodeId, 0); return 0; } 
              else {
                  let maxSteps = 0;
                  childrenArray.forEach(child => { 
                      const steps = computeSteps(child.id()); 
                      if (steps > maxSteps) maxSteps = steps; 
                  });
                  stepsToLeafMap.set(nodeId, maxSteps + 1); 
                  return maxSteps + 1;
              }
          };
          if (nodesById.has(state.currentRootId)) computeSteps(state.currentRootId);
      }

      const fastWalk = (nodeId: string, leftX: number): number => {
          const node = nodesById.get(nodeId);
          if (!node) return 0;
          const childrenArray = ((node.data('hasNewSheet') && nodeId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nodeId) || []);
          const myWidth = node.data('renderWidth') || 1; 
          const myHeight = node.data('renderHeight') || 24; 
          
          let actualLeftX = leftX; 
          // RÈGLE D'OR DU PHÉNOGRAMME : Toutes les feuilles terminales vont se coller à la ligne d'arrivée
          if (state.layoutMode === 'comb' && childrenArray.length === 0) {
              actualLeftX = Math.max(leftX, maxLeafLeftX);
          }

          const myCenterX = actualLeftX + (myWidth / 2); 
          const rightX = actualLeftX + myWidth;
          
          if (childrenArray.length === 0) { 
              const nodeY = currentY + (myHeight / 2);
              calculatedPositions.set(nodeId, { x: myCenterX, y: nodeY }); 
              currentY = nodeY + (myHeight / 2) + yGap; 
              return nodeY; 
          } else {
              let startY = currentY; let sumY = 0; 
              childrenArray.forEach(child => { 
                  let nextLeftX = rightX + xGap; 
                  
                  if (state.layoutMode === 'comb') {
                      // LOGIQUE D'ÉQUIDISTANCE PAR BRANCHE :
                      // On calcule l'espace physique restant jusqu'à la ligne finale, divisé par le nombre d'étapes de CETTE branche
                      const childSteps = stepsToLeafMap.get(child.id()) || 0;
                      const stepDist = (maxLeafLeftX - actualLeftX) / (childSteps + 1);
                      nextLeftX = Math.max(rightX + xGap, actualLeftX + stepDist);
                  }
                  
                  sumY += fastWalk(child.id(), nextLeftX); 
              }); 
              let avgY = sumY / childrenArray.length; 
              
              const topBleed = startY - (avgY - myHeight / 2);
              if (topBleed > 0) {
                  const shiftDescendants = (nId: string) => {
                      const pos = calculatedPositions.get(nId);
                      if (pos) pos.y += topBleed;
                      (childrenMap.get(nId) || []).forEach(c => shiftDescendants(c.id()));
                  };
                  childrenArray.forEach(c => shiftDescendants(c.id()));
                  avgY += topBleed; currentY += topBleed;
              }
              if (avgY + (myHeight / 2) + yGap > currentY) currentY = avgY + (myHeight / 2) + yGap;
              calculatedPositions.set(nodeId, { x: myCenterX, y: avgY }); 
              return avgY; 
          }
      };
      
      if (nodesById.has(state.currentRootId)) fastWalk(state.currentRootId, 0);

      cy.nodes().forEach(n => {
          if (n.hasClass('box')) return;
          n.removeStyle(); // Suppression des styles en ligne parasites !
          if (visibleNodes.has(n.id())) {
              n.style('display', 'element');
              const pos = calculatedPositions.get(n.id());
              if (pos) n.position(pos);
          } else n.style('display', 'none');
      });

      if (state.layoutMode !== 'chrono') {
          cy.edges().forEach(e => {
              if (e.id() === 'ghost-edge') return;
              e.removeStyle();
          });
      }

      cy.$('.strato-bg').remove(); 

      if (state.layoutMode === 'chrono' && state.currentRootId) {
          const pxPerMa = CHRONO_PX_PER_MA;
          const parseMa = (val: any) => parseFloat(String(val).replace(/[^\d.,]/g, '').replace(',', '.'));
          const PERIOD_NAMES = CHRONO_PERIOD_KEYS.map(k => t(k));

          const nodeAges = new Map<string, number>();
          const visitingAge = new Set<string>();
          const undatedNodes = new Set<string>();
          const datedFloor = new Map<string, number | null>();
          const heightBelow = new Map<string, number>();
          const undatedHeight = new Map<string, number>();
          const visitedAnchor = new Set<string>();

          const visualChildrenOf = (nId: string) => {
              const node = nodesById.get(nId);
              return (!node || (node.data('hasNewSheet') && nId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nId) || []);
          };

          const computeAnchors = (nId: string): void => {
              if (visitedAnchor.has(nId)) return;
              visitedAnchor.add(nId);
              const node = nodesById.get(nId);
              if (!node) { datedFloor.set(nId, null); heightBelow.set(nId, 0); undatedHeight.set(nId, 0); return; }

              const kids = visualChildrenOf(nId);
              kids.forEach((c: any) => computeAnchors(c.id()));

              let floor: number | null = null; let below = 0;
              kids.forEach((c: any) => {
                  const cid = c.id();
                  const cExp = getStartAgeSafe(c.data('period'));
                  const cFloor = cExp !== null ? cExp : (datedFloor.get(cid) ?? null);
                  if (cFloor !== null && (floor === null || cFloor > floor)) floor = cFloor;
                  const cH = cExp !== null ? 0 : (undatedHeight.get(cid) ?? 0);
                  if (cH > below) below = cH;
              });

              datedFloor.set(nId, floor); heightBelow.set(nId, below);
              undatedHeight.set(nId, (getStartAgeSafe(node.data('period')) !== null || kids.length === 0) ? 0 : 1 + below);
          };

          cy.nodes().forEach((n: any) => { if (!n.hasClass('box')) computeAnchors(n.id()); });

          const SEP_MIN_MA = 0.25;
          const dateConflicts = new Set<string>();
          const GENUS_RANKS = new Set(['Genre', 'Sous-genre']);

          const calculateAge = (nId: string): number => {
              if (nodeAges.has(nId)) return nodeAges.get(nId)!;
              const node = nodesById.get(nId);
              if (!node || visitingAge.has(nId)) return 0; 
              visitingAge.add(nId);

              const children = visualChildrenOf(nId);
              let maxChildAge = -Infinity;
              let maxChildReq = -Infinity;

              children.forEach(c => {
                  const cAge = calculateAge(c.id());
                  if (cAge > maxChildAge) maxChildAge = cAge;
                  const cLabelW = c.data('labelW') || 0;
                  const reqAge = cAge + (cLabelW / CHRONO_PX_PER_MA) + 1.5; 
                  if (reqAge > maxChildReq) maxChildReq = reqAge;
              });

              const explicitAge = getStartAgeSafe(node.data('period'));
              let assignedAge: number;

              if (children.length === 0) {
                  if (explicitAge !== null) assignedAge = explicitAge;
                  else { undatedNodes.add(nId); assignedAge = 0; }
              } else if (explicitAge !== null) {
                  const floor = datedFloor.get(nId) ?? null;
                  const minFeasible = floor === null ? SEP_MIN_MA : floor + SEP_MIN_MA * ((heightBelow.get(nId) ?? 0) + 1);
                  if (explicitAge < minFeasible) { dateConflicts.add(nId); assignedAge = minFeasible; } 
                  else assignedAge = explicitAge;
              } else {
                  const datedChildren = children.filter(c => !undatedNodes.has(c.id()));
                  if (datedChildren.length === 0) { undatedNodes.add(nId); assignedAge = 0; } 
                  else if (GENUS_RANKS.has(node.data('rank'))) {
                      assignedAge = children.length <= 1 ? maxChildReq : maxChildReq + Math.max(0.5, maxChildAge * 0.005);
                  } else {
                      assignedAge = Math.max(maxChildAge + Math.max(10, maxChildAge * 0.15), maxChildReq); 
                  }
              }

              visitingAge.delete(nId); nodeAges.set(nId, assignedAge);
              return assignedAge;
          };

          cy.nodes().forEach((n: any) => { if (!n.hasClass('box')) calculateAge(n.id()); });

          const interpolated = new Set<string>();
          const interpolateAges = (nId: string, parentAge: number | null, ancestorDated: boolean) => {
              if (interpolated.has(nId)) return;
              interpolated.add(nId);
              const node = nodesById.get(nId);
              if (!node) return;
              const selfDated = getStartAgeSafe(node.data('period')) !== null;
              const kids = visualChildrenOf(nId);
              let age = nodeAges.get(nId) ?? 0;

              if (!selfDated && kids.length > 0 && ancestorDated && parentAge !== null) {
                  const floor = datedFloor.get(nId) ?? null;
                  if (floor !== null) {
                      const levels = Math.max(1, undatedHeight.get(nId) ?? 1);
                      const span = parentAge - floor;
                      age = span > SEP_MIN_MA * (levels + 1) ? floor + span * (levels / (levels + 1)) : floor + SEP_MIN_MA * levels;
                      nodeAges.set(nId, age);
                  }
              }
              kids.forEach((c: any) => interpolateAges(c.id(), age, ancestorDated || selfDated));
          };

          cy.nodes().forEach((n: any) => { if (!n.hasClass('box') && n.incomers('edge').length === 0) interpolateAges(n.id(), null, false); });
          cy.nodes().forEach((n: any) => { if (!n.hasClass('box')) interpolateAges(n.id(), null, false); });

          const visitedPlace = new Set<string>();
          const placeUndated = (nId: string, parentAge: number | null) => {
              visitedPlace.add(nId); 
              let age = nodeAges.get(nId) ?? 0;
              if (undatedNodes.has(nId)) {
                  if (parentAge === null) age = 100;
                  else age = Math.max(0, parentAge - Math.max(2, parentAge * 0.08));
                  nodeAges.set(nId, age);
              }
              visualChildrenOf(nId).forEach(c => placeUndated(c.id(), age));
          };

          cy.nodes().forEach((n: any) => { if (!n.hasClass('box') && n.incomers('edge').length === 0 && !visitedPlace.has(n.id())) placeUndated(n.id(), null); });
          cy.nodes().forEach((n: any) => { if (!n.hasClass('box') && undatedNodes.has(n.id()) && !visitedPlace.has(n.id())) nodeAges.set(n.id(), 100); });

          const CHRONO_BAR_H = 12; const CHRONO_TICK_H = 14; const CHRONO_ROW_MIN = 18;        
          const CHRONO_LABEL_GAP = 6; const CHRONO_GAP_MIN = 12; const CHRONO_K_LANE = 2;       
          const CHRONO_EMPTY_ROW = 8; const CHRONO_GAP_EMPTY = 4;       
          const CHRONO_LABEL_COLUMN = false;

          type ChronoRaw = { startAge: number; endAge: number; isInterval: boolean; isLeaf: boolean; isEmpty: boolean; labelW: number; labelH: number; };
          type ChronoGeom = ChronoRaw & { glyphL: number; glyphR: number; rowH: number; };
          const chronoRaw = new Map<string, ChronoRaw>();
          const chronoGeom = new Map<string, ChronoGeom>();
          let oldestAge = 0; let youngestAge = Infinity;

          cy.nodes().forEach((n: any) => {
              if (n.hasClass('box')) return;
              const startAge = nodeAges.get(n.id());
              if (startAge === undefined) return;
              const isLeaf = visualChildrenOf(n.id()).length === 0;
              let endAge = startAge; let isInterval = false;
              if (isLeaf) {
                  const rM = (n.data('period') || '').match(/([\d.,]+)\s*-\s*([\d.,]+)/);
                  if (rM) {
                      const e = Math.min(parseMa(rM[1]), parseMa(rM[2]));
                      if (startAge - e > 0.1) { endAge = e; isInterval = true; }
                  }
              }
              chronoRaw.set(n.id(), { startAge, endAge, isInterval, isLeaf, isEmpty: !!n.data('isEmpty'), labelW: n.data('isEmpty') ? 0 : (n.data('labelW') || 0), labelH: n.data('isEmpty') ? 0 : (n.data('labelH') || 0) });
              if (startAge > oldestAge) oldestAge = startAge;
              if (endAge < youngestAge) youngestAge = endAge;
          });

          if (!isFinite(youngestAge)) youngestAge = 0;
          if (oldestAge <= 0) oldestAge = 100;

          if (chronoBoundsMode === 'tight') {
              const pad = Math.max(oldestAge - youngestAge, 1) * 0.10;
              globalTimeMax = oldestAge + pad; globalTimeMin = Math.max(0, youngestAge - pad);
          } else {
              let snappedMax = oldestAge; let snappedMin = Math.max(0, youngestAge);
              for (const period of GEO_DETAILS) if (oldestAge > period.end && oldestAge <= period.start) { snappedMax = period.start; break; }
              for (const period of GEO_DETAILS) if (youngestAge >= period.end && youngestAge < period.start) { snappedMin = period.end; break; }
              if (youngestAge <= 0) snappedMin = 0;
              if (snappedMax === oldestAge && oldestAge > 538.8) snappedMax = Math.ceil(oldestAge / 100) * 100;
              globalTimeMax = snappedMax; globalTimeMin = Math.max(0, snappedMin);
          }
          chronoAxisLo = globalTimeMin; chronoAxisHi = globalTimeMax;

          if (chronoAxisMode === 'rank') {
              const seen = new Set<number>(); const ages: number[] = [];
              const push = (v: number) => { const r = Math.round(v * 1000) / 1000; if (!seen.has(r)) { seen.add(r); ages.push(r); } };
              push(globalTimeMin); push(globalTimeMax);
              chronoRaw.forEach(r => { push(r.startAge); if (r.isInterval) push(r.endAge); });
              ages.sort((a, b) => a - b); chronoRankAges = ages;
          } else chronoRankAges = [];

          chronoRaw.forEach((r, id) => {
              const glyphL = chronoAgeToX(r.startAge);
              const glyphR = r.isInterval ? chronoAgeToX(r.endAge) : (r.isLeaf ? glyphL + 1 : glyphL);
              const glyphH = r.isInterval ? CHRONO_BAR_H : (r.isLeaf ? CHRONO_TICK_H : 0);
              // Les parents imposent aussi la hauteur de leur image !
              chronoGeom.set(id, { ...r, glyphL, glyphR, rowH: r.isEmpty ? Math.max(CHRONO_EMPTY_ROW, glyphH) : Math.max(CHRONO_ROW_MIN, glyphH, r.labelH) });
          });

          const chronoY = new Map<string, number>();
          const visitedY = new Set<string>();
          let cursorY = 0; let prevLeafId: string | null = null; let pendingLcaDepth = 0;

          const layoutChronoY = (nId: string, depth: number): number | null => {
              if (visitedY.has(nId)) return null; visitedY.add(nId);
              const node = nodesById.get(nId); if (!node) return null;
              const g = chronoGeom.get(nId); const rowH = g ? g.rowH : CHRONO_ROW_MIN;
              const kids = visualChildrenOf(nId);

              if (kids.length === 0) {
                  let gapBefore = 0;
                  if (prevLeafId !== null) {
                      const prevEmpty = chronoGeom.get(prevLeafId)?.isEmpty === true;
                      if (prevEmpty || g?.isEmpty) gapBefore = CHRONO_GAP_EMPTY + CHRONO_K_LANE * (pendingLcaDepth + 1);
                      else gapBefore = CHRONO_GAP_MIN + CHRONO_K_LANE * (pendingLcaDepth + 1);
                  }
                  const y = cursorY + gapBefore + rowH / 2;
                  chronoY.set(nId, y); cursorY = y + rowH / 2; prevLeafId = nId; return y;
              }

              const startCursor = cursorY;
              let minChildY = Infinity; let maxChildY = -Infinity;
              kids.forEach((child: any, k: number) => {
                  if (k > 0) pendingLcaDepth = depth;
                  const childY = layoutChronoY(child.id(), depth + 1);
                  if (childY !== null) { if (childY < minChildY) minChildY = childY; if (childY > maxChildY) maxChildY = childY; }
              });

              if (!isFinite(minChildY)) { const y = cursorY + rowH / 2; chronoY.set(nId, y); cursorY = y + rowH / 2; return y; }

              let y = (minChildY + maxChildY) / 2;
              
              // BOUCLIER VERTICAL : Repousse l'arbre pour les images des parents !
              const topBleed = startCursor - (y - rowH / 2);
              if (topBleed > 0) {
                  const shiftDescendants = (subId: string) => {
                      if (chronoY.has(subId)) chronoY.set(subId, chronoY.get(subId)! + topBleed);
                      visualChildrenOf(subId).forEach(c => shiftDescendants(c.id()));
                  };
                  kids.forEach(c => shiftDescendants(c.id()));
                  y += topBleed; cursorY += topBleed;
              }
              if (y + rowH / 2 > cursorY) cursorY = y + rowH / 2;
              
              chronoY.set(nId, y);
              return y;
          };
          if (nodesById.has(state.currentRootId)) layoutChronoY(state.currentRootId, 0);

          let chronoLeafGlyphMaxR = -Infinity;
          chronoGeom.forEach((g, id) => { if (g.isLeaf && chronoY.has(id) && g.glyphR > chronoLeafGlyphMaxR) chronoLeafGlyphMaxR = g.glyphR; });
          if (!isFinite(chronoLeafGlyphMaxR)) chronoLeafGlyphMaxR = 0;

          chronoContentRight = 0; chronoContentLeft = 0;
          chronoGeom.forEach((g, id) => {
              if (!chronoY.has(id)) return;
              const anchorR = (CHRONO_LABEL_COLUMN && g.isLeaf) ? chronoLeafGlyphMaxR : g.glyphR;
              const right = (g.isLeaf && g.labelW > 0) ? anchorR + CHRONO_LABEL_GAP + g.labelW : anchorR;
              if (right > chronoContentRight) chronoContentRight = right;
              const left = (!g.isLeaf && !g.isEmpty && g.labelW > 0) ? g.glyphL - g.labelW : g.glyphL;
              if (left < chronoContentLeft) chronoContentLeft = left;
          });

          const chronoLaneOffset = new Map<string, number>(); chronoLaneCount = 0;
          if (chronoLanesEnabled) {
              type ChronoBar = { id: string; x: number; y1: number; y2: number; maxTurn: number };
              const bars: ChronoBar[] = [];
              chronoGeom.forEach((g, id) => {
                  if (g.isLeaf || !chronoY.has(id)) return;
                  let y1 = Infinity, y2 = -Infinity, minLen = Infinity;
                  visualChildrenOf(id).forEach((c: any) => {
                      const cY = chronoY.get(c.id()); const cG = chronoGeom.get(c.id());
                      if (cY === undefined || !cG) return;
                      if (cY < y1) y1 = cY; if (cY > y2) y2 = cY;
                      if (cG.glyphL - g.glyphL < minLen) minLen = cG.glyphL - g.glyphL;
                  });
                  if (!isFinite(y1)) return;
                  bars.push({ id, x: g.glyphL, y1, y2, maxTurn: Math.max(1, Math.min(CHRONO_LANE_MAX_TURN, isFinite(minLen) ? minLen * 0.4 : 0)) });
              });
              bars.sort((a, b) => a.x - b.x);
              const active: { bar: ChronoBar; lane: number }[] = [];
              bars.forEach(bar => {
                  for (let i = active.length - 1; i >= 0; i--) if (bar.x - active[i].bar.x >= CHRONO_LANE_MIN) active.splice(i, 1);
                  const taken = new Set<number>();
                  active.forEach(a => { if (bar.y1 <= a.bar.y2 && a.bar.y1 <= bar.y2) taken.add(a.lane); });
                  let lane = 0; while (taken.has(lane)) lane++;
                  active.push({ bar, lane });
                  if (lane > 0) { const offset = Math.min(lane * CHRONO_LANE_STEP, bar.maxTurn - 1); if (offset > 0) { chronoLaneOffset.set(bar.id, offset); chronoLaneCount++; } }
              });
          }

          cy.nodes().forEach((n: any) => {
              if (n.hasClass('box')) return;
              const g = chronoGeom.get(n.id()); if (!g) return;

              const y = chronoY.get(n.id()) ?? calculatedPositions.get(n.id())?.y ?? 0;
              const conflict = dateConflicts.has(n.id());
              const CHRONO_CONFLICT_COLOR = '#d32f2f'; // <-- Variable correctement redéclarée !

              let nodeW: number, nodeH: number;
              let shape = 'rectangle';
              let bgColor = conflict ? CHRONO_CONFLICT_COLOR : themeTextColor;
              let bgOpacity = 0;

              const rawImgX = n.data('imgOffsetX') || 0;
              const rawImgY = n.data('imgOffsetY') || 0;
              let rawTxtX = n.data('textMarginX') || 0;
              let rawTxtY = n.data('textMarginY') || 0;

              if (g.isInterval) {
                  nodeW = Math.max(g.glyphR - g.glyphL, 2); nodeH = CHRONO_BAR_H; bgColor = '#90A4AE'; bgOpacity = 1;
                  n.position({ x: (g.glyphL + g.glyphR) / 2, y: y });
                  rawTxtX += CHRONO_LABEL_GAP;
                  n.data('imgOffsetX', rawImgX + CHRONO_LABEL_GAP);
              } else if (g.isLeaf) {
                  nodeW = 2; nodeH = g.isEmpty ? 8 : CHRONO_TICK_H; bgOpacity = 1;
                  n.position({ x: g.glyphL, y: y });
                  const gap = (CHRONO_LABEL_COLUMN ? (chronoLeafGlyphMaxR - g.glyphR) : 0) + CHRONO_LABEL_GAP;
                  rawTxtX += gap + g.labelW/2;
                  n.data('imgOffsetX', rawImgX + gap + g.labelW/2);
              } else {
                  // MÉTATHÈSE PHYSIQUE : La brique prend la taille de l'image
                  nodeW = g.labelW > 0 ? g.labelW + 8 : 0.1;
                  nodeH = g.labelH > 0 ? g.labelH + 4 : 0.1;
                  bgOpacity = 0;
                  n.position({ x: g.glyphL - (nodeW / 2), y: y });
                  
                  // CORRECTION : Nous ne décalons plus le texte (centerX est supprimé). 
                  // Le texte s'alignera naturellement avec la brique physique !
                  n.data('imgOffsetX', rawImgX);
              }

              let bgUrls: string[] = []; let bgWidths: string[] = []; let bgHeights: string[] = []; let bgPosXs: string[] = []; let bgPosYs: string[] = []; let bgFits: string[] = [];
              if (n.data('textAbove') && !g.isEmpty) {
                  rawTxtY -= ((n.data('fontSize') || 16) * 0.8) + 8;
                  bgUrls.push(TEXT_ABOVE_BAR_SVG); bgWidths.push(g.labelW + 'px'); bgHeights.push('2px'); bgFits.push('none'); bgPosXs.push(rawTxtX + 'px'); bgPosYs.push(rawTxtY + 'px');
              }

              n.removeStyle(); // Éradique tous les styles inline qui bloquaient Cytoscape

              n.data({
                  cWidth: nodeW, cHeight: nodeH, cShape: shape,
                  cBorderW: g.isInterval ? (conflict ? 2 : 1) : 0,
                  cBorderCol: conflict ? CHRONO_CONFLICT_COLOR : themeTextColor,
                  cBgCol: bgColor, cBgOpac: bgOpacity,
                  cTextMarginX: rawTxtX, cTextMarginY: rawTxtY,
                  
                  // ZERO ABSOLU : Fin définitive du cadre gris
                  cTxtBgCol: 'transparent', cTxtBgOpac: 0, 
                  
                  chronoOuterWidth: g.isInterval ? nodeW + 2 : (g.isLeaf ? 2 : 0.1),
                  bgUrls: bgUrls.length > 0 ? bgUrls : null, bgWidthsStr: bgWidths.length > 0 ? bgWidths.join(', ') : '0px', bgHeightsStr: bgHeights.length > 0 ? bgHeights.join(', ') : '0px', bgPosXsStr: bgPosXs.length > 0 ? bgPosXs.join(', ') : '50%', bgPosYsStr: bgPosYs.length > 0 ? bgPosYs.join(', ') : '50%', bgFitsStr: bgFits.length > 0 ? bgFits.join(', ') : 'none'
              });

              n.style({
                  'width': nodeW, 'height': nodeH, 'shape': shape, 'padding': '0px',
                  'border-width': g.isInterval ? (dateConflicts.has(n.id()) ? 2 : 1) : 0, 'border-style': 'solid', 'border-color': bgColor,
                  'background-color': bgColor, 'background-opacity': g.isInterval || g.isLeaf ? 1 : 0,
                  'text-margin-x': rawTxtX, 'text-margin-y': rawTxtY
              } as any);
          });

          const appContainer = document.getElementById('app');
          let chronoBg = document.getElementById('chrono-bg');
          if (!chronoBg && appContainer) {
              chronoBg = document.createElement('div'); chronoBg.id = 'chrono-bg';
              chronoBg.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:0; overflow:hidden; background-color:#ffffff;";
              appContainer.insertBefore(chronoBg, appContainer.firstChild);
          }
          let chronoRuler = document.getElementById('chrono-ruler');
          if (!chronoRuler && appContainer) {
              chronoRuler = document.createElement('div'); chronoRuler.id = 'chrono-ruler';
              chronoRuler.style.cssText = "position:absolute; left:0; right:0; box-sizing:border-box; pointer-events:none; z-index:5; overflow:hidden; box-shadow:0 -4px 10px rgba(0,0,0,0.15);";
              appContainer.appendChild(chronoRuler);
          }
          if (chronoBg) chronoBg.style.display = 'block';
          if (chronoRuler) {
              chronoRuler.style.bottom = CHRONO_RULER_BOTTOM + 'px';
              chronoRuler.style.height = CHRONO_RULER_H + 'px';
              chronoRuler.style.display = 'block';
          }

          type RulerLabel = { el: HTMLElement, cs: number, ce: number, minW: number, name: string, abbr: string };
          let rulerLabels: RulerLabel[] = [];

          const positionRulerLabels = (zoom: number, panX: number, vpW: number) => {
              for (const L of rulerLabels) {
                  const xs = chronoAgeToX(L.cs) * zoom + panX;
                  const xe = chronoAgeToX(L.ce) * zoom + panX;
                  const visL = Math.max(xs, 2);
                  const visR = Math.min(xe, vpW - 2);
                  const visW = visR - visL;
                  if (visW < 22) { if (L.el.style.display !== 'none') L.el.style.display = 'none'; continue; }
                  if (L.el.style.display !== 'block') L.el.style.display = 'block';
                  if (visW < L.minW) { if (L.el.textContent !== L.abbr) L.el.textContent = L.abbr; } 
                  else { if (L.el.textContent !== L.name) L.el.textContent = L.name; }
                  L.el.style.left = ((visL + visR) / 2) + 'px';
                  L.el.style.maxWidth = visW + 'px';
              }
          };

          let lastFrameZoom = NaN; let lastFramePanX = NaN; let builtZoom = NaN; let builtPanX = NaN;

          const updateChronoRuler = () => {
              const bgEl = document.getElementById('chrono-bg'); const rulerEl = document.getElementById('chrono-ruler');
              if (!bgEl || !rulerEl) return;
              const zoom = cy.zoom(); const panX = cy.pan().x;
              if (zoom === lastFrameZoom && panX === lastFramePanX) return;
              lastFrameZoom = zoom; lastFramePanX = panX;
              const vpW = bgEl.clientWidth || cy.width();
              const themeTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
              const needsRebuild = (zoom !== builtZoom) || isNaN(builtPanX) || Math.abs(panX - builtPanX) > vpW * 0.5 || !document.getElementById('chrono-track-bg');

              if (!needsRebuild) {
                  const tBg = document.getElementById('chrono-track-bg'); const tRl = document.getElementById('chrono-track-ruler');
                  if (tBg) tBg.style.transform = `translateX(${panX}px)`;
                  if (tRl) tRl.style.transform = `translateX(${panX}px)`;
                  positionRulerLabels(zoom, panX, vpW);
                  return;
              }

              builtZoom = zoom; builtPanX = panX;
              const viewMin = -panX - 400; const viewMax = vpW - panX + 400;
              const isVisible = (x: number, w: number) => (x + w) > viewMin && x < viewMax;

              const clipSpan = (s: number, e: number) => {
                  const cs = Math.min(s, globalTimeMax); const ce = Math.max(e, globalTimeMin);
                  if (cs <= ce) return null;
                  const xs = chronoAgeToX(cs) * zoom; const xe = chronoAgeToX(ce) * zoom;
                  return { x: xs, w: Math.max(0, xe - xs), cs: cs, ce: ce };
              };
              const showZero = globalTimeMin <= 0;

              let bgHtml = `<div id="chrono-track-bg" style="position:absolute; left:0; top:0; width:1px; height:100%; transform:translateX(${panX}px); transform-origin:left center;"><div style="position:absolute; top:0; left:0; width:1px; bottom:${CHRONO_RULER_BOTTOM + CHRONO_RULER_H}px; pointer-events:none;">`;
              GEO_DETAILS.forEach((period: any) => {
                  if (period.subs && period.subs.length > 0) {
                      period.subs.forEach((sub: any, i: number) => {
                          const c = clipSpan(sub.s, sub.e); if (!c || !isVisible(c.x, c.w)) return;
                          const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                          const stageColor = adjustColorLightness(period.color, shadeAmount);
                          bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:100%; background-color:${stageColor}; opacity:0.12;"></div>`;
                          if (c.cs === sub.s) bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:1px; height:100%; background-color:${themeTextColor}; opacity:0.25;"></div>`;
                      });
                  } else {
                      const c = clipSpan(period.start, period.end); if (!c || !isVisible(c.x, c.w)) return;
                      bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:100%; background-color:${period.color}; opacity:0.12;"></div>`;
                      if (c.cs === period.start) bgHtml += `<div style="position:absolute; left:${c.x}px; top:0; width:1px; height:100%; background-color:${themeTextColor}; opacity:0.25;"></div>`;
                  }
              });
              if (showZero) bgHtml += `<div style="position:absolute; left:0px; top:0; width:1px; height:100%; background-color:${themeTextColor}; opacity:0.25;"></div>`;
              bgHtml += `</div></div>`;
              bgEl.innerHTML = bgHtml;

              const labelDefs: { name: string, abbr: string, cs: number, ce: number, top: number, h: number, fs: number, fw: string, ls: string, minW: number }[] = [];
              let rlHtml = `<div style="position:absolute; top:0; left:0; right:0; bottom:0; background:var(--bg-panel, #ffffff);"></div><div id="chrono-track-ruler" style="position:absolute; left:0; top:0; width:1px; height:100%; transform:translateX(${panX}px); transform-origin:left center;"><div style="position:absolute; top:0; left:0; width:1px; height:${CHRONO_RULER_H}px; pointer-events:auto;">`;

              GEO_DETAILS.forEach((period: any, idx: number) => {
                  if (period.subs && period.subs.length > 0) {
                      period.subs.forEach((sub: any, i: number) => {
                          const c = clipSpan(sub.s, sub.e); if (!c || !isVisible(c.x, c.w)) return;
                          const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                          const stageColor = adjustColorLightness(period.color, shadeAmount);
                          const stageName = t(sub.k) !== sub.k ? t(sub.k) : sub.k.replace('geo.', '');
                          const stageAbbr = stageName.length > 4 ? stageName.substring(0, 3) + '.' : stageName;
                          const tooltip = `${stageName} (${sub.s} - ${sub.e} Ma)`;
                          const showTick = c.w > 22 && c.cs === sub.s;
                          
                          rlHtml += `<div title="${tooltip}" style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:${CHRONO_STAGE_H}px; background-color:${stageColor}; border-right:1px solid rgba(0,0,0,0.3); box-sizing:border-box; overflow:hidden; cursor:help;"></div>`;
                          labelDefs.push({ name: stageName, abbr: stageAbbr, cs: c.cs, ce: c.ce, top: CHRONO_STAGE_H - 16, h: 14, fs: 10, fw: '700', ls: '0', minW: 50 });
                          
                          if (showTick) {
                              rlHtml += `<div style="position:absolute; left:${c.x}px; top:2px; width:1px; height:6px; background-color:#000000; z-index:2;"></div><div style="position:absolute; left:${c.x - 30}px; top:9px; width:60px; text-align:center; font-size:9px; font-weight:bold; color:#000000; z-index:2; pointer-events:none;">${sub.s}</div>`;
                          }
                      });
                  }
                  const pc = clipSpan(period.start, period.end);
                  if (pc && isVisible(pc.x, pc.w)) {
                      const pName = PERIOD_NAMES[idx] || "";
                      const pAbbr = pName.length > 4 ? pName.substring(0, 3) + '.' : pName;
                      const tooltip = `${pName} (${period.start} - ${period.end} Ma)`;
                      rlHtml += `<div title="${tooltip}" style="position:absolute; left:${pc.x}px; top:${CHRONO_STAGE_H}px; width:${pc.w}px; height:${CHRONO_PERIOD_H}px; background-color:${period.color}; border-right:1px solid rgba(0,0,0,0.5); border-top:1px solid rgba(0,0,0,0.5); box-sizing:border-box; overflow:hidden; cursor:help;"></div>`;
                      if (pName) labelDefs.push({ name: pName, abbr: pAbbr, cs: pc.cs, ce: pc.ce, top: CHRONO_STAGE_H, h: CHRONO_PERIOD_H, fs: 12, fw: '900', ls: '1px', minW: 60 });
                  }
              });

              if (showZero) {
                  rlHtml += `<div style="position:absolute; left:0px; top:2px; width:1px; height:6px; background-color:#000000; z-index:2;"></div><div style="position:absolute; left:-30px; top:9px; width:60px; text-align:center; font-size:9px; font-weight:bold; color:#000000; z-index:2; pointer-events:none;">0</div>`;
              }
              rlHtml += `</div></div><div style="position:absolute; top:0; left:0; right:0; height:2px; background:var(--text-main, #000);"></div><div style="position:absolute; bottom:0; left:0; right:0; height:2px; background:var(--text-main, #000);"></div><div id="chrono-ruler-labels" style="position:absolute; top:0; left:0; right:0; bottom:0; overflow:hidden; pointer-events:none;"></div>`;
              rulerEl.innerHTML = rlHtml;

              const labelHost = document.getElementById('chrono-ruler-labels');
              rulerLabels = [];
              if (labelHost) {
                  labelDefs.forEach(def => {
                      const el = document.createElement('span'); el.textContent = def.name;
                      el.style.cssText = `position:absolute; top:${def.top}px; height:${def.h}px; line-height:${def.h}px; transform:translateX(-50%); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:${def.fs}px; font-weight:${def.fw}; letter-spacing:${def.ls}; color:#000000; display:none;`;
                      labelHost.appendChild(el);
                      rulerLabels.push({ el: el, cs: def.cs, ce: def.ce, minW: def.minW, name: def.name, abbr: def.abbr });
                  });
              }
              positionRulerLabels(zoom, panX, vpW);
          };

          lastFrameZoom = NaN; lastFramePanX = NaN; builtZoom = NaN; builtPanX = NaN;
          updateChronoRuler();
          chronoRulerUpdater = updateChronoRuler;
          startChronoRaf();
          
      } else {
          const bgEl = document.getElementById('chrono-bg');
          const rulerEl = document.getElementById('chrono-ruler');
          if (bgEl) bgEl.style.display = 'none';
          if (rulerEl) rulerEl.style.display = 'none';
          chronoRulerUpdater = null;
      }

      // CORRECTION IMPORTANTE : Calcul des Cadres déplacé ICI, tout à la fin, pour qu'il 
      // s'adapte aux coordonnées négatives du chronogramme !
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
              box: box, expandedTargets: expandedTargets, ids: ids, level: 0, childBoxes: [],
              finalMinX: Infinity, finalMaxX: -Infinity, finalMinY: Infinity, finalMaxY: -Infinity,
              paddedMinX: 0, paddedMaxX: 0, paddedMinY: 0, paddedMaxY: 0, hasVisible: false
          });
      });

      boxDataArray.sort((a, b) => a.ids.size - b.ids.size);

      for (let i = 0; i < boxDataArray.length; i++) {
          const firstId = boxDataArray[i].ids.values().next().value;
          for (let j = i + 1; j < boxDataArray.length; j++) {
              if (boxDataArray[j].ids.size <= boxDataArray[i].ids.size) continue;
              if (firstId !== undefined && !boxDataArray[j].ids.has(firstId)) continue;
              let isSubset = true;
              for (let id of boxDataArray[i].ids) {
                  if (!boxDataArray[j].ids.has(id)) { isSubset = false; break; }
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
              if (visibleNodes.has(tid)) {
                  data.hasVisible = true;
                  
                  const pos = tNode.position(); // On lit la VRAIE position finale !
                  const w = tNode.data('renderWidth') || 100;
                  const h = tNode.data('renderHeight') || 24; 
                  
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
              const paddingLeft = state.layoutMode === 'comb' ? 4 : 20; 
              const paddingRight = state.layoutMode === 'comb' ? 35 : 20; 
              const paddingTop = state.layoutMode === 'comb' ? 2 : (fontSize + 15);
              const paddingBottom = state.layoutMode === 'comb' ? 2 : 20;

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
              let boxW = data.boxW; let boxH = data.boxH; let boxX = data.boxX; let boxY = data.boxY;
              const boxColor = box.data('boxColor') || '#FF9800';
              const fontSize = box.data('fontSize') || 14;
              const boxName = box.data('name') || '';

              let vAlign = 'center'; let hAlign = 'center'; let marginX = 0; let marginY = 0; let rotation = '0deg';
              let bgOpacity = box.data('boxOpacity') !== undefined ? box.data('boxOpacity') : 0.1;
              let bgImage = 'none'; let bgFit = 'cover'; let bgWidth = '100%'; let bgHeight = '100%'; let bgPosX = '50%'; let bgPosY = '50%';
              let boxShape = box.data('boxShape') || 'round-rectangle';

              if (state.layoutMode === 'comb') {
                  const isVertical = box.data('boxTextVertical');
                  const hasGradient = box.data('boxGradient');
                  
                  if (boxShape === 'bracket') {
                      rotation = '0deg'; hAlign = 'right';  vAlign = 'center';  marginX = 15;  marginY = 0;
                      const strokeW = box.data('boxBorderWidth') !== undefined ? box.data('boxBorderWidth') : 2;
                      const halfH = boxH / 2;
                      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="${boxH}" viewBox="0 0 20 ${boxH}"><path d="M 0,2 L 15,2 L 15,${halfH} L 20,${halfH} M 15,${halfH} L 15,${boxH - 2} L 0,${boxH - 2}" fill="none" stroke="${boxColor}" stroke-width="${strokeW}" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
                      bgImage = 'data:image/svg+xml;utf8,' + encodeURIComponent(svgStr);
                      bgOpacity = 0; bgFit = 'none'; bgWidth = '20px'; bgHeight = `${boxH}px`; bgPosX = '100%'; bgPosY = '50%';
                      boxShape = 'rectangle'; box.style({ 'border-width': 0 } as any); 
                  } else {
                      box.style({ 
                          'border-width': box.data('boxBorderWidth') !== undefined ? box.data('boxBorderWidth') : 2,
                          'border-style': box.data('boxBorderStyle') || 'dashed'
                      } as any);

                      if (isVertical) {
                          rotation = '90deg'; hAlign = 'center';  vAlign = 'center';  marginX = (boxW / 2) - 10;  marginY = 0;
                      } else {
                          rotation = '0deg'; hAlign = 'right';  vAlign = 'center';  marginX = 15;  marginY = 0;
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
                  } as any);
                  if (boxShape === 'bracket') boxShape = 'round-rectangle';
                  vAlign = 'center'; hAlign = 'center'; 
                  
                  const lines = boxName.split('\n');
                  let maxLineLen = 0;
                  lines.forEach((l: string) => { if (l.length > maxLineLen) maxLineLen = l.length; });
                  const textW = maxLineLen * (fontSize * 0.55); 
                  const textH = lines.length * (fontSize * 1.2);
                  if (textW + 30 > boxW) boxW = textW + 30;
                  if (textH + 40 > boxH) boxH = textH + 40;
                  marginX = 0; marginY = -(boxH / 2) + (textH / 2) + 10;
              }

              box.style('display', 'element');
              box.position({ x: boxX, y: boxY });
              
              box.style({
                  'shape': boxShape, 'width': boxW + 'px', 'height': boxH + 'px', 'z-index': -data.level,
                  'text-valign': vAlign, 'text-halign': hAlign, 'text-margin-x': marginX, 'text-margin-y': marginY,
                  'text-rotation': rotation, 'background-color': boxColor, 'background-opacity': bgOpacity,
                  'background-image': bgImage, 'background-fit': bgFit, 'background-width': bgWidth,
                  'background-height': bgHeight, 'background-position-x': bgPosX, 'background-position-y': bgPosY
              } as any);
          } else {
              box.style('display', 'none');
          }
      });

      cy.nodes().forEach((n: any) => {
          if (n.hasClass('box') || n.id() === state.currentRootId) {
              n.ungrabify(); 
          } else {
              n.grabify(); 
          }
      });
      
      cy.endBatch(); 

      if (isFirstLoad || fitCamera) { 
            isFittingCamera = true; 
            setTimeout(() => {
                cy.fit(cy.nodes(':visible'), 50);
                if (state.layoutMode === 'chrono') {
                    cy.panBy({ x: 0, y: -70 });
                    cy.emit('zoom');
                }
                setTimeout(() => { isFittingCamera = false; }, 100); 
            }, 30);
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
                    notes = t('alert.xmind_labels') + cleanLabels.join(', ');
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

        let trueRootId = parsed.state.currentRootId || 'root';
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
    state.currentFilePath = filePath;
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (ext === 'xmind') {
      state.currentFilePath = undefined; // Force "Save As" pour ne pas écraser le XMind
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
        state.currentRootId = rootTopic.id; 
        
        cy.nodes().forEach(node => {
            if (node.id() !== 'root' && !node.hasClass('box')) {
                checkAutoRank(node);
            }
        });

        refreshLayout(true);
        cy.endBatch();
        setTimeout(() => { state.hasUnsavedChanges = false; setUnsavedState(false); stateManager.resetStacks(); stateManager.resetStacks(); }, 100);
      } catch (err) { alert(t('alert.xmind_error') + err); }
    } else {
      try { 
          const decoder = new TextDecoder('utf-8');
          const text = decoder.decode(buffer);
          const parsed = JSON.parse(text); 
          const baseName = fileName.replace('.phylo', '').replace('.json', '');
          saveToRecentFiles(baseName, parsed, state.currentFilePath); 

          cy.startBatch();
          cy.elements().remove(); 
          cy.add(parsed.graph.elements); 
          state.currentRootId = parsed.state.currentRootId || 'root'; 
          refreshLayout(true); 
          cy.endBatch();
          
          setTimeout(() => { state.hasUnsavedChanges = false; setUnsavedState(false); stateManager.resetStacks(); stateManager.resetStacks(); }, 100); 
      } catch (err) { alert(t('alert.corrupt_file')); } 
    }
  }

  // Cette fonction globale fera le pont avec le captureur d'événement tout en haut
  (window as any)._loadOSFile = async (filePath: string) => {
      const result = await window.electronAPI.readFileDirect(filePath);
      if (result.success && result.data && result.fileName) {
          await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
          if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
      } else if (result.error) {
          alert(t('alert.file_read_error') + result.error);
      }
  };

  isAppReady = true;
  // S'il y a un fichier mis en attente pendant le chargement, on l'ouvre maintenant !
  if (pendingOSFile) {
      (window as any)._loadOSFile(pendingOSFile);
      pendingOSFile = null;
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
      
      if (ui.sidePanel.style.display === 'block' && state.activeNode && state.activeNode.id() === node.id()) { 
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
  // L'arbre attend que les polices soient chargées pour faire son premier calcul exact, évitant de le faire deux fois de suite.
  document.fonts.ready.then(() => refreshLayout(true));

  ui.btnRecenter.onclick = () => { cy.fit(cy.nodes(':visible').not('.strato-bg'), 50); };
  ui.btnCenterRoot.onclick = () => {
      const rootNode = cy.$id(state.currentRootId);
      if (rootNode && rootNode.length > 0) {
          cy.animate({ center: { eles: rootNode }, zoom: 1.5 }, { duration: 300 });
      }
  };
  // Controles chronogramme (phases 8 et 9). Volontairement NON persistes dans
  // state.appSettings : le format de fichier n'est pas touche.
  const updateChronoToolsUI = () => {
      if (ui.chronoTools) ui.chronoTools.style.display = state.layoutMode === 'chrono' ? 'flex' : 'none';
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
          if (state.layoutMode === 'chrono') refreshLayout(true);
      };
  }

  if (ui.btnChronoLanes) {
      ui.btnChronoLanes.onclick = () => {
          chronoLanesEnabled = !chronoLanesEnabled;
          if (state.layoutMode === 'chrono') refreshLayout();
          updateChronoToolsUI(); // apres le layout : chronoLaneCount est a jour
      };
  }

  if (ui.btnChronoBounds) {
      ui.btnChronoBounds.onclick = () => {
          chronoBoundsMode = chronoBoundsMode === 'tight' ? 'period' : 'tight';
          updateChronoToolsUI();
          if (state.layoutMode === 'chrono') refreshLayout(true);
      };
  }

  const updateLayoutButtonsUI = () => {
      ui.btnLayoutNormal.style.background = state.layoutMode === 'standard' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'standard' ? 'invert(1) brightness(2)' : 'none';
      
      ui.btnLayoutComb.style.background = state.layoutMode === 'comb' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'comb' ? 'invert(1) brightness(2)' : 'none';

      if (ui.btnLayoutChrono) {
          ui.btnLayoutChrono.style.background = state.layoutMode === 'chrono' ? '#2196F3' : 'var(--bg-input)';
          (ui.btnLayoutChrono.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'chrono' ? 'invert(1) brightness(2)' : 'none';
      }

      updateChronoToolsUI();
  };

  ui.btnLayoutNormal.onclick = () => {
      state.layoutMode = 'standard';
      updateLayoutButtonsUI();
      if (state.activeNode && state.activeNode.hasClass('box')) updateRibbonForNode(state.activeNode);
      refreshLayout(true);
  };

  ui.btnLayoutComb.onclick = () => {
      state.layoutMode = 'comb';
      updateLayoutButtonsUI();
      if (state.activeNode && state.activeNode.hasClass('box')) updateRibbonForNode(state.activeNode);
      refreshLayout(true);
  };

  ui.btnLayoutChrono.onclick = () => {
      state.layoutMode = 'chrono';
      updateLayoutButtonsUI();
      if (state.activeNode && state.activeNode.hasClass('box')) updateRibbonForNode(state.activeNode);
      refreshLayout(true);
  };

  ui.btnLayoutComb.onclick = () => {
      state.layoutMode = 'comb';
      ui.btnLayoutComb.style.background = '#2196F3';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = 'invert(1) brightness(2)';
      ui.btnLayoutNormal.style.background = 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = 'none';
      
      // Restaure l'état coché visuel des options du ruban selon les données mémorisées du cadre
      if (state.activeNode && state.activeNode.hasClass('box')) {
          updateRibbonForNode(state.activeNode);
      }
      
      refreshLayout(true);
  };
  ui.btnExpandAll.onclick = () => { saveState(); cy.nodes().data('collapsed', false); refreshLayout(); };

  if (ui.btnToggleAbbrev) {
      // Met le texte correctement au chargement
      ui.btnToggleAbbrev.innerText = state.appSettings.speciesFormat === 'full' ? t('topbar.btn.format.full') : t('topbar.btn.format.compact');
      
      ui.btnToggleAbbrev.onclick = () => {
          // Change la variable, sauvegarde et rafraîchit l'UI dynamique
          state.appSettings.speciesFormat = state.appSettings.speciesFormat === 'full' ? 'abbrev' : 'full';
          saveSettings();
          ui.btnToggleAbbrev.innerText = state.appSettings.speciesFormat === 'full' ? t('topbar.btn.format.full') : t('topbar.btn.format.compact');
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
              // CORRECTION : Utilisation de la nouvelle signature à 2 arguments
              fullName = formatSpeciesName(node.data('name'), false).toLowerCase();
              abbrevName = formatSpeciesName(node.data('name'), true).toLowerCase();
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
                  if (nodeRootId !== state.currentRootId) { 
                      state.currentRootId = nodeRootId; 
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
              if (nodeRootId !== state.currentRootId) {
                  state.currentRootId = nodeRootId;
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
          if (state.activeNode) {
              state.activeNode.data('synonymTargetId', null);
              ui.panelSubtitleSynonym.style.display = 'none';
              setUnsavedState(true);
          }
          return; 
      }
      const matches = cy.nodes().filter((n: any) => {
          if (n.hasClass('box') || (state.activeNode && n.id() === state.activeNode.id())) return false;
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
                  if (state.activeNode) {
                      saveState();
                      state.activeNode.data('synonymTargetId', node.id());
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
              if (n.hasClass('box') || (state.activeNode && n.id() === state.activeNode.id())) return false;
              return getNodeSearchStrings(n).some(s => s.includes(val));
          });
          if (matches.length >= 1) {
              const node = matches[0];
              ui.synonymDropdown.style.display = 'none';
              ui.inpSynonymTarget.value = node.data('name');
              if (state.activeNode) {
                  saveState();
                  state.activeNode.data('synonymTargetId', node.id());
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
      if (!state.activeNode) return;
      const synId = state.activeNode.data('synonymTargetId');
      if (synId) {
          const targetNode = cy.$id(synId);
          if (targetNode.length > 0) {
              const nodeRootId = getSheetRootForNode(targetNode); 
              if (nodeRootId !== state.currentRootId) { 
                  state.currentRootId = nodeRootId; 
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

  setTimeout(() => { state.isInitializing = false; }, 800);
  
  window.addEventListener('beforeunload', (e) => { 
      if (state.hasUnsavedChanges && !state.isForceClosing) { 
          e.preventDefault(); 
          e.returnValue = false; 
          
          setTimeout(() => {
              const fallbackText = "⚠️ Vous avez des modifications non sauvegardées.\nVoulez-vous vraiment quitter ?";
              const translatedText = t('confirm.quit') !== 'confirm.quit' ? t('confirm.quit') : fallbackText;
              
              const userWantsToQuit = confirm(translatedText);
              
              if (userWantsToQuit) {
                  state.isForceClosing = true;
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
          if (state.layoutMode !== 'chrono') return;
          cy.remove(tempChronoElements);
          if (chronoLanesNeutralized) {
              chronoLanesNeutralized = false;
              refreshLayout(); // restitue les couloirs, sans bouger la camera
          }
      };

      // 1. INJECTION TEMPORAIRE DE LA FRISE POUR L'EXPORT
      if (state.layoutMode === 'chrono') {
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
          const drawnLabelXs: number[] = [];

          // On pré-réserve la place du zéro pour qu'il soit toujours visible
          const firstStageEnd = parseMa(GEO_DETAILS[0]?.subs?.[0]?.e ?? GEO_DETAILS[0]?.end); 
          if (!isNaN(firstStageEnd) && firstStageEnd >= globalTimeMin && firstStageEnd <= globalTimeMax) {
              drawnLabelXs.push(chronoAgeToX(firstStageEnd));
          }

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
                      
                      // CORRECTION : Abréviations dynamiques en fonction de la largeur (w)
                      const stageAbbr = stageName.length > 4 ? stageName.substring(0, 3) + '.' : stageName;
                      let displayLabel = '';
                      if (w > 50) {
                          displayLabel = stageName;
                      } else if (w > 22) {
                          displayLabel = stageAbbr;
                      }
                      
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-bg-sub-' + idx + '-' + i, name: 'bg' },
                          position: { x: cx, y: bgCenterY },
                          style: { 'width': w, 'height': bgHeight, 'shape': 'rectangle', 'background-color': stageColor, 'background-opacity': 0.12, 'border-width': 0, 'z-index': -999, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
                      });
                      
                      const tickX = chronoAgeToX(renderStart);
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-tick-sub-' + idx + '-' + i, name: 'tick' },
                          position: { x: tickX, y: bgCenterY },
                          style: { 'width': 1, 'height': bgHeight, 'shape': 'rectangle', 'background-color': themeTextColor, 'background-opacity': 0.3, 'border-width': 0, 'padding': 0, 'z-index': -998, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
                      });

                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-sub-' + idx + '-' + i, name: stageName },
                          position: { x: cx, y: rulerStartY + 20 }, 
                          style: { 'width': w, 'height': 40, 'shape': 'rectangle', 'background-color': stageColor, 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'label': displayLabel, 'font-size': 10, 'text-valign': 'center', 'text-halign': 'center', 'color': '#000000', 'font-weight': 'bold', 'text-wrap': 'ellipsis', 'text-max-width': Math.max(1, w - 4), 'z-index': 100, 'z-index-compare': 'manual' }
                      });
                      
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-tick-' + idx + '-' + i, name: 'rulertick' },
                          position: { x: tickX, y: rulerStartY + 20 },
                          style: { 'width': 1.5, 'height': 40, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
                      });

                      // CORRECTION : On s'assure que les dates chiffrées ne se chevauchent pas (Espacement minimal de 28px)
                      if (drawnLabelXs.every(dx => Math.abs(dx - tickX) > 28)) {
                          drawnLabelXs.push(tickX);
                          timelineNodes.push({
                              group: 'nodes', classes: 'export-chrono', data: { id: 'export-label-sub-' + idx + '-' + i, name: 'label' },
                              position: { x: tickX, y: rulerStartY + 5 },
                              style: { 'width': 0.1, 'height': 0.1, 'background-opacity': 0, 'border-width': 0, 'label': sStart.toString(), 'font-size': 9, 'font-weight': 'bold', 'color': '#000000', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -2, 'z-index': 105, 'z-index-compare': 'manual' }
                          });
                      }
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
                      
                      const pAbbr = pName.length > 4 ? pName.substring(0, 3) + '.' : pName;
                      let pDisplayLabel = '';
                      if (w > 60) {
                          pDisplayLabel = pName;
                      } else if (w > 25) {
                          pDisplayLabel = pAbbr;
                      }
                      
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-per-' + idx, name: pName },
                          position: { x: cx, y: rulerStartY + 50 }, 
                          style: { 'width': w, 'height': 20, 'shape': 'rectangle', 'background-color': period.color, 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'label': pDisplayLabel, 'font-size': 11, 'text-valign': 'center', 'text-halign': 'center', 'color': '#000000', 'font-weight': 'bold', 'text-wrap': 'ellipsis', 'text-max-width': Math.max(1, w - 4), 'z-index': 101, 'z-index-compare': 'manual' }
                      });

                      const tickX = chronoAgeToX(renderStart);
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-pertick-' + idx, name: 'pertick' },
                          position: { x: tickX, y: rulerStartY + 50 },
                          style: { 'width': 2, 'height': 20, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
                      });
                  }
              }
          });

          if (!isNaN(firstStageEnd) && firstStageEnd >= globalTimeMin && firstStageEnd <= globalTimeMax) {
              const tickX = chronoAgeToX(firstStageEnd);
              
              timelineNodes.push({
                  group: 'nodes', classes: 'export-chrono', data: { id: 'export-tick-zero', name: 'tick' },
                  position: { x: tickX, y: bgCenterY },
                  style: { 'width': 1, 'height': bgHeight, 'shape': 'rectangle', 'background-color': themeTextColor, 'background-opacity': 0.3, 'border-width': 0, 'padding': 0, 'z-index': -998, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
              });

              timelineNodes.push({
                  group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-tick-zero', name: 'rulertick' },
                  position: { x: tickX, y: rulerStartY + 30 },
                  style: { 'width': 2, 'height': 60, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
              });

              timelineNodes.push({
                  group: 'nodes', classes: 'export-chrono', data: { id: 'export-label-zero', name: '0' },
                  position: { x: tickX, y: rulerStartY + 5 },
                  style: { 'width': 0.1, 'height': 0.1, 'background-opacity': 0, 'border-width': 0, 'label': firstStageEnd.toString(), 'color': '#000000', 'font-weight': 'bold', 'font-size': 9, 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -2, 'z-index': 105, 'z-index-compare': 'manual' }
              });
          }
          
          const xOldest = chronoAgeToX(globalTimeMax);
          const xYoungest = chronoAgeToX(globalTimeMin);
          const totalW = Math.max(1, xYoungest - xOldest);
          const totalCx = (xOldest + xYoungest) / 2;

          timelineNodes.push({
              group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-hline-top', name: 'hline' },
              position: { x: totalCx, y: rulerStartY },
              style: { 'width': totalW, 'height': 2.5, 'shape': 'rectangle', 'background-color': '#000000', 'border-width': 0, 'padding': 0, 'z-index': 105, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
          });
          timelineNodes.push({
              group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-hline-mid', name: 'hline' },
              position: { x: totalCx, y: rulerStartY + 40 },
              style: { 'width': totalW, 'height': 2, 'shape': 'rectangle', 'background-color': '#000000', 'border-width': 0, 'padding': 0, 'z-index': 105, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
          });
          timelineNodes.push({
              group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-hline-bot', name: 'hline' },
              position: { x: totalCx, y: rulerStartY + 60 },
              style: { 'width': totalW, 'height': 2.5, 'shape': 'rectangle', 'background-color': '#000000', 'border-width': 0, 'padding': 0, 'z-index': 105, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
          });

          tempChronoElements = cy.add(timelineNodes);
      }

      if (format === 'png' || format === 'jpeg') {
        const b64 = format === 'png' 
          ? cy.png({ full: true, bg: exportBg, scale: scaleFactor }) 
          : cy.jpg({ full: true, bg: '#ffffff', scale: scaleFactor });
        
        finishChronoExport(); 
        window.electronAPI.saveExport(b64, fileName, format);
        
      } else if (format === 'svg') {
        const svgContent = (cy as any).svg({ full: true, bg: exportBg, scale: scaleFactor }); 
        
        finishChronoExport(); 
        window.electronAPI.saveExport(svgContent, fileName, format);
        
      } else if (format === 'pdf') {
        const b64 = cy.png({ full: true, bg: '#ffffff', scale: scaleFactor }); 
        finishChronoExport(); 
        exportGraphToPdf(b64, fileName, window.electronAPI);
      }
  };

  document.getElementById('cmenu-compile')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode) { ui.compileModal.style.display = 'flex'; } });
  document.getElementById('compile-cancel')?.addEventListener('click', () => ui.compileModal.style.display = 'none');
  document.getElementById('compile-generate')?.addEventListener('click', () => { 
    ui.compileModal.style.display = 'none'; 
    if (!state.activeNode) return; 
    
    const targetRank = (document.getElementById('compile-rank') as HTMLSelectElement).value; 
    let nodesToCompile = state.activeNode.union(state.activeNode.successors('node')); 
    if (targetRank !== 'Tous') { 
        nodesToCompile = nodesToCompile.filter((n: any) => n.data('rank') === targetRank); 
    } 
    
    let htmlContent = ''; 
    state.currentXlsxRows = [];
    state.currentXlsxTitle = state.activeNode.data('name') || t('table.sheet_name');
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
      state.currentXlsxRows.push([
          { v: displayName, italic: !!d.isItalic }, { v: displayStatus }, { v: displayRank },
          { v: d.period }, { v: d.author }, { v: d.discoveryDate }, { v: d.size },
          { v: d.mass }, { v: d.distribution }, { v: d.iucn }, { v: d.diagnose },
          { v: d.synapomorphies }, { v: d.notes }, { v: d.biblio }
      ]); 
    });
    
    const tbody = document.getElementById('data-table-body'); 
    if(tbody) tbody.innerHTML = htmlContent; 
    state.currentCSVData = csvContent; 
    
    const title = document.getElementById('table-title'); 
    if(title) title.innerText = `${t('compile.table_data')} ${state.activeNode.data('name')} (${targetRank})`; 
    ui.tableModal.style.display = 'flex'; 
  });
  document.getElementById('table-close')?.addEventListener('click', () => ui.tableModal.style.display = 'none');
  document.getElementById('table-export')?.addEventListener('click', async () => { 
      const csvData = '\uFEFF' + state.currentCSVData; 
      await window.electronAPI.saveExport(csvData, `export_${state.activeNode.data('name')}.csv`, 'csv');
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
          await saveExcelFile(state.currentXlsxTitle, cols, state.currentXlsxRows, window.electronAPI);
      });
  })();
  
  ui.btnExportFiche.onclick = async () => {
    if (!state.activeNode) return;
    
    let synNameStr = '';
    const synId = state.activeNode.data('synonymTargetId');
    if (synId) {
        const tNode = cy.$id(synId);
        if (tNode.length > 0) synNameStr = '= ' + getDynamicNodeName(tNode, 'full');
    }

    const lineageStr = buildLineageString(state.activeNode).replace(/<[^>]+>/g, '');
    await generateFichePdf(state.activeNode.data(), state.appSettings, lineageStr, synNameStr, GEO_DETAILS, window.electronAPI);
  };

  document.getElementById('cmenu-box-add')?.addEventListener('click', (e) => { 
      e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
      const selectedNodes = cy.$('node:selected').filter((n: any) => !n.hasClass('box')); 
      
      if (selectedNodes.length > 0) { 
          saveState(); 
          const newBoxId = 'box-' + Date.now(); 
          let targetIds: string[] = [];
          let defaultName = t('default.para_group');
          let isMono = false;

          if (selectedNodes.length === 1) {
              isMono = true; 
              const rootNode = selectedNodes[0];
              targetIds = [rootNode.id()]; 
              const taxonName = rootNode.data('name');
              defaultName = (taxonName && taxonName.trim() !== '') ? t('default.clade_prefix') + taxonName : t('default.mono_clade');
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
      if (state.activeNode && state.activeNode.hasClass('box')) { 
          saveState(); 
          cy.remove(state.activeNode); 
          refreshLayout(); 
      } 
  });
  
  cy.on('cxttap', 'node', (e) => {
    state.activeNode = e.target; 
    const pasteBtn = document.getElementById('cmenu-paste'); 
    if(pasteBtn) pasteBtn.style.color = state.clipboard ? "var(--text-main)" : "var(--border-color)";
    
    const isBreak = state.activeNode.data('hasNewSheet'); 
    const isRoot = state.activeNode.id() === state.currentRootId; 
    const isBox = state.activeNode.hasClass('box'); 
    const hasParent = state.activeNode.data('parent');
    
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

  // 1. Clic simple : Scanner de proximité incluant les données CSS dynamiques
  cy.on('tap', (e: any) => { 
      ui.contextMenu.style.display = 'none'; 
      if (e.target === cy) {
          const clickPos = e.position; 
          const threshold = 30 / cy.zoom(); 
          let closestNode: any = null; let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              if (!node.hasClass('box') && (!node.data('name') || node.data('name').trim() === '' || node.data('isEmpty') || node.width() < 10 || state.layoutMode === 'chrono')) {
                  const nodePos = node.position();
                  const d1 = Math.hypot(nodePos.x - clickPos.x, nodePos.y - clickPos.y);
                  const d2 = Math.hypot((nodePos.x + (node.data('imgOffsetX')||0)) - clickPos.x, (nodePos.y + (node.data('imgOffsetY')||0)) - clickPos.y);
                  const d3 = Math.hypot((nodePos.x + (node.data('cTextMarginX')||0)) - clickPos.x, (nodePos.y + (node.data('cTextMarginY')||0)) - clickPos.y);
                  const dist = Math.min(d1, d2, d3);
                  
                  if (dist < minDistance) { minDistance = dist; closestNode = node; }
              }
          });
          if (closestNode) { cy.nodes().unselect(); closestNode.select(); }
      }
  });

  // 2. Double-clic classique
  cy.on('dbltap', 'node', (e: any) => { if (!e.target.hasClass('box')) openInlineEditor(e.target); });

  // 3. Double-clic dans le vide : Scanner de proximité pour édition
  cy.on('dbltap', (e: any) => {
      if (e.target === cy) {
          const clickPos = e.position; 
          const threshold = 30 / cy.zoom(); 
          let closestNode: any = null; let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              if (!node.hasClass('box') && (!node.data('name') || node.data('name').trim() === '' || node.data('isEmpty') || node.width() < 10 || state.layoutMode === 'chrono')) {
                  const nodePos = node.position();
                  const d1 = Math.hypot(nodePos.x - clickPos.x, nodePos.y - clickPos.y);
                  const d2 = Math.hypot((nodePos.x + (node.data('imgOffsetX')||0)) - clickPos.x, (nodePos.y + (node.data('imgOffsetY')||0)) - clickPos.y);
                  const d3 = Math.hypot((nodePos.x + (node.data('cTextMarginX')||0)) - clickPos.x, (nodePos.y + (node.data('cTextMarginY')||0)) - clickPos.y);
                  const dist = Math.min(d1, d2, d3);
                  if (dist < minDistance) { minDistance = dist; closestNode = node; }
              }
          });
          if (closestNode) openInlineEditor(closestNode);
      }
  });

  // 2. Double-clic classique
  cy.on('dbltap', 'node', (e: any) => { if (!e.target.hasClass('box')) openInlineEditor(e.target); });

  // 3. Double-clic dans le vide : Éditer via scanner de proximité
  cy.on('dbltap', (e: any) => {
      if (e.target === cy) {
          const clickPos = e.position; 
          const threshold = 30 / cy.zoom(); 
          let closestNode: any = null; let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              if (!node.hasClass('box') && (!node.data('name') || node.data('name').trim() === '' || node.data('isEmpty') || node.width() < 10 || state.layoutMode === 'chrono')) {
                  const nodePos = node.position();
                  const d1 = Math.hypot(nodePos.x - clickPos.x, nodePos.y - clickPos.y);
                  const d2 = Math.hypot((nodePos.x + (node.data('imgOffsetX')||0)) - clickPos.x, (nodePos.y + (node.data('imgOffsetY')||0)) - clickPos.y);
                  const d3 = Math.hypot((nodePos.x + (node.data('textMarginX')||0)) - clickPos.x, (nodePos.y + (node.data('textMarginY')||0)) - clickPos.y);
                  const dist = Math.min(d1, d2, d3);
                  if (dist < minDistance) { minDistance = dist; closestNode = node; }
              }
          });
          if (closestNode) openInlineEditor(closestNode);
      }
  });

  // 2. Double-clic classique : Sur un noeud dont le corps est assez grand pour être visé
  cy.on('dbltap', 'node', (e: any) => {
      const node = e.target;
      if (!node.hasClass('box')) {
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
              if (!node.data('name') || node.data('name').trim() === '' || node.data('isEmpty') || node.width() < 5) {
                  const nodePos = node.position();
                  const distance = Math.hypot(nodePos.x - clickPos.x, nodePos.y - clickPos.y);
                  
                  if (distance < minDistance) {
                      minDistance = distance;
                      closestNode = node;
                  }
              }
          });

          // CORRECTION : On a retiré le blocage sur 'root' et state.currentRootId
          if (closestNode && !closestNode.hasClass('box')) {
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
          
          // CORRECTION CRITIQUE : Si on ouvre le menu, on l'actualise avec la sélection actuelle !
          if (isHidden) {
              const selected = cy.$('node:selected');
              if (selected.length === 1) {
                  updateRibbonForNode(selected[0]);
              }
          }
          
          setTimeout(() => cy.fit(cy.nodes(':visible').not('.strato-bg'), 50), 50); 
      };
      
      btnCloseRibbon.onclick = () => {
          ui.styleMenu.style.display = 'none';
          btnToggleRibbon.style.background = 'rgba(33, 150, 243, 0.1)';
          setTimeout(() => cy.fit(cy.nodes(':visible').not('.strato-bg'), 50), 50);
      };
  }

  document.getElementById('cmenu-edit')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) openSidePanelForNode(state.activeNode); });
  document.getElementById('cmenu-sheet-new')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) { saveState(); state.activeNode.data('hasNewSheet', true); refreshLayout(); } });
  document.getElementById('cmenu-sheet-open')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) { saveState(); state.currentRootId = state.activeNode.id(); refreshLayout(true); } });
  document.getElementById('cmenu-sheet-remove')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) { saveState(); state.activeNode.data('hasNewSheet', false); refreshLayout(); } });
  document.getElementById('cmenu-cut')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) cutClade(state.activeNode); });
  document.getElementById('cmenu-copy')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) copyClade(state.activeNode); });
  document.getElementById('cmenu-paste')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && state.clipboard && !state.activeNode.hasClass('box')) pasteClade(state.activeNode); });
  document.getElementById('cmenu-graft')?.addEventListener('click', (e) => { 
    e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
    if (state.activeNode && !state.activeNode.hasClass('box')) { 
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.phylo,.xmind';
      input.onchange = (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (file) handleGraft(file, state.activeNode);
      };
      input.click(); 
    } 
  });

  const inputKeys = Object.keys(ui.formInputs);
  ui.btnUploadSheetImage.onclick = () => ui.inpSheetImageFile.click();
  
  ui.inpSheetImageFile.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file && state.activeNode && !state.activeNode.hasClass('box')) {
          const reader = new FileReader();
          reader.onload = async (eLoad) => {
              const base64 = eLoad.target?.result as string;
              const ratio = await getImageRatio(base64); 
              saveState();
              state.activeNode.data('sheetImage', base64);
              state.activeNode.data('sheetImageRatio', ratio);
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
      if (state.activeNode && !state.activeNode.hasClass('box')) {
          saveState();
          state.activeNode.data('sheetImage', '');
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

  // 3. Ouvrir et Voyager vers le Fichier
  ui.btnOpenLinkedFile.onclick = async () => {
      if (!state.activeNode || state.activeNode.hasClass('box')) return;
      
      const linkedPath = state.activeNode.data('linkedFilePath');
      const linkedName = state.activeNode.data('linkedFileName');
      if (!linkedName) return;

      // Protection anti-perte de données
      if (state.hasUnsavedChanges) {
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
      if (!loaded && state.currentFilePath) {
          const dir = getDirectory(state.currentFilePath);
          const fallbackPath = dir + linkedName;
          const res2 = await window.electronAPI.readFileDirect(fallbackPath);
          if (res2.success && res2.data) {
              // Si on le trouve ici, on répare silencieusement le chemin absolu sur le noeud
              state.activeNode.data('linkedFilePath', res2.filePath); 
              await loadTreeFromBuffer(res2.data as Uint8Array, res2.fileName!, res2.filePath);
              loaded = true;
          }
      }

      // TENTATIVE 3 : Relocalisation Manuelle (Ancre de secours)
      if (!loaded) {
          alert(t('alert.link_broken1') + linkedName + t('alert.link_broken2'));
          const res3 = await window.electronAPI.openFile();
          if (res3.success && res3.data && res3.fileName) {
              // Réparation du lien avec le nouveau chemin choisi par l'utilisateur
              state.activeNode.data('linkedFilePath', res3.filePath);
              state.activeNode.data('linkedFileName', res3.fileName);
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
      
      box.innerHTML = `<h3 style="color:#e53935; margin-top:0; margin-bottom:15px; font-size:18px;">\u26A0 ${t('alert.action_impossible')}</h3><p style="font-size:14px; line-height:1.5;">${msg}</p><button id="btn-custom-alert" style="margin-top:20px; padding:8px 25px; cursor:pointer; background:#e53935; color:white; border:none; border-radius:4px; font-weight:bold;">${t('btn.ok')}</button>`;
      
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
      
      // 1. On applique les données uniquement quand on quitte la case ou qu'on fait Entrée (événement 'change')
      inputEl.addEventListener('change', (e: any) => {
          if (state.activeNode && !state.activeNode.hasClass('box')) {
              const val = e.target.value;
              state.activeNode.data(key, val);
              
              if (key === 'status') {
                  ui.containerSynonym.style.display = val === 'Synonyme' ? 'flex' : 'none';
              }

              if (key === 'period') {
                  updateTimeline(val);
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
                          const parent = state.activeNode.incomers('node');
                          if (parent.length > 0) {
                              const pAge = getStartAge(parent[0].data('period'));
                              if (pAge !== null && pAge < newAge) { 
                                  isParadox = true;
                                  message = t('alert.paradox_parent1') + pAge + t('alert.paradox_parent2') + newAge + " Ma).";
                              }
                          }
                          if (!isParadox) {
                              state.activeNode.outgoers('node').forEach((child: any) => {
                                  if (isParadox) return;
                                  const cAge = getStartAge(child.data('period'));
                                  if (cAge !== null && cAge > newAge) {
                                      isParadox = true;
                                      message = t('alert.paradox_child1') + cAge + t('alert.paradox_child2') + newAge + " Ma).";
                                  }
                              });
                          }
                          if (isParadox) {
                              const inputNative = inputEl as HTMLInputElement;
                              inputNative.value = '';
                              state.activeNode.data('period', '');
                              updateTimeline('');
                              refreshLayout(false);
                              showCustomAlert(message);
                              return; 
                          }
                      }
                  }
              }
              
              refreshLayout();
              setUnsavedState(true);
              saveState();
          }
      });

      // 2. Faire en sorte que la touche Entrée simule la perte de focus et passe à la case suivante
      inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
              e.stopPropagation(); 
              if (inputEl.tagName === 'INPUT' || inputEl.tagName === 'SELECT') {
                  e.preventDefault(); 
                  inputEl.blur(); // Force l'application instantanée (déclenche le 'change')
                  
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
          const zoomSpeed = baseSpeed * state.appSettings.zoomSensitivity; 
          
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
    if (target.id() === state.currentRootId || target.hasClass('box')) return;
    
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

              if (node.data('hasNewSheet') && node.id() !== state.currentRootId) { 
                  e.preventDefault(); 
                  state.currentRootId = node.id(); 
                  refreshLayout(true); 
                  closeSidePanel(); 
                  return; 
              } 

              if (node.id() === state.currentRootId && state.currentRootId !== 'root') {
                  e.preventDefault();
                  const incoming = node.incomers('node');
                  if (incoming.length > 0) {
                      const parentNode = incoming.first();
                      state.currentRootId = getSheetRootForNode(parentNode);
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
                      if (node.data('hasNewSheet')) { state.currentRootId = node.id(); refreshLayout(true); } else if (node.data('collapsed')) { toggleCollapse(node); } else { refreshLayout(); } 
                      cy.animate({ center: { eles: newNode } }, { duration: 250 });
                  } 
                  // 2. Si le presse-papier de l'ordinateur est vide, on colle le Clade copié dans l'application
                  else if (state.clipboard) {
                      pasteClade(selected[0]);
                  }
              }).catch(() => {
                  // Sécurité au cas où l'OS bloque la lecture du texte
                  if (state.clipboard) pasteClade(selected[0]);
              });
          } 
          return; 
      }
      if (e.key === ' ') { if (selected.length > 0 && !selected[0].hasClass('box') && selected[0].outgoers('node').length > 0) { e.preventDefault(); toggleCollapse(selected[0]); } return; }
      
      if (e.key === 'Enter') { // Insertion au milieu
        if (selected.length === 1 && !selected[0].hasClass('box')) { 
          e.preventDefault(); const node = selected[0]; if (node.id() === state.currentRootId || node.id() === 'root') return; 
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
        e.preventDefault(); const node = selected[0]; if (node.id() === state.currentRootId) return; const incomingEdges = node.incomers('edge'); 
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
        if (node.data('hasNewSheet')) { state.currentRootId = node.id(); refreshLayout(true); } else if (node.data('collapsed')) { toggleCollapse(node); } else { refreshLayout(); } 
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
                  if (cladeToDelete.contains(cy.$id(state.currentRootId))) state.currentRootId = 'root'; 
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

      if (state.layoutMode === 'chrono') {
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
      if (state.layoutMode === 'chrono' && chronoRulerUpdater) startChronoRaf();
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
      // CORRECTION : On ignore le bouclier si on est en train de centrer la caméra !
      if (state.layoutMode !== 'chrono' || isClamping || isFittingCamera) return;
      
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
      if (state.layoutMode === 'chrono') {
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
      });
  }
  const htmlImageCache = new Map<string, HTMLImageElement>();

  const syncHtmlImages = () => {
      let layer = document.getElementById('html-image-layer');
      if (!layer) {
          const app = document.getElementById('app');
          if (!app) return;
          layer = document.createElement('div');
          layer.id = 'html-image-layer';
          // 'will-change: transform' prévient le navigateur que cette couche va bouger constamment
          layer.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:4; overflow:hidden; will-change: transform;";
          app.appendChild(layer);
      }

      const zoom = cy.zoom();
      const pan = cy.pan();
      const currentVisible = new Set<string>();

      // PHASE 1 : LECTURE PURE (Aucune modification du DOM ici pour éviter le Layout Thrashing)
      const renderQueue: any[] = [];
      
      cy.nodes(':visible').forEach((n: any) => {
          if (n.hasClass('box')) return;
          
          // EFFACEMENT VISUEL : Interdit l'affichage si Chronogramme + Intermédiaire
          const isSheetBreak = n.data('hasNewSheet') && n.id() !== state.currentRootId;
          const isCollapsed = n.data('collapsed');
          const hasVisualChildren = !isSheetBreak && !isCollapsed && n.outgoers('node:not(.box)').filter((child: any) => child.id() !== 'ghost-node').length > 0;
          
          if (state.layoutMode === 'chrono' && hasVisualChildren) return;

          const imgUrl = n.data('imgUrl');
          if (!imgUrl || imgUrl.trim() === '') return;

          const id = n.id();
          currentVisible.add(id);

          const pos = n.position();
          const offsetX = n.data('imgOffsetX') || 0;
          const offsetY = n.data('imgOffsetY') || 0;

          const iSize = n.data('imgSize') || 150;
          const ratio = n.data('imgRatio') || 1;
          const iWidth = iSize * zoom;
          const iHeight = (iSize / ratio) * zoom;

          const screenX = (pos.x + offsetX) * zoom + pan.x;
          const screenY = (pos.y + offsetY) * zoom + pan.y;

          const left = screenX - iWidth / 2;
          const top = screenY - iHeight / 2;
          const isSelected = n.selected();

          renderQueue.push({ id, imgUrl, iWidth, iHeight, left, top, isSelected });
      });

      // PHASE 2 : ÉCRITURE PURE EN LOT ET ACCÉLÉRATION MATÉRIELLE (GPU)
      renderQueue.forEach(job => {
          let img = htmlImageCache.get(job.id);
          if (!img) {
              img = document.createElement('img');
              img.style.position = 'absolute';
              img.style.top = '0px';
              img.style.left = '0px';
              img.style.transformOrigin = 'top left';
              img.style.objectFit = 'contain';
              // Rendu optimal pour le mouvement
              img.style.willChange = 'transform';
              img.src = job.imgUrl;
              layer.appendChild(img);
              htmlImageCache.set(job.id, img);
          } else if (img.src !== job.imgUrl) {
              img.src = job.imgUrl; 
          }

          if (job.isSelected) {
              img.style.filter = 'drop-shadow(0px 0px 8px #2196F3)';
          } else {
              img.style.filter = 'none';
          }

          img.style.width = `${job.iWidth}px`;
          img.style.height = `${job.iHeight}px`;
          
          // translate3d délègue le mouvement à la carte graphique (Gain de FPS massif)
          img.style.transform = `translate3d(${job.left}px, ${job.top}px, 0)`;
      });

      // Nettoyage des images devenues invisibles
      htmlImageCache.forEach((img, id) => {
          if (!currentVisible.has(id)) {
              img.remove();
              htmlImageCache.delete(id);
          }
      });
  };

  cy.on('render pan zoom resize', syncHtmlImages);
};

window.addEventListener('DOMContentLoaded', startApp);