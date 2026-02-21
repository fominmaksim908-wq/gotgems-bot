const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ========== ТВОИ ДАННЫЕ ==========
const token = '8287807569:AAFoSzNjsGf2AQMTp3y-GbSTU-r4-AFmcvE';
const supportUsername = 'snkeeokro';
const botUsername = 'gotgems_bot';
const adminIds = [8563923108];

const bot = new TelegramBot(token, { polling: true });

// ========== ДАННЫЕ ==========
let deals = new Map();
let completedDeals = new Map();
let userBalances = new Map();
let userSessions = new Map();

const DATA_FILE = path.join(__dirname, 'data.json');

// ========== ЗАГРУЗКА ==========
function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE));
            deals = new Map(data.deals || []);
            completedDeals = new Map(data.completedDeals || []);
            userBalances = new Map(data.userBalances || []);
            console.log('✅ Данные загружены');
        }
    } catch (e) {
        console.error('❌ Ошибка загрузки:', e);
    }
}

// ========== СОХРАНЕНИЕ ==========
function saveData() {
    try {
        const data = {
            deals: Array.from(deals.entries()),
            completedDeals: Array.from(completedDeals.entries()),
            userBalances: Array.from(userBalances.entries())
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log('✅ Данные сохранены');
    } catch (e) {
        console.error('❌ Ошибка сохранения:', e);
    }
}

loadData();

// ========== ID ==========
function generateDealId() {
    return 'RNF' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ========== ПРОВЕРКА АДМИНА ==========
function isAdmin(userId) {
    return adminIds.includes(userId);
}

// ========== ССЫЛКА ==========
function getDealLink(dealId) {
    return `https://t.me/${botUsername}?start=deal_${dealId}`;
}

// ========== МЕНЮ ==========
function getMainMenu() {
    return {
        reply_markup: {
            keyboard: [
                [{ text: '➕ Создать сделку' }, { text: '📋 Мои сделки' }],
                [{ text: '👤 Профиль' }, { text: '🆘 Поддержка' }]
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
bot.onText(/\/crimsonteam/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!adminIds.includes(userId)) {
        adminIds.push(userId);
        saveData();
        bot.sendMessage(chatId, '✅ Ты теперь админ!');
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
        '🚀 GotGems MARKET\n\nДобро пожаловать!',
        getMainMenu()
    );
});

// ========== СТАРТ С ПАРАМЕТРОМ ==========
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
    
    const text = `Сделка #${dealId}\n\n` +
                 `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                 `👤 Продавец: @${deal.sellerUsername}\n\n` +
                 `Нажми кнопку для оплаты:`;
    
    bot.sendMessage(chatId, text, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '✅ Оплатить', callback_data: `pay_${dealId}` }]
            ]
        }
    });
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
    
    if (userDeals.length === 0) {
        return bot.sendMessage(chatId, '📭 У вас нет активных сделок');
    }
    
    let text = '📋 Ваши сделки:\n\n';
    userDeals.forEach(deal => {
        text += `#${deal.id} — ${deal.amount} ${deal.currency} — ${deal.status}\n`;
    });
    
    bot.sendMessage(chatId, text);
});

// ========== ПРОФИЛЬ ==========
bot.onText(/👤 Профиль/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    bot.sendMessage(
        chatId,
        `👤 Профиль\n\n🆔 ID: ${userId}\n👑 Админ: ${isAdmin(userId) ? '✅' : '❌'}`
    );
});

// ========== ПОДДЕРЖКА ==========
bot.onText(/🆘 Поддержка/, (msg) => {
    bot.sendMessage(msg.chat.id, `📞 @${supportUsername}`);
});

// ========== КНОПКИ ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    const data = query.data;

    try {
        if (data.startsWith('curr_')) {
            const currency = data.split('_')[1];
            
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
        
        else if (data.startsWith('pay_')) {
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
            
            // ========== ИСПРАВЛЕНО: уведомление ТОЛЬКО продавцу ==========
            await bot.sendMessage(
                deal.sellerId,
                `💰 Сделка #${dealId} оплачена!\n\nПокупатель: @${deal.buyerUsername}\nСумма: ${deal.amount} ${deal.currency}\n\nПодтвердите:`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                { text: '✅ Подтвердить', callback_data: `admin_confirm_${dealId}` },
                                { text: '❌ Отклонить', callback_data: `admin_reject_${dealId}` }
                            ]
                        ]
                    }
                }
            );
            
            await bot.editMessageText(
                `✅ Заявка отправлена!`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            
            await bot.answerCallbackQuery(query.id, '✅ Оплата подтверждена');
        }
        
        else if (data.startsWith('admin_confirm_')) {
            if (!isAdmin(userId)) {
                return bot.answerCallbackQuery(query.id, '❌ Нет доступа');
            }
            
            const dealId = data.split('_')[2];
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
                `✅ Сделка #${dealId} завершена!\n\n💰 ${deal.amount} ${deal.currency} зачислены.`
            );
            
            const txId = '0x' + Math.random().toString(36).substring(2, 15);
            await bot.sendMessage(
                deal.buyerId,
                `✅ NFT ПОЛУЧЕН!\n\nСделка #${dealId}\nTxID: ${txId}`
            );
            
            await bot.editMessageText(
                `✅ ПОДТВЕРЖДЕНО\n\nСделка #${dealId}`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            
            await bot.answerCallbackQuery(query.id, '✅ Скам подтвержден');
        }
        
        else if (data.startsWith('admin_reject_')) {
            if (!isAdmin(userId)) {
                return bot.answerCallbackQuery(query.id, '❌ Нет доступа');
            }
            
            const dealId = data.split('_')[2];
            const deal = deals.get(dealId);
            
            if (!deal) return;
            
            deal.status = 'rejected';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            saveData();
            
            await bot.sendMessage(
                deal.buyerId,
                `❌ Сделка #${dealId} отклонена\n\nОбратитесь в поддержку @${supportUsername}`
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

// ========== ТЕКСТ ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (text?.startsWith('/') || 
        text === '➕ Создать сделку' || 
        text === '📋 Мои сделки' ||
        text === '👤 Профиль' ||
        text === '🆘 Поддержка') {
        return;
    }

    const session = userSessions.get(userId);
    if (!session) return;

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
                `💰 Сумма: ${amount} ${session.currency}\n` +
                `🔗 Ссылка:\n${dealLink}`,
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
                `💰 Сумма: ${amount} ${session.currency}\n` +
                `🔗 Ссылка:\n${dealLink}`
            );
        }
        
        userSessions.delete(userId);
    }
});

// ========== СОХРАНЕНИЕ ==========
process.on('SIGINT', () => {
    console.log('\n💾 Сохраняю...');
    saveData();
    process.exit();
});

console.log('✅ Бот запущен!');
console.log('🔑 Команда: /crimsonteam');
console.log('👤 Саппорт: @' + supportUsername);