import { useState } from "react"
import { useLocation } from "wouter"
import { useAuth, useUser, useClerk } from "@clerk/react"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useGetGrupoByCodigo } from "@workspace/api-client-react"
import { getSession, setSession } from "@/lib/session"
import { ArrowRight, PlusCircle, UsersRound, LogOut, Users, ChevronRight, LogIn } from "lucide-react"
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
  const { isSignedIn } = useAuth()
  const { user } = useUser()
  const { signOut } = useClerk()

  const { data: grupo, isError } = useGetGrupoByCodigo(codigo, {
    query: { enabled: codigo.length === 6 }
  })

  // Whenever a group is found by code, go to identify screen.
  if (grupo) {
    setLocation(`/g/${grupo.id}/entrar`)
  }

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
    // Restore session from known participant
    setSession(g.grupo.id, g.participante.id)
    setLocation(`/g/${g.grupo.id}`)
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-in fade-in zoom-in-95 duration-500">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-16 h-16 bg-primary/10 rounded-3xl flex items-center justify-center mx-auto mb-4">
            <UsersRound className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Rachador</h1>
          <p className="text-muted-foreground text-lg">Divida as contas, não as amizades.</p>
        </div>

        {/* Signed in: user info + groups */}
        {isSignedIn && (
          <div className="space-y-4">
            {/* User chip */}
            <div className="flex items-center justify-between bg-secondary/60 rounded-2xl px-4 py-3">
              <div className="flex items-center gap-3">
                {user?.imageUrl ? (
                  <img src={user.imageUrl} className="w-8 h-8 rounded-full" alt="" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {user?.firstName?.charAt(0) ?? user?.emailAddresses?.[0]?.emailAddress?.charAt(0) ?? "?"}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">
                    {user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {user?.emailAddresses?.[0]?.emailAddress}
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => signOut()}
              >
                <LogOut className="w-4 h-4" />
              </Button>
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
                  {meusGrupos.map(g => (
                    <button
                      key={g.grupo.id}
                      onClick={() => handleEnterGroup(g)}
                      className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-border/60 bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
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
                  ))}
                </div>
              ) : (
                <Card className="border-dashed bg-transparent">
                  <CardContent className="py-6 text-center text-muted-foreground text-sm">
                    Você ainda não está em nenhum grupo.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Not signed in: login prompt */}
        {!isSignedIn && (
          <div className="flex gap-3">
            <Button
              variant="default"
              className="flex-1 h-11"
              onClick={() => setLocation("/sign-in")}
            >
              <LogIn className="w-4 h-4 mr-2" /> Entrar
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11"
              onClick={() => setLocation("/sign-up")}
            >
              Criar conta
            </Button>
          </div>
        )}

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase font-bold tracking-wider">
            <span className="bg-background px-4 text-muted-foreground">
              {isSignedIn ? "ou entre em outro grupo" : "acesse sem conta"}
            </span>
          </div>
        </div>

        {/* Enter invite code */}
        <Card className="border-border/50 shadow-xl shadow-primary/5">
          <CardHeader>
            <CardTitle>Entrar em um grupo</CardTitle>
            <CardDescription>Digite o código de 6 letras que seu amigo enviou.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="relative">
                <Input
                  placeholder="Ex: ABCDEF"
                  className="h-14 text-center text-xl font-bold uppercase tracking-widest"
                  maxLength={6}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value.toUpperCase())}
                />
                {codigo.length === 6 && !grupo && !isError && (
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
