// scripts.js
document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = 'http://localhost:3000';

  // Elementos do HTML
  const waStatusBtn = document.getElementById('waStatusBtn');
  const messagesContainer = document.getElementById('messagesContainer');
  const conversationList = document.getElementById('conversationList');
  const chatHeader = document.querySelector('.chat-header');
  const partnerName = document.querySelector('.partner-name');
  const partnerStatus = document.querySelector('.partner-status');
  const partnerAvatar = document.querySelector('.partner-avatar img');
  const qrModal = document.getElementById('qrModal');
  const qrBox = document.getElementById('qrBox');
  const modalBackdrop = qrModal?.querySelector('[data-close]');
  const modalCloseBtn = qrModal?.querySelector('.modal-close');
  const messageInput = document.getElementById('messageInput');
  const sendBtn = document.querySelector('.send-btn');

  // Estado
  let isReady = false;
  let currentChatId = null;
  const chatThreads = new Map();

  // Controles
  let bootstrapped = false;     // primeiro carregamento já feito?
  let lastReady = null;         // último estado "ready" conhecido
  const mediaCache = new Map(); // messageId -> dataURL (data:mime;base64,...)
  let loadingChatId = null;     // evita chamadas concorrentes para o mesmo chat

  // ===== Helpers =====
  function setWAStatus(ready, info) {
    isReady = !!ready;
    const statusText = waStatusBtn?.querySelector('.status-text');
    waStatusBtn?.classList.remove('connected', 'disconnected');
    waStatusBtn?.classList.add(ready ? 'connected' : 'disconnected');
    if (statusText) statusText.textContent = ready ? 'Conectado' : 'Conectar';
    const pulse = waStatusBtn?.querySelector('.pulse-dot');
    if (pulse) pulse.style.display = ready ? 'none' : 'inline-block';
  }

  function openQRModal() {
    if (!qrModal) return;
    qrModal.classList.remove('hidden');
  }
  function closeQRModal() {
    if (!qrModal) return;
    qrModal.classList.add('hidden');
    if (qrBox) qrBox.innerHTML = '';
  }

  async function renderQR(qrText) {
    if (!qrBox) return;
    qrBox.innerHTML = '';
    const canvas = document.createElement('canvas');
    qrBox.appendChild(canvas);
    await new Promise((resolve, reject) => {
      QRCode.toCanvas(canvas, qrText, { width: 220 }, (err) => (err ? reject(err) : resolve()));
    });
  }

  // Preserva a posição visual durante uma atualização do DOM
  // Uso: await preserveScroll(() => { ... atualizações ... })
  async function preserveScroll(renderFn) {
    const el = messagesContainer;
    if (!el) return renderFn();

    const prevBottomOffset = el.scrollHeight - el.scrollTop;
    const maybePromise = renderFn();
    if (maybePromise && typeof maybePromise.then === 'function') {
      await maybePromise;
    }

    // força layout antes de ajustar
    // eslint-disable-next-line no-unused-expressions
    el.offsetHeight;

    el.scrollTop = Math.max(0, el.scrollHeight - prevBottomOffset);
  }

  function nearBottom(thresholdPx = 60) {
    if (!messagesContainer) return true;
    const distance = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight;
    return distance < thresholdPx;
  }

  // ===== Conversas (sidebar) =====
  function upsertConversation(chatId, name, lastTs, preview, avatar) {
    if (!chatId) return;
    const existing = chatThreads.get(chatId) || { name, lastMessageTs: 0, preview: '', avatar: '' };
    const updated = {
      name: name || existing.name || chatId,
      lastMessageTs: Math.max(existing.lastMessageTs || 0, lastTs || 0),
      preview: preview ?? existing.preview ?? '',
      avatar: avatar || existing.avatar || 'fundo users.png'
    };
    chatThreads.set(chatId, updated);
    renderConversationList();
  }

  function renderConversationList() {
    if (!conversationList) return;
    const entries = Array.from(chatThreads.entries())
      .sort((a, b) => b[1].lastMessageTs - a[1].lastMessageTs);

    conversationList.innerHTML = '';
    for (const [id, info] of entries) {
      const item = document.createElement('div');
      item.className = `conversation-item ${currentChatId === id ? 'active' : ''}`;
      item.style.cursor = 'pointer';
      item.innerHTML = `
        <div class="conversation-avatar">
          <img src="${info.avatar}" alt="${info.name}" onerror="this.src='fundo users.png'">
        </div>
        <div class="conversation-info">
          <div class="conversation-name">${info.name || id}</div>
          <div class="conversation-preview">${info.preview || ''}</div>
        </div>
      `;

      item.addEventListener('click', async () => {
        try {
          const statusResp = await fetch(`${API_BASE}/status`);
          const status = await statusResp.json();
          if (!status.ready) {
            alert('Conecte-se ao WhatsApp primeiro');
            return;
          }
          loadChatMessages(id);
        } catch (e) {
          console.error('Erro ao verificar status:', e);
        }
      });

      conversationList.appendChild(item);
    }
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = new Date(Number(ts) * 1000);
    return d.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function updateChatHeader(chatInfo) {
    if (!chatInfo) return;
    partnerName.textContent = chatInfo.name || 'Conversa';
    partnerStatus.textContent = 'Online';
    partnerAvatar.src = chatInfo.avatar || 'fundo users.png';
    partnerAvatar.onerror = function() { this.src = 'fundo users.png'; };
  }

  // ===== Mensagens =====
  function addMessageBubble({ id, fromMe, body, timestamp, type, chatName, hasMedia }) {
    if (!messagesContainer) return;

    const wrap = document.createElement('div');
    wrap.className = `message-row ${fromMe ? 'from-me' : 'from-them'}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const content = document.createElement('div');
    content.className = 'message-content';

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `${chatName ? chatName + ' · ' : ''}${formatTime(timestamp)}`;

    const t = (type || '').toLowerCase();

    // ===== IMAGEM =====
    if ((t === 'image') && hasMedia) {
      const cached = mediaCache.get(id);
      if (cached) {
        const img = document.createElement('img');
        img.alt = 'imagem';
        img.src = cached; // CSS controla tamanho fixo
        content.appendChild(img);
        if (body) {
          const caption = document.createElement('div');
          caption.className = 'media-caption';
          caption.textContent = body;
          content.appendChild(caption);
        }
      } else {
        const ph = document.createElement('div');
        ph.className = 'media-placeholder';
        ph.innerHTML = `
          <div class="media-icon"><i class="fa-regular fa-image"></i></div>
          <div class="media-label">Imagem</div>
          <button class="media-load-btn">Carregar imagem</button>
        `;
        const btn = ph.querySelector('.media-load-btn');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Carregando...';
          try {
            const r = await fetch(`${API_BASE}/messages/media/${encodeURIComponent(id)}`);
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Falha ao carregar mídia');

            const dataURL = `data:${j.mimetype};base64,${j.data}`;
            mediaCache.set(id, dataURL);

            const img = document.createElement('img');
            img.alt = 'imagem';
            img.src = dataURL;

            await preserveScroll(() => {
              content.innerHTML = '';
              content.appendChild(img);
              if (body) {
                const caption = document.createElement('div');
                caption.className = 'media-caption';
                caption.textContent = body;
                content.appendChild(caption);
              }
            });
          } catch (e) {
            console.error('Erro ao carregar imagem:', e);
            btn.disabled = false;
            btn.textContent = 'Tentar novamente';
          }
        });
        content.appendChild(ph);
        if (body) {
          const caption = document.createElement('div');
          caption.className = 'media-caption';
          caption.textContent = body;
          content.appendChild(caption);
        }
      }
    }
    // ===== ÁUDIO (inclui voice note / ptt) =====
    else if ((t === 'audio' || t === 'ptt') && hasMedia) {
      const cached = mediaCache.get(id);
      if (cached) {
        const audioEl = document.createElement('audio');
        audioEl.controls = true;
        audioEl.preload = 'none';
        audioEl.src = cached;
        content.appendChild(audioEl);
        if (body) {
          const caption = document.createElement('div');
          caption.className = 'media-caption';
          caption.textContent = body;
          content.appendChild(caption);
        }
      } else {
        const ph = document.createElement('div');
        ph.className = 'media-placeholder';
        ph.innerHTML = `
          <div class="media-icon"><i class="fa-regular fa-circle-play"></i></div>
          <div class="media-label">${t === 'ptt' ? 'Mensagem de voz' : 'Áudio'}</div>
          <button class="media-load-btn">Reproduzir áudio</button>
        `;
        const btn = ph.querySelector('.media-load-btn');
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          btn.textContent = 'Carregando...';
          try {
            const r = await fetch(`${API_BASE}/messages/media/${encodeURIComponent(id)}`);
            const j = await r.json();
            if (!j.ok) throw new Error(j.error || 'Falha ao carregar mídia');

            const dataURL = `data:${j.mimetype};base64,${j.data}`;
            mediaCache.set(id, dataURL);

            const audioEl = document.createElement('audio');
            audioEl.controls = true;
            audioEl.preload = 'none';
            audioEl.src = dataURL;

            await preserveScroll(() => {
              content.innerHTML = '';
              content.appendChild(audioEl);
              if (body) {
                const caption = document.createElement('div');
                caption.className = 'media-caption';
                caption.textContent = body;
                content.appendChild(caption);
              }
            });

            // opcional: autostart depois que carrega
            audioEl.play().catch(() => {});
          } catch (e) {
            console.error('Erro ao carregar áudio:', e);
            btn.disabled = false;
            btn.textContent = 'Tentar novamente';
          }
        });
        content.appendChild(ph);
        if (body) {
          const caption = document.createElement('div');
          caption.className = 'media-caption';
          caption.textContent = body;
          content.appendChild(caption);
        }
      }
    }
    // ===== TEXTO / OUTROS =====
    else {
      const isText = t === 'chat';
      content.textContent = isText ? (body || '') : `[${type}] ${body || ''}`;
    }

    bubble.appendChild(content);
    bubble.appendChild(meta);
    wrap.appendChild(bubble);
    messagesContainer.appendChild(wrap);

    // Auto-scroll só se já está perto do fim
    if (nearBottom()) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  function clearMessages() {
    if (messagesContainer) messagesContainer.innerHTML = '';
  }

  // ===== Carregamento de mensagens por chat =====
  async function loadChatMessages(chatId) {
    if (!chatId) return;
    if (loadingChatId && loadingChatId === chatId) return; // lock para o mesmo chat
    loadingChatId = chatId;

    console.log(`[FRONT] Iniciando carga do chat: ${chatId}`);
    const chatInfo = chatThreads.get(chatId);
    const isSameChat = currentChatId === chatId;
    currentChatId = chatId;

    try {
      updateChatHeader(chatInfo);

      if (!isSameChat) {
        clearMessages();
        messagesContainer.innerHTML = '<div class="conversation-loading">Carregando mensagens...</div>';
      }

      const resp = await fetch(`${API_BASE}/messages/chat/${encodeURIComponent(chatId)}?limit=50`);
      if (!resp.ok) {
        const errorData = await resp.json().catch(() => ({}));
        let errorMsg = 'Falha ao carregar mensagens';
        if (resp.status === 404) errorMsg = 'Chat não encontrado. Verifique a conexão com o WhatsApp.';
        else if (errorData.error === 'client_not_ready') errorMsg = 'WhatsApp não está conectado. Por favor, conecte-se primeiro.';
        throw new Error(errorMsg);
      }

      const data = await resp.json();

      const renderMessages = () => {
        messagesContainer.innerHTML = '';
        data.items.forEach(({ chat, message }) => {
          addMessageBubble({
            id: message.id,
            fromMe: message.fromMe,
            body: message.body,
            timestamp: message.timestamp,
            type: message.type,
            hasMedia: !!message.hasMedia,
            chatName: chat?.name || message.from
          });
        });
      };

      if (isSameChat) {
        // Mantém posição ao atualizar
        await preserveScroll(renderMessages);
      } else {
        renderMessages();
        // Troca de chat: rola para o fim uma vez
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      renderConversationList();
    } catch (e) {
      console.error(`[FRONT] Erro ao carregar mensagens:`, e);
      messagesContainer.innerHTML = `
        <div class="error-state">
          <i class="fas fa-exclamation-triangle"></i>
          <p>${e.message}</p>
          <button onclick="loadChatMessages('${chatId}')">Tentar novamente</button>
        </div>
      `;
    } finally {
      if (loadingChatId === chatId) loadingChatId = null;
    }
  }

  // ===== Atualiza lista de conversas sem mexer no chat aberto =====
  async function loadRecentMessages() {
    try {
      const resp = await fetch(`${API_BASE}/messages/recent?limit=30`);
      const data = await resp.json();
      if (!Array.isArray(data.items)) return;

      data.items.forEach(({ chat, message }) => {
        const preview =
          message.type === 'chat' ? message.body
          : (message.type === 'image' ? '[imagem]'
          : (message.type === 'audio' || message.type === 'ptt' ? '[áudio]'
          : `[${message.type}]`));

        upsertConversation(
          chat?.id || message.from, 
          chat?.name || message.from, 
          message.timestamp, 
          preview,
          chat?.avatar
        );
      });

      // NÃO abre nenhum chat automaticamente aqui.
    } catch (e) {
      console.error('Falha ao carregar mensagens recentes:', e);
    }
  }

  // ===== SSE =====
  function connectSSE() {
    let es;
    try {
      es = new EventSource(`${API_BASE}/events`);
    } catch (e) {
      console.error('Falha ao abrir SSE:', e);
      return;
    }

    es.onmessage = async (evt) => {
      if (!evt.data || evt.data.startsWith(':')) return;
      try {
        const { type, payload } = JSON.parse(evt.data);

        if (type === 'status') {
          const nowReady = !!payload?.ready;
          setWAStatus(nowReady, payload?.info);

          const transitionedToReady = (lastReady === false || lastReady === null) && nowReady === true;
          if (!bootstrapped && nowReady && transitionedToReady) {
            closeQRModal();
            loadRecentMessages();
            bootstrapped = true;
          }
          lastReady = nowReady;
        }

        if (type === 'qr' && payload?.qr) {
          openQRModal();
          renderQR(payload.qr).catch(() => {});
        }

        if (type === 'ready') {
          setWAStatus(true);
          if (!bootstrapped) {
            closeQRModal();
            loadRecentMessages();
            bootstrapped = true;
          }
          lastReady = true;
        }

        if (type === 'message' && payload?.message) {
          const m = payload.message;
          const chatId = m.from;

          const preview =
            m.type === 'chat' ? m.body
            : (m.type === 'image' ? '[imagem]'
            : (m.type === 'audio' || m.type === 'ptt' ? '[áudio]'
            : `[${m.type}]`));

          // Atualiza a conversa na sidebar
          upsertConversation(
            chatId,
            m.chatName || m.from,
            m.timestamp,
            preview,
            m.chatAvatar
          );

          // Se a mensagem pertence ao chat aberto, renderiza preservando posição
          if (currentChatId === chatId) {
            const wasNearBottom = nearBottom();

            await preserveScroll(() => {
              addMessageBubble({
                id: m.id,
                fromMe: m.fromMe,
                body: m.body,
                timestamp: m.timestamp,
                type: m.type,
                hasMedia: !!m.hasMedia,
                chatName: m.chatName || ''
              });
            });

            if (wasNearBottom) {
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          }
        }

        if (type === 'disconnected') {
          setWAStatus(false);
          openQRModal();
        }
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setTimeout(connectSSE, 3000);
    };
  }

  // ===== Eventos UI =====
  waStatusBtn?.addEventListener('click', async () => {
    if (isReady) return;
    openQRModal();
    try {
      await fetch(`${API_BASE}/session/restart`, { method: 'POST' });
    } catch (e) {
      console.error('Falha ao requisitar novo QR:', e);
    }
  });

  modalBackdrop?.addEventListener('click', closeQRModal);
  modalCloseBtn?.addEventListener('click', closeQRModal);

  sendBtn?.addEventListener('click', async () => {
    const text = messageInput?.value?.trim();
    if (!text || !currentChatId) return;
    
    try {
      const response = await fetch(`${API_BASE}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: currentChatId, message: text })
      });
      if (!response.ok) throw new Error('Falha ao enviar mensagem');

      const wasNearBottom = nearBottom();
      await preserveScroll(() => {
        addMessageBubble({
          id: `tmp_${Date.now()}`,
          fromMe: true,
          body: text,
          timestamp: Math.floor(Date.now() / 1000),
          type: 'chat',
          hasMedia: false,
          chatName: 'Você'
        });
      });
      if (wasNearBottom) {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }

      if (messageInput) messageInput.value = '';
    } catch (e) {
      console.error('Erro ao enviar mensagem:', e);
      alert('Falha ao enviar mensagem');
    }
  });

  messageInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendBtn.click();
  });

  // ===== Inicialização =====
  connectSSE();

  fetch(`${API_BASE}/status`)
    .then(r => r.json())
    .then(s => {
      setWAStatus(!!s?.ready, s?.info);
      lastReady = !!s?.ready;
      if (s?.ready && !bootstrapped) {
        closeQRModal();
        loadRecentMessages(); // não abre nenhum chat automaticamente
        bootstrapped = true;
      }
    })
    .catch(() => setWAStatus(false));
});

window.addEventListener('beforeunload', () => {
  if (eventSource) eventSource.close();
});

console.log(`[SSE] Cliente ${clientId} conectado (Total: ${sseClients.size})`);
console.log(`[SSE] Cliente ${clientId} desconectado (Razão: ${req.socket.destroyed ? 'socket-destroyed' : 'client-close'})`);

let currentState = {
  chats: {},
  messages: {},
  status: null
};

const eventSource = new EventSource('/events');

eventSource.onmessage = (e) => {
  const event = JSON.parse(e.data);
  
  switch(event.type) {
    case 'init':
      // Apenas na primeira carga
      currentState = { ...currentState, ...event.payload };
      renderInitialState();
      break;
      
    case 'message':
      // Atualização seletiva de mensagens
      if (!currentState.messages[event.payload.chatId]) {
        currentState.messages[event.payload.chatId] = [];
      }
      currentState.messages[event.payload.chatId].push(event.payload.message);
      updateSingleMessage(event.payload.message);
      break;
      
    case 'status':
      // Atualiza apenas o status se mudou
      if (JSON.stringify(currentState.status) !== JSON.stringify(event.payload)) {
        currentState.status = event.payload;
        updateStatusIndicator();
      }
      break;
      
    default:
      // Outros eventos
      console.log('Evento não tratado:', event.type);
  }
};

// Funções de renderização otimizadas
function renderInitialState() {
  // Renderiza tudo pela primeira vez
  // (mantenha as referências dos elementos DOM)
}

function updateSingleMessage(message) {
  // Encontra a mensagem existente ou adiciona nova
  // Usa requestAnimationFrame para evitar flickering
  requestAnimationFrame(() => {
    const messageElement = document.querySelector(`[data-message-id="${message.id}"]`);
    
    if (messageElement) {
      // Atualiza apenas o conteúdo necessário
      messageElement.querySelector('.content').textContent = message.body;
      messageElement.querySelector('.time').textContent = formatTime(message.timestamp);
    } else {
      // Adiciona nova mensagem de forma otimizada
      const newMessage = createMessageElement(message);
      const container = document.getElementById('messages-container');
      container.appendChild(newMessage);
      container.scrollTop = container.scrollHeight;
    }
  });
}
// 1. Use um buffer de mensagens
let messageBuffer = [];
let renderTimeout = null;

function bufferMessage(message) {
  messageBuffer.push(message);
  
  if (!renderTimeout) {
    renderTimeout = setTimeout(() => {
      renderBufferedMessages();
      renderTimeout = null;
    }, 100); // Agrupa mensagens em 100ms
  }
}

function renderBufferedMessages() {
  requestAnimationFrame(() => {
    const fragment = document.createDocumentFragment();
    
    messageBuffer.forEach(msg => {
      const element = createMessageElement(msg);
      fragment.appendChild(element);
    });
    
    document.getElementById('messages-container').appendChild(fragment);
    messageBuffer = [];
  });
}

// No seu código principal, quando o usuário seleciona um chat:
if (window.ChatManager) {
    window.ChatManager.setCurrentChat(
        '5511999999999@c.us', // ID do chat (com @c.us no final)
        'Nome do Contato'     // Nome exibido
    );
}