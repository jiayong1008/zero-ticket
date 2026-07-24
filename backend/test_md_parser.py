import os
import unittest
from app.parser.code_parser import MarkdownParser, CodeParser

class TestMarkdownParser(unittest.TestCase):

    def test_markdown_heading_parsing(self):
        sample_md = """# Admin Manual

Welcome to the admin manual.

## Audio Question Setup

Audio question format is specifically enabled for Memory competition categories.
Follow these steps:
1. Ensure category contains 'Memory'.
2. Add Question -> Select Audio.

### Supported Audio Formats

MP3 and WAV formats are supported.

## Common FAQ

Q: Why can't I see the audio option?
A: Ensure category contains Memory.
"""
        chunks = MarkdownParser.parse(sample_md, "docs/ADMIN_MANUAL.md")
        self.assertGreater(len(chunks), 0)
        
        # Check headings (H1 and H2)
        chunk_names = [c['name'] for c in chunks]
        self.assertIn("doc::Admin Manual", chunk_names)
        self.assertIn("doc::Audio Question Setup", chunk_names)
        self.assertIn("doc::Common FAQ", chunk_names)
        
        # Verify H3 sub-heading is included within H2 section
        audio_setup_chunk = next(c for c in chunks if c['name'] == 'doc::Audio Question Setup')
        self.assertIn("Supported Audio Formats", audio_setup_chunk['content'])
        
        # Verify chunk types
        for c in chunks:
            self.assertEqual(c['chunk_type'], 'documentation')
            self.assertEqual(c['file_path'], 'docs/ADMIN_MANUAL.md')

    def test_plain_text_fallback(self):
        plain_text = "Line 1: Plain text document.\n" * 100
        chunks = MarkdownParser.parse(plain_text, "docs/plain.txt")
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertEqual(c['chunk_type'], 'documentation')

if __name__ == "__main__":
    unittest.main()
