/**
 * UI: dashboard, lançamentos, vendedoras e dias úteis (em Configurações).
 */
(function (global) {
  /** @type {Array<{ destroy: function(): void }>} */
  const chartRegistry = [];

  function registerChart(chart) {
    if (chart && typeof chart.destroy === 'function') chartRegistry.push(chart);
  }

  function destroyCharts() {
    while (chartRegistry.length) {
      const c = chartRegistry.pop();
      try {
        c.destroy();
      } catch (_) {}
    }
  }

  let chartJsPromise = null;
  function ensureChartJs(cb) {
    if (typeof global.Chart !== 'undefined') {
      cb();
      return;
    }
    if (!chartJsPromise) {
      chartJsPromise = new Promise(function (resolve) {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        s.crossOrigin = 'anonymous';
        s.onload = resolve;
        s.onerror = resolve;
        document.head.appendChild(s);
      });
    }
    chartJsPromise.then(function () {
      cb();
    });
  }

  function ensureToastHost() {
    let h = document.getElementById('ui-toast-host');
    if (!h) {
      h = document.createElement('div');
      h.id = 'ui-toast-host';
      h.className = 'ui-toast-host';
      document.body.appendChild(h);
    }
    return h;
  }

  /** @param {'success'|'error'|'info'} type */
  function toast(message, type) {
    const host = ensureToastHost();
    const t = document.createElement('div');
    t.className = 'ui-toast ui-toast--' + (type || 'info');
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 3200);
  }

  function confirmModal(title, body, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'ui-modal-overlay';
    overlay.innerHTML =
      '<div class="ui-modal" role="dialog">' +
      '<h3 class="ui-modal__title"></h3>' +
      '<p class="ui-modal__body"></p>' +
      '<div class="ui-modal__actions">' +
      '<button type="button" class="ui-btn ui-btn--secondary" data-act="cancel">Cancelar</button>' +
      '<button type="button" class="ui-btn ui-btn--danger" data-act="ok">Excluir</button>' +
      '</div></div>';
    overlay.querySelector('.ui-modal__title').textContent = title;
    overlay.querySelector('.ui-modal__body').textContent = body;
    function close() {
      overlay.remove();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    overlay.querySelector('[data-act="ok"]').addEventListener('click', function () {
      close();
      if (typeof onConfirm === 'function') onConfirm();
    });
    document.body.appendChild(overlay);
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(c) {
    while (c.firstChild) c.removeChild(c.firstChild);
  }

  /** Valores em reais com prefixo R$ explícito (pt-BR). */
  function formatBRL(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return '—';
    const num = x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return 'R$\u00a0' + num;
  }

  function initials(nome) {
    const p = String(nome || '')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!p.length) return '?';
    if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
    return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  }

  /** Aceita "1.234,56" ou "1234.56". */
  function parseMoneyBR(s) {
    const t = String(s || '')
      .trim()
      .replace(/\s/g, '');
    if (!t) return 0;
    const only = t.replace(/[^\d,.-]/g, '');
    const lastComma = only.lastIndexOf(',');
    const lastDot = only.lastIndexOf('.');
    let norm = only;
    if (lastComma >= 0 && lastDot >= 0) {
      norm = lastComma > lastDot ? only.replace(/\./g, '').replace(',', '.') : only.replace(/,/g, '');
    } else if (lastComma >= 0) {
      norm = only.replace(/\./g, '').replace(',', '.');
    } else {
      norm = only.replace(/,/g, '');
    }
    const n = parseFloat(norm);
    return Number.isFinite(n) ? n : 0;
  }

  function csvEscapeCell(val) {
    const t = String(val == null ? '' : val);
    if (/[;"\r\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  /**
   * @param {object} snap - retorno de `MaycredCalc.computeMesSnapshot`
   * @param {{ config: { comissaoPort: number, comissaoEntrante: number } }} st
   */
  function buildDashboardExportCsv(snap, st) {
    const sep = ';';
    const head = [
      'mes',
      'tipo',
      'vendedora_id',
      'nome',
      'produto_padrao',
      'meta_rentabilidade',
      'meta_producao_total',
      'meta_averbacao',
      'producao_bruta',
      'producao_analise',
      'producao_averbada',
      'analise',
      'pago',
      'total',
      'falta_rent',
      'falta_producao',
      'pct_meta_rent',
      'pct_meta_producao',
      'pct_meta_averbacao',
      'taxa_efetiva_pct',
      'n_ops_producao',
    ];
    const lines = [head.join(sep)];
    const t = snap.team;
    const teTeam = t.producaoTotal > 0 ? (t.analiseTotal / t.producaoTotal) * 100 : '';
    lines.push(
      [
        snap.mes,
        'TIME',
        '',
        '',
        '',
        t.metaTotal,
        t.metaProducaoTotalSoma,
        t.metaAverbacaoSoma,
        t.producaoTotal,
        t.producaoBrutaAnaliseTotal,
        t.producaoBrutaAverbadaTotal,
        t.analiseTotal,
        t.pagoTotal,
        t.totalTotal,
        t.faltaTotal,
        t.faltaProducaoTotal,
        t.pctGeral,
        t.pctProducaoGeral,
        t.pctAverbacaoGeral,
        teTeam,
        snap.nOpsProducao,
      ]
        .map(csvEscapeCell)
        .join(sep)
    );
    snap.linhas.forEach(function (L) {
      const v = L.vendedora;
      const m = L.meta;
      const r = L.row;
      const mt = global.MaycredCalc.parseMetaTargets(m);
      const te = r.producaoBruta > 0 ? (r.analise / r.producaoBruta) * 100 : '';
      lines.push(
        [
          snap.mes,
          'VENDEDORA',
          v.id,
          v.nome,
          v.produto,
          mt.metaRent,
          mt.metaVol,
          mt.metaAverb,
          r.producaoBruta,
          r.producaoBrutaAnalise,
          r.producaoBrutaAverbada,
          r.analise,
          r.pago,
          r.total,
          r.faltaRent,
          r.faltaProducao,
          r.pctGestor,
          r.pctMetaProducaoTotal,
          mt.metaAverb > 0 ? r.pctMetaAverbacao : '',
          te,
          L.nOpsProducao,
        ]
          .map(csvEscapeCell)
          .join(sep)
      );
    });
    const rent = snap.rentabilidade;
    lines.push('');
    lines.push(['secao', 'campo', 'valor'].join(sep));
    lines.push(['rentabilidade', 'spread_banco_decimal', rent.spreadBanco].map(csvEscapeCell).join(sep));
    lines.push(['rentabilidade', 'custo_operacional_mes', rent.custoOperacionalMes].map(csvEscapeCell).join(sep));
    lines.push(
      ['rentabilidade', 'producao_liquida_estimada', rent.producaoLiquidaEstimada].map(csvEscapeCell).join(sep)
    );
    lines.push(
      ['rentabilidade', 'producao_liquida_menos_custos', rent.producaoLiquidaMenosCustos]
        .map(csvEscapeCell)
        .join(sep)
    );
    lines.push(
      [
        'rentabilidade',
        'indice_analise_sobre_custo',
        rent.indiceAnaliseSobreCusto != null ? rent.indiceAnaliseSobreCusto : '',
      ]
        .map(csvEscapeCell)
        .join(sep)
    );
    lines.push(['comissoes_mes', 'port_decimal', st.config.comissaoPort].map(csvEscapeCell).join(sep));
    lines.push(['comissoes_mes', 'entrante_decimal', st.config.comissaoEntrante].map(csvEscapeCell).join(sep));
    lines.push(['comissoes_mes', 'op_novo_decimal', st.config.comissaoOpNovo].map(csvEscapeCell).join(sep));
    lines.push(['comissoes_mes', 'op_cartao_decimal', st.config.comissaoOpCartao].map(csvEscapeCell).join(sep));
    lines.push(['comissoes_mes', 'op_port_decimal', st.config.comissaoOpPort].map(csvEscapeCell).join(sep));
    lines.push(['comissoes_mes', 'op_port_refin_decimal', st.config.comissaoOpPortRefin].map(csvEscapeCell).join(sep));
    return lines.join('\n');
  }

  /** Cards de progresso de rentabilidade (sem exibir valor da meta em R$). */
  function renderDashboardGestor(container) {
    clear(container);
    const st = global.MaycredData.getState();
    const mes = st.config.mesAtual;
    const snap = global.MaycredCalc.computeMesSnapshot(st.vendedoras, mes, st);

    const dashHead = el('div', 'ui-dash-header');
    const headLeft = el('div', 'ui-dash-header__left');
    headLeft.appendChild(el('h2', 'ui-dash-header__title', 'Dashboard'));
    headLeft.appendChild(el('span', 'ui-dash-header__mes', mes));
    dashHead.appendChild(headLeft);
    container.appendChild(dashHead);

    const sorted = snap.linhas.slice().sort(function (a, b) {
      return b.row.pctGestor - a.row.pctGestor;
    });

    const grid = el('div', 'ui-rent-grid');
    sorted.forEach(function (L) {
      const v = L.vendedora;
      const row = L.row;
      const mt = global.MaycredCalc.parseMetaTargets(L.meta);
      const metaRent = mt.metaRent;
      const pctRaw = row.pctGestor;
      const atingiu = metaRent > 0 && row.total >= metaRent;
      const faixa = atingiu ? 'dourado' : global.MaycredCalc.faixaDesempenhoVendedora(Math.min(100, pctRaw));

      const card = el('article', 'ui-rent-card ui-rent-card--' + faixa);
      const top = el('div', 'ui-rent-card__head');
      top.appendChild(el('div', 'ui-avatar ui-rent-card__av', initials(v.nome)));
      const titles = el('div', 'ui-rent-card__titles');
      titles.appendChild(el('div', 'ui-rent-card__name', v.nome));
      const sub = el('div', 'ui-rent-card__sub');
      sub.appendChild(el('span', 'ui-chip ui-chip--' + (v.produto === 'PORT' ? 'port' : 'entrante'), v.produto));
      sub.appendChild(document.createTextNode(' · acumulado no mês'));
      titles.appendChild(sub);
      top.appendChild(titles);
      card.appendChild(top);

      const pctStr =
        Math.abs(pctRaw - Math.round(pctRaw)) < 0.05
          ? Math.round(pctRaw) + '%'
          : (Math.round(pctRaw * 10) / 10).toFixed(1) + '%';
      card.appendChild(el('div', 'ui-rent-card__pct', pctStr));

      const bar = el('div', 'ui-rent-bar');
      const trk = el('div', 'ui-rent-bar__track');
      const fl = el('div', 'ui-rent-bar__fill ui-rent-bar__fill--' + faixa);
      fl.style.width = Math.min(100, Math.max(0, pctRaw)) + '%';
      trk.appendChild(fl);
      bar.appendChild(trk);
      card.appendChild(bar);

      grid.appendChild(card);
    });
    container.appendChild(grid);
  }

  /** @param {HTMLElement} container */
  function renderProducao(container) {
    clear(container);
    const page = el('div', 'ui-producao-page');
    page.appendChild(el('h2', 'ui-section__title', 'Produção'));
    page.appendChild(
      el(
        'p',
        'ui-muted',
        'Em cada fase: valor produzido (R$), taxa automática receita ÷ produção (%), e receita (R$). Total produção e total receita são só leitura (soma / resultado do cálculo). Ao salvar, o total em R$ gravado é produção em análise + produção averbada (quando averbada informada). Salve para atualizar % e totais.',
      ),
    );

    const toolbar = el('div', 'ui-producao-toolbar');
    const lblData = el('label', 'ui-field ui-field--inline ui-producao-toolbar__data');
    lblData.appendChild(el('span', 'ui-field__label', 'Data dos dados'));
    const inpData = el('input', 'ui-input');
    inpData.type = 'date';
    inpData.title = 'Referência da conferência (como na planilha).';
    const btnSave = el('button', 'ui-btn ui-btn--primary', 'Salvar planilha');
    btnSave.type = 'button';
    toolbar.appendChild(lblData);
    lblData.appendChild(inpData);
    toolbar.appendChild(btnSave);
    page.appendChild(toolbar);

    const tw = el('div', 'ui-table-wrap ui-producao-resumo-wrap');
    const twResumo = el('div', 'ui-table-wrap ui-producao-resumo-wrap ui-producao-resumo-por-produto');
    page.appendChild(tw);
    page.appendChild(twResumo);
    container.appendChild(page);

    function moneyCellRead(label, val) {
      const td = el('td', 'ui-mono');
      td.setAttribute('data-label', label);
      td.textContent = formatBRL(val);
      return td;
    }

    function moneyInput(className) {
      const inp = el('input', 'ui-input ui-input--narrow ' + (className || ''));
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.setAttribute('autocomplete', 'off');
      inp.placeholder = '0,00';
      return inp;
    }

    /** Exibe valor em pt-BR (milhar e centavos), sem prefixo R$, para digitação manual. */
    function formatMoneyBrInput(n) {
      const x = Number(n);
      if (!Number.isFinite(x)) return '';
      return x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function wireProducaoMoneyInput(inp) {
      inp.classList.add('ui-input--money-br');
      inp.addEventListener('blur', function () {
        const t = String(inp.value || '').trim();
        if (!t) {
          inp.value = '';
          return;
        }
        inp.value = formatMoneyBrInput(parseMoneyBR(inp.value));
      });
      inp.addEventListener('focus', function () {
        if (String(inp.value || '').trim()) inp.select();
      });
    }

    /** @param {string} label @param {string} field @param {number} initialNum */
    function moneyFieldTd(label, field, initialNum) {
      const td = el('td', 'ui-producao-input-cell');
      td.setAttribute('data-label', label);
      const inp = moneyInput('');
      inp.dataset.field = field;
      const n = Number(initialNum);
      if (Number.isFinite(n)) inp.value = formatMoneyBrInput(n);
      else inp.value = '';
      wireProducaoMoneyInput(inp);
      td.appendChild(inp);
      return td;
    }

    /** Taxa efetiva: receita (R$) / produção (R$) → % (comissão implícita sobre o produzido). */
    function pctReceitaSobreProducao(label, receitaR, producaoR) {
      const td = el('td', 'ui-mono ui-producao-pct-cell');
      td.setAttribute('data-label', label);
      const p = Number(producaoR);
      const r = Number(receitaR);
      if (!(p > 0) || !Number.isFinite(r)) td.textContent = '—';
      else td.textContent = (Math.round((r / p) * 100 * 100) / 100) + '%';
      return td;
    }

    function paint() {
      clear(tw);
      clear(twResumo);

      const st = global.MaycredData.getState();
      const mes = st.config.mesAtual;
      const snap = global.MaycredCalc.computeMesSnapshot(st.vendedoras, mes, st);
      const pm = st.producaoManual && st.producaoManual[mes] ? st.producaoManual[mes] : {};

      inpData.value = st.config.dataControleProducao ? String(st.config.dataControleProducao).slice(0, 10) : '';

      const order = snap.linhas.map(function (L) {
        return { v: L.vendedora, row: L.row, meta: L.meta };
      });

      const table = el('table', 'ui-table ui-table--responsive ui-table--producao-planilha');
      const thead = el('thead');
      const trPhase = el('tr', 'ui-producao-head-phases');
      function phaseTh(extraClass, colspan, text) {
        const th = el('th', 'ui-producao-phase-head' + (extraClass ? ' ' + extraClass : ''));
        if (colspan > 1) th.colSpan = colspan;
        th.textContent = text;
        return th;
      }
      trPhase.appendChild(phaseTh('ui-producao-phase-head--ident', 3, 'Identificação'));
      trPhase.appendChild(phaseTh('ui-producao-phase-head--objetivo', 3, 'Objetivo'));
      trPhase.appendChild(phaseTh('ui-producao-phase-head--analise', 3, 'Em análise'));
      trPhase.appendChild(phaseTh('ui-producao-phase-head--averb', 3, 'Averbada / pago'));
      trPhase.appendChild(phaseTh('ui-producao-phase-head--total', 3, 'Total (soma)'));
      thead.appendChild(trPhase);
      const hr = el('tr', 'ui-producao-head-cols');
      [
        'Vendedora',
        'DISC',
        'Produto',
        'Meta produção (R$)',
        '% (rent./prod.)',
        'Meta rentabilidade (R$)',
        'Produção em análise (R$)',
        '% (rec./prod.)',
        'Receita em análise (R$)',
        'Produção averbada (R$)',
        '% (rec./prod.)',
        'Receita averbada / pago (R$)',
        'Total produção (R$)',
        '% (rec./prod.)',
        'Total receita — soma (R$)',
      ].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el('tbody');

      let sumTotalProducaoCampos = 0;
      let sumTotalReceitaCampos = 0;

      const agg = {
        PORT: {
          metaVol: 0,
          metaRent: 0,
          volAn: 0,
          rentAn: 0,
          volAv: 0,
          rentAv: 0,
          volTot: 0,
          rentTot: 0,
        },
        ENTRANTE: {
          metaVol: 0,
          metaRent: 0,
          volAn: 0,
          rentAn: 0,
          volAv: 0,
          rentAv: 0,
          volTot: 0,
          rentTot: 0,
        },
      };

      order.forEach(function (R) {
        const v = R.v;
        const row = R.row;
        const mt = global.MaycredCalc.parseMetaTargets(R.meta);
        const metaVol = mt.metaVol;
        const metaRent = mt.metaRent;
        const man = pm[v.id] && typeof pm[v.id] === 'object' ? pm[v.id] : null;

        const g = v.produto === 'ENTRANTE' ? agg.ENTRANTE : agg.PORT;
        g.metaVol += metaVol;
        g.metaRent += metaRent;
        g.volAn += row.producaoBrutaAnalise;
        g.rentAn += row.analise;
        g.volAv += row.producaoBrutaAverbada;
        g.rentAv += row.rentabilidadeAverbada;
        g.volTot += row.producaoBruta;
        g.rentTot += row.total;

        const tr = el('tr', v.produto === 'PORT' ? 'ui-producao-row--port' : 'ui-producao-row--entrante');

        const vendCell = el('td', null);
        vendCell.setAttribute('data-label', 'Vendedora');
        const av = el('div', 'ui-vend-cell');
        av.appendChild(el('div', 'ui-avatar', initials(v.nome)));
        const avt = el('div', 'ui-vend-cell__text');
        avt.appendChild(el('div', 'ui-vend-cell__name', v.nome));
        av.appendChild(avt);
        vendCell.appendChild(av);
        tr.appendChild(vendCell);

        const tdDisc = el('td', 'ui-mono');
        tdDisc.setAttribute('data-label', 'DISC');
        tdDisc.textContent = v.disc || '—';
        tr.appendChild(tdDisc);

        const chip = el('span', 'ui-chip ui-chip--' + (v.produto === 'PORT' ? 'port' : 'entrante'), v.produto);
        const tdProd = el('td', null);
        tdProd.setAttribute('data-label', 'Produto');
        tdProd.appendChild(chip);
        tr.appendChild(tdProd);

        tr.appendChild(moneyFieldTd('Meta produção (R$)', 'metaVol', metaVol));
        tr.appendChild(pctReceitaSobreProducao('% meta (rent./prod.)', metaRent, metaVol));
        tr.appendChild(moneyFieldTd('Meta rentabilidade (R$)', 'metaRent', metaRent));

        const tdBA = el('td', 'ui-producao-input-cell');
        tdBA.setAttribute('data-label', 'Produção em análise (R$)');
        const inBA = moneyInput('');
        inBA.dataset.field = 'brutoAnalise';
        inBA.value =
          man && man.brutoAnalise != null && !Number.isNaN(Number(man.brutoAnalise))
            ? formatMoneyBrInput(Number(man.brutoAnalise))
            : '';
        wireProducaoMoneyInput(inBA);
        tdBA.appendChild(inBA);
        tr.appendChild(tdBA);
        tr.appendChild(pctReceitaSobreProducao('% em análise (rec./prod.)', row.analise, row.producaoBrutaAnalise));

        const tdAL = el('td', 'ui-producao-input-cell');
        tdAL.setAttribute('data-label', 'Receita em análise (R$)');
        const inAL = moneyInput('');
        inAL.dataset.field = 'analiseLiquido';
        inAL.value =
          man && man.analiseLiquido != null && !Number.isNaN(Number(man.analiseLiquido))
            ? formatMoneyBrInput(Number(man.analiseLiquido))
            : '';
        wireProducaoMoneyInput(inAL);
        tdAL.appendChild(inAL);
        tr.appendChild(tdAL);

        const tdBAV = el('td', 'ui-producao-input-cell');
        tdBAV.setAttribute('data-label', 'Produção averbada (R$)');
        const inBAV = moneyInput('');
        inBAV.dataset.field = 'brutoAverbado';
        inBAV.value =
          man && man.brutoAverbado != null && !Number.isNaN(Number(man.brutoAverbado))
            ? formatMoneyBrInput(Number(man.brutoAverbado))
            : row.producaoBrutaAverbada > 0
              ? formatMoneyBrInput(Math.round(row.producaoBrutaAverbada * 100) / 100)
              : '';
        wireProducaoMoneyInput(inBAV);
        tdBAV.appendChild(inBAV);
        tr.appendChild(tdBAV);
        tr.appendChild(
          pctReceitaSobreProducao('% averbada (rec./prod.)', row.rentabilidadeAverbada, row.producaoBrutaAverbada),
        );

        const tdPg = el('td', 'ui-producao-input-cell');
        tdPg.setAttribute('data-label', 'Receita averbada / pago (R$)');
        const inPg = moneyInput('');
        inPg.dataset.field = 'pago';
        inPg.value =
          man && man.pago != null && !Number.isNaN(Number(man.pago))
            ? formatMoneyBrInput(Number(man.pago))
            : row.pago > 0
              ? formatMoneyBrInput(Math.round(row.pago * 100) / 100)
              : '';
        wireProducaoMoneyInput(inPg);
        tdPg.appendChild(inPg);
        tr.appendChild(tdPg);

        const tdTotP = moneyCellRead('Total produção (R$)', row.producaoBruta);
        tdTotP.className = (tdTotP.className ? tdTotP.className + ' ' : '') + 'ui-producao-soma-nao-editavel';
        tr.appendChild(tdTotP);
        tr.appendChild(pctReceitaSobreProducao('% total (rec./prod.)', row.total, row.producaoBruta));

        const tdTotR = moneyCellRead('Total receita — soma (R$)', row.total);
        tdTotR.className = (tdTotR.className ? tdTotR.className + ' ' : '') + 'ui-producao-soma-nao-editavel';
        tr.appendChild(tdTotR);

        if (!inBA.value && row.producaoBruta > 0) {
          inBA.value = formatMoneyBrInput(Math.round(row.producaoBruta * 100) / 100);
        }
        if (!inAL.value && row.analise > 0) {
          inAL.value = formatMoneyBrInput(Math.round(row.analise * 100) / 100);
        }

        const pb = Number(row.producaoBruta);
        sumTotalProducaoCampos += Number.isFinite(pb) ? pb : 0;
        const rtTot = Number(row.total);
        sumTotalReceitaCampos += Number.isFinite(rtTot) ? rtTot : 0;

        tr.dataset.vendedoraId = v.id;
        tbody.appendChild(tr);
      });

      const fMetaVol = agg.PORT.metaVol + agg.ENTRANTE.metaVol;
      const fMetaRent = agg.PORT.metaRent + agg.ENTRANTE.metaRent;
      const fVolAn = agg.PORT.volAn + agg.ENTRANTE.volAn;
      const fRentAn = agg.PORT.rentAn + agg.ENTRANTE.rentAn;
      const fVolAv = agg.PORT.volAv + agg.ENTRANTE.volAv;
      const fRentAv = agg.PORT.rentAv + agg.ENTRANTE.rentAv;
      const fVolTot = agg.PORT.volTot + agg.ENTRANTE.volTot;
      const fRentTot = agg.PORT.rentTot + agg.ENTRANTE.rentTot;
      const tfoot = el('tfoot');
      const fr = el('tr', 'ui-producao-total-geral');
      const tdTotLab = el('td', 'ui-producao-total-label', 'TOTAL GERAL');
      tdTotLab.colSpan = 3;
      fr.appendChild(tdTotLab);
      fr.appendChild(moneyCellRead('Σ Meta produção', fMetaVol));
      fr.appendChild(pctReceitaSobreProducao('Σ % meta', fMetaRent, fMetaVol));
      fr.appendChild(moneyCellRead('Σ Meta rentabilidade', fMetaRent));
      fr.appendChild(moneyCellRead('Σ Produção análise', fVolAn));
      fr.appendChild(pctReceitaSobreProducao('Σ % análise', fRentAn, fVolAn));
      fr.appendChild(moneyCellRead('Σ Receita análise', fRentAn));
      fr.appendChild(moneyCellRead('Σ Produção averbada', fVolAv));
      fr.appendChild(pctReceitaSobreProducao('Σ % averbada', fRentAv, fVolAv));
      fr.appendChild(moneyCellRead('Σ Receita averbada', fRentAv));
      fr.appendChild(moneyCellRead('Σ Total produção', sumTotalProducaoCampos));
      fr.appendChild(pctReceitaSobreProducao('Σ % total', sumTotalReceitaCampos, sumTotalProducaoCampos));
      fr.appendChild(moneyCellRead('Σ Total receita', sumTotalReceitaCampos));
      tfoot.appendChild(fr);
      table.appendChild(tbody);
      table.appendChild(tfoot);
      tw.appendChild(table);

      const totBar = el('div', 'ui-producao-totais-dupla');
      const it1 = el('span', 'ui-producao-totais-dupla__item');
      it1.appendChild(el('span', 'ui-producao-totais-dupla__lbl', 'Σ Total produção '));
      it1.appendChild(el('span', 'ui-mono', formatBRL(sumTotalProducaoCampos)));
      const it2 = el('span', 'ui-producao-totais-dupla__item');
      it2.appendChild(el('span', 'ui-producao-totais-dupla__lbl', 'Σ Total receita '));
      it2.appendChild(el('span', 'ui-mono', formatBRL(sumTotalReceitaCampos)));
      totBar.appendChild(it1);
      totBar.appendChild(it2);
      tw.appendChild(totBar);

      function subLinhaFases(titulo, a) {
        const tr = el(
          'tr',
          titulo === 'PORT'
            ? 'ui-producao-row--port'
            : titulo === 'ENTRANTE'
              ? 'ui-producao-row--entrante'
              : 'ui-producao-row--total-resumo',
        );
        tr.appendChild(el('td', 'ui-mono', titulo));
        tr.appendChild(moneyCellRead('META pr.', a.metaVol));
        tr.appendChild(pctReceitaSobreProducao('% meta', a.metaRent, a.metaVol));
        tr.appendChild(moneyCellRead('META rent.', a.metaRent));
        tr.appendChild(moneyCellRead('Pr. análise', a.volAn));
        tr.appendChild(pctReceitaSobreProducao('% análise', a.rentAn, a.volAn));
        tr.appendChild(moneyCellRead('Rec. análise', a.rentAn));
        tr.appendChild(moneyCellRead('Pr. averb.', a.volAv));
        tr.appendChild(pctReceitaSobreProducao('% averb.', a.rentAv, a.volAv));
        tr.appendChild(moneyCellRead('Rec. averb.', a.rentAv));
        tr.appendChild(moneyCellRead('Tot. pr.', a.volTot));
        tr.appendChild(pctReceitaSobreProducao('% total', a.rentTot, a.volTot));
        tr.appendChild(moneyCellRead('Tot. rec.', a.rentTot));
        return tr;
      }

      const t2 = el('table', 'ui-table ui-table--producao-resumo-por-produto-inner');
      const th2 = el('thead');
      const hr2 = el('tr', 'ui-producao-resumo-prod-head');
      [
        '',
        'Meta produção',
        '%',
        'Meta rent.',
        'Pr. análise',
        '%',
        'Rec. análise',
        'Pr. averb.',
        '%',
        'Rec. averb.',
        'Tot. pr.',
        '%',
        'Tot. rec.',
      ].forEach(function (h) {
        hr2.appendChild(el('th', null, h));
      });
      th2.appendChild(hr2);
      t2.appendChild(th2);
      const tb2 = el('tbody');
      tb2.appendChild(subLinhaFases('PORT', agg.PORT));
      tb2.appendChild(subLinhaFases('ENTRANTE', agg.ENTRANTE));
      const totAgg = {
        metaVol: agg.PORT.metaVol + agg.ENTRANTE.metaVol,
        metaRent: agg.PORT.metaRent + agg.ENTRANTE.metaRent,
        volAn: agg.PORT.volAn + agg.ENTRANTE.volAn,
        rentAn: agg.PORT.rentAn + agg.ENTRANTE.rentAn,
        volAv: agg.PORT.volAv + agg.ENTRANTE.volAv,
        rentAv: agg.PORT.rentAv + agg.ENTRANTE.rentAv,
        volTot: agg.PORT.volTot + agg.ENTRANTE.volTot,
        rentTot: agg.PORT.rentTot + agg.ENTRANTE.rentTot,
      };
      const trT = subLinhaFases('TOTAL', totAgg);
      trT.classList.add('ui-producao-total-geral');
      tb2.appendChild(trT);
      t2.appendChild(tb2);
      const resumoCard = el('div', 'ui-producao-resumo-prod-card');
      resumoCard.appendChild(el('h3', 'ui-producao-resumo-prod-title', 'Resumo por produto'));
      resumoCard.appendChild(
        el(
          'p',
          'ui-producao-resumo-prod-desc',
          'Totais agregados por PORT e ENTRANTE, nas mesmas fases da planilha (meta → análise → averbada → total).',
        ),
      );
      resumoCard.appendChild(t2);
      twResumo.appendChild(resumoCard);

      btnSave.onclick = function () {
        const st2 = global.MaycredData.getState();
        const mes2 = st2.config.mesAtual;
        const tbodyEl = tw.querySelector('tbody');
        if (!tbodyEl) return;
        const rowEls = tbodyEl.querySelectorAll('tr[data-vendedora-id]');
        /** @type {Record<string, Record<string, unknown>>} */
        const map = {};
        rowEls.forEach(function (trEl) {
          const vid = trEl.getAttribute('data-vendedora-id');
          if (!vid) return;
          function q(field) {
            return trEl.querySelector('input[data-field="' + field + '"]');
          }
          const inAL = q('analiseLiquido');
          const inBAV = q('brutoAverbado');
          /** @type {{ vendedoraId: string, mes: string, metaProducaoTotal: number, metaRentabilidade?: number }} */
          const upMeta = {
            vendedoraId: vid,
            mes: mes2,
            metaProducaoTotal: parseMoneyBR(q('metaVol') && q('metaVol').value),
          };
          const inMR = q('metaRent');
          if (inMR && String(inMR.value).trim() !== '') {
            upMeta.metaRentabilidade = parseMoneyBR(inMR.value);
          }
          global.MaycredData.upsertMeta(upMeta);
          /** @type {Record<string, unknown>} */
          const baSave = parseMoneyBR(q('brutoAnalise') && q('brutoAnalise').value);
          let totalBrutoSave = baSave;
          if (inBAV && String(inBAV.value).trim() !== '') {
            totalBrutoSave = baSave + parseMoneyBR(inBAV.value);
          }
          const rowMap = {
            ativo: true,
            brutoAnalise: baSave,
            analiseLiquido:
              inAL && String(inAL.value).trim() !== '' ? parseMoneyBR(inAL.value) : undefined,
            pago: parseMoneyBR(q('pago') && q('pago').value),
            totalBruto: totalBrutoSave,
          };
          if (inBAV && String(inBAV.value).trim() !== '') {
            rowMap.brutoAverbado = parseMoneyBR(inBAV.value);
          }
          map[vid] = rowMap;
        });
        global.MaycredData.setProducaoManualMes(mes2, map);
        toast('Planilha e metas salvas. O dashboard usa estes valores.', 'success');
        if (global.MaycredApp && typeof global.MaycredApp.refreshCurrent === 'function') {
          global.MaycredApp.refreshCurrent();
        }
        paint();
      };
    }

    inpData.addEventListener('change', function () {
      const v = inpData.value;
      global.MaycredData.setConfig({ dataControleProducao: v || '' });
      toast('Data dos dados atualizada.', 'info');
    });

    paint();
  }

  /** Cadastro e lista de operações (módulo separado da tela Produção). */
  /** @param {HTMLElement} container */
  function renderOperacoes(container) {
    const MO = global.MaycredOperacoes;
    clear(container);
    const page = el('div', 'ui-section ui-operacoes-page');
    page.appendChild(el('h2', 'ui-section__title', 'Operações'));
    page.appendChild(
      el(
        'p',
        'ui-muted',
        'Mês ativo: ' +
          global.MaycredData.getState().config.mesAtual +
          ' (topo). Tipos NOVO, CARTÃO, PORT e PORT+REFIN. Rentabilidade na meta: só com tabela escolhida na proposta (valor financiado × % da tabela). Sem tabela, a proposta não entra no cálculo de meta.'
      )
    );

    const blockForm = el('div', 'ui-config-block');
    blockForm.appendChild(el('h3', 'ui-config-block__title', 'Cadastro de operação'));
    const formHost = el('div', 'ui-operacoes-form-host');
    blockForm.appendChild(formHost);
    page.appendChild(blockForm);

    const blockList = el('div', 'ui-config-block');
    blockList.appendChild(el('h3', 'ui-config-block__title', 'Operações do mês'));
    const tblWrap = el('div', 'ui-table-wrap ui-operacoes-table-wrap');
    blockList.appendChild(tblWrap);
    page.appendChild(blockList);
    container.appendChild(page);

    let editingOpId = null;

    function paint() {
      clear(formHost);
      clear(tblWrap);

      const st = global.MaycredData.getState();
      const mes = st.config.mesAtual;

      const opEdit = editingOpId
        ? st.operacoes.find(function (o) {
            return o.id === editingOpId;
          })
        : null;

      formHost.appendChild(el('h4', 'ui-dash-subtitle', editingOpId ? 'Editar operação' : 'Nova operação'));

      const form = el('form', 'ui-form-grid ui-form-grid--2');
      const fv = el('div', 'ui-field');
      fv.appendChild(el('span', 'ui-field__label', 'Vendedora'));
      const selV = el('select', 'ui-select');
      st.vendedoras.forEach(function (vv) {
        const o = el('option', null, vv.nome);
        o.value = vv.id;
        selV.appendChild(o);
      });
      if (opEdit) selV.value = opEdit.vendedoraId;
      fv.appendChild(selV);
      form.appendChild(fv);

      const fref = el('div', 'ui-field');
      fref.style.gridColumn = '1 / -1';
      fref.appendChild(el('span', 'ui-field__label', 'Cliente ou referência'));
      const inpRef = el('input', 'ui-input');
      inpRef.type = 'text';
      inpRef.placeholder = 'Nome, CPF ou número da proposta (opcional)';
      inpRef.value = opEdit ? opEdit.referencia || '' : '';
      inpRef.setAttribute('autocomplete', 'off');
      fref.appendChild(inpRef);
      form.appendChild(fref);

      const ft = el('div', 'ui-field');
      ft.appendChild(el('span', 'ui-field__label', 'Tipo de operação'));
      const selTipo = el('select', 'ui-select');
      MO.TIPOS.forEach(function (t) {
        const o = el('option', null, MO.TIPO_LABEL[t] + ' — ' + MO.TIPO_DESCRICAO[t]);
        o.value = t;
        selTipo.appendChild(o);
      });
      if (opEdit) selTipo.value = opEdit.tipoOperacao;
      ft.appendChild(selTipo);
      form.appendChild(ft);

      const fs = el('div', 'ui-field');
      fs.appendChild(el('span', 'ui-field__label', 'Status'));
      const selStatus = el('select', 'ui-select');
      function refillStatus() {
        const tipo = selTipo.value;
        const fluxo = MO.fluxoDoTipo(tipo);
        const opts = MO.statusValidos(fluxo);
        selStatus.innerHTML = '';
        opts.forEach(function (s) {
          const o = el('option', null, MO.labelStatus(tipo, s));
          o.value = s;
          selStatus.appendChild(o);
        });
        if (opEdit && opEdit.tipoOperacao === tipo) selStatus.value = opEdit.status;
        else selStatus.value = opts[0];
      }
      refillStatus();
      fs.appendChild(selStatus);
      form.appendChild(fs);

      const fval = el('div', 'ui-field');
      fval.appendChild(el('span', 'ui-field__label', 'Valor do contrato (R$)'));
      const inpVal = el('input', 'ui-input');
      inpVal.type = 'number';
      inpVal.step = '0.01';
      inpVal.required = true;
      inpVal.value = opEdit ? String(opEdit.valorContrato) : '';
      fval.appendChild(inpVal);
      form.appendChild(fval);

      const fdt = el('div', 'ui-field');
      fdt.appendChild(el('span', 'ui-field__label', 'Data'));
      const inpDt = el('input', 'ui-input');
      inpDt.type = 'date';
      inpDt.required = true;
      inpDt.value = opEdit ? opEdit.data : global.MaycredCalendar.hojeLocal();
      fdt.appendChild(inpDt);
      form.appendChild(fdt);

      const fExtra = el('div', 'ui-field ui-operacoes-op-extra');
      fExtra.style.gridColumn = '1 / -1';
      fExtra.appendChild(el('span', 'ui-field__label', 'Dados PORT / PORT+REFIN'));
      const gridEx = el('div', 'ui-form-grid ui-form-grid--2');
      const inBo = el('input', 'ui-input');
      inBo.type = 'text';
      inBo.placeholder = 'Banco de origem';
      const inBd = el('input', 'ui-input');
      inBd.type = 'text';
      inBd.placeholder = 'Banco destino (parceiro)';
      const inSd = el('input', 'ui-input');
      inSd.type = 'number';
      inSd.step = '0.01';
      inSd.placeholder = 'Saldo devedor portado (R$)';
      const inRf = el('input', 'ui-input');
      inRf.type = 'number';
      inRf.step = '0.01';
      inRf.placeholder = 'Valor refinanciamento (R$) — só PORT+REFIN';
      gridEx.appendChild(inBo);
      gridEx.appendChild(inBd);
      gridEx.appendChild(inSd);
      gridEx.appendChild(inRf);
      fExtra.appendChild(gridEx);
      form.appendChild(fExtra);

      if (opEdit) {
        inBo.value = opEdit.bancoOrigem || '';
        inBd.value = opEdit.bancoDestino || '';
        inSd.value =
          opEdit.saldoDevedorPortado != null && !Number.isNaN(Number(opEdit.saldoDevedorPortado))
            ? String(opEdit.saldoDevedorPortado)
            : '';
        inRf.value =
          opEdit.valorRefinanciamento != null && !Number.isNaN(Number(opEdit.valorRefinanciamento))
            ? String(opEdit.valorRefinanciamento)
            : '';
      }

      function syncExtraVisibility() {
        const t = selTipo.value;
        const show = t === 'PORT' || t === 'PORT_REFIN';
        fExtra.style.display = show ? '' : 'none';
        inRf.style.display = t === 'PORT_REFIN' ? '' : 'none';
      }
      syncExtraVisibility();
      selTipo.addEventListener('change', function () {
        refillStatus();
        syncExtraVisibility();
      });

      const fobs = el('div', 'ui-field');
      fobs.style.gridColumn = '1 / -1';
      fobs.appendChild(el('span', 'ui-field__label', 'Observação'));
      const txObs = el('input', 'ui-input');
      txObs.type = 'text';
      txObs.value = opEdit ? opEdit.obs || '' : '';
      fobs.appendChild(txObs);
      form.appendChild(fobs);

      const tact = el('div', 'ui-flex-gap');
      tact.style.gridColumn = '1 / -1';
      const btnSub = el('button', 'ui-btn ui-btn--primary', editingOpId ? 'Salvar operação' : 'Registrar operação');
      btnSub.type = 'submit';
      const btnCan = el('button', 'ui-btn ui-btn--secondary', 'Cancelar edição');
      btnCan.type = 'button';
      btnCan.style.display = editingOpId ? 'inline-flex' : 'none';
      tact.appendChild(btnSub);
      tact.appendChild(btnCan);
      form.appendChild(tact);

      btnCan.addEventListener('click', function () {
        editingOpId = null;
        paint();
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const tipo = selTipo.value;
        const status = selStatus.value;
        if (!MO.statusValidoParaTipo(tipo, status)) {
          toast('Status inválido para o tipo.', 'error');
          return;
        }
        const valor = parseFloat(inpVal.value);
        if (Number.isNaN(valor) || valor < 0) {
          toast('Informe o valor do contrato.', 'error');
          return;
        }
        const base = {
          vendedoraId: selV.value,
          mes: mes,
          tipoOperacao: tipo,
          status: status,
          valorContrato: valor,
          data: inpDt.value,
          referencia: inpRef.value.trim(),
          obs: txObs.value.trim(),
        };
        if (tipo === 'PORT' || tipo === 'PORT_REFIN') {
          base.bancoOrigem = inBo.value.trim();
          base.bancoDestino = inBd.value.trim();
          const sd = parseFloat(inSd.value);
          base.saldoDevedorPortado = Number.isNaN(sd) ? undefined : sd;
        } else {
          base.bancoOrigem = '';
          base.bancoDestino = '';
          base.saldoDevedorPortado = undefined;
        }
        if (tipo === 'PORT_REFIN') {
          const rf = parseFloat(inRf.value);
          base.valorRefinanciamento = Number.isNaN(rf) ? undefined : rf;
        } else {
          base.valorRefinanciamento = undefined;
        }

        if (editingOpId) {
          global.MaycredData.updateOperacao(editingOpId, base);
          toast('Operação atualizada.', 'success');
          editingOpId = null;
        } else {
          base.id = global.MaycredData.newId('op');
          global.MaycredData.addOperacao(base);
          toast('Operação registrada.', 'success');
        }
        paint();
      });

      formHost.appendChild(form);

      const opsMes = st.operacoes
        .filter(function (o) {
          return o.mes === mes;
        })
        .slice()
        .sort(function (a, b) {
          return a.data < b.data ? 1 : -1;
        });

      const t2 = el('table', 'ui-table ui-table--responsive');
      const th2 = el('thead');
      const hr2 = el('tr');
      [
        'Data',
        'Vendedora',
        'Referência',
        'Tipo',
        'Status',
        'Valor contrato (R$)',
        'Comissão est. (R$)',
        'Ações',
      ].forEach(function (h) {
        hr2.appendChild(el('th', null, h));
      });
      th2.appendChild(hr2);
      t2.appendChild(th2);
      const tb2 = el('tbody');
      if (!opsMes.length) {
        const tr0 = el('tr');
        const td0 = el('td', 'ui-muted');
        td0.colSpan = 8;
        td0.textContent = 'Nenhuma operação neste mês.';
        tr0.appendChild(td0);
        tb2.appendChild(tr0);
      } else {
        opsMes.forEach(function (op) {
          const vend = st.vendedoras.find(function (x) {
            return x.id === op.vendedoraId;
          });
          const comm = MO.comissaoEstimadaParaOperacao
            ? MO.comissaoEstimadaParaOperacao(op.valorContrato, st.config, op)
            : 0;
          const tr = el('tr');
          tr.appendChild(el('td', 'ui-mono', op.data));
          tr.appendChild(el('td', null, vend ? vend.nome : op.vendedoraId));
          const tdRef = el('td', null);
          tdRef.setAttribute('data-label', 'Referência');
          tdRef.textContent = op.referencia && String(op.referencia).trim() ? String(op.referencia).trim() : '—';
          tr.appendChild(tdRef);
          const tdT = el('td', null);
          const ch = el('span', MO.chipClass(op.tipoOperacao), MO.TIPO_LABEL[op.tipoOperacao]);
          tdT.appendChild(ch);
          tr.appendChild(tdT);
          tr.appendChild(el('td', null, MO.labelStatus(op.tipoOperacao, op.status)));
          tr.appendChild(el('td', 'ui-mono', formatBRL(op.valorContrato)));
          tr.appendChild(el('td', 'ui-mono', formatBRL(comm)));
          const tda = el('td', null);
          const bEd = el('button', 'ui-btn ui-btn--sm ui-btn--secondary', 'Editar');
          bEd.type = 'button';
          const bEx = el('button', 'ui-btn ui-btn--sm ui-btn--danger', 'Excluir');
          bEx.type = 'button';
          bEd.addEventListener('click', function () {
            editingOpId = op.id;
            paint();
          });
          bEx.addEventListener('click', function () {
            confirmModal('Excluir operação', 'Remover esta operação do mês?', function () {
              global.MaycredData.removeOperacao(op.id);
              if (editingOpId === op.id) editingOpId = null;
              toast('Operação excluída.', 'info');
              paint();
            });
          });
          tda.appendChild(bEd);
          tda.appendChild(bEx);
          tr.appendChild(tda);
          tb2.appendChild(tr);
        });
      }
      t2.appendChild(tb2);
      tblWrap.appendChild(t2);
    }

    paint();
  }

  /**
   * @param {HTMLElement} container
   * @param {boolean} [embedded] - se true, omite o título da página (uso dentro de Configurações)
   */
  function renderVendedoras(container, embedded) {
    clear(container);
    const root = embedded ? container : el('div', 'ui-section');
    if (!embedded) {
      root.appendChild(el('h2', 'ui-section__title', 'Vendedoras'));
    }
    root.appendChild(
      el(
        'p',
        'ui-muted',
        'Defina o perfil de acesso (Administrador, Líder ou Venda), usuário e senha. Venda: só o painel pessoal. ADM e Líder: menu lateral conforme Configurações → Permissões dos perfis. Senha gravada como SHA-256. Excluir remove metas e vínculos.',
      ),
    );

    const b2 = el('div', 'ui-config-block');
    b2.appendChild(el('h3', 'ui-config-block__title', 'Equipe'));
    const vendHost = el('div');
    let inlineV = null;

    function paintVend() {
      clear(vendHost);
      const st = global.MaycredData.getState();
      const tbl = el('table', 'ui-table ui-table--responsive');
      const thead = el('thead');
      const hr = el('tr');
      ['Nome', 'DISC', 'Produto', 'Perfil', 'Usuário', 'Ações'].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      const tbody = el('tbody');
      if (!st.vendedoras.length) {
        const tr = el('tr');
        const td = el('td', 'ui-muted');
        td.colSpan = 6;
        td.textContent = 'Nenhuma vendedora cadastrada.';
        tr.appendChild(td);
        tbody.appendChild(tr);
      } else {
        st.vendedoras.forEach(function (v) {
          const tr = el('tr');
          const tdN = el('td', null, v.nome);
          tdN.setAttribute('data-label', 'Nome');
          tr.appendChild(tdN);
          const tdD = el('td', null, v.disc || '—');
          tdD.setAttribute('data-label', 'DISC');
          tr.appendChild(tdD);
          const chip = el('span', 'ui-chip ui-chip--' + (v.produto === 'PORT' ? 'port' : 'entrante'), v.produto);
          const tdp = el('td', null);
          tdp.setAttribute('data-label', 'Produto');
          tdp.appendChild(chip);
          tr.appendChild(tdp);
          const pa = v.perfilAcesso || 'VENDA';
          const L = global.MaycredData.PERFIL_ACESSO_LABEL || {};
          const tdP = el('td', null, L[pa] || pa);
          tdP.setAttribute('data-label', 'Perfil');
          tr.appendChild(tdP);
          const tdU = el('td', 'ui-mono', v.loginUsuario ? String(v.loginUsuario) : '—');
          tdU.setAttribute('data-label', 'Usuário');
          tr.appendChild(tdU);
          const tda = el('td', 'ui-flex-gap');
          tda.setAttribute('data-label', 'Ações');
          const be = el('button', 'ui-btn ui-btn--sm ui-btn--secondary', 'Editar');
          const bx = el('button', 'ui-btn ui-btn--sm ui-btn--danger', 'Excluir');
          be.type = 'button';
          bx.type = 'button';
          be.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            inlineV = {
              id: v.id,
              nome: v.nome,
              disc: v.disc != null ? String(v.disc) : '',
              produto: v.produto === 'ENTRANTE' ? 'ENTRANTE' : 'PORT',
              perfilAcesso: v.perfilAcesso || 'VENDA',
              loginUsuario: v.loginUsuario != null ? String(v.loginUsuario) : '',
            };
            paintV();
          });
          bx.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            confirmModal(
              'Excluir vendedora',
              'Remover ' + v.nome + '? Metas e lançamentos dessa vendedora serão apagados.',
              function () {
                global.MaycredData.removeVendedora(v.id);
                toast('Vendedora excluída.', 'info');
                vendHost.querySelectorAll('[data-vend-panel]').forEach(function (n) {
                  n.remove();
                });
                inlineV = null;
                paintVend();
              }
            );
          });
          tda.appendChild(be);
          tda.appendChild(bx);
          tr.appendChild(tda);
          tbody.appendChild(tr);
        });
      }
      tbl.appendChild(tbody);
      vendHost.appendChild(tbl);
    }

    function paintV() {
      vendHost.querySelectorAll('[data-vend-panel]').forEach(function (n) {
        n.remove();
      });
      var editingId = inlineV && inlineV.id != null && inlineV.id !== '' ? String(inlineV.id) : null;

      const addRow = el('div', 'ui-config-block');
      addRow.setAttribute('data-vend-panel', '1');
      addRow.style.marginTop = '0.75rem';
      addRow.appendChild(el('h4', 'ui-config-block__title', editingId ? 'Editar vendedora' : 'Nova vendedora'));
      const f = el('form', 'ui-form-grid');
      const n = el('input', 'ui-input');
      n.placeholder = 'Nome completo';
      n.required = true;
      n.value = inlineV ? inlineV.nome : '';
      const d = el('input', 'ui-input');
      d.placeholder = 'DISC (perfil comportamental)';
      d.value = inlineV ? inlineV.disc : '';
      const p = el('select', 'ui-select');
      p.innerHTML = '<option value="PORT">PORT</option><option value="ENTRANTE">ENTRANTE</option>';
      if (inlineV && inlineV.produto === 'ENTRANTE') p.value = 'ENTRANTE';
      const row = el('div', 'ui-form-grid ui-form-grid--2');
      const fn = el('div', 'ui-field');
      fn.appendChild(el('span', 'ui-field__label', 'Nome'));
      fn.appendChild(n);
      const fd = el('div', 'ui-field');
      fd.appendChild(el('span', 'ui-field__label', 'DISC'));
      fd.appendChild(d);
      row.appendChild(fn);
      row.appendChild(fd);
      const fp = el('div', 'ui-field');
      fp.style.gridColumn = '1 / -1';
      fp.appendChild(el('span', 'ui-field__label', 'Produto'));
      fp.appendChild(p);
      f.appendChild(row);
      f.appendChild(fp);

      const fper = el('div', 'ui-field');
      fper.style.gridColumn = '1 / -1';
      fper.appendChild(el('span', 'ui-field__label', 'Perfil de acesso'));
      const selPer = el('select', 'ui-select');
      selPer.innerHTML =
        '<option value="VENDA">Venda — só dashboard pessoal</option>' +
        '<option value="LIDER">Líder — menu gestor (telas conforme permissões)</option>' +
        '<option value="ADM">Administrador (ADM) — menu gestor (telas conforme permissões)</option>';
      selPer.value = inlineV && inlineV.perfilAcesso ? String(inlineV.perfilAcesso) : 'VENDA';
      fper.appendChild(selPer);
      f.appendChild(fper);

      const flu = el('div', 'ui-field');
      flu.style.gridColumn = '1 / -1';
      flu.appendChild(el('span', 'ui-field__label', 'Usuário (login individual)'));
      const lu = el('input', 'ui-input');
      lu.type = 'text';
      lu.autocomplete = 'username';
      lu.placeholder = 'ex.: maria.silva';
      lu.value = inlineV ? inlineV.loginUsuario || '' : '';
      flu.appendChild(lu);
      f.appendChild(flu);

      const fpw = el('div', 'ui-form-grid ui-form-grid--2');
      fpw.style.gridColumn = '1 / -1';
      const fpa = el('div', 'ui-field');
      const pwA = el('input', 'ui-input');
      pwA.type = 'password';
      pwA.autocomplete = 'new-password';
      pwA.placeholder = editingId ? 'Deixe em branco para manter' : 'Obrigatória na inclusão';
      fpa.appendChild(el('span', 'ui-field__label', editingId ? 'Nova senha' : 'Senha'));
      fpa.appendChild(pwA);
      const fpb = el('div', 'ui-field');
      const pwB = el('input', 'ui-input');
      pwB.type = 'password';
      pwB.autocomplete = 'new-password';
      fpb.appendChild(el('span', 'ui-field__label', 'Confirmar senha'));
      fpb.appendChild(pwB);
      fpw.appendChild(fpa);
      fpw.appendChild(fpb);
      f.appendChild(fpw);

      const act = el('div', 'ui-flex-gap');
      act.style.gridColumn = '1 / -1';
      const save = el('button', 'ui-btn ui-btn--primary', 'Salvar');
      save.type = 'submit';
      const cancel = el('button', 'ui-btn ui-btn--secondary', 'Cancelar');
      cancel.type = 'button';
      act.appendChild(save);
      act.appendChild(cancel);
      f.appendChild(act);

      function closePanel() {
        inlineV = null;
        addRow.remove();
        paintVend();
      }

      f.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!n.value.trim()) {
          toast('Informe o nome.', 'error');
          return;
        }
        const prod = p.value === 'ENTRANTE' ? 'ENTRANTE' : 'PORT';
        const loginUsuario = lu.value.trim().toLowerCase();
        const pw1 = pwA.value;
        const pw2 = pwB.value;

        if (!editingId) {
          if (!loginUsuario) {
            toast('Informe o usuário de acesso.', 'error');
            return;
          }
          if (!pw1 || pw1 !== pw2) {
            toast('Defina e confirme a senha inicial.', 'error');
            return;
          }
          if (!global.MaycredData.loginUsuarioDisponivel(loginUsuario, null)) {
            toast('Este usuário já está em uso.', 'error');
            return;
          }
          global.MaycredAuth
            .sha256Hex(pw1)
            .then(function (hex) {
              global.MaycredData.addVendedora({
                id: global.MaycredData.newId('v'),
                nome: n.value.trim(),
                disc: d.value.trim(),
                produto: prod,
                perfilAcesso: selPer.value === 'ADM' || selPer.value === 'LIDER' ? selPer.value : 'VENDA',
                loginUsuario: loginUsuario,
                senhaHashHex: hex,
              });
              toast('Vendedora adicionada.', 'success');
              closePanel();
            })
            .catch(function (err) {
              toast(String(err && err.message ? err.message : err), 'error');
            });
          return;
        }

        if (loginUsuario && !global.MaycredData.loginUsuarioDisponivel(loginUsuario, editingId)) {
          toast('Este usuário já está em uso.', 'error');
          return;
        }
        if (pw1 && pw1 !== pw2) {
          toast('Confirmação da senha não confere.', 'error');
          return;
        }

        const patch = {
          nome: n.value.trim(),
          disc: d.value.trim(),
          produto: prod,
          perfilAcesso: selPer.value === 'ADM' || selPer.value === 'LIDER' ? selPer.value : 'VENDA',
          loginUsuario: loginUsuario || '',
        };
        if (!loginUsuario) {
          patch.senhaHashHex = '';
        }

        if (pw1) {
          global.MaycredAuth
            .sha256Hex(pw1)
            .then(function (hex) {
              patch.senhaHashHex = hex;
              const ok = global.MaycredData.updateVendedora(editingId, patch);
              if (ok) toast('Vendedora atualizada.', 'success');
              else toast('Não foi possível atualizar.', 'error');
              closePanel();
            })
            .catch(function (err) {
              toast(String(err && err.message ? err.message : err), 'error');
            });
          return;
        }

        const ok = global.MaycredData.updateVendedora(editingId, patch);
        if (ok) toast('Vendedora atualizada.', 'success');
        else toast('Não foi possível atualizar.', 'error');
        closePanel();
      });
      cancel.addEventListener('click', function () {
        inlineV = null;
        addRow.remove();
      });
      addRow.appendChild(f);
      if (vendHost.firstChild) vendHost.insertBefore(addRow, vendHost.firstChild);
      else vendHost.appendChild(addRow);
      try {
        addRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (_) {}
    }

    const btnAdd = el('button', 'ui-btn ui-btn--primary', '+ Adicionar vendedora');
    btnAdd.type = 'button';
    btnAdd.style.marginBottom = '0.75rem';
    btnAdd.addEventListener('click', function () {
      if (vendHost.querySelector('[data-vend-panel]')) {
        toast('Salve ou cancele o formulário aberto.', 'info');
        return;
      }
      inlineV = null;
      paintV();
    });
    b2.appendChild(btnAdd);
    b2.appendChild(vendHost);
    paintVend();
    root.appendChild(b2);
    if (!embedded) container.appendChild(root);
  }

  /** Metas de produção (volume R$) e rentabilidade (comissão R$) por vendedora no mês ativo. */
  function renderMetasMesGestor(container) {
    clear(container);
    const block = el('div', 'ui-config-block');
    block.appendChild(el('h3', 'ui-config-block__title', 'Metas do mês'));
    block.appendChild(
      el(
        'p',
        'ui-muted',
        'Mês no topo. Meta produção: alvo em R$ de volume financiado (total no mês). Meta averbação: alvo só da parte averbada (opcional; 0 = não exibe % meta averbação isolada). Meta rentabilidade: alvo em R$ de comissão que a empresa recebe (propostas com tabela e %). Colunas “/ dia útil rest.” usam o calendário de dias úteis do produto da vendedora (Novo ou Portabilidade) em Configurações → Dias úteis.',
      ),
    );
    const metasCfgHost = el('div');

    function paintMetasCfg() {
      clear(metasCfgHost);
      const st = global.MaycredData.getState();
      const mes = st.config.mesAtual;
      const tbl = el('table', 'ui-table ui-table--responsive ui-table--metas-dual');
      const thead = el('thead');
      const hr = el('tr');
      [
        'Vendedora',
        'Meta produção total (R$)',
        'Meta averbação (R$)',
        'Meta rentabilidade (R$)',
        'Rent. / dia útil rest.',
        'Produção / dia útil rest.',
      ].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      const tbody = el('tbody');
      st.vendedoras.forEach(function (v) {
        const meta = st.metas.find(function (m) {
          return m.vendedoraId === v.id && m.mes === mes;
        });
        const mt = global.MaycredCalc.parseMetaTargets(meta);
        const lancsV = st.lancamentos.filter(function (l) {
          return l.vendedoraId === v.id && l.mes === mes;
        });
        const rowV = global.MaycredCalc.calcVendedora(v, meta, mes, lancsV, st);
        const prodKey = v.produto === 'PORT' ? 'PORT' : 'ENTRANTE';
        const diasProd = global.MaycredCalendar.getDiasUteisDoMes(mes, prodKey);
        const dRest = global.MaycredCalendar.diasUteisRestantes(diasProd);
        const dTot = global.MaycredCalendar.diasUteisTotais(diasProd);
        const faltaR = Math.max(0, rowV.faltaRent);
        const faltaP = Math.max(0, rowV.faltaProducao);
        const ritmoR =
          mt.metaRent > 0
            ? global.MaycredCalc.calcMetaDiaria(faltaR, dRest, mt.metaRent, dTot)
            : null;
        const ritmoP =
          mt.metaVol > 0
            ? global.MaycredCalc.calcMetaDiaria(faltaP, dRest, mt.metaVol, dTot)
            : null;
        const tr = el('tr');
        tr.appendChild(el('td', null, v.nome));
        function inpMeta(field, val) {
          const inp = el('input', 'ui-input ui-inline-meta');
          inp.type = 'number';
          inp.step = '0.01';
          inp.min = '0';
          inp.value = val > 0 ? String(val) : '';
          inp.dataset.vid = v.id;
          inp.dataset.field = field;
          const td = el('td', null);
          td.appendChild(inp);
          tr.appendChild(td);
        }
        inpMeta('metaProducaoTotal', mt.metaVol);
        inpMeta('metaAverbacao', mt.metaAverb);
        inpMeta('metaRentabilidade', mt.metaRent);
        tr.appendChild(
          el(
            'td',
            'ui-mono',
            ritmoR && mt.metaRent > 0 ? formatBRL(ritmoR.metaDiaria) : '—',
          ),
        );
        tr.appendChild(
          el(
            'td',
            'ui-mono',
            ritmoP && mt.metaVol > 0 ? formatBRL(ritmoP.metaDiaria) : '—',
          ),
        );
        tbody.appendChild(tr);
      });
      tbl.appendChild(tbody);
      metasCfgHost.appendChild(tbl);
      const sbM = el('button', 'ui-btn ui-btn--primary', 'Salvar metas');
      sbM.type = 'button';
      sbM.style.marginTop = '0.75rem';
      sbM.addEventListener('click', function () {
        const st2 = global.MaycredData.getState();
        const mes2 = st2.config.mesAtual;
        st2.vendedoras.forEach(function (v) {
          const pick = function (field) {
            const inp = metasCfgHost.querySelector('input[data-vid="' + v.id + '"][data-field="' + field + '"]');
            const val = parseFloat(inp && inp.value);
            return Number.isNaN(val) || val < 0 ? 0 : val;
          };
          global.MaycredData.upsertMeta({
            vendedoraId: v.id,
            mes: mes2,
            metaProducaoTotal: pick('metaProducaoTotal'),
            metaAverbacao: pick('metaAverbacao'),
            metaRentabilidade: pick('metaRentabilidade'),
          });
        });
        toast('Metas salvas.', 'success');
        paintMetasCfg();
      });
      metasCfgHost.appendChild(sbM);
    }

    paintMetasCfg();
    block.appendChild(metasCfgHost);
    container.appendChild(block);
  }

  /**
   * Módulo Configurações (abas: Vendedoras, Metas do mês, Dias úteis).
   * @param {HTMLElement} container
   * @param {{ abaInicial?: 'vendedoras' | 'metas' | 'dias' }} [opts]
   */
  function renderModuloConfiguracoes(container, opts) {
    clear(container);
    const ini = opts && opts.abaInicial;
    let aba =
      ini === 'metas' || ini === 'dias' || ini === 'vendedoras' ? ini : 'vendedoras';
    const page = el('div', 'ui-page ui-modulo-config');
    page.appendChild(el('h2', 'ui-page__title', 'Configurações'));
    page.appendChild(
      el(
        'p',
        'ui-muted',
        'Equipe, acessos, metas mensais e dois calendários de dias úteis (Novo e Portabilidade). O mês ativo segue o seletor no cabeçalho.',
      ),
    );
    const tabs = el('div', 'ui-tabs');
    const host = el('div', 'ui-modulo-config-host');
    page.appendChild(tabs);
    page.appendChild(host);
    container.appendChild(page);

    function paintMod() {
      clear(tabs);
      clear(host);
      const bV = el(
        'button',
        'ui-tab' + (aba === 'vendedoras' ? ' ui-tab--active' : ''),
        'Vendedoras',
      );
      bV.type = 'button';
      bV.addEventListener('click', function () {
        aba = 'vendedoras';
        paintMod();
      });
      const bM = el(
        'button',
        'ui-tab' + (aba === 'metas' ? ' ui-tab--active' : ''),
        'Metas do mês',
      );
      bM.type = 'button';
      bM.addEventListener('click', function () {
        aba = 'metas';
        paintMod();
      });
      const bD = el(
        'button',
        'ui-tab' + (aba === 'dias' ? ' ui-tab--active' : ''),
        'Dias úteis',
      );
      bD.type = 'button';
      bD.addEventListener('click', function () {
        aba = 'dias';
        paintMod();
      });
      tabs.appendChild(bV);
      tabs.appendChild(bM);
      tabs.appendChild(bD);
      if (aba === 'vendedoras') {
        renderVendedoras(host, true);
      } else if (aba === 'metas') {
        renderMetasMesGestor(host);
      } else if (aba === 'dias') {
        renderDiasUteis(host, true);
      }
    }
    paintMod();
  }

  /**
   * @param {HTMLElement} container
   * @param {boolean} [embedded] - dentro de Configurações: bloco com título h3, sem página inteira
   */
  function renderDiasUteis(container, embedded) {
    clear(container);
    const wrap = el('div', embedded ? 'ui-config-block' : 'ui-section');
    if (embedded) {
      wrap.appendChild(el('h3', 'ui-config-block__title', 'Dias úteis'));
    } else {
      wrap.appendChild(el('h2', 'ui-section__title', 'Dias úteis'));
    }
    const st = global.MaycredData.getState();
    const mes = st.config.mesAtual;
    wrap.appendChild(
      el(
        'p',
        'ui-muted',
        'O mês é o selecionado no topo da tela. Há dois calendários: Novo (produto ENTRANTE) e Portabilidade (PORT). Cada um define os dias úteis usados nos cálculos de “quanto falta por dia útil” para as vendedoras daquele produto. Clique no dia para alternar útil (verde). Fins de semana podem ser marcados se precisar.',
      ),
    );

    /**
     * @param {'ENTRANTE'|'PORT'} produto
     * @param {string} title
     */
    function blocoCalendario(produto, title) {
      const sec = el('div', 'ui-dias-prod-block');
      sec.appendChild(el('h4', 'ui-dias-prod-block__title', title));
      const host = el('div', 'ui-cal-host');
      wrap.appendChild(sec);
      sec.appendChild(host);

      const resumo = el('div', 'ui-dias-resumo');
      function paintResumoLocal() {
        const dias = global.MaycredCalendar.getDiasUteisDoMes(mes, produto);
        const tot = global.MaycredCalendar.diasUteisTotais(dias);
        const pas = global.MaycredCalendar.diasUteisPassados(dias);
        const rest = global.MaycredCalendar.diasUteisRestantes(dias);
        resumo.innerHTML =
          '<strong>Resumo</strong> — Total: ' +
          tot +
          ' · Passados: ' +
          pas +
          ' · Restantes: ' +
          rest;
      }

      global.MaycredCalendar.renderCalendario(
        host,
        mes,
        function (dias) {
          global.MaycredData.setDiasUteisMesPorProduto(mes, produto, dias);
          paintResumoLocal();
        },
        { produto: produto },
      );
      paintResumoLocal();
      sec.appendChild(resumo);

      const btn = el('button', 'ui-btn ui-btn--secondary', 'Restaurar padrão');
      btn.type = 'button';
      btn.style.marginTop = '0.75rem';
      btn.addEventListener('click', function () {
        const p = mes.split('-');
        const y = parseInt(p[0], 10);
        const m = parseInt(p[1], 10);
        const pad = global.MaycredCalendar.gerarDiasUteisPadrao(y, m);
        global.MaycredData.setDiasUteisMesPorProduto(mes, produto, pad);
        global.MaycredCalendar.renderCalendario(
          host,
          mes,
          function (dias) {
            global.MaycredData.setDiasUteisMesPorProduto(mes, produto, dias);
            paintResumoLocal();
          },
          { produto: produto },
        );
        toast('Calendário ' + title + ' restaurado (seg–sex).', 'info');
      });
      sec.appendChild(btn);
    }

    blocoCalendario('ENTRANTE', 'Novo');
    blocoCalendario('PORT', 'Portabilidade');
    container.appendChild(wrap);
  }

  /** @param {HTMLElement} container */
  function renderDashboardVendedora(container) {
    clear(container);
    const vid = global.MaycredAuth.getVendedoraIdAtiva();
    if (!vid) {
      container.appendChild(el('p', 'ui-muted', 'Sessão inválida. Faça login novamente.'));
      return;
    }
    const st = global.MaycredData.getState();
    const self = st.vendedoras.find(function (x) {
      return x.id === vid;
    });
    if (!self) {
      container.appendChild(el('p', 'ui-muted', 'Cadastro não encontrado.'));
      return;
    }
    const mes = st.config.mesAtual;
    const meta =
      st.metas.find(function (m) {
        return m.vendedoraId === vid && m.mes === mes;
      }) || null;
    const lancs = st.lancamentos.filter(function (l) {
      return l.vendedoraId === vid && l.mes === mes;
    });
    const row = global.MaycredCalc.calcVendedora(self, meta, mes, lancs, st);
    const metaRent = global.MaycredCalc.parseMetaTargets(meta).metaRent;
    const pct = row.pctVendedora;
    const batida = global.MaycredCalc.metaBatidaVendedora(metaRent, row.pago);
    const faixa = batida ? 'dourado' : global.MaycredCalc.faixaDesempenhoVendedora(pct);
    const msg = global.MaycredCalc.mensagemMotivacional(faixa);

    const ranking = st.vendedoras.map(function (vv) {
      const mm =
        st.metas.find(function (m) {
          return m.vendedoraId === vv.id && m.mes === mes;
        }) || null;
      const ll = st.lancamentos.filter(function (l) {
        return l.vendedoraId === vv.id && l.mes === mes;
      });
      const rr = global.MaycredCalc.calcVendedora(vv, mm, mes, ll, st);
      return { id: vv.id, nome: vv.nome, pct: rr.pctVendedora };
    });
    ranking.sort(function (a, b) {
      return b.pct - a.pct;
    });

    const wrap = el('div', 'ui-vend-dash');
    wrap.appendChild(el('h2', 'ui-section__title', self.nome));
    wrap.appendChild(
      el(
        'p',
        'ui-muted ui-vend-dash__mes',
        'Mês ' + mes + ' · percentual atingido pelo que já entrou como pago na sua meta',
      ),
    );

    const hero = el('div', 'ui-vend-hero ui-vend-hero--' + faixa);
    hero.appendChild(el('div', 'ui-vend-hero__pct', Math.round(pct) + '%'));
    hero.appendChild(el('div', 'ui-vend-hero__sub', '% atingido (sem exibir valores em reais)'));
    const bar = el('div', 'ui-vend-bar');
    const trk = el('div', 'ui-vend-bar__track');
    const fl = el('div', 'ui-vend-bar__fill ui-vend-bar__fill--' + faixa);
    fl.style.width = Math.min(100, Math.max(0, pct)) + '%';
    trk.appendChild(fl);
    bar.appendChild(trk);
    hero.appendChild(bar);
    if (batida) hero.appendChild(el('p', 'ui-vend-hero__badge', 'Meta batida'));
    wrap.appendChild(hero);

    wrap.appendChild(el('p', 'ui-vend-motiv', msg));

    const rk = el('div', 'ui-vend-rank');
    rk.appendChild(el('h3', 'ui-vend-rank__title', 'Ranking do time'));
    const ul = el('ul', 'ui-vend-rank__list');
    ranking.forEach(function (R, i) {
      const li = el('li', 'ui-vend-rank__item' + (R.id === vid ? ' ui-vend-rank__item--self' : ''));
      li.appendChild(el('span', 'ui-vend-rank__pos', String(i + 1) + 'º'));
      li.appendChild(el('span', 'ui-vend-rank__name', R.nome));
      li.appendChild(el('span', 'ui-vend-rank__pct', Math.round(R.pct) + '%'));
      ul.appendChild(li);
    });
    rk.appendChild(ul);
    wrap.appendChild(rk);

    wrap.appendChild(
      el(
        'p',
        'ui-muted ui-vend-foot',
        'Nesta tela não aparecem valores em reais nem dados de comissão.'
      )
    );
    container.appendChild(wrap);
  }

  global.MaycredUI = {
    destroyCharts,
    registerChart,
    toast,
    confirmModal,
    renderDashboardGestor,
    renderDashboardVendedora,
    renderProducao,
    renderOperacoes,
    renderVendedoras,
    renderModuloConfiguracoes,
    renderDiasUteis,
    renderDiasUteisGestor: function (c) {
      renderDiasUteis(c);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
