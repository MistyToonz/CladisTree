import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

if (require('electron-squirrel-startup')) {
  app.quit();
}

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

// 1. Déclaration globale pour accéder à la fenêtre depuis les événements OS
let mainWindow: BrowserWindow | null = null;
let macFilePathToLoad: string | null = null;

// 2. Écouteur macOS (doit être déclaré avant le 'ready')
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('open-file-from-os', filePath);
  } else {
    macFilePathToLoad = filePath;
  }
});

const createWindow = (): void => {
  Menu.setApplicationMenu(null);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'CladisTree',
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
      // La version du package.json est passee en argument au preload.
      // L'interface peut ainsi l'afficher de facon synchrone, sans
      // aller-retour IPC, et il n'existe plus qu'une seule source de verite.
      additionalArguments: [`--app-version=${app.getVersion()}`],
    },
  });

mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  
  // mainWindow.webContents.openDevTools(); // Décommente pour le debug

  // --- ACTIVATION DU CORRECTEUR ORTHOGRAPHIQUE NATIF ---
  mainWindow.webContents.session.setSpellCheckerLanguages(['fr', 'en-US']);

  // Création d'un menu clic droit natif uniquement pour les zones de texte
  mainWindow.webContents.on('context-menu', (event, params) => {
    // Si l'utilisateur fait un clic droit dans une zone où il peut taper du texte
    if (params.isEditable) {
      const template: any[] = [];
      
      // S'il y a des suggestions de correction orthographique
      if (params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          template.push({
            label: suggestion,
            click: () => mainWindow?.webContents.replaceMisspelling(suggestion)
          });
        }
        template.push({ type: 'separator' });
      } else if (params.misspelledWord) {
        template.push({ label: 'Aucune suggestion', enabled: false });
        template.push({ type: 'separator' });
      }
      
      // Outils classiques de texte
      template.push({ role: 'cut', label: 'Couper' });
      template.push({ role: 'copy', label: 'Copier' });
      template.push({ role: 'paste', label: 'Coller' });
      
      Menu.buildFromTemplate(template).popup({ window: mainWindow! });
    }
  });
  // -----------------------------------------------------

  // 3. Envoi du fichier à l'interface une fois chargée
  mainWindow.webContents.on('did-finish-load', () => {
    let fileToOpen = macFilePathToLoad;
    
    // Si on est sur Windows/Linux, on cherche dans les arguments de lancement
    if (!fileToOpen && process.platform !== 'darwin') {
      fileToOpen = process.argv.find(arg => arg.endsWith('.phylo') || arg.endsWith('.json') || arg.endsWith('.xmind')) || null;
    }

    if (fileToOpen && mainWindow) {
      mainWindow.webContents.send('open-file-from-os', fileToOpen);
      macFilePathToLoad = null; 
    }
  });
};

app.on('ready', () => {
  createWindow();

  // --- CANAL DE SAUVEGARDE NATIVE ---
  ipcMain.handle('save-file', async (event, data: string, filePath?: string) => {
    let targetPath = filePath;

    if (!targetPath) {
      const { canceled, filePath: newPath } = await dialog.showSaveDialog({
        title: 'Sauvegarder la phylogénie',
        defaultPath: 'Arbre_Phylogenetique.phylo',
        filters: [
          { name: 'Fichiers Phylo', extensions: ['phylo', 'json'] },
          { name: 'Tous les fichiers', extensions: ['*'] }
        ]
      });

      if (canceled || !newPath) {
        return { success: false, canceled: true };
      }
      targetPath = newPath;
    }

    try {
      fs.writeFileSync(targetPath, data, 'utf-8');
      return { success: true, filePath: targetPath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // --- CANAL D'OUVERTURE NATIVE VIA DIALOGUE ---
  ipcMain.handle('open-file', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Ouvrir une phylogénie',
      properties: ['openFile'],
      filters: [
        { name: 'Projets supportés', extensions: ['phylo', 'json', 'xmind'] },
        { name: 'Tous les fichiers', extensions: ['*'] }
      ]
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const targetPath = filePaths[0];
    try {
      const buffer = fs.readFileSync(targetPath);
      return { 
          success: true, 
          filePath: targetPath, 
          fileName: path.basename(targetPath),
          data: buffer 
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // --- NOUVEAU : CANAL D'OUVERTURE DIRECTE (Pour le double-clic) ---
  ipcMain.handle('read-file-direct', async (event, filePath: string) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return { 
          success: true, 
          filePath: filePath, 
          fileName: path.basename(filePath),
          data: buffer 
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
});

// --- NOUVEAU : CANAL D'EXPORT NATIVE (Images, PDF, CSV) ---
  ipcMain.handle('save-export', async (event, data: string, defaultName: string, ext: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Exporter',
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }, { name: 'Tous les fichiers', extensions: ['*'] }]
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    try {
      if (ext === 'svg' || ext === 'csv') {
        fs.writeFileSync(filePath, data, 'utf-8');
      } else {
        // Pour PNG, JPEG, PDF (qui arrivent du front-end sous forme de Base64)
        const base64Data = data.replace(/^data:.*?;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(filePath, buffer);
      }
      return { success: true, filePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // --- VÉRIFICATION DES MISES À JOUR ---
  // La requête part du processus principal, pas de l'interface : pas de
  // question de CORS ni de politique de sécurité de contenu, et la clé de
  // l'API resterait hors de portée du renderer si elle devenait nécessaire.
  const GITHUB_LATEST_RELEASE = 'https://api.github.com/repos/MistyToonz/CladisTree/releases/latest';

  ipcMain.handle('check-update', async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(GITHUB_LATEST_RELEASE, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/vnd.github+json',
          // GitHub refuse les requêtes sans User-Agent.
          'User-Agent': `CladisTree/${app.getVersion()}`
        }
      });
      // 404 = aucune release publiée, 403 = quota atteint. Dans les deux cas
      // on repart sans rien dire : une vérification ne doit jamais déranger.
      if (!res.ok) return { success: false, status: res.status };
      const data: any = await res.json();
      return {
        success: true,
        version: String(data.tag_name || '').replace(/^v/i, '').trim(),
        url: typeof data.html_url === 'string' ? data.html_url : '',
        name: typeof data.name === 'string' ? data.name : '',
        publishedAt: typeof data.published_at === 'string' ? data.published_at : ''
      };
    } catch (error: any) {
      return { success: false, error: error?.message };
    } finally {
      clearTimeout(timer);
    }
  });

  // --- OUVERTURE D'UN LIEN DANS LE NAVIGATEUR DU SYSTÈME ---
  // Liste blanche : un canal IPC qui ouvrirait n'importe quelle URL serait une
  // porte d'entrée si du contenu non maîtrisé arrivait un jour dans l'arbre.
  const ALLOWED_UPDATE_HOSTS = new Set(['mistytoonz.github.io', 'github.com', 'www.github.com']);

  ipcMain.handle('open-external', async (event, url: string) => {
    try {
      const target = new URL(url);
      if (target.protocol !== 'https:' || !ALLOWED_UPDATE_HOSTS.has(target.hostname)) {
        return { success: false, error: 'blocked' };
      }
      await shell.openExternal(target.toString());
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error?.message };
    }
  });

  // --- NOUVEAU : CRÉER UNE NOUVELLE INSTANCE (FENÊTRE) ---
  ipcMain.on('open-new-instance', () => {
    createWindow();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});