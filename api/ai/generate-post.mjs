import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || '' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  try {
    const { topic, goal, audience, tone, length } = req.body || {};
    if (!topic) return res.status(400).json({ error: 'Topic is required' });

    const target = length === 'short' ? '30-60 words' : length === 'long' ? '150-250 words' : '80-120 words';
    const maxTokens = length === 'long' ? 600 : length === 'medium' ? 350 : 200;

    const prompt = `Topic: ${topic}, Goal: ${goal || 'Engage audience'}, Audience: ${audience || 'General'}, Tone: ${tone || 'Professional'}. Write EXACTLY ${target}. Mature, hook+value+CTA.`;

    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: `You are AlphaTekX viral content writer. Write exactly ${target}. Count words. No placeholders.` },
        { role: "user", content: prompt }
      ],
      temperature: 0.8,
      max_tokens: maxTokens
    });

    let content = completion.choices[0]?.message?.content || "";
    let wordCount = content.split(/\s+/).filter(Boolean).length;

    // Regenerate if medium length is out of range
    if (length === 'medium' && (wordCount < 80 || wordCount > 120)) {
      const fix = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: `Rewrite this to be exactly 80-120 words: ${content}` }],
        temperature: 0.7
      });
      content = fix.choices[0]?.message?.content || content;
      wordCount = content.split(/\s+/).filter(Boolean).length;
    }

    return res.status(200).json({ content, wordCount, target });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Generation failed' });
  }
}