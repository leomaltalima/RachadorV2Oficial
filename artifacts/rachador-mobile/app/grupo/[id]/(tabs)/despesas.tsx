import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useColors } from '@/hooks/useColors';
import { useSession } from '@/context/SessionContext';
import {
  useListDespesas,
  useDeleteDespesa,
  useGetGrupo,
  getListDespesasQueryKey,
  getGetSaldoQueryKey,
} from '@workspace/api-client-react';
import type { DespesaComDivisoes } from '@workspace/api-client-react';

const CATEGORIES = [
  'Todos',
  'Alimentação', 'Transporte', 'Hospedagem', 'Lazer',
  'Mercado', 'Compras', 'Saúde', 'Outros'
] as const;

function formatCurrency(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function ExpenseItem({
  item,
  participantes,
  onDelete,
  isLeader,
  colors,
}: {
  item: DespesaComDivisoes;
  participantes: { id: number; nome: string }[];
  onDelete: (id: number) => void;
  isLeader: boolean;
  colors: ReturnType<typeof import('@/hooks/useColors').useColors>;
}) {
  const pagador = participantes.find((p) => p.id === item.pagoPorId);

  return (
    <View style={[styles.expenseItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.expenseIcon, { backgroundColor: colors.accent }]}>
        <Ionicons name="receipt-outline" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={[styles.expenseDesc, { color: colors.foreground }]} numberOfLines={1}>
            {item.descricao}
          </Text>
        </View>
        <Text style={[styles.expenseMeta, { color: colors.mutedForeground }]}>
          {item.categoria} · Pago por {pagador?.nome ?? '?'} · {formatDate(item.criadoEm.toString())}
        </Text>
      </View>
      <View style={styles.expenseRight}>
        <Text style={[styles.expenseAmount, { color: colors.foreground }]}>
          {formatCurrency(item.valor)}
        </Text>
        {isLeader && (
          <Pressable
            onPress={() => onDelete(item.id)}
            style={({ pressed }) => [styles.deleteButton, { opacity: pressed ? 0.6 : 1 }]}
            testID={`delete-expense-${item.id}`}
          >
            <Feather name="trash-2" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function DespesasScreen() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { getSession } = useSession();

  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  const { data: grupo } = useGetGrupo(grupoId);
  const {
    data: despesas,
    isLoading,
    isRefetching,
    refetch,
  } = useListDespesas(grupoId);
  const deleteDespesa = useDeleteDespesa();

  const { userId } = useAuth();
  const currentParticipanteId = getSession(grupoId);
  const participantes = grupo?.participantes ?? [];
  const grupoExtended = grupo as typeof grupo & { criadorClerkUserId?: string | null };
  const isLeader = !!userId && !!grupoExtended?.criadorClerkUserId && userId === grupoExtended.criadorClerkUserId;

  const filteredDespesas = despesas?.filter(d => 
    selectedCategory === 'Todos' || d.categoria === selectedCategory
  ) ?? [];

  const totalGasto = filteredDespesas.reduce((sum, d) => sum + d.valor, 0);

  const handleDelete = useCallback(
    (expenseId: number) => {
      Alert.alert('Remover despesa', 'Tem certeza que quer remover esta despesa?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            try {
              await deleteDespesa.mutateAsync({ id: expenseId });
              queryClient.invalidateQueries({ queryKey: getListDespesasQueryKey(grupoId) });
              queryClient.invalidateQueries({ queryKey: getGetSaldoQueryKey(grupoId) });
            } catch {
              Alert.alert('Erro', 'Não foi possível remover a despesa.');
            }
          },
        },
      ]);
    },
    [grupoId, deleteDespesa, queryClient],
  );

  const bottomPad = Platform.OS === 'web' ? 34 + 84 : insets.bottom + 90;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Category filter */}
      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          contentContainerStyle={styles.categoryScroll}
        >
          {CATEGORIES.map(cat => {
            const isSelected = selectedCategory === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
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

      {/* Summary bar */}
      {filteredDespesas.length > 0 && (
        <View style={[styles.summaryBar, { backgroundColor: colors.accent, borderBottomColor: colors.border }]}>
          <Text style={[styles.summaryLabel, { color: colors.mutedForeground }]}>
            {selectedCategory === 'Todos' ? 'Total gasto' : `Total em ${selectedCategory}`}
          </Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>
            {formatCurrency(totalGasto)}
          </Text>
        </View>
      )}

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredDespesas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad }]}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          scrollEnabled={filteredDespesas.length > 0}
          renderItem={({ item }) => (
            <ExpenseItem
              item={item}
              participantes={participantes}
              onDelete={handleDelete}
              isLeader={isLeader}
              colors={colors}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
                Nenhuma despesa encontrada
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground }]}>
                {selectedCategory === 'Todos' 
                  ? 'Adicione a primeira despesa do grupo'
                  : `Nenhuma despesa na categoria ${selectedCategory}`
                }
              </Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      {currentParticipanteId !== null && (
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              bottom: Platform.OS === 'web' ? 34 + 84 + 16 : insets.bottom + 90,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/grupo/${grupoId}/nova-despesa`);
          }}
          testID="add-expense-fab"
        >
          <Ionicons name="add" size={28} color={colors.primaryForeground} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryScroll: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  categoryBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  categoryText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  summaryLabel: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
  },
  summaryValue: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  list: {
    padding: 16,
    gap: 10,
  },
  expenseItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  expenseIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseDesc: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
    flex: 1,
  },
  expenseMeta: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  expenseAmount: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  deleteButton: {
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
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
