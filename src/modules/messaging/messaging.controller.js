const service = require('./messaging.service');

exports.listConversations = async (req, res, next) => {
  try {
    const conversations = await service.listConversations(req.user.id);
    res.json({ success: true, data: conversations });
  } catch (err) {
    next(err);
  }
};

exports.getMessages = async (req, res, next) => {
  try {
    const { cursor, limit } = req.query;
    const result = await service.getMessages(req.user.id, req.params.id, { cursor, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.startConversation = async (req, res, next) => {
  try {
    const result = await service.startConversation(req.user.id, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.sendMessage = async (req, res, next) => {
  try {
    const message = await service.sendMessage(req.user.id, req.params.id, req.body);

    // Emit via Socket.IO if available
    const io = req.app.get('io');
    if (io) {
      const conv = await require('../../config/database')('conversations')
        .where({ id: req.params.id })
        .first();
      const recipientId = conv.participant_1 === req.user.id ? conv.participant_2 : conv.participant_1;
      io.to(`user:${recipientId}`).emit('message:new', { message });
      io.to(`user:${req.user.id}`).emit('message:delivered', { messageId: message.id });
    }

    res.status(201).json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const result = await service.markAsRead(req.user.id, req.params.id);

    // Emit read receipt via Socket.IO
    const io = req.app.get('io');
    if (io) {
      const conv = await require('../../config/database')('conversations')
        .where({ id: req.params.id })
        .first();
      const otherId = conv.participant_1 === req.user.id ? conv.participant_2 : conv.participant_1;
      io.to(`user:${otherId}`).emit('message:read', {
        conversationId: req.params.id,
        readAt: result.read_at,
      });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

exports.togglePin = async (req, res, next) => {
  try {
    const result = await service.togglePin(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
