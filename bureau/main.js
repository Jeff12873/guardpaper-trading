// Processus principal (Electron) : la seule partie qui touche au système.
// Il ouvre la fenêtre, sert l'interface (index.html) par le protocole app://, lit et écrit le fichier
// de données, et expose à l'interface une liste fermée d'actions (voir preload.js).
//
// Rien de personnel dans l'application ni dans le dépôt : les trades et réglages vivent dans
// ~/.local/share/<nom>/donnees.json (variable GUARDPAPER_DONNEES pour un autre fichier, ex. tests).

const { app, BrowserWindow, protocol, net, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { ecrireAtomique } = require('./coffre');
const Calculs = require('../calculs.js');
const Annonces = require('./annonces');
const PAQUET = require('../package.json');

const NOM = PAQUET.productName;
const SCHEMA = PAQUET.name;                                   // app://<nom>/index.html
const RACINE = path.join(__dirname, '..');
const FORMAT = `${SCHEMA}/1`;
// Liste des versions publiées par le dépôt Flatpak (une ligne « dépôt vX.Y.Z » par application)
const URL_VERSIONS = 'https://jeff12873.github.io/FlatKein/versions.txt';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

// --- Fichier de données ---------------------------------------------------------------------
// Dans le Flatpak, XDG_DATA_HOME pointe vers ~/.var/app/… : on vise le vrai ~/.local/share de l'hôte.
const DOSSIER_DONNEES = process.env.HOST_XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
const FICHIER = process.env.GUARDPAPER_DONNEES || path.join(DOSSIER_DONNEES, SCHEMA, 'donnees.json');
const SECOURS = FICHIER.replace(/\.json$/, '') + '.avant-import.json';

async function lireFichier() {
  try { return JSON.parse(await fsp.readFile(FICHIER, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return null; throw new Error(`Fichier de données illisible (${FICHIER}) : ${e.message}`); }
}
let dernierEcrit = 0;
async function ecrireFichier(donnees) {
  const propre = Calculs.validerDonnees(donnees);           // jamais de données incohérentes sur le disque
  await fsp.mkdir(path.dirname(FICHIER), { recursive: true });
  dernierEcrit = Date.now();
  await ecrireAtomique(FICHIER, JSON.stringify({ format: FORMAT, ...propre }, null, 2));
}

// Calendrier économique : cache à côté du fichier de données (une requête par heure au plus)
const annonces = Annonces.creer({ dossierCache: path.dirname(FICHIER), fetch: (...a) => net.fetch(...a) });

// --- Actions offertes à l'interface (IPC) --------------------------------------------------

ipcMain.handle('config', () => ({ version: app.getVersion(), nom: NOM, fichier: FICHIER }));
ipcMain.handle('lire-donnees', () => lireFichier());
ipcMain.handle('annonces', (evenement, forcer) => annonces.obtenir(forcer === true));
ipcMain.handle('ecrire-donnees', async (evenement, donnees) => { await ecrireFichier(donnees); return true; });

// Export : copie JSON lisible où l'utilisateur veut
ipcMain.handle('exporter', async (evenement) => {
  const date = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(evenement.sender), {
    title: 'Exporter le journal', defaultPath: path.join(app.getPath('downloads'), `${SCHEMA}-${date}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return null;
  const donnees = (await lireFichier()) || { settings: Calculs.DEFAUTS, trades: [] };
  await ecrireAtomique(filePath, JSON.stringify({ ...donnees, format: FORMAT }, null, 2));
  return filePath;
});

// Import : remplace les données, après une copie de secours de l'ancien fichier
ipcMain.handle('importer', async (evenement) => {
  const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(evenement.sender), {
    title: 'Importer un journal', defaultPath: app.getPath('downloads'), properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths[0]) return null;
  let brut;
  try { brut = JSON.parse(await fsp.readFile(filePaths[0], 'utf8')); } catch { throw new Error("Ce fichier n'est pas du JSON lisible."); }
  const propre = Calculs.validerDonnees(brut);
  const avaitDonnees = fs.existsSync(FICHIER);
  if (avaitDonnees) await fsp.copyFile(FICHIER, SECOURS);
  await ecrireFichier(propre);
  return { trades: propre.trades.length, secours: avaitDonnees ? SECOURS : null };
});

// Vérification des mises à jour : compare la version installée à la dernière publiée
const nums = (v) => String(v || '').replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
const plusRecente = (a, b) => { const x = nums(a), y = nums(b); for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0; } return false; };
ipcMain.handle('verifier-maj', async () => {
  const actuelle = app.getVersion();
  if (!app.isPackaged && !process.env.FAUSSE_MAJ) return { actuelle, derniere: actuelle, nouvelle: false };
  try {
    const r = await net.fetch(URL_VERSIONS, { cache: 'no-store' });
    if (!r.ok) return { actuelle, erreur: `HTTP ${r.status}` };
    const l = (await r.text()).split('\n').find(x => x.startsWith(PAQUET.flatpak.depot + ' '));
    const derniere = process.env.FAUSSE_MAJ || (l ? l.split(' ')[1].replace(/^v/, '') : actuelle);
    return { actuelle, derniere, nouvelle: plusRecente(derniere, actuelle), commande: `flatpak update --user ${PAQUET.flatpak.id}` };
  } catch (e) { return { actuelle, erreur: e.message }; }
});

ipcMain.handle('ouvrir-lien', (evenement, url) => { if (/^https:\/\//.test(String(url))) shell.openExternal(url); });

// --- Suivi en direct : prévient l'interface quand le fichier change ailleurs (synchro, éditeur) ---

let minuterie = null;
function surveiller() {
  try {
    fs.mkdirSync(path.dirname(FICHIER), { recursive: true });
    fs.watch(path.dirname(FICHIER), (type, nom) => {
      if (nom !== path.basename(FICHIER) || Date.now() - dernierEcrit < 1500) return;
      clearTimeout(minuterie); minuterie = setTimeout(() => BrowserWindow.getAllWindows().forEach(w => w.webContents.send('donnees-changees')), 250);
    });
  } catch { /* dossier inaccessible : pas de suivi en direct */ }
}

// --- Fenêtre ----------------------------------------------------------------------------

function servirFichiers() {
  protocol.handle('app', requete => {
    const fichier = path.normalize(path.join(RACINE, decodeURIComponent(new URL(requete.url).pathname)));
    if (!fichier.startsWith(RACINE + path.sep)) return new Response('Interdit', { status: 403 });
    return net.fetch(pathToFileURL(fichier).toString());
  });
}

function creerFenetre() {
  const fenetre = new BrowserWindow({
    width: 1280, height: 900, minWidth: 800, minHeight: 520, title: NOM,
    icon: path.join(__dirname, 'icone.png'), backgroundColor: '#f3f5f8', autoHideMenuBar: true,
    show: !process.env.CAPTURE,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  // Liens externes : dans le navigateur, jamais dans la fenêtre de l'application
  fenetre.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  fenetre.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(`app://${SCHEMA}/`)) { e.preventDefault(); if (/^https:\/\//.test(url)) shell.openExternal(url); } });
  fenetre.loadURL(`app://${SCHEMA}/index.html`);
  if (process.env.CAPTURE) capturer(fenetre, process.env.CAPTURE);
}

// Tests : CAPTURE=/chemin/ecran.png [SCRIPT=/chemin/test.js] → exécute le script dans la page,
// affiche son résultat, enregistre une capture puis quitte.
function capturer(fenetre, sortie) {
  fenetre.webContents.on('console-message', ({ level, message }) => console.log(`[console:${level}] ${message}`));
  fenetre.webContents.on('did-finish-load', () => setTimeout(async () => {
    if (process.env.SCRIPT) {
      try { console.log('[script]', JSON.stringify(await fenetre.webContents.executeJavaScript(fs.readFileSync(process.env.SCRIPT, 'utf8')))); }
      catch (e) { console.log('[script] erreur', e.message); }
      await new Promise(r => setTimeout(r, 800));
    }
    await fsp.writeFile(sortie, (await fenetre.webContents.capturePage()).toPNG());
    console.log(`Capture : ${sortie}`); app.quit();
  }, 1500));
}

app.setName(NOM);
app.whenReady().then(() => { servirFichiers(); creerFenetre(); surveiller(); });
app.on('window-all-closed', () => app.quit());
