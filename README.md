# GuardPaper Trading

Garde-fou de **discipline** pour le swing trading forex selon la méthode MTF 2.0.
Application de bureau Linux (Electron, publiée en Flatpak via FlatKein).

- **Avant** chaque trade : vérifie toutes les règles et **bloque** l'enregistrement si l'une est enfreinte
  (un trade « hors règles » reste possible avec une raison écrite, et compte contre le taux de discipline).
- Calcule la **taille de position** : risque fixe du capital courant, spread, glissement et commission inclus.
- Tient un **journal** : % de gagnants, profit factor, total en R et en €, drawdown, **taux de discipline**.

L'outil **contrôle**, il ne **décide** pas : aucun ordre passé chez le broker, aucun signal d'entrée.

Ce dépôt est une **coquille vide** : aucune donnée personnelle, aucun secret. Les trades et réglages vivent
dans `~/.local/share/guardpaper-trading/donnees.json`, sur l'ordinateur de l'utilisateur.

## Feuille de route

1. ✅ Stockage dans un fichier local, export / import JSON.
2. Annonces économiques automatiques (flux ForexFactory), avec repli manuel.
3. Corrélation entre paires (Pearson sur rendements journaliers, taux BCE), matrice puis règle bloquante.
4. Champs `mode` (replay / démo / réel) et `rulesSnapshot`, filtres des statistiques.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Interface : saisie, verdict des règles, positions, journal, réglages, aide intégrée |
| `calculs.js` | Calculs purs (pip, taille de position, résultat, statistiques, validation des données) |
| `tests/` | Tests des calculs (`npm test`), dont les valeurs de contrôle du cahier des charges |
| `bureau/main.js` | Processus principal : fenêtre, fichier de données, export / import, mises à jour |
| `bureau/preload.js` | Pont : la liste fermée des actions que l'interface peut demander (`window.appli`) |
| `bureau/coffre.js` | Écriture atomique des fichiers |
| `bureau/flatpak/` | Lanceur, fiche `.desktop`, fiche AppStream `metainfo.xml`, icônes |
| `outils/flatpak.sh` | Fabrique (et installe) le Flatpak |
| `.github/workflows/flatpak.yml` | À chaque `git push` : version 1.0.N, Flatpak, Release, FlatKein prévenu |

## Tester

    npm install
    npm test                                                          # calculs
    npm run demarrer                                                  # lancer
    GUARDPAPER_DONNEES=/tmp/essai.json npm run demarrer               # sur un fichier de test
    GUARDPAPER_DONNEES=/tmp/essai.json CAPTURE=/tmp/ecran.png SCRIPT=test.js npx electron .
    sh outils/flatpak.sh                                              # fabrique et installe le Flatpak
