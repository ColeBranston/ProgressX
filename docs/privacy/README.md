# ProgressX privacy program

ProgressX collects health and fitness information (body measurements, diet, water, weight and workout logs,
progress photos) from users in Canada. That makes it a private-sector organization under **PIPEDA**,
and the information is *sensitive*, which raises the bar for consent and safeguards. Provincial
health-information laws (Ontario's PHIPA, Alberta's HIA and others) apply to health information
custodians such as clinicians and hospitals; ProgressX isn't one while users enter their own data.
Revisit that if ProgressX ever receives data from, or shares it with, health care providers.

This folder holds the written parts of the program. The rest is built into the app (see the table below).

**Privacy Officer:** Cole Branston, cole.branston@progressx.ca. Accountable for everything here and
named in the privacy policy.

## PIPEDA's 10 principles: where each is handled

| Principle | How ProgressX meets it |
|---|---|
| 1. Accountability | Named Privacy Officer; this program; written agreements with service providers (see *Vendors*) |
| 2. Identifying purposes | Privacy policy (`/privacy`), sections 02–04 |
| 3. Consent | Express consent at sign-up (18+ and terms/policy checkboxes); `/consent` for Google sign-ups, older accounts and every policy change (`TERMS_VERSION` in `progressx/src/app/internal_components/legal/legalInfo.ts`); each agreement recorded in `consent_events` |
| 4. Limiting collection | Only what the features need; uploaded photos are re-encoded, which drops GPS location and other metadata |
| 5. Limiting use, disclosure, retention | No selling or advertising use; data kept while the account is active and deleted immediately on account deletion (see *Retention*) |
| 6. Accuracy | Users can edit their profile and logs in the app |
| 7. Safeguards | TLS; hashed passwords (Supabase Auth); row-level security on every table; httpOnly session cookies; sign-ins end after 5 hours, or 15 minutes of inactivity (`api/libs/session.ts`); nginx rate limits; upload validation and re-encoding (`api/libs/imageUpload.ts`); no health details in server logs |
| 8. Openness | Privacy policy and terms linked from sign-up and the app |
| 9. Individual access | Settings > Your data > **Download my data** (`GET /api/user/export`); other requests answered within 30 days (see *Requests*) |
| 10. Challenging compliance | Complaints to the Privacy Officer; policy points to the Office of the Privacy Commissioner of Canada |

Breach reporting and record-keeping: [breach-response-plan.md](breach-response-plan.md) and
[breach-register.md](breach-register.md).

## Data inventory

| Data | Where | Deleted by |
|---|---|---|
| Email, password hash, Google identity | Supabase Auth (`auth.users`), US | Account deletion |
| Profile (name, username, bio, age, gender, height, weight, activity level, privacy settings) | `profiles` | Cascade from `auth.users` |
| Settings, diet preferences | `user_settings`, `diet_config` | Cascade |
| Food catalog and food log | `food_items`, `food_log_entries` | Cascade |
| Water log | `water_log_entries` | Cascade |
| Weight log (morning / night weigh-ins) | `weight_log_entries` | Cascade |
| Workout splits and sets | `workout_splits`, `workout_sets`, `workout_routines` | Cascade |
| Progress photo records | `photo_collection` | Cascade |
| Consent records | `consent_events` | Cascade |
| Profile picture and progress photo files | Cloudinary (tagged `user_<id>`) | `deleteUserImages` in `api/libs/accountData.ts`, run before the database delete |
| Session cookies | User's browser | Log out / account deletion |
| Cached profile copy | User's browser (localStorage) | Log out / account deletion |
| Search queries (not linked to accounts) | Redis cache, Solr | Cache expiry |
| Request logs (IP, path) | nginx / Docker logs on the server | Rotated automatically: at most 5 x 10 MB per container (`docker-compose.yml`) |

When you add a new table or file store with user data, add it here, to `USER_TABLES` in
`api/libs/accountData.ts` (for the export) and make sure it cascades from `profiles` (for deletion).

## Retention

- Active accounts: kept while the account exists.
- Account deletion (Settings > Your data > Delete account): Cloudinary images are deleted first (with
  CDN invalidation), then the auth user, which cascades to every table. Immediate.
- Backups: Supabase and Cloudinary backups expire on their own schedule; the policy promises removal
  within 30 days. Check your Supabase plan's backup retention matches.
- Server logs: rotated automatically by Docker (5 x 10 MB per container), and health details are never written to them.

## Requests (access, correction, deletion, withdrawal)

Most are self-serve in Settings. For emailed requests to the Privacy Officer:

1. Verify identity: reply from the account's email address, or ask the person to sign in and use the in-app tools.
2. Respond within **30 days** (PIPEDA). An extension of up to 30 more days is allowed only with written notice explaining why.
3. Access: have them use Download my data, or run the same export for them.
4. Deletion: have them use Delete account. If they can't sign in, delete from the Supabase dashboard
   *after* removing their Cloudinary images (tag `user_<id>`).
5. Keep a short note of the request, date received and date completed (no health details) for 24 months.

## Vendors (service providers)

| Vendor | Data | To do |
|---|---|---|
| Supabase | Everything in the database, auth | DPA in effect |
| Cloudinary | Photos | DPA in effect |
| Google | Sign-in identity | Covered by Google Cloud / OAuth terms |
| Cloudflare | All traffic (tunnel) | DPA in effect |
| SerpApi (off unless `SERPAPI_API_KEY` is set) | Food searches written by the diet assistant, from the server, with no user identifiers | Off by default: the assistant uses the in-house food database, and the chat itself never leaves this Mac (local model, conversations not stored). **Before setting the key**, add SerpApi to the service providers list on the privacy page and review its terms / DPA |
| Websites users link in the diet assistant | Nothing about the user: the server fetches the page itself, so the site sees the server's address and a "ProgressX nutrition reader" user agent | Only links the user writes are opened |
| Nutrition label photos (diet assistant) | Stay on this Mac: read by the local model, never stored or sent anywhere, re-encoded first (strips location metadata) | Nothing to do |

## Still to do outside the code

These need the account owner's logins or signature, so they can't be done from the code.

- [ ] **Turn on FileVault** on the server Mac (System Settings > Privacy & Security > FileVault). The disk holding `.env.local` (all secret keys) is currently unencrypted.
- [ ] **Two-factor sign-in** on the Supabase, Cloudinary, Cloudflare and Google accounts that run ProgressX
- [x] DPAs with Supabase, Cloudinary and Cloudflare are in effect
- [ ] **Leaked password protection** (Supabase > Authentication). Only available on a paid Supabase plan; the project is on the free plan, which also has no automatic backups.
- [ ] **Lawyer review** of the privacy policy, terms and this folder before real users sign up
- [x] Quebec: ProgressX isn't offered to Quebec residents (Terms of Service, section 01), so the Law 25 privacy impact assessment isn't needed. If that changes, finish and sign the draft in [quebec-pia.md](quebec-pia.md) **before** accepting Quebec users.
- [ ] Consider signed (private) Cloudinary delivery for progress photos, so an image link alone can't be opened
- [ ] Review this program once a year, and whenever a new kind of data is collected
