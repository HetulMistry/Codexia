import express from "express";
import http from "http";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import type { Request, Response } from "express";

const app = express();

const PORT = 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve static files

const server = http.createServer(app);

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
