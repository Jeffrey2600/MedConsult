/**
 * Verifies the Gemini symptom-checker integration is really being used.
 *
 *   npm run gemini:test
 *
 * Sends one real request through the same code path the app uses
 * (services/gemini.service.js), and proves it is genuinely Gemini answering
 * — not the keyword fallback — by checking the response varies with input in
 * a way a fixed keyword list cannot.
 */
import { env, features } from '../src/config/env.js';
import { geminiCheck, geminiAvailable } from '../src/services/gemini.service.js';
import { checkRedFlags, maxUrgency } from '../src/services/redFlags.js';

const line = '-'.repeat(70);
console.log(`\n${line}\n  Gemini symptom checker — delivery check\n${line}`);
console.log(`  Model      ${env.gemini.model}`);
console.log(`  API key    ${env.gemini.apiKey ? `set, ${env.gemini.apiKey.length} characters` : '(not set)'}`);
console.log(`  Timeout    ${env.gemini.timeoutMs}ms`);
console.log(`  Available  ${geminiAvailable()}`);
console.log(line);

if (!features.gemini) {
  console.log('\nFAILED  No Gemini API key is configured.');
  console.log('        Set GEMINI_API_KEY in server/.env, then restart the API.\n');
  process.exit(1);
}

// Two clearly different, unambiguous cases. A fixed keyword engine routes
// both to "General Physician" (its generic fallback) or by crude keyword
// hits; a real model should tell them apart correctly and explain why.
const CASES = [
  {
    label: 'Dermatology case',
    text: 'I have had an itchy red rash with small blisters on both forearms for five days, since I started using a new laundry detergent. No fever.',
    expectSpecialty: 'Dermatology',
  },
  {
    label: 'Cardiology case',
    text: 'For the last two weeks I get chest tightness and unusual breathlessness whenever I climb stairs, which goes away after resting for a few minutes.',
    expectSpecialty: 'Cardiology',
  },
];

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -- ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const results = [];

for (const { label, text, expectSpecialty } of CASES) {
  process.stdout.write(`\nSending "${label}"... `);
  const started = Date.now();
  try {
    const result = await geminiCheck({
      text, ageYears: 30, gender: 'other', durationDays: 5, language: 'en',
    });
    const ms = Date.now() - started;
    console.log(`OK (${ms}ms)`);

    console.log(`  specialty : ${result.suggestedSpecialty}`);
    console.log(`  urgency   : ${result.urgency}`);
    console.log(`  advice    : ${result.advice.slice(0, 140)}${result.advice.length > 140 ? '…' : ''}`);
    if (result.possibleConditions?.length) {
      console.log(`  conditions: ${result.possibleConditions.join(', ')}`);
    }

    results.push({ label, result, ms });

    check(`${label}: answered inside the configured timeout`, ms < env.gemini.timeoutMs,
      `${ms}ms / ${env.gemini.timeoutMs}ms budget`);
    check(`${label}: routed to the expected specialty`,
      result.suggestedSpecialty === expectSpecialty,
      `got ${result.suggestedSpecialty}, expected ${expectSpecialty}`);
    check(`${label}: advice is real prose, not a template`, result.advice.length > 30);
    check(`${label}: source is tagged gemini`, result.source === 'gemini');
  } catch (err) {
    console.log('FAILED');
    console.log(`  ${err.message}`);
    check(`${label}: request succeeded`, false, err.message);
  }
}

// The strongest proof of real reasoning: two different clinical pictures
// must not get an identical answer. A keyword fallback CAN coincidentally
// produce different specialties too, so this is corroborating evidence
// alongside the specialty checks above, not the only proof.
if (results.length === 2) {
  const [a, b] = results;
  check('the two cases were NOT given an identical response',
    a.result.suggestedSpecialty !== b.result.suggestedSpecialty ||
    a.result.advice !== b.result.advice,
    'responses differed as expected');
}

// The red-flag floor must still apply on top of a real Gemini answer — this
// is the safety property that matters most, and it must hold with AI on.
console.log('\nSending a red-flag case (chest pain) through the full pipeline...');
const emergencyText = 'I have severe crushing chest pain radiating to my left arm and I feel very breathless.';
try {
  const modelResult = await geminiCheck({
    text: emergencyText, language: 'en',
  });
  const { triggered } = checkRedFlags(emergencyText);
  const finalUrgency = maxUrgency(modelResult.urgency, triggered ? 'emergency' : 'self_care');

  console.log(`  Gemini's own urgency  : ${modelResult.urgency}`);
  console.log(`  Rule-layer triggered  : ${triggered}`);
  console.log(`  Combined final urgency: ${finalUrgency}`);

  check('Gemini itself recognised this as an emergency', modelResult.urgency === 'emergency',
    modelResult.urgency);
  check('the red-flag rule layer independently triggered too', triggered === true);
  check('the combined result is emergency regardless of either alone',
    finalUrgency === 'emergency');
} catch (err) {
  check('the red-flag pipeline test ran', false, err.message);
}

console.log(`\n${line}`);
console.log(`  ${pass} passed, ${fail} failed`);
if (fail === 0) {
  console.log('  Gemini is genuinely answering — this is not the keyword fallback.');
}
console.log(line);
process.exit(fail ? 1 : 0);
