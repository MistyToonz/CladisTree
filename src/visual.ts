// ==========================================
// CONFORT VISUEL (phase 4) : hub d'accueil, mouvements, notifications
// ==========================================
// Règles ajoutées après APP_CSS (ui.ts). Principe : l'identité reste celle de CHAQUE thème (police, rayon,
// couleurs via les variables --bg-panel, --text-main…, accent #2196F3) ; on n'ajoute que du mouvement
// court et utile (apparition des panneaux, menus, fenêtres, retour au clic) et un hub d'accueil
// dessiné comme un cladogramme, le motif du logo. Tout mouvement est coupé si le système le demande
// (prefers-reduced-motion).

export const VISUAL_CSS = `
  :root { --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1); --accent: #2196F3; }

  /* ---------- Mouvements ---------- */
  @keyframes cl-fade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes cl-fade-down { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }
  @keyframes cl-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
  @keyframes cl-slide-left { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
  @keyframes cl-pop { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
  @keyframes cl-modal { from { opacity: 0; transform: translate(-50%, -47%); } to { opacity: 1; transform: translate(-50%, -50%); } }

  /* Panneau du ruban : apparition à chaque changement d'onglet (l'animation se rejoue quand il redevient visible). */
  .ribbon-panel { animation: cl-fade-down 170ms var(--ease-out); }
  /* Fiche du taxon : glisse depuis la droite. */
  #side-panel { animation: cl-slide-left 210ms var(--ease-out); }
  /* Menus contextuels, fenêtres et calques. */
  #context-menu, .cl-pop { animation: cl-pop 120ms var(--ease-out); transform-origin: top left; }
  #settings-modal, #compile-modal { animation: cl-modal 190ms var(--ease-out); }
  #credits-overlay, #table-modal { animation: cl-fade 160ms ease-out; }

  /* Menu « Fichier » : fondu au lieu d'un affichage brutal (visibilité différée pour garder le survol). */
  .dropdown-content { display: block !important; visibility: hidden; opacity: 0; transform: translateY(-4px);
    transition: opacity 130ms ease-out, transform 130ms var(--ease-out), visibility 0s linear 130ms; }
  .dropdown:hover .dropdown-content, .dropdown:focus-within .dropdown-content { visibility: visible; opacity: 1; transform: none; transition-delay: 0s; }

  /* Boutons : transitions de couleur et petit enfoncement au clic. */
  button, .dropdown-item, .menu-item { transition: background-color 140ms ease-out, border-color 140ms ease-out, color 140ms ease-out, opacity 140ms ease-out, transform 90ms ease-out; }
  .ribbon-btn:active:not(:disabled), .menu-btn:active, .hub-action:active { transform: translateY(1px); }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent) !important; }
  input, select, textarea { transition: border-color 140ms ease-out; }

  /* Barres de défilement fines aux couleurs du thème (InGen garde les barres classiques). */
  * { scrollbar-width: thin; scrollbar-color: var(--border-color) transparent; }
  [data-theme="ingen"] * { scrollbar-width: auto; scrollbar-color: auto; }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; animation-delay: 0s !important; transition-duration: 1ms !important; }
  }

  /* ---------- Hub d'accueil ---------- */
  .hub { position: fixed; inset: 0; z-index: 9999; display: flex; flex-direction: column; background: var(--bg-panel); color: var(--text-main);
    font-family: var(--ui-font); transition: opacity 200ms ease-out; animation: cl-fade 180ms ease-out; }
  .hub.hub-hiding { opacity: 0; pointer-events: none; }
  .hub-head { display: flex; align-items: center; gap: 18px; padding: 16px 36px; background: var(--bg-topbar); color: var(--text-topbar); border-bottom: 1px solid var(--border-color); }
  .hub-logo { width: 72px; height: 72px; object-fit: contain; flex-shrink: 0; user-select: none; }
  .hub-title { font-family: Georgia, 'Times New Roman', serif; font-size: 30px; font-weight: bold; color: var(--accent); letter-spacing: 0.5px; line-height: 1.05; }
  [data-theme="console"] .hub-title, [data-theme="high-contrast"] .hub-title { color: var(--text-topbar); }
  .hub-sub { font-size: 13px; opacity: 0.8; margin-top: 6px; }
  .hub-version { margin-left: auto; font-size: 11px; opacity: 0.6; font-weight: bold; white-space: nowrap; }
  .hub-close { padding: 6px 12px; cursor: pointer; background: var(--bg-input); color: var(--text-input); border: 1px solid var(--border-color); border-radius: var(--btn-radius); font-weight: bold; font-size: 12px; }
  .hub-close:hover { border-color: var(--accent); }

  .hub-body { flex: 1; display: grid; grid-template-columns: minmax(300px, 400px) minmax(0, 1fr); gap: 56px; padding: 32px 36px 28px 44px; overflow: auto; }
  .hub-h { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.6; margin: 0 0 12px; font-weight: bold; }

  /* Listes en cladogramme : traits en SVG, calculés par hub.ts depuis la position réelle des boutons. */
  .hub-tree { list-style: none; margin: 0 0 26px; padding: 0 0 0 52px; position: relative; }
  .hub-tree li { position: relative; margin: 0 0 10px; animation: cl-rise 260ms var(--ease-out) backwards; animation-delay: calc(var(--i, 0) * 50ms + 60ms); }
  .hub-tree li:last-child { margin-bottom: 0; }
  .hub-tree-svg { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; animation: cl-fade 300ms ease-out backwards; animation-delay: 120ms; }
  .hub-tree-svg line { stroke: currentColor; stroke-width: 2; stroke-linecap: square; }
  .hub-tree-svg g.base { opacity: 0.4; }
  .hub-tree-svg g.hl line { stroke: var(--accent); }
  .hub-tree-svg g.hl line { animation: cl-fade 160ms ease-out; }

  .hub-action { width: 100%; min-height: 62px; display: flex; align-items: center; gap: 14px; padding: 8px 14px; text-align: left; cursor: pointer;
    background: var(--bg-input); color: var(--text-input); border: 1px solid var(--border-color); border-radius: var(--btn-radius); font-family: var(--ui-font); }
  .hub-action:hover { border-color: var(--accent); }
  .hub-action b { display: block; font-size: 14px; }
  .hub-action small { display: block; font-size: 11px; opacity: 0.7; margin-top: 3px; font-weight: normal; }
  .hub-mode-icon { width: 36px; height: 36px; object-fit: contain; flex-shrink: 0; filter: var(--layout-icon-filter, none); user-select: none; }
  .hub-open-glyph { width: 36px; display: flex; flex-direction: column; gap: 5px; align-items: flex-start; flex-shrink: 0; padding-left: 4px; }
  .hub-open-glyph i { display: block; height: 3px; background: currentColor; opacity: 0.75; }
  .hub-open-glyph i:nth-child(1) { width: 24px; } .hub-open-glyph i:nth-child(2) { width: 16px; } .hub-open-glyph i:nth-child(3) { width: 28px; }
  .hub-tip { font-size: 12px; opacity: 0.7; font-style: italic; margin: 0; max-width: 380px; }

  .hub-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 16px; }
  /* Animation d'entrée en « backwards » : appliquée pendant le délai seulement, elle ne fige pas transform
     après coup (sinon le grossissement au survol serait sans effet). */
  .hub-card { position: relative; display: flex; flex-direction: column; padding: 0; text-align: left; cursor: pointer; background: var(--bg-input); color: var(--text-input);
    border: 1px solid var(--border-color); border-radius: var(--btn-radius); overflow: hidden; font-family: var(--ui-font);
    transition: transform 220ms var(--ease-out), box-shadow 220ms var(--ease-out), border-color 150ms ease-out;
    animation: cl-rise 280ms var(--ease-out) backwards; animation-delay: calc(var(--i, 0) * 50ms + 120ms); }
  .hub-card:hover { border-color: var(--accent); transform: scale(1.045); z-index: 1; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18); }
  .hub-card:active { transform: scale(1.02); }
  .hub-card .hub-thumb img { transition: transform 300ms var(--ease-out); }
  .hub-card:hover .hub-thumb img { transform: scale(1.04); }
  .hub-thumb { aspect-ratio: 4 / 3; background: var(--bg-panel); display: flex; align-items: center; justify-content: center; border-bottom: 1px solid var(--border-color); overflow: hidden; }
  .hub-thumb img { width: 100%; height: 100%; object-fit: cover; user-select: none; }
  .hub-thumb img.hub-thumb-mode { width: 42%; height: 42%; object-fit: contain; filter: var(--layout-icon-filter, none); opacity: 0.75; }
  .hub-card-meta { padding: 8px 10px 10px; }
  .hub-card-name { font-weight: bold; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hub-card-info { font-size: 11px; opacity: 0.65; margin-top: 3px; display: flex; justify-content: space-between; gap: 8px; }
  .hub-card-info span:last-child { white-space: nowrap; }
  .hub-empty { opacity: 0.6; font-style: italic; font-size: 12px; margin: 0; }

  /* Choix de la langue (premier lancement). */
  .hub-lang { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--bg-panel); z-index: 2; }
  .hub-lang-box { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; animation: cl-rise 300ms var(--ease-out) both; }
  .hub-lang-logo { width: 110px; height: 110px; object-fit: contain; }
  .hub-lang-title { font-size: 18px; font-weight: bold; letter-spacing: 0.5px; }
  .hub-lang-choices { display: grid; grid-template-columns: repeat(3, 190px); gap: 12px; }
  .hub-lang-choices .hub-action { width: 100%; min-height: 52px; justify-content: center; }
  .hub-lang-note { font-size: 11px; opacity: 0.6; }

  /* InGen : relief « fenêtre » classique au lieu du survol décalé. */
  [data-theme="ingen"] .hub-action, [data-theme="ingen"] .hub-card, [data-theme="ingen"] .hub-close { box-shadow: var(--panel-shadow); }
  [data-theme="ingen"] .hub-card:hover { box-shadow: var(--panel-shadow), 4px 4px 0 rgba(0, 0, 0, 0.35); }

  @media (max-width: 860px) { .hub-body { grid-template-columns: 1fr; gap: 28px; } }

  /* ---------- Thème « Muséum » (phase 4) ----------
     Planche d'histoire naturelle : papier chaud, encre bleu nuit, rouge du logo pour le repère actif.
     Polices fournies avec Windows : Bahnschrift (interface, dessin technique façon DIN) et Sitka (titres).
     Repli : Segoe UI / Georgia sur les autres systèmes. Les styles en ligne de l'interface imposent quelques
     !important (barre du haut, recherche, titre de la fiche). */
  [data-theme="museum"] {
    --bg-panel: #f2eee5; --text-main: #1e2329; --border-color: #d6cdba; --bg-topbar: #18232e; --text-topbar: #f2eee5;
    --bg-hover: #e7e0cf; --bg-input: #fffdf7; --text-input: #1e2329; --btn-radius: 6px;
    --panel-shadow: 0 1px 2px rgba(24, 35, 46, 0.08), 0 8px 24px rgba(24, 35, 46, 0.08);
    --ui-font: 'Bahnschrift', 'Segoe UI Variable Text', 'Segoe UI', system-ui, sans-serif;
    --display-font: 'Sitka Heading', 'Sitka Display', 'Sitka Text', Constantia, Georgia, serif;
    --brand-red: #e5393b; --ink-soft: rgba(24, 35, 46, 0.55);
  }
  [data-theme="museum"] body, body[data-theme="museum"] { letter-spacing: 0.01em; }
  /* Barre du haut */
  [data-theme="museum"] #top-bar-container { box-shadow: 0 1px 0 rgba(0, 0, 0, 0.25), 0 6px 18px rgba(24, 35, 46, 0.12) !important; }
  [data-theme="museum"] #menu-bar { height: 40px !important; border-bottom: none !important; padding: 0 14px !important; }
  [data-theme="museum"] .menu-btn { background: transparent; color: var(--text-topbar); border: 1px solid rgba(242, 238, 229, 0.22); box-shadow: none; font-weight: 600; letter-spacing: 0.03em; border-radius: 6px; }
  [data-theme="museum"] .menu-btn:hover { background: rgba(242, 238, 229, 0.1); border-color: rgba(242, 238, 229, 0.45); }
  [data-theme="museum"] .ribbon-tab { color: var(--text-topbar); opacity: 0.62; text-transform: uppercase; letter-spacing: 0.12em; font-size: 11.5px; font-weight: 600; border-bottom-width: 3px; padding: 0 16px; }
  [data-theme="museum"] .ribbon-tab:hover { opacity: 0.95; background: rgba(242, 238, 229, 0.06); }
  [data-theme="museum"] .ribbon-tab.active { opacity: 1; color: #ffffff; background: transparent; border-bottom-color: var(--brand-red); }
  [data-theme="museum"] #search-input { background: rgba(242, 238, 229, 0.08) !important; color: var(--text-topbar) !important; border: 1px solid rgba(242, 238, 229, 0.2) !important; border-radius: 6px !important; padding: 6px 10px !important; width: 200px !important; }
  [data-theme="museum"] #search-input::placeholder { color: rgba(242, 238, 229, 0.55); }
  [data-theme="museum"] #search-input:focus { background: rgba(242, 238, 229, 0.14) !important; border-color: rgba(242, 238, 229, 0.6) !important; }
  /* Ruban */
  [data-theme="museum"] .ribbon { background: #f7f4ec; border-bottom: 1px solid var(--border-color); box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7) inset; }
  [data-theme="museum"] .ribbon-group { border-right: 1px solid #e2dbcb; }
  [data-theme="museum"] .ribbon-group-title { font-size: 9.5px; letter-spacing: 0.16em; font-weight: 600; opacity: 0.5; margin-top: 9px; }
  [data-theme="museum"] .ribbon-btn { background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 6px; padding: 5px 11px; font-weight: 600; letter-spacing: 0.02em;
    box-shadow: 0 1px 0 rgba(24, 35, 46, 0.06); }
  [data-theme="museum"] .ribbon-btn:hover:not(:disabled) { background: #ffffff; border-color: rgba(24, 35, 46, 0.45); }
  [data-theme="museum"] .ribbon-btn.active { background: var(--bg-topbar); color: var(--text-topbar); border-color: var(--bg-topbar); }
  [data-theme="museum"] select, [data-theme="museum"] input[type="text"], [data-theme="museum"] input[type="number"], [data-theme="museum"] textarea { border-radius: 6px; }
  [data-theme="museum"] .ribbon-collapse { color: var(--ink-soft); }
  /* Menus, fenêtres */
  [data-theme="museum"] .dropdown-content, [data-theme="museum"] #context-menu { background: var(--bg-input) !important; border: 1px solid var(--border-color) !important; border-radius: 8px !important;
    box-shadow: 0 12px 32px rgba(24, 35, 46, 0.18) !important; padding: 5px !important; }
  [data-theme="museum"] .dropdown-item, [data-theme="museum"] .menu-item { border-radius: 5px; }
  [data-theme="museum"] #settings-modal, [data-theme="museum"] #compile-modal { border-radius: 10px !important; box-shadow: 0 24px 60px rgba(24, 35, 46, 0.28) !important; }
  [data-theme="museum"] .settings-title { font-family: var(--display-font); font-size: 17px; font-weight: 600; letter-spacing: 0.01em; }
  /* Fiche du taxon */
  [data-theme="museum"] #side-panel { background: #f7f4ec !important; box-shadow: -14px 0 34px rgba(24, 35, 46, 0.1) !important; }
  [data-theme="museum"] #panel-title { font-family: var(--display-font) !important; font-size: 27px; font-weight: 600; letter-spacing: 0.005em; border-bottom: 2px solid var(--bg-topbar) !important; }
  [data-theme="museum"] #side-panel label { font-size: 10.5px !important; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.72 !important; font-weight: 600 !important; }
  [data-theme="museum"] #side-panel input, [data-theme="museum"] #side-panel select, [data-theme="museum"] #side-panel textarea { border-radius: 6px !important; }
  /* Repères flottants */
  [data-theme="museum"] #breadcrumbs-bar { border-radius: 8px !important; background: var(--bg-input) !important; }
  [data-theme="museum"] #counter-bar { border-radius: 999px !important; padding: 4px 12px !important; letter-spacing: 0.04em; border-color: var(--bg-topbar) !important; }
  [data-theme="museum"] #sheets-bar { background: #f7f4ec !important; }
  /* Hub d'accueil */
  [data-theme="museum"] .hub-head { padding: 22px 40px; border-bottom: none; box-shadow: 0 6px 18px rgba(24, 35, 46, 0.12); }
  [data-theme="museum"] .hub-title { font-family: var(--display-font); color: var(--text-topbar); font-size: 34px; font-weight: 600; letter-spacing: 0.01em; }
  [data-theme="museum"] .hub-title::after { content: ''; display: block; width: 44px; height: 3px; margin-top: 8px; background: var(--brand-red); }
  [data-theme="museum"] .hub-h { letter-spacing: 0.2em; font-weight: 600; opacity: 0.55; }
  [data-theme="museum"] .hub-action { border-radius: 8px; box-shadow: 0 1px 0 rgba(24, 35, 46, 0.05); }
  [data-theme="museum"] .hub-action:hover { border-color: rgba(24, 35, 46, 0.5); box-shadow: 0 6px 16px rgba(24, 35, 46, 0.1); }
  [data-theme="museum"] .hub-action b { font-family: var(--display-font); font-size: 16px; font-weight: 600; letter-spacing: 0.005em; }
  [data-theme="museum"] .hub-tree-svg g.hl line { stroke: var(--brand-red); }
  [data-theme="museum"] .hub-card { border-radius: 10px; }
  [data-theme="museum"] .hub-card:hover { border-color: rgba(24, 35, 46, 0.5); box-shadow: 0 14px 30px rgba(24, 35, 46, 0.18); }
  [data-theme="museum"] .hub-card-name { font-family: var(--display-font); font-size: 15px; font-weight: 600; }
  [data-theme="museum"] .cl-toast { border-radius: 8px; }

  /* ---------- Figure d'aide : frise des temps géologiques (geo-chart.ts) ---------- */
  .gc-overlay { position: fixed; inset: 0; z-index: 9500; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); animation: cl-fade 160ms ease-out; }
  .gc-panel { width: min(1040px, 94vw); height: 90vh; display: flex; flex-direction: column; background: var(--bg-panel); color: var(--text-main);
    border: 1px solid var(--border-color); border-radius: var(--btn-radius); box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35); overflow: hidden; animation: cl-pop 180ms var(--ease-out); }
  .gc-head { display: flex; align-items: center; gap: 16px; padding: 14px 18px; background: var(--bg-topbar); color: var(--text-topbar); }
  .gc-title { font-family: var(--display-font, Georgia, serif); font-size: 19px; font-weight: bold; }
  .gc-sub { font-size: 11px; opacity: 0.7; margin-top: 2px; }
  .gc-search { margin-left: auto; width: 220px; padding: 6px 10px; border-radius: var(--btn-radius); }
  .gc-close { background: transparent; border: 1px solid transparent; color: var(--text-topbar); font-size: 16px; cursor: pointer; padding: 2px 8px; border-radius: var(--btn-radius); }
  .gc-close:hover { border-color: currentColor; }
  .gc-legend { display: flex; flex-wrap: wrap; gap: 6px 22px; padding: 8px 18px; font-size: 11.5px; border-bottom: 1px solid var(--border-color); }
  .gc-legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .gc-ico { width: 16px; height: 12px; vertical-align: middle; flex-shrink: 0; }
  .gc-clock { width: 13px; height: 13px; }
  .gc-none { display: inline-block; width: 16px; text-align: center; font-weight: bold; opacity: 0.6; }
  .gc-body { flex: 1; overflow: auto; padding: 0 18px 12px; }
  .gc-table { width: 100%; border-collapse: collapse; font-size: 12px; table-layout: fixed; }
  .gc-table th { position: sticky; top: 0; z-index: 2; background: var(--bg-panel); text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em;
    padding: 10px 6px 6px; border-bottom: 2px solid var(--text-main); }
  .gc-table th:nth-child(1), .gc-table th:nth-child(2) { width: 46px; }
  .gc-table th:nth-child(3) { width: 17%; } .gc-table th:nth-child(4) { width: 20%; }
  .gc-table th:nth-child(6) { width: 132px; } .gc-table th:nth-child(7) { width: 28px; }
  .gc-table td { border: 1px solid rgba(0, 0, 0, 0.28); padding: 3px 7px; height: 20px; }
  .gc-unit { cursor: pointer; transition: filter 120ms ease-out, box-shadow 120ms ease-out; }
  .gc-unit:hover { filter: brightness(1.06) saturate(1.1); }
  .gc-unit.gc-sel { box-shadow: inset 0 0 0 3px var(--accent); }
  .gc-period { font-weight: bold; }
  .gc-eon, .gc-era { font-weight: bold; text-align: center; }
  /* Nom des unités qui couvrent beaucoup de lignes : en haut de la cellule et collé sous l'en-tête au défilement. */
  .gc-unit { vertical-align: top; }
  .gc-unit[rowspan="1"] { vertical-align: middle; }
  .gc-unit > span { position: sticky; top: 36px; display: inline-block; padding: 3px 0; }
  .gc-vertical > span { writing-mode: vertical-rl; transform: rotate(180deg); white-space: nowrap; letter-spacing: 0.04em; }
  .gc-age { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; background: var(--bg-input); color: var(--text-input); }
  .gc-err { opacity: 0.6; font-size: 10.5px; }
  .gc-mark { text-align: center; background: var(--bg-input); color: var(--text-input); }
  .gc-present td { border: none; height: auto; padding: 4px 7px 2px; font-size: 10.5px; opacity: 0.7; background: transparent; }
  .gc-sep td { border: none; padding: 16px 0 6px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: bold; opacity: 0.7; background: transparent; }
  .gc-foot { display: flex; align-items: center; gap: 16px; padding: 10px 18px; border-top: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-input); min-height: 44px; }
  .gc-detail { flex: 1; font-size: 12px; line-height: 1.5; }
  .gc-chain { opacity: 0.65; }
  .gc-show { padding: 7px 14px; cursor: pointer; background: var(--accent); color: #fff; border: none; border-radius: var(--btn-radius); font-weight: bold; }
  .gc-show:disabled { opacity: 0.45; cursor: not-allowed; }

  /* ---------- Notifications discrètes ---------- */
  #toast-stack { position: fixed; right: 18px; bottom: 46px; z-index: 10040; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
  .cl-toast { pointer-events: auto; max-width: 420px; padding: 9px 14px; font-size: 12px; line-height: 1.4; background: var(--bg-topbar); color: var(--text-topbar);
    border: 1px solid var(--border-color); border-left: 4px solid #4CAF50; border-radius: var(--btn-radius); box-shadow: var(--panel-shadow);
    animation: cl-rise 200ms var(--ease-out) both; transition: opacity 220ms ease-out, transform 220ms ease-out; word-break: break-word; }
  .cl-toast.cl-toast-info { border-left-color: var(--accent); }
  .cl-toast.cl-toast-out { opacity: 0; transform: translateY(4px); }
  .cl-toast small { display: block; opacity: 0.7; margin-top: 2px; font-size: 11px; }

  /* ---------- Fiche : taxon terminal précédent / suivant (fiche-nav.ts) ---------- */
  .fiche-nav-btn { transition: border-color 120ms ease-out, color 120ms ease-out; }
  .fiche-nav-btn:not(:disabled):hover { border-color: #2196F3 !important; color: #2196F3 !important; }
  .fiche-nav-btn:disabled { opacity: 0.35; cursor: default !important; }
`;

/**
 * Notification non bloquante (coin inférieur droit), effacée seule. Pour les confirmations de réussite
 * (enregistrement, export) : les erreurs restent des alertes, qu'on ne doit pas manquer.
 */
export const toast = (message: string, detail = '', kind: 'success' | 'info' = 'success', ms = 3200) => {
    let stack = document.getElementById('toast-stack');
    if (!stack) { stack = document.createElement('div'); stack.id = 'toast-stack'; document.body.appendChild(stack); }
    const el = document.createElement('div');
    el.className = 'cl-toast' + (kind === 'info' ? ' cl-toast-info' : '');
    el.setAttribute('role', 'status');
    el.textContent = message;
    if (detail) { const s = document.createElement('small'); s.textContent = detail; el.appendChild(s); }
    stack.appendChild(el);
    const close = () => { el.classList.add('cl-toast-out'); window.setTimeout(() => el.remove(), 240); };
    el.addEventListener('click', close);
    window.setTimeout(close, ms);
};
