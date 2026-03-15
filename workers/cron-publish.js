/**
 * Cloudflare Worker — Scheduled Publishing Cron
 *
 * Deploy as a separate Worker with a Cron Trigger.
 * Calls the CMS cron endpoint on a schedule.
 *
 * Environment variables (set in Cloudflare dashboard or wrangler.toml):
 *   SITE_URL    — e.g. https://your-site.com
 *   CRON_SECRET — must match the CRON_SECRET env var on the Astro app
 */

export default {
  async scheduled(_event, env) {
    const url = `${env.SITE_URL}/api/cms/cron/publish`;
    const headers = {};
    if (env.CRON_SECRET) {
      headers["Authorization"] = `Bearer ${env.CRON_SECRET}`;
    }

    const res = await fetch(url, { headers });
    if (!res.ok) {
      console.error(`Cron publish failed: ${res.status} ${await res.text()}`);
      return;
    }

    const result = await res.json();
    console.log(`Cron publish: ${result.published} published, ${result.unpublished} unpublished`);
  },
};
