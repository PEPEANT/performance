(function () {
  const CAPACITY = 50;
  const ROWS = 5;
  const COLS = 10;

  const SHOW_MODES = {
    rehearsal: { crowdBounce: 0.14, screenPulse: 0.1, lightBoost: 0.72 },
    live: { crowdBounce: 0.34, screenPulse: 0.2, lightBoost: 1 },
    finale: { crowdBounce: 0.5, screenPulse: 0.32, lightBoost: 1.34 }
  };

  const QUALITY_MODES = {
    low: { pixelRatio: 1, shadows: false, particles: false },
    medium: { pixelRatio: 1.5, shadows: true, particles: true },
    high: { pixelRatio: 2, shadows: true, particles: true }
  };

  const MAP_META = {
    lobby: {
      label: "LOBBY",
      hint: "확장된 로비에서 호스트 문 상태를 확인하고 공연장으로 입장하세요."
    },
    hall: {
      label: "CONCERT HALL",
      hint: "공연장 입장 완료."
    }
  };

  const query = new URLSearchParams(window.location.search);
  const fromEmptines = String(query.get("from") || "").trim().toLowerCase() === "emptines";
  const hostMode = String(query.get("host") || "1").trim().toLowerCase() !== "0";

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
    hostDoorBtn: document.getElementById("host-door-btn"),
    returnLobbyBtn: document.getElementById("return-lobby-btn"),
    hudMap: document.getElementById("hud-map"),
    hudFps: document.getElementById("hud-fps"),
    hudSeats: document.getElementById("hud-seats"),
    hudQuality: document.getElementById("hud-quality"),
    hudPortal: document.getElementById("hud-portal"),
    hudDrawcalls: document.getElementById("hud-drawcalls")
  };

  if (!dom.canvasRoot || !dom.loading || !window.THREE || !window.THREE.OrbitControls) {
    return;
  }

  const THREE = window.THREE;
  const isMobile =
    /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent || "") ||
    (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches);

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

  const presets = {
    lobby_entry: { map: "lobby", position: new THREE.Vector3(0, 6.6, 14), target: new THREE.Vector3(0, 2.3, 30) },
    lobby_corridor: { map: "lobby", position: new THREE.Vector3(0, 4.8, 27), target: new THREE.Vector3(0, 2.6, 56) },
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

  dom.portalActionBtn.addEventListener("click", () => enterHall());
  if (dom.hostDoorBtn) {
    if (!hostMode) {
      dom.hostDoorBtn.disabled = true;
      dom.hostDoorBtn.textContent = "호스트 전용";
    } else {
      dom.hostDoorBtn.addEventListener("click", () => {
        setDoorOpen(!doorOpen);
      });
    }
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

  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (String(event.key || "").toLowerCase() === "e") enterHall();
    if (hostMode && String(event.key || "").toLowerCase() === "h") {
      setDoorOpen(!doorOpen);
    }
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

  setDoorOpen(true);

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
    if (dom.hostDoorBtn && hostMode) {
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
    // Keep both spaces in one continuous world; map state drives UI and camera context.
    lobbyMap.group.visible = true;
    hallMap.group.visible = true;
    hallMap.seatingGroup.visible = activeMap === "hall";
    scene.fog.density = activeMap === "hall" ? 0.014 : 0.02;
    controls.maxDistance = activeMap === "hall" ? 95 : 40;

    const defaultPreset = activeMap === "hall" ? "hall_wide" : "lobby_entry";
    applyPreset(defaultPreset, immediate);
    updateUiByMap();
    updateHud();
  }

  function applyPreset(name, immediate) {
    const preset = presets[name];
    if (!preset || preset.map !== activeMap) return;

    if (immediate) {
      camera.position.copy(preset.position);
      controls.target.copy(preset.target);
      controls.update();
      activePreset = name;
      updatePresetButtons();
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
    dom.returnLobbyBtn.textContent = activeMap === "hall" ? "로비로 돌아가기" : "EMPTINES로 복귀";

    const hallOnly = activeMap === "hall";
    dom.modeButtons.forEach((button) => {
      button.disabled = !hallOnly;
    });
    dom.occupancyRange.disabled = !hallOnly;

    updatePresetButtons();
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

  function updateHud() {
    dom.hudMap.textContent = MAP_META[activeMap].label;
    dom.hudFps.textContent = String(fpsValue);
    dom.hudSeats.textContent = `${activeAudience} / ${CAPACITY}`;
    dom.hudQuality.textContent = qualityMode.toUpperCase();
    dom.hudPortal.textContent = doorOpen ? "OPEN" : "CLOSED";
    dom.hudDrawcalls.textContent = String(renderer.info.render.calls || 0);
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

  function animateHall(time) {
    const mode = SHOW_MODES[showMode] || SHOW_MODES.live;
    const hue = (time * 0.045 + 0.55) % 1;
    const pulse = 0.5 + Math.sin(time * 2.4) * mode.screenPulse;

    hallMap.screenMat.emissive.setHSL(hue, 0.84, Math.max(0.25, pulse));
    hallMap.screenMat.color.setHSL(hue, 0.76, 0.48);
    hallMap.edgeMat.emissiveIntensity = 0.42 + Math.sin(time * 3.8) * (0.12 + mode.screenPulse * 0.42);

    hallMap.movingLights.forEach((entry, index) => {
      entry.target.position.x = Math.sin(time * entry.speedX + entry.offset) * 18;
      entry.target.position.z = -58 + Math.cos(time * entry.speedZ + entry.offset + index * 0.3) * 12;
      entry.beam.lookAt(entry.target.position);
      entry.light.intensity = entry.baseIntensity * mode.lightBoost;
      entry.beam.material.opacity = 0.08 + mode.screenPulse * 0.12;
    });

    hallMap.audience.forEach((fan, index) => {
      const visible = index < activeAudience;
      fan.mesh.visible = visible;
      if (!visible) return;
      fan.mesh.position.y = fan.baseY + Math.abs(Math.sin(time * fan.speed + fan.offset)) * mode.crowdBounce;
      fan.mesh.material.emissiveIntensity = 0.44 + Math.sin(time * 2.1 + index * 0.14) * 0.18;
    });

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
      }
    }

    if (activeMap === "lobby") {
      animateLobby(elapsed);
      hallMap.particles.visible = false;
    } else {
      animateHall(elapsed);
      hallMap.particles.visible = QUALITY_MODES[qualityMode].particles;
    }
    updateDoorVisuals();

    controls.update();
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
      new THREERef.PlaneGeometry(9.2, 36),
      new THREERef.MeshStandardMaterial({ color: 0x121b2e, roughness: 0.84, metalness: 0.12 })
    );
    corridorFloor.rotation.x = -Math.PI / 2;
    corridorFloor.position.set(0, 0.01, 41);
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

    const corridorWallLeft = new THREERef.Mesh(new THREERef.BoxGeometry(0.65, 8, 36), wallMat);
    corridorWallLeft.position.set(-4.6, 4, 41);
    const corridorWallRight = corridorWallLeft.clone();
    corridorWallRight.position.x = 4.6;
    group.add(corridorWallLeft, corridorWallRight);

    const corridorStrips = [];
    for (let i = 0; i < 16; i += 1) {
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
      strip.position.set(0, 0.02, 24.2 + i * 2.2);
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
    portalGroup.position.set(0, 0, 56.2);

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

    const screenMat = new THREERef.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.4 });
    const screen = new THREERef.Mesh(new THREERef.PlaneGeometry(stageWidth, 18), screenMat);
    screen.position.set(0, stageHeight + 9, -72);
    group.add(screen);

    const seatTemplate = buildSeatTemplate(THREERef);
    const facingTarget = new THREERef.Vector3(0, 1.1, -58);
    const audience = [];

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

        const glowColor = row % 2 === 0 ? 0xff4e82 : 0x4ec8ff;
        const fan = new THREERef.Mesh(
          new THREERef.SphereGeometry(0.23, 9, 9),
          new THREERef.MeshStandardMaterial({ color: glowColor, emissive: glowColor, emissiveIntensity: 0.62 })
        );
        fan.position.set(x, 2.2, z + 0.08);
        seatingGroup.add(fan);

        audience.push({ mesh: fan, baseY: 2.04 + Math.random() * 0.24, speed: 1.8 + Math.random() * 1.4, offset: Math.random() * Math.PI * 2 });
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
    return { group, seatingGroup, stageWash, movingLights, audience, particles, particleCount, particleVelocities, screenMat, edgeMat };
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
