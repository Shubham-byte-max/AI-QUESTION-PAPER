const express = require('express');
const multer = require('multer');
const {
  getSyllabi,
  getSyllabus,
  createSyllabus,
  updateSyllabus,
  deleteSyllabus,
  uploadSyllabus,
} = require('../controllers/syllabusController');
const { protect } = require('../middleware/auth');

const router = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type. Please upload PDF, DOCX, or TXT.'));
    }
  },
});

router.get('/', protect, getSyllabi);
router.get('/:id', protect, getSyllabus);
router.post('/', protect, createSyllabus);
router.put('/:id', protect, updateSyllabus);
router.delete('/:id', protect, deleteSyllabus);
router.post('/upload', protect, upload.single('file'), uploadSyllabus);

module.exports = router;
