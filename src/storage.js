const fs = require("fs");
const path = require("path");
const CONFIG = require("./config");

const USE_PG = String(process.env.STORAGE_MODE || "file").toLowerCase() === "postgres"
  && !!process.env.DATABASE_URL;

// ── File storage (default / local dev) ────────────────────────────────────
const dataDir = path.join(process.cwd(), CONFIG.storage.dataDir);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

function filePath(name) { return path.join(dataDir, name); }
function readJsonFile(name, fallback) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return fallback;
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch (err) { console.warn(`[storage] cannot read ${name}:`, err.message); return fallback; }
}
function writeJsonFile(name, data) {
  const p = filePath(name); const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmp, p);
}
function appendJsonlFile(name, row) {
  fs.appendFileSync(filePath(name), JSON.stringify(row) + "\n", "utf8");
}

// ── PostgreSQL storage (production) ───────────────────────────────────────
const pg = USE_PG ? require("./pgStorage") : null;

function readJson(name, fallback)  { return pg ? pg.readJson(name, fallback)  : readJsonFile(name, fallback); }
function writeJson(name, data)     { pg ? pg.writeJson(name, data)    : writeJsonFile(name, data); }
function appendJsonl(name, row)    { pg ? pg.appendJsonl(name, row)   : appendJsonlFile(name, row); }

module.exports = { readJson, writeJson, appendJsonl };
