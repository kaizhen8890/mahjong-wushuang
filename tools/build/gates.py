"""Content-based dependency gates; no timestamps or remembered success flags."""
from pathlib import Path
from urllib.parse import unquote
from common import ledger, read_json, sha, under

# The web compiler emits these two build metadata files. Android's explicit
# ignoreAssetsPattern excludes them; no other hidden file is silently allowed.
BUILD_METADATA={'.assetsignore','.vite/manifest.json'}


def package_ledger(full):
    unexpected=[p for p in full if any(part.startswith('.') for part in p.split('/')) and p not in BUILD_METADATA]
    if unexpected: raise ValueError(f'Unexpected hidden build assets: {unexpected}')
    return {k:v for k,v in full.items() if k not in BUILD_METADATA}


def media_report(root, source, report_path, profile, encoder):
    report=read_json(report_path)
    if report['profile']!=profile or report['encoder']!=encoder: raise ValueError('Stale cinematic optimizer/encoder report')
    active={p.relative_to(root).as_posix() for p in (Path(root)/'cinematics').rglob('*.mp4')}
    rows=report['files']
    if len(rows)!=len({r['file'] for r in rows}) or {r['file'] for r in rows}!=active:
        raise ValueError('Cinematic report does not cover the current active set exactly')
    for r in rows:
        target=under(root,r['file']); master=under(source,r['file'])
        if sha(target)!=r['packageSha256'] or sha(master)!=r['sourceSha256']:
            raise ValueError(f'Stale cinematic bytes: {r["file"]}')
        if target.stat().st_size!=r['packageBytes'] or master.stat().st_size!=r['sourceBytes']:
            raise ValueError('Cinematic size report mismatch')
        if r['ssim']<.92 or r['fps']<29.5: raise ValueError('Cinematic quality gate failed')
    return {'files':len(rows),'reportSha256':sha(report_path)}


def manifest(root):
    current=ledger(root)
    data=read_json(Path(root)/'precache-manifest.json')
    assets=data['assets']
    if not all(isinstance(p,str) and p.startswith('/') for p in assets): raise ValueError('Invalid precache paths')
    paths=[unquote(p[1:]) for p in assets]
    if len(paths)!=len(set(paths)): raise ValueError('Duplicate precache paths')
    if set(paths)!=set(package_ledger(current))-{'precache-manifest.json'}: raise ValueError('Precache set differs from final web files')
    return current


def sync_assets(web_ledger, native_root):
    native=ledger(native_root)
    extra=set(native)-set(web_ledger)
    if extra!={'cordova.js','cordova_plugins.js'}: raise ValueError(f'Unexpected Capacitor generated file set: {sorted(extra)}')
    if any(native.get(k)!=v for k,v in web_ledger.items()): raise ValueError('Capacitor sync changed or lost web assets')
    # This project has no Cordova plugins. Both are generated empty placeholders.
    if any(native[k]['bytes']!=0 for k in extra): raise ValueError('Unexpected Cordova code; update the explicit project contract')
    return native
