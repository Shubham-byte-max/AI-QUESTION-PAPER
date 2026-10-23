const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const assert = require('assert');
const { generateQuestions } = require('../services/aiService');

const realFetch = global.fetch;

// Preserve the real credentials from .env before the mocked tests overwrite them.
const REAL_AI_PROVIDER = process.env.AI_PROVIDER;
const REAL_AI_API_URL = process.env.AI_API_URL;
const REAL_AI_MODEL = process.env.AI_MODEL;
const REAL_OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

const SUBJECT = { name: 'java spring', code: 'JS101' };
const SYLLABUS = 'java - unit 1';

const BASE_CONFIG = {
  subject: SUBJECT,
  syllabusContent: SYLLABUS,
  topics: [{ name: 'unit 1', weightage: 100 }],
  topic: 'unit 1',
  count: 6,
  difficulty: 'Easy',
  type: 'MCQ',
  marks: 2,
  instructions: '',
};

const results = [];
let lastPrompt = '';

function record(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      results.push({ name, ok: true });
      console.log(`  PASS  ${name}`);
    })
    .catch((err) => {
      results.push({ name, ok: false, err });
      console.log(`  FAIL  ${name}\n        ${err && err.message}`);
    });
}

function mockFetch(questions) {
  const state = { calls: 0, bodies: [] };
  global.fetch = async (url, opts) => {
    state.calls += 1;
    const body = JSON.parse(opts.body);
    state.bodies.push(body);
    lastPrompt = (body.messages || []).map((m) => m.content).join('\n');
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({ questions }) } }],
      }),
    };
  };
  return state;
}

function goodMcqs(count, overrides = {}) {
  const opts = ['Spring Container', 'Servlet Container', 'Hardcoded Objects', 'Manual Wiring'];
  return Array.from({ length: count }, (_, i) => ({
    text: `Question ${i + 1}: Which mechanism wires collaborating beans in Spring?`,
    type: 'MCQ',
    difficulty: 'Easy',
    options: [...opts],
    answer: opts[0],
    correctAnswer: opts[0],
    marks: 2,
    topic: 'unit 1',
    ...overrides,
  }));
}

function expectRejection(promise, fragments) {
  return promise.then(
    () => {
      throw new Error('expected a validation error, but generation succeeded');
    },
    (err) => {
      assert.strictEqual(err.statusCode, 400, `expected statusCode 400, got ${err.statusCode}`);
      for (const fragment of fragments) {
        assert.ok(
          err.message.includes(fragment),
          `error message missing "${fragment}"\n  actual: ${err.message}`,
        );
      }
      return err;
    },
  );
}

async function main() {
  process.env.AI_PROVIDER = 'openrouter';
  process.env.OPENROUTER_API_KEY = 'sk-or-v1-verify-test-key';
  process.env.AI_API_URL = 'https://openrouter.invalid/api/v1/chat/completions';
  process.env.AI_MODEL = 'verify/model';

  console.log('\n=== AI configuration mapping & validation ===\n');

  // 1. Prompt carries the user's exact configuration + the strict rules.
  await record('1. Prompt passes the exact configuration and the strict rules', async () => {
    const mock = mockFetch(goodMcqs(6));
    await generateQuestions({ ...BASE_CONFIG });
    assert.strictEqual(mock.calls, 1, `expected 1 AI call, got ${mock.calls}`);
    for (const needle of [
      'Generate ONLY the requested question type.',
      'Generate ONLY the requested difficulty.',
      'Use EXACTLY the requested marks.',
      'Do not change these values.',
      'The ONLY allowed value for "type" in every question is "MCQ".',
      'The ONLY allowed value for "difficulty" in every question is "Easy".',
      'The ONLY allowed value for "marks" in every question is 2.',
      'Never return type "Short Answer" - it was not requested.',
      'java spring',
      'JS101',
      'java - unit 1',
      'Generate exactly 6 question(s)',
    ]) {
      assert.ok(lastPrompt.includes(needle), `prompt is missing: ${needle}`);
    }
  });

  // 2. The original bug: AI returns Short Answer / Medium for a MCQ / Easy request.
  await record(
    '2. REJECTS type=Short Answer & difficulty=Medium for a MCQ/Easy request',
    async () => {
      const mock = mockFetch(goodMcqs(6, { type: 'Short Answer', difficulty: 'Medium' }));
      const err = await expectRejection(generateQuestions({ ...BASE_CONFIG }), [
        'type mismatch - requested "MCQ" but AI returned "Short Answer"',
        'difficulty mismatch - requested "Easy" but AI returned "Medium"',
      ]);
      assert.strictEqual(mock.calls, 2, `expected 2 AI calls (retry), got ${mock.calls}`);
      assert.ok(!err.message.includes('silently'), 'must not claim to have converted anything');
    },
  );

  // 3. Happy path.
  await record('3. ACCEPTS 6 questions that match the configuration', async () => {
    mockFetch(goodMcqs(6));
    const res = await generateQuestions({ ...BASE_CONFIG });
    assert.strictEqual(
      res.questions.length,
      6,
      `expected 6 questions, got ${res.questions.length}`,
    );
    res.questions.forEach((q, i) => {
      assert.strictEqual(q.type, 'MCQ', `Q${i + 1} type = ${q.type}`);
      assert.strictEqual(q.difficulty, 'Easy', `Q${i + 1} difficulty = ${q.difficulty}`);
      assert.strictEqual(q.marks, 2, `Q${i + 1} marks = ${q.marks}`);
      assert.strictEqual(q.options.length, 4, `Q${i + 1} options = ${q.options.length}`);
      assert.strictEqual(q.correctAnswer, q.answer, `Q${i + 1} correctAnswer != answer`);
      assert.ok(
        q.options.some((o) => o.toLowerCase() === q.answer.toLowerCase()),
        `Q${i + 1} answer "${q.answer}" not among options`,
      );
    });
  });

  // 4. Casing is normalised back to the exact requested spelling (not defaulted).
  await record('4. Normalises AI echo "mcq"/"easy" to exactly "MCQ"/"Easy"', async () => {
    mockFetch(goodMcqs(6, { type: 'mcq', difficulty: 'easy' }));
    const res = await generateQuestions({ ...BASE_CONFIG });
    assert.strictEqual(res.questions.length, 6);
    res.questions.forEach((q) => {
      assert.strictEqual(q.type, 'MCQ');
      assert.strictEqual(q.difficulty, 'Easy');
    });
  });

  // 5. MCQ structure.
  await record('5. REJECTS an MCQ without exactly 4 options', async () => {
    mockFetch(
      goodMcqs(6).map((q) => ({
        ...q,
        options: q.options.slice(0, 3),
        answer: q.options[0],
      })),
    );
    await expectRejection(generateQuestions({ ...BASE_CONFIG }), [
      'MCQ must have exactly 4 options (AI returned 3)',
    ]);
  });

  // 6. A short-answer question mislabelled as MCQ (no options, no answer).
  await record('6. REJECTS a descriptive question mislabelled as MCQ', async () => {
    mockFetch(
      goodMcqs(6).map((q) => ({
        ...q,
        options: [],
        answer: '',
        correctAnswer: '',
      })),
    );
    await expectRejection(generateQuestions({ ...BASE_CONFIG }), [
      'MCQ must have exactly 4 options (AI returned 0)',
      'MCQ is missing its correct answer',
    ]);
  });

  // 7. Marks.
  await record('7. REJECTS marks that differ from the requested 2', async () => {
    mockFetch(goodMcqs(6, { marks: 5 }));
    await expectRejection(generateQuestions({ ...BASE_CONFIG }), [
      'marks mismatch - requested 2 but AI returned 5',
    ]);
  });

  // 8. Correct answer must match an option.
  await record('8. REJECTS a correctAnswer that is not one of the 4 options', async () => {
    mockFetch(goodMcqs(6, { answer: 'Guice', correctAnswer: 'Guice' }));
    await expectRejection(generateQuestions({ ...BASE_CONFIG }), [
      'correct answer "Guice" does not match any of the 4 options',
    ]);
  });

  // 9. Letter answers are resolved to the matching option.
  await record('9. Resolves a letter answer "B" to the matching option', async () => {
    mockFetch(goodMcqs(6, { answer: 'B', correctAnswer: 'B' }));
    const res = await generateQuestions({ ...BASE_CONFIG });
    assert.strictEqual(res.questions[0].answer, 'Servlet Container');
  });

  // 10. Requested configuration is validated before any AI call.
  await record('10. Rejects an invalid requested type before calling the AI', async () => {
    const mock = mockFetch(goodMcqs(6));
    await expectRejection(generateQuestions({ ...BASE_CONFIG, type: 'Essay' }), [
      'Invalid requested question type: "Essay"',
    ]);
    assert.strictEqual(mock.calls, 0, 'AI must not be called for an invalid request');
  });

  // 11. Other difficulty / type combinations.
  await record('11. Enforces Hard + Long Answer for a different configuration', async () => {
    mockFetch(
      goodMcqs(6, {
        type: 'Long Answer',
        difficulty: 'Hard',
        marks: 5,
        options: [],
        answer: 'A model answer.',
      }),
    );
    const res = await generateQuestions({
      ...BASE_CONFIG,
      type: 'Long Answer',
      difficulty: 'Hard',
      marks: 5,
    });
    assert.strictEqual(res.questions.length, 6);
    res.questions.forEach((q) => {
      assert.strictEqual(q.type, 'Long Answer');
      assert.strictEqual(q.difficulty, 'Hard');
      assert.strictEqual(q.marks, 5);
    });

    // and a mismatch is still rejected
    mockFetch(goodMcqs(6, { type: 'MCQ', difficulty: 'Medium', marks: 2 }));
    await expectRejection(
      generateQuestions({
        ...BASE_CONFIG,
        type: 'Long Answer',
        difficulty: 'Hard',
        marks: 5,
      }),
      ['type mismatch - requested "Long Answer"', 'difficulty mismatch - requested "Hard"'],
    );
  });

  global.fetch = realFetch;

  // 12. Real end-to-end run with the reported test case.
  process.env.AI_PROVIDER = REAL_AI_PROVIDER || 'openrouter';
  process.env.AI_API_URL = REAL_AI_API_URL;
  process.env.AI_MODEL = REAL_AI_MODEL;
  process.env.OPENROUTER_API_KEY = REAL_OPENROUTER_KEY;

  const key = process.env.OPENROUTER_API_KEY || '';
  const keyUsable = key.startsWith('sk-or-') && key.length > 40;
  if (process.argv.includes('--skip-live') || !keyUsable) {
    console.log('\n  SKIP  12. Live OpenRouter test (no usable OPENROUTER_API_KEY or --skip-live)');
  } else {
    await record(
      '12. LIVE: java spring (JS101) / java - unit 1 / 6 x MCQ / Easy / 2 marks',
      async () => {
        const res = await generateQuestions({ ...BASE_CONFIG });
        const qs = res.questions;
        console.log(`        Generated Questions (${qs.length})`);
        qs.forEach((q, i) => {
          console.log(
            `        Question ${i + 1}: type=${q.type} | difficulty=${q.difficulty} | marks=${q.marks} | options=${q.options.length}`,
          );
        });
        assert.strictEqual(qs.length, 6, `expected 6 questions, got ${qs.length}`);
        qs.forEach((q, i) => {
          assert.strictEqual(q.type, 'MCQ', `Q${i + 1}: type = ${q.type}, expected MCQ`);
          assert.strictEqual(
            q.difficulty,
            'Easy',
            `Q${i + 1}: difficulty = ${q.difficulty}, expected Easy`,
          );
          assert.strictEqual(q.marks, 2, `Q${i + 1}: marks = ${q.marks}, expected 2`);
          assert.strictEqual(
            q.options.length,
            4,
            `Q${i + 1}: options = ${q.options.length}, expected 4`,
          );
          assert.ok(q.answer, `Q${i + 1}: missing correct answer`);
          assert.strictEqual(q.correctAnswer, q.answer, `Q${i + 1}: correctAnswer != answer`);
          assert.ok(
            q.options.some((o) => o.trim().toLowerCase() === q.answer.trim().toLowerCase()),
            `Q${i + 1}: answer "${q.answer}" is not one of the 4 options`,
          );
        });
      },
    );
  }

  global.fetch = realFetch;

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== RESULT: ${results.length - failed.length}/${results.length} passed - ${failed.length === 0 ? 'PASS' : 'FAIL'} ===\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  global.fetch = realFetch;
  console.error('\nUnexpected test harness error:', err);
  process.exit(1);
});
