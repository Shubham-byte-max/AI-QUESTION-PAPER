const assert = require('assert');

const BASE = process.env.BASE_URL || 'http://localhost:5001';
const results = [];

async function api(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, data };
}

async function record(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err });
    console.log(`  FAIL  ${name}\n        ${err && err.message}`);
  }
}

async function main() {
  console.log(`\n=== End-to-end HTTP test against ${BASE} ===\n`);

  const stamp = Date.now();
  const email = `e2e${stamp}@test.com`;
  const password = 'Test1234!';

  let token = '';
  let subjectId = '';
  let syllabusId = '';

  await record('0. Setup: register + login + subject + syllabus', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'E2E Teacher',
        email,
        password,
        collegeName: 'E2E College',
      },
    });
    assert.ok(reg.status === 201 || reg.status === 409, `register -> ${reg.status}`);

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    assert.strictEqual(login.status, 200, `login -> ${login.status}: ${login.data?.message}`);
    token = login.data.token;
    assert.ok(token, 'no token returned');

    const subj = await api('/api/subjects', {
      method: 'POST',
      token,
      body: {
        name: 'java spring',
        code: 'JS101',
        description: 'Spring basics',
        semester: 1,
      },
    });
    assert.strictEqual(subj.status, 201, `subject -> ${subj.status}: ${subj.data?.message}`);
    subjectId = subj.data.subject.id;

    const syl = await api('/api/syllabus', {
      method: 'POST',
      token,
      body: {
        title: 'java - unit 1',
        subjectId,
        topics: [{ name: 'unit 1', weightage: 100 }],
        content:
          'Unit 1 - Introduction to Java Spring: Spring IoC container, dependency injection, ' +
          'beans, annotations (@Component, @Autowired), Spring MVC, application properties.',
      },
    });
    assert.strictEqual(syl.status, 201, `syllabus -> ${syl.status}: ${syl.data?.message}`);
    syllabusId = syl.data.syllabus.id;
  });

  const payload = {
    subjectId,
    syllabusId,
    topic: 'unit 1',
    count: 6,
    difficulty: 'Easy',
    type: 'MCQ',
    marks: 2,
  };

  let generated = [];
  await record('1. POST /api/questions/generate - 6 x MCQ / Easy / 2 marks', async () => {
    console.log('        REQUEST PAYLOAD:');
    console.log('        ' + JSON.stringify(payload));
    const res = await api('/api/questions/generate', {
      method: 'POST',
      token,
      body: payload,
    });
    assert.strictEqual(res.status, 200, `generate -> ${res.status}: ${res.data?.message}`);
    generated = res.data.questions;
    console.log(`        RESPONSE: ${res.data.message}`);
    console.log(`        Generated Questions (${generated.length})`);
    generated.forEach((q, i) => {
      console.log(
        `        Question ${i + 1}: type=${q.type} | difficulty=${q.difficulty} | marks=${q.marks} | options=${q.options.length}`,
      );
    });

    assert.strictEqual(generated.length, 6, `expected 6 questions, got ${generated.length}`);
    generated.forEach((q, i) => {
      const n = i + 1;
      assert.strictEqual(q.type, 'MCQ', `Question ${n}: type = ${q.type}, expected MCQ`);
      assert.strictEqual(
        q.difficulty,
        'Easy',
        `Question ${n}: difficulty = ${q.difficulty}, expected Easy`,
      );
      assert.strictEqual(q.marks, 2, `Question ${n}: marks = ${q.marks}, expected 2`);
      assert.strictEqual(
        q.options.length,
        4,
        `Question ${n}: options = ${q.options.length}, expected 4`,
      );
      assert.ok(q.answer, `Question ${n}: missing answer`);
      assert.strictEqual(q.correctAnswer, q.answer, `Question ${n}: correctAnswer != answer`);
      assert.ok(
        q.options.some((o) => o.trim().toLowerCase() === q.answer.trim().toLowerCase()),
        `Question ${n}: answer "${q.answer}" is not one of the 4 options`,
      );
    });
  });

  await record('2. Controller rejects an unknown question type (no silent default)', async () => {
    const res = await api('/api/questions/generate', {
      method: 'POST',
      token,
      body: { ...payload, type: 'Essay' },
    });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
    assert.ok(
      res.data.message.includes('Question type is required'),
      `unexpected message: ${res.data.message}`,
    );
  });

  await record('3. Controller rejects an unknown difficulty (no silent default)', async () => {
    const res = await api('/api/questions/generate', {
      method: 'POST',
      token,
      body: { ...payload, difficulty: 'Extreme' },
    });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
    assert.ok(
      res.data.message.includes('Difficulty is required'),
      `unexpected message: ${res.data.message}`,
    );
  });

  await record('4. Controller rejects missing marks (no `|| 2` fallback)', async () => {
    const { marks, ...withoutMarks } = payload;
    const res = await api('/api/questions/generate', {
      method: 'POST',
      token,
      body: withoutMarks,
    });
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
    assert.ok(
      res.data.message.includes('Marks per question'),
      `unexpected message: ${res.data.message}`,
    );
  });

  await record('5. Save generated MCQs to the question bank', async () => {
    if (generated.length === 0) throw new Error('no generated questions to save');
    const res = await api('/api/questions/save-generated', {
      method: 'POST',
      token,
      body: { subjectId, questions: generated },
    });
    assert.strictEqual(res.status, 201, `save -> ${res.status}: ${res.data?.message}`);
    assert.strictEqual(
      res.data.skipped.length,
      0,
      `unexpected skips: ${JSON.stringify(res.data.skipped)}`,
    );
    assert.strictEqual(res.data.saved.length, generated.length);
    res.data.saved.forEach((q, i) => {
      assert.strictEqual(q.type, 'MCQ', `saved Q${i + 1} type = ${q.type}`);
      assert.strictEqual(q.difficulty, 'Easy', `saved Q${i + 1} difficulty = ${q.difficulty}`);
      assert.strictEqual(q.marks, 2, `saved Q${i + 1} marks = ${q.marks}`);
    });
    console.log(`        Saved ${res.data.saved.length} questions to the bank`);
  });

  await record('6. Question bank returns them as MCQ / Easy / 2 marks', async () => {
    const res = await api(`/api/questions?subjectId=${subjectId}&type=MCQ&difficulty=Easy`, {
      token,
    });
    assert.strictEqual(res.status, 200, `bank -> ${res.status}`);
    const mcqs = res.data.questions.filter((q) => q.subjectCode === 'JS101');
    assert.ok(
      mcqs.length >= generated.length,
      `expected >= ${generated.length}, got ${mcqs.length}`,
    );
    mcqs.forEach((q, i) => {
      assert.strictEqual(q.type, 'MCQ', `bank Q${i + 1} type = ${q.type}`);
      assert.strictEqual(q.difficulty, 'Easy', `bank Q${i + 1} difficulty = ${q.difficulty}`);
      assert.strictEqual(q.marks, 2, `bank Q${i + 1} marks = ${q.marks}`);
      assert.strictEqual(q.options.length, 4, `bank Q${i + 1} options = ${q.options.length}`);
    });
    console.log(`        Question bank holds ${mcqs.length} matching MCQ/Easy/2-mark questions`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== E2E RESULT: ${results.length - failed.length}/${results.length} passed - ${failed.length === 0 ? 'PASS' : 'FAIL'} ===\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected E2E harness error:', err);
  process.exit(1);
});
