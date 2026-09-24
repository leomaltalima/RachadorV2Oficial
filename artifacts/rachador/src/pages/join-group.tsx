import { useState } from "react"
import { useLocation, useParams } from "wouter"
import { useGetGrupo, useAddParticipante, useUpdateParticipante, getGetGrupoQueryKey } from "@workspace/api-client-react"
import type { Participante } from "@workspace/api-client-react"

type ParticipanteExtended = Participante & { claimado?: boolean; meu?: boolean }
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@clerk/react"
import { useToast } from "@/hooks/use-toast"
import { setSession } from "@/lib/session"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ChevronRight, UserPlus, Lock, ArrowLeft, Copy } from "lucide-react"

export default function JoinGroup() {
  const { grupoId: idStr } = useParams()
  const grupoId = Number(idStr)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { isSignedIn } = useAuth()

  const { data: grupo, isLoading } = useGetGrupo(grupoId, {
    query: { enabled: !!grupoId, queryKey: getGetGrupoQueryKey(grupoId) }
  })
  const addParticipante = useAddParticipante()
  const updateParticipante = useUpdateParticipante()

  const [mode, setMode] = useState<"select" | "add" | "confirm">("select")
  const [newNome, setNewNome] = useState("")
  const [newPix, setNewPix] = useState("")
  const [confirmParticipante, setConfirmParticipante] = useState<ParticipanteExtended | null>(null)
  const [confirmPix, setConfirmPix] = useState("")

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

  const handleSelect = (p: ParticipanteExtended) => {
    if (!p) return
    setConfirmParticipante(p)
    setConfirmPix(p.chavePix ?? "")
    setMode("confirm")
  }

  const handleConfirmEntry = async () => {
    if (!confirmParticipante) return
    try {
      await updateParticipante.mutateAsync({
        id: confirmParticipante.id,
        data: { chavePix: confirmPix.trim() || null },
      })
      queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
    } catch {
      // Non-critical — still allow entry
    }
    setSession(grupoId, confirmParticipante.id)
    await claimParticipant(confirmParticipante.id)
    toast({ title: `Bem-vindo(a), ${confirmParticipante.nome}!` })
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
                {(grupo.participantes as (typeof grupo.participantes[0] & { claimado?: boolean; meu?: boolean })[]).map(p => {
                  const isMe = !!p.meu
                  const lockedByOther = !!p.claimado && !isMe

                  if (lockedByOther) {
                    return (
                      <div
                        key={p.id}
                        className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-border/30 bg-muted/40 opacity-60 cursor-not-allowed select-none"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0 font-bold text-muted-foreground">
                            {p.nome.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-foreground">{p.nome}</p>
                            <p className="text-xs text-muted-foreground">Já vinculado a uma conta</p>
                          </div>
                        </div>
                        <Lock className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )
                  }

                  return (
                    <button
                      key={p.id}
                      onClick={() => handleSelect(p as ParticipanteExtended)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all text-left group ${
                        isMe
                          ? "border-primary/60 bg-primary/5 hover:border-primary hover:bg-primary/10"
                          : "border-border/60 bg-card hover:border-primary/60 hover:bg-primary/5"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold transition-colors ${
                          isMe
                            ? "bg-primary/20 text-primary group-hover:bg-primary/30"
                            : "bg-secondary text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
                        }`}>
                          {p.nome.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{p.nome}</p>
                          <p
                            data-sensitive={p.chavePix ? true : undefined}
                            className="text-xs text-muted-foreground truncate max-w-[200px]"
                          >
                            {isMe ? "Sua conta — clique para entrar" : p.chavePix ? `Pix: ${p.chavePix}` : ""}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 transition-colors ${isMe ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`} />
                    </button>
                  )
                })}
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

        {mode === "confirm" && confirmParticipante && (
          <div className="space-y-5">
            <Card className="border-primary/30 bg-primary/5 shadow-md">
              <CardContent className="pt-6 space-y-5">
                {/* Who you are */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0 font-bold text-primary text-lg">
                    {confirmParticipante.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-lg">{confirmParticipante.nome}</p>
                    <p className="text-xs text-muted-foreground">É você? Confirme sua chave Pix abaixo.</p>
                  </div>
                </div>

                {/* Pix input */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    Sua chave Pix
                    <span className="text-muted-foreground font-normal text-xs">(opcional)</span>
                  </Label>
                  <div className="relative">
                    <Input
                      placeholder="CPF, celular, e-mail, chave aleatória..."
                      value={confirmPix}
                      onChange={e => setConfirmPix(e.target.value)}
                      autoFocus
                      className="pr-10"
                    />
                    {confirmPix && (
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(confirmPix)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        title="Copiar"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Outros integrantes usarão isso para te pagar via Pix.
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="gap-2" onClick={() => { setMode("select"); setConfirmParticipante(null) }}>
                <ArrowLeft className="w-4 h-4" />
                Voltar
              </Button>
              <Button
                className="flex-1"
                disabled={updateParticipante.isPending}
                onClick={handleConfirmEntry}
              >
                {updateParticipante.isPending ? "Entrando..." : "Entrar no grupo"}
              </Button>
            </div>
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
