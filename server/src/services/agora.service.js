// agora-token ships as CommonJS, so its exports come off the default import
// rather than as named ESM exports.
import agoraToken from 'agora-token';
import { env, features } from '../config/env.js';

const { RtcTokenBuilder, RtcRole } = agoraToken;

/**
 * Mints a short-lived Agora RTC token for one participant of one channel.
 *
 * Tokens are always generated server-side: the App Certificate never reaches
 * the browser, and the token is scoped to a single channel and expires within
 * the hour, so it cannot be reused to join arbitrary calls later.
 *
 * A string user account (the Mongo user id) is used rather than a numeric
 * uid, so the far side can identify who joined without a lookup table.
 */
export function buildRtcToken({ channelName, userId }) {
  if (!features.agora) {
    throw new Error('Agora is not configured');
  }

  const ttl = env.agora.tokenTtlSeconds;
  const privilegeExpire = Math.floor(Date.now() / 1000) + ttl;

  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    env.agora.appId,
    env.agora.appCertificate,
    channelName,
    String(userId),
    RtcRole.PUBLISHER,
    ttl,
    privilegeExpire
  );

  return {
    token,
    appId: env.agora.appId,
    uid: String(userId),
    expiresAt: new Date(privilegeExpire * 1000).toISOString(),
  };
}

/**
 * Room name for the no-keys fallback. Namespaced so it cannot collide with
 * an unrelated public room on meet.jit.si, which anyone can join by guessing
 * a short name.
 */
export function buildJitsiRoom(appointmentId) {
  return `medconsult-${appointmentId}`;
}
