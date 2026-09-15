import type Stripe from "stripe";
import {
  markPaymentFailed,
  markSubscriptionCanceled,
  upsertSubscription,
} from "./billing";
import { getStripeSync, getUncachableStripeClient } from "./stripeClient";

function clerkUserIdFromSubscription(subscription: Stripe.Subscription) {
  return subscription.metadata?.clerkUserId || subscription.metadata?.clerk_user_id || null;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const clerkUserId = clerkUserIdFromSubscription(subscription);
  if (!clerkUserId) return;
  const price = subscription.items.data[0]?.price;
  const currentItem = subscription.items.data[0];
  const periodStart = currentItem?.current_period_start ?? subscription.billing_cycle_anchor;
  const periodEnd = currentItem?.current_period_end ?? subscription.billing_cycle_anchor;
  const interval = price?.recurring?.interval === "year" ? "yearly" : price?.recurring?.interval === "month" ? "monthly" : null;
  await upsertSubscription({
    clerkUserId,
    customerId: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    subscriptionId: subscription.id,
    status: subscription.status,
    interval,
    start: subscription.start_date ? new Date(subscription.start_date * 1000) : null,
    periodStart: new Date(periodStart * 1000),
    periodEnd: new Date(periodEnd * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string) {
    if (!Buffer.isBuffer(payload)) throw new Error("O payload do webhook Stripe precisa ser um Buffer.");
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    const stripe = await getUncachableStripeClient();
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      await (async () => {
        const module = await import("./stripeClient");
        return module.getStripeWebhookSecret();
      })(),
    );

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            typeof session.subscription === "string" ? session.subscription : session.subscription.id,
          );
          if (session.metadata?.clerkUserId && !subscription.metadata?.clerkUserId) {
            subscription.metadata.clerkUserId = session.metadata.clerkUserId;
          }
          await syncSubscription(subscription);
          console.info("[billing_event]", { event: "subscription_created", clerkUserId: session.metadata?.clerkUserId });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await syncSubscription(event.data.object as Stripe.Subscription);
        console.info("[billing_event]", { event: event.type === "customer.subscription.updated" ? "subscription_renewed" : "subscription_created" });
        break;
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await markSubscriptionCanceled(subscription.id);
        console.info("[billing_event]", { event: "subscription_cancelled" });
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
          parent?: { subscription_details?: { subscription?: string | Stripe.Subscription | null } | null } | null;
        };
        const subscription = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
        if (subscription) {
          await markPaymentFailed(typeof subscription === "string" ? subscription : subscription.id);
        }
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice & {
          subscription?: string | Stripe.Subscription | null;
          parent?: { subscription_details?: { subscription?: string | Stripe.Subscription | null } | null } | null;
        };
        const subscriptionId = invoice.subscription ?? invoice.parent?.subscription_details?.subscription;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(
            typeof subscriptionId === "string" ? subscriptionId : subscriptionId.id,
          );
          await syncSubscription(subscription);
        }
        break;
      }
    }
  }
}