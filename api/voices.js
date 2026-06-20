// Vercel Edge Function — 내 ElevenLabs 계정의 보이스 목록
// (라이브러리에서 일본/한국 네이티브 보이스를 Add 하면 여기 자동으로 잡힘)
export const config = { runtime: 'edge' };

export default async function handler(req){
  const url = new URL(req.url);
  const pass = url.searchParams.get('pass') || '';
  if(!process.env.APP_PASSCODE || pass !== process.env.APP_PASSCODE) return new Response('unauthorized', { status:401 });
  if(!process.env.ELEVENLABS_API_KEY) return new Response(JSON.stringify({ voices:[] }), { headers:{'content-type':'application/json'} });

  const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers:{ 'xi-api-key':process.env.ELEVENLABS_API_KEY } });
  if(!r.ok){ const t = await r.text().catch(()=> ''); return new Response('eleven '+r.status+' '+t.slice(0,120), { status:502 }); }
  const data = await r.json();
  const voices = (data.voices || []).map(v => {
    const L = v.labels || {};
    return {
      id: v.voice_id,
      name: v.name || '',
      gender: L.gender || '',
      lang: L.language || L.accent || L.descriptive || L.description || ''
    };
  });
  return new Response(JSON.stringify({ voices }), { headers:{ 'content-type':'application/json', 'cache-control':'no-store' } });
}
