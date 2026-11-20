// ui.ts
import { VISUAL_CSS } from './visual';
import { APP_CSS, getWelcomeHTML, CREDITS_HTML, CONTEXT_MENU_HTML, COMPILE_MODAL_HTML, TABLE_MODAL_HTML, TAXONOMIC_RANKS } from './utils';
import { GEOLOGICAL_PERIODS, PRECAMBRIAN_EONS, PHANEROZOIC_TIMELINE_MAX, EARTH_AGE } from './chrono-data';
import { t, currentLang, LANGS, LANG_NAMES, colonSep } from './i18n';

// Version reelle du paquet, transmise par le processus principal.
const APP_VERSION = (window as any).electronAPI?.appVersion || '';

export const initUI = (logoPT: string, logoNormal: string, logoPeigne: string, logoChrono: string) => {  const styleSheet = document.createElement('style');
  styleSheet.innerText = APP_CSS + `
    .menu-btn { padding: 6px 12px; cursor: pointer; border: 1px solid var(--border-color); background: var(--bg-input); color: var(--text-main); font-size: 13px; font-weight: bold; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: all 0.2s; }
    .menu-btn:hover { background: var(--bg-hover); border-color: #2196F3; }
    .dropdown { position: relative; display: inline-block; }
    .dropdown-content { display: none; position: absolute; background-color: var(--bg-panel); min-width: 180px; box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2); z-index: 2000; border: 1px solid var(--border-color); border-radius: 4px; top: 100%; left: 0; }
    .dropdown:hover .dropdown-content,
    .dropdown:focus-within .dropdown-content { display: block; }
    .dropdown-item { padding: 8px 12px; cursor: pointer; display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: var(--text-main); }
    .dropdown-item:hover { background-color: var(--bg-hover); }
    .ribbon-group { display: flex; flex-direction: column; border-right: 1px solid var(--border-color); padding-right: 20px; }
    .ribbon-group-title { font-size: 10px; opacity: 0.6; text-transform: uppercase; text-align: center; margin-top: 8px; font-weight: bold; letter-spacing: 1px; }
    .ribbon-row { display: flex; gap: 8px; align-items: center; }

    /* Icônes des modes inactifs (Disposition) : dessinées en noir, éclaircies sur les thèmes à fond sombre */
    [data-theme="dark"], [data-theme="dimmed"], [data-theme="console"], [data-theme="high-contrast"] { --layout-icon-filter: invert(1) brightness(1.6); }

    /* Onglets (phase 2) : même palette que le reste de l'interface, accent #2196F3 */
    .ribbon-tabs { display: flex; align-items: stretch; align-self: stretch; margin-left: 6px; }
    .ribbon-tab { padding: 0 14px; font-size: 13px; font-weight: bold; color: var(--text-main); background: transparent; border: none; border-bottom: 2px solid transparent; cursor: pointer; opacity: 0.75; transition: all 0.2s; }
    .ribbon-tab:hover { opacity: 1; background: var(--bg-hover); }
    .ribbon-tab.active { opacity: 1; color: #2196F3; border-bottom-color: #2196F3; background: var(--bg-panel); }
    .ribbon { position: relative; background: var(--bg-panel); border-bottom: 1px solid var(--border-color); box-shadow: inset 0 4px 6px rgba(0,0,0,0.02); }
    /* Hauteur constante : pas de retour à la ligne ; défilement horizontal si la fenêtre est trop étroite. */
    .ribbon-panel { padding: 10px 50px 10px 20px; gap: 18px; align-items: flex-start; flex-wrap: nowrap; overflow-x: auto; font-size: 12px; }
    .ribbon-group { flex-shrink: 0; }
    .ribbon-panel::after { content: ''; flex: 0 0 24px; } /* marge de fin réelle (le padding est ignoré en défilement), sous le bouton ▲ */
    .ribbon-btn { padding: 4px 10px; cursor: pointer; background: var(--bg-input); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 4px; font-size: 12px; font-weight: bold; transition: all 0.2s; white-space: nowrap; }
    .ribbon-btn:hover:not(:disabled) { background: var(--bg-hover); border-color: #2196F3; }
    .ribbon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .ribbon-btn.active { background: rgba(33, 150, 243, 0.15); color: #2196F3; border-color: #2196F3; }
    .ribbon-collapse { position: absolute; top: 8px; right: 14px; background: transparent; border: none; color: var(--text-main); cursor: pointer; font-size: 12px; opacity: 0.5; transition: opacity 0.2s; }
    .ribbon-collapse:hover { opacity: 1; }
    
    .settings-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .settings-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .settings-title { font-size: 14px; font-weight: bold; margin: 0 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); }
  ` + VISUAL_CSS;
  document.head.appendChild(styleSheet);
  document.body.setAttribute('data-theme', 'light');

  const rankOptions = TAXONOMIC_RANKS.map(r => `<option value="${r}">${t('rank.' + r) !== ('rank.' + r) ? t('rank.' + r) : r}</option>`).join('');
  
  const statusOptions = ['Valide', 'Incertae sedis', 'Nomen dubium', 'Nomen nudum', 'Nomen oblitum', 'Nomen rejectum', 'Synonyme']
    .map(r => {
        const transKey = r === 'Valide' ? 'status.valid' : r === 'Synonyme' ? 'status.synonym' : r;
        const display = (transKey === r) ? r : t(transKey);
        return `<option value="${r}">${display}</option>`;
    }).join('');

  const uiHTML = `
    ${getWelcomeHTML(APP_VERSION, { standard: logoNormal, comb: logoPeigne, chrono: logoChrono })}
    
    <div id="credits-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.7); display:none; justify-content:center; align-items:center; z-index:9998; backdrop-filter:blur(4px);">
      ${CREDITS_HTML}
    </div>

    <div id="top-bar-container" style="position:absolute; top:0; left:0; right:0; z-index:1005; display:flex; flex-direction:column; box-shadow:0 2px 5px rgba(0,0,0,0.1);">
        
        <div id="menu-bar" style="display:flex; background:var(--bg-topbar); padding:0 10px; height:35px; align-items:center; border-bottom:1px solid var(--border-color); gap: 5px;">
            
            <div class="dropdown">
                <button class="menu-btn" id="lbl-topbar-file">${t('topbar.file')}</button>
                <div class="dropdown-content">
                    <div class="dropdown-item" id="btn-new">${t('topbar.file.new')}</div>
                    <div class="dropdown-item" id="btn-new-window">${t('topbar.file.new_window')}</div>
                    <div class="dropdown-item" id="btn-hub">${t('hub.menu')}</div>
                    <div class="dropdown-item" id="btn-load">${t('topbar.file.open')}</div>
                    <div class="dropdown-item" id="btn-save" style="color: #4CAF50; font-weight: bold;">${t('topbar.file.save')}</div>
                    <div class="dropdown-item" id="btn-save-as">${t('topbar.file.saveas')}</div>
                    <div class="dropdown-item" id="btn-save-legacy" title="${t('topbar.file.save_legacy_title')}">${t('topbar.file.save_legacy')}</div>
                    <div style="border-top:1px solid var(--border-color); margin: 4px 0;"></div>
                    <div style="padding: 8px 12px; display:flex; flex-direction:column; gap:5px;">
                        <span id="lbl-topbar-export" style="font-size:12px; opacity:0.8;">${t('topbar.file.export')}</span>
                        <div style="display:flex; flex-direction:column; gap:5px;">
                            <div style="display:flex; gap:5px;">
                                <select id="export-select" style="padding:4px; font-size:11px; flex:1; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);" title="${t('export.format')}">
                                    <option value="png">PNG</option><option value="jpeg">JPEG</option><option value="svg">SVG</option><option value="pdf">PDF</option><option value="nwk">Newick</option><option value="nex">NEXUS</option>
                                </select>
                                <select id="export-scale-select" style="padding:4px; font-size:11px; flex:1; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);" title="${t('export.resolution')}">
                                    <option value="1">${t('export.res.low')}</option>
                                    <option value="2">${t('export.res.med')}</option>
                                    <option value="3" selected>${t('export.res.high')}</option>
                                </select>
                            </div>
                            <label id="export-transparent-row" style="display:flex; align-items:center; gap:6px; font-size:11px; cursor:pointer; user-select:none;" title="${t('export.opaque_only')}">
                                <input type="checkbox" id="export-transparent" checked style="margin:0; cursor:pointer;">
                                <span id="lbl-export-transparent">${t('export.transparent')}</span>
                            </label>
                            <button id="btn-export" style="padding:4px; cursor:pointer; background:#2196F3; color:white; border:none; border-radius:3px; font-size:11px; width:100%;">Go</button>
                        </div>
                    </div>
                </div>
            </div>





            <div class="ribbon-tabs" role="tablist">
                <button class="ribbon-tab" id="tab-style" data-tab="style" role="tab">${t('tab.style')}</button>
                <button class="ribbon-tab" id="tab-display" data-tab="display" role="tab">${t('tab.display')}</button>
                <button class="ribbon-tab" id="tab-tree" data-tab="tree" role="tab">${t('tab.tree')}</button>
                <button class="ribbon-tab" id="tab-help" data-tab="help" role="tab">${t('tab.help')}</button>
            </div>

            <div style="position:relative; margin-left:auto; display:flex; align-items:center; gap:10px;">
                <input type="text" id="search-input" placeholder="${t('search.placeholder')}" style="padding:4px 8px; width:180px; font-size:12px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);">
                <div id="search-dropdown" style="position:absolute; top:100%; right:0; width:100%; max-height:250px; overflow-y:auto; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); box-shadow:var(--panel-shadow); display:none; z-index:2000;"></div>
                <input type="file" id="file-input" accept=".json,.phylo,.xmind,.nwk,.newick,.tre,.tree,.nex,.nexus,.tnt" style="display:none;">
            </div>
        </div>

        <div id="ribbon" class="ribbon" style="display:none;">
        <div id="style-ribbon" class="ribbon-panel" data-panel="style" style="display:none;">
            
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <select id="style-font" style="padding:4px; width:110px; border:1px solid var(--border-color);"><option value="serif">Serif</option><option value="sans-serif">Sans-Serif</option><option value="monospace">Monospace</option></select>
                    <input type="number" id="style-size" style="padding:4px; width:50px; border:1px solid var(--border-color);" min="8" max="72" value="16">
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <button id="style-bold" style="padding:4px 10px; font-weight:bold; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:3px;">${t('style.bold')}</button>
                    <button id="style-italic" style="padding:4px 10px; font-style:italic; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:3px;">${t('style.italic')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-style-text">${t('style.text')}</div>
            </div>

            <div class="ribbon-group" id="style-node-frame-section">
                <div class="ribbon-row" style="flex-direction:column; align-items:flex-start; gap:6px;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="style-node-frame"> <span id="lbl-style-frame">${t('style.node_frame')}</span></label>
                    <input type="color" id="style-node-frame-color" value="#000000" style="width:100%; height:20px; padding:0; border:none; cursor:pointer;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="style-text-above"> <span id="lbl-style-text-above">${t('style.text_above')}</span></label>
                </div>
                <div class="ribbon-group-title" id="lbl-style-outline">${t('style.outline')}</div>
            </div>

            <div class="ribbon-group" id="style-box-section" style="display:none; border-right:2px dashed #2196F3;">
                <div class="ribbon-row">
                    <input type="color" id="style-box-color" value="#FF9800" style="width:30px; height:30px; padding:0; border:none; cursor:pointer;">
                    <input type="text" id="style-box-name" placeholder="${t('style.box_name')}" style="width:140px; padding:4px; border:1px solid var(--border-color);">
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <select id="style-box-shape" style="padding:4px; width:85px; border:1px solid var(--border-color);">
                        <option value="round-rectangle">${t('style.box_shape.round')}</option>
                        <option value="rectangle">${t('style.box_shape.rect')}</option>
                        <option value="bracket">${t('style.box_shape.bracket')}</option>
                    </select>
                    <select id="style-box-border-style" style="padding:4px; width:65px; border:1px solid var(--border-color);"><option value="dashed">${t('style.border_dashed')}</option><option value="solid">${t('style.border_solid')}</option><option value="dotted">${t('style.border_dotted')}</option></select>
                    <input type="number" id="style-box-border-width" value="2" min="0" max="10" style="width:40px; padding:4px; border:1px solid var(--border-color);" title="${t('style.thickness')}">
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <span id="lbl-style-opacity">${t('style.opacity')}</span> <input type="range" id="style-box-opacity" min="0" max="100" value="10" style="width:60px;">
                    <label style="display:flex; align-items:center; gap:3px; cursor:pointer;"><input type="checkbox" id="style-box-vertical"> <span id="lbl-style-box-90">${t('style.box_90')}</span></label>
                    <label style="display:flex; align-items:center; gap:3px; cursor:pointer;"><input type="checkbox" id="style-box-gradient"> <span id="lbl-style-box-gradient">${t('style.box_gradient')}</span></label>
                </div>
                <div class="ribbon-group-title" style="color:#2196F3;" id="lbl-style-box-group">${t('style.box_group')}</div>
            </div>

            <div class="ribbon-group" id="style-img-section">
                <div class="ribbon-row">
                    <input type="file" id="style-img-file" accept="image/*" style="width:160px; font-size:11px;">
                    <button id="style-img-clear" style="padding:2px 6px; color:#d32f2f; background:transparent; border:1px solid #d32f2f; border-radius:3px; cursor:pointer;">&#10006;</button>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <select id="style-img-pos" style="padding:4px; border:1px solid var(--border-color);"><option value="left">${t('style.pos_left')}</option><option value="right">${t('style.pos_right')}</option><option value="top">${t('style.pos_top')}</option><option value="bottom">${t('style.pos_bottom')}</option></select>
                    <span id="lbl-style-img-size">${t('style.size')}</span> <input type="number" id="style-img-size" style="width:50px; padding:4px; border:1px solid var(--border-color);" value="150"> px
                </div>
                <div class="ribbon-group-title" id="lbl-style-picto">${t('style.picto')}</div>
            </div>
            <div class="ribbon-group" id="style-highlight-section">
                <div class="ribbon-row">
                    <input type="color" id="style-highlight-color" value="#FFF176" style="width:30px; height:24px; padding:0; border:none; cursor:pointer;" title="${t('highlight.color')}">
                    <button class="ribbon-btn" id="style-highlight-apply" title="${t('highlight.apply_title')}">${t('highlight.apply')}</button>
                    <button class="ribbon-btn" id="style-highlight-clear" title="${t('highlight.clear')}">&#10006;</button>
                </div>
                <div class="ribbon-group-title" id="lbl-style-highlight">${t('highlight.group')}</div>
            </div>
            <div class="ribbon-group" id="style-brush-section">
                <div class="ribbon-row">
                    <input type="color" id="style-brush-color" value="#E53935" style="width:30px; height:24px; padding:0; border:none; cursor:pointer;" title="${t('brush.color')}">
                    <select id="style-brush-width" style="padding:4px; border:1px solid var(--border-color);" title="${t('style.thickness')}">
                        <option value="2">2 px</option><option value="3">3 px</option><option value="4" selected>4 px</option><option value="6">6 px</option>
                    </select>
                    <button class="ribbon-btn" id="style-brush-toggle" title="${t('brush.mode_title')}">&#128396; ${t('brush.mode')}</button>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <button class="ribbon-btn" id="style-brush-selection">${t('brush.paint_selection')}</button>
                    <button class="ribbon-btn" id="style-brush-clear">${t('brush.clear')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-style-brush">${t('brush.group')}</div>
            </div>
            
        </div>

        <div id="ribbon-display" class="ribbon-panel" data-panel="display" style="display:none;">
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="btn-recenter">${t('topbar.view.recenter')}</button>
                    <button class="ribbon-btn" id="btn-center-root">${t('topbar.view.center_root')}</button>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <button class="ribbon-btn" id="btn-expand-all">${t('topbar.view.expand')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-camera">${t('ribbon.grp.camera')}</div>
            </div>
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="btn-toggle-abbrev">Noms complets</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-names">${t('ribbon.grp.names')}</div>
            </div>
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <select id="set-theme" style="padding:4px; font-size:12px;">
                    <option value="museum">${t('theme.museum')}</option>
                    <option value="light">${t('theme.light')}</option>
                    <option value="dark">${t('theme.dark')}</option>
                    <option value="sepia">${t('theme.sepia')}</option>
                    <option value="ingen">${t('theme.ingen')}</option>
                    <option value="console">${t('theme.console')}</option>
                    <option value="high-contrast">${t('theme.highcontrast')}</option>
                    <option value="dimmed">${t('theme.dimmed')}</option>
                    </select>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-canvas-bg"> <span id="lbl-settings-canvasbg">${t('settings.canvas_bg')}</span>
                    </label>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-theme">${t('ribbon.grp.theme')}</div>
            </div>
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="btn-settings" title="${t('settings.title')}">&#9881; ${t('ribbon.settings')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-settings">${t('ribbon.grp.settings')}</div>
            </div>
        </div>

        <div id="ribbon-tree" class="ribbon-panel" data-panel="tree" style="display:none;">
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <div style="display:flex; flex-shrink:0; align-items:center; border:1px solid var(--border-color); border-radius:3px; overflow:hidden; box-shadow:var(--panel-shadow);">
                    <button id="btn-layout-normal" title="${t('layout.standard')}" style="padding:4px 8px; cursor:pointer; background:#2196F3; border:none; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    <img src="${logoNormal}" style="height:14px; width:14px; filter:invert(1) brightness(2);">
                    </button>
                    <button id="btn-layout-comb" title="${t('layout.comb')}" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); border:none; border-left:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    <img src="${logoPeigne}" style="height:14px; width:14px; filter:var(--layout-icon-filter, none);">
                    </button>
                    <button id="btn-layout-chrono" title="${t('layout.chrono')}" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); border:none; border-left:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    <img src="${logoChrono}" style="height:14px; width:14px; filter:var(--layout-icon-filter, none);">
                    </button>
                    </div>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-layout">${t('ribbon.grp.layout')}</div>
            </div>
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="tree-divergence-toggle" title="${t('divergence.mode_title')}">&#8660; ${t('divergence.mode')}</button>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <button class="ribbon-btn" id="tree-divergence-reset" title="${t('divergence.reset_title')}">${t('divergence.reset')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-divergence">${t('divergence.group')}</div>
            </div>
            <div class="ribbon-group" id="chrono-tools" style="display:none;">
                <div class="ribbon-row">
                    <select id="chrono-axis-select" title="${t('chrono.axis.title')}" style="padding:3px 6px; font-size:12px; border-radius:3px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input); cursor:pointer;">
                    <option value="linear">${t('chrono.axis.linear')}</option>
                    <option value="sqrt">${t('chrono.axis.sqrt')}</option>
                    <option value="log">${t('chrono.axis.log')}</option>
                    <option value="rank">${t('chrono.axis.rank')}</option>
                    </select>
                    <button id="btn-chrono-bounds" title="${t('chrono.bounds.title')}" style="padding:4px 10px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; font-size:12px; font-weight:bold; transition:all 0.2s; white-space:nowrap;">${t('chrono.bounds.period')}</button>
                    <button class="ribbon-btn" id="btn-geo-chart-chrono" title="${t('geochart.button_title')}">${t('geochart.button')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-chrono">${t('ribbon.grp.chrono')}</div>
            </div>
            <div class="ribbon-group" id="romer-tools" style="display:none;">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="romer-toggle" title="${t('romer.title')}">&#10023; ${t('romer.toggle')}</button>
                    <button class="ribbon-btn" id="romer-pick" title="${t('romer.pick_title')}">&#9998; ${t('romer.pick')}</button>
                    <button class="ribbon-btn" id="romer-layout" title="${t('romer.layout_title')}">${t('romer.layout')} &#9662;</button>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <select id="romer-depth" title="${t('romer.depth_title')}" style="padding:3px 6px; font-size:12px; border-radius:3px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);">
                        <option value="1">${t('romer.depth')} 1</option><option value="2">${t('romer.depth')} 2</option><option value="3">${t('romer.depth')} 3</option><option value="0">${t('romer.depth_chosen')}</option>
                    </select>
                    <select id="romer-step" title="${t('romer.step_title')}" style="padding:3px 6px; font-size:12px; border-radius:3px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);">
                        <option value="0">${t('romer.step_auto')}</option><option value="1">1 Ma</option><option value="5">5 Ma</option><option value="10">10 Ma</option><option value="25">25 Ma</option>
                    </select>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-romer">${t('romer.group')}</div>
            </div>
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="ribbon-graft" data-needs="one">${t('menu.graft')}</button>
                    <button class="ribbon-btn" id="ribbon-sheet-new" data-needs="one">${t('menu.sheet_new')}</button>
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <button class="ribbon-btn" id="ribbon-box-add" data-needs="some">${t('menu.box_add')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-selection">${t('ribbon.grp.selection')}</div>
            </div>
        </div>

        <div id="ribbon-help" class="ribbon-panel" data-panel="help" style="display:none;">
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="btn-guide">${t('topbar.help.guide')}</button>
                    <button class="ribbon-btn" id="btn-shortcuts">${t('topbar.help.shortcuts')}</button>
                    <button class="ribbon-btn" id="btn-geo-chart" title="${t('geochart.button_title')}">${t('geochart.button')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-docs">${t('ribbon.grp.docs')}</div>
            </div>
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <button class="ribbon-btn" id="btn-patch">${t('topbar.help.patch')}</button>
                    <button class="ribbon-btn" id="btn-check-update">${t('topbar.help.update')}</button>
                    <button class="ribbon-btn" id="btn-credits">${t('topbar.help.credits')}</button>
                </div>
                <div class="ribbon-group-title" id="lbl-ribbon-about">${t('ribbon.grp.about')}</div>
            </div>
        </div>

        <button id="btn-collapse-ribbon" class="ribbon-collapse" title="${t('ribbon.collapse')}">&#9650;</button>
        </div>
    </div>

    <div id="breadcrumbs-bar" style="position:absolute; top:calc(var(--topbar-h, 36px) + 9px); left:15px; z-index:1001; font-size:12px; background:var(--bg-panel); color:var(--text-main); padding:6px 12px; border:1px solid var(--border-color); box-shadow:var(--panel-shadow); display:flex; gap:8px; border-radius:var(--btn-radius); opacity:0.95;"></div>
    
    <div id="sheets-bar" style="position:absolute; bottom:0; left:0; right:0; height:45px; background:var(--bg-panel); color:var(--text-main); border-top:1px solid var(--border-color); z-index:600; display:flex; align-items:center; padding:0 15px; gap:8px;"></div>
    <div id="counter-bar" style="position:absolute; bottom:6px; right:15px; z-index:1002; font-size:11px; background:var(--bg-topbar); color:var(--text-topbar); padding:4px 8px; border:1px solid var(--border-color); box-shadow:var(--panel-shadow); border-radius:var(--btn-radius); opacity:0.9; pointer-events:none; font-weight:bold;"></div>

    <div id="context-menu" style="position:absolute; display:none; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); padding:4px 0; box-shadow:var(--panel-shadow); z-index:1100; font-size:12px; border-radius:var(--btn-radius);">
        ${CONTEXT_MENU_HTML}
    </div>

    <div id="compile-modal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--bg-panel); color:var(--text-main); padding:20px; border:1px solid var(--border-color); box-shadow:var(--panel-shadow); z-index:2000; flex-direction:column; gap:15px; width:300px; border-radius:var(--btn-radius);">
        ${COMPILE_MODAL_HTML}
    </div>
    <div id="table-modal" style="display:none; position:fixed; top:45px; left:5%; width:90%; height:calc(100% - 80px); background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); box-shadow:var(--panel-shadow); z-index:2100; flex-direction:column; border-radius:var(--btn-radius);">
        ${TABLE_MODAL_HTML}
    </div>

    <div id="settings-modal" style="display:none; position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:var(--bg-panel); color:var(--text-main); padding:25px; border:1px solid var(--border-color); box-shadow:0 10px 40px rgba(0,0,0,0.5); z-index:3000; width:450px; max-height:85vh; overflow-y:auto; border-radius:var(--btn-radius); flex-direction:column;">
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px; margin-bottom:20px;">
            <h2 id="lbl-settings-title" style="margin:0; font-size:18px;">${t('settings.title')}</h2>
            <button id="btn-close-settings" style="background:transparent; border:none; color:var(--text-main); cursor:pointer; font-size:16px; opacity:0.7;">&#10006;</button>
        </div>
        
        <div class="settings-section">
            <h3 class="settings-title" id="lbl-settings-display" style="color:#2196F3;">${t('settings.sec_display')}</h3>
            <div class="settings-row">
                <span id="lbl-settings-lang">${t('settings.lang')}</span>
                <select id="set-lang" style="padding:4px; font-size:12px;">
                    ${LANGS.map(l => `<option value="${l}" ${currentLang === l ? 'selected' : ''}>${LANG_NAMES[l]}</option>`).join('')}
                </select>
            </div>
            <div class="settings-row">
                <span id="lbl-settings-wallpaper">Fond d'écran</span>
                <div style="display:flex; flex-direction:column; gap:5px; align-items:flex-end;">
                    <div style="display:flex; gap:5px; align-items:center;">
                        <input type="file" id="set-wallpaper-file" accept="image/png, image/jpeg, image/webp" style="display:none;">
                        <button id="btn-upload-wallpaper" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:3px;">Choisir...</button>
                        <button id="btn-clear-wallpaper" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); color:#d32f2f; border:1px solid #d32f2f; border-radius:3px; display:none;">X</button>
                    </div>
                    <div id="container-wallpaper-opacity" style="display:none; align-items:center; gap:5px; font-size:10px;">
                        Opacité: <input type="range" id="set-wallpaper-opacity" min="5" max="100" value="100" style="width:80px;">
                    </div>
                </div>
            </div>
            <div class="settings-row">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-auto-update"> <span id="lbl-settings-autoupdate">${t('settings.auto_update')}</span>
                </label>
            </div>
            <div class="settings-row">
                <span id="lbl-settings-layout">${t('settings.layout')}</span>
                <select id="set-layout" style="padding:4px; font-size:12px;">
                    <option value="standard">${t('layout.standard')}</option>
                    <option value="comb">${t('layout.comb')}</option>
                </select>
            </div>
        </div>
        
        <div class="settings-section">
            <h3 class="settings-title" id="lbl-settings-behavior" style="color:#4CAF50;">${t('settings.sec_behavior')}</h3>
            <div class="settings-row">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-smart-tax"> <span id="lbl-settings-smarttax">${t('settings.smart_tax')}</span>
                </label>
            </div>
            <div class="settings-row">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-auto-italic"> <span id="lbl-settings-autoitalic">${t('settings.auto_italic')}</span>
                </label>
            </div>
            <div class="settings-row">
                <span id="lbl-settings-zoomsens">${t('settings.zoom_sens')}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span id="lbl-settings-zoomsoft" style="font-size:10px; opacity:0.7;">${t('settings.zoom_soft')}</span>
                    <input type="range" id="set-zoom-sens" min="1" max="10" value="5" style="width:100px;">
                    <span id="lbl-settings-zoomhard" style="font-size:10px; opacity:0.7;">${t('settings.zoom_hard')}</span>
                </div>
            </div>
        </div>

        <div class="settings-section">
            <h3 class="settings-title" id="lbl-settings-export" style="color:#FF9800;">${t('settings.sec_export')}</h3>
            <div class="settings-row">
                <span id="lbl-settings-fichecolor">${t('settings.fiche_color')}</span>
                <input type="color" id="set-fiche-color" value="#4CAF50" style="padding:0; border:none; cursor:pointer; height:25px; width:40px;">
            </div>
            <div class="settings-row">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-pdf-timeline"> <span id="lbl-settings-pdftimeline">${t('settings.pdf_timeline')}</span>
                </label>
            </div>
            <div class="settings-row">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-indicator-fiche"> <span id="lbl-settings-fiche-indicator">${t('settings.fiche_indicator')}</span>
                </label>
            </div>
        </div>

        <div class="settings-section" style="margin-bottom:0;">
            <h3 class="settings-title" id="lbl-settings-data" style="color:#d32f2f;">${t('settings.sec_data')}</h3>
            <div class="settings-row" style="margin-bottom:12px;">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-count-invalid"> <span id="lbl-settings-count-invalid">${t('settings.count_invalid')}</span>
                </label>
            </div>
            <div style="display:flex; gap:10px;">
                <button id="btn-clear-history" style="flex:1; padding:8px; background:#d32f2f; color:white; border:none; border-radius:3px; cursor:pointer; font-weight:bold;">${t('settings.clear_history')}</button>
                <button id="btn-reset-settings" style="flex:1; padding:8px; background:var(--bg-hover); color:var(--text-main); border:1px solid var(--border-color); border-radius:3px; cursor:pointer;">${t('settings.reset_settings')}</button>
            </div>
        </div>
    </div>

    <div id="side-panel" style="position:absolute; top:var(--topbar-h, 36px); right:0; width:400px; height:calc(100vh - var(--topbar-h, 36px)); background:var(--bg-panel); color:var(--text-main); border-left:1px solid var(--border-color); padding:20px; box-shadow:-2px 0 10px rgba(0,0,0,0.1); display:block; transform:translateX(100%); z-index:1200; box-sizing:border-box; overflow-y:auto; transition:transform 0.3s ease-in-out; font-size:14px;">
        <span id="btn-close-cross" style="position:absolute; top:15px; right:20px; cursor:pointer; font-size:16px; color:var(--text-main); font-weight:bold; line-height:1; opacity:0.7;">&#10006;</span>
        <div id="fiche-nav" style="position:absolute; top:10px; right:46px; display:flex; gap:4px;"><button id="fiche-prev" class="fiche-nav-btn" title="${t('fiche.prev')}" style="width:28px; height:24px; padding:0; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:15px; line-height:1;">&#8592;</button><button id="fiche-next" class="fiche-nav-btn" title="${t('fiche.next')}" style="width:28px; height:24px; padding:0; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:15px; line-height:1;">&#8594;</button></div>
        <h2 id="panel-title" style="margin-top:0; margin-right:110px; font-family:serif; border-bottom:2px solid var(--border-color); padding-bottom:10px;"></h2>
        <div id="panel-subtitle-synonym" style="display:none; cursor:pointer; color:#2196F3; font-style:italic; margin-bottom:15px; font-size:14px; font-weight:bold;" title="${t('title.go_to_valid')}"></div>
        <div id="sheet-classification" style="display:none; margin-bottom:15px; padding:8px 10px; border:1px solid #2196F3; border-radius:var(--btn-radius); background:rgba(33, 150, 243, 0.06);">
            <label id="lbl-sheet-classification" style="display:block; font-weight:bold; font-size:13px; margin-bottom:5px; color:#2196F3;">${t('variant.title')}</label>
            <div style="display:flex; gap:5px;">
                <select id="sheet-variant-select" style="flex:1; padding:5px; font-size:13px; cursor:pointer;"></select>
                <input type="text" id="sheet-variant-name" style="flex:1; padding:5px; font-size:13px; display:none;">
                <button id="sheet-variant-rename" title="${t('variant.rename')}" style="padding:5px 8px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px;">&#9998;</button>
                <button id="sheet-variant-delete" title="${t('variant.delete')}" style="padding:5px 8px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px; color:#d32f2f;">&#10006;</button>
            </div>
            <button id="sheet-variant-add" style="padding:5px 8px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px; width:100%; margin-top:6px; font-weight:bold;">+ ${t('variant.add')}</button>
            <div id="sheet-variant-warning" style="display:none; font-size:11px; color:#e65100; margin-top:5px;"></div>
            <div id="lbl-sheet-variant-note" style="font-size:11px; opacity:0.75; margin-top:5px;">${t('variant.note')}</div>
        </div>
        
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-status" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.status')}${colonSep()}</label>
            <select id="inp-status" style="width:100%; padding:6px; box-sizing:border-box; cursor:pointer; font-size:13px;">${statusOptions}</select>
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-rank" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.rank')}${colonSep()}</label>
            <select id="inp-rank" style="width:100%; padding:6px; box-sizing:border-box; cursor:pointer; font-size:13px;">${rankOptions}</select>
        </div>
        <div id="container-synonym" style="margin-bottom: 12px; flex-direction:column; position:relative; display:none;">
            <label id="lbl-side-synonym" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.synonym_of')}${colonSep()}</label>
            <div style="display:flex; align-items:center;">
                <span style="margin-right:5px; font-weight:bold; color:var(--text-main);"> = </span>
                <input type="text" id="inp-synonymTarget" autocomplete="off" placeholder="${t('placeholder.synonym_target')}" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
            </div>
            <div id="synonym-dropdown" style="position:absolute; top:100%; left:15px; right:0; max-height:150px; overflow-y:auto; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); box-shadow:var(--panel-shadow); display:none; z-index:2000;"></div>
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-date" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.date')}${colonSep()}</label>
            <input type="text" id="inp-discoveryDate" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-author" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.author')}${colonSep()}</label>
            <input type="text" id="inp-author" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-dist" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.dist')}${colonSep()}</label>
            <input type="text" id="inp-distribution" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-size" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.size')}${colonSep()}</label>
            <input type="text" id="inp-size" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-mass" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.mass')}${colonSep()}</label>
            <input type="text" id="inp-mass" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-period" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.period')}${colonSep()}</label>
            <input type="text" id="inp-period" placeholder="${t('placeholder.period')}" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        
        <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:2px;">
            <div id="timeline-container" style="width:100%; height:20px; background:var(--bg-hover); position:relative; border:1px solid var(--border-color); box-sizing:border-box; overflow:hidden;">
                <div id="timeline-indicator" style="position:absolute; top:-2px; bottom:-2px; background:rgba(255, 0, 0, 0.5); border-left:2px solid red; border-right:2px solid red; z-index:10; display:none; pointer-events:none; box-sizing:border-box;"></div>
            </div>
            <div id="timeline-zoom-container" style="width:100%; height:18px; background:var(--bg-panel); position:relative; border:1px solid var(--border-color); box-sizing:border-box; overflow:hidden; display:none;">
                <div id="timeline-zoom-content" style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex;"></div>
                <div id="timeline-zoom-indicator" style="position:absolute; top:-2px; bottom:-2px; background:rgba(255, 0, 0, 0.5); border-left:2px solid red; border-right:2px solid red; z-index:10; display:none; pointer-events:none; box-sizing:border-box;"></div>
            </div>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-diagnose" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">Diagnose :</label>
            <textarea id="inp-diagnose" spellcheck="true" placeholder="${t('placeholder.diagnose')}" style="width:100%; height:80px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-synapo" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.synapo')}${colonSep()}</label>
            <textarea id="inp-synapomorphies" spellcheck="true" placeholder="${t('placeholder.synapo')}" style="width:100%; height:120px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-notes" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.notes')}${colonSep()}</label>
            <textarea id="inp-notes" spellcheck="true" style="width:100%; height:120px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-biblio" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">Bibliographie :</label>
            <textarea id="inp-biblio" spellcheck="true" placeholder="${t('placeholder.biblio')}" style="width:100%; height:80px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-iucn" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.iucn')}${colonSep()}</label>
            <select id="inp-iucn" style="width:100%; padding:6px; box-sizing:border-box; cursor:pointer; font-size:13px;">
                <option value=""></option>
                <option value="NE (Non évalué)">${t('iucn.ne')}</option>
                <option value="DD (Données insuffisantes)">${t('iucn.dd')}</option>
                <option value="LC (Préoccupation mineure)">${t('iucn.lc')}</option>
                <option value="NT (Quasi menacé)">${t('iucn.nt')}</option>
                <option value="VU (Vulnérable)">${t('iucn.vu')}</option>
                <option value="EN (En danger)">${t('iucn.en')}</option>
                <option value="CR (En danger critique)">${t('iucn.cr')}</option>
                <option value="EW (Éteint à l'état sauvage)">${t('iucn.ew')}</option>
                <option value="EX (Éteint)">${t('iucn.ex')}</option>
            </select>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column; padding: 10px; background: var(--bg-input); border: 1px solid var(--border-color); border-radius: 4px;">
            <label id="lbl-side-link" style="font-weight:bold; font-size:13px; margin-bottom:6px; opacity:0.9; color: #2196F3;">&#x2197; Fichier lié :</label>
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <input type="text" id="inp-linkedFile-name" readonly placeholder="${t('placeholder.linked_file')}" style="flex:1; padding:6px; box-sizing:border-box; font-size:12px; background: var(--bg-panel); color: var(--text-main); border: 1px solid var(--border-color); border-radius: 2px;">
                <button id="btn-select-linkedFile" title="${t('title.link_file')}" style="padding:6px 10px; cursor:pointer; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); border-radius:2px;">&#x2026;</button>
            </div>
            <div style="display:flex; gap:5px;">
                <button id="btn-open-linkedFile" style="flex:1; padding:6px; cursor:pointer; background:#2196F3; color:white; border:none; border-radius:2px; font-weight:bold; display:none;">Ouvrir &#x2192;</button>
                <button id="btn-clear-linkedFile" style="padding:6px 10px; cursor:pointer; background:var(--bg-panel); color:#d32f2f; border:1px solid #d32f2f; border-radius:2px; display:none;">&#x2716;</button>
            </div>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-illus" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.illustration')}</label>
            <input type="file" id="inp-sheetImage-file" accept="image/png, image/jpeg, image/webp" style="display:none;">
            <div style="display:flex; gap:5px; margin-bottom:5px;">
                <button id="btn-upload-sheetImage" style="flex:1; padding:6px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px;">${t('btn.upload_illus')}</button>
                <button id="btn-clear-sheetImage" style="padding:6px; cursor:pointer; background:var(--bg-input); color:#d32f2f; border:1px solid #d32f2f; border-radius:var(--btn-radius); display:none;">${t('btn.delete_illus')}</button>
            </div>
            <img id="preview-sheetImage" style="max-width:100%; max-height:200px; object-fit:contain; border-radius:4px; display:none; border:1px solid var(--border-color); background:rgba(0,0,0,0.05);" />
            <label id="lbl-img-credits" for="inp-imgCredits" style="font-size:11px; margin-top:6px; opacity:0.8; display:none;">${t('label.img_credits')}</label>
            <input type="text" id="inp-imgCredits" placeholder="${t('placeholder.img_credits')}" style="width:100%; padding:6px; box-sizing:border-box; font-size:11px; margin-top:5px; display:none;">
            <div id="fiche-gallery" style="display:none; gap:4px; flex-wrap:wrap; margin-top:6px;"></div>
            <button id="btn-image-main" style="display:none; margin-top:5px; padding:4px 8px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px;">&#9733; ${t('media.make_main')}</button>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-audio" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('media.audio')}</label>
            <div style="display:flex; gap:5px;">
                <button id="btn-audio-pick" title="${t('media.audio_pick_title')}" style="flex:1; padding:6px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius); font-size:12px;">&#128266; ${t('media.audio_pick')}</button>
                <button id="btn-audio-clear" title="${t('media.audio_clear')}" style="padding:6px 10px; cursor:pointer; background:var(--bg-input); color:#d32f2f; border:1px solid #d32f2f; border-radius:var(--btn-radius); display:none;">&#10006;</button>
            </div>
            <div id="audio-info" style="font-size:11px; opacity:0.85; margin-top:4px; word-break:break-all;"></div>
            <audio id="audio-player" controls style="width:100%; margin-top:4px; display:none;"></audio>
        </div>
        
        <div id="lineage-container" style="margin-top:15px; padding:10px; background:var(--bg-canvas); border:1px solid var(--border-color); border-radius:4px; font-size:12px; line-height:1.4;"></div>

        <div style="display:flex; gap:10px; margin-top:15px; margin-bottom:20px; align-items:center;">
            <button id="btn-export-fiche" style="flex:1; padding:8px; cursor:pointer; background:#2196F3; color:white; border:none; font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">${t('sidepanel.export')}</button>
            <button id="btn-close-panel" style="flex:1; padding:8px; cursor:pointer; background:var(--bg-topbar); color:var(--text-topbar); border:1px solid var(--border-color); font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">${t('btn.close')}</button>
        </div>
    </div>

    <div id="custom-box" style="position:fixed; border:1px solid rgba(33,150,243,0.8); background:rgba(33,150,243,0.2); display:none; z-index:9999; pointer-events:none;"></div>
  `;

  document.body.insertAdjacentHTML('beforeend', uiHTML);

  const timelineContainer = document.getElementById('timeline-container');
  if (timelineContainer) {
      timelineContainer.innerHTML = `
        <div id="timeline-indicator" style="position:absolute; top:-2px; bottom:-2px; background:rgba(255, 0, 0, 0.5); border-left:2px solid red; border-right:2px solid red; z-index:10; display:none; pointer-events:none; box-sizing:border-box;"></div>
        <div id="timeline-layer-normal" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
        <div id="timeline-layer-deep" style="position:absolute; top:0; left:0; width:100%; height:100%; display:none;"></div>
      `;

      const layerNormal = document.getElementById('timeline-layer-normal');
      const layerDeep = document.getElementById('timeline-layer-deep');

      GEOLOGICAL_PERIODS.forEach(p => { 
          const pctWidth = ((p.start - p.end) / PHANEROZOIC_TIMELINE_MAX) * 100;
          const pctLeft = ((PHANEROZOIC_TIMELINE_MAX - p.start) / PHANEROZOIC_TIMELINE_MAX) * 100;
          const block = document.createElement('div');
          block.style.cssText = `position:absolute; left:${pctLeft}%; width:${pctWidth}%; top:0; bottom:0; background-color:${p.color}; border-right:1px solid rgba(0,0,0,0.2); box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:10px; color:rgba(0,0,0,0.8); overflow:hidden; cursor:help;`;
          block.title = `${t(p.key)} (${p.start} - ${p.end} Ma)`; block.innerText = p.abbr;
          layerNormal?.appendChild(block);
      });

      PRECAMBRIAN_EONS.forEach(e => {
          const pctWidth = ((e.start - e.end) / EARTH_AGE) * 100;
          const pctLeft = ((EARTH_AGE - e.start) / EARTH_AGE) * 100;
          const block = document.createElement('div');
          block.style.cssText = `position:absolute; left:${pctLeft}%; width:${pctWidth}%; top:0; bottom:0; background-color:${e.color}; border-right:1px solid rgba(0,0,0,0.2); box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:10px; color:rgba(255,255,255,0.9); overflow:hidden; cursor:help; font-weight:bold;`;
          block.title = `${t(e.key)} (${e.start} - ${e.end} Ma)`; block.innerText = e.abbr;
          layerDeep?.appendChild(block);
      });
  }

  window.addEventListener('click', (e) => {
      const modal = document.getElementById('settings-modal');
      const btnSettings = document.getElementById('btn-settings');
      if (modal && modal.style.display === 'flex' && e.target !== btnSettings && !modal.contains(e.target as Node)) {
          modal.style.display = 'none';
      }
  });

  return {
      // Logos des trois dispositions (hub d'accueil : modèles et projets récents sans miniature).
      logoStandard: logoNormal, logoComb: logoPeigne, logoChrono,
      welcomeOverlay: document.getElementById('welcome-overlay') as HTMLElement,
      btnSave: document.getElementById('btn-save') as HTMLElement, 
      btnSaveAs: document.getElementById('btn-save-as') as HTMLElement,
      btnSaveLegacy: document.getElementById('btn-save-legacy') as HTMLElement,
      btnLoad: document.getElementById('btn-load') as HTMLElement, 
      fileInput: document.getElementById('file-input') as HTMLInputElement,
      btnRecenter: document.getElementById('btn-recenter') as HTMLElement, 
      btnCenterRoot: document.getElementById('btn-center-root') as HTMLElement,
      btnGuide: document.getElementById('btn-guide') as HTMLElement,
      btnExpandAll: document.getElementById('btn-expand-all') as HTMLElement, 
      btnLayoutNormal: document.getElementById('btn-layout-normal') as HTMLElement, 
      btnLayoutComb: document.getElementById('btn-layout-comb') as HTMLElement, 
      btnLayoutChrono: document.getElementById('btn-layout-chrono') as HTMLButtonElement,
      chronoTools: document.getElementById('chrono-tools') as HTMLElement,
      chronoAxisSelect: document.getElementById('chrono-axis-select') as HTMLSelectElement,
      btnChronoBounds: document.getElementById('btn-chrono-bounds') as HTMLButtonElement,
      btnCredits: document.getElementById('btn-credits') as HTMLElement, 
      creditsOverlay: document.getElementById('credits-overlay') as HTMLElement,
      btnCloseCredits: document.getElementById('btn-close-credits') as HTMLButtonElement,
      searchInput: document.getElementById('search-input') as HTMLInputElement,
      searchDropdown: document.getElementById('search-dropdown') as HTMLElement,
      exportSelect: document.getElementById('export-select') as HTMLSelectElement,
      exportScaleSelect: document.getElementById('export-scale-select') as HTMLSelectElement,
      btnExport: document.getElementById('btn-export') as HTMLButtonElement,
      exportTransparent: document.getElementById('export-transparent') as HTMLInputElement,
      exportTransparentRow: document.getElementById('export-transparent-row') as HTMLElement,
      breadcrumbsBar: document.getElementById('breadcrumbs-bar') as HTMLElement,
      sheetsBar: document.getElementById('sheets-bar') as HTMLElement,
      counterBar: document.getElementById('counter-bar') as HTMLElement,
      contextMenu: document.getElementById('context-menu') as HTMLElement,
      styleMenu: document.getElementById('style-ribbon') as HTMLElement, 
      compileModal: document.getElementById('compile-modal') as HTMLElement,
      tableModal: document.getElementById('table-modal') as HTMLElement,
      sidePanel: document.getElementById('side-panel') as HTMLElement,
      customBox: document.getElementById('custom-box') as HTMLElement,
      timelineIndicator: document.getElementById('timeline-indicator') as HTMLElement,
      timelineZoomContainer: document.getElementById('timeline-zoom-container') as HTMLElement,
      timelineZoomContent: document.getElementById('timeline-zoom-content') as HTMLElement,
      timelineZoomIndicator: document.getElementById('timeline-zoom-indicator') as HTMLElement,
      panelTitle: document.getElementById('panel-title') as HTMLElement,
      lineageContainer: document.getElementById('lineage-container') as HTMLElement,
      formInputs: {
          status: document.getElementById('inp-status') as HTMLSelectElement,
          rank: document.getElementById('inp-rank') as HTMLSelectElement,
          discoveryDate: document.getElementById('inp-discoveryDate') as HTMLInputElement,
          author: document.getElementById('inp-author') as HTMLInputElement,
          distribution: document.getElementById('inp-distribution') as HTMLInputElement,
          size: document.getElementById('inp-size') as HTMLInputElement,
          mass: document.getElementById('inp-mass') as HTMLInputElement,
          period: document.getElementById('inp-period') as HTMLInputElement,
          synapomorphies: document.getElementById('inp-synapomorphies') as HTMLTextAreaElement,
          notes: document.getElementById('inp-notes') as HTMLTextAreaElement,
          iucn: document.getElementById('inp-iucn') as HTMLSelectElement,
          imgCredits: document.getElementById('inp-imgCredits') as HTMLInputElement,
          diagnose: document.getElementById('inp-diagnose') as HTMLTextAreaElement,
          biblio: document.getElementById('inp-biblio') as HTMLTextAreaElement,
      },
      btnUploadSheetImage: document.getElementById('btn-upload-sheetImage') as HTMLButtonElement,
      btnClearSheetImage: document.getElementById('btn-clear-sheetImage') as HTMLButtonElement,
      inpSheetImageFile: document.getElementById('inp-sheetImage-file') as HTMLInputElement,
      previewSheetImage: document.getElementById('preview-sheetImage') as HTMLImageElement,
      btnCloseCross: document.getElementById('btn-close-cross') as HTMLElement,
      btnExportFiche: document.getElementById('btn-export-fiche') as HTMLButtonElement,
      btnClosePanel: document.getElementById('btn-close-panel') as HTMLButtonElement,
      btnNew: document.getElementById('btn-new') as HTMLElement,
      btnNewWindow: document.getElementById('btn-new-window') as HTMLElement, 
      styleBoxShape: document.getElementById('style-box-shape') as HTMLSelectElement,
      styleBoxVertical: document.getElementById('style-box-vertical') as HTMLInputElement,
      styleBoxGradient: document.getElementById('style-box-gradient') as HTMLInputElement,
      btnSettings: document.getElementById('btn-settings') as HTMLButtonElement,
      settingsModal: document.getElementById('settings-modal') as HTMLElement,
      btnCloseSettings: document.getElementById('btn-close-settings') as HTMLButtonElement,
      setTheme: document.getElementById('set-theme') as HTMLSelectElement,
      setLang: document.getElementById('set-lang') as HTMLSelectElement,
      setCanvasBg: document.getElementById('set-canvas-bg') as HTMLInputElement,
      setAutoUpdate: document.getElementById('set-auto-update') as HTMLInputElement,
      btnCheckUpdate: document.getElementById('btn-check-update') as HTMLElement,
      setLayout: document.getElementById('set-layout') as HTMLSelectElement,
      setSmartTax: document.getElementById('set-smart-tax') as HTMLInputElement,
      setAutoItalic: document.getElementById('set-auto-italic') as HTMLInputElement,
      setZoomSens: document.getElementById('set-zoom-sens') as HTMLInputElement,
      setFicheColor: document.getElementById('set-fiche-color') as HTMLInputElement,
      setPdfTimeline: document.getElementById('set-pdf-timeline') as HTMLInputElement,
      setIndicatorFiche: document.getElementById('set-indicator-fiche') as HTMLInputElement,
      btnClearHistory: document.getElementById('btn-clear-history') as HTMLButtonElement,
      btnResetSettings: document.getElementById('btn-reset-settings') as HTMLButtonElement,
      ribbon: document.getElementById('ribbon') as HTMLElement,
      btnToggleAbbrev: document.getElementById('btn-toggle-abbrev') as HTMLButtonElement,
      setCountInvalid: document.getElementById('set-count-invalid') as HTMLInputElement,
      setWallpaperFile: document.getElementById('set-wallpaper-file') as HTMLInputElement,
      btnUploadWallpaper: document.getElementById('btn-upload-wallpaper') as HTMLButtonElement,
      btnClearWallpaper: document.getElementById('btn-clear-wallpaper') as HTMLButtonElement,
      setWallpaperOpacity: document.getElementById('set-wallpaper-opacity') as HTMLInputElement, 
      containerWallpaperOpacity: document.getElementById('container-wallpaper-opacity') as HTMLElement, 
      panelSubtitleSynonym: document.getElementById('panel-subtitle-synonym') as HTMLElement,
      inpSynonymTarget: document.getElementById('inp-synonymTarget') as HTMLInputElement,
      synonymDropdown: document.getElementById('synonym-dropdown') as HTMLElement,
      containerSynonym: document.getElementById('container-synonym') as HTMLElement,
      inpLinkedFileName: document.getElementById('inp-linkedFile-name') as HTMLInputElement,
      btnSelectLinkedFile: document.getElementById('btn-select-linkedFile') as HTMLButtonElement,
      btnOpenLinkedFile: document.getElementById('btn-open-linkedFile') as HTMLButtonElement,
      btnClearLinkedFile: document.getElementById('btn-clear-linkedFile') as HTMLButtonElement,
  };
}

export const updateAllUITexts = (ui: any) => {
    const el = (id: string, text: string) => { const e = document.getElementById(id); if (e) e.innerHTML = text; };
    const pl = (id: string, text: string) => { const e = document.getElementById(id) as HTMLInputElement; if (e) e.placeholder = text; };
    
    // Topbar
    el('lbl-topbar-file', t('topbar.file'));
    el('btn-new', t('topbar.file.new'));
    el('btn-load', t('topbar.file.open'));
    el('btn-save', t('topbar.file.save'));
    el('btn-save-as', t('topbar.file.saveas'));
    el('btn-save-legacy', t('topbar.file.save_legacy'));
    el('lbl-topbar-export', t('topbar.file.export'));
    
    // Onglets et groupes du ruban (phase 2)
    el('tab-style', t('tab.style'));
    el('tab-display', t('tab.display'));
    el('tab-tree', t('tab.tree'));
    el('tab-help', t('tab.help'));
    const collapse = document.getElementById('btn-collapse-ribbon');
    if (collapse) collapse.title = t('ribbon.collapse');
    el('lbl-ribbon-camera', t('ribbon.grp.camera'));
    el('lbl-ribbon-names', t('ribbon.grp.names'));
    el('lbl-ribbon-theme', t('ribbon.grp.theme'));
    el('lbl-ribbon-settings', t('ribbon.grp.settings'));
    el('lbl-ribbon-layout', t('ribbon.grp.layout'));
    el('lbl-ribbon-chrono', t('ribbon.grp.chrono'));
    el('lbl-ribbon-selection', t('ribbon.grp.selection'));
    el('lbl-ribbon-docs', t('ribbon.grp.docs'));
    el('lbl-ribbon-about', t('ribbon.grp.about'));
    el('ribbon-graft', t('menu.graft'));
    el('ribbon-sheet-new', t('menu.sheet_new'));
    el('ribbon-box-add', t('menu.box_add'));
    el('style-bold', t('style.bold'));
    el('style-italic', t('style.italic'));
    el('lbl-style-outline', t('style.outline'));
    el('lbl-ribbon-divergence', t('divergence.group'));
    el('lbl-ribbon-romer', t('romer.group'));
    el('romer-toggle', '&#10023; ' + t('romer.toggle'));
    el('romer-pick', '&#9998; ' + t('romer.pick'));
    el('romer-layout', t('romer.layout') + ' &#9662;');
    const romerLayoutBtn = document.getElementById('romer-layout'); if (romerLayoutBtn) romerLayoutBtn.title = t('romer.layout_title');
    el('btn-geo-chart', t('geochart.button'));
    el('btn-geo-chart-chrono', t('geochart.button'));
    el('tree-divergence-toggle', '&#8660; ' + t('divergence.mode'));
    el('tree-divergence-reset', t('divergence.reset'));
    el('lbl-style-highlight', t('highlight.group'));
    el('style-highlight-apply', t('highlight.apply'));
    el('lbl-style-brush', t('brush.group'));
    el('style-brush-toggle', '&#128396; ' + t('brush.mode'));
    el('style-brush-selection', t('brush.paint_selection'));
    el('style-brush-clear', t('brush.clear'));

    el('btn-recenter', t('topbar.view.recenter'));
    el('btn-center-root', t('topbar.view.center_root'));
    el('btn-expand-all', t('topbar.view.expand'));

    el('btn-guide', t('topbar.help.guide'));
    el('btn-shortcuts', t('topbar.help.shortcuts'));
    el('btn-patch', t('topbar.help.patch'));
    el('btn-check-update', t('topbar.help.update'));
    el('lbl-settings-autoupdate', t('settings.auto_update'));
    el('btn-credits', t('topbar.help.credits'));

    el('btn-settings', '&#9881; ' + t('ribbon.settings'));

    el('lbl-side-diagnose', t('label.diagnose') + colonSep());
    el('lbl-side-biblio', t('label.biblio') + colonSep());
    pl('inp-diagnose', t('placeholder.diagnose'));
    pl('inp-biblio', t('placeholder.biblio'));

    el('lbl-side-synonym', t('label.synonym_of') + colonSep());
    pl('inp-synonymTarget', t('placeholder.synonym_target'));
    const subSyn = document.getElementById('panel-subtitle-synonym');
    if(subSyn) subSyn.title = t('title.go_to_valid');

    el('btn-new-window', t('topbar.file.new_window'));
    if (ui.exportSelect) ui.exportSelect.title = t('export.format');
    if (ui.exportScaleSelect) ui.exportScaleSelect.title = t('export.resolution');
    el('lbl-export-transparent', t('export.transparent'));
    if (ui.exportTransparentRow) ui.exportTransparentRow.title = t('export.opaque_only');
    
    if (ui.btnLayoutNormal) ui.btnLayoutNormal.title = t('layout.standard');
    if (ui.btnLayoutComb) ui.btnLayoutComb.title = t('layout.comb');
    const fichePrev = document.getElementById('fiche-prev'), ficheNext = document.getElementById('fiche-next');
    if (fichePrev) fichePrev.title = t('fiche.prev');
    if (ficheNext) ficheNext.title = t('fiche.next');
    if (ui.btnToggleAbbrev) ui.btnToggleAbbrev.title = t('topbar.btn.abbrev');

    // Accueil
    // Hub d'accueil (identifiants précis : le hub contient plusieurs <p> et <div>)
    el('hub-subtitle', t('welcome.subtitle'));
    el('hub-tip', t('welcome.tip'));
    el('hub-recent-title', t('welcome.recent'));
    el('hub-recent-empty', t('hub.recent_empty'));
    el('btn-hub', t('hub.menu'));
    
    // Panneau Latéral
    el('lbl-side-status', t('label.status') + colonSep());
    el('lbl-side-rank', t('label.rank') + colonSep());
    el('lbl-side-date', t('label.date') + colonSep());
    el('lbl-side-author', t('label.author') + colonSep());
    el('lbl-side-dist', t('label.dist') + colonSep());
    el('lbl-side-size', t('label.size') + colonSep());
    el('lbl-side-mass', t('label.mass') + colonSep());
    el('lbl-side-period', t('label.period') + colonSep());
    el('lbl-side-synapo', t('label.synapo') + colonSep());
    el('lbl-side-notes', t('label.notes') + colonSep());
    el('lbl-side-iucn', t('label.iucn') + colonSep());
    el('lbl-side-illus', t('label.illustration'));
    
    el('btn-export-fiche', t('sidepanel.export'));
    el('btn-close-panel', t('btn.close'));
    el('btn-upload-sheetImage', t('btn.upload_illus'));
    el('btn-clear-sheetImage', t('btn.delete_illus'));
    el('btn-image-main', '&#9733; ' + t('media.make_main'));
    el('lbl-side-audio', t('media.audio'));
    el('lbl-img-credits', t('label.img_credits'));
    el('lbl-sheet-classification', t('variant.title'));
    el('sheet-variant-add', '+ ' + t('variant.add'));
    el('lbl-sheet-variant-note', t('variant.note'));
    el('btn-audio-pick', '&#128266; ' + t('media.audio_pick'));
    
    pl('inp-period', t('placeholder.period'));
    pl('inp-synapomorphies', t('placeholder.synapo'));
    pl('inp-imgCredits', t('placeholder.img_credits'));
    pl('search-input', t('search.placeholder'));
    
    // Menu Style
    el('style-drag-handle', t('style.title'));
    el('lbl-style-text', t('style.text'));
    el('lbl-style-frame', t('style.node_frame'));
    el('lbl-style-opacity', t('style.opacity'));
    el('lbl-style-picto', t('style.picto'));
    el('lbl-style-img-size', t('style.size'));
    pl('style-box-name', t('style.box_name'));

    el('lbl-style-text-above', t('style.text_above'));
    el('lbl-style-box-90', t('style.box_90'));
    el('lbl-style-box-gradient', t('style.box_gradient'));
    el('lbl-style-box-group', t('style.box_group'));
    
    // Paramètres
    el('lbl-settings-title', t('settings.title'));
    el('lbl-settings-display', t('settings.sec_display'));
    el('lbl-settings-theme', t('settings.theme'));
    el('lbl-settings-lang', t('settings.lang'));
    el('lbl-settings-canvasbg', t('settings.canvas_bg'));
    el('lbl-settings-layout', t('settings.layout'));
    el('lbl-settings-behavior', t('settings.sec_behavior'));
    el('lbl-settings-smarttax', t('settings.smart_tax'));
    el('lbl-settings-autoitalic', t('settings.auto_italic'));
    el('lbl-settings-zoomsens', t('settings.zoom_sens'));
    el('lbl-settings-zoomsoft', t('settings.zoom_soft'));
    el('lbl-settings-zoomhard', t('settings.zoom_hard'));
    el('lbl-settings-export', t('settings.sec_export'));
    el('lbl-settings-fichecolor', t('settings.fiche_color'));
    el('lbl-settings-pdftimeline', t('settings.pdf_timeline'));
    el('lbl-settings-count-invalid', t('settings.count_invalid'));
    el('lbl-settings-data', t('settings.sec_data'));
    el('btn-clear-history', t('settings.clear_history'));
    el('btn-reset-settings', t('settings.reset_settings'));
    el('lbl-settings-fiche-indicator', t('settings.fiche_indicator'));
    
    // Select options : on force le re-render des options pour la traduction
    if(ui.setTheme) {
        Array.from(ui.setTheme.options).forEach(opt => {
            const val = (opt as HTMLOptionElement).value;
            if(val === 'light') (opt as HTMLOptionElement).text = t('theme.light');
            if(val === 'dark') (opt as HTMLOptionElement).text = t('theme.dark');
            if(val === 'sepia') (opt as HTMLOptionElement).text = t('theme.sepia');
            if(val === 'ingen') (opt as HTMLOptionElement).text = t('theme.ingen');
            if(val === 'console') (opt as HTMLOptionElement).text = t('theme.console');
            if(val === 'high-contrast') (opt as HTMLOptionElement).text = t('theme.highcontrast');
            if(val === 'dimmed') (opt as HTMLOptionElement).text = t('theme.dimmed');
        });
    }
    if(ui.setLayout) {
        Array.from(ui.setLayout.options).forEach(opt => {
            const val = (opt as HTMLOptionElement).value;
            if(val === 'standard') (opt as HTMLOptionElement).text = t('layout.standard');
            if(val === 'comb') (opt as HTMLOptionElement).text = t('layout.comb');
        });
    }
    
    // Status & Rank options
    if (ui.formInputs.status) {
        Array.from(ui.formInputs.status.options).forEach((opt: any) => {
            const r = opt.value;
            const transKey = r === 'Valide' ? 'status.valid' : r === 'Synonyme' ? 'status.synonym' : r;
            opt.text = (transKey === r) ? r : t(transKey);
        });
    }
    if (ui.formInputs.rank) {
        Array.from(ui.formInputs.rank.options).forEach((opt: any) => {
            opt.text = t('rank.' + opt.value) !== ('rank.' + opt.value) ? t('rank.' + opt.value) : opt.value;
        });
    }
    
    // IUCN
    if (ui.formInputs.iucn) {
        Array.from(ui.formInputs.iucn.options).forEach((opt: any) => {
            const val = opt.value;
            if (val.startsWith('NE')) opt.text = t('iucn.ne');
            else if (val.startsWith('DD')) opt.text = t('iucn.dd');
            else if (val.startsWith('LC')) opt.text = t('iucn.lc');
            else if (val.startsWith('NT')) opt.text = t('iucn.nt');
            else if (val.startsWith('VU')) opt.text = t('iucn.vu');
            else if (val.startsWith('EN')) opt.text = t('iucn.en');
            else if (val.startsWith('CR')) opt.text = t('iucn.cr');
            else if (val.startsWith('EW')) opt.text = t('iucn.ew');
            else if (val.startsWith('EX')) opt.text = t('iucn.ex');
        });
    }
    // Select options : Résolution Export
    if(ui.exportScaleSelect) {
        Array.from(ui.exportScaleSelect.options).forEach(opt => {
            const val = (opt as HTMLOptionElement).value;
            if(val === '1') (opt as HTMLOptionElement).text = t('export.res.low');
            if(val === '2') (opt as HTMLOptionElement).text = t('export.res.med');
            if(val === '3') (opt as HTMLOptionElement).text = t('export.res.high');
        });
    }
    
    // Select options : Forme du cadre
    if(ui.styleBoxShape) {
        Array.from(ui.styleBoxShape.options).forEach(opt => {
            const val = (opt as HTMLOptionElement).value;
            if(val === 'round-rectangle') (opt as HTMLOptionElement).text = t('style.box_shape.round');
            if(val === 'rectangle') (opt as HTMLOptionElement).text = t('style.box_shape.rect');
            if(val === 'bracket') (opt as HTMLOptionElement).text = t('style.box_shape.bracket');
        });
    }
};