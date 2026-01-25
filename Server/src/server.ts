import express from "express";
import http from "http";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Server } from "socket.io";

import type { Request, Response } from "express";
import SocketEvents from "./types/Socket.ts";
import { User, UserConnectionStatus } from "./types/User.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // Serve static files

const server = http.createServer(app);

const SocketServer = new Server(server, {
  cors: {
    origin: "*",
  },
  pingTimeout: 600000,
});

let userList: User[] = [];

function fetchUsersByRoomId(roomId: string): User[] {
  return userList.filter((user) => user.roomId == roomId);
}

SocketServer.on(SocketEvents.Connection, (socket) => {
  socket.on(SocketEvents.JoinRequest, ({ roomId, username }) => {
    console.log(`Username: ${username} join in room: ${roomId}`);
    const usernameExist = fetchUsersByRoomId(roomId).filter(
      (u) => u.username === username,
    );

    if (usernameExist.length > 0) {
      SocketServer.to(socket.id).emit(SocketEvents.UsernameExists);
      return;
    }

    const currentUser: User = {
      username,
      roomId,
      status: UserConnectionStatus.Online,
      cursorPosition: 0,
      typing: false,
      sockedId: socket.id,
      currentFile: null,
    };

    userList.push(currentUser);
    socket.join(roomId);
    socket.broadcast
      .to(roomId)
      .emit(SocketEvents.UserJoined, { user: currentUser });

    const activeRoomUsers = fetchUsersByRoomId(roomId);
    SocketServer.to(socket.id).emit(SocketEvents.JoinAccepted, {
      currentUser,
      activeRoomUsers,
    });
  });
});

app.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

server.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
