// Classic browser script; loaded in order by index.html, including from file://.
(function (Studyflow) {
  'use strict';

  // Presentation only: this module never changes application data or storage.
  const STATUS_LABELS = { todo: 'До виконання', in_progress: 'У роботі', done: 'Завершено' };
  const PRIORITY_LABELS = { low: 'Низький', medium: 'Середній', high: 'Високий' };
  const escapeHTML = (value = '') => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const $ = id => document.getElementById(id);
  const icon = name => {
    const paths = {
      edit: '<path d="m13 4 3 3M4 16l4-1L17 6a2.12 2.12 0 0 0-3-3L5 12l-1 4Z"/>',
      trash: '<path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/>',
      arrow: '<path d="M4 10h12m-5-5 5 5-5 5"/>',
      check: '<path d="m4 10 4 4 8-8"/>',
    };
    return `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
  };
  function formatDate(iso, options = { day: 'numeric', month: 'short' }) {
    if (!iso) return 'Без терміну';
    const [y, m, d] = iso.split('-').map(Number);
    return new Intl.DateTimeFormat('uk-UA', options).format(new Date(y, m - 1, d));
  }
  const projectFor = (task, state) => state.projects.find(p => p.id === task.projectId);
  function projectText(task, state) {
    const p = projectFor(task, state);
    return p ? `<span class="project-tag"><i style="background:${escapeHTML(p.color)}"></i>${escapeHTML(p.name)}</span>` : '<span class="muted">Без проєкту</span>';
  }
  function taskActions(task) {
    const title = escapeHTML(task.title);
    return `<div class="row-actions"><button type="button" class="icon-button" data-action="edit-task" data-id="${escapeHTML(task.id)}" aria-label="Редагувати завдання: ${title}" title="Редагувати">${icon('edit')}</button><button type="button" class="icon-button danger-quiet" data-action="delete-task" data-id="${escapeHTML(task.id)}" aria-label="Видалити завдання: ${title}" title="Видалити">${icon('trash')}</button></div>`;
  }
  function taskCheck(task) {
    return `<input type="checkbox" class="task-check" data-action="toggle-task" data-id="${escapeHTML(task.id)}" aria-label="Завершено: ${escapeHTML(task.title)}" ${task.status === 'done' ? 'checked' : ''}>`;
  }
  class WorkspaceView {
    renderNavigation(view, state) {
      for (const name of ['overview', 'tasks', 'projects', 'settings']) {
        $(`view-${name}`).hidden = name !== view;
        const nav = $(`nav-${name}`);
        nav.classList.toggle('active', name === view);
        if (name === view) nav.setAttribute('aria-current', 'page');
        else nav.removeAttribute('aria-current');
      }
      $('user-name').textContent = state.settings.name;
      $('sidebar-task-count').textContent = state.tasks.filter(t => t.status !== 'done').length;
      document.title = `${{ overview: 'Огляд', tasks: 'Завдання', projects: 'Проєкти', settings: 'Налаштування' }[view]} · Studyflow`;
    }
    renderOverview(state, stats, upcoming, today) {
      $('overview-greeting').textContent = `Привіт, ${state.settings.name}!`;
      $('overview-date').textContent = new Intl.DateTimeFormat('uk-UA', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
      for (const [id, value] of Object.entries({ 'stat-active': stats.activeTasks, 'stat-done': stats.completedTasks, 'stat-overdue': stats.overdueTasks, 'stat-projects': stats.totalProjects })) $(id).textContent = value;
      $('progress-value').textContent = `${stats.completionRate}%`;
      $('progress-ring').style.setProperty('--progress', `${stats.completionRate}%`);
      $('progress-ring').style.strokeDashoffset = String(339.292 * (1 - stats.completionRate / 100));
      $('progress-ring').setAttribute('aria-label', `Завершено ${stats.completionRate}% завдань`);
      $('progress-caption').textContent = `Завершено ${stats.completedTasks} із ${stats.totalTasks} завдань`;
      $('overview-upcoming').innerHTML = upcoming.length ? upcoming.map(task => `<li class="upcoming-item">${taskCheck(task)}<div class="upcoming-details"><button class="text-button upcoming-title" type="button" data-action="edit-task" data-id="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button><div class="task-meta">${projectText(task, state)}<span class="badge priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span></div></div><span class="upcoming-date ${task.dueDate && task.dueDate < today ? 'overdue' : ''}">${formatDate(task.dueDate)}</span></li>`).join('') : '<li class="empty-state"><span class="empty-icon">✓</span><h3>Можна видихнути</h3><p>Активних завдань немає. Додайте нове або відпочиньте.</p></li>';
      $('overview-projects').innerHTML = state.projects.length ? state.projects.slice(0, 3).map(project => this.projectCard(project, state, true)).join('') : '<div class="empty-state"><h3>Усе починається з ідеї</h3><p>Створіть перший проєкт, щоб об’єднати завдання.</p></div>';
    }
    renderTasks(state, tasks, today) {
      $('task-count').textContent = `${tasks.length} із ${state.tasks.length}`;
      $('task-list').innerHTML = tasks.map(task => `<tr class="task-row ${task.status === 'done' ? 'is-done' : ''}"><td><div class="task-main">${taskCheck(task)}<div><button class="text-button task-title" type="button" data-action="edit-task" data-id="${escapeHTML(task.id)}">${escapeHTML(task.title)}</button>${task.description ? `<p class="task-description">${escapeHTML(task.description)}</p>` : ''}</div></div></td><td>${projectText(task, state)}</td><td><span class="badge priority-${task.priority}">${PRIORITY_LABELS[task.priority]}</span></td><td><span class="badge status-${task.status}">${STATUS_LABELS[task.status]}</span></td><td class="date-cell ${task.dueDate && task.dueDate < today && task.status !== 'done' ? 'overdue' : ''}">${formatDate(task.dueDate)}</td><td>${taskActions(task)}</td></tr>`).join('');
      $('task-empty').hidden = tasks.length > 0;
      $('task-list').closest('table').hidden = tasks.length === 0;
    }
    projectCard(project, state, compact = false) {
      const tasks = state.tasks.filter(t => t.projectId === project.id);
      const done = tasks.filter(t => t.status === 'done').length;
      const progress = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      const id = escapeHTML(project.id);
      return `<article class="project-card" style="--project-color:${escapeHTML(project.color)}"><div class="project-top"><span class="project-color" aria-hidden="true">${escapeHTML(project.name.charAt(0).toUpperCase())}</span>${compact ? `<button type="button" class="icon-button" data-action="view-project" data-id="${id}" aria-label="Завдання проєкту: ${escapeHTML(project.name)}">${icon('arrow')}</button>` : `<div class="project-actions"><button type="button" class="icon-button" data-action="edit-project" data-id="${id}" aria-label="Редагувати проєкт: ${escapeHTML(project.name)}">${icon('edit')}</button><button type="button" class="icon-button danger-quiet" data-action="delete-project" data-id="${id}" aria-label="Видалити проєкт: ${escapeHTML(project.name)}">${icon('trash')}</button></div>`}</div><h3><button type="button" class="text-button project-title" data-action="view-project" data-id="${id}">${escapeHTML(project.name)}</button></h3><p class="project-description">${escapeHTML(project.description || 'Ваш наступний крок до мети.')}</p><div class="project-progress-label"><span>${done} із ${tasks.length} завершено</span><strong>${progress}%</strong></div><div class="progress-track" role="progressbar" aria-label="Прогрес проєкту ${escapeHTML(project.name)}" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${progress}%"></div></div></article>`;
    }
    renderProjects(state, query) {
      const projects = state.projects.filter(p => `${p.name} ${p.description}`.toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')));
      $('project-count').textContent = `${projects.length} із ${state.projects.length}`;
      $('project-list').innerHTML = projects.map(p => this.projectCard(p, state)).join('');
      $('project-empty').hidden = projects.length > 0;
    }
    renderProjectOptions(state) {
      for (const id of ['filter-project', 'task-project']) {
        const select = $(id), selected = select.value;
        select.innerHTML = (id === 'filter-project' ? '<option value="all">Усі проєкти</option><option value="none">Без проєкту</option>' : '<option value="">Без проєкту</option>') + state.projects.map(p => `<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}</option>`).join('');
        if ([...select.options].some(option => option.value === selected)) select.value = selected;
      }
    }
    renderSettings(settings) {
      $('settings-name').value = settings.name;
      $('settings-theme').value = settings.theme;
      $('settings-default-view').value = settings.defaultView;
      $('settings-show-completed').checked = settings.showCompleted;
    }
    applyTheme(settings) {
      document.documentElement.dataset.theme = settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme;
    }
  }

  Object.assign(Studyflow, { STATUS_LABELS, PRIORITY_LABELS, escapeHTML, formatDate, WorkspaceView });
})(window.Studyflow = window.Studyflow || {});
