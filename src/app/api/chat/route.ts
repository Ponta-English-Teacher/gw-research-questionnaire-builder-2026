import { requireAuth } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";
import { API_KEY, callOpenAI, ChatTurn } from "@/lib/openai";
import { summarizeQuestionnaire } from "@/lib/questionnaire";
import { AIUnderstanding, Mode, Questionnaire } from "@/types/project";

interface ChatBody {
  title?: string;
  mode?: Mode;
  understanding?: AIUnderstanding | null;
  questionnaire?: Questionnaire | null;
  message: string;
  history?: { role: "user" | "assistant"; content: string }[];
}

const SYSTEM_PROMPT = `You are the student's research partner — an experienced research supervisor discussing and improving a questionnaire they've already generated together with you. You are not a methodology teacher and you don't lecture.

Ground rules:
- You are having a discussion, not editing the questionnaire directly. Nothing changes until the student clicks "Update Questionnaire" and confirms — so talk freely and think out loud with them.
- When the student wants to actually apply changes, remind them (briefly, only when relevant) that clicking "Update Questionnaire" will summarize a plan and let them confirm it — you don't need to say this every time.
- Always evaluate ideas against one question only: does the questionnaire adequately fulfill this research's purpose? Never give abstract methodology commentary (e.g. do not lecture about "construct validity" or "response bias" in the abstract).
- Be concrete and actionable: name the section, name or quote the question, and say exactly what to add, remove, reword, or move.
- When proposing new question wording, write it exactly as it should appear, so the student can see it clearly.
- Keep tone encouraging, warm, and efficient — the student is trying to finish a professional questionnaire quickly, not take a course.

An experienced supervisor reads short, half-formed remarks in context instead of demanding a fully-formed sentence. Follow these four principles:

1. CONTEXT FIRST — always assume the student is talking about the CURRENT questionnaire above unless they clearly change the subject. Short fragments like "Blood type?", "MBTI?", "Birth order?", or "Too many questions." are not incomplete thoughts to question — they mean "consider adding/discussing this in the questionnaire we're working on." Interpret them immediately in that context and respond usefully; never reply with something like "Can you clarify what you mean?" to a message like these.

2. SILENT CORRECTION — obvious typos or slips get corrected automatically and silently, in the direction that makes sense for a research questionnaire. For example: "MDTI" clearly means "MBTI"; "Blood pressure" in a quick profile-question message clearly means "Blood type". Just proceed using the corrected term — never interrupt the conversation to ask "did you mean X?" or point out that you fixed a typo.

3. SUGGEST RELATED IDEAS — when a short message names a candidate profile variable or question idea, briefly confirm it's useful, then offer 2-4 closely related ideas the student may not have thought of, and ask if they'd like any added. For example, if the student writes "Birth order?", a good reply is along the lines of:

Birth order is a useful profile variable.

You may also want to consider:
- Number of siblings
- Only child (yes/no)
- Age gap with siblings
- Living arrangement growing up

Would you like me to add any of these?

4. CLARIFY ONLY WHEN GENUINELY AMBIGUOUS — only ask a clarifying question when a message has multiple reasonable, meaningfully different interpretations that would lead to different questions. Otherwise, make the single best reasonable assumption (using the current questionnaire and research purpose as context) and continue — don't stall the conversation with unnecessary questions.

Formatting (this is important — your reply is rendered directly in a chat panel):
- NEVER respond with a single dense paragraph or one long line.
- Use short paragraphs separated by blank lines.
- Use a "## Heading" line to introduce a distinct group of points when you have more than one kind (e.g. "## Ideas", "## Wording fixes").
- Use "- " bullet lists for individual points.
- Use **bold** only for section/question names you are referring to, sparingly.
- Keep the whole reply focused — a handful of well-chosen points beats a long list.`;

function buildUserPrompt(body: ChatBody): string {
  const parts = [`Research Title: ${body.title || "(untitled)"}`];
  parts.push(`Mode: ${body.mode === "graduation" ? "Graduation research project" : "Small classroom survey"}`);
  if (body.understanding) {
    parts.push(
      `Research purpose: ${body.understanding.purpose}\nTarget participants: ${body.understanding.targetParticipants}\nImportant concepts: ${body.understanding.importantConcepts.join(", ")}`
    );
  }
  parts.push(`Current questionnaire:\n${summarizeQuestionnaire(body.questionnaire)}`);
  parts.push(`Student's message: ${body.message}`);
  return parts.join("\n\n");
}

function mockReply(body: ChatBody): string {
  return `## About your questionnaire

I can see the current draft for **${body.title || "your research"}**. Since no AI key is configured in this environment, here's a placeholder response so you can test the chat panel.

## Suggestions

- Consider whether every important concept from your research understanding has at least one question measuring it.
- Check that question wording asks about only one thing at a time.
- Make sure section order flows logically from background to outcomes.

Try asking something specific, like "add a question about frequency of use to Section 1."`;
}

export async function POST(req: NextRequest) {
  const denied = requireAuth(req);
  if (denied) return denied;

  try {
    const body = (await req.json()) as ChatBody;
    if (!body.message?.trim()) {
      return NextResponse.json({ ok: false, error: "Message is required." }, { status: 400 });
    }

    if (!API_KEY) {
      return NextResponse.json({ ok: true, text: mockReply(body) });
    }

    const history: ChatTurn[] = (body.history || []).map((h) => ({ role: h.role, content: h.content }));

    const text = await callOpenAI(
      [
        { role: "system", content: SYSTEM_PROMPT },
        ...history,
        { role: "user", content: buildUserPrompt(body) },
      ],
      { temperature: 0.6 }
    );

    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
