"""Small, shared build primitives. Native stderr is a log, never an exit status."""
from pathlib import Path, PurePosixPath
import hashlib
import json
import os
import signal
import subprocess
import time


def sha(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write_json(path, value):
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    temp = p.with_name(p.name + '.writing')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    temp.replace(p)


def under(root, relative):
    """Resolve only portable relative file names; reject links, including junctions."""
    root = Path(root).resolve(strict=True)
    if not isinstance(relative, str) or not relative or '\\' in relative or ':' in relative:
        raise ValueError(f'Invalid relative path: {relative!r}')
    parts = PurePosixPath(relative).parts
    if relative.startswith('/') or any(p in ('', '.', '..') for p in relative.split('/')):
        raise ValueError(f'Unsafe relative path: {relative}')
    p = root
    for part in parts:
        p /= part
        if p.is_symlink() or p.is_junction():
            raise ValueError(f'Linked input is not allowed: {p}')
    if not p.resolve().is_relative_to(root):
        raise ValueError(f'Path escapes root: {p}')
    return p


def files(root):
    root = Path(root).resolve(strict=True)
    def walk(folder):
        for p in sorted(folder.iterdir()):
            if p.is_symlink() or p.is_junction():
                raise ValueError(f'Linked generated asset: {p}')
            if p.is_dir():
                yield from walk(p)
            elif p.is_file():
                yield p
    return list(walk(root))


def ledger(root):
    root = Path(root).resolve(strict=True)
    return {p.relative_to(root).as_posix(): {'bytes': p.stat().st_size, 'sha256': sha(p)} for p in files(root)}


def require_ledger(root, expected):
    actual = ledger(root)
    if actual != expected:
        missing = sorted(expected.keys() - actual.keys())
        extra = sorted(actual.keys() - expected.keys())
        changed = sorted(k for k in actual.keys() & expected.keys() if actual[k] != expected[k])
        raise ValueError(f'Asset ledger mismatch: missing={missing}, extra={extra}, changed={changed}')
    return actual


def native_command(argv):
    argv = [str(v) for v in argv]
    if os.name == 'nt' and Path(argv[0]).suffix.lower() in ('.bat', '.cmd'):
        # cmd.exe is used only for SDK/Gradle batch entry points. Quote every
        # argument; reject expansion/operators instead of attempting shell escaping.
        if any(any(c in arg for c in '%!^&|<>"\r\n') for arg in argv):
            raise ValueError('Batch command argument contains unsupported shell characters')
        return subprocess.list2cmdline([os.environ.get('COMSPEC', 'cmd.exe')]) + ' /d /s /c "' + ' '.join('"' + a + '"' for a in argv) + '"'
    return argv


def run(argv, cwd, log, *, env=None, timeout=900, expected=()):
    """Capture streams separately; record launch errors, timeout and real exit code.

    The per-step JSON is written even on failure. No caller infers success from
    log text. A failed process tree is stopped before control returns.
    """
    log = Path(log)
    log.parent.mkdir(parents=True, exist_ok=True)
    stdout, stderr = log.with_suffix('.stdout.log'), log.with_suffix('.stderr.log')
    report = {'command': [str(a) for a in argv], 'cwd': str(cwd), 'timeoutSeconds': timeout, 'passed': False}
    start = time.monotonic()
    proc = None
    try:
        with stdout.open('wb') as out, stderr.open('wb') as err:
            proc = subprocess.Popen(native_command(argv), cwd=cwd, env=env, stdout=out, stderr=err,
                                    start_new_session=os.name != 'nt',
                                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0)
            try:
                report['exitCode'] = proc.wait(timeout=timeout)
            except (subprocess.TimeoutExpired, KeyboardInterrupt):
                report['interruptedOrTimedOut'] = True
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(proc.pid), '/T', '/F'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    os.killpg(proc.pid, signal.SIGKILL)
                proc.wait()
                raise
        if report['exitCode'] != 0:
            raise RuntimeError(f'Native command exited {report["exitCode"]}; see {stderr} and {stdout}')
        for p in expected:
            if not Path(p).is_file():
                raise RuntimeError(f'Expected output missing: {p}')
        report['passed'] = True
    except BaseException as error:
        report['error'] = str(error) or type(error).__name__
        raise
    finally:
        report['seconds'] = round(time.monotonic() - start, 3)
        report['logs'] = {str(p.name): {'bytes': p.stat().st_size, 'sha256': sha(p)} for p in (stdout, stderr) if p.exists()}
        write_json(log.with_suffix('.json'), report)
    return stdout.read_text(encoding='utf8', errors='replace'), stderr.read_text(encoding='utf8', errors='replace')
