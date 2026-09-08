# Démarrer ShipOS sur Shadow depuis GitHub

Le Core reste lancé sur le Mac. Shadow ne lance que l’Agent ; OBS pourra être configuré après réception des premiers événements.

## 1. Récupérer le code

Installe Node **24** sur Shadow, puis ouvre un nouveau PowerShell et vérifie `node --version`.

Depuis [le dépôt ShipOS](https://github.com/JNPierre57/ShipOS), choisis **Code → Download ZIP**, extrais l’archive, puis ouvre PowerShell dans le dossier contenant `package.json`. Si Git est installé, tu peux aussi utiliser :

```powershell
git clone https://github.com/JNPierre57/ShipOS.git
cd ShipOS
```

Installe et compile uniquement l’Agent et ses contrats :

```powershell
npm.cmd ci --workspace @shipos/agent --workspace @shipos/contracts --include=dev
npm.cmd run build:agent
```

`npm.cmd` évite le blocage éventuel du script npm.ps1 par PowerShell. Cette installation ne nécessite pas SQLite ni la compilation des interfaces.

## 2. Relier les machines

Connecte Mac et Shadow au même réseau Tailscale. Sur le Mac, la passerelle ShipOS écoute par défaut uniquement en local. Configure son accès via Serve selon le [guide Tailscale](tailscale.md), puis relève le nom ou l’adresse Tailscale du Mac. Le port de l’Agent est **48101** ; le Control Panel **48100** reste local au Mac.

## 3. Créer la configuration sur Shadow

Dans PowerShell, ce bloc demande les valeurs réelles :

```powershell
New-Item -ItemType Directory -Force 'C:\ShipOS Config' | Out-Null
$shiposMac = Read-Host 'Nom ou adresse Tailscale du Mac'
$shiposJournal = Read-Host 'Chemin complet du dossier Journal Elite Dangerous'
if (-not (Test-Path -LiteralPath $shiposJournal -PathType Container)) {
    throw 'Le dossier Journal est introuvable. Vérifie le chemin avant de continuer.'
}
@{
    url = "ws://${shiposMac}:48101/agent/v1/ws"
    journalDir = $shiposJournal
} | ConvertTo-Json | ForEach-Object {
    [System.IO.File]::WriteAllText('C:\ShipOS Config\agent.json', $_, (New-Object System.Text.UTF8Encoding($false)))
}
```

Le dossier Journal se trouve habituellement sous ton dossier utilisateur Windows, dans `Saved Games\Frontier Developments\Elite Dangerous`. Vérifie son emplacement réel ; le chemin peut être déplacé.

## 4. Transférer le fichier privé

Sur le Mac, le fichier déjà créé est `~/.config/shipos/shipos.env`. Dans Finder, **Aller → Aller au dossier** permet d’ouvrir `~/.config/shipos`.

Copie ce fichier de manière privée sur Shadow vers `C:\ShipOS Config\shipos.env`. Il contient le jeton partagé : ne le publie pas dans GitHub ni dans un message. Ajoute cette ligne au fichier sur Shadow, en conservant la ligne du jeton :

```text
SHIPOS_AGENT_CONFIG=C:\ShipOS Config\agent.json
```

## 5. Lancer et vérifier

Depuis le dossier du code ShipOS sur Shadow :

```powershell
node --env-file="C:\ShipOS Config\shipos.env" dist/apps/agent/src/main.js
```

Laisse le terminal ouvert. Sur le Mac, ouvre la page **Agent** du Control Panel : connexion active et progression des séquences/ACK doivent apparaître. Lance Elite pour vérifier l’arrivée des événements. En cas d’échec, relève l’erreur de l’Agent sans copier le contenu du fichier privé ; voir [dépannage](troubleshooting.md).
