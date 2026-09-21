import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { Participante } from '@workspace/api-client-react';
import { useAuth } from '@clerk/expo';

export interface ReceiptItem {
  nome: string;
  quantidade: number;
  precoUnitario: number;
  precoTotal: number;
}

export interface ReceiptData {
  itens: ReceiptItem[];
  taxaServico: number | null;
  totalSemTaxa: number;
  totalComTaxa: number | null;
}

// assignments[participanteId][itemIdx] = quantas unidades essa pessoa consumiu
type Assignments = Record<number, Record<number, number>>;

interface ReceiptScannerProps {
  participantes: Participante[];
  onApply: (splits: Record<number, number>, total: number, descricao: string) => void;
  onClose: () => void;
}

export function ReceiptScanner({ participantes, onApply, onClose }: ReceiptScannerProps) {
  const colors = useColors();
  const { getToken } = useAuth();

  const [step, setStep] = useState<'capture' | 'assigning'>('capture');
  const [loading, setLoading] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [taxaPercent, setTaxaPercent] = useState('');
  const [assignments, setAssignments] = useState<Assignments>({});
  const [expandedPerson, setExpandedPerson] = useState<number | null>(null);

  const scanImage = async (base64: string) => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(
        `https://${process.env.EXPO_PUBLIC_DOMAIN}/api/scan-receipt`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ image: `data:image/jpeg;base64,${base64}` }),
        }
      );
      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('A leitura de notas fiscais exige o plano Rachador PRO.');
        }
        const body = await res.json().catch(() => ({})) as { code?: string; message?: string };
        throw new Error(body.message || 'Erro ao processar a nota');
      }
      const data: ReceiptData = await res.json();
      setReceipt(data);
      setTaxaPercent(data.taxaServico != null ? data.taxaServico.toString() : '');

      const init: Assignments = {};
      participantes.forEach((p) => {
        init[p.id] = {};
        data.itens.forEach((_, idx) => { init[p.id][idx] = 0; });
      });
      setAssignments(init);
      setExpandedPerson(participantes[0]?.id ?? null);
      setStep('assigning');
    } catch (e: unknown) {
      Alert.alert('Erro', e instanceof Error ? e.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permissão necessária', 'Permite o acesso à câmera nas configurações.'); return; }
    const result = await ImagePicker.launchCameraAsync({ base64: true, quality: 0.8 });
    if (!result.canceled && result.assets[0].base64) {
      await scanImage(result.assets[0].base64);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permissão necessária', 'Permite o acesso à galeria nas configurações.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 });
    if (!result.canceled && result.assets[0].base64) {
      await scanImage(result.assets[0].base64);
    }
  };

  // Quantas pessoas estão compartilhando um item de unidade única
  const sharersOfItem = (itemIdx: number): number =>
    participantes.filter((p) => (assignments[p.id]?.[itemIdx] ?? 0) > 0).length;

  // Quantas unidades de um item de múltiplas unidades já foram atribuídas (excluindo opcionalmente uma pessoa)
  const assignedForItem = (itemIdx: number, excludePersonId?: number): number =>
    participantes.reduce((sum, p) => {
      if (p.id === excludePersonId) return sum;
      return sum + (assignments[p.id]?.[itemIdx] ?? 0);
    }, 0);

  // Para itens de unidade única: apenas alterna 0/1 sem restrição de capacidade (compartilhamento)
  const toggleItem = (participanteId: number, itemIdx: number) => {
    const current = assignments[participanteId]?.[itemIdx] ?? 0;
    setAssignments((prev) => ({
      ...prev,
      [participanteId]: { ...(prev[participanteId] ?? {}), [itemIdx]: current > 0 ? 0 : 1 },
    }));
  };

  const setQty = (participanteId: number, itemIdx: number, delta: number) => {
    setAssignments((prev) => {
      const current = prev[participanteId]?.[itemIdx] ?? 0;
      const totalItem = receipt!.itens[itemIdx].quantidade;
      const usedByOthers = assignedForItem(itemIdx, participanteId);
      const maxAvail = totalItem - usedByOthers;
      const next = Math.max(0, Math.min(maxAvail, current + delta));
      return { ...prev, [participanteId]: { ...(prev[participanteId] ?? {}), [itemIdx]: next } };
    });
  };

  // Subtotal de itens por pessoa.
  // Itens de unidade única compartilhados entre N pessoas: cada um paga preço/N.
  const personSubtotal = (participanteId: number): number => {
    if (!receipt) return 0;
    return receipt.itens.reduce((sum, item, idx) => {
      const qty = assignments[participanteId]?.[idx] ?? 0;
      if (qty === 0) return sum;
      if (item.quantidade === 1) {
        const sharers = sharersOfItem(idx);
        return sum + item.precoUnitario / (sharers || 1);
      }
      return sum + qty * item.precoUnitario;
    }, 0);
  };

  const totalSubtotal = participantes.reduce((s, p) => s + personSubtotal(p.id), 0);
  const taxaVal = parseFloat(taxaPercent) || 0;

  // Taxa de serviço dividida igualmente entre todas as pessoas
  const personServiceFee = (): number => {
    if (participantes.length === 0 || taxaVal === 0) return 0;
    const base = totalSubtotal > 0 ? totalSubtotal : (receipt?.totalSemTaxa ?? 0);
    return (taxaVal / 100) * base / participantes.length;
  };

  const personTotal = (id: number) => personSubtotal(id) + personServiceFee();
  const grandTotal = participantes.reduce((sum, p) => sum + personTotal(p.id), 0);

  const handleApply = () => {
    const splits: Record<number, number> = {};
    participantes.forEach((p) => {
      splits[p.id] = Math.round(personTotal(p.id) * 100) / 100;
    });
    onApply(splits, Math.round(grandTotal * 100) / 100, 'Nota fiscal');
  };

  const insets = useSafeAreaInsets();
  const s = makeStyles(colors);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderColor: colors.border, paddingTop: 14 + insets.top }]}>
          <Pressable onPress={step === 'assigning' ? () => { setStep('capture'); setReceipt(null); } : onClose} style={s.backBtn}>
            <Ionicons name={step === 'assigning' ? 'arrow-back' : 'close'} size={24} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>
              {step === 'capture' ? 'Escanear Nota Fiscal' : 'Quem consumiu o quê?'}
            </Text>
            {step === 'assigning' && receipt && (
              <Text style={[s.headerSub, { color: colors.mutedForeground }]}>
                {receipt.itens.length} iten{receipt.itens.length !== 1 ? 's' : ''} encontrado{receipt.itens.length !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
          {step === 'assigning' && (
            <Pressable onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>

        {/* ── CAPTURE STEP ── */}
        {step === 'capture' && (
          <View style={s.captureContainer}>
            {loading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={[s.loadingText, { color: colors.mutedForeground }]}>Lendo os itens da nota…</Text>
              </View>
            ) : (
              <>
                <View style={[s.iconCircle, { backgroundColor: colors.primary + '1A' }]}>
                  <Ionicons name="receipt-outline" size={44} color={colors.primary} />
                </View>
                <Text style={[s.captureTitle, { color: colors.foreground }]}>Tire uma foto da nota</Text>
                <Text style={[s.captureSub, { color: colors.mutedForeground }]}>
                  A IA lê os itens e você define quem consumiu cada um
                </Text>
                <Pressable style={[s.captureBtn, { backgroundColor: colors.primary }]} onPress={pickFromCamera}>
                  <Ionicons name="camera-outline" size={20} color={colors.primaryForeground} />
                  <Text style={[s.captureBtnText, { color: colors.primaryForeground }]}>Tirar foto</Text>
                </Pressable>
                <Pressable style={[s.captureBtn, s.captureBtnOutline, { borderColor: colors.border }]} onPress={pickFromGallery}>
                  <Ionicons name="images-outline" size={20} color={colors.foreground} />
                  <Text style={[s.captureBtnText, { color: colors.foreground }]}>Escolher da galeria</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        {/* ── ASSIGNING STEP ── */}
        {step === 'assigning' && receipt && (
          <>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={s.assigningContent} showsVerticalScrollIndicator={false}>
              {/* Aviso de itens não atribuídos */}
              {receipt.itens.some((item, idx) => assignedForItem(idx) < item.quantidade) && (
                <View style={[s.warningBox, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                  <Ionicons name="warning-outline" size={14} color="#92400E" />
                  <Text style={[s.warningText, { color: '#92400E' }]}>
                    {receipt.itens.filter((item, idx) => assignedForItem(idx) < item.quantidade).length} iten(s) ainda não totalmente atribuído(s)
                  </Text>
                </View>
              )}

              {/* Card por pessoa */}
              {participantes.map((p) => {
                const isExpanded = expandedPerson === p.id;
                const sub = personSubtotal(p.id);
                const total = personTotal(p.id);
                const itemCount = receipt.itens.reduce((n, _, idx) => n + ((assignments[p.id]?.[idx] ?? 0) > 0 ? 1 : 0), 0);

                return (
                  <View key={p.id} style={[s.personCard, { borderColor: isExpanded ? colors.primary : colors.border, backgroundColor: colors.card }]}>
                    {/* Person header */}
                    <Pressable
                      style={[s.personHeader, { backgroundColor: isExpanded ? colors.primary + '0D' : 'transparent' }]}
                      onPress={() => setExpandedPerson(isExpanded ? null : p.id)}
                    >
                      <View style={[s.avatar, { backgroundColor: isExpanded ? colors.primary : colors.muted }]}>
                        <Text style={[s.avatarText, { color: isExpanded ? colors.primaryForeground : colors.mutedForeground }]}>
                          {p.nome.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.personName, { color: colors.foreground }]}>{p.nome}</Text>
                        <Text style={[s.personSub, { color: colors.mutedForeground }]}>
                          {itemCount === 0 ? 'Nenhum item selecionado' : `${itemCount} iten${itemCount !== 1 ? 's' : ''} · R$ ${sub.toFixed(2)}`}
                        </Text>
                      </View>
                      {total > 0 && (
                        <Text style={[s.personTotal, { color: colors.foreground }]}>R$ {total.toFixed(2)}</Text>
                      )}
                      <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.mutedForeground} />
                    </Pressable>

                    {/* Item list */}
                    {isExpanded && (
                      <View style={[s.itemList, { borderColor: colors.border }]}>
                        {receipt.itens.map((item, idx) => {
                          const qty = assignments[p.id]?.[idx] ?? 0;
                          const isSelected = qty > 0;
                          const usedByOthers = assignedForItem(idx, p.id);
                          const maxForMe = item.quantidade - usedByOthers;
                          const isSingleUnit = item.quantidade === 1;

                          const sharers = isSingleUnit ? sharersOfItem(idx) : 0;
                          const myShare = isSingleUnit && isSelected
                            ? item.precoUnitario / (sharers || 1)
                            : qty * item.precoUnitario;

                          return (
                            <View key={idx} style={[s.itemRow, { borderColor: colors.border, backgroundColor: isSelected ? colors.primary + '0A' : 'transparent' }]}>
                              {/* Toggle / stepper */}
                              {isSingleUnit ? (
                                <Pressable
                                  onPress={() => toggleItem(p.id, idx)}
                                  style={[
                                    s.checkbox,
                                    {
                                      borderColor: isSelected ? colors.primary : colors.border,
                                      backgroundColor: isSelected ? colors.primary : 'transparent',
                                    },
                                  ]}
                                >
                                  {isSelected && <Ionicons name="checkmark" size={13} color={colors.primaryForeground} />}
                                </Pressable>
                              ) : (
                                <View style={s.stepper}>
                                  <Pressable
                                    onPress={() => setQty(p.id, idx, -1)}
                                    disabled={qty === 0}
                                    style={[s.stepperBtn, { borderColor: colors.border, opacity: qty === 0 ? 0.3 : 1 }]}
                                  >
                                    <Ionicons name="remove" size={12} color={colors.foreground} />
                                  </Pressable>
                                  <Text style={[s.stepperQty, { color: colors.foreground }]}>{qty}</Text>
                                  <Pressable
                                    onPress={() => setQty(p.id, idx, +1)}
                                    disabled={qty >= maxForMe}
                                    style={[s.stepperBtn, { borderColor: colors.primary, opacity: qty >= maxForMe ? 0.3 : 1 }]}
                                  >
                                    <Ionicons name="add" size={12} color={colors.primary} />
                                  </Pressable>
                                </View>
                              )}

                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                  <Text style={[s.itemName, { color: isSelected ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                                    {item.nome}
                                  </Text>
                                  {isSingleUnit && sharers > 1 && (
                                    <View style={[s.sharerBadge, { backgroundColor: colors.primary + '22' }]}>
                                      <Text style={[s.sharerBadgeText, { color: colors.primary }]}>÷{sharers}</Text>
                                    </View>
                                  )}
                                </View>
                                {!isSingleUnit && (
                                  <Text style={[s.itemSub, { color: colors.mutedForeground }]}>
                                    R$ {item.precoUnitario.toFixed(2)} cada · {maxForMe} disponível{maxForMe !== 1 ? 'is' : ''}
                                  </Text>
                                )}
                                {isSingleUnit && isSelected && sharers > 1 && (
                                  <Text style={[s.itemSub, { color: colors.mutedForeground }]}>
                                    R$ {item.precoUnitario.toFixed(2)} ÷ {sharers} pessoas
                                  </Text>
                                )}
                              </View>

                              <Text style={[s.itemPrice, { color: isSelected ? colors.foreground : colors.mutedForeground }]}>
                                R$ {myShare.toFixed(2)}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })}

              {/* Taxa de serviço */}
              <View style={[s.taxaCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[s.taxaTitle, { color: colors.foreground }]}>Taxa de serviço</Text>
                <Text style={[s.taxaSub, { color: colors.mutedForeground }]}>Dividida igualmente entre todas as pessoas</Text>
                <View style={s.taxaRow}>
                  <View style={[s.taxaInputWrapper, { borderColor: colors.border, backgroundColor: colors.input }]}>
                    <TextInput
                      style={[s.taxaInput, { color: colors.foreground }]}
                      value={taxaPercent}
                      onChangeText={setTaxaPercent}
                      placeholder="0"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
                    />
                    <Text style={[s.taxaSymbol, { color: colors.mutedForeground }]}>%</Text>
                  </View>
                  {taxaVal > 0 && totalSubtotal > 0 && (
                    <Text style={[s.taxaValue, { color: colors.mutedForeground }]}>
                      = R$ {((taxaVal / 100) * totalSubtotal).toFixed(2)} no total
                    </Text>
                  )}
                </View>
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={[s.footer, { borderColor: colors.border, backgroundColor: colors.card }]}>
              {participantes.map((p) => {
                const total = personTotal(p.id);
                if (total === 0) return null;
                return (
                  <View key={p.id} style={s.footerRow}>
                    <Text style={[s.footerName, { color: colors.mutedForeground }]}>{p.nome}</Text>
                    <Text style={[s.footerValue, { color: colors.foreground }]}>R$ {total.toFixed(2)}</Text>
                  </View>
                );
              })}
              <View style={[s.footerTotal, { borderColor: colors.border }]}>
                <Text style={[s.footerTotalLabel, { color: colors.foreground }]}>Total</Text>
                <Text style={[s.footerTotalValue, { color: colors.foreground }]}>R$ {grandTotal.toFixed(2)}</Text>
              </View>
              <Pressable
                style={[s.applyBtn, { backgroundColor: colors.primary, opacity: grandTotal === 0 ? 0.45 : 1 }]}
                onPress={handleApply}
                disabled={grandTotal === 0}
              >
                <Text style={[s.applyBtnText, { color: colors.primaryForeground }]}>Aplicar divisão</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

function makeStyles(colors: ReturnType<typeof import('@/hooks/useColors').useColors>) {
  return StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: 1,
    },
    backBtn: { padding: 4 },
    closeBtn: { padding: 4 },
    headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17 },
    headerSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, marginTop: 1 },

    // Capture
    captureContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 32 },
    loadingBox: { alignItems: 'center', gap: 16 },
    loadingText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14 },
    iconCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
    captureTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, textAlign: 'center' },
    captureSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, textAlign: 'center', lineHeight: 20 },
    captureBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 10, height: 52, borderRadius: 12, width: '100%', marginTop: 4,
    },
    captureBtnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, marginTop: 0 },
    captureBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },

    // Assigning
    assigningContent: { padding: 16, gap: 12, paddingBottom: 8 },
    warningBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
    warningText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, flex: 1 },

    personCard: { borderRadius: 14, borderWidth: 1.5, overflow: 'hidden' },
    personHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
    avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
    personName: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
    personSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12, marginTop: 1 },
    personTotal: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, marginRight: 4 },

    itemList: { borderTopWidth: 1 },
    itemRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth,
    },
    checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    stepperBtn: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
    stepperQty: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, width: 18, textAlign: 'center' },
    itemName: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
    itemSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 11, marginTop: 1 },
    itemPrice: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
    sharerBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    sharerBadgeText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 10 },

    taxaCard: { borderRadius: 14, borderWidth: 1.5, padding: 14, gap: 8 },
    taxaTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
    taxaSub: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12 },
    taxaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    taxaInputWrapper: {
      flexDirection: 'row', alignItems: 'center',
      borderRadius: 8, borderWidth: 1.5, height: 40, paddingHorizontal: 10, width: 80,
    },
    taxaInput: { flex: 1, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15, textAlign: 'center' },
    taxaSymbol: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14 },
    taxaValue: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 12 },

    footer: { borderTopWidth: 1, padding: 16, gap: 6 },
    footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    footerName: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13 },
    footerValue: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
    footerTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, paddingTop: 8, marginTop: 2 },
    footerTotalLabel: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
    footerTotalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
    applyBtn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
    applyBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  });
}
