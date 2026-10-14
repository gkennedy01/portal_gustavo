/* ==========================================================================
   PORTAL GUSTAVO - script.js
   JavaScript puro (Vanilla JS), sem dependências.

   Arquitetura:
   - Storage ........ camada de persistência (LocalStorage) com namespace
   - Utils .......... funções auxiliares reutilizáveis
   - Módulos ........ cada widget é um objeto com init() independente
   - App ............ registra os módulos e inicializa tudo

   COMO ADICIONAR UM NOVO MÓDULO (ex.: Banco de Horas, Metas, Estudos):
   1. Crie o <section class="card"> em index.html
   2. Crie um objeto com método init() neste arquivo
   3. Registre-o na lista App.modules (final do arquivo)

   EVOLUÇÕES FUTURAS (pontos de extensão):
   - Modo escuro ........ alternar document.documentElement.dataset.theme
                          (tokens já existem em style.css) -> ver Theme
   - Integração com APIs  trocar Storage por uma implementação remota
                          mantendo a mesma interface (get/set/remove)
   - Login de usuário ... usar Storage.namespace com o id do usuário
   - Dashboard/gráficos . ler os dados via Storage.get('financeiro'), etc.
   ========================================================================== */

(function () {
  'use strict';

  /* ========================================================================
     STORAGE - persistência local com prefixo (namespace)
     ======================================================================== */
  const Storage = {
    namespace: 'portalGustavo:',

    /** Lê um valor salvo. Retorna `fallback` se não existir ou for inválido. */
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(this.namespace + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        console.warn('[Storage] Falha ao ler', key, err);
        return fallback;
      }
    },

    /** Salva um valor (serializado em JSON). */
    set(key, value) {
      try {
        localStorage.setItem(this.namespace + key, JSON.stringify(value));
      } catch (err) {
        console.warn('[Storage] Falha ao salvar', key, err);
      }
    },

    /** Remove uma chave. */
    remove(key) {
      try {
        localStorage.removeItem(this.namespace + key);
      } catch (err) {
        console.warn('[Storage] Falha ao remover', key, err);
      }
    }
  };


  /* ========================================================================
     UTILS
     ======================================================================== */
  const Utils = {
    /** Atalho para getElementById. */
    $(id) {
      return document.getElementById(id);
    },

    /** Gera um id simples e único. */
    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    /** Executa `fn` somente após `wait` ms sem novas chamadas. */
    debounce(fn, wait) {
      let timer;
      return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), wait);
      };
    },

    /** "HH:MM" -> minutos desde 00:00 (ou null se vazio/ inválido). */
    timeToMinutes(value) {
      if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return null;
      const [h, m] = value.split(':').map(Number);
      return h * 60 + m;
    },

    /** Minutos -> "HH:MM" (módulo 24h). */
    minutesToTime(totalMinutes) {
      const normalized = ((totalMinutes % 1440) + 1440) % 1440;
      const h = String(Math.floor(normalized / 60)).padStart(2, '0');
      const m = String(normalized % 60).padStart(2, '0');
      return `${h}:${m}`;
    },

    /** Minutos -> "1h 05min" (para exibir durações). */
    formatDuration(totalMinutes) {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${h}h ${String(m).padStart(2, '0')}min`;
    },

    /** Formata número como moeda brasileira. */
    currency: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }),

    /** Remove um item da lista com animação de saída. */
    removeWithAnimation(element, callback) {
      element.classList.add('is-removing');
      setTimeout(callback, 220);
    }
  };


  /* ========================================================================
     THEME (preparado para o modo escuro futuro)
     Hoje apenas aplica o tema salvo (padrão: claro).
     Para ativar o modo escuro: Theme.set('dark').
     ======================================================================== */
  const Theme = {
    init() {
      this.set(Storage.get('theme', 'light'));
    },
    set(theme) {
      document.documentElement.dataset.theme = theme;
      Storage.set('theme', theme);
    }
  };


  /* ========================================================================
     CABEÇALHO - relógio e data
     ======================================================================== */
  const HeaderClock = {
    init() {
      this.timeEl = Utils.$('clock-time');
      this.dateEl = Utils.$('clock-date');
      this.tick();
      setInterval(() => this.tick(), 1000);
    },
    tick() {
      const now = new Date();
      this.timeEl.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      this.dateEl.textContent = now.toLocaleDateString('pt-BR', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
      });
    }
  };


  /* ========================================================================
     MÓDULO 1 - CALCULADORA DE PONTO
     Regra: saída = entrada + jornada + duração do almoço
     Ex.: 08:00 + 08:48 + 01:00 = 17:48
     ======================================================================== */
  const PontoModule = {
    KEY: 'ponto',
    DEFAULT_JORNADA: '08:48',

    init() {
      this.entrada = Utils.$('ponto-entrada');
      this.saidaAlmoco = Utils.$('ponto-saida-almoco');
      this.retornoAlmoco = Utils.$('ponto-retorno-almoco');
      this.jornada = Utils.$('ponto-jornada');
      this.result = Utils.$('ponto-result');
      this.saida = Utils.$('ponto-saida');
      this.hint = Utils.$('ponto-hint');
      this.clearBtn = Utils.$('ponto-clear');

      this.inputs = [this.entrada, this.saidaAlmoco, this.retornoAlmoco, this.jornada];

      this.load();
      this.inputs.forEach((input) => input.addEventListener('input', () => this.onChange()));
      this.clearBtn.addEventListener('click', () => this.clear());
      this.calculate(false);
    },

    load() {
      const data = Storage.get(this.KEY, {});
      this.entrada.value = data.entrada || '';
      this.saidaAlmoco.value = data.saidaAlmoco || '';
      this.retornoAlmoco.value = data.retornoAlmoco || '';
      this.jornada.value = data.jornada || this.DEFAULT_JORNADA;
    },

    save() {
      Storage.set(this.KEY, {
        entrada: this.entrada.value,
        saidaAlmoco: this.saidaAlmoco.value,
        retornoAlmoco: this.retornoAlmoco.value,
        jornada: this.jornada.value
      });
    },

    onChange() {
      this.save();
      this.calculate(true);
    },

    clear() {
      this.entrada.value = '';
      this.saidaAlmoco.value = '';
      this.retornoAlmoco.value = '';
      this.jornada.value = this.DEFAULT_JORNADA;
      this.save();
      this.calculate(false);
      this.entrada.focus();
    },

    /** Atualiza o painel de resultado. */
    setResult(state, value, hint, animate) {
      this.result.dataset.state = state;
      this.saida.textContent = value;
      this.hint.textContent = hint;

      if (animate && state === 'ok') {
        this.result.classList.remove('is-pulsing');
        void this.result.offsetWidth; // reinicia a animação
        this.result.classList.add('is-pulsing');
      }
    },

    calculate(animate) {
      const entrada = Utils.timeToMinutes(this.entrada.value);
      const saidaAlmoco = Utils.timeToMinutes(this.saidaAlmoco.value);
      const retorno = Utils.timeToMinutes(this.retornoAlmoco.value);
      const jornada = Utils.timeToMinutes(this.jornada.value) ?? Utils.timeToMinutes(this.DEFAULT_JORNADA);

      if (entrada === null || saidaAlmoco === null || retorno === null) {
        this.setResult('idle', '--:--', 'Preencha entrada, saída e retorno do almoço.', animate);
        return;
      }

      if (saidaAlmoco < entrada || retorno < saidaAlmoco) {
        this.setResult('error', '--:--', 'Confira os horários: a ordem deve ser entrada, saída e retorno.', animate);
        return;
      }

      const almoco = retorno - saidaAlmoco;
      const saida = entrada + jornada + almoco;
      const virouDia = saida >= 1440 ? ' (+1 dia)' : '';

      this.setResult(
        'ok',
        Utils.minutesToTime(saida),
        `Almoço: ${Utils.formatDuration(almoco)} · Jornada: ${Utils.formatDuration(jornada)}${virouDia}`,
        animate
      );
    }
  };


  /* ========================================================================
     MÓDULO 2 - AGENDA SEMANAL
     Salva automaticamente (debounce) enquanto o usuário digita.
     ======================================================================== */
  const AgendaModule = {
    KEY: 'agenda',
    DAYS: [
      { id: 'seg', label: 'Segunda', weekday: 1 },
      { id: 'ter', label: 'Terça', weekday: 2 },
      { id: 'qua', label: 'Quarta', weekday: 3 },
      { id: 'qui', label: 'Quinta', weekday: 4 },
      { id: 'sex', label: 'Sexta', weekday: 5 }
    ],

    init() {
      this.container = Utils.$('agenda-list');
      this.status = Utils.$('agenda-status');
      this.data = Storage.get(this.KEY, {});
      this.statusTimer = null;

      this.saveDebounced = Utils.debounce(() => this.save(), 400);
      this.render();
    },

    render() {
      const today = new Date().getDay();

      this.DAYS.forEach((day) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'agenda__day' + (day.weekday === today ? ' is-today' : '');

        const name = document.createElement('label');
        name.className = 'agenda__name';
        name.htmlFor = `agenda-${day.id}`;
        name.textContent = day.label;

        if (day.weekday === today) {
          const badge = document.createElement('span');
          badge.className = 'agenda__badge';
          badge.textContent = 'Hoje';
          name.appendChild(badge);
        }

        const textarea = document.createElement('textarea');
        textarea.id = `agenda-${day.id}`;
        textarea.className = 'agenda__text';
        textarea.placeholder = '- Anotações do dia...';
        textarea.value = this.data[day.id] || '';
        textarea.addEventListener('input', () => {
          this.data[day.id] = textarea.value;
          this.saveDebounced();
        });

        wrapper.append(name, textarea);
        this.container.appendChild(wrapper);
      });
    },

    save() {
      Storage.set(this.KEY, this.data);
      this.flashStatus();
    },

    flashStatus() {
      this.status.textContent = '✓ Salvo automaticamente';
      this.status.classList.add('is-visible');
      clearTimeout(this.statusTimer);
      this.statusTimer = setTimeout(() => this.status.classList.remove('is-visible'), 1600);
    }
  };


  /* ========================================================================
     MÓDULO 3 - LEMBRETES
     Estrutura de cada item: { id, text, done }
     ======================================================================== */
  const LembretesModule = {
    KEY: 'lembretes',

    init() {
      this.form = Utils.$('lembretes-form');
      this.input = Utils.$('lembretes-input');
      this.list = Utils.$('lembretes-list');
      this.empty = Utils.$('lembretes-empty');
      this.pendingEl = Utils.$('lembretes-pendentes');
      this.doneEl = Utils.$('lembretes-concluidos');

      this.items = Storage.get(this.KEY, []);

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.add(this.input.value);
      });

      // Delegação de eventos: um listener para toda a lista
      this.list.addEventListener('change', (e) => {
        if (e.target.matches('.check')) {
          this.toggle(e.target.closest('.list__item').dataset.id);
        }
      });
      this.list.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-btn');
        if (btn) this.remove(btn.closest('.list__item'));
      });

      this.render();
    },

    save() {
      Storage.set(this.KEY, this.items);
    },

    add(text) {
      const clean = text.trim();
      if (!clean) return;
      this.items.unshift({ id: Utils.uid(), text: clean, done: false });
      this.input.value = '';
      this.save();
      this.render();
      this.input.focus();
    },

    toggle(id) {
      const item = this.items.find((i) => i.id === id);
      if (!item) return;
      item.done = !item.done;
      this.save();

      // Atualiza apenas o item (mantém a transição suave) e os contadores
      const li = this.list.querySelector(`[data-id="${id}"]`);
      if (li) li.classList.toggle('is-done', item.done);
      this.updateCounters();
    },

    remove(li) {
      const id = li.dataset.id;
      Utils.removeWithAnimation(li, () => {
        this.items = this.items.filter((i) => i.id !== id);
        this.save();
        this.render();
      });
    },

    updateCounters() {
      const done = this.items.filter((i) => i.done).length;
      this.doneEl.textContent = done;
      this.pendingEl.textContent = this.items.length - done;
    },

    render() {
      this.list.innerHTML = '';

      this.items.forEach((item) => {
        const li = document.createElement('li');
        li.className = 'list__item' + (item.done ? ' is-done' : '');
        li.dataset.id = item.id;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'check';
        checkbox.checked = item.done;
        checkbox.setAttribute('aria-label', 'Marcar como concluído');

        const text = document.createElement('span');
        text.className = 'list__text';
        text.textContent = item.text; // textContent evita injeção de HTML

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn';
        del.setAttribute('aria-label', 'Excluir lembrete');
        del.innerHTML = TRASH_ICON;

        li.append(checkbox, text, del);
        this.list.appendChild(li);
      });

      this.empty.hidden = this.items.length > 0;
      this.updateCounters();
    }
  };


  /* ========================================================================
     MÓDULO 4 - CONTROLE FINANCEIRO
     Estrutura de cada lançamento: { id, desc, value, type }
     type: 'receita' | 'despesa'  (value é sempre positivo)
     ======================================================================== */
  const FinanceiroModule = {
    KEY: 'financeiro',

    init() {
      this.form = Utils.$('fin-form');
      this.descInput = Utils.$('fin-desc');
      this.valueInput = Utils.$('fin-valor');
      this.typeInput = Utils.$('fin-tipo');
      this.list = Utils.$('fin-list');
      this.empty = Utils.$('fin-empty');
      this.incomeEl = Utils.$('fin-receitas');
      this.expenseEl = Utils.$('fin-despesas');
      this.balanceEl = Utils.$('fin-saldo');
      this.balanceBox = Utils.$('fin-saldo-box');

      this.items = Storage.get(this.KEY, []);

      this.form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.add();
      });

      this.list.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-btn');
        if (btn) this.remove(btn.closest('.list__item'));
      });

      this.render();
    },

    save() {
      Storage.set(this.KEY, this.items);
    },

    add() {
      const desc = this.descInput.value.trim();
      const value = parseFloat(this.valueInput.value);
      const type = this.typeInput.value;

      if (!desc || !isFinite(value) || value <= 0) return;

      this.items.unshift({ id: Utils.uid(), desc, value: Math.abs(value), type });
      this.save();
      this.render();

      this.descInput.value = '';
      this.valueInput.value = '';
      this.descInput.focus();
    },

    remove(li) {
      const id = li.dataset.id;
      Utils.removeWithAnimation(li, () => {
        this.items = this.items.filter((i) => i.id !== id);
        this.save();
        this.render();
      });
    },

    updateTotals() {
      const sum = (type) =>
        this.items.filter((i) => i.type === type).reduce((acc, i) => acc + i.value, 0);

      const income = sum('receita');
      const expense = sum('despesa');
      const balance = income - expense;

      this.incomeEl.textContent = Utils.currency.format(income);
      this.expenseEl.textContent = Utils.currency.format(expense);
      this.balanceEl.textContent = Utils.currency.format(balance);

      // Verde para positivo, vermelho para negativo
      const state = balance > 0 ? 'positive' : balance < 0 ? 'negative' : 'neutral';
      this.balanceBox.dataset.state = state;
    },

    render() {
      this.list.innerHTML = '';

      this.items.forEach((item) => {
        const isIncome = item.type === 'receita';

        const li = document.createElement('li');
        li.className = 'list__item';
        li.dataset.id = item.id;

        const text = document.createElement('span');
        text.className = 'list__text';
        text.textContent = item.desc;

        const amount = document.createElement('span');
        amount.className = 'fin-amount ' + (isIncome ? 'fin-amount--income' : 'fin-amount--expense');
        amount.textContent = (isIncome ? '+ ' : '- ') + Utils.currency.format(item.value);

        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'icon-btn';
        del.setAttribute('aria-label', 'Excluir lançamento');
        del.innerHTML = TRASH_ICON;

        li.append(text, amount, del);
        this.list.appendChild(li);
      });

      this.empty.hidden = this.items.length > 0;
      this.updateTotals();
    }
  };


  /* ========================================================================
     ÍCONE (SVG inline reutilizável)
     ======================================================================== */
  const TRASH_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<polyline points="3 6 5 6 21 6"/>' +
    '<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>' +
    '<path d="M10 11v6M14 11v6"/>' +
    '<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';


  /* ========================================================================
     APP - registro e inicialização dos módulos
     Cada módulo é isolado: se um falhar, os demais continuam funcionando.
     ======================================================================== */
  const App = {
    modules: [
      Theme,
      HeaderClock,
      PontoModule,
      AgendaModule,
      LembretesModule,
      FinanceiroModule
      // Futuro: BancoHorasModule, EstudosModule, MetasModule, DashboardModule...
    ],

    start() {
      this.modules.forEach((module) => {
        try {
          module.init();
        } catch (err) {
          console.error('[App] Erro ao iniciar módulo', module, err);
        }
      });
    }
  };

  document.addEventListener('DOMContentLoaded', () => App.start());
})();
