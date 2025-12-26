const TAG = "[MomoPrice]";

// Helper to extract Product ID from URL
function getProdId() {
  const urlParams = new URLSearchParams(window.location.search);
  const iCode = urlParams.get("i_code");
  if (iCode) return iCode;
  return null;
}

// Helper to extract Price from JSON-LD (Primary) or DOM (Fallback)
function getPromoPrice() {
  // 1. Try JSON-LD (Most Reliable)
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      const data = JSON.parse(script.innerText);
      // Check for strict "Offer" type or array handling
      if (data.offers && data.offers.price) {
        return parseFloat(data.offers.price);
      }
      if (Array.isArray(data)) {
        const item = data.find(d => d.offers && d.offers.price);
        if (item) return parseFloat(item.offers.price);
      }
    }
  } catch (e) {
    console.warn(TAG, "JSON-LD parse error", e);
  }

  // 2. DOM Selector Fallbacks
  const selectors = [
    ".priceArea .selected b", // Desktop specific format
    ".priceText",             // Common class
    ".special",               // Mobile/Promo
    "#goodsPrice",            // ID lookup
    ".price"                  // Generic
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      // Extract first valid number from text
      const raw = el.innerText.replace(/[^0-9.]/g, "");
      const price = parseFloat(raw);
      if (!isNaN(price) && price > 0) return price; // Basic sanity check
    }
  }

  return null;
}

function createToast(message, type = "info", onClose) {
  const existing = document.getElementById("community-price-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "community-price-toast";

  // Momo Pink/Red Theme
  const colors = {
    info: "#d63384", // Momo Pink-ish
    success: "#198754",
    warning: "#fd7e14"
  };
  const color = colors[type] || colors.info;

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    border-left: 5px solid ${color};
    padding: 12px 16px;
    border-radius: 4px;
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    min-width: 250px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    transform: translateY(100px);
    transition: transform 0.3s ease-out;
  `;

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center;";

  const title = document.createElement("strong");
  title.textContent = "Momo 歷史價格";
  title.style.color = "#333";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "background:none; border:none; cursor:pointer; font-size:16px; color:#999;";
  closeBtn.onclick = () => {
    toast.style.transform = "translateY(100px)";
    setTimeout(() => toast.remove(), 300);
    if (onClose) onClose();
  };

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.innerHTML = message;
  body.style.cssText = "font-size: 14px; color: #555; line-height: 1.4;";

  // Support for "Go to Store" / "Donate" buttons in the message
  // Just ensure standard links work.

  toast.appendChild(header);
  toast.appendChild(body);
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
  });
}

async function checkPrice() {
  const prodId = getProdId();
  if (!prodId) {
    console.log(TAG, "No i_code found");
    return;
  }

  const promoPrice = getPromoPrice();
  console.log(TAG, `Checking ${prodId}, Current Price: ${promoPrice}`);

  // Initial Feedback
  createToast(`🔍 查詢歷史價格中...`, "info");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "getPrice",
      prodId,
      promoOverride: promoPrice, // Send valid DOM price if found
      pageType: "product"
    });

    if (!response || !response.ok) {
      createToast("⚠️ 無法連接社群資料庫", "warning");
      return;
    }

    const { communityLow, effectiveLow } = response;

    let msg = "";
    let type = "info";

    if (effectiveLow === null) {
      msg = `尚無此商品資料。<br><span style="color:#d63384; font-weight:bold;">您是第一位回報者！</span><br>價格 $${promoPrice} 已記錄 (待驗證)。`;
      type = "warning";
    } else {
      const current = promoPrice;
      if (current === null) {
        msg = `歷史最低: <span style="font-weight:bold;">$${effectiveLow}</span><br>(目前無法讀取頁面價格)`;
      } else if (current <= effectiveLow) {
        msg = `🔥 <span style="color:#d63384; font-weight:bold;">歷史新低！</span><br>現在 $${current} (原本最低 $${effectiveLow})`;
        type = "success";
      } else {
        const diff = current - effectiveLow;
        msg = `目前價格: $${current}<br>歷史最低: <span style="font-weight:bold;">$${effectiveLow}</span><br>(貴了 $${diff})`;
        type = "info";
      }
    }

    createToast(msg, type);

  } catch (err) {
    console.error(TAG, err);
    createToast("❌ 發生錯誤", "warning");
  }
}

// Run
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkPrice);
} else {
  checkPrice();
}
