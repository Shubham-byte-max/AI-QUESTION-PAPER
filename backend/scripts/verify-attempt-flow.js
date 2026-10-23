const assert = require('assert');

const BASE = process.env.BASE_URL || 'http://localhost:5000';
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

const isObjectId = (v) => typeof v === 'string' && /^[0-9a-f]{24}$/i.test(v);

async function main() {
  console.log(`\n=== Attempt / topic / section verification against ${BASE} ===\n`);

  const stamp = Date.now();
  const email = `e2e${stamp}@test.com`;
  const password = 'Test1234!';

  let token = '';
  let subjectId = '';
  let syllabusId = '';
  const TOPICS = ['Algebra', 'Geometry', 'Trigonometry'];

  await record('0. Setup: register + login + subject + 3-topic syllabus', async () => {
    const reg = await api('/api/auth/register', {
      method: 'POST',
      body: {
        name: 'Attempt Flow Teacher',
        email,
        password,
        collegeName: 'SSC Test College',
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
        name: 'Maharashtra SSC Maths',
        code: 'M101',
        description: 'SSC level',
        semester: 1,
      },
    });
    assert.strictEqual(subj.status, 201, `subject -> ${subj.status}: ${subj.data?.message}`);
    subjectId = subj.data.subject.id;

    const syl = await api('/api/syllabus', {
      method: 'POST',
      token,
      body: {
        title: 'SSC Maths - Algebra, Geometry, Trigonometry',
        subjectId,
        topics: [
          { name: 'Algebra', weightage: 50 },
          { name: 'Geometry', weightage: 30 },
          { name: 'Trigonometry', weightage: 20 },
        ],
        content:
          'Unit 1 Algebra: polynomials, linear equations, arithmetic progression. ' +
          'Unit 2 Geometry: triangles, circles, constructions, coordinate geometry. ' +
          'Unit 3 Trigonometry: trigonometric ratios, identities, heights and distances.',
      },
    });
    assert.strictEqual(syl.status, 201, `syllabus -> ${syl.status}: ${syl.data?.message}`);
    syllabusId = syl.data.syllabus.id;
  });

  let laQuestions = [];
  await record(
    'TC21. 6 x Long Answer / Hard / 5 marks / All Topics -> one syllabus topic each',
    async () => {
      const res = await api('/api/questions/generate', {
        method: 'POST',
        token,
        body: {
          subjectId,
          syllabusId,
          count: 6,
          difficulty: 'Hard',
          type: 'Long Answer',
          marks: 5,
        },
      });
      assert.strictEqual(res.status, 200, `generate -> ${res.status}: ${res.data?.message}`);
      laQuestions = res.data.questions;
      assert.strictEqual(laQuestions.length, 6, `expected 6 questions, got ${laQuestions.length}`);

      const counts = {};
      laQuestions.forEach((q, i) => {
        const n = i + 1;
        assert.strictEqual(q.type, 'Long Answer', `Q${n}: type = ${q.type}`);
        assert.strictEqual(q.difficulty, 'Hard', `Q${n}: difficulty = ${q.difficulty}`);
        assert.strictEqual(q.marks, 5, `Q${n}: marks = ${q.marks}`);
        assert.ok(
          TOPICS.includes(q.topic),
          `Q${n}: topic "${q.topic}" is not one of ${TOPICS.join(', ')} (exactly one topic required)`,
        );
        counts[q.topic] = (counts[q.topic] || 0) + 1;

        const words = q.text.trim().split(/\s+/).length;
        const sentences = q.text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
        console.log(
          `        Q${n}: topic=${q.topic} | words=${words} | sentences=${sentences} | ${q.text.substring(0, 70)}...`,
        );
        assert.ok(words <= 60, `Q${n}: too long (${words} words) for a 5-mark question`);
        assert.ok(sentences <= 4, `Q${n}: too many sentences (${sentences}) for a 5-mark question`);
        assert.ok(q.answer, `Q${n}: missing model answer`);
      });

      assert.deepStrictEqual(
        {
          Algebra: counts.Algebra || 0,
          Geometry: counts.Geometry || 0,
          Trigonometry: counts.Trigonometry || 0,
        },
        { Algebra: 3, Geometry: 2, Trigonometry: 1 },
        `topic distribution wrong: ${JSON.stringify(counts)}`,
      );
      console.log(`        Distribution: ${JSON.stringify(counts)} (weightage 50/30/20)`);
    },
  );

  let mcqQuestions = [];
  await record('TC22. 6 x MCQ / Easy / 2 marks / All Topics', async () => {
    const res = await api('/api/questions/generate', {
      method: 'POST',
      token,
      body: {
        subjectId,
        syllabusId,
        count: 6,
        difficulty: 'Easy',
        type: 'MCQ',
        marks: 2,
      },
    });
    assert.strictEqual(res.status, 200, `generate -> ${res.status}: ${res.data?.message}`);
    mcqQuestions = res.data.questions;
    assert.strictEqual(mcqQuestions.length, 6, `expected 6 questions, got ${mcqQuestions.length}`);
    mcqQuestions.forEach((q, i) => {
      const n = i + 1;
      assert.strictEqual(q.type, 'MCQ', `Q${n}: type = ${q.type}`);
      assert.strictEqual(q.difficulty, 'Easy', `Q${n}: difficulty = ${q.difficulty}`);
      assert.strictEqual(q.marks, 2, `Q${n}: marks = ${q.marks}`);
      assert.strictEqual(q.options.length, 4, `Q${n}: options = ${q.options.length}`);
      assert.ok(TOPICS.includes(q.topic), `Q${n}: topic "${q.topic}" not a syllabus topic`);
      assert.ok(
        q.options.some((o) => o.trim().toLowerCase() === String(q.answer).trim().toLowerCase()),
        `Q${n}: answer not among options`,
      );
    });
  });

  await record('Save TC21 + TC22 questions to the question bank', async () => {
    const res = await api('/api/questions/save-generated', {
      method: 'POST',
      token,
      body: { subjectId, questions: [...laQuestions, ...mcqQuestions] },
    });
    assert.strictEqual(res.status, 201, `save -> ${res.status}: ${res.data?.message}`);
    assert.strictEqual(res.data.saved.length, 12, `saved ${res.data.saved.length} of 12`);
  });

  await record(
    'TC23. Pattern 6 printed / 4 attempt / 5 marks -> total 20 validates (attempted basis)',
    async () => {
      const section = {
        name: 'Section A',
        questionType: 'MCQ',
        questionCount: 6,
        marksPerQuestion: 5,
        attemptQuestions: 4,
        difficulty: 'Easy',
        instruction: '',
      };

      // The valid attempted total (4 x 5 = 20) must be ACCEPTED...
      const ok = await api('/api/exam-patterns', {
        method: 'POST',
        token,
        body: {
          patternName: 'TC23 Attempt Pattern',
          totalMarks: 20,
          duration: 60,
          sections: [section],
        },
      });
      assert.strictEqual(ok.status, 201, `create -> ${ok.status}: ${ok.data?.message}`);
      assert.strictEqual(ok.data.pattern.totalMarks, 20);
      assert.strictEqual(
        ok.data.pattern.calculatedMarks,
        20,
        'calculatedMarks must be attempted basis',
      );
      // ...and the attempt instruction is auto-generated.
      assert.strictEqual(
        ok.data.pattern.sections[0].instruction,
        'Attempt any 4 out of 6 questions. Each question carries 5 marks.',
        `instruction not auto-generated: "${ok.data.pattern.sections[0].instruction}"`,
      );

      // The printed basis (6 x 5 = 30) must be REJECTED on the attempted basis.
      const bad = await api('/api/exam-patterns', {
        method: 'POST',
        token,
        body: {
          patternName: 'TC23 Printed Basis',
          totalMarks: 30,
          duration: 60,
          sections: [section],
        },
      });
      assert.strictEqual(bad.status, 400, `expected 400 for printed total, got ${bad.status}`);
      assert.strictEqual(
        bad.data.message,
        "Section totals (20) don't match total marks (30)",
        `unexpected message: ${bad.data.message}`,
      );
      console.log(
        '        Valid (4 x 5 = 20) -> 201; printed basis -> 400 "Section totals (20) don\'t match total marks (30)"',
      );
    },
  );

  let sscPatternId = '';
  const sscSections = [
    {
      name: 'Section A',
      questionType: 'MCQ',
      questionCount: 6,
      marksPerQuestion: 1,
      attemptQuestions: 6,
      difficulty: 'Easy',
      instruction: '',
    },
    {
      name: 'Section B',
      questionType: 'Short Answer',
      questionCount: 6,
      marksPerQuestion: 2,
      attemptQuestions: 3,
      difficulty: 'Medium',
      instruction: '',
    },
    {
      name: 'Section C',
      questionType: 'Long Answer',
      questionCount: 6,
      marksPerQuestion: 5,
      attemptQuestions: 4,
      difficulty: 'Hard',
      instruction: 'Answer any four questions from Section C.',
    },
  ];
  // Attempted totals: 6*1 + 3*2 + 4*5 = 6 + 6 + 20 = 32 (printed would be 48).
  await record(
    'TC24. SSC-style pattern (A 6/6x1, B 6/3x2, C 6/4x5) -> total 32, instructions kept',
    async () => {
      const res = await api('/api/exam-patterns', {
        method: 'POST',
        token,
        body: {
          patternName: 'Maharashtra SSC Style',
          totalMarks: 32,
          duration: 180,
          subjectId,
          sections: sscSections,
        },
      });
      assert.strictEqual(res.status, 201, `create -> ${res.status}: ${res.data?.message}`);
      sscPatternId = res.data.pattern.id;
      assert.ok(isObjectId(sscPatternId), `pattern id is not an ObjectId: ${sscPatternId}`);
      assert.strictEqual(
        res.data.pattern.calculatedMarks,
        32,
        'calculatedMarks must be 32 (attempted)',
      );
      assert.strictEqual(res.data.pattern.subjectId, subjectId, 'subjectId not echoed');

      const [a, b, c] = res.data.pattern.sections;
      assert.strictEqual(
        a.instruction,
        '',
        'unrestricted section must not get an auto instruction',
      );
      assert.strictEqual(
        b.instruction,
        'Attempt any 3 out of 6 questions. Each question carries 2 marks.',
        `B instruction not auto-generated: "${b.instruction}"`,
      );
      assert.strictEqual(
        c.instruction,
        'Answer any four questions from Section C.',
        'custom instruction must be preserved',
      );

      // Update round-trip (same data) must also pass.
      const upd = await api(`/api/exam-patterns/${sscPatternId}`, {
        method: 'PUT',
        token,
        body: {
          patternName: 'Maharashtra SSC Style',
          totalMarks: 32,
          duration: 180,
          subjectId,
          sections: sscSections,
        },
      });
      assert.strictEqual(upd.status, 200, `update -> ${upd.status}: ${upd.data?.message}`);
    },
  );

  await record(
    'TC25. Defaults: difficulty Medium, attempt = count, no instruction, subject optional',
    async () => {
      const res = await api('/api/exam-patterns', {
        method: 'POST',
        token,
        body: {
          patternName: 'Minimal Pattern',
          totalMarks: 20,
          duration: 60,
          sections: [
            {
              name: 'Section A',
              questionType: 'True/False',
              questionCount: 4,
              marksPerQuestion: 5,
            },
          ],
        },
      });
      assert.strictEqual(res.status, 201, `create -> ${res.status}: ${res.data?.message}`);
      const s = res.data.pattern.sections[0];
      assert.strictEqual(s.difficulty, 'Medium', `difficulty default = ${s.difficulty}`);
      assert.strictEqual(s.attemptQuestions, 4, `attempt default = ${s.attemptQuestions}`);
      assert.strictEqual(s.instruction, '', `instruction default = "${s.instruction}"`);
      assert.strictEqual(res.data.pattern.subjectId, null, 'subjectId default must be null');
      assert.strictEqual(res.data.pattern.calculatedMarks, 20, '4 x 5 = 20');
    },
  );

  let generated = null;
  await record(
    'Paper generate: ALL 18 printed questions, bank marks from section, attempted total 32',
    async () => {
      const res = await api('/api/papers/generate', {
        method: 'POST',
        token,
        body: {
          title: 'SSC Maths Paper',
          subjectId,
          syllabusId,
          examPatternId: sscPatternId,
          totalMarks: 32,
          duration: 180,
          difficulty: 'Medium',
          questionTypes: ['MCQ', 'Short Answer', 'Long Answer'],
          numberOfQuestions: 18,
          unitDistribution: [],
        },
      });
      assert.strictEqual(res.status, 200, `generate -> ${res.status}: ${res.data?.message}`);
      generated = res.data.paper;

      // IDs returned separately from display names.
      assert.strictEqual(generated.examPattern, 'Maharashtra SSC Style', 'pattern name missing');
      assert.strictEqual(generated.examPatternId, sscPatternId, 'examPatternId must be the raw id');
      assert.strictEqual(generated.syllabusId, syllabusId, 'syllabusId must be the raw id');

      // ALL printed questions (6 + 6 + 6 = 18), not the attempted count (13).
      assert.strictEqual(
        generated.questions.length,
        18,
        `expected 18 questions, got ${generated.questions.length}`,
      );

      const bySection = {};
      for (const q of generated.questions) {
        (bySection[q.section] = bySection[q.section] || []).push(q);
      }
      for (const name of ['Section A', 'Section B', 'Section C']) {
        assert.strictEqual(
          bySection[name]?.length,
          6,
          `${name}: expected 6 printed, got ${bySection[name]?.length}`,
        );
      }

      // Bank questions carry the SECTION marks (bank MCQs are 2-mark questions).
      bySection['Section A'].forEach((q, i) => {
        assert.strictEqual(
          q.marks,
          1,
          `Section A Q${i + 1}: marks = ${q.marks}, expected section marks 1`,
        );
        assert.strictEqual(q.type, 'MCQ', `Section A Q${i + 1}: type = ${q.type}`);
      });
      bySection['Section B'].forEach((q, i) => {
        assert.strictEqual(q.marks, 2, `Section B Q${i + 1}: marks = ${q.marks}, expected 2`);
        assert.strictEqual(q.type, 'Short Answer', `Section B Q${i + 1}: type = ${q.type}`);
      });
      bySection['Section C'].forEach((q, i) => {
        assert.strictEqual(q.marks, 5, `Section C Q${i + 1}: marks = ${q.marks}, expected 5`);
        assert.strictEqual(q.type, 'Long Answer', `Section C Q${i + 1}: type = ${q.type}`);
        assert.strictEqual(
          q.difficulty,
          'Hard',
          `Section C Q${i + 1}: difficulty = ${q.difficulty}`,
        );
        assert.strictEqual(q.source, 'Question Bank', `Section C Q${i + 1}: source = ${q.source}`);
      });

      // Section details: attempts, instructions, required marks.
      const sd = generated.sectionDetails;
      assert.strictEqual(sd.length, 3, `sectionDetails = ${sd.length}`);
      assert.deepStrictEqual(
        sd.map((s) => s.attemptQuestions),
        [6, 3, 4],
        'attemptQuestions mismatch',
      );
      assert.deepStrictEqual(
        sd.map((s) => s.requiredMarks),
        [6, 6, 20],
        'requiredMarks must be attempted basis',
      );
      assert.ok(
        sd[1].instruction.includes('Attempt any 3 out of 6'),
        `Section B instruction missing: "${sd[1].instruction}"`,
      );
      assert.strictEqual(
        sd[2].instruction,
        'Answer any four questions from Section C.',
        'Section C custom instruction lost',
      );

      // Attempted total (32), never the printed total (48).
      assert.strictEqual(
        generated.actualTotalMarks,
        32,
        `actualTotalMarks = ${generated.actualTotalMarks}`,
      );

      const failedWarnings = (res.data.warnings || []).filter((w) =>
        w.includes('AI generation failed'),
      );
      assert.strictEqual(failedWarnings.length, 0, `AI warnings: ${failedWarnings.join(' | ')}`);
      console.log(
        `        18 printed (6/6/6) | attempted total ${generated.actualTotalMarks} | printed total would be 48`,
      );
    },
  );

  let paperId = '';
  const savePayload = () => ({
    title: generated.title,
    subjectId: generated.subjectId,
    questions: generated.questions,
    totalMarks: generated.totalMarks,
    duration: generated.duration,
    examPattern: generated.examPatternId,
    syllabus: generated.syllabusId,
    sectionDetails: generated.sectionDetails,
  });

  await record('Save paper (full preview payload) -> 201', async () => {
    const res = await api('/api/papers', {
      method: 'POST',
      token,
      body: savePayload(),
    });
    assert.strictEqual(res.status, 201, `save -> ${res.status}: ${res.data?.message}`);
    paperId = res.data.paper.id;
    assert.ok(isObjectId(paperId), `paper id invalid: ${paperId}`);
    assert.strictEqual(
      res.data.paper.questionCount,
      18,
      `questionCount = ${res.data.paper.questionCount}`,
    );
  });

  const assertGet = async (label) => {
    const res = await api(`/api/papers/${paperId}`, { token });
    assert.strictEqual(res.status, 200, `${label}: get -> ${res.status}`);
    const p = res.data.paper;
    assert.strictEqual(p.questions.length, 18, `${label}: questions = ${p.questions.length}`);
    assert.strictEqual(p.examPattern, 'Maharashtra SSC Style', `${label}: pattern name missing`);
    assert.ok(isObjectId(p.examPatternId), `${label}: examPatternId not an id: ${p.examPatternId}`);
    assert.ok(isObjectId(p.syllabusId), `${label}: syllabusId not an id: ${p.syllabusId}`);
    assert.strictEqual(p.totalMarks, 32, `${label}: totalMarks = ${p.totalMarks}`);

    const sectionCount = {};
    for (const q of p.questions) {
      sectionCount[q.section] = (sectionCount[q.section] || 0) + 1;
    }
    assert.deepStrictEqual(
      sectionCount,
      { 'Section A': 6, 'Section B': 6, 'Section C': 6 },
      `${label}: section mapping lost: ${JSON.stringify(sectionCount)}`,
    );
    assert.strictEqual(
      p.sectionDetails.length,
      3,
      `${label}: sectionDetails = ${p.sectionDetails.length}`,
    );
    for (const sd of p.sectionDetails) {
      assert.strictEqual(
        (sd.questionIds || []).length,
        6,
        `${label}: ${sd.name} questionIds = ${(sd.questionIds || []).length}`,
      );
    }
    return p;
  };

  await record('GET paper: sections restored (6/6/6), questionIds, raw ids, total 32', async () => {
    await assertGet('after save');
  });

  await record('UPDATE paper with the same preview payload -> 200 (no CastError)', async () => {
    const res = await api(`/api/papers/${paperId}`, {
      method: 'PUT',
      token,
      body: savePayload(),
    });
    assert.strictEqual(res.status, 200, `update -> ${res.status}: ${res.data?.message}`);
    assert.strictEqual(res.data.paper.questionCount, 18);
  });

  await record('GET paper again: section mapping still intact after update', async () => {
    await assertGet('after update');
  });

  await record(
    'REJECTS a pattern NAME in the examPattern id field -> 400 (no CastError 500)',
    async () => {
      const res = await api(`/api/papers/${paperId}`, {
        method: 'PUT',
        token,
        body: { ...savePayload(), examPattern: 'Maharashtra SSC Style' },
      });
      assert.strictEqual(res.status, 400, `expected 400, got ${res.status}: ${res.data?.message}`);
      assert.ok(
        res.data.message.includes('Invalid exam pattern reference'),
        `unexpected message: ${res.data.message}`,
      );
      // Restore is not needed: the bad update was rejected, the paper is unchanged.
    },
  );

  await record(
    'REJECTS generating with a non-existent pattern id -> 400 (no silent fallback)',
    async () => {
      const res = await api('/api/papers/generate', {
        method: 'POST',
        token,
        body: {
          title: 'Bad Pattern Paper',
          subjectId,
          examPatternId: '000000000000000000000000',
          totalMarks: 32,
          duration: 180,
          numberOfQuestions: 18,
          questionTypes: ['MCQ'],
        },
      });
      assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
      assert.ok(
        res.data.message.includes('Invalid exam pattern'),
        `unexpected message: ${res.data.message}`,
      );
    },
  );

  await record(
    'REJECTS saving a question with a wrong type/difficulty (no silent conversion)',
    async () => {
      const wrongType = await api('/api/papers', {
        method: 'POST',
        token,
        body: {
          title: 'Wrong Type Paper',
          subjectId,
          totalMarks: 10,
          duration: 30,
          questions: [
            {
              text: 'What is the square root of 49?',
              type: 'Essay',
              difficulty: 'Easy',
              marks: 2,
            },
          ],
        },
      });
      assert.strictEqual(
        wrongType.status,
        400,
        `type -> ${wrongType.status}: ${wrongType.data?.message}`,
      );
      assert.ok(
        wrongType.data.message.includes('Invalid question type'),
        `unexpected message: ${wrongType.data.message}`,
      );

      const wrongDifficulty = await api('/api/papers', {
        method: 'POST',
        token,
        body: {
          title: 'Wrong Difficulty Paper',
          subjectId,
          totalMarks: 10,
          duration: 30,
          questions: [
            {
              text: 'What is the square root of 49?',
              type: 'MCQ',
              difficulty: 'Extreme',
              marks: 2,
              options: ['A', 'B', 'C', 'D'],
              answer: 'A',
            },
          ],
        },
      });
      assert.strictEqual(wrongDifficulty.status, 400, `difficulty -> ${wrongDifficulty.status}`);
      assert.ok(
        wrongDifficulty.data.message.includes('Invalid question difficulty'),
        `unexpected message: ${wrongDifficulty.data.message}`,
      );
    },
  );

  await record('REJECTS unauthenticated paper access -> 401', async () => {
    const res = await api('/api/papers');
    assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
  });

  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n=== ATTEMPT-FLOW RESULT: ${results.length - failed.length}/${results.length} passed - ${failed.length === 0 ? 'PASS' : 'FAIL'} ===\n`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnexpected harness error:', err);
  process.exit(1);
});
