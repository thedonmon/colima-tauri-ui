# Colima Manager

A lightweight macOS menu bar app for managing [Colima](https://github.com/abiosoft/colima) virtual machines, Docker Desktop containers, and AI models — without touching the terminal.

---

![Colima Manager](docs/screenshot.png)

---

## Features

- **VM Management** — Start, stop, restart, and delete Colima instances with one click
- **Live container view** — Expand any running instance to see its Docker containers; stop, pause, restart, or stream logs inline
- **Docker Desktop support** — View and manage containers from non-Colima Docker contexts (e.g. `desktop-linux`)
- **AI Models tab** — Run `colima model` commands with GPU acceleration via krunkit; setup automatically starts the right VM type first
- **Log drawer** — Streams real-time output for any long-running command
- **Config viewer** — Inspect a profile's `colima.yaml` without leaving the app
- **Auto-hide** — Window hides on focus loss; stays on top for quick access
- **Onboarding** — Detects if Colima isn't installed and shows step-by-step setup instructions

---

## Requirements

- macOS (Apple Silicon recommended for AI model support)
- [Colima](https://github.com/abiosoft/colima) — `brew install colima`
- [Docker](https://docs.docker.com/engine/install/) — `brew install docker`

### Optional: AI model support

Requires Apple Silicon + macOS 13+.

```sh
brew tap slp/krunkit
brew install krunkit
```

Then use the **AI** tab → **colima model setup** to get started. The app will automatically start a `krunkit` instance and run `colima model setup` for you.

---

## Getting Started

### Install Colima

```sh
brew install colima
brew install docker
```

### Start your first VM

```sh
# Default (QEMU, Docker runtime)
colima start

# With custom resources
colima start --cpu 4 --memory 8 --disk 100

# With krunkit for AI/GPU support
colima start --runtime docker --vm-type krunkit
```

---

## Development

Built with [Tauri v2](https://tauri.app), [React 19](https://react.dev), [TypeScript](https://www.typescriptlang.org), and [Tailwind CSS v4](https://tailwindcss.com).

### Prerequisites

- [Rust](https://rustup.rs)
- [Node.js](https://nodejs.org) 18+
- Xcode Command Line Tools

### Run in dev mode

```sh
npm install
npm run tauri dev
```

### Build

```sh
npm run tauri build
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Shell | Tauri v2 (Rust) |
| UI | React 19 + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand |
| Icons | Lucide React |

---

## Notes

- The app uses `alwaysOnTop: true` and hides on focus loss — designed to feel like a native menu bar utility
- Colima profiles map to Docker contexts: `default` → `colima`, `myprofile` → `colima-myprofile`
- The log drawer streams stdout/stderr in real time via Tauri events
