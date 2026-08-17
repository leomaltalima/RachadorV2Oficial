import { useState } from "react"
import { useLocation, useParams } from "wouter"
import { useGetGrupo, useAddParticipante, getGetGrupoQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/react"
import { useToast } from "@/hooks/use-toast"
import { setSession } from "@/lib/session"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronRight, UserPlus } from "lucide-react"

export default function JoinGroup() {
  const { grupoId: idStr } = useParams()
  const grupoId = Number(idStr)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isSignedIn } = useAuth()

  const { data: grupo, isLoading } = useGetGrupo(grupoId, {
    query: { enabled: !!grupoId }
  })
  const addParticipante = useAddParticipante()

  const [mode, setMode] = useState<"select" | "add">("select")
  const [newNome, setNewNome] = useState("")
  const [newPix, setNewPix] = useState("")

  // Claims a participant for the current Clerk user (server-side link)
  const claimParticipant = async (participanteId: number) => {
    if (!isSignedIn) return
    try {
      await fetch(`/api/participantes/${participanteId}/claim`, {
        method: "POST",
        credentials: "include",
      })
    } catch {
      // non-critical: session still works via localStorage
    }
  }

  const handleSelect = async (participanteId: number) => {
    setSession(grupoId, participanteId)
    await claimParticipant(participanteId)
    setLocation(`/g/${grupoId}`)
  }

  const handleAdd = () => {
    if (!newNome.trim() || !newPix.trim()) return
    addParticipante.mutate({
      grupoId,
      data: { nome: newNome.trim(), chavePix: newPix.trim() }
    }, {
      onSuccess: async (participante) => {
        queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
        setSession(grupoId, participante.id)
        await claimParticipant(participante.id)
        toast({ title: `Bem-vindo(a), ${participante.nome}!` })
        setLocation(`/g/${grupoId}`)
      },
      onError: () => {
        toast({ title: "Erro ao entrar no grupo", variant: "destructive" })
      }
    })
  }

  if (isLoading) return (
    <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">
      Carregando...
    </div>
  )

  if (!grupo) return (
    <div className="min-h-[100dvh] flex items-center justify-center text-destructive">
      Grupo não encontrado
    </div>
  )

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-8 animate-in fade-in zoom-in-95 duration-400">

        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest">Entrando no grupo</p>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">{grupo.nome}</h1>
          <p className="text-muted-foreground">Quem é você nesse grupo?</p>
        </div>

        {mode === "select" && (
          <div className="space-y-4">
            {grupo.participantes.length > 0 ? (
              <div className="space-y-2">
                {grupo.participantes.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSelect(p.id)}
                    className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0 font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                        {p.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-foreground">{p.nome}</p>
                        {p.chavePix && (
                          <p className="text-xs text-muted-foreground truncate max-w-[200px]">Pix: {p.chavePix}</p>
                        )}
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </button>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="py-6 text-center text-muted-foreground text-sm">
                  Nenhum participante ainda. Adicione-se abaixo!
                </CardContent>
              </Card>
            )}

            <Button
              variant="outline"
              className="w-full h-12 border-dashed border-2 gap-2"
              onClick={() => setMode("add")}
            >
              <UserPlus className="w-4 h-4" />
              Não estou na lista — me adicionar
            </Button>
          </div>
        )}

        {mode === "add" && (
          <div className="space-y-5">
            <Card className="border-border/50 shadow-md">
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <Label>Seu nome</Label>
                  <Input
                    placeholder="Ex: João"
                    value={newNome}
                    onChange={e => setNewNome(e.target.value)}
                    autoFocus
                  />
                </div>
                <div className="space-y-2">
                  <Label>Sua chave Pix</Label>
                  <Input
                    placeholder="CPF, celular, e-mail..."
                    value={newPix}
                    onChange={e => setNewPix(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setMode("select")}>
                Voltar
              </Button>
              <Button
                className="flex-1"
                disabled={!newNome.trim() || !newPix.trim() || addParticipante.isPending}
                onClick={handleAdd}
              >
                {addParticipante.isPending ? "Entrando..." : "Entrar no grupo"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
