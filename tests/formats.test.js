// Tests des formats d'arbres (phylo-formats.ts). Lancer depuis my-new-app : npm test
const ts = require(process.cwd() + '/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const cache = {};
const load = f0 => { const f = path.normalize(f0); if (cache[f]) return cache[f]; const m = { exports: {} }; cache[f] = m.exports;
  const req = r => r.startsWith('./') ? load(path.join('src', r.slice(2) + '.ts')) : require(r);
  new Function('module','exports','require', ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:'commonjs',target:'es2019'}}).outputText)(m, m.exports, req); return m.exports; };
const F = load('src/phylo-formats.ts'), M = load('src/migrate.ts');
let fails = 0; const check = (label, cond) => { console.log((cond ? '  ok     ' : '  ÉCHEC  ') + label); if (!cond) fails++; };
const names = n => n.children.length ? n.children.map(names).join(' ') : n.name;

console.log('Newick');
const t1 = F.parseNewick("((Homo_sapiens:0.1,'Pan troglodytes':0.12)95:0.3,(Gorilla_gorilla,Pongo)Ponginae[&comment]:0.5)Hominidae;");
check('feuilles (« _ » → espace, apostrophes)', names(t1) === 'Homo sapiens Pan troglodytes Gorilla gorilla Pongo');
check('support interne numérique (mode auto)', t1.children[0].support === 95 && t1.children[0].name === '');
check('nom de clade interne et commentaire ignoré', t1.children[1].name === 'Ponginae' && t1.name === 'Hominidae');
check('longueurs de branche', t1.children[0].length === 0.3 && t1.children[0].children[1].length === 0.12);
const t2 = F.parseNewick('((A,B)90,C);', 'name');
check('mode « noms » : « 90 » est un nom de clade', t2.children[0].name === '90' && t2.children[0].support === undefined);
check("apostrophe doublée dans une étiquette", F.parseNewick("('l''ours',B);").children[0].name === "l'ours");
check('réécriture puis relecture identiques', JSON.stringify(F.parseNewick(F.writeNewick(t1))) === JSON.stringify(t1));
check('export des supports comme étiquettes internes', F.writeNewick(F.parseNewick('((A,B)95,C);'), 'support') === '((A,B)95,C);');
let err = null; try { F.parseNewick('((A,B,C;'); } catch (e) { err = e; } check('Newick mal formé : erreur explicite', !!err);
check('étiquettes internes numériques détectées', F.hasNumericInternalLabels('((A,B)95,C);') && !F.hasNumericInternalLabels('((A,B)Clade,C);'));

console.log('NEXUS');
const nex = `#NEXUS
BEGIN TAXA; DIMENSIONS NTAX=3; TAXLABELS Homo Pan 'Gorilla gorilla'; END;
BEGIN TREES;
  TRANSLATE 1 Homo, 2 Pan, 3 'Gorilla gorilla';
  TREE t1 = [&R] ((1:0.1,2:0.1)100:0.2,3:0.3);
  TREE t2 = ((1,3),2);
END;`;
const n1 = F.parseNexus(nex);
check('premier arbre, TRANSLATE appliqué', names(n1.tree) === 'Homo Pan Gorilla gorilla' && n1.treeCount === 2);
check('support et longueurs conservés', n1.tree.children[0].support === 100 && n1.tree.children[1].length === 0.3);
const back = F.parseNexus(F.writeNexus(n1.tree, 'support'));
check('écriture NEXUS puis relecture identiques', JSON.stringify(back.tree) === JSON.stringify(n1.tree));

console.log('TNT');
const tnt = `xread
'matrice' 4 5
Homo_sapiens 01010
Pan_troglodytes 01110
Gorilla 11110
Pongo 10000
;
tread 'deux arbres' (0 (1 (2 3)))* (0 ((1 2) 3)) ;`;
const tt = F.parseTnt(tnt);
check('taxons numérotés nommés par xread', names(tt.tree) === 'Homo sapiens Pan troglodytes Gorilla Pongo' && tt.treeCount === 2);
check('topologie respectée', tt.tree.children.length === 2 && tt.tree.children[1].children[1].children.length === 2);
check('taxons par nom et sans xread', names(F.parseTnt('tread (A (B C));').tree) === 'A B C' && names(F.parseTnt('tread (0 (1 2));').tree) === 'Taxon 0 Taxon 1 Taxon 2');

console.log('Import dans un document');
const doc = M.migrate(F.toLegacyDoc(t1));
const nodes = Object.values(doc.trees[0].nodes);
check('document v2 : 7 nœuds, racine Hominidae', nodes.length === 7 && doc.taxa[nodes.find(n => n.parent === null).taxonId].fields.name === 'Hominidae');
check('support porté par le nœud d\'arbre', nodes.some(n => n.support && n.support.value === 95));
check('binômes en italique', Object.values(doc.taxa).filter(t => t.fields.name === 'Homo sapiens').length === 1 && nodes.some(n => n.style.isItalic));
check('détection du format par l\'extension et le contenu', F.parseTreeFile(nex, 'txt').treeCount === 2 && F.parseTreeFile(tnt, 'tnt').treeCount === 2 && F.parseTreeFile('(A,B);', 'nwk').treeCount === 1);

console.log('Fichiers réels (TNT sous Windows)');
const latin1 = Uint8Array.from([0x74, 0x72, 0x65, 0x61, 0x64, 0x20, 0x27, 0x66, 0x6f, 0x72, 0x20, 0x64, 0x61, 0x74, 0x61, 0x20, 0x69, 0x6e, 0x20, 0x43, 0x3a, 0x5c, 0x6d, 0x6f, 0x69, 0x74, 0x69, 0xe9, 0x2e, 0x74, 0x6e, 0x74, 0x27, 0x0d, 0x0a]);
check('Windows-1252 détecté (« é » sur un octet)', F.decodeText(latin1).includes('moitié.tnt') && F.decodeText(new TextEncoder().encode('\uFEFFmoitié')) === 'moitié');
const tntTrees = "tread 'tree(s) from TNT, for data in C:\\Users\\x\\Données ceratopsiens.tnt'\r\n(0 ((3 (1 2))(4 5)))*\r\n(0 (3 ((1 2)(4 5))))*\r\n(0 ((1 2)(3 (4 5))));\r\nproc /;";
const pt = F.parseTreeFile(tntTrees, 'tre');
check('arbres TNT sans noms : numérotés, chemin des données repris du commentaire', pt.numbered === true && pt.dataPath === 'C:\\Users\\x\\Données ceratopsiens.tnt' && pt.all.length === 3 && pt.treeCount === 3);
const dataNames = F.tntTaxonNames("xread\r\n'Matrice'\r\n2 6\r\nPsittacosaurus 00\r\nLeptoceratops 11\r\nProtoceratops 12\r\nZuniceratops 12\r\nCentrosaurus 12\r\nChasmosaurus 12\r\n;\r\nproc/;");
pt.all.forEach(tr => F.nameTntLeaves(tr, dataNames));
check('noms repris du fichier de données (tous les arbres)', names(pt.all[2]) === 'Psittacosaurus Leptoceratops Protoceratops Zuniceratops Centrosaurus Chasmosaurus');
let noTree = null; try { F.parseTreeFile("xread\n2 1\nA 00\n;\nproc/;", 'tnt'); } catch (e) { noTree = e; }
let noTreeNex = null; try { F.parseTreeFile('#NEXUS\nBEGIN DATA;\nMATRIX A 0;\nEND;', 'nex'); } catch (e) { noTreeNex = e; }
check('fichier de données sans arbre : erreur explicite (TNT, NEXUS)', noTree instanceof F.NoTreeError && noTree.kind === 'tnt' && noTreeNex instanceof F.NoTreeError && noTreeNex.kind === 'nexus');
check('NEXUS sans TRANSLATE : feuilles numérotées nommées par TAXLABELS', names(F.parseNexus("#NEXUS\nBEGIN TAXA;\nTAXLABELS Homo_sapiens 'Pan troglodytes' Gorilla;\nEND;\nBEGIN TREES;\nTREE t = [&U] ((1,2),3);\nEND;").tree) === 'Homo sapiens Pan troglodytes Gorilla');
// Fichiers non refermés : TNT tant que « tsave » n'est pas fermé (dernier arbre = consensus, sans « ; » ni « proc »),
// NEXUS sans « END; » ni « ; » final.
const open = F.parseTreeFile("tread 'tree(s) from TNT, for data in C:\\x\\d.tnt'\r\n(0 (1 (2 3)))*\r\n(0 ((1 2) 3))*\r\n(0 (1 2 3))\r\n", 'tre');
check('TNT non refermé : tous les arbres lus, dernier compris', open.treeCount === 3 && names(open.all[2]) === 'Taxon 0 Taxon 1 Taxon 2 Taxon 3' && open.all[2].children[1].children.length === 3);
const openNex = F.parseNexus("#NEXUS\nBEGIN TREES;\nTREE t = ((A,B),C);\nTREE u = [&U] (A,(B,C))");
check('NEXUS non refermé : bloc et dernier arbre lus', openNex.treeCount === 2 && names(openNex.all[1]) === 'A B C');
check("NEXUS : « ; » dans un nom ou un commentaire", names(F.parseNexus("#NEXUS\nbegin trees;\ntree 'x;y' = (('a;b',B)[c;d],C);\nend;").tree) === 'a;b B C');
check('Newick : plusieurs arbres lus', F.parseTreeFile("(A,B);\n('x;y',C)[c;];\n", 'nwk').treeCount === 2);

console.log('Genre / Espèce des arbres importés');
const tx = F.parseNewick('((Triceratops_horridus,Triceratops_prorsus),(Torosaurus_latus,(Homo_sapiens,(Pan_troglodytes,Pan_paniscus))),(Canis_lupus,Felis_catus,Canis_familiaris),Panthera_leo_persica,(A,B)Nomme,(Gorilla_gorilla,Gorilla_beringei)Gorillini);');
const nGenera = F.inferTaxonomy(tx);
const find = (n, name) => n.name === name ? n : n.children.map(c => find(c, name)).find(Boolean);
const findAll = (n, name) => [...(n.name === name ? [n] : []), ...[].concat(...n.children.map(c => findAll(c, name)))];
const parentName = (root, leafName) => { let p = null; const w = (n) => n.children.forEach(c => { if (c.name === leafName) p = n.name; w(c); }); w(root); return p; };
check('espèces et sous-espèces reconnues', find(tx, 'Triceratops horridus').rank === 'Espèce' && find(tx, 'Panthera leo persica').rank === 'Sous-espèce' && find(tx, 'A').rank === undefined);
check('genre monophylétique : le clade sans nom devient le genre', find(tx, 'Triceratops').rank === 'Genre' && find(tx, 'Pan').children.length === 2 && find(tx, 'Pan').rank === 'Genre');
check('espèce seule de son genre : nœud Genre inséré au-dessus', parentName(tx, 'Torosaurus latus') === 'Torosaurus' && parentName(tx, 'Homo sapiens') === 'Homo' && parentName(tx, 'Panthera leo persica') === 'Panthera' && find(tx, 'Torosaurus').rank === 'Genre');
check('genre éclaté : un nœud Genre par espèce ; nœud nommé conservé, genre inséré au-dessus',
  findAll(tx, 'Canis').length === 2 && parentName(tx, 'Felis catus') === 'Felis' && find(tx, 'Nomme').rank === undefined && parentName(tx, 'Gorillini') === 'Gorilla' && nGenera === 9);
const txDoc = M.migrate(F.toLegacyDoc(tx));
check('rang et italique conservés dans le document', Object.values(txDoc.taxa).some(t => t.fields.name === 'Triceratops' && t.fields.rank === 'Genre') && Object.values(txDoc.trees[0].nodes).filter(n => n.style.isItalic).length >= 9);

console.log('Consensus strict');
const nwc = n => n.children.length ? '(' + n.children.map(nwc).join(',') + ')' : n.name;
check('clades communs à tous les arbres seulement, ordre du premier arbre', nwc(F.strictConsensus(pt.all)) === '(Psittacosaurus,(Zuniceratops,(Leptoceratops,Protoceratops),(Centrosaurus,Chasmosaurus)))');
check('arbres identiques → même arbre', nwc(F.strictConsensus([F.parseNewick('((A,B),(C,D));'), F.parseNewick('((B,A),(D,C));')])) === '((A,B),(C,D))');
check('feuilles différentes → pas de consensus', F.strictConsensus([F.parseNewick('(A,B);'), F.parseNewick('(A,C);')]) === null);

console.log('Export depuis Cytoscape');
const cytoscape = require(process.cwd() + '/node_modules/cytoscape');
const cy = cytoscape({ headless: true, elements: [
  { data: { id: 'r', name: 'Hominidae', sortIndex: 0 } }, { data: { id: 'p', name: '', sortIndex: 1, support: { value: 95 } } },
  { data: { id: 'g', name: 'Gorilla', sortIndex: 0 } }, { data: { id: 'h', name: 'Homo sapiens', sortIndex: 0 } }, { data: { id: 'c', name: 'Pan', sortIndex: 1, branchLength: 0.2 } },
  { classes: 'romer-spindle', data: { id: 'sp' } },
  { data: { source: 'r', target: 'p' } }, { data: { source: 'r', target: 'g' } }, { data: { source: 'p', target: 'h' } }, { data: { source: 'p', target: 'c' } }, { data: { source: 'r', target: 'sp' } } ] });
const exported = F.writeNewick(F.fromCyNode(cy.$id('r')));
const cy2 = cytoscape({ headless: true, elements: [
  { data: { id: 'r', name: 'Hominidae' } }, { data: { id: 'g', name: 'Gorilla', rank: 'Genre', branchLength: 0.1 } }, { data: { id: 'gg', name: 'Gorilla gorilla', branchLength: 0.2 } },
  { data: { id: 'p', name: 'Pan', rank: 'Genre', sortIndex: 1 } }, { data: { id: 'p1', name: 'Pan troglodytes' } }, { data: { id: 'p2', name: 'Pan paniscus', sortIndex: 1 } },
  { data: { source: 'r', target: 'g' } }, { data: { source: 'g', target: 'gg' } }, { data: { source: 'r', target: 'p' } }, { data: { source: 'p', target: 'p1' } }, { data: { source: 'p', target: 'p2' } } ] });
const exported2 = F.writeNewick(F.fromCyNode(cy2.$id('r')));
check('genre à une espèce sauté à l\'export (longueurs additionnées), genre à plusieurs espèces gardé : ' + exported2, exported2 === '(Gorilla_gorilla:0.3,(Pan_troglodytes,Pan_paniscus)Pan)Hominidae;');
check('ordre d\'affichage (sortIndex), support, longueur, fuseaux exclus : ' + exported, exported === '(Gorilla,(Homo_sapiens,Pan:0.2)95)Hominidae;');

console.log('Étiquettes d\'arbre TNT (ttags)');
// Outils : nœuds internes, feuilles d'un clade, nœud interne dont les feuilles sont exactement `ids`.
const internals = n => n.children.length ? [n, ...[].concat(...n.children.map(internals))] : [];
const leavesOf = n => n.children.length ? [].concat(...n.children.map(leavesOf)) : [n];
const cladeOf = (tree, ids) => { const want = ids.map(k => 'Taxon ' + k).sort().join('|'); return internals(tree).find(n => leavesOf(n).map(l => l.name).sort().join('|') === want); };
const noParasite = tree => leavesOf(tree).every(l => !/^=/.test(l.name) && l.name !== '') && internals(tree).every(n => !/^=/.test(n.name));
// 1. « =11 » et 2. « =[19] » (entre crochets : groupe contredit par un groupe plus fréquent)
const g1 = F.parseTnt('tread (0 (1 2 )=11 (3 4 )=[19] )=100 ;').tree;
check('« =11 » : valeur de support', cladeOf(g1, [1, 2]).support === 11 && !cladeOf(g1, [1, 2]).supportBracketed);
check('« =[19] » : valeur ET indicateur « entre crochets »', cladeOf(g1, [3, 4]).support === 19 && cladeOf(g1, [3, 4]).supportBracketed === true);
check('étiquette de la racine, après la dernière parenthèse', g1.support === 100 && g1.name === '');
check('aucun nom de clade « =… », aucun taxon parasite', noParasite(g1) && leavesOf(g1).length === 5);
// 3. « =6/? » : plusieurs valeurs ; 4. « =/ » et « = » sur un taxon terminal : ignorés
const g2 = F.parseTnt('tread (0 =/ (1 =/ 2 =/ )=6/? )=12/? ;').tree;
check('« (0 =/ (1 =/ 2 =/ )=6/? )=12/? » : 3 taxons, supports 6 et 12', leavesOf(g2).map(l => l.name).join(' ') === 'Taxon 0 Taxon 1 Taxon 2' && cladeOf(g2, [1, 2]).support === 6 && g2.support === 12 && noParasite(g2));
check('« ? » = pas de valeur ; une seule colonne utile → pas de question', F.supportColumnsOf(g2) === 1 && g2.tags.length === 2 && g2.tags[1].value === null);
const g3 = F.parseTnt('tread (0= 1 = (2 3)=50 4=/)=;').tree;
check('« = » collé ou isolé sur un taxon terminal, « = » vide à la racine : ignorés', leavesOf(g3).length === 5 && noParasite(g3) && cladeOf(g3, [2, 3]).support === 50 && g3.support === undefined);
const g4 = F.parseTnt('tread (0 (1 2)=6/3 (3 4)=[5]/8)=12/[9];').tree;
check('plusieurs valeurs : la 1re par défaut, deux colonnes détectées', cladeOf(g4, [1, 2]).support === 6 && cladeOf(g4, [3, 4]).support === 5 && cladeOf(g4, [3, 4]).supportBracketed === true && F.supportColumnsOf(g4) === 2);
check('exemples montrés à l\'utilisateur', F.tntTagExamples(g4).join(', ') === '12/[9], 6/3, [5]/8');
F.chooseSupportColumn(g4, 1);
check('2e valeur choisie : crochets suivis valeur par valeur', cladeOf(g4, [1, 2]).support === 3 && cladeOf(g4, [3, 4]).support === 8 && !cladeOf(g4, [3, 4]).supportBracketed && g4.support === 9 && g4.supportBracketed === true);
const g5 = F.parseTnt('tread (0 (1 2)=?/7 3);').tree; F.chooseSupportColumn(g5, 0);
check('valeur absente dans la colonne choisie : pas de support', cladeOf(g5, [1, 2]).support === undefined);
// Plusieurs arbres : lesquels portent des étiquettes ; fichier refermé par « proc/; »
const two = F.parseTreeFile("tread 'tree(s) from TNT, for data in C:\\x\\d.tnt'\r\n(0 (1 (2 3 )))*\r\n(0 =/ (1 =/ (2 =/ 3 =/ )=45 )=[20] )=100 ;\r\nproc/;", 'tre');
check('deux arbres, seul le 2e étiqueté (« labeled »)', two.treeCount === 2 && JSON.stringify(two.labeled) === '[false,true]' && cladeOf(two.all[1], [2, 3]).support === 45 && cladeOf(two.all[1], [1, 2, 3]).supportBracketed === true && two.all[1].support === 100);
check('TNT sans étiquettes : aucun arbre étiqueté, aucun support', JSON.stringify(F.parseTnt(tnt).labeled) === '[false,false]' && internals(F.parseTnt(tnt).tree).every(n => n.support === undefined));
let unclosed = null; try { F.parseTnt('tread (0 (1 2 ;'); } catch (e) { unclosed = e; }
check('parenthèse non fermée : erreur explicite', unclosed && /non fermée/.test(unclosed.message));
// Jusqu'au document puis à l'export : l'indicateur suit, la valeur n'est jamais perdue.
const legacy = F.toLegacyDoc(g1);
const supOf = name => legacy.graph.elements.filter(e => e.data.support).map(e => e.data.support);
check('document : { value: 19, bracketed: true }', supOf().some(sp => sp.value === 19 && sp.bracketed === true) && supOf().some(sp => sp.value === 11 && !sp.bracketed));
const v2 = M.migrate(legacy);
check('indicateur conservé par migrate()', JSON.stringify(v2).includes('"bracketed":true'));
check('export Newick : valeur entre crochets écrite comme simple nombre', F.writeNewick(g1, 'support') === '(Taxon_0,(Taxon_1,Taxon_2)11,(Taxon_3,Taxon_4)19)100;');
const cy3 = cytoscape({ headless: true, elements: [
  { data: { id: 'r', name: 'R' } }, { data: { id: 'a', name: '', support: { value: '[19]', kind: 'support' } } }, { data: { id: 'b', name: '', sortIndex: 1, support: { value: 34, kind: 'support', bracketed: true } } },
  { data: { id: 'x', name: 'X' } }, { data: { id: 'y', name: 'Y', sortIndex: 1 } }, { data: { id: 'z', name: 'Z' } }, { data: { id: 'w', name: 'W', sortIndex: 1 } },
  { data: { source: 'r', target: 'a' } }, { data: { source: 'r', target: 'b' } }, { data: { source: 'a', target: 'x' } }, { data: { source: 'a', target: 'y' } }, { data: { source: 'b', target: 'z' } }, { data: { source: 'b', target: 'w' } } ] });
check('fromCyNode : « [19] » (chaîne) et 34 entre crochets exportés en nombres', F.writeNewick(F.fromCyNode(cy3.$id('r')), 'support') === '((X,Y)19,(Z,W)34)R;');

// Fichier réel exporté par TNT (fourni par l'utilisateur) : vérifié s'il est présent.
const realPath = path.join('test-data', 'bootstrap_test.tre');
if (fs.existsSync(realPath)) {
  const real = F.parseTreeFile(F.decodeText(fs.readFileSync(realPath)), 'tre');
  const lab = (real.labeled || []).map((l, k) => (l ? k : -1)).filter(k => k >= 0);
  const rt = real.all[lab[0]];
  const ids = leavesOf(rt).map(l => l.name);
  check('fichier réel : 2 arbres, un seul étiqueté', real.treeCount === 2 && lab.length === 1);
  check('fichier réel : 38 taxons (0 à 37), aucun parasite', ids.length === 38 && Array.from({ length: 38 }, (_, k) => ids.includes('Taxon ' + k)).every(Boolean) && noParasite(rt));
  check('fichier réel : 36 nœuds internes avec support', internals(rt).filter(n => n.support !== undefined).length === 36);
  const at = (k, v, br) => { const c = cladeOf(rt, k); return c && c.support === v && !!c.supportBracketed === br; };
  check('fichier réel : (3 5)=11, (6 7)=57, (10 33)=44', at([3, 5], 11, false) && at([6, 7], 57, false) && at([10, 33], 44, false));
  check('fichier réel : (11 37)=[19], (15 23)=[34] entre crochets', at([11, 37], 19, true) && at([15, 23], 34, true));
  const topLabeled = (n => { const q = [n]; while (q.length) { const x = q.shift(); if (x.support !== undefined) return x; q.push(...x.children); } return null; })(rt);
  check('fichier réel : nœud le plus haut étiqueté = 100', topLabeled && topLabeled.support === 100);
} else console.log('  (test-data/bootstrap_test.tre absent : vérifications du fichier réel non jouées)');

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
