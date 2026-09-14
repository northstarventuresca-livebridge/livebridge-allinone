(() => {
  "use strict";

  const POLL_MS = 5000;
  let pollTimer = null;
  let lastReferenceKey = "";
  let lastNotesKey = "";
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
    if (document.getElementById("lbLiveNotesStyles")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "lbLiveNotesStyles";
    style.textContent = `
      .lb-live-notes-panel,
      .lb-scripture-panel{
        padding:16px 20px;
        border-top:1px solid rgba(255,255,255,.07);
      }
      .lb-live-notes-panel{
        background:rgba(45,151,255,.045);
      }
      .lb-scripture-panel{
        background:rgba(52,212,189,.045);
      }
      .lb-live-notes-head,
      .lb-scripture-head{
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        flex-wrap:wrap;
        margin-bottom:10px;
      }
      .lb-live-notes-title,
      .lb-scripture-title{
        font-size:14px;
        font-weight:900;
        color:#dce9f5;
      }
      .lb-live-notes-status{
        font-size:10px;
        font-weight:800;
        color:#78b7ff;
      }
      .lb-scripture-status{
        font-size:10px;
        font-weight:800;
        color:#6de8c5;
      }
      .lb-live-notes-copy{
        color:#d6e3ef;
        font-size:13px;
        line-height:1.6;
        white-space:pre-wrap;
      }
      .lb-live-notes-empty,
      .lb-scripture-empty{
        color:#8197ad;
        font-size:11px;
        line-height:1.45;
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

  function ensurePanels() {
    const output =
      document.getElementById(
        "listenerOutput"
      );

    if (!output) {
      return null;
    }

    addStyles();

    let notesPanel =
      document.getElementById(
        "listenerLiveNotesPanel"
      );

    if (!notesPanel) {
      notesPanel =
        document.createElement("div");

      notesPanel.id =
        "listenerLiveNotesPanel";

      notesPanel.className =
        "lb-live-notes-panel notranslate";

      notesPanel.setAttribute(
        "translate",
        "no"
      );

      notesPanel.hidden = true;

      notesPanel.innerHTML = `
        <div class="lb-live-notes-head">
          <div class="lb-live-notes-title">✨ AI Live Notes</div>
          <div id="listenerLiveNotesStatus" class="lb-live-notes-status">Updates automatically</div>
        </div>
        <div id="listenerLiveNotesCopy" class="lb-live-notes-copy">
          <div class="lb-live-notes-empty">Live summary notes will appear here as the message develops.</div>
        </div>
      `;

      output.insertAdjacentElement(
        "afterend",
        notesPanel
      );
    }

    let scripturePanel =
      document.getElementById(
        "listenerScripturePanel"
      );

    if (!scripturePanel) {
      scripturePanel =
        document.createElement("div");

      scripturePanel.id =
        "listenerScripturePanel";

      scripturePanel.className =
        "lb-scripture-panel notranslate";

      scripturePanel.setAttribute(
        "translate",
        "no"
      );

      scripturePanel.hidden = true;

      scripturePanel.innerHTML = `
        <div class="lb-scripture-head">
          <div class="lb-scripture-title">📖 Scripture</div>
          <div id="listenerScriptureStatus" class="lb-scripture-status">Detection active</div>
        </div>
        <div id="listenerScriptureReferences" class="lb-scripture-references">
          <div class="lb-scripture-empty">Detected Scripture references will appear here.</div>
        </div>
        <div id="listenerScriptureVerse" class="lb-scripture-verse" hidden></div>
      `;

      notesPanel.insertAdjacentElement(
        "afterend",
        scripturePanel
      );
    }

    return {
      notesPanel,
      scripturePanel
    };
  }

  function hidePanels() {
    const panels =
      ensurePanels();

    if (!panels) {
      return;
    }

    panels.notesPanel.hidden = true;
    panels.scripturePanel.hidden = true;

    lastNotesKey = "";
    lastReferenceKey = "";
    currentVerseReference = "";
  }

  function renderLiveNotes(data) {
    const panels =
      ensurePanels();

    if (!panels) {
      return;
    }

    panels.notesPanel.hidden = false;

    const status =
      document.getElementById(
        "listenerLiveNotesStatus"
      );

    if (status) {
      status.textContent =
        data?.live
          ? "Updating while live"
          : "Waiting for live message";
    }

    const summary =
      String(
        data?.summary || ""
      ).trim();

    const noteEntries =
      Array.isArray(data?.noteEntries)
        ? data.noteEntries
            .map(value =>
              String(value || "").trim()
            )
            .filter(Boolean)
        : [];

    const displayText =
      summary ||
      noteEntries.join("\n\n");

    const notesKey =
      displayText +
      "|" +
      String(data?.message || "");

    if (notesKey === lastNotesKey) {
      return;
    }

    lastNotesKey = notesKey;

    const container =
      document.getElementById(
        "listenerLiveNotesCopy"
      );

    if (!container) {
      return;
    }

    container.textContent = "";

    if (displayText) {
      container.textContent =
        displayText;
      return;
    }

    const empty =
      document.createElement("div");

    empty.className =
      "lb-live-notes-empty";

    empty.textContent =
      String(
        data?.message ||
        "Live summary notes will appear here as the message develops."
      );

    container.appendChild(empty);
  }

  function renderReferences(data) {
    const panels =
      ensurePanels();

    if (!panels) {
      return;
    }

    if (
      data?.scriptureEnabled !== true
    ) {
      panels.scripturePanel.hidden = true;
      lastReferenceKey = "";
      currentVerseReference = "";
      return;
    }

    panels.scripturePanel.hidden = false;

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
      return;
    }

    lastReferenceKey =
      referenceKey;

    const container =
      document.getElementById(
        "listenerScriptureReferences"
      );

    if (!container) {
      return;
    }

    container.textContent = "";

    if (!references.length) {
      const empty =
        document.createElement("div");

      empty.className =
        "lb-scripture-empty";

      empty.textContent =
        "Detected Scripture references will appear here.";

      container.appendChild(empty);
      return;
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

  async function refreshLiveNotes() {
    const room = getRoom();

    if (!room) {
      hidePanels();
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

      renderLiveNotes(data);
      renderReferences(data);

      return true;

    } catch (error) {
      console.warn(
        "LiveBridge Live Notes refresh failed:",
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

    await refreshLiveNotes();

    pollTimer =
      setInterval(
        refreshLiveNotes,
        POLL_MS
      );
  }

  function scheduleStart() {
    setTimeout(
      startPolling,
      900
    );
  }

  ensurePanels();

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
