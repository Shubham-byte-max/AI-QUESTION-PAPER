const mongoose = require('mongoose');

const paperSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Paper title is required'],
      trim: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject ID is required'],
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    totalMarks: {
      type: Number,
      required: [true, 'Total marks are required'],
      min: 1,
    },
    duration: {
      type: Number,
      required: [true, 'Duration in minutes is required'],
      min: 1,
    },
    examPattern: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExamPattern',
      default: null,
    },
    syllabus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Syllabus',
      default: null,
    },
    instructions: {
      type: String,
      trim: true,
      default: '',
    },
    sectionDetails: {
      type: [
        {
          name: String,
          questionType: String,
          questionCount: Number,
          attemptQuestions: Number,
          marksPerQuestion: Number,
          difficulty: String,
          requiredMarks: Number,
          instruction: String,

          questionIds: [
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: 'Question',
            },
          ],
        },
      ],
      default: [],
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher ID is required'],
    },
  },
  { timestamps: true },
);

paperSchema.index({ teacherId: 1 });

module.exports = mongoose.model('Paper', paperSchema);
