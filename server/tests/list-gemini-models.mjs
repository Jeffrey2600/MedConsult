/**
 * Lists which Gemini models this API key can actually use, and which of
 * those support generateContent (what the symptom checker needs).
 *
 *   node tests/list-gemini-models.mjs
 */
import { GoogleGenAI } from '@google/genai';
import { env } from '../src/config/env.js';

if (!env.gemini.apiKey) {
  console.log('GEMINI_API_KEY is not set in server/.env');
  process.exit(1);
}

const client = new GoogleGenAI({ apiKey: env.gemini.apiKey });

console.log('\nModels available to this API key:\n');

const usable = [];
for await (const model of await client.models.list()) {
  const supportsGenerate = (model.supportedActions ?? []).includes('generateContent');
  if (supportsGenerate) usable.push(model.name);
  console.log(
    `  ${supportsGenerate ? '✓' : ' '} ${(model.name ?? '').replace(/^models\//, '')}`
  );
}

console.log(`\n${usable.length} model(s) support generateContent.`);
if (usable.length) {
  const suggestion = usable.find((m) => /flash/i.test(m)) ?? usable[0];
  console.log(`Suggested GEMINI_MODEL value: ${suggestion.replace(/^models\//, '')}`);
}
