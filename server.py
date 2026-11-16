#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Kargah local server: serves the app and keeps live product prices up to date."""

import gzip
import http.server
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
DATA_FILE = os.path.join(DATA_DIR, 'prices.json')

PORT = int(os.environ.get('KARGAH_PORT', '8765'))
INTERVAL_HOURS = float(os.environ.get('KARGAH_INTERVAL_HOURS', '6'))
IRAN = timezone(timedelta(hours=3, minutes=30))

UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
)

STATE_LOCK = threading.Lock()
CHECK_LOCK = threading.Lock()


class PriceError(Exception):
    pass


# --------------------------------------------------------------------------
# storage
# --------------------------------------------------------------------------

def now_iso():
    return datetime.now(IRAN).isoformat(timespec='seconds')


def today_key():
    return datetime.now(IRAN).date().isoformat()


def new_id():
    return os.urandom(4).hex()


def load_state():
    try:
        with open(DATA_FILE, encoding='utf-8') as handle:
            data = json.load(handle)
    except Exception:
        data = {}

    if not isinstance(data, dict):
        data = {}
    data.setdefault('items', [])
    data.setdefault('meta', {})
    return data


def save_state(state):
    try:
        os.makedirs(DATA_DIR, exist_ok=True)
        tmp = DATA_FILE + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as handle:
            json.dump(state, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, DATA_FILE)
    except Exception as exc:  # keep running even if the disk is read-only
        print('save failed:', exc)


STATE = load_state()


# --------------------------------------------------------------------------
# fetching
# --------------------------------------------------------------------------

def http_get(url, timeout=25):
    request = urllib.request.Request(
        url,
        headers={
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
            'Accept-Language': 'fa-IR,fa;q=0.9,en;q=0.8',
            'Accept-Encoding': 'gzip',
            'Cache-Control': 'no-cache',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            if 'gzip' in (response.headers.get('Content-Encoding') or '').lower():
                raw = gzip.decompress(raw)
            charset = response.headers.get_content_charset() or 'utf-8'
    except urllib.error.HTTPError as exc:
        raise PriceError('سایت پاسخ %s داد' % exc.code)
    except urllib.error.URLError as exc:
        raise PriceError('اتصال به سایت برقرار نشد (%s)' % (exc.reason,))
    except Exception as exc:
        raise PriceError('خطا در خواندن صفحه (%s)' % (type(exc).__name__,))

    return raw.decode(charset, errors='replace')


def next_data(html_text):
    match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html_text, re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def to_int(value):
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        digits = re.sub(r'[^0-9]', '', value)
        return int(digits) if digits else 0
    return 0


def torob_product(html_text):
    data = next_data(html_text)
    if not data:
        raise PriceError('صفحهٔ ترب خوانده نشد')
    page = (data.get('props') or {}).get('pageProps') or {}
    product = page.get('baseProduct') or (page.get('products') or [None])[0]
    if not product:
        raise PriceError('محصول در صفحه پیدا نشد')

    price = to_int(product.get('min_price')) or to_int(product.get('price'))
    title = (product.get('name1') or product.get('name') or '').strip()
    shop = (product.get('shop_text') or '').strip()
    price_text = (product.get('price_text') or '').strip()

    if not title:
        raise PriceError('نام محصول پیدا نشد')

    return {
        'title': title,
        'price': price,
        'price_text': price_text,
        'shop': shop,
        'available': price > 0,
    }


def meta_price(html_text, keys):
    for key in keys:
        pattern = r'<meta[^>]+(?:property|name)=["\']%s["\'][^>]+content=["\']([^"\']+)["\']' % re.escape(key)
        match = re.search(pattern, html_text, re.I)
        if match:
            value = to_int(match.group(1))
            if value:
                return value
        pattern = r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']%s["\']' % re.escape(key)
        match = re.search(pattern, html_text, re.I)
        if match:
            value = to_int(match.group(1))
            if value:
                return value
    return 0


def json_ld_price(html_text):
    for block in re.findall(r'<script[^>]+application/ld\+json[^>]*>(.*?)</script>', html_text, re.S):
        try:
            payload = json.loads(block.strip())
        except Exception:
            continue

        stack = [payload]
        while stack:
            node = stack.pop()
            if isinstance(node, dict):
                offers = node.get('offers')
                if isinstance(offers, dict):
                    for key in ('price', 'lowPrice', 'highPrice'):
                        value = to_int(offers.get(key))
                        if value:
                            return value
                elif isinstance(offers, list):
                    for offer in offers:
                        if isinstance(offer, dict):
                            value = to_int(offer.get('price') or offer.get('lowPrice'))
                            if value:
                                return value
                stack.extend(node.values())
            elif isinstance(node, list):
                stack.extend(node)
    return 0


def text_price(html_text):
    # ارقام فارسی/عربی داخل متن صفحه، کنار «تومان»
    cleaned = re.sub(r'<[^>]+>', ' ', html_text)
    pattern = r'([0-9۰-۹][0-9۰-۹٬,\.\s]{3,})\s*(?:تومان|ريال|ریال)'
    # اولین قیمت معقول صفحه، نه بزرگ‌ترین عدد (صفحه‌های فروشگاهی چند محصول دارند)
    for match in re.findall(pattern, cleaned)[:40]:
        digits = match.translate(str.maketrans('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))
        digits = re.sub(r'[^0-9]', '', digits)
        if 5 <= len(digits) <= 12:
            return int(digits)
    return 0


def generic_product(url, html_text):
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html_text, re.S | re.I)
    title = re.sub(r'\s+', ' ', title_match.group(1)).strip() if title_match else ''
    if not title:
        match = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', html_text, re.I)
        title = match.group(1).strip() if match else ''

    # عنوان صفحه معمولاً اسم فروشگاه را هم دارد: «... | فروشگاه کلیک»
    cleaned = re.sub(r'\s*[|\-–—]\s*[^|]{1,40}$', '', title).strip()
    if cleaned:
        title = cleaned

    shop = ''
    site_match = re.search(
        r'<meta[^>]+property=["\']og:site_name["\'][^>]+content=["\']([^"\']+)', html_text, re.I
    )
    if site_match:
        shop = site_match.group(1).strip()
    if not shop:
        shop = urllib.parse.urlparse(url).netloc.lower().replace('www.', '')

    price = (
        meta_price(html_text, ['product:price:amount', 'og:price:amount', 'price', 'product:sale_price:amount'])
        or json_ld_price(html_text)
        or text_price(html_text)
    )

    if not price:
        raise PriceError('قیمت روی این صفحه پیدا نشد؛ لینک محصول در ترب را بده')

    return {
        'title': title or 'کالای بدون نام',
        'price': price,
        'price_text': '',
        'shop': shop,
        'available': True,
    }


def fetch_product(url):
    host = urllib.parse.urlparse(url).netloc.lower()
    if not host:
        raise PriceError('لینک معتبر نیست')
    html_text = http_get(url)
    if 'torob.com' in host:
        info = torob_product(html_text)
        info['shop'] = info.get('shop') or 'ترب'
        return info
    return generic_product(url, html_text)


def torob_search(query):
    url = 'https://torob.com/search/?query=' + urllib.parse.quote(query)
    data = next_data(http_get(url))
    if not data:
        raise PriceError('جستجوی ترب پاسخ نداد')
    page = (data.get('props') or {}).get('pageProps') or {}
    results = []
    for product in (page.get('products') or [])[:10]:
        path = product.get('web_client_absolute_url') or ''
        price = to_int(product.get('min_price')) or to_int(product.get('price'))
        title = (product.get('name1') or product.get('name') or '').strip()
        if not title or not path:
            continue
        results.append(
            {
                'title': title,
                'price': price,
                'price_text': (product.get('price_text') or '').strip(),
                'shop': (product.get('shop_text') or '').strip(),
                'url': 'https://torob.com' + path,
            }
        )
    return results


# --------------------------------------------------------------------------
# price history
# --------------------------------------------------------------------------

def record_price(item, price):
    if not price:
        return
    day = today_key()
    history = item.setdefault('history', [])
    if history and history[-1].get('date') == day:
        history[-1]['price'] = price
        history[-1]['ts'] = now_iso()
    else:
        history.append({'date': day, 'price': price, 'ts': now_iso()})
    item['history'] = history[-400:]


def apply_check(item, info=None, error=None):
    item['last_check'] = now_iso()
    if error:
        item['error'] = error
        return
    item['error'] = None
    item['title'] = (info.get('title') or item.get('title') or '').strip()
    item['price'] = info.get('price') or 0
    item['price_text'] = info.get('price_text') or ''
    item['shop'] = info.get('shop') or item.get('shop') or ''
    item['available'] = bool(info.get('available', True))
    record_price(item, item['price'])


def check_items(ids=None, force=False):
    """Fetch prices for the given items (or every due item)."""
    with CHECK_LOCK:
        with STATE_LOCK:
            selected = []
            for item in STATE['items']:
                if ids and item['id'] not in ids:
                    continue
                if not force and not is_due(item):
                    continue
                selected.append(item['id'])

        for index, item_id in enumerate(selected):
            try:
                with STATE_LOCK:
                    item = find_item(item_id)
                    url = item['url'] if item else None
                if not url:
                    continue
                info = fetch_product(url)
                with STATE_LOCK:
                    target = find_item(item_id)
                    if target:
                        apply_check(target, info=info)
                        save_state(STATE)
            except PriceError as exc:
                with STATE_LOCK:
                    target = find_item(item_id)
                    if target:
                        apply_check(target, error=str(exc))
                        save_state(STATE)
            except Exception as exc:
                with STATE_LOCK:
                    target = find_item(item_id)
                    if target:
                        apply_check(target, error=str(exc)[:200])
                        save_state(STATE)

            if index < len(selected) - 1:
                time.sleep(1.2)


def is_due(item):
    last = item.get('last_check')
    if not last:
        return True
    try:
        moment = datetime.fromisoformat(last)
    except Exception:
        return True
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=IRAN)
    return datetime.now(IRAN) - moment >= timedelta(hours=INTERVAL_HOURS)


def find_item(item_id):
    for item in STATE['items']:
        if item['id'] == item_id:
            return item
    return None


def scheduler():
    time.sleep(2)
    while True:
        try:
            if STATE['items']:
                check_items(force=False)
        except Exception as exc:
            print('scheduler error:', exc)
        time.sleep(120)


# --------------------------------------------------------------------------
# http handler
# --------------------------------------------------------------------------

def public_state():
    with STATE_LOCK:
        items = []
        for item in STATE['items']:
            items.append(
                {
                    'id': item['id'],
                    'url': item['url'],
                    'title': item.get('title') or '',
                    'price': item.get('price') or 0,
                    'price_text': item.get('price_text') or '',
                    'shop': item.get('shop') or '',
                    'available': item.get('available', True),
                    'history': item.get('history') or [],
                    'last_check': item.get('last_check'),
                    'error': item.get('error'),
                    'created': item.get('created'),
                }
            )
        return {
            'items': items,
            'meta': {
                'interval_hours': INTERVAL_HOURS,
                'server_time': now_iso(),
                'checked_at': STATE.get('meta', {}).get('checked_at'),
            },
        }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    def end_headers(self):
        if not self.path.startswith('/api/'):
            self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if not length:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == '/api/state':
            self.send_json(public_state())
            return

        if parsed.path == '/api/search':
            query = (urllib.parse.parse_qs(parsed.query).get('q') or [''])[0].strip()
            self.handle_search(query)
            return

        if parsed.path.startswith('/api/'):
            self.send_json({'ok': False, 'error': 'نشانی نامعتبر'}, 404)
            return

        super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        body = self.read_body()

        if parsed.path == '/api/search':
            self.handle_search((body.get('q') or '').strip())
            return

        if parsed.path == '/api/watch':
            self.handle_watch(body)
            return

        if parsed.path == '/api/check':
            ids = []
            if body.get('id'):
                ids = [body['id']]
            check_items(ids=ids, force=True)
            payload = public_state()
            payload['ok'] = True
            self.send_json(payload)
            return

        if parsed.path == '/api/delete':
            item_id = body.get('id')
            with STATE_LOCK:
                STATE['items'] = [item for item in STATE['items'] if item['id'] != item_id]
                save_state(STATE)
            payload = public_state()
            payload['ok'] = True
            self.send_json(payload)
            return

        self.send_json({'ok': False, 'error': 'نشانی نامعتبر'}, 404)

    def handle_search(self, query):
        if not query:
            self.send_json({'ok': False, 'error': 'چیزی برای جستجو ننوشتی'})
            return
        try:
            results = torob_search(query)
            self.send_json({'ok': True, 'results': results})
        except PriceError as exc:
            self.send_json({'ok': False, 'error': str(exc)})
        except Exception as exc:
            self.send_json({'ok': False, 'error': 'جستجو انجام نشد (%s)' % type(exc).__name__})

    def handle_watch(self, body):
        url = (body.get('url') or '').strip()
        title = (body.get('title') or '').strip()
        if not url.startswith('http'):
            self.send_json({'ok': False, 'error': 'لینک محصول معتبر نیست'})
            return

        existing = None
        with STATE_LOCK:
            for item in STATE['items']:
                if item['url'] == url.split('?')[0] or item['url'] == url:
                    existing = item
                    break

        if existing:
            check_items(ids=[existing['id']], force=True)
            payload = public_state()
            payload['ok'] = True
            payload['duplicate'] = True
            self.send_json(payload)
            return

        try:
            info = fetch_product(url)
        except PriceError as exc:
            self.send_json({'ok': False, 'error': str(exc)})
            return
        except Exception as exc:
            self.send_json({'ok': False, 'error': 'خواندن قیمت ممکن نشد (%s)' % type(exc).__name__})
            return

        item = {
            'id': new_id(),
            'url': url,
            'title': title or info.get('title') or '',
            'price': 0,
            'price_text': '',
            'shop': '',
            'available': True,
            'history': [],
            'last_check': None,
            'error': None,
            'created': now_iso(),
        }
        apply_check(item, info=info)

        with STATE_LOCK:
            STATE['items'].insert(0, item)
            save_state(STATE)

        payload = public_state()
        payload['ok'] = True
        payload['added'] = item['id']
        self.send_json(payload)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    os.chdir(BASE_DIR)
    thread = threading.Thread(target=scheduler, daemon=True)
    thread.start()

    server = Server(('127.0.0.1', PORT), Handler)
    print('Kargah running at http://127.0.0.1:%d  (check every %g h)' % (PORT, INTERVAL_HOURS))
    print('press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('stopped')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
