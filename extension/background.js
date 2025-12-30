const FLUSH_INTERVAL_MS = 1000;
const MAX_BATCH = 100;
const SETTINGS = {
  useCommunity: true,
  communityBase: "https://momo-community-low.brad0315.workers.dev",
};
let flushTimer = null;
const pendingIngest = [];
let ingestBase = "";

// Client-side cache removed for scalability.
// We now rely on the browser's native HTTP cache and the Cloudflare CDN.

function normalizePrice(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function fetchPrice(prodId) {
  // Momo doesn't have a simple public API we can check from background easily
  // without scraping. For Trust System, we rely on content script reporting.
  // We return empty "official" data here, so the logic relies on community data.
  return {
    promo: null,
    low: null,
  };
}

async function fetchCommunityLow(prodId, baseUrl) {
  // Always fetch from API (cached by Cloudflare)
  try {
    if (!baseUrl) {
      return null;
    }
    const url = `${baseUrl}/lowest?prodId=${encodeURIComponent(prodId)}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    return normalizePrice(data.minPrice ?? data.min);
  } catch (err) {
    return null;
  }
}

function shouldEnqueue(promoValue, officialLow, communityLow) {
  const promo = normalizePrice(promoValue);
  const official = normalizePrice(officialLow);
  const community = normalizePrice(communityLow);
  if (promo === null) {
    return false;
  }
  if (official === null && community === null) {
    return true;
  }
  if (community === null) {
    return official === null ? true : promo < official;
  }
  const finalLow = official !== null ? Math.min(official, community) : community;
  return promo < finalLow;
}

function enqueueIngest(item, baseUrl) {
  if (!baseUrl) return;
  ingestBase = baseUrl;
  pendingIngest.push(item);
  if (pendingIngest.length >= MAX_BATCH) {
    flushIngest();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flushIngest, FLUSH_INTERVAL_MS);
  }
}

async function flushIngest() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingIngest.length === 0) return;
  if (!ingestBase) {
    pendingIngest.length = 0;
    return;
  }
  const batch = pendingIngest.splice(0, MAX_BATCH);
  try {
    await fetch(`${ingestBase}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: batch }),
    });
  } catch (err) {
    // Best effort; drop on failure for MVP.
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) {
    return false;
  }

  if (message.type !== "getPrice" || !message.prodId) {
    return false;
  }

  fetchPrice(message.prodId)
    .then(async (result) => {
      const settings = SETTINGS;
      const promoValue = message.promoOverride ?? result.promo;
      let communityLow = null;
      if (settings.useCommunity) {
        communityLow = await fetchCommunityLow(message.prodId, settings.communityBase);
      }

      let effectiveLow = result.low;
      let source = result.low != null ? "official" : null;
      if (settings.useCommunity && communityLow != null) {
        if (effectiveLow == null || communityLow < effectiveLow) {
          effectiveLow = communityLow;
          source = "community";
        }
      }

      if (settings.useCommunity && shouldEnqueue(promoValue, result.low, communityLow)) {
        enqueueIngest({
          prodId: message.prodId,
          price: normalizePrice(promoValue),
          pageType: message.pageType || null,
          observedAt: new Date().toISOString(),
        }, settings.communityBase);
      }
      sendResponse({
        ok: true,
        promo: result.promo,
        low: result.low,
        communityLow,
        effectiveLow,
        source,
      });
    })
    .catch((err) => {
      sendResponse({ ok: false, error: String(err) });
    });

  return true;
});
