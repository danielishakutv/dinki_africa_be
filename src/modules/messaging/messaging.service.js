const db = require('../../config/database');
const AppError = require('../../utils/AppError');

async function listConversations(userId) {
  const conversations = await db('conversations as c')
    .where('c.participant_1', userId)
    .orWhere('c.participant_2', userId)
    .select('c.*');

  // Enrich each conversation with other participant info, last message, unread count
  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const otherId = conv.participant_1 === userId ? conv.participant_2 : conv.participant_1;

      const other = await db('users')
        .where({ id: otherId })
        .select('id', 'name', 'initials', 'avatar_url', 'avatar_color', 'role')
        .first();

      const lastMessage = await db('messages')
        .where({ conversation_id: conv.id })
        .orderBy('created_at', 'desc')
        .select('id', 'sender_id', 'text', 'image_url', 'is_read', 'created_at')
        .first();

      const [{ count: unreadCount }] = await db('messages')
        .where({ conversation_id: conv.id, is_read: false })
        .whereNot({ sender_id: userId })
        .count('id as count');

      return {
        id: conv.id,
        participant: other,
        last_message: lastMessage || null,
        unread_count: parseInt(unreadCount),
        pinned: (conv.pinned_by || []).includes(userId),
        last_message_at: conv.last_message_at,
        created_at: conv.created_at,
      };
    })
  );

  // Sort by last_message_at descending, pinned first
  enriched.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at);
  });

  return enriched;
}

async function getMessages(userId, conversationId, { cursor, limit = 30 }) {
  // Verify user is participant
  const conv = await db('conversations')
    .where({ id: conversationId })
    .first();

  if (!conv) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  if (conv.participant_1 !== userId && conv.participant_2 !== userId) {
    throw new AppError('Not authorized', 403, 'FORBIDDEN');
  }

  const query = db('messages')
    .where({ conversation_id: conversationId });

  if (cursor) {
    query.where('created_at', '<', cursor);
  }

  const messages = await query
    .orderBy('created_at', 'desc')
    .limit(limit)
    .select('id', 'sender_id', 'text', 'image_url', 'is_read', 'read_at', 'created_at');

  const nextCursor = messages.length === limit ? messages[messages.length - 1].created_at : null;

  return {
    messages: messages.reverse(),
    next_cursor: nextCursor,
  };
}

async function startConversation(userId, { participant_id, text }) {
  if (userId === participant_id) {
    throw new AppError('Cannot start conversation with yourself', 400, 'INVALID_PARTICIPANT');
  }

  // Verify other user exists
  const other = await db('users').where({ id: participant_id, is_active: true }).first();
  if (!other) throw new AppError('User not found', 404, 'USER_NOT_FOUND');

  // Check if conversation already exists (either direction)
  let conv = await db('conversations')
    .where(function () {
      this.where({ participant_1: userId, participant_2: participant_id })
        .orWhere({ participant_1: participant_id, participant_2: userId });
    })
    .first();

  if (!conv) {
    [conv] = await db('conversations')
      .insert({
        participant_1: userId,
        participant_2: participant_id,
      })
      .returning('*');
  }

  // If initial text provided, send it as first message
  let message = null;
  if (text) {
    [message] = await db('messages')
      .insert({
        conversation_id: conv.id,
        sender_id: userId,
        text,
      })
      .returning('*');

    await db('conversations')
      .where({ id: conv.id })
      .update({ last_message_at: message.created_at });
  }

  return { conversation: conv, message };
}

async function sendMessage(userId, conversationId, { text, image_url }) {
  if (!text && !image_url) {
    throw new AppError('Message must have text or image', 400, 'EMPTY_MESSAGE');
  }

  // Verify user is participant
  const conv = await db('conversations')
    .where({ id: conversationId })
    .first();

  if (!conv) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  if (conv.participant_1 !== userId && conv.participant_2 !== userId) {
    throw new AppError('Not authorized', 403, 'FORBIDDEN');
  }

  const [message] = await db('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      text: text || null,
      image_url: image_url || null,
    })
    .returning('*');

  // Update last_message_at
  await db('conversations')
    .where({ id: conversationId })
    .update({ last_message_at: message.created_at });

  return message;
}

async function markAsRead(userId, conversationId) {
  // Verify user is participant
  const conv = await db('conversations').where({ id: conversationId }).first();
  if (!conv) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  if (conv.participant_1 !== userId && conv.participant_2 !== userId) {
    throw new AppError('Not authorized', 403, 'FORBIDDEN');
  }

  const now = new Date();
  const updated = await db('messages')
    .where({ conversation_id: conversationId, is_read: false })
    .whereNot({ sender_id: userId })
    .update({ is_read: true, read_at: now });

  return { marked: updated, read_at: now };
}

async function togglePin(userId, conversationId) {
  const conv = await db('conversations').where({ id: conversationId }).first();
  if (!conv) throw new AppError('Conversation not found', 404, 'NOT_FOUND');
  if (conv.participant_1 !== userId && conv.participant_2 !== userId) {
    throw new AppError('Not authorized', 403, 'FORBIDDEN');
  }

  const pinnedBy = conv.pinned_by || [];
  const isPinned = pinnedBy.includes(userId);
  const newPinnedBy = isPinned
    ? pinnedBy.filter((id) => id !== userId)
    : [...pinnedBy, userId];

  await db('conversations')
    .where({ id: conversationId })
    .update({ pinned_by: JSON.stringify(newPinnedBy) });

  return { pinned: !isPinned };
}

module.exports = {
  listConversations,
  getMessages,
  startConversation,
  sendMessage,
  markAsRead,
  togglePin,
};
