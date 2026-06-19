const RAW_ASSET_CATEGORIES = [
  {
    id: "currency",
    title: "Валюты",
    assets: [
      // Основные пары + OTC. По валютам Pocket Option обычно принимает названия прямо: EURUSD / EURUSD_otc.
      "EURUSD_otc","EURUSD","GBPUSD_otc","GBPUSD","USDJPY_otc","USDJPY","USDCHF_otc","USDCHF","USDCAD_otc","USDCAD",
      "AUDUSD_otc","AUDUSD","NZDUSD_otc","NZDUSD","EURJPY_otc","EURJPY","EURGBP_otc","EURGBP","EURCHF_otc","EURCHF",
      "EURAUD_otc","EURAUD","EURCAD_otc","EURCAD","EURNZD_otc","EURNZD","GBPJPY_otc","GBPJPY","GBPCHF_otc","GBPCHF",
      "GBPCAD_otc","GBPCAD","GBPAUD_otc","GBPAUD","GBPNZD_otc","GBPNZD","AUDJPY_otc","AUDJPY","AUDCHF_otc","AUDCHF",
      "AUDCAD_otc","AUDCAD","AUDNZD_otc","AUDNZD","NZDJPY_otc","NZDJPY","NZDCHF_otc","NZDCHF","NZDCAD_otc","NZDCAD",
      "CADJPY_otc","CADJPY","CADCHF_otc","CADCHF","CHFJPY_otc","CHFJPY",
      // Экзотика, которую платформа даёт как OTC. N/A-активы мост пропускает и не стопорится.
      "USDBRL_otc","USDCNH_otc","USDINR_otc","USDMXN_otc","USDPKR_otc","USDBDT_otc","USDVND_otc","USDTHB_otc",
      "USDARS_otc","USDCLP_otc","USDCOP_otc","USDDZD_otc","USDEGP_otc","USDIDR_otc","UAHUSD_otc",
      "KESUSD_otc","LBPUSD_otc","ZARUSD_otc","IRRUSD_otc","MADUSD_otc","NGNUSD_otc","TNDUSD_otc","SYPUSD_otc",
      "AEDCNY_otc","BHDCNY_otc","JODCNY_otc","OMRCNY_otc","QARCNY_otc","SARCNY_otc","YERUSD_otc"
    ]
  },
  {
    id: "crypto",
    title: "Криптовалюты",
    assets: [
      // Реальные wire-названия из changeSymbol на Pocket Option.
      "AVAX_otc","BTCUSD_otc","BTCUSD","SOL-USD_otc","LINK_otc","TON-USD_otc","BNB-USD_otc",
      "LTCUSD_otc","TRX-USD_otc","DOTUSD_otc","ADA-USD_otc","ETHUSD_otc","DOGE_otc","MATIC_otc","BITB_otc"
    ]
  },
  {
    id: "stocks",
    title: "Акции",
    assets: [
      // Реальные wire-названия из changeSymbol. Решётка # важна: без неё часть акций не открывается.
      "#AAPL_otc","#TSLA_otc","#XOM_otc","AMZN_otc","BABA_otc","CITI_otc","FDX_otc","PLTR_otc",
      "#FB_otc","AMD_otc","#INTC_otc","VISA_otc","MARA_otc","#BA_otc","COIN_otc","#CSCO_otc",
      "GME_otc","#AXP_otc","#MCD_otc","#MSFT_otc","#JNJ_otc","NFLX_otc"
    ]
  }
];

// Человеческие названия из интерфейса -> реальные wire-названия Pocket Option.
const DISPLAY_TO_WIRE = {
  "BITCOIN OTC": "BTCUSD_otc",
  "BITCOIN": "BTCUSD",
  "ETHEREUM OTC": "ETHUSD_otc",
  "LITECOIN OTC": "LTCUSD_otc",
  "DOGECOIN OTC": "DOGE_otc",
  "SOLANA OTC": "SOL-USD_otc",
  "CARDANO OTC": "ADA-USD_otc",
  "POLKADOT OTC": "DOTUSD_otc",
  "TRON OTC": "TRX-USD_otc",
  "AVALANCHE OTC": "AVAX_otc",
  "LINK OTC": "LINK_otc",
  "CHAINLINK OTC": "LINK_otc",
  "TON OTC": "TON-USD_otc",
  "BNB OTC": "BNB-USD_otc",
  "MATIC OTC": "MATIC_otc",
  "BITB OTC": "BITB_otc",

  "TESLA OTC": "#TSLA_otc",
  "APPLE OTC": "#AAPL_otc",
  "MICROSOFT OTC": "#MSFT_otc",
  "NETFLIX OTC": "NFLX_otc",
  "AMAZON OTC": "AMZN_otc",
  "ALIBABA OTC": "BABA_otc",
  "INTEL OTC": "#INTC_otc",
  "CISCO OTC": "#CSCO_otc",
  "FACEBOOK OTC": "#FB_otc",
  "FACEBOOK INC OTC": "#FB_otc",
  "BOEING COMPANY OTC": "#BA_otc",
  "AMERICAN EXPRESS OTC": "#AXP_otc",
  "MCDONALD'S OTC": "#MCD_otc",
  "MCDONALDS OTC": "#MCD_otc",
  "JOHNSON & JOHNSON OTC": "#JNJ_otc",
  "EXXONMOBIL OTC": "#XOM_otc",
  "COINBASE GLOBAL OTC": "COIN_otc",
  "COINBASE OTC": "COIN_otc",
  "FEDEX OTC": "FDX_otc",
  "GAMESTOP CORP OTC": "GME_otc",
  "VISA OTC": "VISA_otc",
  "PALANTIR TECHNOLOGIES OTC": "PLTR_otc",
  "MARATHON DIGITAL HOLDINGS OTC": "MARA_otc",
  "ADVANCED MICRO DEVICES OTC": "AMD_otc",
  "CITIGROUP INC OTC": "CITI_otc"
};

function titleKey(value) {
  return String(value || "").trim().replace(/_/g, " ").replace(/\s+/g, " ").toUpperCase();
}

function normalizeAssetSymbol(asset) {
  let raw = String(asset || "").trim();
  if (!raw) return "";

  const direct = DISPLAY_TO_WIRE[titleKey(raw)];
  if (direct) return direct;

  // Уже готовые wire-имена не трогаем по регистру: #AAPL_otc, TRX-USD_otc, DOGE_otc.
  if (/^[#A-Za-z0-9-]+_otc$/.test(raw) || /^[A-Z0-9-]+$/.test(raw)) return raw;

  const hasOtc = /\bOTC\b/i.test(raw) || /_otc$/i.test(raw);
  raw = raw.replace(/_otc$/ig, "");
  raw = raw.replace(/\bOTC\b/ig, "");
  raw = raw.replace(/\//g, "");
  raw = raw.replace(/\s+/g, "");
  raw = raw.toUpperCase();
  return hasOtc ? `${raw}_otc` : raw;
}

function allAssetSymbols() {
  const out = [];
  for (const cat of RAW_ASSET_CATEGORIES) {
    for (const asset of cat.assets || []) {
      const symbol = normalizeAssetSymbol(asset);
      if (symbol) out.push(symbol);
    }
  }
  return [...new Set(out)];
}

// В v2.1.3 больше не шлём пачку неправильных alias-кандидатов.
// Берём только реальные имена из changeSymbol/subfor, которые были видны в консоли.
const WIRE_ALIAS_CANDIDATES = {
  "BTCUSD_otc": ["BTCUSD_otc"],
  "BTCUSD": ["BTCUSD"],
  "DOGE_otc": ["DOGE_otc"],
  "COIN_otc": ["COIN_otc"],
  "#AAPL_otc": ["#AAPL_otc"],
  "#TSLA_otc": ["#TSLA_otc"],
  "#XOM_otc": ["#XOM_otc"],
  "#FB_otc": ["#FB_otc"],
  "#INTC_otc": ["#INTC_otc"],
  "#BA_otc": ["#BA_otc"],
  "#CSCO_otc": ["#CSCO_otc"],
  "#AXP_otc": ["#AXP_otc"],
  "#MCD_otc": ["#MCD_otc"],
  "#MSFT_otc": ["#MSFT_otc"],
  "#JNJ_otc": ["#JNJ_otc"]
};

function assetSubscriptionSymbols(asset) {
  const canonical = normalizeAssetSymbol(asset);
  const aliases = WIRE_ALIAS_CANDIDATES[canonical] || [canonical];
  return [...new Set([canonical, ...aliases].filter(Boolean))];
}

function allSubscriptionSymbols() {
  const out = [];
  for (const cat of RAW_ASSET_CATEGORIES) {
    for (const asset of cat.assets || []) out.push(...assetSubscriptionSymbols(asset));
  }
  return [...new Set(out)];
}

function assetCategories() {
  return RAW_ASSET_CATEGORIES.map(cat => ({
    ...cat,
    assets: (cat.assets || []).map(normalizeAssetSymbol).filter(Boolean),
    subscriptionSymbols: (cat.assets || []).flatMap(assetSubscriptionSymbols).filter(Boolean)
  }));
}

function buildCanonicalWireMap() {
  const map = new Map();
  for (const cat of RAW_ASSET_CATEGORIES) {
    for (const asset of cat.assets || []) {
      const canonical = normalizeAssetSymbol(asset);
      if (!canonical) continue;
      for (const variant of assetSubscriptionSymbols(asset)) {
        const key = normalizeAssetSymbol(variant);
        if (key) map.set(key, canonical);
      }
      map.set(canonical, canonical);
    }
  }
  return map;
}

let CANONICAL_WIRE_MAP = null;

function canonicalSymbolFor(symbol) {
  const normalized = normalizeAssetSymbol(symbol);
  if (!normalized) return "";
  if (!CANONICAL_WIRE_MAP) CANONICAL_WIRE_MAP = buildCanonicalWireMap();
  return CANONICAL_WIRE_MAP.get(normalized) || normalized;
}

module.exports = { RAW_ASSET_CATEGORIES, normalizeAssetSymbol, allAssetSymbols, allSubscriptionSymbols, assetSubscriptionSymbols, assetCategories, canonicalSymbolFor };
