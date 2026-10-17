from pathlib import Path
import os
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/build'))
from common import write_json
from storage_guard import exclusive, no_links, owned_run, preflight, remove_tree, cache_budget, GiB

class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def make_run(self, name):
        p = self.root / 'builds' / name
        write_json(p / 'owner.json', {'tool': 'mahjong-android-build'})
        return p
    def test_space_reserves_expected_copies_and_growth(self):
        with self.assertRaisesRegex(ValueError, 'Insufficient'):
            preflight(self.root / 'builds', GiB, GiB, free_bytes=12 * GiB)
        self.assertEqual(preflight(self.root / 'builds', GiB, GiB, free_bytes=30 * GiB)['requiredBytes'], 16 * GiB)
    def test_pending_runs_bound_disk_growth(self):
        self.make_run('one'); self.make_run('two')
        with self.assertRaisesRegex(ValueError, 'Two pending'):
            preflight(self.root / 'builds', 1, free_bytes=100 * GiB)
    def test_cache_growth_has_a_gate(self):
        cache = self.root / 'cache'; cache.mkdir(); (cache / 'blob').write_bytes(b'1234')
        with self.assertRaises(ValueError): cache_budget(cache, limit=3)
        self.assertEqual(cache_budget(cache, limit=4)['bytes'], 4)
    def test_unknown_build_and_path_escape_refused(self):
        (self.root / 'builds/unknown').mkdir(parents=True)
        with self.assertRaises((ValueError, FileNotFoundError)):
            preflight(self.root / 'builds', 1, free_bytes=100 * GiB)
        for name in ('../outside', '.', 'C:/other', 'a/b'):
            with self.assertRaises(ValueError): owned_run(self.root / 'builds', name)
    def test_operations_cannot_overlap(self):
        with exclusive(self.root / '.lock'):
            with self.assertRaises(RuntimeError):
                with exclusive(self.root / '.lock'): pass
        with exclusive(self.root / '.lock'): pass
    def link(self, target, path):
        if os.name == 'nt':
            import _winapi
            _winapi.CreateJunction(str(target), str(path))
        else: path.symlink_to(target, target_is_directory=True)
    def test_dependency_link_removed_without_touching_dependency(self):
        target = self.root / 'dependencies'; target.mkdir(); (target / 'keep').write_text('data')
        stage = self.root / 'stage'; stage.mkdir(); (stage / 'file').write_text('generated')
        self.link(target, stage / 'node_modules')
        remove_tree(stage, target)
        self.assertEqual((target / 'keep').read_text(), 'data')
        self.assertFalse(stage.exists())
    def test_unexpected_link_aborts_before_any_file_deleted(self):
        target = self.root / 'outside'; target.mkdir()
        stage = self.root / 'stage'; stage.mkdir(); (stage / 'keep').write_text('data')
        self.link(target, stage / 'unexpected')
        with self.assertRaises(ValueError): remove_tree(stage)
        self.assertTrue((stage / 'keep').exists())
        with self.assertRaises(ValueError): no_links(stage / 'unexpected' / 'nested')

if __name__ == '__main__': unittest.main()
