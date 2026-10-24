// تجربة بلا مفتاح حقيقي: كنعوضو fetch بنسخة مزيفة باش نتأكدو من المنطق
process.env.ANTHROPIC_API_KEY = 'test-key';
const calls = [];
global.fetch = async (url, opts) => {
  const body = JSON.parse(opts.body); calls.push({ url, headers: opts.headers, body });
  const last = body.messages[body.messages.length - 1].content;
  const text = /مدير|manager/i.test(last) ? 'غنعيطو ليك واحد منا. [HUMAN]' : 'التوصيل كاين لطنجة فـ 24 حتى 72 ساعة 🚚';
  return { ok: true, json: async () => ({ content: [{ type: 'text', text }] }) };
};
const { handle } = require('./bot'); const ai = require('./ai');
(async () => {
  const P = '212611111111';
  console.log('قاعدة (ما كتستعملش AI):', handle(P, 'سلام').needsAI, '| سؤال حر:', handle(P, 'واش كاين تخفيض إيلا شريت جوج؟').needsAI);
  let a = await ai.reply(P, 'واش كاين التوصيل لطنجة؟'); console.log('🤖', a.text, '| human =', a.human);
  a = await ai.reply(P, 'بغيت نهضر مع المدير'); console.log('🤖', a.text, '| human =', a.human);
  const c = calls[calls.length - 1];
  console.log('URL:', c.url, '| model:', c.body.model, '| رسائل فالتاريخ:', c.body.messages.length, '| أول دور:', c.body.messages[0].role);
  console.log('الـ prompt فيه الأثمنة؟', c.body.system.includes('530'));
})();
