# Clinic Voice AI — Backend

Production-grade backend foundation for an AI Voice Receptionist serving medical clinics.

## Tech Stack

- **Runtime:** Node.js (>= 18)
- **Framework:** Express.js
- **Database:** PostgreSQL with Prisma ORM
- **Language:** JavaScript

## Architecture

MVC + Service layer with clear separation of concerns:

```
Request → Route → Controller → Service → Repository → Database
                      ↓
                 Middleware (validation, error handling)
```

## Getting Started

### Prerequisites

- Node.js >= 18
- PostgreSQL (optional for initial local dev — server starts without DB in development)

### Installation

```bash
cd backend
cp .env.example .env
npm install
npm run db:generate
```

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

## Scripts

| Script            | Description                    |
| ----------------- | ------------------------------ |
| `npm start`       | Start production server        |
| `npm run dev`     | Start with nodemon (hot reload)|
| `npm run lint`    | Run ESLint                     |
| `npm run lint:fix`| Auto-fix ESLint issues         |
| `npm run format`  | Format code with Prettier      |
| `npm run db:generate` | Generate Prisma client     |
| `npm run db:migrate`  | Run Prisma migrations      |
| `npm run db:push`     | Push schema to database    |
| `npm run db:studio`   | Open Prisma Studio         |

## API Endpoints

| Method | Path      | Description          |
| ------ | --------- | -------------------- |
| GET    | `/health` | Health check (JSON)  |

### Health Check Response

```json
{
  "status": "ok",
  "timestamp": "2026-07-31T10:00:00.000Z",
  "uptime": 12.345,
  "environment": "development"
}
```

## Environment Variables

See `.env.example` for all required variables.

## Project Structure

```
backend/
├── src/
│   ├── config/          # App and database configuration
│   ├── controllers/     # Request handlers (thin layer)
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic layer
│   ├── repositories/    # Data access layer
│   ├── middleware/      # Express middleware
│   ├── utils/           # Shared utilities (logger, etc.)
│   ├── validators/      # Request validation schemas
│   ├── tools/           # AI agent tools
│   ├── prompts/         # LLM prompt templates
│   ├── integrations/    # Third-party service clients
│   ├── database/        # Database seeds, migrations helpers
│   ├── app.js           # Express application setup
│   └── server.js        # Server entry point
├── prisma/
│   └── schema.prisma    # Prisma schema
└── package.json
```

## License

Private — UNLICENSED
