'use strict';

const express        = require('express');
const { getHealth }  = require('../controllers/healthController');

const router = express.Router();

// GET /health — system health check
router.get('/', getHealth);

module.exports = router;
