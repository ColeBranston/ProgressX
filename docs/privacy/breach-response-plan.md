# Breach response plan

Required by PIPEDA (Division 1.1) and the Breach of Security Safeguards Regulations. Owner: the
Privacy Officer (Cole Branston, cole.branston@progressx.ca).

A **breach of security safeguards** is any loss of, unauthorized access to, or unauthorized disclosure
of personal information, whether from an attack, a bug, a misconfiguration or a mistake. Examples for
ProgressX: a leaked Supabase service-role key, a row-level security rule that exposes another user's
logs, a Cloudinary account compromise, a stolen laptop with a database export.

## 1. Contain (immediately)

- Stop the exposure: revoke and rotate the affected keys (Supabase service role and JWT secret, Cloudinary API secret, Google OAuth secret), patch or roll back the bug, take the affected route or service offline if needed (`docker compose stop progressx`).
- Force sign-out of affected sessions if tokens may be compromised (rotating the Supabase JWT secret invalidates every session).
- Preserve evidence: copy relevant logs (nginx, Docker, Supabase logs) before they rotate.

## 2. Assess (within 72 hours)

Answer and write down:

- What personal information was involved (health data? photos? emails?), and for how many users?
- Who could have accessed it, and is there evidence it was actually accessed or copied?
- Is it contained?

Then decide whether there is a **real risk of significant harm (RROSH)**. Consider:

- **Sensitivity.** Health, body and fitness data and photos are highly sensitive, so most breaches involving them will meet the threshold.
- **Probability of misuse.** Was it accessed by an unknown party, published, or held for ransom? Or was it quickly contained with no sign of access, and encrypted?

"Significant harm" includes humiliation, damage to reputation or relationships, identity theft and financial loss.

## 3. Report and notify, if there is RROSH (as soon as feasible)

- **Report to the Office of the Privacy Commissioner of Canada** using its breach report form (priv.gc.ca > Report a privacy breach at your business). Include what happened, when, the information involved, the number of people affected, steps taken and how people are being notified.
- **Notify affected users directly**, by email to their account address. Include:
  - what happened and when
  - what information was involved
  - what ProgressX has done
  - what they can do (for example, change their password or watch for phishing)
  - the Privacy Officer's contact details
  - their right to complain to the OPC
- **Notify other organizations** that could reduce the harm (for example, Cloudinary or Google), if applicable.
- If users in **Quebec** are affected, also report to the Commission d'accès à l'information.

## 4. Record (every breach, even without RROSH)

Add an entry to [breach-register.md](breach-register.md) and keep it for at least **24 months**. The
Privacy Commissioner can ask to see it.

## 5. Learn

Within two weeks, write down the cause and what changes prevent it from happening again. Update this
plan and the privacy program if needed.

## Key contacts

| Who | How |
|---|---|
| Privacy Officer | cole.branston@progressx.ca |
| OPC breach reporting | https://www.priv.gc.ca (Report a privacy breach at your business) |
| Supabase support | Supabase dashboard > Support |
| Cloudinary support | Cloudinary console > Support |
