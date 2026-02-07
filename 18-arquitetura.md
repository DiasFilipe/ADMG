# ADM G - Arquitetura (alto nivel)

## Objetivo
Arquitetura simples, multi-condominio e segura, com foco em operacao diaria e fechamento mensal.

## Componentes principais
1. Web app para operadores e sindicos
2. API backend com autenticacao e autorizacao
3. Banco de dados relacional
4. Gerador de PDF para relatorios
5. Jobs em background para cobrancas e notificacoes
6. Armazenamento de arquivos (relatorios e comprovantes)

## Multi-condominio
1. Separar dados por condominio via tenant_id
2. Filtrar acesso por permissao e condominio
3. Auditoria por usuario e condominio

## Integracoes
1. Pix via PSP
2. Boleto via PSP ou banco
3. Email para comunicados (WhatsApp opcional no futuro)

## Observabilidade
1. Logs por acao e por condominio
2. Metricas de uso e tempo de fechamento
3. Alertas para falha de cobranca

## Seguranca e LGPD
1. Controle de acesso por perfis
2. Criptografia de dados sensiveis
3. Backups diarios
4. Retencao e exclusao sob demanda
