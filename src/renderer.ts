declare global {
  interface Window {
    electronAPI: {
      saveFile: (data: string, filePath?: string, defaultName?: string) => Promise<{ success: boolean, canceled?: boolean, filePath?: string, error?: string }>;
      openFile: () => Promise<{ success: boolean, canceled?: boolean, filePath?: string, fileName?: string, data?: Uint8Array, error?: string }>;
      onOpenFileFromOS: (callback: (filePath: string) => void) => void;
      readFileDirect: (filePath: string) => Promise<{ success: boolean, filePath?: string, fileName?: string, data?: Uint8Array, error?: string }>;
      saveExport: (data: string, defaultName: string, ext: string) => Promise<{ success: boolean, canceled?: boolean, filePath?: string, error?: string }>;
      openNewInstance: () => void;
      pickAudio: () => Promise<{ success: boolean, canceled?: boolean, filePath?: string, fileName?: string }>;
      writeTreeClipboard: (newick: string, json: string) => Promise<{ success: boolean }>;
      readTreeClipboard: () => Promise<{ json: string | null, text: string }>;
      appVersion: string;
      checkForUpdate: () => Promise<{ success: boolean, version?: string, url?: string, name?: string, publishedAt?: string, status?: number, error?: string }>;
      openExternal: (url: string) => Promise<{ success: boolean, error?: string }>;
    }
  }
}
// En PREMIER : l'écran de chargement s'affiche pendant que le reste du code se charge (phase 4).
import { bootDone } from './loading';
import cytoscape from 'cytoscape';
import svg from 'cytoscape-svg';
import { saveExcelFile } from './export';
import { GEO_DETAILS, CHRONO_PERIOD_KEYS, stagesOf, adjustColorLightness } from './chrono-data';
import { state, stateManager } from './graph-state';
import { LayoutEngine, MIN_BRANCH_OFFSET, CHRONO_STYLE_SCRATCH, TAXI_TURN, normalizeAbbrev } from './layout-engine';
import { chronoAgeToX as axisAgeToX, ChronoAxisMode, ChronoBoundsMode, hasScaleBreak, SCALE_BREAK_AGE, PRECAMBRIAN_COMPRESSION } from './chrono-axis';
import { getImagePlacements } from './export-images';
import { toAssetRef } from './asset-store';
import { isTreeRoot, findTreeRootId } from './tree-utils';

// Modules extraits de renderer.ts (phase 0.2) ; ils reçoivent le contexte partagé `ctx` (app-context.ts).
import type { AppContext } from './app-context';
import { initClipboard } from './clipboard';
import { initFileIO } from './file-io';
import { initInteractions } from './interactions';
import { initKeyboard } from './keyboard';
import { initGraphExport } from './graph-export';
import { initSidePanel } from './side-panel';
import { initRibbon } from './ribbon';
import { initAnnotations, reapplyAnnotationStyles, refreshBranchPaint } from './annotations';
import { initDivergenceDrag } from './divergence-drag';
import { initFicheNav } from './fiche-nav';
import { initFicheMedia } from './fiche-media';
import { initSheetClassifications } from './classifications-ui';
import { initRomerUI, planRomer, drawRomer, romerReserve, sameReserve, removeRomer, romerSettings, RomerReserve } from './romer';
import { initHub } from './hub';
import { enlargeEmptyNodeHitbox } from './hitbox';
import { initGeoChart } from './geo-chart';
import { refreshBrandMedia } from './brand';

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
import { t, setLang, currentLang, Lang, colonSep } from './i18n';

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
  let isFittingCamera = false; 
  let isEditing = false;
  let editedNode: any = null; 
  let closeCurrentEditor: (() => void) | null = null;

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
        const selected = cy.nodes(':selected').not('.box');
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
          const imgRef = toAssetRef(base64Image); // une seule copie, même pour plusieurs nœuds sélectionnés
          // (Images acceptées sur tous les taxons, y compris les divergences d'un chronogramme : layout-engine.ts.)
          applyStyleToSelection(n => {
              n.data('imgRatio', ratio);
              n.data('imgUrl', imgRef);
              n.data('imgName', fileName); 
          });
          if (labelSpan) {
              labelSpan.innerText = `▣ ${fileName}`;
              labelSpan.title = fileName;
          }
          inpImgFile.style.color = 'transparent';
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
      // Hub d'accueil : textes mis à jour par updateAllUITexts (ui.ts), identifiants précis.

      const btnShortcuts = document.getElementById('btn-shortcuts');
      if (btnShortcuts) btnShortcuts.innerHTML = t('btn.shortcuts');

      const labels = ui.sidePanel.querySelectorAll('label');
      if (labels.length >= 10) {
          labels[0].innerHTML = t('label.status') + colonSep();
          labels[1].innerHTML = t('label.rank') + colonSep();
          labels[2].innerHTML = t('label.date') + colonSep();
          labels[3].innerHTML = t('label.author') + colonSep();
          labels[4].innerHTML = t('label.dist') + colonSep();
          labels[5].innerHTML = t('label.size') + colonSep();
          labels[6].innerHTML = t('label.mass') + colonSep();
          labels[7].innerHTML = t('label.period') + colonSep();
          labels[8].innerHTML = t('label.synapo') + colonSep();
          labels[9].innerHTML = t('label.notes') + colonSep();
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
          ${t('update.current')}${colonSep()} <b>${APP_VERSION || '?'}</b><br>
          ${t('update.latest')}${colonSep()} <b style="color:#4CAF50;">${latest}</b>
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
              theme: 'museum',
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
                   <li>${t('sc.nav.comb')}</li>
                   <li>${t('sc.nav.fiche')}</li>
                   <li>${t('sc.nav.alt')}</li>
                   <li>${t('sc.nav.drag')}</li>
                   <li>${t('sc.nav.zoom')}</li>
                   <li>${t('sc.nav.search')}</li>
                   <li>${t('sc.nav.full')}</li>
                   <li>${t('sc.nav.tabs')}</li>
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
                   <li>${t('sc.edit.grab')}</li>
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
              'curve-style': 'taxi', 'taxi-direction': 'rightward', 'taxi-turn': TAXI_TURN + 'px', 'target-arrow-shape': 'none',
              'source-endpoint': 'outside-to-node', 'target-endpoint': 'outside-to-node'
          }
      },
      {
          selector: 'node[imgUrl != ""]', 
          style: { 'text-valign': 'center', 'text-halign': 'center', 'background-fit': 'none', 'padding': '5px' }
      }
    ]
  });

  enlargeEmptyNodeHitbox(cy); // divergences sans nom : zone de clic élargie, dessin inchangé

  // <app-context> généré par tests/tools/gen-context.js — accesseurs résolus à l'appel
  const ctx: AppContext = {
    get cy() { return cy; },
    get ui() { return ui; },
    get checkAutoRank() { return checkAutoRank; },
    get chronoAgeToX() { return chronoAgeToX; },
    get chronoAxisMode() { return chronoAxisMode; }, set chronoAxisMode(v) { chronoAxisMode = v; },
    get closeCurrentEditor() { return closeCurrentEditor; }, set closeCurrentEditor(v) { closeCurrentEditor = v; },
    get closeSidePanel() { return closeSidePanel; },
    get container() { return container; },
    get copyClade() { return copyClade; },
    get createNewTree() { return createNewTree; },
    get cutClade() { return cutClade; },
    get executeSave() { return executeSave; },
    get focusCameraOnNode() { return focusCameraOnNode; },
    get getChronoWorldBounds() { return getChronoWorldBounds; },
    get getGraphBB() { return getGraphBB; },
    get getNodeSearchStrings() { return getNodeSearchStrings; },
    get getSheetRootForNode() { return getSheetRootForNode; },
    get globalTimeMax() { return globalTimeMax; }, set globalTimeMax(v) { globalTimeMax = v; },
    get globalTimeMin() { return globalTimeMin; }, set globalTimeMin(v) { globalTimeMin = v; },
    get graftDocument() { return graftDocument; },
    get graphBBVersion() { return graphBBVersion; }, set graphBBVersion(v) { graphBBVersion = v; },
    get handleFicheArrow() { return handleFicheArrow; },
    get handleGrabKey() { return handleGrabKey; },
    get interceptNestedSheetDeletion() { return interceptNestedSheetDeletion; },
    get isCameraLocked() { return isCameraLocked; }, set isCameraLocked(v) { isCameraLocked = v; },
    get isEditing() { return isEditing; }, set isEditing(v) { isEditing = v; },
    get loadRecentFilesUI() { return loadRecentFilesUI; },
    get openInlineEditor() { return openInlineEditor; },
    get openSidePanelForNode() { return openSidePanelForNode; },
    get pasteClade() { return pasteClade; },
    get pasteFromSystem() { return pasteFromSystem; },
    get propagateBoxMembership() { return propagateBoxMembership; },
    get redo() { return redo; },
    get refreshLayout() { return refreshLayout; },
    get renderFicheMedia() { return renderFicheMedia; },
    get renderSheetClassification() { return renderSheetClassification; },
    get saveState() { return saveState; },
    get serializeClade() { return serializeClade; },
    get setUnsavedState() { return setUnsavedState; },
    get showCustomAlert() { return showCustomAlert; },
    get toggleCollapse() { return toggleCollapse; },
    get undo() { return undo; },
    get updateCounters() { return updateCounters; },
    get updateFicheNav() { return updateFicheNav; },
    get updateRibbonForNode() { return updateRibbonForNode; },
  };
  // </app-context>
  const { propagateBoxMembership, cutClade, copyClade, pasteClade, serializeClade, pasteFromSystem } = initClipboard(ctx);
  const { loadRecentFilesUI, executeSave, createNewTree, graftDocument } = initFileIO(ctx);
  loadRecentFilesUI(); // (avant : appelée plus haut, quand c'était une fonction « hissée »)
  initInteractions(ctx);
  initKeyboard(ctx);
  initGraphExport(ctx);
  const { closeSidePanel, openSidePanelForNode, refreshFicheTitle } = initSidePanel(ctx);
  initRibbon(ctx); // onglets Style / Affichage / Arbre / Aide (phase 2)
  initAnnotations(ctx); // surlignage (Ctrl+H) et pinceau des branches (phase 3)
  const { handleGrabKey } = initDivergenceDrag(ctx); // mode « glisser les divergences » (onglet Arbre, phase 3) et raccourci G
  const { handleFicheArrow, updateFicheNav } = initFicheNav(ctx); // fiche : taxon terminal précédent / suivant (← / →)
  const { renderFicheMedia } = initFicheMedia(ctx); // fiche : images multiples et son (phase 3)
  const { renderSheetClassification, interceptNestedSheetDeletion } = initSheetClassifications(ctx); // classifications alternatives par feuille (phase 3)
  initRomerUI(ctx); // romérogramme : groupe dédié de l'onglet Arbre, en mode chronogramme (phase 3)
  initHub(ctx); // hub d'accueil : modèles, récents, langue au premier lancement (phase 4)
  initGeoChart(ctx); // figure d'aide : frise des temps géologiques détaillée, clous d'or (phase 4)

  function checkAutoRank(node: any) {
    if (!state.appSettings.smartTaxonomy) return;

    let name = node.data('name') || '';
    const lines = name.split('\n');
    let firstLine = lines[0];
    const otherLines = lines.slice(1).join('\n');

    let prefixMatch = firstLine.match(/^[†+”"«“'’\s]+/);
    let prefix = prefixMatch ? prefixMatch[0] : '';
    let cleanName = normalizeAbbrev(firstLine.substring(prefix.length).replace(/[”"»”'’\s]+$/, '').trim()); // « H.sapiens » = « H. sapiens »
    
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

  function calculateTaxaCounts(nodes: any) {
    const uniqueGenera = new Set<string>();
    const uniqueSpecies = new Set<string>();
    const unnamedBranch = t('default.unnamed_branch').toLowerCase();
    // Genre (nœud de rang Genre) le plus proche au-dessus de chaque nœud, mémorisé : chaque remontée de
    // l'arbre profite aux suivantes (avant : une remontée complète par espèce).
    const genusAbove = new Map<string, any>();
    const findGenusAbove = (node: any): any => {
        const id = node.id();
        if (genusAbove.has(id)) return genusAbove.get(id);
        const parent = node.incomers('node').first();
        const found = (!parent || parent.length === 0 || parent.hasClass('box')) ? null : (parent.data('rank') === 'Genre' ? parent : findGenusAbove(parent));
        genusAbove.set(id, found);
        return found;
    };

    nodes.forEach((n: any) => {
        if (!state.appSettings.countInvalid) {
            const status = n.data('status');
            if (status && status !== 'Valide' && status.trim() !== '') return;
        }

        let rawName = n.data('name');
        if (!rawName || rawName.trim() === '') return;

        let cleanName = rawName.split('\n')[0].replace(/^[†+”"«“'’\s]+/, '').replace(/[”"»”'’\s]+$/, '').trim().toLowerCase();
        if (cleanName === '' || cleanName === unnamedBranch) return;

        const explicitRank = n.data('rank');
        const words = cleanName.split(/[ \t]+/);
        
        const isSpeciesRank = explicitRank === 'Espèce' || explicitRank === 'Sous-espèce' || (state.appSettings.smartTaxonomy && (!explicitRank || explicitRank === 'Clade (non-classé)') && words.length >= 2);

        if (isSpeciesRank) {
            let trueGenus = '';
            const parentGenusNode = n.incomers ? findGenusAbove(n) : null;

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
    const allNodes = cy.nodes().filter((n: any) => !n.hasClass('box') && !n.hasClass('romer-spindle'));
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
      const themesList = ['museum', 'light', 'dark', 'sepia', 'ingen', 'console', 'high-contrast', 'dimmed']; 
      if (!themesList.includes(themeName)) themeName = 'light'; 
      document.body.setAttribute('data-theme', themeName); 
      refreshBrandMedia(themeName); // logo aux traits clairs sur les thèmes sombres

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
          reapplyAnnotationStyles(cy); // après les règles de couleur du thème, sinon elles masquent surlignage et pinceau
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

  const CHRONO_EDGE_PAD = 40; 

  let chronoAxisMode: ChronoAxisMode = 'linear';
  let chronoAxisLo = 0;    
  let chronoAxisHi = 100;  
  let chronoRankAges: number[] = []; 

  let chronoBoundsMode: ChronoBoundsMode = 'period';
  // (Ancien bouton « Barres : fidèle / lisible » retiré : la géométrie de layout-engine.ts place chaque tronc
  // juste avant son premier enfant, ce qui écarte déjà les troncs d'au moins 24 px.)

  // Conversion âge → abscisse : source unique dans chrono-axis.ts (échelle par morceaux, Précambrien comprimé).
  const chronoAgeToX = (age: number): number =>
      axisAgeToX(chronoAxisMode, chronoAxisLo, chronoAxisHi, chronoRankAges, age);

  let chronoContentRight = 0;
  let chronoContentLeft = 0;

  // CHRONO_RULER_BOTTOM se mesure depuis le bas de #app (35 px au-dessus du bas de la fenêtre). La barre de
  // défilement horizontale occupe les 45 à 60 px du bas de la fenêtre : la frise se pose juste dessus.
  // (En 1.3, la hauteur 100vh d'index.html faisait déborder #app de 40 px sous la fenêtre, d'où l'ancienne
  // valeur 100 ; APP_CSS impose désormais height:auto et le bas de #app est réellement à 35 px.)
  const CHRONO_RULER_BOTTOM = 25;
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
  }

  /**
   * Écrit seulement les données qui changent. Réécrire une valeur identique suffit à faire recalculer le style
   * (et redessiner) le nœud : sur un grand arbre, chaque mise en page recalculait ainsi tous les nœuds.
   */
  const setDataIfChanged = (node: any, values: Record<string, any>) => {
      const changed: Record<string, any> = {};
      let any = false;
      for (const k in values) {
          const v = values[k], cur = node.data(k);
          const same = v !== null && typeof v === 'object' ? JSON.stringify(v) === JSON.stringify(cur) : v === cur;
          if (!same) { changed[k] = v; any = true; }
      }
      if (any) node.data(changed);
  };
  /** Styles posés par le chronogramme à effacer au prochain passage en standard / peigne (voir refreshLayout). */
  let stylesFromChrono = true;
  /** Visibilité posée sur chaque nœud par la dernière mise en page standard / peigne. */
  const displayState = new Map<string, string>();
  cy.on('add', 'node', (e: any) => { displayState.delete(e.target.id()); }); // nouvel élément (collage, annulation…) : sans style posé
  let lastRomerReserve: RomerReserve | null = null; // lignes réservées aux fuseaux par la dernière mise en page
  function refreshLayout(fitCamera = false) {
      const themeBgColor = getComputedStyle(document.body).getPropertyValue('--bg-panel').trim() || '#ffffff';
      const themeTextColor = getComputedStyle(document.body).getPropertyValue('--text-main').trim() || '#000000';
      
      cy.startBatch();
      // try/finally : une exception pendant la mise en page ne doit JAMAIS laisser Cytoscape en mode « lot »
      // (plus aucun rendu, puis blocage progressif de l'application).
      try {
      removeRomer(cy); // fuseaux du romérogramme : recalculés après la mise en page
      updateBreadcrumbs(); 
      updateSheetsBar(); 
      updateCounters();
      analyzeTimeBounds();

      if (state.layoutMode === 'chrono' && state.currentRootId) {
          stylesFromChrono = true; // le chronogramme pose ses propres styles sur les éléments
          // --- MOTEUR GÉOMÉTRIQUE EXTERNALISÉ ---
          // Romérogramme : la mise en page réserve la hauteur de chaque fuseau (réservation du passage précédent).
          if (!romerSettings.enabled) lastRomerReserve = null;
          const limits = LayoutEngine.applyLayout(cy, state, themeTextColor, textWidthCache, chronoAxisMode, chronoBoundsMode, lastRomerReserve);

          globalTimeMax = limits.globalTimeMax;
          globalTimeMin = limits.globalTimeMin;
          chronoAxisLo = globalTimeMin;
          chronoAxisHi = globalTimeMax;
          if (romerSettings.enabled) {
              // Le romérogramme est un habillage : une erreur ne doit pas empêcher d'afficher le chronogramme.
              try {
                  let plans = planRomer(cy, state.currentRootId, chronoAgeToX);
                  const reserve = romerReserve(plans);
                  if (!sameReserve(lastRomerReserve, reserve)) {
                      // Fuseaux ou hauteurs changés : mise en page refaite avec la bonne réservation (abscisses inchangées).
                      lastRomerReserve = reserve;
                      LayoutEngine.applyLayout(cy, state, themeTextColor, textWidthCache, chronoAxisMode, chronoBoundsMode, reserve);
                      plans = planRomer(cy, state.currentRootId, chronoAgeToX);
                  }
                  drawRomer(cy, plans);
              } catch (err) { console.error('Romérogramme :', err); removeRomer(cy); lastRomerReserve = null; }
          }
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
              if (node.data('isEmpty') !== isEmptyBranch) node.data('isEmpty', isEmptyBranch);

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

              setDataIfChanged(node, {
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
                      // Décalage manuel de la divergence le long de sa branche (mode « glisser les divergences »).
                      const manualOffset = state.layoutMode === 'standard' ? Math.max(MIN_BRANCH_OFFSET, child.data('branchOffset') || 0) : 0;
                      let nextLeftX = rightX + xGap + manualOffset;

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

          // Effacement complet des styles posés : seulement au premier passage après le chronogramme (qui pose
          // tailles, marges et formes sur chaque nœud et arête). Sinon, on ne touche qu'à la visibilité des nœuds
          // qui changent : effacer et reposer les styles de tous les éléments forçait Cytoscape à tout recalculer
          // (phase 5 : ~20 % du temps d'une action sur un arbre de 2 400 nœuds).
          const fullReset = stylesFromChrono;
          stylesFromChrono = false;
          if (fullReset) displayState.clear();
          cy.nodes().forEach(n => {
              if (n.hasClass('box')) return;
              const id = n.id();
              const visible = visibleNodes.has(id);
              if (fullReset) { n.removeStyle(); n.removeScratch(CHRONO_STYLE_SCRATCH); }
              const want = visible ? 'element' : 'none';
              if (fullReset || displayState.get(id) !== want) { n.style('display', want); displayState.set(id, want); }
              if (visible) {
                  const pos = calculatedPositions.get(id);
                  // Position réécrite seulement si elle change (sinon Cytoscape invalide le nœud pour rien).
                  if (pos) { const cur = n.position(); if (cur.x !== pos.x || cur.y !== pos.y) n.position(pos); }
              }
          });

          if (fullReset) cy.edges().forEach(e => {
              if (e.id() === 'ghost-edge') return;
              e.removeStyle(); e.removeScratch(CHRONO_STYLE_SCRATCH);
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
              // Rupture d'échelle (Précambrien comprimé, voir chrono-axis.ts) : double trait pointillé + mention côté Précambrien.
              const breakX = hasScaleBreak(chronoAxisMode, globalTimeMin, globalTimeMax) ? chronoAgeToX(SCALE_BREAK_AGE) * zoom : NaN;
              const breakLabel = t('chrono.scale_break').replace('{n}', String(PRECAMBRIAN_COMPRESSION));
              const breakTitle = t('chrono.scale_break.title').replace('{n}', String(PRECAMBRIAN_COMPRESSION)).replace('{age}', String(SCALE_BREAK_AGE));
              if (!isNaN(breakX)) {
                  bgHtml += `<div style="position:absolute; left:${breakX - 2}px; top:0; width:0; height:100%; border-left:1px dashed ${themeTextColor}; opacity:0.7;"></div><div style="position:absolute; left:${breakX + 2}px; top:0; width:0; height:100%; border-left:1px dashed ${themeTextColor}; opacity:0.7;"></div>`;
                  bgHtml += `<div style="position:absolute; left:${breakX - 8}px; top:6px; transform:translateX(-100%); white-space:nowrap; font-size:11px; font-style:italic; font-weight:bold; color:${themeTextColor}; opacity:0.8;">${breakLabel}</div>`;
              }
              bgHtml += `</div></div>`;
              bgEl.innerHTML = bgHtml;

              const labelDefs: { name: string, abbr: string, cs: number, ce: number, top: number, h: number, fs: number, fw: string, ls: string, minW: number }[] = [];
              let rlHtml = `<div style="position:absolute; top:0; left:0; right:0; bottom:0; background:var(--bg-panel, #ffffff);"></div><div id="chrono-track-ruler" style="position:absolute; left:0; top:0; width:1px; height:100%; transform:translateX(${panX}px); transform-origin:left center;"><div style="position:absolute; top:0; left:0; width:1px; height:${CHRONO_RULER_H}px; pointer-events:auto;">`;

              GEO_DETAILS.forEach((period, idx: number) => {
                  const stages = stagesOf(period);
                  stages.forEach((sub, i: number) => {
                      const c = clipSpan(sub.s, sub.e); if (!c || !isVisible(c.x, c.w)) return;
                      const shadeAmount = (i / Math.max(1, stages.length - 1)) * 40 - 20;
                      const stageColor = adjustColorLightness(period.color, shadeAmount);
                      const stageName = t(sub.k) !== sub.k ? t(sub.k) : sub.k.replace('geo.', '');
                      const stageAbbr = stageName.length > 4 ? stageName.substring(0, 3) + '.' : stageName;
                      const tooltip = `${stageName} (${sub.s} - ${sub.e} Ma)`;
                      const showTick = c.w > 22 && c.cs === sub.s;
                      // Unité sans subdivision (Archéen, Hadéen) : bloc sans étiquette, le nom est déjà sur la rangée basse.
                      const isSelf = sub.k === period.key;

                      rlHtml += `<div title="${tooltip}" style="position:absolute; left:${c.x}px; top:0; width:${c.w}px; height:${CHRONO_STAGE_H}px; background-color:${stageColor}; border-right:1px solid rgba(0,0,0,0.3); box-sizing:border-box; overflow:hidden; cursor:help;"></div>`;
                      if (!isSelf) labelDefs.push({ name: stageName, abbr: stageAbbr, cs: c.cs, ce: c.ce, top: CHRONO_STAGE_H - 16, h: 14, fs: 10, fw: '700', ls: '0', minW: 50 });

                      if (showTick) {
                          rlHtml += `<div style="position:absolute; left:${c.x}px; top:2px; width:1px; height:6px; background-color:#000000; z-index:2;"></div><div style="position:absolute; left:${c.x - 30}px; top:9px; width:60px; text-align:center; font-size:9px; font-weight:bold; color:#000000; z-index:2; pointer-events:none;">${sub.s}</div>`;
                      }
                  });
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
              if (!isNaN(breakX)) {
                  // Coupure blanche bordée de deux traits (convention des axes interrompus), sous les graduations
                  // pour laisser lisible l'âge de la limite (538,8).
                  rlHtml += `<div title="${breakTitle}" style="position:absolute; left:${breakX - 3}px; top:20px; width:6px; height:${CHRONO_RULER_H - 20}px; background:#ffffff; border-left:1.5px solid #000000; border-right:1.5px solid #000000; box-sizing:border-box; z-index:3; cursor:help;"></div>`;
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
              expandedTargets = targetCollection.union(targetCollection.successors('node').not('.box'));
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
      
      } finally { cy.endBatch(); }
      refreshBranchPaint(cy); // pinceau : dépend de la position des coudes, recalculée ci-dessus

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

  isAppReady = true;
  bootDone(); // l'écran de chargement s'efface
  if (pendingOSFile) {
      (window as any)._loadOSFile(pendingOSFile);
      pendingOSFile = null;
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
      
      if (state.activeNode && state.activeNode.id() === node.id()) refreshFicheTitle();
      
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
        // Nom entièrement sélectionné : la saisie le remplace (comme renommer un fichier) ; Fin pour compléter.
        input.select();
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
      const romerTools = document.getElementById('romer-tools');
      if (romerTools) romerTools.style.display = state.layoutMode === 'chrono' ? 'flex' : 'none';
      if (ui.chronoAxisSelect) ui.chronoAxisSelect.value = chronoAxisMode;
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

  if (ui.btnChronoBounds) {
      ui.btnChronoBounds.onclick = () => {
          chronoBoundsMode = chronoBoundsMode === 'tight' ? 'period' : 'tight';
          updateChronoToolsUI();
          if (state.layoutMode === 'chrono') refreshLayout(true);
      };
  }

  const updateLayoutButtonsUI = () => {
      ui.btnLayoutNormal.style.background = state.layoutMode === 'standard' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'standard' ? 'invert(1) brightness(2)' : 'var(--layout-icon-filter, none)';
      
      ui.btnLayoutComb.style.background = state.layoutMode === 'comb' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'comb' ? 'invert(1) brightness(2)' : 'var(--layout-icon-filter, none)';

      if (ui.btnLayoutChrono) {
          ui.btnLayoutChrono.style.background = state.layoutMode === 'chrono' ? '#2196F3' : 'var(--bg-input)';
          (ui.btnLayoutChrono.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'chrono' ? 'invert(1) brightness(2)' : 'var(--layout-icon-filter, none)';
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
          refreshFicheTitle(); // le nom de la fiche suit le réglage
      };
  }

  ui.btnGuide.onclick = () => {
      window.open('https://docs.google.com/document/d/1DDLvsZN7iBfwNCN5d-rpir2A8vN5jVssbKU1yYn0424/edit?usp=sharing', '_blank');
  };
  
  /** Racine de la feuille qui contient le nœud : on remonte jusqu'à un début de feuille ou la racine de l'arbre. */
  const getSheetRootForNode = (node: any) => {
    let curr = node;
    // Arrêt sur la racine réelle (sans parent), et pas sur l'identifiant « root » : un arbre importé
    // d'XMind a une autre racine, et la boucle renvoyait alors « root », un nœud inexistant.
    while (curr.length > 0 && !isTreeRoot(curr) && !curr.data('hasNewSheet') && !curr.data('isFolder')) {
        curr = curr.incomers('node').filter((n: any) => !n.hasClass('box')).first();
    }
    return curr.length > 0 ? curr.id() : findTreeRootId(cy);
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

  // (Ancien bouton « Outils de style » : remplacé par l'onglet Style du ruban, voir ribbon.ts.)

  document.getElementById('cmenu-edit')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) openSidePanelForNode(state.activeNode); });
  document.getElementById('cmenu-sheet-new')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) { saveState(); state.activeNode.data('hasNewSheet', true); refreshLayout(); } });
  document.getElementById('cmenu-sheet-open')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) { saveState(); state.currentRootId = state.activeNode.id(); refreshLayout(true); } });
  document.getElementById('cmenu-sheet-remove')?.addEventListener('click', (e) => { e.stopPropagation(); ui.contextMenu.style.display = 'none'; if (state.activeNode && !state.activeNode.hasClass('box')) { saveState(); state.activeNode.data('hasNewSheet', false); refreshLayout(); } });

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

  cy.on('remove', 'node', (e) => {
      if (isEditing && editedNode && e.target.id() === editedNode.id() && closeCurrentEditor) {
          closeCurrentEditor();
      }
  });

  cy.on('render pan zoom viewport resize', () => {
      if (state.layoutMode === 'chrono' && chronoRulerUpdater) startChronoRaf();
  });

  cy.on('add remove position data style', () => { invalidateGraphBB(); });
  cy.on('add remove data', 'node', invalidateSearchIndex);

  cy.on('pan', () => {
      // Bloqueur de caméra désactivé. Le panoramique est totalement libre.
      return;
  });

  if (window.electronAPI && window.electronAPI.onOpenFileFromOS) {
      window.electronAPI.onOpenFileFromOS(async (filePath: string) => {
      });
  }
  const htmlImageCache = new Map<string, HTMLImageElement>();
  /** Placements des images (modèle) : invalidés par tout changement autre que la caméra. */
  let imagePlacementsCache: ReturnType<typeof getImagePlacements> | null = null;
  cy.on('add remove position data style select unselect layoutstop', () => { imagePlacementsCache = null; });

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

      // Placement en coordonnées du modèle : même fonction que l'export (export-images.ts). Mis en cache :
      // il ne dépend pas de la caméra (phase 5 : recalculé à chaque image, il coûtait ~70 % du temps d'un
      // déplacement sur un arbre de 2 400 nœuds).
      if (!imagePlacementsCache) imagePlacementsCache = getImagePlacements(cy, state.layoutMode, state.currentRootId);
      const renderQueue = imagePlacementsCache.map(p => {
          currentVisible.add(p.id);
          const iWidth = p.w * zoom;
          const iHeight = p.h * zoom;
          return {
              id: p.id, imgUrl: p.url, iWidth, iHeight, isSelected: p.selected,
              left: p.cx * zoom + pan.x - iWidth / 2,
              top: p.cy * zoom + pan.y - iHeight / 2,
          };
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