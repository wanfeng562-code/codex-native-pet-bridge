param([switch]$UpdateStartMenu)
. (Join-Path $PSScriptRoot 'common.ps1')
$client = Get-OriginalClient
$shell = New-Object -ComObject WScript.Shell
$manifestPath = Join-Path $RuntimeRoot 'startup-entries.json'
$entries = @()
if (Test-Path -LiteralPath $manifestPath) { $entries = @((Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json).entries) }
$backupRoot = Join-Path $RuntimeRoot 'shortcut-backups'
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
if ($UpdateStartMenu) {
    $folder = [Environment]::GetFolderPath('StartMenu')
    foreach ($file in @(Get-ChildItem -LiteralPath $folder -Filter '*.lnk' -File -Recurse -ErrorAction SilentlyContinue)) {
        $link = $shell.CreateShortcut($file.FullName)
        $original = $link.TargetPath -match '\\WindowsApps\\OpenAI\.Codex_[^\\]+\\app\\ChatGPT\.exe$'
        $ours = $link.TargetPath -eq $GuiHost -and $link.Arguments -eq 'launch'
        if (-not ($original -or $ours)) { continue }
        if ($original) {
            $backup = Join-Path $backupRoot ([guid]::NewGuid().ToString('N')+'.lnk')
            Copy-Item -LiteralPath $file.FullName -Destination $backup
            $entries += [ordered]@{path=$file.FullName;backup=$backup}
            [ordered]@{entries=$entries} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
        }
        $link.TargetPath = $GuiHost; $link.Arguments = 'launch'
        $link.WorkingDirectory = $BridgeRoot; $link.IconLocation = $client.Executable+',0'
        $link.Save()
    }
}
foreach ($item in @(@{name='Start Codex Pet.lnk';mode='launch'},@{name='Disable Codex Pet.lnk';mode='stop'})) {
    $entry = $shell.CreateShortcut((Join-Path $RepositoryRoot $item.name))
    $entry.TargetPath=$GuiHost; $entry.Arguments=$item.mode
    $entry.WorkingDirectory=$BridgeRoot; $entry.IconLocation=$client.Executable+',0'
    $entry.Description='Native Codex pet runtime bridge'
    $entry.Save()
}
