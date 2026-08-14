export type AuthEmailInput = {
  kind: "verification" | "password_reset";
  to: string;
  url: string;
  displayName: string | null;
};

export type RenderedAuthEmail = {
  subject: string;
  text: string;
  html: string;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function brandHtml(bodyHtml: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;padding:24px 0;"><tr><td align="center"><table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;"><tr><td style="padding:28px 32px;border-bottom:1px solid #e5e7eb;"><span style="font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#171717;">SakuStudi</span></td></tr><tr><td style="padding:28px 32px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#171717;">${bodyHtml}</td></tr><tr><td style="padding:20px 32px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;font-size:12px;color:#767676;">&copy; ${new Date().getUTCFullYear()} SakuStudi</td></tr></table></td></tr></table>`;
}

function actionButtonHtml(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:16px 0;padding:12px 24px;border-radius:10px;background:#ffce54;color:#171717;font-weight:600;text-decoration:none;">${escapeHtml(label)}</a>`;
}

export function renderAuthEmail(input: AuthEmailInput): RenderedAuthEmail {
  const name = input.displayName ? ` ${input.displayName}` : "";

  if (input.kind === "verification") {
    const bodyHtml = [
      `<p>Hi${escapeHtml(name)},</p>`,
      "<p>Thanks for signing up for SakuStudi. Please confirm your email address to activate your account.</p>",
      actionButtonHtml("Verify email address", input.url),
      "<p>If the button above does not work, copy and paste this link into your browser:</p>",
      `<p><a href="${escapeHtml(input.url)}" style="color:#b57e00;word-break:break-all;">${escapeHtml(input.url)}</a></p>`,
      "<p>If you did not create an account, you can safely ignore this email.</p>",
    ].join("");

    return {
      subject: "Verify your email address",
      text: `Hi${name},\n\nThanks for signing up for SakuStudi. Please confirm your email address to activate your account.\n\nVerify email address: ${input.url}\n\nIf you did not create an account, you can safely ignore this email.`,
      html: brandHtml(bodyHtml),
    };
  }

  const bodyHtml = [
    `<p>Hi${escapeHtml(name)},</p>`,
    "<p>We received a request to reset your SakuStudi password. Click the button below to choose a new password. This link expires in 1 hour.</p>",
    actionButtonHtml("Reset password", input.url),
    "<p>If the button above does not work, copy and paste this link into your browser:</p>",
    `<p><a href="${escapeHtml(input.url)}" style="color:#b57e00;word-break:break-all;">${escapeHtml(input.url)}</a></p>`,
    "<p>If you did not request a password reset, you can safely ignore this email.</p>",
  ].join("");

  return {
    subject: "Reset your password",
    text: `Hi${name},\n\nWe received a request to reset your SakuStudi password. Click the link below to choose a new password. This link expires in 1 hour.\n\nReset password: ${input.url}\n\nIf you did not request a password reset, you can safely ignore this email.`,
    html: brandHtml(bodyHtml),
  };
}
