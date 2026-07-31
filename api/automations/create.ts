import { supabase } from '../../src/lib/supabase';

export default async function handler(req: Request) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  
  try {
    const body = await req.json();
    const { user_id, topic, goal, platforms, audience, tone, post_length, post_time, post_days, timezone } = body;

    if (!user_id || !topic || !post_time || !post_days) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400 });
    }

    // Calculate next post time
    const { calculateNextPost } = await import('../../src/lib/scheduling/nextPostCalculator');
    const nextPostAt = calculateNextPost(post_days, post_time, timezone || 'Africa/Lagos');

    const { data, error } = await supabase!.from('automations').insert({
      user_id,
      topic,
      goal: goal || '',
      platforms: platforms || [],
      audience: audience || '',
      tone: tone || '',
      post_length: post_length || 'medium',
      post_time,
      post_days,
      timezone: timezone || 'Africa/Lagos',
      next_post_at: nextPostAt.toISOString(),
      status: 'active',
    }).select('id').single();

    if (error) throw error;

    return new Response(JSON.stringify({ success: true, id: data?.id, next_post_at: nextPostAt.toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Failed to create automation' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}