import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { router } from 'expo-router';

// Configure how notifications appear when the app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request push notification permission and return the Expo push token.
 * Returns null on web or if permission is denied.
 */
export async function requestPushPermissionAndGetToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  // Android 8+ requires a notification channel before prompting for permission
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Notificações',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  // NotificationPermissionsStatus extends PermissionResponse which has .granted
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let granted = (existing as any).granted as boolean;

  if (!granted) {
    const result = await Notifications.requestPermissionsAsync();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    granted = (result as any).granted as boolean;
  }

  if (!granted) return null;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}

/**
 * Register the push token with the API for a specific participante.
 * grupoId + codigoConvite act as the group-session credential proving membership.
 */
export async function registerPushToken(
  apiBaseUrl: string,
  participanteId: number,
  grupoId: number,
  codigoConvite: string,
  token: string,
): Promise<void> {
  try {
    await fetch(`${apiBaseUrl}/api/participantes/${participanteId}/push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, grupoId, codigoConvite }),
    });
  } catch {
    // Non-critical — silently ignore failures
  }
}

/**
 * Hook that listens for notification taps and navigates to the correct group.
 * Should be mounted once in the root layout.
 */
export function useNotificationNavigation() {
  const notificationResponseListener = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    // Handle notification taps when app is already open
    notificationResponseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { grupoId?: number };
        if (data?.grupoId) {
          router.push(`/grupo/${data.grupoId}/despesas` as never);
        }
      });

    return () => {
      notificationResponseListener.current?.remove();
    };
  }, []);
}
