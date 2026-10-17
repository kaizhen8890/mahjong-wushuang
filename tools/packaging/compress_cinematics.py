"""Compress only generated Android web assets; public/ remains the render master.

FFmpeg with libx264 is required. Reusable cache entries are verified before reuse.
Frame count, dimensions, frame rate, duration and copied AAC payload are checked.
"""
import argparse
import concurrent.futures
import hashlib
import json
import re
import shutil
import subprocess
import os
import time
from contextlib import contextmanager
from pathlib import Path

PROFILE = {'version': 1, 'codec': 'libx264', 'preset': 'slow', 'crf': 25,
           'maxrate': '5000k', 'bufsize': '10000k', 'audio': 'copy', 'frameRate': 'preserve >= 30'}

@contextmanager
def cache_lock(path, timeout=7200):
    """OS-owned per-content lock; released even when a build process is killed.

    Keep the tiny lock file: deleting it could create two independent locks.
    """
    with path.open('a+b') as stream:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b'0'); stream.flush()
        deadline = time.monotonic() + timeout
        while True:
            stream.seek(0)
            try:
                if os.name == 'nt':
                    import msvcrt
                    msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except (BlockingIOError, PermissionError):
                if time.monotonic() >= deadline:
                    raise TimeoutError(f'Cinematic cache is busy: {path}')
                time.sleep(.1)
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)

def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def run(ffmpeg, args):
    result = subprocess.run([ffmpeg, '-hide_banner', *args], capture_output=True, check=True)
    return result.stdout, result.stderr.decode('utf-8', errors='replace')

def probe(ffmpeg, path):
    progress, info = run(ffmpeg, ['-nostats', '-progress', 'pipe:1', '-i', str(path), '-map', '0:v:0', '-f', 'null', '-'])
    line = next(line for line in info.splitlines() if 'Stream #0:0' in line and 'Video:' in line)
    dimensions = re.search(r'\b(\d{3,5})x(\d{3,5})\b', line)
    fps = float(re.search(r'([\d.]+) fps', line)[1])
    duration = re.search(r'Duration: (\d+):(\d+):([\d.]+)', info)
    audio, _ = run(ffmpeg, ['-v', 'error', '-i', str(path), '-map', '0:a:0', '-c:a', 'copy', '-f', 'adts', 'pipe:1'])
    return {'width': int(dimensions[1]), 'height': int(dimensions[2]), 'fps': fps,
            'frames': int(re.findall(rb'frame=(\d+)', progress)[-1]),
            'duration': int(duration[1]) * 3600 + int(duration[2]) * 60 + float(duration[3]),
            'aacSha256': hashlib.sha256(audio).hexdigest()}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='dist/client')
    parser.add_argument('--source', default='public')
    parser.add_argument('--ffmpeg', default='ffmpeg')
    parser.add_argument('--cache', default='.tmp/cinematic-cache')
    parser.add_argument('--report', default='.tmp/cinematic-compression.json')
    args = parser.parse_args()
    root, source, cache = (Path(value).resolve() for value in (args.root, args.source, args.cache))
    if root == source or root.is_relative_to(source) or source.is_relative_to(root):
        raise ValueError('Generated output and source masters must be separate directories')
    if not (root / 'index.html').exists():
        raise ValueError('Build the web output first')
    cache.mkdir(parents=True, exist_ok=True)
    version = run(args.ffmpeg, ['-version'])[0].decode().splitlines()[0]
    profile_key = json.dumps([PROFILE, version], sort_keys=True)
    paths = sorted((root / 'cinematics').rglob('*.mp4'))
    if not paths:
        raise ValueError('No packaged cinematics found')

    def encode_locked(target):
        relative = target.relative_to(root)
        master = source / relative
        if target.is_symlink() or master.is_symlink() or not target.resolve().is_relative_to(root):
            raise ValueError(f'Unexpected asset link: {relative}')
        source_sha = sha(master)
        key = hashlib.sha256((source_sha + profile_key).encode()).hexdigest()
        cached, metadata = cache / (key + '.mp4'), cache / (key + '.json')
        record = None
        if cached.exists() and metadata.exists():
            saved = json.loads(metadata.read_text(encoding='utf-8'))
            if saved['sourceSha256'] == source_sha and saved['packageSha256'] == sha(cached):
                record = saved
        if record is None:
            before = probe(args.ffmpeg, master)
            if before['fps'] < 29.5:
                raise ValueError(f'Source below 30 fps; needs explicit review: {relative}')
            temporary = cache / (key + '.encoding.mp4')
            run(args.ffmpeg, ['-y', '-v', 'error', '-i', str(master), '-map', '0:v:0', '-map', '0:a:0',
                '-c:v', 'libx264', '-preset', PROFILE['preset'], '-crf', str(PROFILE['crf']),
                '-maxrate', PROFILE['maxrate'], '-bufsize', PROFILE['bufsize'],
                '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', '-threads', '4',
                '-fps_mode', 'passthrough', '-c:a', 'copy', '-map_metadata', '0', '-movflags', '+faststart', str(temporary)])
            after = probe(args.ffmpeg, temporary)
            if before != after:
                raise ValueError(f'Media clock, geometry or soundtrack changed: {relative}: {before} != {after}')
            _, comparison = run(args.ffmpeg, ['-i', str(master), '-i', str(temporary), '-lavfi', '[0:v][1:v]ssim', '-an', '-f', 'null', '-'])
            ssim = float(re.findall(r'All:([0-9.]+)', comparison)[-1])
            if ssim < .92:
                raise ValueError(f'Quality needs review: {relative}: SSIM {ssim}')
            if temporary.stat().st_size >= master.stat().st_size:
                shutil.copy2(master, temporary)
                ssim = 1.0
            temporary.replace(cached)
            record = {'sourceSha256': source_sha, 'packageSha256': sha(cached), 'sourceBytes': master.stat().st_size,
                      'packageBytes': cached.stat().st_size, 'ssim': ssim, **after}
            metadata.write_text(json.dumps(record, indent=2), encoding='utf-8')
        # Only an exact source copy or our already verified cache output may be replaced.
        if sha(target) not in (source_sha, record['packageSha256']):
            raise ValueError(f'Unexpected generated file; rebuild instead of overwriting: {relative}')
        shutil.copy2(cached, target)
        if sha(target) != record['packageSha256'] or sha(master) != source_sha:
            raise ValueError(f'Copy or source integrity failure: {relative}')
        print(f'{relative.as_posix()}: {record["sourceBytes"]} -> {record["packageBytes"]} bytes, {record["fps"]} fps, SSIM {record["ssim"]}', flush=True)
        return {'file': relative.as_posix(), **record}

    def encode(target):
        source_sha = sha(source / target.relative_to(root))
        key = hashlib.sha256((source_sha + profile_key).encode()).hexdigest()
        with cache_lock(cache / (key + '.lock')):
            return encode_locked(target)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        records = list(pool.map(encode, paths))
    by_path = {item['file']: item for item in records}
    # Keep packaged manifests accurate, while source manifests retain original render hashes.
    for target in sorted((root / 'cinematics').rglob('manifest.json')):
        master = source / target.relative_to(root)
        data = json.loads(master.read_text(encoding='utf-8'))
        changed = False
        for asset in data.get('assets', []):
            key = (target.parent.relative_to(root) / asset['file']).as_posix()
            record = by_path.get(key)
            if record:
                asset.update(bytes=record['packageBytes'], sha256=record['packageSha256'],
                             sourceBytes=record['sourceBytes'], sourceSha256=record['sourceSha256'])
                changed = True
        if changed:
            data['androidCompression'] = PROFILE
            target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    result = {'profile': PROFILE, 'encoder': version, 'files': records,
              'originalBytes': sum(item['sourceBytes'] for item in records),
              'packageBytes': sum(item['packageBytes'] for item in records)}
    report = Path(args.report); report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(f'Verified {len(records)} cinematics; saved {result["originalBytes"] - result["packageBytes"]} bytes; masters unchanged.')

if __name__ == '__main__':
    main()
