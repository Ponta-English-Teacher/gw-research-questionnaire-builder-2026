import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI } from "@/lib/openai";
import { renderJapaneseStyleGuide } from "@/lib/japaneseStyleGuide";
import { JapaneseFieldRef, listJapaneseFields } from "@/lib/questionnaire";
import { Mode, Questionnaire } from "@/types/project";

// ---------------------------------------------------------------------------
// "Improve Japanese Wording" — a dedicated review workflow, not just a
// bigger translation prompt. Reviews the EXISTING Japanese content only;
// the English side is never read as something to change, only as ground
// truth for what each item is supposed to mean.
//
// Two internal AI passes, run server-side in a single request:
//   Pass 1 — identify the construct/intent each field is actually measuring.
//   Pass 2 — rewrite naturally, independent of English word order, using
//            Pass 1's understanding plus the shared style guide.
// The client only ever sees the final review summary (current vs suggested
// + reason per changed field) and decides whether to apply it — nothing is
// written until the student clicks "Apply Japanese Improvements".
// ---------------------------------------------------------------------------

interface ReviewBody {
  title?: string;
  mode?: Mode;
  questionnaire?: Questionnaire | null;
  includeManualEdits?: boolean;
}

interface Pass1Result {
  id: string;
  meaning: string;
}

export interface JapaneseReviewResultItem {
  id: string;
  label: string;
  currentJa: string;
  suggestedJa: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Pass 1 — meaning extraction
// ---------------------------------------------------------------------------

const MEANING_SYSTEM_PROMPT = `You are preparing to review a Japanese research questionnaire for naturalness. Before rewriting anything, identify what each item is actually trying to measure or communicate — its underlying construct or intent — using the English original as ground truth (the English tells you the intent; you are not translating the English sentence, just extracting its purpose).

For each field you are given (id, English, current Japanese, and — for questions — the response type), write ONE short phrase (not a sentence) naming what it measures or communicates. Examples: "comfort/anxiety in first-meeting situations", "willingness to start a conversation with a stranger", "consent to voluntary, anonymous participation", "polite opening greeting".

Return a single JSON object: { "fields": [ { "id": "...", "meaning": "short phrase" }, ... ] }, one entry per field given, same ids, same order.

Output raw JSON only. No markdown, no commentary, no code fences.`;

function buildMeaningUserPrompt(fields: JapaneseFieldRef[]): string {
  const payload = fields.map((f) => ({
    id: f.id,
    label: f.label,
    en: f.en,
    ja: f.ja,
    responseType: f.questionType,
    scale: f.scale,
  }));
  return `Fields:\n${JSON.stringify(payload, null, 2)}\n\nIdentify the intended meaning/construct of each field now.`;
}

// ---------------------------------------------------------------------------
// Pass 2 — natural rewrite
// ---------------------------------------------------------------------------

const REWRITE_SYSTEM_PROMPT = `You are reviewing the Japanese wording of a research questionnaire so it reads as though it were originally written by a Japanese researcher for Japanese university students — not translated from English.

You are given, for each field: its id, the English original (context only — do not translate it), the CURRENT Japanese text, the construct/intent it measures (from an earlier analysis pass), and — for questions — the response type and scale (if a linear scale).

Check each field for:
- Natural Japanese questionnaire wording vs. anything that reads as a literal translation.
- Excessive use of abstract, academic-sounding terms where a concrete everyday word would read more naturally.
- Literal English sentence structure (word order, clause structure) carried over into the Japanese.
- Unnatural use of words like 社会的, 相互作用, ダイナミクス, 快適, 特性, and similar stiff, translated-feeling vocabulary.
- Whether the Japanese question wording matches its response type — e.g. a linearScale question should read as something a respondent rates on a gradient ("どの程度〜と感じますか", "〜くらい当てはまりますか"), not as a flat yes/no statement.
- Whether the intended meaning (given to you as "meaning") is still fully preserved.

${renderJapaneseStyleGuide()}

For each field, decide:
- If the current Japanese already reads naturally and needs no change, return it with "changed": false and "suggested" equal to the current text.
- If it should be improved, rewrite it as natural Japanese questionnaire wording, independent of the English sentence structure, preserving the meaning/construct given to you. Set "changed": true, and give a SHORT reason IN JAPANESE (one sentence) explaining what was unnatural — in the style of: "「快適に感じる」はこの文脈ではやや不自然です。"

Do not use the preferred-expressions list mechanically — choose wording based on what the specific field measures.

Return a single JSON object: { "fields": [ { "id": "...", "suggested": "...", "reason": "...", "changed": true|false }, ... ] }, one entry per field given, same ids, same order. "reason" may be an empty string when "changed" is false.

Output raw JSON only. No markdown, no commentary, no code fences.`;

function buildRewriteUserPrompt(fields: JapaneseFieldRef[], meanings: Pass1Result[]): string {
  const meaningById = new Map(meanings.map((m) => [m.id, m.meaning]));
  const payload = fields.map((f) => ({
    id: f.id,
    label: f.label,
    en: f.en,
    ja: f.ja,
    meaning: meaningById.get(f.id) || "",
    responseType: f.questionType,
    scale: f.scale,
  }));
  return `Fields:\n${JSON.stringify(payload, null, 2)}\n\nReview each field now and return the JSON result.`;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as ReviewBody;
    const questionnaire = body.questionnaire ?? null;

    if (!questionnaire) {
      return NextResponse.json({ ok: false, error: "No questionnaire available to review." }, { status: 400 });
    }
    if (questionnaire.translation.status === "none") {
      return NextResponse.json({ ok: false, error: "Generate a Japanese version first." }, { status: 400 });
    }

    const allFields = listJapaneseFields(questionnaire);
    const skippedManualEdits = body.includeManualEdits ? 0 : allFields.filter((f) => f.jaManuallyEdited).length;
    const fields = body.includeManualEdits ? allFields : allFields.filter((f) => !f.jaManuallyEdited);

    if (fields.length === 0) {
      return NextResponse.json({
        ok: true,
        reviewedCount: 0,
        skippedManualEdits,
        suggestions: [] as JapaneseReviewResultItem[],
      });
    }

    if (!API_KEY) {
      return NextResponse.json({
        ok: true,
        reviewedCount: fields.length,
        skippedManualEdits,
        suggestions: [] as JapaneseReviewResultItem[],
        note: "No AI key is configured in this environment, so there is nothing to review here.",
      });
    }

    // Pass 1 — meaning
    const meaningRaw = await callOpenAI(
      [
        { role: "system", content: MEANING_SYSTEM_PROMPT },
        { role: "user", content: buildMeaningUserPrompt(fields) },
      ],
      { temperature: 0.2, json: true }
    );
    let meanings: Pass1Result[] = [];
    try {
      const parsed = JSON.parse(meaningRaw);
      meanings = Array.isArray(parsed?.fields) ? parsed.fields : [];
    } catch {
      throw new Error("AI returned an unreadable response while analyzing the questionnaire. Please try again.");
    }

    // Pass 2 — natural rewrite
    const rewriteRaw = await callOpenAI(
      [
        { role: "system", content: REWRITE_SYSTEM_PROMPT },
        { role: "user", content: buildRewriteUserPrompt(fields, meanings) },
      ],
      { temperature: 0.4, json: true }
    );
    let rewrites: any[] = [];
    try {
      const parsed = JSON.parse(rewriteRaw);
      rewrites = Array.isArray(parsed?.fields) ? parsed.fields : [];
    } catch {
      throw new Error("AI returned an unreadable response while rewriting the questionnaire. Please try again.");
    }

    const fieldById = new Map(fields.map((f) => [f.id, f]));
    const suggestions: JapaneseReviewResultItem[] = [];
    for (const r of rewrites) {
      const field = fieldById.get(r?.id);
      if (!field) continue;
      const suggested = String(r?.suggested || "").trim();
      const changed = Boolean(r?.changed) && suggested && suggested !== field.ja;
      if (!changed) continue;
      suggestions.push({
        id: field.id,
        label: field.label,
        currentJa: field.ja,
        suggestedJa: suggested,
        reason: String(r?.reason || "").trim(),
      });
    }

    return NextResponse.json({
      ok: true,
      reviewedCount: fields.length,
      skippedManualEdits,
      suggestions,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
