// ==========================================
// CONTRÔLES STATIQUES : sélecteurs Cytoscape, clés de traduction, identifiants d'éléments
// ==========================================
// Usage (depuis my-new-app) : npm run test:static
// Trois familles de bugs silencieux :
//   1. sélecteur Cytoscape invalide → collection VIDE sans erreur (ex. « node:not(.box) ») ;
//   2. clé t('…') absente d'une langue → la clé brute s'affiche dans l'interface ;
//   3. getElementById('…') sur un identifiant qui n'existe nulle part → null.

const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const cytoscape = require('cytoscape');

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.ts')).map(f => path.join(SRC, f));
let failures = 0;
const report = (title, list) => {
    console.log(`\n${title} : ${list.length ? list.length + ' problème(s)' : 'ok'}`);
    list.forEach(l => console.log('   ' + l));
    failures += list.length;
};

// --- Parcours des chaînes et appels
const SELECTOR_METHODS = new Set(['nodes', 'edges', 'filter', 'not', '$', 'elements', 'successors', 'predecessors', 'outgoers', 'incomers', 'children', 'descendants', 'parents', 'ancestors', 'neighborhood', 'is', 'some', 'every', 'connectedNodes', 'connectedEdges', 'roots', 'leaves', 'siblings', 'parent', 'union', 'difference', 'contains', 'same']);
const selectors = [], tKeys = [], idUses = [], idDefs = new Set();
const loc = (sf, node) => `${path.basename(sf.fileName)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;

files.forEach(file => {
    const text = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2019, true);
    // Identifiants définis dans les gabarits HTML (chaînes et gabarits) ou par code (el.id = '…').
    for (const m of text.matchAll(/\bid=\\?["']([A-Za-z0-9_-]+)\\?["']/g)) idDefs.add(m[1]);
    for (const m of text.matchAll(/\.id\s*=\s*['"`]([A-Za-z0-9_-]+)['"`]/g)) idDefs.add(m[1]);
    const visit = node => {
        if (ts.isCallExpression(node)) {
            const callee = node.expression;
            const arg = node.arguments[0];
            const str = arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) ? arg.text : null;
            if (str !== null) {
                if (ts.isPropertyAccessExpression(callee) && SELECTOR_METHODS.has(callee.name.text)) selectors.push({ sel: str, at: loc(sf, node) });
                if (ts.isIdentifier(callee) && callee.text === 't') tKeys.push({ key: str, at: loc(sf, node) });
                if (ts.isPropertyAccessExpression(callee) && callee.name.text === 'getElementById') idUses.push({ id: str, at: loc(sf, node) });
            }
        }
        // Sélecteurs de feuille de style Cytoscape : { selector: '…' }
        if (ts.isPropertyAssignment(node) && node.name.getText() === 'selector' && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) {
            selectors.push({ sel: node.initializer.text, at: loc(sf, node) });
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
});

// --- 1. Sélecteurs : validés par l'analyseur de Cytoscape lui-même
const cy = cytoscape({ headless: true });
const badSel = [];
const origWarn = console.warn; const origErr = console.error;
selectors.forEach(({ sel, at }) => {
    if (!/^[\s\w.#\[:*$>,!=\]"'-]+/.test(sel) || /\s{2,}|^\s*$/.test(sel)) return;
    let invalid = false;
    console.warn = console.error = () => { invalid = true; };
    try { cy.$(sel); } catch { invalid = true; }
    console.warn = origWarn; console.error = origErr;
    if (invalid) badSel.push(`${at}  « ${sel} »`);
});
report(`Sélecteurs Cytoscape (${selectors.length} vérifiés)`, [...new Set(badSel)]);

// --- 2. Clés de traduction
const i18nText = fs.readFileSync(path.join(SRC, 'i18n.ts'), 'utf8');
const sfI = ts.createSourceFile('i18n.ts', i18nText, ts.ScriptTarget.ES2019, true);
const dicts = {};
const visitI = node => {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer) && ['fr', 'en'].includes(node.name.getText().replace(/['"]/g, ''))) {
        const lang = node.name.getText().replace(/['"]/g, '');
        dicts[lang] = new Set(node.initializer.properties.filter(ts.isPropertyAssignment).map(p => p.name.getText().replace(/^['"]|['"]$/g, '')));
    }
    ts.forEachChild(node, visitI);
};
visitI(sfI);
const missing = [];
if (!dicts.fr || !dicts.en) missing.push('dictionnaires fr/en introuvables dans i18n.ts');
else tKeys.forEach(({ key, at }) => {
    const langs = ['fr', 'en'].filter(l => !dicts[l].has(key));
    if (langs.length) missing.push(`${at}  '${key}' absente en : ${langs.join(', ')}`);
});
const onlyOne = [];
if (dicts.fr && dicts.en) {
    dicts.fr.forEach(k => { if (!dicts.en.has(k)) onlyOne.push(`'${k}' : fr seulement`); });
    dicts.en.forEach(k => { if (!dicts.fr.has(k)) onlyOne.push(`'${k}' : en seulement`); });
}
report(`Clés de traduction utilisées (${tKeys.length} appels)`, [...new Set(missing)]);
report('Clés présentes dans une seule langue', onlyOne);

// Autres langues (src/locales/) : tous les textes anglais, sauf les anciennes notes de version (« patch. »,
// affichées en anglais) ; noms géologiques dans geo-names.ts (généré).
const LOCALES = ['es', 'pt', 'it', 'de'];
const objectKeys = obj => new Set(obj.properties.filter(ts.isPropertyAssignment).map(p => p.name.getText().replace(/^['"]|['"]$/g, '')));
const geoText = fs.readFileSync(path.join(SRC, 'locales', 'geo-names.ts'), 'utf8');
const geoDicts = {};
const visitG = node => {
    if (ts.isPropertyAssignment(node) && ts.isObjectLiteralExpression(node.initializer) && LOCALES.includes(node.name.getText())) geoDicts[node.name.getText()] = objectKeys(node.initializer);
    ts.forEachChild(node, visitG);
};
visitG(ts.createSourceFile('geo-names.ts', geoText, ts.ScriptTarget.ES2019, true));
const localeProblems = [];
LOCALES.forEach(lang => {
    const file = path.join(SRC, 'locales', lang + '.ts');
    if (!fs.existsSync(file)) { localeProblems.push(`${lang} : fichier absent`); return; }
    const sf = ts.createSourceFile(lang + '.ts', fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2019, true);
    let keys = null;
    const find = node => { if (!keys && ts.isVariableDeclaration(node) && node.initializer && ts.isObjectLiteralExpression(node.initializer)) keys = objectKeys(node.initializer); ts.forEachChild(node, find); };
    find(sf);
    const all = new Set([...(keys || []), ...(geoDicts[lang] || [])]);
    const absent = [...(dicts.en || [])].filter(k => !k.startsWith('patch.') && !all.has(k));
    if (absent.length) localeProblems.push(`${lang} : ${absent.length} texte(s) manquant(s) — ${absent.slice(0, 6).join(', ')}${absent.length > 6 ? '…' : ''}`);
    const unknown = [...(keys || [])].filter(k => dicts.en && !dicts.en.has(k));
    if (unknown.length) localeProblems.push(`${lang} : clé(s) inconnue(s) — ${unknown.slice(0, 6).join(', ')}`);
});
report(`Autres langues (${LOCALES.join(', ')}) complètes`, localeProblems);

// --- 3. Identifiants d'éléments
const html = fs.existsSync(path.join(SRC, 'index.html')) ? fs.readFileSync(path.join(SRC, 'index.html'), 'utf8') : '';
for (const m of html.matchAll(/\bid=["']([A-Za-z0-9_-]+)["']/g)) idDefs.add(m[1]);
const badIds = idUses.filter(u => !idDefs.has(u.id)).map(u => `${u.at}  #${u.id}`);
report(`Identifiants d'éléments (${idUses.length} utilisations)`, [...new Set(badIds)]);

console.log(failures ? `\n${failures} problème(s) au total.` : '\nAucun problème.');
process.exit(failures ? 1 : 0);
