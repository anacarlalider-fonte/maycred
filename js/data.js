/**
 * Modelo persistente: config, vendedoras, metas, lancamentos, diasUteis.
 * Taxas em decimal (0.40 = 40%). Comissões por tipo de operação (NOVO, CARTÃO, PORT, PORT+REFIN) + legado PORT/ENTRANTE.
 */
(function (global) {
  const STORAGE_KEY = 'maycred-metas-v1';
  const PRESET_MES = '2025-04';
  const PRESET_COMISSAO_PORT = 0.4;
  const PRESET_COMISSAO_ENTRANTE = 0.25;

  /** Rotas do menu gestor (chave = `data-tela`). */
  const ROTAS_PERMISSAO = ['dashboard', 'producao', 'configuracoes'];

  /** @type {Record<string, string>} */
  const ROTAS_PERMISSAO_LABEL = {
    dashboard: 'Dashboard',
    producao: 'Produção',
    configuracoes: 'Configurações',
  };

  /** @returns {Record<string, boolean>} */
  function mapRotasTodas(val) {
    const o = {};
    ROTAS_PERMISSAO.forEach(function (r) {
      o[r] = !!val;
    });
    return o;
  }

  /** @returns {Record<string, Record<string, boolean>>} */
  function defaultPermissoesPerfil() {
    const lid = mapRotasTodas(false);
    lid.dashboard = true;
    lid.producao = true;
    lid.configuracoes = false;
    return {
      ADM: mapRotasTodas(true),
      LIDER: lid,
      VENDA: mapRotasTodas(false),
    };
  }

  /** @param {unknown} raw */
  function mergePermissoesPerfil(raw) {
    const base = defaultPermissoesPerfil();
    if (!raw || typeof raw !== 'object') return base;
    const o = /** @type {Record<string, unknown>} */ (raw);
    ['ADM', 'LIDER', 'VENDA'].forEach(function (perfil) {
      const pr = o[perfil];
      if (!pr || typeof pr !== 'object') return;
      const po = /** @type {Record<string, unknown>} */ (pr);
      ROTAS_PERMISSAO.forEach(function (r) {
        if (Object.prototype.hasOwnProperty.call(po, r)) base[perfil][r] = !!po[r];
      });
    });
    return base;
  }

  /** @typedef {'PORT'|'ENTRANTE'} Produto */
  /** @typedef {'producao'|'pago'} TipoLancamento */

  /**
   * @typedef {Object} Config
   * @property {string} mesAtual - 'YYYY-MM'
   * @property {number} comissaoPort
   * @property {number} comissaoEntrante
   * @property {number} [comissaoOpNovo]
   * @property {number} [comissaoOpCartao]
   * @property {number} [comissaoOpPort]
   * @property {number} [comissaoOpPortRefin]
   * @property {string} senhaGestor
   * @property {number} spreadBanco
   * @property {number} custoOperacionalMes
   * @property {string} [dataControleProducao] - YYYY-MM-DD — “data dos dados” (referência da planilha)
   */

  /**
   * @typedef {'ADM'|'LIDER'|'VENDA'} PerfilAcesso
   */

  /**
   * @typedef {Object} Vendedora
   * @property {string} id
   * @property {string} nome
   * @property {string} disc
   * @property {Produto} produto
   * @property {PerfilAcesso} [perfilAcesso] - ADM / Líder: painel gestor com rotas conforme permissões; Venda: só dashboard pessoal
   * @property {string} [loginUsuario] - login único (minúsculas)
   * @property {string} [senhaHashHex] - SHA-256 hex (vazio = sem acesso vendedora)
   */

  /**
   * @typedef {Object} Meta
   * @property {string} vendedoraId
   * @property {string} mes
   * @property {number} metaProducao — espelho da meta de rentabilidade (legado / compat.)
   * @property {number} metaRentabilidade — alvo R$ de comissão (rentabilidade) no mês
   * @property {number} metaProducaoTotal — alvo R$ de produção (volume financiado total no mês)
   * @property {number} [metaAverbacao] — alvo R$ só de produção averbada (opcional; 0 = não usa % meta averbação isolada)
   */

  /**
   * @typedef {Object} Lancamento
   * @property {string} id
   * @property {string} vendedoraId
   * @property {string} mes
   * @property {TipoLancamento} tipo
   * @property {number} valor
   * @property {string} data - ISO date 'YYYY-MM-DD'
   * @property {string} [obs]
   * @property {Produto} [produto]
   * @property {number} [analiseOverride] - análise da linha (produção) manual; se ausente, usa valor × taxa
   */

  /**
   * @typedef {Object} OperacaoMaycred
   * @property {string} id
   * @property {string} vendedoraId
   * @property {string} mes - YYYY-MM (derivado da data da operação)
   * @property {'NOVO'|'CARTAO'|'PORT'|'PORT_REFIN'} tipoOperacao
   * @property {string} status
   * @property {number} valorContrato - valor financiado / produção bruta
   * @property {string} data - YYYY-MM-DD
   * @property {string} [referencia] - legado / livre
   * @property {string} [obs]
   * @property {string} [bancoParceiro] - banco parceiro (contrato)
   * @property {string} [convenio] - tabela / convênio
   * @property {string} [tabelaId] - id da tabela cadastrada (opcional)
   * @property {number} [comissaoTabela] - % comissão em decimal snapshot (ex.: 0.25) quando veio da tabela
   * @property {string} [promotoraId] - promotora da operação (alinhado à tabela)
   * @property {string} [promotoraNome] - nome gravado na proposta (snapshot)
   * @property {string} [numeroProposta]
   * @property {string} [numeroContrato]
   * @property {string} [origemVenda] - ATIVO | RECEPTIVO | INDICACAO | TELEMARKETING
   * @property {string} [clienteId] - ref. opcional ao cadastro de clientes
   * @property {string} [clienteNome]
   * @property {string} [clienteCpf] - só dígitos
   * @property {string} [beneficioInss]
   * @property {string} [especieBeneficio]
   * @property {string} [ufBeneficio]
   * @property {number} [salarioBeneficioBruto]
   * @property {number} [margemDisponivel]
   * @property {number} [prazoParcelas]
   * @property {number} [taxaJurosMes] - % a.m.
   * @property {number} [valorParcela]
   * @property {number} [valorLiberadoCliente]
   * @property {string} [dataAverbacao]
   * @property {string} [dataPagamento]
   * @property {string} [bancoOrigem] - PORT: banco de origem
   * @property {string} [bancoDestino]
   * @property {number} [saldoDevedorPortado]
   * @property {number} [valorRefinanciamento]
   */

  /**
   * @typedef {Object} AppState
   * @property {Config} config
   * @property {Vendedora[]} vendedoras
   * @property {Meta[]} metas
   * @property {Lancamento[]} lancamentos
   * @property {OperacaoMaycred[]} operacoes
   * @property {Record<string, string[]>} diasUteis — espelho legado do calendário Portabilidade (PORT)
   * @property {{ ENTRANTE: Record<string, string[]>, PORT: Record<string, string[]> }} diasUteisPorProduto — Novo vs Portabilidade
   * @property {BancoParceiro[]} bancos
   * @property {Promotora[]} promotoras
   * @property {TabelaBanco[]} tabelas
   * @property {Record<string, Record<string, boolean>>} permissoesPerfil - telas por perfil ADM/LIDER (Venda não usa estas rotas)
   * @property {Record<string, Record<string, ProducaoManualLinha>>} [producaoManual] - YYYY-MM → vendedoraId → valores da planilha (substituem soma de propostas/lançamentos quando existe linha para a vendedora)
   */

  /**
   * @typedef {Object} ProducaoManualLinha
   * @property {boolean} [ativo] - legado; sempre tratado como true ao normalizar
   * @property {number} [brutoAnalise] - bruto em análise (R$)
   * @property {number} [analiseLiquido] - rentabilidade em análise (R$); se omitido, usa brutoAnalise × taxa do produto
   * @property {number} [pago] - rentabilidade paga (R$)
   * @property {number} [brutoAverbado] - produção bruta na fase averbada (R$); se omitido, usa total bruto − bruto em análise
   * @property {number} [totalBruto] - total bruto do mês (R$); se >0, usado como produção bruta; senão usa brutoAnalise
   * @property {number} [prodMesAnterior] - referência “prod. mês anterior” (R$), só exibição / controle
   */

  /**
   * @typedef {Object} BancoParceiro
   * @property {string} id
   * @property {string} nome
   * @property {string} codigo
   * @property {boolean} [ativo]
   */

  /**
   * @typedef {Object} Promotora
   * @property {string} id
   * @property {string} nome
   * @property {boolean} [ativo]
   */

  /**
   * @typedef {Object} TabelaBanco
   * @property {string} id
   * @property {string} bancoId
   * @property {string} promotoraId
   * @property {string} nome
   * @property {'NOVO'|'CARTAO'|'PORT'|'PORT_REFIN'} tipo
   * @property {number} prazo
   * @property {number} taxa
   * @property {number} comissao - decimal 0–1
   * @property {string} convenio - texto gerado: "nome - Prazox" (ex.: BMG INSS NOVO - 84x)
   * @property {boolean} [ativo]
   */

  /** @returns {Config} */
  function defaultConfig() {
    return {
      mesAtual: PRESET_MES,
      comissaoPort: PRESET_COMISSAO_PORT,
      comissaoEntrante: PRESET_COMISSAO_ENTRANTE,
      comissaoOpNovo: PRESET_COMISSAO_ENTRANTE,
      comissaoOpCartao: PRESET_COMISSAO_ENTRANTE,
      comissaoOpPort: PRESET_COMISSAO_PORT,
      comissaoOpPortRefin: PRESET_COMISSAO_PORT,
      senhaGestor: '1234',
      spreadBanco: 0,
      custoOperacionalMes: 0,
      dataControleProducao: '',
    };
  }

  /** Garante os 4 % por tipo de operação (migração a partir de PORT/ENTRANTE legados). */
  function ensureConfigOperacoes(cfg) {
    const b = defaultConfig();
    const c = cfg;
    function pick(k, fallback) {
      const x = Number(c[k]);
      if (!Number.isNaN(x) && x >= 0) return Math.min(1, x);
      const f = Number(fallback);
      return Number.isNaN(f) ? 0 : Math.min(1, f);
    }
    c.comissaoOpNovo = pick('comissaoOpNovo', c.comissaoEntrante ?? b.comissaoOpNovo);
    c.comissaoOpCartao = pick('comissaoOpCartao', c.comissaoEntrante ?? b.comissaoOpCartao);
    c.comissaoOpPort = pick('comissaoOpPort', c.comissaoPort ?? b.comissaoOpPort);
    c.comissaoOpPortRefin = pick('comissaoOpPortRefin', c.comissaoPort ?? b.comissaoOpPortRefin);
  }

  /** @returns {Vendedora[]} */
  function defaultVendedoras() {
    return [
      { id: 'v_juliana', nome: 'Juliana', disc: 'SIC', produto: 'PORT', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_ianny', nome: 'Ianny', disc: 'SD', produto: 'PORT', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_michele', nome: 'Michele', disc: '', produto: 'PORT', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_samia', nome: 'Samia', disc: 'I', produto: 'PORT', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_beatriz_est', nome: 'Beatriz (Est.)', disc: 'I', produto: 'PORT', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_leticia_est', nome: 'Letícia (Est.)', disc: '', produto: 'PORT', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_edilania', nome: 'Edilania', disc: 'CI', produto: 'ENTRANTE', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_janete', nome: 'Janete', disc: 'SD', produto: 'ENTRANTE', loginUsuario: '', senhaHashHex: '' },
      { id: 'v_diana', nome: 'Diana', disc: 'SDC', produto: 'ENTRANTE', loginUsuario: '', senhaHashHex: '' },
    ];
  }

  /** @param {unknown} raw */
  function normalizeMetaRow(raw) {
    const m = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    const vid = String(m.vendedoraId || '');
    const mes = String(m.mes || '');
    const rentRaw = m.metaRentabilidade != null && m.metaRentabilidade !== '' ? m.metaRentabilidade : m.metaProducao;
    const rent = Number(rentRaw);
    const vol = Number(m.metaProducaoTotal);
    const averb = Number(m.metaAverbacao);
    const metaR = Number.isFinite(rent) && rent >= 0 ? rent : 0;
    const metaV = Number.isFinite(vol) && vol >= 0 ? vol : 0;
    const metaA = Number.isFinite(averb) && averb >= 0 ? averb : 0;
    return {
      vendedoraId: vid,
      mes,
      metaProducao: metaR,
      metaRentabilidade: metaR,
      metaProducaoTotal: metaV,
      metaAverbacao: metaA,
    };
  }

  /** @returns {Meta[]} */
  function defaultMetas() {
    const mes = PRESET_MES;
    const map = {
      v_juliana: 250000,
      v_ianny: 170000,
      v_michele: 250000,
      v_samia: 170000,
      v_beatriz_est: 120000,
      v_leticia_est: 120000,
      v_edilania: 120000,
      v_janete: 120000,
      v_diana: 120000,
    };
    return Object.keys(map).map(function (id) {
      const v = map[id];
      return normalizeMetaRow({
        vendedoraId: id,
        mes,
        metaProducao: v,
        metaProducaoTotal: v,
        metaAverbacao: 0,
      });
    });
  }

  /**
   * Preset Abril/2025: análise e pago alinhados às taxas 40% / 25% (Total = análise + pago).
   * @returns {Lancamento[]}
   */
  function defaultLancamentos() {
    const mes = PRESET_MES;
    const cp = PRESET_COMISSAO_PORT;
    const ce = PRESET_COMISSAO_ENTRANTE;
    /** @type {Lancamento[]} */
    const out = [];
    let n = 0;
    function addProd(vid, analise, produto, dia) {
      if (!(analise > 0)) return;
      const rate = produto === 'ENTRANTE' ? ce : cp;
      const bruto = analise / rate;
      n += 1;
      out.push({
        id: 'seed_pr_' + n,
        vendedoraId: vid,
        mes,
        tipo: 'producao',
        valor: bruto,
        produto,
        data: '2025-04-' + String(dia).padStart(2, '0'),
      });
    }
    function addPago(vid, valor, dia) {
      if (!(valor > 0)) return;
      n += 1;
      out.push({
        id: 'seed_pg_' + n,
        vendedoraId: vid,
        mes,
        tipo: 'pago',
        valor,
        data: '2025-04-' + String(dia).padStart(2, '0'),
      });
    }

    addProd('v_juliana', 52232.87, 'PORT', 3);
    addPago('v_juliana', 25854.19, 8);
    addProd('v_ianny', 77555.7, 'PORT', 4);
    addPago('v_ianny', 54434.06, 9);
    addProd('v_michele', 24138.02, 'PORT', 5);
    addPago('v_michele', 49032.88, 10);
    addProd('v_samia', 55816.48, 'PORT', 6);
    addPago('v_samia', 5488, 11);
    addProd('v_beatriz_est', 17774.28, 'PORT', 7);
    addPago('v_beatriz_est', 25556.37, 12);
    addProd('v_leticia_est', 10362.63, 'PORT', 2);
    addPago('v_leticia_est', 4937.38, 14);
    addProd('v_edilania', 30341.45, 'ENTRANTE', 15);
    addPago('v_edilania', 13704.67, 16);
    addPago('v_janete', 12089.28, 17);

    return out;
  }

  /**
   * Dias úteis Abril/2025 (seg–sex).
   * @returns {Record<string, string[]>}
   */
  /** @returns {Record<string, string[]>} */
  function defaultDiasUteis() {
    return {
      '2025-04': [
        '2025-04-01',
        '2025-04-02',
        '2025-04-03',
        '2025-04-04',
        '2025-04-07',
        '2025-04-08',
        '2025-04-09',
        '2025-04-10',
        '2025-04-11',
        '2025-04-14',
        '2025-04-15',
        '2025-04-16',
        '2025-04-17',
        '2025-04-18',
        '2025-04-21',
        '2025-04-22',
        '2025-04-23',
        '2025-04-24',
        '2025-04-25',
        '2025-04-28',
        '2025-04-29',
        '2025-04-30',
      ],
    };
  }

  /** @param {unknown} rec */
  function cloneStrArrRecord(rec) {
    /** @type {Record<string, string[]>} */
    const out = {};
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return out;
    const o = /** @type {Record<string, unknown>} */ (rec);
    Object.keys(o).forEach(function (k) {
      const arr = o[k];
      if (Array.isArray(arr)) out[k] = arr.map(function (x) { return String(x); });
    });
    return out;
  }

  /** @returns {BancoParceiro[]} */
  function defaultBancos() {
    const rows = [
      ['BMG', '318'],
      ['Itaú', '341'],
      ['Bradesco', '237'],
      ['Caixa Econômica Federal', '104'],
      ['Banco do Brasil', '001'],
      ['Santander', '033'],
      ['Pan', '623'],
      ['Safra', '422'],
      ['Mercantil', '389'],
      ['C6', '336'],
      ['Master', '243'],
      ['Daycoval', '707'],
      ['Paraná Banco', '254'],
    ];
    return rows.map(function (r, i) {
      return { id: 'banco_' + (i + 1), nome: r[0], codigo: r[1], ativo: true };
    });
  }

  /** @returns {Promotora[]} */
  function defaultPromotoras() {
    return [
      { id: 'prom_prospecta', nome: 'Prospecta', ativo: true },
      { id: 'prom_finanbank', nome: 'Finanbank', ativo: true },
      { id: 'prom_alcif', nome: 'Alcif', ativo: true },
    ];
  }

  /**
   * @param {BancoParceiro[]} bancos
   * @param {Promotora[]} promotoras
   * @returns {TabelaBanco[]}
   */
  function defaultTabelas(bancos, promotoras) {
    const pid = promotoras[0] && promotoras[0].id ? String(promotoras[0].id) : '';
    const tipos = /** @type {const} */ (['NOVO', 'CARTAO', 'PORT', 'PORT_REFIN']);
    const out = [];
    let n = 0;
    bancos.forEach(function (b) {
      tipos.forEach(function (tipo) {
        n += 1;
        const comissao = tipo === 'PORT' || tipo === 'PORT_REFIN' ? 0.4 : 0.25;
        out.push({
          id: 'tab_' + n,
          bancoId: b.id,
          promotoraId: pid,
          nome: b.nome + ' — ' + tipo,
          tipo: tipo,
          prazo: 84,
          taxa: 1.8,
          comissao: comissao,
          ativo: true,
        });
      });
    });
    return out;
  }

  /** @param {unknown} raw */
  function normalizePromotoraRow(raw) {
    const p = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    return {
      id: String(p.id || ''),
      nome: String(p.nome != null ? p.nome : '').trim(),
      ativo: p.ativo !== false,
    };
  }

  /** @param {unknown} raw */
  function normalizeBancoRow(raw) {
    const b = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    return {
      id: String(b.id || ''),
      nome: String(b.nome != null ? b.nome : '').trim(),
      codigo: String(b.codigo != null ? b.codigo : '').trim(),
      ativo: b.ativo !== false,
    };
  }

  /**
   * Convênio exibido na proposta: nome da tabela e prazo separados por " - ".
   * @param {string} nome
   * @param {number} prazo
   */
  function formatConvenioTabela(nome, prazo) {
    const n = String(nome != null ? nome : '').trim();
    const p = Math.max(1, Math.floor(Number(prazo)) || 1);
    return n ? n + ' - ' + p + 'x' : String(p) + 'x';
  }

  /** @param {unknown} raw */
  function normalizeTabelaRow(raw) {
    const t = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    const tipoRaw = String(t.tipo || 'NOVO');
    const tipo =
      ['NOVO', 'CARTAO', 'PORT', 'PORT_REFIN'].indexOf(tipoRaw) >= 0
        ? /** @type {'NOVO'|'CARTAO'|'PORT'|'PORT_REFIN'} */ (tipoRaw)
        : 'NOVO';
    const pr = Math.max(1, Math.floor(Number(t.prazo)) || 84);
    const taxN = Number(t.taxa);
    const comN = Number(t.comissao);
    const nome = String(t.nome != null ? t.nome : '').trim();
    return {
      id: String(t.id || ''),
      bancoId: String(t.bancoId || ''),
      promotoraId: String(t.promotoraId != null ? t.promotoraId : '').trim(),
      nome: nome,
      tipo: tipo,
      prazo: pr,
      taxa: Number.isNaN(taxN) ? 0 : taxN,
      comissao: !Number.isNaN(comN) && comN >= 0 ? Math.min(1, comN) : 0.25,
      convenio: formatConvenioTabela(nome, pr),
      ativo: t.ativo !== false,
    };
  }

  /** @param {Vendedora} v */
  function normalizeVendedoraRow(v) {
    const loginUsuario = v.loginUsuario != null ? String(v.loginUsuario).trim().toLowerCase() : '';
    const paRaw = v.perfilAcesso != null ? String(v.perfilAcesso).trim().toUpperCase() : 'VENDA';
    const perfilAcesso =
      paRaw === 'ADM' || paRaw === 'LIDER' || paRaw === 'VENDA' ? paRaw : 'VENDA';
    return {
      ...v,
      disc: v.disc != null ? String(v.disc) : '',
      loginUsuario,
      senhaHashHex: v.senhaHashHex != null ? String(v.senhaHashHex) : '',
      perfilAcesso,
    };
  }

  function numOperacao(x) {
    const n = Number(x);
    return Number.isNaN(n) ? undefined : n;
  }

  /**
   * Garante `mes` coerente com `data` e defaults para proposta INSS.
   * @param {unknown} raw
   * @returns {OperacaoMaycred}
   */
  function normalizeOperacaoRow(raw) {
    const o = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    const data = o.data != null ? String(o.data) : '';
    let mes = o.mes != null ? String(o.mes) : '';
    if (data.length >= 7) mes = data.slice(0, 7);

    const tipoRaw = String(o.tipoOperacao || 'NOVO');
    const tipo =
      ['NOVO', 'CARTAO', 'PORT', 'PORT_REFIN'].indexOf(tipoRaw) >= 0
        ? /** @type {'NOVO'|'CARTAO'|'PORT'|'PORT_REFIN'} */ (tipoRaw)
        : 'NOVO';

    const vc = Number(o.valorContrato);
    const valorContrato = Number.isNaN(vc) ? 0 : Math.max(0, vc);

    const cpfDigits = String(o.clienteCpf != null ? o.clienteCpf : '')
      .replace(/\D/g, '')
      .slice(0, 11);

    let clienteNome = o.clienteNome != null ? String(o.clienteNome).trim() : '';
    if (!clienteNome && o.referencia) clienteNome = String(o.referencia).trim();

    const prazo = Math.max(0, Math.floor(Number(o.prazoParcelas)) || 0);
    const taxaN = Number(o.taxaJurosMes);
    const taxaJurosMes = Number.isNaN(taxaN) ? 0 : taxaN;

    let valorParcela = numOperacao(o.valorParcela);
    if (valorParcela === undefined && prazo > 0 && valorContrato > 0) {
      valorParcela = Math.round((valorContrato / prazo) * 100) / 100;
    }

    const tabelaId = o.tabelaId != null && String(o.tabelaId) ? String(o.tabelaId) : '';
    let comissaoTabela;
    if (Object.prototype.hasOwnProperty.call(o, 'comissaoTabela')) {
      if (o.comissaoTabela == null || o.comissaoTabela === '') {
        comissaoTabela = undefined;
      } else {
        const ct = Number(o.comissaoTabela);
        comissaoTabela = Number.isNaN(ct) ? undefined : Math.min(1, Math.max(0, ct));
      }
    } else {
      const ct = Number(o.comissaoTabela);
      if (!Number.isNaN(ct) && ct >= 0 && ct <= 1) comissaoTabela = ct;
    }

    const clienteIdRaw = o.clienteId != null ? String(o.clienteId).trim() : '';

    /** @type {OperacaoMaycred} */
    const out = {
      id: String(o.id || ''),
      vendedoraId: String(o.vendedoraId || ''),
      mes,
      tipoOperacao: tipo,
      status: String(o.status || 'DIGITADO'),
      valorContrato,
      data,
      referencia: o.referencia != null ? String(o.referencia) : '',
      obs: o.obs != null ? String(o.obs) : '',
      bancoParceiro: o.bancoParceiro != null && String(o.bancoParceiro) ? String(o.bancoParceiro) : 'Outros',
      convenio: o.convenio != null ? String(o.convenio) : '',
      numeroProposta: o.numeroProposta != null ? String(o.numeroProposta) : '',
      numeroContrato: o.numeroContrato != null ? String(o.numeroContrato) : '',
      origemVenda: o.origemVenda != null ? String(o.origemVenda) : '',
      clienteNome,
      clienteCpf: cpfDigits,
      beneficioInss: o.beneficioInss != null ? String(o.beneficioInss) : '',
      especieBeneficio: o.especieBeneficio != null ? String(o.especieBeneficio) : 'APOS_IDADE',
      ufBeneficio: o.ufBeneficio != null ? String(o.ufBeneficio).toUpperCase().slice(0, 2) : '',
      salarioBeneficioBruto: numOperacao(o.salarioBeneficioBruto),
      margemDisponivel: numOperacao(o.margemDisponivel),
      prazoParcelas: prazo,
      taxaJurosMes,
      valorParcela,
      valorLiberadoCliente: numOperacao(o.valorLiberadoCliente),
      dataAverbacao: o.dataAverbacao != null ? String(o.dataAverbacao) : '',
      dataPagamento: o.dataPagamento != null ? String(o.dataPagamento) : '',
      bancoOrigem: o.bancoOrigem != null ? String(o.bancoOrigem) : '',
      bancoDestino: o.bancoDestino != null ? String(o.bancoDestino) : '',
      saldoDevedorPortado: numOperacao(o.saldoDevedorPortado),
      valorRefinanciamento: numOperacao(o.valorRefinanciamento),
      tabelaId: tabelaId,
      promotoraId: o.promotoraId != null && String(o.promotoraId) ? String(o.promotoraId) : '',
      promotoraNome: o.promotoraNome != null ? String(o.promotoraNome).trim() : '',
    };
    if (comissaoTabela !== undefined) out.comissaoTabela = comissaoTabela;
    if (clienteIdRaw) out.clienteId = clienteIdRaw;
    return out;
  }

  function digitsCpfCliente(s) {
    return String(s || '')
      .replace(/\D/g, '')
      .slice(0, 11);
  }

  /** @param {unknown} raw */
  function normalizeClienteRow(raw) {
    const row = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    return {
      id: String(row.id || ''),
      nome: String(row.nome != null ? row.nome : '').trim(),
      cpf: digitsCpfCliente(row.cpf),
      celular: String(row.celular != null ? row.celular : '').trim(),
      observacoes: String(row.observacoes != null ? row.observacoes : '').trim(),
      ativo: row.ativo !== false,
      dataCadastro:
        String(row.dataCadastro || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    };
  }

  /** @param {unknown} raw */
  function normalizeProducaoManualLinha(raw) {
    const row = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
    function num(k) {
      const v = row[k];
      if (v === '' || v === null || v === undefined) return undefined;
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return {
      ativo: true,
      brutoAnalise: num('brutoAnalise'),
      analiseLiquido: num('analiseLiquido'),
      pago: num('pago'),
      brutoAverbado: num('brutoAverbado'),
      totalBruto: num('totalBruto'),
      prodMesAnterior: num('prodMesAnterior'),
    };
  }

  /** @param {unknown} raw */
  function mergeProducaoManual(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const src = /** @type {Record<string, unknown>} */ (raw);
    /** @type {Record<string, Record<string, ReturnType<typeof normalizeProducaoManualLinha>>>} */
    const out = {};
    Object.keys(src).forEach(function (mes) {
      const block = src[mes];
      if (!block || typeof block !== 'object') return;
      const bo = /** @type {Record<string, unknown>} */ (block);
      out[mes] = {};
      Object.keys(bo).forEach(function (vid) {
        out[mes][vid] = normalizeProducaoManualLinha(bo[vid]);
      });
      if (Object.keys(out[mes]).length === 0) delete out[mes];
    });
    return out;
  }

  /** @returns {AppState} */
  function emptyState() {
    const promotoras = defaultPromotoras().map(normalizePromotoraRow);
    const bancos = defaultBancos();
    const du = defaultDiasUteis();
    return {
      config: defaultConfig(),
      vendedoras: defaultVendedoras().map(normalizeVendedoraRow),
      metas: defaultMetas(),
      lancamentos: defaultLancamentos(),
      operacoes: [],
      clientes: [],
      diasUteis: cloneStrArrRecord(du),
      diasUteisPorProduto: {
        ENTRANTE: cloneStrArrRecord(du),
        PORT: cloneStrArrRecord(du),
      },
      promotoras: promotoras,
      bancos: bancos.map(normalizeBancoRow),
      tabelas: defaultTabelas(bancos, promotoras).map(normalizeTabelaRow),
      permissoesPerfil: defaultPermissoesPerfil(),
      producaoManual: {},
    };
  }

  /**
   * @param {unknown} raw
   * @returns {AppState}
   */
  function normalizeState(raw) {
    const base = emptyState();
    if (!raw || typeof raw !== 'object') return base;
    const o = /** @type {Record<string, unknown>} */ (raw);

    const config = o.config && typeof o.config === 'object'
      ? { ...base.config, .../** @type {Config} */ (o.config) }
      : base.config;

    let vendedoras = Array.isArray(o.vendedoras)
      ? /** @type {Vendedora[]} */ (o.vendedoras).filter(Boolean).map(normalizeVendedoraRow)
      : base.vendedoras;

    const metas = Array.isArray(o.metas)
      ? /** @type {Meta[]} */ (o.metas).filter(Boolean).map(normalizeMetaRow)
      : base.metas.map(normalizeMetaRow);

    const lancamentos = Array.isArray(o.lancamentos)
      ? /** @type {Lancamento[]} */ (o.lancamentos).filter(Boolean)
      : base.lancamentos;

    const operacoes = Array.isArray(o.operacoes)
      ? /** @type {OperacaoMaycred[]} */ (o.operacoes).filter(Boolean).map(normalizeOperacaoRow)
      : base.operacoes;

    const diasUteisMerged =
      o.diasUteis && typeof o.diasUteis === 'object' && !Array.isArray(o.diasUteis)
        ? /** @type {Record<string, string[]>} */ ({ ...base.diasUteis, ...cloneStrArrRecord(o.diasUteis) })
        : cloneStrArrRecord(base.diasUteis);

    const rawDup =
      o.diasUteisPorProduto && typeof o.diasUteisPorProduto === 'object' && !Array.isArray(o.diasUteisPorProduto)
        ? /** @type {Record<string, unknown>} */ (o.diasUteisPorProduto)
        : null;
    let mapE = rawDup && rawDup.ENTRANTE ? cloneStrArrRecord(rawDup.ENTRANTE) : {};
    let mapP = rawDup && rawDup.PORT ? cloneStrArrRecord(rawDup.PORT) : {};

    Object.keys(diasUteisMerged).forEach(function (mes) {
      const leg = Array.isArray(diasUteisMerged[mes]) ? [...diasUteisMerged[mes]] : [];
      if (!mapE[mes] || mapE[mes].length === 0) mapE[mes] = leg.length ? [...leg] : [];
      if (!mapP[mes] || mapP[mes].length === 0) mapP[mes] = leg.length ? [...leg] : [];
    });
    Object.keys(mapE).forEach(function (mes) {
      if (!mapP[mes] || mapP[mes].length === 0) mapP[mes] = [...mapE[mes]];
    });
    Object.keys(mapP).forEach(function (mes) {
      if (!mapE[mes] || mapE[mes].length === 0) mapE[mes] = [...mapP[mes]];
    });

    const diasUteisPorProduto = { ENTRANTE: mapE, PORT: mapP };
    const diasUteis = cloneStrArrRecord(mapP);

    const bancos =
      Array.isArray(o.bancos) && o.bancos.length > 0
        ? o.bancos.filter(Boolean).map(normalizeBancoRow)
        : base.bancos.map(normalizeBancoRow);

    const promotoras =
      Array.isArray(o.promotoras) && o.promotoras.length > 0
        ? o.promotoras.filter(Boolean).map(normalizePromotoraRow)
        : base.promotoras.map(normalizePromotoraRow);

    const firstPromId = promotoras[0] && promotoras[0].id ? String(promotoras[0].id) : '';

    let tabelas =
      Array.isArray(o.tabelas) && o.tabelas.length > 0
        ? o.tabelas.filter(Boolean).map(normalizeTabelaRow)
        : defaultTabelas(bancos, promotoras).map(normalizeTabelaRow);

    if (firstPromId) {
      tabelas = tabelas.map(function (t) {
        if (t.promotoraId) return t;
        return { ...t, promotoraId: firstPromId };
      });
    }

    if (config.spreadBanco === undefined || config.spreadBanco === null) config.spreadBanco = base.config.spreadBanco;
    if (config.custoOperacionalMes === undefined || config.custoOperacionalMes === null) {
      config.custoOperacionalMes = base.config.custoOperacionalMes;
    }
    delete /** @type {Record<string, unknown>} */ (config).bancoNome;

    ensureConfigOperacoes(config);

    const permissoesPerfil = mergePermissoesPerfil(o.permissoesPerfil);

    const clientes = Array.isArray(o.clientes)
      ? /** @type {unknown[]} */ (o.clientes).filter(Boolean).map(normalizeClienteRow)
      : base.clientes;

    const producaoManual = mergeProducaoManual(o.producaoManual);

    return {
      config,
      vendedoras,
      metas,
      lancamentos,
      operacoes,
      clientes,
      diasUteis,
      diasUteisPorProduto,
      bancos,
      promotoras,
      tabelas,
      permissoesPerfil,
      producaoManual,
    };
  }

  /** @returns {AppState} */
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState();
      return normalizeState(JSON.parse(raw));
    } catch {
      return emptyState();
    }
  }

  /** @param {AppState} state */
  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let cache = loadState();

  if (!cache.diasUteisPorProduto || typeof cache.diasUteisPorProduto !== 'object') {
    const leg = cloneStrArrRecord(cache.diasUteis || {});
    cache.diasUteisPorProduto = { ENTRANTE: cloneStrArrRecord(leg), PORT: cloneStrArrRecord(leg) };
    saveState(cache);
  }

  if (!cache.permissoesPerfil) {
    cache.permissoesPerfil = defaultPermissoesPerfil();
    saveState(cache);
  }

  if (cache.config.spreadBanco === undefined || cache.config.spreadBanco === null) cache.config.spreadBanco = 0;
  if (cache.config.custoOperacionalMes === undefined || cache.config.custoOperacionalMes === null) {
    cache.config.custoOperacionalMes = 0;
  }
  ensureConfigOperacoes(cache.config);
  if (!Array.isArray(cache.operacoes)) cache.operacoes = [];
  if (!cache.producaoManual || typeof cache.producaoManual !== 'object') {
    cache.producaoManual = {};
    saveState(cache);
  }
  if (cache.config.dataControleProducao === undefined || cache.config.dataControleProducao === null) {
    cache.config.dataControleProducao = '';
  }
  if (!Array.isArray(cache.clientes)) {
    cache.clientes = [];
    saveState(cache);
  }
  if (!Array.isArray(cache.promotoras) || cache.promotoras.length === 0) {
    cache.promotoras = defaultPromotoras().map(normalizePromotoraRow);
    saveState(cache);
  } else if (
    cache.promotoras.length === 1 &&
    String(cache.promotoras[0].id) === 'prom_padrao'
  ) {
    cache.tabelas = (cache.tabelas || []).map(function (t) {
      const nt = { ...normalizeTabelaRow(t) };
      if (String(nt.promotoraId || '') === 'prom_padrao') nt.promotoraId = 'prom_prospecta';
      return nt;
    });
    cache.promotoras = defaultPromotoras().map(normalizePromotoraRow);
    saveState(cache);
  }
  if (!Array.isArray(cache.bancos) || cache.bancos.length === 0) {
    cache.bancos = defaultBancos().map(normalizeBancoRow);
    saveState(cache);
  }
  if (!Array.isArray(cache.tabelas) || cache.tabelas.length === 0) {
    cache.tabelas = defaultTabelas(cache.bancos || [], cache.promotoras || []).map(normalizeTabelaRow);
    saveState(cache);
  } else {
    const fp = cache.promotoras[0];
    const fid = fp && fp.id ? String(fp.id) : '';
    if (fid) {
      let fix = false;
      cache.tabelas = (cache.tabelas || []).map(function (t) {
        if (t.promotoraId) return t;
        fix = true;
        return { ...normalizeTabelaRow(t), promotoraId: fid };
      });
      if (fix) saveState(cache);
    }
  }

  function persist() {
    saveState(cache);
  }

  /** @returns {AppState} shallow clone for readers */
  function getState() {
    return {
      config: { ...cache.config },
      vendedoras: cache.vendedoras.map((v) => ({ ...v })),
      metas: cache.metas.map((m) => ({ ...m })),
      lancamentos: cache.lancamentos.map((l) => ({ ...l })),
      operacoes: cache.operacoes.map((o) => ({ ...o })),
      clientes: (cache.clientes || []).map((c) => ({ ...normalizeClienteRow(c) })),
      diasUteis: Object.fromEntries(
        Object.entries(cache.diasUteis || {}).map(([k, arr]) => [k, [...arr]])
      ),
      diasUteisPorProduto: {
        ENTRANTE: Object.fromEntries(
          Object.entries((cache.diasUteisPorProduto && cache.diasUteisPorProduto.ENTRANTE) || {}).map(function (e) {
            return [e[0], [...e[1]]];
          })
        ),
        PORT: Object.fromEntries(
          Object.entries((cache.diasUteisPorProduto && cache.diasUteisPorProduto.PORT) || {}).map(function (e) {
            return [e[0], [...e[1]]];
          })
        ),
      },
      bancos: (cache.bancos || []).map((b) => ({ ...b })),
      promotoras: (cache.promotoras || []).map((p) => ({ ...p })),
      tabelas: (cache.tabelas || []).map((t) => normalizeTabelaRow(t)),
      permissoesPerfil: mergePermissoesPerfil(cache.permissoesPerfil),
      producaoManual: JSON.parse(JSON.stringify(cache.producaoManual && typeof cache.producaoManual === 'object' ? cache.producaoManual : {})),
    };
  }

  /** @param {string} rota */
  function canonicalRotaPerm(rota) {
    const r = String(rota || '');
    if (r === 'lancamentos' || r === 'operacoes') return 'producao';
    return r;
  }

  /**
   * @param {string} perfil - ADM | LIDER | VENDA
   * @param {string} rota
   */
  function rotaPermitidaParaPerfil(perfil, rota) {
    const p = String(perfil || '').toUpperCase();
    const key = canonicalRotaPerm(rota);
    const perm = mergePermissoesPerfil(cache.permissoesPerfil);
    const map = perm[p];
    if (!map) return false;
    return !!map[key];
  }

  /** @param {Record<string, Record<string, boolean>>} p */
  function setPermissoesPerfil(p) {
    cache.permissoesPerfil = mergePermissoesPerfil(p);
    persist();
  }

  /** @param {Partial<Config>} patch */
  function setConfig(patch) {
    cache.config = { ...cache.config, ...patch };
    ensureConfigOperacoes(cache.config);
    persist();
  }

  /** @param {Vendedora[]} list */
  function setVendedoras(list) {
    cache.vendedoras = list.map((v) => normalizeVendedoraRow(/** @type {Vendedora} */ (v)));
    persist();
  }

  /** @param {Vendedora} v */
  function addVendedora(v) {
    cache.vendedoras.push(normalizeVendedoraRow(v));
    persist();
  }

  /**
   * @param {string} id
   * @param {Partial<Vendedora>} patch
   * @returns {boolean}
   */
  function updateVendedora(id, patch) {
    const sid = String(id);
    const i = cache.vendedoras.findIndex((x) => String(x.id) === sid);
    if (i < 0) return false;
    const merged = { ...cache.vendedoras[i], ...patch };
    cache.vendedoras[i] = normalizeVendedoraRow(merged);
    persist();
    return true;
  }

  /** @param {string} id */
  function removeVendedora(id) {
    cache.vendedoras = cache.vendedoras.filter((x) => x.id !== id);
    cache.metas = cache.metas.filter((m) => m.vendedoraId !== id);
    cache.lancamentos = cache.lancamentos.filter((l) => l.vendedoraId !== id);
    cache.operacoes = cache.operacoes.filter((o) => o.vendedoraId !== id);
    persist();
  }

  /** @param {string} usuario */
  function findVendedoraByLogin(usuario) {
    const u = String(usuario || '').trim().toLowerCase();
    if (!u) return null;
    return cache.vendedoras.find(function (v) {
      return String(v.loginUsuario || '').trim().toLowerCase() === u;
    }) || null;
  }

  /**
   * @param {string} usuario
   * @param {string} [excetoVendedoraId] - id da vendedora em edição
   */
  function loginUsuarioDisponivel(usuario, excetoVendedoraId) {
    const u = String(usuario || '').trim().toLowerCase();
    if (!u) return true;
    const found = findVendedoraByLogin(u);
    if (!found) return true;
    if (excetoVendedoraId != null && String(found.id) === String(excetoVendedoraId)) return true;
    return false;
  }

  /** @param {string} id */
  function getVendedoraById(id) {
    const sid = String(id);
    return cache.vendedoras.find((x) => String(x.id) === sid) || null;
  }

  /** @param {Meta[]} list */
  function setMetas(list) {
    cache.metas = list.map((m) => normalizeMetaRow(m));
    persist();
  }

  /** @param {Partial<Meta> & { vendedoraId: string, mes: string }} meta */
  function upsertMeta(meta) {
    const vid = String(meta.vendedoraId);
    const mes = String(meta.mes);
    const i = cache.metas.findIndex((m) => m.vendedoraId === vid && m.mes === mes);
    const cur =
      i >= 0
        ? { ...cache.metas[i] }
        : normalizeMetaRow({ vendedoraId: vid, mes, metaProducao: 0, metaProducaoTotal: 0, metaAverbacao: 0 });
    const merged = normalizeMetaRow({ ...cur, ...meta });
    if (i >= 0) cache.metas[i] = merged;
    else cache.metas.push(merged);
    persist();
  }

  /** @param {Lancamento[]} list */
  function setLancamentos(list) {
    cache.lancamentos = list.map((l) => ({ ...l }));
    persist();
  }

  /** @param {Lancamento} l */
  function addLancamento(l) {
    cache.lancamentos.push({ ...l });
    persist();
  }

  /** @param {string} id */
  function removeLancamento(id) {
    cache.lancamentos = cache.lancamentos.filter((l) => l.id !== id);
    persist();
  }

  /**
   * Substitui todos os lançamentos de uma vendedora no mês (resumo agregado na tela Produção).
   * @param {string} vendedoraId
   * @param {string} mes - YYYY-MM
   * @param {Lancamento[]} novos
   */
  function replaceLancamentosVendedoraMes(vendedoraId, mes, novos) {
    const vid = String(vendedoraId);
    const m = String(mes);
    cache.lancamentos = cache.lancamentos.filter(function (l) {
      return !(String(l.vendedoraId) === vid && String(l.mes) === m);
    });
    const arr = Array.isArray(novos) ? novos : [];
    for (let i = 0; i < arr.length; i++) {
      cache.lancamentos.push({ ...arr[i] });
    }
    persist();
  }

  /**
   * @param {string} id
   * @param {Partial<Lancamento>} patch
   */
  function updateLancamento(id, patch) {
    const i = cache.lancamentos.findIndex((l) => l.id === id);
    if (i < 0) return false;
    const next = { ...cache.lancamentos[i], ...patch };
    if (next.tipo === 'pago') {
      delete next.produto;
      delete next.analiseOverride;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'analiseOverride')) {
      const ao = patch.analiseOverride;
      if (ao == null || Number.isNaN(Number(ao))) delete next.analiseOverride;
      else next.analiseOverride = Number(ao);
    }
    cache.lancamentos[i] = next;
    persist();
    return true;
  }

  /** @param {OperacaoMaycred} op */
  function addOperacao(op) {
    cache.operacoes.push(normalizeOperacaoRow(op));
    persist();
  }

  /**
   * @param {string} id
   * @param {Partial<OperacaoMaycred>} patch
   */
  function updateOperacao(id, patch) {
    const i = cache.operacoes.findIndex((o) => o.id === id);
    if (i < 0) return false;
    cache.operacoes[i] = normalizeOperacaoRow({ ...cache.operacoes[i], ...patch });
    persist();
    return true;
  }

  /** @param {string} id */
  function removeOperacao(id) {
    cache.operacoes = cache.operacoes.filter((o) => o.id !== id);
    persist();
  }

  /**
   * Atualiza proposta somente se pertencer à vendedora (isolamento).
   * @param {string} id
   * @param {Partial<OperacaoMaycred>} patch
   * @param {string} vendedoraId
   */
  function updateOperacaoSeDono(id, patch, vendedoraId) {
    const vid = String(vendedoraId);
    const o = cache.operacoes.find(function (x) {
      return x.id === id;
    });
    if (!o || String(o.vendedoraId) !== vid) return false;
    const safe = { ...patch };
    delete safe.vendedoraId;
    return updateOperacao(id, safe);
  }

  /**
   * Remove proposta somente se pertencer à vendedora.
   * @param {string} id
   * @param {string} vendedoraId
   */
  function removeOperacaoSeDono(id, vendedoraId) {
    const vid = String(vendedoraId);
    const o = cache.operacoes.find(function (x) {
      return x.id === id;
    });
    if (!o || String(o.vendedoraId) !== vid) return false;
    removeOperacao(id);
    return true;
  }

  /**
   * Inclui operação já fixando a vendedora (ignora `vendedoraId` vindo do cliente).
   * @param {OperacaoMaycred} op
   * @param {string} vendedoraId
   */
  function addOperacaoComoVendedora(op, vendedoraId) {
    addOperacao({ ...op, vendedoraId: String(vendedoraId) });
  }

  function listClientes() {
    return (cache.clientes || []).map(function (c) {
      return { ...normalizeClienteRow(c) };
    });
  }

  /** @param {string} id */
  function getClienteById(id) {
    const sid = String(id);
    const row = (cache.clientes || []).find(function (c) {
      return String(c.id) === sid;
    });
    return row ? normalizeClienteRow(row) : null;
  }

  /** @param {Record<string, unknown>} row */
  function addCliente(row) {
    if (!Array.isArray(cache.clientes)) cache.clientes = [];
    const c = normalizeClienteRow(row);
    if (!c.id) c.id = newId('cli');
    cache.clientes.push(c);
    persist();
    return c.id;
  }

  /**
   * @param {string} id
   * @param {Record<string, unknown>} patch
   */
  function updateCliente(id, patch) {
    if (!Array.isArray(cache.clientes)) return false;
    const i = cache.clientes.findIndex(function (c) {
      return String(c.id) === String(id);
    });
    if (i < 0) return false;
    cache.clientes[i] = normalizeClienteRow({
      ...cache.clientes[i],
      ...patch,
      id: cache.clientes[i].id,
    });
    persist();
    return true;
  }

  /** @param {string} id */
  function removeCliente(id) {
    if (!Array.isArray(cache.clientes)) return false;
    const len = cache.clientes.length;
    cache.clientes = cache.clientes.filter(function (c) {
      return String(c.id) !== String(id);
    });
    if (cache.clientes.length === len) return false;
    persist();
    return true;
  }

  /**
   * @param {string} mes - YYYY-MM
   * @param {'ENTRANTE'|'PORT'} produto — Novo (ENTRANTE) ou Portabilidade (PORT)
   * @returns {string[]|null} ordenado ou null para cair no padrão seg–sex do calendário
   */
  function getDiasUteisMesPorProduto(mes, produto) {
    const m = String(mes);
    const prod = produto === 'ENTRANTE' ? 'ENTRANTE' : 'PORT';
    const block = cache.diasUteisPorProduto && cache.diasUteisPorProduto[prod];
    const arr = block && block[m];
    if (Array.isArray(arr) && arr.length > 0) return [...arr].sort();
    const leg = cache.diasUteis && cache.diasUteis[m];
    if (Array.isArray(leg) && leg.length > 0) return [...leg].sort();
    return null;
  }

  /**
   * @param {string} mes - YYYY-MM
   * @param {'ENTRANTE'|'PORT'} produto
   * @param {string[]} datas
   */
  function setDiasUteisMesPorProduto(mes, produto, datas) {
    if (!cache.diasUteisPorProduto || typeof cache.diasUteisPorProduto !== 'object') {
      cache.diasUteisPorProduto = { ENTRANTE: {}, PORT: {} };
    }
    const prod = produto === 'ENTRANTE' ? 'ENTRANTE' : 'PORT';
    const d = [...datas];
    cache.diasUteisPorProduto[prod] = { ...cache.diasUteisPorProduto[prod], [mes]: d };
    if (prod === 'PORT') cache.diasUteis = { ...cache.diasUteis, [mes]: d };
    persist();
  }

  /** @param {string} mes - YYYY-MM
   * @param {string[]} datas — replica o mesmo calendário em Novo e Portabilidade (atalho legado)
   */
  function setDiasUteisMes(mes, datas) {
    const d = [...datas];
    if (!cache.diasUteisPorProduto || typeof cache.diasUteisPorProduto !== 'object') {
      cache.diasUteisPorProduto = { ENTRANTE: {}, PORT: {} };
    }
    cache.diasUteisPorProduto.ENTRANTE = { ...cache.diasUteisPorProduto.ENTRANTE, [mes]: d };
    cache.diasUteisPorProduto.PORT = { ...cache.diasUteisPorProduto.PORT, [mes]: d };
    cache.diasUteis = { ...cache.diasUteis, [mes]: d };
    persist();
  }

  function resetToDefaults() {
    cache = emptyState();
    persist();
  }

  function newId(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function getBancos() {
    return (cache.bancos || []).map(function (b) {
      return { ...b };
    });
  }

  /** @param {Partial<BancoParceiro> & { id?: string }} row */
  function saveBanco(row) {
    const b = normalizeBancoRow(row);
    if (!b.id) b.id = newId('banco');
    const list = cache.bancos || (cache.bancos = []);
    const i = list.findIndex(function (x) {
      return x.id === b.id;
    });
    if (i >= 0) list[i] = b;
    else list.push(b);
    persist();
    return b.id;
  }

  /** @param {string} id */
  function getBancoById(id) {
    const sid = String(id);
    const b = (cache.bancos || []).find(function (x) {
      return x.id === sid;
    });
    return b ? { ...b } : null;
  }

  function getPromotoras() {
    return (cache.promotoras || []).map(function (p) {
      return { ...p };
    });
  }

  /** @param {Partial<Promotora> & { id?: string }} row */
  function savePromotora(row) {
    const p = normalizePromotoraRow(row);
    if (!p.id) p.id = newId('prom');
    const list = cache.promotoras || (cache.promotoras = []);
    const i = list.findIndex(function (x) {
      return x.id === p.id;
    });
    if (i >= 0) list[i] = p;
    else list.push(p);
    persist();
    return p.id;
  }

  /** @param {string} id */
  function getPromotoraById(id) {
    const sid = String(id);
    const p = (cache.promotoras || []).find(function (x) {
      return x.id === sid;
    });
    return p ? { ...p } : null;
  }

  /** @param {string} promotoraId */
  function countTabelasByPromotoraId(promotoraId) {
    const pid = String(promotoraId);
    return (cache.tabelas || []).filter(function (t) {
      return String(t.promotoraId || '') === pid;
    }).length;
  }

  function getTabelas() {
    return (cache.tabelas || []).map(function (t) {
      return normalizeTabelaRow(t);
    });
  }

  /** @param {Partial<TabelaBanco> & { id?: string }} row */
  function saveTabela(row) {
    const t = normalizeTabelaRow(row);
    if (!t.id) t.id = newId('tab');
    const list = cache.tabelas || (cache.tabelas = []);
    const i = list.findIndex(function (x) {
      return x.id === t.id;
    });
    if (i >= 0) list[i] = t;
    else list.push(t);
    persist();
    return t.id;
  }

  /** @param {string} id */
  function getTabelaById(id) {
    const sid = String(id);
    const t = (cache.tabelas || []).find(function (x) {
      return x.id === sid;
    });
    return t ? normalizeTabelaRow(t) : null;
  }

  /** @param {string} tabelaId */
  function countOperacoesByTabelaId(tabelaId) {
    const tid = String(tabelaId);
    return cache.operacoes.filter(function (o) {
      return String(o.tabelaId || '') === tid;
    }).length;
  }

  /**
   * Grava a planilha de produção do mês (por vendedora). Toda linha enviada é persistida.
   * @param {string} mes - YYYY-MM
   * @param {Record<string, Record<string, unknown>>} map
   */
  function setProducaoManualMes(mes, map) {
    const m = String(mes);
    if (!cache.producaoManual) cache.producaoManual = {};
    const next = {};
    Object.keys(map || {}).forEach(function (vid) {
      next[String(vid)] = normalizeProducaoManualLinha(map[vid]);
    });
    if (Object.keys(next).length === 0) delete cache.producaoManual[m];
    else cache.producaoManual[m] = next;
    persist();
  }

  /** Rótulos dos perfis na UI. */
  const PERFIL_ACESSO_LABEL = { ADM: 'Administrador (ADM)', LIDER: 'Líder', VENDA: 'Venda' };

  const MaycredData = {
    STORAGE_KEY,
    PRESET_MES,
    ROTAS_PERMISSAO,
    ROTAS_PERMISSAO_LABEL,
    PERFIL_ACESSO_LABEL,
    defaultConfig,
    defaultPermissoesPerfil,
    defaultVendedoras,
    defaultMetas,
    defaultLancamentos,
    defaultDiasUteis,
    loadState,
    saveState,
    getState,
    setConfig,
    setVendedoras,
    addVendedora,
    updateVendedora,
    removeVendedora,
    findVendedoraByLogin,
    loginUsuarioDisponivel,
    getVendedoraById,
    setMetas,
    upsertMeta,
    setLancamentos,
    addLancamento,
    removeLancamento,
    replaceLancamentosVendedoraMes,
    updateLancamento,
    addOperacao,
    updateOperacao,
    removeOperacao,
    updateOperacaoSeDono,
    removeOperacaoSeDono,
    addOperacaoComoVendedora,
    listClientes,
    getClienteById,
    addCliente,
    updateCliente,
    removeCliente,
    getDiasUteisMesPorProduto,
    setDiasUteisMesPorProduto,
    setDiasUteisMes,
    resetToDefaults,
    newId,
    getBancos,
    saveBanco,
    getBancoById,
    getPromotoras,
    savePromotora,
    getPromotoraById,
    countTabelasByPromotoraId,
    getTabelas,
    saveTabela,
    getTabelaById,
    countOperacoesByTabelaId,
    setProducaoManualMes,
    formatConvenioTabela,
    canonicalRotaPerm,
    rotaPermitidaParaPerfil,
    setPermissoesPerfil,
    reload() {
      cache = loadState();
      if (!cache.permissoesPerfil) {
        cache.permissoesPerfil = defaultPermissoesPerfil();
        saveState(cache);
      }
    },
  };

  global.MaycredData = MaycredData;
})(typeof window !== 'undefined' ? window : globalThis);
