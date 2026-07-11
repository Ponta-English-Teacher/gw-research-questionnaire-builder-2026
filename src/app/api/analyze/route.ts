import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI } from "@/lib/openai";
import { AIUnderstanding, Mode } from "@/types/project";

interface AnalyzeBody {
  title?: string;
  introduction?: string;
  specialInterest?: string;
  hypothesis?: string;
  mode?: Mode;
}

const SYSTEM_PROMPT = `You are a fast, practical research assistant helping a student turn a research introduction into a questionnaire. You are NOT a methodology instructor — never explain survey theory, never lecture, never grade the student's thinking. Your only job is to read the introduction and reflect back a short, accurate, practical understanding of the study so the student can confirm it before you build a questionnaire.

Read the student's introduction (and optional focus/hypothesis) and respond with a single JSON object with EXACTLY these keys:

{
  "purpose": "1-2 plain sentences: what this research is trying to find out",
  "targetParticipants": "1 sentence: who should realistically answer this questionnaire",
  "importantConcepts": ["short phrase", "short phrase", "..."],
  "specialFocus": "1 sentence restating the student's stated special interest in your own words, or an empty string if none was given",
  "hypothesis": "restate the student's hypothesis in one clear sentence, or an empty string if none was given",
  "suggestedSections": ["short section name", "short section name", "..."]
}

Rules:
- importantConcepts should be the handful of things the questionnaire actually needs to measure (3-6 items for a small survey, more for a graduation-level study if the introduction genuinely covers more ground).
- suggestedSections are short, concrete topic-based section names (not generic labels like "Section 1") that will guide the questionnaire structure. Do not include "Participant Profile" or "Informed Consent" — those are handled separately.
- Base suggestedSections count on how much ground the introduction actually covers — a "small survey" mode should suggest fewer, focused sections (roughly 2-4); a "graduation" mode should suggest as many as the research genuinely needs, with no upper limit imposed by you.
- Never invent participants, concepts, or focus that aren't reasonably implied by the text.
- Output raw JSON only. No markdown, no commentary, no code fences.`;

function buildUserPrompt(body: AnalyzeBody): string {
  const parts = [`Mode: ${body.mode === "graduation" ? "Graduation research project" : "Small classroom survey"}`];
  parts.push(`Research Title: ${body.title || "(untitled)"}`);
  parts.push(`Research Introduction:\n${body.introduction || "(none provided)"}`);
  if (body.specialInterest?.trim()) {
    parts.push(`Student's special interest: ${body.specialInterest.trim()}`);
  }
  if (body.hypothesis?.trim()) {
    parts.push(`Student's hypothesis: ${body.hypothesis.trim()}`);
  }
  parts.push("Analyze the above and return the JSON object now.");
  return parts.join("\n\n");
}

function mockUnderstanding(body: AnalyzeBody): AIUnderstanding {
  const title = body.title || "this topic";
  const isGrad = body.mode === "graduation";
  return {
    purpose: `This study explores ${title} based on the introduction provided, aiming to produce a questionnaire that captures the key factors described.`,
    targetParticipants: "Students or respondents matching the population described in the introduction.",
    importantConcepts: isGrad
      ? ["Background factors", "Current behavior/experience", "Perceived impact", "Attitudes/opinions", "Outcomes"]
      : ["Current behavior/experience", "Attitudes/opinions", "Outcomes"],
    specialFocus: body.specialInterest?.trim() || "",
    hypothesis: body.hypothesis?.trim() || "",
    suggestedSections: isGrad
      ? ["Background", "Current Experience", "Perceived Impact", "Attitudes", "Outcomes"]
      : ["Current Experience", "Attitudes"],
    approved: false,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as AnalyzeBody;

    if (!body.title?.trim() || !body.introduction?.trim()) {
      return NextResponse.json(
        { ok: false, error: "Research Title and Research Introduction are required." },
        { status: 400 }
      );
    }

    if (!API_KEY) {
      return NextResponse.json({ ok: true, understanding: mockUnderstanding(body) });
    }

    const raw = await callOpenAI(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(body) },
      ],
      { temperature: 0.4, json: true }
    );

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("AI returned an unreadable response. Please try again.");
    }

    const understanding: AIUnderstanding = {
      purpose: String(parsed.purpose || "").trim(),
      targetParticipants: String(parsed.targetParticipants || "").trim(),
      importantConcepts: Array.isArray(parsed.importantConcepts)
        ? parsed.importantConcepts.map((x: any) => String(x).trim()).filter(Boolean)
        : [],
      specialFocus: String(parsed.specialFocus || body.specialInterest || "").trim(),
      hypothesis: String(parsed.hypothesis || body.hypothesis || "").trim(),
      suggestedSections: Array.isArray(parsed.suggestedSections)
        ? parsed.suggestedSections.map((x: any) => String(x).trim()).filter(Boolean)
        : [],
      approved: false,
    };

    return NextResponse.json({ ok: true, understanding });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
