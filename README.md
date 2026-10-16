# Gooner Bank

## Description

A Next.js app for groups, location-based Grub earnings, and wallet operations intended for integration with Grub Exchange. The current earning path processes encounters through `/api/location`. The older [design specification](GOONER_BANK_SPEC.md) includes plans that do not all match the current implementation.

## Dependencies

- Node.js and npm compatible with the locked Next.js version.
- PostgreSQL.
- A Resend API key for group-request emails.
- Browser geolocation permission for location features.
- Packages and versions are recorded in `package.json` and `package-lock.json`.

## Technologies

TypeScript, Next.js 16, React 18, Prisma 5, PostgreSQL, NextAuth 4, bcryptjs, Zod, Leaflet, React Leaflet, Resend, and Tailwind CSS.

## Setup

```bash
git clone https://github.com/bryan3342/bank-system.git
cd bank-system
npm ci
```

Create `.env` with your own values:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/gooner_bank
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=replace-with-a-random-secret
RESEND_API_KEY=replace-with-your-resend-key
EMAIL_FROM=replace-with-your-verified-sender
WALLET_API_KEY=replace-with-a-server-to-server-secret
```

Initialize a development database and generate the client:

```bash
npm run db:generate
npm run db:push
```

`db:push` changes the database schema. Use a development database. Start the app, open `http://localhost:3000`, and register through the login page.

## Features

- Credentials-based registration and login.
- Groups, join requests, email approval links, events, and check-ins.
- A map and dashboard with earnings and membership statistics.
- Encounter logic that credits 2 Grubs to each user after qualifying proximity pings at least 30 seconds apart, within 200 meters, with a 3-hour pair cooldown.
- Wallet balances, transaction history, and API-key-protected buying-power, credit, and debit routes.
- A web manifest and service worker for static assets.

The configured Vercel cron runs daily and removes stale encounter records. It does not implement the per-minute event payout loop described in the older specification.

## Commands to run

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server. |
| `npm run build` | Generate Prisma Client and build Next.js. |
| `npm start` | Serve a completed production build. |
| `npm run db:generate` | Generate Prisma Client. |
| `npm run db:push` | Apply the schema to the configured database. |
| `npm run db:studio` | Open Prisma Studio. |

The repository also declares `npm run lint` as `next lint`; that command is not supported by the declared Next.js 16 major version. No test script is defined.

## Contributors

- [Bryan Mejia (@bryan3342)](https://github.com/bryan3342), credited in Git history.
