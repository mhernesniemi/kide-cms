import type { APIRoute } from "astro";
import { nanoid } from "nanoid";
import { cms } from "virtual:kide/api";
import { isEmailConfigured, sendOrderConfirmationEmail } from "virtual:kide/email";
import { getCheckoutSession, verifyWebhookEvent } from "virtual:kide/payment";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await request.text();

  let event;
  try {
    event = await verifyWebhookEvent(rawBody, signature);
  } catch (err) {
    console.error("[stripe webhook] signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const ordersApi = (cms as Record<string, any>).orders;
    if (!ordersApi) return new Response("Orders collection unavailable", { status: 500 });

    // Idempotency — Stripe retries on non-2xx, and a single event can be redelivered.
    const existing = await ordersApi.findOne({ where: { stripeSessionId: session.id } }, { _system: true });
    if (existing) return new Response("ok", { status: 200 });

    const fullSession = await getCheckoutSession(session.id);
    const stripeLineItems = fullSession.line_items?.data ?? [];

    let cartMeta: Array<{ p: string; v: string | null; q: number }> = [];
    try {
      cartMeta = JSON.parse(session.metadata?.cart ?? "[]");
    } catch {
      // Cart metadata missing or unparseable — record the order without product references.
    }

    const lineItems = stripeLineItems.map((li, idx) => {
      const meta = cartMeta[idx];
      return {
        productId: meta?.p ?? null,
        variantId: meta?.v ?? null,
        title: li.description ?? "Item",
        quantity: li.quantity ?? 1,
        unitAmount: li.price?.unit_amount ?? 0,
        currency: li.price?.currency ?? "eur",
      };
    });

    const total = session.amount_total ?? 0;
    const subtotal = session.amount_subtotal ?? total;
    const currency = session.currency ?? "eur";
    const customerEmail = session.customer_details?.email ?? session.customer_email ?? null;
    const shippingAddress = session.collected_information?.shipping_details?.address ?? null;
    const customer = {
      name: session.customer_details?.name ?? null,
      email: customerEmail,
      phone: session.customer_details?.phone ?? null,
      address: shippingAddress ?? session.customer_details?.address ?? null,
    };

    const orderNumber = `ORD-${nanoid(8).toUpperCase()}`;
    const paymentIntentId =
      typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null);

    try {
      await ordersApi.create(
        {
          orderNumber,
          status: "paid",
          customerEmail,
          customer,
          lineItems,
          subtotal,
          total,
          currency,
          stripeSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        },
        { _system: true },
      );
    } catch (err) {
      console.error("[stripe webhook] failed to create order:", err);
      return new Response("Internal error", { status: 500 });
    }

    // Decrement stock for products/variants with finite inventory. When a line item
    // references a variant, decrement that variant's stockOverride; otherwise fall
    // back to the parent product's stock counter.
    const productsApi = (cms as Record<string, any>).products;
    if (productsApi) {
      for (const li of lineItems) {
        if (!li.productId) continue;
        try {
          const product = await productsApi.findOne({ where: { _id: li.productId } }, { _system: true });
          if (!product) continue;
          if (li.variantId && Array.isArray(product.variants)) {
            let touched = false;
            const nextVariants = product.variants.map((v: Record<string, unknown>) => {
              if (v?.id !== li.variantId || typeof v?.stockOverride !== "number") return v;
              touched = true;
              return { ...v, stockOverride: Math.max(0, (v.stockOverride as number) - li.quantity) };
            });
            if (touched) {
              await productsApi.update({ _id: li.productId }, { variants: nextVariants }, { _system: true });
            }
          } else if (typeof product.stock === "number") {
            await productsApi.update(
              { _id: li.productId },
              { stock: Math.max(0, product.stock - li.quantity) },
              { _system: true },
            );
          }
        } catch (err) {
          console.error(`[stripe webhook] failed to decrement stock for ${li.productId}:`, err);
        }
      }
    }

    if (customerEmail && isEmailConfigured()) {
      const emailLineItems = lineItems.map((li) => ({
        title: li.title,
        quantity: li.quantity,
        unitAmount: li.unitAmount,
        currency: li.currency,
      }));
      await sendOrderConfirmationEmail(customerEmail, orderNumber, emailLineItems, total, currency);
    }
  }

  return new Response("ok", { status: 200 });
};
