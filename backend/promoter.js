const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

const PROD_ADMIN_ME =
  "https://livebridge.northstarventures-ca.workers.dev/admin/me";

const CLERK_ISSUER =
  "https://stable-swine-6554.clerk.accounts.dev";

const CLERK_JWKS =
  CLERK_ISSUER + "/.well-known/jwks.json";

let jwksCache = null;
let jwksUntil = 0;
let schemaReady = false;

const j = (data, status = 200) =>
  new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...CORS,
        "Content-Type":
          "application/json"
      }
    }
  );

const text = (
  value,
  max = 2000
) =>
  String(value || "")
    .trim()
    .substring(0, max);

const code = value =>
  text(value, 120)
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      "-"
    )
    .replace(
      /^-+|-+$/g,
      ""
    );

function randomToken(
  bytes = 24
) {

  const array =
    new Uint8Array(bytes);

  crypto.getRandomValues(
    array
  );

  return Array
    .from(array)
    .map(
      value =>
        value
          .toString(16)
          .padStart(2, "0")
    )
    .join("");
}


function base64UrlToBytes(
  value
) {

  let base64 =
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while(
    base64.length % 4
  ) {
    base64 += "=";
  }

  const binary =
    atob(base64);

  const output =
    new Uint8Array(
      binary.length
    );

  for(
    let i = 0;
    i < binary.length;
    i += 1
  ) {
    output[i] =
      binary.charCodeAt(i);
  }

  return output;
}


function jwtPart(
  value
) {

  return JSON.parse(
    new TextDecoder()
      .decode(
        base64UrlToBytes(
          value
        )
      )
  );
}


async function getJwks() {

  if(
    jwksCache &&
    Date.now() <
      jwksUntil
  ) {
    return jwksCache;
  }

  const response =
    await fetch(
      CLERK_JWKS
    );

  if(
    !response.ok
  ) {
    throw new Error(
      "Unable to load Clerk signing keys."
    );
  }

  jwksCache =
    await response.json();

  jwksUntil =
    Date.now() +
    300000;

  return jwksCache;
}


async function verifyClerk(
  request
) {

  const authorization =
    request.headers.get(
      "Authorization"
    ) || "";

  if(
    !authorization
      .startsWith(
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

  if(
    parts.length !== 3
  ) {
    throw new Error(
      "Invalid Clerk token."
    );
  }

  const header =
    jwtPart(
      parts[0]
    );

  const payload =
    jwtPart(
      parts[1]
    );

  if(
    header.alg !==
      "RS256" ||
    !header.kid
  ) {
    throw new Error(
      "Unsupported Clerk token."
    );
  }

  const keys =
    await getJwks();

  const jwk =
    (keys.keys || [])
      .find(
        item =>
          item.kid ===
          header.kid
      );

  if(
    !jwk
  ) {

    jwksCache =
      null;

    throw new Error(
      "Clerk signing key not found."
    );
  }

  const cryptoKey =
    await crypto.subtle
      .importKey(
        "jwk",
        jwk,
        {
          name:
            "RSASSA-PKCS1-v1_5",
          hash:
            "SHA-256"
        },
        false,
        ["verify"]
      );

  const valid =
    await crypto.subtle
      .verify(
        "RSASSA-PKCS1-v1_5",
        cryptoKey,
        base64UrlToBytes(
          parts[2]
        ),
        new TextEncoder()
          .encode(
            parts[0] +
            "." +
            parts[1]
          )
      );

  if(
    !valid
  ) {
    throw new Error(
      "Invalid Clerk signature."
    );
  }

  if(
    payload.exp &&
    Number(
      payload.exp
    ) <
    Math.floor(
      Date.now() /
      1000
    )
  ) {
    throw new Error(
      "Clerk session expired."
    );
  }

  if(
    payload.iss &&
    payload.iss !==
      CLERK_ISSUER
  ) {
    throw new Error(
      "Invalid Clerk issuer."
    );
  }

  const clerkUserId =
    text(
      payload.sub,
      300
    );

  if(
    !clerkUserId
  ) {
    throw new Error(
      "Clerk user ID missing."
    );
  }

  return {
    clerkUserId,
    authorization,
    payload
  };
}


async function ensureSchema(
  env
) {

  if(
    schemaReady
  ) {
    return;
  }

  const statements = [

    `
    CREATE TABLE IF NOT EXISTS promoter_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clerk_user_id TEXT NOT NULL DEFAULT '',
      display_name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      promoter_code TEXT NOT NULL UNIQUE,
      invite_token TEXT NOT NULL UNIQUE,
      invite_claimed_at INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      monthly_commission_percent REAL NOT NULL DEFAULT 25,
      annual_commission_percent REAL NOT NULL DEFAULT 15,
      commission_hold_days INTEGER NOT NULL DEFAULT 30,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
    `,

    `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_promoter_users_clerk
    ON promoter_users(
      clerk_user_id
    )
    WHERE clerk_user_id != ''
    `,

    `
    CREATE TABLE IF NOT EXISTS promoter_plan_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL,
      plan_name TEXT NOT NULL,
      plan_code TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CAD',
      billing_interval TEXT NOT NULL DEFAULT 'month',
      included_minutes INTEGER NOT NULL DEFAULT 0,
      viewer_limit INTEGER NOT NULL DEFAULT 1,
      features_json TEXT NOT NULL DEFAULT '[]',
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      approved_plan_id INTEGER,
      admin_feedback TEXT NOT NULL DEFAULT '',
      reviewed_by TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      reviewed_at INTEGER
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS promoter_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL,
      organization_name TEXT NOT NULL,
      contact_name TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'lead',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS promoter_offer_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL,
      plan_request_id INTEGER NOT NULL,
      plan_id INTEGER NOT NULL,
      offer_token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS promoter_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL UNIQUE,
      offer_token TEXT NOT NULL DEFAULT '',
      source_code TEXT NOT NULL DEFAULT '',
      landed_at INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS promoter_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      request_type TEXT NOT NULL,
      details TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_response TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      reviewed_at INTEGER,
      reviewed_by TEXT NOT NULL DEFAULT ''
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS promoter_commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      promoter_id INTEGER NOT NULL,
      organization_id INTEGER NOT NULL,
      plan_code TEXT NOT NULL DEFAULT '',
      sale_amount_cents INTEGER NOT NULL DEFAULT 0,
      commission_percent REAL NOT NULL DEFAULT 0,
      commission_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      earned_at INTEGER NOT NULL,
      payable_at INTEGER NOT NULL,
      paid_at INTEGER,
      notes TEXT NOT NULL DEFAULT ''
    )
    `,

    `
    CREATE TABLE IF NOT EXISTS plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_code TEXT NOT NULL UNIQUE,
      plan_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cents INTEGER NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'CAD',
      billing_interval TEXT NOT NULL DEFAULT 'month',
      included_minutes INTEGER NOT NULL DEFAULT 0,
      viewer_limit INTEGER NOT NULL DEFAULT 1,
      public_visible INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      display_order INTEGER NOT NULL DEFAULT 999,
      stripe_product_id TEXT NOT NULL DEFAULT '',
      stripe_price_id TEXT NOT NULL DEFAULT '',
      custom_plan INTEGER NOT NULL DEFAULT 1,
      features_json TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
    `,

    `
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
    `
  ];

  for(
    const sql of
      statements
  ) {

    await env
      .TRANSLATIONS_DB
      .prepare(sql)
      .run();
  }

  schemaReady =
    true;
}


async function verifyAdmin(
  request
) {

  const auth =
    await verifyClerk(
      request
    );

  /*
    TEST ENVIRONMENT ONLY:

    We ask the existing production backend
    whether this Clerk user is already a
    LiveBridge site administrator.

    This is GET/read-only.
    It cannot edit production data.
  */

  const response =
    await fetch(
      PROD_ADMIN_ME,
      {
        method:
          "GET",

        headers: {
          "Authorization":
            auth.authorization
        }
      }
    );

  if(
    !response.ok
  ) {
    throw new Error(
      "Site administrator access required."
    );
  }

  const data =
    await response.json();

  if(
    !data?.success
  ) {
    throw new Error(
      "Site administrator access required."
    );
  }

  return {
    ...auth,
    admin:
      data.admin || {}
  };
}


async function verifyPromoter(
  request,
  env
) {

  const auth =
    await verifyClerk(
      request
    );

  await ensureSchema(
    env
  );

  const promoter =
    await env
      .TRANSLATIONS_DB
      .prepare(`
        SELECT *
        FROM promoter_users
        WHERE
          clerk_user_id = ?
          AND active = 1
        LIMIT 1
      `)
      .bind(
        auth.clerkUserId
      )
      .first();

  if(
    !promoter
  ) {
    throw new Error(
      "Promoter access required."
    );
  }

  return {
    ...auth,
    promoter
  };
}


function promoterJson(
  row
) {

  if(
    !row
  ) {
    return null;
  }

  return {

    id:
      Number(
        row.id
      ),

    displayName:
      text(
        row.display_name,
        200
      ),

    email:
      text(
        row.email,
        250
      ),

    phone:
      text(
        row.phone,
        100
      ),

    promoterCode:
      text(
        row.promoter_code,
        100
      ),

    active:
      Number(
        row.active || 0
      ) === 1,

    inviteClaimed:
      !!Number(
        row.invite_claimed_at ||
        0
      ),

    monthlyCommissionPercent:
      Number(
        row.monthly_commission_percent ||
        0
      ),

    annualCommissionPercent:
      Number(
        row.annual_commission_percent ||
        0
      ),

    commissionHoldDays:
      Number(
        row.commission_hold_days ||
        0
      ),

    notes:
      text(
        row.notes,
        2000
      ),

    createdAt:
      Number(
        row.created_at ||
        0
      )
  };
}


function parseFeatures(
  value
) {

  try {

    const parsed =
      JSON.parse(
        String(
          value ||
          "[]"
        )
      );

    return Array.isArray(
      parsed
    )
      ? parsed
      : [];

  } catch {

    return [];
  }
}


function planJson(
  row
) {

  return {

    id:
      Number(
        row?.id || 0
      ),

    promoterId:
      Number(
        row?.promoter_id ||
        0
      ),

    promoterName:
      text(
        row?.promoter_name,
        200
      ),

    promoterCode:
      text(
        row?.promoter_code,
        100
      ),

    planName:
      text(
        row?.plan_name,
        200
      ),

    planCode:
      text(
        row?.plan_code,
        120
      ),

    description:
      text(
        row?.description,
        1500
      ),

    priceCents:
      Number(
        row?.price_cents ||
        0
      ),

    currency:
      text(
        row?.currency ||
        "CAD",
        10
      ),

    billingInterval:
      text(
        row?.billing_interval ||
        "month",
        20
      ),

    includedMinutes:
      Number(
        row?.included_minutes ||
        0
      ),

    viewerLimit:
      Number(
        row?.viewer_limit ||
        1
      ),

    features:
      parseFeatures(
        row?.features_json
      ),

    note:
      text(
        row?.note,
        1500
      ),

    status:
      text(
        row?.status ||
        "pending",
        30
      ),

    approvedPlanId:
      row?.approved_plan_id ==
        null
        ? null
        : Number(
            row
              .approved_plan_id
          ),

    adminFeedback:
      text(
        row?.admin_feedback,
        1500
      ),

    createdAt:
      Number(
        row?.created_at ||
        0
      ),

    reviewedAt:
      Number(
        row?.reviewed_at ||
        0
      )
  };
}


async function stripePost(
  env,
  path,
  values
) {

  const secret =
    text(
      env.STRIPE_SECRET_KEY,
      500
    );

  if(
    !secret
  ) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured on the test backend."
    );
  }

  const body =
    new URLSearchParams();

  for(
    const [
      key,
      value
    ] of
      Object.entries(
        values || {}
      )
  ) {

    if(
      value !==
        undefined &&
      value !==
        null
    ) {

      body.set(
        key,
        String(value)
      );
    }
  }

  const response =
    await fetch(
      "https://api.stripe.com" +
      path,
      {
        method:
          "POST",

        headers: {

          "Authorization":
            "Bearer " +
            secret,

          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          body.toString()
      }
    );

  const data =
    await response.json();

  if(
    !response.ok
  ) {

    throw new Error(
      data?.error?.message ||
      "Stripe request failed."
    );
  }

  return data;
}


async function createStripePlan(
  env,
  row
) {

  const product =
    await stripePost(
      env,
      "/v1/products",
      {

        name:
          row.plan_name,

        description:
          row.description ||
          undefined,

        "metadata[livebridge_plan_code]":
          row.plan_code,

        "metadata[livebridge_promoter_plan]":
          "true"
      }
    );

  const price =
    await stripePost(
      env,
      "/v1/prices",
      {

        product:
          product.id,

        unit_amount:
          Number(
            row.price_cents ||
            0
          ),

        currency:
          String(
            row.currency ||
            "CAD"
          )
            .toLowerCase(),

        "recurring[interval]":
          row.billing_interval,

        "metadata[livebridge_plan_code]":
          row.plan_code,

        "metadata[livebridge_promoter_plan]":
          "true"
      }
    );

  return {

    productId:
      String(
        product.id ||
        ""
      ),

    priceId:
      String(
        price.id ||
        ""
      )
  };
}


async function promoterStats(
  env,
  promoterId
) {

  const [
    leads,
    plans,
    offers,
    clients,
    commissions,
    changes
  ] =
    await Promise.all([

      env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN status = 'won'
                THEN 1
                ELSE 0
              END
            ) AS won
          FROM promoter_leads
          WHERE promoter_id = ?
        `)
        .bind(
          promoterId
        )
        .first(),

      env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN status = 'pending'
                THEN 1
                ELSE 0
              END
            ) AS pending,
            SUM(
              CASE
                WHEN status = 'approved'
                THEN 1
                ELSE 0
              END
            ) AS approved
          FROM promoter_plan_requests
          WHERE promoter_id = ?
        `)
        .bind(
          promoterId
        )
        .first(),

      env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            COUNT(*) AS total
          FROM promoter_offer_links
          WHERE promoter_id = ?
        `)
        .bind(
          promoterId
        )
        .first(),

      env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            COUNT(*) AS total
          FROM promoter_clients
          WHERE
            promoter_id = ?
            AND active = 1
        `)
        .bind(
          promoterId
        )
        .first(),

      env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT

            COALESCE(
              SUM(
                CASE
                  WHEN status IN (
                    'pending',
                    'payable'
                  )
                  THEN commission_cents
                  ELSE 0
                END
              ),
              0
            ) AS unpaid,

            COALESCE(
              SUM(
                CASE
                  WHEN status = 'paid'
                  THEN commission_cents
                  ELSE 0
                END
              ),
              0
            ) AS paid

          FROM promoter_commissions
          WHERE promoter_id = ?
        `)
        .bind(
          promoterId
        )
        .first(),

      env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            COUNT(*) AS total
          FROM promoter_change_requests
          WHERE
            promoter_id = ?
            AND status = 'pending'
        `)
        .bind(
          promoterId
        )
        .first()
    ]);

  return {

    leads:
      Number(
        leads?.total ||
        0
      ),

    wonLeads:
      Number(
        leads?.won ||
        0
      ),

    planRequests:
      Number(
        plans?.total ||
        0
      ),

    pendingPlans:
      Number(
        plans?.pending ||
        0
      ),

    approvedPlans:
      Number(
        plans?.approved ||
        0
      ),

    offers:
      Number(
        offers?.total ||
        0
      ),

    clients:
      Number(
        clients?.total ||
        0
      ),

    unpaidCommissionCents:
      Number(
        commissions?.unpaid ||
        0
      ),

    paidCommissionCents:
      Number(
        commissions?.paid ||
        0
      ),

    pendingChangeRequests:
      Number(
        changes?.total ||
        0
      )
  };
}


async function promoterRoutes(
  request,
  env,
  url
) {

  await ensureSchema(
    env
  );


  /*
  =========================================================
  CLAIM PROMOTER INVITATION
  =========================================================
  */

  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter/claim-invite"
  ) {

    const auth =
      await verifyClerk(
        request
      );

    const body =
      await request.json();

    const invite =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_users
          WHERE
            invite_token = ?
            AND active = 1
          LIMIT 1
        `)
        .bind(
          text(
            body.token,
            200
          )
        )
        .first();

    if(
      !invite
    ) {

      return j(
        {
          success:
            false,

          error:
            "This promoter invitation is not valid."
        },
        404
      );
    }

    if(
      invite
        .clerk_user_id &&
      invite
        .clerk_user_id !==
        auth.clerkUserId
    ) {

      return j(
        {
          success:
            false,

          error:
            "This invitation has already been claimed."
        },
        409
      );
    }

    await env
      .TRANSLATIONS_DB
      .prepare(`
        UPDATE promoter_users
        SET
          clerk_user_id = ?,
          invite_claimed_at =
            COALESCE(
              invite_claimed_at,
              ?
            ),
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        auth.clerkUserId,
        Date.now(),
        Date.now(),
        Number(
          invite.id
        )
      )
      .run();

    return j({
      success:
        true
    });
  }


  const auth =
    await verifyPromoter(
      request,
      env
    );

  const promoter =
    auth.promoter;

  const promoterId =
    Number(
      promoter.id
    );


  /*
  =========================================================
  PROMOTER PROFILE + DASHBOARD
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/me"
  ) {

    return j({

      success:
        true,

      promoter:
        promoterJson(
          promoter
        ),

      stats:
        await promoterStats(
          env,
          promoterId
        )
    });
  }


  /*
  =========================================================
  PROMOTER LEADS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/leads"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_leads
          WHERE promoter_id = ?
          ORDER BY updated_at DESC
        `)
        .bind(
          promoterId
        )
        .all();

    return j({

      success:
        true,

      leads:
        result.results ||
        []
    });
  }


  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter/lead-save"
  ) {

    const body =
      await request.json();

    const organizationName =
      text(
        body.organizationName,
        200
      );

    if(
      !organizationName
    ) {

      return j(
        {
          success:
            false,

          error:
            "Organization name is required."
        },
        400
      );
    }

    const statuses =
      new Set([
        "lead",
        "contacted",
        "demo",
        "trial",
        "offer-sent",
        "won",
        "lost"
      ]);

    const status =
      statuses.has(
        String(
          body.status ||
          ""
        )
      )
        ? String(
            body.status
          )
        : "lead";

    const id =
      Number(
        body.id ||
        0
      );

    const now =
      Date.now();


    if(
      id
    ) {

      const owned =
        await env
          .TRANSLATIONS_DB
          .prepare(`
            SELECT id
            FROM promoter_leads
            WHERE
              id = ?
              AND promoter_id = ?
            LIMIT 1
          `)
          .bind(
            id,
            promoterId
          )
          .first();

      if(
        !owned
      ) {

        return j(
          {
            success:
              false,

            error:
              "Lead not found."
          },
          404
        );
      }

      await env
        .TRANSLATIONS_DB
        .prepare(`
          UPDATE promoter_leads
          SET
            organization_name = ?,
            contact_name = ?,
            email = ?,
            phone = ?,
            status = ?,
            notes = ?,
            updated_at = ?
          WHERE
            id = ?
            AND promoter_id = ?
        `)
        .bind(
          organizationName,
          text(
            body.contactName,
            200
          ),
          text(
            body.email,
            250
          ),
          text(
            body.phone,
            100
          ),
          status,
          text(
            body.notes,
            2500
          ),
          now,
          id,
          promoterId
        )
        .run();

    } else {

      await env
        .TRANSLATIONS_DB
        .prepare(`
          INSERT INTO promoter_leads (
            promoter_id,
            organization_name,
            contact_name,
            email,
            phone,
            status,
            notes,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `)
        .bind(
          promoterId,
          organizationName,
          text(
            body.contactName,
            200
          ),
          text(
            body.email,
            250
          ),
          text(
            body.phone,
            100
          ),
          status,
          text(
            body.notes,
            2500
          ),
          now,
          now
        )
        .run();
    }

    return j({
      success:
        true
    });
  }


  /*
  =========================================================
  PROMOTER PLAN REQUESTS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/plan-requests"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_plan_requests
          WHERE promoter_id = ?
          ORDER BY created_at DESC
        `)
        .bind(
          promoterId
        )
        .all();

    return j({

      success:
        true,

      requests:
        (
          result.results ||
          []
        )
          .map(
            planJson
          )
    });
  }


  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter/plan-request-save"
  ) {

    const body =
      await request.json();

    const planName =
      text(
        body.planName,
        200
      );

    if(
      !planName
    ) {

      return j(
        {
          success:
            false,

          error:
            "Plan name is required."
        },
        400
      );
    }

    const features =
      Array.isArray(
        body.features
      )
        ? body.features
            .map(
              value =>
                text(
                  value,
                  250
                )
            )
            .filter(
              Boolean
            )
            .slice(
              0,
              40
            )
        : [];

    const now =
      Date.now();

    await env
      .TRANSLATIONS_DB
      .prepare(`
        INSERT INTO promoter_plan_requests (
          promoter_id,
          plan_name,
          plan_code,
          description,
          price_cents,
          currency,
          billing_interval,
          included_minutes,
          viewer_limit,
          features_json,
          note,
          status,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          'pending', ?, ?
        )
      `)
      .bind(
        promoterId,

        planName,

        code(
          body.planCode ||
          planName
        ),

        text(
          body.description,
          1500
        ),

        Math.max(
          0,
          Math.round(
            Number(
              body.priceCents ||
              0
            )
          )
        ),

        String(
          body.currency ||
          "CAD"
        )
          .toUpperCase() ===
          "USD"
          ? "USD"
          : "CAD",

        String(
          body.billingInterval ||
          "month"
        ) ===
          "year"
          ? "year"
          : "month",

        Math.max(
          0,
          Math.round(
            Number(
              body.includedMinutes ||
              0
            )
          )
        ),

        Math.max(
          1,
          Math.round(
            Number(
              body.viewerLimit ||
              1
            )
          )
        ),

        JSON.stringify(
          features
        ),

        text(
          body.note,
          1500
        ),

        now,
        now
      )
      .run();

    return j({
      success:
        true
    });
  }


  /*
  =========================================================
  PROMOTER SHARE OFFER
  =========================================================
  */

  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter/offer-create"
  ) {

    const body =
      await request.json();

    const requestId =
      Number(
        body.planRequestId ||
        0
      );

    const plan =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            pr.id AS request_id,
            pr.approved_plan_id,
            p.*
          FROM promoter_plan_requests pr
          INNER JOIN plans p
            ON p.id =
              pr.approved_plan_id
          WHERE
            pr.id = ?
            AND pr.promoter_id = ?
            AND pr.status = 'approved'
            AND p.active = 1
          LIMIT 1
        `)
        .bind(
          requestId,
          promoterId
        )
        .first();

    if(
      !plan
    ) {

      return j(
        {
          success:
            false,

          error:
            "Only your own approved plans can be shared."
        },
        403
      );
    }

    if(
      !text(
        plan.stripe_price_id,
        300
      )
    ) {

      return j(
        {
          success:
            false,

          error:
            "This approved plan is not connected to Stripe yet."
        },
        409
      );
    }

    const singleUse =
      body.singleUse !==
      false;

    const maxRedemptions =
      singleUse
        ? 1
        : Math.max(
            1,
            Math.min(
              1000,
              Math.round(
                Number(
                  body.maxRedemptions ||
                  1
                )
              )
            )
          );

    const expiration =
      Math.max(
        0,
        Number(
          body.expirationTimestamp ||
          0
        )
      );

    if(
      expiration &&
      expiration <=
        Date.now()
    ) {

      return j(
        {
          success:
            false,

          error:
            "Expiration must be in the future."
        },
        400
      );
    }

    const offerToken =
      randomToken(
        32
      );

    const now =
      Date.now();

    await env
      .TRANSLATIONS_DB
      .batch([

        env
          .TRANSLATIONS_DB
          .prepare(`
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
            VALUES (
              ?, ?, ?, ?, ?, ?, ?, 0, ?,
              'active', ?, ?, ?, NULL
            )
          `)
          .bind(
            offerToken,

            Number(
              plan.id
            ),

            text(
              plan.plan_code,
              120
            ),

            text(
              body.recipientName,
              250
            ),

            text(
              body.recipientEmail,
              250
            )
              .toLowerCase(),

            expiration ||
            null,

            maxRedemptions,

            singleUse
              ? 1
              : 0,

            text(
              body.note,
              1500
            ),

            "promoter:" +
            text(
              promoter
                .promoter_code,
              100
            ),

            now
          ),

        env
          .TRANSLATIONS_DB
          .prepare(`
            INSERT INTO promoter_offer_links (
              promoter_id,
              plan_request_id,
              plan_id,
              offer_token,
              created_at
            )
            VALUES (
              ?, ?, ?, ?, ?
            )
          `)
          .bind(
            promoterId,
            requestId,
            Number(
              plan.id
            ),
            offerToken,
            now
          )
      ]);

    return j({

      success:
        true,

      offerToken
    });
  }


  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/offers"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            pol.*,
            o.recipient_name,
            o.recipient_email,
            o.expiration_timestamp,
            o.max_redemptions,
            o.redemption_count,
            o.status,
            o.note,
            p.plan_name,
            p.plan_code,
            p.price_cents,
            p.currency,
            p.billing_interval

          FROM promoter_offer_links pol

          INNER JOIN offers o
            ON o.token =
              pol.offer_token

          INNER JOIN plans p
            ON p.id =
              pol.plan_id

          WHERE
            pol.promoter_id = ?

          ORDER BY
            pol.created_at DESC
        `)
        .bind(
          promoterId
        )
        .all();

    return j({

      success:
        true,

      offers:
        result.results ||
        []
    });
  }


  /*
  =========================================================
  PROMOTER CLIENTS - READ ONLY
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/clients"
  ) {

    try {

      const result =
        await env
          .TRANSLATIONS_DB
          .prepare(`
            SELECT
              pc.*,
              o.organization_name,
              o.account_holder,
              o.email,
              o.account_email,
              o.phone,
              o.room_name,
              o.plan_code,
              o.plan_name,
              o.account_status,
              o.billing_status,
              o.included_minutes,
              o.used_minutes,
              o.bonus_minutes,
              o.viewer_limit

            FROM promoter_clients pc

            INNER JOIN organizations o
              ON o.id =
                pc.organization_id

            WHERE
              pc.promoter_id = ?
              AND pc.active = 1

            ORDER BY
              pc.landed_at DESC
          `)
          .bind(
            promoterId
          )
          .all();

      return j({

        success:
          true,

        clients:
          result.results ||
          []
      });

    } catch {

      return j({

        success:
          true,

        clients:
          []
      });
    }
  }


  /*
  =========================================================
  PROMOTER COMMISSIONS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/commissions"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_commissions
          WHERE promoter_id = ?
          ORDER BY earned_at DESC
        `)
        .bind(
          promoterId
        )
        .all();

    return j({

      success:
        true,

      commissions:
        result.results ||
        []
    });
  }


  /*
  =========================================================
  PROMOTER CHANGE REQUESTS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter/change-requests"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_change_requests
          WHERE promoter_id = ?
          ORDER BY created_at DESC
        `)
        .bind(
          promoterId
        )
        .all();

    return j({

      success:
        true,

      requests:
        result.results ||
        []
    });
  }


  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter/change-request"
  ) {

    const body =
      await request.json();

    const organizationId =
      Number(
        body.organizationId ||
        0
      );

    const owned =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT id
          FROM promoter_clients
          WHERE
            promoter_id = ?
            AND organization_id = ?
            AND active = 1
          LIMIT 1
        `)
        .bind(
          promoterId,
          organizationId
        )
        .first();

    if(
      !owned
    ) {

      return j(
        {
          success:
            false,

          error:
            "You can only request changes for your own clients."
        },
        403
      );
    }

    const requestType =
      text(
        body.requestType,
        120
      );

    const details =
      text(
        body.details,
        3000
      );

    if(
      !requestType ||
      !details
    ) {

      return j(
        {
          success:
            false,

          error:
            "Request type and details are required."
        },
        400
      );
    }

    const now =
      Date.now();

    await env
      .TRANSLATIONS_DB
      .prepare(`
        INSERT INTO promoter_change_requests (
          promoter_id,
          organization_id,
          request_type,
          details,
          status,
          created_at,
          updated_at
        )
        VALUES (
          ?, ?, ?, ?, 'pending', ?, ?
        )
      `)
      .bind(
        promoterId,
        organizationId,
        requestType,
        details,
        now,
        now
      )
      .run();

    return j({
      success:
        true
    });
  }


  return j(
    {
      success:
        false,

      error:
        "Promoter route not found."
    },
    404
  );
}


async function adminRoutes(
  request,
  env,
  url
) {

  await ensureSchema(
    env
  );

  const auth =
    await verifyAdmin(
      request
    );


  /*
  =========================================================
  ADMIN AUTH CHECK
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter-admin/me"
  ) {

    return j({

      success:
        true,

      admin:
        auth.admin
    });
  }


  /*
  =========================================================
  ADMIN - PROMOTERS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter-admin/promoters"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            p.*,

            (
              SELECT
                COUNT(*)
              FROM promoter_clients pc
              WHERE
                pc.promoter_id =
                  p.id
                AND pc.active = 1
            ) AS client_count,

            (
              SELECT
                COUNT(*)
              FROM promoter_plan_requests pr
              WHERE
                pr.promoter_id =
                  p.id
                AND pr.status =
                  'pending'
            ) AS pending_plan_count,

            (
              SELECT
                COALESCE(
                  SUM(
                    commission_cents
                  ),
                  0
                )
              FROM promoter_commissions c
              WHERE
                c.promoter_id =
                  p.id
                AND c.status IN (
                  'pending',
                  'payable'
                )
            ) AS unpaid_commission_cents

          FROM promoter_users p

          ORDER BY
            p.created_at DESC
        `)
        .all();

    return j({

      success:
        true,

      promoters:
        (
          result.results ||
          []
        )
          .map(
            row => ({

              ...promoterJson(
                row
              ),

              clientCount:
                Number(
                  row.client_count ||
                  0
                ),

              pendingPlanCount:
                Number(
                  row.pending_plan_count ||
                  0
                ),

              unpaidCommissionCents:
                Number(
                  row.unpaid_commission_cents ||
                  0
                )
            })
          )
    });
  }


  /*
  =========================================================
  ADMIN - CREATE PROMOTER
  =========================================================
  */

  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter-admin/promoter-create"
  ) {

    const body =
      await request.json();

    const displayName =
      text(
        body.displayName,
        200
      );

    if(
      !displayName
    ) {

      return j(
        {
          success:
            false,

          error:
            "Promoter name is required."
        },
        400
      );
    }

    let promoterCode =
      code(
        body.promoterCode ||
        displayName
      )
        .replace(
          /-/g,
          ""
        )
        .toUpperCase()
        .substring(
          0,
          18
        );

    if(
      !promoterCode
    ) {

      promoterCode =
        "PROMO" +
        randomToken(
          3
        )
          .toUpperCase();
    }

    const duplicate =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT id
          FROM promoter_users
          WHERE promoter_code = ?
          LIMIT 1
        `)
        .bind(
          promoterCode
        )
        .first();

    if(
      duplicate
    ) {

      promoterCode =
        (
          promoterCode
            .substring(
              0,
              12
            ) +
          randomToken(
            3
          )
        )
          .toUpperCase();
    }

    const inviteToken =
      randomToken(
        24
      );

    const now =
      Date.now();

    await env
      .TRANSLATIONS_DB
      .prepare(`
        INSERT INTO promoter_users (
          clerk_user_id,
          display_name,
          email,
          phone,
          promoter_code,
          invite_token,
          active,
          monthly_commission_percent,
          annual_commission_percent,
          commission_hold_days,
          notes,
          created_at,
          updated_at
        )
        VALUES (
          '',
          ?,
          ?,
          ?,
          ?,
          ?,
          1,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?
        )
      `)
      .bind(

        displayName,

        text(
          body.email,
          250
        ),

        text(
          body.phone,
          100
        ),

        promoterCode,

        inviteToken,

        Math.max(
          0,
          Math.min(
            100,
            Number(
              body
                .monthlyCommissionPercent ??
              25
            )
          )
        ),

        Math.max(
          0,
          Math.min(
            100,
            Number(
              body
                .annualCommissionPercent ??
              15
            )
          )
        ),

        Math.max(
          0,
          Math.min(
            180,
            Math.round(
              Number(
                body
                  .commissionHoldDays ??
                30
              )
            )
          )
        ),

        text(
          body.notes,
          2000
        ),

        now,
        now
      )
      .run();

    const promoter =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_users
          WHERE invite_token = ?
          LIMIT 1
        `)
        .bind(
          inviteToken
        )
        .first();

    return j({

      success:
        true,

      promoter:
        promoterJson(
          promoter
        ),

      inviteToken
    });
  }


  /*
  =========================================================
  ADMIN - UPDATE PROMOTER
  =========================================================
  */

  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter-admin/promoter-update"
  ) {

    const body =
      await request.json();

    const id =
      Number(
        body.id ||
        0
      );

    const existing =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_users
          WHERE id = ?
          LIMIT 1
        `)
        .bind(
          id
        )
        .first();

    if(
      !existing
    ) {

      return j(
        {
          success:
            false,

          error:
            "Promoter not found."
        },
        404
      );
    }

    await env
      .TRANSLATIONS_DB
      .prepare(`
        UPDATE promoter_users
        SET
          display_name = ?,
          email = ?,
          phone = ?,
          active = ?,
          monthly_commission_percent = ?,
          annual_commission_percent = ?,
          commission_hold_days = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(

        text(
          body.displayName ??
          existing.display_name,
          200
        ),

        text(
          body.email ??
          existing.email,
          250
        ),

        text(
          body.phone ??
          existing.phone,
          100
        ),

        body.active ===
          false
          ? 0
          : 1,

        Math.max(
          0,
          Math.min(
            100,
            Number(
              body
                .monthlyCommissionPercent ??
              existing
                .monthly_commission_percent
            )
          )
        ),

        Math.max(
          0,
          Math.min(
            100,
            Number(
              body
                .annualCommissionPercent ??
              existing
                .annual_commission_percent
            )
          )
        ),

        Math.max(
          0,
          Math.min(
            180,
            Math.round(
              Number(
                body
                  .commissionHoldDays ??
                existing
                  .commission_hold_days
              )
            )
          )
        ),

        text(
          body.notes ??
          existing.notes,
          2000
        ),

        Date.now(),

        id
      )
      .run();

    return j({
      success:
        true
    });
  }


  /*
  =========================================================
  ADMIN - LIST PROMOTER PLAN REQUESTS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter-admin/plan-requests"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            pr.*,
            p.display_name
              AS promoter_name,
            p.promoter_code

          FROM promoter_plan_requests pr

          INNER JOIN promoter_users p
            ON p.id =
              pr.promoter_id

          ORDER BY
            CASE
              WHEN pr.status =
                'pending'
              THEN 0
              ELSE 1
            END,
            pr.created_at DESC
        `)
        .all();

    return j({

      success:
        true,

      requests:
        (
          result.results ||
          []
        )
          .map(
            planJson
          )
    });
  }


  /*
  =========================================================
  ADMIN - APPROVE / REJECT PROMOTER PLAN
  =========================================================
  */

  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter-admin/plan-request-review"
  ) {

    const body =
      await request.json();

    const requestId =
      Number(
        body.requestId ||
        0
      );

    const action =
      String(
        body.action ||
        ""
      );

    const row =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM promoter_plan_requests
          WHERE id = ?
          LIMIT 1
        `)
        .bind(
          requestId
        )
        .first();

    if(
      !row
    ) {

      return j(
        {
          success:
            false,

          error:
            "Plan request not found."
        },
        404
      );
    }

    if(
      row.status !==
        "pending"
    ) {

      return j(
        {
          success:
            false,

          error:
            "This plan request has already been reviewed."
        },
        409
      );
    }


    if(
      action ===
      "reject"
    ) {

      await env
        .TRANSLATIONS_DB
        .prepare(`
          UPDATE promoter_plan_requests
          SET
            status = 'rejected',
            admin_feedback = ?,
            reviewed_by = ?,
            reviewed_at = ?,
            updated_at = ?
          WHERE id = ?
        `)
        .bind(
          text(
            body.adminFeedback,
            1500
          ),
          auth.clerkUserId,
          Date.now(),
          Date.now(),
          requestId
        )
        .run();

      return j({

        success:
          true,

        status:
          "rejected"
      });
    }


    if(
      action !==
      "approve"
    ) {

      return j(
        {
          success:
            false,

          error:
            "Action must be approve or reject."
        },
        400
      );
    }


    let planCode =
      code(
        body.planCode ||
        row.plan_code ||
        row.plan_name
      );


    const duplicate =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT id
          FROM plans
          WHERE plan_code = ?
          LIMIT 1
        `)
        .bind(
          planCode
        )
        .first();


    if(
      duplicate
    ) {

      planCode +=
        "-" +
        requestId;
    }


    const approved = {

      ...row,

      plan_code:
        planCode,

      plan_name:
        text(
          body.planName ||
          row.plan_name,
          200
        ),

      description:
        text(
          body.description ??
          row.description,
          1500
        ),

      price_cents:
        Math.max(
          0,
          Math.round(
            Number(
              body.priceCents ??
              row.price_cents
            )
          )
        ),

      currency:
        String(
          body.currency ||
          row.currency ||
          "CAD"
        )
          .toUpperCase() ===
          "USD"
          ? "USD"
          : "CAD",

      billing_interval:
        String(
          body.billingInterval ||
          row.billing_interval ||
          "month"
        ) ===
          "year"
          ? "year"
          : "month",

      included_minutes:
        Math.max(
          0,
          Math.round(
            Number(
              body.includedMinutes ??
              row.included_minutes
            )
          )
        ),

      viewer_limit:
        Math.max(
          1,
          Math.round(
            Number(
              body.viewerLimit ??
              row.viewer_limit
            )
          )
        )
    };


    /*
      Stripe Product + Price are created
      ONLY after Site Admin approves.
    */

    const stripe =
      await createStripePlan(
        env,
        approved
      );


    const now =
      Date.now();


    await env
      .TRANSLATIONS_DB
      .prepare(`
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
        VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          0,
          1,
          999,
          ?,
          ?,
          1,
          ?,
          ?,
          ?
        )
      `)
      .bind(
        approved.plan_code,
        approved.plan_name,
        approved.description,
        approved.price_cents,
        approved.currency,
        approved.billing_interval,
        approved.included_minutes,
        approved.viewer_limit,
        stripe.productId,
        stripe.priceId,
        String(
          row.features_json ||
          "[]"
        ),
        now,
        now
      )
      .run();


    const plan =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT *
          FROM plans
          WHERE plan_code = ?
          LIMIT 1
        `)
        .bind(
          approved.plan_code
        )
        .first();


    await env
      .TRANSLATIONS_DB
      .prepare(`
        UPDATE promoter_plan_requests
        SET
          plan_code = ?,
          plan_name = ?,
          description = ?,
          price_cents = ?,
          currency = ?,
          billing_interval = ?,
          included_minutes = ?,
          viewer_limit = ?,
          status = 'approved',
          approved_plan_id = ?,
          admin_feedback = ?,
          reviewed_by = ?,
          reviewed_at = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        approved.plan_code,
        approved.plan_name,
        approved.description,
        approved.price_cents,
        approved.currency,
        approved.billing_interval,
        approved.included_minutes,
        approved.viewer_limit,
        Number(
          plan.id
        ),
        text(
          body.adminFeedback,
          1500
        ),
        auth.clerkUserId,
        now,
        now,
        requestId
      )
      .run();


    return j({

      success:
        true,

      status:
        "approved",

      plan: {

        id:
          Number(
            plan.id
          ),

        planCode:
          plan.plan_code,

        planName:
          plan.plan_name
      }
    });
  }


  /*
  =========================================================
  ADMIN - CHANGE REQUESTS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter-admin/change-requests"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            cr.*,
            p.display_name
              AS promoter_name,
            p.promoter_code

          FROM promoter_change_requests cr

          INNER JOIN promoter_users p
            ON p.id =
              cr.promoter_id

          ORDER BY
            CASE
              WHEN cr.status =
                'pending'
              THEN 0
              ELSE 1
            END,
            cr.created_at DESC
        `)
        .all();

    return j({

      success:
        true,

      requests:
        result.results ||
        []
    });
  }


  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter-admin/change-request-review"
  ) {

    const body =
      await request.json();

    const status =
      String(
        body.status ||
        ""
      );

    if(
      ![
        "approved",
        "rejected",
        "completed"
      ]
        .includes(
          status
        )
    ) {

      return j(
        {
          success:
            false,

          error:
            "Invalid request status."
        },
        400
      );
    }

    await env
      .TRANSLATIONS_DB
      .prepare(`
        UPDATE promoter_change_requests
        SET
          status = ?,
          admin_response = ?,
          reviewed_at = ?,
          reviewed_by = ?,
          updated_at = ?
        WHERE id = ?
      `)
      .bind(
        status,

        text(
          body.adminResponse,
          2000
        ),

        Date.now(),

        auth.clerkUserId,

        Date.now(),

        Number(
          body.requestId ||
          0
        )
      )
      .run();

    return j({
      success:
        true
    });
  }


  /*
  =========================================================
  ADMIN - COMMISSIONS
  =========================================================
  */

  if(
    request.method ===
      "GET" &&
    url.pathname ===
      "/promoter-admin/commissions"
  ) {

    const result =
      await env
        .TRANSLATIONS_DB
        .prepare(`
          SELECT
            c.*,
            p.display_name
              AS promoter_name

          FROM promoter_commissions c

          INNER JOIN promoter_users p
            ON p.id =
              c.promoter_id

          ORDER BY
            c.earned_at DESC
        `)
        .all();

    return j({

      success:
        true,

      commissions:
        result.results ||
        []
    });
  }


  if(
    request.method ===
      "POST" &&
    url.pathname ===
      "/promoter-admin/commission-status"
  ) {

    const body =
      await request.json();

    const status =
      String(
        body.status ||
        ""
      );

    if(
      ![
        "pending",
        "payable",
        "paid",
        "reversed"
      ]
        .includes(
          status
        )
    ) {

      return j(
        {
          success:
            false,

          error:
            "Invalid commission status."
        },
        400
      );
    }

    await env
      .TRANSLATIONS_DB
      .prepare(`
        UPDATE promoter_commissions

        SET
          status = ?,

          paid_at =
            CASE
              WHEN ? = 'paid'
              THEN ?
              ELSE paid_at
            END,

          notes =
            CASE
              WHEN ? != ''
              THEN ?
              ELSE notes
            END

        WHERE id = ?
      `)
      .bind(
        status,
        status,
        Date.now(),

        text(
          body.notes,
          1500
        ),

        text(
          body.notes,
          1500
        ),

        Number(
          body.id ||
          0
        )
      )
      .run();

    return j({
      success:
        true
    });
  }


  return j(
    {
      success:
        false,

      error:
        "Promoter admin route not found."
    },
    404
  );
}


export async function handlePromoterRequest(
  request,
  env
) {

  const url =
    new URL(
      request.url
    );

  const promoterPath =
    url.pathname
      .startsWith(
        "/promoter/"
      );

  const adminPath =
    url.pathname
      .startsWith(
        "/promoter-admin/"
      );


  /*
    If this is not a promoter request,
    return null and allow the existing
    LiveBridge backend to handle it.
  */

  if(
    !promoterPath &&
    !adminPath
  ) {
    return null;
  }


  if(
    request.method ===
      "OPTIONS"
  ) {

    return new Response(
      null,
      {
        status:
          204,

        headers:
          CORS
      }
    );
  }


  try {

    if(
      adminPath
    ) {

      return await adminRoutes(
        request,
        env,
        url
      );
    }

    return await promoterRoutes(
      request,
      env,
      url
    );

  } catch(
    error
  ) {

    console.error(
      "LiveBridge promoter API failed:",
      error
    );

    return j(
      {
        success:
          false,

        error:
          error?.message ||
          "Promoter request failed."
      },
      403
    );
  }
}
