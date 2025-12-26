# Momo Price Check (Community Trust Edition)

這是一個專為 Momo 購物網設計的歷史價格查詢與回報工具。由於 Momo 沒有公开的伺服器端驗證 API，本專案採用 **"社群信任分數 (Trust Score)"** 機制，透過分散式回報系統來建立可信的價格歷史。

## 🚀 核心功能

- **歷史低價查詢**: 自動查詢並顯示商品的歷史最低價格。
- **社群信任機制 (Trust System)**:
    - **✅ 已驗證 (Trusted)**: 該價格由多個不同 IP 在 24 小時內共同回報，可信度高。
    - **⚠️ 成長中 (Unverified)**: 該價格來自單一來源回報 (冷啟動階段)，供參考但需自行判斷。
- **智能價格抓取**: 優先解析頁面 **JSON-LD (Structured Data)**，確保價格數據精準無誤，不依賴易變的 CSS 選擇器。
- **美觀 UI**: 採用 Momo 品牌色系的浮動通知 (Floating Toast)，即時顯示比價結果。
- **隱私優先**: IP 位址經單向雜湊 (Hash) 處理，僅用於計算信任分數，不儲存原始個資。

## 📂 專案結構

- **`extension/`**: Chrome 擴充功能
    - `content_product.js`: 負責解析 JSON-LD 價格、顯示 UI、與 Worker 通訊。
    - `background.js`: 處理跨域請求與緩存。
    - `manifest.json`: V3 架構設定。

- **`cloudflare_worker/`**: 後端 API (Cloudflare Workers + D1)
    - **D1 Database**: `momo-community-low`
    - **Trust Logic**: 實作冷啟動與多點驗證邏輯。
    - **API**:
        - `POST /ingest`: 接收價格回報 (Payload: `{ items: [{ prodId, price }] }`)。
        - `GET /lowest?prodId=...`: 查詢最低價與信任等級。
        - `GET /snapshot`: 匯出資料快照。

## 🛠️ 安裝與部署

### 1. Chrome Extension (使用者)
1. 下載並解壓縮 `extension` 資料夾 (或 release zip)。
2. 開啟 Chrome `chrome://extensions/`。
3. 開啟 "開發人員模式" (Developer mode)。
4. 點擊 "載入未封裝項目" (Load unpacked)，選擇本專案的 `extension` 資料夾。

### 2. Cloudflare Worker (開發者)
```bash
cd cloudflare_worker
npm install

# 初始化資料庫 (若尚未建立)
npx wrangler d1 create momo-community-low

# 套用 Schema
npx wrangler d1 execute momo-community-low --file=./schema.sql

# 部署
npx wrangler deploy
```

## 📝 版本紀錄

- **v0.1.0** (2025-12-26):
    - 專案初始化。
    - 實作 Trust Score 系統 (Worker)。
    - 實作 JSON-LD 價格解析 (Extension)。
    - 移除贊助按鈕，優化 UI 配色。
