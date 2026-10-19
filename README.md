# Breeze

A calm, minimal, self-hosted chat application — a simple alternative to Discord. Modern IRC with inline media support and URL content parsing.

## Features

- **Clean three-panel layout** — channels sidebar, spacious chat area, on-demand right panel
- **Real-time messaging** via WebSockets
- **Inline media** — images and videos embedded from URLs
- **Link previews** — automatic Open Graph parsing for shared links
- **On-demand tools** — Media & Links grid, Members list, Search, Channel info
- **SQLite persistence** — zero-config database, easy to back up
- **Self-hostable** — single Node.js process serves API + frontend

## Quick Start

From the project root:

```bash
# Linux, macOS, or WSL
./scripts/start-dev.sh
```

```bat
REM Windows
scripts\start-dev.bat
```

The script installs dependencies if they are missing and rebuilds `better-sqlite3` when this folder was last set up on another operating system. Then it starts the API and the frontend together.

Open **http://localhost:5173**. The first visit creates the server admin. Later visits can join with a username, or sign in with a password.

You can also install and start by hand:

```bash
npm install
npm install --prefix server
npm install --prefix client
npm run dev
```

## Production

```bash
npm run build
npm start
```

The server runs on port **3001** by default. Set `PORT` to change it.

## Architecture

```
breezeChat/
├── client/          React + Vite frontend
├── server/          Express + WebSocket + SQLite backend
│   └── data/        SQLite database (auto-created)
└── package.json     Root scripts
```

## UI Layout

| Area | Purpose |
|------|---------|
| **Left sidebar** | Channel list + server tools |
| **Top bar** | Server name, channel + topic, global tool icons |
| **Main chat** | Message list with media/link previews + input |
| **Right panel** | Slides in on demand — info, media, members, search |

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, custom CSS
- **Backend:** Node.js, Express, ws, better-sqlite3
- **Database:** SQLite (WAL mode)

## License

MIT