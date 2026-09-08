# Démarrage automatique

## Mac : Core (configuré le 2026-09-08)

Le LaunchAgent `~/Library/LaunchAgents/local.shipos.core.plist` lance Core à l'ouverture de la session macOS, puis le relance après une sortie. Il utilise Node24 via `/opt/homebrew/opt/node@24/bin/node`, le dépôt `/Users/jnbiere/Projects/ShipOS` et le fichier privé `~/.config/shipos/shipos.env`. Ne déplace pas ces fichiers sans adapter le service. Aucun jeton n'est intégré au plist.

Le terminal de Core n'est plus nécessaire. Tailscale Serve est déjà configuré en arrière-plan sur le port48101 ; l'application Tailscale doit être connectée. Le service dépend de la session utilisateur et ne maintient pas le Mac éveillé.

```sh
# État
launchctl print gui/$(id -u)/local.shipos.core
# Redémarrage gracieux (launchd relance Core)
launchctl kill SIGTERM gui/$(id -u)/local.shipos.core
# Arrêt et retrait de la session courante
launchctl bootout gui/$(id -u) "$HOME/Library/LaunchAgents/local.shipos.core.plist"
# Rechargement
launchctl bootstrap gui/$(id -u) "$HOME/Library/LaunchAgents/local.shipos.core.plist"
```

Pour désinstaller, utilise bootout puis supprime uniquement ce plist. Logs de démarrage dans `~/Library/Logs/ShipOS/`; logs applicatifs rotatifs dans `~/Library/Application Support/ShipOS/logs/`. Core a été contrôlé via /health et la reconnexion réelle de Shadow après passage sous launchd. La relance par launchd a également été vérifiée ; aucun redémarrage complet du Mac n'a été effectué.

## Shadow : Agent

La tâche Windows lance l'Agent à l'ouverture de ta session, sous ton compte habituel, avec les mêmes chemins Journal et spool. Elle ne demande pas de mot de passe et n'a pas de limite de durée. Les erreurs de processus déclenchent une nouvelle tentative après une minute ; le transport gère lui-même les coupures réseau. La mise hors tension de Shadow ou la fermeture de session arrête l'Agent.

1. Arrête l'Agent lancé manuellement avec **Ctrl+C** pour éviter un doublon.
2. Récupère `scripts/install-agent-autostart.ps1` depuis le dépôt à jour (git pull si tu as cloné le dépôt, ou téléchargement du fichier).
3. Ouvre PowerShell sous le compte qui joue à Elite, puis exécute :

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\ShipOS\scripts\install-agent-autostart.ps1
```

Le script repère le fichier privé dans `C:\ShipOS\shipos.env` ou `C:\ShipOS Config\shipos.env`. S'il trouve les deux, indique le chemin exact avec `-EnvFile "C:\ShipOS Config\shipos.env"` (ou l'autre chemin si c'est celui de ton Agent). Le bypass s'applique uniquement au processus d'installation, pas à la politique globale. Si Windows refuse l'enregistrement de la tâche, rouvre PowerShell en administrateur avec le même compte utilisateur.

```powershell
# État
Get-ScheduledTask -TaskName 'ShipOS Agent' | Select-Object TaskName, State
# Dernier résultat (267009 signifie que la tâche est encore en cours)
Get-ScheduledTaskInfo -TaskName 'ShipOS Agent'
# Arrêter / démarrer
Stop-ScheduledTask -TaskName 'ShipOS Agent'
Start-ScheduledTask -TaskName 'ShipOS Agent'
# Désinstaller après arrêt
Unregister-ScheduledTask -TaskName 'ShipOS Agent' -Confirm:$false
```

Vérifie ensuite Agent connecté dans le Control Panel, puis refais le contrôle après la prochaine ouverture de session Shadow. Le script a été contrôlé syntaxiquement sur Mac ; l'enregistrement natif Windows reste à exécuter sur Shadow.

Références : [paramètres des tâches Microsoft](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasksettingsset), [compte interactif Microsoft](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtaskprincipal).
