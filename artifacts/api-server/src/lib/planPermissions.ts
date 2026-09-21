import { and, eq } from "drizzle-orm";
import type { Response } from "express";
import { getAuth } from "@clerk/express";
import { db, assinaturasTable, usuariosTable } from "@workspace/db";
import { syncAuthenticatedUser } from "../userDirectory";

export const PLAN_FEATURES = {
  FREE: {
    groups: true,
    manualExpenses: true,
    voiceExpenses: false,
    receiptScanning: false,
  },
  PRO: {
    groups: true,
    manualExpenses: true,
    voiceExpenses: false,
    receiptScanning: true,
  },
  MASTER: {
    groups: true,
    manualExpenses: true,
    voiceExpenses: true,
    receiptScanning: true,
  },
} as const;

export type FeatureName = keyof typeof PLAN_FEATURES.FREE;

export async function hasFeature(userId: string, feature: FeatureName): Promise<boolean> {
  const [user] = await db
    .select({ id: usuariosTable.id })
    .from(usuariosTable)
    .where(eq(usuariosTable.clerkUserId, userId));
  if (!user) return PLAN_FEATURES.FREE[feature];

  const [subscription] = await db
    .select({ status: assinaturasTable.status, plano: assinaturasTable.plano })
    .from(assinaturasTable)
    .where(and(eq(assinaturasTable.usuarioId, user.id), eq(assinaturasTable.status, "ACTIVE")));

  if (subscription?.status !== "ACTIVE") return PLAN_FEATURES.FREE[feature];
  return subscription.plano === "MASTER"
    ? PLAN_FEATURES.MASTER[feature]
    : PLAN_FEATURES.PRO[feature];
}

export async function requireFeatureAccess(
  req: Parameters<typeof getAuth>[0],
  res: Response,
  feature: Exclude<FeatureName, "groups" | "manualExpenses">,
): Promise<boolean> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para usar este recurso." });
    return false;
  }

  await syncAuthenticatedUser(userId);
  if (!(await hasFeature(userId, feature))) {
    res.status(403).json({
      error: "PLAN_REQUIRED",
      message: feature === "voiceExpenses"
        ? "Esta funcionalidade é exclusiva do plano Rachador Master."
        : "Esta funcionalidade exige um plano pago do Rachador.",
      feature,
    });
    return false;
  }
  return true;
}
