from pathlib import Path
import re

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)

def regex_once(text, pattern, repl, label):
    new_text, count = re.subn(pattern, repl, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return new_text

path = Path("backend/worker.js")
text = path.read_text(encoding="utf-8")

text = replace_once(
    text,
    '''  "prioritySupport",
  "customOnboarding"
];''',
    '''  "prioritySupport",
  "customOnboarding",
  "listenerDataDisplay"
];''',
    "feature override key"
)

listener_profile_schema = r'''
let listenerProfileSchemaReady = false;

async function ensureListenerProfileSchema(env) {
  if (listenerProfileSchemaReady) {
    return;
  }

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS listener_profiles (
      clerk_user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL DEFAULT '',
      preferred_language TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  listenerProfileSchemaReady = true;
}
__name(
  ensureListenerProfileSchema,
  "ensureListenerProfileSchema"
);

'''

text = replace_once(
    text,
    '''__name(ensureReturnVisitorSchema, "ensureReturnVisitorSchema");

async function trackAnonymousOrganizationVisitor(''',
    '''__name(ensureReturnVisitorSchema, "ensureReturnVisitorSchema");
''' + listener_profile_schema + '''async function trackAnonymousOrganizationVisitor(''',
    "listener profile schema"
)

do_helpers = r'''    this.inFlightTranslations = /* @__PURE__ */ new Map();
    this.inFlightLiveNotes = /* @__PURE__ */ new Map();
    this.azureTtsGenerationPromise = null;
  }

  getSocketLanguage(socket) {
    const tags =
      this.state.getTags(socket);

    const tag =
      tags.find(
        value =>
          value.startsWith("lang:")
      );

    return tag
      ? tag.substring(5).toLowerCase()
      : "";
  }

  getSocketListenerId(socket) {
    const tags =
      this.state.getTags(socket);

    const tag =
      tags.find(
        value =>
          value.startsWith("listener:")
      );

    return tag
      ? tag.substring(9)
      : "";
  }

  async broadcastPresence(excludeSocket = null) {
    const sockets =
      this.state
        .getWebSockets()
        .filter(
          socket =>
            socket !== excludeSocket
        );

    const languageCounts = {};

    for (const socket of sockets) {
      const language =
        this.getSocketLanguage(socket);

      if (!language) {
        continue;
      }

      languageCounts[language] =
        Number(
          languageCounts[language] || 0
        ) + 1;
    }

    const languageCount =
      Object.keys(
        languageCounts
      ).length;

    for (const socket of sockets) {
      try {
        const language =
          this.getSocketLanguage(socket);

        socket.send(
          JSON.stringify({
            type:
              "presence",
            roomCount:
              sockets.length,
            languageCount,
            sameLanguageCount:
              Number(
                languageCounts[language] ||
                0
              )
          })
        );
      } catch (error) {
        console.error(
          "Presence update failed:",
          error
        );
      }
    }
  }

  async fetch(request) {'''

text = replace_once(
    text,
    '''    this.inFlightTranslations = /* @__PURE__ */ new Map();
    this.inFlightLiveNotes = /* @__PURE__ */ new Map();
    this.azureTtsGenerationPromise = null;
  }
  async fetch(request) {''',
    do_helpers,
    "durable object presence helpers"
)

text = replace_once(
    text,
    '''      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];''',
    r'''      const requestedName =
        String(
          url.searchParams.get("name") ||
          ""
        )
        .trim()
        .replace(/[\r\n\t]+/g, " ")
        .slice(0, 40);

      let assignedName =
        requestedName;

      if (!assignedName) {
        const sequence =
          Number(
            await this.state.storage.get(
              "listener-name-sequence"
            ) || 0
          ) + 1;

        await this.state.storage.put(
          "listener-name-sequence",
          sequence
        );

        assignedName =
          "Listener " +
          sequence;
      }

      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];''',
    "listener assigned name"
)

text = replace_once(
    text,
    '''      server.send(
        JSON.stringify({
          type: "connected",
          language,
          listenerId,
          message: "Connected to LiveBridge room."
        })
      );

      return new Response(null, {''',
    '''      server.send(
        JSON.stringify({
          type: "connected",
          language,
          listenerId,
          assignedName,
          message: "Connected to LiveBridge room."
        })
      );

      await this.broadcastPresence();

      return new Response(null, {''',
    "connected payload and presence"
)

new_ws_handlers = r'''  async webSocketMessage(socket, message) {
    try {
      if (message === "ping") {
        socket.send("pong");
        return;
      }

      const data =
        JSON.parse(message);

      if (data.type === "ping") {
        socket.send(
          JSON.stringify({
            type: "pong",
            timestamp: Date.now()
          })
        );
        return;
      }

      if (
        data.type ===
        "presence-request"
      ) {
        await this.broadcastPresence();
        return;
      }

      if (data.type === "chat") {
        const text =
          String(
            data.text || ""
          )
          .trim()
          .replace(
            /[\r\n\t]+/g,
            " "
          )
          .slice(0, 500);

        if (!text) {
          return;
        }

        const language =
          this.getSocketLanguage(
            socket
          );

        const listenerId =
          this.getSocketListenerId(
            socket
          );

        if (!language) {
          return;
        }

        const name =
          String(
            data.name || "Listener"
          )
          .trim()
          .replace(
            /[\r\n\t]+/g,
            " "
          )
          .slice(0, 40) ||
          "Listener";

        const payload =
          JSON.stringify({
            type: "chat",
            language,
            listenerId,
            name,
            text,
            timestamp:
              Date.now()
          });

        const targets =
          this.state.getWebSockets(
            `lang:${language}`
          );

        for (
          const target
          of targets
        ) {
          try {
            target.send(
              payload
            );
          } catch (error) {
            console.error(
              "Chat send failed:",
              error
            );
          }
        }

        return;
      }

    } catch (error) {
      console.error(
        "LiveBridge WebSocket message failed:",
        error
      );
    }
  }

  async webSocketClose(
    socket,
    code,
    reason,
    wasClean
  ) {
    try {
      socket.close(
        code,
        reason
      );
    } catch {
    }

    await this.broadcastPresence(
      socket
    );
  }

  async webSocketError(socket, error) {'''

text = regex_once(
    text,
    r'''  async webSocketMessage\(socket, message\) \{.*?  async webSocketError\(socket, error\) \{''',
    new_ws_handlers,
    "websocket handlers"
)

text = replace_once(
    text,
    '''        const organization =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              organization_name,
              viewer_limit,
              viewer_override,
              account_status,
              billing_status
            FROM organizations
            WHERE room_name = ?
            LIMIT 1
          `)
          .bind(room)
          .first();''',
    '''        const organization =
          await getOrganizationForRoom(
            env,
            room
          );''',
    "room access organization lookup"
)

text = replace_once(
    text,
    '''            currentListeners,
            viewerLimit: null
          });''',
    '''            currentListeners,
            viewerLimit: null,
            listenerDataDisplayEnabled:
              false
          });''',
    "unmanaged data flag"
)

text = replace_once(
    text,
    '''          currentListeners,
          viewerLimit: effectiveViewerLimit,
          remainingCapacity:''',
    '''          currentListeners,
          viewerLimit: effectiveViewerLimit,
          listenerDataDisplayEnabled:
            parseFeatureOverrides(
              organization.feature_overrides_json
            ).listenerDataDisplay === true,
          remainingCapacity:''',
    "managed data flag"
)

listener_profile_route = r'''
/*
=======================================================
OPTIONAL LISTENER PROFILE
Listening never requires an account. This route is only
used after a listener explicitly chooses to save a name
and preferred language.
=======================================================
*/
if (
  (
    request.method === "GET" ||
    request.method === "POST"
  ) &&
  url.pathname === "/listener-profile"
) {
  try {
    const auth =
      await verifyClerkRequest(
        request
      );

    await ensureListenerProfileSchema(
      env
    );

    if (
      request.method === "GET"
    ) {
      const profile =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            display_name,
            preferred_language,
            created_at,
            updated_at
          FROM listener_profiles
          WHERE clerk_user_id = ?
          LIMIT 1
        `)
        .bind(
          auth.clerkUserId
        )
        .first();

      return jsonResponse({
        success: true,
        profile:
          profile
            ? {
                displayName:
                  String(
                    profile.display_name ||
                    ""
                  ),
                preferredLanguage:
                  String(
                    profile.preferred_language ||
                    ""
                  ),
                createdAt:
                  Number(
                    profile.created_at ||
                    0
                  ),
                updatedAt:
                  Number(
                    profile.updated_at ||
                    0
                  )
              }
            : null
      });
    }

    const body =
      await request.json();

    const displayName =
      String(
        body.displayName || ""
      )
      .trim()
      .replace(
        /[\r\n\t]+/g,
        " "
      )
      .slice(0, 40);

    const preferredLanguage =
      String(
        body.preferredLanguage ||
        ""
      )
      .trim()
      .slice(0, 80);

    if (!displayName) {
      return jsonResponse(
        {
          success: false,
          error:
            "A listener name is required."
        },
        400
      );
    }

    const now =
      Date.now();

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO listener_profiles (
        clerk_user_id,
        display_name,
        preferred_language,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(clerk_user_id)
      DO UPDATE SET
        display_name =
          excluded.display_name,
        preferred_language =
          excluded.preferred_language,
        updated_at =
          excluded.updated_at
    `)
    .bind(
      auth.clerkUserId,
      displayName,
      preferredLanguage,
      now,
      now
    )
    .run();

    return jsonResponse({
      success: true,
      profile: {
        displayName,
        preferredLanguage,
        updatedAt:
          now
      }
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to save listener profile."
      },
      403
    );
  }
}


'''

text = replace_once(
    text,
    '''if (
  request.method === "GET" &&
  url.pathname === "/account"
) {''',
    listener_profile_route + '''if (
  request.method === "GET" &&
  url.pathname === "/account"
) {''',
    "listener profile route"
)

path.write_text(text, encoding="utf-8")
print("backend patched")
