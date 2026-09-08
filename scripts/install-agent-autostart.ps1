[CmdletBinding()]
param(
    [string]$ShipOSDirectory = 'C:\ShipOS',
    [string]$EnvFile = ''
)
$ErrorActionPreference = 'Stop'
$shiposRoot = (Resolve-Path -LiteralPath $ShipOSDirectory).Path
$shiposEntry = Join-Path $shiposRoot 'dist\apps\agent\src\main.js'
if (-not (Test-Path -LiteralPath $shiposEntry -PathType Leaf)) {
    throw 'Agent build missing. Run npm.cmd run build:agent from the ShipOS folder first.'
}
if (-not $EnvFile) {
    $shiposCandidates = @(
        (Join-Path $shiposRoot 'shipos.env'),
        'C:\ShipOS Config\shipos.env'
    ) | Select-Object -Unique | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
    if (@($shiposCandidates).Count -ne 1) {
        throw 'Specify -EnvFile with the exact private environment file used for your working Agent.'
    }
    $EnvFile = @($shiposCandidates)[0]
}
$shiposEnv = (Resolve-Path -LiteralPath $EnvFile).Path
$shiposNode = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$shiposVersion = & $shiposNode --version
if ($shiposVersion -notmatch '^v24\.') { throw 'Node 24 is required.' }
$shiposUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$shiposName = 'ShipOS Agent'
$shiposAction = New-ScheduledTaskAction -Execute $shiposNode `
    -Argument ('--env-file="{0}" "{1}"' -f $shiposEnv, $shiposEntry) `
    -WorkingDirectory $shiposRoot
$shiposTrigger = New-ScheduledTaskTrigger -AtLogOn -User $shiposUser
$shiposPrincipal = New-ScheduledTaskPrincipal -UserId $shiposUser -LogonType Interactive -RunLevel Limited
$shiposSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
$shiposExisting = Get-ScheduledTask -TaskName $shiposName -ErrorAction SilentlyContinue
if ($shiposExisting -and $shiposExisting.State -eq 'Running') {
    throw 'The ShipOS task is already running. Stop-ScheduledTask -TaskName "ShipOS Agent" before updating it.'
}
Register-ScheduledTask -TaskName $shiposName -Action $shiposAction `
    -Trigger $shiposTrigger -Principal $shiposPrincipal -Settings $shiposSettings `
    -Description 'ShipOS Agent: starts at user logon; private token stays in the environment file.' -Force | Out-Null
Start-ScheduledTask -TaskName $shiposName
Get-ScheduledTask -TaskName $shiposName | Select-Object TaskName, State
Write-Host 'Installed. Check the Mac Control Panel for the Agent connection.'
