# ShipOS V1 — MASTER IMPLEMENTATION SPECIFICATION

## 0. MISSION

Tu dois construire dans ce repository une première version complète, robuste, testée, documentée et réellement utilisable de **ShipOS**.

ShipOS est un système de bord audiovisuel local destiné principalement à accompagner un stream Twitch d’Elite Dangerous.

Il doit :

- observer les données réellement produites par Elite Dangerous sur un PC Shadow Windows ;
- transporter ces données de manière fiable vers un Mac ;
- maintenir un état cohérent du monde ;
- transformer les données sources en événements métier ;
- décider lesquels méritent l’attention du stream ;
- orchestrer overlays, animations et audio ;
- exposer les DomainEvents à des applications locales externes ;
- permettre simulation, replay, inspection, configuration et diagnostic ;
- être suffisamment modulaire pour évoluer pendant plusieurs années.

Cette instruction est un **handoff ONE SHOT**.

Tu dois lire ce document entièrement avant de commencer, inspecter le repository, établir ton plan interne, puis avancer automatiquement jusqu’à la Definition of Done.

Tu ne dois PAS interrompre le travail pour demander une validation humaine entre les phases.

Une intervention humaine n’est justifiée qu’en cas de :

- credential ou secret réellement manquant ;
- action destructive irréversible ;
- blocage externe réel ;
- contradiction technique impossible à résoudre par documentation, tests ou observation ;
- décision produit dont plusieurs solutions incompatibles sont réellement équivalentes et que rien dans cette spécification ne permet de départager.

Une difficulté de développement normale n’est pas un motif pour interrompre l’exécution.

---

# 1. RÈGLE ABSOLUE : LES FAITS TECHNIQUES DOIVENT ÊTRE VRAIS

Ne jamais inventer :

- un événement Elite Dangerous ;
- un champ JSON ;
- une valeur d’enum ;
- une propriété ;
- une API ;
- une méthode de bibliothèque ;
- une option de configuration ;
- un comportement de fichier ;
- un comportement OBS ;
- une commande Tailscale.

Avant d’implémenter tout comportement reposant sur une donnée externe critique, vérifier l’information dans une source actuelle.

Ordre de confiance recommandé pour Elite Dangerous :

1. documentation Frontier officielle actuelle ;
2. documentation reconnue du Player Journal ;
3. Journals réels récents ;
4. développeurs/projets Elite reconnus et maintenus, notamment EDMC, EDDiscovery, Elite Observatory, EDDI ou équivalents ;
5. projets open source reconnus ;
6. sources communautaires uniquement comme corroboration.

Pour les technologies :

1. documentation officielle ;
2. release notes officielles ;
3. métadonnées npm officielles ;
4. repository du mainteneur.

Si deux sources se contredisent :

1. identifier explicitement la contradiction ;
2. rechercher la raison probable : documentation obsolète, changement de version, bug connu, différence Legacy/Live, erreur de documentation ;
3. tester sur une fixture ou un exemple réel lorsque possible ;
4. retenir le comportement le plus prudent ;
5. documenter la décision.

Créer et maintenir :

`docs/technical-validation.md`

Pour chaque fait externe important, enregistrer au minimum :

- claim ;
- classification ;
- source(s) ;
- date de vérification ;
- conclusion ;
- code impacté ;
- éventuelle contradiction.

Utiliser les classifications :

- VERIFIED_FACT
- ARCHITECTURAL_CHOICE
- CONFIGURABLE_VALUE
- HYPOTHESIS
- EXPERIMENTAL

Créer également :

`docs/deviations.md`

Si cette spécification contient un détail factuellement incompatible avec la réalité actuelle :

- ne pas implémenter aveuglément l’erreur ;
- ne pas bricoler silencieusement ;
- conserver l’intention fonctionnelle ;
- adapter le détail technique ;
- ajouter un test ;
- expliquer précisément l’écart dans `docs/deviations.md`.

Les invariants architecturaux ne peuvent pas être ignorés simplement parce qu’une autre architecture serait personnellement préférée.

---

# 2. CONTEXTE RUNTIME

## Shadow Windows

Elite Dangerous fonctionne sur un Shadow PC Windows.

Les Player Journals, `Status.json`, `NavRoute.json` et autres fichiers Elite sont produits sur cette machine.

ED Exploration Buddy fonctionne également côté Shadow.

ShipOS ne doit dépendre d’aucun fichier interne, base privée ou implementation detail d’ED Exploration Buddy.

ShipOS lit directement les interfaces exposées par Elite Dangerous.

Il ne doit jamais modifier les Journals ou fichiers Elite.

## Mac

Le Mac héberge :

- OBS ;
- ShipOS Core ;
- Overlay ;
- Control Panel ;
- SQLite ;
- éventuellement obs-websocket adapter ;
- les autres outils de stream.

## Réseau

Shadow et Mac sont déjà connectés par Tailscale.

Tailscale est un invariant d’infrastructure.

Ne pas le remplacer.

Ne pas introduire de cloud relay.

Ne pas utiliser Tailscale Funnel.

---

# 3. APPLICATIONS EXISTANTES ET FRONTIÈRE PRODUIT

D’autres applications existent indépendamment, notamment :

- DynamicChatOverlay ;
- un compteur exploration/crédits ;
- divers outils locaux de stream.

ShipOS ne doit pas les absorber.

Architecture attendue :

ShipOS Core
→ External Domain Event API
→ DynamicChatOverlay

DynamicChatOverlay peut décider lui-même comment réagir à :

`elite.ship.hull.critical`

ShipOS ne contrôle pas ses internals.

Ne pas modifier les autres repositories ou projets sauf si cela est explicitement nécessaire à un consommateur de test situé DANS le repository ShipOS.

Le consommateur de test représentant DynamicChatOverlay doit être un fixture/test client ShipOS, pas une modification du vrai projet.

---

# 4. ARCHITECTURE NON NÉGOCIABLE

SHADOW WINDOWS

Elite Dangerous  
→ Journal / Status / sidecar files  
→ ShipOS Agent  
→ WebSocket durable semantics over Tailscale

MAC

ShipOS Agent Gateway  
→ durable SourceEvent inbox  
→ SourceEvent processing  
→ WorldState reducer  
→ Detectors / Enrichers  
→ Domain Event persistence  
→ Domain Event Bus

Le Domain Event Bus branche indépendamment vers :

A. External Event API

et

B. Event Director  
→ Presentation Engine  
→ PresentationAction  
→ Overlay / Audio / optional OBS Adapter

Systèmes parallèles :

- SQLite ;
- Module SDK ;
- Control Panel ;
- Simulation ;
- Replay ;
- sessions ;
- expeditions ;
- records ;
- milestones ;
- observability.

Ne pas transformer cette architecture en un monolithe de scripts spécifiques du type :

- first-footfall.js
- death.js
- exobio.js
- hull-critical.js

Les fonctionnalités métier V1 sont des modules reposant sur des primitives Core génériques.

---

# 5. STACK TECHNIQUE BASELINE

Effectuer une ultime vérification actuelle avant installation des dépendances.

Baseline V1 retenue :

- Node.js 24 LTS ;
- TypeScript 6.x ;
- npm workspaces ;
- ESM cohérent ;
- Fastify 5.x ;
- `@fastify/websocket` / `ws` compatible avec Fastify 5 ;
- Zod 4.x ;
- SQLite ;
- `better-sqlite3` 13.x côté Core uniquement ;
- React 19.2.x ;
- Vite 8.x stable ;
- Pino 10.x ;
- Playwright stable compatible Node 24 ;
- Vitest ou autre runner moderne justifié ;
- Web Audio API ;
- `obs-websocket-js` 5.x uniquement pour l’adapter OBS facultatif.

### TypeScript 7

TypeScript 7.0 est sorti mais, à la date de conception, ne fournit pas encore une API programmatique stable et certains outils doivent conserver TypeScript 6.

Baseline : TypeScript 6.

Tu peux adopter TypeScript 7 uniquement si tu vérifies réellement que :

- lint ;
- tests ;
- Vite ;
- React ;
- tooling ;
- IDE/type tooling nécessaire ;
- build Node ;
- package ecosystem

fonctionnent sans contournement fragile.

Dans ce cas documenter la décision dans `docs/deviations.md`.

Ne pas utiliser d’options TypeScript déjà dépréciées en TS6.

### Versions

Ne pas dépendre de tags flottants à l’exécution.

Produire un `package-lock.json`.

La version exacte choisie de chaque dépendance doit être résolue et verrouillée.

Ne pas utiliser une beta/alpha/canary lorsqu’une version stable compatible existe.

---

# 6. STRUCTURE DU REPOSITORY

Structure cible :

ShipOS/
  apps/
    agent/
    core/
    control-panel/
    overlay/

  packages/
    contracts/
    module-sdk/
    presentation-renderer/
    testkit/

  modules/
    high-value-exobiology/
    remarkable-body/
    hull-critical/
    ship-destroyed/
    low-fuel/

  migrations/
  config/
  docs/
  fixtures/
  scripts/

  package.json
  package-lock.json
  README.md

Package names recommandés :

- `@shipos/contracts`
- `@shipos/sdk`
- `@shipos/presentation-renderer`
- `@shipos/testkit`

Ne pas découper le Core en vingt micro-packages.

Créer un nouveau package uniquement lorsqu’il existe une vraie frontière de dépendance ou de runtime.

Les modules V1 restent :

- internes ;
- compilés avec ShipOS ;
- enregistrés explicitement.

Pas de dynamic plugin marketplace.

---

# 7. MODÈLE D’ÉVÉNEMENTS

ShipOS possède exactement trois couches conceptuelles.

## 7.1 SourceEvent

Représente fidèlement ce que la source a produit.

Envelope minimale :

- `schemaVersion`
- `id`
- `agentId`
- `sequence`
- `source`
- `mode`
- `observedAt`
- `sourceTimestamp`
- `sourceRecord`
- `payload`

Sources initiales :

- `elite.journal`
- `elite.status`
- `elite.navroute`

`mode` Agent :

- `live`
- `bootstrap`

`sourceRecord` doit pouvoir contenir :

- filename ;
- byteStart ;
- byteEnd ;
- contentHash.

Pour un Journal, l’identité doit être déterministe à partir au minimum de :

- installation Agent ;
- fichier ;
- offset ;
- contenu.

Pour un sidecar remplacé entièrement, utiliser notamment le hash du contenu pour éviter les doublons.

Conserver le payload Elite original.

Ne pas supprimer les propriétés Elite inconnues.

Validation Zod :

- envelope strict ;
- payload source permissif/passthrough ;
- adaptateurs métier stricts uniquement pour les champs qu’ils consomment.

Une nouvelle propriété Frontier ne doit pas casser ShipOS.

Un événement Elite inconnu ne doit pas faire planter ShipOS.

## 7.2 DomainEvent

Représente ce que ShipOS comprend.

Minimum :

- `schemaVersion`
- `id`
- `sequence`
- `type`
- `occurredAt`
- `emittedAt`
- `semanticKey`
- `sourceEventIds`
- `payload`
- `provenance`

`provenance` indique au minimum :

- run mode ;
- source IDs ;
- qualité de l’information.

Qualités possibles :

- `source-observed`
- `derived`
- `estimated`
- `inferred`

Les DomainEvent IDs doivent être stables/idempotents.

Ils doivent être construits via un EventFactory Core à partir de données déterministes telles que :

- module ;
- type ;
- sourceEventIds ;
- semanticKey ;
- éventuelle revision.

Un redémarrage Core ne doit pas générer un nouvel ID arbitraire pour le même événement métier.

V1 DomainEvents publics :

- `elite.ship.destroyed`
- `elite.ship.hull.critical`
- `elite.ship.fuel.low`
- `elite.exobiology.highValueDiscovery`
- `elite.exploration.remarkableBody`

## 7.3 PresentationAction

Représente exclusivement une action de présentation.

Exemples :

- `overlay.show`
- `overlay.hide`
- `overlay.effect.start`
- `overlay.effect.stop`
- `audio.play`
- `audio.stop`
- `obs.action`

Minimum :

- action ID ;
- presentationRunId ;
- action type ;
- target ;
- issuedAt ;
- payload.

Le renderer ne connaît jamais les événements Frontier.

---

# 8. SHIPOS AGENT — WINDOWS

Objectifs :

- très léger ;
- aucune UI lourde ;
- minimum absolu de logique métier ;
- aucune dépendance à SQLite par défaut ;
- aucune présentation ;
- aucun Director ;
- aucun module métier.

## 8.1 Journal directory

Détecter/configurer le dossier standard Elite Dangerous sous Windows.

Ne pas supposer que le username est connu.

Prévoir override de configuration.

Valider l’existence et l’accessibilité du dossier.

Erreur claire si absent.

## 8.2 Journal tailing

Implémenter :

- suivi par byte offset ;
- lecture uniquement de lignes terminées ;
- conservation d’une ligne EOF partielle jusqu’à son achèvement ;
- détection des nouveaux Journals ;
- gestion des rotations/parts ;
- reprise après redémarrage ;
- parsing UTF-8 robuste ;
- journal filename + offsets dans la provenance.

Une ligne complète malformée :

- ne fait pas tomber l’Agent ;
- est loggée avec fichier + offset ;
- est quarantinée/diagnostiquée ;
- n’entraîne pas silencieusement la perte des lignes suivantes.

## 8.3 Watcher

`fs.watch()` est une optimisation de latence, pas une source de vérité.

Toujours ajouter une réconciliation périodique :

- rescan du directory ;
- taille courante ;
- fichiers nouvellement apparus ;
- offset courant.

Le système doit continuer à fonctionner même si une notification filesystem est manquée.

## 8.4 Status.json

Le fichier est remplacé intégralement.

Implémenter :

- watch opportuniste ;
- poll/reconciliation ;
- bounded retry lorsqu’une lecture tombe pendant un remplacement ;
- content hash dedupe ;
- parsing Zod tolérant aux nouveaux champs.

Le premier snapshot après bootstrap doit initialiser l’état.

Il ne doit PAS être interprété comme une transition métier.

## 8.5 NavRoute.json

Supporter la lecture du sidecar.

La documentation historique contient une incompatibilité `Route` vs `NavRoute`.

Ne pas utiliser une comparaison fragile sur un seul nom sans validation.

Conserver le payload original et normaliser via un adapter documenté.

`NavRouteClear` doit être compris après vérification de son comportement actuel.

## 8.6 Bootstrap

Lorsque l’Agent n’a encore aucun checkpoint :

- reconstruire suffisamment de contexte à partir du Journal courant / de la session courante ;
- lire le Status courant ;
- lire NavRoute si présent ;
- produire des SourceEvents `mode=bootstrap`.

Les SourceEvents bootstrap :

- mettent à jour WorldState ;
- ne déclenchent pas de DomainEvent destiné au stream par défaut ;
- ne déclenchent pas de présentation ;
- ne vont pas vers l’External Event API ;
- ne créent pas records/milestones.

Objectif : ne jamais afficher à la première installation une ancienne mort, un ancien Hull Critical ou un ancien événement exobio comme s’il venait d’arriver.

---

# 9. SPOOL AGENT DURABLE

Baseline : JSONL append-only.

Le spool doit survivre à :

- crash Agent ;
- reboot Windows ;
- coupure réseau ;
- Core indisponible ;
- reprise.

Chaque SourceEvent doit être durablement spoulé AVANT que le checkpoint de lecture source soit considéré comme avancé.

Le design doit gérer correctement le cas :

1. append spool réussi ;
2. crash avant mise à jour checkpoint.

Au restart, le même record source ne doit pas générer un second événement logique.

Utiliser les SourceEvent IDs déterministes et une récupération du spool/checkpoint cohérente.

Checkpoint :

- écriture temporaire ;
- flush approprié ;
- remplacement atomique lorsque supporté ;
- procédure de récupération documentée.

Spool :

- segmented JSONL ou équivalent simple ;
- append-only ;
- sequence monotone ;
- compaction uniquement pour les séquences définitivement ACKées ;
- compaction via nouveau fichier puis remplacement ;
- jamais modifier en place des records non ACKés.

Le code Windows doit être testé réellement ou via tests filesystem ciblés.

### Exception autorisée

Si, après implémentation/test, la robustesse atomique du spool JSONL sous Windows devient nettement plus complexe ou risquée qu’un SQLite local, tu peux choisir SQLite côté Agent.

Ce changement nécessite :

- justification technique substantielle ;
- benchmark de simplicité/robustesse ;
- documentation dans `docs/deviations.md`.

Ne pas basculer vers SQLite côté Agent par préférence personnelle.

---

# 10. TRANSPORT AGENT → CORE

Sémantique attendue :

**at-least-once transport + idempotent Core processing = effectively-once business processing.**

Ne jamais prétendre fournir un « exactly once network transport ».

## 10.1 Ports

Default :

- `48100` : Core HTTP/API/UI/Overlay
- `48101` : Agent Gateway

Configurables.

Si un port configuré est occupé :

- startup échoue ;
- message clair ;
- aucun autre port n’est choisi automatiquement.

## 10.2 Bind

Port 48100 :

`127.0.0.1` par défaut.

Port 48101, mode préféré :

Core Gateway écoute sur :

`127.0.0.1:48101`

et Tailscale Serve TCP forward expose ce port au tailnet.

Revalider la syntaxe Tailscale actuelle avant d’écrire la documentation finale.

Ne jamais configurer Tailscale automatiquement.

La documentation fournit les commandes à l’utilisateur.

Alternative supportée :

bind explicitement configuré sur l’IP Tailscale du Mac.

Ne jamais choisir `0.0.0.0` par défaut.

## 10.3 Sécurité

Tailscale est la première barrière.

Ajouter un token Agent comme défense supplémentaire.

Le token :

- n’est jamais dans une URL ;
- n’est jamais loggé ;
- n’est jamais commité ;
- est envoyé dans l’Authorization header ou un mécanisme WS approprié vérifié.

Documenter également une ACL Tailscale restrictive Shadow → Mac:48101.

Pas de Funnel.

## 10.4 WebSocket protocol

Créer un protocol versionné.

Route conceptuelle :

`/agent/v1/ws`

Messages minimum :

- `hello`
- `welcome`
- `source_event`
- `ack`
- `error`

Handshake :

Agent envoie :

- protocolVersion ;
- agentId ;
- agentVersion ;
- lastAckedSequence.

Core retourne notamment :

- accepted protocolVersion ;
- server version ;
- highest durably accepted sequence.

Utiliser WebSocket ping/pong natif lorsque pertinent.

Defaults configurables raisonnables :

- heartbeat ~10 s ;
- stale timeout ~30 s ;
- reconnect initial ~1 s ;
- max backoff ~30 s ;
- jitter ~20 % ;
- in-flight window ~256 ;
- payload max ~1 MiB.

Ces nombres sont des CONFIGURABLE_VALUE, pas des faits externes.

Protocol version mismatch :

- erreur explicite ;
- connexion refusée proprement ;
- aucun fallback silencieux.

---

# 11. ACK ET DURABLE INBOX CORE

C’est un invariant critique.

Le Core ne doit ACKer un SourceEvent qu’après l’avoir durablement accepté dans SQLite.

Pipeline :

Agent send  
→ Core validates envelope  
→ SQLite transaction persists SourceEvent  
→ update ingest sequence  
→ COMMIT  
→ cumulative ACK

Jamais :

receive  
→ ACK  
→ process/persist later

car un crash Core entre ACK et persistence créerait une perte irréversible.

Créer notamment :

`source_events`

et :

`agent_ingest_state`

Contraintes :

- PK SourceEvent ID ;
- unique `(agent_id, sequence)` ;
- payload source préservé ;
- processing state ;
- timestamp ;
- mode ;
- source metadata.

L’ACK cumulatif représente la plus haute séquence CONTIGUË durablement acceptée.

Duplicata déjà accepté :

- ne pas le réinsérer ;
- retourner l’ACK approprié.

Gap impossible :

- erreur explicite ;
- demander resynchronisation depuis le dernier contiguous ACK ;
- ne pas masquer le problème.

Test critique obligatoire :

Core reçoit seq N  
→ transaction commit  
→ ACK envoyé  
→ Core est tué avant detector processing  
→ Core redémarre  
→ l’événement est malgré tout traité exactement une fois au niveau métier.

---

# 12. TRAITEMENT DURABLE ET DISPATCH

`source_events` possède un processing state.

Le traitement doit être reprenable après crash.

Lorsqu’un SourceEvent produit un DomainEvent :

- produire un ID déterministe ;
- persister le DomainEvent ;
- marquer le SourceEvent traité ;
- utiliser une transaction cohérente.

Puis dispatch.

Un crash entre persistence du DomainEvent et diffusion ne doit pas le perdre.

Utiliser un mécanisme de durable dispatch/outbox suffisamment simple :

par exemple :

- `domain_events.dispatch_state`
- dispatcher de pending events.

Si un crash arrive après publication mais avant `dispatch_state=done`, un second dispatch après restart est acceptable uniquement si :

- DomainEvent ID reste identique ;
- External API permet dedupe ;
- Director est idempotent pour un DomainEvent déjà décidé.

Ne pas créer une infrastructure Kafka-like.

SQLite suffit.

---

# 13. WORLD STATE

Le temps réel principal est en mémoire.

State transition :

PreviousWorldState  
+ SourceEvent  
→ pure StateReducer  
→ NextWorldState

Detectors reçoivent :

- SourceEvent ;
- previous state ;
- next state.

Ne jamais permettre aux modules de modifier WorldState directement.

## 13.1 Unknown state

Ne pas confondre :

- false ;
- 0 ;
- absent ;
- inconnu.

Exemple :

`fuel.low` au boot doit être :

`unknown`

jusqu’au premier Status.

La première observation `unknown → true` n’est PAS une transition `false → true`.

## 13.2 Minimum state

Prévoir au minimum :

- commander ;
- ship ;
- vehicleContext ;
- currentSystem ;
- currentBody ;
- location ;
- hull ;
- shields ;
- fuel ;
- current Status flags ;
- session ;
- expedition ;
- lastJump ;
- lastDock ;
- biologicalContext ;
- body exploration state ;
- navRoute ;
- module-relevant state.

`vehicleContext` doit pouvoir distinguer :

- unknown ;
- mainShip ;
- fighter ;
- srv ;
- onFoot ;
- taxi ;
- multicrew/other.

Combiner de manière prudente :

- Status Flags ;
- Status Flags2 ;
- événements Journal validés.

## 13.3 Body state

Indexer les corps principalement par :

`SystemAddress + BodyID`

Stocker les informations accumulées provenant de :

- Scan ;
- SAASignalsFound ;
- autres sources validées.

Inclure lorsqu’il est présent :

`WasFootfalled`

Sous forme :

- true ;
- false ;
- unknown.

---

# 14. FIRST FOOTFALL — RÉALITÉ 2026

La spécification historique disant « aucun signal Frontier » est obsolète.

Frontier a ajouté `WasFootfalled` à `Scan` fin 2025.

Avant implémentation, revalider le comportement actuel.

Baseline auditée :

- `WasFootfalled=true` : le corps était déjà footfallé au moment du Scan ;
- `WasFootfalled=false` : le corps n’était pas encore footfallé au moment du Scan ;
- absence du champ : état inconnu / version incompatible.

Ceci ne constitue PAS un événement :

« ce commandant vient d’obtenir First Footfall ».

Par conséquent :

- supporter et conserver `WasFootfalled` dans WorldState ;
- l’exposer dans l’inspector ;
- ne pas créer de sixième DomainEvent V1 obligatoire ;
- ne jamais présenter comme certain un First Footfall « obtenu » simplement parce que `WasFootfalled=false`.

Une future fonctionnalité peut raisonnablement parler de :

`firstFootfallAvailableAtScan`

mais pas d’achievement garanti sans signal supplémentaire.

### WasLogged

Les Journals modernes peuvent contenir `WasLogged` autour de l’exobiologie.

Ce champ a eu un bug Frontier connu.

Revalider son état actuel.

Tant que sa fiabilité n’est pas démontrée :

- préserver le champ raw ;
- l’afficher éventuellement comme diagnostic ;
- ne pas s’en servir pour garantir un bonus ;
- ne pas faire dépendre High Value Exobiology de lui.

---

# 15. EVENT BUS

Le Domain Event Bus Core est interne.

Ordre logique :

DomainEvent persisted  
→ Domain Event Bus  
→ branche External API  
→ branche Director

L’External API ne dépend jamais du résultat du Director.

Un événement peut donc :

- être persisté ;
- être transmis à DynamicChatOverlay ;
- être classé SILENT par le Director.

Ne pas coupler les branches.

---

# 16. MODULE SDK

Package :

`@shipos/sdk`

V1 = modules internes compilés.

Un module peut enregistrer :

- manifest ;
- config schema ;
- detectors ;
- enrichers ;
- DomainEvent definitions ;
- policy defaults ;
- presentations ;
- simulations.

Context autorisé conceptuellement :

- `ctx.events`
- `ctx.worldState`
- `ctx.storage`
- `ctx.records`
- `ctx.logger`
- `ctx.config`
- `ctx.presentation`

Interdit :

- SQL direct ;
- Fastify direct ;
- création d’un serveur ;
- création d’un port ;
- accès direct à SQLite ;
- modification directe WorldState ;
- contrôle direct du Director ;
- contrôle direct OBS ;
- dépendance à `apps/core` internals ;
- accès sauvage à `process.env`.

`ctx.storage` est namespacé automatiquement par module.

`ctx.worldState` est read-only.

## 16.1 Enforcement

Cette frontière n’est pas une sandbox de sécurité contre code hostile.

La faire respecter par :

- package exports ;
- dependency graph ;
- lint/import restrictions ;
- tests architecturaux.

## 16.2 Module failures

Encapsuler l’exécution de :

- detector ;
- enricher ;
- presentation factory.

Une exception récupérable :

- est loggée ;
- incrémente les compteurs d’erreur ;
- met le module DEGRADED ;
- peut ouvrir un circuit breaker ;
- ne fait pas tomber Core.

Après un seuil configurable de failures consécutifs :

- module auto-disabled ;
- état visible Control Panel ;
- réactivation manuelle possible.

V1 ne prétend pas isoler une boucle CPU infinie dans un module interne.

Le test « module crash » concerne exceptions/rejections récupérables.

---

# 17. MODULE V1 — SHIP DESTROYED

DomainEvent :

`elite.ship.destroyed`

Source candidate :

`Died`

FAIT IMPORTANT :

`Died` signifie que le joueur a été tué.

Il ne garantit pas que le vaisseau principal a été détruit.

Condition V1 :

émettre `elite.ship.destroyed` uniquement lorsque le pre-state établit avec suffisamment de certitude que le commander est dans son main ship.

Utiliser les Status flags / current context validés.

Ne pas émettre ce DomainEvent si contexte :

- onFoot ;
- SRV ;
- fighter ;
- taxi ;
- inconnu insuffisamment fiable.

Dans les cas ambigus :

- conserver SourceEvent ;
- log diagnostic ;
- Event Inspector montre la raison de non-classification.

Ne pas produire de faux positif.

Policy default :

- importance 100 ;
- urgency 100 ;
- attentionCost 10 ;
- interruptPolicy `exclusive` ;
- preferred profile FULL ;
- très haute priorité ;
- queue invalidation pour événements non exclusifs obsolètes.

Ces valeurs sont des CONFIGURABLE_VALUE.

---

# 18. MODULE V1 — HULL CRITICAL

DomainEvent :

`elite.ship.hull.critical`

Source :

`HullDamage`

Vérifier avant code :

- Health unit/scale actuel ;
- PlayerPilot ;
- Fighter ;
- comportement réel du seuil.

Baseline documentée :

`HullDamage` est produit sur des paliers de 20 %.

Main ship condition :

- `PlayerPilot === true`
- `Fighter === false`

et contexte cohérent.

Ne pas prétendre détecter précisément un seuil arbitraire inférieur à ce que Frontier expose.

Default V1 :

critical autour du palier observable 20 %.

Threshold configurable seulement dans la limite de la granularité réellement observable.

Créer un concept d’épisode HullCritical :

- une seule alerte à l’entrée ;
- pas de spam à chaque événement corrélé ;
- reset lorsque le hull est clairement réparé au-dessus du seuil, vaisseau changé, destruction/resurrection ou autre signal actuel validé.

Tout événement utilisé pour le reset doit être vérifié avant implémentation.

Policy indicative :

- importance 90 ;
- urgency 100 ;
- attentionCost 7 ;
- TTL court ;
- interruptPolicy `always` ou équivalent garantissant qu’un événement moins urgent est interrompu.

Test obligatoire :

une présentation MAJOR non urgente est active  
→ Hull Critical  
→ la première est interrompue proprement  
→ Hull Critical prend la priorité.

---

# 19. MODULE V1 — LOW FUEL

DomainEvent :

`elite.ship.fuel.low`

Source :

`Status.json`

Baseline auditée :

`Flags & 524288`

correspond à :

Low Fuel <25 %.

Détection uniquement sur transition :

`false → true`

Le premier snapshot :

`unknown → true`

met WorldState à jour mais n’émet pas l’événement par défaut.

Payload utile :

- FuelMain si présent ;
- FuelReservoir si présent ;
- lowFuel threshold semantics ;
- source timestamp.

Episode :

- émettre une fois ;
- réarmer lorsque le flag redevient false.

Policy indicative configurable :

- importance ~65 ;
- urgency ~80 ;
- attentionCost ~4 ;
- interrupt lower priority si nécessaire.

---

# 20. MODULE V1 — HIGH VALUE EXOBIOLOGY

DomainEvent :

`elite.exobiology.highValueDiscovery`

Source primaire :

`ScanOrganic`

Condition :

`ScanType === "Analyse"`

après validation du casing réel.

Utiliser :

- Genus ;
- Species ;
- Variant ;
- SystemAddress ;
- Body.

Utiliser les IDs Frontier stables pour les clés.

Les champs `_Localised` servent seulement à l’affichage.

## 20.1 Valeur

Ne jamais chercher un champ `Value` inexistant dans ScanOrganic.

Avant vente, la valeur est une estimation ShipOS.

Créer un catalogue versionné d’exobiologie.

Chaque entrée doit posséder une provenance.

Documenter :

- source ;
- date ;
- version ;
- licence/redistribution si donnée importée d’un projet ;
- méthodologie de vérification.

Ne pas dépendre des internals d’ED Exploration Buddy.

Si une source communautaire redistribuable et fiable existe, elle peut être utilisée après validation.

Sinon constituer explicitement le catalogue ShipOS à partir de données vérifiées.

Payload minimum :

- identity ;
- genus ;
- species ;
- variant ;
- systemAddress ;
- bodyId ;
- `estimatedBaseValueCredits` ;
- `isEstimate: true` ;
- `catalogVersion` ;
- `estimateSource`.

Config :

`highValueThresholdCredits`

Default produit raisonnable à définir et documenter, par exemple 5 000 000 crédits de base.

Il est CONFIGURABLE_VALUE.

Si aucune entrée catalogue n’existe :

- ne pas inventer une valeur ;
- ne pas produire un faux High Value ;
- log `catalog_miss` ;
- exposer le miss dans l’Inspector.

## 20.2 SellOrganicData

`SellOrganicData` fournit réellement `Value` et `Bonus`.

Utiliser cet événement pour :

- reconciliation historique ;
- diagnostic de précision du catalogue ;
- stockage de valeurs réellement vendues.

Ne jamais réécrire l’histoire en disant que l’estimation précédente était une valeur officielle.

Ne pas calculer un bonus garanti à partir de `WasLogged` si sa fiabilité n’est pas établie.

---

# 21. MODULE V1 — REMARKABLE BODY

DomainEvent :

`elite.exploration.remarkableBody`

Ce module est volontairement multi-source.

Body state peut être enrichi successivement par :

- `Scan` ;
- `SAASignalsFound` ;
- autres événements actuels validés.

Identifier le corps par :

`SystemAddress + BodyID`

## 21.1 Reasons

Payload :

`reasons[]`

Utiliser des machine codes stables.

Candidates :

- `star.black_hole`
- `star.neutron`
- `planet.earth_like`
- `planet.ammonia_world`
- `planet.terraformable`
- `planet.high_gravity`
- `planet.many_biological_signals`
- `record.new`

Avant de coder les comparaisons raw :

- vérifier les valeurs exactes de `StarType` ;
- vérifier les valeurs exactes de `PlanetClass` ;
- vérifier TerraformState ;
- vérifier unités SurfaceGravity ;
- vérifier biological signal Type.

Ne pas inventer les strings parce qu’elles semblent évidentes.

## 21.2 Missing information

Un champ non présent dans un Scan réduit signifie :

UNKNOWN.

Jamais :

UNKNOWN = false.

Exemple :

absence de TerraformState sur un basic scan ne prouve pas « non terraformable ».

## 21.3 Gravity

Si SurfaceGravity est confirmé comme utilisant une unité nécessitant conversion vers g :

normaliser explicitement.

Utiliser une constante physique nommée/documentée.

Threshold `highGravityG` configurable.

Exemple de valeur produit possible :

2.0 g.

## 21.4 Biological count

Utiliser `SAASignalsFound`.

Identifier le signal biologique via sa valeur Frontier exacte vérifiée.

Threshold `manyBiologicalSignals` configurable.

## 21.5 Coalescing

Un même corps peut recevoir plusieurs informations en quelques secondes.

Utiliser un `semanticKey` stable :

`remarkable-body:<systemAddress>:<bodyId>`

Si de nouvelles reasons apparaissent après le premier DomainEvent :

- autoriser une révision/enrichissement immutable ;
- conserver même semantic family ;
- Director coalesce afin de ne pas spammer l’Overlay.

---

# 22. EVENT DIRECTOR

Le Director est un scheduler d’attention.

Il ne détermine jamais si un DomainEvent est « vrai ».

Les modules/detectors font cela.

Le Director décide uniquement :

- montrer ou non ;
- quand ;
- sous quelle forme ;
- interruption ;
- coalescing.

## 22.1 Inputs

Chaque policy possède au minimum :

- importance ;
- urgency ;
- attentionCost ;
- TTL ;
- cooldown ;
- dedupe key ;
- semantic key ;
- interruptPolicy ;
- preferred profile ;
- allowCompact.

Profiles :

- FULL
- COMPACT
- SILENT

InterruptPolicy :

- never
- if-lower-priority
- always
- exclusive

## 22.2 Ordre de décision

Pipeline déterministe :

1. expiration ;
2. exact dedupe ;
3. semantic dedupe/coalescing ;
4. cooldown ;
5. scoring ;
6. attention budget ;
7. profile selection ;
8. queue/interruption ;
9. decision.

## 22.3 Scoring

Le scoring doit être :

- déterministe ;
- testé ;
- configurable ;
- inspectable.

Un modèle simple acceptable :

`baseScore = 0.60 * importance + 0.40 * urgency`

avec un bounded age boost pour les éléments en queue.

Si tu choisis une autre formule, elle doit respecter les mêmes objectifs et être documentée.

Importance et urgence restent conceptuellement séparées même si elles alimentent un score.

## 22.4 Attention budget

Mettre en place un sliding attention budget.

Defaults produits raisonnables :

- fenêtre ~30 s ;
- budget ~10 unités ;
- queue max ~5.

FULL consomme attentionCost.

COMPACT consomme une version réduite documentée du coût.

SILENT = 0.

Événement urgent/exclusive peut bypass le budget si nécessaire, mais la trace doit dire explicitement pourquoi.

## 22.5 Queue

Queue volontairement courte.

À saturation :

- ne jamais grossir indéfiniment ;
- expirer/supprimer les éléments les moins pertinents selon policy ;
- conserver toutes les décisions dans l’historique.

## 22.6 Exclusive

Un événement `exclusive` :

- interrompt les presentations cancellables en cours ;
- invalide la queue non pertinente ;
- devient propriétaire de l’attention jusqu’à fin/annulation.

`elite.ship.destroyed` doit utiliser ce comportement.

## 22.7 Decision trace

CHAQUE DomainEvent passé au Director doit produire une décision persistée.

Minimum :

- event ID ;
- raw importance ;
- urgency ;
- score components ;
- age ;
- TTL ;
- budget before ;
- budget after ;
- dedupe result ;
- cooldown result ;
- coalescing result ;
- queue position ;
- interruption ;
- selected profile ;
- final status ;
- reason codes.

Final statuses :

- presented
- queued
- suppressed
- expired
- deduplicated
- coalesced
- interrupted
- failed

Event Inspector doit pouvoir expliquer la décision humainement.

---

# 23. CLOCK ABSTRACTION

Ne pas parsemer le Core de `Date.now()` non injectable.

Créer une abstraction Clock.

Modes :

live → RealClock  
simulation → VirtualClock  
replay → ReplayClock

Director, cooldowns, TTL, scenarios et replay doivent utiliser cette abstraction.

Objectif :

tests déterministes sans sleep inutile.

---

# 24. SQLITE

Uniquement côté Mac/Core par défaut.

Pragmas baseline :

- `journal_mode=WAL`
- `synchronous=FULL`
- `foreign_keys=ON`
- bounded `busy_timeout`

Une seule couche Core possède les writes.

Modules : aucun SQL.

## 24.1 Tables minimum

- `schema_migrations`
- `source_events`
- `agent_ingest_state`
- `domain_events`
- `director_decisions`
- `presentation_runs`
- `sessions`
- `expeditions`
- `records`
- `milestones`
- `settings`
- `module_storage`

Ajouter seulement les tables réellement nécessaires.

## 24.2 Migrations

Migrations :

- ordonnées ;
- versionnées ;
- checksumées ;
- transactionnelles lorsque SQLite le permet ;
- idempotence correctement gérée.

Une migration appliquée ne doit pas pouvoir être modifiée silencieusement.

Si son checksum diffère :

startup fail explicite.

Ne jamais supprimer la DB pour « résoudre » une migration.

## 24.3 Backup avant migration

Sur une DB existante :

- utiliser une méthode de backup SQLite sûre ;
- ne pas copier naïvement uniquement le `.db` en ignorant WAL ;
- si backup échoue, abort migration.

Prévoir retention configurable des backups.

## 24.4 Restore

Documenter et tester :

- Core arrêté ;
- restore ;
- integrity check ;
- restart ;
- migrations éventuelles.

---

# 25. SESSIONS

Une session ShipOS représente une période de fonctionnement/jouabilité live.

Créer une session lorsque du contexte Elite live actif est établi.

La fermer proprement sur :

- Shutdown lorsque disponible ;
- Core shutdown ;
- autre frontière de session validée.

Un restart Core peut créer une nouvelle ShipOS session.

C’est acceptable : une expedition peut contenir plusieurs sessions.

DomainEvents live doivent pouvoir être associés à :

- sessionId ;
- expeditionId si active.

---

# 26. EXPEDITIONS

Contrôle explicite :

- Start Expedition
- End Expedition

Une seule expedition active par défaut.

Persistée dans SQLite.

Une expedition peut contenir plusieurs sessions.

Préparer des agrégats exploitables :

- systems ;
- discoveries ;
- exobiology ;
- records ;
- milestones ;
- estimated values ;
- actual sold values lorsque connues.

Ne pas surdévelopper un analytics engine hors V1.

---

# 27. RECORDS ET MILESTONES

Les modules utilisent exclusivement `ctx.records`.

Records service :

- namespacé/type-safe ;
- atomic ;
- deterministic comparison ;
- live only.

Simulation et Replay n’accèdent jamais au vrai records repository.

Un remarquable nouveau record peut ajouter :

`record.new`

à reasons[].

Tests obligatoires :

simulation record candidate  
→ zéro changement DB live.

replay record candidate  
→ zéro changement DB live.

---

# 28. RUN CONTEXT — ISOLATION LIVE / SIMULATION / REPLAY

Ne pas compter uniquement sur :

`simulated=true`

Créer un véritable :

`RunContext`

avec :

- mode ;
- worldState ;
- eventBus ;
- Clock ;
- persistence services ;
- records service ;
- expedition service ;
- external publishing policy.

Modes :

- live
- simulation
- replay

## Live

Accès à persistence réelle.

## Simulation

WorldState séparé.

Persistence :

- in-memory ;
- ou DB temporaire dédiée.

Jamais live DB métier.

## Replay

ReplayWorldState séparé.

ReplaySession séparée.

Jamais live state.

Par défaut :

`externalPublishing=false`.

Cet isolement doit être structurel via dependency injection/service container, pas seulement conventionnel.

---

# 29. SIMULATION

Trois niveaux.

## Presentation

Presentation Engine / renderer uniquement.

## DomainEvent

DomainEvent  
→ Director  
→ Presentation

## SourceEvent

SourceEvent  
→ StateReducer  
→ Detector  
→ DomainEvent  
→ Director  
→ Presentation

Tous les objets portent la provenance simulation.

## Scénarios multi-event

Implémenter au minimum :

`Everything Goes Wrong`

Timeline :

0s shield down  
2s hull critical  
5s low fuel  
8s ship destroyed

Si le shield-down n’est pas un public V1 DomainEvent, il peut rester un SourceEvent/state transition de scénario.

Ce scénario doit tester :

- interruption ;
- queue ;
- attention budget ;
- cooldown ;
- audio cancellation ;
- exclusive destruction.

---

# 30. REPLAY

Support d’anciens Journals.

Vitesses :

- 1x
- 5x
- 20x
- instant

Parsing réutilise autant que possible le pipeline SourceEvent réel.

Mais :

- ReplayContext ;
- ReplayWorldState ;
- ReplayClock ;
- ReplaySession ;
- persistence isolated.

`instant` ne doit pas attendre réellement entre les timestamps.

External Event API :

OFF en replay V1 par défaut.

Ne pas permettre une activation accidentelle.

Control Panel Replay doit accepter de manière ergonomique un ou plusieurs fichiers Journal, par exemple via upload local temporaire.

Ne jamais confondre les fichiers replay avec le dossier live Agent.

---

# 31. GOLDEN REPLAYS

Créer des fixtures représentatives et anonymisées.

Inclure au minimum :

- normal session ;
- journal rotation ;
- status low-fuel transition ;
- hull damage ;
- main-ship Died ;
- on-foot Died negative case ;
- ScanOrganic Analyse ;
- Scan + SAASignalsFound remarkable body ;
- malformed line ;
- partial EOF line ;
- current field `WasFootfalled` si disponible ;
- NavRoute variant relevant.

Golden tests vérifient les DomainEvents exacts et leur absence lorsqu’ils ne doivent pas exister.

Fixtures synthétiques clairement étiquetées ne doivent jamais être présentées comme « véritables logs Frontier ».

---

# 32. PRESENTATION ENGINE

Le Director choisit.

Presentation Engine orchestre.

Définition préférentiellement déclarative.

Une presentation possède :

- ID ;
- profile ;
- duration ;
- layers ;
- slots ;
- animation/effects ;
- audio cues ;
- timeline ;
- cancellation behavior.

Chaque exécution crée :

`presentationRunId`

et un lifecycle contrôlé.

Utiliser AbortController ou équivalent central.

Une annulation doit :

- arrêter timers ;
- arrêter animations ;
- arrêter audio ;
- annuler promises cancellables ;
- nettoyer DOM transient ;
- terminer le run dans un état explicite.

Aucun ghost timeout.

Aucun ghost audio.

---

# 33. OVERLAY

Une seule Browser Source principale :

`http://127.0.0.1:48100/overlay`

Production :

Core sert le build statique Overlay.

Pas de serveur Vite permanent nécessaire.

Vite dev server = développement uniquement.

Layers :

- PersistentLayer
- EventLayer
- GlobalFxLayer

Slots :

- primary
- secondary
- top
- bottom
- left
- right
- hud
- globalFx

Technologies :

- React ;
- CSS animations ;
- Web Animations API.

Canvas/WebGL uniquement lorsqu’un effet le nécessite réellement.

## Idle performance

Au repos :

- pas de boucle `requestAnimationFrame` permanente inutile ;
- pas de Canvas qui redessine continuellement ;
- pas de polling haute fréquence UI ;
- faible CPU.

Ajouter un test/smoke diagnostic approprié.

## Overlay reconnect

Overlay est un client du Core.

Si Overlay disparaît :

Core continue.

Les runs continuent leur lifecycle logique ou sont annulés suivant policy.

Au reconnect :

- récupérer persistent state ;
- récupérer éventuellement les presentations encore réellement actives ;
- ne pas rejouer arbitrairement une animation transitoire expirée.

---

# 34. AUDIO

V1 via Web Audio API dans Browser Source.

Buses :

- master
- alerts
- effects
- ambience
- voice

Utiliser GainNodes ou abstraction équivalente.

Chaque audio source est associée à un `presentationRunId`.

Annuler un run :

- stop audio sources ;
- disconnect nodes ;
- cleanup.

## Asset catalog

Aucun chemin sauvage.

Interdit :

`../../final-sound-v7.mp3`

Utiliser :

`audio.alert.hull-critical`

ou IDs stables équivalents.

Catalog contient :

- ID ;
- URL/path build ;
- metadata ;
- preload policy.

Missing asset :

- log warning/error ;
- présentation visuelle continue si possible ;
- Core ne plante pas.

Ne pas télécharger/intégrer des sons Elite Dangerous protégés.

Pour démontrer l’audio V1, utiliser des assets originaux/neutres ou cues synthétiques légalement utilisables.

## OBS audio reality

Ne pas supposer que le comportement autoplay/WebAudio d’un navigateur classique est strictement identique à OBS Browser Source.

Créer une procédure smoke test réelle OBS.

Control Panel doit afficher l’état audio rapporté par Overlay :

- READY
- SUSPENDED
- DEGRADED
- DISCONNECTED

Prévoir un test tone/preview.

---

# 35. OPTIONAL OBS ADAPTER

V1 fonctionne intégralement sans lui.

Adapter basé sur obs-websocket v5 lorsque activé.

Default :

disabled.

Configuration :

- host
- port
- password/secret
- allowed targets/actions

Ne jamais hardcoder la disponibilité d’OBS.

Si obs-websocket indisponible :

- adapter DEGRADED ;
- Browser Source continue ;
- Core continue.

Utiliser une allowlist.

ShipOS ne peut modifier que les objets OBS explicitement configurés comme appartenant à ShipOS.

Aucune modification arbitraire :

- scènes ;
- transforms ;
- filtres ;
- sources étrangères.

---

# 36. EXTERNAL EVENT API

Local read-only API.

WebSocket :

`ws://127.0.0.1:48100/api/v1/events/ws`

DomainEvents uniquement.

Jamais :

- SourceEvent ;
- PresentationAction ;
- Director internals.

Aucun endpoint externe ne permet de créer un `elite.*`.

## Subscriptions

Supporter :

- exact event type ;
- prefix wildcard.

Examples :

- `elite.*`
- `elite.ship.*`
- `elite.exobiology.*`
- `elite.exploration.*`

Définir une grammaire volontairement petite.

Rejeter les patterns invalides.

## Sequencing

Chaque DomainEvent persisted reçoit une sequence monotone Core.

Client peut envoyer conceptuellement :

`subscribe(patterns, afterSequence?)`

Le Core peut rejouer les événements disponibles après `afterSequence`.

Définir une replay window configurable et bornée.

Si le curseur demandé est trop ancien :

envoyer explicitement :

`resync_required`

ou contrat équivalent.

Ne jamais masquer un gap.

## Dedupe

DomainEvent ID stable.

Consumer doit pouvoir dedupe par ID.

Créer un test client simulant DynamicChatOverlay.

Tester :

- subscribe ;
- filtering ;
- reconnect ;
- afterSequence ;
- duplicate delivery ;
- resync gap.

---

# 37. CONTROL PANEL

URL production recommandée :

`http://127.0.0.1:48100/control`

Core sert son build.

Control Panel est un client API.

Fermé = Core continue sans changement.

Pages minimum :

- Overview
- Events
- Director
- Modules
- Simulation
- Replay
- Agent
- World State
- Expedition
- Overlay
- Audio
- System

## Overview

Montrer au minimum :

- Core health ;
- DB ;
- Agent connected/disconnected ;
- last heartbeat ;
- Overlay ;
- modules degraded ;
- active expedition ;
- current attention budget ;
- recent important event.

## Events

Historique DomainEvents.

Event Inspector :

SourceEvent  
→ State before/after relevant delta  
→ detector  
→ DomainEvent  
→ Director decision  
→ Presentation run

Inclure :

- suppressed ;
- expired ;
- deduplicated ;
- coalesced ;
- interrupted ;
- failed.

## Director

Afficher :

- queue ;
- budget ;
- active run ;
- scores ;
- décision détaillée.

## Modules

Afficher :

- enabled ;
- healthy ;
- degraded ;
- disabled by circuit breaker ;
- config ;
- last failure.

Permettre modifications dynamiques appropriées.

## Agent

Afficher :

- Agent version ;
- protocol version ;
- connected ;
- last heartbeat ;
- last source sequence ;
- ACK sequence ;
- spool depth si communiqué ;
- reconnect count ;
- source file ;
- offset.

## World State

Viewer read-only structuré.

UNKNOWN doit être visible comme tel.

## Expedition

Start/End explicit.

Demander confirmation seulement pour End si UX le justifie, sans rendre l’API fragile.

## Overlay

Preview presentation.

## Audio

Volumes buses + test cue.

## System

Ports, versions, data paths, backup status, database status.

---

# 38. CONFIGURATION

Séparer :

## Startup/static config

Exemples :

- ports ;
- bind hosts ;
- DB path ;
- journal path Agent ;
- Core endpoint ;
- Tailscale mode ;
- data directory.

## Dynamic config

Exemples :

- module settings ;
- thresholds ;
- Director budget ;
- audio volumes ;
- module enablement ;
- presentation preferences.

Dynamic config peut vivre dans `settings`.

## Secrets

Agent token / OBS password :

- jamais committed ;
- jamais loggé ;
- exemple/documentation claire ;
- mécanisme explicite d’env/config secret.

Modules n’accèdent jamais directement à `process.env`.

Core configuration service fournit uniquement les propriétés autorisées.

Toutes les configs validées via Zod au startup.

Config invalide :

- erreur détaillée ;
- fail fast lorsqu’elle rend startup impossible ;
- jamais default silencieux dangereux.

---

# 39. DATA DIRECTORIES

Choisir des defaults conformes aux plateformes et les documenter.

Prévoir `SHIPOS_DATA_DIR` ou configuration équivalente explicite.

Mac Core data :

- DB ;
- backups ;
- logs ;
- runtime config.

Windows Agent data :

- spool ;
- cursor/checkpoint ;
- Agent identity ;
- logs.

Ne pas mélanger runtime data et Git repository par défaut en production.

---

# 40. LOGGING ET OBSERVABILITÉ

Pino structured logging.

Inclure correlation fields lorsque disponibles :

- agentId ;
- agentSequence ;
- sourceEventId ;
- domainEventId ;
- moduleId ;
- presentationRunId ;
- sessionId ;
- expeditionId.

Ne jamais logguer :

- Agent token ;
- OBS password ;
- autres secrets.

Niveaux :

- debug
- info
- warn
- error

Prévoir logs fichiers exploitables en production avec rotation/rétention bornée ou autre solution simple justifiée.

Health endpoint local :

`GET /health`

Status détaillé local :

- core ;
- db ;
- agent ;
- overlay ;
- audio ;
- optional OBS ;
- modules.

Pas besoin de Prometheus.

---

# 41. MODULE FAILURE CIRCUIT BREAKER

Configurable.

Exemple acceptable :

- N failures consécutifs dans une fenêtre ;
- state DEGRADED ;
- seuil suivant → DISABLED.

Successful run peut réinitialiser le compteur selon policy.

Toutes les transitions sont loggées.

Aucun module défaillant ne doit casser :

- Agent Gateway ;
- DB ;
- autre module ;
- Overlay transport ;
- External API.

---

# 42. PRESENTATION DEFAULTS V1

Créer des présentations fonctionnelles et sobres pour les cinq événements.

Le but V1 est de démontrer l’orchestration, pas de figer un design artistique définitif.

Chaque module doit posséder :

- FULL ;
- COMPACT lorsque pertinent ;
- SILENT naturellement supporté par Director.

Les présentations ne doivent jamais constituer un « sapin de Noël ».

Préférer :

- typographie ;
- mouvement limité ;
- signal visuel clair ;
- audio court ;
- disparition propre.

Ne pas ajouter une dépendance graphique lourde sans justification.

---

# 43. TEST STRATEGY

Aucune phase n’est validée par inspection visuelle uniquement.

## Unit

Minimum :

- StateReducers ;
- detectors ;
- event ID determinism ;
- scoring ;
- TTL ;
- cooldown ;
- dedupe ;
- semantic dedupe ;
- coalescing ;
- attention budget ;
- queue ;
- interruption decision ;
- records ;
- config schemas ;
- module circuit breaker ;
- spool recovery primitives.

## Integration

Minimum :

- Agent → Gateway ;
- durable ACK ;
- Gateway → SQLite ;
- source processing ;
- DomainEvent persistence ;
- Core → Overlay ;
- External API ;
- migrations ;
- backups ;
- modules.

## Golden

Journals/Status fixtures.

## Browser

Playwright ou alternative justifiée :

- Overlay renderer ;
- cancellation ;
- Control Panel main journeys ;
- reconnect behavior.

## Fault injection

Pouvoir simuler :

- socket drop ;
- Core kill point ;
- Agent restart ;
- malformed event ;
- DB failure ;
- module throw ;
- overlay disconnect.

---

# 44. CAS DE TEST OBLIGATOIRES

1. réseau interrompu ;
2. Agent reconnect ;
3. mêmes SourceEvents renvoyés ;
4. zéro DomainEvent métier dupliqué ;
5. aucun événement source perdu ;
6. Agent crash après spool avant checkpoint ;
7. Core crash après durable ACK avant detector ;
8. recovery correct après ce crash ;
9. Journal rotation ;
10. partial EOF line ;
11. malformed complete line ;
12. Status initial low fuel ne déclenche pas d’alerte ;
13. transition low fuel false → true déclenche ;
14. Hull Critical interrompt présentation moins urgente ;
15. duplicate Hull Critical même épisode supprimé ;
16. main-ship Died → Ship Destroyed ;
17. on-foot Died → PAS Ship Destroyed ;
18. unknown context Died → PAS faux Ship Destroyed ;
19. Ship Destroyed vide/invalide queue appropriée ;
20. simulation ne crée aucun record live ;
21. simulation ne modifie aucune expedition live ;
22. replay ne touche pas WorldState live ;
23. replay ne publie pas External API ;
24. module throw ne tue pas Core ;
25. module circuit breaker ;
26. Overlay absent ;
27. Overlay reconnect ;
28. port 48100 collision ;
29. port 48101 collision ;
30. aucun fallback port ;
31. missing audio asset ;
32. audio cancellation ;
33. no ghost timer after interruption ;
34. migration déjà appliquée ;
35. migration checksum mismatch ;
36. backup avant migration ;
37. restore ;
38. Agent protocol mismatch ;
39. External API reconnect afterSequence ;
40. External API duplicate dedupe ;
41. External API requested gap too old ;
42. exobio catalogue miss ;
43. ScanOrganic Analyse high value ;
44. SellOrganicData reconciliation ;
45. remarkable body multi-source coalescing ;
46. unknown Scan field does not become false ;
47. WasFootfalled true/false/absent handled correctly.

---

# 45. ROOT COMMANDS

Créer des scripts simples et stables.

Minimum souhaité :

- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm run test:unit`
- `npm run test:integration`
- `npm run test:golden`
- `npm run test:e2e`
- `npm run verify`
- `npm run verify:final`

`verify` doit couvrir :

- lint ;
- typecheck ;
- unit ;
- integration ;
- build.

`verify:final` couvre en plus :

- golden ;
- browser/e2e ;
- architectural checks pertinents.

Éviter les tests dépendant de véritables credentials OBS/Tailscale.

Les smoke tests réels seront documentés séparément.

---

# 46. CI

Les scripts root sont la source de vérité.

Si le repository utilise GitHub, ajouter une GitHub Action utile, sans Docker.

Tester idéalement Node 24 sur :

- macOS ;
- Windows ;
- éventuellement Linux pour les packages cross-platform.

Les tests nécessitant véritable OBS/Elite/Tailscale ne font pas partie du CI standard.

Agent workspace doit pouvoir être installé/buildé sur Windows sans nécessiter le runtime SQLite Core.

Vérifier ce point réellement.

---

# 47. EXECUTION PLAN ONE SHOT

Tu dois suivre ces phases dans cet ordre.

Tu peux faire de petites adaptations internes, mais aucune phase ne peut être déclarée terminée si son gate est rouge.

Ne pas demander confirmation entre les phases.

---

## PHASE 0 — FOUNDATION + TECHNICAL VALIDATION

Avant code structurant :

1. inspecter tout le repository ;
2. identifier les fichiers/projets existants ;
3. ne rien écraser arbitrairement ;
4. vérifier les faits techniques critiques ;
5. écrire `docs/technical-validation.md` ;
6. résoudre versions Node/TS/dependencies ;
7. créer monorepo npm workspaces ;
8. TypeScript strict ;
9. contracts ;
10. config ;
11. Pino ;
12. test harness ;
13. lint ;
14. build scripts ;
15. base documentation.

Définir les contrats SourceEvent / DomainEvent / PresentationAction avant leur usage.

### Gate Phase 0

- install from clean checkout fonctionne ;
- build minimal ;
- lint ;
- typecheck ;
- Foundation tests verts.

Corriger avant Phase 1.

---

## PHASE 1 — AGENT ↔ CORE RELIABLE INGESTION

Implémenter :

- Journal tailer ;
- byte offsets ;
- partial lines ;
- rotation ;
- Status ;
- NavRoute foundation ;
- bootstrap ;
- filesystem watcher + reconciliation ;
- SourceEvent envelope ;
- deterministic IDs ;
- Agent sequence ;
- durable spool ;
- WebSocket ;
- Tailscale-ready Gateway ;
- auth token ;
- handshake ;
- heartbeat ;
- backoff+jitter ;
- durable Core inbox ;
- cumulative ACK ;
- resume/reconnect.

### Gate Phase 1

Tester explicitement :

A. connexion normale ;

B. socket coupée après envoi avant ACK ;

C. socket coupée après ACK ;

D. Agent restart ;

E. Core restart ;

F. Agent crash après spool avant cursor checkpoint ;

G. Core crash après durable commit/ACK avant SourceEvent processing ;

H. Journal rotation ;

I. duplicate resend.

Résultat requis :

- zéro SourceEvent logique perdu ;
- zéro traitement métier doublé sur fixtures ;
- spool se compacte uniquement après ACK ;
- aucune sélection silencieuse de port.

Corriger avant Phase 2.

---

## PHASE 2 — PREMIER VERTICAL SLICE

Utiliser :

`elite.ship.destroyed`

après validation actuelle de `Died`.

Créer une fixture positive main-ship.

Créer une fixture negative on-foot.

Vertical slice complet :

Journal Died  
→ Agent  
→ Core inbox  
→ SourceEvent processor  
→ WorldState context  
→ ShipDestroyed detector  
→ DomainEvent  
→ persistence  
→ Event Bus  
→ minimal Director path  
→ Presentation Engine  
→ Overlay.

Le design minimal Director/Presentation de cette phase doit être compatible avec leur généralisation en phases suivantes.

### Gate Phase 2

Démontrer automatiquement :

main ship Died  
→ une présentation réelle apparaît.

on-foot Died  
→ aucune `elite.ship.destroyed`.

Core sans Overlay  
→ continue.

Overlay reconnect  
→ continue.

---

## PHASE 3 — GENERIC CORE INFRASTRUCTURE

Implémenter/généraliser :

- WorldState ;
- reducers ;
- body state ;
- vehicle context ;
- Event Bus ;
- Event Catalog ;
- DomainEvent durable dispatch ;
- SQLite migrations ;
- backups ;
- Module SDK ;
- module registry ;
- module wrapper ;
- circuit breaker ;
- full Director ;
- Clock abstraction ;
- Session/Expedition foundation ;
- Records/Milestones services ;
- Simulation RunContext foundation.

Migrer le vertical slice ShipDestroyed vers les mêmes abstractions finales.

### Gate Phase 3

Tous unit + integration verts.

Aucune logique ShipDestroyed spéciale ne doit contourner le SDK/Director générique.

---

## PHASE 4 — PRESENTATION / OVERLAY / AUDIO

Finaliser :

- FULL ;
- COMPACT ;
- SILENT ;
- Presentation lifecycle ;
- Abort/cancel ;
- layers ;
- slots ;
- overlay reconnect ;
- Asset Manager ;
- audio buses ;
- preload ;
- missing asset ;
- preview ;
- audio status ;
- minimal original V1 presentation assets.

### Gate Phase 4

Test obligatoire :

une presentation joue animation + audio  
→ interruption  
→ animation arrêtée  
→ timer annulé  
→ audio source stoppée  
→ DOM nettoyé  
→ aucune action fantôme ensuite.

---

## PHASE 5 — FIVE V1 MODULES

ShipDestroyed existe déjà.

Ajouter :

- HullCritical ;
- LowFuel ;
- HighValueExobiology ;
- RemarkableBody.

Intégrer support `WasFootfalled` dans WorldState.

Ne pas créer un sixième faux FirstFootfall event.

Vérifier au préalable les mappings Elite actuels.

### Gate Phase 5

Les cinq DomainEvents fonctionnent sur fixtures vérifiées.

L’ajout des quatre nouveaux modules ne doit pas nécessiter une refonte Core.

Aucun module ne possède :

- SQL ;
- port ;
- serveur ;
- Fastify direct ;
- OBS direct.

---

## PHASE 6 — CONTROL PANEL

Implémenter les pages prévues.

Brancher exclusivement via API Core/SDK public interne approprié.

Main journeys Playwright :

- Overview ;
- inspect event ;
- view Director decision ;
- enable/disable/config module ;
- launch simulation ;
- inspect Agent ;
- inspect WorldState ;
- Start/End Expedition ;
- preview overlay ;
- change audio volume.

### Gate Phase 6

Control Panel peut être fermé pendant une activité :

Core et Overlay continuent.

Aucun écran nécessite accès direct à SQLite ou internals.

---

## PHASE 7 — REPLAY + GOLDEN REPLAYS

Implémenter :

- ReplayContext ;
- ReplayWorldState ;
- ReplayClock ;
- ReplaySession ;
- speeds ;
- instant ;
- ingestion Journals ;
- Golden tests.

### Gate Phase 7

Avant snapshot live WorldState  
→ replay  
→ après snapshot live WorldState

doivent être identiques.

Même exigence pour :

- records ;
- milestones ;
- active expedition.

External API reçoit zéro replay event par défaut.

---

## PHASE 8 — EXTERNAL EVENT API

Implémenter :

- WS endpoint ;
- subscriptions ;
- wildcard prefix ;
- domain sequences ;
- afterSequence ;
- replay window ;
- explicit gap ;
- read-only contract ;
- DynamicChatOverlay test consumer.

### Gate Phase 8

Tester :

- `elite.*`
- `elite.ship.*`
- exact event
- reconnect
- duplicate
- afterSequence
- gap too old
- Director SILENT mais external event reçu.

---

## PHASE 9 — HARDENING

Effectuer fault injection et corriger :

- Agent crash ;
- Core crash ;
- spool recovery ;
- DB recovery ;
- port collision ;
- missing asset ;
- module crash ;
- circuit breaker ;
- Agent protocol mismatch ;
- Overlay disconnect ;
- audio disconnect ;
- DB migration ;
- backup ;
- restore ;
- malformed config ;
- invalid SourceEvent ;
- install clean ;
- Windows path with spaces ;
- macOS path with spaces ;
- graceful shutdown.

Effectuer également :

- dependency audit approprié ;
- dead code review ;
- logs review ;
- secret leakage review ;
- package boundary review.

### Gate Phase 9

Aucun test hardening critique rouge.

---

## PHASE 10 — DOCUMENTATION + FINAL AUDIT

Créer/finaliser :

README.md

docs/
- architecture.md
- technical-validation.md
- deviations.md
- installation-mac.md
- installation-shadow.md
- tailscale.md
- configuration.md
- ports.md
- event-model.md
- event-catalog.md
- module-development.md
- simulation-and-replay.md
- obs-setup.md
- backup-and-restore.md
- troubleshooting.md

Ajouter si utile :

- protocol.md
- data-model.md
- testing.md

Puis audit complet repository.

Exécuter :

`npm run verify:final`

Corriger toute régression.

Ne pas considérer le projet terminé avant un résultat vert ou un véritable blocker explicitement documenté.

---

# 48. DOCUMENTATION — INSTALLATION MAC

Doit couvrir from scratch :

1. prérequis ;
2. Node 24 ;
3. clone ;
4. npm install/ci ;
5. config ;
6. data directory ;
7. Agent token ;
8. SQLite ;
9. build ;
10. startup Core ;
11. health check ;
12. Control Panel ;
13. Overlay test ;
14. backup test.

Aucune dépendance Docker.

Aucune dépendance PM2.

---

# 49. DOCUMENTATION — INSTALLATION SHADOW

Doit couvrir :

1. Node 24 ;
2. récupération code/release ;
3. installation Agent uniquement ;
4. configuration journal path ;
5. Agent identity ;
6. Core hostname ;
7. token ;
8. Tailscale connectivity ;
9. startup ;
10. logs ;
11. spool location ;
12. reconnect test.

Tester qu’un install Agent ne nécessite pas `better-sqlite3` Core inutilement.

---

# 50. DOCUMENTATION — TAILSCALE

Documenter :

- prérequis tailnet ;
- Mac + Shadow connectés ;
- MagicDNS si utilisé ;
- ACL ;
- mode préféré Tailscale Serve TCP ;
- commande actuelle, revalidée au moment du développement ;
- vérification Serve status ;
- connexion Agent ;
- troubleshooting ;
- alternative bind IP Tailscale explicite.

Jamais Funnel.

Ne pas automatiser une modification du tailnet.

---

# 51. DOCUMENTATION — OBS

Documenter :

1. Core démarré ;
2. Browser Source OBS ;
3. URL :
   `http://127.0.0.1:48100/overlay`
4. dimensions recommandées ;
5. audio ;
6. preview ;
7. refresh ;
8. reconnect ;
9. optional obs-websocket ;
10. authentication ;
11. test presentation.

La V1 doit fonctionner sans obs-websocket.

---

# 52. REINSTALL SHIPOS FROM ZERO

README doit contenir une section facilement visible :

# Reinstall ShipOS from zero

Elle doit permettre à quelqu’un six mois plus tard, sans se souvenir du projet, de reconstruire exactement l’installation.

Inclure :

MAC

- clone ;
- Node ;
- dependencies ;
- config ;
- restore ou nouvelle DB ;
- Core ;
- verify.

SHADOW

- Agent install ;
- journal path ;
- token ;
- connection.

TAILSCALE

- connectivity ;
- Serve/bind ;
- ACL check.

OBS

- Browser Source ;
- URL ;
- audio.

FINAL CHECK

- health ;
- Agent connected ;
- SourceEvent received ;
- simulation ;
- overlay ;
- audio ;
- backup.

Ne rien supposer de la mémoire de l’utilisateur.

---

# 53. BACKUP AND RESTORE

Documenter :

- emplacement DB ;
- automatique avant migration ;
- manuel ;
- rétention ;
- integrity check ;
- restore ;
- rollback process si migration échoue.

Ne jamais conseiller comme méthode normale :

« delete database and restart ».

---

# 54. TROUBLESHOOTING

Minimum :

- journal folder not found ;
- Agent cannot connect ;
- token mismatch ;
- Tailscale Serve issue ;
- 48100 occupied ;
- 48101 occupied ;
- protocol mismatch ;
- Status unreadable ;
- Journal malformed ;
- spool growing ;
- DB migration fail ;
- Overlay blank ;
- Overlay disconnected ;
- audio silent ;
- Browser Source cache ;
- obs-websocket unavailable ;
- module DEGRADED ;
- module auto-disabled ;
- backup/restore.

Chaque entrée doit inclure :

symptom  
→ probable cause  
→ diagnostic  
→ resolution.

---

# 55. INTERDICTIONS

Ne pas introduire :

- Docker comme prérequis ;
- PM2 comme prérequis ;
- Redis ;
- Kafka ;
- RabbitMQ ;
- MQTT sans justification nouvelle extraordinaire ;
- cloud backend ;
- public Internet API ;
- Electron ;
- marketplace ;
- arbitrary runtime plugins.

Ne pas :

- fusionner DynamicChatOverlay ;
- modifier les autres projets ;
- dépendre des fichiers internes EDEB ;
- modifier Journals Elite ;
- créer un port par module ;
- donner SQL aux modules ;
- mettre logique Elite dans Overlay ;
- mettre présentation dans Agent ;
- exposer Control API publiquement par défaut ;
- écouter `0.0.0.0` par défaut ;
- changer silencieusement de port ;
- confondre Died avec ship destruction sans contexte ;
- inventer un FirstFootfall achievement ;
- utiliser aveuglément WasLogged ;
- confondre estimation exobio avec valeur officielle ;
- mélanger live/simulation/replay ;
- supprimer DB pour migrer ;
- modifier arbitrairement OBS ;
- incorporer assets protégés Frontier.

---

# 56. HORS SCOPE V1

- plugin marketplace ;
- third-party arbitrary plugins ;
- IA/LLM ;
- TTS avancé ;
- cloud ;
- multi-user ;
- public Internet API ;
- multi-Shadow ;
- rule editor graphique ;
- advanced OBS transforms ;
- advanced ducking ;
- centralisation des autres outils de stream.

Ne pas ajouter du scope « tant qu’on y est ».

---

# 57. DEFINITION OF DONE V1

ShipOS V1 n’est terminé que lorsque :

## Agent / transport

- Journal tailing robuste ;
- rotation supportée ;
- Status supporté ;
- reconnect fiable ;
- spool durable ;
- Core durable inbox ;
- ACK après persistence ;
- aucun événement source perdu dans les scénarios supportés ;
- aucun événement métier doublé dans les scénarios supportés ;
- Core crash recovery testé.

## Core

- WorldState fiable ;
- unknown correctement représenté ;
- reducers testés ;
- DomainEvents persisted ;
- durable dispatch ;
- Event Bus ;
- cinq DomainEvents fonctionnels ;
- données Elite mappings vérifiés.

## Five V1 events

- ShipDestroyed context-gated ;
- HullCritical conforme à la granularité Frontier ;
- LowFuel transition-based ;
- HighValueExobiology clairement estimé avant vente ;
- RemarkableBody multi-source reasons[].

## First Footfall

- `WasFootfalled` moderne compris lorsqu’il est présent ;
- absence = unknown ;
- aucune fausse affirmation d’achievement First Footfall.

## Director

- scoring ;
- TTL ;
- cooldown ;
- exact dedupe ;
- semantic dedupe ;
- coalescing ;
- attention budget ;
- queue ;
- interruption ;
- exclusive ;
- FULL/COMPACT/SILENT ;
- chaque décision expliquable.

## Persistence

- SQLite WAL ;
- migrations ;
- checksums ;
- backups ;
- restore ;
- aucune migration via suppression DB.

## Modules

- boundaries respectées ;
- aucun SQL ;
- aucun port ;
- circuit breaker ;
- module failure isolée.

## Presentation

- Overlay fonctionnel ;
- Core indépendant Overlay ;
- cancellation ;
- no ghost timer ;
- no ghost audio ;
- stable asset catalog ;
- Browser Source OBS documentée/testable.

## Simulation

- trois niveaux ;
- scenarios ;
- persistence isolated.

## Replay

- 1x/5x/20x/instant ;
- WorldState isolated ;
- no live records ;
- no external events par défaut ;
- golden tests.

## External API

- read-only ;
- DomainEvents uniquement ;
- subscriptions ;
- sequence ;
- reconnect ;
- dedupe ;
- gap handling.

## Control Panel

- pages principales utilisables ;
- fermeture sans impact Core ;
- Event Inspector complet.

## Operations

- port collisions explicites ;
- no silent fallback ;
- Tailscale docs ;
- OBS docs ;
- backups ;
- troubleshooting ;
- clean reinstall.

## Quality

- lint vert ;
- typecheck vert ;
- unit vert ;
- integration vert ;
- golden vert ;
- browser/e2e vert ;
- build vert ;
- `npm run verify:final` vert.

---

# 58. FINAL REPOSITORY AUDIT

Avant de terminer :

1. relire cette spécification ;
2. comparer chaque invariant au repository final ;
3. rechercher TODO/FIXME structurants ;
4. supprimer code mort évident ;
5. rechercher secrets ;
6. rechercher ports hardcodés inappropriés ;
7. rechercher SQL dans modules ;
8. rechercher imports Core internals dans modules ;
9. rechercher `process.env` dans modules ;
10. vérifier que simulation/replay ne peuvent pas atteindre live persistence ;
11. vérifier tous les docs ;
12. exécuter install/build/test final.

Ne laisser aucun TODO correspondant à une exigence V1.

Un TODO explicitement hors-scope est acceptable uniquement s’il est correctement décrit.

---

# 59. COMPORTEMENT ATTENDU À LA FIN DE CETTE INSTRUCTION

Ne réponds pas uniquement avec :

- un plan ;
- une architecture ;
- du pseudo-code ;
- une liste de fichiers à créer.

Construis réellement ShipOS V1 dans le repository.

Travaille phase après phase.

Après chaque phase :

- exécute le gate ;
- corrige les failures ;
- maintiens la documentation ;
- continue automatiquement.

À la fin seulement, fournir un rapport synthétique indiquant :

- phases terminées ;
- architecture livrée ;
- tests exécutés ;
- résultat de `verify:final` ;
- choix techniques importants ;
- faits Elite vérifiés ;
- éventuels écarts documentés ;
- éventuels blockers externes réels ;
- instructions pour lancer Core et Agent.

La priorité est :

**un ShipOS réel, robuste et utilisable**, et non une implémentation fidèle à une hypothèse factuellement fausse.

Tu disposes dès maintenant de la vision complète.

Commence par inspecter le repository et valider les faits techniques critiques, puis poursuis automatiquement jusqu’à la Definition of Done V1.