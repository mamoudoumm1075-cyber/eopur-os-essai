# EOPUR OS 1.0

Logiciel de gestion des chantiers VMC d'EOPUR : chantiers, logements, planning, interventions, anomalies, échéancier, documents, rapports, avis de passage, DOE, études VMC, listings pour devis, demandes de prix et comparatif.

Hors périmètre (volontairement absent) : Sage sous toutes ses formes, demandes d'achat, bons de commande, gestion des commandes et des achats.

## Architecture

| Élément | Rôle |
|---|---|
| **PC Windows** (`pc.html` dans Chrome ou Edge) | Application principale. Base centrale SQLite `eopur_os.sqlite` dans un dossier local du PC : **seule source de vérité**. |
| **Téléphone** (`mobile/`, application installée depuis Safari) | Saisie terrain hors ligne : résultats de passage, observations, repassages, photos, anomalies. |
| **OneDrive** (`EOPUR_OS/vers_telephone`, `vers_pc`, `traites`) | Passerelle de transfert uniquement. Aucune donnée n'y est « vivante ». |

### Dossier de la base (sur le PC, hors OneDrive)

```
EOPUR_OS_BASE/
  eopur_os.sqlite            base centrale (écriture via .tmp puis remplacement)
  sauvegardes/               une sauvegarde automatique par jour d'utilisation, + avant chaque restauration et chaque intégration
  documents/<chantier>/      copies des documents importés (les originaux ne sont jamais modifiés)
  exports/<chantier>/        documents produits (Word, Excel), archivés à la validation
  photos/<chantier>/         photos (PC et téléphone)
  modeles/                   copies des modèles Word EOPUR importés
```

### Échanges téléphone ⇄ PC

- Paquet zip + `manifeste.json` (format `eopur-os-paquet`, version 2) avec l'empreinte SHA-256 de chaque pièce : un fichier incomplet ou modifié est refusé et laissé en place.
- Idempotence : un paquet déjà intégré n'est jamais réintégré ; une opération déjà reçue est ignorée (doublon).
- Conflits : chaque opération porte la révision du logement connue du téléphone ; si le logement a été modifié sur le PC entre-temps, l'opération est mise en conflit (rien n'est écrasé) et se tranche à l'écran.
- Intégration tout ou rien, après sauvegarde automatique ; accusés « reçu » puis « intégré » renvoyés au téléphone.

### Code

| Fichier | Contenu |
|---|---|
| `js/db.js` | Base SQLite (sql.js), schéma, historique, transactions, sauvegardes, restauration |
| `js/metier.js` | Règles : chantiers, logements, planning et alertes, résultats de passage, anomalies, échéancier, indicateurs |
| `js/excel.js` | Import de logements, suivi au format de la trame EOPUR, compte rendu bailleur |
| `js/docx.js` | Production Word : modèle EOPUR à balises `{{…}}` ou document standard |
| `js/documents.js` | Centre documentaire, versions, doublons, texte, modèles, circuit de validation |
| `js/etudes.js` | Études VMC (provenance, fiabilité), listings, doublons, comparatif |
| `js/synchro.js` | Paquets, contrôle, intégration, conflits, accusés |
| `js/pages*.js`, `js/app.js`, `js/ui.js` | Écrans |
| `mobile/` | Application téléphone (hors ligne, service worker) |
| `tests/` | Tests automatisés (Playwright) |

Bibliothèques embarquées (`lib/`) : sql.js 1.x, JSZip 3.10, ExcelJS 4.4, pdf.js 3.11 (lecture du texte des PDF).

## Installation

1. **PC** : ouvrir `https://mamoudoumm1075-cyber.github.io/eopur-os-essai/os/pc.html` dans **Chrome** ou **Edge**. Créer un dossier `Documents\EOPUR_OS_BASE` (pas dans OneDrive), le choisir au premier lancement et autoriser l'accès. Facultatif : menu du navigateur › « Installer EOPUR OS » pour avoir une icône.
2. **OneDrive** : dans l'écran « Téléphone et OneDrive », choisir le dossier `OneDrive\EOPUR_OS` (les sous-dossiers sont créés).
3. **iPhone** : ouvrir `…/os/mobile/` dans Safari › Partager › « Sur l'écran d'accueil ». Toujours lancer depuis l'icône.

## Sauvegarde et restauration

- Automatique : une copie datée par jour d'utilisation dans `sauvegardes/`, plus une avant chaque intégration de paquet et avant chaque restauration.
- Manuelle : Paramètres et sauvegardes › « Sauvegarder maintenant ».
- Restauration : Paramètres et sauvegardes › « Restaurer » sur la ligne voulue (contrôle d'intégrité, sauvegarde préalable de l'état actuel).
- Copie de sécurité hors PC : copier régulièrement le dossier `EOPUR_OS_BASE` complet sur un disque externe ou un autre emplacement.

## Tests

```
cd eopur_os && python3 -m http.server 8765 &
node tests/test_pc.js && node tests/test_flux.js && node tests/test_ui.js
```
Voir `tests/RAPPORT_TESTS.md`.
