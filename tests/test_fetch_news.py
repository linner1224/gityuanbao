import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


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

    def test_invalid_date_stays_unknown(self):
        invalid_date_rss = RSS.replace(
            b"Sun, 14 Sep 2026 08:00:00 +0800",
            b"not-a-real-date",
        )
        record = fetch_news.parse_feed(
            invalid_date_rss,
            self.source,
            "2026-09-14T01:00:00Z",
        )[0]
        self.assertIsNone(record["publishedAt"])


class UpdateFlowTests(unittest.TestCase):
    def run_main(self, *arguments: str) -> int:
        with mock.patch.object(sys, "argv", ["fetch_news.py", *arguments]):
            return fetch_news.main()

    def test_repeated_import_does_not_duplicate_records(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "news.json"
            status = Path(temp_dir) / "status.json"
            arguments = (
                "--output",
                str(output),
                "--status",
                str(status),
                "--source",
                "qbitai",
            )
            with mock.patch.object(fetch_news, "fetch", return_value=RSS):
                self.assertEqual(self.run_main(*arguments), 0)
                self.assertEqual(self.run_main(*arguments), 0)

            records = json.loads(output.read_text(encoding="utf-8"))
            last_status = json.loads(status.read_text(encoding="utf-8"))
            self.assertEqual(len(records), 1)
            self.assertEqual(last_status["sources"][0]["newCount"], 0)

    def test_one_source_failure_preserves_existing_data(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            output = Path(temp_dir) / "news.json"
            status = Path(temp_dir) / "status.json"
            preserved = {
                "id": "preserved-techcrunch-item",
                "sourceId": "techcrunch-ai",
                "sourceName": "TechCrunch AI",
                "sourceUrl": "https://techcrunch.com/category/artificial-intelligence/",
                "title": "Previously collected story",
                "summary": "Saved before the simulated outage.",
                "originalUrl": "https://techcrunch.com/example",
                "publishedAt": "2026-09-13T00:00:00Z",
                "collectedAt": "2026-09-13T01:00:00Z",
                "contentAttribution": "source-feed",
            }
            output.write_text(
                json.dumps([preserved], ensure_ascii=False),
                encoding="utf-8",
            )

            def simulated_fetch(url: str, _timeout: int) -> bytes:
                if "qbitai.com" in url:
                    return RSS
                raise TimeoutError("simulated source outage")

            with mock.patch.object(fetch_news, "fetch", side_effect=simulated_fetch):
                result = self.run_main(
                    "--output",
                    str(output),
                    "--status",
                    str(status),
                    "--source",
                    "qbitai",
                    "--source",
                    "techcrunch-ai",
                )

            records = json.loads(output.read_text(encoding="utf-8"))
            last_status = json.loads(status.read_text(encoding="utf-8"))
            self.assertEqual(result, 0)
            self.assertIn(preserved["id"], {record["id"] for record in records})
            self.assertEqual(last_status["state"], "partial")
            failed = [source for source in last_status["sources"] if source["state"] == "failed"]
            self.assertEqual(len(failed), 1)
            self.assertEqual(failed[0]["sourceId"], "techcrunch-ai")


if __name__ == "__main__":
    unittest.main()
