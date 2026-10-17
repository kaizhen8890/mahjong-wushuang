param(
    [Parameter(Mandatory=$true)][string]$Apk,
    [Parameter(Mandatory=$true)][string]$Config,
    [Parameter(Mandatory=$true)][string]$Ledger,
    [Parameter(Mandatory=$true)][string]$Report
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot 'android-verify.mjs') --apk $Apk --config $Config --ledger $Ledger --report $Report
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
