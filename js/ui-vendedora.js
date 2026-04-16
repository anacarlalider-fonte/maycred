/**
 * Área da vendedora (perfil Venda): desempenho, pipeline, clientes, propostas.
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

  function propostaDuplicadaVend(st, op, excludeId, vid) {
    const cpf = onlyDigits(op.clienteCpf || '');
    if (cpf.length !== 11) return false;
    const mesRef = op.data && String(op.data).length >= 7 ? String(op.data).slice(0, 7) : '';
    if (!mesRef) return false;
    const banco = String(op.bancoParceiro || 'Outros');
    return st.operacoes.some(function (x) {
      if (excludeId && x.id === excludeId) return false;
      if (String(x.vendedoraId) !== String(vid)) return false;
      if (!x.data || String(x.data).slice(0, 7) !== mesRef) return false;
      if (String(x.bancoParceiro || 'Outros') !== banco) return false;
      return onlyDigits(x.clienteCpf || '') === cpf;
    });
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

  function renderPropostas(container) {
    const vid = global.MaycredAuth.getVendedoraIdOperacional();
    if (!vid) {
      container.appendChild(el('p', 'ui-muted', 'Sessão inválida.'));
      return;
    }

    const MO = global.MaycredOperacoes;
    const Cal = global.MaycredCalendar;

    let editingId = null;
    /** '' = usar mês ativo do app; '__todos__' = todas as propostas suas */
    let filtroMesPropostas = '';

    function mesDaOperacao(o) {
      if (o.mes && String(o.mes).length >= 7) return String(o.mes).slice(0, 7);
      if (o.data && String(o.data).length >= 7) return String(o.data).slice(0, 7);
      return '';
    }

    function minhasOps(st) {
      let list = st.operacoes.filter(function (o) {
        return String(o.vendedoraId) === String(vid);
      });
      if (filtroMesPropostas !== '__todos__') {
        const m = filtroMesPropostas || st.config.mesAtual || '';
        list = list.filter(function (o) {
          return mesDaOperacao(o) === m;
        });
      }
      return list.sort(function (a, b) {
        return String(b.data || '').localeCompare(String(a.data || ''));
      });
    }

    function paint() {
      clear(container);
      const st = global.MaycredData.getState();
      const wrap = el('div', 'ui-section ui-vend-mod');
      wrap.appendChild(el('h2', 'ui-section__title', 'Minhas propostas'));
      wrap.appendChild(
        el(
          'p',
          'ui-muted',
          'Somente as suas propostas. Use a tabela correta para contar na meta. Valores de comissão não são exibidos aqui.',
        ),
      );

      const top = el('div', 'ui-flex-gap ui-flex-gap--wrap');
      const btnNova = el('button', 'ui-btn ui-btn--primary', '+ Nova proposta');
      btnNova.type = 'button';
      btnNova.addEventListener('click', function () {
        editingId = null;
        paint();
      });
      top.appendChild(btnNova);

      const fMes = el('div', 'ui-field ui-field--inline');
      fMes.appendChild(el('span', 'ui-field__label', 'Listar'));
      const selMesF = el('select', 'ui-select');
      const optMesAtivo = el('option', null, 'Mês ativo (' + (st.config.mesAtual || '—') + ')');
      optMesAtivo.value = '';
      const optTodos = el('option', null, 'Todos os meses');
      optTodos.value = '__todos__';
      selMesF.appendChild(optMesAtivo);
      selMesF.appendChild(optTodos);
      selMesF.value = filtroMesPropostas;
      selMesF.addEventListener('change', function () {
        filtroMesPropostas = selMesF.value;
        paint();
      });
      fMes.appendChild(selMesF);
      top.appendChild(fMes);
      wrap.appendChild(top);

      const ops = minhasOps(st);
      const tw = el('div', 'ui-table-wrap');
      const tbl = el('table', 'ui-table');
      const thead = el('thead');
      const hr = el('tr');
      ['Data', 'Cliente', 'Tipo', 'Status', 'Valor financiado', ''].forEach(function (h) {
        hr.appendChild(el('th', null, h));
      });
      thead.appendChild(hr);
      tbl.appendChild(thead);
      const tb = el('tbody');
      if (!ops.length) {
        const tr = el('tr');
        const td = el('td', null, 'Nenhuma proposta sua ainda.');
        td.colSpan = 6;
        tr.appendChild(td);
        tb.appendChild(tr);
      } else {
        ops.forEach(function (o) {
          const tr = el('tr');
          tr.appendChild(el('td', null, o.data || '—'));
          tr.appendChild(el('td', null, o.clienteNome || '—'));
          tr.appendChild(el('td', null, MO.TIPO_LABEL[o.tipoOperacao] || o.tipoOperacao));
          const stc = el('td', null);
          const sp = el('span', MO.classeBadgeStatus(o.status), MO.labelStatus(o.tipoOperacao, o.status));
          stc.appendChild(sp);
          tr.appendChild(stc);
          tr.appendChild(el('td', null, formatBRL(o.valorContrato)));
          const ta = el('td', null);
          const b1 = el('button', 'ui-btn ui-btn--ghost ui-btn--sm', 'Editar');
          b1.type = 'button';
          b1.addEventListener('click', function () {
            editingId = o.id;
            paint();
          });
          ta.appendChild(b1);
          const next = MO.proximoStatusNoFluxo(o.tipoOperacao, o.status);
          if (next && o.status !== 'CANCELADO') {
            const b2 = el('button', 'ui-btn ui-btn--ghost ui-btn--sm', 'Avançar status');
            b2.type = 'button';
            b2.addEventListener('click', function () {
              if (
                global.MaycredData.updateOperacaoSeDono(o.id, { status: next }, vid)
              ) {
                toast('Status atualizado.', 'success');
                paint();
              } else toast('Não foi possível atualizar.', 'error');
            });
            ta.appendChild(b2);
          }
          const b3 = el('button', 'ui-btn ui-btn--danger ui-btn--sm', 'Excluir');
          b3.type = 'button';
          b3.addEventListener('click', function () {
            if (!global.confirm('Excluir esta proposta?')) return;
            if (global.MaycredData.removeOperacaoSeDono(o.id, vid)) {
              toast('Proposta excluída.', 'info');
              if (editingId === o.id) editingId = null;
              paint();
            } else toast('Não foi possível excluir.', 'error');
          });
          ta.appendChild(b3);
          tr.appendChild(ta);
          tb.appendChild(tr);
        });
      }
      tbl.appendChild(tb);
      tw.appendChild(tbl);
      wrap.appendChild(tw);

      const opEdit = editingId
        ? st.operacoes.find(function (x) {
            return x.id === editingId && String(x.vendedoraId) === String(vid);
          })
        : null;
      if (editingId && !opEdit) {
        editingId = null;
        paint();
        return;
      }

      const formHost = el('div', 'ui-config-block ui-vend-prop-form');
      formHost.appendChild(
        el('h4', 'ui-config-block__title', opEdit ? 'Editar proposta' : 'Registrar proposta'),
      );

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

      const s1 = sec('Dados da operação');
      const g1 = fieldGrid(s1);

      const fData = el('div', 'ui-field');
      fData.appendChild(el('span', 'ui-field__label', 'Data da operação *'));
      const inpData = el('input', 'ui-input');
      inpData.type = 'date';
      inpData.required = true;
      inpData.value = opEdit ? opEdit.data : Cal.hojeLocal();
      fData.appendChild(inpData);
      g1.appendChild(fData);

      const fTipo = el('div', 'ui-field');
      fTipo.appendChild(el('span', 'ui-field__label', 'Tipo *'));
      const selTipo = el('select', 'ui-select');
      MO.TIPOS.forEach(function (t) {
        const o = el('option', null, MO.TIPO_LABEL[t]);
        o.value = t;
        selTipo.appendChild(o);
      });
      if (opEdit) selTipo.value = opEdit.tipoOperacao;
      fTipo.appendChild(selTipo);
      g1.appendChild(fTipo);

      const fBanco = el('div', 'ui-field');
      fBanco.appendChild(el('span', 'ui-field__label', 'Banco parceiro *'));
      const selBanco = el('select', 'ui-select');
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
      if (opEdit && opEdit.bancoParceiro) selBanco.value = opEdit.bancoParceiro;
      fBanco.appendChild(selBanco);
      g1.appendChild(fBanco);

      const fProm = el('div', 'ui-field');
      fProm.appendChild(el('span', 'ui-field__label', 'Promotora *'));
      const selProm = el('select', 'ui-select');
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
        else if (selProm.options.length) selProm.selectedIndex = 0;
      } else if (selProm.options.length) selProm.selectedIndex = 0;
      fProm.appendChild(selProm);
      g1.appendChild(fProm);

      const fTab = el('div', 'ui-field');
      fTab.style.gridColumn = '1 / -1';
      fTab.appendChild(el('span', 'ui-field__label', 'Tabela (para contar na meta)'));
      const selTab = el('select', 'ui-select');
      const opt0 = el('option', null, '— Sem tabela —');
      opt0.value = '';
      selTab.appendChild(opt0);
      function refillTab() {
        while (selTab.children.length > 1) selTab.removeChild(selTab.lastChild);
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
          const conv = t.convenio || global.MaycredData.formatConvenioTabela(t.nome, t.prazo);
          const o = el('option', null, conv);
          o.value = t.id;
          selTab.appendChild(o);
        });
        if (opEdit && opEdit.tabelaId) {
          const ex = Array.prototype.some.call(selTab.options, function (o) {
            return o.value === opEdit.tabelaId;
          });
          if (ex) selTab.value = opEdit.tabelaId;
          else selTab.value = '';
        }
      }
      refillTab();
      fTab.appendChild(selTab);
      g1.appendChild(fTab);

      const banner = el(
        'div',
        'ui-lanc-meta-tabela-banner',
        'Sem tabela válida — não entra no cálculo da sua meta.',
      );
      banner.style.display = 'none';
      banner.style.gridColumn = '1 / -1';
      g1.appendChild(banner);

      const fConv = el('div', 'ui-field');
      fConv.style.gridColumn = '1 / -1';
      fConv.appendChild(el('span', 'ui-field__label', 'Convênio *'));
      const inpConv = el('input', 'ui-input');
      inpConv.required = true;
      inpConv.value = opEdit ? opEdit.convenio || '' : '';
      fConv.appendChild(inpConv);
      g1.appendChild(fConv);

      const fNp = el('div', 'ui-field');
      fNp.appendChild(el('span', 'ui-field__label', 'Nº proposta'));
      const inpNp = el('input', 'ui-input');
      inpNp.value = opEdit ? opEdit.numeroProposta || '' : '';
      fNp.appendChild(inpNp);
      g1.appendChild(fNp);

      const fNc = el('div', 'ui-field');
      fNc.appendChild(el('span', 'ui-field__label', 'Nº contrato'));
      const inpNc = el('input', 'ui-input');
      inpNc.value = opEdit ? opEdit.numeroContrato || '' : '';
      fNc.appendChild(inpNc);
      g1.appendChild(fNc);

      const fOrig = el('div', 'ui-field');
      fOrig.appendChild(el('span', 'ui-field__label', 'Origem'));
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

      const s2 = sec('Cliente');
      const g2 = fieldGrid(s2);

      const fPick = el('div', 'ui-field');
      fPick.style.gridColumn = '1 / -1';
      fPick.appendChild(el('span', 'ui-field__label', 'Usar cadastro'));
      const selCli = el('select', 'ui-select');
      selCli.appendChild(el('option', null, '— Digitar manualmente —'));
      selCli.options[0].value = '';
      global.MaycredData.listClientes().forEach(function (c) {
        if (c.ativo === false) return;
        const o = el('option', null, c.nome + ' · ' + formatCpfInput(c.cpf));
        o.value = c.id;
        selCli.appendChild(o);
      });
      if (opEdit && opEdit.clienteId) {
        const hasC = Array.prototype.some.call(selCli.options, function (o) {
          return o.value === opEdit.clienteId;
        });
        if (hasC) selCli.value = opEdit.clienteId;
      }
      fPick.appendChild(selCli);
      g2.appendChild(fPick);

      const fNome = el('div', 'ui-field');
      fNome.style.gridColumn = '1 / -1';
      fNome.appendChild(el('span', 'ui-field__label', 'Nome *'));
      const inpNome = el('input', 'ui-input');
      inpNome.required = true;
      inpNome.value = opEdit ? opEdit.clienteNome || '' : '';
      fNome.appendChild(inpNome);
      g2.appendChild(fNome);

      const fCpf = el('div', 'ui-field');
      fCpf.appendChild(el('span', 'ui-field__label', 'CPF *'));
      const inpCpf = el('input', 'ui-input');
      inpCpf.required = true;
      inpCpf.value = opEdit ? formatCpfInput(opEdit.clienteCpf || '') : '';
      inpCpf.addEventListener('input', function () {
        inpCpf.value = formatCpfInput(onlyDigits(inpCpf.value));
      });
      fCpf.appendChild(inpCpf);
      g2.appendChild(fCpf);

      const fBen = el('div', 'ui-field');
      fBen.appendChild(el('span', 'ui-field__label', 'Benefício INSS *'));
      const inpBen = el('input', 'ui-input');
      inpBen.required = true;
      inpBen.value = opEdit ? opEdit.beneficioInss || '' : '';
      fBen.appendChild(inpBen);
      g2.appendChild(fBen);

      const fEsp = el('div', 'ui-field');
      fEsp.appendChild(el('span', 'ui-field__label', 'Espécie *'));
      const selEsp = el('select', 'ui-select');
      ESPECIES_BENEFICIO.forEach(function (E) {
        const o = el('option', null, E.t);
        o.value = E.v;
        selEsp.appendChild(o);
      });
      if (opEdit && opEdit.especieBeneficio) selEsp.value = opEdit.especieBeneficio;
      fEsp.appendChild(selEsp);
      g2.appendChild(fEsp);

      const fUf = el('div', 'ui-field');
      fUf.appendChild(el('span', 'ui-field__label', 'UF'));
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
      fSal.appendChild(el('span', 'ui-field__label', 'Benefício bruto (R$)'));
      const inpSal = el('input', 'ui-input');
      inpSal.type = 'number';
      inpSal.step = '0.01';
      inpSal.value =
        opEdit && opEdit.salarioBeneficioBruto != null
          ? String(opEdit.salarioBeneficioBruto)
          : '';
      fSal.appendChild(inpSal);
      g2.appendChild(fSal);

      const fMar = el('div', 'ui-field');
      fMar.appendChild(el('span', 'ui-field__label', 'Margem (R$)'));
      const inpMar = el('input', 'ui-input');
      inpMar.type = 'number';
      inpMar.step = '0.01';
      inpMar.value =
        opEdit && opEdit.margemDisponivel != null ? String(opEdit.margemDisponivel) : '';
      fMar.appendChild(inpMar);
      g2.appendChild(fMar);

      selCli.addEventListener('change', function () {
        const id = selCli.value;
        if (!id) return;
        const c = global.MaycredData.getClienteById(id);
        if (c) {
          inpNome.value = c.nome;
          inpCpf.value = formatCpfInput(c.cpf);
        }
      });

      form.appendChild(s2);

      const s3 = sec('Financeiro');
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
      fPrazo.appendChild(el('span', 'ui-field__label', 'Prazo *'));
      const inpPrazo = el('input', 'ui-input');
      inpPrazo.type = 'number';
      inpPrazo.min = '1';
      inpPrazo.required = true;
      inpPrazo.value = opEdit && opEdit.prazoParcelas ? String(opEdit.prazoParcelas) : '';
      fPrazo.appendChild(inpPrazo);
      g3.appendChild(fPrazo);

      const fTaxa = el('div', 'ui-field');
      fTaxa.appendChild(el('span', 'ui-field__label', 'Taxa % a.m. *'));
      const inpTaxa = el('input', 'ui-input');
      inpTaxa.type = 'number';
      inpTaxa.step = '0.01';
      inpTaxa.required = true;
      inpTaxa.value =
        opEdit && (opEdit.taxaJurosMes != null || opEdit.taxaJurosMes === 0)
          ? String(opEdit.taxaJurosMes)
          : '';
      fTaxa.appendChild(inpTaxa);
      g3.appendChild(fTaxa);

      const fVp = el('div', 'ui-field');
      fVp.appendChild(el('span', 'ui-field__label', 'Parcela (R$)'));
      const inpVp = el('input', 'ui-input ui-input--readonly');
      inpVp.readOnly = true;
      fVp.appendChild(inpVp);
      g3.appendChild(fVp);

      const fVl = el('div', 'ui-field');
      fVl.appendChild(el('span', 'ui-field__label', 'Liberado (R$)'));
      const inpVl = el('input', 'ui-input');
      inpVl.type = 'number';
      inpVl.step = '0.01';
      inpVl.value =
        opEdit && opEdit.valorLiberadoCliente != null ? String(opEdit.valorLiberadoCliente) : '';
      fVl.appendChild(inpVl);
      g3.appendChild(fVl);

      const fPort = el('div', 'ui-field ui-lanc-port-extra');
      fPort.style.gridColumn = '1 / -1';
      fPort.appendChild(el('span', 'ui-field__label', 'PORT / PORT+REFIN'));
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
      gPort.appendChild(selBo);
      gPort.appendChild(inpSd);
      fPort.appendChild(gPort);
      g3.appendChild(fPort);

      const fRefin = el('div', 'ui-field ui-lanc-refin-extra');
      fRefin.style.gridColumn = '1 / -1';
      fRefin.appendChild(el('span', 'ui-field__label', 'Refinanciamento (R$)'));
      const inpRefin = el('input', 'ui-input');
      inpRefin.type = 'number';
      inpRefin.step = '0.01';
      fRefin.appendChild(inpRefin);
      g3.appendChild(fRefin);

      if (opEdit) {
        if (opEdit.bancoOrigem) selBo.value = opEdit.bancoOrigem;
        inpSd.value =
          opEdit.saldoDevedorPortado != null ? String(opEdit.saldoDevedorPortado) : '';
        inpRefin.value =
          opEdit.valorRefinanciamento != null ? String(opEdit.valorRefinanciamento) : '';
      }

      const boxHint = el('div', 'ui-lanc-analise-live');
      form.appendChild(s3);

      function syncPort() {
        const t = selTipo.value;
        const port = t === 'PORT' || t === 'PORT_REFIN';
        fPort.style.display = port ? '' : 'none';
        fRefin.style.display = t === 'PORT_REFIN' ? '' : 'none';
        selBo.required = port;
        inpSd.required = port;
        inpRefin.required = t === 'PORT_REFIN';
      }

      function updateMetaBanner() {
        const vf = parseFloat(inpVal.value);
        const tipo = selTipo.value;
        const opLike = { tipoOperacao: tipo, tabelaId: '', comissaoTabela: undefined };
        if (selTab.value) {
          opLike.tabelaId = selTab.value;
          const tab = (st.tabelas || []).find(function (x) {
            return x.id === selTab.value;
          });
          if (tab && tab.comissao != null) opLike.comissaoTabela = Number(tab.comissao);
        } else if (opEdit && opEdit.tabelaId) {
          opLike.tabelaId = String(opEdit.tabelaId);
          if (opEdit.comissaoTabela != null) opLike.comissaoTabela = Number(opEdit.comissaoTabela);
        }
        const okMeta = MO.propostaContaRentabilidadeMeta(opLike);
        banner.style.display = okMeta ? 'none' : '';
        const fluxo = MO.fluxoDoTipo(tipo);
        const imp = MO.impactoMetaPorStatus(fluxo, selStatus.value);
        clear(boxHint);
        if (okMeta) {
          boxHint.appendChild(
            el(
              'div',
              'ui-lanc-analise-live__line',
              'Conta na meta: sim — impacto atual: ' + (imp.analise ? 'análise' : imp.pago ? 'pago' : '—'),
            ),
          );
          boxHint.appendChild(
            el(
              'div',
              'ui-lanc-analise-live__sub',
              'Valores em reais de comissão não são exibidos nesta tela.',
            ),
          );
        } else {
          boxHint.appendChild(
            el('div', 'ui-lanc-analise-live__line--warn', 'Não conta na meta sem tabela válida.'),
          );
        }
        const pr = parseInt(inpPrazo.value, 10);
        if (!Number.isNaN(vf) && vf > 0 && !Number.isNaN(pr) && pr > 0) {
          inpVp.value = String(Math.round((vf / pr) * 100) / 100);
        } else inpVp.value = '';
      }

      const s4 = sec('Status');
      const g4 = fieldGrid(s4);
      const fStat = el('div', 'ui-field');
      fStat.appendChild(el('span', 'ui-field__label', 'Status *'));
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
        else selStatus.value = MO.statusPadraoParaTipo(tipo);
      }
      refillStatus();
      fStat.appendChild(selStatus);
      g4.appendChild(fStat);

      const fAver = el('div', 'ui-field');
      fAver.appendChild(el('span', 'ui-field__label', 'Averbação'));
      const inpAver = el('input', 'ui-input');
      inpAver.type = 'date';
      inpAver.value = opEdit ? opEdit.dataAverbacao || '' : '';
      fAver.appendChild(inpAver);
      g4.appendChild(fAver);

      const fPag = el('div', 'ui-field');
      fPag.appendChild(el('span', 'ui-field__label', 'Pagamento'));
      const inpPag = el('input', 'ui-input');
      inpPag.type = 'date';
      inpPag.value = opEdit ? opEdit.dataPagamento || '' : '';
      fPag.appendChild(inpPag);
      g4.appendChild(fPag);

      const fObs = el('div', 'ui-field');
      fObs.style.gridColumn = '1 / -1';
      fObs.appendChild(el('span', 'ui-field__label', 'Obs.'));
      const txObs = el('textarea', 'ui-input ui-textarea');
      txObs.rows = 2;
      txObs.value = opEdit ? opEdit.obs || '' : '';
      fObs.appendChild(txObs);
      g4.appendChild(fObs);

      form.appendChild(s4);
      s3.appendChild(boxHint);

      selTipo.addEventListener('change', function () {
        if (!editingId) refillStatus();
        syncPort();
        refillTab();
        updateMetaBanner();
      });
      selStatus.addEventListener('change', updateMetaBanner);
      selBanco.addEventListener('change', function () {
        refillTab();
        updateMetaBanner();
      });
      selProm.addEventListener('change', function () {
        refillTab();
        updateMetaBanner();
      });
      selTab.addEventListener('change', function () {
        const id = selTab.value;
        if (id) {
          const t = (st.tabelas || []).find(function (x) {
            return x.id === id;
          });
          if (t) {
            inpConv.value = t.convenio || global.MaycredData.formatConvenioTabela(t.nome, t.prazo);
            inpPrazo.value = String(t.prazo);
            inpTaxa.value = String(t.taxa);
          }
        }
        updateMetaBanner();
      });
      inpVal.addEventListener('input', updateMetaBanner);
      inpPrazo.addEventListener('input', updateMetaBanner);

      syncPort();
      updateMetaBanner();

      const tact = el('div', 'ui-flex-gap');
      const btnSub = el('button', 'ui-btn ui-btn--primary', opEdit ? 'Salvar' : 'Registrar');
      btnSub.type = 'submit';
      const btnCancel = el('button', 'ui-btn ui-btn--secondary', 'Fechar formulário');
      btnCancel.type = 'button';
      btnCancel.style.display = editingId || opEdit ? 'inline-flex' : 'none';
      btnCancel.addEventListener('click', function () {
        editingId = null;
        paint();
      });
      tact.appendChild(btnSub);
      tact.appendChild(btnCancel);
      form.appendChild(tact);

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        const tipo = selTipo.value;
        const status = selStatus.value;
        if (!MO.statusValidoParaTipo(tipo, status)) {
          toast('Status inválido.', 'error');
          return;
        }
        const cpfOk = onlyDigits(inpCpf.value);
        if (cpfOk.length !== 11) {
          toast('CPF inválido.', 'error');
          return;
        }
        const valor = parseFloat(inpVal.value);
        if (Number.isNaN(valor) || valor <= 0) {
          toast('Valor financiado obrigatório.', 'error');
          return;
        }
        const prazo = parseInt(inpPrazo.value, 10);
        if (Number.isNaN(prazo) || prazo < 1) {
          toast('Prazo inválido.', 'error');
          return;
        }
        const taxa = parseFloat(inpTaxa.value);
        if (Number.isNaN(taxa) || taxa < 0) {
          toast('Taxa inválida.', 'error');
          return;
        }
        if (!inpConv.value.trim()) {
          toast('Preencha o convênio.', 'error');
          return;
        }
        if (!selProm.value) {
          toast('Promotora obrigatória.', 'error');
          return;
        }
        const port = tipo === 'PORT' || tipo === 'PORT_REFIN';
        if (port) {
          const sd = parseFloat(inpSd.value);
          if (Number.isNaN(sd) || sd < 0) {
            toast('Saldo devedor obrigatório.', 'error');
            return;
          }
        }
        if (tipo === 'PORT_REFIN') {
          const rf = parseFloat(inpRefin.value);
          if (Number.isNaN(rf) || rf < 0) {
            toast('Refinanciamento obrigatório.', 'error');
            return;
          }
        }

        let tabelaIdOut = '';
        let comissaoTabOut = null;
        if (selTab.value) {
          const tab = (st.tabelas || []).find(function (x) {
            return x.id === selTab.value;
          });
          if (tab) {
            tabelaIdOut = tab.id;
            comissaoTabOut = tab.comissao;
          }
        }
        const promRow = (st.promotoras || []).find(function (x) {
          return x.id === selProm.value;
        });
        const parcela = prazo > 0 ? Math.round((valor / prazo) * 100) / 100 : undefined;

        const base = {
          vendedoraId: vid,
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
          clienteId: selCli.value.trim() || '',
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

        const st2 = global.MaycredData.getState();
        if (opEdit) {
          if (!global.MaycredData.updateOperacaoSeDono(editingId, base, vid)) {
            toast('Não autorizado.', 'error');
            return;
          }
          if (propostaDuplicadaVend(global.MaycredData.getState(), base, editingId, vid)) {
            toast('Atenção: possível duplicata (mesmo CPF e banco no mês).', 'info');
          } else toast('Proposta atualizada.', 'success');
          editingId = null;
        } else {
          base.id = global.MaycredData.newId('op');
          global.MaycredData.addOperacaoComoVendedora(base, vid);
          if (propostaDuplicadaVend(global.MaycredData.getState(), base, base.id, vid)) {
            toast('Atenção: possível duplicata (mesmo CPF e banco no mês).', 'info');
          } else toast('Proposta registrada.', 'success');
        }
        paint();
      });

      formHost.appendChild(form);
      wrap.appendChild(formHost);
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
          'Cada correspondente vê apenas os próprios registros. Clique no card para editar, agendar retornos e registrar atendimentos. Arraste para mudar a etapa. Valores em R$ são estimativa de operação.',
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
          if (sla) {
            const ts = el('div', 'ui-pipeline-card__sla', sla);
            card.appendChild(t0);
            card.appendChild(t1);
            card.appendChild(t2);
            card.appendChild(t3);
            card.appendChild(ts);
          } else {
            card.appendChild(t0);
            card.appendChild(t1);
            card.appendChild(t2);
            card.appendChild(t3);
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
          const b = el('button', 'ui-pipeline-crm-tab', tid === 'dados' ? 'Dados' : tid === 'agenda' ? 'Agendamentos' : 'Histórico de atendimentos');
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

        const labFunil = el('div', 'ui-field__label', 'Etapa do funil');
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
          toast('Agendamento incluído (salve para gravar).', 'info');
        });
        paintAgenda();

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
          histCount.textContent = leadAt.length + ' atendimento' + (leadAt.length === 1 ? '' : 's') + ' registrado' + (leadAt.length === 1 ? '' : 's');
        }
        function sortAt(a, b) {
          const c = String(b.data).localeCompare(String(a.data));
          if (c !== 0) return c;
          return String(b.createdAt).localeCompare(String(a.createdAt));
        }
        function paintHist() {
          clear(histList);
          paintHistCount();
          const sorted = leadAt.slice().sort(sortAt);
          if (!sorted.length) {
            histList.appendChild(el('p', 'ui-muted ui-pipeline-hist-empty', 'Nenhum atendimento registrado ainda.'));
            histList.appendChild(
              el('p', 'ui-muted ui-pipeline-hist-empty2', "Clique em \"Registrar contato\" para adicionar o primeiro."),
            );
            return;
          }
          sorted.forEach(function (at) {
            const row = el('div', 'ui-pipeline-crm-line');
            const left = el('div', 'ui-pipeline-crm-line__main');
            left.appendChild(el('strong', 'ui-pipeline-crm-line__date', formatDateBR(at.data)));
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
            row.appendChild(left);
            row.appendChild(rm);
            histList.appendChild(row);
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
          toast('Atendimento incluído (salve para gravar).', 'info');
        });
        paintHist();

        function setTab(tid) {
          panDados.classList.toggle('ui-pipeline-crm-panel--hidden', tid !== 'dados');
          panAgenda.classList.toggle('ui-pipeline-crm-panel--hidden', tid !== 'agenda');
          panHist.classList.toggle('ui-pipeline-crm-panel--hidden', tid !== 'hist');
          tabIds.forEach(function (t) {
            tabBtn[t].classList.toggle('ui-pipeline-crm-tab--active', t === tid);
          });
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
      case 'vendPropostas':
        renderPropostas(container);
        break;
      case 'vendDesempenho':
      default:
        renderDesempenho(container);
    }
  }

  global.MaycredVendUI = {
    paint: paint,
    TELAS: ['vendDesempenho', 'vendPipeline', 'vendClientes', 'vendPropostas'],
  };
})(typeof window !== 'undefined' ? window : globalThis);
