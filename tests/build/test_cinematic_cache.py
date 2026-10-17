import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'tools/packaging/compress_cinematics.py'
LOAD = "import importlib.util; from pathlib import Path; s=importlib.util.spec_from_file_location('media'," + repr(str(SCRIPT)) + "); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); "


class CinematicCacheLockTests(unittest.TestCase):
    def test_two_builds_serialize_same_cache_entry(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            # Read/modify/write deliberately yields, so a missing lock loses updates.
            body = LOAD + "\nimport time\nroot=Path(" + repr(tmp) + ")\nfor i in range(12):\n with m.cache_lock(root/'entry.lock',timeout=10):\n  p=root/'count'; n=int(p.read_text()) if p.exists() else 0\n  time.sleep(.015)\n  p.write_text(str(n+1))\n"
            children = [subprocess.Popen([sys.executable, '-c', body], stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(2)]
            for child in children:
                out, err = child.communicate(timeout=20)
                self.assertEqual(child.returncode, 0, err.decode())
            self.assertEqual((root/'count').read_text(), '24')

    def test_timeout_and_process_death_release_lock(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            body = LOAD + "\nimport time\nroot=Path(" + repr(tmp) + ")\nwith m.cache_lock(root/'entry.lock'):\n (root/'ready').write_text('ready')\n time.sleep(30)\n"
            child = subprocess.Popen([sys.executable, '-c', body])
            try:
                deadline = time.monotonic() + 10
                while not (root/'ready').exists() and time.monotonic() < deadline:
                    time.sleep(.02)
                self.assertTrue((root/'ready').exists())
                spec = importlib.util.spec_from_file_location('media_test', SCRIPT)
                media = importlib.util.module_from_spec(spec); spec.loader.exec_module(media)
                with self.assertRaises(TimeoutError):
                    with media.cache_lock(root/'entry.lock', timeout=.2):
                        self.fail('Another process owns this cache entry')
                child.kill(); child.wait(timeout=10)
                with media.cache_lock(root/'entry.lock', timeout=1):
                    pass
            finally:
                if child.poll() is None:
                    child.kill(); child.wait(timeout=10)


if __name__ == '__main__':
    unittest.main()
