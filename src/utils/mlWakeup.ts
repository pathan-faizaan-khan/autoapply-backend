/**
 * mlWakeup.ts — Render Free-Tier ML Backend Wake-Up Service
 *
 * The ML backend (FastAPI on Render free tier) spins down after 15 min
 * of inactivity. The Node.js backend is always alive (paid tier or kept
 * warm by traffic), so it's the ideal place to fire the wakeup ping.
 *
 * Strategy (mirrors chrome-extension/background.js):
 *  • On Node.js server start, send a lightweight fake POST to the ML
 *    /api/ml/fill-form endpoint so Render begins booting immediately.
 *  • Retry up to MAX_RETRIES times with RETRY_DELAY_MS between attempts.
 *  • Completely silent — only logs to console. No user-facing side-effects.
 */

// ─── Render-tuned constants ────────────────────────────────────────────────
const ML_BACKEND_URL = process.env.FASTAPI_URL
  ? process.env.FASTAPI_URL
    .replace('http://localhost:8001', 'https://autoapply-scraper-backend.onrender.com')
    .replace('http://127.0.0.1:8001', 'https://autoapply-scraper-backend.onrender.com')
  : 'https://autoapply-scraper-backend.onrender.com';

const HEALTH_ENDPOINT = `${ML_BACKEND_URL}/health`;
const RETRY_DELAY_MS = 30_000;  // 30 s — Render's typical cold-start window
const MAX_RETRIES = 3;       // Up to ~90 s total patience
const REQUEST_TIMEOUT = 55_000;  // 55 s per request

// ─── Internal helpers ──────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

// ─── Main wakeup function ──────────────────────────────────────────────────

export async function wakeUpMlBackend(): Promise<void> {
  console.log('[MLWakeup] 🚀 Pinging ML backend to warm up Render free-tier instance...');
  console.log(`[MLWakeup] Target: ${HEALTH_ENDPOINT}`);

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
        console.log(`[MLWakeup] ♨️  Retry ${attempt}/${MAX_RETRIES} — waiting ${RETRY_DELAY_MS / 1000}s...`);
        await sleep(RETRY_DELAY_MS);
      }

      const res = await pingWithTimeout(HEALTH_ENDPOINT, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        // no-store so Node's fetch cache doesn't short-circuit
      });

      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        console.log(`[MLWakeup] ✅ ML backend is awake (attempt ${attempt}). Status:`, body);
        return;
      }

      // 404 on /health? Try the actual endpoint as fallback ping
      if (res.status === 404) {
        console.warn('[MLWakeup] /health returned 404 — trying fill-form endpoint as fallback ping...');
        await pingWithTimeout(`${ML_BACKEND_URL}/api/ml/fill-form`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form_fields: [],
            form_html: '<form></form>',
            user_data: { _wakeup: true },
          }),
        }).catch(() => { }); // ignore response — we just need the dyno to wake
        console.log(`[MLWakeup] ✅ ML backend woken via fill-form ping (attempt ${attempt})`);
        return;
      }

      throw new Error(`HTTP ${res.status} ${res.statusText}`);

    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[MLWakeup] ⏳ Attempt ${attempt}/${MAX_RETRIES} failed: ${msg}`);
    }
  }

  // Non-fatal — just log. The ML backend will wake on first real request.
  console.error(
    `[MLWakeup] ❌ ML backend did not respond after ${MAX_RETRIES} attempts.`,
    'It will wake on the first real user request.',
    lastError instanceof Error ? lastError.message : lastError
  );
}
