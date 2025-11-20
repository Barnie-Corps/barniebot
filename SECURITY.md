# BarnieBot Security Policy

Version support is now continuous; we focus on securing current `master` rather than maintaining version-specific matrices.

## Philosophy
BarnieBot’s security posture centers on least privilege, fast containment, and transparent remediation. We aim to:
- Minimize sensitive data retention.
- Segregate CPU-intensive tasks (workers) from privileged logic.
- Provide clear audit trails for staff actions (warnings, mutes, blacklists).

## Threat Model (High-Level)
| Vector | Mitigation |
|--------|------------|
| Token compromise | Environment variable storage; rotate on suspicion. |
| Privilege escalation | Owner ID list enforced; staff rank checks block higher/equal modifications. |
| RPG account takeover | AES-256-CBC encrypted passwords; single-session enforcement; email verification. |
| Multi-accounting abuse | Session tracking per Discord UID; frozen/banned account status enforcement. |
| Trading exploits | Tradeable/bound validation; inventory quantity checks; transaction atomicity. |
| Item duplication | Database-driven inventory with transaction locks; no client-side manipulation. |
| Support ticket impersonation | Strict user ID validation on message relay; staff-only action endpoints. |
| Transcript manipulation | Immutable message log with timestamps; HTML sanitization on export. |
| Global chat abuse | Rate limits + worker offloaded decrements; blacklist/mute tables. |
| Impersonation | Automatic stripping of spoofed staff suffix tags from non-staff. |
| Sensitive message leakage | AES-256-CBC encryption of global chat content at rest. |
| Dependency exploits | Encourage timely updates; no unreviewed runtime execution beyond restricted eval (owners only). |
| Injection in filters/custom responses | Controlled by guild admins; user input sanitized before dispatch. |
| SQL injection | Parameterized queries exclusively; no string concatenation of user input. |
| Email spoofing | Gmail SMTP with app-specific passwords; verification code expiry. |

## Reporting Vulnerabilities
Please email: **barniecorps@gmail.com**
Include:
- Summary & impact
- Reproduction steps (minimal)
- Affected components (e.g. global chat, staff cases UI)
- Suggested fix (optional)

Do not disclose publicly until we acknowledge and provide a remediation timeline.

## Response Targets
- Acknowledgment: 48 hours
- Triage & initial assessment: 5 business days
- Patch / mitigation: Severity-dependent; critical issues prioritized immediately.

## Secure Development Practices
1. No hardcoded secrets (.env only).
2. Avoid dynamic `eval` outside the controlled owner-only command.
3. Validate all user-supplied identifiers before DB access.
4. Use parameterized queries exclusively (already implemented).
5. Keep worker messages scoped (no passing token/secrets across threads).
6. Encrypt global chat payloads before persistence.

## Data Protection
- Global messages encrypted with AES-256-CBC (see `utils.encryptWithAES`).
- RPG passwords encrypted with AES-256-CBC using bot encryption key; never stored in plaintext.
- Session tokens generated with timestamp and random component; base64 encoded (not cryptographically secure but sufficient for non-sensitive verification).
- Email addresses stored only for RPG account verification; not shared with third parties.
- Support ticket transcripts archived with staff attribution; HTML sanitized before export.
- Moderation actions (warnings, mutes, blacklists) stored in dedicated tables with audit trail.
- Staff action audit log includes full attribution, timestamps, and metadata for accountability.
- No persistent storage of AI session transcripts beyond ephemeral memory.

## Logging & Monitoring
- Structured logs via `Log` helper categorize events (RateLimit, GuildSystem, etc.).
- Slow dispatches flagged (> ~900ms) for performance regression detection.
- Worker failures lead to automatic recreation, reducing silent lapses.

## Contributor Guidance
- Run TypeScript build and lint before PR.
- Note any security impact explicitly in PR description.
- Refrain from broad refactors that obscure audit-sensitive areas without prior discussion.

## Vulnerability Classes of Interest
- Authentication bypass of staff rank checks.
- RPG session hijacking or multi-account login circumvention.
- Item duplication, gold manipulation, or inventory exploits.
- Trading system race conditions or transaction rollback vulnerabilities.
- Password encryption weaknesses or key exposure.
- Support ticket message relay manipulation or staff impersonation.
- Transcript tampering or unauthorized access to closed tickets.
- Leakage of decrypted global messages.
- Injection into SQL queries (should be prevented by parameterization).
- RCE via owner eval path (should be owner-only; sandbox improvement suggestions welcome).
- Worker-based DoS (e.g., translation queue flooding).
- Email verification bypass or code prediction.
- Staff audit log manipulation or deletion.

## Contact
- Email: **barniecorps@gmail.com**
- Discord: **r3tr00_**

---
BarnieCorps Security Team