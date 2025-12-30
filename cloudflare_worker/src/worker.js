export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cache = caches.default;

    if (request.method === "OPTIONS") {
      return withCors(new Response("", { status: 204 }));
    }

    if (path === "/health") return withCors(json({ ok: true }));

    // Snapshot: Dump verified prices only (Trust=0) or all?
    // For growth, dump all. Client can filter logic if needed, or we filter here.
    // Let's dump all for now.
    if (path === "/snapshot") {
      const result = await env.DB.prepare(
        "SELECT prod_id, min_price, trust_level FROM lowest_prices"
      ).all();

      const prices = {};
      if (result.results) {
        for (const r of result.results) {
          prices[r.prod_id] = { p: r.min_price, t: r.trust_level };
        }
      }
      const response = withCors(json({ ok: true, last: new Date().toISOString(), prices }));
      response.headers.set("Cache-Control", "public, max-age=3600");
      return response;
    }

    // Get Lowest Price
    if (path === "/lowest") {
      const prodId = url.searchParams.get("prodId");
      if (!prodId) return withCors(json({ error: "Missing prodId" }, 400));

      // Try Cache
      const cacheKey = new Request(url.toString(), request);
      if (request.method === "GET") {
        const cached = await cache.match(cacheKey);
        if (cached) return withCors(cached);
      }

      const row = await env.DB.prepare(
        "SELECT min_price, trust_level, updated_at FROM lowest_prices WHERE prod_id = ?"
      ).bind(prodId).first();

      const payload = row
        ? { prodId, minPrice: row.min_price, trustLevel: row.trust_level, updatedAt: row.updated_at }
        : { prodId, minPrice: null, trustLevel: null, updatedAt: null };

      const response = withCors(json(payload));

      // Cache logic
      if (payload.minPrice) {
        response.headers.set("Cache-Control", "public, max-age=1800");
        await cache.put(cacheKey, response.clone());
      }
      return response;
    }

    // Ingest Report (Crowdsourcing)
    if (path === "/ingest" && request.method === "POST") {
      const payload = await request.json().catch(() => null);
      if (!payload || !Array.isArray(payload.items)) return withCors(json({ error: "Invalid" }, 400));

      const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
      // Simple hash to anonymize IP but allow count distinct
      const ipHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "SALT"))
        .then(b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''));

      const now = new Date().toISOString();
      let processed = 0;

      for (const item of payload.items) {
        const prodId = item.prodId;
        const price = Number(item.price);
        if (!prodId || price <= 10) continue;

        // 1. Record Report
        await env.DB.prepare(
          "INSERT INTO price_report_history (prod_id, price, ip_hash, created_at) VALUES (?, ?, ?, ?)"
        ).bind(prodId, price, ipHash, now).run();

        // 2. Calculate Trust
        // Count unique IPs reporting this specific price in last 24h
        const stats = await env.DB.prepare(
          `SELECT count(DISTINCT ip_hash) as c FROM price_report_history 
           WHERE prod_id = ? AND price = ? AND created_at > datetime('now', '-1 day')`
        ).bind(prodId, price).first();

        const count = stats.c || 1;
        const trustLevel = count >= 2 ? 0 : 1; // 0=Trusted, 1=Unverified

        // 3. Update Lowest Price Logic
        // We only care if:
        // A) No record exists
        // B) New Price < Current Min Price
        // C) New Price == Current Min Price BUT Trust Level Improved (1 -> 0)

        const current = await env.DB.prepare("SELECT min_price, trust_level FROM lowest_prices WHERE prod_id = ?").bind(prodId).first();

        let shouldUpdate = false;
        if (!current) {
          shouldUpdate = true;
        } else if (price < current.min_price) {
          shouldUpdate = true;
        } else if (price === current.min_price && trustLevel < current.trust_level) {
          shouldUpdate = true;
        }

        if (shouldUpdate) {
          await env.DB.prepare(
            `INSERT INTO lowest_prices (prod_id, min_price, trust_level, updated_at) 
             VALUES (?, ?, ?, ?)
             ON CONFLICT(prod_id) DO UPDATE SET 
             min_price=excluded.min_price, 
             trust_level=excluded.trust_level, 
             updated_at=excluded.updated_at`
          ).bind(prodId, price, trustLevel, now).run();

          // Invalidate cache
          const cacheUrl = new URL(url.origin);
          cacheUrl.pathname = "/lowest";
          cacheUrl.searchParams.set("prodId", prodId);
          await cache.delete(new Request(cacheUrl));
        }
        processed++;
      }

      return withCors(json({ ok: true, count: processed }));
    }

    return withCors(json({ error: "Not found" }, 404));
  }
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  return new Response(response.body, { status: response.status, headers });
}
