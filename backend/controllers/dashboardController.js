const Subject = require('../models/Subject');
const Syllabus = require('../models/Syllabus');
const Question = require('../models/Question');
const Paper = require('../models/Paper');

exports.getDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const [
      totalSubjects,
      totalSyllabus,
      totalQuestions,
      totalPapers,
      recentPapers,
      recentQuestions,
      difficultySummary,
      typeSummary,
    ] = await Promise.all([
      Subject.countDocuments({ teacherId }),
      Syllabus.countDocuments({ teacherId }),
      Question.countDocuments({ teacherId }),
      Paper.countDocuments({ teacherId }),
      Paper.find({ teacherId })
        .populate('subjectId', 'name code')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Question.find({ teacherId })
        .populate('subjectId', 'name code')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Question.aggregate([
        { $match: { teacherId: teacherId } },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
      ]),
      Question.aggregate([
        { $match: { teacherId: teacherId } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    const difficulty = { Easy: 0, Medium: 0, Hard: 0 };
    difficultySummary.forEach((d) => {
      if (difficulty.hasOwnProperty(d._id)) {
        difficulty[d._id] = d.count;
      }
    });

    const types = {};
    typeSummary.forEach((t) => {
      types[t._id] = t.count;
    });

    return res.status(200).json({
      stats: {
        totalSubjects,
        totalSyllabus,
        totalQuestions,
        totalPapers,
      },
      recentPapers: recentPapers.map((p) => ({
        id: p._id,
        title: p.title,
        subject: p.subjectId ? p.subjectId.name : 'N/A',
        totalMarks: p.totalMarks,
        duration: p.duration,
        questionCount: p.questions.length,
        createdAt: p.createdAt,
      })),
      recentQuestions: recentQuestions.map((q) => ({
        id: q._id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        marks: q.marks,
        subject: q.subjectId ? q.subjectId.name : 'N/A',
        createdAt: q.createdAt,
      })),
      difficultySummary: difficulty,
      typeSummary: types,
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
