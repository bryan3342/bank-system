# Gooner Bank — Project Specification

> A location-aware, event-driven currency generator that integrates with [Grub Exchange](/) as buying power for the friend-based stock market.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Event Lifecycle](#event-lifecycle)
7. [Currency Generation Logic](#currency-generation-logic)
8. [Grub Exchange Integration](#grub-exchange-integration)
9. [Geolocation Strategy](#geolocation-strategy)
10. [Key Technical Considerations](#key-technical-considerations)
11. [Getting Started](#getting-started)

---

## Overview

### What This Is

Two interconnected apps that form a friend-group economy:

- **Grub Exchange** (existing) — A Robinhood-style stock app where tickers represent friends. Users buy/sell shares and prices fluctuate based on demand. Unbought stocks depreciate.
- **Gooner Bank** (new) — A mobile app where users earn virtual currency ("Grub") by attending real-world events with their friend group. Earned Grub becomes buying power on Grub Exchange.

### Core Loop

```
1. Group admin creates an event (location + time + minimum attendees)
2. Friends show up to the event location
3. App detects X users within the geofence radius
4. Event becomes "confirmed" → passive currency generation begins
5. Each attendee earns Grub at a set rate while present
6. Earned Grub syncs to Grub Exchange as buying power
7. Users spend Grub to buy friend-stocks on Grub Exchange
```

---

## Architecture

```
┌──────────────────┐          ┌──────────────────┐
│   Gooner Bank    │          │  Grub Exchange    │
│   (React Native) │          │  (Next.js/Vercel) │
└────────┬─────────┘          └────────┬──────────┘
         │                             │
         │     REST / WebSocket        │
         ▼                             ▼
┌──────────────────────────────────────────────────┐
│              Shared API Layer                     │
│         (Vercel Serverless Functions)             │
│                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐│
│  │ Auth Service │  │ Wallet/Ledger│  │ Location ││
│  │             │  │   Service    │  │  Service  ││
│  └─────────────┘  └──────────────┘  └──────────┘│
│  ┌─────────────┐  ┌──────────────┐               │
│  │ Group/Event │  │ Stock Trading│               │
│  │   Service   │  │   Service    │               │
│  └─────────────┘  └──────────────┘               │
└────────────────────────┬─────────────────────────┘
                         │
              ┌──────────┴──────────┐
              ▼                     ▼
        ┌──────────┐         ┌──────────┐
        │ Postgres │         │  Redis   │
        │ (Vercel) │         │ (Upstash)│
        │          │         │          │
        │ • Users  │         │ • Live   │
        │ • Groups │         │   presence│
        │ • Events │         │ • Location│
        │ • Ledger │         │   pings  │
        │ • Trades │         │ • Job    │
        └──────────┘         │   queues │
                             └──────────┘
```

### Why This Architecture

- **Shared PostgreSQL**: Grub Exchange already uses Postgres on Vercel. The bank extends the same database with new tables rather than creating a separate data store. One source of truth for wallet balances means no sync issues between apps.
- **Vercel Serverless Functions**: Both apps share the same API layer deployed on Vercel. The bank's endpoints live alongside Grub Exchange's existing API routes.
- **Upstash Redis**: Vercel-native Redis for real-time presence tracking and background job scheduling (cron-based currency payouts). Upstash is serverless-friendly and has a generous free tier.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Existing Frontend** | Next.js (Grub Exchange) | Already deployed on Vercel |
| **New Mobile App** | React Native + Expo | Cross-platform, strong geolocation support, shared JS ecosystem with Next.js |
| **API** | Vercel Serverless Functions (Node.js) | Already in use, zero infra management |
| **Database** | PostgreSQL (Vercel Postgres / Neon) | Already in use for Grub Exchange |
| **ORM** | Prisma or Drizzle | Type-safe queries, migration management |
| **Realtime** | Upstash Redis + Vercel Cron | Presence tracking, scheduled currency payouts |
| **Geolocation** | Expo Location API | Background location, geofencing on both iOS/Android |
| **Auth** | Shared JWT / NextAuth / Clerk | Single identity across both apps |
| **Push Notifications** | Expo Notifications | Event reminders, payout alerts |

---

## Database Schema

> These tables extend the existing Grub Exchange database. Existing tables (like `users` and any trading tables) are not duplicated — they're referenced via foreign keys.

### New Tables

```sql
-- ============================================================
-- GROUPS
-- ============================================================

CREATE TABLE groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    invite_code     VARCHAR(20) UNIQUE NOT NULL,
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    currency_rate   DECIMAL(10,4) NOT NULL DEFAULT 1.0000,  -- Grub per minute
    min_attendance  INT NOT NULL DEFAULT 2,                  -- default threshold
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_groups_invite_code ON groups(invite_code);
CREATE INDEX idx_groups_owner ON groups(owner_id);


CREATE TABLE group_members (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        VARCHAR(20) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_group_members_user ON group_members(user_id);


-- ============================================================
-- EVENTS
-- ============================================================

CREATE TABLE events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id            UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name                VARCHAR(200) NOT NULL,
    description         TEXT,
    latitude            DECIMAL(10,7) NOT NULL,
    longitude           DECIMAL(10,7) NOT NULL,
    radius_meters       INT NOT NULL DEFAULT 100,        -- geofence radius
    starts_at           TIMESTAMPTZ NOT NULL,
    ends_at             TIMESTAMPTZ NOT NULL,
    min_attendance      INT,                             -- NULL = use group default
    currency_rate       DECIMAL(10,4),                   -- NULL = use group default
    status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled', 'active', 'confirmed', 'ended', 'cancelled')),
    confirmed_at        TIMESTAMPTZ,                     -- when threshold was first met
    created_by          UUID NOT NULL REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_time_window CHECK (ends_at > starts_at)
);

CREATE INDEX idx_events_group ON events(group_id);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_time ON events(starts_at, ends_at);


-- ============================================================
-- EVENT CHECK-INS (tracks each user's presence during an event)
-- ============================================================

CREATE TABLE event_checkins (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id                UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    checked_in_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checked_out_at          TIMESTAMPTZ,                  -- NULL = still checked in
    last_location_ping      TIMESTAMPTZ,
    is_within_radius        BOOLEAN NOT NULL DEFAULT FALSE,
    total_seconds_present   INT NOT NULL DEFAULT 0,       -- accumulated while in radius
    currency_earned         DECIMAL(12,4) NOT NULL DEFAULT 0.0000,
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_checkins_event ON event_checkins(event_id);
CREATE INDEX idx_checkins_user ON event_checkins(user_id);
CREATE INDEX idx_checkins_active ON event_checkins(event_id, is_within_radius)
    WHERE is_within_radius = TRUE;


-- ============================================================
-- WALLET / TRANSACTION LEDGER
-- ============================================================
-- This is the source of truth for all currency movement.
-- The wallet_balance on users is a cached total for fast reads.

-- Add wallet column to existing users table:
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance DECIMAL(12,4) NOT NULL DEFAULT 0.0000;

CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(30) NOT NULL
                    CHECK (type IN (
                        'event_earning',    -- earned from attending an event
                        'stock_buy',        -- spent buying a stock on Grub Exchange
                        'stock_sell',       -- received from selling a stock
                        'transfer',         -- peer-to-peer (future feature)
                        'adjustment'        -- manual admin correction
                    )),
    amount          DECIMAL(12,4) NOT NULL,   -- positive = credit, negative = debit
    balance_after   DECIMAL(12,4) NOT NULL,   -- snapshot of wallet after this tx
    reference_type  VARCHAR(30),              -- 'event', 'trade', etc.
    reference_id    UUID,                     -- FK to event_id or trade_id
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_transactions_user_time ON transactions(user_id, created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transactions_reference ON transactions(reference_type, reference_id);
```

### Entity Relationship Diagram

```
users (existing)
  │
  ├──< group_members >──┤
  │                      │
  │                   groups
  │                      │
  ├──< event_checkins >──┤
  │                      │
  │                   events
  │
  └──< transactions
```

---

## API Endpoints

### Auth (shared across both apps)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `GET` | `/api/auth/me` | Current user + wallet balance |

### Groups

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/groups` | Create a group |
| `GET` | `/api/groups` | List user's groups |
| `GET` | `/api/groups/:id` | Group details + member count |
| `POST` | `/api/groups/:id/join` | Join via invite code (body: `{ invite_code }`) |
| `DELETE` | `/api/groups/:id/leave` | Leave a group |
| `GET` | `/api/groups/:id/members` | List members |
| `PATCH` | `/api/groups/:id` | Update settings (admin only) |
| `POST` | `/api/groups/:id/invite` | Regenerate invite code (admin) |

### Events

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/groups/:id/events` | Create event (admin only) |
| `GET` | `/api/groups/:id/events` | List group events |
| `GET` | `/api/events/:id` | Event details + live attendance |
| `PATCH` | `/api/events/:id` | Update event (admin, only if scheduled) |
| `DELETE` | `/api/events/:id` | Cancel event (admin) |
| `POST` | `/api/events/:id/checkin` | Check in (body: `{ latitude, longitude }`) |
| `POST` | `/api/events/:id/ping` | Location heartbeat during event |
| `GET` | `/api/events/:id/attendees` | Current attendees + earnings so far |

### Wallet

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/wallet` | Balance + recent transactions |
| `GET` | `/api/wallet/transactions` | Paginated transaction history |
| `GET` | `/api/wallet/buying-power` | **Called by Grub Exchange** to check available Grub |
| `POST` | `/api/wallet/debit` | **Called by Grub Exchange** when a stock is purchased |
| `POST` | `/api/wallet/credit` | **Called by Grub Exchange** when a stock is sold |

> **Security**: The `/wallet/debit` and `/wallet/credit` endpoints should use a server-to-server API key (not user JWT) since Grub Exchange calls them on behalf of the user. Validate both the API key and the user ID.

---

## Event Lifecycle

```
┌─────────────┐
│  SCHEDULED   │ ← Admin creates event with location, time, threshold
└──────┬──────┘
       │  starts_at reached (Vercel Cron checks every minute)
       ▼
┌─────────────┐
│   ACTIVE     │ ← Users can now check in; location pings accepted
└──────┬──────┘
       │  checked_in_count ≥ min_attendance
       ▼
┌─────────────┐
│  CONFIRMED   │ ← Threshold met! Currency generation begins
└──────┬──────┘
       │  ends_at reached
       ▼
┌─────────────┐
│   ENDED      │ ← Final payouts calculated, transactions recorded
└─────────────┘

At any point before CONFIRMED, admin can:
┌─────────────┐
│  CANCELLED   │ ← No payouts, event archived
└─────────────┘
```

### Transition Logic (Vercel Cron Job)

```
Run every 60 seconds:

1. SCHEDULED → ACTIVE
   WHERE starts_at <= NOW() AND status = 'scheduled'

2. ACTIVE → CONFIRMED
   WHERE status = 'active'
     AND (SELECT COUNT(*) FROM event_checkins
          WHERE event_id = events.id AND is_within_radius = TRUE)
         >= COALESCE(events.min_attendance, groups.min_attendance)

3. CONFIRMED → payout tick
   For each confirmed event still before ends_at:
     For each user where is_within_radius = TRUE:
       - Increment total_seconds_present by 60
       - Increment currency_earned by (currency_rate / 60) * 60
       - Credit user wallet_balance

4. ACTIVE or CONFIRMED → ENDED
   WHERE ends_at <= NOW() AND status IN ('active', 'confirmed')
   - Finalize all checkins
   - Record transactions for each user's total earnings
```

---

## Currency Generation Logic

### Rate Calculation

```
effective_rate = COALESCE(event.currency_rate, group.currency_rate)

-- Per tick (every 60 seconds while event is CONFIRMED):
payout_per_tick = effective_rate  -- rate is defined as Grub per minute

-- Example: rate = 1.5 Grub/min, user present for 45 minutes
total_earned = 1.5 * 45 = 67.5 Grub
```

### Wallet Update (Atomic Transaction)

```sql
-- This MUST be atomic to prevent double-spending
BEGIN;

  -- Lock the user's row
  SELECT wallet_balance FROM users WHERE id = $user_id FOR UPDATE;

  -- Credit the earnings
  UPDATE users
  SET wallet_balance = wallet_balance + $payout,
      updated_at = NOW()
  WHERE id = $user_id;

  -- Update the checkin record
  UPDATE event_checkins
  SET total_seconds_present = total_seconds_present + 60,
      currency_earned = currency_earned + $payout,
      last_location_ping = NOW()
  WHERE event_id = $event_id AND user_id = $user_id;

  -- Record the transaction
  INSERT INTO transactions (user_id, type, amount, balance_after, reference_type, reference_id, description)
  VALUES (
    $user_id,
    'event_earning',
    $payout,
    (SELECT wallet_balance FROM users WHERE id = $user_id),
    'event',
    $event_id,
    'Passive income from: ' || $event_name
  );

COMMIT;
```

---

## Grub Exchange Integration

### How It Connects

Grub Exchange needs two changes to its existing trading logic:

1. **Before executing a buy**: Call the wallet API to verify and debit funds.
2. **After executing a sell**: Call the wallet API to credit proceeds.

### Buy Flow

```
User clicks "Buy" on Grub Exchange
         │
         ▼
┌─────────────────────────┐
│ GET /api/wallet/buying-power
│ Headers: x-api-key, x-user-id
│ Response: { balance: 105.00 }
└────────────┬────────────┘
             │
     balance ≥ order cost?
        │          │
       YES         NO → "Insufficient Grub"
        │
        ▼
┌─────────────────────────┐
│ POST /api/wallet/debit
│ Body: {
│   user_id,
│   amount: 25.00,
│   reference_type: "trade",
│   reference_id: trade_uuid,
│   description: "Bought 5 shares of GIANCARLO"
│ }
└────────────┬────────────┘
             │
        Execute trade
```

### Sell Flow

```
User clicks "Sell" on Grub Exchange
         │
    Execute trade
         │
         ▼
┌─────────────────────────┐
│ POST /api/wallet/credit
│ Body: {
│   user_id,
│   amount: 30.50,
│   reference_type: "trade",
│   reference_id: trade_uuid,
│   description: "Sold 3 shares of ANGEL"
│ }
└─────────────────────────┘
```

### Implementation in Grub Exchange

```typescript
// lib/wallet.ts — add to Grub Exchange codebase

const WALLET_API_KEY = process.env.WALLET_API_KEY;
const WALLET_BASE_URL = process.env.WALLET_BASE_URL; // same Vercel deployment

export async function getBuyingPower(userId: string): Promise<number> {
  const res = await fetch(`${WALLET_BASE_URL}/api/wallet/buying-power`, {
    headers: {
      'x-api-key': WALLET_API_KEY,
      'x-user-id': userId,
    },
  });
  const data = await res.json();
  return data.balance;
}

export async function debitWallet(params: {
  userId: string;
  amount: number;
  referenceId: string;
  description: string;
}): Promise<{ success: boolean; newBalance: number }> {
  const res = await fetch(`${WALLET_BASE_URL}/api/wallet/debit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': WALLET_API_KEY,
    },
    body: JSON.stringify({
      user_id: params.userId,
      amount: params.amount,
      reference_type: 'trade',
      reference_id: params.referenceId,
      description: params.description,
    }),
  });
  return res.json();
}

export async function creditWallet(params: {
  userId: string;
  amount: number;
  referenceId: string;
  description: string;
}): Promise<{ success: boolean; newBalance: number }> {
  const res = await fetch(`${WALLET_BASE_URL}/api/wallet/credit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': WALLET_API_KEY,
    },
    body: JSON.stringify({
      user_id: params.userId,
      amount: params.amount,
      reference_type: 'trade',
      reference_id: params.referenceId,
      description: params.description,
    }),
  });
  return res.json();
}
```

---

## Geolocation Strategy

### Approach: Hybrid (Geofencing + Periodic Polling)

| Phase | Method | Details |
|-------|--------|---------|
| **Before event** | Geofence | Register a geofence for the event location. OS notifies the app when the user enters the area — battery efficient. |
| **During event** | Polling | Once inside geofence, switch to GPS polling every 30-60 seconds for accurate presence tracking. |
| **Background** | Significant location changes | If user backgrounds the app, fall back to OS-level significant change monitoring. Less precise but keeps the session alive. |

### Haversine Distance Check (Server-Side)

```typescript
// utils/geo.ts

export function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6_371_000; // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinRadius(
  userLat: number, userLon: number,
  eventLat: number, eventLon: number,
  radiusMeters: number
): boolean {
  return haversineMeters(userLat, userLon, eventLat, eventLon) <= radiusMeters;
}
```

### React Native (Expo) Location Setup

```typescript
// In the mobile app
import * as Location from 'expo-location';

// Request permissions
const { status } = await Location.requestForegroundPermissionsAsync();
// For background: Location.requestBackgroundPermissionsAsync()

// Start watching position during an active event
const subscription = await Location.watchPositionAsync(
  {
    accuracy: Location.Accuracy.High,
    timeInterval: 30_000,    // every 30 seconds
    distanceInterval: 10,    // or every 10 meters moved
  },
  (location) => {
    // Send ping to server
    fetch(`/api/events/${eventId}/ping`, {
      method: 'POST',
      body: JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      }),
    });
  }
);
```

---

## Key Technical Considerations

### GPS Spoofing Prevention

For a friend group app, lightweight checks are sufficient:

- **Ping consistency**: Flag users whose location jumps unrealistically between pings (e.g., 500m in 30 seconds).
- **Cross-reference**: If 4 out of 5 users report similar coordinates and one is wildly different, flag it.
- **Mock location detection**: Both iOS and Android expose whether a location is from a mock provider. Check `location.mocked` on Android.

### Battery Optimization

- Only poll GPS during active events the user has checked into.
- Use geofencing (OS-level) for the initial check-in trigger — this is extremely battery-efficient.
- When the app is backgrounded, reduce poll frequency to every 2-5 minutes.
- Stop all location tracking immediately when the event ends.

### Currency Economics

Some knobs to consider:

- **Base rate**: Start conservative (e.g., 1 Grub/min). Easier to increase than to deflate.
- **Attendance multiplier**: More people = higher rate? e.g., `rate * (attendees / min_attendance)`.
- **Cooldown**: Prevent farming by limiting events per group per day.
- **Decay**: If too much Grub enters circulation, stock prices lose meaning. Consider a small transaction fee on trades (burned Grub) to create deflationary pressure.

### Vercel-Specific Notes

- **Cron jobs**: Vercel supports cron via `vercel.json`. The currency payout tick should run every minute during active events. Be mindful of the execution time limit (10s on Hobby, 60s on Pro).
- **Cold starts**: Serverless functions have cold starts. For the location ping endpoint (called every 30s per user), consider using Vercel Edge Functions for lower latency.
- **Database connections**: Use a connection pooler (Neon's built-in pooler or PgBouncer) to avoid exhausting Postgres connections from serverless functions.

```json
// vercel.json — example cron config
{
  "crons": [
    {
      "path": "/api/cron/process-events",
      "schedule": "* * * * *"
    }
  ]
}
```

---

## Getting Started

### 1. Database Migration

Run the SQL from the [Database Schema](#database-schema) section against your existing Postgres instance. If using Prisma or Drizzle, translate the SQL into your migration format.

### 2. New API Routes

Add the following route files to your Vercel project:

```
app/
  api/
    groups/
      route.ts                    # POST (create), GET (list)
      [id]/
        route.ts                  # GET, PATCH
        join/route.ts             # POST
        leave/route.ts            # DELETE
        members/route.ts          # GET
        events/route.ts           # POST (create), GET (list)
    events/
      [id]/
        route.ts                  # GET, PATCH, DELETE
        checkin/route.ts          # POST
        ping/route.ts             # POST
        attendees/route.ts        # GET
    wallet/
      route.ts                    # GET (balance + recent txns)
      transactions/route.ts       # GET (paginated history)
      buying-power/route.ts       # GET (for Grub Exchange)
      debit/route.ts              # POST (for Grub Exchange)
      credit/route.ts             # POST (for Grub Exchange)
    cron/
      process-events/route.ts     # Cron handler: transitions + payouts
```

### 3. Mobile App Setup

```bash
npx create-expo-app gooner-bank
cd gooner-bank
npx expo install expo-location expo-notifications expo-secure-store
```

### 4. Environment Variables

```env
# Shared (both apps)
DATABASE_URL=postgres://...
JWT_SECRET=...

# Gooner Bank specific
UPSTASH_REDIS_URL=...
UPSTASH_REDIS_TOKEN=...

# Grub Exchange → Wallet integration
WALLET_API_KEY=...          # server-to-server key
WALLET_BASE_URL=https://your-app.vercel.app
```

---

## Future Ideas

- **Daily claim**: Passive Grub for just logging in (already mentioned in Grub Exchange).
- **Dividends**: Stocks pay out Grub based on the "friend's" activity level.
- **Peer transfers**: Send Grub to other users.
- **Leaderboard rewards**: Top earners/traders get bonus Grub.
- **Event types**: Different events (hangouts, workouts, study sessions) could have different rates.
- **Streak bonuses**: Attend X events in a row for a multiplier.
