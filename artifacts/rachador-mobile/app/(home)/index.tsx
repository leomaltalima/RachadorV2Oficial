import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useSession } from '@/context/SessionContext';
import { getGrupoByCodigo } from '@workspace/api-client-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth, useUser, useClerk } from '@clerk/expo';

interface MeuGrupo {
  grupo: {
    id: number;
    nome: string;
    codigoConvite: string;
    criadoEm: string;
    participantes: { id: number; nome: string; chavePix: string | null }[];
  };
  participante: { id: number; nome: string };
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [leavingId, setLeavingId] = useState<number | null>(null);
  const inputRef = useRef<TextInput>(null);
  const { setSession, clearSession } = useSession();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const queryClient = useQueryClient();

  // Fetch user's groups (auth via Bearer token — no browser cookie jar in mobile)
  const { data: meusGrupos, isLoading: loadingGrupos } = useQuery<MeuGrupo[]>({
    queryKey: ['me/grupos'],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/me/grupos`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!res.ok) throw new Error('Erro ao buscar grupos');
      return res.json();
    },
    enabled: !!isSignedIn,
  });

  const handleEnterGroup = async (g: MeuGrupo) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setSession(g.grupo.id, g.participante.id);
    router.push(`/grupo/${g.grupo.id}/despesas`);
  };

  const handleLeaveGroup = async (g: MeuGrupo) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (leavingId === g.participante.id) {
      // Second tap — confirm
      try {
        await fetch(`https://${process.env.EXPO_PUBLIC_DOMAIN}/api/participantes/${g.participante.id}/leave`, {
          method: 'DELETE',
        });
        clearSession(g.grupo.id);
        queryClient.invalidateQueries({ queryKey: ['me/grupos'] });
      } catch {
        Alert.alert('Erro', 'Não foi possível sair do grupo.');
      }
      setLeavingId(null);
    } else {
      setLeavingId(g.participante.id);
    }
  };

  const handleEnterByCode = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCodeLoading(true);
    try {
      const grupo = await getGrupoByCodigo(trimmed);
      router.push(`/grupo/${grupo.id}/entrar`);
    } catch {
      Alert.alert('Grupo não encontrado', 'Verifique o código e tente novamente.');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleCreate = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/criar');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const displayName = user?.firstName ?? user?.emailAddresses?.[0]?.emailAddress ?? 'Usuário';
  const displayEmail = user?.emailAddresses?.[0]?.emailAddress;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 24,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 16,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Brand header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Image
            source={require('../../assets/images/logo-transparent.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={[styles.logoText, { color: colors.foreground }]}>rachador</Text>
        </View>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Divida as contas sem estresse
        </Text>
      </View>

      {/* User chip */}
      <View style={[styles.userChip, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.userAvatar, { backgroundColor: colors.primary + '22' }]}>
          <Text style={[styles.userAvatarText, { color: colors.primary }]}>
            {displayName.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.userName, { color: colors.foreground }]} numberOfLines={1}>{displayName}</Text>
          {displayEmail && (
            <Text style={[styles.userEmail, { color: colors.mutedForeground }]} numberOfLines={1}>{displayEmail}</Text>
          )}
        </View>
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutButton, { opacity: pressed ? 0.6 : 1 }]}
          hitSlop={8}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/* My groups */}
      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>Meus grupos</Text>
        {loadingGrupos ? (
          <View style={styles.centeredRow}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : meusGrupos && meusGrupos.length > 0 ? (
          <View style={styles.groupsList}>
            {meusGrupos.map(g => {
              const confirming = leavingId === g.participante.id;
              return (
                <View key={g.grupo.id} style={styles.groupRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.groupItem,
                      { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.8 : 1 },
                    ]}
                    onPress={() => handleEnterGroup(g)}
                  >
                    <View style={[styles.groupIcon, { backgroundColor: colors.primary + '18' }]}>
                      <Ionicons name="people" size={20} color={colors.primary} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.groupName, { color: colors.foreground }]} numberOfLines={1}>
                        {g.grupo.nome}
                      </Text>
                      <Text style={[styles.groupMeta, { color: colors.mutedForeground }]}>
                        Como {g.participante.nome} · {g.grupo.participantes.length} membros
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.mutedForeground} />
                  </Pressable>

                  <Pressable
                    style={({ pressed }) => [
                      styles.leaveButton,
                      {
                        borderColor: confirming ? colors.destructive : colors.border,
                        backgroundColor: confirming ? colors.destructive : colors.card,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                    onPress={() => handleLeaveGroup(g)}
                  >
                    <Ionicons
                      name="exit-outline"
                      size={16}
                      color={confirming ? '#fff' : colors.mutedForeground}
                    />
                    <Text style={[styles.leaveText, { color: confirming ? '#fff' : colors.mutedForeground }]}>
                      {confirming ? 'Confirmar' : 'Sair'}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="people-outline" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Você ainda não está em nenhum grupo
            </Text>
          </View>
        )}
      </View>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>entrar em outro grupo</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Code entry */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Código de convite</Text>
        <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>
          Peça o código de 6 letras para alguém do grupo
        </Text>
        <TextInput
          ref={inputRef}
          style={[
            styles.codeInput,
            {
              borderColor: code ? colors.primary : colors.border,
              backgroundColor: colors.input,
              color: colors.foreground,
            },
          ]}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="ABCDEF"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
          returnKeyType="go"
          onSubmitEditing={handleEnterByCode}
        />
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: (!code.trim() || codeLoading) ? 0.45 : pressed ? 0.85 : 1 },
          ]}
          onPress={handleEnterByCode}
          disabled={!code.trim() || codeLoading}
        >
          {codeLoading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              Entrar no grupo
            </Text>
          )}
        </Pressable>
      </View>

      {/* Create group */}
      <Pressable
        style={({ pressed }) => [
          styles.secondaryButton,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
        onPress={handleCreate}
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
          Criar novo grupo
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    gap: 20,
  },
  header: {
    marginTop: 8,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  logoImage: {
    width: 48,
    height: 48,
    borderRadius: 14,
  },
  logoText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 34,
    letterSpacing: -1.5,
  },
  tagline: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 15,
    marginLeft: 60,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  userName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  userEmail: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 1,
  },
  signOutButton: {
    padding: 4,
  },
  section: {
    gap: 10,
  },
  sectionLabel: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  centeredRow: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  groupsList: {
    gap: 8,
  },
  groupRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  groupItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupName: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  groupMeta: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  leaveButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 54,
  },
  leaveText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  cardSubtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 13,
    marginTop: -4,
  },
  codeInput: {
    height: 56,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 22,
    letterSpacing: 6,
    textAlign: 'center',
  },
  primaryButton: {
    height: 52,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 10,
    borderWidth: 1.5,
    gap: 8,
  },
  secondaryButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
  },
});
