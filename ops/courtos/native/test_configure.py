"""Pure renderer checks: no host installation, network, database or real secrets."""
import contextlib
import io
import json
import pathlib
import tempfile
import unittest

from configure import HERE, render, validate


def operator():
    config = json.loads((HERE / 'operator.example.json').read_text())
    config.update(access_issuer='https://synthetic.cloudflareaccess.com',
                  access_audience='synthetic-audience-for-test',
                  allowed_emails=['person@example.org'])
    return config


class RendererTests(unittest.TestCase):
    def test_secret_scope_and_local_service_boundaries(self):
        with tempfile.TemporaryDirectory() as root:
            out = pathlib.Path(root) / 'rendered'
            with contextlib.redirect_stdout(io.StringIO()):
                render(operator(), out)
            self.assertEqual(out.stat().st_mode & 0o777, 0o700)
            self.assertEqual((out / 'private/backend.env').stat().st_mode & 0o777, 0o600)
            self.assertEqual((out / 'shared/packet-hmac').stat().st_mode & 0o777, 0o640)
            secrets = json.loads((out / 'private/secrets.json').read_text())
            self.assertEqual(len(set(secrets.values())), 4)
            public = ''.join(p.read_text() for sub in ('public', 'units') for p in (out / sub).iterdir())
            for value in secrets.values():
                self.assertNotIn(value, public)
            for name in ('backend', 'frontend', 'hybrid', 'model', 'proxy'):
                unit = (out / f'units/courtos-pilot-{name}.service').read_text()
                self.assertIn('IPAddressDeny=any\nIPAddressAllow=localhost', unit)
                self.assertNotIn('gateway-provider.env', unit)
            gateway = (out / 'units/courtos-pilot-gateway.service').read_text()
            self.assertIn('gateway-provider.env', gateway)
            self.assertIn('/hybrid/data/demo.json', gateway)
            self.assertNotIn('IPAddressDeny=any', gateway)
            self.assertIn('EXTERNAL_ENABLED=false', (out / 'private/hybrid.env').read_text())
            self.assertIn('listen 127.0.0.1:18189;', public)
            self.assertNotIn('listen 0.0.0.0:', public)
            with self.assertRaises(FileExistsError):
                render(operator(), out)

    def test_self_registration_requires_explicit_matching_settings(self):
        closed = operator()
        closed.pop('self_registration')
        self.assertFalse(validate(closed)['self_registration'])
        closed['allowed_emails'] = []
        with self.assertRaises(ValueError):
            validate(closed)
        opened = operator()
        opened.update(self_registration=True, hybrid_self_registration=True,
                      allowed_emails=[], denied_emails=['revoked@example.org'])
        with tempfile.TemporaryDirectory() as root:
            out = pathlib.Path(root) / 'rendered'
            with contextlib.redirect_stdout(io.StringIO()):
                render(opened, out)
            self.assertIn('COURTOS_ACCESS_SELF_REGISTRATION=true', (out / 'private/backend.env').read_text())
            self.assertIn('COURTOS_ACCESS_DENY_EMAILS=revoked@example.org', (out / 'private/backend.env').read_text())
            self.assertIn('NEXT_PUBLIC_COURTOS_ACCESS_SELF_REGISTRATION=true', (out / 'private/frontend.env').read_text())
            self.assertIn('OCL_ACCESS_SELF_REGISTRATION=true', (out / 'private/hybrid.env').read_text())

    def test_unsafe_or_placeholder_configuration_fails(self):
        cases = [
            ('origin', 'http://courtos.example.org'),
            ('origin', 'https://courtos.example.org/path'),
            ('access_audience', 'audience\nINJECT=value'),
            ('state_dir', '/srv/courtos/release/private'),
            ('config_dir', '/etc/../private'),
            ('config_dir', '/var/lib/courtos-pilot/private'),
            ('self_registration', 'true'),
            ('allowed_emails', ['replace-with-person@example.org']),
            ('denied_emails', ['bad\nEMAIL=value']),
        ]
        for key, value in cases:
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                config = operator()
                config[key] = value
                validate(config)
        with self.assertRaises(ValueError):
            validate(json.loads((HERE / 'operator.example.json').read_text()))


if __name__ == '__main__':
    unittest.main()
