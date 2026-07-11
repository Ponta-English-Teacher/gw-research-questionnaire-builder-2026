import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI, ChatTurn } from "@/lib/openai";
import { renderJapaneseStyleGuide } from "@/lib/japaneseStyleGuide";
import {
  coerceQuestionnaire,
  listJapaneseFields,
  questionnaireToPromptJSON,
  restoreLockedJapaneseFields,
  summarizeQuestionnaire,
} from "@/lib/questionnaire";
import { AIUnderstanding, Mode, Questionnaire } from "@/types/project";

// ---------------------------------------------------------------------------
// This route powers the Research Partner's "Update Questionnaire" action.
// It has two stages, always called in order by the client:
//
//   stage "plan"  — read the whole conversation + research context + current
//                   questionnaire, and return ONLY a short checklist of what
//                   would change. Nothing is modified yet.
//   stage "apply" — after the student explicitly confirms the plan, actually
//                   produce the REVISED questionnaire (not a fresh
//                   generation): preserve everything not discussed, apply
//                   only what the conversation called for.
// ---------------------------------------------------------------------------

interface UpdateBody {
  stage: "plan" | "apply";
  title?: string;
  introduction?: string;
  specialInterest?: string;
  hypothesis?: string;
  mode?: Mode;
  understanding?: AIUnderstanding | null;
  questionnaire?: Questionnaire | null;
  chatHistory?: { role: "user" | "assistant"; content: string }[];
}

function contextLines(body: UpdateBody): string[] {
  const lines = [`Research Title: ${body.title || "(untitled)"}`];
  lines.push(`Mode: ${body.mode === "graduation" ? "Graduation research project" : "Small classroom survey"}`);
  if (body.introduction?.trim()) lines.push(`Research Introduction:\n${body.introduction.trim()}`);
  if (body.specialInterest?.trim()) lines.push(`Special interest: ${body.specialInterest.trim()}`);
  if (body.hypothesis?.trim()) lines.push(`Hypothesis: ${body.hypothesis.trim()}`);
  if (body.understanding) {
    lines.push(
      `Research purpose: ${body.understanding.purpose}\nTarget participants: ${body.understanding.targetParticipants}\nImportant concepts: ${body.understanding.importantConcepts.join(", ")}`
    );
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Stage 1 — Plan
// ---------------------------------------------------------------------------

const PLAN_SYSTEM_PROMPT = `You are the student's research partner. You are looking back over your whole conversation together about their questionnaire, plus the research context and the current questionnaire, to prepare for an update.

Your ONLY job right now is to summarize, as a short checklist, exactly what you would change if the student asked you to update the questionnaire based on everything discussed so far. Do NOT rewrite anything. Do NOT output a questionnaire or any JSON — plain formatted text only, nothing has been changed yet.

Format exactly like this:
- One short opening line in your own words (e.g. "Based on our discussion, I will:").
- Then a checklist, one line per item, each starting with "✓ " followed by a short, concrete action (e.g. "✓ Add a question about sibling relationships to the Family section", "✓ Rewrite Question 8 for clarity", "✓ Split Section 2 into two focused sections", "✓ Add a question about MBTI personality type").
- End with one short line making clear nothing has changed yet and the student can confirm to apply it.

Rules:
- Base the checklist ONLY on what was actually discussed in the conversation (and any clear, concrete gaps against the stated research purpose/important concepts). Do not invent unrelated changes.
- If the conversation hasn't asked for any changes yet, say so plainly (e.g. "We haven't discussed any specific changes yet.") and suggest the student share what they'd like to change, rather than inventing a fake plan.
- If the conversation contains an obvious typo or misnomer (e.g. "MDTI" clearly meaning "MBTI", or "blood pressure" clearly meaning "blood type" in a profile-question context), silently interpret it correctly in your checklist — do not call out or question the correction.
- Keep it short and concrete — a handful of items, not an essay.
- Never use methodology jargon. Never lecture.`;

function buildPlanUserPrompt(body: UpdateBody): string {
  const lines = contextLines(body);
  lines.push(`Current questionnaire:\n${summarizeQuestionnaire(body.questionnaire)}`);
  lines.push("Summarize the update checklist now, based on our conversation above.");
  return lines.join("\n\n");
}

function mockPlan(body: UpdateBody): string {
  if (!body.chatHistory?.length) {
    return `We haven't discussed any specific changes yet.

Tell me what you'd like to add, remove, or reword, and I'll summarize a plan here before anything changes.`;
  }
  return `Based on our discussion, I will:

✓ Review the wording of the questions we discussed for clarity
✓ Add or adjust questions based on your feedback
✓ Leave everything else exactly as it is

Nothing has been changed yet — click **Confirm & Apply Update** below to apply these changes. (No AI key is configured in this environment, so this is a placeholder plan.)`;
}

// ---------------------------------------------------------------------------
// Stage 2 — Apply (revision, not regeneration)
// ---------------------------------------------------------------------------

function buildApplySystemPrompt(bilingual: boolean): string {
  const textFieldNote = bilingual
    ? `This questionnaire already has a Japanese version, so every text field below must be an {"en": "...", "ja": "..."} object — revise BOTH languages together. Do not translate the English into Japanese — write the Japanese the way a Japanese university researcher would naturally phrase it, preserving meaning and intent rather than sentence structure or wording. Keep the two languages saying the same thing.

${renderJapaneseStyleGuide()}`
    : `This questionnaire does not have a Japanese version yet, so every text field below is a plain English string — English only.`;

  const shape = bilingual
    ? `{
  "greeting": {"en": "...", "ja": "..."},
  "researchExplanation": {"en": "...", "ja": "..."},
  "informedConsent": {"en": "...", "ja": "..."},
  "participantProfile": { "title": {"en": "...", "ja": "..."}, "questions": [ /* question objects */ ] },
  "sections": [ { "title": {"en": "...", "ja": "..."}, "questions": [ /* question objects */ ] } ],
  "finalComments": null OR { "title": {"en": "...", "ja": "..."}, "questions": [ /* question objects */ ] },
  "thankYou": {"en": "...", "ja": "..."}
}`
    : `{
  "greeting": "...",
  "researchExplanation": "...",
  "informedConsent": "...",
  "participantProfile": { "title": "Participant Profile", "questions": [ /* question objects */ ] },
  "sections": [ { "title": "...", "questions": [ /* question objects */ ] } ],
  "finalComments": null OR { "title": "Final Comments", "questions": [ /* question objects */ ] },
  "thankYou": "..."
}`;

  const questionTextField = bilingual ? `{"en": "...", "ja": "..."}` : `"..."`;

  return `You are revising an EXISTING research questionnaire together with the student, based on your conversation together. This is a REVISION of the questionnaire you were given — NOT a fresh generation. Start from the current questionnaire and change only what the conversation clearly called for; preserve everything else exactly (wording, section names, question order) unless there was a reason discussed to change it.

${textFieldNote}

Return a single JSON object in EXACTLY this shape:

${shape}

Each question object: { "text": ${questionTextField}, "type": "multipleChoice"|"checkbox"|"linearScale"|"shortAnswer"|"paragraph", "options": ["..."] (only for multipleChoice/checkbox, English only — do not translate options), "scale": {"min":1,"max":5,"minLabel":"...","maxLabel":"..."} (only for linearScale, English only), "required": true|false }

CRITICAL RULES:
- Preserve existing sections, questions, and wording exactly except where the conversation clearly calls for an addition, deletion, rewrite, split, merge, or reorder.
- Apply every concrete change that was agreed or clearly requested in the conversation.
- Do not silently drop content that wasn't discussed.
- Do not impose a fixed question count — size depends on the research objective and the changes discussed.
- If the conversation contains an obvious typo or misnomer, silently interpret it correctly — do not comment on the correction.
- Output raw JSON only. No markdown, no commentary, no code fences.`;
}

function buildApplyUserPrompt(body: UpdateBody, bilingual: boolean): string {
  const lines = contextLines(body);
  if (body.questionnaire) {
    lines.push(`Current questionnaire (JSON — revise this, do not start over):\n${questionnaireToPromptJSON(body.questionnaire, bilingual)}`);

    if (bilingual) {
      const locked = listJapaneseFields(body.questionnaire).filter((f) => f.jaManuallyEdited);
      if (locked.length > 0) {
        const lockedList = locked.map((f) => `- ${f.label}: "${f.ja}"`).join("\n");
        lines.push(
          `IMPORTANT — the student has manually hand-edited the Japanese text of these fields. You MUST keep their Japanese exactly as written, character-for-character, even if you change the English for that item:\n${lockedList}`
        );
      }
    }
  }
  lines.push("Apply the changes discussed in our conversation and produce the complete, revised questionnaire JSON now.");
  return lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as UpdateBody;

    if (!body.questionnaire) {
      return NextResponse.json({ ok: false, error: "No questionnaire available to update." }, { status: 400 });
    }
    if (body.stage !== "plan" && body.stage !== "apply") {
      return NextResponse.json({ ok: false, error: "Invalid stage." }, { status: 400 });
    }

    const history: ChatTurn[] = (body.chatHistory || []).map((h) => ({ role: h.role, content: h.content }));

    if (body.stage === "plan") {
      if (!API_KEY) {
        return NextResponse.json({ ok: true, plan: mockPlan(body) });
      }
      const plan = await callOpenAI(
        [
          { role: "system", content: PLAN_SYSTEM_PROMPT },
          ...history,
          { role: "user", content: buildPlanUserPrompt(body) },
        ],
        { temperature: 0.5 }
      );
      return NextResponse.json({ ok: true, plan });
    }

    // stage === "apply"
    const bilingual = body.questionnaire.translation.status !== "none";

    if (!API_KEY) {
      return NextResponse.json({ ok: true, questionnaire: body.questionnaire, unchanged: true });
    }
    const raw = await callOpenAI(
      [
        { role: "system", content: buildApplySystemPrompt(bilingual) },
        ...history,
        { role: "user", content: buildApplyUserPrompt(body, bilingual) },
      ],
      { temperature: 0.4, json: true }
    );

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI returned an unreadable response. Please try again.");
    }

    let questionnaire = coerceQuestionnaire(parsed, { bilingual });
    if (bilingual) {
      // Defensive safety net in case the AI didn't fully honor the locked-field instruction above.
      questionnaire = restoreLockedJapaneseFields(questionnaire, body.questionnaire);
    }
    return NextResponse.json({ ok: true, questionnaire });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
