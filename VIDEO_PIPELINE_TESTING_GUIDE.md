# AlphaTekX Video Pipeline - Testing & Validation Guide

## ✅ Fixes Applied

### 1. **Groq JSON Parsing** (Phase 1)
**Problem**: Simple regex `/.../` could fail if JSON had nested arrays or special chars
**Fix**: 
- Retry logic: 3 attempts with 2-second delays between failures
- Multi-pattern extraction: tries standard array, markdown JSON, generic markdown
- Better prompt: explicitly says "NO markdown, NO code blocks"
- Lower temperature (0.6 vs 0.7) for more consistent output

**Test**: Prompt Groq and verify `state.json` contains valid `script.json` with 6 scenes

### 2. **MrBeast Zoom Effects** (Phase 4)
**Problem**: Old zoom was oscillating (`abs(sin(...))`) instead of building tension
**Fix**:
- Linear zoom: starts at 1.0, smoothly zooms to 1.2 over scene duration
- Formula: `z='1.0+(t/duration)*(1.2-1.0)'`
- Proper duration: uses actual scene duration not fixed `d=1`
- FFmpeg 30fps for smooth motion

**Test**: Watch a generated video - should see smooth "pull in" zoom effect

### 3. **Audio Mixing in Final Video** (Phase 5)
**Problem**: Narration audio wasn't included in final concat - video was silent or had only video soundtrack
**Fix**:
- Collect all voice-N.mp3 files during concat phase
- Use FFmpeg `-filter_complex` with `concat` filter
- Mix video audio with narration audio: `[0:a:0][1:a:0][2:a:0]...concat=n=N:v=0:a=1[aout]`
- Audio codec: AAC at 192k bitrate

**Test**: Download final video and verify you hear narration

### 4. **Audio Codec in Edited Clips** (Phase 4)
**Problem**: Changed from `-an` (no audio) to `-c:a aac -b:a 128k`
**Fix**: Now each edited clip preserves audio from original video

**Test**: Click through edited clips folder - each should play with audio

### 5. **Better Error Messages**
**Problem**: Vague error messages made debugging hard
**Fix**:
- Groq API errors show HTTP status code
- Each phase logs retry attempts
- FFmpeg fallback chain shows what's being tried

**Test**: Trigger errors and check server logs

---

## 🧪 Testing Checklist

### Prerequisites
```bash
# Verify environment variables are set
echo $GROQ_API_KEY              # Must have Groq API key
echo $PEXELS_API_KEY_1          # Must have Pexels key
echo $ELEVENLABS_API_KEY        # Optional (has gTTS fallback)
echo $ELEVENLABS_API_KEY_1      # Optional

# Verify FFmpeg installed
which ffmpeg
# or on Windows:
where ffmpeg
```

### Test 1: Simple Free Plan Video (6 scenes, 2 min)
```bash
# Start server
npm run dev

# In another terminal, test the endpoint
curl -X POST http://localhost:3001/api/alpha/video-stream \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer test-user-token" \
  -d '{"prompt":"history of Africa","plan":"free"}' \
  | tee video_response.log
```

**Expected Output** (SSE stream):
```
data: {"phase":"starting","message":"Starting free video (6 scenes, 120s)","totalScenes":6}
data: {"phase":"script","message":"Script ready - 6 scenes written"}
data: {"phase":"narration","clipIndex":0,"message":"Voice 1/6 ready"}
data: {"phase":"narration","clipIndex":1,"message":"Voice 2/6 ready"}
... (6 narration events)
data: {"phase":"search","clipIndex":0,"message":"Clip 1/6 ready"}
... (6 search events)
data: {"phase":"editing","clipIndex":0,"message":"Scene 1/6 edited"}
... (6 editing events)
data: {"phase":"final","message":"Final 120s video ready!","finalVideoUrl":"..."}
data: {"phase":"complete","finalVideoUrl":"https://...","size":45678901}
```

**Verify**:
- ✅ All 6 scenes progress through narration → search → editing → final
- ✅ Each phase completes before next starts
- ✅ No errors in 500 range
- ✅ `finalVideoUrl` is present and valid

### Test 2: Check Job Directory Structure
After test above completes, verify:

```bash
# Check temp directory was created
ls -la /tmp/alpha-*

# Should see:
# - state.json (phase tracking)
# - script.json (6 scenes with narrations)
# - voices/ (6 MP3 files)
# - clips/ (6 MP4 files, 6 JPG thumbnails)
# - edited/ (6 edited MP4 files)
# - concat.txt (ffmpeg concat demuxer)
# - final-120sec.mp4 (output video)
```

### Test 3: State.json Continuation
1. Start generating a video (6 scenes)
2. **Kill the server after 3 scenes narrated** (watch logs for "narration: Scene 3")
3. Restart server with same jobId
4. **Should resume at scene 4 in narration phase** (not restart from 0)

```bash
# During narration phase (around 5-10 seconds in):
Ctrl+C  # Kill server

# Check state.json
cat /tmp/alpha-{jobId}/state.json
# Should show: "phase": "narration", "completedScenes": { "narration": 3, ... }

# Restart server
npm run dev

# Resume same request - it should skip scenes 0-2, start at 3
```

### Test 4: MrBeast Zoom Effect
1. Generate a Creator tier video (20 scenes, MrBeast effects)
2. Download final video
3. Watch any scene - **should see smooth "zoom in" effect**

```bash
curl -X POST http://localhost:3001/api/alpha/video-stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"viral challenge","plan":"creator"}' \
  > creator_video.log 2>&1 &

# Extract video URL from log when complete
grep finalVideoUrl creator_video.log | jq '.finalVideoUrl'

# Download and play with VLC or ffplay
ffplay "https://..."
```

**Verify**:
- ✅ Video plays smoothly
- ✅ Each scene has smooth zoom (1.0 → 1.2)
- ✅ Text overlays appear (if narration has on-screen text)
- ✅ Video duration matches plan (Creator = 480s = 8min)

### Test 5: Audio Narration in Final Video
```bash
# After generating a video, check audio with ffprobe
ffprobe -v error -select_streams a -show_entries stream=codec_type /tmp/alpha-{jobId}/final-120sec.mp4

# Should show:
# codec_type=audio

# Or extract audio track
ffmpeg -i /tmp/alpha-{jobId}/final-120sec.mp4 -q:a 9 -extract_audio -vn audio.mp3

# Play audio to verify narration
ffplay audio.mp3
```

### Test 6: Fallback Chains (Error Scenarios)
Test each fallback by temporarily breaking upstream service:

**Groq Failure → Manual Fallback**:
```bash
# Set bad GROQ_API_KEY
export GROQ_API_KEY="bad-key"

# Send request
# After 3 attempts, should error with: "Groq API failed after 3 attempts"
# Check server logs show "[SCRIPT] Attempt 1", "[SCRIPT] Attempt 2", "[SCRIPT] Attempt 3"
```

**Pexels Failure → Blank Clip**:
```bash
# Send request for narration to work, kill Pexels by bad API key
# Should see logs: "[SEARCH] No Pexels clip found, will use blank"
# Video should still generate with black/blank clips
```

**ElevenLabs Failure → gTTS Fallback**:
```bash
# Set bad ELEVENLABS_API_KEY
export ELEVENLABS_API_KEY="bad"

# Send request
# Should see: "[NARRATION] Scene 0: ElevenLabs failed, using fallback"
# Then: "[NARRATION] Scene 0: Generating with gTTS fallback..."
```

**FFmpeg Zoom Failure → Basic Scale**:
```bash
# Can't easily test, but logs should show:
# "[EDITING] Scene 0: Full edit failed, retrying with basic scale"
# "[EDITING] Scene 0: Even basic edit failed, copying input"
```

---

## 🚀 Performance Expectations

### Free Plan (6 scenes, 2 min video)
- **SCRIPT**: 5-10s (Groq API)
- **NARRATION**: 6-12s (1 call/scene, 300ms between)
- **SEARCH**: 30-60s (Pexels downloads + retries)
- **EDITING**: 60-90s (FFmpeg processing, 400ms between)
- **CONCAT**: 10-20s (video muxing)
- **Total**: **2-3 minutes**

### Creator Plan (20 scenes, 8 min video)
- Same phases but 20 scenes
- **Total**: **6-8 minutes**

### Beast Plan (32 scenes, 13 min video)
- Same phases but 32 scenes
- **Total**: **10-15 minutes**

### Optimization Notes
- FFmpeg preset is `veryfast` (prioritizes speed over file size)
- CRF 23 is "visually lossless" for streaming
- AAC audio at 192k gives good quality
- Zoom effect (zoompan) is CPU-intensive, may need `-threads auto`

---

## 🐛 Debugging Guide

### Enable Verbose Logging
```bash
# In server/videoPipeline.mjs, change log() to always output
// Already enabled - all [PHASE] logs go to console.log

# Check container logs (if running in Docker)
docker logs alphatekx-server --follow
```

### Check Phase State
```bash
# At any point, cat state.json to see progress
cat /tmp/alpha-{jobId}/state.json

# Example output:
{
  "phase": "editing",
  "totalScenes": 6,
  "completedScenes": {
    "script": 0,
    "narration": 6,
    "search": 6,
    "editing": 3,
    "concat": 0
  },
  "failedRetries": {}
}
```

### Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `Groq API error (401)` | Bad API key | Check `GROQ_API_KEY` env var |
| `Groq API failed after 3 attempts` | Rate limited or down | Wait 5min, check groq.com status |
| `Invalid Groq response` | JSON parsing failed | Check Groq prompt is clear |
| `Not enough edited scenes ready: X/6` | Phase failed prematurely | Check FFmpeg binary path, disk space |
| `Glass Studio could not initialize` | Network/CORS error | Check server is running, endpoint URL correct |
| `Video file too large` | Concat filter failed | Reduce resolution or duration in PLAN_CONFIG |

### FFmpeg Issues

**No FFmpeg found**:
```bash
# If ffmpeg-static isn't working
npm install ffmpeg-static

# Or specify path manually
export FFMPEG_PATH="/usr/bin/ffmpeg"
```

**Zoom filter error**:
```bash
# Check FFmpeg has zoompan support
ffmpeg -filters | grep zoompan

# If missing, update FFmpeg
brew install ffmpeg  # macOS
apt-get install ffmpeg  # Linux
```

**Audio codec not found**:
```bash
# Check AAC encoder available
ffmpeg -codecs | grep aac

# Fallback to libmp3lame if needed
# Edit videoPipeline.mjs: change '-c:a', 'aac' to '-c:a', 'libmp3lame'
```

---

## 📊 Monitoring & Metrics

### Job Status Endpoint
```bash
curl http://localhost:3001/api/alpha/video/{jobId}/status

# Returns:
{
  "job": {
    "id": "uuid",
    "status": "completed|failed|running",
    "events": [...],  # Last 100 SSE events
    "result": {
      "finalVideoUrl": "...",
      "scenes": 6,
      "duration": 120,
      "plan": "free",
      "size": 45678901
    },
    "error": null
  }
}
```

### Success Metrics
- ✅ `status === "completed"`
- ✅ `result.finalVideoUrl` is valid URL (not null)
- ✅ `result.size > 1000000` (at least 1MB)
- ✅ Video plays with audio using `ffplay` or browser

### Failure Metrics
- ❌ `status === "failed"`
- ❌ `error` field contains error message
- ❌ Check logs for which phase failed

---

## 🎯 Final Checklist Before Production

- [ ] Environment variables set: GROQ_API_KEY, PEXELS_API_KEY_1, ELEVENLABS_API_KEY (optional)
- [ ] FFmpeg installed and `ffmpeg-static` npm package working
- [ ] Test free plan video generates in 2-3 minutes
- [ ] Test audio narration in final video (not silent)
- [ ] Test zoom effect is smooth (not jerky)
- [ ] Test server restart resumes video generation (not from scratch)
- [ ] Test error scenarios don't crash pipeline
- [ ] Logs show [PHASE] tags clearly
- [ ] Job directory gets cleaned up after video generated
- [ ] Frontend Glass Studio component receives all SSE events
- [ ] Video URLs are signed/accessible to user

---

## 💡 Quick Start Command
```bash
# Terminal 1: Start server
npm run dev

# Terminal 2: Generate free video
curl -X POST http://localhost:3001/api/alpha/video-stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"amazing story","plan":"free"}'
```

**Expected**: Video generated in 2-3 minutes, download link in final SSE event.
