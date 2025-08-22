const express = require('express');
const cors = require('cors');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json());
const path = require("path");

const PORT = 80;
app.use(express.static(path.join(__dirname, "")));

// redireciona / para chat.html
app.get("/", (req, res) => {
  res.redirect("chat.html");
});
// WhatsApp Client
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'upper-chat' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let latestQR = null;
let isReady = false;
const sseClients = new Set();

// ===== Helpers =====
// Modifique a função sseBroadcast para enviar apenas o necessário
function sseBroadcast(type, payload) {
  const data = JSON.stringify({ 
    type, 
    payload,
    timestamp: Date.now(),
    // Adicione um ID único para cada evento
    eventId: Math.random().toString(36).substring(2, 9) 
  });
  
  sseClients.forEach(res => {
    if (!res.writableEnded) {
      res.write(`data: ${data}\n\n`);
    }
  });
  console.log(`[SSE] Evento enviado → ${type} (ID: ${data.eventId})`);
}

function getClientInfoSafe() {
  try {
    const info = client.info || {};
    return {
      pushname: info.pushname || null,
      wid: info?.wid?._serialized || null,
      platform: info.platform || null
    };
  } catch {
    return null;
  }
}

function serializeMessage(m) {
  return {
    id: m.id?._serialized,
    from: m.from,
    to: m.to,
    body: m.body,
    timestamp: m.timestamp,
    fromMe: m.fromMe,
    ack: m.ack,
    type: m.type,
    hasMedia: m.hasMedia,
    mediaKey: m.hasMedia ? m.id._serialized : null
  };
}

function serializeChat(c) {
  return {
    id: c.id?._serialized,
    name: c.name || c.formattedTitle || c.id?.user || '',
    isGroup: !!c.isGroup,
    avatar: null
  };
}

// ===== WhatsApp Events =====
client.on('loading_screen', (percent, message) => {
  console.log(`[WA] loading ${percent}% → ${message}`);
});

client.on('qr', (qr) => {
  latestQR = qr;
  console.log('[WA] QR gerado. Escaneie no WhatsApp > Dispositivos conectados.');
  qrcodeTerminal.generate(qr, { small: true });
  sseBroadcast('qr', { qr });
  sseBroadcast('status', { ready: false, info: null });
});

client.on('authenticated', () => {
  console.log('[WA] authenticated');
  sseBroadcast('authenticated', {});
});

client.on('ready', () => {
  isReady = true;
  console.log('[WA] READY');
  sseBroadcast('ready', {});
  sseBroadcast('status', { ready: true, info: getClientInfoSafe() });
});

client.on('disconnected', (reason) => {
  isReady = false;
  console.log('[WA] disconnected:', reason);
  sseBroadcast('disconnected', { reason });
  sseBroadcast('status', { ready: false, info: null });
});

client.on('message', async (msg) => {
  console.log(`[WA] message ${msg.type} from ${msg.from}: ${msg.body?.slice(0, 60) || ''}`);
  
  const serialized = serializeMessage(msg);
  
  // Se for mensagem de mídia, tentamos baixar e cachear
  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      if (media?.data && media?.mimetype) {
        saveMediaToCache(msg.id._serialized, {
          mimetype: media.mimetype,
          data: media.data
        });
      }
    } catch (e) {
      console.error('Erro ao baixar mídia:', e);
    }
  }
  
  sseBroadcast('message', { 
    message: serialized,
    chatName: msg._data?.notifyName || null
  });
});

client.on('auth_failure', msg => {
  console.error('[WA] Auth failure:', msg);
  isReady = false;
  sseBroadcast('auth_failure', { message: msg });
});

client.on('change_state', state => {
  console.log('[WA] State changed:', state);
});

// ===== Media cache =====
const mediaCache = new Map();
const MAX_MEDIA_CACHE = 100;

function saveMediaToCache(id, payload) {
  if (mediaCache.size >= MAX_MEDIA_CACHE) {
    const firstKey = mediaCache.keys().next().value;
    mediaCache.delete(firstKey);
  }
  mediaCache.set(id, { ...payload, savedAt: Date.now() });
}

function getMediaFromCache(id) {
  return mediaCache.get(id) || null;
}

// ===== HTTP API =====
app.get('/ping', (req, res) => res.json({ ok: true, now: Date.now() }));

app.get('/events', (req, res) => {
  // Configuração SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no' // Importante para Nginx
  });
  res.flushHeaders();

  // Envia um comentário inicial para manter a conexão viva
  res.write(':ok\n\n');

  const clientId = Date.now();
  console.log(`[SSE] Cliente conectado (${clientId})`);
  sseClients.add(res);

  // Heartbeat regular
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      res.write(':hb\n\n');
    }
  }, 15000); // A cada 15 segundos

  // Limpeza ao desconectar
  const cleanup = () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
    console.log(`[SSE] Cliente desconectado (${clientId})`);
    res.end();
  };

  // Eventos de fechamento
  req.on('close', cleanup);
  req.on('end', cleanup);
  req.on('error', cleanup);

  // Envia estado inicial
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({ type: 'init', payload: { 
      ready: isReady, 
      info: getClientInfoSafe(),
      clientId 
    }})}\n\n`);
  }
});

app.get('/status', async (req, res) => {
  let state = 'unknown';
  try { state = await client.getState(); } catch (_) {}
  res.json({ ready: isReady, state, info: getClientInfoSafe() });
});

app.get('/avatar/:chatId', async (req, res) => {
  if (!isReady) return res.status(400).json({ ok: false, error: 'client_not_ready' });
  const chatId = decodeURIComponent(req.params.chatId || '').trim();
  try {
    const url = await client.getProfilePicUrl(chatId);
    if (!url) return res.status(404).json({ ok: false, error: 'no_avatar' });
    return res.redirect(url);
  } catch (e) {
    console.error('[ERROR] /avatar:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'server_error' });
  }
});

app.get('/messages/media/:messageId', async (req, res) => {
  const messageId = decodeURIComponent(req.params.messageId || '').trim();
  if (!messageId) return res.status(400).json({ ok: false, error: 'missing_message_id' });
  if (!isReady) return res.status(400).json({ ok: false, error: 'client_not_ready' });

  // Verifica cache primeiro
  const cached = getMediaFromCache(messageId);
  if (cached) {
    return res.json({ ok: true, ...cached });
  }

  try {
    // Busca a mensagem nos chats
    const chats = await client.getChats();
    let foundMsg = null;

    for (const chat of chats) {
      try {
        const msgs = await chat.fetchMessages({ limit: 100 });
        foundMsg = msgs.find(m => m.id?._serialized === messageId);
        if (foundMsg) break;
      } catch (_) {}
    }

    if (!foundMsg) {
      return res.status(404).json({ ok: false, error: 'message_not_found' });
    }

    if (!foundMsg.hasMedia) {
      return res.status(400).json({ ok: false, error: 'message_has_no_media' });
    }

    const media = await foundMsg.downloadMedia();
    if (!media?.data || !media?.mimetype) {
      return res.status(500).json({ ok: false, error: 'download_failed' });
    }

    // Salva no cache para próximas requisições
    const payload = { mimetype: media.mimetype, data: media.data };
    saveMediaToCache(messageId, payload);

    return res.json({ ok: true, ...payload });
  } catch (e) {
    console.error('[ERROR] /messages/media:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'server_error' });
  }
});

app.get('/messages/chat/:chatId', async (req, res) => {
  const chatId = decodeURIComponent(req.params.chatId);
  console.log(`[DEBUG] GET /messages/chat → ${chatId}`);

  try {
    if (!isReady) {
      console.log('[DEBUG] Cliente não está pronto');
      return res.status(400).json({ success: false, error: 'client_not_ready' });
    }

    const chat = await client.getChatById(chatId);
    console.log(`[DEBUG] Chat encontrado: ${chat.id._serialized}`);

    // Verifica se é um grupo e rejeita se for
    if (chat.isGroup) {
      return res.status(400).json({
        success: false,
        error: 'group_chat_not_allowed',
        message: 'Este endpoint só retorna mensagens de chats individuais'
      });
    }

    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10), 200));
    const messages = await chat.fetchMessages({ limit });
    console.log(`[DEBUG] Mensagens encontradas: ${messages.length}`);

    messages.sort((a, b) => a.timestamp - b.timestamp);

    return res.json({
      success: true,
      count: messages.length,
      items: messages.map(m => ({
        chat: {
          id: chat.id._serialized,
          name: chat.name || chat.formattedTitle || chat.id.user || '',
          isGroup: chat.isGroup
        },
        message: serializeMessage(m)
      }))
    });

  } catch (err) {
    console.error('[ERROR] /messages/chat:', err);
    if (String(err?.message || '').includes('Chat')) {
      return res.status(404).json({
        success: false,
        error: 'chat_not_found',
        receivedId: chatId,
        message: 'Verifique se o ID do chat está correto e se o WhatsApp está conectado'
      });
    }
    return res.status(500).json({ success: false, error: 'server_error', details: err.message });
  }
});

app.get('/messages/recent', async (req, res) => {
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || '30', 10), 50));
  const typeParam = (req.query.type || 'all').toLowerCase();

  try {
    if (!isReady) return res.json({ count: 0, items: [] });

    const chats = await client.getChats();
    const allMessages = [];

    for (const chat of chats) {
      // Adiciona verificação para pegar apenas chats não-grupo
      if (chat.isGroup) continue;
      
      try {
        const messages = await chat.fetchMessages({ limit: 1 });
        if (messages.length > 0) {
          allMessages.push({
            chat: serializeChat(chat),
            message: serializeMessage(messages[0]),
            timestamp: messages[0].timestamp || 0
          });
        }
      } catch (error) {
        console.error(`Erro ao buscar mensagens do chat ${chat.id._serialized}:`, error);
      }
    }

    allMessages.sort((a, b) => b.timestamp - a.timestamp);

    const filtered = (typeParam === 'all')
      ? allMessages
      : allMessages.filter(it => (it.message?.type || '').toLowerCase() === typeParam);

    const result = filtered.slice(0, limit);

    res.json({
      count: result.length,
      items: result.map(item => ({
        chat: item.chat,
        message: item.message
      }))
    });
  } catch (err) {
    console.error('Erro ao buscar mensagens recentes:', err);
    res.status(500).json({
      error: 'failed_to_fetch_recent_messages',
      details: err.message
    });
  }
});

app.post('/messages/send', async (req, res) => {
  try {
    if (!isReady) return res.status(400).json({ ok: false, error: 'client_not_ready' });
    const { chatId, message } = req.body || {};
    if (!chatId || !message) return res.status(400).json({ ok: false, error: 'missing_params' });

    const chat = await client.getChatById(chatId);
    await chat.sendMessage(message);

    return res.json({ ok: true });
  } catch (e) {
    console.error('[ERROR] /messages/send:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'send_failed' });
  }
});

app.post('/session/restart', async (req, res) => {
  try {
    console.log('[CTRL] session/restart');
    latestQR = null;
    isReady = false;
    mediaCache.clear();
    await client.destroy();
    client.initialize();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'restart_failed' });
  }
});

app.post('/disconnect', async (req, res) => {
  try {
    console.log('[CTRL] disconnect');
    await client.logout();
    latestQR = null;
    isReady = false;
    mediaCache.clear();
    sseBroadcast('disconnected', { reason: 'manual_logout' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'logout_failed' });
  }
});

// ===== Inicialização =====
client.initialize();
app.listen(PORT, () => {
  console.log(`HTTP → https://chat.upperpublicidade.com.br:${PORT}`);
});

// No seu código principal, quando o usuário seleciona um chat:
// if (window.ChatManager) {
//     window.ChatManager.setCurrentChat(
//         '5511999999999@c.us', // ID do chat (com @c.us no final)
//         'Nome do Contato'     // Nome exibido
//     );
// }