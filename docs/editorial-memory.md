# Mémoire éditoriale — version 1

ShipOS adapte désormais le texte et la fréquence des interventions aux faits observés dans la session et dans son historique. La sélection reste déterministe : aucun LLM, abonnement ou service supplémentaire. Les alertes utilisent les séquences animées existantes, sans ajouter de rendu permanent.

## Comportement

| Situation observée | Intervention |
| --- | --- |
| Retour dans un système quitté depuis au moins 7 jours | Nom réel du système et durée depuis la dernière observation |
| Reprise d’un vaisseau connu | Nom réel, absence ou vaisseau précédent et nombre de sessions où il a été observé |
| Nouvelle signature de configuration | Première observation ou mise à jour, nom du vaisseau, nombre de slots modifiés |
| Activité reprise après au moins 7 jours | Reprise de l’activité avec durée d’absence |
| Première activité suffisante de la session | Ouverture du suivi, compteur factuel |
| Activité soutenue | Progression après au moins 3 nouveaux événements et 4 minutes depuis la dernière proposition de cette famille |
| Découvertes remarquables / analyses précieuses | Première de la session, nouvelle catégorie de corps (avec sa nature affichée), regroupement des répétitions, bilan de série ; nouveau maximum estimé observé pour les analyses |
| Sortie d’une phase dangereuse | Confirmation et durée de la phase précédente, fondées sur la télémétrie de récupération |

Les familles couvertes sont le voyage (5 sauts avant la première proposition), le combat (2 récompenses observées, sans les appeler des victoires), le raffinage minier, l’ingénierie, l’équipement, le commerce, les missions terminées, les transferts Powerplay, les analyses biologiques, les scans (5 événements), le déploiement SRV et le débarquement. Les compteurs portent sur les événements reçus, pas sur un nombre supposé d’objets uniques. Les types et valeurs des cinq événements publics restent inchangés.

BGS et minage de surface conservent leurs preuves et leur statut expérimental dans Context Lab. Ils ne deviennent pas des affirmations sur les intentions du joueur. Le système ne peut pas connaître une activité qui n’a pas été enregistrée, ni affirmer qu’un vaisseau vient d’être acheté simplement parce qu’il le voit pour la première fois.

Les propositions ordinaires partagent un espacement minimum de 90 secondes. Les configurations conservent leur propre cooldown. TENSION et CRITICAL empêchent les interventions ordinaires ; les alertes de sécurité gardent leurs priorités. Le Director conserve également ses budgets, cooldowns, profils compacts et règles de file. Une proposition éligible peut donc encore être refusée. Les compteurs de cadence mesurent les **propositions**, pas une garantie d’affichage ou de visionnage dans OBS.

Il n’existe aucun déclencheur « le silence dure depuis trop longtemps ». Une activité soutenue apporte de nouveaux faits et permet des bilans réguliers ; une télémétrie inactive reste silencieuse. Les formulations varient à partir de ces faits, avec une alternance déterministe pour certaines ouvertures répétées. Ce n’est pas une génération libre de phrases.

## Persistance et inspection

Migration additive `003-editorial.sql` : mémoire par commandant / système / vaisseau / espèce / activité / record, état de session et notes éditoriales. Les écritures d’un événement sont dans la transaction de traitement de sa source. Un redémarrage du Core ne réinitialise pas la session éditoriale ; `LoadGame` ouvre une nouvelle session et `Shutdown` la clôt.

Au premier démarrage, un rattrapage par lots lit les sources déjà traitées et les analyses précieuses historiques. Il est reprenable et silencieux. Il ne génère ni événement ni animation pour les anciens faits. Les horodatages des sources servent à la mémoire ; une donnée ancienne arrivée en retard ne déplace pas artificiellement une dernière observation vers aujourd’hui.

Les données de gameplay ne sont ni supprimées ni transférées. La mémoire compacte prépare une future politique d’archivage, qui reste un chantier distinct. Les historiques bruts et les notes éditoriales continuent donc de croître sur disque.

Dans **Context Lab → Editorial memory**, les 30 dernières notes montrent la famille, l’éligibilité, le motif de silence ou de proposition, les faits, les sources et la décision du Director. Les lignes choisies sont conservées au moment de la présentation. La même inspection existe pour chaque simulation isolée. `shipos.editorial.moment` reste interne et n’est pas publié vers les clients externes `elite.*`.

## Essai avant le stream

1. Actualiser le backoffice et le cache de la source navigateur ShipOS dans OBS ; conserver `/overlay/?motion=full`.
2. **Simulation → SourceEvent → System Return**, vitesse ×1 : retour dans « Remembered Haven » après 23 jours.
3. **Ship Reunion**, vitesse ×1 : reprise de « Old Companion ».
4. **Editorial Journey**, vitesse ×20 : progression en voyage, autre espèce biologique, raffinage, commerce, mission et ingénierie. La timeline dure 16 minutes virtuelles ; ×1 permet de juger le rythme réel.
5. **Quiet Travel** reste silencieux : ses trois sauts sont insuffisants pour un bilan. Un second lancement repart d’un état isolé neuf et remplace le précédent.

Les deux scénarios de retour reçoivent uniquement une mémoire synthétique. Les replays ordinaires commencent sans mémoire antérieure à leurs fichiers. Ils reconstruisent celle contenue dans les sources importées. Aucun scénario ne touche l’historique live.

## Validation et coût

Tests : cadence avec preuves nouvelles, silence inactif, priorité du danger, familles d’activités, texte d’espèce, regroupement et records, payloads publics inchangés, alternance entre sessions, sources tardives, rollback, reprise de mémoire et rattrapage idempotent. Les scénarios ont des résultats déterministes. Le test navigateur vérifie les lignes historiques animées et leur inspection dans le Lab.

Rattrapage essayé sur une copie SQLite de la base existante : 8 798 sources, 13 systèmes, 17 espèces, un vaisseau, quatre familles d’activités et une référence de record. Initialisation mesurée à 88 ms, intégrité SQLite vérifiée, aucune note éditoriale ni alerte générée par le rattrapage.

`npm run build:node && node scripts/benchmark-editorial.mjs` compare A/B/A sur 1 200 sources et un WorldState synthétique de 422 Ko (325 corps). Mesure locale du 9 septembre : sans couche éditoriale, p95 8,13 puis 7,84 ms ; avec, 7,72 ms. Temps total 8,94 / 8,72 / 8,78 s. L’écart se situe dans la variabilité de cette mesure ; le maximum avec mémoire atteint 17,15 ms. Ce test ne mesure pas les FPS d’OBS ou de Shadow. La validation pendant le stream reste nécessaire.

## Versions et retour arrière

Le tag **before-editorial-memory** sauvegarde la version précédente (`fda95b2`), avant ces travaux. Pour revenir au code précédent, arrêter le Core, construire ce tag dans un checkout propre puis relancer le service avec ce code. Conserver la base actuelle : les nouvelles tables sont additives et l’ancien code les ignore. Ne pas restaurer une ancienne base par-dessus les nouvelles sessions de gameplay.
