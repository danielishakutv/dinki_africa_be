const db = require('../../config/database');
const AppError = require('../../utils/AppError');

async function listNotifications(userId) {
  const notifications = await db('notifications')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(100)
    .select('id', 'type', 'title', 'message', 'metadata', 'is_read', 'created_at');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const grouped = {
    today: [],
    earlier: [],
  };

  for (const n of notifications) {
    if (new Date(n.created_at) >= today) {
      grouped.today.push(n);
    } else {
      grouped.earlier.push(n);
    }
  }

  return grouped;
}

async function getNotification(userId, notificationId) {
  const notification = await db('notifications')
    .where({ id: notificationId, user_id: userId })
    .first();

  if (!notification) {
    throw new AppError('Notification not found', 404, 'NOT_FOUND');
  }

  return notification;
}

async function markRead(userId, notificationId) {
  const notification = await db('notifications')
    .where({ id: notificationId, user_id: userId })
    .first();

  if (!notification) {
    throw new AppError('Notification not found', 404, 'NOT_FOUND');
  }

  await db('notifications')
    .where({ id: notificationId })
    .update({ is_read: true });

  return { id: notificationId, is_read: true };
}

async function markAllRead(userId) {
  const updated = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .update({ is_read: true });

  return { marked: updated };
}

async function getUnreadCount(userId) {
  const [{ count }] = await db('notifications')
    .where({ user_id: userId, is_read: false })
    .count('id as count');

  return { count: parseInt(count) };
}

async function registerPushToken(userId, { token, platform }) {
  // For MVP, store in user preferences (jsonb on users table)
  const user = await db('users').where({ id: userId }).first();
  const preferences = user.preferences || {};
  preferences.push_token = token;
  preferences.push_platform = platform || 'web';

  await db('users')
    .where({ id: userId })
    .update({ preferences: JSON.stringify(preferences) });

  return { registered: true };
}

/**
 * Helper: Create a notification (called by other modules)
 * Also emits via Socket.IO if io instance is provided
 */
async function createNotification({ userId, type, title, message, metadata = {} }, io) {
  const [notification] = await db('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      metadata: JSON.stringify(metadata),
    })
    .returning('*');

  // Push real-time via Socket.IO if available
  if (io) {
    io.to(`user:${userId}`).emit('notification:new', notification);
  }

  return notification;
}

module.exports = {
  listNotifications,
  getNotification,
  markRead,
  markAllRead,
  getUnreadCount,
  registerPushToken,
  createNotification,
};
