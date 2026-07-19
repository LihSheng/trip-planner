# Taiwan Trip Planner

A responsive trip-planning workspace built with React, TypeScript, Mantine, React Leaflet, and dnd-kit.

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
- Local browser persistence with exportable JSON
- GitHub Pages deployment workflow

## Local development

```bash
npm install
npm run dev
```

Open the URL shown by Vite.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

## Storage model

The current release stores trip data in `localStorage`. This keeps the app fast and deployable as a static site, but data is scoped to the current browser. A future collaborative version can replace the persistence hook with a hosted database and authentication without changing the planner UI.

## Routing model

The in-app route line connects places in itinerary order and is intended as a quick visual planning aid. The **Open route** action sends the same ordered stops to Google Maps for road routing and navigation. A future release can integrate a dedicated routing API for in-app travel distance and duration estimates.

## Deployment

The included GitHub Actions workflow builds and deploys the `dist` directory to GitHub Pages. In repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
