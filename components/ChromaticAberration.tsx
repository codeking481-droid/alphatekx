"use client";

import { ReactNode } from "react";
import { motion } from "framer-motion";

interface ChromaticAberrationProps {
  children: ReactNode;
  className?: string;
}

export default function ChromaticAberration({ children, className = "" }: ChromaticAberrationProps) {
  return (
    <motion.div
      className={`relative ${className}`}
      whileHover={{
        textShadow: [
          "0 0 0 rgba(255,0,0,0)",
          "0 0 10px rgba(255,0,0,0.5)",
          "0 0 0 rgba(255,0,0,0)"
        ]
      }}
      transition={{ duration: 0.3 }}
    >
      {children}
    </motion.div>
  );
}
