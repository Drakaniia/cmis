# Windows Code Signing for CMIS

> **TL;DR:** Unsigned `tauri build` output (`apps/desktop/src-tauri/target/release/bundle/nsis/*.exe`) always triggers
> `Windows protected your PC` + Defender heuristics. `TAURI_SIGNING_PRIVATE_KEY` in `tauri.yml` is **only for the updater** (`latest.json`), not Windows Authenticode. You have 4 options below — cheapest first.

`apps/desktop/src-tauri/tauri.conf.json:51` ships with:

```json
"bundle": {
  "windows": {
    "digestAlgorithm": "sha256",
    "timestampUrl": "http://timestamp.digicert.com"
  }
}
```

Without `certificateThumbprint` or `signCommand`, builds are **unsigned** (expected for local dev). CI patches the config when secrets are present and verifies with `signtool verify /pa`.

---

## Option 0: SignPath Foundation — FREE for OSS (recommended)

Publisher shows `SignPath Foundation` (not your name) — expected. Proves binary was built from this public repo. This is the only Microsoft-trusted **free** path in 2026.

**Eligibility:** CMIS is `MIT` (`package.json:25` + `LICENSE`) and public at `https://github.com/Drakaniia/cmis` — qualifies. See https://signpath.org/apply and https://signpath.org/projects

### Apply

1. Push `docs/signing-policy.md` to `main` (already in this repo — required by SignPath).
   It defines roles (Authors/Reviewers/Approvers), artifact list (`nsis/*.exe` + `msi/*.msi`), `release-signing` policy, and `require_github_hosted: true`.
2. Ensure MFA on all GitHub maintainers (SignPath requirement).
3. Apply at **https://signpath.org/apply** with:
   - Repo URL: `https://github.com/Drakaniia/cmis`
   - Policy URL: `https://github.com/Drakaniia/cmis/blob/main/docs/signing-policy.md`
   - Description: Tauri desktop app for clinic medicine inventory.
4. Install the **SignPath GitHub App** when prompted and grant it repo access (needed for Trusted Build System verification).
5. Wait 1–3 weeks for approval. You will receive `organization-id`, `project-slug` (`cmis`), `signing-policy-slug` (`release-signing`), and an `API token`.

### Add GitHub Secrets (Repo → Settings → Secrets → Actions)

| Secret | Value | Required |
|--------|-------|----------|
| `SIGNPATH_API_TOKEN` | User API token with `Submitter` role on `release-signing` | Yes |
| `SIGNPATH_ORGANIZATION_ID` | From SignPath dashboard | Yes |
| `SIGNPATH_PROJECT_SLUG` | `cmis` (optional — defaults to `cmis`) | No |
| `SIGNPATH_SIGNING_POLICY_SLUG` | `release-signing` (optional — defaults to `release-signing`) | No |

### How it works in `.github/workflows/tauri.yml:38`

- If `SIGNPATH_API_TOKEN` is set on a `v*` tag: CI builds **unsigned** (`pnpm --filter desktop desktop:build`), uploads `unsigned-installers` artifact, calls `signpath/github-action-submit-signing-request@v1` (`wait-for-completion: true`), downloads signed artifacts to `signed/`, verifies with `signtool verify /pa`, then publishes to the GitHub Release via `gh release upload` (SmartScreen shows `SignPath Foundation`).
- If `SIGNPATH_API_TOKEN` is **not** set: workflow falls back to OV/Azure/unsigned path below — no behavior change today.
- `workflow_dispatch` smoke builds remain unsigned and are uploaded as `windows-build` only (never sent to SignPath).

> **Artifact config note:** Default `actions/upload-artifact` creates a ZIP, so your SignPath artifact configuration should be type `<zip-file>` wrapping the `.exe`/`.msi`. If you configure separate `cmis-nsis` / `cmis-msi` configs, set `archive: false` in the upload step.

---

## Option 1: OV Certificate (PFX) — $150–300/yr

Traditional CA (Sectigo/SSL.com/DigiCert). Since 2023 requires HSM (USB token or cloud like SSL.com eSigner). Validation 1–3 days.

1. Buy OV cert, export `.pfx` with password.
2. Add secrets:

   | Secret | Value |
   |--------|-------|
   | `WINDOWS_CERTIFICATE` | `base64` of `.pfx` (`certutil -encode cert.pfx tmp.b64` or `base64 -w0 cert.pfx`) |
   | `WINDOWS_CERTIFICATE_PASSWORD` | PFX password |

3. Push `v*` tag — workflow imports to `Cert:\CurrentUser\My`, patches `certificateThumbprint`, signs.

Skipped automatically if `SIGNPATH_API_TOKEN` is set.

## Option 2: Azure Trusted Signing (Artifact Signing) — ~$9.99/mo

Microsoft's service for non-Store distribution. No token.

1. Azure Portal → Create **Trusted Signing** account + **Certificate Profile** (Public Trust).
2. Create Entra App Registration with `Trusted Signing Identity Verifier` role.
3. Add secrets: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TRUSTED_SIGNING_ACCOUNT`, `AZURE_TRUSTED_SIGNING_PROFILE`, `AZURE_TRUSTED_SIGNING_ENDPOINT` (`https://eus.codesigning.azure.net` etc.).
4. Push `v*` tag — workflow installs `Azure.CodeSigning.Tools` and sets `signCommand`.

Skipped if `SIGNPATH_API_TOKEN` is set.

## Option 3: Microsoft Store (MSIX) — free signing, $19 one-time

If you ship `MSIX` via Store, Microsoft re-signs for you — no cert to buy/manage, no SmartScreen warning. Not usable for GitHub Releases `NSIS .exe`.

- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options

## Option 4: Do nothing (free, worst UX)

- Users click `More info → Run anyway` every time.
- AV `Wacatac`/etc false positives on NSIS — submit each release to https://www.microsoft.com/wdsi/filesubmission (Developer, incorrectly detected) — 24–48h, per-release.
- Reputation builds slowly after hundreds of installs; OV and Azure now behave the same (EV no longer instant bypass since 2024).

---

## Local dev

No cert needed. `pnpm --filter desktop desktop:build` stays unsigned. Signing only on `refs/tags/v*` in CI. To test thumbprint locally: `Get-ChildItem Cert:\CurrentUser\My | Format-List Subject,Thumbprint` then add `certificateThumbprint` to `tauri.conf.json` (don't commit).

## Manual verification

```powershell
signtool verify /pa apps/desktop/src-tauri/target/release/bundle/nsis/*.exe
signtool verify /pa apps/desktop/src-tauri/target/release/bundle/msi/*.msi
# ✓ Signed → no output / success; ✗ NOT SIGNED → error (expected if no secrets)
```
