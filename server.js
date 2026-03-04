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
const CLIP_ID_MIN = 1;
const CLIP_ID_MAX = 10;

const app = express();
const rootDir = __dirname;
const staticRoot = rootDir;

const allowedOrigins = Array.from(
  new Set(
    [
      ...String(process.env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      String(process.env.PUBLIC_ORIGIN || "").trim(),
      String(process.env.RENDER_EXTERNAL_URL || "").trim()
    ].filter(Boolean)
  )
);

const allowAllOriginsInDev = process.env.NODE_ENV !== "production" && allowedOrigins.length === 0;
const enforceOriginInProduction = process.env.NODE_ENV === "production";

function isSameHostOrigin(origin, hostHeader) {
  if (!origin || !hostHeader) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === hostHeader;
  } catch (_error) {
    return false;
  }
}

function isAllowedSocketOrigin(origin, hostHeader) {
  if (!origin) {
    return !enforceOriginInProduction;
  }

  if (allowAllOriginsInDev) {
    return true;
  }

  if (allowedOrigins.includes(origin)) {
    return true;
  }

  return isSameHostOrigin(origin, hostHeader);
}

const staticOptions = {
  dotfiles: "deny",
  index: false,
  setHeaders(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".mp4" || ext === ".webm") {
      res.setHeader("Cache-Control", "public, max-age=604800, immutable");
      return;
    }
    if (ext === ".js" || ext === ".css") {
      res.setHeader("Cache-Control", "public, max-age=300");
    }
  }
};


function sendUtf8File(res, filePath, contentType) {
  res.setHeader("Content-Type", `${contentType}; charset=utf-8`);
  res.sendFile(filePath);
}

app.get(["/", "/index.html", "/performance", "/performance/", "/performance/index.html"], (_req, res) => {
  sendUtf8File(res, path.join(staticRoot, "index.html"), "text/html");
});

app.get(["/app.js", "/performance/app.js"], (_req, res) => {
  sendUtf8File(res, path.join(staticRoot, "app.js"), "application/javascript");
});

app.get(["/style.css", "/performance/style.css"], (_req, res) => {
  sendUtf8File(res, path.join(staticRoot, "style.css"), "text/css");
});

app.get(["/asset-manifest.json", "/performance/asset-manifest.json"], (_req, res) => {
  sendUtf8File(res, path.join(staticRoot, "asset-manifest.json"), "application/json");
});

app.get(["/01.mp4", "/performance/01.mp4"], (_req, res) => {
  res.sendFile(path.join(staticRoot, "01.mp4"));
});

app.use("/assets", express.static(path.join(staticRoot, "assets"), staticOptions));
app.use("/WEBM", express.static(path.join(staticRoot, "WEBM"), staticOptions));
app.use("/performance/assets", express.static(path.join(staticRoot, "assets"), staticOptions));
app.use("/performance/WEBM", express.static(path.join(staticRoot, "WEBM"), staticOptions));

app.get(["/server.js", "/package.json", "/package-lock.json"], (_req, res) => {
  res.status(404).json({ code: "NOT_FOUND" });
});


app.get("/healthz", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

const server = http.createServer(app);
const io = new Server(server, {
  transports: ["websocket", "polling"],
  cors: {
    origin: true,
    credentials: true
  },
  allowRequest(req, callback) {
    const origin = String(req.headers.origin || "").trim();
    const hostHeader = String(req.headers.host || "").trim();
    if (isAllowedSocketOrigin(origin, hostHeader)) {
      callback(null, true);
      return;
    }
    callback("CORS_ORIGIN_DENIED", false);
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

function sanitizeHostIntent(raw) {
  if (raw === true) return true;
  const text = String(raw ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "host";
}

function sanitizeBooleanIntent(raw, fallback = false) {
  if (raw === true) return true;
  if (raw === false) return false;
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return Boolean(fallback);
  if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
  if (text === "0" || text === "false" || text === "no" || text === "off") return false;
  return Boolean(fallback);
}

function sanitizeClipId(raw, fallback = 0) {
  const clipId = Math.trunc(Number(raw));
  if (!Number.isFinite(clipId)) {
    return Math.trunc(Number(fallback)) || 0;
  }
  if (clipId < CLIP_ID_MIN || clipId > CLIP_ID_MAX) {
    return Math.trunc(Number(fallback)) || 0;
  }
  return clipId;
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
      by: null,
      activeClip: 0
    },
    doorOpen: true
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
    doorOpen: room.doorOpen,
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

function findHostCandidate(room) {
  for (const player of room.players.values()) {
    if (player && player.wantsHost) {
      return player.id;
    }
  }
  return null;
}

function ensureHost(room) {
  if (room.hostId && room.players.has(room.hostId)) return;
  assignHost(room, findHostCandidate(room));
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
  const nextRoomId = sanitizeRoomId(payload?.roomId);
  const prevRoomId = socketToRoom.get(socket.id);
  const switchingRooms = Boolean(prevRoomId && prevRoomId !== nextRoomId);
  const targetRoom = makeRoomIfNeeded(nextRoomId);

  // If moving to another room fails due capacity, keep the current room/session.
  if (switchingRooms && targetRoom.players.size >= MAX_ROOM_SIZE) {
    socket.emit("room:error", {
      code: "ROOM_FULL",
      message: "방 정원이 가득 찼습니다.",
      limit: MAX_ROOM_SIZE,
      roomId: nextRoomId
    });
    return;
  }

  leaveCurrentRoom(socket);

  const roomId = nextRoomId;
  const room = makeRoomIfNeeded(roomId);

  // Re-check after leave in case of race conditions.
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
    wantsHost: sanitizeHostIntent(payload?.isHost),
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
    ensureHost(room);
  }

  socket.emit("room:joined", {
    roomId,
    selfId: socket.id,
    hostId: room.hostId,
    showState: room.showState,
    doorOpen: room.doorOpen,
    players: Array.from(room.players.values()).map((p) => serializePlayer(p)),
    capacity: MAX_ROOM_SIZE,
    requestedRole: player.wantsHost ? "host" : "player",
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

function handlePerformerClip(socket, payload) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;

  if (room.hostId !== socket.id) {
    socket.emit("room:error", {
      code: "HOST_ONLY",
      message: "호스트만 클립을 제어할 수 있습니다.",
      ts: Date.now()
    });
    return;
  }

  const clipId = sanitizeClipId(payload?.clipId);
  if (!clipId) {
    socket.emit("room:error", {
      code: "INVALID_CLIP",
      message: "유효하지 않은 클립 번호입니다.",
      ts: Date.now()
    });
    return;
  }

  room.showState.activeClip = clipId;
  socket.to(room.key).emit("performer:clip", {
    roomId: room.roomId,
    hostId: room.hostId,
    clipId,
    startedAt: Date.now(),
    ts: Date.now()
  });
}
function handleDoorSet(socket, payload) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;

  if (room.hostId !== socket.id) {
    socket.emit("room:error", {
      code: "HOST_ONLY",
      message: "호스트만 문 상태를 변경할 수 있습니다.",
      ts: Date.now()
    });
    return;
  }

  const nextOpen = sanitizeBooleanIntent(payload?.open, room.doorOpen);
  if (room.doorOpen === nextOpen) {
    return;
  }

  room.doorOpen = nextOpen;
  io.to(room.key).emit("door:state", {
    roomId: room.roomId,
    hostId: room.hostId,
    open: room.doorOpen,
    by: socket.id,
    ts: Date.now()
  });
  emitSnapshot(room);
}
function handleShowStart(socket, payload) {
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

  const requestedClipId = sanitizeClipId(payload?.activeClip, room.showState.activeClip || 0);

  room.showState = {
    playing: true,
    startedAt: Date.now(),
    by: socket.id,
    activeClip: requestedClipId
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
    by: socket.id,
    activeClip: 0
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
  socket.on("show:start", (payload) => handleShowStart(socket, payload));
  socket.on("door:set", (payload) => handleDoorSet(socket, payload));
  socket.on("show:stop", () => handleShowStop(socket));
  socket.on("performer:clip", (payload) => handlePerformerClip(socket, payload));

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

