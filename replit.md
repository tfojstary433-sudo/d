# ScoreSync - Live Football Match Tracker

## Overview

ScoreSync is a real-time football match tracking application designed to integrate with Roblox game servers. It provides a web dashboard for viewing live match scores, events (goals, cards, substitutions), and match statistics. The backend receives match data from Roblox Lua scripts via HTTP API calls and displays them on a modern React frontend.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight alternative to React Router)
- **State Management**: TanStack React Query for server state with automatic polling for live updates
- **UI Components**: Shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme (sports/stadium aesthetic with lime green accents)
- **Animations**: Framer Motion for smooth transitions
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ES modules)
- **API Design**: RESTful endpoints defined in `shared/routes.ts` with Zod validation
- **Database ORM**: Drizzle ORM with PostgreSQL
- **Session Storage**: connect-pg-simple for PostgreSQL-backed sessions

### Data Flow
1. Roblox game servers send HTTP requests to the Express API (match start, score updates, events)
2. Express routes validate input with Zod schemas and persist to PostgreSQL via Drizzle
3. React frontend polls the API every 3-5 seconds to fetch live match data
4. Match events (goals, cards, substitutions) are stored separately and joined on fetch

### Project Structure
```
├── client/           # React frontend (Vite)
│   └── src/
│       ├── components/   # UI components (MatchCard, MatchEvents, Navigation)
│       ├── pages/        # Route pages (Home, MatchDetail)
│       ├── hooks/        # React Query hooks (use-matches)
│       └── lib/          # Utilities (queryClient, utils)
├── server/           # Express backend
│   ├── routes.ts     # API route handlers
│   ├── storage.ts    # Database access layer
│   └── db.ts         # Drizzle database connection
├── shared/           # Shared code between client/server
│   ├── schema.ts     # Drizzle table definitions
│   └── routes.ts     # API route contracts with Zod
└── migrations/       # Drizzle database migrations
```

### Key API Endpoints
- `POST /api/match/start` - Create new match with team names
- `POST /api/match/end` - End an active match
- `POST /api/match/sync` - Sync match state (timer, score, period) from Roblox
- `POST /api/match/event` - Log match events (goals, cards, substitutions)
- `GET /api/matches` - List all matches
- `GET /api/match/:uuid` - Get match details with events

### Player Statistics (by Roblox Nick/ID)
- `GET /api/roblox/player/:robloxId` - Get player profile with stats summary
- `GET /api/roblox/player/:robloxId/matches` - Get player match history
- `GET /api/roblox/player/:robloxId/tournament/:tournamentId` - Get player stats for specific tournament
- `POST /api/roblox/player/:robloxId/record` - Record player match to history

### Tournament Endpoints
- `POST /api/tournament/startmatch` - Start tournament match (requires token)
- `POST /api/tournament/endmatch` - End tournament match (auto-updates group table and player stats)
- `GET /api/tournaments` - Get all tournaments

### Database Schema
- **matches**: Stores match metadata (teams, scores, timer, period, status)
- **matchEvents**: Stores individual events with type, data, and minute
- **playerMatchHistory**: Stores player match history with tournamentId/tournamentName for tournament tracking

## External Dependencies

### Database
- **PostgreSQL**: Primary database via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe SQL query builder and schema management

### Third-Party UI Libraries
- **Radix UI**: Accessible, unstyled component primitives
- **Shadcn/ui**: Pre-built component implementations using Radix
- **Lucide React**: Icon library
- **Framer Motion**: Animation library

### Build & Development
- **Vite**: Frontend build tool with HMR
- **esbuild**: Server-side bundling for production
- **TypeScript**: Full type safety across client and server

### Roblox Integration
The application is designed to receive HTTP requests from Roblox Lua scripts running in a game server. The scripts send match updates (score changes, timer updates, events) to the backend API. The frontend then displays this data in real-time through polling.