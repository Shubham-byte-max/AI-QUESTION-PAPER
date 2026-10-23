const mongoose = require('mongoose');

const sectionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Section name is required'],
      trim: true,
    },
    questionType: {
      type: String,
      required: [true, 'Question type is required'],
      enum: ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'],
    },
    questionCount: {
      type: Number,
      required: [true, 'Question count is required'],
      min: [1, 'Question count must be at least 1'],
    },
    marksPerQuestion: {
      type: Number,
      required: [true, 'Marks per question is required'],
      min: [1, 'Marks per question must be at least 1'],
    },
    difficulty: {
      type: String,
      required: [true, 'Difficulty is required'],
      enum: ['Easy', 'Medium', 'Hard', 'Mixed'],
      default: 'Medium',
    },
    attemptQuestions: {
      type: Number,
      min: [1, 'Attempt questions must be at least 1'],
    },
    instruction: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true },
);

const examPatternSchema = new mongoose.Schema(
  {
    patternName: {
      type: String,
      required: [true, 'Pattern name is required'],
      trim: true,
    },
    totalMarks: {
      type: Number,
      required: [true, 'Total marks are required'],
      min: [1, 'Total marks must be at least 1'],
    },
    duration: {
      type: Number,
      required: [true, 'Duration is required'],
      min: [1, 'Duration must be at least 1 minute'],
    },
    sections: {
      type: [sectionSchema],
      validate: {
        validator: function (sections) {
          return sections && sections.length > 0;
        },
        message: 'At least one section is required',
      },
    },
    // Optional subject association (admin can leave it unset)
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
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

examPatternSchema.index({ teacherId: 1 });

module.exports = mongoose.model('ExamPattern', examPatternSchema);
