import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "fetch_news.py"
SPEC = importlib.util.spec_from_file_location("fetch_news", MODULE_PATH)
fetch_news = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(fetch_news)


RSS = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>A &amp; B</title>
    <link>https://example.com/post?utm_source=test</link>
    <description><![CDATA[<p>Summary text.</p>]]></description>
    <pubDate>Sun, 14 Sep 2026 08:00:00 +0800</pubDate>
  </item>
</channel></rss>
"""


class FeedParsingTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            "id": "example",
            "name": "Example",
            "feedUrl": "https://example.com/feed",
            "siteUrl": "https://example.com/",
        }

    def test_parse_and_clean_rss(self):
        records = fetch_news.parse_feed(RSS, self.source, "2026-09-14T01:00:00Z")
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]["title"], "A & B")
        self.assertEqual(records[0]["summary"], "Summary text.")
        self.assertEqual(records[0]["originalUrl"], "https://example.com/post")
        self.assertEqual(records[0]["publishedAt"], "2026-09-14T00:00:00Z")

    def test_same_input_has_stable_id(self):
        first = fetch_news.parse_feed(RSS, self.source, "2026-09-14T01:00:00Z")[0]
        second = fetch_news.parse_feed(RSS, self.source, "2026-09-15T01:00:00Z")[0]
        self.assertEqual(first["id"], second["id"])


if __name__ == "__main__":
    unittest.main()

