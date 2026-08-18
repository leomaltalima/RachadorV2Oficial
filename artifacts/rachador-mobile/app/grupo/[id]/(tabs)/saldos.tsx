import React from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useGlobalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useSession } from '@/context/SessionContext';
import {
  useGetSaldo,
  useGetGrupo,
  useCreatePagamento,
  getGetSaldoQueryKey,
  getListPagamentosQueryKey,
} from '@workspace/api-client-react';
import type { DebitoItem } from '@workspace/api-client-react';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SaldosScreen() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getSession } = useSession();

  const { data: grupo } = useGetGrupo(grupoId);
  const { data: saldo, isLoading, isRefetching, refetch } = useGetSaldo(grupoId);
  const createPagamento = useCreatePagamento();

  const participantes = grupo?.participantes ?? [];
  const currentParticipanteId = getSession(grupoId);

  const getNome = (id: number) => participantes.find((p) => p.id === id)?.nome ?? '?';

  const handlePagar = (debito: DebitoItem) => {
    const deNome = getNome(debito.deId);
    const paraNome = getNome(debito.paraId);

    Alert.alert(
      'Confirmar pagamento',
      `${deNome} pagou ${formatCurrency(debito.valor)} para ${paraNome}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            try {
              await createPagamento.mutateAsync({
                grupoId,
                data: {
                  deId: debito.deId,
                  paraId: debito.paraId,
                  valor: debito.valor,
                  comprovante: null,
                },
              });
              queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) });
              queryClient.invalidateQueries({ queryKey: getListPagamentosQueryKey(grupoId) });
            } catch {
              Alert.alert('Erro', 'Não foi possível registrar o pagamento.');
            }
          },
        },
      ],
    );
  };

  const bottomPad = Platform.OS === 'web' ? 34 + 84 + 16 : insets.bottom + 100;

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const debitos = saldo?.debitos ?? [];
  const participantesSaldo = saldo?.participantes ?? [];
  const totalGasto = saldo?.totalGasto ?? 0;

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
      }
      scrollEnabled={!!(debitos.length || participantesSaldo.length)}
      data={debitos}
      keyExtractor={(item) => `${item.deId}-${item.paraId}`}
      ListHeaderComponent={
        <View style={styles.headerSection}>
          {/* Total spent */}
          <View style={[styles.totalCard, { backgroundColor: colors.primary }]}>
            <Text style={[styles.totalLabel, { color: colors.primaryForeground, opacity: 0.75 }]}>
              Total gasto no grupo
            </Text>
            <Text style={[styles.totalValue, { color: colors.primaryForeground }]}>
              {formatCurrency(totalGasto)}
            </Text>
          </View>

          {debitos.length > 0 && (
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quem deve a quem</Text>
          )}
        </View>
      }
      renderItem={({ item: debito }) => {
        const isMyDebt = debito.deId === currentParticipanteId;
        return (
          <View style={[
            styles.debitoItem,
            {
              backgroundColor: colors.card,
              borderColor: isMyDebt ? colors.destructive : colors.border,
              borderWidth: isMyDebt ? 1.5 : 1,
            },
          ]}>
            <View style={{ flex: 1 }}>
              <View style={styles.debitoRow}>
                <Text style={[styles.debitoNome, { color: isMyDebt ? colors.destructive : colors.foreground }]}>
                  {getNome(debito.deId)}
                  {isMyDebt ? ' (você)' : ''}
                </Text>
                <Ionicons name="arrow-forward" size={16} color={colors.mutedForeground} />
                <Text style={[styles.debitoNome, { color: colors.foreground }]}>
                  {getNome(debito.paraId)}
                </Text>
              </View>
              <Text style={[styles.debitoValor, { color: colors.destructive }]}>
                {formatCurrency(debito.valor)}
              </Text>
            </View>
            {isMyDebt ? (
              <Pressable
                style={({ pressed }) => [
                  styles.pagar,
                  { backgroundColor: colors.success, opacity: pressed ? 0.8 : 1 },
                ]}
                onPress={() => handlePagar(debito)}
              >
                <Text style={[styles.pagarText, { color: colors.successForeground }]}>Pagar</Text>
              </Pressable>
            ) : null}
          </View>
        );
      }}
      ListEmptyComponent={
        debitos.length === 0 && participantesSaldo.length > 0 ? (
          <View style={styles.settledState}>
            <Ionicons name="checkmark-circle" size={48} color={colors.success} />
            <Text style={[styles.settledTitle, { color: colors.foreground }]}>Tudo quitado!</Text>
            <Text style={[styles.settledSubtitle, { color: colors.mutedForeground }]}>
              Não há dívidas pendentes no grupo
            </Text>
          </View>
        ) : debitos.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="stats-chart-outline" size={48} color={colors.border} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Sem despesas</Text>
            <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
              Adicione despesas para ver os saldos
            </Text>
          </View>
        ) : null
      }
      ListFooterComponent={
        participantesSaldo.length > 0 ? (
          <View style={[styles.footerSection, { marginTop: debitos.length > 0 ? 16 : 0 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Saldo por pessoa</Text>
            {participantesSaldo.map((ps) => {
              const isPositive = ps.saldoLiquido >= 0;
              const isCurrentUser = ps.participanteId === currentParticipanteId;
              return (
                <View
                  key={ps.participanteId}
                  style={[
                    styles.balanceItem,
                    {
                      backgroundColor: colors.card,
                      borderColor: isCurrentUser ? colors.primary : colors.border,
                      borderWidth: isCurrentUser ? 2 : 1,
                    },
                  ]}
                >
                  <View style={[styles.balanceAvatar, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.balanceAvatarText, { color: colors.foreground }]}>
                      {ps.nome.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.balanceName, { color: colors.foreground }]}>
                    {ps.nome}
                    {isCurrentUser ? ' (você)' : ''}
                  </Text>
                  <Text
                    style={[
                      styles.balanceValue,
                      { color: isPositive ? colors.success : colors.destructive },
                    ]}
                  >
                    {isPositive ? '+' : ''}
                    {formatCurrency(ps.saldoLiquido)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 16,
    gap: 8,
  },
  headerSection: {
    gap: 10,
    marginBottom: 8,
  },
  footerSection: {
    gap: 10,
    marginBottom: 8,
  },
  totalCard: {
    borderRadius: 14,
    padding: 18,
    marginBottom: 8,
    gap: 4,
  },
  totalLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
  },
  totalValue: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    marginTop: 8,
  },
  balanceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    padding: 12,
  },
  balanceAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceAvatarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  balanceName: {
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  balanceValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  debitoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  debitoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  debitoNome: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  debitoValor: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  pagar: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  pagarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
  },
  settledState: {
    alignItems: 'center',
    paddingTop: 40,
    gap: 12,
  },
  settledTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
  },
  settledSubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 17,
  },
  emptySubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
});
