const http = require("http");
const fs = require("fs");
const path = require("path");

const port = Number(process.env.PORT || 5192);
const root = path.resolve(__dirname, "..");
const entry = "/mockups/dim-recepcion-preview.html";
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || "/").split("?")[0]);
  if (url === "/") url = entry;
  const file = path.normalize(path.join(root, url.replace(/^\//, "")));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Cache-Control": "no-store" });
    res.end("Not found: " + url);
    return;
  }
  res.writeHead(200, {
    "Content-Type": mime[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store, max-age=0",
  });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log("READY http://127.0.0.1:" + port + entry);
});
