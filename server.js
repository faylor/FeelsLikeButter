import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "20mb" }));

// ── Serve built React client ──────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, "client/dist")));

// ── Anthropic API proxy — key never exposed to browser ───────────────────────
app.post("/api/messages", async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: "ANTHROPIC_API_KEY not configured on server." });
          }

            try {
                const response = await fetch("https://api.anthropic.com/v1/messages", {
                      method: "POST",
                            headers: {
                                    "Content-Type": "application/json",
                                            "x-api-key": apiKey,
                                                    "anthropic-version": "2023-06-01",
                                                          },
                                                                body: JSON.stringify(req.body),
                                                                    });

                                                                        const data = await response.json();

                                                                            if (!response.ok) {
                                                                                  return res.status(response.status).json(data);
                                                                                      }

                                                                                          res.json(data);
                                                                                            } catch (err) {
                                                                                                console.error("Proxy error:", err);
                                                                                                    res.status(502).json({ error: "Failed to reach Anthropic API." });
                                                                                                      }
                                                                                                      });

                                                                                                      // ── Catch-all: serve React app for any unknown route ─────────────────────────
                                                                                                      app.get("*", (req, res) => {
                                                                                                        res.sendFile(path.join(__dirname, "client/dist/index.html"));
                                                                                                        });

                                                                                                        app.listen(PORT, () => {
                                                                                                          console.log(`Swim Analyzer running on port ${PORT}`);
                                                                                                          });
                                                                                                          