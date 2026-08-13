# AlphaTekX Video Pipeline - End-to-End Test Guide

## 🚀 Quick Start (2 minutes to video)

### Step 1: Set Up Environment Variables

```powershell
# Set your API keys (required for full testing)
$env:GROQ_API_KEY = "your-groq-api-key"
$env:PEXELS_API_KEY_1 = "your-pexels-api-key"
$env:ELEVENLABS_API_KEY = "your-elevenlabs-api-key"  # Optional, falls back to gTTS

# Verify they're set
echo $env:GROQ_API_KEY
echo $env:PEXELS_API_KEY_1
```

### Step 2: Start the Development Server

```powershell
# Terminal 1
npm run dev

# Wait for server to start (look for: "listening on port 3001" or similar)
```

### Step 3: Generate Your First Video

```powershell
# Terminal 2 - Generate a free plan video (6 scenes, 2 minutes)
$prompt = "amazing story about space exploration"
$plan = "free"

$response = Invoke-WebRequest -Uri "http://localhost:3001/api/alpha/video-stream" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body (@{prompt=$prompt; plan=$plan} | ConvertTo-Json) `
  -UseBasicParsing

# Stream the SSE response
$response.Content | Write-Host
```

**Expected output** (SSE stream):
```
data: {"phase":"starting","message":"Starting free video (6 scenes, 120s)..."}
data: {"phase":"script","message":"Script ready - 6 scenes written"}
data: {"phase":"narration","clipIndex":0,"message":"Voice 1/6 ready"}
data: {"phase":"narration","clipIndex":1,"message":"Voice 2/6 ready"}
...continues through all phases...
data: {"phase":"complete","finalVideoUrl":"https://...","size":45678901}
```

---

## 📊 Test Phases & What to Expect

### Phase 1: SCRIPT GENERATION (5-10 seconds)
✅ **What happens**:
- Groq API generates viral video script
- Creates 6 scenes (for free plan)
- Each scene has narration, keywords, text overlay

✅ **How to verify**:
```powershell
# Check script was created
Get-ChildItem $env:TEMP\alpha-* -Recurse -Filter "script.json" | Select-Object FullName
cat (Get-ChildItem $env:TEMP\alpha-* -Recurse -Filter "script.json" | Select-Object -First 1 -ExpandProperty FullName)
```

### Phase 2: NARRATION GENERATION (6-12 seconds)
✅ **What happens**:
- Generates MP3 voice files from narration text
- Uses ElevenLabs (professional) → gTTS (free Google) → silent (fallback)
- Creates voice-0.mp3, voice-1.mp3, ..., voice-5.mp3

✅ **How to verify**:
```powershell
# Check voice files exist
Get-ChildItem $env:TEMP\alpha-*\voices\*.mp3 | Select-Object Name, Length

# Play a voice file
& ffplay "$env:TEMP\alpha-{jobId}\voices\voice-0.mp3"
```

### Phase 3: SEARCH & DOWNLOAD (30-60 seconds)
✅ **What happens**:
- Searches Pexels API for video clips
- Uses keywords from narration
- Downloads MP4 clips (full video files)
- Saves thumbnail images (JPG)

✅ **How to verify**:
```powershell
# Check clips downloaded
Get-ChildItem $env:TEMP\alpha-*\clips\*.mp4 | Select-Object Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB, 2)}}

# Play a clip
& ffplay "$env:TEMP\alpha-{jobId}\clips\clip-0.mp4"
```

### Phase 4: EDITING (60-90 seconds)
✅ **What happens**:
- FFmpeg applies effects to each clip
- Zoom effect: 1.0 → 1.2 over duration
- Text overlays with narration
- Encodes to H.264, AAC audio

✅ **How to verify**:
```powershell
# Check edited clips
Get-ChildItem $env:TEMP\alpha-*\edited\*.mp4 | Select-Object Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB, 2)}}

# Play an edited clip (should see zoom effect!)
& ffplay "$env:TEMP\alpha-{jobId}\edited\edited-0.mp4"
```

### Phase 5: CONCAT (10-20 seconds)
✅ **What happens**:
- Combines all 6 edited clips into one video
- Mixes narration audio from voice files
- Creates final output file: final-120sec.mp4

✅ **How to verify**:
```powershell
# Check final video exists
Get-ChildItem $env:TEMP\alpha-*\final-*.mp4 | Select-Object Name, @{N='Size(MB)';E={[math]::Round($_.Length/1MB, 2)}}

# Play final video (should have narration audio!)
& ffplay "$env:TEMP\alpha-{jobId}\final-120sec.mp4"
```

---

## 🧪 Specific Tests

### Test 1: Verify Audio in Final Video
```powershell
# Extract audio from final video
$jobId = (Get-ChildItem $env:TEMP\alpha-* -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Split-Path -Leaf).Replace('alpha-', '')
$videoPath = "$env:TEMP\alpha-$jobId\final-120sec.mp4"

# Extract audio to MP3
ffmpeg -i $videoPath -q:a 9 -extract_audio -vn "$env:TEMP\alpha-$jobId\extracted-audio.mp3"

# Play to verify narration is there
& ffplay "$env:TEMP\alpha-$jobId\extracted-audio.mp3"

# Check audio codec
ffprobe -v error -select_streams a -show_entries stream=codec_type,codec_name,bit_rate $videoPath
```

**Expected output**:
```
codec_type=audio
codec_name=aac
bit_rate=192000
```

### Test 2: Verify Zoom Effect
```powershell
# Play final video and watch for smooth "zoom in" effect
& ffplay "$env:TEMP\alpha-$jobId\final-120sec.mp4"

# Each scene should:
# ✅ Start at 1.0x zoom
# ✅ Smoothly zoom to 1.2x
# ✅ Have text overlay in middle
# ✅ Have narration audio
```

### Test 3: Verify Video Quality
```powershell
# Check video properties
ffprobe -v error -select_streams v:0 `
  -show_entries stream=width,height,codec_name,pix_fmt,r_frame_rate `
  -of default=noprint_wrappers=1:nokey=1 `
  "$env:TEMP\alpha-$jobId\final-120sec.mp4"

# Expected for free plan:
# width=1280
# height=720
# codec_name=h264
# pix_fmt=yuv420p
# r_frame_rate=30/1
```

### Test 4: Test Plan Tier Differences

#### Test 4a: Free Plan (6 scenes, 2 min)
```powershell
$response = Invoke-WebRequest `
  -Uri "http://localhost:3001/api/alpha/video-stream" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body (@{prompt="test"; plan="free"} | ConvertTo-Json)

# Should complete in ~2-3 minutes
# Should have 6 scenes
# Should be 720p resolution
```

#### Test 4b: Creator Plan (20 scenes, 8 min)
```powershell
$response = Invoke-WebRequest `
  -Uri "http://localhost:3001/api/alpha/video-stream" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body (@{prompt="test"; plan="creator"} | ConvertTo-Json)

# Should complete in ~6-8 minutes
# Should have 20 scenes (watch progress in UI)
# Should be 1080p resolution
# Zoom effect should be more pronounced
```

### Test 5: Test Server Restart Recovery

```powershell
# Terminal 1: Start server
npm run dev

# Terminal 2: Start video generation
$response = Invoke-WebRequest `
  -Uri "http://localhost:3001/api/alpha/video-stream" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body (@{prompt="test"; plan="free"} | ConvertTo-Json)

# After ~10 seconds (during NARRATION phase), note the jobId from console
# You should see: [NARRATION] Scene 3: Voice ready

# Terminal 1: Kill server (Ctrl+C)

# Check state.json
cat "$env:TEMP\alpha-{jobId}\state.json"
# Should show: "phase": "narration", "completedScenes": {"narration": 3}

# Terminal 1: Restart server
npm run dev

# Terminal 2: Make same request again
# Should see: [NARRATION] Scene 4 (not Scene 0)
# ✅ Confirmed: Resumed from checkpoint!
```

### Test 6: Test Error Handling

#### Test 6a: Bad Groq API Key
```powershell
$env:GROQ_API_KEY = "bad-key"

# Try to generate video
$response = Invoke-WebRequest `
  -Uri "http://localhost:3001/api/alpha/video-stream" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body (@{prompt="test"; plan="free"} | ConvertTo-Json)

# Server logs should show:
# [SCRIPT] Attempt 1: Groq API error (401): Invalid API key
# [SCRIPT] Attempt 2: Groq API error (401): Invalid API key
# [SCRIPT] Attempt 3: Groq API error (401): Invalid API key
# [SCRIPT] Groq API failed after 3 attempts
# ✅ Confirmed: Retry logic works, fails gracefully
```

#### Test 6b: Missing Pexels Key (Fallback to Blank Clips)
```powershell
# Don't set PEXELS_API_KEY_1
# Generate video anyway

# Server logs should show:
# [SEARCH] Scene 0: No Pexels clip found, will use blank
# ✅ Confirmed: Creates blank/black clips instead of crashing
```

---

## 🔍 Monitoring Progress

### Monitor Job Status
```powershell
# Get jobId from server logs or SSE response
$jobId = "your-job-id"

# Check job status endpoint
curl -Uri "http://localhost:3001/api/alpha/video/$jobId/status" | ConvertFrom-Json | ConvertTo-Json -Depth 10
```

### Watch Real-Time Logs
```powershell
# Terminal: Watch for phases
Get-Content server.log -Wait -Tail 50
# or if using npm run dev with console output:
# Just watch the terminal
```

### Check Temp Directory Growth
```powershell
# Watch temp directory size increase as video is built
$jobId = "your-job-id"
while ($true) {
  $size = (Get-ChildItem "$env:TEMP\alpha-$jobId" -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
  Write-Host "Temp size: $([math]::Round($size, 2))MB"
  Start-Sleep -Seconds 2
}
```

---

## ✅ Success Criteria

A successful video generation should have:

- ✅ **Completed all 5 phases**: Script → Narration → Search → Editing → Concat
- ✅ **Generated final video**: `/tmp/alpha-{jobId}/final-120sec.mp4` exists
- ✅ **Video has audio**: Can hear narration clearly
- ✅ **Video has zoom effect**: Smooth 1.0x → 1.2x zoom on each scene
- ✅ **Video has correct resolution**: 720p (free) or 1080p (starter+)
- ✅ **Video has correct duration**: 120s (free), 300s (starter), etc.
- ✅ **Text overlays visible**: On-screen text appears in middle of scenes
- ✅ **No errors in logs**: All phases completed without fatal errors
- ✅ **Speed reasonable**: Free plan <3 minutes total

---

## 🐛 Troubleshooting

| Issue | Diagnosis | Fix |
|-------|-----------|-----|
| Video generation stuck at SCRIPT | Check server logs for "Groq API error" | Verify GROQ_API_KEY is valid |
| Audio is missing/silent | Check voices/ folder for MP3 files | Verify ElevenLabs key OR gTTS fallback |
| Zoom effect looks bad or jerky | Check FFmpeg version | Ensure FFmpeg has zoompan filter |
| Video takes >5 minutes (free plan) | Check network/CPU | Check Pexels rate limiting in logs |
| Server crashes during generation | Check error logs | Verify /tmp directory has space |
| "Could not start video studio" error | SSE connection failed | Check CORS headers, endpoint URL |

---

## 📝 Test Log Template

When testing, save this template:

```
Test Date: 2026-08-13
Server: localhost:3001
Node Version: v24.11.1
FFmpeg: bundled (ffmpeg-static)
Plan: free
Prompt: "amazing story about space"

SCRIPT Phase:
  - Start time: 10:00:00
  - End time: 10:00:08
  - Duration: 8 seconds
  - Scenes generated: 6 ✅

NARRATION Phase:
  - Start time: 10:00:08
  - End time: 10:00:15
  - Duration: 7 seconds
  - Voices generated: 6/6 ✅

SEARCH Phase:
  - Start time: 10:00:15
  - End time: 10:00:45
  - Duration: 30 seconds
  - Clips downloaded: 6/6 ✅
  - Issues: None

EDITING Phase:
  - Start time: 10:00:45
  - End time: 10:01:50
  - Duration: 65 seconds
  - Scenes edited: 6/6 ✅
  - Zoom effect: Smooth ✅
  - Text overlays: Present ✅

CONCAT Phase:
  - Start time: 10:01:50
  - End time: 10:02:05
  - Duration: 15 seconds
  - Final video: 120 seconds ✅
  - Audio mixed: Yes ✅
  - File size: 48.5 MB

Total time: 2 minutes 5 seconds
Final video quality: 720p H.264
Audio quality: AAC 192kbps
Result: ✅ SUCCESS
```

---

## 🎯 Next Steps

After successful test:
1. ✅ Verify all 5 phases complete
2. ✅ Download and play final video
3. ✅ Listen for clear narration audio
4. ✅ Watch for smooth zoom effects
5. ✅ Try another plan tier (Starter, Creator)
6. ✅ Test server restart recovery
7. ✅ Monitor performance (timing)
8. ✅ Add cleanup job for temp files
9. ✅ Deploy to production

**Ready to release to users!** 🚀
