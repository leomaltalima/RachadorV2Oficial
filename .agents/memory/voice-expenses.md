---
name: Gastos por voz
description: Limites de confiança, persistência e responsabilidade entre IA, backend e clientes no fluxo de despesas narradas.
---

O áudio de gastos deve ser usado apenas durante a transcrição e interpretação. A IA devolve rascunhos revisáveis, nunca despesas persistidas.

**Why:** Linguagem natural pode ser ambígua ou incompleta. Persistir diretamente uma interpretação criaria risco financeiro, associaria nomes inventados e impediria a correção segura pelo usuário.

**How to apply:** O backend resolve nomes somente contra participantes reais, sinaliza ambiguidades e calcula as divisões. Web e mobile mantêm o rascunho no cliente e chamam a criação existente apenas após confirmação explícita, usando uma chave estável por rascunho para impedir duplicação após perda de resposta. Não armazenar áudio sem uma nova decisão de produto.