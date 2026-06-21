import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const PORT = process.env.PORT || 8787;

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
}

function json(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

async function handleSync(req, res, syncId) {
  if (!syncId || !/^[\w-]+$/.test(syncId)) {
    return json(res, 400, { error: "Invalid sync ID" });
  }

  const filePath = join(DATA_DIR, `${syncId}.json`);

  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method === "GET") {
    try {
      const raw = await readFile(filePath, "utf8");
      const data = JSON.parse(raw);
      return json(res, 200, data);
    } catch {
      return json(res, 200, { report: null, updatedAt: null });
    }
  }

  if (req.method === "POST") {
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const parsed = JSON.parse(body);
      const payload = {
        report: parsed.report || parsed,
        updatedAt: new Date().toISOString(),
      };
      await writeFile(filePath, JSON.stringify(payload, null, 2));
      return json(res, 200, { ok: true, updatedAt: payload.updatedAt });
    } catch {
      return json(res, 400, { error: "Invalid JSON body" });
    }
  }

  json(res, 405, { error: "Method not allowed" });
}

const server = createServer(async (req, res) => {
  await ensureDataDir();
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/api/health") {
    return json(res, 200, { ok: true });
  }

  const syncMatch = url.pathname.match(/^\/api\/sync\/([\w-]+)$/);
  if (syncMatch) {
    return handleSync(req, res, syncMatch[1]);
  }

  json(res, 404, { error: "Not found" });
});

server.listen(PORT, () => {
  console.log(`ScrollMap sync server on http://localhost:${PORT}`);
});
