/**
 * Tipos de operação Maycred, fluxos de status e impacto na meta (análise × pago).
 * Rentabilidade para meta: sempre valor financiado × % da tabela vinculada (snapshot).
 * Sem tabela ou sem % gravado na proposta: R$ 0 e não entra no somatório de meta.
 */
(function (global) {
  /** @typedef {'NOVO'|'CARTAO'|'PORT'|'PORT_REFIN'} TipoOperacaoMaycred */

  const TIPOS = ['NOVO', 'CARTAO', 'PORT', 'PORT_REFIN'];

  const TIPO_LABEL = {
    NOVO: 'NOVO',
    CARTAO: 'CARTÃO',
    PORT: 'PORT',
    PORT_REFIN: 'PORT+REFIN',
  };

  const TIPO_DESCRICAO = {
    NOVO: 'Contrato novo de consignado',
    CARTAO: 'Cartão de refinanciamento',
    PORT: 'Portabilidade entre bancos',
    PORT_REFIN: 'Portabilidade + refinanciamento',
  };

  const FLUXO_A = 'A';
  const FLUXO_B = 'B';

  /** @param {string} tipo */
  function fluxoDoTipo(tipo) {
    if (tipo === 'NOVO' || tipo === 'CARTAO') return FLUXO_A;
    if (tipo === 'PORT' || tipo === 'PORT_REFIN') return FLUXO_B;
    return FLUXO_A;
  }

  const STATUS_FLUXO_A = [
    'DIGITADO',
    'ANALISE_BLOQUEADO',
    'ANALISE_DESBLOQUEADO',
    'AVERBADO',
    'CANCELADO',
  ];

  const STATUS_FLUXO_B = [
    'PORTABILIDADE',
    'SALDO_DIGITADO',
    'SALDO_PAGO',
    'AVERBADO',
    'CANCELADO',
  ];

  /** Ordem para ação "Avançar status" (exclui Cancelado). */
  const ORDEM_AVANCO_A = ['DIGITADO', 'ANALISE_BLOQUEADO', 'ANALISE_DESBLOQUEADO', 'AVERBADO'];
  const ORDEM_AVANCO_B = ['PORTABILIDADE', 'SALDO_DIGITADO', 'SALDO_PAGO', 'AVERBADO'];

  /**
   * Próximo status no fluxo ou null se já em Averbado / inválido.
   * @param {string} tipo
   * @param {string} status
   * @returns {string|null}
   */
  function proximoStatusNoFluxo(tipo, status) {
    const ordem = fluxoDoTipo(tipo) === FLUXO_B ? ORDEM_AVANCO_B : ORDEM_AVANCO_A;
    const i = ordem.indexOf(status);
    if (i < 0 || i >= ordem.length - 1) return null;
    return ordem[i + 1];
  }

  /**
   * Badge visual do status (cores do spec).
   * @param {string} status
   */
  function classeBadgeStatus(status) {
    switch (status) {
      case 'DIGITADO':
      case 'PORTABILIDADE':
        return 'ui-lanc-status ui-lanc-status--neutro';
      case 'ANALISE_BLOQUEADO':
      case 'SALDO_DIGITADO':
        return 'ui-lanc-status ui-lanc-status--ambar';
      case 'ANALISE_DESBLOQUEADO':
      case 'SALDO_PAGO':
        return 'ui-lanc-status ui-lanc-status--ciano';
      case 'AVERBADO':
        return 'ui-lanc-status ui-lanc-status--verde ui-lanc-status--averbado';
      case 'CANCELADO':
        return 'ui-lanc-status ui-lanc-status--vermelho';
      default:
        return 'ui-lanc-status ui-lanc-status--neutro';
    }
  }

  /**
   * Rótulo da coluna Meta: Análise / Pago / —
   * @param {string} tipo
   * @param {string} status
   */
  function labelMetaImpacto(tipo, status) {
    const f = fluxoDoTipo(tipo);
    const imp = impactoMetaPorStatus(f, status);
    if (status === 'CANCELADO') return '—';
    if (imp.analise) return 'Análise';
    if (imp.pago) return 'Pago';
    return '—';
  }

  const STATUS_LABEL_A = {
    DIGITADO: 'Digitado',
    ANALISE_BLOQUEADO: 'Análise bloqueado',
    ANALISE_DESBLOQUEADO: 'Análise desbloqueado',
    AVERBADO: 'Averbado',
    CANCELADO: 'Cancelado',
  };

  const STATUS_LABEL_B = {
    PORTABILIDADE: 'Portabilidade',
    SALDO_DIGITADO: 'Saldo digitado',
    SALDO_PAGO: 'Saldo pago',
    AVERBADO: 'Averbado',
    CANCELADO: 'Cancelado',
  };

  /** @param {string} fluxo */
  function statusValidos(fluxo) {
    return fluxo === FLUXO_B ? STATUS_FLUXO_B.slice() : STATUS_FLUXO_A.slice();
  }

  /** @param {string} tipo */
  function statusPadraoParaTipo(tipo) {
    return fluxoDoTipo(tipo) === FLUXO_B ? 'PORTABILIDADE' : 'DIGITADO';
  }

  /**
   * Quanto da comissão estimada entra em análise / pado na meta (mutuamente exclusivo por status).
   * @param {string} fluxo 'A' | 'B'
   * @param {string} status
   * @returns {{ analise: boolean, pago: boolean }}
   */
  function impactoMetaPorStatus(fluxo, status) {
    if (fluxo === FLUXO_A) {
      if (status === 'DIGITADO' || status === 'ANALISE_BLOQUEADO') return { analise: true, pago: false };
      if (status === 'ANALISE_DESBLOQUEADO' || status === 'AVERBADO') return { analise: false, pago: true };
      return { analise: false, pago: false };
    }
    if (status === 'PORTABILIDADE' || status === 'SALDO_DIGITADO') return { analise: true, pago: false };
    if (status === 'SALDO_PAGO' || status === 'AVERBADO') return { analise: false, pago: true };
    return { analise: false, pago: false };
  }

  /** @param {string} tipo @param {string} status */
  function statusValidoParaTipo(tipo, status) {
    const f = fluxoDoTipo(tipo);
    return statusValidos(f).indexOf(status) >= 0;
  }

  /**
   * @param {object} cfg - config com comissaoOp* e fallback legado
   */
  function mapaComissoes(cfg) {
    const c = cfg && typeof cfg === 'object' ? cfg : {};
    const cp = Number(c.comissaoPort);
    const ce = Number(c.comissaoEntrante);
    const fallbackPort = Number.isNaN(cp) ? 0 : cp;
    const fallbackEnt = Number.isNaN(ce) ? 0 : ce;
    function pick(key, fallback) {
      const x = Number(c[key]);
      return Number.isNaN(x) ? fallback : Math.min(1, Math.max(0, x));
    }
    return {
      NOVO: pick('comissaoOpNovo', fallbackEnt),
      CARTAO: pick('comissaoOpCartao', fallbackEnt),
      PORT: pick('comissaoOpPort', fallbackPort),
      PORT_REFIN: pick('comissaoOpPortRefin', fallbackPort),
    };
  }

  /**
   * @param {object} cfg
   * @param {string} tipo
   */
  function taxaComissaoTipo(cfg, tipo) {
    const m = mapaComissoes(cfg);
    return m[tipo] != null ? m[tipo] : 0;
  }

  /**
   * Comissão estimada da operação (base × taxa do tipo).
   * @param {number} valorContrato
   * @param {object} cfg
   * @param {string} tipo
   */
  function comissaoEstimada(valorContrato, cfg, tipo) {
    const v = Number(valorContrato);
    const base = Number.isNaN(v) ? 0 : Math.max(0, v);
    return base * taxaComissaoTipo(cfg, tipo);
  }

  /**
   * Proposta válida para rentabilidade na meta: tabela vinculada + % snapshot (0–100%).
   * @param {{ tabelaId?: string, comissaoTabela?: number }} op
   */
  function propostaContaRentabilidadeMeta(op) {
    if (!op || typeof op !== 'object') return false;
    const tid = op.tabelaId != null ? String(op.tabelaId).trim() : '';
    if (!tid) return false;
    if (op.comissaoTabela == null || op.comissaoTabela === '') return false;
    const ct = Number(op.comissaoTabela);
    if (Number.isNaN(ct) || ct < 0 || ct > 1) return false;
    return true;
  }

  /**
   * Rentabilidade em R$: valor financiado × % da tabela (somente se proposta completa).
   * @param {number} valorContrato
   * @param {object} cfg - ignorado (mantido por compatibilidade de assinatura)
   * @param {{ tabelaId?: string, comissaoTabela?: number, tipoOperacao?: string }} op
   */
  function comissaoEstimadaParaOperacao(valorContrato, cfg, op) {
    if (!propostaContaRentabilidadeMeta(op)) return 0;
    const v = Number(valorContrato);
    const base = Number.isNaN(v) ? 0 : Math.max(0, v);
    const ct = Number(op.comissaoTabela);
    return base * ct;
  }

  /** @param {string} tipo */
  function chipClass(tipo) {
    switch (tipo) {
      case 'NOVO':
        return 'ui-chip ui-chip--op-novo';
      case 'CARTAO':
        return 'ui-chip ui-chip--op-cartao';
      case 'PORT':
        return 'ui-chip ui-chip--op-port';
      case 'PORT_REFIN':
        return 'ui-chip ui-chip--op-port-refin';
      default:
        return 'ui-chip';
    }
  }

  /** @param {string} tipo @param {string} status */
  function labelStatus(tipo, status) {
    const f = fluxoDoTipo(tipo);
    if (f === FLUXO_B) return STATUS_LABEL_B[status] || status;
    return STATUS_LABEL_A[status] || status;
  }

  /** Rótulo para filtros (status pode ser de fluxo A ou B). */
  function labelStatusFiltro(status) {
    if (status === 'DIGITADO' || status === 'ANALISE_BLOQUEADO' || status === 'ANALISE_DESBLOQUEADO') {
      return labelStatus('NOVO', status);
    }
    if (status === 'PORTABILIDADE' || status === 'SALDO_DIGITADO' || status === 'SALDO_PAGO') {
      return labelStatus('PORT', status);
    }
    return labelStatus('NOVO', status);
  }

  global.MaycredOperacoes = {
    TIPOS,
    TIPO_LABEL,
    TIPO_DESCRICAO,
    FLUXO_A,
    FLUXO_B,
    ORDEM_AVANCO_A,
    ORDEM_AVANCO_B,
    fluxoDoTipo,
    statusValidos,
    statusPadraoParaTipo,
    proximoStatusNoFluxo,
    classeBadgeStatus,
    labelMetaImpacto,
    impactoMetaPorStatus,
    statusValidoParaTipo,
    mapaComissoes,
    taxaComissaoTipo,
    comissaoEstimada,
    propostaContaRentabilidadeMeta,
    comissaoEstimadaParaOperacao,
    chipClass,
    labelStatus,
    labelStatusFiltro,
  };
})(typeof window !== 'undefined' ? window : globalThis);
