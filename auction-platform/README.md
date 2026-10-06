# BidNova — real-time auction marketplace

A runnable full-stack auction platform starter built with **React + Vite**, **Express**, **Socket.IO**, and a small file-backed JSON store. It includes real-time bidding, secure cookie-based sign-in, seller listings, watchlists, auction-room chat, outbid notifications, and transparent activity insights.

## 1. Requirements

- Node.js 20 or newer
- npm
- Internet access for the first `npm install` (the app itself does not require an external service)

## 2. Install and run locally

Open a terminal in the project directory:

```bash
cd auction-platform
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

On Windows Command Prompt, use:

```bat
copy .env.example .env
```

For local development, keep `PORT=4000` because the Vite proxy forwards API and Socket.IO traffic to that port. Start both the API and web app:

```bash
npm run dev
```

Open **http://localhost:5173**. Vite serves the React app; Express runs on port 4000 behind the development proxy.

### Demo account

- **Email:** `demo@bidnova.in`
- **Password:** `BidNova123!`

The sign-in dialog also has a **Use demo** button. Or create a new account from the same dialog.

## 3. What to try

1. Open a lot and watch the countdown, minimum next bid, and activity insight.
2. Sign in with the demo account, add a lot to your watchlist, and place a bid.
3. Open the same lot in another browser session to see bid updates arrive over Socket.IO.
4. Use the auction-room chat to exchange messages live. Chat and private notifications require sign-in.
5. Choose **List an item** to publish a new auction. It appears immediately in the live floor.
6. Use the bell menu to read bid and outbid notifications.

## 4. How the project is organized

```text
auction-platform/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── App.jsx                    # app state, search, navigation, live updates
│   ├── main.jsx                   # React entry point
│   ├── styles.css                 # responsive interface styles
│   ├── lib/api.js                 # API, INR formatting, countdown helpers
│   └── components/
│       ├── AuctionCard.jsx
│       └── Overlays.jsx           # sign-in, lot detail, chat, create-listing dialogs
└── server/
    ├── index.js                   # REST API, auth, bids, Socket.IO, notifications
    ├── auction-utils.js           # public lot views and sorting
    ├── insights.js                # activity signal and optional AI explanation
    └── store.js                   # serialized, atomic JSON persistence + demo seed
```

The first server start creates `server/data/auction-store.json` with sample auctions and the demo user. The file is ignored by Git and persists between local restarts.

## 5. Features and implementation notes

- **Real-time bidding:** the server validates each bid against the latest price and minimum increment inside a serialized transaction, persists it, then broadcasts the updated lot over Socket.IO.
- **Authentication:** passwords are hashed with bcrypt. A signed session token is stored in an HttpOnly cookie; it is not kept in browser local storage. Authentication and API routes are rate-limited, request bodies are validated, and Helmet supplies security headers.
- **Communication:** authenticated collectors can chat in a lot-specific live room. Bid and outbid events create private in-app notifications; socket rooms are scoped by user or lot.
- **Smart insights:** the local activity model calculates a bidding-momentum score from recent bid pace, overall activity, and time remaining. It explains the signal and explicitly does **not** claim to appraise an object or predict a winning price. If `OPENAI_API_KEY` is set, the server can optionally generate a short neutral-language explanation using the model named in `OPENAI_MODEL`; the key remains server-side. If the provider is unavailable, local insights continue to work.
- **Storage:** the included JSON store is useful for learning and a single-process demo. It serializes writes and uses atomic file replacement to avoid overlapping bid updates. It is not a substitute for a production database or a multi-instance locking strategy.
- **Lot artwork:** the starter uses self-contained CSS treatments and category icons so the interface works without image/CDN dependencies. A production marketplace should add moderated image uploads and object storage.

## 6. Useful commands

```bash
npm run dev       # Express API + Vite development server
npm run check     # syntax-check server modules
npm run build     # create the production web bundle in dist/
npm start         # run Express; serves dist/ if it exists
```

To test the production-style local server:

```bash
npm run build
JWT_SECRET="a-long-random-secret-value" NODE_ENV=production npm start
```

Then visit **http://localhost:4000**. When production mode is enabled, cookies are marked `Secure`; run behind HTTPS in a real deployment. Set a unique, high-entropy `JWT_SECRET` and never commit `.env`.

## 7. Optional AI explanation

Add these to `.env` to enable model-written wording for the activity insight:

```dotenv
OPENAI_API_KEY=your-server-side-key
OPENAI_MODEL=gpt-4o-mini
```

No API key is needed for the application to run. The activity score and fallback explanations are calculated locally.

## 8. Production hardening checklist

Before taking real bids or payments, replace the demo setup with:

- PostgreSQL or another transactional database, plus Redis/pub-sub if running more than one API instance
- HTTPS, secure session/key rotation, CSRF protections appropriate to your deployment, and a shared rate-limit store
- Seller verification, moderation, audit logs, anti-fraud controls, and dispute/refund procedures
- A payment provider and explicit settlement, shipping, cancellation, and auction terms
- Image upload scanning, object storage, backups, monitoring, and automated tests

This repository is a complete local **MVP/demo**, not a payment, escrow, or compliance system.
