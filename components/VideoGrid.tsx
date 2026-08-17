"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

interface VideoGridProps {
  videos: File[];
  onRemove: (index: number) => void;
}

export default function VideoGrid({ videos, onRemove }: VideoGridProps) {
  const [thumbnails, setThumbnails] = useState<(string | null)[]>([]);

  useEffect(() => {
    videos.forEach((video, index) => {
      if (!thumbnails[index]) {
        const videoElement = document.createElement("video");
        videoElement.src = URL.createObjectURL(video);
        videoElement.currentTime = 1;
        
        videoElement.onloadeddata = () => {
          const canvas = document.createElement("canvas");
          canvas.width = videoElement.videoWidth;
          canvas.height = videoElement.videoHeight;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(videoElement, 0, 0);
          
          const thumbnail = canvas.toDataURL("image/jpeg");
          setThumbnails(prev => {
            const newThumbnails = [...prev];
            newThumbnails[index] = thumbnail;
            return newThumbnails;
          });
          
          URL.revokeObjectURL(videoElement.src);
        };
      }
    });
  }, [videos, thumbnails]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-6 mb-20">
      {videos.map((video, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
          className="relative bg-surface2 rounded-2xl overflow-hidden group border border-border hover:border-purple transition-all"
        >
          <div className="aspect-video bg-canvas/50 flex items-center justify-center">
            {thumbnails[index] ? (
              <img
                src={thumbnails[index]}
                alt={`Thumbnail ${index}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-greyMuted text-body">Loading...</div>
            )}
          </div>
          
          <div className="p-4">
            <p className="text-sm font-semibold text-bone truncate tracking-tight">{video.name}</p>
            <p className="text-xs text-greyMuted text-body">{formatFileSize(video.size)}</p>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onRemove(index)}
            className="absolute top-3 right-3 bg-purple hover:bg-purple/80 text-bone p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-purple"
          >
            <X className="w-3 h-3" />
          </motion.button>
        </motion.div>
      ))}
    </div>
  );
}
