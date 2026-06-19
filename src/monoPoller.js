const https = require("https");
const licenseStore = require("./licenseStore");

let lastCheckedSec = Math.floor(Date.now() / 1000) - 600; // start from 10 min ago

function monoGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.monobank.ua",
        path,
        method: "GET",
        headers: { "X-Token": process.env.MONO_TOKEN }
      },
      res => {
        let body = "";
        res.on("data", chunk => (body += chunk));
        res.on("end", () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
          catch (_) { resolve({ status: res.statusCode, data: body }); }
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function poll() {
  const token = process.env.MONO_TOKEN;
  const jarId = process.env.MONO_JAR_ID;
  if (!token || !jarId) return;

  try {
    const now = Math.floor(Date.now() / 1000);
    const { status, data } = await monoGet(
      `/personal/statement/${jarId}/${lastCheckedSec}/${now}`
    );

    if (status === 429) {
      console.warn("[mono] Rate limit hit — skip poll");
      return;
    }
    if (status !== 200 || !Array.isArray(data)) {
      console.warn("[mono] Bad response:", status, JSON.stringify(data).slice(0, 120));
      return;
    }

    lastCheckedSec = now;

    for (const tx of data) {
      if (tx.amount <= 0) continue; // only incoming payments

      const comment = (tx.comment || "").trim().toUpperCase();
      if (!comment.startsWith("SAN-")) continue;

      const user = licenseStore.getByCode(comment);
      if (!user) {
        console.warn(`[mono] Code not found: ${comment} (tx ${tx.id})`);
        continue;
      }
      if (user.status === "active") continue; // already active

      licenseStore.activate(user.platformId, tx.id, tx.amount);
      console.log(`✅ [mono] User activated: ${user.platformId} | code: ${comment} | ${tx.amount / 100} UAH | tx: ${tx.id}`);
    }
  } catch (err) {
    console.error("[mono] Poll error:", err.message);
  }
}

function start() {
  const token = process.env.MONO_TOKEN;
  const jarId = process.env.MONO_JAR_ID;

  if (!token || !jarId) {
    console.warn("[mono] MONO_TOKEN or MONO_JAR_ID not set — auto-activation disabled");
    return;
  }

  console.log("[mono] Polling Monobank every 62s for payments...");
  poll();
  setInterval(poll, 62_000); // 62s to stay within Monobank rate limits
}

module.exports = { start, poll };
