#!/usr/bin/env python3
"""Fetch configured RSS/Atom feeds and write normalized news data."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT / "data" / "news.json"
DEFAULT_STATUS = ROOT / "data" / "update-status.json"
DEFAULT_FIXTURES = ROOT / "fixtures"
MAX_ITEMS_PER_SOURCE = 100
MAX_ITEMS_TOTAL = 300

SOURCES = (
    {
        "id": "qbitai",
        "name": "量子位",
        "feedUrl": "https://www.qbitai.com/feed",
        "siteUrl": "https://www.qbitai.com/",
    },
    {
        "id": "techcrunch-ai",
        "name": "TechCrunch AI",
        "feedUrl": "https://techcrunch.com/category/artificial-intelligence/feed/",
        "siteUrl": "https://techcrunch.com/category/artificial-intelligence/",
    },
    {
        "id": "openai-blog",
        "name": "OpenAI 官方博客",
        "feedUrl": "https://openai.com/blog/rss.xml",
        "siteUrl": "https://openai.com/blog/",
    },
)

USER_AGENT = "DailyAIBrief/0.1 (+RSS reader candidate project)"
HTML_TAG_RE = re.compile(r"<[^>]+>")
WHITESPACE_RE = re.compile(r"\s+")


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def children(element: ET.Element, *names: str) -> list[ET.Element]:
    wanted = {name.lower() for name in names}
    return [child for child in element if local_name(child.tag) in wanted]


def first_text(element: ET.Element, *names: str) -> str:
    for child in children(element, *names):
        value = "".join(child.itertext()).strip()
        if value:
            return value
    return ""


def first_link(element: ET.Element) -> str:
    for child in children(element, "link"):
        href = child.attrib.get("href", "").strip()
        rel = child.attrib.get("rel", "alternate")
        if href and rel in ("alternate", ""):
            return href
        text = "".join(child.itertext()).strip()
        if text:
            return text
    return first_text(element, "guid")


def clean_text(value: str, limit: int = 280) -> str:
    value = html.unescape(value or "")
    value = HTML_TAG_RE.sub(" ", value)
    value = WHITESPACE_RE.sub(" ", value).strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def normalize_url(value: str) -> str:
    if not value:
        return ""
    parsed = urllib.parse.urlsplit(value.strip())
    blocked = {"fbclid", "gclid", "mc_cid", "mc_eid"}
    query = [
        (key, item)
        for key, item in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
        if not key.lower().startswith("utm_") and key.lower() not in blocked
    ]
    path = parsed.path.rstrip("/") or "/"
    return urllib.parse.urlunsplit(
        (parsed.scheme.lower(), parsed.netloc.lower(), path, urllib.parse.urlencode(query), "")
    )


def parse_datetime(value: str) -> str | None:
    value = (value or "").strip()
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def stable_id(source_id: str, link: str, title: str) -> str:
    identity = normalize_url(link) or clean_text(title, 500).lower()
    digest = hashlib.sha256(f"{source_id}|{identity}".encode("utf-8")).hexdigest()
    return digest[:20]


def parse_feed(xml_bytes: bytes, source: dict[str, str], collected_at: str) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_bytes)
    entries = [node for node in root.iter() if local_name(node.tag) in ("item", "entry")]
    records: list[dict[str, Any]] = []

    for entry in entries:
        title = clean_text(first_text(entry, "title"), 220)
        link = normalize_url(first_link(entry))
        if not title or not link:
            continue

        raw_summary = first_text(entry, "description", "summary", "content", "encoded")
        raw_date = first_text(entry, "pubdate", "published", "updated", "date")
        records.append(
            {
                "id": stable_id(source["id"], link, title),
                "sourceId": source["id"],
                "sourceName": source["name"],
                "sourceUrl": source["siteUrl"],
                "title": title,
                "summary": clean_text(raw_summary),
                "originalUrl": link,
                "publishedAt": parse_datetime(raw_date),
                "collectedAt": collected_at,
                "contentAttribution": "source-feed",
            }
        )
    return records


def fetch(url: str, timeout: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/atom+xml, text/xml, application/xml"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def load_existing(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return payload if isinstance(payload, list) else payload.get("items", [])


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--status", type=Path, default=DEFAULT_STATUS)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--source", action="append", dest="source_ids")
    parser.add_argument("--save-fixtures", action="store_true")
    parser.add_argument(
        "--from-fixtures",
        action="store_true",
        help="Read saved XML fixtures instead of requesting the network",
    )
    parser.add_argument("--fixture-dir", type=Path, default=DEFAULT_FIXTURES)
    args = parser.parse_args()

    selected = [source for source in SOURCES if not args.source_ids or source["id"] in args.source_ids]
    if not selected:
        parser.error("No configured source matched --source")

    existing = load_existing(args.output)
    by_id = {record["id"]: record for record in existing}
    collected_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    statuses: list[dict[str, Any]] = []
    successful_sources = 0

    for source in selected:
        try:
            fixture_path = args.fixture_dir / f"{source['id']}.xml"
            xml_bytes = fixture_path.read_bytes() if args.from_fixtures else fetch(source["feedUrl"], args.timeout)
            if args.save_fixtures and not args.from_fixtures:
                args.fixture_dir.mkdir(parents=True, exist_ok=True)
                fixture_path.write_bytes(xml_bytes)
            parsed = parse_feed(xml_bytes, source, collected_at)
            if not parsed:
                raise ValueError("Feed contained no usable entries")
            parsed.sort(
                key=lambda item: item.get("publishedAt") or item.get("collectedAt") or "",
                reverse=True,
            )
            imported = parsed[:MAX_ITEMS_PER_SOURCE]
            before = len(by_id)
            by_id.update({record["id"]: record for record in imported})
            statuses.append(
                {
                    "sourceId": source["id"],
                    "sourceName": source["name"],
                    "state": "success",
                    "fetchedCount": len(parsed),
                    "importedCount": len(imported),
                    "newCount": len(by_id) - before,
                    "checkedAt": collected_at,
                }
            )
            successful_sources += 1
        except Exception as error:  # One source must not break the others.
            statuses.append(
                {
                    "sourceId": source["id"],
                    "sourceName": source["name"],
                    "state": "failed",
                    "error": f"{type(error).__name__}: {error}",
                    "checkedAt": collected_at,
                }
            )

    grouped: dict[str, list[dict[str, Any]]] = {}
    for record in by_id.values():
        grouped.setdefault(record["sourceId"], []).append(record)
    bounded = []
    for source_records in grouped.values():
        source_records.sort(
            key=lambda item: item.get("publishedAt") or item.get("collectedAt") or "",
            reverse=True,
        )
        bounded.extend(source_records[:MAX_ITEMS_PER_SOURCE])
    records = sorted(
        bounded,
        key=lambda item: item.get("publishedAt") or item.get("collectedAt") or "",
        reverse=True,
    )[:MAX_ITEMS_TOTAL]
    write_json(args.output, records)
    write_json(
        args.status,
        {
            "updatedAt": collected_at,
            "state": "success" if successful_sources == len(selected) else "partial" if successful_sources else "failed",
            "totalItems": len(records),
            "sources": statuses,
        },
    )

    print(json.dumps({"items": len(records), "sources": statuses}, ensure_ascii=False, indent=2))
    return 0 if successful_sources else 1


if __name__ == "__main__":
    sys.exit(main())
