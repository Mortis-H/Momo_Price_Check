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

  // Check if user dismissed it this session
  if (sessionStorage.getItem("momo_price_toast_dismissed") === "true") {
    return;
  }

  const toast = document.createElement("div");
  toast.id = "community-price-toast";

  // Momo Pink/Red Theme
  const colors = {
    info: "#d63384", // Momo Pink-ish
    success: "#198754",
    warning: "#fd7e14"
  };
  const color = colors[type] || colors.info;

  // Responsive positioning: Bottom-Right on Desktop, Top-Center on Mobile
  const isMobile = window.innerWidth <= 768;
  const positionStyles = isMobile
    ? "top: 10px; right: 10px; left: 10px;" // Full width on mobile top
    : "bottom: 20px; right: 20px; min-width: 250px;"; // Fixed box on desktop bottom-right

  toast.style.cssText = `
    position: fixed;
    ${positionStyles}
    background: white;
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    border-left: 5px solid ${color};
    padding: 12px 16px;
    border-radius: 8px;
    z-index: 2147483647; /* Max Z-Index to avoid being covered */
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transform: ${isMobile ? "translateY(-100px)" : "translateY(100px)"};
    transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: flex-start;";

  const title = document.createElement("div");
  title.innerHTML = "<strong>Momo 歷史價格</strong>";
  title.style.color = "#333";
  title.style.fontSize = "14px";

  const closeBtn = document.createElement("button");
  closeBtn.innerHTML = "&times;";
  closeBtn.title = "關閉 (本次工作階段不再顯示)";
  closeBtn.style.cssText = `
    background: none; 
    border: none; 
    cursor: pointer; 
    font-size: 20px; 
    color: #999; 
    line-height: 1; 
    padding: 0; 
    margin: -4px -4px 0 0;
  `;
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    toast.style.transform = isMobile ? "translateY(-100px)" : "translateY(100px)";
    setTimeout(() => toast.remove(), 300);
    // Remember dismissal
    sessionStorage.setItem("momo_price_toast_dismissed", "true");
    if (onClose) onClose();
  };

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.innerHTML = message;
  body.style.cssText = "font-size: 15px; color: #333; line-height: 1.4; font-weight: 500;";

  toast.appendChild(header);
  toast.appendChild(body);
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = "translateY(0)";
  });
}

// Helper for comma formatting (e.g. 1000 -> 1,000)
function formatPrice(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
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
  createToast(`查詢中...`, "info");

  try {
    const response = await chrome.runtime.sendMessage({
      type: "getPrice",
      prodId,
      promoOverride: promoPrice, // Send valid DOM price if found
      pageType: "product"
    });

    if (!response || !response.ok) {
      createToast("無法連接資料庫", "warning");
      return;
    }

    const { communityLow, effectiveLow } = response;
    let msg = "";

    if (effectiveLow === null) {
      msg = `尚無歷史價格`;
    } else {
      // Simplest format as requested: "歷史低價: $X,XXX"
      msg = `歷史低價: $${formatPrice(effectiveLow)}`;
    }

    createToast(msg, "info");

  } catch (err) {
    console.error(TAG, err);
    createToast("發生錯誤", "warning");
  }
}

// Run
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", checkPrice);
} else {
  checkPrice();
}
