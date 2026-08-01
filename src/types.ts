export interface Taxon {
  id: string;          // Un identifiant unique (ex: "theropoda-001")
  name: string;        // Le nom scientifique
  parentId: string | null; // L'ID du parent (null si c'est la racine de l'arbre)
  isExtinct: boolean;  // Statut de survie
  notes: string;       // Le contenu du panneau latéral
  imageUrl?: string;   // Lien vers une image locale
  sheetId: string;     // Sur quelle "feuille" se trouve ce taxon
}