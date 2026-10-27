// Controller entry point. No module loader, server, or build step is needed.
(function () {
  'use strict';

  const { WorkspaceService, ValidationError, createDemoData, todayISO, LocalStorageRepository, MemoryRepository, WorkspaceView } = window.Studyflow;

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'studyflow.workspace.v1';
  const VIEWS = ['overview', 'tasks', 'projects', 'settings'];

  // The controller connects DOM events to application services. Domain rules live in domain.js.
  class WorkspaceController {
    constructor(service, repository) {
      this.service = service;
      this.repository = repository;
      this.view = new WorkspaceView();
      this.activeView = this.readHash() || service.getState().settings.defaultView;
      this.editingTaskId = null;
      this.editingProjectId = null;
      this.pendingConfirmation = null;
      this.toastTimer = null;
      this.bindEvents();
      this.render();
      this.navigate(this.activeView, false);
    }
    readHash() { return VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null; }
    taskCriteria() {
      return { query: $('task-search').value.trim(), status: $('filter-status').value, priority: $('filter-priority').value, projectId: $('filter-project').value, sortBy: $('task-sort').value, sortDirection: $('task-sort').value === 'createdAt' ? 'desc' : 'asc', showCompleted: this.service.getState().settings.showCompleted };
    }
    render() {
      const state = this.service.getState();
      this.view.applyTheme(state.settings);
      this.view.renderProjectOptions(state);
      this.view.renderNavigation(this.activeView, state);
      this.view.renderOverview(state, this.service.getStats(), this.service.listTasks({ sortBy: 'dueDate', status: 'all', showCompleted: false }).slice(0, 5), todayISO());
      this.renderTasks();
      this.renderProjects();
      this.view.renderSettings(state.settings);
    }
    renderTasks() { this.view.renderTasks(this.service.getState(), this.service.listTasks(this.taskCriteria()), todayISO()); }
    renderProjects() { this.view.renderProjects(this.service.getState(), $('project-search').value.trim()); }
    navigate(view, focus = true) {
      this.activeView = VIEWS.includes(view) ? view : 'overview';
      if (location.hash !== `#${this.activeView}`) {
        try { history.pushState(null, '', `#${this.activeView}`); }
        catch { location.hash = this.activeView; }
      }
      this.view.renderNavigation(this.activeView, this.service.getState());
      if (focus) {
        const heading = $(`view-${this.activeView}`).querySelector('h1');
        heading.tabIndex = -1;
        heading.focus({ preventScroll: true });
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
    notify(message, error = false) {
      clearTimeout(this.toastTimer);
      $('toast').textContent = message;
      $('toast').classList.toggle('is-error', error);
      $('toast').hidden = false;
      this.toastTimer = setTimeout(() => { $('toast').hidden = true; }, error ? 8000 : 4000);
    }
    run(action, message) {
      try { action(); this.render(); if (message) this.notify(message); return true; }
      catch (error) { this.notify(error instanceof ValidationError ? Object.values(error.errors).flat().join(' ') : error.message || 'Не вдалося виконати дію.', true); return false; }
    }
    showFormError(id, error) {
      $(id).textContent = error instanceof ValidationError ? Object.values(error.errors).flat().join(' ') : error.message;
      const form = $(id).closest('form');
      const key = error instanceof ValidationError ? Object.keys(error.errors)[0] : null;
      const fieldId = key && ({ title: 'task-title', name: 'project-name', description: form.id === 'task-form' ? 'task-description' : 'project-description', dueDate: 'task-due-date', projectId: 'task-project', status: 'task-status', priority: 'task-priority', color: 'project-color' })[key];
      if (fieldId) $(fieldId).focus();
    }
    openTask(id = null) {
      const task = id ? this.service.getState().tasks.find(item => item.id === id) : null;
      if (id && !task) return this.notify('Це завдання вже видалено.', true);
      this.editingTaskId = id;
      $('task-form').reset();
      $('task-error').textContent = '';
      $('task-dialog-title').textContent = task ? 'Редагувати завдання' : 'Нове завдання';
      $('task-save').textContent = task ? 'Зберегти зміни' : 'Створити завдання';
      $('task-title').value = task?.title || '';
      $('task-description').value = task?.description || '';
      $('task-status').value = task?.status || 'todo';
      $('task-priority').value = task?.priority || 'medium';
      $('task-project').value = task?.projectId || ($('filter-project').value !== 'all' && $('filter-project').value !== 'none' ? $('filter-project').value : '');
      $('task-due-date').value = task?.dueDate || '';
      $('task-dialog').showModal();
      $('task-title').focus();
    }
    openProject(id = null) {
      const project = id ? this.service.getState().projects.find(item => item.id === id) : null;
      if (id && !project) return this.notify('Цей проєкт уже видалено.', true);
      this.editingProjectId = id;
      $('project-form').reset();
      $('project-error').textContent = '';
      $('project-dialog-title').textContent = project ? 'Редагувати проєкт' : 'Новий проєкт';
      $('project-save').textContent = project ? 'Зберегти зміни' : 'Створити проєкт';
      $('project-name').value = project?.name || '';
      $('project-description').value = project?.description || '';
      if (project?.color && ![...$('project-color').options].some(o => o.value === project.color)) {
        const option = new Option('Власний колір', project.color);
        $('project-color').add(option);
      }
      $('project-color').value = project?.color || '#8875d9';
      $('project-dialog').showModal();
      $('project-name').focus();
    }
    confirm({ title, message, accept = 'Підтвердити', action, destructive = true }) {
      this.pendingConfirmation = action;
      $('confirm-title').textContent = title;
      $('confirm-message').textContent = message;
      $('confirm-accept').textContent = accept;
      $('confirm-accept').classList.toggle('danger', destructive);
      $('confirm-dialog').showModal();
      $('confirm-cancel').focus();
    }
    download(content, filename) {
      const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    // Named handlers make each event and its responsibility easy to locate.
    onNavigate(event) { event.preventDefault(); this.navigate(event.currentTarget.dataset.view); }
    onSkipToContent(event) { event.preventDefault(); $('main').focus(); }
    onHashChange() { this.navigate(this.readHash() || 'overview'); }
    onOpenTask() { this.openTask(); }
    onCloseTask() { $('task-dialog').close(); }
    onTaskSubmit(event) {
      event.preventDefault();
      const input = { title: $('task-title').value, description: $('task-description').value, status: $('task-status').value, priority: $('task-priority').value, projectId: $('task-project').value, dueDate: $('task-due-date').value };
      try {
        if (this.editingTaskId) this.service.updateTask(this.editingTaskId, input);
        else this.service.createTask(input);
        $('task-dialog').close();
        this.render(); this.notify(this.editingTaskId ? 'Зміни збережено' : 'Завдання створено');
      } catch (error) { this.showFormError('task-error', error); }
    }
    onTaskSearch() { this.renderTasks(); }
    onTaskFilterChange() { this.renderTasks(); }
    onClearFilters() { $('task-filters').reset(); this.renderTasks(); }
    onTaskListAction(event) {
      const control = event.target.closest('[data-action]');
      if (!control) return;
      const { action, id } = control.dataset;
      const task = this.service.getState().tasks.find(item => item.id === id);
      if (!task) return;
      if (action === 'edit-task') this.openTask(id);
      if (action === 'toggle-task') {
        const checked = control.checked;
        this.run(() => this.service.updateTask(id, { status: checked ? 'done' : 'todo' }), checked ? 'Завдання завершено' : 'Завдання повернуто до списку');
        this.renderTasks();
      }
      if (action === 'delete-task') this.confirm({ title: 'Видалити завдання?', message: `«${task.title}» буде видалено. Цю дію не можна скасувати.`, accept: 'Видалити', action: () => this.run(() => this.service.deleteTask(id), 'Завдання видалено') });
    }
    onOpenProject() { this.openProject(); }
    onCloseProject() { $('project-dialog').close(); }
    onProjectSubmit(event) {
      event.preventDefault();
      const input = { name: $('project-name').value, description: $('project-description').value, color: $('project-color').value };
      try {
        if (this.editingProjectId) this.service.updateProject(this.editingProjectId, input);
        else this.service.createProject(input);
        $('project-dialog').close(); this.render(); this.notify(this.editingProjectId ? 'Зміни збережено' : 'Проєкт створено');
      } catch (error) { this.showFormError('project-error', error); }
    }
    onProjectSearch() { this.renderProjects(); }
    onProjectListAction(event) {
      const control = event.target.closest('[data-action]');
      if (!control) return;
      const { action, id } = control.dataset;
      const project = this.service.getState().projects.find(item => item.id === id);
      if (!project) return;
      if (action === 'view-project') {
        $('task-filters').reset(); $('filter-project').value = id;
        this.renderTasks(); this.navigate('tasks');
      }
      if (action === 'edit-project') this.openProject(id);
      if (action === 'delete-project') this.confirm({ title: 'Видалити проєкт?', message: `Проєкт «${project.name}» буде видалено. Його завдання залишаться у списку без проєкту.`, accept: 'Видалити', action: () => this.run(() => this.service.deleteProject(id), 'Проєкт видалено, завдання збережено') });
    }
    onSettingsSubmit(event) {
      event.preventDefault();
      this.run(() => this.service.updateSettings({ name: $('settings-name').value, theme: $('settings-theme').value, defaultView: $('settings-default-view').value, showCompleted: $('settings-show-completed').checked }), 'Налаштування збережено');
    }
    onExport() { this.download(this.service.exportData(), `studyflow-${todayISO()}.json`); this.notify('Резервну копію завантажено'); }
    async onImport(event) {
      const file = event.target.files[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > 2 * 1024 * 1024) return this.notify('Файл завеликий. Максимальний розмір — 2 МБ.', true);
      try {
        const content = await file.text();
        // Validate against a temporary repository before asking to replace real data.
        const candidate = new WorkspaceService(new MemoryRepository());
        candidate.importData(content);
        const state = candidate.getState();
        this.confirm({ title: 'Відновити резервну копію?', message: `Буде завантажено ${state.tasks.length} завдань і ${state.projects.length} проєктів. Поточні дані та налаштування буде замінено. Спочатку можна скасувати дію й експортувати поточні дані.`, accept: 'Відновити', destructive: false, action: () => this.run(() => this.service.importData(content), 'Дані успішно відновлено') });
      } catch (error) { this.notify(error.message || 'Не вдалося прочитати файл.', true); }
    }
    onResetDemo() { this.confirm({ title: 'Завантажити приклад?', message: 'Поточні завдання, проєкти та налаштування буде замінено демонстраційними даними. За потреби спочатку експортуйте резервну копію.', accept: 'Завантажити приклад', action: () => this.run(() => this.service.resetDemo(), 'Демонстраційні дані завантажено') }); }
    onClearData() { this.confirm({ title: 'Очистити робочий простір?', message: 'Усі завдання та проєкти буде видалено. Налаштування залишаться. Цю дію не можна скасувати, тому за потреби спочатку створіть резервну копію.', accept: 'Очистити', action: () => this.run(() => this.service.clear(), 'Робочий простір очищено') }); }
    onConfirmAccept() { const action = this.pendingConfirmation; this.pendingConfirmation = null; $('confirm-dialog').close(); if (action) action(); }
    onConfirmCancel() { this.pendingConfirmation = null; $('confirm-dialog').close(); }
    onDialogCancel(event) { if (event.currentTarget.id === 'confirm-dialog') this.pendingConfirmation = null; }
    onGoTasks() { this.navigate('tasks'); }
    onGoProjects() { this.navigate('projects'); }
    onThemeChange() { this.view.applyTheme(this.service.getState().settings); }
    onStorageChange(event) {
      if (event.storageArea !== this.repository.storage || (event.key !== STORAGE_KEY && event.key !== null)) return;
      try { this.service = new WorkspaceService(this.repository); this.render(); this.notify('Дані оновлено з іншої вкладки'); }
      catch (error) { this.notify(error.message, true); }
    }
    bindEvents() {
      const bind = (id, event, handler) => $(id).addEventListener(event, handler.bind(this));
      document.querySelector('[data-control="skip"]').addEventListener('click', this.onSkipToContent.bind(this));
      for (const view of VIEWS) bind(`nav-${view}`, 'click', this.onNavigate);
      for (const id of ['sidebar-add-task', 'overview-add-task', 'task-add']) bind(id, 'click', this.onOpenTask);
      for (const id of ['task-close', 'task-cancel']) bind(id, 'click', this.onCloseTask);
      bind('task-form', 'submit', this.onTaskSubmit);
      bind('task-search', 'input', this.onTaskSearch);
      for (const id of ['filter-status', 'filter-priority', 'filter-project', 'task-sort']) bind(id, 'change', this.onTaskFilterChange);
      bind('task-filters', 'submit', event => event.preventDefault());
      bind('clear-filters', 'click', this.onClearFilters);
      bind('task-list', 'click', this.onTaskListAction);
      bind('overview-upcoming', 'click', this.onTaskListAction);
      bind('project-add', 'click', this.onOpenProject);
      for (const id of ['project-close', 'project-cancel']) bind(id, 'click', this.onCloseProject);
      bind('project-form', 'submit', this.onProjectSubmit);
      bind('project-search', 'input', this.onProjectSearch);
      bind('project-list', 'click', this.onProjectListAction);
      bind('overview-projects', 'click', this.onProjectListAction);
      bind('settings-form', 'submit', this.onSettingsSubmit);
      bind('data-export', 'click', this.onExport);
      bind('data-import', 'change', this.onImport);
      bind('data-demo', 'click', this.onResetDemo);
      bind('data-clear', 'click', this.onClearData);
      bind('confirm-accept', 'click', this.onConfirmAccept);
      bind('confirm-cancel', 'click', this.onConfirmCancel);
      bind('overview-all-tasks', 'click', this.onGoTasks);
      bind('overview-all-projects', 'click', this.onGoProjects);
      for (const id of ['task-dialog', 'project-dialog', 'confirm-dialog']) bind(id, 'cancel', this.onDialogCancel);
      window.addEventListener('hashchange', this.onHashChange.bind(this));
      window.addEventListener('popstate', this.onHashChange.bind(this));
      window.addEventListener('storage', this.onStorageChange.bind(this));
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', this.onThemeChange.bind(this));
    }
  }

  function bootstrap() {
    let repository;
    let temporary = false;
    try {
      const storage = window.localStorage;
      // Read access and write quota are separate: a full store can still contain valuable data.
      storage.getItem(STORAGE_KEY);
      repository = new LocalStorageRepository(storage, STORAGE_KEY);
    } catch {
      repository = new MemoryRepository(); temporary = true;
    }
    try {
      const isNew = repository.load() === null;
      let service = new WorkspaceService(repository);
      if (isNew) {
        const demo = createDemoData();
        try { service.importData(demo); }
        catch {
          repository = new MemoryRepository(demo);
          service = new WorkspaceService(repository);
          temporary = true;
        }
      }
      new WorkspaceController(service, repository);
      if (temporary) {
        const warning = document.createElement('p');
        warning.className = 'persistence-warning';
        warning.setAttribute('role', 'status');
        warning.textContent = 'Сховище браузера недоступне. Дані збережено лише до закриття вкладки. Використовуйте експорт для резервної копії.';
        $('main').prepend(warning);
      }
    } catch (error) {
      $('fatal-error').hidden = false;
      $('fatal-error').textContent = `Не вдалося відкрити збережені дані: ${error.message} Поточну копію не змінено. `;
      const download = document.createElement('button');
      download.className = 'button secondary'; download.textContent = 'Завантажити збережену копію';
      download.addEventListener('click', () => {
        const raw = window.localStorage.getItem(STORAGE_KEY) || '{}';
        const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
        const a = Object.assign(document.createElement('a'), { href: url, download: 'studyflow-recovery.json' });
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
      const reset = document.createElement('button');
      reset.className = 'button secondary'; reset.textContent = 'Створити порожній простір';
      reset.addEventListener('click', () => {
        if (!window.confirm('Видалити пошкоджену копію? Спочатку завантажте її, якщо хочете зберегти.')) return;
        try {
          const service = new WorkspaceService(new MemoryRepository());
          repository.save(service.getState()); location.reload();
        } catch (saveError) { $('fatal-error').append(` ${saveError.message}`); }
      });
      $('fatal-error').append(document.createElement('br'), download, ' ', reset);
      for (const view of VIEWS) $(`view-${view}`).hidden = true;
    }
  }
  bootstrap();
})();
