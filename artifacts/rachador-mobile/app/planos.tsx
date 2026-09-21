import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  AppState,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import {
  useGetBillingMe,
  getGetBillingMeQueryKey,
  useCreateBillingCheckout,
  useSimulateBillingPixPayment,
  useCancelBillingSubscription,
  type BillingCheckoutResponse,
} from '@workspace/api-client-react';

export default function PlanosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: billing, isLoading, refetch } = useGetBillingMe();
  const createCheckout = useCreateBillingCheckout();
  const simulatePix = useSimulateBillingPixPayment();
  const cancelSubscription = useCancelBillingSubscription();

  const [selectedPlan, setSelectedPlan] = useState<'PRO' | 'MASTER'>('PRO');
  const [pixPayment, setPixPayment] = useState<BillingCheckoutResponse | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refetch();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refetch]);

  const isPaid = billing?.plan === 'PRO' || billing?.plan === 'MASTER';
  const isPixPayment = billing?.paymentMethod === 'PIX';

  useEffect(() => {
    if (
      !pixPayment &&
      !isPaid &&
      billing?.paymentMethod === 'PIX' &&
      billing.checkoutId &&
      billing.pixCode &&
      billing.pixQrCode
    ) {
      setPixPayment({
        checkoutUrl: null,
        checkoutId: billing.checkoutId,
        plan: billing.pendingPlan ?? "PRO",
        paymentMethod: 'PIX',
        pixCode: billing.pixCode,
        pixQrCode: billing.pixQrCode,
        pixExpiresAt: billing.pixExpiresAt,
        devMode: false,
      });
    }
  }, [billing, isPaid, pixPayment]);

  const handleSubscribe = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payment = await createCheckout.mutateAsync({
        data: { plan: selectedPlan }
      });
      if (payment.checkoutUrl) {
        Alert.alert('Checkout', 'Este checkout não é PIX transparente.');
        return;
      }
      setPixPayment(payment);
    } catch (error) {
      const apiError = error as { data?: { error?: string } };
      Alert.alert(
        apiError.data?.error ? 'Pagamento ainda não habilitado' : 'Erro',
        apiError.data?.error ?? 'Não foi possível iniciar o pagamento. Tente novamente.',
      );
    }
  };

  const handleCopyPix = async () => {
    if (!pixPayment?.pixCode) return;
    await Clipboard.setStringAsync(pixPayment.pixCode);
    Alert.alert('PIX copiado', 'Cole o código no aplicativo do seu banco.');
  };

  const handleSimulatePix = async () => {
    if (!pixPayment) return;
    try {
      await simulatePix.mutateAsync({ data: { checkoutId: pixPayment.checkoutId } });
      await queryClient.invalidateQueries({ queryKey: getGetBillingMeQueryKey() });
      await refetch();
      Alert.alert('Pagamento simulado', 'Aguardando a confirmação do webhook da AbacatePay.');
    } catch {
      Alert.alert('Erro', 'Confirme se a chave da AbacatePay está em Dev mode.');
    }
  };

  const handleCancel = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Cancelar assinatura',
      'Tem certeza que deseja cancelar o Rachador PRO? A AbacatePay aplica o cancelamento imediatamente.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: 'Sim, cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await cancelSubscription.mutateAsync();
              Alert.alert('Assinatura cancelada', 'Sua solicitação de cancelamento foi recebida.');
              refetch();
            } catch (e) {
              Alert.alert('Erro', 'Não foi possível cancelar a assinatura.');
            }
          }
        }
      ]
    );
  };

  const renderFeatures = () => (
    <View style={styles.featuresList}>
      <Text style={[styles.featuresTitle, { color: colors.foreground }]}>Benefícios do plano {selectedPlan}</Text>
      {(selectedPlan === 'MASTER'
        ? ['Leitura de notas fiscais com IA', 'Cadastro de despesas por áudio com IA', 'Divisão automática complexa', 'Grupos ilimitados']
        : ['Leitura de notas fiscais com IA', 'Divisão automática complexa', 'Grupos ilimitados']
      ).map((feature, i) => (
        <View key={i} style={styles.featureItem}>
          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
          <Text style={[styles.featureText, { color: colors.foreground }]}>{feature}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Planos', headerBackTitle: 'Voltar' }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.container,
          {
            paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24,
          },
        ]}
      >
        {isLoading && !billing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <>
            {/* Current status header */}
            <View style={[styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.statusRow}>
                <View>
                  <Text style={[styles.statusLabel, { color: colors.mutedForeground }]}>Plano atual</Text>
                  <Text style={[styles.statusTitle, { color: colors.foreground }]}>
                     Rachador {isPaid ? billing?.plan : 'Gratuito'}
                  </Text>
                </View>
                <View style={[styles.badge, { backgroundColor: isPaid ? colors.primary + '1A' : colors.muted }]}>
                   <Text style={[styles.badgeText, { color: isPaid ? colors.primary : colors.mutedForeground }]}>
                     {isPaid ? 'Ativo' : 'Básico'}
                  </Text>
                </View>
              </View>

               {isPaid && billing?.nextBillingAt && !billing.canceledAt && (
                <Text style={[styles.statusDesc, { color: colors.mutedForeground }]}>
                  Sua assinatura será renovada em {new Date(billing.nextBillingAt).toLocaleDateString('pt-BR')}.
                </Text>
              )}
               {isPaid && billing?.canceledAt && (
                <Text style={[styles.statusDesc, { color: colors.mutedForeground }]}>
                  Cancelamento confirmado pela AbacatePay.
                </Text>
              )}
            </View>

             {isPaid ? (
              <View style={styles.proActions}>
                {renderFeatures()}
                {!billing?.canceledAt && !isPixPayment && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.cancelButton,
                      { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }
                    ]}
                    onPress={handleCancel}
                    disabled={cancelSubscription.isPending}
                  >
                    {cancelSubscription.isPending ? (
                      <ActivityIndicator color={colors.destructive} />
                    ) : (
                      <Text style={[styles.cancelButtonText, { color: colors.destructive }]}>Cancelar assinatura</Text>
                    )}
                  </Pressable>
                )}
                {isPixPayment && (
                  <Text style={[styles.statusDesc, { color: colors.primary }]}>
                    Pagamento PIX confirmado.
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.upgradeSection}>
                   <Text style={[styles.upgradeTitle, { color: colors.foreground }]}>
                   Escolha seu plano
                </Text>

                {/* Plan picker */}
                <View style={styles.plansContainer}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.planOption,
                      {
                        borderColor: selectedPlan === 'PRO' ? colors.primary : colors.border,
                        backgroundColor: selectedPlan === 'PRO' ? colors.primary + '0D' : colors.card,
                        opacity: pressed ? 0.9 : 1,
                      }
                    ]}
                    onPress={() => setSelectedPlan('PRO')}
                  >
                    <View style={styles.planOptionHeader}>
                      <Text style={[styles.planOptionTitle, { color: colors.foreground }]}>PRO</Text>
                      {selectedPlan === 'PRO' && (
                        <Ionicons name="radio-button-on" size={20} color={colors.primary} />
                      )}
                      {selectedPlan !== 'PRO' && (
                        <Ionicons name="radio-button-off" size={20} color={colors.mutedForeground} />
                      )}
                    </View>
                    <Text style={[styles.planOptionPrice, { color: colors.foreground }]}>
                      R$ 9,99<Text style={[styles.planOptionPeriod, { color: colors.mutedForeground }]}> pagamento único</Text>
                    </Text>
                    <Text style={[styles.planOptionDiscount, { color: colors.mutedForeground }]}>Leitura de nota fiscal com IA</Text>
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.planOption,
                      styles.planOptionPopular,
                      {
                        borderColor: selectedPlan === 'MASTER' ? colors.primary : colors.border,
                        backgroundColor: selectedPlan === 'MASTER' ? colors.primary + '0D' : colors.card,
                        opacity: pressed ? 0.9 : 1,
                      }
                    ]}
                    onPress={() => setSelectedPlan('MASTER')}
                  >
                    <View style={[styles.popularBadge, { backgroundColor: colors.primary }]}>
                      <Text style={[styles.popularBadgeText, { color: colors.primaryForeground }]}>Mais vantajoso</Text>
                    </View>
                    <View style={styles.planOptionHeader}>
                      <Text style={[styles.planOptionTitle, { color: colors.foreground }]}>MASTER</Text>
                      {selectedPlan === 'MASTER' && (
                        <Ionicons name="radio-button-on" size={20} color={colors.primary} />
                      )}
                      {selectedPlan !== 'MASTER' && (
                        <Ionicons name="radio-button-off" size={20} color={colors.mutedForeground} />
                      )}
                    </View>
                    <Text style={[styles.planOptionPrice, { color: colors.foreground }]}>
                      R$ 15,99<Text style={[styles.planOptionPeriod, { color: colors.mutedForeground }]}> pagamento único</Text>
                    </Text>
                    <Text style={[styles.planOptionDiscount, { color: colors.primary }]}>Nota fiscal + IA de voz</Text>
                  </Pressable>
                </View>

                {renderFeatures()}

                <Pressable
                  style={({ pressed }) => [
                    styles.primaryButton,
                    {
                      backgroundColor: colors.primary,
                      opacity: createCheckout.isPending ? 0.7 : pressed ? 0.85 : 1
                    }
                  ]}
                  onPress={handleSubscribe}
                  disabled={createCheckout.isPending}
                >
                  {createCheckout.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                       Pagar Rachador {selectedPlan}
                    </Text>
                  )}
                </Pressable>

                 {pixPayment && !isPaid && (
                  <View style={[styles.pixCard, { backgroundColor: colors.card, borderColor: colors.primary + '55' }]}>
                    <Text style={[styles.pixTitle, { color: colors.foreground }]}>Pague com PIX</Text>
                    <Text style={[styles.pixDescription, { color: colors.mutedForeground }]}>
                       Escaneie o QR Code ou copie o código. O plano {pixPayment.plan} será ativado após o webhook.
                    </Text>
                    <Image source={{ uri: pixPayment.pixQrCode }} style={styles.pixQrCode} />
                    <Text selectable style={[styles.pixCode, { color: colors.foreground, backgroundColor: colors.background }]}>
                      {pixPayment.pixCode}
                    </Text>
                    <Pressable
                      onPress={handleCopyPix}
                      style={[styles.secondaryButton, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.secondaryButtonText, { color: colors.foreground }]}>Copiar código PIX</Text>
                    </Pressable>
                    {pixPayment.devMode && (
                      <Pressable
                        onPress={handleSimulatePix}
                        disabled={simulatePix.isPending}
                        style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: simulatePix.isPending ? 0.7 : 1 }]}
                      >
                        {simulatePix.isPending ? (
                          <ActivityIndicator color={colors.primaryForeground} />
                        ) : (
                          <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
                            Simular pagamento (Dev mode)
                          </Text>
                        )}
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 24,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  statusCard: {
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusLabel: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 22,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  statusDesc: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  proActions: {
    gap: 32,
  },
  cancelButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
  },
  upgradeSection: {
    gap: 24,
  },
  upgradeTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
  },
  plansContainer: {
    gap: 16,
  },
  planOption: {
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    gap: 8,
  },
  planOptionPopular: {
    paddingTop: 24,
  },
  popularBadge: {
    position: 'absolute',
    top: -12,
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  planOptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planOptionTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
  },
  planOptionPrice: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 28,
  },
  planOptionPeriod: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  planOptionDiscount: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  featuresList: {
    gap: 16,
  },
  featuresTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    marginBottom: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  primaryButton: {
    height: 56,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  pixCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 18,
    gap: 12,
  },
  pixTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 18,
  },
  pixDescription: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    lineHeight: 20,
  },
  pixQrCode: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
  },
  pixCode: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    lineHeight: 16,
    padding: 10,
    borderRadius: 10,
  },
  secondaryButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
});
