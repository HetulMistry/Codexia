import express from "express";
import http from "http";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Server } from "socket.io";

import type { Request, Response } from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve static files

const server = http.createServer(app);

const ioSocket = new Server(server, {
  cors: {
    origin: "*",
  },
  pingTimeout: 600000,
});

let userMap = [];

ioSocket.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("joinRoom", (roomId: string) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on("disconnect", () => {
    console.log("A user disconnected:", socket.id);
  });
});

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
