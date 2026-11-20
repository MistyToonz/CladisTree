// ==========================================
// EXPORT DU GRAPHE : PNG, JPEG, SVG, PDF
// ==========================================
// Bouton « Exporter » : frise géologique temporaire en chronogramme, puis composition des images
// des fiches (export-images.ts), absentes du rendu Cytoscape.
// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de
// l'application passent par `ctx` (voir app-context.ts), résolues au moment de l'appel.

import { state } from './graph-state';
import { CHRONO_PERIOD_KEYS, GEO_DETAILS, stagesOf, adjustColorLightness } from './chrono-data';
import { t } from './i18n';
import { hasScaleBreak, SCALE_BREAK_AGE, PRECAMBRIAN_COMPRESSION } from './chrono-axis';
import { getImagePlacements, composeImagesOnRaster, injectImagesInSvg } from './export-images';
import { exportGraphToPdf } from './export';
import { fromCyNode, writeNewick, writeNexus } from './phylo-formats';
import { findTreeRootId } from './tree-utils';
import type { AppContext } from './app-context';

export function initGraphExport(ctx: AppContext) {
  const { ui, cy } = ctx;

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

      // Newick / NEXUS : arbre entier (toutes les feuilles), noms, supports, longueurs de branche.
      if (format === 'nwk' || format === 'nex') {
          const root = cy.$id(findTreeRootId(cy));
          if (root.length === 0) return;
          const tree = fromCyNode(root);
          let hasSupport = false;
          const scan = (n: any) => { if (n.support !== undefined) hasSupport = true; n.children.forEach(scan); };
          scan(tree);
          const internal = hasSupport && confirm(t('export.internal_supports')) ? 'support' : 'name';
          const text = format === 'nwk' ? writeNewick(tree, internal) + '\n' : writeNexus(tree, internal);
          window.electronAPI.saveExport(text, fileName, format);
          return;
      }
      
      let tempChronoElements: any = cy.collection();

      const finishChronoExport = () => {
          if (state.layoutMode !== 'chrono') return;
          cy.remove(tempChronoElements);
      };

      if (state.layoutMode === 'chrono') {
          const parseMa = (val: any) => parseFloat(String(val).replace(',', '.'));

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
          if (!isNaN(firstStageEnd) && firstStageEnd >= ctx.globalTimeMin && firstStageEnd <= ctx.globalTimeMax) {
              drawnLabelXs.push(ctx.chronoAgeToX(firstStageEnd));
          }

          GEO_DETAILS.forEach((period, idx: number) => {
              const stages = stagesOf(period);
              stages.forEach((sub, i: number) => {
                      const sStart = parseMa(sub.s);
                      const sEnd = parseMa(sub.e);
                      if (isNaN(sStart) || isNaN(sEnd)) return;
                      
                      if (sEnd >= ctx.globalTimeMax || sStart <= ctx.globalTimeMin) return;
                      const renderStart = Math.min(ctx.globalTimeMax, sStart);
                      const renderEnd = Math.max(ctx.globalTimeMin, sEnd);
                      if (renderStart <= renderEnd) return;
                      
                      const xStart = ctx.chronoAgeToX(renderStart);
                      const xEnd = ctx.chronoAgeToX(renderEnd);
                      const w = Math.max(1, xEnd - xStart);
                      const cx = (xStart + xEnd) / 2; 
                      
                      const shadeAmount = (i / Math.max(1, stages.length - 1)) * 40 - 20;
                      const stageColor = adjustColorLightness(period.color, shadeAmount);
                      const stageName = t(sub.k) !== sub.k ? t(sub.k) : sub.k.replace('geo.', '');
                      const isSelf = sub.k === period.key; // unité sans subdivision : pas d'étiquette répétée

                      const stageAbbr = stageName.length > 4 ? stageName.substring(0, 3) + '.' : stageName;
                      let displayLabel = '';
                      if (isSelf) {
                          displayLabel = '';
                      } else if (w > 50) {
                          displayLabel = stageName;
                      } else if (w > 22) {
                          displayLabel = stageAbbr;
                      }
                      
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-bg-sub-' + idx + '-' + i, name: 'bg' },
                          position: { x: cx, y: bgCenterY },
                          style: { 'width': w, 'height': bgHeight, 'shape': 'rectangle', 'background-color': stageColor, 'background-opacity': 0.12, 'border-width': 0, 'z-index': -999, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
                      });
                      
                      const tickX = ctx.chronoAgeToX(renderStart);
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

              const pStart = parseMa(period.start);
              const pEnd = parseMa(period.end);
              if (!isNaN(pStart) && !isNaN(pEnd) && pEnd < ctx.globalTimeMax && pStart > ctx.globalTimeMin) {
                  const renderStart = Math.min(ctx.globalTimeMax, pStart);
                  const renderEnd = Math.max(ctx.globalTimeMin, pEnd);
                  if (renderStart > renderEnd) {
                      const xStart = ctx.chronoAgeToX(renderStart);
                      const xEnd = ctx.chronoAgeToX(renderEnd);
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

                      const tickX = ctx.chronoAgeToX(renderStart);
                      timelineNodes.push({
                          group: 'nodes', classes: 'export-chrono', data: { id: 'export-ruler-pertick-' + idx, name: 'pertick' },
                          position: { x: tickX, y: rulerStartY + 50 },
                          style: { 'width': 2, 'height': 20, 'shape': 'rectangle', 'background-color': '#000000', 'background-opacity': 1, 'border-width': 0, 'padding': 0, 'z-index': 102, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
                      });
                  }
              }
          });

          if (!isNaN(firstStageEnd) && firstStageEnd >= ctx.globalTimeMin && firstStageEnd <= ctx.globalTimeMax) {
              const tickX = ctx.chronoAgeToX(firstStageEnd);
              
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
          
          const xOldest = ctx.chronoAgeToX(ctx.globalTimeMax);
          const xYoungest = ctx.chronoAgeToX(ctx.globalTimeMin);
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

          // Rupture d'échelle (Précambrien comprimé) : mêmes repères qu'à l'écran.
          if (hasScaleBreak(ctx.chronoAxisMode, ctx.globalTimeMin, ctx.globalTimeMax)) {
              const bx = ctx.chronoAgeToX(SCALE_BREAK_AGE);
              [-2, 2].forEach((dx, k) => timelineNodes.push({
                  group: 'nodes', classes: 'export-chrono', data: { id: 'export-break-line-' + k, name: 'break' },
                  position: { x: bx + dx, y: bgCenterY },
                  style: { 'width': 1, 'height': bgHeight, 'shape': 'rectangle', 'background-color': themeTextColor, 'background-opacity': 0.6, 'border-width': 0, 'padding': 0, 'z-index': -997, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
              }));
              timelineNodes.push({
                  group: 'nodes', classes: 'export-chrono', data: { id: 'export-break-ruler', name: 'break' },
                  position: { x: bx, y: rulerStartY + 30 },
                  style: { 'width': 6, 'height': 60, 'shape': 'rectangle', 'background-color': '#ffffff', 'background-opacity': 1, 'border-width': 1.5, 'border-color': '#000000', 'padding': 0, 'z-index': 106, 'z-index-compare': 'manual', 'events': 'no', 'label': '' }
              });
              timelineNodes.push({
                  group: 'nodes', classes: 'export-chrono', data: { id: 'export-break-label', name: 'break' },
                  position: { x: bx - 8, y: treeTopY + 12 },
                  style: { 'width': 0.1, 'height': 0.1, 'background-opacity': 0, 'border-width': 0, 'label': t('chrono.scale_break').replace('{n}', String(PRECAMBRIAN_COMPRESSION)), 'font-size': 11, 'font-style': 'italic', 'font-weight': 'bold', 'color': themeTextColor, 'text-halign': 'left', 'text-valign': 'center', 'z-index': 105, 'z-index-compare': 'manual', 'events': 'no' }
              });
          }

          tempChronoElements = cy.add(timelineNodes);
      }

      // Les images des fiches vivent dans un calque HTML que Cytoscape ne capture pas :
      // on relève leur placement et la boîte englobante utilisée par Cytoscape AVANT de retirer
      // les éléments temporaires du chronogramme, puis on les recompose sur le résultat.
      const exportBox = (cy as any).mutableElements().boundingBox(); // = boîte utilisée par cy.png/svg({ full: true })
      const exportImages = getImagePlacements(cy, state.layoutMode, state.currentRootId);
      const withImages = async (raw: string, bg: string, mime: 'image/png' | 'image/jpeg') => {
          try { return await composeImagesOnRaster(raw, exportBox, exportImages, bg, mime); }
          catch (err) { console.error('Composition des images impossible, export sans images :', err); return raw; }
      };

      if (format === 'png' || format === 'jpeg') {
        const b64 = format === 'png'
          ? cy.png({ full: true, bg: exportBg, scale: scaleFactor })
          : cy.jpg({ full: true, bg: '#ffffff', scale: scaleFactor });

        finishChronoExport();
        const finalB64 = format === 'png'
          ? await withImages(b64, exportBg, 'image/png')
          : await withImages(b64, '#ffffff', 'image/jpeg');
        window.electronAPI.saveExport(finalB64, fileName, format);

      } else if (format === 'svg') {
        let svgContent = (cy as any).svg({ full: true, bg: exportBg, scale: scaleFactor });

        finishChronoExport();
        try { svgContent = injectImagesInSvg(svgContent, exportBox, exportImages, exportBg); }
        catch (err) { console.error('Injection des images SVG impossible, export sans images :', err); }
        window.electronAPI.saveExport(svgContent, fileName, format);

      } else if (format === 'pdf') {
        const b64 = cy.png({ full: true, bg: '#ffffff', scale: scaleFactor });
        finishChronoExport();
        exportGraphToPdf(await withImages(b64, '#ffffff', 'image/png'), fileName, window.electronAPI);
      }
  };

  return {  };
}
