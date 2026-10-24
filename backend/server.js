require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const subjectRoutes = require('./routes/subjects');
const syllabusRoutes = require('./routes/syllabus');
const questionRoutes = require('./routes/questions');
const examPatternRoutes = require('./routes/examPatterns');
const paperRoutes = require('./routes/papers');

const app = express();

app.use(
  cors({
    origin: [
      'http://localhost:4200',
      'http://localhost:4201',
      'https://shubham-byte-max.github.io',
    ],
    credentials: true,
  }),
);
app.use(express.json());

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected successfully'))
  .catch((err) => console.error('MongoDB connection error:', err.message));

app.get('/', (req, res) => {
  res.json({ message: 'Backend is running successfully!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/exam-patterns', examPatternRoutes);
app.use('/api/papers', paperRoutes);

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      message: 'File is too large. Maximum size is 10MB.',
    });
  }

  if (err.message && err.message.includes('Unsupported file type')) {
    return res.status(400).json({
      message: err.message,
    });
  }

  return res.status(500).json({ message: 'Server error. Please try again.' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
