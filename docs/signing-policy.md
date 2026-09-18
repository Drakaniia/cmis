# CMIS Code Signing Policy

**Required for SignPath Foundation free OSS signing — https://signpath.org**

This document defines who may request signing, how builds are verified, and what is signed for the CMIS Tauri desktop app.

## 1. Project

- **Name:** CMIS — Clinic Medicine Inventory System
- **Repository:** https://github.com/Drakaniia/cmis
- **License:** MIT (`LICENSE` at repo root)
- **Description:** Tauri desktop app (TanStack Router + Vite + TypeScript + Rust) for clinic medicine inventory, dispensing, and analytics. Distributed as Windows `NSIS .exe` and `MSI` from GitHub Releases.
- **Publisher identity when signed via SignPath:** `SignPath Foundation` (OV certificate vouches that binary was built from this public repository; not a personal certificate).

## 2. Roles

| Role | Members | Permissions |
|------|---------|-------------|
| **Authors** | Contributors with write access to `Drakaniia/cmis` | Push code, open PRs |
| **Reviewers** | `@Drakaniia` + designated maintainers | Approve PRs to `main` |
| **Approvers / Submitters** | `@Drakaniia` (repo owner) | Only person(s) who hold `SIGNPATH_API_TOKEN` and may submit signing requests. Token stored as GitHub Actions secret, never in code. |

- All maintainers have MFA enabled on GitHub (SignPath requirement).
- Only builds from `refs/tags/v*` on `main` that pass `tauri.yml` on **GitHub-hosted `windows-latest`** runners may be signed (`require_github_hosted: true`). Re-runs are disallowed via SignPath policy `disallow_reruns: true` to prevent stale vulnerable builds from being signed.
- Private key never leaves SignPath HSM — no token/USB handling by maintainers.

## 3. What is signed

- **Artifacts:** `apps/desktop/src-tauri/target/release/bundle/nsis/*.exe` and `apps/desktop/src-tauri/target/release/bundle/msi/*.msi`
- **Artifact configuration in SignPath:** `cmis-windows-installer` (type `zip-file` wrapping the two bundles, or two separate configs `cmis-nsis` / `cmis-msi` if preferred)
- **Signing policy:** `release-signing` — requires tag build + hosted runner + branch protection on `main`.
- **Timestamping:** `http://timestamp.digicert.com` (RFC3161, SHA256)
- **Excluded:** No signing for `workflow_dispatch` smoke builds or PR builds — those remain unsigned and are uploaded as `windows-build` artifacts only.

## 4. Verification & Audit

- SignPath validates via **Trusted Build System `GitHub.com`**: artifact must be uploaded via `actions/upload-artifact@v4` before signing; origin metadata is provided by GitHub, not the build script.
- Every signing request is logged in SignPath with `signing-request-id` and linked to the GitHub run. Consumers can verify Authenticode signature chains to `SignPath Foundation` root.
- Updater artifacts (`latest.json` minisign) are separately signed with `TAURI_SIGNING_PRIVATE_KEY` — that key is independent of Authenticode.

## 5. Privacy

- No personal data is embedded in the signature beyond the SignPath Foundation organization identity.
- Build logs and artifact hashes are retained by GitHub Actions and SignPath per their retention policies.

## 6. Attribution

Signing service provided free of charge by **SignPath Foundation** / **SignPath.io** for open source projects. Publisher field in Windows SmartScreen will show `SignPath Foundation` — this is expected and indicates the binary was verified to be built from this public repository.

---

*To apply: submit this policy URL (`https://github.com/Drakaniia/cmis/blob/main/docs/signing-policy.md`) in the SignPath Foundation application at https://signpath.org/apply along with the repository URL.*
