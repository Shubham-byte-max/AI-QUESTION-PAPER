const m = require('./services/aiService.js');
// Valid 5-mark math answer (Step 1/2/3 on separate lines + Final Answer + \boxed{}) must pass
const good = m.validateQuestion({text:'Calculate and simplify (3 + 4i)(1 - 2i).',type:'Short Answer',difficulty:'Medium',marks:5,answer:'Step 1: Expand the product\n(3 + 4i)(1 - 2i) = 3 - 6i + 4i - 8i^2\nStep 2: Use i^2 = -1\n= 3 - 2i + 8\nStep 3: Combine like terms\n= 11 - 2i\nFinal Answer: 11 - 2i\n\\boxed{11 - 2i}',options:[],topic:'Imaginary Numbers'},0,{type:'Short Answer',difficulty:'Medium',marks:5,count:1,isMathematics:true});
console.log('valid stepped answer errors (expect []):', good.errors);
// Single-line math answer must be rejected by the format rules
const bad = m.validateQuestion({text:'Calculate 12 * 15.',type:'Short Answer',difficulty:'Easy',marks:5,answer:'The answer is 180.',options:[],topic:'Arithmetic'},1,{type:'Short Answer',difficulty:'Easy',marks:5,count:1,isMathematics:true});
console.log('single-line answer errors (expect format errors):', bad.errors);
// Math prompt must include the format rule (physics must not - see check-nonmath.js)
const p = m.buildPrompt({subject:{name:'Mathematics',code:'MTH'},topics:[],topic:'',topicPlan:null,count:1,difficulty:'Medium',type:'Short Answer',marks:5,instructions:''});
console.log('math prompt has format rule (expect true):', p.includes('MATHEMATICS ANSWER FORMAT RULE'));