// Génère src/locales/geo-names.ts : noms des unités géologiques en espagnol, portugais, italien et allemand.
// Étages : règle de suffixe des chartes nationales (es -iense, pt/it -iano, de -ium) appliquée au nom anglais
// (« Maastrichtian » → Maastrichtiense / Maastrichtiano / Maastrichtium), plus exceptions d'usage.
// Grandes unités, séries et Précambrien : tables écrites à la main.
// Usage (depuis my-new-app) : node tests/tools/gen-geo-names.js
const fs = require('fs'); const ts = require(process.cwd() + '/node_modules/typescript');
global.localStorage = { getItem: () => null, setItem: () => {} };
const path = require('path'); const cache = {};
const load = f0 => { const f = path.normalize(f0); if (cache[f]) return cache[f]; const mod = { exports: {} }; cache[f] = mod.exports;
  const req = r => r.startsWith('./') ? load(path.join(path.dirname(f), r.slice(2) + '.ts')) : require(r);
  new Function('module', 'exports', 'require', ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 'commonjs', target: 'es2019' } }).outputText)(mod, mod.exports, req); return mod.exports; };
const en = load('src/i18n.ts').translations.en;
const LANGS = ['es', 'pt', 'it', 'de'];

// Suffixe des étages : nom anglais en « -ian » → radical + suffixe.
const SUFFIX = { es: 'iense', pt: 'iano', it: 'iano', de: 'ium' };
// Exceptions d'étages (orthographe consacrée dans chaque langue).
const STAGE_EXCEPTIONS = {
  'geo.zanclean': ['Zancliense', 'Zancliano', 'Zancleano', 'Zancleum'],
  'geo.visean': ['Viseense', 'Viseano', 'Viseano', 'Viséum'],
  'geo.induan': ['Induense', 'Induano', 'Induano', 'Induum'],
  'geo.wuliuan': ['Wuliuense', 'Wuliuano', 'Wuliuano', 'Wuliuum'],
  'geo.lutetian': ['Luteciense', 'Lutetiano', 'Luteziano', 'Lutetium'],
  'geo.tithonian': ['Titoniense', 'Titoniano', 'Titoniano', 'Tithonium'],
  'geo.rhaetian': ['Retiense', 'Rético', 'Retico', 'Rhaetium'],
  'geo.chattian': ['Chattiense', 'Chattiano', 'Cattiano', 'Chattium'],
  'geo.carnian': ['Carniense', 'Carniano', 'Carnico', 'Karnium'],
  'geo.ladinian': ['Ladiniense', 'Ladiniano', 'Ladinico', 'Ladinium'],
  'geo.anisian': ['Anisiense', 'Anisiano', 'Anisico', 'Anisium'],
  'geo.moscovian': ['Moscoviense', 'Moscoviano', 'Moscoviano', 'Moskovium'],
  'geo.bashkirian': ['Bashkiriense', 'Bashkiriano', 'Bashkiriano', 'Baschkirium'],
  'geo.famennian': ['Fameniense', 'Fameniano', 'Fameniano', 'Famennium'],
  'geo.pragian': ['Praguiense', 'Praguiano', 'Pragiano', 'Pragium'],
  'geo.pridoli': ['Přídolí', 'Přídolí', 'Přídolí', 'Přídolí'],
  'geo.holocene': ['Holoceno', 'Holocénico', 'Olocene', 'Holozän'],
  'geo.stage10': ['Piso 10', 'Andar 10', 'Piano 10', 'Stufe 10'],
  'geo.stage4': ['Piso 4', 'Andar 4', 'Piano 4', 'Stufe 4'],
  'geo.stage3': ['Piso 3', 'Andar 3', 'Piano 3', 'Stufe 3'],
  'geo.stage2': ['Piso 2', 'Andar 2', 'Piano 2', 'Stufe 2'],
};
// Grandes unités, séries, Précambrien : [es, pt, it, de].
const NAMED = {
  'geo.eon.phanerozoic': ['Fanerozoico', 'Fanerozoico', 'Fanerozoico', 'Phanerozoikum'],
  'geo.eon.proterozoic': ['Proterozoico', 'Proterozoico', 'Proterozoico', 'Proterozoikum'],
  'geo.eon.archean': ['Arcaico', 'Arcaico', 'Archeano', 'Archaikum'],
  'geo.eon.hadean': ['Hádico', 'Hadaico', 'Adeano', 'Hadaikum'],
  'geo.period.precambrian': ['Precámbrico', 'Pré-Câmbrico', 'Precambriano', 'Präkambrium'],
  'geo.era.cenozoic': ['Cenozoico', 'Cenozoico', 'Cenozoico', 'Känozoikum'],
  'geo.era.mesozoic': ['Mesozoico', 'Mesozoico', 'Mesozoico', 'Mesozoikum'],
  'geo.era.paleozoic': ['Paleozoico', 'Paleozoico', 'Paleozoico', 'Paläozoikum'],
  'geo.era.neoproterozoic': ['Neoproterozoico', 'Neoproterozoico', 'Neoproterozoico', 'Neoproterozoikum'],
  'geo.era.mesoproterozoic': ['Mesoproterozoico', 'Mesoproterozoico', 'Mesoproterozoico', 'Mesoproterozoikum'],
  'geo.era.paleoproterozoic': ['Paleoproterozoico', 'Paleoproterozoico', 'Paleoproterozoico', 'Paläoproterozoikum'],
  'geo.era.neoarchean': ['Neoarcaico', 'Neoarcaico', 'Neoarcheano', 'Neoarchaikum'],
  'geo.era.mesoarchean': ['Mesoarcaico', 'Mesoarcaico', 'Mesoarcheano', 'Mesoarchaikum'],
  'geo.era.paleoarchean': ['Paleoarcaico', 'Paleoarcaico', 'Paleoarcheano', 'Paläoarchaikum'],
  'geo.era.eoarchean': ['Eoarcaico', 'Eoarcaico', 'Eoarcheano', 'Eoarchaikum'],
  'geo.period.quaternary': ['Cuaternario', 'Quaternário', 'Quaternario', 'Quartär'],
  'geo.period.neogene': ['Neógeno', 'Neogénico', 'Neogene', 'Neogen'],
  'geo.period.paleogene': ['Paleógeno', 'Paleogénico', 'Paleogene', 'Paläogen'],
  'geo.period.cretaceous': ['Cretácico', 'Cretácico', 'Cretaceo', 'Kreide'],
  'geo.period.jurassic': ['Jurásico', 'Jurássico', 'Giurassico', 'Jura'],
  'geo.period.triassic': ['Triásico', 'Triásico', 'Triassico', 'Trias'],
  'geo.period.permian': ['Pérmico', 'Pérmico', 'Permiano', 'Perm'],
  'geo.period.carboniferous': ['Carbonífero', 'Carbónico', 'Carbonifero', 'Karbon'],
  'geo.period.devonian': ['Devónico', 'Devónico', 'Devoniano', 'Devon'],
  'geo.period.silurian': ['Silúrico', 'Silúrico', 'Siluriano', 'Silur'],
  'geo.period.ordovician': ['Ordovícico', 'Ordovícico', 'Ordoviciano', 'Ordovizium'],
  'geo.period.cambrian': ['Cámbrico', 'Câmbrico', 'Cambriano', 'Kambrium'],
  'geo.ediacaran': ['Ediacárico', 'Ediacárico', 'Ediacarano', 'Ediacarium'],
  'geo.cryogenian': ['Criogénico', 'Criogénico', 'Criogeniano', 'Cryogenium'],
  'geo.tonian': ['Tónico', 'Tónico', 'Toniano', 'Tonium'],
  'geo.stenian': ['Esténico', 'Esténico', 'Steniano', 'Stenium'],
  'geo.ectasian': ['Ectásico', 'Ectásico', 'Ectasiano', 'Ectasium'],
  'geo.calymmian': ['Calímmico', 'Calímico', 'Calimmiano', 'Calymmium'],
  'geo.statherian': ['Estatérico', 'Estatérico', 'Stateriano', 'Statherium'],
  'geo.orosirian': ['Orosírico', 'Orosírico', 'Orosiriano', 'Orosirium'],
  'geo.rhyacian': ['Riácico', 'Riácico', 'Rhyaciano', 'Rhyacium'],
  'geo.siderian': ['Sidérico', 'Sidérico', 'Sideriano', 'Siderium'],
  'geo.epoch.holocene': ['Holoceno', 'Holocénico', 'Olocene', 'Holozän'],
  'geo.epoch.pleistocene': ['Pleistoceno', 'Plistocénico', 'Pleistocene', 'Pleistozän'],
  'geo.epoch.pliocene': ['Plioceno', 'Pliocénico', 'Pliocene', 'Pliozän'],
  'geo.epoch.miocene': ['Mioceno', 'Miocénico', 'Miocene', 'Miozän'],
  'geo.epoch.oligocene': ['Oligoceno', 'Oligocénico', 'Oligocene', 'Oligozän'],
  'geo.epoch.eocene': ['Eoceno', 'Eocénico', 'Eocene', 'Eozän'],
  'geo.epoch.paleocene': ['Paleoceno', 'Paleocénico', 'Paleocene', 'Paläozän'],
  'geo.epoch.lopingian': ['Lopingiense', 'Lopingiano', 'Lopingiano', 'Lopingium'],
  'geo.epoch.guadalupian': ['Guadalupiense', 'Guadalupiano', 'Guadalupiano', 'Guadalupium'],
  'geo.epoch.cisuralian': ['Cisuraliense', 'Cisuraliano', 'Cisuraliano', 'Cisuralium'],
  'geo.epoch.pridoli': ['Přídolí', 'Přídolí', 'Přídolí', 'Přídolí'],
  'geo.epoch.ludlow': ['Ludlow', 'Ludlow', 'Ludlow', 'Ludlow'],
  'geo.epoch.wenlock': ['Wenlock', 'Wenlock', 'Wenlock', 'Wenlock'],
  'geo.epoch.llandovery': ['Llandovery', 'Llandovery', 'Llandovery', 'Llandovery'],
  'geo.epoch.furongian': ['Furongiense', 'Furongiano', 'Furongiano', 'Furongium'],
  'geo.epoch.miaolingian': ['Miaolingiense', 'Miaolingiano', 'Miaolingiano', 'Miaolingium'],
  'geo.epoch.cambrian_series2': ['Serie 2', 'Série 2', 'Serie 2', 'Serie 2'],
  'geo.epoch.terreneuvian': ['Terreneuviense', 'Terreneuviano', 'Terreneuviano', 'Terreneuvium'],
};
// Séries « supérieur / moyen / inférieur » : [es, pt, it, de] par période et position.
const PERIOD_ADJ = {
  cretaceous: { es: 'Cretácico', pt: 'Cretácico', it: 'Cretaceo', de: 'kreide' },
  jurassic: { es: 'Jurásico', pt: 'Jurássico', it: 'Giurassico', de: 'jura' },
  triassic: { es: 'Triásico', pt: 'Triásico', it: 'Triassico', de: 'trias' },
  pennsylvanian: { es: 'Pensilvánico', pt: 'Pensilvânico', it: 'Pennsylvaniano', de: 'Pennsylvanium' },
  mississippian: { es: 'Misisípico', pt: 'Mississípico', it: 'Mississippiano', de: 'Mississippium' },
  devonian: { es: 'Devónico', pt: 'Devónico', it: 'Devoniano', de: 'devon' },
  ordovician: { es: 'Ordovícico', pt: 'Ordovícico', it: 'Ordoviciano', de: 'ordovizium' },
};
const POS = { upper: { es: 'Superior', pt: 'Superior', it: 'superiore', de: ['Ober', 'Oberes'] }, middle: { es: 'Medio', pt: 'Médio', it: 'medio', de: ['Mittel', 'Mittleres'] }, lower: { es: 'Inferior', pt: 'Inferior', it: 'inferiore', de: ['Unter', 'Unteres'] } };
const positional = (key, lang) => {
  const mm = key.match(/^geo\.epoch\.(upper|middle|lower)_(\w+)$/);
  if (!mm) return null;
  const per = PERIOD_ADJ[mm[2]], pos = POS[mm[1]];
  if (lang === 'de') return per.de[0] === per.de[0].toLowerCase() ? pos.de[0] + per.de : pos.de[1] + ' ' + per.de; // Oberkreide ; Oberes Pennsylvanium
  return per[lang] + ' ' + pos[lang];
};

const out = {}; LANGS.forEach(l => { out[l] = {}; });
Object.keys(en).filter(k => k.startsWith('geo.')).forEach(k => {
  LANGS.forEach((l, i) => {
    let v = NAMED[k] ? NAMED[k][i] : STAGE_EXCEPTIONS[k] ? STAGE_EXCEPTIONS[k][i] : positional(k, l);
    if (!v) {
      const name = en[k];
      if (!/ian$/.test(name)) throw new Error(`pas de règle pour ${k} (${name}) en ${l}`);
      v = name.slice(0, -3) + SUFFIX[l];
    }
    out[l][k] = v;
  });
});
const body = LANGS.map(l => `  ${l}: {\n${Object.entries(out[l]).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n  },`).join('\n');
fs.writeFileSync('src/locales/geo-names.ts',
`// FICHIER GÉNÉRÉ par tests/tools/gen-geo-names.js — ne pas modifier à la main.
// Noms des unités géologiques (charte ICS) en espagnol, portugais (européen), italien et allemand.
export const GEO_NAMES: Record<'es' | 'pt' | 'it' | 'de', Record<string, string>> = {
${body}
};
`);
console.log('src/locales/geo-names.ts :', Object.keys(out.es).length, 'noms × 4 langues');
console.log('exemples :', ['geo.maastrichtian', 'geo.rhaetian', 'geo.epoch.upper_cretaceous', 'geo.epoch.middle_pennsylvanian', 'geo.period.carboniferous', 'geo.stage10'].map(k => LANGS.map(l => out[l][k]).join(' / ')).join('  |  '));
