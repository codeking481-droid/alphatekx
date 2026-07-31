export async function generatePollinationImage(prompt: string, seed: number): Promise<{ url: string; blob: Blob }> {
  const encoded = encodeURIComponent(prompt + ", high quality, 1080x1080, branded, professional, no text errors");
  const url = `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&seed=${seed}&model=flux`;
  const res = await fetch(url);
  const blob = await res.blob();
  return { url, blob };
}