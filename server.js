import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getProvider } from "./providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;

// -- Supabase JWT verification -------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const JWKS = SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  : null;

async function requireAuth(req, res, next) {
  if (!JWKS) return res.status(503).json({ error: "Auth not configured on server." });
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing auth token." });
  }
  try {
    const token = header.slice(7);
    const { payload } = await jwtVerify(token, JWKS);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

app.use(express.json({ limit: "20mb" }));

// -- Serve built React client --------------------------------------------------
app.use(express.static(path.join(__dirname, "client/dist")));

// -- Unified AI proxy -- provider selected via PROVIDER env var -----------------
app.post("/api/messages", async (req, res) => {
  const provider = getProvider();
  console.log(`[provider] using: ${provider.name}`);
  try {
    const { text } = await provider.call(req.body);
    res.json({ content: [{ type: "text", text }] });
  } catch (err) {
    console.error(`[${provider.name}] error:`, err.message);
    res.status(502).json({ error: err.message });
  }
});

// -- Swim England individual best times scraper --------------------------------
// Uses Node 18 global fetch -- no import needed
app.get("/api/swim-results", async (req, res) => {
  // Log immediately on arrival -- before any try/catch
  console.log(`[swim-results] request received, tiref="${req.query.tiref}", ip=${req.ip}`);

  // Safety net: always return JSON, never leak HTML errors
  try {
    const { tiref } = req.query;

    if (!tiref || !/^\d+$/.test(tiref)) {
      console.log(`[swim-results] invalid tiref: "${tiref}"`);
      return res.status(400).json({ error: "Invalid tiref -- must be a number." });
    }

    const url = `https://www.swimmingresults.org/individualbest/personal_best.php?tiref=${tiref}&mode=A`;
    console.log(`[swim-results] fetching ${url}`);

    let response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent":      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
          "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
          "Referer":         "https://www.swimmingresults.org/",
        },
      });
    } catch (fetchErr) {
      console.error("[swim-results] fetch failed:", fetchErr.message);
      return res.status(502).json({ error: "Could not reach Swim England. Check connectivity." });
    }

    if (!response.ok) {
      console.error(`[swim-results] HTTP ${response.status}`);
      return res.status(502).json({
        error: `Swim England returned ${response.status}. The site may be blocking requests -- try entering times manually.`,
      });
    }

    const html = await response.text();
    console.log(`[swim-results] got ${html.length} bytes`);

    // Results appear BEFORE the search form -- log first 1200 chars to see structure
    const firstChunk = html.slice(0, 1200).replace(/\s+/g, " ");
    console.log(`[swim-results] HTML start: ${firstChunk}`);

    // Also log chars 14000-16500 (just before the search form) to catch results
    const preForm = html.slice(14000, 16200).replace(/\s+/g, " ");
    console.log(`[swim-results] pre-form HTML: ${preForm}`);

    const parsed = parseSwimResults(html);
    console.log(`[swim-results] name="${parsed.name}", ${Object.keys(parsed.times).length} times`);

    if (!parsed.name && Object.keys(parsed.times).length === 0) {
      return res.status(404).json({ error: "Swimmer not found. Double-check the tiref number." });
    }

    return res.json(parsed);

  } catch (err) {
    console.error("[swim-results] unexpected:", err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// -- Parse swimmingresults.org HTML -------------------------------------------
function parseSwimResults(html) {
  const nameMatch = html.match(/for\s+<[^>]*>([^<]+)<\/[^>]*>/i)
    || html.match(/Best Times for ([A-Z][A-Za-z\s'-]+)/i);
  const name = nameMatch ? nameMatch[1].trim() : null;

  const EVENT_MAP = {
    "50 Freestyle": "50m Freestyle",
    "100 Freestyle": "100m Freestyle",
    "200 Freestyle": "200m Freestyle",
    "400 Freestyle": "400m Freestyle",
    "800 Freestyle": "800m Freestyle",
    "1500 Freestyle": "1500m Freestyle",
    "50 Backstroke": "50m Backstroke",
    "100 Backstroke": "100m Backstroke",
    "200 Backstroke": "200m Backstroke",
    "50 Breaststroke": "50m Breaststroke",
    "100 Breaststroke": "100m Breaststroke",
    "200 Breaststroke": "200m Breaststroke",
    "50 Butterfly": "50m Butterfly",
    "100 Butterfly": "100m Butterfly",
    "200 Butterfly": "200m Butterfly",
    "200 IM": "200m Individual Medley",
    "200 Individual Medley": "200m Individual Medley",
    "400 IM": "400m Individual Medley",
    "400 Individual Medley": "400m Individual Medley",
  };

  const times = {};
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRe.exec(html)) !== null) {
    const cells = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .trim();
      cells.push(text);
    }
    if (cells.length < 2) continue;
    const mapped = EVENT_MAP[cells[0]];
    if (!mapped) continue;
    const timeCell = cells.find(c => /^\d{1,2}(:\d{2})?\.\d{2}$/.test(c));
    if (timeCell) times[mapped] = timeCell;
  }

  return { name, times };
}

// -- Health check --------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  const provider = getProvider();
  res.json({ status: "ok", provider: provider.name });
});

// -- Catch-all: serve React app ------------------------------------------------
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "client/dist/index.html"));
});

app.listen(PORT, () => {
  console.log(`Swim Analyzer running on port ${PORT} [provider: ${getProvider().name}]`);
});
