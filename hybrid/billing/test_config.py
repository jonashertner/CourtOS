"""No network: activation typo must not enable the legacy free-provider path."""
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

from billing.config import boolean_env
from billing.runtime import BillingConfig


class BillingConfigTests(unittest.TestCase):
    def test_closed_defaults_and_explicit_false_only_optout(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(BillingConfig.from_env().required)
            self.assertFalse(BillingConfig.from_env().enabled)
        for value, expected in (("TRUE", True), (" true ", True), ("FALSE", False), ("false", False)):
            with self.subTest(value=value), patch.dict(os.environ, {"BILLING_REQUIRED": value}, clear=True):
                self.assertEqual(BillingConfig.from_env().required, expected)

    def test_all_activation_flags_reject_unknown_values_without_echo(self):
        for flag in ("BILLING_REQUIRED", "BILLING_ENABLED", "STRIPE_LIVE_MODE", "STRIPE_TAX_REVIEWED"):
            for value in ("", "yes", "0", "flase", "synthetic-private-value"):
                with self.subTest(flag=flag, value=value), patch.dict(os.environ, {flag: value}, clear=True):
                    with self.assertRaises(ValueError) as error:
                        BillingConfig.from_env()
                    self.assertEqual(str(error.exception), f"{flag} must be true or false")

    def test_backend_import_has_the_same_closed_config_boundary(self):
        # Settings defaults are evaluated at module import in the real service.
        # A fresh process exercises that boundary without reloading test globals.
        for value, success, required in (("TRUE", True, True), ("false", True, False), ("flase", False, None)):
            env = dict(os.environ, BILLING_REQUIRED=value, BILLING_ENABLED="false")
            result = subprocess.run([sys.executable, "-c", f"import backend; assert backend.Settings().billing_required is {required}"],
                cwd=Path(__file__).resolve().parents[1], env=env, capture_output=True, text=True)
            with self.subTest(value=value):
                self.assertEqual(result.returncode == 0, success)
                if not success:
                    self.assertIn("BILLING_REQUIRED must be true or false", result.stderr)
                    self.assertNotIn(value, result.stderr)


if __name__ == "__main__":
    unittest.main()
