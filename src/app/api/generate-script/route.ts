import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI, stripFences } from "@/lib/openai";
import { ResolvedQuestion, ResolvedQuestionnaire, ResolvedSection, resolveQuestionnaireLanguage } from "@/lib/questionnaire";
import { validateAndRepairScript } from "@/lib/scriptValidator";
import { Language, Questionnaire, Section } from "@/types/project";

// ---------------------------------------------------------------------------
// This route converts an already-finalized, typed Questionnaire (see
// src/types/project.ts) into a paste-ready Google Apps Script. It preserves
// the original two-pass design from the previous version of this app:
//   Pass 1 — convert the questionnaire faithfully into Apps Script.
//   Pass 2 — fix syntax only, never content.
// The difference is the input: instead of guessing question types and
// merging two ambiguous prose sources, this route is fed the exact typed
// structure the student has already confirmed in the editor, so there is
// only ever one source of truth.
// ---------------------------------------------------------------------------

function onlySelected(section: Section): Section {
  return { ...section, questions: section.questions.filter((q) => q.selected) };
}

function selectedQuestionnaire(q: Questionnaire): Questionnaire {
  return {
    ...q,
    participantProfile: onlySelected(q.participantProfile),
    sections: q.sections.map(onlySelected),
    finalComments: q.finalComments ? onlySelected(q.finalComments) : null,
  };
}

function countQuestions(q: {
  participantProfile: { questions: unknown[] };
  sections: { questions: unknown[] }[];
  finalComments: { questions: unknown[] } | null;
}): number {
  return (
    q.participantProfile.questions.length +
    q.sections.reduce((sum, s) => sum + s.questions.length, 0) +
    (q.finalComments?.questions.length ?? 0)
  );
}

// ---------------------------------------------------------------------------
// PASS 1 — Conversion (not generation)
// ---------------------------------------------------------------------------

const GENERATION_SYSTEM = `You are a Google Apps Script CONVERTER for Google Forms.

You are converting an already-finalized, precisely typed questionnaire into Apps Script code. You are NOT designing a questionnaire and NOT a question creator. Every question you are given already has an explicit type — use it directly, do not re-infer it.

CRITICAL RULES — NEVER VIOLATE:
- Use ONLY the questions given in the input, in the order given. Never add a question that is not in the input. Never invent new questions or fill in gaps with example questions.
- Do not rewrite question meaning. Copy question text verbatim (minor punctuation cleanup only).
- The total number of form question items in the output (not counting section headers) MUST equal the total question count stated in the input. No more. No less.
- Use the given "required" flag exactly — call .setRequired() only when required is true.

OUTPUT RULES:
- Output ONLY raw JavaScript. No markdown. No backticks. No code fences. No explanatory text before or after the code.
- The output must begin with exactly: function myFunction() {
- The output must end with the final closing brace: }

FORM SETUP:
- var form = FormApp.create('<title>');
- form.setDescription('<the FORM DESCRIPTION text given to you, combining greeting + research explanation + informed consent>');
- form.setConfirmationMessage('<the CONFIRMATION MESSAGE text given to you>');

QUESTION-TYPE RULES (the input tells you exactly which type to use per question):

1. multipleChoice
   var item1 = form.addMultipleChoiceItem();
   item1.setTitle('Question text here');
   item1.setChoices([
     item1.createChoice('Option A'),
     item1.createChoice('Option B')
   ]);
   NEVER use .setChoices(['Option A', 'Option B']) — that is invalid Apps Script.

2. checkbox
   var item2 = form.addCheckboxItem();
   item2.setTitle('Question text here');
   item2.setChoices([
     item2.createChoice('Option A'),
     item2.createChoice('Option B')
   ]);

3. linearScale
   form.addScaleItem()
     .setTitle('Question text here')
     .setBounds(<min>, <max>)
     .setLabels('<minLabel>', '<maxLabel>');

4. shortAnswer
   form.addTextItem().setTitle('Question text here');

5. paragraph
   form.addParagraphTextItem().setTitle('Question text here');

SECTION RULES:
- Before each named group of questions (Participant Profile, each topic section, Final Comments), add:
  form.addSectionHeaderItem().setTitle('Section Name');
- Section headers do NOT count toward the question total.
- Number each item variable sequentially across all sections: item1, item2, item3, …

GENERAL RULES:
- Do not number the question titles — the form numbers them automatically.
- Do not add validation unless you are certain the Apps Script syntax is correct.`;

function questionLine(q: ResolvedQuestion, index: number): string {
  const parts = [`${index + 1}. [type=${q.type}]${q.required ? " [required]" : ""} ${q.text}`];
  if (q.options?.length) parts.push(`   options: ${q.options.join(" | ")}`);
  if (q.scale) parts.push(`   scale: ${q.scale.min}-${q.scale.max} ("${q.scale.minLabel || ""}" to "${q.scale.maxLabel || ""}")`);
  return parts.join("\n");
}

function sectionBlock(label: string, section: ResolvedSection, startIndex: number): { text: string; count: number } {
  if (!section.questions.length) return { text: "", count: 0 };
  const lines = [`SECTION: ${label} (${section.questions.length} questions)`];
  section.questions.forEach((q, i) => lines.push(questionLine(q, startIndex + i)));
  return { text: lines.join("\n"), count: section.questions.length };
}

function buildConversionPrompt(title: string, q: ResolvedQuestionnaire): string {
  const total = countQuestions(q);
  const blocks: string[] = [];
  let running = 0;

  blocks.push(
    `FORM DESCRIPTION (combine these three into one setDescription call, separated by blank lines):\n${q.greeting}\n\n${q.researchExplanation}\n\n${q.informedConsent}`
  );

  const profile = sectionBlock(q.participantProfile.title, q.participantProfile, running);
  if (profile.text) {
    blocks.push(profile.text);
    running += profile.count;
  }

  q.sections.forEach((s) => {
    const block = sectionBlock(s.title, s, running);
    if (block.text) {
      blocks.push(block.text);
      running += block.count;
    }
  });

  if (q.finalComments) {
    const block = sectionBlock(q.finalComments.title, q.finalComments, running);
    if (block.text) {
      blocks.push(block.text);
      running += block.count;
    }
  }

  blocks.push(`CONFIRMATION MESSAGE (use setConfirmationMessage):\n${q.thankYou}`);

  return `Form title: ${title}

Total question items required in output: ${total}

${blocks.join("\n\n")}

Convert the questionnaire above into the Google Apps Script function now.
Output only raw code, starting with function myFunction() {`;
}

// ---------------------------------------------------------------------------
// PASS 2 — Syntax validation only (no content changes)
// ---------------------------------------------------------------------------

const VALIDATION_SYSTEM = `You are a Google Apps Script syntax checker.

Your ONLY job is to fix Apps Script syntax errors in the code you receive.

YOU MUST NOT:
- Add new questions or any content not already in the code.
- Remove questions.
- Change question text (except fixing an obvious single-character typo or punctuation mark).
- Invent any content.

Fix ONLY these syntax issues:

1. MARKDOWN FENCES — remove any line starting with \`\`\` (with or without a language tag).
2. STRING-ARRAY CHOICES — replace any .setChoices(['...', '...']) pattern with the safe createChoice pattern:
   var itemN = form.addMultipleChoiceItem();
   itemN.setTitle('...');
   itemN.setChoices([
     itemN.createChoice('...'),
     itemN.createChoice('...')
   ]);
3. MISSING createChoice — every multiple-choice and checkbox item must use item.createChoice() inside setChoices([]).
4. FUNCTION WRAPPER — the code must start with exactly: function myFunction() {
5. CLOSING BRACE — the code must end with a single } on its own line.
6. STRAY TEXT — remove any explanatory sentences or text outside the function body.

Return ONLY the corrected raw JavaScript code.
No markdown. No backticks. No explanations. No code fences.`;

function buildValidationPrompt(code: string): string {
  return `Fix any Apps Script syntax errors in the following code. Do not add, remove, or rewrite any questions.\n\n${code}`;
}

// ---------------------------------------------------------------------------
// Deterministic builder — used when no API key is configured, and doubles
// as ground truth for what a correct conversion should look like.
// ---------------------------------------------------------------------------

function escapeStr(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n");
}

function buildScriptFromQuestionnaire(title: string, q: ResolvedQuestionnaire): string {
  const lines: string[] = [`function myFunction() {`];
  lines.push(`  var form = FormApp.create('${escapeStr(title)}');`);
  const description = [q.greeting, q.researchExplanation, q.informedConsent].filter(Boolean).join("\\n\\n");
  lines.push(`  form.setDescription('${escapeStr(description)}');`);

  let n = 0;
  const emitSection = (label: string, section: ResolvedSection) => {
    if (!section.questions.length) return;
    lines.push(`  form.addSectionHeaderItem().setTitle('${escapeStr(label)}');`);
    section.questions.forEach((question) => {
      n += 1;
      const v = `item${n}`;
      if (question.type === "multipleChoice" || question.type === "checkbox") {
        const method = question.type === "multipleChoice" ? "addMultipleChoiceItem" : "addCheckboxItem";
        lines.push(`  var ${v} = form.${method}();`);
        lines.push(`  ${v}.setTitle('${escapeStr(question.text)}');`);
        lines.push(`  ${v}.setChoices([`);
        const opts = question.options?.length ? question.options : ["Option A", "Option B"];
        opts.forEach((opt, i) => {
          lines.push(`    ${v}.createChoice('${escapeStr(opt)}')${i < opts.length - 1 ? "," : ""}`);
        });
        lines.push(`  ]);`);
      } else if (question.type === "linearScale") {
        const scale = question.scale || { min: 1, max: 5 };
        lines.push(`  form.addScaleItem()`);
        lines.push(`    .setTitle('${escapeStr(question.text)}')`);
        lines.push(`    .setBounds(${scale.min}, ${scale.max})`);
        lines.push(`    .setLabels('${escapeStr(scale.minLabel || "")}', '${escapeStr(scale.maxLabel || "")}');`);
      } else if (question.type === "paragraph") {
        lines.push(`  var ${v} = form.addParagraphTextItem();`);
        lines.push(`  ${v}.setTitle('${escapeStr(question.text)}');`);
      } else {
        lines.push(`  var ${v} = form.addTextItem();`);
        lines.push(`  ${v}.setTitle('${escapeStr(question.text)}');`);
      }
      if (question.required) {
        lines.push(`  ${v}.setRequired(true);`);
      }
    });
  };

  emitSection(q.participantProfile.title, q.participantProfile);
  q.sections.forEach((s) => emitSection(s.title, s));
  if (q.finalComments) emitSection(q.finalComments.title, q.finalComments);

  lines.push(`  form.setConfirmationMessage('${escapeStr(q.thankYou)}');`);
  lines.push(`}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title: string = String(body?.title || "Research Questionnaire").trim();
    const questionnaire: Questionnaire | null = body?.questionnaire ?? null;
    const language: Language = body?.language === "japanese" || body?.language === "bilingual" ? body.language : "english";

    if (!questionnaire) {
      return NextResponse.json({ ok: false, error: "No questionnaire available to export." }, { status: 400 });
    }

    const filtered = selectedQuestionnaire(questionnaire);
    if (countQuestions(filtered) === 0) {
      return NextResponse.json(
        { ok: false, error: "No questions are selected. Select at least one question before exporting." },
        { status: 400 }
      );
    }

    const resolved = resolveQuestionnaireLanguage(filtered, language);

    if (!API_KEY) {
      const checked = validateAndRepairScript(buildScriptFromQuestionnaire(title, resolved));
      return NextResponse.json({ ok: true, code: checked.code, validation: { issues: checked.issues } });
    }

    const conversionPrompt = buildConversionPrompt(title, resolved);
    const raw = await callOpenAI(
      [
        { role: "system", content: GENERATION_SYSTEM },
        { role: "user", content: conversionPrompt },
      ],
      { temperature: 0.1 }
    );
    const afterConversion = stripFences(raw);

    const validated = await callOpenAI(
      [
        { role: "system", content: VALIDATION_SYSTEM },
        { role: "user", content: buildValidationPrompt(afterConversion) },
      ],
      { temperature: 0 }
    );
    const finalCode = stripFences(validated);

    // Final deterministic safety net — lightweight structural checks (brace
    // balance, duplicate vars, malformed choice arrays) on top of the two AI
    // passes above, which are left exactly as they were.
    const checked = validateAndRepairScript(finalCode);

    return NextResponse.json({ ok: true, code: checked.code, validation: { issues: checked.issues } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
