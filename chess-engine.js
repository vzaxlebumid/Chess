/* ============================================================
   ШАХМАТНЫЙ ДВИЖОК (vanilla JS, без зависимостей)
   Полные правила: рокировка, взятие на проходе, превращение
   пешки, шах, мат, пат. Проверка легальности всех ходов.
   ============================================================ */
'use strict';

class ChessGame {
  constructor() { this.reset(); }

  reset() {
    this.board = new Array(64).fill(null);
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let c = 0; c < 8; c++) {
      this.board[c] = back[c].toLowerCase();   // 8-я горизонталь (чёрные)
      this.board[8 + c] = 'p';
      this.board[48 + c] = 'P';                // 2-я горизонталь (белые)
      this.board[56 + c] = back[c];            // 1-я горизонталь (белые)
    }
    this.turn = 'w';
    this.castling = { K: true, Q: true, k: true, q: true };
    this.ep = -1;                 // поле взятия на проходе (-1 = нет)
    this.history = [];            // снимки состояния для отмены ходов
    this.moveList = [];           // сделанные ходы (для нотации)
  }

  /* ---------- утилиты ---------- */
  idx(r, c) { return r * 8 + c; }
  rc(i) { return [Math.floor(i / 8), i % 8]; }
  colorOf(p) { return p ? (p === p.toUpperCase() ? 'w' : 'b') : null; }
  opp(color) { return color === 'w' ? 'b' : 'w'; }

  kingIndex(color) {
    const target = color === 'w' ? 'K' : 'k';
    for (let i = 0; i < 64; i++) if (this.board[i] === target) return i;
    return -1;
  }

  /* ---------- атака поля ---------- */
  isAttacked(i, byColor) {
    const b = this.board;
    const [r, c] = this.rc(i);
    // пешки
    const pr = byColor === 'w' ? r + 1 : r - 1;
    for (const dc of [-1, 1]) {
      const nc = c + dc;
      if (pr >= 0 && pr < 8 && nc >= 0 && nc < 8) {
        const p = b[this.idx(pr, nc)];
        if (p && this.colorOf(p) === byColor && p.toUpperCase() === 'P') return true;
      }
    }
    // кони
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const p = b[this.idx(nr, nc)];
      if (p && this.colorOf(p) === byColor && p.toUpperCase() === 'N') return true;
    }
    // король
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
      const p = b[this.idx(nr, nc)];
      if (p && this.colorOf(p) === byColor && p.toUpperCase() === 'K') return true;
    }
    // слоны / ферзи (диагонали)
    for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[this.idx(nr, nc)];
        if (p) {
          if (this.colorOf(p) === byColor && (p.toUpperCase() === 'B' || p.toUpperCase() === 'Q')) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    // ладьи / ферзи (вертикали и горизонтали)
    for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        const p = b[this.idx(nr, nc)];
        if (p) {
          if (this.colorOf(p) === byColor && (p.toUpperCase() === 'R' || p.toUpperCase() === 'Q')) return true;
          break;
        }
        nr += dr; nc += dc;
      }
    }
    return false;
  }

  /* ---------- псевдолегальные ходы фигуры ---------- */
  pseudoMoves(i) {
    const b = this.board;
    const p = b[i];
    if (!p) return [];
    const color = this.colorOf(p);
    const enemy = this.opp(color);
    const type = p.toUpperCase();
    const [r, c] = this.rc(i);
    const moves = [];

    const push = (to, extra) => {
      const t = b[to];
      if (!t || this.colorOf(t) !== color) moves.push(Object.assign({ from: i, to, piece: p, captured: t || null }, extra));
    };

    if (type === 'P') {
      const dir = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const promoRow = color === 'w' ? 0 : 7;
      const nr = r + dir;
      if (nr >= 0 && nr < 8) {
        const one = this.idx(nr, c);
        if (!b[one]) {
          moves.push({ from: i, to: one, piece: p, captured: null, promotion: nr === promoRow ? 'Q' : null });
          const two = this.idx(r + 2 * dir, c);
          if (r === startRow && !b[two]) moves.push({ from: i, to: two, piece: p, captured: null, double: true });
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (nc < 0 || nc > 7) continue;
          const to = this.idx(nr, nc);
          const t = b[to];
          if (t && this.colorOf(t) !== color) {
            moves.push({ from: i, to, piece: p, captured: t, promotion: nr === promoRow ? 'Q' : null });
          } else if (!t && to === this.ep) {
            moves.push({ from: i, to, piece: p, captured: b[to - dir * 8], enpassant: true });
          }
        }
      }
    } else if (type === 'N') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        push(this.idx(nr, nc));
      }
    } else if (type === 'K') {
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        push(this.idx(nr, nc));
      }
      // рокировка
      const homeRow = color === 'w' ? 7 : 0;
      const home = this.idx(homeRow, 4);
      if (i === home && !this.isAttacked(home, enemy)) {
        const rK = color === 'w' ? 'K' : 'k';
        const rQ = color === 'w' ? 'Q' : 'q';
        if (this.castling[rK] && !b[home + 1] && !b[home + 2] &&
            !this.isAttacked(home + 1, enemy) && !this.isAttacked(home + 2, enemy)) {
          moves.push({ from: i, to: home + 2, piece: p, castle: 'K' });
        }
        if (this.castling[rQ] && !b[home - 1] && !b[home - 2] && !b[home - 3] &&
            !this.isAttacked(home - 1, enemy) && !this.isAttacked(home - 2, enemy)) {
          moves.push({ from: i, to: home - 2, piece: p, castle: 'Q' });
        }
      }
    } else {
      const dirs = type === 'B' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
        : type === 'R' ? [[-1,0],[1,0],[0,-1],[0,1]]
        : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
          const to = this.idx(nr, nc);
          if (!b[to]) {
            moves.push({ from: i, to, piece: p, captured: null });
          } else {
            if (this.colorOf(b[to]) !== color) moves.push({ from: i, to, piece: p, captured: b[to] });
            break;
          }
          nr += dr; nc += dc;
        }
      }
    }
    return moves;
  }

  /* ---------- легальные ходы с учётом шаха ---------- */
  legalMovesFrom(i) {
    const p = this.board[i];
    if (!p || this.colorOf(p) !== this.turn) return [];
    const color = this.turn;
    return this.pseudoMoves(i).filter(m => this._isLegal(m, color));
  }

  allLegalMoves(color) {
    const out = [];
    for (let i = 0; i < 64; i++) {
      if (this.board[i] && this.colorOf(this.board[i]) === color) {
        for (const m of this.pseudoMoves(i)) if (this._isLegal(m, color)) out.push(m);
      }
    }
    return out;
  }

  _isLegal(m, color) {
    this._push();
    this._apply(m, color);
    const ok = !this.isAttacked(this.kingIndex(color), this.opp(color));
    this._pop();
    return ok;
  }

  /* ---------- применение / отмена хода ---------- */
  _push() {
    this.history.push({
      b: this.board.slice(),
      turn: this.turn,
      castling: Object.assign({}, this.castling),
      ep: this.ep,
      ml: this.moveList.length
    });
  }
  _pop() {
    const s = this.history.pop();
    this.board = s.b;
    this.turn = s.turn;
    this.castling = s.castling;
    this.ep = s.ep;
    this.moveList.length = s.ml;
  }

  _apply(m, color) {
    const b = this.board;
    const promo = m.promotion || null;
    b[m.to] = promo ? (color === 'w' ? promo.toUpperCase() : promo.toLowerCase()) : m.piece;
    b[m.from] = null;
    if (m.enpassant) b[m.to + (color === 'w' ? 8 : -8)] = null;
    if (m.castle === 'K') { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
    if (m.castle === 'Q') { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    this.ep = m.double ? m.from + (color === 'w' ? -8 : 8) : -1;
    // права на рокировку
    if (m.from === 60 || m.to === 60) { this.castling.K = false; this.castling.Q = false; }
    if (m.from === 4 || m.to === 4) { this.castling.k = false; this.castling.q = false; }
    if (m.from === 63 || m.to === 63) this.castling.K = false;
    if (m.from === 56 || m.to === 56) this.castling.Q = false;
    if (m.from === 7 || m.to === 7) this.castling.k = false;
    if (m.from === 0 || m.to === 0) this.castling.q = false;
    this.turn = this.opp(color);
  }

  /* сделать ход (promotion: 'Q'|'R'|'B'|'N' — выбор при превращении) */
  make(m, promotion) {
    const color = this.turn;
    this._push();
    if (promotion) m = Object.assign({}, m, { promotion });
    this._apply(m, color);
    this.moveList.push({ from: m.from, to: m.to, piece: m.piece, captured: m.captured || null, castle: m.castle || null, enpassant: !!m.enpassant, promotion: m.promotion || null, color });
  }

  undo() {
    if (this.history.length === 0) return false;
    this._pop();
    return true;
  }

  /* ---------- статус позиции ---------- */
  status() {
    const color = this.turn;
    const enemy = this.opp(color);
    const inCheck = this.isAttacked(this.kingIndex(color), enemy);
    const hasMoves = this.allLegalMoves(color).length > 0;
    if (!hasMoves) return inCheck ? { over: true, winner: enemy, checkmate: true } : { over: true, stalemate: true };
    return { over: false, check: inCheck };
  }
}

window.ChessGame = ChessGame;
