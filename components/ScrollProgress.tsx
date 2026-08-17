"use client";

import { useScroll } from "framer-motion";
import { motion } from "framer-motion";

export default function ScrollProgress() {
  const { scrollYProgress } = useScroll();

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1 bg-purple/20 z-[1000]"
      style={{ scaleX: scrollYProgress }}
    />
  );
}
