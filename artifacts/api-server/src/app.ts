import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { WebhookHandlers } from "./webhookHandlers";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must come before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res): Promise<void> => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Assinatura Stripe ausente." });
      return;
    }
    try {
      await WebhookHandlers.processWebhook(req.body as Buffer, Array.isArray(signature) ? signature[0] : signature);
      res.status(200).json({ received: true });
    } catch (error) {
      logger.error({ err: error }, "Erro ao processar webhook Stripe");
      res.status(400).json({ error: "Webhook Stripe inválido." });
    }
  },
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
