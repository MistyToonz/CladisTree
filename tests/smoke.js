// ==========================================
// TEST DE FUMÉE : lance la vraie application et joue un scénario
// ==========================================
// Usage (depuis my-new-app) : npm run test:smoke [-- rapport.json]
// Pilote la fenêtre via le protocole DevTools (--remote-debugging-port), accepte automatiquement les
// alert/confirm, et relève TOUTES les exceptions et erreurs console. Le scénario couvre : ouverture d'un
// fichier 1.3, changements de mode, copier/couper/coller, annuler, enregistrer (v2), rouvrir, molette,
// recherche, menu contextuel, fiche, nouveau document.
// Les étapes qui ouvriraient un dialogue natif (export, copie 1.3, greffe) ne sont pas jouées.

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 9333;
const reportPath = process.argv[2];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cladis-smoke-'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- Fichier de test au format 1.3 (même forme que cy.json())
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8DwnwEJMDKgAQBOGAQBsJ4lIQAAAABJRU5ErkJggg==';
const base = { status: 'Valide', rank: 'Clade (non-classé)', discoveryDate: '', distribution: '', author: '', size: '', mass: '', period: '', synapomorphies: '', notes: '', collapsed: false, hasNewSheet: false, fontFamily: 'serif', fontSize: 16, imgUrl: '', imgSize: 30, imgRatio: 1, imgPos: 'left', hasFrame: false, frameColor: '#000000', imgCredits: '' };
const node = (id, name, extra = {}) => ({ group: 'nodes', classes: 'taxon', data: { ...base, id, name, extinct: false, isBold: false, isItalic: false, sortIndex: 0, ...extra } });
const edge = (s, t) => ({ group: 'edges', data: { source: s, target: t } });
const v1 = { version: '1.0', currentRootId: 'root', graph: { elements: { nodes: [
    node('root', 'Vertebrata', { isBold: true }),
    node('A', 'Dinosauria', { period: '233-66', imgUrl: IMG, imgRatio: 1 }),
    node('B', 'Tyrannosaurus rex', { period: '68-66', imgUrl: IMG, isItalic: true }),
    node('C', 'Triceratops horridus', { period: '68-66', isItalic: true, synonymTargetId: 'B' }),
    node('D', 'Mammalia', { period: '225-0' }),
    node('E', 'Homo sapiens', { period: '0.3-0', isItalic: true }),
  ].map(n => ({ data: n.data, classes: n.classes })), edges: [edge('root', 'A'), edge('A', 'B'), edge('A', 'C'), edge('root', 'D'), edge('D', 'E')].map(e => ({ data: e.data })) } } };
// Son de test : WAV PCM 8 kHz mono, 0,1 s de silence.
const wavPath = path.join(tmp, 'cri.wav');
{ const n = 800, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(8000, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44); fs.writeFileSync(wavPath, b); }
const v1Path = path.join(tmp, 'test-1.3.phylo');
fs.writeFileSync(v1Path, JSON.stringify(v1));
// Arbre dont la racine ne s'appelle pas « root » (cas des imports XMind).
const xroot = { version: '1.0', currentRootId: 'X0', graph: { elements: [
    node('X0', 'Racine XMind', { isBold: true }), node('X1', 'Aves'), node('X2', 'Passer domesticus', { isItalic: true }),
    edge('X0', 'X1'), edge('X1', 'X2') ] } };
const xPath = path.join(tmp, 'racine-xmind.phylo');
fs.writeFileSync(xPath, JSON.stringify(xroot));
// Chronogramme dont deux troncs verticaux se superposent (R à 60 Ma, P1 et P2 à 50,3 Ma).
const lanes = { version: '1.0', currentRootId: 'R', graph: { elements: [
    node('R', 'Clade R', { period: '60' }), node('P1', 'Clade P1', { period: '50.3' }), node('P2', 'Clade P2', { period: '50.3' }),
    node('L1', 'Taxon 1', { period: '50.2' }), node('L2', 'Taxon 2', { period: '50.2' }), node('L3', 'Taxon 3', { period: '50.2' }), node('L4', 'Taxon 4', { period: '50.2' }),
    edge('R', 'P1'), edge('R', 'P2'), edge('P1', 'L1'), edge('P1', 'L2'), edge('P2', 'L3'), edge('P2', 'L4') ] } };
const lanesPath = path.join(tmp, 'couloirs.phylo');
// Classifications par feuille : R → A, B (sous-feuille), C ; A → A1, A2 ; B → B1, B2.
const variantsDoc = { version: '1.0', currentRootId: 'R', graph: { elements: [
    node('R', 'Reptilia'), node('A', 'Archosauria'), node('B', 'Testudines', { hasNewSheet: true }), node('C', 'Lepidosauria'),
    node('A1', 'Aves'), node('A2', 'Crocodylia'), node('B1', 'Cryptodira'), node('B2', 'Pleurodira'),
    edge('R', 'A'), edge('R', 'B'), edge('R', 'C'), edge('A', 'A1'), edge('A', 'A2'), edge('B', 'B1'), edge('B', 'B2') ] } };
const variantsPath = path.join(tmp, 'classifications.phylo');
// Romérogramme : deux clades datés (au plus 2 taxons simultanés dans chacun).
const romerDoc = { version: '1.0', currentRootId: 'R', graph: { elements: [
    node('R', 'Amniota', { period: '320' }), node('X', 'Synapsida', { period: '250' }), node('Y', 'Sauropsida', { period: '200' }),
    node('x1', 'Taxon x1', { period: '240-200' }), node('x2', 'Taxon x2', { period: '230-100' }), node('x3', 'Taxon x3', { period: '150-66' }),
    node('y1', 'Taxon y1', { period: '190-180' }), node('y2', 'Taxon y2', { period: '185-0' }),
    // Clade d'espèces actuelles (toutes à « 0 », sans âge propre) : pas d'étendue temporelle, dessiné normalement.
    // Il faisait planter la mise en page (profil vide) et laissait Cytoscape en mode « lot ».
    node('Z', 'Actuels'), node('z1', 'Actuel 1', { period: '0' }), node('z2', 'Actuel 2', { period: '0' }),
    edge('R', 'X'), edge('R', 'Y'), edge('X', 'x1'), edge('X', 'x2'), edge('X', 'x3'), edge('Y', 'y1'), edge('Y', 'y2'),
    edge('R', 'Z'), edge('Z', 'z1'), edge('Z', 'z2') ] } };
const romerPath = path.join(tmp, 'romerogramme.phylo');
// Formats d'arbre : Newick avec supports et longueurs ; NEXUS à deux arbres avec TRANSLATE.
const nwkPath = path.join(tmp, 'hominides.nwk');
fs.writeFileSync(nwkPath, "((Homo_sapiens:0.1,'Pan troglodytes':0.12)95:0.3,(Gorilla_gorilla,Pongo)Ponginae:0.5)Hominidae;\n");
const nexPath = path.join(tmp, 'oiseaux.nex');
fs.writeFileSync(nexPath, '#NEXUS\nBEGIN TREES;\n  TRANSLATE 1 Passer_domesticus, 2 Corvus_corax, 3 Gallus_gallus;\n  TREE t1 = ((1,2)88,3);\n  TREE t2 = (1,(2,3));\nEND;\n');
// TNT : données (xread) + arbres numérotés écrits par TNT, en Windows-1252 (« é » dans le chemin), fichier d'arbres
// non refermé (ni « ; » ni « proc » : « tsave » laissé ouvert, cas réel).
const tntDataPath = path.join(tmp, 'données cératopsiens.tnt');
fs.writeFileSync(tntDataPath, Buffer.from(["xread", "'Matrice'", '2 4', 'Psittacosaurus 00', 'Leptoceratops 11', 'Protoceratops 12', 'Triceratops 12', ';', 'proc/;', ''].join('\r\n'), 'latin1'));
const tntTreePath = path.join(tmp, 'arbres cératopsiens.tre');
fs.writeFileSync(tntTreePath, Buffer.from([`tread 'tree(s) from TNT, for data in ${tntDataPath}'`, '(0 (1 (2 3)))*', '(0 ((1 2) 3))', ''].join('\r\n'), 'latin1'));
fs.writeFileSync(lanesPath, JSON.stringify(lanes));
fs.writeFileSync(variantsPath, JSON.stringify(variantsDoc));
fs.writeFileSync(romerPath, JSON.stringify(romerDoc));

// --- Lancement (dossier de données isolé créé d'avance : Chromium y écrit dès le démarrage)
fs.mkdirSync(path.join(tmp, 'user-data'), { recursive: true });
const child = spawn('npx', ['electron-forge', 'start', '--', `--remote-debugging-port=${PORT}`], {
    cwd: path.join(__dirname, '..'), shell: true,
    // Dossier de données isolé : réglages, langue et projets récents de l'utilisateur jamais modifiés.
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1', CLADISTREE_USER_DATA: path.join(tmp, 'user-data') },
});
let appLog = '';
child.stdout.on('data', d => { appLog += d; });
child.stderr.on('data', d => { appLog += d; });
const killApp = () => { try { execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' }); } catch { child.kill(); } };

const problems = [];
const results = {};

(async () => {
    let target = null;
    for (let i = 0; i < 240 && !target; i++) {
        await sleep(1000);
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            target = list.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
        } catch { /* pas encore prêt */ }
    }
    if (!target) throw new Error('fenêtre introuvable (DevTools)');

    let currentStep = 'démarrage';
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let msgId = 0; const pending = new Map();
    const send = (method, params = {}) => new Promise(res => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
        if (m.method === 'Runtime.exceptionThrown') {
            const d = m.params.exceptionDetails;
            problems.push({ kind: 'exception', text: (d.exception && d.exception.description) || d.text, step: currentStep });
        } else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) {
            problems.push({ kind: 'console.' + m.params.type, text: m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300), step: currentStep });
        } else if (m.method === 'Page.javascriptDialogOpening') {
            send('Page.handleJavaScriptDialog', { accept: true });
        }
    };
    await send('Runtime.enable'); await send('Page.enable');
    // Fenêtre au premier plan : sans focus, les événements souris simulés et le presse-papiers échouent.
    await send('Page.bringToFront');

    const evaluate = async (expr) => {
        const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true });
        if (r.result && r.result.exceptionDetails) return { error: r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text };
        return r.result && r.result.result ? r.result.result.value : undefined;
    };
    const step = async (name, expr) => {
        currentStep = name;
        let v;
        try { v = await evaluate(expr); } catch (e) { v = { error: String(e) }; }
        results[name] = v;
        console.log(`${(v && v.error) ? 'ÉCHEC' : 'ok   '}  ${name} → ${JSON.stringify(v)}`);
        await sleep(300);
    };

    // Attendre que l'application soit prête
    for (let i = 0; i < 60; i++) { if (await evaluate(`return !!(document.getElementById('app')?._cyreg?.cy && window._loadOSFile)`)) break; await sleep(500); }
    // Premier lancement (dossier de données neuf) : choix de la langue → français, sans rechargement.
    await evaluate(`const p = document.getElementById('hub-lang'); if (p && getComputedStyle(p).display !== 'none') p.querySelector('[data-lang="fr"]').click(); return 1;`);

    const H = `const cy = document.getElementById('app')._cyreg.cy; const wait = ms => new Promise(r => setTimeout(r, ms));
      const key = (k, o = {}) => (document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: k, ctrlKey: !!o.ctrl, shiftKey: !!o.shift, bubbles: true }));
      const counts = () => ({ nodes: cy.nodes('.taxon').length, edges: cy.edges().length });`;

    await evaluate(`window.__winErrors = []; window.addEventListener('error', e => window.__winErrors.push(String(e.message || e.error || e))); window.addEventListener('unhandledrejection', e => window.__winErrors.push('promesse rejetée : ' + String(e.reason))); return 1;`);
    await step('démarrage', `${H} return counts();`);
    // --- Phase 4 : hub d'accueil et écran de chargement
    await step('hub au démarrage', `${H} const hub = document.getElementById('welcome-overlay'), ld = document.getElementById('loading-overlay');
      return { hub: getComputedStyle(hub).display, loadingGone: !ld || getComputedStyle(ld).display === 'none', templates: hub.querySelectorAll('[data-template]').length,
        logo: !!hub.querySelector('.hub-logo').getAttribute('src'), cards: hub.querySelectorAll('.hub-card').length };`);
    await step('ouvrir fichier 1.3', `${H} await window._loadOSFile(${JSON.stringify(v1Path)}); await wait(500);
      return { ...counts(), imgRef: String(cy.$id('A').data('imgUrl')).slice(0, 6), synonym: cy.$id('C').data('synonymTargetId'), taxonId: cy.$id('B').data('taxonId') };`);
    // --- Phase 2 : ruban à onglets
    await step('onglets : un panneau par onglet', `${H} const vis = id => getComputedStyle(document.getElementById(id)).display !== 'none';
      const panels = ['style-ribbon', 'ribbon-display', 'ribbon-tree', 'ribbon-help']; const res = {};
      for (const tab of ['style', 'display', 'tree', 'help']) { if (!document.getElementById('tab-' + tab).classList.contains('active')) document.getElementById('tab-' + tab).click(); await wait(120); res[tab] = panels.filter(vis).join(','); }
      const top = () => Math.round(parseFloat(getComputedStyle(document.getElementById('breadcrumbs-bar')).top));
      const openTop = top(); document.getElementById('tab-help').click(); await wait(150);
      res.collapsed = !vis('ribbon'); res.breadcrumbFollows = top() < openTop;
      document.getElementById('tab-tree').click(); await wait(150);
      res.reopened = vis('ribbon-tree'); res.belowRibbon = top() >= Math.round(document.getElementById('top-bar-container').getBoundingClientRect().bottom);
      return res;`);
    await step('onglet Arbre : actions sur la sélection', `${H} const b = document.getElementById('ribbon-sheet-new');
      cy.nodes().unselect(); await wait(80); const disabledWithoutSelection = b.disabled;
      cy.$id('D').select(); await wait(80); const enabledWithOne = !b.disabled; b.click(); await wait(400);
      const sheetCreated = cy.$id('D').data('hasNewSheet') === true; key('z', { ctrl: true }); await wait(400);
      return { disabledWithoutSelection, enabledWithOne, sheetCreated, undone: cy.$id('D').data('hasNewSheet') !== true };`);
    await step('onglet Style : suit la sélection', `${H} cy.nodes().unselect(); cy.$id('A').data('fontSize', 21); cy.$id('A').select();
      document.getElementById('tab-style').click(); await wait(250);
      const shown = getComputedStyle(document.getElementById('style-ribbon')).display !== 'none'; const size = document.getElementById('style-size').value;
      document.getElementById('tab-tree').click(); await wait(100); cy.$id('A').data('fontSize', 16);
      return { shown, size };`);
    await step('mode peigne', `${H} document.getElementById('btn-layout-comb').click(); await wait(400); return counts();`);
    await step('mode chrono', `${H} document.getElementById('btn-layout-chrono').click(); await wait(600);
      return { ...counts(), ruler: !!document.getElementById('chrono-ruler-labels') };`);
    await step('bornes période/cladogramme', `${H} const b = document.getElementById('btn-chrono-bounds'); const before = b.innerText; b.click(); await wait(400); const after = b.innerText; b.click(); await wait(300); return { before, after };`);
    await step('mode normal', `${H} document.getElementById('btn-layout-normal').click(); await wait(400); return counts();`);
    await step('copier B → coller sous D', `${H} cy.nodes().unselect(); cy.$id('B').select(); key('c', { ctrl: true }); await wait(100);
      cy.nodes().unselect(); cy.$id('D').select(); key('v', { ctrl: true }); await wait(600);
      const pasted = cy.$id('D').outgoers('node').filter(n => n.data('name') === 'Tyrannosaurus rex');
      return { ...counts(), pasted: pasted.length, pastedTaxonId: pasted.length ? (pasted[0].data('taxonId') ?? null) : 'absent', imgRef: pasted.length ? String(pasted[0].data('imgUrl')).slice(0, 6) : '' };`);
    await step('annuler (Ctrl+Z)', `${H} key('z', { ctrl: true }); await wait(500); return counts();`);
    await step('couper E → coller sous A', `${H} cy.nodes().unselect(); cy.$id('E').select(); key('x', { ctrl: true }); await wait(300);
      const afterCut = counts(); cy.nodes().unselect(); cy.$id('A').select(); key('v', { ctrl: true }); await wait(600);
      const moved = cy.$id('A').outgoers('node').filter(n => n.data('name') === 'Homo sapiens');
      return { afterCut, ...counts(), moved: moved.length, keptTaxonId: moved.length ? moved[0].data('taxonId') : null };`);
    await send('Page.bringToFront');
    // Événements d'entrée RÉELS (Input.dispatch*) : mêmes chemins qu'une vraie souris.
    const centre = await evaluate(`const r = document.getElementById('app').getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);
    const wheel = (deltaY, deltaX = 0) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: centre.x, y: centre.y, deltaX, deltaY });
    currentStep = 'molette souris → zoom';
    { const z0 = await evaluate(`${H} return cy.zoom();`); await wheel(-100); await sleep(250); await wheel(-100); await sleep(250);
      results[currentStep] = { zoomed: (await evaluate(`${H} return cy.zoom();`)) !== z0 }; console.log('       ', currentStep, '→', JSON.stringify(results[currentStep])); }
    await sleep(400);
    currentStep = 'pavé tactile → défilement';
    { // Attendre que le zoom de l'étape précédente soit entièrement appliqué (événements traités en différé).
      let prevZ = null;
      for (let i = 0; i < 20; i++) { const z = await evaluate(`${H} return cy.zoom();`); if (z === prevZ) break; prevZ = z; await sleep(150); }
      // Enregistre l'origine de tout zoom pendant le geste (diagnostic si le test échoue).
      const s0 =await evaluate(`${H} window.__zoomStacks = []; window.__zoomSpy = () => window.__zoomStacks.push((new Error().stack || '').split('\\n').slice(2, 14).map(x => x.trim()).filter(x => x.indexOf('node_modules') < 0).slice(0, 4).join(' < ')); cy.on('zoom', window.__zoomSpy); return { z: cy.zoom(), y: cy.pan().y };`);
      for (const d of [2.5, 8.25, 30.5, 90.75, 140.5]) { await wheel(d); await sleep(16); } await sleep(250);
      const s1 = await evaluate(`${H} cy.off('zoom', window.__zoomSpy); return { z: cy.zoom(), y: cy.pan().y, stacks: window.__zoomStacks };`);
      results[currentStep] = { zoomUnchanged: s1.z === s0.z, panned: s1.y !== s0.y };
      if (s1.stacks.length) results[currentStep + ' (origine du zoom)'] = s1.stacks;
      console.log('       ', currentStep, '→', JSON.stringify(results[currentStep]), s1.stacks.length ? JSON.stringify(s1.stacks) : ''); }
    await step('recherche', `${H} const s = document.getElementById('search-input'); s.value = 'Tyranno'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(400);
      const res = document.getElementById('search-dropdown'); return { results: res ? res.children.length : -1 };`);
    // Clic droit réel sur le nœud A, puis « Éditer la fiche ».
    currentStep = 'menu contextuel + fiche';
    { const p = await evaluate(`${H} cy.fit(); await wait(200); const r = document.getElementById('app').getBoundingClientRect(); const rp = cy.$id('A').renderedPosition(); return { x: Math.round(r.left + rp.x), y: Math.round(r.top + rp.y) };`);
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: 'right', clickCount: 1 });
      await sleep(300);
      await step(currentStep, `${H} const menu = document.getElementById('context-menu').style.display; document.getElementById('cmenu-edit').click(); await wait(500);
        const panel = document.getElementById('side-panel'); return { menu, panelOpen: panel.style.display, title: (document.getElementById('panel-title') || {}).innerText };`); }
    await step('fermer la fiche (Échap)', `${H} key('Escape'); await wait(400); return { panel: document.getElementById('side-panel').style.display };`);
    // --- Phase 3 : surlignage et pinceau
    await step('surlignage (Ctrl+H)', `${H} cy.nodes().unselect(); cy.$id('B').select(); cy.$id('C').select(); key('h', { ctrl: true }); await wait(150);
      const on = !!cy.$id('B').data('highlight') && !!cy.$id('C').data('highlight');
      key('h', { ctrl: true }); await wait(150); const off = !cy.$id('B').data('highlight') && !cy.$id('C').data('highlight');
      cy.nodes().unselect(); cy.$id('B').select(); key('h', { ctrl: true }); await wait(150); cy.nodes().unselect(); await wait(150);
      return { on, off, drawn: parseFloat(cy.$id('B').style('text-background-opacity')) > 0, color: cy.$id('B').data('highlight') };`);
    await step('pinceau : peindre la sélection', `${H} document.getElementById('style-brush-color').value = '#1e88e5';
      const paintSel = async (id, clear) => { cy.nodes().unselect(); cy.$id(id).select(); document.getElementById(clear ? 'style-brush-clear' : 'style-brush-selection').click(); await wait(200); };
      const edgeOf = id => cy.$id(id).incomers('edge').first();
      const look = id => { const e = edgeOf(id); return { fill: e.style('line-fill'), color: e.style('line-color'), width: e.style('width'), stops: e.style('line-gradient-stop-positions') }; };
      await paintSel('A');
      // A seul (D, son frère, non peint) : dernier segment seulement = dégradé dont l'arrêt est au dernier coude.
      const e = edgeOf('A'), s = e.sourceEndpoint(), t = e.targetEndpoint(), c = e.segmentPoints().slice(-1)[0];
      const expected = 100 * ((c.x - s.x) * (t.x - s.x) + (c.y - s.y) * (t.y - s.y)) / ((t.x - s.x) ** 2 + (t.y - s.y) ** 2);
      const alone = look('A');
      await paintSel('D'); const both = { A: look('A'), D: look('D') };
      await paintSel('D', true); const back = look('A');
      return { branch: cy.$id('A').data('branch'), alone: { fill: alone.fill, cornerOk: Math.abs(parseFloat(String(alone.stops).split(' ')[1]) - expected) < 0.01, cornerY: c.y === t.y },
        both: { fill: both.A.fill + '/' + both.D.fill, color: both.A.color, width: both.A.width }, backToPartial: back.fill };`);
    currentStep = 'pinceau : mode clic';
    { const p = await evaluate(`${H} const b = document.getElementById('style-brush-toggle'); b.click(); cy.fit(); await wait(250);
        cy.$id('A').removeData('branch'); cy.$id('B').removeData('branch'); cy.$id('C').removeData('branch');
        const r = document.getElementById('app').getBoundingClientRect(); const at = id => { const rp = cy.$id(id).renderedPosition(); return { x: Math.round(r.left + rp.x), y: Math.round(r.top + rp.y) }; };
        return { A: at('A'), D: at('D'), active: b.classList.contains('active') };`);
      for (const id of ['A', 'D']) { for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p[id].x, y: p[id].y, button: 'left', clickCount: 1 }); await sleep(650); }
      await step(currentStep, `${H} const b = document.getElementById('style-brush-toggle'); const painted = !!(cy.$id('D').data('branch') || {}).color;
        // Clic sur le NOM de A : tout le clade (A, B, C) ; A et D peints → chemin entier sous la racine.
        const clade = ['A', 'B', 'C'].every(id => !!(cy.$id(id).data('branch') || {}).color); await wait(100);
        key('Escape'); await wait(80); return { active: ${p.active}, painted, clade, aFull: cy.$id('A').incomers('edge').first().style('line-fill'), exited: !b.classList.contains('active') };`); }
    // --- Phase 3 : glisser les divergences (glisser réel à la souris)
    const dragNode = async (id, dxPx) => {
        const p = await evaluate(`${H} let last = ''; for (let i = 0; i < 30; i++) { await wait(100); const k = JSON.stringify([cy.zoom(), cy.pan()]); if (k === last && !cy.animated()) break; last = k; } cy.stop(true, true); cy.fit(); await wait(150); const r = document.getElementById('app').getBoundingClientRect(); const rp = cy.$id('${id}').renderedPosition(); const x = Math.round(r.left + rp.x), y = Math.round(r.top + rp.y); return { x, y };`);
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
        for (let i = 1; i <= 8; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x + Math.round(dxPx * i / 8), y: p.y + (i % 2), button: 'left', buttons: 1 }); await sleep(30); }
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x + dxPx, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
        await sleep(500);
    };
    currentStep = 'divergences : cladogramme';
    { const before = await evaluate(`${H} document.getElementById('btn-layout-normal').click(); await wait(400); document.getElementById('tree-divergence-toggle').click(); await wait(80);
        return { x: cy.$id('A').position('x'), childX: cy.$id('C').position('x'), parent: cy.$id('A').incomers('node').first().id() };`);
      await dragNode('A', 80);
      await step(currentStep, `${H} const off = cy.$id('A').data('branchOffset');
        return { offsetSet: off > 0, nodeMoved: cy.$id('A').position('x') > ${before.x}, childFollowed: cy.$id('C').position('x') > ${before.childX}, sameParent: cy.$id('A').incomers('node').first().id() === '${before.parent}' };`);
      await step('divergences : annuler', `${H} key('z', { ctrl: true }); await wait(400); return { offsetRemoved: cy.$id('A').data('branchOffset') === undefined };`); }
    currentStep = 'divergences : chronogramme';
    { const before = await evaluate(`${H} document.getElementById('btn-layout-chrono').click(); await wait(700); return { period: cy.$id('A').data('period') };`);
      await dragNode('A', 60);
      await step(currentStep, `${H} const after = String(cy.$id('A').data('period'));
        const start = parseFloat(after); const kidAge = Math.max(...cy.$id('A').outgoers('node').map(n => parseFloat(String(n.data('period')))));
        document.getElementById('tree-divergence-toggle').click(); await wait(80);
        const off = !document.getElementById('tree-divergence-toggle').classList.contains('active');
        key('z', { ctrl: true }); await wait(400); document.getElementById('btn-layout-normal').click(); await wait(400);
        return { before: '${before.period}', after, younger: start < parseFloat('${before.period}'), olderThanChildren: start > kidAge, rangeKept: after.includes('-'), modeOff: off, undone: cy.$id('A').data('period') === '${before.period}' };`); }
    // --- Phase 3 : fiche — images multiples et son
    await step('fiche : images multiples', `${H} key('Escape'); await wait(150); cy.nodes().unselect(); cy.$id('A').select(); key('f', { ctrl: true }); await wait(500);
      const A = cy.$id('A');
      const mk = col => { const c = document.createElement('canvas'); c.width = 20; c.height = 10; const g = c.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 20, 10); return c.toDataURL('image/png'); };
      const add = async (col, name) => { const f = new File([await (await fetch(mk(col))).blob()], name, { type: 'image/png' }); const dt = new DataTransfer(); dt.items.add(f);
        const input = document.getElementById('inp-sheetImage-file'); input.files = dt.files; input.dispatchEvent(new Event('change')); await wait(400); };
      await add('red', 'rouge.png'); await add('blue', 'bleu.png');
      const afterAdd = { main: !!A.data('sheetImage'), extras: (A.data('extraImages') || []).filter(i => i.role !== 'tree').length, thumbs: document.getElementById('fiche-gallery').children.length,
        mainBtn: document.getElementById('btn-image-main').style.display !== 'none' };
      const cr = document.getElementById('inp-imgCredits'); cr.value = '© bleu'; cr.dispatchEvent(new Event('change')); await wait(100);
      const credits = { extra: (A.data('extraImages') || [])[0]?.credits, mainUntouched: A.data('imgCredits') === '' };
      document.getElementById('btn-image-main').click(); await wait(200);
      const promoted = A.data('imgCredits') === '© bleu' && (A.data('extraImages') || []).length === 1;
      document.getElementById('btn-clear-sheetImage').click(); await wait(200);
      const afterDelete = { main: !!A.data('sheetImage'), extras: (A.data('extraImages') || []).length, mainCredits: A.data('imgCredits') };
      await add('green', 'vert.png');
      return { afterAdd, credits, promoted, afterDelete, final: 1 + (A.data('extraImages') || []).length };`);
    await step('fiche : son', `${H} const A = cy.$id('A');
      A.data('audio', { path: ${JSON.stringify(wavPath)}, name: 'cri.wav' }); key('Escape'); await wait(200); cy.nodes().unselect(); A.select(); key('f', { ctrl: true }); await wait(900);
      const p = document.getElementById('audio-player'); let playErr = null; try { await p.play(); } catch (err) { playErr = String(err); } await wait(400);
      // Lecture RÉELLE (une URL blob: s'affichait mais était refusée par Chromium) : ni erreur, ni rejet, durée connue.
      const ok = { player: p.style.display !== 'none', played: !playErr && !p.error && p.duration > 0 && (p.ended || p.currentTime > 0), playErr, mediaErr: p.error ? p.error.message : null, info: document.getElementById('audio-info').textContent };
      cy.$id('B').data('audio', { path: 'introuvable/absent.mp3', name: 'absent.mp3' }); key('Escape'); await wait(200); cy.nodes().unselect(); cy.$id('B').select(); key('f', { ctrl: true });
      let missing = ''; for (let i = 0; i < 30; i++) { await wait(100); missing = document.getElementById('audio-info').textContent; if (/introuvable|not found/i.test(missing)) break; } cy.$id('B').removeData('audio'); key('Escape'); await wait(200);
      return { ...ok, missingReported: /introuvable|not found/i.test(missing), missing };`);
    await step('enregistrer (Ctrl+S)', `${H} key('s', { ctrl: true }); await wait(1500); return counts();`);
    const saved = JSON.parse(fs.readFileSync(v1Path, 'utf8'));
    const sn = (saved.trees && saved.trees[0] && saved.trees[0].nodes) || {};
    results['annotations enregistrées'] = { highlightB: (sn.B || {}).highlight || null, branchA: (sn.A || {}).branch || null };
    { const tA = (saved.taxa || {}).A || {}; results['fiche enregistrée'] = { images: (tA.images || []).map(i => i.role), audio: tA.audio ? tA.audio.name : null }; console.log('ok     fiche enregistrée →', JSON.stringify(results['fiche enregistrée'])); }
    results['fichier enregistré'] = { formatVersion: saved.formatVersion, taxa: Object.keys(saved.taxa || {}).length, trees: (saved.trees || []).length, assets: Object.keys(saved.assets || {}).length, hasGraph: !!saved.graph };
    console.log('ok     fichier enregistré →', JSON.stringify(results['fichier enregistré']));
    await step('rouvrir le fichier v2', `${H} await window._loadOSFile(${JSON.stringify(v1Path)}); await wait(500); return { ...counts(), synonym: cy.$id('C').data('synonymTargetId'), branchEdge: cy.$id('A').incomers('edge').first().data('branchColor') || null, highlight: cy.$id('B').data('highlight') || null };`);
    await step('supprimer un taxon (Suppr)', `${H} cy.nodes().unselect(); cy.$id('C').select(); key('Delete'); await wait(500); return { ...counts(), cDeleted: cy.$id('C').length === 0 };`);
    await step('annuler la suppression', `${H} key('z', { ctrl: true }); await wait(500); return { ...counts(), cBack: cy.$id('C').length === 1 };`);
    await step('racine ≠ « root » : ouvrir', `${H} await window._loadOSFile(${JSON.stringify(xPath)}); await wait(500); return counts();`);
    await step('racine ≠ « root » : Suppr sur la racine', `${H} cy.nodes().unselect(); cy.$id('X0').select(); key('Delete'); await wait(500); return { ...counts(), rootKept: cy.$id('X0').length === 1 };`);
    await step('racine ≠ « root » : couper la racine', `${H} cy.nodes().unselect(); cy.$id('X0').select(); key('x', { ctrl: true }); await wait(500); return { ...counts(), rootKept: cy.$id('X0').length === 1 };`);
    await step('racine ≠ « root » : recherche', `${H} const s = document.getElementById('search-input'); s.value = 'Passer'; s.dispatchEvent(new Event('input', { bubbles: true })); await wait(400);
      const item = document.getElementById('search-dropdown').firstElementChild; if (item) item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); if (item) item.click(); await wait(600);
      return { ...counts(), visible: cy.nodes('.taxon:visible').length };`);
    // Divergences d'âges très proches : la géométrie doit séparer les troncs sans bouton « lisible ».
    await step('chronogramme : troncs proches', `${H} await window._loadOSFile(${JSON.stringify(lanesPath)}); await wait(500);
      document.getElementById('btn-layout-chrono').click(); await wait(600);
      const shown = cy.nodes('.taxon:visible').length; document.getElementById('btn-layout-normal').click(); await wait(400);
      return { shown, lanesButton: !!document.getElementById('btn-chrono-lanes'), autoGenusSetting: !!document.getElementById('set-auto-genus-species') };`);
    // --- Phase 3 : classifications alternatives par feuille
    const V = `${H} const fiche = id => { key('Escape'); cy.nodes().unselect(); cy.$id(id).select(); key('f', { ctrl: true }); };
      const box = () => document.getElementById('sheet-classification'); const sel = () => document.getElementById('sheet-variant-select');
      const opts = () => [...sel().options].map(o => o.text + (o.selected ? '*' : '')); const parentOf = id => cy.$id(id).incomers('node').not('.box').first().id() || null;`;
    await step('classifications : menu des racines de feuille', `${V} await window._loadOSFile(${JSON.stringify(variantsPath)}); await wait(500);
      fiche('R'); await wait(500); const onRoot = box().style.display !== 'none'; const options = opts();
      fiche('A'); await wait(400); const onA = box().style.display !== 'none';
      fiche('B'); await wait(400); const onB = box().style.display !== 'none';
      return { onRoot, onA, onB, options };`);
    await step('classifications : ajouter puis modifier l\'alternative', `${V} fiche('R'); await wait(400); document.getElementById('sheet-variant-add').click(); await wait(600);
      const options = opts();
      key('Escape'); cy.remove(cy.$id('C').incomers('edge')); cy.add({ group: 'edges', data: { source: 'A', target: 'C' } }); await wait(100);
      cy.nodes().unselect(); cy.$id('B').select(); key('Delete'); await wait(600);
      return { options, cUnderA: parentOf('C') === 'A', bKeptAside: cy.$id('B').length === 0 && cy.$id('B1').length === 0 };`);
    await step('classifications : basculer', `${V} fiche('R'); await wait(400); sel().value = 'v1'; sel().dispatchEvent(new Event('change')); await wait(700);
      const back1 = { c: parentOf('C'), b: parentOf('B'), b1: parentOf('B1'), options: opts() };
      fiche('R'); await wait(400); sel().selectedIndex = 1; sel().dispatchEvent(new Event('change')); await wait(700);
      return { back1, alt: { c: parentOf('C'), b: cy.$id('B').length } };`);
    await step('classifications : enregistrer et rouvrir', `${V} key('s', { ctrl: true }); await wait(1200);
      await window._loadOSFile(${JSON.stringify(variantsPath)}); await wait(600); fiche('R'); await wait(500);
      return { options: opts(), c: parentOf('C'), b: cy.$id('B').length };`);
    { const saved = JSON.parse(fs.readFileSync(variantsPath, 'utf8')); const tr = saved.trees[0];
      results['classifications : fichier'] = { variants: tr.sheetVariants ? Object.values(tr.sheetVariants)[0].variants.map(v => v.name) : null, detached: Object.keys(tr.detached || {}).sort(), taxa: Object.keys(saved.taxa).length };
      console.log('ok     classifications : fichier →', JSON.stringify(results['classifications : fichier'])); }
    await step('classifications : supprimer l\'alternative', `${V} fiche('R'); await wait(400); document.getElementById('sheet-variant-delete').click(); await wait(700); fiche('R'); await wait(400);
      const r = { options: opts(), c: parentOf('C'), b1: parentOf('B1') }; key('Escape'); return r;`);
    // --- Phase 3 : romérogramme
    await step('romérogramme', `${H} await window._loadOSFile(${JSON.stringify(romerPath)}); await wait(500);
      document.getElementById('btn-layout-chrono').click(); await wait(700);
      const groupShown = getComputedStyle(document.getElementById('romer-tools')).display !== 'none';
      const counter = () => document.getElementById('counter-bar') ? document.getElementById('counter-bar').innerText : '';
      const countBefore = counter();
      document.getElementById('romer-toggle').click(); await wait(700);
      const sp = cy.nodes('.romer-spindle');
      const on = { spindles: sp.length, maxes: sp.map(n => n.data('romerMax')).sort(), leavesHidden: cy.$id('x1').style('display') === 'none', counterUnchanged: counter() === countBefore };
      const st = document.getElementById('romer-step'); const stepRuns = [];
      for (const v of ['1', '5', '10', '25', '0']) { st.value = v; st.dispatchEvent(new Event('change')); await wait(300); stepRuns.push(cy.nodes('.romer-spindle').length); }
      on.stepRuns = stepRuns; on.batchClosed = cy._private.batchCount === 0; on.zShown = cy.$id('z1').style('display') !== 'none';
      const d = document.getElementById('romer-depth'); d.value = '2'; d.dispatchEvent(new Event('change')); await wait(500);
      const depth2 = cy.nodes('.romer-spindle').length; d.value = '1'; d.dispatchEvent(new Event('change')); await wait(500);
      key('s', { ctrl: true }); await wait(1000);
      return { groupShown, on, depth2 };`);
    { const saved = JSON.parse(fs.readFileSync(romerPath, 'utf8'));
      results['romérogramme : fichier'] = { nodes: Object.keys(saved.trees[0].nodes).length, spindleSaved: JSON.stringify(saved).includes('romer') };
      console.log('ok     romérogramme : fichier →', JSON.stringify(results['romérogramme : fichier'])); }
    await step('romérogramme : clades choisis', `${H} cy.nodes().unselect(); cy.$id('x2').select(); cy.$id('Y').select(); document.getElementById('romer-pick').click(); await wait(700);
      const r = { mode: document.getElementById('romer-depth').value, spindles: cy.nodes('.romer-spindle').map(n => n.data('romerOf')).sort(), flags: cy.nodes('[?romerClade]').map(n => n.id()).sort() };
      cy.nodes().unselect(); cy.$id('x2').select(); cy.$id('Y').select(); document.getElementById('romer-pick').click(); await wait(500);
      const d = document.getElementById('romer-depth'); d.value = '1'; d.dispatchEvent(new Event('change')); await wait(500);
      return { ...r, unflagged: cy.nodes('[?romerClade]').length === 0 };`);
    // --- Phase 4 : figure d'aide « Frise géologique » (charte détaillée, clous d'or), depuis le chronogramme
    await step('frise géologique : charte et clous d\'or', `${H} document.getElementById('btn-geo-chart-chrono').click(); await wait(500); const o = document.getElementById('geo-chart-overlay');
      const r = { rows: o.querySelectorAll('tr[data-row]').length, spikes: o.querySelectorAll('tbody .gc-spike').length, clocks: o.querySelectorAll('tbody .gc-clock').length };
      const s = o.querySelector('.gc-search'); s.value = 'induen'; s.dispatchEvent(new Event('input')); await wait(300);
      r.detail = o.querySelector('.gc-detail').innerText.split('\\n')[0]; r.canShow = !o.querySelector('.gc-show').disabled;
      key('Escape'); await wait(200); r.closed = getComputedStyle(o).display; return r;`);
    await step('romérogramme : retour au chronogramme', `${H} document.getElementById('romer-toggle').click(); await wait(600);
      const r = { spindles: cy.nodes('.romer-spindle').length, leavesShown: cy.$id('x1').style('display') !== 'none' };
      document.getElementById('btn-layout-normal').click(); await wait(400); return r;`);
    // Phase 5 : le chronogramme ne repose le style d'un élément que s'il a changé (signature _chronoStyle).
    // Repli puis dépli, puis changement de date : chaque fois le style réel doit suivre. Frise posée en bas.
    await step('chronogramme : styles reposés seulement si changés', `${H} document.getElementById('btn-layout-chrono').click(); await wait(600);
      const st = id => ({ w: cy.$id(id).style('width'), d: cy.$id(id).style('display'), h: cy.$id(id).style('text-halign') });
      const first = st('x1');
      cy.nodes().unselect(); cy.$id('X').select(); key(' ', { ctrl: true }); await wait(400); const folded = st('x1').d;
      cy.nodes().unselect(); cy.$id('X').select(); key(' ', { ctrl: true }); await wait(400); const unfolded = st('x1');
      cy.$id('x1').data('period', '240-120'); cy.nodes().unselect(); cy.$id('x1').select(); key('b', { ctrl: true }); await wait(400); key('b', { ctrl: true }); await wait(400);
      const longer = parseFloat(st('x1').w) > parseFloat(first.w);
      const rb = document.getElementById('chrono-ruler').getBoundingClientRect(), hs = document.getElementById('custom-hscroll');
      const rulerOnScrollbar = hs ? Math.round(hs.getBoundingClientRect().top - rb.bottom) : Math.round(innerHeight - rb.bottom);
      key('z', { ctrl: true }); await wait(300); key('z', { ctrl: true }); await wait(300);
      document.getElementById('btn-layout-normal').click(); await wait(400);
      return { first, folded, unfolded: JSON.stringify(unfolded) === JSON.stringify(first), longer, rulerOnScrollbar, resetInNormal: cy.$id('x1').scratch('_chronoStyle') === undefined && cy.$id('x1').style('width') !== first.w };`);
    await step('ruban : raccourcis & é " ( et Fichier', `${H} const tab = () => { const a = document.querySelector('.ribbon-tab.active'); return a ? a.dataset.tab : null; };
      const r = {}; key('é'); r.e = tab(); key('"'); r.q = tab(); key('('); r.p = tab(); key('('); r.closed = tab(); key("'"); r.a = tab();
      key('&'); r.file = document.activeElement && document.activeElement.id; key('é'); r.fileClosedByTab = document.activeElement && document.activeElement.id !== 'lbl-topbar-file'; r.after = tab();
      key("'"); const input = document.querySelector('#search-input, input[type=text]'); if (input) { input.focus(); key('é'); r.ignoredWhileTyping = tab() === 'tree'; input.blur(); }
      return r;`);
    // Ergonomie de fin de 1.4 : ↑/↓ entre taxons terminaux en dendrogramme ; ← / → (souris sur la fiche) et
    // boutons de la fiche = taxon terminal précédent / suivant ; ailleurs, ← reste « parent ».
    await step('dendrogramme et fiche : taxon terminal voisin', `${H} await window._loadOSFile(${JSON.stringify(romerPath)}); await wait(500);
      document.getElementById('btn-layout-comb').click(); await wait(400);
      const sel = () => cy.$('node:selected').map(n => n.id()).join(',');
      cy.nodes().unselect(); cy.$id('x3').select(); key('ArrowDown'); const down = sel(); key('ArrowUp'); const up = sel();
      cy.nodes().unselect(); cy.$id('x2').select(); key('f', { ctrl: true }); await wait(500);
      const panel = document.getElementById('side-panel'); panel.dispatchEvent(new MouseEvent('mouseenter'));
      key('ArrowRight'); await wait(200); const right = { sel: sel(), title: document.getElementById('panel-title').innerText };
      document.getElementById('fiche-prev').click(); await wait(200); const prevBtn = sel();
      cy.nodes().unselect(); cy.$id('Y').select(); key('f', { ctrl: true }); await wait(300); key('ArrowRight'); await wait(200); const fromClade = sel();
      cy.nodes().unselect(); cy.$id('x1').select(); key('f', { ctrl: true }); await wait(300); const firstPrevDisabled = document.getElementById('fiche-prev').disabled;
      panel.dispatchEvent(new MouseEvent('mouseleave')); key('ArrowLeft'); const canvasLeft = sel();
      key('Escape'); await wait(300); document.getElementById('btn-layout-normal').click(); await wait(400);
      return { down, up, right, prevBtn, fromClade, firstPrevDisabled, canvasLeft };`);
    // Touche G : la divergence suit la souris, bornée à droite de la barre verticale de son parent ; Entrée valide, Échap annule.
    await step('G : déplacer une divergence', `${H} const move = x => window.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: 300 }));
      const X = cy.$id('X'), R = cy.$id('R'); const x0 = X.position('x');
      const gap = () => Math.round((X.position('x') - X.data('renderWidth') / 2) - (R.position('x') + R.data('renderWidth') / 2));
      move(600); cy.nodes().unselect(); X.select(); key('g'); move(600 + 80); const followed = Math.round(X.position('x') - x0);
      key('Escape'); await wait(300); const cancelled = { back: X.position('x') === x0, offset: X.data('branchOffset') };
      key('g'); move(-2000); const clampedGap = gap(); key('Enter'); await wait(300);
      const r = { followed, cancelled, clampedGap, gapAfterLayout: gap(), offset: X.data('branchOffset') };
      cy.nodes().unselect(); cy.$id('x1').select(); key('g'); await wait(100); r.leafRefused = [...document.querySelectorAll('.cl-toast')].some(el => /^G/.test(el.innerText)) && X.data('branchOffset') !== undefined;
      key('z', { ctrl: true }); await wait(300); r.undone = X.data('branchOffset') === undefined; return r;`);
    // Images en chronogramme (fin de 1.4) : terminal = après son nom, sur sa ligne agrandie ; divergence = bande réservée
    // au-dessus de son clade. Aucune image ne doit toucher un nœud (barre, nom), une arête ou une autre image, et les
    // abscisses (âges) sont celles du même arbre sans images.
    const svg = (c, label) => 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="90"><rect width="120" height="90" fill="${c}" stroke="#000" stroke-width="3"/><text x="60" y="52" font-size="16" text-anchor="middle" font-family="sans-serif">${label}</text></svg>`).toString('base64');
    const im = (c, l, size, ratio = 4 / 3) => ({ imgUrl: svg(c, l), imgSize: size, imgRatio: ratio });
    const els = [
      node('R', 'Vertebrata', { period: '520', ...im('#e57373', 'racine', 120) }),
      node('A', 'Gnathostomata', { period: '460', ...im('#64b5f6', 'div. A', 110) }),
      node('a1', 'Placodermi', { period: '430-359', ...im('#81c784', 'a1', 100) }),
      node('a2', 'Osteichthyes', { period: '425' }),
      node('a21', 'Coelacanthiformes', { period: '410-0', ...im('#ffb74d', 'a21', 90) }),
      node('a22', 'Tetrapoda', { period: '385', ...im('#ba68c8', 'div. a22', 200, 1) }),
      node('a221', 'Ichthyostega', { period: '365', ...im('#4db6ac', 'tick', 80) }),
      node('a222', 'Amniota', { period: '320-0' }),
      node('B', 'Cyclostomi', { period: '480' }),
      node('b1', 'Myxini', { period: '300-0' }),
      node('b2', 'Petromyzontiformes', { period: '360-0', ...im('#f06292', 'b2', 100) }),
      edge('R', 'A'), edge('R', 'B'), edge('A', 'a1'), edge('A', 'a2'), edge('a2', 'a21'), edge('a2', 'a22'), edge('a22', 'a221'), edge('a22', 'a222'), edge('B', 'b1'), edge('B', 'b2'),
    ];
    const imgPath = path.join(tmp, 'chrono-images.phylo'); fs.writeFileSync(imgPath, JSON.stringify({ version: '1.0', currentRootId: 'R', graph: { elements: els } }));
    const CHECK = `
      const imgs = window.__placements ? window.__placements() : null;
      const rects = [...document.querySelectorAll('#html-image-layer img')].filter(i => i.style.display !== 'none').map(i => ({ id: i.dataset.id || i.id, r: i.getBoundingClientRect() }));
      const cr = document.getElementById('app').getBoundingClientRect(); const z = cy.zoom(), pan = cy.pan();
      const toModel = r => ({ x1: (r.left - cr.left - pan.x) / z, y1: (r.top - cr.top - pan.y) / z, x2: (r.right - cr.left - pan.x) / z, y2: (r.bottom - cr.top - pan.y) / z });
      const hit = (a, b) => a.x1 < b.x2 - 1 && a.x2 > b.x1 + 1 && a.y1 < b.y2 - 1 && a.y2 > b.y1 + 1;
      const segHit = (p, q, r) => { const s = { x1: Math.min(p.x, q.x), x2: Math.max(p.x, q.x), y1: Math.min(p.y, q.y), y2: Math.max(p.y, q.y) }; if (s.x2 - s.x1 < 1) { s.x1 -= 0.5; s.x2 += 0.5; } if (s.y2 - s.y1 < 1) { s.y1 -= 0.5; s.y2 += 0.5; } return hit(s, r); };
      const problems = [];
      const ms = rects.map(x => ({ id: x.id, m: toModel(x.r) }));
      ms.forEach(({ id, m }) => {
        cy.nodes(':visible').not('.box').forEach(n => { const bb = n.boundingBox({ includeLabels: true }); if (hit(bb, m)) problems.push(id + ' ~ ' + n.id()); });
        cy.edges(':visible').forEach(e => { const pts = [e.sourceEndpoint(), ...(e.segmentPoints() || []), e.targetEndpoint()]; for (let i = 0; i + 1 < pts.length; i++) if (segHit(pts[i], pts[i + 1], m)) { problems.push(id + ' ~ arête ' + e.id()); break; } });
        ms.forEach(o => { if (o.id !== id && hit(o.m, m)) problems.push(id + ' ~ image ' + o.id); });
      });
      return { images: rects.length, problems: [...new Set(problems)] };`;
    await step('chrono images : placement', `${H} await window._loadOSFile(${JSON.stringify(imgPath)}); await wait(600);
      document.getElementById('btn-layout-chrono').click(); await wait(800); document.getElementById('btn-recenter').click(); await wait(700);
      const xs = {}; cy.nodes('.taxon').forEach(n => xs[n.id()] = Math.round(n.position('x') * 100) / 100); window.__xs = xs; ${CHECK}`);
    await step('chrono images : abscisses inchangées sans images', `${H} const saved = {}; cy.nodes('.taxon').forEach(n => { saved[n.id()] = n.data('imgUrl'); n.data('imgUrl', ''); });
      document.getElementById('btn-layout-normal').click(); await wait(300); document.getElementById('btn-layout-chrono').click(); await wait(600);
      const diff = cy.nodes('.taxon').filter(n => Math.abs(n.position('x') - window.__xs[n.id()]) > 0.01).map(n => n.id());
      cy.nodes('.taxon').forEach(n => n.data('imgUrl', saved[n.id()])); document.getElementById('btn-layout-normal').click(); await wait(300); document.getElementById('btn-layout-chrono').click(); await wait(600);
      return { xChanged: diff };`);
    await step('chrono images : replier a22, romérogramme', `${H} cy.nodes().unselect(); cy.$id('a22').select(); key(' ', { ctrl: true }); await wait(500); document.getElementById('btn-recenter').click(); await wait(700);
      const r1 = (() => { ${CHECK} })(); key(' ', { ctrl: true }); await wait(500);
      document.getElementById('romer-toggle').click(); await wait(700); document.getElementById('btn-recenter').click(); await wait(700);
      const r2 = { spindles: cy.nodes('.romer-spindle').length, imgs: [...document.querySelectorAll('#html-image-layer img')].filter(i => i.style.display !== 'none').length };
      return { folded: r1, romer: r2 };`);
    await evaluate(`document.getElementById('romer-toggle').click(); document.getElementById('btn-layout-normal').click(); return 1;`);
    // Romérogramme serré : un clade de 30 taxons (au plus 2 simultanés) ne réserve que la hauteur de son fuseau,
    // pas une ligne par taxon caché ; puis options de disposition (épaisseur, écart, nom, nombre).
    const manyEls = [node('R', 'Vertebrata', { period: '500' }), node('P', 'Grand clade', { period: '420' }), node('Q', 'Petit clade'), node('T', 'Isolé', { period: '350-200' }),
      edge('R', 'P'), edge('R', 'Q'), edge('R', 'T')];
    for (let k = 0; k < 30; k++) { manyEls.push(node('p' + k, 'Taxon p' + k, { period: `${410 - k * 12}-${396 - k * 12}` })); manyEls.push(edge('P', 'p' + k)); }
    for (let k = 0; k < 3; k++) { manyEls.push(node('q' + k, 'Taxon q' + k, { period: `${290 - k * 5}-${200 - k * 5}` })); manyEls.push(edge('Q', 'q' + k)); }
    const manyPath = path.join(tmp, 'romerogramme-serre.phylo'); fs.writeFileSync(manyPath, JSON.stringify({ version: '1.0', currentRootId: 'R', graph: { elements: manyEls } }));
    const SP = `const sp = id => cy.$id('romer-' + id); const box = id => { const n = sp(id); return { top: n.position('y') - n.data('romerH') / 2, bottom: n.position('y') + n.data('romerH') / 2 }; };`;
    await step('romérogramme : fuseaux serrés', `${H} ${SP} await window._loadOSFile(${JSON.stringify(manyPath)}); await wait(600);
      document.getElementById('btn-layout-chrono').click(); await wait(700);
      const d = document.getElementById('romer-depth'); d.value = '1'; d.dispatchEvent(new Event('change'));
      document.getElementById('romer-toggle').click(); await wait(800);
      const ids = ['P', 'Q'].filter(id => sp(id).length); const order = ids.sort((a, b) => sp(a).position('y') - sp(b).position('y'));
      const gapPQ = Math.round(box(order[1]).top - box(order[0]).bottom);
      return { spindles: cy.nodes('.romer-spindle').map(n => n.data('romerOf')).sort(), maxP: sp('P').data('romerMax'), totalP: sp('P').data('romerTotal'),
        heightP: sp('P').data('romerH'), gapPQ, centred: Math.abs(sp('P').position('y') - cy.$id('P').position('y')) < 0.5,
        label: sp('P').data('romerLabel'), batchClosed: cy._private.batchCount === 0,
        // Fuseau à ses vraies dates (Q, sans âge propre, commence à son plus ancien taxon, après son nœud) ;
        // la BRANCHE est prolongée jusqu'à sa pointe (écart en px), tronc inchangé.
        tipAfterNode: Math.round(sp('Q').position('x') - sp('Q').data('romerW') / 2 - cy.$id('Q').position('x')),
        joined: ['P', 'Q'].map(id => { const e = cy.$id(id).incomers('edge').first(); return Math.round(Math.abs(e.targetEndpoint().x - (sp(id).position('x') - sp(id).data('romerW') / 2)) * 100) / 100; }),
        borderShown: sp('P').style('border-opacity') === '1' };`);
    await step('romérogramme : disposition', `${H} ${SP} document.getElementById('romer-layout').click(); await wait(200);
      const panel = document.getElementById('romer-layout-panel'); const set = (id, v, ev) => { const el = panel.querySelector('#' + id); el.value = v; el.dispatchEvent(new Event(ev)); };
      set('romer-thickness', '10', 'input'); set('romer-gap', '40', 'input'); set('romer-font', '32', 'change'); set('romer-labelpos', 'right', 'change'); set('romer-count', 'both', 'change'); await wait(700);
      const ids = ['P', 'Q'].sort((a, b) => sp(a).position('y') - sp(b).position('y'));
      const r = { heightP: sp('P').data('romerH'), gapPQ: Math.round(box(ids[1]).top - box(ids[0]).bottom), font: sp('P').style('font-size'), halign: sp('P').style('text-halign'), label: sp('P').data('romerLabel') };
      set('romer-count', 'none', 'change'); await wait(400); r.labelNone = sp('P').data('romerLabel');
      const pts = () => sp('P').data('romerPoints').split(' ').length / 2; const angular = pts();
      set('romer-shape', 'smooth', 'change'); set('romer-colors', 'single', 'change'); set('romer-color', '#7a5cff', 'input');
      set('romer-opacity', '80', 'input'); set('romer-outline', 'ink', 'change'); set('romer-outlinew', '3', 'input'); await wait(700);
      r.style = { smoothMorePoints: pts() > angular * 3, colors: [...new Set(cy.nodes('.romer-spindle').map(n => n.data('romerColor')))], opacity: sp('P').style('background-opacity'),
        border: sp('P').style('border-width'), inkBorder: sp('P').style('border-color') !== sp('P').style('background-color') };
      set('romer-outline', 'none', 'change'); await wait(400); r.style.noBorder = sp('P').data('romerBorderW');
      panel.querySelector('#romer-layout-reset').click(); await wait(600); r.resetHeight = sp('P').data('romerH');
      key('Escape'); await wait(150); r.panelClosed = !document.getElementById('romer-layout-panel');
      document.getElementById('romer-toggle').click(); await wait(500); r.off = cy.nodes('.romer-spindle').length === 0 && cy.$id('p0').style('display') !== 'none';
      // Romérogramme coupé : la branche de Q revient à son nœud.
      r.edgeRestored = Math.abs(cy.$id('Q').incomers('edge').first().targetEndpoint().x - cy.$id('Q').position('x')) < 0.5;
      return r;`);
    // Supports TNT (ttags) : 2 arbres, seul le 2e étiqueté → importé d'office ; « [19] » affiché entre crochets ;
    // plusieurs valeurs (« 6/3 ») → question, Annuler = 2e valeur.
    const ttagPath = path.join(tmp, 'ttags.tre'), ttag2Path = path.join(tmp, 'ttags-2.tre');
    fs.writeFileSync(ttagPath, "tread 'tree(s) from TNT'\r\n(0 (1 (2 3 )))*\r\n(0 =/ (1 =/ (2 =/ 3 =/ )=45 )=[19] )=100 ;\r\nproc/;");
    fs.writeFileSync(ttag2Path, "tread\r\n(0 (1 2 )=6/3 (3 4 )=[5]/8 )=12/? ;\r\nproc/;");
    await step('TNT : supports (ttags)', `${H} const asked = []; const c0 = window.confirm; window.confirm = m => { asked.push(m); return false; };
      try { await window._loadOSFile(${JSON.stringify(ttagPath)}); await wait(700); } finally { window.confirm = c0; }
      const labels = cy.edges('[supportLabel]').map(e => e.data('supportLabel')).sort();
      const r = { asked: asked.length, onlyDataFileQuestion: asked.every(m => /fichier de données|data file/i.test(m)), labels, leaves: cy.nodes('.taxon').leaves().length, parasite: cy.nodes('.taxon').filter(n => /^=/.test(n.data('name') || '')).length,
        bracketedData: cy.nodes('.taxon').filter(n => n.data('support') && n.data('support').bracketed).length };
      const asked2 = []; window.confirm = m => { asked2.push(m); return false; };
      try { await window._loadOSFile(${JSON.stringify(ttag2Path)}); await wait(700); } finally { window.confirm = c0; }
      r.multi = { asked: asked2.length, columnQuestion: asked2.filter(m => m.includes('6/3') && m.includes('[5]/8')).length, labels: cy.edges('[supportLabel]').map(e => e.data('supportLabel')).sort() };
      return r;`);
    // Noms : « H.sapiens » (sans espace) reconnu à l'ouverture (rang, genre) ; titre de la fiche selon « Noms complets / compacts ».
    const namesPath = path.join(tmp, 'noms-abreges.phylo');
    fs.writeFileSync(namesPath, JSON.stringify({ version: '1.0', currentRootId: 'R', graph: { elements: [node('R', 'Hominidae'), node('G', 'Homo'), node('s1', 'H.sapiens'), node('s2', 'H. erectus'), edge('R', 'G'), edge('G', 's1'), edge('G', 's2')] } }));
    await step('noms : X.xxx et titre de la fiche', `${H} await window._loadOSFile(${JSON.stringify(namesPath)}); await wait(600);
      const s1 = cy.$id('s1'); const r = { name: s1.data('name'), rank: s1.data('rank'), genus: cy.$id('G').data('rank'), rank2: cy.$id('s2').data('rank') };
      cy.nodes().unselect(); s1.select(); key('f', { ctrl: true }); await wait(400);
      const title = () => document.getElementById('panel-title').innerText; const btn = document.getElementById('btn-toggle-abbrev');
      r.t1 = title(); btn.click(); await wait(400); r.t2 = title(); btn.click(); await wait(400); r.t3 = title();
      document.getElementById('btn-layout-chrono').click(); await wait(500); btn.click(); await wait(400); r.chronoT = title(); btn.click(); await wait(400);
      document.getElementById('btn-layout-normal').click(); await wait(300); key('Escape'); await wait(200);
      return r;`);

    // --- Phase 3 : formats d'arbre et presse-papiers du système
    const F = `${H} const byName = n => cy.nodes('.taxon').filter(x => x.data('name') === n);
      const pick = n => { cy.nodes().unselect(); byName(n)[0].select(); };
      const sys = () => window.electronAPI.readTreeClipboard();
      // Le presse-papiers de Windows se met à jour en différé : attendre que le texte soit réellement lisible.
      const setText = async s => { await navigator.clipboard.writeText(s); for (let i = 0; i < 30 && (await sys()).text !== s; i++) await wait(100); };`;
    await step('Newick : ouvrir (supports acceptés)', `${F} await window._loadOSFile(${JSON.stringify(nwkPath)}); await wait(700);
      return { ...counts(), names: cy.nodes('.taxon').map(n => n.data('name')).sort().join('|'), supportLabels: cy.edges('[supportLabel]').map(e => e.data('supportLabel')),
        italic: byName('Homo sapiens')[0].data('isItalic') === true, length: byName('Pan troglodytes')[0].data('branchLength') };`);
    // Deux arbres : la question « consensus strict ? » refusée → premier arbre ; acceptée → consensus (ici, rien de commun).
    await step('NEXUS : ouvrir (TRANSLATE, premier arbre)', `${F} const c0 = window.confirm; window.confirm = m => !/CONSENSUS/.test(m);
      try { await window._loadOSFile(${JSON.stringify(nexPath)}); await wait(700); } finally { window.confirm = c0; }
      return { ...counts(), names: cy.nodes('.taxon').map(n => n.data('name')).filter(Boolean).sort().join('|'), supportLabels: cy.edges('[supportLabel]').map(e => e.data('supportLabel')) };`);
    // Genre / Espèce reconnus à l'import (taxonomie intelligente) : noms complets / raccourcis applicables.
    await step('import : genres et espèces, noms raccourcis', `${F} await window._loadOSFile(${JSON.stringify(path.join(__dirname, '..', 'docs', 'exemples', 'hominides.tre'))}); await wait(700);
      const g = byName('Gorilla')[0], sp = byName('Gorilla gorilla')[0]; const btn = document.getElementById('btn-toggle-abbrev');
      const labels = () => ({ genus: g.data('computedLabel'), species: sp.data('computedLabel') });
      const first = labels(); btn.click(); await wait(500); const second = labels(); btn.click(); await wait(400);
      return { genusRank: g && g.data('rank'), speciesRank: sp && sp.data('rank'), supportKept: g.incomers('edge').first().data('supportLabel'), first, second };`);
    await step('NEXUS : consensus strict', `${F} await window._loadOSFile(${JSON.stringify(nexPath)}); await wait(700);
      const root = cy.nodes('.taxon').filter(n => n.incomers('node').length === 0); return { ...counts(), rootChildren: root.length ? root[0].outgoers('node').length : -1 };`);
    // TNT : fichier d'arbres (numéros seuls, Windows-1252) dont le commentaire désigne le fichier de données.
    await step('TNT : noms repris du fichier de données', `${F} const a0 = window.alert; const alerts = []; window.alert = m => alerts.push(String(m));
      try { await window._loadOSFile(${JSON.stringify(tntTreePath)}); await wait(700); } finally { window.alert = a0; }
      return { ...counts(), names: cy.nodes('.taxon').map(n => n.data('name')).filter(Boolean).sort().join('|'), alerts };`);
    await step('TNT : fichier de données seul', `${F} const a0 = window.alert; const alerts = []; window.alert = m => alerts.push(String(m));
      try { await window._loadOSFile(${JSON.stringify(tntDataPath)}); await wait(500); } finally { window.alert = a0; }
      return { explained: alerts.some(m => /DONNÉES|DATA/.test(m)), alerts: alerts.map(m => m.slice(0, 60)) };`);
    await step('presse-papiers : Ctrl+C écrit Newick + document', `${F} await window._loadOSFile(${JSON.stringify(nwkPath)}); await wait(700);
      pick('Ponginae'); key('c', { ctrl: true }); await wait(300); const c = await sys();
      return { text: c.text, json: !!c.json, docTrees: c.json ? JSON.parse(c.json).doc.trees.length : 0 };`);
    await step('presse-papiers : même fenêtre → collage interne', `${F} pick('Hominidae'); key('v', { ctrl: true }); await wait(800);
      const p = byName('Pongo'); return { ...counts(), pongo: p.length, internalIds: p.filter(n => n.id().startsWith('taxon-')).length };`);
    await step('presse-papiers : autre fenêtre → greffe', `${F} const c = await sys(); const payload = JSON.parse(c.json); payload.instance = 'autre-fenetre';
      await window.electronAPI.writeTreeClipboard(c.text, JSON.stringify(payload));
      pick('Homo sapiens'); key('v', { ctrl: true }); await wait(1000);
      const graft = byName('Ponginae').filter(n => n.incomers('node').length && n.incomers('node')[0].data('name') === 'Homo sapiens');
      return { ...counts(), grafted: graft.length, children: graft.length ? graft[0].outgoers('node').length : 0 };`);
    // Les dialogues confirm/alert des imports ont retiré le focus : le presse-papiers web l'exige.
    await send('Page.bringToFront'); await evaluate(`window.focus(); document.body.focus();`); await sleep(300);
    await step('presse-papiers : Newick d\'un autre logiciel', `${F} await setText('(Felis_catus,(Canis_lupus,Ursus_arctos)80);');
      pick('Pan troglodytes'); key('v', { ctrl: true }); await wait(1000);
      const f = byName('Felis catus'); return { ...counts(), felis: f.length, support80: cy.edges('[supportLabel = "80"]').length };`);
    await step('presse-papiers : texte ordinaire → nouveau taxon', `${F} await setText('Australopithecus');
      pick('Hominidae'); key('v', { ctrl: true }); await wait(800); return { ...counts(), created: byName('Australopithecus').length };`);
    await step('presse-papiers : couper puis coller malgré un texte étranger', `${F} await setText('texte étranger');
      pick('Gorilla gorilla'); const tid = byName('Gorilla gorilla')[0].data('taxonId'); key('x', { ctrl: true }); await wait(400);
      pick('Australopithecus'); key('v', { ctrl: true }); await wait(800);
      const g = byName('Gorilla gorilla').filter(n => n.incomers('node')[0].data('name') === 'Australopithecus');
      return { moved: g.length, sameTaxon: g.length ? g[0].data('taxonId') === tid : false, foreign: byName('texte étranger').length };`);
    // --- Phase 4 : hub (menu Accueil, retour, modèle), miniature des projets récents, notification
    const thumbPath = path.join(tmp, 'miniature.phylo');
    fs.writeFileSync(thumbPath, JSON.stringify({ version: '1.0', currentRootId: 'R', graph: { elements: [node('R', 'Theropoda', { sheetImage: IMG, sheetImageRatio: 1 }), node('C', 'Aves'), edge('R', 'C')] } }));
    await step('projets récents : miniature et notification', `${H} await window._loadOSFile(${JSON.stringify(thumbPath)}); await wait(600); key('s', { ctrl: true }); await wait(1500);
      const r = JSON.parse(localStorage.getItem('cladistree_recents') || '[]')[0]; const toast = document.querySelector('.cl-toast');
      return { name: r.name, thumb: String(r.thumb || '').slice(0, 15), docNotStored: !('data' in r), toast: !!toast };`);
    await step('hub : Accueil puis Échap', `${H} document.getElementById('btn-hub').click(); await wait(500); const hub = document.getElementById('welcome-overlay');
      const shown = getComputedStyle(hub).display, back = getComputedStyle(document.getElementById('hub-close')).display, thumb = String(hub.querySelector('.hub-card img').getAttribute('src')).slice(0, 15);
      key('Escape'); await wait(400); return { shown, back, thumb, closed: getComputedStyle(hub).display };`);
    await step('hub : modèle chronogramme', `${H} document.getElementById('btn-hub').click(); await wait(400); document.querySelector('[data-template="chrono"]').click(); await wait(1200);
      return { hub: getComputedStyle(document.getElementById('welcome-overlay')).display, nodes: counts().nodes, ages: [cy.$id('root').data('period'), cy.$id('n1').data('period')], ruler: !!document.getElementById('chrono-ruler-labels') };`);
    await step('modèle : noms modifiables, nom sélectionné en édition', `${H} const names = cy.nodes('.taxon').map(n => n.data('name'));
      cy.$id('n1').emit('dbltap'); await wait(250); const ed = document.getElementById('inline-taxon-editor');
      const r = { names, editor: !!ed, allSelected: !!ed && ed.selectionStart === 0 && ed.selectionEnd === ed.value.length && ed.value.length > 0 };
      if (ed) ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(200); return r;`);
    await step('mode normal (après le modèle)', `${H} document.getElementById('btn-layout-normal').click(); await wait(400); return counts();`);
    // Divergences sans nom : zone de clic élargie (clic réel à quelques pixels), aperçu du pinceau au survol.
    const divPath = path.join(tmp, 'divergences.phylo');
    fs.writeFileSync(divPath, JSON.stringify({ version: '1.0', currentRootId: 'R', graph: { elements: [
      node('R', 'Dinosauria'), node('D1', ''), node('a', 'Tyrannosaurus rex'), node('D2', ''), node('b', 'Velociraptor'), node('c', 'Gallus'), node('d', 'Triceratops'),
      edge('R', 'D1'), edge('R', 'd'), edge('D1', 'a'), edge('D1', 'D2'), edge('D2', 'b'), edge('D2', 'c') ] } }));
    const posOfNode = (id) => evaluate(`${H} const r = document.getElementById('app').getBoundingClientRect(); const p = cy.$id('${id}').renderedPosition(); return { x: Math.round(r.left + p.x), y: Math.round(r.top + p.y) };`);
    await evaluate(`${H} await window._loadOSFile(${JSON.stringify(divPath)}); await wait(700); cy.fit(undefined, 80); await wait(400); cy.nodes().unselect(); return 1;`);
    { const p = await posOfNode('D2');
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p.x + 6, y: p.y + 6, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
      await sleep(300);
      await step('divergence sans nom : clic à 8 px', `${H} return { selected: cy.$(':selected').map(n => n.id()), drawnWidth: cy.$id('D2').outerWidth() };`);
      await evaluate(`${H} cy.nodes().unselect(); document.getElementById('style-brush-toggle').click(); return 1;`); await sleep(400);
      const q = await posOfNode('D2');
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x + 60, y: q.y + 80, button: 'none' }); await sleep(150);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x + 3, y: q.y + 3, button: 'none' }); await sleep(400);
      await step('pinceau : aperçu au survol', `${H} const pv = cy.scratch('_paintPreview') || cy.collection();
        return { blue: pv.filter(e => e.style('line-color') === 'rgb(33,150,243)').map(e => e.target().id()).sort(), lastSegmentOnly: cy.$id('D2').incomers('edge').style('line-fill'), painted: cy.nodes('[branch]').length };`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: q.x + 300, y: q.y + 200, button: 'none' }); await sleep(300);
      await step('pinceau : aperçu effacé', `${H} const r = { preview: !!cy.scratch('_paintPreview'), gradients: cy.edges().filter(e => e.style('line-fill') !== 'solid').length };
        document.getElementById('style-brush-toggle').click(); return r;`); }
    await step('nouveau document', `${H} document.getElementById('btn-new').click(); await wait(600); return counts();`);

    currentStep = 'erreurs de la fenêtre';
    { const r = await evaluate(`const ov = document.getElementById('webpack-dev-server-client-overlay'); return { errors: [...new Set(window.__winErrors || [])], overlay: !!(ov && getComputedStyle(ov).display !== 'none') };`);
      results[currentStep] = r;
      (r.errors || []).forEach(text => problems.push({ kind: 'window.onerror', text, step: currentStep }));
      if (r.overlay) problems.push({ kind: 'overlay', text: 'surcouche d\'erreur du serveur de développement affichée (bloque les clics)', step: currentStep });
      console.log(`${r.errors.length || r.overlay ? 'ÉCHEC' : 'ok   '}  ${currentStep} → ${JSON.stringify(r)}`); }
    ws.close();
})().catch(e => { problems.push({ kind: 'harness', text: String(e && e.stack || e) }); })
  .finally(() => {
    killApp();
    const startupLog = appLog.split('\n').filter(l => /Uncaught|ERROR|is invalid|TypeError|ReferenceError/i.test(l)).map(l => l.replace(/^\[[^\]]*\]\s*/, '').slice(0, 200));
    const uniqueLog = [...new Set(startupLog)];
    const report = { results, problems, appLogIssues: uniqueLog };
    // Regroupe les problèmes identiques (un avertissement répété ne doit pas masquer les autres).
    const grouped = new Map();
    problems.forEach(p => { const k = p.kind + '|' + p.text; const g = grouped.get(k) || { ...p, count: 0, steps: new Set() }; g.count++; g.steps.add(p.step); grouped.set(k, g); });
    report.problemsGrouped = [...grouped.values()].map(g => ({ kind: g.kind, text: g.text, count: g.count, steps: [...g.steps] }));
    console.log(`\n${grouped.size} problème(s) distinct(s) dans la page, ${uniqueLog.length} ligne(s) suspecte(s) dans le journal.`);
    report.problemsGrouped.forEach(g => console.log(`  [${g.kind}] ×${g.count} (${g.steps.slice(0, 3).join(', ')}${g.steps.length > 3 ? '…' : ''}) ${g.text.slice(0, 160)}`));
    uniqueLog.forEach(l => console.log('  [journal] ' + l));
    if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 1));
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* fichiers encore verrouillés par l'application arrêtée : dossier temporaire laissé */ }
    process.exit(0);
  });
