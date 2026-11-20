// Tests du calcul des fuseaux du romérogramme (romer.ts). Lancer depuis my-new-app : npm test
const ts = require(process.cwd() + '/node_modules/typescript'); const fs = require('fs'); const path = require('path');
const cache = {};
const load = f0 => { const f = path.normalize(f0); if (cache[f]) return cache[f]; const m = { exports: {} }; cache[f] = m.exports;
  const req = r => r.startsWith('./') ? load(path.join('src', r.slice(2) + '.ts')) : require(r);
  new Function('module','exports','require', ts.transpileModule(fs.readFileSync(f,'utf8'), {compilerOptions:{module:'commonjs',target:'es2019'}}).outputText)(m, m.exports, req); return m.exports; };
// i18n.ts lit localStorage au chargement : absent de Node.
global.localStorage = global.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let R;
try { R = load('src/romer.ts'); } catch (e) { console.log('chargement impossible :', e.message); process.exit(1); }
let fails = 0; const check = (label, cond) => { console.log((cond ? '  ok     ' : '  ÉCHEC  ') + label); if (!cond) fails++; };

console.log('Âges des fiches');
check('intervalle « 233-66 » → [233, 66]', JSON.stringify(R.ageRange('233-66')) === '[233,66]');
check('intervalle inversé « 66-233 » → [233, 66]', JSON.stringify(R.ageRange('66-233')) === '[233,66]');
check('virgule décimale « 0,3-0 »', JSON.stringify(R.ageRange('0,3-0')) === '[0.3,0]');
check('âge ponctuel « 68 » → [68, 68]', JSON.stringify(R.ageRange('68')) === '[68,68]');
check('sans âge → null', R.ageRange('') === null && R.ageRange('Crétacé') === null);

console.log('Profil de diversité');
// x1 240-200, x2 230-100, x3 150-66, origine du clade 250, pas de 10 Ma
const bins = R.diversityProfile(250, [[240, 200], [230, 100], [150, 66]], 10);
const at = age => bins.find(b => b.old >= age && b.young < age).count;
check('tranches de l\'origine (250) au plus récent (66)', bins[0].old === 250 && Math.abs(bins[bins.length - 1].young - 66) < 1e-9);
check('245 Ma : aucun taxon encore', at(245) === 0);
check('215 Ma : x1 et x2', at(215) === 2);
check('175 Ma : x2 seul', at(175) === 1);
check('125 Ma : x2 et x3', at(125) === 2);
check('80 Ma : x3 seul', at(80) === 1);
const point = R.diversityProfile(100, [[90, 90], [50, 50]], 10);
check('âges ponctuels comptés dans leur tranche', point.filter(b => b.count === 1).length === 2 && point.reduce((s, b) => s + b.count, 0) === 2);
check('pas automatique : ~40 tranches au plus', R.autoStep(184) === 5 && R.autoStep(4567) === 200 && R.autoStep(3) === 0.1);

console.log('Disposition');
check('hauteur = taxons simultanés × épaisseur (min. 8 px)', R.spindleHeight(5, 24) === 120 && R.spindleHeight(1, 4) === 8);
const lbl = (c, total = 34) => R.romerLabelText('Mammalia', 12, total, c);
check('nombre : diversité maximale explicite', /^Mammalia \(.*12.*\)$/.test(lbl('max')) && lbl('max') !== 'Mammalia (12)');
check('nombre : taxons du clade', lbl('total').includes('34') && !lbl('total').includes('12'));
check('nombre : les deux', lbl('both').includes('34') && lbl('both').includes('12'));
check('nombre : aucun', lbl('none') === 'Mammalia');
check('un seul taxon : singulier', !/%n/.test(R.romerLabelText('X', 1, 1, 'total')) && R.romerLabelText('X', 1, 1, 'total') !== R.romerLabelText('X', 1, 2, 'total').replace('2', '1'));
check('taille du nom : choisie ou automatique (14 à 64 px)', R.romerFontSize(100, 20) === 20 && R.romerFontSize(10, 0) === 14 && R.romerFontSize(1000, 0) === 64);

console.log('Forme arrondie');
const prof = [[0, 0], [20, 0.5], [40, 1], [60, 0.1], [80, 1], [100, 0.4]];
const sm = R.smoothProfile(prof);
check('lissé : plus de points, mêmes extrémités', sm.length > prof.length * 3 && sm[0][0] === 0 && sm[0][1] === 0 && Math.abs(sm[sm.length - 1][0] - 100) < 1e-9 && Math.abs(sm[sm.length - 1][1] - 0.4) < 1e-9);
check('lissé : passe par chaque point du profil', prof.every(([x, y]) => sm.some(([sx, sy]) => Math.abs(sx - x) < 1e-9 && Math.abs(sy - y) < 1e-9)));
check('lissé : sans dépassement (entre 0 et 1, abscisses croissantes)', sm.every(([, y]) => y >= 0 && y <= 1 + 1e-9) && sm.every((p, i) => i === 0 || p[0] > sm[i - 1][0]));
const soft = R.softenProfile(prof, 0.05);
check('très arrondi : pointe et fin gardées, creux adouci', soft[0][1] === 0 && soft[5][1] === 0.4 && soft[3][1] > 0.1 && soft[2][1] < 1);
check('lissé : nombre de points borné sur un long fuseau', R.smoothProfile(Array.from({ length: 400 }, (_, i) => [i * 50, (i % 7) / 7]), 4, 1500).length <= 1500 + 400);

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
