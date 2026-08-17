"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-canvas/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-[1600px] mx-auto px-6 md:px-12 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold text-bone tracking-tight">ALPHATEK</span>
            <span className="text-xl font-semibold text-purple tracking-tight shadow-purple">X</span>
          </div>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-8">
            {['Product', 'How It Works', 'Use Cases', 'Pricing', 'FAQ'].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase().replace(' ', '-')}`}
                className="text-grey hover:text-bone transition-colors text-sm font-medium text-body"
              >
                {link}
              </a>
            ))}
          </div>

          {/* CTA Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="hidden md:block bg-gradient-to-r from-purple to-purpleLight text-bone px-6 py-2.5 rounded-full font-semibold text-sm shadow-purple hover:shadow-purple-strong transition-all"
          >
            Get Started
          </motion.button>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden text-bone"
          >
            <X className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-45' : ''}`} />
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="md:hidden mt-4 pb-4"
          >
            <div className="flex flex-col gap-4">
              {['Product', 'How It Works', 'Use Cases', 'Pricing', 'FAQ'].map((link) => (
                <a
                  key={link}
                  href={`#${link.toLowerCase().replace(' ', '-')}`}
                  className="text-grey hover:text-bone transition-colors text-sm font-medium text-body"
                  onClick={() => setIsOpen(false)}
                >
                  {link}
                </a>
              ))}
              <button className="bg-gradient-to-r from-purple to-purpleLight text-bone px-6 py-2.5 rounded-full font-semibold text-sm shadow-purple">
                Get Started
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </nav>
  );
}
