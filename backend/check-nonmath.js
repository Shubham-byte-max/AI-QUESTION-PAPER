const m = require('./services/aiService.js');
// Non-math must not require Step/boxed format
const r = m.validateQuestion({text:'Explain photosynthesis.',type:'Short Answer',difficulty:'Medium',marks:5,answer:'Plants convert light...',options:[],topic:'Bio'},0,{type:'Short Answer',difficulty:'Medium',marks:5,count:1,isMathematics:false});
console.log('non-math errors (expect []):', r.errors);
// Math MCQ must not require stepped answer (answer is option)
const r2 = m.validateQuestion({text:'What is (3 + 2) x 4?',type:'MCQ',difficulty:'Easy',marks:1,answer:'20',options:['18','20','22','24'],topic:'Arithmetic'},0,{type:'MCQ',difficulty:'Easy',marks:1,count:1,isMathematics:true});
console.log('math MCQ errors (expect []):', r2.errors);
// Physics prompt must not contain format rule
const p = m.buildPrompt({subject:{name:'Physics',code:'PHY'},topics:[],topic:'',topicPlan:null,count:1,difficulty:'Medium',type:'Short Answer',marks:5,instructions:''});
console.log('physics has format rule (expect false):', p.includes('MATHEMATICS ANSWER FORMAT RULE'));
