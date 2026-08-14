import { fields } from "@kidecms/core";

// Block types shared by the front page and regular pages.
export const pageBlockTypes = {
  hero: {
    heading: fields.text({ required: true }),
    body: fields.text({ admin: { rows: 3 } }),
    ctaLabel: fields.text(),
    ctaHref: fields.text({ admin: { placeholder: "/contact" } }),
  },
  text: {
    heading: fields.text(),
    content: fields.richText(),
  },
  features: {
    heading: fields.text(),
    items: fields.json({
      admin: { component: "repeater" },
      itemFields: {
        title: fields.text(),
        description: fields.text({ admin: { rows: 2 } }),
      },
    }),
  },
  cta: {
    heading: fields.text(),
    body: fields.text({ admin: { rows: 2 } }),
    buttonLabel: fields.text(),
    buttonHref: fields.text({ admin: { placeholder: "/contact" } }),
  },
  faq: {
    heading: fields.text(),
    items: fields.json({
      admin: { component: "repeater" },
      itemFields: {
        title: fields.text({ label: "Question" }),
        description: fields.text({ label: "Answer", admin: { rows: 2 } }),
      },
    }),
  },
};
