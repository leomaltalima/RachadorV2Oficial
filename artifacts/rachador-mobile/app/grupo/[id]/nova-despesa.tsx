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

type SplitMode = 'equal' | 'custom';

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

  const valorTotal = parseFloat(valorStr.replace(',', '.')) || 0;

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
      valorDevido: parseFloat((customShares[p.id] ?? '0').replace(',', '.')) || 0,
    }));
  }, [participantes, customShares]);

  const customTotal = divisoesCustom.reduce((s, d) => s + d.valorDevido, 0);
  const customValid = Math.abs(customTotal - valorTotal) < 0.02;

  const canSubmit =
    descricao.trim().length > 0 &&
    valorTotal > 0 &&
    pagoPorId !== null &&
    (splitMode === 'equal' || customValid) &&
    !createDespesa.isPending;

  const handleSubmit = async () => {
    if (!canSubmit || pagoPorId === null) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const divisoes = splitMode === 'equal' ? divisoesIguais : divisoesCustom;
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
          onChangeText={setValorStr}
          placeholder="0,00"
          placeholderTextColor={colors.mutedForeground}
          keyboardType="decimal-pad"
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
          {(['equal', 'custom'] as SplitMode[]).map((mode) => (
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
              <Text
                style={[
                  styles.splitToggleText,
                  { color: splitMode === mode ? colors.primaryForeground : colors.foreground },
                ]}
              >
                {mode === 'equal' ? 'Igualitária' : 'Personalizada'}
              </Text>
            </Pressable>
          ))}
        </View>

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
                    setCustomShares((prev) => ({ ...prev, [p.id]: v }))
                  }
                  placeholder="0,00"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                />
              </View>
            ))}
            {!customValid && valorTotal > 0 && (
              <View style={styles.customError}>
                <Ionicons name="warning-outline" size={14} color={colors.destructive} />
                <Text style={[styles.customErrorText, { color: colors.destructive }]}>
                  Total: R$ {customTotal.toFixed(2)} (faltam R${' '}
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
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitToggleText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
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
