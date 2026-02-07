# ADM G - API endpoints (rascunho)

## Autenticacao
1. POST /auth/login
2. POST /auth/logout

## Condomino
1. GET /condominios
2. POST /condominios
3. PATCH /condominios/{id}

## Unidades e moradores
1. GET /condominios/{id}/unidades
2. POST /condominios/{id}/unidades
3. POST /unidades/{id}/moradores

## Financeiro
1. GET /condominios/{id}/lancamentos
2. POST /condominios/{id}/lancamentos
3. GET /condominios/{id}/rateios

## Cobrancas
1. GET /condominios/{id}/cobrancas
2. POST /condominios/{id}/cobrancas
3. POST /cobrancas/{id}/pagamentos

## Comunicados e chamados
1. GET /condominios/{id}/comunicados
2. POST /condominios/{id}/comunicados
3. GET /condominios/{id}/chamados
4. POST /condominios/{id}/chamados

## Relatorios
1. GET /condominios/{id}/relatorios/mensal

## Importacao
1. POST /condominios/{id}/importacao
