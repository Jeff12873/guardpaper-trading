// Annonces économiques : flux public ForexFactory / Fair Economy (semaine en cours, non officiel).
// Règles : au plus une requête par heure (cache en mémoire ET sur disque, pour ne pas marteler la
// source même en relançant l'appli) ; si la source est coupée, on rend le dernier cache avec l'erreur.
//
// Mode simulé (tests) : GUARDPAPER_ANNONCES=<fichier JSON au format du flux> → aucun accès réseau.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { ecrireAtomique } = require('./coffre');

const URL_FLUX = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
const DUREE_CACHE = 60 * 60 * 1000;                 // 1 h
const DEVISES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];

// Ne garde que ce qui sert : événements datés des 8 devises des paires suivies
function nettoyer(brut) {
  if (!Array.isArray(brut)) throw new Error('Réponse inattendue du calendrier.');
  return brut
    .filter(e => e && DEVISES.includes(e.country) && typeof e.date === 'string' && !isNaN(Date.parse(e.date)))
    .map(e => ({ title: String(e.title || ''), country: e.country, date: e.date, impact: String(e.impact || '') }));
}

function creer({ dossierCache, fetch }) {
  const FICHIER_CACHE = path.join(dossierCache, 'annonces-cache.json');
  let cache = null;                                   // { recupere: ms, evenements: [...] }
  let enCours = null;
  let echec = null;                                   // { quand: ms, erreur } : on ne réessaie pas avant 15 min

  async function lireCacheDisque() {
    try { const c = JSON.parse(await fsp.readFile(FICHIER_CACHE, 'utf8')); if (Array.isArray(c.evenements)) return c; } catch { /* pas de cache */ }
    return null;
  }

  async function telecharger() {
    if (process.env.GUARDPAPER_ANNONCES) return nettoyer(JSON.parse(await fsp.readFile(process.env.GUARDPAPER_ANNONCES, 'utf8')));
    const r = await fetch(URL_FLUX, { headers: { 'User-Agent': 'GuardPaperTrading' } });
    if (!r.ok) throw new Error(r.status === 429 ? 'trop de requêtes, la source demande d\'attendre' : `HTTP ${r.status}`);
    return nettoyer(await r.json());
  }

  // Renvoie { evenements, recupere, erreur? } ; forcer = ignorer l'âge du cache (jamais plus d'1 fois/5 min)
  async function obtenir(forcer = false) {
    if (!cache) cache = await lireCacheDisque();
    const age = cache ? Date.now() - cache.recupere : Infinity;
    if (cache && (age < DUREE_CACHE && !(forcer && age > 5 * 60 * 1000))) return cache;
    if (echec && Date.now() - echec.quand < 15 * 60 * 1000) return cache ? { ...cache, erreur: echec.erreur } : { recupere: null, evenements: [], erreur: echec.erreur };
    if (!enCours) enCours = (async () => {
      try {
        const evenements = await telecharger();
        cache = { recupere: Date.now(), evenements }; echec = null;
        await fsp.mkdir(dossierCache, { recursive: true });
        await ecrireAtomique(FICHIER_CACHE, JSON.stringify(cache));
        return cache;
      } catch (e) {
        const erreur = `Calendrier indisponible (${e.message}).`;
        echec = { quand: Date.now(), erreur };
        return cache ? { ...cache, erreur } : { recupere: null, evenements: [], erreur };
      } finally { enCours = null; }
    })();
    return enCours;
  }

  return { obtenir };
}

module.exports = { creer, nettoyer, DEVISES, URL_FLUX };
