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

export function serializeProject(project: Project): string {
  const toSave: Project = {
    ...project,
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
