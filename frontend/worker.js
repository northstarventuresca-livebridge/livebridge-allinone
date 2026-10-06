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
