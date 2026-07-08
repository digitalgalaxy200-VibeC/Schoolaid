import { Resend } from "resend";

const resend = (() => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
})();

export interface OnboardingEmailParams {
  to: string;
  studentName: string;
  schoolName: string;
  schoolLogo?: string | null;
  loginUrl: string;
}

/**
 * Sends the onboarding email to a newly created student.
 * No password is included in the email body — passwords are shown once to the
 * School Admin at creation time, per Section 3.7.
 */
export async function sendStudentOnboardingEmail(params: OnboardingEmailParams): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping onboarding email for", params.to);
    return false;
  }

  const { to, studentName, schoolName, schoolLogo, loginUrl } = params;

  try {
    const { error } = await resend.emails.send({
      from: "SchoolAid <onboarding@schoolaid.app>",
      to: [to],
      subject: `Welcome to ${schoolName} — Your SchoolAid Account`,
      html: buildOnboardingHtml({ studentName, schoolName, schoolLogo, loginUrl }),
    });

    if (error) {
      console.error("[email] Failed to send onboarding email:", error);
      return false;
    }

    console.log("[email] Onboarding email sent to", to);
    return true;
  } catch (err) {
    console.error("[email] Unexpected error sending onboarding email:", err);
    return false;
  }
}

function buildOnboardingHtml(params: Omit<OnboardingEmailParams, "to">): string {
  const { studentName, schoolName, schoolLogo, loginUrl } = params;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; background: #f5f6f8; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 16px rgba(22,32,46,0.09); }
    .header { background: #2a4b8d; padding: 32px 24px; text-align: center; }
    .logo { max-height: 48px; margin-bottom: 12px; }
    .header h1 { color: #fff; font-size: 20px; margin: 0; font-weight: 700; }
    .body { padding: 32px 24px; color: #16202e; }
    .body p { font-size: 15px; line-height: 1.6; margin: 0 0 16px; color: #4b5666; }
    .greeting { font-size: 17px; font-weight: 600; color: #16202e; margin-bottom: 12px; }
    .cta { display: inline-block; background: #2a4b8d; color: #fff; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 8px 0 20px; }
    .footer { background: #f5f6f8; padding: 20px 24px; text-align: center; }
    .footer p { font-size: 11px; color: #8891a0; margin: 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      ${schoolLogo ? `<img src="${schoolLogo}" alt="${schoolName}" class="logo" />` : ""}
      <h1>${schoolName}</h1>
    </div>
    <div class="body">
      <p class="greeting">Hello ${studentName},</p>
      <p>Your SchoolAid account has been created. You can now log in to check your results, view report cards, and download official PDFs — all in one place.</p>
      <p><strong>Here's how to get started:</strong></p>
      <ol style="font-size: 15px; line-height: 1.8; color: #4b5666; padding-left: 20px;">
        <li>Click the button below to go to the login page</li>
        <li>Enter the email address and password provided by your school</li>
        <li>On your first login, you'll be asked to create a new password</li>
      </ol>
      <div style="text-align: center;">
        <a href="${loginUrl}" class="cta">Check Your Results</a>
      </div>
      <p style="font-size: 13px; color: #8891a0;">If you have any questions, please contact your school administrator.</p>
    </div>
    <div class="footer">
      <p>SchoolAid — School Management Platform</p>
    </div>
  </div>
</body>
</html>`;
}
