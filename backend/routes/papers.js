const express = require('express');
const {
  getPapers,
  getPaper,
  createPaper,
  updatePaper,
  deletePaper,
  generatePaper,
  regenerateQuestion,
} = require('../controllers/paperController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getPapers);
router.get('/:id', protect, getPaper);
router.post('/', protect, createPaper);
router.post('/generate', protect, generatePaper);
router.post('/regenerate-question', protect, regenerateQuestion);
router.put('/:id', protect, updatePaper);
router.delete('/:id', protect, deletePaper);

module.exports = router;
