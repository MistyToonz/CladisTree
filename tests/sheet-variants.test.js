// Tests des classifications alternatives par feuille (sheet-variants.ts) et de leur conservation
// à l'enregistrement. Lancer depuis my-new-app : npm run test:variants
const ts = require(process.cwd() + '/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const cytoscape = require(process.cwd() + '/node_modules/cytoscape');
const cache = {};
const load = f0 => { const f = path.normalize(f0); if (cache[f]) return cache[f]; const m = { exports: {} }; cache[f] = m.exports;
  const req = r => r.startsWith('./') ? load(path.join('src', r.slice(2) + '.ts')) : require(r);
  new Function('module','exports','require', ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:'commonjs',target:'es2019'}}).outputText)(m, m.exports, req); return m.exports; };
const M = load('src/migrate.ts'), V = load('src/sheet-variants.ts'), S = load('src/doc-session.ts');
let fails = 0; const check = (label, cond) => { console.log((cond ? '  ok     ' : '  ÉCHEC  ') + label); if (!cond) fails++; };

// R (racine) → A, B (feuille imbriquée), C ; A → A1, A2 ; B → B1, B2
const N = (id, name, extra = {}) => ({ group: 'nodes', classes: 'taxon', data: { id, name, sortIndex: 0, ...extra } });
const E = (s, t) => ({ group: 'edges', data: { source: s, target: t } });
const v1 = { version: '1.0', currentRootId: 'R', graph: { elements: [
  N('R', 'Reptilia'), N('A', 'Archosauria'), N('B', 'Testudines', { hasNewSheet: true }), N('C', 'Lepidosauria'),
  N('A1', 'Aves'), N('A2', 'Crocodylia'), N('B1', 'Cryptodira'), N('B2', 'Pleurodira'),
  E('R', 'A'), E('R', 'B'), E('R', 'C'), E('A', 'A1'), E('A', 'A2'), E('B', 'B1'), E('B', 'B2') ] } };
const doc = M.migrate(v1);
const T = d => d.trees[0];

console.log('Structure des feuilles');
check('racines de feuille : R et B, pas A', V.isSheetRoot(T(doc), 'R') && V.isSheetRoot(T(doc), 'B') && !V.isSheetRoot(T(doc), 'A'));
check('contenu propre de R = A, A1, A2, B, C (B sans ses descendants)', JSON.stringify(V.ownContentIds(T(doc).nodes, 'R').sort()) === JSON.stringify(['A', 'A1', 'A2', 'B', 'C']));
check('sans variante : une seule « Classification 1 »', V.listVariants(doc, 'R').length === 1);

console.log('Ajouter et basculer');
const { doc: d2, variantId: alt } = V.addVariant(doc, 'R', 'Hypothèse anapside');
check('deux classifications, la nouvelle active', V.listVariants(d2, 'R').length === 2 && V.listVariants(d2, 'R').find(v => v.active).name === 'Hypothèse anapside');
check('vue composée inchangée à l\'ajout', JSON.stringify(T(d2).nodes) === JSON.stringify(T(doc).nodes));
// Dans l'alternative : C passe sous A, et la feuille B est retirée de cette classification seulement.
T(d2).nodes.C.parent = 'A';
const d3 = V.detachFromComposition(d2, 'B');
check('feuille B retirée de l\'alternative : mise de côté avec son contenu', !T(d3).nodes.B && !T(d3).nodes.B1 && T(d3).detached.B.parent === null && !!T(d3).detached.B1);
const d4 = V.switchVariant(d3, 'R', 'v1');
check('retour à la classification 1 : C sous R', T(d4).nodes.C.parent === 'R');
check('retour à la classification 1 : feuille B et son contenu rattachés', T(d4).nodes.B.parent === 'R' && T(d4).nodes.B1.parent === 'B' && !T(d4).detached);
const d5 = V.switchVariant(d4, 'R', alt);
check('retour à l\'alternative : C sous A, B de nouveau mise de côté', T(d5).nodes.C.parent === 'A' && !T(d5).nodes.B && !!T(d5).detached.B1);
check('feuille B toujours placée par la classification inactive', V.placedByInactiveVariant(T(d5), 'B'));
check('aucun taxon en double', V.duplicateTaxa(T(d5)).length === 0);

console.log('Collision d\'identifiants');
// Les deux classifications placent la feuille B. Dans la 1, A2 part dans la feuille B (hors du contenu
// de R) ; l'alternative le place encore sous A : même identifiant de nœud à deux endroits.
const { doc: k0, variantId: alt2 } = V.addVariant(doc, 'R', 'Autre');
const c1 = V.switchVariant(k0, 'R', 'v1');
T(c1).nodes.A2.parent = 'B1';
const c2 = V.switchVariant(c1, 'R', alt2);
const a2nodes = Object.values(T(c2).nodes).filter(n => n.taxonId === 'A2');
check('le nœud de l\'alternative est renommé, pas écrasé', a2nodes.length === 2 && new Set(a2nodes.map(n => n.id)).size === 2);
check('taxon présent deux fois : signalé', V.duplicateTaxa(T(c2)).includes('A2'));

console.log('Supprimer');
const s1 = V.deleteVariant(d5, 'R', alt);
check('suppression de l\'active : retour à la classification 1, feuille redevenue simple', !T(s1).sheetVariants && T(s1).nodes.C.parent === 'R' && T(s1).nodes.B1.parent === 'B');
check('plus aucun sous-arbre mis de côté', !T(s1).detached);

console.log('Enregistrement et relecture');
S.openDocument(d5);
const cy = cytoscape({ headless: true, elements: S.docToCyElements(d5).elements });
check('Cytoscape ne contient que la vue composée (pas B1, mis de côté)', cy.$id('B1').length === 0 && cy.$id('C').incomers('node').first().id() === 'A');
const saved = S.commitFromCy(cy, 'R');
check('variantes conservées à l\'enregistrement', !!T(saved).sheetVariants && T(saved).sheetVariants.R.variants.length === 2);
check('sous-arbre mis de côté conservé', !!T(saved).detached && !!T(saved).detached.B1);
check('taxons hors vue composée conservés (Testudines, Cryptodira)', !!saved.taxa.B && !!saved.taxa.B1 && saved.taxa.B1.fields.name === 'Cryptodira');
const reread = M.migrate(JSON.parse(JSON.stringify(saved)));
check('relu par migrate : variantes et sous-arbres intacts', JSON.stringify(T(reread).sheetVariants) === JSON.stringify(T(saved).sheetVariants) && JSON.stringify(T(reread).detached) === JSON.stringify(T(saved).detached));
const back = V.switchVariant(reread, 'R', 'v1');
check('après relecture, la classification 1 se rétablit', T(back).nodes.B1.parent === 'B' && T(back).nodes.C.parent === 'R');
const legacy = M.toLegacyV1(saved);
check('copie 1.3 : classification active seulement', !legacy.graph.elements.some(e => e.data.id === 'B1'));

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
