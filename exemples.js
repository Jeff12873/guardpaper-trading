// Exemples de base de la checklist MTF 2.0 : un petit schéma par point (SVG dessiné ici, couleurs du
// thème via les classes CSS .k-up, .k-dn, .l-acc, .l-bad, .l-mut, .t) et une explication courte.
// Ce sont des schémas d'école, pas des graphiques réels : l'utilisateur ajoute ses propres captures.
(function (racine) {
  'use strict';
  // Bougie : x, ouverture, clôture, plus haut, plus bas (coordonnées SVG : petit y = prix haut)
  const K = (x, o, c, h, l) => {
    const cls = c <= o ? 'k-up' : 'k-dn', haut = Math.min(o, c), hauteur = Math.max(Math.abs(o - c), 1);
    return `<line class="${cls}" x1="${x}" y1="${h}" x2="${x}" y2="${l}" stroke-width="1"/><rect class="${cls}" x="${x - 3}" y="${haut}" width="6" height="${hauteur}" rx=".5"/>`;
  };
  const svg = (contenu) => `<svg class="ex" viewBox="0 0 120 72" role="img" aria-hidden="true">${contenu}</svg>`;
  const T = (x, y, txt, ancre = 'start') => `<text class="t" x="${x}" y="${y}" text-anchor="${ancre}">${txt}</text>`;

  const EXEMPLES = [
    { // 1. Tendance H4
      svg: svg(`<line class="l-acc" x1="6" y1="63" x2="116" y2="35.8" stroke-width="1.5"/>
        ${K(12, 56, 52, 50, 58)}${K(20, 52, 56, 51, 59.5)}${K(28, 56, 48, 46, 57)}${K(36, 48, 42, 40, 50)}${K(44, 42, 36, 34, 44)}
        ${K(52, 36, 42, 35, 44)}${K(60, 42, 46, 40, 47)}${K(68, 46, 41, 39, 47.6)}${K(76, 41, 34, 32, 42)}${K(84, 34, 28, 26, 36)}
        ${K(92, 28, 22, 20, 30)}${K(100, 22, 27, 21, 29)}${K(108, 27, 31, 25, 32)}
        <circle class="l-acc" cx="20" cy="59.5" r="3"/><circle class="l-acc" cx="68" cy="47.6" r="3"/>
        ${T(20, 69, '1', 'middle')}${T(68, 57, '2', 'middle')}${T(44, 31, 'sommet', 'middle')}${T(92, 17, 'plus haut', 'middle')}`),
      texte: `<p>Sur le graphique <b>H4</b>, trace une <b>droite de tendance</b> qui touche le prix au moins <b>deux fois</b> (1 et 2).</p>
        <p>La <b>structure de Dow</b> doit aller dans le sens du trade : en tendance haussière, des sommets et des creux de plus en plus hauts ; en baissière, de plus en plus bas.</p>`,
    },
    { // 2. EMA 100
      svg: svg(`<path class="l-acc" d="M4,64 C40,60 80,46 116,34" stroke-width="1.5"/>
        ${K(16, 50, 46, 44, 52)}${K(28, 46, 48, 44, 50)}${K(40, 48, 42, 40, 49)}${K(52, 42, 38, 36, 44)}
        ${K(64, 38, 40, 35, 42)}${K(76, 40, 33, 31, 41)}${K(88, 33, 29, 27, 35)}${K(100, 29, 24, 22, 31)}
        ${T(116, 46, 'EMA 100', 'end')}${T(8, 14, 'achat : prix au-dessus')}`),
      texte: `<p>La <b>moyenne mobile exponentielle 100</b> sert de filtre : on n'achète que si le prix est <b>au-dessus</b>, on ne vend que s'il est <b>en dessous</b>.</p>
        <p>Si le prix est collé à l'EMA ou la traverse sans arrêt, la tendance n'est pas assez nette.</p>`,
    },
    { // 3. Rejet
      svg: svg(`<line class="l-acc" x1="4" y1="66" x2="116" y2="30" stroke-width="1.5"/>
        ${K(28, 30, 27, 25, 32)}${K(40, 27, 31, 26, 33)}${K(52, 31, 35, 30, 37)}${K(64, 35, 38, 34, 40)}
        ${K(76, 38, 34, 33, 42.9)}${K(88, 34, 28, 26, 35)}
        <circle class="l-acc" cx="76" cy="42.9" r="3"/><path class="l-mut" d="M92,52 L92,42 M88,46 L92,42 L96,46" stroke-width="1.2"/>
        ${T(98, 52, 'rejet')}`),
      texte: `<p>Le prix revient sur la droite de tendance H4 et <b>repart nettement</b> : longue mèche qui touche la droite, clôture dans le sens de la tendance.</p>
        <p>Un simple frôlement ou une bougie indécise n'est pas un rejet net : on attend.</p>`,
    },
    { // 4. Figure H1
      svg: svg(`${K(10, 62, 54, 52, 63)}${K(20, 54, 44, 42, 55)}${K(30, 44, 32, 30, 45)}${K(40, 32, 22, 20, 33)}
        ${K(52, 22, 26, 21, 27)}${K(62, 26, 29, 25, 31)}${K(72, 29, 27, 26, 32)}${K(82, 27, 31, 26, 33)}${K(96, 30, 20, 18, 31)}
        <line class="l-acc" x1="48" y1="19" x2="88" y2="25" stroke-dasharray="3 2"/><line class="l-acc" x1="48" y1="28" x2="88" y2="34" stroke-dasharray="3 2"/>
        ${T(14, 30, 'impulsion')}${T(68, 44, 'figure', 'middle')}`),
      texte: `<p>Sur <b>H1</b>, cherche une figure de <b>continuation</b> (drapeau, triangle…) dont l'<b>impulsion</b> qui la précède est <b>plus grande</b> que la figure elle-même.</p>
        <p>Une figure de <b>retournement</b> (épaule-tête-épaule, double creux…) n'est valable que sur un <b>niveau majeur</b>.</p>`,
    },
    { // 5. Entrée
      svg: svg(`<line class="l-acc" x1="4" y1="30" x2="116" y2="30" stroke-dasharray="4 2" stroke-width="1.2"/>
        ${K(16, 44, 38, 36, 46)}${K(28, 38, 34, 31, 40)}${K(40, 34, 40, 33, 41)}${K(52, 40, 36, 34, 42)}
        ${K(64, 36, 33, 31, 38)}${K(76, 33, 37, 32, 39)}${K(88, 37, 24, 22, 38)}
        <circle class="l-acc" cx="88" cy="24" r="3"/>${T(6, 26, 'ligne de cou')}${T(94, 18, 'entrée')}`),
      texte: `<p>On entre seulement quand une bougie est <b>clôturée</b> au-delà de la <b>ligne de cou</b> de la figure.</p>
        <p>Pas d'anticipation : une bougie encore ouverte qui dépasse la ligne peut se retourner avant sa clôture.</p>`,
    },
    { // 6. Stop
      svg: svg(`${K(16, 40, 46, 38, 48)}${K(28, 46, 50, 44, 52)}${K(40, 50, 46, 44, 54)}${K(52, 46, 40, 38, 47)}
        ${K(64, 40, 42, 37, 44)}${K(76, 42, 34, 32, 43)}${K(88, 34, 28, 26, 35)}
        <line class="l-bad" x1="30" y1="61" x2="116" y2="61" stroke-width="1.2" stroke-dasharray="3 2"/><line class="l-acc" x1="82" y1="28" x2="116" y2="28" stroke-dasharray="2 2"/>
        <path class="l-mut" d="M48,54 L48,61" stroke-width="1"/>${T(52, 59, 'marge')}${T(40, 70, 'dernier creux', 'middle')}
        ${T(116, 58, 'stop', 'end')}${T(116, 25, 'entrée', 'end')}`),
      texte: `<p>Le stop se place <b>au-delà du dernier creux</b> (achat) ou du <b>dernier sommet</b> (vente), avec une <b>marge</b> pour ne pas être sorti par une simple mèche.</p>
        <p>La taille de position s'adapte à cette distance : un stop large donne une petite taille, jamais l'inverse.</p>`,
    },
    { // 7. Pas de renfort
      svg: svg(`<rect class="l-acc" x="10" y="22" width="40" height="28" rx="4" stroke-width="1.5"/>${T(30, 39, 'position', 'middle')}
        <path class="l-mut" d="M60,36 H74 M67,29 V43" stroke-width="2"/>
        <rect class="l-mut" x="82" y="22" width="30" height="28" rx="4" stroke-dasharray="3 2"/>
        <path class="l-bad" d="M56,24 L78,48 M78,24 L56,48" stroke-width="2.5"/>${T(60, 66, 'pas d’ajout pour se refaire', 'middle')}`),
      texte: `<p>On n'ajoute <b>jamais</b> à une position déjà ouverte pour « se refaire » ou moyenner une perte.</p>
        <p>Chaque trade a son propre risque, calculé une seule fois. La règle « Pas de renforcement » bloque aussi une 2e position sur la même paire.</p>`,
    },
    { // 8. Gestion
      svg: svg(`${K(12, 56, 50, 48, 58)}${K(22, 50, 53, 48, 55)}${K(32, 53, 45, 43, 54)}${K(44, 45, 40, 38, 47)}${K(54, 40, 44, 39, 46)}
        ${K(64, 44, 36, 34, 45)}${K(76, 36, 32, 30, 38)}${K(86, 32, 35, 31, 36)}${K(96, 35, 26, 24, 36)}${K(108, 26, 22, 20, 28)}
        <path class="l-bad" d="M6,62 H58 V50 H90 V40 H116" stroke-width="1.2" stroke-dasharray="3 2"/>
        <line class="l-mut" x1="20" y1="10" x2="80" y2="10" stroke-dasharray="3 2"/><path class="l-bad" d="M44,6 L52,14 M52,6 L44,14" stroke-width="1.5"/>
        ${T(84, 12, 'TP fixe')}${T(116, 70, 'stop suiveur', 'end')}`),
      texte: `<p>Pas d'objectif de gain (take profit) fixe : on laisse courir la tendance.</p>
        <p>Le stop ne monte (achat) ou ne descend (vente) que <b>sous un nouveau creux confirmé</b> (au-dessus d'un nouveau sommet en vente), en marches d'escalier. Il ne recule jamais.</p>`,
    },
    { // 9. Calme
      svg: svg(`${K(30, 20, 56, 18, 58)}<rect class="k-up" x="70" y="22" width="7" height="28" rx="1.5"/><rect class="k-up" x="84" y="22" width="7" height="28" rx="1.5"/>
        ${T(30, 68, 'perte', 'middle')}${T(80, 62, 'pause', 'middle')}`),
      texte: `<p>Après une perte, <b>pas de trade de vengeance</b> : la perte fait partie de la méthode, elle est déjà comptée dans le risque.</p>
        <p>Si tu sens l'envie de « récupérer », fais une pause : ferme le graphique, reviens plus tard.</p>`,
    },
    { // 10. Journal
      svg: svg(`<rect class="l-mut" x="28" y="8" width="56" height="58" rx="4" stroke-width="1.5"/>
        <path class="l-mut" d="M36,22 H76 M36,32 H76 M36,42 H66 M36,52 H60" stroke-width="1"/>
        <path class="l-acc" d="M66,50 L72,56 L86,38" stroke-width="2.5" fill="none"/>${T(56, 18, 'trade noté', 'middle')}`),
      texte: `<p>En Bar Replay, <b>note le trade dans GuardPaper avant d'avancer la bougie suivante</b>.</p>
        <p>Sinon on connaît déjà la suite, et la décision n'est plus honnête : le backtest perd sa valeur.</p>`,
    },
  ];
  racine.EXEMPLES = EXEMPLES;
})(typeof self !== 'undefined' ? self : this);
