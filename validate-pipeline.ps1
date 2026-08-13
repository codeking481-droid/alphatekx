# AlphaTekX Video Pipeline - Validation (PowerShell)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "AlphaTekX Video Pipeline Validation" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$allChecked = $true

# Check 1: Environment Variables
Write-Host "CHECK 1: Environment Variables" -ForegroundColor Yellow
if ($env:GROQ_API_KEY) {
  Write-Host "  ✅ GROQ_API_KEY is set" -ForegroundColor Green
} else {
  Write-Host "  ❌ GROQ_API_KEY not set" -ForegroundColor Red
  $allChecked = $false
}

if ($env:PEXELS_API_KEY_1) {
  Write-Host "  ✅ PEXELS_API_KEY_1 is set" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  PEXELS_API_KEY_1 not set (script will fail at SEARCH phase)" -ForegroundColor Yellow
}

if ($env:ELEVENLABS_API_KEY) {
  Write-Host "  ✅ ELEVENLABS_API_KEY is set" -ForegroundColor Green
} else {
  Write-Host "  ⚠️  ELEVENLABS_API_KEY not set (will fallback to gTTS)" -ForegroundColor Yellow
}
Write-Host ""

# Check 2: Files Exist
Write-Host "CHECK 2: File Structure" -ForegroundColor Yellow
if (Test-Path "server/videoPipeline.mjs") {
  Write-Host "  ✅ server/videoPipeline.mjs exists" -ForegroundColor Green
} else {
  Write-Host "  ❌ server/videoPipeline.mjs NOT found" -ForegroundColor Red
  $allChecked = $false
}

if (Test-Path "src/components/VideoBuildGlassContainer.tsx") {
  Write-Host "  ✅ VideoBuildGlassContainer.tsx exists" -ForegroundColor Green
} else {
  Write-Host "  ❌ VideoBuildGlassContainer.tsx NOT found" -ForegroundColor Red
  $allChecked = $false
}

if (Test-Path "server.mjs") {
  Write-Host "  ✅ server.mjs exists" -ForegroundColor Green
} else {
  Write-Host "  ❌ server.mjs NOT found" -ForegroundColor Red
  $allChecked = $false
}
Write-Host ""

# Check 3: Node Modules
Write-Host "CHECK 3: NPM Dependencies" -ForegroundColor Yellow
if (Test-Path "node_modules/ffmpeg-static") {
  Write-Host "  ✅ ffmpeg-static installed" -ForegroundColor Green
} else {
  Write-Host "  ❌ ffmpeg-static NOT installed (run: npm install ffmpeg-static)" -ForegroundColor Red
  $allChecked = $false
}

if (Test-Path "node_modules/.bin/ffmpeg*") {
  Write-Host "  ✅ ffmpeg binary available" -ForegroundColor Green
}
Write-Host ""

# Check 4: FFmpeg Binary
Write-Host "CHECK 4: FFmpeg Binary" -ForegroundColor Yellow
try {
  $ffmpegOutput = & ffmpeg -version 2>&1 | Select-Object -First 1
  if ($ffmpegOutput) {
    Write-Host "  ✅ ffmpeg found: $ffmpegOutput" -ForegroundColor Green
  }
} catch {
  Write-Host "  ⚠️  ffmpeg not in PATH (will use bundled version from ffmpeg-static)" -ForegroundColor Yellow
}
Write-Host ""

# Check 5: Node Version
Write-Host "CHECK 5: Node.js Version" -ForegroundColor Yellow
try {
  $nodeVersion = & node --version
  Write-Host "  ✅ Node.js $nodeVersion" -ForegroundColor Green
  
  # Node 18+ has fetch built-in
  $nodeMajor = [int]$nodeVersion.Split('.')[0].TrimStart('v')
  if ($nodeMajor -ge 18) {
    Write-Host "  ✅ Built-in fetch available (Node 18+)" -ForegroundColor Green
  } else {
    Write-Host "  ⚠️  Old Node version, may need node-fetch package" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  ❌ Node.js not found" -ForegroundColor Red
  $allChecked = $false
}
Write-Host ""

# Check 6: Code Syntax
Write-Host "CHECK 6: Code Syntax Validation" -ForegroundColor Yellow
try {
  & node -c "server/videoPipeline.mjs" 2>$null
  Write-Host "  ✅ videoPipeline.mjs syntax OK" -ForegroundColor Green
} catch {
  Write-Host "  ❌ Syntax error in videoPipeline.mjs" -ForegroundColor Red
  $allChecked = $false
}

try {
  & node -c "server.mjs" 2>$null
  Write-Host "  ✅ server.mjs syntax OK" -ForegroundColor Green
} catch {
  Write-Host "  ❌ Syntax error in server.mjs" -ForegroundColor Red
  $allChecked = $false
}
Write-Host ""

# Check 7: Temp Directory
Write-Host "CHECK 7: Temp Directory" -ForegroundColor Yellow
$tempPath = if ($IsWindows) { $env:TEMP } else { "/tmp" }
if (Test-Path $tempPath) {
  Write-Host "  ✅ Temp directory: $tempPath" -ForegroundColor Green
  
  # Check if writable
  $testFile = Join-Path $tempPath "alphatekx-test.txt"
  try {
    "test" | Out-File -FilePath $testFile -ErrorAction Stop
    Remove-Item $testFile -ErrorAction SilentlyContinue
    Write-Host "  ✅ Temp directory is writable" -ForegroundColor Green
  } catch {
    Write-Host "  ❌ Temp directory is NOT writable" -ForegroundColor Red
    $allChecked = $false
  }
} else {
  Write-Host "  ❌ Temp directory not found" -ForegroundColor Red
  $allChecked = $false
}
Write-Host ""

# Summary
if ($allChecked) {
  Write-Host "============================================" -ForegroundColor Green
  Write-Host "✅ ALL CHECKS PASSED - Ready to deploy!" -ForegroundColor Green
  Write-Host "============================================" -ForegroundColor Green
  Write-Host ""
  Write-Host "Next steps:" -ForegroundColor Cyan
  Write-Host "  1. npm run dev" -ForegroundColor White
  Write-Host "  2. In another terminal, test the video generation:" -ForegroundColor White
  Write-Host ""
  Write-Host '  curl -X POST http://localhost:3001/api/alpha/video-stream `' -ForegroundColor White
  Write-Host '    -H "Content-Type: application/json" `' -ForegroundColor White
  Write-Host '    -d "{\"prompt\":\"amazing story\",\"plan\":\"free\"}"' -ForegroundColor White
  Write-Host ""
} else {
  Write-Host "============================================" -ForegroundColor Red
  Write-Host "⚠️  SOME CHECKS FAILED" -ForegroundColor Red
  Write-Host "============================================" -ForegroundColor Red
  Write-Host "Fix the issues above and run validation again" -ForegroundColor Yellow
}
