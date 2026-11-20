# Feuille de route CladisTree 1.4.0

## Ordre des phases

### Phase 0 — Fondations
1. Vrai versionnage du format (`formatVersion`) + fonction `migrate(doc)` appelée **partout** où des données entrent : ouverture, greffe, import, collage (y compris collage depuis une instance 1.3). ✅ fait avec la phase 1 (`migrate.ts`) : ouverture, fichiers récents, feuilles liées, greffe. Le collage reste interne à la session ; la 1.3 n'écrit rien dans le presse-papiers système (le collage entre instances est prévu en phase 3).
2. Découper `renderer.ts` en modules (fichiers/IO, presse-papiers, interactions/molette, panneau fiche). ✅ fait : `file-io.ts`, `clipboard.ts`, `interactions.ts`, `side-panel.ts`, plus `keyboard.ts` et `graph-export.ts` (renderer.ts : 4 900 → ~2 900 lignes). Extraction outillée (`tests/tools/`) et vérifiée module par module (types + test de fumée identique avant/après).
   - Reste dans renderer.ts (candidats à une extraction ultérieure) : `refreshLayout` (~640 lignes), ruban de style (`updateRibbonForNode`), barre des feuilles (`updateSheetsBar`), frise du chronogramme, recherche, réglages et mise à jour.

**Revue de bugs après les phases 0 et 1** (corrigés) : sélecteurs Cytoscape invalides `:not(.box)` (5 endroits : style appliqué à un seul nœud au lieu de la sélection, boîtes monophylétiques sans les descendants, appartenance aux boîtes après glisser-déposer, images des nœuds internes en chronogramme, Suppr) ; racine supposée s'appeler `'root'` (Suppr ou Ctrl+X sur la racine d'un arbre importé d'XMind supprimait tout l'arbre, recherche cassée) ; menus « Enregistrer » / « Enregistrer sous » non reliés ; bouton « Bornes » sans effet ; journaux de débogage ; copie morte et fausse d'`EMPTY_DATA`.
**Questions de la revue, tranchées** :
- Case « Auto Genre/Espèce » : supprimée (doublon de « Taxonomie intelligente », qui détecte déjà le rang d'après la forme du nom).
- Bouton « Barres : fidèle / lisible » : supprimé (la géométrie de `layout-engine.ts` écarte déjà les troncs d'au moins 24 px).
- Absence de Content-Security-Policy : ignorée pour l'instant (sans conséquence tant que l'application n'affiche aucun contenu distant).
3. Corrections rapides indépendantes : ✅ faites (molette par geste, images composées à l'export, âges unifiés sur la charte ICS 2026/06 dans `chrono-data.ts`, frise du chronogramme étendue à tout le Précambrien, avec échelle comprimée ×1/10 et rupture signalée)
   - scroll trop fort → zoom (heuristique `|deltaY| >= 50` dans le handler `wheel`) ;
   - images absentes à l'export (calque HTML non capturé par `cy.png()` → composer les images sur le canevas exporté) ;
   - vérification et unification des âges des étages (une seule source, charte ICS à jour).

### Phase 1 — Nouveau modèle de données (UNE seule migration v1 → v2)
Regrouper tous les changements de format pour n'écrire qu'un script de rétrocompatibilité :
- **Nœuds comme entités** (divergences sélectionnables, annotables, porteurs de valeurs de support/bootstrap).
- **Séparation taxons / arbres** (prépare les classifications alternatives, voir plus bas) :
  - table unique de taxons (fiche, images, audio, auteur…) ;
  - `trees[]` : chaque classification est un arbre de nœuds qui référencent des taxons ; parent, ordre, boîtes, feuilles, positions manuelles, supports et styles de branches appartiennent à l'arbre.
  - Un ancien fichier devient une seule classification « Classification 1 ».
- **Images dans une table d'assets partagée** (`assets: { id: base64 }`), fiches → `images: [id…]` : multi-images, undo plus léger, pas de doublons au copier-coller.
- Champs pour l'audio (chemin relatif au fichier, non exportable) et le surlignage des noms.

**État : ✅ couche données faite** (format v2, `doc-model.ts`, `migrate.ts`, `doc-session.ts`, `asset-store.ts`, test `npm run test:format`).
- Fait : format v2 et migration v1 → v2 ; taxons séparés des nœuds d'arbre ; `trees[]` (un ancien fichier = « Classification 1 », les autres classifications et les taxons qui n'y figurent pas sont conservés à l'enregistrement) ; images en `assets` dédoublonnées et nœuds Cytoscape en références (undo léger) ; champs `support`, `highlight`, `branch`, `audio`, images supplémentaires ; divergences sans taxon (`taxonId: null`) conservées ; « Fichier ▸ Copie compatible 1.3 ».
- Décisions : Cytoscape reste la copie de travail de la classification active (conversion à l'ouverture et à l'enregistrement) ; compatibilité 1.3 par copie explicite (pas de format double).
- Pas fait, volontairement (phase 3) : l'interface de ces données (sélectionner/annoter les divergences, saisir supports/surlignage/audio, multi-images, changer de classification). Les positions manuelles ne sont pas stockées : la 1.3 n'en a pas (la mise en page les recalcule).

### Phase 2 — Refonte de l'interface en onglets
Avant d'ajouter de nouveaux outils, pour qu'ils naissent au bon endroit.
Onglets : **Style** (outils de style, pinceau, surlignage), **Affichage** (paramètres classiques, thème), **Arbre** (greffes, modes d'affichage, mode nœuds), **Aide**.

**État : ✅ fait** (`ribbon.ts`, barre du haut de `ui.ts`). Style visuel de l'existant conservé (variables de thème, accent #2196F3, groupes à titre en petites capitales de l'ancien ruban de style).
- Barre du haut : `Fichier ▾` (inchangé), onglets, recherche. Ruban dessous, repliable (clic sur l'onglet actif ou ▲), onglet retenu entre les sessions ; « Arbre » ouvert au premier lancement.
- **Style** : l'ancien ruban de style (texte, lignage, boîte, pictogramme), qui suit toujours la sélection. Pinceau et surlignage y seront ajoutés en phase 3.
- **Affichage** : caméra (recadrer, centrer sur la racine, déplier tout), noms d'espèces complets/compacts, thème et fond du graphe (déplacés depuis la fenêtre Paramètres), bouton « Paramètres… » (remplace l'engrenage).
- **Arbre** : modes standard/peigne/chrono, outils du chronogramme (échelle, bornes) en mode chrono, actions sur la sélection (greffer, nouvelle feuille, encadrer), désactivées sans sélection adaptée. Le mode nœuds y sera ajouté en phase 3.
- **Aide** : guide, raccourcis, notes de mise à jour, vérification des mises à jour, crédits.
- Corrigé au passage : le ruban de style recouvrait le fil d'Ariane et le haut de la fiche ; « Gras », « Italique » et « Lignage » n'étaient pas traduits ; icônes des modes inactifs illisibles sur les thèmes sombres.

### Phase 3 — Fonctionnalités sur le nouveau moteur

**Avancement** (consignes : mode divergences activable et non automatique ; surlignage sur Ctrl+H ; romérogramme dans un onglet ou une sous-partie dédiée du ruban ; audio, multi-images et classifications alternatives dans la fiche ; classification alternative **par feuille**, bouton réservé aux racines de feuille) :
- ✅ Surlignage des noms (onglet Style + Ctrl+H, inclus dans les exports).
- ✅ Pinceau des branches (onglet Style : mode clic, « Peindre la sélection »). Retour d'essai intégré : un nœud peint dont les frères ne le sont pas tous ne colore que son **dernier segment horizontal** ; quand tous les enfants d'un parent sont peints, le chemin entier l'est ; clic sur un **nom** = tout le clade (monophylétique), clic sur une branche = cette branche, Maj+clic sur un nom = sa seule branche. Limite : l'épaisseur ne s'applique qu'aux chemins entiers (Cytoscape trace une arête d'une seule épaisseur).
- ✅ Glisser les divergences (onglet Arbre, bouton à bascule). Question tranchée : en chronogramme, glisser **modifie l'âge**, borné par le parent et l'enfant le plus ancien ; sans effet en peigne.
- ✅ Fiche : images multiples (miniatures, « Définir comme illustration principale » ; la 1re reste l'illustration exportée en PDF), son (chemin relatif au .phylo, lu via le processus principal ; fichier absent signalé). Retour d'essai : le son ne se lisait pas (URL `blob:` refusée par Chromium → URL `data:`) ; le PDF de la fiche reprend toutes les images (principale en haut, autres à la fin) ; champ renommé « Crédits (photographiques ou artistiques) ou légende ».
- ✅ Classifications alternatives par feuille (`sheet-variants.ts`, `classifications-ui.ts`) : menu en haut de la fiche des racines de feuille, ajouter (copie de l'active), basculer, renommer, supprimer ; feuilles imbriquées absentes d'une classification mises de côté puis rattachées ; Suppr sur une sous-feuille placée par une autre classification = retrait de l'active seulement ; taxons en double signalés. Changer de classification vide l'historique d'annulation.
- ✅ Romérogramme (`romer.ts`) : groupe dédié « Romérogramme » de l'onglet Arbre en mode chronogramme (fuseaux, niveau 1-3, pas de temps) ; fuseaux = nœuds polygonaux recalculés à chaque mise en page, jamais enregistrés, présents dans les exports. Ruban à hauteur constante (défilement horizontal si trop étroit). Retour d'essai : instable (erreur au changement de pas, fuseaux restés en vue normale, blocage progressif) → un clade sans étendue temporelle (ex. feuilles actuelles à « 0 ») faisait échouer la mise en page dans un lot Cytoscape jamais refermé ; corrigé (clade dessiné normalement, `try/finally` autour du lot, masquage appliqué d'un bloc et rétabli exactement). Second retour : choix des clades (« Clades choisis » + bouton « Fuseau : sélection », enregistré) ; un taxon terminal (ex. le plus basal) forme son propre fuseau au lieu d'être exclu ; fuseau continu (col fin dans les tranches sans taxon connu) et rattaché à la branche de son clade.
- ✅ Import Newick / NEXUS / TNT (`phylo-formats.ts`) : « Ouvrir » (nouveau document) et greffe ; `.nwk .newick .tre .tree .nex .nexus .tnt`. Étiquettes internes numériques → question « supports ou noms de clades ? » ; fichier à plusieurs arbres → le premier, avec un avertissement ; NEXUS : `TRANSLATE` appliqué ; TNT : `tread`, noms de `xread`/`taxname`, taxons numérotés. Longueurs de branche conservées (`branchLength`), binômes en italique. Retour d'essai (fichiers réels TNT) : fichiers Windows-1252 décodés ; arbres TNT à taxons numérotés nommés automatiquement depuis le fichier de données indiqué par TNT (sinon proposé au choix) ; fichier de données sans arbre (`.tnt` matrice, NEXUS sans bloc TREES) expliqué ; plusieurs arbres → consensus strict proposé (sinon le premier) ; NEXUS sans TRANSLATE nommé par TAXLABELS. Exemples : `docs/exemples/`. Troisième retour : fichiers NON REFERMÉS acceptés (TNT laisse le fichier d'arbres sans « ; » ni « proc » tant que `tsave` n'est pas fermé, le dernier arbre étant souvent le consensus ; NEXUS sans `END;`) — c'était la cause de l'erreur « commande introuvable ». Quatrième retour : à l'import (fichier, greffe, Newick collé), Genre / Espèce reconnus d'après les noms quand la taxonomie intelligente est active (`inferTaxonomy` : feuilles binominales → Espèce, trinominales → Sous-espèce ; clade sans nom réunissant TOUTES les espèces d'un genre → nœud Genre ; sinon — espèce seule de son genre ou genre éclaté — nœud Genre inséré au-dessus de chaque espèce, comme dans un arbre saisi à la main), pour que les noms complets / raccourcis s'appliquent. À l'export Newick / NEXUS et au copier, un Genre à une seule espèce est sauté.
- ✅ Export Newick / NEXUS de l'arbre entier (menu d'export), supports ou noms de clades en étiquettes internes au choix (un nœud sans l'un écrit l'autre). Ordre d'affichage respecté.
- ✅ Valeurs de support affichées près du nœud, sur la branche qui y mène (incluses dans les exports d'image).
- ✅ Export d'une branche en `.phylo` (menu contextuel « Exporter la branche »).
- ✅ Copier-coller entre instances : Ctrl+C (et « couper ») écrit dans le presse-papiers du système le **Newick** du clade (collable dans d'autres logiciels) et le **document v2** complet (fiches, images) dans un format HTML marqué. Ctrl+V : clade de la même fenêtre → collage interne (« couper = déplacer » conservé) ; d'une autre fenêtre → greffe ; Newick d'un autre logiciel → greffe ; texte ordinaire → nouveau taxon, comme avant.
- ✅ Supports TNT (`ttags`) lus par un lecteur TNT dédié (plus de conversion en Newick) : « =11 », « =[19] » (entre crochets = groupe contredit par un groupe plus fréquent : `support.bracketed`, affiché « [19] » sur la branche, exporté en simple nombre), « =6/? » (plusieurs valeurs : la 1re, question si plusieurs colonnes portent des valeurs), « = » / « =/ » des taxons terminaux ignorés. Fichier à plusieurs arbres dont un seul étiqueté : importé d'office. Vérification sur `test-data/bootstrap_test.tre` (export TNT réel) dans `tests/formats.test.js`, jouée si le fichier est présent.
- Limites : seuls les arbres NEXUS du bloc `TREES` sont lus (pas de matrice). Les exports passent par un dialogue natif, non joué par le test de fumée (écrivain testé par `npm test`).
- Corrigé au passage : surcouche d'erreur « ResizeObserver loop » qui bloquait l'application en développement (ruban, phase 2) ; canevas qui passait sous le ruban et débordait sous la fenêtre (recadrage décalé).

**Décision : classifications alternatives par feuille.** Une feuille (racine + contenu jusqu'aux feuilles suivantes, qui y sont des liens) peut avoir plusieurs topologies ; la fiche d'une racine de feuille porte le menu « Classification » et le bouton « + Ajouter une classification alternative ». Limite assumée : déplacer un taxon d'une feuille à une autre demande de modifier les deux feuilles ; un taxon présent deux fois dans la vue composée est signalé, pas bloqué.
- Mode « glisser les divergences » le long des branches (décider le comportement en chronogramme : modifie l'âge ou verrouillé par les dates).
- Pinceau : colorier des branches (arêtes nœud → enfant) puis sélection.
- Surlignage des **noms de taxons sur l'arbre uniquement** (`text-background-color` Cytoscape → inclus dans les exports PNG/PDF).
- Import/export : Newick (.tre), NEXUS (.nex — couvre aussi Mesquite), TNT (`tread`, taxons parfois numérotés, supports via `ttags`). Bootstraps sur les nœuds ; option d'import « étiquettes internes = supports ou noms de clades ». Obtenir des fichiers TNT/Mesquite réels pour les tests.
- Export d'une branche en `.phylo` + copier-coller entre instances (même sérialisation, presse-papiers Electron avec format personnalisé).
- Chronogramme « sculpté » (diagramme en fuseau : nombre de taxons par tranche de temps dans un clade).
- UI multi-images, audio, classifications alternatives (bouton « + Ajouter une classification alternative » en haut de la fiche, menu déroulant Classification 1, 2…).

### Phase 4 — Confort visuel
**Avancement** (consignes : pas encore de logo animé, le logo fixe sert d'essai ; animations définitives fournies plus tard dans un dossier ; rendre le logiciel plus plaisant, animations fluides, sans l'air « application générée »).
- ✅ Logo transparent haute définition (`src/assets/brand/`, généré depuis `PT.png` par `tests/tools/make-logo.py`, variante aux traits clairs pour les surfaces sombres). Point d'entrée unique des médias de marque : `brand.ts` ; dossier `src/assets/animations/` (README : noms et formats attendus) pour brancher les animations.
- ✅ Hub d'accueil (`hub.ts`, HTML dans `utils.ts`) : nouveau document à partir d'un modèle cladogramme / dendrogramme / chronogramme (âges d'exemple pour ce dernier), ouvrir, projets récents en cartes avec miniature (première image de la fiche racine, réduite à l'enregistrement ; sinon logo du mode). Fichier › Accueil le rouvre (« Retour au document », Échap). Listes dessinées en cladogramme, aux couleurs de chaque thème.
- ✅ Projets récents : 6 au lieu de 3 ; le document n'est plus recopié dans le stockage local quand il a un chemin (relu sur le disque) ; fichier disparu signalé.
- ✅ Choix de la langue au premier lancement (aucune trace d'utilisation précédente).
- ✅ Écran de chargement (`loading.ts`) : au démarrage et à l'ouverture d'un fichier de plus de 400 Ko, aux couleurs du thème enregistré.
- ✅ Mouvements (`visual.ts`) : apparition du panneau du ruban, de la fiche (glisse depuis la droite), des menus et fenêtres ; menu Fichier en fondu ; retour au clic ; contour de focus ; barres de défilement fines aux couleurs du thème ; tout coupé si le système demande moins d'animations. Confirmations de réussite (enregistrement, copie 1.3, export de branche) en notifications discrètes au lieu d'alertes bloquantes.
- ✅ Retour d'essai : zone de clic élargie des divergences sans nom (`hitbox.ts`, dessin inchangé) ; nouveau document / modèles avec de vrais noms (avant : « [ Ramification sans nom ] » enregistré comme nom) et nom entièrement sélectionné à l'édition ; aperçu bleu du pinceau au survol ; cladogramme du hub en SVG calé sur les boutons, topologie ((Cladogramme, Dendrogramme), Chronogramme), chemin survolé allumé ; projets récents qui grossissent au survol.
- ✅ Nouveau thème « Muséum » (défaut des nouvelles installations) : papier chaud, encre bleu nuit, rouge du logo pour l'onglet actif, Bahnschrift + Sitka.
- ✅ Figure d'aide « Frise géologique » (`geo-chart.ts`, onglets Aide et Arbre › Chronogramme) : charte ICS 2026/06 détaillée (éons, ères, périodes, séries, étages aux couleurs officielles), âge de chaque base avec son incertitude, nature de la limite (80 clous d'or GSSP, 16 âges numériques GSSA, 22 limites non ratifiées — données `gts:ratifiedGSSP` / `gts:ratifiedGSSA` de la charte), recherche, détail d'une unité, « Voir dans le chronogramme » (cadrage de l'unité).
- Animations définitives : abandonnées (le logo fixe convient) ; `brand.ts` reste le point d'entrée si besoin.

- Hub d'accueil : fichiers récents (existe déjà dans `localStorage: cladistree_recents`) avec aperçu = première image de la fiche racine, sinon logo du mode de la dernière sauvegarde. **Générer une miniature à la sauvegarde** plutôt que relire les fichiers au lancement.
- Nouveau fichier à partir d'un modèle clado / phéno / chrono.
- Choix de la langue au premier lancement.
- Logo d'accueil animé, logos de chargement animés.
- Figures d'aide permanentes (frise chrono agrandie et détaillée, avec clous d'or) — après unification des âges.

### Phase 5 — Finitions
**Avancement**
- ✅ Bilan performances (arbre de test de 2 408 nœuds, mesures dans la vraie application, profils V8) :
  - caméra (déplacement, zoom) : 118 → 17 ms par image (8 → 60 images/s) — placement des images des fiches mis en cache (il ne dépend pas de la caméra ; recalculé avant à chaque image, ~70 % du temps) ;
  - mise en page standard : 450 → 70 ms ; Ctrl+B : 0,9 → 0,26 s ; suppression : 0,42 → 0,13 s — styles posés effacés seulement après un passage en chronogramme, données de dessin, positions et données du pinceau écrites seulement si elles changent, compteurs de genres / espèces linéaires ;
  - annulation : 0,94 → 0,40 s (et quasi instantanée pour une petite modification) — application différentielle de l'instantané (`applySnapshot`), instantanés sans champs recalculés ni décorations ; testé par `tests/undo.test.js` ;
  - chronogramme : une action (Ctrl+B, repli…) 2,1 → 0,3 s, annulation 3,1 → 1,1 s — style, position et données de chaque élément reposés seulement s'ils changent (`CHRONO_STYLE_SCRATCH`, layout-engine.ts) ;
  - restent lents sur très grand arbre : l'entrée dans le chronogramme (~1,5 s, tout est stylé une première fois) et l'ouverture (~1,5 s).
- ✅ Corrections de fin de phase : frise du chronogramme de nouveau posée au bas du canevas (remontée de 75 px depuis que `#app` respecte `bottom: 35px`) ; « phénogramme » → « dendrogramme » ; raccourcis & é " ' ( (1 à 5 hors AZERTY) pour le menu Fichier et les onglets ; notes de version 1.4 ; version 1.4.0 dans package.json (l'application affichait encore 1.3.4) ; le romérogramme ne ré-affiche plus une arête que le chronogramme avait masquée.
- ✅ Citation : `CITATION.cff` (GitHub « Cite this repository », lu par Zenodo) — prénom, ORCID, DOI et date à compléter à la première publication.
- ✅ Nouvelles langues : espagnol, portugais (européen, comme la charte ICS publiée au Portugal), italien, allemand (`src/locales/`) — 407 textes d'interface traduits à la main par langue, 175 noms d'unités géologiques générés par règle de suffixe des chartes nationales (es -iense, pt/it -iano, de -ium) + exceptions (`tests/tools/gen-geo-names.js`). Choix au premier lancement (6 langues) et dans les Paramètres ; repli sur l'anglais pour un texte absent (anciennes notes de version) ; deux-points selon la langue (`colonSep`). **À faire relire par des locuteurs**, en priorité les termes scientifiques (rangs, statuts UICN, noms d'étages).
- ✅ Ergonomie de dernière minute : ↑/↓ d'un taxon terminal à l'autre en dendrogramme ; fiche du taxon terminal précédent / suivant (← / → souris sur la fiche, boutons de l'en-tête) ; touche G pour déplacer la divergence sélectionnée ; une divergence ne peut plus passer à gauche de la barre verticale de son parent (branche retournée).
- ✅ Images dans le chronogramme pour tous les taxons (divergences comprises) : placées sans recouvrir barres, noms ni branches et sans changer les âges (abscisses) ; vérifié par le test de fumée (aucun chevauchement mesuré, abscisses identiques à l'arbre sans images). Au passage : un clade replié ou un renvoi de feuille ne réserve plus de lignes vides pour ses descendants cachés, et `cWidth` n'est plus réécrit deux fois par mise en page.
- Guide complet : rédigé par l'auteur, à part (le brouillon généré a été retiré).

- Gros bilan instabilités/performances (priorité : undo stack, mesure de texte, rendu des images).
- Nouvelles langues : portugais, espagnol, italien, allemand (à la fin, quand les textes sont stables ; relecture des termes scientifiques).
- Guide complet.
- Citation : `CITATION.cff` + DOI via l'intégration GitHub ↔ Zenodo à la publication.

### Reporté à 1.5 (recommandé)
- **Clé d'identification** : nouveau type de document (éditeur des caractères et de l'arborescence des choix, mode présentation, extension propre). Indépendante du reste et aussi lourde que la refonte du moteur.

## Décisions de conception

### Classifications alternatives
Mêmes taxons, placements différents. Problème : si chaque taxon stocke son parent, plusieurs classifications se contredisent, et les relations définies par la position relative s'effondrent.
Solution retenue :
- identité des taxons séparée de leur position (table de taxons + un arbre par classification) ;
- **ne jamais stocker les relations de position** (groupe frère, lignée, nombre de descendants) : elles sont recalculées depuis l'arbre actif ;
- un taxon peut être **absent** d'une classification (ex. groupe paraphylétique non reconnu) ; la fiche l'indique ;
- option avancée : définitions phylogénétiques (type PhyloCode, ex. « plus petit clade contenant A et B ») résolues dans chaque arbre, avec alerte si le contenu diffère ou si la définition ne désigne rien ;
- « Ajouter une classification » duplique l'arbre actif ; vue des différences entre classifications.

### Surlignage
Concerne uniquement les noms des taxons sur l'arbre (pas les notes des fiches).

## Questions ouvertes
- Extension du futur format de clé d'identification (1.5).
- Fichiers d'exemple Mesquite (avec bootstraps) à fournir pour les tests d'import. TNT : `test-data/bootstrap_test.tre` attendu pour les vérifications du fichier réel.
