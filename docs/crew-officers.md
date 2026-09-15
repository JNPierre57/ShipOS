# Crew / officiers de passerelle

Le Crew personnalise certaines communications que ShipOS a déjà retenues par son Director. Il ne crée pas de nouveaux événements d’attention, n’utilise aucun LLM et ne remplace pas les panneaux SYSTEM critiques. Une communication reste soumise au budget, à la file, au TTL, au cooldown et aux interruptions habituels.

## Commandes

| Commande | Résultat |
| --- | --- |
| `!crew NAV` | rejoindre Navigation |
| `!crew SCI` | rejoindre Science |
| `!crew ENG` | rejoindre Engineering |
| `!crew ING` | alias de Engineering |
| `!crew TAC` | rejoindre Tactical |
| `!crew leave` | quitter l’équipage du live |

Plusieurs viewers peuvent être dans le même département. Refaire la même commande est idempotent. Un changement de rôle retire l’ancien département avant d’ajouter le nouveau. L’identité stable Twitch est utilisée en priorité, puis le login normalisé, puis le display name. Le suivi d’activité envoie uniquement l’identité et l’heure du message au Core ; aucun contenu de chat n’est stocké pour le Crew.

## Conditions et présence

Le Crew est disponible uniquement lorsque le stream OBS est actif et que la session Elite suivie par l’Agent possède une télémétrie récente et validée. La fermeture d’Elite suspend les communications mais conserve le roster. Une déconnexion WebSocket OBS temporaire le conserve également. Un véritable STOP OBS vide le roster immédiatement ; un nouveau broadcast repart vide. Le roster persiste dans `settings` pendant le broadcast courant afin qu’un redémarrage du Core puisse le reprendre après vérification de `startedAt`.

La fenêtre active duty vaut 20 minutes par défaut. Un membre silencieux reste membre, mais n’est plus choisi pour parler tant qu’il n’a pas écrit récemment. Parmi les membres actifs, ShipOS effectue une rotation déterministe. S’il n’existe aucun officier actif, la définition SYSTEM originale est conservée.

## Routage éditorial

| Famille d’événement | Département |
| --- | --- |
| analyses exobiologiques, valeur exobiologique, découverte remarquable, signaux biologiques | SCI |
| sauts, arrivée, retour dans un système, progression de navigation | NAV |
| carburant bas, configuration, modules, équipement, température, réparations, raffinage | ENG |
| combat, récompense de combat, menace attestée, contact hostile attesté | TAC |
| destruction, coque critique, séquences fatales, tension et récupération critique | SYSTEM |

Les données affichées dans COMM sont celles déjà présentes dans la présentation sélectionnée : système, corps, estimation, seuil observé ou valeur de coque. Une donnée absente reste absente.

## Présentation

Les cartes COMM utilisent une grammaire visuelle distincte : `COMM // SCIENCE`, le pseudo du viewer en évidence, une icône de département et une couleur stable. Les phrases sont courtes, pré-écrites et réparties en banques variées. L’historique récent évite la répétition immédiate. L’audio est silencieux par défaut ; les confirmations d’affectation sont de faible priorité et peuvent être désactivées dans le Control Panel.

Le Control Panel affiche l’état OBS/Elite, le broadcast associé, les membres et leur dernière activité, le dernier officier, la dernière communication et le dernier motif de repli. `RESET CREW` est disponible pour le diagnostic manuel.

## Simulations et limites

Les scénarios isolés **Crew Science**, **Crew Navigation**, **Crew Engineering**, **Crew Tactical**, **Crew Multiple Officers**, **Crew Inactive Officer**, **Crew No Officer** et **Crew Critical Override** injectent un roster fictif dans une base SQLite en mémoire. Ils n’appellent ni Twitch ni OBS.

Un crash du Core avant réception d’un STOP OBS ne peut être déduit que lors de l’observation du broadcast suivant. Les données Twitch ne sont pas rétro-importées : la présence active commence avec les messages vus par DynamicChatOverlay pendant le live. Le Crew ne commande ni Elite ni OBS.
