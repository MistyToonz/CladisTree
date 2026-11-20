// ==========================================
// FICHIERS : NOUVEAU, OUVRIR, ENREGISTRER, GREFFER, FEUILLES LIÉES
// ==========================================
// Toute lecture de document passe par migrate() (via doc-session.ts) ; l'enregistrement écrit le format v2.
// Contient aussi les fichiers récents, la copie compatible 1.3, le glisser-déposer de fichiers et l'ouverture depuis l'OS.
// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de
// l'application passent par `ctx` (voir app-context.ts), résolues au moment de l'appel.

import { t } from './i18n';
import { state, stateManager } from './graph-state';
import { openRawDocument, newDocument, commitFromCy, graftElementsFrom } from './doc-session';
import { FutureFormatError } from './doc-model';
import { EMPTY_DATA } from './config';
import { toLegacyV1 } from './migrate';
import { unzipSync, strFromU8 } from 'fflate';
import { getImageRatio } from './utils';
import { toAssetRef } from './asset-store';
import { parseTreeFile, toLegacyDoc, hasNumericInternalLabels, decodeText, tntTaxonNames, nameTntLeaves, NoTreeError, strictConsensus, inferTaxonomy, supportColumnsOf, chooseSupportColumn, tntTagExamples } from './phylo-formats';
import type { SimpleNode } from './phylo-formats';
import { resolveMediaPath } from './fiche-media';
import { resolveAsset } from './asset-store';
import { hideHub } from './hub';
import { toast } from './visual';
import { showLoading, hideLoading, paintFirst } from './loading';
import { elementsToDoc } from './migrate';
import type { AppContext } from './app-context';

export function initFileIO(ctx: AppContext) {
  const { ui, cy } = ctx;

  /** Formats d'arbre lus par phylo-formats.ts. */
  const TREE_EXTS = ['nwk', 'newick', 'tre', 'tree', 'nex', 'nexus', 'tnt'];
  /** Texte d'un fichier d'arbre → document 1.3 (passé ensuite par migrate, comme tout document entrant). */
  // TNT n'écrit que des NUMÉROS de taxons dans un fichier d'arbres : les noms sont dans le fichier de
  // données (xread). TNT en indique le chemin (« for data in … ») ; sinon on propose de le choisir.
  const tntNamesFrom = async (path: string): Promise<string[]> => {
      const r = await window.electronAPI.readFileDirect(path);
      return r.success && r.data ? tntTaxonNames(decodeText(r.data as Uint8Array)) : [];
  };
  /**
   * Arbre importé → document. Avec la taxonomie intelligente (réglage), Genre / Espèce sont reconnus d'après
   * les noms (inferTaxonomy) : l'affichage noms complets / raccourcis s'applique alors à l'arbre importé.
   */
  const toImportedDoc = (tree: SimpleNode) => {
      if (state.appSettings.smartTaxonomy) inferTaxonomy(tree);
      return toLegacyDoc(tree);
  };
  const importTreeText = async (text: string, ext: string, filePath?: string) => {
      const internal = hasNumericInternalLabels(text) ? (confirm(t('import.internal_supports')) ? 'support' : 'name') : 'auto';
      const parsed = parseTreeFile(text, ext, internal);
      if (parsed.numbered) {
          let names: string[] = [];
          if (parsed.dataPath) names = await tntNamesFrom(resolveMediaPath(parsed.dataPath, filePath));
          if (names.length === 0 && confirm(t('import.tnt_pick_data'))) {
              const r = await window.electronAPI.openFile();
              if (r.success && r.data) names = tntTaxonNames(decodeText(r.data as Uint8Array));
          }
          if (names.length) {
              const named = (parsed.all || [parsed.tree]).map(tree => nameTntLeaves(tree, names));
              if (named[0] === 0) alert(t('import.tnt_names_mismatch'));
          }
      }
      // Plusieurs arbres (ex. arbres équiparcimonieux de TNT) : consensus strict ou premier arbre. Exception TNT :
      // un SEUL arbre porte des étiquettes (supports `ttags`, souvent le dernier enregistré) → c'est lui, d'office.
      let tree = parsed.tree;
      if (parsed.treeCount > 1) {
          const all = parsed.all || [parsed.tree];
          const labeled = (parsed.labeled || []).map((l, k) => (l ? k : -1)).filter(k => k >= 0);
          if (labeled.length === 1) {
              tree = all[labeled[0]];
              toast(t('import.tnt_labeled_one').replace('{n}', String(parsed.treeCount)).replace('{k}', String(labeled[0] + 1)));
          } else {
              // Plusieurs arbres étiquetés : choix habituel, en signalant que le consensus perd leurs supports.
              const note = labeled.length > 1 ? '\n\n' + t('import.tnt_labeled_several').replace('{m}', String(labeled.length)) : '';
              const consensus = all.length > 1 ? strictConsensus(all) : null;
              if (consensus && confirm(t('import.consensus').replace('{n}', String(parsed.treeCount)) + note)) return toImportedDoc(consensus);
              if (!consensus) alert(t('import.first_tree').replace('{n}', String(parsed.treeCount)) + note);
          }
      }
      // Étiquettes TNT à plusieurs valeurs (« 6/3 ») : la 1re sert de support, sauf autre choix.
      const columns = supportColumnsOf(tree);
      if (columns > 1) chooseSupportColumn(tree, askSupportColumn(columns, tntTagExamples(tree)));
      return toImportedDoc(tree);
  };
  /**
   * Quelle valeur garder parmi `columns` (0 = la 1re) ? Questions successives OK / Annuler, comme les autres
   * questions de l'import : OK garde la valeur proposée, Annuler passe à la suivante (la dernière est gardée).
   */
  const askSupportColumn = (columns: number, examples: string[]): number => {
      for (let k = 0; k < columns - 1; k++) {
          const other = k + 1 === columns - 1 ? t('import.support_column_keep') : t('import.support_column_next');
          const msg = t('import.support_column').replace('{examples}', examples.join(', ')).replace('{n}', String(columns))
              .replace('{k}', String(k + 1)).replace('{other}', other.replace('{k}', String(k + 2)));
          if (confirm(msg)) return k;
      }
      return columns - 1;
  };
  /** Message d'échec de lecture d'un fichier d'arbre (fichier de données sans arbre : explication). */
  const treeErrorMessage = (err: any) => err instanceof NoTreeError
      ? t(err.kind === 'tnt' ? 'import.tnt_no_tree' : 'import.nexus_no_tree')
      : t('import.tree_error') + ' : ' + (err?.message || err);

  // ---------- Projets récents (hub d'accueil) ----------
  // Entrée : { name, date, path?, mode, thumb?, data? }. Le document n'est gardé dans le stockage local QUE
  // s'il n'a pas de chemin (sinon il est relu sur le disque) : le stockage local est limité (~5 Mo).
  // Miniature créée à l'enregistrement / à l'ouverture (jamais en relisant les fichiers au lancement) :
  // première image de la fiche racine, réduite ; à défaut, le logo du mode (affiché au moment du rendu).
  const MAX_RECENT_FILES = 6;
  const THUMB_W = 320, THUMB_H = 240;
  const modeLogo = (mode?: string) => (mode === 'comb' ? ui.logoComb : mode === 'chrono' ? ui.logoChrono : ui.logoStandard);
  /** Miniature JPEG (4:3, recadrée au centre) de la première image de la fiche racine, ou null. */
  const makeRecentThumb = (): Promise<string | null> => {
      const root = cy.$id(findAbsoluteRoot().id);
      const src = root.length ? resolveAsset(root.data('sheetImage') || root.data('imgUrl') || '') : '';
      if (!src || !src.startsWith('data:image')) return Promise.resolve(null);
      return new Promise(resolve => {
          const img = new Image();
          img.onload = () => {
              try {
                  const canvas = document.createElement('canvas');
                  canvas.width = THUMB_W; canvas.height = THUMB_H;
                  const g = canvas.getContext('2d')!;
                  g.fillStyle = '#ffffff'; g.fillRect(0, 0, THUMB_W, THUMB_H);
                  const scale = Math.max(THUMB_W / img.width, THUMB_H / img.height);
                  const w = img.width * scale, h = img.height * scale;
                  g.drawImage(img, (THUMB_W - w) / 2, (THUMB_H - h) / 2, w, h);
                  resolve(canvas.toDataURL('image/jpeg', 0.82));
              } catch { resolve(null); }
          };
          img.onerror = () => resolve(null);
          img.src = src;
      });
  };
  const readRecents = (): any[] => { try { return JSON.parse(localStorage.getItem('cladistree_recents') || '[]'); } catch { return []; } };
  async function saveToRecentFiles(fileName: string, exportData: any, pathToSave?: string) {
    const thumb = await makeRecentThumb();
    const now = new Date();
    const entry: any = { name: fileName, date: now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                         path: pathToSave, mode: state.layoutMode, ...(thumb ? { thumb } : {}), ...(pathToSave ? {} : { data: exportData }) };
    const same = (f: any) => (pathToSave ? f.path === pathToSave : !f.path && f.name === fileName);
    let recents = [entry, ...readRecents().filter(f => !same(f))].slice(0, MAX_RECENT_FILES);
    try { localStorage.setItem('cladistree_recents', JSON.stringify(recents)); }
    catch {
      // Stockage plein : on garde les entrées sans document intégré, puis sans miniature.
      recents = recents.filter(f => f.path || f === entry);
      try { localStorage.setItem('cladistree_recents', JSON.stringify(recents)); }
      catch {
        try { localStorage.setItem('cladistree_recents', JSON.stringify(recents.map(({ thumb: _t, data: _d, ...f }: any) => f).filter((f: any) => f.path))); }
        catch { console.warn(t('alert.file_too_large')); }
      }
    }
    loadRecentFilesUI();
  }
  async function openRecent(file: any) {
    try {
      let treeData = file.data;
      if (file.path && window.electronAPI && window.electronAPI.readFileDirect) {
        const result = await window.electronAPI.readFileDirect(file.path);
        if (result.success && result.data) treeData = JSON.parse(decodeText(result.data as Uint8Array));
        else if (!treeData) { alert(t('hub.recent_missing') + '\n' + file.path); return; }
      }
      applyOpenedDocument(treeData);
      state.currentFilePath = file.path;
      hideHub();
    } catch (err) { alert(describeOpenError(err, t('alert.recent_error'))); }
  }
  /** Cartes des projets récents dans le hub (miniature, nom, date, type d'arbre). */
  function loadRecentFilesUI() {
    const list = document.getElementById('recent-files-list');
    const empty = document.getElementById('hub-recent-empty');
    if (!list) return;
    const recents = readRecents();
    list.innerHTML = '';
    if (empty) empty.style.display = recents.length ? 'none' : '';
    recents.forEach((file: any, k: number) => {
      const card = document.createElement('button');
      card.className = 'hub-card';
      card.style.setProperty('--i', String(k));
      card.title = file.path || file.name;
      const thumb = document.createElement('div');
      thumb.className = 'hub-thumb';
      const img = document.createElement('img');
      img.alt = ''; img.draggable = false;
      if (file.thumb) img.src = file.thumb;
      else { img.src = modeLogo(file.mode); img.className = 'hub-thumb-mode'; }
      thumb.appendChild(img);
      const meta = document.createElement('div');
      meta.className = 'hub-card-meta';
      const name = document.createElement('div');
      name.className = 'hub-card-name'; name.textContent = file.name;
      const info = document.createElement('div');
      info.className = 'hub-card-info';
      const kind = document.createElement('span'); kind.textContent = t('hub.tpl.' + (file.mode === 'comb' || file.mode === 'chrono' ? file.mode : 'standard'));
      const date = document.createElement('span'); date.textContent = String(file.date || '').replace(' à ', ' ');
      info.append(kind, date);
      meta.append(name, info);
      card.append(thumb, meta);
      card.addEventListener('click', () => openRecent(file));
      list.appendChild(card);
    });
  }
  /**
   * Remplace l'arbre affiché par un document (v1 ou v2, voir migrate.ts). Lève une erreur si le document
   * est illisible, AVANT de toucher à l'arbre courant.
   */
  function applyOpenedDocument(raw: unknown) {
      const { elements, currentRootId } = openRawDocument(raw);
      cy.startBatch();
      cy.elements().remove();
      cy.add(elements);
      state.currentRootId = cy.$id(currentRootId).length > 0 ? currentRootId : (cy.nodes('.taxon').roots().first().id() || 'root');
      // Taxonomie intelligente : rangs (Espèce, Genre) et abréviations (« H. sapiens », « H.sapiens ») revus à
      // chaque ouverture, pour les fichiers écrits avant une règle ou saisis sans elle. Racines exclues (cf. XMind).
      const roots = cy.nodes('.taxon').roots();
      cy.nodes('.taxon').not(roots).forEach((n: any) => ctx.checkAutoRank(n));
      ctx.refreshLayout(true);
      cy.endBatch();
      setTimeout(() => { state.hasUnsavedChanges = false; ctx.setUnsavedState(false); stateManager.resetStacks(); }, 100);
  }
  /** Message d'erreur d'ouverture, avec un cas dédié aux fichiers d'une version plus récente. */
  function describeOpenError(err: unknown, prefix: string): string {
      if (err instanceof FutureFormatError) return t('alert.future_format');
      return prefix + " : " + err;
  }
  /** Nouveau document ; renvoie false si l'utilisateur a annulé (modifications non enregistrées). */
  function createNewTree(): boolean {
      if (state.hasUnsavedChanges) {
          if (!confirm(t('confirm.new_tree'))) return false;
      }
      
      if (ctx.closeCurrentEditor) ctx.closeCurrentEditor();
      ctx.isEditing = false;
      state.activeNode = null;
      state.clipboard = null;
      newDocument();

      cy.startBatch();
      cy.elements().remove();
      // Même petit arbre de départ qu'au lancement, avec de VRAIS noms modifiables. (Avant : un taxon nommé
      // « [ Ramification sans nom ] », texte d'affichage des noms vides enregistré comme nom réel.)
      cy.add([
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'root', name: t('default.root'), extinct: false, isBold: true, isItalic: false, sortIndex: 0, period: "" } },
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'n1', name: 'Clade A', extinct: false, isBold: false, isItalic: false, sortIndex: 0, period: "" } },
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'l1', name: 'Taxon 1', extinct: false, isBold: false, isItalic: true, rank: 'Espèce', sortIndex: 0, period: "" } },
          { group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: 'l2', name: 'Taxon 2', extinct: false, isBold: false, isItalic: true, rank: 'Espèce', sortIndex: 1, period: "" } },
          { group: 'edges', data: { source: 'root', target: 'n1' } }, { group: 'edges', data: { source: 'n1', target: 'l1' } }, { group: 'edges', data: { source: 'n1', target: 'l2' } },
      ]);
      
      state.currentRootId = 'root';
      state.currentFilePath = undefined;
      
      state.layoutMode = state.appSettings.defaultLayout;
      ui.btnLayoutNormal.style.background = state.layoutMode === 'standard' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutNormal.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'standard' ? 'invert(1) brightness(2)' : 'var(--layout-icon-filter, none)';
      ui.btnLayoutComb.style.background = state.layoutMode === 'comb' ? '#2196F3' : 'var(--bg-input)';
      (ui.btnLayoutComb.querySelector('img') as HTMLElement).style.filter = state.layoutMode === 'comb' ? 'invert(1) brightness(2)' : 'var(--layout-icon-filter, none)';

      ctx.refreshLayout(true);
      cy.endBatch();
      
      setTimeout(() => { 
          state.hasUnsavedChanges = false; 
          ctx.setUnsavedState(false); 
          stateManager.resetStacks(); 
          stateManager.resetStacks(); 
      }, 100);
      
      if (ui.sidePanel.style.display === 'block') ctx.closeSidePanel();
      return true;
  }
  /** Racine absolue de l'arbre (au-dessus de la feuille affichée) et nom à proposer pour le fichier. */
  function findAbsoluteRoot(): { id: string; name: string } {
      let trueRoot: any = cy.$id(state.currentRootId);
      while (trueRoot.incomers('node').filter((n: any) => !n.hasClass('box')).length > 0) {
          trueRoot = trueRoot.incomers('node').filter((n: any) => !n.hasClass('box')).first();
      }
      let name = 'Arbre_Phylogenetique';
      if (trueRoot.length > 0 && trueRoot.data('name') && trueRoot.data('name').trim() !== '') name = trueRoot.data('name');
      return { id: trueRoot.id(), name };
  }
  async function executeSave(forceSaveAs = false) {
      const { id: absoluteRootId, name: rootName } = findAbsoluteRoot();

      // Format v2 (doc-model.ts) : taxons, classifications, images partagées.
      const exportData = commitFromCy(cy, absoluteRootId, `CladisTree ${window.electronAPI?.appVersion || ''}`.trim());

      try {
          const dataStr = JSON.stringify(exportData);
          const targetPath = forceSaveAs ? undefined : state.currentFilePath;
          
          const response = await window.electronAPI.saveFile(dataStr, targetPath);
          
          if (response.success && response.filePath) {
              state.currentFilePath = response.filePath; 
              saveToRecentFiles(rootName, exportData, state.currentFilePath); 
              ctx.setUnsavedState(false);
              toast(t('toast.saved'), response.filePath);
              
          } else if (response.error) {
              alert(t('alert.save_error') + response.error);
          }
      } catch (err) {
          console.error(t('alert.backend_error'), err);
      }
  }
  /** Copie lisible par CladisTree 1.3 (classification active seulement, avec pertes : voir toLegacyV1). */
  async function executeSaveLegacyCopy() {
      if (!confirm(t('confirm.legacy_copy'))) return;
      const { id: absoluteRootId, name: rootName } = findAbsoluteRoot();
      const legacy = toLegacyV1(commitFromCy(cy, absoluteRootId));
      try {
          const safeName = rootName.replace(/[\\/:*?"<>|]/g, '_');
          // Toujours via le dialogue (jamais le chemin courant) : la copie ne doit pas écraser le fichier v2.
          const response = await window.electronAPI.saveFile(JSON.stringify(legacy), undefined, `${safeName}_1.3.phylo`);
          if (response.success && response.filePath) toast(t('toast.legacy_saved'), response.filePath);
          else if (response.error) alert(t('alert.save_error') + response.error);
      } catch (err) {
          console.error(t('alert.backend_error'), err);
      }
  }
  ui.btnNew.onclick = createNewTree;
  ui.btnNewWindow.onclick = () => window.electronAPI.openNewInstance();
  // « Enregistrer » et « Enregistrer sous… » n'étaient reliés à rien (seul Ctrl+S enregistrait).
  ui.btnSave.onclick = () => executeSave(false);
  ui.btnSaveAs.onclick = () => executeSave(true);
  ui.btnSaveLegacy.onclick = () => executeSaveLegacyCopy();
  ui.btnLoad.onclick = async () => {
      if (window.electronAPI && window.electronAPI.openFile) {
          const result = await window.electronAPI.openFile(); 
          if (result.success && result.data && result.fileName) {
              await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
              hideHub();
          }
      } else {
          ui.fileInput.click(); 
      }
  };
    /** Greffe un fichier (ou, si `preParsed` est fourni, un document déjà lu : presse-papiers, import). */
    async function handleGraft(file: File | null, targetNode: any, preParsed?: any) {
    ctx.saveState(); 
    const ext = file ? file.name.split('.').pop()?.toLowerCase() : 'phylo';
    const idSuffix = '-' + Date.now().toString(36); 
    const newElements: any[] = [];
    let importedRootId: string | null = null;

    if (ext === 'xmind') {
      try {
        const arrayBuffer = await file.arrayBuffer(); 
        const unzipped = unzipSync(new Uint8Array(arrayBuffer));
        const contentJsonData = unzipped['content.json']; 
        if (!contentJsonData) throw new Error(t('alert.json_not_found'));
        
        const contentStr = strFromU8(contentJsonData); 
        const xmindData = JSON.parse(contentStr); 
        const rootTopic = xmindData[0].rootTopic; 
        importedRootId = rootTopic.id + idSuffix;

        const parseNode = async (node: any, parentId: string | null, depth: number) => {
            const id = node.id + idSuffix; 
            let rawTitle = node.title || ""; 
            if (node.attributedTitle) rawTitle = node.attributedTitle.map((part: any) => part.text).join('');
            let extinct = false; 
            if (rawTitle.startsWith('\u2020 ')) { extinct = true; rawTitle = rawTitle.substring(2); } 
            else if (rawTitle.startsWith('\u2020')) { extinct = true; rawTitle = rawTitle.substring(1); }
            const styleProps = node.style?.properties || {}; 
            const isBold = styleProps["fo:font-weight"] === "700" || styleProps["fo:font-weight"] === "bold"; 
            const isItalic = styleProps["fo:font-style"] === "italic"; 
            let notes = "";
            if (node.labels && node.labels.length > 0) {
                const cleanLabels = node.labels.filter((l: string) => !l.toLowerCase().includes('extinct') && !l.includes('†'));
                if (cleanLabels.length > 0) {
                    notes = t('alert.xmind_labels') + cleanLabels.join(', ');
                }
            }
            
            let imgUrl = ""; let imgRatio = 1;
            if (node.image && node.image.src && node.image.src.startsWith("xap:resources/")) {
                const resourcePath = node.image.src.replace("xap:", ""); const imgData = unzipped[resourcePath];
                if (imgData) { 
                  const chunks = []; const chunkSize = 8192; for (let i = 0; i < imgData.length; i += chunkSize) { chunks.push(String.fromCharCode.apply(null, Array.from(imgData.subarray(i, i + chunkSize)))); } const base64 = btoa(chunks.join('')); const fileExt = resourcePath.split('.').pop()?.toLowerCase(); const mime = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' : fileExt === 'svg' ? 'image/svg+xml' : 'image/png'; 
                  imgUrl = `data:${mime};base64,${base64}`; imgRatio = await getImageRatio(imgUrl);
                }
            }
            newElements.push({ group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: id, name: rawTitle, parent: null, extinct: extinct, isBold: isBold, isItalic: isItalic, notes: notes, imgUrl: toAssetRef(imgUrl), imgRatio: imgRatio, sortIndex: depth } });
            if (parentId) newElements.push({ group: 'edges', data: { source: parentId, target: id } });
            if (node.children && node.children.attached) { let sortCounter = 0; for (const child of node.children.attached) { await parseNode(child, id, sortCounter++); } }
        };
        await parseNode(rootTopic, null, 0);

      } catch (err) { alert(t('alert.graft_error') + err); return; }
    } else {
      try {
        const text = preParsed ? '' : decodeText(new Uint8Array(await file!.arrayBuffer()));
        let parsed: any;
        if (preParsed) parsed = preParsed;
        else if (ext && TREE_EXTS.includes(ext)) {
            try { parsed = await importTreeText(text, ext, (file as any).path); } catch (err) { alert(treeErrorMessage(err)); return; }
        } else parsed = JSON.parse(text);
        const idMap: { [key: string]: string } = {};

        // migrate() (v1 ou v2) → classification active du fichier greffé, images rangées dans le magasin,
        // taxons sans identifiant : ils deviendront de nouveaux taxons de ce document.
        const elementsArray: any[] = graftElementsFrom(parsed).elements;

        const allNodeIds = new Set<string>();
        const allTargetIds = new Set<string>();
        elementsArray.forEach((ele: any) => {
            if (ele.group === 'nodes') allNodeIds.add(ele.data.id);
            if (ele.group === 'edges') allTargetIds.add(ele.data.target);
        });

        let trueRootId = parsed.state?.currentRootId || parsed.currentRootId || 'root';
        for (const id of allNodeIds) {
            if (!allTargetIds.has(id)) { 
                trueRootId = id;
                break;
            }
        }
        importedRootId = trueRootId + idSuffix;

        elementsArray.forEach((ele: any) => {
            if (ele.group === 'nodes') {
                const oldId = ele.data.id;
                const newId = oldId + idSuffix;
                idMap[oldId] = newId;
                const newParent = ele.data.parent ? ele.data.parent + idSuffix : null;
                // La synonymie pointe vers un nœud du fichier greffé : même renommage que les nœuds.
                const syn = ele.data.synonymTargetId;
                const newSyn = syn && allNodeIds.has(syn) ? syn + idSuffix : null;

                newElements.push({
                    group: 'nodes',
                    classes: ele.classes,
                    data: { ...ele.data, id: newId, parent: newParent, synonymTargetId: newSyn }
                });
            }
        });

        elementsArray.forEach((ele: any) => {
            if (ele.group === 'edges') {
                if (idMap[ele.data.source] && idMap[ele.data.target]) {
                    const edgeData = { ...ele.data };
                    if (edgeData.id) edgeData.id = edgeData.id + idSuffix;
                    edgeData.source = idMap[ele.data.source];
                    edgeData.target = idMap[ele.data.target];

                    newElements.push({ group: 'edges', classes: ele.classes, data: edgeData });
                }
            }
        });
      } catch (err) {
        alert(err instanceof FutureFormatError ? t('alert.future_format') : t('alert.phylo_error') + err);
        return;
      }
    }

    if (importedRootId) {
        newElements.push({ group: 'edges', data: { source: targetNode.id(), target: importedRootId } });
    }

    cy.startBatch();
    const added = cy.add(newElements);
    ctx.propagateBoxMembership(targetNode, added.filter('node').toArray());

    cy.nodes().forEach((node: any) => {
        if (node.id().endsWith(idSuffix) && !node.hasClass('box')) {
            ctx.checkAutoRank(node);
        }
    });

    ctx.refreshLayout();
    cy.endBatch();
  }
  /** Ouverture d'un fichier ; au-delà de LOADING_MIN_BYTES, écran de chargement peint AVANT le travail bloquant. */
  const LOADING_MIN_BYTES = 400 * 1024;
  async function loadTreeFromBuffer(buffer: Uint8Array, fileName: string, filePath?: string) {
    const big = ((buffer as any)?.byteLength || (buffer as any)?.length || 0) > LOADING_MIN_BYTES;
    if (big) { showLoading(); await paintFirst(); }
    try { await loadTreeFromBufferNow(buffer, fileName, filePath); } finally { if (big) hideLoading(); }
  }
  async function loadTreeFromBufferNow(buffer: Uint8Array, fileName: string, filePath?: string) {
    state.currentFilePath = filePath;
    const ext = fileName.split('.').pop()?.toLowerCase();

    // Newick / NEXUS / TNT : nouveau document (l'enregistrement demandera un fichier .phylo).
    if (ext && TREE_EXTS.includes(ext)) {
      state.currentFilePath = undefined;
      try {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array((buffer as any).type === 'Buffer' ? (buffer as any).data : buffer);
        applyOpenedDocument(await importTreeText(decodeText(bytes), ext, filePath));
      } catch (err) { alert(treeErrorMessage(err)); }
      return;
    }
    
    if (ext === 'xmind') {
      state.currentFilePath = undefined; 
      try {
        const unzipped = unzipSync(buffer);
        const contentJsonData = unzipped['content.json']; if (!contentJsonData) throw new Error(t('alert.json_not_found'));
        const contentStr = strFromU8(contentJsonData); const xmindData = JSON.parse(contentStr); const rootTopic = xmindData[0].rootTopic; const newElements: any[] = [];
        
        const parseNode = async (node: any, parentId: string | null, depth: number) => {
            const id = node.id; let rawTitle = node.title || ""; if (node.attributedTitle) rawTitle = node.attributedTitle.map((part: any) => part.text).join('');
            let extinct = false; if (rawTitle.startsWith('\u2020 ')) { extinct = true; rawTitle = rawTitle.substring(2); } else if (rawTitle.startsWith('\u2020')) { extinct = true; rawTitle = rawTitle.substring(1); }
            const styleProps = node.style?.properties || {}; const isBold = styleProps["fo:font-weight"] === "700" || styleProps["fo:font-weight"] === "bold"; const isItalic = styleProps["fo:font-style"] === "italic"; let notes = "";
            if (node.labels && node.labels.length > 0) {
                const cleanLabels = node.labels.filter((l: string) => !l.toLowerCase().includes('extinct') && !l.includes('†'));
                if (cleanLabels.length > 0) {
                    notes = "Étiquettes XMind : " + cleanLabels.join(', ');
                }
            }
            let imgUrl = ""; let imgRatio = 1;
            if (node.image && node.image.src && node.image.src.startsWith("xap:resources/")) {
                const resourcePath = node.image.src.replace("xap:", ""); const imgData = unzipped[resourcePath];
                if (imgData) { 
                  const chunks = []; const chunkSize = 8192; for (let i = 0; i < imgData.length; i += chunkSize) { chunks.push(String.fromCharCode.apply(null, Array.from(imgData.subarray(i, i + chunkSize)))); } const base64 = btoa(chunks.join('')); const fileExt = resourcePath.split('.').pop()?.toLowerCase(); const mime = fileExt === 'jpg' || fileExt === 'jpeg' ? 'image/jpeg' : fileExt === 'svg' ? 'image/svg+xml' : 'image/png'; 
                  imgUrl = `data:${mime};base64,${base64}`; imgRatio = await getImageRatio(imgUrl);
                }
            }
            newElements.push({ group: 'nodes', classes: 'taxon', data: { ...EMPTY_DATA, id: id, name: rawTitle, parent: null, extinct: extinct, isBold: isBold, isItalic: isItalic, notes: notes, imgUrl: toAssetRef(imgUrl), imgRatio: imgRatio, sortIndex: depth } });
            if (parentId) newElements.push({ group: 'edges', data: { source: parentId, target: id } });
            if (node.children && node.children.attached) { let sortCounter = 0; for (const child of node.children.attached) { await parseNode(child, id, sortCounter++); } }
        };
        newDocument(); // nouveau document : vide le magasin d'images AVANT d'y ranger celles de l'XMind
        await parseNode(rootTopic, null, 0);
        cy.startBatch();
        cy.elements().remove();
        cy.add(newElements); 
        state.currentRootId = rootTopic.id; 
        
        cy.nodes().forEach(node => {
            if (node.id() !== rootTopic.id && !node.hasClass('box')) { // racine XMind : pas de rang automatique
                ctx.checkAutoRank(node);
            }
        });

        ctx.refreshLayout(true);
        cy.endBatch();
        setTimeout(() => { state.hasUnsavedChanges = false; ctx.setUnsavedState(false); stateManager.resetStacks(); stateManager.resetStacks(); }, 100);
      } catch (err) { alert(t('alert.xmind_error') + err); }
    } else {
      try { 
          let actualBuf = buffer;
          if (!(actualBuf instanceof Uint8Array)) {
              actualBuf = new Uint8Array((buffer as any).type === 'Buffer' ? (buffer as any).data : buffer);
          }
          
          let parsed;
          try {
              const unzipped = unzipSync(actualBuf);
              const fileKey = Object.keys(unzipped).find(k => k.endsWith('.json'));
              if (fileKey) parsed = JSON.parse(strFromU8(unzipped[fileKey]));
              else throw new Error();
          } catch (eZip) {
              const decoder = new TextDecoder('utf-8');
              const text = decoder.decode(actualBuf).replace(/^\uFEFF/, '');
              parsed = JSON.parse(text); 
          }

          // migrate() : v1 (≤ 1.3) ou v2. L'arbre courant n'est remplacé que si la lecture réussit.
          applyOpenedDocument(parsed);

          const baseName = fileName.replace('.phylo', '').replace('.json', '');
          saveToRecentFiles(baseName, parsed, state.currentFilePath);
      } catch (err) { alert(describeOpenError(err, t('alert.corrupt_file'))); }
    }
  }
  (window as any)._loadOSFile = async (filePath: string) => {
      const result = await window.electronAPI.readFileDirect(filePath);
      if (result.success && result.data && result.fileName) {
          await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
          hideHub();
      } else if (result.error) {
          alert(t('alert.file_read_error') + result.error);
      }
  };
  async function handleFileOpen(file: File) {
    const filePath = (file as any).path;
    if (filePath && window.electronAPI && window.electronAPI.readFileDirect) {
        const result = await window.electronAPI.readFileDirect(filePath);
        if (result.success && result.data && result.fileName) {
            await loadTreeFromBuffer(result.data as Uint8Array, result.fileName, result.filePath);
        }
    } else {
        const arrayBuffer = await file.arrayBuffer();
        await loadTreeFromBuffer(new Uint8Array(arrayBuffer), file.name, undefined);
    }
    ui.fileInput.value = ''; 
  }
  document.body.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.body.addEventListener('dragleave', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.body.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) { handleFileOpen(e.dataTransfer.files[0]); hideHub(); } });
  document.getElementById('cmenu-graft')?.addEventListener('click', (e) => { 
    e.stopPropagation(); ui.contextMenu.style.display = 'none'; 
    if (state.activeNode && !state.activeNode.hasClass('box')) { 
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.phylo,.xmind,.nwk,.newick,.tre,.tree,.nex,.nexus,.tnt';
      input.onchange = (ev) => {
        const file = (ev.target as HTMLInputElement).files?.[0];
        if (file) handleGraft(file, state.activeNode);
      };
      input.click(); 
    } 
  });
  
  ui.btnOpenLinkedFile.onclick = async () => {
      if (!state.activeNode || state.activeNode.hasClass('box')) return;
      
      const linkedPath = state.activeNode.data('linkedFilePath');
      const linkedName = state.activeNode.data('linkedFileName');
      if (!linkedName) return;

      if (state.hasUnsavedChanges) {
          if (confirm(t('confirm.save_before_switch'))) {
              await executeSave(false);
          }
      }

      const getDirectory = (filePath: string) => {
          if (!filePath) return '';
          const sep = filePath.includes('\\') ? '\\' : '/';
          const parts = filePath.split(sep);
          parts.pop();
          return parts.join(sep) + sep;
      };

      let loaded = false;

      if (linkedPath) {
          const res1 = await window.electronAPI.readFileDirect(linkedPath);
          if (res1.success && res1.data) {
              await loadTreeFromBuffer(res1.data as Uint8Array, res1.fileName!, res1.filePath);
              loaded = true;
          }
      }

      if (!loaded && state.currentFilePath) {
          const dir = getDirectory(state.currentFilePath);
          const fallbackPath = dir + linkedName;
          const res2 = await window.electronAPI.readFileDirect(fallbackPath);
          if (res2.success && res2.data) {
              state.activeNode.data('linkedFilePath', res2.filePath); 
              await loadTreeFromBuffer(res2.data as Uint8Array, res2.fileName!, res2.filePath);
              loaded = true;
          }
      }

      if (!loaded) {
          alert(t('alert.link_broken1') + linkedName + t('alert.link_broken2'));
          const res3 = await window.electronAPI.openFile();
          if (res3.success && res3.data && res3.fileName) {
              state.activeNode.data('linkedFilePath', res3.filePath);
              state.activeNode.data('linkedFileName', res3.fileName);
              await loadTreeFromBuffer(res3.data as Uint8Array, res3.fileName, res3.filePath);
          }
      }
      
      hideHub();
      ctx.closeSidePanel();
  };

  // Exporter une branche en .phylo (menu contextuel) : document v2 complet du clade (fiches, images).
  document.getElementById('cmenu-export-branch')?.addEventListener('click', async (e) => {
      e.stopPropagation(); ui.contextMenu.style.display = 'none';
      const n = state.activeNode;
      if (!n || n.hasClass('box')) return;
      const doc = elementsToDoc(ctx.serializeClade(n), n.id());
      const safeName = String(n.data('name') || 'branche').replace(/[\\/:*?"<>|]/g, '_');
      const response = await window.electronAPI.saveFile(JSON.stringify(doc), undefined, `${safeName}.phylo`);
      if (response.success && response.filePath) toast(t('toast.branch_exported'), response.filePath);
      else if (response.error) alert(t('alert.save_error') + response.error);
  });

  /** Greffe un document déjà lu (presse-papiers entre fenêtres, Newick collé). */
  const graftDocument = (raw: any, targetNode: any) => handleGraft(null, targetNode, raw);

  return { loadRecentFilesUI, executeSave, createNewTree, graftDocument };
}
