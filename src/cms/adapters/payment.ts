import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  if (stripeClient) return stripeClient;
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  stripeClient = new Stripe(key);
  return stripeClient;
}

export type CheckoutLineItem = {
  name: string;
  description?: string;
  amount: number;
  currency: string;
  quantity: number;
};

export type CreateCheckoutOptions = {
  lineItems: CheckoutLineItem[];
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  shippingAddressCollection?: { allowedCountries: string[] };
};

export async function createCheckoutSession(opts: CreateCheckoutOptions): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: opts.lineItems.map((item) => ({
      price_data: {
        currency: item.currency,
        unit_amount: item.amount,
        product_data: {
          name: item.name,
          ...(item.description ? { description: item.description } : {}),
        },
      },
      quantity: item.quantity,
    })),
    customer_email: opts.customerEmail,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: opts.metadata,
    payment_intent_data: opts.metadata ? { metadata: opts.metadata } : undefined,
    shipping_address_collection: opts.shippingAddressCollection
      ? { allowed_countries: opts.shippingAddressCollection.allowedCountries as never[] }
      : undefined,
  });
  if (!session.url) throw new Error("Stripe did not return a session URL");
  return { url: session.url, sessionId: session.id };
}

export async function getCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session> {
  const stripe = getStripe();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items", "customer_details", "payment_intent"],
  });
}

export async function verifyWebhookEvent(rawBody: string | Buffer, signature: string): Promise<Stripe.Event> {
  const stripe = getStripe();
  const secret = import.meta.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return stripe.webhooks.constructEventAsync(rawBody, signature, secret);
}

export function isPaymentConfigured(): boolean {
  return !!import.meta.env.STRIPE_SECRET_KEY;
}
