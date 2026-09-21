import { useState, useEffect } from "react"
import { useLocation, useSearch } from "wouter"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/react"
import { 
  useGetBillingMe, 
  useCreateBillingCheckout, 
  useSimulateBillingPixPayment,
  useCancelBillingSubscription, 
  getGetBillingMeQueryKey,
  type BillingCheckoutResponse,
} from "@workspace/api-client-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft, Check, Sparkles, Mic, ScanLine, CreditCard, Loader2, AlertCircle, Copy } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

export default function Planos() {
  const [, setLocation] = useLocation()
  const search = useSearch()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()
  
  const [selectedPlan, setSelectedPlan] = useState<"PRO" | "MASTER">("PRO")
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [pixPayment, setPixPayment] = useState<BillingCheckoutResponse | null>(null)

  const { data: billing, isLoading, isError } = useGetBillingMe({
    query: {
      queryKey: getGetBillingMeQueryKey(),
      enabled: isSignedIn === true,
      refetchInterval: awaitingConfirmation ? 2000 : false,
    },
  })
  const createCheckout = useCreateBillingCheckout()
  const simulatePix = useSimulateBillingPixPayment()
  const cancelSubscription = useCancelBillingSubscription()

  useEffect(() => {
    if (isAuthLoaded && !isSignedIn) {
      setLocation("/sign-in")
    }
  }, [isAuthLoaded, isSignedIn, setLocation])

  // Handle return from checkout
  useEffect(() => {
    const params = new URLSearchParams(search)
    if (params.get("billing") === "return" || params.get("billing") === "completed") {
      setAwaitingConfirmation(true)
      toast({
        title: "Pagamento enviado",
        description: "Estamos aguardando a confirmação da AbacatePay para liberar seu plano.",
      })
      queryClient.invalidateQueries({ queryKey: getGetBillingMeQueryKey() })
      setLocation("/planos", { replace: true })
    }
  }, [search, setLocation, toast, queryClient])

  useEffect(() => {
    if (awaitingConfirmation && (billing?.plan === "PRO" || billing?.plan === "MASTER")) {
      setAwaitingConfirmation(false)
      toast({
        title: `Rachador ${billing?.plan} ativado`,
        description: "O pagamento foi confirmado e os recursos de IA já estão disponíveis.",
      })
    }
  }, [awaitingConfirmation, billing?.plan, toast])

  useEffect(() => {
    if (
      !pixPayment &&
      billing?.plan !== "PRO" &&
      billing?.plan !== "MASTER" &&
      billing?.paymentMethod === "PIX" &&
      billing.checkoutId &&
      billing.pixCode &&
      billing.pixQrCode
    ) {
      setPixPayment({
        checkoutUrl: null,
        checkoutId: billing.checkoutId,
        plan: billing.pendingPlan ?? "PRO",
        paymentMethod: "PIX",
        pixCode: billing.pixCode,
        pixQrCode: billing.pixQrCode,
        pixExpiresAt: billing.pixExpiresAt,
        devMode: false,
      })
    }
  }, [billing, pixPayment])

  const handleSubscribe = () => {
    createCheckout.mutate({ data: { plan: selectedPlan } }, {
      onSuccess: (res) => {
        if (res.checkoutUrl) {
          window.location.href = res.checkoutUrl
        } else {
          setPixPayment(res)
        }
      },
      onError: (error) => {
        const apiError = error as { data?: { error?: string } }
        const message = apiError.data?.error
        toast({
          title: message ? "Pagamento ainda não habilitado" : "Erro ao iniciar pagamento",
          description: message ?? "Tente novamente em instantes.",
          variant: "destructive"
        })
      }
    })
  }

  const handleCopyPix = async () => {
    if (!pixPayment?.pixCode) return
    await navigator.clipboard.writeText(pixPayment.pixCode)
    toast({
      title: "Código PIX copiado",
      description: "Cole o código no aplicativo do seu banco para pagar.",
    })
  }

  const handleSimulatePix = () => {
    if (!pixPayment) return
    simulatePix.mutate({ data: { checkoutId: pixPayment.checkoutId } }, {
      onSuccess: () => {
        setAwaitingConfirmation(true)
        queryClient.invalidateQueries({ queryKey: getGetBillingMeQueryKey() })
        toast({
          title: "Pagamento PIX simulado",
          description: "Aguardando a confirmação do webhook da AbacatePay.",
        })
      },
      onError: () => {
        toast({
          title: "Não foi possível simular",
          description: "Confirme se a chave da AbacatePay está em Dev mode.",
          variant: "destructive",
        })
      },
    })
  }

  const handleCancel = () => {
    if (!confirm("Tem certeza que deseja cancelar sua assinatura Pro?")) return
    
    cancelSubscription.mutate(undefined, {
      onSuccess: () => {
        toast({
          title: "Cancelamento solicitado",
          description: "A AbacatePay processa o cancelamento imediatamente. O status será atualizado após o webhook."
        })
        queryClient.invalidateQueries({ queryKey: getGetBillingMeQueryKey() })
      },
      onError: () => {
        toast({
          title: "Erro ao cancelar",
          description: "Por favor, entre em contato com o suporte.",
          variant: "destructive"
        })
      }
    })
  }

  if (!isAuthLoaded || !isSignedIn || isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-4 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-4" />
        <h2 className="text-xl font-bold mb-2">Ops! Algo deu errado</h2>
        <p className="text-muted-foreground mb-6">Não conseguimos carregar os dados da sua assinatura.</p>
        <Button onClick={() => setLocation("/")}>Voltar para o Início</Button>
      </div>
    )
  }

  const isPaid = billing?.plan === "PRO" || billing?.plan === "MASTER"
  const isMaster = billing?.plan === "MASTER"
  const currentPlanLabel = isMaster ? "MASTER" : billing?.plan === "PRO" ? "PRO" : "Free"
  const isCanceled = billing?.status === "CANCELLED" || billing?.canceledAt != null
  const isPixPayment = billing?.paymentMethod === "PIX"

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background pb-12">
      <header className="flex items-center gap-3 p-4 sm:p-6 mb-2">
        <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setLocation("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-bold">Planos e Assinatura</h1>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 sm:px-6">
        
        {/* CURRENT SUBSCRIPTION BANNER */}
        <div className={`mb-10 rounded-3xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 border-2 transition-all ${isPaid ? "bg-primary/5 border-primary/20" : "bg-card border-border/50"}`}>
          <div className="flex items-center gap-5">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${isPaid ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
              {isPaid ? <Sparkles className="w-7 h-7" /> : <CreditCard className="w-7 h-7" />}
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Seu plano atual</p>
              <h2 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
                Rachador {currentPlanLabel}
                {isPaid && (
                  <span className="bg-primary/20 text-primary text-[10px] uppercase font-black px-2 py-0.5 rounded-full">
                    Ativo
                  </span>
                )}
              </h2>
              {isPaid && billing?.nextBillingAt && (
                <p className="text-sm text-muted-foreground mt-1">
                  {isCanceled ? "Expira em" : "Próxima cobrança:"} {format(new Date(billing.nextBillingAt), "dd 'de' MMMM, yyyy", { locale: ptBR })}
                </p>
              )}
            </div>
          </div>
          
          {isPaid && (
            <div className="flex flex-col gap-2 w-full sm:w-auto">
              {isPixPayment ? (
                <p className="text-sm font-medium text-primary bg-primary/10 px-4 py-2 rounded-xl text-center">
                  Pagamento PIX confirmado
                </p>
              ) : !isCanceled ? (
                <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive w-full sm:w-auto" onClick={handleCancel} disabled={cancelSubscription.isPending}>
                  {cancelSubscription.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Cancelar assinatura
                </Button>
              ) : (
                <p className="text-sm font-medium text-destructive bg-destructive/10 px-4 py-2 rounded-xl text-center">
                  Assinatura cancelada
                </p>
              )}
            </div>
          )}
        </div>

        {awaitingConfirmation && !isPaid && (
          <div className="mb-8 rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4 text-sm text-foreground">
            <p className="font-bold">Aguardando confirmação do pagamento</p>
            <p className="mt-1 text-muted-foreground">
              Esta página será atualizada automaticamente assim que a AbacatePay confirmar o pagamento.
            </p>
          </div>
        )}

        {pixPayment && !isPaid && (
          <Card className="mb-8 border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <span className="rounded-lg bg-primary/15 px-2 py-1 text-sm font-black text-primary">PIX</span>
                 Pague para ativar o Rachador {pixPayment.plan}
              </CardTitle>
              <CardDescription>
                 Escaneie o QR Code ou copie o código PIX. O plano será ativado após a confirmação da AbacatePay.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
              <img
                src={pixPayment.pixQrCode}
                alt="QR Code para pagamento via PIX"
                className="h-56 w-56 rounded-xl border bg-white p-2"
              />
              <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
                <p className="text-sm font-semibold text-foreground">Código copia e cola</p>
                <p className="max-h-24 overflow-auto break-all rounded-xl border bg-background p-3 font-mono text-xs text-muted-foreground">
                  {pixPayment.pixCode}
                </p>
                <Button variant="outline" onClick={handleCopyPix} className="w-full sm:w-fit">
                  <Copy className="mr-2 h-4 w-4" />
                  Copiar código PIX
                </Button>
                {pixPayment.devMode && (
                  <Button onClick={handleSimulatePix} disabled={simulatePix.isPending} className="w-full sm:w-fit">
                    {simulatePix.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Simular pagamento (Dev mode)
                  </Button>
                )}
                {pixPayment.pixExpiresAt && (
                  <p className="text-xs text-muted-foreground">
                    Expira em {format(new Date(pixPayment.pixExpiresAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* PRICING SECTION */}
        {!isPaid && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-500">
            <div className="text-center space-y-4 max-w-2xl mx-auto">
              <h3 className="text-3xl font-extrabold tracking-tight">Desbloqueie o poder da IA</h3>
              <p className="text-muted-foreground text-lg">
                Esqueça a digitação. Adicione despesas com a voz ou tirando fotos das notas fiscais e deixe o Rachador fazer a matemática.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-6 max-w-6xl mx-auto items-stretch">
              {/* Free Plan */}
              <Card className="border-border/50 shadow-none flex flex-col opacity-80 hover:opacity-100 transition-opacity">
                <CardHeader>
                  <CardTitle className="text-xl">Free</CardTitle>
                  <CardDescription>Para rachar contas simples.</CardDescription>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                    R$ 0
                    <span className="text-base font-medium text-muted-foreground ml-1">/mês</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="w-5 h-5 text-muted-foreground" /> Grupos ilimitados
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="w-5 h-5 text-muted-foreground" /> Adição manual de despesas
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="w-5 h-5 text-muted-foreground" /> Histórico básico
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button variant="outline" className="w-full h-12 rounded-xl" disabled>
                    Seu plano atual
                  </Button>
                </CardFooter>
              </Card>

              {/* Pro Plan */}
              <Card className={`flex flex-col relative overflow-hidden cursor-pointer transition-all ${selectedPlan === "PRO" ? "border-primary shadow-xl shadow-primary/10" : "border-border/60"}`} onClick={() => setSelectedPlan("PRO")}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-bl-full -z-10 blur-2xl" />
                <CardHeader>
                  <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-2xl text-primary flex items-center gap-2">
                      <Sparkles className="w-5 h-5" /> Pro
                    </CardTitle>
                    {selectedPlan === "PRO" && <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">Selecionado</span>}
                  </div>
                  <CardDescription>Leitura de notas fiscais com IA.</CardDescription>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                    R$ 9,99
                    <span className="text-base font-medium text-muted-foreground ml-1">pagamento único</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3 text-sm">
                      <ScanLine className="w-5 h-5 text-primary shrink-0" /> Leitura de nota fiscal
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Check className="w-5 h-5 text-primary shrink-0" /> Grupos e despesas manuais
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                    onClick={handleSubscribe}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                    Pagar Rachador PRO
                  </Button>
                </CardFooter>
              </Card>

              {/* Master Plan */}
              <Card className={`flex flex-col relative overflow-hidden cursor-pointer transition-all ${selectedPlan === "MASTER" ? "border-primary shadow-xl shadow-primary/10" : "border-border/60"}`} onClick={() => setSelectedPlan("MASTER")}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/15 rounded-bl-full -z-10 blur-2xl" />
                <CardHeader>
                  <div className="flex justify-between items-center mb-1">
                    <CardTitle className="text-2xl text-primary flex items-center gap-2">
                      <Sparkles className="w-5 h-5" /> Master
                    </CardTitle>
                    {selectedPlan === "MASTER" && <span className="bg-primary/10 text-primary text-xs font-bold px-2.5 py-1 rounded-full">Selecionado</span>}
                  </div>
                  <CardDescription>Notas fiscais e despesas por voz com IA.</CardDescription>
                  <div className="mt-4 flex items-baseline text-4xl font-extrabold">
                    R$ 15,99
                    <span className="text-base font-medium text-muted-foreground ml-1">pagamento único</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3 text-sm">
                      <ScanLine className="w-5 h-5 text-primary shrink-0" /> Leitura de nota fiscal
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      <Mic className="w-5 h-5 text-primary shrink-0" /> Despesas por voz com IA
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button 
                    className="w-full h-12 text-base font-bold rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
                    onClick={handleSubscribe}
                    disabled={createCheckout.isPending}
                  >
                    {createCheckout.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                    Pagar Rachador Master
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}