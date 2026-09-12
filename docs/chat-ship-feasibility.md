# FEASIBILITY ASSESSMENT

Étude du 12 septembre 2026. Aucune implémentation ni modification du service déployé. Version validée par les essais du stream : `395a875`, sauvegardée sur GitHub sous `before-chat-ship` avant cette étude.

**Verdict : carte, données et intégration légères réalisables. La garantie absolue « jamais de fiche lorsque le jeu utilisé est NMS » nécessite une preuve d’activité que le système actuel ne possède pas. Ne pas assimiler un TTL à cette garantie.**

## 1. Sources et vérification des données

Référence primaire consultée : [manuel Frontier Journal v37, §3.4 et §14](https://hosting.zaonce.net/community/journal/v37/Journal_Manual_v37.pdf). Cette version couvre les changements jusqu’en mai 2023 ; elle n’est pas présentée comme la dernière spécification de toutes les fonctions du jeu. Vérification complémentaire en lecture seule dans les sources réellement conservées par ShipOS.

| Information | Source réelle | Présentation proposée |
| --- | --- | --- |
| Modèle, nom, identifiant | Loadout : Ship, ShipName, ShipIdent | Libellé du modèle normalisé ; pas de confusion avec ShipID numérique |
| Portée | Loadout.MaxJumpRange | JUMP MAX, jamais portée actuelle garantie |
| Carburant | Status.Fuel.FuelMain ; Loadout.FuelCapacity.Main | Réservoir principal / capacité principale ; réserve séparée si affichée |
| Cargo | Status.Cargo ; Loadout.CargoCapacity | Masse transportée / capacité |
| Rachat | Loadout.Rebuy | Coût communiqué par le jeu |
| Boucliers | Status.Flags, bit 3 | UP/DOWN, sans pourcentage ni puissance |
| FSD | Flags : mass-lock, charge, cooldown, saut | État observé ; absence de ces flags ne garantit pas READY |
| Système | Location/FSDJump.StarSystem | Facultatif, lié à la session courante |

Le maximum de saut suppose zéro cargo et le carburant nécessaire à un seul saut. Les données de configuration sont ponctuelles ; elles ne nécessitent pas un rafraîchissement à chaque seconde. Les valeurs dynamiques viennent de Status, avec leur propre fraîcheur. Les champs facultatifs absents seront omis, jamais remplacés par zéro. Aucun calcul de simulateur de build.

Contrôle local : 39 Loadout ; les sept groupes Ship, ShipName, ShipIdent, FuelCapacity, CargoCapacity, MaxJumpRange et Rebuy sont présents dans chacun. Sur 12 111 Status, Fuel et Cargo apparaissent dans 10 378 : leur absence est réelle et doit être gérée. Ces comptes ne garantissent pas la présence future de chaque champ. Aucun journal ni nom personnel n’est inclus dans ce document.

## 2. Existant réutilisable et écarts

- `apps/agent/src/tailer.ts` lit déjà Journal, Status et NavRoute. Status n’est envoyé que si son contenu change ; une nouvelle lecture du même fichier ne prouve rien sur le jeu.
- `apps/agent/src/transport.ts` et `apps/core/src/gateway.ts` : heartbeat 10 s, seuil configuré de perte 30 s. Ils attestent du transport et de l’Agent, pas de l’exécution d’Elite. `agent_status` ne contient actuellement que la profondeur du spool.
- `apps/core/src/world.ts` conserve le Loadout dans `world.ship`, le carburant, les flags et le contexte de véhicule. **Cargo de Status n’est pas copié dans WorldState**. Les horodatages par groupe et l’identité de session/source restent à ajouter. Le merge actuel d’un Loadout devra éviter de garder les propriétés facultatives d’un ancien vaisseau.
- `apps/core/src/external.ts` expose un abonnement sortant `elite.*`. **Il n’existe pas d’entrée de commande externe** : ne pas détourner cet abonnement ni fabriquer un SourceEvent Elite pour une commande Twitch.
- `apps/core/src/director.ts`, `presentation.ts`, le contrat PresentationAction et le renderer sont réutilisables. Ordre réel à préserver : commande → événement interne → Director → moteur de présentation → PresentationAction → overlay. Une action d’affichage ne doit pas précéder la décision du Director.
- Le dépôt voisin DynamicChatOverlay possède déjà Twitch EventSub, normalisation et déduplication dans `src/server/pipeline.ts`. Un petit adaptateur après validation transmettrait uniquement la commande vers ShipOS. Les simulations de ce chat doivent rester explicitement séparées du live.
- DynamicChatOverlay n’a actuellement qu’une autorisation de lecture du chat et interdit l’envoi de messages dans sa conception. Proposition minimale : réponse structurée au pont local et diagnostic backoffice, **aucun message Twitch automatique**. L’option de réponse dans le chat demanderait un chantier d’autorisation distinct.

## 3. Elite actif : limite de faisabilité

Les observations existantes permettent une disponibilité prudente : session ouverte, Agent identifié et connecté, Status récent de la même session, contexte mainShip et Loadout correspondant. Elles ne permettent pas de certifier le jeu actuellement utilisé sur Windows.

Contre-exemples :

1. Elite plante sans Shutdown ; une commande arrive deux secondes après. Son dernier Status passe encore un TTL de 30 s.
2. Elite continue de produire des données en arrière-plan pendant que NMS est utilisé. Même une télémétrie très récente ne désigne pas le jeu au premier plan.
3. Un spool en retard retransmet des sources anciennes : l’heure de réception du Core est récente, leur contenu ne l’est pas.
4. Un Core restauré possède le dernier Loadout ; un pong de l’Agent ne revalide pas ce vaisseau.

**Condition d’arrêt appliquée à cette exigence stricte : aucune déclaration ELITE_ACTIVE fiable sur la seule base du heartbeat ou d’un TTL.** L’étude n’autorise pas silencieusement une version qui échouerait au cas NMS.

Deux voies possibles :

- **Version minimale fondée sur la télémétrie** : refus au doute, invalidation immédiate sur Shutdown ou déconnexion, TTL court. Une demande peut attendre une nouvelle observation produite après son arrivée, via le flux existant, puis expirer sans afficher. Cela réduit le risque après fermeture, mais ne résout pas Elite actif en arrière-plan. Sa garantie serait « session Elite récemment observée », donc moins forte que le cahier des charges.
- **Version conforme au jeu réellement utilisé** : une preuve explicite côté Shadow, associée à la requête ou à un état vérifié, doit identifier Elite comme contexte actif. À étudier comme petite extension de l’Agent et du WebSocket existants, pas comme nouveau daemon. La présence du seul processus Elite ne suffit pas pour le cas de deux jeux ouverts. La méthode Windows, sa compatibilité avec Shadow et son coût restent à vérifier avant de promettre cette solution.

Une catégorie Twitch ou une scène OBS ne constituerait pas cette preuve. Aucun mécanisme de détection Windows n’a été ajouté dans cette étude.

## 4. Stratégie anti-stale proposée

- Disponibilité volatile, initialisée UNKNOWN à chaque démarrage du Core ; historique distinct de l’état actif.
- Identité source : agentId, génération de connexion, session Elite et ShipID. Invalidation lors d’un changement de session, de vaisseau ou de source.
- Groupes `identity/configuration`, `status`, `location`, chacun avec sourceId et timestamp. Une configuration n’expire pas simplement parce que le joueur voyage longtemps ; elle reste valide seulement dans une session confirmée et tant qu’aucun changement ne l’invalide.
- Horloge : distinguer réception Core et production Agent ; rejeter les dates futures incohérentes et les reprises de spool anciennes. Une vérification sur demande doit être liée à un identifiant unique et non à un ancien message mis en cache.
- Valeur initiale à tester : Status âgé d’au plus 30 s. Dans l’historique, médiane d’intervalle 1 s, p95 10 s, 17 intervalles supérieurs à 30 s. Ces statistiques incluent les arrêts et transitions : elles ne constituent pas un test d’Elite immobile au dock ou au menu.
- Refuser la fiche du vaisseau principal en contexte onFoot, SRV, fighter, taxi ou multicrew pour cette première version.
- Revalider **au moment de la commande et avant son affichage différé**. Invalider aussi une fiche active sur fermeture, changement de jeu attesté ou perte du contexte. Ne jamais laisser une commande en file faire apparaître un ancien vaisseau.
- UNKNOWN, INACTIVE et état incomplet ont des motifs distincts. Sans preuve suffisante, aucune action contenant la fiche ne part vers l’overlay.

## 5. Intégration minimale proposée

Un POST local authentifié, par exemple `/api/v1/commands/ship`, dans le serveur existant. Contrat fermé : version, requestId/messageId, plateforme et horodatage ; identifiant du viewer seulement si utile. Le client ne fournit ni les statistiques du vaisseau ni une preuve d’activité digne de confiance. Limites de taille, durée de requête, requêtes simultanées et déduplication bornée ; refus des anciens messages.

Le pont chat utilise une requête HTTP locale seulement pour `!ship`, sans connexion Twitch supplémentaire. Son échec ne bloque jamais le chat. Pas de jeton Twitch transmis à ShipOS ; secret local dédié au pont. Pas de mise en attente durable des commandes à rejouer au redémarrage.

Module désactivable, faible priorité, durée 6 s par défaut, cooldown global 20 s. Aucun contournement du budget ou de la file. Déduplication au niveau de la requête et de la famille de commande. Les critères d’activité sont également testés à la sortie de file ; TTL court et suppression en cas de perte de contexte. Vérifier la préemption par hull critical, low fuel et ship destroyed, y compris lorsqu’ils arrivent après la carte.

ViewModel compact dans la présentation standard : identité et quelques lignes de statistiques, animation transform/opacity existante. Le renderer terminal actuel tronque à trois lignes en FULL et une en COMPACT : prévoir un rendu de fiche compact dédié dans le même renderer, plutôt que d’envoyer huit lignes qui seraient invisibles. Aucun moteur graphique, aucune nouvelle source OBS, aucun son requis.

Configuration limitée : enabled, cooldownMs, durationMs, freshnessTTL ; état d’indisponibilité visible au backoffice. Ne pas annoncer `chatResponseWhenUnavailable` comme opérationnel sans capacité d’écriture Twitch.

## 6. Coût estimé

| Axe | Estimation de conception, non benchmarkée |
| --- | --- |
| CPU au repos | Aucun polling ni timer spécifique à la commande ; petite mise à jour de métadonnées lors des sources existantes |
| CPU par commande | Validation et projection de quelques champs ; pas de scan du journal ou des modules |
| RAM | Quelques groupes de valeurs et déduplication bornée ; aucune copie de l’historique galactique |
| Réseau | Un petit échange HTTP local et les actions overlay habituelles ; échange Agent facultatif si vérification sur demande retenue |
| Latence | Traitement local court ; attente explicite possible pour confirmer une observation ; Director peut différer/refuser |
| Stockage | Tables existantes pour événements/décisions/settings ; pas de base supplémentaire |
| Complexité | Faible pour la carte et le pont ; point sensible : preuve du contexte actif et revalidation différée |
| Maintenabilité | Handler métier dans ShipOS, adaptateur indépendant dans le chat, renderer ignorant Elite |

# IMPLEMENTATION PLAN

1. **Résoudre le critère de contexte actif avant l’implémentation de production.** Tester arrêt normal, crash, dock immobile, menu et Elite laissé ouvert derrière NMS. Évaluer la petite preuve côté Agent si la garantie stricte reste requise. Ne pas remplacer cette vérification par une hypothèse.
2. Ajouter les groupes de fraîcheur au WorldState, Cargo et invalidations ; disponibilité volatile avec Clock injectable. Fixtures de données manquantes, changement de vaisseau, redémarrage Core et backlog ancien.
3. Ajouter l’entrée locale authentifiée et le handler `chat.command.ship`, projection limitée au WorldState, déduplication et logs sobres. Garder l’API sortante inchangée.
4. Ajouter le module de présentation et sa revalidation avant affichage ; tests de concurrence, cooldown et préemption critique. Vérifier les reconnexions de l’overlay pour éviter de restaurer une carte invalidée.
5. Ajouter le pont optionnel dans DynamicChatOverlay après déduplication ; tester arrêt ShipOS et séparation stricte des simulations. Sauvegarder ce dépôt avant toute modification future.
6. Scénarios isolés : Cutter, Clipper, données facultatives absentes, stale, Agent déconnecté, NMS avec ancien WorldState, reconnexion et changement de session. Ajouter NMS pendant attente en file et Elite encore ouvert en arrière-plan.
7. Mesurer CPU/latence et animation avec le pipeline habituel ; test manuel Shadow indispensable pour valider le signal de jeu. Documenter activation, désactivation et diagnostic. Puis seulement déployer une fonctionnalité dont les critères annoncés ont été vérifiés.

**Périmètre de la présente livraison : version sauvegardée et étude achevée. Aucun code fonctionnel, nouveau processus, message Twitch, redémarrage ou changement OBS.**
