// Annulation différentielle (graph-state.ts › applySnapshot) : l'état rétabli doit être EXACTEMENT celui de
// l'instantané, quelle que soit la modification annulée. Cytoscape sans affichage. Lancer : npm test
const ts = require(process.cwd() + '/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const cytoscape = require(process.cwd() + '/node_modules/cytoscape');
const cache = {};
const load = f0 => { const f = path.normalize(f0); if (cache[f]) return cache[f]; const m = { exports: {} }; cache[f] = m.exports;
  const req = r => r.startsWith('./') ? load(path.join('src', r.slice(2) + '.ts')) : require(r);
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2019' } }).outputText)(m, m.exports, req); return m.exports; };
const { stateManager, state } = load('src/graph-state.ts');
let fails = 0; const check = (label, cond, detail = '') => { console.log((cond ? '  ok     ' : '  ÉCHEC  ') + label + (cond || !detail ? '' : ' → ' + detail)); if (!cond) fails++; };

const fresh = () => cytoscape({ headless: true, elements: [
  { data: { id: 'R', name: 'Racine' }, classes: 'taxon' }, { data: { id: 'A', name: 'A', isBold: false }, classes: 'taxon' },
  { data: { id: 'B', name: 'B' }, classes: 'taxon' }, { data: { id: 'C', name: 'C' }, classes: 'taxon' },
  { data: { id: 'e1', source: 'R', target: 'A' } }, { data: { id: 'e2', source: 'A', target: 'B' } }, { data: { id: 'e3', source: 'A', target: 'C' } } ] });
/** Signature complète de l'état (sans champs recalculés) : éléments, données, classes, parent, sélection. */
const sig = cy => JSON.stringify(cy.elements().map(e => [e.id(), e.group(), e.classes().join(' '), e.selected(), JSON.stringify(Object.keys(e.data()).sort().reduce((o, k) => (k === 'renderWidth' ? o : (o[k] = e.data(k), o)), {}))]).sort());
/** Applique une modification puis l'annule : l'état doit revenir à l'identique. */
const roundTrip = (label, mutate) => {
  const cy = fresh();
  const before = sig(cy);
  const snap = JSON.parse(stateManager.getLightweightState(cy));
  mutate(cy);
  const changed = sig(cy) !== before;
  stateManager.applySnapshot(cy, snap);
  check(label, changed && sig(cy) === before, changed ? 'état différent après annulation' : 'la modification n\'a rien changé');
};

console.log('Annulation différentielle');
state.currentRootId = 'R';
roundTrip('donnée modifiée (gras, nom)', cy => { cy.$id('A').data({ isBold: true, name: 'A2' }); });
roundTrip('donnée ajoutée puis retirée', cy => { cy.$id('B').data('highlight', '#ff0'); });
roundTrip('nœud supprimé avec ses arêtes', cy => { cy.remove(cy.$id('C')); });
roundTrip('clade supprimé', cy => { cy.remove(cy.$id('A').union(cy.$id('A').successors())); });
roundTrip('nœud et arête ajoutés (collage)', cy => { cy.add([{ data: { id: 'P', name: 'Collé' }, classes: 'taxon' }, { data: { id: 'eP', source: 'B', target: 'P' } }]); });
roundTrip('clade déplacé (arête reliée ailleurs)', cy => { cy.remove(cy.$id('e3')); cy.add({ data: { id: 'e3', source: 'R', target: 'C' } }); });
roundTrip('boîte créée autour de nœuds', cy => { cy.add({ data: { id: 'box1', name: 'Cadre' }, classes: 'box' }); cy.$id('B').move({ parent: 'box1' }); cy.$id('C').move({ parent: 'box1' }); });
{ // boîte supprimée : l'instantané contient la boîte et ses nœuds ; à l'annulation, la boîte revient AVANT ses nœuds
  const cy = fresh(); cy.add({ data: { id: 'box1', name: 'Cadre' }, classes: 'box' }); cy.$id('B').move({ parent: 'box1' });
  const before = sig(cy); const snap = JSON.parse(stateManager.getLightweightState(cy));
  cy.$id('B').move({ parent: null }); cy.remove(cy.$id('box1'));
  stateManager.applySnapshot(cy, snap);
  check('boîte supprimée puis rétablie, nœud replacé dedans', sig(cy) === before && cy.$id('B').data('parent') === 'box1');
}
roundTrip('sélection et classes', cy => { cy.$id('A').select(); cy.$id('B').addClass('flash'); });
{ // champs recalculés et décorations absents de l'instantané
  const cy = fresh(); cy.$id('A').data({ computedLabel: 'X', bgUrls: ['data:...'] }); cy.add({ data: { id: 'deco' }, classes: 'strato-bg' });
  const snap = JSON.parse(stateManager.getLightweightState(cy));
  const a = snap.elements.find(e => e.data.id === 'A');
  check('instantané sans champs recalculés ni décorations', !('computedLabel' in a.data) && !('bgUrls' in a.data) && !snap.elements.some(e => e.data.id === 'deco'));
}
{ // même identité d'éléments conservée (pas de suppression / recréation inutile)
  const cy = fresh(); const elA = cy.$id('A')[0];
  const snap = JSON.parse(stateManager.getLightweightState(cy)); cy.$id('A').data('isBold', true);
  stateManager.applySnapshot(cy, snap);
  check('éléments inchangés conservés (même objet Cytoscape)', cy.$id('A')[0] === elA && cy.$id('A').data('isBold') === false);
}
console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
