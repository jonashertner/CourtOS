"""Offline unit checks; real glyph/static-instance checks run in the helper."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import prepare_fonts as fonts


class FontPreparationTests(unittest.TestCase):
    def record(self):
        return {'file':'official.woff2','bytes':4,'sha256':hashlib.sha256(b'font').hexdigest(),
                'url':'https://www.timeless.co/font.woff2'}

    def test_changed_official_file_fails_hash_check(self):
        self.assertEqual(fonts.verify(b'font',self.record()),b'font')
        for data in [b'evil',b'font-long']:
            with self.assertRaises(ValueError):fonts.verify(data,self.record())

    def test_explicit_directory_avoids_network_and_still_verifies(self):
        with tempfile.TemporaryDirectory() as directory, patch('urllib.request.urlopen') as network:
            root=Path(directory);(root/'official.woff2').write_bytes(b'font')
            self.assertEqual(fonts.source_bytes(self.record(),root,root/'cache'),b'font')
            (root/'official.woff2').write_bytes(b'evil')
            with self.assertRaises(ValueError):fonts.source_bytes(self.record(),root,root/'cache')
            network.assert_not_called()

    def test_nonofficial_download_rejected_before_network(self):
        record=self.record();record['url']='https://example.com/font.woff2'
        with tempfile.TemporaryDirectory() as directory,patch('urllib.request.urlopen') as network:
            with self.assertRaises(ValueError):fonts.source_bytes(record,None,Path(directory))
            network.assert_not_called()

    def test_only_technical_embedding_weights_are_produced(self):
        self.assertEqual({name for _,instances in fonts.PINNED.values() for name,_ in instances},
                         {'Serif.ttf','SerifBold.ttf','Sans.ttf','SansBold.ttf'})
        self.assertEqual({weight for _,instances in fonts.PINNED.values() for _,weight in instances},{400,600})
        self.assertEqual(fonts.CACHE,fonts.HERE/'.font-cache')

    def test_missing_local_licence_requires_explicit_official_fetcher(self):
        with tempfile.TemporaryDirectory() as directory,patch.object(fonts,'LICENSE_SOURCE',Path(directory)/'missing-license.txt'):
            with self.assertRaisesRegex(SystemExit,'fetch-timeless-fonts.py --accept-license'):
                fonts.prepare()

if __name__=='__main__':unittest.main()
