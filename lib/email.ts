import nodemailer from 'nodemailer';

// ---------------------------------------------------------------------------
// Email service (Gmail SMTP via nodemailer).
// Configured entirely through environment variables so no secret is committed:
//   GMAIL_USER          - the sending Gmail address (default ictfuturestrading@gmail.com)
//   GMAIL_APP_PASSWORD  - a Google "App Password" (NOT the normal password)
//   EMAIL_FROM          - optional friendly From header
// If GMAIL_APP_PASSWORD is not set the service NO-OPS (never throws) so the rest
// of the app keeps working until credentials are supplied.
// ---------------------------------------------------------------------------

const GMAIL_USER = process.env.GMAIL_USER || 'ictfuturestrading@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD || '';
const EMAIL_FROM = process.env.EMAIL_FROM || `ICT Futures <${GMAIL_USER}>`;

export function isEmailConfigured(): boolean {
  return Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);
}

let transporter: nodemailer.Transporter | null = null;
function getTransport(): nodemailer.Transporter | null {
  if (!isEmailConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
  }
  return transporter;
}

export interface AlertEmailPayload {
  symbol: string;
  patternType?: string;
  direction?: string;
  aiScore?: number | null;
  entryPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  message?: string;
  title?: string;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendAlertEmail(opts: {
  to: string;
  subject?: string;
  alert: AlertEmailPayload;
}): Promise<SendResult> {
  const transport = getTransport();
  if (!transport) {
    console.warn('[email] GMAIL_APP_PASSWORD not configured — skipping alert email.');
    return { sent: false, reason: 'not_configured' };
  }

  const { to, alert } = opts;
  const subject = opts.subject || `ICT Alert: ${alert.symbol}${alert.patternType ? ' — ' + alert.patternType : ''}`;

  try {
    await transport.sendMail({
      from: EMAIL_FROM,
      to,
      subject,
      html: renderAlertHtml(alert),
    });
    return { sent: true };
  } catch (e) {
    console.error('[email] send failed:', (e as Error).message);
    return { sent: false, reason: (e as Error).message };
  }
}

/** Generic send used for admin/system emails. */
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<SendResult> {
  const transport = getTransport();
  if (!transport) return { sent: false, reason: 'not_configured' };
  try {
    await transport.sendMail({ from: EMAIL_FROM, to: opts.to, subject: opts.subject, html: opts.html });
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

function renderAlertHtml(a: AlertEmailPayload): string {
  const dirColor = a.direction === 'BULLISH' || a.direction === 'LONG' ? '#16c784' : '#ea3943';
  const scoreColor = (a.aiScore ?? 0) >= 70 ? '#16c784' : (a.aiScore ?? 0) >= 40 ? '#f5a623' : '#8a94a6';
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 0;color:#8a94a6;font-size:13px;">${label}</td><td style="padding:6px 0;color:#e6e9ef;font-size:13px;text-align:right;font-weight:600;">${value}</td></tr>`;

  return `
  <div style="background:#0a0e1a;padding:32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:linear-gradient(180deg,#111726,#0d1121);border:1px solid rgba(255,255,255,0.06);border-radius:16px;overflow:hidden;">
      <div style="padding:20px 24px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;">
        <div style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.02em;">ICT Futures <span style="color:#3b82f6;">Intelligence</span></div>
      </div>
      <div style="padding:24px;">
        <div style="display:inline-block;padding:4px 12px;border-radius:999px;background:${dirColor}22;color:${dirColor};font-size:12px;font-weight:700;margin-bottom:16px;">
          ${a.direction ?? 'SIGNAL'} ${a.patternType ? '· ' + a.patternType : ''}
        </div>
        <h1 style="margin:0 0 4px;color:#fff;font-size:22px;">${a.symbol}</h1>
        <p style="margin:0 0 20px;color:#8a94a6;font-size:14px;">${a.title ?? a.message ?? 'A new ICT setup meeting your criteria was detected.'}</p>
        <table style="width:100%;border-collapse:collapse;border-top:1px solid rgba(255,255,255,0.06);">
          ${a.aiScore != null ? `<tr><td style="padding:6px 0;color:#8a94a6;font-size:13px;">AI Confluence Score</td><td style="padding:6px 0;text-align:right;"><span style="color:${scoreColor};font-weight:800;font-size:16px;">${a.aiScore}/100</span></td></tr>` : ''}
          ${a.entryPrice != null ? row('Entry', String(a.entryPrice)) : ''}
          ${a.stopLoss != null ? row('Stop Loss', String(a.stopLoss)) : ''}
          ${a.takeProfit != null ? row('Take Profit', String(a.takeProfit)) : ''}
        </table>
      </div>
      <div style="padding:16px 24px;border-top:1px solid rgba(255,255,255,0.06);color:#5b6478;font-size:11px;">
        Sent by ICT Futures Intelligence · ${new Date().toUTCString()}<br/>
        This is a paper-trading educational tool, not financial advice.
      </div>
    </div>
  </div>`;
}
