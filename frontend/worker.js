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
