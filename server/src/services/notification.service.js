import { Notification } from '../models/index.js';
import { emitToUser, emitToRole } from '../sockets/index.js';
import { ROLES } from '../utils/constants.js';

/**
 * Creates an in-app notification and pushes it over the socket in one step,
 * so a user sitting on a dashboard sees it without refreshing.
 *
 * Never throws: a notification is a side effect of some other action, and
 * failing to record it must not fail the action itself.
 */
export async function notify({ user, type, title, body = '', link = '' }) {
  try {
    const doc = await Notification.create({ user, type, title, body, link });
    emitToUser(user, 'notification:new', {
      id: String(doc._id),
      type,
      title,
      body,
      link,
      isRead: false,
      createdAt: doc.createdAt,
    });
    return doc;
  } catch (err) {
    console.error('[notify] Could not create notification:', err.message);
    return null;
  }
}

/** Fan a notification out to every administrator. */
export async function notifyAdmins({ type, title, body = '', link = '' }) {
  try {
    const { User } = await import('../models/index.js');
    const admins = await User.find({ role: ROLES.ADMIN, isActive: true })
      .select('_id')
      .lean();

    await Promise.all(
      admins.map((a) => Notification.create({ user: a._id, type, title, body, link }))
    );

    emitToRole(ROLES.ADMIN, 'notification:new', {
      type,
      title,
      body,
      link,
      isRead: false,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error('[notify] Could not notify admins:', err.message);
  }
}
