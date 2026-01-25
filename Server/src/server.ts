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

const appServer = express();

const PORT = process.env.PORT || 3000;

appServer.use(express.json());
appServer.use(express.static(path.join(__dirname, "public"))); // Serve static files

const httpServer = http.createServer(appServer);

const socketServer = new Server(httpServer, {
  cors: {
    origin: "*",
  },
  pingTimeout: 600000,
});

let userList: User[] = [];

const fetchUsersByRoomId = (roomId: string): User[] => {
  return userList.filter((user) => user.roomId == roomId);
};

const getUserBySocketId = (socketId: string): User | null => {
  const user = userList.find((user) => user.sockedId === socketId);

  if (!user) {
    console.error(`User with socketId: ${socketId} not found`);
    return null;
  }
  return user;
};

socketServer.on(SocketEvents.Connection, (socketClient) => {
  // User Action Events
  socketClient.on(SocketEvents.JoinRequest, ({ roomId, username }) => {
    console.log(`Username: ${username} join in room: ${roomId}`);
    // Check if username already exists in the room
    const usernameExist = fetchUsersByRoomId(roomId).filter(
      (currentUser) => currentUser.username === username,
    );
    if (usernameExist.length > 0) {
      socketServer.to(socketClient.id).emit(SocketEvents.UsernameExists);
      return;
    }

    // Add user to the user list
    const currentUser: User = {
      username,
      roomId,
      status: UserConnectionStatus.Online,
      cursorPosition: 0,
      typing: false,
      sockedId: socketClient.id,
      currentFile: null,
    };
    userList.push(currentUser);

    // Notify others in the room about the new user
    socketClient.join(roomId);
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserJoined, { user: currentUser });

    // Send join accepted event to the current user with active users in the room
    const activeRoomUsers = fetchUsersByRoomId(roomId);
    socketServer.to(socketClient.id).emit(SocketEvents.JoinAccepted, {
      currentUser,
      activeRoomUsers,
    });

    console.log(
      `User ${currentUser.username} (${currentUser.sockedId})joined the room ${roomId} along with ${activeRoomUsers.length} active users.`,
    );
  });

  socketClient.on(SocketEvents.Disconnect, () => {
    // Handle user disconnection
    const user = getUserBySocketId(socketClient.id);
    if (!user) return;
    const roomId = user.roomId;

    // Notify others in the room about the user disconnection
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserDisconnected, { user });

    // Remove user from the user list
    userList = userList.filter((user) => user.sockedId !== socketClient.id);
    socketClient.leave(roomId);

    console.log(`Socket disconnected: ${socketClient.id}`);
  });

  //   File Handling Events
});

appServer.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

httpServer.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
