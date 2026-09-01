import { SymptomCheck, Specialty } from '../models/index.js';
import { asyncHandler, ApiError } from '../utils/ApiError.js';
import { URGENCY } from '../utils/constants.js';
import { checkRedFlags, maxUrgency, RED_FLAG_LANGUAGE_COVERAGE } from '../services/redFlags.js';
import { ruleBasedCheck } from '../services/ruleChecker.js';
import { geminiCheck, geminiAvailable } from '../services/gemini.service.js';

export const DISCLAIMER =
  'This is an automated triage suggestion, not a diagnosis. It cannot examine you and may be wrong. '
  + 'Always confirm with a qualified doctor, and seek emergency care immediately if you feel very unwell.';

/**
 * Triage a free-text symptom description.
 *
 * Three layers, in this order:
 *
 *   1. Red-flag rules run FIRST and set a floor on the urgency.
 *   2. Gemini produces the detailed assessment.
 *   3. A keyword engine answers if Gemini is unavailable for any reason.
 *
 * The ordering is the safety property. The model may raise the urgency above
 * the floor but can never lower it, so a model that is having an off day,
 * has been rate-limited, or has been talked into reassurance cannot tell
 * someone describing crushing chest pain that they have indigestion.
 */
export const checkSymptoms = asyncHandler(async (req, res) => {
  const { text, ageYears, gender = '', durationDays, language = 'en' } = req.body;

  // ---- Layer 1: red flags -------------------------------------------------
  const { triggered, flags } = checkRedFlags(text);
  const floorUrgency = triggered ? URGENCY.EMERGENCY : URGENCY.SELF_CARE;

  // ---- Layer 2/3: model, falling back to rules ---------------------------
  let assessment;
  let fallbackReason = '';

  if (geminiAvailable()) {
    try {
      assessment = await geminiCheck({ text, ageYears, gender, durationDays, language });
    } catch (err) {
      fallbackReason = err.message;
      console.warn('[symptoms] Gemini unavailable, using rule engine:', err.message);
      assessment = ruleBasedCheck(text);
    }
  } else {
    fallbackReason = 'No Gemini API key is configured';
    assessment = ruleBasedCheck(text);
  }

  // The floor is applied after, so it cannot be argued away.
  const urgency = maxUrgency(assessment.urgency, floorUrgency);

  const redFlagLabels = flags.map((f) => f.label);
  const combinedRedFlags = [...new Set([...redFlagLabels, ...(assessment.redFlags ?? [])])];

  // Resolve the suggested specialty to a real one so the UI can deep-link
  // straight into a filtered doctor search.
  const specialtyDoc = await Specialty.findOne({
    name: assessment.suggestedSpecialty,
    isActive: true,
  }).lean();

  const record = await SymptomCheck.create({
    patient: req.user._id,
    inputText: text,
    ageYears,
    gender,
    durationDays,
    language,
    source: triggered && assessment.source === 'rules' ? 'red_flag_rules' : assessment.source,
    suggestedSpecialty: assessment.suggestedSpecialty,
    specialtyRef: specialtyDoc?._id,
    urgency,
    possibleConditions: assessment.possibleConditions ?? [],
    advice: assessment.advice,
    redFlags: combinedRedFlags,
    fallbackReason,
  });

  res.status(201).json({
    success: true,
    result: {
      id: record._id,
      urgency,
      isEmergency: urgency === URGENCY.EMERGENCY,
      suggestedSpecialty: assessment.suggestedSpecialty,
      specialtyId: specialtyDoc?._id ?? null,
      possibleConditions: assessment.possibleConditions ?? [],
      advice: assessment.advice,
      redFlags: combinedRedFlags,
      // What each red flag means to do, kept separate from the model's prose
      // so the emergency instructions are never paraphrased by it.
      redFlagActions: flags.map((f) => ({ label: f.label, advice: f.advice })),
      // Being open about which layer answered is part of being honest about
      // what this feature is.
      source: record.source,
      usedFallback: assessment.source === 'rules',
      fallbackReason: fallbackReason || undefined,
      languageCoverageWarning:
        language !== 'en' && !RED_FLAG_LANGUAGE_COVERAGE.includes(language),
      disclaimer: DISCLAIMER,
    },
  });
});

export const listMyChecks = asyncHandler(async (req, res) => {
  const checks = await SymptomCheck.find({ patient: req.user._id })
    .populate('specialtyRef', 'name slug')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  res.json({ success: true, checks });
});

export const getCheck = asyncHandler(async (req, res) => {
  const check = await SymptomCheck.findById(req.params.id)
    .populate('specialtyRef', 'name slug')
    .lean();

  if (!check) throw ApiError.notFound('Symptom check not found');
  if (String(check.patient) !== String(req.user._id)) {
    throw ApiError.forbidden('This is not your symptom check');
  }

  res.json({ success: true, check });
});
