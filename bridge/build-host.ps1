. (Join-Path $PSScriptRoot 'common.ps1')
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework compiler not found.' }
if (@(Get-Process -Name 'bridge-host' -ErrorAction SilentlyContinue | Where-Object Path -eq $GuiHost).Count) {
    throw 'Disable this bridge before rebuilding its host.'
}
New-Item -ItemType Directory -Path $RuntimeRoot -Force | Out-Null
& $compiler /nologo /target:winexe /optimize+ /utf8output '/reference:System.Web.Extensions.dll' '/reference:System.Windows.Forms.dll' ('/out:'+$GuiHost) (Join-Path $BridgeRoot 'BridgeHost.cs')
if ($LASTEXITCODE -ne 0) { throw 'Windowless host compilation failed.' }
