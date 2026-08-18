import { useState, useRef, useEffect } from "react"
import { useLocation, useParams } from "wouter"
import {
  useGetGrupo,
  useListDespesas,
  useGetSaldo,
  useListPagamentos,
  useDeleteDespesa,
  useCreatePagamento,
  useDeletePagamento,
  useAddParticipante,
  getGetSaldoQueryKey,
  getListPagamentosQueryKey,
  getListDespesasQueryKey,
  getGetGrupoQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { useUser } from "@clerk/react"
import { getSession } from "@/lib/session"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency, formatDate } from "@/lib/utils"

import { ArrowLeft, Copy, Plus, Receipt, UserPlus, Trash2, CheckCircle2, ArrowRight, ImagePlus, X, Undo2, Camera, Pencil, UserMinus, Settings } from "lucide-react"

// Extended tipo para incluir os campos novos que o servidor retorna
type GrupoExtended = {
  id: number
  nome: string
  codigoConvite: string
  imagem?: string | null
  criadorClerkUserId?: string | null
  participantes: { id: number; nome: string; chavePix: string | null; imagem?: string | null }[]
}

export default function GroupDashboard() {
  const { grupoId: idStr } = useParams()
  const grupoId = Number(idStr)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user, isSignedIn } = useUser()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const groupImageInputRef = useRef<HTMLInputElement>(null)
  const profileImageInputRef = useRef<HTMLInputElement>(null)
  const participantImageInputRef = useRef<HTMLInputElement>(null)

  const [myParticipantId, setMyParticipantId] = useState<number | null>(() => getSession(grupoId))

  useEffect(() => {
    if (myParticipantId === null) {
      setLocation(`/g/${grupoId}/entrar`)
    }
  }, [myParticipantId, grupoId, setLocation])

  const [activeTab, setActiveTab] = useState("despesas")
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false)
  const [newParticipantName, setNewParticipantName] = useState("")
  const [newParticipantPix, setNewParticipantPix] = useState("")
  const [isPayOpen, setIsPayOpen] = useState(false)
  const [payDeId, setPayDeId] = useState<number | null>(null)
  const [payParaId, setPayParaId] = useState<number | null>(null)
  const [payValor, setPayValor] = useState<number>(0)
  const [payComprovante, setPayComprovante] = useState<string | null>(null)
  const [updatingGroupImage, setUpdatingGroupImage] = useState(false)
  const [updatingProfileImage, setUpdatingProfileImage] = useState(false)
  const [updatingParticipantImage, setUpdatingParticipantImage] = useState(false)

  // Creator controls state
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState("")
  const [renaming, setRenaming] = useState(false)
  const [removingParticipantId, setRemovingParticipantId] = useState<number | null>(null)

  const { data: grupoRaw, isLoading: loadingGrupo } = useGetGrupo(grupoId, {
    query: { enabled: !!grupoId }
  })
  const grupo = grupoRaw as unknown as GrupoExtended | undefined

  const { data: despesas, isLoading: loadingDespesas } = useListDespesas(grupoId, { query: { enabled: !!grupoId } })
  const { data: saldo, isLoading: loadingSaldo } = useGetSaldo(grupoId, { query: { enabled: !!grupoId } })
  const { data: pagamentos, isLoading: loadingPagamentos } = useListPagamentos(grupoId, { query: { enabled: !!grupoId } })

  const deleteDespesa = useDeleteDespesa()
  const createPagamento = useCreatePagamento()
  const deletePagamento = useDeletePagamento()
  const addParticipante = useAddParticipante()

  const isCreator = isSignedIn && grupo?.criadorClerkUserId && user?.id === grupo.criadorClerkUserId

  const handleCopyInvite = () => {
    if (grupo?.codigoConvite) {
      navigator.clipboard.writeText(grupo.codigoConvite)
      toast({ title: "Código copiado", description: "Compartilhe com seus amigos para eles entrarem no grupo." })
    }
  }

  const handleCopyPix = (pix: string) => {
    navigator.clipboard.writeText(pix)
    toast({ title: "Chave Pix copiada", description: "Cole no seu aplicativo do banco." })
  }

  const handleDeleteDespesa = (id: number) => {
    if (confirm("Tem certeza que deseja excluir esta despesa?")) {
      deleteDespesa.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupoId) })
          queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) })
          toast({ title: "Despesa excluída" })
        }
      })
    }
  }

  const handleAddParticipant = () => {
    if (!newParticipantName) return
    addParticipante.mutate({ grupoId, data: { nome: newParticipantName, chavePix: newParticipantPix || null } }, {
      onSuccess: () => {
        setIsAddParticipantOpen(false)
        setNewParticipantName("")
        setNewParticipantPix("")
        queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
        toast({ title: "Participante adicionado" })
      }
    })
  }

  const handleComprovanteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => setPayComprovante(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleOpenPayDialog = (deId: number, paraId: number, valor: number) => {
    setPayDeId(deId); setPayParaId(paraId); setPayValor(valor); setPayComprovante(null); setIsPayOpen(true)
  }

  const handlePay = () => {
    if (payDeId && payParaId && payValor > 0) {
      createPagamento.mutate({ grupoId, data: { deId: payDeId, paraId: payParaId, valor: payValor, comprovante: payComprovante ?? null } }, {
        onSuccess: () => {
          setIsPayOpen(false); setPayComprovante(null)
          queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) })
          queryClient.invalidateQueries({ queryKey: getListPagamentosQueryKey(grupoId) })
          toast({ title: "Pagamento registrado com sucesso!" })
        }
      })
    }
  }

  const handleUndoPagamento = (id: number) => {
    if (confirm("Desfazer este pagamento? Ele voltará como pendente nos saldos.")) {
      deletePagamento.mutate({ id }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPagamentosQueryKey(grupoId) })
          queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) })
          toast({ title: "Pagamento desfeito", description: "O saldo foi revertido." })
        }
      })
    }
  }

  // Atualiza a imagem do grupo (apenas o criador)
  const handleGroupImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUpdatingGroupImage(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      try {
        const res = await fetch(`/api/grupos/${grupoId}/imagem`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagem: base64 }),
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
        toast({ title: "Imagem do grupo atualizada!" })
      } catch {
        toast({ title: "Erro ao atualizar imagem", variant: "destructive" })
      } finally {
        setUpdatingGroupImage(false)
        if (groupImageInputRef.current) groupImageInputRef.current.value = ""
      }
    }
    reader.readAsDataURL(file)
  }

  // Atualiza a foto de perfil do usuário via Clerk
  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUpdatingProfileImage(true)
    try {
      await user.setProfileImage({ file })
      toast({ title: "Foto de perfil atualizada!" })
    } catch {
      toast({ title: "Erro ao atualizar foto", variant: "destructive" })
    } finally {
      setUpdatingProfileImage(false)
      if (profileImageInputRef.current) profileImageInputRef.current.value = ""
    }
  }

  // Atualiza a imagem do participante (o próprio usuário)
  const handleParticipantImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !myParticipantId) return
    setUpdatingParticipantImage(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      try {
        const res = await fetch(`/api/participantes/${myParticipantId}/imagem`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imagem: base64 }),
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
        toast({ title: "Foto atualizada!" })
      } catch {
        toast({ title: "Erro ao atualizar foto", variant: "destructive" })
      } finally {
        setUpdatingParticipantImage(false)
        if (participantImageInputRef.current) participantImageInputRef.current.value = ""
      }
    }
    reader.readAsDataURL(file)
  }

  // Renomear grupo
  const handleRenameOpen = () => {
    setRenameValue(grupo?.nome ?? "")
    setIsRenameOpen(true)
  }

  const handleRename = async () => {
    if (!renameValue.trim()) return
    setRenaming(true)
    try {
      const res = await fetch(`/api/grupos/${grupoId}/nome`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: renameValue.trim() }),
      })
      if (!res.ok) throw new Error()
      queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
      toast({ title: "Grupo renomeado!" })
      setIsRenameOpen(false)
    } catch {
      toast({ title: "Erro ao renomear o grupo", variant: "destructive" })
    } finally {
      setRenaming(false)
    }
  }

  // Remover participante (com confirmação em dois cliques)
  const handleRemoveParticipant = async (participanteId: number, nome: string) => {
    if (removingParticipantId === participanteId) {
      // Segundo clique — confirmar
      try {
        const res = await fetch(`/api/grupos/${grupoId}/participantes/${participanteId}`, {
          method: "DELETE",
          credentials: "include",
        })
        if (!res.ok) throw new Error()
        queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
        queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) })
        toast({ title: `${nome} foi removido do grupo` })
      } catch {
        toast({ title: "Erro ao remover participante", variant: "destructive" })
      } finally {
        setRemovingParticipantId(null)
      }
    } else {
      setRemovingParticipantId(participanteId)
    }
  }

  const getParticipantName = (id: number) => grupo?.participantes.find(p => p.id === id)?.nome || "Alguém"
  const getParticipantPix = (id: number) => grupo?.participantes.find(p => p.id === id)?.chavePix

  if (loadingGrupo) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>
  if (!grupo) return <div className="p-8 text-center text-destructive">Grupo não encontrado</div>

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background max-w-3xl mx-auto w-full">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50 p-4 pt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={() => setLocation("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>

            {/* Avatar do grupo */}
            <div className="relative shrink-0 group">
              <div
                className={`w-10 h-10 rounded-xl overflow-hidden bg-primary/10 flex items-center justify-center ${isCreator ? "cursor-pointer" : ""}`}
                onClick={() => isCreator && groupImageInputRef.current?.click()}
                title={isCreator ? "Alterar imagem do grupo" : undefined}
              >
                {updatingGroupImage ? (
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                ) : grupo.imagem ? (
                  <img src={grupo.imagem} alt={grupo.nome} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary font-extrabold text-sm">{grupo.nome.charAt(0).toUpperCase()}</span>
                )}
              </div>
              {isCreator && (
                <div
                  className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                  onClick={() => groupImageInputRef.current?.click()}
                >
                  <Pencil className="w-2.5 h-2.5" />
                </div>
              )}
              <input ref={groupImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleGroupImageChange} />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl font-bold truncate leading-tight">{grupo.nome}</h1>
                {isCreator && (
                  <button
                    onClick={handleRenameOpen}
                    className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    title="Renomear grupo"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
                <span>Código: <span className="font-mono font-medium text-foreground">{grupo.codigoConvite}</span></span>
                <button onClick={handleCopyInvite} className="hover:text-primary transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Chip do usuário logado */}
          <div className="shrink-0 flex items-center gap-1">
            {isSignedIn && (
              <div className="relative group/avatar">
                <button
                  className={`w-8 h-8 rounded-full overflow-hidden bg-secondary border-2 border-border flex items-center justify-center ${updatingProfileImage ? "opacity-60" : ""}`}
                  onClick={() => profileImageInputRef.current?.click()}
                  title="Alterar foto de perfil"
                >
                  {user?.imageUrl ? (
                    <img src={user.imageUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-muted-foreground">
                      {user?.firstName?.charAt(0) ?? user?.emailAddresses?.[0]?.emailAddress?.charAt(0) ?? "?"}
                    </span>
                  )}
                </button>
                <div
                  className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => profileImageInputRef.current?.click()}
                >
                  <Camera className="w-3.5 h-3.5 text-white" />
                </div>
                <input ref={profileImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleProfileImageChange} />
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-secondary rounded-full pl-2 pr-3 py-1.5 ml-1">
              <span className="text-xs font-semibold text-foreground max-w-[80px] truncate">
                {myParticipantId ? getParticipantName(myParticipantId) : "?"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="despesas">Despesas</TabsTrigger>
            <TabsTrigger value="saldo">Saldos</TabsTrigger>
            <TabsTrigger value="pagamentos">Histórico</TabsTrigger>
          </TabsList>

          {/* ── DESPESAS ── */}
          <TabsContent value="despesas" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold">Últimas despesas</h2>
              <span className="text-sm font-semibold bg-primary/10 text-primary px-2.5 py-1 rounded-full">
                Total: {formatCurrency(saldo?.totalGasto || 0)}
              </span>
            </div>
            {loadingDespesas ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando despesas...</div>
            ) : despesas?.length === 0 ? (
              <Card className="border-dashed bg-transparent mt-4">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-4">
                    <Receipt className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <p className="font-medium text-foreground">Nenhuma despesa ainda</p>
                  <p className="text-sm mb-4">Que tal registrar a primeira conta?</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {despesas?.map(despesa => (
                  <Card key={despesa.id} className="overflow-hidden border-border/60">
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center shrink-0">
                        <Receipt className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground truncate">{despesa.descricao}</h3>
                        <p className="text-sm text-muted-foreground truncate">
                          Pago por <span className="font-medium text-foreground">{getParticipantName(despesa.pagoPorId)}</span>
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-foreground">{formatCurrency(despesa.valor)}</div>
                        <div className="text-xs text-muted-foreground">{formatDate(despesa.criadoEm)}</div>
                      </div>
                      <Button variant="ghost" size="icon" className="shrink-0 -mr-2 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteDespesa(despesa.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── SALDO ── */}
          <TabsContent value="saldo" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div>
              <h2 className="text-lg font-bold px-1 mb-4">Como acertar as contas</h2>
              {loadingSaldo ? (
                <div className="p-8 text-center text-muted-foreground text-sm">Calculando...</div>
              ) : saldo?.debitos.length === 0 ? (
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="flex flex-col items-center justify-center p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-primary mb-3" />
                    <p className="font-bold text-foreground">Tudo certo por aqui!</p>
                    <p className="text-sm text-muted-foreground">Ninguém deve nada a ninguém.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {saldo?.debitos.map((debito, i) => {
                    const pix = getParticipantPix(debito.paraId)
                    const isMyDebt = debito.deId === myParticipantId
                    return (
                      <Card key={i} className={`overflow-hidden ${isMyDebt ? "border-destructive/50 ring-1 ring-destructive/20" : "border-border/60"}`}>
                        <div className="p-4 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${isMyDebt ? "text-destructive" : "text-foreground"}`}>
                                {getParticipantName(debito.deId)}
                                {isMyDebt && <span className="text-xs font-normal text-destructive/70 ml-1">(você)</span>}
                              </span>
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                              <span className="font-bold text-foreground">{getParticipantName(debito.paraId)}</span>
                            </div>
                            <span className="font-bold text-destructive">{formatCurrency(debito.valor)}</span>
                          </div>
                          {(isMyDebt || pix) && (
                            <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                              {isMyDebt && (
                                <Button size="sm" variant="default" className="w-full text-xs font-bold"
                                  onClick={() => handleOpenPayDialog(debito.deId, debito.paraId, debito.valor)}>
                                  Marcar como pago
                                </Button>
                              )}
                              {pix && (
                                <Button size="sm" variant="outline" className="w-full text-xs gap-1.5"
                                  onClick={() => handleCopyPix(pix)}>
                                  Copiar Pix <Copy className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Membros */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between px-1 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold">Membros ({grupo.participantes.length})</h2>
                  {isCreator && (
                    <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full font-medium">
                      <Settings className="w-3 h-3" /> Admin
                    </span>
                  )}
                </div>
                <Dialog open={isAddParticipantOpen} onOpenChange={setIsAddParticipantOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                      <UserPlus className="w-4 h-4 mr-2" /> Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Adicionar participante</DialogTitle></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input value={newParticipantName} onChange={e => setNewParticipantName(e.target.value)} placeholder="Ex: João" />
                      </div>
                      <div className="space-y-2">
                        <Label>Chave Pix</Label>
                        <Input value={newParticipantPix} onChange={e => setNewParticipantPix(e.target.value)} placeholder="CPF, celular, e-mail..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddParticipant} disabled={!newParticipantName || !newParticipantPix}>Adicionar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              {/* Hidden file input for participant image */}
              <input
                ref={participantImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleParticipantImageChange}
              />

              <div className="bg-card border rounded-2xl overflow-hidden shadow-sm divide-y">
                {saldo?.participantes.map(p => {
                  const partInfo = grupo.participantes.find(x => x.id === p.participanteId)
                  const isMe = p.participanteId === myParticipantId
                  const isConfirmingRemove = removingParticipantId === p.participanteId
                  return (
                    <div key={p.participanteId} className={`flex items-center justify-between p-4 transition-colors ${isMe ? "bg-primary/5" : ""}`}>
                      <div className="flex items-center gap-3">
                        {/* Avatar do participante — clicável apenas para o próprio */}
                        <div
                          className={`relative w-10 h-10 rounded-full overflow-hidden bg-secondary flex items-center justify-center shrink-0 group/avatar ${isMe ? "cursor-pointer ring-2 ring-primary ring-offset-1" : ""}`}
                          onClick={() => isMe && participantImageInputRef.current?.click()}
                          title={isMe ? "Alterar sua foto" : undefined}
                        >
                          {updatingParticipantImage && isMe ? (
                            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                          ) : partInfo?.imagem ? (
                            <img src={partInfo.imagem} alt={p.nome} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-muted-foreground">{p.nome.charAt(0).toUpperCase()}</span>
                          )}
                          {isMe && !updatingParticipantImage && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/avatar:opacity-100 transition-opacity">
                              <Camera className="w-3.5 h-3.5 text-white" />
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-sm text-foreground">{p.nome}</p>
                            {isMe && <span className="text-xs text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded-full">Você</span>}
                          </div>
                          {partInfo?.chavePix && (
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">Pix: {partInfo.chavePix}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className={`text-sm font-bold ${p.saldoLiquido > 0 ? 'text-green-600' : p.saldoLiquido < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {p.saldoLiquido > 0 ? '+' : ''}{formatCurrency(p.saldoLiquido)}
                        </div>
                        {isCreator && (
                          <button
                            onClick={() => handleRemoveParticipant(p.participanteId, p.nome)}
                            title={isConfirmingRemove ? "Confirmar remoção" : "Remover do grupo"}
                            className={`flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition-all font-medium ${
                              isConfirmingRemove
                                ? "border-destructive bg-destructive text-destructive-foreground"
                                : "border-border/60 text-muted-foreground hover:border-destructive/50 hover:text-destructive hover:bg-destructive/5"
                            }`}
                          >
                            <UserMinus className="w-3.5 h-3.5" />
                            <span>{isConfirmingRemove ? "Confirmar" : "Tirar"}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </TabsContent>

          {/* ── HISTÓRICO ── */}
          <TabsContent value="pagamentos" className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h2 className="text-lg font-bold px-1">Histórico de acertos</h2>
            {loadingPagamentos ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Carregando...</div>
            ) : pagamentos?.length === 0 ? (
              <Card className="border-dashed bg-transparent mt-4">
                <CardContent className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                  <p className="font-medium text-foreground">Nenhum pagamento registrado</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-2">
                {pagamentos?.map(pag => (
                  <Card key={pag.id} className="overflow-hidden border-border/60">
                    <div className="p-4 flex gap-3">
                      {pag.comprovante && (
                        <Dialog>
                          <DialogTrigger asChild>
                            <button className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-border/60 hover:opacity-80 transition-opacity">
                              <img src={pag.comprovante} alt="Comprovante" className="w-full h-full object-cover" />
                            </button>
                          </DialogTrigger>
                          <DialogContent className="max-w-sm">
                            <DialogHeader><DialogTitle>Comprovante</DialogTitle></DialogHeader>
                            <img src={pag.comprovante} alt="Comprovante" className="w-full rounded-xl" />
                          </DialogContent>
                        </Dialog>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">
                          {getParticipantName(pag.deId)} pagou {getParticipantName(pag.paraId)}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(pag.criadoEm)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-sm text-green-600">{formatCurrency(pag.valor)}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          title="Desfazer pagamento" onClick={() => handleUndoPagamento(pag.id)}>
                          <Undo2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* FAB */}
      <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center z-20 pointer-events-none">
        <div className="max-w-3xl w-full flex justify-center sm:justify-end sm:pr-4">
          <Button size="lg" className="rounded-full shadow-xl shadow-primary/25 pointer-events-auto gap-2 px-6 h-14"
            onClick={() => setLocation(`/g/${grupo.id}/nova-despesa`)}>
            <Plus className="w-5 h-5" /> Adicionar despesa
          </Button>
        </div>
      </div>

      {/* Dialog Renomear Grupo */}
      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear grupo</DialogTitle>
            <DialogDescription>Escolha um novo nome para o grupo.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              placeholder="Nome do grupo"
              className="h-12 text-base"
              onKeyDown={e => e.key === "Enter" && handleRename()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancelar</Button>
            <Button onClick={handleRename} disabled={!renameValue.trim() || renaming}>
              {renaming ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Confirmar Pagamento */}
      <Dialog open={isPayOpen} onOpenChange={(open) => { setIsPayOpen(open); if (!open) setPayComprovante(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>Marcar esta dívida como paga. Isso atualizará os saldos de ambos.</DialogDescription>
          </DialogHeader>
          {payDeId && payParaId && (
            <div className="py-2 space-y-5">
              <div className="flex items-center justify-center gap-4 text-lg">
                <span className="font-bold">{getParticipantName(payDeId)}</span>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <span className="font-bold">{getParticipantName(payParaId)}</span>
              </div>
              <div className="text-center">
                <span className="text-3xl font-extrabold text-foreground">{formatCurrency(payValor)}</span>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Comprovante <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleComprovanteChange} />
                {payComprovante ? (
                  <div className="relative w-full rounded-xl overflow-hidden border border-border/60">
                    <img src={payComprovante} alt="Comprovante" className="w-full max-h-48 object-contain bg-secondary/30" />
                    <button
                      onClick={() => { setPayComprovante(null); if (fileInputRef.current) fileInputRef.current.value = "" }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-background/80 border border-border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full h-24 rounded-xl border-2 border-dashed border-border/60 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors">
                    <ImagePlus className="w-6 h-6" />
                    <span className="text-xs font-medium">Adicionar imagem do comprovante</span>
                  </button>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayOpen(false)}>Cancelar</Button>
            <Button onClick={handlePay} disabled={createPagamento.isPending}>
              {createPagamento.isPending ? "Salvando..." : "Confirmar pagamento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
