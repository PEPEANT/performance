const path = require("path");
const http = require("http");
const fs = require("fs");
const express = require("express");
const { Server } = require("socket.io");

const PORT = Number(process.env.PORT || 3000);
const MAX_ROOM_SIZE = 50;
const CHAT_MAX_LENGTH = 140;
const CHAT_MIN_INTERVAL_MS = 250;
const PLAYER_STATE_MIN_INTERVAL_MS = 50;
const SNAPSHOT_INTERVAL_MS = 100;
const CLIP_ID_MIN = 1;
const CLIP_ID_MAX = 11;
const LOBBY_POSTER_MAX_DATA_URL_LENGTH = 2_800_000;
const SPECIAL_PERFORMER_ACTION_IDS = new Set(["walk_in", "idle_hold", "greet", "walk_out", "hide"]);

const app = express();
const rootDir = __dirname;
const staticRoot = rootDir;
const posterStorePath = path.join(rootDir, "data", "lobby-posters.json");

function sanitizePosterDataUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.length > LOBBY_POSTER_MAX_DATA_URL_LENGTH) return "";
  if (!/^data:image\/(?:png|jpeg);base64,[a-z0-9+/=]+$/i.test(value)) return "";
  return value;
}

function sanitizePosterState(raw) {
  if (!raw || typeof raw !== "object") return null;
  const dataUrl = sanitizePosterDataUrl(raw.dataUrl);
  if (!dataUrl) return null;
  return {
    dataUrl,
    updatedAt: Number.isFinite(Number(raw.updatedAt)) ? Number(raw.updatedAt) : 0,
    by: raw.by ? String(raw.by) : null
  };
}

function loadPosterStore() {
  try {
    if (!fs.existsSync(posterStorePath)) return {};
    const parsed = JSON.parse(fs.readFileSync(posterStorePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return {};

    const normalized = {};
    Object.entries(parsed).forEach(([roomId, state]) => {
      const safeRoomId = sanitizeRoomId(roomId);
      const safeState = sanitizePosterState(state);
      if (safeRoomId && safeState) {
        normalized[safeRoomId] = safeState;
      }
    });
    return normalized;
  } catch (_error) {
    return {};
  }
}

function persistPosterStore(store) {
  try {
    fs.mkdirSync(path.dirname(posterStorePath), { recursive: true });
    fs.writeFileSync(posterStorePath, JSON.stringify(store, null, 2), "utf8");
  } catch (_error) {
    // best-effort persistence
  }
}

const lobbyPosterStore = loadPosterStore();

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

app.get(["/01.mobile.mp4", "/performance/01.mobile.mp4"], (_req, res) => {
  res.sendFile(path.join(staticRoot, "01.mobile.mp4"));
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
  maxHttpBufferSize: 6 * 1024 * 1024,
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

function clipActionId(clipId) {
  const safeClipId = sanitizeClipId(clipId, 0);
  return safeClipId ? `clip:${safeClipId}` : "";
}

function clipIdFromActionId(actionId) {
  const text = String(actionId || "").trim().toLowerCase();
  if (!text.startsWith("clip:")) return 0;
  return sanitizeClipId(text.slice(5), 0);
}

function sanitizePerformerActionId(raw, fallback = "") {
  const fallbackText = String(fallback || "").trim().toLowerCase();
  const fallbackClip = sanitizeClipId(fallbackText, 0);
  const fallbackActionFromClip = fallbackClip ? clipActionId(fallbackClip) : "";
  const fallbackActionFromText = SPECIAL_PERFORMER_ACTION_IDS.has(fallbackText)
    ? fallbackText
    : clipIdFromActionId(fallbackText)
      ? clipActionId(clipIdFromActionId(fallbackText))
      : "";
  const resolvedFallback = fallbackActionFromClip || fallbackActionFromText;

  const text = String(raw || "").trim().toLowerCase();
  if (!text) return resolvedFallback;

  if (SPECIAL_PERFORMER_ACTION_IDS.has(text)) {
    return text;
  }

  const clipFromAction = clipIdFromActionId(text);
  if (clipFromAction) {
    return clipActionId(clipFromAction);
  }

  const numericClipId = sanitizeClipId(text, 0);
  if (numericClipId) {
    return clipActionId(numericClipId);
  }

  return resolvedFallback;
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
  const savedPoster = sanitizePosterState(lobbyPosterStore[roomId]) || null;
  const room = {
    roomId,
    key: `performance:${roomId}`,
    hostId: null,
    players: new Map(),
    showState: {
      playing: false,
      startedAt: 0,
      by: null,
      activeClip: 0,
      activeAction: ""
    },
    doorOpen: true,
    fxState: {
      particles: true,
      lights: true
    },
    lobbyPoster: savedPoster
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
    fxState: room.fxState,
    lobbyPoster: room.lobbyPoster || null,
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
  // Only explicit host intent can hold host authority.
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

  if (player.wantsHost && room.hostId !== socket.id) {
    assignHost(room, socket.id);
  } else if (!room.hostId || !room.players.has(room.hostId)) {
    ensureHost(room);
  }

  socket.emit("room:joined", {
    roomId,
    selfId: socket.id,
    hostId: room.hostId,
    showState: room.showState,
    doorOpen: room.doorOpen,
    fxState: room.fxState,
    lobbyPoster: room.lobbyPoster || null,
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
      message: "\ud638\uc2a4\ud2b8\ub9cc \ud074\ub9bd\uc744 \uc81c\uc5b4\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      ts: Date.now()
    });
    return;
  }

  const requestedClipId = sanitizeClipId(payload?.clipId, 0);
  const explicitActionId = sanitizePerformerActionId(payload?.actionId, "");
  const fallbackActionId = room.showState.activeAction || clipActionId(room.showState.activeClip || 0);
  const actionId = explicitActionId || (requestedClipId ? clipActionId(requestedClipId) : fallbackActionId);
  if (!actionId) {
    socket.emit("room:error", {
      code: "INVALID_CLIP",
      message: "유효하지 않은 클립 번호입니다.",
      ts: Date.now()
    });
    return;
  }

  const clipId = clipIdFromActionId(actionId) || requestedClipId || sanitizeClipId(room.showState.activeClip, 0);
  room.showState.activeClip = clipId;
  room.showState.activeAction = actionId;
  socket.to(room.key).emit("performer:clip", {
    roomId: room.roomId,
    hostId: room.hostId,
    clipId,
    actionId,
    startedAt: Date.now(),
    ts: Date.now()
  });
  emitSnapshot(room);
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
      message: "\ud638\uc2a4\ud2b8\ub9cc \ubb38 \uc0c1\ud0dc\ub97c \ubcc0\uacbd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
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
function handleFxSet(socket, payload) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;

  if (room.hostId !== socket.id) {
    socket.emit("room:error", {
      code: "HOST_ONLY",
      message: "\ud638\uc2a4\ud2b8\ub9cc \uacf5\uc5f0 \ud6a8\uacfc\ub97c \ubcc0\uacbd\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      ts: Date.now()
    });
    return;
  }

  const nextFxState = { ...room.fxState };
  let stateChanged = false;

  if (Object.prototype.hasOwnProperty.call(payload || {}, "particles")) {
    const nextParticles = sanitizeBooleanIntent(payload?.particles, nextFxState.particles);
    if (nextParticles !== nextFxState.particles) {
      nextFxState.particles = nextParticles;
      stateChanged = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload || {}, "lights")) {
    const nextLights = sanitizeBooleanIntent(payload?.lights, nextFxState.lights);
    if (nextLights !== nextFxState.lights) {
      nextFxState.lights = nextLights;
      stateChanged = true;
    }
  }

  const burst = sanitizeBooleanIntent(payload?.burst, false);

  if (!stateChanged && !burst) {
    return;
  }

  if (stateChanged) {
    room.fxState = nextFxState;
  }

  io.to(room.key).emit("fx:state", {
    roomId: room.roomId,
    hostId: room.hostId,
    fxState: room.fxState,
    burst,
    by: socket.id,
    ts: Date.now()
  });

  if (stateChanged) {
    emitSnapshot(room);
  }
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
      message: "\ud638\uc2a4\ud2b8\ub9cc \uacf5\uc5f0\uc744 \uc2dc\uc791\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      ts: Date.now()
    });
    return;
  }

  const requestedClipInput = sanitizeClipId(payload?.activeClip, 0);
  const explicitActionId = sanitizePerformerActionId(payload?.activeAction, "");
  const fallbackClipId = sanitizeClipId(room.showState.activeClip, CLIP_ID_MIN) || CLIP_ID_MIN;
  const fallbackActionId = room.showState.activeAction || clipActionId(fallbackClipId);
  const requestedActionId = explicitActionId || (requestedClipInput ? clipActionId(requestedClipInput) : fallbackActionId);
  const requestedClipId = clipIdFromActionId(requestedActionId) || requestedClipInput || fallbackClipId || CLIP_ID_MIN;

  room.showState = {
    playing: true,
    startedAt: Date.now(),
    by: socket.id,
    activeClip: requestedClipId,
    activeAction: requestedActionId || clipActionId(requestedClipId)
  };
  const nextDoorOpen = false;
  const doorChanged = room.doorOpen !== nextDoorOpen;
  room.doorOpen = nextDoorOpen;

  if (doorChanged) {
    io.to(room.key).emit("door:state", {
      roomId: room.roomId,
      hostId: room.hostId,
      open: room.doorOpen,
      by: socket.id,
      ts: Date.now()
    });
  }

  io.to(room.key).emit("show:state", {
    roomId: room.roomId,
    hostId: room.hostId,
    ...room.showState,
    serverNow: Date.now()
  });
  emitSnapshot(room);
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
      message: "\ud638\uc2a4\ud2b8\ub9cc \uacf5\uc5f0\uc744 \uc911\uc9c0\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
      ts: Date.now()
    });
    return;
  }

  room.showState = {
    playing: false,
    startedAt: 0,
    by: socket.id,
    activeClip: room.showState.activeClip,
    activeAction: room.showState.activeAction || ""
  };
  const nextDoorOpen = true;
  const doorChanged = room.doorOpen !== nextDoorOpen;
  room.doorOpen = nextDoorOpen;

  if (doorChanged) {
    io.to(room.key).emit("door:state", {
      roomId: room.roomId,
      hostId: room.hostId,
      open: room.doorOpen,
      by: socket.id,
      ts: Date.now()
    });
  }

  io.to(room.key).emit("show:state", {
    roomId: room.roomId,
    hostId: room.hostId,
    ...room.showState,
    serverNow: Date.now()
  });
  emitSnapshot(room);
}

function handleLobbyPosterSet(socket, payload) {
  const roomId = socketToRoom.get(socket.id);
  if (!roomId) return;

  const room = rooms.get(roomId);
  const player = room?.players.get(socket.id);
  if (!room || !player) return;

  if (room.hostId !== socket.id) {
    socket.emit("room:error", {
      code: "HOST_ONLY",
      message: "호스트만 로비 광고판을 변경할 수 있습니다.",
      ts: Date.now()
    });
    return;
  }

  const dataUrl = sanitizePosterDataUrl(payload?.dataUrl);
  if (!dataUrl) {
    socket.emit("room:error", {
      code: "INVALID_POSTER",
      message: "JPG/PNG 이미지(용량 제한)를 업로드하세요.",
      ts: Date.now()
    });
    return;
  }

  if (room.lobbyPoster && room.lobbyPoster.dataUrl === dataUrl) {
    return;
  }

  room.lobbyPoster = {
    dataUrl,
    updatedAt: Date.now(),
    by: socket.id
  };
  lobbyPosterStore[room.roomId] = room.lobbyPoster;
  persistPosterStore(lobbyPosterStore);

  io.to(room.key).emit("lobby:poster", {
    roomId: room.roomId,
    poster: room.lobbyPoster,
    ts: Date.now()
  });
  emitSnapshot(room);
}

io.on("connection", (socket) => {
  socket.on("room:join", (payload) => handleJoin(socket, payload));
  socket.on("room:leave", () => leaveCurrentRoom(socket));
  socket.on("player:state", (payload) => handlePlayerState(socket, payload));
  socket.on("chat:send", (payload) => handleChatSend(socket, payload));
  socket.on("show:start", (payload) => handleShowStart(socket, payload));
  socket.on("door:set", (payload) => handleDoorSet(socket, payload));
  socket.on("fx:set", (payload) => handleFxSet(socket, payload));
  socket.on("show:stop", () => handleShowStop(socket));
  socket.on("performer:clip", (payload) => handlePerformerClip(socket, payload));
  socket.on("lobby:poster:set", (payload) => handleLobbyPosterSet(socket, payload));

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

