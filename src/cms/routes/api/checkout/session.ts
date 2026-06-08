import type { APIRoute } from "astro";
import { cms } from "virtual:kide/api";
import { createCheckoutSession, isPaymentConfigured } from "virtual:kide/payment";

export const prerender = false;

type CartItem = { productId: string; variantId?: string; quantity: number };
type RequestBody = {
  items: CartItem[];
  customerEmail?: string;
};

type Variant = {
  id?: string;
  label?: string;
  sku?: string;
  priceOverride?: number;
  stockOverride?: number;
  attributes?: Record<string, unknown>;
};

function findVariant(product: Record<string, any>, variantId: string | undefined): Variant | null {
  if (!variantId) return null;
  const list = Array.isArray(product.variants) ? (product.variants as Variant[]) : [];
  return list.find((v) => v?.id === variantId) ?? null;
}

export const POST: APIRoute = async ({ request }) => {
  if (!isPaymentConfigured()) {
    return jsonError("Payments are not configured", 503);
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return jsonError("Invalid JSON", 400);
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return jsonError("Cart is empty", 400);
  }

  const productsApi = (cms as Record<string, any>).products;
  if (!productsApi) return jsonError("Products collection unavailable", 500);

  const lineItems = [];
  let cartCurrency: string | null = null;

  for (const item of body.items) {
    if (!item?.productId || !Number.isFinite(item?.quantity)) {
      return jsonError("Invalid cart item", 400);
    }
    const product = await productsApi.findOne({ where: { _id: item.productId } }, { _system: true });
    if (!product || !product.active || product._status !== "published") {
      return jsonError(`Product unavailable: ${item.productId}`, 400);
    }

    const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
    const variant = hasVariants ? findVariant(product, item.variantId) : null;
    if (hasVariants && !variant) {
      return jsonError(`Variant required for product: ${product.title}`, 400);
    }

    const qty = Math.max(1, Math.floor(item.quantity));
    const stock = typeof variant?.stockOverride === "number" ? variant.stockOverride : product.stock;
    if (typeof stock === "number" && stock < qty) {
      return jsonError(`Out of stock: ${product.title}${variant ? ` (${variant.label})` : ""}`, 400);
    }
    const currency = String(product.currency ?? "eur");
    if (cartCurrency && currency !== cartCurrency) {
      return jsonError("Mixed currencies in cart are not supported", 400);
    }
    cartCurrency = currency;

    const unitAmount = typeof variant?.priceOverride === "number" ? variant.priceOverride : Number(product.price);
    const name = variant ? `${product.title} — ${variant.label ?? variant.id}` : String(product.title);

    lineItems.push({
      name,
      description: product.seoDescription ? String(product.seoDescription) : undefined,
      amount: unitAmount,
      currency,
      quantity: qty,
    });
  }

  const origin = new URL(request.url).origin;
  const cartMetadata = JSON.stringify(
    body.items.map((i) => ({
      p: i.productId,
      v: i.variantId ?? null,
      q: Math.max(1, Math.floor(i.quantity)),
    })),
  );

  try {
    const { url } = await createCheckoutSession({
      lineItems,
      customerEmail: body.customerEmail,
      successUrl: `${origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}/checkout/cancel`,
      metadata: { cart: cartMetadata },
      shippingAddressCollection: { allowedCountries: ["FI", "SE", "NO", "DK", "DE", "FR", "GB", "US"] },
    });
    return new Response(JSON.stringify({ url }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[checkout] failed:", err);
    return jsonError("Failed to create checkout session", 500);
  }
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
