// ==========================================
// RUBAN À ONGLETS (phase 2) : Style, Affichage, Arbre, Aide
// ==========================================
// Un seul panneau visible à la fois ; cliquer l'onglet actif (ou ▲) replie le ruban. L'onglet ouvert
// est retenu d'une session à l'autre. La hauteur réelle de la barre du haut est publiée dans la
// variable CSS --topbar-h : le fil d'Ariane, la fiche et la barre de défilement se placent dessous.
//
// Les boutons « Sélection » de l'onglet Arbre réutilisent les actions du menu contextuel
// (greffer, nouvelle feuille, encadrer) sur le ou les taxons sélectionnés.

import { state } from './graph-state';
import { t } from './i18n';
import type { AppContext } from './app-context';

export type RibbonTab = 'style' | 'display' | 'tree' | 'help';
const TABS: RibbonTab[] = ['style', 'display', 'tree', 'help'];
const LS_KEY = 'cladistree_ribbon_tab';
/** Onglet ouvert au premier lancement : « Arbre » contient les modes d'affichage, toujours visibles avant la phase 2. */
const DEFAULT_TAB: RibbonTab = 'tree';

export function initRibbon(ctx: AppContext) {
  const { cy, ui } = ctx;
  const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.ribbon-tab'));
  const panels = Array.from(document.querySelectorAll<HTMLElement>('.ribbon-panel'));
  const topBar = document.getElementById('top-bar-container');

  // Le canevas (#app, index.html) commence sous la barre et le ruban : quand leur hauteur change,
  // Cytoscape doit recalculer la taille de son conteneur.
  let lastHeight = -1;
  const syncHeight = () => {
      if (!topBar) return;
      const h = topBar.offsetHeight;
      if (h === lastHeight) return;
      lastHeight = h;
      document.documentElement.style.setProperty('--topbar-h', h + 'px');
      cy.resize();
  };
  // Différé à l'image suivante : redimensionner le canevas DANS le rappel de l'observateur provoque
  // « ResizeObserver loop completed with undelivered notifications », que le serveur de développement
  // affiche en surcouche plein écran (l'application devient alors inutilisable avec npm start).
  let syncPending = false;
  const scheduleSync = () => {
      if (syncPending) return;
      syncPending = true;
      requestAnimationFrame(() => { syncPending = false; syncHeight(); });
  };
  if (topBar && typeof ResizeObserver !== 'undefined') new ResizeObserver(scheduleSync).observe(topBar);

  // --- Actions sur la sélection (onglet Arbre)
  const selectedTaxa = () => cy.$('node:selected').not('.box');
  let selectionFrame = 0;
  const updateSelectionButtons = () => {
      selectionFrame = 0;
      const n = selectedTaxa().length;
      document.querySelectorAll<HTMLButtonElement>('#ribbon-tree [data-needs]').forEach(b => {
          const needsOne = b.dataset.needs === 'one';
          const ok = needsOne ? n === 1 : n >= 1;
          b.disabled = !ok;
          b.title = ok ? '' : t(needsOne ? 'ribbon.need_one' : 'ribbon.need_some');
      });
  };
  // Une sélection au rectangle émet un événement par nœud : une seule mise à jour par image.
  cy.on('select unselect', 'node', () => { if (!selectionFrame) selectionFrame = requestAnimationFrame(updateSelectionButtons); });

  const viaContextMenu = (menuItemId: string) => {
      const sel = selectedTaxa();
      if (sel.length === 0) return;
      state.activeNode = sel[0];
      document.getElementById(menuItemId)?.click();
  };
  document.getElementById('ribbon-graft')?.addEventListener('click', () => viaContextMenu('cmenu-graft'));
  document.getElementById('ribbon-sheet-new')?.addEventListener('click', () => viaContextMenu('cmenu-sheet-new'));
  document.getElementById('ribbon-box-add')?.addEventListener('click', () => viaContextMenu('cmenu-box-add'));

  // --- Onglets
  let active: RibbonTab | null = null;
  const show = (tab: RibbonTab | null) => {
      active = tab;
      tabButtons.forEach(b => {
          const on = b.dataset.tab === tab;
          b.classList.toggle('active', on);
          b.setAttribute('aria-selected', String(on));
      });
      // Le panneau Style reste `ui.styleMenu` : la fiche le met à jour quand il est affiché ('flex').
      panels.forEach(p => { p.style.display = p.dataset.panel === tab ? 'flex' : 'none'; });
      ui.ribbon.style.display = tab ? 'block' : 'none';
      if (tab === 'style') {
          const sel = cy.$('node:selected');
          if (sel.length === 1) ctx.updateRibbonForNode(sel[0]);
      }
      if (tab === 'tree') updateSelectionButtons();
      try { localStorage.setItem(LS_KEY, tab || ''); } catch { /* stockage indisponible : sans conséquence */ }
      syncHeight();
  };
  tabButtons.forEach(b => b.addEventListener('click', () => {
      const tab = b.dataset.tab as RibbonTab;
      show(active === tab ? null : tab);
  }));
  document.getElementById('btn-collapse-ribbon')?.addEventListener('click', () => show(null));

  // Raccourcis de la rangée des chiffres (clavier AZERTY : & é " ' ( ; ailleurs : 1 à 5, sans Maj) :
  // & = menu Fichier, é = Style, " = Affichage, ' = Arbre, ( = Aide. Même effet qu'un clic sur l'onglet
  // (une 2e pression replie le ruban). Ignorés pendant une saisie ou quand une fenêtre recouvre l'arbre.
  const KEY_TABS: Record<string, RibbonTab | 'file'> = { '&': 'file', 'é': 'style', '"': 'display', "'": 'tree', '(': 'help' };
  const CODE_TABS: Record<string, RibbonTab | 'file'> = { Digit1: 'file', Digit2: 'style', Digit3: 'display', Digit4: 'tree', Digit5: 'help' };
  window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const el = document.activeElement as HTMLElement | null;
      const typing = !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);
      if (typing || ctx.isEditing) return;
      const blocking = ['welcome-overlay', 'geo-chart-overlay', 'settings-modal', 'compile-modal', 'table-modal', 'credits-overlay']
          .some(id => { const o = document.getElementById(id); return !!o && getComputedStyle(o).display !== 'none'; });
      if (blocking) return;
      const target = KEY_TABS[e.key] || (!e.shiftKey ? CODE_TABS[e.code] : undefined);
      if (!target) return;
      e.preventDefault();
      if (target === 'file') {
          // Menu « Fichier » : déroulé tant que son bouton a le focus (Échap ou un clic ailleurs le referme).
          const btn = document.getElementById('lbl-topbar-file') as HTMLButtonElement | null;
          if (!btn) return;
          if (document.activeElement === btn) btn.blur(); else btn.focus();
          return;
      }
      (document.getElementById('lbl-topbar-file') as HTMLElement | null)?.blur(); // referme le menu Fichier s'il était ouvert
      show(active === target ? null : target);
  });
  // Échap referme le menu Fichier ouvert au clavier.
  window.addEventListener('keydown', (e: KeyboardEvent) => {
      const btn = document.getElementById('lbl-topbar-file');
      if (e.key === 'Escape' && btn && document.activeElement === btn) btn.blur();
  });

  let saved: string | null = null;
  try { saved = localStorage.getItem(LS_KEY); } catch { /* idem */ }
  show(saved === null ? DEFAULT_TAB : (TABS.includes(saved as RibbonTab) ? saved as RibbonTab : null));

  return { showRibbonTab: show };
}
