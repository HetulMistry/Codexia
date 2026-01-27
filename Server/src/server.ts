import express from "express";
import http from "http";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { Server } from "socket.io";

// ...existing code...
import SocketEvents from "./types/Socket.ts";
import { User, UserConnectionStatus } from "./types/User.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Express App Setup
const appServer = express();

const PORT = process.env.PORT || 3000;
if (!process.env.PORT) {
  console.warn(
    "Warning: PORT environment variable is not set. Using default port 3000.",
  );
}

// Middleware
appServer.use(express.json());
appServer.use(express.static(path.join(__dirname, "public"))); // Serve static files

// HTTP Server and Socket.io Setup
const httpServer = http.createServer(appServer);

// WARNING: 'origin: "*"' allows all origins. Restrict this in production to trusted domains only!
const socketServer = new Server(httpServer, {
  cors: {
    origin: "*", // TODO: Replace with production domain
  },
  pingTimeout: 600000,
});

// In-memory user list
//* NOTE: For production scalability, use a persistent store (e.g., Redis) instead of in-memory storage.
let userList: User[] = [];

// Helper Functions
const fetchUsersByRoomId = (roomId: string): User[] => {
  return userList.filter((user) => user.roomId == roomId);
};

const getUserBySocketId = (socketId: string): User | null => {
  // Find user by socketId
  const user = userList.find((user) => user.socketId === socketId);

  // Check if user exists
  if (!user) {
    console.error(`User with socketId: ${socketId} not found`);
    return null;
  }

  // Return the found user
  return user;
};

const fetchRoomIdForSocket = (socketId: string): string | null => {
  const roomId = userList.find((user) => user.socketId === socketId)?.roomId;

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
      // Notify the client that the username already exists
      socketServer.to(socketClient.id).emit(SocketEvents.UsernameExists);
      console.warn(
        `JoinRequest denied: Username '${username}' already exists in room '${roomId}'.`,
      );
      return;
    }

    // Add user to the user list
    const currentUser: User = {
      username,
      roomId,
      status: UserConnectionStatus.Online,
      cursorPosition: 0,
      typing: false,
      socketId: socketClient.id,
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
      `User ${currentUser.username} (${currentUser.socketId}) joined the room ${roomId} along with ${activeRoomUsers.length} active users.`,
    );
  });

  socketClient.on(SocketEvents.Disconnect, () => {
    // Handle user disconnection
    const user = getUserBySocketId(socketClient.id);

    if (!user) {
      console.warn(
        `Disconnect event: No user found for socketId ${socketClient.id}`,
      );
      return;
    }
    const roomId = user.roomId;

    // Notify others in the room about the user disconnection
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserDisconnected, { user });

    // Remove user from the user list
    userList = userList.filter((user) => user.socketId !== socketClient.id);
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

      if (!roomId) {
        console.warn(
          `DirectoryUpdated event: No roomId found for socketId ${socketClient.id}`,
        );
        return;
      }

      // Broadcast updated directory to other users in the room
      socketClient.broadcast
        .to(roomId)
        .emit(SocketEvents.DirectoryUpdated, { directoryId, children });
    },
  );

  socketClient.on(SocketEvents.DirectoryRename, ({ directoryId, newName }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `FileDeleted event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast directory rename to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.DirectoryRename, { directoryId, newName });
  });

  socketClient.on(SocketEvents.DirectoryDelete, ({ directoryId }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `UserOffline event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast directory delete to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.DirectoryDelete, { directoryId });
  });

  // File Events Handling
  socketClient.on(
    SocketEvents.FileCreated,
    ({ parentDirectoryId, newFile }) => {
      const roomId = fetchRoomIdForSocket(socketClient.id);

      if (!roomId) {
        console.warn(
          `FileCreated event: No roomId found for socketId ${socketClient.id}`,
        );
        return;
      }

      // Broadcast new file creation to other users in the room
      socketClient.broadcast
        .to(roomId)
        .emit(SocketEvents.FileCreated, { parentDirectoryId, newFile });
    },
  );

  socketClient.on(SocketEvents.FileUpdated, ({ fileId, newContent }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `FileUpdated event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast file update to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.FileUpdated, { fileId, newContent });
  });

  socketClient.on(SocketEvents.FileRenamed, ({ fileId, newName }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `FileRenamed event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast file rename to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.FileRenamed, { fileId, newName });
  });

  socketClient.on(SocketEvents.FileDeleted, ({ fileId }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `UserOnline event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast file deletion to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.FileDeleted, { fileId });
  });

  // User Activity Events
  socketClient.on(SocketEvents.UserOffline, ({ clientSocketId }) => {
    userList = userList.map((user) => {
      if (user.socketId == clientSocketId)
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
    // Update user status to online
    userList = userList.map((user) => {
      if (user.socketId == clientSocketId)
        return { ...user, status: UserConnectionStatus.Online };
      return user;
    });

    const roomId = fetchRoomIdForSocket(clientSocketId);
    if (!roomId) return;

    // Notify others in the room that the user is online
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserOnline, { socketId: clientSocketId });
  });

  socketClient.on(
    SocketEvents.UserTypingStart,
    ({ cursorPosition, selectionStart, selectionEnd }) => {
      // Update user typing status and cursor position
      userList = userList.map((user) => {
        if (user.socketId == socketClient.id)
          return {
            ...user,
            typing: true,
            cursorPosition: cursorPosition,
            selectionStart,
            selectionEnd,
          };
        return user;
      });

      // Notify others in the room that the user has started typing
      const sessionUser = getUserBySocketId(socketClient.id);
      if (!sessionUser) {
        console.warn(
          `UserTypingStart event: No user found for socketId ${socketClient.id}`,
        );
        return;
      }

      const roomId = sessionUser.roomId;

      // Broadcast typing start event
      socketClient.broadcast
        .to(roomId)
        .emit(SocketEvents.UserTypingStart, { sessionUser });
    },
  );

  socketClient.on(SocketEvents.UserTypingPause, () => {
    // Update user typing status
    userList = userList.map((user) => {
      if (user.socketId == socketClient.id) return { ...user, typing: false };
      return user;
    });

    // Notify others in the room that the user has paused typing
    const sessionUser = getUserBySocketId(socketClient.id);
    if (!sessionUser) {
      console.warn(
        `UserTypingPause event: No user found for socketId ${socketClient.id}`,
      );
      return;
    }

    const roomId = sessionUser.roomId;

    // Broadcast typing pause event
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserTypingPause, { sessionUser });
  });

  socketClient.on(
    SocketEvents.UserCursorMove,
    ({ cursorPosition, selectionStart, selectionEnd }) => {
      // Update user cursor position
      userList = userList.map((user) => {
        if (user.socketId == socketClient.id)
          return {
            ...user,
            cursorPosition,
            selectionStart,
            selectionEnd,
          };
        return user;
      });

      // Notify others in the room about the cursor movement
      const sessionUser = getUserBySocketId(socketClient.id);
      if (!sessionUser) {
        console.warn(
          `UserCursorMove event: No user found for socketId ${socketClient.id}`,
        );
        return;
      }

      const roomId = sessionUser.roomId;

      // Broadcast cursor move event
      socketClient.broadcast
        .to(roomId)
        .emit(SocketEvents.UserCursorMove, { sessionUser });
    },
  );

  socketClient.on(SocketEvents.UserSendMessage, ({ message }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `UserSendMessage event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast the message to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserReceiveMessage, { message });
  });

  socketClient.on(SocketEvents.UserRequestDrawing, () => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `UserRequestDrawing event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Notify others in the room that a drawing request has been made
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserRequestDrawing, { socketId: socketClient.id });
  });

  socketClient.on(SocketEvents.UserDrawingUpdate, ({ snapshot }) => {
    const roomId = fetchRoomIdForSocket(socketClient.id);

    if (!roomId) {
      console.warn(
        `UserDrawingUpdate event: No roomId found for socketId ${socketClient.id}`,
      );
      return;
    }

    // Broadcast drawing update to other users in the room
    socketClient.broadcast
      .to(roomId)
      .emit(SocketEvents.UserDrawingUpdate, { snapshot });
  });

  socketClient.on(SocketEvents.UserSyncDrawing, ({ drawingData, socketId }) => {
    // Send drawing data to the specified socket
    socketClient.broadcast
      .to(socketId)
      .emit(SocketEvents.UserSyncDrawing, { drawingData });
  });
});

// Express Routes
appServer.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

// Start the server
httpServer.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`);
});
