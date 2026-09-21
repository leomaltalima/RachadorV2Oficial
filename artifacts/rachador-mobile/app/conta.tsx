import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useClerk, useUser } from '@clerk/expo';
import { useGetBillingMe, getGetBillingMeQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { data: billing, isLoading } = useGetBillingMe({
    query: { enabled: !!isSignedIn, queryKey: getGetBillingMeQueryKey() },
  });

  if (isLoading || !billing) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.mutedForeground }}>Carregando sua conta...</Text>
      </View>
    );
  }

  const isPaid = billing.plan === 'PRO' || billing.plan === 'MASTER';
  const planLabel = billing.plan === 'MASTER' ? 'MASTER' : billing.plan === 'PRO' ? 'PRO' : 'Gratuito';
  const email = user?.emailAddresses?.[0]?.emailAddress;
  const displayName = user?.fullName ?? user?.firstName ?? 'Usuário';
  const initials = (user?.firstName?.charAt(0) ?? email?.charAt(0) ?? '?').toUpperCase();
  const features = billing.plan === 'MASTER'
    ? ['Leitura de nota fiscal', 'Despesas por voz com IA', 'Grupos e despesas manuais']
    : billing.plan === 'PRO'
      ? ['Leitura de nota fiscal', 'Grupos e despesas manuais']
      : ['Grupos e despesas manuais', 'Histórico básico'];

  const handleSignOut = () => {
    Alert.alert('Sair da conta', 'Deseja sair deste dispositivo?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24, paddingHorizontal: 16 }}
    >
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={22} color={colors.foreground} />
        </Pressable>
        <View>
          <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>CONFIGURAÇÕES</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>Minha conta</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.primary + '1A' }]}>
          <Text style={[styles.avatarText, { color: colors.primary }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.name, { color: colors.foreground }]} numberOfLines={1}>{displayName}</Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]} numberOfLines={1}>{email}</Text>
          <Text style={[styles.caption, { color: colors.mutedForeground }]}>Conta protegida pelo Clerk</Text>
        </View>
      </View>

      <View style={[styles.planCard, { backgroundColor: isPaid ? colors.primary + '0D' : colors.card, borderColor: isPaid ? colors.primary + '40' : colors.border }]}>
        <View style={styles.planHeader}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.mutedForeground }]}>PLANO ATIVO</Text>
            <View style={styles.planTitleRow}>
              {isPaid && <Ionicons name="sparkles-outline" size={20} color={colors.primary} />}
              <Text style={[styles.planTitle, { color: colors.foreground }]}>Rachador {planLabel}</Text>
            </View>
          </View>
          <Text style={[styles.status, { color: isPaid ? colors.primary : colors.mutedForeground, backgroundColor: isPaid ? colors.primary + '1A' : colors.muted }]}>
            {isPaid ? 'Ativo' : 'Gratuito'}
          </Text>
        </View>

        <View style={styles.featureList}>
          {features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle-outline" size={18} color={isPaid ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.featureText, { color: colors.foreground }]}>{feature}</Text>
            </View>
          ))}
        </View>

        {isPaid && (
          <View style={[styles.paymentInfo, { backgroundColor: colors.background }]}>
            <View>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>Pagamento</Text>
              <Text style={[styles.infoValue, { color: colors.foreground }]}>PIX avulso</Text>
            </View>
            {billing.amount != null && (
              <View>
                <Text style={[styles.caption, { color: colors.mutedForeground }]}>Valor pago</Text>
                <Text style={[styles.infoValue, { color: colors.foreground }]}>
                  R$ {billing.amount.toFixed(2).replace('.', ',')}
                </Text>
              </View>
            )}
          </View>
        )}

        <Pressable
          onPress={() => router.push('/planos')}
          style={({ pressed }) => [styles.primaryAction, { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 }]}
        >
          <Ionicons name="card-outline" size={18} color={colors.primaryForeground} />
          <Text style={[styles.primaryActionText, { color: colors.primaryForeground }]}>Administrar planos e pagamentos</Text>
        </Pressable>
      </View>

      <View style={[styles.sessionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View>
          <Text style={[styles.sessionTitle, { color: colors.foreground }]}>Sessão da conta</Text>
          <Text style={[styles.email, { color: colors.mutedForeground }]}>Sair deste dispositivo</Text>
        </View>
        <Pressable onPress={handleSignOut} style={[styles.outlineAction, { borderColor: colors.destructive }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
          <Text style={[styles.outlineActionText, { color: colors.destructive }]}>Sair</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  backButton: { padding: 6, marginLeft: -6 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.1 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 2 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: 24, padding: 18, marginBottom: 14 },
  avatar: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '800' },
  email: { fontSize: 13, marginTop: 3 },
  caption: { fontSize: 11, marginTop: 7 },
  planCard: { borderWidth: 1, borderRadius: 24, padding: 18, marginBottom: 14 },
  planHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 5 },
  planTitle: { fontSize: 23, fontWeight: '800' },
  status: { fontSize: 12, fontWeight: '800', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6, overflow: 'hidden' },
  featureList: { gap: 10, marginTop: 20 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureText: { fontSize: 14 },
  paymentInfo: { flexDirection: 'row', gap: 36, borderRadius: 16, padding: 14, marginTop: 20 },
  infoValue: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  primaryAction: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, marginTop: 20 },
  primaryActionText: { fontSize: 14, fontWeight: '800' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderWidth: 1, borderRadius: 24, padding: 18 },
  sessionTitle: { fontSize: 15, fontWeight: '700' },
  outlineAction: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  outlineActionText: { fontSize: 13, fontWeight: '800' },
});