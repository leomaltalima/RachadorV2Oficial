import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, useColorScheme, View } from 'react-native';
import { router, Stack, Tabs, useGlobalSearchParams } from 'expo-router';
import { BlurView } from 'expo-blur';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Feather } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGetGrupo } from '@workspace/api-client-react';

function HeaderRight({ grupoId }: { grupoId: number }) {
  const { data: grupo } = useGetGrupo(grupoId);
  const colors = useColors();

  const copyCode = async () => {
    if (!grupo) return;
    await Clipboard.setStringAsync(grupo.codigoConvite);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Código copiado!', `Código: ${grupo.codigoConvite}`);
  };

  return (
    <View style={styles.headerRight}>
      <Pressable onPress={copyCode} style={styles.headerButton}>
        <Feather name="copy" size={20} color={colors.foreground} />
      </Pressable>
    </View>
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
      {/* Configure the parent Stack screen header */}
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
