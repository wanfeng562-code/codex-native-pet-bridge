$ErrorActionPreference = 'Stop'
$BridgeRoot = $PSScriptRoot
$RepositoryRoot = Split-Path -Parent $BridgeRoot
$RuntimeRoot = Join-Path $BridgeRoot '.runtime'
$BridgeTaskName = 'CodexNativePetBridge'
$GuiHost = Join-Path $RuntimeRoot 'bridge-host.exe'
function Get-BridgeConfiguration {
    $path = Join-Path $BridgeRoot 'config.local.json'
    if (-not (Test-Path -LiteralPath $path)) { throw 'Run setup.ps1 -PetId <your-native-pet-id> first.' }
    Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
}
function Get-BridgeHostConfiguration {
    Get-Content -LiteralPath (Join-Path $RuntimeRoot 'host-config.json') -Raw | ConvertFrom-Json
}
function Get-OriginalClient {
    $package = Get-AppxPackage -Name OpenAI.Codex
    if (-not $package) { throw 'The installed OpenAI.Codex Windows package was not found. This adapter supports the packaged Windows client.' }
    $manifest = Get-AppxPackageManifest -Package $package.PackageFullName
    $application = @($manifest.Package.Applications.Application) | Where-Object Id -eq 'App' | Select-Object -First 1
    $executable = Join-Path $package.InstallLocation ([string]$application.Executable)
    if (-not (Test-Path -LiteralPath $executable)) { throw 'Installed client executable not found.' }
    [pscustomobject]@{Package=$package;Executable=$executable;ApplicationId=($package.PackageFamilyName+'!'+$application.Id)}
}
function Test-LocalPetConnection([int]$Port) {
    try { $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/list" -TimeoutSec 1; $true } catch { $false }
}
function Assert-NormalUser {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if ([Security.Principal.WindowsPrincipal]::new($identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run normally, without administrator privileges.'
    }
}
function Start-OriginalPetClient($Client,[int]$Port) {
    if (-not ('CodexPetBridge.PackageActivation' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
namespace CodexPetBridge {
    [ComImport, Guid("2e941141-7f97-4756-ba1d-9decde894a3d"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IActivation {
        [PreserveSig] int ActivateApplication([MarshalAs(UnmanagedType.LPWStr)] string id, [MarshalAs(UnmanagedType.LPWStr)] string args, int options, out uint pid);
    }
    [ComImport, Guid("45BA127D-10A8-46EA-8AB7-56EA9078943C")] public class Activation {}
    public static class PackageActivation {
        public static uint Launch(string id, string args) {
            var activation=(IActivation)new Activation(); uint pid;
            int result=activation.ActivateApplication(id,args,0,out pid);
            if(result!=0) Marshal.ThrowExceptionForHR(result);
            return pid;
        }
    }
}
'@
    }
    [CodexPetBridge.PackageActivation]::Launch($Client.ApplicationId,"--remote-debugging-address=127.0.0.1 --remote-debugging-port=$Port")
}
