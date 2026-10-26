param([switch]$NoStart)
. (Join-Path $PSScriptRoot 'common.ps1')
Assert-NormalUser
$existing = Get-ScheduledTask -TaskName $BridgeTaskName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Actions.Execute -ne $GuiHost -or $existing.Actions.Arguments -ne 'controller') {
        throw 'A different task already uses this name. Refusing to overwrite it.'
    }
    Enable-ScheduledTask -TaskName $BridgeTaskName | Out-Null
} else {
    $user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action = New-ScheduledTaskAction -Execute $GuiHost -Argument 'controller' -WorkingDirectory $BridgeRoot
    $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $BridgeTaskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Description 'Local native pet runtime bridge. No installed application files are modified.' | Out-Null
}
if (-not $NoStart) { Start-ScheduledTask -TaskName $BridgeTaskName }
