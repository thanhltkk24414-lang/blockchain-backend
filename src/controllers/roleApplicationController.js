const RoleApplication = require('../models/RoleApplication');
const { DESIRED_ROLES } = require('../models/RoleApplication');
const logger = require('../utils/logger');

/**
 * POST /api/admin/role-applications — submit delegated role request (SIWE auth).
 */
async function createApplication(req, res) {
  try {
    const desiredRole = String(req.body.desiredRole || '').trim();
    const reason = String(req.body.reason || '').trim();

    if (!DESIRED_ROLES.includes(desiredRole)) {
      return res.status(400).json({
        success: false,
        error: 'desiredRole must be pauser, force_resolver, or arbitrator_manager',
      });
    }

    if (reason.length < 20) {
      return res.status(400).json({
        success: false,
        error: 'Reason must be at least 20 characters',
      });
    }

    const walletAddress = req.user.walletAddress.toLowerCase();

    const existingPending = await RoleApplication.findOne({
      walletAddress,
      desiredRole,
      status: 'pending',
    });
    if (existingPending) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending application for this role',
        application: existingPending,
      });
    }

    const application = await RoleApplication.create({
      walletAddress,
      desiredRole,
      reason,
      status: 'pending',
    });

    return res.status(201).json({
      success: true,
      application,
    });
  } catch (error) {
    logger.error('Create role application error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save role application',
    });
  }
}

/**
 * GET /api/admin/role-applications/me — current user's latest applications (SIWE auth).
 */
async function getMyApplications(req, res) {
  try {
    const walletAddress = req.user.walletAddress.toLowerCase();
    const applications = await RoleApplication.find({ walletAddress })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    return res.json({
      success: true,
      applications,
    });
  } catch (error) {
    logger.error('Get my role applications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load applications',
    });
  }
}

/**
 * GET /api/admin/role-applications — list for admin dashboard.
 */
async function listApplications(req, res) {
  try {
    const status = req.query.status || 'pending';
    const filter = status === 'all' ? {} : { status };

    const applications = await RoleApplication.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      applications,
      count: applications.length,
    });
  } catch (error) {
    logger.error('List role applications error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to list role applications',
    });
  }
}

/**
 * PATCH /api/admin/role-applications/:id — update status (reject from admin UI).
 */
async function updateApplicationStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Status must be approved or rejected',
      });
    }

    const application = await RoleApplication.findById(req.params.id);
    if (!application) {
      return res.status(404).json({
        success: false,
        error: 'Application not found',
      });
    }

    if (application.status !== 'pending' && application.status !== status) {
      return res.status(409).json({
        success: false,
        error: `Application already ${application.status}`,
        application,
      });
    }

    application.status = status;
    await application.save();

    return res.json({
      success: true,
      application,
    });
  } catch (error) {
    logger.error('Update role application error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update application',
    });
  }
}

module.exports = {
  createApplication,
  getMyApplications,
  listApplications,
  updateApplicationStatus,
};
