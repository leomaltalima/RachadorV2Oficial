import { useAuth } from '@clerk/expo';
import { Redirect, Stack } from 'expo-router';
import { useColors } from '@/hooks/useColors';

export default function HomeLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useColors();

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
