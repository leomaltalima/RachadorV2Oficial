import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSession } from '@/context/SessionContext';
import {
  useGetGrupo,
  useCreateDespesa,
  useParseVoiceExpenses,
  useGetBillingMe,
  getListDespesasQueryKey,
  getGetSaldoQueryKey,
} from '@workspace/api-client-react';
import type { VoiceExpenseParseResponse, DespesaInput } from '@workspace/api-client-react';
import { ReceiptScanner } from '@/components/ReceiptScanner';
import { VoiceRecorder } from '@/components/VoiceRecorder';
import { VoiceExpenseReview } from '@/components/VoiceExpenseReview';
import { formatCurrencyInput, toCurrencyMask, parseCurrencyMask, distributeCents } from '@/utils/currency';

type SplitMode = 'equal' | 'select' | 'percentage' | 'shares' | 'custom';

const CATEGORIES = [
  'Alimentação', 'Transporte', 'Hospedagem', 'Lazer',
  'Mercado', 'Compras', 'Saúde', 'Outros'
] as const;

type Category = typeof CATEGORIES[number];

export default function NovaDespesaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getSession } = useSession();

  const { data: grupo } = useGetGrupo(grupoId);
  const createDespesa = useCreateDespesa();
  const { data: billing } = useGetBillingMe();

  const participantes = grupo?.participantes ?? [];
  const currentParticipanteId = getSession(grupoId);
  const isPaid = billing?.plan === 'PRO' || billing?.plan === 'MASTER';
  const isMaster = billing?.plan === 'MASTER';

  const [categoria, setCategoria] = useState<Category>('Outros');
  const [descricao, setDescricao] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [pagoPorId, setPagoPorId] = useState<number | null>(currentParticipanteId);
  
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customShares, setCustomShares] = useState<Record<number, string>>({});
  const [percentShares, setPercentShares] = useState<Record<number, string>>({});
  const [cotaShares, setCotaShares] = useState<Record<number, string>>({});
  
  const [showScanner, setShowScanner] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedInitialized, setSelectedInitialized] = useState(false);

  // Voice recording state
  const [viewMode, setViewMode] = useState<'manual' | 'voice_recording' | 'voice_review'>('manual');
  const [voiceData, setVoiceData] = useState<VoiceExpenseParseResponse | null>(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isConfirmingVoice, setIsConfirmingVoice] = useState(false);
  const parseVoice = useParseVoiceExpenses();

  const handleProcessVoice = async (base64: string, mimeType: string) => {
    setIsProcessingVoice(true);
    try {
      const res = await parseVoice.mutateAsync({ grupoId, data: { audioBase64: base64, mimeType } });
      setVoiceData(res);
      setViewMode('voice_review');
    } catch(e: any) {
      Alert.alert('Erro', 'Não foi possível interpretar o áudio.');
      setViewMode('manual');
    } finally {
      setIsProcessingVoice(false);
    }
  };

  const handleConfirmVoiceExpenses = async (expenses: DespesaInput[]) => {
    setIsConfirmingVoice(true);
    let successCount = 0;
    try {
      for (const exp of expenses) {
        await createDespesa.mutateAsync({ grupoId, data: exp });
        successCount++;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupoId) });
      queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) });
      router.back();
    } catch (e) {
      Alert.alert('Erro parcial', `Foram adicionadas ${successCount} despesa(s) de ${expenses.length}. A tentativa falhou antes de terminar.`);
    } finally {
      setIsConfirmingVoice(false);
    }
    return successCount;
  };

  useEffect(() => {
    AsyncStorage.getItem('@rachador_lastCategory').then(val => {
      if (val && CATEGORIES.includes(val as Category)) {
        setCategoria(val as Category);
      }
    }).catch(() => {});
  }, []);

  const handleSetCategoria = (cat: Category) => {
    setCategoria(cat);
    AsyncStorage.setItem('@rachador_lastCategory', cat).catch(() => {});
  };

  if (grupo && !selectedInitialized) {
    setSelectedIds(new Set(grupo.participantes.map((p) => p.id)));
    setSelectedInitialized(true);
  }

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

  const handleReceiptApply = (splits: Record<number, number>, total: number, desc: string) => {
    const newShares: Record<number, string> = {};
    Object.entries(splits).forEach(([pId, val]) => {
      newShares[Number(pId)] = toCurrencyMask(val);
    });
    setCustomShares(newShares);
    setValorStr(toCurrencyMask(total));
    if (!descricao.trim()) setDescricao(desc);
    setSplitMode('custom');
    setShowScanner(false);
  };

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
    return devidos.map((d, i) => ({
      ...d,
      porcentagem: pcts[i]
    }));
  }, [participantes, valorTotal, percentShares]);

  const divisoesShares = useMemo(() => {
    if (participantes.length === 0 || valorTotal <= 0) return [];
    const ids = participantes.map(p => p.id);
    const cotasArr = participantes.map(p => parseFloat(cotaShares[p.id]?.replace(',', '.') || '0'));
    const totalCotas = cotasArr.reduce((a, b) => a + b, 0);
    const unrounded = totalCotas > 0 ? cotasArr.map(c => valorTotal * (c / totalCotas)) : cotasArr.map(() => 0);
    const devidos = distributeCents(valorTotal, unrounded, ids);
    return devidos.map((d, i) => ({
      ...d,
      cotas: cotasArr[i]
    }));
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

  const canSubmit =
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
    !createDespesa.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || pagoPorId === null) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    let divisoes;
    let tipoDivisao: 'igual' | 'selecionados' | 'personalizado' | 'porcentagem' | 'cotas' = 'igual';
    
    if (splitMode === 'equal') {
      divisoes = divisoesIguais;
      tipoDivisao = 'igual';
    } else if (splitMode === 'select') {
      divisoes = divisoesSelect;
      tipoDivisao = 'selecionados';
    } else if (splitMode === 'percentage') {
      divisoes = divisoesPercentage;
      tipoDivisao = 'porcentagem';
    } else if (splitMode === 'shares') {
      divisoes = divisoesShares;
      tipoDivisao = 'cotas';
    } else {
      divisoes = divisoesCustom;
      tipoDivisao = 'personalizado';
    }
    
    try {
      await createDespesa.mutateAsync({
        grupoId,
        data: {
          descricao: descricao.trim(),
          valor: valorTotal,
          pagoPorId,
          categoria: categoria as any,
          tipoDivisao: tipoDivisao as any,
          divisoes,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupoId) });
      queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert('Erro', 'Não foi possível adicionar a despesa. Tente novamente.');
    }
  };

  if (viewMode === 'voice_recording') {
    return (
      <VoiceRecorder
        onProcess={handleProcessVoice}
        onCancel={() => setViewMode('manual')}
        isProcessing={isProcessingVoice}
      />
    );
  }

  if (viewMode === 'voice_review' && voiceData) {
    return (
      <VoiceExpenseReview
        parsedData={voiceData}
        participantes={participantes}
        currentParticipanteId={currentParticipanteId ?? 0}
        onConfirm={handleConfirmVoiceExpenses}
        onCancel={() => setViewMode('manual')}
        isSubmitting={isConfirmingVoice}
      />
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {showScanner && (
        <ReceiptScanner
          participantes={participantes}
          onApply={handleReceiptApply}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Voice Entry Button */}
      <Pressable
        style={({ pressed }) => [
          styles.voiceButton,
          {
            backgroundColor: colors.primary + '1A',
            borderColor: colors.primary,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
        onPress={() => {
          if (!isMaster) {
            router.push('/planos');
            return;
          }
          setViewMode('voice_recording');
        }}
      >
        <Ionicons name="mic-outline" size={20} color={colors.primary} />
        <Text style={[styles.voiceButtonText, { color: colors.primary }]}>Adicionar por voz</Text>
        {!isMaster && (
          <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.proBadgeText, { color: colors.primaryForeground }]}>PRO</Text>
          </View>
        )}
      </Pressable>
      
      {/* Category */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>CATEGORIA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
          {CATEGORIES.map(cat => {
            const isSelected = categoria === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => handleSetCategoria(cat)}
                style={[
                  styles.categoryBadge,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.card,
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

      {/* Description */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>DESCRIÇÃO</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.input,
              borderColor: descricao ? colors.primary : colors.border,
              color: colors.foreground,
            },
          ]}
          value={descricao}
          onChangeText={setDescricao}
          placeholder="Ex: Almoço no restaurante"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="next"
        />
      </View>

      {/* Amount */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>VALOR TOTAL (R$)</Text>
        <TextInput
          style={[
            styles.input,
            styles.amountInput,
            {
              backgroundColor: colors.input,
              borderColor: valorTotal > 0 ? colors.primary : colors.border,
              color: colors.foreground,
            },
          ]}
          value={valorStr}
          onChangeText={(v) => setValorStr(formatCurrencyInput(v))}
          placeholder="0,00"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="number-pad"
          returnKeyType="done"
        />
      </View>

      {/* Payer */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>QUEM PAGOU</Text>
        <View style={styles.payerList}>
          {participantes.map((p) => {
            const selected = pagoPorId === p.id;
            return (
              <Pressable
                key={p.id}
                style={({ pressed }) => [
                  styles.payerItem,
                  {
                    backgroundColor: selected ? colors.primary : colors.card,
                    borderColor: selected ? colors.primary : colors.border,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
                onPress={() => setPagoPorId(p.id)}
              >
                <Text
                  style={[
                    styles.payerName,
                    { color: selected ? colors.primaryForeground : colors.foreground },
                  ]}
                >
                  {p.nome}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Split mode */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>DIVISÃO</Text>
        
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.splitToggleScroll}>
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
                styles.splitToggleItem,
                {
                  backgroundColor: splitMode === mode ? colors.primary : colors.card,
                  borderColor: splitMode === mode ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setSplitMode(mode)}
            >
              <Ionicons
                name={icon as any}
                size={16}
                color={splitMode === mode ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.splitToggleText,
                  { color: splitMode === mode ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Select */}
        {splitMode === 'select' && (
          <View style={styles.selectContainer}>
            <Text style={[styles.selectHint, { color: colors.mutedForeground }]}>
              Selecione quem participa dessa divisão
            </Text>
            {participantes.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <Pressable
                  key={p.id}
                  style={({ pressed }) => [
                    styles.selectItem,
                    {
                      backgroundColor: isSelected ? colors.primary + '0D' : colors.card,
                      borderColor: isSelected ? colors.primary : colors.border,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  onPress={() => toggleParticipant(p.id)}
                >
                  <Text style={[styles.selectItemName, { color: isSelected ? colors.foreground : colors.mutedForeground }]}>
                    {p.nome}
                  </Text>
                  <View style={[
                    styles.selectCheckbox,
                    { borderColor: isSelected ? colors.primary : colors.border, backgroundColor: isSelected ? colors.primary : 'transparent' },
                  ]}>
                    {isSelected && <Ionicons name="checkmark" size={13} color={colors.primaryForeground} />}
                  </View>
                </Pressable>
              );
            })}
            {valorTotal > 0 && selectedCount > 0 && (
              <View style={[styles.splitPreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
                {divisoesSelect.filter(d => d.valorDevido > 0).map((d) => {
                  const nome = participantes.find((p) => p.id === d.participanteId)?.nome ?? '?';
                  return (
                    <View key={d.participanteId} style={styles.splitRow}>
                      <Text style={[styles.splitNome, { color: colors.foreground }]}>{nome}</Text>
                      <Text style={[styles.splitValor, { color: colors.mutedForeground }]}>
                        R$ {d.valorDevido.toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* Equal */}
        {splitMode === 'equal' && valorTotal > 0 && participantes.length > 0 && (
          <View style={[styles.splitPreview, { backgroundColor: colors.muted, borderColor: colors.border }]}>
            {divisoesIguais.map((d) => {
              const nome = participantes.find((p) => p.id === d.participanteId)?.nome ?? '?';
              return (
                <View key={d.participanteId} style={styles.splitRow}>
                  <Text style={[styles.splitNome, { color: colors.foreground }]}>{nome}</Text>
                  <Text style={[styles.splitValor, { color: colors.mutedForeground }]}>
                    R$ {d.valorDevido.toFixed(2)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
        
        {/* Percentage */}
        {splitMode === 'percentage' && (
          <View style={styles.customSplitList}>
            {participantes.map((p) => {
              const val = divisoesPercentage.find(d => d.participanteId === p.id)?.valorDevido ?? 0;
              return (
                <View key={p.id} style={styles.customSplitRow}>
                  <Text style={[styles.customSplitNome, { color: colors.foreground, flex: 1 }]}>
                    {p.nome}
                  </Text>
                  <Text style={[styles.percentValue, { color: colors.mutedForeground }]}>
                    R$ {val.toFixed(2)}
                  </Text>
                  <View style={styles.inputWithAddon}>
                    <TextInput
                      style={[
                        styles.customSplitInput,
                        {
                          backgroundColor: colors.input,
                          borderColor: colors.border,
                          color: colors.foreground,
                          paddingRight: 24,
                        },
                      ]}
                      value={percentShares[p.id] ?? ''}
                      onChangeText={(v) => {
                        const clean = v.replace(/[^0-9,.]/g, '');
                        setPercentShares((prev) => ({ ...prev, [p.id]: clean }));
                      }}
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="numeric"
                    />
                    <Text style={[styles.inputAddon, { color: colors.mutedForeground }]}>%</Text>
                  </View>
                </View>
              );
            })}
            {!percentValid && (
              <View style={styles.customError}>
                <Ionicons name="warning-outline" size={14} color={colors.destructive} />
                <Text style={[styles.customErrorText, { color: colors.destructive }]}>
                  Total: {percentTotal.toFixed(1)}% (precisa ser 100%)
                </Text>
              </View>
            )}
          </View>
        )}
        
        {/* Shares (Cotas) */}
        {splitMode === 'shares' && (
          <View style={styles.customSplitList}>
            <Text style={[styles.selectHint, { color: colors.mutedForeground }]}>
              Ex: 1 para adulto, 0.5 para criança
            </Text>
            {participantes.map((p) => {
              const val = divisoesShares.find(d => d.participanteId === p.id)?.valorDevido ?? 0;
              return (
                <View key={p.id} style={styles.customSplitRow}>
                  <Text style={[styles.customSplitNome, { color: colors.foreground, flex: 1 }]}>
                    {p.nome}
                  </Text>
                  <Text style={[styles.percentValue, { color: colors.mutedForeground }]}>
                    R$ {val.toFixed(2)}
                  </Text>
                  <TextInput
                    style={[
                      styles.customSplitInput,
                      {
                        backgroundColor: colors.input,
                        borderColor: colors.border,
                        color: colors.foreground,
                      },
                    ]}
                    value={cotaShares[p.id] ?? ''}
                    onChangeText={(v) => {
                      const clean = v.replace(/[^0-9,.]/g, '');
                      setCotaShares((prev) => ({ ...prev, [p.id]: clean }));
                    }}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                  />
                </View>
              );
            })}
            {!sharesValid && (
              <View style={styles.customError}>
                <Ionicons name="warning-outline" size={14} color={colors.destructive} />
                <Text style={[styles.customErrorText, { color: colors.destructive }]}>
                  Todas as cotas devem ser positivas.
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Custom */}
        {splitMode === 'custom' && (
          <View style={styles.customSplitList}>
            <Pressable
              style={({ pressed }) => [
                styles.scanButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.primary,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              onPress={() => {
                if (!isPaid) {
                  router.push('/planos');
                  return;
                }
                setShowScanner(true);
              }}
            >
              <Ionicons name="receipt-outline" size={18} color={colors.primary} />
              <Text style={[styles.scanButtonText, { color: colors.primary }]}>
                Escanear nota fiscal
              </Text>
              {!isPaid && (
                <View style={[styles.proBadge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.proBadgeText, { color: colors.primaryForeground }]}>PRO</Text>
                </View>
              )}
            </Pressable>

            {participantes.map((p) => (
              <View key={p.id} style={styles.customSplitRow}>
                <Text style={[styles.customSplitNome, { color: colors.foreground, flex: 1 }]}>
                  {p.nome}
                </Text>
                <TextInput
                  style={[
                    styles.customSplitInput,
                    {
                      backgroundColor: colors.input,
                      borderColor: colors.border,
                      color: colors.foreground,
                    },
                  ]}
                  value={customShares[p.id] ?? ''}
                  onChangeText={(v) =>
                    setCustomShares((prev) => ({ ...prev, [p.id]: formatCurrencyInput(v) }))
                  }
                  placeholder="0,00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                />
              </View>
            ))}
            {!customValid && valorTotal > 0 && (
              <View style={styles.customError}>
                <Ionicons name="warning-outline" size={14} color={colors.destructive} />
                <Text style={[styles.customErrorText, { color: colors.destructive }]}>
                  Total: R$ {customTotal.toFixed(2)} ({customTotal > valorTotal ? 'passou' : 'faltam'} R${' '}
                  {Math.abs(valorTotal - customTotal).toFixed(2)})
                </Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* Submit */}
      <Pressable
        style={({ pressed }) => [
          styles.submitButton,
          {
            backgroundColor: colors.primary,
            opacity: !canSubmit ? 0.45 : pressed ? 0.85 : 1,
          },
        ]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        testID="submit-expense"
      >
        {createDespesa.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
            Adicionar despesa
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    gap: 24,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  voiceButtonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  proBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 6,
  },
  proBadgeText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 9,
    letterSpacing: 0.5,
  },
  section: {
    gap: 10,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
  },
  categoryScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  categoryBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  categoryText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  amountInput: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
  },
  payerList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  payerItem: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  payerName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  splitToggleScroll: {
    gap: 8,
    paddingBottom: 4,
  },
  splitToggleItem: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
  },
  splitToggleText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  selectContainer: {
    gap: 8,
  },
  selectHint: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    paddingHorizontal: 2,
  },
  selectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  selectItemName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  selectCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitPreview: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  splitNome: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  splitValor: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  customSplitList: {
    gap: 8,
  },
  scanButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
  },
  scanButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  customSplitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customSplitNome: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  customSplitInput: {
    height: 40,
    width: 100,
    borderRadius: 8,
    borderWidth: 1.5,
    paddingHorizontal: 10,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
    textAlign: 'right',
  },
  inputWithAddon: {
    position: 'relative',
    justifyContent: 'center',
  },
  inputAddon: {
    position: 'absolute',
    right: 10,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  percentValue: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    marginRight: 4,
  },
  customError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  customErrorText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  submitButton: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
});
