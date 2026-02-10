# Project: Grub Exchange + Gooner Bank

## Overview
This is a two-app ecosystem: Grub Exchange (existing Robinhood-style stock app)
and Gooner Bank (new location-based currency generator). See
`GOONER_BANK_SPEC.md` for the full architecture, schema, API design, and
integration plan.

## Existing Stack
- Framework: Next.js (App Router)
- Database: PostgreSQL (Vercel Postgres / Neon)
- Deployment: Vercel
- ORM: [Prisma or Drizzle — whichever your friend uses]

## Key Conventions
- All new API routes go in `app/api/`
- Use TypeScript for all new code
- Follow existing code style and patterns in the repo
- Database migrations should be compatible with the existing schema

## What Needs to Be Built
Refer to `GOONER_BANK_SPEC.md` for full details. High-level:
1. Database migrations for: groups, group_members, events, event_checkins, transactions
2. Add wallet_balance column to existing users table
3. API routes for groups, events, wallet, and cron jobs
4. Wallet integration (buying-power, debit, credit) for Grub Exchange trades
5. Utility functions: haversine distance, atomic wallet transactions
