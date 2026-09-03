import { useState } from "react";
import { useCreateDespesa, getListDespesasQueryKey, getGetSaldoQueryKey } from "@workspace/api-client-react";
import type { VoiceExpenseParseResponse, GrupoComParticipantes, VoiceExpenseDraft, DespesaInput } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { VoiceDraftEditor } from "./voice-draft-editor";
import { formatCurrency } from "@/lib/utils";
import { Plus, Info, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useLocation } from "wouter";

export function VoiceExpenseReviewer({
  grupo,
  parseResult,
  onClose,
}: {
  grupo: GrupoComParticipantes;
  parseResult: VoiceExpenseParseResponse;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<VoiceExpenseDraft[]>(parseResult.despesas);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  
  const createDespesa = useCreateDespesa();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const handleUpdateDraft = (index: number, updated: VoiceExpenseDraft) => {
    setDrafts((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
  };

  const handleDeleteDraft = (index: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddManualDraft = () => {
    const newDraft: VoiceExpenseDraft = {
      id: Math.random().toString(36).substring(7),
      descricao: "",
      valor: null,
      categoria: "Outros",
      tipoDivisao: "igual",
      pagoPorId: null,
      pagoPorNome: null,
      divisoes: [],
      nomesNaoResolvidos: [],
      precisaConfirmacao: [],
      confianca: {
        valor: "alta",
        pagador: "alta",
        participantes: "alta",
        categoria: "alta"
      },
      observacoes: null
    };
    setDrafts((prev) => [...prev, newDraft]);
  };

  const isDraftValid = (d: VoiceExpenseDraft) => {
    if (!d.descricao) return false;
    if (!d.valor || d.valor <= 0) return false;
    if (!d.pagoPorId) return false;
    if (!d.divisoes || d.divisoes.length === 0) return false;
    
    const sumInCents = d.divisoes.reduce((acc, div) => acc + Math.round((div.valorDevido || 0) * 100), 0);
    if (sumInCents !== Math.round(d.valor * 100)) return false;

    if (d.tipoDivisao === "porcentagem") {
      const sumPct = d.divisoes.reduce((acc, div) => acc + (div.porcentagem || 0), 0);
      if (Math.abs(sumPct - 100) > 0.001) return false;
    }
    if (d.tipoDivisao === "cotas") {
      const sumShares = d.divisoes.reduce((acc, div) => acc + (div.cotas || 0), 0);
      if (sumShares <= 0 || d.divisoes.some((div) => (div.cotas ?? 0) < 0)) return false;
    }

    return true;
  };

  const allValid = drafts.length > 0 && drafts.every(isDraftValid);
  const totalValue = drafts.reduce((acc, d) => acc + (d.valor || 0), 0);

  const handleConfirm = async () => {
    if (!allValid) return;
    setIsSubmitting(true);
    let successCount = 0;
    
    for (let i = 0; i < drafts.length; i++) {
      const d = drafts[i];
      const despesaInput: DespesaInput = {
        descricao: d.descricao,
        valor: d.valor!,
        categoria: d.categoria as any || "Outros",
        tipoDivisao: d.tipoDivisao as any || "igual",
        pagoPorId: d.pagoPorId!,
        idempotencyKey: d.id,
        divisoes: d.divisoes
          .filter((div) =>
            d.tipoDivisao === "igual" ||
            div.valorDevido > 0 ||
            (div.porcentagem ?? 0) > 0 ||
            (div.cotas ?? 0) > 0
          )
          .map(div => ({
            participanteId: div.participanteId,
            valorDevido: div.valorDevido,
            porcentagem: div.porcentagem,
            cotas: div.cotas
          }))
      };

      try {
        await createDespesa.mutateAsync({
          grupoId: grupo.id,
          data: despesaInput
        });
        successCount++;
        setProgress(successCount);
      } catch (err: any) {
         toast({
           title: "Erro ao salvar despesas",
           description: `Foram salvas ${successCount} de ${drafts.length} despesas. Falha na despesa: "${d.descricao}".`,
           variant: "destructive"
         });
         setIsSubmitting(false);
         setDrafts(drafts.slice(i));
          setProgress(0);
         queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupo.id) });
         queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupo.id) });
         return;
      }
    }

    queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupo.id) });
    queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupo.id) });
    toast({ title: "Todas as despesas adicionadas com sucesso!" });
    setLocation(`/g/${grupo.id}`);
  };

  return (
    <div className="p-4 sm:p-6 pb-40 max-w-2xl mx-auto space-y-6">
       <div className="bg-primary/5 rounded-2xl p-5 border border-primary/20">
          <div className="flex items-start gap-3">
             <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
             <div className="space-y-2">
                <p className="text-sm italic text-muted-foreground leading-relaxed">"{parseResult.transcricao}"</p>
                <p className="text-sm font-semibold text-foreground">{parseResult.resumo}</p>
             </div>
          </div>
          {parseResult.avisos.length > 0 && (
             <div className="mt-4 pt-4 border-t border-primary/10 space-y-2">
                {parseResult.avisos.map((aviso, idx) => (
                   <div key={idx} className="flex items-start gap-2 text-xs font-medium text-amber-600 dark:text-amber-500">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{aviso}</span>
                   </div>
                ))}
             </div>
          )}
       </div>

       <div className="space-y-6">
          <div className="flex items-center justify-between">
             <h3 className="font-bold text-lg">Despesas identificadas ({drafts.length})</h3>
             <span className="font-bold text-xl text-primary">{formatCurrency(totalValue)}</span>
          </div>

          {drafts.length === 0 ? (
             <div className="text-center p-8 bg-secondary/20 rounded-2xl border-2 border-dashed border-border/50">
                <p className="text-muted-foreground font-medium">Nenhuma despesa identificada.</p>
             </div>
          ) : (
             <div className="space-y-4">
                {drafts.map((draft, idx) => (
                   <VoiceDraftEditor
                      key={draft.id || idx}
                      draft={draft}
                      grupo={grupo}
                      isValid={isDraftValid(draft)}
                      onChange={(updated) => handleUpdateDraft(idx, updated)}
                      onDelete={() => handleDeleteDraft(idx)}
                   />
                ))}
             </div>
          )}

          <Button variant="outline" className="w-full h-14 border-2 border-dashed gap-2 rounded-xl text-muted-foreground hover:text-foreground" onClick={handleAddManualDraft}>
             <Plus className="w-5 h-5" /> Adicionar despesa faltante
          </Button>
       </div>

       <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/90 backdrop-blur-xl border-t border-border z-10 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.05)]">
          <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-4">
             <div className="flex-1 text-sm font-medium w-full sm:w-auto">
                {allValid ? (
                   <span className="text-emerald-600 dark:text-emerald-500 flex items-center justify-center sm:justify-start gap-2">
                      <CheckCircle2 className="w-5 h-5" /> Todas as despesas prontas
                   </span>
                ) : (
                   <span className="text-destructive flex items-center justify-center sm:justify-start gap-2">
                      <AlertTriangle className="w-5 h-5" /> Verifique os erros nas despesas
                   </span>
                )}
             </div>
             <Button
                size="lg"
                className="w-full sm:w-auto px-8 h-14 text-base shadow-xl shadow-primary/20"
                onClick={handleConfirm}
                disabled={!allValid || isSubmitting || drafts.length === 0}
             >
                {isSubmitting ? `Salvando (${progress}/${drafts.length})...` : "Confirmar e Salvar"}
             </Button>
          </div>
       </div>
    </div>
  );
}
