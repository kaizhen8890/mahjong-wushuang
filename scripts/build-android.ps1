$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$node = (Get-Command node.exe -ErrorAction Stop).Source

Push-Location $projectRoot
try {
    & $pnpm exec tsc --noEmit
    if ($LASTEXITCODE) { throw 'Type check failed' }
    & $pnpm build
    if ($LASTEXITCODE) { throw 'Web build failed' }
    & $node scripts/build-offline-manifest.mjs
    if ($LASTEXITCODE) { throw 'Offline manifest failed' }
    & $pnpm android:sync
    if ($LASTEXITCODE) { throw 'Android sync failed' }
    Push-Location android
    try {
        & .\gradlew.bat :app:assembleDebug --no-daemon --console=plain
        if ($LASTEXITCODE) { throw 'Android compilation failed' }
    } finally { Pop-Location }
    & (Join-Path $PSScriptRoot 'verify-apk.ps1') -Apk (Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk')
} finally { Pop-Location }
