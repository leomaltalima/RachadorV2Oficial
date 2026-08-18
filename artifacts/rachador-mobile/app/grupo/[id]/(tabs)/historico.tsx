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
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useSession } from '@/context/SessionContext';
import {
  useListPagamentos,
  useDeletePagamento,
  useGetGrupo,
  getListPagamentosQueryKey,
  getGetSaldoQueryKey,
} from '@workspace/api-client-react';
import type { Pagamento } from '@workspace/api-client-react';

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function PagamentoItem({
  item,
  participantes,
  onDelete,
  isReceiver,
  colors,
}: {
  item: Pagamento;
  participantes: { id: number; nome: string }[];
  onDelete: (id: number) => void;
  isReceiver: boolean;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}) {
  const deNome = participantes.find((p) => p.id === item.deId)?.nome ?? '?';
  const paraNome = participantes.find((p) => p.id === item.paraId)?.nome ?? '?';

  return (
    <View style={[styles.pagamentoItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.pagamentoIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name="checkmark-circle" size={22} color={colors.success} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[styles.pagamentoText, { color: colors.foreground }]}>
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>{deNome}</Text>
          {' pagou '}
          <Text style={{ fontFamily: 'PlusJakartaSans_700Bold' }}>{paraNome}</Text>
        </Text>
        <Text style={[styles.pagamentoDate, { color: colors.mutedForeground }]}>
          {formatDate(item.criadoEm)}
        </Text>
      </View>
      <View style={styles.pagamentoRight}>
        <Text style={[styles.pagamentoValor, { color: colors.success }]}>
          {formatCurrency(item.valor)}
        </Text>
        {isReceiver && (
          <Pressable
            onPress={() => onDelete(item.id)}
            style={({ pressed }) => [styles.undoButton, { opacity: pressed ? 0.6 : 1 }]}
            testID={`undo-payment-${item.id}`}
          >
            <Feather name="rotate-ccw" size={14} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function HistoricoScreen() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { getSession } = useSession();
  const { data: grupo } = useGetGrupo(grupoId);
  const {
    data: pagamentos,
    isLoading,
    isRefetching,
    refetch,
  } = useListPagamentos(grupoId);
  const deletePagamento = useDeletePagamento();

  const participantes = grupo?.participantes ?? [];
  const currentParticipanteId = getSession(grupoId);
  const bottomPad = Platform.OS === 'web' ? 34 + 84 + 16 : insets.bottom + 100;

  const handleUndo = (pagamentoId: number) => {
    Alert.alert('Desfazer pagamento', 'Quer desfazer este pagamento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desfazer',
        style: 'destructive',
        onPress: async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await deletePagamento.mutateAsync({ id: pagamentoId });
            queryClient.invalidateQueries({ queryKey: getListPagamentosQueryKey(grupoId) });
            queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) });
          } catch {
            Alert.alert('Erro', 'Não foi possível desfazer o pagamento.');
          }
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}
      data={pagamentos ?? []}
      keyExtractor={(item) => String(item.id)}
      scrollEnabled={!!(pagamentos?.length)}
      refreshControl={
        <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
      }
      renderItem={({ item }) => (
        <PagamentoItem
          item={item}
          participantes={participantes}
          onDelete={handleUndo}
          isReceiver={Number(item.paraId) === Number(currentParticipanteId)}
          colors={colors}
        />
      )}
      ListEmptyComponent={
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Nenhum pagamento registrado
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
            Os pagamentos confirmados aparecerão aqui
          </Text>
        </View>
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
  },
  pagamentoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  pagamentoIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagamentoText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
  },
  pagamentoDate: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
  },
  pagamentoRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  pagamentoValor: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  undoButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
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
    paddingHorizontal: 32,
  },
});
