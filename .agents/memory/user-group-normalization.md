---
name: Normalização de usuários e grupos
description: Decisão sobre a relação N:N de usuários com grupos sem substituir os participantes existentes.
---

Mantenha `participantes` como a entidade operacional dos fluxos de despesas, saldos, pagamentos e Pix. Use `usuarios` e `grupo_usuarios` como o modelo normalizado de identidade local e associação N:N com grupos.

**Why:** Participantes já são registros específicos de cada grupo e sustentam todas as foreign keys do produto. Substituí-los quebraria dados e fluxos existentes; a camada N:N foi adicionada de forma complementar e não destrutiva.

**How to apply:** Novos trabalhos de identidade/múltiplos grupos podem evoluir `usuarios` e `grupo_usuarios`, mas devem preservar as referências existentes a `participantes` até existir uma migração explicitamente planejada.