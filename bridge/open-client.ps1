param([ValidateRange(1024,65535)][int]$Port=46873,[switch]$RestartClient)
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-NormalUser
$client = Get-OriginalClient
$running = @(Get-CimInstance Win32_Process -Filter "Name = 'ChatGPT.exe'" | Where-Object ExecutablePath -eq $client.Executable)
if ($running.Count -and -not (Test-LocalPetConnection $Port) -and -not $RestartClient) {
    throw 'Codex is running without the local pet connection. Save your work and quit the client first, then retry. No client was closed.'
}
if ($RestartClient) {
    # Explicit opt-in only; stop exact installed client roots, no other apps.
    $ids = @($running.ProcessId)
    foreach ($process in @($running | Where-Object { $_.ParentProcessId -notin $ids })) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
    foreach ($processId in $ids) { Wait-Process -Id $processId -Timeout 12 -ErrorAction SilentlyContinue }
}
$null = Start-OriginalPetClient $client $Port
for ($attempt=0; $attempt -lt 40; $attempt++) {
    if (Test-LocalPetConnection $Port) { Write-Output "Native pet connection ready on 127.0.0.1:$Port"; return }
    Start-Sleep -Milliseconds 500
}
throw 'The client did not open its local debugging endpoint. No client files were changed.'
