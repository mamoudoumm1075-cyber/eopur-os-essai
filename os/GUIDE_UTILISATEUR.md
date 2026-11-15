# EOPUR OS – guide d'utilisation

## Au quotidien sur le PC

**Chantier de travail** : la liste en haut de l'écran filtre tous les modules sur un chantier. « Tous les chantiers » affiche l'ensemble.

**Recherche** : la barre en haut à droite cherche partout (chantiers, logements, anomalies, interventions, texte des documents). Touche Entrée.

| Module | Ce qu'on y fait |
|---|---|
| Tableau de bord | Indicateurs calculés sur la base, avancement par chantier, 7 prochains jours, alertes. Chaque case mène au détail. |
| Chantiers | Fiche, interlocuteurs, logements, interventions, anomalies, documents, historique complet. |
| Logements | Saisie, création en série, import Excel, export du suivi (trame EOPUR). Cocher des logements pour : planifier, changer le statut, préparer les avis. Clic sur un logement : fiche, passages, photos, historique. |
| Planning | Vues jour / semaine / mois, filtres intervenant / type / statut. Alertes : doublon (même logement le même jour), chevauchement (même intervenant), incohérence (horaires, date passée, logement déjà terminé). |
| Suivi des interventions | Saisie du résultat de chaque passage, observation, actions, date de repassage, photos, anomalie. Onglet « Absences, inaccessibles et repassages » pour replanifier. |
| Anomalies | Nouvelle → À analyser → En cours → En attente → Résolue → Clôturée ; priorité, responsable, échéance, photos, historique. |
| Échéancier | Échéances saisies + interventions, repassages, anomalies et fins de chantier. Retards en rouge. |
| Centre documentaire | Import (bouton ou glisser-déposer) : copie conservée, original intact ; doublon exact refusé ; même nom = nouvelle version. Onglet « Modèles EOPUR » pour vos trames Word. |
| Rapports de visite / Avis de passage / DOE | Production Word (et Excel pour le bordereau DOE). |
| Assistant documentaire | Questions sur vos documents : réponses = extraits avec leur source ; « information non trouvée » sinon. « Contrôler le dossier » liste ce qui manque. |
| Études techniques VMC | Chaque donnée porte son document source et sa fiabilité (Confirmé / Hypothèse / À vérifier). « Confirmé » exige une source. Génère un listing. |
| Listings pour devis | Lignes, doublons possibles signalés (regroupement seulement sur votre clic), export Excel. |
| Demandes de prix | Demande Word + bordereau Excel par fournisseur, saisie ou import de l'offre chiffrée, comparatif écran et Excel. Aucune commande n'est passée. |

### Production de tout document

1. Génération et **prévisualisation** à l'écran.
2. **Contrôles** affichés (données manquantes, non confirmées, doublons…).
3. Case « J'ai relu… » à cocher : **validation humaine** obligatoire.
4. « Valider, exporter et archiver » : le fichier est téléchargé et une copie est archivée dans le centre documentaire. « Enregistrer en brouillon » archive sans valider (à valider plus tard).

### Modèles EOPUR

Centre documentaire › Modèles EOPUR › Importer votre trame Word. Placer dans la trame les balises, par exemple `{{chantier}}`, `{{adresse}}`, `{{date}}`. Un paragraphe contenant seulement `{{#logements}}` (ou `{{#passages}}`, `{{#lignes}}`…) reçoit le tableau. La liste des balises de chaque document est affichée sur l'écran.

## Sur le téléphone

1. PC : « Téléphone et OneDrive » › « Déposer le paquet dans OneDrive ».
2. Téléphone : Accueil › « Recevoir un chantier ou un accusé » › OneDrive › EOPUR_OS › vers_telephone › le fichier `eopur_chantier_…`.
3. « Aujourd'hui » › une intervention › un logement › résultat, observation, date de repassage, photo, anomalie. Tout est gardé sur le téléphone, même sans réseau.
4. « Échanges » › « Envoyer » › « Enregistrer dans Fichiers » › OneDrive › EOPUR_OS › **vers_pc**.
5. PC : « Lire les paquets reçus » › vérifier › « Intégrer ce paquet ». Les conflits s'arbitrent en dessous.
6. Téléphone : recevoir les fichiers `eopur_accuse_…` : chaque saisie passe à « Intégré à la base ».

## Correspondance avec la trame de suivi

| EOPUR OS | Colonne « Fait Oui/Non/Retour » |
|---|---|
| Intervention réalisée, Terminé | Fait |
| Absent | Abs |
| À repasser | Retour |
| Problème technique | Com Client |
| Inaccessible | Inaccessible |
| Refus d'accès | Refus |
| À planifier, À prévenir, Passage programmé | (vide) |
