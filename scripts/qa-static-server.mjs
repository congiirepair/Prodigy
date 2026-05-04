import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const rootDir = resolve(process.cwd());
const port = Number.parseInt(process.argv[2] || process.env.PORT || "5000", 10) || 5000;

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);

function resolveRequestPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath.split("?")[0] || "/");
  const requested = normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  const absolutePath = resolve(join(rootDir, requested));
  if (!absolutePath.startsWith(rootDir)) return join(rootDir, "index.html");
  if (existsSync(absolutePath) && statSync(absolutePath).isFile()) return absolutePath;
  return join(rootDir, "index.html");
}

const server = createServer((request, response) => {
  const filePath = resolveRequestPath(request.url || "/");
  const extension = extname(filePath).toLowerCase();
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", mimeTypes.get(extension) || "application/octet-stream");
  createReadStream(filePath)
    .on("error", () => {
      response.statusCode = 404;
      response.end("Not found");
    })
    .pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`QA static server running at http://127.0.0.1:${port}`);
});
