export function calculateCredits(videoCount: number): number {
  return videoCount * 10;
}

export function getMaxVideos(plan: "free" | "pro"): number {
  return plan === "free" ? 3 : 10;
}
