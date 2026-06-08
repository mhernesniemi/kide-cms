"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type CartItem = {
  productId: string;
  variantId?: string;
  variantLabel?: string;
  title: string;
  unitAmount: number;
  currency: string;
  quantity: number;
  image?: string | null;
};

const STORAGE_KEY = "kide-cart";
const EVENT_NAME = "kide-cart:change";

function lineKey(productId: string, variantId?: string): string {
  return `${productId}:${variantId ?? ""}`;
}

function readCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(items: CartItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent<CartItem[]>(EVENT_NAME, { detail: items }));
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default function Cart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(readCart());
    const handler = (e: Event) => setItems((e as CustomEvent<CartItem[]>).detail ?? []);
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
  }, []);

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalAmount = items.reduce((sum, item) => sum + item.unitAmount * item.quantity, 0);
  const currency = items[0]?.currency ?? "eur";

  const updateQuantity = useCallback((key: string, quantity: number) => {
    const next = readCart()
      .map((item) => (lineKey(item.productId, item.variantId) === key ? { ...item, quantity } : item))
      .filter((item) => item.quantity > 0);
    writeCart(next);
  }, []);

  const removeItem = useCallback((key: string) => {
    const next = readCart().filter((item) => lineKey(item.productId, item.variantId) !== key);
    writeCart(next);
  }, []);

  const checkout = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/cms/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        setError(data?.error ?? "Checkout failed. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Checkout failed. Please try again.");
      setSubmitting(false);
    }
  }, [items]);

  const drawer = useMemo(
    () => (
      <>
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-label="Shopping cart"
          className={`fixed top-0 right-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-xl transition-transform ${open ? "translate-x-0" : "translate-x-full"}`}
        >
          <header className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h2 className="text-base font-semibold">Cart</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
              aria-label="Close cart"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {items.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-500">Your cart is empty.</p>
            ) : (
              <ul className="space-y-4">
                {items.map((item) => {
                  const key = lineKey(item.productId, item.variantId);
                  return (
                    <li key={key} className="flex gap-3">
                      {item.image && (
                        <img src={item.image} alt="" className="size-16 shrink-0 rounded object-cover" loading="lazy" />
                      )}
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{item.title}</div>
                        {item.variantLabel && <div className="text-xs text-gray-500">{item.variantLabel}</div>}
                        <div className="text-gray-500">{formatMoney(item.unitAmount, item.currency)}</div>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateQuantity(key, item.quantity - 1)}
                            className="size-7 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            aria-label="Decrease quantity"
                          >
                            −
                          </button>
                          <span className="min-w-[2ch] text-center tabular-nums">{item.quantity}</span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(key, item.quantity + 1)}
                            className="size-7 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
                            aria-label="Increase quantity"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            onClick={() => removeItem(key)}
                            className="ml-auto text-xs text-gray-500 underline-offset-2 hover:underline"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <div className="text-sm font-medium tabular-nums">
                        {formatMoney(item.unitAmount * item.quantity, item.currency)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {items.length > 0 && (
            <footer className="border-t border-gray-200 px-5 py-4">
              <div className="mb-3 flex items-baseline justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-base font-semibold tabular-nums">{formatMoney(totalAmount, currency)}</span>
              </div>
              <p className="mb-3 text-xs text-gray-500">Shipping and taxes calculated at checkout.</p>
              {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
              <button
                type="button"
                onClick={checkout}
                disabled={submitting}
                className="w-full rounded-md bg-teal-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-60"
              >
                {submitting ? "Redirecting…" : "Checkout"}
              </button>
            </footer>
          )}
        </aside>
      </>
    ),
    [open, items, totalAmount, currency, error, submitting, updateQuantity, removeItem, checkout],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        aria-label={`Cart (${totalCount} items)`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 2l1 4M6 2H3m3 0l3 12h10l3-9H7" />
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="18" cy="20" r="1.5" />
        </svg>
        Cart
        {totalCount > 0 && (
          <span className="ml-1 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-teal-700 px-1 text-xs font-medium text-white">
            {totalCount}
          </span>
        )}
      </button>
      {drawer}
    </>
  );
}
