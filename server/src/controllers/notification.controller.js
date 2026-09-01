import { Notification, Message, Appointment } from '../models/index.js';
import { ApiError, asyncHandler } from '../utils/ApiError.js';
import { ROLES } from '../utils/constants.js';

export const listNotifications = asyncHandler(async (req, res) => {
  const { unreadOnly = false, page = 1, limit = 20 } = req.validatedQuery ?? {};

  const filter = { user: req.user._id };
  if (unreadOnly) filter.isRead = false;

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: req.user._id, isRead: false }),
  ]);

  res.json({
    success: true,
    notifications,
    unreadCount,
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  });
});

export const getUnreadCount = asyncHandler(async (req, res) => {
  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    isRead: false,
  });
  res.json({ success: true, unreadCount });
});

export const markRead = asyncHandler(async (req, res) => {
  // Scoped to the caller, so an id belonging to someone else simply matches
  // nothing rather than exposing or altering their notification.
  const updated = await Notification.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    { $set: { isRead: true } },
    { new: true }
  );
  if (!updated) throw ApiError.notFound('Notification not found');
  res.json({ success: true, notification: updated });
});

export const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { user: req.user._id, isRead: false },
    { $set: { isRead: true } }
  );
  res.json({ success: true, updated: result.modifiedCount });
});

/**
 * Chat history for one appointment. Messages are delivered live over the
 * socket; this is what makes them survive a page refresh.
 */
export const listMessages = asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.appointmentId).lean();
  if (!appointment) throw ApiError.notFound('Appointment not found');

  const isParticipant =
    String(appointment.patient) === String(req.user._id) ||
    String(appointment.doctor) === String(req.user._id);

  if (!isParticipant && req.user.role !== ROLES.ADMIN) {
    throw ApiError.forbidden('This is not your appointment');
  }

  const messages = await Message.find({ appointment: appointment._id })
    .populate('sender', 'name avatarUrl')
    .sort({ createdAt: 1 })
    .limit(500)
    .lean();

  res.json({ success: true, messages });
});
