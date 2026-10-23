const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Question type is required'],
      enum: ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'],
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty level is required'],
      enum: ['Easy', 'Medium', 'Hard'],
    },
    options: {
      type: [String],
      default: [],
    },
    answer: {
      type: String,
      trim: true,
      default: '',
    },
    marks: {
      type: Number,
      required: [true, 'Marks are required'],
      min: 1,
    },
    topic: {
      type: String,
      trim: true,
      default: '',
    },
    source: {
      type: String,
      trim: true,
      default: '',
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject ID is required'],
    },
    // The paper this question was generated/saved under. Null means a
    // standalone bank question (legacy data or AI bank saves).
    paperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Paper',
      required: false,
      default: null,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher ID is required'],
    },
  },
  { timestamps: true },
);

questionSchema.index({ teacherId: 1 });
questionSchema.index({ teacherId: 1, subjectId: 1 });
questionSchema.index({ teacherId: 1, paperId: 1 });

module.exports = mongoose.model('Question', questionSchema);
