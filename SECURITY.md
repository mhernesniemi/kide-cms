# Security

## Reporting a vulnerability

Report privately through GitHub's vulnerability reporting for this repository:

https://github.com/mhernesniemi/kide-cms/security/advisories/new

Do not open a public issue for something exploitable. Include the affected version, the deployment target (Node or Cloudflare), and steps to reproduce. You will get a reply in the advisory thread; a fix ships as a normal release and the advisory is published afterwards.

## Supported versions

Kide CMS is pre-1.0 and has a single line of development. A security fix is published as the next release from `main` and noted in `CHANGELOG.md`; there are no backports to earlier versions. The way to get a fix is to upgrade to the latest release.

## Production checklist

Set `CMS_TRUSTED_ORIGIN` to the site's public origin. It anchors the CSRF check and the links in password-reset and invite emails; without it those come from the request `Host` header. The threat model and the security-relevant defaults (auth, sessions, uploads, public endpoints) are documented at https://docs.kide.dev/security/.

## Changing authentication

Authentication stays a deliberately small, password-based system. SSO, MFA, and passkeys are not added to it one by one; a real requirement for them means integrating an external identity provider that authenticates a stable subject and maps it to a local Kide user, without sharing ownership of Kide's password or session records. That integration needs its own threat model, account migration and rollback plan, and tests on Node/SQLite and Cloudflare/D1.

Any change to authentication must preserve:

- Reusable session, invite, and reset tokens are never stored raw.
- Invite and reset consumption has exactly one winner under concurrency.
- Setup can create only one initial administrator, even under concurrent requests.
- Password hashes are salted, versioned, computationally bounded on verification, and never returned by the CMS API.
- Login failures are durably throttled by both account identifier and client address.
- Unauthenticated login and recovery responses do not reveal whether an email address exists.
- Browser authentication state changes require an explicit same-origin signal; safe HTTP methods do not mutate authentication state.
- Authentication responses are not cached, and session cookies remain HttpOnly, SameSite, and Secure in production.
- Roles are enforced server-side from current user data rather than trusted from client input.

An auth change is not complete until its route behavior, database state, expiry, failure path, and concurrency behavior are tested, on both SQLite and D1 when it touches persistence or runtime adapters.

Any change to the defaults listed on the docs Security page is a security change.
