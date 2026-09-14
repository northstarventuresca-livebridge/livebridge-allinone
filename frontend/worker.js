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
            `<script>
(() => {
  const BACKEND = "https://livebridge.northstarventures-ca.workers.dev";

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
