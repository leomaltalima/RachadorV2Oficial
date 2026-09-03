import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { VoiceExpenseDraft, Participante, DespesaInput } from '@workspace/api-client-react';
import { formatCurrencyInput, toCurrencyMask, parseCurrencyMask, distributeCents } from '../utils/currency';

interface ExpenseDraftCardProps {
  draft: VoiceExpenseDraft;
  participantes: Participante[];
  currentParticipanteId: number;
  onUpdate: (payload: DespesaInput | null) => void;
  onDelete: () => void;
  index: number;
}

const CATEGORIES = [
  'Alimentação', 'Transporte', 'Hospedagem', 'Lazer',
  'Mercado', 'Compras', 'Saúde', 'Outros'
] as const;

type SplitMode = 'equal' | 'select' | 'percentage' | 'shares' | 'custom';

export function ExpenseDraftCard({
  draft,
  participantes,
  currentParticipanteId,
  onUpdate,
  onDelete,
  index
}: ExpenseDraftCardProps) {
  const colors = useColors();
  
  const [expanded, setExpanded] = useState(true);
  
  const [descricao, setDescricao] = useState(draft.descricao || '');
  const [valorStr, setValorStr] = useState(draft.valor ? toCurrencyMask(draft.valor) : '');
  const [categoria, setCategoria] = useState<string>(draft.categoria || 'Outros');
  const [pagoPorId, setPagoPorId] = useState<number | null>(draft.pagoPorId);
  
  const initialMode = draft.tipoDivisao === 'selecionados' ? 'select' :
                      draft.tipoDivisao === 'porcentagem' ? 'percentage' :
                      draft.tipoDivisao === 'cotas' ? 'shares' :
                      draft.tipoDivisao === 'personalizado' ? 'custom' : 'equal';
                      
  const [splitMode, setSplitMode] = useState<SplitMode>(initialMode);
  
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [customShares, setCustomShares] = useState<Record<number, string>>({});
  const [percentShares, setPercentShares] = useState<Record<number, string>>({});
  const [cotaShares, setCotaShares] = useState<Record<number, string>>({});

  useEffect(() => {
    // Initialize state from draft divisions
    if (draft.divisoes && draft.divisoes.length > 0) {
      if (initialMode === 'select') {
        setSelectedIds(new Set(draft.divisoes.filter(d => d.valorDevido > 0).map(d => d.participanteId)));
      } else if (initialMode === 'custom') {
        const cs: Record<number, string> = {};
        draft.divisoes.forEach(d => { cs[d.participanteId] = toCurrencyMask(d.valorDevido); });
        setCustomShares(cs);
      } else if (initialMode === 'percentage') {
        const ps: Record<number, string> = {};
        draft.divisoes.forEach(d => { ps[d.participanteId] = d.porcentagem?.toString() || '0'; });
        setPercentShares(ps);
      } else if (initialMode === 'shares') {
        const cs: Record<number, string> = {};
        draft.divisoes.forEach(d => { cs[d.participanteId] = d.cotas?.toString() || '0'; });
        setCotaShares(cs);
      } else {
        setSelectedIds(new Set(participantes.map(p => p.id)));
      }
    } else {
      setSelectedIds(new Set(participantes.map(p => p.id)));
    }
  }, [draft]);

  const toggleParticipant = (pId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(pId)) {
        if (next.size === 1) return prev;
        next.delete(pId);
      } else {
        next.add(pId);
      }
      return next;
    });
  };

  const valorTotal = parseCurrencyMask(valorStr);

  const divisoesIguais = useMemo(() => {
    if (participantes.length === 0 || valorTotal <= 0) return [];
    const ids = participantes.map(p => p.id);
    const unrounded = participantes.map(() => valorTotal / participantes.length);
    return distributeCents(valorTotal, unrounded, ids);
  }, [participantes, valorTotal]);

  const divisoesSelect = useMemo(() => {
    const included = participantes.filter((p) => selectedIds.has(p.id));
    if (included.length === 0 || valorTotal <= 0) return participantes.map((p) => ({ participanteId: p.id, valorDevido: 0 }));
    const ids = included.map(p => p.id);
    const unrounded = included.map(() => valorTotal / included.length);
    const devidosIncluded = distributeCents(valorTotal, unrounded, ids);
    const includedMap = new Map(devidosIncluded.map(d => [d.participanteId, d.valorDevido]));
    return participantes.map((p) => ({
      participanteId: p.id,
      valorDevido: includedMap.get(p.id) ?? 0
    }));
  }, [participantes, selectedIds, valorTotal]);

  const divisoesCustom = useMemo(() => {
    return participantes.map((p) => ({
      participanteId: p.id,
      valorDevido: parseCurrencyMask(customShares[p.id] ?? ''),
    }));
  }, [participantes, customShares]);
  
  const divisoesPercentage = useMemo(() => {
    if (participantes.length === 0 || valorTotal <= 0) return [];
    const ids = participantes.map(p => p.id);
    const pcts = participantes.map(p => parseFloat(percentShares[p.id]?.replace(',', '.') || '0'));
    const unrounded = pcts.map(pct => valorTotal * (pct / 100));
    const devidos = distributeCents(valorTotal, unrounded, ids);
    return devidos.map((d, i) => ({ ...d, porcentagem: pcts[i] }));
  }, [participantes, valorTotal, percentShares]);

  const divisoesShares = useMemo(() => {
    if (participantes.length === 0 || valorTotal <= 0) return [];
    const ids = participantes.map(p => p.id);
    const cotasArr = participantes.map(p => parseFloat(cotaShares[p.id]?.replace(',', '.') || '0'));
    const totalCotas = cotasArr.reduce((a, b) => a + b, 0);
    const unrounded = totalCotas > 0 ? cotasArr.map(c => valorTotal * (c / totalCotas)) : cotasArr.map(() => 0);
    const devidos = distributeCents(valorTotal, unrounded, ids);
    return devidos.map((d, i) => ({ ...d, cotas: cotasArr[i] }));
  }, [participantes, valorTotal, cotaShares]);

  const selectedCount = selectedIds.size;
  const customTotal = divisoesCustom.reduce((s, d) => s + d.valorDevido, 0);
  const customValid = Math.abs(customTotal - valorTotal) < 0.02;
  const percentTotal = Object.values(percentShares).reduce((s, v) => s + parseFloat(v.replace(',', '.') || '0'), 0);
  const percentValid = Math.abs(percentTotal - 100) < 0.01;
  const sharesValid = participantes.some(p => {
    const c = parseFloat(cotaShares[p.id]?.replace(',', '.') || '0');
    return c > 0;
  }) && !participantes.some(p => {
    const c = parseFloat(cotaShares[p.id]?.replace(',', '.') || '0');
    return c < 0;
  });

  const isValid = 
    descricao.trim().length > 0 &&
    valorTotal > 0 &&
    pagoPorId !== null &&
    (
      splitMode === 'equal' ||
      (splitMode === 'select' && selectedCount > 0) ||
      (splitMode === 'custom' && customValid) ||
      (splitMode === 'percentage' && percentValid) ||
      (splitMode === 'shares' && sharesValid)
    ) && 
    CATEGORIES.includes(categoria as any);

  useEffect(() => {
    if (!isValid || pagoPorId === null) {
      onUpdate(null);
      return;
    }

    let divisoes;
    let tipoDivisao: any = 'igual';
    if (splitMode === 'equal') { divisoes = divisoesIguais; tipoDivisao = 'igual'; }
    else if (splitMode === 'select') { divisoes = divisoesSelect; tipoDivisao = 'selecionados'; }
    else if (splitMode === 'percentage') { divisoes = divisoesPercentage; tipoDivisao = 'porcentagem'; }
    else if (splitMode === 'shares') { divisoes = divisoesShares; tipoDivisao = 'cotas'; }
    else { divisoes = divisoesCustom; tipoDivisao = 'personalizado'; }

    const activeDivisoes = splitMode === 'equal'
      ? divisoes
      : divisoes.filter((divisao) => divisao.valorDevido > 0);

    onUpdate({
      descricao: descricao.trim(),
      valor: valorTotal,
      pagoPorId,
      idempotencyKey: draft.id,
      categoria: categoria as any,
      tipoDivisao,
      divisoes: activeDivisoes
    });
  }, [descricao, valorTotal, pagoPorId, categoria, splitMode, divisoesIguais, divisoesSelect, divisoesCustom, divisoesPercentage, divisoesShares, isValid]);

  const hasUncertainties =
    draft.precisaConfirmacao.length > 0 ||
    draft.nomesNaoResolvidos.length > 0 ||
    draft.confianca.valor !== 'alta' ||
    draft.confianca.pagador !== 'alta' ||
    draft.confianca.participantes !== 'alta' ||
    draft.confianca.categoria !== 'alta';

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: isValid ? colors.border : colors.destructive }]}>
      
      <Pressable style={styles.header} onPress={() => setExpanded(!expanded)}>
        <View style={styles.headerLeft}>
          <View style={[styles.indexBadge, { backgroundColor: colors.primary }]}>
            <Text style={styles.indexText}>{index}</Text>
          </View>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>{descricao || 'Sem descrição'}</Text>
            <Text style={[styles.headerSub, { color: isValid ? colors.mutedForeground : colors.destructive }]}>
              {valorTotal > 0 ? `R$ ${valorTotal.toFixed(2)}` : 'Sem valor'}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {!isValid && <Ionicons name="warning" size={18} color={colors.destructive} />}
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={20} color={colors.mutedForeground} />
        </View>
      </Pressable>

      {expanded && (
        <View style={[styles.content, { borderTopColor: colors.border, borderTopWidth: 1 }]}>
          
          {hasUncertainties && (
            <View style={[styles.uncertaintyBox, { backgroundColor: colors.muted }]}>
              <Ionicons name="information-circle-outline" size={14} color={colors.foreground} />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.uncertaintyText, { color: colors.foreground }]}>
                  A IA não teve certeza sobre alguns detalhes. Confira os dados.
                </Text>
                {draft.precisaConfirmacao.map((message, messageIndex) => (
                  <Text key={`${message}-${messageIndex}`} style={[styles.uncertaintyDetail, { color: colors.foreground }]}>
                    {message}
                  </Text>
                ))}
                {draft.nomesNaoResolvidos.map((name, nameIndex) => (
                  <Text key={`${name}-${nameIndex}`} style={[styles.uncertaintyDetail, { color: colors.foreground }]}>
                    Participante não identificado: {name}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {/* Description & Value */}
          <View style={styles.row}>
            <View style={[styles.field, { flex: 2 }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIÇÃO</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                value={descricao}
                onChangeText={setDescricao}
                placeholder="Ex: Almoço"
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <View style={[styles.field, { flex: 1 }]}>
              <Text style={[styles.label, { color: draft.confianca.valor !== 'alta' ? colors.destructive : colors.mutedForeground }]}>VALOR</Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                value={valorStr}
                onChangeText={(v) => setValorStr(formatCurrencyInput(v))}
                placeholder="0,00"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORIA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
              {CATEGORIES.map(cat => {
                const isSelected = categoria === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => setCategoria(cat)}
                    style={[
                      styles.categoryBadge,
                      {
                        backgroundColor: isSelected ? colors.primary : colors.background,
                        borderColor: isSelected ? colors.primary : colors.border,
                      }
                    ]}
                  >
                    <Text style={[styles.categoryText, { color: isSelected ? colors.primaryForeground : colors.foreground }]}>
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* Payer */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: draft.confianca.pagador !== 'alta' ? colors.destructive : colors.mutedForeground }]}>QUEM PAGOU</Text>
            <View style={styles.payerList}>
              {participantes.map((p) => {
                const selected = pagoPorId === p.id;
                return (
                  <Pressable
                    key={p.id}
                    style={[
                      styles.payerItem,
                      {
                        backgroundColor: selected ? colors.primary : colors.background,
                        borderColor: selected ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setPagoPorId(p.id)}
                  >
                    <Text style={[styles.payerName, { color: selected ? colors.primaryForeground : colors.foreground }]}>
                      {p.nome}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Split Mode */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: draft.confianca.participantes !== 'alta' ? colors.destructive : colors.mutedForeground }]}>DIVISÃO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.splitScroll}>
              {([
                { mode: 'equal', icon: 'people-outline', label: 'Igual' },
                { mode: 'select', icon: 'person-add-outline', label: 'Escolher' },
                { mode: 'percentage', icon: 'pie-chart-outline', label: 'Porcento' },
                { mode: 'shares', icon: 'stats-chart-outline', label: 'Cotas' },
                { mode: 'custom', icon: 'calculator-outline', label: 'Valores' },
              ] as { mode: SplitMode; icon: string; label: string }[]).map(({ mode, icon, label }) => (
                <Pressable
                  key={mode}
                  style={[
                    styles.splitItem,
                    {
                      backgroundColor: splitMode === mode ? colors.primary : colors.background,
                      borderColor: splitMode === mode ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setSplitMode(mode)}
                >
                  <Ionicons name={icon as any} size={14} color={splitMode === mode ? colors.primaryForeground : colors.mutedForeground} />
                  <Text style={[styles.splitText, { color: splitMode === mode ? colors.primaryForeground : colors.foreground }]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Split specifics - compact version */}
            <View style={[styles.splitDetails, { backgroundColor: colors.background, borderColor: colors.border }]}>
              {splitMode === 'select' && (
                <View style={styles.selectList}>
                  {participantes.map(p => {
                    const isSelected = selectedIds.has(p.id);
                    return (
                      <Pressable key={p.id} onPress={() => toggleParticipant(p.id)} style={[styles.selectParticipant, { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary + '1A' : 'transparent' }]}>
                        <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.foreground }}>{p.nome}</Text>
                        {isSelected && <Ionicons name="checkmark" size={14} color={colors.primary} />}
                      </Pressable>
                    )
                  })}
                </View>
              )}

              {splitMode === 'percentage' && (
                <View style={{ gap: 8 }}>
                  {participantes.map(p => (
                    <View key={p.id} style={styles.splitInputRow}>
                      <Text style={{ flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.foreground }}>{p.nome}</Text>
                      <TextInput
                        style={[styles.smallInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                        value={percentShares[p.id]} onChangeText={v => setPercentShares(prev => ({ ...prev, [p.id]: v }))}
                        keyboardType="numeric" placeholder="0"
                      />
                      <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.mutedForeground, width: 16 }}>%</Text>
                    </View>
                  ))}
                  {!percentValid && <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' }}>Total: {percentTotal}% (deve ser 100%)</Text>}
                </View>
              )}

              {splitMode === 'shares' && (
                <View style={{ gap: 8 }}>
                  {participantes.map(p => (
                    <View key={p.id} style={styles.splitInputRow}>
                      <Text style={{ flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.foreground }}>{p.nome}</Text>
                      <TextInput
                        style={[styles.smallInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground }]}
                        value={cotaShares[p.id]} onChangeText={v => setCotaShares(prev => ({ ...prev, [p.id]: v }))}
                        keyboardType="numeric" placeholder="0"
                      />
                    </View>
                  ))}
                  {!sharesValid && <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' }}>Cotas devem ser maiores que zero</Text>}
                </View>
              )}

              {splitMode === 'custom' && (
                <View style={{ gap: 8 }}>
                  {participantes.map(p => (
                    <View key={p.id} style={styles.splitInputRow}>
                      <Text style={{ flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.foreground }}>{p.nome}</Text>
                      <Text style={{ fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, color: colors.mutedForeground, marginRight: 4 }}>R$</Text>
                      <TextInput
                        style={[styles.smallInput, { backgroundColor: colors.input, borderColor: colors.border, color: colors.foreground, width: 80 }]}
                        value={customShares[p.id]} onChangeText={v => setCustomShares(prev => ({ ...prev, [p.id]: formatCurrencyInput(v) }))}
                        keyboardType="number-pad" placeholder="0,00"
                      />
                    </View>
                  ))}
                  {!customValid && valorTotal > 0 && <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: 'PlusJakartaSans_500Medium' }}>Total distribuído difere do valor da despesa</Text>}
                </View>
              )}

              {splitMode === 'equal' && (
                <Text style={{ fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, color: colors.mutedForeground }}>
                  Dividido igualmente entre todos os {participantes.length} participantes.
                </Text>
              )}
            </View>

          </View>

          <View style={styles.actions}>
            <Pressable onPress={onDelete} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.destructive} />
              <Text style={[styles.deleteText, { color: colors.destructive }]}>Excluir despesa</Text>
            </Pressable>
          </View>

        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  indexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
    color: '#fff',
  },
  headerTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  headerSub: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  uncertaintyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
  },
  uncertaintyText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
    flex: 1,
  },
  uncertaintyDetail: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    lineHeight: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  field: {
    gap: 6,
  },
  label: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    letterSpacing: 0.5,
  },
  input: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  categoryScroll: { gap: 8, paddingBottom: 4 },
  categoryBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  categoryText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  
  payerList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  payerItem: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  payerName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  
  splitScroll: { gap: 6, paddingBottom: 4 },
  splitItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1.5 },
  splitText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  
  splitDetails: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  selectList: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  selectParticipant: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  
  splitInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallInput: { height: 36, width: 60, borderRadius: 6, borderWidth: 1, textAlign: 'center', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#0000001A', // Will be invisible mostly, but that's fine
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 8,
  },
  deleteText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
});
