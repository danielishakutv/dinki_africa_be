/**
 * Admin module — top-level controllers.
 *
 * Every admin endpoint is gated by the `authorize('admin', 'superadmin')`
 * middleware mounted in admin.routes.js. Controllers here MUST NOT re-check
 * roles — trust the router-level guard, keep handlers focused on behaviour.
 */

exports.ping = (req, res) => {
  res.json({
    success: true,
    data: {
      ok: true,
      role: req.user.role,
      userId: req.user.id,
      serverTime: new Date().toISOString(),
    },
  });
};
