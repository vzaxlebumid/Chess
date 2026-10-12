/* ============================================================
   ИНТЕРАКТИВНАЯ ДОСКА
   Клик и перетаскивание, подсветка легальных ходов, отмена,
   сброс, переворот, превращение пешки, список ходов.
   ============================================================ */
'use strict';

const PieceNames = { K: 'Король', Q: 'Ферзь', R: 'Ладья', B: 'Слон', N: 'Конь', P: 'Пешка' };
const FILES = 'abcdefgh';

function squareName(i) {
  const [r, c] = [Math.floor(i / 8), i % 8];
  return FILES[c] + (8 - r);
}

class ChessBoardUI {
  constructor(game, els) {
    this.game = game;               // экземпляр ChessGame
    this.boardEl = els.board;
    this.statusEl = els.status;
    this.moveListEl = els.moveList;
    this.capturedByWhiteEl = els.capturedByWhite;
    this.capturedByBlackEl = els.capturedByBlack;
    this.promoModal = els.promotionModal;
    this.promoChoices = els.promotionChoices;
    this.flipped = false;
    this.selected = -1;
    this.legalCache = [];
    this.lastMove = null;
    this.squareEls = new Array(64).fill(null);
    this.drag = null;
    this._build();
    this._bindPointer();
    this.refresh();
  }

  /* порядок отображения клеток с учётом переворота */
  _order() {
    const order = [];
    for (let d = 0; d < 64; d++) {
      const dr = Math.floor(d / 8), dc = d % 8;
      const r = this.flipped ? 7 - dr : dr;
      const c = this.flipped ? 7 - dc : dc;
      order.push(r * 8 + c);
    }
    return order;
  }

  _build() {
    this.boardEl.innerHTML = '';
    this._order().forEach(i => {
      const [r, c] = [Math.floor(i / 8), i % 8];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'square ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
      btn.dataset.square = i;
      btn.setAttribute('role', 'gridcell');
      // координаты: буквы внизу, цифры слева
      if ((!this.flipped && c === 0) || (this.flipped && c === 7)) {
        const span = document.createElement('span');
        span.className = 'coord rank';
        span.textContent = 8 - r;
        btn.appendChild(span);
      }
      if ((!this.flipped && r === 7) || (this.flipped && r === 0)) {
        const span = document.createElement('span');
        span.className = 'coord file';
        span.textContent = FILES[c];
        btn.appendChild(span);
      }
      btn.addEventListener('click', () => this._onSquareClick(i));
      this.boardEl.appendChild(btn);
      this.squareEls[i] = btn;
    });
  }

  _bindPointer() {
    // перетаскивание фигур указателем / пальцем
    this.boardEl.addEventListener('pointerdown', (e) => {
      const sqEl = e.target.closest('.square');
      if (!sqEl || this._promoOpen) return;
      const i = Number(sqEl.dataset.square);
      const p = this.game.board[i];
      if (!p || this.game.colorOf(p) !== this.game.turn) return;
      this.drag = { from: i, x: e.clientX, y: e.clientY, moved: false, ghost: null };
      this._select(i);
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (!this.drag.moved && Math.hypot(dx, dy) > 8) {
        this.drag.moved = true;
        this.drag.ghost = document.createElement('div');
        this.drag.ghost.className = 'drag-ghost';
        this.drag.ghost.innerHTML = PieceSVG.svg(this.game.board[this.drag.from].toUpperCase(), this.game.turn);
        document.body.appendChild(this.drag.ghost);
        this.squareEls[this.drag.from].classList.add('drag-src');
      }
      if (this.drag.moved && this.drag.ghost) {
        this.drag.ghost.style.left = e.clientX + 'px';
        this.drag.ghost.style.top = e.clientY + 'px';
      }
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.drag) return;
      const drag = this.drag;
      this.drag = null;
      if (drag.ghost) drag.ghost.remove();
      this.squareEls[drag.from].classList.remove('drag-src');
      if (!drag.moved) return; // это был клик — обработан отдельно
      const rect = this.boardEl.getBoundingClientRect();
      const size = rect.width / 8;
      const c = Math.floor((e.clientX - rect.left) / size);
      const dr = Math.floor((e.clientY - rect.top) / size);
      if (dr < 0 || dr > 7 || c < 0 || c > 7) { this._clearSelection(); this.refresh(); return; }
      const r = this.flipped ? 7 - dr : dr;
      const to = r * 8 + c;
      if (to === drag.from) { this.refresh(); return; }
      const mv = this.legalCache.find(m => m.to === to);
      if (mv) this._doMove(mv);
      else { this._clearSelection(); this.refresh(); }
    });
  }

  _onSquareClick(i) {
    if (this._promoOpen) return;
    const p = this.game.board[i];
    // выбор своей фигуры
    if (p && this.game.colorOf(p) === this.game.turn) {
      if (this.selected === i) { this._clearSelection(); this.refresh(); return; }
      this._select(i);
      this.refresh();
      return;
    }
    // ход на выбранную клетку
    if (this.selected >= 0) {
      const mv = this.legalCache.find(m => m.to === i);
      if (mv) { this._doMove(mv); return; }
    }
    this._clearSelection();
    this.refresh();
  }

  _select(i) {
    this.selected = i;
    this.legalCache = this.game.legalMovesFrom(i);
  }
  _clearSelection() {
    this.selected = -1;
    this.legalCache = [];
  }

  async _doMove(mv) {
    this._clearSelection();
    if (mv.promotion) {
      const choice = await this._askPromotion(this.game.turn);
      this.game.make(mv, choice);
    } else {
      this.game.make(mv);
    }
    this.lastMove = mv;
    this.refresh();
  }

  _askPromotion(color) {
    return new Promise(resolve => {
      this._promoOpen = true;
      this.promoChoices.innerHTML = '';
      ['Q', 'R', 'B', 'N'].forEach(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = PieceSVG.svg(t, color);
        b.setAttribute('aria-label', 'Превратить в: ' + PieceNames[t]);
        b.addEventListener('click', () => {
          this.promoModal.hidden = true;
          this._promoOpen = false;
          resolve(t);
        }, { once: true });
        this.promoChoices.appendChild(b);
      });
      this.promoModal.hidden = false;
      const first = this.promoChoices.querySelector('button');
      if (first) first.focus();
    });
  }

  reset() {
    this.game.reset();
    this._clearSelection();
    this.lastMove = null;
    this.refresh();
  }
  undo() {
    if (this.game.undo()) {
      this._clearSelection();
      this.lastMove = this.game.moveList.length ? this.game.moveList[this.game.moveList.length - 1] : null;
      this.refresh();
    } else {
      this.statusEl.textContent = 'Отменять нечего — ходов ещё не было';
      setTimeout(() => this.refresh(), 1600);
    }
  }
  flip() {
    this.flipped = !this.flipped;
    this._build();
    this.refresh();
  }

  refresh() {
    const b = this.game.board;
    // фигуры и подсветка
    for (let i = 0; i < 64; i++) {
      const el = this.squareEls[i];
      el.querySelectorAll('.piece-svg').forEach(n => n.remove());
      el.classList.remove('selected', 'hint-move', 'hint-capture', 'last-from', 'last-to', 'in-check');
      const p = b[i];
      if (p) {
        const wrap = document.createElement('span');
        wrap.innerHTML = PieceSVG.svg(p.toUpperCase(), this.game.colorOf(p), 'piece-svg');
        el.appendChild(wrap.firstElementChild);
        el.setAttribute('aria-label', squareName(i) + ': ' + PieceNames[p.toUpperCase()] + (p === p.toUpperCase() ? ' (белые)' : ' (чёрные)'));
      } else {
        el.setAttribute('aria-label', squareName(i) + ': пусто');
      }
    }
    // выбранная фигура и ходы
    if (this.selected >= 0) {
      this.squareEls[this.selected].classList.add('selected');
      for (const m of this.legalCache) {
        this.squareEls[m.to].classList.add(m.captured ? 'hint-capture' : 'hint-move');
      }
    }
    // последний ход
    if (this.lastMove) {
      this.squareEls[this.lastMove.from].classList.add('last-from');
      this.squareEls[this.lastMove.to].classList.add('last-to');
    }
    // статус
    const st = this.game.status();
    if (st.over) {
      if (st.checkmate) this.statusEl.textContent = 'Мат! Победа ' + (st.winner === 'w' ? 'белых' : 'чёрных');
      else this.statusEl.textContent = 'Пат — ничья';
    } else {
      const side = this.game.turn === 'w' ? 'белых' : 'чёрных';
      this.statusEl.textContent = (st.check ? 'Шах! ' : '') + 'Ход ' + side;
    }
    // шах королю
    if (!st.over && st.check) {
      this.squareEls[this.game.kingIndex(this.game.turn)].classList.add('in-check');
    }
    this._renderMoves();
    this._renderCaptured();
  }

  _renderMoves() {
    const ml = this.game.moveList;
    this.moveListEl.innerHTML = '';
    if (ml.length === 0) {
      const li = document.createElement('li');
      li.className = 'move-empty';
      li.textContent = 'Ходов пока нет';
      this.moveListEl.appendChild(li);
      return;
    }
    ml.forEach((m, k) => {
      const li = document.createElement('li');
      const num = document.createElement('span');
      num.className = 'mnum';
      num.textContent = m.color === 'w' ? (Math.floor(k / 2) + 1) + '.' : '';
      const txt = document.createElement('span');
      let s = squareName(m.from) + '–' + squareName(m.to);
      if (m.castle === 'K') s = 'O-O';
      if (m.castle === 'Q') s = 'O-O-O';
      if (m.promotion) s += '=' + ({ Q: 'Ф', R: 'Л', B: 'С', N: 'К' }[m.promotion]);
      txt.textContent = s;
      li.appendChild(num);
      li.appendChild(txt);
      this.moveListEl.appendChild(li);
    });
    this.moveListEl.scrollTop = this.moveListEl.scrollHeight;
  }

  _renderCaptured() {
    const initial = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const onBoard = { w: { P: 0, N: 0, B: 0, R: 0, Q: 0 }, b: { P: 0, N: 0, B: 0, R: 0, Q: 0 } };
    for (const p of this.game.board) {
      if (!p) continue;
      const t = p.toUpperCase();
      if (t === 'K') continue;
      onBoard[this.game.colorOf(p)][t]++;
    }
    const render = (color) => {
      let html = '';
      for (const t of ['Q', 'R', 'B', 'N', 'P']) {
        const missing = initial[t] - onBoard[color][t];
        for (let k = 0; k < missing; k++) html += PieceSVG.svg(t, color);
      }
      return html;
    };
    // "у белых пленены" — чёрные фигуры, взятые белыми
    this.capturedByWhiteEl.innerHTML = render('b');
    this.capturedByBlackEl.innerHTML = render('w');
  }
}

/* Декоративная сцена в герое: маленькая доска с расстановкой */
function renderHeroBoard(mountEl) {
  // красивая «игровая» позиция
  const setup = {
    60: 'K', 62: 'R', 57: 'N', 51: 'P', 52: 'P',
    4: 'k', 7: 'r', 2: 'b', 6: 'n', 12: 'p', 13: 'p', 11: 'p',
    42: 'N', 34: 'B', 27: 'R', 24: 'Q'
  };
  const board = document.createElement('div');
  board.className = 'mini-board';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = 'msq ' + (((r + c) % 2 === 0) ? 'light' : 'dark');
      const i = r * 8 + c;
      if (setup[i]) {
        const color = setup[i] === setup[i].toUpperCase() ? 'w' : 'b';
        sq.innerHTML = PieceSVG.svg(setup[i].toUpperCase(), color);
      }
      board.appendChild(sq);
    }
  }
  mountEl.innerHTML = '';
  mountEl.appendChild(board);
}

window.ChessBoardUI = ChessBoardUI;
window.renderHeroBoard = renderHeroBoard;
