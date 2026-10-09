const BROADCAST_RELIABILITY_SCRIPT = "/* LiveBridge broadcaster resilience (isolated from broadcast start/stop and no-audio timeout). */\n(() => {\n  \"use strict\";\n  if (window.__liveBridgeReliabilityGuardActive) return;\n  window.__liveBridgeReliabilityGuardActive = true;\n  const CHECK_MS = 2500;\n  const SIGNAL_PROBE_MS = 20000;\n  const BAD_CONNECTION_GRACE_MS = 9000;\n  const SILENCE_WARNING_MS = 60000;\n  const MAX_AUTOMATIC_RETRIES = 3;\n  const state = {\n    active: false, issueSince: 0, attempts: 0, recovering: false,\n    silenceAlerted: false, warning: \"\", lastNetworkMs: null,\n    lastProbeAt: 0, probeFailures: 0, probeBusy: false,\n    quietSpeechWarning: false, lastVisibleAt: 0, hiddenAt: 0,\n    pendingEvents: [], logging: false, eventCooldowns: new Map(),\n    sessionKey: \"\", lastHealthyAt: 0, lastRetryAt: 0, previousMuted: false\n  };\n\n  const el = id => document.getElementById(id);\n  const active = () => {\n    try {\n      return broadcasting === true &&\n        !!mediaStream &&\n        !!ROOM_ID &&\n        (el(\"broadcastStatus\")?.textContent || \"\").includes(\"LIVE BROADCASTING\");\n    } catch { return false; }\n  };\n  const intentionallyMuted = () => window.__liveBridgeMicMuted === true;\n  const micTrack = () => {\n    try { return mediaStream?.getAudioTracks?.()[0] || null; } catch { return null; }\n  };\n  const channelOpen = () => {\n    try { return realtimeTranscriptionDc?.readyState === \"open\"; } catch { return false; }\n  };\n  const peerHealthy = () => {\n    try {\n      const pc = realtimeTranscriptionPc;\n      return !!pc && channelOpen() &&\n        (pc.connectionState === \"connected\" ||\n          ((pc.connectionState === \"new\" || !pc.connectionState) &&\n           [\"connected\",\"completed\"].includes(pc.iceConnectionState)));\n    } catch { return false; }\n  };\n\n  const panel = document.createElement(\"div\");\n  panel.id = \"lbBroadcasterReliability\";\n  panel.style.cssText = \"margin:0 0 14px;padding:11px;border-radius:10px;border:1px solid #34465e;background:#101e30;color:#e3eef9;font-size:12px;line-height:1.55\";\n  panel.innerHTML = [\n    '<div style=\"font-weight:800;margin-bottom:5px\">BROADCAST CONNECTION</div>',\n    '<div id=\"lbNetworkQuality\" role=\"status\">⚪ Network: waiting</div>',\n    '<div id=\"lbRealtimeQuality\">⚪ Translation audio: waiting</div>',\n    '<div id=\"lbMicHealth\">⚪ Microphone: waiting</div>',\n    '<div id=\"lbReliabilityWarning\" aria-live=\"assertive\" style=\"display:none;margin-top:9px;color:#ffd6a3;font-weight:700\"></div>',\n    '<button type=\"button\" id=\"lbResumeBroadcastAudio\" style=\"display:none;width:100%;padding:12px;margin-top:9px;border:0;border-radius:8px;color:#081726;background:#ffcd63;font-size:13px;font-weight:800;cursor:pointer\">Tap to Resume Audio</button>'\n  ].join(\"\");\n  const target = el(\"lbMicQualityPanel\") || el(\"audioCaptureDiagnostic\");\n  if (target?.parentNode) target.parentNode.insertBefore(panel, target);\n  const resumeButton = el(\"lbResumeBroadcastAudio\");\n  const toast = document.createElement(\"div\");\n  toast.id = \"lbBroadcastSafetyToast\";\n  toast.setAttribute(\"role\", \"alert\");\n  toast.style.cssText = \"display:none;position:fixed;z-index:99999;top:12px;left:12px;right:12px;max-width:420px;margin-left:auto;padding:14px 16px;background:#3b2025;border:2px solid #ffb46a;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.45);color:#fff;font-size:13px;line-height:1.4\";\n  toast.innerHTML = '<div style=\"font-weight:800\">⚠ Broadcast Audio Alert</div>' +\n    '<div id=\"lbBroadcastToastText\" style=\"margin-top:6px\"></div>' +\n    '<div style=\"display:flex;gap:8px;margin-top:10px\">' +\n    '<button id=\"lbBroadcastToastResume\" type=\"button\" style=\"display:none;padding:9px 12px;font-weight:800;border:0;border-radius:7px;background:#ffcd63;color:#172334\">Tap to Resume</button>' +\n    '<button id=\"lbBroadcastToastDismiss\" type=\"button\" style=\"padding:9px 12px;border:1px solid #8b6b6b;border-radius:7px;color:#fff;background:transparent\">Dismiss</button>' +\n    '</div>';\n  document.body.appendChild(toast);\n  let lastToastMessage = \"\";\n  el(\"lbBroadcastToastDismiss\")?.addEventListener(\"click\", () => {\n    toast.style.display = \"none\";\n  });\n  el(\"lbBroadcastToastResume\")?.addEventListener(\"click\", () => {\n    toast.style.display = \"none\";\n    state.attempts = 0;\n    void attemptRecovery(true);\n  });\n\n  function line(id, symbol, message) {\n    const node = el(id);\n    if (node) node.textContent = symbol + \" \" + message;\n  }\n  function warn(message, requiresTap = false) {\n    const area = el(\"lbReliabilityWarning\");\n    if (!area) return;\n    state.warning = message;\n    area.textContent = message;\n    if (lastToastMessage !== message) {\n      lastToastMessage = message;\n      el(\"lbBroadcastToastText\").textContent = message;\n      toast.style.display = \"block\";\n    }\n    el(\"lbBroadcastToastResume\").style.display = requiresTap ? \"block\" : \"none\";\n    area.style.display = \"block\";\n    if (resumeButton) resumeButton.style.display = requiresTap ? \"block\" : \"none\";\n  }\n  function clearWarning() {\n    state.warning = \"\";\n    lastToastMessage = \"\";\n    toast.style.display = \"none\";\n    const area = el(\"lbReliabilityWarning\");\n    if (area) area.style.display = \"none\";\n    if (resumeButton) resumeButton.style.display = \"none\";\n  }\n  function record(type, detail = \"\") {\n    const now = Date.now();\n    const last = state.eventCooldowns.get(type) || 0;\n    if (now - last < 60000 || !state.active) return;\n    state.eventCooldowns.set(type, now);\n    state.pendingEvents.push({room: ROOM_ID, type, detail: String(detail).slice(0, 180)});\n    if (state.pendingEvents.length > 20) state.pendingEvents.shift();\n    void flushEvents();\n  }\n  async function flushEvents() {\n    if (state.logging || !navigator.onLine || !state.active || !state.pendingEvents.length) return;\n    state.logging = true;\n    try {\n      const token = await getBroadcasterSessionToken();\n      if (!token) return;\n      while (state.pendingEvents.length && navigator.onLine && state.active) {\n        const entry = state.pendingEvents[0];\n        if (entry.room !== ROOM_ID) { state.pendingEvents.shift(); continue; }\n        const response = await fetch(WORKER_URL + \"/broadcast-connection-event\", {\n          method:\"POST\",\n          headers:{\"Content-Type\":\"application/json\",\"Authorization\":\"Bearer \" + token},\n          body:JSON.stringify(entry)\n        });\n        if (!response.ok) break;\n        state.pendingEvents.shift();\n      }\n    } catch (error) {\n      console.warn(\"LiveBridge reliability event could not be saved:\", error);\n    } finally { state.logging = false; }\n  }\n  async function probeBackend() {\n    if (state.probeBusy || !state.active || !navigator.onLine) return;\n    state.probeBusy = true;\n    const start = performance.now();\n    const controller = typeof AbortController !== \"undefined\" ? new AbortController() : null;\n    const timeout = setTimeout(() => controller?.abort(), 8500);\n    try {\n      const response = await fetch(\n        WORKER_URL + \"/room-status?room=\" + encodeURIComponent(ROOM_ID),\n        {cache:\"no-store\", ...(controller ? {signal:controller.signal} : {})}\n      );\n      if (!response.ok) throw new Error(\"HTTP \" + response.status);\n      state.lastNetworkMs = Math.round(performance.now() - start);\n      state.probeFailures = 0;\n    } catch {\n      state.probeFailures++;\n      state.lastNetworkMs = null;\n      if (state.probeFailures === 2) record(\"network_lost\", \"Backend connection check failed\");\n    } finally {\n      clearTimeout(timeout);\n      state.probeBusy = false;\n    }\n  }\n\n  async function attemptRecovery(manual = false) {\n    if (!state.active || state.recovering || !navigator.onLine) return;\n    if (!manual && state.attempts >= MAX_AUTOMATIC_RETRIES) {\n      warn(\"Automatic recovery was unsuccessful. Tap to Resume Audio.\", true);\n      return;\n    }\n    state.recovering = true;\n    state.lastRetryAt = Date.now();\n    state.attempts++;\n    warn(\"Restoring the microphone and realtime connection…\");\n    if (manual) record(\"manual_resume\", \"Broadcaster requested audio recovery\");\n    try {\n      if (!active()) return;\n      let track = micTrack();\n      if (!track || track.readyState !== \"live\") {\n        const selected = el(\"audioInput\")?.value || \"\";\n        const stream = await navigator.mediaDevices.getUserMedia({\n          audio: getBroadcasterAudioConstraints(selected)\n        });\n        if (!active()) { stream.getTracks().forEach(t => t.stop()); return; }\n        stopAudioSafetyMonitoring();\n        const oldStream = mediaStream;\n        mediaStream = stream;\n        oldStream?.getTracks?.().forEach(t => t.stop());\n        startAudioSafetyMonitoring();\n        track = micTrack();\n      } else if (audioSafetyContext?.state === \"suspended\") {\n        await audioSafetyContext.resume();\n      }\n      if (!active() || !track || track.readyState !== \"live\") throw new Error(\"Microphone unavailable\");\n      if (peerHealthy() && audioSafetyContext?.state !== \"suspended\") {\n        state.issueSince = 0;\n        state.attempts = 0;\n        record(\"recovered\", \"Audio processing resumed without reconnecting\");\n        clearWarning();\n        return;\n      }\n      // This only rebuilds the transcription transport. It never ends/restarts a broadcast room.\n      await stopRealtimeTranscription(channelOpen());\n      if (!active()) return;\n      await startRealtimeTranscription();\n      if (!peerHealthy()) throw new Error(\"Realtime connection has not recovered\");\n      state.issueSince = 0;\n      state.attempts = 0;\n      state.lastHealthyAt = Date.now();\n      record(\"recovered\", \"Mic and realtime session restored without ending broadcast\");\n      clearWarning();\n    } catch (error) {\n      console.warn(\"LiveBridge broadcaster auto recovery failed:\", error);\n      record(\"recovery_failed\", error?.name || \"reconnect failed\");\n      warn(\n        state.attempts >= MAX_AUTOMATIC_RETRIES\n          ? \"Audio could not reconnect automatically. Tap to Resume Audio.\"\n          : \"Audio connection interrupted. Retrying automatically.\",\n        state.attempts >= MAX_AUTOMATIC_RETRIES\n      );\n    } finally { state.recovering = false; }\n  }\n\n  function beginSession() {\n    state.active = true;\n    state.sessionKey = ROOM_ID + \":\" + String(broadcastStartedAt || Date.now());\n    state.issueSince = 0;\n    state.attempts = 0;\n    state.recovering = false;\n    state.silenceAlerted = false;\n    state.quietSpeechWarning = false;\n    state.probeFailures = 0;\n    state.lastNetworkMs = null;\n    state.lastProbeAt = 0;\n    state.lastHealthyAt = Date.now();\n    state.previousMuted = intentionallyMuted();\n    state.pendingEvents = [];\n    state.eventCooldowns.clear();\n    clearWarning();\n  }\n  function endSession() {\n    state.active = false;\n    state.issueSince = 0;\n    state.attempts = 0;\n    state.pendingEvents = [];\n    clearWarning();\n    line(\"lbNetworkQuality\", \"⚪\", \"Network: waiting for broadcast\");\n    line(\"lbRealtimeQuality\", \"⚪\", \"Translation audio: waiting\");\n    line(\"lbMicHealth\", \"⚪\", \"Microphone: waiting\");\n  }\n\n  function tick() {\n    const live = active();\n    if (!live) {\n      if (state.active) endSession();\n      return;\n    }\n    if (!state.active) beginSession();\n    const now = Date.now();\n    const muted = intentionallyMuted();\n    if (state.previousMuted && !muted) {\n      // Silence while intentionally muted must never trigger an immediate warning.\n      lastMeaningfulAudioAt = now;\n      state.silenceAlerted = false;\n    }\n    state.previousMuted = muted;\n    const track = micTrack();\n    const networkFailed = navigator.onLine === false || state.probeFailures >= 2;\n    const networkSlow = state.lastNetworkMs !== null && state.lastNetworkMs > 1200;\n\n    if (now - state.lastProbeAt >= SIGNAL_PROBE_MS) {\n      state.lastProbeAt = now;\n      void probeBackend();\n    }\n    if (navigator.onLine === false) {\n      line(\"lbNetworkQuality\", \"🔴\", \"Network: offline\");\n    } else if (networkFailed) {\n      line(\"lbNetworkQuality\", \"🔴\", \"Network: unable to reach server\");\n    } else if (state.lastNetworkMs === null) {\n      line(\"lbNetworkQuality\", \"🟡\", \"Network: checking connection…\");\n    } else if (networkSlow) {\n      line(\"lbNetworkQuality\", \"🟡\", \"Network: unstable (\" + state.lastNetworkMs + \" ms)\");\n      if (state.lastNetworkMs > 2000) record(\"network_degraded\", \"Server roundtrip \" + state.lastNetworkMs + \" ms\");\n    } else {\n      line(\"lbNetworkQuality\", \"🟢\", \"Network: good\" +\n        (state.lastNetworkMs !== null ? \" (\" + state.lastNetworkMs + \" ms)\" : \"\"));\n    }\n\n    const badTrack = !track || track.readyState !== \"live\";\n    const suspendedAudio = !muted && audioSafetyContext?.state === \"suspended\";\n    line(\"lbMicHealth\", badTrack ? \"🔴\" : suspendedAudio ? \"🟡\" : \"🟢\",\n      badTrack ? \"Microphone: disconnected\" :\n      muted ? \"Microphone: intentionally muted\" :\n      suspendedAudio ? \"Microphone: processing suspended\" : \"Microphone: active\");\n\n    const goodPeer = peerHealthy();\n    line(\"lbRealtimeQuality\",\n      goodPeer && !networkFailed ? \"🟢\" : goodPeer ? \"🟡\" : \"🔴\",\n      goodPeer ? \"Translation audio: connected\" : \"Translation audio: disconnected\");\n\n    if (badTrack || suspendedAudio || !goodPeer || networkFailed) {\n      if (!state.issueSince) {\n        state.issueSince = now;\n        if (badTrack) record(\"microphone_ended\", \"Microphone track ended unexpectedly\");\n        else if (suspendedAudio) record(\"microphone_suspended\", \"AudioContext suspended\");\n        else if (networkFailed) record(\"network_lost\", \"Network connection interrupted\");\n        else record(\"realtime_disconnected\", \"Realtime peer/data channel unavailable\");\n      }\n      const elapsed = now - state.issueSince;\n      if (elapsed >= BAD_CONNECTION_GRACE_MS) {\n        if (!state.recovering && !networkFailed &&\n            now - state.lastRetryAt >= Math.min(30000, state.attempts * 6000 + 2500)) {\n          void attemptRecovery();\n        } else if (networkFailed) {\n          warn(\"Network disconnected. Audio will recover when the connection returns.\");\n        }\n      }\n    } else {\n      if (state.issueSince) {\n        state.issueSince = 0;\n        state.attempts = 0;\n        record(\"recovered\", \"Connection restored\");\n        clearWarning();\n      }\n      state.lastHealthyAt = now;\n    }\n\n    if (!muted && !badTrack && !suspendedAudio &&\n        audioSafetyAnalyser && audioSafetyContext?.state === \"running\" &&\n        !state.silenceAlerted && lastMeaningfulAudioAt &&\n        now - lastMeaningfulAudioAt >= SILENCE_WARNING_MS) {\n      state.silenceAlerted = true;\n      record(\"audio_silence\", \"No microphone audio above activity threshold for 60 seconds\");\n      if (!state.warning) warn(\"No audio detected for 60 seconds. Check your microphone or sound source.\");\n    }\n    if (lastMeaningfulAudioAt && now - lastMeaningfulAudioAt < 3500) {\n      state.silenceAlerted = false;\n      if (state.warning.includes(\"No audio detected\")) clearWarning();\n    }\n\n    if (state.pendingEvents.length && navigator.onLine) void flushEvents();\n  }\n\n  resumeButton?.addEventListener(\"click\", () => {\n    state.attempts = 0;\n    void attemptRecovery(true);\n  });\n  window.addEventListener(\"online\", () => {\n    state.probeFailures = 0;\n    state.lastProbeAt = 0;\n    if (state.active && (!peerHealthy() || micTrack()?.readyState !== \"live\"))\n      void attemptRecovery();\n  });\n  window.addEventListener(\"offline\", () => {\n    if (state.active) record(\"network_lost\", \"Browser reported offline\");\n  });\n  document.addEventListener(\"visibilitychange\", () => {\n    if (document.hidden) {\n      if (state.active) state.hiddenAt = Date.now();\n    } else {\n      if (state.active && state.hiddenAt &&\n          Date.now() - state.hiddenAt > 8000) {\n        record(\"page_suspended\", \"Browser was in background\");\n        state.lastProbeAt = 0;\n        if (!peerHealthy() || micTrack()?.readyState !== \"live\")\n          void attemptRecovery();\n      }\n      state.hiddenAt = 0;\n    }\n  });\n\n  setInterval(tick, CHECK_MS);\n  tick();\n})();\n";
const ADMIN_RELIABILITY_COMPAT_SCRIPT = "<script>\n(function(){\n  if(window.__lbAdminReliabilityExtension)return;\n  window.__lbAdminReliabilityExtension=true;\n  const original=window.renderDetailHistory;\n  if(typeof original!==\"function\"||original.toString().includes(\"recentAlerts\"))return;\n  window.renderDetailHistory=function(broadcasts){\n    original.apply(this,arguments);\n    const rows=document.querySelectorAll(\"#detailHistory .lb-history-row\");\n    (broadcasts||[]).forEach((item,i)=>{\n      const count=Math.max(0,Number(item.connectionIssues||0));\n      if(!count||!rows[i]?.firstElementChild||rows[i].querySelector(\".lb-reliability-admin\"))return;\n      const events=Array.isArray(item.connectionEvents)?item.connectionEvents:[];\n      const details=document.createElement(\"details\");\n      details.className=\"lb-reliability-admin\";\n      details.style.cssText=\"margin-top:5px;font-size:11px;color:#ffc77c\";\n      const summary=document.createElement(\"summary\");\n      summary.textContent=\"⚠ \"+count+\" connection alert\"+(count===1?\"\":\"s\");\n      details.appendChild(summary);\n      const container=document.createElement(\"div\");\n      events.forEach(ev=>{\n        const line=document.createElement(\"div\");\n        line.textContent=(Number(ev.at)>0?new Date(Number(ev.at)).toLocaleTimeString()+\" · \":\"\")+\n          String(ev.type||\"\").replace(/_/g,\" \")+(ev.detail?\" — \"+String(ev.detail).slice(0,180):\"\");\n        container.appendChild(line);\n      });\n      details.appendChild(container);\n      rows[i].firstElementChild.appendChild(details);\n    });\n  };\n})();\n</script>";
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
            "<script>\n(() => {\n  if (window.__lbRwLnLanguagePatch) {\n    return;\n  }\n\n  window.__lbRwLnLanguagePatch = true;\n\n  function installLanguages() {\n    const select =\n      document.getElementById(\"listenerLanguage\");\n\n    if (select) {\n      const existing =\n        new Set(\n          Array.from(select.options)\n            .map(option =>\n              String(option.value || \"\")\n                .split(\"|\")[0]\n                .toLowerCase()\n            )\n        );\n\n      const zhOption =\n        Array.from(select.options)\n          .find(item =>\n            String(item.value || \"\")\n              .startsWith(\"zh|\")\n          ) || null;\n\n      if (!existing.has(\"rw\")) {\n        const option =\n          document.createElement(\"option\");\n        option.value = \"rw|rw-RW\";\n        option.textContent =\n          \"Kinyarwanda — Ikinyarwanda\";\n        select.insertBefore(\n          option,\n          zhOption\n        );\n      }\n\n      if (!existing.has(\"ln\")) {\n        const option =\n          document.createElement(\"option\");\n        option.value = \"ln|ln-CD\";\n        option.textContent =\n          \"Lingala (Congo) — Lingála\";\n        select.insertBefore(\n          option,\n          zhOption\n        );\n      }\n    }\n\n    try {\n      if (\n        typeof languages !== \"undefined\" &&\n        Array.isArray(languages)\n      ) {\n        if (!languages.some(item => item.code === \"rw\")) {\n          const index =\n            languages.findIndex(item => item.code === \"zh\");\n          languages.splice(\n            index >= 0 ? index : languages.length,\n            0,\n            {\n              code:\"rw\",\n              flag:\"🇷🇼\",\n              native:\"Kanda hano wumve mu Kinyarwanda\",\n              english:\"Kinyarwanda\"\n            }\n          );\n        }\n\n        if (!languages.some(item => item.code === \"ln\")) {\n          const index =\n            languages.findIndex(item => item.code === \"zh\");\n          languages.splice(\n            index >= 0 ? index : languages.length,\n            0,\n            {\n              code:\"ln\",\n              flag:\"🇨🇩\",\n              native:\"Finá awa mpo na koyoka na Lingála\",\n              english:\"Lingala (Congo)\"\n            }\n          );\n        }\n      }\n    } catch {}\n\n    try {\n      if (\n        typeof changeLanguageLabels !== \"undefined\"\n      ) {\n        changeLanguageLabels.rw =\n          \"Hindura ururimi\";\n        changeLanguageLabels.ln =\n          \"Bongola monɔkɔ\";\n      }\n    } catch {}\n\n    try {\n      if (\n        typeof renderLanguageGate === \"function\"\n      ) {\n        renderLanguageGate();\n      }\n    } catch {}\n  }\n\n  installLanguages();\n  setTimeout(installLanguages, 250);\n})();\n</script>",
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
</script>` + ADMIN_RELIABILITY_COMPAT_SCRIPT,
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

    const path =
      url.pathname;

    // Serve the version-controlled reliability code while keeping the
    // existing production asset collection unchanged.
    if (path === "/sunday/broadcaster-reliability.js") {
      return new Response(BROADCAST_RELIABILITY_SCRIPT, {
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

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

    const direct =
      await env.ASSETS.fetch(
        request
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
