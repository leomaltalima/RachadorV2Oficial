import { useState, useRef, useCallback } from "react"
import { useLocation, useParams } from "wouter"
import { 
  useGetGrupo, 
  useListDespesas, 
  useGetSaldo, 
  useListPagamentos,
  useDeleteDespesa,
  useCreatePagamento,
  useAddParticipante,
  getGetSaldoQueryKey,
  getListPagamentosQueryKey,
  getListDespesasQueryKey,
  getGetGrupoQueryKey
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency, formatDate } from "@/lib/utils"

import { ArrowLeft, Copy, Plus, Receipt, UserPlus, Trash2, CheckCircle2, ChevronRight, UserCircle2, ArrowRight } from "lucide-react"

export default function GroupDashboard() {
  const { grupoId: idStr } = useParams()
  const grupoId = Number(idStr)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [activeTab, setActiveTab] = useState("despesas")
  const [isAddParticipantOpen, setIsAddParticipantOpen] = useState(false)
  const [newParticipantName, setNewParticipantName] = useState("")
  const [newParticipantPix, setNewParticipantPix] = useState("")

  const [isPayOpen, setIsPayOpen] = useState(false)
  const [payDeId, setPayDeId] = useState<number | null>(null)
  const [payParaId, setPayParaId] = useState<number | null>(null)
  const [payValor, setPayValor] = useState<number>(0)

  const { data: grupo, isLoading: loadingGrupo } = useGetGrupo(grupoId, {
    query: { enabled: !!grupoId }
  })
  
  const { data: despesas, isLoading: loadingDespesas } = useListDespesas(grupoId, {
    query: { enabled: !!grupoId }
  })

  const { data: saldo, isLoading: loadingSaldo } = useGetSaldo(grupoId, {
    query: { enabled: !!grupoId }
  })

  const { data: pagamentos, isLoading: loadingPagamentos } = useListPagamentos(grupoId, {
    query: { enabled: !!grupoId }
  })

  const deleteDespesa = useDeleteDespesa()
  const createPagamento = useCreatePagamento()
  const addParticipante = useAddParticipante()

  const handleCopyInvite = () => {
    if (grupo?.codigoConvite) {
      navigator.clipboard.writeText(grupo.codigoConvite)
      toast({
        title: "Código copiado",
        description: "Compartilhe com seus amigos para eles entrarem no grupo.",
      })
    }
  }

  const handleCopyPix = (pix: string) => {
    navigator.clipboard.writeText(pix)
    toast({
      title: "Chave Pix copiada",
      description: "Cole no seu aplicativo do banco.",
    })
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
    addParticipante.mutate({
      grupoId,
      data: { nome: newParticipantName, chavePix: newParticipantPix || null }
    }, {
      onSuccess: () => {
        setIsAddParticipantOpen(false)
        setNewParticipantName("")
        setNewParticipantPix("")
        queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) })
        toast({ title: "Participante adicionado" })
      }
    })
  }

  const handlePay = () => {
    if (payDeId && payParaId && payValor > 0) {
      createPagamento.mutate({
        grupoId,
        data: { deId: payDeId, paraId: payParaId, valor: payValor }
      }, {
        onSuccess: () => {
          setIsPayOpen(false)
          queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) })
          queryClient.invalidateQueries({ queryKey: getListPagamentosQueryKey(grupoId) })
          toast({ title: "Pagamento registrado com sucesso!" })
        }
      })
    }
  }

  const getParticipantName = (id: number) => {
    return grupo?.participantes.find(p => p.id === id)?.nome || "Alguém"
  }

  const getParticipantPix = (id: number) => {
    return grupo?.participantes.find(p => p.id === id)?.chavePix
  }

  if (loadingGrupo) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>
  if (!grupo) return <div className="p-8 text-center text-destructive">Grupo não encontrado</div>

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background max-w-3xl mx-auto w-full">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50 p-4 pt-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0 -ml-2" onClick={() => setLocation("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate leading-tight">{grupo.nome}</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-0.5">
              <span>Código: <span className="font-mono font-medium text-foreground">{grupo.codigoConvite}</span></span>
              <button onClick={handleCopyInvite} className="hover:text-primary transition-colors">
                <Copy className="w-3.5 h-3.5" />
              </button>
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

          <TabsContent value="saldo" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            
            {/* Quem deve quem */}
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
                    const deNome = getParticipantName(debito.deId)
                    const paraNome = getParticipantName(debito.paraId)
                    const pix = getParticipantPix(debito.paraId)

                    return (
                      <Card key={i} className="overflow-hidden border-border/60">
                        <div className="p-4 flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-foreground">{deNome}</span>
                              <ArrowRight className="w-4 h-4 text-muted-foreground" />
                              <span className="font-bold text-foreground">{paraNome}</span>
                            </div>
                            <span className="font-bold text-destructive">{formatCurrency(debito.valor)}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                            <Button 
                              size="sm" 
                              variant="default"
                              className="w-full text-xs font-bold"
                              onClick={() => {
                                setPayDeId(debito.deId)
                                setPayParaId(debito.paraId)
                                setPayValor(debito.valor)
                                setIsPayOpen(true)
                              }}
                            >
                              Marcar como pago
                            </Button>
                            {pix && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="w-full text-xs gap-1.5"
                                onClick={() => handleCopyPix(pix)}
                              >
                                Copiar Pix <Copy className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Balanço por pessoa */}
            <div className="pt-4 border-t border-border/50">
              <div className="flex items-center justify-between px-1 mb-4">
                <h2 className="text-lg font-bold">Membros ({grupo.participantes.length})</h2>
                <Dialog open={isAddParticipantOpen} onOpenChange={setIsAddParticipantOpen}>
                  <DialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary/80">
                      <UserPlus className="w-4 h-4 mr-2" /> Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Adicionar participante</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Nome</Label>
                        <Input value={newParticipantName} onChange={e => setNewParticipantName(e.target.value)} placeholder="Ex: João" />
                      </div>
                      <div className="space-y-2">
                        <Label>Chave Pix (Opcional)</Label>
                        <Input value={newParticipantPix} onChange={e => setNewParticipantPix(e.target.value)} placeholder="CPF, celular..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button onClick={handleAddParticipant} disabled={!newParticipantName}>Adicionar</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="bg-card border rounded-2xl overflow-hidden shadow-sm divide-y">
                {saldo?.participantes.map(p => {
                  const partInfo = grupo.participantes.find(x => x.id === p.participanteId)
                  return (
                    <div key={p.participanteId} className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                          <span className="text-sm font-bold text-muted-foreground">{p.nome.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <p className="font-bold text-sm text-foreground">{p.nome}</p>
                          {partInfo?.chavePix && (
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">Pix: {partInfo.chavePix}</p>
                          )}
                        </div>
                      </div>
                      <div className={`text-sm font-bold ${p.saldoLiquido > 0 ? 'text-green-600 dark:text-green-500' : p.saldoLiquido < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                        {p.saldoLiquido > 0 ? '+' : ''}{formatCurrency(p.saldoLiquido)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </TabsContent>

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
              <div className="space-y-2 mt-4">
                {pagamentos?.map(pag => (
                  <div key={pag.id} className="flex items-center justify-between p-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {getParticipantName(pag.deId)} pagou {getParticipantName(pag.paraId)}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(pag.criadoEm)}</p>
                    </div>
                    <span className="font-bold text-sm text-green-600 dark:text-green-500">{formatCurrency(pag.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* FAB para nova despesa */}
      <div className="fixed bottom-6 left-0 right-0 px-4 flex justify-center z-20 pointer-events-none">
        <div className="max-w-3xl w-full flex justify-center sm:justify-end sm:pr-4">
          <Button 
            size="lg" 
            className="rounded-full shadow-xl shadow-primary/25 pointer-events-auto gap-2 px-6 h-14"
            onClick={() => setLocation(`/g/${grupo.id}/nova-despesa`)}
          >
            <Plus className="w-5 h-5" /> Adicionar despesa
          </Button>
        </div>
      </div>

      {/* Dialog Confirmar Pagamento */}
      <Dialog open={isPayOpen} onOpenChange={setIsPayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento</DialogTitle>
            <DialogDescription>
              Marcar esta dívida como paga. Isso atualizará os saldos de ambos.
            </DialogDescription>
          </DialogHeader>
          {payDeId && payParaId && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-center gap-4 text-lg">
                <span className="font-bold">{getParticipantName(payDeId)}</span>
                <ArrowRight className="w-5 h-5 text-muted-foreground" />
                <span className="font-bold">{getParticipantName(payParaId)}</span>
              </div>
              <div className="text-center">
                <span className="text-3xl font-extrabold text-foreground">{formatCurrency(payValor)}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPayOpen(false)}>Cancelar</Button>
            <Button onClick={handlePay}>Confirmar pagamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
