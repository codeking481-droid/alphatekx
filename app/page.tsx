"use client";

import { useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { Upload, Zap, Video, Shield, X, Play, ArrowRight, ChevronDown, Star, Check, Smartphone } from "lucide-react";
import Navbar from "@/components/Navbar";
import VideoDropZone from "@/components/VideoDropZone";
import VideoGrid from "@/components/VideoGrid";
import Hero3D from "@/components/Hero3D";
import CustomCursor from "@/components/CustomCursor";
import KineticText from "@/components/KineticText";
import ScrollProgress from "@/components/ScrollProgress";
import MagneticButton from "@/components/MagneticButton";
import ChromaticAberration from "@/components/ChromaticAberration";
import MorphingBlob from "@/components/MorphingBlob";
import { calculateCredits } from "@/lib/credits";

export default function Home() {
  const [videos, setVideos] = useState<File[]>([]);
  const plan = "free";
  const credits = calculateCredits(videos.length);
  const maxVideos = plan === "free" ? 3 : 10;
  const { scrollYProgress } = useScroll();
  const y = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.8]);

  const handleVideosSelected = (selectedVideos: File[]) => {
    setVideos(prev => [...prev, ...selectedVideos]);
  };

  const handleRemoveVideo = (index: number) => {
    setVideos(videos.filter((_, i) => i !== index));
  };

  return (
    <main className="min-h-screen bg-canvas text-bone overflow-x-hidden">
      <ScrollProgress />
      <CustomCursor />
      <Navbar />
      
      {/* SECTION 2 - HERO (2 COLUMN) */}
      <section className="min-h-screen flex items-center pt-24 px-6 md:px-12 py-32 md:py-48 relative overflow-hidden">
        <MorphingBlob />
        <motion.div style={{ y, opacity, scale }} className="absolute inset-0 pointer-events-none">
          <Hero3D />
        </motion.div>
        <div className="max-w-[1600px] mx-auto w-full relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* LEFT - HUGE STACKED HEADLINE */}
            <motion.div 
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="inline-flex items-center gap-2 mb-8"
              >
                <div className="w-1.5 h-1.5 bg-purple rounded-full shadow-purple animate-pulse" />
                <span className="text-purple font-semibold tracking-tight text-xs uppercase">Restoration Economy</span>
              </motion.div>

              <h1 className="text-5xl md:text-7xl lg:text-display font-semibold tracking-tighter leading-[0.85] mb-8">
                <ChromaticAberration>
                  <KineticText text="WE DON'T" className="block" />
                  <KineticText text="EDIT VIDEOS," className="block" />
                  <span className="text-gradient block">
                    <KineticText text="WE RESURRECT" />
                  </span>
                  <KineticText text="THEM." className="block" />
                </ChromaticAberration>
              </h1>

              <p className="text-body text-grey max-w-xl mb-10 leading-relaxed">
                Paste your broken video or raw clips. We heal it to world-class. 10 credits per video. Export in 4K. Builders create new. We restore hope.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
                <MagneticButton
                  className="bg-gradient-to-r from-purple to-purpleLight text-bone px-8 py-4 rounded-full font-semibold text-body shadow-purple hover:shadow-purple-strong transition-all inline-flex items-center gap-2"
                >
                  Start Restoring <ArrowRight className="w-5 h-5" />
                </MagneticButton>
                <MagneticButton
                  className="bg-surface1 border border-border text-bone px-8 py-4 rounded-full font-medium text-body hover:border-purple transition-all inline-flex items-center gap-2"
                >
                  <Play className="w-5 h-5" /> Watch Demo
                </MagneticButton>
              </div>
            </motion.div>

            {/* RIGHT - FLOATING DASHBOARD */}
            <motion.div
              style={{ y }}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 bg-purple/20 blur-[100px] rounded-full" />
              <div className="bg-surface1/90 backdrop-blur-xl border border-border rounded-3xl p-6 md:p-8 shadow-subtle relative">
                <div className="flex items-center justify-between mb-6">
                  <span className="text-xs text-greyMuted">Dashboard</span>
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-purple/20 rounded-full animate-pulse" />
                    <div className="w-2 h-2 bg-purple/40 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 bg-purple rounded-full shadow-purple animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>

                <VideoDropZone
                  onVideosSelected={handleVideosSelected}
                  maxVideos={maxVideos}
                  currentCount={videos.length}
                />

                {videos.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-4 inline-flex items-center gap-2 bg-canvas border border-purple px-4 py-2 rounded-full shadow-purple"
                  >
                    <span className="text-purple font-semibold text-sm">{videos.length}/{maxVideos}</span>
                    <span className="text-greyMuted text-xs">selected —</span>
                    <span className="text-purple font-semibold text-sm">{credits}</span>
                    <span className="text-greyMuted text-xs">credits</span>
                  </motion.div>
                )}

                {videos.length > 0 && (
                  <div className="mt-4">
                    <VideoGrid videos={videos} onRemove={handleRemoveVideo} />
                  </div>
                )}

                {/* Lime Bar Chart */}
                <div className="mt-6 pt-6 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-greyMuted">Credits Usage</span>
                    <span className="text-purple font-semibold">{credits}/100</span>
                  </div>
                  <div className="flex items-end gap-2 h-16">
                    {[30, 50, 40, 70, 60, 80, 50, 90].map((height, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        whileInView={{ height: `${height}%` }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                        className="flex-1 bg-purple/10 hover:bg-purple/20 rounded-t-sm transition-colors"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 3 - TRUSTED BY */}
      <section className="min-h-[80vh] flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-purple/5 to-transparent pointer-events-none" />
        <div className="max-w-[1600px] mx-auto w-full relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              Built for creators. <span className="text-gradient">Powered by AI.</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: Zap, title: "Lightning Cut", desc: "AI-powered editing that cuts hours into minutes" },
              { icon: Video, title: "Auto Captions", desc: "Generate accurate captions in 50+ languages" },
              { icon: Shield, title: "Magic Remove", desc: "Remove backgrounds and objects instantly" }
            ].map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
                className="bg-surface1/90 backdrop-blur-xl border border-border p-8 rounded-3xl hover:border-purple transition-all group relative overflow-hidden"
              >
                <div className="absolute inset-0 bg-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="w-14 h-14 bg-purple/10 rounded-2xl flex items-center justify-center mb-6 shadow-purple group-hover:shadow-purple-strong relative z-10">
                  <feature.icon className="w-7 h-7 text-purple" />
                </div>
                <h3 className="text-xl font-semibold mb-3 tracking-tight relative z-10">{feature.title}</h3>
                <p className="text-grey text-body relative z-10">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 4 - YOUR WORKSPACE, ANYWHERE */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="max-w-[1600px] mx-auto w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-6">
                Your workspace,<br />
                <span className="text-gradient">anywhere.</span>
              </h2>
              <p className="text-body text-grey mb-8 max-w-lg">
                Seamless editing across desktop and mobile. Start on your laptop, finish on your phone. Your projects sync instantly.
              </p>
              <div className="space-y-4">
                {['Cloud sync across devices', 'Offline mode available', 'Real-time collaboration'].map((item, i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="flex items-center gap-3"
                  >
                    <Check className="w-4 h-4 text-purple" />
                    <span className="text-bone text-body">{item}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="absolute inset-0 bg-purple/10 blur-[80px] rounded-full" />
              <div className="bg-surface1/90 backdrop-blur-xl border border-purple rounded-[2.5rem] p-4 max-w-sm mx-auto shadow-purple relative">
                <div className="bg-canvas rounded-[2rem] p-6 aspect-[9/19] flex flex-col">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-2 bg-purple rounded-full shadow-purple animate-pulse" />
                    <span className="text-xs text-greyMuted">AlphatekX</span>
                  </div>
                  <div className="flex-1 bg-surface2 rounded-xl mb-4 flex items-center justify-center border border-border">
                    <Play className="w-10 h-10 text-purple" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-greyMuted">
                    <span>0:00</span>
                    <div className="flex-1 mx-3 h-1 bg-border rounded-full overflow-hidden">
                      <div className="w-1/3 h-full bg-purple animate-pulse" />
                    </div>
                    <span>3:45</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 5 - HOW IT WORKS */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="max-w-[1600px] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-20"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              How it <span className="text-gradient">works</span>
            </h2>
          </motion.div>

          <div className="space-y-32">
            {[
              { num: "01", title: "Drop up to 10 videos", desc: "Drag and drop your videos. We support all major formats." },
              { num: "02", title: "AI auto-edits", desc: "Our AI analyzes your footage and suggests edits." },
              { num: "03", title: "Export in 4K", desc: "One click to export in stunning 4K quality." }
            ].map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`flex flex-col lg:flex-row items-center gap-12 ${i % 2 === 0 ? '' : 'lg:flex-row-reverse'}`}
              >
                <div className="flex-1">
                  <span className="text-[100px] md:text-[180px] font-semibold text-purple/10 leading-none tracking-tighter">{step.num}</span>
                  <h3 className="text-3xl md:text-4xl font-semibold mb-4 -mt-12 tracking-tight">{step.title}</h3>
                  <p className="text-body text-grey">{step.desc}</p>
                </div>
                <div className="flex-1 bg-surface1/90 backdrop-blur-xl border border-border rounded-2xl p-8 aspect-video flex items-center justify-center relative overflow-hidden group">
                  <div className="absolute inset-0 bg-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Upload className="w-14 h-14 text-purple relative z-10" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 6 - CREDIT SYSTEM */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-purple/5 to-transparent pointer-events-none" />
        <div className="max-w-[1600px] mx-auto w-full relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              The <span className="text-gradient">Credit System</span>
            </h2>
            <p className="text-body text-grey max-w-2xl mx-auto">
              Simple, transparent pricing. 10 credits per video. No hidden fees.
            </p>
          </motion.div>

          <div className="bg-surface1/90 backdrop-blur-xl border border-border rounded-3xl p-8 md:p-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  className="bg-canvas border border-border rounded-xl p-4 aspect-video flex items-center justify-center relative group overflow-hidden"
                >
                  <div className="absolute inset-0 bg-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Play className="w-7 h-7 text-purple relative z-10" />
                  <button className="absolute top-2 right-2 bg-purple text-bone p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center"
            >
              <div className="inline-flex items-center gap-4 bg-canvas border border-purple px-8 py-4 rounded-full shadow-purple">
                <span className="text-4xl font-semibold text-purple">40</span>
                <span className="text-grey">credits used</span>
              </div>
              <p className="mt-4 text-grey text-body">4 videos × 10 credits each</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 7 - TEMPLATES */}
      <section className="min-h-[80vh] flex items-center px-6 md:px-12 py-32 md:py-48 overflow-hidden">
        <div className="max-w-[1600px] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-12"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              Professional <span className="text-gradient">Templates</span>
            </h2>
            <p className="text-body text-grey">Start with stunning templates, customize to perfection.</p>
          </motion.div>

          <div className="flex gap-4 overflow-x-auto pb-4">
            {Array(8).fill(0).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ scale: 1.02 }}
                className="flex-shrink-0 w-72 bg-surface1/90 backdrop-blur-xl border border-border rounded-2xl overflow-hidden group cursor-pointer relative"
              >
                <div className="aspect-video bg-gradient-to-br from-purple to-yellow flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Play className="w-10 h-10 text-purple group-hover:scale-110 transition-transform relative z-10" />
                </div>
                <div className="p-4">
                  <h3 className="font-semibold mb-1 tracking-tight">Template {i + 1}</h3>
                  <p className="text-sm text-grey text-body">Professional video template</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 8 - COMPARISON */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="max-w-[1600px] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              Before & <span className="text-gradient">After</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="bg-surface1/90 backdrop-blur-xl border border-border rounded-2xl p-8"
            >
              <h3 className="text-xl font-semibold mb-4 text-grey tracking-tight">Before</h3>
              <div className="aspect-video bg-canvas rounded-xl flex items-center justify-center">
                <span className="text-grey text-body">Raw footage</span>
              </div>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="bg-surface1/90 backdrop-blur-xl border border-purple rounded-2xl p-8 shadow-purple relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-purple/5" />
              <h3 className="text-xl font-semibold mb-4 text-purple tracking-tight relative z-10">After</h3>
              <div className="aspect-video bg-canvas rounded-xl flex items-center justify-center border border-purple/10 relative z-10">
                <Play className="w-10 h-10 text-purple" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* SECTION 9 - PRICING */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-purple/5 to-transparent pointer-events-none" />
        <div className="max-w-[1600px] mx-auto w-full relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              Simple <span className="text-gradient">Pricing</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: "Free", price: "$0", videos: "3 videos", features: ["Basic editing", "Standard export", "Community support"] },
              { name: "Pro", price: "$19", videos: "100 videos", features: ["Advanced editing", "4K export", "Priority support", "Templates access"], highlighted: true },
              { name: "Boss", price: "$49", videos: "500 videos", features: ["Unlimited editing", "8K export", "Dedicated support", "All templates", "API access"] }
            ].map((plan, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
                className={`relative p-8 rounded-3xl ${plan.highlighted ? 'bg-surface1/90 backdrop-blur-xl border border-purple shadow-purple' : 'bg-surface1/90 backdrop-blur-xl border border-border'}`}
              >
                {plan.highlighted && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-to-r from-purple to-purpleLight text-bone px-4 py-1 rounded-full text-xs font-semibold">
                    Popular
                  </div>
                )}
                <h3 className="text-xl font-semibold mb-2 tracking-tight">{plan.name}</h3>
                <p className="text-4xl font-semibold mb-1">{plan.price}</p>
                <p className="text-grey mb-6 text-body">{plan.videos}</p>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, j) => (
                    <li key={j} className="flex items-center gap-2 text-body">
                      <Check className="w-4 h-4 text-purple" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>
                <button className={`w-full py-3 rounded-full font-semibold transition-all text-body ${plan.highlighted ? 'bg-gradient-to-r from-purple to-purpleLight text-bone shadow-purple hover:shadow-purple-strong' : 'bg-canvas text-bone hover:bg-surface2'}`}>
                  Get Started
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 10 - TESTIMONIALS */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48">
        <div className="max-w-[1600px] mx-auto w-full">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              Loved by <span className="text-gradient">creators</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array(12).fill(0).map((_, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.03, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-surface1/90 backdrop-blur-xl border border-border p-6 rounded-2xl hover:border-purple/50 transition-all"
              >
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className="w-3 h-3 text-purple fill-purple" />
                  ))}
                </div>
                <p className="text-grey mb-4 text-sm text-body">
                  "AlphatekX has completely transformed my workflow. What used to take hours now takes minutes."
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple/20 rounded-full flex items-center justify-center">
                    <span className="text-purple font-semibold text-xs">C{i + 1}</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm tracking-tight">Creator {i + 1}</p>
                    <p className="text-xs text-grey">@creator{i + 1}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 11 - FAQ */}
      <section className="min-h-screen flex items-center px-6 md:px-12 py-32 md:py-48 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-purple/5 to-transparent pointer-events-none" />
        <div className="max-w-[1600px] mx-auto w-full relative z-10">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight mb-4">
              Frequently Asked <span className="text-gradient">Questions</span>
            </h2>
          </motion.div>

          <div className="max-w-3xl mx-auto space-y-4">
            {[
              { q: "How does the credit system work?", a: "Each video you edit costs 10 credits. Credits are purchased in packs and never expire." },
              { q: "Can I cancel anytime?", a: "Yes, you can cancel your subscription at any time. No questions asked." },
              { q: "What formats do you support?", a: "We support MP4, MOV, WebM, AVI, and many more. Export in any format you need." },
              { q: "Is my data secure?", a: "Absolutely. We use enterprise-grade encryption and your data is never shared." }
            ].map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="bg-surface1/90 backdrop-blur-xl border border-border rounded-2xl overflow-hidden hover:border-purple/50 transition-all"
              >
                <button className="w-full p-6 text-left flex items-center justify-between">
                  <span className="font-semibold tracking-tight">{faq.q}</span>
                  <ChevronDown className="w-4 h-4 text-purple" />
                </button>
                <div className="px-6 pb-6 text-grey text-body">
                  {faq.a}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 12 - FINAL CTA */}
      <section className="min-h-screen flex items-center justify-center px-6 md:px-12 py-32 md:py-48 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-purple/10 to-transparent" />
        <div className="absolute inset-0 bg-purple/5 blur-[150px]" />
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative max-w-4xl mx-auto text-center z-10"
        >
          <h2 className="text-5xl md:text-6xl lg:text-display-lg font-semibold tracking-tight mb-6 leading-tight">
            Start creating for<br />
            <span className="text-gradient">free</span> today
          </h2>
          <p className="text-body text-grey mb-8">
            No credit card required. 10 credits included.
          </p>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            animate={{ boxShadow: ["0 0 15px rgba(168, 85, 247, 0.2)", "0 0 25px rgba(168, 85, 247, 0.3)", "0 0 15px rgba(168, 85, 247, 0.2)"] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="bg-gradient-to-r from-purple to-purpleLight text-bone px-12 py-5 rounded-full font-semibold text-xl shadow-purple inline-flex items-center gap-3 relative z-10"
          >
            Try AlphatekX Now <ArrowRight className="w-6 h-6" />
          </motion.button>
        </motion.div>
      </section>

      {/* SECTION 13 - FOOTER */}
      <footer className="border-t border-border py-12 px-6 md:px-12">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <span className="text-xl font-semibold text-bone tracking-tight">ALPHATEK</span>
              <span className="text-xl font-semibold text-purple tracking-tight">X</span>
            </div>
            
            <div className="flex gap-8 text-grey text-body">
              <a href="#" className="hover:text-bone transition-colors">Privacy</a>
              <a href="#" className="hover:text-bone transition-colors">Terms</a>
              <a href="#" className="hover:text-bone transition-colors">Contact</a>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-purple rounded-full shadow-purple" />
              <span className="text-grey text-body">© 2024 AlphatekX</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
