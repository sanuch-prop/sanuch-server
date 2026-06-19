const { readJson, writeJson } = require("./storage");

const FILE = "licenses.json";
const TRIAL_TRADES = Number(process.env.TRIAL_TRADES || 100);

function load() {
  return readJson(FILE, {});
}

function save(data) {
  writeJson(FILE, data);
}

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "SAN-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generateLicenseKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "SK-";
  for (let i = 0; i < 4; i++) key += chars[Math.floor(Math.random() * chars.length)];
  key += "-";
  for (let i = 0; i < 4; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key; // формат: SK-A7BK-2MN9
}

function getOrCreate(platformId) {
  const id = String(platformId).trim();
  const data = load();
  if (!data[id]) {
    const usedCodes = new Set(Object.values(data).map(u => u.code));
    let code;
    do { code = generateCode(); } while (usedCodes.has(code));

    data[id] = {
      platformId: id,
      code,
      status: "trial",       // trial | active | blocked
      tradesUsed: 0,
      createdAt: new Date().toISOString(),
      activatedAt: null,
      monoTxId: null,
      amountPaid: 0
    };
    save(data);
  }
  return data[id];
}

function getStatus(platformId) {
  const id = String(platformId).trim();
  const data = load();
  if (!data[id]) return null;
  const u = data[id];
  const isExpired = u.status === "trial" && u.tradesUsed >= TRIAL_TRADES;
  return {
    status: isExpired ? "expired" : u.status,
    tradesUsed: u.tradesUsed,
    tradesLimit: TRIAL_TRADES,
    code: u.code,
    activatedAt: u.activatedAt,
    licenseKey: u.status === "active" ? (u.licenseKey || null) : null
  };
}

function getByCode(code) {
  const c = String(code).trim().toUpperCase();
  const data = load();
  return Object.values(data).find(u => u.code === c) || null;
}

function countTrade(platformId, count) {
  const id = String(platformId).trim();
  const add = Math.max(1, Number(count || 1));
  const data = load();
  if (!data[id]) return { ok: false, status: "unknown" };

  const u = data[id];
  if (u.status === "active") return { ok: true, status: "active", tradesUsed: u.tradesUsed };
  if (u.status === "blocked") return { ok: false, status: "blocked" };

  u.tradesUsed += add;
  save(data);
  const expired = u.tradesUsed >= TRIAL_TRADES;
  return {
    ok: !expired,
    status: expired ? "expired" : "trial",
    tradesUsed: u.tradesUsed,
    tradesLimit: TRIAL_TRADES
  };
}

function activate(platformId, monoTxId, amountPaid) {
  const id = String(platformId).trim();
  const data = load();
  if (!data[id]) return false;
  data[id].status = "active";
  data[id].activatedAt = new Date().toISOString();
  if (monoTxId) data[id].monoTxId = monoTxId;
  if (amountPaid) data[id].amountPaid = amountPaid;
  // генерируем лицензионный ключ если ещё нет
  if (!data[id].licenseKey) {
    const usedKeys = new Set(Object.values(data).map(u => u.licenseKey).filter(Boolean));
    let key;
    do { key = generateLicenseKey(); } while (usedKeys.has(key));
    data[id].licenseKey = key;
  }
  // привязываем ключ к текущему устройству
  if (!data[id].boundDeviceId) data[id].boundDeviceId = id;
  save(data);
  return true;
}

// Войти по лицензионному ключу с нового устройства
function loginByKey(key, deviceId) {
  const k = String(key || "").trim().toUpperCase();
  const did = String(deviceId || "").trim();
  if (!k || !did) return { ok: false, error: "missing_params" };

  const data = load();
  const user = Object.values(data).find(u => u.licenseKey === k);
  if (!user) return { ok: false, error: "key_not_found" };
  if (user.status !== "active") return { ok: false, error: "not_active" };

  // Ключ ещё не привязан или это то же устройство
  if (!user.boundDeviceId || user.boundDeviceId === did) {
    user.boundDeviceId = did;
    save(data);
    return { ok: true, platformId: user.platformId, licenseKey: user.licenseKey, ...getStatus(user.platformId) };
  }

  // Ключ привязан к другому устройству
  return { ok: false, error: "key_bound" };
}

// Сброс привязки ключа (только через admin)
function rebindKey(key) {
  const k = String(key || "").trim().toUpperCase();
  const data = load();
  const user = Object.values(data).find(u => u.licenseKey === k);
  if (!user) return false;
  user.boundDeviceId = null;
  save(data);
  return true;
}

function setStatus(platformId, status) {
  const id = String(platformId).trim();
  const data = load();
  if (!data[id]) return false;
  data[id].status = status;
  save(data);
  return true;
}

function resetTrial(platformId) {
  const id = String(platformId).trim();
  const data = load();
  if (!data[id]) return false;
  data[id].status = "trial";
  data[id].tradesUsed = 0;
  save(data);
  return true;
}

function listAll() {
  return Object.values(load()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

module.exports = { getOrCreate, getStatus, getByCode, countTrade, activate, loginByKey, rebindKey, setStatus, resetTrial, listAll, TRIAL_TRADES };
