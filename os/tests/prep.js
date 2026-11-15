// Préparation commune des tests : dossiers simulés (OPFS) à la place du sélecteur de dossier de Chrome
const PREP = () => {
  window.showDirectoryPicker = async (o) => (await navigator.storage.getDirectory()).getDirectoryHandle(o && o.id === 'eopur_onedrive' ? 'OneDrive_EOPUR_OS' : 'BASE', { create: true });
  FileSystemHandle.prototype.queryPermission = async () => 'granted'; FileSystemHandle.prototype.requestPermission = async () => 'granted';
  // Chromium sans écran ferme l'onglet quand il relit un dossier mémorisé dans IndexedDB : les dossiers sont gardés en mémoire pour le test
  window.__H = {}; const put = IDBObjectStore.prototype.put, get = IDBObjectStore.prototype.get, desc = Object.getOwnPropertyDescriptor(IDBRequest.prototype, 'result');
  IDBObjectStore.prototype.put = function (v, k) { if (v instanceof FileSystemHandle) { window.__H[k] = v; v = '__H:' + k; } return put.call(this, v, k); };
  IDBObjectStore.prototype.get = function (k) { const r = get.call(this, k); Object.defineProperty(r, 'result', { get() { const x = desc.get.call(r); return typeof x === 'string' && x.startsWith('__H:') ? window.__H[x.slice(4)] : x; } }); return r; };
};
module.exports = PREP;
