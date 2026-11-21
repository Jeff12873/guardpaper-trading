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
