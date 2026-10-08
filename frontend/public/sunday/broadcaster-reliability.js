/* LiveBridge broadcaster resilience (isolated from broadcast start/stop and no-audio timeout). */
(() => {
  "use strict";
  const CHECK_MS = 2500;
  const SIGNAL_PROBE_MS = 20000;
  const BAD_CONNECTION_GRACE_MS = 9000;
  const SILENCE_WARNING_MS = 60000;
  const MAX_AUTOMATIC_RETRIES = 3;
  const state = {
    active: false, issueSince: 0, attempts: 0, recovering: false,
    silenceAlerted: false, warning: "", lastNetworkMs: null,
    lastProbeAt: 0, probeFailures: 0, probeBusy: false,
    quietSpeechWarning: false, lastVisibleAt: 0, hiddenAt: 0,
    pendingEvents: [], logging: false, eventCooldowns: new Map(),
    sessionKey: "", lastHealthyAt: 0, lastRetryAt: 0
  };

  const el = id => document.getElementById(id);
  const active = () => {
    try {
      return broadcasting === true &&
        !!mediaStream &&
        !!ROOM_ID &&
        (el("broadcastStatus")?.textContent || "").includes("LIVE BROADCASTING");
    } catch { return false; }
  };
  const intentionallyMuted = () => window.__liveBridgeMicMuted === true;
  const micTrack = () => {
    try { return mediaStream?.getAudioTracks?.()[0] || null; } catch { return null; }
  };
  const channelOpen = () => {
    try { return realtimeTranscriptionDc?.readyState === "open"; } catch { return false; }
  };
  const peerHealthy = () => {
    try {
      const pc = realtimeTranscriptionPc;
      return !!pc && channelOpen() &&
        (pc.connectionState === "connected" ||
          ((pc.connectionState === "new" || !pc.connectionState) &&
           ["connected","completed"].includes(pc.iceConnectionState)));
    } catch { return false; }
  };

  const panel = document.createElement("div");
  panel.id = "lbBroadcasterReliability";
  panel.style.cssText = "margin:0 0 14px;padding:11px;border-radius:10px;border:1px solid #34465e;background:#101e30;color:#e3eef9;font-size:12px;line-height:1.55";
  panel.innerHTML = [
    '<div style="font-weight:800;margin-bottom:5px">BROADCAST CONNECTION</div>',
    '<div id="lbNetworkQuality" role="status">⚪ Network: waiting</div>',
    '<div id="lbRealtimeQuality">⚪ Translation audio: waiting</div>',
    '<div id="lbMicHealth">⚪ Microphone: waiting</div>',
    '<div id="lbReliabilityWarning" aria-live="assertive" style="display:none;margin-top:9px;color:#ffd6a3;font-weight:700"></div>',
    '<button type="button" id="lbResumeBroadcastAudio" style="display:none;width:100%;padding:12px;margin-top:9px;border:0;border-radius:8px;color:#081726;background:#ffcd63;font-size:13px;font-weight:800;cursor:pointer">Tap to Resume Audio</button>'
  ].join("");
  const target = el("lbMicQualityPanel") || el("audioCaptureDiagnostic");
  if (target?.parentNode) target.parentNode.insertBefore(panel, target);
  const resumeButton = el("lbResumeBroadcastAudio");

  function line(id, symbol, message) {
    const node = el(id);
    if (node) node.textContent = symbol + " " + message;
  }
  function warn(message, requiresTap = false) {
    const area = el("lbReliabilityWarning");
    if (!area) return;
    state.warning = message;
    area.textContent = message;
    area.style.display = "block";
    if (resumeButton) resumeButton.style.display = requiresTap ? "block" : "none";
  }
  function clearWarning() {
    state.warning = "";
    const area = el("lbReliabilityWarning");
    if (area) area.style.display = "none";
    if (resumeButton) resumeButton.style.display = "none";
  }
  function record(type, detail = "") {
    const now = Date.now();
    const last = state.eventCooldowns.get(type) || 0;
    if (now - last < 60000 || !state.active) return;
    state.eventCooldowns.set(type, now);
    state.pendingEvents.push({room: ROOM_ID, type, detail: String(detail).slice(0, 180)});
    if (state.pendingEvents.length > 20) state.pendingEvents.shift();
    void flushEvents();
  }
  async function flushEvents() {
    if (state.logging || !navigator.onLine || !state.active || !state.pendingEvents.length) return;
    state.logging = true;
    try {
      const token = await getBroadcasterSessionToken();
      if (!token) return;
      while (state.pendingEvents.length && navigator.onLine && state.active) {
        const entry = state.pendingEvents[0];
        if (entry.room !== ROOM_ID) { state.pendingEvents.shift(); continue; }
        const response = await fetch(WORKER_URL + "/broadcast-connection-event", {
          method:"POST",
          headers:{"Content-Type":"application/json","Authorization":"Bearer " + token},
          body:JSON.stringify(entry)
        });
        if (!response.ok) break;
        state.pendingEvents.shift();
      }
    } catch (error) {
      console.warn("LiveBridge reliability event could not be saved:", error);
    } finally { state.logging = false; }
  }
  async function probeBackend() {
    if (state.probeBusy || !state.active || !navigator.onLine) return;
    state.probeBusy = true;
    const start = performance.now();
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timeout = setTimeout(() => controller?.abort(), 8500);
    try {
      const response = await fetch(
        WORKER_URL + "/room-status?room=" + encodeURIComponent(ROOM_ID),
        {cache:"no-store", ...(controller ? {signal:controller.signal} : {})}
      );
      if (!response.ok) throw new Error("HTTP " + response.status);
      state.lastNetworkMs = Math.round(performance.now() - start);
      state.probeFailures = 0;
    } catch {
      state.probeFailures++;
      state.lastNetworkMs = null;
      if (state.probeFailures === 2) record("network_lost", "Backend connection check failed");
    } finally {
      clearTimeout(timeout);
      state.probeBusy = false;
    }
  }

  async function attemptRecovery(manual = false) {
    if (!state.active || state.recovering || !navigator.onLine) return;
    if (!manual && state.attempts >= MAX_AUTOMATIC_RETRIES) {
      warn("Automatic recovery was unsuccessful. Tap to Resume Audio.", true);
      return;
    }
    state.recovering = true;
    state.lastRetryAt = Date.now();
    state.attempts++;
    warn("Restoring the microphone and realtime connection…");
    if (manual) record("manual_resume", "Broadcaster requested audio recovery");
    try {
      if (!active()) return;
      let track = micTrack();
      if (!track || track.readyState !== "live") {
        const selected = el("audioInput")?.value || "";
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: getBroadcasterAudioConstraints(selected)
        });
        if (!active()) { stream.getTracks().forEach(t => t.stop()); return; }
        stopAudioSafetyMonitoring();
        const oldStream = mediaStream;
        mediaStream = stream;
        oldStream?.getTracks?.().forEach(t => t.stop());
        startAudioSafetyMonitoring();
        track = micTrack();
      } else if (audioSafetyContext?.state === "suspended") {
        await audioSafetyContext.resume();
      }
      if (!active() || !track || track.readyState !== "live") throw new Error("Microphone unavailable");
      // This only rebuilds the transcription transport. It never ends/restarts a broadcast room.
      await stopRealtimeTranscription(channelOpen());
      if (!active()) return;
      await startRealtimeTranscription();
      if (!peerHealthy()) throw new Error("Realtime connection has not recovered");
      state.issueSince = 0;
      state.attempts = 0;
      state.lastHealthyAt = Date.now();
      record("recovered", "Mic and realtime session restored without ending broadcast");
      clearWarning();
    } catch (error) {
      console.warn("LiveBridge broadcaster auto recovery failed:", error);
      record("recovery_failed", error?.name || "reconnect failed");
      warn(
        state.attempts >= MAX_AUTOMATIC_RETRIES
          ? "Audio could not reconnect automatically. Tap to Resume Audio."
          : "Audio connection interrupted. Retrying automatically.",
        state.attempts >= MAX_AUTOMATIC_RETRIES
      );
    } finally { state.recovering = false; }
  }

  function beginSession() {
    state.active = true;
    state.sessionKey = ROOM_ID + ":" + String(broadcastStartedAt || Date.now());
    state.issueSince = 0;
    state.attempts = 0;
    state.recovering = false;
    state.silenceAlerted = false;
    state.quietSpeechWarning = false;
    state.probeFailures = 0;
    state.lastNetworkMs = null;
    state.lastProbeAt = 0;
    state.lastHealthyAt = Date.now();
    state.pendingEvents = [];
    state.eventCooldowns.clear();
    clearWarning();
  }
  function endSession() {
    state.active = false;
    state.issueSince = 0;
    state.attempts = 0;
    state.pendingEvents = [];
    clearWarning();
    line("lbNetworkQuality", "⚪", "Network: waiting for broadcast");
    line("lbRealtimeQuality", "⚪", "Translation audio: waiting");
    line("lbMicHealth", "⚪", "Microphone: waiting");
  }

  function tick() {
    const live = active();
    if (!live) {
      if (state.active) endSession();
      return;
    }
    if (!state.active) beginSession();
    const now = Date.now();
    const muted = intentionallyMuted();
    const track = micTrack();
    const networkFailed = navigator.onLine === false || state.probeFailures >= 2;
    const networkSlow = state.lastNetworkMs !== null && state.lastNetworkMs > 1200;

    if (now - state.lastProbeAt >= SIGNAL_PROBE_MS) {
      state.lastProbeAt = now;
      void probeBackend();
    }
    if (navigator.onLine === false) {
      line("lbNetworkQuality", "🔴", "Network: offline");
    } else if (networkFailed) {
      line("lbNetworkQuality", "🔴", "Network: unable to reach server");
    } else if (networkSlow) {
      line("lbNetworkQuality", "🟡", "Network: unstable (" + state.lastNetworkMs + " ms)");
      if (state.lastNetworkMs > 2000) record("network_degraded", "Server roundtrip " + state.lastNetworkMs + " ms");
    } else {
      line("lbNetworkQuality", "🟢", "Network: good" +
        (state.lastNetworkMs !== null ? " (" + state.lastNetworkMs + " ms)" : ""));
    }

    const badTrack = !track || track.readyState !== "live";
    const suspendedAudio = !muted && audioSafetyContext?.state === "suspended";
    line("lbMicHealth", badTrack ? "🔴" : suspendedAudio ? "🟡" : "🟢",
      badTrack ? "Microphone: disconnected" :
      muted ? "Microphone: intentionally muted" :
      suspendedAudio ? "Microphone: processing suspended" : "Microphone: active");

    const goodPeer = peerHealthy();
    line("lbRealtimeQuality",
      goodPeer && !networkFailed ? "🟢" : goodPeer ? "🟡" : "🔴",
      goodPeer ? "Translation audio: connected" : "Translation audio: disconnected");

    if (badTrack || suspendedAudio || !goodPeer || networkFailed) {
      if (!state.issueSince) {
        state.issueSince = now;
        if (badTrack) record("microphone_ended", "Microphone track ended unexpectedly");
        else if (suspendedAudio) record("microphone_suspended", "AudioContext suspended");
        else if (networkFailed) record("network_lost", "Network connection interrupted");
        else record("realtime_disconnected", "Realtime peer/data channel unavailable");
      }
      const elapsed = now - state.issueSince;
      if (elapsed >= BAD_CONNECTION_GRACE_MS) {
        if (!state.recovering && !networkFailed &&
            now - state.lastRetryAt >= Math.min(30000, state.attempts * 6000 + 2500)) {
          void attemptRecovery();
        } else if (networkFailed) {
          warn("Network disconnected. Audio will recover when the connection returns.");
        }
      }
    } else {
      if (state.issueSince) {
        state.issueSince = 0;
        state.attempts = 0;
        record("recovered", "Connection restored");
        clearWarning();
      }
      state.lastHealthyAt = now;
    }

    if (!muted && !badTrack && !suspendedAudio && !state.silenceAlerted &&
        lastMeaningfulAudioAt && now - lastMeaningfulAudioAt >= SILENCE_WARNING_MS) {
      state.silenceAlerted = true;
      record("audio_silence", "No microphone audio above activity threshold for 60 seconds");
      if (!state.warning) warn("No audio detected for 60 seconds. Check your microphone or sound source.");
    }
    if (lastMeaningfulAudioAt && now - lastMeaningfulAudioAt < 3500) {
      state.silenceAlerted = false;
      if (state.warning.includes("No audio detected")) clearWarning();
    }

    if (state.pendingEvents.length && navigator.onLine) void flushEvents();
  }

  resumeButton?.addEventListener("click", () => {
    state.attempts = 0;
    void attemptRecovery(true);
  });
  window.addEventListener("online", () => {
    state.probeFailures = 0;
    state.lastProbeAt = 0;
    if (state.active) void attemptRecovery();
  });
  window.addEventListener("offline", () => {
    if (state.active) record("network_lost", "Browser reported offline");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (state.active) state.hiddenAt = Date.now();
    } else {
      if (state.active && state.hiddenAt &&
          Date.now() - state.hiddenAt > 8000) {
        record("page_suspended", "Browser was in background");
        state.lastProbeAt = 0;
        if (!peerHealthy() || micTrack()?.readyState !== "live")
          void attemptRecovery();
      }
      state.hiddenAt = 0;
    }
  });

  setInterval(tick, CHECK_MS);
  tick();
})();
