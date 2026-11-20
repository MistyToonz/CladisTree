// Test de non-régression du format .phylo : migration v1 → v2, session Cytoscape, copie 1.3.
// Lancer depuis my-new-app : npm run test:format
const ts = require(process.cwd() + '/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const cytoscape = require(process.cwd() + '/node_modules/cytoscape');
const cache = {};
const load = f0 => { const f = path.normalize(f0); if (cache[f]) return cache[f]; const m = { exports: {} }; cache[f] = m.exports;
  const req = r => r.startsWith('./') ? load(path.join('src', r.slice(2) + '.ts')) : require(r);
  new Function('module','exports','require', ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:'commonjs',target:'es2017'}}).outputText)(m, m.exports, req); return m.exports; };
const M = load('src/migrate.ts'), S = load('src/doc-session.ts'), A = load('src/asset-store.ts'), DM = load('src/doc-model.ts');
let fails = 0; const check = (label, cond) => { console.log((cond ? '  ok     ' : '  ÉCHEC  ') + label); if (!cond) fails++; };

// --- 1. Fichier v1 réaliste, tel qu'enregistré par la 1.3 (cy.json())
const IMG1 = 'data:image/png;base64,' + 'A'.repeat(5000), IMG2 = 'data:image/jpeg;base64,' + 'B'.repeat(8000);
const base = { status: 'Valide', rank: 'Clade (non-classé)', discoveryDate: '', distribution: '', author: '', size: '', mass: '', period: '', synapomorphies: '', notes: '', collapsed: false, hasNewSheet: false, fontFamily: 'serif', fontSize: 16, imgUrl: '', imgSize: 30, imgRatio: 1, imgPos: 'left', hasFrame: false, frameColor: '#000000', imgCredits: '' };
const cy1 = cytoscape({ headless: true, elements: [
  { group: 'nodes', classes: 'box', data: { id: 'box1', name: 'Groupe', boxColor: '#ff0000', boxOpacity: 0.2, cWidth: 120 } },
  { group: 'nodes', classes: 'taxon', data: { ...base, id: 'root', name: 'Vertebrata', isBold: true, sortIndex: 0, labelW: 99, computedLabel: 'x' } },
  { group: 'nodes', classes: 'taxon', data: { ...base, id: 'A', name: 'Dinosauria', period: '233-66', imgUrl: IMG1, imgName: 'dino.png', imgRatio: 1.5, sheetImage: IMG2, sheetImageRatio: 0.75, imgCredits: '© Wiki', hasNewSheet: true, sortIndex: 0, customFoo: 42 } },
  { group: 'nodes', classes: 'taxon', data: { ...base, id: 'B', name: 'Tyrannosaurus rex', parent: 'box1', imgUrl: IMG1, sortIndex: 0, extinct: true } },
  { group: 'nodes', classes: 'taxon', data: { ...base, id: 'C', name: 'T. imperator', parent: 'box1', synonymTargetId: 'B', sortIndex: 1, collapsed: true } },
  { group: 'edges', data: { source: 'root', target: 'A' } }, { group: 'edges', data: { source: 'A', target: 'B' } }, { group: 'edges', data: { source: 'A', target: 'C' } },
]});
const v1 = JSON.parse(JSON.stringify({ version: '1.0', currentRootId: 'root', graph: cy1.json() }));

// --- 2. Migration
const doc = M.migrate(v1);
console.log('Migration v1 → v2');
check('formatVersion = 2', doc.formatVersion === 2);
check('4 taxons, 1 arbre « Classification 1 », 1 boîte', Object.keys(doc.taxa).length === 4 && doc.trees.length === 1 && doc.trees[0].name === 'Classification 1' && Object.keys(doc.trees[0].boxes).length === 1);
check('images dédoublonnées : 2 assets pour 3 usages', Object.keys(doc.assets).length === 2);
const tA = doc.taxa['A'];
check('Dinosauria : vignette (nom, ratio) + illustration (crédits, ratio)', tA.images.length === 2 && tA.images[0].role === 'tree' && tA.images[0].name === 'dino.png' && tA.images[0].ratio === 1.5 && tA.images[1].role === 'sheet' && tA.images[1].credits === '© Wiki' && tA.images[1].ratio === 0.75);
check('période et nom dans la fiche du taxon', tA.fields.period === '233-66' && tA.fields.name === 'Dinosauria');
check('synonymie en identifiant de TAXON (C → B)', doc.taxa['C'].synonymOf === 'B');
const n = doc.trees[0].nodes;
check('parents, boîte, ordre, feuille, repli dans l\'arbre', n.A.parent === 'root' && n.B.parent === 'A' && n.B.box === 'box1' && n.C.sortIndex === 1 && n.A.structure.hasNewSheet === true && n.C.structure.collapsed === true);
check('champs calculés non enregistrés (labelW, computedLabel, cWidth)', !JSON.stringify(doc).includes('labelW') && !JSON.stringify(doc).includes('computedLabel') && doc.trees[0].boxes.box1.data.cWidth === undefined);
check('champ inconnu conservé (customFoo)', !!n.A.extra && n.A.extra.customFoo === 42);
check('aucune image en ligne hors assets', JSON.stringify({ ...doc, assets: {} }).indexOf('base64') === -1);
console.log('         taille : v1', JSON.stringify(v1).length, 'o → v2', JSON.stringify(doc).length, 'o');

// --- 3. Ouverture dans Cytoscape puis enregistrement : aller-retour sans perte
console.log('Session (Cytoscape = classification active)');
const opened = S.openDocument(doc);
const cy2 = cytoscape({ headless: true, elements: opened.elements });
check('nœuds Cytoscape : images en références asset:', cy2.$id('A').data('imgUrl').startsWith('asset:') && A.resolveAsset(cy2.$id('A').data('imgUrl')) === IMG1);
check('synonymTargetId restauré en identifiant de nœud', cy2.$id('C').data('synonymTargetId') === 'B');
check('boîte et arêtes restaurées', cy2.$id('B').data('parent') === 'box1' && cy2.edges().length === 3);
const doc2 = S.commitFromCy(cy2, opened.currentRootId);
check('aller-retour v2 → Cytoscape → v2 identique', JSON.stringify(doc2) === JSON.stringify(doc));

// --- 4. Taxon présent seulement dans une autre classification : conservé
const sess = S.currentDocument();
sess.trees.push({ id: 'tree-2', name: 'Classification 2', boxes: {}, view: { currentRootId: 'r2' }, nodes: { r2: { id: 'r2', taxonId: 'root', parent: null, box: null, sortIndex: 0, structure: {}, style: {}, support: null, highlight: null, branch: null }, z: { id: 'z', taxonId: 'onlyIn2', parent: 'r2', box: null, sortIndex: 0, structure: {}, style: {}, support: { value: 87, kind: 'bootstrap' }, highlight: '#ffff00', branch: null } } });
sess.taxa.onlyIn2 = { id: 'onlyIn2', fields: { name: 'Absent de la classif. 1' }, images: [], audio: { path: 'sons/cri.mp3' }, synonymOf: null };
cy2.$id('B').data('name', 'Tyrannosaurus rex Osborn, 1905');
const doc3 = S.commitFromCy(cy2, 'root');
check('classification 2 conservée (support, surlignage)', doc3.trees.length === 2 && doc3.trees[1].nodes.z.support.value === 87 && doc3.trees[1].nodes.z.highlight === '#ffff00');
check('taxon absent de la classification active conservé (audio)', !!doc3.taxa.onlyIn2 && doc3.taxa.onlyIn2.audio.path === 'sons/cri.mp3');
check('modification d\'un taxon partagé visible pour toutes les classifications', doc3.taxa.B.fields.name.endsWith('1905'));

// --- 5. Nouveaux nœuds et doublons
cy2.add([{ group: 'nodes', classes: 'taxon', data: { ...base, id: 'taxon-new1', name: 'Nouveau' } }, { group: 'edges', data: { source: 'A', target: 'taxon-new1' } }]);
const bCopy = { ...cy2.$id('B').data(), id: 'B-copy' }; delete bCopy.parent;
cy2.add([{ group: 'nodes', classes: 'taxon', data: bCopy }, { group: 'edges', data: { source: 'root', target: 'B-copy' } }]);
const doc4 = S.commitFromCy(cy2, 'root');
check('nouveau nœud : taxon créé avec l\'identifiant du nœud', doc4.trees[0].nodes['taxon-new1'].taxonId === 'taxon-new1' && doc4.taxa['taxon-new1'].fields.name === 'Nouveau');
check('nœud dupliqué (même taxonId) : devient un taxon distinct', doc4.trees[0].nodes['B-copy'].taxonId !== 'B' && !!doc4.taxa[doc4.trees[0].nodes['B-copy'].taxonId]);
const doc5 = S.commitFromCy(cy2, 'root');
check('identifiants stables d\'un enregistrement à l\'autre', JSON.stringify(doc5) === JSON.stringify(doc4));

// --- 6. Copie compatible 1.3
console.log('Copie compatible 1.3');
const legacy = M.toLegacyV1(doc4);
check('format { version, currentRootId, graph.elements }', legacy.version === '1.0' && Array.isArray(legacy.graph.elements));
const lA = legacy.graph.elements.find(e => e.data.id === 'A').data;
check('images en ligne, crédits, synonymie en id de nœud', lA.imgUrl === IMG1 && lA.sheetImage === IMG2 && lA.imgCredits === '© Wiki' && legacy.graph.elements.find(e => e.data.id === 'C').data.synonymTargetId === 'B');
check('aucun champ 1.4 (taxonId, support, références asset:)', !JSON.stringify(legacy).includes('taxonId') && !JSON.stringify(legacy).includes('"support"') && !JSON.stringify(legacy).includes('asset:'));
const cy13 = cytoscape({ headless: true, elements: legacy.graph.elements });
check('chargeable par Cytoscape comme le fait la 1.3', cy13.nodes().length === Object.keys(doc4.trees[0].nodes).length + 1);
const back = M.migrate(JSON.parse(JSON.stringify(legacy)));
check('relue par la 1.4 : mêmes taxons de la classification 1', Object.keys(back.trees[0].nodes).length === Object.keys(doc4.trees[0].nodes).length);

// --- 7. Cas limites
console.log('Cas limites');
let err = null; try { M.migrate({ formatVersion: 3, taxa: {}, trees: [] }); } catch (e) { err = e; }
check('fichier d\'une version future : erreur dédiée', err instanceof DM.FutureFormatError && err.version === 3);
const g = S.graftElementsFrom(v1);
check('greffe : taxons sans identifiant (deviendront de nouveaux taxons)', g.elements.filter(e => e.group === 'nodes' && e.classes === 'taxon').every(e => e.data.taxonId === undefined));
const v1old = { state: { currentRootId: 'A' }, graph: { elements: { nodes: v1.graph.elements.nodes, edges: v1.graph.elements.edges } } };
check('ancienne variante v1 (state.currentRootId, sans "version")', M.migrate(v1old).trees[0].view.currentRootId === 'A');
// Divergence sans taxon (nœud d'arbre seul) : doit le rester après ouverture + enregistrement.
const div = JSON.parse(JSON.stringify(doc));
div.trees[0].nodes.D = { id: 'D', taxonId: null, parent: 'root', box: null, sortIndex: 5, structure: {}, style: {}, support: { value: 0.98, kind: 'posterior' }, highlight: null, branch: null };
div.trees[0].nodes.A.parent = 'D';
const od = S.openDocument(M.migrate(div));
const cyD = cytoscape({ headless: true, elements: od.elements });
const dd = S.commitFromCy(cyD, 'root');
check('divergence sans taxon conservée (support compris), sans taxon fantôme', dd.trees[0].nodes.D.taxonId === null && dd.trees[0].nodes.D.support.value === 0.98 && Object.keys(dd.taxa).length === 4 && dd.trees[0].nodes.A.parent === 'D');
// Image référencée mais absente des assets (fichier abîmé) : ignorée sans planter.
const broken = JSON.parse(JSON.stringify(doc)); broken.assets = {};
const ob = S.openDocument(M.migrate(broken));
const cyB = cytoscape({ headless: true, elements: ob.elements });
check('image manquante dans assets : ouverture sans erreur, image vide', cyB.$id('A').data('imgUrl') === '');
err = null; try { M.migrate({ hello: 1 }); } catch (e) { err = e; }
check('document inconnu : erreur', !!err);
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
