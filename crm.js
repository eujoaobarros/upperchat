document.addEventListener('DOMContentLoaded', function () {
  // ====== Configuração do Supabase ======
  const supabaseUrl = 'https://igjiltchdrkewhnjdrpu.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnamlsdGNoZHJrZXdobmpkcnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0MDcyNTYsImV4cCI6MjA3MDk4MzI1Nn0.H7rKPPynAwLPcB0YFm3xar06-7XwYgwZ__1fNzol_6I';

  const db = window.supabase.createClient(supabaseUrl, supabaseKey);

  // ====== Seletores do DOM ======
  const kanbanContainer = document.getElementById('kanbanContainer');
  const addBoardBtn = document.getElementById('addBoardBtn');
  const addSampleDataBtn = document.getElementById('addSampleDataBtn');

  const cardModal = document.getElementById('cardModal');
  const cardForm = document.getElementById('cardForm');
  const modalTitle = document.getElementById('modalTitle');
  const closeModalBtns = document.querySelectorAll('[data-close]');

  // Modal de confirmação
  const confirmModal = document.getElementById("confirmModal");
  const confirmDeleteBtn = document.getElementById("confirmDelete");
  const cancelDeleteBtn = document.getElementById("cancelDelete");

  // ====== Estado ======
  let boards = [];
  let currentCardId = null;
  let currentBoardId = null;
  let boardToDelete = null; // usado para modal de exclusão

  // ====== Boot ======
  loadBoards();
  setupEventListeners();
  setupRealtime();

  // ====== Função Toast (alerta bonito) ======
  function showToast(message, type = "success") {
    const container = document.getElementById("toast-container");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = "toast";

    if (type === "error") toast.style.background = "#f44336";
    if (type === "info") toast.style.background = "#2196f3";
    if (type === "warning") toast.style.background = "#ff9800";
    if (type === "success") toast.style.background = "#4caf50";

    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 4000);
  }

  // ====== Carregar Kanbans + Cards ======
  async function loadBoards() {
    try {
      const { data: kanbans, error: kanbanError } = await db
        .from('kanbans')
        .select('*')
        .order('position', { ascending: true });

      if (kanbanError) throw kanbanError;

      const boardsWithCards = await Promise.all(
        (kanbans || []).map(async (kanban) => {
          const { data: cards, error: cardsError } = await db
            .from('cards')
            .select('*')
            .eq('kanban_id', kanban.id)
            .order('created_at', { ascending: true });

          if (cardsError) throw cardsError;

          return { ...kanban, cards: cards || [] };
        })
      );

      boards = boardsWithCards;
      renderBoards();
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    }
  }

  // ====== Render ======
  function renderBoards() {
    if (!kanbanContainer) return;
    kanbanContainer.innerHTML = '';

    boards.forEach((board) => {
      const boardElement = document.createElement('div');
      boardElement.className = 'kanban-board';
      boardElement.dataset.boardId = board.id;

      boardElement.innerHTML = `
        <div class="kanban-header">
          <h3 class="kanban-title" contenteditable="true">${sanitize(board.title)}</h3>
          <div class="kanban-actions">
            <button class="icon-btn add-card-btn" title="Adicionar card">
              <i class="fas fa-plus"></i>
            </button>
            <button class="icon-btn delete-board-btn" title="Excluir kanban">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="kanban-cards" data-board-id="${board.id}"></div>
      `;

      kanbanContainer.appendChild(boardElement);

      const cardsContainer = boardElement.querySelector('.kanban-cards');
      board.cards.forEach((card) => {
        cardsContainer.appendChild(createCardElement(card));
      });

      setupDragAndDrop(boardElement);
    });

    // Editar título do board e salvar no Supabase
    document.querySelectorAll('.kanban-header .kanban-title').forEach((titleEl) => {
      titleEl.addEventListener('blur', async () => {
        const boardId = titleEl.closest('.kanban-board')?.dataset.boardId;
        const newTitle = titleEl.textContent?.trim() || 'Sem título';

        try {
          const { error } = await db
            .from('kanbans')
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq('id', boardId);

          if (error) throw error;

          const b = boards.find((x) => String(x.id) === String(boardId));
          if (b) b.title = newTitle;
        } catch (err) {
          console.error('Erro ao atualizar título do kanban:', err);
        }
      });
    });
  }

  function createCardElement(card) {
    const el = document.createElement('div');
    el.className = 'kanban-card';
    el.dataset.cardId = card.id;
    el.draggable = true;

    el.innerHTML = `
      <div class="card-header">
        <h4 class="card-title">${sanitize(card.title)}</h4>
        <button class="card-delete" title="Excluir card">
          <i class="fas fa-times"></i>
        </button>
      </div>
      <div class="card-content">
        ${card.phone ? `<p class="card-phone"><i class="fas fa-phone"></i> ${sanitize(card.phone)}</p>` : ''}
        ${card.description ? `<p><i class="fas fa-sticky-note"></i> ${sanitize(card.description)}</p>` : ''}
      </div>
    `;

    el.addEventListener('dragstart', function (e) {
      e.dataTransfer.setData('text/plain', String(card.id));
      this.classList.add('dragging');
    });
    el.addEventListener('dragend', function () {
      this.classList.remove('dragging');
    });

    return el;
  }

  // ====== Drag and Drop ======
  function setupDragAndDrop(boardElement) {
    const cardsContainer = boardElement.querySelector('.kanban-cards');

    cardsContainer.addEventListener('dragover', function (e) {
      e.preventDefault();
      this.classList.add('drop-zone');
    });

    cardsContainer.addEventListener('dragleave', function () {
      this.classList.remove('drop-zone');
    });

    cardsContainer.addEventListener('drop', async function (e) {
      e.preventDefault();
      this.classList.remove('drop-zone');

      const cardId = e.dataTransfer.getData('text/plain');
      const cardElement = document.querySelector(`[data-card-id="${CSS.escape(cardId)}"]`);
      if (!cardElement) return;

      const sourceBoardId = cardElement.closest('.kanban-board')?.dataset.boardId;
      const targetBoardId = this.dataset.boardId;

      await moveCardToBoard(cardId, sourceBoardId, targetBoardId);
    });
  }

  async function moveCardToBoard(cardId, sourceBoardId, targetBoardId) {
    const sourceBoard = boards.find((b) => String(b.id) === String(sourceBoardId));
    const targetBoard = boards.find((b) => String(b.id) === String(targetBoardId));
    if (!sourceBoard || !targetBoard) return;

    const idx = sourceBoard.cards.findIndex((c) => String(c.id) === String(cardId));
    if (idx === -1) return;
    const [card] = sourceBoard.cards.splice(idx, 1);
    targetBoard.cards.push(card);

    try {
      const { error } = await db
        .from('cards')
        .update({
          kanban_id: targetBoardId,
          position: targetBoard.position,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cardId);

      if (error) throw error;
    } catch (error) {
      console.error('Erro ao mover card:', error);
      sourceBoard.cards.splice(idx, 0, card);
      targetBoard.cards.pop();
    }
  }

  // ====== Eventos ======
  function setupEventListeners() {
    if (addBoardBtn) {
      addBoardBtn.addEventListener('click', onAddBoard);
    }
    if (addSampleDataBtn) {
      addSampleDataBtn.addEventListener('click', createSampleData);
    }

    if (kanbanContainer) {
      kanbanContainer.addEventListener('click', function (e) {
        const addCardBtn = e.target.closest('.add-card-btn');
        const deleteBoardBtn = e.target.closest('.delete-board-btn');
        const deleteCardBtn = e.target.closest('.card-delete');
        const cardElement = e.target.closest('.kanban-card');

        if (addCardBtn) {
          const boardId = addCardBtn.closest('.kanban-board')?.dataset.boardId;
          openCardModal(null, boardId);
        }

        if (deleteBoardBtn) {
          const boardId = deleteBoardBtn.closest('.kanban-board')?.dataset.boardId;
          openConfirmModal(boardId); // <- agora abre modal customizada
        }

        if (deleteCardBtn) {
          const cardId = deleteCardBtn.closest('.kanban-card')?.dataset.cardId;
          deleteCard(cardId);
        }

        if (cardElement && !deleteCardBtn) {
          const cardId = cardElement.dataset.cardId;
          const boardId = cardElement.closest('.kanban-board')?.dataset.boardId;
          openCardModal(cardId, boardId);
        }
      });
    }

    closeModalBtns.forEach((btn) => {
      btn.addEventListener('click', () => cardModal?.classList.add('hidden'));
    });

    if (cardForm) {
      cardForm.addEventListener('submit', function (e) {
        e.preventDefault();
        saveCard();
      });
    }

    // Eventos da modal de confirmação
    confirmDeleteBtn.addEventListener("click", () => {
      if (boardToDelete) deleteBoard(boardToDelete);
    });
    cancelDeleteBtn.addEventListener("click", closeConfirmModal);
  }

  async function onAddBoard() {
    try {
      const { error } = await db
        .from('kanbans')
        .insert([{ title: 'Novo Kanban', position: boards.length }]);

      if (error) throw error;
      showToast("Kanban criado com sucesso!", "success");
    } catch (error) {
      console.error('Erro ao criar novo kanban:', error);
      showToast("Erro ao criar kanban", "error");
    }
  }

  // ====== Modal de Card ======
  function openCardModal(cardId, boardId) {
    currentCardId = cardId;
    currentBoardId = boardId;

    const nameEl = document.getElementById('cardName');
    const phoneEl = document.getElementById('cardPhone');
    const notesEl = document.getElementById('cardNotes');

    if (!nameEl || !phoneEl || !notesEl || !cardModal || !modalTitle) return;

    if (cardId) {
      modalTitle.textContent = 'Editar Contato';
      const board = boards.find((b) => String(b.id) === String(boardId));
      const card = board?.cards.find((c) => String(c.id) === String(cardId));

      nameEl.value = card?.title ?? '';
      phoneEl.value = card?.phone ?? '';
      notesEl.value = card?.description ?? '';
    } else {
      modalTitle.textContent = 'Adicionar Contato';
      nameEl.value = '';
      phoneEl.value = '';
      notesEl.value = '';
    }

    cardModal.classList.remove('hidden');
  }

  async function saveCard() {
    const name = document.getElementById('cardName')?.value.trim();
    const phone = document.getElementById('cardPhone')?.value.trim();
    const notes = document.getElementById('cardNotes')?.value.trim();

    if (!name || !currentBoardId) return;

    const board = boards.find((b) => String(b.id) === String(currentBoardId));
    if (!board) return;

    try {
      if (currentCardId) {
        const { error } = await db
          .from('cards')
          .update({
            title: name,
            phone: phone,
            description: notes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentCardId);

        if (error) throw error;
      } else {
        const { error } = await db
          .from('cards')
          .insert([
            {
              title: name,
              phone: phone,
              description: notes,
              kanban_id: currentBoardId,
              position: board.position,
              status: 'pending',
            },
          ]);

        if (error) throw error;
      }

      cardModal.classList.add('hidden');
    } catch (error) {
      console.error('Erro ao salvar card:', error);
    }
  }

  // ====== Deleções ======
  async function deleteCard(cardId) {
    try {
      const { error } = await db.from('cards').delete().eq('id', cardId);
      if (error) throw error;
    } catch (error) {
      console.error('Erro ao excluir card:', error);
      showToast("Erro ao excluir card", "error");
    }
  }

  async function deleteBoard(boardId) {
    try {
      // 1. Exclui os cards (caso não tenha ON DELETE CASCADE)
      await db.from('cards').delete().eq('kanban_id', boardId);

      // 2. Exclui o board
      const { error: boardError } = await db.from('kanbans').delete().eq('id', boardId);
      if (boardError) throw boardError;

      showToast("Kanban excluído com sucesso!", "warning");
    } catch (error) {
      console.error('Erro ao excluir kanban:', error);
      showToast("Erro ao excluir kanban", "error");
    } finally {
      closeConfirmModal();
    }
  }

  // ====== Modal de confirmação ======
  function openConfirmModal(boardId) {
    boardToDelete = boardId;
    confirmModal.classList.remove("hidden");
  }

  function closeConfirmModal() {
    boardToDelete = null;
    confirmModal.classList.add("hidden");
  }

  // ====== Realtime ======
  function setupRealtime() {
    // Kanbans
    db.channel('kanbans-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kanbans' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          boards.push({ ...payload.new, cards: [] });
          renderBoards();
        }
        if (payload.eventType === 'UPDATE') {
          const idx = boards.findIndex((b) => b.id === payload.new.id);
          if (idx !== -1) {
            boards[idx] = { ...boards[idx], ...payload.new };
            renderBoards();
          }
        }
        if (payload.eventType === 'DELETE') {
          boards = boards.filter((b) => b.id !== payload.old.id);
          renderBoards();
        }
      })
      .subscribe();

    // Cards
    db.channel('cards-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cards' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const board = boards.find((b) => b.id === payload.new.kanban_id);
          if (board) {
            board.cards.push(payload.new);
            renderBoards();
          }
        }
        if (payload.eventType === 'UPDATE') {
          const board = boards.find((b) => b.id === payload.new.kanban_id);
          if (board) {
            const idx = board.cards.findIndex((c) => c.id === payload.new.id);
            if (idx !== -1) {
              board.cards[idx] = payload.new;
              renderBoards();
            }
          }
        }
        if (payload.eventType === 'DELETE') {
          const board = boards.find((b) => b.id === payload.old.kanban_id);
          if (board) {
            board.cards = board.cards.filter((c) => c.id !== payload.old.id);
            renderBoards();
          }
        }
      })
      .subscribe();
  }

  // ====== Util ======
  function sanitize(str = '') {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
});
