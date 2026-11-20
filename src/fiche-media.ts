// ==========================================
// FICHE DU TAXON : IMAGES MULTIPLES ET SON (phase 3)
// ==========================================
// Images : la PREMIÈRE illustration reste `sheetImage` (+ `sheetImageRatio`, crédits `imgCredits`) pour
// que l'export PDF de la fiche et la copie 1.3 continuent de fonctionner ; les suivantes sont dans
// `extraImages` ({ asset, role: 'sheet', ratio, credits, name }), déjà prévu par le format v2.
// Les crédits suivent l'image affichée.
//
// Son : `audio` = { path, name }, chemin RELATIF au fichier .phylo quand c'est possible (le son
// n'est ni copié dans le fichier ni exporté). Choisi par un dialogue natif (Electron ne donne plus le
// chemin d'un <input type="file">) et lu via read-file-direct (une page servie par le serveur de
// développement ne peut pas charger file:///).

import { state } from './graph-state';
import { t } from './i18n';
import { toAssetRef, resolveAsset } from './asset-store';
import { getImageRatio } from './utils';
import type { AppContext } from './app-context';

type FicheImage = { asset: string; role?: string; ratio?: number; credits?: string; name?: string };

// --- Chemins (Windows ou POSIX), sans module Node dans le rendu
const isAbsolutePath = (p: string) => /^([a-zA-Z]:[\\/]|\\\\|\/)/.test(p);
const splitPath = (p: string) => p.replace(/\\/g, '/').split('/').filter(s => s !== '');
const dirOf = (p: string) => p.replace(/[\\/][^\\/]*$/, '');
/** Chemin de `target` relatif au dossier `fromDir`, ou null si impossible (autre lecteur). */
export const relativePath = (fromDir: string, target: string): string | null => {
    const a = splitPath(fromDir), b = splitPath(target);
    const win = /^[a-zA-Z]:/.test(a[0] || '');
    if (!a.length || !b.length || (win ? a[0].toLowerCase() !== b[0].toLowerCase() : false)) return null;
    let i = 0;
    while (i < a.length && i < b.length && (win ? a[i].toLowerCase() === b[i].toLowerCase() : a[i] === b[i])) i++;
    if (i === 0) return null;
    return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/');
};
export const resolveMediaPath = (stored: string, docPath?: string): string => {
    if (isAbsolutePath(stored) || !docPath) return stored;
    const parts = [...splitPath(dirOf(docPath)), ...splitPath(stored)];
    const out: string[] = [];
    parts.forEach(p => { if (p === '..') out.pop(); else if (p !== '.') out.push(p); });
    const prefix = docPath.startsWith('/') ? '/' : '';
    return prefix + out.join(docPath.includes('\\') ? '\\' : '/');
};
const AUDIO_TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', aac: 'audio/aac', flac: 'audio/flac', webm: 'audio/webm' };

export function initFicheMedia(ctx: AppContext) {
  const { ui } = ctx;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const credits = ui.formInputs.imgCredits as HTMLInputElement;
  const gallery = $('fiche-gallery');
  const mainBtn = $<HTMLButtonElement>('btn-image-main');
  let current = 0;

  const node = () => (state.activeNode && !state.activeNode.hasClass('box') ? state.activeNode : null);
  /** Toutes les illustrations de la fiche, la principale en premier. */
  const imagesOf = (n: any): FicheImage[] => {
      const list: FicheImage[] = [];
      if (n.data('sheetImage')) list.push({ asset: n.data('sheetImage'), ratio: n.data('sheetImageRatio'), credits: n.data('imgCredits') || '' });
      ((n.data('extraImages') || []) as FicheImage[]).filter(i => i && i.asset && i.role !== 'tree').forEach(i => list.push(i));
      return list;
  };
  const otherExtras = (n: any) => ((n.data('extraImages') || []) as FicheImage[]).filter(i => i && i.role === 'tree');
  /** Réécrit la liste : la première devient l'illustration principale, les autres vont dans extraImages. */
  const writeImages = (n: any, list: FicheImage[]) => {
      const [main, ...rest] = list;
      if (main) {
          n.data('sheetImage', main.asset);
          if (main.ratio) n.data('sheetImageRatio', main.ratio); else n.removeData('sheetImageRatio');
          n.data('imgCredits', main.credits || '');
      } else {
          n.data('sheetImage', '');
          n.removeData('sheetImageRatio');
          n.data('imgCredits', '');
      }
      const extras = [...rest.map(i => ({ ...i, role: 'sheet' })), ...otherExtras(n)];
      if (extras.length) n.data('extraImages', extras); else n.removeData('extraImages');
  };

  const renderImages = (n: any) => {
      const list = imagesOf(n);
      if (current >= list.length) current = Math.max(0, list.length - 1);
      const shown = list[current];
      ui.previewSheetImage.src = shown ? resolveAsset(shown.asset) : '';
      ui.previewSheetImage.style.display = shown ? 'block' : 'none';
      ui.btnClearSheetImage.style.display = shown ? 'block' : 'none';
      credits.style.display = shown ? 'block' : 'none';
      const creditsLabel = $('lbl-img-credits');
      if (creditsLabel) creditsLabel.style.display = shown ? 'block' : 'none';
      credits.value = shown ? (shown.credits || '') : '';
      // Crédits d'une image secondaire : gérés ici, pas par le champ de fiche générique (side-panel.ts).
      if (current > 0) credits.dataset.extra = '1'; else delete credits.dataset.extra;
      ui.btnUploadSheetImage.innerText = list.length ? t('media.add_image') : t('btn.upload_illus');
      if (mainBtn) mainBtn.style.display = current > 0 ? 'block' : 'none';
      if (gallery) {
          gallery.innerHTML = '';
          gallery.style.display = list.length > 1 ? 'flex' : 'none';
          list.forEach((img, i) => {
              const th = document.createElement('img');
              th.src = resolveAsset(img.asset);
              th.title = i === 0 ? t('media.main_image') : (img.credits || '');
              th.style.cssText = `width:44px; height:44px; object-fit:cover; cursor:pointer; border-radius:3px; border:2px solid ${i === current ? '#2196F3' : 'var(--border-color)'};`;
              th.onclick = () => { current = i; renderImages(n); };
              gallery.appendChild(th);
          });
      }
  };

  ui.btnUploadSheetImage.onclick = () => ui.inpSheetImageFile.click();
  ui.inpSheetImageFile.onchange = (e: any) => {
      const file = e.target.files?.[0];
      const n = node();
      if (file && n) {
          const reader = new FileReader();
          reader.onload = async (ev) => {
              const base64 = ev.target?.result as string;
              const ratio = await getImageRatio(base64);
              ctx.saveState();
              const list = imagesOf(n);
              list.push({ asset: toAssetRef(base64), role: 'sheet', ratio, credits: '', name: file.name });
              writeImages(n, list);
              current = list.length - 1;
              renderImages(n);
              ctx.setUnsavedState(true);
          };
          reader.readAsDataURL(file);
      }
      ui.inpSheetImageFile.value = '';
  };
  /** Supprime l'image AFFICHÉE ; si c'était la principale, la suivante prend sa place. */
  ui.btnClearSheetImage.onclick = () => {
      const n = node();
      if (!n) return;
      const list = imagesOf(n);
      if (!list[current]) return;
      ctx.saveState();
      list.splice(current, 1);
      writeImages(n, list);
      current = Math.min(current, list.length - 1);
      renderImages(n);
      ctx.setUnsavedState(true);
  };
  mainBtn?.addEventListener('click', () => {
      const n = node();
      if (!n || current === 0) return;
      const list = imagesOf(n);
      ctx.saveState();
      const [img] = list.splice(current, 1);
      list.unshift(img);
      writeImages(n, list);
      current = 0;
      renderImages(n);
      ctx.setUnsavedState(true);
  });
  credits.addEventListener('change', () => {
      const n = node();
      if (!n || current === 0) return; // la principale : champ de fiche générique
      const list = imagesOf(n);
      if (!list[current]) return;
      list[current] = { ...list[current], credits: credits.value };
      writeImages(n, list);
      ctx.setUnsavedState(true);
  });

  // --- Son
  const audioInfo = $('audio-info');
  const player = $<HTMLAudioElement>('audio-player');
  const clearAudioBtn = $<HTMLButtonElement>('btn-audio-clear');
  const releasePlayer = () => {
      if (player) { player.pause(); player.removeAttribute('src'); player.load(); player.style.display = 'none'; }
  };
  const renderAudio = async (n: any) => {
      releasePlayer();
      const audio = n.data('audio') as { path: string; name?: string } | undefined;
      if (clearAudioBtn) clearAudioBtn.style.display = audio ? 'block' : 'none';
      if (!audioInfo) return;
      audioInfo.style.color = '';
      if (!audio) { audioInfo.textContent = ''; return; }
      audioInfo.textContent = audio.name || audio.path;
      audioInfo.title = audio.path;
      const full = resolveMediaPath(audio.path, state.currentFilePath);
      const res = await window.electronAPI.readFileDirect(full);
      if (node() !== n) return; // une autre fiche a été ouverte entre-temps
      if (!res.success || !res.data) {
          audioInfo.textContent = t('media.audio_missing') + ' ' + audio.path;
          audioInfo.style.color = '#d32f2f';
          return;
      }
      const ext = (full.split('.').pop() || '').toLowerCase();
      // URL « data: » et non « blob: » : Chromium refuse de lire un son depuis une URL blob dans cette
      // fenêtre (« Media load rejected by URL safety check »).
      const blob = new Blob([res.data as any], { type: AUDIO_TYPES[ext] || 'audio/mpeg' });
      const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
      });
      if (node() !== n) return;
      if (player) { player.src = dataUrl; player.style.display = 'block'; }
  };
  $('btn-audio-pick')?.addEventListener('click', async () => {
      const n = node();
      if (!n) return;
      const res = await window.electronAPI.pickAudio();
      if (!res.success || !res.filePath) return;
      // Relatif au fichier .phylo s'il est déjà enregistré ; sinon absolu (à relier après enregistrement).
      const rel = state.currentFilePath ? relativePath(dirOf(state.currentFilePath), res.filePath) : null;
      ctx.saveState();
      n.data('audio', { path: rel || res.filePath, name: res.fileName });
      ctx.setUnsavedState(true);
      renderAudio(n);
  });
  clearAudioBtn?.addEventListener('click', () => {
      const n = node();
      if (!n || !n.data('audio')) return;
      ctx.saveState();
      n.removeData('audio');
      ctx.setUnsavedState(true);
      renderAudio(n);
  });

  /** Appelé à l'ouverture de la fiche (side-panel.ts). */
  const renderFicheMedia = (n: any) => { current = 0; renderImages(n); renderAudio(n); };
  return { renderFicheMedia };
}
