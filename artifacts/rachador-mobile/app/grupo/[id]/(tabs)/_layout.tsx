import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';
import { router, Stack, Tabs, useGlobalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Feather, Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useGetGrupo,
  useAddParticipante,
  getGetGrupoQueryKey,
} from '@workspace/api-client-react';

type ParticipanteExtended = {
  id: number;
  nome: string;
  chavePix?: string | null;
  claimado?: boolean;
  meu?: boolean;
};

function ParticipantesModal({ grupoId, visible, onClose }: { grupoId: number; visible: boolean; onClose: () => void }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: grupo } = useGetGrupo(grupoId);
  const addParticipante = useAddParticipante();

  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState('');
  const [pix, setPix] = useState('');

  const handleAdd = async () => {
    if (!nome.trim()) return;
    try {
      await addParticipante.mutateAsync({
        grupoId,
        data: { nome: nome.trim(), chavePix: pix.trim() || null },
      });
      queryClient.invalidateQueries({ queryKey: getGetGrupoQueryKey(grupoId) });
      setNome('');
      setPix('');
      setShowForm(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Erro', 'Não foi possível adicionar o participante.');
    }
  };

  const participantes = (grupo?.participantes ?? []) as ParticipanteExtended[];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[s.modalRoot, { backgroundColor: colors.background }]}>
        {/* Handle bar */}
        <View style={[s.handle, { backgroundColor: colors.border }]} />

        {/* Header */}
        <View style={[s.modalHeader, { borderBottomColor: colors.border }]}>
          <Text style={[s.modalTitle, { color: colors.foreground }]}>
            Participantes ({participantes.length})
          </Text>
          <Pressable onPress={onClose} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={colors.mutedForeground} />
          </Pressable>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[s.modalContent, { paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Participants list */}
          {participantes.map((p) => {
            const isMe = !!p.meu;
            const locked = !!p.claimado && !isMe;
            return (
              <View
                key={p.id}
                style={[
                  s.participanteRow,
                  {
                    backgroundColor: isMe ? colors.primary + '12' : colors.card,
                    borderColor: isMe ? colors.primary : colors.border,
                    borderWidth: isMe ? 1.5 : 1,
                    opacity: locked ? 0.55 : 1,
                  },
                ]}
              >
                <View style={[s.avatar, { backgroundColor: isMe ? colors.primary + '22' : colors.secondary }]}>
                  <Text style={[s.avatarText, { color: isMe ? colors.primary : colors.foreground }]}>
                    {p.nome.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.pNome, { color: colors.foreground }]}>{p.nome}</Text>
                    {isMe && (
                      <View style={[s.meBadge, { backgroundColor: colors.primary + '22' }]}>
                        <Text style={[s.meBadgeText, { color: colors.primary }]}>você</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.pSub, { color: colors.mutedForeground }]} numberOfLines={1}>
                    {locked
                      ? 'Vinculado a uma conta'
                      : isMe
                      ? 'Sua conta'
                      : p.chavePix
                      ? `Pix: ${p.chavePix}`
                      : 'Sem chave Pix'}
                  </Text>
                </View>
                {locked && <Ionicons name="lock-closed-outline" size={15} color={colors.mutedForeground} />}
              </View>
            );
          })}

          {/* Add participant */}
          {!showForm ? (
            <Pressable
              style={({ pressed }) => [
                s.addBtn,
                { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => setShowForm(true)}
            >
              <Ionicons name="person-add-outline" size={18} color={colors.mutedForeground} />
              <Text style={[s.addBtnText, { color: colors.mutedForeground }]}>Adicionar integrante</Text>
            </Pressable>
          ) : (
            <View style={[s.form, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.formTitle, { color: colors.foreground }]}>Novo integrante</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.input, borderColor: nome ? colors.primary : colors.border, color: colors.foreground }]}
                placeholder="Nome"
                placeholderTextColor={colors.mutedForeground}
                value={nome}
                onChangeText={setNome}
                autoFocus
                returnKeyType="next"
              />
              <TextInput
                style={[s.input, { backgroundColor: colors.input, borderColor: pix ? colors.primary : colors.border, color: colors.foreground }]}
                placeholder="Chave Pix (opcional)"
                placeholderTextColor={colors.mutedForeground}
                value={pix}
                onChangeText={setPix}
                autoCapitalize="none"
                keyboardType="email-address"
                returnKeyType="done"
                onSubmitEditing={handleAdd}
              />
              <View style={s.formActions}>
                <Pressable
                  style={({ pressed }) => [s.cancelBtn, { borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}
                  onPress={() => { setShowForm(false); setNome(''); setPix(''); }}
                >
                  <Text style={[s.cancelText, { color: colors.mutedForeground }]}>Cancelar</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [
                    s.confirmBtn,
                    { backgroundColor: colors.primary, opacity: !nome.trim() || addParticipante.isPending ? 0.45 : pressed ? 0.85 : 1, flex: 1 },
                  ]}
                  onPress={handleAdd}
                  disabled={!nome.trim() || addParticipante.isPending}
                >
                  {addParticipante.isPending ? (
                    <ActivityIndicator color={colors.primaryForeground} />
                  ) : (
                    <Text style={[s.confirmText, { color: colors.primaryForeground }]}>Adicionar</Text>
                  )}
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function HeaderRight({ grupoId }: { grupoId: number }) {
  const { data: grupo } = useGetGrupo(grupoId);
  const colors = useColors();
  const [modalVisible, setModalVisible] = useState(false);

  const copyCode = async () => {
    if (!grupo) return;
    await Clipboard.setStringAsync(grupo.codigoConvite);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Código copiado!', `Código: ${grupo.codigoConvite}`);
  };

  return (
    <>
      <View style={styles.headerRight}>
        <Pressable onPress={copyCode} style={styles.headerButton}>
          <Feather name="copy" size={20} color={colors.foreground} />
        </Pressable>
        <Pressable onPress={() => setModalVisible(true)} style={styles.headerButton}>
          <Feather name="users" size={20} color={colors.foreground} />
        </Pressable>
      </View>
      <ParticipantesModal
        grupoId={grupoId}
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
      />
    </>
  );
}

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="despesas">
        <Icon sf={{ default: 'list.bullet', selected: 'list.bullet.rectangle.fill' }} />
        <Label>Despesas</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="saldos">
        <Icon sf={{ default: 'arrow.left.arrow.right', selected: 'arrow.left.arrow.right.circle.fill' }} />
        <Label>Saldos</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="historico">
        <Icon sf={{ default: 'clock', selected: 'clock.fill' }} />
        <Label>Histórico</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout({ grupoId }: { grupoId: number }) {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: 'absolute',
          backgroundColor: isIOS ? 'transparent' : colors.background,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarLabelStyle: {
          fontFamily: 'PlusJakartaSans_500Medium',
          fontSize: 11,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={100}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="despesas"
        options={{
          title: 'Despesas',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="list.bullet" tintColor={color} size={22} />
            ) : (
              <Feather name="list" size={22} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="saldos"
        options={{
          title: 'Saldos',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="arrow.left.arrow.right" tintColor={color} size={22} />
            ) : (
              <Feather name="refresh-cw" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="clock" tintColor={color} size={22} />
            ) : (
              <Feather name="clock" size={22} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function GroupTabsLayout() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const grupoId = parseInt(id ?? '0', 10);
  const { data: grupo } = useGetGrupo(grupoId);

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: grupo?.nome ?? 'Grupo',
          headerBackTitle: 'Início',
          headerRight: () => <HeaderRight grupoId={grupoId} />,
        }}
      />
      {isLiquidGlassAvailable() ? (
        <NativeTabLayout />
      ) : (
        <ClassicTabLayout grupoId={grupoId} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  headerRight: {
    flexDirection: 'row',
    gap: 16,
    paddingRight: 4,
  },
  headerButton: {
    padding: 4,
  },
});

const s = StyleSheet.create({
  modalRoot: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
  },
  closeBtn: {
    padding: 4,
  },
  modalContent: {
    padding: 16,
    gap: 8,
  },
  participanteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  pNome: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  pSub: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 1,
  },
  meBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  meBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    gap: 8,
    marginTop: 4,
  },
  addBtnText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  form: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    marginTop: 4,
  },
  formTitle: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
  input: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  formActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  cancelBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
  },
  confirmBtn: {
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
});
