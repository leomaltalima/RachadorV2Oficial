import { useState } from "react";
import { Check, Crown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { startCheckout } from "@/lib/billing";

export function Paywall({
  onClose,
  feature = "recurso premium",
}: {
  onClose: () => void;
  feature?: string;
}) {
  const [loading, setLoading] = useState<"monthly" | "yearly" | null>(null);
  const { toast } = useToast();

  const subscribe = async (interval: "monthly" | "yearly") => {
    setLoading(interval);
    try {
      const { url } = await startCheckout(interval);
      window.location.assign(url);
    } catch (error) {
      toast({
        title: "Não foi possível abrir o checkout",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
      setLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/35 p-4 backdrop-blur-sm">
      <Card className="relative w-full max-w-lg overflow-hidden border-primary/20 shadow-2xl">
        <Button variant="ghost" size="icon" className="absolute right-2 top-2" onClick={onClose} aria-label="Fechar">
          <X className="h-5 w-5" />
        </Button>
        <CardHeader className="bg-primary/5 pb-5 pr-12">
          <Badge className="mb-2 w-fit gap-1"><Crown className="h-3 w-3" /> Rachador Pro</Badge>
          <CardTitle className="text-2xl">Desbloqueie o Rachador Pro</CardTitle>
          <p className="text-sm text-muted-foreground">
            Você usou as 3 divisões automáticas gratuitas deste mês. Continue usando {feature} sem limite gratuito.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 p-6">
          <div className="grid gap-2 sm:grid-cols-2">
            {["Divisão automática por voz", "Leitura de notas fiscais", "Menos trabalho manual", "Divisões mais rápidas"].map((benefit) => (
              <div key={benefit} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-primary" /> {benefit}
              </div>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" className="h-auto flex-col items-start gap-0 py-3" disabled={!!loading} onClick={() => subscribe("monthly")}>
              <span className="text-lg font-bold">R$ 9,90/mês</span>
              <span className="text-xs text-muted-foreground">cobrança mensal</span>
              {loading === "monthly" && <Loader2 className="mt-1 h-4 w-4 animate-spin" />}
            </Button>
            <Button className="relative h-auto flex-col items-start gap-0 py-3" disabled={!!loading} onClick={() => subscribe("yearly")}>
              <Badge variant="secondary" className="absolute -top-3 right-2 text-[10px]">melhor valor</Badge>
              <span className="text-lg font-bold">R$ 79,90/ano</span>
              <span className="text-xs opacity-80">economize em relação ao mensal</span>
              {loading === "yearly" && <Loader2 className="mt-1 h-4 w-4 animate-spin" />}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">O acesso Pro só é liberado após a confirmação do Stripe.</p>
        </CardContent>
      </Card>
    </div>
  );
}