"""Profile contracts for the existing formats; no gameplay data migration."""
from pathlib import Path
import argparse
import copy
from common import read_json, write_json, ledger, require_ledger, under, sha

MEDIA_FIELDS={'artwork','audioSrc','coverSrc','lyricsSrc','trackTitle','artist'}


def resolve_content(policy, bundle=None):
    result=copy.deepcopy(policy)
    if bundle is None: return result
    if bundle.get('schemaVersion')!=1 or bundle.get('profile')!='private' or bundle.get('emoteMode')!='replace':
        raise ValueError('Unsupported private bundle schema/profile/emote mode')
    result['emotes']=bundle['emotes']
    declared=bundle['files']
    if len({f['path'] for f in declared})!=len(declared): raise ValueError('Duplicate private file declarations')
    for f in declared:
        if not f['path'].startswith(('public/emotes/','public/audio/nfc/','public/skill-cards/')):
            raise ValueError(f'Private overlay cannot modify code: {f["path"]}')
        result['publicFiles'][f['path'][7:]]={k:f[k] for k in ('bytes','sha256')}
    used_codes=set()
    for override in bundle['nfcOverrides']:
        if override['code'] in used_codes: raise ValueError('Duplicate NFC override')
        used_codes.add(override['code'])
        matches=[c for c in result['registry']['cards'] if c['code']==override['code']]
        if len(matches)!=1: raise ValueError('NFC override target missing')
        card=matches[0]
        if (card['skillId'],card['action'])!=(override['skillId'],override['action']): raise ValueError('NFC identity drift')
        if not override['media'].keys()<=MEDIA_FIELDS: raise ValueError('NFC overlay can change media only')
        card.update(override['media'])
    keys={c['key'] for c in result['artManifest']['cards']}
    for card in bundle['artAdditions']:
        if card['key'] in keys: raise ValueError('Private art addition conflicts with existing key')
        keys.add(card['key']); result['artManifest']['cards'].append(card)
    # Only these generated JSON bytes may differ from the approved public tree.
    result['publicFiles'].pop('skill-cards/manifest.json')
    return result


def validate_bundle(bundle_path):
    bundle_path=Path(bundle_path).resolve(strict=True); bundle=read_json(bundle_path)
    root=bundle_path.parent/'files'
    expected={f['path']:{k:f[k] for k in ('bytes','sha256')} for f in bundle['files']}
    require_ledger(root,expected)
    return bundle


def check(root, profile, bundle_path=None):
    root=Path(root).resolve(strict=True)
    policy=read_json(root/'config/public-content.json')
    if profile not in ('public','private'): raise ValueError('Explicit public/private profile required')
    if profile=='public' and bundle_path: raise ValueError('Public build rejects private input')
    if profile=='private' and not bundle_path: raise ValueError('Private build requires declared content')
    bundle=validate_bundle(bundle_path) if bundle_path else None
    expected=resolve_content(policy,bundle)
    for name,key in [('data/emotes.json','emotes'),('data/nfc-card-registry.json','registry'),('public/skill-cards/manifest.json','artManifest')]:
        if read_json(root/name)!=expected[key]: raise ValueError(f'{profile} content contract mismatch: {name}')
    actual=ledger(root/'public')
    if profile=='private': actual.pop('skill-cards/manifest.json')
    validate_resolved(expected,actual,profile,read_json(root/'data/riichi-music.json'))
    return {'passed':True,'profile':profile,'emotes':len(expected['emotes']),'nfcIdentities':len(expected['registry']['cards']),
            'publicFiles':len(actual)+(profile=='private'),'numericLabelWarnings':[e['id'] for e in expected['emotes'] if e['label']==e['id']],
            'bundleSha256':sha(bundle_path) if bundle_path else None}


def validate_resolved(expected, actual, profile, tracks):
    """Shared semantic contract for disk builds and pre-write overlay previews."""
    if actual!=expected['publicFiles']:
        raise ValueError(f'{profile} public asset ownership/hash mismatch: missing={sorted(expected["publicFiles"].keys()-actual.keys())}, extra={sorted(actual.keys()-expected["publicFiles"].keys())}, changed={sorted(k for k in actual.keys()&expected["publicFiles"].keys() if actual[k]!=expected["publicFiles"][k])}')
    emotes=expected['emotes']; ids=[e['id'] for e in emotes]
    if profile=='public':
        if any(c.get(k) for c in expected['registry']['cards'] for k in ('audioSrc','coverSrc','lyricsSrc')):
            raise ValueError('Private NFC media cannot enter the public profile')
    # The approved profile catalog owns its files. Empty catalogs are valid;
    # undeclared or orphan emote assets must not silently enter either APK.
    emote_files={name for name in actual if name.startswith('emotes/')}
    referenced={e['src'].lstrip('/') for e in emotes}
    if emote_files!=referenced:
        raise ValueError(f'Emote catalog/file mismatch: orphan={sorted(emote_files-referenced)}, missing={sorted(referenced-emote_files)}')
    if len(ids)!=len(set(ids)) or any(not i.isdigit() for i in ids): raise ValueError('Builtin emote IDs must be unique stable numeric IDs')
    for e in emotes:
        if not e['label'] or not e['src'].startswith('/emotes/'): raise ValueError('Invalid emote name or path')
        require_reference(actual,e['src'])
    for c in expected['registry']['cards']:
        for key in ('artwork','audioSrc','coverSrc','lyricsSrc'):
            if c.get(key): require_reference(actual,c[key])
    for track in tracks:
        require_reference(actual,track['src'])
    for name in ('riichi-cue.wav','win-reveal.mp3','win-thunder.mp3'):
        require_reference(actual,'/audio/'+name)


def require_reference(actual, src):
    if not isinstance(src,str) or not src.startswith('/') or '\\' in src or ':' in src or any(p in ('','.','..') for p in src[1:].split('/')):
        raise ValueError(f'Invalid asset reference: {src}')
    if src[1:] not in actual: raise ValueError(f'Missing referenced asset: {src}')


def check_overlay(source, bundle, private_files):
    """Check a candidate private bundle without writing or copying a project."""
    source=Path(source)
    check(source,'public')
    declared={f['path']:{k:f[k] for k in ('bytes','sha256')} for f in bundle['files']}
    if declared!=private_files: raise ValueError('Private candidate file ledger mismatch')
    policy=read_json(source/'config/public-content.json')
    expected=resolve_content(policy,bundle)
    actual={**policy['publicFiles'],**{p[7:]:v for p,v in private_files.items()}}
    actual.pop('skill-cards/manifest.json',None)
    validate_resolved(expected,actual,'private',read_json(source/'data/riichi-music.json'))
    return {'passed':True,'emotes':len(bundle['emotes']),'privateFiles':len(private_files)}


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',default='.');p.add_argument('--profile',required=True,choices=['public','private'])
    p.add_argument('--bundle');p.add_argument('--report',required=True)
    a=p.parse_args()
    try:
        result=check(a.root,a.profile,a.bundle)
    except BaseException as error:
        write_json(a.report,{'passed':False,'error':str(error)});raise
    write_json(a.report,result);print(f'{a.profile} contract passed: {result["emotes"]} emotes, {result["nfcIdentities"]} NFC identities')
