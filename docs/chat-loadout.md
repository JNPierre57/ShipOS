# !loadout — feasibility assessment (avant implémentation)

Utilisation : activer « !ship / !loadout vers ShipOS (local) » dans le Chat Overlay, puis envoyer exactement `!loadout`. Aucun changement OBS. Refus dans le diagnostic local ; aucun message envoyé sur Twitch.

Réglages du module Chat !loadout : activation, cooldown global 30 secondes, durationMs de 7 à 10 secondes (défaut 10), maxDisplayedModules de 5 à 8 (défaut 8). Au maximum dix lignes dont titre et nombre de modules omis. Quatre core majeurs prioritaires, bouclier et accessoires ; une place réservée aux armes si présentes. Le Director gère le slot commun, la file (expiration 15 secondes) et la priorité aux urgences.

Le ViewModel est construit en mémoire à partir de WorldState.ship.Modules. Aucun nouveau polling, service, catalogue réseau ou stockage. Les cosmétiques sont ignorés. Les groupes ne fusionnent que des modules identiques, engineering compris. GET /api/v1/commands/loadout/status expose la disponibilité ; POST /api/v1/commands/loadout réutilise l'authentification de !ship.

Huit simulations SourceEvent « Loadout … » : Cutter Cargo, Clipper Exploration, Combat Engineered, No Engineering, Inactive, Stale (connexion coupée), Ship Switch et Partial. Tests automatisés du formatage, engineering, regroupement, données partielles, garde commune, outfitting, changement de vaisseau, cooldown, coexistence, priorité critique et rendu animé.

Validation : ShipOS verify:final réussi (34 unitaires, 47 intégration, 30 golden, 13 navigateur et frontières architecturales). Chat Overlay : 58 tests et 11 scénarios navigateur réussis. Projection seule mesurée sur 10 000 fiches Combat Engineered : environ 0,015 ms par fiche sur le Mac de développement ; ce chiffre ne mesure ni OBS ni le GPU. Test en jeu réel à effectuer par l'utilisateur.

Vérification du 12 septembre 2026 : lecture seule des Loadout Cutter et explorer_nx réellement enregistrés dans la base locale, et contrôle du [Journal Frontier v37, §3.4 et §8](https://hosting.zaonce.net/community/journal/v37/Journal_Manual_v37.pdf).

1. Disponibles : Modules structurés dans WorldState.ship, Slot, Item, Engineering.BlueprintName, Level, ExperimentalEffect et parfois ExperimentalEffect_Localised. Modifiers contient les valeurs et valeurs d'origine. AmmoInClip / AmmoInHopper existent sur certaines armes et SCB.
2. Limites : pas de champ classe/rating universel, noms localisés souvent absents, aucun engineering sur le Cutter observé. Les codes size/class des modules internes ordinaires permettent une normalisation limitée ; armes et modules spéciaux ne doivent pas hériter de cette correspondance. Les munitions du Loadout ne constituent pas un compteur de combat en direct.
3. Affichage direct : identité, principaux modules, blueprint/grade/effet présents. Petite table locale, aucun catalogue téléchargé au runtime. Noms inconnus normalisés sans inventer de caractéristiques.
4. Calculs nécessaires : seulement tri de priorité et comptage des modules identiques (y compris engineering). Pas de reconstruction des performances du vaisseau.
5. Exclus : munitions en temps réel, résistances, DPS, portée calculée, EDSY/Coriolis, classification de rôle. Les valeurs source structurées restent conservées.

Loadout est réémis au démarrage, au changement de vaisseau et après outfitting. ModuleBuy/Retrieve/Sell/Store/Swap et MassModuleStore rendent la configuration précédente provisoirement indisponible jusqu'au nouveau snapshot complet. Le simple catalogue Outfitting et les transferts de modules stockés ne modifient pas le vaisseau installé. Une conversion engineering en aperçu n'invalide pas l'état.

Correction du 15 septembre 2026 : aucun nouveau Loadout n'a suivi les 131 opérations EngineerCraft de la session observée. Attendre systématiquement ce snapshot bloquait donc !ship et !loadout dès la première modification. EngineerCraft et les conversions appliquées mettent désormais à jour l'engineering du slot installé lorsque Slot, Module, blueprint, grade, qualité et modificateurs sont cohérents avec une configuration déjà validée de la même session/Agent. Les anciennes propriétés d'engineering sont remplacées ; aucun ancien effet absent de l'événement n'est conservé. Une cible inconnue, ambiguë, une donnée incomplète ou un état déjà invalidé ne peuvent pas reconstituer une configuration fiable : un Loadout complet reste alors nécessaire. Cette projection utilise le [Journal Frontier v37, §8.13–8.14](https://hosting.zaonce.net/community/journal/v37/Journal_Manual_v37.pdf) et la forme des événements réellement reçus.

Après cette mise à jour partielle, !ship omet la portée maximale et les agrégats de masse/valeur/rebuy devenus incertains jusqu'au prochain Loadout complet. Il continue d'afficher l'identité et les autres données confirmées. Les fiches déjà affichées ou en attente sont revalidées lorsque la configuration change. Aucun calcul de performance ni interrogation réseau n'est ajouté.

Le contrôle Elite de !ship est partagé : session confirmée, agent connecté, Status validé dans cette connexion, vaisseau principal et Loadout cohérent. Shutdown bloque les deux commandes. Comme !ship, un crash sans Shutdown avec agent encore connecté n'est pas détecté ; la présence au premier plan n'est pas vérifiée. L'utilisateur ferme Elite avant un autre jeu.
