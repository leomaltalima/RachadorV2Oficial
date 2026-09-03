import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import type { VoiceExpenseParseResponse, VoiceExpenseDraft, Participante, DespesaInput } from '@workspace/api-client-react';
import { ExpenseDraftCard } from './ExpenseDraftCard';

interface VoiceExpenseReviewProps {
  parsedData: VoiceExpenseParseResponse;
  participantes: Participante[];
  currentParticipanteId: number;
  onConfirm: (expenses: DespesaInput[]) => Promise<number>;
  onCancel: () => void;
  isSubmitting: boolean;
}

export function VoiceExpenseReview({
  parsedData,
  participantes,
  currentParticipanteId,
  onConfirm,
  onCancel,
  isSubmitting,
}: VoiceExpenseReviewProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  
  // We'll manage the state of drafts locally. We assign local IDs to track them.
  const [drafts, setDrafts] = useState<(VoiceExpenseDraft & { localId: string })[]>(
    parsedData.despesas.map((d, i) => ({ ...d, localId: `initial-${i}` }))
  );
  
  // Track validation status of each draft
  const [validations, setValidations] = useState<Record<string, { isValid: boolean; payload?: DespesaInput }>>({});

  const handleUpdateDraft = (localId: string, payload: DespesaInput | null) => {
    setValidations(prev => ({
      ...prev,
      [localId]: payload ? { isValid: true, payload } : { isValid: false }
    }));
  };

  const handleDeleteDraft = (localId: string) => {
    setDrafts(prev => prev.filter(d => d.localId !== localId));
    setValidations(prev => {
      const next = { ...prev };
      delete next[localId];
      return next;
    });
  };

  const handleAddDraft = () => {
    const newLocalId = `added-${Date.now()}`;
    const newDraft: VoiceExpenseDraft & { localId: string } = {
      localId: newLocalId,
      id: newLocalId,
      descricao: '',
      valor: 0,
      categoria: 'Outros',
      tipoDivisao: 'igual',
      pagoPorId: currentParticipanteId,
      pagoPorNome: participantes.find(p => p.id === currentParticipanteId)?.nome || '',
      divisoes: [],
      nomesNaoResolvidos: [],
      precisaConfirmacao: [],
      confianca: { valor: 'alta', pagador: 'alta', participantes: 'alta', categoria: 'alta' },
      observacoes: null,
    };
    setDrafts(prev => [...prev, newDraft]);
  };

  const totalExpensesValue = drafts.map(d => validations[d.localId]?.payload?.valor || 0).reduce((a, b) => a + b, 0);

  const allValid = drafts.length > 0 && drafts.every(d => validations[d.localId]?.isValid);

  const handleConfirm = async () => {
    if (!allValid) {
      Alert.alert('Atenção', 'Corrija os erros nas despesas antes de confirmar.');
      return;
    }
    const payloads = drafts.map(d => validations[d.localId].payload!);
    const successCount = await onConfirm(payloads);
    if (successCount > 0 && successCount < drafts.length) {
      const savedIds = new Set(drafts.slice(0, successCount).map((draft) => draft.localId));
      setDrafts((current) => current.filter((draft) => !savedIds.has(draft.localId)));
      setValidations((current) => {
        const next = { ...current };
        for (const savedId of savedIds) delete next[savedId];
        return next;
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 }]}>
      <View style={[styles.header, { borderColor: colors.border, paddingTop: insets.top + 14 }]}>
        <Pressable onPress={onCancel} style={styles.backBtn} disabled={isSubmitting}>
          <Ionicons name="close" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Revisão</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        
        <View style={[styles.summaryCard, { backgroundColor: colors.primary + '1A', borderColor: colors.primary }]}>
          <Text style={[styles.summaryTitle, { color: colors.primary }]}>Resumo</Text>
          <Text style={[styles.summaryText, { color: colors.foreground }]}>{parsedData.resumo}</Text>
          <View style={styles.transcriptionBox}>
            <Text style={[styles.transcriptionLabel, { color: colors.mutedForeground }]}>Você disse:</Text>
            <Text style={[styles.transcriptionText, { color: colors.mutedForeground }]}>"{parsedData.transcricao}"</Text>
          </View>
        </View>

        {parsedData.avisos.length > 0 && (
          <View style={[styles.warningsBox, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
            <Ionicons name="warning-outline" size={16} color="#92400E" />
            <View style={{ flex: 1, gap: 4 }}>
              {parsedData.avisos.map((aviso, idx) => (
                <Text key={idx} style={[styles.warningText, { color: '#92400E' }]}>{aviso}</Text>
              ))}
            </View>
          </View>
        )}

        <View style={styles.draftsHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {drafts.length} Despesa{drafts.length !== 1 ? 's' : ''} Encontrada{drafts.length !== 1 ? 's' : ''}
          </Text>
          <Text style={[styles.totalValue, { color: colors.primary }]}>R$ {totalExpensesValue.toFixed(2)}</Text>
        </View>

        {drafts.map((draft, idx) => (
          <ExpenseDraftCard
            key={draft.localId}
            draft={draft}
            participantes={participantes}
            currentParticipanteId={currentParticipanteId}
            onUpdate={(payload) => handleUpdateDraft(draft.localId, payload)}
            onDelete={() => handleDeleteDraft(draft.localId)}
            index={idx + 1}
          />
        ))}

        <Pressable 
          style={[styles.addDraftBtn, { borderColor: colors.border, backgroundColor: colors.card }]} 
          onPress={handleAddDraft}
          disabled={isSubmitting}
        >
          <Ionicons name="add" size={20} color={colors.foreground} />
          <Text style={[styles.addDraftText, { color: colors.foreground }]}>Adicionar outra despesa</Text>
        </Pressable>

      </ScrollView>

      <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable
          style={[styles.submitBtn, { 
            backgroundColor: colors.primary, 
            opacity: !allValid || isSubmitting ? 0.5 : 1 
          }]}
          onPress={handleConfirm}
          disabled={!allValid || isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.submitBtnText, { color: colors.primaryForeground }]}>
              Confirmar Despesas
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17 },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    gap: 12,
  },
  summaryTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14, textTransform: 'uppercase', letterSpacing: 1.2 },
  summaryText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 15, lineHeight: 22 },
  transcriptionBox: { borderTopWidth: 1, borderTopColor: '#0000001A', paddingTop: 12, gap: 4 },
  transcriptionLabel: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  transcriptionText: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, fontStyle: 'italic' },
  
  warningsBox: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 12,
  },
  warningText: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, lineHeight: 18 },
  
  draftsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: -4,
  },
  sectionTitle: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
  totalValue: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  
  addDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    marginTop: 8,
  },
  addDraftText: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 15 },
  
  footer: {
    padding: 16,
    borderTopWidth: 1,
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitBtnText: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 16 },
});
