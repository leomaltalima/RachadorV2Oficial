import { useState, useEffect } from "react"
import { useLocation } from "wouter"
import { useAuth, useUser, useClerk } from "@clerk/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useGetGrupoByCodigo, getGetGrupoByCodigoQueryKey, useGetBillingMe, getGetBillingMeQueryKey } from "@workspace/api-client-react"
import { getSession, setSession, clearSession } from "@/lib/session"
import { PlusCircle, LogOut, Users, ChevronRight, DoorOpen, Sparkles, Settings } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface MeuGrupo {
  grupo: {
    id: number
    nome: string
    codigoConvite: string
    criadoEm: string
    participantes: { id: number; nome: string; chavePix: string | null }[]
  }
  participante: { id: number; nome: string }
}

export default function Home() {
  const [, setLocation] = useLocation()
  const [codigo, setCodigo] = useState("")
  const [leavingId, setLeavingId] = useState<number | null>(null)
  const { isSignedIn, isLoaded } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()
  const queryClient = useQueryClient()

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      setLocation("/sign-in")
    }
  }, [isLoaded, isSignedIn, setLocation])

  const { data: grupo, isError } = useGetGrupoByCodigo(codigo, {
    query: {
      enabled: codigo.length === 6 || codigo.length === 8,
      queryKey: getGetGrupoByCodigoQueryKey(codigo),
    }
  })

  // Whenever a group is found by code, go to identify screen.
  if (grupo) {
    setLocation(`/g/${grupo.id}/entrar`)
  }

  // Get Billing
  const { data: billing } = useGetBillingMe({
    query: { enabled: !!isSignedIn, queryKey: getGetBillingMeQueryKey() }
  })
  const isPaid = billing?.plan === "PRO" || billing?.plan === "MASTER"
  const planLabel = billing?.plan === "MASTER" ? "MASTER" : "PRO"

  // Fetch user's groups when signed in
  const { data: meusGrupos, isLoading: loadingGrupos } = useQuery<MeuGrupo[]>({
    queryKey: ["me/grupos"],
    queryFn: async () => {
      const res = await fetch("/api/me/grupos", { credentials: "include" })
      if (!res.ok) throw new Error("Erro ao buscar grupos")
      return res.json()
    },
    enabled: !!isSignedIn,
  })

  const handleEnterGroup = (g: MeuGrupo) => {
    setSession(g.grupo.id, g.participante.id)
    setLocation(`/g/${g.grupo.id}`)
  }

  const handleLeaveGroup = async (e: React.MouseEvent, g: MeuGrupo) => {
    e.stopPropagation()
    if (leavingId === g.participante.id) {
      // Second click = confirm
      await fetch(`/api/participantes/${g.participante.id}/leave`, {
        method: "DELETE",
        credentials: "include",
      })
      clearSession(g.grupo.id)
      queryClient.invalidateQueries({ queryKey: ["me/grupos"] })
      setLeavingId(null)
    } else {
      setLeavingId(g.participante.id)
    }
  }

  // Show loading spinner while auth is resolving
  if (!isLoaded || !isSignedIn) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-500">

        {/* Header */}
        <div className="text-center space-y-2">
          <img
            src="/logo-transparent.png"
            alt="Logo do Rachador"
            className="w-20 h-20 object-contain mx-auto mb-4"
          />
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Rachador</h1>
          <p className="text-muted-foreground text-lg">Divida as contas, não as amizades.</p>
        </div>

        {/* User chip */}
        <div className="rounded-2xl bg-secondary/60 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex min-w-0 items-center gap-3">
              {user?.imageUrl ? (
                <img src={user.imageUrl} className="h-9 w-9 rounded-full" alt="" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20">
                  <span className="text-sm font-bold text-primary">
                    {user?.firstName?.charAt(0) ?? user?.emailAddresses?.[0]?.emailAddress?.charAt(0) ?? "?"}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-foreground">
                  {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.emailAddresses?.[0]?.emailAddress}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground transition-colors hover:text-primary"
                onClick={() => setLocation("/conta")}
                title="Minha conta"
                aria-label="Minha conta"
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground transition-colors hover:text-destructive"
                onClick={() => signOut()}
                title="Sair"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLocation("/planos")}
            className="mt-3 flex w-full items-center justify-between border-t border-border/50 pt-3 text-left transition-colors hover:text-primary"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Plano atual</span>
            <span className="flex items-center gap-2 text-xs font-bold">
              {isPaid ? (
                <>
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-primary">Rachador {planLabel} · Ativo</span>
                </>
              ) : (
                <span className="text-foreground">Gratuito</span>
              )}
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </span>
          </button>
        </div>

        {/* My groups */}
        <div className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
            Meus grupos
          </h2>
          {loadingGrupos ? (
            <div className="text-center py-4 text-muted-foreground text-sm">Carregando...</div>
          ) : meusGrupos && meusGrupos.length > 0 ? (
            <div className="space-y-2">
              {meusGrupos.map(g => {
                const confirming = leavingId === g.participante.id
                return (
                  <div key={g.grupo.id} className="flex items-stretch gap-2">
                    <button
                      onClick={() => handleEnterGroup(g)}
                      className="flex-1 flex items-center gap-3 p-4 rounded-2xl border-2 border-border/60 bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
                    >
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-foreground truncate">{g.grupo.nome}</p>
                        <p className="text-xs text-muted-foreground">
                          Como {g.participante.nome} · {g.grupo.participantes.length} participantes
                        </p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                    </button>

                    <button
                      onClick={e => handleLeaveGroup(e, g)}
                      title={confirming ? "Confirmar saída" : "Sair do grupo"}
                      className={`flex flex-col items-center justify-center gap-1 px-3 rounded-2xl border-2 transition-all text-xs font-medium shrink-0 ${
                        confirming
                          ? "border-destructive bg-destructive text-destructive-foreground"
                          : "border-border/60 bg-card text-muted-foreground hover:border-destructive/50 hover:text-destructive hover:bg-destructive/5"
                      }`}
                    >
                      <DoorOpen className="w-4 h-4" />
                      <span>{confirming ? "Confirmar" : "Sair"}</span>
                    </button>
                  </div>
                )
              })}
            </div>
          ) : (
            <Card className="border-dashed bg-transparent">
              <CardContent className="py-6 text-center text-muted-foreground text-sm">
                Você ainda não está em nenhum grupo.
              </CardContent>
            </Card>
          )}
        </div>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
            <span className="bg-background px-4 text-muted-foreground">entrar em outro grupo</span>
          </div>
        </div>

        {/* Enter invite code */}
        <Card className="border-border/50 shadow-xl shadow-primary/5">
          <CardHeader>
            <CardTitle>Código de convite</CardTitle>
            <CardDescription>Digite o código de convite que seu amigo enviou.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  placeholder="Ex: ABCD1234"
                  className="h-14 text-center text-xl font-bold tracking-widest"
                  maxLength={8}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                />
                {(codigo.length === 6 || codigo.length === 8) && !grupo && !isError && (
                  <div className="absolute right-4 top-4">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
              {isError && (
                <p className="text-sm text-destructive text-center font-medium">
                  Grupo não encontrado. Verifique o código.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          size="lg"
          className="w-full h-14 border-2 border-dashed"
          onClick={() => setLocation("/criar")}
        >
          <PlusCircle className="mr-2 h-5 w-5" />
          Criar novo grupo
        </Button>

      </div>
    </div>
  )
}
