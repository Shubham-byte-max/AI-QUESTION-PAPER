const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Topic name is required'],
      trim: true,
    },
    weightage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  { _id: false },
);

const syllabusSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Syllabus title is required'],
      trim: true,
    },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject ID is required'],
    },
    topics: {
      type: [topicSchema],
      default: [],
    },
    content: {
      type: String,
      default: '',
    },
    sourceType: {
      type: String,
      enum: ['manual', 'file'],
      default: 'manual',
    },
    sourceFileName: {
      type: String,
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

syllabusSchema.index({ teacherId: 1 });

module.exports = mongoose.model('Syllabus', syllabusSchema);
