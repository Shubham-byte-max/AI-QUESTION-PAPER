const Subject = require('../models/Subject');

exports.getSubjects = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { search } = req.query;

    const filter = { teacherId };

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ name: regex }, { code: regex }, { description: regex }];
    }

    const subjects = await Subject.find(filter).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      subjects: subjects.map((s) => ({
        id: s._id,
        name: s.name,
        code: s.code,
        description: s.description,
        semester: s.semester,
        board: s.board || '',
        classLevel: s.classLevel || '',
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get subjects error:', error);
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.getSubject = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const subject = await Subject.findOne({
      _id: req.params.id,
      teacherId,
    }).lean();

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    return res.status(200).json({
      subject: {
        id: subject._id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        semester: subject.semester,
        board: subject.board || '',
        classLevel: subject.classLevel || '',
        createdAt: subject.createdAt,
      },
    });
  } catch (error) {
    console.error('Get subject error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Subject not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.createSubject = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { name, code, description, semester, board, classLevel } = req.body;

    if (!name || !code || !semester) {
      return res.status(400).json({
        message: 'Subject name, code, and semester are required',
      });
    }

    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    const cleanDescription = description ? description.trim() : '';
    // Optional board / class (e.g. "Maharashtra State Board" / "10th / SSC").
    const cleanBoard = board ? String(board).trim() : '';
    const cleanClassLevel = classLevel ? String(classLevel).trim() : '';

    if (cleanName.length < 2) {
      return res.status(400).json({
        message: 'Subject name must be at least 2 characters',
      });
    }

    if (cleanCode.length < 2) {
      return res.status(400).json({
        message: 'Subject code must be at least 2 characters',
      });
    }

    const sem = parseInt(semester, 10);
    if (isNaN(sem) || sem < 1 || sem > 8) {
      return res.status(400).json({
        message: 'Semester must be a number between 1 and 8',
      });
    }

    const existing = await Subject.findOne({
      teacherId,
      code: cleanCode,
    });

    if (existing) {
      return res.status(409).json({
        message: 'A subject with this code already exists',
      });
    }

    const subject = await Subject.create({
      name: cleanName,
      code: cleanCode,
      description: cleanDescription,
      semester: sem,
      board: cleanBoard,
      classLevel: cleanClassLevel,
      teacherId,
    });

    console.log('Subject created:', subject.code, 'by teacher:', teacherId);

    return res.status(201).json({
      message: 'Subject created successfully',
      subject: {
        id: subject._id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        semester: subject.semester,
        board: subject.board || '',
        classLevel: subject.classLevel || '',
        createdAt: subject.createdAt,
      },
    });
  } catch (error) {
    console.error('Create subject error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'A subject with this code already exists',
      });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.updateSubject = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { name, code, description, semester, board, classLevel } = req.body;

    if (!name || !code || !semester) {
      return res.status(400).json({
        message: 'Subject name, code, and semester are required',
      });
    }

    const cleanName = name.trim();
    const cleanCode = code.trim().toUpperCase();
    const cleanDescription = description ? description.trim() : '';

    if (cleanName.length < 2) {
      return res.status(400).json({
        message: 'Subject name must be at least 2 characters',
      });
    }

    if (cleanCode.length < 2) {
      return res.status(400).json({
        message: 'Subject code must be at least 2 characters',
      });
    }

    const sem = parseInt(semester, 10);
    if (isNaN(sem) || sem < 1 || sem > 8) {
      return res.status(400).json({
        message: 'Semester must be a number between 1 and 8',
      });
    }

    const existing = await Subject.findOne({
      teacherId,
      code: cleanCode,
      _id: { $ne: req.params.id },
    });

    if (existing) {
      return res.status(409).json({
        message: 'Another subject with this code already exists',
      });
    }

    const subject = await Subject.findOneAndUpdate(
      { _id: req.params.id, teacherId },
      {
        name: cleanName,
        code: cleanCode,
        description: cleanDescription,
        semester: sem,
        board: board ? String(board).trim() : '',
        classLevel: classLevel ? String(classLevel).trim() : '',
      },
      { new: true, runValidators: true },
    );

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    return res.status(200).json({
      message: 'Subject updated successfully',
      subject: {
        id: subject._id,
        name: subject.name,
        code: subject.code,
        description: subject.description,
        semester: subject.semester,
        board: subject.board || '',
        classLevel: subject.classLevel || '',
        createdAt: subject.createdAt,
      },
    });
  } catch (error) {
    console.error('Update subject error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'A subject with this code already exists',
      });
    }

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Subject not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.deleteSubject = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const subject = await Subject.findOneAndDelete({
      _id: req.params.id,
      teacherId,
    });

    if (!subject) {
      return res.status(404).json({ message: 'Subject not found' });
    }

    return res.status(200).json({
      message: 'Subject deleted successfully',
    });
  } catch (error) {
    console.error('Delete subject error:', error);

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Subject not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
