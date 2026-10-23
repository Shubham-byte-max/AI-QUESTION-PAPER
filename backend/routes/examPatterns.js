const express = require('express');
const {
  getPatterns,
  getPattern,
  createPattern,
  updatePattern,
  deletePattern,
} = require('../controllers/examPatternController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getPatterns);
router.get('/:id', protect, getPattern);
router.post('/', protect, createPattern);
router.put('/:id', protect, updatePattern);
router.delete('/:id', protect, deletePattern);

module.exports = router;
