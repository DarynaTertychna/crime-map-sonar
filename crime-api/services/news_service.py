import json
from pathlib import Path
from datetime import datetime, timedelta
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

NEWS_CACHE_FILE = Path("data/news_cache.json")
NEWS_CACHE_HOURS = 48

CRIME_KEYWORDS = [
    "theft",
    "stolen",
    "robbery",
    "burglar",
    "burglary",
    "assault",
    "attack",
    "fraud",
    "scam",
    "murder",
    "crime",
    "garda",
    "arrest",
    "charged",
    "investigation",
    "drug",
    "drugs",
    "shooting",
    "court",
]

NEWS_SOURCES = [
    {
        "name": "Irish Independent Crime",
        "url": "https://www.independent.ie/irish-news/crime",
    },
    {
        "name": "Crime World Ireland",
        "url": "https://www.crimeworld.com/ireland/",
    },
]


def is_cache_fresh() -> bool:
    if not NEWS_CACHE_FILE.exists():
        return False

    age = datetime.utcnow() - datetime.utcfromtimestamp(NEWS_CACHE_FILE.stat().st_mtime)
    return age < timedelta(hours=NEWS_CACHE_HOURS)


def load_cached_news() -> list:
    if not NEWS_CACHE_FILE.exists():
        return []

    try:
        with open(NEWS_CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def save_cached_news(items: list) -> None:
    NEWS_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(NEWS_CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def looks_crime_related(text: str) -> bool:
    t = (text or "").lower()
    return any(word in t for word in CRIME_KEYWORDS)


def scrape_links_from_page(source_name: str, url: str) -> list:
    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    try:
        r = requests.get(url, headers=headers, timeout=12)
        r.raise_for_status()
    except Exception as e:
        print(f"[news] scrape failed for {url}: {e}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    results = []

    for a in soup.find_all("a", href=True):
        title = a.get_text(" ", strip=True)
        href = a["href"].strip()

        if not title or len(title) < 12:
            continue

        if href.startswith("/"):
            href = urljoin(url, href)

        if not href.startswith("http"):
            continue

        if looks_crime_related(title):
            results.append({
                "title": title,
                "link": href,
                "summary": "",
                "source": source_name,
                "published": None,
            })

    return dedupe_news(results)


def dedupe_news(items: list) -> list:
    seen = set()
    unique = []

    for item in items:
        key = (item.get("title", ""), item.get("link", ""))
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)

    return unique


def fetch_crime_news(force_refresh: bool = False, limit: int = 10) -> list:
    if not force_refresh and is_cache_fresh():
        cached = load_cached_news()
        if cached:
            return cached[:limit]

    all_items = []

    for source in NEWS_SOURCES:
        items = scrape_links_from_page(source["name"], source["url"])
        all_items.extend(items)

    unique = dedupe_news(all_items)[:limit]

    # something is here
    if unique:
        save_cached_news(unique)
        return unique

    #nothing
    cached = load_cached_news()
    return cached[:limit]