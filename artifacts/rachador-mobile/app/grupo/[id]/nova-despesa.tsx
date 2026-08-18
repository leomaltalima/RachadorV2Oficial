import React, { useMemo, useState } from 'react';
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
import { useColors } from '@/hooks/useColors';
import { useSession } from '@/context/SessionContext';
import {
  useGetGrupo,
  useCreateDespesa,
  getListDespesasQueryKey,
  getGetSaldoQueryKey,
} from '@workspace/api-client-react';
import { ReceiptScanner } from '@/components/ReceiptScanner';

type SplitMode = 'equal' | 'select' | 'custom';

/** Converte dígitos brutos em formato "1.234,56" (centavos primeiro) */
function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const num = parseInt(digits, 10);
  if (num === 0) return '';
  const reais = Math.floor(num / 100);
  const centavos = num % 100;
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0';
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`;
}

/** Converte valor numérico em string mascarada */
function toCurrencyMask(value: number): string {
  const cents = Math.round(value * 100);
  if (cents === 0) return '';
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const reaisStr = reais > 0 ? reais.toLocaleString('pt-BR') : '0';
  return `${reaisStr},${centavos.toString().padStart(2, '0')}`;
}

/** Converte "1.234,56" → 1234.56 */
function parseCurrencyMask(masked: string): number {
  const digits = masked.replace(/\D/g, '');
  if (!digits) return 0;
  return parseInt(digits, 10) / 100;
}

export default function NovaDespesaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getSession } = useSession();

  const { data: grupo } = useGetGrupo(grupoId);
  const createDespesa = useCreateDespesa();

  const participantes = grupo?.participantes ?? [];
  const currentParticipanteId = getSession(grupoId);

  const [descricao, setDescricao] = useState('');
  const [valorStr, setValorStr] = useState('');
  const [pagoPorId, setPagoPorId] = useState<number | null>(currentParticipanteId);
  const [splitMode, setSplitMode] = useState<SplitMode>('equal');
  const [customShares, setCustomShares] = useState<Record<number, string>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedInitialized, setSelectedInitialized] = useState(false);

  // Initialize selectedIds (all selected) once grupo loads
  if (grupo && !selectedInitialized) {
    setSelectedIds(new Set(grupo.participantes.map((p) => p.id)));
    setSelectedInitialized(true);
  }

  const toggleParticipant = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // keep at least one
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const valorTotal = parseCurrencyMask(valorStr);

  const handleReceiptApply = (splits: Record<number, number>, total: number, desc: string) => {
    const newShares: Record<number, string> = {};
    Object.entries(splits).forEach(([id, val]) => {
      newShares[Number(id)] = toCurrencyMask(val);
    });
    setCustomShares(newShares);
    setValorStr(toCurrencyMask(total));
    if (!descricao.trim()) setDescricao(desc);
    setSplitMode('custom');
    setShowScanner(false);
  };

  const divisoesIguais = useMemo(() => {
    if (participantes.length === 0 || valorTotal <= 0) return [];
    const per = Math.floor((valorTotal / participantes.length) * 100) / 100;
    const remainder = Math.round((valorTotal - per * participantes.length) * 100) / 100;
    return participantes.map((p, i) => ({
      participanteId: p.id,
      valorDevido: i === 0 ? per + remainder : per,
    }));
  }, [participantes, valorTotal]);

  const divisoesCustom = useMemo(() => {
    return participantes.map((p) => ({
      participanteId: p.id,
      valorDevido: parseCurrencyMask(customShares[p.id] ?? ''),
    }));
  }, [participantes, customShares]);

  const selectedCount = selectedIds.size;
  const perPersonSelect = selectedCount > 0 ? valorTotal / selectedCount : 0;

  const divisoesSelect = useMemo(() => {
    const included = participantes.filter((p) => selectedIds.has(p.id));
    if (included.length === 0 || valorTotal <= 0) return participantes.map((p) => ({ participanteId: p.id, valorDevido: 0 }));
    const per = Math.floor((valorTotal / included.length) * 100) / 100;
    const remainder = Math.round((valorTotal - per * included.length) * 100) / 100;
    let lastIdx = 0;
    return participantes.map((p) => {
      if (!selectedIds.has(p.id)) return { participanteId: p.id, valorDevido: 0 };
      const isFirst = lastIdx === 0;
      lastIdx++;
      return { participanteId: p.id, valorDevido: isFirst ? per + remainder : per };
    });
  }, [participantes, selectedIds, valorTotal]);

  const customTotal = divisoesCustom.reduce((s, d) => s + d.valorDevido, 0);
  const customValid = Math.abs(customTotal - valorTotal) < 0.02;

  const canSubmit =
    descricao.trim().length > 0 &&
    valorTotal > 0 &&
    pagoPorId !== null &&
    (splitMode === 'equal' || (splitMode === 'select' && selectedCount > 0) || customValid) &&
    !createDespesa.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || pagoPorId === null) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const divisoes =
      splitMode === 'equal' ? divisoesIguais :
      splitMode === 'select' ? divisoesSelect :
      divisoesCustom;
    try {
      await createDespesa.mutateAsync({
        grupoId,
        data: {
          descricao: descricao.trim(),
          valor: valorTotal,
          pagoPorId,
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
          autoFocus
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
          returnKeyType="next"
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
        <View style={styles.splitToggle}>
          {([
            { mode: 'equal', icon: 'people-outline', label: 'Igual\npara todos' },
            { mode: 'select', icon: 'person-add-outline', label: 'Escolher\nquem divide' },
            { mode: 'custom', icon: 'calculator-outline', label: 'Valores\ndiferentes' },
          ] as { mode: SplitMode; icon: string; label: string }[]).map(({ mode, icon, label }) => (
            <Pressable
              key={mode}
              style={[
                styles.splitToggleItem,
                {
                  backgroundColor: splitMode === mode ? colors.primary : colors.card,
                  borderColor: splitMode === mode ? colors.primary : colors.border,
                  flex: 1,
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
                  { color: splitMode === mode ? colors.primaryForeground : colors.foreground, textAlign: 'center' },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Select: choose participants */}
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
                <View style={styles.splitRow}>
                  <Text style={[styles.splitNome, { color: colors.foreground }]}>
                    Cada um paga ({selectedCount})
                  </Text>
                  <Text style={[styles.splitValor, { color: colors.foreground }]}>
                    R$ {perPersonSelect.toFixed(2)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Split details */}
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

        {splitMode === 'custom' && (
          <View style={styles.customSplitList}>
            {/* Scanner button */}
            <Pressable
              style={({ pressed }) => [
                styles.scanButton,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.primary,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              onPress={() => setShowScanner(true)}
            >
              <Ionicons name="receipt-outline" size={18} color={colors.primary} />
              <Text style={[styles.scanButtonText, { color: colors.primary }]}>
                Escanear nota fiscal
              </Text>
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
  section: {
    gap: 10,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 1.2,
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
  splitToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  splitToggleItem: {
    height: 60,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  splitToggleText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
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
