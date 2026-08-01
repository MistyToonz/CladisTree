export const APP_CSS = `
  :root { --bg-panel: #f4f4f4; --text-main: #000000; --border-color: #cccccc; --bg-topbar: #ffffff; --text-topbar: #000000; --bg-hover: #e0e0e0; --bg-input: #ffffff; --text-input: #000000; --panel-shadow: 0 4px 15px rgba(0,0,0,0.1); --btn-radius: 3px; --ui-font: system-ui, -apple-system, sans-serif; }
  [data-theme="dark"] { --bg-panel: #2a2a2a; --text-main: #eeeeee; --border-color: #555555; --bg-topbar: #222222; --text-topbar: #eeeeee; --bg-hover: #444444; --bg-input: #333333; --text-input: #eeeeee; --panel-shadow: 0 4px 15px rgba(0,0,0,0.5); --btn-radius: 3px; --ui-font: system-ui, -apple-system, sans-serif; }
  [data-theme="sepia"] { --bg-panel: #eee8d5; --text-main: #4a3b2c; --border-color: #d1c8b4; --bg-topbar: #eee8d5; --text-topbar: #4a3b2c; --bg-hover: #e0d7c3; --bg-input: #fdf6e3; --text-input: #4a3b2c; --panel-shadow: 0 4px 15px rgba(74,59,44,0.15); --btn-radius: 3px; --ui-font: 'Times New Roman', Times, serif; }
  [data-theme="ingen"] { --bg-panel: #c0c0c0; --text-main: #000000; --border-color: #808080; --bg-topbar: #000080; --text-topbar: #ffffff; --bg-hover: #000080; --bg-input: #ffffff; --text-input: #000000; --panel-shadow: inset -2px -2px #0a0a0a, inset 2px 2px #dfdfdf; --btn-radius: 0px; --ui-font: 'Courier New', Courier, monospace; }
  body { background-color: var(--bg-panel); color: var(--text-main); margin: 0; overflow: hidden; font-family: var(--ui-font); font-size: 12px; }
  #app { background-color: #ffffff !important; position: absolute; top: 40px; bottom: 35px; left: 0; right: 0; }
  input, select, textarea, button { font-family: var(--ui-font); border-radius: var(--btn-radius); font-size: 12px; }
  input, select, textarea { background-color: var(--bg-input); color: var(--text-input); border: 1px solid var(--border-color); outline:none; }
  [data-theme="ingen"] .menu-item:hover { background-color: #000080 !important; color: #ffffff !important; }
`;

export const getWelcomeHTML = (logoUrl: string, version: string) => `
  <div style="background:var(--bg-topbar); color:var(--text-topbar); padding:40px 50px; border-radius:8px; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.5); max-width:450px; border:1px solid var(--border-color); position:relative;">
    <img src="${logoUrl}" alt="PhyloTree Logo" style="height:80px; margin-bottom:15px; display:block; margin-left:auto; margin-right:auto; object-fit:contain;">
    <h1 style="margin:0 0 10px 0; font-size:36px; color:#2196F3; font-family:serif; letter-spacing:1px;">PhyloTree</h1>
    <p style="font-size:14px; margin-bottom:25px; opacity:0.8;">L'outil de création de cladogrammes interactifs.</p>
    <div style="font-size:12px; background:var(--bg-panel); color:var(--text-main); padding:15px; border-radius:4px; margin-bottom:25px; border:1px dashed var(--border-color);">
      <i>Astuce : Vous pouvez glisser-déposer un fichier (.phylo, .xmind) directement ici pour l'ouvrir.</i>
    </div>
    <button id="btn-start" style="padding:10px 25px; font-size:14px; background:#4CAF50; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.2); transition:transform 0.1s;">Commencer</button>
    <div style="margin-top:20px; font-size:11px; opacity:0.5; font-weight:bold;">Version ${version}</div>
  </div>
`;

export const CREDITS_HTML = `
  <div style="background:var(--bg-topbar); color:var(--text-topbar); padding:30px 40px; border-radius:8px; text-align:center; box-shadow:0 10px 40px rgba(0,0,0,0.5); max-width:400px; border:1px solid var(--border-color);">
    <h2 style="margin:0 0 15px 0; font-size:24px; color:#2196F3; font-family:serif;">PhyloTree</h2>
    <p style="font-size:14px; margin-bottom:10px;">Créé et pensé par <strong>Nassim ENNASRI</strong></p>
    <p style="font-size:12px; margin-bottom:25px; opacity:0.8;">Code généré avec l'assistance de l'IA Google Gemini.</p>
    <button id="btn-close-credits" style="padding:8px 20px; font-size:12px; background:var(--bg-panel); color:var(--text-main); border:1px solid var(--border-color); border-radius:4px; cursor:pointer; font-weight:bold; box-shadow:var(--panel-shadow);">Fermer</button>
  </div>
`;

const menuItemStyle = "padding:6px 12px; cursor:pointer;";
export const CONTEXT_MENU_HTML = `
  <div class="menu-item" id="cmenu-edit" style="${menuItemStyle}">✎ Éditer la fiche</div>
  <div class="menu-item" id="cmenu-style" style="${menuItemStyle}">◧ Personnaliser le style</div>
  <div class="menu-item" id="cmenu-compile" style="${menuItemStyle} font-weight:bold;">▤ Compiler les données</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-box-add" style="${menuItemStyle} font-weight:bold;">⚏ Encadrer la sélection</div>
  <div class="menu-item" id="cmenu-box-out" style="${menuItemStyle}">⍐ Sortir du cadre</div>
  <div class="menu-item" id="cmenu-box-remove" style="${menuItemStyle}">✖ Supprimer le cadre</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-sheet-new" style="${menuItemStyle}">⎘ Nouvelle feuille ici</div>
  <div class="menu-item" id="cmenu-sheet-open" style="${menuItemStyle}">⎗ Ouvrir cette feuille</div>
  <div class="menu-item" id="cmenu-sheet-remove" style="${menuItemStyle}">✖ Fusionner avec le parent</div>
  <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
  <div class="menu-item" id="cmenu-copy" style="${menuItemStyle}">⎘ Copier le clade</div>
  <div class="menu-item" id="cmenu-paste" style="${menuItemStyle}">⎗ Coller ici</div>
`;

export const STYLE_MENU_HTML = `
  <div id="style-drag-handle" style="width:100%; height:20px; background:var(--bg-topbar); color:var(--text-topbar); cursor:grab; margin-bottom:4px; text-align:center; line-height:20px; user-select:none; font-weight:bold;">Style</div>
  <div id="style-text-section" style="display:flex; flex-direction:column; gap:4px;">
    <div style="font-weight:bold; text-align:center;">Texte</div>
    <select id="style-font" style="width:100%; padding:3px;"><option value="serif">Serif</option><option value="sans-serif">Sans-serif</option><option value="monospace">Monospace</option></select>
    <div style="display:flex; gap:4px; align-items:center;"><span>Taille:</span><input type="number" id="style-size" style="width:100%; padding:3px;" min="10" max="40" value="16"></div>
    <div style="display:flex; gap:4px;"><button id="style-bold" title="Gras (Ctrl+B)" style="flex:1; font-weight:bold; cursor:pointer; padding:4px; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color);">B</button><button id="style-italic" title="Italique (Ctrl+I)" style="flex:1; font-style:italic; font-family:serif; cursor:pointer; padding:4px; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color);">I</button></div>
  </div>
  
  <div id="style-node-frame-section" style="display:flex; flex-direction:column; gap:4px;">
    <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
    <div style="font-weight:bold; text-align:center;">Cadre du taxon</div>
    <div style="display:flex; gap:4px; align-items:center;">
      <label style="flex:1; display:flex; align-items:center; gap:4px; cursor:pointer;">
        <input type="checkbox" id="style-node-frame"> Activer
      </label>
      <input type="color" id="style-node-frame-color" style="flex:1; height:20px; border:none; padding:0; cursor:pointer;" value="#000000">
    </div>
  </div>

  <div id="style-box-section" style="display:none; flex-direction:column; gap:4px;">
    <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
    <div style="font-weight:bold; text-align:center;">Paramètres du Cadre Global</div>
    <input type="text" id="style-box-name" placeholder="Nom du cadre" style="width:100%; padding:3px; box-sizing:border-box; margin-bottom:2px;">
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">Couleur:</span><input type="color" id="style-box-color" style="flex:2; height:20px; border:none; padding:0; cursor:pointer;" value="#FF9800"></div>
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">Opacité:</span><input type="range" id="style-box-opacity" style="flex:2;" min="0" max="100" value="10"></div>
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">Bordure:</span><select id="style-box-border-style" style="flex:2; padding:2px;"><option value="solid">Continue</option><option value="dashed">Tirets</option><option value="dotted">Points</option></select></div>
    <div style="display:flex; gap:4px; align-items:center;"><span style="flex:1;">Épaisseur:</span><input type="number" id="style-box-border-width" style="flex:2; padding:2px;" min="0" max="20" value="2"></div>
  </div>
  <div id="style-img-section" style="display:flex; flex-direction:column; gap:4px;">
    <div style="border-top:1px solid var(--border-color); margin:2px 0;"></div>
    <div style="font-weight:bold; text-align:center;">Pictogramme</div>
    <input type="file" id="style-img-file" accept="image/png, image/jpeg, image/svg+xml" style="width:100%; padding:3px; box-sizing:border-box;">
    <div style="display:flex; gap:4px; align-items:center;"><span>Taille:</span><input type="number" id="style-img-size" style="width:100%; padding:3px;" min="10" max="300" value="30"></div>
    <select id="style-img-pos" style="width:100%; padding:3px;"><option value="left">À gauche</option><option value="right">À droite</option><option value="top">Au-dessus</option><option value="bottom">En-dessous</option></select>
    <button id="style-img-clear" style="width:100%; padding:4px; cursor:pointer; color:#d32f2f; border:1px solid #d32f2f; background:transparent;">✖ Supprimer l'image</button>
  </div>
`;

export const COMPILE_MODAL_HTML = `
  <h3 style="margin:0; border-bottom:1px solid var(--border-color); padding-bottom:10px;">Compiler les données</h3>
  <label style="font-weight:bold;">Filtrer par rang taxonomique :</label>
  <select id="compile-rank" style="padding:6px;"><option value="Tous">-- Tous les descendants --</option></select>
  <div style="display:flex; gap:10px; margin-top:10px; justify-content:flex-end;">
    <button id="compile-cancel" style="padding:6px 12px; cursor:pointer; background:var(--bg-input); color:var(--text-input); border:1px solid var(--border-color); border-radius:var(--btn-radius);">Annuler</button>
    <button id="compile-generate" style="padding:6px 12px; cursor:pointer; background:#2196F3; color:white; border:none; font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">Générer</button>
  </div>
`;

export const TABLE_MODAL_HTML = `
  <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 20px; border-bottom:1px solid var(--border-color); background:var(--bg-topbar); color:var(--text-topbar);">
    <h2 id="table-title" style="margin:0; font-size:16px;">Tableau de données</h2>
    <div>
      <button id="table-export" style="padding:5px 10px; margin-right:10px; cursor:pointer; background:#4CAF50; color:white; border:none; font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">⎘ Exporter CSV</button>
      <button id="table-close" style="padding:5px 10px; cursor:pointer; background:var(--bg-input); color:var(--text-main); border:1px solid var(--border-color); font-weight:bold; box-shadow:var(--panel-shadow); border-radius:var(--btn-radius);">✖ Fermer</button>
    </div>
  </div>
  <div style="flex:1; overflow:auto; padding:10px; background:#ffffff;">
    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:13px;">
      <thead style="background:var(--bg-hover); position:sticky; top:0; z-index:10; color:var(--text-main);">
        <tr>
          <th style="padding:6px; border:1px solid var(--border-color);">Nom</th><th style="padding:6px; border:1px solid var(--border-color);">Statut</th><th style="padding:6px; border:1px solid var(--border-color);">Rang</th><th style="padding:6px; border:1px solid var(--border-color);">Période (en Ma)</th><th style="padding:6px; border:1px solid var(--border-color);">Découverte</th><th style="padding:6px; border:1px solid var(--border-color);">Auteur</th><th style="padding:6px; border:1px solid var(--border-color);">Taille</th><th style="padding:6px; border:1px solid var(--border-color);">Masse</th><th style="padding:6px; border:1px solid var(--border-color);">Répartition</th><th style="padding:6px; border:1px solid var(--border-color);">Synapomorphies</th><th style="padding:6px; border:1px solid var(--border-color);">Notes</th>
        </tr>
      </thead>
      <tbody id="data-table-body" style="color:#000;"></tbody>
    </table>
  </div>
`;

export const EMPTY_DATA = { status: "Valide", rank: "Clade (non-classé)", discoveryDate: "", distribution: "", author: "", size: "", mass: "", period: "", synapomorphies: "", notes: "", collapsed: false, hasNewSheet: false, fontFamily: 'serif', fontSize: 16, imgUrl: '', imgSize: 150, imgRatio: 1, imgPos: 'left', hasFrame: false, frameColor: '#000000' };

export const TAXONOMIC_RANKS = ['Clade (non-classé)', 'Domaine', 'Règne', 'Sous-règne', 'Embranchement (Phylum)', 'Sous-embranchement', 'Super-classe', 'Classe', 'Sous-classe', 'Infra-classe', 'Super-ordre', 'Ordre', 'Sous-ordre', 'Infra-ordre', 'Micro-ordre', 'Parv-ordre', 'Super-famille', 'Famille', 'Sous-famille', 'Tribu', 'Sous-tribu', 'Genre', 'Sous-genre', 'Espèce', 'Sous-espèce'];

export const GEOLOGICAL_PERIODS = [ { name: 'Précambrien', abbr: 'pC', start: 600, end: 538.8, color: '#F0A0B0' }, { name: 'Cambrien', abbr: 'Cm', start: 538.8, end: 485.4, color: '#7FA056' }, { name: 'Ordovicien', abbr: 'O', start: 485.4, end: 443.8, color: '#009270' }, { name: 'Silurien', abbr: 'S', start: 443.8, end: 419.2, color: '#B3E1B6' }, { name: 'Dévonien', abbr: 'D', start: 419.2, end: 358.9, color: '#CB8C37' }, { name: 'Carbonifère', abbr: 'C', start: 358.9, end: 298.9, color: '#67A599' }, { name: 'Permien', abbr: 'P', start: 298.9, end: 251.9, color: '#F04028' }, { name: 'Trias', abbr: 'T', start: 251.9, end: 201.4, color: '#812B92' }, { name: 'Jurassique', abbr: 'J', start: 201.4, end: 145, color: '#34B2C9' }, { name: 'Crétacé', abbr: 'K', start: 145, end: 66, color: '#7FC64E' }, { name: 'Paléogène', abbr: 'Pg', start: 66, end: 23, color: '#FDA75F' }, { name: 'Néogène', abbr: 'Ng', start: 23, end: 2.58, color: '#FFE619' }, { name: 'Quaternaire', abbr: 'Q', start: 2.58, end: 0, color: '#F9F97F' } ];