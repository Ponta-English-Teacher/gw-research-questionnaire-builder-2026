import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI } from "@/lib/openai";
import { renderJapaneseStyleGuide } from "@/lib/japaneseStyleGuide";
import { ResolvedQuestionnaire, ResolvedSection, resolveQuestionnaireLanguage } from "@/lib/questionnaire";
import { Questionnaire } from "@/types/project";

// ---------------------------------------------------------------------------
// Powers both "Generate Japanese Version" and "Update Translation" — both
// buttons call this route the same way: translate the current English
// content into Japanese, in full. (There is no partial/incremental
// re-translation in this phase — see DESIGN.md for future refinement.)
// ---------------------------------------------------------------------------

const TRANSLATE_SYSTEM_PROMPT = `You are an experienced Japanese university researcher writing a questionnaire for your own students. You are given the English version of a questionnaire another researcher wrote, and your job is to produce the Japanese version of that SAME questionnaire.

Do NOT think "translate this English." Instead think: "rewrite this questionnaire naturally for Japanese university students, in the way I would actually write it myself, while preserving the research intent." The English text tells you what needs to be asked and why — it is not a sentence structure to reproduce in Japanese.

Concretely:
- Avoid literal English sentence structures. If a natural Japanese question would be phrased completely differently, phrase it differently.
- Prefer expressions commonly found in real Japanese questionnaires over dictionary-accurate but stiff/academic-sounding translations.
- Preserve MEANING and research intent, not wording. Every item must still ask about the same underlying thing, but the words and phrasing should read as if a Japanese researcher wrote it from scratch.
- It is fine — expected — for Japanese sentence length, structure, and word choice to differ noticeably from the English original, as long as the intent is unchanged.

${renderJapaneseStyleGuide()}

Additional rules:
- Greeting and thank-you message: warm, polite Japanese (です/ます form).
- Informed consent: clear, formal Japanese appropriate for a consent notice.
- Do not add, remove, reorder, or reinterpret content — every English item must have exactly one corresponding Japanese item, in the same order. You are free to rephrase; you are not free to change what is being asked.
- Keep well-known terms (e.g. "MBTI") as commonly written in Japanese rather than inventing a literal translation.
- Every "questions" array in your output must contain PLAIN STRINGS ONLY — just the rewritten question text, one per question, in the SAME ORDER and with the SAME LENGTH as given. Do NOT return objects with "text"/"type"/"options"/etc. — only the type/options/etc. from the English input are already fixed and unchanged; you are producing Japanese text, nothing else.

Return a single JSON object in EXACTLY this shape:

{
  "greeting": "...",
  "researchExplanation": "...",
  "informedConsent": "...",
  "participantProfile": { "title": "...", "questions": ["...", "..."] },
  "sections": [ { "title": "...", "questions": ["...", "..."] } ],
  "finalComments": null OR { "title": "...", "questions": ["..."] },
  "thankYou": "..."
}

Output raw JSON only. No markdown, no commentary, no code fences.`;

function buildUserPrompt(resolved: ResolvedQuestionnaire): string {
  return `Here is the English version of the questionnaire:\n\n${JSON.stringify(
    resolved,
    null,
    2
  )}\n\nWrite the natural Japanese version now, matching the exact structure and array lengths given above.`;
}

function mockTranslate(resolved: ResolvedQuestionnaire) {
  const ph = (s: string) => (s ? `${s}(仮の日本語訳)` : "");
  const sectionPh = (s: ResolvedSection) => ({ title: ph(s.title), questions: s.questions.map((q) => ph(q.text)) });
  return {
    greeting: ph(resolved.greeting),
    researchExplanation: ph(resolved.researchExplanation),
    informedConsent: ph(resolved.informedConsent),
    participantProfile: sectionPh(resolved.participantProfile),
    sections: resolved.sections.map(sectionPh),
    finalComments: resolved.finalComments ? sectionPh(resolved.finalComments) : null,
    thankYou: ph(resolved.thankYou),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const questionnaire: Questionnaire | null = body?.questionnaire ?? null;

    if (!questionnaire) {
      return NextResponse.json({ ok: false, error: "No questionnaire available to translate." }, { status: 400 });
    }

    const resolvedEnglish = resolveQuestionnaireLanguage(questionnaire, "english");

    if (!API_KEY) {
      return NextResponse.json({ ok: true, translation: mockTranslate(resolvedEnglish) });
    }

    const raw = await callOpenAI(
      [
        { role: "system", content: TRANSLATE_SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(resolvedEnglish) },
      ],
      { temperature: 0.4, json: true }
    );

    let translation: any;
    try {
      translation = JSON.parse(raw);
    } catch {
      throw new Error("AI returned an unreadable response. Please try again.");
    }

    return NextResponse.json({ ok: true, translation });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
