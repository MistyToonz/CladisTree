import { APP_CSS, getWelcomeHTML, CREDITS_HTML, CONTEXT_MENU_HTML, COMPILE_MODAL_HTML, TABLE_MODAL_HTML, TAXONOMIC_RANKS, GEOLOGICAL_PERIODS } from './utils';
import { t, currentLang } from './i18n';

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
    
    .settings-section { display: flex; flex-direction: column; gap: 8px; margin-bottom: 20px; }
    .settings-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
    .settings-title { font-size: 14px; font-weight: bold; margin: 0 0 10px 0; padding-bottom: 5px; border-bottom: 1px solid var(--border-color); }
  `;
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
    ${getWelcomeHTML(logoPT, APP_VERSION)}
    
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
                    <div class="dropdown-item" id="btn-load">${t('topbar.file.open')}</div>
                    <div class="dropdown-item" id="btn-save" style="color: #4CAF50; font-weight: bold;">${t('topbar.file.save')}</div>
                    <div class="dropdown-item" id="btn-save-as">${t('topbar.file.saveas')}</div>
                    <div style="border-top:1px solid var(--border-color); margin: 4px 0;"></div>
                    <div style="padding: 8px 12px; display:flex; flex-direction:column; gap:5px;">
                        <span id="lbl-topbar-export" style="font-size:12px; opacity:0.8;">${t('topbar.file.export')}</span>
                        <div style="display:flex; flex-direction:column; gap:5px;">
                            <div style="display:flex; gap:5px;">
                                <select id="export-select" style="padding:4px; font-size:11px; flex:1; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);" title="${t('export.format')}">
                                    <option value="png">PNG</option><option value="jpeg">JPEG</option><option value="svg">SVG</option><option value="pdf">PDF</option>
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

            <div class="dropdown">
                <button class="menu-btn" id="lbl-topbar-view">${t('topbar.view')}</button>
                <div class="dropdown-content">
                    <div class="dropdown-item" id="btn-recenter">${t('topbar.view.recenter')}</div>
                    <div class="dropdown-item" id="btn-center-root">${t('topbar.view.center_root')}</div>
                    <div class="dropdown-item" id="btn-expand-all">${t('topbar.view.expand')}</div>
                </div>
            </div>

            <div class="dropdown">
                <button class="menu-btn" id="lbl-topbar-help">${t('topbar.help')}</button>
                <div class="dropdown-content">
                    <div class="dropdown-item" id="btn-guide">${t('topbar.help.guide')}</div>
                    <div class="dropdown-item" id="btn-shortcuts">${t('topbar.help.shortcuts')}</div>
                    <div class="dropdown-item" id="btn-patch">${t('topbar.help.patch')}</div>
                    <div class="dropdown-item" id="btn-check-update">${t('topbar.help.update')}</div>
                    <div class="dropdown-item" id="btn-credits">${t('topbar.help.credits')}</div>
                </div>
            </div>

            <div style="width:1px; height:20px; background:var(--border-color); margin: 0 5px;"></div>

            <div style="display:flex; flex-shrink:0; align-items:center; border:1px solid var(--border-color); border-radius:3px; overflow:hidden; box-shadow:var(--panel-shadow);">
                <button id="btn-layout-normal" title="${t('layout.standard')}" style="padding:4px 8px; cursor:pointer; background:#2196F3; border:none; display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    <img src="${logoNormal}" style="height:14px; width:14px; filter:invert(1) brightness(2);">
                </button>
                <button id="btn-layout-comb" title="${t('layout.comb')}" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); border:none; border-left:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    <img src="${logoPeigne}" style="height:14px; width:14px;">
                </button>
                <button id="btn-layout-chrono" title="${t('layout.chrono')}" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); border:none; border-left:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; transition:background 0.2s;">
                    <img src="${logoChrono}" style="height:14px; width:14px;">
                </button>
            </div>

            <!-- Controles specifiques au chronogramme (phases 8 et 9).
                 Masque par defaut : updateLayoutButtonsUI() l'affiche en mode chrono. -->
            <div id="chrono-tools" style="display:none; align-items:center; gap:6px; margin-left:10px;">
                <select id="chrono-axis-select" title="${t('chrono.axis.title')}" style="padding:3px 6px; font-size:12px; border-radius:3px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input); cursor:pointer;">
                    <option value="linear">${t('chrono.axis.linear')}</option>
                    <option value="sqrt">${t('chrono.axis.sqrt')}</option>
                    <option value="log">${t('chrono.axis.log')}</option>
                    <option value="rank">${t('chrono.axis.rank')}</option>
                </select>
                <button id="btn-chrono-bounds" title="${t('chrono.bounds.title')}" style="padding:4px 10px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; font-size:12px; font-weight:bold; transition:all 0.2s; white-space:nowrap;">${t('chrono.bounds.period')}</button>
                <button id="btn-chrono-lanes" title="${t('chrono.lanes.title')}" style="padding:4px 10px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; font-size:12px; font-weight:bold; transition:all 0.2s; white-space:nowrap;">${t('chrono.lanes.faithful')}</button>
            </div>

            <button id="btn-toggle-abbrev" style="margin-left:15px; padding:4px 12px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; font-size:12px; font-weight:bold; transition:all 0.2s;">Noms complets</button>
            <button id="btn-toggle-ribbon" style="margin-left:10px; padding:4px 12px; cursor:pointer; background:rgba(33, 150, 243, 0.1); color:#2196F3; border:1px solid #2196F3; border-radius:4px; font-size:12px; font-weight:bold; transition:all 0.2s;">${t('topbar.btn.style')}</button>

            <div style="position:relative; margin-left:auto; display:flex; align-items:center; gap:10px;">
                <button id="btn-settings" title="${t('settings.title')}" style="padding:4px 8px; cursor:pointer; background:var(--bg-input); border:1px solid var(--border-color); border-radius:4px; display:flex; align-items:center; justify-content:center; transition:background 0.2s; color:var(--text-main); font-size:16px;">
                    &#9881;
                </button>
                <input type="text" id="search-input" placeholder="${t('search.placeholder')}" style="padding:4px 8px; width:180px; font-size:12px; border-radius:4px; border:1px solid var(--border-color); background:var(--bg-input); color:var(--text-input);">
                <div id="search-dropdown" style="position:absolute; top:100%; right:0; width:100%; max-height:250px; overflow-y:auto; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); box-shadow:var(--panel-shadow); display:none; z-index:2000;"></div>
                <input type="file" id="file-input" accept=".json,.phylo,.xmind" style="display:none;">
            </div>
        </div>

        <div id="style-ribbon" style="display:none; background:var(--bg-panel); padding:10px 20px; border-bottom:1px solid var(--border-color); gap:25px; align-items:flex-start; flex-wrap:wrap; font-size:12px; box-shadow:inset 0 4px 6px rgba(0,0,0,0.02);">
            
            <div class="ribbon-group">
                <div class="ribbon-row">
                    <select id="style-font" style="padding:4px; width:110px; border:1px solid var(--border-color);"><option value="serif">Serif</option><option value="sans-serif">Sans-Serif</option><option value="monospace">Monospace</option></select>
                    <input type="number" id="style-size" style="padding:4px; width:50px; border:1px solid var(--border-color);" min="8" max="72" value="16">
                </div>
                <div class="ribbon-row" style="margin-top:6px;">
                    <button id="style-bold" style="padding:4px 10px; font-weight:bold; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:3px;">Gras</button>
                    <button id="style-italic" style="padding:4px 10px; font-style:italic; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:3px;">Italique</button>
                </div>
                <div class="ribbon-group-title" id="lbl-style-text">${t('style.text')}</div>
            </div>

            <div class="ribbon-group" id="style-node-frame-section">
                <div class="ribbon-row" style="flex-direction:column; align-items:flex-start; gap:6px;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="style-node-frame"> <span id="lbl-style-frame">${t('style.node_frame')}</span></label>
                    <input type="color" id="style-node-frame-color" value="#000000" style="width:100%; height:20px; padding:0; border:none; cursor:pointer;">
                    <label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="style-text-above"> <span id="lbl-style-text-above">${t('style.text_above')}</span></label>
                </div>
                <div class="ribbon-group-title">Lignage</div>
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
            
            <button id="btn-close-ribbon" style="margin-left:auto; align-self:center; background:transparent; color:var(--text-main); border:none; cursor:pointer; font-size:18px; opacity:0.5; transition:opacity 0.2s;">&#10006;</button>
        </div>
    </div>

    <div id="breadcrumbs-bar" style="position:absolute; top:45px; left:15px; z-index:1001; font-size:12px; background:var(--bg-panel); color:var(--text-main); padding:6px 12px; border:1px solid var(--border-color); box-shadow:var(--panel-shadow); display:flex; gap:8px; border-radius:var(--btn-radius); opacity:0.95;"></div>
    
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
                <span id="lbl-settings-theme">${t('settings.theme')}</span>
                <select id="set-theme" style="padding:4px; font-size:12px;">
                    <option value="light">${t('theme.light')}</option>
                    <option value="dark">${t('theme.dark')}</option>
                    <option value="sepia">${t('theme.sepia')}</option>
                    <option value="ingen">${t('theme.ingen')}</option>
                    <option value="console">${t('theme.console')}</option>
                    <option value="high-contrast">${t('theme.highcontrast')}</option>
                    <option value="dimmed">${t('theme.dimmed')}</option>
                </select>
            </div>
            <div class="settings-row">
                <span id="lbl-settings-lang">${t('settings.lang')}</span>
                <select id="set-lang" style="padding:4px; font-size:12px;">
                    <option value="fr" ${currentLang === 'fr' ? 'selected' : ''}>Français</option>
                    <option value="en" ${currentLang === 'en' ? 'selected' : ''}>English</option>
                </select>
            </div>
            <div class="settings-row">
                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                    <input type="checkbox" id="set-canvas-bg"> <span id="lbl-settings-canvasbg">${t('settings.canvas_bg')}</span>
                </label>
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

    <div id="side-panel" style="position:absolute; top:36px; right:0; width:400px; height:calc(100vh - 36px); background:var(--bg-panel); color:var(--text-main); border-left:1px solid var(--border-color); padding:20px; box-shadow:-2px 0 10px rgba(0,0,0,0.1); display:block; transform:translateX(100%); z-index:1200; box-sizing:border-box; overflow-y:auto; transition:transform 0.3s ease-in-out; font-size:14px;">
        <span id="btn-close-cross" style="position:absolute; top:15px; right:20px; cursor:pointer; font-size:16px; color:var(--text-main); font-weight:bold; line-height:1; opacity:0.7;">&#10006;</span>
        <h2 id="panel-title" style="margin-top:0; margin-right:30px; font-family:serif; border-bottom:2px solid var(--border-color); padding-bottom:10px;"></h2>
        <div id="panel-subtitle-synonym" style="display:none; cursor:pointer; color:#2196F3; font-style:italic; margin-bottom:15px; font-size:14px; font-weight:bold;" title="${t('title.go_to_valid')}"></div>
        
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-status" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.status')} :</label>
            <select id="inp-status" style="width:100%; padding:6px; box-sizing:border-box; cursor:pointer; font-size:13px;">${statusOptions}</select>
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-rank" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.rank')} :</label>
            <select id="inp-rank" style="width:100%; padding:6px; box-sizing:border-box; cursor:pointer; font-size:13px;">${rankOptions}</select>
        </div>
        <div id="container-synonym" style="margin-bottom: 12px; flex-direction:column; position:relative; display:none;">
            <label id="lbl-side-synonym" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.synonym_of')} :</label>
            <div style="display:flex; align-items:center;">
                <span style="margin-right:5px; font-weight:bold; color:var(--text-main);"> = </span>
                <input type="text" id="inp-synonymTarget" autocomplete="off" placeholder="${t('placeholder.synonym_target')}" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
            </div>
            <div id="synonym-dropdown" style="position:absolute; top:100%; left:15px; right:0; max-height:150px; overflow-y:auto; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); box-shadow:var(--panel-shadow); display:none; z-index:2000;"></div>
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-date" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.date')} :</label>
            <input type="text" id="inp-discoveryDate" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-author" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.author')} :</label>
            <input type="text" id="inp-author" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-dist" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.dist')} :</label>
            <input type="text" id="inp-distribution" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-size" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.size')} :</label>
            <input type="text" id="inp-size" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-mass" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.mass')} :</label>
            <input type="text" id="inp-mass" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-period" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.period')} :</label>
            <input type="text" id="inp-period" placeholder="${t('placeholder.period')}" style="width:100%; padding:6px; box-sizing:border-box; font-size:13px;">
        </div>
        
        <div style="margin-bottom:15px; display:flex; flex-direction:column; gap:2px;">
            <!-- Frise globale d'origine -->
            <div id="timeline-container" style="width:100%; height:20px; background:var(--bg-hover); position:relative; border:1px solid var(--border-color); box-sizing:border-box; overflow:hidden;">
                <div id="timeline-indicator" style="position:absolute; top:-2px; bottom:-2px; background:rgba(255, 0, 0, 0.5); border-left:2px solid red; border-right:2px solid red; z-index:10; display:none; pointer-events:none; box-sizing:border-box;"></div>
            </div>
            <!-- Nouvelle Frise Zoom -->
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
            <label id="lbl-side-synapo" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.synapo')} :</label>
            <textarea id="inp-synapomorphies" spellcheck="true" placeholder="${t('placeholder.synapo')}" style="width:100%; height:120px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-notes" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.notes')} :</label>
            <textarea id="inp-notes" spellcheck="true" style="width:100%; height:120px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-biblio" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">Bibliographie :</label>
            <textarea id="inp-biblio" spellcheck="true" placeholder="${t('placeholder.biblio')}" style="width:100%; height:80px; resize:vertical; padding:6px; box-sizing:border-box; font-size:13px;"></textarea>
        </div>

        <div style="margin-bottom: 12px; display:flex; flex-direction:column;">
            <label id="lbl-side-iucn" style="font-weight:bold; font-size:13px; margin-bottom:4px; opacity:0.9;">${t('label.iucn')} :</label>
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
            <input type="text" id="inp-imgCredits" placeholder="${t('placeholder.img_credits')}" style="width:100%; padding:6px; box-sizing:border-box; font-size:11px; margin-top:5px; display:none;">
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

  // On importe les éons en haut de ui.ts si nécessaire, ou on y accède directement via utils
  const timelineContainer = document.getElementById('timeline-container');
  if (timelineContainer) {
      // Nettoyage initial pour éviter les doublons au re-render
      timelineContainer.innerHTML = `
        <div id="timeline-indicator" style="position:absolute; top:-2px; bottom:-2px; background:rgba(255, 0, 0, 0.5); border-left:2px solid red; border-right:2px solid red; z-index:10; display:none; pointer-events:none; box-sizing:border-box;"></div>
        <div id="timeline-layer-normal" style="position:absolute; top:0; left:0; width:100%; height:100%;"></div>
        <div id="timeline-layer-deep" style="position:absolute; top:0; left:0; width:100%; height:100%; display:none;"></div>
      `;

      const layerNormal = document.getElementById('timeline-layer-normal');
      const layerDeep = document.getElementById('timeline-layer-deep');

      // 1. Génération de la frise classique (0 - 600 Ma)
      GEOLOGICAL_PERIODS.forEach(p => { 
          const pctWidth = ((p.start - p.end) / 600) * 100; 
          const pctLeft = ((600 - p.start) / 600) * 100; 
          const block = document.createElement('div'); 
          block.style.cssText = `position:absolute; left:${pctLeft}%; width:${pctWidth}%; top:0; bottom:0; background-color:${p.color}; border-right:1px solid rgba(0,0,0,0.2); box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:10px; color:rgba(0,0,0,0.8); overflow:hidden; cursor:help;`; 
          block.title = `${p.name} (${p.start} - ${p.end} Ma)`; block.innerText = p.abbr; 
          layerNormal?.appendChild(block); 
      });

      // 2. Génération de la frise Précambrien profond (0 - 4500 Ma)
      const { PRECAMBRIAN_EONS } = require('./utils'); // Récupération sécurisée de la constante
      PRECAMBRIAN_EONS.forEach((e: any) => {
          const pctWidth = ((e.start - e.end) / 4500) * 100;
          const pctLeft = ((4500 - e.start) / 4500) * 100;
          const block = document.createElement('div');
          block.style.cssText = `position:absolute; left:${pctLeft}%; width:${pctWidth}%; top:0; bottom:0; background-color:${e.color}; border-right:1px solid rgba(0,0,0,0.2); box-sizing:border-box; display:flex; align-items:center; justify-content:center; font-size:10px; color:rgba(255,255,255,0.9); overflow:hidden; cursor:help; font-weight:bold;`;
          block.title = `${e.name} (${e.start} - ${e.end} Ma)`; block.innerText = e.abbr;
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
      btnStart: document.getElementById('btn-start') as HTMLButtonElement,
      welcomeOverlay: document.getElementById('welcome-overlay') as HTMLElement,
      btnSave: document.getElementById('btn-save') as HTMLElement, 
      btnSaveAs: document.getElementById('btn-save-as') as HTMLElement, 
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
      btnChronoLanes: document.getElementById('btn-chrono-lanes') as HTMLButtonElement,
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
      btnNewWindow: document.getElementById('btn-new-window') as HTMLElement, // Ligne à ajouter
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
      btnToggleRibbon: document.getElementById('btn-toggle-ribbon') as HTMLButtonElement,
      btnToggleAbbrev: document.getElementById('btn-toggle-abbrev') as HTMLButtonElement,
      setCountInvalid: document.getElementById('set-count-invalid') as HTMLInputElement,
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
    el('lbl-topbar-export', t('topbar.file.export'));
    
    el('lbl-topbar-view', t('topbar.view'));
    el('btn-recenter', t('topbar.view.recenter'));
    el('btn-center-root', t('topbar.view.center_root'));
    el('btn-expand-all', t('topbar.view.expand'));
    
    el('lbl-topbar-help', t('topbar.help'));
    el('btn-guide', t('topbar.help.guide'));
    el('btn-shortcuts', t('topbar.help.shortcuts'));
    el('btn-patch', t('topbar.help.patch'));
    el('btn-check-update', t('topbar.help.update'));
    el('lbl-settings-autoupdate', t('settings.auto_update'));
    el('btn-credits', t('topbar.help.credits'));
    
    el('btn-toggle-ribbon', t('topbar.btn.style'));
    el('btn-settings', '&#9881;');

    el('lbl-side-diagnose', t('label.diagnose') + ' :');
    el('lbl-side-biblio', t('label.biblio') + ' :');
    pl('inp-diagnose', t('placeholder.diagnose'));
    pl('inp-biblio', t('placeholder.biblio'));

    el('lbl-side-synonym', t('label.synonym_of') + ' :');
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
    if (ui.btnToggleAbbrev) ui.btnToggleAbbrev.title = t('topbar.btn.abbrev');

    // Accueil
    const subtitle = document.querySelector('#welcome-overlay p');
    if (subtitle) subtitle.innerHTML = t('welcome.subtitle');
    el('btn-start', t('welcome.new_project'));
    const tip = document.querySelector('#welcome-overlay i');
    if (tip) tip.innerHTML = t('welcome.tip');
    const recentTitle = document.querySelector('#recent-files-container div');
    if (recentTitle) recentTitle.innerHTML = t('welcome.recent');
    
    // Panneau Latéral
    el('lbl-side-status', t('label.status') + ' :');
    el('lbl-side-rank', t('label.rank') + ' :');
    el('lbl-side-date', t('label.date') + ' :');
    el('lbl-side-author', t('label.author') + ' :');
    el('lbl-side-dist', t('label.dist') + ' :');
    el('lbl-side-size', t('label.size') + ' :');
    el('lbl-side-mass', t('label.mass') + ' :');
    el('lbl-side-period', t('label.period') + ' :');
    el('lbl-side-synapo', t('label.synapo') + ' :');
    el('lbl-side-notes', t('label.notes') + ' :');
    el('lbl-side-iucn', t('label.iucn') + ' :');
    el('lbl-side-illus', t('label.illustration'));
    
    el('btn-export-fiche', t('sidepanel.export'));
    el('btn-close-panel', t('btn.close'));
    el('btn-upload-sheetImage', t('btn.upload_illus'));
    el('btn-clear-sheetImage', t('btn.delete_illus'));
    
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