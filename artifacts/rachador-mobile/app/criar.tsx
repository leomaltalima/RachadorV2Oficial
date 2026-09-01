import React, { useState } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { useSession } from '@/context/SessionContext';

interface MeuGrupo {
  grupo: { id: number; nome: string; participantes: { id: number; nome: string; chavePix: string | null }[] };
  participante: { id: number; nome: string };
}

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
  const { getToken, isSignedIn } = useAuth();
  const { setSession } = useSession();

  const { data: meusGrupos, isLoading: loadingGrupos } = useQuery<MeuGrupo[]>({
    queryKey: ['me/grupos'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/me/grupos`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error('Erro ao buscar grupos');
      return res.json();
    },
    enabled: !!isSignedIn,
  });

  const handleEnterGroup = async (g: MeuGrupo) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setSession(g.grupo.id, g.participante.id);
    router.replace(`/grupo/${g.grupo.id}/despesas`);
  };

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
      }) as any;

      // First participant is the creator — set session automatically
      const meuId = grupo.participantes[0]?.id;
      if (meuId) {
        await setSession(grupo.id, meuId);
        // Claim the participant for the current Clerk account (non-critical)
        try {
          const token = await getToken();
          await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/participantes/${meuId}/claim`, {
            method: 'POST',
            headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
        } catch {}
      }

      router.replace(`/grupo/${grupo.id}/despesas`);
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
      {/* Existing groups */}
      {(loadingGrupos || (meusGrupos && meusGrupos.length > 0)) && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>SEUS GRUPOS</Text>
          {loadingGrupos ? (
            <ActivityIndicator size="small" color={colors.primary} />
          ) : (
            <>
              {meusGrupos!.map((g) => (
                <Pressable
                  key={g.grupo.id}
                  style={({ pressed }) => [
                    styles.grupoItem,
                    { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.75 : 1 },
                  ]}
                  onPress={() => handleEnterGroup(g)}
                >
                  <View style={[styles.grupoIcon, { backgroundColor: colors.primary + '18' }]}>
                    <Ionicons name="people-outline" size={18} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.grupoName, { color: colors.foreground }]} numberOfLines={1}>
                      {g.grupo.nome}
                    </Text>
                    <Text style={[styles.grupoMeta, { color: colors.mutedForeground }]}>
                      Como {g.participante.nome} · {g.grupo.participantes.length} membros
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                </Pressable>
              ))}
              <View style={styles.dividerRow}>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>ou crie um novo</Text>
                <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
              </View>
            </>
          )}
        </View>
      )}

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
            style={[
              styles.participanteCard,
              {
                backgroundColor: colors.card,
                borderColor: index === 0 ? colors.primary : colors.border,
                borderWidth: index === 0 ? 1.5 : 1,
              },
            ]}
          >
            <View style={styles.participanteHeader}>
              {index === 0 ? (
                <View style={[styles.liderBadge, { backgroundColor: colors.primary + '18' }]}>
                  <Text style={[styles.liderBadgeText, { color: colors.primary }]}>Você — líder do grupo</Text>
                </View>
              ) : (
                <Text style={[styles.participanteIndex, { color: colors.mutedForeground }]}>
                  {index + 1}
                </Text>
              )}
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
  liderBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  liderBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  removeButton: {
    padding: 2,
  },
  grupoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  grupoIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grupoName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  grupoMeta: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
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
