
/*
 * LiveBridge ministry partnerships and beta acceptance.
 * These admin-only tables layer over existing organization accounts without
 * changing Clerk, Stripe, room identity, or existing usage entitlements.
 */
export const BETA_AGREEMENT_VERSION = "2026-10-30-v1";
const TYPES = ["ministry_gift", "founding_ministry_partner", "standard_customer"];

const reply = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  }
});

export async function ensureMinistrySchema(env) {
  const db = env.TRANSLATIONS_DB;
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ministry_parent_organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ministry_campuses (
      organization_id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      campus_name TEXT NOT NULL DEFAULT '',
      partnership_type TEXT NOT NULL DEFAULT 'standard_customer'
        CHECK (partnership_type IN ('ministry_gift','founding_ministry_partner','standard_customer')),
      discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent BETWEEN 0 AND 100),
      agreed_monthly_cents INTEGER,
      pricing_notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (organization_id) REFERENCES organizations(id),
      FOREIGN KEY (parent_id) REFERENCES ministry_parent_organizations(id)
    )
  `).run();
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_ministry_campuses_parent
    ON ministry_campuses (parent_id)
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ministry_offer_assignments (
      token TEXT PRIMARY KEY,
      parent_id INTEGER,
      campus_name TEXT NOT NULL DEFAULT '',
      partnership_type TEXT NOT NULL DEFAULT 'standard_customer',
      discount_percent INTEGER NOT NULL DEFAULT 0,
      agreed_monthly_cents INTEGER,
      pricing_notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES ministry_parent_organizations(id)
    )
  `).run();
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS beta_agreement_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      organization_id INTEGER NOT NULL,
      clerk_user_id TEXT NOT NULL,
      agreement_version TEXT NOT NULL,
      accepted_at INTEGER NOT NULL,
      client_declared_at INTEGER,
      user_agent TEXT NOT NULL DEFAULT '',
      acceptance_source TEXT NOT NULL DEFAULT 'signup',
      UNIQUE (organization_id, clerk_user_id, agreement_version),
      FOREIGN KEY (organization_id) REFERENCES organizations(id)
    )
  `).run();
}

function normalizedTerms(value) {
  const type = String(value || "standard_customer");
  if (!TYPES.includes(type)) throw new Error("Invalid ministry partnership classification.");
  return type;
}
function normalizeAssignment(body) {
  const type = normalizedTerms(body.partnershipType);
  const parentId = body.parentId == null || body.parentId === ""
    ? null : Number(body.parentId);
  if (parentId !== null && (!Number.isSafeInteger(parentId) || parentId < 1)) {
    throw new Error("Choose a valid parent organization.");
  }
  const campusName = String(body.campusName || "").trim().slice(0, 120);
  if (parentId && !campusName) throw new Error("Campus name is required when assigning a parent.");
  const percent = type === "ministry_gift" ? 100 : Number(body.discountPercent ?? 0);
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new Error("Discount must be between 0 and 100 percent.");
  }
  const cents = type === "ministry_gift" ? 0 :
    (body.agreedMonthlyCents === "" || body.agreedMonthlyCents == null
      ? null : Number(body.agreedMonthlyCents));
  if (cents !== null && (!Number.isSafeInteger(cents) || cents < 0)) {
    throw new Error("Monthly price must be a nonnegative number of cents.");
  }
  return {
    parentId, campusName, type, percent, cents,
    notes: String(body.pricingNotes || "").trim().slice(0, 2000)
  };
}
async function assertParent(env, parentId) {
  if (!parentId) return;
  const parent = await env.TRANSLATIONS_DB.prepare(
    "SELECT id FROM ministry_parent_organizations WHERE id = ?"
  ).bind(parentId).first();
  if (!parent) throw new Error("Parent organization no longer exists.");
}

export async function saveMinistryOfferAssignment(env, token, input) {
  const a = normalizeAssignment(input);
  if (!a.parentId && !a.campusName && a.type === "standard_customer" &&
      a.percent === 0 && a.cents === null && !a.notes) return;
  await ensureMinistrySchema(env);
  await assertParent(env, a.parentId);
  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO ministry_offer_assignments
      (token, parent_id, campus_name, partnership_type, discount_percent,
       agreed_monthly_cents, pricing_notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(token, a.parentId, a.campusName, a.type, a.percent,
    a.cents, a.notes, Date.now()).run();
}

export async function assignMinistryCampusFromOffer(env, token, organizationId) {
  if (!token || !organizationId) return;
  await ensureMinistrySchema(env);
  const row = await env.TRANSLATIONS_DB.prepare(
    "SELECT * FROM ministry_offer_assignments WHERE token = ?"
  ).bind(token).first();
  if (!row) return;
  const exists = await env.TRANSLATIONS_DB.prepare(
    "SELECT id FROM organizations WHERE id = ?"
  ).bind(organizationId).first();
  if (!exists) return;
  await env.TRANSLATIONS_DB.prepare(`
    INSERT INTO ministry_campuses
      (organization_id, parent_id, campus_name, partnership_type,
       discount_percent, agreed_monthly_cents, pricing_notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id) DO NOTHING
  `).bind(organizationId, row.parent_id, row.campus_name,
    row.partnership_type, row.discount_percent, row.agreed_monthly_cents,
    row.pricing_notes, Date.now(), Date.now()).run();
}

/* Look up only the actual account ID; no name-based free access is granted. */
export async function isGiftedMinistry(env, organizationId) {
  if (!Number.isSafeInteger(Number(organizationId)) || Number(organizationId) <= 0) return false;
  try {
    const row = await env.TRANSLATIONS_DB.prepare(
      "SELECT partnership_type FROM ministry_campuses WHERE organization_id = ?"
    ).bind(Number(organizationId)).first();
    return row?.partnership_type === "ministry_gift";
  } catch (error) {
    if (/no such table/i.test(String(error?.message || ""))) return false;
    throw error;
  }
}

export async function recordBetaAcceptance(env, organizationId, clerkUserId, input, request) {
  if (!organizationId || !clerkUserId) throw new Error("Account identity is required for beta acceptance.");
  if (input.betaAgreementAccepted !== true ||
      input.betaAgreementVersion !== BETA_AGREEMENT_VERSION) {
    throw new Error("You must accept the current LiveBridge Beta Participation Agreement.");
  }
  await ensureMinistrySchema(env);
  await env.TRANSLATIONS_DB.prepare(`
    INSERT OR IGNORE INTO beta_agreement_acceptances
      (organization_id, clerk_user_id, agreement_version, accepted_at,
       client_declared_at, user_agent, acceptance_source)
    VALUES (?, ?, ?, ?, ?, ?, 'signup')
  `).bind(organizationId, clerkUserId, BETA_AGREEMENT_VERSION,
    Date.now(), Number(input.betaAgreementAcceptedAt || 0) || null,
    String(request.headers.get("User-Agent") || "").slice(0, 500)).run();
}

export async function ministryAdminRoute(request, env, verifyAdminRequest) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/admin/ministry-")) return null;
  if (request.method !== "GET" && request.method !== "POST") return reply({success:false,error:"Method not allowed."},405);
  try {
    await verifyAdminRequest(request, env);
    await ensureMinistrySchema(env);
    const db = env.TRANSLATIONS_DB;
    const now = Date.now();

    if (request.method === "GET" && url.pathname === "/admin/ministry-overview") {
      const [parents, campuses, acceptances] = await Promise.all([
        db.prepare("SELECT * FROM ministry_parent_organizations ORDER BY name").all(),
        db.prepare(`
          SELECT mc.*, o.organization_name, o.room_name, o.used_minutes
          FROM ministry_campuses mc
          JOIN organizations o ON o.id = mc.organization_id
          ORDER BY mc.parent_id, mc.campus_name
        `).all(),
        db.prepare(`
          SELECT organization_id, agreement_version, accepted_at
          FROM beta_agreement_acceptances
          WHERE agreement_version = ?
        `).bind(BETA_AGREEMENT_VERSION).all()
      ]);
      return reply({
        success:true,
        agreementVersion:BETA_AGREEMENT_VERSION,
        parents:parents.results || [],
        campuses:campuses.results || [],
        acceptances:acceptances.results || []
      });
    }

    if (request.method === "POST" && url.pathname === "/admin/ministry-parent-save") {
      const body = await request.json();
      const name = String(body.name || "").trim().slice(0, 120);
      if (!name) return reply({success:false,error:"Parent organization name is required."},400);
      const notes = String(body.notes || "").trim().slice(0, 2000);
      const id = Number(body.id || 0);
      if (id) {
        const result = await db.prepare(`
          UPDATE ministry_parent_organizations SET name=?, notes=?, updated_at=? WHERE id=?
        `).bind(name,notes,now,id).run();
        if (!result.meta?.changes) return reply({success:false,error:"Parent organization not found."},404);
      } else {
        await db.prepare(`
          INSERT INTO ministry_parent_organizations (name, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `).bind(name,notes,now,now).run();
      }
      return reply({success:true});
    }

    if (request.method === "POST" && url.pathname === "/admin/ministry-campus-save") {
      const body = await request.json();
      const organizationId = Number(body.organizationId || 0);
      if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
        return reply({success:false,error:"Choose an account."},400);
      }
      const exists = await db.prepare("SELECT id FROM organizations WHERE id = ?")
        .bind(organizationId).first();
      if (!exists) return reply({success:false,error:"Account not found."},404);
      const a = normalizeAssignment(body);
      await assertParent(env,a.parentId);
      await db.prepare(`
        INSERT INTO ministry_campuses
          (organization_id,parent_id,campus_name,partnership_type,discount_percent,
           agreed_monthly_cents,pricing_notes,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?)
        ON CONFLICT(organization_id) DO UPDATE SET
          parent_id=excluded.parent_id,
          campus_name=excluded.campus_name,
          partnership_type=excluded.partnership_type,
          discount_percent=excluded.discount_percent,
          agreed_monthly_cents=excluded.agreed_monthly_cents,
          pricing_notes=excluded.pricing_notes,
          updated_at=excluded.updated_at
      `).bind(organizationId,a.parentId,a.campusName,a.type,a.percent,
        a.cents,a.notes,now,now).run();
      return reply({success:true});
    }
    return reply({success:false,error:"Unknown ministry admin operation."},404);
  } catch (error) {
    const message = String(error?.message || error);
    return reply({success:false,error:message}, /not found/i.test(message)?404:400);
  }
}
