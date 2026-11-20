import { t, LANGS, LANG_NAMES } from './i18n';
import { BRAND, brandMediaHTML } from './brand';

export const APP_CSS = `
  :root { --bg-panel: #f4f4f4; --text-main: #000000; --border-color: #cccccc; --bg-topbar: #ffffff; --text-topbar: #000000; --bg-hover: #e0e0e0; --bg-input: #ffffff; --text-input: #000000; --panel-shadow: 0 4px 15px rgba(0,0,0,0.1); --btn-radius: 3px; --ui-font: system-ui, -apple-system, sans-serif; }
  [data-theme="dark"] { --bg-panel: #2a2a2a; --text-main: #eeeeee; --border-color: #555555; --bg-topbar: #222222; --text-topbar: #eeeeee; --bg-hover: #444444; --bg-input: #333333; --text-input: #eeeeee; --panel-shadow: 0 4px 15px rgba(0,0,0,0.5); --btn-radius: 3px; --ui-font: system-ui, -apple-system, sans-serif; }
  [data-theme="sepia"] { --bg-panel: #eee8d5; --text-main: #4a3b2c; --border-color: #d1c8b4; --bg-topbar: #eee8d5; --text-topbar: #4a3b2c; --bg-hover: #e0d7c3; --bg-input: #fdf6e3; --text-input: #4a3b2c; --panel-shadow: 0 4px 15px rgba(74,59,44,0.15); --btn-radius: 3px; --ui-font: 'Times New Roman', Times, serif; }
  [data-theme="ingen"] { --bg-panel: #c0c0c0; --text-main: #000000; --border-color: #808080; --bg-topbar: #000080; --text-topbar: #ffffff; --bg-hover: #000080; --bg-input: #ffffff; --text-input: #000000; --panel-shadow: inset -2px -2px #0a0a0a, inset 2px 2px #dfdfdf; --btn-radius: 0px; --ui-font: 'Courier New', Courier, monospace; }
  [data-theme="console"] { --bg-panel: #050505; --text-main: #00ff41; --border-color: #008f11; --bg-topbar: #000000; --text-topbar: #00ff41; --bg-hover: #003b00; --bg-input: #000000; --text-input: #00ff41; --panel-shadow: 0 4px 6px rgba(0,255,65,0.1); --btn-radius: 3px; --ui-font: 'Courier New', Courier, monospace; }
  [data-theme="high-contrast"] { --bg-panel: #000000; --text-main: #ffffff; --border-color: #ffffff; --bg-topbar: #000000; --text-topbar: #ffffff; --bg-hover: #333333; --bg-input: #000000; --text-input: #ffffff; --panel-shadow: none; --btn-radius: 0px; --ui-font: system-ui, -apple-system, sans-serif; }
  [data-theme="dimmed"] { --bg-panel: #2b2b2b; --text-main: #a9a9a9; --border-color: #555555; --bg-topbar: #222222; --text-topbar: #a9a9a9; --bg-hover: #404040; --bg-input: #262626; --text-input: #a9a9a9; --panel-shadow: 0 4px 6px rgba(0,0,0,0.3); --btn-radius: 3px; --ui-font: system-ui, -apple-system, sans-serif; }
  
  body { background-color: var(--bg-panel); color: var(--text-main); margin: 0; overflow: hidden; font-family: var(--ui-font); font-size: 12px; }
  /* Canevas sous la barre du haut ET le ruban (--topbar-h, tenu à jour par ribbon.ts), au-dessus de la barre des feuilles.
     Hauteur donnée par top/bottom : le height:100vh de index.html le faisait déborder sous la fenêtre. */
  #app { background-color: #ffffff !important; position: absolute; top: calc(var(--topbar-h, 36px) + 4px); bottom: 35px; left: 0; right: 0; width: auto !important; height: auto !important; }
  input, select, textarea, button { font-family: var(--ui-font); border-radius: var(--btn-radius); font-size: 12px; }
  input, select, textarea { background-color: var(--bg-input); color: var(--text-input); border: 1px solid var(--border-color); outline:none; }
  button { color: var(--text-main); }
  [data-theme="ingen"] .menu-item:hover { background-color: #000080 !important; color: #ffffff !important; }
  [data-theme="console"] .menu-item:hover { background-color: #003b00 !important; color: #00ff41 !important; }
  [data-theme="high-contrast"] .menu-item:hover { background-color: #ffffff !important; color: #000000 !important; }

  input, select, textarea { background-color: var(--bg-input); color: var(--text-input); border: 1px solid var(--border-color); outline:none; }
  button { color: var(--text-main); } /* <-- Ligne à ajouter */
`;

/**
 * Hub d'accueil (phase 4) : nouveau document à partir d'un modèle, ouverture, projets récents (cartes avec
 * miniature, remplies par file-io.ts › loadRecentFilesUI), choix de la langue au premier lancement.
 * Les listes « Nouveau » / « Ouvrir » sont dessinées comme un petit cladogramme (motif du logo).
 * Styles : VISUAL_CSS (visual.ts) ; comportement : hub.ts.
 */
export const getWelcomeHTML = (version: string, modeLogos: { standard: string; comb: string; chrono: string }) => `
  <div id="welcome-overlay" class="hub" role="dialog" aria-label="CladisTree">
    <header class="hub-head">
      ${brandMediaHTML(BRAND.hub, 'hub-logo', 'CladisTree', undefined, 'topbar')}
      <div class="hub-titles">
        <div class="hub-title">CladisTree</div>
        <div class="hub-sub" id="hub-subtitle">${t('welcome.subtitle')}</div>
      </div>
      <span class="hub-version">${t('welcome.version')} ${version}</span>
      <button class="hub-close" id="hub-close" title="${t('hub.back')}" style="display:none;">${t('hub.back')} &#x2192;</button>
    </header>
    <main class="hub-body">
      <section class="hub-col hub-start">
        <h2 class="hub-h" id="hub-new-title">${t('hub.new')}</h2>
        <ul class="hub-tree" data-topology="standard,comb;chrono">
          ${(['standard', 'comb', 'chrono'] as const).map((mode, k) => `
          <li style="--i:${k}" data-key="${mode}"><button class="hub-action" data-template="${mode}">
            <img class="hub-mode-icon" src="${modeLogos[mode]}" alt="" draggable="false">
            <span class="hub-action-text"><b>${t('hub.tpl.' + mode)}</b><small>${t('hub.tpl.' + mode + '_desc')}</small></span>
          </button></li>`).join('')}
        </ul>
        <h2 class="hub-h" id="hub-open-title">${t('hub.open')}</h2>
        <ul class="hub-tree" data-topology="open">
          <li style="--i:3" data-key="open"><button class="hub-action" id="hub-open">
            <span class="hub-open-glyph" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="hub-action-text"><b>${t('hub.open_file')}</b><small>${t('hub.open_formats')}</small></span>
          </button></li>
        </ul>
        <p class="hub-tip" id="hub-tip">${t('welcome.tip')}</p>
      </section>
      <section class="hub-col hub-recent" id="recent-files-container">
        <h2 class="hub-h" id="hub-recent-title">${t('welcome.recent')}</h2>
        <div id="recent-files-list" class="hub-grid"></div>
        <p class="hub-empty" id="hub-recent-empty">${t('hub.recent_empty')}</p>
      </section>
    </main>
    <div class="hub-lang" id="hub-lang" style="display:none;">
      <div class="hub-lang-box">
        ${brandMediaHTML(BRAND.logo, 'hub-lang-logo')}
        <div class="hub-lang-title">Langue &middot; Language &middot; Idioma &middot; Lingua &middot; Sprache</div>
        <div class="hub-lang-choices">
          ${LANGS.map(l => `<button class="hub-action" data-lang="${l}"><span class="hub-action-text"><b>${LANG_NAMES[l]}</b></span></button>`).join('')}
        </div>
        <div class="hub-lang-note">Modifiable ensuite dans les Paramètres &middot; Can be changed later in Settings</div>
      </div>
    </div>
  </div>
`;

export const CREDITS_HTML = `
  <div style="background:var(--bg-topbar); color:var(--text-topbar); padding:30px 40px; border-radius:8px; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.5); max-width:400px; border:1px solid var(--border-color);">
    <h2 style="margin:0 0 15px 0; font-size:24px; color:#2196F3; font-family:serif;">CladisTree</h2>
    <p style="font-size:14px; margin-bottom:10px;">${t('credits.created')} <strong>Nassim ENNASRI</strong></p>
    <p style="font-size:12px; margin-bottom:25px; opacity:0.8;">${t('credits.ai')}</p>
    <button id="btn-close-credits" style="padding:8px 20px; font-size:12px; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; cursor:pointer; font-weight:bold; box-shadow:var(--panel-shadow);">${t('btn.close')}</button>
  </div>
`;

const menuItemStyle = "padding:6px 12px; cursor:pointer;";
export const CONTEXT_MENU_HTML = `
  <div class="menu-item" id="cmenu-edit" style="${menuItemStyle}">${t('menu.edit')}</div>
  <div class="menu-item" id="cmenu-style" style="${menuItemStyle}">${t('menu.style')}</div>
  <div class="menu-item" id="cmenu-compile" style="${menuItemStyle} font-weight:bold;">${t('menu.compile')}</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-box-add" style="${menuItemStyle} font-weight:bold;">${t('menu.box_add')}</div>
  <div class="menu-item" id="cmenu-box-out" style="${menuItemStyle}">${t('menu.box_out')}</div>
  <div class="menu-item" id="cmenu-box-remove" style="${menuItemStyle}">${t('menu.box_remove')}</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-sheet-new" style="${menuItemStyle}">${t('menu.sheet_new')}</div>
  <div class="menu-item" id="cmenu-sheet-open" style="${menuItemStyle}">${t('menu.sheet_open')}</div>
  <div class="menu-item" id="cmenu-sheet-remove" style="${menuItemStyle}">${t('menu.sheet_remove')}</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-cut" style="${menuItemStyle}">${t('menu.cut')}</div>
  <div class="menu-item" id="cmenu-copy" style="${menuItemStyle}">${t('menu.copy')}</div>
  <div class="menu-item" id="cmenu-paste" style="${menuItemStyle}">${t('menu.paste')}</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-graft" style="${menuItemStyle} font-weight:bold; color:#2196F3;">${t('menu.graft')}</div>
  <div class="menu-item" id="cmenu-export-branch" style="${menuItemStyle}">${t('menu.export_branch')}</div>
`;

export const STYLE_MENU_HTML = `
  <div id="style-drag-handle" style="width:100%; height:20px; background:var(--bg-topbar); color:var(--text-topbar); cursor:grab; margin-bottom:4px; text-align:center; line-height:20px; user-select:none; font-weight:bold;">${t('style.title')}</div>
  <div id="style-text-section" style="display:flex; flex-direction:column; gap:4px;">
    <div style="font-weight:bold; text-align:center;">${t('style.text')}</div>
    <select id="style-font" style="width:100%; padding:3px;">
        <option value="serif">Serif (Défaut)</option>
        <option value="sans-serif">Sans-serif</option>
        <option value="monospace">Monospace</option>
        <option value="Times New Roman, Times, serif">Times New Roman</option>
        <option value="Arial, Helvetica, sans-serif">Arial</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="Courier New, Courier, monospace">Courier New</option>
    </select>
    <div style="display:flex; gap:4px; align-items:center;"><span>${t('style.size')}</span><input type="number" id="style-size" style="width:100%; padding:3px;" min="10" max="40" value="16"></div>
    <div style="display:flex; gap:4px;"><button id="style-bold" title="${t('style.bold_tooltip')}" style="flex:1; font-weight:bold; cursor:pointer; padding:4px; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color);">B</button><button id="style-italic" title="${t('style.italic_tooltip')}" style="flex:1; font-style:italic; font-family:serif; cursor:pointer; padding:4px; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color);">I</button></div>
  </div>
  
  <div id="style-node-frame-section" style="display:flex; flex-direction:column; gap:4px;">
    <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
    <div style="font-weight:bold; text-align:center;">${t('style.node_frame')}</div>
    <div style="display:flex; gap:4px; align-items:center;">
      <label style="flex:1; display:flex; align-items:center; gap:4px; cursor:pointer;">
        <input type="checkbox" id="style-node-frame"> ${t('style.enable')}
      </label>
      <input type="color" id="style-node-frame-color" style="flex:1; height:20px; border:none; padding:0; cursor:pointer;" value="#000000">
    </div>
  </div>

  <div id="style-box-section" style="display:none; flex-direction:column; gap:4px;">
    <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
    <div style="font-weight:bold; text-align:center;">${t('style.box_params')}</div>
    <input type="text" id="style-box-name" placeholder="${t('style.box_name')}" style="width:100%; padding:3px; box-sizing:border-box; margin-bottom:2px;">
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">${t('style.color')}</span><input type="color" id="style-box-color" style="flex:2; height:20px; border:none; padding:0; cursor:pointer;" value="#FF9800"></div>
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">${t('style.opacity')}</span><input type="range" id="style-box-opacity" style="flex:2;" min="0" max="100" value="10"></div>
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">${t('style.border')}</span><select id="style-box-border-style" style="flex:2; padding:2px;"><option value="solid">${t('style.border_solid')}</option><option value="dashed">${t('style.border_dashed')}</option><option value="dotted">${t('style.border_dotted')}</option></select></div>
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">${t('style.thickness')}</span><input type="number" id="style-box-border-width" style="flex:2; padding:2px;" min="0" max="20" value="2"></div>
  </div>
  <div id="style-img-section" style="display:flex; flex-direction:column; gap:4px;">
    <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
    <div style="font-weight:bold; text-align:center;">${t('style.picto')}</div>
    <input type="file" id="style-img-file" accept="image/png, image/jpeg, image/svg+xml" style="width:100%; padding:3px; box-sizing:border-box;">
    <div style="display:flex; gap:4px; align-items:center;"><span>${t('style.size')}</span><input type="number" id="style-img-size" style="width:100%; padding:3px;" min="10" max="300" value="150"></div>
    <select id="style-img-pos" style="width:100%; padding:3px;"><option value="left">${t('style.pos_left')}</option><option value="right">${t('style.pos_right')}</option><option value="top">${t('style.pos_top')}</option><option value="bottom">${t('style.pos_bottom')}</option></select>
    <button id="style-img-clear" style="width:100%; padding:4px; cursor:pointer; color:#d32f2f; border:1px solid #d32f2f; background:transparent;">${t('style.img_delete')}</button>
  </div>
`;

export const COMPILE_MODAL_HTML = `
  <h3 style="margin:0; border-bottom:1px solid var(--border-color); padding-bottom:10px;">${t('compile.title')}</h3>
  <label style="font-weight:bold;">${t('compile.filter')}</label>
  <select id="compile-rank" style="padding:6px;"><option value="Tous">${t('compile.all')}</option></select>
  <div style="display:flex; gap:10px; margin-top:10px; justify-content:flex-end;">
    <button id="compile-cancel" style="padding:6px 12px; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:var(--btn-radius);">${t('btn.cancel')}</button>
    <button id="compile-generate" style="padding:6px 12px; cursor:pointer; background:#2196F3; color:white; border:none; font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">${t('compile.generate')}</button>
  </div>
`;

export const TABLE_MODAL_HTML = `
  <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 20px; border-bottom:1px solid var(--border-color); background:var(--bg-topbar); color:var(--text-topbar);">
    <h2 id="table-title" style="margin:0; font-size:16px;">${t('table.title')}</h2>
    <div>
      <button id="table-export" style="padding:5px 10px; margin-right:10px; cursor:pointer; background:#4CAF50; color:white; border:none; font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">${t('table.export')}</button>
      <button id="table-close" style="padding:5px 10px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">${t('btn.close')}</button>
    </div>
  </div>
  <div style="flex:1; overflow:auto; padding:10px; background:#ffffff;">
    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
      <thead style="background:var(--bg-hover); position:sticky; top:0; z-index:10; color:var(--text-main);">
        <tr>
          <th style="padding:6px; border:1px solid var(--border-color);">${t('label.name')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.status')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.rank')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.period')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.date')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.author')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.size')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.mass')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.dist')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.synapo')}</th><th style="padding:6px; border:1px solid var(--border-color);">${t('label.notes')}</th>
        </tr>
      </thead>
      <tbody id="data-table-body" style="color:var(--text-main);"></tbody>
    </table>
  </div>
`;

// EMPTY_DATA (champs d'une fiche vide) : voir config.ts. L'ancienne copie d'ici, inutilisée, avait des valeurs
// fausses (statut traduit au lieu de la valeur canonique « Valide », imgSize 30 au lieu de 150).

export const TAXONOMIC_RANKS = ['Clade (non-classé)', 'Domaine', 'Règne', 'Sous-règne', 'Embranchement (Phylum)', 'Sous-embranchement', 'Super-classe', 'Classe', 'Sous-classe', 'Infra-classe', 'Super-ordre', 'Ordre', 'Sous-ordre', 'Infra-ordre', 'Micro-ordre', 'Parv-ordre', 'Super-famille', 'Famille', 'Sous-famille', 'Tribu', 'Sous-tribu', 'Genre', 'Sous-genre', 'Espèce', 'Sous-espèce'];

// Âges géologiques : voir chrono-data.ts (source unique, charte ICS).

// --- FONCTIONS UTILITAIRES MANQUANTES ---

export const measureTextWidth = (
    name: string,
    extinct: boolean,
    isBold: boolean,
    isItalic: boolean,
    collapsed: boolean,
    hasLink: boolean,
    fontSize: number,
    fontFamily: string
): number => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    let displayText = name || t('default.unnamed');
    if (extinct) displayText = "\u2020 " + displayText;
    if (collapsed) displayText += " [+]"; 
    if (hasLink) displayText += " \u2794";     

    const fontStyle = isItalic ? "italic" : "normal";
    const fontWeight = isBold ? "bold" : "normal";
    const font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;

    if (context) {
        context.font = font;
        const lines = displayText.split('\n');
        let maxWidth = 0;
        lines.forEach(line => {
            const w = context.measureText(line).width;
            if (w > maxWidth) maxWidth = w;
        });
        return maxWidth + 30; 
    }
    
    return displayText.length * (fontSize * 0.6) + 30; 
};

export const getImageRatio = (base64Str: string): Promise<number> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.width / img.height);
        img.onerror = () => resolve(1); 
        img.src = base64Str;
    });
};

export const customPrompt = (message: string, defaultText: string, callback: (val: string | null) => void) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:10000; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(2px);';
    
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-panel); color:var(--text-main); padding:20px; border-radius:var(--btn-radius); box-shadow:var(--panel-shadow); min-width:300px; display:flex; flex-direction:column; gap:10px; border:1px solid var(--border-color);';
    
    const label = document.createElement('label');
    label.innerText = message;
    label.style.fontWeight = 'bold';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = defaultText || '';
    input.style.cssText = 'padding:8px; width:100%; box-sizing:border-box; border:1px solid var(--border-color); border-radius:var(--btn-radius); background:var(--bg-input); color:var(--text-input);';
    
    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex; justify-content:flex-end; gap:10px; margin-top:10px;';
    
    const btnCancel = document.createElement('button');
    btnCancel.innerText = t('btn.cancel');
    btnCancel.style.cssText = 'padding:6px 12px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); border-radius:var(--btn-radius);';
    
    const btnOk = document.createElement('button');
    btnOk.innerText = t('btn.ok');
    btnOk.style.cssText = 'padding:6px 12px; cursor:pointer; background:#2196F3; color:white; border:none; font-weight:bold; border-radius:var(--btn-radius);';
    
    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnOk);
    box.appendChild(label);
    box.appendChild(input);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    
    input.focus();
    input.select();
    
    const close = (val: string | null) => {
        document.body.removeChild(overlay);
        callback(val);
    };
    
    btnCancel.onclick = () => close(null);
    btnOk.onclick = () => close(input.value);
    input.onkeydown = (e) => {
        if (e.key === 'Enter') close(input.value);
        if (e.key === 'Escape') close(null);
    };
};