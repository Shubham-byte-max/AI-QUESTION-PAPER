const Question = require('../models/Question');
const Subject = require('../models/Subject');
const Syllabus = require('../models/Syllabus');
const Paper = require('../models/Paper');
const { generateQuestions } = require('../services/aiService');

exports.getQuestions = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { search, subjectId, difficulty, type, topic, paperId } = req.query;

    const filter = { teacherId };

    if (subjectId) {
      filter.subjectId = subjectId;
    }

    if (paperId === 'unassigned') {
      filter.paperId = null;
    } else if (paperId && /^[0-9a-fA-F]{24}$/.test(String(paperId))) {
      filter.paperId = paperId;
    }

    if (difficulty && ['Easy', 'Medium', 'Hard'].includes(difficulty)) {
      filter.difficulty = difficulty;
    }

    if (
      type &&
      ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'].includes(type)
    ) {
      filter.type = type;
    }

    if (topic && topic.trim()) {
      filter.topic = new RegExp(topic.trim(), 'i');
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ text: regex }, { topic: regex }, { source: regex }];
    }

    const questions = await Question.find(filter)
      .populate('subjectId', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      questions: questions.map((q) => ({
        id: q._id,
        text: q.text,
        type: q.type,
        difficulty: q.difficulty,
        options: q.options,
        answer: q.answer,
        marks: q.marks,
        topic: q.topic,
        source: q.source,
        // `subjectId` populates to null when the referenced Subject has been
        // deleted (dangling reference). Never dereference it without a check.
        subjectId: q.subjectId?._id ?? null,
        subjectName: q.subjectId?.name ?? null,
        subjectCode: q.subjectId?.code ?? null,
        paperId: q.paperId ? String(q.paperId) : null,
        createdAt: q.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get questions error:', error);
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.getQuestion = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const question = await Question.findOne({
      _id: req.params.id,
      teacherId,
    })
      .populate('subjectId', 'name code')
      .lean();

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    return res.status(200).json({
      question: {
        id: question._id,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        options: question.options,
        answer: question.answer,
        marks: question.marks,
        topic: question.topic,
        source: question.source,
        subjectId: question.subjectId?._id ?? null,
        subjectName: question.subjectId?.name ?? null,
        subjectCode: question.subjectId?.code ?? null,
        paperId: question.paperId ? String(question.paperId) : null,
        createdAt: question.createdAt,
      },
    });
  } catch (error) {
    console.error('Get question error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Question not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.createQuestion = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { text, type, difficulty, options, answer, marks, topic, source, subjectId } = req.body;

    if (!text || !type || !difficulty || !marks || !subjectId) {
      return res.status(400).json({
        message: 'Question text, type, difficulty, marks, and subject are required',
      });
    }

    const cleanText = text.trim();
    const cleanAnswer = answer ? answer.trim() : '';
    const cleanTopic = topic ? topic.trim() : '';
    const cleanSource = source ? source.trim() : '';

    if (cleanText.length < 5) {
      return res.status(400).json({
        message: 'Question text must be at least 5 characters',
      });
    }

    const validTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        message: 'Invalid question type',
      });
    }

    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        message: 'Invalid difficulty level',
      });
    }

    const numMarks = parseInt(marks, 10);
    if (isNaN(numMarks) || numMarks < 1) {
      return res.status(400).json({
        message: 'Marks must be a positive number',
      });
    }

    if (type === 'MCQ') {
      const cleanOptions = (options || []).map((o) => o.trim()).filter((o) => o.length > 0);
      if (cleanOptions.length < 2) {
        return res.status(400).json({
          message: 'MCQ questions must have at least 2 options',
        });
      }
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const normalizedText = cleanText.toLowerCase().replace(/\s+/g, ' ').trim();
    const duplicate = await Question.findOne({
      teacherId,
      subjectId,
      text: {
        $regex: new RegExp('^' + normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      },
    }).lean();

    if (duplicate) {
      return res.status(409).json({
        message: 'A question with the same text already exists for this subject',
      });
    }

    const question = await Question.create({
      text: cleanText,
      type,
      difficulty,
      options:
        type === 'MCQ' ? (options || []).map((o) => o.trim()).filter((o) => o.length > 0) : [],
      answer: cleanAnswer,
      marks: numMarks,
      topic: cleanTopic,
      source: cleanSource,
      subjectId,
      teacherId,
      paperId: null,
    });

    const populated = await question.populate('subjectId', 'name code');

    console.log('Question created:', question._id, 'by teacher:', teacherId);

    return res.status(201).json({
      message: 'Question created successfully',
      question: {
        id: populated._id,
        text: populated.text,
        type: populated.type,
        difficulty: populated.difficulty,
        options: populated.options,
        answer: populated.answer,
        marks: populated.marks,
        topic: populated.topic,
        source: populated.source,
        subjectId: populated.subjectId?._id ?? subjectId,
        subjectName: populated.subjectId?.name ?? null,
        subjectCode: populated.subjectId?.code ?? null,
        paperId: null,
        createdAt: populated.createdAt,
      },
    });
  } catch (error) {
    console.error('Create question error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid subject ID' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { text, type, difficulty, options, answer, marks, topic, source, subjectId } = req.body;

    if (!text || !type || !difficulty || !marks || !subjectId) {
      return res.status(400).json({
        message: 'Question text, type, difficulty, marks, and subject are required',
      });
    }

    const cleanText = text.trim();
    const cleanAnswer = answer ? answer.trim() : '';
    const cleanTopic = topic ? topic.trim() : '';
    const cleanSource = source ? source.trim() : '';

    if (cleanText.length < 5) {
      return res.status(400).json({
        message: 'Question text must be at least 5 characters',
      });
    }

    const validTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        message: 'Invalid question type',
      });
    }

    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        message: 'Invalid difficulty level',
      });
    }

    const numMarks = parseInt(marks, 10);
    if (isNaN(numMarks) || numMarks < 1) {
      return res.status(400).json({
        message: 'Marks must be a positive number',
      });
    }

    if (type === 'MCQ') {
      const cleanOptions = (options || []).map((o) => o.trim()).filter((o) => o.length > 0);
      if (cleanOptions.length < 2) {
        return res.status(400).json({
          message: 'MCQ questions must have at least 2 options',
        });
      }
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const normalizedText = cleanText.toLowerCase().replace(/\s+/g, ' ').trim();
    const existing = await Question.findOne({
      _id: { $ne: req.params.id },
      teacherId,
      subjectId,
      text: {
        $regex: new RegExp('^' + normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i'),
      },
    }).lean();

    if (existing) {
      return res.status(409).json({
        message: 'A question with the same text already exists for this subject',
      });
    }

    const question = await Question.findOneAndUpdate(
      { _id: req.params.id, teacherId },
      {
        text: cleanText,
        type,
        difficulty,
        options:
          type === 'MCQ' ? (options || []).map((o) => o.trim()).filter((o) => o.length > 0) : [],
        answer: cleanAnswer,
        marks: numMarks,
        topic: cleanTopic,
        source: cleanSource,
        subjectId,
      },
      { new: true, runValidators: true },
    ).populate('subjectId', 'name code');

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    return res.status(200).json({
      message: 'Question updated successfully',
      question: {
        id: question._id,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        options: question.options,
        answer: question.answer,
        marks: question.marks,
        topic: question.topic,
        source: question.source,
        subjectId: question.subjectId?._id ?? subjectId,
        subjectName: question.subjectId?.name ?? null,
        subjectCode: question.subjectId?.code ?? null,
        paperId: question.paperId ? String(question.paperId) : null,
        createdAt: question.createdAt,
      },
    });
  } catch (error) {
    console.error('Update question error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Question not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const question = await Question.findOneAndDelete({
      _id: req.params.id,
      teacherId,
    });

    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    // Remove dangling references from papers (single-question delete only).
    await Paper.updateMany(
      { teacherId, questions: question._id },
      {
        $pull: {
          questions: question._id,
          'sectionDetails.$[].questionIds': question._id,
        },
      },
    );

    return res.status(200).json({
      message: 'Question deleted successfully',
    });
  } catch (error) {
    console.error('Delete question error:', error);

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Question not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.generateQuestions = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { subjectId, syllabusId, topic, count, difficulty, marks, instructions } = req.body;

    const type = req.body.type || req.body.questionType;

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject is required' });
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    // The frontend configuration is the source of truth: these values are
    // REQUIRED. There is deliberately no fallback to "Short Answer"/"Medium"/2.
    const validTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        message: `Question type is required and must be one of: ${validTypes.join(', ')}`,
      });
    }

    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!difficulty || !validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        message: `Difficulty is required and must be one of: ${validDifficulties.join(', ')}`,
      });
    }

    const parsedCount = parseInt(count, 10);
    if (isNaN(parsedCount) || parsedCount < 1) {
      return res.status(400).json({
        message: 'Number of questions must be a positive number',
      });
    }

    const parsedMarks = parseInt(marks, 10);
    if (isNaN(parsedMarks) || parsedMarks < 1) {
      return res.status(400).json({
        message: 'Marks per question must be a positive number',
      });
    }

    const questionCount = Math.min(parsedCount, 50);
    const questionMarks = Math.min(parsedMarks, 100);

    let syllabusContent = '';
    let topics = [];

    if (syllabusId) {
      const syllabus = await Syllabus.findOne({ _id: syllabusId, teacherId });
      if (syllabus) {
        syllabusContent = syllabus.content || '';
        topics = syllabus.topics || [];
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

    const result = await generateQuestions({
      subject: { name: subject.name, code: subject.code },
      syllabusContent,
      topics,
      topic: topic || '',
      count: questionCount,
      difficulty,
      type,
      marks: questionMarks,
      instructions: instructions || '',
    });

    return res.status(200).json({
      message: `Generated ${result.questions.length} question(s) successfully`,
      questions: result.questions,
      warnings: result.warnings,
    });
  } catch (error) {
    console.error('Generate questions error:', error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    const message = error.message || 'Failed to generate questions. Please try again.';

    if (
      message.includes('AI service is not configured') ||
      message.includes('AI API Error') ||
      message.includes('AI API error') ||
      message.includes('still a placeholder')
    ) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message });
  }
};

exports.generateSets = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { subjectId, syllabusId, topic, count, difficulty, marks, instructions, setCount } =
      req.body;

    const type = req.body.type || req.body.questionType;

    if (!subjectId) {
      return res.status(400).json({ message: 'Subject is required' });
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const validTypes = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        message: `Question type is required and must be one of: ${validTypes.join(', ')}`,
      });
    }

    const validDifficulties = ['Easy', 'Medium', 'Hard'];
    if (!difficulty || !validDifficulties.includes(difficulty)) {
      return res.status(400).json({
        message: `Difficulty is required and must be one of: ${validDifficulties.join(', ')}`,
      });
    }

    const parsedCount = parseInt(count, 10);
    if (isNaN(parsedCount) || parsedCount < 1) {
      return res.status(400).json({
        message: 'Number of questions must be a positive number',
      });
    }

    const parsedMarks = parseInt(marks, 10);
    if (isNaN(parsedMarks) || parsedMarks < 1) {
      return res.status(400).json({
        message: 'Marks per question must be a positive number',
      });
    }

    const numSets =
      setCount === undefined || setCount === null || setCount === '' ? 1 : parseInt(setCount, 10);
    if (isNaN(numSets) || numSets < 1 || numSets > 5) {
      return res.status(400).json({
        message: 'Number of sets must be between 1 and 5',
      });
    }

    const questionCount = Math.min(parsedCount, 50);
    const questionMarks = Math.min(parsedMarks, 100);

    let syllabusContent = '';
    let topics = [];

    if (syllabusId) {
      const syllabus = await Syllabus.findOne({ _id: syllabusId, teacherId });
      if (syllabus) {
        syllabusContent = syllabus.content || '';
        topics = syllabus.topics || [];
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

    const SET_LABELS = ['A', 'B', 'C', 'D', 'E'];
    const globalUsedTexts = new Set();
    const warnings = [];
    const sets = [];

    for (let setIdx = 0; setIdx < numSets; setIdx++) {
      const setLabel = SET_LABELS[setIdx];
      const collected = [];
      const seenInSet = new Set();
      let attempts = 0;

      while (collected.length < questionCount && attempts < 3) {
        attempts += 1;
        const need = questionCount - collected.length;
        const result = await generateQuestions({
          subject: { name: subject.name, code: subject.code },
          syllabusContent,
          topics,
          topic: topic || '',
          count: need,
          difficulty,
          type,
          marks: questionMarks,
          instructions:
            (instructions || '') +
            (numSets > 1
              ? ` (Paper Set ${setLabel} of ${numSets}: use different questions, examples and scenarios from the other sets.)`
              : ''),
        });

        if (result.warnings && result.warnings.length > 0) {
          warnings.push(...result.warnings);
        }

        for (const q of result.questions) {
          const normalized = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
          if (globalUsedTexts.has(normalized)) {
            warnings.push(
              `Set ${setLabel}: duplicate of another set skipped: "${q.text.substring(0, 50)}..."`,
            );
            continue;
          }
          if (seenInSet.has(normalized)) continue;
          seenInSet.add(normalized);
          globalUsedTexts.add(normalized);
          collected.push(q);
          if (collected.length >= questionCount) break;
        }
      }

      if (collected.length < questionCount) {
        return res.status(400).json({
          message:
            `Set ${setLabel} requires ${questionCount} questions but only ` +
            `${collected.length} unique questions could be prepared. Please try again.`,
          warnings,
        });
      }

      sets.push({
        setLabel,
        title: `${subject.name} Set ${setLabel}`,
        subjectId,
        syllabusId: syllabusId || null,
        totalMarks: questionCount * questionMarks,
        duration: 60,
        questions: collected.map((q, i) => ({
          ...q,
          id: `set-${setLabel}-${i}`,
        })),
      });
    }

    return res.status(200).json({
      message:
        numSets > 1
          ? `Generated ${numSets} paper sets with ${questionCount} questions each`
          : `Generated ${questionCount} question(s) successfully`,
      sets,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
    console.error('Generate sets error:', error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({ message: error.message });
    }

    const message = error.message || 'Failed to generate paper sets. Please try again.';

    if (
      message.includes('AI service is not configured') ||
      message.includes('AI API Error') ||
      message.includes('AI API error') ||
      message.includes('still a placeholder')
    ) {
      return res.status(400).json({ message });
    }

    return res.status(500).json({ message });
  }
};

exports.saveGeneratedQuestions = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { questions, subjectId } = req.body;

    if (!subjectId || !questions || !Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ message: 'Subject and at least one question are required' });
    }

    const subject = await Subject.findOne({ _id: subjectId, teacherId });
    if (!subject) {
      return res.status(400).json({ message: 'Invalid subject' });
    }

    const saved = [];
    const skipped = [];

    for (const q of questions) {
      const cleanText = (q.text || '').trim();
      if (cleanText.length < 5) {
        skipped.push({ text: cleanText, reason: 'Text too short' });
        continue;
      }

      const validSaveTypes = [
        'MCQ',
        'Short Answer',
        'Long Answer',
        'True/False',
        'Fill in the Blanks',
      ];
      const qOptions = Array.isArray(q.options)
        ? q.options.map((o) => String(o).trim()).filter((o) => o.length > 0)
        : [];

      if (!validSaveTypes.includes(q.type)) {
        skipped.push({
          text: cleanText,
          reason: `Invalid question type "${q.type ?? ''}"`,
        });
        continue;
      }
      const qType = q.type;

      if (!['Easy', 'Medium', 'Hard'].includes(q.difficulty)) {
        skipped.push({
          text: cleanText,
          reason: `Invalid difficulty "${q.difficulty ?? ''}"`,
        });
        continue;
      }
      const qDifficulty = q.difficulty;

      const qMarks = parseInt(q.marks, 10);
      if (isNaN(qMarks) || qMarks < 1) {
        skipped.push({
          text: cleanText,
          reason: `Invalid marks "${q.marks ?? ''}"`,
        });
        continue;
      }

      if (qType === 'MCQ') {
        if (qOptions.length !== 4) {
          skipped.push({
            text: cleanText,
            reason: `MCQ must have exactly 4 options (got ${qOptions.length})`,
          });
          continue;
        }
        const answer = (q.answer || '').trim();
        if (!answer) {
          skipped.push({
            text: cleanText,
            reason: 'MCQ is missing its correct answer',
          });
          continue;
        }
        const matches = qOptions.some((o) => o.toLowerCase() === answer.toLowerCase());
        if (!matches) {
          skipped.push({
            text: cleanText,
            reason: `Correct answer "${answer}" does not match any of the 4 options`,
          });
          continue;
        }
      }

      const normalizedText = cleanText.toLowerCase().replace(/\s+/g, ' ').trim();
      const duplicate = await Question.findOne({
        teacherId,
        subjectId,
        text: {
          $regex: new RegExp(
            '^' + normalizedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
            'i',
          ),
        },
      }).lean();

      if (duplicate) {
        skipped.push({ text: cleanText, reason: 'Duplicate question' });
        continue;
      }

      const question = await Question.create({
        text: cleanText,
        type: qType,
        difficulty: qDifficulty,
        options: qType === 'MCQ' ? qOptions : qType === 'True/False' ? ['True', 'False'] : [],
        answer: (q.answer || '').trim(),
        marks: qMarks,
        topic: (q.topic || '').trim(),
        source: 'AI Generated',
        subjectId,
        teacherId,
        paperId: null,
      });

      saved.push({
        id: question._id,
        text: question.text,
        type: question.type,
        difficulty: question.difficulty,
        options: question.options,
        answer: question.answer,
        marks: question.marks,
        topic: question.topic,
        source: question.source,
        subjectId,
        paperId: null,
        createdAt: question.createdAt,
      });
    }

    return res.status(201).json({
      message: `${saved.length} question(s) saved successfully${skipped.length > 0 ? `, ${skipped.length} skipped` : ''}`,
      saved,
      skipped,
    });
  } catch (error) {
    console.error('Save generated questions error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
