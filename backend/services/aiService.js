const crypto = require('crypto');

const VALID_TYPES = ['MCQ', 'Short Answer', 'Long Answer', 'True/False', 'Fill in the Blanks'];
const VALID_DIFFICULTIES = ['Easy', 'Medium', 'Hard'];

const MIXED_DIFFICULTY = 'Mixed';
const REQUEST_DIFFICULTIES = [...VALID_DIFFICULTIES, MIXED_DIFFICULTY];

const TYPE_ALIASES = {
  mcq: 'MCQ',
  mcqs: 'MCQ',
  'mcq question': 'MCQ',
  'multiple choice': 'MCQ',
  'multiple choice questions': 'MCQ',
  'multiple choice question': 'MCQ',
  'multiple-choice': 'MCQ',
  choice: 'MCQ',
  'short answer': 'Short Answer',
  short: 'Short Answer',
  'short answers': 'Short Answer',
  'short answer question': 'Short Answer',
  'short-answer': 'Short Answer',
  'long answer': 'Long Answer',
  long: 'Long Answer',
  'long answers': 'Long Answer',
  'long answer question': 'Long Answer',
  'long-answer': 'Long Answer',
  essay: 'Long Answer',
  'true/false': 'True/False',
  'true false': 'True/False',
  'true-false': 'True/False',
  truefalse: 'True/False',
  boolean: 'True/False',
  tf: 'True/False',
  'fill in the blanks': 'Fill in the Blanks',
  'fill in the blank': 'Fill in the Blanks',
  'fill in blanks': 'Fill in the Blanks',
  'fill in blank': 'Fill in the Blanks',
  'fill in the blanks question': 'Fill in the Blanks',
  fillblank: 'Fill in the Blanks',
  blank: 'Fill in the Blanks',
};

const DIFFICULTY_ALIASES = {
  easy: 'Easy',
  easier: 'Easy',
  basic: 'Easy',
  simple: 'Easy',
  medium: 'Medium',
  moderate: 'Medium',
  intermediate: 'Medium',
  hard: 'Hard',
  harder: 'Hard',
  difficult: 'Hard',
  advanced: 'Hard',
  mixed: MIXED_DIFFICULTY,
};

function normalizeKey(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function canonicalType(value) {
  const raw = String(value === undefined || value === null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  if (VALID_TYPES.includes(raw)) return raw;
  return TYPE_ALIASES[normalizeKey(value)] || '';
}

function canonicalDifficulty(value) {
  const raw = String(value === undefined || value === null ? '' : value)
    .trim()
    .replace(/\s+/g, ' ');
  if (!raw) return '';
  if (REQUEST_DIFFICULTIES.includes(raw)) return raw;
  return DIFFICULTY_ALIASES[normalizeKey(value)] || '';
}

function isMathematicsSubject(subject) {
  const name = String((subject && (subject.name || subject.subjectName)) || '').toLowerCase();
  return name.includes('math');
}

function hasNumericalContent(text) {
  const value = String(text || '');
  // Digits, common math symbols, or math expressions signal numerical content.
  if (/\d/.test(value)) return true;
  if (/[=+\-*/^√∫∑%<>≤≥≠±×÷]/.test(value)) return true;
  if (/\bi\s*([+-]|$)/i.test(value) && /[a-z]+\s*\(/i.test(value)) return true;
  return false;
}

function hasCalculationIntent(text) {
  const value = String(text || '');
  if (
    /\b(calculat|comput|solv|solut|simplif|evaluat|find|determin|multipl|divid|divis|add|subtract|factor|expand|integrat|different|deriv|verify|prove|show\s+that|express\b.{0,40}\bform\b|convert|modulus|real\s+and\s+imaginary)\w*\b/i.test(
      value,
    )
  )
    return true;
  if (/______/.test(value)) return true;
  return false;
}

function hasConcreteComputation(text) {
  const value = String(text || '');
  // Two numbers joined by an operator, e.g. 3+4, 2x+5, (3 + 4i)(1 - 2i).
  if (/\d\w*\s*[+\-*/×÷%^]\s*[\d(ix]/i.test(value)) return true;
  if (/\(\s*[^)]*\d[^)]*[+\-*/]\s*[^)]*\d[^)]*\)/.test(value)) return true;
  return false;
}

function validateMathAnswerFormat(answer, marks) {
  const errors = [];
  const value = String(answer || '');
  if (!value || value.trim().length === 0) {
    errors.push('mathematics answer is missing - provide a step-by-step solution');
    return errors;
  }
  if (!/Step\s*1/i.test(value)) {
    errors.push(
      'mathematics answer must use separate "Step 1", "Step 2", "Step 3", etc. lines - never write the complete solution in one long paragraph or single line',
    );
  }
  if (!/Final\s*Answer/i.test(value)) {
    errors.push(
      'mathematics answer must end with a clearly labelled "Final Answer" on its own lines',
    );
  }
  const hasNewline = value.includes('\n');
  if (!hasNewline) {
    errors.push(
      'mathematics answer must use separate lines with line breaks for every major calculation - do not put the whole solution in one line',
    );
  } else {
    const lines = value
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const stepOccurrences = (value.match(/Step\s*\d/gi) || []).length;
    const stepLines = lines.filter((l) => /Step\s*\d/i.test(l)).length;
    if (stepOccurrences > 0 && stepLines < stepOccurrences) {
      errors.push(
        'mathematics answer must place each "Step N" on its own separate line - do not combine "Step 1: ... Step 2: ... Final Answer..." in one line',
      );
    }
    const numMarks = parseInt(marks, 10) || 0;
    if (numMarks >= 5) {
      if (stepOccurrences < 3) {
        errors.push(
          '5-mark mathematics answer must show at least Step 1, Step 2 and Step 3 with intermediate calculations on separate lines (complete multi-step college-level solution)',
        );
      }
    } else if (numMarks >= 3) {
      if (stepOccurrences < 2) {
        errors.push(
          'mathematics answer must show at least Step 1 and Step 2 on separate lines with intermediate calculations',
        );
      }
    }
    const formulaLines = lines.filter((l) => /\d/.test(l) && /[=+\-*/^×÷]/.test(l)).length;
    if (formulaLines < 1) {
      errors.push(
        'mathematics answer must display mathematical expressions/formulas on separate lines with intermediate calculations, not only prose',
      );
    } else if (numMarks >= 5 && formulaLines < 2) {
      errors.push(
        '5-mark mathematics answer must show intermediate calculations on separate lines, not only the final answer - do not skip calculation steps',
      );
    }
  }
  if (!/\\boxed\{[^}]+\}/.test(value)) {
    errors.push(
      'mathematics answer must put the final result in \\boxed{} (e.g. \\boxed{11 - 2i})',
    );
  }
  return errors;
}

function looksLikeTheoryOnly(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  // A concrete expression to compute (e.g. "2+2", "(3 + 4i)(1 - 2i)") is
  // numerical even when phrased as "What is ...?".
  if (hasConcreteComputation(value)) return false;
  const startsWithTheory =
    /^\s*(define|describe|explain|state|discuss|elaborate|outline|write\s+(a\s+note|short\s+note)|what\s+is|what\s+are|list\s+(the\s+)?(properties|features|advantages|limitations)|give\s+(an?\s+)?(definition|explanation|example\s+of\s+the\s+concept))\b/i.test(
      value,
    );
  const containsTheoryPhrase =
    /\b(explain|describe|define|discuss|elaborate|state)\b.{0,60}\b(effect|meaning|concept|definition|theory|importance|significance|properties|features|advantages|limitations|in\s+your\s+own\s+words|briefly|in\s+detail)\b/i.test(
      value,
    );
  if (!startsWithTheory && !containsTheoryPhrase) return false;
  // Even if incidental numbers (e.g. "i² = -1") or a generic mention of
  // "multiplying" appear, a theory-phrased question without a concrete
  // expression to compute is still theory-only.
  if (!hasCalculationIntent(value)) return true;
  // A theory-phrased question is only numerical if it gives a concrete
  // expression/equation to work with - a bare mention of an operation
  // ("effect of multiplying ...") is not enough.
  return !hasConcreteComputation(value);
}

// Safe value for error messages (never prints "undefined").
function shown(value) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  return text.length > 0 ? text : '(missing)';
}

function badRequestError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}
function buildTopicPlan(topics, count) {
  const usable = (Array.isArray(topics) ? topics : [])
    .map((t) => ({
      name: String((t && (t.name || t)) || '').trim(),
      weightage: t && typeof t === 'object' ? Math.max(Number(t.weightage) || 0, 0) : 0,
    }))
    .filter((t) => t.name.length > 0);

  if (usable.length === 0 || !Number.isInteger(count) || count < 1) return null;

  const totalWeight = usable.reduce((sum, t) => sum + t.weightage, 0);
  let shares;
  if (totalWeight > 0) {
    const exact = usable.map((t) => (t.weightage / totalWeight) * count);
    shares = exact.map((v) => Math.floor(v));
    let remaining = count - shares.reduce((a, b) => a + b, 0);
    const byFraction = exact
      .map((v, i) => ({ i, fraction: v - Math.floor(v) }))
      .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
    for (let k = 0; remaining > 0; k++, remaining--) {
      shares[byFraction[k % byFraction.length].i] += 1;
    }
  } else {
    const base = Math.floor(count / usable.length);
    const extra = count % usable.length;
    shares = usable.map((_, i) => base + (i < extra ? 1 : 0));
  }

  const plan = [];
  const left = [...shares];
  let step = 0;
  while (plan.length < count && step < count * usable.length + usable.length) {
    const idx = step % usable.length;
    if (left[idx] > 0) {
      plan.push(usable[idx].name);
      left[idx] -= 1;
    }
    step += 1;
  }
  return plan.length === count ? plan : null;
}

const FREE_MODELS = [
  'nex-agi/nex-n2.5-mini:free',
  'nex-agi/nex-n2.5-pro:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'liquid/lfm-2.5-2.6b:free',
  'qwen/qwen3.8-27b:free',
  'google/gemma-4-26b-a4b-it:free',
  'google/gemma-4-31b-it:free',
];

function buildPrompt({
  subject,
  syllabusContent,
  topics,
  topic,
  topicPlan,
  count,
  difficulty,
  type,
  marks,
  instructions,
}) {
  let prompt = `You are an expert academic question writer for the subject "${subject.name}" (code: ${subject.code}).\n\n`;

  if (syllabusContent) {
    const truncated =
      syllabusContent.length > 6000
        ? syllabusContent.substring(0, 6000) + '\n...[truncated]'
        : syllabusContent;
    prompt += `SYLLABUS CONTENT:\n${truncated}\n\n`;
  }

  if (topics && topics.length > 0) {
    prompt += `AVAILABLE TOPICS/UNITS:\n`;
    topics.forEach((t, i) => {
      prompt += `  ${i + 1}. ${t.name}${t.weightage ? ` (weightage: ${t.weightage}%)` : ''}\n`;
    });
    prompt += '\n';
  }

  if (topic) {
    prompt += `FOCUS TOPIC/UNIT: ${topic}\n\n`;
  }

  if (Array.isArray(topicPlan) && topicPlan.length > 0) {
    prompt += `QUESTION-TOPIC ASSIGNMENT (STRICT):\n`;
    prompt += `- Every question must cover exactly ONE syllabus topic.\n`;
    prompt += `- Use EXACTLY this assignment, in order, for the "topic" field of each question:\n`;
    topicPlan.forEach((name, i) => {
      prompt += `  Question ${i + 1} -> "${name}"\n`;
    });
    prompt += `- The "topic" value must be spelled exactly as written above.\n`;
    prompt += `- Do not invent, rename, merge, swap or mix topics, and do not use any topic that is not listed above.\n\n`;
  }

  prompt += `REQUIREMENTS:\n`;
  prompt += `- Generate exactly ${count} question(s)\n`;
  prompt += `- Question type: ${type}\n`;
  prompt += `- Difficulty level: ${difficulty === MIXED_DIFFICULTY ? 'Mixed (pick Easy, Medium or Hard for each question)' : difficulty}\n`;
  if (difficulty === 'Easy') {
    prompt += `- Generate an EASY-level question only.\n`;
  } else if (difficulty === 'Medium') {
    prompt += `- Generate a MEDIUM-level question only.\n`;
  } else if (difficulty === 'Hard') {
    prompt += `- Generate a HARD-level question only.\n`;
  }
  prompt += `- Marks per question: ${marks}\n`;

  const isMathematics = isMathematicsSubject(subject);

  if (isMathematics) {
    prompt += `\nIMPORTANT MATHEMATICS RULE (NON-NEGOTIABLE - OVERRIDES ALL OTHER STYLE GUIDANCE):\n`;
    prompt += `- The subject is Mathematics. Generate ONLY NUMERICAL / SUM-BASED questions requiring actual mathematical calculation, solving, evaluation, simplification, derivation, or computation.\n`;
    prompt += `- Every question MUST include numerical values, equations, expressions, matrices, data, or other concrete mathematical inputs that the student must compute with.\n`;
    prompt += `- The student must need to show calculation steps to obtain the answer.\n`;
    prompt += `- Do NOT generate theory-only or descriptive questions. NEVER ask only to "define", "describe", "explain", "state", or give theoretical descriptions.\n`;
    prompt += `- Do NOT convert a numerical topic into a theory question.\n`;
    prompt += `- Every generated question must be directly based on the selected syllabus topic / FOCUS TOPIC / QUESTION-TOPIC ASSIGNMENT.\n`;
    prompt += `- Each question must belong to exactly ONE selected syllabus topic. Do not combine unrelated topics in one question.\n`;
    prompt += `- For 5-mark questions, generate a proper multi-step numerical problem that requires calculation and working.\n`;
    prompt += `- For Short/Long Answer: the "answer" MUST contain the correct step-by-step mathematical solution (each calculation step shown with correct notation and formulas), ending with "Final Answer: ...", not just the final value. It MUST follow the MATHEMATICS ANSWER FORMAT RULE below.\n`;
    prompt += `- For MCQ: the question must be a numerical problem and the 4 options must be computed numerical values/expressions with one correct computed answer.\n`;
    prompt += `- For True/False: the statement must be a verifiable numerical claim (equation + claimed result) that requires calculation to judge True/False.\n`;
    prompt += `- For Fill in the Blanks: the text must be a numerical problem containing "______" for the computed value; "answer" is the computed value.\n`;
    prompt += `- Use mathematically correct notation and formulas.\n`;
    prompt += `- Difficulty mapping: Easy = simple one/two-step calculations; Medium = multi-step numerical problems; Hard = challenging multi-step numerical problems requiring deeper calculation.\n`;
    prompt += `- If the topic is "Imaginary Numbers" (or Complex Numbers), generate problems such as: addition/subtraction of complex numbers, multiplication/division of complex numbers, simplification using i² = -1, finding real and imaginary parts, modulus or related calculations.\n`;
    prompt += `- CORRECT example: "Calculate and simplify (3 + 4i)(1 - 2i), and express the answer in the standard form a + bi."\n`;
    prompt += `- WRONG example (NEVER DO THIS): "The imaginary unit i satisfies i² = -1. Explain the effect of multiplying a complex number by i."\n`;
    prompt += `\nMATHEMATICS ANSWER FORMAT RULE (NON-NEGOTIABLE - FOR Short/Long Answer "answer" FIELD):\n`;
    prompt += `- For every Mathematics numerical question, the "answer" MUST be a clear step-by-step mathematical solution looking like a properly written examination solution.\n`;
    prompt += `- NEVER write the complete solution in one long paragraph or single line.\n`;
    prompt += `- Use separate lines (line breaks) for every major calculation. Preserve spacing and line breaks.\n`;
    prompt += `- Start each major calculation on its own line with "Step 1:", "Step 2:", "Step 3:", etc.\n`;
    prompt += `- Display each mathematical expression/formula on its own separate line - never bury formulas inside one continuous sentence.\n`;
    prompt += `- Show formulas and substitutions clearly. Show intermediate calculations, not only the final answer. Do not skip calculation steps.\n`;
    prompt += `- Briefly explain important mathematical rules when used (for example, state i² = -1 on its own line before substituting).\n`;
    prompt += `- For 5-mark questions, provide a complete multi-step college-examination solution (at least Step 1, Step 2, Step 3 with formulas on separate lines).\n`;
    prompt += `- End with a clearly labelled "Final Answer" on its own lines, and put the final result in \\boxed{} (inside JSON write it as \\\\boxed{} so it parses to \\boxed{}).\n`;
    prompt += `- Do NOT output "Step 1: ... Step 2: ... Final Answer: ..." all in one line. Each Step and the Final Answer MUST be on separate lines.\n`;
    prompt += `- Inside the JSON string, use \\n for line breaks and \\\\ for a backslash (so \\\\boxed{11 - 2i} in JSON becomes \\boxed{11 - 2i} after parsing).\n`;
    prompt += `- REQUIRED "answer" structure (each item on its own lines):\n`;
    prompt += `  Step 1: <what is done>\n`;
    prompt += `  <formula on separate line>\n`;
    prompt += `  Step 2: <substitution / rule, e.g. Substitute i² = -1>\n`;
    prompt += `  <formula on separate line>\n`;
    prompt += `  Step 3: <combine / simplify>\n`;
    prompt += `  <formula on separate line>\n`;
    prompt += `  Final Answer:\n`;
    prompt += `  \\\\boxed{<final result>}\n`;
  }

  if (type === 'MCQ') {
    prompt += `- Each MCQ must have exactly 4 options (A, B, C, D) with one correct answer\n`;
    prompt += `- Every question must be a real multiple-choice question. Do NOT write a descriptive/short-answer question and then label it as an MCQ.\n`;
  }

  prompt += `\nFIXED CONFIGURATION - THESE VALUES MUST NOT BE CHANGED:\n`;
  prompt += `- Generate ONLY the requested question type.\n`;
  prompt += `- Generate ONLY the requested difficulty.\n`;
  prompt += `- Use EXACTLY the requested marks.\n`;
  prompt += `- Do not change these values.\n`;
  prompt += `- The ONLY allowed value for "type" in every question is "${type}".\n`;
  if (difficulty === MIXED_DIFFICULTY) {
    prompt += `- The ONLY allowed values for "difficulty" in every question are "Easy", "Medium" or "Hard" (never the word "Mixed").\n`;
  } else {
    prompt += `- The ONLY allowed value for "difficulty" in every question is "${difficulty}". Do not silently change it to Medium, Easy or Hard.\n`;
  }
  prompt += `- The ONLY allowed value for "marks" in every question is ${marks}.\n`;
  prompt += `- Never substitute a default such as "Short Answer", "Long Answer", "Medium" or 2 marks.\n`;
  for (const other of VALID_TYPES) {
    if (other !== type) {
      prompt += `- Never return type "${other}" - it was not requested.\n`;
    }
  }

  prompt += `\nSTRICT QUESTION TYPE RULE (NON-NEGOTIABLE):\n`;
  prompt += `- You MUST generate ONLY ${type} questions. Every single question in the response must be of type "${type}".\n`;
  prompt += `- Do NOT mix in any other question type. There is no mixed mode.\n`;
  if (type === 'MCQ') {
    prompt += `- Every question must have exactly 4 options.\n`;
    prompt += `- Each option must correspond to one of the labels A, B, C, D (the system adds the A/B/C/D labels when displaying).\n`;
    prompt += `- Each question must have exactly one correct answer.\n`;
    prompt += `- Do NOT generate Short Answer questions.\n`;
    prompt += `- Do NOT generate Long Answer questions.\n`;
    prompt += `- Do NOT generate True/False questions.\n`;
    prompt += `- Do NOT generate Fill in the Blanks questions.\n`;
    prompt += `- Do NOT generate any other question type.\n`;
  }
  prompt += '\n';

  if (instructions) {
    prompt += `- Additional instructions: ${instructions}\n`;
  }

  const difficultyLiteral = difficulty === MIXED_DIFFICULTY ? 'Easy' : difficulty;

  prompt += `\nRESPONSE FORMAT:\n`;
  prompt += `Return ONLY a valid JSON object with no markdown, no code fences, no extra text. The format must be:\n`;
  prompt += `{"questions":[{"text":"...","type":"${type}","difficulty":"${difficultyLiteral}","options":["option A","option B","option C","option D"],"answer":"correct option or answer text","correctAnswer":"correct option or answer text","marks":${marks},"topic":"topic name"}]}\n\n`;
  prompt += `Every question object MUST repeat these exact literal values: "type" = "${type}", "difficulty" = ${difficulty === MIXED_DIFFICULTY ? '"Easy", "Medium" or "Hard"' : `"${difficulty}"`}, "marks" = ${marks}, and "correctAnswer" must be identical to "answer".\n`;

  if (type === 'MCQ') {
    prompt += `For MCQ: "options" must be an array of exactly 4 strings. "answer" must be one of the 4 option strings.\n`;
    if (isMathematics) {
      prompt += `For Mathematics MCQ: all 4 options must be numerical values/expressions resulting from calculation (not theory statements).\n`;
    }
  } else if (type === 'True/False') {
    prompt += `For True/False: "options" should be ["True", "False"]. "answer" must be "True" or "False".\n`;
  } else if (type === 'Fill in the Blanks') {
    prompt += `For Fill in the Blanks: the question text should contain "______" where the blank is. "answer" is the word/phrase that fills the blank.\n`;
    if (isMathematics) {
      prompt += `For Mathematics Fill in the Blanks: "answer" is the computed numerical value.\n`;
    }
  } else {
    prompt += `For Short/Long Answer: "options" should be an empty array []. "answer" should be a model answer.\n`;
    if (isMathematics) {
      prompt += `For Mathematics Short/Long Answer: "answer" MUST be a step-by-step examination solution with "Step 1:", "Step 2:", ... each on separate lines (use \\n line breaks inside the JSON string), formulas on separate lines, ending with "Final Answer:" and \\\\boxed{result}. NEVER a single-paragraph/single-line answer.\n`;
    }
  }

  prompt += `\nSTRICT QUESTION LENGTH AND SCOPE RULES (based on ${marks} marks per question):\n`;
  prompt += `- Each question must cover exactly ONE syllabus topic and ONE main concept.\n`;
  prompt += `- Maximum one closely related sub-point per question.\n`;
  prompt += `- Do NOT combine multiple topics or create multi-part questions.\n`;
  prompt += `- Do NOT list many concepts in one question.\n`;
  if (isMathematics) {
    prompt += `- Difficulty comes from calculation depth WITHIN that single topic (more steps, deeper computation) - never by combining several topics.\n`;
    if (marks <= 1) {
      prompt += `- For ${marks} mark(s): VERY SHORT numerical problem. ONE basic one/two-step calculation with concrete numbers/equation. Example: "Evaluate 5 + 3 × 2."\n`;
    } else if (marks === 2) {
      prompt += `- For 2 marks: SHORT numerical problem. ONE main calculation, maximum one small related step. Example: "Solve 2x + 5 = 15 for x, showing your steps."\n`;
    } else if (marks === 3) {
      prompt += `- For 3 marks: MODERATELY SHORT numerical problem with a few calculation steps based on ONE topic.\n`;
    } else if (marks === 4) {
      prompt += `- For 4 marks: MODERATELY DETAILED multi-step numerical problem based on ONE topic, requiring shown working.\n`;
    } else if (marks === 5) {
      prompt += `- For 5 marks: COMPLETE multi-step numerical problem with multiple calculation steps and shown working based on ONE topic. Example: "Calculate and simplify (3 + 4i)(1 - 2i), and express the answer in the standard form a + bi. Show each step." IMPORTANT: 5 marks means a full numerical problem with working - NEVER a theory/definition question.\n`;
    } else {
      prompt += `- For ${marks} marks: DETAILED multi-step numerical problem with full calculation steps based on ONE topic. NEVER a theory question.\n`;
    }
  } else {
    prompt += `- Hard difficulty must NOT make the question longer. Difficulty should come from depth of thinking, analysis, application, or comparison — NOT from adding more sub-questions.\n`;
    if (difficulty === 'Hard') {
      prompt += `- Hard difficulty means deeper analysis WITHIN that single assigned topic (application, comparison, evaluation) — never by combining several topics into one question.\n`;
    }

    if (marks <= 1) {
      prompt += `- For ${marks} mark(s): VERY SHORT and DIRECT. Focus on ONE basic concept, fact, or definition. Target: approximately 5-15 words. Example: "What is dependency injection?"\n`;
    } else if (marks === 2) {
      prompt += `- For 2 marks: SHORT and FOCUSED. Focus on ONE main concept, maximum ONE very small related point. Target: approximately 10-20 words. Example: "Define dependency injection and state one benefit of using it." Do NOT generate long multi-part questions.\n`;
    } else if (marks === 3) {
      prompt += `- For 3 marks: MODERATELY SHORT. Focus on ONE main concept with one closely related explanation or example if appropriate. Target: approximately 15-25 words.\n`;
    } else if (marks === 4) {
      prompt += `- For 4 marks: MODERATELY DETAILED but focused. Focus on ONE main concept, maximum one closely related sub-point. Target: approximately 15-30 words.\n`;
    } else if (marks === 5) {
      prompt += `- For 5 marks: COLLEGE-LEVEL 5-mark question. Focus on ONE main concept, maximum one closely related sub-point. May include explanation, analysis, comparison, application, or a suitable example when appropriate. Target: 1-3 sentences (approximately 15-30 words). Example: "Explain method overriding in Java and analyze how runtime polymorphism is achieved." IMPORTANT: 5 marks does NOT mean a long or multi-part question - keep it to 1-3 sentences.\n`;
    } else {
      prompt += `- For ${marks} marks: MORE DETAILED question allowed. It may require deeper explanation, analysis, comparison, application, or a suitable example. But it must still focus on ONE main topic and avoid unnecessary length.\n`;
    }
  }

  prompt += `\nMake questions academically rigorous, clear, and unambiguous. Ensure variety in the questions.`;

  return prompt;
}

function stripOptionLabel(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/^(?:option\s*)?\(?[a-h]\)?[.)]\s*/, '')
    .replace(/[.\s]+$/, '')
    .trim();
}

function resolveMcqAnswer(answer, options) {
  const raw = String(answer === undefined || answer === null ? '' : answer).trim();
  if (!raw || !Array.isArray(options) || options.length === 0) return '';

  const exact = options.find((o) => String(o).trim().toLowerCase() === raw.toLowerCase());
  if (exact) return exact;

  const rawStripped = stripOptionLabel(raw);
  if (rawStripped) {
    const stripped = options.find((o) => stripOptionLabel(o) === rawStripped);
    if (stripped) return stripped;
  }

  const letter = raw.match(/^(?:option\s*)?\(?([a-h])\)?$/i);
  if (letter) {
    const index = letter[1].toLowerCase().charCodeAt(0) - 97;
    if (index < options.length && options[index]) return options[index];
  }

  return '';
}

function resolveTrueFalse(answer) {
  const raw = String(answer === undefined || answer === null ? '' : answer)
    .trim()
    .toLowerCase()
    .replace(/[.\s]+$/, '');
  if (raw.startsWith('true') || raw === 't') return 'True';
  if (raw.startsWith('false') || raw === 'f') return 'False';
  return '';
}

function normalizeRawQuestion(question) {
  if (!question || typeof question !== 'object') return question;

  const pick = (primary, ...alternates) => {
    for (const key of [primary, ...alternates]) {
      const value = question[key];
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return undefined;
  };

  const text = pick('text', 'question', 'questionText', 'prompt');
  if (text !== undefined) question.text = text;

  const type = pick('type', 'questionType');
  if (type !== undefined) question.type = type;

  const difficulty = pick('difficulty', 'level');
  if (difficulty !== undefined) question.difficulty = difficulty;

  const marks = pick('marks', 'mark', 'score');
  if (marks !== undefined) question.marks = marks;

  const answer = pick('answer', 'correctAnswer', 'correct_answer', 'correct');
  if (answer !== undefined) question.answer = answer;

  const options = pick('options', 'choices');
  if (options !== undefined && !Array.isArray(question.options)) question.options = options;

  if (
    question.options &&
    !Array.isArray(question.options) &&
    typeof question.options === 'object'
  ) {
    question.options = Object.values(question.options);
  }

  return question;
}

function validateQuestion(question, index, requested) {
  const errors = [];
  const warnings = [];
  const label = `Question ${index + 1}`;
  const q = normalizeRawQuestion(question);
  const isMathematics = Boolean(requested && requested.isMathematics);

  if (!q || typeof q !== 'object') {
    errors.push(`${label}: AI returned an entry that is not a question object`);
    return { errors, warnings };
  }

  if (typeof q.text !== 'string' || q.text.trim().length < 5) {
    errors.push(`${label}: question text is missing or too short`);
    return { errors, warnings };
  }
  q.text = q.text.trim();

  const requestedType = requested.type;
  const requestedDifficulty = requested.difficulty;
  const requestedMarks = requested.marks;
  const requestedIsMixed = canonicalDifficulty(requestedDifficulty) === MIXED_DIFFICULTY;

  // ---- TYPE: must be the requested type ----
  const actualType = canonicalType(q.type);
  let typeMatches = false;
  if (!actualType) {
    errors.push(
      `${label}: type "${shown(q.type)}" is not a valid question type (requested "${requestedType}")`,
    );
  } else if (actualType !== requestedType) {
    errors.push(
      `${label}: type mismatch - requested "${requestedType}" but AI returned "${shown(q.type)}"`,
    );
  } else {
    typeMatches = true;
    q.type = requestedType;
  }

  const actualDifficulty = canonicalDifficulty(q.difficulty);
  if (requestedIsMixed) {
    if (VALID_DIFFICULTIES.includes(actualDifficulty)) {
      q.difficulty = actualDifficulty;
    } else {
      errors.push(
        `${label}: difficulty "${shown(q.difficulty)}" is not Easy/Medium/Hard (requested "Mixed")`,
      );
    }
  } else {
    const finalDifficulty = requestedDifficulty;
    if (!actualDifficulty) {
      warnings.push(
        `${label}: difficulty "${shown(q.difficulty)}" is not valid - normalized to "${finalDifficulty}"`,
      );
    } else if (actualDifficulty !== requestedDifficulty) {
      warnings.push(
        `${label}: difficulty mismatch - requested "${requestedDifficulty}" but AI returned "${shown(q.difficulty)}" - normalized to "${finalDifficulty}"`,
      );
    }
    q.difficulty = finalDifficulty;
  }

  const numMarks = parseInt(q.marks, 10);
  if (isNaN(numMarks)) {
    errors.push(
      `${label}: marks "${shown(q.marks)}" is not a number (requested ${requestedMarks})`,
    );
  } else if (numMarks !== requestedMarks) {
    errors.push(
      `${label}: marks mismatch - requested ${requestedMarks} but AI returned ${numMarks}`,
    );
  } else {
    q.marks = requestedMarks;
  }

  // ---- Normalise content fields ----
  q.options = Array.isArray(q.options)
    ? q.options
        .map((o) => (o === null || o === undefined ? '' : String(o).trim()))
        .filter((o) => o.length > 0)
    : [];
  q.answer = typeof q.answer === 'string' ? q.answer.trim() : '';
  q.topic = typeof q.topic === 'string' ? q.topic.trim() : '';

  if (typeMatches && q.type === 'MCQ') {
    if (q.text.includes('______')) {
      errors.push(
        `${label}: looks like a Fill in the Blanks question mislabelled as MCQ (contains "______")`,
      );
    }
    if (
      /^(explain|describe|discuss|elaborate|outline|write)\b.*\b(in detail|in brief|briefly|in your own words|with (an? )?suitable example|with examples)\s*[?.!]*$/i.test(
        q.text,
      )
    ) {
      errors.push(`${label}: looks like a descriptive/short-answer question mislabelled as MCQ`);
    }
    if (q.options.length !== 4) {
      errors.push(`${label}: MCQ must have exactly 4 options (AI returned ${q.options.length})`);
    }
    if (!q.answer) {
      errors.push(`${label}: MCQ is missing its correct answer`);
    } else {
      const resolved = resolveMcqAnswer(q.answer, q.options);
      if (!resolved) {
        errors.push(`${label}: correct answer "${q.answer}" does not match any of the 4 options`);
      } else {
        if (resolved !== q.answer) {
          warnings.push(`${label}: correct answer mapped to matching option "${resolved}"`);
        }
        q.answer = resolved;
      }
    }
  } else if (typeMatches && q.type === 'True/False') {
    q.options = ['True', 'False'];
    const resolved = resolveTrueFalse(q.answer);
    if (!resolved) {
      errors.push(
        `${label}: True/False answer must be "True" or "False" (AI returned "${shown(q.answer)}")`,
      );
    } else {
      if (resolved !== q.answer) {
        warnings.push(`${label}: correct answer normalized to "${resolved}"`);
      }
      q.answer = resolved;
    }
  }

  // ---- MATHEMATICS RULE: numerical / sum-based only ----
  if (isMathematics && errors.length === 0) {
    if (looksLikeTheoryOnly(q.text)) {
      errors.push(
        `${label}: mathematics questions must be NUMERICAL / SUM-BASED requiring calculation, not theory-only ("${q.text.substring(0, 60)}..."). Do not ask only to define/describe/explain/state.`,
      );
    } else if (!hasNumericalContent(q.text)) {
      errors.push(
        `${label}: mathematics questions must include numerical values, equations, expressions, matrices, or data to compute with`,
      );
    } else if (
      (q.type === 'Short Answer' || q.type === 'Long Answer') &&
      q.answer &&
      !hasNumericalContent(q.answer)
    ) {
      errors.push(
        `${label}: mathematics answer must contain the step-by-step numerical solution, not just theory text`,
      );
    } else if ((q.type === 'Short Answer' || q.type === 'Long Answer') && q.answer) {
      const formatErrors = validateMathAnswerFormat(q.answer, requestedMarks);
      if (formatErrors.length > 0) {
        errors.push(`${label}: mathematics answer format invalid - ${formatErrors[0]}`);
      }
    } else if (q.type === 'MCQ' && q.options.length === 4) {
      const numericOptions = q.options.filter((o) => hasNumericalContent(o)).length;
      if (numericOptions < 3) {
        errors.push(
          `${label}: mathematics MCQ options must be numerical computed values/expressions (got ${numericOptions}/4 numerical)`,
        );
      }
    } else if (q.type === 'Fill in the Blanks' && q.answer) {
      if (!hasNumericalContent(q.answer) && !hasNumericalContent(q.text)) {
        errors.push(
          `${label}: mathematics Fill in the Blanks must be a numerical problem with a computed value`,
        );
      }
    }
  }

  return { errors, warnings };
}

function removeDuplicates(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    const normalized = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

async function callOpenAICompatible(apiKey, apiUrl, model, prompt, temperature = 0.7) {
  const url = apiUrl || 'https://api.openai.com/v1/chat/completions';
  const models = [model, ...FREE_MODELS.filter((m) => m !== model)];

  for (let i = 0; i < models.length; i++) {
    const currentModel = models[i];
    console.log(`[AI] Trying model: ${currentModel}`);

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: currentModel,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert academic question writer. Always respond with valid JSON only, no markdown formatting, no code fences, no extra text. ' +
                'You must repeat the requested question type, difficulty and marks exactly as given - never change them, never substitute a default value.',
            },
            { role: 'user', content: prompt },
          ],
          temperature,
          max_tokens: 4096,
        }),
        signal: AbortSignal.timeout(120000),
      });
    } catch (fetchError) {
      console.log(`[AI] Model ${currentModel} fetch failed: ${fetchError.message}`);
      if (i === models.length - 1) {
        if (fetchError.name === 'TimeoutError' || fetchError.name === 'AbortError') {
          throw new Error(
            'AI API Error (timeout): The request to the AI service timed out. Please try again.',
          );
        }
        throw new Error(`AI API Error (network): ${fetchError.message}`);
      }
      continue;
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.log(
        `[AI] Model ${currentModel} returned ${response.status}: ${errorBody.substring(0, 200)}`,
      );
      if (i === models.length - 1) {
        let detail = '';
        try {
          const parsed = JSON.parse(errorBody);
          detail = parsed.error?.message || parsed.message || errorBody.substring(0, 200);
        } catch {
          detail = errorBody.substring(0, 200) || response.statusText;
        }
        throw new Error(`AI API Error (${response.status}): ${detail}`);
      }
      continue;
    }

    let data;
    try {
      data = await response.json();
    } catch (bodyError) {
      console.log(`[AI] Model ${currentModel} body read failed: ${bodyError.message}`);
      if (i === models.length - 1) {
        if (bodyError.name === 'TimeoutError' || bodyError.name === 'AbortError') {
          throw new Error(
            'AI API Error (timeout): The request to the AI service timed out. Please try again.',
          );
        }
        throw new Error(`AI API Error (invalid response body): ${bodyError.message}`);
      }
      continue;
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      if (i === models.length - 1) {
        throw new Error('AI returned an empty response');
      }
      continue;
    }

    console.log(`[AI] Model ${currentModel} succeeded`);
    return content;
  }

  throw new Error('AI service is temporarily unavailable. Please try again.');
}

async function callAnthropic(apiKey, apiUrl, model, prompt, temperature = 0.7) {
  const url = apiUrl || 'https://api.anthropic.com/v1/messages';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model || 'claude-3-haiku-20240307',
      max_tokens: 4096,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`AI API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;

  if (!content) {
    throw new Error('AI returned an empty response');
  }

  return content;
}

async function callOllama(apiUrl, model, prompt, temperature = 0.7) {
  const url = apiUrl || 'http://localhost:11434/api/generate';

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: model || 'llama3',
      prompt: prompt,
      stream: false,
      options: { temperature },
    }),
    signal: AbortSignal.timeout(180000),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    throw new Error(`Ollama API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  return data.response || '';
}

function parseAIResponse(rawContent) {
  let cleaned = rawContent.trim();

  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  const jsonMatch = cleaned.match(/\{[\s\S]*"questions"[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  // Fast path: already valid JSON.
  try {
    const parsed = JSON.parse(cleaned);
    assertQuestionsArray(parsed);
    return parsed.questions;
  } catch (firstError) {
    const repaired = escapeControlCharsInsideStrings(cleaned)
      .replace(/}\s*{/g, '},{')
      .replace(/]\s*\[/g, '],[');
    if (repaired !== cleaned) {
      try {
        const parsed = JSON.parse(repaired);
        assertQuestionsArray(parsed);
        console.log('[AI] Response needed a JSON repair pass before parsing');
        return parsed.questions;
      } catch {}
    }
    throw firstError;
  }
}

function assertQuestionsArray(parsed) {
  if (!parsed || !Array.isArray(parsed.questions)) {
    const error = new Error("AI response does not contain a 'questions' array");
    error.aiOutputError = true;
    throw error;
  }
}

function escapeControlCharsInsideStrings(input) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of input) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) {
        out += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

async function invokeProvider(provider, { apiKey, apiUrl, model, prompt, temperature }) {
  switch (provider) {
    case 'openrouter':
      return callOpenAICompatible(apiKey, apiUrl, model || 'openrouter/free', prompt, temperature);
    case 'anthropic':
      return callAnthropic(apiKey, apiUrl, model, prompt, temperature);
    case 'ollama':
      return callOllama(apiUrl, model || 'llama3', prompt, temperature);
    case 'openai':
    default:
      return callOpenAICompatible(apiKey, apiUrl, model, prompt, temperature);
  }
}

async function generateQuestions(config) {
  const { subject, syllabusContent, topics, topic, count, difficulty, type, marks, instructions } =
    config;

  const requestedCount = parseInt(count, 10);
  const requestedMarks = parseInt(marks, 10);

  if (!VALID_TYPES.includes(type)) {
    throw badRequestError(`Invalid requested question type: "${shown(type)}"`);
  }
  if (!REQUEST_DIFFICULTIES.includes(difficulty)) {
    throw badRequestError(`Invalid requested difficulty: "${shown(difficulty)}"`);
  }
  if (isNaN(requestedMarks) || requestedMarks < 1) {
    throw badRequestError(`Invalid requested marks per question: "${shown(marks)}"`);
  }
  if (isNaN(requestedCount) || requestedCount < 1) {
    throw badRequestError(`Invalid requested number of questions: "${shown(count)}"`);
  }

  const requested = {
    type,
    difficulty,
    marks: requestedMarks,
    count: requestedCount,
    isMathematics: isMathematicsSubject(subject),
  };

  const topicPlan = topic ? null : buildTopicPlan(topics, requestedCount);

  const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
  let apiKey = process.env.AI_API_KEY || '';
  let apiUrl = process.env.AI_API_URL || '';
  const model = process.env.AI_MODEL || '';

  if (provider === 'openrouter') {
    apiKey = process.env.OPENROUTER_API_KEY || apiKey;
    apiUrl = apiUrl || 'https://openrouter.ai/api/v1/chat/completions';
  }

  if (!apiKey && provider !== 'ollama') {
    throw new Error(
      'AI service is not configured. Please set the API key in the backend .env file. ' +
        'Supported providers: openrouter, openai, anthropic, ollama.',
    );
  }

  const placeholderKeySha256 =
    'f1cb29c37e3ecc088187a42d6c8fba0cd0be08523b213bd4098b9a69be50a1c3';
  const apiKeySha256 = crypto
    .createHash('sha256')
    .update(apiKey.trim())
    .digest('hex');

  if (provider === 'openrouter' && apiKeySha256 === placeholderKeySha256) {
    throw new Error(
      'OPENROUTER_API_KEY in backend .env is still a placeholder. ' +
        'Get a real key at https://openrouter.ai/settings/keys ' +
        'and set OPENROUTER_API_KEY=sk-or-... in backend/.env',
    );
  }

  const prompt = buildPrompt({
    subject,
    syllabusContent,
    topics,
    topic,
    topicPlan,
    count: requestedCount,
    difficulty,
    type,
    marks: requestedMarks,
    instructions,
  });

  console.log(
    `[AI] Generating ${requestedCount} ${type} questions (${difficulty}, ${requestedMarks} marks) via ${provider}`,
  );

  const MAX_ATTEMPTS = 2;

  const slots = new Array(requestedCount).fill(null);
  const usedTexts = new Set();
  const collectedWarnings = [];
  let lastValidationErrors = [];
  let lastFatalError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const temperature = attempt === 1 ? 0.7 : 0.2;
    let attemptPrompt = prompt;
    if (attempt > 1 && lastValidationErrors.length > 0) {
      const correction = lastValidationErrors.slice(0, 6).join('\n');
      attemptPrompt =
        `${prompt}\n\nCORRECTION REQUIRED - YOUR PREVIOUS RESPONSE WAS REJECTED:\n` +
        `${correction}\n` +
        `You MUST return ONLY "${type}" questions (difficulty "${difficulty}", marks ${requestedMarks}). ` +
        `Do NOT return "Short Answer", "Long Answer", "True/False" or "Fill in the Blanks" when "${type}" was requested. ` +
        (requested.isMathematics
          ? `IMPORTANT MATHEMATICS RULE: every question MUST be NUMERICAL / SUM-BASED with numbers/equations to calculate and a step-by-step solution - NEVER theory-only define/describe/explain/state questions. For Short/Long Answer the "answer" MUST use separate lines with "Step 1:", "Step 2:", "Step 3:", formulas on separate lines, ending with "Final Answer:" and \\boxed{result} - NEVER a single-paragraph/single-line answer. `
          : ``) +
        `Fix every rejected question and return the full set of ${requestedCount} valid questions.`;
    }

    let parsed;
    try {
      const rawContent = await invokeProvider(provider, {
        apiKey,
        apiUrl,
        model,
        prompt: attemptPrompt,
        temperature,
      });
      console.log(
        `[AI] Response received (${rawContent.length} chars) [attempt ${attempt}/${MAX_ATTEMPTS}]`,
      );
      parsed = parseAIResponse(rawContent);
    } catch (error) {
      lastFatalError = error;
      console.log(`[AI] Attempt ${attempt}/${MAX_ATTEMPTS} failed: ${error.message}`);
      continue;
    }
    const candidates = removeDuplicates(
      parsed.filter((q) => q && typeof q.text === 'string' && q.text.trim().length >= 5),
    ).slice(0, requestedCount);

    const failures = [];
    candidates.forEach((q, i) => {
      if (slots[i]) return;

      const normalizedText = q.text.toLowerCase().replace(/\s+/g, ' ').trim();
      if (usedTexts.has(normalizedText)) return;

      const result = validateQuestion(q, i, requested);
      if (result.errors.length > 0) {
        failures.push(...result.errors);
        return;
      }
      collectedWarnings.push(...result.warnings);

      if (topicPlan) {
        const expected = topicPlan[i];
        const actual = typeof q.topic === 'string' ? q.topic.trim() : '';
        if (!actual) {
          q.topic = expected;
          collectedWarnings.push(
            `Question ${i + 1}: topic missing - assigned syllabus topic "${expected}"`,
          );
        } else if (normalizeKey(actual) !== normalizeKey(expected)) {
          failures.push(
            `Question ${i + 1}: topic mismatch - assigned "${expected}" but AI returned "${actual}"`,
          );
          return;
        } else {
          q.topic = expected;
        }
      }

      slots[i] = q;
      usedTexts.add(normalizedText);
    });

    lastValidationErrors = failures;
    if (failures.length > 0) {
      console.log(`[AI] Attempt ${attempt}/${MAX_ATTEMPTS} dropped invalid question(s):`, failures);
    }
    if (slots.every(Boolean)) break;
    console.log(
      `[AI] Attempt ${attempt}/${MAX_ATTEMPTS}: ${slots.filter(Boolean).length}/${requestedCount} slots filled - retrying`,
    );
  }

  const filled = slots.filter(Boolean);

  if (filled.length === 0) {
    if (lastValidationErrors.length > 0) {
      const details = lastValidationErrors.join(' | ');
      console.log(`[AI] Rejecting AI response - ${details}`);
      throw badRequestError(
        `AI validation error: the generated questions do not match the requested configuration ` +
          `(type "${type}", difficulty "${difficulty}", marks ${requestedMarks}). ${details}`,
      );
    }
    if (lastFatalError) {
      if (lastFatalError instanceof SyntaxError || lastFatalError.aiOutputError) {
        console.log(`[AI] Rejecting malformed AI response: ${lastFatalError.message}`);
        throw badRequestError(
          `AI returned an invalid response (${lastFatalError.message}). Please try again.`,
        );
      }
      throw lastFatalError;
    }
    throw badRequestError(
      'AI returned no valid questions. Please try again with different settings.',
    );
  }

  const answers = filled.filter((q) => canonicalType(q.type) === type);
  const rejectedByType = filled.length - answers.length;
  if (rejectedByType > 0) {
    console.log(`[AI] Safety net removed ${rejectedByType} question(s) with the wrong type`);
  }
  if (answers.length === 0) {
    throw badRequestError(
      `AI validation error: no generated question matched the requested type "${type}". Please try again.`,
    );
  }

  const warningsOut = [...collectedWarnings];
  const droppedCount = requestedCount - answers.length;
  if (droppedCount > 0) {
    warningsOut.push(
      `Returned ${answers.length} of ${requestedCount} requested questions: ${droppedCount} AI-generated ` +
        `question(s) were dropped because they did not match the requested configuration ` +
        `(type "${type}", difficulty "${difficulty}", marks ${requestedMarks}).`,
    );
  }

  if (warningsOut.length > 0) {
    console.log(`[AI] Validation warnings:`, warningsOut);
  }

  console.log(`[AI] Returning ${answers.length} validated questions`);

  return {
    questions: answers.map((q) => ({
      text: q.text,

      type: q.type,
      // The requested difficulty is the source of truth. Never trust the AI
      // value directly and never fall back to "Medium": for a concrete
      // request (Easy/Medium/Hard) always emit the requested difficulty;
      // for "Mixed" keep the validated per-question difficulty.
      difficulty: requested.difficulty === MIXED_DIFFICULTY ? q.difficulty : requested.difficulty,
      options: q.options || [],
      answer: q.answer || '',
      correctAnswer: q.answer || '',
      marks: q.marks,
      topic: q.topic || topic || '',
      source: 'AI Generated',
    })),
    warnings: warningsOut.length > 0 ? warningsOut : undefined,
  };
}

module.exports = {
  generateQuestions,
  isMathematicsSubject,
  hasNumericalContent,
  hasCalculationIntent,
  hasConcreteComputation,
  looksLikeTheoryOnly,
  validateMathAnswerFormat,
  validateQuestion,
  buildPrompt,
};
