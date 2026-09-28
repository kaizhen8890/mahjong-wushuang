param([Parameter(Mandatory=$true)][string]$Apk)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$sdk = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, (Join-Path $env:LOCALAPPDATA 'Android\Sdk')) |
    Where-Object { $_ -and (Test-Path (Join-Path $_ 'build-tools')) } | Select-Object -First 1
if (-not $sdk) { throw 'Android SDK Build Tools not found; set ANDROID_HOME' }
$buildTools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1 -ExpandProperty FullName
& (Join-Path $buildTools 'apksigner.bat') verify --verbose $Apk
if ($LASTEXITCODE) { throw 'APK signature verification failed' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path $Apk).Path)
$scratch = Join-Path $projectRoot ('.tmp\apk-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $scratch -Force | Out-Null
$classes = [Collections.Generic.HashSet[string]]::new()
try {
    foreach ($entry in $zip.Entries) {
        if ($entry.FullName -match '^classes\d*\.dex$') {
            $dex = Join-Path $scratch $entry.Name
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $dex)
            & (Join-Path $buildTools 'dexdump.exe') $dex | ForEach-Object {
                if ($_ -match "Class descriptor\s*:\s*'([^']+)'") { [void]$classes.Add($Matches[1]) }
            }
            if ($LASTEXITCODE) { throw 'DEX parsing failed' }
        }
    }
    foreach ($required in @('Lcom/getcapacitor/BridgeActivity;', 'Lcom/getcapacitor/Bridge;', 'Lcom/mahjongwushuang/table/MainActivity;', 'Lcom/mahjongwushuang/table/LanRoomPlugin;')) {
        if (-not $classes.Contains($required)) { throw "Missing required native class: $required" }
    }
    if (-not $zip.GetEntry('assets/public/index.html')) { throw 'Missing web entry point' }
    $manifest = Get-Content (Join-Path $projectRoot 'data\emotes.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($emote in $manifest) {
        if (-not $zip.GetEntry('assets/public' + $emote.src)) { throw "Missing emote: $($emote.src)" }
    }
    $music = Get-Content (Join-Path $projectRoot 'data\riichi-music.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    foreach ($track in $music) {
        if (-not $zip.GetEntry('assets/public' + $track.src)) { throw "Missing music: $($track.src)" }
    }
    if (-not $zip.GetEntry('assets/public/audio/riichi-cue.wav')) { throw 'Missing riichi cue' }
    foreach ($sound in @('win-reveal.mp3', 'win-thunder.mp3')) {
        if (-not $zip.GetEntry('assets/public/audio/' + $sound)) { throw "Missing win audio: $sound" }
    }
    Write-Output "Verified $($classes.Count) native class definitions, emotes and all riichi tracks."
} finally {
    $zip.Dispose()
    # Only delete files generated inside this check's unique directory.
    Get-ChildItem -LiteralPath $scratch -File | Remove-Item
    Remove-Item -LiteralPath $scratch
}
