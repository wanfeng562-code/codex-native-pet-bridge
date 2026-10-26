. (Join-Path $PSScriptRoot 'common.ps1')
Assert-NormalUser
$config = Get-BridgeConfiguration
$hostConfig = Get-BridgeHostConfiguration
& (Join-Path $BridgeRoot 'open-client.ps1') -Port $config.port
$task = Get-ScheduledTask -TaskName $BridgeTaskName -ErrorAction SilentlyContinue
if (-not $task -or $task.Actions.Execute -ne $GuiHost -or $task.Actions.Arguments -ne 'controller') {
    throw 'The owned bridge task is missing or has changed. Run setup.ps1 again.'
}
Enable-ScheduledTask -TaskName $BridgeTaskName | Out-Null
Start-ScheduledTask -TaskName $BridgeTaskName
if ($config.updateStartMenu) { & (Join-Path $BridgeRoot 'install-shortcuts.ps1') -UpdateStartMenu }
[ordered]@{launchedAt=[DateTimeOffset]::Now.ToString('o');port=$config.port;originalProfile=$true;programFilesModified=$false} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $RuntimeRoot 'launch.json') -Encoding utf8
