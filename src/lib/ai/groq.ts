import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || import.meta.env.VITE_GROQ_API_KEY || '' });

export type PostLength = 'short' | 'medium' | 'long';

export async function generatePost(data: {
  topic: string;
  goal: string;
  audience: string;
  tone: string;
  length: PostLength;
}): Promise<string> {
  const target = data.length === 'short' ? '30-60 words' : data.length === 'medium' ? '80-120 words' : '150-250 words';
  const maxTokens = data.length === 'long' ? 600 : data.length === 'medium' ? 350 : 200;

  const prompt = `Topic: ${data.topic}, Goal: ${data.goal}, Audience: ${data.audience}, Tone: ${data.tone}. Write EXACTLY ${target}. Mature, hook+value+CTA.`;

  const res = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: `You are AlphaTekX viral writer. Write exactly ${target}. Count words.` },
      { role: "user", content: prompt }
    ],
    temperature: 0.8,
    max_tokens: maxTokens
  });

  let content = res.choices[0]?.message?.content || "";
  let wordCount = content.split(/\s+/).filter(Boolean).length;

  // Enforce medium length with regeneration
  if (data.length === 'medium' && (wordCount < 80 || wordCount > 120)) {
    const fix = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: `Rewrite this to be exactly 80-120 words: ${content}` }],
      temperature: 0.7
    });
    content = fix.choices[0]?.message?.content || content;
    wordCount = content.split(/\s+/).filter(Boolean).length;
  }

  console.log(`[Groq] Generated post: ${wordCount} words (target: ${target})`);
  return content;
}