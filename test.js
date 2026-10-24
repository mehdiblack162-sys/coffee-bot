const { handle } = require('./bot');
const say = (phone, msg) => { const r = handle(phone, msg); console.log(`\n👤 ${msg}`); r.replies.forEach(x => console.log(`🤖 ${x}`)); if (r.notifyOwner) console.log(`📣 [للمالك] ${r.notifyOwner}`); };
console.log('=== دارجة ===');
['سلام', '1', '1', 'نعم', 'يوسف', 'مراكش', 'La Cimbali'].forEach(m => say('212600000001', m));
console.log('\n\n=== Français ===');
['Bonjour', 'catalogue', '3', 'oui', 'Sara', 'Casablanca', 'Nuova Simonelli', 'livraison'].forEach(m => say('212600000002', m));
