/**
 * Fórmulas de metas e performance (sem efeitos colaterais).
 */
(function (global) {
  /**
   * @param {{ produto: 'PORT'|'ENTRANTE' }} vendedora
   * @param {number} comissaoPort
   * @param {number} comissaoEntrante
   */
  function taxaComissaoVendedora(vendedora, comissaoPort, comissaoEntrante) {
    return vendedora.produto === 'PORT' ? comissaoPort : comissaoEntrante;
  }

  /**
   * Performance de uma vendedora no mês.
   * Soma operações cadastradas (comissão × status no fluxo A/B) + lançamentos legados (produção/pago).
   *
   * @param {{ produto: 'PORT'|'ENTRANTE', id: string }} vendedora
   * @param {{ metaProducao: number }|null|undefined} meta — `metaProducao` no JSON é o alvo de rentabilidade (R$ comissão), não produção bruta
   * @param {string} mes - YYYY-MM
   * @param {Array<{ tipo: 'producao'|'pago', valor: number, produto?: 'PORT'|'ENTRANTE', analiseOverride?: number, vendedoraId?: string, mes?: string }>} lancamentos - já filtrados pelo mês
   * @param {object} bundle - `getState()` ou `{ config, operacoes, lancamentos, ... }`
   */
  function calcVendedora(vendedora, meta, mes, lancamentos, bundle) {
    const list = Array.isArray(lancamentos) ? lancamentos : [];
    const u = unpackTeamBundle(bundle);
    const comissaoPort = u.comissaoPort;
    const comissaoEntrante = u.comissaoEntrante;
    const cfg = bundle && bundle.config && typeof bundle.config === 'object' ? bundle.config : {};
    const operacoes = Array.isArray(u.operacoes) ? u.operacoes : [];
    const MO = global.MaycredOperacoes;

    let producaoBruta = 0;
    let analise = 0;
    let pago = 0;

    for (let i = 0; i < operacoes.length; i++) {
      const op = operacoes[i];
      if (!op || String(op.vendedoraId) !== String(vendedora.id) || String(op.mes) !== String(mes)) continue;
      const tipo = op.tipoOperacao;
      if (!tipo || !MO) continue;
      const vc = Number(op.valorContrato);
      const bruto = Number.isNaN(vc) ? 0 : Math.max(0, vc);
      producaoBruta += bruto;
      const fluxo = MO.fluxoDoTipo(tipo);
      const imp = MO.impactoMetaPorStatus(fluxo, op.status);
      const comm = MO.comissaoEstimadaParaOperacao
        ? MO.comissaoEstimadaParaOperacao(bruto, cfg, op)
        : 0;
      if (imp.analise) analise += comm;
      if (imp.pago) pago += comm;
    }

    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const v = Number(l.valor);
      if (Number.isNaN(v)) continue;
      if (l.tipo === 'producao') {
        producaoBruta += v;
        const prod = l.produto === 'ENTRANTE' || l.produto === 'PORT' ? l.produto : vendedora.produto;
        const taxaLinha = prod === 'PORT' ? comissaoPort : comissaoEntrante;
        const ao = l.analiseOverride;
        if (typeof ao === 'number' && !Number.isNaN(ao)) analise += ao;
        else analise += v * taxaLinha;
      } else if (l.tipo === 'pago') {
        pago += v;
      }
    }

    const metaProducao = meta && typeof meta.metaProducao === 'number' ? meta.metaProducao : 0;
    const total = analise + pago;
    const falta = metaProducao - total;
    const denom = metaProducao > 0 ? metaProducao : 0;
    const pctGestor = denom ? (total / denom) * 100 : 0;
    const pctVendedora = denom ? (pago / denom) * 100 : 0;

    return {
      producaoBruta,
      analise,
      pago,
      total,
      falta,
      pctGestor,
      pctVendedora,
    };
  }

  /**
   * Indicadores diários.
   * metaDiaria = quanto falta por dia útil restante para bater a meta.
   * ritmoMedio = meta repartida pelos dias úteis totais do mês.
   * status: ritmo exigido vs ritmo médio (ok / alerta / critico).
   *
   * @param {number} falta
   * @param {number} diasUteisRestantes
   * @param {number} metaProducao
   * @param {number} diasUteisTotais
   */
  function calcMetaDiaria(falta, diasUteisRestantes, metaProducao, diasUteisTotais) {
    const rest = Math.max(0, Math.floor(Number(diasUteisRestantes)) || 0);
    const tot = Math.max(0, Math.floor(Number(diasUteisTotais)) || 0);
    const meta = Number(metaProducao);
    const f = Number(falta);

    const ritmoMedio = tot > 0 && !Number.isNaN(meta) ? meta / tot : 0;
    let metaDiaria = 0;
    if (f > 0 && rest > 0) metaDiaria = f / rest;
    else if (f > 0 && rest === 0) metaDiaria = f;

    let status = 'ok';
    if (f > 0) {
      if (rest === 0) status = 'critico';
      else if (ritmoMedio > 0) {
        const ratio = metaDiaria / ritmoMedio;
        if (ratio > 1.25) status = 'critico';
        else if (ratio > 1.05) status = 'alerta';
      }
    }

    return { metaDiaria, ritmoMedio, status };
  }

  /**
   * Extrai comissões e listas do terceiro argumento (estado da app ou objeto plano).
   * @param {object} bundle
   */
  function unpackTeamBundle(bundle) {
    const b = bundle && typeof bundle === 'object' ? bundle : {};
    const cfg = b.config && typeof b.config === 'object' ? b.config : b;
    const comissaoPort = Number(cfg.comissaoPort);
    const comissaoEntrante = Number(cfg.comissaoEntrante);
    const spr = Number(cfg.spreadBanco);
    const spreadBanco = Number.isNaN(spr) ? 0 : Math.min(1, Math.max(0, spr));
    const co = Number(cfg.custoOperacionalMes);
    const custoOperacionalMes = Number.isNaN(co) ? 0 : Math.max(0, co);
    const metas = Array.isArray(b.metas) ? b.metas : [];
    const lancamentos = Array.isArray(b.lancamentos) ? b.lancamentos : [];
    const operacoes = Array.isArray(b.operacoes) ? b.operacoes : [];
    return {
      comissaoPort: Number.isNaN(comissaoPort) ? 0 : comissaoPort,
      comissaoEntrante: Number.isNaN(comissaoEntrante) ? 0 : comissaoEntrante,
      spreadBanco,
      custoOperacionalMes,
      metas,
      lancamentos,
      operacoes,
    };
  }

  /**
   * Totais consolidados do time no mês.
   * @param {Array<{ id: string, produto: 'PORT'|'ENTRANTE' }>} todasVendedoras
   * @param {string} mes - YYYY-MM
   * @param {object} config - use `getState()` ou `{ config, metas, lancamentos }`
   */
  function calcTime(todasVendedoras, mes, config) {
    const { metas, lancamentos } = unpackTeamBundle(config);
    const vendas = Array.isArray(todasVendedoras) ? todasVendedoras : [];

    let metaTotal = 0;
    let producaoTotal = 0;
    let analiseTotal = 0;
    let pagoTotal = 0;
    let totalTotal = 0;

    for (let i = 0; i < vendas.length; i++) {
      const v = vendas[i];
      const meta = metas.find((m) => m.vendedoraId === v.id && m.mes === mes) || null;
      const lancs = lancamentos.filter((l) => l.vendedoraId === v.id && l.mes === mes);
      const row = calcVendedora(v, meta, mes, lancs, config);
      metaTotal += meta && typeof meta.metaProducao === 'number' ? meta.metaProducao : 0;
      producaoTotal += row.producaoBruta;
      analiseTotal += row.analise;
      pagoTotal += row.pago;
      totalTotal += row.total;
    }

    const faltaTotal = metaTotal - totalTotal;
    const pctGeral = metaTotal > 0 ? (totalTotal / metaTotal) * 100 : 0;

    return {
      metaTotal,
      producaoTotal,
      analiseTotal,
      pagoTotal,
      totalTotal,
      faltaTotal,
      pctGeral,
    };
  }

  /**
   * Snapshot único do mês: totais do time, linhas por vendedora e indicadores derivados
   * (ticket médio da produção, taxa efetiva análise/bruto — útil para mix PORT × ENTRANTE).
   *
   * @param {Array<{ id: string, produto: 'PORT'|'ENTRANTE' }>} todasVendedoras
   * @param {string} mes - YYYY-MM
   * @param {object} bundle - `getState()` ou `{ config, metas, lancamentos }`
   */
  function computeMesSnapshot(todasVendedoras, mes, bundle) {
    const unpacked = unpackTeamBundle(bundle);
    const { spreadBanco, custoOperacionalMes, metas, lancamentos, operacoes } = unpacked;
    const vendas = Array.isArray(todasVendedoras) ? todasVendedoras : [];
    const list = Array.isArray(lancamentos) ? lancamentos : [];
    const opsList = Array.isArray(operacoes) ? operacoes : [];
    const linhas = [];

    for (let i = 0; i < vendas.length; i++) {
      const v = vendas[i];
      const meta = metas.find((m) => m.vendedoraId === v.id && m.mes === mes) || null;
      const lancs = list.filter((l) => l.vendedoraId === v.id && l.mes === mes);
      const row = calcVendedora(v, meta, mes, lancs, bundle);
      const nOpsProducaoV =
        lancs.filter((l) => l.tipo === 'producao').length +
        opsList.filter((o) => o.vendedoraId === v.id && o.mes === mes).length;
      linhas.push({ vendedora: v, meta, lancamentos: lancs, row, nOpsProducao: nOpsProducaoV });
    }

    const team = calcTime(todasVendedoras, mes, bundle);
    const lancsProducaoMes = list.filter((l) => l.mes === mes && l.tipo === 'producao');
    const nOpsProducao =
      lancsProducaoMes.length + opsList.filter((o) => o.mes === mes).length;
    const ticketMedioProducao = nOpsProducao > 0 ? team.producaoTotal / nOpsProducao : 0;
    const taxaEfetivaAnalise = team.producaoTotal > 0 ? team.analiseTotal / team.producaoTotal : 0;

    const producaoLiquidaEstimada = team.producaoTotal * (1 - spreadBanco);
    const producaoLiquidaMenosCustos = producaoLiquidaEstimada - custoOperacionalMes;
    const indiceAnaliseSobreCusto =
      custoOperacionalMes > 0 ? team.analiseTotal / custoOperacionalMes : null;

    const rentabilidade = {
      spreadBanco,
      custoOperacionalMes,
      producaoLiquidaEstimada,
      producaoLiquidaMenosCustos,
      indiceAnaliseSobreCusto,
    };

    return {
      mes,
      team,
      linhas,
      nOpsProducao,
      ticketMedioProducao,
      taxaEfetivaAnalise,
      rentabilidade,
    };
  }

  /**
   * Simula inclusão de produção bruta extra (impacto na analise via comissão).
   * Passe `vendedora` com `.total` já calculado (ex.: spread do retorno de calcVendedora).
   *
   * @param {{ total?: number }} vendedora
   * @param {number} valorExtra - produção bruta adicional
   * @param {number} metaProducao
   * @param {number} comissao - taxa do produto (decimal)
   */
  /**
   * Meta “batida” na visão vendedora: rentabilidade paga (R$) ≥ meta de rentabilidade (R$).
   * @param {number} metaProducao — alvo de rentabilidade (nome legado no armazenamento)
   * @param {number} pago — soma rentabilidade em status “pago”
   */
  function metaBatidaVendedora(metaProducao, pago) {
    const m = Number(metaProducao);
    const p = Number(pago);
    if (!(m > 0)) return false;
    return p >= m;
  }

  /**
   * Faixas para UI vendedora (% = Pago ÷ Meta × 100).
   * @param {number} pctVendedora
   * @returns {'vermelho'|'ambar'|'verde'|'dourado'}
   */
  function faixaDesempenhoVendedora(pctVendedora) {
    const x = Number(pctVendedora);
    if (!Number.isFinite(x)) return 'vermelho';
    if (x >= 100) return 'dourado';
    if (x >= 70) return 'verde';
    if (x >= 40) return 'ambar';
    return 'vermelho';
  }

  /**
   * @param {'vermelho'|'ambar'|'verde'|'dourado'} faixa
   */
  function mensagemMotivacional(faixa) {
    switch (faixa) {
      case 'dourado':
        return 'Meta batida no pago. Parabéns pelo resultado!';
      case 'verde':
        return 'Ótimo ritmo — continue firme até consolidar tudo no pago.';
      case 'ambar':
        return 'Você está no caminho. Acelere as próximas operações para subir de faixa.';
      default:
        return 'Hora de focar: cada operação confirmada no pago aproxima você da meta.';
    }
  }

  function calcSimulacao(vendedora, valorExtra, metaProducao, comissao) {
    const totalAtual = vendedora && typeof vendedora.total === 'number' ? vendedora.total : 0;
    const extra = Number(valorExtra);
    const meta = Number(metaProducao);
    const taxa = Number(comissao);
    const delta = (Number.isNaN(extra) ? 0 : extra) * (Number.isNaN(taxa) ? 0 : taxa);
    const totalComExtra = totalAtual + delta;
    const denom = meta > 0 ? meta : 0;
    const pctAtual = denom ? (totalAtual / denom) * 100 : 0;
    const pctComExtra = denom ? (totalComExtra / denom) * 100 : 0;
    const faltaPara100 = Math.max(0, meta - totalComExtra);

    return { pctAtual, pctComExtra, faltaPara100 };
  }

  global.MaycredCalc = {
    calcVendedora,
    calcMetaDiaria,
    calcTime,
    computeMesSnapshot,
    calcSimulacao,
    taxaComissaoVendedora,
    metaBatidaVendedora,
    faixaDesempenhoVendedora,
    mensagemMotivacional,
  };
})(typeof window !== 'undefined' ? window : globalThis);
