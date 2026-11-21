# Règles de travail (Claude Code)

## Langue
- Tout en français : réponses, interface, aide, messages de commit, commentaires du code.

## Dépôt public = coquille vide
- Jamais de donnée personnelle, de chemin personnel, d'adresse e-mail ni de secret dans le dépôt.
- Les secrets passent par les secrets GitHub et sont écrits au build dans `bureau/secrets.json` (ignoré par git).
- Les données (trades, réglages) vivent dans `~/.local/share/guardpaper-trading/donnees.json`, jamais dans le dépôt.

## Avant d'agir
- Une demande floue ou un choix de conception : poser un QCM court (options avec une recommandée), puis agir.
- Ne jamais toucher aux vraies données pour tester : `GUARDPAPER_DONNEES=<fichier temporaire>`.
- Cahier des charges : l'outil contrôle, il ne décide pas (pas d'ordres, pas de signaux, pas de scraping).
  Avancer étape par étape (feuille de route du README), chaque étape validée par l'utilisateur.

## Architecture (à respecter)
- `index.html` n'a aucun accès système : tout passe par `window.appli` (`bureau/preload.js`).
- Chaque nouvelle action système = un `ipcMain.handle` dans `main.js` + une ligne dans `preload.js`,
  avec vérification des arguments.
- Calculs purs dans `calculs.js` (partagé interface / processus principal / tests) ; `npm test` doit passer.
- Écritures : `ecrireAtomique`, données validées par `Calculs.validerDonnees` avant chaque écriture.
- Une source extérieure coupée ne doit jamais bloquer l'outil : repli manuel + bandeau d'avertissement.
- Un service extérieur = son propre module dans `bureau/`, avec un mode simulé pour les tests.
- Couleurs = variables CSS (clair et sombre) ; temporisations = constante `TEMPO`.
- Toute action irréversible demande confirmation ; une action annulable propose « Annuler » dans la notification.

## À chaque nouvelle fonction
- Mettre à jour l'aide intégrée (`AIDE` dans `index.html`).
- Tester : lancement avec `CAPTURE=… SCRIPT=…`, regarder la capture, vérifier la syntaxe
  (`node --check`), retirer les crochets de test (`// TEST`) avant le commit.

## Publication
- Commit en français décrivant le changement pour l'utilisateur.
- `git push` → GitHub Actions fabrique le Flatpak (version 1.0.<build>) → Release → FlatKein.
- Puis : `gh workflow run publier -R Jeff12873/FlatKein`, `flatpak update --user <id>`, relancer l'appli,
  et confirmer à l'utilisateur la version installée.
