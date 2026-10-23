const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const User = require('../models/User');
const Subject = require('../models/Subject');
const Syllabus = require('../models/Syllabus');
const Question = require('../models/Question');
const Paper = require('../models/Paper');
const ExamPattern = require('../models/ExamPattern');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({ email: /^e2e\d+@test\.com$/ }).lean();

  if (users.length === 0) {
    console.log('No e2e test users found - nothing to clean up.');
    await mongoose.disconnect();
    return;
  }

  for (const user of users) {
    const teacherId = user._id;
    const [questions, subjects, syllabi, papers, patterns] = await Promise.all([
      Question.deleteMany({ teacherId }),
      Subject.deleteMany({ teacherId }),
      Syllabus.deleteMany({ teacherId }),
      Paper.deleteMany({ teacherId }),
      ExamPattern.deleteMany({ teacherId }),
    ]);
    await User.deleteOne({ _id: teacherId });
    console.log(
      `Removed ${user.email}: questions=${questions.deletedCount} subjects=${subjects.deletedCount} ` +
        `syllabi=${syllabi.deletedCount} papers=${papers.deletedCount} patterns=${patterns.deletedCount}`,
    );
  }

  await mongoose.disconnect();
  console.log('Cleanup complete.');
}

main().catch((err) => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});
