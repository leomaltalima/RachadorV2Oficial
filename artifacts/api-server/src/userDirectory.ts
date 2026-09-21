import { clerkClient } from "@clerk/express";
import { db, usuariosTable, type Usuario } from "@workspace/db";

type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

function userValues(user: ClerkUser) {
  const email = user.primaryEmailAddress?.emailAddress ?? null;
  const nome = user.fullName?.trim() || email?.split("@")[0] || "Usuário";
  const loginGoogle = user.externalAccounts.some((account) =>
    account.provider.toLowerCase().includes("google"),
  );

  return {
    nome,
    email,
    imagemUrl: user.hasImage ? user.imageUrl : null,
    clerkUserId: user.id,
    loginGoogle,
    loginEmailSenha: user.passwordEnabled,
    emailVerificado: user.primaryEmailAddress?.verification?.status === "verified",
    bloqueado: user.banned || user.locked,
    ultimoLoginEm: user.lastSignInAt ? new Date(user.lastSignInAt) : null,
    atualizadoEm: new Date(),
  };
}

export async function syncClerkUser(user: ClerkUser): Promise<Usuario> {
  const values = userValues(user);

  const [saved] = await db
    .insert(usuariosTable)
    .values(values)
    .onConflictDoUpdate({
      target: usuariosTable.clerkUserId,
      set: values,
    })
    .returning();

  if (!saved) throw new Error("Não foi possível sincronizar o usuário.");
  return saved;
}

export async function syncAuthenticatedUser(clerkUserId: string): Promise<Usuario> {
  const user = await clerkClient.users.getUser(clerkUserId);
  return syncClerkUser(user);
}

export async function syncAllClerkUsers(): Promise<number> {
  const pageSize = 100;
  let offset = 0;
  let synced = 0;

  while (true) {
    const page = await clerkClient.users.getUserList({
      limit: pageSize,
      offset,
      orderBy: "+created_at",
    });
    for (const user of page.data) {
      await syncClerkUser(user);
      synced += 1;
    }
    offset += page.data.length;
    if (page.data.length < pageSize || offset >= page.totalCount) break;
  }

  return synced;
}