// Tests des calculs (cahier des charges §7). Lancer : npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calculs.js');

const reglages = { ...C.DEFAUTS, capital: 10000, eurusd: 1.09, slip: 0.5, comm: 6 };
const proche = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg} : ${a} au lieu de ${b}`);

test('Achat EUR/USD 1,09650 / 1,09420 : 23 pips, 0,44 lot, risque 99,92 €, stop touché ≈ −0,98 R', () => {
  const t = C.taillePosition({ paire: 'EUR/USD', entree: 1.0965, stop: 1.0942, capital: 10000, risquePct: 1, reglages });
  proche(t.pipsStop, 23, 1e-6, 'pips');
  assert.equal(t.lots, 0.44);
  proche(t.risqueReel, 99.92, 0.005, 'risque réel');
  const trade = { pair: 'EUR/USD', dir: 'long', entry: 1.0965, lots: t.lots, riskEUR: Math.round(t.risqueReel * 100) / 100 };
  proche(C.resultatCloture(trade, 1.0942, reglages).r, -0.98, 0.005, 'R stop touché');
});

test('Vente USD/JPY 158,500 / 159,000 : 50 pips, 0,33 lot, sortie 157,500 ≈ +1,88 R', () => {
  const t = C.taillePosition({ paire: 'USD/JPY', entree: 158.5, stop: 159, capital: 10000, risquePct: 1, reglages });
  proche(t.pipsStop, 50, 1e-6, 'pips');
  assert.equal(t.lots, 0.33);
  const trade = { pair: 'USD/JPY', dir: 'short', entry: 158.5, lots: t.lots, riskEUR: Math.round(t.risqueReel * 100) / 100 };
  proche(C.resultatCloture(trade, 157.5, reglages).r, 1.88, 0.005, 'R sortie');
});

test('Taille d\'un pip et saisie à la française', () => {
  assert.equal(C.taillePip('USD/JPY'), 0.01);
  assert.equal(C.taillePip('EUR/USD'), 0.0001);
  assert.equal(C.nombre('1,09650'), 1.0965);
  assert.ok(Number.isNaN(C.nombre('abc')));
});

test('Statistiques : profit factor, drawdown, discipline', () => {
  const tr = [
    { r: 2, pnl: 200, compliant: true }, { r: -1, pnl: -100, compliant: true },
    { r: -1, pnl: -100, compliant: false }, { r: 3, pnl: 300, compliant: true },
  ];
  const s = C.statistiques(tr, tr);
  assert.equal(s.n, 4);
  assert.equal(s.profitFactor, 2.5);
  assert.equal(s.drawdownR, 2);
  assert.equal(s.discipline, 75);
});

test('Import : refuse un fichier invalide, complète les réglages manquants', () => {
  assert.throws(() => C.validerDonnees({}), /trades/);
  assert.throws(() => C.validerDonnees({ trades: [{ id: 'x', pair: 'XXX/YYY' }] }), /invalide/);
  const d = C.validerDonnees({ trades: [], settings: { capital: 5000, spreads: { 'EUR/USD': 0.2 } } });
  assert.equal(d.settings.capital, 5000);
  assert.equal(d.settings.spreads['EUR/USD'], 0.2);
  assert.equal(d.settings.spreads['USD/JPY'], 0.8);
});

/* ───────── Annonces (R9) ───────── */
// Semaine fictive au format du flux ForexFactory (heure de New York, UTC−5 en novembre)
const SEMAINE = [
  { title: 'Indice fictif', country: 'NZD', date: '2026-11-15T16:30:00-05:00', impact: 'Low' },
  { title: 'Emploi US fictif', country: 'USD', date: '2026-11-17T08:30:00-05:00', impact: 'High' },   // 14:30 Paris
  { title: 'Taux BCE fictif', country: 'EUR', date: '2026-11-19T07:45:00-05:00', impact: 'High' },   // 13:45 Paris
  { title: 'Inflation CAD fictive', country: 'CAD', date: '2026-11-18T08:30:00-05:00', impact: 'Medium' },
  { title: 'Jour férié', country: 'JPY', date: '2026-11-20T00:00:00-05:00', impact: 'Holiday' },
];
const r9 = (paire, iso) => C.verifierAnnonces({ evenements: SEMAINE, paire, quand: Date.parse(iso), avantMin: 30, apresMin: 120 });

test('Couverture : du dimanche 00:00 (New York) au dimanche suivant', () => {
  const c = C.couvertureSemaine(SEMAINE);
  assert.equal(new Date(c.debut).toISOString(), '2026-11-15T05:00:00.000Z');
  assert.equal(new Date(c.fin).toISOString(), '2026-11-22T05:00:00.000Z');
  assert.equal(C.couvertureSemaine([]), null);
});

test('R9 : bloque une annonce forte sur une des devises dans [−30 min, +2 h]', () => {
  const avant = r9('EUR/USD', '2026-11-17T13:00:00+01:00');            // emploi US 1 h 30 après
  assert.equal(avant.mode, 'auto');
  assert.equal(avant.bloquantes.length, 1);
  assert.equal(avant.bloquantes[0].country, 'USD');
  assert.equal(r9('EUR/USD', '2026-11-17T14:50:00+01:00').bloquantes.length, 1);   // 20 min après
  assert.equal(r9('EUR/USD', '2026-11-17T15:10:00+01:00').bloquantes.length, 0);   // 40 min après
  assert.equal(r9('EUR/USD', '2026-11-17T12:20:00+01:00').bloquantes.length, 0);   // 2 h 10 avant
});

test('R9 : ignore les autres devises, les impacts moyens et les jours fériés', () => {
  assert.equal(r9('GBP/USD', '2026-11-19T13:00:00+01:00').bloquantes.length, 0);   // BCE : pas de EUR
  assert.equal(r9('USD/CAD', '2026-11-18T14:00:00+01:00').bloquantes.length, 0);   // Medium
  assert.equal(r9('USD/JPY', '2026-11-20T05:30:00+01:00').bloquantes.length, 0);   // Holiday
});

test('R9 : repli manuel hors de la semaine du flux (Replay) ou sans flux', () => {
  assert.equal(r9('EUR/USD', '2026-01-14T10:00:00+01:00').mode, 'manuel');
  assert.equal(r9('EUR/USD', '2026-11-22T04:30:00+01:00').mode, 'manuel');          // fenêtre déborde sur la semaine suivante
  assert.equal(C.verifierAnnonces({ evenements: [], paire: 'EUR/USD', quand: Date.now(), avantMin: 30, apresMin: 120 }).mode, 'manuel');
});

test('Prochaines annonces fortes, dans l\'ordre', () => {
  const p = C.prochainesAnnonces(SEMAINE, Date.parse('2026-11-16T00:00:00Z'));
  assert.deepEqual(p.map(e => e.country), ['USD', 'EUR']);
});

/* ───────── Corrélation (R6) ───────── */
// Série fictive : USD bouge, les autres devises suivent l'USD à des degrés divers
function serie(jours) {
  const taux = {}; let usd = 1.10, gbp = 0.85, jpy = 160, chf = 0.95, aud = 1.65, cad = 1.50, nzd = 1.80;
  for (let i = 0; i < jours; i++) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    const choc = Math.sin(i * 1.7) * 0.004, bruit = Math.cos(i * 2.3) * 0.002;
    usd *= 1 + choc; gbp *= 1 + choc * 0.9 + bruit * 0.3; jpy *= 1 + choc * 0.2 + bruit;
    chf *= 1 + choc * 0.95; aud *= 1 + bruit; cad *= 1 + choc * 0.5; nzd *= 1 + bruit * 0.9 + choc * 0.1;
    taux[d] = { USD: usd, GBP: gbp, JPY: jpy, CHF: chf, AUD: aud, CAD: cad, NZD: nzd };
  }
  return taux;
}

test('Prix des paires depuis les taux contre EUR', () => {
  const t = { USD: 1.1, GBP: 0.85, JPY: 165, CHF: 0.95, AUD: 1.65, CAD: 1.5, NZD: 1.8 };
  proche(C.prixPaire('EUR/USD', t), 1.1, 1e-12, 'EUR/USD');
  proche(C.prixPaire('GBP/USD', t), 1.1 / 0.85, 1e-12, 'GBP/USD');
  proche(C.prixPaire('USD/JPY', t), 150, 1e-9, 'USD/JPY');
});

test('Pearson : +1, −1, et la matrice est symétrique avec 1 sur la diagonale', () => {
  proche(C.pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1, 1e-12, '+1');
  proche(C.pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1, 1e-12, '−1');
  const mat = C.matriceCorrelation(serie(120), '2026-04-01', 60);
  assert.equal(mat.n, 60);
  assert.ok(mat.fin < '2026-04-01', 'aucune donnée du jour du trade ni du futur');
  assert.equal(mat.m['EUR/USD']['EUR/USD'], 1);
  proche(mat.m['EUR/USD']['USD/CHF'], mat.m['USD/CHF']['EUR/USD'], 1e-12, 'symétrie');
  assert.ok(mat.m['EUR/USD']['USD/CHF'] < -0.8, 'EUR/USD et USD/CHF opposés');
  assert.equal(C.matriceCorrelation(serie(10), '2026-04-01', 60), null);
});

test('R6 : même pari bloquant, sens opposé = neutralisation, seuil d\'alerte', () => {
  const r = { ...C.DEFAUTS };
  const matrice = { m: { 'EUR/USD': { 'USD/CHF': -0.9, 'GBP/USD': 0.7, 'USD/JPY': 0.1 } } };
  const v = (dir, ouvertes) => C.verifierCorrelation({ matrice, paire: 'EUR/USD', dir, ouvertes, reglages: r });
  // Achat EUR/USD + vente USD/CHF ouverte : −0,9 × 1 × −1 = +0,9 → même pari
  const a = v('long', [{ pair: 'USD/CHF', dir: 'short' }]);
  assert.equal(a.meme.length, 1); assert.equal(a.bloque, true);
  // Achat EUR/USD + achat USD/CHF : −0,9 → se neutralisent, pas bloquant
  const b = v('long', [{ pair: 'USD/CHF', dir: 'long' }]);
  assert.equal(b.neutres.length, 1); assert.equal(b.bloque, false);
  // GBP/USD dans le même sens : 0,7 → alerte seulement
  const c = v('long', [{ pair: 'GBP/USD', dir: 'long' }]);
  assert.equal(c.alertes.length, 1); assert.equal(c.bloque, false);
  assert.equal(C.verifierCorrelation({ matrice: null }).dispo, false);
});

test('EUR/USD au dernier fixing connu et données importées avec captures', () => {
  const taux = { '2026-01-02': { USD: 1.1 }, '2026-01-05': { USD: 1.12 } };
  assert.deepEqual(C.eurusdAu(taux, '2026-01-04'), { cours: 1.1, date: '2026-01-02' });
  assert.equal(C.eurusdAu(taux, '2025-12-31'), null);
  const d = C.validerDonnees({ trades: [{ id: 't1', pair: 'EUR/USD', dir: 'long', entry: 1, stop: 0.9, lots: 0.1, status: 'open', captures: ['abc123def.png', '../../etc/passwd'] }], exemples: { 3: ['abc123def.png'], x: ['zz'] } });
  assert.deepEqual(d.trades[0].captures, ['abc123def.png']);
  assert.equal(d.trades[0].comment, '');
  assert.deepEqual(d.exemples, { 3: ['abc123def.png'] });
});
