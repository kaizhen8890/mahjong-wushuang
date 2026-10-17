from pathlib import Path
import sys
import unittest
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'tools/build'))
from android_build import version_gate


class ValidationModeTests(unittest.TestCase):
    def test_delivery_still_requires_increment(self):
        with self.assertRaises(ValueError): version_gate(89, 89)
        version_gate(90, 89)

    def test_validation_reuses_code_but_rejects_older_source(self):
        version_gate(89, 89, True)
        with self.assertRaises(ValueError): version_gate(88, 89, True)


if __name__ == '__main__': unittest.main()
