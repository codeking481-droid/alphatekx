"use client";

import { useState } from "react";
import VideoDropZone from "@/components/VideoDropZone";
import VideoGrid from "@/components/VideoGrid";
import { calculateCredits } from "@/lib/credits";

export default function Home() {
  const [videos, setVideos] = useState<File[]>([]);
  const plan = "free"; // Could be "free" or "pro"

  const handleVideosSelected = (selectedVideos: File[]) => {
    setVideos(selectedVideos);
  };

  const handleRemoveVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  const credits = calculateCredits(videos.length);
  const maxVideos = plan === "free" ? 3 : 10;

  return (
    <main className="min-h-screen bg-[#0a0a0a] text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center">Video Editor</h1>
        
        <VideoDropZone 
          onVideosSelected={handleVideosSelected}
          maxVideos={maxVideos}
          currentCount={videos.length}
        />

        {videos.length > 0 && (
          <>
            <VideoGrid 
              videos={videos}
              onRemove={handleRemoveVideo}
            />

            <div className="fixed bottom-0 left-0 right-0 bg-[#111] border-t border-[#333] p-4">
              <div className="max-w-6xl mx-auto flex justify-between items-center">
                <p className="text-lg">
                  {videos.length}/{maxVideos} selected — {credits} credits
                </p>
                <button className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
                  Export
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
