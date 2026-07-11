import { makeQuestion, makeSection, toLocalized } from "@/lib/project";
import {
  Language,
  LocalizedText,
  Question,
  QuestionType,
  Questionnaire,
  ScaleConfig,
  Section,
} from "@/types/project";

export const VALID_TYPES: QuestionType[] = [
  "multipleChoice",
  "checkbox",
  "linearScale",
  "shortAnswer",
  "paragraph",
];

function coerceType(raw: any): QuestionType {
  return VALID_TYPES.includes(raw) ? raw : "shortAnswer";
}

/** Accepts a plain string OR an {en, ja} object from a model response and normalizes it. AI-authored text is never "manually edited". */
function toLocalizedText(raw: any, fallbackEn = ""): LocalizedText {
  if (raw && typeof raw === "object" && ("en" in raw || "ja" in raw)) {
    return { en: String(raw.en ?? fallbackEn).trim(), ja: String(raw.ja ?? "").trim(), jaManuallyEdited: false };
  }
  return { en: String(raw ?? fallbackEn).trim(), ja: "", jaManuallyEdited: false };
}

function coerceQuestion(raw: any): Question {
  const type = coerceType(raw?.type);
  return makeQuestion({
    text: toLocalizedText(raw?.text, "Untitled question"),
    type,
    options:
      type === "multipleChoice" || type === "checkbox"
        ? (Array.isArray(raw?.options) ? raw.options.map((o: any) => String(o).trim()).filter(Boolean) : ["Option A", "Option B"])
        : undefined,
    scale:
      type === "linearScale"
        ? {
            min: Number(raw?.scale?.min ?? 1),
            max: Number(raw?.scale?.max ?? 5),
            minLabel: raw?.scale?.minLabel ? String(raw.scale.minLabel) : undefined,
            maxLabel: raw?.scale?.maxLabel ? String(raw.scale.maxLabel) : undefined,
          }
        : undefined,
    required: Boolean(raw?.required),
  });
}

/**
 * Turns a raw, unvalidated model response into a well-typed Questionnaire.
 * Pass `bilingual: true` when the response was asked to produce {en, ja}
 * pairs for every text field (see /api/update-questionnaire) — the result's
 * translation status is set accordingly.
 */
export function coerceQuestionnaire(raw: any, opts: { bilingual?: boolean } = {}): Questionnaire {
  const profileQuestions = Array.isArray(raw?.participantProfile?.questions)
    ? raw.participantProfile.questions.map(coerceQuestion)
    : [];
  const sections = Array.isArray(raw?.sections)
    ? raw.sections.map((s: any) =>
        makeSection(
          toLocalizedText(s?.title, "Untitled Section"),
          Array.isArray(s?.questions) ? s.questions.map(coerceQuestion) : []
        )
      )
    : [];
  const finalComments =
    raw?.finalComments && typeof raw.finalComments === "object"
      ? makeSection(
          toLocalizedText(raw.finalComments.title, "Final Comments"),
          Array.isArray(raw.finalComments.questions)
            ? raw.finalComments.questions.map(coerceQuestion)
            : [makeQuestion({ text: "Do you have any other comments you'd like to share?", type: "paragraph" })]
        )
      : null;

  const questionnaire: Questionnaire = {
    greeting: toLocalizedText(raw?.greeting, "Thank you for taking part in this survey."),
    researchExplanation: toLocalizedText(raw?.researchExplanation, ""),
    informedConsent: toLocalizedText(
      raw?.informedConsent,
      "Your participation is voluntary and your responses will be kept anonymous. You may stop at any time."
    ),
    participantProfile: makeSection(toLocalizedText(raw?.participantProfile?.title, "Participant Profile"), profileQuestions),
    sections,
    finalComments,
    thankYou: toLocalizedText(raw?.thankYou, "Thank you very much for your responses!"),
    translation: { status: "none", enSnapshot: "" },
  };

  if (opts.bilingual) {
    questionnaire.translation = { status: "current", enSnapshot: extractEnglishSnapshot(questionnaire) };
  }

  return questionnaire;
}

/** Short human-readable outline of a questionnaire (English side only), used to give the AI context in chat/planning prompts. */
export function summarizeQuestionnaire(q: Questionnaire | null | undefined): string {
  if (!q) return "(No questionnaire has been generated yet.)";
  const lines: string[] = [];
  lines.push(`Greeting: ${q.greeting.en}`);
  lines.push(`Research explanation: ${q.researchExplanation.en}`);
  lines.push(`Informed consent: ${q.informedConsent.en}`);
  if (q.translation.status !== "none") {
    lines.push(`(A Japanese translation also exists for this questionnaire — status: ${q.translation.status}.)`);
  }
  lines.push(`Participant Profile (${q.participantProfile.questions.length} questions):`);
  q.participantProfile.questions.forEach((qq, i) => lines.push(`  ${i + 1}. [${qq.type}] ${qq.text.en}`));
  q.sections.forEach((s) => {
    lines.push(`Section "${s.title.en}" (${s.questions.length} questions):`);
    s.questions.forEach((qq, i) => lines.push(`  ${i + 1}. [${qq.type}] ${qq.text.en}${qq.selected ? "" : " (deselected)"}`));
  });
  if (q.finalComments) {
    lines.push(`Final Comments (${q.finalComments.questions.length} questions):`);
    q.finalComments.questions.forEach((qq, i) => lines.push(`  ${i + 1}. [${qq.type}] ${qq.text.en}`));
  }
  lines.push(`Thank-you message: ${q.thankYou.en}`);
  return lines.join("\n");
}

function stripIdsFromSection(s: Section, bilingual: boolean) {
  return {
    title: bilingual ? { en: s.title.en, ja: s.title.ja } : s.title.en,
    questions: s.questions.map((q) => ({
      text: bilingual ? { en: q.text.en, ja: q.text.ja } : q.text.en,
      type: q.type,
      options: q.options,
      scale: q.scale,
      required: q.required,
    })),
  };
}

/**
 * Full-fidelity JSON of a questionnaire (no ids) for prompts that must
 * revise it exactly. When `bilingual` is true, every text field is emitted
 * as an {en, ja} pair (for revisions that must update both languages);
 * otherwise plain English strings only.
 */
export function questionnaireToPromptJSON(q: Questionnaire, bilingual: boolean): string {
  const textOf = (loc: LocalizedText) => (bilingual ? { en: loc.en, ja: loc.ja } : loc.en);
  return JSON.stringify(
    {
      greeting: textOf(q.greeting),
      researchExplanation: textOf(q.researchExplanation),
      informedConsent: textOf(q.informedConsent),
      participantProfile: stripIdsFromSection(q.participantProfile, bilingual),
      sections: q.sections.map((s) => stripIdsFromSection(s, bilingual)),
      finalComments: q.finalComments ? stripIdsFromSection(q.finalComments, bilingual) : null,
      thankYou: textOf(q.thankYou),
    },
    null,
    2
  );
}

// ---------------------------------------------------------------------------
// Language resolution — collapses the bilingual data model down to plain
// strings for a chosen language, so downstream consumers (Google Forms
// export) don't need to know about LocalizedText at all.
// ---------------------------------------------------------------------------

export interface ResolvedQuestion {
  text: string;
  type: QuestionType;
  options?: string[];
  scale?: ScaleConfig;
  required: boolean;
  selected: boolean;
}

export interface ResolvedSection {
  title: string;
  questions: ResolvedQuestion[];
}

export interface ResolvedQuestionnaire {
  greeting: string;
  researchExplanation: string;
  informedConsent: string;
  participantProfile: ResolvedSection;
  sections: ResolvedSection[];
  finalComments: ResolvedSection | null;
  thankYou: string;
}

function resolveField(loc: LocalizedText, language: Language): string {
  if (language === "english") return loc.en;
  if (language === "japanese") return loc.ja || loc.en;
  return loc.ja ? `${loc.en}\n\n${loc.ja}` : loc.en;
}

function resolveSection(s: Section, language: Language): ResolvedSection {
  return {
    title: resolveField(s.title, language),
    questions: s.questions.map((q) => ({
      text: resolveField(q.text, language),
      type: q.type,
      options: q.options,
      scale: q.scale,
      required: q.required,
      selected: q.selected,
    })),
  };
}

export function resolveQuestionnaireLanguage(q: Questionnaire, language: Language): ResolvedQuestionnaire {
  return {
    greeting: resolveField(q.greeting, language),
    researchExplanation: resolveField(q.researchExplanation, language),
    informedConsent: resolveField(q.informedConsent, language),
    participantProfile: resolveSection(q.participantProfile, language),
    sections: q.sections.map((s) => resolveSection(s, language)),
    finalComments: q.finalComments ? resolveSection(q.finalComments, language) : null,
    thankYou: resolveField(q.thankYou, language),
  };
}

// ---------------------------------------------------------------------------
// Translation status tracking
// ---------------------------------------------------------------------------

/** Canonical snapshot of just the English text content + structure (order/count), used to detect edits that make an existing translation stale. */
export function extractEnglishSnapshot(q: Questionnaire): string {
  const sectionEn = (s: Section) => ({ title: s.title.en, questions: s.questions.map((qq) => qq.text.en) });
  return JSON.stringify({
    greeting: q.greeting.en,
    researchExplanation: q.researchExplanation.en,
    informedConsent: q.informedConsent.en,
    participantProfile: sectionEn(q.participantProfile),
    sections: q.sections.map(sectionEn),
    finalComments: q.finalComments ? sectionEn(q.finalComments) : null,
    thankYou: q.thankYou.en,
  });
}

/**
 * Call after every edit to the questionnaire. If a translation was marked
 * "current" but the English content has since changed, flips it to "stale"
 * so the UI can show the "translation may be outdated" warning. Never
 * updates automatically — only a translate/review action clears "stale".
 */
export function applyTranslationStaleness(next: Questionnaire): Questionnaire {
  if (next.translation.status !== "current") return next;
  const currentSnapshot = extractEnglishSnapshot(next);
  if (currentSnapshot !== next.translation.enSnapshot) {
    return { ...next, translation: { ...next.translation, status: "stale" } };
  }
  return next;
}

/**
 * Extracts a plain translated string from a translation-response entry.
 * The model is asked for plain strings, but sometimes over-delivers full
 * {text, type, options, ...} objects instead — tolerate both shapes rather
 * than corrupting the merge with "[object Object]".
 */
function extractTranslatedString(raw: any, fallback: string): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object" && typeof raw.text === "string") return raw.text.trim();
  return fallback;
}

/**
 * Merges a translation response (plain Japanese strings mirroring the
 * English structure, see /api/translate) into an existing questionnaire.
 * English content and all ids are left untouched — only `.ja` is written.
 *
 * By default, fields the student has manually edited are left alone (see
 * LocalizedText.jaManuallyEdited) — pass `includeManualEdits: true` to
 * overwrite them anyway. Every field this function DOES write to comes back
 * with jaManuallyEdited reset to false (it's now an AI-authored baseline).
 */
export function mergeJapaneseTranslation(
  q: Questionnaire,
  translation: any,
  opts: { includeManualEdits?: boolean } = {}
): Questionnaire {
  const mergeText = (current: LocalizedText, raw: any): LocalizedText => {
    if (current.jaManuallyEdited && !opts.includeManualEdits) return current;
    return { en: current.en, ja: extractTranslatedString(raw, current.ja), jaManuallyEdited: false };
  };

  const mergeSection = (s: Section, t: any): Section => ({
    ...s,
    title: mergeText(s.title, t?.title),
    questions: s.questions.map((qq, i) => ({
      ...qq,
      text: mergeText(qq.text, t?.questions?.[i]),
    })),
  });

  const merged: Questionnaire = {
    ...q,
    greeting: mergeText(q.greeting, translation?.greeting),
    researchExplanation: mergeText(q.researchExplanation, translation?.researchExplanation),
    informedConsent: mergeText(q.informedConsent, translation?.informedConsent),
    participantProfile: mergeSection(q.participantProfile, translation?.participantProfile),
    sections: q.sections.map((s, i) => mergeSection(s, translation?.sections?.[i])),
    finalComments: q.finalComments ? mergeSection(q.finalComments, translation?.finalComments) : null,
    thankYou: mergeText(q.thankYou, translation?.thankYou),
    translation: { status: "current", enSnapshot: "" },
  };
  merged.translation = { status: "current", enSnapshot: extractEnglishSnapshot(merged) };
  return merged;
}

// ---------------------------------------------------------------------------
// Japanese field addressing — a flat, stable "path" scheme used by the
// wording-review workflow and by manual-edit protection during Update
// Questionnaire. Every localized field in the tree has exactly one id.
// ---------------------------------------------------------------------------

export interface JapaneseFieldRef {
  id: string;
  label: string;
  en: string;
  ja: string;
  jaManuallyEdited: boolean;
  questionType?: QuestionType;
  scale?: ScaleConfig;
}

type FieldLocation =
  | { kind: "greeting" | "researchExplanation" | "informedConsent" | "thankYou" }
  | { kind: "profileTitle" }
  | { kind: "profileQuestion"; index: number }
  | { kind: "sectionTitle"; section: number }
  | { kind: "sectionQuestion"; section: number; index: number }
  | { kind: "finalTitle" }
  | { kind: "finalQuestion"; index: number };

function parseFieldId(id: string): FieldLocation | null {
  if (id === "greeting" || id === "researchExplanation" || id === "informedConsent" || id === "thankYou") {
    return { kind: id };
  }
  if (id === "participantProfile.title") return { kind: "profileTitle" };
  let m = id.match(/^participantProfile\.questions\.(\d+)$/);
  if (m) return { kind: "profileQuestion", index: Number(m[1]) };
  m = id.match(/^sections\.(\d+)\.title$/);
  if (m) return { kind: "sectionTitle", section: Number(m[1]) };
  m = id.match(/^sections\.(\d+)\.questions\.(\d+)$/);
  if (m) return { kind: "sectionQuestion", section: Number(m[1]), index: Number(m[2]) };
  if (id === "finalComments.title") return { kind: "finalTitle" };
  m = id.match(/^finalComments\.questions\.(\d+)$/);
  if (m) return { kind: "finalQuestion", index: Number(m[1]) };
  return null;
}

/** Every localized field in the questionnaire that currently has Japanese text worth reviewing. */
export function listJapaneseFields(q: Questionnaire): JapaneseFieldRef[] {
  const fields: JapaneseFieldRef[] = [];
  const push = (id: string, label: string, lt: LocalizedText, questionType?: QuestionType, scale?: ScaleConfig) => {
    if (!lt.ja.trim()) return; // nothing translated yet for this field — out of scope
    fields.push({ id, label, en: lt.en, ja: lt.ja, jaManuallyEdited: lt.jaManuallyEdited, questionType, scale });
  };

  push("greeting", "Greeting", q.greeting);
  push("researchExplanation", "Research Explanation", q.researchExplanation);
  push("informedConsent", "Informed Consent", q.informedConsent);

  push("participantProfile.title", "Participant Profile — Section Title", q.participantProfile.title);
  q.participantProfile.questions.forEach((question, i) =>
    push(`participantProfile.questions.${i}`, `Participant Profile — Q${i + 1}`, question.text, question.type, question.scale)
  );

  q.sections.forEach((section, si) => {
    push(`sections.${si}.title`, `Section ${si + 1} (${section.title.en}) — Title`, section.title);
    section.questions.forEach((question, qi) =>
      push(
        `sections.${si}.questions.${qi}`,
        `Section ${si + 1} (${section.title.en}) — Q${qi + 1}`,
        question.text,
        question.type,
        question.scale
      )
    );
  });

  if (q.finalComments) {
    push("finalComments.title", "Final Comments — Section Title", q.finalComments.title);
    q.finalComments.questions.forEach((question, i) =>
      push(`finalComments.questions.${i}`, `Final Comments — Q${i + 1}`, question.text, question.type, question.scale)
    );
  }

  push("thankYou", "Thank-you Message", q.thankYou);

  return fields;
}

export function getLocalizedTextAt(q: Questionnaire, id: string): LocalizedText | null {
  const loc = parseFieldId(id);
  if (!loc) return null;
  switch (loc.kind) {
    case "greeting":
    case "researchExplanation":
    case "informedConsent":
    case "thankYou":
      return q[loc.kind];
    case "profileTitle":
      return q.participantProfile.title;
    case "profileQuestion":
      return q.participantProfile.questions[loc.index]?.text ?? null;
    case "sectionTitle":
      return q.sections[loc.section]?.title ?? null;
    case "sectionQuestion":
      return q.sections[loc.section]?.questions[loc.index]?.text ?? null;
    case "finalTitle":
      return q.finalComments?.title ?? null;
    case "finalQuestion":
      return q.finalComments?.questions[loc.index]?.text ?? null;
    default:
      return null;
  }
}

/** Returns a new Questionnaire with the field at `id` replaced via `updater`. No-op (returns q unchanged) if the id doesn't resolve. */
export function setLocalizedTextAt(q: Questionnaire, id: string, updater: (lt: LocalizedText) => LocalizedText): Questionnaire {
  const loc = parseFieldId(id);
  if (!loc) return q;

  switch (loc.kind) {
    case "greeting":
    case "researchExplanation":
    case "informedConsent":
    case "thankYou":
      return { ...q, [loc.kind]: updater(q[loc.kind]) };
    case "profileTitle":
      return { ...q, participantProfile: { ...q.participantProfile, title: updater(q.participantProfile.title) } };
    case "profileQuestion": {
      const current = q.participantProfile.questions[loc.index];
      if (!current) return q;
      const questions = [...q.participantProfile.questions];
      questions[loc.index] = { ...current, text: updater(current.text) };
      return { ...q, participantProfile: { ...q.participantProfile, questions } };
    }
    case "sectionTitle": {
      const section = q.sections[loc.section];
      if (!section) return q;
      const sections = [...q.sections];
      sections[loc.section] = { ...section, title: updater(section.title) };
      return { ...q, sections };
    }
    case "sectionQuestion": {
      const section = q.sections[loc.section];
      const current = section?.questions[loc.index];
      if (!section || !current) return q;
      const questions = [...section.questions];
      questions[loc.index] = { ...current, text: updater(current.text) };
      const sections = [...q.sections];
      sections[loc.section] = { ...section, questions };
      return { ...q, sections };
    }
    case "finalTitle":
      if (!q.finalComments) return q;
      return { ...q, finalComments: { ...q.finalComments, title: updater(q.finalComments.title) } };
    case "finalQuestion": {
      if (!q.finalComments) return q;
      const current = q.finalComments.questions[loc.index];
      if (!current) return q;
      const questions = [...q.finalComments.questions];
      questions[loc.index] = { ...current, text: updater(current.text) };
      return { ...q, finalComments: { ...q.finalComments, questions } };
    }
    default:
      return q;
  }
}

// ---------------------------------------------------------------------------
// Japanese wording review — apply the (already-reviewed, user-confirmed)
// suggestions from /api/review-japanese. English is never touched.
// ---------------------------------------------------------------------------

export interface JapaneseReviewSuggestion {
  id: string;
  suggestedJa: string;
}

export function applyJapaneseReview(q: Questionnaire, suggestions: JapaneseReviewSuggestion[]): Questionnaire {
  let result = q;
  for (const s of suggestions) {
    result = setLocalizedTextAt(result, s.id, (lt) => ({ ...lt, ja: s.suggestedJa, jaManuallyEdited: false }));
  }
  result = { ...result, translation: { status: "current", enSnapshot: extractEnglishSnapshot(result) } };
  return result;
}

/**
 * Defensive safety net for Update Questionnaire's bilingual apply: makes
 * sure every manually-edited Japanese field from the pre-apply
 * questionnaire is still marked (and still says the same thing) on the
 * newly revised one, in case the AI changed it despite being asked not to.
 *
 * A revision can insert/reorder questions within a section, so the same
 * field id in the new tree isn't reliably the same question anymore.
 * Strategy per locked field, in order:
 *   1. Same id, and the AI already preserved the text verbatim — just
 *      re-flag it as manually edited (fast path, the common case).
 *   2. The exact Japanese text shows up somewhere else in the new tree
 *      (the AI kept the text but the item moved) — flag that one instead.
 *   3. Last resort: force the locked text back onto the same id, accepting
 *      that the structure may have shifted underneath it.
 */
export function restoreLockedJapaneseFields(newQ: Questionnaire, oldQ: Questionnaire): Questionnaire {
  const locked = listJapaneseFields(oldQ).filter((f) => f.jaManuallyEdited);
  let result = newQ;

  for (const field of locked) {
    const atSameId = getLocalizedTextAt(result, field.id);
    if (atSameId && atSameId.ja === field.ja) {
      if (!atSameId.jaManuallyEdited) {
        result = setLocalizedTextAt(result, field.id, (current) => ({ ...current, jaManuallyEdited: true }));
      }
      continue;
    }

    const movedTo = listJapaneseFields(result).find((f) => f.ja === field.ja);
    if (movedTo) {
      result = setLocalizedTextAt(result, movedTo.id, (current) => ({ ...current, jaManuallyEdited: true }));
      continue;
    }

    if (atSameId) {
      result = setLocalizedTextAt(result, field.id, (current) => ({ en: current.en, ja: field.ja, jaManuallyEdited: true }));
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Backward compatibility — earlier saved projects had plain-string text
// fields, no `translation` block, or {en, ja} pairs without the
// jaManuallyEdited flag. Always normalize through here on Open Project.
// ---------------------------------------------------------------------------

function normalizeLocalizedText(raw: any): LocalizedText {
  if (typeof raw === "string") return { en: raw, ja: "", jaManuallyEdited: false };
  if (raw && typeof raw === "object") {
    return {
      en: typeof raw.en === "string" ? raw.en : "",
      ja: typeof raw.ja === "string" ? raw.ja : "",
      jaManuallyEdited: Boolean(raw.jaManuallyEdited),
    };
  }
  return toLocalized("");
}

function migrateLegacySection(raw: any): Section {
  const title = normalizeLocalizedText(raw?.title);
  const questions: Question[] = Array.isArray(raw?.questions)
    ? raw.questions.map((q: any) => ({
        id: typeof q?.id === "string" ? q.id : `q_${Math.random().toString(36).slice(2, 9)}`,
        text: normalizeLocalizedText(q?.text),
        type: VALID_TYPES.includes(q?.type) ? q.type : "shortAnswer",
        options: q?.options,
        scale: q?.scale,
        required: Boolean(q?.required),
        selected: q?.selected ?? true,
      }))
    : [];
  return { id: typeof raw?.id === "string" ? raw.id : `sec_${Math.random().toString(36).slice(2, 9)}`, title, questions };
}

export function migrateLegacyQuestionnaire(raw: any): Questionnaire {
  return {
    greeting: normalizeLocalizedText(raw?.greeting),
    researchExplanation: normalizeLocalizedText(raw?.researchExplanation),
    informedConsent: normalizeLocalizedText(raw?.informedConsent),
    participantProfile: raw?.participantProfile ? migrateLegacySection(raw.participantProfile) : makeSection("Participant Profile"),
    sections: Array.isArray(raw?.sections) ? raw.sections.map(migrateLegacySection) : [],
    finalComments: raw?.finalComments ? migrateLegacySection(raw.finalComments) : null,
    thankYou: normalizeLocalizedText(raw?.thankYou),
    translation:
      raw?.translation && typeof raw.translation === "object"
        ? {
            status: raw.translation.status === "current" || raw.translation.status === "stale" ? raw.translation.status : "none",
            enSnapshot: typeof raw.translation.enSnapshot === "string" ? raw.translation.enSnapshot : "",
          }
        : { status: "none", enSnapshot: "" },
  };
}
