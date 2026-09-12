# Pull Request

## Summary
<!-- What and why — 1-3 sentences. Link to design doc if applicable: docs/spec/CMIS-ui-spec.md or docs/context/CMIS-*.md -->

## Linked Issues
<!-- Closes #<id> — use `Fixes`/`Closes` to auto-close. If no issue, explain why. -->
Closes #

## Type of Change
<!-- Check one. Use Conventional Commits scope in title: feat(inventory), fix(queue), chore(ci), docs(ui), style, refactor, test -->
- [ ] `feat` — new user-facing capability
- [ ] `fix` — bug fix
- [ ] `refactor` — no behavior change
- [ ] `style` — formatting only (`pnpm dlx ultracite fix`)
- [ ] `chore` — tooling / deps / CI / Tauri config
- [ ] `docs` — `docs/**` only
- [ ] `test` — tests only
- [ ] `revert`

## Scope / Area
<!-- Check all that apply — aligns with CMIS modules (docs/ui/CMIS-UI-*.md, docs/context/CMIS-03-system-flow.md) -->
- [ ] Inventory (`CMIS-UI-02`)
- [ ] Expiry alerts (`CMIS-UI-03`)
- [ ] Low-stock alerts (`CMIS-UI-04`)
- [ ] Request queue / Kanban (`CMIS-UI-05`)
- [ ] Dispensing log (`CMIS-UI-06`)
- [ ] Reports & analytics (`CMIS-UI-07`)
- [ ] Viewer portal (`CMIS-UI-08`)
- [ ] Admin (`CMIS-UI-09`)
- [ ] Shell / Navigation / Auth (`CMIS-UI-00`, role matrix in `CMIS-02`)
- [ ] Offline / Sync (`CMIS-03 §4`)
- [ ] Desktop (Tauri / `apps/desktop`)
- [ ] Packages (`packages/ui`, `packages/env`, `packages/config`)
- [ ] Tooling / CI (`biome.jsonc`, `bts.jsonc`, `.github/workflows/*`)

## Roles Impacted
- [ ] Admin — full access, user/branch management, overrides
- [ ] Staff — stock in/out, expiry/low-stock, dispensing, kanban
- [ ] Viewer — browse, request, claim own history
- [ ] N/A

## How to Test
<!-- Concrete steps a reviewer can run. Prefer `pnpm` commands from package.json:10 -->
```bash
pnpm install --frozen-lockfile
pnpm run check        # ultracite check (Biome)
pnpm run check-types  # vp run -r check-types
pnpm run test         # vp run -r test  (or pnpm run test:frontend)
pnpm run build        # vp run -r build
# app-specific:
pnpm --filter desktop desktop:dev   # or pnpm run dev:desktop
```
1.
2.
3.

## Screenshots / Recordings
<!-- For UI changes: before/after, include role (Admin/Staff/Viewer) and viewport (desktop/tablet). Drag images here. Delete if N/A. -->
| Before | After |
|--------|-------|
|        |       |

## Checklist
- [ ] Title follows **Conventional Commits** (`type(scope): subject`) — e.g., `feat(inventory): add batch expiry filter`
- [ ] Commits are **atomic** and history is clean (`git log --oneline`)
- [ ] Ran `pnpm dlx ultracite fix` and `pnpm run check` — no new lint warnings
- [ ] Ran `pnpm run check-types` — no type errors
- [ ] Tests added/updated and `pnpm run test` passes
- [ ] A11y checked — semantic HTML, labels, keyboard + SR path, no `console.log` left
- [ ] Roles/permissions respected — matches `docs/context/CMIS-02-user-stories.md` matrix
- [ ] Stock flows handle edge cases — FEFO/expiry block, no negative stock, audit linkage
- [ ] Docs updated if behavior changes — `docs/spec/*`, `docs/ui/*`, or `docs/context/*`
- [ ] No `dangerouslySetInnerHTML`, `eval`, or `document.cookie` direct assignment
- [ ] Breaking change noted below (if any)

## Breaking Changes
<!-- If this changes API, DB, Tauri config, or role contract, describe migration. Otherwise delete. -->

## Additional Notes
<!-- Anything for reviewers: trade-offs, follow-ups, links to spec section. -->
