# Who Am I

A "Who Am I" (forehead) game played by 3-10 friends in the same room, each on their
own phone. Everyone writes a name for the next player in turn; after a countdown, each
phone shows the name assigned to its owner. Once you guess it, take the phone off your
forehead. Start a new round with "Play Again".

**Live demo:** [ben-kimim.onrender.com](https://ben-kimim.onrender.com)

## How to play

1. Someone taps **Create Room** and shares the 5-digit code with friends.
2. Everyone taps **Join Room** with a nickname + the code.
3. The host arranges the order (chain) in the lobby and taps **Start**.
4. Everyone writes a name for the next player.
5. Once all names are in, the countdown begins — put your phone on your forehead.
6. Your phone shows the name assigned to you; use the hints to guess who you are.
7. When the round ends, the host starts a new one with **Play Again**.

## Running locally

```bash
npm install
npm start
# http://localhost:3000
```

Each player joins from a separate phone/device. To test on a single computer, open
each player in a separate incognito (private) window.

## Tests

```bash
npm test
```

Unit tests verify the chain/room logic, while integration tests verify the real socket
flow (creating/joining a room, targets, reordering, countdown→word, host handover, and
reconnection).

## Deploying to Render

1. Push this project to a GitHub repository.
2. [render.com](https://render.com) → **New** → **Web Service** → connect your GitHub repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free (sufficient)
4. Once deployed, share the provided `https://...onrender.com` address with your friends.

Notes:
- The server uses the `PORT` environment variable automatically (Render provides it).
- The free tier sleeps when idle; the first load may take ~30 s.
- Room state is held in memory; if the server restarts, open rooms are lost.
