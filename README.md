# Taiwan Trip Planner

A responsive trip-planning workspace built with React, TypeScript, Mantine, React Leaflet, dnd-kit, and Supabase.

## Features

- Map-first desktop workspace with a large interactive Taiwan map
- All / Unscheduled / Day filters displayed directly over the map
- Day-numbered and stop-numbered map pins
- Route lines between ordered places for each itinerary day
- One-click handoff of a selected day route to Google Maps
- Searchable place library with categories and notes
- Drag-and-drop scheduling across itinerary days
- Editable trip name, start date, and day labels
- Add, edit, and remove places
- Responsive Map / Places / Planner navigation
- Passwordless email sign-in and email-based trip collaborators
- Supabase cloud persistence across laptop and mobile
- Automatic migration of the existing browser `localStorage` trip
- Cloud save status and exportable JSON backup
- GitHub Pages deployment workflow

## Supabase setup

The frontend is configured for project `elqiycppfiafleglqkla` using its public publishable key. No database password, secret key, or service-role key is used by the browser.

### 1. Create the table and security policy

Open **Supabase Dashboard → SQL Editor**, copy `supabase/schema.sql`, and run it once. The script creates the trip and collaborator tables and enables Row Level Security. If the old schema is already installed, rerun this updated script to replace the trip policy and add collaboration support.

### 2. Configure authentication redirects

Open **Authentication → URL Configuration** and add the URLs where the app runs, for example:

```text
http://localhost:5173/
https://<github-username>.github.io/trip-planner/
```

Set the production app URL as the Site URL after GitHub Pages is enabled.

### 3. Optional environment overrides

The checked-in project URL and publishable key allow the existing deployment to work without GitHub secrets. They are public client configuration, not privileged credentials. To point a local or forked build at another project, create `.env.local`:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

Never add a Supabase secret key, service-role key, database password, or JWT signing secret to Vite environment variables.

## Data and synchronization model

Each authenticated user has one row in `public.trip_plans`. The complete `TripState` is stored as JSONB and automatically saved after edits.

On the first successful login:

1. The app checks Supabase for an existing cloud trip.
2. If none exists, it imports the previous `taiwan-trip-planner:v1` browser data when available.
3. The imported trip is uploaded to Supabase and the old local trip record is removed.
4. Other devices signed in with the same email load the cloud copy.

The Supabase authentication session still uses browser storage so a device remains signed in, but the itinerary itself is stored in Supabase.

## Sharing a trip

The owner selects **Share trip** in the header and enters a collaborator's email. The collaborator opens the app and uses the existing magic-link sign-in with that exact email; the database claims the pending invitation and grants editor access to the owner's trip. No password, shared account, or public edit link is used.

Owners can remove a collaborator at any time. Access is enforced by Supabase Row Level Security, not only hidden in the UI.

## Local development

```bash
npm install
npm run dev
```

Open the URL shown by Vite and request a magic sign-in link.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

## Routing model

Routes are manual and free: drag place cards into your preferred order, select public transport, walking, cycling, or driving for each connection, then open that individual connection in Google Maps. No Google API key, billing account, or Supabase Edge Function is needed.

## Deployment

The included GitHub Actions workflow builds and deploys the `dist` directory to GitHub Pages. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
