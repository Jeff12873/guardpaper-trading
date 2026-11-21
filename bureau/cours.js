// Cours de change journaliers : fixings de la BCE via l'API publique Frankfurter (sans clé).
// Sert à la corrélation entre paires (règle R6) et au cours EUR/USD de conversion automatique.
// Premier lancement : tout l'historique depuis 2010 en une requête (Replay) ; ensuite seulement les
// nouveaux jours, au plus une fois par heure ; après un échec, pas de nouvel essai avant 15 min.
//
// Mode simulé (tests) : GUARDPAPER_COURS=<fichier JSON {taux: {"AAAA-MM-JJ": {USD:…, GBP:…}}}>.

const fsp = require('node:fs/promises');
const path = require('node:path');
const { ecrireAtomique } = require('./coffre');

const API = 'https://api.frankfurter.dev/v1';
const DEVISES = ['USD', 'GBP', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
const DEBUT = '2010-01-01';
const HEURE = 60 * 60 * 1000;

const jourISO = (ms) => new Date(ms).toISOString().slice(0, 10);

function creer({ dossierCache, fetch }) {
  const FICHIER = path.join(dossierCache, 'cours-cache.json');
  let cache = null;                  // { recupere: ms, taux: { date: {USD,…} } }
  let echec = null, enCours = null;

  async function lireDisque() {
    try { const c = JSON.parse(await fsp.readFile(FICHIER, 'utf8')); if (c && c.taux) return c; } catch { /* aucun cache */ }
    return null;
  }

  async function telecharger(depuis) {
    const url = `${API}/${depuis}..${jourISO(Date.now())}?base=EUR&symbols=${DEVISES.join(',')}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'GuardPaperTrading' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    if (!d || typeof d.rates !== 'object') throw new Error('réponse inattendue');
    const taux = {};
    for (const [date, t] of Object.entries(d.rates)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && DEVISES.every(c => isFinite(t[c]) && t[c] > 0)) taux[date] = t;
    }
    return taux;
  }

  // Renvoie { taux, recupere, derniere, erreur? }
  async function obtenir() {
    if (process.env.GUARDPAPER_COURS) {
      const c = JSON.parse(await fsp.readFile(process.env.GUARDPAPER_COURS, 'utf8'));
      const dates = Object.keys(c.taux).sort();
      return { taux: c.taux, recupere: Date.now(), derniere: dates[dates.length - 1] };
    }
    if (!cache) cache = await lireDisque();
    const resultat = (erreur) => {
      const dates = cache ? Object.keys(cache.taux).sort() : [];
      return { taux: cache ? cache.taux : {}, recupere: cache ? cache.recupere : null, derniere: dates[dates.length - 1] || null, ...(erreur ? { erreur } : {}) };
    };
    if (cache && Date.now() - cache.recupere < HEURE) return resultat();
    if (echec && Date.now() - echec.quand < 15 * 60 * 1000) return resultat(echec.erreur);
    if (!enCours) enCours = (async () => {
      try {
        const dates = cache ? Object.keys(cache.taux).sort() : [];
        // On repart 7 jours avant la dernière date connue (corrections éventuelles de la source)
        const depuis = dates.length ? jourISO(Date.parse(dates[dates.length - 1]) - 7 * 86400000) : DEBUT;
        const nouveaux = await telecharger(depuis);
        cache = { recupere: Date.now(), taux: { ...(cache ? cache.taux : {}), ...nouveaux } };
        echec = null;
        await fsp.mkdir(dossierCache, { recursive: true });
        await ecrireAtomique(FICHIER, JSON.stringify(cache));
        return resultat();
      } catch (e) {
        echec = { quand: Date.now(), erreur: `Cours indisponibles (${e.message}).` };
        return resultat(echec.erreur);
      } finally { enCours = null; }
    })();
    return enCours;
  }

  return { obtenir };
}

module.exports = { creer, DEVISES };
