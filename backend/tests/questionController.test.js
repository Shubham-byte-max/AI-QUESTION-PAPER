// Regression tests for the Question Bank "All Subjects" crash:
// "Cannot read properties of null (reading '_id')"
//
// A question whose Subject document was deleted populates `subjectId` to null.
// Listing with "All Subjects" (no subjectId filter) includes such records, so
// the response mapping must tolerate null instead of dereferencing `._id`.
// Filtering by a specific subject excludes them, which is why the bug only
// appeared on the "All Subjects" path.
const test = require('node:test');
const assert = require('node:assert/strict');

const Question = require('../models/Question');
const controller = require('../controllers/questionController');

function mockRes() {
  const res = { code: null, payload: null };
  res.status = (c) => {
    res.code = c;
    return res;
  };
  res.json = (p) => {
    res.payload = p;
    return res;
  };
  return res;
}

// Stub Question.find to skip the DB while preserving the .populate().sort().lean()
// chain, returning documents exactly as mongoose would after populate():
// populated subject -> plain object, missing subject -> null.
function stubFind(docs, capture = {}) {
  Question.find = (filter = {}) => {
    capture.filter = filter;
    return { populate: () => ({ sort: () => ({ lean: async () => docs }) }) };
  };
  return capture;
}

function baseDoc(overrides = {}) {
  return {
    _id: 'q-valid',
    text: 'What is 2 + 2?',
    type: 'MCQ',
    difficulty: 'Easy',
    options: ['3', '4'],
    answer: '4',
    marks: 2,
    topic: 'Algebra',
    source: 'Textbook',
    subjectId: { _id: 's-math', name: 'Mathematics', code: 'MATH101' },
    paperId: null,
    teacherId: 't1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('All Subjects: question with missing (null) subject is returned instead of crashing', async (t) => {
  const originalFind = Question.find;
  t.after(() => {
    Question.find = originalFind;
  });

  const orphan = baseDoc({ _id: 'q-orphan', text: 'Legacy orphan question', subjectId: null });
  const valid = baseDoc();
  const capture = stubFind([orphan, valid]);

  const res = mockRes();
  await controller.getQuestions({ user: { id: 't1' }, query: {} }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}: ${JSON.stringify(res.payload)}`);
  // "All Subjects" means no subject filter is applied to the query.
  assert.equal(capture.filter.subjectId, undefined);
  assert.equal(String(capture.filter.teacherId), 't1', 'teacher scoping must be preserved');

  assert.equal(res.payload.questions.length, 2, 'every question is listed');

  const [orphanRow, validRow] = res.payload.questions;
  // Null-safe subject mapping for the orphaned record.
  assert.equal(orphanRow.id, 'q-orphan');
  assert.equal(orphanRow.text, 'Legacy orphan question');
  assert.equal(orphanRow.subjectId, null);
  assert.equal(orphanRow.subjectName, null);
  assert.equal(orphanRow.subjectCode, null);
  assert.equal(orphanRow.paperId, null, 'legacy/unassigned questions stay in the list');
  // Normal records keep their populated subject data.
  assert.equal(validRow.subjectId, 's-math');
  assert.equal(validRow.subjectName, 'Mathematics');
  assert.equal(validRow.subjectCode, 'MATH101');
});

test('Specific subject: filter is applied and subject fields still map correctly', async (t) => {
  const originalFind = Question.find;
  t.after(() => {
    Question.find = originalFind;
  });

  const capture = stubFind([baseDoc()]);
  const res = mockRes();
  await controller.getQuestions({ user: { id: 't1' }, query: { subjectId: 's-math' } }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}`);
  assert.equal(capture.filter.subjectId, 's-math', 'subject filter must reach the query');
  assert.equal(res.payload.questions.length, 1);
  assert.equal(res.payload.questions[0].subjectId, 's-math');
  assert.equal(res.payload.questions[0].subjectName, 'Mathematics');
  assert.equal(res.payload.questions[0].subjectCode, 'MATH101');
});

test('search, type, difficulty and topic filters keep working alongside the fix', async (t) => {
  const originalFind = Question.find;
  t.after(() => {
    Question.find = originalFind;
  });

  const capture = stubFind([baseDoc()]);
  const res = mockRes();
  await controller.getQuestions(
    { user: { id: 't1' }, query: { search: 'algebra', type: 'MCQ', difficulty: 'Easy', topic: ' alg ' } },
    res,
  );

  assert.equal(res.code, 200, `expected 200, got ${res.code}`);
  const filter = capture.filter;
  assert.equal(filter.type, 'MCQ');
  assert.equal(filter.difficulty, 'Easy');
  assert.ok(filter.topic instanceof RegExp, 'topic becomes a regex');
  assert.ok(filter.topic.test('Algebra'), 'topic regex matches');
  assert.ok(Array.isArray(filter.$or), 'search builds an $or clause');
  const [textClause, topicClause, sourceClause] = filter.$or;
  assert.ok(textClause.text.test('algebra'), 'search matches text');
  assert.ok(topicClause.topic.test('algebra'), 'search matches topic');
  assert.ok(sourceClause.source.test('algebra'), 'search matches source');
  assert.equal(res.payload.questions.length, 1);
});

test('GET single question tolerates a missing (null) subject', async (t) => {
  const originalFindOne = Question.findOne;
  t.after(() => {
    Question.findOne = originalFindOne;
  });

  const orphan = baseDoc({ _id: 'q-orphan', subjectId: null });
  Question.findOne = () => ({ populate: () => ({ lean: async () => orphan }) });

  const res = mockRes();
  await controller.getQuestion({ user: { id: 't1' }, params: { id: 'q-orphan' } }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}`);
  assert.equal(res.payload.question.subjectId, null);
  assert.equal(res.payload.question.subjectName, null);
  assert.equal(res.payload.question.subjectCode, null);
  assert.equal(res.payload.question.id, 'q-orphan');
});
