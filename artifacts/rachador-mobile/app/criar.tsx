import React, { useRef, useState } from 'react';
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
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useCreateGrupo } from '@workspace/api-client-react';

interface ParticipanteForm {
  id: string;
  nome: string;
  pix: string;
}

export default function CriarGrupoScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [nomeGrupo, setNomeGrupo] = useState('');
  const [participantes, setParticipantes] = useState<ParticipanteForm[]>([
    { id: '1', nome: '', pix: '' },
  ]);
  const createGrupo = useCreateGrupo();

  const addParticipante = () => {
    setParticipantes((prev) => [
      ...prev,
      { id: Date.now().toString(), nome: '', pix: '' },
    ]);
  };

  const removeParticipante = (id: string) => {
    if (participantes.length <= 1) return;
    setParticipantes((prev) => prev.filter((p) => p.id !== id));
  };

  const updateParticipante = (id: string, field: 'nome' | 'pix', value: string) => {
    setParticipantes((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  const canSubmit =
    nomeGrupo.trim().length > 0 &&
    participantes.every((p) => p.nome.trim().length > 0) &&
    !createGrupo.isPending;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const grupo = await createGrupo.mutateAsync({
        data: {
          nome: nomeGrupo.trim(),
          participantes: participantes.map((p) => ({
            nome: p.nome.trim(),
            chavePix: p.pix.trim() || null,
          })),
        },
      });
      router.replace(`/grupo/${grupo.id}/entrar`);
    } catch {
      Alert.alert('Erro', 'Não foi possível criar o grupo. Tente novamente.');
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        {
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Group name */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>NOME DO GRUPO</Text>
        <TextInput
          style={[
            styles.input,
            {
              backgroundColor: colors.input,
              borderColor: nomeGrupo ? colors.primary : colors.border,
              color: colors.foreground,
            },
          ]}
          value={nomeGrupo}
          onChangeText={setNomeGrupo}
          placeholder="Ex: Viagem para Floripa"
          placeholderTextColor={colors.mutedForeground}
          autoFocus
          returnKeyType="next"
        />
      </View>

      {/* Participants */}
      <View style={styles.section}>
        <Text style={[styles.label, { color: colors.mutedForeground }]}>PARTICIPANTES</Text>
        {participantes.map((p, index) => (
          <View
            key={p.id}
            style={[styles.participanteCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          >
            <View style={styles.participanteHeader}>
              <Text style={[styles.participanteIndex, { color: colors.mutedForeground }]}>
                {index + 1}
              </Text>
              {participantes.length > 1 && (
                <Pressable
                  onPress={() => removeParticipante(p.id)}
                  style={styles.removeButton}
                  testID={`remove-participante-${index}`}
                >
                  <Ionicons name="close-circle" size={20} color={colors.destructive} />
                </Pressable>
              )}
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: p.nome ? colors.primary : colors.border,
                  color: colors.foreground,
                },
              ]}
              value={p.nome}
              onChangeText={(v) => updateParticipante(p.id, 'nome', v)}
              placeholder="Nome"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
            />
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.input,
                  borderColor: p.pix ? colors.secondary : colors.border,
                  color: colors.foreground,
                },
              ]}
              value={p.pix}
              onChangeText={(v) => updateParticipante(p.id, 'pix', v)}
              placeholder="Chave Pix (opcional)"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="next"
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [
            styles.addButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={addParticipante}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>
            Adicionar participante
          </Text>
        </Pressable>
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
        testID="submit-button"
      >
        {createGrupo.isPending ? (
          <ActivityIndicator color={colors.primaryForeground} />
        ) : (
          <Text style={[styles.submitButtonText, { color: colors.primaryForeground }]}>
            Criar grupo
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
  participanteCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    marginBottom: 8,
  },
  participanteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  participanteIndex: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  removeButton: {
    padding: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 8,
  },
  addButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
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
