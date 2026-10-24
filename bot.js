// منطق البوت: مستقل على واتساب باش نقدر نجربوه محليا
const catalog = require('./catalog.json');

const AI_ON = () => !!process.env.ANTHROPIC_API_KEY;
const sessions = new Map(); // phone -> { step, lang, order }

const FR_WORDS = /\b(bonjour|bonsoir|salut|prix|livraison|commande|commander|svp|s'il|merci|catalogue|garantie|combien|disponible|pièce|pièces)\b/i;
const AR_SCRIPT = /[؀-ۿ]/;

function detectLang(text, prev) {
  if (AR_SCRIPT.test(text)) return 'ar';
  if (FR_WORDS.test(text)) return 'fr';
  return prev || 'ar';
}

const T = {
  ar: {
    menu: () => `مرحبا بيك فـ *${catalog.shop.name}* ☕\nشنو بغيتي؟\n\n1️⃣ الكتالوج والأثمنة\n2️⃣ التوصيل\n3️⃣ الضمان\n4️⃣ ساعات العمل\n5️⃣ كلم واحد منا\n\nصيفط الرقم ديال الخيار.`,
    catalogHeader: 'هادو القطع المتوفرة 👇\n',
    catalogFooter: '\nصيفط *رقم* القطعة باش تعرف التفاصيل، ولا *0* للرجوع.',
    product: p => `*${p.name}*\n${p.desc}\n💰 الثمن: *${p.price.toLocaleString('fr-MA')} درهم*\n\nباغي تطلبها؟ صيفط *نعم*. ولا *0* للرجوع.`,
    askName: 'مزيان! شنو سميتك؟',
    askMachine: 'شنو ماركة وموديل المكينة ديالك؟ (مثلا La Cimbali، Nuova Simonelli، La Marzocco). هادشي باش نتأكدو بلي القطعة كتوافقها.',
    askCity: n => `تشرفنا ${n} 🙌 فأي مدينة؟`,
    done: (o, p) => `تسجل الطلب ✅\n\n📦 ${p.name}\n👤 ${o.name}\n📍 ${o.city}\n🔧 ${o.machine}\n\nغيتصل بيك واحد من الفريق قريب باش يأكد معاك التوافق والتوصيل والدفع. شكرا! ☕`,
    hours: () => `ساعات العمل: ${catalog.shop.hours} 🕘\nوالبوت كيجاوب 24/24.`,
    human: 'مزيان، صيفطت ليهم الرسالة وغيجاوبك واحد من الفريق فأقرب وقت 🙏',
    unknown: 'ما فهمتش مزيان 😅 صيفط *0* باش تشوف القائمة.',
    back: 'القائمة الرئيسية 👇',
  },
  fr: {
    menu: () => `Bienvenue chez *${catalog.shop.name}* ☕\nQue souhaitez-vous ?\n\n1️⃣ Catalogue et prix\n2️⃣ Livraison\n3️⃣ Garantie\n4️⃣ Horaires\n5️⃣ Parler à un conseiller\n\nEnvoyez le numéro de votre choix.`,
    catalogHeader: 'Voici nos pièces disponibles 👇\n',
    catalogFooter: '\nEnvoyez le *numéro* d\'une pièce pour les détails, ou *0* pour revenir.',
    product: p => `*${p.fr}*\n${p.descFr}\n💰 Prix : *${p.price.toLocaleString('fr-MA')} MAD*\n\nVous voulez commander ? Envoyez *oui*. Ou *0* pour revenir.`,
    askName: 'Parfait ! Quel est votre nom ?',
    askMachine: 'Quelle est la marque et le modèle de votre machine ? (ex. La Cimbali, Nuova Simonelli, La Marzocco) Pour vérifier la compatibilité.',
    askCity: n => `Merci ${n} 🙌 Dans quelle ville ?`,
    done: (o, p) => `Commande enregistrée ✅\n\n📦 ${p.fr}\n👤 ${o.name}\n📍 ${o.city}\n🔧 ${o.machine}\n\nUn membre de l'équipe vous contactera bientôt pour confirmer livraison et paiement. Merci ! ☕`,
    hours: () => `Horaires : ${catalog.shop.hours} 🕘\nLe bot répond 24h/24.`,
    human: 'D\'accord, j\'ai transmis votre message. Un conseiller vous répondra très vite 🙏',
    unknown: 'Je n\'ai pas compris 😅 Envoyez *0* pour voir le menu.',
    back: 'Menu principal 👇',
  },
};

const YES = /^(نعم|ايه|أيه|اه|آه|واه|oui+|yes|ok|d'accord|wakha|waha)(\s|$|[!.])/i;

function catalogText(lang) {
  const t = T[lang];
  const lines = catalog.products.map(p => `${p.id}. ${lang === 'fr' ? p.fr : p.name} — ${p.price.toLocaleString('fr-MA')} ${lang === 'fr' ? 'MAD' : 'درهم'}`);
  return t.catalogHeader + lines.join('\n') + t.catalogFooter;
}

function searchProducts(text) {
  const q = text.toLowerCase();
  const generic = /(pi[eè]ces?|قطعة|قطع|غيار|catalogue|كتالوج|spresso|espresso|expresso|إسبريسو|اسبريسو|سبريسو)/i.test(q);
  const scored = catalog.products.map(p => {
    // الكلمة الأطول كتعطي نقطة أكثر (porte filter أقوى من filter)
    const hits = (p.keywords || []).filter(k => q.includes(k.toLowerCase())).reduce((n, k) => n + k.length, 0);
    return { p, hits };
  }).filter(x => x.hits > 0).sort((a, b) => b.hits - a.hits);
  if (scored.length) return scored.filter(x => x.hits === scored[0].hits).map(x => x.p);
  return generic ? catalog.products : [];
}

// كترجع { replies: [...], notifyOwner: string|null }
function handle(phone, rawText) {
  const text = (rawText || '').trim();
  const s = sessions.get(phone) || { step: 'menu', lang: null, order: {} };
  s.lang = detectLang(text, s.lang);
  const t = T[s.lang];
  const out = { replies: [], notifyOwner: null };
  const say = m => out.replies.push(m);

  const toMenu = (prefix) => { s.step = 'menu'; s.order = {}; if (prefix) say(prefix); say(t.menu()); };

  // خطوات جمع معلومات الطلب
  if (text === '0' && (s.step === 'askName' || s.step === 'askCity' || s.step === 'askMachine')) {
    toMenu();
  } else if (s.step === 'askName') {
    s.order.name = text; s.step = 'askCity'; say(t.askCity(text));
  } else if (s.step === 'askCity') {
    s.order.city = text; s.step = 'askMachine'; say(t.askMachine);
  } else if (s.step === 'askMachine') {
    s.order.machine = text;
    const p = catalog.products.find(x => x.id === s.order.productId);
    say(t.done(s.order, p));
    out.notifyOwner = `🛒 طلب جديد\nالقطعة: ${p.name} (${p.price} درهم)\nالاسم: ${s.order.name}\nالمدينة: ${s.order.city}\nالمكينة: ${s.order.machine}\nالرقم: ${phone}`;
    s.step = 'menu'; s.order = {};
  } else if (s.step === 'product' && YES.test(text)) {
    s.step = 'askName'; say(t.askName);
  } else if (text === '0' || /^(menu|قائمة|القائمة|salam|سلام|السلام|مرحبا|bonjour|hi|hello|salut|بونجور)/i.test(text) || (!sessions.has(phone) && searchProducts(text).length === 0 && !AI_ON())) {
    toMenu();
  } else if (s.step === 'menu' || s.step === 'catalog' || s.step === 'product') {
    const num = parseInt(text, 10);
    if (s.step !== 'menu' && num >= 1 && num <= catalog.products.length) {
      const p = catalog.products[num - 1];
      s.order = { productId: p.id }; s.step = 'product'; say(t.product(p));
    } else if (s.step === 'menu' && num === 1) { s.step = 'catalog'; say(catalogText(s.lang)); }
    else if (s.step === 'menu' && num === 2) say(catalog.delivery[s.lang]);
    else if (s.step === 'menu' && num === 3) say(catalog.warranty[s.lang]);
    else if (s.step === 'menu' && num === 4) say(t.hours());
    else if (s.step === 'menu' && num === 5) { say(t.human); out.notifyOwner = `🙋 زبون بغا يهضر معاكم\nالرقم: ${phone}\nالرسالة: ${text}`; }
    else if (/كتالوج|catalogue|prix|ثمن|اثمنة|أثمنة|pièce|piece|قطعة|قطع|غيار/i.test(text)) { s.step = 'catalog'; say(catalogText(s.lang)); }
    else if (/توصيل|livraison/i.test(text)) say(catalog.delivery[s.lang]);
    else if (/ضمان|garantie/i.test(text)) say(catalog.warranty[s.lang]);
    else {
      const found = searchProducts(text);
      if (found.length === 1) { const p = found[0]; s.order = { productId: p.id }; s.step = 'product'; say(t.product(p)); }
      else if (found.length > 1) { s.step = 'catalog'; say(catalogText(s.lang)); }
      else if (AI_ON()) out.needsAI = true;
      else { say(t.unknown); say(t.menu()); }
    }
  } else {
    toMenu();
  }

  sessions.set(phone, s);
  return out;
}

// ردود احتياطية إيلا الذكاء الاصطناعي ما خدمش
function fallbackReplies(phone) {
  const s = sessions.get(phone) || { lang: 'ar' };
  const t = T[s.lang || 'ar'];
  return [t.unknown, t.menu()];
}

module.exports = { handle, sessions, fallbackReplies };
