type User = {
  username: string;
  roomId: string;
  status: UserConnectionStatus;
  cursorPosition: number;
  typing: boolean;
  sockedId: string;
  currentFile: string | null;
};

enum UserConnectionStatus {
  Online = "online",
  Offline = "offline",
}

export { User, UserConnectionStatus };
