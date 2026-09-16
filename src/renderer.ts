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
import { LayoutEngine } from './layout-engine';

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

const APP_VERSION = (window as any).electronAPI?.appVersion || '';

let pendingOSFile: string | null = null;
let isAppReady = false;

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

      if (node.data('status') === 'Synonyme') {
          ui.containerSynonym.style.display = 'flex';
      } else {
          ui.containerSynonym.style.display = 'none';
      }

      const synId = node.data('synonymTargetId');
      if (synId) {
          const targetNode = cy.$id(synId);
          if (targetNode.length > 0) {
              const targetName = LayoutEngine.getDynamicNodeName(targetNode, state, 'full');
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
    
    if (!full && path.length > 4) {
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
          boxName.onchange = (ev) => { node.data('name', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 
          boxOpacity.oninput = (ev) => { node.data('boxOpacity', parseInt((ev.target as any).value) / 100); debounced('boxEdit', 90, refreshLayout); setUnsavedState(true); }; 
          boxBorderStyle.onchange = (ev) => { node.data('boxBorderStyle', (ev.target as any).value); refreshLayout(); setUnsavedState(true); }; 
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
          inpImgFile.style.color = 'transparent'; 
      } else {
          labelSpan.innerText = '';
          inpImgFile.style.color = ''; 
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
          
          btn.onclick = async () => {
            try {
              let treeData = file.data;
              
              if (file.path && window.electronAPI && window.electronAPI.readFileDirect) {
                  const result = await window.electronAPI.readFileDirect(file.path);
                  if (result.success && result.data) {
                      let actualBuf = result.data;
                      if (!(actualBuf instanceof Uint8Array)) {
                          actualBuf = new Uint8Array((actualBuf as any).type === 'Buffer' ? (actualBuf as any).data : actualBuf);
                      }
                      const decoder = new TextDecoder('utf-8');
                      const text = decoder.decode(actualBuf).replace(/^\uFEFF/, '');
                      treeData = JSON.parse(text);
                  }
              }
              
              state.currentFilePath = file.path;
              cy.startBatch();
              cy.elements().remove(); 
              
              let elementsToAdd = treeData.graph.elements;
              if (elementsToAdd && !Array.isArray(elementsToAdd)) {
                  elementsToAdd = [...(elementsToAdd.nodes || []), ...(elementsToAdd.edges || [])];
              }
              cy.add(elementsToAdd); 
              
              state.currentRootId = treeData.state?.currentRootId || treeData.currentRootId || 'root'; 
              refreshLayout(true); 
              cy.endBatch();
              
              setTimeout(() => { state.hasUnsavedChanges = false; setUnsavedState(false); stateManager.resetStacks(); stateManager.resetStacks(); }, 100);
              if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
            } catch (err) { alert(t('alert.recent_error') + " : " + err); }
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
      
      if (closeCurrentEditor) closeCurrentEditor();
      isEditing = false;
      state.activeNode = null;
      state.clipboard = null;
      
      cy.startBatch();
      cy.elements().remove();
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
          
          const response = await window.electronAPI.saveFile(dataStr, targetPath);
          
          if (response.success && response.filePath) {
              state.currentFilePath = response.filePath; 
              saveToRecentFiles(rootName, exportData, state.currentFilePath); 
              setUnsavedState(false);
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

  function propagateBoxMembership(sourceNode: any, newNodes: any[]) {
      if (!sourceNode || !newNodes || newNodes.length === 0) return;
      
      cy.nodes('.box').forEach((box: any) => {
          let targets = box.data('targets') || [];
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
      
      const added = cy.add(newElements); 
      propagateBoxMembership(targetNode, added.filter('node').toArray()); 
      
      refreshLayout(); 
  }
  
  function toggleCollapse(node: any) { 
      saveState(); 
      const isCollapsed = !node.data('collapsed'); 
      node.data('collapsed', isCollapsed); 
      refreshLayout(); 
  }

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
      const subtitle = document.querySelector('#welcome-overlay p');
      if (subtitle) subtitle.innerHTML = t('welcome.subtitle');
      
      const btnStart = document.getElementById('btn-start');
      if (btnStart) btnStart.innerHTML = t('welcome.new_project');
      
      const tip = document.querySelector('#welcome-overlay i');
      if (tip) tip.innerHTML = t('welcome.tip');
      
      const recentTitle = document.querySelector('#recent-files-container div');
      if (recentTitle) recentTitle.innerHTML = t('welcome.recent');

      const btnShortcuts = document.getElementById('btn-shortcuts');
      if (btnShortcuts) btnShortcuts.innerHTML = t('btn.shortcuts');

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

      ui.formInputs.period.placeholder = t('placeholder.period');
      ui.formInputs.synapomorphies.placeholder = t('placeholder.synapo');
      ui.formInputs.imgCredits.placeholder = t('placeholder.img_credits');
      ui.searchInput.placeholder = t('search.placeholder');

      ui.btnUploadSheetImage.innerHTML = t('btn.upload_illus');
      ui.btnClearSheetImage.innerHTML = t('btn.delete_illus');

      updateSheetsBar();
      updateCounters();
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
          state.appSettings.wallpaper = ''; 
          localStorage.setItem('cladistree_settings', JSON.stringify(state.appSettings));
          applyTheme(state.appSettings.theme); 
      }
  }

  const UPDATE_SITE_URL = 'https://mistytoonz.github.io/CladisTree/#';
  const UPDATE_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
  const LS_LAST_CHECK = 'cladistree_update_lastcheck';
  const LS_SKIPPED = 'cladistree_update_skipped';

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

  const runUpdateCheck = async (manual: boolean) => {
      if (!window.electronAPI?.checkForUpdate) return;

      if (!manual) {
          try {
              const last = parseInt(localStorage.getItem(LS_LAST_CHECK) || '0', 10);
              if (last && Date.now() - last < UPDATE_CHECK_INTERVAL) return;
          } catch (e) {}
      }

      const res = await window.electronAPI.checkForUpdate();

      if (res && res.success) {
          try { localStorage.setItem(LS_LAST_CHECK, String(Date.now())); } catch (e) {}
      }

      if (!res || !res.success || !res.version) {
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
          ui.setWallpaperFile.value = ''; 
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
          const result = await window.electronAPI.openFile(); 
          if (result.success && result.data && result.fileName) {
              await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
              if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
          }
      } else {
          ui.fileInput.click(); 
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
          'text-background-color': 'transparent', 
          'text-background-opacity': 0,
          'background-image': (n: any) => n.data('bgUrls') || 'none',
          'background-width': (n: any) => n.data('bgWidthsStr') || '0px',
          'background-height': (n: any) => n.data('bgHeightsStr') || '0px',
          'background-position-x': (n: any) => n.data('bgPosXsStr') || '50%',
          'background-position-y': (n: any) => n.data('bgPosYsStr') || '50%',
          'background-fit': (n: any) => n.data('bgFitsStr') || 'none',
          'text-events': 'yes' 
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
          selector: 'node[!name]:selected, node[name = ""]:selected, node[?isEmpty]:selected',
          style: { 
              'background-color': '#2196F3',
              'background-opacity': 1,
              'border-color': '#ffffff',
              'border-width': '2px',
              'border-opacity': 1,
              'width': '12px',
              'height': '12px',
              'shape': 'ellipse'
          } as any
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
    const lines = name.split('\n');
    let firstLine = lines[0];
    const otherLines = lines.slice(1).join('\n');

    let prefixMatch = firstLine.match(/^[†+”"«“'’\s]+/);
    let prefix = prefixMatch ? prefixMatch[0] : '';
    let cleanName = firstLine.substring(prefix.length).replace(/[”"»”'’\s]+$/, '').trim(); 
    
    if (cleanName.toLowerCase().includes('clade') || cleanName.toLowerCase().includes('taxon') || cleanName.toLowerCase().includes('groupe')) return;

    let currentRank = node.data('rank');
    let words = cleanName.split(/[ \t]+/);

    if (words.length >= 2 && /^[a-zA-Z][.?]+$/.test(words[0])) {
        const initial = words[0].charAt(0).toUpperCase();
        let curr = node.incomers('node').first();
        while (curr && curr.length > 0 && !curr.hasClass('box')) {
            let pName = (curr.data('name') || '').split('\n')[0].replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim();
            let pFirstWord = pName.split(/[ \t]+/)[0];
            
            if (pFirstWord && pFirstWord.toUpperCase().startsWith(initial)) {
                const expandedFirstLine = prefix + pFirstWord + ' ' + words.slice(1).join(' ');
                const fullName = otherLines.length > 0 ? expandedFirstLine + '\n' + otherLines : expandedFirstLine;
                node.data('name', fullName);
                cleanName = pFirstWord + ' ' + words.slice(1).join(' ');
                words = cleanName.split(/[ \t]+/); 
                break;
            }
            curr = curr.incomers('node').first();
        }
    }

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
          const pClean = pName.split('\n')[0].replace(/^[†+]\s*/, '').replace(/^["'«“]\s*/, '').replace(/\s*["'»”]$/, '').trim();
          const pWord = pClean.split(/[ \t]+/)[0].toLowerCase();
          
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
    
    ui.timelineIndicator.style.display = 'none';
    if(ui.timelineZoomContainer) ui.timelineZoomContainer.style.display = 'none';
    if(ui.timelineZoomIndicator) ui.timelineZoomIndicator.style.display = 'none';

    if (start !== null && end !== null && !isNaN(start) && !isNaN(end)) {  
        if (start < end) { const temp = start; start = end; end = temp; }  
        
        const isDeepPrecambrian = start > 541 || end > 541;
        ui.timelineIndicator.style.display = 'block';  
        
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

        if (ui.timelineZoomContainer && ui.timelineZoomContent && ui.timelineZoomIndicator) {
            const intersectingPeriods = GEO_DETAILS.filter(p => (start! > p.end && end! < p.start));
            
            if (intersectingPeriods.length > 0 && intersectingPeriods.length <= 2) {
                intersectingPeriods.sort((a, b) => b.start - a.start);
                
                const zoomStart = intersectingPeriods[0].start;
                const zoomEnd = intersectingPeriods[intersectingPeriods.length - 1].end;
                const zoomDuration = zoomStart - zoomEnd;
                
                ui.timelineZoomContent.innerHTML = '';
                
                intersectingPeriods.forEach(period => {
                    period.subs.forEach((sub, i) => {
                        const subDuration = sub.s - sub.e;
                        const subWidthPct = (subDuration / zoomDuration) * 100;
                        
                        const shadeAmount = (i / Math.max(1, period.subs.length - 1)) * 40 - 20;
                        const stageColor = adjustColorLightness(period.color, shadeAmount);
                        
                        const subDiv = document.createElement('div');
                        subDiv.style.cssText = `width:${subWidthPct}%; height:100%; background-color:${stageColor}; border-right:1px solid rgba(0,0,0,0.15); box-sizing:border-box; display:flex; align-items:center; justify-content:center; overflow:hidden; font-size:9px; color:rgba(0,0,0,0.8); white-space:nowrap; text-overflow:clip; cursor:help; padding:0 2px;`;
                        subDiv.title = `${t(sub.k)} (${sub.s} - ${sub.e} Ma)`;
                        if (subWidthPct > 6) subDiv.innerText = t(sub.k);
                        
                        ui.timelineZoomContent.appendChild(subDiv);
                    });
                });

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
        if (!state.appSettings.countInvalid) {
            const status = n.data('status');
            if (status && status !== 'Valide' && status.trim() !== '') return;
        }

        let rawName = n.data('name');
        if (!rawName || rawName.trim() === '') return;

        let cleanName = rawName.split('\n')[0].replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim().toLowerCase();
        if (cleanName === '' || cleanName === t('default.unnamed_branch').toLowerCase()) return;

        const explicitRank = n.data('rank');
        const words = cleanName.split(/[ \t]+/);
        
        const isSpeciesRank = explicitRank === 'Espèce' || explicitRank === 'Sous-espèce' || (state.appSettings.smartTaxonomy && (!explicitRank || explicitRank === 'Clade (non-classé)') && words.length >= 2);

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

            if (parentGenusNode) {
                let pName = parentGenusNode.data('name') || '';
                trueGenus = pName.replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim().split(/\s+/)[0].toLowerCase();
            }

            let firstWord = words[0];
            let epithet = cleanName;
            
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

      setTimeout(() => {
          if (state.appSettings.canvasBgLinked || hasWallpaper) {
              const textColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
              cy.style().selector('.taxon').style({ 'color': textColor }).update();
              cy.style().selector('edge').style({ 'line-color': textColor }).update();
          } else {
              cy.style().selector('.taxon').style({ 'color': '#000000' }).update();
              cy.style().selector('edge').style({ 'line-color': '#000000' }).update();
          }
      }, 10);
  }

  function updateBreadcrumbs() {
    let path: any[] = []; let curr: any = cy.$id(state.currentRootId);
    
    while (curr.length > 0) { 
        const rawName = curr.data('name'); 
        if (rawName && rawName.trim() !== '') { path.unshift({ id: curr.id(), name: rawName }); } 
        curr = curr.incomers('node').first(); 
    }
    if (path.length === 0) path.push({ id: state.currentRootId, name: t('default.unnamed_sheet') }); 
    
    ui.breadcrumbsBar.innerHTML = '';

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

    if (path.length > 4) {
      renderCrumb(path[0], false);
      
      const ellipsis = document.createElement('span');
      ellipsis.innerText = "...";
      ellipsis.title = path.map(p => p.name).join(' > '); 
      ellipsis.style.cssText = "cursor:help; font-weight:bold; letter-spacing:2px; color:#2196F3;";
      ui.breadcrumbsBar.appendChild(ellipsis);
      
      const sep = document.createElement('span'); 
      sep.innerText = " > "; sep.style.opacity = "0.5"; sep.style.textDecoration = "none"; 
      ui.breadcrumbsBar.appendChild(sep);

      renderCrumb(path[path.length - 2], false);
      renderCrumb(path[path.length - 1], true);
      
    } else {
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

    const sheetChildrenMap = new Map<string, any[]>();
    const topLevelSheets: any[] = [];

    allSheetNodes.forEach(n => {
        const parentId = n.data('parentSheetId');
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

    const activePath = new Set<string>();
    let curr = cy.$id(state.currentRootId);
    while (curr && curr.length > 0 && curr.id() !== absoluteRoot.id()) {
        activePath.add(curr.id());
        const pid = curr.data('parentSheetId');
        curr = pid ? cy.$id(pid) : (null as any);
    }

    const createSheetButton = (n: any) => {
        const btn = document.createElement('button');
        const rawName = n.data('name');
        let displayName = (!rawName || rawName.trim() === '') ? t('default.unnamed') : rawName;
        
        const isPinned = n.data('isPinned');
        const isAbsoluteRoot = n.id() === absoluteRoot.id();
        const isActive = n.id() === state.currentRootId;

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
                draggedNode.data('isPinned', false); 
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

    const processNodeHierarchy = (node: any, parentContainer: HTMLElement) => {
        const nId = node.id();
        const pId = node.data('parentSheetId');
        const isPinned = node.data('isPinned');
        const isTopLevel = !pId || pId === absoluteRoot.id() || isPinned;
        
        if (!isTopLevel) {
            const separator = document.createElement('span');
            if (activePath.has(nId) && nId !== state.currentRootId) {
                separator.innerText = '\u2192'; 
            } else {
                separator.innerText = '\u21B3'; 
            }
            separator.style.cssText = "color:var(--text-main); opacity:0.6; font-weight:bold; margin:0 2px; flex-shrink:0;";
            parentContainer.appendChild(separator);
        }

        const btn = createSheetButton(node);
        if (btn) parentContainer.appendChild(btn);

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

    const absoluteRootBtn = createSheetButton(absoluteRoot);
    if (absoluteRootBtn) stickyZone.appendChild(absoluteRootBtn);

    sortSheets(topLevelSheets);
    topLevelSheets.forEach(node => {
        const targetZone = node.data('isPinned') ? stickyZone : scrollZone;
        processNodeHierarchy(node, targetZone);
    });

    if (stickyZone.children.length === 1) {
        stickyZone.style.borderRight = 'none';
        stickyZone.style.paddingRight = '0px';
        stickyZone.style.marginRight = '0px';
    }
  }

  const textWidthCache = new Map<string, number>();
  const TEXT_CACHE_MAX = 4000;
  const cacheTextWidth = (key: string, value: number) => {
      if (textWidthCache.size >= TEXT_CACHE_MAX) {
          const oldest = textWidthCache.keys().next().value;
          if (oldest !== undefined) textWidthCache.delete(oldest);
      }
      textWidthCache.set(key, value);
  };

  const debounceTimers = new Map<string, any>();
  const debounced = (key: string, delay: number, fn: () => void) => {
      const prev = debounceTimers.get(key);
      if (prev) clearTimeout(prev);
      debounceTimers.set(key, setTimeout(() => {
          debounceTimers.delete(key);
          fn();
      }, delay));
  };

  let cachedGraphBB: any = null;
  let graphBBVersion = 0;
  const invalidateGraphBB = () => { cachedGraphBB = null; graphBBVersion++; };
  const getGraphBB = () => {
      if (!cachedGraphBB) cachedGraphBB = cy.elements().boundingBox();
      return cachedGraphBB;
  };

  let searchIndex: { node: any, strings: string[] }[] | null = null;
  let searchIndexVersion = -1;
  const invalidateSearchIndex = () => { searchIndex = null; };
  let isFirstLoad = true;

  let globalTimeMax = 0; 
  let globalTimeMin = 0; 
  let chronoRulerUpdater: (() => void) | null = null;
  let chronoRafRunning = false;
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
          chronoRafRunning = false; 
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
  const CHRONO_EDGE_PAD = 40; 

  type ChronoAxisMode = 'linear' | 'sqrt' | 'log' | 'rank';
  let chronoAxisMode: ChronoAxisMode = 'linear';
  let chronoAxisLo = 0;    
  let chronoAxisHi = 100;  
  let chronoRankAges: number[] = []; 

  type ChronoBoundsMode = 'period' | 'tight';
  let chronoBoundsMode: ChronoBoundsMode = 'period';

  let chronoLanesEnabled = false;
  let chronoLaneCount = 0;
  const CHRONO_LANE_MIN = 8;       
  const CHRONO_LANE_STEP = 3;      
  const CHRONO_LANE_MAX_TURN = 12; 

  const chronoWarp = (age: number): number => {
      const a = Math.max(0, age);
      if (chronoAxisMode === 'sqrt') return Math.sqrt(a);
      if (chronoAxisMode === 'log') return Math.log1p(a);
      if (chronoAxisMode === 'rank') {
          const n = chronoRankAges.length;
          if (n === 0) return a;
          if (a <= chronoRankAges[0]) return 0;
          if (a >= chronoRankAges[n - 1]) return n - 1;
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

  let chronoContentRight = 0;
  let chronoContentLeft = 0;

  const CHRONO_RULER_BOTTOM = 100;
  const CHRONO_STAGE_H = 40;
  const CHRONO_PERIOD_H = 24;
  const CHRONO_RULER_H = CHRONO_STAGE_H + CHRONO_PERIOD_H;

  const getChronoWorldBounds = () => {
      // Murs invisibles détruits. L'espace de navigation est désormais infini (+/- 1500px de marge).
      const bb = cy.elements().boundingBox();
      return { x1: bb.x1 - 1500, x2: bb.x2 + 1500, w: (bb.x2 - bb.x1) + 3000 };
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

      if (state.layoutMode === 'chrono' && state.currentRootId) {
          // --- MOTEUR GÉOMÉTRIQUE EXTERNALISÉ ---
          const limits = LayoutEngine.applyLayout(cy, state, themeTextColor, textWidthCache, chronoAxisMode);
          
          globalTimeMax = limits.globalTimeMax;
          globalTimeMin = limits.globalTimeMin;
          chronoAxisLo = globalTimeMin;
          chronoAxisHi = globalTimeMax;
      } else {
          // --- LOGIQUE STANDARD ET PEIGNE ---
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

          visibleNodes.forEach(nodeId => {
              const node = nodesById.get(nodeId);
              if (!node || node.hasClass('box') || nodeId === 'ghost-node') return;
              
              const hasLink = node.data('hasNewSheet') && nodeId !== state.currentRootId;
              const imgUrlData = node.data('imgUrl');
              
              const isSheetBreak = node.data('hasNewSheet') && nodeId !== state.currentRootId;
              const isCollapsed = node.data('collapsed');
              const visualChildren = (isSheetBreak || isCollapsed) ? [] : (childrenMap.get(nodeId) || []);
              const isLeaf = visualChildren.length === 0;

              let hasImage = imgUrlData && imgUrlData.trim() !== '';

              const dynamicName = LayoutEngine.getDynamicNodeName(node, state);
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
                  
                  let iPos = node.data('imgPos') || 'left';
                  if (iPos === 'left') { blockW = iW + GAP + textW; blockH = Math.max(iH, textH); imgOffsetX = -blockW/2 + iW/2; txtOffsetX = blockW/2 - textW/2; } 
                  else if (iPos === 'right') { blockW = textW + GAP + iW; blockH = Math.max(textH, iH); txtOffsetX = -blockW/2 + textW/2; imgOffsetX = blockW/2 - iW/2; } 
                  else if (iPos === 'top') { blockW = Math.max(textW, iW); blockH = iH + GAP + textH; imgOffsetY = -blockH/2 + iH/2; txtOffsetX = 0; txtOffsetY = blockH/2 - textH/2; } 
                  else { blockW = Math.max(textW, iW); blockH = textH + GAP + iH; txtOffsetY = -blockH/2 + textH/2; imgOffsetX = 0; imgOffsetY = blockH/2 - iH/2; }
              }

              let originalTxtOffsetY = txtOffsetY;
              if (node.data('textAbove')) txtOffsetY -= (fontSize * 0.8) + 8;

              const pad = node.data('hasFrame') ? 18 : 10;
              const finalW = isEmptyBranch ? 0.1 : blockW + pad*2;
              const finalH = isEmptyBranch ? 0.1 : blockH + pad*2;
              
              const isNameEmpty = (!dynamicName || dynamicName.trim() === '');
              let labelText = node.data('extinct') && !isNameEmpty && !dynamicName.startsWith('\u2020') ? '\u2020 ' + dynamicName : dynamicName; 
              if (node.data('collapsed')) labelText += ' [+]';
              if (node.data('linkedFileName')) labelText += ' \u2197'; 
              if (node.data('hasNewSheet') && nodeId !== state.currentRootId) labelText += ' \u2794';
              const d0 = node.data();
              const hasSheetContent = !!((d0.discoveryDate && d0.discoveryDate.trim() !== '') || (d0.author && d0.author.trim() !== '') || (d0.distribution && d0.distribution.trim() !== '') || (d0.size && d0.size.trim() !== '') || (d0.mass && d0.mass.trim() !== '') || (d0.period && d0.period.trim() !== '') || (d0.synapomorphies && d0.synapomorphies.trim() !== '') || (d0.notes && d0.notes.trim() !== '') || (d0.iucn && d0.iucn.trim() !== '') || (d0.sheetImage && d0.sheetImage.trim() !== ''));
              if (state.appSettings.showFicheIndicator && hasSheetContent) labelText += ' \u{1F5CF}';

              let bgUrls: string[] = []; let bgWidths: string[] = []; let bgHeights: string[] = []; let bgPosXs: string[] = []; let bgPosYs: string[] = []; let bgFits: string[] = [];
              if (node.data('textAbove') && !isEmptyBranch) {
                  const lineColor = themeTextColor.replace('#', '%23');
                  const dynamicSvg = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="2"><rect x="0" y="0" width="100" height="2" fill="${lineColor}"/></svg>`);
                  
                  bgUrls.push(dynamicSvg); 
                  bgWidths.push(finalW + 'px'); 
                  bgHeights.push('2px'); 
                  bgFits.push('none'); 
                  bgPosXs.push('50%'); 
                  bgPosYs.push('50%');
              }

              node.data({
                  renderWidth: finalW, renderHeight: finalH,
                  imgOffsetX: imgOffsetX, imgOffsetY: imgOffsetY, textMarginX: txtOffsetX, textMarginY: txtOffsetY,
                  labelW: blockW, labelH: blockH, displayName: dynamicName, computedLabel: labelText, hasSheetContent: hasSheetContent,
                  fontWeight: node.data('isBold') ? 'bold' : 'normal', fontStyle: node.data('isItalic') ? 'italic' : 'normal',
                  cWidth: finalW, cHeight: finalH, cTextMarginX: txtOffsetX, cTextMarginY: txtOffsetY,
                  cTxtBgCol: 'transparent', cTxtBgOpac: 0, cShape: 'rectangle',
                  cBorderW: node.data('hasFrame') ? 2 : 0, cBorderCol: node.data('frameColor') || '#000000',
                  cBgCol: node.data('hasFrame') ? (node.data('frameColor') || '#000000') : '#ffffff',
                  cBgOpac: node.data('hasFrame') ? 0.05 : 0.001,
                  bgUrls: bgUrls.length > 0 ? bgUrls : null, 
                  bgWidthsStr: bgWidths.length > 0 ? bgWidths.join(', ') : '0px', 
                  bgHeightsStr: bgHeights.length > 0 ? bgHeights.join(', ') : '0px', 
                  bgPosXsStr: bgPosXs.length > 0 ? bgPosXs.join(', ') : '50%', 
                  bgPosYsStr: bgPosYs.length > 0 ? bgPosYs.join(', ') : '50%', 
                  bgFitsStr: bgFits.length > 0 ? bgFits.join(', ') : 'none'
              });
          });

          let currentY = 0; const xGap = 40; const yGap = state.layoutMode === 'comb' ? 16 : 60;   
          const calculatedPositions = new Map<string, {x: number, y: number}>();
          let maxLeafLeftX = 0; 
          const stepsToLeafMap = new Map<string, number>();
          const tightDistMap = new Map<string, number>();
          
          if (state.layoutMode === 'comb') {
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

              const computeMetrics = (nodeId: string): { steps: number, tight: number } => {
                  const node = nodesById.get(nodeId);
                  const childrenArray = (!node || (node.data('hasNewSheet') && nodeId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nodeId) || []);
                  
                  if (childrenArray.length === 0) {
                      stepsToLeafMap.set(nodeId, 0);
                      tightDistMap.set(nodeId, 0);
                      return { steps: 0, tight: 0 };
                  } else {
                      let maxSteps = 0;
                      let maxTight = 0;
                      const myWidth = node ? (node.data('renderWidth') || 1) : 1;
                      
                      childrenArray.forEach(child => {
                          const m = computeMetrics(child.id());
                          if (m.steps > maxSteps) maxSteps = m.steps;
                          const tight = myWidth + xGap + m.tight;
                          if (tight > maxTight) maxTight = tight;
                      });
                      stepsToLeafMap.set(nodeId, maxSteps + 1);
                      tightDistMap.set(nodeId, maxTight);
                      return { steps: maxSteps + 1, tight: maxTight };
                  }
              };
              if (nodesById.has(state.currentRootId)) computeMetrics(state.currentRootId);
          }

          const fastWalk = (nodeId: string, leftX: number): number => {
              const node = nodesById.get(nodeId);
              if (!node) return 0;
              const childrenArray = ((node.data('hasNewSheet') && nodeId !== state.currentRootId) || node.data('collapsed')) ? [] : (childrenMap.get(nodeId) || []);
              const myWidth = node.data('renderWidth') || 1; 
              const myHeight = node.data('renderHeight') || 24; 
              
              let actualLeftX = leftX; 
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
                          const childSteps = stepsToLeafMap.get(child.id()) || 0;
                          const childTight = tightDistMap.get(child.id()) || 0;
                          
                          const totalSpace = maxLeafLeftX - actualLeftX;
                          const spaceNeeded = (myWidth + xGap) + childTight;
                          const slack = Math.max(0, totalSpace - spaceNeeded);
                          
                          const slackPerGap = slack / (childSteps + 1);
                          nextLeftX = rightX + xGap + slackPerGap;
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
              n.removeStyle(); 
              if (visibleNodes.has(n.id())) {
                  n.style('display', 'element');
                  const pos = calculatedPositions.get(n.id());
                  if (pos) n.position(pos);
              } else n.style('display', 'none');
          });

          cy.edges().forEach(e => {
              if (e.id() === 'ghost-edge') return;
              e.removeStyle(); 
          });
      }

      cy.$('.strato-bg').remove();

      if (state.layoutMode === 'chrono' && state.currentRootId) {
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
                      const pName = CHRONO_PERIOD_KEYS[idx] ? t(CHRONO_PERIOD_KEYS[idx]) : "";
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
              if (tNode.style('display') !== 'none') {
                  data.hasVisible = true;
                  
                  const pos = tNode.position(); 
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
                // On exclut volontairement les éléments de décoration de l'axe pour cibler l'arbre
                const nodesToFit = cy.nodes(':visible').not('.box, #ghost-node, .export-chrono, .strato-bg');
                
                if (state.layoutMode === 'chrono') {
                    // Animation fluide et précise exclusive au chronogramme
                    cy.animate({
                        fit: {
                            eles: nodesToFit,
                            padding: 80
                        },
                        duration: 600,
                        easing: 'ease-out-cubic',
                        complete: () => {
                            // On relève légèrement la caméra à la fin pour aérer la frise du bas
                            cy.panBy({ x: 0, y: -70 });
                            cy.emit('zoom');
                            isFittingCamera = false;
                        }
                    });
                } else {
                    // Rendu instantané classique pour les autres modes
                    cy.fit(nodesToFit, 50);
                    setTimeout(() => { isFittingCamera = false; }, 100); 
                }
            }, 50); // Un seul délai centralisé de 50ms pour laisser le DOM respirer
            isFirstLoad = false; 
        }
    }

    console.log(cy.nodes().map(n => ({ id: n.data('name'), x: n.position('x'), w: n.width(), bbox: n.boundingBox() })))

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

        let trueRootId = parsed.state?.currentRootId || parsed.currentRootId || 'root';
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

  async function loadTreeFromBuffer(buffer: Uint8Array, fileName: string, filePath?: string) {
    state.currentFilePath = filePath;
    const ext = fileName.split('.').pop()?.toLowerCase();
    
    if (ext === 'xmind') {
      state.currentFilePath = undefined; 
      try {
        const unzipped = unzipSync(buffer);
        const contentJsonData = unzipped['content.json']; if (!contentJsonData) throw new Error(t('alert.json_not_found'));
        const contentStr = strFromU8(contentJsonData); const xmindData = JSON.parse(contentStr); const rootTopic = xmindData[0].rootTopic; const newElements: any[] = [];
        
        const parseNode = async (node: any, parentId: string | null, depth: number) => {
            const id = node.id; let rawTitle = node.title || ""; if (node.attributedTitle) rawTitle = node.attributedTitle.map((part: any) => part.text).join('');
            let extinct = false; if (rawTitle.startsWith('\u2020 ')) { extinct = true; rawTitle = rawTitle.substring(2); } else if (rawTitle.startsWith('\u2020')) { extinct = true; rawTitle = rawTitle.substring(1); }
            const styleProps = node.style?.properties || {}; const isBold = styleProps["fo:font-weight"] === "700" || styleProps["fo:font-weight"] === "bold"; const isItalic = styleProps["fo:font-style"] === "italic"; let notes = "";
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
          let actualBuf = buffer;
          if (!(actualBuf instanceof Uint8Array)) {
              actualBuf = new Uint8Array((buffer as any).type === 'Buffer' ? (buffer as any).data : buffer);
          }
          
          let parsed;
          try {
              const unzipped = unzipSync(actualBuf);
              const fileKey = Object.keys(unzipped).find(k => k.endsWith('.json'));
              if (fileKey) parsed = JSON.parse(strFromU8(unzipped[fileKey]));
              else throw new Error();
          } catch (eZip) {
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(actualBuf).replace(/^\uFEFF/, '');
              parsed = JSON.parse(text); 
          }

          const baseName = fileName.replace('.phylo', '').replace('.json', '');
          saveToRecentFiles(baseName, parsed, state.currentFilePath); 

          cy.startBatch();
          cy.elements().remove(); 
          
          let elementsToAdd = parsed.graph.elements;
          if (elementsToAdd && !Array.isArray(elementsToAdd)) {
              elementsToAdd = [...(elementsToAdd.nodes || []), ...(elementsToAdd.edges || [])];
          }
          cy.add(elementsToAdd); 
          
          state.currentRootId = parsed.state?.currentRootId || parsed.currentRootId || 'root';
          refreshLayout(true); 
          cy.endBatch();
          
          setTimeout(() => { state.hasUnsavedChanges = false; setUnsavedState(false); stateManager.resetStacks(); stateManager.resetStacks(); }, 100); 
      } catch (err) { alert(t('alert.corrupt_file') + " : " + err); } 
    }
  }

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
  if (pendingOSFile) {
      (window as any)._loadOSFile(pendingOSFile);
      pendingOSFile = null;
  }

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

  loadSettings();
  document.fonts.ready.then(() => refreshLayout(true));

  ui.btnRecenter.onclick = () => { cy.fit(cy.nodes(':visible').not('.box, #ghost-node, .strato-bg, .export-chrono'), 50); };
  ui.btnCenterRoot.onclick = () => {
      const rootNode = cy.$id(state.currentRootId);
      if (rootNode && rootNode.length > 0) {
          cy.animate({ center: { eles: rootNode }, zoom: 1.5 }, { duration: 300 });
      }
  };

  const updateChronoToolsUI = () => {
      if (ui.chronoTools) ui.chronoTools.style.display = state.layoutMode === 'chrono' ? 'flex' : 'none';
      if (ui.chronoAxisSelect) ui.chronoAxisSelect.value = chronoAxisMode;
      if (ui.btnChronoLanes) {
          const on = chronoLanesEnabled;
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
          updateChronoToolsUI(); 
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

  ui.btnExpandAll.onclick = () => { saveState(); cy.nodes().data('collapsed', false); refreshLayout(); };

  if (ui.btnToggleAbbrev) {
      ui.btnToggleAbbrev.innerText = state.appSettings.speciesFormat === 'full' ? t('topbar.btn.format.full') : t('topbar.btn.format.compact');
      
      ui.btnToggleAbbrev.onclick = () => {
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

  let isCameraLocked = false;
  let cameraLockTimer: any = null;

  function focusCameraOnNode(node: any) {
      cy.stop(true, true);
      isCameraLocked = true; 
      if (cameraLockTimer) clearTimeout(cameraLockTimer);

      cy.animate({ center: { eles: node }, zoom: 1.5 }, { 
          duration: 300,
          complete: () => {
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
              fullName = LayoutEngine.formatSpeciesName(node.data('name'), false).toLowerCase();
              abbrevName = LayoutEngine.formatSpeciesName(node.data('name'), true).toLowerCase();
          }
      }
      return [rawName, fullName, abbrevName];
  }

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
              const displayItemName = LayoutEngine.getDynamicNodeName(node, state);
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
              const displayItemName = LayoutEngine.getDynamicNodeName(node, state);
              item.innerText = (node.data('extinct') && !displayItemName.startsWith('\u2020') ? '\u2020 ' : '') + displayItemName;
              item.onmouseover = () => item.style.background = 'var(--bg-hover)';
              item.onmouseout = () => item.style.background = 'transparent';
              item.onclick = () => {
                  ui.synonymDropdown.style.display = 'none';
                  ui.inpSynonymTarget.value = node.data('name');
                  if (state.activeNode) {
                      saveState();
                      state.activeNode.data('synonymTargetId', node.id());
                      const targetName = LayoutEngine.getDynamicNodeName(node, state, 'full');
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
                  const targetName = LayoutEngine.getDynamicNodeName(node, state, 'full');
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
      const supportsAlpha = (format === 'png' || format === 'svg');
      const wantTransparent = supportsAlpha && ui.exportTransparent?.checked !== false;
      const exportBg = wantTransparent ? 'transparent' : '#ffffff'; 
      const fileName = `phylogenie_export.${format}`;
      
      let tempChronoElements: any = cy.collection();
      let chronoLanesNeutralized = false;

      const finishChronoExport = () => {
          if (state.layoutMode !== 'chrono') return;
          cy.remove(tempChronoElements);
          if (chronoLanesNeutralized) {
              chronoLanesNeutralized = false;
              refreshLayout(); 
          }
      };

      if (state.layoutMode === 'chrono') {
          const parseMa = (val: any) => parseFloat(String(val).replace(',', '.'));

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
        if (tNode.length > 0) synNameStr = '= ' + LayoutEngine.getDynamicNodeName(tNode, state, 'full');
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

  cy.on('tap', (e: any) => { 
      ui.contextMenu.style.display = 'none'; 
      if (e.target === cy) {
          const clickPos = e.position; 
          const threshold = 30 / cy.zoom(); 
          let closestNode: any = null; let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              if (!node.hasClass('box')) {
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

  cy.on('dbltap', 'node', (e: any) => { 
      if (!e.target.hasClass('box')) openInlineEditor(e.target); 
  });

  cy.on('dbltap', (e: any) => {
      if (e.target === cy) {
          const clickPos = e.position; 
          const threshold = 30 / cy.zoom(); 
          let closestNode: any = null; let minDistance = threshold;

          cy.nodes().forEach((node: any) => {
              if (!node.hasClass('box')) {
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

  const btnToggleRibbon = document.getElementById('btn-toggle-ribbon');
  const btnCloseRibbon = document.getElementById('btn-close-ribbon');

  if (btnToggleRibbon && btnCloseRibbon) {
      btnToggleRibbon.onclick = () => {
          const isHidden = ui.styleMenu.style.display === 'none';
          ui.styleMenu.style.display = isHidden ? 'flex' : 'none';
          btnToggleRibbon.style.background = isHidden ? 'rgba(33, 150, 243, 0.2)' : 'rgba(33, 150, 243, 0.1)';
          
          if (isHidden) {
              const selected = cy.$('node:selected');
              if (selected.length === 1) {
                  updateRibbonForNode(selected[0]);
              }
          }
          
          setTimeout(() => cy.fit(cy.nodes(':visible').not('.box, #ghost-node, .strato-bg, .export-chrono'), 50), 50); 
      };
      
      btnCloseRibbon.onclick = () => {
          ui.styleMenu.style.display = 'none';
          btnToggleRibbon.style.background = 'rgba(33, 150, 243, 0.1)';
          setTimeout(() => cy.fit(cy.nodes(':visible').not('.box, #ghost-node, .strato-bg, .export-chrono'), 50), 50);
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
  
  ui.btnOpenLinkedFile.onclick = async () => {
      if (!state.activeNode || state.activeNode.hasClass('box')) return;
      
      const linkedPath = state.activeNode.data('linkedFilePath');
      const linkedName = state.activeNode.data('linkedFileName');
      if (!linkedName) return;

      if (state.hasUnsavedChanges) {
          if (confirm(t('confirm.save_before_switch'))) {
              await executeSave(false);
          }
      }

      const getDirectory = (filePath: string) => {
          if (!filePath) return '';
          const sep = filePath.includes('\\') ? '\\' : '/';
          const parts = filePath.split(sep);
          parts.pop();
          return parts.join(sep) + sep;
      };

      let loaded = false;

      if (linkedPath) {
          const res1 = await window.electronAPI.readFileDirect(linkedPath);
          if (res1.success && res1.data) {
              await loadTreeFromBuffer(res1.data as Uint8Array, res1.fileName!, res1.filePath);
              loaded = true;
          }
      }

      if (!loaded && state.currentFilePath) {
          const dir = getDirectory(state.currentFilePath);
          const fallbackPath = dir + linkedName;
          const res2 = await window.electronAPI.readFileDirect(fallbackPath);
          if (res2.success && res2.data) {
              state.activeNode.data('linkedFilePath', res2.filePath); 
              await loadTreeFromBuffer(res2.data as Uint8Array, res2.fileName!, res2.filePath);
              loaded = true;
          }
      }

      if (!loaded) {
          alert(t('alert.link_broken1') + linkedName + t('alert.link_broken2'));
          const res3 = await window.electronAPI.openFile();
          if (res3.success && res3.data && res3.fileName) {
              state.activeNode.data('linkedFilePath', res3.filePath);
              state.activeNode.data('linkedFileName', res3.fileName);
              await loadTreeFromBuffer(res3.data as Uint8Array, res3.fileName, res3.filePath);
          }
      }
      
      if (ui.welcomeOverlay) ui.welcomeOverlay.style.display = 'none';
      closeSidePanel();
  };

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
          btn.focus(); 
      }
  };

  inputKeys.forEach((key, index) => { 
      const inputEl = (ui.formInputs as any)[key] as HTMLElement;
      
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

      inputEl.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
              e.stopPropagation(); 
              if (inputEl.tagName === 'INPUT' || inputEl.tagName === 'SELECT') {
                  e.preventDefault(); 
                  inputEl.blur(); 
                  
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
      
      const isMouseWheel = e.deltaMode !== 0 || (Math.abs(e.deltaY) >= 50 && e.deltaX === 0);
      
      if (e.ctrlKey || e.metaKey || isMouseWheel) {
          const direction = e.deltaY > 0 ? -1 : 1; 
          const baseSpeed = Math.abs(e.deltaY) >= 50 ? 0.04 : 0.02;
          const zoomSpeed = baseSpeed * state.appSettings.zoomSensitivity; 
          
          let currentZoom = cy.zoom(); 
          let newZoom = currentZoom * (1 + direction * zoomSpeed); 
          
          newZoom = Math.max(0.1, Math.min(newZoom, 4)); 
          
          cy.zoom({ level: newZoom, renderedPosition: { x: e.offsetX, y: e.offsetY } }); 
      } 
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

        propagateBoxMembership(currentDragTarget, target.union(target.successors('node:not(.box)')).toArray());
    }

    currentDragTarget = null;
    currentParentId = null;
    refreshLayout(); 
  });

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
      if (originalEvent.button === 0) { 
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
        executeSave(false);
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
              navigator.clipboard.writeText(''); 
          } 
          return; 
      }
      if (e.key.toLowerCase() === 'v') { 
          if (selected.length > 0 && !selected[0].hasClass('box')) { 
              e.preventDefault(); 
              navigator.clipboard.readText().then(text => {
                  if (text && text.trim() !== '') {
                      saveState(); 
                      const node = selected[0]; 
                      const parentId = node.id(); 
                      const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
                      const nodeData = { ...EMPTY_DATA, id: newId, name: text.trim(), parent: node.data('parent') || null, extinct: false, isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: Date.now() };
                      const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]);  
                      
                      const newNode = added.filter('node');
                      propagateBoxMembership(node, newNode.toArray());
                      checkAutoRank(newNode[0]); 

                      cy.nodes().unselect(); newNode.select();
                      if (node.data('hasNewSheet')) { state.currentRootId = node.id(); refreshLayout(true); } else if (node.data('collapsed')) { toggleCollapse(node); } else { refreshLayout(); } 
                      cy.animate({ center: { eles: newNode } }, { duration: 250 });
                  } 
                  else if (state.clipboard) {
                      pasteClade(selected[0]);
                  }
              }).catch(() => {
                  if (state.clipboard) pasteClade(selected[0]);
              });
          } 
          return; 
      }
      if (e.key === ' ') { if (selected.length > 0 && !selected[0].hasClass('box') && selected[0].outgoers('node').length > 0) { e.preventDefault(); toggleCollapse(selected[0]); } return; }
      
      if (e.key === 'Enter') { 
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

    // Raccourci Alt + S : Assigne ou désassigne Espèce au noeud et Genre au premier ancêtre nommé
    if (e.altKey && e.key.toLowerCase() === 's') {
      if (selected.length === 1 && !selected[0].hasClass('box')) {
        e.preventDefault();
        saveState();
        
        const node = selected[0] as any;
        
        // 1. Trouver l'ancêtre le plus proche
        let curr = node.incomers('node').first();
        let parentGenusNode = null;

        while (curr && curr.length > 0 && !curr.hasClass('box')) {
            const pName = curr.data('name');
            if (pName && pName.trim() !== '' && pName !== t('default.unnamed_branch')) {
                parentGenusNode = curr;
                break;
            }
            curr = curr.incomers('node').first();
        }

        // 2. Action réversible
        if (node.data('rank') === 'Espèce') {
            // ANNULATION : On retire le rang et l'italique
            node.data('rank', 'Clade (non-classé)');
            node.data('isItalic', false);

            if (parentGenusNode && parentGenusNode.data('rank') === 'Genre') {
                parentGenusNode.data('rank', 'Clade (non-classé)');
                parentGenusNode.data('isItalic', false);
            }
        } else {
            // APPLICATION : On assigne les rangs et l'italique
            node.data('rank', 'Espèce');
            node.data('isItalic', true);

            if (parentGenusNode) {
                parentGenusNode.data('rank', 'Genre');
                parentGenusNode.data('isItalic', true);
            }
        }

        refreshLayout();
        setUnsavedState(true);
      }
      return;
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

    if (e.key === 'Enter') { 
      if (selected.length === 1 && !selected[0].hasClass('box')) { 
        e.preventDefault(); const node = selected[0]; if (node.id() === state.currentRootId) return; const incomingEdges = node.incomers('edge'); 
        if (incomingEdges.length > 0) { 
          saveState(); const parentId = incomingEdges[0].data('source'); 
          const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
          const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: node.data('extinct'), isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: (node.data('sortIndex') || 0) + 0.1 };
          const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]); 
          
          const newNode = added.filter('node');
          propagateBoxMembership(node, newNode.toArray());

          cy.nodes().unselect(); newNode.select(); refreshLayout(); 
          cy.animate({ center: { eles: newNode } }, { duration: 250 });
          openInlineEditor(newNode, true);
        } 
      }
    }

    if (e.key === 'Tab') { 
      if (selected.length === 1 && !selected[0].hasClass('box')) { 
        e.preventDefault(); saveState(); const node = selected[0]; const parentId = node.id(); const newId = "taxon-" + Date.now() + Math.random().toString(36).substr(2, 5); 
        const nodeData = { ...EMPTY_DATA, id: newId, name: '', parent: node.data('parent') || null, extinct: node.data('extinct'), isBold: false, isItalic: node.data('isItalic'), fontFamily: node.data('fontFamily') || 'serif', fontSize: node.data('fontSize') || 16, sortIndex: Date.now() };
        const added = cy.add([{ group: 'nodes', classes: 'taxon', data: nodeData }, { group: 'edges', data: { source: parentId, target: newId } }]);  
        
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

  const lastScrollWrite = { vw: -1, vh: -1, sl: -1, st: -1 };
  const lastScrollInput = { zoom: -1, px: NaN, py: NaN, bbv: -1, vpW: -1, vpH: -1 };

  const syncScrollbars = () => {
      if (isScrolling) return;

      const zoom = cy.zoom();
      const pan = cy.pan();
      const vpW = cy.width();
      const vpH = cy.height();

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

      const cached = getGraphBB();
      const bb = { x1: cached.x1, x2: cached.x2, y1: cached.y1, y2: cached.y2, w: cached.w, h: cached.h };

      if (state.layoutMode === 'chrono') {
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

  cy.on('render pan zoom viewport resize', () => {
      if (state.layoutMode === 'chrono' && chronoRulerUpdater) startChronoRaf();
  });

  cy.on('add remove position data style', () => { invalidateGraphBB(); });
  cy.on('add remove data', 'node', invalidateSearchIndex);

  cy.on('pan', () => {
      // Bloqueur de caméra désactivé. Le panoramique est totalement libre.
      return;
  });

  hScroll.addEventListener('scroll', () => {
      if (isScrolling || isCameraLocked) return;
      isScrolling = true;
      const bb = cy.elements().boundingBox();
      if (state.layoutMode === 'chrono') {
          bb.x1 = getChronoWorldBounds().x1; 
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
          layer.style.cssText = "position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:4; overflow:hidden; will-change: transform;";
          app.appendChild(layer);
      }

      const zoom = cy.zoom();
      const pan = cy.pan();
      const currentVisible = new Set<string>();

      const renderQueue: any[] = [];
      
      cy.nodes(':visible').forEach((n: any) => {
          if (n.hasClass('box')) return;
          
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

      renderQueue.forEach(job => {
          let img = htmlImageCache.get(job.id);
          if (!img) {
              img = document.createElement('img');
              img.style.position = 'absolute';
              img.style.top = '0px';
              img.style.left = '0px';
              img.style.transformOrigin = 'top left';
              img.style.objectFit = 'contain';
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
          
          img.style.transform = `translate3d(${job.left}px, ${job.top}px, 0)`;
      });

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