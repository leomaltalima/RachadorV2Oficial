const STORAGE_KEY = "rachador_sessions"

type Sessions = Record<number, number> // grupoId -> participanteId

function getSessions(): Sessions {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Sessions
  } catch {
    return {}
  }
}

export function getSession(grupoId: number): number | null {
  const sessions = getSessions()
  return sessions[grupoId] ?? null
}

export function setSession(grupoId: number, participanteId: number): void {
  const sessions = getSessions()
  sessions[grupoId] = participanteId
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export function clearSession(grupoId: number): void {
  const sessions = getSessions()
  delete sessions[grupoId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}
