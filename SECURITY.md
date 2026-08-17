# Security Policy

## Supported Versions

Only the latest released version of Voidbound receives security updates.

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |
| < 0.1   | :x:                |

## Reporting a Vulnerability

If you discover a security issue in Voidbound, please report it
privately:

  - **GitHub**: https://github.com/wang19baby/Voidbound/security/advisories/new
    (private disclosure to maintainers only)
  - Subject prefix: `[SECURITY]`
  - Response window: 7 days

Please **do not** file a public issue for security vulnerabilities
before a fix is available.

## What to include

When reporting, please include:

  - Description of the vulnerability
  - Steps to reproduce
  - Affected version(s)
  - Your assessment of impact and severity
  - Optional: a suggested fix

## Secret Leak Procedure

If a real API key, password, or other secret is accidentally committed:

  1. **Revoke the credential immediately** at the issuing service
     (e.g. https://aistudio.google.com/apikey for Gemini).
  2. Re-issue a new credential.
  3. Open a SECURITY advisory so the maintainer can rewrite history
     (using `git filter-repo` / BFG) before the key is exploited.
  4. The maintainer will:
       - rewrite affected commits and force-push
       - request all forks re-pull
       - audit access logs for the leaked credential

## Defense in depth

This repository runs automated secret scanning on every push via
[`.github/workflows/secret-scan.yml`](.github/workflows/secret-scan.yml)
using [Gitleaks](https://github.com/gitleaks/gitleaks). Custom rules
for project-specific credentials live in
[`.gitleaks/custom.toml`](.gitleaks/custom.toml).

The standard `.gitignore` covers `.env`, `.env.local`, `.env.*.local`,
and similar variants; see project root.

Voidbound Contributors, 2026
