'use strict';

const express                   = require('express');
const { getNotificationStatus } = require('../controllers/notificationController');

const router = express.Router();

// GET /api/v1/notifications/:id – fetch current notification state
router.get('/:id', getNotificationStatus);

module.exports = router;
