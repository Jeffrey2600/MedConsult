/**
 * AI symptom checker.
 *
 * The property that matters most here is that the red-flag layer sets a FLOOR
 * on urgency which the language model cannot lower. Those checks run against
 * the pure functions, so they hold regardless of whether a Gemini key is
 * configured or what the model happens to reply on the day.
 */
import { connectDB, disconnectDB } from '../src/config/db.js';
import { SymptomCheck, User } from '../src/models/index.js';
import { checkRedFlags, maxUrgency, rankOf } from '../src/services/redFlags.js';
import { ruleBasedCheck, KNOWN_SPECIALTIES } from '../src/services/ruleChecker.js';
import { normaliseGeminiResult, geminiAvailable } from '../src/services/gemini.service.js';
import { DISCLAIMER } from '../src/controllers/symptom.controller.js';

const BASE = 'http://127.0.0.1:5000/api';

await connectDB();

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
const loginAs = async (email, password = 'Password@123') =>
  (await call('/auth/login', { method: 'POST', body: { email, password } })).json.token;

const patientToken = await loginAs('karthik@example.com');
const otherPatientToken = await loginAs('fathima@example.com');
const doctorToken = await loginAs('meera.nair@medconsult.local');
const patient = await User.findOne({ email: 'karthik@example.com' }).lean();

// =========================================================================
// Red-flag detection
// =========================================================================
const EMERGENCIES = [
  ['crushing chest pain radiating to my left arm', 'cardiac'],
  ['I have chest tightness and it is spreading to my jaw', 'cardiac'],
  ['I cannot breathe properly and my lips are turning blue', 'breathing'],
  ['my face is drooping and my speech is slurred', 'stroke'],
  ['sudden weakness on one side of my body', 'stroke'],
  ['this is the worst headache of my life', 'stroke'],
  ['my throat is swelling and I cannot swallow', 'anaphylaxis'],
  ['I am bleeding heavily and it will not stop', 'bleeding'],
  ['I coughed up blood this morning', 'bleeding'],
  ['my father is unconscious and will not wake up', 'consciousness'],
  ['she had a seizure ten minutes ago', 'consciousness'],
  ['I have been thinking about ending my life', 'self_harm'],
  ['I took too many pills', 'poisoning'],
  ['high fever with a stiff neck since last night', 'meningitis'],
  ['I am pregnant and have heavy bleeding', 'obstetric'],
];

for (const [text, expectedCode] of EMERGENCIES) {
  const { triggered, flags } = checkRedFlags(text);
  check(`red flag: "${text.slice(0, 42)}…"`,
    triggered && flags.some((f) => f.code === expectedCode),
    triggered ? flags.map((f) => f.code).join(',') : 'NOT TRIGGERED');
}

const BENIGN = [
  'I have a mild runny nose and a slight cough for two days',
  'itchy red rash on my forearm after using a new detergent',
  'my knee aches after playing football at the weekend',
  'trouble sleeping and feeling stressed about exams',
];
for (const text of BENIGN) {
  check(`no false alarm: "${text.slice(0, 42)}…"`, checkRedFlags(text).triggered === false);
}

/**
 * Self-harm gets its own battery. A miss here is the worst failure this
 * feature can have, and natural phrasing varies far more than the other
 * categories — people rarely write "suicidal ideation".
 */
const SELF_HARM_PHRASINGS = [
  'I have been thinking about ending my life',
  'I want to end it all',
  'sometimes I think about killing myself',
  'I feel like I want to die',
  "I don't want to live anymore",
  'everyone would be better off dead without me',
  'there is no point in living',
  'I have been cutting myself again',
  'I am having thoughts of self harm',
  'I took an overdose last night',
  "I don't want to wake up tomorrow",
  'I keep thinking about taking my own life',
];
for (const phrase of SELF_HARM_PHRASINGS) {
  const { triggered, flags } = checkRedFlags(phrase);
  const codes = flags.map((f) => f.code);
  check(`self-harm phrasing: "${phrase.slice(0, 44)}…"`,
    triggered && (codes.includes('self_harm') || codes.includes('poisoning')),
    triggered ? codes.join(',') : 'NOT TRIGGERED');
}

// An overdose alone is classed as poisoning, because "call an ambulance and
// keep the packet" is the correct action whether it was intentional or an
// elderly relative double-dosing. When intent is expressed too, both fire —
// so the helpline is shown as well as the medical instruction.
const intentional = checkRedFlags('I took an overdose because I wanted to die');
const intentionalCodes = intentional.flags.map((f) => f.code);
check('an overdose with stated intent triggers both poisoning and self-harm',
  intentionalCodes.includes('poisoning') && intentionalCodes.includes('self_harm'),
  intentionalCodes.join(','));
check('so the helpline is offered alongside the medical instruction',
  intentional.flags.some((f) => /14416|1800|helpline/i.test(f.advice)) &&
  intentional.flags.some((f) => /ambulance/i.test(f.advice)));

// Words that merely sound alarming must not fire it.
const NOT_SELF_HARM = [
  'my phone battery died this morning and I missed my alarm',
  'I have a dead tooth that needs treatment',
  'my hand went numb after I cut myself shaving, just a small nick',
];
check('ordinary uses of "died" do not trigger a self-harm flag',
  checkRedFlags(NOT_SELF_HARM[0]).flags.every((f) => f.code !== 'self_harm'));
check('a dead tooth does not trigger it',
  checkRedFlags(NOT_SELF_HARM[1]).flags.every((f) => f.code !== 'self_harm'));

const multi = checkRedFlags('severe chest pain and I cannot breathe');
check('several red flags are all reported, not just the first',
  multi.flags.length >= 2, multi.flags.map((f) => f.code).join(','));

check('every red flag carries an instruction',
  checkRedFlags('crushing chest pain').flags.every((f) => f.advice?.length > 20));
check('the self-harm response offers a helpline, not just "call an ambulance"',
  /helpline|14416|1800/.test(checkRedFlags('I want to kill myself').flags[0].advice));
check('empty input triggers nothing', checkRedFlags('').triggered === false);

// =========================================================================
// The urgency floor — the core safety property
// =========================================================================
check('urgency ordering is self_care < routine < urgent < emergency',
  rankOf('self_care') < rankOf('routine') &&
  rankOf('routine') < rankOf('urgent') &&
  rankOf('urgent') < rankOf('emergency'));

check('a model saying "self_care" cannot lower an emergency floor',
  maxUrgency('self_care', 'emergency') === 'emergency');
check('a model saying "routine" cannot lower an emergency floor',
  maxUrgency('routine', 'emergency') === 'emergency');
check('a model CAN raise urgency above the floor',
  maxUrgency('emergency', 'self_care') === 'emergency');
check('with no red flags the model\'s own answer stands',
  maxUrgency('routine', 'self_care') === 'routine');
check('an unrecognised urgency value degrades to routine, not to nothing',
  maxUrgency('nonsense', 'self_care') === 'routine');

// =========================================================================
// Rule engine fallback
// =========================================================================
const ROUTING = [
  ['itchy red rash spreading on my arm', 'Dermatology'],
  ['my knee joint hurts when I climb stairs', 'Orthopaedics'],
  ['I feel anxious and cannot sleep at night', 'Psychiatry'],
  ['sore throat and blocked nose for a week', 'ENT'],
  ['my child has a fever and is not eating', 'Pediatrics'],
  ['my periods have been irregular for months', 'Gynaecology'],
  ['fever, body ache and tiredness for three days', 'General Physician'],
];
for (const [text, expected] of ROUTING) {
  const result = ruleBasedCheck(text);
  check(`routing: "${text.slice(0, 38)}…" → ${expected}`,
    result.suggestedSpecialty === expected, result.suggestedSpecialty);
}

const unknown = ruleBasedCheck('qwerty zxcvbn asdfgh');
check('unrecognised text falls back to a general physician',
  unknown.suggestedSpecialty === 'General Physician');
check('and says plainly that nothing was recognised',
  /did not match/i.test(unknown.advice));

check('the rule engine only ever names a known specialty',
  ROUTING.every(([text]) => KNOWN_SPECIALTIES.includes(ruleBasedCheck(text).suggestedSpecialty)));

const severe = ruleBasedCheck('severe unbearable knee pain');
const mild = ruleBasedCheck('slight knee pain');
check('wording like "severe" raises the urgency', rankOf(severe.urgency) > rankOf(mild.urgency),
  `${mild.urgency} -> ${severe.urgency}`);

// =========================================================================
// Guarding against a surprising model reply
// =========================================================================
const rogue = normaliseGeminiResult({
  suggestedSpecialty: 'Wizardry',
  urgency: 'catastrophic',
  possibleConditions: 'not an array',
  advice: 12345,
  redFlags: [1, 2, 'real flag'],
});
check('an unknown specialty is replaced with a safe default',
  rogue.suggestedSpecialty === 'General Physician', rogue.suggestedSpecialty);
check('an invalid urgency is replaced, not stored', rogue.urgency === 'routine');
check('a non-array conditions field becomes an empty list',
  Array.isArray(rogue.possibleConditions) && rogue.possibleConditions.length === 0);
check('non-string advice does not reach the database', rogue.advice === '');
check('non-string red flags are dropped', rogue.redFlags.length === 1 && rogue.redFlags[0] === 'real flag');

// Cap raised from 1500 to 2500 when the prompt started asking for fuller,
// more useful advice (~80-140 words plus explained conditions) — an
// untruncated real reply is comfortably under this, so it only bites a
// genuinely malformed/runaway response.
const ADVICE_CAP = 2500;
const longAdvice = normaliseGeminiResult({
  suggestedSpecialty: 'Cardiology', urgency: 'urgent', advice: 'x'.repeat(5000),
});
check('an excessively long reply is truncated', longAdvice.advice.length === ADVICE_CAP,
  `${longAdvice.advice.length}`);

const longCondition = normaliseGeminiResult({
  suggestedSpecialty: 'Cardiology', urgency: 'urgent', advice: 'fine',
  possibleConditions: ['y'.repeat(1000)],
});
check('an excessively long condition entry is also truncated',
  longCondition.possibleConditions[0].length === 300,
  `${longCondition.possibleConditions[0].length}`);

// =========================================================================
// The endpoint
// =========================================================================
const noAuth = await call('/symptoms/check', { method: 'POST', body: { text: 'I have a headache today' } });
check('the checker requires authentication', noAuth.status === 401);

const asDoctor = await call('/symptoms/check', {
  method: 'POST', token: doctorToken, body: { text: 'I have a headache today' },
});
check('a doctor has no symptom checker', asDoctor.status === 403);

const tooShort = await call('/symptoms/check', {
  method: 'POST', token: patientToken, body: { text: 'sick' },
});
check('a one-word description is rejected with guidance', tooShort.status === 400,
  tooShort.json?.details?.text);

console.log(`\n[info] Gemini configured: ${geminiAvailable()}`);

const routine = await call('/symptoms/check', {
  method: 'POST', token: patientToken,
  body: { text: 'I have an itchy red rash on both forearms after using a new detergent', durationDays: 5 },
});
check('a routine description is assessed', routine.status === 201, routine.json?.message);
check('a specialty is suggested', !!routine.json.result.suggestedSpecialty,
  routine.json.result.suggestedSpecialty);
check('the specialty resolves to a real one for deep-linking',
  !!routine.json.result.specialtyId);
check('it is not flagged as an emergency', routine.json.result.isEmergency === false,
  routine.json.result.urgency);
check('a disclaimer is always attached', routine.json.result.disclaimer === DISCLAIMER);
check('the answering layer is named', !!routine.json.result.source, routine.json.result.source);

// The whole point of the design.
const emergency = await call('/symptoms/check', {
  method: 'POST', token: patientToken,
  body: { text: 'I have severe crushing chest pain radiating to my left arm and I feel breathless' },
});
check('a red-flag description is returned as an emergency',
  emergency.json.result.urgency === 'emergency', emergency.json.result.urgency);
check('and flagged for the UI', emergency.json.result.isEmergency === true);
check('with the specific warning named',
  emergency.json.result.redFlags.some((f) => /heart attack/i.test(f)),
  emergency.json.result.redFlags.join(' | '));
check('and verbatim instructions, separate from any model prose',
  emergency.json.result.redFlagActions.length > 0 &&
  /ambulance/i.test(emergency.json.result.redFlagActions[0].advice));

const selfHarm = await call('/symptoms/check', {
  method: 'POST', token: patientToken,
  body: { text: 'I have been feeling hopeless and thinking about ending my life' },
});
check('a self-harm disclosure is treated as an emergency',
  selfHarm.json.result.urgency === 'emergency');
check('and offers a helpline number',
  selfHarm.json.result.redFlagActions.some((f) => /14416|1800|helpline/i.test(f.advice)));

// Persistence and privacy
const stored = await SymptomCheck.findById(routine.json.result.id).lean();
check('the check is stored for the patient\'s history', !!stored);
check('with the original text', stored.inputText.includes('itchy red rash'));
check('and the layer that answered', ['gemini', 'rules', 'red_flag_rules'].includes(stored.source));

const history = await call('/symptoms', { token: patientToken });
check('a patient can list their own checks', history.json.checks.length >= 3,
  `${history.json.checks.length}`);
check('the history contains only their own',
  history.json.checks.every((c) => String(c.patient) === String(patient._id)));

const otherRead = await call(`/symptoms/${routine.json.result.id}`, { token: otherPatientToken });
check('another patient cannot read someone else\'s check', otherRead.status === 403);

const ownRead = await call(`/symptoms/${routine.json.result.id}`, { token: patientToken });
check('the owner can read their own check', ownRead.status === 200);

// Language handling
const tamil = await call('/symptoms/check', {
  method: 'POST', token: patientToken,
  body: { text: 'எனக்கு நான்கு நாட்களாக காய்ச்சலும் இருமலும் உள்ளது', language: 'ta' },
});
check('a non-English description is accepted', tamil.status === 201);
check('and is warned that emergency keyword coverage is weaker',
  tamil.json.result.languageCoverageWarning === true);

const english = await call('/symptoms/check', {
  method: 'POST', token: patientToken,
  body: { text: 'I have had a fever and cough for four days', language: 'en' },
});
check('English carries no coverage warning',
  english.json.result.languageCoverageWarning === false);

// Fallback transparency
if (!geminiAvailable()) {
  check('with no API key the rule engine answers', routine.json.result.source === 'rules');
  check('and the response says so plainly', routine.json.result.usedFallback === true);
  check('with the reason recorded', /no gemini api key/i.test(routine.json.result.fallbackReason ?? ''),
    routine.json.result.fallbackReason);
}

await SymptomCheck.deleteMany({ patient: patient._id });

await disconnectDB();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
