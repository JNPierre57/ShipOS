# Commande chat !ship

## Utilisation

Un message Twitch contenant exactement `!ship` (casse indifférente) demande une fiche du vaisseau dans la source ShipOS existante : `http://127.0.0.1:48100/overlay/?motion=full`. Aucune nouvelle Browser Source. DynamicChatOverlay relaie la commande depuis sa connexion Twitch habituelle ; aucun message n’est envoyé dans le chat.

Valeurs initiales : fiche silencieuse de 6 secondes, cooldown global de 20 secondes, fraîcheur Status maximale de 45 secondes. Le rendu conserve les animations terminal et affiche jusqu’à huit lignes en FULL ; le Director peut choisir un format COMPACT ou refuser la demande. La fiche a une priorité inférieure aux alertes de sécurité et peut être interrompue par celles-ci.

Champs facultatifs : nom et identifiant, JUMP MAX, carburant principal/capacité principale, cargo/capacité, rebuy. Boucliers UP/DOWN et FSD observé complètent la fiche. JUMP MAX n’est pas la portée réelle chargée ; IDLE ne garantit pas qu’un saut soit possible. Pas de pourcentage de boucliers ni de simulation de build. Les identifiants de modèles non présents dans la petite table locale restent affichés comme identifiants techniques.

## Disponibilité et limites convenues

L’utilisateur a précisé qu’Elite est toujours fermé avant de passer à un autre jeu. La version retient donc **une session Elite confirmée et sa télémétrie**, sans détection de processus ou de fenêtre au premier plan.

- Shutdown invalide la session même si un dernier Status arrive ensuite. Le vaisseau historique reste mémorisé mais ne peut pas être affiché.
- Agent déconnecté : refus. Une reconnexion nécessite un nouveau Status live de cet Agent avant de revalider le contexte.
- Core redémarré : disponibilité volatile initialement inconnue. Un WorldState historique ne suffit pas. Une session restaurée doit recevoir un nouveau Status live valide ; une ancienne base sans métadonnées nécessite une nouvelle entrée en partie.
- Données anciennes, date future incohérente, absence de configuration, contexte à pied/SRV/fighter/taxi/multicrew : refus.
- Changement de vaisseau : remplacement du Loadout et attente d’un Status correspondant ; pas de reprise des champs facultatifs de l’ancien vaisseau.
- Mort et résurrection : configuration et Status à reconstruire, sans exiger artificiellement un nouveau LoadGame.
- Contrôle à la demande, lors de la sortie de file, à la reconnexion overlay et pendant l’affichage. La vérification temporelle réutilise le tick de contexte existant à 1 Hz ; aucun polling spécifique.

**Après un crash sans Shutdown, des données peuvent rester admissibles jusqu’à l’expiration du TTL de 45 secondes.** Le retrait d’une fiche sur expiration intervient au tick suivant. La présence d’Elite en arrière-plan pendant l’utilisation d’un autre jeu n’est pas détectée ; elle est exclue par la règle d’utilisation convenue. Ce n’est pas une garantie de premier plan.

Les observations de la vérification accompagnée sont consignées dans [l’étude préalable](chat-ship-feasibility.md). Nous avons constaté des Status espacés d’environ 24 secondes dans la situation testée ; cela motive la marge de 45 secondes.

## Réglages et diagnostic

Dans ShipOS, le module **Chat !ship** permet la désactivation, le réglage du cooldown via la politique et les paramètres `durationMs` / `freshnessTTL` via sa configuration. Context Lab affiche la disponibilité et le motif de refus. Le diagnostic est aussi lisible à `/api/v1/commands/ship/status`.

Dans DynamicChatOverlay : **Règles → !ship vers ShipOS (local)** active ou coupe le pont. Les commandes ne dépendent pas des restrictions des effets `!shake`, `!boom`, `!signal`.

Le Core génère au démarrage un secret local `chat-bridge.token` (permissions 0600) dans son répertoire de données. Le pont le lit à chaque demande, depuis `~/Library/Application Support/ShipOS/chat-bridge.token`. Ne pas publier ce fichier. Un répertoire de données ou port ShipOS personnalisé nécessite d’adapter le pont ; cette installation utilise les chemins et ports par défaut.

L’entrée `POST /api/v1/commands/ship` exige ce secret Bearer et un petit JSON fermé : `requestId`, `timestamp`, `platform: "twitch"`. Les données de vaisseau envoyées par un client sont interdites. L’événement `shipos.command.ship` reste interne ; l’API sortante `elite.*` ne change pas. Les identifiants sont dédupliqués, les requêtes anciennes rejetées. Le pont borne les tentatives, n’accumule aucune file et ne réessaie pas les vieux messages si ShipOS est arrêté.

## Essais et validation

Simulation SourceEvent : **Ship Card Cutter**, **Ship Card Clipper**, **Ship Card Stale**, **Ship Card Disconnected**, **Ship Card NMS**. Les deux premiers affichent la fiche ; les trois derniers refusent. Le scénario NMS représente la règle convenue : Elite fermé, ancien vaisseau encore en mémoire. Les diagnostics du run contiennent le résultat de la commande. Les marqueurs de simulation n’existent que dans les runs isolés ; les démonstrations du chat ne transmettent jamais de demande au Core live.

Tests automatisés : projection des champs, absence d’audio, cooldown, doublons, authentification, refus des champs forgés, fermeture et Status final, données périmées, déconnexion/reconnexion, démarrage froid, champs absents, remplacement de vaisseau, refus après attente, priorité low fuel, récupération après mort, scénarios isolés et rendu des huit lignes. Tests du pont : commande exacte, déduplication, désactivation, exclusion des simulations, message ancien, jeton absent et serveur indisponible. Les autres tests ShipOS et chat sont également exécutés.

`npm run build:node && node scripts/benchmark-ship-command.mjs` mesure 300 commandes dans une base isolée, sans Twitch ni affichage live. Ce test mesure le traitement local, pas les FPS OBS/Shadow. Un essai réel en tapant `!ship` sur Twitch avec Elite lancé reste à effectuer après installation.

## Versions

- ShipOS avant travaux : `before-chat-ship` (`395a875`).
- Chat avant pont : tag local `before-shipos-bridge` (`4fbb544`) dans DynamicChatOverlay.
- Le pont est versionné dans son dépôt local ; une copie de son patch source accompagne cette livraison dans `integrations/dynamic-chat-overlay.patch` pour reproductibilité.

Après installation : actualiser le backoffice et la source navigateur ShipOS dans OBS. Aucun changement Agent sur le Shadow. Les services Mac doivent être redémarrés pour charger le nouveau code, pas pour chaque commande.
