// Regression tests for Paper preview/history (reported BUG 2/3/4):
// opening a paper whose Subject document was deleted crashed
// `getPaper` with "Cannot read properties of null (reading '_id')"
// (paperController.js, subjectId dereference) while the history list worked.
//
// Covers:
//  - All-Subjects-style detail load with a null (deleted) subject reference
//  - valid subject mapping stays intact (no regression)
//  - deleted (null) question entries inside a paper are filtered out
//  - history list stays null-safe for missing subjects
const test = require('node:test');
const assert = require('node:assert/strict');

const Paper = require('../models/Paper');
const controller = require('../controllers/paperController');

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

// Preserve the real mongoose methods before any stubbing.
const origFindOne = Paper.findOne.bind(Paper);
const origFind = Paper.find.bind(Paper);

// Stub .populate(...)...(.sort()...).lean() chains exactly as mongoose returns them:
// populate() of a missing referenced document -> null.
function stubFindOne(doc, capture = {}) {
  Paper.findOne = (filter = {}) => {
    capture.filter = filter;
    const chain = { populate: () => chain, lean: async () => doc };
    return chain;
  };
  return capture;
}

function stubFind(docs, capture = {}) {
  Paper.find = (filter = {}) => {
    capture.filter = filter;
    const chain = { populate: () => chain, sort: () => chain, lean: async () => docs };
    return chain;
  };
  return capture;
}

function baseDoc(overrides = {}) {
  return {
    _id: 'p1',
    title: 'Semester 6',
    subjectId: { _id: 's1', name: 'Mathematics', code: 'MATH101', semester: 6, board: 'MSHSE', classLevel: 'SSE' },
    questions: [{ _id: 'q1', text: 'Q one?', type: 'MCQ', difficulty: 'Easy', options: ['a', 'b'], answer: 'a', marks: 5, topic: 'Algebra', paperId: 'p1' }],
    examPattern: null,
    syllabus: null,
    totalMarks: 10,
    duration: 60,
    instructions: '',
    sectionDetails: [],
    teacherId: 't1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

test('getPaper: deleted (null) subject reference no longer crashes the preview', async (t) => {
  t.after(() => {
    Paper.findOne = origFindOne;
  });

  const doc = baseDoc({ subjectId: null }); // populate() of a deleted Subject -> null
  stubFindOne(doc);

  const res = mockRes();
  await controller.getPaper({ user: { id: 't1' }, params: { id: 'p1' } }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}: ${JSON.stringify(res.payload)}`);
  const p = res.payload.paper;
  // Subject fields are null-safe: reported, never invented, never dereferenced.
  assert.equal(p.subjectId, null);
  assert.equal(p.subjectName, null);
  assert.equal(p.subjectCode, null);
  assert.equal(p.semester, null);
  assert.equal(p.board, '');
  assert.equal(p.classLevel, '');
  // Everything print/download needs stays intact.
  assert.equal(p.title, 'Semester 6');
  assert.equal(p.totalMarks, 10);
  assert.equal(p.duration, 60);
  assert.equal(p.questions.length, 1);
  assert.equal(p.questions[0].text, 'Q one?');
});

test('getPaper: valid populated subject still maps every field (no regression)', async (t) => {
  t.after(() => {
    Paper.findOne = origFindOne;
  });

  stubFindOne(baseDoc());
  const res = mockRes();
  await controller.getPaper({ user: { id: 't1' }, params: { id: 'p1' } }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}`);
  const p = res.payload.paper;
  assert.equal(p.subjectId, 's1');
  assert.equal(p.subjectName, 'Mathematics');
  assert.equal(p.subjectCode, 'MATH101');
  assert.equal(p.semester, 6);
  assert.equal(p.board, 'MSHSE');
  assert.equal(p.classLevel, 'SSE');
});

test('getPaper: deleted (null) question entries inside the paper are filtered out', async (t) => {
  t.after(() => {
    Paper.findOne = origFindOne;
  });

  const doc = baseDoc({
    subjectId: null,
    questions: [
      { _id: 'q1', text: 'Q one?', type: 'MCQ', difficulty: 'Easy', options: [], answer: 'a', marks: 5, topic: '', paperId: 'p1' },
      null, // populate() of a deleted question -> null (real dangling ref case)
      { _id: 'q3', text: 'Q three?', type: 'MCQ', difficulty: 'Easy', options: [], answer: 'b', marks: 5, topic: '', paperId: 'p1' },
    ],
  });
  stubFindOne(doc);

  const res = mockRes();
  await controller.getPaper({ user: { id: 't1' }, params: { id: 'p1' } }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}`);
  assert.equal(res.payload.paper.questions.length, 2, 'null entries dropped');
  assert.deepEqual(res.payload.paper.questions.map((q) => q.id), ['q1', 'q3']);
});

test('getPapers (history list): missing subject stays null-safe (unchanged behavior)', async (t) => {
  t.after(() => {
    Paper.find = origFind;
  });

  const capture = stubFind([
    baseDoc({ subjectId: null }),
    baseDoc({ _id: 'p2', title: 'Other Paper' }),
  ]);
  const res = mockRes();
  await controller.getPapers({ user: { id: 't1' }, query: {} }, res);

  assert.equal(res.code, 200, `expected 200, got ${res.code}`);
  assert.equal(String(capture.filter.teacherId), 't1', 'teacher scoping preserved');
  const [dangling, valid] = res.payload.papers;
  assert.equal(dangling.subjectName ?? null, null, 'missing subject reported as null');
  assert.equal(dangling.subjectId ?? null, null);
  assert.equal(valid.subjectName, 'Mathematics', 'valid subject still mapped');
  assert.equal(valid.questions.length, 1, 'questions still listed');
});
