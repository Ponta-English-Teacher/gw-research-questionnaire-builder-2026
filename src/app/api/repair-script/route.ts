import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI, stripFences } from "@/lib/openai";
import { validateAndRepairScript } from "@/lib/scriptValidator";

// ---------------------------------------------------------------------------
// Second, independent recovery workflow, additive to the existing
// Generate Script → Copy flow (which is untouched): Generate Script →
// Copy Script → Repair Script. The student pastes the Apps Script error
// message and/or the (possibly hand-edited) script; the AI diagnoses the
// problem, explains it briefly, and returns a corrected script, which is
// then run through the same lightweight deterministic validator used by
// /api/generate-script before being shown.
// ---------------------------------------------------------------------------

interface RepairBody {
  title?: string;
  errorMessage?: string;
  code?: string;
}

const REPAIR_SYSTEM_PROMPT = `You are debugging a Google Apps Script that was generated to build a Google Form from a research questionnaire. The student ran the script in script.google.com (or from Google Forms) and hit a problem.

You may be given:
- An error message the student copy-pasted from Apps Script.
- The current script.
- Both.

Your job:
1. Identify the actual problem (syntax error, invalid Apps Script API usage, malformed .setChoices() array, unbalanced braces/parentheses, duplicate variable, wrong method name, etc.).
2. Briefly explain what was wrong, in plain language, in 1-3 sentences. Do not repeat the raw stack trace back at the student, and do not lecture.
3. Produce the COMPLETE corrected script, ready to paste and run.

Rules:
- Do NOT change the questionnaire content: do not add, remove, or reword questions. Fix only the technical problem.
- If everything needed to diagnose and fix the problem is in the error message (and/or script) already given, fix it directly — do not ask the student clarifying questions.
- If only an error message was given and no script, do your best based on common Apps Script mistakes matching that error message, and say so plainly in the explanation (that you're inferring the general fix rather than seeing the exact broken line).
- Preserve the structure and conventions already used in the script: sequential item1, item2, ... variables; addMultipleChoiceItem/addCheckboxItem + createChoice for choices (never a raw string array); addScaleItem + setBounds + setLabels for linear scale; addTextItem for short answer; addParagraphTextItem for paragraph; addSectionHeaderItem for section headers; the script must start with "function myFunction() {" and end with a single closing "}".

Return a single JSON object with EXACTLY these keys:
{
  "explanation": "1-3 sentences, plain language, no jargon dump",
  "code": "the complete corrected script as a JSON string (use \\n for newlines), starting with function myFunction() {"
}

Output raw JSON only. No markdown, no commentary, no code fences anywhere in the response.`;

function buildUserPrompt(body: RepairBody): string {
  const parts: string[] = [];
  if (body.title) parts.push(`Form title: ${body.title}`);
  if (body.errorMessage?.trim()) parts.push(`Error message from Apps Script:\n${body.errorMessage.trim()}`);
  if (body.code?.trim()) parts.push(`Current script:\n${body.code.trim()}`);
  parts.push("Diagnose and fix this now.");
  return parts.join("\n\n");
}

function mockRepair(body: RepairBody): { explanation: string; code: string } {
  const code = body.code?.trim() || "function myFunction() {\n  // No script was provided to repair.\n}";
  return {
    explanation:
      "No AI key is configured in this environment, so this is a placeholder response. The script below is unchanged except for the automatic lightweight checks.",
    code,
  };
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as RepairBody;
    const title = String(body?.title || "Research Questionnaire").trim();
    const errorMessage = String(body?.errorMessage || "").trim();
    const code = String(body?.code || "").trim();

    if (!errorMessage && !code) {
      return NextResponse.json(
        { ok: false, error: "Paste an Apps Script error message or the script to repair (or both)." },
        { status: 400 }
      );
    }

    let explanation: string;
    let fixedCode: string;

    if (!API_KEY) {
      const mock = mockRepair({ title, errorMessage, code });
      explanation = mock.explanation;
      fixedCode = mock.code;
    } else {
      const raw = await callOpenAI(
        [
          { role: "system", content: REPAIR_SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt({ title, errorMessage, code }) },
        ],
        { temperature: 0.2, json: true }
      );

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("AI returned an unreadable response. Please try again.");
      }

      explanation = String(parsed.explanation || "").trim();
      fixedCode = stripFences(String(parsed.code || code || ""));
    }

    const checked = validateAndRepairScript(fixedCode);

    return NextResponse.json({
      ok: true,
      explanation,
      code: checked.code,
      validation: { issues: checked.issues },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
