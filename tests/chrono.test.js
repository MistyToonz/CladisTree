// Cohérence de la charte chronostratigraphique (chrono-data.ts) : tables de la figure d'aide
// (séries, ères, limites, couleurs) face à GEO_DETAILS, seule source des âges. Lancer : npm test
const ts = require(process.cwd() + '/node_modules/typescript'); const fs = require('fs');
const m = { exports: {} };
new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync('src/chrono-data.ts', 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2019' } }).outputText)(m, m.exports, require);
const C = m.exports;
let fails = 0; const check = (label, cond, detail = '') => { console.log((cond ? '  ok     ' : '  ÉCHEC  ') + label + (cond || !detail ? '' : ' → ' + detail)); if (!cond) fails++; };

console.log('Charte détaillée (figure « Frise des temps géologiques »)');
const stages = C.PHANEROZOIC_PERIODS.flatMap(p => p.subs.map(s => ({ ...s, period: p.key })));
const inEpochs = C.EPOCHS.flatMap(e => e.stages.map(k => ({ k, period: e.period })));
const missing = stages.filter(s => inEpochs.filter(x => x.k === s.k).length !== 1).map(s => s.k);
check('chaque étage appartient à une seule série', missing.length === 0, missing.join(' '));
const wrongPeriod = inEpochs.filter(x => { const s = stages.find(st => st.k === x.k); return !s || s.period !== x.period; }).map(x => x.k);
check('la série d\'un étage est dans la période de cet étage', wrongPeriod.length === 0, wrongPeriod.join(' '));
// Étages d'une série : contigus et dans l'ordre de GEO_DETAILS (du plus récent au plus ancien).
const order = stages.map(s => s.k);
const broken = C.EPOCHS.filter(e => e.stages.some((k, i) => i > 0 && order.indexOf(k) !== order.indexOf(e.stages[i - 1]) + 1)).map(e => e.key);
check('étages d\'une série contigus, du plus récent au plus ancien', broken.length === 0, broken.join(' '));
const allUnits = [...stages.map(s => s.k), ...C.PRECAMBRIAN_UNITS.flatMap(u => [u.key, ...u.subs.map(s => s.k)])];
const noBoundary = allUnits.filter(k => !(k in C.BOUNDARIES));
check('nature de la limite connue pour chaque étage et unité précambrienne', noBoundary.length === 0, noBoundary.join(' '));
const kinds = Object.values(C.BOUNDARIES);
check('80 clous d\'or, 16 limites numériques (GSSA) — charte ' + C.ICS_CHART_VERSION, kinds.filter(b => b.kind === 'gssp').length === 80 && kinds.filter(b => b.kind === 'gssa').length === 16);
check('ère Néoprotérozoïque : base du Tonien, âge numérique', C.BOUNDARIES['geo.era.neoproterozoic'].kind === 'gssa' && C.BOUNDARIES['geo.tonian'].kind === 'gssa');
check('limites connues sans clou d\'or : Berriasien, Cryogénien, Étage 2', ['geo.berriasian', 'geo.cryogenian', 'geo.stage2'].every(k => C.BOUNDARIES[k].kind === null));
check('clou d\'or : base du Trias (± 0,024 Ma), de l\'Édiacarien', C.BOUNDARIES['geo.induan'].kind === 'gssp' && C.BOUNDARIES['geo.induan'].err === 0.024 && C.BOUNDARIES['geo.ediacaran'].kind === 'gssp');
const noColor = stages.filter(s => !/^#[0-9A-F]{6}$/i.test(C.STAGE_COLORS[s.k] || '')).map(s => s.k);
check('couleur officielle pour chaque étage', noColor.length === 0, noColor.join(' '));
const eraPeriods = C.PHANEROZOIC_ERAS.flatMap(e => e.periods);
check('chaque période du Phanérozoïque dans une ère, dans l\'ordre', JSON.stringify(eraPeriods) === JSON.stringify(C.PHANEROZOIC_PERIODS.map(p => p.key)));

console.log(fails ? `\n${fails} ÉCHEC(S)` : '\nTous les tests passent.');
process.exit(fails ? 1 : 0);
