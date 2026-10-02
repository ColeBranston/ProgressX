# Privacy impact assessment: communicating personal information outside Quebec

**NOT CURRENTLY REQUIRED.** ProgressX isn't offered to Quebec residents (Terms of Service, section 01).
Keep this draft for the day that changes: complete, review and sign it **before** accepting Quebec users.

**DRAFT: for review by the Privacy Officer and a privacy lawyer before relying on it.**

Required by Quebec's *Act respecting the protection of personal information in the private sector*
(as amended by Law 25), s. 17: before communicating personal information outside Quebec, an
enterprise must assess whether the information will receive adequate protection, in particular in
line with generally recognized principles of personal information protection.

| | |
|---|---|
| Organization | ProgressX (progressx.ca) |
| Person responsible | Cole Branston, Privacy Officer (cole.branston@progressx.ca) |
| Date | 2026-09-28 |
| Review by | 2027-09-28, or sooner if a provider, hosting region or the kind of data collected changes |

## 1. What ProgressX does

ProgressX is a personal fitness web app for adults (18+). Users enter their own information to track
diet, water, workouts and body progress, and to view trends. It is not a health care provider and
receives no information from health professionals.

## 2. Personal information involved

| Category | Examples | Sensitivity |
|---|---|---|
| Identity and account | Email, password hash, Google sign-in identity, username, display name | Moderate |
| Health and body | Age, gender, height, weight, activity level | **High** |
| Diet and hydration | Foods eaten, calories, macro and micronutrients, water intake | **High** |
| Fitness | Workout splits, sets, weights, repetitions | **High** |
| Images | Profile picture, progress (body) photos | **High** |
| Consent records | Terms version agreed to, date, method, browser type | Low |
| Technical | IP address and request paths in server logs | Low to moderate |

Health, body and image information is considered sensitive under the Act (s. 12), so it needs
express consent and stronger safeguards.

## 3. Where the information goes

| Recipient | Role | Location | Information |
|---|---|---|---|
| Supabase | Database and authentication | United States (AWS us-east-2, Ohio) | Everything in section 2 except image files and server logs |
| Cloudinary | Image storage and delivery | United States (cloud infrastructure, global CDN) | Profile pictures and progress photos |
| Cloudflare | Network delivery and security (tunnel) | Global network, including the United States | All traffic, in transit only |
| Google | Sign-in (optional) | United States | Sign-in identity only |
| ProgressX server | Application and logs | Ontario, Canada | Request logs; information in transit |

## 4. Assessment (s. 17 factors)

### a) Sensitivity of the information
High for health, body and image data. This favours strong contractual, technical and organizational protections.

### b) Purposes of use
Only to provide the service to the user who entered it, and to show content to other users according
to the user's own privacy settings. No sale, advertising, profiling or automated decisions. Providers
may use it only to deliver their service to ProgressX.

### c) Protection measures, including contractual

**Contractual:**
- [ ] Supabase Data Processing Addendum accepted (date: ______)
- [ ] Cloudinary Data Processing Addendum accepted (date: ______)
- [ ] Cloudflare Data Processing Addendum accepted (date: ______)
- Each DPA limits the provider to processing on ProgressX's instructions, requires security safeguards and breach notification, and restricts onward transfers.

**Technical:**
- Encryption in transit (TLS) for every hop that crosses a network
- Encryption at rest by Supabase (AES-256) and by Cloudinary's cloud storage
- Row-level security separating each user's data
- Passwords stored as one-way hashes
- httpOnly session cookies
- Rate limiting on sign-in and uploads
- Uploaded images re-encoded, which strips location metadata and hidden content
- No health information written to server logs; logs rotated

**Organizational:**
- A named Privacy Officer
- A breach response plan and breach register ([breach-response-plan.md](breach-response-plan.md), [breach-register.md](breach-register.md))
- Access limited to the Privacy Officer, with two-factor sign-in on provider accounts
- Self-serve data export and account deletion; deletion removes images from Cloudinary and all database rows

### d) Legal framework of the destination (United States)

- The US has no general federal privacy law equivalent to Quebec's.
- US authorities can compel providers to disclose data through legal processes, including the CLOUD Act and, for non-US persons, FISA section 702.
- State laws (for example California's CCPA/CPRA) give some protection but aren't designed for Quebec residents.

**Mitigations:**
- Each provider's DPA commits it to challenge or narrow overbroad requests where legally possible, and to notify ProgressX where permitted.
- Only the minimum information needed is stored.
- Users are told clearly, in the privacy policy, that their information is stored in the United States and may be accessible to its authorities.

## 5. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation | Residual |
|---|---|---|---|---|
| Compromise of a provider account (Supabase, Cloudinary) | Low | High | Strong unique passwords and two-factor sign-in; secret keys kept only on the server; key rotation in the breach plan | Low |
| Leak of secret keys from the ProgressX server | Low to medium | High | Full-disk encryption (FileVault) on the server; keys never in the repository; rotation procedure | Low once FileVault is on |
| Progress photo opened by someone who obtains its link | Low | High | Links are long and random; photo blur setting; private (signed) delivery planned | Low to medium; lower with signed delivery |
| Access by US authorities | Low | High | DPAs, data minimization, transparency to users | Accepted, disclosed |
| Data kept after the user leaves | Low | Medium | Immediate account deletion; backups expire within 30 days | Low |
| Credential stuffing on user accounts | Medium | Medium | Sign-in rate limiting; leaked-password protection once on a paid Supabase plan | Low to medium |

## 6. Conclusion

**Provisional:** once the DPAs are in place, FileVault is enabled on the server and two-factor sign-in
is on for provider accounts, the information will receive adequate protection in line with generally
recognized principles. The remaining risk from US legal access is disclosed to users in the privacy
policy.

Communicating information outside Quebec may proceed once the unchecked items above are complete.

| | Name | Signature | Date |
|---|---|---|---|
| Prepared by | | | |
| Approved by (Privacy Officer) | Cole Branston | | |
| Reviewed by (legal counsel) | | | |
