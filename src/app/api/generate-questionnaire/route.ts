import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI } from "@/lib/openai";
import { makeQuestion, makeSection } from "@/lib/project";
import { coerceQuestionnaire } from "@/lib/questionnaire";
import { AIUnderstanding, Mode } from "@/types/project";

interface GenerateBody {
  title?: string;
  introduction?: string;
  specialInterest?: string;
  hypothesis?: string;
  mode?: Mode;
  understanding?: AIUnderstanding;
}

const SYSTEM_PROMPT = `You build complete, professional research questionnaires for students, ready to hand to a supervisor. You are NOT teaching survey methodology — never explain your choices, never lecture, just produce a well-built instrument.

Return a single JSON object with EXACTLY these keys:

{
  "greeting": "short, warm opening line(s) for respondents",
  "researchExplanation": "2-4 sentences explaining the study to a respondent, in plain language, based on the research purpose",
  "informedConsent": "a short informed-consent passage: participation is voluntary, responses are anonymous/confidential, approximate time, contact note",
  "participantProfile": { "title": "Participant Profile", "questions": [ /* categorical/demographic questions relevant to the target participants — age range, gender, year/grade, or other screening fields ONLY if relevant. Prefer multipleChoice. */ ] },
  "sections": [ { "title": "short topic section name", "questions": [ /* questions for this section */ ] } ],
  "finalComments": null OR { "title": "Final Comments", "questions": [ /* one open-ended paragraph question inviting any additional thoughts */ ] },
  "thankYou": "short closing thank-you message"
}

Each question object must look like:
{ "text": "...", "type": "multipleChoice"|"checkbox"|"linearScale"|"shortAnswer"|"paragraph", "options": ["..."] (only for multipleChoice/checkbox), "scale": {"min":1,"max":5,"minLabel":"...","maxLabel":"..."} (only for linearScale), "required": true|false }

CRITICAL RULES:
- Do NOT impose an arbitrary question count. The number of sections and questions must depend entirely on the research purpose, target participants, important concepts, special focus, and hypothesis given to you.
- Every "important concept" you were given must be measured by at least one question somewhere in the sections.
- In "graduation" mode: build as many sections and questions as are reasonably necessary to thoroughly cover every important concept and suggested section — do not artificially limit yourself, and do not pad with filler questions either. A thorough graduation-level questionnaire commonly has several sections and can easily exceed 20-30 questions if the research genuinely calls for it.
- In "small" mode: keep it focused and quick to complete — cover the important concepts efficiently without unnecessary sections or redundant questions.
- Only include "finalComments" when an open-ended catch-all question would genuinely add value (e.g. exploratory or graduation-level studies); use null for a quick small survey when it isn't needed.
- Use "linearScale" for agreement/frequency/attitude items (Likert-style), "multipleChoice" for single-choice categorical items, "checkbox" for select-all-that-apply, "shortAnswer" for brief factual/numeric answers, "paragraph" for open-ended reflection.
- Section titles must be concrete and topic-based (e.g. "Sleep Habits", "Academic Impact"), never generic ("Section 1").
- Output raw JSON only. No markdown, no commentary, no code fences.`;

function buildUserPrompt(body: GenerateBody): string {
  const u = body.understanding;
  const parts = [
    `Mode: ${body.mode === "graduation" ? "Graduation research project (thorough, no fixed limit)" : "Small classroom survey (focused, quick)"}`,
    `Research Title: ${body.title || "(untitled)"}`,
    `Research Introduction:\n${body.introduction || "(none)"}`,
  ];
  if (body.specialInterest?.trim()) parts.push(`Special interest: ${body.specialInterest.trim()}`);
  if (body.hypothesis?.trim()) parts.push(`Hypothesis: ${body.hypothesis.trim()}`);
  if (u) {
    parts.push(`Confirmed research purpose: ${u.purpose}`);
    parts.push(`Confirmed target participants: ${u.targetParticipants}`);
    parts.push(`Confirmed important concepts: ${u.importantConcepts.join(", ")}`);
    if (u.suggestedSections?.length) {
      parts.push(`Confirmed suggested sections: ${u.suggestedSections.join(", ")}`);
    }
  }
  parts.push("Build the complete questionnaire JSON now.");
  return parts.join("\n\n");
}

function mockQuestionnaire(body: GenerateBody) {
  const isGrad = body.mode === "graduation";
  const u = body.understanding;
  const concepts = u?.suggestedSections?.length ? u.suggestedSections : u?.importantConcepts?.length ? u.importantConcepts : ["Current Experience", "Attitudes"];

  const profile = makeSection("Participant Profile", [
    makeQuestion({ text: "What is your age range?", type: "multipleChoice", options: ["Under 18", "18-22", "23-29", "30+"] }),
    makeQuestion({ text: "What is your gender?", type: "multipleChoice", options: ["Female", "Male", "Prefer not to say", "Other"] }),
    makeQuestion({ text: "What year of study are you in?", type: "multipleChoice", options: ["1st year", "2nd year", "3rd year", "4th year", "Other"] }),
  ]);

  const perSection = isGrad ? 4 : 2;
  const sections = concepts.map((name) =>
    makeSection(
      name,
      Array.from({ length: perSection }).map((_, i) =>
        i % 2 === 0
          ? makeQuestion({
              text: `To what extent do you agree: my experience with ${name.toLowerCase()} is positive? (item ${i + 1})`,
              type: "linearScale",
              scale: { min: 1, max: 5, minLabel: "Strongly disagree", maxLabel: "Strongly agree" },
            })
          : makeQuestion({
              text: `Briefly describe your experience related to ${name.toLowerCase()}. (item ${i + 1})`,
              type: "shortAnswer",
            })
      )
    )
  );

  return {
    greeting: { en: `Thank you for taking part in this study on "${body.title || "this topic"}".`, ja: "", jaManuallyEdited: false },
    researchExplanation: {
      en:
        u?.purpose ||
        `This questionnaire is part of a research project investigating ${body.title || "the topic described in the introduction"}.`,
      ja: "",
      jaManuallyEdited: false,
    },
    informedConsent: {
      en: "Your participation is voluntary and all responses are anonymous. The survey should take a few minutes to complete. You may stop at any time without penalty.",
      ja: "",
      jaManuallyEdited: false,
    },
    participantProfile: profile,
    sections,
    finalComments: isGrad
      ? makeSection("Final Comments", [makeQuestion({ text: "Is there anything else you'd like to share about this topic?", type: "paragraph" })])
      : null,
    thankYou: { en: "Thank you very much for your time and honest responses!", ja: "", jaManuallyEdited: false },
    translation: { status: "none" as const, enSnapshot: "" },
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GenerateBody;

    if (!body.title?.trim() || !body.introduction?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Research Title and Research Introduction are required." },
        { status: 400 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json({ ok: true, questionnaire: mockQuestionnaire(body) });
    }

    const raw = await callOpenAI(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
      { temperature: 0.5, json: true }
    );

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI returned an unreadable response. Please try again.");
    }

    const questionnaire = coerceQuestionnaire(parsed);
    return NextResponse.json({ ok: true, questionnaire });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
