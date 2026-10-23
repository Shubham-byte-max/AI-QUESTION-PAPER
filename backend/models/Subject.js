const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    semester: {
      type: Number,
      required: [true, 'Semester is required'],
      min: 1,
      max: 8,
    },

    board: {
      type: String,
      trim: true,
      default: '',
    },
    classLevel: {
      type: String,
      trim: true,
      default: '',
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher ID is required'],
    },
  },
  { timestamps: true },
);

subjectSchema.index({ teacherId: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);
