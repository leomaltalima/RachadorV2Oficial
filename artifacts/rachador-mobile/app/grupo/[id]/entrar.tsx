import React, { useEffect, useState } from 'react';
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
import { useColors } from '@/hooks/useColors';
import { useSession } from '@/context/SessionContext';
import {
  useGetGrupo,
  useAddParticipante,
} from '@workspace/api-client-react';
import type { Participante } from '@workspace/api-client-react';
import {
  requestPushPermissionAndGetToken,
  registerPushToken,
} from '@/hooks/usePushNotifications';

type ParticipanteExtended = Participante & { claimado?: boolean; meu?: boolean };

const API_BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

async function setupPushNotifications(
  grupoId: number,
  participanteId: number,
  codigoConvite: string,
) {
  if (Platform.OS === 'web') return;
  try {
    const token = await requestPushPermissionAndGetToken();
    if (token) {
      await registerPushToken(API_BASE_URL, participanteId, grupoId, codigoConvite, token);
    }
  } catch {
    // Non-critical — ignore
  }
}

export default function EntrarScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { getSession, setSession, sessionsLoaded } = useSession();
  const { data: grupo, isLoading, isError } = useGetGrupo(grupoId);
  const addParticipante = useAddParticipante();

  const [showNewForm, setShowNewForm] = useState(false);
  const [newNome, setNewNome] = useState('');
  const [newPix, setNewPix] = useState('');

  // If already has a session for this group, skip straight in
  useEffect(() => {
    if (!sessionsLoaded) return;
    const existing = getSession(grupoId);
    if (existing !== null) {
      router.replace(`/grupo/${grupoId}/despesas`);
    }
  }, [sessionsLoaded, grupoId]);

  const selectParticipante = async (p: ParticipanteExtended) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setSession(grupoId, p.id);
    // Request push permission after session is set (fire-and-forget)
    setupPushNotifications(grupoId, p.id, grupo?.codigoConvite ?? '');
    router.replace(`/grupo/${grupoId}/despesas`);
  };

  const handleAddNew = async () => {
    if (!newNome.trim()) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const novo = await addParticipante.mutateAsync({
        grupoId,
        data: { nome: newNome.trim(), chavePix: newPix.trim() || null },
      });
      await setSession(grupoId, novo.id);
      // Request push permission after session is set (fire-and-forget)
      setupPushNotifications(grupoId, novo.id, grupo?.codigoConvite ?? '');
      router.replace(`/grupo/${grupoId}/despesas`);
    } catch {
      Alert.alert('Erro', 'Não foi possível entrar no grupo. Tente novamente.');
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (isError || !grupo) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Ionicons name="alert-circle-outline" size={40} color={colors.destructive} />
        <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
          Grupo não encontrado
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.content,
        { paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 24 },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Group info */}
      <View style={[styles.groupCard, { backgroundColor: colors.accent, borderColor: colors.border }]}>
        <View style={[styles.groupIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="people" size={24} color={colors.primaryForeground} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.groupName, { color: colors.foreground }]}>{grupo.nome}</Text>
          <Text style={[styles.groupCode, { color: colors.mutedForeground }]}>
            Código: {grupo.codigoConvite}
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Quem é você?</Text>
      <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
        Selecione seu nome na lista abaixo
      </Text>

      {/* Participants list */}
      <View style={styles.participantesList}>
        {(grupo.participantes as ParticipanteExtended[]).map((p) => {
          const isMe = !!p.meu;
          const lockedByOther = !!p.claimado && !isMe;

          if (lockedByOther) {
            return (
              <View
                key={p.id}
                style={[
                  styles.participanteItem,
                  {
                    backgroundColor: colors.muted + '66',
                    borderColor: colors.border,
                    opacity: 0.55,
                  },
                ]}
              >
                <View style={[styles.participanteAvatar, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.participanteAvatarText, { color: colors.mutedForeground }]}>
                    {p.nome.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.participanteNome, { color: colors.mutedForeground }]}>{p.nome}</Text>
                  <Text style={[styles.participantePix, { color: colors.mutedForeground }]}>
                    Já vinculado a uma conta
                  </Text>
                </View>
                <Ionicons name="lock-closed" size={16} color={colors.mutedForeground} />
              </View>
            );
          }

          return (
            <Pressable
              key={p.id}
              style={({ pressed }) => [
                styles.participanteItem,
                {
                  backgroundColor: isMe ? colors.primary + '12' : colors.card,
                  borderColor: isMe ? colors.primary : colors.border,
                  borderWidth: isMe ? 2 : 1,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              onPress={() => selectParticipante(p)}
              testID={`participante-${p.id}`}
            >
              <View style={[styles.participanteAvatar, { backgroundColor: isMe ? colors.primary + '22' : colors.secondary }]}>
                <Text style={[styles.participanteAvatarText, { color: isMe ? colors.primary : colors.foreground }]}>
                  {p.nome.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.participanteNome, { color: colors.foreground }]}>{p.nome}</Text>
                <Text style={[styles.participantePix, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {isMe ? 'Sua conta — toque para entrar' : p.chavePix ? `Pix: ${p.chavePix}` : ''}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isMe ? colors.primary : colors.mutedForeground} />
            </Pressable>
          );
        })}
      </View>

      {/* Not in the list */}
      {!showNewForm ? (
        <Pressable
          style={({ pressed }) => [
            styles.notListedButton,
            { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => setShowNewForm(true)}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.mutedForeground} />
          <Text style={[styles.notListedText, { color: colors.mutedForeground }]}>
            Não estou na lista
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.newForm, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.newFormTitle, { color: colors.foreground }]}>Entrar como novo participante</Text>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: newNome ? colors.primary : colors.border,
                color: colors.foreground,
              },
            ]}
            value={newNome}
            onChangeText={setNewNome}
            placeholder="Seu nome"
            placeholderTextColor={colors.mutedForeground}
            autoFocus
            returnKeyType="next"
          />
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.input,
                borderColor: newPix ? colors.secondary : colors.border,
                color: colors.foreground,
              },
            ]}
            value={newPix}
            onChangeText={setNewPix}
            placeholder="Chave Pix (opcional)"
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="done"
            onSubmitEditing={handleAddNew}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <View style={styles.newFormActions}>
            <Pressable
              style={({ pressed }) => [
                styles.cancelButton,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => setShowNewForm(false)}
            >
              <Text style={[styles.cancelButtonText, { color: colors.mutedForeground }]}>Cancelar</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.confirmButton,
                {
                  backgroundColor: colors.primary,
                  opacity: !newNome.trim() || addParticipante.isPending ? 0.45 : pressed ? 0.85 : 1,
                  flex: 1,
                },
              ]}
              onPress={handleAddNew}
              disabled={!newNome.trim() || addParticipante.isPending}
            >
              {addParticipante.isPending ? (
                <ActivityIndicator color={colors.primaryForeground} />
              ) : (
                <Text style={[styles.confirmButtonText, { color: colors.primaryForeground }]}>Entrar</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  errorText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  content: {
    padding: 20,
    gap: 16,
  },
  groupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  groupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupName: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
  },
  groupCode: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 20,
    marginTop: 8,
  },
  sectionSubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    marginTop: -8,
  },
  participantesList: {
    gap: 8,
  },
  participanteItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  participanteAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  participanteAvatarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  participanteNome: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
  },
  participantePix: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  notListedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 8,
  },
  notListedText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  newForm: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  newFormTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  newFormActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelButton: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  confirmButton: {
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
});
