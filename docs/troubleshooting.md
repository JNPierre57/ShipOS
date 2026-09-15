# Troubleshooting

| Symptom | Probable cause | Diagnostic | Resolution |
|---|---|---|---|
| Journal folder not found | relocated Saved Games or wrong override | inspect configured folder in PowerShell | set journalDir to actual readable Elite folder |
| Agent cannot connect | Core/Serve/firewall unavailable | Core health, Agent logs, tailscale ping/status | start Core, correct hostname/port, fix network policy |
| Token mismatch | different secrets | Agent connection error and gateway401 | load same private token on both; never paste it in logs/URLs |
| Tailscale Serve issue | wrong forward or ACL | tailscale serve status, verify local48101 | apply documented TCP forward and restrictive grant manually |
| 48100 occupied | another local listener | lsof or Get-NetTCPConnection | stop conflict or intentionally change Core port/client URLs |
| 48101 occupied | stale Core/direct bind/Serve conflict | inspect listener and bind mode | select one gateway exposure mode; no fallback |
| Protocol mismatch | incompatible builds | explicit WS error/close1008 | align Agent and Core v1 versions |
| Status unreadable | transient file replacement/permissions | sidecar_unreadable log | wait for bounded retry/reconciliation; verify access |
| !ship and !loadout stop after engineering | awaiting a Loadout snapshot that may never follow EngineerCraft | ship_data_unavailable after crafting | use the engineering projection fix; incomplete/mismatched data still requires a complete Loadout |
| Journal malformed | incomplete/invalid record | quarantine filename and byte offsets | inspect preserved record; later complete lines continue |
| Spool growing | Core unavailable or rejected events | compare Agent pending/ACK and gateway error | fix connection or source issue; retain all unACKed data |
| Resync required after DB restore | restored Core behind Agent ACK | checkpoint ACK vs ingest sequence | restore consistent recent DB/spool archive; do not reset ACK blindly |
| DB migration fails | checksum mismatch, disk full, invalid SQL | startup error and backups | restore previous release+pre-migration backup; retain failed DB |
| Overlay blank | no active run or missing build | health, /overlay, preview simulation | build, correct URL, launch preview |
| Overlay disconnected | Core restart/network closure | Control Panel Overlay count | restart Core; client retries every second |
| Audio silent | suspended context, zero volume, OBS routing | Audio state, mixer and recorded test | user gesture/OBS settings; raise buses and test cue |
| Browser Source stale | cached previous build | reload after npm run build | refresh browser-source cache/source |
| OBS websocket unavailable | disabled adapter, auth or missing OBS | System obs status | leave optional adapter off or fix private password/host |
| Module DEGRADED | detector/factory exception | Modules lastFailure and Source Inspector | correct config/cause; other modules continue |
| Module auto-disabled | consecutive failures reached threshold | health DISABLED, error count | fix cause then re-enable manually |
| Backup/restore failed | filesystem/disk/integrity problem | backup error and integrity check | free space/fix permissions, use a known-good snapshot |
| Already owns data directory | second live process or lock owner | inspect PID in core.lock/agent.lock | stop owner; stale PID locks recover automatically; inspect invalid lock before removing |

Logs rotate at5MiB, retaining four rotated files plus current file. Paths are dataDir/logs/core.jsonl or agent.jsonl. Correlated source/domain IDs aid diagnosis. Do not share raw private Journals publicly without reviewing them. No normal recovery procedure requires deleting the database.

## Distinguer une commande refusée d'un affichage interrompu

Les logs `core.jsonl` consignent désormais les changements de connexion Agent (génération, séquence ACK, code de fermeture), les connexions overlay, l'envoi d'une présentation et son retour `Overlay rendered`. Ces traces utilisent la rotation existante ; aucune nouvelle base, aucun historique de chat et aucun polling ne sont ajoutés. Le message navigateur est émis une fois par carte montée après deux frames, et une nouvelle fois lorsqu'une carte active est restaurée après reconnexion. Les doublons sont ignorés ; les reçus inconnus ou expirés ne deviennent pas des succès.

`presented` ou `completed` dans l'historique décrit le cycle du moteur : cela ne prouve pas que l'image soit apparue dans OBS. `Overlay rendered` confirme que le navigateur a monté la carte et atteint une frame ; cela ne prouve pas sa visibilité dans la composition Program (source masquée, recadrage, scène inactive, etc.). Le client est identifié comme OBS lorsque son User-Agent l'indique, sinon comme navigateur. Un ancien onglet doit être actualisé pour envoyer ces reçus.

### Incident du 15 septembre 2026 — heures de Paris

- 18:07:55 : application d'un effet expérimental sur le PowerPlant ; l'ancienne réduction mettait `loadoutAt` à null et attendait un Loadout qui n'est jamais arrivé pendant cette session.
- 18:18:54 et 18:19:09 : !ship et !loadout refusés avec `ship_data_unavailable`. Cette cause est confirmée, indépendante du warning Status.
- Après 18:00 : 19 présentations ont terminé leur cycle Core, dont des communications Crew ; dernière à 19:33:14. Leur affichage OBS n'était pas acquitté à cette date, donc ces traces ne suffisent pas à réfuter un écran silencieux.
- 19:44:41 : arrêt réel du stream dans le log OBS.
- 19:54:19 : Shutdown Elite et warning Agent `sidecar_unreadable` fourni par l'utilisateur. À 19:54:20.081, le Status final a été reçu et traité. Cette lecture a repris en environ 325 ms après le warning ; le log ne révèle pas le type exact d'erreur de lecture/JSON.

L'utilisateur a redémarré l'Agent en cours de partie. Son état connecté après coup ne prouve donc pas une continuité antérieure. Le journal local ne conservait pas les heures des quatre connexions observées : leur horaire exact n'est pas reconstituable. Les nouvelles traces comblent ce manque pour un prochain essai. Le Shadow était éteint lors de la seconde investigation.

Validation du correctif : baseline `verify:final` réussie avant modification ; rejeu en mémoire des événements réels de cette session avec projection des 131 EngineerCraft (aucun refus de projection), reprise après une génération Agent simulée, deux commandes aux heures des refus historiques désormais présentées, refus maintenu après Shutdown. Aucun événement ni message n'a été injecté dans le live pendant ce rejeu.

Validation finale : `verify:final` réussie après modification (lint, TypeScript, build, 39 tests unitaires, 66 tests d'intégration, 40 golden, 16 navigateur, contrôle d'architecture). Baseline : 36 unitaires, 65 intégration, 40 golden, 16 navigateur. Aucune régression détectée par ces contrôles ; essai OBS/Twitch/Elite réel encore nécessaire pour la disparition globale des animations. Checkpoint : `before-gameplay-silence-fix-20260915` sur `2489cbd` ; branche `codex/gameplay-silence-fix`.
