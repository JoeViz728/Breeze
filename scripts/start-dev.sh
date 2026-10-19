#!/usr/bin/env bash
# Start Breeze for local development.
# Installs dependencies when they are missing, and rebuilds native modules
# when this tree was last set up on another OS (Windows <-> Linux).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -s "${NVM_DIR:-$HOME/.config/nvm}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR:-$HOME/.config/nvm}/nvm.sh"
elif [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required. Install Node 20 or newer, then run this again." >&2
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node $(node -v) is too old. Breeze needs Node 20 or newer." >&2
  exit 1
fi

port_busy() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -q ":${port} "
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    lsof -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return
  fi
  return 1
}

echo "Breeze dev"
echo "  Node $(node -v)  npm $(npm -v)"
echo "  $ROOT"
echo

needs_install() {
  local dir="$1"
  [[ ! -d "$dir/node_modules" ]] || [[ ! -f "$dir/node_modules/.package-lock.json" && ! -d "$dir/node_modules/.bin" ]]
}

install_tree() {
  local dir="$1"
  local label="$2"
  if needs_install "$dir"; then
    echo "Installing ${label} dependencies..."
    npm install --prefix "$dir"
  else
    echo "${label} dependencies are present."
  fi
}

install_tree "." "root"
install_tree "server" "server"
install_tree "client" "client"

# better-sqlite3 is compiled per OS and Node ABI. A Windows .node file
# copied onto Linux (or the reverse) loads as "invalid ELF header".
SQLITE_NODE="server/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
sqlite_loads() {
  (cd server && node --input-type=module -e "import Database from 'better-sqlite3'; const db = new Database(':memory:'); db.close();") >/dev/null 2>&1
}
if [[ ! -f "$SQLITE_NODE" ]] || ! sqlite_loads; then
  echo
  echo "Rebuilding better-sqlite3 for this machine..."
  if ! npm rebuild better-sqlite3 --prefix server; then
    echo >&2
    echo "Could not compile better-sqlite3." >&2
    echo "On Debian/Ubuntu: sudo apt install build-essential python3" >&2
    echo "On Windows: install the Visual Studio Build Tools (Desktop development with C++)," >&2
    echo "or run this from WSL where those packages are already installed." >&2
    exit 1
  fi
  if ! sqlite_loads; then
    echo "better-sqlite3 still will not load after rebuild." >&2
    exit 1
  fi
  echo "better-sqlite3 is ready."
fi

if port_busy 3001 || port_busy 5173; then
  echo >&2
  echo "Port 3001 or 5173 is already in use." >&2
  echo "Stop the other Breeze process, then run this again." >&2
  exit 1
fi

echo
echo "Starting server on http://localhost:3001"
echo "Starting client on http://localhost:5173"
echo "Open http://localhost:5173  (Ctrl+C stops both)"
echo

exec npm run dev
