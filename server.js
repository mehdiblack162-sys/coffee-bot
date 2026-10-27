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

// ديمو ويب: صفحة دردشة كتخدم بنفس البوت (بلا واتساب)
const fs = require('fs');
const path = require('path');
const hits = new Map(); // حماية بسيطة: 20 رسالة فالدقيقة لكل IP
function limited(ip) {
  const now = Date.now();
  const a = (hits.get(ip) || []).filter((t) => now - t < 60000);
  a.push(now); hits.set(ip, a);
  return a.length > 20;
}

async function demoChat(req, res) {
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 5000) break; }
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (limited(ip)) { res.writeHead(429); return res.end(JSON.stringify({ replies: ['بزاف د الرسائل، تسنا دقيقة 🙏'] })); }
  try {
    const { sid, text } = JSON.parse(raw);
    const id = 'demo-' + String(sid || 'x').replace(/[^a-z0-9]/gi, '').slice(0, 20);
    const msg = String(text || '').slice(0, 500);
    const out = handle(id, msg);
    const replies = [...out.replies];
    if (out.needsAI) {
      try { replies.push((await ai.reply(id, msg)).text); }
      catch (e) { replies.push(...fallbackReplies(id)); }
    }
    res.writeHead(200); res.end(JSON.stringify({ replies, notified: !!out.notifyOwner }));
  } catch (e) { res.writeHead(400); res.end(JSON.stringify({ replies: ['خطأ، عاود.'] })); }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/demo' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(fs.readFileSync(path.join(__dirname, 'demo.html')));
  }
  if (url.pathname === '/demo/chat' && req.method === 'POST') return demoChat(req, res);
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
