import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'rachador_sessions';

/** grupoId (as string key) → participanteId */
type Sessions = Record<string, number>;

interface SessionContextType {
  getSession: (grupoId: number) => number | null;
  setSession: (grupoId: number, participanteId: number) => Promise<void>;
  clearSession: (grupoId: number) => Promise<void>;
  sessionsLoaded: boolean;
}

const SessionContext = createContext<SessionContextType | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [sessions, setSessions] = useState<Sessions>({});
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value) {
        try {
          setSessions(JSON.parse(value) as Sessions);
        } catch {}
      }
      setSessionsLoaded(true);
    });
  }, []);

  const getSession = useCallback(
    (grupoId: number): number | null => sessions[String(grupoId)] ?? null,
    [sessions],
  );

  const setSession = useCallback(
    async (grupoId: number, participanteId: number) => {
      const next = { ...sessions, [String(grupoId)]: participanteId };
      setSessions(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [sessions],
  );

  const clearSession = useCallback(
    async (grupoId: number) => {
      const next = { ...sessions };
      delete next[String(grupoId)];
      setSessions(next);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    },
    [sessions],
  );

  return (
    <SessionContext.Provider value={{ getSession, setSession, clearSession, sessionsLoaded }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
