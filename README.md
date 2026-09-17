# CMIS — Clinic Medicine Inventory System

A Tauri desktop application for clinic inventory management, medication dispensing, and analytics. Built with TanStack Router, Vite, and TypeScript.

## Features

- **Inventory Management** — Track and manage clinic supplies and medications
- **Request Queue** — Create requests from anywhere with Ctrl+N / ⌘N and move them through an approval workflow
- **Quick Deduct** — Take stock off the shelf for a counter hand-over with Ctrl+D / ⌘D: one item, one quantity, one confirm, no queue and no wizard. The deduction still comes off the FEFO batch, is logged in the Dispensing Log, counts in analytics, and leaves a card in Claimed marked "Quick deduct" — with a few seconds of undo
- **Dispensing** — Hand a request over and the quantity leaves the shelf automatically: the FEFO batch is decremented, the item status recomputed, and the hand-over recorded in the dispensing log and analytics
- **Analytics Dashboard** — Visualize inventory trends and usage patterns with interactive charts

## Tech Stack

- **Frontend:** React 19, TanStack Router, Tailwind CSS 4, Vite
- **Desktop:** Tauri 2 (Rust backend)
- **UI:** Base UI, shadcn/ui, Lucide icons
- **State:** TanStack Query, React Context
- **Charts:** Visx (D3-based)
- **Database:** SQLite via Tauri SQL plugin
- **Language:** TypeScript, Rust

## Prerequisites

- [Node.js](https://nodejs.org/) >= 24.0.0
- [pnpm](https://pnpm.io/) >= 12.3.4
- [Rust](https://www.rust-lang.org/tools/install) (for Tauri)
- [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/)

## Getting Started

```bash
# Install dependencies
pnpm install

# Start the desktop app in development mode
pnpm desktop:dev

# Or start just the frontend dev server
pnpm dev
```

## Development

```bash
# Lint and format
pnpm check
pnpm fix

# Type checking
pnpm check-types

# Tests
pnpm test
pnpm test:frontend

# Build
pnpm build
pnpm desktop:build
```

## Project Structure

```
cmis/
├── apps/
│   └── desktop/          # Tauri desktop application
│       ├── src/          # React frontend
│       └── src-tauri/    # Rust backend
├── packages/
│   ├── config/           # Shared TypeScript configurations
│   ├── env/              # Type-safe environment variables
│   └── ui/               # Shared UI components and design system
├── .editorconfig         # Editor configuration
├── .nvmrc                # Node version manager config
├── pnpm-workspace.yaml   # pnpm workspace configuration
└── package.json          # Root package.json
```

## License

[MIT](LICENSE)
