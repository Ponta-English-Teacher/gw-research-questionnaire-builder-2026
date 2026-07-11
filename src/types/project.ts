// Shared data model for GW Research Questionnaire Builder 2026
// See DESIGN.md sections 4 and 7.8 for the rationale behind this schema.

export type Mode = "small" | "graduation";

export type QuestionType =
  | "multipleChoice"
  | "checkbox"
  | "linearScale"
  | "shortAnswer"
  | "paragraph";

export type Language = "english" | "japanese" | "bilingual";

/**
 * Every editable passage/title/question text in the questionnaire carries
 * both languages side by side. Answer choices (options, scale labels) are
 * NOT localized yet — English only, by design (Phase 2B scope).
 */
export interface LocalizedText {
  en: string;
  ja: string;
  /**
   * True once a human has typed directly into this field's Japanese box.
   * AI-authored Japanese (fresh translation, an applied wording review, or
   * an applied Update Questionnaire revision) always sets this back to
   * false — it only ever means "a person, not the AI, wrote this exact
   * text." Manually edited fields are skipped by default whenever the AI
   * would otherwise overwrite Japanese content.
   */
  jaManuallyEdited: boolean;
}

export interface ScaleConfig {
  min: number;
  max: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface Question {
  id: string;
  text: LocalizedText;
  type: QuestionType;
  options?: string[]; // multipleChoice / checkbox — English only, not translated yet
  scale?: ScaleConfig; // linearScale — labels English only, not translated yet
  required: boolean;
  selected: boolean;
}

export interface Section {
  id: string;
  title: LocalizedText;
  questions: Question[];
}

export interface AIUnderstanding {
  purpose: string;
  targetParticipants: string;
  importantConcepts: string[];
  specialFocus: string;
  hypothesis: string;
  suggestedSections: string[];
  approved: boolean;
}

export type TranslationStatus = "none" | "current" | "stale";

export interface Questionnaire {
  greeting: LocalizedText;
  researchExplanation: LocalizedText;
  informedConsent: LocalizedText;
  participantProfile: Section;
  sections: Section[];
  finalComments: Section | null;
  thankYou: LocalizedText;
  /**
   * Tracks whether the Japanese version exists and is in sync with the
   * English content. "none" = no Japanese yet. "current" = translated and
   * untouched since. "stale" = English changed after translating.
   */
  translation: {
    status: TranslationStatus;
    /** JSON snapshot of English content at the moment of the last successful translation. */
    enSnapshot: string;
  };
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export const SCHEMA_VERSION = 3;
export const SOURCE_APP = "gw-research-questionnaire-builder";

export interface Project {
  schemaVersion: number;
  sourceApp: string;
  mode: Mode;
  title: string;
  introduction: string;
  specialInterest: string;
  hypothesis: string;
  aiUnderstanding: AIUnderstanding | null;
  questionnaire: Questionnaire | null;
  chatHistory: ChatMessage[];
  notes: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
