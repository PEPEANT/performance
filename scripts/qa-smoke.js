#!/usr/bin/env node

const { spawn } = require('child_process');
const { io } = require('socket.io-client');

const PORT = Number(process.env.PORT || 3310);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROOM_ID = 'qa-room';
const MAX_ROOM_SIZE = 50;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function createClient(label) {
  const socket = io(BASE_URL, {
    transports: ['websocket', 'polling'],
    timeout: 7000,
    reconnection: false
  });
  socket.__label = label;
  return socket;
}

function onceWithTimeout(socket, event, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`[${socket.__label}] timeout waiting event: ${event}`));
    }, timeoutMs);

    const onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };

    socket.on(event, onEvent);
  });
}

async function waitServerReady(timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE_URL}/healthz`);
      if (response.ok) {
        const payload = await response.json();
        if (payload && payload.ok) {
          return payload;
        }
      }
    } catch (_error) {
      // keep retrying
    }
    await sleep(200);
  }
  throw new Error('healthz timeout');
}

async function checkHttpRoutes(checks) {
  const targets = [
    { name: 'route_root', url: `${BASE_URL}/`, expect: 'text/html', requireUtf8: true },
    { name: 'route_performance', url: `${BASE_URL}/performance/`, expect: 'text/html', requireUtf8: true },
    { name: 'route_performance_index', url: `${BASE_URL}/performance/index.html?from=emptines`, expect: 'text/html', requireUtf8: true },
    { name: 'route_performance_app', url: `${BASE_URL}/performance/app.js`, expect: 'application/javascript', requireUtf8: true },
    { name: 'route_performance_style', url: `${BASE_URL}/performance/style.css`, expect: 'text/css', requireUtf8: true },
    { name: 'route_performance_manifest', url: `${BASE_URL}/performance/asset-manifest.json`, expect: 'application/json', requireUtf8: false },
    { name: 'route_performance_show_mobile', url: `${BASE_URL}/performance/01.mobile.mp4`, expect: 'video/mp4', requireUtf8: false }
  ];

  for (const item of targets) {
    const response = await fetch(item.url);
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    checks.push({
      name: item.name,
      ok: response.status === 200 && contentType.includes(item.expect),
      detail: { status: response.status, contentType }
    });

    if (item.requireUtf8) {
      checks.push({
        name: `${item.name}_utf8`,
        ok: contentType.includes('charset=utf-8'),
        detail: { contentType }
      });
    }
  }
}

async function connectAndJoin(label, isHost, roomId = ROOM_ID) {
  const socket = createClient(label);
  await onceWithTimeout(socket, 'connect', 8000);

  const joinedPromise = onceWithTimeout(socket, 'room:joined', 8000);
  socket.emit('room:join', {
    roomId,
    name: label,
    map: 'lobby',
    isHost
  });
  const joined = await joinedPromise;
  return { socket, joined };
}

async function checkRealtimeFlow(checks) {
  const clients = [];

  try {
    const host = await connectAndJoin('host-A', true);
    clients.push(host.socket);

    const player = await connectAndJoin('player-B', false);
    clients.push(player.socket);

    checks.push({
      name: 'host_assignment_consistent',
      ok: Boolean(host.joined.hostId && player.joined.hostId && host.joined.hostId === player.joined.hostId),
      detail: { hostId: host.joined.hostId, playerHostId: player.joined.hostId }
    });

    // New room where no one requests host: server must still assign one host.
    const fallbackA = await connectAndJoin('fallback-A', false, 'qa-fallback-room');
    clients.push(fallbackA.socket);
    const fallbackB = await connectAndJoin('fallback-B', false, 'qa-fallback-room');
    clients.push(fallbackB.socket);

    checks.push({
      name: 'host_fallback_when_no_intent',
      ok: Boolean(fallbackA.joined.hostId && fallbackB.joined.hostId),
      detail: {
        fallbackAHostId: fallbackA.joined.hostId,
        fallbackBHostId: fallbackB.joined.hostId
      }
    });

    const promotePlayerFirst = await connectAndJoin('promote-player-first', false, 'qa-promote-room');
    clients.push(promotePlayerFirst.socket);
    const promoteHostSecond = await connectAndJoin('promote-host-second', true, 'qa-promote-room');
    clients.push(promoteHostSecond.socket);

    checks.push({
      name: 'host_promoted_when_intent_joins_late',
      ok:
        Boolean(promoteHostSecond.joined.selfId) &&
        promoteHostSecond.joined.hostId === promoteHostSecond.joined.selfId,
      detail: {
        firstJoinHostId: promotePlayerFirst.joined.hostId,
        secondJoinHostId: promoteHostSecond.joined.hostId,
        secondSelfId: promoteHostSecond.joined.selfId
      }
    });

    const doorBroadcast = onceWithTimeout(player.socket, 'door:state', 8000);
    host.socket.emit('door:set', { open: false, ts: Date.now() });
    const doorState = await doorBroadcast;
    checks.push({
      name: 'door_state_broadcast',
      ok: doorState && doorState.open === false,
      detail: doorState
    });

    const hostOnlyDoor = onceWithTimeout(player.socket, 'room:error', 8000);
    player.socket.emit('door:set', { open: true, ts: Date.now() });
    const hostOnlyDoorErr = await hostOnlyDoor;
    checks.push({
      name: 'door_host_only_guard',
      ok: hostOnlyDoorErr && hostOnlyDoorErr.code === 'HOST_ONLY',
      detail: hostOnlyDoorErr
    });

    const showBroadcast = onceWithTimeout(player.socket, 'show:state', 8000);
    host.socket.emit('show:start', { activeClip: 2, ts: Date.now() });
    const showState = await showBroadcast;
    checks.push({
      name: 'show_state_broadcast',
      ok: showState && showState.playing === true && showState.activeClip === 2,
      detail: showState
    });

    const performerActionRecv = onceWithTimeout(player.socket, 'performer:clip', 8000);
    host.socket.emit('performer:clip', { actionId: 'greet', ts: Date.now() });
    const performerActionPayload = await performerActionRecv;
    checks.push({
      name: 'performer_action_broadcast',
      ok: performerActionPayload && performerActionPayload.actionId === 'greet',
      detail: performerActionPayload
    });

    const performerHostOnlyErrPromise = onceWithTimeout(player.socket, 'room:error', 8000);
    player.socket.emit('performer:clip', { actionId: 'walk_out', ts: Date.now() });
    const performerHostOnlyErr = await performerHostOnlyErrPromise;
    checks.push({
      name: 'performer_host_only_guard',
      ok: performerHostOnlyErr && performerHostOnlyErr.code === 'HOST_ONLY',
      detail: performerHostOnlyErr
    });

    const fxStateRecv = onceWithTimeout(player.socket, 'fx:state', 8000);
    host.socket.emit('fx:set', { particles: false, lights: false, ts: Date.now() });
    const fxStatePayload = await fxStateRecv;
    checks.push({
      name: 'fx_state_broadcast',
      ok:
        fxStatePayload &&
        fxStatePayload.fxState &&
        fxStatePayload.fxState.particles === false &&
        fxStatePayload.fxState.lights === false,
      detail: fxStatePayload
    });

    const fxHostOnlyErrPromise = onceWithTimeout(player.socket, 'room:error', 8000);
    player.socket.emit('fx:set', { particles: true, ts: Date.now() });
    const fxHostOnlyErr = await fxHostOnlyErrPromise;
    checks.push({
      name: 'fx_host_only_guard',
      ok: fxHostOnlyErr && fxHostOnlyErr.code === 'HOST_ONLY',
      detail: fxHostOnlyErr
    });

    const fxBurstRecv = onceWithTimeout(player.socket, 'fx:state', 8000);
    host.socket.emit('fx:set', { burst: true, ts: Date.now() });
    const fxBurstPayload = await fxBurstRecv;
    checks.push({
      name: 'fx_burst_signal',
      ok: fxBurstPayload && fxBurstPayload.burst === true,
      detail: fxBurstPayload
    });

    const chatRecv = onceWithTimeout(host.socket, 'chat:recv', 8000);
    player.socket.emit('chat:send', { text: 'qa-hello', ts: Date.now() });
    const chatPayload = await chatRecv;
    checks.push({
      name: 'chat_broadcast',
      ok: chatPayload && chatPayload.text === 'qa-hello',
      detail: { text: chatPayload && chatPayload.text }
    });

    const snapshotPayload = await onceWithTimeout(player.socket, 'room:snapshot', 8000);
    checks.push({
      name: 'snapshot_room_state',
      ok: snapshotPayload &&
        snapshotPayload.roomId === ROOM_ID &&
        snapshotPayload.doorOpen === false &&
        snapshotPayload.fxState &&
        snapshotPayload.fxState.particles === false &&
        snapshotPayload.fxState.lights === false,
      detail: {
        roomId: snapshotPayload && snapshotPayload.roomId,
        doorOpen: snapshotPayload && snapshotPayload.doorOpen,
        players: snapshotPayload && Array.isArray(snapshotPayload.players) ? snapshotPayload.players.length : -1
      }
    });

    // Capacity test: with host+player already connected (2), join 48 more => 50 total allowed.
    const additionalClients = [];
    for (let i = 0; i < MAX_ROOM_SIZE - 2; i += 1) {
      const extra = await connectAndJoin(`extra-${String(i + 1).padStart(2, '0')}`, false);
      additionalClients.push(extra.socket);
      clients.push(extra.socket);
    }

    checks.push({
      name: 'capacity_fill_to_50',
      ok: additionalClients.length === MAX_ROOM_SIZE - 2,
      detail: { joined: additionalClients.length }
    });

    const overflow = createClient('overflow-51');
    clients.push(overflow);
    await onceWithTimeout(overflow, 'connect', 8000);
    const overflowErrorPromise = onceWithTimeout(overflow, 'room:error', 8000);
    overflow.emit('room:join', {
      roomId: ROOM_ID,
      name: 'overflow-51',
      map: 'lobby',
      isHost: false
    });
    const overflowError = await overflowErrorPromise;

    checks.push({
      name: 'capacity_limit_guard',
      ok: overflowError && overflowError.code === 'ROOM_FULL' && Number(overflowError.limit) === MAX_ROOM_SIZE,
      detail: overflowError
    });
  } finally {
    await Promise.all(
      clients.map(async (socket) => {
        try {
          if (socket && socket.connected) {
            socket.emit('room:leave');
            await sleep(20);
            socket.disconnect();
          } else if (socket) {
            socket.disconnect();
          }
        } catch (_error) {
          // ignore cleanup errors
        }
      })
    );
  }
}

async function main() {
  const checks = [];
  const server = spawn(process.execPath, ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let serverStdout = '';
  let serverStderr = '';
  server.stdout.on('data', (chunk) => {
    serverStdout += String(chunk);
  });
  server.stderr.on('data', (chunk) => {
    serverStderr += String(chunk);
  });

  try {
    const healthPayload = await waitServerReady();
    checks.push({ name: 'healthz', ok: true, detail: healthPayload });

    await checkHttpRoutes(checks);
    await checkRealtimeFlow(checks);

    const failed = checks.filter((item) => !item.ok);
    const output = {
      baseUrl: BASE_URL,
      roomId: ROOM_ID,
      totalChecks: checks.length,
      passed: failed.length === 0,
      failed,
      checks
    };

    console.log(JSON.stringify(output, null, 2));

    if (failed.length > 0) {
      throw new Error(`failed checks: ${failed.map((item) => item.name).join(', ')}`);
    }
  } finally {
    if (!server.killed) {
      server.kill('SIGTERM');
      await sleep(300);
      if (!server.killed) {
        server.kill('SIGKILL');
      }
    }

    if (serverStderr.trim()) {
      console.error('SERVER_STDERR_START');
      console.error(serverStderr.trim());
      console.error('SERVER_STDERR_END');
    }

    if (serverStdout.trim()) {
      console.error('SERVER_STDOUT_START');
      console.error(serverStdout.trim());
      console.error('SERVER_STDOUT_END');
    }
  }
}

main().catch((error) => {
  console.error(`[qa:smoke] failed: ${error.message}`);
  process.exit(1);
});
