# Security

## Reporting a vulnerability

Report privately through GitHub's vulnerability reporting for this repository:

https://github.com/mhernesniemi/kide-cms/security/advisories/new

Do not open a public issue for something exploitable. Include the affected version, the deployment target (Node or Cloudflare), and steps to reproduce. You will get a reply in the advisory thread; a fix ships as a normal release and the advisory is published afterwards.

## Supported versions

Kide CMS is pre-1.0 and has a single line of development. A security fix is published as the next release from `main` and noted in `CHANGELOG.md`; there are no backports to earlier versions. The way to get a fix is to upgrade to the latest release.

## Production checklist

Set `CMS_TRUSTED_ORIGIN` to the site's public origin. It anchors the CSRF check and the links in password-reset and invite emails; without it those come from the request `Host` header. The threat model and the security-relevant defaults (auth, sessions, uploads, public endpoints) are documented at https://docs.kide.dev/security/.
