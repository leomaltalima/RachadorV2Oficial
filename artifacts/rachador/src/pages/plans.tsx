import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, Check, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  cancelSubscription,
  getBillingPlans,
  getBillingSummary,
  openBillingPortal,
  reactivateSubscription,
  startCheckout,
} from "@/lib/billing";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function PlansPage() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const plans = useQuery({ queryKey: ["billing/plans"], queryFn: getBillingPlans });
  const billing = useQuery({ queryKey: ["billing/me"], queryFn: getBillingSummary });

  const goToCheckout = async (interval: "monthly" | "yearly") => {
    try {
      const { url } = await startCheckout(interval);
      window.location.assign(url);
    } catch (error) {
      toast({ title: "Checkout indisponível", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  };

  const manage = async () => {
    try {
      const { url } = await openBillingPortal();
      window.location.assign(url);
    } catch (error) {
      toast({ title: "Não foi possível abrir o gerenciamento", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  };

  const changeCancellation = async (cancel: boolean) => {
    try {
      await (cancel ? cancelSubscription() : reactivateSubscription());
      await queryClient.invalidateQueries({ queryKey: ["billing/me"] });
      toast({ title: cancel ? "Cancelamento agendado" : "Assinatura reativada" });
    } catch (error) {
      toast({ title: "Não foi possível atualizar a assinatura", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" });
    }
  };

  if (plans.isLoading || billing.isLoading) {
    return <div className="flex min-h-[100dvh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!plans.data || !billing.data) return <div className="p-8 text-center text-muted-foreground">Não foi possível carregar os planos.</div>;

  const current = billing.data;
  return (
    <div className="min-h-[100dvh] bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-8">
        <header className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/")}><ArrowLeft className="h-5 w-5" /></Button>
          <div>
            <p className="text-sm font-semibold text-primary">Rachador</p>
            <h1 className="text-3xl font-extrabold tracking-tight">Planos e assinatura</h1>
          </div>
        </header>

        <section className="rounded-3xl border border-primary/15 bg-primary/5 p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Minha assinatura</p>
              <h2 className="text-2xl font-bold">{current.planName}</h2>
              <p className="text-sm text-muted-foreground">
                {current.plan === "pro"
                  ? `${current.interval === "yearly" ? "Plano anual" : "Plano mensal"} · ${current.status === "active" ? "Ativa" : current.status}`
                  : `${current.usage.remaining} de 3 divisões automáticas gratuitas restantes este mês`}
              </p>
            </div>
            {current.plan === "pro" ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={manage}><ExternalLink className="mr-2 h-4 w-4" /> Gerenciar assinatura</Button>
                {current.cancelAtPeriodEnd ? (
                  <Button variant="outline" onClick={() => changeCancellation(false)}>Reativar</Button>
                ) : (
                  <Button variant="ghost" className="text-destructive" onClick={() => changeCancellation(true)}>Cancelar ao fim do período</Button>
                )}
              </div>
            ) : (
              <Button onClick={() => goToCheckout("yearly")}>Desbloquear Pro</Button>
            )}
          </div>
          {current.plan === "pro" && current.currentPeriodEnd && (
            <p className="mt-3 text-xs text-muted-foreground">
              {current.cancelAtPeriodEnd ? "Acesso até" : "Próxima cobrança"}: {new Date(current.currentPeriodEnd).toLocaleDateString("pt-BR")}
            </p>
          )}
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="border-border/60">
            <CardHeader><CardTitle className="flex items-center justify-between">Rachador Free <Badge variant="outline">Atual para começar</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <p className="text-3xl font-extrabold">R$ 0 <span className="text-sm font-normal text-muted-foreground">para sempre</span></p>
              <ul className="space-y-3">{plans.data.free.benefits.map((benefit) => <li key={benefit} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{benefit}</li>)}</ul>
              <Button variant="outline" className="w-full" disabled={current.plan === "free"}>Plano atual</Button>
            </CardContent>
          </Card>
          <Card className="relative overflow-hidden border-primary/40 shadow-lg shadow-primary/10">
            <div className="absolute right-0 top-0 rounded-bl-xl bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">RECOMENDADO</div>
            <CardHeader><CardTitle className="flex items-center gap-2">Rachador Pro <Badge>PRO</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <p className="text-3xl font-extrabold">{money(plans.data.pro.monthlyPriceCents)} <span className="text-sm font-normal text-muted-foreground">/mês</span></p>
              <p className="text-sm text-muted-foreground">ou {money(plans.data.pro.yearlyPriceCents)}/ano · economize {plans.data.savingsPercent}%</p>
              <ul className="space-y-3">{plans.data.pro.benefits.map((benefit) => <li key={benefit} className="flex gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{benefit}</li>)}</ul>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="outline" disabled={current.plan === "pro"} onClick={() => goToCheckout("monthly")}>Assinar mensal</Button>
                <Button disabled={current.plan === "pro"} onClick={() => goToCheckout("yearly")}>Assinar anual</Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><RefreshCw className="h-3 w-3" /> Status atualizado pelo Stripe via webhook.</div>
      </div>
    </div>
  );
}