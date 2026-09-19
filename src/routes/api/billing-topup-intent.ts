import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import Stripe from "stripe";
import { config } from "@/lib/config";
import { SecuritySystem } from "@/lib/security";
import { withSovereignAuth } from "@/lib/principal-context";
import { registerPaymentIntentBinding } from "@/lib/repositories/billing-security-repository";

const schema = z.object({
  amountUSD: z.number().positive().finite().max(5000),
});

export const Route = createFileRoute("/api/billing-topup-intent")({
  server: {
    handlers: {
      POST: withSovereignAuth("system", "write", async (context, request, body) => {
        const headers = SecuritySystem.injectSecureHeaders(
          new Headers({ "content-type": "application/json" }),
        );
        const rateLimit = await SecuritySystem.checkRateLimitDistributed(
          `billing-topup:${context.tenantId}:${context.userId}:${context.ip}`,
          5,
        );
        if (!rateLimit.allowed) {
          return new Response(
            JSON.stringify({
              error:
                rateLimit.reason === "rate-limit-infrastructure-unavailable"
                  ? "Servicio temporalmente no disponible para operaciones financieras."
                  : "Límite de recargas excedido. Intenta nuevamente más tarde.",
            }),
            {
              status: rateLimit.reason === "rate-limit-infrastructure-unavailable" ? 503 : 429,
              headers,
            },
          );
        }
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: "Monto de recarga inválido." }), {
            status: 400,
            headers,
          });
        }
        const secret = config().STRIPE_SECRET_KEY;
        if (!secret) {
          return new Response(JSON.stringify({ error: "Stripe no configurado en el servidor." }), {
            status: 503,
            headers,
          });
        }
        const stripe = new Stripe(secret, { apiVersion: "2022-11-15" as Stripe.LatestApiVersion });
        const amountMinor = Math.round(parsed.data.amountUSD * 100);
        const requestKey = request.headers.get("idempotency-key")?.trim();
        if (!requestKey || requestKey.length < 16 || requestKey.length > 255) {
          return new Response(
            JSON.stringify({ error: "Idempotency-Key requerido para crear una recarga." }),
            {
              status: 400,
              headers,
            },
          );
        }

        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: amountMinor,
            currency: "usd",
            metadata: {
              purpose: "quota_topup",
              tenantId: context.tenantId,
              userId: context.userId,
            },
            description: `Isabella AI quota top-up ${context.tenantId}`,
          },
          { idempotencyKey: `topup-intent:${context.tenantId}:${requestKey}` },
        );

        await registerPaymentIntentBinding({
          stripePaymentIntentId: paymentIntent.id,
          tenantId: context.tenantId,
          userId: context.userId,
          amountMinor,
          currency: "usd",
        });

        return new Response(
          JSON.stringify({
            success: true,
            paymentIntentId: paymentIntent.id,
            clientSecret: paymentIntent.client_secret,
            amountUSD: parsed.data.amountUSD,
            currency: "usd",
          }),
          { headers },
        );
      }),
    },
  },
});
