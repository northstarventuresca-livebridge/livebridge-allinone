# LiveBridge — Ministry parent organizations, campus partnerships and beta consent

## Included
- Admin-only parent organizations and campus assignment in Client Accounts.
- Parent-level rollup of each campus's broadcast hours, listener sessions, monthly estimated API cost and broadcast counts.
- Types: Ministry Gift, Founding Ministry Partner, Standard Customer.
- Campus-specific discount and agreed monthly rate metadata. The actual amount charged is always determined by the Stripe plan/subscription, **not** the metadata.
- Private-offer creator includes parent/campus/type/discount. Single-use invites auto-link the newly registered campus to its parent after a verified Stripe checkout.
- Ministry Gift invitations are rejected unless the selected Stripe plan is $0.
- Versioned, separately checked Beta Participation Agreement on signup, including invitations. Server refuses new account-sync without a valid acceptance and stores authenticated user, version, time and user-agent.
- Gifted campuses bypass broadcast minutes cutoffs in the server's broadcast-start, heartbeat, and Durable Object watchdog paths. Other usage counts continue for reporting.

## Setup after review
1. Open LiveBridge Admin → Client Accounts. Create a parent named **Home Church**.
2. Open the existing **Home Church Red Deer** account (verify the exact account and room before changing anything), set parent Home Church, campus Red Deer, type **Ministry Gift**, then save. Confirm any existing Stripe subscription is $0/cancelled separately; the classification **never** changes Stripe billing by itself.
3. Under Plans, select an active, $0 private beta plan and create a **single-use** private offer. Set parent Home Church, campus Calgary, and type Founding Ministry Partner. Share the offer with Pastor Berni via Stacy.
4. Calgary signup must check both the general Terms/Privacy acceptance and the Beta Agreement. Verify the resulting campus and acceptance record in Admin.
5. Decide Calgary's post-beta paid plan with explicit consent before beta ends. Do not assume a discount metadata label changes the actual Stripe invoice.

## Quality assurance checklist before deploying
- Old accounts continue to sign in; no existing organization ID, room or Stripe object is migrated or overwritten.
- Admin APIs reject non-admin requests.
- Parent creation validates names and respects uniqueness.
- Two campuses can belong to one parent but maintain separate authentication, room, usage and Stripe arrangements.
- 75% discount on a campus is recorded correctly but does not silently update Stripe.
- Ministry Gift admin classification does not modify an existing paid Stripe subscription (manual billing review required).
- $0 gift invite succeeds, paid gift invite fails, and a campus-assigned multi-redemption invite fails.
- Declining beta terms blocks registration. Tampered/missing consent body is rejected by /account-sync.
- Signed-up organization has an acceptance row with the current agreement version.
- Unlimited gift broadcaster isn't rejected by preflight, broadcast-start, heartbeat or watchdog after its nominal plan quota is reached.
- Recheck broadcaster UI, mobile signup and QR-based offer links on staging.

## Release gate
The beta agreement is a **draft**, not a substitute for counsel. Obtain Alberta legal review (liability allocation, privacy/consents, electronic contracting, and insurance fit) **before releasing this signup gate to production**. Do not automatically start billing churches when beta ends.
