const mongoose = require('mongoose');
const Paper = require('../models/Paper');
const Question = require('../models/Question');
const Subject = require('../models/Subject');
const Syllabus = require('../models/Syllabus');
const ExamPattern = require('../models/ExamPattern');
const { generateQuestions: aiGenerate } = require('../services/aiService');

const VALID_TYPES = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
function sanitizeId(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  if (!/^[0-9a-fA-F]{24}$/.test(str)) {
    throw badRequest(`Invalid ${label} reference`);
  }
  return str;
}

async function resolveQuestions({ questions, questionIds }, teacherId, subjectId, paperId) {
  const refs = [];

  if (Array.isArray(questions) && questions.length > 0) {
    // Every paper question must belong to exactly one paper.
    if (!paperId) {
      throw badRequest('A paper ID is required to save paper questions');
    }
    const seenTexts = new Set();
    for (const q of questions) {
      const cleanText = (q.text || '').trim();
      if (cleanText.length < 5) continue;

      if (!VALID_TYPES.includes(q.type)) {
        throw badRequest(`Invalid question type: "${q.type}"`);
      }
      if (!VALID_DIFFICULTIES.includes(q.difficulty)) {
        throw badRequest(`Invalid question difficulty: "${q.difficulty}"`);
      }
      const qMarks = parseInt(q.marks, 10);
      if (isNaN(qMarks) || qMarks < 1) {
        throw badRequest(`Invalid marks for question: "${cleanText.substring(0, 40)}"`);
      }

      const normalizedText = cleanText.toLowerCase().replace(/\s+/g, ' ').trim();
      // Dedupe is scoped to THIS paper only, so questions are never
      // shared with or pulled in from another paper.
      if (seenTexts.has(normalizedText)) {
        continue;
      }
      const duplicate = await Question.findOne({
        teacherId,
        subjectId,
        paperId,
        text: {
          $regex: new RegExp(
            '^' + normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
            'i',
          ),
        },
      }).lean();

      const section = (q.section || '').trim();
      if (duplicate) {
        seenTexts.add(normalizedText);
        refs.push({ id: duplicate._id, section });
        continue;
      }

      const savedQuestion = await Question.create({
        text: cleanText,
        type: q.type,
        difficulty: q.difficulty,
        options:
          q.type === 'MCQ'
            ? (q.options || []).map((o) => String(o).trim()).filter((o) => o.length > 0)
            : q.type === 'True/False'
              ? ['True', 'False']
              : [],
        answer: (q.answer || '').trim(),
        marks: qMarks,
        topic: (q.topic || '').trim(),
        source: q.source || 'Paper Generated',
        subjectId,
        teacherId,
        paperId,
      });

      seenTexts.add(normalizedText);
      refs.push({ id: savedQuestion._id, section });
    }

    if (refs.length === 0) throw badRequest('No valid questions to save');
    return { ids: refs.map((r) => r.id), refs };
  }

  if (Array.isArray(questionIds) && questionIds.length > 0) {
    const validQuestions = await Question.find({
      _id: { $in: questionIds },
      teacherId,
    }).lean();
    if (validQuestions.length === 0) throw badRequest('No valid questions found');
    return { ids: validQuestions.map((q) => q._id), refs: [] };
  }

  throw badRequest('No valid questions to save');
}

function buildSectionDetails(sectionDetails, refs) {
  if (!Array.isArray(sectionDetails)) return [];
  return sectionDetails.map((d) => ({
    name: d.name || '',
    questionType: d.questionType || '',
    questionCount: parseInt(d.questionCount, 10) || 0,
    attemptQuestions: parseInt(d.attemptQuestions, 10) || undefined,
    marksPerQuestion: parseFloat(d.marksPerQuestion) || 0,
    difficulty: d.difficulty || '',
    requiredMarks: parseFloat(d.requiredMarks) || 0,
    instruction: d.instruction || '',
    questionIds: refs.filter((r) => r.section && r.section === (d.name || '')).map((r) => r.id),
  }));
}

function buildSectionMap(paper) {
  const map = new Map();
  for (const d of paper.sectionDetails || []) {
    for (const qid of d.questionIds || []) {
      map.set(String(qid), d.name);
    }
  }
  return map;
}

exports.getPapers = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { search } = req.query;

    const filter = { teacherId };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.title = regex;
    }

    const papers = await Paper.find(filter)
      .populate('subjectId', 'name code semester board classLevel')
      .populate('examPattern', 'patternName')
      .populate('syllabus', 'title')
      .populate('questions')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      papers: papers.map((p) => ({
        id: p._id,
        title: p.title,
        subjectId: p.subjectId?._id,
        subjectName: p.subjectId?.name,
        subjectCode: p.subjectId?.code,
        board: p.subjectId?.board || '',
        classLevel: p.subjectId?.classLevel || '',
        questions: (p.questions || [])
          .filter((q) => q)
          .map((q) => ({
            id: q._id,
            text: q.text,
            type: q.type,
            difficulty: q.difficulty,
            options: q.options,
            answer: q.answer,
            marks: q.marks,
            topic: q.topic,
            paperId: q.paperId ? String(q.paperId) : String(p._id),

            section: buildSectionMap(p).get(String(q._id)) || '',
          })),
        totalMarks: p.totalMarks,
        duration: p.duration,
        questionCount: (p.questions || []).filter((q) => q).length,
        examPattern: p.examPattern?.patternName || null,
        syllabus: p.syllabus?.title || null,
        instructions: p.instructions || '',
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error('Get papers error:', error);
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.getPaper = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const paper = await Paper.findOne({ _id: req.params.id, teacherId })
      .populate('subjectId', 'name code semester board classLevel')
      .populate('examPattern', 'patternName')
      .populate('syllabus', 'title')
      .populate('questions')
      .lean();

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    return res.status(200).json({
      paper: {
        id: paper._id,
        title: paper.title,
        subjectId: paper.subjectId._id,
        subjectName: paper.subjectId.name,
        subjectCode: paper.subjectId.code,
        semester: paper.subjectId.semester || null,
        board: paper.subjectId.board || '',
        classLevel: paper.subjectId.classLevel || '',
        questions: (paper.questions || [])
          .filter((q) => q)
          .map((q) => ({
            id: q._id,
            text: q.text,
            type: q.type,
            difficulty: q.difficulty,
            options: q.options,
            answer: q.answer,
            marks: q.marks,
            topic: q.topic,
            paperId: q.paperId ? String(q.paperId) : String(paper._id),

            section: buildSectionMap(paper).get(String(q._id)) || '',
          })),
        totalMarks: paper.totalMarks,
        duration: paper.duration,
        examPattern: paper.examPattern?.patternName || null,

        examPatternId: paper.examPattern?._id ? String(paper.examPattern._id) : null,
        syllabus: paper.syllabus?.title || null,
        syllabusId: paper.syllabus?._id ? String(paper.syllabus._id) : null,
        instructions: paper.instructions || '',
        sectionDetails: paper.sectionDetails || [],
        createdAt: paper.createdAt,
        updatedAt: paper.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get paper error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Paper not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.createPaper = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const {
      title,
      subjectId,
      questionIds,
      totalMarks,
      duration,
      questions,
      examPattern,
      syllabus,
      instructions,
      sectionDetails,
    } = req.body;

    if (!title || !subjectId) {
      return res.status(400).json({
        message: 'Title and subject are required',
      });
    }

    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      return res.status(400).json({ message: 'Paper title must be at least 2 characters' });
    }

    const cleanSubjectId = sanitizeId(subjectId, 'subject');
    const cleanExamPatternId = sanitizeId(examPattern, 'exam pattern');
    const cleanSyllabusId = sanitizeId(syllabus, 'syllabus');

    const subject = await Subject.findOne({ _id: cleanSubjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const numTotalMarks = parseInt(totalMarks, 10);
    if (isNaN(numTotalMarks) || numTotalMarks < 1) {
      return res.status(400).json({ message: 'Total marks must be at least 1' });
    }

    const numDuration = parseInt(duration, 10);
    if (isNaN(numDuration) || numDuration < 1) {
      return res.status(400).json({ message: 'Duration must be at least 1 minute' });
    }

    // Every paper gets its own unique ID first, so every question saved
    // below is stamped with exactly this paper's ID and can never merge
    // with another paper.
    const newPaperId = new mongoose.Types.ObjectId();
    const resolved = await resolveQuestions(
      { questions, questionIds },
      teacherId,
      cleanSubjectId,
      newPaperId,
    );
    const finalQuestionIds = resolved.ids;

    const paper = await Paper.create({
      _id: newPaperId,
      title: cleanTitle,
      subjectId: cleanSubjectId,
      questions: finalQuestionIds,
      totalMarks: numTotalMarks,
      duration: numDuration,
      examPattern: cleanExamPatternId,
      syllabus: cleanSyllabusId,
      instructions: instructions || '',

      sectionDetails: buildSectionDetails(sectionDetails, resolved.refs),
      teacherId,
    });

    console.log('Paper created:', paper._id, 'by teacher:', teacherId);

    return res.status(201).json({
      message: 'Paper created successfully',
      paper: {
        id: paper._id,
        title: paper.title,
        subjectId: paper.subjectId,
        totalMarks: paper.totalMarks,
        duration: paper.duration,
        questionCount: finalQuestionIds.length,
        createdAt: paper.createdAt,
      },
    });
  } catch (error) {
    console.error('Create paper error:', error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.updatePaper = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const {
      title,
      subjectId,
      questionIds,
      questions,
      totalMarks,
      duration,
      examPattern,
      syllabus,
      instructions,
      sectionDetails,
    } = req.body;

    if (!title || !subjectId) {
      return res.status(400).json({
        message: 'Title and subject are required',
      });
    }

    const cleanTitle = title.trim();
    if (cleanTitle.length < 2) {
      return res.status(400).json({ message: 'Paper title must be at least 2 characters' });
    }

    const cleanSubjectId = sanitizeId(subjectId, 'subject');
    const cleanExamPatternId = sanitizeId(examPattern, 'exam pattern');
    const cleanSyllabusId = sanitizeId(syllabus, 'syllabus');

    const subject = await Subject.findOne({ _id: cleanSubjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const numTotalMarks = parseInt(totalMarks, 10);
    if (isNaN(numTotalMarks) || numTotalMarks < 1) {
      return res.status(400).json({ message: 'Total marks must be at least 1' });
    }

    const numDuration = parseInt(duration, 10);
    if (isNaN(numDuration) || numDuration < 1) {
      return res.status(400).json({ message: 'Duration must be at least 1 minute' });
    }

    let resolvedIds = [];
    let refs = [];
    if (Array.isArray(questions) && questions.length > 0) {
      if (!/^[0-9a-fA-F]{24}$/.test(String(req.params.id))) {
        return res.status(404).json({ message: 'Paper not found' });
      }
      const resolved = await resolveQuestions(
        { questions },
        teacherId,
        cleanSubjectId,
        req.params.id,
      );
      resolvedIds = resolved.ids;
      refs = resolved.refs;
      // Questions removed from this paper become standalone bank
      // questions; they are never deleted and never touch other papers.
      await Question.updateMany(
        {
          teacherId,
          paperId: req.params.id,
          _id: { $nin: resolvedIds },
        },
        { $set: { paperId: null } },
      );
    } else if (Array.isArray(questionIds) && questionIds.length > 0) {
      const validQuestions = await Question.find({
        _id: { $in: questionIds },
        teacherId,
      }).lean();
      if (validQuestions.length === 0) {
        return res.status(400).json({ message: 'No valid questions found' });
      }
      resolvedIds = validQuestions.map((q) => q._id);
    } else {
      return res.status(400).json({
        message: 'Title, subject, and at least one question are required',
      });
    }

    const updateData = {
      title: cleanTitle,
      subjectId: cleanSubjectId,
      questions: resolvedIds,
      totalMarks: numTotalMarks,
      duration: numDuration,
      examPattern: cleanExamPatternId,
      syllabus: cleanSyllabusId,
      instructions: instructions || '',
    };
    if (Array.isArray(sectionDetails)) {
      updateData.sectionDetails = buildSectionDetails(sectionDetails, refs);
    }

    const paper = await Paper.findOneAndUpdate({ _id: req.params.id, teacherId }, updateData, {
      new: true,
      runValidators: true,
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    return res.status(200).json({
      message: 'Paper updated successfully',
      paper: {
        id: paper._id,
        title: paper.title,
        subjectId: paper.subjectId,
        totalMarks: paper.totalMarks,
        duration: paper.duration,
        questionCount: resolvedIds.length,
        createdAt: paper.createdAt,
      },
    });
  } catch (error) {
    console.error('Update paper error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Paper not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.deletePaper = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const paper = await Paper.findOneAndDelete({
      _id: req.params.id,
      teacherId,
    });

    if (!paper) {
      return res.status(404).json({ message: 'Paper not found' });
    }

    // Delete ONLY this paper's own questions. Other papers' questions
    // (different paperId) and standalone bank questions are untouched.
    await Question.deleteMany({ teacherId, paperId: paper._id });

    return res.status(200).json({ message: 'Paper deleted successfully' });
  } catch (error) {
    console.error('Delete paper error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Paper not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.regenerateQuestion = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { subjectId, difficulty, marks, topic, instructions } = req.body;
    // The type the user selected is the ONLY allowed type. Accept the alias
    // `questionType` as well as `type`.
    const type = req.body.type || req.body.questionType;

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject is required' });
    }

    // The client's selected configuration is the source of truth. There is
    // deliberately NO fallback to "Short Answer" / "Medium" / 2 marks.
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({
        message: `Question type is required and must be one of: ${VALID_TYPES.join(', ')}`,
      });
    }
    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      return res.status(400).json({
        message: `Difficulty is required and must be one of: ${VALID_DIFFICULTIES.join(', ')}`,
      });
    }
    const parsedMarks = parseInt(marks, 10);
    if (isNaN(parsedMarks) || parsedMarks < 1) {
      return res.status(400).json({ message: 'Marks per question must be a positive number' });
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    let syllabusContent = '';
    let topics = [];

    const syllabusList = await Syllabus.find({ subjectId, teacherId });
    for (const s of syllabusList) {
      if (s.content) syllabusContent += s.content + '\n\n';
      if (s.topics && s.topics.length > 0) {
        topics.push(...s.topics);
      }
    }

    const result = await aiGenerate({
      subject: { name: subject.name, code: subject.code },
      syllabusContent,
      topics,
      topic: topic || '',
      count: 1,
      difficulty,
      type,
      marks: parsedMarks,
      instructions: instructions || '',
    });

    if (result.questions.length === 0) {
      return res.status(400).json({ message: 'Failed to generate question. Please try again.' });
    }

    const q = result.questions[0];
    const responseMarks = parsedMarks;
    return res.status(200).json({
      question: {
        id: `regen-${Date.now()}`,
        text: q.text,
        type: q.type,
        // The requested difficulty is the source of truth - emit it
        // explicitly so a regenerate never drifts to "Medium".
        difficulty,
        options: q.options || [],
        answer: q.answer || '',
        marks: responseMarks,
        topic: q.topic || '',
        source: q.source || 'AI Generated',
      },
    });
  } catch (error) {
    console.error('Regenerate question error:', error);
    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(500).json({
      message: error.message || 'Failed to regenerate question.',
    });
  }
};

exports.generatePaper = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const {
      title,
      subjectId,
      syllabusId,
      examPatternId,
      totalMarks,
      duration,
      difficulty,
      questionTypes,
      numberOfQuestions,
      unitDistribution,
      instructions,
      setCount,
    } = req.body;

    // --- Step 1: Validate all inputs ---
    if (!title || !title.trim()) {
      return res.status(400).json({ message: 'Paper title is required' });
    }
    if (!subjectId) {
      return res.status(400).json({ message: 'Subject is required' });
    }
    if (!totalMarks || parseInt(totalMarks, 10) < 1) {
      return res.status(400).json({ message: 'Total marks must be at least 1' });
    }
    if (!duration || parseInt(duration, 10) < 1) {
      return res.status(400).json({ message: 'Duration must be at least 1 minute' });
    }
    if (!numberOfQuestions || parseInt(numberOfQuestions, 10) < 1) {
      return res.status(400).json({ message: 'Number of questions must be at least 1' });
    }
    // Multiple paper sets: same config, N unique question papers.
    const numSets =
      setCount === undefined || setCount === null || setCount === '' ? 1 : parseInt(setCount, 10);
    if (isNaN(numSets) || numSets < 1 || numSets > 5) {
      return res.status(400).json({
        message: 'Number of sets must be between 1 and 5',
      });
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const numTotalMarks = parseInt(totalMarks, 10);
    const numDuration = parseInt(duration, 10);
    const numQuestions = parseInt(numberOfQuestions, 10);

    let overallDifficulty = 'Medium';
    if (difficulty !== undefined && difficulty !== null && String(difficulty).trim() !== '') {
      if (!VALID_DIFFICULTIES.includes(difficulty)) {
        return res.status(400).json({
          message: `Difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`,
        });
      }
      overallDifficulty = difficulty;
    }

    const cleanSyllabusId = sanitizeId(syllabusId, 'syllabus');
    const cleanExamPatternId = sanitizeId(examPatternId, 'exam pattern');

    // --- Step 2: Load syllabus ---
    let syllabusContent = '';
    let topics = [];
    let loadedSyllabusId = null;

    if (cleanSyllabusId) {
      const syllabus = await Syllabus.findOne({
        _id: cleanSyllabusId,
        teacherId,
      });
      if (syllabus) {
        syllabusContent = syllabus.content || '';
        topics = syllabus.topics || [];
        loadedSyllabusId = String(syllabus._id);
      }
    } else {
      const syllabusList = await Syllabus.find({ subjectId, teacherId });
      for (const s of syllabusList) {
        if (s.content) syllabusContent += s.content + '\n\n';
        if (s.topics && s.topics.length > 0) {
          topics.push(...s.topics);
        }
      }
    }

    // --- Step 3: Load exam pattern ---
    let sections = [];
    let loadedPattern = null;
    if (cleanExamPatternId) {
      const pattern = await ExamPattern.findOne({
        _id: cleanExamPatternId,
        teacherId,
      });
      if (!pattern) {
        return res.status(400).json({ message: 'Invalid exam pattern' });
      }
      loadedPattern = pattern;
      sections = pattern.sections.map((s) => ({
        name: s.name,
        questionType: s.questionType,
        questionCount: s.questionCount,
        marksPerQuestion: s.marksPerQuestion,
        difficulty: s.difficulty === 'Mixed' ? overallDifficulty : s.difficulty,
        attemptQuestions: s.attemptQuestions || s.questionCount,
        instruction: s.instruction || '',
      }));
    }

    if (sections.length === 0) {
      if (!Array.isArray(questionTypes) || questionTypes.length === 0) {
        return res.status(400).json({ message: 'Select at least one question type' });
      }
      for (const t of questionTypes) {
        if (!VALID_TYPES.includes(t)) {
          return res.status(400).json({ message: `Invalid question type: "${t}"` });
        }
      }
      const types = questionTypes;
      const questionsPerType = Math.ceil(numQuestions / types.length);
      let remaining = numQuestions;

      sections = types
        .map((type, i) => {
          const count = i === types.length - 1 ? remaining : Math.min(questionsPerType, remaining);
          remaining -= count;
          return {
            name: `Section ${String.fromCharCode(65 + i)}`,
            questionType: type,
            questionCount: count,
            marksPerQuestion: Math.ceil(numTotalMarks / numQuestions),
            difficulty: overallDifficulty,
            attemptQuestions: count,
            instruction: '',
          };
        })
        .filter((s) => s.questionCount > 0);
    }

    // --- Step 4: Calculate required questions ---
    const sectionTotals = sections.map((s) => ({
      ...s,
      requiredMarks: (s.attemptQuestions || s.questionCount) * s.marksPerQuestion,
    }));

    const totalRequiredMarks = sectionTotals.reduce((sum, s) => sum + s.requiredMarks, 0);

    // --- Step 5 & 6: Query bank + AI generate per section, per set ---
    // All sets share one global dedupe pool so no two sets contain the same
    // question text or the same bank question.
    const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];
    const baseTitle = title.trim();
    const globalUsedTexts = new Set();
    const globalUsedBankIds = new Set();
    const warnings = [];
    const papers = [];

    const actualTotalMarks = sectionTotals.reduce(
      (sum, s) => sum + (s.attemptQuestions || s.questionCount) * s.marksPerQuestion,
      0,
    );

    for (let setIdx = 0; setIdx < numSets; setIdx++) {
      const setLabel = SET_LABELS[setIdx];
      const setPrefix = numSets > 1 ? `Set ${setLabel} ` : '';
      const allQuestions = [];
      const usedTexts = new Set(globalUsedTexts);

      for (const section of sectionTotals) {
        const bankFilter = {
          teacherId,
          subjectId,
          type: section.questionType,
        };
        if (section.difficulty && section.difficulty !== 'Mixed') {
          bankFilter.difficulty = section.difficulty;
        }

        let bankQuestions = await Question.find(bankFilter).lean();

        if (unitDistribution && unitDistribution.length > 0) {
          const sectionTopics = unitDistribution
            .filter((u) => !u.type || u.type === section.questionType)
            .map((u) => u.topic);
          if (sectionTopics.length > 0) {
            bankQuestions = bankQuestions.filter(
              (q) =>
                !q.topic ||
                sectionTopics.some((t) => q.topic.toLowerCase().includes(t.toLowerCase())),
            );
          }
        }

        bankQuestions = bankQuestions.filter((q) => {
          const normalized = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
          if (usedTexts.has(normalized)) return false;
          if (globalUsedBankIds.has(String(q._id))) return false;
          return true;
        });

        const fromBank = bankQuestions.slice(0, section.questionCount);
        const needFromAI = section.questionCount - fromBank.length;

        for (const q of fromBank) {
          const normalized = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
          usedTexts.add(normalized);
          globalUsedTexts.add(normalized);
          globalUsedBankIds.add(String(q._id));
          allQuestions.push({
            text: q.text,
            type: q.type,
            difficulty: q.difficulty,
            options: q.options || [],
            answer: q.answer || '',
            marks: section.marksPerQuestion,
            topic: q.topic || '',
            source: 'Question Bank',
            section: section.name,
          });
        }
        let aiFailure = null;
        if (needFromAI > 0) {
          try {
            const aiResult = await aiGenerate({
              subject: { name: subject.name, code: subject.code },
              syllabusContent,
              topics,
              topic: '',
              count: needFromAI,
              difficulty: section.difficulty || overallDifficulty,
              type: section.questionType,
              marks: section.marksPerQuestion,
              instructions:
                (instructions || '') +
                (numSets > 1
                  ? ` (Paper Set ${setLabel} of ${numSets}: use different questions, examples and scenarios from the other sets.)`
                  : ''),
            });

            for (const q of aiResult.questions) {
              const normalized = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
              if (usedTexts.has(normalized)) {
                warnings.push(
                  `${setPrefix}Duplicate AI question skipped: "${q.text.substring(0, 50)}..."`,
                );
                continue;
              }
              usedTexts.add(normalized);
              globalUsedTexts.add(normalized);
              allQuestions.push({
                ...q,
                section: section.name,
              });
            }

            if (aiResult.warnings && aiResult.warnings.length > 0) {
              warnings.push(...aiResult.warnings);
            }
          } catch (aiError) {
            console.error(
              `AI generation failed for ${setPrefix}section ${section.name}:`,
              aiError.message,
            );
            aiFailure = aiError.message;
            warnings.push(
              `AI generation failed for ${setPrefix}${section.name}: ${aiError.message}. Using only bank questions.`,
            );
          }
        }

        // Never return a silently partial paper: if a section cannot be filled
        // completely (AI failure, dedupe, short bank), report the real error.
        const sectionCount = allQuestions.filter((q) => q.section === section.name).length;
        if (sectionCount < section.questionCount) {
          return res.status(400).json({
            message:
              (numSets > 1 ? `Set ${setLabel}: ` : '') +
              `Section "${section.name}" requires ${section.questionCount} questions but only ` +
              `${sectionCount} could be prepared.` +
              (aiFailure ? ` AI error: ${aiFailure}` : ' Please try again.'),
            warnings,
          });
        }
      }

      if (allQuestions.length === 0) {
        return res.status(400).json({
          message: 'No questions could be generated. Please check your configuration.',
          warnings,
        });
      }

      papers.push({
        title: numSets > 1 ? `${baseTitle} Set ${setLabel}` : baseTitle,
        setLabel: numSets > 1 ? setLabel : undefined,
        subjectId,
        subjectName: subject.name,
        subjectCode: subject.code,
        semester: subject.semester || null,
        board: subject.board || '',
        classLevel: subject.classLevel || '',
        totalMarks: numTotalMarks,
        duration: numDuration,

        examPattern: loadedPattern?.patternName || null,
        examPatternId: loadedPattern?._id ? String(loadedPattern._id) : null,
        syllabusId: loadedSyllabusId,
        questions: allQuestions.map((q, i) => ({
          id: `temp-${setIdx}-${i}`,
          text: q.text,
          type: q.type,
          difficulty: q.difficulty,
          options: q.options || [],
          answer: q.answer || '',
          marks: q.marks || sectionTotals[0]?.marksPerQuestion || 1,
          topic: q.topic || '',
          source: q.source || 'AI Generated',
          section: q.section || '',
        })),
        actualTotalMarks,
        sectionDetails: sectionTotals.map((s) => ({
          name: s.name,
          questionType: s.questionType,
          questionCount: s.questionCount,
          attemptQuestions: s.attemptQuestions || s.questionCount,
          marksPerQuestion: s.marksPerQuestion,
          difficulty: s.difficulty,
          requiredMarks: s.requiredMarks,
          instruction: s.instruction || '',
        })),
      });
    }

    // --- Step 8: Return paper(s) for preview (NOT saved) ---
    // `paper` (first set) is kept so older clients keep working.
    return res.status(200).json({
      message:
        numSets > 1
          ? `Generated ${numSets} paper sets with ${papers[0].questions.length} questions each`
          : `Paper generated with ${papers[0].questions.length} questions`,
      paper: papers[0],
      papers,
      warnings,
    });
  } catch (error) {
    console.error('Generate paper error:', error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }
    return res.status(500).json({
      message: error.message || 'Failed to generate paper. Please try again.',
    });
  }
};
