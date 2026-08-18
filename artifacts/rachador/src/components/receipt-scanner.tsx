import { useState, useRef } from "react"
import { Camera, Upload, X, Plus, Minus, ChevronDown, ChevronUp, Loader2, Receipt, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCurrency } from "@/lib/utils"
import type { Participante } from "@workspace/api-client"

export interface ReceiptItem {
  nome: string
  quantidade: number
  precoUnitario: number
  precoTotal: number
}

export interface ReceiptData {
  itens: ReceiptItem[]
  taxaServico: number | null
  totalSemTaxa: number
  totalComTaxa: number | null
}

// assignments[participanteId][itemIdx] = quantas unidades essa pessoa consumiu
type Assignments = Record<number, Record<number, number>>

interface ReceiptScannerProps {
  participantes: Participante[]
  onApply: (splits: Record<number, number>, total: number, descricao: string) => void
  onClose: () => void
}

export function ReceiptScanner({ participantes, onApply, onClose }: ReceiptScannerProps) {
  const [step, setStep] = useState<"capture" | "assigning">("capture")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [taxaPercent, setTaxaPercent] = useState<string>("")
  const [assignments, setAssignments] = useState<Assignments>({})
  const [expandedPerson, setExpandedPerson] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const scanImage = async (file: File) => {
    setLoading(true)
    setError(null)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const res = await fetch("/api/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      })
      if (!res.ok) throw new Error("Erro ao processar a nota")
      const data: ReceiptData = await res.json()
      setReceipt(data)
      setTaxaPercent(data.taxaServico != null ? data.taxaServico.toString() : "")

      const init: Assignments = {}
      participantes.forEach(p => {
        init[p.id] = {}
        data.itens.forEach((_, idx) => { init[p.id][idx] = 0 })
      })
      setAssignments(init)
      setExpandedPerson(participantes[0]?.id ?? null)
      setStep("assigning")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  // Quantas unidades de um item já foram atribuídas (a todos, exceto opcionalmente uma pessoa)
  const assignedForItem = (itemIdx: number, excludePersonId?: number): number => {
    return participantes.reduce((sum, p) => {
      if (p.id === excludePersonId) return sum
      return sum + (assignments[p.id]?.[itemIdx] ?? 0)
    }, 0)
  }

  const setQty = (participanteId: number, itemIdx: number, delta: number) => {
    setAssignments(prev => {
      const current = prev[participanteId]?.[itemIdx] ?? 0
      const totalItem = receipt!.itens[itemIdx].quantidade
      const usedByOthers = assignedForItem(itemIdx, participanteId)
      const maxAvail = totalItem - usedByOthers
      const next = Math.max(0, Math.min(maxAvail, current + delta))
      return {
        ...prev,
        [participanteId]: { ...(prev[participanteId] ?? {}), [itemIdx]: next },
      }
    })
  }

  const toggleItem = (participanteId: number, itemIdx: number) => {
    const current = assignments[participanteId]?.[itemIdx] ?? 0
    if (current > 0) {
      setQty(participanteId, itemIdx, -current)
    } else {
      setQty(participanteId, itemIdx, +1)
    }
  }

  // Subtotal de itens por pessoa
  const personSubtotal = (participanteId: number): number => {
    if (!receipt) return 0
    return receipt.itens.reduce((sum, item, idx) => {
      const qty = assignments[participanteId]?.[idx] ?? 0
      return sum + qty * item.precoUnitario
    }, 0)
  }

  const allSubtotals = participantes.map(p => personSubtotal(p.id))
  const totalSubtotal = allSubtotals.reduce((a, b) => a + b, 0)
  const taxaVal = parseFloat(taxaPercent) || 0

  const personServiceFee = (_participanteId: number): number => {
    if (participantes.length === 0 || taxaVal === 0) return 0
    const base = totalSubtotal > 0 ? totalSubtotal : (receipt?.totalSemTaxa ?? 0)
    return (taxaVal / 100) * base / participantes.length
  }

  const personTotal = (p: number) => personSubtotal(p) + personServiceFee(p)
  const grandTotal = participantes.reduce((sum, p) => sum + personTotal(p.id), 0)

  const handleApply = () => {
    const splits: Record<number, number> = {}
    participantes.forEach(p => {
      splits[p.id] = Math.round(personTotal(p.id) * 100) / 100
    })
    onApply(splits, Math.round(grandTotal * 100) / 100, "Nota fiscal")
  }

  // ── Capture ───────────────────────────────────────────────────────
  if (step === "capture") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center gap-3 p-4 border-b">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
          <h2 className="text-lg font-bold">Escanear Nota Fiscal</h2>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          {loading ? (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-sm font-medium">Lendo os itens da nota…</p>
            </div>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Receipt className="w-10 h-10 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-lg">Tire uma foto da nota</p>
                <p className="text-sm text-muted-foreground">
                  A IA lê os itens e você define quem consumiu cada um
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2 text-center">{error}</p>
              )}

              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button size="lg" className="h-14 text-base gap-2" onClick={() => cameraInputRef.current?.click()}>
                  <Camera className="w-5 h-5" /> Tirar foto
                </Button>
                <Button size="lg" variant="outline" className="h-14 text-base gap-2" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-5 h-5" /> Escolher da galeria
                </Button>
              </div>
            </>
          )}
        </div>

        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) scanImage(f) }} />
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) scanImage(f) }} />
      </div>
    )
  }

  if (!receipt) return null

  // ── Assigning ─────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Quem consumiu o quê?</h2>
          <p className="text-xs text-muted-foreground">
            {receipt.itens.length} iten{receipt.itens.length !== 1 ? "s" : ""} encontrado{receipt.itens.length !== 1 ? "s" : ""} na nota
          </p>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground shrink-0"
          onClick={() => { setStep("capture"); setReceipt(null) }}>
          Reanalisar
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-2">

        {/* Aviso de itens não atribuídos */}
        {receipt.itens.some((item, idx) => assignedForItem(idx) < item.quantidade) && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-700 font-medium">
            {receipt.itens.filter((item, idx) => assignedForItem(idx) < item.quantidade).length} iten(s) ainda não totalmente atribuído(s)
          </div>
        )}

        {/* Card por pessoa */}
        {participantes.map(p => {
          const isExpanded = expandedPerson === p.id
          const sub = personSubtotal(p.id)
          const total = personTotal(p.id)
          const itemCount = receipt.itens.reduce((n, _, idx) => n + (assignments[p.id]?.[idx] ?? 0 > 0 ? 1 : 0), 0)

          return (
            <div key={p.id} className={`rounded-2xl border-2 overflow-hidden transition-colors ${isExpanded ? "border-primary/60" : "border-border/50"}`}>
              {/* Person header */}
              <button
                type="button"
                className={`w-full flex items-center gap-3 p-3.5 text-left transition-colors ${isExpanded ? "bg-primary/5" : "bg-card"}`}
                onClick={() => setExpandedPerson(isExpanded ? null : p.id)}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-bold text-sm transition-colors ${
                  isExpanded ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"
                }`}>
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-foreground">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {itemCount === 0
                      ? "Nenhum item selecionado"
                      : `${itemCount} iten${itemCount !== 1 ? "s" : ""} · ${formatCurrency(sub)}`}
                  </p>
                </div>
                <div className="text-right shrink-0 mr-1">
                  {total > 0 && (
                    <p className="font-bold text-base text-foreground">{formatCurrency(total)}</p>
                  )}
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Item list for this person */}
              {isExpanded && (
                <div className="border-t divide-y bg-background">
                  {receipt.itens.map((item, idx) => {
                    const qty = assignments[p.id]?.[idx] ?? 0
                    const isSelected = qty > 0
                    const totalAvail = item.quantidade
                    const usedByOthers = assignedForItem(idx, p.id)
                    const maxForMe = totalAvail - usedByOthers
                    const isSingleUnit = totalAvail === 1

                    return (
                      <div key={idx} className={`flex items-center gap-3 px-4 py-3 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                        {/* Checkbox / toggle for single-unit items */}
                        {isSingleUnit ? (
                          <button
                            type="button"
                            onClick={() => toggleItem(p.id, idx)}
                            disabled={!isSelected && maxForMe === 0}
                            className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? "bg-primary border-primary"
                                : maxForMe === 0
                                  ? "border-border/40 opacity-40 cursor-not-allowed"
                                  : "border-border hover:border-primary/60"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                          </button>
                        ) : (
                          /* +/- stepper for multi-unit items */
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => setQty(p.id, idx, -1)}
                              disabled={qty === 0}
                              className="w-6 h-6 rounded-full border-2 border-border flex items-center justify-center disabled:opacity-30 hover:bg-secondary transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                            <button
                              type="button"
                              onClick={() => setQty(p.id, idx, +1)}
                              disabled={qty >= maxForMe && maxForMe <= qty}
                              className="w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center disabled:opacity-30 hover:bg-primary/10 transition-colors"
                            >
                              <Plus className="w-3 h-3 text-primary" />
                            </button>
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                            {item.nome}
                          </p>
                          {!isSingleUnit && (
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(item.precoUnitario)} cada · {maxForMe} disponível{maxForMe !== 1 ? "is" : ""}
                            </p>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          {isSelected ? (
                            <p className="text-sm font-bold text-foreground tabular-nums">
                              {formatCurrency(qty * item.precoUnitario)}
                            </p>
                          ) : (
                            <p className="text-sm text-muted-foreground tabular-nums">
                              {formatCurrency(isSingleUnit ? item.precoUnitario : item.precoUnitario)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {/* Taxa de serviço */}
        <div className="rounded-2xl border-2 border-border/50 p-4 space-y-3 bg-card">
          <div>
            <p className="text-sm font-semibold">Taxa de serviço</p>
            <p className="text-xs text-muted-foreground">Dividida igualmente entre todas as pessoas</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Input
                type="number"
                min="0"
                max="30"
                step="0.5"
                placeholder="0"
                value={taxaPercent}
                onChange={e => setTaxaPercent(e.target.value)}
                className="h-10 w-20 text-center font-bold pr-7"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
            </div>
            {taxaVal > 0 && totalSubtotal > 0 && (
              <p className="text-xs text-muted-foreground">
                = {formatCurrency((taxaVal / 100) * totalSubtotal)} no total
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer: resumo + botão */}
      <div className="border-t bg-card p-4 shrink-0 space-y-3">
        <div className="space-y-1">
          {participantes.map(p => {
            const total = personTotal(p.id)
            if (total === 0) return null
            return (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{p.nome}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(total)}</span>
              </div>
            )
          })}
          <div className="flex items-center justify-between font-bold text-base border-t pt-2 mt-1">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base shadow-lg shadow-primary/20"
          onClick={handleApply}
          disabled={grandTotal === 0}
        >
          Aplicar divisão
        </Button>
      </div>
    </div>
  )
}
