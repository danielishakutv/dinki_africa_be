const { body, query } = require('express-validator');

const updateProfileSchema = [
  body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('bio').optional().trim().isLength({ max: 500 }).withMessage('Bio max 500 characters'),
  body('phone').optional().trim().isLength({ max: 20 }),
  body('location_city').optional().trim().isLength({ max: 100 }),
  body('location_state').optional().trim().isLength({ max: 100 }),
  body('specialties').optional().isArray({ max: 10 }).withMessage('Max 10 specialties'),
];

const onboardingSchema = [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name is required'),
  body('location_city').trim().notEmpty().withMessage('City is required'),
  body('location_state').trim().notEmpty().withMessage('State is required'),
  body('specialties').optional().isArray({ max: 10 }),
];

const preferencesSchema = [
  body('notifications').optional().isBoolean(),
  body('darkMode').optional().isBoolean(),
  body('language').optional().isIn(['en', 'fr', 'ha', 'yo', 'ig']),
];

const searchUsersSchema = [
  query('q').trim().isLength({ min: 2, max: 100 }).withMessage('Search query must be 2-100 characters'),
  query('role').optional().isIn(['customer', 'tailor']).withMessage('Role must be customer or tailor'),
];

module.exports = { updateProfileSchema, onboardingSchema, preferencesSchema, searchUsersSchema };
