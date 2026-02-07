# ADM G - Modelo de dados (alto nivel)

## Entidades principais
1. Administradora
2. Condominio
3. Unidade
4. Morador
5. ResponsavelFinanceiro
6. Lancamento
7. Cobranca
8. Pagamento
9. Chamado
10. Comunicacao
11. Usuario
12. Permissao
13. LogAtividade

## Relacionamentos chave
1. Administradora -> Condominio (1:N)
2. Condominio -> Unidade (1:N)
3. Unidade -> Morador (1:N)
4. Unidade -> ResponsavelFinanceiro (1:1)
5. Condominio -> Lancamento (1:N)
6. Unidade -> Cobranca (1:N)
7. Cobranca -> Pagamento (1:N)
8. Condominio -> Chamado (1:N)
9. Condominio -> Comunicacao (1:N)
10. Usuario -> Permissao (N:N)
11. Usuario -> LogAtividade (1:N)
