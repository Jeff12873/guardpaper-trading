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
    const vp = valeurPipEUR(t.pair, t.entry, r.eurusd);
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
    return { settings: { ...DEFAUTS, ...s, spreads: { ...DEFAUTS.spreads, ...(s.spreads || {}) } }, trades };
  }

  return { PAIRES, RISQUE_PAR_FREQ, DEFAUTS, nombre, taillePip, devises, cotationVersEUR, valeurPipEUR, taillePosition, resultatCloture, statistiques, validerDonnees };
});
