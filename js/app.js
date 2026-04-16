/**
 * Shell: login (gestor | vendedora), header, navegação e roteamento.
 */
(function (global) {
  const root = document.getElementById('app');
  if (!root) return;

  function safeDestroyCharts() {
    try {
      if (typeof MaycredUI !== 'undefined' && MaycredUI.destroyCharts) MaycredUI.destroyCharts();
    } catch (_) {}
  }

  if (
    typeof MaycredData === 'undefined' ||
    typeof MaycredOperacoes === 'undefined' ||
    typeof MaycredAuth === 'undefined' ||
    typeof MaycredUI === 'undefined' ||
    typeof MaycredCalc === 'undefined' ||
    typeof MaycredCalendar === 'undefined' ||
    typeof MaycredVendUI === 'undefined'
  ) {
    root.className = 'app app--boot-err';
    root.innerHTML =
      '<div class="boot-err">' +
      '<strong>Não foi possível carregar o app.</strong>' +
      '<p>Os arquivos em <code>js/</code> precisam estar na mesma pasta que este <code>index.html</code> (pasta <code>maycred-metas</code>).</p>' +
      '<p>Abra o arquivo <code>maycred-metas/index.html</code> ou rode na pasta do projeto:</p>' +
      '<pre>npx --yes serve .</pre>' +
      '<p>e acesse o endereço que aparecer (ex.: <code>http://localhost:3000</code>).</p>' +
      '</div>';
    return;
  }

  /** @type {string|null} */
  let telaAtual = null;

  /** Rota ativa na área vendedora (perfil Venda). */
  let telaVendedoraAtual = 'vendDesempenho';

  const ROTAS_VENDEDORA = [
    ['vendDesempenho', 'Desempenho'],
    ['vendPipeline', 'Pipeline'],
    ['vendClientes', 'Clientes'],
    ['vendPropostas', 'Propostas'],
    ['vendSimulador', 'Simulador'],
  ];

  function navigateVendedora(tela) {
    safeDestroyCharts();
    const content = document.getElementById('app-content');
    if (!content || !MaycredAuth.isLoggedIn()) return;

    const permitidas = ROTAS_VENDEDORA.map(function (p) {
      return p[0];
    });
    const t = permitidas.indexOf(tela) >= 0 ? tela : 'vendDesempenho';
    telaVendedoraAtual = t;

    document.querySelectorAll('.app-vend-tab').forEach(function (b) {
      b.classList.toggle('app-vend-tab--active', b.getAttribute('data-tela') === t);
    });

    MaycredVendUI.paint(content, t);
  }

  function primeiraRotaLiberada() {
    const ordem = ['dashboard', 'producao', 'configuracoes'];
    for (let i = 0; i < ordem.length; i++) {
      if (MaycredAuth.rotaPermitida(ordem[i])) return ordem[i];
    }
    return null;
  }

  function navigate(tela) {
    if (MaycredAuth.isVendedoraCampo()) {
      navigateVendedora(tela);
      return;
    }

    if (
      MaycredAuth.hasPainelGestor() &&
      MaycredAuth.isVendedora() &&
      tela === 'vendPipeline'
    ) {
      safeDestroyCharts();
      const content = document.getElementById('app-content');
      if (!content || !MaycredAuth.isLoggedIn()) return;
      telaAtual = 'vendPipeline';
      document.querySelectorAll('.app-nav__btn').forEach(function (b) {
        b.classList.toggle('app-nav__btn--active', b.getAttribute('data-tela') === 'vendPipeline');
      });
      MaycredVendUI.paint(content, 'vendPipeline');
      closeSidebarMobile();
      return;
    }

    safeDestroyCharts();

    const content = document.getElementById('app-content');
    if (!content) return;

    if (!MaycredAuth.isLoggedIn()) return;

    let telaIr = tela;
    if (!MaycredAuth.rotaPermitida(telaIr)) {
      const alt = primeiraRotaLiberada();
      if (!alt) {
        telaAtual = 'semPermissao';
        content.innerHTML =
          '<div class="ui-section"><p class="ui-muted">Nenhuma tela foi liberada para o seu perfil. Peça a um administrador para marcar permissões em <strong>Configurações → Permissões dos perfis</strong>.</p></div>';
        document.querySelectorAll('.app-nav__btn').forEach(function (b) {
          b.classList.remove('app-nav__btn--active');
        });
        closeSidebarMobile();
        return;
      }
      if (alt !== tela && typeof MaycredUI !== 'undefined' && MaycredUI.toast) {
        MaycredUI.toast('Sem permissão para essa área. Abrindo uma tela permitida.', 'info');
      }
      telaIr = alt;
    }

    telaAtual = telaIr;

    document.querySelectorAll('.app-nav__btn').forEach(function (b) {
      b.classList.toggle('app-nav__btn--active', b.getAttribute('data-tela') === telaIr);
    });
    switch (telaIr) {
      case 'dashboard':
        MaycredUI.renderDashboardGestor(content);
        break;
      case 'producao':
        MaycredUI.renderProducao(content);
        break;
      case 'configuracoes':
        if (typeof MaycredUI.renderModuloConfiguracoes === 'function') {
          MaycredUI.renderModuloConfiguracoes(content);
        } else {
          MaycredUI.renderVendedoras(content);
        }
        break;
      default:
        if (MaycredAuth.rotaPermitida('dashboard')) {
          MaycredUI.renderDashboardGestor(content);
        } else {
          const r = primeiraRotaLiberada();
          if (r && r !== telaIr) navigate(r);
        }
        break;
    }

    const mesWrap = document.getElementById('app-header-mes-wrap');
    if (mesWrap && MaycredAuth.hasPainelGestor()) {
      mesWrap.style.display = '';
    }

    closeSidebarMobile();
  }

  function closeSidebarMobile() {
    const sb = document.getElementById('app-sidebar');
    const bd = document.getElementById('app-sidebar-backdrop');
    if (sb) sb.classList.remove('is-open');
    if (bd) bd.classList.remove('is-visible');
  }

  function toggleSidebarMobile() {
    const sb = document.getElementById('app-sidebar');
    const bd = document.getElementById('app-sidebar-backdrop');
    if (!sb) return;
    const open = sb.classList.toggle('is-open');
    if (bd) bd.classList.toggle('is-visible', open);
  }

  function renderLogin() {
    safeDestroyCharts();
    root.innerHTML = '';
    root.className = 'app app--login';

    const shell = document.createElement('div');
    shell.className = 'login-shell';

    const brand = document.createElement('div');
    brand.className = 'login-brand';
    const logo = document.createElement('img');
    logo.className = 'login-brand__img';
    logo.src = 'assets/logo-maycred.svg';
    logo.alt = 'MAY CRED Financeira';
    logo.width = 320;
    logo.height = 80;
    brand.appendChild(logo);
    shell.appendChild(brand);

    const card = document.createElement('div');
    card.className = 'login-card login-card--premium';

    const kicker = document.createElement('p');
    kicker.className = 'login-card__kicker';
    kicker.textContent = 'Portal corporativo';
    card.appendChild(kicker);

    const title = document.createElement('h2');
    title.className = 'login-card__title';
    title.textContent = 'Acesso ao sistema';
    card.appendChild(title);

    const panel = document.createElement('div');
    panel.className = 'login-panel';

    const hint = document.createElement('p');
    hint.className = 'login-card__hint';
    hint.textContent =
      'Entre com o usuário e a senha cadastrados em Configurações. O perfil (ADM, Líder ou Venda) define o que você vê após o login.';

    const wrapUser = document.createElement('div');
    wrapUser.className = 'login-field';
    const labUser = document.createElement('label');
    labUser.className = 'login-field__label';
    labUser.setAttribute('for', 'login-usuario');
    labUser.textContent = 'Usuário';
    const inpUser = document.createElement('input');
    inpUser.type = 'text';
    inpUser.className = 'ui-input';
    inpUser.placeholder = 'Seu usuário';
    inpUser.autocomplete = 'username';
    inpUser.id = 'login-usuario';
    wrapUser.appendChild(labUser);
    wrapUser.appendChild(inpUser);

    const wrapPass = document.createElement('div');
    wrapPass.className = 'login-field';
    const labPass = document.createElement('label');
    labPass.className = 'login-field__label';
    labPass.setAttribute('for', 'login-senha');
    labPass.textContent = 'Senha';
    const inpPass = document.createElement('input');
    inpPass.type = 'password';
    inpPass.className = 'ui-input';
    inpPass.id = 'login-senha';
    inpPass.placeholder = '••••••••';
    inpPass.autocomplete = 'current-password';
    wrapPass.appendChild(labPass);
    wrapPass.appendChild(inpPass);

    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.className = 'login-btn--gold';
    goBtn.textContent = 'Entrar';

    const errEl = document.createElement('p');
    errEl.className = 'login-card__err';

    const foot = document.createElement('p');
    foot.className = 'login-card__hint login-card__hint--sub';
    foot.innerHTML =
      'Primeiro acesso sem equipe cadastrada? Use o usuário <strong>gestor</strong> e a senha de gestão. Depois cadastre os demais em Configurações.';

    panel.appendChild(hint);
    panel.appendChild(wrapUser);
    panel.appendChild(wrapPass);
    panel.appendChild(goBtn);
    panel.appendChild(errEl);
    panel.appendChild(foot);
    card.appendChild(panel);
    shell.appendChild(card);

    const shellFoot = document.createElement('p');
    shellFoot.className = 'login-shell__footer';
    shellFoot.textContent = 'Maycred Metas · uso interno';
    shell.appendChild(shellFoot);

    root.appendChild(shell);

    function tryLogin() {
      errEl.textContent = '';
      const u = inpUser.value.trim().toLowerCase();
      const p = inpPass.value;
      if (!u) {
        errEl.textContent = 'Informe o usuário.';
        return;
      }
      if (!p) {
        errEl.textContent = 'Informe a senha.';
        return;
      }
      if (u === 'gestor') {
        if (MaycredAuth.loginGestor(p)) {
          inpPass.value = '';
          showAppShell();
        } else {
          errEl.textContent = 'Usuário ou senha incorretos.';
        }
        return;
      }
      goBtn.disabled = true;
      MaycredAuth.loginVendedora(u, p)
        .then(function (ok) {
          goBtn.disabled = false;
          if (ok) {
            inpPass.value = '';
            showAppShell();
          } else {
            errEl.textContent =
              'Usuário ou senha incorretos, ou acesso ainda não cadastrado em Configurações.';
          }
        })
        .catch(function (err) {
          goBtn.disabled = false;
          errEl.textContent = String(err && err.message ? err.message : err);
        });
    }

    goBtn.addEventListener('click', tryLogin);
    inpUser.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryLogin();
    });
    inpPass.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryLogin();
    });
    try {
      inpUser.focus();
    } catch (_) {}
  }

  function showAppShell() {
    safeDestroyCharts();
    root.innerHTML = '';
    root.className = 'app';

    const header = document.createElement('header');
    header.className = 'app-header';

    const menuBtn = document.createElement('button');
    menuBtn.type = 'button';
    menuBtn.className = 'app-header__menu';
    menuBtn.setAttribute('aria-label', 'Menu');
    menuBtn.textContent = '☰';
    menuBtn.addEventListener('click', toggleSidebarMobile);

    const brand = document.createElement('div');
    brand.className = 'app-header__brand';
    brand.textContent = 'Maycred';

    const profile = document.createElement('div');
    profile.className = 'app-header__profile';
    profile.textContent = MaycredAuth.getNomePerfilAtivo();

    const mes = document.createElement('div');
    mes.className = 'app-header__mes';
    mes.id = 'app-header-mes-wrap';
    if (MaycredAuth.hasPainelGestor()) {
      const mesInp = document.createElement('input');
      mesInp.type = 'month';
      mesInp.className = 'ui-input app-header__mes-input';
      mesInp.title =
        'Mês de referência (dashboard, produção, metas do mês e dias úteis em Configurações).';
      mesInp.value = MaycredData.getState().config.mesAtual;
      mesInp.id = 'app-header-mes';
      mesInp.addEventListener('change', function () {
        if (!mesInp.value) return;
        MaycredData.setConfig({ mesAtual: mesInp.value });
        if (typeof MaycredUI !== 'undefined' && MaycredUI.toast) {
          MaycredUI.toast('Mês atualizado.', 'success');
        }
        if (global.MaycredApp && typeof MaycredApp.refreshCurrent === 'function') {
          MaycredApp.refreshCurrent();
        }
      });
      mes.appendChild(mesInp);
    } else {
      mes.textContent = MaycredData.getState().config.mesAtual;
    }

    const out = document.createElement('button');
    out.type = 'button';
    out.className = 'ui-btn ui-btn--ghost app-header__out';
    out.textContent = 'Sair';
    out.addEventListener('click', function () {
      MaycredAuth.logout();
      renderLogin();
    });

    if (MaycredAuth.hasPainelGestor()) {
      header.appendChild(menuBtn);
    }
    header.appendChild(brand);
    header.appendChild(profile);
    header.appendChild(mes);
    header.appendChild(out);
    root.appendChild(header);

    const layout = document.createElement('div');
    layout.className =
      'app-layout' +
      (MaycredAuth.isVendedora() && !MaycredAuth.hasPainelGestor() ? ' app-layout--vend-only' : '');

    const backdrop = document.createElement('div');
    backdrop.className = 'app-sidebar-backdrop';
    backdrop.id = 'app-sidebar-backdrop';
    backdrop.addEventListener('click', closeSidebarMobile);

    const sidebar = document.createElement('aside');
    sidebar.className = 'app-sidebar';
    sidebar.id = 'app-sidebar';

    const nav = document.createElement('nav');
    nav.className = 'app-nav';

    function navBtn(tela, label) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'app-nav__btn';
      b.setAttribute('data-tela', tela);
      b.textContent = label;
      b.addEventListener('click', function () {
        navigate(tela);
      });
      return b;
    }

    function navHint(text) {
      const d = document.createElement('div');
      d.className = 'app-nav__hint';
      d.textContent = text;
      return d;
    }

    if (MaycredAuth.hasPainelGestor()) {
      layout.appendChild(backdrop);
      const operar = [
        ['dashboard', 'Dashboard'],
        ['producao', 'Produção'],
      ].filter(function (pair) {
        return MaycredAuth.rotaPermitida(pair[0]);
      });
      if (operar.length) {
        nav.appendChild(navHint('Operar'));
        operar.forEach(function (pair) {
          nav.appendChild(navBtn(pair[0], pair[1]));
        });
      }
      if (MaycredAuth.isVendedora()) {
        nav.appendChild(navBtn('vendPipeline', 'Pipeline'));
      }
      if (MaycredAuth.rotaPermitida('configuracoes')) {
        nav.appendChild(navHint('Equipe e configurações'));
        nav.appendChild(navBtn('configuracoes', 'Configurações'));
      }
      sidebar.appendChild(nav);
      layout.appendChild(sidebar);
    }

    const main = document.createElement('main');
    main.className = 'app-main';
    main.id = 'app-content';
    layout.appendChild(main);

    root.appendChild(layout);

    if (MaycredAuth.isVendedoraCampo()) {
      telaVendedoraAtual = 'vendDesempenho';
      const tabbar = document.createElement('nav');
      tabbar.className = 'app-vend-tabbar';
      tabbar.setAttribute('aria-label', 'Menu vendedora');
      ROTAS_VENDEDORA.forEach(function (pair) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'app-vend-tab';
        b.setAttribute('data-tela', pair[0]);
        b.textContent = pair[1];
        b.addEventListener('click', function () {
          navigateVendedora(pair[0]);
        });
        tabbar.appendChild(b);
      });
      root.appendChild(tabbar);
      navigateVendedora(telaVendedoraAtual);
    } else if (MaycredAuth.hasPainelGestor()) {
      const r0 = primeiraRotaLiberada();
      if (r0) navigate(r0);
      else {
        main.innerHTML =
          '<div class="ui-section"><p class="ui-muted">Nenhuma tela liberada para o seu perfil. Ajuste <strong>Permissões dos perfis</strong> com a senha de gestão ou outro administrador.</p></div>';
      }
    } else {
      navigate('dashboard');
    }
  }

  function init() {
    try {
      if (MaycredAuth.isLoggedIn()) showAppShell();
      else renderLogin();
    } catch (err) {
      root.className = 'app app--boot-err';
      root.innerHTML =
        '<div class="boot-err"><strong>Erro ao iniciar.</strong><p>' +
        String(err && err.message ? err.message : err) +
        '</p><p>Tente limpar dados do site (cookies/armazenamento) ou outro navegador.</p></div>';
    }
  }

  global.MaycredApp = {
    navigate,
    init,
    refreshCurrent: function () {
      if (!MaycredAuth.isLoggedIn()) return;
      if (MaycredAuth.isVendedoraCampo()) {
        navigateVendedora(telaVendedoraAtual);
        return;
      }
      if (
        telaAtual === 'vendPipeline' &&
        MaycredAuth.hasPainelGestor() &&
        MaycredAuth.isVendedora()
      ) {
        const content = document.getElementById('app-content');
        if (content && typeof MaycredVendUI !== 'undefined') {
          MaycredVendUI.paint(content, 'vendPipeline');
        }
        return;
      }
      if (telaAtual && telaAtual !== 'semPermissao') navigate(telaAtual);
    },
  };

  init();
})(typeof window !== 'undefined' ? window : globalThis);
