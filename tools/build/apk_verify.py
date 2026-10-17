"""Fail-closed APK checks, usable independently of the build orchestrator."""
from pathlib import Path
import argparse
import hashlib
import re
import shutil
import struct
import tempfile
import zipfile
from common import read_json, write_json, run, sha

REQUIRED_CLASSES = ['Lcom/getcapacitor/BridgeActivity;', 'Lcom/getcapacitor/Bridge;',
    'Lcom/mahjongwushuang/table/MainActivity;', 'Lcom/mahjongwushuang/table/LanRoomPlugin;',
    'Lcom/mahjongwushuang/table/SkillNfcPlugin;', 'Lcom/mahjongwushuang/table/VirtualTableDisplayPlugin;']


def structure(apk, max_gap=0):
    """Account for headers, compressed data, descriptors, signing block and CD.

    ZIP64/multidisk/encrypted archives are deliberately unsupported. Alignment
    bytes inside local extra fields and the APK signing block are accounted for,
    not counted as dead payload. zipalign separately checks actual alignment.
    """
    with Path(apk).open('rb') as f:
        f.seek(0, 2); size = f.tell()
        tail_start = max(0, size - 65557)
        f.seek(tail_start); tail = f.read()
        index = tail.rfind(b'PK\x05\x06')
        if index < 0 or len(tail) - index < 22: raise ValueError('Missing EOCD')
        eocd = tail_start + index
        _, disk, cd_disk, disk_count, count, cd_size, cd_start, comment = struct.unpack_from('<4s4H2IH', tail, index)
        if eocd + 22 + comment != size: raise ValueError('Trailing data / truncated EOCD')
        if disk or cd_disk or disk_count != count: raise ValueError('Multidisk ZIP unsupported')
        if count == 65535 or cd_size == 0xffffffff or cd_start == 0xffffffff: raise ValueError('ZIP64 unsupported')
        if cd_start + cd_size != eocd: raise ValueError('Central directory boundary mismatch')
        sig_start, sig_bytes = cd_start, 0
        if cd_start >= 24:
            f.seek(cd_start - 24); footer = f.read(24)
            if footer[8:] == b'APK Sig Block 42':
                sig_bytes = struct.unpack_from('<Q', footer)[0] + 8
                sig_start = cd_start - sig_bytes
                if sig_bytes < 32 or sig_start < 0: raise ValueError('Invalid APK signing block size')
                f.seek(sig_start)
                if struct.unpack('<Q', f.read(8))[0] != sig_bytes - 8: raise ValueError('Signing block sizes disagree')
                pos = sig_start + 8
                while pos < cd_start - 24:
                    f.seek(pos); length = struct.unpack('<Q', f.read(8))[0]
                    if length < 4 or pos + 8 + length > cd_start - 24: raise ValueError('Invalid signing block pair')
                    pos += 8 + length
                if pos != cd_start - 24: raise ValueError('Signing block boundary mismatch')
        # Independently bound every central record (ZipFile alone accepts some gaps).
        pos = cd_start
        for _ in range(count):
            f.seek(pos); header = f.read(46)
            if len(header) != 46 or header[:4] != b'PK\x01\x02': raise ValueError('Invalid central record')
            name_len, extra_len, comment_len = struct.unpack_from('<3H', header, 28)
            pos += 46 + name_len + extra_len + comment_len
        if pos != eocd: raise ValueError('Unaccounted central directory bytes')
        intervals=[]
        with zipfile.ZipFile(apk, metadata_encoding='utf8') as z:
            entries=z.infolist()
            if len(entries) != count: raise ValueError('Central entry count mismatch')
            names=[i.filename for i in entries]
            if len(set(names)) != len(names) or len({n.casefold() for n in names}) != len(names):
                raise ValueError('Duplicate/case-colliding ZIP paths')
            for i in entries:
                if i.filename.startswith('/') or '\\' in i.filename or ':' in i.filename or '..' in i.filename.split('/'):
                    raise ValueError('Unsafe ZIP path')
                if i.flag_bits & 1 or i.compress_type not in (0, 8): raise ValueError('Unsupported ZIP encryption/compression')
                start=i.header_offset; f.seek(start); h=f.read(30)
                if len(h)!=30 or h[:4]!=b'PK\x03\x04': raise ValueError('Invalid local file header')
                flags, method=struct.unpack_from('<2H',h,6)
                crc, compressed, expanded=struct.unpack_from('<3I',h,14)
                nl, el=struct.unpack_from('<2H',h,26)
                if flags!=i.flag_bits or method!=i.compress_type: raise ValueError('Local/central flags disagree')
                name=f.read(nl).decode('utf8'); extra=f.read(el)
                if name!=i.filename: raise ValueError('Local/central path mismatch')
                ep=0
                while ep < len(extra):
                    # zipalign may pad local extra data with zero bytes.
                    if not any(extra[ep:]): break
                    if ep+4>len(extra): raise ValueError('Truncated local extra field')
                    tag, length=struct.unpack_from('<2H',extra,ep)
                    if tag==1: raise ValueError('ZIP64 extra unsupported')
                    ep+=4+length
                    if ep>len(extra): raise ValueError('Truncated local extra payload')
                end=start+30+nl+el+i.compress_size
                if flags & 8:
                    f.seek(end); dd=f.read(16)
                    expected=(i.CRC,i.compress_size,i.file_size)
                    if len(dd)>=16 and dd[:4]==b'PK\x07\x08' and struct.unpack_from('<3I',dd,4)==expected: end+=16
                    elif len(dd)>=12 and struct.unpack_from('<3I',dd)==expected: end+=12
                    else: raise ValueError('Invalid data descriptor')
                elif (crc,compressed,expanded)!=(i.CRC,i.compress_size,i.file_size):
                    raise ValueError('Local/central sizes or CRC disagree')
                if start<0 or end>sig_start: raise ValueError('ZIP entry overlaps signing block/directory')
                intervals.append((start,end,i.filename))
        cursor=0; gaps=[]
        for start,end,name in sorted(intervals):
            if start<cursor: raise ValueError(f'Overlapping local entries: {name}')
            if start>cursor: gaps.append({'start':cursor,'bytes':start-cursor})
            cursor=end
        if cursor<sig_start: gaps.append({'start':cursor,'bytes':sig_start-cursor})
        gap_bytes=sum(g['bytes'] for g in gaps)
        if gap_bytes>max_gap: raise ValueError(f'Unaccounted ZIP regions: {gap_bytes} bytes (budget {max_gap}), {gaps[:8]}')
        return {'entries':count,'signingBlockBytes':sig_bytes,'unaccountedBytes':gap_bytes,'gaps':gaps,'centralDirectoryBytes':cd_size}


def web_assets(apk, expected):
    with zipfile.ZipFile(apk,metadata_encoding='utf8') as z:
        actual={}
        for i in z.infolist():
            if i.filename.startswith('assets/public/') and not i.is_dir():
                b=z.read(i)
                actual[i.filename[len('assets/public/'):]]={'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}
        if actual != expected:
            raise ValueError('APK web resource mismatch: missing=%s extra=%s changed=%s' % (
                sorted(expected.keys()-actual.keys()),sorted(actual.keys()-expected.keys()),
                sorted(k for k in actual.keys()&expected.keys() if actual[k]!=expected[k])))
        if 'index.html' not in actual: raise ValueError('Missing web entry point')
        return {'files':len(actual),'bytes':sum(v['bytes'] for v in actual.values())}


def size_report(apk, policy):
    size=Path(apk).stat().st_size
    if size>policy['maxApkBytes']: raise ValueError(f'APK size {size} exceeds absolute budget {policy["maxApkBytes"]}')
    baseline=policy.get('baselineBytes')
    if baseline and size>baseline*(1+policy['maxGrowthRatio']): raise ValueError(f'APK growth exceeds budget: {size} vs {baseline}')
    groups={}
    with zipfile.ZipFile(apk,metadata_encoding='utf8') as z:
        for i in z.infolist():
            n=i.filename
            group='cinematics' if n.startswith('assets/public/cinematics/') else 'audio' if n.startswith('assets/public/audio/') else 'images' if Path(n).suffix in ('.png','.webp','.jpg','.svg','.avif') else 'web-code' if n.startswith('assets/public/') else 'native-and-metadata'
            row=groups.setdefault(group,{'files':0,'compressedBytes':0,'uncompressedBytes':0})
            row['files']+=1; row['compressedBytes']+=i.compress_size; row['uncompressedBytes']+=i.file_size
    return {'apkBytes':size,'baselineBytes':baseline,'deltaBytes':size-baseline if baseline else None,'groups':groups}


def verify(apk, config, expected, report_path, env=None):
    apk=Path(apk).resolve(strict=True); report_path=Path(report_path)
    logs=report_path.parent/'apk-check-logs'; logs.mkdir(parents=True,exist_ok=True)
    result={'schemaVersion':1,'passed':False,'apk':str(apk),'sha256':sha(apk),'checks':{}}
    native_scratch=tempfile.TemporaryDirectory(prefix='mw-apk-')
    try:
        # Several Windows SDK executables cannot open a Unicode absolute path.
        # Give them an ASCII basename in a private working directory; hash both
        # copies so this workaround cannot accidentally verify a different APK.
        native_apk=Path(native_scratch.name)/'artifact.apk'
        shutil.copy2(apk,native_apk)
        if sha(native_apk)!=result['sha256']: raise ValueError('APK changed while preparing native verification')
        bt=Path(config['buildTools'])
        def invoke(tool,args,name):
            suffix='.bat' if tool=='apksigner' else '.exe'
            executable=bt/(tool+suffix if __import__('os').name=='nt' else tool)
            return run([executable,*args],native_scratch.name,logs/name,env=env,timeout=180)
        signed,_=invoke('apksigner',['verify','--verbose','--print-certs','artifact.apk'],'signature')
        certs=re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-fA-F0-9]+)',signed,re.M)
        if [c.lower() for c in certs] != [config['certificateSha256'].lower()]: raise ValueError(f'Unexpected signing certificate(s): {certs}')
        result['checks']['signature']={'passed':True,'certificateSha256':certs[0]}
        invoke('zipalign',['-c','-P','16','4','artifact.apk'],'alignment')
        result['checks']['alignment']=True
        badging,_=invoke('aapt',['dump','badging','artifact.apk'],'package')
        match=re.search(r"package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'",badging)
        if not match: raise ValueError('aapt package metadata missing')
        actual=dict(zip(['applicationId','versionCode','versionName'],match.groups()))
        if actual!={k:str(config[k]) for k in actual}: raise ValueError(f'Package identity/version mismatch: {actual}')
        result['checks']['package']=actual
        result['checks']['structure']=structure(apk,config.get('maxUnaccountedBytes',0))
        result['checks']['resources']=web_assets(apk,expected)
        result['checks']['size']=size_report(apk,config)
        classes=set()
        with zipfile.ZipFile(apk,metadata_encoding='utf8') as z:
            for i in z.infolist():
                if re.fullmatch(r'classes\d*\.dex',i.filename):
                    dex=Path(native_scratch.name)/i.filename; dex.write_bytes(z.read(i))
                    output,_=invoke('dexdump',[i.filename],i.filename)
                    classes.update(re.findall(r"Class descriptor\s*:\s*'([^']+)'",output))
        missing=set(REQUIRED_CLASSES)-classes
        if missing: raise ValueError(f'Missing native classes: {sorted(missing)}')
        result['checks']['nativeClasses']={'count':len(classes),'required':REQUIRED_CLASSES}
        # CRC/decompression checks for native entries as well as web assets.
        with zipfile.ZipFile(apk,metadata_encoding='utf8') as z:
            if z.testzip(): raise ValueError('ZIP CRC check failed')
        if sha(apk)!=result['sha256']: raise ValueError('APK changed during verification')
        result['passed']=True
    except BaseException as error:
        result['error']=str(error)
        raise
    finally:
        write_json(report_path,result)
        native_scratch.cleanup()
    return result


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--apk',required=True);p.add_argument('--config',required=True)
    p.add_argument('--ledger',required=True);p.add_argument('--report',required=True)
    a=p.parse_args()
    verify(a.apk,read_json(a.config),read_json(a.ledger),a.report)
    print('APK verification passed (exit codes, identity, signature, alignment, structure, full resource hashes).')
