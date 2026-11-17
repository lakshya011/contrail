# Contrail

A private flight log with a **Passport** of your lifetime travel stats. It finds every flight since 2016 by reading your Gmail.

- **Flights**: upcoming and past flights by year, with search, a detail page, a route map and links back to the source emails.
- **Passport**: totals (flights, distance, time in the air, airports, airlines, countries), a globe of every route, top airports, airlines, routes and aircraft, records, seat and time-of-day habits, a per-year filter, a story-style **Year in Review**, and a shareable PNG card.
- **Review**: flights the importer was unsure about, plus adding a flight by hand.
- **Settings**: Gmail import progress, your names as printed on tickets, units, export to CSV or JSON.

## How the Gmail import works
1. **Search** (`src/lib/gmail/senders.ts`): broad search for airline, booking-site, itinerary, boarding-pass and cancellation emails from 2016 on. Add senders there if some are missed.
2. **Fetch** (`src/lib/gmail/fetch.ts`): email HTML converted to text, plus the text of PDF e-tickets.
3. **Built-in flight markup** (`src/lib/ingest/markup.ts`): reads schema.org `FlightReservation` blocks for free when an email has them.
4. **Pre-filter** (`src/lib/ingest/prefilter.ts`): skips emails with no flight number and travel words, to save AI cost.
5. **Claude** (`src/lib/ingest/llm-extract.ts`): Claude Haiku, through the Vercel AI Gateway, reads emails without markup and returns flight legs.
6. **Merge** (`src/lib/ingest/reconcile.ts`): emails about the same flight (booking, check-in, boarding pass, change, cancellation) become one flight. The newest email wins. Flights for other passengers are marked.
7. **Enrich** (`src/lib/ingest/enrich.ts`): distance, UTC times and duration from the airport database. Unsure flights go to Review.

The import runs in short passes that can resume. The **Sync now** button repeats passes until the import is done, and a daily Vercel Cron job picks up new mail. Email bodies are never stored.

## Run locally (with sample data, no Google needed)
```bash
npm install
cp .env.example .env.local   # fill SESSION_SECRET and TOKEN_ENC_KEY, set DEMO_MODE=1
npm run setup                # creates the local database in ./.data and loads airports + airlines
npm run dev
```
Open http://localhost:3000 and choose **Preview with sample data**.

## Connect your real Gmail
1. **Google Cloud Console**
   1. Create a project.
   2. Enable the **Gmail API**.
   3. Set up the **OAuth consent screen**:
      - User type: External.
      - Add your Gmail address as a test user.
      - Add the scope `https://www.googleapis.com/auth/gmail.readonly`.
   4. Set the consent screen's publishing status to **In production**. You do not need Google's verification for personal use; you will see an "unverified app" warning once. If you leave it in **Testing**, Google ends the sign-in every 7 days.
   5. Create an **OAuth client ID** of type Web application, with these redirect URIs:
      - `http://localhost:3000/api/auth/callback`
      - `https://<your-domain>/api/auth/callback`
2. **Environment** in `.env.local`:
   - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from step 1
   - `ALLOWED_EMAIL`: your Gmail address
   - `AI_GATEWAY_API_KEY`: from Vercel → AI Gateway. Turn on zero data retention there.
3. Run `npm run dev`, sign in, check **Your names on tickets** in Settings, then click **Start Gmail import**.

## Deploy to Vercel
```bash
npm i -g vercel
vercel link
```
1. In the Vercel dashboard, add **Neon Postgres** from the Marketplace. This sets `DATABASE_URL`.
2. Add the other variables from `.env.example`, including `CRON_SECRET`. Do **not** set `DEMO_MODE`.
3. Copy the variables locally, create the tables and load the reference data, then deploy:
   ```bash
   vercel env pull .env.local
   npm run setup
   vercel deploy --prod
   ```

Vercel Hobby runs cron once a day (`vercel.json`). On Pro you can make it more frequent.

## Scripts
| Command | What it does |
|---|---|
| `npm test` | Unit tests: distance, time zones, merging emails, name matching, markup, Passport stats |
| `npm run db:generate` | New migration after editing `src/db/schema.ts` |
| `npm run setup` | Apply migrations, then load airports and airlines |

## Not built yet (later phases)
- **Live status** for upcoming flights (gate, delay, aircraft) through AeroDataBox, with push notifications and a calendar feed.
- **Past-flight enrichment** with actual times and tail numbers through FlightAware AeroAPI (paid), and on-time stats.
