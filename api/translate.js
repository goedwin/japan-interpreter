// Vercel Edge Function — 한일 통역 프록시
// 키는 환경변수에만 보관(클라이언트/소스에 노출 X). 암호 통과한 요청만 통역 용도로 처리.
export const config = { runtime: 'edge' };

const MODEL = 'claude-haiku-4-5';
const SYS = '너는 한일 통역기다. 처음 친해지려는 두 사람의 대화를 통역한다. 예의 바른 존댓말(정중체)을 유지하되, 교과서처럼 딱딱하지 않게 실제 사람이 말하듯 자연스럽고 따뜻한 구어체로 옮긴다. 원문의 뉘앙스·감정을 살린다. 지시한 형식만 정확히 출력하고 다른 말/따옴표/번호는 절대 붙이지 않는다.';

function toneNote(tone){
  return ' 두 사람의 친밀도는 0~100 중 '+tone+'이다(0=처음 만난 사이의 매우 정중한 말투[존댓말·敬語], 50=어느 정도 친해진 부드러운 정중체, 100=아주 친한 사이의 편한 반말[タメ口]). 이 친밀도에 어울리는 말투 수위로 옮겨라.';
}
function buildPrompt(text, dir, tone){
  if(dir === 'ko2ja'){
    return '다음 한국어를 일본어로 통역하고, 그 일본어 발음을 한글로 적어라.'+toneNote(tone)+'\n'+
      '한글 발음 규칙: 한국인이 그대로 소리 내면 일본인이 알아듣도록 실제 발음에 최대한 가깝게. '+
      '촉음(っ)은 앞 글자 받침으로(예: ちょっと→촛토), ん은 뒤소리에 맞춰 ㄴ/ㅁ/ㅇ으로, '+
      '장음은 과하게 늘리지 말고 자연스럽게, 단어 단위로 띄어 읽기 좋게 적어라.\n'+
      '출력은 딱 두 줄:\n1번째 줄: 일본어\n2번째 줄: 한글 발음\n\n한국어: '+text;
  }
  return '다음 일본어를 한국어로 자연스럽게 통역하고, 그 한국어를 일본인이 소리 내어 읽을 수 있게 가타카나로 적어라.'+toneNote(tone)+'\n'+
    '가타카나 발음 규칙: 일본인이 그대로 읽으면 한국인이 알아듣도록 최대한 가깝게. '+
    '받침은 ッ/ン 등 작은 가나나 ン으로 자연스럽게 처리하고, 단어 단위로 띄어 읽기 좋게 적어라.\n'+
    '출력은 딱 두 줄:\n1번째 줄: 한국어\n2번째 줄: 가타카나 발음\n\n일본어: '+text;
}

export default async function handler(req){
  if(req.method !== 'POST') return new Response('Method Not Allowed', { status:405 });

  let body;
  try { body = await req.json(); } catch(e){ return new Response('bad json', { status:400 }); }
  const { text, dir, pass, tone } = body || {};

  // 암호 게이트
  if(!process.env.APP_PASSCODE || pass !== process.env.APP_PASSCODE){
    return new Response(JSON.stringify({ error:'unauthorized' }), { status:401, headers:{'content-type':'application/json'} });
  }
  // 입력 검증 (통역 용도로만 + 남용 방지)
  if(typeof text !== 'string' || !text.trim() || text.length > 400) return new Response('bad text', { status:400 });
  if(dir !== 'ko2ja' && dir !== 'ja2ko') return new Response('bad dir', { status:400 });
  if(!process.env.ANTHROPIC_API_KEY) return new Response('server not configured', { status:500 });

  let toneVal = Number(tone);
  if(!Number.isFinite(toneVal)) toneVal = 20;          // 기본값: 정중 쪽
  toneVal = Math.max(0, Math.min(100, Math.round(toneVal)));

  const upstream = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 400, stream: true, system: SYS,
      messages:[{ role:'user', content: buildPrompt(text, dir, toneVal) }]
    })
  });

  if(!upstream.ok || !upstream.body){
    const t = await upstream.text().catch(()=> '');
    return new Response('upstream '+upstream.status+' '+t.slice(0,160), { status:502 });
  }
  // Anthropic SSE 스트림을 그대로 클라이언트로 통과
  return new Response(upstream.body, { headers:{ 'content-type':'text/event-stream; charset=utf-8', 'cache-control':'no-cache' } });
}
