// Vercel Edge Function — 뉴럴 TTS 프록시
// ElevenLabs 키가 있으면 우선(다국어 자연스러움), 없으면 OpenAI. 둘 다 없으면 503 → 프론트가 기기음성으로 폴백.
export const config = { runtime: 'edge' };

export default async function handler(req){
  if(req.method !== 'POST') return new Response('Method Not Allowed', { status:405 });
  let body; try { body = await req.json(); } catch(e){ return new Response('bad json', { status:400 }); }
  const { text, lang, pass, voice } = body || {};

  if(!process.env.APP_PASSCODE || pass !== process.env.APP_PASSCODE) return new Response('unauthorized', { status:401 });
  if(typeof text !== 'string' || !text.trim() || text.length > 400) return new Response('bad text', { status:400 });

  const isKo = (lang || '').toLowerCase().startsWith('ko');
  const reqVoice = (typeof voice === 'string' && /^[A-Za-z0-9]{16,40}$/.test(voice)) ? voice : null;
  const audioHeaders = { 'content-type':'audio/mpeg', 'cache-control':'no-store' };

  // 1) ElevenLabs (다국어 v2 — 일/한 자연스러움). 클라이언트 선택 > env > 기본.
  if(process.env.ELEVENLABS_API_KEY){
    const voice = reqVoice || (isKo ? process.env.ELEVEN_VOICE_KO : process.env.ELEVEN_VOICE_JA)
      || process.env.ELEVEN_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
    const r = await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+voice, {
      method:'POST',
      headers:{ 'xi-api-key':process.env.ELEVENLABS_API_KEY, 'content-type':'application/json', 'accept':'audio/mpeg' },
      body: JSON.stringify({ text, model_id:'eleven_multilingual_v2', voice_settings:{ stability:0.4, similarity_boost:0.85, style:0.3 } })
    });
    if(!r.ok){ const t=await r.text().catch(()=> ''); return new Response('eleven '+r.status+' '+t.slice(0,120), { status:502 }); }
    return new Response(r.body, { headers: audioHeaders });
  }

  // 2) OpenAI TTS. 보이스/모델 env로 교체 가능(기본: 깊고 간지나는 onyx).
  if(process.env.OPENAI_API_KEY){
    const voice = (isKo ? process.env.OPENAI_VOICE_KO : process.env.OPENAI_VOICE_JA)
      || process.env.OPENAI_TTS_VOICE || 'onyx';
    const model = process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts';
    const r = await fetch('https://api.openai.com/v1/audio/speech', {
      method:'POST',
      headers:{ 'authorization':'Bearer '+process.env.OPENAI_API_KEY, 'content-type':'application/json' },
      body: JSON.stringify({ model, voice, input:text, response_format:'mp3' })
    });
    if(!r.ok){ const t=await r.text().catch(()=> ''); return new Response('openai '+r.status+' '+t.slice(0,120), { status:502 }); }
    return new Response(r.body, { headers: audioHeaders });
  }

  return new Response('tts not configured', { status:503 });
}
