(() => {
  "use strict";

  const POLL_MS = 5000;
  let pollTimer = null;
  let lastReferenceKey = "";
  let currentVerseReference = "";

  function getRoom() {
    try {
      if (
        typeof ROOM_ID !== "undefined" &&
        String(ROOM_ID || "").trim()
      ) {
        return String(ROOM_ID)
          .trim()
          .toUpperCase();
      }
    } catch {}

    return String(
      document.getElementById("listenerRoom")?.value ||
      ""
    )
      .trim()
      .toUpperCase();
  }

  function getLanguage() {
    return String(
      document.getElementById("listenerLanguage")?.value ||
      "en|en-US"
    )
      .split("|")[0]
      .trim()
      .toLowerCase() || "en";
  }

  function addStyles() {
    if (document.getElementById("lbScriptureStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "lbScriptureStyles";
    style.textContent = `
      .lb-scripture-panel{
        padding:16px 20px;
        border-top:1px solid rgba(255,255,255,.07);
        background:rgba(52,212,189,.045);
      }
      .lb-scripture-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:10px;
      }
      .lb-scripture-title{
        font-size:14px;
        font-weight:900;
        color:#dce9f5;
      }
      .lb-scripture-status{
        font-size:10px;
        font-weight:800;
        color:#6de8c5;
      }
      .lb-scripture-references{
        display:flex;
        flex-wrap:wrap;
        gap:8px;
      }
      .lb-scripture-reference{
        border:1px solid rgba(52,212,189,.28);
        background:rgba(52,212,189,.08);
        color:#72ead4;
        border-radius:9px;
        padding:8px 10px;
        font-size:12px;
        font-weight:900;
        cursor:pointer;
      }
      .lb-scripture-reference:hover{
        background:rgba(52,212,189,.14);
      }
      .lb-scripture-empty{
        color:#8197ad;
        font-size:11px;
        line-height:1.45;
      }
      .lb-scripture-verse{
        margin-top:12px;
        padding:12px 13px;
        border-radius:11px;
        border:1px solid rgba(255,255,255,.09);
        background:#0b1623;
        color:#d6e3ef;
        font-size:13px;
        line-height:1.55;
      }
      .lb-scripture-verse-reference{
        color:#72ead4;
        font-weight:900;
        margin-bottom:6px;
      }
      .lb-scripture-verse-version{
        color:#71879f;
        font-size:10px;
        margin-top:7px;
      }
    `;

    document.head.appendChild(style);
  }

  function ensurePanel() {
    let panel =
      document.getElementById(
        "listenerScripturePanel"
      );

    if (panel) {
      return panel;
    }

    const output =
      document.getElementById(
        "listenerOutput"
      );

    if (!output) {
      return null;
    }

    addStyles();

    panel =
      document.createElement("div");

    panel.id =
      "listenerScripturePanel";

    panel.className =
      "lb-scripture-panel notranslate";

    panel.setAttribute(
      "translate",
      "no"
    );

    panel.hidden = true;

    panel.innerHTML = `
      <div class="lb-scripture-head">
        <div class="lb-scripture-title">📖 Scripture</div>
        <div id="listenerScriptureStatus" class="lb-scripture-status">Detection active</div>
      </div>
      <div id="listenerScriptureReferences" class="lb-scripture-references">
        <div class="lb-scripture-empty">Detected Scripture references will appear here.</div>
      </div>
      <div id="listenerScriptureVerse" class="lb-scripture-verse" hidden></div>
    `;

    output.insertAdjacentElement(
      "afterend",
      panel
    );

    return panel;
  }

  function hidePanel() {
    const panel =
      ensurePanel();

    if (panel) {
      panel.hidden = true;
    }

    lastReferenceKey = "";
    currentVerseReference = "";
  }

  function renderReferences(data) {
    const panel =
      ensurePanel();

    if (!panel) {
      return false;
    }

    if (
      data?.scriptureEnabled !== true
    ) {
      hidePanel();
      return false;
    }

    panel.hidden = false;

    const status =
      document.getElementById(
        "listenerScriptureStatus"
      );

    if (status) {
      status.textContent =
        data?.live
          ? "Detection active"
          : "Detection enabled";
    }

    const references =
      Array.from(
        new Set(
          (Array.isArray(data?.scriptures)
            ? data.scriptures
            : []
          )
            .map(item =>
              String(
                item?.reference ||
                ""
              ).trim()
            )
            .filter(Boolean)
        )
      );

    const referenceKey =
      references.join("\n");

    if (
      referenceKey ===
      lastReferenceKey
    ) {
      return true;
    }

    lastReferenceKey =
      referenceKey;

    const container =
      document.getElementById(
        "listenerScriptureReferences"
      );

    if (!container) {
      return true;
    }

    container.textContent = "";

    if (!references.length) {
      const empty =
        document.createElement("div");

      empty.className =
        "lb-scripture-empty";

      empty.textContent =
        "Detected Scripture references will appear here.";

      container.appendChild(
        empty
      );

      return true;
    }

    for (
      const reference
      of references
    ) {
      const button =
        document.createElement("button");

      button.type = "button";
      button.className =
        "lb-scripture-reference";
      button.textContent =
        "📖 " + reference;

      button.addEventListener(
        "click",
        () => loadVerse(reference)
      );

      container.appendChild(
        button
      );
    }

    if (
      currentVerseReference &&
      !references.includes(
        currentVerseReference
      )
    ) {
      const verseBox =
        document.getElementById(
          "listenerScriptureVerse"
        );

      if (verseBox) {
        verseBox.hidden = true;
        verseBox.textContent = "";
      }

      currentVerseReference = "";
    }

    return true;
  }

  async function loadVerse(reference) {
    const room = getRoom();
    const language = getLanguage();
    const verseBox =
      document.getElementById(
        "listenerScriptureVerse"
      );

    if (
      !room ||
      !reference ||
      !verseBox
    ) {
      return;
    }

    currentVerseReference =
      reference;

    verseBox.hidden = false;
    verseBox.textContent =
      "Loading " +
      reference +
      "…";

    try {
      const response =
        await fetch(
          WORKER_URL +
          "/scripture-verse?room=" +
          encodeURIComponent(room) +
          "&lang=" +
          encodeURIComponent(language) +
          "&reference=" +
          encodeURIComponent(reference)
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data?.success ||
        !data?.verse?.text
      ) {
        throw new Error(
          data?.error ||
          "Unable to load Scripture."
        );
      }

      if (
        currentVerseReference !==
        reference
      ) {
        return;
      }

      verseBox.textContent = "";

      const referenceElement =
        document.createElement("div");
      referenceElement.className =
        "lb-scripture-verse-reference";
      referenceElement.textContent =
        String(
          data.verse.reference ||
          reference
        );

      const textElement =
        document.createElement("div");
      textElement.textContent =
        String(data.verse.text);

      const versionElement =
        document.createElement("div");
      versionElement.className =
        "lb-scripture-verse-version";
      versionElement.textContent =
        String(
          data.verse.version ||
          ""
        );

      verseBox.appendChild(
        referenceElement
      );
      verseBox.appendChild(
        textElement
      );

      if (
        versionElement.textContent
      ) {
        verseBox.appendChild(
          versionElement
        );
      }

    } catch (error) {
      if (
        currentVerseReference !==
        reference
      ) {
        return;
      }

      verseBox.textContent =
        error?.message ||
        "Unable to load Scripture.";
    }
  }

  async function refreshScripture() {
    const room = getRoom();

    if (!room) {
      hidePanel();
      return false;
    }

    try {
      const response =
        await fetch(
          WORKER_URL +
          "/live-notes?room=" +
          encodeURIComponent(room) +
          "&lang=" +
          encodeURIComponent(
            getLanguage()
          )
        );

      const data =
        await response.json();

      if (!response.ok) {
        return false;
      }

      return renderReferences(
        data
      );

    } catch (error) {
      console.warn(
        "LiveBridge Scripture refresh failed:",
        error
      );
      return false;
    }
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(
        pollTimer
      );
      pollTimer = null;
    }
  }

  async function startPolling() {
    stopPolling();

    const enabled =
      await refreshScripture();

    if (!enabled) {
      return;
    }

    pollTimer =
      setInterval(
        refreshScripture,
        POLL_MS
      );
  }

  function scheduleStart() {
    setTimeout(
      startPolling,
      900
    );
  }

  ensurePanel();

  document.getElementById(
    "joinRoomButton"
  )?.addEventListener(
    "click",
    scheduleStart
  );

  document.getElementById(
    "listenerLanguage"
  )?.addEventListener(
    "change",
    scheduleStart
  );

  window.addEventListener(
    "beforeunload",
    stopPolling
  );

})();
