---
name: Contrato AbacatePay
description: Regras não óbvias do contrato v2 usadas pelo billing do Rachador.
---

A assinatura Pro só deve ser concedida após um evento de webhook válido e idempotente. O retorno do checkout apenas inicia uma consulta periódica do status.

**Why:** O redirecionamento do navegador não comprova pagamento e pode acontecer antes do webhook.

**How to apply:** Não derive plano do cliente, da URL de retorno nem do sucesso ao criar checkout; use apenas o estado sincronizado pelo backend.

A assinatura do webhook é HMAC-SHA256 do corpo bruto, codificada em Base64. A AbacatePay trata cancelamento de assinatura como imediato.

**Why:** Esses detalhes diferem de padrões comuns de outros gateways e uma interpretação incorreta compromete autenticação ou mantém acesso indevido.

**How to apply:** Preserve o corpo bruto antes do parser JSON, compare assinaturas em tempo constante e não prometa acesso até o fim do ciclo após cancelamento.

Na criação de assinaturas recorrentes, a loja deve enviar somente métodos habilitados para assinatura; `PIX` é interpretado como PIX Automático e faz a API rejeitar o checkout quando essa função não está habilitada na loja.

**Why:** A AbacatePay pode aceitar cartão para recorrência mesmo quando PIX Automático não está disponível, mas rejeita toda a criação se `PIX` for incluído na lista de métodos.

**How to apply:** Não use esse caminho para o checkout de teste atual; use o endpoint transparente PIX e trate a cobrança como avulsa.

Os produtos atuais do Rachador foram criados em `devMode` e a loja pode rejeitar `CARD` mesmo com o contrato correto; isso é uma configuração/ aprovação da conta, não um fallback de payload.

**Why:** A API retorna `CARD is not available for this store` quando o método recorrente não está habilitado, e trocar para PIX também falha sem PIX Automático.

**How to apply:** Antes de testar ou publicar pagamentos reais, confirmar a habilitação do cartão ou do PIX Automático no painel, além de separar produtos, chave e webhook de Dev mode e Produção.

Para testar PIX sem PIX Automático, a AbacatePay oferece o checkout transparente `POST /v2/transparents/create` com `method: "PIX"`; a resposta contém `brCode` e `brCodeBase64`. Em Dev mode, `POST /v2/transparents/simulate-payment?id=...` pode marcar a cobrança como `PAID`.

**Why:** Checkout hospedado e assinatura tratam `PIX` como PIX Automático, enquanto o endpoint transparente gera uma cobrança PIX avulsa própria para testes.

**How to apply:** O fluxo PIX do Rachador é pagamento único, não renovação automática; o Pro só deve ser ativado pelo webhook `transparent.completed`, e o webhook Dev precisa estar inscrito nesse evento.

O webhook precisa existir no ambiente Dev e no ambiente Produção, e o endpoint de Produção deve apontar para a API publicada; uma build antiga pode responder `/api/healthz` e ainda retornar 404 para a rota de webhook recém-criada.

**Why:** A publicação do web artifact e a atualização da API publicada podem ficar defasadas em relação ao workflow local, enquanto a AbacatePay não repete entregas que receberam respostas 4xx.

**How to apply:** Depois de criar ou alterar a rota de webhook, publique o projeto antes de testar a cobrança; valide `POST /api/webhooks/abacatepay` no domínio público antes de simular o PIX.