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

// Express App Setup
const appServer = express();

const PORT = process.env.PORT || 3000;

// Middleware
appServer.use(express.json());
appServer.use(express.static(path.join(__dirname, "public"))); // Serve static files

// HTTP Server and Socket.io Setup
const httpServer = http.createServer(appServer);

const socketServer = new Server(httpServer, {
  cors: {
    origin: "*",
  },
  pingTimeout: 600000,
});

// In-memory user list
let userList: User[] = [];

// Helper Functions
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

const fetchRoomIdForSocket = (socketId: string): string | null => {
  const roomId = userList.find((user) => user.sockedId === socketId)?.roomId;

  // Check if roomId exists
  if (!roomId) {
    console.error(`RoomId for socketId: ${socketId} not found`);
    return null;
  }
  return roomId;
};

// Socket.io Event Handling
socketServer.on(SocketEvents.Connection, (socketClient) => {
  //* User Action Events *//
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

  //* Core Events Handling *//
  // Directory and Structure Sync Events
  socketClient.on(
    SocketEvents.SyncStructure,
    ({ fileStructure, openedFile, activeFile, socketId }) => {
      // Send updated file structure to the specified socket
      socketServer.to(socketId).emit(SocketEvents.SyncStructure, {
        fileStructure,
        openedFile,
        activeFile,
      });
    },
  );

  socketClient.on(
    SocketEvents.DirectoryUpdated,
    ({ directoryId, children }) => {
      const roomId = fetchRoomIdForSocket(socketClient.id);

      if (!roomId) return;

      // Broadcast updated directory to other users in the room
      socketClient.broadcast
        .to(roomId)
        .emit(SocketEvents.DirectoryUpdated, { directoryId, children });
    },
  );

  socketClient.on(SocketEvents.DirectoryRename, ({ directoryId, newName }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) return;

    // Broadcast directory rename to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.DirectoryRename, { directoryId, newName });
  });

  socketClient.on(SocketEvents.DirectoryDelete, ({ directoryId }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) return;

    // Broadcast directory delete to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.DirectoryDelete, { directoryId });
  });

  // File Events Handling
  // TODO: Implement the handlers for these events
  socketClient.on(SocketEvents.FileCreated, () => {});
  socketClient.on(SocketEvents.FileUpdated, () => {});
  socketClient.on(SocketEvents.FileRenamed, () => {});
  socketClient.on(SocketEvents.FileDeleted, () => {});

  // User Activity Events
  // TODO: Implement the handlers for these events
  socketClient.on(SocketEvents.UserOffline, ({ clientSocketId }) => {
    userList = userList.map((user) => {
      if (user.sockedId == clientSocketId)
        return { ...user, status: UserConnectionStatus.Offline };
      return user;
    });

    const roomId = fetchRoomIdForSocket(clientSocketId);
    if (!roomId) return;

    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserOffline, { socketId: clientSocketId });
  });

  socketClient.on(SocketEvents.UserOnline, ({ clientSocketId }) => {
    userList = userList.map((user) => {
      if (user.sockedId == clientSocketId)
        return { ...user, status: UserConnectionStatus.Online };
      return user;
    });

    const roomId = fetchRoomIdForSocket(clientSocketId);
    if (!roomId) return;

    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserOnline, { socketId: clientSocketId });
  });

  socketClient.on(
    SocketEvents.UserTypingStart,
    ({ cursorPosition, selectionStart, selectionEnd }) => {
      userList = userList.map((user) => {
        if (user.sockedId == socketClient.id)
          return {
            ...user,
            typing: true,
            cursorPosition: cursorPosition,
            selectionStart,
            selectionEnd,
          };
        return user;
      });

      const sessionUser = getUserBySocketId(socketClient.id);
      if (!sessionUser) return;

      const roomId = sessionUser.roomId;
      socketClient.broadcast
        .to(roomId)
        .emit(SocketEvents.UserTypingStart, { sessionUser });
    },
  );

  socketClient.on(SocketEvents.UserTypingPause, () => {
    userList = userList.map((user) => {
      if (user.sockedId == socketClient.id) return { ...user, typing: false };
      return user;
    });

    const sessionUser = getUserBySocketId(socketClient.id);
    if (!sessionUser) return;

    const roomId = sessionUser.roomId;
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserTypingPause, { sessionUser });
  });

  socketClient.on(SocketEvents.UserCursorMove, () => {});
  socketClient.on(SocketEvents.UserSendMessage, () => {});
  socketClient.on(SocketEvents.UserRequestDrawing, () => {});
  socketClient.on(SocketEvents.UserDrawingUpdate, () => {});
  socketClient.on(SocketEvents.UserSyncData, () => {});
});

// Express Routes
appServer.get("/", (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
