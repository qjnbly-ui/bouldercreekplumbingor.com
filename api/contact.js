const RECIPIENT = 'bouldercreekplumbingllc@gmail.com';
const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Boulder Creek Plumbing <noreply@n3xra.com>';
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const rateLimitStore = new Map();

function sendJson(response, status, body) {
  response.status(status).setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  return response.end(JSON.stringify(body));
}

function cleanLine(value, maxLength) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, maxLength);
}

function cleanMessage(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getClientIp(request) {
  const forwarded = request.headers?.['x-forwarded-for'];
  return typeof forwarded === 'string' && forwarded.trim()
    ? forwarded.split(',')[0].trim()
    : request.socket?.remoteAddress || 'unknown';
}

function isRateLimited(request) {
  const ip = getClientIp(request);
  const now = Date.now();
  const current = rateLimitStore.get(ip);

  if (!current || now - current.startedAt > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(ip, { startedAt: now, count: 1 });
    return false;
  }

  if (current.count >= RATE_LIMIT_MAX) return true;
  current.count += 1;
  return false;
}

function buildEmailHtml({ name, phone, email, location, service, message }) {
  const row = (label, value) => `<tr><td style="width:120px;padding:8px 14px 8px 0;color:#617178;font-size:12px;font-weight:700;text-transform:uppercase;vertical-align:top;">${label}</td><td style="padding:8px 0;color:#1b333b;font-size:15px;vertical-align:top;">${value}</td></tr>`;
  return `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#e8eff1;font-family:Arial,sans-serif;color:#1b333b;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:28px 14px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:6px;overflow:hidden;"><tr><td style="padding:26px 30px;background:#102c36;border-bottom:5px solid #c67032;"><div style="color:#eeb987;font-size:11px;font-weight:700;letter-spacing:.15em;text-transform:uppercase;">New website request</div><h1 style="margin:8px 0 0;color:#fff;font-size:26px;">${escapeHtml(service)}</h1></td></tr><tr><td style="padding:30px;"><div style="padding:20px;background:#f5f2ea;border-left:4px solid #28738a;font-size:16px;line-height:1.65;">${escapeHtml(message).replace(/\n/g, '<br>')}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:22px;">${row('Name', escapeHtml(name))}${row('Phone', `<a href="tel:${escapeHtml(phone)}" style="color:#28738a;font-weight:700;">${escapeHtml(phone)}</a>`)}${row('Email', email ? `<a href="mailto:${escapeHtml(email)}" style="color:#28738a;font-weight:700;">${escapeHtml(email)}</a>` : 'Not provided')}${row('Location', escapeHtml(location))}</table></td></tr><tr><td style="padding:18px 30px;color:#617178;background:#f5f2ea;font-size:12px;">Boulder Creek Plumbing LLC · (541) 851-1345</td></tr></table></td></tr></table></body></html>`;
}

module.exports = async function contact(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Method not allowed.' });
  }

  if (isRateLimited(request)) {
    return sendJson(response, 429, { error: 'Too many requests right now. Please wait a few minutes or call (541) 851-1345.' });
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured.');
    return sendJson(response, 503, { error: 'Online requests are temporarily unavailable. Please call (541) 851-1345.' });
  }

  const body = request.body || {};
  if (body.website) return sendJson(response, 200, { ok: true });

  const name = cleanLine(body.name, 100);
  const phone = cleanLine(body.phone, 50);
  const email = cleanLine(body.email, 254);
  const location = cleanLine(body.location, 120);
  const service = cleanLine(body.service, 120);
  const message = cleanMessage(body.message, 5000);
  const startedAt = Number(body.startedAt);
  const elapsed = Date.now() - startedAt;

  if (!name || !phone || !location || !service || !message || (email && !isEmail(email))) {
    return sendJson(response, 400, { error: 'Please complete the required fields and check your contact information.' });
  }

  if (!Number.isFinite(startedAt) || elapsed < 1500 || elapsed > 24 * 60 * 60 * 1000) {
    return sendJson(response, 400, { error: 'Please refresh the page and try again.' });
  }

  const text = [
    'New Boulder Creek Plumbing website request',
    '',
    `Service: ${service}`,
    `Location: ${location}`,
    `Name: ${name}`,
    `Phone: ${phone}`,
    `Email: ${email || 'Not provided'}`,
    '',
    message
  ].join('\n');

  try {
    const resendResponse = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
        to: [RECIPIENT],
        reply_to: email || undefined,
        subject: `Website request: ${service} in ${location}`,
        html: buildEmailHtml({ name, phone, email, location, service, message }),
        text
      })
    });

    if (!resendResponse.ok) {
      console.error('Resend rejected the contact email:', resendResponse.status, await resendResponse.text());
      return sendJson(response, 502, { error: 'Your message could not be sent. Please call (541) 851-1345.' });
    }

    return sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error('Contact email request failed:', error);
    return sendJson(response, 502, { error: 'Your message could not be sent. Please call (541) 851-1345.' });
  }
};
