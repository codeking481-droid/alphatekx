import ffmpegPath from 'ffmpeg-static';
import { execFileSync } from 'node:child_process';

try {
  const out = execFileSync(ffmpegPath, ['-version'], { encoding: 'utf8', timeout: 10000 });
  console.log('FFmpeg version:', out.split('\n')[0]);
  console.log('FFmpeg OK');
} catch (err) {
  console.error('FFmpeg FAILED:', err.message);
}
