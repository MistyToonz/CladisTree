// ==========================================
// PANNEAU LATÉRAL : FICHE DU TAXON
// ==========================================
// Ouverture/fermeture de la fiche, lignée, frise géologique de la fiche (updateTimeline),
// synonymie, illustration de la fiche, saisie des champs, export PDF de la fiche.
// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de
// l'application passent par `ctx` (voir app-context.ts), résolues au moment de l'appel.

import { state } from './graph-state';
import { t } from './i18n';
import { LayoutEngine } from './layout-engine';
import { PHANEROZOIC_BASE, EARTH_AGE, PHANEROZOIC_TIMELINE_MAX, GEO_DETAILS, stagesOf, adjustColorLightness } from './chrono-data';
import { generateFichePdf } from './export';
import type { AppContext } from './app-context';

export function initSidePanel(ctx: AppContext) {
  const { ui, cy } = ctx;
 
  let sidePanelTimeout: ReturnType<typeof setTimeout>;
  let panelTimeout: ReturnType<typeof setTimeout>;
  function closeSidePanel() { 
      ui.sidePanel.style.transform = 'translateX(100%)'; 
      const vScroll = document.getElementById('custom-vscroll');
      const hScroll = document.getElementById('custom-hscroll');
      if (vScroll) vScroll.style.right = '0px';
      if (hScroll) hScroll.style.right = '15px';
  }
  /** Nom affiché d'un taxon dans le format demandé ; '' si le nom n'est pas dessiné (genre parent de ses espèces). */
  const ficheName = (node: any, format: 'full' | 'abbrev'): string => LayoutEngine.getDynamicNodeName(node, state, format);
  /** Titre de la fiche. Nom d'espèce selon le réglage « Noms complets / compacts » (aussi en chronogramme, qui dessine toujours en complet). */
  function setPanelTitle(node: any) {
      const isBox = node.hasClass('box');
      const rawName = isBox ? node.data('name') : (ficheName(node, state.appSettings.speciesFormat) || node.data('name'));
      const displayName = (!rawName || rawName.trim() === '') ? (isBox ? t('default.box') : t('default.unnamed_branch')) : rawName;
      const extinctMark = node.data('extinct') && !isBox && displayName !== t('default.unnamed_branch') ? '\u2020 ' : ''; 
      ui.panelTitle.innerText = extinctMark + displayName;
  }
  /** Après un renommage ou un changement « Noms complets / compacts ». */
  function refreshFicheTitle() {
      if (state.activeNode && state.activeNode.inside()) setPanelTitle(state.activeNode);
  }
  function openSidePanelForNode(node: any) {
      state.activeNode = node;
      setPanelTitle(node);

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
      
      // Illustrations (plusieurs) et son : fiche-media.ts.
      ctx.renderFicheMedia(node);
      // Classifications alternatives : seulement pour une racine de feuille (classifications-ui.ts).
      ctx.renderSheetClassification(node);
      if (node.hasClass('box')) {
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
      ctx.updateFicheNav(); // boutons ← / → : taxon terminal précédent / suivant (fiche-nav.ts)
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
  
  ui.btnClosePanel.addEventListener('click', closeSidePanel); 
  ui.btnCloseCross.addEventListener('click', closeSidePanel);
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
        
        const isDeepPrecambrian = start > PHANEROZOIC_BASE || end > PHANEROZOIC_BASE;
        ui.timelineIndicator.style.display = 'block';  
        
        if (isDeepPrecambrian) {
            if (layerNormal) layerNormal.style.display = 'none';
            if (layerDeep) layerDeep.style.display = 'block';
            
            const displayStart = Math.min(EARTH_AGE, Math.max(0, start));  
            const displayEnd = Math.min(EARTH_AGE, Math.max(0, end));  
            const leftPct = ((EARTH_AGE - displayStart) / EARTH_AGE) * 100;  
            const widthPct = start === end ? 0 : ((displayStart - displayEnd) / EARTH_AGE) * 100;  
            
            ui.timelineIndicator.style.left = leftPct + '%';  
            ui.timelineIndicator.style.width = start === end ? '2px' : widthPct + '%';  
        } else {
            if (layerNormal) layerNormal.style.display = 'block';
            if (layerDeep) layerDeep.style.display = 'none';
            
            const displayStart = Math.min(PHANEROZOIC_TIMELINE_MAX, Math.max(0, start));  
            const displayEnd = Math.min(PHANEROZOIC_TIMELINE_MAX, Math.max(0, end));  
            const leftPct = ((PHANEROZOIC_TIMELINE_MAX - displayStart) / PHANEROZOIC_TIMELINE_MAX) * 100;  
            const widthPct = start === end ? 0 : ((displayStart - displayEnd) / PHANEROZOIC_TIMELINE_MAX) * 100;  
            
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
                    const stages = stagesOf(period);
                    stages.forEach((sub, i) => {
                        const subDuration = sub.s - sub.e;
                        const subWidthPct = (subDuration / zoomDuration) * 100;

                        const shadeAmount = (i / Math.max(1, stages.length - 1)) * 40 - 20;
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
  ui.inpSynonymTarget.addEventListener('input', () => {
      const val = ui.inpSynonymTarget.value.toLowerCase().trim();
      ui.synonymDropdown.innerHTML = '';
      if (!val) { 
          ui.synonymDropdown.style.display = 'none'; 
          if (state.activeNode) {
              state.activeNode.data('synonymTargetId', null);
              ui.panelSubtitleSynonym.style.display = 'none';
              ctx.setUnsavedState(true);
          }
          return; 
      }
      const matches = cy.nodes().filter((n: any) => {
          if (n.hasClass('box') || (state.activeNode && n.id() === state.activeNode.id())) return false;
          return ctx.getNodeSearchStrings(n).some(s => s.includes(val));
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
                      ctx.saveState();
                      state.activeNode.data('synonymTargetId', node.id());
                      const targetName = LayoutEngine.getDynamicNodeName(node, state, 'full');
                      ui.panelSubtitleSynonym.innerHTML = '= ' + targetName;
                      ui.panelSubtitleSynonym.style.display = 'block';
                      ctx.setUnsavedState(true);
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
              return ctx.getNodeSearchStrings(n).some(s => s.includes(val));
          });
          if (matches.length >= 1) {
              const node = matches[0];
              ui.synonymDropdown.style.display = 'none';
              ui.inpSynonymTarget.value = node.data('name');
              if (state.activeNode) {
                  ctx.saveState();
                  state.activeNode.data('synonymTargetId', node.id());
                  const targetName = LayoutEngine.getDynamicNodeName(node, state, 'full');
                  ui.panelSubtitleSynonym.innerHTML = '= ' + targetName;
                  ui.panelSubtitleSynonym.style.display = 'block';
                  ctx.setUnsavedState(true);
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
              const nodeRootId = ctx.getSheetRootForNode(targetNode); 
              if (nodeRootId !== state.currentRootId) { 
                  state.currentRootId = nodeRootId; 
                  ctx.refreshLayout(false); 
              } 
              cy.$(':selected').unselect();
              targetNode.select();
              ctx.focusCameraOnNode(targetNode);
              openSidePanelForNode(targetNode);
          }
      }
  };
  
  ui.btnExportFiche.onclick = async () => {
    if (!state.activeNode) return;
    
    let synNameStr = '';
    const synId = state.activeNode.data('synonymTargetId');
    if (synId) {
        const tNode = cy.$id(synId);
        if (tNode.length > 0) synNameStr = '= ' + LayoutEngine.getDynamicNodeName(tNode, state, 'full');
    }

    const lineageStr = buildLineageString(state.activeNode).replace(/<[^>]+>/g, '');
    // PDF : toujours le nom complet (« Homo sapiens »), quel que soit l'affichage choisi.
    const pdfData = { ...state.activeNode.data(), name: ficheName(state.activeNode, 'full') || state.activeNode.data('name') };
    await generateFichePdf(pdfData, state.appSettings, lineageStr, synNameStr, GEO_DETAILS, window.electronAPI);
  };
  const inputKeys = Object.keys(ui.formInputs);
  // (Ajout / suppression des illustrations : fiche-media.ts.)
  inputKeys.forEach((key, index) => { 
      const inputEl = (ui.formInputs as any)[key] as HTMLElement;
      
      inputEl.addEventListener('change', (e: any) => {
          // Crédits d'une illustration secondaire : gérés par fiche-media.ts, pas par ce champ générique.
          if (key === 'imgCredits' && inputEl.dataset.extra) return;
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
                              ctx.refreshLayout(false);
                              ctx.showCustomAlert(message);
                              return; 
                          }
                      }
                  }
              }
              
              ctx.refreshLayout();
              ctx.setUnsavedState(true);
              ctx.saveState();
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
          ctx.updateRibbonForNode(selectedAll[0]);
      }

      ctx.updateCounters(); 
    }, 50); 
  });

  return { closeSidePanel, openSidePanelForNode, refreshFicheTitle };
}
