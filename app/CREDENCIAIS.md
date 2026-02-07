# Credenciais de teste (seed)

Banco: Postgres em localhost:5433 (docker)

- admin@admg.local / admin123 (ADMINISTRADORA)
- op1@admg.local / op123 (OPERADOR)
- op2@admg.local / op123 (OPERADOR)
- sindico1@admg.local / sindico123 (SINDICO)
- sindico2@admg.local / sindico123 (SINDICO)

# Observacao importante
- As rotas `/api/*` exigem autenticacao (JWT).
- O frontend atual nao envia token, entao a listagem/CRUD de condominios falha ate adicionarmos login.
