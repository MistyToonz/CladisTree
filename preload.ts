import { contextBridge, ipcRenderer } from 'electron';

// Version injectée par le processus principal via additionalArguments.
// Lue ici une fois pour toutes : l'interface y accède sans appel asynchrone.
const versionArg = process.argv.find(a => a.startsWith('--app-version='));
const APP_VERSION = versionArg ? versionArg.slice('--app-version='.length) : '';

// On expose une API personnalisée dans l'objet global 'window'
contextBridge.exposeInMainWorld('electronAPI', {
  // Fonction pour sauvegarder un fichier
  saveFile: (data: string, filePath?: string) => ipcRenderer.invoke('save-file', data, filePath),
  
  // Fonction pour ouvrir un fichier
  openFile: () => ipcRenderer.invoke('open-file'),

  // --- NOUVEAUTÉS POUR LE DOUBLE-CLIC ---
  
  // Écouteur pour recevoir le chemin du fichier envoyé par l'OS
  onOpenFileFromOS: (callback: (filePath: string) => void) => {
      ipcRenderer.on('open-file-from-os', (_event, filePath) => callback(filePath));
  },
  
  // Fonction pour lire le fichier directement grâce au chemin reçu
  readFileDirect: (filePath: string) => ipcRenderer.invoke('read-file-direct', filePath),

  saveExport: (data: string, defaultName: string, ext: string) => ipcRenderer.invoke('save-export', data, defaultName, ext),
  openNewInstance: () => ipcRenderer.send('open-new-instance'),

  // --- Mises à jour ---
  appVersion: APP_VERSION,
  checkForUpdate: () => ipcRenderer.invoke('check-update'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url)
});