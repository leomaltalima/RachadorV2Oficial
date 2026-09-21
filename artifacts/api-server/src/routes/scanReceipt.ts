import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import { getAuth } from "@clerk/express";
import { requireFeatureAccess } from "../lib/planPermissions";

const router = Router();

router.post("/scan-receipt", async (req, res) => {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Faça login para usar o scanner de notas." });
      return;
    }
    if (!(await requireFeatureAccess(req, res, "receiptScanning"))) return;
    const { image } = req.body as { image: string };

    if (!image) {
      res.status(400).json({ error: "Imagem não fornecida" });
      return;
    }

    // Strip data URL prefix if present
    const base64 = image.includes(",") ? image.split(",")[1] : image;
    const mimeMatch = image.match(/^data:([^;]+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";

    const receiptModel = "gpt-5.6-luna";
    const response = await openai.chat.completions.create({
      model: receiptModel,
      max_completion_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: `Você é um assistente que lê notas fiscais de restaurantes e bares brasileiros.
Analise a imagem desta nota fiscal e extraia os itens consumidos.

Retorne APENAS um JSON válido (sem markdown, sem blocos de código) com a seguinte estrutura:
{
  "itens": [
    {
      "nome": "nome do item",
      "quantidade": número inteiro,
      "precoUnitario": valor em reais como número decimal,
      "precoTotal": valor total em reais como número decimal
    }
  ],
  "taxaServico": porcentagem como número decimal ou null se não houver,
  "totalSemTaxa": valor total sem taxa de serviço em reais,
  "totalComTaxa": valor total com taxa de serviço em reais ou null
}

Regras importantes:
- Inclua APENAS itens consumidos (comidas e bebidas), não inclua subtotais, taxas ou totais
- Se um item aparece com quantidade > 1, use esse número
- taxaServico deve ser o percentual (ex: 10 para 10%), não o valor monetário
- Se não houver taxa de serviço, coloque null
- Valores monetários devem ser números decimais (ex: 12.50, não "R$ 12,50")
- Se não conseguir ler algum campo, use valores estimados baseados no contexto`,
            },
          ],
        },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "";

    let parsed;
    try {
      parsed = JSON.parse(content.trim());
    } catch {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Não foi possível interpretar a resposta da IA");
      }
    }

    res.json(parsed);
  } catch (error) {
    console.error("Erro ao escanear nota:", error);
    res.status(500).json({
      error: "Erro ao processar a nota fiscal. Tente novamente.",
    });
  }
});

export default router;
