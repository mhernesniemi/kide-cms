export const sendInviteEmail = async (to: string, inviteUrl: string): Promise<boolean> => {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = import.meta.env.RESEND_FROM_EMAIL ?? "Kide CMS <noreply@example.com>";

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "You've been invited to Kide CMS",
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="font-size: 20px;">You've been invited</h2>
            <p>You've been invited to manage content on Kide CMS. Click the link below to set up your account:</p>
            <p><a href="${inviteUrl}" style="display: inline-block; padding: 10px 20px; background: #0d9488; color: white; text-decoration: none; border-radius: 6px;">Accept invitation</a></p>
            <p style="color: #666; font-size: 13px;">This link expires in 7 days. If you didn't expect this invitation, you can safely ignore it.</p>
          </div>
        `,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const sendFormSubmissionEmail = async (
  to: string,
  formTitle: string,
  data: Record<string, unknown>,
): Promise<boolean> => {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const from = import.meta.env.RESEND_FROM_EMAIL ?? "Kide CMS <noreply@example.com>";

  const rows = Object.entries(data)
    .map(([k, v]) => {
      const value = typeof v === "string" ? v : JSON.stringify(v);
      const escaped = value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<tr><td style="padding:4px 12px 4px 0; color:#666; vertical-align:top;">${k}</td><td style="padding:4px 0; white-space:pre-wrap;">${escaped}</td></tr>`;
    })
    .join("");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: `New submission: ${formTitle}`,
        html: `
          <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
            <h2 style="font-size: 18px;">New "${formTitle}" submission</h2>
            <table style="border-collapse: collapse; font-size: 14px;">${rows}</table>
          </div>
        `,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export const isEmailConfigured = (): boolean => !!import.meta.env.RESEND_API_KEY;
