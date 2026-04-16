/**
 * Gestora: cadastro de propostas INSS e manutenção (lista, status, produção) em telas separadas.
 */
(function (global) {
  const BANCOS_PARCEIROS = [
    'BMG',
    'Itaú',
    'Bradesco',
    'Caixa Econômica Federal',
    'Banco do Brasil',
    'Santander',
    'Pan',
    'Safra',
    'Mercantil',
    'C6',
    'Master',
    'Daycoval',
    'Paraná Banco',
    'Outros',
  ];

  const UFS_BR = [
    '',
    'AC',
    'AL',
    'AP',
    'AM',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MT',
    'MS',
    'MG',
    'PA',
    'PB',
    'PR',
    'PE',
    'PI',
    'RJ',
    'RN',
    'RS',
    'RO',
    'RR',
    'SC',
    'SP',
    'SE',
    'TO',
  ];

  const ESPECIES_BENEFICIO = [
    { v: 'APOS_IDADE', t: 'Aposentadoria por Idade' },
    { v: 'APOS_INVAL', t: 'Aposentadoria por Invalidez' },
    { v: 'PENSAO_MORTE', t: 'Pensão por Morte' },
    { v: 'APOS_TEMPO', t: 'Aposentadoria por Tempo de Contribuição' },
    { v: 'BPC', t: 'Benefício de Prestação Continuada (BPC)' },
  ];

  const ORIGENS_VENDA = [
    { v: '', t: '—' },
    { v: 'ATIVO', t: 'ATIVO' },
    { v: 'RECEPTIVO', t: 'RECEPTIVO' },
    { v: 'INDICACAO', t: 'INDICAÇÃO' },
    { v: 'TELEMARKETING', t: 'TELEMARKETING' },
  ];

  /** @type {string[]} */
  let ALL_STATUS_FILTRO = [];

  /** Operação a abrir em edição na tela Cadastro (definida a partir da Manutenção). */
  let propostaEdicaoPendenteId = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(c) {
    while (c.firstChild) c.removeChild(c.firstChild);
  }

  function formatBRL(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return '—';
    const num = x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return 'R$\u00a0' + num;
  }

  function onlyDigits(s) {
    return String(s || '').replace(/\D/g, '');
  }

  function formatCpfInput(s) {
    const d = onlyDigits(s).slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 6) return d.slice(0, 3) + '.' + d.slice(3);
    if (d.length <= 9) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6);
    return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
  }

  function maskCpfTabela(cpfDigits) {
    const x = onlyDigits(cpfDigits);
    if (x.length < 11) return x || '—';
    return x.slice(0, 3) + '.' + x.slice(3, 6) + '.***-**';
  }

  function formatPct(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return '—';
    return x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '% a.m.';
  }

  function toast(msg, type) {
    if (global.MaycredUI && MaycredUI.toast) MaycredUI.toast(msg, type);
  }

  function confirmExcluir(title, body, onOk) {
    if (global.MaycredUI && MaycredUI.confirmModal) MaycredUI.confirmModal(title, body, onOk);
  }

  function confirmGenerico(title, body, okText, danger, onOk) {
    const overlay = document.createElement('div');
    overlay.className = 'ui-modal-overlay';
    overlay.innerHTML =
      '<div class="ui-modal" role="dialog">' +
      '<h3 class="ui-modal__title"></h3>' +
      '<p class="ui-modal__body"></p>' +
      '<div class="ui-modal__actions">' +
      '<button type="button" class="ui-btn ui-btn--secondary" data-act="cancel">Cancelar</button>' +
      '<button type="button" class="ui-btn" data-act="ok"></button>' +
      '</div></div>';
    overlay.querySelector('.ui-modal__title').textContent = title;
    overlay.querySelector('.ui-modal__body').textContent = body;
    const okBtn = overlay.querySelector('[data-act="ok"]');
    okBtn.textContent = okText || 'OK';
    okBtn.className = 'ui-btn ' + (danger ? 'ui-btn--danger' : 'ui-btn--primary');
    function close() {
      overlay.remove();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);
    okBtn.addEventListener('click', function () {
      close();
      if (typeof onOk === 'function') onOk();
    });
    document.body.appendChild(overlay);
  }

  function filtrarPropostas(ops, f) {
    const q = (f.q || '').trim().toLowerCase();
    const qDig = onlyDigits(f.q);
    const dDe = f.dataDe ? String(f.dataDe).slice(0, 10) : '';
    const dAte = f.dataAte ? String(f.dataAte).slice(0, 10) : '';
    let desde = dDe;
    let ate = dAte;
    if (desde && ate && desde > ate) {
      const t = desde;
      desde = ate;
      ate = t;
    }
    return ops.filter(function (o) {
      if (f.vend && o.vendedoraId !== f.vend) return false;
      if (f.tipo && o.tipoOperacao !== f.tipo) return false;
      if (f.status && o.status !== f.status) return false;
      if (f.banco && String(o.bancoParceiro || '') !== f.banco) return false;
      const od = o.data ? String(o.data).slice(0, 10) : '';
      if (desde) {
        if (!od || od < desde) return false;
      }
      if (ate) {
        if (!od || od > ate) return false;
      }
      if (q) {
        const nome = String(o.clienteNome || '').toLowerCase();
        const cpf = onlyDigits(o.clienteCpf || '');
        if (!nome.includes(q) && !(qDig.length >= 3 && cpf.includes(qDig))) return false;
      }
      return true;
    });
  }

  function propostaDuplicadaMesmoBanco(st, op, excludeId) {
    const cpf = onlyDigits(op.clienteCpf || '');
    if (cpf.length !== 11) return false;
    const mesRef = op.data && String(op.data).length >= 7 ? String(op.data).slice(0, 7) : '';
    if (!mesRef) return false;
    const banco = String(op.bancoParceiro || 'Outros');
    return st.operacoes.some(function (x) {
      if (x.id === excludeId) return false;
      if (!x.data || String(x.data).slice(0, 7) !== mesRef) return false;
      if (String(x.bancoParceiro || 'Outros') !== banco) return false;
      return onlyDigits(x.clienteCpf || '') === cpf;
    });
  }

  function csvEscapeCell(val) {
    const t = String(val == null ? '' : val);
    if (/[;"\r\n]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
    return t;
  }

  function brDecimalCsv(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return '';
    return (Math.round(x * 100) / 100).toFixed(2).replace('.', ',');
  }

  /**
   * CSV (UTF-8 com BOM, separador ;) para abrir no Excel — mesmo recorte dos filtros da manutenção.
   * @param {object[]} lista
   * @param {object} st
   * @param {typeof global.MaycredOperacoes} MO
   * @param {object} fil
   */
  function buildManutencaoPropostasCsv(lista, st, MO, fil) {
    const sep = ';';
    const lines = [];
    lines.push(
      [
        'exportado_em',
        new Date().toISOString().slice(0, 19).replace('T', ' '),
        'mes_ativo_app',
        st.config.mesAtual || '',
      ]
        .map(csvEscapeCell)
        .join(sep),
    );
    lines.push(
      [
        'filtro_vendedora_id',
        fil.vend || '(todas)',
        'filtro_tipo',
        fil.tipo || '(todos)',
        'filtro_status',
        fil.status || '(todos)',
        'filtro_banco',
        fil.banco || '(todos)',
        'filtro_data_de',
        fil.dataDe || '(sem)',
        'filtro_data_ate',
        fil.dataAte || '(sem)',
        'busca',
        fil.q || '',
      ]
        .map(csvEscapeCell)
        .join(sep),
    );
    lines.push('');
    const head = [
      'data',
      'vendedora',
      'cliente',
      'cpf',
      'beneficio_inss',
      'especie_beneficio',
      'tipo_operacao',
      'banco',
      'promotora',
      'valor_financiado',
      'prazo_parcelas',
      'valor_parcela',
      'rentabilidade_rs',
      'conta_meta_rentabilidade',
      'status',
      'impacto_meta',
      'numero_proposta',
      'numero_contrato',
      'convenio',
      'data_averbacao',
      'data_pagamento',
      'origem_venda',
      'observacao',
    ];
    lines.push(head.map(csvEscapeCell).join(sep));
    lista.forEach(function (op) {
      const vend = st.vendedoras.find(function (x) {
        return x.id === op.vendedoraId;
      });
      const comm = MO.comissaoEstimadaParaOperacao
        ? MO.comissaoEstimadaParaOperacao(op.valorContrato, st.config, op)
        : 0;
      const esp = ESPECIES_BENEFICIO.find(function (e) {
        return e.v === op.especieBeneficio;
      });
      let bancoTxt = op.bancoParceiro || '';
      if (op.tipoOperacao === 'PORT' || op.tipoOperacao === 'PORT_REFIN') {
        bancoTxt = (op.bancoOrigem || '') + ' → ' + (op.bancoParceiro || '');
      }
      const pr = op.prazoParcelas || 0;
      const vp = op.valorParcela;
      const orig = ORIGENS_VENDA.find(function (o) {
        return o.v === op.origemVenda;
      });
      lines.push(
        [
          op.data || '',
          vend ? vend.nome : op.vendedoraId,
          op.clienteNome || '',
          onlyDigits(op.clienteCpf || ''),
          op.beneficioInss || '',
          esp ? esp.t : op.especieBeneficio || '',
          MO.TIPO_LABEL[op.tipoOperacao] || op.tipoOperacao,
          bancoTxt,
          op.promotoraNome || '',
          brDecimalCsv(op.valorContrato),
          pr ? String(pr) : '',
          vp != null && !Number.isNaN(Number(vp)) ? brDecimalCsv(vp) : '',
          brDecimalCsv(comm),
          MO.propostaContaRentabilidadeMeta && MO.propostaContaRentabilidadeMeta(op) ? 'sim' : 'nao',
          MO.labelStatus(op.tipoOperacao, op.status),
          MO.labelMetaImpacto(op.tipoOperacao, op.status),
          op.numeroProposta || '',
          op.numeroContrato || '',
          op.convenio || '',
          op.dataAverbacao || '',
          op.dataPagamento || '',
          orig ? orig.t : op.origemVenda || '',
          op.obs || '',
        ]
          .map(csvEscapeCell)
          .join(sep),
      );
    });
    return lines.join('\r\n');
  }

  function downloadCsvParaExcel(filename, csvBody) {
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvBody], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function initStatusFiltro() {
    if (ALL_STATUS_FILTRO.length) return;
    const MO = global.MaycredOperacoes;
    const a = [];
    function pushUnique(s) {
      if (a.indexOf(s) < 0) a.push(s);
    }
    MO.statusValidos(MO.FLUXO_A).forEach(pushUnique);
    MO.statusValidos(MO.FLUXO_B).forEach(pushUnique);
    ALL_STATUS_FILTRO = a;
  }

  /**
   * @param {HTMLElement} container
   * @param {boolean} showCadastro
   * @param {boolean} showManutencao
   */
  function renderPropostasView(container, showCadastro, showManutencao) {
    const MO = global.MaycredOperacoes;
    const Cal = global.MaycredCalendar;
    initStatusFiltro();

    clear(container);
    let editingOpId = null;
    let avisoDuplicata = '';
    const stFilInit = global.MaycredData.getState();
    const ym0 = String(stFilInit.config.mesAtual || '').slice(0, 7);
    let iniDe = '';
    let iniAte = '';
    if (ym0.length === 7) {
      iniDe = ym0 + '-01';
      const yi = parseInt(ym0.slice(0, 4), 10);
      const moi = parseInt(ym0.slice(5, 7), 10);
      const ult = new Date(yi, moi, 0).getDate();
      iniAte = ym0 + '-' + String(ult).padStart(2, '0');
    }
    const fil = { vend: '', tipo: '', status: '', banco: '', dataDe: iniDe, dataAte: iniAte, q: '' };
    let toastAposCarregarEdicao = false;
    if (showCadastro && propostaEdicaoPendenteId) {
      editingOpId = propostaEdicaoPendenteId;
      propostaEdicaoPendenteId = null;
      toastAposCarregarEdicao = true;
    }

    const page = el('div', 'ui-section ui-lancamentos-page');
    page.appendChild(
      el('h2', 'ui-section__title', showCadastro ? 'Cadastro de propostas' : 'Manutenção de propostas'),
    );
    if (showCadastro) {
      page.appendChild(
        el(
          'p',
          'ui-muted',
          'Inclusão e alteração de propostas INSS. O mês segue a data da operação. Para contar na meta de rentabilidade, vincule uma tabela da lista (valor financiado × % da tabela). Sem tabela, o convênio pode ser manual, mas a proposta não entra no cálculo da meta.',
        ),
      );
    }
    if (showManutencao) {
      page.appendChild(
        el(
          'p',
          'ui-muted',
          'Controle e atualização da produção: contagem por status, filtros, avanço de etapa, cancelamento e exclusão. Editar abre o cadastro com a proposta carregada.',
        ),
      );
    }

    /** @type {HTMLElement|null} */
    let formAnchor = null;
    /** @type {HTMLElement|null} */
    let formHost = null;
    /** @type {HTMLElement|null} */
    let statusMonitorHost = null;
    /** @type {HTMLElement|null} */
    let filtersHost = null;
    /** @type {HTMLElement|null} */
    let tableWrap = null;
    /** @type {HTMLElement|null} */
    let periodHost = null;

    if (showCadastro) {
      const registerPanel = el('section', 'ui-lanc-panel ui-lanc-panel--register');
      registerPanel.appendChild(el('h3', 'ui-lanc-panel__title', 'Dados da proposta'));
      registerPanel.appendChild(
        el(
          'p',
          'ui-muted ui-lanc-panel__lead',
          'Preencha e use Registrar proposta ou Salvar após edição. Use Nova proposta para limpar o formulário.',
        ),
      );
      formAnchor = el('div', 'ui-lanc-form-anchor');
      formHost = el('div', 'ui-lanc-form-host');
      formAnchor.appendChild(formHost);
      registerPanel.appendChild(formAnchor);
      page.appendChild(registerPanel);
    }

    if (showManutencao) {
      const monitorPanel = el('section', 'ui-lanc-panel ui-lanc-panel--monitor');
      periodHost = el('div', 'ui-lanc-periodo-bar');
      monitorPanel.appendChild(periodHost);
      monitorPanel.appendChild(el('h3', 'ui-lanc-panel__title', 'Painel de manutenção'));
      monitorPanel.appendChild(
        el(
          'p',
          'ui-muted ui-lanc-panel__lead',
          'Monitore quantas propostas estão em cada status (respeita período por data da operação, vendedora, tipo, banco e busca). A tabela reflete o filtro atual.',
        ),
      );
      statusMonitorHost = el('div', 'ui-lanc-status-monitor');
      monitorPanel.appendChild(statusMonitorHost);
      filtersHost = el('div', 'ui-lanc-filters');
      monitorPanel.appendChild(filtersHost);
      tableWrap = el('div', 'ui-table-wrap ui-lanc-table-wrap');
      monitorPanel.appendChild(tableWrap);
      page.appendChild(monitorPanel);
    }

    container.appendChild(page);

    function paint() {
      const st = global.MaycredData.getState();
      if (showCadastro && formHost) {
        clear(formHost);
      }
      if (showManutencao && periodHost && statusMonitorHost && filtersHost && tableWrap) {
        clear(periodHost);
        clear(statusMonitorHost);
        clear(filtersHost);
        clear(tableWrap);
      }

      const opEdit = showCadastro && editingOpId
        ? st.operacoes.find(function (o) {
            return o.id === editingOpId;
          })
        : null;

      if (showCadastro && formHost) {
        if (avisoDuplicata) {
          const warn = el('div', 'ui-lanc-dup-alert');
          warn.textContent = avisoDuplicata;
          const btnX = el('button', 'ui-lanc-dup-alert__dismiss', 'Fechar');
          btnX.type = 'button';
          btnX.addEventListener('click', function () {
            avisoDuplicata = '';
            paint();
          });
          warn.appendChild(btnX);
          formHost.appendChild(warn);
        }

        const form = el('form', 'ui-lanc-proposta-form');

      function sec(title) {
        const b = el('div', 'ui-config-block ui-lanc-sec');
        b.appendChild(el('h3', 'ui-config-block__title', title));
        return b;
      }

      function fieldGrid(parent) {
        const g = el('div', 'ui-form-grid ui-form-grid--2');
        parent.appendChild(g);
        return g;
      }

      /* —— Seção 1 —— */
      const s1 = sec('Dados da operação');
      const g1 = fieldGrid(s1);

      const fV = el('div', 'ui-field');
      fV.appendChild(el('span', 'ui-field__label', 'Vendedora *'));
      const selV = el('select', 'ui-select');
      selV.required = true;
      st.vendedoras.forEach(function (vv) {
        const o = el('option', null, vv.nome);
        o.value = vv.id;
        selV.appendChild(o);
      });
      if (opEdit) selV.value = opEdit.vendedoraId;
      fV.appendChild(selV);
      g1.appendChild(fV);

      const fData = el('div', 'ui-field');
      fData.appendChild(el('span', 'ui-field__label', 'Data da operação *'));
      const inpData = el('input', 'ui-input');
      inpData.type = 'date';
      inpData.required = true;
      inpData.value = opEdit ? opEdit.data : Cal.hojeLocal();
      fData.appendChild(inpData);
      g1.appendChild(fData);

      const fTipo = el('div', 'ui-field');
      fTipo.appendChild(el('span', 'ui-field__label', 'Tipo de operação *'));
      const selTipo = el('select', 'ui-select');
      selTipo.required = true;
      MO.TIPOS.forEach(function (t) {
        const o = el('option', null, MO.TIPO_LABEL[t] + ' — ' + MO.TIPO_DESCRICAO[t]);
        o.value = t;
        selTipo.appendChild(o);
      });
      if (opEdit) selTipo.value = opEdit.tipoOperacao;
      fTipo.appendChild(selTipo);
      g1.appendChild(fTipo);

      const fBanco = el('div', 'ui-field');
      fBanco.appendChild(el('span', 'ui-field__label', 'Banco parceiro *'));
      const selBanco = el('select', 'ui-select');
      selBanco.required = true;
      (function fillBancos() {
        const seen = {};
        (st.bancos || []).forEach(function (b) {
          if (b.ativo === false) return;
          seen[b.nome] = true;
          const ob = el('option', null, b.nome);
          ob.value = b.nome;
          selBanco.appendChild(ob);
        });
        if (!seen['Outros']) {
          const ob = el('option', null, 'Outros');
          ob.value = 'Outros';
          selBanco.appendChild(ob);
        }
        if (!selBanco.options.length) {
          BANCOS_PARCEIROS.forEach(function (nome) {
            const ob = el('option', null, nome);
            ob.value = nome;
            selBanco.appendChild(ob);
          });
        }
      })();
      if (opEdit && opEdit.bancoParceiro) selBanco.value = opEdit.bancoParceiro;
      fBanco.appendChild(selBanco);
      g1.appendChild(fBanco);

      const fProm = el('div', 'ui-field');
      fProm.appendChild(el('span', 'ui-field__label', 'Promotora *'));
      const selProm = el('select', 'ui-select');
      selProm.required = true;
      (st.promotoras || []).forEach(function (p) {
        if (p.ativo === false) return;
        const op = el('option', null, p.nome);
        op.value = p.id;
        selProm.appendChild(op);
      });
      if (opEdit && opEdit.promotoraId) {
        const has = Array.prototype.some.call(selProm.options, function (o) {
          return o.value === opEdit.promotoraId;
        });
        if (has) selProm.value = opEdit.promotoraId;
        else if (selProm.options.length > 0) selProm.selectedIndex = 0;
      } else if (selProm.options.length > 0) {
        selProm.selectedIndex = 0;
      }
      fProm.appendChild(selProm);
      g1.appendChild(fProm);

      const fTabCad = el('div', 'ui-field');
      fTabCad.style.gridColumn = '1 / -1';
      fTabCad.appendChild(
        el(
          'span',
          'ui-field__label',
          'Tabela da lista (obrigatória para contar na meta de rentabilidade)',
        ),
      );
      const selTabCad = el('select', 'ui-select');
      const optTab0 = el(
        'option',
        null,
        '— Sem tabela: convênio manual, não entra na meta —',
      );
      optTab0.value = '';
      selTabCad.appendChild(optTab0);
      function refillTabCadOptions() {
        while (selTabCad.children.length > 1) selTabCad.removeChild(selTabCad.lastChild);
        const nomeBanco = selBanco.value;
        const tipoOp = selTipo.value;
        const promId = selProm.value;
        (st.tabelas || []).forEach(function (t) {
          if (t.ativo === false) return;
          if (t.tipo !== tipoOp) return;
          if (promId && String(t.promotoraId || '') !== String(promId)) return;
          const b = (st.bancos || []).find(function (x) {
            return x.id === t.bancoId;
          });
          if (!b || b.nome !== nomeBanco) return;
          const pct = (Math.round(t.comissao * 10000) / 100).toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          const conv = t.convenio || global.MaycredData.formatConvenioTabela(t.nome, t.prazo);
          const o = el('option', null, conv + ' · ' + pct + '%');
          o.value = t.id;
          selTabCad.appendChild(o);
        });
        if (opEdit && opEdit.tabelaId) {
          const exists = Array.prototype.some.call(selTabCad.options, function (o) {
            return o.value === opEdit.tabelaId;
          });
          if (exists) selTabCad.value = opEdit.tabelaId;
          else selTabCad.value = '';
        }
      }
      refillTabCadOptions();
      fTabCad.appendChild(selTabCad);
      g1.appendChild(fTabCad);
      const tblMetaBanner = el(
        'div',
        'ui-lanc-meta-tabela-banner',
        'Tabela não definida — esta proposta não está contando para a meta.',
      );
      tblMetaBanner.style.display = 'none';
      tblMetaBanner.style.gridColumn = '1 / -1';
      g1.appendChild(tblMetaBanner);

      const fConv = el('div', 'ui-field');
      fConv.style.gridColumn = '1 / -1';
      fConv.appendChild(el('span', 'ui-field__label', 'Tabela / convênio *'));
      const inpConv = el('input', 'ui-input');
      inpConv.type = 'text';
      inpConv.required = true;
      inpConv.placeholder = 'Preenchido ao escolher tabela: Nome - Prazox (ex.: BMG — NOVO - 84x)';
      inpConv.value = opEdit ? opEdit.convenio || '' : '';
      fConv.appendChild(inpConv);
      g1.appendChild(fConv);

      const fNp = el('div', 'ui-field');
      fNp.appendChild(el('span', 'ui-field__label', 'Nº da proposta'));
      const inpNp = el('input', 'ui-input');
      inpNp.type = 'text';
      inpNp.value = opEdit ? opEdit.numeroProposta || '' : '';
      fNp.appendChild(inpNp);
      g1.appendChild(fNp);

      const fNc = el('div', 'ui-field');
      fNc.appendChild(el('span', 'ui-field__label', 'Nº do contrato'));
      const inpNc = el('input', 'ui-input');
      inpNc.type = 'text';
      inpNc.value = opEdit ? opEdit.numeroContrato || '' : '';
      fNc.appendChild(inpNc);
      g1.appendChild(fNc);

      const fOrig = el('div', 'ui-field');
      fOrig.appendChild(el('span', 'ui-field__label', 'Origem da venda'));
      const selOrig = el('select', 'ui-select');
      ORIGENS_VENDA.forEach(function (O) {
        const o = el('option', null, O.t);
        o.value = O.v;
        selOrig.appendChild(o);
      });
      if (opEdit && opEdit.origemVenda) selOrig.value = opEdit.origemVenda;
      fOrig.appendChild(selOrig);
      g1.appendChild(fOrig);

      form.appendChild(s1);

      /* —— Seção 2 —— */
      const s2 = sec('Dados do cliente');
      const g2 = fieldGrid(s2);

      const fNome = el('div', 'ui-field');
      fNome.style.gridColumn = '1 / -1';
      fNome.appendChild(el('span', 'ui-field__label', 'Nome do cliente *'));
      const inpNome = el('input', 'ui-input');
      inpNome.type = 'text';
      inpNome.required = true;
      inpNome.value = opEdit ? opEdit.clienteNome || '' : '';
      fNome.appendChild(inpNome);
      g2.appendChild(fNome);

      const fCpf = el('div', 'ui-field');
      fCpf.appendChild(el('span', 'ui-field__label', 'CPF *'));
      const inpCpf = el('input', 'ui-input');
      inpCpf.type = 'text';
      inpCpf.required = true;
      inpCpf.placeholder = '000.000.000-00';
      inpCpf.value = opEdit ? formatCpfInput(opEdit.clienteCpf || '') : '';
      inpCpf.addEventListener('input', function () {
        const c = inpCpf.selectionStart;
        const raw = onlyDigits(inpCpf.value);
        inpCpf.value = formatCpfInput(raw);
        try {
          inpCpf.setSelectionRange(inpCpf.value.length, inpCpf.value.length);
        } catch (_) {}
      });
      fCpf.appendChild(inpCpf);
      g2.appendChild(fCpf);

      const fBen = el('div', 'ui-field');
      fBen.appendChild(el('span', 'ui-field__label', 'Nº do benefício INSS *'));
      const inpBen = el('input', 'ui-input');
      inpBen.type = 'text';
      inpBen.required = true;
      inpBen.value = opEdit ? opEdit.beneficioInss || '' : '';
      fBen.appendChild(inpBen);
      g2.appendChild(fBen);

      const fEsp = el('div', 'ui-field');
      fEsp.appendChild(el('span', 'ui-field__label', 'Espécie do benefício *'));
      const selEsp = el('select', 'ui-select');
      selEsp.required = true;
      ESPECIES_BENEFICIO.forEach(function (E) {
        const o = el('option', null, E.t);
        o.value = E.v;
        selEsp.appendChild(o);
      });
      if (opEdit && opEdit.especieBeneficio) selEsp.value = opEdit.especieBeneficio;
      fEsp.appendChild(selEsp);
      g2.appendChild(fEsp);

      const fUf = el('div', 'ui-field');
      fUf.appendChild(el('span', 'ui-field__label', 'UF do benefício'));
      const selUf = el('select', 'ui-select');
      UFS_BR.forEach(function (uf) {
        const o = el('option', null, uf || '—');
        o.value = uf;
        selUf.appendChild(o);
      });
      if (opEdit && opEdit.ufBeneficio) selUf.value = opEdit.ufBeneficio;
      fUf.appendChild(selUf);
      g2.appendChild(fUf);

      const fSal = el('div', 'ui-field');
      fSal.appendChild(el('span', 'ui-field__label', 'Salário / benefício bruto (R$)'));
      const inpSal = el('input', 'ui-input');
      inpSal.type = 'number';
      inpSal.step = '0.01';
      inpSal.value =
        opEdit && opEdit.salarioBeneficioBruto != null && !Number.isNaN(Number(opEdit.salarioBeneficioBruto))
          ? String(opEdit.salarioBeneficioBruto)
          : '';
      fSal.appendChild(inpSal);
      g2.appendChild(fSal);

      const fMar = el('div', 'ui-field');
      fMar.appendChild(el('span', 'ui-field__label', 'Margem disponível (R$)'));
      const inpMar = el('input', 'ui-input');
      inpMar.type = 'number';
      inpMar.step = '0.01';
      inpMar.value =
        opEdit && opEdit.margemDisponivel != null && !Number.isNaN(Number(opEdit.margemDisponivel))
          ? String(opEdit.margemDisponivel)
          : '';
      fMar.appendChild(inpMar);
      g2.appendChild(fMar);

      form.appendChild(s2);

      /* —— Seção 3 —— */
      const s3 = sec('Dados financeiros');
      const g3 = fieldGrid(s3);

      const fVal = el('div', 'ui-field');
      fVal.appendChild(el('span', 'ui-field__label', 'Valor financiado (R$) *'));
      const inpVal = el('input', 'ui-input');
      inpVal.type = 'number';
      inpVal.step = '0.01';
      inpVal.required = true;
      inpVal.value = opEdit ? String(opEdit.valorContrato) : '';
      fVal.appendChild(inpVal);
      g3.appendChild(fVal);

      const fPrazo = el('div', 'ui-field');
      fPrazo.appendChild(el('span', 'ui-field__label', 'Prazo (parcelas) *'));
      const inpPrazo = el('input', 'ui-input');
      inpPrazo.type = 'number';
      inpPrazo.min = '1';
      inpPrazo.step = '1';
      inpPrazo.required = true;
      inpPrazo.placeholder = 'Ex.: 84';
      inpPrazo.value = opEdit && opEdit.prazoParcelas ? String(opEdit.prazoParcelas) : '';
      fPrazo.appendChild(inpPrazo);
      g3.appendChild(fPrazo);

      const fTaxa = el('div', 'ui-field');
      fTaxa.appendChild(el('span', 'ui-field__label', 'Taxa de juros (% a.m.) *'));
      const inpTaxa = el('input', 'ui-input');
      inpTaxa.type = 'number';
      inpTaxa.step = '0.01';
      inpTaxa.required = true;
      inpTaxa.placeholder = 'Ex.: 1,80';
      inpTaxa.value =
        opEdit && (opEdit.taxaJurosMes != null || opEdit.taxaJurosMes === 0)
          ? String(opEdit.taxaJurosMes)
          : '';
      fTaxa.appendChild(inpTaxa);
      g3.appendChild(fTaxa);

      const fVp = el('div', 'ui-field');
      fVp.appendChild(el('span', 'ui-field__label', 'Valor da parcela (R$)'));
      const inpVp = el('input', 'ui-input');
      inpVp.type = 'number';
      inpVp.step = '0.01';
      inpVp.readOnly = true;
      inpVp.className = 'ui-input ui-input--readonly';
      fVp.appendChild(inpVp);
      g3.appendChild(fVp);

      const fVl = el('div', 'ui-field');
      fVl.appendChild(el('span', 'ui-field__label', 'Valor liberado ao cliente (R$)'));
      const inpVl = el('input', 'ui-input');
      inpVl.type = 'number';
      inpVl.step = '0.01';
      inpVl.value =
        opEdit && opEdit.valorLiberadoCliente != null && !Number.isNaN(Number(opEdit.valorLiberadoCliente))
          ? String(opEdit.valorLiberadoCliente)
          : '';
      fVl.appendChild(inpVl);
      g3.appendChild(fVl);

      const fPort = el('div', 'ui-field ui-lanc-port-extra');
      fPort.style.gridColumn = '1 / -1';
      fPort.appendChild(el('span', 'ui-field__label', 'Dados PORT / PORT+REFIN'));
      const gPort = el('div', 'ui-form-grid ui-form-grid--2');
      const selBo = el('select', 'ui-select');
      BANCOS_PARCEIROS.forEach(function (nome) {
        const obo = el('option', null, nome);
        obo.value = nome;
        selBo.appendChild(obo);
      });
      const inpSd = el('input', 'ui-input');
      inpSd.type = 'number';
      inpSd.step = '0.01';
      inpSd.placeholder = 'Saldo devedor portado (R$) *';
      gPort.appendChild(selBo);
      gPort.appendChild(inpSd);
      fPort.appendChild(gPort);
      g3.appendChild(fPort);

      const fRefin = el('div', 'ui-field ui-lanc-refin-extra');
      fRefin.style.gridColumn = '1 / -1';
      fRefin.appendChild(el('span', 'ui-field__label', 'Valor do refinanciamento (R$) *'));
      const inpRefin = el('input', 'ui-input');
      inpRefin.type = 'number';
      inpRefin.step = '0.01';
      fRefin.appendChild(inpRefin);
      g3.appendChild(fRefin);

      if (opEdit) {
        if (opEdit.bancoOrigem) selBo.value = opEdit.bancoOrigem;
        inpSd.value =
          opEdit.saldoDevedorPortado != null && !Number.isNaN(Number(opEdit.saldoDevedorPortado))
            ? String(opEdit.saldoDevedorPortado)
            : '';
        inpRefin.value =
          opEdit.valorRefinanciamento != null && !Number.isNaN(Number(opEdit.valorRefinanciamento))
            ? String(opEdit.valorRefinanciamento)
            : '';
      }

      const boxAnalise = el('div', 'ui-lanc-analise-live');
      s3.appendChild(boxAnalise);
      form.appendChild(s3);

      function syncPortVisibility() {
        const t = selTipo.value;
        const port = t === 'PORT' || t === 'PORT_REFIN';
        fPort.style.display = port ? '' : 'none';
        fRefin.style.display = t === 'PORT_REFIN' ? '' : 'none';
        selBo.required = port;
        inpSd.required = port;
        inpRefin.required = t === 'PORT_REFIN';
      }

      function updateParcelaEAnalise() {
        const vf = parseFloat(inpVal.value);
        const pr = parseInt(inpPrazo.value, 10);
        if (!Number.isNaN(vf) && vf > 0 && !Number.isNaN(pr) && pr > 0) {
          inpVp.value = String(Math.round((vf / pr) * 100) / 100);
        } else {
          inpVp.value = '';
        }
        const tipo = selTipo.value;
        const cfg = st.config;
        const opLike = { tipoOperacao: tipo, tabelaId: '', comissaoTabela: undefined };
        if (selTabCad.value) {
          opLike.tabelaId = selTabCad.value;
          const tab = (st.tabelas || []).find(function (x) {
            return x.id === selTabCad.value;
          });
          if (tab && tab.comissao != null && !Number.isNaN(Number(tab.comissao))) {
            opLike.comissaoTabela = Number(tab.comissao);
          }
        } else if (opEdit && String(opEdit.tabelaId || '').trim()) {
          opLike.tabelaId = String(opEdit.tabelaId);
          if (opEdit.comissaoTabela != null && !Number.isNaN(Number(opEdit.comissaoTabela))) {
            opLike.comissaoTabela = Number(opEdit.comissaoTabela);
          }
        }
        const okMeta = MO.propostaContaRentabilidadeMeta
          ? MO.propostaContaRentabilidadeMeta(opLike)
          : false;
        tblMetaBanner.style.display = okMeta ? 'none' : '';
        const comm =
          !Number.isNaN(vf) && vf >= 0 && MO.comissaoEstimadaParaOperacao
            ? MO.comissaoEstimadaParaOperacao(vf, cfg, opLike)
            : 0;
        const fluxo = MO.fluxoDoTipo(tipo);
        const selSt = selStatus ? selStatus.value : MO.statusPadraoParaTipo(tipo);
        const imp = MO.impactoMetaPorStatus(fluxo, selSt);
        const entra = imp.analise ? 'ANÁLISE' : imp.pago ? 'PAGO' : '—';
        clear(boxAnalise);
        if (okMeta) {
          boxAnalise.appendChild(
            el(
              'div',
              'ui-lanc-analise-live__line',
              'Rentabilidade (valor financiado × % tabela): ' + formatBRL(comm),
            ),
          );
          boxAnalise.appendChild(
            el(
              'div',
              'ui-lanc-analise-live__sub',
              'Entra na meta como: ' + entra + ' (conforme o status)',
            ),
          );
        } else {
          boxAnalise.appendChild(
            el(
              'div',
              'ui-lanc-analise-live__line ui-lanc-analise-live__line--warn',
              'Tabela não definida — rentabilidade R$ 0,00; não conta para a meta.',
            ),
          );
          boxAnalise.appendChild(
            el(
              'div',
              'ui-lanc-analise-live__sub',
              'Escolha uma linha em Parceiros e tabelas compatível com banco, promotora e tipo.',
            ),
          );
        }
      }

      /* status ref forward */
      let selStatus = null;

      const fStat = el('div', 'ui-field');
      fStat.appendChild(el('span', 'ui-field__label', 'Status *'));
      selStatus = el('select', 'ui-select');
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
        else selStatus.value = MO.statusPadraoParaTipo(tipo);
      }
      refillStatus();
      fStat.appendChild(selStatus);

      selTipo.addEventListener('change', function () {
        if (!editingOpId) refillStatus();
        syncPortVisibility();
        refillTabCadOptions();
        updateParcelaEAnalise();
      });
      selStatus.addEventListener('change', updateParcelaEAnalise);
      inpVal.addEventListener('input', updateParcelaEAnalise);
      inpPrazo.addEventListener('input', updateParcelaEAnalise);
      inpTaxa.addEventListener('input', updateParcelaEAnalise);
      selTabCad.addEventListener('change', function () {
        const id = selTabCad.value;
        if (!id) {
          updateParcelaEAnalise();
          return;
        }
        const t = (st.tabelas || []).find(function (x) {
          return x.id === id;
        });
        if (t) {
          inpConv.value = t.convenio || global.MaycredData.formatConvenioTabela(t.nome, t.prazo);
          inpPrazo.value = String(t.prazo);
          inpTaxa.value = String(t.taxa);
        }
        updateParcelaEAnalise();
      });
      selBanco.addEventListener('change', function () {
        refillTabCadOptions();
        updateParcelaEAnalise();
      });
      selProm.addEventListener('change', function () {
        refillTabCadOptions();
        updateParcelaEAnalise();
      });

      syncPortVisibility();
      updateParcelaEAnalise();

      /* —— Seção 4 —— */
      const s4 = sec('Controle e status');
      const g4 = fieldGrid(s4);
      g4.appendChild(fStat);

      const fAver = el('div', 'ui-field');
      fAver.appendChild(el('span', 'ui-field__label', 'Data de averbação'));
      const inpAver = el('input', 'ui-input');
      inpAver.type = 'date';
      inpAver.value = opEdit ? opEdit.dataAverbacao || '' : '';
      fAver.appendChild(inpAver);
      g4.appendChild(fAver);

      const fPag = el('div', 'ui-field');
      fPag.appendChild(el('span', 'ui-field__label', 'Data de pagamento'));
      const inpPag = el('input', 'ui-input');
      inpPag.type = 'date';
      inpPag.value = opEdit ? opEdit.dataPagamento || '' : '';
      fPag.appendChild(inpPag);
      g4.appendChild(fPag);

      const fObs = el('div', 'ui-field');
      fObs.style.gridColumn = '1 / -1';
      fObs.appendChild(el('span', 'ui-field__label', 'Observação'));
      const txObs = el('textarea', 'ui-input ui-textarea');
      txObs.rows = 3;
      txObs.value = opEdit ? opEdit.obs || '' : '';
      fObs.appendChild(txObs);
      g4.appendChild(fObs);

      form.appendChild(s4);

      const tact = el('div', 'ui-flex-gap ui-lanc-form-actions');
      tact.style.gridColumn = '1 / -1';
      const btnSub = el('button', 'ui-btn ui-btn--primary', editingOpId ? 'Salvar proposta' : 'Registrar proposta');
      btnSub.type = 'submit';
      const btnNew = el('button', 'ui-btn ui-btn--secondary', 'Nova proposta');
      btnNew.type = 'button';
      btnNew.style.display = editingOpId ? 'inline-flex' : 'none';
      tact.appendChild(btnSub);
      tact.appendChild(btnNew);
      form.appendChild(tact);

      btnNew.addEventListener('click', function () {
        editingOpId = null;
        avisoDuplicata = '';
        paint();
        if (formAnchor) {
          formAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const tipo = selTipo.value;
        const status = selStatus.value;
        if (!MO.statusValidoParaTipo(tipo, status)) {
          toast('Status inválido para o tipo.', 'error');
          return;
        }
        const cpfOk = onlyDigits(inpCpf.value);
        if (cpfOk.length !== 11) {
          toast('CPF deve ter 11 dígitos.', 'error');
          return;
        }
        const valor = parseFloat(inpVal.value);
        if (Number.isNaN(valor) || valor <= 0) {
          toast('Informe o valor financiado.', 'error');
          return;
        }
        const prazo = parseInt(inpPrazo.value, 10);
        if (Number.isNaN(prazo) || prazo < 1) {
          toast('Informe o prazo em parcelas.', 'error');
          return;
        }
        const taxa = parseFloat(inpTaxa.value);
        if (Number.isNaN(taxa) || taxa < 0) {
          toast('Informe a taxa de juros (% a.m.).', 'error');
          return;
        }
        if (!String(inpConv.value).trim()) {
          toast('Preencha tabela / convênio.', 'error');
          return;
        }
        if (!selProm.value) {
          toast('Selecione a promotora.', 'error');
          return;
        }
        const port = tipo === 'PORT' || tipo === 'PORT_REFIN';
        if (port) {
          if (!selBo.value) {
            toast('Selecione o banco de origem.', 'error');
            return;
          }
          const sd = parseFloat(inpSd.value);
          if (Number.isNaN(sd) || sd < 0) {
            toast('Informe o saldo devedor portado.', 'error');
            return;
          }
        }
        if (tipo === 'PORT_REFIN') {
          const rf = parseFloat(inpRefin.value);
          if (Number.isNaN(rf) || rf < 0) {
            toast('Informe o valor do refinanciamento.', 'error');
            return;
          }
        }

        const parcela = prazo > 0 ? Math.round((valor / prazo) * 100) / 100 : undefined;
        let tabelaIdOut = '';
        let comissaoTabOut = null;
        if (selTabCad.value) {
          const tab = (st.tabelas || []).find(function (x) {
            return x.id === selTabCad.value;
          });
          if (tab) {
            tabelaIdOut = tab.id;
            comissaoTabOut = tab.comissao;
          }
        }
        const promRow = (st.promotoras || []).find(function (x) {
          return x.id === selProm.value;
        });

        const base = {
          vendedoraId: selV.value,
          data: inpData.value,
          tipoOperacao: tipo,
          status: status,
          valorContrato: valor,
          bancoParceiro: selBanco.value,
          convenio: inpConv.value.trim(),
          tabelaId: tabelaIdOut,
          comissaoTabela: comissaoTabOut,
          promotoraId: selProm.value || '',
          promotoraNome: promRow ? promRow.nome : '',
          numeroProposta: inpNp.value.trim(),
          numeroContrato: inpNc.value.trim(),
          origemVenda: selOrig.value,
          clienteNome: inpNome.value.trim(),
          clienteCpf: cpfOk,
          beneficioInss: inpBen.value.trim(),
          especieBeneficio: selEsp.value,
          ufBeneficio: selUf.value,
          salarioBeneficioBruto: parseFloat(inpSal.value),
          margemDisponivel: parseFloat(inpMar.value),
          prazoParcelas: prazo,
          taxaJurosMes: taxa,
          valorParcela: parcela,
          valorLiberadoCliente: parseFloat(inpVl.value),
          dataAverbacao: inpAver.value || '',
          dataPagamento: inpPag.value || '',
          obs: txObs.value.trim(),
          referencia: inpNome.value.trim(),
        };
        if (Number.isNaN(base.salarioBeneficioBruto)) delete base.salarioBeneficioBruto;
        if (Number.isNaN(base.margemDisponivel)) delete base.margemDisponivel;
        if (Number.isNaN(base.valorLiberadoCliente)) delete base.valorLiberadoCliente;

        if (port) {
          base.bancoOrigem = selBo.value;
          base.saldoDevedorPortado = parseFloat(inpSd.value);
          base.bancoDestino = selBanco.value;
        } else {
          base.bancoOrigem = '';
          base.bancoDestino = '';
          base.saldoDevedorPortado = undefined;
        }
        if (tipo === 'PORT_REFIN') {
          base.valorRefinanciamento = parseFloat(inpRefin.value);
        } else {
          base.valorRefinanciamento = undefined;
        }

        avisoDuplicata = '';
        if (editingOpId) {
          global.MaycredData.updateOperacao(editingOpId, base);
          if (propostaDuplicadaMesmoBanco(global.MaycredData.getState(), base, editingOpId)) {
            avisoDuplicata =
              'Atenção: já existe uma proposta deste cliente com este banco neste mês.';
          }
          toast('Proposta atualizada.', 'success');
          editingOpId = null;
        } else {
          base.id = global.MaycredData.newId('op');
          global.MaycredData.addOperacao(base);
          const st2 = global.MaycredData.getState();
          if (propostaDuplicadaMesmoBanco(st2, base, base.id)) {
            avisoDuplicata =
              'Atenção: já existe uma proposta deste cliente com este banco neste mês.';
          }
          toast('Proposta registrada.', 'success');
        }
        if (
          MO.propostaContaRentabilidadeMeta &&
          !MO.propostaContaRentabilidadeMeta({
            tabelaId: tabelaIdOut,
            comissaoTabela: comissaoTabOut,
          })
        ) {
          toast('Tabela não definida — esta proposta não está contando para a meta.', 'info');
        }
        paint();
      });

        formHost.appendChild(form);
        if (toastAposCarregarEdicao) {
          toast('Proposta carregada para edição.', 'info');
          toastAposCarregarEdicao = false;
        }
      }

      if (showManutencao && periodHost && statusMonitorHost && filtersHost && tableWrap) {
      const tituloPeriodo = el('div', 'ui-lanc-periodo-bar__title', 'Período da busca (data da operação)');
      periodHost.appendChild(tituloPeriodo);
      const periodRow = el('div', 'ui-lanc-periodo-bar__row');
      const wrapDe = el('div', 'ui-field ui-lanc-periodo-bar__field');
      wrapDe.appendChild(el('span', 'ui-field__label', 'De'));
      const inpDe = el('input', 'ui-input');
      inpDe.type = 'date';
      inpDe.value = fil.dataDe || '';
      inpDe.addEventListener('change', function () {
        fil.dataDe = inpDe.value;
        paint();
      });
      wrapDe.appendChild(inpDe);
      periodRow.appendChild(wrapDe);
      const wrapAte = el('div', 'ui-field ui-lanc-periodo-bar__field');
      wrapAte.appendChild(el('span', 'ui-field__label', 'até'));
      const inpAte = el('input', 'ui-input');
      inpAte.type = 'date';
      inpAte.value = fil.dataAte || '';
      inpAte.addEventListener('change', function () {
        fil.dataAte = inpAte.value;
        paint();
      });
      wrapAte.appendChild(inpAte);
      periodRow.appendChild(wrapAte);
      const btnLimpar = el('button', 'ui-btn ui-btn--secondary ui-lanc-periodo-bar__clear', 'Limpar datas');
      btnLimpar.type = 'button';
      btnLimpar.title = 'Remove o filtro por data (mostra todas as propostas).';
      btnLimpar.addEventListener('click', function () {
        fil.dataDe = '';
        fil.dataAte = '';
        paint();
      });
      periodRow.appendChild(btnLimpar);
      periodHost.appendChild(periodRow);

      const filSemStatus = {
        vend: fil.vend,
        tipo: fil.tipo,
        status: '',
        banco: fil.banco,
        dataDe: fil.dataDe,
        dataAte: fil.dataAte,
        q: fil.q,
      };
      const baseLista = filtrarPropostas(st.operacoes.slice(), filSemStatus);
      const counts = {};
      ALL_STATUS_FILTRO.forEach(function (s) {
        counts[s] = 0;
      });
      baseLista.forEach(function (op) {
        const s = op.status;
        if (Object.prototype.hasOwnProperty.call(counts, s)) counts[s] += 1;
      });
      const tot = baseLista.length;

      const smRow = el('div', 'ui-lanc-status-monitor__row');
      smRow.appendChild(el('div', 'ui-lanc-status-monitor__label', 'Monitor por status'));
      const chipWrap = el('div', 'ui-lanc-status-monitor__chips');
      const btnAll = el(
        'button',
        'ui-lanc-st-chip' + (!fil.status ? ' ui-lanc-st-chip--active' : ''),
        'Todos (' + tot + ')',
      );
      btnAll.type = 'button';
      btnAll.addEventListener('click', function () {
        fil.status = '';
        paint();
      });
      chipWrap.appendChild(btnAll);
      ALL_STATUS_FILTRO.forEach(function (s) {
        const n = counts[s];
        const btn = el(
          'button',
          'ui-lanc-st-chip' + (fil.status === s ? ' ui-lanc-st-chip--active' : ''),
          MO.labelStatusFiltro(s) + ' (' + n + ')',
        );
        btn.type = 'button';
        btn.addEventListener('click', function () {
          fil.status = s;
          paint();
        });
        chipWrap.appendChild(btn);
      });
      smRow.appendChild(chipWrap);
      statusMonitorHost.appendChild(smRow);

      /* —— Filtros —— */
      const fh = el('div', 'ui-form-grid ui-form-grid--2 ui-lanc-filter-grid');
      function addFilter(label, node) {
        const w = el('div', 'ui-field');
        w.appendChild(el('span', 'ui-field__label', label));
        w.appendChild(node);
        fh.appendChild(w);
      }
      const selFV = el('select', 'ui-select');
      const optFV0 = el('option', null, 'Todas');
      optFV0.value = '';
      selFV.appendChild(optFV0);
      st.vendedoras.forEach(function (vv) {
        const o = el('option', null, vv.nome);
        o.value = vv.id;
        selFV.appendChild(o);
      });
      selFV.value = fil.vend;
      selFV.addEventListener('change', function () {
        fil.vend = selFV.value;
        paint();
      });
      addFilter('Vendedora', selFV);

      const selFT = el('select', 'ui-select');
      const optFT0 = el('option', null, 'Todos');
      optFT0.value = '';
      selFT.appendChild(optFT0);
      MO.TIPOS.forEach(function (t) {
        const o = el('option', null, MO.TIPO_LABEL[t]);
        o.value = t;
        selFT.appendChild(o);
      });
      selFT.value = fil.tipo;
      selFT.addEventListener('change', function () {
        fil.tipo = selFT.value;
        paint();
      });
      addFilter('Tipo', selFT);

      const selFS = el('select', 'ui-select');
      const optFS0 = el('option', null, 'Todos');
      optFS0.value = '';
      selFS.appendChild(optFS0);
      ALL_STATUS_FILTRO.forEach(function (s) {
        const o = el('option', null, MO.labelStatusFiltro(s));
        o.value = s;
        selFS.appendChild(o);
      });
      selFS.value = fil.status;
      selFS.addEventListener('change', function () {
        fil.status = selFS.value;
        paint();
      });
      addFilter('Status', selFS);

      const selFB = el('select', 'ui-select');
      const optFB0 = el('option', null, 'Todos');
      optFB0.value = '';
      selFB.appendChild(optFB0);
      BANCOS_PARCEIROS.forEach(function (nome) {
        const ob = el('option', null, nome);
        ob.value = nome;
        selFB.appendChild(ob);
      });
      selFB.value = fil.banco;
      selFB.addEventListener('change', function () {
        fil.banco = selFB.value;
        paint();
      });
      addFilter('Banco', selFB);

      const inpQ = el('input', 'ui-input');
      inpQ.type = 'search';
      inpQ.placeholder = 'Nome ou CPF do cliente';
      inpQ.value = fil.q;
      let qTimer = null;
      inpQ.addEventListener('input', function () {
        fil.q = inpQ.value;
        clearTimeout(qTimer);
        qTimer = setTimeout(function () {
          paint();
        }, 220);
      });
      addFilter('Busca', inpQ);

      filtersHost.appendChild(fh);

      const exportBar = el('div', 'ui-lanc-export-bar');
      const btnExp = el('button', 'ui-btn ui-btn--secondary', 'Exportar para Excel');
      btnExp.type = 'button';
      btnExp.title = 'Gera arquivo CSV (UTF-8) com o mesmo filtro da tabela; abra no Excel.';
      btnExp.addEventListener('click', function () {
        const stNow = global.MaycredData.getState();
        const listaExp = filtrarPropostas(stNow.operacoes.slice(), fil).sort(function (a, b) {
          return String(b.data).localeCompare(String(a.data));
        });
        const csv = buildManutencaoPropostasCsv(listaExp, stNow, MO, fil);
        const tagDe = (fil.dataDe || 'todos').replace(/[^\d]/g, '');
        const tagAte = (fil.dataAte || 'todos').replace(/[^\d]/g, '');
        downloadCsvParaExcel('propostas_manutencao_' + tagDe + '_' + tagAte + '.csv', csv);
        toast(
          'Exportadas ' + listaExp.length + ' linha(s). Abra o .csv no Excel (separador ;).',
          'success',
        );
      });
      exportBar.appendChild(btnExp);
      filtersHost.appendChild(exportBar);

      const lista = filtrarPropostas(st.operacoes.slice(), fil).sort(function (a, b) {
        return String(b.data).localeCompare(String(a.data));
      });

      let sumProd = 0;
      let sumAnalise = 0;
      let sumPago = 0;
      lista.forEach(function (op) {
        sumProd += Number(op.valorContrato) || 0;
        const fluxo = MO.fluxoDoTipo(op.tipoOperacao);
        const imp = MO.impactoMetaPorStatus(fluxo, op.status);
        const c = MO.comissaoEstimadaParaOperacao
          ? MO.comissaoEstimadaParaOperacao(op.valorContrato, st.config, op)
          : 0;
        if (imp.analise) sumAnalise += c;
        if (imp.pago) sumPago += c;
      });

      const tbl = el('table', 'ui-table ui-table--responsive ui-lanc-hist-table');
      const thead = el('thead');
      const hr = el('tr');
      [
        'Data',
        'Vendedora',
        'Cliente',
        'Benefício',
        'Tipo',
        'Banco',
        'Promotora',
        'Valor',
        'Parcelas',
        'Rentab. (R$)',
        'Status',
        'Meta',
        'Ações',
      ].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      const tb = el('tbody');
      if (!lista.length) {
        const tr0 = el('tr');
        const td0 = el('td', 'ui-muted');
        td0.colSpan = 13;
        td0.textContent = 'Nenhuma proposta com os filtros atuais.';
        tr0.appendChild(td0);
        tb.appendChild(tr0);
      } else {
        lista.forEach(function (op) {
          const vend = st.vendedoras.find(function (x) {
            return x.id === op.vendedoraId;
          });
          const comm = MO.comissaoEstimadaParaOperacao
            ? MO.comissaoEstimadaParaOperacao(op.valorContrato, st.config, op)
            : 0;
          const esp = ESPECIES_BENEFICIO.find(function (e) {
            return e.v === op.especieBeneficio;
          });
          const tr = el('tr');
          if (op.status === 'AVERBADO') tr.classList.add('ui-lanc-row--averbado');
          if (MO.propostaContaRentabilidadeMeta && !MO.propostaContaRentabilidadeMeta(op)) {
            tr.classList.add('ui-lanc-row--incomplete-meta');
          }
          tr.appendChild(el('td', 'ui-mono', op.data || '—'));
          tr.appendChild(el('td', null, vend ? vend.nome : op.vendedoraId));
          const tdCl = el('td', null);
          tdCl.appendChild(el('div', null, op.clienteNome || '—'));
          tdCl.appendChild(el('div', 'ui-muted ui-lanc-cpf-mask', maskCpfTabela(op.clienteCpf)));
          if (MO.propostaContaRentabilidadeMeta && !MO.propostaContaRentabilidadeMeta(op)) {
            tdCl.appendChild(
              el(
                'div',
                'ui-lanc-proposta-meta-alert',
                'Tabela não definida — esta proposta não está contando para a meta.',
              ),
            );
          }
          tr.appendChild(tdCl);
          const tdBen = el('td', null);
          tdBen.appendChild(el('div', 'ui-mono', op.beneficioInss || '—'));
          tdBen.appendChild(el('div', 'ui-muted', esp ? esp.t : '—'));
          tr.appendChild(tdBen);
          const tdTipo = el('td', null);
          tdTipo.appendChild(el('span', MO.chipClass(op.tipoOperacao), MO.TIPO_LABEL[op.tipoOperacao]));
          tr.appendChild(tdTipo);
          let bancoTxt = op.bancoParceiro || '—';
          if (op.tipoOperacao === 'PORT' || op.tipoOperacao === 'PORT_REFIN') {
            bancoTxt = (op.bancoOrigem || '—') + ' → ' + (op.bancoParceiro || '—');
          }
          tr.appendChild(el('td', null, bancoTxt));
          tr.appendChild(el('td', null, op.promotoraNome || '—'));
          tr.appendChild(el('td', 'ui-mono', formatBRL(op.valorContrato)));
          const pr = op.prazoParcelas || 0;
          const vp = op.valorParcela;
          const parcTxt =
            pr > 0 && vp != null && !Number.isNaN(Number(vp))
              ? pr + ' × ' + formatBRL(vp)
              : pr > 0
                ? String(pr) + ' parc.'
                : '—';
          tr.appendChild(el('td', 'ui-mono', parcTxt));
          tr.appendChild(el('td', 'ui-mono', formatBRL(comm)));
          const tdSt = el('td', null);
          tdSt.appendChild(
            el('span', MO.classeBadgeStatus(op.status), MO.labelStatus(op.tipoOperacao, op.status))
          );
          tr.appendChild(tdSt);
          const tdMeta = el('td', null);
          tdMeta.appendChild(
            el('span', 'ui-lanc-meta-badge', MO.labelMetaImpacto(op.tipoOperacao, op.status))
          );
          tr.appendChild(tdMeta);
          const tdA = el('td', 'ui-lanc-actions');
          const bEd = el('button', 'ui-btn ui-btn--sm ui-btn--secondary', 'Editar');
          bEd.type = 'button';
          const bAv = el('button', 'ui-btn ui-btn--sm ui-btn--primary', 'Avançar');
          bAv.type = 'button';
          const bCan = el('button', 'ui-btn ui-btn--sm ui-lanc-btn-cancel', 'Cancelar');
          bCan.type = 'button';
          const bEx = el('button', 'ui-btn ui-btn--sm ui-btn--danger', 'Excluir');
          bEx.type = 'button';
          const nextSt = MO.proximoStatusNoFluxo(op.tipoOperacao, op.status);
          bAv.style.display = nextSt && op.status !== 'CANCELADO' ? 'inline-flex' : 'none';
          bCan.style.display = op.status !== 'CANCELADO' ? 'inline-flex' : 'none';

          bEd.addEventListener('click', function () {
            toast(
              'Cadastro/manutenção pelo menu gestor foi desativado. Para incluir ou alterar propostas, use o login da vendedora (aba Propostas).',
              'info',
            );
          });

          bAv.addEventListener('click', function () {
            const nx = MO.proximoStatusNoFluxo(op.tipoOperacao, op.status);
            if (!nx) return;
            const fluxo = MO.fluxoDoTipo(op.tipoOperacao);
            const before = MO.impactoMetaPorStatus(fluxo, op.status);
            const after = MO.impactoMetaPorStatus(fluxo, nx);
            global.MaycredData.updateOperacao(op.id, { status: nx });
            if (nx === 'AVERBADO') {
              toast('Operação averbada com sucesso!', 'success');
            } else if (before.analise && after.pago && !after.analise) {
              toast('Operação movida para Pago — meta atualizada.', 'success');
            } else {
              toast('Status atualizado.', 'success');
            }
            paint();
          });

          bCan.addEventListener('click', function () {
            confirmGenerico(
              'Cancelar proposta',
              'Tem certeza? Esta proposta será removida do cálculo de metas.',
              'Confirmar',
              true,
              function () {
                global.MaycredData.updateOperacao(op.id, { status: 'CANCELADO' });
                toast('Proposta cancelada.', 'info');
                paint();
              }
            );
          });

          bEx.addEventListener('click', function () {
            confirmExcluir('Excluir proposta', 'Remover definitivamente esta proposta do sistema?', function () {
              global.MaycredData.removeOperacao(op.id);
              toast('Proposta excluída.', 'info');
              paint();
            });
          });

          tdA.appendChild(bEd);
          tdA.appendChild(bAv);
          tdA.appendChild(bCan);
          tdA.appendChild(bEx);
          tr.appendChild(tdA);
          tb.appendChild(tr);
        });
      }
      tbl.appendChild(tb);
      const tfoot = el('tfoot');
      const fr = el('tr', 'ui-lanc-tfoot-main');
      fr.appendChild(el('td', 'ui-lanc-tfoot-label', 'Totais (filtro atual)'));
      fr.appendChild(el('td', null, String(lista.length) + ' proposta(s)'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-mono', formatBRL(sumProd)));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-mono', formatBRL(sumAnalise)));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      fr.appendChild(el('td', 'ui-muted', '—'));
      tfoot.appendChild(fr);
      const fr2 = el('tr', 'ui-lanc-tfoot-sub');
      const tdPago = el('td', 'ui-lanc-tfoot-pago');
      tdPago.colSpan = 13;
      tdPago.textContent = 'Soma em Pago (comissão estimada nas linhas em Pago): ' + formatBRL(sumPago);
      fr2.appendChild(tdPago);
      tfoot.appendChild(fr2);
      tbl.appendChild(tfoot);
      tableWrap.appendChild(tbl);
      }
    }

    paint();
  }

  function renderPropostasCadastro(container) {
    renderPropostasView(container, true, false);
  }

  function renderPropostasManutencao(container) {
    renderPropostasView(container, false, true);
  }

  /** @deprecated use renderPropostasManutencao */
  function renderLancamentos(container) {
    renderPropostasManutencao(container);
  }

  /**
   * Cadastro de bancos parceiros e tabelas (comissão %, prazo, taxa) para uso nas propostas.
   */
  function renderModuloTabelasBancos(container) {
    clear(container);
    const D = global.MaycredData;
    const MO = global.MaycredOperacoes;
    let aba = 'tabelas';
    let editingTabelaId = null;

    const page = el('div', 'ui-page ui-modulo-tabelas');
    page.appendChild(el('h2', 'ui-page__title', 'Parceiros e tabelas'));
    page.appendChild(
      el(
        'p',
        'ui-muted',
        'Cadastro mestre: promotoras (cada uma com comissão diferente), bancos parceiros e tabelas vinculadas a banco + promotora. Na proposta, escolha promotora e banco; só aparecem tabelas daquela combinação. Sem tabela cadastrada, valem os percentuais padrão por tipo salvos nos dados do app.',
      ),
    );

    const tabs = el('div', 'ui-tabs');
    const host = el('div', '');
    page.appendChild(tabs);
    page.appendChild(host);
    container.appendChild(page);

    function field(lab, node) {
      const f = el('div', 'ui-field');
      f.appendChild(el('span', 'ui-field__label', lab));
      f.appendChild(node);
      return f;
    }

    function paint() {
      clear(tabs);
      clear(host);
      const b0 = el('button', 'ui-tab' + (aba === 'promotoras' ? ' ui-tab--active' : ''), 'Promotoras');
      const b1 = el('button', 'ui-tab' + (aba === 'bancos' ? ' ui-tab--active' : ''), 'Bancos parceiros');
      const b2 = el('button', 'ui-tab' + (aba === 'tabelas' ? ' ui-tab--active' : ''), 'Tabelas');
      b0.type = b1.type = b2.type = 'button';
      b0.addEventListener('click', function () {
        aba = 'promotoras';
        paint();
      });
      b1.addEventListener('click', function () {
        aba = 'bancos';
        paint();
      });
      b2.addEventListener('click', function () {
        aba = 'tabelas';
        editingTabelaId = null;
        paint();
      });
      tabs.appendChild(b0);
      tabs.appendChild(b1);
      tabs.appendChild(b2);

      if (aba === 'promotoras') {
        host.appendChild(
          el(
            'p',
            'ui-muted',
            'Cada promotora pode ter as mesmas tabelas de banco com percentuais diferentes. Ex.: Promotora A — BMG NOVO 25%; Promotora B — BMG NOVO 22%.',
          ),
        );
        const tblP = el('table', 'ui-table ui-table--responsive');
        const theadP = el('thead');
        const hrP = el('tr');
        ['Promotora', 'Qtd. tabelas', 'Situação'].forEach(function (h) {
          hrP.appendChild(el('th', null, h));
        });
        theadP.appendChild(hrP);
        tblP.appendChild(theadP);
        const tbP = el('tbody');
        D.getPromotoras().forEach(function (p) {
          const n = D.countTabelasByPromotoraId(p.id);
          const tr = el('tr');
          tr.appendChild(el('td', null, p.nome));
          tr.appendChild(el('td', null, String(n)));
          tr.appendChild(el('td', null, p.ativo !== false ? 'Ativa' : 'Inativa'));
          tbP.appendChild(tr);
        });
        tblP.appendChild(tbP);
        host.appendChild(tblP);
        host.appendChild(el('h4', 'ui-subtitle', 'Nova promotora'));
        const fp = el('form', 'ui-form-inline');
        const np = el('input', 'ui-input');
        np.placeholder = 'Nome da promotora';
        const btnp = el('button', 'ui-btn ui-btn--primary', 'Salvar promotora');
        btnp.type = 'submit';
        fp.appendChild(np);
        fp.appendChild(btnp);
        fp.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!np.value.trim()) {
            toast('Informe o nome da promotora.', 'error');
            return;
          }
          D.savePromotora({ nome: np.value.trim(), ativo: true });
          toast('Promotora cadastrada.', 'success');
          np.value = '';
          paint();
        });
        host.appendChild(fp);
        return;
      }

      if (aba === 'bancos') {
        host.appendChild(
          el('p', 'ui-muted', 'Os bancos listados aqui aparecem no campo “Banco parceiro” das propostas.'),
        );
        const tbl = el('table', 'ui-table ui-table--responsive');
        const thead = el('thead');
        const hr = el('tr');
        ['Banco', 'Código', 'Qtd. tabelas', 'Situação'].forEach(function (h) {
          hr.appendChild(el('th', null, h));
        });
        thead.appendChild(hr);
        tbl.appendChild(thead);
        const tb = el('tbody');
        D.getBancos().forEach(function (b) {
          const n = D.getTabelas().filter(function (t) {
            return t.bancoId === b.id;
          }).length;
          const tr = el('tr');
          tr.appendChild(el('td', null, b.nome));
          tr.appendChild(el('td', 'ui-mono', b.codigo || '—'));
          tr.appendChild(el('td', null, String(n)));
          tr.appendChild(el('td', null, b.ativo !== false ? 'Ativo' : 'Inativo'));
          tb.appendChild(tr);
        });
        tbl.appendChild(tb);
        host.appendChild(tbl);
        host.appendChild(el('h4', 'ui-subtitle', 'Novo banco'));
        const f = el('form', 'ui-form-inline');
        const n = el('input', 'ui-input');
        n.placeholder = 'Nome do banco';
        const c = el('input', 'ui-input');
        c.placeholder = 'Código (ex. 318)';
        const btn = el('button', 'ui-btn ui-btn--primary', 'Salvar banco');
        btn.type = 'submit';
        f.appendChild(n);
        f.appendChild(c);
        f.appendChild(btn);
        f.addEventListener('submit', function (e) {
          e.preventDefault();
          if (!n.value.trim()) {
            toast('Informe o nome do banco.', 'error');
            return;
          }
          D.saveBanco({ nome: n.value.trim(), codigo: c.value.trim(), ativo: true });
          toast('Banco cadastrado.', 'success');
          n.value = '';
          c.value = '';
          paint();
        });
        host.appendChild(f);
        return;
      }

      const filB = el('select', 'ui-select');
      const opt0 = el('option', null, 'Todos os bancos');
      opt0.value = '';
      filB.appendChild(opt0);
      D.getBancos().forEach(function (b) {
        const o = el('option', null, b.nome);
        o.value = b.id;
        filB.appendChild(o);
      });
      const filP = el('select', 'ui-select');
      const optP0 = el('option', null, 'Todas as promotoras');
      optP0.value = '';
      filP.appendChild(optP0);
      D.getPromotoras().forEach(function (p) {
        const o = el('option', null, p.nome);
        o.value = p.id;
        filP.appendChild(o);
      });
      const filRow = el('div', 'ui-form-inline');
      filRow.appendChild(el('span', 'ui-muted', 'Filtrar:'));
      filRow.appendChild(filB);
      filRow.appendChild(filP);
      host.appendChild(filRow);

      const tbl = el('table', 'ui-table ui-table--responsive');
      const thead = el('thead');
      const hr = el('tr');
      ['Banco', 'Promotora', 'Nome da tabela', 'Convênio', 'Tipo', 'Prazo', 'Taxa %', 'Comissão %', 'Ativa', 'Ações'].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      const tb = el('tbody');

      const formWrap = el('div', 'ui-config-block');
      formWrap.appendChild(
        el('h3', 'ui-config-block__title', editingTabelaId ? 'Editar tabela' : 'Nova tabela'),
      );

      const sp = el('select', 'ui-select');
      D.getPromotoras().forEach(function (p) {
        if (p.ativo === false) return;
        const o = el('option', null, p.nome);
        o.value = p.id;
        sp.appendChild(o);
      });
      const sb = el('select', 'ui-select');
      D.getBancos().forEach(function (b) {
        if (b.ativo === false) return;
        const o = el('option', null, b.nome);
        o.value = b.id;
        sb.appendChild(o);
      });
      const nm = el('input', 'ui-input');
      nm.placeholder = 'Ex.: BMG INSS NOVO (só o nome; prazo entra no campo Prazo)';
      const st = el('select', 'ui-select');
      MO.TIPOS.forEach(function (t) {
        const o = el('option', null, MO.TIPO_LABEL[t]);
        o.value = t;
        st.appendChild(o);
      });
      const pz = el('input', 'ui-input');
      pz.type = 'number';
      pz.min = '1';
      pz.value = '84';
      const tx = el('input', 'ui-input');
      tx.type = 'number';
      tx.step = '0.01';
      tx.value = '1.8';
      const cmPct = el('input', 'ui-input');
      cmPct.type = 'number';
      cmPct.step = '0.01';
      cmPct.min = '0';
      cmPct.max = '100';
      cmPct.placeholder = 'Ex.: 25';

      const editRow = editingTabelaId
        ? D.getTabelas().find(function (x) {
            return x.id === editingTabelaId;
          })
        : null;
      if (editRow) {
        sb.value = editRow.bancoId;
        if (editRow.promotoraId) sp.value = editRow.promotoraId;
        nm.value = editRow.nome;
        st.value = editRow.tipo;
        pz.value = String(editRow.prazo);
        tx.value = String(editRow.taxa);
        cmPct.value = String(Math.round(editRow.comissao * 10000) / 100);
      } else {
        cmPct.value = '25';
      }

      const preview = el('div', 'ui-muted');
      function updPreview() {
        const vf = 10000;
        const pct = parseFloat(String(cmPct.value).replace(',', '.'));
        const dec = Number.isNaN(pct) ? 0 : pct / 100;
        preview.textContent =
          'Referência: R$\u00a0' +
          vf.toLocaleString('pt-BR') +
          ' financiados → análise ' +
          formatBRL(Math.round(vf * dec * 100) / 100);
      }
      cmPct.addEventListener('input', updPreview);
      updPreview();

      const convPreview = el('input', 'ui-input ui-input--readonly');
      convPreview.readOnly = true;
      convPreview.tabIndex = -1;
      function updConvPreview() {
        const prInt = parseInt(pz.value, 10);
        convPreview.value = D.formatConvenioTabela(nm.value, !Number.isNaN(prInt) && prInt >= 1 ? prInt : 1);
      }
      nm.addEventListener('input', updConvPreview);
      pz.addEventListener('input', updConvPreview);
      updConvPreview();

      const form = el('form', 'ui-form-grid ui-form-grid--2');
      form.appendChild(field('Banco *', sb));
      form.appendChild(field('Promotora *', sp));
      form.appendChild(field('Nome da tabela *', nm));
      form.appendChild(field('Tipo *', st));
      form.appendChild(field('Prazo (parcelas) *', pz));
      form.appendChild(field('Convênio (nome - prazo)', convPreview));
      form.appendChild(field('Taxa (% a.m.) *', tx));
      form.appendChild(field('Comissão sobre financiado (%) *', cmPct));
      const prevWrap = el('div', 'ui-field');
      prevWrap.style.gridColumn = '1 / -1';
      prevWrap.appendChild(preview);
      form.appendChild(prevWrap);

      const act = el('div', 'ui-form-inline');
      act.style.gridColumn = '1 / -1';
      const bs = el('button', 'ui-btn ui-btn--primary', editingTabelaId ? 'Salvar alterações' : 'Cadastrar tabela');
      bs.type = 'submit';
      act.appendChild(bs);
      if (editingTabelaId) {
        const bc = el('button', 'ui-btn ui-btn--secondary', 'Cancelar edição');
        bc.type = 'button';
        bc.addEventListener('click', function () {
          editingTabelaId = null;
          paint();
        });
        act.appendChild(bc);
      }
      form.appendChild(act);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const pct = parseFloat(String(cmPct.value).replace(',', '.'));
        if (Number.isNaN(pct) || pct < 0 || pct > 100) {
          toast('Comissão entre 0 e 100%.', 'error');
          return;
        }
        if (!nm.value.trim()) {
          toast('Informe o nome da tabela.', 'error');
          return;
        }
        if (!sp.options.length) {
          toast('Cadastre uma promotora na aba Promotoras.', 'error');
          return;
        }
        if (!sb.options.length) {
          toast('Cadastre um banco na aba Bancos.', 'error');
          return;
        }
        const row = {
          promotoraId: sp.value,
          bancoId: sb.value,
          nome: nm.value.trim(),
          tipo: st.value,
          prazo: parseInt(pz.value, 10) || 84,
          taxa: parseFloat(String(tx.value).replace(',', '.')) || 0,
          comissao: pct / 100,
          ativo: true,
        };
        if (editingTabelaId) {
          const cur = D.getTabelas().find(function (x) {
            return x.id === editingTabelaId;
          });
          row.id = editingTabelaId;
          row.ativo = cur ? cur.ativo !== false : true;
          D.saveTabela(row);
          toast('Tabela atualizada.', 'success');
          editingTabelaId = null;
        } else {
          D.saveTabela(row);
          toast('Tabela cadastrada.', 'success');
        }
        paint();
      });

      formWrap.appendChild(form);
      host.appendChild(formWrap);

      function refill() {
        clear(tb);
        D.getTabelas().forEach(function (t) {
          if (filP.value && String(t.promotoraId || '') !== filP.value) return;
          if (filB.value && t.bancoId !== filB.value) return;
          const b = D.getBancoById(t.bancoId);
          const pr = D.getPromotoraById(t.promotoraId);
          const tr = el('tr');
          tr.appendChild(el('td', null, b ? b.nome : '—'));
          tr.appendChild(el('td', null, pr ? pr.nome : '—'));
          tr.appendChild(el('td', null, t.nome));
          tr.appendChild(
            el('td', 'ui-mono', t.convenio || D.formatConvenioTabela(t.nome, t.prazo)),
          );
          tr.appendChild(el('td', null, MO.TIPO_LABEL[t.tipo] || t.tipo));
          tr.appendChild(el('td', 'ui-mono', String(t.prazo)));
          tr.appendChild(
            el(
              'td',
              'ui-mono',
              Number(t.taxa).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%',
            ),
          );
          tr.appendChild(
            el(
              'td',
              'ui-mono',
              (Math.round(t.comissao * 10000) / 100).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }) + '%',
            ),
          );
          tr.appendChild(el('td', null, t.ativo !== false ? 'Sim' : 'Não'));
          const td = el('td', null);
          const bEd = el('button', 'ui-btn ui-btn--sm ui-btn--secondary', 'Editar');
          bEd.type = 'button';
          bEd.addEventListener('click', function () {
            editingTabelaId = t.id;
            paint();
          });
          const bt = el('button', 'ui-btn ui-btn--sm');
          bt.type = 'button';
          if (t.ativo !== false) {
            bt.textContent = 'Desativar';
            bt.addEventListener('click', function () {
              const cnt = D.countOperacoesByTabelaId(t.id);
              if (cnt > 0) {
                toast('Há ' + cnt + ' proposta(s) com esta tabela; a comissão já gravada não muda.', 'info');
              }
              D.saveTabela({ ...t, ativo: false });
              paint();
            });
          } else {
            bt.textContent = 'Ativar';
            bt.addEventListener('click', function () {
              D.saveTabela({ ...t, ativo: true });
              paint();
            });
          }
          td.appendChild(bEd);
          td.appendChild(bt);
          tr.appendChild(td);
          tb.appendChild(tr);
        });
        if (!tb.children.length) {
          const tr = el('tr');
          const td = el('td', 'ui-muted');
          td.colSpan = 10;
          td.textContent = 'Nenhuma tabela neste filtro. Cadastre promotora, banco e depois a tabela.';
          tr.appendChild(td);
          tb.appendChild(tr);
        }
      }

      tbl.appendChild(tb);
      host.appendChild(el('h3', 'ui-subtitle', 'Tabelas cadastradas'));
      host.appendChild(tbl);
      filP.addEventListener('change', refill);
      filB.addEventListener('change', refill);
      refill();
    }

    paint();
  }

  global.MaycredUI = global.MaycredUI || {};
  global.MaycredUI.renderPropostasCadastro = renderPropostasCadastro;
  global.MaycredUI.renderPropostasManutencao = renderPropostasManutencao;
  global.MaycredUI.renderLancamentos = renderLancamentos;
  global.MaycredUI.renderModuloTabelasBancos = renderModuloTabelasBancos;
})(typeof window !== 'undefined' ? window : globalThis);
