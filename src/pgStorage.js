// Persistent key-value storage over PostgreSQL (Supabase).
// Replaces JSON-file storage.js when STORAGE_MODE=postgres.
// All reads are synchronous (from in-memory cache).
// All writes are synchronous for callers, async flush to PostgreSQL.

let pool = null;
const cache = {};

function initPool() {
  if (pool) return;
  const { Pool } = require("pg");
  const sslEnabled = String(process.env.PGSSL || "true").toLowerCase() !== "false";
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslEnabled ? { rejectUnauthorized: false } : false,
    max: 3,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  pool.on("error", (err) => {
    console.warn("[pgStorage] pool error:", err.message);
  });
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS kv_store (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

// Called once at server startup — loads all keys from PostgreSQL into memory.
async function loadAll() {
  try {
    initPool();
    await ensureTable();
    const { rows } = await pool.query("SELECT key, value FROM kv_store");
    for (const row of rows) {
      cache[row.key] = row.value;
    }
    console.log(`[pgStorage] Loaded ${rows.length} keys from PostgreSQL`);
  } catch (err) {
    console.error("[pgStorage] loadAll error:", err.message);
  }
}

function readJson(name, fallback) {
  return cache[name] !== undefined ? cache[name] : fallback;
}

function writeJson(name, data) {
  cache[name] = data;
  if (!pool) return;
  pool.query(
    `INSERT INTO kv_store (key, value, updated_at)
     VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW()`,
    [name, JSON.stringify(data)]
  ).catch((err) => console.warn("[pgStorage] write error:", err.message));
}

function appendJsonl(name, row) {
  const existing = Array.isArray(cache[name]) ? cache[name] : [];
  existing.push(row);
  writeJson(name, existing);
}

module.exports = { loadAll, readJson, writeJson, appendJsonl };
