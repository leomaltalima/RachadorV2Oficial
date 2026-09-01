import { useState, useEffect } from "react"
import { useLocation, useParams } from "wouter"
import { useGetGrupo, useCreateDespesa, getListDespesasQueryKey, getGetSaldoQueryKey, getGetGrupoQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"
import { getSession } from "@/lib/session"
import { ReceiptScanner } from "@/components/receipt-scanner"

import { ArrowLeft, Calculator, Users, UserCheck, Check, ScanLine, Percent, PieChart, Tag } from "lucide-react"

type SplitMode = "equal" | "select" | "custom" | "percentage" | "shares"

const CATEGORIES = [
  "Alimentação",
  "Transporte",
  "Hospedagem",
  "Lazer",
  "Mercado",
  "Compras",
  "Saúde",
  "Outros"
]

/** Converte dígitos brutos em formato "1.234,56" (centavos primeiro) */
function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const num = parseInt(digits, 10)
  if (num === 0) return ''
  const reais = Math.floor(num / 100)
  const centavos = num % 100
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0'
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`
}

/** Converte valor numérico em string mascarada */
function toCurrencyMask(value: number): string {
  const cents = Math.round(value * 100)
  if (cents === 0) return ''
  const reais = Math.floor(cents / 100)
  const centavos = cents % 100
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0'
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`
}

/** Converte "1.234,56" → 1234.56 */
function parseCurrencyMask(masked: string): number {
  const digits = masked.replace(/\D/g, '')
  if (!digits) return 0
  return parseInt(digits, 10) / 100
}

export default function AddExpense() {
  const { grupoId: idStr } = useParams()
  const grupoId = Number(idStr)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: grupo } = useGetGrupo(grupoId, { query: { enabled: !!grupoId, queryKey: getGetGrupoQueryKey(grupoId) } })
  const createDespesa = useCreateDespesa()

  const [descricao, setDescricao] = useState("")
  const [valorStr, setValorStr] = useState("")
  const [pagoPorId, setPagoPorId] = useState<string>(() => {
    const sessionId = getSession(grupoId)
    return sessionId !== null ? sessionId.toString() : ""
  })
  const [splitMode, setSplitMode] = useState<SplitMode>("equal")
  const [showScanner, setShowScanner] = useState(false)
  const [categoria, setCategoria] = useState<string>(() => {
    const saved = localStorage.getItem("rachador_last_category")
    return (saved && CATEGORIES.includes(saved)) ? saved : "Outros"
  })

  const handleCategoryChange = (val: string) => {
    setCategoria(val)
    localStorage.setItem("rachador_last_category", val)
  }

  // For "select" mode – who's splitting (all selected by default after group loads)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [selectedInitialized, setSelectedInitialized] = useState(false)

  // For custom split
  const [customSplits, setCustomSplits] = useState<Record<number, string>>({})
  const [percentageSplits, setPercentageSplits] = useState<Record<number, string>>({})
  const [shareSplits, setShareSplits] = useState<Record<number, string>>({})

  const valor = parseCurrencyMask(valorStr)

  // Initialize selectedIds once grupo loads
  if (grupo && !selectedInitialized) {
    setSelectedIds(new Set(grupo.participantes.map(p => p.id)))
    setSelectedInitialized(true)
  }

  const toggleParticipant = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size === 1) return prev
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedCount = selectedIds.size
  const perPersonSelect = selectedCount > 0 ? valor / selectedCount : 0

  const handleCustomSplitChange = (id: number, val: string) => {
    setCustomSplits(prev => ({ ...prev, [id]: val }))
  }

  const handlePercentageChange = (id: number, val: string) => {
    setPercentageSplits(prev => ({ ...prev, [id]: val }))
  }

  const handleShareChange = (id: number, val: string) => {
    setShareSplits(prev => ({ ...prev, [id]: val }))
  }

  // Called when receipt scanner applies its result
  const handleReceiptApply = (splits: Record<number, number>, total: number, desc: string) => {
    setCustomSplits(
      Object.fromEntries(
        Object.entries(splits).map(([id, v]) => [id, toCurrencyMask(v)])
      )
    )
    setValorStr(toCurrencyMask(total))
    if (!descricao) setDescricao(desc)
    setSplitMode("custom")
    setShowScanner(false)
  }

  const onSubmit = () => {
    if (!descricao || valor <= 0 || !pagoPorId) {
      toast({ title: "Preencha todos os campos corretamente", variant: "destructive" })
      return
    }

    let divisoes: { participanteId: number, valorDevido: number, porcentagem?: number, cotas?: number }[] = []
    let tipoDivisao: "igual" | "porcentagem" | "cotas" | "personalizado" | "selecionados" = "igual"

    if (splitMode === "equal") {
      tipoDivisao = "igual"
      const participants = grupo!.participantes
      const perPerson = Number((valor / participants.length).toFixed(2))
      let sum = 0
      divisoes = participants.map((p, i) => {
        let v = perPerson
        if (i === participants.length - 1) {
          v = Number((valor - sum).toFixed(2))
        } else {
          sum += v
        }
        return { participanteId: p.id, valorDevido: v }
      })
    } else if (splitMode === "select") {
      tipoDivisao = "selecionados"
      const included = grupo!.participantes.filter(p => selectedIds.has(p.id))
      if (included.length === 0) {
        toast({ title: "Selecione pelo menos um participante", variant: "destructive" })
        return
      }
      const perPerson = Number((valor / included.length).toFixed(2))
      let sum = 0
      divisoes = grupo!.participantes.map(p => {
        if (!selectedIds.has(p.id)) return { participanteId: p.id, valorDevido: 0 }
        const isLast = p.id === included[included.length - 1].id
        let v = perPerson
        if (isLast) {
          v = Number((valor - sum).toFixed(2))
        } else {
          sum += v
        }
        return { participanteId: p.id, valorDevido: v }
      })
    } else if (splitMode === "percentage") {
      tipoDivisao = "porcentagem"
      let sumPct = 0
      let totalValueAssigned = 0
      
      const parsedPct = grupo!.participantes.map(p => {
        const rawPct = parseFloat(percentageSplits[p.id]?.replace(',', '.') || "0")
        sumPct += rawPct
        return { id: p.id, pct: rawPct }
      })
      
      if (Math.abs(sumPct - 100) > 0.05) {
        toast({ title: "A soma das porcentagens deve ser exatamente 100%", variant: "destructive" })
        return
      }

      divisoes = parsedPct.map((p, i) => {
        if (p.pct === 0) return { participanteId: p.id, valorDevido: 0, porcentagem: 0 }
        let v = Number(((valor * p.pct) / 100).toFixed(2))
        
        const isLastActive = i === parsedPct.findLastIndex(x => x.pct > 0)
        if (isLastActive) {
          v = Number((valor - totalValueAssigned).toFixed(2))
        } else {
          totalValueAssigned += v
        }
        return { participanteId: p.id, valorDevido: v, porcentagem: p.pct }
      })
    } else if (splitMode === "shares") {
      tipoDivisao = "cotas"
      let sumShares = 0
      let totalValueAssigned = 0
      
      const parsedShares = grupo!.participantes.map(p => {
        const share = parseFloat(shareSplits[p.id] || "0")
        sumShares += share
        return { id: p.id, share }
      })
      
      if (sumShares <= 0) {
        toast({ title: "A soma das cotas deve ser maior que zero", variant: "destructive" })
        return
      }

      divisoes = parsedShares.map((p, i) => {
        if (p.share === 0) return { participanteId: p.id, valorDevido: 0, cotas: 0 }
        let v = Number(((valor * p.share) / sumShares).toFixed(2))
        
        // For the last non-zero share participant, we adjust to fix rounding
        const isLastActive = i === parsedShares.findLastIndex(x => x.share > 0)
        if (isLastActive) {
          v = Number((valor - totalValueAssigned).toFixed(2))
        } else {
          totalValueAssigned += v
        }
        return { participanteId: p.id, valorDevido: v, cotas: p.share }
      })
    } else {
      tipoDivisao = "personalizado"
      let sum = 0
      divisoes = grupo!.participantes.map(p => {
        const v = parseCurrencyMask(customSplits[p.id] || '')
        sum += v
        return { participanteId: p.id, valorDevido: v }
      })
      if (Math.abs(sum - valor) > 0.05) {
        toast({ title: "A soma das divisões deve ser igual ao valor total", variant: "destructive" })
        return
      }
    }

    createDespesa.mutate({
      grupoId,
      data: {
        descricao,
        valor,
        categoria: categoria as any,
        tipoDivisao: tipoDivisao as any,
        pagoPorId: Number(pagoPorId),
        divisoes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupoId) })
        queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) })
        toast({ title: "Despesa adicionada com sucesso!" })
        setLocation(`/g/${grupoId}`)
      }
    })
  }

  if (!grupo) return null

  return (
    <>
      {showScanner && (
        <ReceiptScanner
          participantes={grupo.participantes}
          onApply={handleReceiptApply}
          onClose={() => setShowScanner(false)}
        />
      )}

      <div className="min-h-[100dvh] flex flex-col p-4 sm:p-8 max-w-2xl mx-auto w-full bg-background">
        <header className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" className="-ml-2" onClick={() => setLocation(`/g/${grupoId}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-bold">Nova Despesa</h1>
        </header>

        <div className="space-y-6">
          <Card className="border-border/50 shadow-md">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label>O que foi pago?</Label>
                <Input
                  placeholder="Ex: Cervejas, Aluguel da casa..."
                  className="h-12 text-base"
                  value={descricao}
                  onChange={e => setDescricao(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select value={categoria} onValueChange={handleCategoryChange}>
                  <SelectTrigger className="h-12">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-muted-foreground" />
                      <SelectValue placeholder="Selecione a categoria" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor Total (R$)</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  className="h-14 text-2xl font-bold"
                  value={valorStr}
                  onChange={e => setValorStr(formatCurrencyInput(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Quem pagou?</Label>
                <Select value={pagoPorId} onValueChange={setPagoPorId}>
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione quem pagou" />
                  </SelectTrigger>
                  <SelectContent>
                    {grupo.participantes.map(p => (
                      <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h2 className="text-lg font-bold">Como dividir?</h2>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Button
                type="button"
                variant={splitMode === "equal" ? "default" : "outline"}
                className="h-16 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2 px-1"
                onClick={() => setSplitMode("equal")}
              >
                <Users className="w-4 h-4" />
                <span className="text-xs text-center leading-tight">Igual</span>
              </Button>
              <Button
                type="button"
                variant={splitMode === "select" ? "default" : "outline"}
                className="h-16 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2 px-1"
                onClick={() => setSplitMode("select")}
              >
                <UserCheck className="w-4 h-4" />
                <span className="text-xs text-center leading-tight">Selecionar</span>
              </Button>
              <Button
                type="button"
                variant={splitMode === "custom" ? "default" : "outline"}
                className="h-16 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2 px-1"
                onClick={() => setSplitMode("custom")}
              >
                <Calculator className="w-4 h-4" />
                <span className="text-xs text-center leading-tight">Valores</span>
              </Button>
              <Button
                type="button"
                variant={splitMode === "percentage" ? "default" : "outline"}
                className="h-16 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2 px-1"
                onClick={() => setSplitMode("percentage")}
              >
                <Percent className="w-4 h-4" />
                <span className="text-xs text-center leading-tight">Porcentagem</span>
              </Button>
              <Button
                type="button"
                variant={splitMode === "shares" ? "default" : "outline"}
                className="h-16 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2 px-1"
                onClick={() => setSplitMode("shares")}
              >
                <PieChart className="w-4 h-4" />
                <span className="text-xs text-center leading-tight">Cotas</span>
              </Button>
            </div>

            {/* Equal: preview card */}
            {splitMode === "equal" && valor > 0 && (
              <Card className="bg-secondary/50 border-none">
                <CardContent className="p-4 flex items-center justify-between">
                  <span className="text-sm font-medium">Cada um paga ({grupo.participantes.length})</span>
                  <span className="font-bold text-lg">{formatCurrency(valor / grupo.participantes.length)}</span>
                </CardContent>
              </Card>
            )}

            {/* Select: pick participants */}
            {splitMode === "select" && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground px-1">
                  Selecione quem participa dessa divisão
                </p>
                <div className="space-y-2">
                  {grupo.participantes.map(p => {
                    const isSelected = selectedIds.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleParticipant(p.id)}
                        className={`w-full flex items-center justify-between p-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border/50 bg-background text-muted-foreground"
                        }`}
                      >
                        <span className="font-medium text-sm">{p.nome}</span>
                        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected ? "bg-primary border-primary" : "border-border"
                        }`}>
                          {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
                {valor > 0 && selectedCount > 0 && (
                  <Card className="bg-secondary/50 border-none">
                    <CardContent className="p-4 flex items-center justify-between">
                      <span className="text-sm font-medium">Cada um paga ({selectedCount})</span>
                      <span className="font-bold text-lg">{formatCurrency(perPersonSelect)}</span>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Custom: enter amounts per person */}
            {splitMode === "custom" && (
              <div className="space-y-4 mt-2">
                {/* Scan receipt button */}
                <button
                  type="button"
                  onClick={() => setShowScanner(true)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 hover:bg-primary/10 hover:border-primary/60 transition-all text-left group"
                >
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0 group-hover:bg-primary/25 transition-colors">
                    <ScanLine className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-foreground">Escanear nota fiscal</p>
                    <p className="text-xs text-muted-foreground">A IA lê os itens e divide automaticamente</p>
                  </div>
                </button>

                {/* Manual inputs */}
                <div className="space-y-3">
                  {grupo.participantes.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-4">
                      <span className="font-medium text-sm w-1/2 truncate">{p.nome}</span>
                      <div className="relative w-1/2">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="pl-8 text-right font-medium"
                          placeholder="0,00"
                          value={customSplits[p.id] || ""}
                          onChange={e => handleCustomSplitChange(p.id, formatCurrencyInput(e.target.value))}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="text-right text-xs text-muted-foreground pt-2">
                    Total distribuído: R$ {Object.values(customSplits).reduce((sum, v) => sum + parseCurrencyMask(v), 0).toFixed(2)} / {valor.toFixed(2)}
                  </div>
                </div>
              </div>
            )}

            {/* Percentage: enter pct per person */}
            {splitMode === "percentage" && (
              <div className="space-y-4 mt-2">
                <div className="space-y-3">
                  {grupo.participantes.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-4">
                      <span className="font-medium text-sm w-1/2 truncate">{p.nome}</span>
                      <div className="relative w-1/2">
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          className="pr-8 text-right font-medium"
                          placeholder="0"
                          value={percentageSplits[p.id] || ""}
                          onChange={e => handlePercentageChange(p.id, e.target.value.replace(/[^0-9,]/g, ''))}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="text-right text-xs text-muted-foreground pt-2">
                    Total: {Object.values(percentageSplits).reduce((sum, v) => sum + parseFloat(v.replace(',', '.') || '0'), 0).toFixed(2)}% / 100%
                  </div>
                </div>
              </div>
            )}

            {/* Shares: enter shares per person */}
            {splitMode === "shares" && (
              <div className="space-y-4 mt-2">
                <div className="space-y-3">
                  {grupo.participantes.map(p => (
                    <div key={p.id} className="flex items-center justify-between gap-4">
                      <span className="font-medium text-sm w-1/2 truncate">{p.nome}</span>
                      <div className="relative w-1/2">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="text-right font-medium"
                          placeholder="Ex: 1"
                          value={shareSplits[p.id] || ""}
                          onChange={e => handleShareChange(p.id, e.target.value.replace(/\D/g, ''))}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="text-right text-xs text-muted-foreground pt-2">
                    Total de cotas: {Object.values(shareSplits).reduce((sum, v) => sum + parseInt(v || '0', 10), 0)}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 pb-8">
            <Button
              size="lg"
              className="w-full h-14 text-lg shadow-xl shadow-primary/20"
              onClick={onSubmit}
              disabled={createDespesa.isPending}
            >
              {createDespesa.isPending ? "Salvando..." : "Salvar Despesa"}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
