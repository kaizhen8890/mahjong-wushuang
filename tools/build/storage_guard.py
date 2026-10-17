"""Bound temporary builds; refuse unknown trees and never follow deletion links."""
from pathlib import Path
from contextlib import contextmanager
import os
import shutil
from common import read_json

GiB = 1024 ** 3
OWNER = 'mahjong-android-build'

@contextmanager
def exclusive(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink() or path.is_junction():
        raise ValueError('Lock cannot be a link')
    with path.open('a+b') as stream:
        if stream.tell() == 0:
            stream.write(b'0'); stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except (OSError, BlockingIOError) as exc:
            raise RuntimeError('Build/archive/cleanup is already running') from exc
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)

def no_links(path):
    path = Path(os.path.abspath(path))
    for part in (path, *path.parents):
        if part.is_symlink() or part.is_junction():
            raise ValueError(f'Linked control path: {part}')
    return path

def owned_run(build_root, name):
    root = no_links(build_root)
    if not name or name in ('.', '..') or Path(name).name != name or '/' in name or '\\' in name or ':' in name:
        raise ValueError('Expected a build directory name, not a path')
    run = no_links(root / name)
    if not run.is_dir() or run.parent != root:
        raise ValueError('Missing build directory')
    if read_json(run / 'owner.json').get('tool') != OWNER:
        raise ValueError('Unregistered directory; refusing cleanup')
    return run

def inventory(root):
    root = no_links(root)
    root.mkdir(parents=True, exist_ok=True)
    result = []
    for p in sorted(root.iterdir()):
        if p.name == '.build.lock' and p.is_file() and not p.is_symlink():
            continue
        run = owned_run(root, p.name)
        report = read_json(run / 'build-report.json') if (run / 'build-report.json').exists() else {}
        result.append({'id': p.name, 'passed': report.get('passed', False)})
    return result

def preflight(root, source_bytes, private_bytes=0, free_bytes=None):
    runs = inventory(root)
    if len(runs) >= 2:
        raise ValueError('Two pending builds already exist; archive or resolve them before building again')
    # Reserve free space after expected copies, package generation and Gradle output.
    required = max(10 * GiB, source_bytes * 5 + private_bytes * 3 + 8 * GiB)
    free = shutil.disk_usage(root).free if free_bytes is None else free_bytes
    if free < required:
        raise ValueError(f'Insufficient disk space: need {required}, available {free} bytes')
    return {'freeBytes': free, 'requiredBytes': required, 'pendingRuns': runs}

def cache_budget(root, limit=2 * GiB):
    root = no_links(root)
    root.mkdir(parents=True, exist_ok=True)
    total = 0
    for p in root.iterdir():
        no_links(p)
        if not p.is_file(): raise ValueError('Unexpected cache directory')
        total += p.stat().st_size
    if total > limit:
        raise ValueError('Cinematic cache exceeds 2 GiB; inspect and prune unused entries before building')
    return {'bytes': total, 'limitBytes': limit}

def deletion_plan(root, allowed_link=None):
    root = no_links(root)
    files, dirs, links = [], [], []
    def walk(folder):
        for p in folder.iterdir():
            if p.is_symlink() or p.is_junction():
                if allowed_link is None or p != root / 'node_modules' or p.resolve() != Path(allowed_link).resolve():
                    raise ValueError(f'Unexpected link; nothing deleted: {p}')
                links.append(p)
            elif p.is_dir():
                walk(p); dirs.append(p)
            elif p.is_file():
                files.append(p)
            else:
                raise ValueError(f'Unknown entry: {p}')
    walk(root)
    return files, dirs, links

def remove_tree(root, allowed_link=None):
    # Validate the entire tree before deleting anything. No shell or rmtree.
    root = no_links(root)
    files, dirs, links = deletion_plan(root, allowed_link)
    for p in links:
        if p.is_junction(): os.rmdir(p)
        else: p.unlink()
    for p in files:
        no_links(p)
        p.unlink()
    for p in dirs:
        no_links(p)
        p.rmdir()
    root.rmdir()
