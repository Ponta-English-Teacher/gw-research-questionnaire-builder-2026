import { newId } from "@/lib/id";
import {
  LocalizedText,
  Mode,
  Project,
  Question,
  QuestionType,
  SCHEMA_VERSION,
  Section,
  SOURCE_APP,
} from "@/types/project";

export function createEmptyProject(): Project {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    sourceApp: SOURCE_APP,
    mode: "small",
    title: "",
    introduction: "",
    specialInterest: "",
    hypothesis: "",
    aiUnderstanding: null,
    questionnaire: null,
    chatHistory: [],
    notes: "",
    metadata: {},
    createdAt: now,
    updatedAt: now,
  };
}

/** Accepts a plain English string (wrapped with an empty Japanese side) or an already-localized value. */
export function toLocalized(value: string | LocalizedText): LocalizedText {
  if (typeof value === "string") return { en: value, ja: "", jaManuallyEdited: false };
  return value;
}

export function makeQuestion(partial: {
  text: string | LocalizedText;
  type: QuestionType;
  options?: string[];
  scale?: Question["scale"];
  required?: boolean;
}): Question {
  return {
    id: newId("q"),
    text: toLocalized(partial.text),
    type: partial.type,
    options: partial.options,
    scale: partial.scale,
    required: partial.required ?? false,
    selected: true,
  };
}

export function makeSection(title: string | LocalizedText, questions: Question[] = []): Section {
  return {
    id: newId("sec"),
    title: toLocalized(title),
    questions,
  };
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || "untitled-research";
}

export function projectFilename(project: Project): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  return `${slugify(project.title)}-${dateStamp}.json`;
}

/**
 * Work-in-progress that lives outside the Project object (generated Google
 * Forms script, repair state, pending update plan, pending Japanese review).
 * It is saved under project.metadata.session so older app versions still
 * open the file, and older files simply have no session (-> defaults).
 */
export interface SessionExtras {
  scriptCode: string;
  scriptLanguage: "english" | "japanese" | "bilingual";
  scriptValidationIssues: any[];
  repairErrorMessage: string;
  repairCode: string;
  repairExplanation: string;
  planPending: boolean;
  reviewPending: boolean;
  reviewSuggestions: { id: string; label: string; currentJa: string; suggestedJa: string; reason: string }[];
  reviewedCount: number;
  skippedManualEdits: number;
  includeManualEdits: boolean;
}

export function emptySession(): SessionExtras {
  return {
    scriptCode: "",
    scriptLanguage: "english",
    scriptValidationIssues: [],
    repairErrorMessage: "",
    repairCode: "",
    repairExplanation: "",
    planPending: false,
    reviewPending: false,
    reviewSuggestions: [],
    reviewedCount: 0,
    skippedManualEdits: 0,
    includeManualEdits: false,
  };
}

const str = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Defensive read of project.metadata.session; never throws, always returns a complete object. */
export function readSession(project: Project): SessionExtras {
  const base = emptySession();
  const raw: any = (project.metadata as any)?.session;
  if (!raw || typeof raw !== "object") return base;

  const suggestions = Array.isArray(raw.reviewSuggestions)
    ? raw.reviewSuggestions
        .filter((x: any) => x && typeof x.id === "string" && typeof x.suggestedJa === "string")
        .map((x: any) => ({
          id: x.id,
          label: str(x.label),
          currentJa: str(x.currentJa),
          suggestedJa: x.suggestedJa,
          reason: str(x.reason),
        }))
    : [];
  const hasTranslation = !!project.questionnaire && project.questionnaire.translation?.status !== "none";
  const lastChat = project.chatHistory[project.chatHistory.length - 1];

  return {
    scriptCode: str(raw.scriptCode),
    scriptLanguage:
      raw.scriptLanguage === "japanese" || raw.scriptLanguage === "bilingual" ? raw.scriptLanguage : "english",
    scriptValidationIssues: Array.isArray(raw.scriptValidationIssues) ? raw.scriptValidationIssues : [],
    repairErrorMessage: str(raw.repairErrorMessage),
    repairCode: str(raw.repairCode),
    repairExplanation: str(raw.repairExplanation),
    // A pending plan only makes sense if the plan message is still the last chat entry.
    planPending: raw.planPending === true && !!project.questionnaire && lastChat?.role === "assistant",
    reviewPending: raw.reviewPending === true && suggestions.length > 0 && hasTranslation,
    reviewSuggestions: suggestions,
    reviewedCount: num(raw.reviewedCount),
    skippedManualEdits: num(raw.skippedManualEdits),
    includeManualEdits: raw.includeManualEdits === true,
  };
}

/** Canonical string used to detect unsaved changes (ignores updatedAt). */
export function projectFingerprint(project: Project, session: SessionExtras): string {
  const { updatedAt: _u, metadata, ...rest } = project;
  // metadata.session is a saved copy of `session`; exclude it so a freshly opened file isn't "dirty".
  const { session: _s, ...otherMeta } = (metadata || {}) as Record<string, unknown>;
  return JSON.stringify({ rest, otherMeta, session });
}

export function serializeProject(project: Project, session?: SessionExtras): string {
  const toSave: Project = {
    ...project,
    metadata: session ? { ...project.metadata, session } : project.metadata,
    updatedAt: new Date().toISOString(),
  };
  return JSON.stringify(toSave, null, 2);
}

export class ProjectValidationError extends Error {}

/**
 * Accepts parsed JSON of unknown shape and returns a valid Project,
 * filling in any missing-but-safe-to-default fields (e.g. a project
 * saved by an earlier schema version). Throws ProjectValidationError
 * when the file is not recognizable as a project at all.
 */
export function parseProjectJSON(raw: string): Project {
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new ProjectValidationError("This file is not valid JSON.");
  }

  if (!data || typeof data !== "object") {
    throw new ProjectValidationError("This file does not contain a project.");
  }

  if (typeof data.title !== "string" || typeof data.introduction !== "string") {
    throw new ProjectValidationError(
      "This file is missing required project fields (title, introduction)."
    );
  }

  const now = new Date().toISOString();
  const mode: Mode = data.mode === "graduation" ? "graduation" : "small";

  const project: Project = {
    schemaVersion: typeof data.schemaVersion === "number" ? data.schemaVersion : SCHEMA_VERSION,
    sourceApp: typeof data.sourceApp === "string" ? data.sourceApp : SOURCE_APP,
    mode,
    title: data.title,
    introduction: data.introduction,
    specialInterest: typeof data.specialInterest === "string" ? data.specialInterest : "",
    hypothesis: typeof data.hypothesis === "string" ? data.hypothesis : "",
    aiUnderstanding: data.aiUnderstanding ?? null,
    // Note: questionnaire is passed through raw here — legacy (pre-bilingual)
    // shapes are migrated by the caller via migrateLegacyQuestionnaire(),
    // which lives in lib/questionnaire.ts to avoid a circular import.
    questionnaire: data.questionnaire ?? null,
    chatHistory: Array.isArray(data.chatHistory) ? data.chatHistory : [],
    notes: typeof data.notes === "string" ? data.notes : "",
    metadata: typeof data.metadata === "object" && data.metadata ? data.metadata : {},
    createdAt: typeof data.createdAt === "string" ? data.createdAt : now,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : now,
  };

  return project;
}
