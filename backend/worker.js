var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
var OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
var OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
var OPENAI_TRANSCRIBE_URL = "https://api.openai.com/v1/audio/transcriptions";
var AZURE_TTS_INFLIGHT = /* @__PURE__ */ new Map();
var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "X-LiveBridge-TTS-Cache, Retry-After, X-LiveBridge-Stats-Cache, X-LiveBridge-Stats-Rate-Limit, X-LiveBridge-Stats-Rate-Remaining"
};
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
      ...extraHeaders
    }
  });
}
__name(jsonResponse, "jsonResponse");
async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
function normalizeRoom(room) {
  return String(room || "").trim().toUpperCase();
}
__name(normalizeRoom, "normalizeRoom");

let roomAliasSchemaReady = false;

async function ensureRoomAliasSchema(env) {
  if (roomAliasSchemaReady) {
    return;
  }

  try {
    await env.TRANSLATIONS_DB.prepare(`
      ALTER TABLE organizations
      ADD COLUMN room_alias TEXT
    `).run();
  } catch (error) {
    const message =
      String(error?.message || error || "")
        .toLowerCase();

    if (
      !message.includes("duplicate column") &&
      !message.includes("already exists")
    ) {
      throw error;
    }
  }

  roomAliasSchemaReady = true;
}
__name(ensureRoomAliasSchema, "ensureRoomAliasSchema");

async function resolveCanonicalRoom(env, room) {
  const normalizedRoom =
    normalizeRoom(room);

  if (!normalizedRoom) {
    return {
      requestedRoom: "",
      resolvedRoom: "",
      aliasMatched: false
    };
  }

  await ensureRoomAliasSchema(env);

  const row =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT
        room_name,
        room_alias
      FROM organizations
      WHERE
        UPPER(room_name) = ?
        OR UPPER(COALESCE(room_alias, '')) = ?
      ORDER BY
        CASE
          WHEN UPPER(room_name) = ?
          THEN 0
          ELSE 1
        END
      LIMIT 1
    `)
    .bind(
      normalizedRoom,
      normalizedRoom,
      normalizedRoom
    )
    .first();

  if (!row?.room_name) {
    return {
      requestedRoom:
        normalizedRoom,
      resolvedRoom:
        normalizedRoom,
      aliasMatched:
        false
    };
  }

  const canonicalRoom =
    normalizeRoom(
      row.room_name
    );

  return {
    requestedRoom:
      normalizedRoom,
    resolvedRoom:
      canonicalRoom,
    aliasMatched:
      normalizedRoom !==
      canonicalRoom
  };
}
__name(resolveCanonicalRoom, "resolveCanonicalRoom");

let adminOrganizationOrderSchemaReady = false;

async function ensureAdminOrganizationOrderSchema(env) {
  if (adminOrganizationOrderSchemaReady) {
    return;
  }

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_admin_order (
      organization_id INTEGER PRIMARY KEY,
      sort_order INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  adminOrganizationOrderSchemaReady = true;
}
__name(
  ensureAdminOrganizationOrderSchema,
  "ensureAdminOrganizationOrderSchema"
);

const LIVEBRIDGE_MARKETING_LANGUAGES = {
  fr: "French",
  es: "Spanish",
  de: "German",
  pt: "Portuguese",
  it: "Italian",
  pl: "Polish",
  ru: "Russian",
  uk: "Ukrainian",
  nl: "Dutch",
  cs: "Czech",
  fil: "Filipino (Tagalog)",
  he: "Hebrew",
  yo: "Yoruba",
  ig: "Igbo",
  ha: "Hausa",
  zh: "Mandarin Chinese",
  yue: "Cantonese"
};

async function ensureMarketingSchema(env) {
  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketing_profiles (
      organization_id INTEGER PRIMARY KEY,
      website_url TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      city TEXT NOT NULL DEFAULT '',
      region TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT 'Canada',
      logo_url TEXT NOT NULL DEFAULT '',
      primary_color TEXT NOT NULL DEFAULT '#2588ff',
      secondary_color TEXT NOT NULL DEFAULT '#6f43df',
      service_details TEXT NOT NULL DEFAULT '',
      last_analysis_json TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketing_campaigns (
      id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      language_code TEXT NOT NULL,
      language_name TEXT NOT NULL,
      campaign_json TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_org
    ON marketing_campaigns (organization_id, created_at DESC)
  `).run();
}

const LIVEBRIDGE_MARKETING_CREDIT_PACKAGES = {
  "1": { credits: 1, priceCents: 500, label: "1 Marketing Credit" },
  "5": { credits: 5, priceCents: 2000, label: "5 Marketing Credits" },
  "10": { credits: 10, priceCents: 3500, label: "10 Marketing Credits" },
  "25": { credits: 25, priceCents: 7500, label: "25 Marketing Credits" }
};

async function ensureMarketingCreditsSchema(env) {
  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketing_credit_accounts (
      organization_id INTEGER PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 0,
      lifetime_purchased INTEGER NOT NULL DEFAULT 0,
      lifetime_used INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketing_credit_transactions (
      id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      transaction_type TEXT NOT NULL,
      reference_id TEXT DEFAULT '',
      note TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketing_credit_transactions_org
    ON marketing_credit_transactions (organization_id, created_at DESC)
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketing_credit_purchases (
      checkout_session_id TEXT PRIMARY KEY,
      organization_id INTEGER NOT NULL,
      credits INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS marketing_generation_refunds (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL UNIQUE,
      organization_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      campaign_created_at INTEGER NOT NULL,
      requested_at INTEGER NOT NULL,
      refunded_at INTEGER NOT NULL,
      credit_delta INTEGER NOT NULL DEFAULT 1,
      balance_after INTEGER NOT NULL DEFAULT 0,
      email_sent INTEGER NOT NULL DEFAULT 0
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_marketing_generation_refunds_org
    ON marketing_generation_refunds (
      organization_id,
      requested_at DESC
    )
  `).run();
}

async function marketingCreditBalance(env, organizationId) {
  await ensureMarketingCreditsSchema(env);

  const id = Number(organizationId || 0);

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO marketing_credit_accounts (
      organization_id,
      balance,
      lifetime_purchased,
      lifetime_used,
      updated_at
    )
    VALUES (?, 0, 0, 0, ?)
    ON CONFLICT(organization_id) DO NOTHING
  `)
  .bind(id, Date.now())
  .run();

  const row = await env.TRANSLATIONS_DB.prepare(`
    SELECT balance
    FROM marketing_credit_accounts
    WHERE organization_id = ?
    LIMIT 1
  `)
  .bind(id)
  .first();

  return Math.max(0, Number(row?.balance || 0));
}

async function setMarketingCreditBalance(
  env,
  organizationId,
  requestedBalance,
  transactionType = "admin_override",
  note = ""
) {
  await ensureMarketingCreditsSchema(env);

  const id = Number(organizationId || 0);
  const balance = Math.max(0, Math.floor(Number(requestedBalance || 0)));
  const current = await marketingCreditBalance(env, id);
  const delta = balance - current;
  const now = Date.now();

  await env.TRANSLATIONS_DB.prepare(`
    UPDATE marketing_credit_accounts
    SET balance = ?, updated_at = ?
    WHERE organization_id = ?
  `)
  .bind(balance, now, id)
  .run();

  if (delta !== 0) {
    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO marketing_credit_transactions (
        id,
        organization_id,
        delta,
        balance_after,
        transaction_type,
        reference_id,
        note,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, '', ?, ?)
    `)
    .bind(
      crypto.randomUUID(),
      id,
      delta,
      balance,
      transactionType,
      String(note || "").trim().slice(0, 500),
      now
    )
    .run();
  }

  return balance;
}

async function addMarketingCredits(
  env,
  organizationId,
  credits,
  {
    transactionType = "purchase",
    referenceId = "",
    note = "",
    countAsPurchased = false
  } = {}
) {
  await ensureMarketingCreditsSchema(env);

  const id = Number(organizationId || 0);
  const add = Math.max(0, Math.floor(Number(credits || 0)));
  if (!id || !add) {
    return marketingCreditBalance(env, id);
  }

  await marketingCreditBalance(env, id);
  const now = Date.now();

  await env.TRANSLATIONS_DB.prepare(`
    UPDATE marketing_credit_accounts
    SET
      balance = balance + ?,
      lifetime_purchased = lifetime_purchased + ?,
      updated_at = ?
    WHERE organization_id = ?
  `)
  .bind(
    add,
    countAsPurchased ? add : 0,
    now,
    id
  )
  .run();

  const balance = await marketingCreditBalance(env, id);

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO marketing_credit_transactions (
      id,
      organization_id,
      delta,
      balance_after,
      transaction_type,
      reference_id,
      note,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  .bind(
    crypto.randomUUID(),
    id,
    add,
    balance,
    transactionType,
    String(referenceId || "").trim().slice(0, 220),
    String(note || "").trim().slice(0, 500),
    now
  )
  .run();

  return balance;
}

async function consumeMarketingCredit(
  env,
  organizationId,
  referenceId = ""
) {
  await ensureMarketingCreditsSchema(env);
  const id = Number(organizationId || 0);
  await marketingCreditBalance(env, id);
  const now = Date.now();

  const result = await env.TRANSLATIONS_DB.prepare(`
    UPDATE marketing_credit_accounts
    SET
      balance = balance - 1,
      lifetime_used = lifetime_used + 1,
      updated_at = ?
    WHERE organization_id = ?
      AND balance > 0
  `)
  .bind(now, id)
  .run();

  if (Number(result?.meta?.changes || 0) < 1) {
    const error = new Error("You need a Marketing Credit to generate a new campaign.");
    error.code = "MARKETING_CREDITS_REQUIRED";
    throw error;
  }

  const balance = await marketingCreditBalance(env, id);

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO marketing_credit_transactions (
      id,
      organization_id,
      delta,
      balance_after,
      transaction_type,
      reference_id,
      note,
      created_at
    )
    VALUES (?, ?, -1, ?, 'generation', ?, 'Generated marketing campaign', ?)
  `)
  .bind(
    crypto.randomUUID(),
    id,
    balance,
    String(referenceId || "").trim().slice(0, 220),
    now
  )
  .run();

  return balance;
}

async function refundMarketingCredit(
  env,
  organizationId,
  referenceId = ""
) {
  await ensureMarketingCreditsSchema(env);
  const id = Number(organizationId || 0);
  const now = Date.now();

  await env.TRANSLATIONS_DB.prepare(`
    UPDATE marketing_credit_accounts
    SET
      balance = balance + 1,
      lifetime_used = CASE
        WHEN lifetime_used > 0 THEN lifetime_used - 1
        ELSE 0
      END,
      updated_at = ?
    WHERE organization_id = ?
  `)
  .bind(now, id)
  .run();

  const balance = await marketingCreditBalance(env, id);

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO marketing_credit_transactions (
      id,
      organization_id,
      delta,
      balance_after,
      transaction_type,
      reference_id,
      note,
      created_at
    )
    VALUES (?, ?, 1, ?, 'generation_refund', ?, 'Generation failed; credit restored', ?)
  `)
  .bind(
    crypto.randomUUID(),
    id,
    balance,
    String(referenceId || "").trim().slice(0, 220),
    now
  )
  .run();

  return balance;
}

function marketingRefundEscapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function sendMarketingRefundAdminEmail(
  env,
  organization,
  campaign,
  reason,
  balanceAfter,
  requestedAt
) {
  if (!env.GMAIL_WEB_APP_URL) {
    return false;
  }

  const adminsResult =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT email
      FROM admin_users
      WHERE active = 1
        AND TRIM(COALESCE(email, '')) != ''
      ORDER BY id ASC
    `)
    .all();

  const emails = [
    ...new Set(
      (adminsResult.results || [])
        .map(item =>
          String(item?.email || "")
            .trim()
            .toLowerCase()
        )
        .filter(email =>
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
            email
          )
        )
    )
  ];

  if (!emails.length) {
    return false;
  }

  const organizationName =
    String(
      organization?.organization_name ||
      "LiveBridge Organization"
    ).trim();

  const campaignName =
    String(
      campaign?.campaignName ||
      campaign?.languageName ||
      "Marketing Campaign"
    ).trim();

  const languageName =
    String(
      campaign?.languageName || ""
    ).trim();

  const requestedDate =
    new Date(
      Number(requestedAt || Date.now())
    ).toISOString();

  const text =
    "LIVEBRIDGE MARKETING GENERATION REPORT\n\n" +
    "A customer reported a marketing generation and requested their credit back.\n" +
    "The credit was automatically returned under the 24-hour customer guarantee.\n\n" +
    "Organization: " +
    organizationName +
    "\nCampaign: " +
    campaignName +
    "\nLanguage: " +
    languageName +
    "\nRequested: " +
    requestedDate +
    "\nNew credit balance: " +
    Number(balanceAfter || 0) +
    "\n\nCustomer reason:\n" +
    reason;

  const htmlReason =
    marketingRefundEscapeHtml(reason)
      .replace(/\n/g, "<br>");

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:auto;color:#172033;line-height:1.6;">
      <h1 style="margin-bottom:4px;">LiveBridge</h1>
      <h2 style="margin-top:0;">Marketing Generation Report</h2>
      <p>A customer reported a marketing generation within the 24-hour guarantee window. <strong>1 Marketing Credit was automatically returned.</strong></p>
      <p><strong>Organization:</strong> ${marketingRefundEscapeHtml(organizationName)}<br>
      <strong>Campaign:</strong> ${marketingRefundEscapeHtml(campaignName)}<br>
      <strong>Language:</strong> ${marketingRefundEscapeHtml(languageName)}<br>
      <strong>Requested:</strong> ${marketingRefundEscapeHtml(requestedDate)}<br>
      <strong>New credit balance:</strong> ${Number(balanceAfter || 0)}</p>
      <div style="margin-top:18px;padding:14px;border-radius:10px;background:#f3f6fa;border:1px solid #dce5ef;">
        <strong>Customer reason</strong><br>
        ${htmlReason}
      </div>
    </div>
  `;

  let sent = false;

  for (const email of emails) {
    try {
      const response =
        await fetch(
          env.GMAIL_WEB_APP_URL,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json"
            },
            body: JSON.stringify({
              email,
              subject:
                "LiveBridge Marketing Credit Refund — " +
                organizationName,
              text,
              html
            })
          }
        );

      if (response.ok) {
        sent = true;
      }
    } catch (error) {
      console.error(
        "Marketing refund admin email failed:",
        error
      );
    }
  }

  return sent;
}

async function completeMarketingCreditPurchase(env, session) {
  await ensureMarketingCreditsSchema(env);

  const sessionId = String(session?.id || "").trim();
  const purchaseType = String(
    session?.metadata?.livebridge_purchase_type || ""
  ).trim();

  if (
    !sessionId ||
    purchaseType !== "marketing_credits"
  ) {
    return {
      matched: false,
      ignored: true
    };
  }

  const organizationId = Number(
    session?.metadata?.livebridge_organization_id || 0
  );
  const credits = Math.max(
    0,
    Math.floor(
      Number(
        session?.metadata?.livebridge_marketing_credits || 0
      )
    )
  );

  if (!organizationId || !credits) {
    throw new Error("Marketing credit purchase metadata is invalid.");
  }

  const purchase = await env.TRANSLATIONS_DB.prepare(`
    SELECT *
    FROM marketing_credit_purchases
    WHERE checkout_session_id = ?
    LIMIT 1
  `)
  .bind(sessionId)
  .first();

  if (purchase?.status === "completed") {
    return {
      matched: true,
      alreadyCompleted: true,
      organizationId,
      credits,
      balance:
        await marketingCreditBalance(
          env,
          organizationId
        )
    };
  }

  const paymentStatus = String(
    session?.payment_status || ""
  ).trim();

  const checkoutStatus = String(
    session?.status || ""
  ).trim();

  if (
    checkoutStatus !== "complete" ||
    paymentStatus !== "paid"
  ) {
    return {
      matched: true,
      paid: false,
      organizationId,
      credits
    };
  }

  const balance = await addMarketingCredits(
    env,
    organizationId,
    credits,
    {
      transactionType: "purchase",
      referenceId: sessionId,
      note: "Stripe marketing credit purchase",
      countAsPurchased: true
    }
  );

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO marketing_credit_purchases (
      checkout_session_id,
      organization_id,
      credits,
      amount_cents,
      currency,
      status,
      created_at,
      completed_at
    )
    VALUES (?, ?, ?, ?, ?, 'completed', ?, ?)
    ON CONFLICT(checkout_session_id)
    DO UPDATE SET
      status = 'completed',
      completed_at = excluded.completed_at
  `)
  .bind(
    sessionId,
    organizationId,
    credits,
    Math.max(
      0,
      Number(session?.amount_total || purchase?.amount_cents || 0)
    ),
    String(session?.currency || purchase?.currency || "cad").toUpperCase(),
    Number(purchase?.created_at || Date.now()),
    Date.now()
  )
  .run();

  return {
    matched: true,
    paid: true,
    organizationId,
    credits,
    balance
  };
}

function marketingColor(value, fallback) {
  const cleaned = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(cleaned) ? cleaned : fallback;
}

function safeJson(value, fallback = null) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function openAIResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  const parts = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
}

function openAISearchSources(payload) {
  const found = [];
  const seen = new Set();

  function add(title, url) {
    const cleanUrl = String(url || "").trim();
    if (!/^https?:\/\//i.test(cleanUrl) || seen.has(cleanUrl)) return;
    seen.add(cleanUrl);
    found.push({
      title: String(title || "Source").trim().slice(0, 180),
      url: cleanUrl.slice(0, 800)
    });
  }

  for (const item of payload?.output || []) {
    for (const source of item?.action?.sources || []) {
      add(source?.title, source?.url);
    }

    for (const content of item?.content || []) {
      for (const annotation of content?.annotations || []) {
        add(
          annotation?.title || annotation?.url_citation?.title,
          annotation?.url || annotation?.url_citation?.url
        );
      }
    }
  }

  return found.slice(0, 20);
}

function parseAIJson(text) {
  const raw = String(text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  try { return JSON.parse(raw); } catch {}

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return JSON.parse(raw.slice(first, last + 1));
  }
  throw new Error("AI response could not be parsed.");
}

async function marketingOrganization(request, env) {
  const auth = await verifyClerkRequest(request);
  const organization = await env.TRANSLATIONS_DB.prepare(`
    SELECT *
    FROM organizations
    WHERE clerk_user_id = ?
    LIMIT 1
  `).bind(auth.clerkUserId).first();

  if (!organization) {
    throw new Error("LiveBridge account not found.");
  }

  const marketingEnabled =
    parseFeatureOverrides(
      organization.feature_overrides_json
    ).marketingCampaigns === true;

  if (!marketingEnabled) {
    throw new Error(
      "Marketing campaigns are not enabled for this organization."
    );
  }

  return organization;
}

async function marketingProfileRow(env, organizationId) {
  await ensureMarketingSchema(env);
  return env.TRANSLATIONS_DB.prepare(`
    SELECT *
    FROM marketing_profiles
    WHERE organization_id = ?
    LIMIT 1
  `).bind(Number(organizationId)).first();
}

function marketingProfile(organization, row) {
  return {
    organizationId: Number(organization.id),
    organizationName: String(organization.organization_name || ""),
    roomName: String(organization.room_name || "").trim().toUpperCase(),
    websiteUrl: String(row?.website_url || ""),
    address: String(row?.address || ""),
    city: String(row?.city || ""),
    region: String(row?.region || ""),
    country: String(row?.country || "Canada"),
    logoUrl: String(row?.logo_url || ""),
    primaryColor: marketingColor(row?.primary_color, "#2588ff"),
    secondaryColor: marketingColor(row?.secondary_color, "#6f43df"),
    serviceDetails: String(row?.service_details || ""),
    analysis: safeJson(row?.last_analysis_json, null),
    updatedAt: Number(row?.updated_at || 0)
  };
}

function marketingCampaign(row) {
  const data = safeJson(row?.campaign_json, {}) || {};
  return {
    id: String(row?.id || ""),
    languageCode: String(row?.language_code || ""),
    languageName: String(row?.language_name || ""),
    ...data,
    createdAt: Number(row?.created_at || data.createdAt || 0),
    updatedAt: Number(row?.updated_at || data.updatedAt || 0)
  };
}

function normalizeMarketingAnalysis(value) {
  const rawLanguages = Array.isArray(value?.languages) ? value.languages : [];

  function numericCount(value) {
    const match = String(value || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : null;
  }

  const languages = rawLanguages.map(item => {
    const code = String(item?.code || "").trim().toLowerCase();
    const sources = Array.isArray(item?.sources) ? item.sources : [];
    return {
      language: String(item?.language || LIVEBRIDGE_MARKETING_LANGUAGES[code] || "").trim().slice(0, 100),
      code,
      estimatedShare: String(item?.estimatedShare || "").trim().slice(0, 100),
      estimatedPeople: String(item?.estimatedPeople || "").trim().slice(0, 100),
      why: String(item?.why || "").trim().slice(0, 700),
      supportedByLiveBridge: Object.prototype.hasOwnProperty.call(LIVEBRIDGE_MARKETING_LANGUAGES, code),
      sources: sources.slice(0, 4).map(source => ({
        title: String(source?.title || "").trim().slice(0, 180),
        url: String(source?.url || "").trim().slice(0, 800)
      })).filter(source => /^https?:\/\//i.test(source.url))
    };
  }).filter(item => item.language);

  languages.sort((a, b) => {
    const aCount = numericCount(a.estimatedPeople);
    const bCount = numericCount(b.estimatedPeople);

    if (aCount !== null && bCount !== null && aCount !== bCount) {
      return bCount - aCount;
    }

    if (aCount !== null && bCount === null) return -1;
    if (aCount === null && bCount !== null) return 1;

    return 0;
  });

  return {
    areaSummary: String(value?.areaSummary || "").trim().slice(0, 1500),
    methodology: String(value?.methodology || "").trim().slice(0, 1200),
    languages: languages.slice(0, 8)
  };
}

function cleanMarketingChoice(value, allowed, fallback) {
  const clean = String(value || "").trim().toLowerCase();
  return allowed.includes(clean) ? clean : fallback;
}

function marketingArtworkPrompt(campaign, kind) {
  const portrait = kind === "portrait";
  const style = String(campaign?.visualStyle || "people").trim();
  const audience = String(campaign?.audienceFocus || "general").trim();
  const tone = String(campaign?.imageryTone || "warm").trim();
  const languageName = String(campaign?.languageName || "the selected language").trim();

  const styleText =
    style === "balanced"
      ? "People should be clearly present but balanced with a polished modern community setting."
      : "People should be the emotional focus of the image, candid, relational, welcoming and natural.";

  return `Create a professional photorealistic background image for a community outreach invitation.

Audience language/community: ${languageName}-speaking community.
Audience focus: ${audience}.
Creative tone: ${tone}.
${styleText}

Representation:
Show a natural contemporary group of people who would feel familiar and welcoming to people from communities where ${languageName} is commonly spoken. Use everyday modern clothing and authentic, warm human interaction. Avoid stereotypes, costumes, flags, caricatures, exaggerated cultural symbols, tokenism, or making assumptions about religion. The scene should feel like genuine neighbours, friends and families being welcomed into a community gathering.

Setting:
A warm, modern community or church gathering environment in Canada. Friendly, hopeful, relational, inclusive and suitable for a real printed community-centre poster.

Composition:
${portrait
  ? "Portrait composition. Keep the people mainly on the right and/or lower half. Leave the upper-left and left-centre visually calm enough for text by using natural dark background, wall, depth-of-field blur, shadow, or open room space."
  : "Square composition. Keep the people mainly on the right side and centre-right. Leave the left side visually calm enough for text by using natural dark background, wall, depth-of-field blur, shadow, or open room space."}

The image must remain a continuous edge-to-edge photographic scene. The negative space must look like a real part of the environment — never like a graphic-design placeholder.

Critical:
Do NOT render any words, letters, numbers, logos, QR codes, signs, posters, banners, blank cards, white panels, white boxes, speech bubbles, rounded rectangles, abstract white shapes, empty billboards, frames, overlays, watermarks or readable text. Do not create a blank area by inserting a solid white or light-coloured object. LiveBridge will overlay all exact typography, branding and QR information afterward.`;
}

async function generateMarketingArtworkBase64(env, campaign, kind) {
  const size = kind === "portrait" ? "1024x1536" : "1024x1024";
  const prompt = marketingArtworkPrompt(campaign, kind);
  const models = [
    "gpt-image-2.5-sunburst",
    "gpt-image-1.5",
    "gpt-image-1"
  ];

  let lastError = null;

  for (const model of models) {
    try {
      const response = await fetch(
        OPENAI_IMAGES_URL,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            prompt,
            size,
            quality: "medium",
            n: 1
          })
        }
      );

      const data = await response.json();

      if (
        response.ok &&
        data?.data?.[0]?.b64_json
      ) {
        return String(data.data[0].b64_json);
      }

      lastError = new Error(
        data?.error?.message ||
        ("Artwork generation failed with " + model + ".")
      );
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to generate campaign artwork.");
}


/*
=======================================================
LIVEBRIDGE v1.0.20 ROOM AVAILABILITY + STRIPE VERIFY + CHECKOUT + PLANS API + v1.0.16 EVENT-DRIVEN BROADCAST WATCHDOG
No global cron. Durable Object alarms exist only for
rooms with an active broadcast or an armed schedule.
=======================================================
*/

const BROADCAST_STALE_MS = 100000;
const SCHEDULE_START_GRACE_MS = 120000;

async function getOrganizationForRoom(env, room) {
  const normalizedRoom = normalizeRoom(room);

  if (!normalizedRoom) {
    return null;
  }

  await ensureRoomAliasSchema(env);

  return env.TRANSLATIONS_DB.prepare(`
    SELECT *
    FROM organizations
    WHERE
      UPPER(room_name) = ?
      OR UPPER(
        room_name || '-' || COALESCE(last_subroom, '')
      ) = ?
      OR UPPER(COALESCE(room_alias, '')) = ?
    LIMIT 1
  `)
  .bind(
    normalizedRoom,
    normalizedRoom,
    normalizedRoom
  )
  .first();
}

let liveNotesSchemaReady = false;

async function ensureLiveNotesSchema(env) {

  if (liveNotesSchemaReady) {
    return;
  }

  try {
    await env.TRANSLATIONS_DB.prepare(`
      ALTER TABLE organizations
      ADD COLUMN scripture_enabled INTEGER NOT NULL DEFAULT 0
    `).run();
  } catch (error) {

    const message =
      String(error?.message || error || "");

    if (
      !message.toLowerCase().includes(
        "duplicate column"
      )
    ) {
      throw error;
    }
  }

  liveNotesSchemaReady = true;
}

let broadcastSafetySchemaReady = false;

async function ensureBroadcastSafetySchema(env) {

  if (broadcastSafetySchemaReady) {
    return;
  }

  const alters = [
    `ALTER TABLE organizations ADD COLUMN no_audio_timeout_minutes INTEGER NOT NULL DEFAULT 30`,
    `ALTER TABLE organizations ADD COLUMN scripture_plan_override INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE organizations ADD COLUMN feature_overrides_json TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE broadcast_sessions ADD COLUMN heartbeat_requests INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN status_polls INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN analytics_requests INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN audio_chunks INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN source_final_requests INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN listener_heartbeats INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN tts_requests INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE broadcast_sessions ADD COLUMN auto_end_reason TEXT`
  ];

  for (const sql of alters) {
    try {
      await env.TRANSLATIONS_DB.prepare(sql).run();
    } catch (error) {
      const message =
        String(error?.message || error || "").toLowerCase();

      if (!message.includes("duplicate column")) {
        throw error;
      }
    }
  }

  broadcastSafetySchemaReady = true;
}

async function incrementBroadcastMetric(
  env,
  room,
  column,
  amount = 1
) {

  const allowed = new Set([
    "heartbeat_requests",
    "status_polls",
    "analytics_requests",
    "audio_chunks",
    "source_final_requests",
    "listener_heartbeats",
    "tts_requests"
  ]);

  if (!allowed.has(column)) {
    return;
  }

  await ensureBroadcastSafetySchema(env);

  const broadcast =
    await getActiveBroadcast(
      env,
      normalizeRoom(room)
    );

  if (!broadcast) {
    return;
  }

  await env.TRANSLATIONS_DB.prepare(
    `UPDATE broadcast_sessions
     SET ${column} = ${column} + ?
     WHERE id = ?`
  )
  .bind(
    Math.max(0, Number(amount || 0)),
    broadcast.id
  )
  .run();
}

async function sendBroadcastAlertEmail(
  env,
  organization,
  reason,
  room,
  timeoutMinutes
) {

  if (!env.GMAIL_WEB_APP_URL || !organization) {
    return;
  }

  const email =
    String(
      organization.account_email ||
      organization.email ||
      ""
    ).trim();

  if (!email) {
    return;
  }

  const organizationName =
    String(
      organization.organization_name ||
      "LiveBridge Organization"
    );

  const reasonText = {
    no_audio:
      `No meaningful audio input was detected for ${Number(timeoutMinutes || 30)} minutes.`,
    page_exit:
      "The broadcaster page closed or navigated away before End Broadcast was pressed.",
    time_limit:
      "The account reached its available LiveBridge broadcast-time limit.",
    broadcaster_disconnected:
      "LiveBridge stopped receiving broadcaster heartbeats. The browser, computer, or internet connection may have closed or failed.",
    scheduled_start_failed:
      "A scheduled broadcast did not successfully start within the expected start window."
  }[reason] ||
    "The broadcast ended automatically.";

  const isScheduleFailure =
    reason === "scheduled_start_failed";

  const closingText = isScheduleFailure
    ? "Please open the LiveBridge broadcaster and start the broadcast manually if it is still needed."
    : "The broadcast has been ended to protect your account and usage.";

  try {
    await fetch(
      env.GMAIL_WEB_APP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          email,
          subject:
            isScheduleFailure
              ? "LiveBridge Scheduled Broadcast Alert"
              : "LiveBridge Broadcast Alert",
          text:
            "LIVEBRIDGE ALERT\n\n" +
            "Organization: " +
            organizationName +
            "\nRoom: " +
            normalizeRoom(room) +
            "\n\n" +
            reasonText +
            "\n\n" +
            closingText,
          html: `
            <div style="font-family:Arial,Helvetica,sans-serif;max-width:700px;margin:auto;color:#172033;line-height:1.6;">
              <h1 style="margin-bottom:4px;">LiveBridge</h1>
              <h2 style="margin-top:0;">${isScheduleFailure ? "Scheduled Broadcast Alert" : "Broadcast Alert"}</h2>
              <p><strong>Organization:</strong> ${organizationName}</p>
              <p><strong>Room:</strong> ${normalizeRoom(room)}</p>
              <p>${reasonText}</p>
              <p>${closingText}</p>
            </div>
          `
        })
      }
    );
  } catch (error) {
    console.error(
      "Broadcast alert email failed:",
      error
    );
  }
}

async function finalizeBroadcastForReason(
  env,
  room,
  reason
) {
  await ensureAnalyticsTables(env);
  await ensureBroadcastSafetySchema(env);

  const normalizedRoom = normalizeRoom(room);
  const now = Date.now();

  const active =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT room, started_at, last_seen
      FROM active_broadcasts
      WHERE room = ?
      LIMIT 1
    `)
    .bind(normalizedRoom)
    .first();

  if (!active) {
    return {
      finalized: false,
      reason: "no_active_broadcast"
    };
  }

  const broadcast =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT id, room, started_at, ended_at
      FROM broadcast_sessions
      WHERE room = ?
        AND started_at = ?
        AND ended_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `)
    .bind(
      normalizedRoom,
      Number(active.started_at)
    )
    .first();

  const organization =
    await getOrganizationForRoom(
      env,
      normalizedRoom
    );

  if (broadcast) {
    await env.TRANSLATIONS_DB.prepare(`
      UPDATE listener_sessions
      SET
        ended_at = COALESCE(ended_at, last_seen, ?),
        last_seen = COALESCE(last_seen, ?)
      WHERE broadcast_id = ?
    `)
    .bind(
      now,
      now,
      broadcast.id
    )
    .run();

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE broadcast_sessions
      SET
        ended_at = ?,
        auto_end_reason = ?
      WHERE id = ?
        AND ended_at IS NULL
    `)
    .bind(
      now,
      reason,
      broadcast.id
    )
    .run();

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE broadcast_transcripts
      SET expires_at = ?
      WHERE broadcast_id = ?
    `)
    .bind(
      now + (7 * 24 * 60 * 60 * 1000),
      broadcast.id
    )
    .run();

    if (organization) {
      const durationMs =
        Math.max(
          0,
          now - Number(broadcast.started_at || now)
        );

      const usedMinutes =
        Math.max(
          1,
          Math.ceil(durationMs / 60000)
        );

      await env.TRANSLATIONS_DB.prepare(`
        UPDATE organizations
        SET
          used_minutes = used_minutes + ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        usedMinutes,
        now,
        Number(organization.id)
      )
      .run();
    }
  }

  await env.TRANSLATIONS_DB.prepare(`
    DELETE FROM active_broadcasts
    WHERE room = ?
  `)
  .bind(normalizedRoom)
  .run();

  if (
    organization &&
    [
      "time_limit",
      "broadcaster_disconnected",
      "no_audio"
    ].includes(reason)
  ) {
    await sendBroadcastAlertEmail(
      env,
      organization,
      reason,
      normalizedRoom,
      Number(
        organization.no_audio_timeout_minutes ?? 30
      )
    );
  }

  return {
    finalized: true,
    broadcastId:
      broadcast?.id || null,
    organization,
    startedAt:
      Number(active.started_at || 0),
    lastSeen:
      Number(active.last_seen || 0)
  };
}

function currentUsageMonth() {

  return new Date()
    .toISOString()
    .slice(0, 7);
}


function countAzureTextCharacters(
  text
) {

  return Array.from(
    String(text || "")
  ).length;
}


function countAzureSsmlBillableCharacters(
  ssml
) {

  const billable =
    String(ssml || "")
      .replace(
        /<\/?speak\b[^>]*>/gi,
        ""
      )
      .replace(
        /<\/?voice\b[^>]*>/gi,
        ""
      );

  let total = 0;

  for (const character of billable) {

    total +=
      /\p{Script=Han}/u.test(
        character
      )
        ? 2
        : 1;
  }

  return total;
}


const LIVEBRIDGE_API_COST_PRICING = {
  currency:
    "USD",

  azureTtsStandardNeuralPerMillionCharacters:
    16,

  gpt41MiniInputPerMillionTokens:
    0.40,

  gpt41MiniCachedInputPerMillionTokens:
    0.10,

  gpt41MiniOutputPerMillionTokens:
    1.60,

  gpt4oMiniTranscribeInputPerMillionTokens:
    1.25,

  gpt4oMiniTranscribeOutputPerMillionTokens:
    5.00
};


let apiCostSchemaReady = false;


async function ensureApiCostSchema(
  env
) {

  if (apiCostSchemaReady) {
    return;
  }

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS azure_tts_usage (
      organization_id INTEGER NOT NULL,
      usage_month TEXT NOT NULL,
      characters INTEGER NOT NULL DEFAULT 0,
      generations INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (
        organization_id,
        usage_month
      )
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS openai_usage (
      organization_id INTEGER NOT NULL,
      usage_month TEXT NOT NULL,
      category TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      requests INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (
        organization_id,
        usage_month,
        category,
        model
      )
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS api_cost_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      category TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      requests INTEGER NOT NULL DEFAULT 0,
      characters INTEGER NOT NULL DEFAULT 0,
      generations INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_api_cost_events_org_time
    ON api_cost_events (
      organization_id,
      created_at
    )
  `).run();

  apiCostSchemaReady = true;
}


function normalizedOpenAiUsage(
  usage
) {

  const source =
    usage || {};

  const inputTokens =
    Math.max(
      0,
      Number(
        source.input_tokens ??
        source.prompt_tokens ??
        0
      ) || 0
    );

  const cachedInputTokens =
    Math.min(
      inputTokens,
      Math.max(
        0,
        Number(
          source.input_token_details
            ?.cached_tokens ??
          source.prompt_tokens_details
            ?.cached_tokens ??
          0
        ) || 0
      )
    );

  const outputTokens =
    Math.max(
      0,
      Number(
        source.output_tokens ??
        source.completion_tokens ??
        0
      ) || 0
    );

  return {
    inputTokens:
      Math.round(inputTokens),

    cachedInputTokens:
      Math.round(cachedInputTokens),

    outputTokens:
      Math.round(outputTokens)
  };
}


function calculateOpenAiCostUsd(
  model,
  usage
) {

  const normalized =
    normalizedOpenAiUsage(
      usage
    );

  const modelName =
    String(
      model || ""
    ).toLowerCase();

  if (
    modelName.startsWith(
      "gpt-4.1-mini"
    )
  ) {

    const uncachedInput =
      Math.max(
        0,
        normalized.inputTokens -
        normalized.cachedInputTokens
      );

    return (
      (
        uncachedInput *
        LIVEBRIDGE_API_COST_PRICING
          .gpt41MiniInputPerMillionTokens
      ) +
      (
        normalized.cachedInputTokens *
        LIVEBRIDGE_API_COST_PRICING
          .gpt41MiniCachedInputPerMillionTokens
      ) +
      (
        normalized.outputTokens *
        LIVEBRIDGE_API_COST_PRICING
          .gpt41MiniOutputPerMillionTokens
      )
    ) / 1000000;
  }

  if (
    modelName.startsWith(
      "gpt-4o-mini-transcribe"
    )
  ) {

    return (
      (
        normalized.inputTokens *
        LIVEBRIDGE_API_COST_PRICING
          .gpt4oMiniTranscribeInputPerMillionTokens
      ) +
      (
        normalized.outputTokens *
        LIVEBRIDGE_API_COST_PRICING
          .gpt4oMiniTranscribeOutputPerMillionTokens
      )
    ) / 1000000;
  }

  return 0;
}


async function recordOpenAiUsageByOrganization(
  env,
  organizationId,
  category,
  model,
  usage
) {

  const id =
    Number(
      organizationId || 0
    );

  if (!id) {
    return;
  }

  const normalized =
    normalizedOpenAiUsage(
      usage
    );

  if (
    normalized.inputTokens <= 0 &&
    normalized.outputTokens <= 0
  ) {
    return;
  }

  await ensureApiCostSchema(
    env
  );

  const costUsd =
    calculateOpenAiCostUsd(
      model,
      usage
    );

  const usageNow =
    Date.now();

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO openai_usage (
      organization_id,
      usage_month,
      category,
      model,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      requests,
      cost_usd,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)

    ON CONFLICT(
      organization_id,
      usage_month,
      category,
      model
    )
    DO UPDATE SET
      input_tokens =
        input_tokens +
        excluded.input_tokens,

      cached_input_tokens =
        cached_input_tokens +
        excluded.cached_input_tokens,

      output_tokens =
        output_tokens +
        excluded.output_tokens,

      requests =
        requests + 1,

      cost_usd =
        cost_usd +
        excluded.cost_usd,

      updated_at =
        excluded.updated_at
  `)
  .bind(
    id,
    currentUsageMonth(),
    String(category || "other"),
    String(model || "unknown"),
    normalized.inputTokens,
    normalized.cachedInputTokens,
    normalized.outputTokens,
    costUsd,
    usageNow
  )
  .run();

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO api_cost_events (
      organization_id,
      provider,
      category,
      model,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      requests,
      characters,
      generations,
      cost_usd,
      created_at
    )
    VALUES (?, 'openai', ?, ?, ?, ?, ?, 1, 0, 0, ?, ?)
  `)
  .bind(
    id,
    String(category || "other"),
    String(model || "unknown"),
    normalized.inputTokens,
    normalized.cachedInputTokens,
    normalized.outputTokens,
    costUsd,
    usageNow
  )
  .run();
}


async function recordOpenAiUsageForRoom(
  env,
  room,
  category,
  model,
  usage
) {

  const organization =
    await getOrganizationForRoom(
      env,
      room
    );

  if (!organization) {

    console.warn(
      "OpenAI usage could not be matched to organization:",
      normalizeRoom(room)
    );

    return;
  }

  await recordOpenAiUsageByOrganization(
    env,
    organization.id,
    category,
    model,
    usage
  );
}


function calculateAzureTtsCostUsd(
  characters
) {

  return (
    Math.max(
      0,
      Number(
        characters || 0
      )
    ) *
    LIVEBRIDGE_API_COST_PRICING
      .azureTtsStandardNeuralPerMillionCharacters
  ) / 1000000;
}


async function recordAzureTtsUsage(
  env,
  room,
  text,
  billableCharacters = null
) {

  const normalizedRoom =
    normalizeRoom(room);

  if (
    !normalizedRoom ||
    !text
  ) {
    return;
  }

  const organization =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT id
      FROM organizations
      WHERE
        UPPER(room_name) = ?
        OR
        UPPER(
          room_name ||
          '-' ||
          COALESCE(last_subroom, '')
        ) = ?
      LIMIT 1
    `)
    .bind(
      normalizedRoom,
      normalizedRoom
    )
    .first();

  if (!organization) {

    console.warn(
      "Azure TTS usage could not be matched to organization:",
      normalizedRoom
    );

    return;
  }

  await ensureApiCostSchema(
    env
  );

  const usageMonth =
    currentUsageMonth();

  const suppliedCharacters =
    Number(
      billableCharacters
    );

  const characters =
    Number.isFinite(
      suppliedCharacters
    ) &&
    suppliedCharacters > 0
      ? Math.round(
          suppliedCharacters
        )
      : countAzureTextCharacters(
          text
        );

  const usageNow =
    Date.now();

  const costUsd =
    calculateAzureTtsCostUsd(
      characters
    );

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO azure_tts_usage (
      organization_id,
      usage_month,
      characters,
      generations,
      updated_at
    )
    VALUES (?, ?, ?, 1, ?)

    ON CONFLICT(
      organization_id,
      usage_month
    )
    DO UPDATE SET
      characters =
        characters +
        excluded.characters,

      generations =
        generations + 1,

      updated_at =
        excluded.updated_at
  `)
  .bind(
    Number(
      organization.id
    ),
    usageMonth,
    characters,
    usageNow
  )
  .run();

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO api_cost_events (
      organization_id,
      provider,
      category,
      model,
      input_tokens,
      cached_input_tokens,
      output_tokens,
      requests,
      characters,
      generations,
      cost_usd,
      created_at
    )
    VALUES (?, 'azure', 'tts', 's0-standard-neural', 0, 0, 0, 0, ?, 1, ?, ?)
  `)
  .bind(
    Number(
      organization.id
    ),
    characters,
    costUsd,
    usageNow
  )
  .run();
}


/*
=======================================================
LIVEBRIDGE CUSTOMER ACCOUNTS
=======================================================
*/

const CLERK_ISSUER =
  "https://stable-swine-6554.clerk.accounts.dev";

const CLERK_JWKS_URL =
  CLERK_ISSUER + "/.well-known/jwks.json";

let clerkJwksCache = null;
let clerkJwksCacheUntil = 0;


function base64UrlToBytes(value) {

  let base64 =
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (base64.length % 4) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(binary.length);

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes;
}


function decodeJwtPart(value) {

  const bytes =
    base64UrlToBytes(value);

  return JSON.parse(
    new TextDecoder().decode(bytes)
  );
}


async function getClerkJwks() {

  const now =
    Date.now();

  if (
    clerkJwksCache &&
    now < clerkJwksCacheUntil
  ) {
    return clerkJwksCache;
  }

  const response =
    await fetch(CLERK_JWKS_URL);

  if (!response.ok) {

    throw new Error(
      "Unable to load Clerk signing keys."
    );
  }

  clerkJwksCache =
    await response.json();

  clerkJwksCacheUntil =
    now + 5 * 60 * 1000;

  return clerkJwksCache;
}


async function verifyClerkRequest(
  request
) {

  const authorization =
    request.headers.get(
      "Authorization"
    ) || "";

  if (
    !authorization.startsWith(
      "Bearer "
    )
  ) {

    throw new Error(
      "Missing Clerk authorization token."
    );
  }

  const token =
    authorization
      .substring(7)
      .trim();

  const parts =
    token.split(".");

  if (parts.length !== 3) {

    throw new Error(
      "Invalid Clerk token."
    );
  }

  const header =
    decodeJwtPart(parts[0]);

  const payload =
    decodeJwtPart(parts[1]);

  if (
    header.alg !== "RS256" ||
    !header.kid
  ) {

    throw new Error(
      "Unsupported Clerk token."
    );
  }

  const jwks =
    await getClerkJwks();

  const jwk =
    (jwks.keys || [])
      .find(
        key =>
          key.kid ===
          header.kid
      );

  if (!jwk) {

    clerkJwksCache = null;

    throw new Error(
      "Clerk signing key not found."
    );
  }

  const cryptoKey =
    await crypto.subtle.importKey(
      "jwk",
      jwk,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256"
      },
      false,
      ["verify"]
    );

  const signingInput =
    new TextEncoder().encode(
      parts[0] +
      "." +
      parts[1]
    );

  const signature =
    base64UrlToBytes(
      parts[2]
    );

  const valid =
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature,
      signingInput
    );

  if (!valid) {

    throw new Error(
      "Invalid Clerk signature."
    );
  }

  const nowSeconds =
    Math.floor(
      Date.now() / 1000
    );

  if (
    payload.exp &&
    Number(payload.exp) <
      nowSeconds
  ) {

    throw new Error(
      "Clerk session expired."
    );
  }

  if (
    payload.nbf &&
    Number(payload.nbf) >
      nowSeconds
  ) {

    throw new Error(
      "Clerk token not active yet."
    );
  }

  if (
    payload.iss &&
    payload.iss !==
      CLERK_ISSUER
  ) {

    throw new Error(
      "Invalid Clerk issuer."
    );
  }

  const clerkUserId =
    String(
      payload.sub || ""
    ).trim();

  if (!clerkUserId) {

    throw new Error(
      "Clerk user ID missing."
    );
  }

  return {
    clerkUserId,
    payload
  };
}



/*
=======================================================
LIVEBRIDGE v1.0.30 STRIPE SUBSCRIPTION LIFECYCLE
Webhook verification, idempotency, subscription status,
plan synchronization and monthly usage reset.
=======================================================
*/

function isBillingAccessActive(
  organization
) {

  const status =
    String(
      organization?.billing_status ||
      "active"
    )
    .trim()
    .toLowerCase();

  return (
    status === "active" ||
    status === "trialing"
  );
}



async function ensureStripeWebhookRegistrationTable(
  env
) {

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS stripe_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkout_session_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT DEFAULT '',
      stripe_subscription_id TEXT DEFAULT '',
      clerk_user_id TEXT NOT NULL UNIQUE,
      organization_id INTEGER,
      plan_code TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
}


async function ensureStripeLifecycleSchema(
  env
) {

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      object_id TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'processing',
      error_text TEXT DEFAULT '',
      received_at INTEGER NOT NULL,
      processed_at INTEGER
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_stripe_registrations_subscription
    ON stripe_registrations (stripe_subscription_id)
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_stripe_registrations_customer
    ON stripe_registrations (stripe_customer_id)
  `).run();
}


function hexFromBytes(
  bytes
) {

  return Array.from(
    new Uint8Array(bytes)
  )
  .map(
    value =>
      value
        .toString(16)
        .padStart(2, "0")
  )
  .join("");
}


function constantTimeHexEqual(
  left,
  right
) {

  const a =
    String(left || "")
      .toLowerCase();

  const b =
    String(right || "")
      .toLowerCase();

  if (a.length !== b.length) {
    return false;
  }

  let difference = 0;

  for (
    let i = 0;
    i < a.length;
    i++
  ) {
    difference |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }

  return difference === 0;
}


async function verifyStripeWebhookSignature({
  rawBody,
  signatureHeader,
  secret,
  toleranceSeconds = 300
}) {

  const header =
    String(
      signatureHeader || ""
    );

  const parts =
    header
      .split(",")
      .map(
        item => item.trim()
      );

  const timestampPart =
    parts.find(
      item => item.startsWith("t=")
    );

  const signatures =
    parts
      .filter(
        item => item.startsWith("v1=")
      )
      .map(
        item => item.substring(3)
      )
      .filter(Boolean);

  const timestamp =
    Number(
      timestampPart
        ? timestampPart.substring(2)
        : 0
    );

  if (
    !timestamp ||
    !signatures.length
  ) {
    throw new Error(
      "Stripe webhook signature is missing or malformed."
    );
  }

  const age =
    Math.abs(
      Math.floor(Date.now() / 1000) -
      timestamp
    );

  if (
    age > toleranceSeconds
  ) {
    throw new Error(
      "Stripe webhook signature is outside the allowed time window."
    );
  }

  const encoder =
    new TextEncoder();

  const key =
    await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      {
        name: "HMAC",
        hash: "SHA-256"
      },
      false,
      ["sign"]
    );

  const signedPayload =
    timestamp + "." + rawBody;

  const digest =
    await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(
        signedPayload
      )
    );

  const expected =
    hexFromBytes(
      digest
    );

  const valid =
    signatures.some(
      signature =>
        constantTimeHexEqual(
          expected,
          signature
        )
    );

  if (!valid) {
    throw new Error(
      "Stripe webhook signature verification failed."
    );
  }

  return true;
}



function stripeEntityId(
  value
) {

  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return String(
      value.id || ""
    ).trim();
  }

  return "";
}


async function loadPlanByStripePriceId(
  env,
  stripePriceId
) {

  const priceId =
    String(
      stripePriceId || ""
    ).trim();

  if (!priceId) {
    return null;
  }

  const row =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM plans
      WHERE stripe_price_id = ?
      LIMIT 1
    `)
    .bind(priceId)
    .first();

  return row
    ? buildPlanRecord(row)
    : null;
}


async function findStripeRegistration(
  env,
  {
    subscriptionId = "",
    customerId = ""
  } = {}
) {

  await ensureStripeWebhookRegistrationTable(
    env
  );

  const subscription =
    String(
      subscriptionId || ""
    ).trim();

  const customer =
    String(
      customerId || ""
    ).trim();

  if (
    !subscription &&
    !customer
  ) {
    return null;
  }

  const row =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT
        sr.*,
        o.plan_code AS organization_plan_code,
        o.billing_status AS organization_billing_status
      FROM stripe_registrations sr
      LEFT JOIN organizations o
        ON o.id = sr.organization_id
      WHERE
        (? != '' AND sr.stripe_subscription_id = ?)
        OR
        (? != '' AND sr.stripe_customer_id = ?)
      ORDER BY
        CASE
          WHEN sr.stripe_subscription_id = ?
          THEN 0
          ELSE 1
        END
      LIMIT 1
    `)
    .bind(
      subscription,
      subscription,
      customer,
      customer,
      subscription
    )
    .first();

  return row || null;
}


function stripeSubscriptionAccessStatus(
  status
) {

  const normalized =
    String(
      status || ""
    )
    .trim()
    .toLowerCase();

  if (
    normalized === "active" ||
    normalized === "trialing"
  ) {
    return normalized;
  }

  if (
    normalized === "past_due" ||
    normalized === "unpaid" ||
    normalized === "canceled" ||
    normalized === "incomplete" ||
    normalized === "incomplete_expired" ||
    normalized === "paused"
  ) {
    return normalized;
  }

  return normalized || "inactive";
}


async function applyStripeSubscriptionToOrganization(
  env,
  subscription,
  forcedStatus = ""
) {

  const subscriptionId =
    String(
      subscription?.id || ""
    );

  const customerId =
    stripeEntityId(
      subscription?.customer
    );

  const registration =
    await findStripeRegistration(
      env,
      {
        subscriptionId,
        customerId
      }
    );

  if (
    !registration ||
    !registration.organization_id
  ) {
    return {
      matched: false
    };
  }

  const firstItem =
    subscription?.items?.data?.[0] ||
    null;

  const stripePriceId =
    String(
      firstItem?.price?.id || ""
    );

  const plan =
    await loadPlanByStripePriceId(
      env,
      stripePriceId
    );

  const billingStatus =
    stripeSubscriptionAccessStatus(
      forcedStatus ||
      subscription?.status ||
      "inactive"
    );

  const now =
    Date.now();

  if (plan) {

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations
      SET
        plan_code = ?,
        plan_name = ?,
        included_minutes = ?,
        viewer_limit = ?,
        billing_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      plan.planCode,
      plan.planName,
      plan.includedMinutes,
      plan.viewerLimit,
      billingStatus,
      now,
      Number(
        registration.organization_id
      )
    )
    .run();

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE stripe_registrations
      SET
        stripe_customer_id = ?,
        stripe_subscription_id = ?,
        plan_code = ?
      WHERE id = ?
    `)
    .bind(
      customerId,
      subscriptionId,
      plan.planCode,
      Number(registration.id)
    )
    .run();

  } else {

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations
      SET
        billing_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      billingStatus,
      now,
      Number(
        registration.organization_id
      )
    )
    .run();
  }

  return {
    matched: true,
    organizationId:
      Number(
        registration.organization_id
      ),
    billingStatus,
    planCode:
      plan?.planCode ||
      registration.plan_code ||
      ""
  };
}


async function applyStripeInvoiceStatus(
  env,
  invoice,
  status
) {

  const subscriptionId =
    stripeEntityId(
      invoice?.subscription
    ) ||
    stripeEntityId(
      invoice?.parent
        ?.subscription_details
        ?.subscription
    );

  const customerId =
    stripeEntityId(
      invoice?.customer
    );

  const registration =
    await findStripeRegistration(
      env,
      {
        subscriptionId,
        customerId
      }
    );

  if (
    !registration ||
    !registration.organization_id
  ) {
    return {
      matched: false
    };
  }

  const now =
    Date.now();

  const normalizedStatus =
    stripeSubscriptionAccessStatus(
      status
    );

  const billingReason =
    String(
      invoice?.billing_reason || ""
    );

  const resetMonthlyUsage =
    normalizedStatus === "active" &&
    (
      billingReason ===
        "subscription_cycle" ||
      billingReason ===
        "subscription_create"
    );

  if (resetMonthlyUsage) {

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations
      SET
        billing_status = ?,
        used_minutes = 0,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      normalizedStatus,
      now,
      Number(
        registration.organization_id
      )
    )
    .run();

  } else {

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations
      SET
        billing_status = ?,
        updated_at = ?
      WHERE id = ?
    `)
    .bind(
      normalizedStatus,
      now,
      Number(
        registration.organization_id
      )
    )
    .run();
  }

  return {
    matched: true,
    organizationId:
      Number(
        registration.organization_id
      ),
    billingStatus:
      normalizedStatus,
    usageReset:
      resetMonthlyUsage
  };
}


async function processStripeWebhookEvent(
  env,
  event
) {

  const type =
    String(
      event?.type || ""
    );

  const object =
    event?.data?.object ||
    {};

  switch (type) {

    case "customer.subscription.created":
    case "customer.subscription.updated":
      return applyStripeSubscriptionToOrganization(
        env,
        object
      );

    case "customer.subscription.deleted":
      return applyStripeSubscriptionToOrganization(
        env,
        object,
        "canceled"
      );

    case "invoice.paid":
      return applyStripeInvoiceStatus(
        env,
        object,
        "active"
      );

    case "invoice.payment_failed":
      return applyStripeInvoiceStatus(
        env,
        object,
        "past_due"
      );

    case "checkout.session.completed": {

      if (
        String(
          object?.metadata?.livebridge_purchase_type || ""
        ) === "marketing_credits"
      ) {
        return completeMarketingCreditPurchase(
          env,
          object
        );
      }

      const subscriptionId =
        stripeEntityId(
          object?.subscription
        );

      const customerId =
        stripeEntityId(
          object?.customer
        );

      let registration =
        await findStripeRegistration(
          env,
          {
            subscriptionId,
            customerId
          }
        );

      /*
      v1.0.35:
      A checkout webhook can arrive before the LiveBridge account exists.
      When it is resent after signup, use the verified Stripe checkout email
      + plan metadata to create the missing Stripe registration link.
      */
      if (
        !registration ||
        !registration.organization_id
      ) {

        const checkoutEmail =
          String(
            object?.customer_details?.email ||
            object?.customer_email ||
            ""
          )
          .trim()
          .toLowerCase();

        const checkoutPlanCode =
          normalizePlanCode(
            object?.metadata
              ?.livebridge_plan_code ||
            ""
          );

        if (
          checkoutEmail &&
          checkoutPlanCode
        ) {

          const organization =
            await env.TRANSLATIONS_DB.prepare(`
              SELECT *
              FROM organizations
              WHERE
                LOWER(COALESCE(account_email, '')) = ?
                OR
                LOWER(COALESCE(email, '')) = ?
              ORDER BY id DESC
              LIMIT 1
            `)
            .bind(
              checkoutEmail,
              checkoutEmail
            )
            .first();

          if (
            organization &&
            normalizePlanCode(
              organization.plan_code
            ) === checkoutPlanCode
          ) {

            const existingLink =
              await env.TRANSLATIONS_DB.prepare(`
                SELECT id
                FROM stripe_registrations
                WHERE
                  clerk_user_id = ?
                  OR organization_id = ?
                  OR checkout_session_id = ?
                LIMIT 1
              `)
              .bind(
                organization.clerk_user_id,
                Number(organization.id),
                String(object?.id || "")
              )
              .first();

            if (!existingLink) {

              await env.TRANSLATIONS_DB.prepare(`
                INSERT INTO stripe_registrations (
                  checkout_session_id,
                  stripe_customer_id,
                  stripe_subscription_id,
                  clerk_user_id,
                  organization_id,
                  plan_code,
                  created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
              `)
              .bind(
                String(object?.id || ""),
                customerId,
                subscriptionId,
                organization.clerk_user_id,
                Number(organization.id),
                checkoutPlanCode,
                Date.now()
              )
              .run();
            }

            registration =
              await findStripeRegistration(
                env,
                {
                  subscriptionId,
                  customerId
                }
              );
          }
        }
      }

      if (
        !registration ||
        !registration.organization_id
      ) {
        return {
          matched: false,
          informational: true
        };
      }

      await env.TRANSLATIONS_DB.prepare(`
        UPDATE stripe_registrations
        SET
          stripe_customer_id = CASE
            WHEN ? != '' THEN ?
            ELSE stripe_customer_id
          END,
          stripe_subscription_id = CASE
            WHEN ? != '' THEN ?
            ELSE stripe_subscription_id
          END
        WHERE id = ?
      `)
      .bind(
        customerId,
        customerId,
        subscriptionId,
        subscriptionId,
        Number(
          registration.id
        )
      )
      .run();

      return {
        matched: true,
        informational: true,
        organizationId:
          Number(
            registration.organization_id
          ),
        backfilled:
          true
      };
    }

    default:
      return {
        matched: false,
        ignored: true
      };
  }
}


async function handleStripeWebhook(
  request,
  env
) {

  if (!env.STRIPE_WEBHOOK_SECRET) {
    return jsonResponse(
      {
        success: false,
        error:
          "STRIPE_WEBHOOK_SECRET is not configured."
      },
      500
    );
  }

  const rawBody =
    await request.text();

  const signatureHeader =
    request.headers.get(
      "Stripe-Signature"
    );

  try {

    await verifyStripeWebhookSignature({
      rawBody,
      signatureHeader,
      secret:
        env.STRIPE_WEBHOOK_SECRET
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Invalid Stripe webhook signature."
      },
      400
    );
  }

  let event;

  try {
    event =
      JSON.parse(rawBody);
  } catch {
    return jsonResponse(
      {
        success: false,
        error:
          "Stripe webhook payload is not valid JSON."
      },
      400
    );
  }

  const eventId =
    String(
      event?.id || ""
    ).trim();

  const eventType =
    String(
      event?.type || "unknown"
    );

  const objectId =
    String(
      event?.data?.object?.id || ""
    );

  if (!eventId) {
    return jsonResponse(
      {
        success: false,
        error:
          "Stripe webhook event ID is missing."
      },
      400
    );
  }

  await ensureStripeWebhookRegistrationTable(
    env
  );

  await ensureStripeLifecycleSchema(
    env
  );

  const previous =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT status
      FROM stripe_webhook_events
      WHERE event_id = ?
      LIMIT 1
    `)
    .bind(eventId)
    .first();

  if (
    String(
      previous?.status || ""
    ) === "processed"
  ) {
    return jsonResponse({
      success: true,
      received: true,
      duplicate: true,
      eventId,
      webhookStatus:
        "processed"
    });
  }

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO stripe_webhook_events (
      event_id,
      event_type,
      object_id,
      status,
      error_text,
      received_at,
      processed_at
    )
    VALUES (?, ?, ?, 'processing', '', ?, NULL)
    ON CONFLICT(event_id)
    DO UPDATE SET
      event_type = excluded.event_type,
      object_id = excluded.object_id,
      status = 'processing',
      error_text = '',
      received_at = excluded.received_at,
      processed_at = NULL
  `)
  .bind(
    eventId,
    eventType,
    objectId,
    Date.now()
  )
  .run();

  try {

    const result =
      await processStripeWebhookEvent(
        env,
        event
      );

    const matched =
      result?.matched === true;

    const ignored =
      result?.ignored === true;

    const finalStatus =
      matched || ignored
        ? "processed"
        : "pending";

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE stripe_webhook_events
      SET
        status = ?,
        error_text = '',
        processed_at = ?
      WHERE event_id = ?
    `)
    .bind(
      finalStatus,
      Date.now(),
      eventId
    )
    .run();

    return jsonResponse({
      success: true,
      received: true,
      eventId,
      eventType,
      result,
      webhookStatus:
        finalStatus,
      retryable:
        finalStatus === "pending"
    });

  } catch (error) {

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE stripe_webhook_events
      SET
        status = 'failed',
        error_text = ?,
        processed_at = ?
      WHERE event_id = ?
    `)
    .bind(
      String(
        error?.message ||
        error ||
        "Webhook processing failed."
      ).substring(0, 1000),
      Date.now(),
      eventId
    )
    .run();

    console.error(
      "Stripe webhook processing failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        received: true,
        error:
          error.message ||
          "Stripe webhook processing failed."
      },
      500
    );
  }
}


async function getOwnedBroadcastOrganization(
  env,
  clerkUserId,
  requestedRoom
) {

  const organization =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM organizations
      WHERE clerk_user_id = ?
      LIMIT 1
    `)
    .bind(clerkUserId)
    .first();

  if (!organization) {
    throw new Error(
      "LiveBridge account not found."
    );
  }

  const baseRoom =
    normalizeRoom(
      organization.room_name
    );

  const subroom =
    normalizeRoom(
      organization.last_subroom || ""
    );

  const effectiveRoom =
    subroom
      ? baseRoom + "-" + subroom
      : baseRoom;

  const room =
    normalizeRoom(
      requestedRoom
    );

  if (
    !room ||
    (
      room !== baseRoom &&
      room !== effectiveRoom
    )
  ) {
    throw new Error(
      "You are not authorized to broadcast to this LiveBridge room."
    );
  }

  if (
    String(
      organization.account_status ||
      ""
    ).toLowerCase() !== "active"
  ) {
    throw new Error(
      "This LiveBridge account is not active."
    );
  }

  if (
    !isBillingAccessActive(
      organization
    )
  ) {
    throw new Error(
      "This LiveBridge subscription is not currently active."
    );
  }

  return {
    organization,
    baseRoom,
    effectiveRoom,
    room
  };
}


function getPlanDefinition(
  planCode
) {

  const plans = {

    starter: {
      code: "starter",
      name: "Starter",
      minutes: 300,
      viewers: 25
    },

    growth: {
      code: "growth",
      name: "Growth",
      minutes: 600,
      viewers: 50
    },

    pro: {
      code: "pro",
      name: "Pro",
      minutes: 1200,
      viewers: 100
    },

    "free-demo": {
      code: "free-demo",
      name: "Free Account Demo",
      minutes: 1200,
      viewers: 100
    }

  };

  return (
    plans[
      String(
        planCode || ""
      ).toLowerCase()
    ] ||
    plans.starter
  );
}



/*
=======================================================
LIVEBRIDGE v1.0.23 PLAN ENTITLEMENTS
=======================================================
*/


const LIVEBRIDGE_FEATURE_OVERRIDE_KEYS = [
  "transcriptAccess",
  "transcriptEmail",
  "scheduledBroadcasts",
  "detailedAnalytics",
  "reportExport",
  "scriptureDetection",
  "prioritySupport",
  "customOnboarding",
  "listenerDataDisplay",
  "marketingCampaigns",
  "organizationStatsApi",
  "organizationStatsApiDisabled"
];


function parseFeatureOverrides(
  rawValue
) {

  let value = rawValue;

  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    value = {};
  }

  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      value = {};
    }
  }

  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    value = {};
  }

  const output = {};

  for (
    const key of
      LIVEBRIDGE_FEATURE_OVERRIDE_KEYS
  ) {
    output[key] =
      value[key] === true ||
      Number(value[key] || 0) === 1;
  }

  return output;
}


function buildEffectivePlanEntitlements(
  organization
) {

  const base =
    buildPlanEntitlements(
      organization?.plan_code ||
      organization?.planCode ||
      "starter"
    );

  const overrides =
    parseFeatureOverrides(
      organization?.feature_overrides_json ??
      organization?.featureOverrides
    );

  const effective = {
    ...base
  };

  for (
    const key of
      LIVEBRIDGE_FEATURE_OVERRIDE_KEYS
  ) {
    if (overrides[key] === true) {
      effective[key] = true;
    }
  }

  if (
    overrides.transcriptAccess === true &&
    Number(
      effective.transcriptRetentionDays ||
      0
    ) < 30
  ) {
    effective.transcriptRetentionDays = 30;
  }

  if (
    overrides.organizationStatsApiDisabled === true
  ) {
    effective.organizationStatsApi = false;
  } else if (
    overrides.organizationStatsApi === true
  ) {
    effective.organizationStatsApi = true;
  }

  return effective;
}


function buildPlanEntitlements(
  planCode
) {

  const code =
    normalizePlanCode(
      planCode || ""
    );

  const starter = {
    transcriptAccess: false,
    transcriptRetentionDays: 0,
    transcriptEmail: false,
    scheduledBroadcasts: false,
    detailedAnalytics: false,
    scriptureDetection: false,
    reportExport: false,
    prioritySupport: false,
    customOnboarding: false,
    organizationStatsApi: false
  };

  const growth = {
    transcriptAccess: true,
    transcriptRetentionDays: 30,
    transcriptEmail: true,
    scheduledBroadcasts: true,
    detailedAnalytics: true,
    scriptureDetection: true,
    reportExport: false,
    prioritySupport: true,
    customOnboarding: false,
    organizationStatsApi: true
  };

  const pro = {
    transcriptAccess: true,
    transcriptRetentionDays: 90,
    transcriptEmail: true,
    scheduledBroadcasts: true,
    detailedAnalytics: true,
    scriptureDetection: true,
    reportExport: true,
    prioritySupport: true,
    customOnboarding: true,
    organizationStatsApi: true
  };

  if (code === "starter") {
    return {
      planCode: code,
      ...starter
    };
  }

  if (code === "growth") {
    return {
      planCode: code,
      ...growth
    };
  }

  if (code === "pro") {
    return {
      planCode: code,
      ...pro
    };
  }

  /*
  Protect existing beta/custom/legacy organizations:
  unknown non-public plans keep full capability until
  explicitly migrated.
  */
  return {
    planCode: code || "legacy",
    ...pro
  };
}



function getEffectiveScriptureDetection(
  organization
) {

  if (!organization) {
    return false;
  }

  const organizationEnabled =
    Number(
      organization.scripture_enabled ||
      0
    ) === 1;

  if (!organizationEnabled) {
    return false;
  }

  const planAllows =
    buildPlanEntitlements(
      organization.plan_code
    ).scriptureDetection === true;

  const adminOverride =
    Number(
      organization.scripture_plan_override ||
      0
    ) === 1;

  const unifiedOverride =
    parseFeatureOverrides(
      organization.feature_overrides_json
    ).scriptureDetection === true;

  return (
    planAllows ||
    adminOverride ||
    unifiedOverride
  );
}


function buildOrganizationAccount(
  row
) {

  if (!row) {
    return null;
  }

  const includedMinutes =
    Number(
      row.included_minutes || 0
    );

  const usedMinutes =
    Number(
      row.used_minutes || 0
    );

  const bonusMinutes =
    Number(
      row.bonus_minutes || 0
    );

  const remainingMinutes =
    Math.max(
      0,
      includedMinutes +
      bonusMinutes -
      usedMinutes
    );

  const baseViewerLimit =
    Number(
      row.viewer_limit || 0
    );

  const viewerOverride =
    row.viewer_override === null ||
    row.viewer_override === undefined
      ? null
      : Number(
          row.viewer_override
        );

  const effectiveViewerLimit =
    viewerOverride !== null
      ? viewerOverride
      : baseViewerLimit;

  return {

    id:
      Number(row.id),

    clerkUserId:
      row.clerk_user_id,

    organizationName:
      row.organization_name,

    accountHolder:
      row.account_holder || "",

    email:
      row.email || "",

    accountEmail:
      row.account_email ||
      row.email ||
      "",

    phone:
      row.phone || "",

    roomName:
      row.room_name,

    roomAlias:
      row.room_alias || "",

    planCode:
      row.plan_code,

    planName:
      row.plan_name,

    planEntitlements:
      buildPlanEntitlements(
        row.plan_code
      ),

    featureOverrides:
      parseFeatureOverrides(
        row.feature_overrides_json
      ),

    entitlements:
      buildEffectivePlanEntitlements(
        row
      ),

    includedMinutes,

    usedMinutes,

    bonusMinutes,

    remainingMinutes,

    remainingHours:
      Math.round(
        remainingMinutes /
        60 *
        100
      ) / 100,

    viewerLimit:
      baseViewerLimit,

    viewerOverride,

    effectiveViewerLimit,

    speechRate:
      Math.min(
        1.50,
        Math.max(
          0.75,
          Number(
            row.speech_rate ?? 1.15
          )
        )
      ),

    scriptureEnabled:
      Number(
        row.scripture_enabled || 0
      ) === 1,

    scripturePlanOverride:
      Number(
        row.scripture_plan_override ||
        0
      ) === 1,

    scriptureEffectiveEnabled:
      getEffectiveScriptureDetection(
        row
      ),

    noAudioTimeoutMinutes:
      Math.max(
        0,
        Number(
          row.no_audio_timeout_minutes ?? 30
        )
      ),

    accountStatus:
      row.account_status,

    billingStatus:
      row.billing_status,

    adminNotes:
      row.admin_notes || "",

    createdAt:
      Number(
        row.created_at || 0
      ),

    updatedAt:
      Number(
        row.updated_at || 0
      )
  };
}

/*
=======================================================
LIVEBRIDGE v1.0.17 ADDITIVE PLAN CATALOG
Current production hard-coded plans remain untouched
until this catalog is verified.
=======================================================
*/

function publicPlanPresentation(
  plan
) {
  if (!plan) {
    return plan;
  }

  const code =
    normalizePlanCode(
      plan.planCode || ""
    );

  const presentations = {
    starter: {
      description:
        "Core live multilingual access for smaller or occasional events, with real-time translated captions and spoken audio, multiple listener languages, room sharing, AI Live Notes, and basic broadcast history.",
      features: [
        "Real-time translated captions",
        "Spoken translated audio",
        "Multiple listener languages",
        "Room links & QR sharing",
        "AI Live Notes",
        "Basic broadcast history & audience stats"
      ]
    },

    growth: {
      description:
        "For regular organizational use. Includes everything in Starter plus transcript access, scheduling, detailed analytics, Scripture/reference detection, API access, and post-broadcast AI follow-up.",
      features: [
        "Everything in Starter",
        "30-day transcript viewing & downloads",
        "Email transcript + AI summary",
        "Scheduled broadcasts",
        "Detailed listener & language analytics",
        "Specialized Scripture/reference detection",
        "Organization Stats API access",
        "Priority email support"
      ]
    },

    pro: {
      description:
        "For larger, frequent or high-capacity use. Includes everything in Growth plus longer transcript retention, downloadable reporting, and custom onboarding/configuration support.",
      features: [
        "Everything in Growth",
        "90-day transcript viewing & downloads",
        "Higher monthly broadcast capacity",
        "Higher simultaneous listener capacity",
        "Downloadable analytics/report export",
        "Organization Stats API access",
        "Priority support",
        "Custom onboarding/configuration support"
      ]
    }
  };

  const presentation =
    presentations[code];

  return presentation
    ? {
        ...plan,
        description:
          presentation.description,
        features:
          presentation.features
      }
    : plan;
}


function buildPlanRecord(row) {
  if (!row) return null;

  let features = [];
  try {
    const parsed = JSON.parse(String(row.features_json || "[]"));
    features = Array.isArray(parsed) ? parsed : [];
  } catch {
    features = [];
  }

  return {
    id: Number(row.id),
    planCode: String(row.plan_code || ""),
    planName: String(row.plan_name || ""),
    description: String(row.description || ""),
    priceCents: Math.max(0, Number(row.price_cents || 0)),
    currency: String(row.currency || "CAD").toUpperCase(),
    billingInterval: String(row.billing_interval || "month").toLowerCase(),
    includedMinutes: Math.max(0, Number(row.included_minutes || 0)),
    viewerLimit: Math.max(1, Number(row.viewer_limit || 1)),
    publicVisible: Number(row.public_visible || 0) === 1,
    active: Number(row.active || 0) === 1,
    displayOrder: Number(row.display_order || 0),
    stripeProductId: String(row.stripe_product_id || ""),
    stripePriceId: String(row.stripe_price_id || ""),
    customPlan: Number(row.custom_plan || 0) === 1,
    features,
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0)
  };
}

async function loadPlans(env, publicOnly = false) {
  const sql = publicOnly
    ? `SELECT * FROM plans
       WHERE active = 1 AND public_visible = 1
       ORDER BY display_order ASC, id ASC`
    : `SELECT * FROM plans
       ORDER BY display_order ASC, id ASC`;

  const result = await env.TRANSLATIONS_DB.prepare(sql).all();
  return (result.results || []).map(buildPlanRecord);
}

function normalizePlanCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}


/*
=======================================================
LIVEBRIDGE v1.0.22 ROOM NAME AVAILABILITY + STRIPE ACCOUNT ENFORCEMENT
Additive only. Existing account creation still works as
before until the signup UI is switched over and verified.
=======================================================
*/

function normalizeRoomName(value) {

  return String(
    value || ""
  )
  .trim()
  .toUpperCase()
  .replace(/&/g, " AND ")
  .replace(/[^A-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .substring(0, 50);
}


function roomNameValidationError(roomName) {

  if (!roomName) {
    return "Room name is required.";
  }

  if (roomName.length < 3) {
    return "Room name must be at least 3 characters.";
  }

  const reserved = new Set([
    "ADMIN",
    "ACCOUNT",
    "SIGNUP",
    "TERMS",
    "PRIVACY",
    "LIVE-STATS",
    "CLIENTPITCH",
    "SUNDAY",
    "TRANSLATE",
    "TRANSLATION",
    "LIVEBRIDGE",
    "API",
    "SUPPORT"
  ]);

  if (reserved.has(roomName)) {
    return "That room name is reserved.";
  }

  return "";
}


/*
=======================================================
LIVEBRIDGE ADMIN AUTHORIZATION
=======================================================
*/

async function verifyAdminRequest(
  request,
  env
) {

  const auth =
    await verifyClerkRequest(
      request
    );

  const admin =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT
        clerk_user_id,
        email,
        display_name,
        role,
        active
      FROM admin_users
      WHERE clerk_user_id = ?
      LIMIT 1
    `)
    .bind(
      auth.clerkUserId
    )
    .first();

  if (
    !admin ||
    Number(admin.active) !== 1
  ) {

    throw new Error(
      "Administrator access required."
    );
  }

  return {
    ...auth,
    admin
  };
}
let returnVisitorSchemaReady = false;

async function ensureReturnVisitorSchema(env) {
  if (returnVisitorSchemaReady) {
    return;
  }

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_visitors (
      organization_id INTEGER NOT NULL,
      room TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      first_visit_day TEXT NOT NULL,
      last_visit_day TEXT NOT NULL,
      visit_days INTEGER NOT NULL DEFAULT 1,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      preferred_language TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (organization_id, visitor_id)
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_visitor_days (
      organization_id INTEGER NOT NULL,
      visitor_id TEXT NOT NULL,
      visit_day TEXT NOT NULL,
      room TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT '',
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      PRIMARY KEY (organization_id, visitor_id, visit_day)
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_return_messages (
      organization_id INTEGER NOT NULL,
      visit_number INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (organization_id, visit_number)
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_organization_visitors_room
    ON organization_visitors (organization_id, room)
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_organization_visitor_days_org_day
    ON organization_visitor_days (organization_id, visit_day)
  `).run();

  returnVisitorSchemaReady = true;
}
__name(ensureReturnVisitorSchema, "ensureReturnVisitorSchema");

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

async function trackAnonymousOrganizationVisitor(
  env,
  organization,
  room,
  visitorId,
  visitDay,
  language
) {
  if (!organization) {
    return null;
  }

  const normalizedVisitorId =
    String(visitorId || "").trim();

  const normalizedVisitDay =
    String(visitDay || "").trim();

  if (
    !/^[A-Za-z0-9_-]{8,200}$/.test(
      normalizedVisitorId
    ) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(
      normalizedVisitDay
    )
  ) {
    return null;
  }

  await ensureReturnVisitorSchema(env);

  const organizationId =
    Number(organization.id || 0);

  if (!organizationId) {
    return null;
  }

  const now = Date.now();
  const normalizedLanguage =
    String(language || "")
      .trim()
      .toLowerCase()
      .slice(0, 40);

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO organization_visitor_days (
      organization_id,
      visitor_id,
      visit_day,
      room,
      language,
      first_seen_at,
      last_seen_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, visitor_id, visit_day)
    DO UPDATE SET
      room = excluded.room,
      language = excluded.language,
      last_seen_at = excluded.last_seen_at
  `)
  .bind(
    organizationId,
    normalizedVisitorId,
    normalizedVisitDay,
    normalizeRoom(room),
    normalizedLanguage,
    now,
    now
  )
  .run();

  const visitStats =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT
        COUNT(*) AS visit_days,
        MIN(visit_day) AS first_visit_day,
        MAX(visit_day) AS last_visit_day
      FROM organization_visitor_days
      WHERE organization_id = ?
        AND visitor_id = ?
    `)
    .bind(
      organizationId,
      normalizedVisitorId
    )
    .first();

  const visitNumber =
    Math.max(
      1,
      Number(visitStats?.visit_days || 1)
    );

  const firstVisitDay =
    String(
      visitStats?.first_visit_day ||
      normalizedVisitDay
    );

  const lastVisitDay =
    String(
      visitStats?.last_visit_day ||
      normalizedVisitDay
    );

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO organization_visitors (
      organization_id,
      room,
      visitor_id,
      first_visit_day,
      last_visit_day,
      visit_days,
      first_seen_at,
      last_seen_at,
      preferred_language
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, visitor_id)
    DO UPDATE SET
      room = excluded.room,
      first_visit_day = MIN(
        organization_visitors.first_visit_day,
        excluded.first_visit_day
      ),
      last_visit_day = MAX(
        organization_visitors.last_visit_day,
        excluded.last_visit_day
      ),
      visit_days = excluded.visit_days,
      last_seen_at = excluded.last_seen_at,
      preferred_language = excluded.preferred_language
  `)
  .bind(
    organizationId,
    normalizeRoom(room),
    normalizedVisitorId,
    firstVisitDay,
    lastVisitDay,
    visitNumber,
    now,
    now,
    normalizedLanguage
  )
  .run();

  let returnMessage = "";

  if (visitNumber >= 2) {
    const messageRow =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT message
        FROM organization_return_messages
        WHERE organization_id = ?
          AND visit_number = ?
        LIMIT 1
      `)
      .bind(
        organizationId,
        visitNumber
      )
      .first();

    returnMessage =
      String(messageRow?.message || "").trim();
  }

  return {
    organizationId,
    organizationName:
      String(
        organization.organization_name || ""
      ),
    visitNumber,
    firstVisitDay,
    lastVisitDay,
    returning:
      visitNumber > 1,
    returnMessage
  };
}
__name(
  trackAnonymousOrganizationVisitor,
  "trackAnonymousOrganizationVisitor"
);

async function ensureAnalyticsTables(env) {
  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS broadcast_sessions (
      id TEXT PRIMARY KEY,
      room TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      peak_listeners INTEGER NOT NULL DEFAULT 0
    )
  `).run();
  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS listener_sessions (
      id TEXT PRIMARY KEY,
      broadcast_id TEXT NOT NULL,
      room TEXT NOT NULL,
      language TEXT NOT NULL,
      joined_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL,
      ended_at INTEGER
    )
  `).run();
  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_listener_sessions_broadcast
    ON listener_sessions (broadcast_id)
  `).run();
  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_broadcast_sessions_room_started
    ON broadcast_sessions (room, started_at)
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_stats_reset (
      organization_id INTEGER PRIMARY KEY,
      reset_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();

  await ensureBroadcastSafetySchema(env);
  await ensureReturnVisitorSchema(env);
}
__name(ensureAnalyticsTables, "ensureAnalyticsTables");
async function getActiveBroadcast(env, room) {
  /*
    v1.0.11:
    A broadcast_session row with ended_at = NULL is not enough to prove that
    a broadcast is still live. A browser crash can leave that historical row
    open even after its active_broadcasts heartbeat has expired.

    Only treat a broadcast as active when it has a matching, fresh
    active_broadcasts heartbeat for the same room/start time.
  */
  const freshAfter =
    Date.now() - 90000;

  return env.TRANSLATIONS_DB.prepare(`
    SELECT
      bs.id,
      bs.room,
      bs.started_at,
      bs.ended_at,
      bs.peak_listeners
    FROM broadcast_sessions bs
    INNER JOIN active_broadcasts ab
      ON ab.room = bs.room
      AND ab.started_at = bs.started_at
    WHERE
      bs.room = ?
      AND bs.ended_at IS NULL
      AND ab.last_seen >= ?
    ORDER BY bs.started_at DESC
    LIMIT 1
  `)
  .bind(
    room,
    freshAfter
  )
  .first();
}
__name(getActiveBroadcast, "getActiveBroadcast");
async function buildBroadcastSummary(env, broadcastId) {
  await ensureBroadcastSafetySchema(env);

  const broadcast = await env.TRANSLATIONS_DB.prepare(`
    SELECT
      id,
      room,
      started_at,
      ended_at,
      peak_listeners,
      heartbeat_requests,
      status_polls,
      analytics_requests,
      audio_chunks,
      source_final_requests,
      listener_heartbeats,
      tts_requests,
      auto_end_reason
    FROM broadcast_sessions
    WHERE id = ?
  `).bind(broadcastId).first();
  if (!broadcast) return null;
  const effectiveEnd = Number(broadcast.ended_at || Date.now());
  const totals = await env.TRANSLATIONS_DB.prepare(`
    SELECT
      COUNT(*) AS total_listeners,
      COALESCE(SUM(
        MAX(0, COALESCE(ended_at, last_seen, ?) - joined_at)
      ), 0) AS total_listening_ms,
      COALESCE(AVG(
        MAX(0, COALESCE(ended_at, last_seen, ?) - joined_at)
      ), 0) AS average_listening_ms
    FROM listener_sessions
    WHERE broadcast_id = ?
  `).bind(effectiveEnd, effectiveEnd, broadcastId).first();
  const languageResult = await env.TRANSLATIONS_DB.prepare(`
    SELECT
      language,
      COUNT(*) AS listeners,
      COALESCE(SUM(
        MAX(0, COALESCE(ended_at, last_seen, ?) - joined_at)
      ), 0) AS total_listening_ms,
      COALESCE(AVG(
        MAX(0, COALESCE(ended_at, last_seen, ?) - joined_at)
      ), 0) AS average_listening_ms
    FROM listener_sessions
    WHERE broadcast_id = ?
    GROUP BY language
    ORDER BY listeners DESC, language ASC
  `).bind(effectiveEnd, effectiveEnd, broadcastId).all();
  return {
    success: true,
    broadcastId: broadcast.id,
    room: broadcast.room,
    startedAt: Number(broadcast.started_at),
    endedAt: broadcast.ended_at ? Number(broadcast.ended_at) : null,
    durationMs: Math.max(
      0,
      effectiveEnd - Number(broadcast.started_at)
    ),
    totalListeners: Number(totals?.total_listeners || 0),
    peakListeners: Number(broadcast.peak_listeners || 0),
    totalListeningMs: Number(totals?.total_listening_ms || 0),
    averageListeningMs: Math.round(
      Number(totals?.average_listening_ms || 0)
    ),

    requestMetrics: {
      heartbeatRequests:
        Number(broadcast.heartbeat_requests || 0),
      statusPolls:
        Number(broadcast.status_polls || 0),
      analyticsRequests:
        Number(broadcast.analytics_requests || 0),
      audioChunks:
        Number(broadcast.audio_chunks || 0),
      sourceFinalRequests:
        Number(broadcast.source_final_requests || 0),
      listenerHeartbeats:
        Number(broadcast.listener_heartbeats || 0),
      ttsRequests:
        Number(broadcast.tts_requests || 0),
      totalWorkerRequests:
        Number(broadcast.heartbeat_requests || 0) +
        Number(broadcast.status_polls || 0) +
        Number(broadcast.analytics_requests || 0) +
        Number(broadcast.audio_chunks || 0) +
        Number(broadcast.source_final_requests || 0) +
        Number(broadcast.listener_heartbeats || 0) +
        Number(broadcast.tts_requests || 0)
    },

    autoEndReason:
      broadcast.auto_end_reason || "",

    languages: (languageResult?.results || []).map((row) => ({
      language: row.language,
      listeners: Number(row.listeners || 0),
      totalListeningMs: Number(row.total_listening_ms || 0),
      averageListeningMs: Math.round(
        Number(row.average_listening_ms || 0)
      )
    }))
  };
}
__name(buildBroadcastSummary, "buildBroadcastSummary");

const LIVEBRIDGE_STATS_API_SCOPES = {
  overview: "Overview totals",
  broadcasts: "Broadcast history",
  listeners: "Listener analytics",
  languages: "Language analytics",
  technicalUsage: "Technical / usage metrics",
  returnVisitors: "Return visitor analytics",
  marketing: "Marketing analytics"
};

function defaultOrganizationStatsApiScopes() {
  return Object.fromEntries(
    Object.keys(
      LIVEBRIDGE_STATS_API_SCOPES
    ).map(key => [key, true])
  );
}

function normalizeOrganizationStatsApiScopes(value) {
  const source =
    value &&
    typeof value === "object"
      ? value
      : {};

  const normalized = {};

  for (
    const key of
      Object.keys(
        LIVEBRIDGE_STATS_API_SCOPES
      )
  ) {
    normalized[key] =
      source[key] !== false;
  }

  return normalized;
}

async function ensureOrganizationStatsApiSchema(env) {
  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_stats_api_access (
      organization_id INTEGER PRIMARY KEY,
      api_key_hash TEXT NOT NULL DEFAULT '',
      key_prefix TEXT NOT NULL DEFAULT '',
      scopes_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      rotated_at INTEGER,
      revoked_at INTEGER,
      last_used_at INTEGER
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_stats_api_hash
    ON organization_stats_api_access (api_key_hash)
    WHERE api_key_hash != ''
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS organization_stats_api_rate_state (
      organization_id INTEGER PRIMARY KEY,
      window_started_at INTEGER NOT NULL DEFAULT 0,
      window_count INTEGER NOT NULL DEFAULT 0,
      last_request_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `).run();
}

function generateOrganizationStatsApiKey() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  const secret =
    Array.from(bytes)
      .map(byte =>
        byte.toString(16)
          .padStart(2, "0")
      )
      .join("");

  return "lb_org_" + secret;
}

function organizationStatsApiPolicy(
  organization
) {
  const planCode =
    normalizePlanCode(
      organization?.plan_code ||
      organization?.planCode ||
      ""
    );

  const overrides =
    parseFeatureOverrides(
      organization?.feature_overrides_json ??
      organization?.featureOverrides
    );

  const planAllows =
    buildPlanEntitlements(
      planCode || "legacy"
    ).organizationStatsApi === true;

  let enabled =
    planAllows;

  let accessSource =
    planAllows
      ? "plan"
      : "not_in_plan";

  if (
    overrides.organizationStatsApiDisabled === true
  ) {
    enabled = false;
    accessSource = "admin_disabled";
  } else if (
    overrides.organizationStatsApi === true
  ) {
    enabled = true;
    accessSource = "admin_enabled";
  }

  const proStyle =
    (
      planCode === "pro" ||
      (
        planCode !== "starter" &&
        planCode !== "growth"
      )
    );

  const minIntervalSeconds =
    proStyle
      ? 15
      : 60;

  return {
    enabled,
    accessSource,
    planCode:
      planCode || "legacy",
    minIntervalSeconds,
    cacheSeconds: 60,
    hardLimitPerMinute: 60
  };
}


async function organizationForStatsApiAccount(
  request,
  env
) {
  const auth =
    await verifyClerkRequest(
      request
    );

  const organization =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM organizations
      WHERE clerk_user_id = ?
      LIMIT 1
    `)
    .bind(
      auth.clerkUserId
    )
    .first();

  if (!organization) {
    throw new Error(
      "LiveBridge account not found."
    );
  }

  const policy =
    organizationStatsApiPolicy(
      organization
    );

  if (!policy.enabled) {
    const error =
      new Error(
        "Organization Stats API is not enabled for this account."
      );

    error.code =
      "STATS_API_DISABLED";

    throw error;
  }

  return organization;
}

async function authenticateOrganizationStatsApi(
  request,
  env
) {
  await ensureOrganizationStatsApiSchema(
    env
  );

  const authorization =
    String(
      request.headers.get(
        "Authorization"
      ) || ""
    ).trim();

  const apiKey =
    authorization
      .replace(
        /^Bearer\s+/i,
        ""
      )
      .trim();

  if (
    !apiKey ||
    !apiKey.startsWith(
      "lb_org_"
    )
  ) {
    const error =
      new Error(
        "A valid LiveBridge organization API key is required."
      );

    error.code =
      "API_KEY_REQUIRED";

    throw error;
  }

  const keyHash =
    await sha256(apiKey);

  const access =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM organization_stats_api_access
      WHERE api_key_hash = ?
        AND api_key_hash != ''
      LIMIT 1
    `)
    .bind(
      keyHash
    )
    .first();

  if (!access) {
    const error =
      new Error(
        "The LiveBridge organization API key is invalid or revoked."
      );

    error.code =
      "API_KEY_INVALID";

    throw error;
  }

  const organization =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM organizations
      WHERE id = ?
      LIMIT 1
    `)
    .bind(
      Number(
        access.organization_id
      )
    )
    .first();

  if (!organization) {
    throw new Error(
      "LiveBridge organization not found."
    );
  }

  const policy =
    organizationStatsApiPolicy(
      organization
    );

  if (!policy.enabled) {
    const error =
      new Error(
        "Organization Stats API access is disabled."
      );

    error.code =
      "STATS_API_DISABLED";

    throw error;
  }

  await env.TRANSLATIONS_DB.prepare(`
    UPDATE organization_stats_api_access
    SET last_used_at = ?, updated_at = ?
    WHERE organization_id = ?
  `)
  .bind(
    Date.now(),
    Date.now(),
    Number(
      organization.id
    )
  )
  .run();

  return {
    organization,
    access,
    policy,
    scopes:
      normalizeOrganizationStatsApiScopes(
        safeJson(
          access.scopes_json,
          {}
        )
      )
  };
}

async function enforceOrganizationStatsApiRateLimit(
  env,
  organizationId,
  policy
) {
  await ensureOrganizationStatsApiSchema(
    env
  );

  const id =
    Number(
      organizationId || 0
    );

  const now =
    Date.now();

  const minIntervalMs =
    Math.max(
      1,
      Number(
        policy?.minIntervalSeconds ||
        60
      )
    ) * 1000;

  const hardLimit =
    Math.max(
      1,
      Number(
        policy?.hardLimitPerMinute ||
        60
      )
    );

  const row =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM organization_stats_api_rate_state
      WHERE organization_id = ?
      LIMIT 1
    `)
    .bind(id)
    .first();

  const lastRequestAt =
    Number(
      row?.last_request_at ||
      0
    );

  if (
    lastRequestAt > 0 &&
    now - lastRequestAt <
      minIntervalMs
  ) {
    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          (
            minIntervalMs -
            (
              now -
              lastRequestAt
            )
          ) / 1000
        )
      );

    const error =
      new Error(
        "Stats API rate limit reached. Try again in " +
        retryAfterSeconds +
        " seconds."
      );

    error.code =
      "STATS_API_RATE_LIMITED";

    error.retryAfterSeconds =
      retryAfterSeconds;

    error.rateLimit =
      Math.max(
        1,
        Math.floor(
          60 /
          Number(
            policy?.minIntervalSeconds ||
            60
          )
        )
      );

    throw error;
  }

  let windowStartedAt =
    Number(
      row?.window_started_at ||
      0
    );

  let windowCount =
    Number(
      row?.window_count ||
      0
    );

  if (
    !windowStartedAt ||
    now -
      windowStartedAt >=
      60000
  ) {
    windowStartedAt = now;
    windowCount = 0;
  }

  if (
    windowCount >=
    hardLimit
  ) {
    const retryAfterSeconds =
      Math.max(
        1,
        Math.ceil(
          (
            60000 -
            (
              now -
              windowStartedAt
            )
          ) / 1000
        )
      );

    const error =
      new Error(
        "Stats API safety limit reached. Try again in " +
        retryAfterSeconds +
        " seconds."
      );

    error.code =
      "STATS_API_RATE_LIMITED";

    error.retryAfterSeconds =
      retryAfterSeconds;

    error.rateLimit =
      hardLimit;

    throw error;
  }

  const nextCount =
    windowCount + 1;

  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO organization_stats_api_rate_state (
      organization_id,
      window_started_at,
      window_count,
      last_request_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(organization_id)
    DO UPDATE SET
      window_started_at =
        excluded.window_started_at,
      window_count =
        excluded.window_count,
      last_request_at =
        excluded.last_request_at,
      updated_at =
        excluded.updated_at
  `)
  .bind(
    id,
    windowStartedAt,
    nextCount,
    now,
    now
  )
  .run();

  return {
    limitPerMinute:
      Math.max(
        1,
        Math.floor(
          60 /
          Number(
            policy?.minIntervalSeconds ||
            60
          )
        )
      ),
    hardLimitPerMinute:
      hardLimit,
    remaining:
      Math.max(
        0,
        hardLimit -
        nextCount
      )
  };
}


function organizationStatsApiCacheRequest(
  organizationId,
  scopes,
  url
) {
  const enabledScopeKey =
    Object.keys(
      scopes || {}
    )
    .filter(
      key =>
        scopes[key] === true
    )
    .sort()
    .join(",");

  const source =
    new URL(url.toString());

  const cacheUrl =
    new URL(
      source.origin +
      "/__livebridge_stats_api_cache/v1/" +
      Number(
        organizationId || 0
      )
    );

  const params =
    new URLSearchParams(
      source.search
    );

  const sortedKeys =
    Array.from(
      new Set(
        Array.from(
          params.keys()
        )
      )
    ).sort();

  for (
    const key of
      sortedKeys
  ) {
    const values =
      params.getAll(key)
        .sort();

    for (
      const value of
        values
    ) {
      cacheUrl.searchParams.append(
        key,
        value
      );
    }
  }

  cacheUrl.searchParams.set(
    "_scopes",
    enabledScopeKey
  );

  return new Request(
    cacheUrl.toString(),
    {
      method: "GET"
    }
  );
}


async function organizationStatsApiPayloadWithCache(
  env,
  organization,
  scopes,
  url,
  cacheSeconds = 60
) {
  const ttl =
    Math.max(
      0,
      Math.floor(
        Number(
          cacheSeconds || 0
        )
      )
    );

  const cacheRequest =
    organizationStatsApiCacheRequest(
      organization.id,
      scopes,
      url
    );

  if (
    ttl > 0 &&
    typeof caches !== "undefined" &&
    caches.default
  ) {
    const cached =
      await caches.default.match(
        cacheRequest
      );

    if (cached) {
      try {
        return {
          payload:
            await cached.json(),
          cacheStatus:
            "HIT"
        };
      } catch {
        // Ignore a malformed cache entry.
      }
    }
  }

  const payload =
    await buildOrganizationStatsApiPayload(
      env,
      organization,
      scopes,
      url
    );

  if (
    ttl > 0 &&
    typeof caches !== "undefined" &&
    caches.default
  ) {
    const cacheResponse =
      new Response(
        JSON.stringify(payload),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
            "Cache-Control":
              "public, max-age=" +
              ttl
          }
        }
      );

    await caches.default.put(
      cacheRequest,
      cacheResponse
    );
  }

  return {
    payload,
    cacheStatus:
      "MISS"
  };
}


function parseStatsApiTime(
  value,
  fallback
) {
  const raw =
    String(
      value == null
        ? ""
        : value
    ).trim();

  if (!raw) {
    return fallback;
  }

  const numeric =
    Number(raw);

  if (
    Number.isFinite(numeric) &&
    numeric > 0
  ) {
    return Math.floor(numeric);
  }

  const parsed =
    Date.parse(raw);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;
}

async function buildMarketingStatsApiAnalytics(
  env,
  organizationId
) {
  await ensureMarketingSchema(env);
  await ensureMarketingCreditsSchema(env);

  const id =
    Number(
      organizationId || 0
    );

  const now =
    Date.now();

  const [
    campaignsResult,
    refundsResult,
    creditAccount
  ] =
    await Promise.all([
      env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          language_code,
          language_name,
          campaign_json,
          created_at
        FROM marketing_campaigns
        WHERE organization_id = ?
        ORDER BY created_at DESC
        LIMIT 5000
      `)
      .bind(id)
      .all(),

      env.TRANSLATIONS_DB.prepare(`
        SELECT
          campaign_id,
          requested_at
        FROM marketing_generation_refunds
        WHERE organization_id = ?
        ORDER BY requested_at DESC
        LIMIT 5000
      `)
      .bind(id)
      .all(),

      env.TRANSLATIONS_DB.prepare(`
        SELECT
          balance,
          lifetime_purchased,
          lifetime_used
        FROM marketing_credit_accounts
        WHERE organization_id = ?
        LIMIT 1
      `)
      .bind(id)
      .first()
    ]);

  const refunds =
    refundsResult.results || [];

  const refundedCampaignIds =
    new Set(
      refunds.map(item =>
        String(
          item.campaign_id || ""
        )
      )
    );

  const campaigns =
    (campaignsResult.results || [])
      .map(row => {
        const campaign =
          safeJson(
            row.campaign_json,
            {}
          ) || {};

        return {
          id:
            String(
              row.id || ""
            ),
          createdAt:
            Number(
              row.created_at ||
              campaign.createdAt ||
              0
            ),
          languageCode:
            String(
              row.language_code ||
              campaign.languageCode ||
              ""
            ),
          languageName:
            String(
              row.language_name ||
              campaign.languageName ||
              LIVEBRIDGE_MARKETING_LANGUAGES[
                row.language_code ||
                campaign.languageCode
              ] ||
              "Unknown"
            ),
          visualStyle:
            String(
              campaign.visualStyle ||
              "unknown"
            ),
          audienceFocus:
            String(
              campaign.audienceFocus ||
              "unknown"
            ),
          imageryTone:
            String(
              campaign.imageryTone ||
              "unknown"
            ),
          includeTearOff:
            campaign.includeTearOff !== false,
          includeQr:
            campaign.includeQr !== false,
          creditCharged:
            campaign.creditCharged === true
        };
      })
      .filter(item =>
        item.creditCharged === true
      );

  function periodStats(
    startTimestamp
  ) {
    const generated =
      campaigns.filter(item =>
        item.createdAt >=
        startTimestamp
      ).length;

    const creditsReturned =
      refunds.filter(item =>
        Number(
          item.requested_at ||
          0
        ) >= startTimestamp
      ).length;

    return {
      generated,
      creditsReturned,
      netCredits:
        Math.max(
          0,
          generated -
          creditsReturned
        )
    };
  }

  function breakdownBy(
    key,
    labelKey = key
  ) {
    const map =
      new Map();

    for (
      const item of
        campaigns
    ) {
      const value =
        String(
          item[key] ||
          "unknown"
        );

      if (
        !map.has(value)
      ) {
        map.set(
          value,
          {
            key:
              value,
            label:
              String(
                item[labelKey] ||
                value
              ),
            generated:
              0,
            creditsReturned:
              0
          }
        );
      }

      const row =
        map.get(value);

      row.generated += 1;

      if (
        refundedCampaignIds.has(
          item.id
        )
      ) {
        row.creditsReturned +=
          1;
      }
    }

    return Array.from(
      map.values()
    )
    .map(item => ({
      ...item,
      netCredits:
        Math.max(
          0,
          item.generated -
          item.creditsReturned
        )
    }))
    .sort(
      (a, b) =>
        b.generated -
        a.generated ||
        String(a.label)
          .localeCompare(
            String(b.label)
          )
    );
  }

  const combinationsMap =
    new Map();

  for (
    const item of
      campaigns
  ) {
    const key = [
      item.languageCode ||
        item.languageName,
      item.visualStyle,
      item.audienceFocus,
      item.imageryTone
    ].join("|");

    if (
      !combinationsMap.has(
        key
      )
    ) {
      combinationsMap.set(
        key,
        {
          languageCode:
            item.languageCode,
          languageName:
            item.languageName,
          visualStyle:
            item.visualStyle,
          audienceFocus:
            item.audienceFocus,
          imageryTone:
            item.imageryTone,
          generated:
            0,
          creditsReturned:
            0
        }
      );
    }

    const combo =
      combinationsMap.get(
        key
      );

    combo.generated += 1;

    if (
      refundedCampaignIds.has(
        item.id
      )
    ) {
      combo.creditsReturned +=
        1;
    }
  }

  const combinations =
    Array.from(
      combinationsMap.values()
    )
    .map(item => ({
      ...item,
      netCredits:
        Math.max(
          0,
          item.generated -
          item.creditsReturned
        )
    }))
    .sort(
      (a, b) =>
        b.generated -
        a.generated
    )
    .slice(
      0,
      50
    );

  const recentGenerations =
    campaigns
      .slice(0, 50)
      .map(item => ({
        campaignId:
          item.id,
        createdAt:
          item.createdAt,
        languageCode:
          item.languageCode,
        languageName:
          item.languageName,
        visualStyle:
          item.visualStyle,
        audienceFocus:
          item.audienceFocus,
        imageryTone:
          item.imageryTone,
        includeTearOff:
          item.includeTearOff,
        includeQr:
          item.includeQr,
        creditReturned:
          refundedCampaignIds.has(
            item.id
          )
      }));

  return {
    currentCreditBalance:
      Math.max(
        0,
        Number(
          creditAccount?.balance ||
          0
        )
      ),
    lifetimeCreditsPurchased:
      Math.max(
        0,
        Number(
          creditAccount
            ?.lifetime_purchased ||
          0
        )
      ),
    lifetimeNetCreditsUsed:
      Math.max(
        0,
        Number(
          creditAccount
            ?.lifetime_used ||
          0
        )
      ),
    periods: {
      last24Hours:
        periodStats(
          now -
          24 * 60 * 60 * 1000
        ),
      last7Days:
        periodStats(
          now -
          7 * 24 * 60 * 60 * 1000
        ),
      last30Days:
        periodStats(
          now -
          30 * 24 * 60 * 60 * 1000
        ),
      last365Days:
        periodStats(
          now -
          365 * 24 * 60 * 60 * 1000
        ),
      lifetime:
        periodStats(0)
    },
    languages:
      breakdownBy(
        "languageCode",
        "languageName"
      ),
    visualStyles:
      breakdownBy(
        "visualStyle"
      ),
    audienceFocus:
      breakdownBy(
        "audienceFocus"
      ),
    imageryTones:
      breakdownBy(
        "imageryTone"
      ),
    combinations,
    recentGenerations
  };
}


async function buildOrganizationStatsApiPayload(
  env,
  organization,
  scopes,
  url
) {
  await ensureAnalyticsTables(env);

  const now =
    Date.now();

  const from =
    parseStatsApiTime(
      url.searchParams.get("from"),
      0
    );

  const to =
    parseStatsApiTime(
      url.searchParams.get("to"),
      now
    );

  const limit =
    Math.min(
      500,
      Math.max(
        1,
        Math.floor(
          Number(
            url.searchParams.get(
              "limit"
            ) || 100
          )
        )
      )
    );

  const requestedScope =
    String(
      url.searchParams.get(
        "scope"
      ) || "all"
    ).trim();

  const allowedScopeKeys =
    Object.keys(
      LIVEBRIDGE_STATS_API_SCOPES
    );

  if (
    requestedScope !== "all" &&
    !allowedScopeKeys.includes(
      requestedScope
    )
  ) {
    const error =
      new Error(
        "Unknown Stats API scope."
      );

    error.code =
      "UNKNOWN_SCOPE";

    throw error;
  }

  if (
    requestedScope !== "all" &&
    scopes[requestedScope] !== true
  ) {
    const error =
      new Error(
        "That Stats API category is disabled by the organization."
      );

    error.code =
      "SCOPE_DISABLED";

    throw error;
  }

  const include =
    key =>
      scopes[key] === true &&
      (
        requestedScope === "all" ||
        requestedScope === key
      );

  const baseRoom =
    normalizeRoom(
      organization.room_name
    );

  const rangeFrom =
    Math.max(0, from);

  const rangeTo =
    Math.max(
      rangeFrom,
      to
    );

  const roomPattern =
    baseRoom + "-%";

  const [
    broadcastAggregate,
    listenerAggregate,
    languageTotalsResult,
    detailBroadcastResult,
    detailListenerResult,
    detailLanguageResult
  ] =
    await Promise.all([
      env.TRANSLATIONS_DB.prepare(`
        SELECT
          COUNT(*) AS broadcasts,
          COALESCE(
            MAX(peak_listeners),
            0
          ) AS highest_peak_audience,
          COALESCE(
            SUM(heartbeat_requests),
            0
          ) AS heartbeat_requests,
          COALESCE(
            SUM(status_polls),
            0
          ) AS status_polls,
          COALESCE(
            SUM(analytics_requests),
            0
          ) AS analytics_requests,
          COALESCE(
            SUM(audio_chunks),
            0
          ) AS audio_chunks,
          COALESCE(
            SUM(source_final_requests),
            0
          ) AS source_final_requests,
          COALESCE(
            SUM(listener_heartbeats),
            0
          ) AS listener_heartbeats,
          COALESCE(
            SUM(tts_requests),
            0
          ) AS tts_requests
        FROM broadcast_sessions
        WHERE
          (
            room = ?
            OR room LIKE ?
          )
          AND started_at >= ?
          AND started_at <= ?
      `)
      .bind(
        baseRoom,
        roomPattern,
        rangeFrom,
        rangeTo
      )
      .first(),

      env.TRANSLATIONS_DB.prepare(`
        SELECT
          COUNT(*) AS total_listeners,
          COALESCE(
            SUM(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS total_listening_ms,
          COALESCE(
            AVG(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS average_listening_ms,
          COUNT(
            DISTINCT ls.language
          ) AS unique_languages
        FROM listener_sessions ls
        INNER JOIN broadcast_sessions bs
          ON bs.id = ls.broadcast_id
        WHERE
          (
            bs.room = ?
            OR bs.room LIKE ?
          )
          AND bs.started_at >= ?
          AND bs.started_at <= ?
      `)
      .bind(
        now,
        now,
        baseRoom,
        roomPattern,
        rangeFrom,
        rangeTo
      )
      .first(),

      env.TRANSLATIONS_DB.prepare(`
        SELECT
          ls.language AS language,
          COUNT(*) AS listeners,
          COALESCE(
            SUM(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS total_listening_ms,
          COALESCE(
            AVG(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS average_listening_ms
        FROM listener_sessions ls
        INNER JOIN broadcast_sessions bs
          ON bs.id = ls.broadcast_id
        WHERE
          (
            bs.room = ?
            OR bs.room LIKE ?
          )
          AND bs.started_at >= ?
          AND bs.started_at <= ?
        GROUP BY ls.language
        ORDER BY listeners DESC, language ASC
      `)
      .bind(
        now,
        now,
        baseRoom,
        roomPattern,
        rangeFrom,
        rangeTo
      )
      .all(),

      env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          room,
          started_at,
          ended_at,
          peak_listeners,
          heartbeat_requests,
          status_polls,
          analytics_requests,
          audio_chunks,
          source_final_requests,
          listener_heartbeats,
          tts_requests,
          auto_end_reason
        FROM broadcast_sessions
        WHERE
          (
            room = ?
            OR room LIKE ?
          )
          AND started_at >= ?
          AND started_at <= ?
        ORDER BY started_at DESC
        LIMIT ?
      `)
      .bind(
        baseRoom,
        roomPattern,
        rangeFrom,
        rangeTo,
        limit
      )
      .all(),

      env.TRANSLATIONS_DB.prepare(`
        WITH selected AS (
          SELECT id
          FROM broadcast_sessions
          WHERE
            (
              room = ?
              OR room LIKE ?
            )
            AND started_at >= ?
            AND started_at <= ?
          ORDER BY started_at DESC
          LIMIT ?
        )
        SELECT
          ls.broadcast_id AS broadcast_id,
          COUNT(*) AS total_listeners,
          COALESCE(
            SUM(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS total_listening_ms,
          COALESCE(
            AVG(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS average_listening_ms
        FROM listener_sessions ls
        INNER JOIN selected s
          ON s.id = ls.broadcast_id
        INNER JOIN broadcast_sessions bs
          ON bs.id = ls.broadcast_id
        GROUP BY ls.broadcast_id
      `)
      .bind(
        baseRoom,
        roomPattern,
        rangeFrom,
        rangeTo,
        limit,
        now,
        now
      )
      .all(),

      env.TRANSLATIONS_DB.prepare(`
        WITH selected AS (
          SELECT id
          FROM broadcast_sessions
          WHERE
            (
              room = ?
              OR room LIKE ?
            )
            AND started_at >= ?
            AND started_at <= ?
          ORDER BY started_at DESC
          LIMIT ?
        )
        SELECT
          ls.broadcast_id AS broadcast_id,
          ls.language AS language,
          COUNT(*) AS listeners,
          COALESCE(
            SUM(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS total_listening_ms,
          COALESCE(
            AVG(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  bs.ended_at,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS average_listening_ms
        FROM listener_sessions ls
        INNER JOIN selected s
          ON s.id = ls.broadcast_id
        INNER JOIN broadcast_sessions bs
          ON bs.id = ls.broadcast_id
        GROUP BY
          ls.broadcast_id,
          ls.language
        ORDER BY
          ls.broadcast_id,
          listeners DESC,
          language ASC
      `)
      .bind(
        baseRoom,
        roomPattern,
        rangeFrom,
        rangeTo,
        limit,
        now,
        now
      )
      .all()
    ]);

  const listenerByBroadcast =
    new Map(
      (detailListenerResult.results || [])
        .map(row => [
          String(
            row.broadcast_id || ""
          ),
          row
        ])
    );

  const languagesByBroadcast =
    new Map();

  for (
    const row of
      detailLanguageResult.results || []
  ) {
    const broadcastId =
      String(
        row.broadcast_id || ""
      );

    if (
      !languagesByBroadcast.has(
        broadcastId
      )
    ) {
      languagesByBroadcast.set(
        broadcastId,
        []
      );
    }

    languagesByBroadcast
      .get(broadcastId)
      .push({
        language:
          String(
            row.language || ""
          ),
        listeners:
          Number(
            row.listeners || 0
          ),
        totalListeningMs:
          Number(
            row.total_listening_ms ||
            0
          ),
        averageListeningMs:
          Math.round(
            Number(
              row.average_listening_ms ||
              0
            )
          )
      });
  }

  const summaries =
    (detailBroadcastResult.results || [])
      .map(broadcast => {
        const broadcastId =
          String(
            broadcast.id || ""
          );

        const listener =
          listenerByBroadcast.get(
            broadcastId
          ) || {};

        const effectiveEnd =
          Number(
            broadcast.ended_at ||
            now
          );

        return {
          success: true,
          broadcastId,
          room:
            String(
              broadcast.room || ""
            ),
          startedAt:
            Number(
              broadcast.started_at ||
              0
            ),
          endedAt:
            broadcast.ended_at
              ? Number(
                  broadcast.ended_at
                )
              : null,
          durationMs:
            Math.max(
              0,
              effectiveEnd -
              Number(
                broadcast.started_at ||
                0
              )
            ),
          totalListeners:
            Number(
              listener.total_listeners ||
              0
            ),
          peakListeners:
            Number(
              broadcast.peak_listeners ||
              0
            ),
          totalListeningMs:
            Number(
              listener.total_listening_ms ||
              0
            ),
          averageListeningMs:
            Math.round(
              Number(
                listener.average_listening_ms ||
                0
              )
            ),
          requestMetrics: {
            heartbeatRequests:
              Number(
                broadcast.heartbeat_requests ||
                0
              ),
            statusPolls:
              Number(
                broadcast.status_polls ||
                0
              ),
            analyticsRequests:
              Number(
                broadcast.analytics_requests ||
                0
              ),
            audioChunks:
              Number(
                broadcast.audio_chunks ||
                0
              ),
            sourceFinalRequests:
              Number(
                broadcast.source_final_requests ||
                0
              ),
            listenerHeartbeats:
              Number(
                broadcast.listener_heartbeats ||
                0
              ),
            ttsRequests:
              Number(
                broadcast.tts_requests ||
                0
              ),
            totalWorkerRequests:
              Number(
                broadcast.heartbeat_requests ||
                0
              ) +
              Number(
                broadcast.status_polls ||
                0
              ) +
              Number(
                broadcast.analytics_requests ||
                0
              ) +
              Number(
                broadcast.audio_chunks ||
                0
              ) +
              Number(
                broadcast.source_final_requests ||
                0
              ) +
              Number(
                broadcast.listener_heartbeats ||
                0
              ) +
              Number(
                broadcast.tts_requests ||
                0
              )
          },
          autoEndReason:
            String(
              broadcast.auto_end_reason ||
              ""
            ),
          languages:
            languagesByBroadcast.get(
              broadcastId
            ) || []
        };
      });

  const aggregateBroadcasts =
    Number(
      broadcastAggregate?.broadcasts ||
      0
    );

  const aggregatePeakAudience =
    Number(
      broadcastAggregate
        ?.highest_peak_audience ||
      0
    );

  const totalListeners =
    Number(
      listenerAggregate
        ?.total_listeners ||
      0
    );

  const totalListeningMs =
    Number(
      listenerAggregate
        ?.total_listening_ms ||
      0
    );

  const aggregateAverageListeningMs =
    Math.round(
      Number(
        listenerAggregate
          ?.average_listening_ms ||
        0
      )
    );

  const languages =
    (languageTotalsResult.results || [])
      .map(row => ({
        language:
          String(
            row.language || ""
          ),
        listeners:
          Number(
            row.listeners || 0
          ),
        totalListeningMs:
          Number(
            row.total_listening_ms ||
            0
          ),
        averageListeningMs:
          Math.round(
            Number(
              row.average_listening_ms ||
              0
            )
          )
      }));

  const technicalTotals = {
    heartbeatRequests:
      Number(
        broadcastAggregate
          ?.heartbeat_requests ||
        0
      ),
    statusPolls:
      Number(
        broadcastAggregate
          ?.status_polls ||
        0
      ),
    analyticsRequests:
      Number(
        broadcastAggregate
          ?.analytics_requests ||
        0
      ),
    audioChunks:
      Number(
        broadcastAggregate
          ?.audio_chunks ||
        0
      ),
    sourceFinalRequests:
      Number(
        broadcastAggregate
          ?.source_final_requests ||
        0
      ),
    listenerHeartbeats:
      Number(
        broadcastAggregate
          ?.listener_heartbeats ||
        0
      ),
    ttsRequests:
      Number(
        broadcastAggregate
          ?.tts_requests ||
        0
      )
  };

  technicalTotals.totalWorkerRequests =
    technicalTotals.heartbeatRequests +
    technicalTotals.statusPolls +
    technicalTotals.analyticsRequests +
    technicalTotals.audioChunks +
    technicalTotals.sourceFinalRequests +
    technicalTotals.listenerHeartbeats +
    technicalTotals.ttsRequests;

  const data = {};

  if (include("overview")) {
    data.overview = {
      broadcasts:
        aggregateBroadcasts,
      totalListenerSessions:
        totalListeners,
      highestPeakAudience:
        aggregatePeakAudience,
      totalListeningMs,
      averageListenerSessionMs:
        aggregateAverageListeningMs,
      uniqueLanguages:
        Number(
          listenerAggregate
            ?.unique_languages ||
          languages.length
        )
    };
  }

  if (include("broadcasts")) {
    data.broadcasts =
      summaries.map(item => ({
        broadcastId:
          item.broadcastId,
        room:
          item.room,
        startedAt:
          item.startedAt,
        endedAt:
          item.endedAt,
        durationMs:
          item.durationMs,
        autoEndReason:
          item.autoEndReason || ""
      }));
  }

  if (include("listeners")) {
    data.listeners = {
      totalSessions:
        totalListeners,
      totalListeningMs,
      averageSessionMs:
        aggregateAverageListeningMs,
      broadcasts:
        summaries.map(item => ({
          broadcastId:
            item.broadcastId,
          startedAt:
            item.startedAt,
          totalListeners:
            item.totalListeners,
          peakListeners:
            item.peakListeners,
          totalListeningMs:
            item.totalListeningMs,
          averageListeningMs:
            item.averageListeningMs
        }))
    };
  }

  if (include("languages")) {
    data.languages = {
      uniqueLanguages:
        languages.length,
      totals:
        languages,
      broadcasts:
        summaries.map(item => ({
          broadcastId:
            item.broadcastId,
          startedAt:
            item.startedAt,
          languages:
            item.languages || []
        }))
    };
  }

  if (include("technicalUsage")) {
    data.technicalUsage = {
      totals:
        technicalTotals,
      broadcasts:
        summaries.map(item => ({
          broadcastId:
            item.broadcastId,
          startedAt:
            item.startedAt,
          requestMetrics:
            item.requestMetrics || {}
        }))
    };
  }

  if (include("returnVisitors")) {
    await ensureReturnVisitorSchema(env);

    const visitorStats =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          COUNT(*) AS unique_visitors,
          COALESCE(
            SUM(
              CASE
                WHEN visit_days > 1
                THEN 1
                ELSE 0
              END
            ),
            0
          ) AS returning_visitors,
          COALESCE(
            SUM(visit_days),
            0
          ) AS total_visit_days
        FROM organization_visitors
        WHERE organization_id = ?
      `)
      .bind(
        Number(
          organization.id
        )
      )
      .first();

    data.returnVisitors = {
      uniqueVisitors:
        Number(
          visitorStats
            ?.unique_visitors ||
          0
        ),
      returningVisitors:
        Number(
          visitorStats
            ?.returning_visitors ||
          0
        ),
      totalVisitDays:
        Number(
          visitorStats
            ?.total_visit_days ||
          0
        )
    };
  }

  if (include("marketing")) {
    data.marketing =
      await buildMarketingStatsApiAnalytics(
        env,
        organization.id
      );
  }

  return {
    success: true,
    apiVersion:
      "v1",
    generatedAt:
      now,
    organization: {
      id:
        Number(
          organization.id
        ),
      name:
        String(
          organization.organization_name ||
          ""
        ),
      room:
        baseRoom
    },
    query: {
      scope:
        requestedScope,
      from:
        Math.max(0, from),
      to:
        Math.max(
          Math.max(0, from),
          to
        ),
      limit
    },
    enabledScopes:
      scopes,
    data
  };
}

/*
  v1.0.9
  Deterministic explicit Scripture-reference detection.
  Separate from AI Live Notes so verses can appear even when rolling notes
  are throttled or the broadcast has just resumed after silence.
*/
function extractExplicitScriptureReferences(text) {
  let source = String(text || "");
  if (!source.trim()) return [];

  /*
    v1.0.10 STT repair:
    A spoken chapter such as "thirty four" can arrive across chunks as
    "Ezekiel 30. 4, verse 2". Repair that before matching.
  */
  const splitChapterPattern =
    /\b(Ezekiel|Isaiah|Jeremiah|Matthew|Mark|Luke|John|Acts|Romans|Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Psalms?|Proverbs|Daniel|Hebrews|James|Revelation)\s+(?:chapter\s+)?([1-9]0)[.\s\n]+([1-9])\s*,?\s*(verse|verses|versus|v|vv)\.?\s+/gi;

  source =
    source.replace(
      splitChapterPattern,
      (match, book, tens, ones, verseWord) =>
        book + " " +
        String(Number(tens) + Number(ones)) +
        ", " +
        verseWord +
        " "
    );

  const bookAliases = [
    ["Genesis","Genesis"],["Exodus","Exodus"],["Leviticus","Leviticus"],["Numbers","Numbers"],["Deuteronomy","Deuteronomy"],
    ["Joshua","Joshua"],["Judges","Judges"],["Ruth","Ruth"],["1 Samuel","1 Samuel"],["2 Samuel","2 Samuel"],
    ["1 Kings","1 Kings"],["2 Kings","2 Kings"],["1 Chronicles","1 Chronicles"],["2 Chronicles","2 Chronicles"],
    ["Ezra","Ezra"],["Nehemiah","Nehemiah"],["Esther","Esther"],["Job","Job"],["Psalms","Psalms"],["Psalm","Psalms"],
    ["Proverbs","Proverbs"],["Ecclesiastes","Ecclesiastes"],["Song of Solomon","Song of Solomon"],["Song of Songs","Song of Solomon"],
    ["Isaiah","Isaiah"],["Jeremiah","Jeremiah"],["Lamentations","Lamentations"],["Ezekiel","Ezekiel"],["Daniel","Daniel"],
    ["Hosea","Hosea"],["Joel","Joel"],["Amos","Amos"],["Obadiah","Obadiah"],["Jonah","Jonah"],["Micah","Micah"],
    ["Nahum","Nahum"],["Habakkuk","Habakkuk"],["Zephaniah","Zephaniah"],["Haggai","Haggai"],["Zechariah","Zechariah"],["Malachi","Malachi"],
    ["Matthew","Matthew"],["Mark","Mark"],["Luke","Luke"],["John","John"],["Acts","Acts"],["Romans","Romans"],
    ["1 Corinthians","1 Corinthians"],["2 Corinthians","2 Corinthians"],["Galatians","Galatians"],["Ephesians","Ephesians"],
    ["Philippians","Philippians"],["Colossians","Colossians"],["1 Thessalonians","1 Thessalonians"],["2 Thessalonians","2 Thessalonians"],
    ["1 Timothy","1 Timothy"],["2 Timothy","2 Timothy"],["Titus","Titus"],["Philemon","Philemon"],["Hebrews","Hebrews"],
    ["James","James"],["1 Peter","1 Peter"],["2 Peter","2 Peter"],["1 John","1 John"],["2 John","2 John"],["3 John","3 John"],
    ["Jude","Jude"],["Revelation","Revelation"]
  ];

  const canonicalByAlias = new Map(
    bookAliases.map(([alias, canonical]) => [alias.toLowerCase(), canonical])
  );

  const bookPattern = bookAliases
    .map(([alias]) => alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
    .sort((a, c) => c.length - a.length)
    .join("|");

  const referencePattern = new RegExp(
    "\\b(" + bookPattern + ")" +
    "\\s+(?:chapter\\s+)?(\\d{1,3})" +
    "(?:\\s*:\\s*|\\s*[.,;:-]?\\s*(?:verse|verses|versus|v|vv)\\.?\\s+)" +
    "(\\d{1,3})" +
    "(?:\\s*[-–]\\s*(\\d{1,3}))?",
    "gi"
  );

  const references = [];
  const seen = new Set();
  let match;

  while ((match = referencePattern.exec(source))) {
    const rawBook = String(match[1] || "").replace(/\s+/g, " ").trim();
    const canonicalBook = canonicalByAlias.get(rawBook.toLowerCase()) || rawBook;
    const chapter = String(match[2] || "");
    const startVerse = String(match[3] || "");
    const endVerse = String(match[4] || "");

    if (!canonicalBook || !chapter || !startVerse) continue;

    const reference =
      canonicalBook + " " + chapter + ":" + startVerse + (endVerse ? "-" + endVerse : "");

    const key = reference.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      references.push(reference);
    }
  }

  return references;
}
__name(extractExplicitScriptureReferences, "extractExplicitScriptureReferences");

var LiveBridgeRoom = class {
  static {
    __name(this, "LiveBridgeRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.inFlightTranslations = /* @__PURE__ */ new Map();
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

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      const upgradeHeader = request.headers.get("Upgrade");
      if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", {
          status: 426
        });
      }

      const language = (url.searchParams.get("lang") || "")
        .trim()
        .toLowerCase();

      const listenerId = (
        url.searchParams.get("listenerId") || crypto.randomUUID()
      ).trim();

      const maxViewers = Math.max(
        0,
        Number(url.searchParams.get("maxViewers") || 0)
      );

      if (!language) {
        return new Response("Missing language", {
          status: 400
        });
      }

      /*
      ========================================
      VIEWER CAPACITY ENFORCEMENT
      ========================================
      */
      if (maxViewers > 0) {
        const existingSockets = this.state.getWebSockets();
        const sameListenerSockets = this.state.getWebSockets(
          `listener:${listenerId}`
        );

        for (const existingSocket of sameListenerSockets) {
          try {
            existingSocket.close(1000, "Listener reconnecting");
          } catch {}
        }

        const activeViewerCount = Math.max(
          0,
          existingSockets.length - sameListenerSockets.length
        );

        if (activeViewerCount >= maxViewers) {
          return jsonResponse(
            {
              success: false,
              error:
                "This LiveBridge room has reached its current listener capacity.",
              code: "VIEWER_LIMIT_REACHED",
              viewerLimit: maxViewers
            },
            429
          );
        }
      }

      const requestedName =
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
      const server = pair[1];

      this.state.acceptWebSocket(server, [
        `lang:${language}`,
        `listener:${listenerId}`
      ]);

      server.send(
        JSON.stringify({
          type: "connected",
          language,
          listenerId,
          assignedName,
          message: "Connected to LiveBridge room."
        })
      );

      await this.broadcastPresence();

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }
    if (url.pathname === "/source-final" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            error: "Invalid JSON."
          },
          400
        );
      }
      const text = String(body.text || "").trim();

      const room =
        normalizeRoom(
          body.room
        );

      if (!text) {
        return jsonResponse(
          {
            success: false,
            error: "Missing source text."
          },
          400
        );
      }
      const sourceLanguage = String(body.sourceLanguage || "en").trim().toLowerCase();
      const chunkId = String(body.chunkId || "").trim() || await sha256(text);
      const sockets = this.state.getWebSockets();
      const activeLanguages = /* @__PURE__ */ new Set();
      for (const socket of sockets) {
        const tags = this.state.getTags(socket);
        for (const tag of tags) {
          if (tag.startsWith("lang:")) {
            activeLanguages.add(
              tag.substring(5).toLowerCase()
            );
          }
        }
      }
      if (activeLanguages.size === 0) {
        return jsonResponse({
          success: true,
          chunkId,
          listeners: 0,
          languages: [],
          translationsGenerated: 0
        });
      }
      const translations = [];
      await Promise.all(
        [...activeLanguages].map(async (language) => {
          try {
            const translatedText = await this.getSharedTranslation({
              text,
              chunkId,
              sourceLanguage,
              targetLanguage: language,
              room
            });
            translations.push({
              language,
              text: translatedText
            });
            const languageSockets = this.state.getWebSockets(
              `lang:${language}`
            );
            const message = JSON.stringify({
              type: "translation",
              chunkId,
              sourceLanguage,
              language,
              text: translatedText,
              timestamp: Date.now()
            });
            for (const socket of languageSockets) {
              try {
                socket.send(message);
              } catch (error) {
                console.error(
                  "WebSocket send failed:",
                  error
                );
              }
            }
          } catch (error) {
            console.error(
              `Translation failed for ${language}:`,
              error
            );
          }
        })
      );
      return jsonResponse({
        success: true,
        chunkId,
        listeners: sockets.length,
        languages: [...activeLanguages],
        translationsGenerated: translations.length,
        translations
      });
    }
    if (
      url.pathname === "/azure-tts-generate" &&
      request.method === "POST"
    ) {
      try {

        if (
          !this.env.AZURE_SPEECH_KEY ||
          !this.env.AZURE_SPEECH_REGION
        ) {
          return jsonResponse(
            {
              success: false,
              error: "Azure Speech is not configured."
            },
            500
          );
        }

        if (!this.env.AZURE_TTS_CACHE) {
          return jsonResponse(
            {
              success: false,
              error: "AZURE_TTS_CACHE R2 binding is not configured."
            },
            500
          );
        }

        const body =
          await request.json();

        const text =
          String(body.text || "").trim();

        const voice =
          String(body.voice || "").trim();

        const locale =
          String(body.locale || "").trim();

        const objectKey =
          String(body.objectKey || "").trim();

        const normalizedRate =
          String(body.normalizedRate || "1.00").trim();

        const rate =
          Math.min(
            2,
            Math.max(
              0.5,
              Number(normalizedRate || 1)
            )
          );

        if (
          !text ||
          !voice ||
          !locale ||
          !objectKey
        ) {
          return jsonResponse(
            {
              success: false,
              error: "Missing Azure TTS generation parameters."
            },
            400
          );
        }


        /*
        =====================================================
        DURABLE OBJECT SINGLE-GENERATION LOCK

        Every identical audio request is routed to the SAME
        Durable Object instance by the top-level Worker.

        First request:
          - generates Azure MP3
          - saves it to R2

        Simultaneous matching requests:
          - wait for the same in-flight promise
          - then reuse the saved result

        This prevents several listeners from generating the
        same Azure audio at the same time.
        =====================================================
        */

        const existing =
          await this.env.AZURE_TTS_CACHE.get(
            objectKey
          );

        if (existing) {

          return new Response(
            existing.body,
            {
              status: 200,

              headers: {
                "Content-Type":
                  existing.httpMetadata?.contentType ||
                  "audio/mpeg",

                "X-LiveBridge-TTS-Cache":
                  "HIT"
              }
            }
          );
        }


        /*
          Use a Durable Object concurrency gate so only ONE
          matching request can perform the R2-check + Azure
          generation + R2-write sequence at a time.
        */

        let generatedByThisRequest =
          false;

        let audio;

        let azureBillableCharacters =
          0;

        await this.state.blockConcurrencyWhile(
          async () => {

            /*
              Re-check R2 inside the lock.
              If another listener already generated it,
              this request simply reuses that stored MP3.
            */
            const lockedCheck =
              await this.env.AZURE_TTS_CACHE.get(
                objectKey
              );

            if (lockedCheck) {

              audio =
                await lockedCheck.arrayBuffer();

              generatedByThisRequest =
                false;

              return;
            }


            const ratePercent =
              Math.round(
                (rate - 1) * 100
              );

            const rateString =
              ratePercent >= 0
                ? "+" +
                  ratePercent +
                  "%"
                : ratePercent +
                  "%";


            const escapeXml =
              value =>
                String(value)
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&apos;");


            const ssml = `
              <speak
                version="1.0"
                xmlns="http://www.w3.org/2001/10/synthesis"
                xml:lang="${escapeXml(locale)}"
              >
                <voice name="${escapeXml(voice)}">
                  <prosody rate="${rateString}">
                    ${escapeXml(text)}
                  </prosody>
                </voice>
              </speak>
            `;


            azureBillableCharacters =
              countAzureSsmlBillableCharacters(
                ssml
              );

            const azureResponse =
              await fetch(
                "https://" +
                this.env.AZURE_SPEECH_REGION +
                ".tts.speech.microsoft.com/cognitiveservices/v1",
                {
                  method: "POST",

                  headers: {
                    "Ocp-Apim-Subscription-Key":
                      this.env.AZURE_SPEECH_KEY,

                    "Content-Type":
                      "application/ssml+xml",

                    "X-Microsoft-OutputFormat":
                      "audio-24khz-48kbitrate-mono-mp3",

                    "User-Agent":
                      "LiveBridge"
                  },

                  body: ssml
                }
              );


            if (!azureResponse.ok) {

              const errorText =
                await azureResponse.text();

              const error =
                new Error(
                  "Azure TTS failed."
                );

              error.status =
                azureResponse.status;

              error.details =
                errorText;

              throw error;
            }


            audio =
              await azureResponse.arrayBuffer();


            await this.env.AZURE_TTS_CACHE.put(
              objectKey,
              audio,
              {
                httpMetadata: {
                  contentType:
                    "audio/mpeg"
                },

                customMetadata: {
                  locale,
                  voice,
                  rate:
                    normalizedRate,
                  createdAt:
                    String(Date.now())
                }
              }
            );


            generatedByThisRequest =
              true;
          }
        );

        return new Response(
          audio,
          {
            status: 200,

            headers: {
              "Content-Type":
                "audio/mpeg",

              /*
                Only the request that actually created the
                Azure audio is shown as MISS / red.
                Simultaneous waiters are HIT / green.
              */
              "X-LiveBridge-TTS-Cache":
                generatedByThisRequest
                  ? "MISS"
                  : "HIT",

              "X-LiveBridge-TTS-Billable-Characters":
                generatedByThisRequest
                  ? String(
                      azureBillableCharacters
                    )
                  : "0"
            }
          }
        );


      } catch (error) {

        console.error(
          "Durable Object Azure TTS failed:",
          error
        );

        return jsonResponse(
          {
            success: false,

            error:
              error.message ||
              "Azure TTS generation failed.",

            details:
              error.details ||
              undefined
          },
          Number(
            error.status ||
            500
          )
        );
      }
    }

    if (
      url.pathname === "/live-notes" &&
      request.method === "GET"
    ) {

      const room =
        normalizeRoom(
          url.searchParams.get("room")
        );

      const language =
        String(
          url.searchParams.get("lang") || "en"
        )
        .trim()
        .toLowerCase();

      const liveNotesLanguageNames = {
        en: "English",
        fr: "French",
        es: "Spanish",
        de: "German",
        pt: "Portuguese",
        it: "Italian",
        pl: "Polish",
        ru: "Russian",
        uk: "Ukrainian",
        nl: "Dutch",
        cs: "Czech",
        fil: "Filipino",
        he: "Hebrew",
        yo: "Yoruba",
        ig: "Igbo",
        ha: "Hausa",
        hi: "Hindi"
      };

      const requestedLiveNotesLanguage =
        liveNotesLanguageNames[
          language.split("-")[0]
        ] ||
        language;

      if (!room) {
        return jsonResponse(
          {
            success: false,
            error: "room is required."
          },
          400
        );
      }

      const cacheKey =
        "live-notes:" +
        room +
        ":" +
        language;

      if (
        this.inFlightLiveNotes.has(
          cacheKey
        )
      ) {
        return jsonResponse(
          await this.inFlightLiveNotes.get(
            cacheKey
          )
        );
      }

      const promise =
        this.buildLiveNotes({
          room,
          language,
          requestedLanguage:
            requestedLiveNotesLanguage
        });

      this.inFlightLiveNotes.set(
        cacheKey,
        promise
      );

      try {
        return jsonResponse(
          await promise
        );
      } finally {
        this.inFlightLiveNotes.delete(
          cacheKey
        );
      }
    }


    /*
    =======================================================
    ON-DEMAND SCRIPTURE VERSE
    Fetch/translate only after a listener clicks a reference.
    =======================================================
    */
    if (
      url.pathname === "/scripture-verse" &&
      request.method === "GET"
    ) {

      const room =
        normalizeRoom(
          url.searchParams.get("room")
        );

      const language =
        String(
          url.searchParams.get("lang") || "en"
        )
        .trim()
        .toLowerCase();

      const reference =
        String(
          url.searchParams.get("reference") || ""
        )
        .trim();

      if (
        !room ||
        !reference
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "room and reference are required."
          },
          400
        );
      }

      await ensureBroadcastSafetySchema(
        this.env
      );

      const organization =
        await this.env.TRANSLATIONS_DB.prepare(`
          SELECT
            account_status,
            billing_status,
            plan_code,
            scripture_enabled,
            scripture_plan_override
          FROM organizations
          WHERE
            UPPER(room_name) = ?
            OR
            UPPER(
              room_name ||
              '-' ||
              COALESCE(last_subroom, '')
            ) = ?
          LIMIT 1
        `)
        .bind(
          room,
          room
        )
        .first();

      if (
        !organization ||
        String(
          organization.account_status ||
          ""
        ).toLowerCase() !== "active" ||
        !isBillingAccessActive(
          organization
        ) ||
        !getEffectiveScriptureDetection(
          organization
        )
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Scripture detection is disabled."
          },
          403
        );
      }

      try {

        const verse =
          await this.lookupBibleVerse({
            reference,
            language,
            room
          });

        if (!verse) {
          return jsonResponse(
            {
              success: false,
              error:
                "Verse could not be loaded."
            },
            404
          );
        }

        return jsonResponse({
          success: true,
          verse
        });

      } catch (error) {

        console.error(
          "On-demand Scripture lookup failed:",
          error
        );

        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Unable to load Scripture."
          },
          500
        );
      }
    }


    if (
      url.pathname === "/watchdog-arm" &&
      request.method === "POST"
    ) {
      const body =
        await request.json();

      const room =
        normalizeRoom(
          body.room
        );

      if (!room) {
        return jsonResponse(
          {
            success: false,
            error: "room is required."
          },
          400
        );
      }

      await this.state.storage.put(
        "watchdog-room",
        room
      );

      const schedule =
        await this.state.storage.get(
          "scheduled-broadcast"
        );

      if (
        schedule &&
        Number(schedule.startAt || 0) > 0 &&
        Date.now() >=
          Number(schedule.startAt) -
          (5 * 60 * 1000) &&
        Date.now() <=
          Number(schedule.endAt || Infinity)
      ) {
        await this.state.storage.delete(
          "scheduled-broadcast"
        );
      }

      await this.updateEventDrivenAlarm();

      return jsonResponse({
        success: true,
        armed: true,
        room
      });
    }

    if (
      url.pathname === "/watchdog-clear" &&
      request.method === "POST"
    ) {
      await this.state.storage.delete(
        "watchdog-room"
      );

      await this.updateEventDrivenAlarm();

      return jsonResponse({
        success: true,
        cleared: true
      });
    }

    if (
      url.pathname === "/schedule-arm" &&
      request.method === "POST"
    ) {
      const body =
        await request.json();

      const room =
        normalizeRoom(
          body.room
        );

      const startAt =
        Number(body.startAt || 0);

      const endAt =
        Number(body.endAt || 0);

      if (
        !room ||
        !startAt ||
        !endAt ||
        endAt <= startAt
      ) {
        return jsonResponse(
          {
            success: false,
            error:
              "Valid room, startAt and endAt are required."
          },
          400
        );
      }

      await this.state.storage.put(
        "scheduled-broadcast",
        {
          room,
          startAt,
          endAt,
          armedAt:
            Date.now()
        }
      );

      await this.updateEventDrivenAlarm();

      return jsonResponse({
        success: true,
        scheduled: true,
        room,
        startAt,
        endAt
      });
    }

    if (
      url.pathname === "/schedule-clear" &&
      request.method === "POST"
    ) {
      await this.state.storage.delete(
        "scheduled-broadcast"
      );

      await this.updateEventDrivenAlarm();

      return jsonResponse({
        success: true,
        scheduled: false
      });
    }

    if (url.pathname === "/status") {
      const sockets = this.state.getWebSockets();
      const languageCounts = {};
      for (const socket of sockets) {
        const tags = this.state.getTags(socket);
        for (const tag of tags) {
          if (!tag.startsWith("lang:")) continue;
          const language = tag.substring(5).toLowerCase();
          languageCounts[language] = (languageCounts[language] || 0) + 1;
        }
      }
      return jsonResponse({
        success: true,
        listeners: sockets.length,
        languages: languageCounts
      });
    }
    return jsonResponse(
      {
        success: false,
        error: "LiveBridge room route not found."
      },
      404
    );
  }
  async updateEventDrivenAlarm() {
    const room =
      normalizeRoom(
        await this.state.storage.get(
          "watchdog-room"
        ) || ""
      );

    const schedule =
      await this.state.storage.get(
        "scheduled-broadcast"
      );

    let nextAt = null;

    if (room) {
      const active =
        await this.env.TRANSLATIONS_DB.prepare(`
          SELECT started_at, last_seen
          FROM active_broadcasts
          WHERE room = ?
          LIMIT 1
        `)
        .bind(room)
        .first();

      if (active) {
        const organization =
          await getOrganizationForRoom(
            this.env,
            room
          );

        const staleAt =
          Number(active.last_seen || Date.now()) +
          BROADCAST_STALE_MS;

        nextAt = staleAt;

        if (organization) {
          const totalSecondsAvailable =
            Math.max(
              0,
              (
                Number(
                  organization.included_minutes || 0
                ) +
                Number(
                  organization.bonus_minutes || 0
                ) -
                Number(
                  organization.used_minutes || 0
                )
              ) * 60
            );

          if (totalSecondsAvailable > 0) {
            const limitAt =
              Number(active.started_at || Date.now()) +
              totalSecondsAvailable * 1000;

            nextAt =
              Math.min(
                nextAt,
                limitAt
              );
          }
        }
      }
    }

    if (
      schedule &&
      Number(schedule.startAt || 0) > 0
    ) {
      const scheduleCheckAt =
        Number(schedule.startAt) +
        SCHEDULE_START_GRACE_MS;

      nextAt =
        nextAt === null
          ? scheduleCheckAt
          : Math.min(
              nextAt,
              scheduleCheckAt
            );
    }

    if (nextAt !== null) {
      await this.state.storage.setAlarm(
        Math.max(
          Date.now() + 1000,
          nextAt
        )
      );
    } else {
      await this.state.storage.deleteAlarm();
    }
  }

  async alarm() {
    const room =
      normalizeRoom(
        await this.state.storage.get(
          "watchdog-room"
        ) || ""
      );

    const now = Date.now();

    if (room) {
      const active =
        await this.env.TRANSLATIONS_DB.prepare(`
          SELECT room, started_at, last_seen
          FROM active_broadcasts
          WHERE room = ?
          LIMIT 1
        `)
        .bind(room)
        .first();

      if (active) {
        const organization =
          await getOrganizationForRoom(
            this.env,
            room
          );

        const stale =
          now -
          Number(active.last_seen || 0) >=
          BROADCAST_STALE_MS;

        let timeExhausted = false;

        if (organization) {
          const totalSecondsAvailable =
            Math.max(
              0,
              (
                Number(
                  organization.included_minutes || 0
                ) +
                Number(
                  organization.bonus_minutes || 0
                ) -
                Number(
                  organization.used_minutes || 0
                )
              ) * 60
            );

          const elapsedSeconds =
            Math.max(
              0,
              Math.floor(
                (
                  now -
                  Number(
                    active.started_at || now
                  )
                ) / 1000
              )
            );

          timeExhausted =
            totalSecondsAvailable <= 0 ||
            elapsedSeconds >=
              totalSecondsAvailable;
        }

        if (timeExhausted) {
          await finalizeBroadcastForReason(
            this.env,
            room,
            "time_limit"
          );
        } else if (stale) {
          await finalizeBroadcastForReason(
            this.env,
            room,
            "broadcaster_disconnected"
          );
        }
      }
    }

    const schedule =
      await this.state.storage.get(
        "scheduled-broadcast"
      );

    if (
      schedule &&
      Number(schedule.startAt || 0) > 0 &&
      now >=
        Number(schedule.startAt) +
        SCHEDULE_START_GRACE_MS
    ) {
      const scheduledRoom =
        normalizeRoom(
          schedule.room || room
        );

      const active = scheduledRoom
        ? await this.env.TRANSLATIONS_DB.prepare(`
            SELECT started_at, last_seen
            FROM active_broadcasts
            WHERE room = ?
            LIMIT 1
          `)
          .bind(scheduledRoom)
          .first()
        : null;

      const startedForSchedule =
        !!active &&
        Number(active.started_at || 0) >=
          Number(schedule.startAt) -
          (5 * 60 * 1000);

      if (!startedForSchedule) {
        const organization =
          await getOrganizationForRoom(
            this.env,
            scheduledRoom
          );

        if (organization) {
          await sendBroadcastAlertEmail(
            this.env,
            organization,
            "scheduled_start_failed",
            scheduledRoom,
            0
          );
        }
      }

      await this.state.storage.delete(
        "scheduled-broadcast"
      );
    }

    await this.updateEventDrivenAlarm();
  }

  async buildLiveNotes({
    room,
    language,
    requestedLanguage
  }) {

    await ensureLiveNotesSchema(
      this.env
    );

    await ensureBroadcastSafetySchema(
      this.env
    );

    const organization =
      await this.env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          room_name,
          last_subroom,
          account_status,
          billing_status,
          plan_code,
          scripture_enabled,
          scripture_plan_override
        FROM organizations
        WHERE
          UPPER(room_name) = ?
          OR
          UPPER(
            room_name ||
            '-' ||
            COALESCE(last_subroom, '')
          ) = ?
        LIMIT 1
      `)
      .bind(
        room,
        room
      )
      .first();

    if (!organization) {
      return {
        success: true,
        live: false,
        summary: "",
        noteEntries: [],
        scriptures: [],
        scriptureEnabled: false,
        message:
          "Waiting for the live message."
      };
    }

    if (
      String(
        organization.account_status || ""
      ).toLowerCase() !== "active" ||
      !isBillingAccessActive(
        organization
      )
    ) {
      return {
        success: true,
        live: false,
        summary: "",
        noteEntries: [],
        scriptures: [],
        scriptureEnabled:
          getEffectiveScriptureDetection(
            organization
          ),
        message:
          "This room is currently unavailable."
      };
    }

    const scriptureEnabled =
      getEffectiveScriptureDetection(
        organization
      );

    /*
      v1.0.11:
      Remove expired live-presence rows before deciding whether this room is
      actually broadcasting. This prevents old Live Notes from resurfacing
      after a listener refresh.
    */
    await this.env.TRANSLATIONS_DB.prepare(`
      DELETE FROM active_broadcasts
      WHERE last_seen < ?
    `)
    .bind(
      Date.now() - 90000
    )
    .run();

    const broadcast =
      await getActiveBroadcast(
        this.env,
        room
      );

    if (!broadcast) {
      return {
        success: true,
        live: false,
        summary: "",
        noteEntries: [],
        scriptures: [],
        scriptureEnabled,
        message:
          "Waiting for the live message."
      };
    }

    const transcript =
      await this.env.TRANSLATIONS_DB.prepare(`
        SELECT transcript_text
        FROM broadcast_transcripts
        WHERE broadcast_id = ?
        LIMIT 1
      `)
      .bind(
        broadcast.id
      )
      .first();

    const transcriptText =
      String(
        transcript?.transcript_text || ""
      ).trim();

    const stateKey =
      "live-notes-state:" +
      broadcast.id +
      ":" +
      language;

    let state =
      await this.state.storage.get(
        stateKey
      );

    if (
      !state ||
      state.broadcastId !==
        broadcast.id
    ) {
      state = {
        broadcastId:
          broadcast.id,
        processedChars: 0,
        summary: "",
        noteEntries: [],
        scriptures: [],
        updatedAt: 0
      };
    }

    if (!transcriptText) {
      return {
        success: true,
        live: true,
        language,
        broadcastId:
          broadcast.id,
        summary:
          state.summary || "",
        noteEntries:
          Array.isArray(state.noteEntries)
            ? state.noteEntries
            : [],
        scriptures:
          state.scriptures || [],
        scriptureEnabled,
        message:
          "Live message detected. Notes will appear as the message develops.",
        updatedAt:
          Number(
            state.updatedAt || 0
          )
      };
    }

    if (
      Number(
        state.processedChars || 0
      ) > transcriptText.length
    ) {
      state = {
        broadcastId:
          broadcast.id,
        processedChars: 0,
        summary: "",
        noteEntries: [],
        scriptures: [],
        updatedAt: 0
      };
    }

    const now =
      Date.now();

    const newCharacterCount =
      Math.max(
        0,
        transcriptText.length -
        Number(
          state.processedChars || 0
        )
      );

    const minimumInitialCharacters =
      350;

    /*
      v1.0.9:
      Keep the 45-second AI throttle, but allow resumed speech after silence
      to qualify sooner for the next rolling-note update.
    */
    const minimumNewCharacters =
      180;

    const minimumUpdateIntervalMs =
      45000;

    const firstSummary =
      !String(
        state.summary || ""
      ).trim();

    /*
      v1.0.9 Scripture pass:
      Scripture detection does not wait for an AI-note refresh.
    */
    if (scriptureEnabled) {
      const deterministicReferences =
        extractExplicitScriptureReferences(
          transcriptText
        );

      const currentScriptures =
        Array.isArray(state.scriptures)
          ? state.scriptures
          : [];

      const existingReferenceKeys =
        new Set(
          currentScriptures.map(
            item =>
              String(item?.reference || "")
                .trim()
                .toLowerCase()
          )
        );

      const deterministicAdded = [];

      for (const reference of deterministicReferences) {
        if (
          existingReferenceKeys.has(
            reference.toLowerCase()
          )
        ) {
          continue;
        }

        /*
          v1.0.14:
          Store only the explicit reference. Verse text is fetched/translated
          only if a listener clicks the reference.
        */
        deterministicAdded.push({
          reference
        });

        existingReferenceKeys.add(
          reference.toLowerCase()
        );
      }

      if (deterministicAdded.length) {
        state.scriptures = [
          ...currentScriptures,
          ...deterministicAdded
        ].slice(-12);

        await this.state.storage.put(
          stateKey,
          state
        );
      }
    } else {
      state.scriptures = [];
    }

    const shouldGenerate =
      firstSummary
        ? transcriptText.length >=
          minimumInitialCharacters
        : (
            newCharacterCount >=
              minimumNewCharacters &&
            now -
              Number(
                state.updatedAt || 0
              ) >=
              minimumUpdateIntervalMs
          );

    if (!shouldGenerate) {
      return {
        success: true,
        live: true,
        language,
        broadcastId:
          broadcast.id,
        summary:
          state.summary || "",
        noteEntries:
          Array.isArray(state.noteEntries)
            ? state.noteEntries
            : [],
        scriptures:
          state.scriptures || [],
        scriptureEnabled,
        message:
          firstSummary
            ? "Listening now — the first live notes will appear shortly."
            : "Live notes are up to date.",
        updatedAt:
          Number(
            state.updatedAt || 0
          )
      };
    }

    if (!this.env.OPENAI_API_KEY) {
      return {
        success: false,
        live: true,
        summary:
          state.summary || "",
        noteEntries:
          Array.isArray(state.noteEntries)
            ? state.noteEntries
            : [],
        scriptures:
          state.scriptures || [],
        scriptureEnabled,
        error:
          "OpenAI is not configured."
      };
    }

    const previousProcessed =
      Math.max(
        0,
        Number(
          state.processedChars || 0
        )
      );

    const newTranscript =
      firstSummary
        ? transcriptText
        : transcriptText.slice(
            previousProcessed
          );

    const summaryResponse =
      await fetch(
        OPENAI_CHAT_URL,
        {
          method: "POST",
          headers: {
            "Authorization":
              `Bearer ${this.env.OPENAI_API_KEY}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            model:
              "gpt-4.1-mini",
            temperature:
              0.1,
            response_format: {
              type:
                "json_object"
            },
            messages: [
              {
                role:
                  "system",
                content:
`You create LiveBridge rolling live notes for a listener whose selected language is ${requestedLanguage || language} (language code "${language}").

LANGUAGE REQUIREMENT:
- ALL user-facing note text MUST be written in ${requestedLanguage || language}.
- Do not switch to English unless the requested language itself is English.
- Previous rolling notes may contain text in another language because of an earlier model mistake. If that happens, rewrite/translate them into ${requestedLanguage || language} before returning the updated summary.
- Never copy a previous-language mistake into the new result.

CONTENT REQUIREMENT:
Use ONLY information explicitly contained in the supplied transcript. Never add facts, interpretations, applications, corrections, context, theology, conclusions, or details that were not spoken. Preserve names, numbers, examples, and the speaker's intended meaning. If something is unclear, leave it unclear rather than guessing.

LIVE-NOTES PURPOSE:
These are SUMMARY NOTES, not a second transcript.
- Summarize what the speaker is communicating, explaining, announcing, testing, teaching, or emphasizing.
- Condense repetition.
- Do NOT copy sentences from the transcript unless a very short phrase is essential.
- Do NOT use a Bible verse quotation as the note itself. Scripture verse text is displayed separately by LiveBridge.
- If Scripture is discussed, a note may mention the reference and briefly state what the SPEAKER explicitly said about it, but do not invent an interpretation.
- Do not let Scripture references crowd out the rest of the spoken content.
- Each newNotes update should normally be 1-4 short bullet points or short sentences describing the NEW spoken content since the previous update.
- summary should be a concise cumulative organized summary of the entire live session so far.

Return valid JSON only in this exact shape:
{
  "summary": "concise cumulative summary notes in ${requestedLanguage || language}",
  "newNotes": "1-4 concise summary points covering ONLY genuinely new spoken content, in ${requestedLanguage || language}",
  "scriptureReferences": ["Psalm 23:3"]
}

For the first update, newNotes may cover all useful content heard so far. On later updates, newNotes must cover only genuinely new content and must not repeat earlier note entries.

Scripture rules:
- scriptureReferences must contain ONLY Bible references explicitly spoken or clearly transcribed in the supplied text.
- Never guess a reference.
- Use canonical English book names for scriptureReferences so they can be looked up reliably.
- If no Scripture reference is explicitly present, return an empty array.
- Scripture detection is separate from the notes: do not turn the notes into verse transcriptions.`
              },
              {
                role:
                  "user",
                content:
                  "Previous cumulative summary notes:\n" +
                  String(
                    state.summary ||
                    "(none yet)"
                  ) +
                  "\n\nNEW transcript content to summarize for this update:\n" +
                  newTranscript
              }
            ]
          })
        }
      );

    if (!summaryResponse.ok) {
      throw new Error(
        "Live notes summary failed: " +
        summaryResponse.status
      );
    }

    const summaryData =
      await summaryResponse.json();

    try {
      await recordOpenAiUsageForRoom(
        this.env,
        room,
        "live_notes",
        "gpt-4.1-mini",
        summaryData.usage
      );
    } catch (usageError) {
      console.error(
        "Live notes OpenAI usage tracking failed:",
        usageError
      );
    }

    const rawContent =
      summaryData.choices?.[0]
        ?.message
        ?.content
        ?.trim() ||
      "{}";

    let parsed;

    try {
      parsed =
        JSON.parse(
          rawContent
        );
    } catch {
      parsed = {
        summary:
          rawContent,
        newNotes:
          rawContent,
        scriptureReferences:
          []
      };
    }

    const summary =
      String(
        parsed.summary ||
        state.summary ||
        ""
      ).trim();

    const newNotes =
      String(
        parsed.newNotes ||
        (
          firstSummary
            ? summary
            : ""
        )
      ).trim();

    let noteEntries =
      Array.isArray(
        state.noteEntries
      )
        ? state.noteEntries
            .map(value =>
              String(value || "").trim()
            )
            .filter(Boolean)
        : [];

    if (firstSummary) {
      noteEntries =
        newNotes
          ? [newNotes]
          : (
              summary
                ? [summary]
                : []
            );
    } else if (newNotes) {
      const previousLast =
        noteEntries.length
          ? noteEntries[
              noteEntries.length - 1
            ]
          : "";

      if (
        newNotes !==
        previousLast
      ) {
        noteEntries.push(
          newNotes
        );
      }
    }

    noteEntries =
      noteEntries.slice(-24);

    const previousScriptures =
      Array.isArray(
        state.scriptures
      )
        ? state.scriptures
        : [];

    let scriptures =
      previousScriptures;

    if (scriptureEnabled) {

      const references =
        Array.isArray(
          parsed.scriptureReferences
        )
          ? parsed.scriptureReferences
              .map(
                value =>
                  String(value || "")
                    .trim()
              )
              .filter(Boolean)
          : [];

      const existingReferences =
        new Set(
          previousScriptures.map(
            item =>
              String(
                item.reference || ""
              ).toLowerCase()
          )
        );

      /*
        v1.0.13:
        Never let an AI-produced chapter-only reference such as "Matthew 3"
        trigger a Bible lookup. Only resolved verse references are accepted.
      */
      const newReferences =
        references
          .filter(
            reference =>
              /\b\d{1,3}\s*:\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?\b/.test(
                reference
              )
          )
          .filter(
            reference =>
              !existingReferences.has(
                reference.toLowerCase()
              )
          )
          .slice(
            0,
            4
          );

      /*
        v1.0.14:
        Keep clickable references only. This avoids Bible API and OpenAI
        translation work unless a listener actually opens a verse.
      */
      const added =
        newReferences.map(
          reference => ({
            reference
          })
        );

      scriptures = [
        ...previousScriptures.map(
          item => ({
            reference:
              String(
                item?.reference || ""
              ).trim()
          })
        ).filter(
          item =>
            item.reference
        ),
        ...added
      ].slice(-12);
    } else {
      scriptures = [];
    }

    const nextState = {
      broadcastId:
        broadcast.id,
      processedChars:
        transcriptText.length,
      summary,
      noteEntries,
      scriptures,
      updatedAt:
        now
    };

    await this.state.storage.put(
      stateKey,
      nextState
    );

    return {
      success: true,
      live: true,
      language,
      broadcastId:
        broadcast.id,
      summary,
      noteEntries,
      scriptures,
      scriptureEnabled,
      message:
        "Live notes updated.",
      updatedAt:
        now
    };
  }

  async lookupBibleVerse({
    reference,
    language,
    room
  }) {

    /*
      v1.0.13 safety guard:
      bible-api.com returns an entire chapter when given a chapter-only query.
      LiveBridge must never do that automatically.
    */
    const normalizedReference =
      String(
        reference || ""
      )
      .trim()
      .replace(
        /\s+/g,
        " "
      );

    if (
      !/\b\d{1,3}\s*:\s*\d{1,3}(?:\s*[-–]\s*\d{1,3})?\b/.test(
        normalizedReference
      )
    ) {
      console.warn(
        "LiveBridge rejected unresolved/chapter-only Scripture reference:",
        normalizedReference
      );

      return null;
    }

    const bibleResponse =
      await fetch(
        "https://bible-api.com/" +
        encodeURIComponent(
          normalizedReference
        ) +
        "?translation=kjv"
      );

    if (!bibleResponse.ok) {
      throw new Error(
        "Bible verse lookup failed: " +
        bibleResponse.status
      );
    }

    const bibleData =
      await bibleResponse.json();

    const canonicalReference =
      String(
        bibleData.reference ||
        normalizedReference
      ).trim();

    const kjvText =
      String(
        bibleData.text || ""
      )
      .replace(
        /\s+/g,
        " "
      )
      .trim();

    if (!kjvText) {
      return null;
    }

    if (
      language === "en" ||
      language.startsWith("en-")
    ) {
      return {
        reference:
          canonicalReference,
        text:
          kjvText,
        version:
          "KJV"
      };
    }

    const translationResponse =
      await fetch(
        OPENAI_CHAT_URL,
        {
          method: "POST",
          headers: {
            "Authorization":
              `Bearer ${this.env.OPENAI_API_KEY}`,
            "Content-Type":
              "application/json"
          },
          body: JSON.stringify({
            model:
              "gpt-4.1-mini",
            temperature:
              0,
            messages: [
              {
                role:
                  "system",
                content:
`Translate the supplied King James Version Bible verse faithfully into language code "${language}". Preserve the verse meaning, names, numbers, and sentence structure as closely as natural language allows. Do not add commentary, explanation, interpretation, quotation marks, or a reference. Return only the translated verse text.`
              },
              {
                role:
                  "user",
                content:
                  kjvText
              }
            ]
          })
        }
      );

    if (
      !translationResponse.ok
    ) {
      throw new Error(
        "Scripture translation failed: " +
        translationResponse.status
      );
    }

    const translationData =
      await translationResponse.json();

    try {
      await recordOpenAiUsageForRoom(
        this.env,
        room,
        "scripture_translation",
        "gpt-4.1-mini",
        translationData.usage
      );
    } catch (usageError) {
      console.error(
        "Scripture OpenAI usage tracking failed:",
        usageError
      );
    }

    const translated =
      translationData.choices?.[0]
        ?.message
        ?.content
        ?.trim();

    if (!translated) {
      return null;
    }

    return {
      reference:
        canonicalReference,
      text:
        translated,
      version:
        "KJV source · LiveBridge translation"
    };
  }

  /*
  =======================================================
  ONE TRANSLATION PER ROOM + LANGUAGE + CHUNK
  =======================================================
  */
  async getSharedTranslation({
    text,
    chunkId,
    sourceLanguage,
    targetLanguage,
    room
  }) {
    if (sourceLanguage === targetLanguage) {
      return text;
    }
    const cacheKey = `translation:${chunkId}:${targetLanguage}`;
    const cached = await this.state.storage.get(cacheKey);
    if (cached) {
      return cached;
    }
    if (this.inFlightTranslations.has(cacheKey)) {
      return this.inFlightTranslations.get(cacheKey);
    }
    const translationPromise = this.translateWithOpenAI(
      text,
      targetLanguage,
      room
    );
    this.inFlightTranslations.set(
      cacheKey,
      translationPromise
    );
    try {
      const translatedText = await translationPromise;
      await this.state.storage.put(
        cacheKey,
        translatedText
      );
      return translatedText;
    } finally {
      this.inFlightTranslations.delete(cacheKey);
    }
  }
  async translateWithOpenAI(
    text,
    targetLanguage,
    room
  ) {
    if (!this.env.OPENAI_API_KEY) {
      throw new Error(
        "OPENAI_API_KEY is not configured."
      );
    }

    const targetLanguageName =
      String(targetLanguage || "")
        .toLowerCase() === "yue"
          ? "Cantonese Chinese (Hong Kong; natural spoken Cantonese; Traditional Chinese)"
          : String(targetLanguage || "");

    const response = await fetch(
      OPENAI_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0,
          messages: [
            {
              role: "system",
              content: `You are LiveBridge's real-time translation engine. Translate the provided spoken text naturally and accurately into ${targetLanguageName} (requested language code "${targetLanguage}"). Preserve meaning, names, Scripture references, numbers, tone, and sentence intent. Return only the translated text with no explanation.`
            },
            {
              role: "user",
              content: text
            }
          ]
        })
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `OpenAI translation failed: ${response.status} ${errorText}`
      );
    }
    const data = await response.json();

    try {
      await recordOpenAiUsageForRoom(
        this.env,
        room,
        "translation",
        "gpt-4.1-mini",
        data.usage
      );
    } catch (usageError) {
      console.error(
        "Translation OpenAI usage tracking failed:",
        usageError
      );
    }

    const translatedText = data.choices?.[0]?.message?.content?.trim();
    if (!translatedText) {
      throw new Error(
        "OpenAI returned an empty translation."
      );
    }
    return translatedText;
  }
  /*
  -------------------------------------------------------
  HIBERNATING WEBSOCKET EVENTS
  -------------------------------------------------------
  */
  async webSocketMessage(socket, message) {
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

  async webSocketError(socket, error) {
    console.error(
      "LiveBridge WebSocket error:",
      error
    );
  }
};
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS
      });
    }

    if (
      request.method === "POST" &&
      url.pathname === "/stripe/webhook"
    ) {
      return handleStripeWebhook(
        request,
        env
      );
    }
    
/*
=======================================================
LIVEBRIDGE v1.0.22 STRIPE ACCOUNT-CREATION ENFORCEMENT
Brand-new organizations must present a valid completed
Stripe Checkout session. Existing organizations continue
to sync profile details as before.
=======================================================
*/

async function verifyPaidCheckoutForAccountCreation(
  env,
  sessionId
) {

  const normalizedSessionId =
    String(
      sessionId || ""
    ).trim();

  if (
    !normalizedSessionId ||
    !normalizedSessionId.startsWith(
      "cs_"
    )
  ) {
    throw new Error(
      "A verified Stripe checkout is required before creating a LiveBridge account."
    );
  }

  const session =
    await stripeApiGet(
      env,
      "/v1/checkout/sessions/" +
      encodeURIComponent(
        normalizedSessionId
      )
    );

  if (
    String(
      session.mode || ""
    ) !==
    "subscription"
  ) {
    throw new Error(
      "This Stripe checkout is not a LiveBridge subscription."
    );
  }

  if (
    String(
      session.status || ""
    ) !==
    "complete"
  ) {
    throw new Error(
      "Stripe checkout has not been completed."
    );
  }

  const paymentStatus =
    String(
      session.payment_status || ""
    );

  if (
    paymentStatus !==
      "paid" &&
    paymentStatus !==
      "no_payment_required"
  ) {
    throw new Error(
      "Stripe has not confirmed payment for this checkout."
    );
  }

  const planCode =
    normalizePlanCode(
      session.metadata
        ?.livebridge_plan_code ||
      ""
    );

  const plan =
    await loadPlanByCode(
      env,
      planCode
    );

  if (
    !plan ||
    !plan.active
  ) {
    throw new Error(
      "The purchased LiveBridge plan is not available."
    );
  }

  const lineItems =
    await stripeApiGet(
      env,
      "/v1/checkout/sessions/" +
      encodeURIComponent(
        normalizedSessionId
      ) +
      "/line_items?limit=10"
    );

  const purchasedPriceIds =
    (
      lineItems.data || []
    )
    .map(
      item =>
        String(
          item?.price?.id ||
          ""
        )
    )
    .filter(Boolean);

  if (
    !plan.stripePriceId ||
    !purchasedPriceIds.includes(
      plan.stripePriceId
    )
  ) {
    throw new Error(
      "The Stripe price purchased does not match the LiveBridge plan."
    );
  }

  return {
    sessionId:
      String(
        session.id || ""
      ),

    customerId:
      stripeEntityId(
        session.customer
      ),

    subscriptionId:
      stripeEntityId(
        session.subscription
      ),

    customerEmail:
      String(
        session.customer_details
          ?.email ||
        session.customer_email ||
        ""
      ).trim(),

    plan,

    offerToken:
      String(
        session.metadata
          ?.livebridge_offer_token ||
        ""
      ).trim()
  };
}


async function ensureStripeRegistrationTable(
  env
) {

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS stripe_registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checkout_session_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT DEFAULT '',
      stripe_subscription_id TEXT DEFAULT '',
      clerk_user_id TEXT NOT NULL UNIQUE,
      organization_id INTEGER,
      plan_code TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `).run();
}


/*
=======================================================
ACCOUNT SYNC
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/account-sync"
) {

  try {

    await ensureRoomAliasSchema(
      env
    );

    const auth =
      await verifyClerkRequest(
        request
      );

    const body =
      await request.json();

    const organizationName =
      String(
        body.organizationName || ""
      ).trim();

    const accountHolder =
      String(
        body.accountHolder || ""
      ).trim();

    const email =
      String(
        body.email || ""
      ).trim();

    const accountEmail =
      String(
        body.accountEmail ||
        body.email ||
        ""
      ).trim();

    const phone =
      String(
        body.phone || ""
      ).trim();

    const termsAcceptedAt =
      Number(
        body.termsAcceptedAt || 0
      );

    const privacyAcceptedAt =
      Number(
        body.privacyAcceptedAt || 0
      );

    const legalVersion =
      String(
        body.legalVersion || ""
      ).trim();

    const roomName =
      normalizeRoom(
        body.roomName
      );

    const requestedPlan =
      getPlanDefinition(
        body.planCode
      );


    const stripeCheckoutSessionId =
      String(
        body.stripeCheckoutSessionId ||
        ""
      ).trim();

    if (
      !organizationName ||
      !roomName
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization name and room name are required."
        },
        400
      );
    }


    const existing =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();


    const now =
      Date.now();


    if (!existing) {

      await ensureStripeRegistrationTable(
        env
      );


      const checkout =
        await verifyPaidCheckoutForAccountCreation(
          env,
          stripeCheckoutSessionId
        );


      const claimedCheckout =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            checkout_session_id,
            clerk_user_id
          FROM stripe_registrations
          WHERE checkout_session_id = ?
          LIMIT 1
        `)
        .bind(
          checkout.sessionId
        )
        .first();


      if (claimedCheckout) {

        return jsonResponse(
          {
            success: false,
            error:
              "This Stripe checkout has already been used to create a LiveBridge account."
          },
          409
        );
      }


      const claimedClerk =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            checkout_session_id,
            clerk_user_id
          FROM stripe_registrations
          WHERE clerk_user_id = ?
          LIMIT 1
        `)
        .bind(
          auth.clerkUserId
        )
        .first();


      if (claimedClerk) {

        return jsonResponse(
          {
            success: false,
            error:
              "This LiveBridge login has already been registered."
          },
          409
        );
      }


      if (
        normalizePlanCode(
          body.planCode
        ) !==
        checkout.plan.planCode
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "The selected LiveBridge plan does not match the plan purchased through Stripe."
          },
          409
        );
      }


      if (
        checkout.customerEmail &&
        accountEmail &&
        checkout.customerEmail.toLowerCase() !==
          accountEmail.toLowerCase()
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "The registration email must match the email used for Stripe checkout."
          },
          409
        );
      }


      if (
        !termsAcceptedAt ||
        !privacyAcceptedAt ||
        !legalVersion
      ) {

        return jsonResponse(
          {
            success: false,
            error:
              "You must accept the LiveBridge Terms of Service and Privacy Policy before creating an account."
          },
          400
        );
      }

      const roomOwner =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT id
          FROM organizations
          WHERE
            UPPER(room_name) = ?
            OR UPPER(
              COALESCE(
                room_alias,
                ''
              )
            ) = ?
          LIMIT 1
        `)
        .bind(
          roomName,
          roomName
        )
        .first();

      if (roomOwner) {

        return jsonResponse(
          {
            success: false,
            error:
              "That LiveBridge room name is already assigned."
          },
          409
        );
      }


      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO organizations (
          clerk_user_id,
          organization_name,
          account_holder,
          email,
          account_email,
          phone,
          room_name,

          terms_accepted_at,
          privacy_accepted_at,
          legal_version,

          plan_code,
          plan_name,

          included_minutes,
          used_minutes,
          bonus_minutes,

          viewer_limit,
          viewer_override,

          account_status,
          billing_status,

          admin_notes,

          created_at,
          updated_at
        )

        VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, 0, 0,
          ?, NULL,
          'active',
          'active',
          NULL,
          ?, ?
        )
      `)
      .bind(
        auth.clerkUserId,

        organizationName,
        accountHolder,
        email,
        accountEmail,
        phone,
        roomName,

        termsAcceptedAt,
        privacyAcceptedAt,
        legalVersion,

        checkout.plan.planCode,
        checkout.plan.planName,

        checkout.plan.includedMinutes,
        checkout.plan.viewerLimit,

        now,
        now
      )
      .run();


      const insertedOrganization =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT id
          FROM organizations
          WHERE clerk_user_id = ?
          LIMIT 1
        `)
        .bind(
          auth.clerkUserId
        )
        .first();


      try {

        await env.TRANSLATIONS_DB.prepare(`
          INSERT INTO stripe_registrations (
            checkout_session_id,
            stripe_customer_id,
            stripe_subscription_id,
            clerk_user_id,
            organization_id,
            plan_code,
            created_at
          )

          VALUES (
            ?, ?, ?, ?, ?, ?, ?
          )
        `)
        .bind(
          checkout.sessionId,
          checkout.customerId,
          checkout.subscriptionId,
          auth.clerkUserId,
          Number(
            insertedOrganization?.id ||
            0
          ),
          checkout.plan.planCode,
          now
        )
        .run();

      } catch (claimError) {

        /*
        If the checkout claim loses a uniqueness race,
        remove the just-created organization so the same
        Stripe payment cannot accidentally create two orgs.
        */

        await env.TRANSLATIONS_DB.prepare(`
          DELETE FROM organizations
          WHERE clerk_user_id = ?
        `)
        .bind(
          auth.clerkUserId
        )
        .run();

        throw new Error(
          "This Stripe checkout has already been used to create a LiveBridge account."
        );
      }

      if (checkout.offerToken) {
        try {
          await claimOfferAfterAccountCreation(
            env,
            checkout.offerToken,
            checkout.plan.planCode,
            accountEmail
          );
        } catch (offerClaimError) {
          await env.TRANSLATIONS_DB.prepare(`
            DELETE FROM stripe_registrations
            WHERE clerk_user_id = ?
          `)
          .bind(auth.clerkUserId)
          .run();

          await env.TRANSLATIONS_DB.prepare(`
            DELETE FROM organizations
            WHERE clerk_user_id = ?
          `)
          .bind(auth.clerkUserId)
          .run();

          throw offerClaimError;
        }
      }


    } else {

      /*
      v1.0.34:
      If this is an existing LiveBridge organization but it does
      not yet have a Stripe registration row, allow a completed
      verified checkout to backfill the missing Stripe link.
      This fixes legacy/test organizations created before Stripe
      registration enforcement was fully working.
      */
      await ensureStripeRegistrationTable(
        env
      );

      const existingStripeRegistration =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT *
          FROM stripe_registrations
          WHERE clerk_user_id = ?
             OR organization_id = ?
          LIMIT 1
        `)
        .bind(
          auth.clerkUserId,
          Number(existing.id)
        )
        .first();

      if (
        !existingStripeRegistration &&
        stripeCheckoutSessionId
      ) {

        const checkout =
          await verifyPaidCheckoutForAccountCreation(
            env,
            stripeCheckoutSessionId
          );

        if (
          normalizePlanCode(
            body.planCode
          ) !==
          checkout.plan.planCode
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "The selected LiveBridge plan does not match the plan purchased through Stripe."
            },
            409
          );
        }

        const claimedCheckout =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT id
            FROM stripe_registrations
            WHERE checkout_session_id = ?
            LIMIT 1
          `)
          .bind(
            checkout.sessionId
          )
          .first();

        if (claimedCheckout) {
          return jsonResponse(
            {
              success: false,
              error:
                "This Stripe checkout has already been used to create another LiveBridge account."
            },
            409
          );
        }

        await env.TRANSLATIONS_DB.prepare(`
          INSERT INTO stripe_registrations (
            checkout_session_id,
            stripe_customer_id,
            stripe_subscription_id,
            clerk_user_id,
            organization_id,
            plan_code,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          checkout.sessionId,
          checkout.customerId,
          checkout.subscriptionId,
          auth.clerkUserId,
          Number(existing.id),
          checkout.plan.planCode,
          now
        )
        .run();

        await env.TRANSLATIONS_DB.prepare(`
          UPDATE organizations
          SET
            plan_code = ?,
            plan_name = ?,
            included_minutes = ?,
            viewer_limit = ?,
            billing_status = 'active',
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          checkout.plan.planCode,
          checkout.plan.planName,
          checkout.plan.includedMinutes,
          checkout.plan.viewerLimit,
          now,
          Number(existing.id)
        )
        .run();
      }

      /*
      Existing customers still cannot freely change their own
      plan, hours or viewer limits through profile sync.
      */

      await env.TRANSLATIONS_DB.prepare(`
        UPDATE organizations

        SET
          organization_name = ?,
          account_holder = ?,
          email = ?,
          phone = ?,
          updated_at = ?

        WHERE clerk_user_id = ?
      `)
      .bind(
        organizationName,
        accountHolder,
        email,
        phone,
        now,
        auth.clerkUserId
      )
      .run();
    }


    const row =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();


    return jsonResponse({
      success: true,
      account: {
        ...buildOrganizationAccount(
          row
        ),
        marketingCredits:
          await marketingCreditBalance(
            env,
            row.id
          )
      }
    });

  } catch (error) {

    console.error(
      "Account sync failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Account sync failed."
      },
      401
    );
  }
}


/*
=======================================================
CUSTOMER - ORGANIZATION SPEECH RATE
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/account-speech-rate"
) {
  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    const body =
      await request.json();

    let speechRate =
      Number(
        body.speechRate
      );

    if (!Number.isFinite(speechRate)) {
      return jsonResponse(
        {
          success: false,
          error: "Speech rate is required."
        },
        400
      );
    }

    speechRate =
      Math.round(
        Math.min(
          1.50,
          Math.max(
            0.75,
            speechRate
          )
        ) * 100
      ) / 100;

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations
      SET
        speech_rate = ?,
        updated_at = ?
      WHERE clerk_user_id = ?
    `)
    .bind(
      speechRate,
      Date.now(),
      auth.clerkUserId
    )
    .run();

    const row =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();

    if (!row) {
      return jsonResponse(
        {
          success: false,
          error: "LiveBridge account not found."
        },
        404
      );
    }

    return jsonResponse({
      success: true,
      speechRate,
      account:
        buildOrganizationAccount(
          row
        )
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to update speech rate."
      },
      403
    );
  }
}


/*
=======================================================
PUBLIC LIVE NOTES
Shared per room + listener language through Durable Object.
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/live-notes"
) {
  try {

    await ensureLiveNotesSchema(
      env
    );

    const room =
      normalizeRoom(
        url.searchParams.get("room")
      );

    const language =
      String(
        url.searchParams.get("lang") ||
        "en"
      )
      .trim()
      .toLowerCase();

    if (!room) {
      return jsonResponse(
        {
          success: false,
          error:
            "room is required."
        },
        400
      );
    }

    const id =
      env.LIVEBRIDGE_ROOMS.idFromName(
        room
      );

    const stub =
      env.LIVEBRIDGE_ROOMS.get(
        id
      );

    const internalURL =
      new URL(
        "https://livebridge.internal/live-notes"
      );

    internalURL.searchParams.set(
      "room",
      room
    );

    internalURL.searchParams.set(
      "lang",
      language
    );

    return stub.fetch(
      new Request(
        internalURL.toString(),
        {
          method:
            "GET"
        }
      )
    );

  } catch (error) {

    console.error(
      "Live notes failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load live notes."
      },
      500
    );
  }
}


/*
=======================================================
PUBLIC ROOM SPEECH SETTINGS
Used by /translate1 listeners.
=======================================================
*/


/*
=======================================================
PUBLIC ON-DEMAND SCRIPTURE VERSE
=======================================================
*/
if (
  request.method === "GET" &&
  url.pathname === "/scripture-verse"
) {
  try {

    const room =
      normalizeRoom(
        url.searchParams.get("room")
      );

    const language =
      String(
        url.searchParams.get("lang") ||
        "en"
      )
      .trim()
      .toLowerCase();

    const reference =
      String(
        url.searchParams.get("reference") ||
        ""
      )
      .trim();

    if (
      !room ||
      !reference
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "room and reference are required."
        },
        400
      );
    }

    const id =
      env.LIVEBRIDGE_ROOMS.idFromName(
        room
      );

    const stub =
      env.LIVEBRIDGE_ROOMS.get(
        id
      );

    const internalURL =
      new URL(
        "https://livebridge.internal/scripture-verse"
      );

    internalURL.searchParams.set(
      "room",
      room
    );

    internalURL.searchParams.set(
      "lang",
      language
    );

    internalURL.searchParams.set(
      "reference",
      reference
    );

    return stub.fetch(
      new Request(
        internalURL.toString(),
        {
          method:
            "GET"
        }
      )
    );

  } catch (error) {

    console.error(
      "Public Scripture lookup failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load Scripture."
      },
      500
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/room-speech-settings"
) {
  try {

    const requestedRoom =
      normalizeRoom(
        url.searchParams.get("room")
      );

    if (!requestedRoom) {
      return jsonResponse(
        {
          success: false,
          error: "room is required."
        },
        400
      );
    }

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          room_name,
          last_subroom,
          speech_rate
        FROM organizations
        WHERE
          room_name = ?
          OR (
            last_subroom IS NOT NULL
            AND last_subroom != ''
            AND room_name || '-' || last_subroom = ?
          )
        LIMIT 1
      `)
      .bind(
        requestedRoom,
        requestedRoom
      )
      .first();

    const speechRate =
      organization
        ? Math.round(
            Math.min(
              1.50,
              Math.max(
                0.75,
                Number(
                  organization.speech_rate ?? 1.15
                )
              )
            ) * 100
          ) / 100
        : 1.15;

    return jsonResponse({
      success: true,
      room: requestedRoom,
      speechRate
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load speech settings."
      },
      500
    );
  }
}


/*
=======================================================
GET CURRENT ACCOUNT
=======================================================
*/

/*
=======================================================
ADMIN - CHECK ACCESS
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/admin/me"
) {

  try {

    const auth =
      await verifyAdminRequest(
        request,
        env
      );

    return jsonResponse({
      success: true,

      admin: {
        clerkUserId:
          auth.admin.clerk_user_id,

        email:
          auth.admin.email || "",

        displayName:
          auth.admin.display_name || "",

        role:
          auth.admin.role || "admin"
      }
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Admin access denied."
      },
      403
    );
  }
}




/*
=======================================================
LIVEBRIDGE v1.0.18 STRIPE CHECKOUT HELPERS
Additive only. Existing signup/account/broadcast logic
remains unchanged.
=======================================================
*/

async function stripeApiRequest(
  env,
  path,
  formData
) {

  const secretKey =
    String(
      env.STRIPE_SECRET_KEY || ""
    ).trim();

  if (!secretKey) {
    throw new Error(
      "Stripe is not configured on this LiveBridge environment."
    );
  }

  const body =
    new URLSearchParams();

  for (const [key, value] of Object.entries(formData || {})) {

    if (
      value === undefined ||
      value === null
    ) {
      continue;
    }

    body.set(
      key,
      String(value)
    );
  }

  const response =
    await fetch(
      "https://api.stripe.com" + path,
      {
        method: "POST",

        headers: {
          "Authorization":
            "Bearer " + secretKey,

          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          body.toString()
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    const message =
      data?.error?.message ||
      "Stripe request failed.";

    const error =
      new Error(message);

    error.stripeStatus =
      response.status;

    throw error;
  }

  return data;
}



async function stripeApiGet(
  env,
  path
) {

  const secretKey =
    String(
      env.STRIPE_SECRET_KEY || ""
    ).trim();

  if (!secretKey) {
    throw new Error(
      "Stripe is not configured on this LiveBridge environment."
    );
  }

  const response =
    await fetch(
      "https://api.stripe.com" + path,
      {
        method: "GET",

        headers: {
          "Authorization":
            "Bearer " + secretKey
        }
      }
    );

  const data =
    await response.json();

  if (!response.ok) {

    const message =
      data?.error?.message ||
      "Stripe request failed.";

    const error =
      new Error(message);

    error.stripeStatus =
      response.status;

    throw error;
  }

  return data;
}


async function loadPlanByCode(
  env,
  planCode
) {

  const normalized =
    normalizePlanCode(
      planCode
    );

  if (!normalized) {
    return null;
  }

  const row =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM plans
      WHERE plan_code = ?
      LIMIT 1
    `)
    .bind(
      normalized
    )
    .first();

  return buildPlanRecord(
    row
  );
}




async function ensureOffersSchema(
  env
) {

  await env.TRANSLATIONS_DB.prepare(`
    CREATE TABLE IF NOT EXISTS offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      plan_id INTEGER NOT NULL,
      plan_code TEXT NOT NULL,
      recipient_name TEXT DEFAULT '',
      recipient_email TEXT DEFAULT '',
      expiration_timestamp INTEGER,
      max_redemptions INTEGER NOT NULL DEFAULT 1,
      redemption_count INTEGER NOT NULL DEFAULT 0,
      single_use INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      note TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      redeemed_at INTEGER
    )
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_offers_token
    ON offers (token)
  `).run();

  await env.TRANSLATIONS_DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_offers_plan
    ON offers (plan_id, status)
  `).run();
}


function secureOfferToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
}


async function createStripeProductForPlan(
  env,
  values
) {

  return stripeApiRequest(
    env,
    "/v1/products",
    {
      name: values.planName,
      description: values.description || undefined,
      "metadata[livebridge_plan_code]": values.planCode,
      "metadata[livebridge_custom_plan]": "true"
    }
  );
}


async function updateStripeProductForPlan(
  env,
  productId,
  values
) {

  return stripeApiRequest(
    env,
    "/v1/products/" + encodeURIComponent(productId),
    {
      name: values.planName,
      description: values.description || "",
      "metadata[livebridge_plan_code]": values.planCode,
      "metadata[livebridge_custom_plan]": "true"
    }
  );
}


async function createStripePriceForPlan(
  env,
  productId,
  values
) {

  return stripeApiRequest(
    env,
    "/v1/prices",
    {
      product: productId,
      unit_amount: Math.max(0, Number(values.priceCents || 0)),
      currency: String(values.currency || "CAD").toLowerCase(),
      "recurring[interval]": values.billingInterval,
      "metadata[livebridge_plan_code]": values.planCode,
      "metadata[livebridge_custom_plan]": "true"
    }
  );
}


async function synchronizeCustomPlanWithStripe(
  env,
  existingPlan,
  values
) {

  let stripeProductId =
    String(existingPlan?.stripe_product_id || values.stripeProductId || "").trim();

  let stripePriceId =
    String(existingPlan?.stripe_price_id || values.stripePriceId || "").trim();

  if (!stripeProductId) {
    const product = await createStripeProductForPlan(env, values);
    stripeProductId = String(product.id || "").trim();
  } else {
    await updateStripeProductForPlan(
      env,
      stripeProductId,
      values
    );
  }

  const priceChanged =
    !existingPlan ||
    Number(existingPlan.price_cents || 0) !== Number(values.priceCents || 0) ||
    String(existingPlan.currency || "CAD").toUpperCase() !== String(values.currency || "CAD").toUpperCase() ||
    String(existingPlan.billing_interval || "month").toLowerCase() !== String(values.billingInterval || "month").toLowerCase();

  if (!stripePriceId || priceChanged) {
    const price = await createStripePriceForPlan(
      env,
      stripeProductId,
      values
    );
    stripePriceId = String(price.id || "").trim();
  }

  if (!stripeProductId || !stripePriceId) {
    throw new Error("Stripe did not return the required Product/Price IDs.");
  }

  return {
    stripeProductId,
    stripePriceId
  };
}


async function getValidOffer(
  env,
  token
) {

  await ensureOffersSchema(env);

  const normalizedToken =
    String(token || "").trim();

  if (!normalizedToken) {
    return null;
  }

  const row =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT
        o.*,
        p.plan_name,
        p.description,
        p.price_cents,
        p.currency,
        p.billing_interval,
        p.included_minutes,
        p.viewer_limit,
        p.public_visible,
        p.active AS plan_active,
        p.custom_plan,
        p.features_json,
        p.stripe_product_id,
        p.stripe_price_id
      FROM offers o
      INNER JOIN plans p
        ON p.id = o.plan_id
      WHERE o.token = ?
      LIMIT 1
    `)
    .bind(normalizedToken)
    .first();

  if (!row) {
    return null;
  }

  const now = Date.now();
  const expired =
    Number(row.expiration_timestamp || 0) > 0 &&
    Number(row.expiration_timestamp) < now;

  const exhausted =
    Number(row.redemption_count || 0) >=
    Math.max(1, Number(row.max_redemptions || 1));

  const active =
    String(row.status || "").toLowerCase() === "active" &&
    Number(row.plan_active || 0) === 1 &&
    !expired &&
    !exhausted;

  return {
    row,
    active,
    expired,
    exhausted
  };
}


function buildPublicOfferRecord(
  offerResult
) {

  if (!offerResult?.row) {
    return null;
  }

  const row = offerResult.row;
  let features = [];

  try {
    const parsed = JSON.parse(String(row.features_json || "[]"));
    features = Array.isArray(parsed) ? parsed : [];
  } catch {
    features = [];
  }

  return {
    token: String(row.token || ""),
    active: offerResult.active === true,
    expired: offerResult.expired === true,
    exhausted: offerResult.exhausted === true,
    recipientName: String(row.recipient_name || ""),
    recipientEmailRestricted: !!String(row.recipient_email || "").trim(),
    expirationTimestamp: Number(row.expiration_timestamp || 0),
    maxRedemptions: Math.max(1, Number(row.max_redemptions || 1)),
    redemptionCount: Math.max(0, Number(row.redemption_count || 0)),
    singleUse: Number(row.single_use || 0) === 1,
    note: String(row.note || ""),
    plan: {
      id: Number(row.plan_id),
      planCode: String(row.plan_code || ""),
      planName: String(row.plan_name || ""),
      description: String(row.description || ""),
      priceCents: Math.max(0, Number(row.price_cents || 0)),
      currency: String(row.currency || "CAD").toUpperCase(),
      billingInterval: String(row.billing_interval || "month").toLowerCase(),
      includedMinutes: Math.max(0, Number(row.included_minutes || 0)),
      viewerLimit: Math.max(1, Number(row.viewer_limit || 1)),
      customPlan: Number(row.custom_plan || 0) === 1,
      features
    }
  };
}


async function claimOfferAfterAccountCreation(
  env,
  token,
  planCode,
  accountEmail
) {

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return { claimed: false, notRequired: true };
  }

  await ensureOffersSchema(env);

  const now = Date.now();
  const normalizedEmail = String(accountEmail || "").trim().toLowerCase();

  const result = await env.TRANSLATIONS_DB.prepare(`
    UPDATE offers
    SET
      redemption_count = redemption_count + 1,
      redeemed_at = ?,
      status = CASE
        WHEN redemption_count + 1 >= max_redemptions THEN 'redeemed'
        ELSE status
      END
    WHERE token = ?
      AND plan_code = ?
      AND status = 'active'
      AND redemption_count < max_redemptions
      AND (expiration_timestamp IS NULL OR expiration_timestamp = 0 OR expiration_timestamp >= ?)
      AND (
        COALESCE(recipient_email, '') = ''
        OR LOWER(recipient_email) = ?
      )
  `)
  .bind(
    now,
    normalizedToken,
    normalizePlanCode(planCode),
    now,
    normalizedEmail
  )
  .run();

  const changes = Number(result?.meta?.changes || 0);

  if (changes !== 1) {
    throw new Error(
      "This private offer is expired, already redeemed, restricted to another email, or no longer available."
    );
  }

  return { claimed: true };
}




/*
=======================================================
LIVEBRIDGE SELF-SERVICE BILLING PORTAL
Authenticated existing customers only.
Uses the Stripe customer already linked in
stripe_registrations. No new subscription is created.
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/stripe/customer-portal"
) {

  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    await ensureStripeRegistrationTable(
      env
    );

    const registration =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          sr.*,
          o.id AS organization_id_joined,
          o.organization_name,
          o.plan_code AS organization_plan_code,
          o.billing_status
        FROM stripe_registrations sr
        LEFT JOIN organizations o
          ON o.id = sr.organization_id
        WHERE sr.clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();

    if (
      !registration ||
      !registration.organization_id
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "This LiveBridge account is not linked to Stripe billing yet."
        },
        409
      );
    }

    const customerId =
      String(
        registration.stripe_customer_id ||
        ""
      ).trim();

    if (
      !customerId ||
      !customerId.startsWith(
        "cus_"
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "This LiveBridge account does not have a valid Stripe customer record."
        },
        409
      );
    }

    const portal =
      await stripeApiRequest(
        env,
        "/v1/billing_portal/sessions",
        {
          customer:
            customerId,

          return_url:
            "https://livebridge.ca/account/?panel=billing"
        }
      );

    const portalUrl =
      String(
        portal?.url ||
        ""
      ).trim();

    if (!portalUrl) {
      throw new Error(
        "Stripe did not return a billing portal URL."
      );
    }

    return jsonResponse({
      success: true,
      portalUrl
    });

  } catch (error) {

    console.error(
      "Stripe customer portal creation failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to open Stripe billing management."
      },
      Number(
        error.stripeStatus ||
        500
      )
    );
  }
}


/*
=======================================================
PUBLIC - VERIFY STRIPE CHECKOUT SESSION
Read-only verification used by /signup after Stripe
redirect. Does not create or alter a LiveBridge account.
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/stripe/verify-checkout-session"
) {

  try {

    const body =
      await request.json();

    const sessionId =
      String(
        body.sessionId || ""
      ).trim();

    if (
      !sessionId ||
      !sessionId.startsWith(
        "cs_"
      )
    ) {

      return jsonResponse(
        {
          success: false,
          verified: false,
          error:
            "A valid Stripe Checkout session is required."
        },
        400
      );
    }

    const session =
      await stripeApiGet(
        env,
        "/v1/checkout/sessions/" +
        encodeURIComponent(
          sessionId
        )
      );

    if (
      String(
        session.mode || ""
      ) !==
      "subscription"
    ) {

      return jsonResponse(
        {
          success: false,
          verified: false,
          error:
            "This Checkout session is not a LiveBridge subscription."
        },
        409
      );
    }

    if (
      String(
        session.status || ""
      ) !==
      "complete"
    ) {

      return jsonResponse(
        {
          success: false,
          verified: false,
          error:
            "Stripe Checkout has not been completed."
        },
        409
      );
    }

    const paymentStatus =
      String(
        session.payment_status || ""
      );

    if (
      paymentStatus !==
        "paid" &&
      paymentStatus !==
        "no_payment_required"
    ) {

      return jsonResponse(
        {
          success: false,
          verified: false,
          error:
            "Stripe has not confirmed payment for this Checkout session."
        },
        409
      );
    }

    const planCode =
      normalizePlanCode(
        session.metadata
          ?.livebridge_plan_code ||
        ""
      );

    const plan =
      await loadPlanByCode(
        env,
        planCode
      );

    if (!plan) {

      return jsonResponse(
        {
          success: false,
          verified: false,
          error:
            "The LiveBridge plan linked to this payment could not be found."
        },
        404
      );
    }

    const lineItems =
      await stripeApiGet(
        env,
        "/v1/checkout/sessions/" +
        encodeURIComponent(
          sessionId
        ) +
        "/line_items?limit=10"
      );

    const purchasedPriceIds =
      (
        lineItems.data || []
      )
      .map(
        item =>
          String(
            item?.price?.id ||
            ""
          )
      )
      .filter(Boolean);

    if (
      !plan.stripePriceId ||
      !purchasedPriceIds.includes(
        plan.stripePriceId
      )
    ) {

      return jsonResponse(
        {
          success: false,
          verified: false,
          error:
            "The Stripe price purchased does not match the LiveBridge plan."
        },
        409
      );
    }

    return jsonResponse({
      success: true,
      verified: true,

      checkout: {
        sessionId:
          String(
            session.id || ""
          ),

        customerId:
          String(
            session.customer || ""
          ),

        subscriptionId:
          String(
            session.subscription || ""
          ),

        customerEmail:
          String(
            session.customer_details
              ?.email ||
            session.customer_email ||
            ""
          ),

        paymentStatus,

        status:
          String(
            session.status || ""
          )
      },

      plan: {
        id:
          plan.id,

        planCode:
          plan.planCode,

        planName:
          plan.planName,

        description:
          plan.description,

        priceCents:
          plan.priceCents,

        currency:
          plan.currency,

        billingInterval:
          plan.billingInterval,

        includedMinutes:
          plan.includedMinutes,

        viewerLimit:
          plan.viewerLimit,

        features:
          plan.features || []
      }
    });

  } catch (error) {

    console.error(
      "Stripe Checkout verification failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        verified: false,
        error:
          error.message ||
          "Unable to verify Stripe Checkout."
      },
      Number(
        error.stripeStatus ||
        500
      )
    );
  }
}


/*
=======================================================
PUBLIC - CREATE STRIPE CHECKOUT SESSION
Current phase: public active paid plans only.
Registration is NOT yet gated here; that comes after
Checkout itself is verified.
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/stripe/create-checkout-session"
) {

  try {

    const body =
      await request.json();

    const plan =
      await loadPlanByCode(
        env,
        body.planCode
      );

    if (!plan) {

      return jsonResponse(
        {
          success: false,
          error:
            "LiveBridge plan not found."
        },
        404
      );
    }

    if (
      !plan.active ||
      !plan.publicVisible
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "This LiveBridge plan is not currently available for public checkout."
        },
        403
      );
    }

    if (
      !plan.stripePriceId
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "This plan is not connected to Stripe yet."
        },
        409
      );
    }

    const isFreeDemoPlan =
      String(
        plan.planCode || ""
      ).toLowerCase() ===
        "free-demo";

    if (
      Number(plan.priceCents || 0) <= 0 &&
      !isFreeDemoPlan
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "This public plan does not have a paid price configured."
        },
        409
      );
    }

    const publicBase =
      "https://livebridge.ca";

    const successUrl =
      publicBase +
      "/signup/" +
      "?checkout=success" +
      "&session_id={CHECKOUT_SESSION_ID}" +
      "&plan=" +
      encodeURIComponent(
        plan.planCode
      );

    const cancelUrl =
      publicBase +
      "/#pricing";

    const session =
      await stripeApiRequest(
        env,
        "/v1/checkout/sessions",
        {
          mode:
            "subscription",

          "line_items[0][price]":
            plan.stripePriceId,

          "line_items[0][quantity]":
            1,

          success_url:
            successUrl,

          cancel_url:
            cancelUrl,

          "metadata[livebridge_plan_code]":
            plan.planCode,

          "subscription_data[metadata][livebridge_plan_code]":
            plan.planCode,

          allow_promotion_codes:
            "true",

          billing_address_collection:
            "auto",

          ...(isFreeDemoPlan
            ? {
                payment_method_collection:
                  "if_required"
              }
            : {})
        }
      );

    return jsonResponse({
      success: true,
      checkoutUrl:
        String(
          session.url || ""
        ),
      sessionId:
        String(
          session.id || ""
        ),
      plan: {
        planCode:
          plan.planCode,
        planName:
          plan.planName,
        priceCents:
          plan.priceCents,
        currency:
          plan.currency,
        billingInterval:
          plan.billingInterval
      }
    });

  } catch (error) {

    console.error(
      "Stripe Checkout session failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to start Stripe Checkout."
      },
      Number(
        error.stripeStatus ||
        500
      )
    );
  }
}



/*
=======================================================
PUBLIC - RESOLVE OPTIONAL ROOM ALIAS
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/room-resolve"
) {

  try {

    const resolved =
      await resolveCanonicalRoom(
        env,
        url.searchParams.get("room") || ""
      );

    return jsonResponse({
      success: true,
      requestedRoom:
        resolved.requestedRoom,
      resolvedRoom:
        resolved.resolvedRoom,
      aliasMatched:
        resolved.aliasMatched
    });

  } catch (error) {

    console.error(
      "Room alias resolve failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          "Unable to resolve room."
      },
      500
    );
  }
}


/*
=======================================================
PUBLIC - CHECK ROOM AVAILABILITY
Read-only. Does not reserve or create the room.
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/room-availability"
) {

  try {

    await ensureRoomAliasSchema(
      env
    );

    const roomName =
      normalizeRoomName(
        url.searchParams.get(
          "room"
        ) || ""
      );

    const validationError =
      roomNameValidationError(
        roomName
      );

    if (validationError) {

      return jsonResponse(
        {
          success: true,
          available: false,
          normalizedRoom:
            roomName,
          error:
            validationError
        }
      );
    }

    const existing =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          clerk_user_id,
          organization_name,
          room_name,
          room_alias
        FROM organizations
        WHERE
          UPPER(room_name) = ?
          OR UPPER(
            COALESCE(
              room_alias,
              ''
            )
          ) = ?
        LIMIT 1
      `)
      .bind(
        roomName,
        roomName
      )
      .first();

    return jsonResponse({
      success: true,
      available:
        !existing,
      normalizedRoom:
        roomName
    });

  } catch (error) {

    console.error(
      "Room availability check failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        available: false,
        error:
          error.message ||
          "Unable to check room availability."
      },
      500
    );
  }
}


/*
=======================================================
PUBLIC - LIST ACTIVE PUBLIC PLANS
=======================================================
*/
if (
  request.method === "GET" &&
  url.pathname === "/plans"
) {
  try {
    return jsonResponse({
      success: true,
      plans:
        (
          await loadPlans(
            env,
            true
          )
        )
        .map(
          publicPlanPresentation
        )
    });
  } catch (error) {
    console.error("Public plans failed:", error);
    return jsonResponse({
      success: false,
      error: error.message || "Unable to load LiveBridge plans."
    }, 500);
  }
}


/*
=======================================================
ADMIN - LIST ALL PLANS
=======================================================
*/
if (
  request.method === "GET" &&
  url.pathname === "/admin/plans"
) {
  try {
    await verifyAdminRequest(request, env);
    return jsonResponse({
      success: true,
      plans: await loadPlans(env, false)
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Administrator access required."
    }, 403);
  }
}


/*
=======================================================
ADMIN - CREATE / UPDATE PLAN
Custom/private plans automatically create and maintain
Stripe Product + recurring Price IDs.
=======================================================
*/
if (
  request.method === "POST" &&
  url.pathname === "/admin/plan-save"
) {
  try {
    await verifyAdminRequest(request, env);

    const body = await request.json();
    const id = Math.max(0, Number(body.id || 0));
    const planName = String(body.planName || "").trim();
    const planCode = normalizePlanCode(body.planCode || planName);

    if (!planName || !planCode) {
      return jsonResponse({
        success: false,
        error: "Plan name and plan code are required."
      }, 400);
    }

    const values = {
      planCode,
      planName,
      description: String(body.description || "").trim(),
      priceCents: Math.max(0, Math.round(Number(body.priceCents || 0))),
      currency: String(body.currency || "CAD").trim().toUpperCase(),
      billingInterval: String(body.billingInterval || "month").trim().toLowerCase(),
      includedMinutes: Math.max(0, Math.round(Number(body.includedMinutes || 0))),
      viewerLimit: Math.max(1, Math.round(Number(body.viewerLimit || 1))),
      publicVisible: body.publicVisible === true ? 1 : 0,
      active: body.active === false ? 0 : 1,
      displayOrder: Math.round(Number(body.displayOrder || 0)),
      stripeProductId: String(body.stripeProductId || "").trim(),
      stripePriceId: String(body.stripePriceId || "").trim(),
      customPlan: body.customPlan === true ? 1 : 0,
      featuresJson: JSON.stringify(
        Array.isArray(body.features)
          ? body.features.map(v => String(v || "").trim()).filter(Boolean)
          : []
      )
    };

    let existingPlan = null;

    if (id > 0) {
      existingPlan = await env.TRANSLATIONS_DB.prepare(
        `SELECT * FROM plans WHERE id = ? LIMIT 1`
      ).bind(id).first();

      if (!existingPlan) {
        return jsonResponse({
          success: false,
          error: "Plan not found."
        }, 404);
      }
    }

    if (
      values.customPlan === 1 ||
      values.publicVisible === 0
    ) {
      const stripe = await synchronizeCustomPlanWithStripe(
        env,
        existingPlan,
        values
      );

      values.stripeProductId = stripe.stripeProductId;
      values.stripePriceId = stripe.stripePriceId;
    }

    const now = Date.now();

    if (id > 0) {
      await env.TRANSLATIONS_DB.prepare(`
        UPDATE plans
        SET
          plan_code = ?,
          plan_name = ?,
          description = ?,
          price_cents = ?,
          currency = ?,
          billing_interval = ?,
          included_minutes = ?,
          viewer_limit = ?,
          public_visible = ?,
          active = ?,
          display_order = ?,
          stripe_product_id = ?,
          stripe_price_id = ?,
          custom_plan = ?,
          features_json = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        values.planCode,
        values.planName,
        values.description,
        values.priceCents,
        values.currency,
        values.billingInterval,
        values.includedMinutes,
        values.viewerLimit,
        values.publicVisible,
        values.active,
        values.displayOrder,
        values.stripeProductId,
        values.stripePriceId,
        values.customPlan,
        values.featuresJson,
        now,
        id
      ).run();

    } else {
      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO plans (
          plan_code,
          plan_name,
          description,
          price_cents,
          currency,
          billing_interval,
          included_minutes,
          viewer_limit,
          public_visible,
          active,
          display_order,
          stripe_product_id,
          stripe_price_id,
          custom_plan,
          features_json,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        values.planCode,
        values.planName,
        values.description,
        values.priceCents,
        values.currency,
        values.billingInterval,
        values.includedMinutes,
        values.viewerLimit,
        values.publicVisible,
        values.active,
        values.displayOrder,
        values.stripeProductId,
        values.stripePriceId,
        values.customPlan,
        values.featuresJson,
        now,
        now
      ).run();
    }

    const saved = await env.TRANSLATIONS_DB.prepare(
      `SELECT * FROM plans WHERE plan_code = ? LIMIT 1`
    ).bind(values.planCode).first();

    return jsonResponse({
      success: true,
      plan: buildPlanRecord(saved),
      stripeAutomatic: values.customPlan === 1
    });

  } catch (error) {
    const message = String(error?.message || error || "");
    const conflict = message.toLowerCase().includes("unique");

    return jsonResponse({
      success: false,
      error: conflict
        ? "That plan code is already in use."
        : (message || "Unable to save plan.")
    }, conflict ? 409 : 403);
  }
}


/*
=======================================================
ADMIN - CREATE PRIVATE OFFER
=======================================================
*/
if (
  request.method === "POST" &&
  url.pathname === "/admin/offer-create"
) {
  try {
    const auth = await verifyAdminRequest(request, env);
    await ensureOffersSchema(env);

    const body = await request.json();
    const planId = Math.max(0, Number(body.planId || 0));
    const recipientName = String(body.recipientName || "").trim();
    const recipientEmail = String(body.recipientEmail || "").trim().toLowerCase();
    const expirationTimestamp = Math.max(0, Number(body.expirationTimestamp || 0));
    const singleUse = body.singleUse !== false;
    const maxRedemptions = singleUse
      ? 1
      : Math.max(1, Math.min(1000, Math.round(Number(body.maxRedemptions || 1))));
    const note = String(body.note || "").trim().substring(0, 1500);

    if (!planId) {
      return jsonResponse({
        success: false,
        error: "Plan ID is required."
      }, 400);
    }

    const planRow = await env.TRANSLATIONS_DB.prepare(
      `SELECT * FROM plans WHERE id = ? LIMIT 1`
    ).bind(planId).first();

    if (!planRow) {
      return jsonResponse({
        success: false,
        error: "Plan not found."
      }, 404);
    }

    if (Number(planRow.active || 0) !== 1) {
      return jsonResponse({
        success: false,
        error: "Only active plans can be shared as an offer."
      }, 409);
    }

    if (
      Number(planRow.custom_plan || 0) !== 1 &&
      Number(planRow.public_visible || 0) === 1
    ) {
      return jsonResponse({
        success: false,
        error: "Share Offer is intended for custom or private plans."
      }, 409);
    }

    if (!String(planRow.stripe_product_id || "").trim() ||
        !String(planRow.stripe_price_id || "").trim()) {
      return jsonResponse({
        success: false,
        error: "This plan must be connected to Stripe before it can be shared. Save the custom plan again first."
      }, 409);
    }

    if (expirationTimestamp && expirationTimestamp <= Date.now()) {
      return jsonResponse({
        success: false,
        error: "Offer expiration must be in the future."
      }, 400);
    }

    let token = secureOfferToken();
    let inserted = false;

    for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
      try {
        await env.TRANSLATIONS_DB.prepare(`
          INSERT INTO offers (
            token,
            plan_id,
            plan_code,
            recipient_name,
            recipient_email,
            expiration_timestamp,
            max_redemptions,
            redemption_count,
            single_use,
            status,
            note,
            created_by,
            created_at,
            redeemed_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'active', ?, ?, ?, NULL)
        `).bind(
          token,
          Number(planRow.id),
          String(planRow.plan_code || ""),
          recipientName,
          recipientEmail,
          expirationTimestamp || null,
          maxRedemptions,
          singleUse ? 1 : 0,
          note,
          String(auth.admin?.clerk_user_id || auth.clerkUserId || ""),
          Date.now()
        ).run();
        inserted = true;
      } catch (error) {
        if (!String(error?.message || error || "").toLowerCase().includes("unique")) {
          throw error;
        }
        token = secureOfferToken();
      }
    }

    if (!inserted) {
      throw new Error("Unable to generate a unique private-offer link.");
    }

    const offerResult = await getValidOffer(env, token);

    return jsonResponse({
      success: true,
      offer: buildPublicOfferRecord(offerResult),
      offerUrl: "https://livebridge.ca/offer/" + token
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Unable to create private offer."
    }, 403);
  }
}


/*
=======================================================
PUBLIC - PRIVATE OFFER DETAILS
=======================================================
*/
if (
  request.method === "GET" &&
  url.pathname === "/offer"
) {
  try {
    const token = String(url.searchParams.get("token") || "").trim();
    const offerResult = await getValidOffer(env, token);

    if (!offerResult) {
      return jsonResponse({
        success: false,
        error: "Private offer not found."
      }, 404);
    }

    return jsonResponse({
      success: true,
      offer: buildPublicOfferRecord(offerResult)
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Unable to load private offer."
    }, 500);
  }
}


/*
=======================================================
PUBLIC - CREATE CHECKOUT FROM PRIVATE OFFER
=======================================================
*/
if (
  request.method === "POST" &&
  url.pathname === "/stripe/create-offer-checkout-session"
) {
  try {
    const body = await request.json();
    const token = String(body.token || "").trim();
    const offerResult = await getValidOffer(env, token);

    if (!offerResult || !offerResult.active) {
      return jsonResponse({
        success: false,
        error: "This private offer is expired, redeemed, or no longer available."
      }, 410);
    }

    const row = offerResult.row;

    if (!String(row.stripe_price_id || "").trim()) {
      return jsonResponse({
        success: false,
        error: "This private plan is not connected to Stripe."
      }, 409);
    }

    const publicBase = "https://livebridge.ca";
    const successUrl =
      publicBase +
      "/signup/" +
      "?checkout=success" +
      "&session_id={CHECKOUT_SESSION_ID}" +
      "&plan=" +
      encodeURIComponent(String(row.plan_code || ""));

    const cancelUrl =
      publicBase +
      "/offer/" +
      encodeURIComponent(token);

    const recipientEmail =
      String(row.recipient_email || "").trim();

    const session = await stripeApiRequest(
      env,
      "/v1/checkout/sessions",
      {
        mode: "subscription",
        "line_items[0][price]": String(row.stripe_price_id || ""),
        "line_items[0][quantity]": 1,
        success_url: successUrl,
        cancel_url: cancelUrl,
        "metadata[livebridge_plan_code]": String(row.plan_code || ""),
        "metadata[livebridge_offer_token]": token,
        "subscription_data[metadata][livebridge_plan_code]": String(row.plan_code || ""),
        "subscription_data[metadata][livebridge_offer_token]": token,
        allow_promotion_codes: "true",
        billing_address_collection: "auto",
        ...(recipientEmail
          ? { customer_email: recipientEmail }
          : {}),
        ...(Number(row.price_cents || 0) <= 0
          ? { payment_method_collection: "if_required" }
          : {})
      }
    );

    return jsonResponse({
      success: true,
      checkoutUrl: String(session.url || ""),
      sessionId: String(session.id || "")
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Unable to open private-offer checkout."
    }, Number(error.stripeStatus || 500));
  }
}


/*
=======================================================
ADMIN - ARCHIVE PLAN
=======================================================
*/
if (
  request.method === "POST" &&
  url.pathname === "/admin/plan-archive"
) {
  try {
    await verifyAdminRequest(request, env);

    const body = await request.json();
    const id = Math.max(0, Number(body.id || 0));

    if (!id) {
      return jsonResponse({
        success: false,
        error: "Plan ID is required."
      }, 400);
    }

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE plans
      SET
        active = 0,
        public_visible = 0,
        updated_at = ?
      WHERE id = ?
    `).bind(Date.now(), id).run();

    return jsonResponse({
      success: true,
      archived: true,
      id
    });

  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Unable to archive plan."
    }, 403);
  }
}


/*
=======================================================
ADMIN - LIST ALL ORGANIZATIONS
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/admin/organizations"
) {

  try {

    await ensureBroadcastSafetySchema(
      env
    );

    await ensureLiveNotesSchema(
      env
    );

    await ensureApiCostSchema(
      env
    );

    await ensureRoomAliasSchema(
      env
    );

    await ensureAdminOrganizationOrderSchema(
      env
    );

    await verifyAdminRequest(
      request,
      env
    );

    const result =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          o.*,
          ao.sort_order AS admin_sort_order
        FROM organizations o
        LEFT JOIN organization_admin_order ao
          ON ao.organization_id = o.id
        ORDER BY
          CASE
            WHEN ao.sort_order IS NULL
            THEN 1
            ELSE 0
          END,
          ao.sort_order ASC,
          o.created_at DESC
      `)
      .all();

    const organizations = [];

    for (
      const row of result.results || []
    ) {

      const account =
        buildOrganizationAccount(
          row
        );

      const broadcastStats =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            COUNT(*) AS broadcast_count,

            COALESCE(
              SUM(
                CASE
                  WHEN ended_at IS NOT NULL
                  THEN ended_at - started_at
                  ELSE 0
                END
              ),
              0
            ) AS broadcast_time_ms,

            COALESCE(
              MAX(peak_listeners),
              0
            ) AS highest_peak

          FROM broadcast_sessions
          WHERE room = ?
        `)
        .bind(
          row.room_name
        )
        .first();


      const listenerStats =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            COUNT(*) AS listener_sessions
          FROM listener_sessions
          WHERE room = ?
        `)
        .bind(
          row.room_name
        )
        .first();


      const azureUsage =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            COALESCE(
              characters,
              0
            ) AS characters,

            COALESCE(
              generations,
              0
            ) AS generations

          FROM azure_tts_usage

          WHERE
            organization_id = ?
            AND usage_month = ?

          LIMIT 1
        `)
        .bind(
          Number(
            row.id
          ),
          currentUsageMonth()
        )
        .first();


      const openAiUsageResult =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            category,

            COALESCE(
              SUM(input_tokens),
              0
            ) AS input_tokens,

            COALESCE(
              SUM(cached_input_tokens),
              0
            ) AS cached_input_tokens,

            COALESCE(
              SUM(output_tokens),
              0
            ) AS output_tokens,

            COALESCE(
              SUM(requests),
              0
            ) AS requests,

            COALESCE(
              SUM(cost_usd),
              0
            ) AS cost_usd

          FROM openai_usage

          WHERE
            organization_id = ?
            AND usage_month = ?

          GROUP BY category
        `)
        .bind(
          Number(
            row.id
          ),
          currentUsageMonth()
        )
        .all();


      const openAiCostBreakdown = {};

      let openAiInputTokens = 0;
      let openAiCachedInputTokens = 0;
      let openAiOutputTokens = 0;
      let openAiRequests = 0;
      let openAiCostUsd = 0;

      for (
        const usageRow of
        openAiUsageResult.results || []
      ) {

        const category =
          String(
            usageRow.category ||
            "other"
          );

        const categoryCost =
          Number(
            usageRow.cost_usd || 0
          );

        openAiCostBreakdown[
          category
        ] =
          Math.round(
            categoryCost *
            1000000
          ) / 1000000;

        openAiInputTokens +=
          Number(
            usageRow.input_tokens || 0
          );

        openAiCachedInputTokens +=
          Number(
            usageRow.cached_input_tokens || 0
          );

        openAiOutputTokens +=
          Number(
            usageRow.output_tokens || 0
          );

        openAiRequests +=
          Number(
            usageRow.requests || 0
          );

        openAiCostUsd +=
          categoryCost;
      }


      const azureTtsCostUsd =
        calculateAzureTtsCostUsd(
          azureUsage
            ?.characters ||
          0
        );


      const totalApiCostUsd =
        openAiCostUsd +
        azureTtsCostUsd;


      organizations.push({

        ...account,

        stats: {

          broadcastCount:
            Number(
              broadcastStats
                ?.broadcast_count ||
              0
            ),

          broadcastTimeMs:
            Number(
              broadcastStats
                ?.broadcast_time_ms ||
              0
            ),

          broadcastHours:
            Math.round(
              (
                Number(
                  broadcastStats
                    ?.broadcast_time_ms ||
                  0
                ) /
                3600000
              ) *
              100
            ) / 100,

          highestPeak:
            Number(
              broadcastStats
                ?.highest_peak ||
              0
            ),

          listenerSessions:
            Number(
              listenerStats
                ?.listener_sessions ||
              0
            ),

          azureTtsCharacters:
            Number(
              azureUsage
                ?.characters ||
              0
            ),

          azureTtsGenerations:
            Number(
              azureUsage
                ?.generations ||
              0
            ),

          azureTtsUsageMonth:
            currentUsageMonth(),

          azureTtsCostUsd:
            Math.round(
              azureTtsCostUsd *
              1000000
            ) / 1000000,

          openAiInputTokens,
          openAiCachedInputTokens,
          openAiOutputTokens,
          openAiRequests,

          openAiCostUsd:
            Math.round(
              openAiCostUsd *
              1000000
            ) / 1000000,

          openAiCostBreakdown,

          apiCostUsd:
            Math.round(
              totalApiCostUsd *
              1000000
            ) / 1000000,

          apiCostCurrency:
            LIVEBRIDGE_API_COST_PRICING
              .currency,

          apiCostUsageMonth:
            currentUsageMonth()
        }
      });
    }


    return jsonResponse({
      success: true,
      organizations
    });

  } catch (error) {

    console.error(
      "Admin organizations failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Admin access denied."
      },
      403
    );
  }
}


async function buildMarketingAdminAnalytics(
  env,
  organizationId
) {
  await ensureMarketingSchema(env);
  await ensureMarketingCreditsSchema(env);

  const id = Number(organizationId || 0);
  const now = Date.now();

  const [
    campaignsResult,
    refundsResult,
    creditAccount
  ] = await Promise.all([
    env.TRANSLATIONS_DB.prepare(`
      SELECT
        id,
        campaign_json,
        created_at
      FROM marketing_campaigns
      WHERE organization_id = ?
      ORDER BY created_at DESC
      LIMIT 5000
    `)
    .bind(id)
    .all(),

    env.TRANSLATIONS_DB.prepare(`
      SELECT
        campaign_id,
        reason,
        requested_at,
        refunded_at,
        balance_after
      FROM marketing_generation_refunds
      WHERE organization_id = ?
      ORDER BY requested_at DESC
      LIMIT 5000
    `)
    .bind(id)
    .all(),

    env.TRANSLATIONS_DB.prepare(`
      SELECT
        balance,
        lifetime_purchased,
        lifetime_used,
        updated_at
      FROM marketing_credit_accounts
      WHERE organization_id = ?
      LIMIT 1
    `)
    .bind(id)
    .first()
  ]);

  const refunds =
    refundsResult.results || [];

  const refundByCampaign =
    new Map(
      refunds.map(item => [
        String(item.campaign_id || ""),
        item
      ])
    );

  const campaigns =
    (campaignsResult.results || [])
      .map(row => {
        const campaign =
          safeJson(
            row.campaign_json,
            {}
          ) || {};

        return {
          id:
            String(row.id || ""),
          createdAt:
            Number(
              row.created_at ||
              campaign.createdAt ||
              0
            ),
          campaignName:
            String(
              campaign.campaignName ||
              ""
            ),
          languageCode:
            String(
              campaign.languageCode ||
              ""
            ),
          languageName:
            String(
              campaign.languageName ||
              LIVEBRIDGE_MARKETING_LANGUAGES[
                campaign.languageCode
              ] ||
              "Unknown"
            ),
          visualStyle:
            String(
              campaign.visualStyle ||
              "unknown"
            ),
          audienceFocus:
            String(
              campaign.audienceFocus ||
              "unknown"
            ),
          imageryTone:
            String(
              campaign.imageryTone ||
              "unknown"
            ),
          includeTearOff:
            campaign.includeTearOff !== false,
          includeQr:
            campaign.includeQr !== false,
          creditCharged:
            campaign.creditCharged === true
        };
      })
      .filter(item =>
        item.creditCharged === true
      );

  function periodStats(
    startTimestamp
  ) {
    const generated =
      campaigns.filter(item =>
        item.createdAt >= startTimestamp
      ).length;

    const creditsReturned =
      refunds.filter(item =>
        Number(
          item.requested_at ||
          0
        ) >= startTimestamp
      ).length;

    return {
      generated,
      creditsReturned,
      netCredits:
        generated -
        creditsReturned
    };
  }

  const periods = {
    last24Hours:
      periodStats(
        now -
        24 * 60 * 60 * 1000
      ),
    last7Days:
      periodStats(
        now -
        7 * 24 * 60 * 60 * 1000
      ),
    last30Days:
      periodStats(
        now -
        30 * 24 * 60 * 60 * 1000
      ),
    last365Days:
      periodStats(
        now -
        365 * 24 * 60 * 60 * 1000
      ),
    lifetime:
      periodStats(0)
  };

  function breakdownBy(
    key,
    labelKey = key
  ) {
    const map = new Map();

    for (const item of campaigns) {
      const value =
        String(
          item[key] ||
          "unknown"
        );

      if (!map.has(value)) {
        map.set(
          value,
          {
            key:
              value,
            label:
              String(
                item[labelKey] ||
                value
              ),
            generated:
              0,
            creditsReturned:
              0
          }
        );
      }

      const row =
        map.get(value);

      row.generated += 1;

      if (
        refundByCampaign.has(
          item.id
        )
      ) {
        row.creditsReturned += 1;
      }
    }

    return Array.from(
      map.values()
    )
    .map(item => ({
      ...item,
      netCredits:
        item.generated -
        item.creditsReturned
    }))
    .sort(
      (a, b) =>
        b.generated -
        a.generated ||
        String(a.label)
          .localeCompare(
            String(b.label)
          )
    );
  }

  const combinationMap =
    new Map();

  for (const item of campaigns) {
    const comboKey = [
      item.languageCode ||
        item.languageName,
      item.visualStyle,
      item.audienceFocus,
      item.imageryTone
    ].join("|");

    if (
      !combinationMap.has(
        comboKey
      )
    ) {
      combinationMap.set(
        comboKey,
        {
          key:
            comboKey,
          languageName:
            item.languageName,
          visualStyle:
            item.visualStyle,
          audienceFocus:
            item.audienceFocus,
          imageryTone:
            item.imageryTone,
          generated:
            0,
          creditsReturned:
            0
        }
      );
    }

    const combo =
      combinationMap.get(
        comboKey
      );

    combo.generated += 1;

    if (
      refundByCampaign.has(
        item.id
      )
    ) {
      combo.creditsReturned += 1;
    }
  }

  const combinations =
    Array.from(
      combinationMap.values()
    )
    .map(item => ({
      ...item,
      netCredits:
        item.generated -
        item.creditsReturned
    }))
    .sort(
      (a, b) =>
        b.generated -
        a.generated
    )
    .slice(
      0,
      25
    );

  const campaignById =
    new Map(
      campaigns.map(item => [
        item.id,
        item
      ])
    );

  const recentActivity = [];

  for (
    const campaign of
      campaigns.slice(0, 50)
  ) {
    recentActivity.push({
      type:
        "generation",
      at:
        campaign.createdAt,
      campaignId:
        campaign.id,
      campaignName:
        campaign.campaignName,
      languageName:
        campaign.languageName,
      visualStyle:
        campaign.visualStyle,
      audienceFocus:
        campaign.audienceFocus,
      imageryTone:
        campaign.imageryTone,
      creditDelta:
        -1,
      reason:
        ""
    });
  }

  for (
    const refund of
      refunds.slice(0, 50)
  ) {
    const campaign =
      campaignById.get(
        String(
          refund.campaign_id ||
          ""
        )
      ) || {};

    recentActivity.push({
      type:
        "refund",
      at:
        Number(
          refund.requested_at ||
          0
        ),
      campaignId:
        String(
          refund.campaign_id ||
          ""
        ),
      campaignName:
        String(
          campaign.campaignName ||
          ""
        ),
      languageName:
        String(
          campaign.languageName ||
          ""
        ),
      visualStyle:
        String(
          campaign.visualStyle ||
          ""
        ),
      audienceFocus:
        String(
          campaign.audienceFocus ||
          ""
        ),
      imageryTone:
        String(
          campaign.imageryTone ||
          ""
        ),
      creditDelta:
        1,
      reason:
        String(
          refund.reason ||
          ""
        )
    });
  }

  recentActivity.sort(
    (a, b) =>
      Number(b.at || 0) -
      Number(a.at || 0)
  );

  return {
    balance:
      Math.max(
        0,
        Number(
          creditAccount?.balance ||
          0
        )
      ),
    lifetimePurchased:
      Math.max(
        0,
        Number(
          creditAccount
            ?.lifetime_purchased ||
          0
        )
      ),
    lifetimeNetUsed:
      Math.max(
        0,
        Number(
          creditAccount
            ?.lifetime_used ||
          0
        )
      ),
    periods,
    languages:
      breakdownBy(
        "languageCode",
        "languageName"
      ),
    visualStyles:
      breakdownBy(
        "visualStyle"
      ),
    audienceFocus:
      breakdownBy(
        "audienceFocus"
      ),
    imageryTones:
      breakdownBy(
        "imageryTone"
      ),
    combinations,
    recentActivity:
      recentActivity.slice(
        0,
        30
      )
  };
}


/*
=======================================================
ADMIN - SAVE ORGANIZATION DISPLAY ORDER
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/admin/organization-order"
) {

  try {

    await ensureAdminOrganizationOrderSchema(
      env
    );

    await verifyAdminRequest(
      request,
      env
    );

    const body =
      await request.json();

    const organizationIds =
      Array.isArray(
        body.organizationIds
      )
        ? body.organizationIds
            .map(
              value =>
                Number(value)
            )
            .filter(
              value =>
                Number.isInteger(value) &&
                value > 0
            )
        : [];

    const uniqueIds =
      Array.from(
        new Set(
          organizationIds
        )
      );

    const countRow =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT COUNT(*) AS count
        FROM organizations
      `)
      .first();

    const organizationCount =
      Number(
        countRow?.count || 0
      );

    if (
      uniqueIds.length !==
      organizationIds.length ||
      uniqueIds.length !==
      organizationCount
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization list changed while reordering. Refresh the Admin page and try again."
        },
        409
      );
    }

    const now =
      Date.now();

    const statements = [
      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_admin_order
      `)
    ];

    uniqueIds.forEach(
      (organizationId,index) => {
        statements.push(
          env.TRANSLATIONS_DB.prepare(`
            INSERT INTO organization_admin_order (
              organization_id,
              sort_order,
              updated_at
            )
            VALUES (?, ?, ?)
          `)
          .bind(
            organizationId,
            index,
            now
          )
        );
      }
    );

    await env.TRANSLATIONS_DB.batch(
      statements
    );

    return jsonResponse({
      success: true,
      organizationIds:
        uniqueIds
    });

  } catch (error) {

    console.error(
      "Admin organization reorder failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to save organization order."
      },
      403
    );
  }
}


/*
=======================================================
ADMIN - API COST RANGE
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/admin/organization-api-cost"
) {

  try {

    await ensureApiCostSchema(
      env
    );

    await verifyAdminRequest(
      request,
      env
    );

    const organizationId =
      Number(
        url.searchParams.get(
          "organizationId"
        ) || 0
      );

    let start =
      Number(
        url.searchParams.get(
          "start"
        ) || 0
      );

    let end =
      Number(
        url.searchParams.get(
          "end"
        ) || 0
      );

    if (
      !Number.isInteger(
        organizationId
      ) ||
      organizationId <= 0
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start <= 0 ||
      end <= start
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid start and end time are required."
        },
        400
      );
    }

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          organization_name
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(
        organizationId
      )
      .first();

    if (!organization) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization not found."
        },
        404
      );
    }

    const rows =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          provider,
          category,
          model,

          COALESCE(
            SUM(input_tokens),
            0
          ) AS input_tokens,

          COALESCE(
            SUM(cached_input_tokens),
            0
          ) AS cached_input_tokens,

          COALESCE(
            SUM(output_tokens),
            0
          ) AS output_tokens,

          COALESCE(
            SUM(requests),
            0
          ) AS requests,

          COALESCE(
            SUM(characters),
            0
          ) AS characters,

          COALESCE(
            SUM(generations),
            0
          ) AS generations,

          COALESCE(
            SUM(cost_usd),
            0
          ) AS cost_usd,

          COUNT(*) AS event_count

        FROM api_cost_events

        WHERE
          organization_id = ?
          AND created_at >= ?
          AND created_at < ?

        GROUP BY
          provider,
          category,
          model

        ORDER BY
          provider ASC,
          category ASC,
          model ASC
      `)
      .bind(
        organizationId,
        Math.floor(start),
        Math.floor(end)
      )
      .all();

    let openAiInputTokens = 0;
    let openAiCachedInputTokens = 0;
    let openAiOutputTokens = 0;
    let openAiRequests = 0;
    let openAiCostUsd = 0;
    let azureTtsCharacters = 0;
    let azureTtsGenerations = 0;
    let azureTtsCostUsd = 0;

    const openAiCostBreakdown = {};

    for (
      const row of
      rows.results || []
    ) {

      const provider =
        String(
          row.provider || ""
        );

      const category =
        String(
          row.category || "other"
        );

      const rowCost =
        Number(
          row.cost_usd || 0
        );

      if (
        provider === "openai"
      ) {

        openAiInputTokens +=
          Number(
            row.input_tokens || 0
          );

        openAiCachedInputTokens +=
          Number(
            row.cached_input_tokens || 0
          );

        openAiOutputTokens +=
          Number(
            row.output_tokens || 0
          );

        openAiRequests +=
          Number(
            row.requests || 0
          );

        openAiCostUsd +=
          rowCost;

        openAiCostBreakdown[
          category
        ] =
          Math.round(
            (
              Number(
                openAiCostBreakdown[
                  category
                ] || 0
              ) +
              rowCost
            ) *
            1000000
          ) /
          1000000;

      } else if (
        provider === "azure"
      ) {

        azureTtsCharacters +=
          Number(
            row.characters || 0
          );

        azureTtsGenerations +=
          Number(
            row.generations || 0
          );

        azureTtsCostUsd +=
          rowCost;
      }
    }

    const totalApiCostUsd =
      openAiCostUsd +
      azureTtsCostUsd;

    return jsonResponse({
      success: true,

      organizationId,

      organizationName:
        organization.organization_name ||
        "",

      range: {
        start:
          Math.floor(start),
        end:
          Math.floor(end)
      },

      stats: {
        azureTtsCharacters,
        azureTtsGenerations,

        azureTtsCostUsd:
          Math.round(
            azureTtsCostUsd *
            1000000
          ) /
          1000000,

        openAiInputTokens,
        openAiCachedInputTokens,
        openAiOutputTokens,
        openAiRequests,

        openAiCostUsd:
          Math.round(
            openAiCostUsd *
            1000000
          ) /
          1000000,

        openAiCostBreakdown,

        apiCostUsd:
          Math.round(
            totalApiCostUsd *
            1000000
          ) /
          1000000,

        apiCostCurrency:
          LIVEBRIDGE_API_COST_PRICING
            .currency
      }
    });

  } catch (error) {

    console.error(
      "Admin API cost range failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load API cost range."
      },
      403
    );
  }
}


/*
=======================================================
ADMIN - ORGANIZATION BROADCAST HISTORY RANGE
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/admin/organization-broadcast-history"
) {

  try {

    await ensureAnalyticsTables(
      env
    );

    await verifyAdminRequest(
      request,
      env
    );

    const organizationId =
      Number(
        url.searchParams.get(
          "organizationId"
        ) || 0
      );

    if (
      !Number.isInteger(
        organizationId
      ) ||
      organizationId <= 0
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          room_name
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(
        organizationId
      )
      .first();

    if (!organization) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization not found."
        },
        404
      );
    }

    const rawStart =
      url.searchParams.get(
        "start"
      );

    const rawEnd =
      url.searchParams.get(
        "end"
      );

    const hasStart =
      rawStart !== null &&
      String(rawStart).trim() !== "";

    const hasEnd =
      rawEnd !== null &&
      String(rawEnd).trim() !== "";

    const start =
      hasStart
        ? Number(rawStart)
        : null;

    const end =
      hasEnd
        ? Number(rawEnd)
        : null;

    if (
      (
        hasStart &&
        (
          !Number.isFinite(start) ||
          start < 0
        )
      ) ||
      (
        hasEnd &&
        (
          !Number.isFinite(end) ||
          end <= 0
        )
      ) ||
      (
        hasStart &&
        hasEnd &&
        end <= start
      )
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid broadcast history time range is required."
        },
        400
      );
    }

    const requestedLimit =
      Math.floor(
        Number(
          url.searchParams.get(
            "limit"
          ) || 250
        )
      );

    const limit =
      Math.min(
        500,
        Math.max(
          1,
          Number.isFinite(
            requestedLimit
          )
            ? requestedLimit
            : 250
        )
      );

    const room =
      normalizeRoom(
        organization.room_name
      );

    let sql = `
      SELECT
        id,
        room,
        started_at,
        ended_at,
        peak_listeners
      FROM broadcast_sessions
      WHERE room = ?
    `;

    const bindings = [
      room
    ];

    if (hasStart) {
      sql += `
        AND started_at >= ?
      `;

      bindings.push(
        Math.floor(start)
      );
    }

    if (hasEnd) {
      sql += `
        AND started_at < ?
      `;

      bindings.push(
        Math.floor(end)
      );
    }

    sql += `
      ORDER BY started_at DESC
      LIMIT ?
    `;

    bindings.push(
      limit + 1
    );

    const historyResult =
      await env.TRANSLATIONS_DB.prepare(
        sql
      )
      .bind(
        ...bindings
      )
      .all();

    const rows =
      historyResult.results ||
      [];

    const truncated =
      rows.length > limit;

    const broadcasts = [];

    for (
      const broadcast of
      rows.slice(
        0,
        limit
      )
    ) {

      const summary =
        await buildBroadcastSummary(
          env,
          broadcast.id
        );

      if (summary) {
        broadcasts.push(
          summary
        );
      }
    }

    return jsonResponse({
      success: true,

      organizationId,

      range: {
        start:
          hasStart
            ? Math.floor(start)
            : null,

        end:
          hasEnd
            ? Math.floor(end)
            : null
      },

      limit,
      truncated,
      broadcasts
    });

  } catch (error) {

    console.error(
      "Admin organization broadcast history range failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load broadcast history."
      },
      403
    );
  }
}


/*
=======================================================
ADMIN - GET ONE ORGANIZATION
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/admin/organization"
) {

  try {

    await ensureBroadcastSafetySchema(
      env
    );

    await ensureLiveNotesSchema(
      env
    );

    await ensureReturnVisitorSchema(
      env
    );

    await ensureRoomAliasSchema(
      env
    );

    await verifyAdminRequest(
      request,
      env
    );

    const organizationId =
      Number(
        url.searchParams.get("id")
      );

    if (!organizationId) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }


    const row =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(
        organizationId
      )
      .first();


    if (!row) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization not found."
        },
        404
      );
    }


    const historyResult =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          room,
          started_at,
          ended_at,
          peak_listeners
        FROM broadcast_sessions
        WHERE room = ?
        ORDER BY started_at DESC
        LIMIT 25
      `)
      .bind(
        row.room_name
      )
      .all();


    const broadcasts = [];

    for (
      const broadcast of
        historyResult.results || []
    ) {

      const summary =
        await buildBroadcastSummary(
          env,
          broadcast.id
        );

      if (summary) {
        broadcasts.push(
          summary
        );
      }
    }


    const returnMessagesResult =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          visit_number,
          message
        FROM organization_return_messages
        WHERE organization_id = ?
        ORDER BY visit_number ASC
      `)
      .bind(organizationId)
      .all();

    const visitorStatsRow =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          COUNT(*) AS unique_visitors,
          COALESCE(
            SUM(
              CASE
                WHEN visit_days > 1 THEN 1
                ELSE 0
              END
            ),
            0
          ) AS returning_visitors,
          COALESCE(SUM(visit_days), 0) AS total_visit_days
        FROM organization_visitors
        WHERE organization_id = ?
      `)
      .bind(organizationId)
      .first();

    return jsonResponse({

      success: true,

      account: {
        ...buildOrganizationAccount(
          row
        ),
        marketingCredits:
          await marketingCreditBalance(
            env,
            organizationId
          )
      },

      marketingAnalytics:
        await buildMarketingAdminAnalytics(
          env,
          organizationId
        ),

      broadcasts,

      returnMessages:
        (returnMessagesResult.results || [])
          .map(item => ({
            visitNumber:
              Number(item.visit_number || 0),
            message:
              String(item.message || "")
          })),

      visitorStats: {
        uniqueVisitors:
          Number(
            visitorStatsRow?.unique_visitors ||
            0
          ),
        returningVisitors:
          Number(
            visitorStatsRow?.returning_visitors ||
            0
          ),
        totalVisitDays:
          Number(
            visitorStatsRow?.total_visit_days ||
            0
          )
      }
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Admin access denied."
      },
      403
    );
  }
}


/*
=======================================================
ADMIN - SAVE RETURN VISITOR MESSAGE
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/admin/return-message-save"
) {
  try {
    await ensureReturnVisitorSchema(env);

    await verifyAdminRequest(
      request,
      env
    );

    const body =
      await request.json();

    const organizationId =
      Number(body.organizationId || 0);

    const visitNumber =
      Math.floor(
        Number(body.visitNumber || 0)
      );

    const message =
      String(body.message || "")
        .trim();

    if (!organizationId) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }

    if (
      visitNumber < 2 ||
      visitNumber > 1000
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "Visit number must be between 2 and 1000."
        },
        400
      );
    }

    if (message.length > 800) {
      return jsonResponse(
        {
          success: false,
          error:
            "Return message must be 800 characters or fewer."
        },
        400
      );
    }

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT id
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(organizationId)
      .first();

    if (!organization) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization not found."
        },
        404
      );
    }

    if (!message) {
      await env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_return_messages
        WHERE organization_id = ?
          AND visit_number = ?
      `)
      .bind(
        organizationId,
        visitNumber
      )
      .run();

      return jsonResponse({
        success: true,
        removed: true,
        visitNumber
      });
    }

    const now = Date.now();

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO organization_return_messages (
        organization_id,
        visit_number,
        message,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, visit_number)
      DO UPDATE SET
        message = excluded.message,
        updated_at = excluded.updated_at
    `)
    .bind(
      organizationId,
      visitNumber,
      message,
      now,
      now
    )
    .run();

    return jsonResponse({
      success: true,
      removed: false,
      returnMessage: {
        visitNumber,
        message
      }
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to save return visitor message."
      },
      403
    );
  }
}


/*
=======================================================
ADMIN - RESET RETURN VISITOR HISTORY
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/admin/visitor-history-reset"
) {
  try {
    await ensureReturnVisitorSchema(env);

    await verifyAdminRequest(
      request,
      env
    );

    const body =
      await request.json();

    const organizationId =
      Number(body.organizationId || 0);

    if (!organizationId) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          organization_name
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(organizationId)
      .first();

    if (!organization) {
      return jsonResponse(
        {
          success: false,
          error:
            "Organization not found."
        },
        404
      );
    }

    await env.TRANSLATIONS_DB.batch([
      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_visitor_days
        WHERE organization_id = ?
      `).bind(organizationId),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_visitors
        WHERE organization_id = ?
      `).bind(organizationId)
    ]);

    return jsonResponse({
      success: true,
      organizationId,
      organizationName:
        String(
          organization.organization_name ||
          ""
        ),
      visitorStats: {
        uniqueVisitors: 0,
        returningVisitors: 0,
        totalVisitDays: 0
      }
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to reset visitor history."
      },
      403
    );
  }
}



/*
=======================================================
ADMIN - UPDATE ORGANIZATION
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/admin/organization-update"
) {

  try {

    await ensureBroadcastSafetySchema(
      env
    );

    await ensureLiveNotesSchema(
      env
    );

    await ensureRoomAliasSchema(
      env
    );

    await verifyAdminRequest(
      request,
      env
    );

    const body =
      await request.json();

    const organizationId =
      Number(
        body.organizationId
      );

    if (!organizationId) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }


    const existing =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(
        organizationId
      )
      .first();


    if (!existing) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization not found."
        },
        404
      );
    }


    let planCode =
      existing.plan_code;

    let planName =
      existing.plan_name;

    let includedMinutes =
      Number(
        existing.included_minutes
      );

    let viewerLimit =
      Number(
        existing.viewer_limit
      );


    if (body.planCode) {

      const plan =
        getPlanDefinition(
          body.planCode
        );

      planCode =
        plan.code;

      planName =
        plan.name;

      includedMinutes =
        plan.minutes;

      viewerLimit =
        plan.viewers;
    }


    if (
      body.includedMinutes !==
      undefined
    ) {

      includedMinutes =
        Math.max(
          0,
          Number(
            body.includedMinutes
          )
        );
    }


    if (
      body.viewerLimit !==
      undefined
    ) {

      viewerLimit =
        Math.max(
          1,
          Number(
            body.viewerLimit
          )
        );
    }


    const bonusMinutes =
      body.bonusMinutes !==
      undefined
        ? Math.max(
            0,
            Number(
              body.bonusMinutes
            )
          )
        : Number(
            existing.bonus_minutes ||
            0
          );


    let viewerOverride =
      existing.viewer_override;


    if (
      body.viewerOverride ===
      null
    ) {

      viewerOverride = null;

    } else if (
      body.viewerOverride !==
      undefined
    ) {

      viewerOverride =
        Math.max(
          1,
          Number(
            body.viewerOverride
          )
        );
    }


    const allowedStatuses = [
      "active",
      "suspended",
      "disabled"
    ];


    const requestedStatus =
      String(
        body.accountStatus ||
        existing.account_status
      ).toLowerCase();


    const accountStatus =
      allowedStatuses.includes(
        requestedStatus
      )
        ? requestedStatus
        : existing.account_status;


    const adminNotes =
      body.adminNotes !==
      undefined
        ? String(
            body.adminNotes || ""
          )
        : String(
            existing.admin_notes ||
            ""
          );


    const scriptureEnabled =
      body.scriptureEnabled !==
      undefined
        ? (
            body.scriptureEnabled
              ? 1
              : 0
          )
        : Number(
            existing.scripture_enabled ||
            0
          );


    const scripturePlanOverride =
      body.scripturePlanOverride !==
      undefined
        ? (
            body.scripturePlanOverride
              ? 1
              : 0
          )
        : Number(
            existing.scripture_plan_override ||
            0
          );


    const featureOverrides =
      parseFeatureOverrides(
        body.featureOverrides !== undefined
          ? body.featureOverrides
          : existing.feature_overrides_json
      );

    featureOverrides.scriptureDetection =
      scripturePlanOverride === 1;

    const featureOverridesJson =
      JSON.stringify(
        featureOverrides
      );


    let speechRate =
      Number(
        existing.speech_rate ?? 1.15
      );

    if (
      body.speechRate !==
      undefined
    ) {

      const requestedSpeechRate =
        Number(
          body.speechRate
        );

      if (!Number.isFinite(requestedSpeechRate)) {

        return jsonResponse(
          {
            success: false,
            error:
              "Speech rate must be a number."
          },
          400
        );
      }

      speechRate =
        Math.round(
          Math.min(
            1.50,
            Math.max(
              0.75,
              requestedSpeechRate
            )
          ) * 100
        ) / 100;
    }


    let roomName =
      String(
        existing.room_name || ""
      ).trim().toUpperCase();


    if (
      body.roomName !==
      undefined
    ) {

      const requestedRoomName =
        normalizeRoom(
          body.roomName
        );

      if (!requestedRoomName) {

        return jsonResponse(
          {
            success: false,
            error:
              "Room name cannot be blank."
          },
          400
        );
      }


      const roomOwner =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT id
          FROM organizations
          WHERE
            (
              UPPER(room_name) = ?
              OR UPPER(
                COALESCE(
                  room_alias,
                  ''
                )
              ) = ?
            )
            AND id != ?
          LIMIT 1
        `)
        .bind(
          requestedRoomName,
          requestedRoomName,
          organizationId
        )
        .first();


      if (roomOwner) {

        return jsonResponse(
          {
            success: false,
            error:
              "That LiveBridge room name is already assigned to another organization."
          },
          409
        );
      }


      roomName =
        requestedRoomName;
    }


    let roomAlias =
      normalizeRoom(
        existing.room_alias || ""
      );

    if (
      body.roomAlias !==
      undefined
    ) {

      roomAlias =
        normalizeRoom(
          body.roomAlias
        );

      if (roomAlias) {

        const aliasValidationError =
          roomNameValidationError(
            roomAlias
          );

        if (aliasValidationError) {

          return jsonResponse(
            {
              success: false,
              error:
                aliasValidationError
            },
            400
          );
        }

        if (roomAlias === roomName) {

          return jsonResponse(
            {
              success: false,
              error:
                "Room alias must be different from the default room name."
            },
            400
          );
        }

        const aliasOwner =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT id
            FROM organizations
            WHERE
              (
                UPPER(room_name) = ?
                OR UPPER(
                  COALESCE(
                    room_alias,
                    ''
                  )
                ) = ?
              )
              AND id != ?
            LIMIT 1
          `)
          .bind(
            roomAlias,
            roomAlias,
            organizationId
          )
          .first();

        if (aliasOwner) {

          return jsonResponse(
            {
              success: false,
              error:
                "That LiveBridge alias is already assigned to another organization."
            },
            409
          );
        }
      }
    }

    if (
      roomAlias &&
      roomAlias === roomName
    ) {
      roomAlias = "";
    }


    const now =
      Date.now();


    const newOrganizationName =
      String(
        body.organizationName ||
        existing.organization_name ||
        ""
      ).trim();

    const newAccountHolder =
      String(
        body.accountHolder ||
        existing.account_holder ||
        ""
      ).trim();

    const newEmail =
      String(
        body.email ||
        existing.email ||
        ""
      ).trim();

    const newAccountEmail =
      String(
        body.accountEmail ||
        existing.account_email ||
        existing.email ||
        ""
      ).trim();

    const newPhone =
      String(
        body.phone ||
        existing.phone ||
        ""
      ).trim();


    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations

      SET
        organization_name = ?,
        account_holder = ?,
        email = ?,
        account_email = ?,
        phone = ?,
        room_name = ?,
        room_alias = ?,

        plan_code = ?,
        plan_name = ?,

        included_minutes = ?,
        bonus_minutes = ?,

        viewer_limit = ?,
        viewer_override = ?,

        account_status = ?,
        admin_notes = ?,
        scripture_enabled = ?,
        scripture_plan_override = ?,
        feature_overrides_json = ?,
        speech_rate = ?,

        updated_at = ?

      WHERE id = ?
    `)
    .bind(
      newOrganizationName,
      newAccountHolder,
      newEmail,
      newAccountEmail,
      newPhone,
      roomName,
      roomAlias || null,

      planCode,
      planName,

      includedMinutes,
      bonusMinutes,

      viewerLimit,
      viewerOverride,

      accountStatus,
      adminNotes,
      scriptureEnabled,
      scripturePlanOverride,
      featureOverridesJson,
      speechRate,

      now,
      organizationId
    )
    .run();


    if (
      body.marketingCredits !== undefined
    ) {
      await setMarketingCreditBalance(
        env,
        organizationId,
        body.marketingCredits,
        "admin_override",
        "Admin set Marketing Credit balance"
      );
    }

    const updated =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(
        organizationId
      )
      .first();

    const updatedMarketingCredits =
      await marketingCreditBalance(
        env,
        organizationId
      );


    return jsonResponse({

      success: true,

      account: {
        ...buildOrganizationAccount(
          updated
        ),
        marketingCredits:
          updatedMarketingCredits
      }
    });

  } catch (error) {

    console.error(
      "Admin update failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Admin update failed."
      },
      403
    );
  }
}

/*
=======================================================
ADMIN - LIST ADMIN CANDIDATES
=======================================================
*/

if (
  request.method === "GET" &&
  url.pathname === "/admin/admin-candidates"
) {

  try {

    await verifyAdminRequest(
      request,
      env
    );

    const result =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          o.id AS organization_id,
          o.clerk_user_id,
          o.organization_name,
          o.account_holder,
          o.email,
          o.room_name,
          o.account_status,

          a.id AS admin_id,
          a.role AS admin_role,
          a.active AS admin_active

        FROM organizations o

        LEFT JOIN admin_users a
          ON a.clerk_user_id =
             o.clerk_user_id

        ORDER BY
          CASE
            WHEN a.active = 1
            THEN 0
            ELSE 1
          END,
          o.organization_name ASC
      `)
      .all();

    const candidates =
      (result.results || [])
        .map(row => ({
          organizationId:
            Number(
              row.organization_id
            ),

          clerkUserId:
            row.clerk_user_id,

          organizationName:
            row.organization_name,

          accountHolder:
            row.account_holder || "",

          email:
            row.email || "",

          roomName:
            row.room_name || "",

          accountStatus:
            row.account_status || "active",

          isAdmin:
            Number(
              row.admin_active || 0
            ) === 1,

          adminRole:
            row.admin_role || ""
        }));


    return jsonResponse({
      success: true,
      candidates
    });

  } catch (error) {

    console.error(
      "Admin candidate list failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load administrator candidates."
      },
      403
    );
  }
}


/*
=======================================================
ADMIN - SET ADMIN ACCESS
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/admin/admin-access"
) {

  try {

    const auth =
      await verifyAdminRequest(
        request,
        env
      );

    const body =
      await request.json();

    const targetClerkUserId =
      String(
        body.clerkUserId || ""
      ).trim();

    const enabled =
      body.enabled === true;


    if (!targetClerkUserId) {

      return jsonResponse(
        {
          success: false,
          error:
            "Clerk user ID is required."
        },
        400
      );
    }


    if (
      !enabled &&
      targetClerkUserId ===
        auth.clerkUserId
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "You cannot remove your own administrator access."
        },
        400
      );
    }


    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          clerk_user_id,
          organization_name,
          account_holder,
          email
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        targetClerkUserId
      )
      .first();


    if (!organization) {

      return jsonResponse(
        {
          success: false,
          error:
            "That LiveBridge customer account was not found."
        },
        404
      );
    }


    const now =
      Date.now();


    if (enabled) {

      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO admin_users (
          clerk_user_id,
          email,
          display_name,
          role,
          active,
          created_at
        )

        VALUES (
          ?, ?, ?, 'admin', 1, ?
        )

        ON CONFLICT(clerk_user_id)
        DO UPDATE SET
          email = excluded.email,
          display_name = excluded.display_name,
          role = 'admin',
          active = 1
      `)
      .bind(
        targetClerkUserId,

        organization.email || "",

        organization.account_holder ||
          organization.organization_name ||
          "LiveBridge Administrator",

        now
      )
      .run();

    } else {

      await env.TRANSLATIONS_DB.prepare(`
        UPDATE admin_users
        SET active = 0
        WHERE clerk_user_id = ?
      `)
      .bind(
        targetClerkUserId
      )
      .run();
    }


    return jsonResponse({
      success: true,
      clerkUserId:
        targetClerkUserId,
      enabled
    });

  } catch (error) {

    console.error(
      "Admin access update failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to update administrator access."
      },
      403
    );
  }
}



/*
=======================================================
ADMIN - DELETE LIVEBRIDGE ACCOUNT + CLERK USER
=======================================================
*/

if (
  request.method === "POST" &&
  url.pathname === "/admin/organization-delete"
) {

  try {

    const auth =
      await verifyAdminRequest(
        request,
        env
      );

    await ensureReturnVisitorSchema(
      env
    );

    const body =
      await request.json();

    const organizationId =
      Number(
        body.organizationId || 0
      );

    if (!organizationId) {

      return jsonResponse(
        {
          success: false,
          error:
            "Organization ID is required."
        },
        400
      );
    }


    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          id,
          clerk_user_id,
          organization_name,
          room_name
        FROM organizations
        WHERE id = ?
        LIMIT 1
      `)
      .bind(
        organizationId
      )
      .first();


    if (!organization) {

      return jsonResponse(
        {
          success: false,
          error:
            "LiveBridge account not found."
        },
        404
      );
    }


    if (
      organization.clerk_user_id ===
        auth.clerkUserId
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "You cannot delete your own LiveBridge admin account while signed into it."
        },
        400
      );
    }


    const room =
      String(
        organization.room_name || ""
      )
      .trim()
      .toUpperCase();


    const clerkUserId =
      String(
        organization.clerk_user_id || ""
      ).trim();


    if (!env.CLERK_SECRET_KEY) {

      return jsonResponse(
        {
          success: false,
          error:
            "CLERK_SECRET_KEY is not configured on the Worker."
        },
        500
      );
    }


    /*
    ---------------------------------------------------
    DELETE CLERK USER FIRST
    A 404 means the Clerk user is already gone, so
    continue cleaning the remaining LiveBridge data.
    ---------------------------------------------------
    */

    const clerkResponse =
      await fetch(
        "https://api.clerk.com/v1/users/" +
        encodeURIComponent(
          clerkUserId
        ),
        {
          method: "DELETE",

          headers: {
            "Authorization":
              "Bearer " +
              env.CLERK_SECRET_KEY,

            "Content-Type":
              "application/json"
          }
        }
      );


    if (
      !clerkResponse.ok &&
      clerkResponse.status !== 404
    ) {

      let clerkError =
        "Unable to delete Clerk login user.";

      try {

        const clerkData =
          await clerkResponse.json();

        clerkError =
          clerkData?.errors?.[0]?.long_message ||
          clerkData?.errors?.[0]?.message ||
          clerkError;

      } catch (error) {
        // Keep default message.
      }


      return jsonResponse(
        {
          success: false,
          error: clerkError,
          code:
            "CLERK_DELETE_FAILED"
        },
        502
      );
    }


    /*
    ---------------------------------------------------
    CLEAN LIVEBRIDGE / D1 DATA
    ---------------------------------------------------
    */

    await env.TRANSLATIONS_DB.batch([

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM listener_sessions
        WHERE room = ?
      `)
      .bind(room),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM broadcast_transcripts
        WHERE room = ?
      `)
      .bind(room),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM broadcast_sessions
        WHERE room = ?
      `)
      .bind(room),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM active_broadcasts
        WHERE room = ?
      `)
      .bind(room),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM admin_users
        WHERE clerk_user_id = ?
      `)
      .bind(clerkUserId),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM stripe_registrations
        WHERE organization_id = ?
           OR clerk_user_id = ?
      `)
      .bind(
        organizationId,
        clerkUserId
      ),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_return_messages
        WHERE organization_id = ?
      `)
      .bind(organizationId),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_stats_reset
        WHERE organization_id = ?
      `)
      .bind(organizationId),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_visitor_days
        WHERE organization_id = ?
      `)
      .bind(organizationId),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organization_visitors
        WHERE organization_id = ?
      `)
      .bind(organizationId),

      env.TRANSLATIONS_DB.prepare(`
        DELETE FROM organizations
        WHERE id = ?
      `)
      .bind(organizationId)

    ]);


    return jsonResponse({
      success: true,

      deletedOrganizationId:
        organizationId,

      deletedClerkUser:
        clerkResponse.ok ||
        clerkResponse.status === 404,

      clerkUserId,

      organizationName:
        organization.organization_name,

      room
    });


  } catch (error) {

    console.error(
      "Admin organization delete failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to delete LiveBridge account."
      },
      403
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/account-no-audio-timeout"
) {

  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    await ensureBroadcastSafetySchema(env);

    const body =
      await request.json();

    const requested =
      Number(
        body.noAudioTimeoutMinutes
      );

    const allowed =
      [0, 15, 30, 60, 90];

    if (
      !allowed.includes(
        requested
      )
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "Unsupported no-audio timeout."
        },
        400
      );
    }

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE organizations
      SET
        no_audio_timeout_minutes = ?,
        updated_at = ?
      WHERE clerk_user_id = ?
    `)
    .bind(
      requested,
      Date.now(),
      auth.clerkUserId
    )
    .run();

    return jsonResponse({
      success: true,
      noAudioTimeoutMinutes:
        requested
    });

  } catch (error) {

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to update no-audio safety timeout."
      },
      403
    );
  }
}



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



if (
  request.method === "GET" &&
  url.pathname === "/marketing/credits"
) {
  try {
    const organization =
      await marketingOrganization(
        request,
        env
      );

    const balance =
      await marketingCreditBalance(
        env,
        organization.id
      );

    return jsonResponse({
      success: true,
      balance,
      packages:
        Object.entries(
          LIVEBRIDGE_MARKETING_CREDIT_PACKAGES
        ).map(([key, value]) => ({
          key,
          credits: value.credits,
          priceCents: value.priceCents,
          currency: "CAD",
          label: value.label
        }))
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load Marketing Credits."
      },
      403
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/marketing/credits/checkout"
) {
  try {
    const organization =
      await marketingOrganization(
        request,
        env
      );

    const body =
      await request.json();

    const packageKey =
      String(
        body.packageKey || ""
      ).trim();

    const pack =
      LIVEBRIDGE_MARKETING_CREDIT_PACKAGES[
        packageKey
      ];

    if (!pack) {
      return jsonResponse(
        {
          success: false,
          error:
            "That Marketing Credit package is not available."
        },
        400
      );
    }

    await ensureMarketingCreditsSchema(
      env
    );

    const registration =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM stripe_registrations
        WHERE organization_id = ?
        ORDER BY id DESC
        LIMIT 1
      `)
      .bind(
        Number(organization.id)
      )
      .first();

    const customerId =
      String(
        registration?.stripe_customer_id || ""
      ).trim();

    const origin =
      String(
        request.headers.get("Origin") || ""
      ).trim();

    const allowedReturnOrigin =
      (
        /^https:\/\/(?:[^/]+\.)?livebridge\.ca$/i.test(origin) ||
        /^https:\/\/[^/]+\.northstarventures-ca\.workers\.dev$/i.test(origin)
      )
        ? origin
        : "https://livebridge.ca";

    const successUrl =
      allowedReturnOrigin +
      "/account/?panel=billing" +
      "&marketing_credits=success" +
      "&session_id={CHECKOUT_SESSION_ID}";

    const cancelUrl =
      allowedReturnOrigin +
      "/account/?panel=billing" +
      "&marketing_credits=cancelled";

    const checkout =
      await stripeApiRequest(
        env,
        "/v1/checkout/sessions",
        {
          mode: "payment",
          "line_items[0][price_data][currency]": "cad",
          "line_items[0][price_data][unit_amount]":
            pack.priceCents,
          "line_items[0][price_data][product_data][name]":
            pack.label,
          "line_items[0][price_data][product_data][description]":
            "One Marketing Credit generates one complete four-graphic LiveBridge outreach campaign.",
          "line_items[0][quantity]": 1,
          success_url: successUrl,
          cancel_url: cancelUrl,
          "metadata[livebridge_purchase_type]":
            "marketing_credits",
          "metadata[livebridge_organization_id]":
            String(organization.id),
          "metadata[livebridge_marketing_credits]":
            String(pack.credits),
          ...(customerId.startsWith("cus_")
            ? { customer: customerId }
            : {
                customer_email:
                  String(
                    organization.account_email ||
                    organization.email ||
                    ""
                  ).trim() || undefined
              })
        }
      );

    const sessionId =
      String(
        checkout?.id || ""
      ).trim();

    if (!sessionId) {
      throw new Error(
        "Stripe did not return a checkout session."
      );
    }

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO marketing_credit_purchases (
        checkout_session_id,
        organization_id,
        credits,
        amount_cents,
        currency,
        status,
        created_at,
        completed_at
      )
      VALUES (?, ?, ?, ?, 'CAD', 'pending', ?, NULL)
      ON CONFLICT(checkout_session_id) DO NOTHING
    `)
    .bind(
      sessionId,
      Number(organization.id),
      pack.credits,
      pack.priceCents,
      Date.now()
    )
    .run();

    return jsonResponse({
      success: true,
      checkoutUrl:
        String(checkout?.url || ""),
      sessionId
    });

  } catch (error) {
    console.error(
      "Marketing credit checkout failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to start Marketing Credit checkout."
      },
      Number(error.stripeStatus || 500)
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/marketing/credits/verify"
) {
  try {
    const organization =
      await marketingOrganization(
        request,
        env
      );

    const body =
      await request.json();

    const sessionId =
      String(
        body.sessionId || ""
      ).trim();

    if (
      !sessionId ||
      !sessionId.startsWith("cs_")
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid Stripe Checkout session is required."
        },
        400
      );
    }

    const purchase =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM marketing_credit_purchases
        WHERE checkout_session_id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .bind(
        sessionId,
        Number(organization.id)
      )
      .first();

    if (!purchase) {
      return jsonResponse(
        {
          success: false,
          error:
            "Marketing Credit purchase was not found."
        },
        404
      );
    }

    const session =
      await stripeApiGet(
        env,
        "/v1/checkout/sessions/" +
        encodeURIComponent(sessionId)
      );

    const result =
      await completeMarketingCreditPurchase(
        env,
        session
      );

    return jsonResponse({
      success: true,
      purchased:
        result?.paid === true ||
        result?.alreadyCompleted === true,
      credits:
        Number(
          result?.credits ||
          purchase.credits ||
          0
        ),
      balance:
        await marketingCreditBalance(
          env,
          organization.id
        )
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to verify Marketing Credit purchase."
      },
      Number(error.stripeStatus || 500)
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/marketing/profile"
) {
  try {
    const organization = await marketingOrganization(request, env);
    const row = await marketingProfileRow(env, organization.id);
    const campaignsResult = await env.TRANSLATIONS_DB.prepare(`
      SELECT *
      FROM marketing_campaigns
      WHERE organization_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(Number(organization.id)).all();

    await ensureMarketingCreditsSchema(env);

    const refundsResult =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          campaign_id,
          requested_at,
          refunded_at,
          reason
        FROM marketing_generation_refunds
        WHERE organization_id = ?
      `)
      .bind(
        Number(organization.id)
      )
      .all();

    const refundsByCampaign =
      new Map(
        (refundsResult.results || [])
          .map(item => [
            String(
              item.campaign_id || ""
            ),
            item
          ])
      );

    const refundWindowMs =
      24 * 60 * 60 * 1000;

    const now =
      Date.now();

    const campaigns =
      (campaignsResult.results || [])
        .map(row => {
          const campaign =
            marketingCampaign(row);

          const refund =
            refundsByCampaign.get(
              String(row.id || "")
            );

          const createdAt =
            Number(
              row.created_at ||
              campaign.createdAt ||
              0
            );

          const refundExpiresAt =
            createdAt +
            refundWindowMs;

          return {
            ...campaign,
            refundRequested:
              !!refund,
            refundReason:
              refund
                ? String(
                    refund.reason ||
                    ""
                  )
                : "",
            refundRequestedAt:
              Number(
                refund?.requested_at ||
                0
              ),
            refundExpiresAt,
            refundEligible:
              campaign.creditCharged === true &&
              !refund &&
              createdAt > 0 &&
              now <= refundExpiresAt
          };
        });

    return jsonResponse({
      success: true,
      profile: marketingProfile(organization, row),
      supportedLanguages: LIVEBRIDGE_MARKETING_LANGUAGES,
      campaigns,
      marketingCredits:
        await marketingCreditBalance(
          env,
          organization.id
        )
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Unable to load marketing profile."
    }, 401);
  }
}

if (
  request.method === "POST" &&
  url.pathname === "/marketing/profile"
) {
  try {
    const organization = await marketingOrganization(request, env);
    await ensureMarketingSchema(env);
    const body = await request.json();
    const existing = await marketingProfileRow(env, organization.id);
    const now = Date.now();

    const websiteUrl = String(body.websiteUrl ?? existing?.website_url ?? "").trim().slice(0, 600);
    const address = String(body.address ?? existing?.address ?? "").trim().slice(0, 500);
    const city = String(body.city ?? existing?.city ?? "").trim().slice(0, 120);
    const region = String(body.region ?? existing?.region ?? "").trim().slice(0, 120);
    const country = String(body.country ?? existing?.country ?? "Canada").trim().slice(0, 120) || "Canada";
    const logoUrl = String(body.logoUrl ?? existing?.logo_url ?? "").trim().slice(0, 800);
    const primaryColor = marketingColor(body.primaryColor ?? existing?.primary_color, "#2588ff");
    const secondaryColor = marketingColor(body.secondaryColor ?? existing?.secondary_color, "#6f43df");
    const serviceDetails = String(body.serviceDetails ?? existing?.service_details ?? "").trim().slice(0, 1200);

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO marketing_profiles (
        organization_id, website_url, address, city, region, country,
        logo_url, primary_color, secondary_color, service_details,
        last_analysis_json, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id)
      DO UPDATE SET
        website_url = excluded.website_url,
        address = excluded.address,
        city = excluded.city,
        region = excluded.region,
        country = excluded.country,
        logo_url = excluded.logo_url,
        primary_color = excluded.primary_color,
        secondary_color = excluded.secondary_color,
        service_details = excluded.service_details,
        updated_at = excluded.updated_at
    `).bind(
      Number(organization.id),
      websiteUrl,
      address,
      city,
      region,
      country,
      logoUrl,
      primaryColor,
      secondaryColor,
      serviceDetails,
      String(existing?.last_analysis_json || ""),
      now
    ).run();

    const updated = await marketingProfileRow(env, organization.id);

    return jsonResponse({
      success: true,
      profile: marketingProfile(organization, updated)
    });
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error.message || "Unable to save marketing profile."
    }, 400);
  }
}

if (
  request.method === "POST" &&
  url.pathname === "/marketing/analyze"
) {
  try {
    const organization = await marketingOrganization(request, env);

    const marketingGenerationReference =
      crypto.randomUUID();

    let marketingCreditConsumed = false;

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({
        success: false,
        error: "OpenAI is not configured."
      }, 503);
    }

    const profileRow = await marketingProfileRow(env, organization.id);
    const profile = marketingProfile(organization, profileRow);

    if (!profile.address && !profile.city && !profile.region) {
      return jsonResponse({
        success: false,
        error: "Add the organization city or address before analyzing local languages."
      }, 400);
    }

    const locationText = [
      profile.address,
      profile.city,
      profile.region,
      profile.country
    ].filter(Boolean).join(", ");

    const supportedList = Object.entries(LIVEBRIDGE_MARKETING_LANGUAGES)
      .map(([code, name]) => code + "=" + name)
      .join(", ");

    const prompt = `Research current publicly available demographic and language data for the LOCAL area served by this organization.

Organization: ${organization.organization_name || ""}
Location: ${locationText}
Website: ${profile.websiteUrl || "not supplied"}

Goal:
Identify the largest non-English language communities in this organization's local area so the organization can decide which language communities to invite to its multilingual service or event.

Use reliable public evidence. Prefer official census/statistics sources, municipal/regional demographic reports, and other primary or highly credible sources. If exact city/neighborhood data is unavailable, use the smallest credible geographic area available and explicitly say what geography was used.

Do not infer ethnicity, religion, immigration status, or any individual's traits. This is language-market research only.

LiveBridge currently supports these campaign/listener language codes:
${supportedList}

Return ONLY valid JSON:
{
  "areaSummary": "short factual summary of the geographic evidence used",
  "methodology": "one short sentence explaining the language metric used",
  "languages": [
    {
      "language": "Language name",
      "code": "best matching language code",
      "estimatedShare": "percentage/estimate or Not reported",
      "estimatedPeople": "population/count or Not reported",
      "why": "brief factual explanation",
      "sources": [
        {"title": "source title", "url": "https://..."}
      ]
    }
  ]
}

Requirements:
- Exclude English.
- Return up to 8 languages ordered by strongest evidence of local prevalence.
- Do not fabricate percentages, counts, URLs, or source titles.
- If datasets use different definitions, explain that briefly.
- Use one of the supported LiveBridge codes when the language truly matches; otherwise use a normal short language code.
- This ordering is descriptive demographic evidence only.`;

    const userLocation = {
      type: "approximate"
    };

    if (profile.city) userLocation.city = profile.city;
    if (profile.region) userLocation.region = profile.region;

    const countryRaw = String(profile.country || "").trim();
    if (/^[A-Za-z]{2}$/.test(countryRaw)) {
      userLocation.country = countryRaw.toUpperCase();
    } else if (/^canada$/i.test(countryRaw)) {
      userLocation.country = "CA";
    } else if (/^(usa|united states|united states of america)$/i.test(countryRaw)) {
      userLocation.country = "US";
    } else if (/^(uk|united kingdom)$/i.test(countryRaw)) {
      userLocation.country = "GB";
    }

    const aiResponse = await fetch(
      OPENAI_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          tools: [{
            type: "web_search",
            search_context_size: "medium",
            user_location: userLocation
          }],
          include: ["web_search_call.action.sources"],
          input: prompt
        })
      }
    );

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      throw new Error(aiData?.error?.message || "Language analysis failed.");
    }

    const analysis = normalizeMarketingAnalysis(
      parseAIJson(
        openAIResponseText(aiData)
      )
    );

    analysis.sources =
      openAISearchSources(aiData);

    if (!analysis.languages.length) {
      throw new Error("No usable local language data was found.");
    }

    const strategyLanguage = analysis.languages[0];

    try {
      const strategyPrompt = `Create a VERY SHORT practical outreach plan for a local organization using LiveBridge to welcome a ${strategyLanguage.language}-speaking community.

Organization: ${organization.organization_name || ""}
Location: ${locationText}
Target language: ${strategyLanguage.language}
Website: ${profile.websiteUrl || "not supplied"}

Use current web search to identify practical local places where a small printed invitation could reasonably be shared or posted. Prefer real currently operating community centres, libraries, settlement/newcomer services, multicultural organizations, language/cultural associations, grocery stores, restaurants, cafes, or other public-facing places that are genuinely relevant. Nearby regional options are okay if the immediate city has few choices.

Do NOT claim that a specific business's customers or staff speak this language unless reliable public evidence supports it. Phrase uncertain opportunities as places worth asking. Always remind the organization to ask permission before posting.

Return ONLY valid JSON:
{
  "language": "${strategyLanguage.language}",
  "tips": [
    "very short actionable tip",
    "very short actionable tip",
    "very short actionable tip"
  ],
  "placements": [
    {
      "name": "real local place or business",
      "type": "very short category",
      "why": "very short reason to consider asking here",
      "url": "https://verified-public-source..."
    }
  ]
}

Requirements:
- Exactly 3 tips, each preferably under 12 words.
- Up to 5 placement ideas.
- Do not fabricate businesses, addresses, or URLs.
- Keep this useful and extremely concise.`;

      const strategyResponse = await fetch(
        OPENAI_RESPONSES_URL,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "gpt-5.6-luna",
            tools: [{
              type: "web_search",
              search_context_size: "low",
              user_location: userLocation
            }],
            include: ["web_search_call.action.sources"],
            input: strategyPrompt
          })
        }
      );

      const strategyData = await strategyResponse.json();

      if (strategyResponse.ok) {
        const rawStrategy = parseAIJson(
          openAIResponseText(strategyData)
        );

        analysis.outreachStrategy = {
          language: String(
            rawStrategy?.language ||
            strategyLanguage.language ||
            ""
          ).trim().slice(0, 100),

          tips: (
            Array.isArray(rawStrategy?.tips)
              ? rawStrategy.tips
              : []
          )
            .slice(0, 3)
            .map(item =>
              String(item || "")
                .trim()
                .slice(0, 180)
            )
            .filter(Boolean),

          placements: (
            Array.isArray(rawStrategy?.placements)
              ? rawStrategy.placements
              : []
          )
            .slice(0, 5)
            .map(item => ({
              name: String(item?.name || "").trim().slice(0, 160),
              type: String(item?.type || "").trim().slice(0, 100),
              why: String(item?.why || "").trim().slice(0, 240),
              url: String(item?.url || "").trim().slice(0, 800)
            }))
            .filter(item =>
              item.name &&
              /^https?:\/\//i.test(item.url)
            ),

          sources:
            openAISearchSources(strategyData)
              .slice(0, 10)
        };
      }
    } catch (strategyError) {
      console.error(
        "Marketing outreach strategy failed:",
        strategyError
      );
    }

    const now = Date.now();

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO marketing_profiles (
        organization_id,
        last_analysis_json,
        updated_at
      )
      VALUES (?, ?, ?)
      ON CONFLICT(organization_id)
      DO UPDATE SET
        last_analysis_json = excluded.last_analysis_json,
        updated_at = excluded.updated_at
    `).bind(
      Number(organization.id),
      JSON.stringify(analysis),
      now
    ).run();

    return jsonResponse({
      success: true,
      analysis
    });
  } catch (error) {
    console.error("Marketing language analysis failed:", error);
    return jsonResponse({
      success: false,
      error: error.message || "Unable to analyze local languages."
    }, 500);
  }
}

if (
  request.method === "POST" &&
  url.pathname === "/marketing/generate"
) {
  let marketingGenerationOrganization = null;
  let marketingCreditConsumed = false;
  const marketingGenerationReference = crypto.randomUUID();

  try {
    const organization = await marketingOrganization(request, env);
    marketingGenerationOrganization = organization;

    if (!env.OPENAI_API_KEY) {
      return jsonResponse({
        success: false,
        error: "OpenAI is not configured."
      }, 503);
    }

    await ensureMarketingSchema(env);

    const body = await request.json();
    const languageCode = String(body.languageCode || "").trim().toLowerCase();

    const visualStyle = cleanMarketingChoice(
      body.visualStyle,
      ["people", "balanced", "clean"],
      "people"
    );

    const audienceFocus = cleanMarketingChoice(
      body.audienceFocus,
      ["general", "families", "adults", "youth", "seniors"],
      "general"
    );

    const imageryTone = cleanMarketingChoice(
      body.imageryTone,
      ["warm", "modern", "community", "church"],
      "warm"
    );

    const includeTearOff =
      body.includeTearOff !== false;

    const requestedTabs =
      Number(body.tearOffTabs || 8);

    const tearOffTabs =
      [6, 8, 10].includes(requestedTabs)
        ? requestedTabs
        : 8;

    const includeQr =
      body.includeQr !== false;

    const includePhone =
      body.includePhone === true;

    const phoneNumber =
      includePhone
        ? String(body.phoneNumber || "")
            .trim()
            .replace(/[\r\n\t]+/g, " ")
            .slice(0, 80)
        : "";

    if (!Object.prototype.hasOwnProperty.call(LIVEBRIDGE_MARKETING_LANGUAGES, languageCode)) {
      return jsonResponse({
        success: false,
        error: "That language is not currently enabled on the LiveBridge listener."
      }, 400);
    }

    const languageName = LIVEBRIDGE_MARKETING_LANGUAGES[languageCode];

    const profileRow = await marketingProfileRow(env, organization.id);
    const profile = marketingProfile(organization, profileRow);

    if (!profile.websiteUrl && !profile.address && !profile.city) {
      return jsonResponse({
        success: false,
        error: "Save the organization marketing details before generating a campaign."
      }, 400);
    }

    const marketingCreditsRemaining =
      await consumeMarketingCredit(
        env,
        organization.id,
        marketingGenerationReference
      );

    marketingCreditConsumed = true;

    const location = [profile.city, profile.region, profile.country]
      .filter(Boolean)
      .join(", ");

    const prompt = `Create a welcoming outreach campaign for this organization.

Organization: ${organization.organization_name || ""}
Target language: ${languageName} (${languageCode})
Location: ${location || "not supplied"}
Address: ${profile.address || "not supplied"}
Website: ${profile.websiteUrl || "not supplied"}
Service/event details: ${profile.serviceDetails || "not supplied"}
Visual style: ${visualStyle}
Audience focus: ${audienceFocus}
Imagery tone: ${imageryTone}

LiveBridge lets people attend the organization's live service/event and follow the message with live translated captions and translated audio in their selected language.

Tone:
Warm, welcoming, respectful, community-focused, simple and clear.
Do not describe the target-language community as outsiders.
Do not make claims about attendance, demographics, schedules, services, or the organization that were not supplied.

Return ONLY valid JSON:
{
  "campaignName": "short internal campaign name",
  "printTarget": {
    "headline": "headline in ${languageName}",
    "subheadline": "short subheadline in ${languageName}",
    "body": "2-3 short sentences in ${languageName}",
    "cta": "short call to action in ${languageName}"
  },
  "socialEnglish": {
    "headline": "English headline",
    "subheadline": "English subheadline",
    "body": "1-2 short English sentences",
    "cta": "short English call to action"
  },
  "socialTarget": {
    "headline": "headline in ${languageName}",
    "subheadline": "subheadline in ${languageName}",
    "body": "1-2 short sentences in ${languageName}",
    "cta": "short call to action in ${languageName}"
  },
  "tearOff": {
    "headline": "short welcoming headline in ${languageName}",
    "subheadline": "short invitation in ${languageName}",
    "body": "1-2 very short sentences in ${languageName}",
    "cta": "short call to action in ${languageName}",
    "tabCallout": "2-5 word phrase in ${languageName} meaning live translation available",
    "tabServiceLine": "very short service/event time line using ONLY the supplied service details; preserve all times exactly"
  }
}

Clearly communicate that people can listen/follow the live service in their own language using LiveBridge. Keep every field concise enough for a poster/social graphic. For tabServiceLine, never invent a day or time that was not supplied.`;

    const aiResponse = await fetch(
      OPENAI_RESPONSES_URL,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          input: prompt
        })
      }
    );

    const aiData = await aiResponse.json();

    if (!aiResponse.ok) {
      throw new Error(aiData?.error?.message || "Campaign generation failed.");
    }

    const generated = parseAIJson(
      openAIResponseText(aiData)
    );

    const cleanBlock = block => ({
      headline: String(block?.headline || "").trim().slice(0, 180),
      subheadline: String(block?.subheadline || "").trim().slice(0, 220),
      body: String(block?.body || "").trim().slice(0, 700),
      cta: String(block?.cta || "").trim().slice(0, 180)
    });

    const now = Date.now();
    const campaignId =
      marketingGenerationReference;

    const campaign = {
      campaignName: String(generated?.campaignName || (languageName + " Outreach")).trim().slice(0, 140),
      organizationName: String(organization.organization_name || ""),
      roomName: String(organization.room_name || "").trim().toUpperCase(),
      languageCode,
      languageName,
      websiteUrl: profile.websiteUrl,
      address: profile.address,
      location,
      logoUrl: profile.logoUrl,
      primaryColor: profile.primaryColor,
      secondaryColor: profile.secondaryColor,
      serviceDetails: profile.serviceDetails,
      visualStyle,
      audienceFocus,
      imageryTone,
      includeTearOff,
      tearOffTabs,
      includeQr,
      includePhone,
      phoneNumber,
      creditCharged: true,
      printTarget: cleanBlock(generated?.printTarget),
      socialEnglish: cleanBlock(generated?.socialEnglish),
      socialTarget: cleanBlock(generated?.socialTarget),
      tearOff: {
        ...cleanBlock(generated?.tearOff),
        tabCallout: String(generated?.tearOff?.tabCallout || "").trim().slice(0, 120),
        tabServiceLine: String(generated?.tearOff?.tabServiceLine || profile.serviceDetails || "").trim().slice(0, 180)
      },
      createdAt: now,
      updatedAt: now
    };

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO marketing_campaigns (
        id,
        organization_id,
        language_code,
        language_name,
        campaign_json,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      campaignId,
      Number(organization.id),
      languageCode,
      languageName,
      JSON.stringify(campaign),
      now,
      now
    ).run();

    return jsonResponse({
      success: true,
      campaign: {
        id: campaignId,
        ...campaign
      },
      marketingCreditsRemaining
    });
  } catch (error) {
    if (
      marketingCreditConsumed === true &&
      marketingGenerationOrganization?.id
    ) {
      try {
        await refundMarketingCredit(
          env,
          marketingGenerationOrganization.id,
          marketingGenerationReference
        );
      } catch (refundError) {
        console.error(
          "Marketing credit refund failed:",
          refundError
        );
      }
    }

    console.error("Marketing campaign generation failed:", error);

    const needsCredits =
      error?.code === "MARKETING_CREDITS_REQUIRED";

    return jsonResponse({
      success: false,
      code:
        needsCredits
          ? "MARKETING_CREDITS_REQUIRED"
          : undefined,
      error: error.message || "Unable to generate marketing campaign."
    }, needsCredits ? 402 : 500);
  }
}

if (
  request.method === "POST" &&
  url.pathname === "/marketing/refund-request"
) {
  try {
    const organization =
      await marketingOrganization(
        request,
        env
      );

    await ensureMarketingSchema(env);
    await ensureMarketingCreditsSchema(env);

    const body =
      await request.json();

    const campaignId =
      String(
        body.campaignId || ""
      ).trim();

    const reason =
      String(
        body.reason || ""
      )
      .trim()
      .replace(
        /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,
        ""
      )
      .slice(0, 1500);

    if (!campaignId) {
      return jsonResponse(
        {
          success: false,
          error:
            "Campaign ID is required."
        },
        400
      );
    }

    if (reason.length < 10) {
      return jsonResponse(
        {
          success: false,
          error:
            "Please tell us briefly what went wrong before requesting the credit back."
        },
        400
      );
    }

    const row =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM marketing_campaigns
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .bind(
        campaignId,
        Number(organization.id)
      )
      .first();

    if (!row) {
      return jsonResponse(
        {
          success: false,
          error:
            "Marketing campaign not found."
        },
        404
      );
    }

    const campaign =
      marketingCampaign(row);

    if (campaign.creditCharged !== true) {
      return jsonResponse(
        {
          success: false,
          code:
            "REFUND_NOT_ELIGIBLE",
          error:
            "This campaign was not generated using a Marketing Credit."
        },
        409
      );
    }

    const generationTransaction =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT id
        FROM marketing_credit_transactions
        WHERE organization_id = ?
          AND reference_id = ?
          AND transaction_type = 'generation'
        LIMIT 1
      `)
      .bind(
        Number(organization.id),
        campaignId
      )
      .first();

    if (!generationTransaction) {
      return jsonResponse(
        {
          success: false,
          code:
            "REFUND_NOT_ELIGIBLE",
          error:
            "No Marketing Credit charge was found for this generation."
        },
        409
      );
    }

    const existingRefund =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM marketing_generation_refunds
        WHERE campaign_id = ?
        LIMIT 1
      `)
      .bind(
        campaignId
      )
      .first();

    if (existingRefund) {
      return jsonResponse(
        {
          success: false,
          code:
            "ALREADY_REFUNDED",
          error:
            "A credit has already been returned for this generation."
        },
        409
      );
    }

    const createdAt =
      Number(
        row.created_at || 0
      );

    const now =
      Date.now();

    const refundExpiresAt =
      createdAt +
      (
        24 *
        60 *
        60 *
        1000
      );

    if (
      !createdAt ||
      now > refundExpiresAt
    ) {
      return jsonResponse(
        {
          success: false,
          code:
            "REFUND_WINDOW_EXPIRED",
          error:
            "The 24-hour credit-back window for this generation has expired."
        },
        410
      );
    }

    const refundId =
      crypto.randomUUID();

    try {
      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO marketing_generation_refunds (
          id,
          campaign_id,
          organization_id,
          reason,
          campaign_created_at,
          requested_at,
          refunded_at,
          credit_delta,
          balance_after,
          email_sent
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 0)
      `)
      .bind(
        refundId,
        campaignId,
        Number(organization.id),
        reason,
        createdAt,
        now,
        now
      )
      .run();

    } catch (insertError) {
      const message =
        String(
          insertError?.message ||
          ""
        )
        .toLowerCase();

      if (
        message.includes("unique") ||
        message.includes("constraint")
      ) {
        return jsonResponse(
          {
            success: false,
            code:
              "ALREADY_REFUNDED",
            error:
              "A credit has already been returned for this generation."
          },
          409
        );
      }

      throw insertError;
    }

    let balanceAfter;

    try {
      balanceAfter =
        await addMarketingCredits(
          env,
          organization.id,
          1,
          {
            transactionType:
              "customer_generation_refund",
            referenceId:
              campaignId,
            note:
              "24-hour customer generation report refund",
            countAsPurchased:
              false
          }
        );

      await env.TRANSLATIONS_DB.prepare(`
        UPDATE marketing_credit_accounts
        SET
          lifetime_used = CASE
            WHEN lifetime_used > 0 THEN lifetime_used - 1
            ELSE 0
          END,
          updated_at = ?
        WHERE organization_id = ?
      `)
      .bind(
        now,
        Number(organization.id)
      )
      .run();

      await env.TRANSLATIONS_DB.prepare(`
        UPDATE marketing_generation_refunds
        SET balance_after = ?
        WHERE id = ?
      `)
      .bind(
        balanceAfter,
        refundId
      )
      .run();

    } catch (creditError) {
      await env.TRANSLATIONS_DB.prepare(`
        DELETE FROM marketing_generation_refunds
        WHERE id = ?
      `)
      .bind(
        refundId
      )
      .run();

      throw creditError;
    }

    const emailSent =
      await sendMarketingRefundAdminEmail(
        env,
        organization,
        campaign,
        reason,
        balanceAfter,
        now
      );

    await env.TRANSLATIONS_DB.prepare(`
      UPDATE marketing_generation_refunds
      SET email_sent = ?
      WHERE id = ?
    `)
    .bind(
      emailSent ? 1 : 0,
      refundId
    )
    .run();

    return jsonResponse({
      success: true,
      refunded: true,
      creditReturned: 1,
      balance:
        balanceAfter,
      requestedAt:
        now,
      refundExpiresAt,
      emailSent
    });

  } catch (error) {
    console.error(
      "Marketing generation refund request failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to process the generation report."
      },
      500
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/marketing/delete"
) {
  try {
    const organization =
      await marketingOrganization(
        request,
        env
      );

    const body =
      await request.json();

    const campaignId =
      String(
        body.campaignId || ""
      ).trim();

    if (!campaignId) {
      return jsonResponse(
        {
          success: false,
          error: "Campaign ID is required."
        },
        400
      );
    }

    await ensureMarketingSchema(env);

    const existing =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT id
        FROM marketing_campaigns
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .bind(
        campaignId,
        Number(organization.id)
      )
      .first();

    if (!existing) {
      return jsonResponse(
        {
          success: false,
          error: "Marketing campaign not found."
        },
        404
      );
    }

    await env.TRANSLATIONS_DB.prepare(`
      DELETE FROM marketing_campaigns
      WHERE id = ?
        AND organization_id = ?
    `)
    .bind(
      campaignId,
      Number(organization.id)
    )
    .run();

    if (env.AZURE_TTS_CACHE) {
      const cachePrefixes = [
        "marketing-artwork/v3/",
        "marketing-artwork/v2/"
      ].map(version =>
        version +
        Number(organization.id) +
        "/" +
        campaignId +
        "/"
      );

      await Promise.allSettled(
        cachePrefixes.flatMap(prefix => [
          env.AZURE_TTS_CACHE.delete(
            prefix + "portrait.b64"
          ),
          env.AZURE_TTS_CACHE.delete(
            prefix + "square.b64"
          )
        ])
      );
    }

    return jsonResponse({
      success: true,
      campaignId
    });

  } catch (error) {
    console.error(
      "Marketing campaign delete failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to delete marketing campaign."
      },
      500
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/marketing/artwork"
) {
  try {
    const organization =
      await marketingOrganization(
        request,
        env
      );

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(
        {
          success: false,
          error: "OpenAI is not configured."
        },
        503
      );
    }

    const body = await request.json();

    const campaignId =
      String(body.campaignId || "")
        .trim();

    const kind =
      String(body.kind || "")
        .trim()
        .toLowerCase();

    if (
      !campaignId ||
      !["portrait", "square"].includes(kind)
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Campaign artwork request is invalid."
        },
        400
      );
    }

    await ensureMarketingSchema(env);

    const row =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM marketing_campaigns
        WHERE id = ?
          AND organization_id = ?
        LIMIT 1
      `)
      .bind(
        campaignId,
        Number(organization.id)
      )
      .first();

    if (!row) {
      return jsonResponse(
        {
          success: false,
          error: "Marketing campaign not found."
        },
        404
      );
    }

    const campaign =
      marketingCampaign(row);

    if (
      String(campaign.visualStyle || "people") ===
      "clean"
    ) {
      return jsonResponse({
        success: true,
        skipped: true
      });
    }

    const cacheKey =
      "marketing-artwork/v3/" +
      Number(organization.id) +
      "/" +
      campaignId +
      "/" +
      kind +
      ".b64";

    if (env.AZURE_TTS_CACHE) {
      const cached =
        await env.AZURE_TTS_CACHE.get(
          cacheKey
        );

      if (cached) {
        return jsonResponse({
          success: true,
          cached: true,
          mimeType: "image/png",
          imageBase64:
            await cached.text()
        });
      }
    }

    const imageBase64 =
      await generateMarketingArtworkBase64(
        env,
        campaign,
        kind
      );

    if (env.AZURE_TTS_CACHE) {
      await env.AZURE_TTS_CACHE.put(
        cacheKey,
        imageBase64,
        {
          httpMetadata: {
            contentType: "text/plain; charset=utf-8"
          }
        }
      );
    }

    return jsonResponse({
      success: true,
      cached: false,
      mimeType: "image/png",
      imageBase64
    });

  } catch (error) {
    console.error(
      "Marketing artwork generation failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to generate campaign artwork."
      },
      500
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/account/stats-api/test"
) {
  try {
    const organization =
      await organizationForStatsApiAccount(
        request,
        env
      );

    await ensureOrganizationStatsApiSchema(
      env
    );

    const access =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organization_stats_api_access
        WHERE organization_id = ?
        LIMIT 1
      `)
      .bind(
        Number(
          organization.id
        )
      )
      .first();

    const scopes =
      normalizeOrganizationStatsApiScopes(
        safeJson(
          access?.scopes_json,
          {}
        )
      );

    const policy =
      organizationStatsApiPolicy(
        organization
      );

    const {
      payload,
      cacheStatus
    } =
      await organizationStatsApiPayloadWithCache(
        env,
        organization,
        scopes,
        url,
        policy.cacheSeconds
      );

    return jsonResponse(
      payload,
      200,
      {
        "Cache-Control":
          "no-store",
        "X-LiveBridge-Stats-Cache":
          cacheStatus
      }
    );

  } catch (error) {
    const code =
      String(
        error?.code || ""
      );

    const status =
      code ===
      "STATS_API_DISABLED"
        ? 403
        : (
            [
              "SCOPE_DISABLED",
              "UNKNOWN_SCOPE"
            ].includes(code)
              ? 400
              : 500
          );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to preview Organization Stats API data."
      },
      status,
      {
        "Cache-Control":
          "no-store"
      }
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/account/stats-api"
) {
  try {
    const organization =
      await organizationForStatsApiAccount(
        request,
        env
      );

    await ensureOrganizationStatsApiSchema(
      env
    );

    const now =
      Date.now();

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO organization_stats_api_access (
        organization_id,
        api_key_hash,
        key_prefix,
        scopes_json,
        created_at,
        updated_at,
        rotated_at,
        revoked_at,
        last_used_at
      )
      VALUES (?, '', '', ?, ?, ?, NULL, NULL, NULL)
      ON CONFLICT(organization_id) DO NOTHING
    `)
    .bind(
      Number(
        organization.id
      ),
      JSON.stringify(
        defaultOrganizationStatsApiScopes()
      ),
      now,
      now
    )
    .run();

    const access =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organization_stats_api_access
        WHERE organization_id = ?
        LIMIT 1
      `)
      .bind(
        Number(
          organization.id
        )
      )
      .first();

    const policy =
      organizationStatsApiPolicy(
        organization
      );

    return jsonResponse({
      success: true,
      enabled: true,
      policy: {
        planCode:
          policy.planCode,
        accessSource:
          policy.accessSource,
        minIntervalSeconds:
          policy.minIntervalSeconds,
        cacheSeconds:
          policy.cacheSeconds,
        hardLimitPerMinute:
          policy.hardLimitPerMinute
      },
      hasKey:
        !!String(
          access?.api_key_hash ||
          ""
        ),
      keyPrefix:
        String(
          access?.key_prefix ||
          ""
        ),
      scopes:
        normalizeOrganizationStatsApiScopes(
          safeJson(
            access?.scopes_json,
            {}
          )
        ),
      scopeLabels:
        LIVEBRIDGE_STATS_API_SCOPES,
      apiEndpoint:
        new URL(
          request.url
        ).origin +
        "/api/v1/stats",
      createdAt:
        Number(
          access?.created_at ||
          0
        ),
      rotatedAt:
        Number(
          access?.rotated_at ||
          0
        ),
      lastUsedAt:
        Number(
          access?.last_used_at ||
          0
        )
    });

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load Organization Stats API settings."
      },
      error?.code ===
        "STATS_API_DISABLED"
          ? 403
          : 500
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/account/stats-api"
) {
  try {
    const organization =
      await organizationForStatsApiAccount(
        request,
        env
      );

    await ensureOrganizationStatsApiSchema(
      env
    );

    const body =
      await request.json();

    const action =
      String(
        body.action || ""
      )
      .trim()
      .toLowerCase();

    const now =
      Date.now();

    const existing =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organization_stats_api_access
        WHERE organization_id = ?
        LIMIT 1
      `)
      .bind(
        Number(
          organization.id
        )
      )
      .first();

    const existingScopes =
      normalizeOrganizationStatsApiScopes(
        safeJson(
          existing?.scopes_json,
          {}
        )
      );

    if (
      action ===
      "save_scopes"
    ) {
      const scopes =
        normalizeOrganizationStatsApiScopes(
          body.scopes
        );

      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO organization_stats_api_access (
          organization_id,
          api_key_hash,
          key_prefix,
          scopes_json,
          created_at,
          updated_at,
          rotated_at,
          revoked_at,
          last_used_at
        )
        VALUES (?, '', '', ?, ?, ?, NULL, NULL, NULL)
        ON CONFLICT(organization_id)
        DO UPDATE SET
          scopes_json =
            excluded.scopes_json,
          updated_at =
            excluded.updated_at
      `)
      .bind(
        Number(
          organization.id
        ),
        JSON.stringify(
          scopes
        ),
        Number(
          existing?.created_at ||
          now
        ),
        now
      )
      .run();

      return jsonResponse({
        success: true,
        scopes
      });
    }

    if (
      action === "generate" ||
      action === "rotate"
    ) {
      const apiKey =
        generateOrganizationStatsApiKey();

      const keyHash =
        await sha256(
          apiKey
        );

      const keyPrefix =
        apiKey.slice(0, 18) +
        "…";

      const scopes =
        body.scopes
          ? normalizeOrganizationStatsApiScopes(
              body.scopes
            )
          : existingScopes;

      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO organization_stats_api_access (
          organization_id,
          api_key_hash,
          key_prefix,
          scopes_json,
          created_at,
          updated_at,
          rotated_at,
          revoked_at,
          last_used_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)
        ON CONFLICT(organization_id)
        DO UPDATE SET
          api_key_hash =
            excluded.api_key_hash,
          key_prefix =
            excluded.key_prefix,
          scopes_json =
            excluded.scopes_json,
          updated_at =
            excluded.updated_at,
          rotated_at =
            excluded.rotated_at,
          revoked_at =
            NULL,
          last_used_at =
            NULL
      `)
      .bind(
        Number(
          organization.id
        ),
        keyHash,
        keyPrefix,
        JSON.stringify(
          scopes
        ),
        Number(
          existing?.created_at ||
          now
        ),
        now,
        now
      )
      .run();

      return jsonResponse({
        success: true,
        apiKey,
        keyPrefix,
        scopes,
        apiEndpoint:
          new URL(
            request.url
          ).origin +
          "/api/v1/stats",
        notice:
          "Copy this API key now. LiveBridge will not display the full key again."
      });
    }

    if (
      action === "revoke"
    ) {
      await env.TRANSLATIONS_DB.prepare(`
        INSERT INTO organization_stats_api_access (
          organization_id,
          api_key_hash,
          key_prefix,
          scopes_json,
          created_at,
          updated_at,
          rotated_at,
          revoked_at,
          last_used_at
        )
        VALUES (?, '', '', ?, ?, ?, NULL, ?, NULL)
        ON CONFLICT(organization_id)
        DO UPDATE SET
          api_key_hash = '',
          key_prefix = '',
          updated_at =
            excluded.updated_at,
          revoked_at =
            excluded.revoked_at,
          last_used_at =
            NULL
      `)
      .bind(
        Number(
          organization.id
        ),
        JSON.stringify(
          existingScopes
        ),
        Number(
          existing?.created_at ||
          now
        ),
        now,
        now
      )
      .run();

      return jsonResponse({
        success: true,
        revoked: true
      });
    }

    return jsonResponse(
      {
        success: false,
        error:
          "Unknown Stats API action."
      },
      400
    );

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to update Organization Stats API settings."
      },
      error?.code ===
        "STATS_API_DISABLED"
          ? 403
          : 500
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/api/v1/stats"
) {
  try {
    const {
      organization,
      scopes,
      policy
    } =
      await authenticateOrganizationStatsApi(
        request,
        env
      );

    const rate =
      await enforceOrganizationStatsApiRateLimit(
        env,
        organization.id,
        policy
      );

    const {
      payload,
      cacheStatus
    } =
      await organizationStatsApiPayloadWithCache(
        env,
        organization,
        scopes,
        url,
        policy.cacheSeconds
      );

    return jsonResponse(
      payload,
      200,
      {
        "Cache-Control":
          "no-store",
        "X-LiveBridge-Stats-Cache":
          cacheStatus,
        "X-LiveBridge-Stats-Rate-Limit":
          String(
            rate.limitPerMinute
          ),
        "X-LiveBridge-Stats-Rate-Remaining":
          "0"
      }
    );

  } catch (error) {
    const code =
      String(
        error?.code || ""
      );

    const status =
      [
        "API_KEY_REQUIRED",
        "API_KEY_INVALID"
      ].includes(code)
        ? 401
        : (
            code ===
            "STATS_API_RATE_LIMITED"
              ? 429
              : (
                  [
                    "STATS_API_DISABLED",
                    "SCOPE_DISABLED"
                  ].includes(code)
                    ? 403
                    : (
                        code ===
                        "UNKNOWN_SCOPE"
                          ? 400
                          : 500
                      )
                )
          );

    const retryAfter =
      Math.max(
        0,
        Number(
          error?.retryAfterSeconds ||
          0
        )
      );

    return jsonResponse(
      {
        success: false,
        code:
          code || undefined,
        error:
          error.message ||
          "Unable to load organization statistics.",
        retryAfterSeconds:
          retryAfter || undefined
      },
      status,
      {
        "Cache-Control":
          "no-store",
        ...(retryAfter
          ? {
              "Retry-After":
                String(
                  retryAfter
                )
            }
          : {}),
        ...(error?.rateLimit
          ? {
              "X-LiveBridge-Stats-Rate-Limit":
                String(
                  error.rateLimit
                ),
              "X-LiveBridge-Stats-Rate-Remaining":
                "0"
            }
          : {})
      }
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/account-usage-stats"
) {

  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    await ensureAnalyticsTables(
      env
    );

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();

    if (!organization) {
      return jsonResponse(
        {
          success: false,
          error:
            "LiveBridge account not found."
        },
        404
      );
    }

    const resetRow =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT reset_at
        FROM organization_stats_reset
        WHERE organization_id = ?
        LIMIT 1
      `)
      .bind(
        Number(
          organization.id
        )
      )
      .first();

    const resetAt =
      Math.max(
        0,
        Number(
          resetRow?.reset_at || 0
        )
      );

    const requestedStart =
      Number(
        url.searchParams.get(
          "start"
        ) || 0
      );

    const requestedEnd =
      Number(
        url.searchParams.get(
          "end"
        ) || 0
      );

    const start =
      Number.isFinite(
        requestedStart
      ) &&
      requestedStart > 0
        ? Math.floor(
            requestedStart
          )
        : resetAt;

    const end =
      Number.isFinite(
        requestedEnd
      ) &&
      requestedEnd > start
        ? Math.floor(
            requestedEnd
          )
        : Date.now() + 1;

    if (
      end <= start
    ) {
      return jsonResponse(
        {
          success: false,
          error:
            "A valid stats start and end time are required."
        },
        400
      );
    }

    const baseRoom =
      normalizeRoom(
        organization.room_name
      );

    const roomLike =
      baseRoom + "-%";

    const now =
      Date.now();

    const broadcastStats =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          COUNT(*) AS broadcast_count,

          COALESCE(
            SUM(
              CASE
                WHEN ended_at IS NOT NULL
                THEN MAX(
                  0,
                  ended_at - started_at
                )
                ELSE MAX(
                  0,
                  ? - started_at
                )
              END
            ),
            0
          ) AS broadcast_time_ms,

          COALESCE(
            MAX(
              peak_listeners
            ),
            0
          ) AS highest_peak

        FROM broadcast_sessions

        WHERE
          (
            room = ?
            OR room LIKE ?
          )
          AND started_at >= ?
          AND started_at < ?
      `)
      .bind(
        now,
        baseRoom,
        roomLike,
        start,
        end
      )
      .first();

    const listenerStats =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT
          COUNT(*) AS listener_sessions,

          COALESCE(
            SUM(
              MAX(
                0,
                COALESCE(
                  ls.ended_at,
                  ls.last_seen,
                  ?
                ) -
                ls.joined_at
              )
            ),
            0
          ) AS total_listening_ms

        FROM listener_sessions ls

        INNER JOIN broadcast_sessions bs
          ON bs.id =
            ls.broadcast_id

        WHERE
          (
            bs.room = ?
            OR bs.room LIKE ?
          )
          AND bs.started_at >= ?
          AND bs.started_at < ?
      `)
      .bind(
        now,
        baseRoom,
        roomLike,
        start,
        end
      )
      .first();

    const detailedAnalytics =
      buildEffectivePlanEntitlements(
        organization
      ).detailedAnalytics ===
      true;

    let languageTotals = [];

    if (
      detailedAnalytics
    ) {

      const languageResult =
        await env.TRANSLATIONS_DB.prepare(`
          SELECT
            ls.language AS language,

            COUNT(*) AS listeners,

            COALESCE(
              SUM(
                MAX(
                  0,
                  COALESCE(
                    ls.ended_at,
                    ls.last_seen,
                    ?
                  ) -
                  ls.joined_at
                )
              ),
              0
            ) AS total_listening_ms

          FROM listener_sessions ls

          INNER JOIN broadcast_sessions bs
            ON bs.id =
              ls.broadcast_id

          WHERE
            (
              bs.room = ?
              OR bs.room LIKE ?
            )
            AND bs.started_at >= ?
            AND bs.started_at < ?

          GROUP BY
            ls.language

          ORDER BY
            listeners DESC,
            ls.language ASC
        `)
        .bind(
          now,
          baseRoom,
          roomLike,
          start,
          end
        )
        .all();

      languageTotals =
        (
          languageResult.results ||
          []
        )
        .map(
          row => ({
            language:
              String(
                row.language || ""
              ),
            listeners:
              Number(
                row.listeners || 0
              ),
            totalListeningMs:
              Number(
                row.total_listening_ms ||
                0
              )
          })
        );
    }

    const totalListeners =
      Number(
        listenerStats
          ?.listener_sessions ||
        0
      );

    const totalListeningMs =
      detailedAnalytics
        ? Number(
            listenerStats
              ?.total_listening_ms ||
            0
          )
        : null;

    return jsonResponse({
      success: true,

      range: {
        start,
        end
      },

      resetAt,

      stats: {
        broadcasts:
          Number(
            broadcastStats
              ?.broadcast_count ||
            0
          ),

        broadcastTimeMs:
          Number(
            broadcastStats
              ?.broadcast_time_ms ||
            0
          ),

        totalListenerSessions:
          totalListeners,

        highestPeakAudience:
          Number(
            broadcastStats
              ?.highest_peak ||
            0
          ),

        detailedAnalytics,

        totalListeningMs,

        averageListenerSessionMs:
          detailedAnalytics &&
          totalListeners > 0
            ? Math.round(
                Number(
                  totalListeningMs ||
                  0
                ) /
                totalListeners
              )
            : null,

        uniqueLanguages:
          detailedAnalytics
            ? languageTotals.length
            : null,

        languages:
          detailedAnalytics
            ? languageTotals
            : null
      }
    });

  } catch (error) {

    console.error(
      "Account usage stats failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to load usage statistics."
      },
      403
    );
  }
}


if (
  request.method === "POST" &&
  url.pathname === "/account-usage-stats-reset"
) {

  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    await ensureAnalyticsTables(
      env
    );

    const organization =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT id
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();

    if (!organization) {
      return jsonResponse(
        {
          success: false,
          error:
            "LiveBridge account not found."
        },
        404
      );
    }

    const now =
      Date.now();

    await env.TRANSLATIONS_DB.prepare(`
      INSERT INTO organization_stats_reset (
        organization_id,
        reset_at,
        updated_at
      )
      VALUES (?, ?, ?)

      ON CONFLICT(
        organization_id
      )
      DO UPDATE SET
        reset_at =
          excluded.reset_at,
        updated_at =
          excluded.updated_at
    `)
    .bind(
      Number(
        organization.id
      ),
      now,
      now
    )
    .run();

    return jsonResponse({
      success: true,
      resetAt:
        now
    });

  } catch (error) {

    console.error(
      "Account usage stats reset failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Unable to reset usage statistics."
      },
      403
    );
  }
}


if (
  request.method === "GET" &&
  url.pathname === "/account"
) {

  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    await ensureBroadcastSafetySchema(env);

    const row =
      await env.TRANSLATIONS_DB.prepare(`
        SELECT *
        FROM organizations
        WHERE clerk_user_id = ?
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();


    if (!row) {

      return jsonResponse(
        {
          success: false,
          exists: false,
          error:
            "LiveBridge account not found."
        },
        404
      );
    }


    return jsonResponse({
      success: true,
      exists: true,
      account:
        buildOrganizationAccount(
          row
        )
    });

  } catch (error) {

    console.error(
      "Account lookup failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Account authentication failed."
      },
      401
    );
  }
}
    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({
        success: true,
        service: "LiveBridge",
        architecture: "Shared Durable Object Translation",
        status: "running"
      });
    }
    if (request.method === "GET" && url.pathname === "/room-test") {
      const room = (url.searchParams.get("room") || "test-room").trim().toUpperCase();
      const id = env.LIVEBRIDGE_ROOMS.idFromName(room);
      const stub = env.LIVEBRIDGE_ROOMS.get(id);
      const response = await stub.fetch(
        new Request(
          "https://livebridge.internal/status"
        )
      );
      const data = await response.json();
      return jsonResponse({
        success: true,
        room,
        durableObject: data
      });
    }
    if (request.method === "GET" && url.pathname === "/room-access") {
      try {
        const room = normalizeRoom(
          url.searchParams.get("room")
        );

        if (!room) {
          return jsonResponse(
            {
              success: false,
              allowed: false,
              error: "room is required."
            },
            400
          );
        }

        const organization =
          await getOrganizationForRoom(
            env,
            room
          );

        const id =
          env.LIVEBRIDGE_ROOMS.idFromName(room);

        const stub =
          env.LIVEBRIDGE_ROOMS.get(id);

        const statusResponse =
          await stub.fetch(
            new Request(
              "https://livebridge.internal/status"
            )
          );

        const statusData =
          await statusResponse.json();

        const currentListeners =
          Number(
            statusData.listeners || 0
          );

        if (!organization) {
          return jsonResponse({
            success: true,
            allowed: true,
            managed: false,
            room,
            currentListeners,
            viewerLimit: null,
            listenerDataDisplayEnabled:
              false
          });
        }

        const accountStatus =
          String(
            organization.account_status || ""
          ).toLowerCase();

        if (accountStatus !== "active") {
          return jsonResponse(
            {
              success: false,
              allowed: false,
              managed: true,
              room,
              organizationName:
                organization.organization_name || "",
              code: "ACCOUNT_NOT_ACTIVE",
              error:
                "This LiveBridge room is currently unavailable."
            },
            403
          );
        }

        if (
          !isBillingAccessActive(
            organization
          )
        ) {
          return jsonResponse(
            {
              success: false,
              allowed: false,
              managed: true,
              room,
              organizationName:
                organization.organization_name || "",
              code: "SUBSCRIPTION_NOT_ACTIVE",
              error:
                "This LiveBridge subscription is currently unavailable."
            },
            403
          );
        }

        const effectiveViewerLimit =
          organization.viewer_override !== null &&
          organization.viewer_override !== undefined
            ? Number(organization.viewer_override)
            : Number(organization.viewer_limit || 0);

        if (
          effectiveViewerLimit > 0 &&
          currentListeners >= effectiveViewerLimit
        ) {
          return jsonResponse(
            {
              success: false,
              allowed: false,
              managed: true,
              room,
              organizationName:
                organization.organization_name || "",
              code: "VIEWER_LIMIT_REACHED",
              error:
                "This LiveBridge room has reached its current listener limit. Please contact the organization hosting this room for access.",
              currentListeners,
              viewerLimit: effectiveViewerLimit
            },
            429
          );
        }

        return jsonResponse({
          success: true,
          allowed: true,
          managed: true,
          room,
          organizationName:
            organization.organization_name || "",
          currentListeners,
          viewerLimit: effectiveViewerLimit,
          listenerDataDisplayEnabled:
            parseFeatureOverrides(
              organization.feature_overrides_json
            ).listenerDataDisplay === true,
          remainingCapacity:
            effectiveViewerLimit > 0
              ? Math.max(
                  0,
                  effectiveViewerLimit - currentListeners
                )
              : null
        });

      } catch (error) {
        console.error(
          "Room access check failed:",
          error
        );

        return jsonResponse(
          {
            success: false,
            allowed: false,
            error:
              error.message ||
              "Room access check failed."
          },
          500
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/live-feed") {
      const room = (url.searchParams.get("room") || "").trim().toUpperCase();
      const language = (url.searchParams.get("lang") || "").trim().toLowerCase();
      if (!room || !language) {
        return jsonResponse(
          {
            success: false,
            error: "room and lang are required."
          },
          400
        );
      }
      /*
========================================
LOAD ORGANIZATION VIEWER LIMIT
========================================
*/

const organization =
  await env.TRANSLATIONS_DB.prepare(`
    SELECT
      viewer_limit,
      viewer_override,
      account_status,
      billing_status
    FROM organizations
    WHERE room_name = ?
    LIMIT 1
  `)
  .bind(room)
  .first();


let effectiveViewerLimit =
  0;


if (organization) {

  const accountStatus =
    String(
      organization.account_status ||
      ""
    ).toLowerCase();


  if (
    accountStatus !== "active"
  ) {

    return jsonResponse(
      {
        success: false,
        error:
          "This LiveBridge room is currently unavailable.",
        code:
          "ACCOUNT_NOT_ACTIVE"
      },
      403
    );
  }


  if (
    !isBillingAccessActive(
      organization
    )
  ) {

    return jsonResponse(
      {
        success: false,
        error:
          "This LiveBridge subscription is currently unavailable.",
        code:
          "SUBSCRIPTION_NOT_ACTIVE"
      },
      403
    );
  }


  effectiveViewerLimit =
    organization.viewer_override !==
      null &&
    organization.viewer_override !==
      undefined
      ? Number(
          organization.viewer_override
        )
      : Number(
          organization.viewer_limit ||
          0
        );
}
      const id = env.LIVEBRIDGE_ROOMS.idFromName(room);
      const stub = env.LIVEBRIDGE_ROOMS.get(id);
      const internalURL = new URL(
        "https://livebridge.internal/connect"
      );
      internalURL.searchParams.set(
        "lang",
        language
      );
      const listenerId = String(
        url.searchParams.get("listenerId") || crypto.randomUUID()
      ).trim();
      internalURL.searchParams.set(
        "listenerId",
        listenerId
      );
      if (
  effectiveViewerLimit > 0
) {

  internalURL.searchParams.set(
    "maxViewers",
    String(
      effectiveViewerLimit
    )
  );
}
      return stub.fetch(
        new Request(
          internalURL.toString(),
          request
        )
      );
    }
    if (request.method === "POST" && url.pathname === "/listener-start") {
      try {
        await ensureAnalyticsTables(env);
        const body = await request.json();
        const room = normalizeRoom(body.room);
        const language = String(body.language || "").trim().toLowerCase();
        const listenerId = String(body.listenerId || "").trim();
        const visitorId = String(body.visitorId || "").trim();
        const visitDay = String(body.visitDay || "").trim();
        if (!room || !language || !listenerId) {
          return jsonResponse(
            {
              success: false,
              error: "room, language and listenerId are required."
            },
            400
          );
        }
        const broadcast = await getActiveBroadcast(env, room);
        if (!broadcast) {
          return jsonResponse({
            success: true,
            tracked: false,
            reason: "no_active_broadcast"
          });
        }
        const now = Date.now();
        const sessionId = `${broadcast.id}:${listenerId}`;
        await env.TRANSLATIONS_DB.prepare(`
          INSERT INTO listener_sessions
          (id, broadcast_id, room, language, joined_at, last_seen, ended_at)
          VALUES (?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(id) DO UPDATE SET
            language = excluded.language,
            last_seen = excluded.last_seen,
            ended_at = NULL
        `).bind(
          sessionId,
          broadcast.id,
          room,
          language,
          now,
          now
        ).run();

        let visitor = null;

        if (visitorId && visitDay) {
          const organization =
            await getOrganizationForRoom(
              env,
              room
            );

          visitor =
            await trackAnonymousOrganizationVisitor(
              env,
              organization,
              room,
              visitorId,
              visitDay,
              language
            );
        }

        return jsonResponse({
          success: true,
          tracked: true,
          broadcastId: broadcast.id,
          sessionId,
          visitor:
            visitor
              ? {
                  visitNumber:
                    visitor.visitNumber,
                  firstVisitDay:
                    visitor.firstVisitDay,
                  lastVisitDay:
                    visitor.lastVisitDay,
                  returning:
                    visitor.returning
                }
              : null,
          organizationName:
            visitor?.organizationName || "",
          returnMessage:
            visitor?.returnMessage || ""
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error.message
          },
          500
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/listener-heartbeat") {
      try {
        await ensureAnalyticsTables(env);
        const body = await request.json();
        const room = normalizeRoom(body.room);
        const listenerId = String(body.listenerId || "").trim();
        const queueDepth =
  Math.max(0, Number(body.queueDepth || 0));

const audioMuted =
  body.audioMuted === true;
        if (!room || !listenerId) {
          return jsonResponse(
            {
              success: false,
              error: "room and listenerId are required."
            },
            400
          );
        }
        const broadcast = await getActiveBroadcast(env, room);
        if (!broadcast) {
          return jsonResponse({
            success: true,
            tracked: false,
            reason: "no_active_broadcast"
          });
        }

        await incrementBroadcastMetric(
          env,
          room,
          "listener_heartbeats"
        );

        const now = Date.now();
        const sessionId = `${broadcast.id}:${listenerId}`;
        await env.TRANSLATIONS_DB.prepare(`
  UPDATE listener_sessions
  SET last_seen = ?,
      queue_depth = ?,
      audio_muted = ?
  WHERE id = ?
`).bind(
  now,
  queueDepth,
  audioMuted ? 1 : 0,
  sessionId
).run();
        return jsonResponse({
          success: true,
          tracked: true
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error.message
          },
          500
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/listener-stop") {
      try {
        await ensureAnalyticsTables(env);
        const body = await request.json();
        const room = normalizeRoom(body.room);
        const listenerId = String(body.listenerId || "").trim();
        if (!room || !listenerId) {
          return jsonResponse(
            {
              success: false,
              error: "room and listenerId are required."
            },
            400
          );
        }
        const broadcast = await getActiveBroadcast(env, room);
        if (!broadcast) {
          return jsonResponse({
            success: true,
            tracked: false
          });
        }
        const now = Date.now();
        const sessionId = `${broadcast.id}:${listenerId}`;
        await env.TRANSLATIONS_DB.prepare(`
          UPDATE listener_sessions
          SET last_seen = ?, ended_at = ?
          WHERE id = ?
        `).bind(now, now, sessionId).run();
        return jsonResponse({
          success: true,
          tracked: true
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error.message
          },
          500
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/analytics-live") {
      try {
        await ensureAnalyticsTables(env);
        const body = await request.json();
        const room = normalizeRoom(body.room);
        if (!room) {
          return jsonResponse(
            {
              success: false,
              error: "Room is required."
            },
            400
          );
        }
        const broadcast = await getActiveBroadcast(env, room);
        if (!broadcast) {
          return jsonResponse({
            success: true,
            active: false,
            room
          });
        }

        await incrementBroadcastMetric(
          env,
          room,
          "analytics_requests"
        );

        const now = Date.now();
        const activeCutoff = now - 45e3;
        const active = await env.TRANSLATIONS_DB.prepare(`
          SELECT COUNT(*) AS count
          FROM listener_sessions
          WHERE broadcast_id = ?
            AND ended_at IS NULL
            AND last_seen >= ?
        `).bind(broadcast.id, activeCutoff).first();
        const activeCount = Number(active?.count || 0);
        if (activeCount > Number(broadcast.peak_listeners || 0)) {
          await env.TRANSLATIONS_DB.prepare(`
            UPDATE broadcast_sessions
            SET peak_listeners = ?
            WHERE id = ?
          `).bind(activeCount, broadcast.id).run();
        }
        const summary = await buildBroadcastSummary(
          env,
          broadcast.id
        );
        return jsonResponse({
          ...summary,
          active: true,
          activeListeners: activeCount,
          peakListeners: Math.max(
            Number(summary?.peakListeners || 0),
            activeCount
          )
        });
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error.message
          },
          500
        );
      }
    }
    if (request.method === "GET" && url.pathname === "/broadcast-summary") {
      try {
        await ensureAnalyticsTables(env);
        const room = normalizeRoom(
          url.searchParams.get("room")
        );
        const broadcastId = String(
          url.searchParams.get("broadcastId") || ""
        ).trim();
        let broadcast = null;
        if (broadcastId) {
          broadcast = await env.TRANSLATIONS_DB.prepare(`
              SELECT id
              FROM broadcast_sessions
              WHERE id = ?
            `).bind(broadcastId).first();
        } else if (room) {
          broadcast = await env.TRANSLATIONS_DB.prepare(`
              SELECT id
              FROM broadcast_sessions
              WHERE room = ?
              ORDER BY started_at DESC
              LIMIT 1
            `).bind(room).first();
        }
        if (!broadcast) {
          return jsonResponse(
            {
              success: false,
              error: "Broadcast not found."
            },
            404
          );
        }
        const summary = await buildBroadcastSummary(
          env,
          broadcast.id
        );
        return jsonResponse(summary);
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error: error.message
          },
          500
        );
      }
    }
    if (request.method === "GET" && url.pathname === "/broadcast-history") {
      try {

        await ensureAnalyticsTables(env);

        const auth =
          await verifyClerkRequest(
            request
          );

        const room =
          normalizeRoom(
            url.searchParams.get("room")
          );

        if (!room) {

          return jsonResponse(
            {
              success: false,
              error:
                "Room is required."
            },
            400
          );
        }

        const ownedRoom =
          await getOwnedBroadcastOrganization(
            env,
            auth.clerkUserId,
            room
          );

        const historyEntitlements =
          buildEffectivePlanEntitlements(
            ownedRoom.organization
          );

        const detailedAnalytics =
          historyEntitlements
            .detailedAnalytics === true;

        const limit =
          Math.min(
            50,
            Math.max(
              1,
              Number(
                url.searchParams.get(
                  "limit"
                ) || 10
              )
            )
          );

        const result =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              id,
              room,
              started_at,
              ended_at,
              peak_listeners
            FROM broadcast_sessions
            WHERE room = ?
            ORDER BY started_at DESC
            LIMIT ?
          `)
          .bind(
            room,
            limit
          )
          .all();

        const broadcasts = [];

        for (
          const row
          of result.results || []
        ) {

          const summary =
            await buildBroadcastSummary(
              env,
              row.id
            );

          if (!summary) {
            continue;
          }

          const transcript =
            await env.TRANSLATIONS_DB.prepare(`
              SELECT
                expires_at
              FROM broadcast_transcripts
              WHERE broadcast_id = ?
                AND expires_at > ?
              LIMIT 1
            `)
            .bind(
              row.id,
              Date.now()
            )
            .first();


          const basicSummary = {
            success: true,
            broadcastId:
              summary.broadcastId,
            room:
              summary.room,
            startedAt:
              summary.startedAt,
            endedAt:
              summary.endedAt,
            durationMs:
              summary.durationMs,
            totalListeners:
              summary.totalListeners,
            peakListeners:
              summary.peakListeners,
            hasTranscript:
              !!transcript,
            transcriptExpiresAt:
              transcript
                ? Number(
                    transcript.expires_at
                  )
                : null
          };


          if (
            detailedAnalytics
          ) {

            broadcasts.push({
              ...summary,
              hasTranscript:
                !!transcript,
              transcriptExpiresAt:
                transcript
                  ? Number(
                      transcript.expires_at
                    )
                  : null
            });

          } else {

            broadcasts.push(
              basicSummary
            );
          }
        }

        return jsonResponse({
          success: true,
          detailedAnalytics,
          broadcasts
        });

      } catch (error) {

        const message =
          error.message ||
          "Unable to load broadcast history.";

        const forbidden =
          message.includes("Clerk") ||
          message.includes("authorization") ||
          message.includes("authorized") ||
          message.includes("account not found");

        return jsonResponse(
          {
            success: false,
            error: message
          },
          forbidden ? 403 : 500
        );
      }
    }

    if (
      request.method === "GET" &&
      url.pathname === "/broadcast-transcript"
    ) {

      try {

        const auth =
          await verifyClerkRequest(
            request,
            env
          );

        const broadcastId =
          String(
            url.searchParams.get(
              "broadcastId"
            ) || ""
          ).trim();

        if (!broadcastId) {

          return jsonResponse(
            {
              success: false,
              error:
                "Broadcast ID is required."
            },
            400
          );
        }


        const organization =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              room_name,
              plan_code,
              feature_overrides_json
            FROM organizations
            WHERE clerk_user_id = ?
            LIMIT 1
          `)
          .bind(
            auth.clerkUserId
          )
          .first();


        if (!organization) {

          return jsonResponse(
            {
              success: false,
              error:
                "LiveBridge account not found."
            },
            404
          );
        }


        const transcriptEntitlements =
          buildEffectivePlanEntitlements(
            organization
          );


        if (
          !transcriptEntitlements
            .transcriptAccess
        ) {

          return jsonResponse(
            {
              success: false,
              error:
                "Broadcast transcript access is available on LiveBridge Growth and Pro.",
              code:
                "PLAN_UPGRADE_REQUIRED",
              requiredPlan:
                "growth"
            },
            403
          );
        }


        const broadcast =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              id,
              room,
              started_at
            FROM broadcast_sessions
            WHERE id = ?
              AND (
                room = ?
                OR room LIKE ?
              )
            LIMIT 1
          `)
          .bind(
            broadcastId,
            normalizeRoom(
              organization.room_name
            ),
            normalizeRoom(
              organization.room_name
            ) + '-%'
          )
          .first();


        if (!broadcast) {

          return jsonResponse(
            {
              success: false,
              error:
                "Broadcast not found for this account."
            },
            404
          );
        }


        const retentionDays =
          Math.max(
            1,
            Number(
              transcriptEntitlements
                .transcriptRetentionDays ||
              0
            )
          );

        const retentionCutoff =
          Date.now() -
          (
            retentionDays *
            24 *
            60 *
            60 *
            1000
          );


        if (
          Number(
            broadcast.started_at || 0
          ) <
          retentionCutoff
        ) {

          return jsonResponse(
            {
              success: false,
              error:
                "This transcript is outside the transcript-access window for your current LiveBridge plan.",
              code:
                "TRANSCRIPT_PLAN_RETENTION_EXPIRED",
              retentionDays
            },
            403
          );
        }


        const transcript =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              transcript_text,
              created_at,
              expires_at
            FROM broadcast_transcripts
            WHERE broadcast_id = ?
              AND expires_at > ?
            LIMIT 1
          `)
          .bind(
            broadcastId,
            Date.now()
          )
          .first();


        if (!transcript) {

          return jsonResponse(
            {
              success: false,
              error:
                "This transcript has expired or is no longer available.",
              code:
                "TRANSCRIPT_EXPIRED"
            },
            404
          );
        }


        return jsonResponse({
          success: true,

          transcript: {
            broadcastId:
              broadcast.id,

            room:
              broadcast.room,

            startedAt:
              Number(
                broadcast.started_at
              ),

            text:
              transcript.transcript_text ||
              "",

            createdAt:
              Number(
                transcript.created_at
              ),

            expiresAt:
              Number(
                transcript.expires_at
              ),

            planRetentionDays:
              retentionDays
          }
        });


      } catch (error) {

        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Unable to load transcript."
          },
          403
        );
      }
    }


    if (request.method === "POST" && url.pathname === "/source-final") {

      let auth;

      try {
        auth =
          await verifyClerkRequest(
            request
          );
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Broadcast authorization failed.",
            code:
              "BROADCAST_NOT_AUTHORIZED"
          },
          403
        );
      }

      let body;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          {
            success: false,
            error: "Invalid JSON."
          },
          400
        );
      }
      const room =
        normalizeRoom(
          body.room
        );

      const text =
        String(
          body.text || ""
        ).trim();
      if (!room || !text) {
        return jsonResponse(
          {
            success: false,
            error: "room and text are required."
          },
          400
        );
      }

      try {
        await getOwnedBroadcastOrganization(
          env,
          auth.clerkUserId,
          room
        );
      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "You are not authorized to publish to this room.",
            code:
              "BROADCAST_NOT_AUTHORIZED"
          },
          403
        );
      }

      const authorizedActiveBroadcast =
        await getActiveBroadcast(
          env,
          room
        );

      if (!authorizedActiveBroadcast) {
        return jsonResponse(
          {
            success: false,
            error:
              "This broadcast is not active.",
            code:
              "BROADCAST_NOT_ACTIVE"
          },
          409
        );
      }

      await incrementBroadcastMetric(
        env,
        room,
        "source_final_requests"
      );

      /*
      ========================================
      90-DAY TRANSCRIPT STORAGE WINDOW
      ========================================

      Transcript data is retained for the maximum current
      paid-plan access window even when a lower plan cannot
      view it. If an organization upgrades later, retained
      history can become available immediately.
      */

      const transcriptNow =
        Date.now();

      const transcriptExpiresAt =
        transcriptNow +
        (90 * 24 * 60 * 60 * 1000);


      /*
      Opportunistic cleanup. This keeps expired
      transcript text from accumulating without
      affecting permanent broadcast statistics.
      */

      await env.TRANSLATIONS_DB.prepare(`
        DELETE FROM broadcast_transcripts
        WHERE expires_at <= ?
      `)
      .bind(
        transcriptNow
      )
      .run();


      const activeTranscriptBroadcast =
        authorizedActiveBroadcast;


      if (activeTranscriptBroadcast) {

        await env.TRANSLATIONS_DB.prepare(`
          INSERT INTO broadcast_transcripts (
            broadcast_id,
            room,
            transcript_text,
            created_at,
            expires_at
          )

          VALUES (?, ?, ?, ?, ?)

          ON CONFLICT(broadcast_id)
          DO UPDATE SET
            transcript_text =
              CASE
                WHEN broadcast_transcripts.transcript_text = ''
                THEN excluded.transcript_text
                ELSE broadcast_transcripts.transcript_text
                  || char(10)
                  || char(10)
                  || excluded.transcript_text
              END,

            expires_at =
              excluded.expires_at
        `)
        .bind(
          activeTranscriptBroadcast.id,
          room,
          text,
          transcriptNow,
          transcriptExpiresAt
        )
        .run();
      }


      const id = env.LIVEBRIDGE_ROOMS.idFromName(room);
      const stub = env.LIVEBRIDGE_ROOMS.get(id);
      const response = await stub.fetch(
        new Request(
          "https://livebridge.internal/source-final",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              room,
              text,
              chunkId: body.chunkId || null,
              sourceLanguage: body.sourceLanguage || "en"
            })
          }
        )
      );
      const data = await response.json();
      return jsonResponse({
        ...data,
        room
      });
    }
    if (request.method === "GET" && url.pathname === "/room-status") {
      const room = (url.searchParams.get("room") || "").trim().toUpperCase();
      if (!room) {
        return jsonResponse(
          {
            success: false,
            error: "room is required."
          },
          400
        );
      }
      const id = env.LIVEBRIDGE_ROOMS.idFromName(room);
      const stub = env.LIVEBRIDGE_ROOMS.get(id);
      const response = await stub.fetch(
        new Request(
          "https://livebridge.internal/status"
        )
      );
      const data = await response.json();

await ensureAnalyticsTables(env);

const activeBroadcast =
  await getActiveBroadcast(env, room);

if (activeBroadcast) {
  await incrementBroadcastMetric(
    env,
    room,
    "status_polls"
  );
}

let maxQueueDepth = 0;
let audioListeners = 0;
let activeListeners = 0;

if (activeBroadcast) {

  const activeCutoff =
    Date.now() - 45000;

  const listenerStats =
    await env.TRANSLATIONS_DB.prepare(`
      SELECT
        COUNT(*) AS active_listeners,
        COALESCE(
          MAX(
            CASE
              WHEN audio_muted = 0
              THEN queue_depth
              ELSE 0
            END
          ),
          0
        ) AS max_queue_depth,
        COALESCE(
          SUM(
            CASE
              WHEN audio_muted = 0
              THEN 1
              ELSE 0
            END
          ),
          0
        ) AS audio_listeners
      FROM listener_sessions
      WHERE broadcast_id = ?
        AND ended_at IS NULL
        AND last_seen >= ?
    `).bind(
      activeBroadcast.id,
      activeCutoff
    ).first();

  maxQueueDepth =
    Number(
      listenerStats?.max_queue_depth ||
      0
    );

  audioListeners =
    Number(
      listenerStats?.audio_listeners ||
      0
    );

  activeListeners =
    Number(
      listenerStats?.active_listeners ||
      0
    );

  if (
    activeListeners >
    Number(
      activeBroadcast.peak_listeners ||
      0
    )
  ) {
    await env.TRANSLATIONS_DB.prepare(`
      UPDATE broadcast_sessions
      SET peak_listeners = ?
      WHERE id = ?
    `)
    .bind(
      activeListeners,
      activeBroadcast.id
    )
    .run();
  }
}

return jsonResponse({
  success: true,
  room,
  ...data,
  maxQueueDepth,
  audioListeners,
  activeListeners
});
    }
    if (request.method === "POST" && url.pathname === "/transcribe-audio") {
      if (!env.OPENAI_API_KEY) {
        return jsonResponse(
          {
            success: false,
            error: "OPENAI_API_KEY is not configured."
          },
          500
        );
      }
      try {
        const incomingForm = await request.formData();
        const audio = incomingForm.get("audio");
        const language = String(
          incomingForm.get("language") || "en"
        );
        const room =
          normalizeRoom(
            incomingForm.get("room")
          );

        if (room) {
          await incrementBroadcastMetric(
            env,
            room,
            "audio_chunks"
          );
        }

        if (!(audio instanceof File)) {
          return jsonResponse(
            {
              success: false,
              error: "No audio file received."
            },
            400
          );
        }
        const openAIForm = new FormData();
        openAIForm.append(
          "file",
          audio,
          audio.name || "broadcast.webm"
        );
        openAIForm.append(
          "model",
          "gpt-4o-mini-transcribe"
        );
        if (language) {
          openAIForm.append(
            "language",
            language
          );
        }
        const response = await fetch(
          OPENAI_TRANSCRIBE_URL,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${env.OPENAI_API_KEY}`
            },
            body: openAIForm
          }
        );
        if (!response.ok) {
          const errorText = await response.text();
          return jsonResponse(
            {
              success: false,
              error: "OpenAI transcription failed.",
              details: errorText
            },
            response.status
          );
        }
        const data = await response.json();

        try {
          await recordOpenAiUsageForRoom(
            env,
            room,
            "transcription",
            "gpt-4o-mini-transcribe",
            data.usage
          );
        } catch (usageError) {
          console.error(
            "Transcription OpenAI usage tracking failed:",
            usageError
          );
        }

        return jsonResponse({
          success: true,
          text: String(data.text || "").trim()
        });
      } catch (error) {
        console.error(
          "Transcription error:",
          error
        );
        return jsonResponse(
          {
            success: false,
            error: error.message || "Audio transcription failed."
          },
          500
        );
      }
    }

    /*
    =======================================================
    CUSTOMER ROOM SELECTION
    Base room is admin-controlled.
    Customer may only set an optional suffix/sub-room.
    =======================================================
    */

    if (
      (
        request.method === "GET" ||
        request.method === "POST"
      ) &&
      url.pathname === "/room-selection"
    ) {

      try {

        const auth =
          await verifyClerkRequest(
            request,
            env
          );


        const organization =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              id,
              room_name,
              last_subroom
            FROM organizations
            WHERE clerk_user_id = ?
            LIMIT 1
          `)
          .bind(
            auth.clerkUserId
          )
          .first();


        if (!organization) {

          return jsonResponse(
            {
              success: false,
              error:
                "LiveBridge account not found."
            },
            404
          );
        }


        const baseRoom =
          normalizeRoom(
            organization.room_name
          );


        let lastSubroom =
          normalizeRoom(
            organization.last_subroom ||
            ""
          );


        if (request.method === "POST") {

          const body =
            await request.json();


          const requestedRaw =
            String(
              body.subroom || ""
            )
            .trim();


          let requestedSubroom =
            requestedRaw
              ? normalizeRoom(
                  requestedRaw
                )
              : "";


          if (
            requestedSubroom.length >
            40
          ) {

            return jsonResponse(
              {
                success: false,
                error:
                  "Optional room name must be 40 characters or fewer."
              },
              400
            );
          }


          const currentEffectiveRoom =
            lastSubroom
              ? baseRoom +
                "-" +
                lastSubroom
              : baseRoom;


          const active =
            await env.TRANSLATIONS_DB.prepare(`
              SELECT room
              FROM active_broadcasts
              WHERE room = ?
              LIMIT 1
            `)
            .bind(
              currentEffectiveRoom
            )
            .first();


          if (active) {

            return jsonResponse(
              {
                success: false,
                error:
                  "End the current broadcast before changing the optional room name."
              },
              409
            );
          }


          await env.TRANSLATIONS_DB.prepare(`
            UPDATE organizations
            SET
              last_subroom = ?,
              updated_at = ?
            WHERE id = ?
          `)
          .bind(
            requestedSubroom ||
            null,
            Date.now(),
            organization.id
          )
          .run();


          lastSubroom =
            requestedSubroom;
        }


        const effectiveRoom =
          lastSubroom
            ? baseRoom +
              "-" +
              lastSubroom
            : baseRoom;


        return jsonResponse({
          success: true,

          baseRoom,

          subroom:
            lastSubroom,

          effectiveRoom
        });


      } catch (error) {

        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Unable to load room selection."
          },
          403
        );
      }
    }


    if (
      request.method === "POST" &&
      url.pathname === "/broadcast-schedule-arm"
    ) {
      try {
        const auth =
          await verifyClerkRequest(
            request
          );

        const body =
          await request.json();

        const room =
          normalizeRoom(
            body.room
          );

        const startAt =
          Number(body.startAt || 0);

        const endAt =
          Number(body.endAt || 0);

        if (
          !room ||
          !startAt ||
          !endAt ||
          endAt <= startAt
        ) {
          return jsonResponse(
            {
              success: false,
              error:
                "Valid room, startAt and endAt are required."
            },
            400
          );
        }

        const ownedRoom =
          await getOwnedBroadcastOrganization(
            env,
            auth.clerkUserId,
            room
          );


        const scheduleEntitlements =
          buildEffectivePlanEntitlements(
            ownedRoom.organization
          );


        if (
          !scheduleEntitlements
            .scheduledBroadcasts
        ) {

          return jsonResponse(
            {
              success: false,
              error:
                "Scheduled broadcasts are available on LiveBridge Growth and Pro.",
              code:
                "PLAN_UPGRADE_REQUIRED",
              requiredPlan:
                "growth"
            },
            403
          );
        }


        const id =
          env.LIVEBRIDGE_ROOMS.idFromName(
            room
          );

        const stub =
          env.LIVEBRIDGE_ROOMS.get(
            id
          );

        const response =
          await stub.fetch(
            new Request(
              "https://livebridge.internal/schedule-arm",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body: JSON.stringify({
                  room,
                  startAt,
                  endAt
                })
              }
            )
          );

        const data =
          await response.json();

        return jsonResponse(
          data,
          response.status
        );

      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Unable to arm scheduled broadcast alert."
          },
          403
        );
      }
    }

    if (
      request.method === "POST" &&
      url.pathname === "/broadcast-schedule-clear"
    ) {
      try {
        const auth =
          await verifyClerkRequest(
            request
          );

        const body =
          await request.json();

        const room =
          normalizeRoom(
            body.room
          );

        await getOwnedBroadcastOrganization(
          env,
          auth.clerkUserId,
          room
        );

        const id =
          env.LIVEBRIDGE_ROOMS.idFromName(
            room
          );

        const stub =
          env.LIVEBRIDGE_ROOMS.get(
            id
          );

        const response =
          await stub.fetch(
            new Request(
              "https://livebridge.internal/schedule-clear",
              {
                method: "POST"
              }
            )
          );

        const data =
          await response.json();

        return jsonResponse(
          data,
          response.status
        );

      } catch (error) {
        return jsonResponse(
          {
            success: false,
            error:
              error.message ||
              "Unable to clear scheduled broadcast alert."
          },
          403
        );
      }
    }

    if (request.method === "POST" && url.pathname === "/broadcast-start") {
      try {

        const auth =
          await verifyClerkRequest(
            request
          );

        const body =
          await request.json();

        const room =
          normalizeRoom(
            body.room
          );

        if (!room) {
          return jsonResponse(
            {
              success: false,
              error:
                "Room is required."
            },
            400
          );
        }

        const ownedRoom =
          await getOwnedBroadcastOrganization(
            env,
            auth.clerkUserId,
            room
          );

        const organization =
          ownedRoom.organization;


/*
Legacy rooms that have not yet been
converted into customer accounts are
allowed to continue working normally.
*/

if (organization) {

  const accountStatus =
    String(
      organization.account_status ||
      ""
    ).toLowerCase();


  if (
    accountStatus !== "active"
  ) {

    return jsonResponse(
      {
        success: false,

        error:
          accountStatus === "suspended"
            ? "This LiveBridge account is currently suspended."
            : "This LiveBridge account is not active.",

        code:
          "ACCOUNT_NOT_ACTIVE",

        accountStatus
      },
      403
    );
  }


  const includedMinutes =
    Number(
      organization.included_minutes ||
      0
    );

  const usedMinutes =
    Number(
      organization.used_minutes ||
      0
    );

  const bonusMinutes =
    Number(
      organization.bonus_minutes ||
      0
    );

  const remainingMinutes =
    Math.max(
      0,
      includedMinutes +
      bonusMinutes -
      usedMinutes
    );


  if (
    remainingMinutes <= 0
  ) {

    return jsonResponse(
      {
        success: false,

        error:
          "This LiveBridge account has no broadcast time remaining.",

        code:
          "NO_BROADCAST_TIME",

        includedMinutes,
        usedMinutes,
        bonusMinutes,
        remainingMinutes
      },
      403
    );
  }
}


const now =
  Date.now();
        await env.TRANSLATIONS_DB.prepare(
          `
          DELETE FROM active_broadcasts
          WHERE last_seen < ?
          `
        ).bind(now - 9e4).run();
        let existing = null;

        if (organization) {

          const organizationEffectiveRoom =
            organization.last_subroom
              ? normalizeRoom(
                  organization.room_name
                ) +
                "-" +
                normalizeRoom(
                  organization.last_subroom
                )
              : normalizeRoom(
                  organization.room_name
                );


          existing =
            await env.TRANSLATIONS_DB.prepare(`
              SELECT room
              FROM active_broadcasts
              WHERE room = ?
                 OR room LIKE ?
              LIMIT 1
            `)
            .bind(
              normalizeRoom(
                organization.room_name
              ),
              normalizeRoom(
                organization.room_name
              ) + "-%"
            )
            .first();

        } else {

          existing =
            await env.TRANSLATIONS_DB.prepare(`
              SELECT room
              FROM active_broadcasts
              WHERE room = ?
              LIMIT 1
            `)
            .bind(room)
            .first();
        }


        if (existing) {
          return jsonResponse(
            {
              success: false,
              error: "This room is already broadcasting."
            },
            409
          );
        }
        await env.TRANSLATIONS_DB.prepare(
          `
          INSERT INTO active_broadcasts
          (room, started_at, last_seen)
          VALUES (?, ?, ?)
          `
        ).bind(room, now, now).run();
        await ensureAnalyticsTables(env);
        const broadcastId = crypto.randomUUID();
        await env.TRANSLATIONS_DB.prepare(`
          INSERT INTO broadcast_sessions
          (id, room, started_at, ended_at, peak_listeners)
          VALUES (?, ?, ?, NULL, 0)
        `).bind(
          broadcastId,
          room,
          now
        ).run();
        const startRemainingMinutes =
          Math.max(
            0,
            Number(organization.included_minutes || 0) +
            Number(organization.bonus_minutes || 0) -
            Number(organization.used_minutes || 0)
          );

        const watchdogId =
          env.LIVEBRIDGE_ROOMS.idFromName(
            room
          );

        const watchdogStub =
          env.LIVEBRIDGE_ROOMS.get(
            watchdogId
          );

        await watchdogStub.fetch(
          new Request(
            "https://livebridge.internal/watchdog-arm",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                room
              })
            }
          )
        );

        return jsonResponse({
          success: true,
          room,
          broadcastId,
          remainingMinutes:
            startRemainingMinutes
        });
      } catch (error) {

        const message =
          error.message ||
          "Unable to start broadcast.";

        const authError =
          message.includes("Clerk") ||
          message.includes("authorization") ||
          message.includes("authorized") ||
          message.includes("account not found");

        return jsonResponse(
          {
            success: false,
            error: message,
            code:
              authError
                ? "BROADCAST_NOT_AUTHORIZED"
                : "BROADCAST_START_FAILED"
          },
          authError ? 403 : 500
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/broadcast-heartbeat") {
      try {

        const auth =
          await verifyClerkRequest(
            request
          );

        const body =
          await request.json();

        const room =
          normalizeRoom(
            body.room
          );

        await getOwnedBroadcastOrganization(
          env,
          auth.clerkUserId,
          room
        );

        const now =
          Date.now();

        const active =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              room,
              started_at
            FROM active_broadcasts
            WHERE room = ?
            LIMIT 1
          `)
          .bind(room)
          .first();

        if (!active) {

          return jsonResponse(
            {
              success: false,
              code:
                "BROADCAST_NOT_ACTIVE",
              error:
                "This broadcast is no longer active."
            },
            409
          );
        }

        await incrementBroadcastMetric(
          env,
          room,
          "heartbeat_requests"
        );


        const organization =
          await env.TRANSLATIONS_DB.prepare(`
            SELECT
              account_status,
              included_minutes,
              used_minutes,
              bonus_minutes
            FROM organizations
            WHERE clerk_user_id = ?
            LIMIT 1
          `)
          .bind(
            auth.clerkUserId
          )
          .first();


        if (organization) {

          const accountStatus =
            String(
              organization.account_status ||
              ""
            ).toLowerCase();


          if (
            accountStatus !== "active"
          ) {

            return jsonResponse(
              {
                success: false,
                code:
                  "ACCOUNT_NOT_ACTIVE",
                error:
                  "This LiveBridge account is no longer active."
              },
              403
            );
          }


          const totalSecondsAvailable =
            Math.max(
              0,
              (
                Number(
                  organization.included_minutes ||
                  0
                ) +
                Number(
                  organization.bonus_minutes ||
                  0
                ) -
                Number(
                  organization.used_minutes ||
                  0
                )
              ) * 60
            );


          const elapsedSeconds =
            Math.max(
              0,
              Math.floor(
                (
                  now -
                  Number(
                    active.started_at ||
                    now
                  )
                ) / 1000
              )
            );


          const remainingSeconds =
            Math.max(
              0,
              totalSecondsAvailable -
              elapsedSeconds
            );


          if (
            remainingSeconds <= 0
          ) {

            await finalizeBroadcastForReason(
              env,
              room,
              "time_limit"
            );

            const watchdogId =
              env.LIVEBRIDGE_ROOMS.idFromName(
                room
              );

            const watchdogStub =
              env.LIVEBRIDGE_ROOMS.get(
                watchdogId
              );

            await watchdogStub.fetch(
              new Request(
                "https://livebridge.internal/watchdog-clear",
                {
                  method: "POST"
                }
              )
            );

            return jsonResponse(
              {
                success: false,

                code:
                  "BROADCAST_TIME_EXHAUSTED",

                error:
                  "Your LiveBridge broadcast time has been fully used.",

                remainingSeconds:
                  0,

                remainingMinutes:
                  0
              },
              402
            );
          }


          await env.TRANSLATIONS_DB.prepare(`
            UPDATE active_broadcasts
            SET last_seen = ?
            WHERE room = ?
          `)
          .bind(
            now,
            room
          )
          .run();

          const watchdogId =
            env.LIVEBRIDGE_ROOMS.idFromName(
              room
            );

          const watchdogStub =
            env.LIVEBRIDGE_ROOMS.get(
              watchdogId
            );

          await watchdogStub.fetch(
            new Request(
              "https://livebridge.internal/watchdog-arm",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json"
                },
                body: JSON.stringify({
                  room
                })
              }
            )
          );


          return jsonResponse({
            success: true,

            remainingSeconds,

            remainingMinutes:
              Math.ceil(
                remainingSeconds /
                60
              )
          });
        }


        await env.TRANSLATIONS_DB.prepare(`
          UPDATE active_broadcasts
          SET last_seen = ?
          WHERE room = ?
        `)
        .bind(
          now,
          room
        )
        .run();

        const watchdogId =
          env.LIVEBRIDGE_ROOMS.idFromName(
            room
          );

        const watchdogStub =
          env.LIVEBRIDGE_ROOMS.get(
            watchdogId
          );

        await watchdogStub.fetch(
          new Request(
            "https://livebridge.internal/watchdog-arm",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json"
              },
              body: JSON.stringify({
                room
              })
            }
          )
        );


        return jsonResponse({
          success: true,
          remainingSeconds:
            null,
          remainingMinutes:
            null
        });


      } catch (error) {

        const message =
          error.message ||
          "Broadcast heartbeat failed.";

        const authError =
          message.includes("Clerk") ||
          message.includes("authorization") ||
          message.includes("authorized") ||
          message.includes("account not found");

        return jsonResponse(
          {
            success: false,
            error: message,
            code:
              authError
                ? "BROADCAST_NOT_AUTHORIZED"
                : "BROADCAST_HEARTBEAT_FAILED"
          },
          authError ? 403 : 500
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/broadcast-stop") {
      try {

        const auth =
          await verifyClerkRequest(
            request
          );

        await ensureAnalyticsTables(env);

        const body =
          await request.json();

        const room =
          normalizeRoom(
            body.room
          );

        const stopReason =
          String(
            body.reason || "manual"
          ).trim().toLowerCase();

        const owned =
          await getOwnedBroadcastOrganization(
            env,
            auth.clerkUserId,
            room
          );

        await ensureBroadcastSafetySchema(env);

        const now =
          Date.now();
        const broadcast = await getActiveBroadcast(env, room);
        if (broadcast) {
          await env.TRANSLATIONS_DB.prepare(`
            UPDATE listener_sessions
            SET
              ended_at = COALESCE(ended_at, last_seen, ?),
              last_seen = COALESCE(last_seen, ?)
            WHERE broadcast_id = ?
          `).bind(
            now,
            now,
            broadcast.id
          ).run();
          await env.TRANSLATIONS_DB.prepare(`
            UPDATE broadcast_sessions
            SET
              ended_at = ?,
              auto_end_reason = ?
            WHERE id = ?
          `).bind(
            now,
            stopReason === "manual"
              ? null
              : stopReason,
            broadcast.id
          ).run();


          await env.TRANSLATIONS_DB.prepare(`
            UPDATE broadcast_transcripts
            SET expires_at = ?
            WHERE broadcast_id = ?
          `)
          .bind(
            now +
              (90 * 24 * 60 * 60 * 1000),
            broadcast.id
          )
          .run();
        }
        if (broadcast) {

  const durationMs =
    Math.max(
      0,
      now -
      Number(broadcast.started_at || now)
    );

  const usedMinutes =
    Math.max(
      1,
      Math.ceil(
        durationMs / 60000
      )
    );

  await env.TRANSLATIONS_DB.prepare(`
    UPDATE organizations
    SET
      used_minutes =
        used_minutes + ?,
      updated_at = ?
    WHERE clerk_user_id = ?
  `)
  .bind(
    usedMinutes,
    now,
    auth.clerkUserId
  )
  .run();
}
        await env.TRANSLATIONS_DB.prepare(
          `
          DELETE FROM active_broadcasts
          WHERE room = ?
          `
        ).bind(room).run();

        const watchdogId =
          env.LIVEBRIDGE_ROOMS.idFromName(
            room
          );

        const watchdogStub =
          env.LIVEBRIDGE_ROOMS.get(
            watchdogId
          );

        await watchdogStub.fetch(
          new Request(
            "https://livebridge.internal/watchdog-clear",
            {
              method: "POST"
            }
          )
        );

        const summary = broadcast ? await buildBroadcastSummary(
          env,
          broadcast.id
        ) : null;

        if (
          broadcast &&
          ["no_audio", "page_exit", "time_limit", "broadcaster_disconnected"]
            .includes(stopReason)
        ) {
          await sendBroadcastAlertEmail(
            env,
            owned.organization,
            stopReason,
            room,
            Number(
              owned.organization
                ?.no_audio_timeout_minutes ??
              30
            )
          );
        }

        return jsonResponse({
          success: true,
          summary
        });
      } catch (error) {

        const message =
          error.message ||
          "Unable to stop broadcast.";

        const authError =
          message.includes("Clerk") ||
          message.includes("authorization") ||
          message.includes("authorized") ||
          message.includes("account not found");

        return jsonResponse(
          {
            success: false,
            error: message,
            code:
              authError
                ? "BROADCAST_NOT_AUTHORIZED"
                : "BROADCAST_STOP_FAILED"
          },
          authError ? 403 : 500
        );
      }
    }
    if (request.method === "POST" && url.pathname === "/email-transcript") {
  try {

    const auth =
      await verifyClerkRequest(
        request
      );

    const {
      email,
      transcript,
      language,
      room
    } =
      await request.json();


    const ownedRoom =
      await getOwnedBroadcastOrganization(
        env,
        auth.clerkUserId,
        room
      );


    const emailEntitlements =
      buildEffectivePlanEntitlements(
        ownedRoom.organization
      );


    if (
      !emailEntitlements
        .transcriptEmail
    ) {

      return jsonResponse(
        {
          success: false,
          error:
            "Email Transcript & AI Notes is available on LiveBridge Growth and Pro.",
          code:
            "PLAN_UPGRADE_REQUIRED",
          requiredPlan:
            "growth"
        },
        403
      );
    }


    if (!email || !transcript) {
      return jsonResponse(
        {
          success: false,
          error: "Missing email or transcript."
        },
        400
      );
    }

    // Generate AI notes
    const summaryResponse = await fetch(
      OPENAI_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
  `Write the entire summary in language code "${language || "en"}". Create clear notes using ONLY information explicitly contained in the transcript. Organize the speaker's actual content into short section headings, key points, and a concise summary. You may condense repetition and improve organization, but do not introduce new information. Do not infer, assume, interpret, correct, expand upon, or supplement anything the speaker did not explicitly say. Include Scripture references ONLY if explicitly mentioned. If something is unclear, leave it unclear rather than guessing. Preserve the speaker's intended meaning.`
            },
            {
              role: "user",
              content: transcript
            }
          ]
        })
      }
    );

    if (!summaryResponse.ok) {
      throw new Error(
        "AI summary failed: " + summaryResponse.status
      );
    }

    const summaryData = await summaryResponse.json();

    try {
      await recordOpenAiUsageByOrganization(
        env,
        ownedRoom.organization.id,
        "transcript_notes",
        "gpt-4.1-mini",
        summaryData.usage
      );
    } catch (usageError) {
      console.error(
        "Transcript notes OpenAI usage tracking failed:",
        usageError
      );
    }

    const summary =
      summaryData.choices?.[0]?.message?.content?.trim() ||
      "Summary unavailable.";

    const escapeHtml = (value) =>
      String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const summaryHtml = escapeHtml(summary)
      .replace(/^### (.*)$/gm, "<h3>$1</h3>")
      .replace(/^## (.*)$/gm, "<h2>$1</h2>")
      .replace(/^# (.*)$/gm, "<h1>$1</h1>")
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/^- (.*)$/gm, "• $1")
      .replace(/\n/g, "<br>");

    const transcriptHtml = escapeHtml(transcript)
      .replace(/\n/g, "<br>");

    // Send combined email
    const emailResponse = await fetch(
      env.GMAIL_WEB_APP_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,

          subject:
            "Your LiveBridge Transcript & AI Notes",

          text:
            "LIVEBRIDGE\n\n" +
            "AI NOTES / SUMMARY\n\n" +
            summary +
            "\n\n----------------------------------------\n\n" +
            "FULL TRANSCRIPT\n\n" +
            transcript,

          html: `
            <div style="
              font-family:Arial,Helvetica,sans-serif;
              max-width:800px;
              margin:auto;
              color:#222;
              line-height:1.6;
            ">

              <h1 style="margin-bottom:6px;">
                LiveBridge
              </h1>

              <p style="color:#666;margin-top:0;">
                Your AI notes and full transcript
              </p>

              <hr style="
                border:none;
                border-top:1px solid #ddd;
                margin:24px 0;
              ">

              <h2>AI Notes / Summary</h2>

              <div>
                ${summaryHtml}
              </div>

              <hr style="
                border:none;
                border-top:1px solid #ddd;
                margin:28px 0;
              ">

              <h2>Full Transcript</h2>

              <div>
                ${transcriptHtml}
              </div>

              <p style="
                margin-top:30px;
                color:#777;
                font-size:12px;
              ">
                LiveBridge automated transcription and translation may contain occasional inaccuracies.
              </p>

            </div>
          `
        })
      }
    );

    if (!emailResponse.ok) {
      throw new Error(
        "Email service failed: " + emailResponse.status
      );
    }

    return jsonResponse({
      success: true
    });

  } catch (error) {
    console.error("Email transcript error:", error);

    const message =
      error.message ||
      "Unable to email transcript.";

    const forbidden =
      message.includes("Clerk") ||
      message.includes("authorization") ||
      message.includes("authorized") ||
      message.includes("account not found");

    return jsonResponse(
      {
        success: false,
        error: message
      },
      forbidden ? 403 : 500
    );
  }
}

/* =====================================================
   AZURE TEST PAGE - TRANSLATION TEST
   ISOLATED FROM PRODUCTION
===================================================== */

if (
  request.method === "POST" &&
  url.pathname === "/azure-translate-test"
) {
  try {

    const body = await request.json();

    const text =
      String(body.text || "").trim();

    const language =
      String(body.language || "").trim();

    if (!text || !language) {
      return jsonResponse(
        {
          success: false,
          error: "Text and language are required."
        },
        400
      );
    }

    if (!env.OPENAI_API_KEY) {
      return jsonResponse(
        {
          success: false,
          error: "OpenAI is not configured."
        },
        500
      );
    }

    const languageNames = {
      "fr-CA": "Canadian French",
      "en-US": "English",
      "fil-PH": "Filipino (Tagalog)",
      "ig-NG": "Igbo",
      "yo-NG": "Yoruba",
      "es-ES": "Spanish",
      "es-MX": "Mexican Spanish",
      "de-DE": "German",
      "pt-BR": "Brazilian Portuguese",
      "pt-PT": "European Portuguese",
      "ru-RU": "Russian",
      "he-IL": "Hebrew",
      "it-IT": "Italian",
      "nl-NL": "Dutch",
      "pl-PL": "Polish",
      "uk-UA": "Ukrainian",
      "cs-CZ": "Czech",
      "ja-JP": "Japanese",
      "ko-KR": "Korean",
      "zh-CN": "Simplified Chinese",
      "ar-SA": "Arabic",
      "hi-IN": "Hindi",
      "tr-TR": "Turkish",
      "el-GR": "Greek",
      "sv-SE": "Swedish",
      "da-DK": "Danish",
      "nb-NO": "Norwegian",
      "fi-FI": "Finnish",
      "ro-RO": "Romanian",
      "hu-HU": "Hungarian",
      "id-ID": "Indonesian",
      "vi-VN": "Vietnamese",
      "th-TH": "Thai"
    };

    const targetLanguage =
      languageNames[language] || language;

    const openAIResponse = await fetch(
      OPENAI_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Authorization":
            "Bearer " + env.OPENAI_API_KEY,
          "Content-Type":
            "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "You are a professional live interpreter. Translate the user's text naturally into " +
                targetLanguage +
                ". Preserve meaning, names, Scripture references, numbers, tone, and sentence intent. Return ONLY the translated text with no explanation, quotation marks, labels, or notes."
            },
            {
              role: "user",
              content: text
            }
          ]
        })
      }
    );

    if (!openAIResponse.ok) {
      const errorText =
        await openAIResponse.text();

      return jsonResponse(
        {
          success: false,
          error: "Translation failed.",
          details: errorText
        },
        openAIResponse.status
      );
    }

    const data =
      await openAIResponse.json();

    const translatedText =
      data?.choices?.[0]?.message?.content?.trim();

    if (!translatedText) {
      return jsonResponse(
        {
          success: false,
          error: "No translation was returned."
        },
        500
      );
    }

    return jsonResponse(
      {
        success: true,
        language: targetLanguage,
        translatedText
      },
      200
    );

  } catch (error) {

    console.error(
      "Azure test translation failed:",
      error
    );

    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Translation test failed."
      },
      500
    );
  }
}

/* =====================================================
   AZURE TTS TEST - ISOLATED
===================================================== */

/* GET ALL AVAILABLE AZURE VOICES */
if (
  request.method === "GET" &&
  url.pathname === "/azure-voices-test"
) {
  try {

    if (
      !env.AZURE_SPEECH_KEY ||
      !env.AZURE_SPEECH_REGION
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Azure Speech is not configured."
        },
        500
      );
    }

    const azureResponse =
      await fetch(
        "https://" +
        env.AZURE_SPEECH_REGION +
        ".tts.speech.microsoft.com/cognitiveservices/voices/list",
        {
          method: "GET",
          headers: {
            "Ocp-Apim-Subscription-Key":
              env.AZURE_SPEECH_KEY
          }
        }
      );

    if (!azureResponse.ok) {
      const errorText =
        await azureResponse.text();

      return jsonResponse(
        {
          success: false,
          error: "Could not load Azure voices.",
          details: errorText
        },
        azureResponse.status
      );
    }

    const voices =
      await azureResponse.json();

    return jsonResponse(
      {
        success: true,
        voices
      },
      200
    );

  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error:
          error.message ||
          "Voice list failed."
      },
      500
    );
  }
}

/* GENERATE / REUSE AZURE SPEECH WITH R2 + DURABLE OBJECT LOCK */
if (
  request.method === "POST" &&
  url.pathname === "/azure-tts-test"
) {
  try {

    if (
      !env.AZURE_SPEECH_KEY ||
      !env.AZURE_SPEECH_REGION
    ) {
      return jsonResponse(
        {
          success: false,
          error: "Azure Speech is not configured."
        },
        500
      );
    }

    if (!env.AZURE_TTS_CACHE) {
      return jsonResponse(
        {
          success: false,
          error: "AZURE_TTS_CACHE R2 binding is not configured."
        },
        500
      );
    }

    const body =
      await request.json();

    const text =
      String(body.text || "").trim();

    const room =
      normalizeRoom(
        body.room || ""
      );

    if (room) {
      await incrementBroadcastMetric(
        env,
        room,
        "tts_requests"
      );
    }

    const voice =
      String(
        body.voice ||
        "en-US-AvaMultilingualNeural"
      ).trim();

    const locale =
      String(
        body.locale ||
        "en-US"
      ).trim();

    let rate =
      Number(body.rate || 1);

    if (!Number.isFinite(rate)) {
      rate = 1;
    }

    rate =
      Math.min(
        2,
        Math.max(
          0.5,
          rate
        )
      );

    if (!text) {
      return jsonResponse(
        {
          success: false,
          error: "Text is required."
        },
        400
      );
    }

    const normalizedRate =
      rate.toFixed(2);

    const audioCacheHash =
      await sha256(
        [
          "livebridge-azure-tts-do-r2-v1",
          locale,
          voice,
          normalizedRate,
          text
        ].join("|")
      );

    const objectKey =
      "azure-tts/" +
      audioCacheHash +
      ".mp3";


    /*
      Fast path:
      If R2 already has it, return immediately.
    */
    const cachedObject =
      await env.AZURE_TTS_CACHE.get(
        objectKey
      );

    if (cachedObject) {

      return new Response(
        cachedObject.body,
        {
          status: 200,

          headers: {
            ...CORS_HEADERS,

            "Content-Type":
              cachedObject.httpMetadata?.contentType ||
              "audio/mpeg",

            "Cache-Control":
              "public, max-age=604800",

            "X-LiveBridge-TTS-Cache":
              "HIT"
          }
        }
      );
    }


    /*
      No R2 object yet.

      Route EVERY identical audio request to the same
      Durable Object using the audio hash as the DO name.
      The Durable Object coordinates simultaneous listeners
      so only one Azure request can generate this audio.
    */
    const lockId =
      env.LIVEBRIDGE_ROOMS.idFromName(
        "AZURE-TTS-" +
        audioCacheHash
      );

    const lockStub =
      env.LIVEBRIDGE_ROOMS.get(
        lockId
      );

    const internalResponse =
      await lockStub.fetch(
        new Request(
          "https://livebridge.internal/azure-tts-generate",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify({
                text,
                voice,
                locale,
                normalizedRate,
                objectKey
              })
          }
        )
      );


    if (!internalResponse.ok) {

      const errorText =
        await internalResponse.text();

      return new Response(
        errorText,
        {
          status:
            internalResponse.status,

          headers: {
            ...CORS_HEADERS,

            "Content-Type":
              internalResponse.headers.get(
                "Content-Type"
              ) ||
              "application/json"
          }
        }
      );
    }


    const cacheStatus =
      internalResponse.headers.get(
        "X-LiveBridge-TTS-Cache"
      ) ||
      "HIT";


    /*
      Count Azure usage ONLY when Azure actually generated
      a new MP3. R2/DO cache HITs add zero usage.
    */
    if (
      String(cacheStatus)
        .toUpperCase() === "MISS" &&
      room
    ) {

      try {

        const billableCharacters =
          Number(
            internalResponse.headers.get(
              "X-LiveBridge-TTS-Billable-Characters"
            ) || 0
          );

        await recordAzureTtsUsage(
          env,
          room,
          text,
          billableCharacters
        );

      } catch (usageError) {

        /*
          Usage accounting must never interrupt listener audio.
        */
        console.error(
          "Azure TTS usage tracking failed:",
          usageError
        );
      }
    }


    return new Response(
      internalResponse.body,
      {
        status: 200,

        headers: {
          ...CORS_HEADERS,

          "Content-Type":
            "audio/mpeg",

          "Cache-Control":
            "public, max-age=604800",

          "X-LiveBridge-TTS-Cache":
            cacheStatus
        }
      }
    );


  } catch (error) {

    console.error(
      "Azure TTS test failed:",
      error
    );

    return jsonResponse(
      {
        success: false,

        error:
          error.message ||
          "Azure TTS test failed.",

        details:
          error.details ||
          undefined
      },
      Number(
        error.status ||
        500
      )
    );
  }
}

    return jsonResponse(
      {
        success: false,
        service: "LiveBridge",
        error: "Route not found."
      },
      404
    );
  }
};
export {
  LiveBridgeRoom,
  index_default as default
};
//# sourceMappingURL=index.js.map
