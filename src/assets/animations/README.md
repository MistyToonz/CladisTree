# Animations de CladisTree

Déposer ici les animations définitives ; elles seront branchées dans `src/brand.ts` (seul fichier à modifier).

| Fichier attendu | Rôle | Où il apparaît |
|---|---|---|
| `hub.*` | logo animé du hub d'accueil | en-tête du hub (zone carrée d'environ 96 px) |
| `loading.*` | animation de chargement | écran de démarrage et ouverture d'un gros fichier (zone carrée d'environ 120 px) |

Si une variante pour les thèmes sombres est nécessaire (traits clairs), la nommer `hub-dark.*` / `loading-dark.*`.

## Formats acceptés
- **Vidéo** : `.webm` (recommandé, avec transparence VP9) ou `.mp4` — lue en boucle, sans son.
- **Image animée** : `.gif`, `.webp` animé, `.png` animé (APNG) ou `.svg` animé.

Fond transparent conseillé : le hub et l'écran de chargement prennent la couleur du thème choisi.
Pour l'instant, ces emplacements affichent le logo fixe (`src/assets/brand/logo-512.png`).
