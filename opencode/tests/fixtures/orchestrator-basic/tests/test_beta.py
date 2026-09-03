import unittest

from lib.beta import beta


class BetaTest(unittest.TestCase):
    def test_adds_three(self):
        self.assertEqual(beta(4), 7)
