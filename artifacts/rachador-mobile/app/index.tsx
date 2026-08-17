import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
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
import { getGrupoByCodigo } from '@workspace/api-client-react';

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleEnter = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const grupo = await getGrupoByCodigo(trimmed);
      router.push(`/grupo/${grupo.id}/entrar`);
    } catch {
      Alert.alert('Grupo não encontrado', 'Verifique o código e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/criar');
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: Platform.OS === 'web' ? 67 : insets.top + 24,
          paddingBottom: Platform.OS === 'web' ? 34 : insets.bottom + 16,
        },
      ]}
    >
      {/* Brand header */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="cut-outline" size={26} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.logoText, { color: colors.foreground }]}>rachador</Text>
        </View>
        <Text style={[styles.tagline, { color: colors.mutedForeground }]}>
          Divida as contas sem estresse
        </Text>
      </View>

      {/* Code entry card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardTitle, { color: colors.foreground }]}>Entrar com código</Text>
        <Text style={[styles.cardSubtitle, { color: colors.mutedForeground }]}>
          Peça o código de convite para alguém do grupo
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
          placeholder="AB12CD34"
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={8}
          returnKeyType="go"
          onSubmitEditing={handleEnter}
          testID="code-input"
        />

        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: colors.primary, opacity: (!code.trim() || loading) ? 0.45 : pressed ? 0.85 : 1 },
          ]}
          onPress={handleEnter}
          disabled={!code.trim() || loading}
          testID="enter-button"
        >
          {loading ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>
              Entrar no grupo
            </Text>
          )}
        </Pressable>
      </View>

      {/* Divider */}
      <View style={styles.dividerRow}>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>ou</Text>
        <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
      </View>

      {/* Create group */}
      <Pressable
        style={({ pressed }) => [
          styles.secondaryButton,
          { borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
        onPress={handleCreate}
        testID="create-button"
      >
        <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
        <Text style={[styles.secondaryButtonText, { color: colors.primary }]}>
          Criar novo grupo
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    marginTop: 32,
    marginBottom: 40,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  logoIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  card: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    gap: 12,
  },
  cardTitle: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
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
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
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
