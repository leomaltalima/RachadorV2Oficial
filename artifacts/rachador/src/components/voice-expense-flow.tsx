import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VoiceRecorder } from "./voice-recorder";
import { VoiceExpenseReviewer } from "./voice-expense-reviewer";
import { useParseVoiceExpenses } from "@workspace/api-client-react";
import type { VoiceExpenseParseResponse, GrupoComParticipantes } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

export function VoiceExpenseFlow({
  grupo,
  onClose,
  onPaywall,
}: {
  grupo: GrupoComParticipantes;
  onClose: () => void;
  onPaywall?: () => void;
}) {
  const [step, setStep] = useState<"record" | "processing" | "review">("record");
  const [parseResult, setParseResult] = useState<VoiceExpenseParseResponse | null>(null);
  
  const parseMutation = useParseVoiceExpenses();
  const { toast } = useToast();

  const handleFinishRecording = (audioBase64: string, mimeType: string) => {
    setStep("processing");
    parseMutation.mutate(
      {
        grupoId: grupo.id,
        data: { audioBase64, mimeType },
      },
      {
        onSuccess: (res) => {
          setParseResult(res);
          setStep("review");
        },
        onError: (err: any) => {
          if (err?.status === 402 || err?.data?.code === "premium_required") {
            onPaywall?.();
            setStep("record");
            return;
          }
          toast({ title: "Erro ao processar áudio", description: err.message || "Tente novamente mais tarde", variant: "destructive" });
          setStep("record");
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-300">
      <header className="flex items-center gap-3 p-4 border-b shrink-0 bg-background/80 backdrop-blur-md relative z-20">
        <Button variant="ghost" size="icon" onClick={onClose} className="-ml-2">
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Nova Despesa por Voz</h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto relative z-10">
        {step === "record" && (
          <div className="h-full flex items-center justify-center pb-20">
            <VoiceRecorder onFinish={handleFinishRecording} onCancel={onClose} />
          </div>
        )}
        
        {step === "processing" && (
          <div className="h-full flex flex-col items-center justify-center space-y-6 pb-20">
             <div className="relative">
                <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full animate-pulse"></div>
                <Loader2 className="w-16 h-16 animate-spin text-primary relative z-10" />
             </div>
             <div className="text-center space-y-2 px-8">
                <p className="text-xl font-bold">Analisando o áudio...</p>
                <p className="text-sm text-muted-foreground font-medium max-w-xs mx-auto">
                  A IA está convertendo sua voz em despesas e identificando os valores e pessoas.
                </p>
             </div>
          </div>
        )}

        {step === "review" && parseResult && (
          <VoiceExpenseReviewer
             grupo={grupo}
             parseResult={parseResult}
             onClose={onClose}
          />
        )}
      </div>
    </div>
  );
}
