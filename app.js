(function () {
  const CAPACITY = 50;
  const ROWS = 5;
  const COLS = 10;
  const SHOW_VIDEO_PATH = "./01.mp4";
  const CLIP_IDS = Array.from({ length: 10 }, (_, index) => index + 1);
  const CLIP_VIDEO_PATHS = Object.fromEntries(CLIP_IDS.map((id) => [id, `./WEBM/${id}_alpha.webm`]));
  const DEFAULT_CLIP_ID = 1;
  const QUEUE_STORAGE_KEY = "performance_choreo_queue_v1";
  const CHROMA_KEY_CONFIG = {
    keyColor: [0.06, 0.95, 0.08],
    similarity: 0.30,
    smoothness: 0.08,
    spill: 1.0,
    despill: 1.0
  };

  const SHOW_MODES = {
    rehearsal: { crowdBounce: 0.14, screenPulse: 0.1, lightBoost: 0.72, fireworksRate: 0.18, fireworkBurstScale: 0.65, strobeStrength: 0.18 },
    live: { crowdBounce: 0.34, screenPulse: 0.2, lightBoost: 1, fireworksRate: 0.58, fireworkBurstScale: 1.0, strobeStrength: 0.52 },
    finale: { crowdBounce: 0.5, screenPulse: 0.32, lightBoost: 1.34, fireworksRate: 0.94, fireworkBurstScale: 1.35, strobeStrength: 0.9 }
  };

  const FIREWORK_COLORS = [0xff5e7e, 0x58d8ff, 0xffd85c, 0x88ff9f, 0xd48cff];

  const QUALITY_MODES = {
    low: { pixelRatio: 1, shadows: false, particles: false },
    medium: { pixelRatio: 1.5, shadows: true, particles: true },
    high: { pixelRatio: 2, shadows: true, particles: true }
  };

  const MAP_META = {
    lobby: {
      label: "\uB85C\uBE44",
      hint: "\uB85C\uBE44\uC5D0\uC11C \uBCF5\uB3C4\uB97C \uB530\uB77C \uC774\uB3D9\uD574 \uACF5\uC5F0\uC7A5 \uC785\uAD6C\uB85C \uC9C4\uC785\uD558\uC138\uC694."
    },
    hall: {
      label: "\uACF5\uC5F0\uC7A5",
      hint: "\uBB34\uB300 \uC5F0\uCD9C\uACFC \uAC1D\uC11D \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uC138\uC694."
    }
  };
  const PORTAL_FLOW = Object.freeze({
    cooldownSeconds: 22,
    warningSeconds: 7,
    openSeconds: 14,
    epochMs: Date.UTC(2026, 0, 1, 0, 0, 0)
  });

  const query = new URLSearchParams(window.location.search);
  const fromEmptines = String(query.get("from") || "").trim().toLowerCase() === "emptines";
  const adminUiMode = ["1", "true", "yes", "on"].includes(String(query.get("admin") || "").trim().toLowerCase());
  const chatEnabled = adminUiMode;
  const hostParamRaw = String(query.get("host") || "").trim().toLowerCase();
  const explicitHostTrue = ["1", "true", "yes", "on", "host"].includes(hostParamRaw);
  const explicitHostFalse = ["0", "false", "no", "off", "player"].includes(hostParamRaw);
  let hostMode = explicitHostTrue ? true : explicitHostFalse ? false : adminUiMode;
  let networkRoomId = String(query.get("room") || "main")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32) || "main";
  let requestedPlayerName = String(query.get("name") || "").trim();
  const externalReturnUrlRaw = String(query.get("returnUrl") || "").trim();
  const returnPortalHint = String(query.get("returnPortal") || "").trim().toLowerCase();

  const dom = {
    canvasRoot: document.getElementById("canvas-root"),
    loading: document.getElementById("loading"),
    statusIntent: document.getElementById("status-intent"),
    introStats: document.getElementById("intro-stats"),
    statCapacity: document.getElementById("stat-capacity"),
    statCapacityCard: document.getElementById("stat-capacity") ? document.getElementById("stat-capacity").closest(".stat-card") : null,
    statLayout: document.getElementById("stat-layout"),
    statSeats: document.getElementById("stat-seats"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    modeButtons: Array.from(document.querySelectorAll("[data-show-mode]")),
    occupancyRange: document.getElementById("occupancy-range"),
    occupancyRow: document.getElementById("occupancy-row"),
    occupancyLabel: document.getElementById("occupancy-label"),
    qualitySelect: document.getElementById("quality-select"),
    portalActionBtn: document.getElementById("portal-action-btn"),
    portalPhaseNote: document.getElementById("portal-phase-note"),
    showStartBtn: document.getElementById("show-start-btn"),
    hostDoorBtn: document.getElementById("host-door-btn"),
    returnLobbyBtn: document.getElementById("return-lobby-btn"),
    clipButtons: Array.from(document.querySelectorAll("[data-clip-id]")),
    queueRecordBtn: document.getElementById("queue-record-btn"),
    queuePlayBtn: document.getElementById("queue-play-btn"),
    queueLoopBtn: document.getElementById("queue-loop-btn"),
    queueSaveBtn: document.getElementById("queue-save-btn"),
    queueLoadBtn: document.getElementById("queue-load-btn"),
    queueClearBtn: document.getElementById("queue-clear-btn"),
    queueStatus: document.getElementById("queue-status"),
    networkPanel: document.getElementById("network-panel"),
    networkRoleSelect: document.getElementById("network-role-select"),
    networkRoomInput: document.getElementById("network-room-input"),
    networkNameInput: document.getElementById("network-name-input"),
    networkApplyBtn: document.getElementById("network-apply-btn"),
    networkNote: document.getElementById("network-note"),
    fpsToggleBtn: document.getElementById("fps-toggle-btn"),
    hudMap: document.getElementById("hud-map"),
    hudFps: document.getElementById("hud-fps"),
    hudSeatsChip: document.getElementById("hud-chip-seats"),
    hudSeats: document.getElementById("hud-seats"),
    hudQuality: document.getElementById("hud-quality"),
    hudPortal: document.getElementById("hud-portal"),
    hudDrawcalls: document.getElementById("hud-drawcalls"),
    hudStatus: document.getElementById("hud-status"),
    hudPlayersRow: document.getElementById("hud-row-players"),
    hudPlayers: document.getElementById("hud-players"),
    hudPosition: document.getElementById("hud-position"),
    hudFpsMini: document.getElementById("hud-fps-mini"),
    chatUi: document.getElementById("chat-ui"),
    chatLog: document.getElementById("chat-log"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-send"),
    chatToggle: document.getElementById("chat-toggle"),
    portalTransition: document.getElementById("portal-transition"),
    portalTransitionLabel: document.getElementById("portal-transition-label"),
    portalTransitionTitle: document.getElementById("portal-transition-title")
  };

  if (!dom.canvasRoot || !dom.loading || !window.THREE || !window.THREE.OrbitControls) {
    return;
  }

  const THREE = window.THREE;
  const isMobile =
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "") ||
    (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);

  const PLAYER_EYE_HEIGHT = { lobby: 2.1, hall: 2.3 };
  const PLAYER_MOVE_SPEED = isMobile ? 4.2 : 5.5;
  const PLAYER_RUN_MULTIPLIER = 1.45;
  const PLAYER_LOOK_SENSITIVITY = isMobile ? 0.00155 : 0.00195;
  const CHAT_MAX_LENGTH = 140;
  const CHAT_SEND_COOLDOWN_MS = 250;
  const REMOTE_UPDATE_INTERVAL = 1 / 30;
  const REMOTE_CULL_DISTANCE_SQ = 110 * 110;
  const REMOTE_BADGE_DISTANCE_SQ = 45 * 45;
  const PLAYER_STATE_SEND_INTERVAL = 1 / 15;
  const REMOTE_INTERPOLATION_SPEED = 8;
  const PLAYER_GRAVITY = 24;
  const PLAYER_JUMP_SPEED = 9.2;
  const PLAYER_COLLISION_RADIUS = 0.42;
  const HALL_STAGE_BOUNDS = Object.freeze({ minX: -26, maxX: 26, minZ: 84, maxZ: 108, height: 2.4 });
  const LOBBY_BOUNDS = Object.freeze({
    minZ: 3.2,
    maxZ: 45.2,
    corridorStartZ: 23,
    lobbyHalfWidth: 13.2,
    corridorHalfWidth: 3.55,
    closedDoorBarrierZ: 22.2,
    closedDoorHalfGap: 1.75
  });
  const LOBBY_PORTAL_ENTRY_RADIUS = 4.8;
  const LOBBY_PORTAL_ENTRY_RADIUS_SQ = LOBBY_PORTAL_ENTRY_RADIUS * LOBBY_PORTAL_ENTRY_RADIUS;

  dom.statCapacity.textContent = String(CAPACITY);
  dom.statLayout.textContent = `${ROWS} x ${COLS}`;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050914);
  scene.fog = new THREE.FogExp2(0x050914, 0.02);

  const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 420);
  camera.position.set(0, 6.8, 16.2);

  const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: "high-performance" });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
  dom.canvasRoot.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enablePan = false;
  controls.minDistance = 6;
  controls.maxDistance = 95;
  controls.maxPolarAngle = Math.PI / 2 - 0.03;
  if (isMobile) controls.enableZoom = false;

  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  const hemi = new THREE.HemisphereLight(0x9ec2ff, 0x090f19, 0.22);
  hemi.position.set(0, 32, 0);
  scene.add(hemi);

  const lobbyMap = createLobbyMap(THREE, scene, isMobile);
  const hallMap = createHallMap(THREE, scene, ROWS, COLS, isMobile);
  const hallSeatColliders = Array.isArray(hallMap.seatColliders) ? hallMap.seatColliders : [];
  const lobbyPortalWorldPosition = new THREE.Vector3();
  const playerLayer = new THREE.Group();
  playerLayer.name = "player-layer";
  scene.add(playerLayer);

  const presets = {
    lobby_entry: { map: "lobby", position: new THREE.Vector3(0, 6.6, 14), target: new THREE.Vector3(0, 2.3, 30) },
    lobby_corridor: { map: "lobby", position: new THREE.Vector3(0, 4.8, 24), target: new THREE.Vector3(0, 2.6, 44) },
    hall_wide: { map: "hall", position: new THREE.Vector3(0, 16, 40), target: new THREE.Vector3(0, 4.4, 88) },
    hall_stage: { map: "hall", position: new THREE.Vector3(0, 8.8, 68), target: new THREE.Vector3(0, 5.4, 98) },
    hall_audience: { map: "hall", position: new THREE.Vector3(0, 9.8, 56), target: new THREE.Vector3(0, 3.2, 82) }
  };

  let activeMap = "lobby";
  let activePreset = "lobby_entry";
  let activeAudience = CAPACITY;
  let showMode = "live";
  let qualityMode = isMobile ? "low" : "medium";
  let cameraTween = null;
  let transitionInFlight = false;
  let doorOpen = true;
  let portalState = { phase: "cooldown", secondsLeft: 0, progress: 0 };
  let lastPortalUiSignature = "";
  let doorTarget = 1;
  let doorSlide = 1;
  let loadingHidden = false;
  let fpsFrames = 0;
  let fpsClock = 0;
  let fpsValue = 60;
  let stageVideo = null;
  let stageVideoTexture = null;
  let stageVideoReady = false;
  let chromaVideo = null;
  let chromaVideoTexture = null;
  let chromaVideoReady = false;
  let showPlaying = false;
  let screenVideoEnabled = false;
  let currentClipId = DEFAULT_CLIP_ID;
  let queueEvents = [];
  let queuePlayIndex = 0;
  let queueRecording = false;
  let queuePlaying = false;
  let queueLoop = true;
  let queueLastMessage = "";
  let firstPersonEnabled = false;
  let pointerLocked = false;
  let playerYaw = 0;
  let playerPitch = 0;
  let chatCollapsed = true;
  let lastChatSentAt = 0;
  let remoteUpdateAccumulator = 0;
  const tempBillboardTarget = new THREE.Vector3();
  const moveState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    jump: false
  };
  const remotePlayers = new Map();
  const cameraDirectionTemp = new THREE.Vector3();
  let socket = null;
  let socketConnected = false;
  let selfSocketId = null;
  let roomHostId = null;
  let isHostClient = hostMode;
  let roomPopulation = 1;
  let playerFootY = 0;
  let playerVelocityY = 0;
  let playerGrounded = true;
  let stateSendAccumulator = 0;
  let pendingShowStartFromHost = false;
  let lastNetworkShowPlaying = null;
  let lastNetworkShowStartedAtMs = 0;
  let lastNetworkActiveClipId = 0;
  let clientDisplayName = requestedPlayerName || ("\uD50C\uB808\uC774\uC5B4-" + Math.floor(Math.random() * 9000 + 1000));

  dom.portalActionBtn.addEventListener("click", () => enterHall());
  if (dom.showStartBtn) {
    dom.showStartBtn.addEventListener("click", () => startShow({ broadcast: true }));
  }
  if (dom.hostDoorBtn) {
    dom.hostDoorBtn.addEventListener("click", () => {
      if (!isHostClient) return;
      setDoorOpen(!doorOpen);
    });
  }
  dom.returnLobbyBtn.addEventListener("click", () => {
    if (activeMap === "hall") {
      setMap("lobby", false);
      return;
    }

    const lobbyReturnUrl = buildLobbyReturnUrl();
    if (lobbyReturnUrl) {
      window.location.assign(lobbyReturnUrl);
      return;
    }

    dom.loading.textContent = "\uBCF5\uADC0 URL\uC774 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
    dom.loading.classList.remove("hidden");
    setTimeout(() => {
      if (!transitionInFlight) {
        dom.loading.classList.add("hidden");
        dom.loading.textContent = "\uB85C\uBE44 \uAD6C\uC131 \uC911...";
      }
    }, 1000);
  });
  if (dom.fpsToggleBtn) {
    dom.fpsToggleBtn.addEventListener("click", () => {
      toggleFirstPerson();
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const code = String(event.code || "").toLowerCase();
    setMovementKeyState(key, code, true);

    const tag = String(event.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "select" || tag === "textarea";
    if (typing) return;

    if (key === "f" && isHostClient) {
      event.preventDefault();
      toggleFirstPerson();
      return;
    }

    if (event.repeat) return;

    if (key === " " || key === "space" || key === "spacebar" || code === "space") {
      event.preventDefault();
    }

    if (key === "e") enterHall();
    if (isHostClient && key === "h") {
      setDoorOpen(!doorOpen);
    }

    if (/^[0-9]$/.test(key)) {
      const clipId = key === "0" ? 10 : Number(key);
      playPerformerClip(clipId, { record: true });
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = String(event.key || "").toLowerCase();
    const code = String(event.code || "").toLowerCase();
    setMovementKeyState(key, code, false);
  });

  window.addEventListener("pointerdown", (event) => {
    syncShowMediaState();
    updateShowStartButton();
    if (firstPersonEnabled && event.button === 0) {
      tryPointerLock();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    updateHud();
  });

  document.addEventListener("mousemove", (event) => {
    if (!firstPersonEnabled || !pointerLocked) return;
    const dx = Number(event.movementX) || 0;
    const dy = Number(event.movementY) || 0;
    playerYaw -= dx * PLAYER_LOOK_SENSITIVITY;
    playerPitch -= dy * PLAYER_LOOK_SENSITIVITY;
    playerPitch = THREE.MathUtils.clamp(playerPitch, -1.45, 1.45);
  });

  dom.presetButtons.forEach((button) => {
    button.addEventListener("click", () => applyPreset(button.dataset.preset, false));
  });

  dom.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      showMode = SHOW_MODES[button.dataset.showMode] ? button.dataset.showMode : "live";
      dom.modeButtons.forEach((b) => b.classList.toggle("active", b === button));
    });
  });

  if (dom.occupancyRange) {
    dom.occupancyRange.addEventListener("input", () => {
      if (!adminUiMode) return;
      activeAudience = Math.max(0, Math.min(CAPACITY, Number(dom.occupancyRange.value) || 0));
      if (dom.occupancyLabel) {
        dom.occupancyLabel.textContent = `${activeAudience} / ${CAPACITY}`;
      }
      if (dom.statSeats) {
        dom.statSeats.textContent = String(activeAudience);
      }
    });
  }

  dom.qualitySelect.addEventListener("change", () => {
    qualityMode = QUALITY_MODES[dom.qualitySelect.value] ? dom.qualitySelect.value : "medium";
    applyQuality();
  });

  dom.clipButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const clipId = Number(button.dataset.clipId || 0);
      playPerformerClip(clipId, { record: true });
    });
  });

  if (dom.queueRecordBtn) {
    dom.queueRecordBtn.addEventListener("click", () => toggleQueueRecording());
  }
  if (dom.queuePlayBtn) {
    dom.queuePlayBtn.addEventListener("click", () => startQueuePlayback(true));
  }
  if (dom.queueLoopBtn) {
    dom.queueLoopBtn.addEventListener("click", () => {
      if (!canControlShowOps()) {
        updateQueueUi("\uD638\uC2A4\uD2B8 \uC804\uC6A9 \uAE30\uB2A5\uC785\uB2C8\uB2E4.");
        return;
      }
      queueLoop = !queueLoop;
      updateQueueUi(queueLoop ? "루프 켜짐" : "루프 꺼짐");
    });
  }
  if (dom.queueSaveBtn) {
    dom.queueSaveBtn.addEventListener("click", () => saveQueueToStorage());
  }
  if (dom.queueLoadBtn) {
    dom.queueLoadBtn.addEventListener("click", () => loadQueueFromStorage(false));
  }
  if (dom.queueClearBtn) {
    dom.queueClearBtn.addEventListener("click", () => clearQueueEvents());
  }

  applyUiVisibilityMode();
  if (adminUiMode) {
    setupNetworkProfileUi();
  }
  setupShowMedia();
  setupPlayerSystem();
  setupFirstPersonControls();
  if (chatEnabled) {
    setupChatUi();
  }
  setupRealtime();
  loadQueueFromStorage(true);
  setDoorOpen(true);
  refreshPortalState(true);
  updateQueueUi();
  installDebugBridge();

  function installDebugBridge() {
    if (!adminUiMode) return;
    if (typeof window === "undefined") return;

    window.__performanceDebug = {
      getState() {
        return {
          activeMap,
          firstPersonEnabled,
          pointerLocked,
          isHostClient,
          socketConnected,
          selfSocketId,
          roomPopulation,
          showPlaying,
          queuePlaying,
          currentClipId,
          lastNetworkActiveClipId,
          playerFootY,
          playerVelocityY,
          playerGrounded,
          moveState: { ...moveState },
          camera: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw: playerYaw,
            pitch: playerPitch
          }
        };
      },
      emitStateNow() {
        const payload = getLocalPlayerState();
        if (socketConnected && socket) {
          socket.emit("player:state", payload);
        }
        return payload;
      },
      forceJump() {
        moveState.jump = true;
        return this.getState();
      },
      teleport(x, z, mapName) {
        if (mapName === "lobby" || mapName === "hall") {
          setMap(mapName, true);
        }
        if (Number.isFinite(Number(x))) camera.position.x = Number(x);
        if (Number.isFinite(Number(z))) camera.position.z = Number(z);
        syncPlayerHeightToGround({ resetVelocity: true });
        emitLocalPlayerState(true);
        return this.getState();
      },
      setVertical(footY, velocityY = 0, grounded = false) {
        playerFootY = Number.isFinite(Number(footY)) ? Number(footY) : playerFootY;
        playerVelocityY = Number.isFinite(Number(velocityY)) ? Number(velocityY) : playerVelocityY;
        playerGrounded = Boolean(grounded);
        camera.position.y = playerFootY + PLAYER_EYE_HEIGHT[activeMap];
        return this.getState();
      },
      simulateStep(options = {}) {
        const steps = Math.max(1, Math.min(600, Number(options.steps) || 1));
        const delta = Math.max(1 / 240, Math.min(0.1, Number(options.delta) || 1 / 60));
        const forward = Number(options.forward) || 0;
        const strafe = Number(options.strafe) || 0;
        const withJump = Boolean(options.jump);

        if (!firstPersonEnabled) {
          setFirstPersonEnabled(true, { requestLock: false });
        }

        const prevState = { ...moveState };
        moveState.forward = forward > 0;
        moveState.backward = forward < 0;
        moveState.right = strafe > 0;
        moveState.left = strafe < 0;
        moveState.run = Boolean(options.run);
        if (withJump) {
          moveState.jump = true;
        }

        for (let i = 0; i < steps; i += 1) {
          updateFirstPersonMovement(delta);
        }

        Object.assign(moveState, prevState);
        emitLocalPlayerState(true);
        return this.getState();
      }
    };
  }

  function computePortalState(nowMs = Date.now()) {
    const cycle = PORTAL_FLOW.cooldownSeconds + PORTAL_FLOW.warningSeconds + PORTAL_FLOW.openSeconds;
    if (cycle <= 0) {
      return { phase: "open", secondsLeft: 0, progress: 1 };
    }

    let elapsed = ((nowMs - PORTAL_FLOW.epochMs) / 1000) % cycle;
    if (elapsed < 0) elapsed += cycle;

    if (elapsed < PORTAL_FLOW.cooldownSeconds) {
      const remaining = PORTAL_FLOW.cooldownSeconds - elapsed;
      return {
        phase: "cooldown",
        secondsLeft: Math.max(0, Math.ceil(remaining)),
        progress: elapsed / PORTAL_FLOW.cooldownSeconds
      };
    }

    elapsed -= PORTAL_FLOW.cooldownSeconds;
    if (elapsed < PORTAL_FLOW.warningSeconds) {
      const remaining = PORTAL_FLOW.warningSeconds - elapsed;
      return {
        phase: "warning",
        secondsLeft: Math.max(0, Math.ceil(remaining)),
        progress: elapsed / PORTAL_FLOW.warningSeconds
      };
    }

    elapsed -= PORTAL_FLOW.warningSeconds;
    const remaining = PORTAL_FLOW.openSeconds - elapsed;
    return {
      phase: "open",
      secondsLeft: Math.max(0, Math.ceil(remaining)),
      progress: elapsed / PORTAL_FLOW.openSeconds
    };
  }

  function getPortalPhaseSummary() {
    if (!doorOpen) return "\uBB38 \uB2EB\uD798 - \uD638\uC2A4\uD2B8 \uB300\uAE30";
    if (portalState.phase === "open") {
      return isNearLobbyPortal()
        ? "\uD3EC\uD0C8 \uAC1C\uBC29\uB428"
        : "\uD3EC\uD0C8 \uAC1C\uBC29 \uB428 - \uC785\uAD6C \uC774\uB3D9";
    }
    if (portalState.phase === "warning") return "\uAC1C\uBC29 \uC900\uBE44 " + portalState.secondsLeft + "\uCD08";
    return "\uD3EC\uD0C8 \uCDA9\uC804 " + portalState.secondsLeft + "\uCD08";
  }

  function setPortalTransition(active, label, title) {
    if (!dom.portalTransition) return;
    if (typeof label === "string" && dom.portalTransitionLabel) {
      dom.portalTransitionLabel.textContent = label;
    }
    if (typeof title === "string" && dom.portalTransitionTitle) {
      dom.portalTransitionTitle.textContent = title;
    }
    dom.portalTransition.classList.toggle("active", Boolean(active));
    dom.portalTransition.setAttribute("aria-hidden", active ? "false" : "true");
  }

  function resolveExternalUrl(rawUrl) {
    const text = String(rawUrl || "").trim();
    if (!text) return "";
    try {
      const parsed = new URL(text, window.location.href);
      const protocol = String(parsed.protocol || "").toLowerCase();
      if (protocol !== "http:" && protocol !== "https:") return "";
      return parsed.toString();
    } catch (_error) {
      return "";
    }
  }

  function buildLobbyReturnUrl() {
    const explicitReturnUrl = resolveExternalUrl(externalReturnUrlRaw);
    if (explicitReturnUrl) {
      return explicitReturnUrl;
    }

    if (!fromEmptines) {
      return "";
    }

    try {
      const fallback = new URL("/?zone=lobby&from=performance", window.location.href);
      if (returnPortalHint && !fallback.searchParams.has("returnPortal")) {
        fallback.searchParams.set("returnPortal", returnPortalHint);
      }
      return fallback.toString();
    } catch (_error) {
      return "/?zone=lobby&from=performance";
    }
  }

  function isNearLobbyPortal(position = camera.position) {
    if (!lobbyMap.portalGroup || typeof lobbyMap.portalGroup.getWorldPosition !== "function") {
      return true;
    }
    lobbyMap.portalGroup.getWorldPosition(lobbyPortalWorldPosition);
    const dx = position.x - lobbyPortalWorldPosition.x;
    const dz = position.z - lobbyPortalWorldPosition.z;
    return dx * dx + dz * dz <= LOBBY_PORTAL_ENTRY_RADIUS_SQ;
  }

  function updatePortalUiCopy(forceMapHint = false) {
    if (activeMap !== "lobby") {
      if (forceMapHint && dom.statusIntent) {
        dom.statusIntent.textContent = MAP_META[activeMap].hint;
      }
      if (dom.portalPhaseNote) {
        dom.portalPhaseNote.textContent = "\uB85C\uBE44\uC5D0\uC11C \uD3EC\uD0C8 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uC138\uC694.";
      }
      updateDoorUi();
      return;
    }

    const summary = getPortalPhaseSummary();

    if (dom.statusIntent) {
      const nearPortal = isNearLobbyPortal();
      if (!doorOpen) {
        dom.statusIntent.textContent = "\uBB38\uC774 \uB2EB\uD600 \uC788\uC2B5\uB2C8\uB2E4. \uD638\uC2A4\uD2B8\uAC00 \uBB38\uC744 \uC5F4\uBA74 \uD3EC\uD0C8 \uB300\uAE30 \uB2E8\uACC4\uAC00 \uC9C4\uD589\uB429\uB2C8\uB2E4.";
      } else if (portalState.phase === "open" && nearPortal) {
        dom.statusIntent.textContent = "\uD3EC\uD0C8\uC774 \uAC1C\uBC29\uB418\uC5C8\uC2B5\uB2C8\uB2E4. E\uB97C \uB20C\uB7EC \uACF5\uC5F0\uC7A5\uC73C\uB85C \uC785\uC7A5\uD558\uC138\uC694.";
      } else if (portalState.phase === "open") {
        dom.statusIntent.textContent = "\uD3EC\uD0C8\uC774 \uAC1C\uBC29\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBCF5\uB3C4 \uB05D \uD3EC\uD0C8 \uADFC\uCC98\uC5D0\uC11C E\uB97C \uB20C\uB7EC \uC785\uC7A5\uD558\uC138\uC694.";
      } else if (portalState.phase === "warning") {
        dom.statusIntent.textContent = "\uD3EC\uD0C8 \uAC1C\uBC29 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4. " + portalState.secondsLeft + "\uCD08 \uD6C4 \uC785\uC7A5 \uAC00\uB2A5\uD569\uB2C8\uB2E4.";
      } else {
        dom.statusIntent.textContent = "\uD3EC\uD0C8 \uCDA9\uC804 \uC911\uC785\uB2C8\uB2E4. " + portalState.secondsLeft + "\uCD08 \uD6C4 \uAC1C\uBC29\uB429\uB2C8\uB2E4.";
      }
    }

    if (dom.portalPhaseNote) {
      dom.portalPhaseNote.textContent = summary;
    }

    updateDoorUi();
  }

  function refreshPortalState(force) {
    const next = computePortalState(Date.now());
    portalState = next;
    const signature = activeMap + "|" + (doorOpen ? 1 : 0) + "|" + next.phase + "|" + next.secondsLeft;
    if (!force && signature === lastPortalUiSignature) {
      return;
    }
    lastPortalUiSignature = signature;
    updatePortalUiCopy(false);
    updateHud();
  }

  function enterHall() {
    if (activeMap !== "lobby" || transitionInFlight) return;

    refreshPortalState(false);

    if (!isNearLobbyPortal()) {
      dom.loading.textContent = "\uD3EC\uD0C8 \uADFC\uCC98\uC5D0\uC11C E\uB97C \uB20C\uB7EC \uC785\uC7A5\uD558\uC138\uC694.";
      dom.loading.classList.remove("hidden");
      setTimeout(() => {
        if (!transitionInFlight) {
          dom.loading.classList.add("hidden");
          dom.loading.textContent = "\uB85C\uBE44 \uAD6C\uC131 \uC911...";
        }
      }, 900);
      return;
    }

    if (!doorOpen) {
      dom.loading.textContent = "\uBB38\uC774 \uB2EB\uD600 \uC788\uC2B5\uB2C8\uB2E4. \uD638\uC2A4\uD2B8\uAC00 \uBB38\uC744 \uC5F4\uC5B4\uC57C \uC785\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
      dom.loading.classList.remove("hidden");
      setTimeout(() => {
        if (!transitionInFlight) {
          dom.loading.classList.add("hidden");
          dom.loading.textContent = "\uB85C\uBE44 \uAD6C\uC131 \uC911...";
        }
      }, 900);
      return;
    }

    if (portalState.phase !== "open") {
      const waitText = portalState.phase === "warning"
        ? "\uD3EC\uD0C8 \uAC1C\uBC29 \uC900\uBE44 \uC911\uC785\uB2C8\uB2E4. " + portalState.secondsLeft + "\uCD08 \uD6C4 \uC785\uC7A5 \uAC00\uB2A5\uD569\uB2C8\uB2E4."
        : "\uD3EC\uD0C8 \uCDA9\uC804 \uC911\uC785\uB2C8\uB2E4. " + portalState.secondsLeft + "\uCD08 \uD6C4 \uAC1C\uBC29\uB429\uB2C8\uB2E4.";
      dom.loading.textContent = waitText;
      dom.loading.classList.remove("hidden");
      setTimeout(() => {
        if (!transitionInFlight) {
          dom.loading.classList.add("hidden");
          dom.loading.textContent = "\uB85C\uBE44 \uAD6C\uC131 \uC911...";
        }
      }, 900);
      return;
    }

    transitionInFlight = true;
    setPortalTransition(true, "\uD3EC\uD0C8 \uB3D9\uAE30\uD654", "\uACF5\uC5F0\uC7A5 \uC785\uC7A5 \uC911...");
    dom.loading.textContent = "\uD3EC\uD0C8 \uD1B5\uACFC \uC911...";
    dom.loading.classList.remove("hidden");

    setTimeout(() => {
      setMap("hall", true);
      setPortalTransition(false);
      setTimeout(() => {
        dom.loading.classList.add("hidden");
        dom.loading.textContent = "\uB85C\uBE44 \uAD6C\uC131 \uC911...";
        transitionInFlight = false;
      }, 180);
    }, 680);
  }

  function setDoorOpen(nextOpen, options = {}) {
    const { broadcast = socketConnected && isHostClient } = options;
    const next = Boolean(nextOpen);
    if (doorOpen === next) {
      return;
    }
    doorOpen = next;
    doorTarget = doorOpen ? 1 : 0;
    if (dom.hostDoorBtn && isHostClient) {
      dom.hostDoorBtn.textContent = doorOpen ? "\uD638\uC2A4\uD2B8 \uBB38 \uB2EB\uAE30" : "\uD638\uC2A4\uD2B8 \uBB38 \uC5F4\uAE30";
    }
    if (broadcast && socketConnected && socket && isHostClient) {
      socket.emit("door:set", { open: doorOpen, ts: Date.now() });
    }
    refreshPortalState(true);
    updateHud();
  }

  function applyDoorStateFromNetwork(nextOpen) {
    setDoorOpen(Boolean(nextOpen), { broadcast: false });
  }

  function updateDoorUi() {
    if (!dom.portalActionBtn) return;
    const inLobby = activeMap === "lobby";
    const portalOpen = portalState.phase === "open";
    const nearPortal = isNearLobbyPortal();
    const canEnter = inLobby && doorOpen && portalOpen && nearPortal;
    dom.portalActionBtn.disabled = !canEnter;

    if (!inLobby) {
      dom.portalActionBtn.textContent = "\uACF5\uC5F0\uC7A5 \uC785\uC7A5 (E)";
      return;
    }

    if (!doorOpen) {
      dom.portalActionBtn.textContent = "\uBB38 \uB2EB\uD798 - \uD638\uC2A4\uD2B8 \uB300\uAE30";
      return;
    }

    if (!portalOpen) {
      dom.portalActionBtn.textContent = portalState.phase === "warning"
        ? "\uAC1C\uBC29 \uC900\uBE44 " + portalState.secondsLeft + "\uCD08"
        : "\uD3EC\uD0C8 \uCDA9\uC804 " + portalState.secondsLeft + "\uCD08";
      return;
    }

    if (!nearPortal) {
      dom.portalActionBtn.textContent = "\uD3EC\uD0C8 \uADFC\uCC98\uB85C \uC774\uB3D9";
      return;
    }

    dom.portalActionBtn.textContent = "\uACF5\uC5F0\uC7A5 \uC785\uC7A5 (E)";
  }

  function setMap(nextMap, immediate) {
    activeMap = nextMap === "hall" ? "hall" : "lobby";
    // Prevent lobby/hall geometry overlap by showing only the active map.
    lobbyMap.group.visible = activeMap === "lobby";
    hallMap.group.visible = activeMap === "hall";
    hallMap.seatingGroup.visible = activeMap === "hall";
    scene.fog.density = activeMap === "hall" ? 0.014 : 0.02;
    controls.maxDistance = activeMap === "hall" ? 95 : 40;

    const defaultPreset = activeMap === "hall" ? "hall_wide" : "lobby_entry";
    applyPreset(defaultPreset, immediate);
    syncShowMediaState();
    updateShowStartButton();
    updateUiByMap();
    updateRemotePlayerVisibility();

    if (firstPersonEnabled) {
      syncPlayerHeightToGround({ resetVelocity: true });
      syncOrbitTargetToCamera();
    }

    if (activeMap === "hall" && pendingShowStartFromHost && showPlaying) {
      startShow({ broadcast: false, allowNonHost: true, startOffsetSeconds: getNetworkShowOffsetSeconds() });
    }

    if (activeMap === "hall") {
      applyLatestNetworkClip();
    }

    emitLocalPlayerState(true);
    updateHud();
  }

  function applyPreset(name, immediate) {
    const preset = presets[name];
    if (!preset || preset.map !== activeMap) return;

    if (immediate) {
      camera.position.copy(preset.position);
      controls.target.copy(preset.target);
      controls.update();
      syncYawPitchFromCamera();
      activePreset = name;
      updatePresetButtons();
      updateQueueUi();
      return;
    }

    cameraTween = {
      start: performance.now(),
      duration: 760,
      fromPos: camera.position.clone(),
      toPos: preset.position.clone(),
      fromTarget: controls.target.clone(),
      toTarget: preset.target.clone(),
      presetName: name
    };
  }

  function updatePresetButtons() {
    dom.presetButtons.forEach((button) => {
      const scope = String(button.dataset.mapScope || "").toLowerCase();
      const name = String(button.dataset.preset || "");
      const visible = scope === activeMap;
      button.classList.toggle("hidden", !visible);
      button.classList.toggle("active", visible && name === activePreset);
    });
  }

  function updateUiByMap() {
    updatePortalUiCopy(true);
    dom.portalActionBtn.classList.toggle("hidden", activeMap !== "lobby");
    updateDoorUi();
    const hasExternalReturn = Boolean(buildLobbyReturnUrl());
    const showReturn = activeMap === "hall" || hasExternalReturn;
    dom.returnLobbyBtn.classList.toggle("hidden", !showReturn);
    dom.returnLobbyBtn.textContent = activeMap === "hall" ? "\uB85C\uBE44\uB85C \uB3CC\uC544\uAC00\uAE30" : "EMPTINES\uB85C \uBCF5\uADC0";
    const hallOnly = activeMap === "hall";
    dom.modeButtons.forEach((button) => {
      button.disabled = !hallOnly;
    });
    dom.occupancyRange.disabled = !hallOnly;
    updatePresetButtons();
    updateQueueUi();
    if (firstPersonEnabled) {
      syncYawPitchFromCamera();
    }
  }

function applyQuality() {
    const quality = QUALITY_MODES[qualityMode] || QUALITY_MODES.medium;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? Math.min(1.5, quality.pixelRatio) : quality.pixelRatio));
    renderer.shadowMap.enabled = quality.shadows;
    hallMap.stageWash.castShadow = quality.shadows;
    const shadowSize = quality.shadows ? (isMobile ? 512 : 1024) : 256;
    hallMap.stageWash.shadow.mapSize.width = shadowSize;
    hallMap.stageWash.shadow.mapSize.height = shadowSize;
    hallMap.particles.visible = quality.particles && activeMap === "hall";
    updateHud();
  }

  function setupShowMedia() {
    const bg = document.createElement("video");
    bg.src = SHOW_VIDEO_PATH;
    bg.preload = "auto";
    bg.loop = false;
    bg.muted = false;
    bg.volume = 1.0;
    bg.playsInline = true;
    bg.crossOrigin = "anonymous";
    bg.setAttribute("webkit-playsinline", "true");
    stageVideo = bg;

    bg.addEventListener(
      "canplay",
      () => {
        stageVideoTexture = new THREE.VideoTexture(bg);
        stageVideoTexture.minFilter = THREE.LinearFilter;
        stageVideoTexture.magFilter = THREE.LinearFilter;
        stageVideoTexture.generateMipmaps = false;
        stageVideoTexture.encoding = THREE.sRGBEncoding;
        stageVideoReady = true;
        updateShowStartButton();

        if (pendingShowStartFromHost && showPlaying && activeMap === "hall") {
          startShow({ broadcast: false, allowNonHost: true, startOffsetSeconds: getNetworkShowOffsetSeconds() });
        }
      },
      { once: true }
    );

    bg.addEventListener("ended", () => {
      if (queuePlaying && queueLoop && queueEvents.length > 0) {
        queuePlayIndex = 0;
        startShow({ broadcast: socketConnected && isHostClient, allowNonHost: true });
        updateQueueUi("\uB8E8\uD504 \uC7AC\uC0DD \uC2DC\uC791");
        return;
      }

      stopShowLocal({ broadcast: socketConnected && isHostClient });
    });

    bg.addEventListener("error", () => {
      stageVideoReady = false;
      updateShowStartButton();
      const bgSrc = SHOW_VIDEO_PATH;
      updateQueueUi(`\uBC30\uACBD \uC601\uC0C1 \uB85C\uB4DC \uC2E4\uD328: ${bgSrc}`);
      appendChatLine("시스템", `배경 영상 로드 실패: ${bgSrc}`, "system");
    });

    const chroma = document.createElement("video");
    chroma.src = CLIP_VIDEO_PATHS[DEFAULT_CLIP_ID];
    chroma.preload = "auto";
    chroma.loop = false;
    chroma.muted = true;
    chroma.volume = 0.0;
    chroma.defaultMuted = true;
    chroma.playsInline = true;
    chroma.crossOrigin = "anonymous";
    chroma.setAttribute("webkit-playsinline", "true");
    chromaVideo = chroma;

    chromaVideoTexture = new THREE.VideoTexture(chroma);
    chromaVideoTexture.minFilter = THREE.LinearFilter;
    chromaVideoTexture.magFilter = THREE.LinearFilter;
    chromaVideoTexture.generateMipmaps = false;
    chromaVideoTexture.encoding = THREE.sRGBEncoding;
    chromaVideoTexture.format = THREE.RGBAFormat;
    chromaVideoTexture.premultiplyAlpha = true;

    if (hallMap.performerMat.uniforms && hallMap.performerMat.uniforms.uMap) {
      hallMap.performerMat.uniforms.uMap.value = chromaVideoTexture;
    }
    hallMap.performerMat.needsUpdate = true;
    chromaVideoReady = true;

    if (showPlaying && activeMap === "hall") {
      const autoClipId = normalizeClipId(currentClipId) || DEFAULT_CLIP_ID;
      if (!socketConnected || isHostClient) {
        playPerformerClip(autoClipId, {
          record: false,
          broadcast: socketConnected && isHostClient,
          silent: true
        });
      } else {
        applyLatestNetworkClip({ force: true });
      }
    }

    chroma.addEventListener("error", () => {
      chromaVideoReady = false;
      const failedClipPath = String(chroma.getAttribute("src") || CLIP_VIDEO_PATHS[DEFAULT_CLIP_ID]);
      updateQueueUi(`\uD37C\uD3EC\uBA38 \uD074\uB9BD \uB85C\uB4DC \uC2E4\uD328: ${failedClipPath}`);
      appendChatLine("시스템", `퍼포머 클립 로드 실패: ${failedClipPath}`, "system");
    });

    bg.load();
    chroma.load();
  }

  function setScreenVideoEnabled(enabled) {
    const next = Boolean(enabled && stageVideoReady && stageVideoTexture);
    if (screenVideoEnabled === next) return;
    screenVideoEnabled = next;
    hallMap.screenMat.map = next ? stageVideoTexture : null;
    hallMap.screenMat.emissiveMap = next ? stageVideoTexture : null;
    hallMap.screenMat.needsUpdate = true;
  }

  function stopShowLocal(options = {}) {
    const { broadcast = false } = options;
    showPlaying = false;
    pendingShowStartFromHost = false;
    lastNetworkShowStartedAtMs = 0;
    lastNetworkActiveClipId = 0;
    setScreenVideoEnabled(false);

    if (stageVideo) {
      stageVideo.pause();
      stageVideo.currentTime = 0;
    }
    if (chromaVideo) {
      chromaVideo.pause();
      chromaVideo.currentTime = 0;
    }
    if (hallMap.performerPlane) {
      hallMap.performerPlane.visible = false;
    }

    queuePlaying = false;
    queuePlayIndex = 0;
    updateQueueUi();
    updateShowStartButton();

    if (broadcast && socketConnected && isHostClient && socket) {
      socket.emit("show:stop");
    }
  }

  function getNetworkShowOffsetSeconds() {
    if (!socketConnected || isHostClient) {
      return 0;
    }
    if (!Number.isFinite(lastNetworkShowStartedAtMs) || lastNetworkShowStartedAtMs <= 0) {
      return 0;
    }
    return Math.max(0, (Date.now() - lastNetworkShowStartedAtMs) / 1000);
  }

  function startShow(options = {}) {
    const { broadcast = true, allowNonHost = false, startOffsetSeconds = 0 } = options;

    if (socketConnected && broadcast && !isHostClient && !allowNonHost) {
      updateQueueUi("\uD638\uC2A4\uD2B8\uB9CC \uACF5\uC5F0\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
      return;
    }

    if (activeMap !== "hall" || !stageVideo || !stageVideoReady) {
      if (showPlaying) {
        pendingShowStartFromHost = true;
      }
      return;
    }

    pendingShowStartFromHost = false;
    showPlaying = true;
    stageVideo.pause();
    const offsetSec = Math.max(0, Number(startOffsetSeconds) || 0);
    if (Number.isFinite(stageVideo.duration) && stageVideo.duration > 0) {
      const safeMax = Math.max(0, stageVideo.duration - 0.05);
      stageVideo.currentTime = Math.min(offsetSec, safeMax);
    } else {
      stageVideo.currentTime = offsetSec;
    }
    stageVideo.muted = false;
    stageVideo.volume = 1.0;
    setScreenVideoEnabled(true);

    const stagePlay = stageVideo.play();
    if (stagePlay && typeof stagePlay.catch === "function") {
      stagePlay.catch(() => {});
    }

    if (chromaVideo) {
      chromaVideo.pause();
      chromaVideo.currentTime = 0;
    }
    if (hallMap.performerPlane) {
      hallMap.performerPlane.visible = false;
    }
    if (queuePlaying) {
      queuePlayIndex = 0;
    }

    updateShowStartButton();

    const startClipId = normalizeClipId(currentClipId) || DEFAULT_CLIP_ID;
    if (!socketConnected || isHostClient) {
      playPerformerClip(startClipId, {
        record: false,
        broadcast: socketConnected && isHostClient && broadcast,
        silent: true
      });
    }

    if (broadcast && socketConnected && isHostClient && socket) {
      socket.emit("show:start", { activeClip: startClipId });
    }

    applyLatestNetworkClip();
  }

  function syncShowMediaState() {
    const inHall = activeMap === "hall";
    if (!inHall || !showPlaying) {
      if (!inHall) {
        queueRecording = false;
        queuePlaying = false;
        queuePlayIndex = 0;
      }
      setScreenVideoEnabled(false);
      if (stageVideo) {
        stageVideo.pause();
      }
      if (chromaVideo) {
        chromaVideo.pause();
      }
      if (hallMap.performerPlane) {
        hallMap.performerPlane.visible = false;
      }
      updateQueueUi();
      return;
    }

    if (stageVideoReady && stageVideo && stageVideo.paused && !stageVideo.ended) {
      const stagePlay = stageVideo.play();
      if (stagePlay && typeof stagePlay.catch === "function") {
        stagePlay.catch(() => {});
      }
    }
  }


  function getSongTimeSeconds() {
    if (!stageVideo || !Number.isFinite(stageVideo.currentTime)) return 0;
    return Math.max(0, stageVideo.currentTime);
  }

  function normalizeClipId(value) {
    const clipId = Math.trunc(Number(value));
    if (!Number.isFinite(clipId)) return 0;
    if (clipId < 1 || clipId > CLIP_IDS.length) return 0;
    return clipId;
  }

  function applyLatestNetworkClip(options = {}) {
    const { force = false } = options;
    if (!socketConnected || isHostClient) return;
    if (!showPlaying || activeMap !== "hall") return;
    const clipId = normalizeClipId(lastNetworkActiveClipId);
    if (!clipId) return;

    const alreadyVisible =
      currentClipId === clipId &&
      Boolean(hallMap.performerPlane && hallMap.performerPlane.visible);
    if (!force && alreadyVisible) return;

    playPerformerClip(clipId, {
      record: false,
      broadcast: false,
      fromNetwork: true,
      silent: true
    });
  }

  function playPerformerClip(clipId, options = {}) {
    const {
      record = true,
      broadcast = socketConnected && isHostClient,
      fromNetwork = false,
      silent = false
    } = options;

    if (activeMap !== "hall") {
      if (!silent) {
        updateQueueUi("\uACF5\uC5F0\uC7A5 \uC548\uC5D0\uC11C\uB9CC \uB3D9\uC791\uD569\uB2C8\uB2E4.");
      }
      return;
    }

    if (!fromNetwork && !canControlShowOps()) {
      updateQueueUi("\uD638\uC2A4\uD2B8 \uC804\uC6A9 \uAE30\uB2A5\uC785\uB2C8\uB2E4.");
      return;
    }

    const nextClipId = normalizeClipId(clipId);
    if (!nextClipId) {
      return;
    }

    if (!chromaVideo || !chromaVideoReady) {
      if (!silent) {
        updateQueueUi("\uD074\uB9BD \uC601\uC0C1\uC744 \uC544\uC9C1 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      }
      return;
    }

    const nextSrc = CLIP_VIDEO_PATHS[nextClipId];
    const currentSrc = String(chromaVideo.getAttribute("src") || "");
    if (currentSrc !== nextSrc) {
      chromaVideo.pause();
      chromaVideo.setAttribute("src", nextSrc);
      chromaVideo.load();
    }

    chromaVideo.currentTime = 0;
    const playPromise = chromaVideo.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        const onCanPlay = () => {
          const retry = chromaVideo.play();
          if (retry && typeof retry.catch === "function") {
            retry.catch(() => {});
          }
        };
        chromaVideo.addEventListener("canplay", onCanPlay, { once: true });
      });
    }

    if (hallMap.performerPlane) {
      hallMap.performerPlane.visible = true;
    }

    currentClipId = nextClipId;
    if (fromNetwork) {
      lastNetworkActiveClipId = nextClipId;
    }
    updateClipButtons();

    if (broadcast && socketConnected && isHostClient && socket && !fromNetwork) {
      socket.emit("performer:clip", {
        clipId: nextClipId,
        songTime: Number(getSongTimeSeconds().toFixed(3)),
        ts: Date.now()
      });
    }

    if (record && queueRecording) {
      if (!showPlaying || !stageVideo || stageVideo.ended) {
        startShow();
      }
      const eventTime = Number(getSongTimeSeconds().toFixed(3));
      queueEvents.push({ t: eventTime, clip: nextClipId });
      queueEvents.sort((a, b) => a.t - b.t);
      updateQueueUi(`${queueEvents.length}\uAC1C \uD050 \uC800\uC7A5`);
    }
  }

function toggleQueueRecording() {
    if (activeMap !== "hall") {
      updateQueueUi("\uACF5\uC5F0\uC7A5 \uC548\uC5D0\uC11C\uB9CC \uB3D9\uC791\uD569\uB2C8\uB2E4.");
      return;
    }

    if (!canControlShowOps()) {
      updateQueueUi("\uD638\uC2A4\uD2B8 \uC804\uC6A9 \uAE30\uB2A5\uC785\uB2C8\uB2E4.");
      return;
    }

    queueRecording = !queueRecording;
    if (queueRecording) {
      queuePlaying = false;
      queuePlayIndex = 0;
      if (!showPlaying) {
        startShow();
      }
      updateQueueUi("\uD050 \uAE30\uB85D\uC744 \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }

    updateQueueUi("\uD050 \uAE30\uB85D\uC744 \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4.");
  }

function startQueuePlayback(resetSong) {
    if (activeMap !== "hall") {
      updateQueueUi("\uACF5\uC5F0\uC7A5 \uC548\uC5D0\uC11C\uB9CC \uB3D9\uC791\uD569\uB2C8\uB2E4.");
      return;
    }
    if (!canControlShowOps()) {
      updateQueueUi("\uD638\uC2A4\uD2B8 \uC804\uC6A9 \uAE30\uB2A5\uC785\uB2C8\uB2E4.");
      return;
    }
    if (queueEvents.length === 0) {
      updateQueueUi("\uC7AC\uC0DD\uD560 \uD050\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
      return;
    }

    queueRecording = false;
    queuePlaying = true;
    queuePlayIndex = 0;

    if (resetSong || !showPlaying || !stageVideo || stageVideo.ended) {
      startShow();
    }
    updateQueueUi("\uD050 \uC7AC\uC0DD \uC2DC\uC791");
  }

function processQueuePlayback() {
    if (!queuePlaying || !showPlaying || !stageVideo) {
      return;
    }

    const now = getSongTimeSeconds();
    while (queuePlayIndex < queueEvents.length && now >= queueEvents[queuePlayIndex].t - 0.005) {
      const event = queueEvents[queuePlayIndex];
      playPerformerClip(event.clip, { record: false });
      queuePlayIndex += 1;
    }

    if (queuePlayIndex >= queueEvents.length && !queueLoop) {
      queuePlaying = false;
      updateQueueUi("\uD050 \uC7AC\uC0DD \uC644\uB8CC");
    }
  }

function saveQueueToStorage() {
    if (!canControlShowOps()) {
      updateQueueUi("\uD638\uC2A4\uD2B8 \uC804\uC6A9 \uAE30\uB2A5\uC785\uB2C8\uB2E4.");
      return;
    }
    try {
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        events: queueEvents
      };
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(payload));
      updateQueueUi("\uD050\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.");
    } catch (error) {
      updateQueueUi("\uD050 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }

function loadQueueFromStorage(silent) {
    try {
      const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) {
        if (!silent) {
          updateQueueUi("\uC800\uC7A5\uB41C \uD050\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
        } else {
          updateQueueUi();
        }
        return;
      }

      const parsed = JSON.parse(raw);
      const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.events) ? parsed.events : [];
      queueEvents = source
        .map((entry) => {
          const clip = Number(entry?.clip);
          const t = Number(entry?.t ?? entry?.time);
          return { clip, t };
        })
        .filter((entry) => Number.isInteger(entry.clip) && entry.clip >= 1 && entry.clip <= CLIP_IDS.length && Number.isFinite(entry.t) && entry.t >= 0)
        .sort((a, b) => a.t - b.t);

      queuePlayIndex = 0;
      if (!silent) {
        updateQueueUi("\uC800\uC7A5\uB41C \uD050\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.");
      } else {
        updateQueueUi();
      }
    } catch (error) {
      updateQueueUi("\uD050 \uB85C\uB4DC\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }

function clearQueueEvents() {
    if (!canControlShowOps()) {
      updateQueueUi("\uD638\uC2A4\uD2B8 \uC804\uC6A9 \uAE30\uB2A5\uC785\uB2C8\uB2E4.");
      return;
    }
    queueRecording = false;
    queuePlaying = false;
    queuePlayIndex = 0;
    queueEvents = [];
    queueLastMessage = "";
    updateQueueUi("\uD050\uB97C \uCD08\uAE30\uD654\uD588\uC2B5\uB2C8\uB2E4.");
  }

function canControlShowOps() {
    return !socketConnected || isHostClient;
  }

function updateClipButtons() {
    const canControl = canControlShowOps();
    dom.clipButtons.forEach((button) => {
      const clipId = Number(button.dataset.clipId || 0);
      button.classList.toggle("active", clipId === currentClipId);
      button.disabled = activeMap !== "hall" || !canControl;
    });
  }

  function updateQueueUi(message) {
    if (typeof message === "string") {
      queueLastMessage = message;
    }

    updateClipButtons();
    const hallOnly = activeMap === "hall";
    const canControl = canControlShowOps();

    if (dom.queueRecordBtn) {
      dom.queueRecordBtn.classList.toggle("active", queueRecording);
      dom.queueRecordBtn.textContent = queueRecording ? "큐 기록 중" : "큐 기록 시작";
      dom.queueRecordBtn.disabled = !hallOnly || !canControl;
    }

    if (dom.queuePlayBtn) {
      dom.queuePlayBtn.classList.toggle("active", queuePlaying);
      dom.queuePlayBtn.textContent = queuePlaying ? "큐 재생 중" : "큐 재생";
      dom.queuePlayBtn.disabled = !hallOnly || !canControl || queueEvents.length === 0;
    }

    if (dom.queueLoopBtn) {
      dom.queueLoopBtn.classList.toggle("active", queueLoop);
      dom.queueLoopBtn.textContent = queueLoop ? "루프 켜짐" : "루프 꺼짐";
      dom.queueLoopBtn.disabled = !hallOnly || !canControl;
    }

    if (dom.queueSaveBtn) {
      dom.queueSaveBtn.disabled = !canControl || queueEvents.length === 0;
    }

    if (dom.queueLoadBtn) {
      dom.queueLoadBtn.disabled = !canControl;
    }

    if (dom.queueClearBtn) {
      dom.queueClearBtn.disabled = !canControl;
    }

    if (dom.queueStatus) {
      const base = `큐 ${queueRecording ? "기록" : "대기"} | 이벤트 ${queueEvents.length}개 | ${queuePlaying ? "재생 중" : "재생 대기"}`;
      const roleText = canControl ? "조작 가능" : "호스트 전용";
      const withRole = `${base} | ${roleText}`;
      dom.queueStatus.textContent = queueLastMessage ? `${withRole} | ${queueLastMessage}` : withRole;
    }
  }

function updateShowStartButton() {
    if (!dom.showStartBtn) return;
    const hallOnly = activeMap === "hall";
    dom.showStartBtn.classList.toggle("hidden", !hallOnly);

    if (socketConnected && !isHostClient) {
      dom.showStartBtn.disabled = true;
      dom.showStartBtn.textContent = "\uD638\uC2A4\uD2B8 \uC804\uC6A9";
      return;
    }

    dom.showStartBtn.disabled = !hallOnly || !stageVideoReady;
    dom.showStartBtn.textContent = showPlaying ? "\uACF5\uC5F0 \uC7AC\uC2DC\uC791" : "\uACF5\uC5F0 \uC2DC\uC791";
  }

function updateHud() {
    dom.hudMap.textContent = MAP_META[activeMap].label;
    dom.hudFps.textContent = String(fpsValue);
    dom.hudSeats.textContent = String(activeAudience);
    dom.hudQuality.textContent = ({ low: "\uB0AE\uC74C", medium: "\uBCF4\uD1B5", high: "\uB192\uC74C" })[qualityMode] || "\uBCF4\uD1B5";
    if (!doorOpen) {
      dom.hudPortal.textContent = "\uB2EB\uD798";
    } else if (activeMap === "lobby" && portalState.phase !== "open") {
      dom.hudPortal.textContent = portalState.phase === "warning"
        ? "\uC900\uBE44 " + portalState.secondsLeft + "s"
        : "\uCDA9\uC804 " + portalState.secondsLeft + "s";
    } else if (activeMap === "lobby") {
      dom.hudPortal.textContent = "\uAC1C\uBC29";
    } else {
      dom.hudPortal.textContent = "\uC5F4\uB9BC";
    }
    dom.hudDrawcalls.textContent = String(renderer.info.render.calls || 0);

    if (dom.hudStatus) {
      dom.hudStatus.textContent = getHudStatusText();
    }
    if (dom.hudPlayers) {
      dom.hudPlayers.textContent = String(roomPopulation);
    }
    if (dom.hudPosition) {
      dom.hudPosition.textContent = `${Math.round(camera.position.x)}, ${Math.round(camera.position.z)}`;
    }
    if (dom.hudFpsMini) {
      dom.hudFpsMini.textContent = String(fpsValue);
    }
  }

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function setElementHidden(element, hidden) {
    if (!element) return;
    element.classList.toggle("hidden", Boolean(hidden));
  }

  function applyUiVisibilityMode() {
    const hideOptionalUi = !adminUiMode;
    setElementHidden(dom.introStats, hideOptionalUi);
    setElementHidden(dom.occupancyRow, hideOptionalUi);
    setElementHidden(dom.networkPanel, hideOptionalUi);
    setElementHidden(dom.chatUi, !chatEnabled);
    setElementHidden(dom.hudSeatsChip, hideOptionalUi);
    setElementHidden(dom.hudPlayersRow, true);
    setElementHidden(dom.statCapacityCard, true);

    if (hideOptionalUi) {
      activeAudience = CAPACITY;
      if (dom.occupancyRange) {
        dom.occupancyRange.value = String(CAPACITY);
        dom.occupancyRange.disabled = true;
      }
      if (dom.occupancyLabel) {
        dom.occupancyLabel.textContent = "";
      }
      if (dom.statSeats) {
        dom.statSeats.textContent = "";
      }
    }
  }

  function getLobbyHalfWidth(z) {
    return z > LOBBY_BOUNDS.corridorStartZ ? LOBBY_BOUNDS.corridorHalfWidth : LOBBY_BOUNDS.lobbyHalfWidth;
  }

  function clampLobbyPoint(point) {
    point.z = clampNumber(point.z, LOBBY_BOUNDS.minZ, LOBBY_BOUNDS.maxZ);
    const halfWidth = getLobbyHalfWidth(point.z);
    point.x = clampNumber(point.x, -halfWidth, halfWidth);
  }

  function resolveLobbyHorizontalPosition(nextPos) {
    clampLobbyPoint(nextPos);

    if (doorOpen) return;
    if (Math.abs(nextPos.x) > LOBBY_BOUNDS.closedDoorHalfGap) return;
    if (nextPos.z <= LOBBY_BOUNDS.closedDoorBarrierZ) return;

    nextPos.z = LOBBY_BOUNDS.closedDoorBarrierZ;
  }

  function isInsideHallStage(x, z, margin = 0) {
    return (
      x >= HALL_STAGE_BOUNDS.minX + margin &&
      x <= HALL_STAGE_BOUNDS.maxX - margin &&
      z >= HALL_STAGE_BOUNDS.minZ + margin &&
      z <= HALL_STAGE_BOUNDS.maxZ - margin
    );
  }

  function resolveHallHorizontalPosition(nextPos, prevPos) {
    nextPos.x = clampNumber(nextPos.x, -44, 44);
    nextPos.z = clampNumber(nextPos.z, 38, 160);

    const stageMinX = HALL_STAGE_BOUNDS.minX - PLAYER_COLLISION_RADIUS;
    const stageMaxX = HALL_STAGE_BOUNDS.maxX + PLAYER_COLLISION_RADIUS;
    const stageMinZ = HALL_STAGE_BOUNDS.minZ - PLAYER_COLLISION_RADIUS;
    const stageMaxZ = HALL_STAGE_BOUNDS.maxZ + PLAYER_COLLISION_RADIUS;

    const insideStageWall =
      nextPos.x >= stageMinX &&
      nextPos.x <= stageMaxX &&
      nextPos.z >= stageMinZ &&
      nextPos.z <= stageMaxZ;

    const canEnterStage = playerFootY >= HALL_STAGE_BOUNDS.height - 1.0;
    if (insideStageWall && !canEnterStage) {
      if (prevPos.z <= stageMinZ) {
        nextPos.z = stageMinZ;
      } else if (prevPos.z >= stageMaxZ) {
        nextPos.z = stageMaxZ;
      } else if (prevPos.x <= stageMinX) {
        nextPos.x = stageMinX;
      } else if (prevPos.x >= stageMaxX) {
        nextPos.x = stageMaxX;
      } else {
        const distances = [
          Math.abs(nextPos.z - stageMinZ),
          Math.abs(stageMaxZ - nextPos.z),
          Math.abs(nextPos.x - stageMinX),
          Math.abs(stageMaxX - nextPos.x)
        ];
        const minDistance = Math.min(...distances);
        if (minDistance === distances[0]) nextPos.z = stageMinZ;
        else if (minDistance === distances[1]) nextPos.z = stageMaxZ;
        else if (minDistance === distances[2]) nextPos.x = stageMinX;
        else nextPos.x = stageMaxX;
      }
    }

    resolveHallSeatCollisions(nextPos, prevPos);
  }

  function resolveHallSeatCollisions(nextPos, prevPos) {
    if (!hallSeatColliders.length) return;

    for (let i = 0; i < hallSeatColliders.length; i += 1) {
      const seat = hallSeatColliders[i];
      const minDist = PLAYER_COLLISION_RADIUS + seat.radius;
      const minDistSq = minDist * minDist;
      const dx = nextPos.x - seat.x;
      const dz = nextPos.z - seat.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDistSq) continue;

      let pushX = dx;
      let pushZ = dz;

      if (Math.abs(pushX) < 1e-5 && Math.abs(pushZ) < 1e-5) {
        const prevX = Number.isFinite(prevPos?.x) ? prevPos.x : seat.x + 1;
        const prevZ = Number.isFinite(prevPos?.z) ? prevPos.z : seat.z;
        pushX = nextPos.x - prevX;
        pushZ = nextPos.z - prevZ;
      }

      if (Math.abs(pushX) < 1e-5 && Math.abs(pushZ) < 1e-5) {
        pushX = 1;
        pushZ = 0;
      }

      const len = Math.hypot(pushX, pushZ) || 1;
      nextPos.x = seat.x + (pushX / len) * minDist;
      nextPos.z = seat.z + (pushZ / len) * minDist;
    }
  }

  function getGroundHeightAt(x, z, mapName) {
    if (mapName === "hall" && isInsideHallStage(x, z)) {
      return HALL_STAGE_BOUNDS.height;
    }
    return 0;
  }

  function syncPlayerHeightToGround(options = {}) {
    const { resetVelocity = true } = options;
    playerFootY = getGroundHeightAt(camera.position.x, camera.position.z, activeMap);
    if (resetVelocity) {
      playerVelocityY = 0;
    }
    playerGrounded = true;
    camera.position.y = playerFootY + PLAYER_EYE_HEIGHT[activeMap];
  }

  function applyCameraCollision() {
    if (activeMap === "lobby") {
      if (firstPersonEnabled) {
        resolveLobbyHorizontalPosition(camera.position);
        return;
      }
      clampLobbyPoint(camera.position);
      clampLobbyPoint(controls.target);
      camera.position.y = clampNumber(camera.position.y, 1.6, 16);
      controls.target.y = clampNumber(controls.target.y, 1.2, 7.5);
      return;
    }

    if (firstPersonEnabled) {
      resolveHallHorizontalPosition(camera.position, camera.position);
      return;
    }

    camera.position.x = clampNumber(camera.position.x, -44, 44);
    camera.position.z = clampNumber(camera.position.z, 38, 160);
    camera.position.y = clampNumber(camera.position.y, 2, 32);
    controls.target.x = clampNumber(controls.target.x, -42, 42);
    controls.target.z = clampNumber(controls.target.z, 44, 158);
    controls.target.y = clampNumber(controls.target.y, 1.2, 18);
  }

  function animateLobby(time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    const phase = doorOpen ? portalState.phase : "locked";

    let ringColor = 0x53d8ff;
    let ringIntensity = 0.38;
    let coreOpacity = 0.14;
    let glowOpacity = 0.2;
    let scale = 1 + pulse * 0.015;

    if (phase === "warning") {
      ringColor = 0xffb84d;
      ringIntensity = 0.65 + pulse * 0.42;
      coreOpacity = 0.17 + pulse * 0.18;
      glowOpacity = 0.24 + pulse * 0.2;
      scale = 1 + pulse * 0.024;
    } else if (phase === "open") {
      ringColor = 0x35ef8d;
      ringIntensity = 0.94 + pulse * 0.76;
      coreOpacity = 0.22 + pulse * 0.24;
      glowOpacity = 0.34 + pulse * 0.28;
      scale = 1 + pulse * 0.042;
    } else if (phase === "locked") {
      ringColor = 0xff4d73;
      ringIntensity = 0.26 + pulse * 0.16;
      coreOpacity = 0.1 + pulse * 0.08;
      glowOpacity = 0.12 + pulse * 0.1;
      scale = 0.985 + pulse * 0.01;
    }

    lobbyMap.portalRing.material.color.setHex(ringColor);
    lobbyMap.portalRing.material.emissive.setHex(ringColor);
    lobbyMap.portalCore.material.color.setHex(ringColor);
    lobbyMap.portalGlow.material.color.setHex(ringColor);
    lobbyMap.portalRing.material.emissiveIntensity = ringIntensity;
    lobbyMap.portalCore.material.opacity = coreOpacity;
    lobbyMap.portalGlow.material.opacity = glowOpacity;
    lobbyMap.portalGroup.scale.setScalar(scale);

    lobbyMap.corridorStrips.forEach((strip, index) => {
      const phaseBoost = phase === "open" ? 0.22 : phase === "warning" ? 0.14 : 0.08;
      strip.material.emissiveIntensity = 0.12 + phaseBoost + Math.sin(time * 2.2 + index * 0.4) * 0.12;
    });
  }

  function animateHall(time, delta) {
    const mode = SHOW_MODES[showMode] || SHOW_MODES.live;
    const hue = (time * 0.045 + 0.55) % 1;
    const pulse = 0.5 + Math.sin(time * 2.4) * mode.screenPulse;
    const usingVideoScreen = stageVideoReady && stageVideo && !stageVideo.paused;
    if (!usingVideoScreen) {
      hallMap.screenMat.emissive.setHSL(hue, 0.84, Math.max(0.25, pulse));
      hallMap.screenMat.color.setHSL(hue, 0.76, 0.48);
    } else {
      hallMap.screenMat.color.set(0xffffff);
      hallMap.screenMat.emissive.set(0xffffff);
      hallMap.screenMat.emissiveIntensity = 1.05;
    }
    hallMap.edgeMat.emissiveIntensity = 0.42 + Math.sin(time * 3.8) * (0.12 + mode.screenPulse * 0.42);

    hallMap.movingLights.forEach((entry, index) => {
      entry.target.position.x = Math.sin(time * entry.speedX + entry.offset) * 18;
      entry.target.position.z = -58 + Math.cos(time * entry.speedZ + entry.offset + index * 0.3) * 12;
      entry.beam.lookAt(entry.target.position);
      entry.light.intensity = entry.baseIntensity * mode.lightBoost;
      entry.beam.material.opacity = 0.08 + mode.screenPulse * 0.12;
    });

    updateShowFlashes(mode, time, delta);
    updateFireworks(mode, delta);

    if (!hallMap.particles.visible) return;
    const positions = hallMap.particles.geometry.attributes.position.array;
    for (let i = 0; i < hallMap.particleCount; i += 1) {
      const idx = i * 3;
      positions[idx + 1] -= hallMap.particleVelocities[i] * (0.62 + mode.lightBoost * 0.48);
      if (positions[idx + 1] < 1.1) {
        positions[idx] = (Math.random() - 0.5) * 70;
        positions[idx + 1] = Math.random() * 26 + 2;
        positions[idx + 2] = (Math.random() - 0.5) * 70 - 48;
      }
    }
    hallMap.particles.rotation.y += 0.001;
    hallMap.particles.geometry.attributes.position.needsUpdate = true;
  }

  function updateShowFlashes(mode, time, delta) {
    if (!hallMap.strobeLight) return;

    if (!showPlaying || activeMap !== "hall") {
      hallMap.strobeLight.intensity = Math.max(0, hallMap.strobeLight.intensity - delta * 8);
      return;
    }

    const rhythm = Math.max(0, Math.sin(time * (9.2 + mode.strobeStrength * 8)));
    const baseFlash = rhythm * (0.7 + mode.strobeStrength * 1.9);
    const randomHit = Math.random() < delta * (0.8 + mode.strobeStrength * 2.4) ? (1.4 + mode.strobeStrength * 1.8) : 0;
    const nextIntensity = Math.min(5.2, baseFlash + randomHit);

    hallMap.strobeLight.intensity += (nextIntensity - hallMap.strobeLight.intensity) * 0.7;
    if (nextIntensity > 1.4) {
      hallMap.edgeMat.emissiveIntensity = Math.min(2.5, hallMap.edgeMat.emissiveIntensity + nextIntensity * 0.12);
    }
  }

  function updateFireworks(mode, delta) {
    const fx = hallMap.fireworks;
    if (!fx) return;

    const canBurst = showPlaying && activeMap === "hall";
    if (canBurst) {
      fx.cooldown -= delta;
      if (fx.cooldown <= 0) {
        spawnFireworkBurst(fx, mode);
        const baseGap = Math.max(0.15, 1.0 - mode.fireworksRate * 0.82);
        fx.cooldown = baseGap + Math.random() * 0.4;
      }
    }

    let activeCount = 0;
    const positions = fx.positions;
    const velocity = fx.velocity;
    const life = fx.life;

    for (let i = 0; i < fx.count; i += 1) {
      if (life[i] <= 0) continue;
      life[i] -= delta;
      if (life[i] <= 0) {
        positions[i * 3 + 1] = -999;
        continue;
      }

      const idx = i * 3;
      velocity[idx + 1] -= delta * 2.4;
      positions[idx] += velocity[idx] * delta;
      positions[idx + 1] += velocity[idx + 1] * delta;
      positions[idx + 2] += velocity[idx + 2] * delta;
      activeCount += 1;
    }

    fx.points.visible = activeCount > 0 && activeMap === "hall";
    fx.geometry.attributes.position.needsUpdate = true;
  }

  function spawnFireworkBurst(fx, mode) {
    const colorHex = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
    const color = new THREE.Color(colorHex);
    const burstCount = Math.max(14, Math.round(fx.baseBurst * mode.fireworkBurstScale));

    const originX = (Math.random() - 0.5) * 56;
    const originY = 8 + Math.random() * 9;
    const originZ = -84 + Math.random() * 24;

    for (let i = 0; i < burstCount; i += 1) {
      const pIndex = fx.cursor;
      const idx = pIndex * 3;
      const azimuth = Math.random() * Math.PI * 2;
      const elevation = 0.2 + Math.random() * 0.95;
      const speed = 7 + Math.random() * 11;

      fx.positions[idx] = originX;
      fx.positions[idx + 1] = originY;
      fx.positions[idx + 2] = originZ;

      fx.velocity[idx] = Math.cos(azimuth) * Math.sin(elevation) * speed;
      fx.velocity[idx + 1] = Math.cos(elevation) * speed + 2.2;
      fx.velocity[idx + 2] = Math.sin(azimuth) * Math.sin(elevation) * speed;

      fx.colors[idx] = color.r * (0.86 + Math.random() * 0.18);
      fx.colors[idx + 1] = color.g * (0.86 + Math.random() * 0.18);
      fx.colors[idx + 2] = color.b * (0.86 + Math.random() * 0.18);

      fx.life[pIndex] = 0.65 + Math.random() * 0.55;
      fx.cursor = (fx.cursor + 1) % fx.count;
    }

    fx.points.visible = true;
    fx.geometry.attributes.position.needsUpdate = true;
    fx.geometry.attributes.color.needsUpdate = true;
  }

  setMap("lobby", true);
  applyQuality();
  updateUiByMap();

  const clock = new THREE.Clock();
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    applyQuality();
  });

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();
    refreshPortalState(false);

    if (cameraTween) {
      const progress = Math.min((performance.now() - cameraTween.start) / cameraTween.duration, 1);
      const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      camera.position.lerpVectors(cameraTween.fromPos, cameraTween.toPos, eased);
      controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
      if (progress >= 1) {
        activePreset = cameraTween.presetName;
        cameraTween = null;
        updatePresetButtons();
        updateQueueUi();
        syncYawPitchFromCamera();
      }
    }

    if (activeMap === "lobby") {
      animateLobby(elapsed);
      hallMap.particles.visible = false;
    } else {
      animateHall(elapsed, delta);
      hallMap.particles.visible = QUALITY_MODES[qualityMode].particles;
    }
    updateDoorVisuals();
    updateRemotePlayers(elapsed, delta);
    processQueuePlayback();

    if (firstPersonEnabled) {
      updateFirstPersonMovement(delta);
      camera.rotation.order = "YXZ";
      camera.rotation.y = playerYaw;
      camera.rotation.x = playerPitch;
      syncOrbitTargetToCamera();
    } else {
      controls.update();
    }

    applyCameraCollision();
    emitLocalPlayerState(false);
    renderer.render(scene, camera);

    fpsFrames += 1;
    fpsClock += delta;
    if (fpsClock >= 0.35) {
      fpsValue = Math.max(1, Math.round(fpsFrames / fpsClock));
      fpsFrames = 0;
      fpsClock = 0;
      updateHud();
    }

    if (!loadingHidden && !transitionInFlight && elapsed > 0.65) {
      dom.loading.classList.add("hidden");
      loadingHidden = true;
    }
  }

  animate();

  function updateDoorVisuals() {
    if (!lobbyMap.doorLeft || !lobbyMap.doorRight || !lobbyMap.doorGlow) {
      return;
    }
    doorSlide += (doorTarget - doorSlide) * 0.16;
    if (Math.abs(doorTarget - doorSlide) < 0.001) {
      doorSlide = doorTarget;
    }

    const closedOffset = 0.96;
    const openOffset = 2.36;
    const offset = closedOffset + (openOffset - closedOffset) * doorSlide;

    lobbyMap.doorLeft.position.x = -offset;
    lobbyMap.doorRight.position.x = offset;
    lobbyMap.doorGlow.material.emissiveIntensity = 0.12 + doorSlide * 0.46;
  }


  function setupFirstPersonControls() {
    setFirstPersonEnabled(!isHostClient, { requestLock: false });
    updateFirstPersonUi();
  }

  function toggleFirstPerson() {
    setFirstPersonEnabled(!firstPersonEnabled, { requestLock: true });
  }

  function setFirstPersonEnabled(enabled, options = {}) {
    const { requestLock = true } = options;
    firstPersonEnabled = Boolean(enabled);
    controls.enabled = !firstPersonEnabled;
    if (firstPersonEnabled) {
      cameraTween = null;
      syncYawPitchFromCamera();
      syncPlayerHeightToGround({ resetVelocity: true });
      if (requestLock) {
        tryPointerLock();
      }
    } else if (document.pointerLockElement === renderer.domElement) {
      if (typeof document.exitPointerLock === "function") {
        document.exitPointerLock();
      }
    }
    updateFirstPersonUi();
    updateHud();
  }

  function tryPointerLock() {
    if (!firstPersonEnabled || document.pointerLockElement === renderer.domElement) {
      return;
    }
    const request = renderer.domElement.requestPointerLock;
    if (typeof request === "function") {
      request.call(renderer.domElement);
    }
  }

  function syncYawPitchFromCamera() {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    playerYaw = Math.atan2(-forward.x, -forward.z);
    playerPitch = THREE.MathUtils.clamp(Math.asin(clampNumber(forward.y, -1, 1)), -1.45, 1.45);
  }

  function updateFirstPersonUi() {
    if (!dom.fpsToggleBtn) return;
    dom.fpsToggleBtn.textContent = firstPersonEnabled ? "1\uC778\uCE6D \uBAA8\uB4DC \uB044\uAE30 (F)" : "1\uC778\uCE6D \uBAA8\uB4DC \uCF1C\uAE30 (F)";
    dom.fpsToggleBtn.classList.toggle("active", firstPersonEnabled);
  }

function setMovementKeyState(key, code, pressed) {
    if (key === "w" || key === "arrowup" || code === "keyw") moveState.forward = pressed;
    if (key === "s" || key === "arrowdown" || code === "keys") moveState.backward = pressed;
    if (key === "a" || key === "arrowleft" || code === "keya") moveState.left = pressed;
    if (key === "d" || key === "arrowright" || code === "keyd") moveState.right = pressed;
    if (key === "shift" || code === "shiftleft" || code === "shiftright") moveState.run = pressed;
    if (key === " " || key === "space" || key === "spacebar" || code === "space") moveState.jump = pressed;
  }

  function updateFirstPersonMovement(delta) {
    if (!firstPersonEnabled) {
      return;
    }

    const previousPos = camera.position.clone();

    const forwardIntent = (moveState.forward ? 1 : 0) - (moveState.backward ? 1 : 0);
    const strafeIntent = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);
    const speed = PLAYER_MOVE_SPEED * (moveState.run ? PLAYER_RUN_MULTIPLIER : 1);

    const nextPos = camera.position.clone();
    if (forwardIntent !== 0 || strafeIntent !== 0) {
      const forward = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
      const right = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
      const movement = new THREE.Vector3();
      movement.addScaledVector(forward, forwardIntent);
      movement.addScaledVector(right, strafeIntent);

      if (movement.lengthSq() > 0.0001) {
        movement.normalize().multiplyScalar(speed * delta);
        nextPos.add(movement);
      }
    }

    if (activeMap === "lobby") {
      resolveLobbyHorizontalPosition(nextPos);
    } else {
      resolveHallHorizontalPosition(nextPos, previousPos);
    }

    camera.position.x = nextPos.x;
    camera.position.z = nextPos.z;

    if (moveState.jump && playerGrounded) {
      playerVelocityY = PLAYER_JUMP_SPEED;
      playerGrounded = false;
      moveState.jump = false;
    }

    playerVelocityY -= PLAYER_GRAVITY * delta;
    playerFootY += playerVelocityY * delta;

    const groundY = getGroundHeightAt(camera.position.x, camera.position.z, activeMap);
    if (playerFootY <= groundY) {
      playerFootY = groundY;
      playerVelocityY = 0;
      playerGrounded = true;
    } else {
      playerGrounded = false;
    }

    camera.position.y = playerFootY + PLAYER_EYE_HEIGHT[activeMap];
  }

  function syncOrbitTargetToCamera() {
    const lookDirection = new THREE.Vector3(-Math.sin(playerYaw), Math.sin(playerPitch), -Math.cos(playerYaw));
    controls.target.copy(camera.position).addScaledVector(lookDirection, 7);
  }

  function setupPlayerSystem() {
    remotePlayers.clear();
    roomPopulation = 1;
    updateRemotePlayerVisibility();
  }

function clearRemotePlayers() {
    remotePlayers.forEach((remote) => {
      if (remote.mesh && remote.mesh.parent) {
        remote.mesh.parent.remove(remote.mesh);
      }
    });
    remotePlayers.clear();
    roomPopulation = 1;
    updateHud();
  }

function getLocalPlayerState() {
    camera.getWorldDirection(cameraDirectionTemp);
    const yaw = firstPersonEnabled ? playerYaw : Math.atan2(-cameraDirectionTemp.x, -cameraDirectionTemp.z);
    const pitch = firstPersonEnabled
      ? playerPitch
      : THREE.MathUtils.clamp(Math.asin(clampNumber(cameraDirectionTemp.y, -1, 1)), -1.45, 1.45);

    const eyeHeight = PLAYER_EYE_HEIGHT[activeMap] || 2.2;
    const syncedEyeY = firstPersonEnabled
      ? camera.position.y
      : getGroundHeightAt(camera.position.x, camera.position.z, activeMap) + eyeHeight;

    return {
      x: camera.position.x,
      y: syncedEyeY,
      z: camera.position.z,
      yaw,
      pitch,
      map: activeMap,
      ts: Date.now()
    };
  }

function emitLocalPlayerState(force) {
    if (!socketConnected || !socket) return;
    if (!force && stateSendAccumulator < PLAYER_STATE_SEND_INTERVAL) {
      return;
    }

    stateSendAccumulator = 0;
    socket.emit("player:state", getLocalPlayerState());
  }

function updateNetworkNoteStatus() {
    if (!dom.networkNote) return;
    const requested = hostMode ? "호스트" : "플레이어";
    const granted = roomHostId
      ? (roomHostId === selfSocketId ? "내가 호스트" : "다른 유저가 호스트")
      : "호스트 없음";
    dom.networkNote.textContent = `요청 역할: ${requested} | 현재 권한: ${granted} | 룸 ${networkRoomId}`;
  }

function setHostRole(nextHostId) {
    roomHostId = nextHostId || null;
    isHostClient = roomHostId ? roomHostId === selfSocketId : hostMode;

    if (!isHostClient && !firstPersonEnabled) {
      setFirstPersonEnabled(true, { requestLock: false });
    }

    if (dom.fpsToggleBtn) {
      dom.fpsToggleBtn.classList.toggle("hidden", !isHostClient);
    }

    if (dom.hostDoorBtn) {
      dom.hostDoorBtn.classList.toggle("hidden", !isHostClient);
      dom.hostDoorBtn.disabled = !isHostClient;
      if (!isHostClient) {
        dom.hostDoorBtn.textContent = "\uD638\uC2A4\uD2B8 \uC804\uC6A9";
      } else {
        dom.hostDoorBtn.textContent = doorOpen ? "\uD638\uC2A4\uD2B8 \uBB38 \uB2EB\uAE30" : "\uD638\uC2A4\uD2B8 \uBB38 \uC5F4\uAE30";
      }
    }

    updateShowStartButton();
    updateDoorUi();
    updateHud();
    updateNetworkNoteStatus();
  }

function applyRoomSnapshot(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.players)) return;

    const seen = new Set();

    snapshot.players.forEach((entry) => {
      if (!entry || !entry.id) return;
      if (entry.id === selfSocketId) return;
      seen.add(entry.id);
      upsertRemotePlayer(entry);
    });

    remotePlayers.forEach((_, id) => {
      if (!seen.has(id)) {
        removeRemotePlayerById(id);
      }
    });

    roomPopulation = Math.max(1, Number(snapshot.players.length) || 1);
    updateRemotePlayerVisibility();
    updateHud();
  }

function upsertRemotePlayer(entry) {
    const remoteMap = entry.map === "hall" ? "hall" : "lobby";
    const entryX = Number(entry.x) || 0;
    const entryZ = Number(entry.z) || 0;
    const entryY = Number(entry.y);
    const remoteEyeHeight = PLAYER_EYE_HEIGHT[remoteMap] || 2.2;
    const groundY = getGroundHeightAt(entryX, entryZ, remoteMap);
    const footY = Number.isFinite(entryY)
      ? Math.max(groundY, entryY - remoteEyeHeight)
      : groundY;

    let remote = remotePlayers.get(entry.id);
    if (!remote) {
      const avatar = createPlayerAvatar(entry.name);
      avatar.position.set(entryX, footY, entryZ);
      avatar.rotation.y = Number(entry.yaw) || 0;
      playerLayer.add(avatar);

      remote = {
        id: entry.id,
        map: remoteMap,
        mesh: avatar,
        targetPos: new THREE.Vector3(entryX, footY, entryZ),
        targetYaw: Number(entry.yaw) || 0,
        inActiveMap: false
      };

      remotePlayers.set(entry.id, remote);
    }

    remote.map = remoteMap;
    remote.targetPos.set(entryX, footY, entryZ);
    remote.targetYaw = Number(entry.yaw) || 0;
    remote.mesh.userData.playerName = String(entry.name || remote.mesh.userData.playerName || "\uD50C\uB808\uC774\uC5B4");
  }

function removeRemotePlayerById(playerId) {
    const remote = remotePlayers.get(playerId);
    if (!remote) return;

    if (remote.mesh && remote.mesh.parent) {
      remote.mesh.parent.remove(remote.mesh);
    }

    remotePlayers.delete(playerId);
  }

function applyShowStateFromNetwork(showState, force) {
    const nextPlaying = Boolean(showState && showState.playing);
    const startedAt = Number((showState && showState.startedAt) || 0);
    const activeClipId = normalizeClipId(showState && showState.activeClip);
    const showChanged = lastNetworkShowPlaying !== nextPlaying;
    const clipChanged = activeClipId > 0 && activeClipId !== lastNetworkActiveClipId;

    if (!force && !showChanged && !clipChanged) {
      return;
    }

    if (startedAt > 0) {
      lastNetworkShowStartedAtMs = startedAt;
    }

    if (!nextPlaying) {
      lastNetworkActiveClipId = 0;
    } else if (activeClipId > 0) {
      lastNetworkActiveClipId = activeClipId;
    }

    if (!showChanged && !force && nextPlaying && clipChanged) {
      applyLatestNetworkClip({ force: true });
      return;
    }

    lastNetworkShowPlaying = nextPlaying;

    if (nextPlaying) {
      showPlaying = true;
      const offsetSec = getNetworkShowOffsetSeconds();
      if (activeMap === "hall" && stageVideoReady) {
        startShow({ broadcast: false, allowNonHost: true, startOffsetSeconds: offsetSec });
      } else {
        pendingShowStartFromHost = true;
        updateShowStartButton();
      }
      updateQueueUi("\uD638\uC2A4\uD2B8\uAC00 \uACF5\uC5F0\uC744 \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4.");
      applyLatestNetworkClip({ force: true });
      return;
    }

    stopShowLocal({ broadcast: false });
    updateQueueUi("\uD638\uC2A4\uD2B8\uAC00 \uACF5\uC5F0\uC744 \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4.");
  }

function setupRealtime() {
    if (typeof window.io !== "function") {
      appendChatLine("\uC2DC\uC2A4\uD15C", "\uC2E4\uC2DC\uAC04 \uC11C\uBC84\uC5D0 \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC544 \uC624\uD504\uB77C\uC778 \uBAA8\uB4DC\uB85C \uC2E4\uD589\uB429\uB2C8\uB2E4.", "system");
      setHostRole(null);
      return;
    }

    socket = window.io({
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      socketConnected = true;
      selfSocketId = socket.id;
      appendChatLine("시스템", `서버 연결 완료 | 역할 ${hostMode ? "호스트" : "플레이어"} | 룸 ${networkRoomId}`, "system");
      socket.emit("room:join", {
        roomId: networkRoomId,
        name: clientDisplayName,
        map: activeMap,
        isHost: hostMode
      });
      emitLocalPlayerState(true);
      updateShowStartButton();
      updateHud();
      updateNetworkNoteStatus();
    });

    socket.on("disconnect", () => {
      socketConnected = false;
      roomHostId = null;
      isHostClient = hostMode;
      clearRemotePlayers();
      appendChatLine("\uC2DC\uC2A4\uD15C", "\uC11C\uBC84 \uC5F0\uACB0\uC774 \uB04A\uACBC\uC2B5\uB2C8\uB2E4. \uC7AC\uC5F0\uACB0 \uC911\uC785\uB2C8\uB2E4.", "system");
      updateShowStartButton();
      updateHud();
      updateNetworkNoteStatus();
    });

    socket.on("room:joined", (payload) => {
      selfSocketId = payload && payload.selfId ? payload.selfId : socket.id;
      setHostRole(payload && payload.hostId ? payload.hostId : null);
      applyRoomSnapshot(payload);
      if (payload && payload.showState) {
        applyShowStateFromNetwork(payload.showState, true);
      }
      if (payload && Object.prototype.hasOwnProperty.call(payload, "doorOpen")) {
        applyDoorStateFromNetwork(payload.doorOpen);
      }
      const joinedRoomId = payload && payload.roomId ? payload.roomId : networkRoomId;
      const hostAssigned = payload && payload.hostId ? (payload.hostId === selfSocketId ? "내가 호스트" : "호스트 배정됨") : "호스트 없음";
      appendChatLine("시스템", `룸 입장 완료: ${joinedRoomId} | ${hostAssigned}`, "system");
    });

    socket.on("room:snapshot", (payload) => {
      if (payload && Object.prototype.hasOwnProperty.call(payload, "hostId")) {
        setHostRole(payload.hostId);
      }
      applyRoomSnapshot(payload);
      if (payload && payload.showState) {
        applyShowStateFromNetwork(payload.showState, false);
      }
      if (payload && Object.prototype.hasOwnProperty.call(payload, "doorOpen")) {
        applyDoorStateFromNetwork(payload.doorOpen);
      }
    });

    socket.on("player:left", (payload) => {
      if (payload && payload.id) {
        removeRemotePlayerById(payload.id);
        roomPopulation = Math.max(1, roomPopulation - 1);
        updateHud();
      }
    });

    socket.on("host:update", (payload) => {
      setHostRole(payload && payload.hostId ? payload.hostId : null);
      if (payload && payload.hostId === selfSocketId) {
        appendChatLine("\uC2DC\uC2A4\uD15C", "\uD638\uC2A4\uD2B8 \uAD8C\uD55C\uC774 \uBD80\uC5EC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.", "system");
      }
    });

    socket.on("show:state", (payload) => {
      applyShowStateFromNetwork(payload, false);
    });

    socket.on("performer:clip", (payload) => {
      const clipId = normalizeClipId(payload && payload.clipId);
      if (!clipId) return;

      lastNetworkActiveClipId = clipId;
      if (showPlaying && activeMap === "hall") {
        playPerformerClip(clipId, {
          record: false,
          broadcast: false,
          fromNetwork: true,
          silent: true
        });
      } else {
        currentClipId = clipId;
        updateClipButtons();
      }
    });

    socket.on("door:state", (payload) => {
      if (payload && Object.prototype.hasOwnProperty.call(payload, "open")) {
        applyDoorStateFromNetwork(payload.open);
      }
    });

    socket.on("chat:recv", (payload) => {
      const senderId = String((payload && payload.senderId) || "");
      const senderName = String((payload && payload.senderName) || "\uC775\uBA85");
      const text = String((payload && payload.text) || "");
      const type = senderId === "system" ? "system" : senderId === selfSocketId ? "self" : "remote";
      appendChatLine(senderName, text, type);
    });

    socket.on("room:error", (payload) => {
      const message = String((payload && payload.message) || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
      appendChatLine("\uC2DC\uC2A4\uD15C", message, "system");
    });
  }

function createPlayerAvatar(name) {
    const avatar = new THREE.Group();

    const bodyGeometry =
      typeof THREE.CapsuleGeometry === "function"
        ? new THREE.CapsuleGeometry(0.2, 0.64, 4, 8)
        : new THREE.CylinderGeometry(0.2, 0.2, 0.92, 12);
    const body = new THREE.Mesh(
      bodyGeometry,
      new THREE.MeshStandardMaterial({
        color: 0x5f7086,
        roughness: 0.44,
        metalness: 0.06,
        emissive: 0x2d4057,
        emissiveIntensity: 0.18
      })
    );
    body.position.y = 0.92;

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 12, 12),
      new THREE.MeshStandardMaterial({
        color: 0x7e8e9b,
        roughness: 0.36,
        metalness: 0.05,
        emissive: 0x3e4f63,
        emissiveIntensity: 0.2
      })
    );
    head.position.y = 1.62;

    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.96, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
    );
    badge.position.set(0, 2.07, 0);

    const icon = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color: 0x9fd8ff })
    );
    icon.position.set(0, 2.07, 0.06);

    avatar.userData.playerName = String(name || "\uC774\uB984 \uC5C6\uC74C");
    avatar.add(body, head, badge, icon);
    return avatar;
  }

  function updateRemotePlayerVisibility() {
    remotePlayers.forEach((remote) => {
      remote.inActiveMap = remote.map === activeMap;
      remote.mesh.visible = remote.inActiveMap;
    });
  }

function updateRemotePlayers(elapsed, delta) {
    remoteUpdateAccumulator += Math.max(0, Number(delta) || 0);
    stateSendAccumulator += Math.max(0, Number(delta) || 0);

    if (remoteUpdateAccumulator < REMOTE_UPDATE_INTERVAL) {
      return;
    }

    remoteUpdateAccumulator = 0;
    tempBillboardTarget.set(camera.position.x, 2, camera.position.z);

    remotePlayers.forEach((remote) => {
      remote.inActiveMap = remote.map === activeMap;
      if (!remote.inActiveMap) {
        remote.mesh.visible = false;
        return;
      }

      const t = Math.min(1, delta * REMOTE_INTERPOLATION_SPEED);
      remote.mesh.position.lerp(remote.targetPos, t);

      const diff = remote.targetYaw - remote.mesh.rotation.y;
      const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
      remote.mesh.rotation.y += wrapped * t;

      const distanceSq = camera.position.distanceToSquared(remote.mesh.position);
      if (distanceSq > REMOTE_CULL_DISTANCE_SQ) {
        remote.mesh.visible = false;
        return;
      }

      remote.mesh.visible = true;
      const badge = remote.mesh.children[2];
      if (badge) {
        badge.visible = distanceSq <= REMOTE_BADGE_DISTANCE_SQ;
        if (badge.visible) {
          badge.lookAt(tempBillboardTarget);
        }
      }
    });
  }

function visibleRemotePlayerCount() {
    let count = 0;
    remotePlayers.forEach((remote) => {
      if (remote.mesh.visible) count += 1;
    });
    return count;
  }

  function getHudStatusText() {
    const roleText = isHostClient ? "호스트" : "플레이어";
    const modeText = firstPersonEnabled ? (pointerLocked ? "1인칭" : "1인칭 준비") : "시네마";
    const mapText = activeMap === "hall" ? "공연장" : "로비";
    return `${roleText} | ${modeText} | ${mapText} | ${showPlaying ? "공연 중" : "대기 중"}`;
  }

function setupNetworkProfileUi() {
    if (!dom.networkRoleSelect || !dom.networkRoomInput || !dom.networkNameInput || !dom.networkApplyBtn) {
      return;
    }

    dom.networkRoleSelect.value = hostMode ? "host" : "player";
    dom.networkRoomInput.value = networkRoomId;
    dom.networkNameInput.value = requestedPlayerName;

    updateNetworkNoteStatus();

    dom.networkApplyBtn.addEventListener("click", () => {
      const nextHostMode = String(dom.networkRoleSelect.value || "host").trim().toLowerCase() !== "player";
      const nextRoomId = String(dom.networkRoomInput.value || "main")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, 32) || "main";
      const nextName = String(dom.networkNameInput.value || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 24);

      const nextQuery = new URLSearchParams(window.location.search);
      nextQuery.set("host", nextHostMode ? "1" : "0");
      nextQuery.set("room", nextRoomId);
      if (nextName) {
        nextQuery.set("name", nextName);
      } else {
        nextQuery.delete("name");
      }

      window.location.search = nextQuery.toString();
    });
  }

function setupChatUi() {
    if (!dom.chatUi || !dom.chatLog || !dom.chatInput || !dom.chatSend || !dom.chatToggle) {
      return;
    }

    dom.chatSend.addEventListener("click", () => {
      sendChatMessageFromInput();
    });

    dom.chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        sendChatMessageFromInput();
      }
    });

    dom.chatToggle.addEventListener("click", () => {
      setChatCollapsed(!chatCollapsed);
    });

    setChatCollapsed(true);
    appendChatLine("\uC2DC\uC2A4\uD15C", "\uCC44\uD305\uC774 \uC900\uBE44\uB418\uC5C8\uC2B5\uB2C8\uB2E4. Enter\uB85C \uC804\uC1A1\uD558\uC138\uC694.", "system");
  }

function setChatCollapsed(collapsed) {
    chatCollapsed = Boolean(collapsed);
    if (!dom.chatUi || !dom.chatToggle) return;
    dom.chatUi.classList.toggle("collapsed", chatCollapsed);
    dom.chatToggle.textContent = chatCollapsed ? "\uC5F4\uAE30" : "\uB2EB\uAE30";
    dom.chatToggle.setAttribute("aria-expanded", String(!chatCollapsed));
  }

function sendChatMessageFromInput() {
    if (!dom.chatInput) return;

    const text = sanitizeChatText(dom.chatInput.value);
    if (!text) return;

    const now = performance.now();
    if (now - lastChatSentAt < CHAT_SEND_COOLDOWN_MS) {
      appendChatLine("\uC2DC\uC2A4\uD15C", "\uBA54\uC2DC\uC9C0 \uC804\uC1A1\uC774 \uB108\uBB34 \uBE60\uB985\uB2C8\uB2E4.", "system");
      return;
    }

    lastChatSentAt = now;

    if (socketConnected && socket) {
      socket.emit("chat:send", { text, ts: Date.now() });
      dom.chatInput.value = "";
      return;
    }

    appendChatLine("\uB098", text, "self");
    dom.chatInput.value = "";
  }

function sanitizeChatText(input) {
    const normalized = String(input ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, CHAT_MAX_LENGTH);
    return normalized;
  }

function appendChatLine(name, text, type) {
    if (!chatEnabled || !dom.chatLog) return;

    const line = document.createElement("p");
    line.className = "chat-line";

    const safeName = String(name || "\uC775\uBA85").slice(0, 24);
    const safeText = sanitizeChatText(text);
    if (!safeText) {
      return;
    }

    if (type === "system") {
      line.textContent = `[\uC2DC\uC2A4\uD15C] ${safeText}`;
    } else {
      const nameNode = document.createElement("span");
      nameNode.className = "chat-name";
      nameNode.textContent = `${safeName}: `;

      const textNode = document.createElement("span");
      textNode.textContent = safeText;

      line.append(nameNode, textNode);
    }

    dom.chatLog.appendChild(line);
    while (dom.chatLog.children.length > 120) {
      dom.chatLog.removeChild(dom.chatLog.firstChild);
    }
    dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
  }

function createLobbyMap(THREERef, targetScene, mobile) {
    const group = new THREERef.Group();

    const floor = new THREERef.Mesh(
      new THREERef.PlaneGeometry(28, 20),
      new THREERef.MeshStandardMaterial({ color: 0x1a2338, roughness: 0.86, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 13);
    floor.receiveShadow = true;
    group.add(floor);

    const corridorFloor = new THREERef.Mesh(
      new THREERef.PlaneGeometry(8.4, 22),
      new THREERef.MeshStandardMaterial({ color: 0x121b2e, roughness: 0.84, metalness: 0.12 })
    );
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(0, 0.01, 34);
    corridorFloor.receiveShadow = true;
    group.add(corridorFloor);

    const wallMat = new THREERef.MeshStandardMaterial({ color: 0x0f1627, roughness: 0.92, metalness: 0.06 });
    const backWall = new THREERef.Mesh(new THREERef.BoxGeometry(28, 8, 0.8), wallMat);
    backWall.position.set(0, 4, 3);
    group.add(backWall);

    const leftWall = new THREERef.Mesh(new THREERef.BoxGeometry(0.8, 8, 20), wallMat);
    leftWall.position.set(-14, 4, 13);
    const rightWall = leftWall.clone();
    rightWall.position.x = 14;
    group.add(leftWall, rightWall);

    const corridorWallLeft = new THREERef.Mesh(new THREERef.BoxGeometry(0.65, 8, 22), wallMat);
    corridorWallLeft.position.set(-4.2, 4, 34);
    const corridorWallRight = corridorWallLeft.clone();
    corridorWallRight.position.x = 4.2;
    group.add(corridorWallLeft, corridorWallRight);

    const corridorStrips = [];
    for (let i = 0; i < 10; i += 1) {
      const strip = new THREERef.Mesh(
        new THREERef.PlaneGeometry(1.6, 0.7),
        new THREERef.MeshStandardMaterial({
          color: i % 2 === 0 ? 0x58bfff : 0xff6d8e,
          emissive: i % 2 === 0 ? 0x58bfff : 0xff6d8e,
          emissiveIntensity: 0.18,
          roughness: 0.3,
          metalness: 0.12
        })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, 0.02, 24.1 + i * 2.1);
      group.add(strip);
      corridorStrips.push(strip);
    }

    // Place hall connection doors on the lobby wide-side boundary (z=3).
    const doorZ = 22.65;
    const doorFrameMat = new THREERef.MeshStandardMaterial({ color: 0x1d273b, roughness: 0.64, metalness: 0.32 });
    const doorFrameLeft = new THREERef.Mesh(new THREERef.BoxGeometry(2.1, 8, 0.7), wallMat);
    doorFrameLeft.position.set(-2.95, 4, doorZ);
    const doorFrameRight = doorFrameLeft.clone();
    doorFrameRight.position.x = 2.95;
    const doorFrameTop = new THREERef.Mesh(new THREERef.BoxGeometry(8, 1, 0.7), doorFrameMat);
    doorFrameTop.position.set(0, 7.5, doorZ);
    group.add(doorFrameLeft, doorFrameRight, doorFrameTop);

    const doorMaterial = new THREERef.MeshStandardMaterial({
      color: 0x2e3c56,
      roughness: 0.34,
      metalness: 0.54
    });
    const doorLeft = new THREERef.Mesh(new THREERef.BoxGeometry(1.85, 6.6, 0.16), doorMaterial);
    const doorRight = doorLeft.clone();
    doorLeft.position.set(-0.96, 3.3, doorZ + 0.04);
    doorRight.position.set(0.96, 3.3, doorZ + 0.04);
    doorLeft.castShadow = true;
    doorRight.castShadow = true;
    group.add(doorLeft, doorRight);

    const doorGlow = new THREERef.Mesh(
      new THREERef.BoxGeometry(3.7, 0.12, 0.14),
      new THREERef.MeshStandardMaterial({
        color: 0x53d8ff,
        emissive: 0x53d8ff,
        emissiveIntensity: 0.58
      })
    );
    doorGlow.position.set(0, 6.75, doorZ + 0.05);
    group.add(doorGlow);

    const portalGroup = new THREERef.Group();
    portalGroup.position.set(0, 0, 44.7);

    const portalBase = new THREERef.Mesh(
      new THREERef.TorusGeometry(2.9 * 0.92, 0.18, 16, mobile ? 30 : 52),
      new THREERef.MeshStandardMaterial({
        color: 0x39617b,
        roughness: 0.26,
        metalness: 0.42,
        emissive: 0x18435a,
        emissiveIntensity: 0.22
      })
    );
    portalBase.rotation.x = Math.PI / 2;
    portalBase.position.y = 0.16;
    portalGroup.add(portalBase);

    const portalRing = new THREERef.Mesh(
      new THREERef.TorusGeometry(2.9, 0.24, 22, mobile ? 38 : 64),
      new THREERef.MeshStandardMaterial({
        color: 0x35ef8d,
        roughness: 0.14,
        metalness: 0.38,
        emissive: 0x00ee55,
        emissiveIntensity: 0.82,
        transparent: true,
        opacity: 0.9
      })
    );
    portalRing.position.y = 2.2;
    portalGroup.add(portalRing);

    const portalCore = new THREERef.Mesh(
      new THREERef.CircleGeometry(2.35, mobile ? 28 : 48),
      new THREERef.MeshBasicMaterial({
        color: 0x00ee55,
        transparent: true,
        opacity: 0.24,
        side: THREERef.DoubleSide,
        depthWrite: false
      })
    );
    portalCore.position.y = 2.2;
    portalGroup.add(portalCore);

    const portalGlow = new THREERef.Mesh(
      new THREERef.CircleGeometry(1.95, mobile ? 24 : 42),
      new THREERef.MeshBasicMaterial({
        color: 0x00ee55,
        transparent: true,
        opacity: 0.34,
        side: THREERef.DoubleSide,
        depthWrite: false,
        blending: THREERef.AdditiveBlending
      })
    );
    portalGlow.position.y = 2.2;
    portalGlow.renderOrder = 12;
    portalGroup.add(portalGlow);
    group.add(portalGroup);

    targetScene.add(group);
    return { group, portalGroup, portalRing, portalCore, portalGlow, corridorStrips, doorLeft, doorRight, doorGlow };
  }

  function createHallMap(THREERef, targetScene, rows, cols, mobile) {
    const group = new THREERef.Group();
    group.position.z = 38;
    group.rotation.y = Math.PI;
    const seatingGroup = new THREERef.Group();
    group.add(seatingGroup);

    const floor = new THREERef.Mesh(
      new THREERef.PlaneGeometry(132, 122),
      new THREERef.MeshStandardMaterial({ color: 0x141a2d, roughness: 0.88, metalness: 0.12 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -60;
    floor.receiveShadow = true;
    group.add(floor);

    const wallMat = new THREERef.MeshStandardMaterial({ color: 0x0c1221, roughness: 0.9, metalness: 0.08 });
    const backWall = new THREERef.Mesh(new THREERef.BoxGeometry(92, 30, 1.1), wallMat);
    backWall.position.set(0, 15, -121);
    group.add(backWall);

    const leftWall = new THREERef.Mesh(new THREERef.BoxGeometry(1.1, 30, 122), wallMat);
    leftWall.position.set(-46, 15, -60);
    const rightWall = leftWall.clone();
    rightWall.position.x = 46;
    group.add(leftWall, rightWall);

    const stageWidth = 52;
    const stageDepth = 24;
    const stageHeight = 2.4;

    const stageBase = new THREERef.Mesh(
      new THREERef.BoxGeometry(stageWidth, stageHeight, stageDepth),
      new THREERef.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3, metalness: 0.8 })
    );
    stageBase.position.set(0, stageHeight / 2, -58);
    stageBase.castShadow = true;
    stageBase.receiveShadow = true;
    group.add(stageBase);

    const edgeMat = new THREERef.MeshStandardMaterial({ color: 0xff5c7d, emissive: 0xff5c7d, emissiveIntensity: 0.54 });
    const stageEdge = new THREERef.Mesh(new THREERef.BoxGeometry(stageWidth + 0.3, 0.2, 0.24), edgeMat);
    stageEdge.position.set(0, 1.3, -45.95);
    group.add(stageEdge);

    const micMat = new THREERef.MeshStandardMaterial({ color: 0xadb7d0, roughness: 0.28, metalness: 0.74 });
    const micDarkMat = new THREERef.MeshStandardMaterial({ color: 0x171d2a, roughness: 0.62, metalness: 0.16 });
    const micGroup = new THREERef.Group();

    const micBase = new THREERef.Mesh(new THREERef.CylinderGeometry(0.58, 0.72, 0.18, 24), micDarkMat);
    micBase.position.y = 2.49;
    micGroup.add(micBase);

    const micPole = new THREERef.Mesh(new THREERef.CylinderGeometry(0.07, 0.07, 3.1, 16), micMat);
    micPole.position.y = 4.04;
    micGroup.add(micPole);

    const micHead = new THREERef.Mesh(new THREERef.SphereGeometry(0.26, 20, 20), micDarkMat);
    micHead.position.set(0, 5.72, -0.08);
    micGroup.add(micHead);

    const micStem = new THREERef.Mesh(new THREERef.CylinderGeometry(0.038, 0.038, 0.7, 12), micMat);
    micStem.position.set(0, 5.46, -0.2);
    micStem.rotation.x = -0.6;
    micGroup.add(micStem);

    micGroup.position.set(0, 0, -50.4);
    micGroup.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
    group.add(micGroup);

    const performerMat = createChromaKeyMaterial(THREERef);
    const performerPlane = new THREERef.Mesh(new THREERef.PlaneGeometry(4.8, 7.0), performerMat);
    performerPlane.position.set(0, 5.6, -55.6);
    performerPlane.renderOrder = 10;
    performerPlane.visible = false;
    group.add(performerPlane);

    const screenMat = new THREERef.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4 });
    const screen = new THREERef.Mesh(new THREERef.PlaneGeometry(stageWidth, 18), screenMat);
    screen.position.set(0, stageHeight + 11.2, -86);
    group.add(screen);

    const seatTemplate = buildSeatTemplate(THREERef);
    const facingTarget = new THREERef.Vector3(0, 1.1, -58);
    const seatColliders = [];
    const seatWorldPosition = new THREERef.Vector3();

    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const xBase = (col - (cols - 1) / 2) * 2.62;
        const aisleShift = col >= cols / 2 ? 1.35 : -1.35;
        const x = xBase + aisleShift;
        const z = -40 + row * 4.2;

        const seat = seatTemplate.clone(true);
        seat.position.set(x, 0, z);
        seat.lookAt(facingTarget);
        seatingGroup.add(seat);
        seat.updateMatrixWorld(true);
        seat.getWorldPosition(seatWorldPosition);
        seatColliders.push({
          x: Math.round(seatWorldPosition.x * 1000) / 1000,
          z: Math.round(seatWorldPosition.z * 1000) / 1000,
          radius: 0.56
        });
      }
    }

    const stageWash = new THREERef.SpotLight(0xffffff, 1.8, 190, Math.PI / 5, 0.5, 1.2);
    stageWash.position.set(0, 26, -30);
    stageWash.target.position.set(0, 3.2, -58);
    stageWash.castShadow = true;
    stageWash.shadow.mapSize.width = 1024;
    stageWash.shadow.mapSize.height = 1024;
    group.add(stageWash, stageWash.target);

    const movingLights = [];
    const lightColors = [0xff0055, 0x00d4ff, 0xcc00ff, 0x39ff14, 0xffaa00];
    for (let i = 0; i < lightColors.length; i += 1) {
      const light = new THREERef.SpotLight(lightColors[i], 3.1, 140, Math.PI / 8, 0.5, 1.4);
      light.position.set((i - 2) * 10, 28, -62);
      const target = new THREERef.Object3D();
      target.position.set((i - 2) * 7, 1.2, -34);
      light.target = target;
      group.add(light, target);

      const beamGeo = new THREERef.CylinderGeometry(0.12, 1.8, 44, 16, 1, true);
      beamGeo.translate(0, -22, 0);
      beamGeo.rotateX(Math.PI / 2);
      const beam = new THREERef.Mesh(
        beamGeo,
        new THREERef.MeshBasicMaterial({ color: lightColors[i], transparent: true, opacity: 0.1, blending: THREERef.AdditiveBlending, depthWrite: false })
      );
      beam.position.copy(light.position);
      group.add(beam);

      movingLights.push({
        light,
        target,
        beam,
        baseIntensity: light.intensity,
        speedX: 0.2 + Math.random() * 0.14,
        speedZ: 0.18 + Math.random() * 0.14,
        offset: Math.random() * Math.PI * 2
      });
    }

    const fireworks = createFireworkSystem(THREERef, mobile);
    fireworks.points.position.set(0, 0, 0);
    group.add(fireworks.points);

    const strobeLight = new THREERef.PointLight(0xffffff, 0, 170, 1.6);
    strobeLight.position.set(0, 18, -58);
    group.add(strobeLight);

    const particleCount = mobile ? 220 : 420;
    const particlePos = new Float32Array(particleCount * 3);
    const particleVelocities = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i += 1) {
      const idx = i * 3;
      particlePos[idx] = (Math.random() - 0.5) * 70;
      particlePos[idx + 1] = Math.random() * 26 + 2;
      particlePos[idx + 2] = (Math.random() - 0.5) * 70 - 48;
      particleVelocities[i] = 0.014 + Math.random() * 0.02;
    }
    const particleGeo = new THREERef.BufferGeometry();
    particleGeo.setAttribute("position", new THREERef.BufferAttribute(particlePos, 3));
    const particles = new THREERef.Points(
      particleGeo,
      new THREERef.PointsMaterial({ size: 0.24, color: 0xffddaa, transparent: true, opacity: 0.78, blending: THREERef.AdditiveBlending })
    );
    group.add(particles);

    targetScene.add(group);
    return { group, seatingGroup, seatColliders, stageWash, movingLights, particles, particleCount, particleVelocities, fireworks, strobeLight, screenMat, edgeMat, performerMat, performerPlane };
  }

  function createFireworkSystem(THREERef, mobile) {
    const count = mobile ? 240 : 480;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocity = new Float32Array(count * 3);
    const life = new Float32Array(count);

    for (let i = 0; i < count; i += 1) {
      const idx = i * 3;
      positions[idx] = 0;
      positions[idx + 1] = -999;
      positions[idx + 2] = 0;
      colors[idx] = 1;
      colors[idx + 1] = 1;
      colors[idx + 2] = 1;
      life[i] = 0;
    }

    const geometry = new THREERef.BufferGeometry();
    geometry.setAttribute("position", new THREERef.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREERef.BufferAttribute(colors, 3));

    const material = new THREERef.PointsMaterial({
      size: mobile ? 0.26 : 0.34,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREERef.AdditiveBlending,
      depthWrite: false
    });

    const points = new THREERef.Points(geometry, material);
    points.visible = false;

    return {
      count,
      baseBurst: mobile ? 16 : 30,
      cursor: 0,
      cooldown: 0.4,
      positions,
      colors,
      velocity,
      life,
      geometry,
      points
    };
  }

  function createChromaKeyMaterial(THREERef) {
    const cfg = CHROMA_KEY_CONFIG;
    return new THREERef.ShaderMaterial({
      uniforms: {
        uMap: { value: null },
        uKeyColor: { value: new THREERef.Vector3(cfg.keyColor[0], cfg.keyColor[1], cfg.keyColor[2]) },
        uSimilarity: { value: cfg.similarity },
        uSmoothness: { value: cfg.smoothness },
        uSpill: { value: cfg.spill },
        uDespill: { value: cfg.despill }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform sampler2D uMap;
        uniform vec3 uKeyColor;
        uniform float uSimilarity;
        uniform float uSmoothness;
        uniform float uSpill;
        uniform float uDespill;

        vec2 toCbCr(vec3 color) {
          float y = dot(color, vec3(0.299, 0.587, 0.114));
          float cb = color.b - y;
          float cr = color.r - y;
          return vec2(cb, cr);
        }

        void main() {
          vec4 src = texture2D(uMap, vUv);
          vec2 srcCbCr = toCbCr(src.rgb);
          vec2 keyCbCr = toCbCr(uKeyColor);
          float dist = distance(srcCbCr, keyCbCr);

          float alpha = smoothstep(uSimilarity, uSimilarity + uSmoothness, dist);
          alpha *= src.a;

          float edge = clamp((1.0 - alpha) * uSpill, 0.0, 1.0);
          float maxRB = max(src.r, src.b);
          src.g = mix(src.g, maxRB, edge * uDespill);

          if (alpha < 0.01) discard;
          gl_FragColor = vec4(src.rgb, alpha);
        }
      `,
      transparent: true,
      side: THREERef.DoubleSide,
      depthWrite: false
    });
  }
  function buildSeatTemplate(THREERef) {
    const cushionMat = new THREERef.MeshStandardMaterial({ color: 0x2f57ca, roughness: 0.6, metalness: 0.12 });
    const frameMat = new THREERef.MeshStandardMaterial({ color: 0x1f273a, roughness: 0.74, metalness: 0.24 });

    const seat = new THREERef.Group();
    const base = new THREERef.Mesh(new THREERef.BoxGeometry(1.52, 0.3, 1.36), cushionMat);
    base.position.y = 0.93;
    seat.add(base);
    const back = new THREERef.Mesh(new THREERef.BoxGeometry(1.52, 0.98, 0.24), cushionMat);
    back.position.set(0, 1.48, -0.56);
    seat.add(back);

    const armL = new THREERef.Mesh(new THREERef.BoxGeometry(0.16, 0.43, 1.18), frameMat);
    armL.position.set(-0.75, 1.08, 0);
    seat.add(armL);
    const armR = armL.clone();
    armR.position.x = 0.75;
    seat.add(armR);

    const legs = [
      [-0.64, 0.47, -0.5],
      [0.64, 0.47, -0.5],
      [-0.64, 0.47, 0.5],
      [0.64, 0.47, 0.5]
    ];
    legs.forEach((offset) => {
      const leg = new THREERef.Mesh(new THREERef.BoxGeometry(0.12, 0.93, 0.12), frameMat);
      leg.position.set(offset[0], offset[1], offset[2]);
      seat.add(leg);
    });

    seat.traverse((obj) => {
      if (!obj.isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });

    return seat;
  }
})();
