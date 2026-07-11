export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
export const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const API_KEY = process.env.OPENAI_API_KEY || "";

export type ChatRole = "system" | "user" | "assistant";
export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export async function callOpenAI(
  messages: ChatTurn[],
  opts: { temperature?: number; json?: boolean } = {}
): Promise<string> {
  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: opts.temperature ?? 0.4,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error: ${res.status} ${errText}`);
  }

  const data = await res.json();
  const text =
    data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
  return String(text || "").trim();
}

export function stripFences(code: string): string {
  return code
    .replace(/^```[a-z]*\n?/im, "")
    .replace(/\n?```$/im, "")
    .trim();
}
