import React, { useCallback, useEffect, useState } from 'react';
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
import { useSignUp, useSSO } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

const useWarmUpBrowser = () => {
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    void WebBrowser.warmUpAsync();
    return () => { void WebBrowser.coolDownAsync(); };
  }, []);
};

export default function SignUpScreen() {
  useWarmUpBrowser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { signUp, errors, fetchStatus } = useSignUp();
  const { startSSOFlow } = useSSO();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleEmailSignUp = async () => {
    const { error } = await signUp.password({ emailAddress: email, password });
    if (error) return;
    if (!error) await signUp.verifications.sendEmailCode();
  };

  const handleVerify = async () => {
    await signUp.verifications.verifyEmailCode({ code: verifyCode });
    if (signUp.status === 'complete') {
      await signUp.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) return;
          const url = decorateUrl('/');
          if (url.startsWith('http')) return;
          router.replace('/');
        },
      });
    }
  };

  const handleGoogle = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: AuthSession.makeRedirectUri(),
      });
      if (createdSessionId) {
        await setActive!({
          session: createdSessionId,
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) return;
            router.replace('/');
          },
        });
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível entrar com Google. Tente novamente.');
    } finally {
      setGoogleLoading(false);
    }
  }, [startSSOFlow, router]);

  const emailError = errors?.fields?.emailAddress?.message;
  const passwordError = errors?.fields?.password?.message;
  const codeError = errors?.fields?.code?.message;
  const isLoading = fetchStatus === 'fetching';

  // Email verification step
  if (
    signUp.status === 'missing_requirements' &&
    signUp.unverifiedFields?.includes('email_address') &&
    signUp.missingFields?.length === 0
  ) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, gap: 24 }]}>
        <View style={styles.header}>
          <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
            <Ionicons name="mail-outline" size={26} color={colors.primaryForeground} />
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>Verificar e-mail</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Enviamos um código para {email}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: verifyCode ? colors.primary : colors.border, color: colors.foreground }]}
            value={verifyCode}
            onChangeText={setVerifyCode}
            placeholder="Código de verificação"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            autoFocus
          />
          {codeError && <Text style={[styles.errorText, { color: colors.destructive }]}>{codeError}</Text>}
          <Pressable
            style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: isLoading ? 0.55 : pressed ? 0.85 : 1 }]}
            onPress={handleVerify}
            disabled={isLoading}
          >
            {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Verificar</Text>}
          </Pressable>
          <Pressable onPress={() => signUp.verifications.sendEmailCode()} style={styles.linkRow}>
            <Text style={[styles.linkText, { color: colors.primary }]}>Reenviar código</Text>
          </Pressable>
        </View>

        {/* Clerk captcha required for sign-up bot protection */}
        <View nativeID="clerk-captcha" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24, gap: 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Brand header */}
      <View style={styles.header}>
        <View style={[styles.logoIcon, { backgroundColor: colors.primary }]}>
          <Ionicons name="cut-outline" size={26} color={colors.primaryForeground} />
        </View>
        <Text style={[styles.logoText, { color: colors.foreground }]}>rachador</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Crie sua conta para começar</Text>
      </View>

      {/* Form card */}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {/* Google */}
        <Pressable
          style={({ pressed }) => [styles.googleButton, { borderColor: colors.border, backgroundColor: colors.card, opacity: googleLoading ? 0.55 : pressed ? 0.8 : 1 }]}
          onPress={handleGoogle}
          disabled={googleLoading}
        >
          {googleLoading ? (
            <ActivityIndicator color={colors.foreground} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color="#4285F4" />
              <Text style={[styles.googleButtonText, { color: colors.foreground }]}>Continuar com Google</Text>
            </>
          )}
        </Pressable>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.dividerText, { color: colors.mutedForeground }]}>ou</Text>
          <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
        </View>

        {/* Email */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>E-mail</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: email ? colors.primary : colors.border, color: colors.foreground }]}
            value={email}
            onChangeText={setEmail}
            placeholder="seu@email.com"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            returnKeyType="next"
          />
          {emailError && <Text style={[styles.errorText, { color: colors.destructive }]}>{emailError}</Text>}
        </View>

        {/* Password */}
        <View style={styles.fieldGroup}>
          <Text style={[styles.label, { color: colors.foreground }]}>Senha</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.input, borderColor: password ? colors.primary : colors.border, color: colors.foreground }]}
            value={password}
            onChangeText={setPassword}
            placeholder="Mínimo 8 caracteres"
            placeholderTextColor={colors.mutedForeground}
            secureTextEntry
            autoComplete="new-password"
            returnKeyType="go"
            onSubmitEditing={handleEmailSignUp}
          />
          {passwordError && <Text style={[styles.errorText, { color: colors.destructive }]}>{passwordError}</Text>}
        </View>

        {/* Submit */}
        <Pressable
          style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary, opacity: (!email || !password || isLoading) ? 0.45 : pressed ? 0.85 : 1 }]}
          onPress={handleEmailSignUp}
          disabled={!email || !password || isLoading}
        >
          {isLoading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Criar conta</Text>}
        </Pressable>
      </View>

      {/* Clerk captcha required for sign-up bot protection */}
      <View nativeID="clerk-captcha" />

      {/* Sign in link */}
      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.mutedForeground }]}>Já tem conta?</Text>
        <Pressable onPress={() => router.push('/(auth)/sign-in')}>
          <Text style={[styles.linkText, { color: colors.primary }]}>Entrar</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },
  header: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  logoIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  logoText: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 30,
    letterSpacing: -1,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 22,
    marginTop: 8,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
    textAlign: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 14,
  },
  googleButton: {
    height: 50,
    borderRadius: 10,
    borderWidth: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  googleButtonText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 15,
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
    fontSize: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 15,
  },
  errorText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginTop: 2,
  },
  primaryButton: {
    height: 50,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryButtonText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  linkRow: {
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    alignItems: 'center',
  },
  footerText: {
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 14,
  },
  linkText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
});
