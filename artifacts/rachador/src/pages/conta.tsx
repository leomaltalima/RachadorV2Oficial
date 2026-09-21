import { useEffect } from "react"
import { useLocation } from "wouter"
import { useAuth, useClerk, useUser } from "@clerk/react"
import { useGetBillingMe, getGetBillingMeQueryKey } from "@workspace/api-client-react"
import { ArrowLeft, Check, CreditCard, LogOut, Loader2, Settings, Sparkles } from "lucide-react"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function Conta() {
  const [, setLocation] = useLocation()
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const { data: billing, isLoading, isError } = useGetBillingMe({
    query: { enabled: isSignedIn === true, queryKey: getGetBillingMeQueryKey() },
  })

  useEffect(() => {
    if (isAuthLoaded && !isSignedIn) {
      setLocation("/sign-in")
    }
  }, [isAuthLoaded, isSignedIn, setLocation])

  if (!isAuthLoaded || !isSignedIn || isLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (isError || !billing) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background p-4 text-center">
        <Settings className="mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-bold">Não foi possível carregar sua conta</h1>
        <Button className="mt-6" onClick={() => setLocation("/")}>Voltar ao início</Button>
      </div>
    )
  }

  const isPaid = billing.plan === "PRO" || billing.plan === "MASTER"
  const planLabel = billing.plan === "MASTER" ? "MASTER" : billing.plan === "PRO" ? "PRO" : "Gratuito"
  const displayName = user?.fullName ?? user?.firstName ?? "Usuário"
  const email = user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress
  const initials = (user?.firstName?.charAt(0) ?? email?.charAt(0) ?? "?").toUpperCase()
  const features = billing.plan === "MASTER"
    ? ["Leitura de nota fiscal", "Despesas por voz com IA", "Grupos e despesas manuais"]
    : billing.plan === "PRO"
      ? ["Leitura de nota fiscal", "Grupos e despesas manuais"]
      : ["Grupos e despesas manuais", "Histórico básico"]

  return (
    <div className="min-h-[100dvh] bg-background pb-12">
      <header className="mx-auto flex w-full max-w-2xl items-center gap-3 p-4 sm:p-6">
        <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configurações</p>
          <h1 className="text-xl font-bold">Minha conta</h1>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl space-y-5 px-4 sm:px-6">
        <Card className="overflow-hidden rounded-3xl border-border/60">
          <CardContent className="flex items-center gap-4 p-5 sm:p-6">
            {user?.imageUrl ? (
              <img src={user.imageUrl} className="h-16 w-16 rounded-full" alt="" />
            ) : (
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xl font-bold text-primary">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate text-lg font-bold">{displayName}</h2>
              <p className="truncate text-sm text-muted-foreground">{email}</p>
              <p className="mt-1 text-xs text-muted-foreground">Conta protegida pelo Clerk</p>
            </div>
          </CardContent>
        </Card>

        <Card className={`rounded-3xl ${isPaid ? "border-primary/25 bg-primary/5" : "border-border/60"}`}>
          <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Plano ativo</p>
              <CardTitle className="mt-1 flex items-center gap-2 text-2xl">
                {isPaid && <Sparkles className="h-5 w-5 text-primary" />}
                Rachador {planLabel}
              </CardTitle>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${isPaid ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"}`}>
              {isPaid ? "Ativo" : "Gratuito"}
            </span>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-center gap-3 text-sm">
                  <Check className={`h-4 w-4 ${isPaid ? "text-primary" : "text-muted-foreground"}`} />
                  {feature}
                </li>
              ))}
            </ul>
            {isPaid && (
              <div className="mt-5 grid gap-3 rounded-2xl bg-background/70 p-4 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Pagamento</p>
                  <p className="mt-1 font-semibold">PIX avulso</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Valor pago</p>
                  <p className="mt-1 font-semibold">
                    {billing.amount != null ? `R$ ${billing.amount.toFixed(2).replace(".", ",")}` : "Pagamento confirmado"}
                  </p>
                </div>
                {billing.startedAt && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Ativado em</p>
                    <p className="mt-1 font-semibold">
                      {format(new Date(billing.startedAt), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>
            )}
            <Button className="mt-5 w-full" onClick={() => setLocation("/planos")}>
              <CreditCard className="mr-2 h-4 w-4" />
              Administrar planos e pagamentos
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60">
          <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <p className="font-semibold">Sessão da conta</p>
              <p className="text-sm text-muted-foreground">Sair deste dispositivo</p>
            </div>
            <Button variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => signOut()}>
              <LogOut className="mr-2 h-4 w-4" />
              Sair
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}