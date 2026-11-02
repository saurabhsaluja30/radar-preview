# JobRadar by EevolveX — PRD

## Original Problem Statement
Build a production-ready, mobile job-discovery **membership** platform for EevolveX Consulting LLP. Candidates register, buy a membership plan (Quarterly ₹599/90d, Half-Yearly ₹799/180d, Annual ₹1499/365d) in DEMO payment mode to unlock curated job details and apply directly to employers via external links. Premium details are gated at the API level for non-members. A separate Admin portal manages jobs, candidates, subscriptions, payments (real vs demo revenue), emails, and a Developer Test Panel. NOT a recruitment marketplace; no employment guarantees. Purple + white EevolveX brand.

## Architecture
- **Frontend:** Expo Router (React Native), TanStack Query, react-native-keyboard-controller, phosphor-react-native icons, expo-blur (locked overlay), purple theme in `src/theme.ts`.
- **Backend:** FastAPI + MongoDB (motor). Opaque bearer-token sessions (`user_sessions`) for BOTH email/password and Google OAuth. bcrypt password hashing. Role-based access (candidate/admin).
- **Auth:** Email/password (JWT-style session tokens) + Emergent-managed Google OAuth (`/api/auth/session`).
- **Emails:** Emergent-managed Resend; every send is also logged to `email_logs` (viewable in Admin).
- **Payments:** DEMO mode (`/api/checkout/demo`), architecture ready for Razorpay. Payment fields incl. order/transaction/gateway/status/is_demo/subscription_id.

## User Personas
1. **Candidate** — job seeker who wants curated, relevant roles without searching everywhere.
2. **Admin (EevolveX ops)** — manages content, members, subscriptions, revenue, and tests flows.

## Core Requirements (static)
- Public pages: Home (hero, how-it-works, categories, why-us, plans, disclaimer), About, FAQ, Contact, Legal (Terms/Privacy/Refund/Cancellation/Disclaimer).
- Candidate: register/login/Google/forgot-reset/change-password/profile, explore+search+filter, job detail w/ locked premium, save jobs, demo checkout, membership page, dashboard, payment history.
- Membership statuses: no_membership, pending, active, expiring_soon, expired, cancelled, payment_failed (computed dynamically).
- Renewal: early renewal ADDS duration onto remaining days; after expiry starts from today.
- Premium gating enforced at API (never just hidden buttons). Admin notes / verification score never exposed.
- Admin: dashboard metrics (real vs demo revenue separated), job CRUD + status/feature/duplicate, candidate mgmt (extend/suspend), subscription mgmt (cancel), payment reports, email logs + announcements, Developer Test Panel (activate 90/180/365, expire now, expiry 7/3/1, reminders 7/3/1, simulate failed/renewal, reset/delete).

## Update (2026-10-01) — Pricing, Profiles & International Jobs
- Prices: Quarterly ₹599/90d, Half-Yearly ₹799/180d, Annual ₹999/365d (idempotent startup migration; plans read dynamically everywhere).
- Candidate registration/profile now collect Industry (5 + Other), Current Designation, Current Annual CTC, Preferred Job Location, Preferred Work Mode, multi-select Preferred Industries, Preferred Designation. Existing users show "Not Provided" and can edit in Profile.
- International jobs: jobs carry region (India/International), city, country, currency, visa/work-authorization info; existing jobs backfilled (region=India, industry_category from function); 3 international demo jobs seeded. Candidates filter by region/country/industry; admin filters jobs by region/industry/country and candidates by industry.
- Job matching: dashboard recommendations use preferred_industries + preferred_work_mode.
- Pre-payment "What opportunities will you get?" notice on Plans, Membership and Registration. Home nav = HR/Finance/IT/Travel/BPO + India Jobs/International Jobs.
- Admin job editor extended with Industry, Region, City, Country, Currency, Designation, Visa fields.
- Verified: backend 27/27 tests; frontend flows green. No existing data deleted.

## Implemented (2026-06-13)
- Full backend (all above) — verified 38/38 automated tests (auth, gating, demo checkout, renewal stacking, expiry blocks access, all 15 dev-panel actions, revenue separation, save/apply, admin CRUD, emails, forgot-password).
- Full frontend: all candidate + admin + public + legal screens; purple theme; locked glass overlay; keyboard-aware forms; toasts.
- Seed data: 3 plans, 10 sample jobs across categories, admin + test candidate.

## Backlog (prioritized)
- **P1:** Razorpay live integration (swap demo checkout for order+verify+webhook w/ idempotency).
- **P1:** Automated daily expiry cron + scheduled reminder emails (currently dynamic status + manual/dev triggers).
- **P2:** CSV import/export for jobs & candidates; company logos via Object Storage.
- **P2:** Coupon codes, referral rewards, personalized AI recommendations, WhatsApp alerts.
- **P3:** Replace deprecated `shadow*` style props with `boxShadow` (console warnings only).

## Test Credentials
See `/app/memory/test_credentials.md` (admin@eevolvex.com / Admin@12345; test@jobradar.com / Test@12345).

## Switching DEMO → Razorpay (later)
Keep the subscription/activation logic (`_activate_subscription`). Replace `/api/checkout/demo` with: create Razorpay order → client pays → verify signature on `/api/payments/verify` (idempotent by order_id) → call `_activate_subscription` with `is_demo=False`. Add webhook endpoint with signature verification. No changes needed to gating, membership computation, or the dashboard revenue split.

## Career Tools (Oct 2026)
- Backend module `/app/backend/career.py` (router mounted in server.py): resume builder (AI generate/tailor/manual CRUD/versions, PDF+DOCX export via 10-min download tokens), resume analyser (cached by input hash), AI interview coach (questions, per-answer eval or end report, hint, skip, end, history), saved searches, admin settings/stats. Backend-enforced tool access, AI consent, per-tier usage limits (free/quarterly/half_yearly/annual per N-day period), duplicate-request locks, AI call logging with estimated cost.
- Frontend: /career (hub), /career/resume-builder, /career/resume/[id], /career/analyser, /career/interview, /career/interview/[id], /career/history, /admin/career; dashboard Career Tools cards; job detail "Prepare for Interview"; Explore saved searches.
- Voice answers not implemented (text-first as allowed).
- Resume Builder v2: type chooser; 3 fresher templates (general/IT/finance) with SAMPLE preview — hints stored as `hint`, never exported; experienced paste → POST /api/career/resumes/extract (AI, missing_fields, 422 for non-resume); editor with Classic/Modern/Compact styles, preview, Add Work Experience, Save/Download bar, Customise for a Job (notes).
- Resume upload: POST /api/career/resumes/extract-file (PDF via pypdf, DOCX via python-docx, ≤5MB) → same AI extraction. Frontend uses expo-document-picker + src/utils/upload.ts.
- Launch offer: app_settings{key:launch_offer} (enabled, plans_hidden, free_spots=100, free_days=90, granted). Atomic grant on register/Google signup; else waitlisted. Admin page /admin/launch (settings + waitlist approve). /plans & home show LaunchOfferCard while plans hidden; checkout blocked.
- Single device: create_session revokes other candidate sessions; client 401 handler signs user out with alert.
