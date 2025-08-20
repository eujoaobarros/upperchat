// salvarcontato-auto.js
document.addEventListener('DOMContentLoaded', async function() {
    // 1. Configuração Inicial
    if (!window.supabase) {
        console.error('Supabase não inicializado! Verifique se supabase-config.js foi carregado antes deste arquivo.');
        showAlert('Erro de configuração do banco de dados', 'error');
        return;
    }

    // 2. Elementos da UI
    const progressElement = document.getElementById('sync-progress');
    const progressFill = progressElement?.querySelector('.sync-progress-fill');
    const progressText = progressElement?.querySelector('.sync-progress-text');
    const syncButton = document.getElementById('sync-button');

    // 3. Funções Auxiliares
    function formatPhoneNumber(rawPhone) {
        if (!rawPhone) return null;
        return rawPhone.replace(/\D/g, '')
                      .replace(/^55/, '')  // Remove DDI Brasil
                      .replace(/^0/, '');   // Remove zero inicial
    }

    function showAlert(message, type = 'info') {
        const alertBox = document.createElement('div');
        alertBox.className = `alert-box ${type}`;
        alertBox.textContent = message;
        document.body.appendChild(alertBox);
        
        setTimeout(() => alertBox.remove(), 5000);
    }

    function updateProgress(percent, message) {
        if (progressElement && progressFill && progressText) {
            progressElement.classList.remove('hidden');
            progressFill.style.width = `${percent}%`;
            progressText.textContent = message;
        }
    }

    async function contactExists(phone) {
        try {
            const { data, error } = await window.supabase
                .from('cards')
                .select('id')
                .eq('phone', phone)
                .eq('kanban_id', 'ee6c1c9d-a223-4323-bdc2-b476ea46f4a7');

            if (error) throw error;
            return data.length > 0;
        } catch (error) {
            console.error('Erro ao verificar contato:', error);
            return true; // Assume que existe para evitar duplicatas
        }
    }

    // 4. Função Principal - Sincronização Automática
    async function syncAllContacts() {
        try {
            // Configuração do processo
            const BATCH_SIZE = 5;
            const DELAY_BETWEEN_BATCHES = 1000;
            let savedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            // Obter todos os chats
            let chats = [];
            try {
                // WhatsAppWeb.js
                if (window.Store && window.Store.Chat) {
                    chats = window.Store.Chat.models;
                } 
                // Ou usando a API diretamente
                else if (window.client && typeof window.client.getChats === 'function') {
                    chats = await window.client.getChats();
                } else {
                    throw new Error('Não foi possível acessar os chats');
                }

                // Filtrar chats válidos
                chats = chats.filter(chat => 
                    !chat.isGroup && 
                    chat.id._serialized && 
                    chat.id._serialized.includes('@c.us')
                );

                if (chats.length === 0) {
                    showAlert('Nenhum contato válido encontrado', 'warning');
                    return;
                }

                updateProgress(0, `Processando ${chats.length} contatos...`);

                // Processar em lotes
                for (let i = 0; i < chats.length; i += BATCH_SIZE) {
                    const batch = chats.slice(i, i + BATCH_SIZE);
                    
                    // Processar cada contato no lote atual
                    for (const chat of batch) {
                        try {
                            const phone = formatPhoneNumber(chat.id._serialized);
                            if (!phone || phone.length < 8) {
                                skippedCount++;
                                continue;
                            }

                            // Verificar duplicata
                            if (await contactExists(phone)) {
                                skippedCount++;
                                continue;
                            }

                            // Inserir no Supabase
                            const { error } = await window.supabase
                                .from('cards')
                                .insert([{
                                    title: chat.name || `Contato ${phone}`,
                                    description: '',
                                    phone: phone,
                                    status: 'pending',
                                    position: 0,
                                    kanban_id: 'ee6c1c9d-a223-4323-bdc2-b476ea46f4a7',
                                    created_at: new Date().toISOString()
                                }]);

                            if (error) throw error;
                            savedCount++;

                        } catch (error) {
                            console.error(`Erro no contato ${chat.id._serialized}:`, error);
                            errorCount++;
                        }
                    }

                    // Atualizar progresso
                    const progress = Math.floor((i / chats.length) * 100);
                    updateProgress(
                        progress,
                        `${i + batch.length}/${chats.length} contatos | ` +
                        `Salvos: ${savedCount} | ` +
                        `Pulados: ${skippedCount} | ` +
                        `Erros: ${errorCount}`
                    );

                    // Delay entre lotes
                    if (i + BATCH_SIZE < chats.length) {
                        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
                    }
                }

                // Resultado final
                updateProgress(100, 'Sincronização completa!');
                showAlert(
                    `Sincronização concluída: ${savedCount} novos, ${skippedCount} duplicados, ${errorCount} erros`,
                    savedCount > 0 ? 'success' : 'info'
                );

            } catch (mainError) {
                console.error('Erro no processo principal:', mainError);
                showAlert('Falha na sincronização: ' + mainError.message, 'error');
            }

        } finally {
            // Esconder a barra de progresso após 5 segundos
            setTimeout(() => {
                if (progressElement) progressElement.classList.add('hidden');
            }, 5000);
        }
    }

    // 5. Iniciar automaticamente (ou por botão)
    if (syncButton) {
        syncButton.addEventListener('click', syncAllContacts);
        syncButton.style.display = 'block'; // Mostra o botão se existir
    } else {
        // Inicia automaticamente se não houver botão
        setTimeout(syncAllContacts, 3000); // Pequeno delay para carregar tudo
    }
});