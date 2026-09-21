---
name: Permissões dos planos
description: Separação entre os recursos dos planos pagos do Rachador.
---

O plano PRO libera leitura de notas fiscais, mas não libera despesas por voz. O plano MASTER libera leitura de notas fiscais e despesas por voz.

**Why:** Os planos pagos têm preços e proposta diferentes; liberar voz para qualquer plano pago faria o PRO entregar o benefício principal do MASTER.

**How to apply:** A autorização deve ser calculada no backend a partir de `assinaturas.plano` e `status = ACTIVE`; a UI deve apenas refletir essa regra e nunca substituir a verificação do backend.