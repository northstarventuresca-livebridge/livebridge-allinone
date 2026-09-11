from pathlib import Path

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

path = Path("frontend/public/t/index.html")
text = path.read_text(encoding="utf-8")

listener_css = r'''  .lb-live-pill-button{
    border:1px solid rgba(255,255,255,.11);
    background:rgba(255,255,255,.06);
    border-radius:9px;
    padding:7px 10px;
    font-size:12px;
    color:#b9c8d9;
    cursor:pointer;
    font-family:inherit;
  }

  .lb-live-pill-button:hover{
    background:rgba(45,151,255,.12);
    border-color:rgba(45,151,255,.30);
    color:white;
  }

  .lb-listener-chat-panel{
    display:none;
    padding:14px 16px 16px;
    border-bottom:1px solid rgba(255,255,255,.07);
    background:#0b1623;
  }

  .lb-listener-chat-panel.show{
    display:block;
  }

  .lb-listener-chat-head{
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    gap:12px;
    margin-bottom:10px;
  }

  .lb-listener-chat-title{
    font-size:14px;
    font-weight:900;
  }

  .lb-listener-chat-subtitle{
    color:#8197ad;
    font-size:10px;
    margin-top:3px;
  }

  .lb-listener-name-button{
    border:1px solid rgba(52,212,189,.25);
    background:rgba(52,212,189,.08);
    color:#72ead4;
    border-radius:9px;
    padding:7px 10px;
    font-size:11px;
    font-weight:900;
    cursor:pointer;
  }

  .lb-listener-chat-messages{
    min-height:90px;
    max-height:220px;
    overflow-y:auto;
    padding:10px;
    border:1px solid rgba(255,255,255,.07);
    border-radius:10px;
    background:#08131f;
    margin-bottom:9px;
  }

  .lb-listener-chat-empty{
    color:#71879f;
    font-size:11px;
    padding:14px 4px;
    text-align:center;
  }

  .lb-listener-chat-message{
    margin-bottom:9px;
    font-size:12px;
    line-height:1.45;
    color:#d6e3ef;
  }

  .lb-listener-chat-message:last-child{
    margin-bottom:0;
  }

  .lb-listener-chat-message strong{
    color:#6de8c5;
  }

  .lb-listener-chat-row{
    display:grid;
    grid-template-columns:1fr auto;
    gap:8px;
  }

  .lb-listener-chat-input{
    min-width:0;
    padding:10px 11px;
    border-radius:9px;
    border:1px solid rgba(255,255,255,.11);
    background:#101d2d;
    color:white;
    font-size:13px;
  }

  .lb-listener-chat-send{
    border:0;
    border-radius:9px;
    padding:10px 14px;
    background:linear-gradient(135deg,#2588ff,#6f43df);
    color:white;
    font-weight:900;
    cursor:pointer;
  }

  .lb-listener-profile-link{
    display:inline-block;
    margin-top:10px;
    padding:0;
    border:0;
    background:transparent;
    color:#71879f;
    font-size:10px;
    text-decoration:underline;
    cursor:pointer;
  }

  .lb-listener-profile-status{
    color:#7fa0bd;
    font-size:10px;
    margin-top:6px;
  }

  .lb-listener-data{
    display:none;
    margin-left:8px;
    color:#6de8c5;
    font-size:11px;
    font-weight:800;
    white-space:nowrap;
  }

'''

text = replace_once(
    text,
    '''  .lb-live-output {''',
    listener_css + '''  .lb-live-output {''',
    "listener chat CSS"
)

old_meta = '''              <div class="lb-live-meta">
                <span class="lb-live-pill" id="listenerRoomLabel">Room: —</span>
                <span class="lb-live-pill" id="listenerLangLabel">Language: —</span>
                <span class="lb-live-pill" id="listenerCountLabel">👥 0 Viewers</span>
              </div>
            </div>
            <div class="lb-live-output" id="listenerOutput">'''

new_meta = '''              <div class="lb-live-meta">
                <span class="lb-live-pill" id="listenerRoomLabel">👥 Room: 0</span>
                <span class="lb-live-pill" id="listenerLangLabel">🌐 Languages: 0</span>
                <button
                  type="button"
                  class="lb-live-pill-button"
                  id="listenerCountLabel"
                >💬 With You: 0</button>
              </div>
            </div>

            <div
              id="listenerChatPanel"
              class="lb-listener-chat-panel"
            >
              <div class="lb-listener-chat-head">
                <div>
                  <div class="lb-listener-chat-title">
                    Listening with you
                  </div>
                  <div
                    id="listenerChatLanguageNote"
                    class="lb-listener-chat-subtitle"
                  >
                    Chat with people listening in your language.
                  </div>
                </div>

                <button
                  type="button"
                  id="listenerNameButton"
                  class="lb-listener-name-button"
                >
                  Listener
                </button>
              </div>

              <div
                id="listenerChatMessages"
                class="lb-listener-chat-messages"
              >
                <div class="lb-listener-chat-empty">
                  No messages yet.
                </div>
              </div>

              <div class="lb-listener-chat-row">
                <input
                  id="listenerChatInput"
                  class="lb-listener-chat-input"
                  type="text"
                  maxlength="500"
                  autocomplete="off"
                  placeholder="Type a message..."
                >
                <button
                  type="button"
                  id="listenerChatSend"
                  class="lb-listener-chat-send"
                >
                  Send
                </button>
              </div>

              <button
                type="button"
                id="listenerSaveProfile"
                class="lb-listener-profile-link"
              >
                Save my name &amp; language
              </button>

              <div
                id="listenerProfileStatus"
                class="lb-listener-profile-status"
              ></div>
            </div>

            <div class="lb-live-output" id="listenerOutput">'''

text = replace_once(
    text,
    old_meta,
    new_meta,
    "listener stats/chat HTML"
)

text = replace_once(
    text,
    '''              <div>
                🎧 Translated Audio &nbsp; • &nbsp; 💬 Live Captions
              </div>''',
    '''              <div>
                🎧 Translated Audio &nbsp; • &nbsp; 💬 Live Captions
                <span
                  id="listenerDataUsage"
                  class="lb-listener-data"
                >Data this visit: 0 KB</span>
              </div>''',
    "listener data footer"
)

listener_state = r'''  let anonymousVisitorFallbackId = "";
  let listenerCurrentName = "";
  let listenerAssignedName = "";
  let listenerChatOpen = false;
  let listenerDataCounterEnabled = false;
  let listenerDataBytes = 0;
  let listenerDataBaselineCaptured = false;

  try {
    listenerCurrentName =
      String(
        localStorage.getItem(
          "livebridgeListenerNickname"
        ) || ""
      )
      .trim()
      .slice(0, 40);
  } catch {}

  const listenerNativeFetch =
    window.fetch.bind(
      window
    );

  function formatListenerDataBytes(bytes) {
    const value =
      Math.max(
        0,
        Number(bytes || 0)
      );

    if (value < 1024) {
      return (
        Math.round(value) +
        " B"
      );
    }

    if (value < 1024 * 1024) {
      return (
        Math.round(
          value / 1024 * 10
        ) / 10 +
        " KB"
      );
    }

    return (
      Math.round(
        value /
        (1024 * 1024) *
        10
      ) / 10 +
      " MB"
    );
  }

  function updateListenerDataDisplay() {
    const element =
      document.getElementById(
        "listenerDataUsage"
      );

    if (!element) {
      return;
    }

    element.style.display =
      listenerDataCounterEnabled
        ? "inline"
        : "none";

    if (listenerDataCounterEnabled) {
      element.textContent =
        "Data this visit: " +
        formatListenerDataBytes(
          listenerDataBytes
        );
    }
  }

  function addListenerDataBytes(bytes) {
    if (!listenerDataCounterEnabled) {
      return;
    }

    const amount =
      Number(bytes || 0);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return;
    }

    listenerDataBytes += amount;
    updateListenerDataDisplay();
  }

  function captureInitialListenerTransfer() {
    if (
      listenerDataBaselineCaptured ||
      !listenerDataCounterEnabled
    ) {
      return;
    }

    listenerDataBaselineCaptured =
      true;

    let total = 0;

    try {
      const navigation =
        performance.getEntriesByType(
          "navigation"
        )[0];

      total +=
        Number(
          navigation?.transferSize ||
          navigation?.encodedBodySize ||
          0
        );

      for (
        const entry of
        performance.getEntriesByType(
          "resource"
        )
      ) {
        total +=
          Number(
            entry.transferSize ||
            entry.encodedBodySize ||
            0
          );
      }
    } catch {}

    addListenerDataBytes(total);
  }

  function setListenerDataCounterEnabled(enabled) {
    listenerDataCounterEnabled =
      enabled === true;

    if (listenerDataCounterEnabled) {
      captureInitialListenerTransfer();
    }

    updateListenerDataDisplay();
  }

  window.fetch =
    async function(...args) {
      const response =
        await listenerNativeFetch(
          ...args
        );

      if (listenerDataCounterEnabled) {
        try {
          const requestValue =
            args[0];

          const requestUrl =
            typeof requestValue === "string"
              ? requestValue
              : String(
                  requestValue?.url ||
                  ""
                );

          if (
            requestUrl.includes(
              "livebridge.northstarventures-ca.workers.dev"
            )
          ) {
            const options =
              args[1] || {};

            if (
              typeof options.body ===
              "string"
            ) {
              addListenerDataBytes(
                new TextEncoder()
                  .encode(
                    options.body
                  )
                  .byteLength
              );
            }

            const clone =
              response.clone();

            clone
              .arrayBuffer()
              .then(
                buffer =>
                  addListenerDataBytes(
                    buffer.byteLength
                  )
              )
              .catch(() => {});
          }
        } catch {}
      }

      return response;
    };

  function updateListenerNameUI() {
    const button =
      document.getElementById(
        "listenerNameButton"
      );

    if (!button) {
      return;
    }

    button.textContent =
      listenerCurrentName ||
      listenerAssignedName ||
      "Listener";
  }

  function getListenerChatName() {
    return (
      listenerCurrentName ||
      listenerAssignedName ||
      "Listener"
    );
  }

  function setListenerNickname(value) {
    const cleaned =
      String(value || "")
        .trim()
        .replace(
          /[\r\n\t]+/g,
          " "
        )
        .slice(0, 40);

    listenerCurrentName =
      cleaned;

    try {
      if (cleaned) {
        localStorage.setItem(
          "livebridgeListenerNickname",
          cleaned
        );
      } else {
        localStorage.removeItem(
          "livebridgeListenerNickname"
        );
      }
    } catch {}

    updateListenerNameUI();
  }

  function appendListenerChatMessage(message) {
    const box =
      document.getElementById(
        "listenerChatMessages"
      );

    if (!box) {
      return;
    }

    const empty =
      box.querySelector(
        ".lb-listener-chat-empty"
      );

    if (empty) {
      empty.remove();
    }

    const row =
      document.createElement(
        "div"
      );

    row.className =
      "lb-listener-chat-message";

    const name =
      document.createElement(
        "strong"
      );

    name.textContent =
      String(
        message?.name ||
        "Listener"
      );

    row.appendChild(name);

    row.appendChild(
      document.createTextNode(
        ": " +
        String(
          message?.text ||
          ""
        )
      )
    );

    box.appendChild(row);

    while (
      box.children.length > 100
    ) {
      box.removeChild(
        box.firstChild
      );
    }

    box.scrollTop =
      box.scrollHeight;
  }

  function handleListenerPresence(data) {
    const roomCount =
      Math.max(
        0,
        Number(
          data?.roomCount ||
          0
        )
      );

    const languageCount =
      Math.max(
        0,
        Number(
          data?.languageCount ||
          0
        )
      );

    const sameLanguageCount =
      Math.max(
        0,
        Number(
          data?.sameLanguageCount ||
          0
        )
      );

    const others =
      Math.max(
        0,
        sameLanguageCount - 1
      );

    const roomLabel =
      document.getElementById(
        "listenerRoomLabel"
      );

    const languageLabel =
      document.getElementById(
        "listenerLangLabel"
      );

    const withYou =
      document.getElementById(
        "listenerCountLabel"
      );

    if (roomLabel) {
      roomLabel.textContent =
        "👥 Room: " +
        roomCount;
    }

    if (languageLabel) {
      languageLabel.textContent =
        "🌐 Languages: " +
        languageCount;
    }

    if (withYou) {
      withYou.textContent =
        "💬 With You: " +
        others;
    }
  }

  function toggleListenerChat() {
    const panel =
      document.getElementById(
        "listenerChatPanel"
      );

    if (!panel) {
      return;
    }

    listenerChatOpen =
      !listenerChatOpen;

    panel.classList.toggle(
      "show",
      listenerChatOpen
    );

    if (listenerChatOpen) {
      document.getElementById(
        "listenerChatInput"
      )?.focus();

      if (
        listenerSocket &&
        listenerSocket.readyState ===
          WebSocket.OPEN
      ) {
        listenerSocket.send(
          JSON.stringify({
            type:
              "presence-request"
          })
        );
      }
    }
  }

  function sendListenerChatMessage() {
    const input =
      document.getElementById(
        "listenerChatInput"
      );

    if (!input) {
      return;
    }

    const messageText =
      input.value
        .trim()
        .slice(0, 500);

    if (!messageText) {
      return;
    }

    if (
      !listenerSocket ||
      listenerSocket.readyState !==
        WebSocket.OPEN
    ) {
      alert(
        "Join the live room before sending a message."
      );
      return;
    }

    listenerSocket.send(
      JSON.stringify({
        type:
          "chat",
        name:
          getListenerChatName(),
        text:
          messageText
      })
    );

    input.value = "";
    input.focus();
  }

  function editListenerName() {
    const value =
      window.prompt(
        "Your listener name",
        getListenerChatName()
      );

    if (value === null) {
      return;
    }

    setListenerNickname(value);
  }

  let listenerClerkLoadingPromise =
    null;

  async function loadListenerClerk() {
    if (
      window.Clerk &&
      typeof window.Clerk.load ===
        "function"
    ) {
      await window.Clerk.load();
      return window.Clerk;
    }

    if (listenerClerkLoadingPromise) {
      return listenerClerkLoadingPromise;
    }

    listenerClerkLoadingPromise =
      new Promise(
        (resolve, reject) => {
          const script =
            document.createElement(
              "script"
            );

          script.async = true;
          script.crossOrigin =
            "anonymous";

          script.setAttribute(
            "data-clerk-publishable-key",
            "pk_test_c3RhYmxlLXN3aW5lLTY1NTQuY2xlcmsuYWNjb3VudHMuZGV2JA"
          );

          script.src =
            "https://stable-swine-6554.clerk.accounts.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js";

          script.onload =
            async () => {
              try {
                await window.Clerk.load();
                resolve(window.Clerk);
              } catch (error) {
                reject(error);
              }
            };

          script.onerror =
            () =>
              reject(
                new Error(
                  "Unable to load listener sign-in."
                )
              );

          document.head.appendChild(
            script
          );
        }
      );

    return listenerClerkLoadingPromise;
  }

  function getActiveListenerClerkSession() {
    const clerk =
      window.Clerk;

    if (!clerk) {
      return null;
    }

    const sessions =
      clerk.client?.sessions ||
      clerk.client?.signedInSessions ||
      [];

    return (
      clerk.session ||
      sessions.find(
        item =>
          item.status ===
          "active"
      ) ||
      sessions[0] ||
      null
    );
  }

  async function ensureListenerSignedIn() {
    const clerk =
      await loadListenerClerk();

    const current =
      getActiveListenerClerkSession();

    if (current) {
      return current;
    }

    return new Promise(
      resolve => {
        const overlay =
          document.createElement(
            "div"
          );

        overlay.style.cssText = `
          position:fixed;
          inset:0;
          z-index:999999;
          background:rgba(2,8,18,.86);
          display:flex;
          align-items:center;
          justify-content:center;
          padding:20px;
        `;

        overlay.innerHTML = `
          <div style="
            width:100%;
            max-width:460px;
            background:#101d2d;
            border:1px solid rgba(255,255,255,.13);
            border-radius:18px;
            padding:20px;
            position:relative;
          ">
            <button
              id="lbListenerAccountClose"
              type="button"
              style="
                position:absolute;
                right:12px;
                top:12px;
                width:32px;
                height:32px;
                border:0;
                border-radius:8px;
                background:#17283d;
                color:white;
                cursor:pointer;
              "
            >×</button>

            <div style="
              font-size:21px;
              font-weight:900;
              margin:4px 42px 5px 0;
            ">
              Save your LiveBridge preferences
            </div>

            <div style="
              color:#8ea4ba;
              font-size:12px;
              margin-bottom:15px;
            ">
              Optional. Sign in once to save your listener name and preferred language.
            </div>

            <div id="lbListenerSignInMount"></div>
          </div>
        `;

        document.body.appendChild(
          overlay
        );

        let finished = false;

        const finish =
          value => {
            if (finished) {
              return;
            }

            finished = true;
            overlay.remove();
            resolve(value);
          };

        overlay.querySelector(
          "#lbListenerAccountClose"
        ).onclick =
          () => finish(null);

        clerk.mountSignIn(
          overlay.querySelector(
            "#lbListenerSignInMount"
          ),
          {
            routing:
              "virtual",
            appearance: {
              variables: {
                colorPrimary:
                  "#2d97ff"
              }
            }
          }
        );

        clerk.addListener(
          () => {
            const active =
              getActiveListenerClerkSession();

            if (active) {
              finish(active);
            }
          }
        );
      }
    );
  }

  async function listenerProfileFetch(
    path,
    options = {}
  ) {
    const session =
      getActiveListenerClerkSession();

    if (!session) {
      throw new Error(
        "Listener sign-in required."
      );
    }

    const token =
      await session.getToken();

    return listenerNativeFetch(
      WORKER_URL + path,
      {
        ...options,
        headers: {
          ...(options.headers || {}),
          "Authorization":
            "Bearer " +
            token,
          ...(options.body
            ? {
                "Content-Type":
                  "application/json"
              }
            : {})
        }
      }
    );
  }

  async function saveListenerProfile() {
    const status =
      document.getElementById(
        "listenerProfileStatus"
      );

    if (status) {
      status.textContent =
        "Opening optional sign-in...";
    }

    try {
      const session =
        await ensureListenerSignedIn();

      if (!session) {
        if (status) {
          status.textContent = "";
        }
        return;
      }

      if (!listenerCurrentName) {
        setListenerNickname(
          getListenerChatName()
        );
      }

      const preferredLanguage =
        document.getElementById(
          "listenerLanguage"
        )?.value ||
        "";

      const response =
        await listenerProfileFetch(
          "/listener-profile",
          {
            method:
              "POST",
            body:
              JSON.stringify({
                displayName:
                  getListenerChatName(),
                preferredLanguage
              })
          }
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success
      ) {
        throw new Error(
          data.error ||
          "Unable to save preferences."
        );
      }

      try {
        localStorage.setItem(
          "livebridgeListenerAccount",
          "1"
        );

        localStorage.setItem(
          "livebridgeListenerPreferredLanguage",
          preferredLanguage
        );
      } catch {}

      if (status) {
        status.textContent =
          "✓ Name and language saved.";
      }

    } catch (error) {
      if (status) {
        status.textContent =
          error.message ||
          "Unable to save preferences.";
      }
    }
  }

  async function restoreListenerProfileIfRemembered() {
    let remembered = false;
    let localPreferred = "";

    try {
      remembered =
        localStorage.getItem(
          "livebridgeListenerAccount"
        ) === "1";

      localPreferred =
        String(
          localStorage.getItem(
            "livebridgeListenerPreferredLanguage"
          ) || ""
        );
    } catch {}

    const select =
      document.getElementById(
        "listenerLanguage"
      );

    if (
      remembered &&
      select &&
      localPreferred &&
      Array.from(
        select.options
      ).some(
        option =>
          option.value ===
          localPreferred
      )
    ) {
      select.value =
        localPreferred;
    }

    if (!remembered) {
      return;
    }

    try {
      await loadListenerClerk();

      if (
        !getActiveListenerClerkSession()
      ) {
        return;
      }

      const response =
        await listenerProfileFetch(
          "/listener-profile"
        );

      const data =
        await response.json();

      if (
        !response.ok ||
        !data.success ||
        !data.profile
      ) {
        return;
      }

      if (
        data.profile.displayName
      ) {
        setListenerNickname(
          data.profile.displayName
        );
      }

      const preferred =
        String(
          data.profile
            .preferredLanguage ||
          ""
        );

      if (
        select &&
        preferred &&
        Array.from(
          select.options
        ).some(
          option =>
            option.value ===
            preferred
        )
      ) {
        select.value =
          preferred;
      }

    } catch (error) {
      console.error(
        "Listener profile restore failed:",
        error
      );
    }
  }

  let listenerVoiceGender = "male";'''

text = replace_once(
    text,
    '''  let anonymousVisitorFallbackId = "";
  let listenerVoiceGender = "male";''',
    listener_state,
    "listener state/helpers"
)

text = replace_once(
    text,
    '''  joinButton.addEventListener(
    "click",
    joinLiveRoom
  );''',
    '''  document.getElementById(
    "listenerCountLabel"
  )?.addEventListener(
    "click",
    toggleListenerChat
  );

  document.getElementById(
    "listenerNameButton"
  )?.addEventListener(
    "click",
    editListenerName
  );

  document.getElementById(
    "listenerChatSend"
  )?.addEventListener(
    "click",
    sendListenerChatMessage
  );

  document.getElementById(
    "listenerChatInput"
  )?.addEventListener(
    "keydown",
    event => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        sendListenerChatMessage();
      }
    }
  );

  document.getElementById(
    "listenerSaveProfile"
  )?.addEventListener(
    "click",
    saveListenerProfile
  );

  updateListenerNameUI();

  joinButton.addEventListener(
    "click",
    joinLiveRoom
  );''',
    "listener chat events"
)

text = replace_once(
    text,
    '''    document.getElementById(
      "listenerRoomLabel"
    ).textContent =
      "Room: " + ROOM_ID;

    document.getElementById(
      "listenerLangLabel"
    ).textContent =
      "Language: " + languageName;''',
    '''    document.getElementById(
      "listenerRoomLabel"
    ).textContent =
      "👥 Room: 0";

    document.getElementById(
      "listenerLangLabel"
    ).textContent =
      "🌐 Languages: 0";

    document.getElementById(
      "listenerCountLabel"
    ).textContent =
      "💬 With You: 0";

    const chatLanguageNote =
      document.getElementById(
        "listenerChatLanguageNote"
      );

    if (chatLanguageNote) {
      chatLanguageNote.textContent =
        "Chat with people listening in " +
        languageName +
        ".";
    }''',
    "listener live count labels"
)

text = replace_once(
    text,
    '''    const access =
      await checkLiveBridgeRoomAccess(
        ROOM_ID
      );

    if (!access.allowed) {''',
    '''    const access =
      await checkLiveBridgeRoomAccess(
        ROOM_ID
      );

    setListenerDataCounterEnabled(
      access.data
        ?.listenerDataDisplayEnabled ===
        true
    );

    if (!access.allowed) {''',
    "listener admin data flag"
)

text = replace_once(
    text,
    '''      "&listenerId=" +
      encodeURIComponent(listenerSessionId);''',
    '''      "&listenerId=" +
      encodeURIComponent(listenerSessionId) +
      "&name=" +
      encodeURIComponent(
        getListenerChatName() ===
          "Listener"
          ? ""
          : getListenerChatName()
      );''',
    "listener websocket name"
)

text = replace_once(
    text,
    '''          const data =
            JSON.parse(event.data);''',
    '''          if (
            typeof event.data ===
            "string"
          ) {
            addListenerDataBytes(
              new TextEncoder()
                .encode(
                  event.data
                )
                .byteLength
            );
          } else {
            addListenerDataBytes(
              Number(
                event.data
                  ?.byteLength ||
                event.data
                  ?.size ||
                0
              )
            );
          }

          const data =
            JSON.parse(event.data);''',
    "websocket byte counter"
)

connected_old = '''          if (data.type === "connected") {

            listenerReconnectInProgress = false;
            listenerReconnectAttempts = 0;

            document.getElementById(
              "listenerStatus"
            ).textContent =
              "Connected — Waiting for Live Feed";

            document.getElementById(
              "listenerDot"
            ).classList.add("live");

            return;
          }

          if (
            data.type !== "translation" ||
            !data.text
          ) {
            return;
          }'''

connected_new = '''          if (data.type === "connected") {

            listenerReconnectInProgress = false;
            listenerReconnectAttempts = 0;

            if (data.assignedName) {
              listenerAssignedName =
                String(
                  data.assignedName
                )
                .trim()
                .slice(0, 40);

              updateListenerNameUI();
            }

            document.getElementById(
              "listenerStatus"
            ).textContent =
              "Connected — Waiting for Live Feed";

            document.getElementById(
              "listenerDot"
            ).classList.add("live");

            try {
              thisSocket.send(
                JSON.stringify({
                  type:
                    "presence-request"
                })
              );
            } catch {}

            return;
          }

          if (
            data.type ===
            "presence"
          ) {
            handleListenerPresence(
              data
            );
            return;
          }

          if (
            data.type ===
            "chat"
          ) {
            appendListenerChatMessage(
              data
            );
            return;
          }

          if (
            data.type !== "translation" ||
            !data.text
          ) {
            return;
          }'''

text = replace_once(
    text,
    connected_old,
    connected_new,
    "presence/chat message handling"
)

text = replace_once(
    text,
    '''  loadRoomFromURL();
  applyListenerFontSize();
</script>''',
    '''  loadRoomFromURL();
  applyListenerFontSize();
  restoreListenerProfileIfRemembered();
</script>''',
    "restore optional listener profile"
)

text = replace_once(
    text,
    '''if(rl){ const val=rl.textContent.split(":").slice(1).join(":").trim()||"—"; rl.textContent=x.roomPrefix+": "+val; }''',
    '''if(rl){ const n=(rl.textContent.match(/\d+/)||["0"])[0]; rl.textContent="👥 Room: "+n; }''',
    "localization room count"
)

text = replace_once(
    text,
    '''if(ll){ const val=ll.textContent.split(":").slice(1).join(":").trim()||"—"; ll.textContent=x.languagePrefix+": "+val; }''',
    '''if(ll){ const n=(ll.textContent.match(/\d+/)||["0"])[0]; ll.textContent="🌐 Languages: "+n; }''',
    "localization language count"
)

text = replace_once(
    text,
    '''if(vl){ const n=(vl.textContent.match(/\d+/)||["0"])[0]; vl.textContent="👥 "+n+" "+x.viewers; }''',
    '''if(vl){ const n=(vl.textContent.match(/\d+/)||["0"])[0]; vl.textContent="💬 With You: "+n; }''',
    "localization with-you count"
)

path.write_text(text, encoding="utf-8")
print("listener patched")
