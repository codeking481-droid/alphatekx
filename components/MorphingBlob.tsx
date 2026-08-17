"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";

export default function MorphingBlob() {
  const blobRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.5]);
  const rotate = useTransform(scrollYProgress, [0, 1], [0, 360]);

  return (
    <motion.div
      ref={blobRef}
      style={{ scale, rotate }}
      className="absolute pointer-events-none"
      animate={{
        borderRadius: [
          "30% 70% 70% 30% / 30% 30% 70% 70%",
          "53% 47% 53% 47% / 54% 47% 53% 46%",
          "30% 70% 70% 30% / 30% 30% 70% 70%"
        ]
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "easeInOut"
      }}
    >
      <div className="w-64 h-64 md:w-96 md:h-96 bg-purple/10 blur-3xl rounded-full" />
    </motion.div>
  );
}
