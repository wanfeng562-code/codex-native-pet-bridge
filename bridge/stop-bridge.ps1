. (Join-Path $PSScriptRoot 'common.ps1')
$hostConfig = Get-BridgeHostConfiguration
& $hostConfig.node (Join-Path $BridgeRoot 'controller.mjs') stop
$task = Get-ScheduledTask -TaskName $BridgeTaskName -ErrorAction SilentlyContinue
if ($task -and $task.Actions.Execute -eq $GuiHost -and $task.Actions.Arguments -eq 'controller') {
    Disable-ScheduledTask -TaskName $BridgeTaskName | Out-Null
}
$manifestPath = Join-Path $RuntimeRoot 'startup-entries.json'
if (Test-Path -LiteralPath $manifestPath) {
    $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
    $shell = New-Object -ComObject WScript.Shell
    $client = Get-OriginalClient
    foreach ($entry in $manifest.entries) {
        if (-not (Test-Path -LiteralPath $entry.path)) { continue }
        $link = $shell.CreateShortcut($entry.path)
        if ($link.TargetPath -ne $GuiHost -or $link.Arguments -ne 'launch') { continue }
        $backup = [IO.Path]::GetFullPath($entry.backup)
        if (-not $backup.StartsWith((Join-Path $RuntimeRoot 'shortcut-backups')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected shortcut backup path.' }
        Copy-Item -LiteralPath $backup -Destination $entry.path -Force
        $restored = $shell.CreateShortcut($entry.path)
        $restored.TargetPath=$client.Executable; $restored.WorkingDirectory=Split-Path -Parent $client.Executable
        $restored.IconLocation=$client.Executable+',0'; $restored.Save()
    }
}
Write-Output 'Bridge disabled. Original pet layer returns within eight seconds. Stable form is retained.'
