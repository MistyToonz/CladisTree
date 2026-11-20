// ==========================================
// INTERACTIONS : MOLETTE, GLISSER-DÉPOSER DES NŒUDS, SÉLECTION, BARRES DE DÉFILEMENT
// ==========================================
// Molette (zoom/défilement, voir wheel-input.ts), sélection par rectangle et défilement automatique,
// déplacement d'un clade par glisser-déposer (rattachement à un nouveau parent), panoramique au bouton du milieu,
// barres de défilement personnalisées.
// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de
// l'application passent par `ctx` (voir app-context.ts), résolues au moment de l'appel.

import { classifyWheel } from './wheel-input';
import { state } from './graph-state';
import type { AppContext } from './app-context';

export function initInteractions(ctx: AppContext) {
  const { cy, ui } = ctx;

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
  
  ctx.container.addEventListener('wheel', (e: WheelEvent) => { 
      e.preventDefault(); 
      
      // Classement par geste (voir wheel-input.ts) : un glissement rapide au pavé tactile défile au lieu de zoomer.
      const isMouseWheel = classifyWheel(e) === 'mouse';

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
      // Bords du CANEVAS (il commence sous le ruban), et non de la fenêtre.
      const rect = ctx.container.getBoundingClientRect();

      if (currentMouseX < rect.left + threshold) panX = speed;
      else if (currentMouseX > rect.right - threshold) panX = -speed;

      if (currentMouseY < rect.top + threshold) panY = speed;
      else if (currentMouseY > rect.bottom - threshold) panY = -speed;

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
    if (state.divergenceMode) return; // le glisser sert alors à déplacer les divergences (divergence-drag.ts)
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
        ctx.saveState();
        
        const incomingEdges = target.incomers('edge').filter((edge: any) => edge.id() !== 'ghost-edge');
        if (incomingEdges.length > 0) cy.remove(incomingEdges);
        
        cy.add({ group: 'edges', data: { source: currentDragTarget.id(), target: target.id() } });
        ctx.checkAutoRank(target);

        ctx.propagateBoxMembership(currentDragTarget, target.union(target.successors('node').not('.box')).toArray());
    }

    currentDragTarget = null;
    currentParentId = null;
    ctx.refreshLayout(); 
  });
  ctx.container.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button === 1) { 
          e.preventDefault();
          isMiddlePanning = true;
          boxStartX = e.clientX; 
          boxStartY = e.clientY;
          ctx.container.style.cursor = 'grabbing';
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
      ctx.container.style.cursor = 'default';
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
        const rect = ctx.container.getBoundingClientRect();
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
        ctx.updateCounters();
      }
    }
  });
  const hScroll = document.createElement('div');
  hScroll.id = 'custom-hscroll';
  hScroll.style.cssText = "position:fixed; bottom:45px; left:0; right:15px; height:15px; overflow-x:auto; overflow-y:hidden; z-index:700; background:var(--bg-panel); border-top:1px solid var(--border-color); opacity:0.9; transition:right 0.3s ease;";
  const hContent = document.createElement('div');
  hContent.style.height = "1px";
  hScroll.appendChild(hContent);
  const vScroll = document.createElement('div');
  vScroll.id = 'custom-vscroll';
  vScroll.style.cssText = "position:fixed; top:calc(var(--topbar-h, 36px) + 34px); right:0; width:15px; bottom:60px; overflow-y:auto; overflow-x:hidden; z-index:700; background:var(--bg-panel); border-left:1px solid var(--border-color); opacity:0.9; transition:right 0.3s ease;";
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
          && pan.y === lastScrollInput.py && ctx.graphBBVersion === lastScrollInput.bbv
          && vpW === lastScrollInput.vpW && vpH === lastScrollInput.vpH) return;

      lastScrollInput.zoom = zoom;
      lastScrollInput.px = pan.x;
      lastScrollInput.py = pan.y;
      lastScrollInput.bbv = ctx.graphBBVersion;
      lastScrollInput.vpW = vpW;
      lastScrollInput.vpH = vpH;

      isScrolling = true;

      const cached = ctx.getGraphBB();
      const bb = { x1: cached.x1, x2: cached.x2, y1: cached.y1, y2: cached.y2, w: cached.w, h: cached.h };

      if (state.layoutMode === 'chrono') {
          const cb = ctx.getChronoWorldBounds();
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
  hScroll.addEventListener('scroll', () => {
      if (isScrolling || ctx.isCameraLocked) return;
      isScrolling = true;
      const bb = cy.elements().boundingBox();
      if (state.layoutMode === 'chrono') {
          bb.x1 = ctx.getChronoWorldBounds().x1; 
      }
      const zoom = cy.zoom();
      const vpW = cy.width();
      
      cy.pan({ x: -hScroll.scrollLeft + (bb.x1 * zoom) + vpW, y: cy.pan().y });
      isScrolling = false;
  });
  vScroll.addEventListener('scroll', () => {
      if (isScrolling || ctx.isCameraLocked) return;
      isScrolling = true;
      const bb = cy.elements().boundingBox();
      const zoom = cy.zoom();
      const vpH = cy.height();
      
      cy.pan({ x: cy.pan().x, y: -vScroll.scrollTop + (bb.y1 * zoom) + vpH });
      isScrolling = false;
  });

  return {  };
}
