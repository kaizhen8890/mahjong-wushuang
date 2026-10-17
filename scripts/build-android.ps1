param(
    [Parameter(Mandatory=$true)][string]$Config,
    [ValidateSet('public','private')][string]$Profile = 'public'
)
$ErrorActionPreference = 'Stop'
$node = (Get-Command node -ErrorAction Stop).Source
# Do not redirect native stderr into PowerShell's error stream. The Python
# runner owns separate logs and real exit codes in both PS 5.1 and PS 7.
& $node (Join-Path $PSScriptRoot 'android-build.mjs') --config $Config --profile $Profile
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
