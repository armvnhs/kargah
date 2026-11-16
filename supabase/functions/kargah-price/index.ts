// Kargah live-price service — Supabase Edge Function (Deno, zero dependencies)
// Actions: state | search | add | check
// Reads/writes public.kargah_state of the calling user (RLS enforced by their JWT).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";
const INTERVAL_HOURS = 6;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" },
  });
}

function tehranDate(date = new Date()): string {
  return new Date(date.getTime() + 3.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function toInt(value: unknown): number {
  if (typeof value === "number" && isFinite(value)) return Math.round(value);
  const digits = String(value ?? "").replace(/[^0-9]/g, "");
  return digits ? Number(digits) : 0;
}

function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "fa-IR,fa;q=0.9,en;q=0.6",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error("سایت پاسخ داد (" + res.status + ")");
  return await res.text();
}

function nextData(html: string): any {
  const match = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

type Product = { title: string; price: number; shop: string; available: boolean };

async function torobProduct(url: string): Promise<Product> {
  const data = nextData(await fetchText(url));
  const page = data?.props?.pageProps ?? {};
  const product = page.baseProduct ?? page.products?.[0];
  if (!product) throw new Error("محصول در صفحهٔ ترب پیدا نشد");
  const price = toInt(product.min_price) || toInt(product.price);
  const title = String(product.name1 ?? product.name ?? "").trim();
  if (!title) throw new Error("نام محصول روی صفحه نبود");
  return {
    title,
    price,
    shop: String(product.shop_text ?? "").trim(),
    available: price > 0,
  };
}

async function genericProduct(url: string): Promise<Product> {
  const html = await fetchText(url);

  let title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!title) {
    title = html.match(/property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1] ?? "";
  }
  const trimmed = title.replace(/\s*[|–—-]\s*[^|]{1,40}$/, "").trim();
  if (trimmed) title = trimmed;

  let shop = html.match(/property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1] ?? "";
  if (!shop) shop = new URL(url).hostname.replace(/^www\./, "");

  let price = 0;
  for (const key of ["product:price:amount", "og:price:amount", "product:sale_price:amount"]) {
    const meta = html.match(
      new RegExp(`(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, "i"),
    );
    if (meta) {
      price = toInt(meta[1]);
      if (price) break;
    }
  }

  if (!price) {
    const offer = html.match(/"price"\s*:\s*"?([0-9][0-9.,\s]*)"/i);
    if (offer) price = toInt(offer[1]);
  }

  if (!price) {
    const text = html.replace(/<[^>]+>/g, " ");
    const numbers = text.match(/([0-9۰-۹][0-9۰-۹٬,.\s]{3,})\s*(?:تومان|ريال|ریال)/g) ?? [];
    for (const chunk of numbers.slice(0, 40)) {
      const value = toInt(chunk);
      if (String(value).length >= 5) {
        price = value;
        break;
      }
    }
  }

  if (!price) throw new Error("قیمت روی این صفحه پیدا نشد؛ لینک محصول را از ترب بده");
  return { title: title || "کالای بدون نام", price, shop, available: true };
}

async function readProduct(url: string): Promise<Product> {
  const host = new URL(url).hostname.toLowerCase();
  return host.includes("torob.com") ? await torobProduct(url) : await genericProduct(url);
}

async function torobSearch(query: string) {
  const url = "https://torob.com/search/?query=" + encodeURIComponent(query);
  const data = nextData(await fetchText(url));
  const products = data?.props?.pageProps?.products ?? [];
  const results = [];
  for (const product of products.slice(0, 10)) {
    const path = String(product.web_client_absolute_url ?? "");
    const title = String(product.name1 ?? product.name ?? "").trim();
    if (!path || !title) continue;
    results.push({
      title,
      price: toInt(product.min_price) || toInt(product.price),
      shop: String(product.shop_text ?? "").trim(),
      url: path.startsWith("http") ? path : "https://torob.com" + path,
    });
  }
  if (!results.length) throw new Error("چیزی در ترب پیدا نشد");
  return results;
}

type Entry = { date: string; price: number; ts: string };
type Item = {
  id: string;
  url: string;
  title: string;
  price: number;
  shop: string;
  available: boolean;
  last_check: string | null;
  history: Entry[];
  error?: string | null;
};

function recordPrice(item: Item, product: Product) {
  const now = new Date();
  const date = tehranDate(now);
  const history = Array.isArray(item.history) ? item.history : [];
  const entry: Entry = { date, price: product.price, ts: now.toISOString() };

  if (product.title) item.title = product.title;
  if (product.shop) item.shop = product.shop;
  item.price = product.price;
  item.available = product.available;
  item.last_check = now.toISOString();
  item.error = null;

  const existing = history.findIndex((row) => row.date === date);
  if (existing >= 0) history[existing] = entry;
  else history.push(entry);
  item.history = history.slice(-90);
}

function isStale(item: Item): boolean {
  if (!item.last_check) return true;
  const last = Date.parse(item.last_check);
  if (!last) return true;
  return Date.now() - last > INTERVAL_HOURS * 3600 * 1000;
}

async function loadState(userId: string, auth: string): Promise<any> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/kargah_state?user_id=eq.${userId}&select=data`,
    { headers: { apikey: ANON_KEY, Authorization: auth } },
  );
  if (!res.ok) throw new Error("خواندن داده از Supabase ممکن نشد");
  const rows = await res.json();
  return rows?.[0]?.data ?? null;
}

async function saveState(userId: string, data: any, auth: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/kargah_state?on_conflict=user_id`, {
    method: "POST",
    headers: {
      apikey: ANON_KEY,
      Authorization: auth,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify({
      user_id: userId,
      data,
      updated_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) throw new Error("ذخیره در Supabase ممکن نشد");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    let userId = "";
    if (auth && !auth.includes(ANON_KEY) && ANON_KEY) {
      const who = await fetch(SUPABASE_URL + "/auth/v1/user", {
        headers: { apikey: ANON_KEY, Authorization: auth },
      });
      if (who.ok) userId = (await who.json())?.id ?? "";
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const action = String(body.action ?? "state");

    if (action === "search") {
      const query = String(body.q ?? "").trim();
      if (!query) return json({ error: "عبارت جستجو خالی است" }, 400);
      return json({ results: await torobSearch(query) });
    }

    const data = userId ? ((await loadState(userId, auth)) ?? {}) : {};
    const items: Item[] = Array.isArray(data.watch) ? data.watch : [];

    if (action === "state") {
      return json({ data, items, interval_hours: INTERVAL_HOURS, signed_in: !!userId });
    }

    if (action === "add") {
      const url = String(body.url ?? "").trim();
      if (!url.startsWith("http")) return json({ error: "لینک معتبر نیست" }, 400);
      if (items.some((item) => item.url === url)) {
        return json({ error: "این کالا از قبل زیر نظر است", items });
      }
      const product = await readProduct(url);
      const item: Item = {
        id: newId(),
        url,
        title: product.title,
        price: 0,
        shop: product.shop,
        available: product.available,
        last_check: null,
        history: [],
        error: null,
      };
      recordPrice(item, product);
      items.unshift(item);
      data.watch = items;
      if (userId) await saveState(userId, data, auth);
      return json({ items, added: item });
    }

    if (action === "check") {
      const target = String(body.id ?? "");
      const picked = target ? items.filter((item) => item.id === target) : items;
      let failed = 0;
      for (const item of picked) {
        try {
          recordPrice(item, await readProduct(item.url));
        } catch (error) {
          failed += 1;
          item.last_check = new Date().toISOString();
          item.error = error instanceof Error ? error.message : "بررسی ناموفق";
        }
      }
      data.watch = items;
      if (userId) await saveState(userId, data, auth);
      return json({ items, failed });
    }

    if (action === "refresh") {
      let updated = 0;
      for (const item of items) {
        if (!isStale(item)) continue;
        try {
          recordPrice(item, await readProduct(item.url));
          updated += 1;
        } catch {
          item.last_check = new Date().toISOString();
        }
      }
      if (updated) {
        data.watch = items;
        if (userId) await saveState(userId, data, auth);
      }
      return json({ items, updated });
    }

    return json({ error: "دستور ناشناخته" }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "خطای نامشخص" }, 500);
  }
});
