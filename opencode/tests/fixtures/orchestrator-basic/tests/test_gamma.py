import unittest

from lib.gamma import gamma


class GammaTest(unittest.TestCase):
    def test_composes(self):
        self.assertEqual(gamma(4), 11)
