# Security

## Reporting a vulnerability

Do not open a public issue containing exploit details or real network information. Contact the repository maintainers privately through the security contact listed on the GitHub organisation profile.

## Supported deployment

Run a maintained Node.js release, keep dependencies current, use HTTPS, keep `workers_dev` and preview URLs disabled, and restrict Cloudflare account access. Review account assignments and security events regularly.

Keep initial setup disabled except during first-administrator enrolment, then disable it and redeploy immediately. Create a second administrator for recovery, then use one-hour single-use invitation links for other users.

## Data handling

This project stores network documentation, which may be commercially sensitive. Do not store credentials or authentication secrets. Export packages contain clear-text register data and must be protected accordingly.

Passkeys protect application accounts but do not encrypt register fields from the hosting administrator. Operators remain responsible for backups, retention, user offboarding, incident response and applicable privacy obligations.

No software is completely secure. Review and test the deployment for your threat model before relying on it operationally.
