// 로컬 개발용 서버. Vercel 배포에는 쓰이지 않는다 (api/fees.js가 대신 쓰임).
// 인증키는 .env 파일에서만 읽고, 프론트엔드로는 절대 내려보내지 않는다.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { fetchAllFees } = require("./lib/fetchFees");

function loadEnv(envPath) {
  const env = {};
  if (!fs.existsSync(envPath)) return env;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const envVars = loadEnv(path.join(__dirname, ".env"));
const SERVICE_KEY = envVars.DATA_GO_KR_SERVICE_KEY || process.env.DATA_GO_KR_SERVICE_KEY;

const INDEX_FILE = path.join(__dirname, "index.html");

let cache = { at: 0, data: null };
const CACHE_TTL_MS = 60 * 60 * 1000;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/fees") {
    try {
      const now = Date.now();
      if (!cache.data || now - cache.at >= CACHE_TTL_MS) {
        cache = { at: now, data: await fetchAllFees(SERVICE_KEY) };
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(cache.data));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (url.pathname !== "/" && url.pathname !== "/index.html") {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  fs.readFile(INDEX_FILE, (err, content) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("index.html을 읽을 수 없습니다.");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});
