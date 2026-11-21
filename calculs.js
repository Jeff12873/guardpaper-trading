// Calculs de GuardPaper Trading : fonctions pures, sans accès à la page ni au système.
// Chargé par index.html (window.Calculs) et par les tests (require).
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.Calculs = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAIRES = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD'];
  const RISQUE_PAR_FREQ = { many: 0.5, mid: 1, few: 1.5 };
  const DEFAUTS = {
    capital: 10000, freq: 'mid', maxTotal: 3, maxCcy: 2, start: 7, end: 22, eurusd: 1.09, comm: 6, slip: 0.5,
    newsBefore: 30, newsAfter: 120,             // fenêtre des annonces autour de l'entrée, en minutes
    corrN: 60, corrFort: 0.8, corrAlerte: 0.6, maxCorrelees: 1,   // corrélation (R6)
    eurusdAuto: true,                           // cours EUR/USD de conversion pris dans les fixings BCE
    stopDefaut: 20,                             // distance du stop proposée à la saisie de l'entrée (pips)
    spreads: { 'EUR/USD': 0.6, 'GBP/USD': 0.9, 'USD/JPY': 0.8, 'USD/CHF': 1.0, 'AUD/USD': 0.8, 'USD/CAD': 1.0, 'NZD/USD': 1.2 },
  };

  // Lit un nombre saisi à la française (« 1,09650 », espaces tolérés) ; NaN si invalide
  const nombre = (s) => { const v = parseFloat(String(s ?? '').trim().replace(/\s/g, '').replace(',', '.')); return isFinite(v) ? v : NaN; };
  const taillePip = (paire) => (paire.includes('JPY') ? 0.01 : 0.0001);
  const devises = (paire) => paire.split('/');

  // Conversion de la devise de cotation en euros (compte en EUR)
  function cotationVersEUR(paire, prix, eurusd) {
    if (devises(paire)[1] === 'USD') return 1 / eurusd;
    return (1 / prix) / eurusd;                       // paires USD/XXX : XXX -> USD -> EUR
  }
  // Valeur d'un pip pour 1 lot (100 000 unités), en euros
  const valeurPipEUR = (paire, prix, eurusd) => 100000 * taillePip(paire) * cotationVersEUR(paire, prix, eurusd);

  // Taille de position : risque fixe, frais (spread, glissement, commission) inclus
  function taillePosition({ paire, entree, stop, capital, risquePct, reglages: r }) {
    const pipsStop = Math.abs(entree - stop) / taillePip(paire);
    const vp = valeurPipEUR(paire, entree, r.eurusd);
    const spread = r.spreads[paire] ?? 1;
    const coutParLot = (pipsStop + spread + r.slip) * vp + r.comm;
    const risqueVise = capital * risquePct / 100;
    // Petite tolérance : évite qu'une division comme 0,44999999 tombe à 0,44 par erreur d'arrondi
    const lots = Math.floor(risqueVise / coutParLot * 100 + 1e-9) / 100;
    const fraisParLot = (spread + r.slip) * vp + r.comm;
    return { pipsStop, vp, risqueVise, lots, risqueReel: lots * coutParLot, frais: lots * fraisParLot };
  }

  // Résultat net d'un trade clôturé, en euros et en R (R = résultat / risque réel du trade)
  function resultatCloture(t, sortie, r) {
    const sens = t.dir === 'long' ? 1 : -1;
    const pips = (sortie - t.entry) / taillePip(t.pair) * sens;
    const vp = valeurPipEUR(t.pair, t.entry, t.eurusd || r.eurusd);   // cours mémorisé à l'entrée
    const spread = r.spreads[t.pair] ?? 1;
    const pnl = pips * vp * t.lots - spread * vp * t.lots - r.comm * t.lots;
    return { pnl, r: t.riskEUR > 0 ? pnl / t.riskEUR : 0 };
  }

  // Statistiques du journal sur une liste de trades clôturés triés par date de sortie
  function statistiques(clotures, tous) {
    const n = clotures.length, gains = clotures.filter(t => t.pnl > 0), pertes = clotures.filter(t => t.pnl < 0);
    const gb = gains.reduce((a, t) => a + t.pnl, 0), pb = -pertes.reduce((a, t) => a + t.pnl, 0);
    let cumul = 0, sommet = 0, dd = 0;
    clotures.forEach(t => { cumul += t.r; sommet = Math.max(sommet, cumul); dd = Math.max(dd, sommet - cumul); });
    const moy = (arr) => (arr.length ? arr.reduce((a, t) => a + t.r, 0) / arr.length : NaN);
    return {
      n,
      pctGagnants: n ? gains.length / n * 100 : NaN,
      profitFactor: pb > 0 ? gb / pb : (gb > 0 ? Infinity : NaN),
      totalR: clotures.reduce((a, t) => a + t.r, 0),
      totalEUR: clotures.reduce((a, t) => a + t.pnl, 0),
      gainMoyenR: moy(gains), perteMoyenneR: moy(pertes),
      drawdownR: dd,
      discipline: tous.length ? tous.filter(t => t.compliant).length / tous.length * 100 : NaN,
    };
  }

  const NOM_CAPTURE = /^[a-z0-9-]{6,40}\.(png|jpg|webp)$/;

  /* ───────── Annonces économiques (règle R9) ───────── */
  const JOUR = 86400000;
  const estFort = (e) => e.impact === 'High';

  // Semaine couverte par le flux ForexFactory : du dimanche 00:00 au dimanche suivant, dans le fuseau
  // des dates du flux (heure de New York). Renvoie {debut, fin} en ms, ou null si le flux est vide.
  function couvertureSemaine(evenements) {
    if (!evenements || !evenements.length) return null;
    const premier = evenements.map(e => e.date).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
    const jour = premier.slice(0, 10), decalage = premier.slice(19) || 'Z';
    const minuit = Date.parse(`${jour}T00:00:00${decalage}`);
    const jourSemaine = new Date(`${jour}T00:00:00Z`).getUTCDay();          // 0 = dimanche
    const debut = minuit - jourSemaine * JOUR;
    return { debut, fin: debut + 7 * JOUR };
  }

  // Règle R9. mode « auto » seulement si toute la fenêtre [quand − avant, quand + après] est couverte
  // par le flux ; sinon « manuel » (Replay sur une date passée, flux absent, fin de semaine).
  function verifierAnnonces({ evenements, paire, quand, avantMin, apresMin }) {
    const couv = couvertureSemaine(evenements);
    if (!isFinite(quand)) return { mode: 'manuel', raison: 'date' };
    if (!couv) return { mode: 'manuel', raison: 'flux' };
    const de = quand - avantMin * 60000, a = quand + apresMin * 60000;
    if (de < couv.debut || a > couv.fin) return { mode: 'manuel', raison: 'hors-semaine' };
    const dev = devises(paire);
    const bloquantes = evenements
      .filter(e => estFort(e) && dev.includes(e.country))
      .filter(e => { const t = Date.parse(e.date); return t >= de && t <= a; })
      .sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    return { mode: 'auto', bloquantes };
  }

  // Prochaines annonces fortes (à partir de maintenant), triées par date
  const prochainesAnnonces = (evenements, maintenant) => (evenements || [])
    .filter(e => estFort(e) && Date.parse(e.date) >= maintenant)
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date));

  /* ───────── Corrélation (règle R6) ───────── */
  // Prix d'une paire à partir des taux contre EUR (fixings BCE : unités de devise pour 1 EUR)
  function prixPaire(paire, taux) {
    const [b, q] = devises(paire);
    const t = (c) => (c === 'EUR' ? 1 : taux[c]);
    return t(q) / t(b);
  }
  function pearson(a, b) {
    const n = a.length; if (n < 2 || b.length !== n) return NaN;
    const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
    return da > 0 && db > 0 ? num / Math.sqrt(da * db) : NaN;
  }
  // Matrice de Pearson sur les rendements journaliers ln(close_t / close_t-1), sur les n derniers
  // rendements STRICTEMENT avant le jour donné (« AAAA-MM-JJ ») : en Replay, rien du futur.
  function matriceCorrelation(taux, avantJour, n) {
    const dates = Object.keys(taux || {}).filter(d => d < avantJour).sort().slice(-(n + 1));
    if (dates.length < Math.min(n + 1, 21)) return null;
    const rend = {};
    PAIRES.forEach(p => {
      const px = dates.map(d => prixPaire(p, taux[d]));
      rend[p] = px.slice(1).map((v, i) => Math.log(v / px[i]));
    });
    const m = {};
    PAIRES.forEach(a => { m[a] = {}; PAIRES.forEach(b => { m[a][b] = a === b ? 1 : pearson(rend[a], rend[b]); }); });
    return { m, debut: dates[0], fin: dates[dates.length - 1], n: dates.length - 1 };
  }
  // Cours EUR/USD du dernier fixing au plus tard au jour donné
  function eurusdAu(taux, jour) {
    const d = Object.keys(taux || {}).filter(x => x <= jour).sort().pop();
    return d ? { cours: taux[d].USD, date: d } : null;
  }
  // c_eff = corr × sens_A × sens_B (sens = +1 achat, −1 vente) pour chaque position ouverte
  function verifierCorrelation({ matrice, paire, dir, ouvertes, reglages: r }) {
    if (!matrice) return { dispo: false };
    const sens = (d) => (d === 'long' ? 1 : -1);
    const liens = ouvertes.filter(t => t.pair !== paire).map(t => ({
      pair: t.pair, dir: t.dir, c: matrice.m[paire][t.pair] * sens(dir) * sens(t.dir),
    })).filter(l => isFinite(l.c));
    const meme = liens.filter(l => l.c >= r.corrFort);
    return {
      dispo: true,
      meme,                                                        // même pari
      alertes: liens.filter(l => l.c >= r.corrAlerte && l.c < r.corrFort),
      neutres: liens.filter(l => l.c <= -r.corrFort),              // se neutralisent
      bloque: meme.length >= r.maxCorrelees,                       // nouveau trade = un pari de trop
    };
  }

  // Vérifie et complète des données importées (fichier JSON) ; lève une erreur lisible si invalide
  function validerDonnees(d) {
    if (!d || typeof d !== 'object') throw new Error("Ce fichier n'est pas une sauvegarde valide.");
    const trades = Array.isArray(d.trades) ? d.trades : null;
    if (!trades) throw new Error('Aucune liste de trades dans ce fichier.');
    trades.forEach((t, i) => {
      if (!t || typeof t.id !== 'string' || !PAIRES.includes(t.pair) || !['long', 'short'].includes(t.dir)
        || !isFinite(t.entry) || !isFinite(t.stop) || !isFinite(t.lots) || !['open', 'closed'].includes(t.status))
        throw new Error(`Trade n° ${i + 1} invalide.`);
    });
    const s = d.settings || {};
    // Captures : noms de fichiers générés par l'appli uniquement (jamais de chemin)
    const captures = (l) => (Array.isArray(l) ? l.filter(x => typeof x === 'string' && NOM_CAPTURE.test(x)) : []);
    const propres = trades.map(t => ({ ...t, captures: captures(t.captures), comment: typeof t.comment === 'string' ? t.comment : '' }));
    const exemples = {};
    Object.entries(d.exemples && typeof d.exemples === 'object' ? d.exemples : {}).forEach(([k, v]) => { if (/^\d$/.test(k)) exemples[k] = captures(v); });
    return { settings: { ...DEFAUTS, ...s, spreads: { ...DEFAUTS.spreads, ...(s.spreads || {}) } }, trades: propres, exemples };
  }

  return { PAIRES, RISQUE_PAR_FREQ, DEFAUTS, nombre, taillePip, devises, cotationVersEUR, valeurPipEUR, taillePosition, resultatCloture, statistiques, validerDonnees, couvertureSemaine, verifierAnnonces, prochainesAnnonces, prixPaire, pearson, matriceCorrelation, eurusdAu, verifierCorrelation, NOM_CAPTURE };
});
