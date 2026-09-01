import axios from 'axios';
import { env, features } from '../config/env.js';

/**
 * Optional WhatsApp alert channel for emergency contacts.
 *
 * No SMS API has a genuinely free tier — Twilio and the rest hand out trial
 * credit that expires — so an emergency alert goes out by email first, with
 * WhatsApp as an optional second channel.
 *
 * Three providers are supported, chosen with WHATSAPP_PROVIDER:
 *
 *   meta       WhatsApp Cloud API — Meta's own, and the one to use. Free with
 *              no card: a test business number reaches up to five recipients
 *              you verify in the dashboard, which is exactly the shape of a
 *              student project. An SOS is business-initiated, so it needs a
 *              pre-approved template; template creation is free here, which
 *              is precisely what Twilio's trial refuses.
 *
 *   twilio     The WhatsApp Sandbox. Sound in theory, blocked in practice on
 *              a trial account, which rejects any destination that is not a
 *              verified caller id (572002) and whose newer sender demands a
 *              ContentSid per message (21654) that trials cannot create.
 *              Kept because a funded account makes it work unchanged.
 *
 *   callmebot  A free community relay. Unofficial, rate-limited, personal
 *              use only, and its opt-in endpoint has proved unreliable. The
 *              recipient is issued their own key, stored on the contact.
 *
 * Independent of all three, `whatsappDeepLink` builds a wa.me URL the patient's
 * own device can open with the alert pre-filled. It needs no account, no
 * credentials and no opt-in, so the emergency screen always has a working way
 * to reach a contact over WhatsApp even when no provider is configured.
 *
 * None of these ever throw. A failed alert is recorded on the SOS event and
 * shown in the UI, but must not break the emergency flow — the on-screen
 * ambulance number and hospital list matter far more than the notification.
 */

/** Digits only, no '+' or separators. */
const normalisePhone = (phone) => String(phone ?? '').replace(/[^0-9]/g, '');

/**
 * A click-to-chat URL that opens WhatsApp with the message already typed.
 *
 * This is the one path that cannot fail for setup reasons: it is a plain URL,
 * not an API call. The trade-off is honest and worth stating in the UI — the
 * patient taps send, so it is a handoff rather than an automatic alert, and
 * the contact receives it from the patient's own number rather than ours.
 * For an emergency contact, a message from a number they recognise is
 * arguably the better outcome.
 */
export function whatsappDeepLink(phone, message) {
  const normalised = normalisePhone(phone);
  if (normalised.length < 8) return null;
  return `https://wa.me/${normalised}?text=${encodeURIComponent(String(message ?? '').slice(0, 1800))}`;
}

export function whatsappProvider() {
  return features.whatsappProvider;
}

/** Whether a contact has everything this provider needs. */
export function contactCanReceiveWhatsApp(contact = {}) {
  if (!features.whatsappProvider) return false;
  if (!contact.whatsappNumber) return false;
  // Meta's consent is the recipient being on the app's verified-numbers list,
  // and Twilio's is the sandbox join. Neither is visible from here, so a
  // number alone is enough. CallMeBot issues a key we can actually check for.
  if (features.whatsappProvider === 'meta') return true;
  if (features.whatsappProvider === 'twilio') return true;
  return Boolean(contact.whatsappApiKey || env.whatsapp.apiKey);
}

export async function sendWhatsApp({ phone, message, apiKey, templateParams }) {
  const provider = features.whatsappProvider;

  if (!provider) {
    return { sent: false, reason: 'WhatsApp alerts are switched off (WHATSAPP_PROVIDER)' };
  }
  if (!phone) {
    return { sent: false, reason: 'No WhatsApp number saved for this contact' };
  }

  const normalised = normalisePhone(phone);
  if (normalised.length < 8) {
    return { sent: false, reason: 'That WhatsApp number does not look valid' };
  }

  if (provider === 'meta') return sendViaMeta(normalised, message, templateParams);
  if (provider === 'twilio') return sendViaTwilio(normalised, message);
  return sendViaCallMeBot(normalised, message, apiKey);
}

/* ------------------------------------------------- Meta WhatsApp Cloud API */

/**
 * Sends through Meta's Graph API.
 *
 * When a template name is configured the message goes as a template, which is
 * the only thing WhatsApp permits for a business-initiated conversation — and
 * an SOS always is one, because the emergency contact has not written to us.
 * Without a template name it falls back to plain text, which succeeds only
 * inside an open 24-hour service window; that is the useful shape for a quick
 * check where the recipient has just messaged the test number.
 */
async function sendViaMeta(phone, message, templateParams) {
  const { apiVersion, phoneNumberId, accessToken, templateName, templateLanguage } =
    env.whatsapp.meta;

  const payload = templateName
    ? {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [
            {
              type: 'body',
              // Meta rejects a body parameter containing a newline or a run of
              // consecutive spaces, which free text and map links both produce.
              parameters: (templateParams ?? [message]).map((value) => ({
                type: 'text',
                text: String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 900) || '-',
              })),
            },
          ],
        },
      }
    : {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phone,
        type: 'text',
        text: { preview_url: true, body: String(message).slice(0, 4000) },
      };

  try {
    const response = await axios.post(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (response.status >= 200 && response.status < 300) {
      return {
        sent: true,
        id: response.data?.messages?.[0]?.id,
        mode: templateName ? 'template' : 'text',
      };
    }

    return { sent: false, reason: describeMetaError(response) };
  } catch (err) {
    console.error('[whatsapp] Meta request failed:', err.message);
    return { sent: false, reason: `Could not reach Meta: ${err.message}` };
  }
}

/**
 * Meta nests the useful part several levels down and its top-level `message`
 * is usually a generic "Unsupported post request". The nested `error_data`
 * detail is the one that names the actual problem, so it is surfaced first.
 */
function describeMetaError(response) {
  const error = response.data?.error ?? {};
  const detail = error.error_data?.details;
  const code = error.code;

  const known = {
    190: 'The Meta access token is invalid or has expired. A temporary token from the '
      + 'dashboard lasts about 24 hours — generate a permanent System User token instead.',
    100: 'Meta rejected the request. If this is a template send, check the template name '
      + 'and language match an APPROVED template, and that the number of {{n}} placeholders '
      + 'matches the parameters sent.',
    131026: 'The message could not be delivered. On a test number the recipient must be '
      + 'added to the app\'s verified recipient list first (up to five numbers).',
    131047: 'The 24-hour service window has closed, so only a pre-approved template can be '
      + 'sent. Set META_WHATSAPP_TEMPLATE to an approved template name.',
    131051: 'That message type is not supported for this recipient.',
    132000: 'The template was sent with the wrong number of parameters for its body text.',
    132001: 'No approved template with that name and language exists. Check '
      + 'META_WHATSAPP_TEMPLATE and META_WHATSAPP_TEMPLATE_LANG.',
    133010: 'That phone number id is not registered with the Cloud API.',
    401: 'Meta rejected the credentials.',
  };

  if (known[code]) return detail ? `${known[code]} (${detail})` : known[code];
  if (detail) return `Meta error ${code}: ${detail}`;
  return `Meta error ${code ?? response.status}: ${error.message ?? `HTTP ${response.status}`}`;
}

/* ------------------------------------------------------------------ Twilio */

async function sendViaTwilio(phone, message) {
  const { accountSid, authToken, from } = env.whatsapp.twilio;

  const body = new URLSearchParams({
    From: from,
    To: `whatsapp:+${phone}`,
    Body: message.slice(0, 1500),
  });

  try {
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      body.toString(),
      {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000,
        validateStatus: () => true,
      }
    );

    if (response.status >= 200 && response.status < 300) {
      return { sent: true, sid: response.data?.sid, status: response.data?.status };
    }

    return { sent: false, reason: describeTwilioError(response) };
  } catch (err) {
    console.error('[whatsapp] Twilio request failed:', err.message);
    return { sent: false, reason: `Could not reach Twilio: ${err.message}` };
  }
}

/** Twilio's numeric codes are far more useful than its prose. */
function describeTwilioError(response) {
  const code = response.data?.code;
  const detail = response.data?.message ?? `HTTP ${response.status}`;

  // The 24-hour rule is WhatsApp's, not Twilio's: a business may only send
  // freeform text within 24 hours of the recipient's last inbound message.
  // Outside that window only a pre-approved template is allowed. Twilio
  // surfaces this as 63016, and as 21654 when it wants a template id.
  const OUTSIDE_WINDOW =
    'WhatsApp only allows a free-text message within 24 hours of the recipient '
    + 'last messaging you. That window has closed. Ask them to send any message '
    + 'to the sandbox number to reopen it, or use an approved template.';

  const known = {
    20003: 'Twilio rejected the credentials — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
    21211: 'That phone number is not valid. Include the country code, digits only.',
    21608:
      'This number has not joined the WhatsApp sandbox. Ask them to send the '
      + '"join <code>" message to the sandbox number first.',
    21610: 'That number has unsubscribed from these messages.',
    // Not the 24-hour window, despite appearances. Twilio's newer WhatsApp
    // senders reject freeform Body outright and demand a ContentSid on every
    // message. Creating templates needs the Content API, which trial
    // accounts cannot use — so this error on a trial account means the
    // channel simply cannot work without upgrading.
    21654:
      'This Twilio sender requires an approved message template for every message, '
      + 'and template creation is not available on a trial account. Either upgrade the '
      + 'Twilio account, or use the classic WhatsApp Sandbox sender, which allows free '
      + 'text within the 24-hour window.',
    63007: 'The sender number is not a valid WhatsApp sender — check TWILIO_WHATSAPP_FROM.',
    63015: 'The sandbox cannot message this number.',
    63016: OUTSIDE_WINDOW,
    63018: 'Twilio rate limit reached for this sandbox. Wait a moment and retry.',
  };

  if (known[code]) return known[code];
  if (response.status === 401) {
    return 'Twilio rejected the credentials — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.';
  }
  return `Twilio error ${code ?? response.status}: ${detail}`;
}

/* --------------------------------------------------------------- CallMeBot */

/**
 * The opt-in number changes occasionally and silently — an older documented
 * number is now dead and messages to it disappear without any error. The
 * current one lives in client/src/lib/callmebot.js; if opt-in stops working,
 * check https://www.callmebot.com/blog/free-api-whatsapp-messages/ first.
 */
async function sendViaCallMeBot(phone, message, apiKey) {
  const key = (apiKey || env.whatsapp.apiKey || '').trim();
  if (!key) {
    return {
      sent: false,
      reason:
        'No CallMeBot key saved for this contact — they must opt in once to receive WhatsApp alerts',
    };
  }

  try {
    const response = await axios.get('https://api.callmebot.com/whatsapp.php', {
      params: { phone, text: message.slice(0, 900), apikey: key },
      timeout: 12000,
      validateStatus: (status) => status >= 200 && status < 500,
      headers: { 'User-Agent': 'MedConsult/1.0 (academic project)' },
    });

    const body = String(response.data ?? '');

    if (response.status >= 400) {
      return { sent: false, reason: `CallMeBot returned HTTP ${response.status}` };
    }
    // Their error pages come back as HTTP 200 with the problem in the body,
    // so a status check alone would report every failure as a success.
    if (/APIKey.*(invalid|incorrect|not valid)/i.test(body)) {
      return { sent: false, reason: 'The CallMeBot key was rejected — check the contact opted in' };
    }
    if (/not.*registered|didn.?t.*receive.*message|you need to/i.test(body)) {
      return { sent: false, reason: 'That number has not opted in to CallMeBot yet' };
    }
    if (/queued|sent|success|ok/i.test(body)) {
      return { sent: true };
    }

    return {
      sent: false,
      reason: `Unexpected reply from CallMeBot: ${body.replace(/<[^>]*>/g, ' ').trim().slice(0, 120)}`,
    };
  } catch (err) {
    console.error('[whatsapp] CallMeBot request failed:', err.message);
    return { sent: false, reason: err.message };
  }
}
