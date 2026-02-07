# ADM G App

## Estrutura
- backend: API Node.js + Prisma
- frontend: React + Vite
- docker-compose.yml: Postgres local

## Passos
1. Subir o Postgres: `docker compose up -d`
2. Backend: `cd backend`, `cp .env.example .env`, `npm install`, `npx prisma migrate dev --name init`, `npm run prisma:seed`, `npm run dev`
3. Frontend: `cd ../frontend`, `cp .env.example .env`, `npm install`, `npm run dev`

## Usuarios ficticios (seed)
- admin@admg.local / admin123 (ADMINISTRADORA)
- op1@admg.local / op123 (OPERADOR)
- op2@admg.local / op123 (OPERADOR)
- sindico1@admg.local / sindico123 (SINDICO)
- sindico2@admg.local / sindico123 (SINDICO)

## Login com Google
Configure no backend:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI (ex: http://localhost:3001/auth/google/callback)

No frontend, use o botao "Entrar com Google". Se ja estiver logado, use "Vincular Google" para associar a conta.

## Rotas iniciais
- GET /health
- POST /auth/login
- GET /auth/me
- GET /api/condominios
- POST /api/condominios
