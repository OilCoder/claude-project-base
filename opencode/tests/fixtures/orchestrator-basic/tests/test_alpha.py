import unittest

from lib.alpha import alpha


class AlphaTest(unittest.TestCase):
    def test_doubles(self):
        self.assertEqual(alpha(4), 8)
