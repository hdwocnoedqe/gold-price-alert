import http from "node:http";
import { readFileSync } from "node:fs";
import { readFile as readFileAsync } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

loadLocalEnv();

const port = Number(process.env.PORT || 3000);
const goldApiKey = process.env.GOLDAPI_KEY;
const useMockPrice = process.env.USE_MOCK_PRICE === "1";
const requestTimeoutMs = 10_000;

let mockPrice = 2350;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  try {
    const content = readFileSync(envPath, "utf8");

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }

      const separator = trimmed.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const key = trimmed.slice(0, separator).trim();
      const value = trimmed.slice(separator + 1).trim();

      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  } catch {
    // Optional local environment file.
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("请求 GoldAPI 超时，请稍后重试。");
    }

    throw new Error("无法连接 GoldAPI，请检查网络或稍后重试。");
  } finally {
    clearTimeout(timeout);
  }
}

function createMockQuote() {
  const drift = (Math.random() - 0.48) * 6;
  mockPrice = Math.max(100, mockPrice + drift);

  return {
    symbol: "XAU/USD",
    price: Number(mockPrice.toFixed(2)),
    updatedAt: new Date().toISOString(),
    source: "mock",
  };
}

function normalizeGoldApiQuote(data) {
  const price = Number(data?.price);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("GoldAPI 没有返回有效金价。");
  }

  const timestamp = Number(data?.timestamp);
  const updatedAt = Number.isFinite(timestamp)
    ? new Date(timestamp * 1000).toISOString()
    : new Date().toISOString();

  return {
    symbol: "XAU/USD",
    price,
    updatedAt,
    source: "goldapi.io/XAU/USD",
  };
}

async function fetchGoldQuote() {
  if (useMockPrice) {
    return createMockQuote();
  }

  if (!goldApiKey) {
    throw new Error("缺少 GOLDAPI_KEY，请在 .env 中配置。");
  }

  const response = await fetchWithTimeout("https://www.goldapi.io/api/XAU/USD", {
    headers: {
      "x-access-token": goldApiKey,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  let data = {};

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("GoldAPI 返回内容无法读取。");
  }

  if (!response.ok) {
    const message = data?.error || data?.message || response.statusText;
    throw new Error(`GoldAPI 请求失败：${message}`);
  }

  return normalizeGoldApiQuote(data);
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const rawPath = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = path
    .normalize(decodeURIComponent(rawPath))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFileAsync(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
    });
    response.end(content);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.url?.startsWith("/api/price")) {
    try {
      const quote = await fetchGoldQuote();
      sendJson(response, 200, { ok: true, quote });
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        message: error instanceof Error ? error.message : "金价暂时不可用。",
      });
    }
    return;
  }

  await serveStatic(request, response);
});

server.listen(port, () => {
  console.log(`Gold price alert app is running at http://localhost:${port}`);
  if (useMockPrice) {
    console.log("Using mock prices because USE_MOCK_PRICE=1 is set.");
  }
});
