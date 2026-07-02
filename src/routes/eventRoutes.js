'use strict';

const express         = require('express');
const { handleEvent } = require('../controllers/eventController');

const router = express.Router();

// POST /api/v1/events – trigger a business event
router.post('/', handleEvent);

module.exports = router;
