/**
 * Dias úteis por produto (MaycredData.diasUteisPorProduto: Novo / Portabilidade) e calendário editável.
 */
(function (global) {
  const DOW = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  /** @param {Date} d */
  function formatLocalYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /** @returns {string} hoje YYYY-MM-DD (local) */
  function hojeLocal() {
    return formatLocalYMD(new Date());
  }

  /** @returns {string} amanhã YYYY-MM-DD (local) */
  function amanhaLocal() {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return formatLocalYMD(t);
  }

  /**
   * Gera array de dias úteis padrão (seg a sex) do mês.
   * @param {number} ano
   * @param {number} mes - 1 a 12
   * @returns {string[]}
   */
  function gerarDiasUteisPadrao(ano, mes) {
    const y = Math.floor(Number(ano));
    const m = Math.floor(Number(mes));
    if (!y || m < 1 || m > 12) return [];
    const mIndex = m - 1;
    const lastDay = new Date(y, mIndex + 1, 0).getDate();
    const out = [];
    for (let d = 1; d <= lastDay; d++) {
      const dt = new Date(y, mIndex, d);
      const wd = dt.getDay();
      if (wd >= 1 && wd <= 5) out.push(formatLocalYMD(dt));
    }
    return out;
  }

  /**
   * Dias úteis salvos ou lista padrão seg–sex.
   * @param {string} mes - YYYY-MM
   * @param {'ENTRANTE'|'PORT'} [produto] — ENTRANTE = Novo, PORT = Portabilidade (default PORT)
   */
  function getDiasUteisDoMes(mes, produto) {
    const prod = produto === 'ENTRANTE' ? 'ENTRANTE' : 'PORT';
    if (typeof global.MaycredData !== 'undefined' && typeof global.MaycredData.getDiasUteisMesPorProduto === 'function') {
      const saved = global.MaycredData.getDiasUteisMesPorProduto(mes, prod);
      if (Array.isArray(saved) && saved.length) return [...saved].sort();
    }
    const parts = String(mes).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return gerarDiasUteisPadrao(y, m);
  }

  /**
   * Quantos dias da lista já passaram até hoje (inclui hoje se estiver na lista).
   * @param {string[]} diasUteis
   */
  function diasUteisPassados(diasUteis) {
    const hoje = hojeLocal();
    const arr = Array.isArray(diasUteis) ? diasUteis : [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] <= hoje) n++;
    }
    return n;
  }

  /**
   * Dias úteis restantes a partir de amanhã (datas >= amanhã).
   * @param {string[]} diasUteis
   */
  function diasUteisRestantes(diasUteis) {
    const am = amanhaLocal();
    const arr = Array.isArray(diasUteis) ? diasUteis : [];
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] >= am) n++;
    }
    return n;
  }

  /** @param {string[]} diasUteis */
  function diasUteisTotais(diasUteis) {
    return Array.isArray(diasUteis) ? diasUteis.length : 0;
  }

  /**
   * União dos dias úteis Novo (ENTRANTE) e Portabilidade (PORT) no mês — ordenado YYYY-MM-DD.
   * Usado no dashboard do time para um único denominador de “dias restantes”.
   * @param {string} mes - YYYY-MM
   * @returns {string[]}
   */
  function mergeDiasUteisMesProdutos(mes) {
    const dE = getDiasUteisDoMes(mes, 'ENTRANTE');
    const dP = getDiasUteisDoMes(mes, 'PORT');
    const u = new Set();
    if (Array.isArray(dE)) dE.forEach(function (x) { u.add(String(x)); });
    if (Array.isArray(dP)) dP.forEach(function (x) { u.add(String(x)); });
    const out = [...u].sort();
    if (out.length) return out;
    const parts = String(mes).split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    return gerarDiasUteisPadrao(y, m);
  }

  /**
   * @param {string} ymd
   * @returns {number} 0=Seg … 6=Dom
   */
  function mondayIndexFromYMD(ymd) {
    const p = String(ymd).split('-');
    const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    const js = d.getDay();
    return js === 0 ? 6 : js - 1;
  }

  function isWeekendYMD(ymd) {
    const p = String(ymd).split('-');
    const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    const js = d.getDay();
    return js === 0 || js === 6;
  }

  /**
   * @param {string} mes YYYY-MM
   * @param {string} label
   */
  function monthTitlePT(mes, label) {
    const p = String(mes).split('-');
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) - 1;
    if (Number.isNaN(y) || m < 0 || m > 11) return label || mes;
    const d = new Date(y, m, 1);
    const t = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /**
   * Renderiza calendário mensal editável (clique alterna dia útil).
   * @param {string|HTMLElement} containerIdOrEl - id no documento ou elemento DOM (recomendado passar o próprio nó).
   * @param {string} mes - YYYY-MM
   * @param {function(string[]): void} onChange
   * @param {{ produto?: 'ENTRANTE'|'PORT' }} [opts]
   */
  function renderCalendario(containerIdOrEl, mes, onChange, opts) {
    const mount =
      typeof containerIdOrEl === 'string'
        ? document.getElementById(containerIdOrEl)
        : containerIdOrEl;
    if (!mount || mount.nodeType !== 1) return;

    const produto = opts && opts.produto === 'ENTRANTE' ? 'ENTRANTE' : 'PORT';

    let lista = [...getDiasUteisDoMes(mes, produto)].sort();
    const setUtil = new Set(lista);

    function emit() {
      const nova = [...setUtil].sort();
      lista = nova;
      if (typeof onChange === 'function') onChange(nova);
    }

    function paint() {
      mount.innerHTML = '';
      mount.className = 'maycred-cal';

      const head = document.createElement('div');
      head.className = 'maycred-cal__title';
      head.textContent = monthTitlePT(mes, mes);
      mount.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'maycred-cal__grid';
      mount.appendChild(grid);

      for (let c = 0; c < 7; c++) {
        const h = document.createElement('div');
        h.className = 'maycred-cal__dow';
        h.textContent = DOW[c];
        grid.appendChild(h);
      }

      const parts = String(mes).split('-');
      const y = parseInt(parts[0], 10);
      const mo = parseInt(parts[1], 10);
      if (Number.isNaN(y) || mo < 1 || mo > 12) return;

      const first = `${y}-${String(mo).padStart(2, '0')}-01`;
      const lead = mondayIndexFromYMD(first);
      const lastDay = new Date(y, mo, 0).getDate();

      for (let i = 0; i < lead; i++) {
        const pad = document.createElement('div');
        pad.className = 'maycred-cal__pad';
        grid.appendChild(pad);
      }

      for (let d = 1; d <= lastDay; d++) {
        const ymd = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'maycred-cal__day';
        cell.textContent = String(d);
        cell.dataset.date = ymd;

        const weekend = isWeekendYMD(ymd);
        const util = setUtil.has(ymd);
        if (weekend) cell.classList.add('maycred-cal__day--weekend');
        if (util) cell.classList.add('maycred-cal__day--util');
        else if (!weekend) cell.classList.add('maycred-cal__day--off');
        cell.setAttribute('aria-pressed', util ? 'true' : 'false');
        cell.title = util ? 'Dia útil — clique para remover' : 'Clique para marcar como útil';

        cell.addEventListener('click', function () {
          if (setUtil.has(ymd)) setUtil.delete(ymd);
          else setUtil.add(ymd);
          emit();
          paint();
        });

        grid.appendChild(cell);
      }
    }

    paint();
  }

  global.MaycredCalendar = {
    gerarDiasUteisPadrao,
    getDiasUteisDoMes,
    mergeDiasUteisMesProdutos,
    diasUteisPassados,
    diasUteisRestantes,
    diasUteisTotais,
    renderCalendario,
    formatLocalYMD,
    hojeLocal,
    amanhaLocal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
