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
