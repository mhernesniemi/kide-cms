import { defineCollection, fields } from "@/cms/core";

export default defineCollection({
  slug: "orders",
  labels: { singular: "Order", plural: "Orders" },
  labelField: "orderNumber",
  timestamps: true,
  views: {
    list: { columns: ["orderNumber", "customerEmail", "total", "status", "_createdAt"] },
  },
  fields: {
    orderNumber: fields.text({
      required: true,
      indexed: true,
      unique: true,
      admin: { position: "sidebar", help: "Auto-generated when the order is created." },
    }),
    status: fields.select({
      options: ["pending", "paid", "fulfilled", "cancelled", "refunded"],
      defaultValue: "pending",
      admin: { position: "sidebar" },
    }),
    customerEmail: fields.email({
      admin: { position: "sidebar", help: "Customer email — copied from Stripe checkout." },
    }),
    customer: fields.json({
      admin: { help: "Customer name and shipping address (read-only — set during checkout)." },
    }),
    lineItems: fields.json({
      admin: { help: "Line items snapshot at time of purchase (read-only)." },
    }),
    subtotal: fields.number({
      admin: { position: "sidebar", help: "Subtotal in smallest currency unit." },
    }),
    total: fields.number({
      admin: { position: "sidebar", help: "Total in smallest currency unit." },
    }),
    currency: fields.text({
      defaultValue: "eur",
      admin: { position: "sidebar" },
    }),
    stripeSessionId: fields.text({
      indexed: true,
      admin: { position: "sidebar", help: "Stripe Checkout Session ID (for support/refunds)." },
    }),
    stripePaymentIntentId: fields.text({
      admin: { position: "sidebar" },
    }),
    notes: fields.text({
      admin: { rows: 4, help: "Internal notes — not shown to the customer." },
    }),
  },
});
