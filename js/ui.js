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

  /** @param {string} ym - YYYY-MM */
  function mesAnterior(ym) {
    const p = String(ym || '').split('-');
    const y = parseInt(p[0], 10);
    const m = parseInt(p[1], 10);
    if (!y || m < 1 || m > 12) return '';
    const d = new Date(y, m - 2, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
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

  /** @param {string} nome */
  function inferContrato(nome) {
    const n = String(nome || '').toLowerCase();
    if (n.includes('est')) return 'ESTÁGIO';
    return 'CLT';
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

    container.appendChild(
      el(
        'p',
        'ui-dash-hint ui-dash-hint--rent',
        'Cada card mostra o quanto da meta de rentabilidade (comissão no caixa) já foi acumulado no mês. Se a gerente marcar a planilha manual em Produção, os percentuais seguem esses valores; caso contrário, entram propostas/lançamentos conforme as regras do sistema. O valor do objetivo em R$ não aparece aqui — só o progresso até 100%.'
      )
    );

    const sorted = snap.linhas.slice().sort(function (a, b) {
      return b.row.pctGestor - a.row.pctGestor;
    });

    const grid = el('div', 'ui-rent-grid');
    sorted.forEach(function (L) {
      const v = L.vendedora;
      const row = L.row;
      const mt = global.MaycredCalc.parseMetaTargets(L.meta);
      const metaRent = mt.metaRent;
      const metaVol = mt.metaVol;
      const pctRaw = row.pctGestor;
      const pctProd = row.metaProducaoTotal > 0 ? row.pctMetaProducaoTotal : 0;
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

      if (metaRent <= 0) {
        card.appendChild(el('div', 'ui-rent-card__foot ui-muted', 'Defina as metas em Configurações → Metas do mês'));
      } else if (atingiu) {
        card.appendChild(el('div', 'ui-rent-card__foot ui-rent-card__foot--ok', '100% — rentabilidade do mês fechada'));
      } else {
        const faltaPct = Math.max(0, 100 - pctRaw);
        card.appendChild(
          el('div', 'ui-rent-card__foot', 'Faltam ~' + faltaPct.toFixed(0) + '% na rentabilidade')
        );
      }
      if (metaVol > 0) {
        card.appendChild(
          el(
            'div',
            'ui-rent-card__foot ui-muted',
            'Volume (bruto): ' + Math.round(Math.min(100, pctProd)) + '% da meta de produção',
          ),
        );
      }

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
        'Planilha de controle do mês (seletor no topo). Metas de produção e rentabilidade em Configurações → Metas do mês. Marque Manual para sobrescrever com valores digitados. Sem Manual, a produção em análise / averbada e as rentabilidades vêm das propostas (status). Se Análise líquido estiver vazio no manual, usa a taxa PORT/ENTRANTE.',
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
      inp.placeholder = '0';
      return inp;
    }

    function pctOrDash(label, val) {
      const td = el('td', 'ui-mono');
      td.setAttribute('data-label', label);
      if (!Number.isFinite(val) || val < 0) td.textContent = '—';
      else td.textContent = (Math.round(val * 10) / 10) + '%';
      return td;
    }

    function paint() {
      clear(tw);
      clear(twResumo);

      const st = global.MaycredData.getState();
      const mes = st.config.mesAtual;
      const prevMes = mesAnterior(mes);
      const snap = global.MaycredCalc.computeMesSnapshot(st.vendedoras, mes, st);
      const snapPrev = prevMes
        ? global.MaycredCalc.computeMesSnapshot(st.vendedoras, prevMes, st)
        : null;
      const dias = global.MaycredCalendar.getDiasUteisDoMes(mes);
      const diasRest = global.MaycredCalendar.diasUteisRestantes(dias);
      const diasTot = global.MaycredCalendar.diasUteisTotais(dias);
      const pm = st.producaoManual && st.producaoManual[mes] ? st.producaoManual[mes] : {};

      inpData.value = st.config.dataControleProducao ? String(st.config.dataControleProducao).slice(0, 10) : '';

      const order = snap.linhas.map(function (L) {
        return { v: L.vendedora, row: L.row, meta: L.meta };
      });

      const table = el('table', 'ui-table ui-table--responsive ui-table--producao-planilha');
      const thead = el('thead');
      const hr = el('tr');
      [
        'Manual',
        'Vendedora',
        'DISC',
        'Produto',
        'Contrato',
        'Prod. mês ant. (' + (prevMes || '—') + ')',
        'Meta prod. (R$)',
        'Meta rent. (R$)',
        'Meta averb. (R$)',
        'Pr. em análise',
        '% com.',
        'Rent. análise',
        'Pr. averbada',
        '% com.',
        'Rent. averb.',
        'Tot. pr.',
        'Tot. rent.',
        '% com.',
        'Bruto análise',
        'Análise líquido',
        'Pago',
        'Total bruto',
        'Rentab. total (R$)',
        'Falta rent.',
        'Falta prod.',
        '/dia rent',
        '/dia prod',
        '% meta rent',
        '% meta prod',
        '% meta averb',
      ].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      table.appendChild(thead);
      const tbody = el('tbody');

      const agg = {
        PORT: { metaRent: 0, metaVol: 0, bruto: 0, liquido: 0, faltaRent: 0, faltaProd: 0 },
        ENTRANTE: { metaRent: 0, metaVol: 0, bruto: 0, liquido: 0, faltaRent: 0, faltaProd: 0 },
      };

      order.forEach(function (R) {
        const v = R.v;
        const row = R.row;
        const mt = global.MaycredCalc.parseMetaTargets(R.meta);
        const metaRent = mt.metaRent;
        const metaVol = mt.metaVol;
        const metaAverb = mt.metaAverb;
        const man = pm[v.id] && pm[v.id].ativo ? pm[v.id] : null;
        const prevLine =
          snapPrev && snapPrev.linhas
            ? snapPrev.linhas.find(function (x) {
                return String(x.vendedora.id) === String(v.id);
              })
            : null;
        const prevTotal = prevLine && prevLine.row ? prevLine.row.total : 0;
        const prodAnt =
          man && typeof man.prodMesAnterior === 'number' && !Number.isNaN(man.prodMesAnterior)
            ? man.prodMesAnterior
            : prevTotal;

        const faltaRent = row.faltaRent;
        const faltaProd = row.faltaProducao;
        const mdR = global.MaycredCalc.calcMetaDiaria(faltaRent, diasRest, metaRent, diasTot);
        const mdP = global.MaycredCalc.calcMetaDiaria(faltaProd, diasRest, metaVol, diasTot);

        const g = v.produto === 'ENTRANTE' ? agg.ENTRANTE : agg.PORT;
        g.metaRent += metaRent;
        g.metaVol += metaVol;
        g.bruto += row.producaoBruta;
        g.liquido += row.total;
        g.faltaRent += faltaRent;
        g.faltaProd += faltaProd;

        const tr = el('tr');

        const tdMan = el('td', 'ui-producao-manual-cell');
        tdMan.setAttribute('data-label', 'Manual');
        const cb = el('input', 'ui-checkbox');
        cb.type = 'checkbox';
        cb.title = 'Usar valores digitados (planilha) para esta vendedora no mês';
        cb.checked = !!(man && man.ativo);
        tdMan.appendChild(cb);
        tr.appendChild(tdMan);

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

        const tdContr = el('td', 'ui-mono');
        tdContr.setAttribute('data-label', 'Contrato');
        tdContr.textContent = inferContrato(v.nome);
        tr.appendChild(tdContr);

        const tdPant = el('td', 'ui-producao-input-cell');
        tdPant.setAttribute('data-label', 'Prod. mês ant.');
        const inPant = moneyInput('');
        inPant.disabled = !cb.checked;
        if (man && man.prodMesAnterior != null && !Number.isNaN(Number(man.prodMesAnterior))) {
          inPant.value = String(man.prodMesAnterior);
        } else if (prodAnt > 0) {
          inPant.value = String(Math.round(prodAnt * 100) / 100);
        } else {
          inPant.value = '';
        }
        tdPant.appendChild(inPant);
        tr.appendChild(tdPant);

        tr.appendChild(moneyCellRead('Meta prod. (R$)', metaVol));
        tr.appendChild(moneyCellRead('Meta rent. (R$)', metaRent));
        tr.appendChild(moneyCellRead('Meta averb. (R$)', metaAverb));

        tr.appendChild(moneyCellRead('Pr. em análise', row.producaoBrutaAnalise));
        tr.appendChild(pctOrDash('% com. (análise)', row.pctCommAnalise));
        tr.appendChild(moneyCellRead('Rent. análise', row.analise));
        tr.appendChild(moneyCellRead('Pr. averbada', row.producaoBrutaAverbada));
        tr.appendChild(pctOrDash('% com. (averb.)', row.pctCommAverbada));
        tr.appendChild(moneyCellRead('Rent. averb.', row.rentabilidadeAverbada));
        tr.appendChild(moneyCellRead('Tot. pr.', row.producaoBruta));
        tr.appendChild(moneyCellRead('Tot. rent.', row.total));
        tr.appendChild(pctOrDash('% com. (total)', row.pctCommTotal));

        const tdBA = el('td', 'ui-producao-input-cell');
        tdBA.setAttribute('data-label', 'Bruto análise');
        const inBA = moneyInput('');
        inBA.disabled = !cb.checked;
        inBA.value =
          man && man.brutoAnalise != null && !Number.isNaN(Number(man.brutoAnalise)) ? String(man.brutoAnalise) : '';
        tdBA.appendChild(inBA);
        tr.appendChild(tdBA);

        const tdAL = el('td', 'ui-producao-input-cell');
        tdAL.setAttribute('data-label', 'Análise líquido');
        const inAL = moneyInput('');
        inAL.disabled = !cb.checked;
        inAL.value =
          man && man.analiseLiquido != null && !Number.isNaN(Number(man.analiseLiquido))
            ? String(man.analiseLiquido)
            : '';
        tdAL.appendChild(inAL);
        tr.appendChild(tdAL);

        const tdPg = el('td', 'ui-producao-input-cell');
        tdPg.setAttribute('data-label', 'Pago');
        const inPg = moneyInput('');
        inPg.disabled = !cb.checked;
        inPg.value = man && man.pago != null && !Number.isNaN(Number(man.pago)) ? String(man.pago) : '';
        tdPg.appendChild(inPg);
        tr.appendChild(tdPg);

        const tdTB = el('td', 'ui-producao-input-cell');
        tdTB.setAttribute('data-label', 'Total bruto');
        const inTB = moneyInput('');
        inTB.disabled = !cb.checked;
        inTB.value =
          man && man.totalBruto != null && !Number.isNaN(Number(man.totalBruto)) ? String(man.totalBruto) : '';
        tdTB.appendChild(inTB);
        tr.appendChild(tdTB);

        tr.appendChild(moneyCellRead('Rentab. total (R$)', row.total));
        tr.appendChild(moneyCellRead('Falta rent.', faltaRent));
        tr.appendChild(moneyCellRead('Falta prod.', faltaProd));
        tr.appendChild(moneyCellRead('/dia rent', mdR.metaDiaria));
        tr.appendChild(moneyCellRead('/dia prod', mdP.metaDiaria));
        tr.appendChild(pctOrDash('% meta rent', row.pctGestor));
        tr.appendChild(pctOrDash('% meta prod', row.pctMetaProducaoTotal));
        tr.appendChild(pctOrDash('% meta averb', metaAverb > 0 ? row.pctMetaAverbacao : NaN));

        cb.addEventListener('change', function () {
          const on = cb.checked;
          inPant.disabled = !on;
          inBA.disabled = !on;
          inAL.disabled = !on;
          inPg.disabled = !on;
          inTB.disabled = !on;
          if (on) {
            if (!inBA.value && row.producaoBruta > 0) inBA.value = String(Math.round(row.producaoBruta * 100) / 100);
            if (!inAL.value && row.analise > 0) inAL.value = String(Math.round(row.analise * 100) / 100);
            if (!inPg.value && row.pago > 0) inPg.value = String(Math.round(row.pago * 100) / 100);
            if (!inTB.value && row.producaoBruta > 0) inTB.value = String(Math.round(row.producaoBruta * 100) / 100);
            if (!inPant.value && prodAnt > 0) inPant.value = String(Math.round(prodAnt * 100) / 100);
          }
        });

        tr.dataset.vendedoraId = v.id;
        tbody.appendChild(tr);
      });

      const team = snap.team;
      const mdTeamR = global.MaycredCalc.calcMetaDiaria(team.faltaTotal, diasRest, team.metaTotal, diasTot);
      const mdTeamP = global.MaycredCalc.calcMetaDiaria(
        team.faltaProducaoTotal,
        diasRest,
        team.metaProducaoTotalSoma,
        diasTot,
      );
      const tfoot = el('tfoot');
      const fr = el('tr', 'ui-producao-total-geral');
      fr.appendChild(el('td', 'ui-muted', ''));
      fr.appendChild(el('td', 'ui-producao-total-label', 'TOTAL GERAL'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(moneyCellRead('Σ Meta prod.', team.metaProducaoTotalSoma));
      fr.appendChild(moneyCellRead('Σ Meta rent.', team.metaTotal));
      fr.appendChild(moneyCellRead('Σ Meta averb.', team.metaAverbacaoSoma));
      fr.appendChild(moneyCellRead('Pr. análise', team.producaoBrutaAnaliseTotal));
      fr.appendChild(
        pctOrDash(
          '% com. análise',
          team.producaoBrutaAnaliseTotal > 0 ? (team.analiseTotal / team.producaoBrutaAnaliseTotal) * 100 : NaN,
        ),
      );
      fr.appendChild(moneyCellRead('Rent. análise', team.analiseTotal));
      fr.appendChild(moneyCellRead('Pr. averb.', team.producaoBrutaAverbadaTotal));
      fr.appendChild(
        pctOrDash(
          '% com. averb.',
          team.producaoBrutaAverbadaTotal > 0
            ? (team.rentabilidadeAverbadaTotal / team.producaoBrutaAverbadaTotal) * 100
            : NaN,
        ),
      );
      fr.appendChild(moneyCellRead('Rent. averb.', team.rentabilidadeAverbadaTotal));
      fr.appendChild(moneyCellRead('Tot. pr.', team.producaoTotal));
      fr.appendChild(moneyCellRead('Tot. rent.', team.totalTotal));
      fr.appendChild(
        pctOrDash('% com. total', team.producaoTotal > 0 ? (team.totalTotal / team.producaoTotal) * 100 : NaN),
      );
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(moneyCellRead('Rentab. total (R$)', team.totalTotal));
      fr.appendChild(moneyCellRead('Falta rent.', team.faltaTotal));
      fr.appendChild(moneyCellRead('Falta prod.', team.faltaProducaoTotal));
      fr.appendChild(moneyCellRead('/dia rent', mdTeamR.metaDiaria));
      fr.appendChild(moneyCellRead('/dia prod', mdTeamP.metaDiaria));
      fr.appendChild(pctOrDash('% meta rent', team.pctGeral));
      fr.appendChild(pctOrDash('% meta prod', team.pctProducaoGeral));
      fr.appendChild(pctOrDash('% meta averb', team.metaAverbacaoSoma > 0 ? team.pctAverbacaoGeral : NaN));
      tfoot.appendChild(fr);
      table.appendChild(tbody);
      table.appendChild(tfoot);
      tw.appendChild(table);

      function subLinhaRent(titulo, a) {
        const tr = el('tr');
        tr.appendChild(el('td', 'ui-mono', titulo));
        tr.appendChild(moneyCellRead('META rent.', a.metaRent));
        tr.appendChild(moneyCellRead('META prod.', a.metaVol));
        tr.appendChild(moneyCellRead('BRUTO', a.bruto));
        tr.appendChild(moneyCellRead('LÍQ. rent.', a.liquido));
        tr.appendChild(moneyCellRead('FALTA rent.', a.faltaRent));
        tr.appendChild(moneyCellRead('FALTA prod.', a.faltaProd));
        return tr;
      }

      const t2 = el('table', 'ui-table ui-table--producao-resumo-por-produto-inner');
      const th2 = el('thead');
      const hr2 = el('tr');
      ['', 'META rent.', 'META prod.', 'BRUTO', 'LÍQ. rent.', 'FALTA rent.', 'FALTA prod.'].forEach(function (h) {
        hr2.appendChild(el('th', null, h));
      });
      th2.appendChild(hr2);
      t2.appendChild(th2);
      const tb2 = el('tbody');
      tb2.appendChild(subLinhaRent('PORT', agg.PORT));
      tb2.appendChild(subLinhaRent('ENTRANTE', agg.ENTRANTE));
      const totAgg = {
        metaRent: agg.PORT.metaRent + agg.ENTRANTE.metaRent,
        metaVol: agg.PORT.metaVol + agg.ENTRANTE.metaVol,
        bruto: agg.PORT.bruto + agg.ENTRANTE.bruto,
        liquido: agg.PORT.liquido + agg.ENTRANTE.liquido,
        faltaRent: agg.PORT.faltaRent + agg.ENTRANTE.faltaRent,
        faltaProd: agg.PORT.faltaProd + agg.ENTRANTE.faltaProd,
      };
      const trT = subLinhaRent('TOTAL', totAgg);
      trT.className = 'ui-producao-total-geral';
      tb2.appendChild(trT);
      t2.appendChild(tb2);
      twResumo.appendChild(el('h3', 'ui-dash-subtitle', 'Resumo por produto (como na planilha)'));
      twResumo.appendChild(t2);

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
          const cbx = trEl.querySelector('input[type=checkbox]');
          const inputs = trEl.querySelectorAll('input[type=text]');
          const inPant = inputs[0];
          const inBA = inputs[1];
          const inAL = inputs[2];
          const inPg = inputs[3];
          const inTB = inputs[4];
          const ativo = !!(cbx && cbx.checked);
          map[vid] = {
            ativo,
            prodMesAnterior: ativo ? parseMoneyBR(inPant && inPant.value) : undefined,
            brutoAnalise: ativo ? parseMoneyBR(inBA && inBA.value) : undefined,
            analiseLiquido: ativo && inAL && String(inAL.value).trim() !== '' ? parseMoneyBR(inAL.value) : undefined,
            pago: ativo ? parseMoneyBR(inPg && inPg.value) : undefined,
            totalBruto: ativo ? parseMoneyBR(inTB && inTB.value) : undefined,
          };
        });
        global.MaycredData.setProducaoManualMes(mes2, map);
        toast('Planilha salva. O dashboard usa estes valores nas linhas marcadas como manual.', 'success');
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
        'Mês no topo. Meta produção: alvo em R$ de volume financiado (total no mês). Meta averbação: alvo só da parte averbada (opcional; 0 = não exibe % meta averbação isolada). Meta rentabilidade: alvo em R$ de comissão que a empresa recebe (propostas com tabela e %). O dashboard mostra % de rentabilidade e, se preenchida, % da meta de produção.',
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
      ['Vendedora', 'Meta produção total (R$)', 'Meta averbação (R$)', 'Meta rentabilidade (R$)'].forEach(function (h) {
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
        'Equipe, acessos, metas mensais e calendário de dias úteis. O mês ativo segue o seletor no cabeçalho.',
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
        'O mês é o selecionado no topo da tela. No calendário abaixo, clique em cada dia para marcar ou desmarcar como dia útil (verde = útil). Fins de semana podem ser marcados se precisar.',
      ),
    );
    const host = el('div', 'ui-cal-host');
    host.id = 'ui-cal-host-mes';
    wrap.appendChild(host);
    global.MaycredCalendar.renderCalendario(host, mes, function (dias) {
      global.MaycredData.setDiasUteisMes(mes, dias);
      paintResumo();
    });

    const resumo = el('div', 'ui-dias-resumo');
    function paintResumo() {
      const dias = global.MaycredCalendar.getDiasUteisDoMes(mes);
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
    paintResumo();
    wrap.appendChild(resumo);

    const btn = el('button', 'ui-btn ui-btn--secondary', 'Restaurar padrão');
    btn.type = 'button';
    btn.style.marginTop = '0.75rem';
    btn.addEventListener('click', function () {
      const p = mes.split('-');
      const y = parseInt(p[0], 10);
      const m = parseInt(p[1], 10);
      const pad = global.MaycredCalendar.gerarDiasUteisPadrao(y, m);
      global.MaycredData.setDiasUteisMes(mes, pad);
      global.MaycredCalendar.renderCalendario(host, mes, function (dias) {
        global.MaycredData.setDiasUteisMes(mes, dias);
        paintResumo();
      });
      toast('Calendário restaurado (seg–sex).', 'info');
    });
    wrap.appendChild(btn);
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
