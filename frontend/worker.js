const REDIRECTS = new Map([
  ["/livebridge", "/"],
  ["/livebridge/", "/"],
  ["/livebridge-signup", "/signup/"],
  ["/livebridge-signup/", "/signup/"],
  ["/lbaccount", "/account/"],
  ["/lbaccount/", "/account/"],
  ["/lbadmin", "/admin/"],
  ["/lbadmin/", "/admin/"],
  ["/livebridge-sunday", "/sunday/"],
  ["/livebridge-sunday/", "/sunday/"],
  ["/translate", "/t/"],
  ["/translate/", "/t/"],
  ["/translate1", "/t/"],
  ["/translate1/", "/t/"],
  ["/translation1", "/t/"],
  ["/translation1/", "/t/"],
  ["/livebridge-privacy", "/privacy/"],
  ["/livebridge-privacy/", "/privacy/"],
  ["/livebridge-terms", "/terms/"],
  ["/livebridge-terms/", "/terms/"],

  [
    "/employee",
    "https://livebridge-promoter-frontend-test.northstarventures-ca.workers.dev/promoter/index.html"
  ],
  [
    "/employee/",
    "https://livebridge-promoter-frontend-test.northstarventures-ca.workers.dev/promoter/index.html"
  ],
]);


const REALTIME_TEST_LISTENER_PATCH = `<script>
(() => {
  if (
    !window.location.pathname.startsWith("/realtime-test/") ||
    WebSocket.prototype.__lbRealtimeChatModeration
  ) {
    return;
  }

  WebSocket.prototype.__lbRealtimeChatModeration = true;

  const originalSend =
    WebSocket.prototype.send;

  const blockedWords = [
    "fuck","fucking","fucker","fucked","motherfucker",
    "shit","shitty","bullshit",
    "bitch","bitches","bastard",
    "asshole","dick","dicks","cock","cocks",
    "pussy","cunt","slut","whore",
    "damn","goddamn"
  ];

  function containsLink(value) {
    return /(?:https?:\\/\\/|www\\.|(?:^|\\s)[a-z0-9-]+\\.(?:com|ca|org|net|io|co|me|app|dev|info|biz|tv)(?:\\b|\\/))/i.test(
      String(value || "")
    );
  }

  function filterProfanity(value) {
    let filtered =
      String(value || "");

    blockedWords.forEach(word => {
      filtered =
        filtered.replace(
          new RegExp(
            "\\\\b" +
            word +
            "\\\\b",
            "gi"
          ),
          match =>
            "*".repeat(
              Math.max(
                3,
                match.length
              )
            )
        );
    });

    return filtered;
  }

  WebSocket.prototype.send =
    function(data) {
      if (
        typeof data === "string"
      ) {
        try {
          const payload =
            JSON.parse(data);

          if (
            payload?.type ===
              "chat"
          ) {
            const text =
              String(
                payload.text || ""
              );

            if (
              containsLink(text)
            ) {
              alert(
                "Links are disabled in LiveBridge chat."
              );
              return;
            }

            payload.text =
              filterProfanity(
                text
              );

            data =
              JSON.stringify(
                payload
              );
          }
        } catch {}
      }

      return originalSend.call(
        this,
        data
      );
    };
})();
<\\/script>`;

const REALTIME_TEST_ADMIN_PATCH = `<script>
(() => {
  if (
    !window.location.pathname.startsWith("/realtime-test/") ||
    window.__lbRealtimeAdminRoomPatch
  ) {
    return;
  }

  window.__lbRealtimeAdminRoomPatch =
    true;

  async function syncFullActiveRooms() {
    try {
      if (
        typeof adminFetch !==
          "function" ||
        typeof adminOrganizations ===
          "undefined"
      ) {
        return;
      }

      const response =
        await adminFetch(
          "/admin/live-broadcasts"
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        return;
      }

      const activeRooms =
        (
          data.broadcasts ||
          []
        )
        .map(item =>
          String(
            item.room || ""
          )
          .trim()
          .toUpperCase()
        )
        .filter(Boolean);

      for (
        const organization of
        adminOrganizations
      ) {
        const baseRooms =
          [
            organization.roomName,
            organization.roomAlias
          ]
          .map(value =>
            String(value || "")
              .trim()
              .toUpperCase()
          )
          .filter(Boolean);

        const matchingRoom =
          activeRooms.find(
            activeRoom =>
              baseRooms.some(
                baseRoom =>
                  activeRoom ===
                    baseRoom ||
                  activeRoom.startsWith(
                    baseRoom +
                    "-"
                  )
              )
          ) || "";

        const dot =
          document.querySelector(
            '[data-live-organization-id="' +
            Number(
              organization.id
            ) +
            '"]'
          );

        const row =
          dot?.closest(
            ".lb-client-row"
          );

        const roomLabel =
          row?.querySelector(
            ".lb-room"
          );

        if (
          roomLabel
        ) {
          roomLabel.textContent =
            matchingRoom ||
            organization.roomName ||
            "";
        }
      }
    } catch (error) {
      console.warn(
        "Realtime-test full room sync failed:",
        error
      );
    }
  }

  setTimeout(
    syncFullActiveRooms,
    700
  );

  setInterval(
    syncFullActiveRooms,
    5000
  );
})();
<\\/script>`;

const REALTIME_TEST_BROADCASTER_PATCH = `<script>
(() => {
  if (
    !window.location.pathname.startsWith("/realtime-test/") ||
    window.__lbRealtimeMicPanelPatch
  ) {
    return;
  }

  window.__lbRealtimeMicPanelPatch =
    true;

  function ensurePanel() {
    if (
      document.getElementById(
        "lbMicQualityPanel"
      )
    ) {
      return true;
    }

    const diagnostic =
      document.getElementById(
        "audioCaptureDiagnostic"
      );

    if (!diagnostic) {
      return false;
    }

    const panel =
      document.createElement(
        "div"
      );

    panel.id =
      "lbMicQualityPanel";

    panel.style.cssText =
      "margin-bottom:14px;padding:10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(6,17,31,.55)";

    panel.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px;">' +
        '<span style="font-size:10px;font-weight:800;color:#b9c9da;">INPUT LEVEL</span>' +
        '<span id="lbMicPeakDb" style="font-size:10px;color:#8fa5bc;">— dB</span>' +
      '</div>' +
      '<div style="height:8px;border-radius:999px;background:#16283d;overflow:hidden;">' +
        '<div id="lbMicPeakBar" style="height:100%;width:0%;border-radius:999px;background:#39d98a;transition:width .12s linear,background .12s linear;"></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:7px;margin-top:8px;">' +
        '<span id="lbMicQualityDot" style="width:8px;height:8px;border-radius:50%;background:#62758a;box-shadow:0 0 0 3px rgba(98,117,138,.12);flex:0 0 auto;"></span>' +
        '<span id="lbMicQualityText" style="font-size:10px;color:#9fb1c7;">Waiting for broadcast audio</span>' +
      '</div>' +
      '<div id="lbMicInputLevelText" style="margin-top:4px;font-size:10px;color:#9fb1c7;">Input level: Waiting</div>' +
      '<button type="button" id="lbVoiceIsolationButton" style="margin-top:9px;width:100%;padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:#13243a;color:#d9e7f6;font-size:10px;font-weight:800;cursor:pointer;">Voice Isolation: OFF</button>' +
      '<div id="lbVoiceIsolationStatus" style="margin-top:5px;font-size:9px;line-height:1.35;color:#73879d;">Optional gentle browser noise/echo suppression. No hard gate.</div>';

    diagnostic.insertAdjacentElement(
      "afterend",
      panel
    );

    document
      .getElementById(
        "lbVoiceIsolationButton"
      )
      ?.addEventListener(
        "click",
        toggleVoiceIsolation
      );

    return true;
  }

  let voiceIsolationOn =
    false;

  let originalSettings =
    null;

  async function toggleVoiceIsolation() {
    const button =
      document.getElementById(
        "lbVoiceIsolationButton"
      );

    const status =
      document.getElementById(
        "lbVoiceIsolationStatus"
      );

    let track =
      null;

    try {
      if (
        typeof mediaStream !==
          "undefined"
      ) {
        track =
          mediaStream
            ?.getAudioTracks?.()[0] ||
          null;
      }
    } catch {}

    if (
      !track ||
      typeof track.applyConstraints !==
        "function"
    ) {
      if (status) {
        status.textContent =
          "Start broadcasting first, then Voice Isolation can be switched on.";
      }
      return;
    }

    if (
      !originalSettings
    ) {
      originalSettings =
        track.getSettings
          ? track.getSettings()
          : {};
    }

    const next =
      !voiceIsolationOn;

    const constraints =
      next
        ? {
            echoCancellation:true,
            noiseSuppression:true,
            autoGainControl:false
          }
        : {
            echoCancellation:
              typeof originalSettings?.echoCancellation ===
                "boolean"
                ? originalSettings.echoCancellation
                : false,
            noiseSuppression:
              typeof originalSettings?.noiseSuppression ===
                "boolean"
                ? originalSettings.noiseSuppression
                : false,
            autoGainControl:
              typeof originalSettings?.autoGainControl ===
                "boolean"
                ? originalSettings.autoGainControl
                : false
          };

    try {
      await track.applyConstraints(
        constraints
      );

      voiceIsolationOn =
        next;

      if (button) {
        button.textContent =
          "Voice Isolation: " +
          (
            voiceIsolationOn
              ? "ON"
              : "OFF"
          );

        button.style.borderColor =
          voiceIsolationOn
            ? "rgba(57,217,138,.55)"
            : "rgba(255,255,255,.12)";
      }

      if (status) {
        status.textContent =
          voiceIsolationOn
            ? "Gentle browser noise/echo suppression is active. No hard gate is used."
            : "Voice Isolation is off. Original microphone processing restored.";
      }
    } catch (error) {
      if (status) {
        status.textContent =
          "This microphone/browser could not change its audio processing while live.";
      }
    }
  }

  const samples =
    new Uint8Array(
      1024
    );

  function updateMeter() {
    ensurePanel();

    const bar =
      document.getElementById(
        "lbMicPeakBar"
      );

    const dbText =
      document.getElementById(
        "lbMicPeakDb"
      );

    const dot =
      document.getElementById(
        "lbMicQualityDot"
      );

    const quality =
      document.getElementById(
        "lbMicQualityText"
      );

    const level =
      document.getElementById(
        "lbMicInputLevelText"
      );

    if (
      !bar ||
      !dbText ||
      !dot ||
      !quality ||
      !level
    ) {
      return;
    }

    let analyser =
      null;

    try {
      if (
        typeof audioSafetyAnalyser !==
          "undefined"
      ) {
        analyser =
          audioSafetyAnalyser;
      }
    } catch {}

    if (!analyser) {
      bar.style.width =
        "0%";
      dbText.textContent =
        "— dB";
      dot.style.background =
        "#62758a";
      quality.textContent =
        "Waiting for broadcast audio";
      level.textContent =
        "Input level: Waiting";
      return;
    }

    if (
      samples.length !==
        analyser.fftSize
    ) {
      return;
    }

    analyser.getByteTimeDomainData(
      samples
    );

    let peak =
      0;

    let sumSquares =
      0;

    for (
      let i = 0;
      i < samples.length;
      i++
    ) {
      const normalized =
        (
          samples[i] -
          128
        ) /
        128;

      const absolute =
        Math.abs(
          normalized
        );

      peak =
        Math.max(
          peak,
          absolute
        );

      sumSquares +=
        normalized *
        normalized;
    }

    const rms =
      Math.sqrt(
        sumSquares /
        samples.length
      );

    const db =
      peak > 0
        ? 20 *
          Math.log10(
            peak
          )
        : -60;

    const percent =
      Math.max(
        0,
        Math.min(
          100,
          (
            db + 60
          ) /
          60 *
          100
        )
      );

    bar.style.width =
      percent.toFixed(1) +
      "%";

    dbText.textContent =
      (
        peak > 0
          ? db.toFixed(1)
          : "—"
      ) +
      " dB";

    const crest =
      rms > 0.0001
        ? peak / rms
        : 0;

    if (
      peak >= 0.985
    ) {
      bar.style.background =
        "#ff4d5e";
      dot.style.background =
        "#ff4d5e";
      quality.textContent =
        "Input too loud — reduce gain";
      level.textContent =
        "Input level: Too loud";
    } else if (
      rms >= 0.012 &&
      crest < 1.65
    ) {
      bar.style.background =
        "#ffb547";
      dot.style.background =
        "#ffb547";
      quality.textContent =
        "Background noise may be high";
      level.textContent =
        "Input level: Check noise";
    } else if (
      rms >= 0.012
    ) {
      bar.style.background =
        "#39d98a";
      dot.style.background =
        "#39d98a";
      quality.textContent =
        "Clean Voice";
      level.textContent =
        "Input level: Good";
    } else {
      bar.style.background =
        "#39d98a";
      dot.style.background =
        "#62758a";
      quality.textContent =
        "Waiting for voice";
      level.textContent =
        "Input level: Quiet";
    }
  }

  ensurePanel();

  setInterval(
    updateMeter,
    250
  );
})();
<\\/script>`;


const REALTIME_TEST_NETWORK_QUALITY_PATCH = "<script>\n(() => {\n  if (\n    !window.location.pathname.startsWith(\"/realtime-test/\") ||\n    window.__lbListenerNetworkQualityPatch\n  ) {\n    return;\n  }\n\n  window.__lbListenerNetworkQualityPatch = true;\n\n  const API = \"https://livebridge-allinone-backend-test.northstarventures-ca.workers.dev\";\n  let enabled = false;\n  let configuredForRoom = \"\";\n  let currentSessionKey = \"\";\n  let warningShown = false;\n  let degradedSince = 0;\n  let state = \"checking\";\n  let latestSourceHealthy = false;\n\n  function currentRoom() {\n    try {\n      if (\n        typeof ROOM_ID !== \"undefined\" &&\n        String(ROOM_ID || \"\").trim()\n      ) {\n        return String(ROOM_ID).trim().toUpperCase();\n      }\n    } catch {}\n\n    return String(\n      document.getElementById(\"listenerRoom\")?.value || \"\"\n    ).trim().toUpperCase();\n  }\n\n  function currentSession() {\n    try {\n      if (typeof listenerSessionId !== \"undefined\") {\n        return String(listenerSessionId || \"\");\n      }\n    } catch {}\n    return currentRoom();\n  }\n\n  function ensurePill() {\n    let pill = document.getElementById(\"listenerNetworkQuality\");\n\n    if (pill) {\n      return pill;\n    }\n\n    const data = document.getElementById(\"listenerDataUsage\");\n    const meta = document.querySelector(\".lb-live-meta\");\n\n    if (!data && !meta) {\n      return null;\n    }\n\n    pill = document.createElement(\"span\");\n    pill.id = \"listenerNetworkQuality\";\n    pill.className = \"lb-live-pill\";\n    pill.style.display = \"none\";\n    pill.style.transition = \"border-color .2s ease, background .2s ease, color .2s ease\";\n    pill.textContent = \"Network: Checking…\";\n\n    if (data?.parentElement) {\n      data.insertAdjacentElement(\"afterend\", pill);\n    } else {\n      meta.appendChild(pill);\n    }\n\n    return pill;\n  }\n\n  function renderState(nextState, note = \"\") {\n    state = nextState;\n    const pill = ensurePill();\n    if (!pill) {\n      return;\n    }\n\n    pill.style.display = enabled ? \"inline-flex\" : \"none\";\n\n    if (!enabled) {\n      return;\n    }\n\n    const values = {\n      good: {\n        text: \"🟢 Network: Good\",\n        color: \"#66ebb2\",\n        border: \"rgba(102,235,178,.35)\",\n        background: \"rgba(40,180,120,.08)\"\n      },\n      unstable: {\n        text: \"🟡 Network: Unstable\",\n        color: \"#ffd166\",\n        border: \"rgba(255,209,102,.42)\",\n        background: \"rgba(255,209,102,.08)\"\n      },\n      poor: {\n        text: \"🔴 Network: Poor\",\n        color: \"#ff8d96\",\n        border: \"rgba(255,90,105,.45)\",\n        background: \"rgba(255,90,105,.09)\"\n      },\n      checking: {\n        text: \"⚪ Network: Checking\",\n        color: \"#a9bbce\",\n        border: \"rgba(255,255,255,.14)\",\n        background: \"rgba(255,255,255,.04)\"\n      }\n    };\n\n    const view = values[nextState] || values.checking;\n    pill.textContent = view.text;\n    pill.style.color = view.color;\n    pill.style.borderColor = view.border;\n    pill.style.background = view.background;\n    pill.title = note || \"\";\n  }\n\n  function showWarning() {\n    if (warningShown || !enabled || !latestSourceHealthy) {\n      return;\n    }\n\n    warningShown = true;\n\n    const overlay = document.createElement(\"div\");\n    overlay.id = \"listenerNetworkWarning\";\n    overlay.style.cssText =\n      \"position:fixed;z-index:999999;left:50%;top:108px;transform:translateX(-50%);\" +\n      \"width:min(92vw,620px);padding:16px 17px;border-radius:14px;\" +\n      \"border:1px solid rgba(255,190,70,.50);background:rgba(15,25,38,.96);\" +\n      \"box-shadow:0 18px 50px rgba(0,0,0,.45);backdrop-filter:blur(9px);color:white;\";\n\n    overlay.innerHTML =\n      '<div style=\"font-size:15px;font-weight:900;margin-bottom:7px;\">⚠️ Your network connection is unstable</div>' +\n      '<div style=\"font-size:12px;line-height:1.55;color:#c9d6e4;\">' +\n      '<strong style=\"color:#73e6b5;\">LiveBridge is receiving the broadcast normally.</strong> ' +\n      'Your device’s Wi-Fi or cellular connection is currently weak or inconsistent. ' +\n      'This can cause delayed, interrupted, or out-of-sync translated audio. ' +\n      'Move to a stronger Wi-Fi or cellular connection if possible.' +\n      '</div>' +\n      '<div style=\"display:flex;justify-content:flex-end;margin-top:12px;\">' +\n      '<button id=\"listenerNetworkWarningDismiss\" type=\"button\" style=\"' +\n      'border:0;border-radius:9px;padding:9px 14px;background:#2a91f6;color:white;font-weight:900;cursor:pointer;\">Dismiss</button>' +\n      '</div>';\n\n    document.body.appendChild(overlay);\n\n    document\n      .getElementById(\"listenerNetworkWarningDismiss\")\n      ?.addEventListener(\"click\", () => overlay.remove());\n  }\n\n  async function loadConfiguration(room) {\n    if (!room || configuredForRoom === room) {\n      return;\n    }\n\n    configuredForRoom = room;\n    enabled = false;\n    renderState(\"checking\");\n\n    try {\n      const response = await fetch(\n        API + \"/room-access?room=\" + encodeURIComponent(room),\n        { cache: \"no-store\" }\n      );\n\n      const data = await response.json();\n\n      enabled =\n        response.ok &&\n        data?.listenerNetworkQualityEnabled === true;\n\n      renderState(\"checking\");\n    } catch {\n      enabled = false;\n      renderState(\"checking\");\n    }\n  }\n\n  function classifyConnection(clientRtt, fetchOk) {\n    if (!navigator.onLine) {\n      return {\n        state: \"poor\",\n        note: \"Device reports no internet connection.\"\n      };\n    }\n\n    let effectiveType = \"\";\n    let downlink = 0;\n    let browserRtt = 0;\n\n    try {\n      const connection =\n        navigator.connection ||\n        navigator.mozConnection ||\n        navigator.webkitConnection;\n\n      effectiveType = String(connection?.effectiveType || \"\").toLowerCase();\n      downlink = Number(connection?.downlink || 0);\n      browserRtt = Number(connection?.rtt || 0);\n    } catch {}\n\n    let socketOpen = true;\n\n    try {\n      if (typeof listenerSocket !== \"undefined\" && listenerSocket) {\n        socketOpen = listenerSocket.readyState === WebSocket.OPEN;\n      }\n    } catch {}\n\n    if (\n      !fetchOk ||\n      !socketOpen ||\n      effectiveType === \"slow-2g\" ||\n      effectiveType === \"2g\" ||\n      (downlink > 0 && downlink < 0.45) ||\n      browserRtt > 1200 ||\n      clientRtt > 1800\n    ) {\n      return {\n        state: \"poor\",\n        note:\n          \"Connection metrics indicate severe delay or interruption. \" +\n          \"RTT \" + Math.round(clientRtt || browserRtt || 0) + \" ms.\"\n      };\n    }\n\n    if (\n      effectiveType === \"3g\" ||\n      (downlink > 0 && downlink < 1.0) ||\n      browserRtt > 650 ||\n      clientRtt > 700\n    ) {\n      return {\n        state: \"unstable\",\n        note:\n          \"Connection metrics indicate elevated delay. \" +\n          \"RTT \" + Math.round(clientRtt || browserRtt || 0) + \" ms.\"\n      };\n    }\n\n    return {\n      state: \"good\",\n      note:\n        \"Connection to LiveBridge is responding normally. \" +\n        \"RTT \" + Math.round(clientRtt || browserRtt || 0) + \" ms.\"\n    };\n  }\n\n  async function checkNetwork() {\n    const room = currentRoom();\n    const sessionKey = currentSession();\n\n    if (!room) {\n      enabled = false;\n      ensurePill()?.style.setProperty(\"display\", \"none\");\n      return;\n    }\n\n    if (sessionKey && sessionKey !== currentSessionKey) {\n      currentSessionKey = sessionKey;\n      warningShown = false;\n      degradedSince = 0;\n      document.getElementById(\"listenerNetworkWarning\")?.remove();\n    }\n\n    await loadConfiguration(room);\n\n    if (!enabled) {\n      ensurePill()?.style.setProperty(\"display\", \"none\");\n      return;\n    }\n\n    const started = performance.now();\n    let fetchOk = false;\n    let sourceHealthy = false;\n\n    try {\n      const response = await fetch(\n        API + \"/network-health?room=\" + encodeURIComponent(room),\n        { cache: \"no-store\" }\n      );\n\n      const data = await response.json();\n\n      fetchOk = response.ok && data?.success === true;\n      sourceHealthy =\n        fetchOk &&\n        data?.sourceHealthy === true;\n    } catch {}\n\n    const clientRtt = performance.now() - started;\n    latestSourceHealthy = sourceHealthy;\n\n    const result = classifyConnection(clientRtt, fetchOk);\n    renderState(result.state, result.note);\n\n    if (\n      sourceHealthy &&\n      (result.state === \"poor\" || result.state === \"unstable\")\n    ) {\n      if (!degradedSince) {\n        degradedSince = Date.now();\n      }\n\n      if (\n        Date.now() - degradedSince >= 8000\n      ) {\n        showWarning();\n      }\n    } else {\n      degradedSince = 0;\n    }\n  }\n\n  ensurePill();\n  setTimeout(checkNetwork, 1200);\n  setInterval(checkNetwork, 4000);\n\n  window.addEventListener(\"online\", checkNetwork);\n  window.addEventListener(\"offline\", checkNetwork);\n})();\n</script>";

const REALTIME_TEST_SOURCE_AUDIO_PATCH = "<script>\n(() => {\n  if (\n    !window.location.pathname.startsWith(\"/realtime-test/\") ||\n    window.__lbDiagnosticSourceAudioPatch\n  ) {\n    return;\n  }\n\n  window.__lbDiagnosticSourceAudioPatch = true;\n\n  const API = \"https://livebridge-allinone-backend-test.northstarventures-ca.workers.dev\";\n  const SEGMENT_MS = 5000;\n  let diagnosticRecorder = null;\n  let diagnosticTimer = null;\n  let diagnosticGeneration = 0;\n  let diagnosticSequence = 0;\n  let diagnosticStarted = false;\n  let uploadsInFlight = 0;\n\n  function preferredMimeType() {\n    if (typeof MediaRecorder === \"undefined\") {\n      return \"\";\n    }\n\n    const candidates = [\n      \"audio/webm;codecs=opus\",\n      \"audio/webm\",\n      \"audio/mp4;codecs=mp4a.40.2\",\n      \"audio/mp4\",\n      \"audio/ogg;codecs=opus\",\n      \"audio/ogg\"\n    ];\n\n    for (const type of candidates) {\n      try {\n        if (MediaRecorder.isTypeSupported(type)) {\n          return type;\n        }\n      } catch {}\n    }\n\n    return \"\";\n  }\n\n  async function uploadSegment(blob, sequence, startedAt) {\n    if (\n      !blob ||\n      blob.size < 200 ||\n      uploadsInFlight >= 3\n    ) {\n      return;\n    }\n\n    let token = \"\";\n\n    try {\n      if (\n        typeof lastBroadcastAuthToken !== \"undefined\" &&\n        lastBroadcastAuthToken\n      ) {\n        token = String(lastBroadcastAuthToken);\n      }\n    } catch {}\n\n    if (!token) {\n      try {\n        if (typeof getBroadcasterSessionToken === \"function\") {\n          token = await getBroadcasterSessionToken();\n        }\n      } catch {}\n    }\n\n    if (!token) {\n      return;\n    }\n\n    let room = \"\";\n    let broadcastId = \"\";\n\n    try {\n      room = String(ROOM_ID || \"\").trim().toUpperCase();\n      broadcastId = String(broadcastSessionId || \"\").trim();\n    } catch {}\n\n    if (!room || !broadcastId) {\n      return;\n    }\n\n    uploadsInFlight += 1;\n\n    try {\n      const response = await fetch(\n        API +\n          \"/diagnostic-audio/segment?room=\" +\n          encodeURIComponent(room) +\n          \"&broadcastId=\" +\n          encodeURIComponent(broadcastId) +\n          \"&sequence=\" +\n          encodeURIComponent(sequence) +\n          \"&startedAt=\" +\n          encodeURIComponent(startedAt),\n        {\n          method: \"POST\",\n          headers: {\n            \"Authorization\": \"Bearer \" + token,\n            \"Content-Type\": blob.type || \"audio/webm\"\n          },\n          body: blob\n        }\n      );\n\n      if (!response.ok) {\n        console.warn(\n          \"LiveBridge diagnostic source-audio upload skipped:\",\n          response.status\n        );\n      }\n    } catch (error) {\n      console.warn(\n        \"LiveBridge diagnostic source-audio upload failed:\",\n        error\n      );\n    } finally {\n      uploadsInFlight = Math.max(0, uploadsInFlight - 1);\n    }\n  }\n\n  function stopRecorderOnly() {\n    if (diagnosticTimer) {\n      clearTimeout(diagnosticTimer);\n      diagnosticTimer = null;\n    }\n\n    const recorder = diagnosticRecorder;\n    diagnosticRecorder = null;\n\n    if (\n      recorder &&\n      recorder.state === \"recording\"\n    ) {\n      try {\n        recorder.stop();\n      } catch {}\n    }\n  }\n\n  function recordNextSegment() {\n    let active = false;\n    let stream = null;\n\n    try {\n      active =\n        typeof broadcasting !== \"undefined\" &&\n        broadcasting === true;\n\n      stream =\n        typeof mediaStream !== \"undefined\"\n          ? mediaStream\n          : null;\n    } catch {}\n\n    if (\n      !diagnosticStarted ||\n      !active ||\n      !stream ||\n      !stream.getAudioTracks?.().length\n    ) {\n      return;\n    }\n\n    const generation = diagnosticGeneration;\n    const sequence = ++diagnosticSequence;\n    const startedAt = Date.now();\n    const chunks = [];\n    const mimeType = preferredMimeType();\n\n    let recorder;\n\n    try {\n      recorder =\n        mimeType\n          ? new MediaRecorder(stream, { mimeType })\n          : new MediaRecorder(stream);\n    } catch (error) {\n      console.warn(\n        \"LiveBridge diagnostic recorder unavailable:\",\n        error\n      );\n      return;\n    }\n\n    diagnosticRecorder = recorder;\n\n    recorder.ondataavailable = event => {\n      if (\n        event.data &&\n        event.data.size > 0\n      ) {\n        chunks.push(event.data);\n      }\n    };\n\n    recorder.onerror = event => {\n      console.warn(\n        \"LiveBridge diagnostic recorder error:\",\n        event?.error || event\n      );\n    };\n\n    recorder.onstop = () => {\n      if (generation !== diagnosticGeneration) {\n        return;\n      }\n\n      const type =\n        recorder.mimeType ||\n        mimeType ||\n        chunks[0]?.type ||\n        \"audio/webm\";\n\n      if (chunks.length) {\n        const blob = new Blob(chunks, { type });\n        uploadSegment(blob, sequence, startedAt);\n      }\n\n      if (diagnosticStarted) {\n        setTimeout(recordNextSegment, 25);\n      }\n    };\n\n    try {\n      recorder.start();\n\n      diagnosticTimer =\n        setTimeout(() => {\n          diagnosticTimer = null;\n\n          if (\n            recorder.state === \"recording\"\n          ) {\n            try {\n              recorder.stop();\n            } catch {}\n          }\n        }, SEGMENT_MS);\n    } catch (error) {\n      console.warn(\n        \"LiveBridge diagnostic recorder could not start:\",\n        error\n      );\n    }\n  }\n\n  function startDiagnosticRecording() {\n    if (diagnosticStarted) {\n      return;\n    }\n\n    diagnosticGeneration += 1;\n    diagnosticSequence = 0;\n    diagnosticStarted = true;\n    recordNextSegment();\n  }\n\n  function stopDiagnosticRecording() {\n    if (!diagnosticStarted) {\n      return;\n    }\n\n    diagnosticStarted = false;\n    diagnosticGeneration += 1;\n    stopRecorderOnly();\n  }\n\n  let previousBroadcasting = false;\n\n  setInterval(() => {\n    let active = false;\n\n    try {\n      active =\n        typeof broadcasting !== \"undefined\" &&\n        broadcasting === true &&\n        typeof mediaStream !== \"undefined\" &&\n        !!mediaStream;\n    } catch {}\n\n    if (active && !previousBroadcasting) {\n      startDiagnosticRecording();\n    }\n\n    if (!active && previousBroadcasting) {\n      stopDiagnosticRecording();\n    }\n\n    previousBroadcasting = active;\n  }, 400);\n\n  window.addEventListener(\n    \"beforeunload\",\n    stopDiagnosticRecording\n  );\n})();\n</script>";

const REALTIME_TEST_DIAGNOSTIC_ADMIN_PATCH = "<script>\n(() => {\n  if (\n    !window.location.pathname.startsWith(\"/realtime-test/\") ||\n    window.__lbDiagnosticAdminPatch\n  ) {\n    return;\n  }\n\n  window.__lbDiagnosticAdminPatch = true;\n\n  const API = \"https://livebridge-allinone-backend-test.northstarventures-ca.workers.dev\";\n\n  if (\n    typeof adminFetch === \"function\" &&\n    typeof getAdminToken === \"function\"\n  ) {\n    adminFetch =\n      async function(path, options = {}) {\n        const token = await getAdminToken();\n\n        if (!token) {\n          throw new Error(\"You are not signed in.\");\n        }\n\n        const headers = {\n          ...(options.headers || {}),\n          \"Authorization\": \"Bearer \" + token\n        };\n\n        if (\n          options.body &&\n          !headers[\"Content-Type\"]\n        ) {\n          headers[\"Content-Type\"] = \"application/json\";\n        }\n\n        return fetch(\n          API + path,\n          {\n            ...options,\n            headers\n          }\n        );\n      };\n  }\n\n  function ensureNetworkToggle() {\n    const card = document.getElementById(\"orgListenerDataCard\");\n\n    if (\n      !card ||\n      document.getElementById(\"editListenerNetworkQuality\")\n    ) {\n      return;\n    }\n\n    const label = document.createElement(\"label\");\n\n    label.style.cssText =\n      \"display:flex;align-items:center;justify-content:space-between;gap:14px;\" +\n      \"padding:12px;margin-top:10px;border:1px solid rgba(69,214,145,.22);\" +\n      \"border-radius:11px;background:rgba(69,214,145,.06);cursor:pointer;\";\n\n    label.innerHTML =\n      '<div>' +\n        '<div style=\"font-weight:900;color:#d8f5e7;margin-bottom:3px;\">Show listener network quality warning</div>' +\n        '<div class=\"lb-muted\">Shows Network: Good / Unstable / Poor beside listener data usage. ' +\n        'A connection warning appears once per listening session only after sustained poor connectivity.</div>' +\n      '</div>' +\n      '<input id=\"editListenerNetworkQuality\" type=\"checkbox\" checked ' +\n      'style=\"width:19px;height:19px;flex:0 0 auto;\">';\n\n    card.appendChild(label);\n  }\n\n  function ensureAudioCard() {\n    if (document.getElementById(\"orgDiagnosticAudioCard\")) {\n      return;\n    }\n\n    const broadcastsCard = document.getElementById(\"orgBroadcastsCard\");\n\n    if (!broadcastsCard?.parentElement) {\n      return;\n    }\n\n    const card = document.createElement(\"div\");\n    card.id = \"orgDiagnosticAudioCard\";\n    card.className = \"lb-card\";\n    card.style.marginTop = \"16px\";\n\n    card.innerHTML =\n      '<div class=\"lb-card-title\" style=\"margin-bottom:7px;\">🎧 Source Audio Diagnostics</div>' +\n      '<div class=\"lb-muted\" style=\"line-height:1.5;margin-bottom:13px;\">' +\n      'Private administrator-only source audio. Segments are stored for up to 7 days for quality troubleshooting, then expire.' +\n      '</div>' +\n      '<div id=\"diagnosticAudioArchive\"><div class=\"lb-empty\">Open an organization to load source audio.</div></div>';\n\n    broadcastsCard.parentElement.insertBefore(\n      card,\n      broadcastsCard\n    );\n  }\n\n  function ensurePlayerPanel() {\n    let panel = document.getElementById(\"diagnosticAudioPlayerPanel\");\n\n    if (panel) {\n      return panel;\n    }\n\n    panel = document.createElement(\"div\");\n    panel.id = \"diagnosticAudioPlayerPanel\";\n    panel.style.cssText =\n      \"position:fixed;right:18px;bottom:18px;z-index:999999;width:min(92vw,430px);\" +\n      \"padding:14px;border-radius:14px;border:1px solid rgba(45,151,255,.35);\" +\n      \"background:rgba(8,18,31,.97);box-shadow:0 18px 55px rgba(0,0,0,.5);display:none;\";\n\n    panel.innerHTML =\n      '<div style=\"display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px;\">' +\n        '<div>' +\n          '<div style=\"font-weight:900;color:white;\">Source Audio Monitor</div>' +\n          '<div id=\"diagnosticAudioPlayerStatus\" style=\"font-size:10px;color:#8fa5bc;margin-top:2px;\">Idle</div>' +\n        '</div>' +\n        '<button id=\"diagnosticAudioStopButton\" type=\"button\" class=\"lb-button secondary\" style=\"padding:7px 10px;\">Stop</button>' +\n      '</div>' +\n      '<audio id=\"diagnosticAudioPlayer\" controls playsinline style=\"width:100%;height:38px;\"></audio>';\n\n    document.body.appendChild(panel);\n\n    document\n      .getElementById(\"diagnosticAudioStopButton\")\n      ?.addEventListener(\n        \"click\",\n        stopDiagnosticPlayback\n      );\n\n    return panel;\n  }\n\n  const playback = {\n    mode: \"\",\n    room: \"\",\n    broadcastId: \"\",\n    lastSequence: 0,\n    queue: [],\n    polling: null,\n    objectUrl: \"\",\n    loading: false,\n    label: \"\"\n  };\n\n  function setPlayerStatus(text) {\n    const status =\n      document.getElementById(\"diagnosticAudioPlayerStatus\");\n\n    if (status) {\n      status.textContent = text;\n    }\n  }\n\n  function clearObjectUrl() {\n    if (playback.objectUrl) {\n      try {\n        URL.revokeObjectURL(playback.objectUrl);\n      } catch {}\n      playback.objectUrl = \"\";\n    }\n  }\n\n  function stopDiagnosticPlayback() {\n    if (playback.polling) {\n      clearInterval(playback.polling);\n      playback.polling = null;\n    }\n\n    playback.mode = \"\";\n    playback.room = \"\";\n    playback.broadcastId = \"\";\n    playback.lastSequence = 0;\n    playback.queue = [];\n    playback.loading = false;\n\n    const audio = document.getElementById(\"diagnosticAudioPlayer\");\n\n    if (audio) {\n      try {\n        audio.pause();\n        audio.removeAttribute(\"src\");\n        audio.load();\n      } catch {}\n    }\n\n    clearObjectUrl();\n\n    const panel = document.getElementById(\"diagnosticAudioPlayerPanel\");\n\n    if (panel) {\n      panel.style.display = \"none\";\n    }\n  }\n\n  async function fetchSegmentBlob(id) {\n    const response =\n      await adminFetch(\n        \"/admin/diagnostic-audio/segment?id=\" +\n        encodeURIComponent(id)\n      );\n\n    if (!response.ok) {\n      throw new Error(\n        \"Unable to load source audio segment.\"\n      );\n    }\n\n    return response.blob();\n  }\n\n  async function playNextSegment() {\n    if (\n      playback.loading ||\n      !playback.queue.length\n    ) {\n      return;\n    }\n\n    playback.loading = true;\n\n    const segment = playback.queue.shift();\n\n    try {\n      const blob =\n        await fetchSegmentBlob(segment.id);\n\n      clearObjectUrl();\n\n      playback.objectUrl =\n        URL.createObjectURL(blob);\n\n      const audio =\n        document.getElementById(\"diagnosticAudioPlayer\");\n\n      if (!audio) {\n        return;\n      }\n\n      audio.src = playback.objectUrl;\n      audio.onended = () => {\n        playback.loading = false;\n        clearObjectUrl();\n        playNextSegment();\n      };\n\n      audio.onerror = () => {\n        playback.loading = false;\n        clearObjectUrl();\n        playNextSegment();\n      };\n\n      setPlayerStatus(\n        playback.mode === \"live\"\n          ? \"🔴 LIVE source • about 5–10 seconds behind\"\n          : playback.label\n      );\n\n      try {\n        await audio.play();\n      } catch {\n        setPlayerStatus(\n          (playback.mode === \"live\"\n            ? \"Live source ready\"\n            : playback.label) +\n          \" • Press Play if your browser blocked autoplay\"\n        );\n        playback.loading = false;\n      }\n\n    } catch (error) {\n      playback.loading = false;\n      setPlayerStatus(error.message || \"Source audio playback failed.\");\n      playNextSegment();\n    }\n  }\n\n  async function pollLiveSegments() {\n    if (playback.mode !== \"live\") {\n      return;\n    }\n\n    try {\n      let path;\n\n      if (playback.broadcastId) {\n        path =\n          \"/admin/diagnostic-audio/segments?broadcastId=\" +\n          encodeURIComponent(playback.broadcastId) +\n          \"&afterSequence=\" +\n          encodeURIComponent(playback.lastSequence);\n      } else {\n        path =\n          \"/admin/diagnostic-audio/segments?room=\" +\n          encodeURIComponent(playback.room) +\n          \"&afterSequence=0\";\n      }\n\n      const response = await adminFetch(path);\n      const data = await response.json();\n\n      if (!response.ok) {\n        return;\n      }\n\n      let segments = data.segments || [];\n\n      if (!playback.broadcastId && segments.length) {\n        const latest = segments[segments.length - 1];\n\n        playback.broadcastId = latest.broadcastId;\n        playback.lastSequence = latest.sequence;\n        playback.queue.push(latest);\n      } else if (playback.broadcastId) {\n        segments =\n          segments.filter(\n            item =>\n              item.broadcastId === playback.broadcastId &&\n              item.sequence > playback.lastSequence\n          );\n\n        for (const item of segments) {\n          playback.lastSequence =\n            Math.max(\n              playback.lastSequence,\n              Number(item.sequence || 0)\n            );\n\n          playback.queue.push(item);\n        }\n      }\n\n      playNextSegment();\n\n    } catch (error) {\n      console.warn(\n        \"Live source monitor poll failed:\",\n        error\n      );\n    }\n  }\n\n  async function startDiagnosticLiveListen(room, label = \"\") {\n    stopDiagnosticPlayback();\n    ensurePlayerPanel().style.display = \"block\";\n\n    playback.mode = \"live\";\n    playback.room = String(room || \"\").trim().toUpperCase();\n    playback.label = label || playback.room;\n\n    setPlayerStatus(\"Connecting to live source audio…\");\n\n    await pollLiveSegments();\n\n    playback.polling =\n      setInterval(\n        pollLiveSegments,\n        1500\n      );\n  }\n\n  async function playDiagnosticBroadcast(broadcastId, label = \"\") {\n    stopDiagnosticPlayback();\n    ensurePlayerPanel().style.display = \"block\";\n\n    playback.mode = \"archive\";\n    playback.broadcastId = String(broadcastId || \"\");\n    playback.label = label || \"Archived source audio\";\n\n    setPlayerStatus(\"Loading archived source audio…\");\n\n    try {\n      const response =\n        await adminFetch(\n          \"/admin/diagnostic-audio/segments?broadcastId=\" +\n          encodeURIComponent(playback.broadcastId) +\n          \"&afterSequence=0\"\n        );\n\n      const data =\n        await response.json();\n\n      if (!response.ok) {\n        throw new Error(\n          data.error ||\n          \"Unable to load archived source audio.\"\n        );\n      }\n\n      playback.queue =\n        data.segments || [];\n\n      if (!playback.queue.length) {\n        setPlayerStatus(\"No source audio segments found.\");\n        return;\n      }\n\n      playNextSegment();\n\n    } catch (error) {\n      setPlayerStatus(\n        error.message ||\n        \"Unable to load archived source audio.\"\n      );\n    }\n  }\n\n  window.startDiagnosticLiveListen =\n    startDiagnosticLiveListen;\n\n  window.playDiagnosticBroadcast =\n    playDiagnosticBroadcast;\n\n  function formatBytes(value) {\n    const bytes = Number(value || 0);\n\n    if (bytes < 1024 * 1024) {\n      return (bytes / 1024).toFixed(0) + \" KB\";\n    }\n\n    return (bytes / (1024 * 1024)).toFixed(1) + \" MB\";\n  }\n\n  function formatDuration(ms) {\n    const seconds =\n      Math.max(\n        0,\n        Math.round(\n          Number(ms || 0) / 1000\n        )\n      );\n\n    const mins = Math.floor(seconds / 60);\n    const secs = seconds % 60;\n\n    return mins\n      ? mins + \"m \" + secs + \"s\"\n      : secs + \"s\";\n  }\n\n  async function loadDiagnosticAudioArchives() {\n    ensureAudioCard();\n\n    const box =\n      document.getElementById(\"diagnosticAudioArchive\");\n\n    if (!box) {\n      return;\n    }\n\n    let organizationId = 0;\n\n    try {\n      organizationId =\n        Number(\n          selectedOrganization?.id || 0\n        );\n    } catch {}\n\n    if (!organizationId) {\n      box.innerHTML =\n        '<div class=\"lb-empty\">No organization selected.</div>';\n      return;\n    }\n\n    box.innerHTML =\n      '<div class=\"lb-empty\">Loading private source audio…</div>';\n\n    try {\n      const response =\n        await adminFetch(\n          \"/admin/diagnostic-audio/broadcasts?organizationId=\" +\n          encodeURIComponent(organizationId)\n        );\n\n      const data =\n        await response.json();\n\n      if (!response.ok) {\n        throw new Error(\n          data.error ||\n          \"Unable to load source audio.\"\n        );\n      }\n\n      const broadcasts =\n        data.broadcasts || [];\n\n      if (!broadcasts.length) {\n        box.innerHTML =\n          '<div class=\"lb-empty\">No source recordings from the last 7 days.</div>';\n        return;\n      }\n\n      box.innerHTML =\n        broadcasts.map(item => {\n          const started =\n            new Date(\n              Number(item.startedAt || 0)\n            ).toLocaleString();\n\n          const approxDuration =\n            Math.max(\n              0,\n              Number(item.lastSegmentAt || 0) -\n              Number(item.startedAt || 0) +\n              5000\n            );\n\n          const expires =\n            new Date(\n              Number(item.expiresAt || 0)\n            ).toLocaleString();\n\n          const safeId =\n            String(item.broadcastId || \"\")\n              .replace(/'/g, \"\\\\'\");\n\n          const safeRoom =\n            String(item.room || \"\")\n              .replace(/</g, \"&lt;\")\n              .replace(/>/g, \"&gt;\");\n\n          return (\n            '<div style=\"padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07);display:flex;gap:10px;align-items:center;justify-content:space-between;\">' +\n              '<div style=\"min-width:0;\">' +\n                '<div style=\"font-weight:900;color:white;font-size:11px;\">' + safeRoom + '</div>' +\n                '<div class=\"lb-muted\" style=\"font-size:10px;margin-top:3px;\">' +\n                  started + ' • ' +\n                  formatDuration(approxDuration) + ' • ' +\n                  formatBytes(item.sizeBytes) +\n                '</div>' +\n                '<div class=\"lb-muted\" style=\"font-size:9px;margin-top:2px;\">Auto expires ' + expires + '</div>' +\n              '</div>' +\n              '<button type=\"button\" class=\"lb-button secondary\" style=\"flex:0 0 auto;padding:8px 10px;\" ' +\n                \"onclick=\\\"playDiagnosticBroadcast('\" + safeId + \"','Archived source • \" + safeRoom.replace(/'/g, \"\\\\'\") + \"')\\\">▶ Listen</button>\" +\n            '</div>'\n          );\n        }).join(\"\");\n\n    } catch (error) {\n      box.innerHTML =\n        '<div class=\"lb-empty\">' +\n        String(error.message || \"Unable to load source audio.\") +\n        '</div>';\n    }\n  }\n\n  function decorateLiveButtons(activeBroadcasts) {\n    let organizations = [];\n\n    try {\n      organizations =\n        Array.isArray(adminOrganizations)\n          ? adminOrganizations\n          : [];\n    } catch {}\n\n    for (const organization of organizations) {\n      const baseRooms =\n        [\n          organization.roomName,\n          organization.roomAlias\n        ]\n        .map(value =>\n          String(value || \"\")\n            .trim()\n            .toUpperCase()\n        )\n        .filter(Boolean);\n\n      const matching =\n        activeBroadcasts.find(\n          item =>\n            baseRooms.some(\n              base =>\n                item.room === base ||\n                item.room.startsWith(base + \"-\")\n            )\n        );\n\n      const row =\n        document.querySelector(\n          '[data-organization-id=\"' +\n          Number(organization.id) +\n          '\"]'\n        );\n\n      if (!row) {\n        continue;\n      }\n\n      let button =\n        row.querySelector(\n          \".lb-diagnostic-live-listen\"\n        );\n\n      if (!matching) {\n        button?.remove();\n        continue;\n      }\n\n      if (!button) {\n        button =\n          document.createElement(\"button\");\n\n        button.type = \"button\";\n        button.className =\n          \"lb-button secondary lb-diagnostic-live-listen\";\n        button.style.cssText =\n          \"margin-right:6px;padding:8px 9px;font-size:10px;\";\n        button.textContent =\n          \"🔊 Listen Live\";\n\n        const actions =\n          row.lastElementChild;\n\n        actions?.insertBefore(\n          button,\n          actions.firstChild\n        );\n      }\n\n      button.onclick =\n        () =>\n          startDiagnosticLiveListen(\n            matching.room,\n            organization.organizationName || matching.room\n          );\n    }\n  }\n\n  async function syncLiveDiagnosticButtons() {\n    try {\n      const response =\n        await adminFetch(\n          \"/admin/live-broadcasts\"\n        );\n\n      const data =\n        await response.json();\n\n      if (!response.ok) {\n        return;\n      }\n\n      decorateLiveButtons(\n        (data.broadcasts || [])\n          .map(item => ({\n            ...item,\n            room:\n              String(item.room || \"\")\n                .trim()\n                .toUpperCase()\n          }))\n      );\n\n    } catch {}\n  }\n\n  function installWrappers() {\n    ensureNetworkToggle();\n    ensureAudioCard();\n    ensurePlayerPanel();\n\n    if (\n      typeof collectFeatureOverrides === \"function\" &&\n      !collectFeatureOverrides.__lbNetworkWrapped\n    ) {\n      const originalCollect =\n        collectFeatureOverrides;\n\n      const wrappedCollect =\n        function() {\n          const output =\n            originalCollect();\n\n          output.listenerNetworkQualityDisabled =\n            document.getElementById(\n              \"editListenerNetworkQuality\"\n            )?.checked !== true;\n\n          return output;\n        };\n\n      wrappedCollect.__lbNetworkWrapped =\n        true;\n\n      collectFeatureOverrides =\n        wrappedCollect;\n    }\n\n    if (\n      typeof openOrganization === \"function\" &&\n      !openOrganization.__lbDiagnosticWrapped\n    ) {\n      const originalOpen =\n        openOrganization;\n\n      const wrappedOpen =\n        async function(id) {\n          const result =\n            await originalOpen(id);\n\n          ensureNetworkToggle();\n          ensureAudioCard();\n\n          try {\n            const overrides =\n              selectedOrganization\n                ?.featureOverrides ||\n              {};\n\n            const checkbox =\n              document.getElementById(\n                \"editListenerNetworkQuality\"\n              );\n\n            if (checkbox) {\n              checkbox.checked =\n                overrides\n                  .listenerNetworkQualityDisabled !==\n                true;\n            }\n          } catch {}\n\n          loadDiagnosticAudioArchives();\n\n          return result;\n        };\n\n      wrappedOpen.__lbDiagnosticWrapped =\n        true;\n\n      openOrganization =\n        wrappedOpen;\n    }\n  }\n\n  installWrappers();\n  setTimeout(installWrappers, 500);\n  setTimeout(syncLiveDiagnosticButtons, 1000);\n  setInterval(syncLiveDiagnosticButtons, 5000);\n})();\n</script>";

const PAGES = new Map([
  ["/", "/index.html"],
  ["/account", "/account/index.html"],
  ["/account/", "/account/index.html"],
  ["/admin", "/admin/index.html"],
  ["/admin/", "/admin/index.html"],
  ["/signup", "/signup/index.html"],
  ["/signup/", "/signup/index.html"],
  ["/sunday", "/sunday/index.html"],
  ["/sunday/", "/sunday/index.html"],
  ["/t", "/t/index.html"],
  ["/t/", "/t/index.html"],
  ["/clientpitch", "/clientpitch/index.html"],
  ["/clientpitch/", "/clientpitch/index.html"],
  ["/live-stats", "/live-stats/index.html"],
  ["/live-stats/", "/live-stats/index.html"],
  ["/privacy", "/privacy/index.html"],
  ["/privacy/", "/privacy/index.html"],
  ["/terms", "/terms/index.html"],
  ["/terms/", "/terms/index.html"],
  ["/offer", "/offer/index.html"],
  ["/offer/", "/offer/index.html"],
]);

function preserveQueryRedirect(
  requestUrl,
  targetPath
) {
  const source =
    new URL(
      requestUrl
    );

  const target =
    new URL(
      targetPath,
      source.origin
    );

  target.search =
    source.search;

  return Response.redirect(
    target.toString(),
    302
  );
}

function protectListenerPage(
  response
) {
  if(
    !response ||
    response.status >= 400
  ) {
    return response;
  }

  const addNoTranslateClass =
    element => {
      const existing =
        String(
          element.getAttribute(
            "class"
          ) || ""
        )
        .trim();

      const classes =
        new Set(
          existing
            .split(/\s+/)
            .filter(Boolean)
        );

      classes.add(
        "notranslate"
      );

      element.setAttribute(
        "class",
        [...classes].join(" ")
      );

      element.setAttribute(
        "translate",
        "no"
      );
    };

  return new HTMLRewriter()
    .on(
      "html",
      {
        element(
          element
        ) {
          addNoTranslateClass(
            element
          );
        }
      }
    )
    .on(
      "head",
      {
        element(
          element
        ) {
          element.append(
            '<meta name="google" content="notranslate">',
            {
              html:true
            }
          );
        }
      }
    )
    .on(
      "body",
      {
        element(
          element
        ) {
          addNoTranslateClass(
            element
          );

          element.append(
            '<script src="/t/scripture.js"></script>',
            {
              html:true
            }
          );

          element.append(
            '<script src="/share-room.js"></script>',
            {
              html:true
            }
          );

          element.append(
            REALTIME_TEST_LISTENER_PATCH,
            {
              html:true
            }
          );

          element.append(
            REALTIME_TEST_NETWORK_QUALITY_PATCH,
            {
              html:true
            }
          );

          element.append(
            `<script>
(() => {
  const host =
    String(
      window.location.hostname || ""
    ).toLowerCase();

  const preview =
    host.includes("dev-v1-3-0") ||
    host.includes("livebridge-allinone-frontend-test") ||
    host.includes("livebridge-promoter-frontend-test");

  const BACKEND =
    preview
      ? "https://livebridge-allinone-backend-test.northstarventures-ca.workers.dev"
      : "https://livebridge.northstarventures-ca.workers.dev";

  function moveDataMeterToTopbar() {
    const meter = document.getElementById("listenerDataUsage");
    const meta = document.querySelector(".lb-live-meta");

    if (!meter || !meta) {
      return;
    }

    if (meter.parentElement !== meta) {
      meta.appendChild(meter);
    }

    meter.classList.add("lb-live-pill");
    meter.style.marginLeft = "0";
    meter.style.fontSize = "12px";
    meter.style.fontWeight = "900";
    meter.style.color = "#6de8c5";
  }

  function currentRoom() {
    try {
      if (
        typeof ROOM_ID !== "undefined" &&
        String(ROOM_ID || "").trim()
      ) {
        return String(ROOM_ID).trim().toUpperCase();
      }
    } catch {}

    return String(
      document.getElementById("listenerRoom")?.value || ""
    ).trim().toUpperCase();
  }

  async function syncDataMeterSetting() {
    moveDataMeterToTopbar();

    const room = currentRoom();
    if (!room) {
      return;
    }

    try {
      const response = await fetch(
        BACKEND +
        "/room-access?room=" +
        encodeURIComponent(room),
        { cache: "no-store" }
      );

      const data = await response.json();

      if (
        typeof setListenerDataCounterEnabled === "function"
      ) {
        setListenerDataCounterEnabled(
          data?.listenerDataDisplayEnabled === true
        );
      }
    } catch (error) {
      console.warn(
        "LiveBridge listener data-meter sync failed:",
        error
      );
    }
  }

  moveDataMeterToTopbar();

  document.getElementById("joinRoomButton")
    ?.addEventListener(
      "click",
      () => setTimeout(syncDataMeterSetting, 700)
    );

  document.getElementById("listenerLanguage")
    ?.addEventListener(
      "change",
      () => setTimeout(syncDataMeterSetting, 700)
    );

  setTimeout(syncDataMeterSetting, 900);
})();
</script>`,
            {
              html:true
            }
          );
        }
      }
    )
    .on(
      "#listenerOutput",
      {
        element(
          element
        ) {
          addNoTranslateClass(
            element
          );
        }
      }
    )
    .transform(
      response
    );
}

function enhanceAdminPage(
  response
) {
  if(
    !response ||
    response.status >= 400
  ) {
    return response;
  }

  return new HTMLRewriter()
    .on(
      "body",
      {
        element(
          element
        ) {
          element.append(
            REALTIME_TEST_ADMIN_PATCH,
            {
              html:true
            }
          );

          element.append(
            REALTIME_TEST_DIAGNOSTIC_ADMIN_PATCH,
            {
              html:true
            }
          );

          element.append(
            `<script>
(() => {
  function attachListenerDataAutosave() {
    const checkbox =
      document.getElementById(
        "editListenerDataDisplay"
      );

    if (
      !checkbox ||
      checkbox.dataset.lbAutosave === "1"
    ) {
      return;
    }

    checkbox.dataset.lbAutosave = "1";

    const note = document.createElement("div");
    note.style.marginTop = "6px";
    note.style.fontSize = "10px";
    note.style.color = "#6de8c5";
    note.textContent = "This setting saves automatically.";

    const label = checkbox.closest("label");
    if (label && label.parentElement) {
      label.parentElement.appendChild(note);
    }

    checkbox.addEventListener(
      "change",
      () => {
        const saveButton =
          document.getElementById(
            "saveClientButton"
          );

        if (saveButton) {
          saveButton.click();
        }
      }
    );
  }

  attachListenerDataAutosave();

  const observer = new MutationObserver(
    attachListenerDataAutosave
  );

  observer.observe(
    document.body,
    {
      childList:true,
      subtree:true
    }
  );
})();
</script>`,
            {
              html:true
            }
          );
        }
      }
    )
    .transform(
      response
    );
}

function enhanceBroadcasterPage(
  response
) {
  if(
    !response ||
    response.status >= 400
  ) {
    return response;
  }

  return new HTMLRewriter()
    .on(
      "body",
      {
        element(
          element
        ) {
          element.append(
            '<script src="/sunday/share-graphic.js"></script>',
            {
              html:true
            }
          );

          element.append(
            REALTIME_TEST_BROADCASTER_PATCH,
            {
              html:true
            }
          );

          element.append(
            REALTIME_TEST_SOURCE_AUDIO_PATCH,
            {
              html:true
            }
          );
        }
      }
    )
    .transform(
      response
    );
}

function enhanceAccountPage(
  response
) {
  if(
    !response ||
    response.status >= 400
  ) {
    return response;
  }

  return new HTMLRewriter()
    .on(
      "body",
      {
        element(
          element
        ) {
          element.append(
            '<script src="/share-room.js"></script>',
            {
              html:true
            }
          );
        }
      }
    )
    .transform(
      response
    );
}

async function fetchExactAsset(
  request,
  env,
  assetPath
) {
  const assetUrl =
    new URL(
      request.url
    );

  assetUrl.pathname =
    assetPath;

  const response =
    await env.ASSETS.fetch(
      new Request(
        assetUrl.toString(),
        request
      )
    );

  if(
    assetPath ===
    "/t/index.html"
  ) {
    return protectListenerPage(
      response
    );
  }

  if(
    assetPath ===
    "/admin/index.html"
  ) {
    return enhanceAdminPage(
      response
    );
  }

  if(
    assetPath ===
    "/sunday/index.html"
  ) {
    return enhanceBroadcasterPage(
      response
    );
  }

  if(
    assetPath ===
    "/account/index.html"
  ) {
    return enhanceAccountPage(
      response
    );
  }

  return response;
}

export default {
  async fetch(
    request,
    env
  ) {
    const url =
      new URL(
        request.url
      );

    const requestedPath =
      url.pathname;

    const testPrefix =
      "/realtime-test";

    const path =
      requestedPath ===
        testPrefix
        ? "/"
        : (
            requestedPath.startsWith(
              testPrefix + "/"
            )
              ? (
                  requestedPath.slice(
                    testPrefix.length
                  ) || "/"
                )
              : requestedPath
          );

    const redirectTarget =
      REDIRECTS.get(
        path
      );

    if(
      redirectTarget
    ) {
      return preserveQueryRedirect(
        request.url,
        redirectTarget
      );
    }

    const assetPath =
      PAGES.get(
        path
      );

    if(
      assetPath
    ) {
      return fetchExactAsset(
        request,
        env,
        assetPath
      );
    }

    // Private offer route:
    // /offer/<secure-token>
    if(
      path.startsWith(
        "/offer/"
      ) &&
      path.length >
        "/offer/".length
    ) {
      return fetchExactAsset(
        request,
        env,
        "/offer/index.html"
      );
    }

    let directRequest =
      request;

    if (
      path !==
      requestedPath
    ) {
      const directUrl =
        new URL(
          request.url
        );

      directUrl.pathname =
        path;

      directRequest =
        new Request(
          directUrl.toString(),
          request
        );
    }

    const direct =
      await env.ASSETS.fetch(
        directRequest
      );

    if(
      direct.status !==
      404
    ) {
      if(
        path ===
        "/t/index.html"
      ) {
        return protectListenerPage(
          direct
        );
      }

      if(
        path ===
        "/admin/index.html"
      ) {
        return enhanceAdminPage(
          direct
        );
      }

      if(
        path ===
        "/sunday/index.html"
      ) {
        return enhanceBroadcasterPage(
          direct
        );
      }

      if(
        path ===
        "/account/index.html"
      ) {
        return enhanceAccountPage(
          direct
        );
      }

      return direct;
    }

    const notFound =
      await fetchExactAsset(
        request,
        env,
        "/404.html"
      );

    return new Response(
      notFound.body,
      {
        status:404,
        headers:notFound.headers,
      }
    );
  },
};
