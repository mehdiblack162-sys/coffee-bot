// سيرفر Webhook ديال WhatsApp Cloud API (Meta). بلا مكتبات خارجية، خاصو Node 18+
const http = require('http');
const { handle, fallbackReplies } = require('./bot');
const ai = require('./ai');

const { VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, OWNER_NUMBER, PORT = 3000 } = process.env;
const API = `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`;

async function send(to, body) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) console.error('خطأ فالإرسال:', res.status, await res.text());
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/webhook') { res.writeHead(200); return res.end('Bot is running'); }

  // 1) التحقق ديال Meta كي تسجل الـ webhook
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
    res.writeHead(ok ? 200 : 403); return res.end(ok ? url.searchParams.get('hub.challenge') : 'forbidden');
  }

  // 2) الرسائل الواردة
  if (req.method === 'POST') {
    let raw = ''; for await (const c of req) raw += c;
    res.writeHead(200); res.end('ok'); // لازم نجاوبو Meta بسرعة
    try {
      const msg = JSON.parse(raw).entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      if (!msg) return;
      const text = msg.type === 'text' ? msg.text.body : (msg.interactive?.button_reply?.title || '');
      const out = handle(msg.from, text);
      for (const r of out.replies) await send(msg.from, r);
      if (out.needsAI) {
        try {
          const a = await ai.reply(msg.from, text);
          await send(msg.from, a.text);
          if (a.human && OWNER_NUMBER) await send(OWNER_NUMBER, `🙋 زبون محتاج إنسان\nالرقم: ${msg.from}\nآخر رسالة: ${text}`);
        } catch (e) {
          console.error('AI error:', e.message);
          for (const r of fallbackReplies(msg.from)) await send(msg.from, r);
        }
      }
      if (out.notifyOwner && OWNER_NUMBER) await send(OWNER_NUMBER, out.notifyOwner);
    } catch (e) { console.error(e); }
  }
}).listen(PORT, () => console.log(`Bot كيسمع فالبورت ${PORT}`));
