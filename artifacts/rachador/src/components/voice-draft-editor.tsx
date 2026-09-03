import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AlertCircle, Trash2, Users, UserCheck, Calculator, Percent, PieChart, ChevronDown, ChevronUp } from "lucide-react";
import type { VoiceExpenseDraft, GrupoComParticipantes, VoiceExpenseDivision, Participante } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";

const CATEGORIES = ["Alimentação", "Transporte", "Hospedagem", "Lazer", "Mercado", "Compras", "Saúde", "Outros"];

export function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (num === 0) return '';
  const reais = Math.floor(num / 100);
  const centavos = num % 100;
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0';
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`;
}

export function parseCurrencyMask(masked: string): number {
  const digits = masked.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

export function toCurrencyMask(value: number): string {
  const cents = Math.round(value * 100);
  if (cents === 0) return '';
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0';
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`;
}

export function recalculateDivisions(
  totalValue: number,
  participants: Participante[],
  selectedIds: Set<number>,
  splitMode: string,
  currentDivisions: VoiceExpenseDivision[]
): VoiceExpenseDivision[] {
  let divisoes: VoiceExpenseDivision[] = [];
  
  if (splitMode === "igual" || splitMode === "selecionados") {
     const included = splitMode === "igual" 
        ? participants 
        : participants.filter(p => selectedIds.has(p.id));
        
     if (included.length === 0) {
       return participants.map(p => ({ participanteId: p.id, nome: p.nome, valorDevido: 0, porcentagem: null, cotas: null }));
     }
     
     const perPerson = Number((totalValue / included.length).toFixed(2));
     let sum = 0;
     divisoes = participants.map(p => {
        const isIncluded = splitMode === "igual" || selectedIds.has(p.id);
        if (!isIncluded) {
           return { participanteId: p.id, nome: p.nome, valorDevido: 0, porcentagem: null, cotas: null };
        }
        const isLast = p.id === included[included.length - 1].id;
        let v = perPerson;
        if (isLast) {
           v = Number((totalValue - sum).toFixed(2));
        } else {
           sum += v;
        }
        return { participanteId: p.id, nome: p.nome, valorDevido: v, porcentagem: null, cotas: null };
     });
  } else if (splitMode === "porcentagem") {
     let sumPct = 0;
     let totalValueAssigned = 0;
     const parsedPct = participants.map(p => {
        const existing = currentDivisions.find(d => d.participanteId === p.id);
        const pct = existing?.porcentagem || 0;
        sumPct += pct;
        return { id: p.id, pct };
     });
     
     divisoes = parsedPct.map((p, i) => {
        if (p.pct === 0) return { participanteId: p.id, nome: participants.find(x => x.id === p.id)!.nome, valorDevido: 0, porcentagem: 0, cotas: null };
        let v = Number(((totalValue * p.pct) / 100).toFixed(2));
        const isLastActive = i === parsedPct.findLastIndex(x => x.pct > 0);
        if (isLastActive && Math.abs(sumPct - 100) < 0.05) {
           v = Number((totalValue - totalValueAssigned).toFixed(2));
        } else {
           totalValueAssigned += v;
        }
        return { participanteId: p.id, nome: participants.find(x => x.id === p.id)!.nome, valorDevido: v, porcentagem: p.pct, cotas: null };
     });
  } else if (splitMode === "cotas") {
     let sumShares = 0;
     let totalValueAssigned = 0;
     const parsedShares = participants.map(p => {
        const existing = currentDivisions.find(d => d.participanteId === p.id);
        const share = existing?.cotas || 0;
        sumShares += share;
        return { id: p.id, share };
     });
     
     divisoes = parsedShares.map((p, i) => {
        if (p.share === 0) return { participanteId: p.id, nome: participants.find(x => x.id === p.id)!.nome, valorDevido: 0, porcentagem: null, cotas: 0 };
        let v = Number(((totalValue * p.share) / sumShares).toFixed(2));
        const isLastActive = i === parsedShares.findLastIndex(x => x.share > 0);
        if (isLastActive && sumShares > 0) {
           v = Number((totalValue - totalValueAssigned).toFixed(2));
        } else {
           totalValueAssigned += v;
        }
        return { participanteId: p.id, nome: participants.find(x => x.id === p.id)!.nome, valorDevido: v, porcentagem: null, cotas: p.share };
     });
  } else {
     divisoes = participants.map(p => {
        const existing = currentDivisions.find(d => d.participanteId === p.id);
        return {
           participanteId: p.id,
           nome: p.nome,
           valorDevido: existing?.valorDevido || 0,
           porcentagem: null,
           cotas: null
        };
     });
  }
  return divisoes;
}

export function VoiceDraftEditor({
  draft,
  grupo,
  isValid,
  onChange,
  onDelete
}: {
  draft: VoiceExpenseDraft;
  grupo: GrupoComParticipantes;
  isValid: boolean;
  onChange: (d: VoiceExpenseDraft) => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(!isValid || (draft.precisaConfirmacao && draft.precisaConfirmacao.length > 0));
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => {
     if (draft.tipoDivisao === "selecionados") {
        return new Set(draft.divisoes.filter(d => d.valorDevido > 0).map(d => d.participanteId));
     }
     return new Set(grupo.participantes.map(p => p.id));
  });

  const handleFieldChange = (field: keyof VoiceExpenseDraft, value: any) => {
     const next = { ...draft, [field]: value };
     if (field === "valor" || field === "tipoDivisao") {
        next.divisoes = recalculateDivisions(next.valor || 0, grupo.participantes, selectedIds, next.tipoDivisao, next.divisoes);
     }
     onChange(next);
  };

  const toggleParticipant = (id: number) => {
     const nextIds = new Set(selectedIds);
     if (nextIds.has(id)) {
        nextIds.delete(id);
     } else {
        nextIds.add(id);
     }
     setSelectedIds(nextIds);
     
     if (draft.tipoDivisao === "selecionados") {
        const nextDraft = { ...draft };
        nextDraft.divisoes = recalculateDivisions(nextDraft.valor || 0, grupo.participantes, nextIds, nextDraft.tipoDivisao, nextDraft.divisoes);
        onChange(nextDraft);
     }
  };

  const handleDivisionChange = (id: number, field: "valorDevido" | "porcentagem" | "cotas", value: number) => {
     const nextDivs = [...draft.divisoes];
     const idx = nextDivs.findIndex(d => d.participanteId === id);
     if (idx >= 0) {
        nextDivs[idx] = { ...nextDivs[idx], [field]: value };
     } else {
        const p = grupo.participantes.find(x => x.id === id);
        nextDivs.push({ participanteId: id, nome: p?.nome || "", valorDevido: 0, porcentagem: null, cotas: null, [field]: value });
     }
     
     const nextDraft = { ...draft, divisoes: nextDivs };
     if (draft.tipoDivisao === "porcentagem" || draft.tipoDivisao === "cotas") {
         nextDraft.divisoes = recalculateDivisions(nextDraft.valor || 0, grupo.participantes, selectedIds, nextDraft.tipoDivisao, nextDivs);
     }
     onChange(nextDraft);
  };

  const valStr = draft.valor ? toCurrencyMask(draft.valor) : "";
  const sumDivs = draft.divisoes.reduce((acc, d) => acc + (d.valorDevido || 0), 0);
  const valDiff = Math.abs(sumDivs - (draft.valor || 0)) > 0.05;

  return (
    <Card className={`overflow-hidden transition-all duration-300 ${!isValid ? "border-destructive/50 shadow-destructive/10 shadow-sm" : "border-border/50"}`}>
       <div className={`p-4 flex items-center justify-between cursor-pointer transition-colors hover:bg-secondary/20 ${expanded ? "bg-secondary/20 border-b border-border/50" : ""}`} onClick={() => setExpanded(!expanded)}>
          <div className="flex-1 min-w-0 pr-4">
             <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-base truncate">{draft.descricao || "Sem descrição"}</h4>
                {!isValid && <AlertCircle className="w-4 h-4 text-destructive shrink-0" />}
             </div>
             <p className="text-sm text-muted-foreground flex gap-2 items-center">
                <span>{draft.pagoPorId ? grupo.participantes.find(p => p.id === draft.pagoPorId)?.nome : "Pagador não definido"}</span>
                <span>•</span>
                <span className={!draft.valor ? "text-destructive font-medium" : "font-medium text-foreground"}>{draft.valor ? formatCurrency(draft.valor) : "R$ 0,00"}</span>
             </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
             <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
                <Trash2 className="w-4 h-4" />
             </Button>
             {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
          </div>
       </div>

       {expanded && (
          <CardContent className="p-4 space-y-6 bg-background">
             {draft.precisaConfirmacao && draft.precisaConfirmacao.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg space-y-1">
                   <p className="text-xs font-semibold text-amber-800 dark:text-amber-500">Atenção da IA:</p>
                   <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                      {draft.precisaConfirmacao.map((msg, i) => <li key={i}>{msg}</li>)}
                   </ul>
                </div>
             )}
              {draft.nomesNaoResolvidos.length > 0 && (
                <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <p className="text-xs font-semibold text-destructive">Participantes não identificados:</p>
                  <p className="mt-1 text-xs text-muted-foreground">{draft.nomesNaoResolvidos.join(", ")}</p>
                </div>
              )}

             <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                   <Label className={!draft.descricao ? "text-destructive" : ""}>Descrição</Label>
                   <Input value={draft.descricao} onChange={e => handleFieldChange("descricao", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                   <Label className={!draft.valor ? "text-destructive" : ""}>Valor Total (R$)</Label>
                   <Input 
                      value={valStr} 
                      onChange={e => handleFieldChange("valor", parseCurrencyMask(e.target.value))} 
                      className={draft.confianca?.valor === "baixa" ? "border-amber-400 dark:border-amber-500" : ""}
                      placeholder="0,00"
                   />
                </div>
                <div className="space-y-1.5">
                   <Label className={!draft.pagoPorId ? "text-destructive" : ""}>Quem pagou?</Label>
                   <Select value={draft.pagoPorId?.toString() || ""} onValueChange={v => handleFieldChange("pagoPorId", Number(v))}>
                      <SelectTrigger className={!draft.pagoPorId || draft.confianca?.pagador === "baixa" ? "border-amber-400 dark:border-amber-500" : ""}>
                         <SelectValue placeholder="Selecione quem pagou" />
                      </SelectTrigger>
                      <SelectContent>
                         {grupo.participantes.map(p => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.nome}</SelectItem>
                         ))}
                      </SelectContent>
                   </Select>
                </div>
                <div className="space-y-1.5">
                   <Label>Categoria</Label>
                   <Select value={draft.categoria || "Outros"} onValueChange={v => handleFieldChange("categoria", v)}>
                      <SelectTrigger className={draft.confianca?.categoria === "baixa" ? "border-amber-400 dark:border-amber-500" : ""}>
                         <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                         {CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                         ))}
                      </SelectContent>
                   </Select>
                </div>
             </div>

             <div className="space-y-4 pt-4 border-t border-border/50">
                <div className="flex items-center justify-between">
                   <Label className={draft.confianca?.participantes === "baixa" ? "text-amber-600 dark:text-amber-500" : ""}>
                     Como dividir?
                   </Label>
                   {valDiff && draft.tipoDivisao === "personalizado" && (
                      <span className="text-xs font-medium text-destructive flex items-center gap-1">
                         <AlertCircle className="w-3 h-3" /> Diferença de {formatCurrency(Math.abs(sumDivs - (draft.valor || 0)))}
                      </span>
                   )}
                </div>
                
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 snap-x scrollbar-none">
                   {[
                     { id: "igual", icon: Users, label: "Igual" },
                     { id: "selecionados", icon: UserCheck, label: "Selecionar" },
                     { id: "personalizado", icon: Calculator, label: "Valores" },
                     { id: "porcentagem", icon: Percent, label: "Porcentagem" },
                     { id: "cotas", icon: PieChart, label: "Cotas" }
                   ].map(mode => {
                      const Icon = mode.icon;
                      const isActive = draft.tipoDivisao === mode.id;
                      return (
                         <Button
                            key={mode.id}
                            type="button"
                            variant={isActive ? "default" : "outline"}
                            size="sm"
                            className={`shrink-0 snap-start h-9 ${isActive ? "shadow-md" : ""}`}
                            onClick={() => handleFieldChange("tipoDivisao", mode.id)}
                         >
                            <Icon className="w-3.5 h-3.5 mr-1.5" />
                            {mode.label}
                         </Button>
                      )
                   })}
                </div>

                <div className="space-y-2 bg-secondary/20 p-3 rounded-xl border border-border/50">
                   {grupo.participantes.map(p => {
                      const div = draft.divisoes.find(d => d.participanteId === p.id);
                      const isSelected = selectedIds.has(p.id);

                      if (draft.tipoDivisao === "igual") {
                         return (
                            <div key={p.id} className="flex justify-between items-center text-sm py-1.5 px-2">
                               <span>{p.nome}</span>
                               <span className="font-semibold text-foreground">{formatCurrency(div?.valorDevido || 0)}</span>
                            </div>
                         );
                      }

                      if (draft.tipoDivisao === "selecionados") {
                         return (
                            <button
                               key={p.id}
                               type="button"
                               onClick={() => toggleParticipant(p.id)}
                               className={`w-full flex justify-between items-center text-sm py-2 px-3 rounded-lg border-2 transition-all ${isSelected ? "border-primary bg-primary/5 text-foreground" : "border-border/50 bg-background text-muted-foreground"}`}
                            >
                               <span className="font-medium">{p.nome}</span>
                               {isSelected && <span className="font-bold text-primary">{formatCurrency(div?.valorDevido || 0)}</span>}
                            </button>
                         );
                      }

                      if (draft.tipoDivisao === "personalizado") {
                         return (
                            <div key={p.id} className="flex justify-between items-center gap-4 py-1.5">
                               <span className="text-sm font-medium truncate w-1/2">{p.nome}</span>
                               <div className="relative w-1/2">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">R$</span>
                                  <Input
                                     type="text"
                                     inputMode="numeric"
                                     className="h-9 pl-8 text-right text-sm font-medium"
                                     value={div?.valorDevido ? toCurrencyMask(div.valorDevido) : ""}
                                     onChange={e => handleDivisionChange(p.id, "valorDevido", parseCurrencyMask(e.target.value))}
                                  />
                               </div>
                            </div>
                         );
                      }

                      if (draft.tipoDivisao === "porcentagem") {
                         return (
                            <div key={p.id} className="flex justify-between items-center gap-4 py-1.5">
                               <span className="text-sm font-medium truncate w-1/2">{p.nome}</span>
                               <div className="relative w-1/2 flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">{formatCurrency(div?.valorDevido || 0)}</span>
                                  <div className="relative flex-1">
                                     <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                                     <Input
                                        type="text"
                                        inputMode="decimal"
                                        className="h-9 pr-8 text-right text-sm font-medium"
                                        value={div?.porcentagem?.toString() || ""}
                                        onChange={e => handleDivisionChange(p.id, "porcentagem", parseFloat(e.target.value.replace(',', '.') || '0'))}
                                     />
                                  </div>
                               </div>
                            </div>
                         );
                      }

                      if (draft.tipoDivisao === "cotas") {
                         return (
                            <div key={p.id} className="flex justify-between items-center gap-4 py-1.5">
                               <span className="text-sm font-medium truncate w-1/2">{p.nome}</span>
                               <div className="relative w-1/2 flex items-center gap-3">
                                  <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">{formatCurrency(div?.valorDevido || 0)}</span>
                                  <Input
                                     type="text"
                                     inputMode="numeric"
                                     className="h-9 text-right text-sm font-medium flex-1"
                                     placeholder="0"
                                     value={div?.cotas?.toString() || ""}
                                     onChange={e => handleDivisionChange(p.id, "cotas", parseInt(e.target.value.replace(/\D/g, '') || '0', 10))}
                                  />
                               </div>
                            </div>
                         );
                      }

                      return null;
                   })}
                </div>
             </div>
          </CardContent>
       )}
    </Card>
  );
}
