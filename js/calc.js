/**
 * Fórmulas de metas e performance (sem efeitos colaterais).
 */
(function (global) {
  /**
   * @param {object} bundle
   * @param {string} mes
   * @param {string} vendedoraId
   */
  /** Linha da planilha de produção do mês (se existir chave, vale o preenchimento manual). */
  function readProducaoManualRow(bundle, mes, vendedoraId) {
    const pm = bundle && bundle.producaoManual && typeof bundle.producaoManual === 'object' ? bundle.producaoManual[String(mes)] : null;
    if (!pm) return null;
    const row = pm[String(vendedoraId)];
    if (!row || typeof row !== 'object') return null;
    return row;
  }

  /**
   * @param {{ produto: 'PORT'|'ENTRANTE' }} vendedora
   * @param {number} comissaoPort
   * @param {number} comissaoEntrante
   */
  function taxaComissaoVendedora(vendedora, comissaoPort, comissaoEntrante) {
    return vendedora.produto === 'PORT' ? comissaoPort : comissaoEntrante;
  }

  /**
   * @param {{ metaProducao?: number, metaRentabilidade?: number, metaProducaoTotal?: number, metaAverbacao?: number }|null|undefined} meta
   */
  function parseMetaTargets(meta) {
    const m = meta && typeof meta === 'object' ? meta : {};
    const rent = Number(m.metaRentabilidade != null && m.metaRentabilidade !== '' ? m.metaRentabilidade : m.metaProducao);
    const vol = Number(m.metaProducaoTotal);
    const averb = Number(m.metaAverbacao);
    const metaRent = Number.isFinite(rent) && rent >= 0 ? rent : 0;
    const metaVol = Number.isFinite(vol) && vol >= 0 ? vol : 0;
    const metaAverb = Number.isFinite(averb) && averb >= 0 ? averb : 0;
    return { metaRent, metaVol, metaAverb };
  }

  /**
   * Performance de uma vendedora no mês.
   * Soma operações cadastradas (comissão × status no fluxo A/B) + lançamentos legados (produção/pago).
   *
   * @param {{ produto: 'PORT'|'ENTRANTE', id: string }} vendedora
   * @param {{ metaProducao?: number, metaRentabilidade?: number, metaProducaoTotal?: number, metaAverbacao?: number }|null|undefined} meta
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
    let producaoBrutaAnalise = 0;
    let producaoBrutaAverbada = 0;
    let analise = 0;
    let pago = 0;
    let rentabilidadeAverbada = 0;

    for (let i = 0; i < operacoes.length; i++) {
      const op = operacoes[i];
      if (!op || String(op.vendedoraId) !== String(vendedora.id) || String(op.mes) !== String(mes)) continue;
      const tipo = op.tipoOperacao;
      if (!tipo || !MO) continue;
      if (op.status === 'CANCELADO') continue;
      const vc = Number(op.valorContrato);
      const bruto = Number.isNaN(vc) ? 0 : Math.max(0, vc);
      producaoBruta += bruto;
      const fluxo = MO.fluxoDoTipo(tipo);
      const imp = MO.impactoMetaPorStatus(fluxo, op.status);
      const comm = MO.comissaoEstimadaParaOperacao
        ? MO.comissaoEstimadaParaOperacao(bruto, cfg, op)
        : 0;
      if (imp.analise) {
        producaoBrutaAnalise += bruto;
        analise += comm;
      }
      if (op.status === 'AVERBADO') {
        producaoBrutaAverbada += bruto;
        rentabilidadeAverbada += comm;
      }
      if (imp.pago) pago += comm;
    }

    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      const v = Number(l.valor);
      if (Number.isNaN(v)) continue;
      if (l.tipo === 'producao') {
        producaoBruta += v;
        producaoBrutaAnalise += v;
        const prod = l.produto === 'ENTRANTE' || l.produto === 'PORT' ? l.produto : vendedora.produto;
        const taxaLinha = prod === 'PORT' ? comissaoPort : comissaoEntrante;
        const ao = l.analiseOverride;
        if (typeof ao === 'number' && !Number.isNaN(ao)) analise += ao;
        else analise += v * taxaLinha;
      } else if (l.tipo === 'pago') {
        pago += v;
        rentabilidadeAverbada += v;
      }
    }

    const manual = readProducaoManualRow(bundle, mes, vendedora.id);
    if (manual) {
      const taxa = taxaComissaoVendedora(vendedora, comissaoPort, comissaoEntrante);
      const tb = typeof manual.totalBruto === 'number' && !Number.isNaN(manual.totalBruto) ? manual.totalBruto : 0;
      const ba = typeof manual.brutoAnalise === 'number' && !Number.isNaN(manual.brutoAnalise) ? manual.brutoAnalise : 0;
      const tbUse = tb > 0 ? tb : ba;
      producaoBruta = tbUse;
      producaoBrutaAnalise = ba > 0 ? ba : 0;
      producaoBrutaAverbada = Math.max(0, tbUse - producaoBrutaAnalise);
      const alRaw = manual.analiseLiquido;
      if (typeof alRaw === 'number' && !Number.isNaN(alRaw)) {
        analise = alRaw;
      } else if (ba > 0) {
        analise = ba * taxa;
      } else {
        analise = 0;
      }
      const pg = manual.pago;
      pago = typeof pg === 'number' && !Number.isNaN(pg) ? pg : 0;
      rentabilidadeAverbada = pago;
    }

    const { metaRent, metaVol, metaAverb } = parseMetaTargets(meta);
    const total = analise + pago;
    const faltaRent = metaRent - total;
    const faltaProducao = metaVol - producaoBruta;
    const faltaAverbacao = metaAverb > 0 ? metaAverb - producaoBrutaAverbada : 0;
    const denomRent = metaRent > 0 ? metaRent : 0;
    const denomVol = metaVol > 0 ? metaVol : 0;
    const denomAverb = metaAverb > 0 ? metaAverb : 0;
    const pctGestor = denomRent ? (total / denomRent) * 100 : 0;
    const pctVendedora = denomRent ? (pago / denomRent) * 100 : 0;
    const pctMetaProducaoTotal = denomVol ? (producaoBruta / denomVol) * 100 : 0;
    const pctMetaAverbacao = denomAverb ? (producaoBrutaAverbada / denomAverb) * 100 : 0;

    const pctCommAnalise = producaoBrutaAnalise > 0 ? (analise / producaoBrutaAnalise) * 100 : 0;
    const pctCommAverbada = producaoBrutaAverbada > 0 ? (rentabilidadeAverbada / producaoBrutaAverbada) * 100 : 0;
    const pctCommTotal = producaoBruta > 0 ? (total / producaoBruta) * 100 : 0;

    return {
      producaoBruta,
      producaoBrutaAnalise,
      producaoBrutaAverbada,
      rentabilidadeAverbada,
      analise,
      pago,
      total,
      metaRentabilidade: metaRent,
      metaProducaoTotal: metaVol,
      metaAverbacao: metaAverb,
      falta: faltaRent,
      faltaRent,
      faltaProducao,
      faltaAverbacao,
      pctGestor,
      pctVendedora,
      pctMetaProducaoTotal,
      pctMetaAverbacao,
      pctCommAnalise,
      pctCommAverbada,
      pctCommTotal,
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
    let metaProducaoTotalSoma = 0;
    let metaAverbacaoSoma = 0;
    let producaoTotal = 0;
    let producaoBrutaAnaliseTotal = 0;
    let producaoBrutaAverbadaTotal = 0;
    let analiseTotal = 0;
    let pagoTotal = 0;
    let totalTotal = 0;
    let rentabilidadeAverbadaTotal = 0;

    for (let i = 0; i < vendas.length; i++) {
      const v = vendas[i];
      const meta = metas.find((m) => m.vendedoraId === v.id && m.mes === mes) || null;
      const lancs = lancamentos.filter((l) => l.vendedoraId === v.id && l.mes === mes);
      const row = calcVendedora(v, meta, mes, lancs, config);
      const mt = parseMetaTargets(meta);
      metaTotal += mt.metaRent;
      metaProducaoTotalSoma += mt.metaVol;
      metaAverbacaoSoma += mt.metaAverb;
      producaoTotal += row.producaoBruta;
      producaoBrutaAnaliseTotal += row.producaoBrutaAnalise;
      producaoBrutaAverbadaTotal += row.producaoBrutaAverbada;
      analiseTotal += row.analise;
      pagoTotal += row.pago;
      totalTotal += row.total;
      rentabilidadeAverbadaTotal += row.rentabilidadeAverbada;
    }

    const faltaTotal = metaTotal - totalTotal;
    const faltaProducaoTotal = metaProducaoTotalSoma - producaoTotal;
    const faltaAverbacaoTotal = metaAverbacaoSoma > 0 ? metaAverbacaoSoma - producaoBrutaAverbadaTotal : 0;
    const pctGeral = metaTotal > 0 ? (totalTotal / metaTotal) * 100 : 0;
    const pctProducaoGeral = metaProducaoTotalSoma > 0 ? (producaoTotal / metaProducaoTotalSoma) * 100 : 0;
    const pctAverbacaoGeral = metaAverbacaoSoma > 0 ? (producaoBrutaAverbadaTotal / metaAverbacaoSoma) * 100 : 0;

    return {
      metaTotal,
      metaProducaoTotalSoma,
      metaAverbacaoSoma,
      producaoTotal,
      producaoBrutaAnaliseTotal,
      producaoBrutaAverbadaTotal,
      analiseTotal,
      pagoTotal,
      totalTotal,
      rentabilidadeAverbadaTotal,
      faltaTotal,
      faltaProducaoTotal,
      faltaAverbacaoTotal,
      pctGeral,
      pctProducaoGeral,
      pctAverbacaoGeral,
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
      let nOpsProducaoV =
        lancs.filter((l) => l.tipo === 'producao').length +
        opsList.filter((o) => o.vendedoraId === v.id && o.mes === mes).length;
      if (readProducaoManualRow(bundle, mes, v.id) && (row.producaoBruta > 0 || row.total > 0)) {
        nOpsProducaoV = Math.max(1, nOpsProducaoV);
      }
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

  /**
   * Simulação na visão vendedora: % pelo pago (sem expor meta em R$ na UI).
   * Assume o valor extra como rentabilidade que cairia no “pago” (ex.: operação já averbada).
   * @param {{ pago: number }} row — retorno de calcVendedora
   * @param {number} valorFinanciadoExtra
   * @param {number} comissaoDecimal — ex.: 0,40
   * @param {number} metaProducao
   */
  function calcSimulacaoVendedoraPago(row, valorFinanciadoExtra, comissaoDecimal, metaProducao) {
    const pago = row && typeof row.pago === 'number' ? row.pago : 0;
    const meta = Number(metaProducao);
    const vf = Number(valorFinanciadoExtra);
    const taxa = Number(comissaoDecimal);
    const delta =
      (Number.isNaN(vf) ? 0 : Math.max(0, vf)) * (Number.isNaN(taxa) ? 0 : Math.min(1, Math.max(0, taxa)));
    const pctAtual = meta > 0 ? (pago / meta) * 100 : 0;
    const pctComExtra = meta > 0 ? ((pago + delta) / meta) * 100 : 0;
    return {
      pctAtual: Math.round(pctAtual * 100) / 100,
      pctComExtra: Math.round(pctComExtra * 100) / 100,
      faltaPctPara100: Math.max(0, Math.round((100 - pctComExtra) * 100) / 100),
    };
  }

  global.MaycredCalc = {
    calcVendedora,
    parseMetaTargets,
    calcMetaDiaria,
    calcTime,
    computeMesSnapshot,
    calcSimulacao,
    calcSimulacaoVendedoraPago,
    taxaComissaoVendedora,
    metaBatidaVendedora,
    faixaDesempenhoVendedora,
    mensagemMotivacional,
  };
})(typeof window !== 'undefined' ? window : globalThis);
