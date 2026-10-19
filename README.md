# Breeze

A small self-hosted chat app. One Node.js process serves the API and the built client. Messages go over WebSockets and land in SQLite, so there is no database to set up.

Shared links get an Open Graph preview. Image and video URLs render in the message instead of sitting as a bare link.

## Run

```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
npm run dev
```

Open `http://localhost:5173` and enter a name. For a single process, run `npm run build` and then `npm start`. The server defaults to port 3001.
