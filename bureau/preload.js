// Pont entre l'interface et le processus principal : la liste FERMÉE des actions permises,
// exposée sous window.appli. L'interface n'a aucun autre accès au système.
// Sans ce pont (page ouverte dans un navigateur), l'interface fonctionne en mode autonome
// (données dans le navigateur).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('appli', {
  config: () => ipcRenderer.invoke('config'),
  lireDonnees: () => ipcRenderer.invoke('lire-donnees'),
  ecrireDonnees: (donnees) => ipcRenderer.invoke('ecrire-donnees', donnees),
  cours: () => ipcRenderer.invoke('cours'),
  enregistrerCapture: (octets, type) => ipcRenderer.invoke('enregistrer-capture', octets, type),
  annonces: (forcer) => ipcRenderer.invoke('annonces', forcer),
  exporter: () => ipcRenderer.invoke('exporter'),
  importer: () => ipcRenderer.invoke('importer'),
  verifierMaj: () => ipcRenderer.invoke('verifier-maj'),
  ouvrirLien: (url) => ipcRenderer.invoke('ouvrir-lien', url),
  surDonneesChangees: (fn) => ipcRenderer.on('donnees-changees', () => fn()),
});
