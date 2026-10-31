# Optional password login pilot — preview only

Existing Clerk email-code login continues. The account page offers optional password login with email-code fallback.
Admin enables it per organization in Client Accounts > Organization > Password Sign-in (off by default).
Once enabled, the account dashboard's Password & Security opens Clerk's secure password management.
Clerk verifies the password; LiveBridge checks the authenticated account's opt-in before allowing that custom password flow to continue.
Passwords are never handled, logged, or stored by LiveBridge Workers or D1.
Database table organization_password_login is additive; no organization starts enabled.
The preview uses production's existing Clerk authentication checks, with a separate staging API and the shared D1.

QA completed: Preview HTML available; Clerk environment supports password and email codes; staging endpoints reject requests without authorization; JavaScript syntax validated.
QA pending before merge: admin save toggle, customer sets password in Clerk profile, password sign-in, email code fallback, disabled-organization denial, session security, and repeat login.

Production website and broadcasting code untouched; do not merge until user testing succeeds.
## Password policy trial (October 31, 2026)

- Preview UI validates at least 8 characters, at least one letter, at least one number, and rejects predictable passwords and passwords incorporating organization/account-holder names. It explains rejection without storing the candidate password in LiveBridge.
- Clerk's **production** instance is currently configured to require **15 characters**, with no mandatory number, uppercase, lowercase or special character rule; leaked-password checking remains enabled.
- **Critical dependency:** All preview and production users authenticate against this same Clerk production instance. The 8-character minimum will NOT actually save via Clerk until its instance-wide minimum is reduced. No global Clerk password policy was changed during preview development.
- When rolling out with approval, adjust the Clerk Dashboard password requirements (minimum length 8 and require number, no uppercase/special requirement), understanding this applies to all LiveBridge users, not only the preview.
- Preview UI name checks are a user-interface validation; the server-side Clerk policy independently rejects compromised passwords but is not aware of LiveBridge organization names.
