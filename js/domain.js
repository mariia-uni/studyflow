// Classic browser script; loaded in order by index.html, including from file://.
(function (Studyflow) {
  'use strict';

  /** Domain objects and use cases are independent of the DOM and browser storage. */
  const STATUSES = ['todo', 'in_progress', 'done'];
  const PRIORITIES = ['low', 'medium', 'high'];
  const DEFAULT_SETTINGS = Object.freeze({
    name: 'Студент', theme: 'light', defaultView: 'overview', showCompleted: true,
  });
  const TASK_FIELDS = ['id', 'title', 'description', 'status', 'priority', 'projectId', 'dueDate', 'createdAt', 'updatedAt'];
  const PROJECT_FIELDS = ['id', 'name', 'description', 'color', 'createdAt', 'updatedAt'];
  const TASK_EDIT_FIELDS = ['title', 'description', 'status', 'priority', 'projectId', 'dueDate'];
  const PROJECT_EDIT_FIELDS = ['name', 'description', 'color'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const valueOr = (input, key, fallback) => input[key] === undefined ? fallback : input[key];
  let idSequence = 0;

  class ValidationError extends Error {
    constructor(errors, message = 'Перевірте правильність введених даних.') {
      super(message);
      this.name = 'ValidationError';
      this.errors = { ...errors };
    }
  }

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function makeId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    if (globalThis.crypto?.getRandomValues) {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      return `${prefix}-${Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    idSequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 14)}`;
  }

  function text(value, field, maxLength, errors, required = false) {
    if (typeof value !== 'string') {
      errors[field] = 'Очікується текстове значення.';
      return '';
    }
    const result = value.trim();
    if (required && !result) errors[field] = 'Це поле обов’язкове.';
    else if (result.length > maxLength) errors[field] = `Не більше ${maxLength} символів.`;
    return result;
  }

  function choice(value, values, field, errors) {
    if (!values.includes(value)) errors[field] = 'Оберіть коректне значення.';
    return value;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(0);
    parsed.setUTCFullYear(year, month - 1, day);
    parsed.setUTCHours(0, 0, 0, 0);
    return year >= 1 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  function identifier(value, field, errors) {
    if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(value)) {
      errors[field] = 'Некоректний ідентифікатор.';
    }
    return value;
  }

  function timestamp(value, field, errors) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
        !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
      errors[field] = 'Некоректна дата створення або оновлення.';
    }
    return value;
  }

  function fail(errors) {
    if (Object.keys(errors).length) throw new ValidationError(errors);
  }

  function ensureRecord(value, field = 'data') {
    if (!isRecord(value)) throw new ValidationError({ [field]: 'Очікується об’єкт даних.' });
  }

  function ensureFields(value, allowed, required = []) {
    const errors = {};
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) errors[key] = 'Невідоме поле.';
    }
    for (const key of required) {
      if (!Object.hasOwn(value, key) || value[key] === undefined) errors[key] = 'Обов’язкове поле відсутнє.';
    }
    fail(errors);
  }

  function clockDate(clock) {
    const value = clock();
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw new Error('Некоректний системний час.');
    return value;
  }

  function nextTimestamp(record, clock) {
    // A clock change or an imported future timestamp cannot make metadata go backwards.
    return new Date(Math.max(clockDate(clock).getTime(), Date.parse(record.createdAt), Date.parse(record.updatedAt))).toISOString();
  }

  function todayISO(date = new Date()) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new Error('Некоректна дата.');
    return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  class Task {
    #data;

    constructor(input = {}, { clock = () => new Date() } = {}) {
      ensureRecord(input);
      ensureFields(input, TASK_FIELDS);
      const errors = {};
      const now = clockDate(clock).toISOString();
      const data = {
        id: identifier(input.id === undefined ? makeId('task') : input.id, 'id', errors),
        title: text(valueOr(input, 'title', ''), 'title', 120, errors, true),
        description: text(valueOr(input, 'description', ''), 'description', 2000, errors),
        status: choice(valueOr(input, 'status', 'todo'), STATUSES, 'status', errors),
        priority: choice(valueOr(input, 'priority', 'medium'), PRIORITIES, 'priority', errors),
        projectId: valueOr(input, 'projectId', ''),
        dueDate: valueOr(input, 'dueDate', ''),
        createdAt: timestamp(valueOr(input, 'createdAt', now), 'createdAt', errors),
        updatedAt: timestamp(valueOr(input, 'updatedAt', now), 'updatedAt', errors),
      };
      if (data.projectId !== '') identifier(data.projectId, 'projectId', errors);
      if (data.dueDate !== '' && !validDate(data.dueDate)) errors.dueDate = 'Вкажіть справжню дату у форматі РРРР-ММ-ДД.';
      if (Date.parse(data.updatedAt) < Date.parse(data.createdAt)) errors.updatedAt = 'Оновлення не може передувати створенню.';
      fail(errors);
      this.#data = Object.freeze(data);
    }

    toJSON() {
      return { ...this.#data };
    }
  }

  class Project {
    #data;

    constructor(input = {}, { clock = () => new Date() } = {}) {
      ensureRecord(input);
      ensureFields(input, PROJECT_FIELDS);
      const errors = {};
      const now = clockDate(clock).toISOString();
      const data = {
        id: identifier(input.id === undefined ? makeId('project') : input.id, 'id', errors),
        name: text(valueOr(input, 'name', ''), 'name', 80, errors, true),
        description: text(valueOr(input, 'description', ''), 'description', 1000, errors),
        color: valueOr(input, 'color', '#6366f1'),
        createdAt: timestamp(valueOr(input, 'createdAt', now), 'createdAt', errors),
        updatedAt: timestamp(valueOr(input, 'updatedAt', now), 'updatedAt', errors),
      };
      if (typeof data.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(data.color)) errors.color = 'Оберіть колір у форматі #RRGGBB.';
      if (Date.parse(data.updatedAt) < Date.parse(data.createdAt)) errors.updatedAt = 'Оновлення не може передувати створенню.';
      fail(errors);
      this.#data = Object.freeze(data);
    }

    toJSON() {
      return { ...this.#data };
    }
  }

  function validateSettings(input) {
    ensureRecord(input, 'settings');
    ensureFields(input, Object.keys(DEFAULT_SETTINGS), Object.keys(DEFAULT_SETTINGS));
    const errors = {};
    const result = {
      name: text(input.name, 'name', 80, errors, true),
      theme: choice(input.theme, ['light', 'dark', 'system'], 'theme', errors),
      defaultView: choice(input.defaultView, ['overview', 'tasks', 'projects'], 'defaultView', errors),
      showCompleted: input.showCompleted,
    };
    if (typeof result.showCompleted !== 'boolean') errors.showCompleted = 'Очікується логічне значення.';
    fail(errors);
    return result;
  }

  function emptyState() {
    return { schemaVersion: 1, projects: [], tasks: [], settings: { ...DEFAULT_SETTINGS } };
  }

  function validateState(input, clock) {
    ensureRecord(input);
    ensureFields(input, ['schemaVersion', 'projects', 'tasks', 'settings'], ['schemaVersion', 'projects', 'tasks', 'settings']);
    const errors = {};
    if (input.schemaVersion !== 1) errors.schemaVersion = 'Непідтримувана версія файлу. Потрібна версія 1.';
    if (!Array.isArray(input.projects)) errors.projects = 'Список проєктів має бути масивом.';
    if (!Array.isArray(input.tasks)) errors.tasks = 'Список завдань має бути масивом.';
    fail(errors);
    const validateItems = (items, fields, Type, group) => items.map((item, index) => {
      try {
        ensureRecord(item);
        ensureFields(item, fields, fields);
        return new Type(item, { clock }).toJSON();
      } catch (error) {
        if (!(error instanceof ValidationError)) throw error;
        const nested = Object.fromEntries(Object.entries(error.errors).map(([key, value]) => [`${group}.${index}.${key}`, value]));
        throw new ValidationError(nested, `Некоректний запис у списку «${group === 'tasks' ? 'Завдання' : 'Проєкти'}» (${index + 1}).`);
      }
    });
    const projects = validateItems(input.projects, PROJECT_FIELDS, Project, 'projects');
    const tasks = validateItems(input.tasks, TASK_FIELDS, Task, 'tasks');
    const usedIds = new Set();
    for (const item of [...projects, ...tasks]) {
      if (usedIds.has(item.id)) errors.id = 'Ідентифікатори записів мають бути унікальними.';
      usedIds.add(item.id);
    }
    const projectIds = new Set(projects.map(project => project.id));
    tasks.forEach((task, index) => {
      if (task.projectId && !projectIds.has(task.projectId)) errors[`tasks.${index}.projectId`] = 'Проєкт, на який посилається завдання, відсутній.';
    });
    fail(errors);
    return { schemaVersion: 1, projects, tasks, settings: validateSettings(input.settings) };
  }

  class WorkspaceService {
    #repository;
    #clock;
    #state;

    constructor(repository, { clock = () => new Date() } = {}) {
      if (!repository || typeof repository.load !== 'function' || typeof repository.save !== 'function') {
        throw new Error('Потрібне сховище з методами load() та save().');
      }
      this.#repository = repository;
      this.#clock = clock;
      const stored = repository.load();
      this.#state = stored === null ? emptyState() : validateState(stored, this.#clock);
    }

    getState() {
      return copy(this.#state);
    }

    #commit(nextState) {
      // Save first. A failed write must leave the displayed and persisted snapshots intact.
      try {
        this.#repository.save(copy(nextState));
      } catch (cause) {
        throw new Error('Не вдалося зберегти зміни. Попередні дані збережено. Перевірте сховище браузера та повторіть спробу.', { cause });
      }
      this.#state = nextState;
      return this.getState();
    }

    #record(group, id) {
      const found = this.#state[group].find(item => item.id === id);
      if (!found) throw new ValidationError({ id: group === 'tasks' ? 'Завдання не знайдено.' : 'Проєкт не знайдено.' });
      return found;
    }

    #assertProject(projectId) {
      if (projectId && !this.#state.projects.some(project => project.id === projectId)) {
        throw new ValidationError({ projectId: 'Оберіть наявний проєкт.' });
      }
    }

    createTask(input) {
      ensureRecord(input);
      ensureFields(input, TASK_EDIT_FIELDS);
      const task = new Task(input, { clock: this.#clock }).toJSON();
      this.#assertProject(task.projectId);
      return this.#commit({ ...this.getState(), tasks: [...this.#state.tasks, task] });
    }

    updateTask(id, patch) {
      const task = this.#record('tasks', id);
      ensureRecord(patch);
      ensureFields(patch, TASK_EDIT_FIELDS);
      const updated = new Task({ ...task, ...patch, updatedAt: nextTimestamp(task, this.#clock) }, { clock: this.#clock }).toJSON();
      this.#assertProject(updated.projectId);
      return this.#commit({ ...this.getState(), tasks: this.#state.tasks.map(item => item.id === id ? updated : { ...item }) });
    }

    deleteTask(id) {
      this.#record('tasks', id);
      return this.#commit({ ...this.getState(), tasks: this.#state.tasks.filter(item => item.id !== id).map(item => ({ ...item })) });
    }

    createProject(input) {
      ensureRecord(input);
      ensureFields(input, PROJECT_EDIT_FIELDS);
      const project = new Project(input, { clock: this.#clock }).toJSON();
      return this.#commit({ ...this.getState(), projects: [...this.#state.projects, project] });
    }

    updateProject(id, patch) {
      const project = this.#record('projects', id);
      ensureRecord(patch);
      ensureFields(patch, PROJECT_EDIT_FIELDS);
      const updated = new Project({ ...project, ...patch, updatedAt: nextTimestamp(project, this.#clock) }, { clock: this.#clock }).toJSON();
      return this.#commit({ ...this.getState(), projects: this.#state.projects.map(item => item.id === id ? updated : { ...item }) });
    }

    deleteProject(id) {
      this.#record('projects', id);
      return this.#commit({
        ...this.getState(),
        projects: this.#state.projects.filter(item => item.id !== id).map(item => ({ ...item })),
        tasks: this.#state.tasks.map(item => item.projectId === id ? { ...item, projectId: '', updatedAt: nextTimestamp(item, this.#clock) } : { ...item }),
      });
    }

    updateSettings(patch) {
      ensureRecord(patch, 'settings');
      const settings = validateSettings({ ...this.#state.settings, ...patch });
      return this.#commit({ ...this.getState(), settings });
    }

    importData(input) {
      let parsed = input;
      if (typeof input === 'string') {
        try { parsed = JSON.parse(input); }
        catch { throw new ValidationError({ file: 'Не вдалося прочитати JSON. Оберіть коректний файл резервної копії.' }); }
      }
      const validated = validateState(parsed, this.#clock);
      return this.#commit(validated);
    }

    exportData() {
      return JSON.stringify(this.#state, null, 2);
    }

    clear() {
      return this.#commit({ ...emptyState(), settings: { ...this.#state.settings } });
    }

    resetDemo() {
      return this.#commit(createDemoData(clockDate(this.#clock)));
    }

    listTasks(filters = {}) {
      const { query = '', status = 'all', priority = 'all', projectId = 'all', sortBy = 'dueDate', sortDirection = 'asc', showCompleted = this.#state.settings.showCompleted } = filters;
      const needle = String(query).trim().toLocaleLowerCase('uk');
      const projectNames = new Map(this.#state.projects.map(project => [project.id, project.name.toLocaleLowerCase('uk')]));
      const priorityRank = { high: 0, medium: 1, low: 2 };
      const statusRank = { todo: 0, in_progress: 1, done: 2 };
      const compare = (a, b) => {
        let result = 0;
        if (sortBy === 'priority') result = priorityRank[a.priority] - priorityRank[b.priority];
        else if (sortBy === 'status') result = statusRank[a.status] - statusRank[b.status];
        else if (sortBy === 'title') result = a.title.localeCompare(b.title, 'uk');
        else if (sortBy === 'createdAt') result = a.createdAt.localeCompare(b.createdAt);
        else {
          // Undated tasks always follow dated tasks, whichever direction is selected.
          if (!a.dueDate && b.dueDate) return 1;
          if (a.dueDate && !b.dueDate) return -1;
          result = a.dueDate.localeCompare(b.dueDate);
        }
        if (result) return sortDirection === 'desc' ? -result : result;
        return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
      };
      return this.#state.tasks.filter(task =>
        (showCompleted || task.status !== 'done') &&
        (status === 'all' || task.status === status) &&
        (priority === 'all' || task.priority === priority) &&
        (projectId === 'all' || (projectId === 'none' ? !task.projectId : task.projectId === projectId)) &&
        (!needle || `${task.title}\n${task.description}\n${projectNames.get(task.projectId) ?? ''}`.toLocaleLowerCase('uk').includes(needle))
      ).sort(compare).map(task => ({ ...task }));
    }

    getStats() {
      const today = todayISO(clockDate(this.#clock));
      const tasks = this.#state.tasks;
      const byStatus = Object.fromEntries(STATUSES.map(status => [status, tasks.filter(task => task.status === status).length]));
      const byPriority = Object.fromEntries(PRIORITIES.map(priority => [priority, tasks.filter(task => task.priority === priority).length]));
      return {
        totalTasks: tasks.length,
        completedTasks: byStatus.done,
        activeTasks: tasks.length - byStatus.done,
        overdueTasks: tasks.filter(task => task.status !== 'done' && task.dueDate && task.dueDate < today).length,
        dueTodayTasks: tasks.filter(task => task.status !== 'done' && task.dueDate === today).length,
        completionRate: tasks.length ? Math.round(byStatus.done / tasks.length * 100) : 0,
        totalProjects: this.#state.projects.length,
        byStatus, byPriority,
      };
    }
  }

  function createDemoData(date = new Date()) {
    const clock = () => new Date(date.getTime());
    clockDate(clock);
    const relativeDay = offset => {
      const target = new Date(date.getTime());
      target.setDate(target.getDate() + offset);
      return todayISO(target);
    };
    const projects = [
      new Project({ name: 'Вебтехнології', description: 'Практика, лабораторні роботи та власний вебпроєкт.', color: '#6366f1' }, { clock }).toJSON(),
      new Project({ name: 'Навчання та розвиток', description: 'Конспекти, підготовка й корисні звички.', color: '#14b8a6' }, { clock }).toJSON(),
      new Project({ name: 'Особисті справи', description: 'Усе важливе поза навчанням.', color: '#f59e0b' }, { clock }).toJSON(),
    ];
    const tasks = [
      { title: 'Завершити інтерфейс лабораторної', description: 'Перевірити всі екрани, форми, фільтри та збереження даних.', status: 'in_progress', priority: 'high', projectId: projects[0].id, dueDate: relativeDay(0) },
      { title: 'Повторити принципи ООП', description: 'Класи, інкапсуляція та розділення відповідальностей.', status: 'todo', priority: 'medium', projectId: projects[0].id, dueDate: relativeDay(1) },
      { title: 'Підготуватися до семінару', description: 'Перечитати конспект і записати запитання.', status: 'todo', priority: 'high', projectId: projects[1].id, dueDate: relativeDay(-1) },
      { title: 'Прочитати розділ про доступність', description: 'Клавіатурна навігація, підписи полів та контраст.', status: 'todo', priority: 'low', projectId: projects[1].id, dueDate: relativeDay(3) },
      { title: 'Спланувати наступний тиждень', description: 'Виділити час на навчання, відпочинок і спорт.', status: 'todo', priority: 'medium', projectId: projects[2].id, dueDate: relativeDay(5) },
      { title: 'Створити структуру проєкту', description: 'Окремі модулі для інтерфейсу, логіки та сховища.', status: 'done', priority: 'high', projectId: projects[0].id, dueDate: relativeDay(-2) },
      { title: 'Оновити список літератури', description: 'Зібрати корисні джерела для наступних занять.', status: 'done', priority: 'low', projectId: projects[1].id, dueDate: relativeDay(-1) },
      { title: 'Записати нову ідею', description: 'Маленькі кроки допомагають рухатися вперед.', status: 'todo', priority: 'low', projectId: '', dueDate: '' },
    ].map(input => new Task(input, { clock }).toJSON());
    return { schemaVersion: 1, projects, tasks, settings: { ...DEFAULT_SETTINGS } };
  }

  Object.assign(Studyflow, { ValidationError, todayISO, Task, Project, WorkspaceService, createDemoData });
})(window.Studyflow = window.Studyflow || {});
