param(
    [Parameter(Mandatory)][ValidatePattern('^[A-Za-z0-9_-]{1,160}$')][string]$PetId,
    [ValidateRange(1024,65535)][int]$Port=46873,
    [string]$AssetDir='examples/deepseek-v2/assets',
    [switch]$UpdateStartMenu,
    [switch]$NoStart
)
. (Join-Path $PSScriptRoot 'bridge\common.ps1')
Assert-NormalUser
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$powershellPath = (Get-Command pwsh.exe -ErrorAction Stop).Source
if ([int](& $nodePath -p 'process.versions.node.split(".")[0]') -lt 22) { throw 'Node.js 22 or later is required.' }
$legacyTask = Get-ScheduledTask -TaskName 'DeepseekNativePet-RuntimeBridge' -ErrorAction SilentlyContinue
if ($legacyTask -and $legacyTask.State -eq 'Running') {
    throw 'The earlier local Deepseek bridge is running. Disable it before installing a second controller. The current client was left open.'
}
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
$configPath = Join-Path $BridgeRoot 'config.local.json'
$configuration = [ordered]@{petId=$PetId;port=$Port;assetDir=$AssetDir;updateStartMenu=[bool]$UpdateStartMenu}
# Validate before persisting local paths or creating any task.
$validationInput = Join-Path $RuntimeRoot 'setup-validation.json'
$configuration | ConvertTo-Json | Set-Content -LiteralPath $validationInput -Encoding utf8
try {
    & $nodePath (Join-Path $PSScriptRoot 'tools\validate-config.mjs') $validationInput
    if ($LASTEXITCODE -ne 0) { throw 'Invalid configuration.' }
} finally { Remove-Item -LiteralPath $validationInput -Force -ErrorAction SilentlyContinue }
$configuration | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding utf8
[ordered]@{powershell=$powershellPath;node=$nodePath;port=[string]$Port} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RuntimeRoot 'host-config.json') -Encoding utf8
& (Join-Path $BridgeRoot 'build-host.ps1')
& (Join-Path $BridgeRoot 'install-shortcuts.ps1') -UpdateStartMenu:$UpdateStartMenu
& (Join-Path $BridgeRoot 'install-task.ps1') -NoStart:$NoStart
Write-Output 'Installed. Use Start Codex Pet.lnk. Your original client files and profile were preserved.'
