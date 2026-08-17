---
name: Rachador mobile architecture
description: Key decisions and patterns for the Expo mobile app built in artifacts/rachador-mobile
---

# Rachador Mobile — Key Decisions

## Session management
- AsyncStorage key `rachador_sessions` stores `Record<string, number>` — grupoId (string) → participanteId (number)
- `SessionProvider` / `useSession` live in `context/SessionContext.tsx`
- After entering a group, session is set then `router.replace('/grupo/${grupoId}/despesas')`

## API base URL
- Set via `setBaseUrl()` from `@workspace/api-client-react` in `app/_layout.tsx`
- Value: `https://${process.env.EXPO_PUBLIC_DOMAIN}` — injected by the dev script, never hardcoded

## Font loading
- `@expo-google-fonts/plus-jakarta-sans` — loaded with `useFonts()` in `_layout.tsx`
- `SplashScreen.preventAutoHideAsync()` + `hideAsync()` pattern keeps splash until fonts ready

## expo-clipboard version
- Must be `~8.0.8` for Expo SDK compatibility (57.x installed by default conflicts)

## Navigation structure
- Root Stack: `index`, `criar`, `grupo/[id]/entrar`, `grupo/[id]/(tabs)` (3 tabs), `grupo/[id]/nova-despesa`
- Tab names: `despesas`, `saldos`, `historico`
- NativeTabs for iOS 26+, classic Tabs fallback

**Why:** Keeps the mobile shell thin — all business logic lives in the API server; the app is purely UI + session.
