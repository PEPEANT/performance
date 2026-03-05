(function () {
  const CAPACITY = 50;
  const ROWS = 5;
  const COLS = 10;
  const SHOW_VIDEO_PATH_DESKTOP = "./01.mp4";
  const SHOW_VIDEO_PATH_MOBILE = "./01.mobile.mp4";
  const CLIP_IDS = Array.from({ length: 11 }, (_, index) => index + 1);
  const CLIP_VIDEO_PATHS = Object.fromEntries(CLIP_IDS.map((id) => [id, `./WEBM/${id}_alpha.webm`]));
  const DEFAULT_CLIP_ID = 1;
  const DEFAULT_PERFORMER_ACTION_ID = `clip:${DEFAULT_CLIP_ID}`;
  const PERFORMER_BASE_POSITION = Object.freeze({ x: 0, y: 5.6, z: -55.6 });
  const PERFORMER_LEFT_ENTRY_X = -22.5;
  const MANUAL_HIDE_ACTION_ID = "hide";
  const SPECIAL_PERFORMER_ACTIONS = Object.freeze({
    walk_in: {
      src: "./WEBM/0-0_alpha.webm",
      startTime: 0,
      moveFromX: PERFORMER_LEFT_ENTRY_X,
      moveToX: PERFORMER_BASE_POSITION.x,
      moveDuration: 8.4,
      loop: true,
      stopLoopAtMoveEnd: true,
      mirrorX: false
    },
    idle_hold: {
      src: "./WEBM/0-1_alpha.webm",
      freezeAt: 2,
      holdX: PERFORMER_BASE_POSITION.x,
      mirrorX: false
    },
    greet: {
      src: "./WEBM/0-1_alpha.webm",
      startTime: 3,
      endTime: 10,
      holdX: PERFORMER_BASE_POSITION.x,
      mirrorX: false
    },
    walk_out: {
      src: "./WEBM/0-0_alpha.webm",
      startTime: 0,
      moveFromX: PERFORMER_BASE_POSITION.x,
      moveToX: PERFORMER_LEFT_ENTRY_X,
      moveDuration: 8.4,
      loop: true,
      stopLoopAtMoveEnd: true,
      mirrorX: true
    }
  });
  const SPECIAL_PERFORMER_ACTION_IDS = Object.freeze(Object.keys(SPECIAL_PERFORMER_ACTIONS));
  const CHOREO_CLIP_LABELS = Object.freeze({
    1: "\uADF8\uB0E5\uCDA4",
    2: "\uB450\uD314T\uC790\uCDA4",
    3: "\uB3CC\uACE0\uD55C\uC190\uBED7\uAE30",
    4: "\uB208\uAC10\uACE0\uB178\uB798",
    5: "\uCC9C\uCC9C\uD788 \uD55C\uBC1C \uB4E4\uAE30",
    6: "\uB450\uC190\uB4E4\uACE0 \uB3CC\uAE30",
    7: "\uB208\uB728\uACE0\uB178\uB798",
    8: "\uB450\uBC14\uD034\uB3CC\uAE30",
    9: "\uB208\uAC10\uACE0\uB3CC\uACE0\uCC29\uC9C0",
    10: "\uD55C\uC190\uB4E4\uACE0 \uB178\uB798",
    11: "\uB2E4\uB9AC\uCDA4"
  });
  const QUEUE_STORAGE_KEY = "performance_choreo_queue_v1";
  const CHROMA_KEY_CONFIG = {
    keyColor: [0.06, 0.95, 0.08],
    similarity: 0.365,
    smoothness: 0.055,
    spill: 1.22,
    despill: 1.62
  };
  const STAGE_AUDIO_MASTER_GAIN = 1.68;
  const STAGE_AUDIO_DRY_GAIN = 0.98;
  const STAGE_AUDIO_WET_GAIN = 0.56;
  const STAGE_AUDIO_REVERB_SECONDS = 2.25;
  const STAGE_AUDIO_REVERB_DECAY = 2.75;
  const STAGE_AUDIO_REVERB_PREDELAY_SECONDS = 0.03;

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
  const chatEnabled = true;
  const hostParamRaw = String(query.get("host") || "").trim().toLowerCase();
  const explicitHostTrue = ["1", "true", "yes", "on", "host"].includes(hostParamRaw);
  const explicitHostFalse = ["0", "false", "no", "off", "player"].includes(hostParamRaw);
  const explicitAdminTrue = ["1", "true", "yes", "on"].includes(String(query.get("admin") || "").trim().toLowerCase());
  const adminUiMode = explicitAdminTrue || explicitHostTrue;
  let hostMode = explicitHostTrue ? true : explicitHostFalse ? false : adminUiMode;
  let networkRoomId = String(query.get("room") || "main")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32) || "main";
  let requestedPlayerName = String(query.get("name") || "").trim();
  const externalReturnUrlRaw = String(query.get("returnUrl") || "").trim();
  const returnPortalHint = String(query.get("returnPortal") || "").trim().toLowerCase();
  const portalExitUrlRaw = String(query.get("portalLink") || query.get("portalUrl") || "").trim();
  const DEFAULT_PORTAL_EXIT_URL = "https://emptines-chat-2.onrender.com/?zone=lobby&returnPortal=hall&from=performance";
  const PLAYER_NAME_STORAGE_KEY = "performance_player_name_v1";
  const PORTAL_EXIT_URL_STORAGE_KEY = "performance_portal_exit_url_v1";

  const dom = {
    overlay: document.getElementById("overlay"),
    stageSection: document.getElementById("host-section-stage"),
    canvasRoot: document.getElementById("canvas-root"),
    loading: document.getElementById("loading"),
    statusIntent: document.getElementById("status-intent"),
    introStats: document.getElementById("intro-stats"),
    statCapacity: document.getElementById("stat-capacity"),
    statCapacityCard: document.getElementById("stat-capacity") ? document.getElementById("stat-capacity").closest(".stat-card") : null,
    statLayout: document.getElementById("stat-layout"),
    statSeats: document.getElementById("stat-seats"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    fxParticlesBtn: document.getElementById("fx-particles-btn"),
    fxLightsBtn: document.getElementById("fx-lights-btn"),
    fxFireworksBtn: document.getElementById("fx-fireworks-btn"),
    qualitySelect: document.getElementById("quality-select"),
    portalActionBtn: document.getElementById("portal-action-btn"),
    portalPhaseNote: document.getElementById("portal-phase-note"),
    showStartBtn: document.getElementById("show-start-btn"),
    hostDoorBtn: document.getElementById("host-door-btn"),
    returnLobbyBtn: document.getElementById("return-lobby-btn"),
    clipButtons: Array.from(document.querySelectorAll("[data-clip-id]")),
    performerActionButtons: Array.from(document.querySelectorAll("[data-performer-action]")),
    queueRecordBtn: document.getElementById("queue-record-btn"),
    queuePlayBtn: document.getElementById("queue-play-btn"),
    queueLoopBtn: document.getElementById("queue-loop-btn"),
    queueSaveBtn: document.getElementById("queue-save-btn"),
    queueLoadBtn: document.getElementById("queue-load-btn"),
    queueClearBtn: document.getElementById("queue-clear-btn"),
    queueStatus: document.getElementById("queue-status"),
    queuePanelTitle: document.getElementById("queue-panel-title"),
    choreoSummary: document.getElementById("host-section-choreo-summary"),
    choreoPanelTitle: document.getElementById("choreo-panel-title"),
    specialActionTitle: document.getElementById("special-action-title"),
    clipNameSpans: Array.from(document.querySelectorAll("[data-clip-label]")),
    networkPanelToggleBtn: document.getElementById("network-panel-toggle-btn"),
    optionVersionNote: document.getElementById("option-version-note"),
    networkPanel: document.getElementById("network-panel"),
    networkRoleSelect: document.getElementById("network-role-select"),
    networkRoomInput: document.getElementById("network-room-input"),
    networkNameInput: document.getElementById("network-name-input"),
    networkApplyBtn: document.getElementById("network-apply-btn"),
    nicknameGate: document.getElementById("nickname-gate"),
    nicknameGateInput: document.getElementById("nickname-gate-input"),
    nicknameGateConfirmBtn: document.getElementById("nickname-gate-confirm-btn"),
    nicknameGateNote: document.getElementById("nickname-gate-note"),
    networkNote: document.getElementById("network-note"),
    controlsTitle: document.querySelector(".panel-controls h2"),
    presetGrid: document.querySelector(".panel-controls .preset-grid"),
    opsStack: document.querySelector(".panel-controls .ops-stack"),
    clipPanel: document.querySelector(".clip-panel"),
    fpsToggleBtn: document.getElementById("fps-toggle-btn"),
    hudWrap: document.getElementById("hud"),
    hudUiWrap: document.getElementById("hud-ui"),
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
    mobileUi: document.getElementById("mobile-ui"),
    mobileMovePad: document.getElementById("mobile-move-pad"),
    mobileMoveStick: document.getElementById("mobile-move-stick"),
    mobileJumpBtn: document.getElementById("mobile-jump"),
    mobileSprintBtn: document.getElementById("mobile-sprint"),
    mobileChatBtn: document.getElementById("mobile-chat"),
    mobileReturnBtn: document.getElementById("mobile-return"),
    portalTransition: document.getElementById("portal-transition"),
    portalTransitionLabel: document.getElementById("portal-transition-label"),
    portalTransitionTitle: document.getElementById("portal-transition-title"),
    hostSections: Array.from(document.querySelectorAll(".host-section"))
  };

  if (!dom.canvasRoot || !dom.loading || !window.THREE || !window.THREE.OrbitControls) {
    return;
  }

  function splitStagePanelFromLeftControls() {
    if (!dom.overlay || !dom.stageSection) return;
    if (dom.stageSection.parentElement === dom.overlay) return;
    // Move stage controls outside left panel so fixed positioning is viewport-based.
    dom.overlay.appendChild(dom.stageSection);
  }

  splitStagePanelFromLeftControls();

  function hydrateChoreoPanelLabels() {
    if (dom.queuePanelTitle) {
      dom.queuePanelTitle.textContent = "\uD050 \uC7AC\uC0DD \uC81C\uC5B4";
    }
    if (dom.choreoSummary) {
      dom.choreoSummary.textContent = "\uC548\uBB34 \uD074\uB9BD";
    }
    if (dom.choreoPanelTitle) {
      dom.choreoPanelTitle.textContent = "\uC548\uBB34 \uD074\uB9BD (1~11)";
    }
    if (dom.specialActionTitle) {
      dom.specialActionTitle.textContent = "0-0 / 0-1 \uD2B9\uC218 \uB3D9\uC791";
    }
    if (dom.queueSaveBtn) {
      dom.queueSaveBtn.textContent = "\uD050 \uC800\uC7A5";
    }
    if (dom.queueLoadBtn) {
      dom.queueLoadBtn.textContent = "\uD050 \uBD88\uB7EC\uC624\uAE30";
    }
    if (dom.queueClearBtn) {
      dom.queueClearBtn.textContent = "\uD050 \uCD08\uAE30\uD654";
    }

    if (Array.isArray(dom.clipNameSpans)) {
      dom.clipNameSpans.forEach((span) => {
        const clipId = Math.trunc(Number(span?.dataset?.clipLabel || 0));
        const label = CHOREO_CLIP_LABELS[clipId];
        if (label) {
          span.textContent = label;
        }
      });
    }

    const specialActionLabels = {
      walk_in: "0-0 \uC785\uC7A5 \uC6CC\uD0B9",
      idle_hold: "0-1 \uC81C\uC790\uB9AC \uC815\uC9C0",
      greet: "0-1 \uC778\uC0AC (3~10s)",
      walk_out: "0-0 \uD1F4\uC7A5 \uC6CC\uD0B9(\uBC18\uC804)",
      hide: "\uC784\uC2DC \uC228\uAE30\uAE30 (\uC26C\uAE30)"
    };
    dom.performerActionButtons.forEach((button) => {
      const actionId = String(button.dataset.performerAction || "").trim();
      const label = specialActionLabels[actionId];
      if (label) {
        button.textContent = label;
      }
    });
  }

  hydrateChoreoPanelLabels();

  const THREE = window.THREE;
  const userAgent = String(navigator.userAgent || "").toLowerCase();
  const mobileQueryRaw = String(query.get("mobile") || "").trim().toLowerCase();
  const forceMobileUi = ["1", "true", "yes", "on"].includes(mobileQueryRaw);
  const forceDesktopUi = ["0", "false", "no", "off"].includes(mobileQueryRaw);
  const hasCoarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  const hasAnyCoarsePointer = typeof window.matchMedia === "function" && window.matchMedia("(any-pointer: coarse)").matches;
  const touchPoints = Number(navigator.maxTouchPoints || 0);
  const hasTouchSupport = touchPoints > 0 || ("ontouchstart" in window);
  const shortEdge = Math.min(window.innerWidth || 0, window.innerHeight || 0);
  const longEdge = Math.max(window.innerWidth || 0, window.innerHeight || 0);
  const likelyHandheldScreen = shortEdge <= 1024 && longEdge <= 1800;
  const mobileUa = /android|iphone|ipad|ipod|mobile|tablet/i.test(userAgent);
  const touchLikelyMobile = (hasTouchSupport || hasCoarsePointer || hasAnyCoarsePointer) && likelyHandheldScreen;
  const isMobile = forceMobileUi || (!forceDesktopUi && (mobileUa || touchLikelyMobile));
  const networkInfo = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  const networkEffectiveType = String(networkInfo && networkInfo.effectiveType ? networkInfo.effectiveType : "").toLowerCase();
  const prefersReducedData = Boolean(networkInfo && networkInfo.saveData);
  const shouldPreferMobileShowVideo =
    isMobile ||
    prefersReducedData ||
    networkEffectiveType === "slow-2g" ||
    networkEffectiveType === "2g" ||
    networkEffectiveType === "3g";
  const SHOW_VIDEO_PATH = shouldPreferMobileShowVideo ? SHOW_VIDEO_PATH_MOBILE : SHOW_VIDEO_PATH_DESKTOP;

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
  const STAGE_VIDEO_STALL_DETECTION_SECONDS = 2.4;
  const STAGE_VIDEO_STALL_RECOVERY_COOLDOWN_SECONDS = 3.5;
  const PLAYER_GRAVITY = 24;
  const PLAYER_JUMP_SPEED = 9.2;
  const PLAYER_COLLISION_RADIUS = 0.42;
  const HALL_STAGE_BOUNDS = Object.freeze({ minX: -26, maxX: 26, minZ: 84, maxZ: 108, height: 2.4 });
  const LOBBY_BOUNDS = Object.freeze({
    minZ: 3.2,
    maxZ: 37.2,
    corridorStartZ: 23,
    lobbyHalfWidth: 13.2,
    corridorHalfWidth: 3.55,
    closedDoorBarrierZ: 22.2,
    closedDoorHalfGap: 1.75
  });
  const LOBBY_HALL_AUTO_ENTER_Z = LOBBY_BOUNDS.maxZ - 1.0;
  const LOBBY_HALL_AUTO_ENTER_HALF_WIDTH = LOBBY_BOUNDS.corridorHalfWidth + 0.75;
  const HALL_LOBBY_AUTO_RETURN_Z = 38.3;
  const HALL_LOBBY_AUTO_RETURN_HALF_WIDTH = LOBBY_HALL_AUTO_ENTER_HALF_WIDTH;
  const CORRIDOR_MAP_SWITCH_COOLDOWN_MS = 900;
  const LOBBY_PORTAL_ENTRY_RADIUS = 4.8;
  const LOBBY_PORTAL_ENTRY_RADIUS_SQ = LOBBY_PORTAL_ENTRY_RADIUS * LOBBY_PORTAL_ENTRY_RADIUS;
  const LOBBY_DOOR_ENTRY_RADIUS = 3.2;
  const LOBBY_DOOR_ENTRY_RADIUS_SQ = LOBBY_DOOR_ENTRY_RADIUS * LOBBY_DOOR_ENTRY_RADIUS;
  const LOBBY_POSTER_ENTRY_RADIUS = 3.5;
  const LOBBY_POSTER_ENTRY_RADIUS_SQ = LOBBY_POSTER_ENTRY_RADIUS * LOBBY_POSTER_ENTRY_RADIUS;
  const LOBBY_POSTER_MAX_DATA_URL_LENGTH = 2_800_000;

  if (dom.statCapacity) {
    dom.statCapacity.textContent = String(CAPACITY);
  }
  if (dom.statLayout) {
    dom.statLayout.textContent = `${ROWS} x ${COLS}`;
  }

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
  const lobbyPosterWorldPosition = new THREE.Vector3();
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
  const showMode = "live";
  let fxParticlesEnabled = true;
  let fxLightsEnabled = true;
  let pendingFireworkBursts = 0;
  let qualityMode = isMobile ? "low" : "medium";
  let cameraTween = null;
  let transitionInFlight = false;
  let doorOpen = true;
  let portalState = { phase: "open", secondsLeft: 0, progress: 1 };
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
  let stageAudioContext = null;
  let stageAudioSourceNode = null;
  let stageAudioConvolverNode = null;
  let stageAudioDryGainNode = null;
  let stageAudioWetGainNode = null;
  let stageAudioMasterGainNode = null;
  let stageAudioCompressorNode = null;
  let stageAudioGraphReady = false;
  let activeShowVideoPath = SHOW_VIDEO_PATH;
  let showVideoMobileFallbackTried = false;
  let stageVideoAwaitingUnmuteGesture = false;
  let stageVideoLastTime = 0;
  let stageVideoLastAdvanceAt = 0;
  let stageVideoLastRecoveryAt = 0;
  let chromaVideo = null;
  let chromaVideoTexture = null;
  let chromaVideoReady = false;
  let showPlaying = false;
  let screenVideoEnabled = false;
  let currentClipId = DEFAULT_CLIP_ID;
  let currentPerformerActionId = DEFAULT_PERFORMER_ACTION_ID;
  let performerActionRuntime = null;
  let performerHiddenAfterWalkOut = false;
  let performerHiddenByManualAction = false;
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
  let chatCollapsed = isMobile;
  let networkPanelExpanded = false;
  let mobileMovePointerId = null;
  let mobileMoveRadius = 44;
  let mobileLookTouchId = null;
  let mobileLookLastX = 0;
  let mobileLookLastY = 0;
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
  let serverClockOffsetMs = 0;
  let lastNetworkActiveClipId = 0;
  let lastNetworkActiveActionId = "";
  let clientDisplayName = requestedPlayerName || ("\uD50C\uB808\uC774\uC5B4-" + Math.floor(Math.random() * 9000 + 1000));
  let nicknameGateResolved = false;
  let nicknameGatePromise = null;
  let portalExitUrl = "";
  let lobbyPosterDataUrl = "";
  let lobbyPosterTexture = null;
  let lobbyPosterLoadToken = 0;
  let lobbyPosterUploading = false;
  let lobbyPosterFileInput = null;
  let lastCorridorMapSwitchAt = 0;

  dom.portalActionBtn.addEventListener("click", () => handleLobbyInteract());
  if (dom.showStartBtn) {
    dom.showStartBtn.addEventListener("click", () => {
      if (showPlaying) {
        stopShowLocal({ broadcast: true });
      } else {
        startShow({ broadcast: true });
      }
    });
  }
  if (dom.hostDoorBtn) {
    dom.hostDoorBtn.addEventListener("click", () => {
      if (!isHostClient) return;
      setDoorOpen(!doorOpen);
    });
  }
  dom.returnLobbyBtn.addEventListener("click", () => handleReturnAction());
  if (dom.mobileReturnBtn) {
    dom.mobileReturnBtn.addEventListener("pointerdown", () => handleReturnAction());
  }
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

    if (key === "e") {
      if (tryOpenLobbyPosterPickerByKey()) {
        event.preventDefault();
        return;
      }
      if (activeMap === "lobby") {
        if (enterExternalPortal()) {
          event.preventDefault();
          return;
        }
        if (isNearLobbyDoor()) {
          enterHall();
          event.preventDefault();
          return;
        }
      }
    }

    if (key === " " || key === "space" || key === "spacebar" || code === "space") {
      event.preventDefault();
    }

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
    tryRestoreStageVideoAudio();
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
    button.addEventListener("click", () => {
      const presetName = String(button.dataset.preset || "");
      const preset = presets[presetName];
      if (!preset) return;
      if (preset.map !== activeMap) {
        setMap(preset.map, true);
      }
      applyPreset(presetName, false);
    });
  });

  if (dom.fxParticlesBtn) {
    dom.fxParticlesBtn.addEventListener("click", () => {
      if (!canControlShowOps()) return;
      if (activeMap !== "hall") {
        updateQueueUi("파티클은 공연장에서만 켜고 끌 수 있습니다.");
        return;
      }
      applyFxState({ particles: !fxParticlesEnabled });
    });
  }

  if (dom.fxLightsBtn) {
    dom.fxLightsBtn.addEventListener("click", () => {
      if (!canControlShowOps()) return;
      applyFxState({ lights: !fxLightsEnabled });
    });
  }

  if (dom.fxFireworksBtn) {
    dom.fxFireworksBtn.addEventListener("click", () => {
      if (!canControlShowOps() || activeMap !== "hall") return;
      requestFireworkBurst();
    });
  }

  if (dom.qualitySelect) {
    dom.qualitySelect.addEventListener("change", () => {
      qualityMode = QUALITY_MODES[dom.qualitySelect.value] ? dom.qualitySelect.value : "medium";
      applyQuality();
    });
  }

  dom.clipButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const clipId = Number(button.dataset.clipId || 0);
      playPerformerClip(clipId, { record: true });
    });
  });

  dom.performerActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const actionId = String(button.dataset.performerAction || "").trim();
      if (!actionId) return;
      playPerformerAction(actionId, { record: true });
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

  initializePortalExitUrl();
  setupNetworkPanelToggle();
  applyUiVisibilityMode();
  if (adminUiMode) {
    setupNetworkProfileUi();
  }
  setupShowMedia();
  setupPlayerSystem();
  setupFirstPersonControls();
  setupMobileControls();
  if (chatEnabled) {
    setupChatUi();
  }
  ensureNicknameGate().then(() => {
    setupRealtime();
  });
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
          currentPerformerActionId,
          lastNetworkActiveClipId,
          lastNetworkActiveActionId,
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

  function setNetworkPanelExpanded(expanded) {
    networkPanelExpanded = Boolean(expanded);

    if (dom.networkPanel) {
      dom.networkPanel.classList.toggle("hidden", !networkPanelExpanded);
    }

    if (dom.optionVersionNote) {
      dom.optionVersionNote.textContent = "\uBC84\uC804 1.2";
      dom.optionVersionNote.classList.toggle("hidden", !networkPanelExpanded);
    }

    if (dom.networkPanelToggleBtn) {
      dom.networkPanelToggleBtn.classList.toggle("active", networkPanelExpanded);
      dom.networkPanelToggleBtn.textContent = networkPanelExpanded
        ? "온라인 접속 패널 닫기"
        : "온라인 접속 패널 열기";
      dom.networkPanelToggleBtn.setAttribute("aria-expanded", String(networkPanelExpanded));
    }
  }

  function setupNetworkPanelToggle() {
    if (!dom.networkPanelToggleBtn || !dom.networkPanel) {
      return;
    }

    setNetworkPanelExpanded(false);
    dom.networkPanelToggleBtn.addEventListener("click", () => {
      setNetworkPanelExpanded(!networkPanelExpanded);
    });
  }

  function setMovementStateFromMobileAxes(axisX, axisY) {
    const threshold = 0.22;
    moveState.forward = axisY > threshold;
    moveState.backward = axisY < -threshold;
    moveState.right = axisX > threshold;
    moveState.left = axisX < -threshold;
  }

  function updateMobileMoveFromPointer(clientX, clientY) {
    if (!dom.mobileMovePad || !dom.mobileMoveStick) {
      return;
    }

    const rect = dom.mobileMovePad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    mobileMoveRadius = Math.max(12, Math.min(rect.width, rect.height) * 0.5 - 18);

    const rawDx = clientX - centerX;
    const rawDy = clientY - centerY;
    const distance = Math.hypot(rawDx, rawDy);
    const scale = distance > mobileMoveRadius ? (mobileMoveRadius / distance) : 1;
    const dx = rawDx * scale;
    const dy = rawDy * scale;

    const axisX = mobileMoveRadius > 0 ? dx / mobileMoveRadius : 0;
    const axisY = mobileMoveRadius > 0 ? -dy / mobileMoveRadius : 0;

    dom.mobileMoveStick.style.transform = `translate(calc(-50% + ${dx.toFixed(2)}px), calc(-50% + ${dy.toFixed(2)}px))`;
    setMovementStateFromMobileAxes(axisX, axisY);
  }

  function resetMobileMoveInput() {
    mobileMovePointerId = null;
    setMovementStateFromMobileAxes(0, 0);
    if (dom.mobileMoveStick) {
      dom.mobileMoveStick.style.transform = "translate(-50%, -50%)";
    }
  }

  function setupMobileControls() {
    if (!isMobile) {
      return;
    }

    document.body.classList.add("is-mobile-ui");
    document.body.classList.add("mobile-simple-ui");
    if (dom.mobileUi) {
      dom.mobileUi.classList.remove("hidden");
    }

    if (dom.mobileMovePad) {
      const matchesMovePointer = (event) => event.pointerId === mobileMovePointerId;
      const tryCaptureMovePointer = (pointerId) => {
        try {
          dom.mobileMovePad.setPointerCapture?.(pointerId);
        } catch (_error) {}
      };
      const tryReleaseMovePointer = (pointerId) => {
        try {
          dom.mobileMovePad.releasePointerCapture?.(pointerId);
        } catch (_error) {}
      };

      dom.mobileMovePad.addEventListener("pointerdown", (event) => {
        if (mobileMovePointerId !== null && event.pointerId !== mobileMovePointerId) {
          return;
        }
        mobileMovePointerId = event.pointerId;
        tryCaptureMovePointer(event.pointerId);
        updateMobileMoveFromPointer(event.clientX, event.clientY);
        event.preventDefault();
      });

      const handleMovePointer = (event) => {
        if (!matchesMovePointer(event)) {
          return;
        }
        updateMobileMoveFromPointer(event.clientX, event.clientY);
        event.preventDefault();
      };

      dom.mobileMovePad.addEventListener("pointermove", handleMovePointer);
      window.addEventListener("pointermove", handleMovePointer, { passive: false });

      const clearMovePointer = (event) => {
        if (!matchesMovePointer(event)) {
          return;
        }
        tryReleaseMovePointer(event.pointerId);
        resetMobileMoveInput();
      };

      dom.mobileMovePad.addEventListener("pointerup", clearMovePointer);
      dom.mobileMovePad.addEventListener("pointercancel", clearMovePointer);
      dom.mobileMovePad.addEventListener("lostpointercapture", clearMovePointer);
      window.addEventListener("pointerup", clearMovePointer, { passive: true });
      window.addEventListener("pointercancel", clearMovePointer, { passive: true });
    }

    if (dom.mobileJumpBtn) {
      const clearJumpVisual = () => dom.mobileJumpBtn.classList.remove("active");
      dom.mobileJumpBtn.addEventListener("pointerdown", () => {
        moveState.jump = true;
        dom.mobileJumpBtn.classList.add("active");
      });
      dom.mobileJumpBtn.addEventListener("pointerup", clearJumpVisual);
      dom.mobileJumpBtn.addEventListener("pointercancel", clearJumpVisual);
      dom.mobileJumpBtn.addEventListener("pointerleave", clearJumpVisual);
    }

    if (dom.mobileSprintBtn) {
      const setRun = (active) => {
        moveState.run = Boolean(active);
        dom.mobileSprintBtn.classList.toggle("active", Boolean(active));
      };
      dom.mobileSprintBtn.addEventListener("pointerdown", () => setRun(true));
      dom.mobileSprintBtn.addEventListener("pointerup", () => setRun(false));
      dom.mobileSprintBtn.addEventListener("pointercancel", () => setRun(false));
      dom.mobileSprintBtn.addEventListener("pointerleave", () => setRun(false));
    }

    if (dom.mobileChatBtn) {
      dom.mobileChatBtn.addEventListener("pointerdown", () => {
        if (chatCollapsed) {
          setChatCollapsed(false);
          dom.chatInput?.focus();
          return;
        }
        setChatCollapsed(true);
        dom.chatInput?.blur();
      });
    }

    renderer.domElement.addEventListener("touchstart", (event) => {
      if (!firstPersonEnabled || mobileLookTouchId !== null) {
        return;
      }

      const target = event.target;
      if (
        target instanceof Element && (
          dom.mobileUi?.contains(target) ||
          dom.chatUi?.contains(target) ||
          dom.overlay?.contains(target)
        )
      ) {
        return;
      }

      const touch = event.changedTouches?.[0] ?? event.touches?.[0];
      if (!touch) {
        return;
      }

      mobileLookTouchId = touch.identifier;
      mobileLookLastX = touch.clientX;
      mobileLookLastY = touch.clientY;
    }, { passive: true });

    renderer.domElement.addEventListener("touchmove", (event) => {
      if (!firstPersonEnabled || mobileLookTouchId === null) {
        return;
      }

      const touch = Array.from(event.touches ?? []).find(
        (candidate) => candidate.identifier === mobileLookTouchId
      );
      if (!touch) {
        return;
      }

      const dx = touch.clientX - mobileLookLastX;
      const dy = touch.clientY - mobileLookLastY;
      mobileLookLastX = touch.clientX;
      mobileLookLastY = touch.clientY;

      playerYaw -= dx * PLAYER_LOOK_SENSITIVITY * 0.9;
      playerPitch -= dy * PLAYER_LOOK_SENSITIVITY * 0.9;
      playerPitch = THREE.MathUtils.clamp(playerPitch, -1.45, 1.45);
    }, { passive: true });

    const clearLookTouch = (event) => {
      if (mobileLookTouchId === null) {
        return;
      }
      const ended = Array.from(event.changedTouches ?? []).some(
        (touch) => touch.identifier === mobileLookTouchId
      );
      if (ended) {
        mobileLookTouchId = null;
      }
    };

    window.addEventListener("touchend", clearLookTouch, { passive: true });
    window.addEventListener("touchcancel", clearLookTouch, { passive: true });
  }
  function computePortalState(_nowMs = Date.now()) {
    return { phase: "open", secondsLeft: 0, progress: 1 };
  }

  function getPortalPhaseSummary() {
    if (!doorOpen) return "\uBB38 \uB2EB\uD798 - \uD638\uC2A4\uD2B8 \uB300\uAE30";
    return isNearLobbyDoor()
      ? "\uBB38 \uAC1C\uBC29 - E\uB85C \uACF5\uC5F0\uC7A5 \uC785\uC7A5"
      : "\uBB38 \uAC1C\uBC29 - \uB85C\uBE44 \uC911\uC559 \uBB38 \uADFC\uCC98\uB85C \uC774\uB3D9";
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

  function sanitizePlayerName(input) {
    return String(input || "")
      .replace(/[^0-9a-zA-Z\u3131-\u318E\uAC00-\uD7A3 _-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 24);
  }

  function initializePortalExitUrl() {
    const explicitPortal = resolveExternalUrl(portalExitUrlRaw) || resolveExternalUrl(externalReturnUrlRaw);
    if (explicitPortal) {
      portalExitUrl = explicitPortal;
      try {
        window.localStorage.setItem(PORTAL_EXIT_URL_STORAGE_KEY, explicitPortal);
      } catch (_error) {}
      return;
    }
    portalExitUrl = DEFAULT_PORTAL_EXIT_URL;
  }

  function buildPortalExitUrl() {
    const explicit = resolveExternalUrl(portalExitUrl);
    if (explicit) return explicit;
    return DEFAULT_PORTAL_EXIT_URL;
  }

  function persistPlayerName(name) {
    try {
      window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
    } catch (_error) {}
  }

  function syncNameQueryParam(name) {
    try {
      const nextQuery = new URLSearchParams(window.location.search);
      if (name) {
        nextQuery.set("name", name);
      } else {
        nextQuery.delete("name");
      }
      const nextQueryString = nextQuery.toString();
      const nextUrl = nextQueryString
        ? window.location.pathname + "?" + nextQueryString + (window.location.hash || "")
        : window.location.pathname + (window.location.hash || "");
      window.history.replaceState(null, "", nextUrl);
    } catch (_error) {}
  }

  function ensureNicknameGate() {
    if (nicknameGateResolved) {
      return Promise.resolve(clientDisplayName);
    }
    if (nicknameGatePromise) {
      return nicknameGatePromise;
    }

    nicknameGatePromise = new Promise((resolve) => {
      const fallbackStoredName = (() => {
        try {
          return sanitizePlayerName(window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "");
        } catch (_error) {
          return "";
        }
      })();

      const initialName = sanitizePlayerName(requestedPlayerName)
        || fallbackStoredName
        || sanitizePlayerName(clientDisplayName);

      const commitName = () => {
        const nextName = sanitizePlayerName(dom.nicknameGateInput ? dom.nicknameGateInput.value : initialName);
        if (!nextName || nextName.length < 2) {
          if (dom.nicknameGateNote) {
            dom.nicknameGateNote.textContent = "\uB2C9\uB124\uC784\uC744 2~24\uC790\uB85C \uC785\uB825\uD558\uC138\uC694.";
          }
          dom.nicknameGateInput?.focus();
          return;
        }

        requestedPlayerName = nextName;
        clientDisplayName = nextName;
        if (dom.networkNameInput) {
          dom.networkNameInput.value = nextName;
        }
        if (dom.nicknameGateNote) {
          dom.nicknameGateNote.textContent = "\uC785\uC7A5 \uC900\uBE44 \uC644\uB8CC";
        }

        persistPlayerName(nextName);
        syncNameQueryParam(nextName);

        if (dom.nicknameGate) {
          dom.nicknameGate.classList.add("hidden");
        }

        dom.nicknameGateConfirmBtn?.removeEventListener("click", onConfirmClick);
        dom.nicknameGateInput?.removeEventListener("keydown", onInputKeydown);

        nicknameGateResolved = true;
        resolve(nextName);
      };

      const onConfirmClick = () => {
        commitName();
      };

      const onInputKeydown = (event) => {
        if (String(event.key || "").toLowerCase() === "enter") {
          event.preventDefault();
          commitName();
        }
      };

      if (!dom.nicknameGate || !dom.nicknameGateInput || !dom.nicknameGateConfirmBtn) {
        const finalName = initialName && initialName.length >= 2
          ? initialName
          : ("\uD50C\uB808\uC774\uC5B4-" + Math.floor(Math.random() * 9000 + 1000));
        requestedPlayerName = finalName;
        clientDisplayName = finalName;
        persistPlayerName(finalName);
        syncNameQueryParam(finalName);
        nicknameGateResolved = true;
        resolve(finalName);
        return;
      }

      dom.nicknameGateInput.value = initialName;
      if (dom.nicknameGateNote) {
        dom.nicknameGateNote.textContent = "\uB2C9\uB124\uC784\uC744 \uC785\uB825\uD558\uACE0 \uC785\uC7A5 \uBC84\uD2BC\uC744 \uB204\uB974\uC138\uC694.";
      }
      dom.nicknameGate.classList.remove("hidden");
      dom.nicknameGateConfirmBtn.addEventListener("click", onConfirmClick);
      dom.nicknameGateInput.addEventListener("keydown", onInputKeydown);

      setTimeout(() => {
        dom.nicknameGateInput?.focus();
        dom.nicknameGateInput?.select();
      }, 0);
    });

    return nicknameGatePromise;
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

  function handleReturnAction() {
    if (transitionInFlight) return;

    if (activeMap === "hall") {
      setMap("lobby", false);
      snapToLobbyPortalSpawn();
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
  }

  function isNearLobbyPortal(position = camera.position) {
    if (!lobbyMap.portalGroup || typeof lobbyMap.portalGroup.getWorldPosition !== "function") {
      return false;
    }
    lobbyMap.portalGroup.getWorldPosition(lobbyPortalWorldPosition);
    const dx = position.x - lobbyPortalWorldPosition.x;
    const dz = position.z - lobbyPortalWorldPosition.z;
    return dx * dx + dz * dz <= LOBBY_PORTAL_ENTRY_RADIUS_SQ;
  }

  function isNearLobbyDoor(position = camera.position) {
    const dx = position.x;
    const dz = position.z - LOBBY_BOUNDS.closedDoorBarrierZ;
    return dx * dx + dz * dz <= LOBBY_DOOR_ENTRY_RADIUS_SQ;
  }

  function isNearLobbyPoster(position = camera.position) {
    const posterTargets = Array.isArray(lobbyMap.posterSurfaces) && lobbyMap.posterSurfaces.length
      ? lobbyMap.posterSurfaces
      : (lobbyMap.posterSurface ? [lobbyMap.posterSurface] : []);
    if (!posterTargets.length) {
      return false;
    }
    for (const posterSurface of posterTargets) {
      if (!posterSurface || typeof posterSurface.getWorldPosition !== "function") {
        continue;
      }
      posterSurface.getWorldPosition(lobbyPosterWorldPosition);
      const dx = position.x - lobbyPosterWorldPosition.x;
      const dz = position.z - lobbyPosterWorldPosition.z;
      if (dx * dx + dz * dz <= LOBBY_POSTER_ENTRY_RADIUS_SQ) {
        return true;
      }
    }
    return false;
  }

  function ensureLobbyPosterFileInput() {
    if (lobbyPosterFileInput) return lobbyPosterFileInput;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg";
    input.style.display = "none";
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      input.value = "";
      if (!file) return;
      if (!isHostClient || activeMap !== "lobby") {
        appendChatLine("시스템", "호스트만 로비 광고판을 변경할 수 있습니다.", "system");
        return;
      }
      if (lobbyPosterUploading) {
        return;
      }
      lobbyPosterUploading = true;
      updateQueueUi("광고판 이미지 처리 중...");
      try {
        const dataUrl = await prepareLobbyPosterDataUrl(file);
        applyLobbyPosterData(dataUrl, { broadcast: socketConnected && isHostClient });
        appendChatLine("시스템", "로비 광고판 이미지가 적용되었습니다.", "system");
        updateQueueUi("광고판 이미지 적용 완료");
      } catch (error) {
        const message = String(error && error.message ? error.message : "광고판 이미지 적용에 실패했습니다.");
        appendChatLine("시스템", message, "system");
        updateQueueUi(message);
      } finally {
        lobbyPosterUploading = false;
      }
    });
    document.body.appendChild(input);
    lobbyPosterFileInput = input;
    return input;
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("이미지 파일을 읽지 못했습니다."));
      reader.readAsDataURL(file);
    });
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("이미지 디코딩에 실패했습니다."));
      image.src = dataUrl;
    });
  }

  async function prepareLobbyPosterDataUrl(file) {
    const fileType = String(file && file.type ? file.type : "").toLowerCase();
    if (fileType !== "image/jpeg" && fileType !== "image/png") {
      throw new Error("JPG 또는 PNG 파일만 업로드할 수 있습니다.");
    }

    const sourceDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageFromDataUrl(sourceDataUrl);
    const maxDim = 1600;
    const baseWidth = Math.max(1, Math.round(image.naturalWidth || image.width || 1));
    const baseHeight = Math.max(1, Math.round(image.naturalHeight || image.height || 1));
    let scale = Math.min(1, maxDim / Math.max(baseWidth, baseHeight));
    let quality = 0.88;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("이미지 캔버스 초기화에 실패했습니다.");
    }

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const width = Math.max(1, Math.round(baseWidth * scale));
      const height = Math.max(1, Math.round(baseHeight * scale));
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.fillStyle = "#0b1524";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      const outputDataUrl = canvas.toDataURL("image/jpeg", quality);
      if (outputDataUrl.length <= LOBBY_POSTER_MAX_DATA_URL_LENGTH) {
        return outputDataUrl;
      }

      if (quality > 0.62) {
        quality -= 0.1;
      } else {
        scale *= 0.8;
      }
    }

    throw new Error("이미지가 너무 큽니다. 더 작은 JPG/PNG 이미지를 업로드하세요.");
  }

  function disposeLobbyPosterTexture() {
    if (!lobbyPosterTexture) return;
    if (typeof lobbyPosterTexture.dispose === "function") {
      lobbyPosterTexture.dispose();
    }
    lobbyPosterTexture = null;
  }

  function applyLobbyPosterData(dataUrl, options = {}) {
    const { broadcast = false } = options;
    const hasPosterSurface = (Array.isArray(lobbyMap.posterSurfaces) && lobbyMap.posterSurfaces.length > 0)
      || !!lobbyMap.posterSurface;
    if (!hasPosterSurface || !lobbyMap.posterMaterial) return;
    const safeDataUrl = String(dataUrl || "").trim();
    if (!safeDataUrl) return;

    lobbyPosterDataUrl = safeDataUrl;
    const loadToken = ++lobbyPosterLoadToken;
    const loader = new THREE.TextureLoader();
    loader.load(
      safeDataUrl,
      (texture) => {
        if (loadToken !== lobbyPosterLoadToken) {
          texture.dispose();
          return;
        }
        disposeLobbyPosterTexture();
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.encoding = THREE.sRGBEncoding;
        lobbyPosterTexture = texture;
        lobbyMap.posterMaterial.map = texture;
        lobbyMap.posterMaterial.color.setHex(0xffffff);
        lobbyMap.posterMaterial.needsUpdate = true;
      },
      undefined,
      () => {
        appendChatLine("시스템", "광고판 이미지 적용에 실패했습니다.", "system");
      }
    );

    if (broadcast && socketConnected && socket && isHostClient) {
      socket.emit("lobby:poster:set", { dataUrl: safeDataUrl, ts: Date.now() });
    }
  }

  function applyLobbyPosterFromPayload(posterPayload) {
    if (!posterPayload || typeof posterPayload !== "object") return;
    const dataUrl = String(posterPayload.dataUrl || "").trim();
    if (!dataUrl) return;
    if (dataUrl === lobbyPosterDataUrl && lobbyPosterTexture) return;
    applyLobbyPosterData(dataUrl, { broadcast: false });
  }

  function tryOpenLobbyPosterPickerByKey() {
    if (!isHostClient || activeMap !== "lobby" || !firstPersonEnabled || transitionInFlight) {
      return false;
    }
    if (!isNearLobbyPoster()) {
      return false;
    }
    if (lobbyPosterUploading) {
      return true;
    }
    const input = ensureLobbyPosterFileInput();
    input.value = "";
    input.click();
    return true;
  }

  function updatePortalUiCopy(forceMapHint = false) {
    if (activeMap !== "lobby") {
      if (forceMapHint && dom.statusIntent) {
        dom.statusIntent.textContent = MAP_META[activeMap].hint;
      }
      if (dom.portalPhaseNote) {
        dom.portalPhaseNote.textContent = "\uB85C\uBE44\uC5D0\uC11C \uBB38 \uC0C1\uD0DC\uB97C \uD655\uC778\uD558\uC138\uC694.";
      }
      updateDoorUi();
      return;
    }

    const summary = getPortalPhaseSummary();
    const nearPortal = isNearLobbyPortal();
    const nearPoster = isNearLobbyPoster();
    const exitUrl = buildPortalExitUrl();

    if (dom.statusIntent) {
      const nearDoor = isNearLobbyDoor();
      if (nearPoster && isHostClient && firstPersonEnabled) {
        dom.statusIntent.textContent = "벽 광고판 앞입니다. E 키로 JPG/PNG 이미지를 업로드할 수 있습니다.";
      } else if (nearPortal) {
        dom.statusIntent.textContent = exitUrl
          ? "\uD3EC\uD0C8 \uADFC\uCC98\uC785\uB2C8\uB2E4. \uD3EC\uD0C8\uC5D0 \uC811\uCD09\uD558\uBA74 \uB2E4\uC74C \uB9C1\uD06C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4."
          : "\uD3EC\uD0C8 \uB9C1\uD06C\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.";
      } else if (!doorOpen) {
        dom.statusIntent.textContent = "\uBB38\uC774 \uB2EB\uD600 \uC788\uC2B5\uB2C8\uB2E4. \uD638\uC2A4\uD2B8\uAC00 \uBB38\uC744 \uC5F4\uC5B4\uC57C \uACF5\uC5F0\uC7A5 \uC785\uC7A5\uC774 \uAC00\uB2A5\uD569\uB2C8\uB2E4.";
      } else if (nearDoor) {
        dom.statusIntent.textContent = "\uBB38\uC774 \uAC1C\uBC29\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBCF5\uB3C4\uB97C \uB530\uB77C \uAC78\uC5B4\uAC00\uBA74 \uACF5\uC5F0\uC7A5\uC73C\uB85C \uC5F0\uACB0\uB429\uB2C8\uB2E4.";
      } else {
        dom.statusIntent.textContent = "\uBB38\uC774 \uAC1C\uBC29\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uBCF5\uB3C4\uB97C \uB530\uB77C \uACF5\uC5F0\uC7A5\uC73C\uB85C \uC774\uB3D9\uD558\uC138\uC694.";
      }
    }

    if (dom.portalPhaseNote) {
      if (nearPoster && isHostClient && firstPersonEnabled) {
        dom.portalPhaseNote.textContent = "광고판 편집 가능 (E)";
      } else {
        dom.portalPhaseNote.textContent = nearPortal
          ? (exitUrl ? "\uD3EC\uD0C8 \uC774\uB3D9 \uAC00\uB2A5" : "\uD3EC\uD0C8 \uB9C1\uD06C \uBBF8\uC124\uC815")
          : summary;
      }
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

  function showTemporaryLoadingMessage(message, timeoutMs = 900) {
    dom.loading.textContent = message;
    dom.loading.classList.remove("hidden");
    setTimeout(() => {
      if (!transitionInFlight) {
        dom.loading.classList.add("hidden");
        dom.loading.textContent = "\uB85C\uBE44 \uAD6C\uC131 \uC911...";
      }
    }, timeoutMs);
  }

  function enterExternalPortal() {
    if (activeMap !== "lobby" || transitionInFlight) return false;
    if (!isNearLobbyPortal()) return false;

    const targetUrl = buildPortalExitUrl();
    if (!targetUrl) {
      showTemporaryLoadingMessage("\uC678\uBD80 \uD3EC\uD0C8 \uB9C1\uD06C\uAC00 \uC544\uC9C1 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.", 1100);
      return true;
    }

    transitionInFlight = true;
    setPortalTransition(true, "\uC678\uBD80 \uD3EC\uD0C8", "\uC678\uBD80 \uB9C1\uD06C\uB85C \uC774\uB3D9 \uC911...");
    dom.loading.textContent = "\uC678\uBD80 \uB9C1\uD06C \uC774\uB3D9 \uC911...";
    dom.loading.classList.remove("hidden");

    setTimeout(() => {
      window.location.assign(targetUrl);
    }, 420);
    return true;
  }

  function handleLobbyInteract() {
    if (activeMap !== "lobby" || transitionInFlight) return;
    if (enterExternalPortal()) return;
    enterHall();
  }

  function enterHall() {
    if (activeMap !== "lobby" || transitionInFlight) return;

    refreshPortalState(false);

    if (!isNearLobbyDoor()) {
      showTemporaryLoadingMessage("\uB85C\uBE44 \uC911\uC559 \uBB38 \uADFC\uCC98\uC5D0\uC11C E\uB97C \uB20C\uB7EC \uC785\uC7A5\uD558\uC138\uC694.");
      return;
    }

    if (!doorOpen) {
      showTemporaryLoadingMessage("\uBB38\uC774 \uB2EB\uD600 \uC788\uC2B5\uB2C8\uB2E4. \uD638\uC2A4\uD2B8\uAC00 \uBB38\uC744 \uC5F4\uC5B4\uC57C \uC785\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
      return;
    }

    transitionInFlight = true;
    setPortalTransition(true, "\uC785\uC7A5 \uB3D9\uAE30\uD654", "\uACF5\uC5F0\uC7A5 \uC785\uC7A5 \uC911...");
    dom.loading.textContent = "\uC785\uC7A5 \uC911...";
    dom.loading.classList.remove("hidden");

    setTimeout(() => {
      setMap("hall", true);
      snapToHallEntryView();
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
    if (dom.portalActionBtn) {
      dom.portalActionBtn.classList.add("hidden");
      dom.portalActionBtn.disabled = true;
    }
    if (dom.portalPhaseNote) {
      dom.portalPhaseNote.classList.add("hidden");
    }
  }

  function shouldAutoEnterHallFromLobby(position = camera.position) {
    if (activeMap !== "lobby" || !doorOpen || transitionInFlight) {
      return false;
    }
    return position.z >= LOBBY_HALL_AUTO_ENTER_Z && Math.abs(position.x) <= LOBBY_HALL_AUTO_ENTER_HALF_WIDTH;
  }

  function enterHallFromCorridor() {
    if (!shouldAutoEnterHallFromLobby()) {
      return;
    }
    const nowMs = Date.now();
    if (nowMs - lastCorridorMapSwitchAt < CORRIDOR_MAP_SWITCH_COOLDOWN_MS) {
      return;
    }
    const prevYaw = playerYaw;
    const prevPitch = playerPitch;
    transitionInFlight = true;
    lastCorridorMapSwitchAt = nowMs;
    setMap("hall", false, { preserveView: true });

    const nextX = clampNumber(camera.position.x * 1.05, -6.5, 6.5);
    const eyeY = PLAYER_EYE_HEIGHT.hall;
    camera.position.set(nextX, eyeY, 40.6);

    playerYaw = prevYaw;
    playerPitch = prevPitch;
    syncPlayerHeightToGround({ resetVelocity: true });
    applyFirstPersonViewRotation();
    syncOrbitTargetToCamera();
    emitLocalPlayerState(true);

    transitionInFlight = false;
  }

  function shouldAutoReturnLobbyFromHall(position = camera.position) {
    if (activeMap !== "hall" || !doorOpen || !firstPersonEnabled || transitionInFlight) {
      return false;
    }
    return position.z <= HALL_LOBBY_AUTO_RETURN_Z && Math.abs(position.x) <= HALL_LOBBY_AUTO_RETURN_HALF_WIDTH;
  }

  function enterLobbyFromHallCorridor() {
    if (!shouldAutoReturnLobbyFromHall()) {
      return;
    }
    const nowMs = Date.now();
    if (nowMs - lastCorridorMapSwitchAt < CORRIDOR_MAP_SWITCH_COOLDOWN_MS) {
      return;
    }

    const prevYaw = playerYaw;
    const prevPitch = playerPitch;
    transitionInFlight = true;
    lastCorridorMapSwitchAt = nowMs;
    setMap("lobby", false, { preserveView: true });

    const nextX = clampNumber(camera.position.x * 0.85, -3.2, 3.2);
    const eyeY = PLAYER_EYE_HEIGHT.lobby;
    camera.position.set(nextX, eyeY, 35.0);

    playerYaw = prevYaw;
    playerPitch = prevPitch;
    syncPlayerHeightToGround({ resetVelocity: true });
    applyFirstPersonViewRotation();
    syncOrbitTargetToCamera();
    emitLocalPlayerState(true);

    transitionInFlight = false;
  }

  function snapToLobbyPortalSpawn() {
    if (activeMap !== "lobby") return;

    const eyeY = firstPersonEnabled ? PLAYER_EYE_HEIGHT.lobby : 6.4;
    const targetY = firstPersonEnabled ? PLAYER_EYE_HEIGHT.lobby : 2.8;

    camera.position.set(0, eyeY, 10.8);
    controls.target.set(0, targetY, 24.5);
    controls.update();

    syncYawPitchFromCamera();
    if (firstPersonEnabled) {
      syncPlayerHeightToGround({ resetVelocity: true });
      syncOrbitTargetToCamera();
    }

    emitLocalPlayerState(true);
    updateHud();
  }

  function snapToHallEntryView() {
    if (activeMap !== "hall") return;

    const eyeY = firstPersonEnabled ? PLAYER_EYE_HEIGHT.hall : 4.8;
    const targetY = firstPersonEnabled ? PLAYER_EYE_HEIGHT.hall : 3.4;

    camera.position.set(0, eyeY, 43.2);
    controls.target.set(0, targetY, 68.0);
    controls.update();

    syncYawPitchFromCamera();
    if (firstPersonEnabled) {
      syncPlayerHeightToGround({ resetVelocity: true });
      syncOrbitTargetToCamera();
    }

    emitLocalPlayerState(true);
    updateHud();
  }

  function setMap(nextMap, immediate, options = {}) {
    const { preserveView = false } = options;
    activeMap = nextMap === "hall" ? "hall" : "lobby";
    // Keep lobby <-> corridor <-> hall continuously visible from both sides.
    lobbyMap.group.visible = true;
    hallMap.group.visible = true;
    hallMap.seatingGroup.visible = true;
    scene.fog.density = activeMap === "hall" ? 0.014 : 0.017;
    controls.maxDistance = activeMap === "hall" ? 95 : 40;

    const defaultPreset = activeMap === "hall" ? "hall_wide" : "lobby_entry";
    if (preserveView) {
      cameraTween = null;
      activePreset = defaultPreset;
    } else {
      applyPreset(defaultPreset, immediate);
    }
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
      const name = String(button.dataset.preset || "");
      button.classList.remove("hidden");
      button.classList.toggle("active", name === activePreset);
    });
  }

  function updateUiByMap() {
    updatePortalUiCopy(true);
    dom.portalActionBtn.classList.add("hidden");
    dom.portalPhaseNote?.classList.add("hidden");
    updateDoorUi();
    const hasExternalReturn = Boolean(buildLobbyReturnUrl());
    const showReturn = activeMap === "hall" || hasExternalReturn;
    dom.returnLobbyBtn.classList.toggle("hidden", !showReturn);
    dom.returnLobbyBtn.textContent = activeMap === "hall" ? "\uB85C\uBE44\uB85C \uB3CC\uC544\uAC00\uAE30" : "EMPTINES\uB85C \uBCF5\uADC0";
    if (dom.mobileReturnBtn) {
      dom.mobileReturnBtn.classList.toggle("hidden", activeMap !== "hall");
    }
    const hallOnly = activeMap === "hall";
    updateFxButtons();
    updatePresetButtons();
    updateQueueUi();
    if (firstPersonEnabled) {
      syncYawPitchFromCamera();
    }
  }

function updateFxButtons() {
    const hallOnly = activeMap === "hall";
    const canControl = canControlShowOps();

    if (dom.fxParticlesBtn) {
      dom.fxParticlesBtn.classList.toggle("active", fxParticlesEnabled);
      dom.fxParticlesBtn.textContent = fxParticlesEnabled ? "\ud30c\ud2f0\ud074 \ub044\uae30" : "\ud30c\ud2f0\ud074 \ucf1c\uae30";
      dom.fxParticlesBtn.disabled = !canControl || !hallOnly;
    }

    if (dom.fxLightsBtn) {
      dom.fxLightsBtn.classList.toggle("active", fxLightsEnabled);
      dom.fxLightsBtn.textContent = fxLightsEnabled ? "\ubd88 \ub044\uae30" : "\ubd88 \ucf1c\uae30";
      dom.fxLightsBtn.disabled = !canControl;
    }

    if (dom.fxFireworksBtn) {
      dom.fxFireworksBtn.disabled = !canControl || !hallOnly;
    }
  }

  function applyFxState(nextState, options = {}) {
    const { broadcast = socketConnected && isHostClient, fromNetwork = false } = options;
    let changed = false;

    if (nextState && Object.prototype.hasOwnProperty.call(nextState, "particles")) {
      const nextParticles = Boolean(nextState.particles);
      if (fxParticlesEnabled !== nextParticles) {
        fxParticlesEnabled = nextParticles;
        changed = true;
      }
    }

    if (nextState && Object.prototype.hasOwnProperty.call(nextState, "lights")) {
      const nextLights = Boolean(nextState.lights);
      if (fxLightsEnabled !== nextLights) {
        fxLightsEnabled = nextLights;
        changed = true;
      }
    }

    if (changed) {
      applyQuality();
    }

    updateFxButtons();

    if (broadcast && socketConnected && isHostClient && socket && !fromNetwork) {
      socket.emit("fx:set", {
        particles: fxParticlesEnabled,
        lights: fxLightsEnabled,
        ts: Date.now()
      });
    }
  }

  function requestFireworkBurst(options = {}) {
    const { broadcast = socketConnected && isHostClient, fromNetwork = false } = options;
    pendingFireworkBursts += 2;

    if (broadcast && socketConnected && isHostClient && socket && !fromNetwork) {
      socket.emit("fx:set", {
        burst: true,
        ts: Date.now()
      });
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
    hallMap.particles.visible = fxParticlesEnabled && activeMap === "hall";
    updateHud();
  }

  function createStageReverbImpulseBuffer(audioContext, seconds, decay, preDelaySeconds) {
    const durationSeconds = Math.max(0.6, Number(seconds) || 2.25);
    const decayPower = Math.max(0.6, Number(decay) || 2.75);
    const preDelay = Math.max(0, Number(preDelaySeconds) || 0);
    const sampleRate = audioContext.sampleRate || 48000;
    const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
    const impulse = audioContext.createBuffer(2, frameCount, sampleRate);
    const preDelayFrames = Math.floor(preDelay * sampleRate);

    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < frameCount; i += 1) {
        if (i < preDelayFrames) {
          data[i] = 0;
          continue;
        }
        const t = (i - preDelayFrames) / Math.max(1, frameCount - preDelayFrames);
        const envelope = Math.pow(1 - t, decayPower);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }
    }

    return impulse;
  }

  function ensureStageVideoAudioGraph() {
    if (!stageVideo) return false;
    if (stageAudioGraphReady && stageAudioContext && stageAudioSourceNode) {
      return true;
    }
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return false;
    }

    try {
      if (!stageAudioContext) {
        stageAudioContext = new AudioContextCtor();
      }
      if (!stageAudioSourceNode) {
        stageAudioSourceNode = stageAudioContext.createMediaElementSource(stageVideo);
      }
      if (!stageAudioConvolverNode) {
        stageAudioConvolverNode = stageAudioContext.createConvolver();
        stageAudioConvolverNode.buffer = createStageReverbImpulseBuffer(
          stageAudioContext,
          STAGE_AUDIO_REVERB_SECONDS,
          STAGE_AUDIO_REVERB_DECAY,
          STAGE_AUDIO_REVERB_PREDELAY_SECONDS
        );
      }
      if (!stageAudioDryGainNode) {
        stageAudioDryGainNode = stageAudioContext.createGain();
      }
      if (!stageAudioWetGainNode) {
        stageAudioWetGainNode = stageAudioContext.createGain();
      }
      if (!stageAudioMasterGainNode) {
        stageAudioMasterGainNode = stageAudioContext.createGain();
      }
      if (!stageAudioCompressorNode) {
        stageAudioCompressorNode = stageAudioContext.createDynamicsCompressor();
        stageAudioCompressorNode.threshold.value = -18;
        stageAudioCompressorNode.knee.value = 22;
        stageAudioCompressorNode.ratio.value = 3.2;
        stageAudioCompressorNode.attack.value = 0.007;
        stageAudioCompressorNode.release.value = 0.3;
      }

      stageAudioDryGainNode.gain.value = STAGE_AUDIO_DRY_GAIN;
      stageAudioWetGainNode.gain.value = STAGE_AUDIO_WET_GAIN;
      stageAudioMasterGainNode.gain.value = STAGE_AUDIO_MASTER_GAIN;

      stageAudioSourceNode.disconnect();
      stageAudioDryGainNode.disconnect();
      stageAudioWetGainNode.disconnect();
      stageAudioConvolverNode.disconnect();
      stageAudioMasterGainNode.disconnect();
      stageAudioCompressorNode.disconnect();

      stageAudioSourceNode.connect(stageAudioDryGainNode);
      stageAudioSourceNode.connect(stageAudioConvolverNode);
      stageAudioConvolverNode.connect(stageAudioWetGainNode);
      stageAudioDryGainNode.connect(stageAudioMasterGainNode);
      stageAudioWetGainNode.connect(stageAudioMasterGainNode);
      stageAudioMasterGainNode.connect(stageAudioCompressorNode);
      stageAudioCompressorNode.connect(stageAudioContext.destination);
      stageAudioGraphReady = true;
      return true;
    } catch (error) {
      stageAudioGraphReady = false;
      return false;
    }
  }

  function resumeStageVideoAudioGraph() {
    if (!ensureStageVideoAudioGraph() || !stageAudioContext) return;
    if (stageAudioContext.state === "suspended") {
      stageAudioContext.resume().catch(() => {});
    }
  }

  function setupShowMedia() {
    const bg = document.createElement("video");
    bg.src = activeShowVideoPath;
    // Keep an ahead buffer on mobile to prevent long-track stalls around mid-playback.
    bg.preload = "auto";
    bg.loop = false;
    bg.muted = false;
    bg.volume = 1.0;
    bg.playsInline = true;
    bg.crossOrigin = "anonymous";
    bg.setAttribute("webkit-playsinline", "true");
    stageVideo = bg;
    ensureStageVideoAudioGraph();

    bg.addEventListener(
      "canplay",
      () => {
        stageVideoTexture = new THREE.VideoTexture(bg);
        stageVideoTexture.minFilter = THREE.LinearFilter;
        stageVideoTexture.magFilter = THREE.LinearFilter;
        stageVideoTexture.generateMipmaps = false;
        stageVideoTexture.encoding = THREE.sRGBEncoding;
        stageVideoReady = true;
        resetStageVideoWatchdog(0);
        updateShowStartButton();

        if (pendingShowStartFromHost && showPlaying && activeMap === "hall") {
          startShow({ broadcast: false, allowNonHost: true, startOffsetSeconds: getNetworkShowOffsetSeconds() });
        }
      },
      { once: true }
    );

    bg.addEventListener("timeupdate", () => {
      noteStageVideoProgress();
    });
    bg.addEventListener("playing", () => {
      noteStageVideoProgress();
    });
    bg.addEventListener("seeked", () => {
      noteStageVideoProgress();
    });
    bg.addEventListener("waiting", () => {
      recoverStageVideoPlayback("waiting");
    });
    bg.addEventListener("stalled", () => {
      recoverStageVideoPlayback("stalled");
    });

    bg.addEventListener("ended", () => {
      if (queueLoop) {
        if (socketConnected && !isHostClient) {
          pendingShowStartFromHost = true;
          showPlaying = true;
          updateShowStartButton();
          updateQueueUi("호스트 재시작 신호 대기 중...");
          return;
        }
        if (queuePlaying && queueEvents.length > 0) {
          queuePlayIndex = 0;
        }
        startShow({ broadcast: socketConnected && isHostClient, allowNonHost: true });
        updateQueueUi("루프 재생 시작");
        return;
      }

      stopShowLocal({ broadcast: socketConnected && isHostClient });
    });

    bg.addEventListener("error", () => {
      if (!showVideoMobileFallbackTried && activeShowVideoPath === SHOW_VIDEO_PATH_MOBILE) {
        showVideoMobileFallbackTried = true;
        activeShowVideoPath = SHOW_VIDEO_PATH_DESKTOP;
        bg.src = activeShowVideoPath;
        bg.preload = "metadata";
        bg.load();
        updateQueueUi("\uBAA8\uBC14\uC77C \uC601\uC0C1 \uB85C\uB4DC \uC2E4\uD328\uB85C \uC6D0\uBCF8 \uD488\uC9C8 \uC601\uC0C1\uC73C\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4.");
        return;
      }
      stageVideoReady = false;
      updateShowStartButton();
      const bgSrc = activeShowVideoPath;
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
      const autoActionId = normalizePerformerActionId(currentPerformerActionId) || DEFAULT_PERFORMER_ACTION_ID;
      if (!socketConnected || isHostClient) {
        playPerformerAction(autoActionId, {
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
    stageVideoAwaitingUnmuteGesture = false;
    pendingShowStartFromHost = false;
    lastNetworkShowStartedAtMs = 0;
    lastNetworkActiveClipId = 0;
    lastNetworkActiveActionId = "";
    setScreenVideoEnabled(false);

    if (stageVideo) {
      stageVideo.pause();
      stageVideo.currentTime = 0;
    }
    resetStageVideoWatchdog(0);
    if (chromaVideo) {
      chromaVideo.pause();
      chromaVideo.currentTime = 0;
    }
    showPerformerIdleStandPose();

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
    const estimatedServerNow = Date.now() + serverClockOffsetMs;
    return Math.max(0, (estimatedServerNow - lastNetworkShowStartedAtMs) / 1000);
  }

  function syncServerClockOffset(serverNowMs) {
    const nextServerNow = Number(serverNowMs);
    if (!Number.isFinite(nextServerNow) || nextServerNow <= 0) {
      return;
    }
    const sampleOffset = nextServerNow - Date.now();
    if (!Number.isFinite(serverClockOffsetMs) || Math.abs(serverClockOffsetMs) < 1) {
      serverClockOffsetMs = sampleOffset;
      return;
    }
    // Smooth jitter while still converging quickly after reconnect.
    serverClockOffsetMs = serverClockOffsetMs * 0.8 + sampleOffset * 0.2;
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
    resetStageVideoWatchdog(stageVideo.currentTime);
    stageVideo.muted = false;
    stageVideo.defaultMuted = false;
    stageVideo.volume = 1.0;
    stageVideoAwaitingUnmuteGesture = false;
    setScreenVideoEnabled(true);
    resumeStageVideoAudioGraph();

    const stagePlay = stageVideo.play();
    if (stagePlay && typeof stagePlay.catch === "function") {
      stagePlay.catch((error) => {
        const errorName = String(error && error.name ? error.name : "");
        if (errorName !== "NotAllowedError" && errorName !== "AbortError") {
          return;
        }
        stageVideo.muted = true;
        stageVideo.defaultMuted = true;
        stageVideo.volume = 0.0;
        stageVideoAwaitingUnmuteGesture = true;
        const mutedPlay = stageVideo.play();
        if (mutedPlay && typeof mutedPlay.catch === "function") {
          mutedPlay.catch(() => {});
        }
        updateQueueUi("\uBAA8\uBC14\uC77C \uC790\uB3D9\uC7AC\uC0DD \uC81C\uD55C\uC73C\uB85C \uD604\uC7AC \uBB34\uC74C \uC7AC\uC0DD \uC911\uC785\uB2C8\uB2E4. \uD654\uBA74\uC744 \uD55C \uBC88 \uD0ED\uD558\uBA74 \uC18C\uB9AC\uAC00 \uCF1C\uC9D1\uB2C8\uB2E4.");
      });
    }

    if (chromaVideo) {
      chromaVideo.pause();
      chromaVideo.currentTime = 0;
    }
    resetPerformerRuntime();
    if (queuePlaying) {
      queuePlayIndex = 0;
    }

    updateShowStartButton();

    const startActionId = normalizePerformerActionId(currentPerformerActionId) || DEFAULT_PERFORMER_ACTION_ID;
    const startClipId = clipIdFromActionId(startActionId) || normalizeClipId(currentClipId) || DEFAULT_CLIP_ID;
    if (!socketConnected || isHostClient) {
      playPerformerAction(startActionId, {
        record: false,
        broadcast: socketConnected && isHostClient && broadcast,
        silent: true
      });
    }

    if (broadcast && socketConnected && isHostClient && socket) {
      socket.emit("show:start", { activeClip: startClipId, activeAction: startActionId });
    }

    applyLatestNetworkClip();
  }

  function syncShowMediaState() {
    const inHall = activeMap === "hall";
    if (!inHall) {
      queueRecording = false;
      queuePlaying = false;
      queuePlayIndex = 0;
      setScreenVideoEnabled(false);
      if (stageVideo) {
        stageVideo.pause();
      }
      resetStageVideoWatchdog(stageVideo ? stageVideo.currentTime : 0);
      if (chromaVideo) {
        chromaVideo.pause();
      }
      if (hallMap.performerPlane) {
        hallMap.performerPlane.visible = !performerHiddenAfterWalkOut;
      }
      resetPerformerRuntime();
      updateQueueUi();
      return;
    }

    if (!showPlaying) {
      setScreenVideoEnabled(false);
      if (stageVideo) {
        stageVideo.pause();
      }
      resetStageVideoWatchdog(stageVideo ? stageVideo.currentTime : 0);
      updateQueueUi();
      return;
    }

    if (stageVideoReady && stageVideo && stageVideo.paused && !stageVideo.ended) {
      const stagePlay = stageVideo.play();
      if (stagePlay && typeof stagePlay.catch === "function") {
        stagePlay.catch(() => {});
      }
      noteStageVideoProgress();
    }
  }

  function resetStageVideoWatchdog(nextTime = 0) {
    const nowSeconds = performance.now() / 1000;
    stageVideoLastTime = Math.max(0, Number(nextTime) || 0);
    stageVideoLastAdvanceAt = nowSeconds;
    stageVideoLastRecoveryAt = 0;
  }

  function noteStageVideoProgress() {
    if (!stageVideo) return;
    const currentTime = Number(stageVideo.currentTime);
    if (!Number.isFinite(currentTime)) return;
    stageVideoLastTime = Math.max(0, currentTime);
    stageVideoLastAdvanceAt = performance.now() / 1000;
  }

  function recoverStageVideoPlayback(_reason = "watchdog") {
    if (!showPlaying || activeMap !== "hall" || !stageVideo || !stageVideoReady || stageVideo.ended) {
      return;
    }

    const nowSeconds = performance.now() / 1000;
    if (nowSeconds - stageVideoLastRecoveryAt < STAGE_VIDEO_STALL_RECOVERY_COOLDOWN_SECONDS) {
      return;
    }
    stageVideoLastRecoveryAt = nowSeconds;

    const rawCurrentTime = Number(stageVideo.currentTime);
    const safeCurrentTime = Number.isFinite(rawCurrentTime) ? Math.max(0, rawCurrentTime) : 0;
    const nudgeTarget = Number.isFinite(stageVideo.duration) && stageVideo.duration > 0
      ? clampNumber(safeCurrentTime - 0.03, 0, Math.max(0, stageVideo.duration - 0.05))
      : Math.max(0, safeCurrentTime - 0.03);

    try {
      stageVideo.currentTime = nudgeTarget;
    } catch (_error) {
      // ignore seek issues from browsers with strict buffering states
    }

    const resumePlay = stageVideo.play();
    if (resumePlay && typeof resumePlay.catch === "function") {
      resumePlay.catch(() => {});
    }

    stageVideoLastAdvanceAt = nowSeconds;
  }

  function monitorStageVideoPlayback() {
    if (
      !showPlaying ||
      activeMap !== "hall" ||
      !stageVideo ||
      !stageVideoReady ||
      stageVideo.paused ||
      stageVideo.ended
    ) {
      return;
    }

    const nowSeconds = performance.now() / 1000;
    const currentTime = Number(stageVideo.currentTime);
    if (!Number.isFinite(currentTime)) {
      return;
    }

    if (currentTime > stageVideoLastTime + 0.04) {
      stageVideoLastTime = currentTime;
      stageVideoLastAdvanceAt = nowSeconds;
      return;
    }

    if (!stageVideoLastAdvanceAt) {
      stageVideoLastAdvanceAt = nowSeconds;
      return;
    }

    if (nowSeconds - stageVideoLastAdvanceAt >= STAGE_VIDEO_STALL_DETECTION_SECONDS) {
      recoverStageVideoPlayback("watchdog");
    }
  }

  function tryRestoreStageVideoAudio() {
    resumeStageVideoAudioGraph();
    if (!stageVideoAwaitingUnmuteGesture || !stageVideo || !showPlaying) {
      return;
    }
    stageVideo.muted = false;
    stageVideo.defaultMuted = false;
    stageVideo.volume = 1.0;
    const restorePlay = stageVideo.play();
    if (!restorePlay || typeof restorePlay.then !== "function") {
      stageVideoAwaitingUnmuteGesture = false;
      return;
    }
    restorePlay
      .then(() => {
        stageVideoAwaitingUnmuteGesture = false;
        updateQueueUi("\uC601\uC0C1 \uC624\uB514\uC624\uB97C \uC7AC\uAC1C\uD588\uC2B5\uB2C8\uB2E4.");
      })
      .catch(() => {
        stageVideo.muted = true;
        stageVideo.defaultMuted = true;
        stageVideo.volume = 0.0;
      });
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

  function getClipActionId(clipId) {
    const safeClipId = normalizeClipId(clipId);
    return safeClipId ? `clip:${safeClipId}` : "";
  }

  function clipIdFromActionId(actionId) {
    const text = String(actionId || "").trim().toLowerCase();
    if (!text) return 0;
    if (text.startsWith("clip:")) {
      return normalizeClipId(text.slice(5));
    }
    return 0;
  }

  function normalizePerformerActionId(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return "";

    const fromClipAction = clipIdFromActionId(text);
    if (fromClipAction) {
      return getClipActionId(fromClipAction);
    }

    const numeric = normalizeClipId(text);
    if (numeric) {
      return getClipActionId(numeric);
    }

    if (SPECIAL_PERFORMER_ACTION_IDS.includes(text)) {
      return text;
    }
    if (text === MANUAL_HIDE_ACTION_ID) {
      return MANUAL_HIDE_ACTION_ID;
    }
    return "";
  }

  function getPerformerActionConfig(actionId) {
    const normalized = normalizePerformerActionId(actionId);
    if (!normalized) return null;

    const clipId = clipIdFromActionId(normalized);
    if (clipId) {
      return {
        id: normalized,
        clipId,
        src: CLIP_VIDEO_PATHS[clipId],
        startTime: 0,
        loop: false,
        stopLoopAtMoveEnd: false,
        mirrorX: false,
        holdX: PERFORMER_BASE_POSITION.x
      };
    }

    const def = SPECIAL_PERFORMER_ACTIONS[normalized];
    if (!def) return null;

    return {
      id: normalized,
      clipId: 0,
      src: String(def.src || ""),
      startTime: Number(def.startTime) || 0,
      endTime: Number(def.endTime),
      freezeAt: Number(def.freezeAt),
      holdX: Number.isFinite(def.holdX) ? Number(def.holdX) : PERFORMER_BASE_POSITION.x,
      moveFromX: Number(def.moveFromX),
      moveToX: Number(def.moveToX),
      moveDuration: Number(def.moveDuration),
      loop: Boolean(def.loop),
      stopLoopAtMoveEnd: Boolean(def.stopLoopAtMoveEnd),
      mirrorX: Boolean(def.mirrorX)
    };
  }

  function applyPerformerTransform(x, mirrorX) {
    if (!hallMap.performerPlane) return;
    hallMap.performerPlane.position.set(
      Number.isFinite(x) ? x : PERFORMER_BASE_POSITION.x,
      PERFORMER_BASE_POSITION.y,
      PERFORMER_BASE_POSITION.z
    );
    hallMap.performerPlane.scale.set(mirrorX ? -1 : 1, 1, 1);
  }

  function resetPerformerRuntime() {
    performerActionRuntime = null;
    if (chromaVideo) {
      chromaVideo.loop = false;
    }
    applyPerformerTransform(PERFORMER_BASE_POSITION.x, false);
  }

  function showPerformerIdleStandPose() {
    if (performerHiddenAfterWalkOut || performerHiddenByManualAction) {
      if (hallMap.performerPlane) {
        hallMap.performerPlane.visible = false;
      }
      performerActionRuntime = null;
      return;
    }

    if (hallMap.performerPlane) {
      hallMap.performerPlane.visible = true;
    }

    const idleConfig = getPerformerActionConfig("idle_hold");
    const holdX = idleConfig && Number.isFinite(idleConfig.holdX)
      ? idleConfig.holdX
      : PERFORMER_BASE_POSITION.x;
    const mirrorX = Boolean(idleConfig && idleConfig.mirrorX);
    applyPerformerTransform(holdX, mirrorX);
    performerActionRuntime = null;

    if (!chromaVideo || !chromaVideoReady || !idleConfig || !idleConfig.src) {
      return;
    }

    const currentSrc = String(chromaVideo.getAttribute("src") || "");
    if (currentSrc !== idleConfig.src) {
      chromaVideo.pause();
      chromaVideo.setAttribute("src", idleConfig.src);
      chromaVideo.load();
    }
    chromaVideo.loop = false;

    if (Number.isFinite(idleConfig.freezeAt)) {
      seekAndFreezeChroma(idleConfig.freezeAt);
      return;
    }

    const idleStart = Math.max(0, Number(idleConfig.startTime) || 0);
    if (chromaVideo.readyState >= 1) {
      chromaVideo.currentTime = idleStart;
    } else {
      chromaVideo.addEventListener("loadedmetadata", () => {
        chromaVideo.currentTime = idleStart;
      }, { once: true });
    }
    chromaVideo.pause();
  }

  function updatePerformerRuntime(nowSeconds) {
    if (!performerActionRuntime || !hallMap.performerPlane || !hallMap.performerPlane.visible) {
      return;
    }

    const runtime = performerActionRuntime;
    if (
      Number.isFinite(runtime.moveFromX) &&
      Number.isFinite(runtime.moveToX) &&
      Number.isFinite(runtime.moveDuration) &&
      runtime.moveDuration > 0
    ) {
      const elapsed = Math.max(0, nowSeconds - runtime.startedAt);
      const linear = clampNumber(elapsed / runtime.moveDuration, 0, 1);
      const eased = linear < 0.5 ? 2 * linear * linear : 1 - Math.pow(-2 * linear + 2, 2) / 2;
      const x = runtime.moveFromX + (runtime.moveToX - runtime.moveFromX) * eased;
      applyPerformerTransform(x, runtime.mirrorX);

      if (linear >= 1 && !runtime.moveCompleted) {
        runtime.moveCompleted = true;
        if (runtime.loop && runtime.stopLoopAtMoveEnd && chromaVideo) {
          chromaVideo.loop = false;
          chromaVideo.pause();
        }
        if (runtime.id === "walk_out" && hallMap.performerPlane) {
          performerHiddenAfterWalkOut = true;
          hallMap.performerPlane.visible = false;
          performerActionRuntime = null;
        }
      }
    }

    if (Number.isFinite(runtime.endTime) && chromaVideo) {
      if (chromaVideo.currentTime >= runtime.endTime - 0.02) {
        chromaVideo.pause();
        chromaVideo.currentTime = runtime.endTime;
      }
    }
  }

  function seekAndFreezeChroma(timeSec) {
    if (!chromaVideo) return;

    const freeze = () => {
      const rawTarget = Number(timeSec) || 0;
      const safeTarget = Number.isFinite(chromaVideo.duration) && chromaVideo.duration > 0
        ? clampNumber(rawTarget, 0, Math.max(0, chromaVideo.duration - 0.05))
        : Math.max(0, rawTarget);
      const finalize = () => {
        chromaVideo.pause();
        chromaVideo.currentTime = safeTarget;
      };

      const onSeeked = () => finalize();
      chromaVideo.addEventListener("seeked", onSeeked, { once: true });
      chromaVideo.currentTime = safeTarget;
      setTimeout(() => {
        if (Math.abs((Number(chromaVideo.currentTime) || 0) - safeTarget) < 0.08) {
          finalize();
        }
      }, 80);
    };

    if (chromaVideo.readyState >= 1) {
      freeze();
    } else {
      chromaVideo.addEventListener("loadedmetadata", freeze, { once: true });
    }
  }

  function setCurrentPerformerAction(actionId, options = {}) {
    const { fromNetwork = false } = options;
    const normalized = normalizePerformerActionId(actionId) || DEFAULT_PERFORMER_ACTION_ID;
    currentPerformerActionId = normalized;
    const numericClipId = clipIdFromActionId(normalized);
    if (numericClipId) {
      currentClipId = numericClipId;
    }
    if (fromNetwork) {
      lastNetworkActiveActionId = normalized;
      lastNetworkActiveClipId = numericClipId;
    }
    updateClipButtons();
  }

  function applyLatestNetworkClip(options = {}) {
    const { force = false } = options;
    if (!socketConnected || isHostClient) return;
    if (activeMap !== "hall") return;
    const fallbackAction = getClipActionId(lastNetworkActiveClipId);
    const actionId = normalizePerformerActionId(lastNetworkActiveActionId || fallbackAction);
    if (!actionId) return;

    const alreadyVisible =
      currentPerformerActionId === actionId &&
      Boolean(hallMap.performerPlane && hallMap.performerPlane.visible);
    if (!force && alreadyVisible) return;

    const clipId = clipIdFromActionId(actionId);
    if (clipId) {
      playPerformerClip(clipId, {
        record: false,
        broadcast: false,
        fromNetwork: true,
        silent: true
      });
      return;
    }

    playPerformerAction(actionId, {
      record: false,
      broadcast: false,
      fromNetwork: true,
      silent: true
    });
  }

  function applyManualPerformerHide(options = {}) {
    const { fromNetwork = false, silent = false } = options;
    performerHiddenByManualAction = true;
    performerActionRuntime = null;

    if (chromaVideo) {
      chromaVideo.loop = false;
      chromaVideo.pause();
    }
    if (hallMap.performerPlane) {
      hallMap.performerPlane.visible = false;
    }

    setCurrentPerformerAction(MANUAL_HIDE_ACTION_ID, { fromNetwork });
    if (!silent) {
      updateQueueUi("\uD37C\uD3EC\uBA38\uB97C \uC784\uC2DC \uC228\uAE30\uAE30 \uC0C1\uD0DC\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4.");
    }
  }

  function playPerformerAction(actionId, options = {}) {
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

    const normalizedActionId = normalizePerformerActionId(actionId);
    if (!normalizedActionId) {
      return;
    }

    if (normalizedActionId === MANUAL_HIDE_ACTION_ID) {
      applyManualPerformerHide({ fromNetwork, silent });

      if (broadcast && socketConnected && isHostClient && socket && !fromNetwork) {
        socket.emit("performer:clip", {
          clipId: 0,
          actionId: normalizedActionId,
          songTime: Number(getSongTimeSeconds().toFixed(3)),
          ts: Date.now()
        });
      }

      if (record && queueRecording) {
        if (!showPlaying || !stageVideo || stageVideo.ended) {
          startShow();
        }
        const eventTime = Number(getSongTimeSeconds().toFixed(3));
        queueEvents.push({ t: eventTime, action: normalizedActionId });
        queueEvents.sort((a, b) => a.t - b.t);
        updateQueueUi(`${queueEvents.length}\uAC1C \uD050 \uC800\uC7A5`);
      }
      return;
    }

    const config = getPerformerActionConfig(normalizedActionId);
    if (!config || !config.src) {
      return;
    }

    const isWalkInAction = config.id === "walk_in";
    if (performerHiddenAfterWalkOut && !isWalkInAction) {
      if (!silent) {
        updateQueueUi("퇴장 상태입니다. 0-0 Walk In 버튼으로 다시 입장시키세요.");
      }
      return;
    }
    if (isWalkInAction) {
      performerHiddenAfterWalkOut = false;
    }
    if (performerHiddenByManualAction) {
      performerHiddenByManualAction = false;
    }

    if (!chromaVideo || !chromaVideoReady) {
      if (!silent) {
        updateQueueUi("\uD074\uB9BD \uC601\uC0C1\uC744 \uC544\uC9C1 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      }
      return;
    }

    const currentSrc = String(chromaVideo.getAttribute("src") || "");
    if (currentSrc !== config.src) {
      chromaVideo.pause();
      chromaVideo.setAttribute("src", config.src);
      chromaVideo.load();
    }

    const startTime = Math.max(0, Number(config.startTime) || 0);
    chromaVideo.loop = Boolean(config.loop);
    chromaVideo.currentTime = startTime;
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

    if (Number.isFinite(config.freezeAt)) {
      seekAndFreezeChroma(config.freezeAt);
    }

    if (hallMap.performerPlane) {
      hallMap.performerPlane.visible = true;
    }

    if (Number.isFinite(config.holdX)) {
      applyPerformerTransform(config.holdX, config.mirrorX);
    } else {
      applyPerformerTransform(PERFORMER_BASE_POSITION.x, config.mirrorX);
    }

    performerActionRuntime = {
      id: config.id,
      startedAt: performance.now() / 1000,
      moveFromX: config.moveFromX,
      moveToX: config.moveToX,
      moveDuration: config.moveDuration,
      moveCompleted: false,
      endTime: Number.isFinite(config.endTime) ? config.endTime : NaN,
      loop: Boolean(config.loop),
      stopLoopAtMoveEnd: Boolean(config.stopLoopAtMoveEnd),
      mirrorX: Boolean(config.mirrorX)
    };

    setCurrentPerformerAction(config.id, { fromNetwork });

    if (broadcast && socketConnected && isHostClient && socket && !fromNetwork) {
      socket.emit("performer:clip", {
        clipId: config.clipId || 0,
        actionId: config.id,
        songTime: Number(getSongTimeSeconds().toFixed(3)),
        ts: Date.now()
      });
    }

    if (record && queueRecording) {
      if (!showPlaying || !stageVideo || stageVideo.ended) {
        startShow();
      }
      const eventTime = Number(getSongTimeSeconds().toFixed(3));
      queueEvents.push({ t: eventTime, action: config.id });
      queueEvents.sort((a, b) => a.t - b.t);
      updateQueueUi(`${queueEvents.length}\uAC1C \uD050 \uC800\uC7A5`);
    }
  }

  function playPerformerClip(clipId, options = {}) {
    const nextClipId = normalizeClipId(clipId);
    if (!nextClipId) {
      return;
    }
    playPerformerAction(getClipActionId(nextClipId), options);
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
      const actionId = normalizePerformerActionId(event.action || event.clip);
      if (actionId) {
        playPerformerAction(actionId, { record: false });
      }
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
          const action = normalizePerformerActionId(entry?.action || entry?.clip);
          const t = Number(entry?.t ?? entry?.time);
          return { action, t };
        })
        .filter((entry) => Boolean(entry.action) && Number.isFinite(entry.t) && entry.t >= 0)
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
    const normalizedCurrentAction = normalizePerformerActionId(currentPerformerActionId);
    dom.clipButtons.forEach((button) => {
      const clipId = Number(button.dataset.clipId || 0);
      const actionId = getClipActionId(clipId);
      button.classList.toggle("active", actionId !== "" && actionId === normalizedCurrentAction);
      button.disabled = activeMap !== "hall" || !canControl;
    });
    dom.performerActionButtons.forEach((button) => {
      const actionId = normalizePerformerActionId(button.dataset.performerAction || "");
      button.classList.toggle("active", actionId !== "" && actionId === normalizedCurrentAction);
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
    if (!adminUiMode) {
      dom.showStartBtn.classList.add("hidden");
      dom.showStartBtn.disabled = true;
      return;
    }

    dom.showStartBtn.classList.remove("hidden");

    if (socketConnected && !isHostClient) {
      dom.showStartBtn.disabled = true;
      dom.showStartBtn.textContent = "호스트 전용";
      return;
    }

    const hallOnly = activeMap === "hall";
    if (!hallOnly) {
      dom.showStartBtn.disabled = true;
      dom.showStartBtn.textContent = "공연 시작 (공연장 이동 필요)";
      return;
    }

    if (!stageVideoReady) {
      dom.showStartBtn.disabled = true;
      dom.showStartBtn.textContent = "영상 준비 중...";
      return;
    }

    dom.showStartBtn.disabled = false;
    dom.showStartBtn.textContent = showPlaying ? "공연 중지" : "공연 시작";
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
    if (dom.hostSections && dom.hostSections.length) {
      dom.hostSections.forEach((section) => {
        const sectionId = String(section?.id || "");
        const keepVisible = sectionId === "host-section-network" && !isMobile;
        setElementHidden(section, hideOptionalUi && !keepVisible);
      });
    }
    setElementHidden(dom.introStats, hideOptionalUi);
    setElementHidden(dom.controlsTitle, hideOptionalUi);
    setElementHidden(dom.presetGrid, hideOptionalUi);
    setElementHidden(dom.opsStack, hideOptionalUi);
    setElementHidden(dom.clipPanel, hideOptionalUi);
    setElementHidden(dom.chatUi, !chatEnabled);
    setElementHidden(dom.networkPanelToggleBtn, false);

    if (hideOptionalUi) {
      setNetworkPanelExpanded(false);
      setElementHidden(dom.networkPanel, true);
    } else {
      setNetworkPanelExpanded(networkPanelExpanded);
    }

    setElementHidden(dom.hudWrap, true);
    setElementHidden(dom.hudUiWrap, true);
    setElementHidden(dom.hudSeatsChip, true);
    setElementHidden(dom.hudPlayersRow, true);
    setElementHidden(dom.statCapacityCard, true);
    setElementHidden(dom.portalActionBtn, true);
    setElementHidden(dom.portalPhaseNote, true);

    activeAudience = CAPACITY;
    if (dom.statSeats) {
      dom.statSeats.textContent = hideOptionalUi ? "" : String(activeAudience);
    }

    updateFxButtons();
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
    enterHallFromCorridor();
  }

  function applyCameraCollision() {
    if (activeMap === "lobby") {
      if (enterExternalPortal()) {
        return;
      }
      if (firstPersonEnabled) {
        resolveLobbyHorizontalPosition(camera.position);
        // Keep lobby corridor and hall traversal seamless for walkers.
        enterHallFromCorridor();
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
      enterLobbyFromHallCorridor();
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

    const lightsActive = fxLightsEnabled;
    hallMap.stageWash.intensity = lightsActive ? 1.8 : 0.18;

    hallMap.movingLights.forEach((entry, index) => {
      entry.target.position.x = Math.sin(time * entry.speedX + entry.offset) * 18;
      entry.target.position.z = -58 + Math.cos(time * entry.speedZ + entry.offset + index * 0.3) * 12;
      entry.beam.lookAt(entry.target.position);
      entry.light.intensity = lightsActive ? entry.baseIntensity * mode.lightBoost : 0.02;
      entry.beam.material.opacity = lightsActive ? 0.08 + mode.screenPulse * 0.12 : 0.02;
    });

    updateShowFlashes(mode, time, delta, lightsActive);
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

  function updateShowFlashes(mode, time, delta, lightsActive) {
    if (!hallMap.strobeLight) return;

    if (!lightsActive || !showPlaying || activeMap !== "hall") {
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
    if (canBurst && pendingFireworkBursts > 0) {
      const burstCount = pendingFireworkBursts;
      pendingFireworkBursts = 0;
      for (let i = 0; i < burstCount; i += 1) {
        spawnFireworkBurst(fx, mode);
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
    const burstCount = Math.max(28, Math.round(fx.baseBurst * mode.fireworkBurstScale));

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
  snapToLobbyPortalSpawn();
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
    const nowSeconds = performance.now() / 1000;
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
      hallMap.particles.visible = fxParticlesEnabled;
    }
    updateDoorVisuals();
    updateRemotePlayers(elapsed, delta);
    processQueuePlayback();
    updatePerformerRuntime(nowSeconds);
    monitorStageVideoPlayback();

    if (firstPersonEnabled) {
      updateFirstPersonMovement(delta);
      applyFirstPersonViewRotation();
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
      applyFirstPersonViewRotation();
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

  function applyFirstPersonViewRotation() {
    // Clear residual roll from orbit camera to avoid upside-down first-person view.
    camera.rotation.set(playerPitch, playerYaw, 0, "YXZ");
    camera.up.set(0, 1, 0);
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
      dom.fpsToggleBtn.classList.toggle("hidden", !adminUiMode || !isHostClient);
    }

    if (dom.hostDoorBtn) {
      dom.hostDoorBtn.classList.toggle("hidden", !adminUiMode || !isHostClient);
      dom.hostDoorBtn.disabled = !adminUiMode || !isHostClient;
      if (!isHostClient) {
        dom.hostDoorBtn.textContent = "\uD638\uC2A4\uD2B8 \uC804\uC6A9";
      } else {
        dom.hostDoorBtn.textContent = doorOpen ? "\uD638\uC2A4\uD2B8 \uBB38 \uB2EB\uAE30" : "\uD638\uC2A4\uD2B8 \uBB38 \uC5F4\uAE30";
      }
    }

    updateShowStartButton();
    updateDoorUi();
    updateFxButtons();
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
    const entryIsHost = Boolean(entry.isHost);
    const remoteEyeHeight = PLAYER_EYE_HEIGHT[remoteMap] || 2.2;
    const groundY = getGroundHeightAt(entryX, entryZ, remoteMap);
    const footY = Number.isFinite(entryY)
      ? Math.max(groundY, entryY - remoteEyeHeight)
      : groundY;

    let remote = remotePlayers.get(entry.id);
    if (!remote) {
      const avatar = createPlayerAvatar(entry.name, entryIsHost);
      avatar.position.set(entryX, footY, entryZ);
      avatar.rotation.y = Number(entry.yaw) || 0;
      playerLayer.add(avatar);

      remote = {
        id: entry.id,
        map: remoteMap,
        isHost: entryIsHost,
        mesh: avatar,
        targetPos: new THREE.Vector3(entryX, footY, entryZ),
        targetYaw: Number(entry.yaw) || 0,
        inActiveMap: false
      };

      remotePlayers.set(entry.id, remote);
    }

    remote.map = remoteMap;
    remote.isHost = entryIsHost;
    remote.targetPos.set(entryX, footY, entryZ);
    remote.targetYaw = Number(entry.yaw) || 0;
    updateRemoteAvatarBadge(remote.mesh, entry.name, entryIsHost);
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
    if (showState && Object.prototype.hasOwnProperty.call(showState, "serverNow")) {
      syncServerClockOffset(showState.serverNow);
    }
    const nextPlaying = Boolean(showState && showState.playing);
    const startedAt = Number((showState && showState.startedAt) || 0);
    const activeClipId = normalizeClipId(showState && showState.activeClip);
    const activeActionId = normalizePerformerActionId((showState && showState.activeAction) || getClipActionId(activeClipId));
    const showChanged = lastNetworkShowPlaying !== nextPlaying;
    const actionChanged = Boolean(activeActionId) && activeActionId !== lastNetworkActiveActionId;
    const clipChanged = activeClipId > 0 && activeClipId !== lastNetworkActiveClipId;
    let showStopped = false;

    if (startedAt > 0) {
      lastNetworkShowStartedAtMs = startedAt;
    }

    if (activeActionId) {
      lastNetworkActiveActionId = activeActionId;
      const actionClipId = clipIdFromActionId(activeActionId);
      lastNetworkActiveClipId = actionClipId || activeClipId;
    } else if (activeClipId > 0) {
      lastNetworkActiveClipId = activeClipId;
      lastNetworkActiveActionId = getClipActionId(activeClipId);
    }

    if (!force && !showChanged && !clipChanged && !actionChanged) {
      return;
    }

    if (!nextPlaying && showChanged) {
      stopShowLocal({ broadcast: false });
      showStopped = true;
      if (showChanged) {
        updateQueueUi("\uD638\uC2A4\uD2B8\uAC00 \uACF5\uC5F0\uC744 \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4.");
      }
    }

    if (!showChanged && !force && nextPlaying && (clipChanged || actionChanged)) {
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

    if (activeActionId) {
      if (activeMap === "hall") {
        const actionClipId = clipIdFromActionId(activeActionId);
        if (actionClipId) {
          playPerformerClip(actionClipId, {
            record: false,
            broadcast: false,
            fromNetwork: true,
            silent: true
          });
        } else {
          playPerformerAction(activeActionId, {
            record: false,
            broadcast: false,
            fromNetwork: true,
            silent: true
          });
        }
      } else {
        setCurrentPerformerAction(activeActionId, { fromNetwork: true });
      }
      return;
    }

    if ((showChanged || force) && !showStopped) {
      stopShowLocal({ broadcast: false });
    }
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
      syncServerClockOffset(payload && payload.serverNow);
      selfSocketId = payload && payload.selfId ? payload.selfId : socket.id;
      setHostRole(payload && payload.hostId ? payload.hostId : null);
      applyRoomSnapshot(payload);
      if (payload && payload.showState) {
        applyShowStateFromNetwork(payload.showState, true);
      }
      if (payload && Object.prototype.hasOwnProperty.call(payload, "doorOpen")) {
        applyDoorStateFromNetwork(payload.doorOpen);
      }
      if (payload && payload.fxState) {
        applyFxState(payload.fxState, { broadcast: false, fromNetwork: true });
      }
      if (payload && payload.lobbyPoster) {
        applyLobbyPosterFromPayload(payload.lobbyPoster);
      }
      const joinedRoomId = payload && payload.roomId ? payload.roomId : networkRoomId;
      const hostAssigned = payload && payload.hostId ? (payload.hostId === selfSocketId ? "내가 호스트" : "호스트 배정됨") : "호스트 없음";
      appendChatLine("시스템", `룸 입장 완료: ${joinedRoomId} | ${hostAssigned}`, "system");
    });

    socket.on("room:snapshot", (payload) => {
      syncServerClockOffset(payload && payload.serverNow);
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
      if (payload && payload.fxState) {
        applyFxState(payload.fxState, { broadcast: false, fromNetwork: true });
      }
      if (payload && payload.lobbyPoster) {
        applyLobbyPosterFromPayload(payload.lobbyPoster);
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
      const actionId = normalizePerformerActionId((payload && payload.actionId) || (payload && payload.clipId));
      if (!actionId) return;
      const clipId = clipIdFromActionId(actionId);
      lastNetworkActiveActionId = actionId;
      lastNetworkActiveClipId = clipId;
      if (activeMap === "hall") {
        if (clipId) {
          playPerformerClip(clipId, {
            record: false,
            broadcast: false,
            fromNetwork: true,
            silent: true
          });
        } else {
          playPerformerAction(actionId, {
            record: false,
            broadcast: false,
            fromNetwork: true,
            silent: true
          });
        }
      } else {
        setCurrentPerformerAction(actionId, { fromNetwork: true });
      }
    });

    socket.on("door:state", (payload) => {
      if (payload && Object.prototype.hasOwnProperty.call(payload, "open")) {
        applyDoorStateFromNetwork(payload.open);
      }
    });

    socket.on("fx:state", (payload) => {
      if (payload && payload.fxState) {
        applyFxState(payload.fxState, { broadcast: false, fromNetwork: true });
      }
      if (payload && payload.burst) {
        requestFireworkBurst({ broadcast: false, fromNetwork: true });
      }
    });

    socket.on("chat:recv", (payload) => {
      const senderId = String((payload && payload.senderId) || "");
      const senderName = String((payload && payload.senderName) || "\uC775\uBA85");
      const text = String((payload && payload.text) || "");
      const type = senderId === "system" ? "system" : senderId === selfSocketId ? "self" : "remote";
      appendChatLine(senderName, text, type);
      if (senderId && senderId !== "system" && senderId !== selfSocketId) {
        showRemoteChatBubble(senderId, text);
      }
    });

    socket.on("lobby:poster", (payload) => {
      const poster = payload && payload.poster ? payload.poster : payload;
      applyLobbyPosterFromPayload(poster);
    });

    socket.on("room:error", (payload) => {
      const message = String((payload && payload.message) || "\uC54C \uC218 \uC5C6\uB294 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4.");
      appendChatLine("\uC2DC\uC2A4\uD15C", message, "system");
    });
  }

  function drawRoundedRect(ctx, x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function createBillboardTextSprite(initialText, style = {}) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: true
    });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 24;
    sprite.userData.canvas = canvas;
    sprite.userData.context = context;
    sprite.userData.textStyle = {
      fontSize: Number(style.fontSize) || 32,
      fontFamily: String(style.fontFamily || "'Noto Sans KR', 'Malgun Gothic', sans-serif"),
      paddingX: Number(style.paddingX) || 16,
      paddingY: Number(style.paddingY) || 8,
      maxChars: Number(style.maxChars) || 42,
      textColor: String(style.textColor || "#eaf8ff"),
      bgColor: String(style.bgColor || "rgba(9, 19, 38, 0.78)"),
      borderColor: String(style.borderColor || "rgba(136, 214, 255, 0.9)"),
      borderWidth: Number(style.borderWidth) || 1.4,
      radius: Number(style.radius) || 10,
      scale: Number(style.scale) || 0.0088
    };

    updateBillboardTextSprite(sprite, initialText);
    return sprite;
  }

  function updateBillboardTextSprite(sprite, text) {
    if (!sprite || !sprite.userData || !sprite.userData.context || !sprite.userData.canvas) {
      return;
    }
    const style = sprite.userData.textStyle || {};
    const safeText = String(text || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, Math.max(4, Number(style.maxChars) || 42));

    if (!safeText) {
      sprite.visible = false;
      return;
    }

    const fontSize = Number(style.fontSize) || 32;
    const paddingX = Number(style.paddingX) || 16;
    const paddingY = Number(style.paddingY) || 8;
    const fontFamily = String(style.fontFamily || "'Noto Sans KR', 'Malgun Gothic', sans-serif");
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const context = sprite.userData.context;
    const canvas = sprite.userData.canvas;

    context.font = `700 ${fontSize}px ${fontFamily}`;
    const textWidth = Math.ceil(context.measureText(safeText).width);
    const logicalWidth = Math.max(56, textWidth + paddingX * 2);
    const logicalHeight = Math.max(28, fontSize + paddingY * 2);

    canvas.width = Math.ceil(logicalWidth * dpr);
    canvas.height = Math.ceil(logicalHeight * dpr);

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, logicalWidth, logicalHeight);

    drawRoundedRect(context, 0.7, 0.7, logicalWidth - 1.4, logicalHeight - 1.4, Number(style.radius) || 10);
    context.fillStyle = String(style.bgColor || "rgba(9, 19, 38, 0.78)");
    context.fill();
    context.lineWidth = Number(style.borderWidth) || 1.4;
    context.strokeStyle = String(style.borderColor || "rgba(136, 214, 255, 0.9)");
    context.stroke();

    context.font = `700 ${fontSize}px ${fontFamily}`;
    context.fillStyle = String(style.textColor || "#eaf8ff");
    context.textBaseline = "middle";
    context.fillText(safeText, paddingX, logicalHeight * 0.5);

    if (sprite.material && sprite.material.map) {
      sprite.material.map.needsUpdate = true;
    }
    const scale = Number(style.scale) || 0.0088;
    sprite.scale.set(logicalWidth * scale, logicalHeight * scale, 1);
    sprite.visible = true;
  }

  function updateRemoteAvatarBadge(avatar, playerName, isHost) {
    if (!avatar || !avatar.userData) return;
    const roleLabel = isHost ? "호스트" : "게스트";
    const safeName = sanitizePlayerName(playerName) || "플레이어";
    avatar.userData.playerName = safeName;
    avatar.userData.playerRole = roleLabel;
    const badgeText = `${roleLabel} | ${safeName}`;
    updateBillboardTextSprite(avatar.userData.badgeSprite, badgeText);
  }

  function showRemoteChatBubble(playerId, message) {
    const remote = remotePlayers.get(playerId);
    if (!remote || !remote.mesh || !remote.mesh.userData) return;
    const text = sanitizeChatText(message);
    if (!text) return;

    const chatSprite = remote.mesh.userData.chatSprite;
    if (!chatSprite) return;

    updateBillboardTextSprite(chatSprite, text);
    remote.mesh.userData.chatUntil = performance.now() + 4600;
    chatSprite.visible = true;
  }

function createPlayerAvatar(name, isHost) {
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

    const badgeSprite = createBillboardTextSprite(" ", {
      fontSize: 30,
      paddingX: 14,
      paddingY: 8,
      maxChars: 32,
      textColor: "#ecfbff",
      bgColor: "rgba(9, 26, 44, 0.78)",
      borderColor: "rgba(146, 216, 255, 0.92)",
      scale: 0.0082
    });
    badgeSprite.position.set(0, 2.1, 0);

    const chatSprite = createBillboardTextSprite(" ", {
      fontSize: 28,
      paddingX: 12,
      paddingY: 8,
      maxChars: 36,
      textColor: "#fff8e9",
      bgColor: "rgba(30, 12, 5, 0.82)",
      borderColor: "rgba(255, 196, 134, 0.95)",
      scale: 0.0078
    });
    chatSprite.position.set(0, 2.42, 0);
    chatSprite.visible = false;

    avatar.userData.playerName = String(name || "\uC774\uB984 \uC5C6\uC74C");
    avatar.userData.playerRole = isHost ? "호스트" : "게스트";
    avatar.userData.badgeSprite = badgeSprite;
    avatar.userData.chatSprite = chatSprite;
    avatar.userData.chatUntil = 0;
    avatar.add(body, head, badgeSprite, chatSprite);
    updateRemoteAvatarBadge(avatar, name, isHost);
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
    const now = performance.now();
    tempBillboardTarget.set(camera.position.x, 2, camera.position.z);

    remotePlayers.forEach((remote) => {
      remote.inActiveMap = remote.map === activeMap;
      if (!remote.inActiveMap) {
        remote.mesh.visible = false;
        if (remote.mesh.userData.badgeSprite) {
          remote.mesh.userData.badgeSprite.visible = false;
        }
        if (remote.mesh.userData.chatSprite) {
          remote.mesh.userData.chatSprite.visible = false;
        }
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
        if (remote.mesh.userData.badgeSprite) {
          remote.mesh.userData.badgeSprite.visible = false;
        }
        if (remote.mesh.userData.chatSprite) {
          remote.mesh.userData.chatSprite.visible = false;
        }
        return;
      }

      remote.mesh.visible = true;
      const badge = remote.mesh.userData.badgeSprite;
      if (badge) {
        badge.visible = distanceSq <= REMOTE_BADGE_DISTANCE_SQ;
        if (badge.visible) {
          badge.lookAt(tempBillboardTarget);
        }
      }

      const chatSprite = remote.mesh.userData.chatSprite;
      if (chatSprite) {
        const chatActive = Number(remote.mesh.userData.chatUntil) > now;
        chatSprite.visible = chatActive && distanceSq <= REMOTE_BADGE_DISTANCE_SQ;
        if (chatSprite.visible) {
          chatSprite.lookAt(tempBillboardTarget);
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
      const nextName = sanitizePlayerName(dom.networkNameInput.value || "");

      const nextQuery = new URLSearchParams(window.location.search);
      nextQuery.set("host", nextHostMode ? "1" : "0");
      nextQuery.set("room", nextRoomId);
      if (nextName) {
        nextQuery.set("name", nextName);
      } else {
        nextQuery.delete("name");
      }

      persistPlayerName(nextName);
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

    setChatCollapsed(chatCollapsed);
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
      new THREERef.PlaneGeometry(8.4, 14),
      new THREERef.MeshStandardMaterial({ color: 0x121b2e, roughness: 0.84, metalness: 0.12 })
    );
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(0, 0.01, 30);
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

    const posterFrameMaterial = new THREERef.MeshStandardMaterial({ color: 0x1f2f47, roughness: 0.38, metalness: 0.22 });
    const posterMaterial = new THREERef.MeshStandardMaterial({
      color: 0x22374f,
      emissive: 0x101c2a,
      emissiveIntensity: 0.22,
      roughness: 0.42,
      metalness: 0.08
    });
    const posterFrames = [];
    const posterSurfaces = [];

    function addPosterPanel(config) {
      const {
        frameGeometry,
        framePosition,
        surfacePosition,
        surfaceRotationY
      } = config;
      const frame = new THREERef.Mesh(frameGeometry, posterFrameMaterial);
      frame.position.copy(framePosition);
      frame.castShadow = true;
      frame.receiveShadow = true;
      group.add(frame);
      posterFrames.push(frame);

      const surface = new THREERef.Mesh(new THREERef.PlaneGeometry(5.9, 3.28), posterMaterial);
      surface.position.copy(surfacePosition);
      surface.rotation.y = surfaceRotationY;
      group.add(surface);
      posterSurfaces.push(surface);
    }

    addPosterPanel({
      frameGeometry: new THREERef.BoxGeometry(0.16, 3.72, 6.34),
      framePosition: new THREERef.Vector3(13.48, 3.12, 14.0),
      surfacePosition: new THREERef.Vector3(13.37, 3.12, 14.0),
      surfaceRotationY: -Math.PI / 2
    });
    addPosterPanel({
      frameGeometry: new THREERef.BoxGeometry(0.16, 3.72, 6.34),
      framePosition: new THREERef.Vector3(-13.48, 3.12, 14.0),
      surfacePosition: new THREERef.Vector3(-13.37, 3.12, 14.0),
      surfaceRotationY: Math.PI / 2
    });
    addPosterPanel({
      frameGeometry: new THREERef.BoxGeometry(6.34, 3.72, 0.16),
      framePosition: new THREERef.Vector3(0, 3.12, 3.48),
      surfacePosition: new THREERef.Vector3(0, 3.12, 3.59),
      surfaceRotationY: 0
    });
    addPosterPanel({
      frameGeometry: new THREERef.BoxGeometry(0.16, 3.72, 4.6),
      framePosition: new THREERef.Vector3(3.76, 3.12, 30.0),
      surfacePosition: new THREERef.Vector3(3.65, 3.12, 30.0),
      surfaceRotationY: -Math.PI / 2
    });
    addPosterPanel({
      frameGeometry: new THREERef.BoxGeometry(0.16, 3.72, 4.6),
      framePosition: new THREERef.Vector3(-3.76, 3.12, 30.0),
      surfacePosition: new THREERef.Vector3(-3.65, 3.12, 30.0),
      surfaceRotationY: Math.PI / 2
    });

    const corridorWallLeft = new THREERef.Mesh(new THREERef.BoxGeometry(0.75, 8, 14), wallMat);
    corridorWallLeft.position.set(-4.2, 4, 30);
    const corridorWallRight = corridorWallLeft.clone();
    corridorWallRight.position.x = 4.2;
    group.add(corridorWallLeft, corridorWallRight);

    // Fill side voids so lobby front edges don't look cut out when hall is visible.
    const corridorSideFillLeft = new THREERef.Mesh(new THREERef.BoxGeometry(9.8, 8, 14), wallMat);
    corridorSideFillLeft.position.set(-9.1, 4, 30);
    const corridorSideFillRight = corridorSideFillLeft.clone();
    corridorSideFillRight.position.x = 9.1;
    group.add(corridorSideFillLeft, corridorSideFillRight);

    const corridorStrips = [];
    for (let i = 0; i < 6; i += 1) {
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
    portalGroup.position.set(0, 0, 5.6);

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
    return {
      group,
      portalGroup,
      portalRing,
      portalCore,
      portalGlow,
      corridorStrips,
      doorLeft,
      doorRight,
      doorGlow,
      posterFrame: posterFrames[0] || null,
      posterSurface: posterSurfaces[0] || null,
      posterFrames,
      posterSurfaces,
      posterMaterial
    };
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
    const count = mobile ? 520 : 980;
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
      baseBurst: mobile ? 34 : 62,
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
