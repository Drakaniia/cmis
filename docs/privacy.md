# CMIS Privacy Policy

**Effective:** 2026-09-18

CMIS (Clinic Medicine Inventory System) is a local-first desktop application. **We do not collect, transmit, or sell personal data.**

## Data Storage

- All inventory, request, and dispensing data is stored locally in `SQLite` (`cmis.db`) via the Tauri SQL plugin on the user's device.
- No data is sent to a server, cloud, or third party by CMIS itself. Analytics and charts are computed locally from the local database.

## Network Use

- CMIS checks for updates only by fetching `https://github.com/Drakaniia/cmis/releases/latest/download/latest.json` (Tauri updater, minisign-verified). No personal data is sent with this request beyond standard GitHub CDN logs.

## Code Signing

- Windows installers (`.exe` / `.msi`) from GitHub Releases are Authenticode-signed via **SignPath Foundation** (free OSS code signing) when available — see [Code Signing Policy](signing-policy.md). This does not collect user data.

## Contact

Issues or privacy questions: https://github.com/Drakaniia/cmis/issues
