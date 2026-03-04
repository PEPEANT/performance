const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const MAX_ROOM_SIZE = 50;
const CHAT_MAX_LENGTH = 140;
const CHAT_MIN_INTERVAL_MS = 250;
const PLAYER_STATE_MIN_INTERVAL_MS = 50;
const SNAPSHOT_INTERVAL_MS = 100;

const app = express();
const rootDir = __dirname;

app.use(
  express.static(rootDir, {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".mp4" || ext === ".webm") {
        res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      }
    }
  })
);

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  transports: ["websocket", "polling"],
  cors: {
    origin: true,
    credentials: true
  }
});

const rooms = new Map();
const socketToRoom = new Map();

function sanitizeRoomId(raw) {
  const text = String(raw || "main").trim().toLowerCase();
  const safe = text.replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  return safe || "main";
}

function sanitizeName(raw) {
  const text = String(raw || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return `플레이어-${Math.floor(Math.random() * 9000 + 1000)}`;
  }
  return text.slice(0, 24);
}

function sanitizeMap(raw) {
  return raw === "hall" ? "hall" : "lobby";
}

function clampNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function makeRoomIfNeeded(roomId) {
  const current = rooms.get(roomId);
  if (current) return current;
  const room = {
    roomId,
    key: `performance:${roomId}`,
    hostId: null,
    players: new Map(),
    showState: {
      playing: false,
      startedAt: 0,
      by: null
    }
  };
  rooms.set(roomId, room);
  return room;
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    map: player.map,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    ts: player.ts,
    isHost: player.id === player.room.hostId
  };
}

function buildSnapshot(room) {
  return {
    roomId: room.roomId,
    hostId: room.hostId,
    showState: room.showState,
    players: Array.from(room.players.values()).map((p) => serializePlayer(p)),
    serverNow: Date.now()
  };
}

function emitSnapshot(room) {
  io.to(room.key).emit("room:snapshot", buildSnapshot(room));
}

function assignHost(room, nextHostId) {
  room.hostId = nextHostId || null;
  io.to(room.key).emit("host:update", { roomId: room.roomId, hostId: room.hostId, ts: Date.now() });
}

function ensureHost(room) {
  if (room.hostId && room.players.has(room.hostId)) return;
  const firstPlayer = room.players.values().next();
  assignHost(room, firstPlayer.done ? null : firstPlayer.value.id);
}

function leaveCurrentRoom(socket) {
  const prevRoomId = socketToRoom.get(socket.id);
  if (!prevRoomId) return;

  const room = rooms.get(prevRoomId);
  socketToRoom.delete(socket.id);
  if (!room) return;

  const existed = room.players.delete(socket.id);
  socket.leave(room.key);

  if (!existed) return;

  if (room.players.size === 0) {
    rooms.delete(prevRoomId);
    return;
  }

  if (room.hostId === socket.id) {
    ensureHost(room);
  }

  io.to(room.key).emit("player:left", {
    roomId: room.roomId,
    id: socket.id,
    ts: Date.now()
  });

  emitSnapshot(room);
}

function handleJoin(socket, payload) {
  leaveCurrentRoom(socket);

  const roomId = sanitizeRoomId(payload?.roomId);
  const room = makeRoomIfNeeded(roomId);

  if (room.players.size >= MAX_ROOM_SIZE) {
    socket.emit("room:error", {
      code: "ROOM_FULL",
      message: "방 정원이 가득 찼습니다.",
      limit: MAX_ROOM_SIZE,
      roomId
    });
    return;
  }

  const player = {
    id: socket.id,
    room,
    name: sanitizeName(payload?.name),
    map: sanitizeMap(payload?.map),
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    ts: Date.now(),
    lastStateAt: 0,
    lastChatAt: 0
  };

  room.players.set(socket.id, player);
  socketToRoom.set(socket.id, roomId);
  socket.join(room.key);

  if (!room.hostId || !room.players.has(room.hostId)) {
    assignHost(room, socket.id);
  }

  socket.emit("room:joined", {
    roomId,
    selfId: socket.id,
    hostId: room.hostId,
    showState: room.showState,
    players: Array.from(room.players.values()).map((p) => serializePlayer(p)),
    capacity: MAX_ROOM_SIZE,
    serverNow: Date.now()
  });

  io.to(room.key).emit("chat:recv", {
    id: `sys-${Date.now()}`,
    senderId: "system",
    senderName: "시스템",
    text: `${player.name}님이 입장했습니다.`,
    ts: Date.now()
  });

  emitSnapshot(room);
}

function handlePlayerState(socket, payload) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!player) return;

  const now = Date.now();
  if (now - player.lastStateAt < PLAYER_STATE_MIN_INTERVAL_MS) {
    return;
  }

  player.lastStateAt = now;
  player.map = sanitizeMap(payload?.map);
  player.x = round3(clampNumber(payload?.x, -9999, 9999));
  player.y = round3(clampNumber(payload?.y, -9999, 9999));
  player.z = round3(clampNumber(payload?.z, -9999, 9999));
  player.yaw = round3(clampNumber(payload?.yaw, -Math.PI * 8, Math.PI * 8));
  player.pitch = round3(clampNumber(payload?.pitch, -Math.PI, Math.PI));
  player.ts = now;
}

function sanitizeChatText(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAT_MAX_LENGTH);
}

function handleChatSend(socket, payload) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!player) return;

  const now = Date.now();
  if (now - player.lastChatAt < CHAT_MIN_INTERVAL_MS) {
    socket.emit("room:error", {
      code: "CHAT_RATE_LIMIT",
      message: "메시지 전송이 너무 빠릅니다.",
      ts: now
    });
    return;
  }

  const text = sanitizeChatText(payload?.text);
  if (!text) return;

  player.lastChatAt = now;
  io.to(room.key).emit("chat:recv", {
    id: `${now}-${Math.floor(Math.random() * 100000)}`,
    senderId: player.id,
    senderName: player.name,
    text,
    ts: now
  });
}

function handleShowStart(socket) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;

  if (room.hostId !== socket.id) {
    socket.emit("room:error", {
      code: "HOST_ONLY",
      message: "호스트만 공연을 시작할 수 있습니다.",
      ts: Date.now()
    });
    return;
  }

  room.showState = {
    playing: true,
    startedAt: Date.now(),
    by: socket.id
  };

  io.to(room.key).emit("show:state", {
    roomId: room.roomId,
    hostId: room.hostId,
    ...room.showState
  });
}

function handleShowStop(socket) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;

  if (room.hostId !== socket.id) {
    socket.emit("room:error", {
      code: "HOST_ONLY",
      message: "호스트만 공연을 중지할 수 있습니다.",
      ts: Date.now()
    });
    return;
  }

  room.showState = {
    playing: false,
    startedAt: 0,
    by: socket.id
  };

  io.to(room.key).emit("show:state", {
    roomId: room.roomId,
    hostId: room.hostId,
    ...room.showState
  });
}

io.on("connection", (socket) => {
  socket.on("room:join", (payload) => handleJoin(socket, payload));
  socket.on("room:leave", () => leaveCurrentRoom(socket));
  socket.on("player:state", (payload) => handlePlayerState(socket, payload));
  socket.on("chat:send", (payload) => handleChatSend(socket, payload));
  socket.on("show:start", () => handleShowStart(socket));
  socket.on("show:stop", () => handleShowStop(socket));

  socket.on("disconnect", () => {
    leaveCurrentRoom(socket);
  });
});

setInterval(() => {
  rooms.forEach((room) => {
    if (room.players.size === 0) return;
    emitSnapshot(room);
  });
}, SNAPSHOT_INTERVAL_MS);

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`performance server listening on :${PORT}`);
});
