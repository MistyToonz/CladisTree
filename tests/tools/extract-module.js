// ==========================================
// OUTIL D'EXTRACTION DE MODULE HORS DE renderer.ts (phase 0.2 de la feuille de route)
// ==========================================
// Usage : node tests/tools/extract-module.js spec.json
// spec = { module, init, title, doc, select: [préfixes de description d'instruction], after: préfixe }
//
// S'appuie sur le vérificateur de types (et non sur le texte) pour savoir à quoi renvoie chaque
// identifiant du code déplacé :
//   - déclaration de premier niveau de startApp restée dans renderer.ts → `ctx.X` (accès différé) ;
//   - import de renderer.ts → même import dans le module ;
//   - déclaration déplacée utilisée par le reste de renderer.ts → exportée par initX() et déstructurée.
// Le contexte (`ctx`, interface AppContext) est régénéré à chaque passage à partir de .app-context.json.

const ts = require('typescript');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'src');
const RENDERER = path.join(SRC, 'renderer.ts');
const STATE = path.join(__dirname, '.app-context.json');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const options = {
    target: ts.ScriptTarget.ES2015, module: ts.ModuleKind.CommonJS, lib: ['lib.es2019.d.ts', 'lib.dom.d.ts', 'lib.dom.iterable.d.ts'],
    types: [], esModuleInterop: true, moduleResolution: ts.ModuleResolutionKind.NodeJs, noImplicitAny: true, skipLibCheck: true, noEmit: true, resolveJsonModule: true,
};
const program = ts.createProgram([RENDERER], options);
const checker = program.getTypeChecker();
const sf = program.getSourceFile(RENDERER);
const text = sf.getFullText();
const line = pos => sf.getLineAndCharacterOfPosition(pos).line + 1;

// --- Corps de startApp
let body = null;
sf.statements.forEach(st => {
    if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach(d => {
        if (d.name.getText() === 'startApp' && d.initializer && ts.isArrowFunction(d.initializer)) body = d.initializer.body;
    });
});
const describe = st => {
    if (ts.isFunctionDeclaration(st)) return `function ${st.name.text}`;
    if (ts.isVariableStatement(st)) return (st.declarationList.flags & ts.NodeFlags.Const ? 'const ' : 'let ') + st.declarationList.declarations.map(d => d.name.getText()).join(', ');
    if (ts.isExpressionStatement(st)) return 'expr ' + st.expression.getText().replace(/\s+/g, ' ');
    if (ts.isTypeAliasDeclaration(st)) return 'type ' + st.name.text;
    return ts.SyntaxKind[st.kind];
};
const stmts = body.statements.slice();

// --- Sélection
const moved = new Set();
spec.select.forEach(prefix => {
    const exact = stmts.filter(st => describe(st) === prefix);
    const hits = exact.length === 1 ? exact : stmts.filter(st => describe(st).startsWith(prefix));
    if (hits.length !== 1) { console.error(`Sélecteur « ${prefix} » : ${hits.length} correspondance(s)`); hits.forEach(h => console.error('   ', line(h.getStart()), describe(h).slice(0, 90))); process.exit(1); }
    moved.add(hits[0]);
});
const after = stmts.filter(st => describe(st).startsWith(spec.after));
if (after.length !== 1) { console.error(`Ancre « ${spec.after} » : ${after.length} correspondance(s)`); process.exit(1); }

// --- Déclarations de premier niveau
const isTopDecl = decl => {
    if (ts.isFunctionDeclaration(decl)) return decl.parent === body ? decl : null;
    if (ts.isVariableDeclaration(decl) && decl.parent && decl.parent.parent && decl.parent.parent.parent === body) return decl.parent.parent;
    if (ts.isTypeAliasDeclaration(decl) && decl.parent === body) return decl;
    // const { a, b } = initX(ctx) : élément de déstructuration d'une déclaration de premier niveau
    if (ts.isBindingElement(decl) && ts.isObjectBindingPattern(decl.parent) && ts.isVariableDeclaration(decl.parent.parent) && decl.parent.parent.parent.parent.parent === body) return decl.parent.parent.parent.parent;
    return null;
};
const isModuleLevel = decl => ts.isVariableDeclaration(decl) && decl.parent && decl.parent.parent && decl.parent.parent.parent === sf;
const importOf = decl => {
    if (decl.getSourceFile() !== sf) return null;
    if (ts.isImportSpecifier(decl)) {
        const spec = decl.parent.parent.parent.moduleSpecifier.text;
        const imported = decl.propertyName ? `${decl.propertyName.text} as ${decl.name.text}` : decl.name.text;
        return { key: spec, named: imported };
    }
    if (ts.isImportClause(decl)) return { key: decl.parent.moduleSpecifier.text, def: decl.name.text };
    if (ts.isNamespaceImport(decl)) return { key: decl.parent.parent.moduleSpecifier.text, ns: decl.name.text };
    return null;
};
// Type déclaré (annotation) de préférence au type rétréci au point d'utilisation.
const declaredType = (sym, decl) => (ts.isVariableDeclaration(decl) && decl.type) ? decl.type.getText() : checker.typeToString(checker.getTypeOfSymbolAtLocation(sym, decl), undefined, ts.TypeFormatFlags.NoTruncation);
const kindOf = stmt => ts.isFunctionDeclaration(stmt) ? 'function' : ts.isTypeAliasDeclaration(stmt) ? 'type' : (stmt.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let');

const ctxState = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { members: {} };
const deps = new Map();       // nom → { kind, type }
const imports = new Map();    // module → { named:Set, def, ns }
const replacements = [];      // { start, end, text }
const DESTRUCTURE = new Set(['cy', 'ui']);
const usedDestructured = new Set();
const problems = [];

const visitMoved = (node) => {
    if (ts.isIdentifier(node)) {
        const p = node.parent;
        const isPropName = (ts.isPropertyAccessExpression(p) && p.name === node) || (ts.isPropertyAssignment(p) && p.name === node) || (ts.isMethodDeclaration(p) && p.name === node) || (ts.isPropertyDeclaration(p) && p.name === node);
        if (!isPropName) {
            let sym = checker.getSymbolAtLocation(node);
            if (ts.isShorthandPropertyAssignment(p)) sym = checker.getShorthandAssignmentValueSymbol(p);
            const decl = sym && sym.declarations && sym.declarations[0];
            if (decl) {
                const top = isTopDecl(decl);
                const imp = importOf(decl);
                const name = node.text;
                if (top && !moved.has(top)) {
                    const kind = kindOf(top);
                    if (kind === 'type') problems.push(`type local de startApp utilisé : ${name} (ligne ${line(node.getStart())})`);
                    else if (DESTRUCTURE.has(name)) usedDestructured.add(name);
                    else {
                        deps.set(name, { kind, type: declaredType(sym, decl) });
                        replacements.push(ts.isShorthandPropertyAssignment(p)
                            ? { start: p.getStart(), end: p.getEnd(), text: `${name}: ctx.${name}` }
                            : { start: node.getStart(), end: node.getEnd(), text: `ctx.${name}` });
                    }
                } else if (isModuleLevel(decl)) {
                    const name = node.text;
                    if (DESTRUCTURE.has(name)) usedDestructured.add(name);
                    else {
                        const vs = decl.parent.parent;
                        deps.set(name, { kind: vs.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'let', type: declaredType(sym, decl) });
                        replacements.push({ start: node.getStart(), end: node.getEnd(), text: `ctx.${name}` });
                    }
                } else if (imp) {
                    const e = imports.get(imp.key) || { named: new Set() };
                    if (imp.named) e.named.add(imp.named); if (imp.def) e.def = imp.def; if (imp.ns) e.ns = imp.ns;
                    imports.set(imp.key, e);
                }
            }
        }
    }
    ts.forEachChild(node, visitMoved);
};
moved.forEach(st => visitMoved(st));

// --- Exports : déclarations déplacées encore utilisées ailleurs dans renderer.ts
const movedDeclNames = new Map();
moved.forEach(st => {
    if (ts.isFunctionDeclaration(st)) movedDeclNames.set(st.name.text, 'function');
    else if (ts.isVariableStatement(st)) st.declarationList.declarations.forEach(d => movedDeclNames.set(d.name.getText(), kindOf(st)));
});
const exportsSet = new Set();
const visitRest = node => {
    if (ts.isIdentifier(node)) {
        const sym = checker.getSymbolAtLocation(node);
        const decl = sym && sym.declarations && sym.declarations[0];
        const top = decl && isTopDecl(decl);
        if (top && moved.has(top)) exportsSet.add(node.text);
    }
    ts.forEachChild(node, visitRest);
};
const startAppStmt = sf.statements.find(st => st.pos <= body.pos && st.end >= body.end);
sf.statements.forEach(st => { if (st !== startAppStmt) visitRest(st); });
stmts.forEach(st => { if (!moved.has(st)) visitRest(st); });
exportsSet.forEach(n => { if (movedDeclNames.get(n) === 'let') problems.push(`variable « let ${n} » déplacée mais encore utilisée par renderer.ts : à traiter à la main`); });

if (problems.length) { console.error('Problèmes :\n  ' + problems.join('\n  ')); process.exit(1); }

// --- Texte du module (instructions déplacées, dans l'ordre, commentaires compris)
const movedSorted = stmts.filter(st => moved.has(st));
const chunks = movedSorted.map(st => {
    let s = st.getFullStart(), e = st.getEnd();
    let t = text.slice(s, e);
    replacements.filter(r => r.start >= s && r.end <= e).sort((a, b) => b.start - a.start).forEach(r => {
        t = t.slice(0, r.start - s) + r.text + t.slice(r.end - s);
    });
    return t.replace(/^(\r?\n)+/, '\n');
});
const nl = text.includes('\r\n') ? '\r\n' : '\n';
const importLines = [...imports.entries()].map(([mod, e]) => {
    const parts = [];
    if (e.def) parts.push(e.def);
    if (e.ns) parts.push(`* as ${e.ns}`);
    if (e.named.size) parts.push(`{ ${[...e.named].join(', ')} }`);
    return `import ${parts.join(', ')} from '${mod}';`;
});
const destructure = usedDestructured.size ? `  const { ${[...usedDestructured].join(', ')} } = ctx;${nl}` : '';
const exportList = [...exportsSet];
const header = [
    '// ==========================================',
    `// ${spec.title}`,
    '// ==========================================',
    ...spec.doc.map(l => '// ' + l),
    '// Extrait de renderer.ts (phase 0.2) : le code est inchangé, les dépendances vers le reste de',
    '// l\'application passent par `ctx` (voir app-context.ts), résolues au moment de l\'appel.',
    '',
    ...importLines,
    "import type { AppContext } from './app-context';",
    '',
    `export function ${spec.init}(ctx: AppContext) {`,
].join(nl) + nl;
const moduleText = header + destructure + chunks.join('').replace(/\r?\n/g, nl) + nl + nl + `  return { ${exportList.join(', ')} };${nl}}${nl}`;
fs.writeFileSync(path.join(SRC, spec.module + '.ts'), moduleText, 'utf8');

// --- Mise à jour de renderer.ts : retrait des instructions, appel d'initialisation
let out = text;
const cuts = movedSorted.map(st => ({ start: st.getFullStart(), end: st.getEnd() }));
const initCall = exportList.length ? `${nl}  const { ${exportList.join(', ')} } = ${spec.init}(ctx);` : `${nl}  ${spec.init}(ctx);`;
const anchorEnd = after[0].getEnd();
// Appliquer de la fin vers le début
const edits = [...cuts.map(c => ({ ...c, text: '' })), { start: anchorEnd, end: anchorEnd, text: initCall }].sort((a, b) => b.start - a.start);
edits.forEach(ed => { out = out.slice(0, ed.start) + ed.text + out.slice(ed.end); });
// Import du module
const importLine = `import { ${spec.init} } from './${spec.module}';`;
out = out.replace(/(import \{ toAssetRef, resolveAsset \} from '\.\/asset-store';\r?\n)/, `$1${importLine}${nl}`);
if (!out.includes(importLine)) throw new Error("point d'insertion des imports introuvable");

// --- Contexte partagé
deps.forEach((v, k) => { ctxState.members[k] = v; });
fs.writeFileSync(STATE, JSON.stringify(ctxState, null, 1));
fs.writeFileSync(RENDERER, out, 'utf8');

console.log(`Module ${spec.module}.ts : ${movedSorted.length} instructions déplacées (${movedSorted.reduce((n, st) => n + line(st.end) - line(st.getStart()) + 1, 0)} lignes).`);
console.log(`  exports  : ${exportList.join(', ') || '(aucun)'}`);
console.log(`  contexte : ${[...deps.keys()].join(', ') || '(rien de nouveau)'}`);
console.log(`  imports  : ${[...imports.keys()].join(', ')}`);
