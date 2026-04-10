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
    typeof MaycredCalendar === 'undefined'
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

  function primeiraRotaLiberada() {
    const ordem = [
      'dashboard',
      'producao',
      'propostasCadastro',
      'propostasManutencao',
      'tabelas',
      'configuracoes',
    ];
    for (let i = 0; i < ordem.length; i++) {
      if (MaycredAuth.rotaPermitida(ordem[i])) return ordem[i];
    }
    return null;
  }

  function navigate(tela) {
    if (MaycredAuth.isVendedora() && !MaycredAuth.hasPainelGestor()) return;

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
      case 'propostasCadastro':
        if (typeof MaycredUI.renderPropostasCadastro === 'function') {
          MaycredUI.renderPropostasCadastro(content);
        } else if (typeof MaycredUI.renderLancamentos === 'function') {
          MaycredUI.renderLancamentos(content);
        } else {
          MaycredUI.renderOperacoes(content);
        }
        break;
      case 'propostasManutencao':
      case 'lancamentos':
      case 'operacoes':
        if (typeof MaycredUI.renderPropostasManutencao === 'function') {
          MaycredUI.renderPropostasManutencao(content);
        } else if (typeof MaycredUI.renderLancamentos === 'function') {
          MaycredUI.renderLancamentos(content);
        } else {
          MaycredUI.renderOperacoes(content);
        }
        break;
      case 'configuracoes':
        if (typeof MaycredUI.renderModuloConfiguracoes === 'function') {
          MaycredUI.renderModuloConfiguracoes(content);
        } else {
          MaycredUI.renderVendedoras(content);
        }
        break;
      case 'tabelas':
        if (typeof MaycredUI.renderModuloTabelasBancos === 'function') {
          MaycredUI.renderModuloTabelasBancos(content);
        } else {
          content.innerHTML =
            '<p class="ui-muted">Módulo de tabelas não carregado. Verifique se <code>ui-gestor.js</code> está incluído.</p>';
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
      const ocultarMesNoTopo =
        telaIr === 'propostasManutencao' ||
        telaIr === 'lancamentos' ||
        telaIr === 'operacoes';
      mesWrap.style.display = ocultarMesNoTopo ? 'none' : '';
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

    const card = document.createElement('div');
    card.className = 'login-card login-card--wide';

    const title = document.createElement('h1');
    title.className = 'login-card__brand';
    title.textContent = 'Maycred';
    card.appendChild(title);

    const tabs = document.createElement('div');
    tabs.className = 'login-tabs';
    const btnGestor = document.createElement('button');
    btnGestor.type = 'button';
    btnGestor.className = 'login-tabs__btn login-tabs__btn--active';
    btnGestor.textContent = 'Gestão';
    const btnVend = document.createElement('button');
    btnVend.type = 'button';
    btnVend.className = 'login-tabs__btn';
    btnVend.textContent = 'Vendedora';
    tabs.appendChild(btnGestor);
    tabs.appendChild(btnVend);
    card.appendChild(tabs);

    const panelGestor = document.createElement('div');
    panelGestor.className = 'login-panel';
    const subG = document.createElement('p');
    subG.className = 'login-card__hint';
    subG.textContent = 'Senha da gestão';
    panelGestor.appendChild(subG);
    const senhaGestor = document.createElement('input');
    senhaGestor.type = 'password';
    senhaGestor.className = 'ui-input';
    senhaGestor.style.width = '100%';
    senhaGestor.style.marginBottom = '0.65rem';
    senhaGestor.placeholder = 'Senha';
    senhaGestor.autocomplete = 'current-password';
    const goGestor = document.createElement('button');
    goGestor.type = 'button';
    goGestor.className = 'ui-btn ui-btn--primary login-card__btn';
    goGestor.textContent = 'Entrar';
    const errGestor = document.createElement('p');
    errGestor.className = 'login-card__err';
    panelGestor.appendChild(senhaGestor);
    panelGestor.appendChild(goGestor);
    panelGestor.appendChild(errGestor);

    const panelVend = document.createElement('div');
    panelVend.className = 'login-panel';
    panelVend.style.display = 'none';
    const subV = document.createElement('p');
    subV.className = 'login-card__hint';
    subV.textContent =
      'Usuário e senha definidos em Configurações → Vendedoras. O perfil (ADM, Líder ou Venda) define o que aparece no menu.';
    panelVend.appendChild(subV);
    const inpUser = document.createElement('input');
    inpUser.type = 'text';
    inpUser.className = 'ui-input';
    inpUser.style.width = '100%';
    inpUser.style.marginBottom = '0.5rem';
    inpUser.placeholder = 'Usuário';
    inpUser.autocomplete = 'username';
    const inpPass = document.createElement('input');
    inpPass.type = 'password';
    inpPass.className = 'ui-input';
    inpPass.style.width = '100%';
    inpPass.style.marginBottom = '0.65rem';
    inpPass.placeholder = 'Senha';
    inpPass.autocomplete = 'current-password';
    const goVend = document.createElement('button');
    goVend.type = 'button';
    goVend.className = 'ui-btn ui-btn--primary login-card__btn';
    goVend.textContent = 'Entrar';
    const errVend = document.createElement('p');
    errVend.className = 'login-card__err';
    panelVend.appendChild(inpUser);
    panelVend.appendChild(inpPass);
    panelVend.appendChild(goVend);
    panelVend.appendChild(errVend);

    card.appendChild(panelGestor);
    card.appendChild(panelVend);
    root.appendChild(card);

    function showTab(which) {
      errGestor.textContent = '';
      errVend.textContent = '';
      if (which === 'gestor') {
        btnGestor.classList.add('login-tabs__btn--active');
        btnVend.classList.remove('login-tabs__btn--active');
        panelGestor.style.display = '';
        panelVend.style.display = 'none';
      } else {
        btnVend.classList.add('login-tabs__btn--active');
        btnGestor.classList.remove('login-tabs__btn--active');
        panelGestor.style.display = 'none';
        panelVend.style.display = '';
      }
    }

    btnGestor.addEventListener('click', function () {
      showTab('gestor');
    });
    btnVend.addEventListener('click', function () {
      showTab('vendedora');
    });

    function tryGestor() {
      errGestor.textContent = '';
      if (MaycredAuth.loginGestor(senhaGestor.value)) {
        senhaGestor.value = '';
        showAppShell();
      } else errGestor.textContent = 'Senha incorreta.';
    }
    goGestor.addEventListener('click', tryGestor);
    senhaGestor.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryGestor();
    });

    function tryVend() {
      errVend.textContent = '';
      goVend.disabled = true;
      MaycredAuth.loginVendedora(inpUser.value, inpPass.value)
        .then(function (ok) {
          goVend.disabled = false;
          if (ok) {
            inpPass.value = '';
            showAppShell();
          } else errVend.textContent = 'Usuário ou senha incorretos, ou acesso ainda não cadastrado.';
        })
        .catch(function (err) {
          goVend.disabled = false;
          errVend.textContent = String(err && err.message ? err.message : err);
        });
    }
    goVend.addEventListener('click', tryVend);
    inpPass.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') tryVend();
    });
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
        'Mês de referência (dashboard, produção, cadastro, tabelas, metas e dias úteis). Na manutenção de propostas use o período na própria tela.';
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
        ['propostasCadastro', 'Cadastro de propostas'],
        ['propostasManutencao', 'Manutenção de propostas'],
      ].filter(function (pair) {
        return MaycredAuth.rotaPermitida(pair[0]);
      });
      if (operar.length) {
        nav.appendChild(navHint('Operar'));
        operar.forEach(function (pair) {
          nav.appendChild(navBtn(pair[0], pair[1]));
        });
      }
      if (MaycredAuth.rotaPermitida('tabelas')) {
        nav.appendChild(navHint('Parceiros e tabelas'));
        nav.appendChild(navBtn('tabelas', 'Parceiros e tabelas'));
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

    if (MaycredAuth.isVendedora() && !MaycredAuth.hasPainelGestor()) {
      MaycredUI.renderDashboardVendedora(main);
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
      if (MaycredAuth.isVendedora() && !MaycredAuth.hasPainelGestor()) return;
      if (telaAtual && telaAtual !== 'semPermissao') navigate(telaAtual);
    },
  };

  init();
})(typeof window !== 'undefined' ? window : globalThis);
