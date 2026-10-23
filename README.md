# ChatApp

Bun workspace monorepo for the ChatApp mobile client, backend API, and shared TypeScript types.

## Structure

- `apps/mobile` - Expo and React Native client
- `backend` - Bun HTTP API
- `packages/shared` - types shared by the client and API

## Setup

From the repository root, install workspace dependencies:

```bash
bun install
```

Start the mobile app:

```bash
cd apps/mobile
bun run start
```

Start the backend in a separate terminal:

```bash
cd backend
bun run dev
```

The backend health endpoint is available at `http://localhost:3000/health`.
