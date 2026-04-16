/**
 * Sessão em sessionStorage — gestor ou vendedora (SHA-256 na senha da vendedora).
 */
(function (global) {
  const STORAGE_KEY = 'maycred-sessao';
  /** Contexto de correspondente quando o login é só gestor (sem vendedoraId na sessão). */
  const GESTOR_VID_KEY = 'maycred-gestor-vid';

  /**
   * @param {string} plain
   * @returns {Promise<string>} hex minúsculo
   */
  function sha256Hex(plain) {
    if (typeof global.crypto === 'undefined' || !crypto.subtle) {
      return Promise.reject(new Error('Web Crypto API indisponível neste navegador.'));
    }
    const enc = new TextEncoder().encode(String(plain));
    return crypto.subtle.digest('SHA-256', enc).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) {
          return b.toString(16).padStart(2, '0');
        })
        .join('');
    });
  }

  /** @returns {{ perfil: 'gestor' } | { perfil: 'vendedora', vendedoraId: string } | null} */
  function readSessao() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== 'object') return null;
      if (o.perfil === 'gestor') return { perfil: 'gestor' };
      if (o.perfil === 'vendedora' && o.vendedoraId) {
        return { perfil: 'vendedora', vendedoraId: String(o.vendedoraId) };
      }
      return null;
    } catch {
      return null;
    }
  }

  /** @param {{ perfil: 'gestor' } | { perfil: 'vendedora', vendedoraId: string }} obj */
  function writeSessao(obj) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }

  /**
   * @param {string} senha
   * @returns {boolean}
   */
  function loginGestor(senha) {
    if (typeof global.MaycredData === 'undefined') return false;
    const cfg = global.MaycredData.getState().config;
    if (String(senha) !== String(cfg.senhaGestor)) return false;
    writeSessao({ perfil: 'gestor' });
    return true;
  }

  /**
   * @param {string} usuario
   * @param {string} senha
   * @returns {Promise<boolean>}
   */
  function loginVendedora(usuario, senha) {
    if (typeof global.MaycredData === 'undefined') return Promise.resolve(false);
    const v = global.MaycredData.findVendedoraByLogin(usuario);
    if (!v || !v.senhaHashHex) return Promise.resolve(false);
    return sha256Hex(senha).then(function (hex) {
      if (hex !== v.senhaHashHex) return false;
      writeSessao({ perfil: 'vendedora', vendedoraId: v.id });
      return true;
    });
  }

  /** @deprecated use loginGestor */
  function login(senha) {
    return loginGestor(senha);
  }

  function logout() {
    sessionStorage.removeItem(STORAGE_KEY);
    try {
      sessionStorage.removeItem(GESTOR_VID_KEY);
    } catch (_) {}
  }

  function isGestor() {
    const s = readSessao();
    return s !== null && s.perfil === 'gestor';
  }

  function isVendedora() {
    const s = readSessao();
    return s !== null && s.perfil === 'vendedora';
  }

  /** Vendedora com perfil Venda: opera no app de campo (não vê painel completo do gestor). */
  function isVendedoraCampo() {
    return isVendedora() && !hasPainelGestor();
  }

  /**
   * ADM ou Líder: mesmo painel lateral do gestor, com rotas filtradas por permissão.
   * Venda: área da vendedora (desempenho, pipeline, clientes, propostas, simulador).
   */
  function hasPainelGestor() {
    if (isGestor()) return true;
    if (!isVendedora()) return false;
    const p = getPerfilAcessoAtual();
    return p === 'ADM' || p === 'LIDER';
  }

  /**
   * Perfil de acesso do cadastro (ou ADM implícito na sessão gestor).
   * @returns {'ADM'|'LIDER'|'VENDA'}
   */
  function getPerfilAcessoAtual() {
    if (isGestor()) return 'ADM';
    const id = getVendedoraIdAtiva();
    if (!id || typeof global.MaycredData === 'undefined') return 'VENDA';
    const v = global.MaycredData.getVendedoraById(id);
    const pa = v && v.perfilAcesso ? String(v.perfilAcesso).toUpperCase() : 'VENDA';
    if (pa === 'ADM' || pa === 'LIDER' || pa === 'VENDA') return pa;
    return 'VENDA';
  }

  /** @param {string} tela - valor de `data-tela` / rota */
  function rotaPermitida(tela) {
    if (isGestor()) return true;
    if (!hasPainelGestor()) return false;
    const t = String(tela || '');
    if (t.indexOf('vend') === 0) return true;
    const perfil = getPerfilAcessoAtual();
    if (typeof global.MaycredData === 'undefined') return false;
    return global.MaycredData.rotaPermitidaParaPerfil(perfil, tela);
  }

  /** @returns {'gestor'|'vendedora'|null} */
  function getPerfil() {
    const s = readSessao();
    return s ? s.perfil : null;
  }

  /** @returns {string|null} */
  function getVendedoraIdAtiva() {
    const s = readSessao();
    if (s && s.perfil === 'vendedora') return s.vendedoraId;
    return null;
  }

  /** @returns {string} */
  function getGestorVendedoraContext() {
    try {
      const raw = sessionStorage.getItem(GESTOR_VID_KEY);
      return raw ? String(raw) : '';
    } catch {
      return '';
    }
  }

  /** @param {string} [id] - omitir limpa o contexto */
  function setGestorVendedoraContext(id) {
    try {
      if (!id) sessionStorage.removeItem(GESTOR_VID_KEY);
      else sessionStorage.setItem(GESTOR_VID_KEY, String(id));
    } catch (_) {}
  }

  function getPrimeiraVendedoraId() {
    if (typeof global.MaycredData === 'undefined') return null;
    const list = global.MaycredData.getState().vendedoras;
    if (!Array.isArray(list) || !list.length) return null;
    const v0 = list[0];
    return v0 && v0.id ? String(v0.id) : null;
  }

  /**
   * ID do correspondente para telas de campo: sessão vendedora ou gestor com contexto / primeiro cadastro.
   * @returns {string|null}
   */
  function getVendedoraIdOperacional() {
    if (isVendedora()) return getVendedoraIdAtiva();
    if (isGestor()) {
      const stored = getGestorVendedoraContext();
      if (stored && global.MaycredData && global.MaycredData.getVendedoraById(stored)) return stored;
      return getPrimeiraVendedoraId();
    }
    return null;
  }

  function isLoggedIn() {
    return readSessao() !== null;
  }

  function getNomePerfilAtivo() {
    if (isGestor()) return 'Gestor (acesso total)';
    const id = getVendedoraIdAtiva();
    if (id && global.MaycredData) {
      const v = global.MaycredData.getVendedoraById(id);
      if (v) {
        const L = global.MaycredData.PERFIL_ACESSO_LABEL || {};
        const tag = L[v.perfilAcesso] || v.perfilAcesso || 'Venda';
        return v.nome + ' · ' + tag;
      }
    }
    return 'Equipe';
  }

  global.MaycredAuth = {
    sha256Hex,
    login,
    loginGestor,
    loginVendedora,
    logout,
    isGestor,
    isVendedora,
    isVendedoraCampo,
    hasPainelGestor,
    getPerfilAcessoAtual,
    rotaPermitida,
    getPerfil,
    getVendedoraIdAtiva,
    getGestorVendedoraContext,
    setGestorVendedoraContext,
    getVendedoraIdOperacional,
    isLoggedIn,
    getNomePerfilAtivo,
  };
})(typeof window !== 'undefined' ? window : globalThis);
