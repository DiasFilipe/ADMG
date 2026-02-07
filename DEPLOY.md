# Deploy (Railway)

Este guia assume o repo na raiz `gestora/admg` e dois servicos no Railway: backend e frontend.

## Backend (API)
1. Crie um novo servico no Railway e conecte o repo.
2. Em Settings > Source:
   - Root Directory: `app/backend`
   - Build Command: `npm run prisma:generate && npm run build`
   - Start Command: `npx prisma migrate deploy && npm run start`
3. Adicione o plugin Postgres do Railway ao servico.
4. Configure as variaveis de ambiente:
   - `DATABASE_URL` = string do Postgres (Railway fornece automaticamente ao anexar o plugin)
   - `JWT_SECRET` = segredo forte
   - `CORS_ORIGIN` = URL publica do frontend (ex: `https://seu-frontend.railway.app`)
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI` = `https://SEU-BACKEND.railway.app/auth/google/callback`

## Frontend (Vite)
1. Crie outro servico no Railway (mesmo repo).
2. Em Settings > Source:
   - Root Directory: `app/frontend`
   - Build Command: `npm run build`
   - Start Command: `npm run start`
3. Configure as variaveis de ambiente:
   - `VITE_API_URL` = URL publica do backend (ex: `https://seu-backend.railway.app`)

## Google OAuth (passos basicos)
1. Console do Google Cloud:
   - `https://console.cloud.google.com/`
2. Crie/seleciona um projeto e configure OAuth.
3. Authorized JavaScript origins:
   - URL do frontend (ex: `https://seu-frontend.railway.app`)
4. Authorized redirect URIs:
   - `https://SEU-BACKEND.railway.app/auth/google/callback`

## Observacoes
- O Railway define `PORT` automaticamente; a API usa `process.env.PORT`.
- Se o deploy falhar dizendo que nao encontrou app Node, revise o Root Directory.
- Para seed em producao, rode manualmente no Railway:
  - `npx prisma db seed`

