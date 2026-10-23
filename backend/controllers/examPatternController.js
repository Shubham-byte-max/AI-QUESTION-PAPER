const ExamPattern = require('../models/ExamPattern');
const Subject = require('../models/Subject');

const VALID_TYPES = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed'];

function sanitizeSections(sections) {
  if (!Array.isArray(sections) || sections.length === 0) return null;

  const cleaned = [];
  for (const s of sections) {
    const name = (s.name || '').trim();
    if (!name) return { error: 'Section name is required' };
    if (!VALID_TYPES.includes(s.questionType)) {
      return { error: `Invalid question type: "${s.questionType}"` };
    }
    const count = parseInt(s.questionCount, 10);
    if (isNaN(count) || count < 1) {
      return { error: `Invalid question count in section "${name}"` };
    }
    const marks = parseInt(s.marksPerQuestion, 10);
    if (isNaN(marks) || marks < 1) {
      return { error: `Invalid marks per question in section "${name}"` };
    }
    const rawDifficulty =
      s.difficulty === undefined || s.difficulty === null ? '' : String(s.difficulty).trim();
    // When NO difficulty was supplied, "Medium" is the clearly defined
    // default (see TC25). An explicitly supplied but invalid value is a
    // validation error - never silently coerce it to "Medium".
    let difficulty;
    if (!rawDifficulty) {
      difficulty = 'Medium';
    } else if (!VALID_DIFFICULTIES.includes(rawDifficulty)) {
      return {
        error: `Invalid difficulty in section "${name}": must be one of ${VALID_DIFFICULTIES.join(', ')}`,
      };
    } else {
      difficulty = rawDifficulty;
    }

    const attempt = parseInt(s.attemptQuestions, 10);
    const attemptQuestions = !isNaN(attempt) && attempt >= 1 && attempt <= count ? attempt : count;

    let instruction = (s.instruction || '').trim();

    if (!instruction && attemptQuestions < count) {
      instruction = `Attempt any ${attemptQuestions} out of ${count} questions. Each question carries ${marks} marks.`;
    }

    cleaned.push({
      name,
      questionType: s.questionType,
      questionCount: count,
      marksPerQuestion: marks,
      difficulty,
      attemptQuestions,
      instruction,
    });
  }
  return cleaned;
}

function attemptedMarks(sections) {
  return sections.reduce(
    (sum, s) => sum + (s.attemptQuestions || s.questionCount) * s.marksPerQuestion,
    0,
  );
}

async function validateSubject(subjectId, teacherId) {
  if (!subjectId) return { value: null };
  const subject = await Subject.findOne({ _id: subjectId, teacherId });
  if (!subject) return { error: 'Invalid subject' };
  return { value: subject._id };
}

exports.getPatterns = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { search } = req.query;

    const filter = { teacherId };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.patternName = regex;
    }

    const patterns = await ExamPattern.find(filter).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      patterns: patterns.map((p) => ({
        id: p._id,
        patternName: p.patternName,
        totalMarks: p.totalMarks,
        duration: p.duration,
        subjectId: p.subjectId || null,
        sections: p.sections.map((s) => ({
          id: s._id,
          name: s.name,
          questionType: s.questionType,
          questionCount: s.questionCount,
          marksPerQuestion: s.marksPerQuestion,
          difficulty: s.difficulty,
          attemptQuestions: s.attemptQuestions || s.questionCount,
          instruction: s.instruction || '',
        })),
        calculatedMarks: attemptedMarks(p.sections),
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get patterns error:', error);
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.getPattern = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const pattern = await ExamPattern.findOne({
      _id: req.params.id,
      teacherId,
    }).lean();

    if (!pattern) {
      return res.status(404).json({ message: 'Pattern not found' });
    }

    return res.status(200).json({
      pattern: {
        id: pattern._id,
        patternName: pattern.patternName,
        totalMarks: pattern.totalMarks,
        duration: pattern.duration,
        sections: pattern.sections.map((s) => ({
          id: s._id,
          name: s.name,
          questionType: s.questionType,
          questionCount: s.questionCount,
          marksPerQuestion: s.marksPerQuestion,
          difficulty: s.difficulty,
          attemptQuestions: s.attemptQuestions || s.questionCount,
          instruction: s.instruction || '',
        })),
        subjectId: pattern.subjectId || null,
        createdAt: pattern.createdAt,
      },
    });
  } catch (error) {
    console.error('Get pattern error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Pattern not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.createPattern = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { patternName, totalMarks, duration, sections, subjectId } = req.body;

    if (!patternName || !totalMarks || !duration) {
      return res.status(400).json({
        message: 'Pattern name, total marks, and duration are required',
      });
    }

    const cleanName = patternName.trim();
    if (cleanName.length < 2) {
      return res.status(400).json({ message: 'Pattern name must be at least 2 characters' });
    }

    const numTotalMarks = parseInt(totalMarks, 10);
    if (isNaN(numTotalMarks) || numTotalMarks < 1) {
      return res.status(400).json({ message: 'Total marks must be at least 1' });
    }

    const numDuration = parseInt(duration, 10);
    if (isNaN(numDuration) || numDuration < 1) {
      return res.status(400).json({ message: 'Duration must be at least 1 minute' });
    }

    const cleanedSections = sanitizeSections(sections);
    if (!Array.isArray(cleanedSections)) {
      return res.status(400).json({ message: cleanedSections.error });
    }

    const calculatedMarks = attemptedMarks(cleanedSections);

    if (calculatedMarks !== numTotalMarks) {
      return res.status(400).json({
        message: `Section totals (${calculatedMarks}) don't match total marks (${numTotalMarks})`,
      });
    }

    const subjectCheck = await validateSubject(subjectId, teacherId);
    if (subjectCheck.error) {
      return res.status(400).json({ message: subjectCheck.error });
    }

    const pattern = await ExamPattern.create({
      patternName: cleanName,
      totalMarks: numTotalMarks,
      duration: numDuration,
      sections: cleanedSections,
      subjectId: subjectCheck.value,
      teacherId,
    });

    console.log('Pattern created:', pattern._id, 'by teacher:', teacherId);

    return res.status(201).json({
      message: 'Pattern created successfully',
      pattern: {
        id: pattern._id,
        patternName: pattern.patternName,
        totalMarks: pattern.totalMarks,
        duration: pattern.duration,
        sections: pattern.sections.map((s) => ({
          id: s._id,
          name: s.name,
          questionType: s.questionType,
          questionCount: s.questionCount,
          marksPerQuestion: s.marksPerQuestion,
          difficulty: s.difficulty,
          attemptQuestions: s.attemptQuestions || s.questionCount,
          instruction: s.instruction || '',
        })),
        subjectId: pattern.subjectId || null,
        calculatedMarks,
        createdAt: pattern.createdAt,
      },
    });
  } catch (error) {
    console.error('Create pattern error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.updatePattern = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { patternName, totalMarks, duration, sections, subjectId } = req.body;

    if (!patternName || !totalMarks || !duration) {
      return res.status(400).json({
        message: 'Pattern name, total marks, and duration are required',
      });
    }

    const cleanName = patternName.trim();
    if (cleanName.length < 2) {
      return res.status(400).json({ message: 'Pattern name must be at least 2 characters' });
    }

    const numTotalMarks = parseInt(totalMarks, 10);
    if (isNaN(numTotalMarks) || numTotalMarks < 1) {
      return res.status(400).json({ message: 'Total marks must be at least 1' });
    }

    const numDuration = parseInt(duration, 10);
    if (isNaN(numDuration) || numDuration < 1) {
      return res.status(400).json({ message: 'Duration must be at least 1 minute' });
    }

    const cleanedSections = sanitizeSections(sections);
    if (!Array.isArray(cleanedSections)) {
      return res.status(400).json({ message: cleanedSections.error });
    }

    const calculatedMarks = attemptedMarks(cleanedSections);

    // Attempt-based marks validation (same rule as create)
    if (calculatedMarks !== numTotalMarks) {
      return res.status(400).json({
        message: `Section totals (${calculatedMarks}) don't match total marks (${numTotalMarks})`,
      });
    }

    const updateData = {
      patternName: cleanName,
      totalMarks: numTotalMarks,
      duration: numDuration,
      sections: cleanedSections,
    };

    if (subjectId !== undefined) {
      const subjectCheck = await validateSubject(subjectId, teacherId);
      if (subjectCheck.error) {
        return res.status(400).json({ message: subjectCheck.error });
      }
      updateData.subjectId = subjectCheck.value;
    }

    const pattern = await ExamPattern.findOneAndUpdate(
      { _id: req.params.id, teacherId },
      updateData,
      { new: true, runValidators: true },
    );

    if (!pattern) {
      return res.status(404).json({ message: 'Pattern not found' });
    }

    return res.status(200).json({
      message: 'Pattern updated successfully',
      pattern: {
        id: pattern._id,
        patternName: pattern.patternName,
        totalMarks: pattern.totalMarks,
        duration: pattern.duration,
        sections: pattern.sections.map((s) => ({
          id: s._id,
          name: s.name,
          questionType: s.questionType,
          questionCount: s.questionCount,
          marksPerQuestion: s.marksPerQuestion,
          difficulty: s.difficulty,
          attemptQuestions: s.attemptQuestions || s.questionCount,
          instruction: s.instruction || '',
        })),
        subjectId: pattern.subjectId || null,
        calculatedMarks,
        createdAt: pattern.createdAt,
      },
    });
  } catch (error) {
    console.error('Update pattern error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Pattern not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.deletePattern = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const pattern = await ExamPattern.findOneAndDelete({
      _id: req.params.id,
      teacherId,
    });

    if (!pattern) {
      return res.status(404).json({ message: 'Pattern not found' });
    }

    return res.status(200).json({ message: 'Pattern deleted successfully' });
  } catch (error) {
    console.error('Delete pattern error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Pattern not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
