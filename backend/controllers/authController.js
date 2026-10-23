const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Generate JWT token
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured in .env');
  }

  return jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
};

exports.register = async (req, res) => {
  try {
    const { name, email, password, collegeName } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        message: 'Name, email and password are required',
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (cleanName.length < 2) {
      return res.status(400).json({
        message: 'Name must be at least 2 characters',
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;

    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        message: 'Please provide a valid email',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: 'Password must be at least 6 characters',
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Email already registered',
      });
    }

    const user = await User.create({
      name: cleanName,
      email: cleanEmail,
      password,
      collegeName: (collegeName || '').trim(),
    });

    console.log('User registered successfully:', user.email);

    return res.status(201).json({
      message: 'Registration successful. Please login.',
    });
  } catch (error) {
    console.error('Register error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);

      return res.status(400).json({
        message: messages.join(', '),
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Email already registered',
      });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: cleanEmail,
    }).select('+password');

    if (!user) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    const token = generateToken(user._id);

    return res.status(200).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        collegeName: user.collegeName || '',
      },
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        collegeName: user.collegeName || '',
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('GetMe error:', error);

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { name, email, collegeName } = req.body;

    if (!name || !email) {
      return res.status(400).json({
        message: 'Name and email are required',
      });
    }

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanCollegeName = (collegeName || '').trim();

    if (cleanName.length < 2) {
      return res.status(400).json({
        message: 'Name must be at least 2 characters',
      });
    }

    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({
        message: 'Please provide a valid email',
      });
    }

    const existingUser = await User.findOne({
      email: cleanEmail,
      _id: { $ne: teacherId },
    });

    if (existingUser) {
      return res.status(409).json({
        message: 'Email is already in use by another account',
      });
    }

    const user = await User.findByIdAndUpdate(
      teacherId,
      { name: cleanName, email: cleanEmail, collegeName: cleanCollegeName },
      { new: true, runValidators: true },
    );

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        collegeName: user.collegeName || '',
      },
    });
  } catch (error) {
    console.error('UpdateProfile error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        message: 'Email is already in use by another account',
      });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
exports.changePassword = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: 'Current password and new password are required',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        message: 'New password must be at least 6 characters',
      });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: 'New password must be different from current password',
      });
    }

    const user = await User.findById(teacherId).select('+password');

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }
    const isPasswordValid = await user.comparePassword(currentPassword);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Current password is incorrect',
      });
    }

    user.password = newPassword;
    await user.save();

    return res.status(200).json({
      message: 'Password changed successfully',
    });
  } catch (error) {
    console.error('ChangePassword error:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ message: messages.join(', ') });
    }

    return res.status(500).json({
      message: error.message || 'Server error. Please try again.',
    });
  }
};
