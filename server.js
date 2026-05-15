import express from "express";
import { chromium } from "playwright";

const app = express();

app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.SCREENSHOT_API_KEY || "";

function requireAuth(req, res, next) {
  const provided = req.headers["x-api-key"];

  if (!API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "SCREENSHOT_API_KEY is not configured"
    });
  }

  if (provided !== API_KEY) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized"
    });
  }

  next();
}

function isAllowedUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();

    if (!["http:", "https:"].includes(url.protocol)) return false;

    // Keep this strict. We only need Vercel/Railway/customer preview URLs.
    const allowedHosts = [
      "vercel.app",
      "railway.app",
      "spencerconsulting.co"
    ];

    return allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith("." + allowed));
  } catch {
    return false;
  }
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

app.post("/screenshot", requireAuth, async (req, res) => {
  const {
    url,
    width = 1440,
    height = 1100,
    fullPage = true,
    waitUntil = "networkidle",
    timeoutMs = 45000
  } = req.body || {};

  if (!url || !isAllowedUrl(url)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid or unsupported URL"
    });
  }

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage({
      viewport: {
        width: Number(width),
        height: Number(height)
      },
      deviceScaleFactor: 1
    });

    await page.goto(url, {
      waitUntil,
      timeout: Number(timeoutMs)
    });

    // Let animations/fonts settle.
    await page.waitForTimeout(1500);

    const buffer = await page.screenshot({
      type: "png",
      fullPage: Boolean(fullPage)
    });

    return res.json({
      ok: true,
      url,
      width: Number(width),
      height: Number(height),
      fullPage: Boolean(fullPage),
      screenshot: buffer.toString("base64")
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Screenshot failed"
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Screenshot service listening on ${PORT}`);
});