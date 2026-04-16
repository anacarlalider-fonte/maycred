/**
 * Área da vendedora (perfil Venda): desempenho, pipeline, clientes.
 * Sem exibir comissão/rentabilidade em R$ nem meta em R$. Isolamento por vendedoraId na gravação.
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

  const PIPELINE_MAIN_ORDER = ['prospeccao', 'diagnostico', 'proposta', 'negociacao', 'fechado'];
  const PIPELINE_SLA_DIAS = { prospeccao: 7, diagnostico: 5, proposta: 7, negociacao: 10 };

  function ymdTodayLocal() {
    const d = new Date();
    return (
      d.getFullYear() +
      '-' +
      String(d.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(d.getDate()).padStart(2, '0')
    );
  }

  function diasDesdeYmd(desdeYmd) {
    const a = String(desdeYmd || '').slice(0, 10);
    if (a.length < 10) return 0;
    const t0 = new Date(a + 'T12:00:00').getTime();
    const t1 = new Date(ymdTodayLocal() + 'T12:00:00').getTime();
    return Math.max(0, Math.round((t1 - t0) / 86400000));
  }

  function pipelineSlaLine(etapa, lead) {
    if (etapa === 'fechado' || etapa === 'perdido') return '';
    const max = PIPELINE_SLA_DIAS[etapa];
    if (!max) return '';
    return diasDesdeYmd(lead.etapaDesde) + 'd / ' + max + 'd SLA';
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

  function toast(msg, type) {
    if (global.MaycredUI && MaycredUI.toast) MaycredUI.toast(msg, type);
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

  function formatBRL(n) {
    const x = Number(n);
    if (Number.isNaN(x)) return '—';
    return (
      'R$\u00a0' +
      x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    );
  }

  function renderDesempenho(container) {
    global.MaycredUI.renderDashboardVendedora(container);
  }

  function renderClientes(container) {
    const vid = global.MaycredAuth.getVendedoraIdOperacional();
    if (!vid) {
      container.appendChild(el('p', 'ui-muted', 'Sessão inválida.'));
      return;
    }

    let editingId = null;
    let q = '';

    function paint() {
      clear(container);
      const wrap = el('div', 'ui-section ui-vend-mod');
      wrap.appendChild(el('h2', 'ui-section__title', 'Clientes'));
      wrap.appendChild(
        el(
          'p',
          'ui-muted',
          'Cadastre e edite clientes para agilizar propostas. Todos os cadastros do sistema aparecem na busca.',
        ),
      );

      const row = el('div', 'ui-form-grid ui-form-grid--2');
      const fq = el('div', 'ui-field');
      fq.appendChild(el('span', 'ui-field__label', 'Buscar'));
      const inQ = el('input', 'ui-input');
      inQ.type = 'search';
      inQ.placeholder = 'Nome ou CPF';
      inQ.value = q;
      inQ.addEventListener('input', function () {
        q = inQ.value;
        paint();
      });
      fq.appendChild(inQ);
      row.appendChild(fq);
      wrap.appendChild(row);

      const list = global.MaycredData.listClientes().filter(function (c) {
        if (!q.trim()) return c.ativo !== false;
        const qq = q.trim().toLowerCase();
        const dig = onlyDigits(q);
        return (
          (c.nome && c.nome.toLowerCase().indexOf(qq) >= 0) ||
          (dig.length >= 3 && c.cpf && c.cpf.indexOf(dig) >= 0)
        );
      });

      const tw = el('div', 'ui-table-wrap');
      const tbl = el('table', 'ui-table');
      const thead = el('thead');
      const hr = el('tr');
      ['Nome', 'CPF', 'Celular', ''].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      const tb = el('tbody');
      if (!list.length) {
        const tr = el('tr');
        const td = el('td', null, 'Nenhum cliente encontrado.');
        td.colSpan = 4;
        tr.appendChild(td);
        tb.appendChild(tr);
      } else {
        list.forEach(function (c) {
          const tr = el('tr');
          tr.appendChild(el('td', null, c.nome || '—'));
          tr.appendChild(el('td', null, formatCpfInput(c.cpf)));
          tr.appendChild(el('td', null, c.celular || '—'));
          const ta = el('td', null);
          const bE = el('button', 'ui-btn ui-btn--ghost ui-btn--sm', 'Editar');
          bE.type = 'button';
          bE.addEventListener('click', function () {
            editingId = c.id;
            paint();
          });
          ta.appendChild(bE);
          tr.appendChild(ta);
          tb.appendChild(tr);
        });
      }
      tbl.appendChild(tb);
      tw.appendChild(tbl);
      wrap.appendChild(tw);

      const block = el('div', 'ui-config-block');
      block.appendChild(
        el('h4', 'ui-config-block__title', editingId ? 'Editar cliente' : 'Novo cliente'),
      );
      const ed = editingId ? global.MaycredData.getClienteById(editingId) : null;

      const g = el('div', 'ui-form-grid ui-form-grid--2');
      function fld(label, node) {
        const f = el('div', 'ui-field');
        f.appendChild(el('span', 'ui-field__label', label));
        f.appendChild(node);
        return f;
      }

      const inNome = el('input', 'ui-input');
      inNome.type = 'text';
      inNome.value = ed ? ed.nome : '';
      g.appendChild(fld('Nome *', inNome));

      const inCpf = el('input', 'ui-input');
      inCpf.type = 'text';
      inCpf.value = ed ? formatCpfInput(ed.cpf) : '';
      inCpf.addEventListener('input', function () {
        const raw = onlyDigits(inCpf.value);
        inCpf.value = formatCpfInput(raw);
      });
      g.appendChild(fld('CPF *', inCpf));

      const inCel = el('input', 'ui-input');
      inCel.type = 'text';
      inCel.value = ed ? ed.celular : '';
      g.appendChild(fld('Celular', inCel));

      const txObs = el('textarea', 'ui-input ui-textarea');
      txObs.rows = 2;
      txObs.value = ed ? ed.observacoes : '';
      const fo = fld('Observações', txObs);
      fo.style.gridColumn = '1 / -1';
      g.appendChild(fo);

      block.appendChild(g);

      const act = el('div', 'ui-flex-gap');
      const btnS = el('button', 'ui-btn ui-btn--primary', editingId ? 'Salvar' : 'Cadastrar');
      btnS.type = 'button';
      btnS.addEventListener('click', function () {
        const nome = inNome.value.trim();
        const cpfOk = onlyDigits(inCpf.value);
        if (!nome) {
          toast('Informe o nome.', 'error');
          return;
        }
        if (cpfOk.length !== 11) {
          toast('CPF com 11 dígitos.', 'error');
          return;
        }
        const payload = {
          nome: nome,
          cpf: cpfOk,
          celular: inCel.value.trim(),
          observacoes: txObs.value.trim(),
          ativo: true,
        };
        if (editingId) {
          global.MaycredData.updateCliente(editingId, payload);
          toast('Cliente atualizado.', 'success');
        } else {
          global.MaycredData.addCliente(payload);
          toast('Cliente cadastrado.', 'success');
        }
        editingId = null;
        paint();
      });
      act.appendChild(btnS);

      if (editingId) {
        const btnN = el('button', 'ui-btn ui-btn--secondary', 'Novo');
        btnN.type = 'button';
        btnN.addEventListener('click', function () {
          editingId = null;
          paint();
        });
        act.appendChild(btnN);
        const btnX = el('button', 'ui-btn ui-btn--danger', 'Excluir');
        btnX.type = 'button';
        btnX.addEventListener('click', function () {
          if (
            !global.confirm(
              'Excluir este cliente do cadastro? Propostas já lançadas não são apagadas.',
            )
          )
            return;
          global.MaycredData.removeCliente(editingId);
          toast('Cliente removido.', 'info');
          editingId = null;
          paint();
        });
        act.appendChild(btnX);
      }
      block.appendChild(act);
      wrap.appendChild(block);
      container.appendChild(wrap);
    }

    paint();
  }

  function renderPipeline(container) {
    const vid = global.MaycredAuth.getVendedoraIdOperacional();
    if (!vid) {
      container.appendChild(el('p', 'ui-muted', 'Sessão inválida.'));
      return;
    }
    const st0 = global.MaycredData.getState();
    const self = st0.vendedoras.find(function (x) {
      return x.id === vid;
    });
    if (!self) {
      container.appendChild(el('p', 'ui-muted', 'Cadastro não encontrado.'));
      return;
    }

    function paint() {
      clear(container);
      const labels = global.MaycredData.getPipelineEtapasLabelsResolved();
      const leads = global.MaycredData.listPipelineLeadsByVendedora(vid);
      function sumVal(arr) {
        let t = 0;
        arr.forEach(function (L) {
          t += Number(L.valorEstimado) || 0;
        });
        return t;
      }
      const active = leads.filter(function (L) {
        return L.etapa !== 'perdido' && L.etapa !== 'fechado';
      });
      const fechados = leads.filter(function (L) {
        return L.etapa === 'fechado';
      });
      const perdidos = leads.filter(function (L) {
        return L.etapa === 'perdido';
      });
      const totalPipe = sumVal(active);
      const totalFechado = sumVal(fechados);

      const wrap = el('div', 'ui-section ui-vend-mod ui-vend-mod--pipeline');
      const head = el('div', 'ui-pipeline-head');
      head.appendChild(el('h2', 'ui-section__title', 'Pipeline — correspondente bancário'));
      const totals = el('div', 'ui-pipeline-head__totals');
      totals.appendChild(
        el('span', 'ui-pipeline-head__total ui-pipeline-head__total--pipe', 'Total pipeline: ' + formatBRL(totalPipe)),
      );
      totals.appendChild(el('span', 'ui-pipeline-head__total ui-pipeline-head__total--won', 'Fechado: ' + formatBRL(totalFechado)));
      head.appendChild(totals);
      wrap.appendChild(head);
      wrap.appendChild(
        el(
          'p',
          'ui-muted ui-pipeline-hint',
          'Cada correspondente vê apenas os próprios registros. No card ou no modal marque se vendeu ou não; use o funil para o andamento. Agendamentos e histórico de contato ficam no modal. Valores em R$ são estimativa.',
        ),
      );
      const btnRestore = el('button', 'ui-btn ui-btn--secondary ui-btn--sm', 'Restaurar nomes originais das etapas');
      btnRestore.type = 'button';
      btnRestore.addEventListener('click', function () {
        global.MaycredData.setConfig({ pipelineEtapasLabels: null });
        toast('Nomes das etapas restaurados.', 'info');
        paint();
      });
      wrap.appendChild(btnRestore);

      const formBox = el('div', 'ui-pipeline-nuevo');
      formBox.appendChild(el('h3', 'ui-pipeline-nuevo__title', 'Nova operação / cliente'));
      const fg = el('div', 'ui-pipeline-form');
      function pf(lb, node, grow) {
        const f = el('div', 'ui-pipeline-field' + (grow ? ' ui-pipeline-field--grow' : ''));
        f.appendChild(el('span', 'ui-field__label', lb));
        f.appendChild(node);
        return f;
      }
      const inTit = el('input', 'ui-input');
      inTit.type = 'text';
      inTit.placeholder = 'Ex. Portabilidade consignado';
      const inCli = el('input', 'ui-input');
      inCli.type = 'text';
      inCli.placeholder = 'Nome do cliente';
      const inVal = el('input', 'ui-input');
      inVal.type = 'number';
      inVal.min = '0';
      inVal.step = '0.01';
      inVal.value = '0';
      const inProb = el('input', 'ui-input');
      inProb.type = 'number';
      inProb.min = '0';
      inProb.max = '100';
      inProb.value = '50';
      const inPrev = el('input', 'ui-input');
      inPrev.type = 'date';
      fg.appendChild(pf('Título', inTit, true));
      fg.appendChild(pf('Cliente', inCli, true));
      fg.appendChild(pf('Valor estimado (R$)', inVal, false));
      fg.appendChild(pf('Probabilidade %', inProb, false));
      fg.appendChild(pf('Previsão fechamento', inPrev, false));
      const btnAdd = el('button', 'ui-btn ui-btn--primary', '+ Adicionar');
      btnAdd.type = 'button';
      btnAdd.addEventListener('click', function () {
        const tit = String(inTit.value || '').trim();
        const cli = String(inCli.value || '').trim();
        if (!tit || !cli) {
          toast('Preencha título e cliente.', 'error');
          return;
        }
        const vlr = parseFloat(inVal.value);
        const prb = parseInt(inProb.value, 10);
        global.MaycredData.savePipelineLead(
          {
            titulo: tit,
            cliente: cli,
            valorEstimado: Number.isFinite(vlr) ? Math.max(0, vlr) : 0,
            probabilidade: Number.isFinite(prb) ? prb : 50,
            previsaoFechamento: String(inPrev.value || '').slice(0, 10),
            etapa: 'prospeccao',
          },
          vid,
        );
        toast('Oportunidade adicionada.', 'success');
        inTit.value = '';
        inCli.value = '';
        inVal.value = '0';
        inProb.value = '50';
        inPrev.value = '';
        paint();
      });
      fg.appendChild(btnAdd);
      formBox.appendChild(fg);
      wrap.appendChild(formBox);

      const board = el('div', 'ui-pipeline-board');
      PIPELINE_MAIN_ORDER.forEach(function (etapa) {
        const colLeads = leads.filter(function (L) {
          return L.etapa === etapa;
        });
        const col = el('div', 'ui-pipeline-col');
        col.classList.add('ui-pipeline-col--' + etapa);
        col.setAttribute('data-drop-etapa', etapa);
        col.addEventListener('dragover', function (e) {
          e.preventDefault();
          col.classList.add('ui-pipeline-col--drag');
        });
        col.addEventListener('dragleave', function () {
          col.classList.remove('ui-pipeline-col--drag');
        });
        col.addEventListener('drop', function (e) {
          e.preventDefault();
          col.classList.remove('ui-pipeline-col--drag');
          const id = e.dataTransfer.getData('text/plain');
          if (!id) return;
          global.MaycredData.savePipelineLead({ id: id, etapa: etapa }, vid);
          toast('Etapa atualizada.', 'success');
          paint();
        });
        const ch = el('div', 'ui-pipeline-col__head');
        ch.appendChild(el('div', 'ui-pipeline-col__name', labels[etapa] || etapa));
        ch.appendChild(
          el(
            'div',
            'ui-pipeline-col__meta',
            colLeads.length + ' · ' + formatBRL(sumVal(colLeads)),
          ),
        );
        col.appendChild(ch);
        const listEl = el('div', 'ui-pipeline-col__cards');
        colLeads.forEach(function (L) {
          const card = el('div', 'ui-pipeline-card ui-pipeline-card--' + etapa);
          card.draggable = true;
          card.setAttribute('data-lead-id', L.id);
          card.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', L.id);
            e.dataTransfer.effectAllowed = 'move';
          });
          card.addEventListener('click', function (ev) {
            ev.stopPropagation();
            openLeadModal(L);
          });
          const t0 = el('div', 'ui-pipeline-card__tit', L.titulo || '—');
          const t1 = el('div', 'ui-pipeline-card__cli', (L.cliente || '').toUpperCase());
          const t2 = el('div', 'ui-pipeline-card__vend', self.nome || '');
          const t3 = el('div', 'ui-pipeline-card__val', formatBRL(L.valorEstimado));
          const sla = pipelineSlaLine(etapa, L);
          card.appendChild(t0);
          card.appendChild(t1);
          card.appendChild(t2);
          card.appendChild(t3);
          if (L.etapa === 'fechado') {
            card.appendChild(el('div', 'ui-pipeline-card__res ui-pipeline-card__res--sim', 'Vendido'));
          } else if (L.etapa === 'perdido') {
            card.appendChild(el('div', 'ui-pipeline-card__res ui-pipeline-card__res--nao', 'Não vendido'));
          }
          if (sla) {
            card.appendChild(el('div', 'ui-pipeline-card__sla', sla));
          }
          listEl.appendChild(card);
        });
        col.appendChild(listEl);
        board.appendChild(col);
      });
      wrap.appendChild(board);

      const lost = el('div', 'ui-pipeline-lost');
      lost.appendChild(
        el(
          'div',
          'ui-pipeline-lost__head',
          labels.perdido + ' · ' + perdidos.length + ' · ' + formatBRL(sumVal(perdidos)),
        ),
      );
      const lostBody = el('div', 'ui-pipeline-lost__body');
      lostBody.setAttribute('data-drop-etapa', 'perdido');
      lostBody.addEventListener('dragover', function (e) {
        e.preventDefault();
        lostBody.classList.add('ui-pipeline-lost--drag');
      });
      lostBody.addEventListener('dragleave', function () {
        lostBody.classList.remove('ui-pipeline-lost--drag');
      });
      lostBody.addEventListener('drop', function (e) {
        e.preventDefault();
        lostBody.classList.remove('ui-pipeline-lost--drag');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        global.MaycredData.savePipelineLead({ id: id, etapa: 'perdido' }, vid);
        toast('Movido para Perdido.', 'info');
        paint();
      });
      if (!perdidos.length) {
        lostBody.appendChild(el('p', 'ui-muted ui-pipeline-lost__empty', 'Nenhuma oportunidade'));
      } else {
        perdidos.forEach(function (L) {
          const card = el('div', 'ui-pipeline-card ui-pipeline-card--perdido');
          card.draggable = true;
          card.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('text/plain', L.id);
          });
          card.addEventListener('click', function () {
            openLeadModal(L);
          });
          card.appendChild(el('div', 'ui-pipeline-card__tit', L.titulo || '—'));
          card.appendChild(el('div', 'ui-pipeline-card__cli', (L.cliente || '').toUpperCase()));
          card.appendChild(el('div', 'ui-pipeline-card__val', formatBRL(L.valorEstimado)));
          lostBody.appendChild(card);
        });
      }
      lost.appendChild(lostBody);
      wrap.appendChild(lost);
      container.appendChild(wrap);

      function formatDateBR(ymd) {
        const s = String(ymd || '').slice(0, 10);
        if (s.length < 10) return '—';
        const d = new Date(s + 'T12:00:00');
        if (Number.isNaN(d.getTime())) return s;
        return d.toLocaleDateString('pt-BR');
      }

      function openLeadModal(L) {
        const leadAg = (L.agendamentos || []).map(function (a) {
          return { ...a };
        });
        const leadAt = (L.atendimentos || []).map(function (a) {
          return { ...a };
        });
        let etapaSel = L.etapa;

        const overlay = el('div', 'ui-modal-overlay');
        const box = el('div', 'ui-modal ui-pipeline-modal ui-pipeline-modal--crm');
        const hdr = el('div', 'ui-pipeline-crm-hdr');
        const hdrTop = el('div', 'ui-pipeline-crm-hdr__row');
        const ttl = el('h3', 'ui-pipeline-crm-hdr__title', L.titulo || 'Operação');
        const bClose = el('button', 'ui-pipeline-crm-close', '×');
        bClose.type = 'button';
        bClose.setAttribute('aria-label', 'Fechar');
        hdrTop.appendChild(ttl);
        hdrTop.appendChild(bClose);
        hdr.appendChild(hdrTop);
        const sub = el('div', 'ui-pipeline-crm-hdr__sub', '');
        hdr.appendChild(sub);
        box.appendChild(hdr);

        const tabs = el('div', 'ui-pipeline-crm-tabs');
        const tabIds = ['dados', 'agenda', 'hist'];
        const tabBtn = {};
        tabIds.forEach(function (tid) {
          const b = el(
            'button',
            'ui-pipeline-crm-tab',
            tid === 'dados' ? 'Dados' : tid === 'agenda' ? 'Agendamentos' : 'Histórico',
          );
          b.type = 'button';
          b.setAttribute('data-tab', tid);
          tabBtn[tid] = b;
          tabs.appendChild(b);
        });
        box.appendChild(tabs);

        const panDados = el('div', 'ui-pipeline-crm-panel');
        const panAgenda = el('div', 'ui-pipeline-crm-panel ui-pipeline-crm-panel--hidden');
        const panHist = el('div', 'ui-pipeline-crm-panel ui-pipeline-crm-panel--hidden');

        const mTit = el('input', 'ui-input');
        mTit.type = 'text';
        mTit.value = L.titulo || '';
        const mCli = el('input', 'ui-input');
        mCli.type = 'text';
        mCli.value = L.cliente || '';
        const mVend = el('input', 'ui-input');
        mVend.type = 'text';
        mVend.readOnly = true;
        mVend.value = self.nome || '';
        const mVal = el('input', 'ui-input');
        mVal.type = 'number';
        mVal.min = '0';
        mVal.step = '0.01';
        mVal.value = String(L.valorEstimado != null ? L.valorEstimado : 0);
        const mProb = el('input', 'ui-input');
        mProb.type = 'number';
        mProb.min = '0';
        mProb.max = '100';
        mProb.value = String(L.probabilidade != null ? L.probabilidade : 50);
        const mPrev = el('input', 'ui-input');
        mPrev.type = 'date';
        mPrev.value = L.previsaoFechamento || '';

        function syncHdr() {
          ttl.textContent = String(mTit.value || '').trim() || 'Operação';
          sub.textContent =
            (String(mCli.value || '').trim() || 'Cliente').toUpperCase() + ' · ' + (self.nome || 'Correspondente');
        }
        mTit.addEventListener('input', syncHdr);
        mCli.addEventListener('input', syncHdr);
        syncHdr();

        function mf(lb, node) {
          const f = el('div', 'ui-field');
          f.appendChild(el('span', 'ui-field__label', lb));
          f.appendChild(node);
          return f;
        }
        const grid = el('div', 'ui-form-grid ui-form-grid--2');
        grid.appendChild(mf('Título', mTit));
        grid.appendChild(mf('Cliente', mCli));
        grid.appendChild(mf('Correspondente', mVend));
        grid.appendChild(mf('Valor estimado (R$)', mVal));
        grid.appendChild(mf('Probabilidade %', mProb));
        grid.appendChild(mf('Previsão de fechamento', mPrev));
        panDados.appendChild(grid);

        const labRes = el('div', 'ui-field__label', 'Vendeu? (resultado da operação)');
        labRes.style.marginTop = '0.75rem';
        panDados.appendChild(labRes);
        const selResultado = el('select', 'ui-select ui-pipeline-resultado-sel');
        const oAnd = el('option', null, 'Ainda em andamento no funil');
        oAnd.value = 'andamento';
        const oVend = el('option', null, 'Sim — vendido / liberado');
        oVend.value = 'fechado';
        const oNao = el('option', null, 'Não vendido');
        oNao.value = 'perdido';
        selResultado.appendChild(oAnd);
        selResultado.appendChild(oVend);
        selResultado.appendChild(oNao);
        function syncResultadoSel() {
          if (etapaSel === 'fechado') selResultado.value = 'fechado';
          else if (etapaSel === 'perdido') selResultado.value = 'perdido';
          else selResultado.value = 'andamento';
        }
        selResultado.addEventListener('change', function () {
          const v = selResultado.value;
          if (v === 'fechado') etapaSel = 'fechado';
          else if (v === 'perdido') etapaSel = 'perdido';
          else if (etapaSel === 'fechado' || etapaSel === 'perdido') etapaSel = 'diagnostico';
          paintChips();
          syncResultadoSel();
        });
        panDados.appendChild(selResultado);
        syncResultadoSel();

        const labFunil = el('div', 'ui-field__label', 'Etapa no funil (enquanto em andamento)');
        labFunil.style.marginTop = '0.75rem';
        panDados.appendChild(labFunil);
        const chips = el('div', 'ui-pipeline-etapa-chips');
        const chipKeys = ['prospeccao', 'diagnostico', 'proposta', 'negociacao', 'fechado', 'perdido'];
        const chipEls = {};
        function paintChips() {
          chipKeys.forEach(function (k) {
            const c = chipEls[k];
            if (!c) return;
            c.classList.toggle('ui-pipeline-etapa-chip--active', k === etapaSel);
          });
          syncResultadoSel();
        }
        chipKeys.forEach(function (k) {
          const c = el('button', 'ui-pipeline-etapa-chip', labels[k] || k);
          c.type = 'button';
          chipEls[k] = c;
          c.addEventListener('click', function () {
            etapaSel = /** @type {typeof etapaSel} */ (k);
            paintChips();
          });
          chips.appendChild(c);
        });
        paintChips();
        panDados.appendChild(chips);

        const agendaListHost = el('div', 'ui-pipeline-crm-list');
        const agForm = el('div', 'ui-pipeline-crm-inline');
        const agD = el('input', 'ui-input');
        agD.type = 'date';
        agD.value = ymdTodayLocal();
        const agH = el('input', 'ui-input');
        agH.type = 'time';
        const agTxt = el('input', 'ui-input');
        agTxt.type = 'text';
        agTxt.placeholder = 'Ex. retorno de documentação, assinatura no banco';
        const agAdd = el('button', 'ui-btn ui-btn--primary', 'Adicionar agendamento');
        agAdd.type = 'button';
        agForm.appendChild(agD);
        agForm.appendChild(agH);
        agForm.appendChild(agTxt);
        agForm.appendChild(agAdd);
        panAgenda.appendChild(agForm);
        panAgenda.appendChild(agendaListHost);

        function sortAg(a, b) {
          const da = a.data + ' ' + (a.hora || '00:00');
          const db = b.data + ' ' + (b.hora || '00:00');
          return da.localeCompare(db);
        }
        function paintAgenda() {
          clear(agendaListHost);
          const sorted = leadAg.slice().sort(sortAg);
          if (!sorted.length) {
            agendaListHost.appendChild(el('p', 'ui-muted', 'Nenhum agendamento. Inclua data, hora (opcional) e o que será feito.'));
            return;
          }
          sorted.forEach(function (ag) {
            const row = el('div', 'ui-pipeline-crm-line');
            const left = el('div', 'ui-pipeline-crm-line__main');
            left.appendChild(
              el('strong', 'ui-pipeline-crm-line__date', formatDateBR(ag.data) + (ag.hora ? ' · ' + ag.hora : '')),
            );
            left.appendChild(el('span', 'ui-pipeline-crm-line__txt', ag.descricao));
            const rm = el('button', 'ui-btn ui-btn--ghost ui-btn--sm', 'Remover');
            rm.type = 'button';
            rm.addEventListener('click', function () {
              const ix = leadAg.findIndex(function (x) {
                return x.id === ag.id;
              });
              if (ix >= 0) leadAg.splice(ix, 1);
              paintAgenda();
              paintHist();
            });
            row.appendChild(left);
            row.appendChild(rm);
            agendaListHost.appendChild(row);
          });
        }
        agAdd.addEventListener('click', function () {
          const desc = String(agTxt.value || '').trim();
          const d = String(agD.value || '').slice(0, 10);
          if (!desc || d.length < 10) {
            toast('Informe data e descrição do agendamento.', 'error');
            return;
          }
          leadAg.push({
            id: global.MaycredData.newId('pag'),
            data: d,
            hora: String(agH.value || '').trim().slice(0, 5),
            descricao: desc,
            createdAt: new Date().toISOString(),
          });
          agTxt.value = '';
          paintAgenda();
          paintHist();
          toast('Agendamento incluído (salve para gravar).', 'info');
        });
        paintAgenda();

        const histIntro = el(
          'p',
          'ui-muted ui-pipeline-hist-intro',
          'Esta aba reúne agendamentos (retornos, datas) e registros de contato. Os dois são salvos ao clicar em Salvar alterações.',
        );
        panHist.appendChild(histIntro);
        const histTop = el('div', 'ui-pipeline-hist-top');
        const histCount = el('span', 'ui-pipeline-hist-count', '');
        const btnReg = el('button', 'ui-btn ui-btn--primary', '+ Registrar contato');
        btnReg.type = 'button';
        histTop.appendChild(histCount);
        histTop.appendChild(btnReg);
        panHist.appendChild(histTop);
        const histFormWrap = el('div', 'ui-pipeline-hist-formwrap ui-pipeline-crm-panel--hidden');
        const atD = el('input', 'ui-input');
        atD.type = 'date';
        atD.value = ymdTodayLocal();
        const atTx = el('textarea', 'ui-input ui-textarea ui-pipeline-hist-ta');
        atTx.rows = 3;
        atTx.placeholder = 'O que foi combinado, pendências, canal (telefone, loja)…';
        const atRow = el('div', 'ui-pipeline-hist-formbtns');
        const atSave = el('button', 'ui-btn ui-btn--primary', 'Salvar atendimento');
        atSave.type = 'button';
        const atCancel = el('button', 'ui-btn ui-btn--secondary', 'Cancelar');
        atCancel.type = 'button';
        atRow.appendChild(atCancel);
        atRow.appendChild(atSave);
        histFormWrap.appendChild(mf('Data do contato', atD));
        histFormWrap.appendChild(mf('Registro', atTx));
        histFormWrap.appendChild(atRow);
        panHist.appendChild(histFormWrap);
        const histList = el('div', 'ui-pipeline-crm-list');
        panHist.appendChild(histList);

        function paintHistCount() {
          const n = leadAg.length + leadAt.length;
          histCount.textContent =
            n + ' registro' + (n === 1 ? '' : 's') + ' (agendamentos + contatos)';
        }
        function paintHist() {
          clear(histList);
          paintHistCount();
          const merged = [];
          leadAg.forEach(function (ag) {
            merged.push({
              kind: 'ag',
              ref: ag,
              sortKey: String(ag.data || '') + ' ' + (ag.hora || '00:00') + ' ' + String(ag.id || ''),
            });
          });
          leadAt.forEach(function (at) {
            merged.push({
              kind: 'at',
              ref: at,
              sortKey: String(at.data || '') + ' ' + String(at.createdAt || '') + ' ' + String(at.id || ''),
            });
          });
          merged.sort(function (a, b) {
            return b.sortKey.localeCompare(a.sortKey);
          });
          if (!merged.length) {
            histList.appendChild(
              el('p', 'ui-muted ui-pipeline-hist-empty', 'Nenhum agendamento nem contato ainda.'),
            );
            histList.appendChild(
              el(
                'p',
                'ui-muted ui-pipeline-hist-empty2',
                'Use a aba Agendamentos ou o botão + Registrar contato acima.',
              ),
            );
            return;
          }
          merged.forEach(function (row) {
            if (row.kind === 'ag') {
              const ag = row.ref;
              const line = el('div', 'ui-pipeline-crm-line');
              const left = el('div', 'ui-pipeline-crm-line__main');
              const tag = el('span', 'ui-pipeline-crm-tag', 'Agendamento');
              const head = el('div', 'ui-pipeline-crm-line__headrow');
              head.appendChild(tag);
              head.appendChild(
                el(
                  'strong',
                  'ui-pipeline-crm-line__date',
                  formatDateBR(ag.data) + (ag.hora ? ' · ' + ag.hora : ''),
                ),
              );
              left.appendChild(head);
              left.appendChild(el('span', 'ui-pipeline-crm-line__txt', ag.descricao));
              const rm = el('button', 'ui-btn ui-btn--ghost ui-btn--sm', 'Remover');
              rm.type = 'button';
              rm.addEventListener('click', function () {
                const ix = leadAg.findIndex(function (x) {
                  return x.id === ag.id;
                });
                if (ix >= 0) leadAg.splice(ix, 1);
                paintAgenda();
                paintHist();
              });
              line.appendChild(left);
              line.appendChild(rm);
              histList.appendChild(line);
            } else {
              const at = row.ref;
              const line = el('div', 'ui-pipeline-crm-line');
              const left = el('div', 'ui-pipeline-crm-line__main');
              const tag = el('span', 'ui-pipeline-crm-tag ui-pipeline-crm-tag--contato', 'Contato');
              const head = el('div', 'ui-pipeline-crm-line__headrow');
              head.appendChild(tag);
              head.appendChild(el('strong', 'ui-pipeline-crm-line__date', formatDateBR(at.data)));
              left.appendChild(head);
              left.appendChild(el('span', 'ui-pipeline-crm-line__txt', at.texto));
              const rm = el('button', 'ui-btn ui-btn--ghost ui-btn--sm', 'Excluir');
              rm.type = 'button';
              rm.addEventListener('click', function () {
                const ix = leadAt.findIndex(function (x) {
                  return x.id === at.id;
                });
                if (ix >= 0) leadAt.splice(ix, 1);
                paintHist();
              });
              line.appendChild(left);
              line.appendChild(rm);
              histList.appendChild(line);
            }
          });
        }
        btnReg.addEventListener('click', function () {
          histFormWrap.classList.remove('ui-pipeline-crm-panel--hidden');
          atD.value = ymdTodayLocal();
          atTx.value = '';
        });
        atCancel.addEventListener('click', function () {
          histFormWrap.classList.add('ui-pipeline-crm-panel--hidden');
        });
        atSave.addEventListener('click', function () {
          const tx = String(atTx.value || '').trim();
          const d = String(atD.value || '').slice(0, 10);
          if (!tx || d.length < 10) {
            toast('Preencha data e o registro do atendimento.', 'error');
            return;
          }
          leadAt.push({
            id: global.MaycredData.newId('pat'),
            data: d,
            texto: tx,
            createdAt: new Date().toISOString(),
          });
          atTx.value = '';
          histFormWrap.classList.add('ui-pipeline-crm-panel--hidden');
          paintHist();
          toast('Contato incluído no histórico (salve para gravar).', 'info');
        });
        paintHist();

        function setTab(tid) {
          panDados.classList.toggle('ui-pipeline-crm-panel--hidden', tid !== 'dados');
          panAgenda.classList.toggle('ui-pipeline-crm-panel--hidden', tid !== 'agenda');
          panHist.classList.toggle('ui-pipeline-crm-panel--hidden', tid !== 'hist');
          tabIds.forEach(function (t) {
            tabBtn[t].classList.toggle('ui-pipeline-crm-tab--active', t === tid);
          });
          if (tid === 'hist') paintHist();
        }
        tabIds.forEach(function (tid) {
          tabBtn[tid].addEventListener('click', function () {
            setTab(tid);
          });
        });
        setTab('dados');

        box.appendChild(panDados);
        box.appendChild(panAgenda);
        box.appendChild(panHist);

        const actions = el('div', 'ui-modal__actions ui-pipeline-modal__actions ui-pipeline-crm-actions');
        const bDel = el('button', 'ui-btn ui-btn--danger ui-btn--outline', 'Remover');
        bDel.type = 'button';
        const bCancel = el('button', 'ui-btn ui-btn--secondary', 'Cancelar');
        bCancel.type = 'button';
        const bOk = el('button', 'ui-btn ui-btn--primary', 'Salvar alterações');
        bOk.type = 'button';
        function close() {
          overlay.remove();
        }
        bClose.addEventListener('click', close);
        bCancel.addEventListener('click', close);
        overlay.addEventListener('click', function (e) {
          if (e.target === overlay) close();
        });
        bDel.addEventListener('click', function () {
          if (!global.confirm('Remover esta operação do pipeline?')) return;
          global.MaycredData.removePipelineLead(L.id, vid);
          toast('Removida.', 'info');
          close();
          paint();
        });
        bOk.addEventListener('click', function () {
          const vlr = parseFloat(mVal.value);
          const prb = parseInt(mProb.value, 10);
          global.MaycredData.savePipelineLead(
            {
              id: L.id,
              titulo: String(mTit.value || '').trim(),
              cliente: String(mCli.value || '').trim(),
              valorEstimado: Number.isFinite(vlr) ? Math.max(0, vlr) : 0,
              probabilidade: Number.isFinite(prb) ? prb : 50,
              previsaoFechamento: String(mPrev.value || '').slice(0, 10),
              etapa: etapaSel,
              agendamentos: leadAg,
              atendimentos: leadAt,
            },
            vid,
          );
          toast('Alterações salvas.', 'success');
          close();
          paint();
        });
        actions.appendChild(bDel);
        actions.appendChild(bCancel);
        actions.appendChild(bOk);
        box.appendChild(actions);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
      }
    }

    paint();
  }

  function paint(container, tela) {
    const vid = global.MaycredAuth.getVendedoraIdOperacional && global.MaycredAuth.getVendedoraIdOperacional();
    if (!vid) {
      clear(container);
      container.appendChild(
        el(
          'p',
          'ui-muted',
          'Cadastre pelo menos um correspondente em Configurações. Se você é gestor, escolha o correspondente no cabeçalho.',
        ),
      );
      return;
    }
    switch (tela) {
      case 'vendPipeline':
        renderPipeline(container);
        break;
      case 'vendClientes':
        renderClientes(container);
        break;
      case 'vendDesempenho':
      default:
        renderDesempenho(container);
    }
  }

  global.MaycredVendUI = {
    paint: paint,
    TELAS: ['vendDesempenho', 'vendPipeline', 'vendClientes'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
