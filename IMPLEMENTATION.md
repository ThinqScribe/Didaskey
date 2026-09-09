# Didaskey implementation status

Scope: pre-varsity students, tutors, and administrators. No parent experience or university platform. Legacy database enum values are retained to preserve existing records; signup and API access reject unsupported roles.

- [x] Auth recovery, route protection, role restrictions, branding
- [x] Warm ivory design system and navigable learning workspace
- [x] Persistent session messages, linked resources, assignments, text submissions, feedback
- [x] In-app notifications and progress from stored activity
- [x] Tutor onboarding, verification, account and booking administration
- [x] Migration and authorization tests; frontend checks
- [x] Paginated tutor search with format, rating and price filters
- [x] Rescheduling with availability checks, unchanged payment and participant notifications
- [x] Persistent message read receipts and retry-safe publishing
- [x] Protected PDF/image lesson uploads and downloads
- [x] Shared whiteboard with saved strokes, undo and tutor clearing
- [ ] Real-provider payment, email and classroom acceptance testing
- [ ] Physical-device and responsive visual/accessibility acceptance testing
- [ ] Production deployment and operational sign-off

Existing user changes in the classroom screen must be preserved.

## Important behavior

Messages and whiteboard strokes refresh by polling. Read receipts indicate that the message pane loaded while the app was active, not proof that a person read every message. Notifications are in-app, not push. Materials support links, text and PDF/PNG/JPEG uploads (8 MB each; 25 files per session). Files are protected by booking membership and stored in the database; they are downloaded as attachments, not rendered inline. File signature checks are not malware scanning; scanning and retention policy remain production responsibilities. Assignment submissions remain text. Earnings represent gross paid completed sessions, not an available payout balance.

Students may reschedule confirmed sessions at least 24 hours before both old and new start times. Tutor, duration and payment do not change. The whiteboard allows 300 visible strokes and 2,000 total strokes per session; clearing hides strokes while retaining history. Completed sessions are read-only.

Refund requests remain pending until a signed Paystack processed event arrives. Failed/needs-attention refunds require operator investigation in Paystack; automatic retries are not implemented. Provider acceptance followed by a database/network failure requires reconciliation before retrying financial actions. See [Paystack refund lifecycle](https://paystack.com/docs/payments/refunds/).

## Remaining launch gates

1. Configure and test staging Resend, Paystack and LiveKit, including duplicate webhooks, interrupted checkout, refunds, and email recovery.
2. Test camera/microphone permissions, reconnects and session completion on physical Android/iOS devices and web browsers.
3. Test migrations and concurrent booking/payment operations against PostgreSQL and an anonymized copy of existing data. Verify backup restoration.
4. Supply production domains, support address, approved privacy/terms and child-safety policies. Legal compliance has not been asserted.
5. Complete release signing, hosting, monitoring, rate limiting and operational reconciliation.

Push reminders and automated payouts remain unfinished. Payouts need approved commission, settlement/refund rules and bank onboarding; push needs platform credentials and release identifiers. Automated checks do not substitute for provider and device acceptance testing.

## Latest verification and environment audit

- Backend suite: 28 passing tests, including booking notifications, rescheduling, private file access, whiteboard permissions, read receipts and recovery from partially created database schemas.
- TypeScript, lint and web export passed with file tools and shared whiteboard included.
- npm audit reports 22 moderate upstream advisories, including decode-uri-component and uuid. No forced fix was applied: the proposed change downgrades Expo incompatibly. These remain release risks.
- Local provider credentials exist, Paystack uses test mode, and the database is SQLite. This does not verify provider connectivity or production readiness.
- Corrected backend FRONTEND_URL from the API port to the local Expo port 8081 and disabled the availability bypass. The LAN address must match the machine running Expo. Production domains, support email, deployment target and push/release credentials are not configured.
- The local working database is now migrated through `0009_shared_whiteboard`. A backup is retained in `backend/migration-backup.4PwfEn/before.db` (excluded from Git). Migrations passed on a copy before the working database was changed; SQLite integrity, existing table row counts and the full User model query passed afterward. Migration helpers validate and adopt compatible tables left by legacy create_all startup. SQLite migrations now use its synchronous driver. Startup no longer silently creates a partial schema and reports an actionable error if token_version is missing. Browser/device acceptance testing remains incomplete.

## Runbook

Install backend dependencies with `pip install -e .` in a virtual environment, configure `backend/.env` from its example, then run `alembic upgrade head` from backend before starting uvicorn. Back up existing databases first; never blindly stamp mismatched migration histories.

Create the first administrator from backend using `python -m app.bootstrap_admin --email your-admin@example.com`. It prompts for a password and refuses to overwrite an account. Tutors sign up normally and complete Teaching setup before administrator approval.

Use Node 22+, run `npm ci` in frontend, and configure its environment example. Verify with `npm run typecheck`, `npm run lint`, and `npx expo export --platform web`. Run `python -m pytest -q` in backend.

Production requires PostgreSQL, a strong SECRET_KEY, explicit CORS origins, HTTPS FRONTEND_URL, verified Resend sender and LiveKit/Paystack credentials. Point Paystack webhooks to `https://YOUR_API/api/v1/payments/webhook`; signatures use PAYSTACK_SECRET_KEY. Keep secrets out of frontend environment variables.

The compose file provides API/PostgreSQL with required DIDASKEY_DB_PASSWORD. TLS termination, frontend hosting, backups and monitoring remain deployment responsibilities. `/health` checks the process; `/ready` checks the database.
