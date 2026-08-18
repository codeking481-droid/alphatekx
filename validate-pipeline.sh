#!/bin/bash
# AlphaTekX Video Pipeline - Validation Script
# Run this to verify the pipeline is working correctly

set -e

echo "============================================"
echo "AlphaTekX Video Pipeline Validation"
echo "============================================"
echo ""

# Check 1: Environment Variables
echo "📋 CHECK 1: Environment Variables"
if [ -z "$GROQ_API_KEY" ]; then
  echo "  ❌ GROQ_API_KEY not set"
  exit 1
else
  echo "  ✅ GROQ_API_KEY is set"
fi

if [ -z "$PEXELS_API_KEY_1" ]; then
  echo "  ⚠️  PEXELS_API_KEY_1 not set (script will fail at SEARCH phase)"
else
  echo "  ✅ PEXELS_API_KEY_1 is set"
fi

if [ -z "$ELEVENLABS_API_KEY" ]; then
  echo "  ⚠️  ELEVENLABS_API_KEY not set (will fallback to gTTS)"
else
  echo "  ✅ ELEVENLABS_API_KEY is set"
fi
echo ""

# Check 2: Dependencies
echo "📦 CHECK 2: NPM Dependencies"
if npm list ffmpeg-static >/dev/null 2>&1; then
  echo "  ✅ ffmpeg-static installed"
else
  echo "  ❌ ffmpeg-static NOT installed (run: npm install ffmpeg-static)"
  exit 1
fi

if npm list node-fetch >/dev/null 2>&1 || node -e "require('node-fetch')" >/dev/null 2>&1; then
  echo "  ✅ node-fetch available (built-in for Node 18+)"
else
  echo "  ⚠️  node-fetch might be missing on older Node versions"
fi
echo ""

# Check 3: FFmpeg Binary
echo "🎬 CHECK 3: FFmpeg Binary"
if command -v ffmpeg >/dev/null 2>&1; then
  FFMPEG_VERSION=$(ffmpeg -version 2>&1 | head -1)
  echo "  ✅ ffmpeg found: $FFMPEG_VERSION"
  
  # Check for specific filters
  if ffmpeg -filters 2>&1 | grep -q "zoompan"; then
    echo "  ✅ zoompan filter available (MrBeast effects will work)"
  else
    echo "  ❌ zoompan filter NOT available (update FFmpeg)"
    exit 1
  fi
else
  echo "  ❌ ffmpeg NOT found in PATH"
  exit 1
fi
echo ""

# Check 4: File Structure
echo "📁 CHECK 4: File Structure"
if [ -f "server/videoPipeline.mjs" ]; then
  echo "  ✅ server/videoPipeline.mjs exists"
  
  # Check for key functions
  if grep -q "export async function buildProductionVideo" server/videoPipeline.mjs; then
    echo "  ✅ buildProductionVideo function found"
  else
    echo "  ❌ buildProductionVideo function NOT found"
    exit 1
  fi
  
  if grep -q "async function phaseNarration" server/videoPipeline.mjs; then
    echo "  ✅ phaseNarration function found"
  else
    echo "  ❌ phaseNarration function NOT found"
    exit 1
  fi
  
  if grep -q "async function phaseConcat" server/videoPipeline.mjs; then
    echo "  ✅ phaseConcat function found"
  else
    echo "  ❌ phaseConcat function NOT found"
    exit 1
  fi
else
  echo "  ❌ server/videoPipeline.mjs NOT found"
  exit 1
fi

if [ -f "server.mjs" ]; then
  echo "  ✅ server.mjs exists"
  
  if grep -q "api/alpha/video-stream" server.mjs; then
    echo "  ✅ video-stream endpoint found"
  else
    echo "  ❌ video-stream endpoint NOT found"
    exit 1
  fi
else
  echo "  ❌ server.mjs NOT found"
  exit 1
fi

if [ -f "src/components/VideoBuildGlassContainer.tsx" ]; then
  echo "  ✅ VideoBuildGlassContainer component exists"
else
  echo "  ❌ VideoBuildGlassContainer component NOT found"
  exit 1
fi
echo ""

# Check 5: Temp Directory
echo "🗂️  CHECK 5: Temp Directory"
if [ -d "/tmp" ]; then
  echo "  ✅ /tmp directory exists"
  
  # Check write permissions
  if touch /tmp/alphatekx-test.txt 2>/dev/null; then
    rm -f /tmp/alphatekx-test.txt
    echo "  ✅ /tmp is writable"
  else
    echo "  ❌ /tmp is NOT writable (may need sudo chmod 777 /tmp)"
    exit 1
  fi
  
  # Check disk space
  AVAILABLE=$(df /tmp | awk 'NR==2 {print $4}')
  if [ "$AVAILABLE" -gt 52428800 ]; then  # > 50GB
    echo "  ✅ /tmp has sufficient space ($((AVAILABLE / 1024 / 1024))GB)"
  else
    echo "  ⚠️  /tmp has only $((AVAILABLE / 1024 / 1024))GB free (recommended 50GB+)"
  fi
else
  echo "  ❌ /tmp directory NOT found (Windows?)"
fi
echo ""

# Check 6: Code Syntax
echo "✨ CHECK 6: Code Syntax"
if node -c server/videoPipeline.mjs 2>&1 | grep -q "SyntaxError"; then
  echo "  ❌ Syntax error in videoPipeline.mjs"
  exit 1
else
  echo "  ✅ videoPipeline.mjs syntax OK"
fi

if node -c server.mjs 2>&1 | grep -q "SyntaxError"; then
  echo "  ❌ Syntax error in server.mjs"
  exit 1
else
  echo "  ✅ server.mjs syntax OK"
fi
echo ""

# Check 7: Audio Codec Availability
echo "🔊 CHECK 7: Audio Codec (AAC)"
if ffmpeg -codecs 2>&1 | grep -q "aac"; then
  echo "  ✅ AAC audio codec available"
else
  echo "  ⚠️  AAC codec NOT available (videos may have no audio)"
fi
echo ""

# Check 8: Text Filter
echo "📝 CHECK 8: Text Overlay (drawtext)"
if ffmpeg -filters 2>&1 | grep -q "drawtext"; then
  echo "  ✅ drawtext filter available (text overlays will work)"
else
  echo "  ❌ drawtext filter NOT available (text overlays will fail)"
  exit 1
fi
echo ""

echo "============================================"
echo "✅ ALL CHECKS PASSED - Ready to deploy!"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. npm run dev  (start server)"
echo "  2. curl -X POST http://localhost:3001/api/alpha/video-stream \\"
echo "       -H 'Content-Type: application/json' \\"
echo "       -d '{\"prompt\":\"test topic\",\"plan\":\"free\"}'"
echo ""
