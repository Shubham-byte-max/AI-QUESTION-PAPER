const express = require('express');
const {
  getQuestions,
  getQuestion,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  generateQuestions,
  generateSets,
  saveGeneratedQuestions,
} = require('../controllers/questionController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.get('/', protect, getQuestions);
router.get('/:id', protect, getQuestion);
router.post('/', protect, createQuestion);
router.post('/generate', protect, generateQuestions);
router.post('/generate-sets', protect, generateSets);
router.post('/save-generated', protect, saveGeneratedQuestions);
router.put('/:id', protect, updateQuestion);
router.delete('/:id', protect, deleteQuestion);

module.exports = router;
