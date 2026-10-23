const Syllabus = require('../models/Syllabus');

exports.getSyllabi = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { search, subjectId } = req.query;

    const filter = { teacherId };

    if (subjectId) {
      filter.subjectId = subjectId;
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      filter.$or = [{ title: regex }, { content: regex }];
    }

    const syllabi = await Syllabus.find(filter)
      .populate('subjectId', 'name code')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      syllabi: syllabi.map((s) => ({
        id: s._id,
        title: s.title,
        subjectId: s.subjectId._id,
        subjectName: s.subjectId.name,
        subjectCode: s.subjectId.code,
        topics: s.topics,
        content: s.content,
        sourceType: s.sourceType,
        sourceFileName: s.sourceFileName,
        createdAt: s.createdAt,
      })),
    });
  } catch (error) {
    console.error('Get syllabi error:', error);
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.getSyllabus = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const syllabus = await Syllabus.findOne({
      _id: req.params.id,
      teacherId,
    })
      .populate('subjectId', 'name code')
      .lean();

    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    return res.status(200).json({
      syllabus: {
        id: syllabus._id,
        title: syllabus.title,
        subjectId: syllabus.subjectId._id,
        subjectName: syllabus.subjectId.name,
        subjectCode: syllabus.subjectId.code,
        topics: syllabus.topics,
        content: syllabus.content,
        sourceType: syllabus.sourceType,
        sourceFileName: syllabus.sourceFileName,
        createdAt: syllabus.createdAt,
      },
    });
  } catch (error) {
    console.error('Get syllabus error:', error);
    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Syllabus not found' });
    }
    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.createSyllabus = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { title, subjectId, topics, content } = req.body;

    if (!title || !subjectId) {
      return res.status(400).json({
        message: 'Title and subject are required',
      });
    }

    const cleanTitle = title.trim();

    if (cleanTitle.length < 2) {
      return res.status(400).json({
        message: 'Syllabus title must be at least 2 characters',
      });
    }

    const cleanContent = content ? content.trim() : '';
    if (!cleanContent) {
      return res.status(400).json({
        message: 'Syllabus content cannot be empty',
      });
    }

    const syllabus = await Syllabus.create({
      title: cleanTitle,
      subjectId,
      topics: topics || [],
      content: cleanContent,
      sourceType: 'manual',
      teacherId,
    });

    const populated = await syllabus.populate('subjectId', 'name code');

    return res.status(201).json({
      message: 'Syllabus created successfully',
      syllabus: {
        id: populated._id,
        title: populated.title,
        subjectId: populated.subjectId._id,
        subjectName: populated.subjectId.name,
        subjectCode: populated.subjectId.code,
        topics: populated.topics,
        content: populated.content,
        sourceType: populated.sourceType,
        sourceFileName: populated.sourceFileName,
        createdAt: populated.createdAt,
      },
    });
  } catch (error) {
    console.error('Create syllabus error:', error);

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

exports.updateSyllabus = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { title, subjectId, topics, content } = req.body;

    if (!title || !subjectId) {
      return res.status(400).json({
        message: 'Title and subject are required',
      });
    }

    const cleanTitle = title.trim();

    if (cleanTitle.length < 2) {
      return res.status(400).json({
        message: 'Syllabus title must be at least 2 characters',
      });
    }

    const cleanContent = content ? content.trim() : '';
    if (!cleanContent) {
      return res.status(400).json({
        message: 'Syllabus content cannot be empty',
      });
    }

    const syllabus = await Syllabus.findOneAndUpdate(
      { _id: req.params.id, teacherId },
      {
        title: cleanTitle,
        subjectId,
        topics: topics || [],
        content: cleanContent,
      },
      { new: true, runValidators: true },
    ).populate('subjectId', 'name code');

    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    return res.status(200).json({
      message: 'Syllabus updated successfully',
      syllabus: {
        id: syllabus._id,
        title: syllabus.title,
        subjectId: syllabus.subjectId._id,
        subjectName: syllabus.subjectId.name,
        subjectCode: syllabus.subjectId.code,
        topics: syllabus.topics,
        content: syllabus.content,
        sourceType: syllabus.sourceType,
        sourceFileName: syllabus.sourceFileName,
        createdAt: syllabus.createdAt,
      },
    });
  } catch (error) {
    console.error('Update syllabus error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.deleteSyllabus = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const syllabus = await Syllabus.findOneAndDelete({
      _id: req.params.id,
      teacherId,
    });

    if (!syllabus) {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    return res.status(200).json({
      message: 'Syllabus deleted successfully',
    });
  } catch (error) {
    console.error('Delete syllabus error:', error);

    if (error.name === 'CastError') {
      return res.status(404).json({ message: 'Syllabus not found' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.uploadSyllabus = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { title, subjectId } = req.body;

    if (!title || !subjectId) {
      return res.status(400).json({
        message: 'Title and subject are required',
      });
    }

    if (!req.file) {
      return res.status(400).json({
        message: 'No file uploaded',
      });
    }

    const cleanTitle = title.trim();

    if (cleanTitle.length < 2) {
      return res.status(400).json({
        message: 'Syllabus title must be at least 2 characters',
      });
    }

    let content = '';
    const fileName = req.file.originalname;
    const ext = fileName.split('.').pop().toLowerCase();

    if (ext === 'txt') {
      content = req.file.buffer.toString('utf-8');
    } else if (ext === 'pdf') {
      const { PDFParse } = require('pdf-parse');
      const doc = new PDFParse({ data: new Uint8Array(req.file.buffer) });
      const result = await doc.getText();
      content = result.pages.map((p) => p.text).join('\n\n');
    } else if (ext === 'docx' || ext === 'doc') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer: req.file.buffer });
      content = result.value;
    } else {
      return res.status(400).json({
        message: 'Unsupported file type. Please upload PDF, DOCX, or TXT.',
      });
    }

    const cleanContent = content.trim();
    if (!cleanContent) {
      return res.status(400).json({
        message:
          'Could not extract readable text from the uploaded file. Please try another file or enter content manually.',
      });
    }

    const syllabus = await Syllabus.create({
      title: cleanTitle,
      subjectId,
      content: cleanContent,
      sourceType: 'file',
      sourceFileName: fileName,
      teacherId,
    });

    const populated = await syllabus.populate('subjectId', 'name code');

    return res.status(201).json({
      message: 'Syllabus uploaded successfully',
      syllabus: {
        id: populated._id,
        title: populated.title,
        subjectId: populated.subjectId._id,
        subjectName: populated.subjectId.name,
        subjectCode: populated.subjectId.code,
        topics: populated.topics,
        content: populated.content,
        sourceType: populated.sourceType,
        sourceFileName: populated.sourceFileName,
        createdAt: populated.createdAt,
      },
    });
  } catch (error) {
    console.error('Upload syllabus error:', error);

    if (error.name === 'CastError') {
      return res.status(400).json({ message: 'Invalid subject ID' });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
