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
  const query = new URLSearchParams(window.location.search);
  const fromEmptines = String(query.get("from") || "").trim().toLowerCase() === "emptines";
  let hostMode = String(query.get("host") || "1").trim().toLowerCase() !== "0";
  let networkRoomId = String(query.get("room") || "main")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 32) || "main";
  let requestedPlayerName = String(query.get("name") || "").trim();

  const dom = {
    canvasRoot: document.getElementById("canvas-root"),
    loading: document.getElementById("loading"),
    statusIntent: document.getElementById("status-intent"),
    statCapacity: document.getElementById("stat-capacity"),
    statLayout: document.getElementById("stat-layout"),
    statSeats: document.getElementById("stat-seats"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    modeButtons: Array.from(document.querySelectorAll("[data-show-mode]")),
    occupancyRange: document.getElementById("occupancy-range"),
    occupancyLabel: document.getElementById("occupancy-label"),
    qualitySelect: document.getElementById("quality-select"),
    portalActionBtn: document.getElementById("portal-action-btn"),
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
    networkRoleSelect: document.getElementById("network-role-select"),
    networkRoomInput: document.getElementById("network-room-input"),
    networkNameInput: document.getElementById("network-name-input"),
    networkApplyBtn: document.getElementById("network-apply-btn"),
    networkNote: document.getElementById("network-note"),
    fpsToggleBtn: document.getElementById("fps-toggle-btn"),
    hudMap: document.getElementById("hud-map"),
    hudFps: document.getElementById("hud-fps"),
    hudSeats: document.getElementById("hud-seats"),
    hudQuality: document.getElementById("hud-quality"),
    hudPortal: document.getElementById("hud-portal"),
    hudDrawcalls: document.getElementById("hud-drawcalls"),
    hudStatus: document.getElementById("hud-status"),
    hudPlayers: document.getElementById("hud-players"),
    hudPosition: document.getElementById("hud-position"),
    hudFpsMini: document.getElementById("hud-fps-mini"),
    chatUi: document.getElementById("chat-ui"),
    chatLog: document.getElementById("chat-log"),
    chatInput: document.getElementById("chat-input"),
    chatSend: document.getElementById("chat-send"),
    chatToggle: document.getElementById("chat-toggle")
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
    run: false
  };
  const remotePlayers = new Map();
  const cameraDirectionTemp = new THREE.Vector3();
  let socket = null;
  let socketConnected = false;
  let selfSocketId = null;
  let roomHostId = null;
  let isHostClient = hostMode;
  let roomPopulation = 1;
  let stateSendAccumulator = 0;
  let pendingShowStartFromHost = false;
  let lastNetworkShowPlaying = null;
  let clientDisplayName = requestedPlayerName || ("player-" + Math.floor(Math.random() * 9000 + 1000));

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
    if (fromEmptines) {
      window.location.assign("/?zone=lobby&from=performance");
    }
  });
  if (dom.fpsToggleBtn) {
    dom.fpsToggleBtn.addEventListener("click", () => {
      toggleFirstPerson();
    });
  }

  window.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    setMovementKeyState(key, true);

    const tag = String(event.target?.tagName || "").toLowerCase();
    const typing = tag === "input" || tag === "select" || tag === "textarea";
    if (typing) return;

    if (key === "f" && isHostClient) {
      event.preventDefault();
      toggleFirstPerson();
      return;
    }

    if (event.repeat) return;

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
    setMovementKeyState(key, false);
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

  dom.occupancyRange.addEventListener("input", () => {
    activeAudience = Math.max(0, Math.min(CAPACITY, Number(dom.occupancyRange.value) || 0));
    dom.occupancyLabel.textContent = `${activeAudience} / ${CAPACITY}`;
    dom.statSeats.textContent = String(activeAudience);
  });

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
        updateQueueUi("호스트 전용 기능입니다.");
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

  setupNetworkProfileUi();
  setupShowMedia();
  setupPlayerSystem();
  setupFirstPersonControls();
  setupChatUi();
  setupRealtime();
  loadQueueFromStorage(true);
  setDoorOpen(true);
  updateQueueUi();

  function enterHall() {
    if (activeMap !== "lobby" || transitionInFlight) return;
    if (!doorOpen) {
      dom.loading.textContent = "문이 닫혀 있습니다. 호스트가 문을 열어야 입장할 수 있습니다.";
      dom.loading.classList.remove("hidden");
      setTimeout(() => {
        if (!transitionInFlight) {
          dom.loading.classList.add("hidden");
          dom.loading.textContent = "로비 구성 중...";
        }
      }, 900);
      return;
    }
    transitionInFlight = true;
    dom.loading.textContent = "포탈 통과 중...";
    dom.loading.classList.remove("hidden");
    setTimeout(() => {
      setMap("hall", true);
      setTimeout(() => {
        dom.loading.classList.add("hidden");
        dom.loading.textContent = "로비 구성 중...";
        transitionInFlight = false;
      }, 220);
    }, 420);
  }

  function setDoorOpen(nextOpen) {
    doorOpen = Boolean(nextOpen);
    doorTarget = doorOpen ? 1 : 0;
    if (dom.hostDoorBtn && isHostClient) {
      dom.hostDoorBtn.textContent = doorOpen ? "호스트 문 닫기" : "호스트 문 열기";
    }
    updateDoorUi();
    updateHud();
  }

  function updateDoorUi() {
    if (!dom.portalActionBtn) return;
    const inLobby = activeMap === "lobby";
    const canEnter = inLobby && doorOpen;
    dom.portalActionBtn.disabled = !canEnter;
    dom.portalActionBtn.textContent = canEnter ? "공연장 입장 (E)" : "문 닫힘 - 호스트 대기";
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
      camera.position.y = PLAYER_EYE_HEIGHT[activeMap];
      syncOrbitTargetToCamera();
    }

    if (activeMap === "hall" && pendingShowStartFromHost && showPlaying) {
      startShow({ broadcast: false, allowNonHost: true });
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
    if (dom.statusIntent) dom.statusIntent.textContent = MAP_META[activeMap].hint;
    dom.portalActionBtn.classList.toggle("hidden", activeMap !== "lobby");
    updateDoorUi();
    const showReturn = activeMap === "hall" || fromEmptines;
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
          startShow({ broadcast: false, allowNonHost: true });
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
      updateQueueUi(`배경 영상 로드 실패: ${bgSrc}`);
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

    chroma.addEventListener("error", () => {
      chromaVideoReady = false;
      const failedClipPath = String(chroma.getAttribute("src") || CLIP_VIDEO_PATHS[DEFAULT_CLIP_ID]);
      updateQueueUi(`퍼포머 클립 로드 실패: ${failedClipPath}`);
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

  function startShow(options = {}) {
    const { broadcast = true, allowNonHost = false } = options;

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
    stageVideo.currentTime = 0;
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

    if (broadcast && socketConnected && isHostClient && socket) {
      socket.emit("show:start");
    }
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

  function playPerformerClip(clipId, options = {}) {
    const { record = true } = options;
    if (activeMap !== "hall") {
      updateQueueUi("\uACF5\uC5F0\uC7A5 \uC548\uC5D0\uC11C\uB9CC \uB3D9\uC791\uD569\uB2C8\uB2E4.");
      return;
    }
    if (!canControlShowOps()) {
      updateQueueUi("호스트 전용 기능입니다.");
      return;
    }
    if (!Number.isInteger(clipId) || clipId < 1 || clipId > CLIP_IDS.length) {
      return;
    }
    if (!chromaVideo || !chromaVideoReady) {
      updateQueueUi("\uD074\uB9BD \uC601\uC0C1\uC744 \uC544\uC9C1 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.");
      return;
    }

    const nextSrc = CLIP_VIDEO_PATHS[clipId];
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

    currentClipId = clipId;
    updateClipButtons();

    if (record && queueRecording) {
      if (!showPlaying || !stageVideo || stageVideo.ended) {
        startShow();
      }
      const eventTime = Number(getSongTimeSeconds().toFixed(3));
      queueEvents.push({ t: eventTime, clip: clipId });
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
      updateQueueUi("호스트 전용 기능입니다.");
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
      updateQueueUi("호스트 전용 기능입니다.");
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
      updateQueueUi("호스트 전용 기능입니다.");
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
      updateQueueUi("호스트 전용 기능입니다.");
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
    dom.hudSeats.textContent = `${activeAudience} / ${CAPACITY}`;
    dom.hudQuality.textContent = ({ low: "\uB0AE\uC74C", medium: "\uBCF4\uD1B5", high: "\uB192\uC74C" })[qualityMode] || "\uBCF4\uD1B5";
    dom.hudPortal.textContent = doorOpen ? "\uC5F4\uB9BC" : "\uB2EB\uD798";
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

  function clampLobbyPoint(point) {
    point.z = clampNumber(point.z, 3.2, 45.2);
    const halfWidth = point.z > 23 ? 3.55 : 13.2;
    point.x = clampNumber(point.x, -halfWidth, halfWidth);
  }

  function applyCameraCollision() {
    if (activeMap === "lobby") {
      clampLobbyPoint(camera.position);
      if (firstPersonEnabled) {
        camera.position.y = PLAYER_EYE_HEIGHT.lobby;
        return;
      }
      clampLobbyPoint(controls.target);
      camera.position.y = clampNumber(camera.position.y, 1.6, 16);
      controls.target.y = clampNumber(controls.target.y, 1.2, 7.5);
      return;
    }

    camera.position.x = clampNumber(camera.position.x, -44, 44);
    camera.position.z = clampNumber(camera.position.z, 38, 160);
    if (firstPersonEnabled) {
      camera.position.y = PLAYER_EYE_HEIGHT.hall;
      return;
    }
    camera.position.y = clampNumber(camera.position.y, 2, 32);
    controls.target.x = clampNumber(controls.target.x, -42, 42);
    controls.target.z = clampNumber(controls.target.z, 44, 158);
    controls.target.y = clampNumber(controls.target.y, 1.2, 18);
  }

  function animateLobby(time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    lobbyMap.portalRing.material.emissiveIntensity = 0.74 + pulse * 0.56;
    lobbyMap.portalCore.material.opacity = 0.18 + pulse * 0.22;
    lobbyMap.portalGlow.material.opacity = 0.26 + pulse * 0.32;
    lobbyMap.portalGroup.scale.setScalar(1 + pulse * 0.03);

    lobbyMap.corridorStrips.forEach((strip, index) => {
      strip.material.emissiveIntensity = 0.18 + Math.sin(time * 2.2 + index * 0.4) * 0.14;
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
      camera.position.y = PLAYER_EYE_HEIGHT[activeMap];
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

function setMovementKeyState(key, pressed) {
    if (key === "w" || key === "arrowup") moveState.forward = pressed;
    if (key === "s" || key === "arrowdown") moveState.backward = pressed;
    if (key === "a" || key === "arrowleft") moveState.left = pressed;
    if (key === "d" || key === "arrowright") moveState.right = pressed;
    if (key === "shift") moveState.run = pressed;
  }

  function updateFirstPersonMovement(delta) {
    if (!firstPersonEnabled) {
      return;
    }

    const forwardIntent = (moveState.forward ? 1 : 0) - (moveState.backward ? 1 : 0);
    const strafeIntent = (moveState.right ? 1 : 0) - (moveState.left ? 1 : 0);
    if (forwardIntent === 0 && strafeIntent === 0) {
      return;
    }

    const speed = PLAYER_MOVE_SPEED * (moveState.run ? PLAYER_RUN_MULTIPLIER : 1);
    const forward = new THREE.Vector3(-Math.sin(playerYaw), 0, -Math.cos(playerYaw));
    const right = new THREE.Vector3(Math.cos(playerYaw), 0, -Math.sin(playerYaw));
    const movement = new THREE.Vector3();
    movement.addScaledVector(forward, forwardIntent);
    movement.addScaledVector(right, strafeIntent);

    if (movement.lengthSq() > 0.0001) {
      movement.normalize().multiplyScalar(speed * delta);
      camera.position.add(movement);
    }
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

    return {
      x: camera.position.x,
      y: camera.position.y,
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
    let remote = remotePlayers.get(entry.id);
    if (!remote) {
      const avatar = createPlayerAvatar(entry.name);
      avatar.position.set(Number(entry.x) || 0, 0, Number(entry.z) || 0);
      avatar.rotation.y = Number(entry.yaw) || 0;
      playerLayer.add(avatar);

      remote = {
        id: entry.id,
        map: entry.map === "hall" ? "hall" : "lobby",
        mesh: avatar,
        targetPos: new THREE.Vector3(Number(entry.x) || 0, 0, Number(entry.z) || 0),
        targetYaw: Number(entry.yaw) || 0,
        inActiveMap: false
      };

      remotePlayers.set(entry.id, remote);
    }

    remote.map = entry.map === "hall" ? "hall" : "lobby";
    remote.targetPos.set(Number(entry.x) || 0, 0, Number(entry.z) || 0);
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
    if (!force && lastNetworkShowPlaying === nextPlaying) {
      return;
    }

    lastNetworkShowPlaying = nextPlaying;

    if (nextPlaying) {
      showPlaying = true;
      if (activeMap === "hall" && stageVideoReady) {
        startShow({ broadcast: false, allowNonHost: true });
      } else {
        pendingShowStartFromHost = true;
        updateQueueUi("\uD638\uC2A4\uD2B8\uAC00 \uACF5\uC5F0\uC744 \uC2DC\uC791\uD588\uC2B5\uB2C8\uB2E4.");
        updateShowStartButton();
      }
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
    });

    socket.on("disconnect", () => {
      socketConnected = false;
      roomHostId = null;
      isHostClient = hostMode;
      clearRemotePlayers();
      appendChatLine("\uC2DC\uC2A4\uD15C", "\uC11C\uBC84 \uC5F0\uACB0\uC774 \uB04A\uACBC\uC2B5\uB2C8\uB2E4. \uC7AC\uC5F0\uACB0 \uC911\uC785\uB2C8\uB2E4.", "system");
      updateShowStartButton();
      updateHud();
    });

    socket.on("room:joined", (payload) => {
      selfSocketId = payload && payload.selfId ? payload.selfId : socket.id;
      setHostRole(payload && payload.hostId ? payload.hostId : null);
      applyRoomSnapshot(payload);
      if (payload && payload.showState) {
        applyShowStateFromNetwork(payload.showState, true);
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
      applyShowStateFromNetwork(payload, true);
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

    avatar.userData.playerName = String(name || "플레이어");
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

    if (dom.networkNote) {
      dom.networkNote.textContent = `현재 설정: ${hostMode ? "호스트" : "플레이어"} | 룸 ${networkRoomId}`;
    }

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
    if (!dom.chatLog) return;

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

    // 로비의 넓은 면(z=3 경계)에 공연장 연결문 배치
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
    screen.position.set(0, stageHeight + 9, -72);
    group.add(screen);

    const seatTemplate = buildSeatTemplate(THREERef);
    const facingTarget = new THREERef.Vector3(0, 1.1, -58);

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
    return { group, seatingGroup, stageWash, movingLights, particles, particleCount, particleVelocities, fireworks, strobeLight, screenMat, edgeMat, performerMat, performerPlane };
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
})()



















