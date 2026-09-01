import { URGENCY } from '../utils/constants.js';

/**
 * Urgency levels in increasing order of seriousness. Used to combine the
 * rule layer and the model's answer by taking the higher of the two.
 */
export const URGENCY_ORDER = [
  URGENCY.SELF_CARE,
  URGENCY.ROUTINE,
  URGENCY.URGENT,
  URGENCY.EMERGENCY,
];

export const rankOf = (urgency) => {
  const index = URGENCY_ORDER.indexOf(urgency);
  return index === -1 ? URGENCY_ORDER.indexOf(URGENCY.ROUTINE) : index;
};

/** The more serious of two urgencies. */
export const maxUrgency = (a, b) =>
  rankOf(a) >= rankOf(b) ? (URGENCY_ORDER[rankOf(a)]) : (URGENCY_ORDER[rankOf(b)]);

/**
 * Symptoms that mean "stop reading and call an ambulance".
 *
 * This list runs BEFORE the language model and sets a floor on the answer:
 * the model may raise the urgency but can never lower it. A model that is
 * having an off day, is rate-limited, or has been talked into reassurance by
 * a persuasive prompt must not be able to tell someone describing crushing
 * chest pain that they have indigestion.
 *
 * The patterns are deliberately broad. A false alarm here costs someone an
 * unnecessary worry; a miss costs considerably more.
 */
const RED_FLAGS = [
  {
    code: 'cardiac',
    label: 'Possible heart attack',
    advice: 'Call an ambulance now. Chew an aspirin only if a doctor has previously told you to.',
    patterns: [
      /chest\s*(pain|pressure|tightness|tightening|heaviness|discomfort|crushing)/i,
      /(pain|ache).{0,25}(radiat|spread).{0,25}(arm|jaw|shoulder|neck|back)/i,
      /(crushing|squeezing|elephant).{0,20}chest/i,
      /heart\s*attack/i,
    ],
  },
  {
    code: 'breathing',
    label: 'Severe difficulty breathing',
    advice: 'Call an ambulance now. Sit upright and try to stay calm.',
    patterns: [
      /(can'?t|cannot|unable to|struggling to|difficulty)\s*breath/i,
      /(severe|extreme|sudden)\s*(shortness of breath|breathlessness|dyspnoea|dyspnea)/i,
      /gasping|suffocating|choking/i,
      /turning\s*blue|lips?\s*(are\s*)?blue|bluish\s*(lips?|skin)/i,
    ],
  },
  {
    code: 'stroke',
    label: 'Possible stroke',
    advice: 'Call an ambulance now. Note the time the symptoms started — treatment depends on it.',
    patterns: [
      /face\s*(is\s*)?(droop|drooping|sagging|numb)/i,
      /(slurred|slurring)\s*speech|can'?t\s*speak|unable to speak|speech\s*(is\s*)?strange/i,
      /(sudden|one\s*side).{0,25}(weakness|numbness|paralysis)/i,
      /(weakness|numbness|paralysis).{0,25}(one\s*side|left\s*side|right\s*side)/i,
      /worst\s*headache\s*(of\s*my\s*life|ever)/i,
      /(sudden|thunderclap).{0,15}(severe|worst).{0,15}headache/i,
      /stroke/i,
    ],
  },
  {
    code: 'anaphylaxis',
    label: 'Possible severe allergic reaction',
    advice: 'Call an ambulance now. Use an adrenaline auto-injector if you have been prescribed one.',
    patterns: [
      /(throat|tongue|lips?|face)\s*(is\s*)?(swelling|swollen|closing)/i,
      /anaphyla/i,
      /(difficulty|trouble|can'?t)\s*swallow/i,
      /(allergic reaction).{0,30}(breath|swell|throat)/i,
    ],
  },
  {
    code: 'bleeding',
    label: 'Severe bleeding',
    advice: 'Call an ambulance now. Press firmly on the wound with a clean cloth and keep pressing.',
    patterns: [
      /(heavy|severe|uncontrolled|won'?t stop|profuse)\s*bleed/i,
      /bleeding\s*(heavily|badly|a lot|non-?stop|that\s*won'?t\s*stop)/i,
      /(vomit|cough|throw)\w*\s*(up\s*)?blood/i,
      /blood\s*in\s*(vomit|stool|urine)/i,
    ],
  },
  {
    code: 'consciousness',
    label: 'Loss of consciousness or seizure',
    advice: 'Call an ambulance now. Do not leave the person alone.',
    patterns: [
      /unconscious|unresponsive|passed out|blacked out|fainted/i,
      /seizure|convulsion|fitting|having a fit/i,
      /(can'?t|cannot)\s*wake\s*(them|him|her|up)/i,
      /confus\w*\s*and\s*(drowsy|sleepy)/i,
    ],
  },
  {
    code: 'self_harm',
    label: 'Thoughts of suicide or self-harm',
    advice:
      'You deserve immediate support. Please contact an emergency service or a suicide helpline right now, '
      + 'and stay with someone you trust. In India you can call Tele-MANAS on 14416, or KIRAN on 1800-599-0019.',
    // Verb endings matter here. An earlier version used `end\s*my\s*life`,
    // which silently failed to match "thinking about ENDING my life" — the
    // most natural way someone actually phrases it. Every verb in this block
    // therefore allows a suffix.
    patterns: [
      /suicid\w*/i,
      /kill\w*\s+(my\s?self|himself|herself|themselves)/i,
      /end\w*\s+(my|his|her|their|it)\s*(own\s+)?(life|all)\b/i,
      /tak\w*\s+(my|his|her|their)\s+(own\s+)?life\b/i,
      /(want\w*|going|plan\w*)\s+to\s+die\b/i,
      /don'?t\s+want\s+to\s+(live|be\s+alive|be\s+here|wake\s+up)/i,
      /better\s+off\s+dead/i,
      /no\s+(point|reason)\s+(in\s+)?(living|going\s+on)/i,
      /self[-\s]?harm\w*/i,
      /(hurt\w*|cut\w*|harm\w*)\s+(my\s?self|himself|herself|themselves)/i,
    ],
  },
  {
    code: 'poisoning',
    label: 'Possible poisoning',
    advice: 'Call an ambulance now. Keep the container or packet to show the medical team.',
    patterns: [
      /poison\w*|swallowed\s*(chemical|bleach|pesticide|acid)/i,
      /(took|taken)\s*too\s*many\s*(pills|tablets)/i,
      // Covers both accidental and intentional; either way it is the same
      // medical emergency, and the self-harm rule catches the intent
      // separately when it is expressed.
      /overdos\w*/i,
      /snake\s*bite|scorpion\s*sting/i,
    ],
  },
  {
    code: 'meningitis',
    label: 'Possible meningitis',
    advice: 'Call an ambulance now, especially if a rash does not fade when pressed with a glass.',
    patterns: [
      /(stiff|rigid)\s*neck.{0,30}(fever|headache)/i,
      /(fever|headache).{0,30}(stiff|rigid)\s*neck/i,
      /(rash).{0,25}(doesn'?t|does not|won'?t)\s*fade/i,
      /(light|bright)\s*hurts?\s*(my\s*)?eyes.{0,25}(fever|headache)/i,
    ],
  },
  {
    code: 'obstetric',
    label: 'Pregnancy emergency',
    advice: 'Call an ambulance or go to your maternity unit now.',
    patterns: [
      /pregnan\w*.{0,40}(heavy bleeding|severe pain|water\s*broke|no movement|not moving)/i,
      /(heavy bleeding|severe abdominal pain).{0,40}pregnan/i,
      /baby\s*(is\s*)?not\s*moving/i,
    ],
  },
  {
    code: 'infant',
    label: 'Seriously unwell infant',
    advice: 'Call an ambulance or go to the nearest emergency department now.',
    patterns: [
      /(newborn|infant|baby).{0,40}(high fever|not feeding|floppy|limp|won'?t wake|blue)/i,
      /(baby|infant).{0,30}fever.{0,20}(under|less than)\s*3\s*months/i,
    ],
  },
];

/**
 * Checks free text against the red-flag list.
 *
 * Returns every match, not just the first: someone describing chest pain and
 * breathlessness should see both, because that combination matters.
 */
export function checkRedFlags(text = '') {
  if (!text.trim()) return { triggered: false, flags: [] };

  const flags = RED_FLAGS.filter((flag) =>
    flag.patterns.some((pattern) => pattern.test(text))
  ).map(({ code, label, advice }) => ({ code, label, advice }));

  return { triggered: flags.length > 0, flags };
}

/**
 * Languages other than English are only partly covered by these patterns.
 * The checker states this in its response, and the UI keeps the emergency
 * route visible on every result regardless of the assessed urgency, so a
 * missed match never leaves someone without a way to get help.
 */
export const RED_FLAG_LANGUAGE_COVERAGE = ['en'];
