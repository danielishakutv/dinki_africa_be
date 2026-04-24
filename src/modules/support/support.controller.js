const service = require('./support.service');

exports.createTicket = async (req, res, next) => {
  try {
    const result = await service.createTicket({
      submitter: req.user,
      form: {
        name: req.body.name,
        email: req.body.email,
        category: req.body.category,
        subject: req.body.subject,
        message: req.body.message,
      },
      ip: req.ip,
      io: req.app.get('io'),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};
