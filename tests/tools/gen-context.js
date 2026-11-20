// ==========================================
// GÉNÈRE src/app-context.ts ET LE BLOC `ctx` DE renderer.ts (phase 0.2)
// ==========================================
// Usage : node tests/tools/gen-context.js
// Source : tests/tools/.app-context.json (rempli par extract-module.js).
// Chaque membre est un accesseur : `get X() { return X; }` (+ `set` pour les `let`). L'accès est donc
// résolu au moment de l'appel, jamais à la création du contexte (pas d'erreur d'ordre d'initialisation).

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER = path.join(ROOT, 'src', 'renderer.ts');
const CTX_FILE = path.join(ROOT, 'src', 'app-context.ts');
const state = JSON.parse(fs.readFileSync(path.join(__dirname, '.app-context.json'), 'utf8'));
const text = fs.readFileSync(RENDERER, 'utf8');
const nl = text.includes('\r\n') ? '\r\n' : '\n';
const names = Object.keys(state.members).sort();

// --- Interface
const iface = [
    '// ==========================================',
    '// CONTEXTE PARTAGÉ ENTRE renderer.ts ET SES MODULES',
    '// ==========================================',
    '// Généré par tests/tools/gen-context.js : ne pas modifier à la main (relancer l\'outil).',
    '// Chaque propriété est un accesseur vers une variable ou fonction de startApp() (renderer.ts),',
    '// lu au moment de l\'appel. Les propriétés modifiables correspondent à des `let` partagés.',
    '',
    "import type cytoscape from 'cytoscape';",
    "import type { initUI } from './ui';",
    "import type { ChronoAxisMode } from './chrono-axis';",
    '',
    'export interface AppContext {',
    '    readonly cy: cytoscape.Core;',
    '    readonly ui: ReturnType<typeof initUI>;',
    ...names.map(n => {
        const m = state.members[n];
        return `    ${m.kind === 'let' ? '' : 'readonly '}${n}: ${m.type};`;
    }),
    '}',
    '',
].join(nl);
fs.writeFileSync(CTX_FILE, iface, 'utf8');

// --- Bloc ctx dans renderer.ts
const block = [
    '  // <app-context> généré par tests/tools/gen-context.js — accesseurs résolus à l\'appel',
    '  const ctx: AppContext = {',
    '    get cy() { return cy; },',
    '    get ui() { return ui; },',
    ...names.map(n => state.members[n].kind === 'let'
        ? `    get ${n}() { return ${n}; }, set ${n}(v) { ${n} = v; },`
        : `    get ${n}() { return ${n}; },`),
    '  };',
    '  // </app-context>',
].join(nl);

let out;
const startTag = text.indexOf('  // <app-context>');
if (startTag >= 0) {
    const endTag = text.indexOf('// </app-context>', startTag) + '// </app-context>'.length;
    out = text.slice(0, startTag) + block + text.slice(endTag);
} else {
    // Première génération : juste après la création de cy.
    const sf = ts.createSourceFile(RENDERER, text, ts.ScriptTarget.ES2019, true);
    let cyEnd = -1;
    const visit = n => {
        if (cyEnd < 0 && ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText() === 'cy')) cyEnd = n.getEnd();
        ts.forEachChild(n, visit);
    };
    visit(sf);
    if (cyEnd < 0) throw new Error('création de cy introuvable');
    out = text.slice(0, cyEnd) + nl + nl + block + text.slice(cyEnd);
    out = out.replace(/(import \{ toAssetRef, resolveAsset \} from '\.\/asset-store';\r?\n)/, `$1import type { AppContext } from './app-context';${nl}`);
}
fs.writeFileSync(RENDERER, out, 'utf8');
console.log(`app-context.ts : ${names.length} membre(s) partagé(s) (+ cy, ui).`);
