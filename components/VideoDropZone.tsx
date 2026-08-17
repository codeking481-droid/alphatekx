"use client";

import { useCallback, useState } from "react";
import { motion } from "framer-motion";
import { Upload } from "lucide-react";

interface VideoDropZoneProps {
  onVideosSelected: (videos: File[]) => void;
  maxVideos: number;
  currentCount: number;
}

export default function VideoDropZone({ onVideosSelected, maxVideos, currentCount }: VideoDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(file => 
      file.type.startsWith("video/")
    );

    if (files.length > 0) {
      const remainingSlots = maxVideos - currentCount;
      const filesToAdd = files.slice(0, remainingSlots);
      onVideosSelected(filesToAdd);
    }
  }, [maxVideos, currentCount, onVideosSelected]);

  const isFull = currentCount >= maxVideos;

  return (
    <motion.div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      animate={{
        borderColor: isDragging ? '#a855f7' : '#a855f7',
        boxShadow: isDragging ? '0 0 25px rgba(168, 85, 247, 0.2)' : '0 0 15px rgba(168, 85, 247, 0.15)',
      }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className={`
        relative border-4 border-dashed rounded-2xl p-6 md:p-10 text-center transition-all cursor-pointer
        bg-surface2 shadow-purple
        ${isFull ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <motion.div
        animate={{ scale: isDragging ? 1.05 : 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <Upload className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-3 md:mb-4 text-purple" />
        
        <p className="text-base md:text-xl font-semibold text-bone mb-2 tracking-tight">
          {isFull ? "Video limit reached" : "Drag & drop your video here"}
        </p>
        <p className="text-sm md:text-base text-purple underline decoration-purple underline-offset-4">
          {isFull ? "" : "or browse files"}
        </p>
        <p className="text-xs md:text-sm text-greyMuted mt-2 text-body">
          Supports MP4, MOV, WebM • 4K • Up to 2GB
        </p>
      </motion.div>
    </motion.div>
  );
}
