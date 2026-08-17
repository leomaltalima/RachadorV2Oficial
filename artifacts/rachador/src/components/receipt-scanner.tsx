import { useState, useRef } from "react"
import { Camera, Upload, X, Plus, Minus, ChevronDown, ChevronUp, Loader2, Receipt } from "lucide-react"
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

interface ParticipantItemQty {
  [participanteId: number]: {
    [itemIdx: number]: number // how many units of this item they had
  }
}

interface ReceiptScannerProps {
  participantes: Participante[]
  onApply: (splits: Record<number, number>, total: number, descricao: string) => void
  onClose: () => void
}

export function ReceiptScanner({ participantes, onApply, onClose }: ReceiptScannerProps) {
  const [step, setStep] = useState<"capture" | "assigning" | "review">("capture")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<ReceiptData | null>(null)
  const [taxaPercent, setTaxaPercent] = useState<string>("")
  const [assignments, setAssignments] = useState<ParticipantItemQty>({})
  const [expandedItem, setExpandedItem] = useState<number | null>(null)
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

      // Initialize assignments: 0 for each participant for each item
      const init: ParticipantItemQty = {}
      participantes.forEach(p => {
        init[p.id] = {}
        data.itens.forEach((_, idx) => { init[p.id][idx] = 0 })
      })
      setAssignments(init)
      setStep("assigning")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setLoading(false)
    }
  }

  const setQty = (participanteId: number, itemIdx: number, delta: number) => {
    setAssignments(prev => {
      const current = prev[participanteId]?.[itemIdx] ?? 0
      const maxQty = receipt!.itens[itemIdx].quantidade
      const next = Math.max(0, Math.min(maxQty, current + delta))
      return {
        ...prev,
        [participanteId]: { ...prev[participanteId], [itemIdx]: next },
      }
    })
  }

  const totalAssignedForItem = (itemIdx: number) => {
    return participantes.reduce((sum, p) => sum + (assignments[p.id]?.[itemIdx] ?? 0), 0)
  }

  // Compute each person's subtotal (items only, no service fee)
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

  // Service fee: split proportionally by subtotal (or equally if all zero)
  const personServiceFee = (participanteId: number): number => {
    const sub = personSubtotal(participanteId)
    if (totalSubtotal === 0) {
      return (taxaVal / 100) * (receipt?.totalSemTaxa ?? 0) / participantes.length
    }
    const totalFee = (taxaVal / 100) * totalSubtotal
    return (sub / totalSubtotal) * totalFee
  }

  const personTotal = (participanteId: number): number => {
    return personSubtotal(participanteId) + personServiceFee(participanteId)
  }

  const grandTotal = participantes.reduce((sum, p) => sum + personTotal(p.id), 0)

  const handleApply = () => {
    const splits: Record<number, number> = {}
    participantes.forEach(p => {
      splits[p.id] = Math.round(personTotal(p.id) * 100) / 100
    })
    const descricao = "Nota fiscal"
    onApply(splits, Math.round(grandTotal * 100) / 100, descricao)
  }

  // ── Capture step ──────────────────────────────────────────────
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
              <p className="text-sm font-medium">Analisando a nota fiscal…</p>
            </div>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
                <Receipt className="w-10 h-10 text-primary" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-lg">Tire uma foto da nota</p>
                <p className="text-sm text-muted-foreground">
                  A IA vai ler os itens e ajudar a dividir entre as pessoas
                </p>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-2 text-center">{error}</p>
              )}

              <div className="flex flex-col gap-3 w-full max-w-xs">
                <Button
                  size="lg"
                  className="h-14 text-base gap-2"
                  onClick={() => cameraInputRef.current?.click()}
                >
                  <Camera className="w-5 h-5" />
                  Tirar foto
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-14 text-base gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-5 h-5" />
                  Escolher da galeria
                </Button>
              </div>
            </>
          )}
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) scanImage(f) }}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) scanImage(f) }}
        />
      </div>
    )
  }

  // ── Assigning step ────────────────────────────────────────────
  if (!receipt) return null

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold">Quem comeu o quê?</h2>
          <p className="text-xs text-muted-foreground">Selecione as quantidades por pessoa</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => { setStep("capture"); setReceipt(null) }}
        >
          Reanalisar
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-2">
        {/* Items */}
        {receipt.itens.map((item, idx) => {
          const assigned = totalAssignedForItem(idx)
          const isOver = assigned > item.quantidade
          const isExpanded = expandedItem === idx

          return (
            <div key={idx} className={`rounded-2xl border-2 overflow-hidden transition-colors ${isOver ? "border-destructive/60" : "border-border/50"}`}>
              {/* Item header */}
              <button
                type="button"
                className="w-full flex items-center gap-3 p-3 text-left bg-card"
                onClick={() => setExpandedItem(isExpanded ? null : idx)}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{item.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantidade}x · {formatCurrency(item.precoUnitario)} cada
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold">{formatCurrency(item.precoTotal)}</p>
                  <p className={`text-xs ${isOver ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                    {assigned}/{item.quantidade} atribuído{assigned !== 1 ? "s" : ""}
                  </p>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Per-person assignment */}
              {isExpanded && (
                <div className="border-t divide-y bg-secondary/20">
                  {participantes.map(p => {
                    const qty = assignments[p.id]?.[idx] ?? 0
                    return (
                      <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                        <span className="flex-1 text-sm font-medium truncate">{p.nome}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setQty(p.id, idx, -1)}
                            disabled={qty === 0}
                            className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center disabled:opacity-30 hover:bg-secondary transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-5 text-center text-sm font-bold tabular-nums">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(p.id, idx, +1)}
                            disabled={qty >= item.quantidade}
                            className="w-7 h-7 rounded-full border-2 border-primary flex items-center justify-center disabled:opacity-30 hover:bg-primary/10 transition-colors"
                          >
                            <Plus className="w-3 h-3 text-primary" />
                          </button>
                          {qty > 0 && (
                            <span className="text-xs text-muted-foreground w-12 text-right tabular-nums">
                              {formatCurrency(qty * item.precoUnitario)}
                            </span>
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

        {/* Service fee */}
        <div className="rounded-2xl border-2 border-border/50 p-3 space-y-2 bg-card">
          <p className="text-sm font-medium">Taxa de serviço (%)</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min="0"
              max="30"
              step="0.5"
              placeholder="Ex: 10"
              value={taxaPercent}
              onChange={e => setTaxaPercent(e.target.value)}
              className="h-10 w-24 text-center font-bold"
            />
            <span className="text-sm text-muted-foreground">%</span>
            {taxaVal > 0 && (
              <span className="text-xs text-muted-foreground ml-2">
                Dividida proporcionalmente pelo consumo de cada um
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Totals & apply */}
      <div className="border-t bg-card p-4 shrink-0 space-y-3">
        <div className="space-y-1.5">
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
          <div className="flex items-center justify-between font-bold text-base border-t pt-1.5 mt-1">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(grandTotal)}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-12 text-base shadow-lg shadow-primary/20"
          onClick={handleApply}
        >
          Aplicar divisão
        </Button>
      </div>
    </div>
  )
}
