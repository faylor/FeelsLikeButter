import "dotenv/config";
import express from "express";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import { getProvider } from "./providers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3001;

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
// Proxies https://www.swimmingresults.org/individualbest/?tiref=XXXXX
// Returns { name, times: { "50m Freestyle": "32.45", ... } }
app.get("/api/swim-results", async (req, res) => {
  const { tiref } = req.query;
  if (!tiref || !/^\d+$/.test(tiref)) {
    return res.status(400).json({ error: "Invalid tiref — must be a number." });
  }

  const url = `https://www.swimmingresults.org/individualbest/?tiref=${tiref}&mode=A`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-GB,en;q=0.9",
        "Referer":         "https://www.swimmingresults.org/",
        "Cache-Control":   "no-cache",
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Swim England returned ${response.status}. The site may be blocking requests or the tiref is invalid.` });
    }

    const html = await response.text();
    const parsed = parseSwimResults(html);

    if (!parsed.name) {
      return res.status(404).json({ error: "Swimmer not found. Check the tiref number." });
    }

    res.json(parsed);

  } catch (err) {
    console.error("[swim-results]", err.message);
    res.status(502).json({ error: "Could not reach Swim England. Try again shortly." });
  }
});

// -- Parse the swimmingresults.org HTML table ----------------------------------
function parseSwimResults(html) {
  // Extract swimmer name from heading
  const nameMatch = html.match(/Individual Best Times[^<]*for\s+<[^>]+>([^<]+)<\/[^>]+>/i)
    || html.match(/<h[12][^>]*>[^<]*for\s+([A-Z][A-Za-z\s\-']+)<\/h[12]>/i)
    || html.match(/tiref[^"]*"[^"]*"[^>]*>([A-Z][A-Za-z\s\-']+)</);

  const name = nameMatch ? nameMatch[1].trim() : null;

  // Map Swim England event names -> our app event names
  const EVENT_MAP = {
    "50 Freestyle":          "50m Freestyle",
    "100 Freestyle":         "100m Freestyle",
    "200 Freestyle":         "200m Freestyle",
    "400 Freestyle":         "400m Freestyle",
    "800 Freestyle":         "800m Freestyle",
    "1500 Freestyle":        "1500m Freestyle",
    "50 Backstroke":         "50m Backstroke",
    "100 Backstroke":        "100m Backstroke",
    "200 Backstroke":        "200m Backstroke",
    "50 Breaststroke":       "50m Breaststroke",
    "100 Breaststroke":      "100m Breaststroke",
    "200 Breaststroke":      "200m Breaststroke",
    "50 Butterfly":          "50m Butterfly",
    "100 Butterfly":         "100m Butterfly",
    "200 Butterfly":         "200m Butterfly",
    "200 IM":                "200m Individual Medley",
    "200 Individual Medley": "200m Individual Medley",
    "400 IM":                "400m Individual Medley",
    "400 Individual Medley": "400m Individual Medley",
  };

  const times = {};

  // Extract table rows -- look for <tr> containing event name and time
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1];
    const cells = [];
    let cellMatch;
    // Reset cellRegex for each row
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((cellMatch = cellRe.exec(rowHtml)) !== null) {
      // Strip inner HTML tags and decode entities
      const text = cellMatch[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .trim();
      cells.push(text);
    }

    if (cells.length < 2) continue;

    // cells[0] is usually the event name, cells[1] or [2] is the time
    // Time format: MM:SS.ss or SS.ss
    const eventName = cells[0];
    const mappedEvent = EVENT_MAP[eventName];
    if (!mappedEvent) continue;

    // Find a cell that looks like a swim time
    const timeCell = cells.find(c => /^\d{1,2}(:\d{2})?\.\d{2}$/.test(c.trim()));
    if (timeCell) {
      times[mappedEvent] = timeCell.trim();
    }
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
