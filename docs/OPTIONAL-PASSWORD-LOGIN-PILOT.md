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