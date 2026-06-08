"use client";

import { useMemo, useState } from "react";

type Variant = {
  id: string;
  label: string;
  sku?: string;
  priceOverride?: number;
  stockOverride?: number;
  attributes?: Record<string, string>;
};

type Props = {
  productId: string;
  title: string;
  unitAmount: number;
  currency: string;
  image?: string | null;
  variants?: Variant[];
};

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

function readCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function lineKey(productId: string, variantId?: string): string {
  return `${productId}:${variantId ?? ""}`;
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export default function AddToCart({ productId, title, unitAmount, currency, image, variants }: Props) {
  const [added, setAdded] = useState(false);
  const [selection, setSelection] = useState<Record<string, string>>({});

  const hasVariants = Array.isArray(variants) && variants.length > 0;

  // Build axis -> values map from variant attributes.
  const axes = useMemo(() => {
    const axes: Record<string, string[]> = {};
    if (!hasVariants) return axes;
    for (const v of variants!) {
      const attrs = v.attributes ?? {};
      for (const [k, val] of Object.entries(attrs)) {
        const value = String(val);
        if (!axes[k]) axes[k] = [];
        if (!axes[k].includes(value)) axes[k].push(value);
      }
    }
    return axes;
  }, [variants, hasVariants]);

  const axisKeys = Object.keys(axes);

  // Resolve current selection to a unique variant (if all axes are picked).
  const resolved = useMemo(() => {
    if (!hasVariants) return null;
    if (axisKeys.length === 0) return null;
    if (axisKeys.some((k) => !selection[k])) return null;
    return variants!.find((v) => axisKeys.every((k) => String(v.attributes?.[k] ?? "") === selection[k])) ?? null;
  }, [variants, hasVariants, axisKeys, selection]);

  const effectivePrice = typeof resolved?.priceOverride === "number" ? resolved.priceOverride : unitAmount;
  const effectiveStock = typeof resolved?.stockOverride === "number" ? resolved.stockOverride : null;
  const outOfStock = effectiveStock !== null && effectiveStock <= 0;

  const canAdd = hasVariants ? !!resolved && !outOfStock : true;

  const handleAdd = () => {
    const items = readCart();
    const key = lineKey(productId, resolved?.id);
    const existing = items.find((i) => lineKey(i.productId, i.variantId) === key);
    let next: CartItem[];
    if (existing) {
      next = items.map((i) => (lineKey(i.productId, i.variantId) === key ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      next = [
        ...items,
        {
          productId,
          variantId: resolved?.id,
          variantLabel: resolved?.label,
          title,
          unitAmount: effectivePrice,
          currency,
          quantity: 1,
          image: image ?? null,
        },
      ];
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent<CartItem[]>(EVENT_NAME, { detail: next }));
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="space-y-4">
      {hasVariants &&
        axisKeys.map((axis) => (
          <div key={axis}>
            <div className="mb-1.5 text-xs font-medium text-gray-700 capitalize">{axis}</div>
            <div className="flex flex-wrap gap-2">
              {axes[axis].map((value) => {
                const selected = selection[axis] === value;
                return (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setSelection((s) => ({ ...s, [axis]: value }))}
                    className={
                      selected
                        ? "rounded-md border-2 border-teal-700 bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-900"
                        : "rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50"
                    }
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

      {hasVariants && resolved && (
        <div className="text-sm text-gray-700">
          <span className="font-medium tabular-nums">{formatMoney(effectivePrice, currency)}</span>
          {effectiveStock !== null && effectiveStock <= 5 && effectiveStock > 0 && (
            <span className="ml-2 text-xs text-amber-700">Only {effectiveStock} left</span>
          )}
          {outOfStock && <span className="ml-2 text-xs text-red-600">Out of stock</span>}
        </div>
      )}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="inline-flex items-center justify-center rounded-md bg-teal-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {added ? "Added!" : hasVariants && !resolved ? "Choose options" : outOfStock ? "Out of stock" : "Add to cart"}
      </button>
    </div>
  );
}
