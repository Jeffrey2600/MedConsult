/**
 * CallMeBot opt-in details.
 *
 * Kept in one place because this number keeps changing, silently. Two are
 * already dead (+34 644 51 95 23, then +34 644 33 66 63) and messages sent to
 * a retired number simply vanish — no bounce, no error, nothing to debug. So
 * if opt-in stops working, suspect this number FIRST: check the current one at
 * https://www.callmebot.com/blog/free-api-whatsapp-messages/ and update it
 * here. Verified against the docs on 2026-08-18.
 */
export const CALLMEBOT = {
  /** International format, as displayed to the user. */
  displayNumber: '+34 694 29 84 96',
  /** Digits only, for the wa.me deep link. */
  linkNumber: '34694298496',
  /** Must be sent verbatim — the service matches on the exact wording. */
  optInMessage: 'I allow callmebot to send me messages',
  docsUrl: 'https://www.callmebot.com/blog/free-api-whatsapp-messages/',
};

/** Opens WhatsApp with the opt-in message pre-filled. */
export const optInLink = () =>
  `https://wa.me/${CALLMEBOT.linkNumber}?text=${encodeURIComponent(CALLMEBOT.optInMessage)}`;
