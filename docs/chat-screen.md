# !screen — audit et exploitation

Checkpoint avant modification : ShipOS main d71aaed ; DynamicChatOverlay master 195d038 ; arbres propres, tags before-chat-screen, branches codex/viewer-screen. Baselines : verify:final ShipOS et check Chat Overlay (journaux /tmp/screen-baseline-*.log).

Audit : obs-websocket-js 5.0.8 installé, OBS 32.2.2 installé, obs-websocket 5.7.4 / RPC 1 confirmé dans les logs OBS. [Protocole 5.7.4](https://github.com/obsproject/obs-websocket/blob/5.7.4/docs/generated/protocol.md), [implémentation screenshot](https://github.com/obsproject/obs-websocket/blob/5.7.4/src/requesthandler/RequestHandler_Sources.cpp), [client 5.0.8](https://github.com/obs-websocket-community-projects/obs-websocket-js/tree/v5.0.8). GetVersion vérifie aussi les capacités à chaque connexion.

GO : extension du seul ObsAdapter et du bridge existant. GetSourceScreenshot accepte une scène, JPEG, redimensionnement et qualité. GetStreamStatus fournit activité, reconnexion et durée ; StreamStateChanged entretient l'état sans polling. GetCurrentProgramScene, GetCurrentSceneTransitionCursor, GetSceneItemList et GetGroupSceneItemList permettent les contrôles ponctuels.

V1 **program uniquement** : `programScene` est configuré par défaut à **Relay - In-Game (Purple)**, le nom fourni pour le stream actuel, et doit correspondre exactement à la scène Program. `requiredSource`, si renseigné, doit être accessible par une chaîne enabled de scènes/groupes. OBS rend la composition et ses crops ; aucun rendu brut de source bureau n'est demandé. Source mode rejeté. Transitions, stream en reconnexion, changements de scène/éléments pendant l'opération : abandon sans fichier valide. Ces contrôles ne prouvent pas le contenu sémantique du bureau ; tout contenu privé effectivement montré dans la scène autorisée peut figurer dans la photo. Pas de garantie atomique entre plusieurs RPC : les événements et contrôles avant/après réduisent cette fenêtre, et les captures ambiguës sont jetées.

La liaison OBS était DISABLED au début de l'audit. Les tests mocks ne constituent pas un smoke test OBS réel. Aucun live ne sera lancé automatiquement.

## Aperçu et intermission

Le panneau **System** du Control Panel conserve une miniature de la dernière capture, même après la fin de l'alerte temporaire. L'URL locale `/screens` fournit une source Browser Source distincte pour une scène d'intermission : elle choisit la session active ou la dernière session terminée, puis présente les captures en slideshow silencieux avec fondu. `?mode=mosaic` active une grille 3 colonnes. La page se rafraîchit seulement toutes les dix secondes et ne crée ni service ni port supplémentaire. Ajouter cette source uniquement à la scène d'intermission et activer « Shutdown source when not visible » dans OBS.

Les images restent dans `<dataDir>/screens/<session>/`. Une capture n'est jamais envoyée vers un service distant. Le changement de scène OBS reste sous le contrôle d'OBS ; ShipOS ne bascule pas automatiquement la scène Program.
