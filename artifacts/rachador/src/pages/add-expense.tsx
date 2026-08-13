import { useState, useMemo } from "react"
import { useLocation, useParams } from "wouter"
import { useGetGrupo, useCreateDespesa, getListDespesasQueryKey, getGetSaldoQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { formatCurrency } from "@/lib/utils"

import { ArrowLeft, Calculator, Users } from "lucide-react"

export default function AddExpense() {
  const { grupoId: idStr } = useParams()
  const grupoId = Number(idStr)
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const { data: grupo } = useGetGrupo(grupoId, { query: { enabled: !!grupoId } })
  const createDespesa = useCreateDespesa()

  const [descricao, setDescricao] = useState("")
  const [valorStr, setValorStr] = useState("")
  const [pagoPorId, setPagoPorId] = useState<string>("")
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal")
  
  // For custom split
  const [customSplits, setCustomSplits] = useState<Record<number, string>>({})

  const valor = parseFloat(valorStr.replace(',', '.')) || 0

  const handleCustomSplitChange = (id: number, val: string) => {
    setCustomSplits(prev => ({ ...prev, [id]: val }))
  }

  const onSubmit = () => {
    if (!descricao || valor <= 0 || !pagoPorId) {
      toast({ title: "Preencha todos os campos corretamente", variant: "destructive" })
      return
    }

    let divisoes: { participanteId: number, valorDevido: number }[] = []

    if (splitMode === "equal") {
      const perPerson = Number((valor / grupo!.participantes.length).toFixed(2))
      // Adjust remainder
      let sum = 0
      divisoes = grupo!.participantes.map((p, i) => {
        let v = perPerson
        if (i === grupo!.participantes.length - 1) {
          v = Number((valor - sum).toFixed(2))
        } else {
          sum += v
        }
        return { participanteId: p.id, valorDevido: v }
      })
    } else {
      let sum = 0
      divisoes = grupo!.participantes.map(p => {
        const v = parseFloat(customSplits[p.id]?.replace(',', '.') || "0")
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
              <Label>Valor Total (R$)</Label>
              <Input 
                type="number"
                step="0.01"
                placeholder="0.00" 
                className="h-14 text-2xl font-bold"
                value={valorStr}
                onChange={e => setValorStr(e.target.value)}
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">Como dividir?</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button 
              type="button"
              variant={splitMode === "equal" ? "default" : "outline"}
              className="h-14 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2"
              onClick={() => setSplitMode("equal")}
            >
              <Users className="w-4 h-4" />
              <span className="text-xs">Igual para todos</span>
            </Button>
            <Button 
              type="button"
              variant={splitMode === "custom" ? "default" : "outline"}
              className="h-14 border-2 shadow-none flex flex-col gap-1 items-center justify-center py-2"
              onClick={() => setSplitMode("custom")}
            >
              <Calculator className="w-4 h-4" />
              <span className="text-xs">Valores diferentes</span>
            </Button>
          </div>

          {splitMode === "equal" && valor > 0 && (
            <Card className="bg-secondary/50 border-none">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium">Cada um paga ({grupo.participantes.length})</span>
                <span className="font-bold text-lg">{formatCurrency(valor / grupo.participantes.length)}</span>
              </CardContent>
            </Card>
          )}

          {splitMode === "custom" && (
            <div className="space-y-3 mt-4">
              {grupo.participantes.map(p => (
                <div key={p.id} className="flex items-center justify-between gap-4">
                  <span className="font-medium text-sm w-1/2 truncate">{p.nome}</span>
                  <div className="relative w-1/2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                    <Input 
                      type="number" 
                      step="0.01" 
                      className="pl-8 text-right font-medium"
                      placeholder="0.00"
                      value={customSplits[p.id] || ""}
                      onChange={e => handleCustomSplitChange(p.id, e.target.value)}
                    />
                  </div>
                </div>
              ))}
              {/* helper for validation */}
              <div className="text-right text-xs text-muted-foreground pt-2">
                Total distribuído: R$ {Object.values(customSplits).reduce((sum, v) => sum + (parseFloat(v.replace(',','.'))||0), 0).toFixed(2)} / {valor.toFixed(2)}
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
  )
}
