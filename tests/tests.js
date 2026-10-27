/* Standalone browser tests. Open index.html directly; all data stays in memory. */
(function () {
  'use strict';

  const { Task, Project, ValidationError, WorkspaceService, createDemoData, todayISO,
    MemoryRepository, LocalStorageRepository } = window.Studyflow || {};
  const cases = [];
  const test = (name, execute) => cases.push({ name, execute });
  const format = value => {
    try { return JSON.stringify(value); }
    catch { return String(value); }
  };
  const same = (actual, expected) => {
    if (Object.is(actual, expected)) return true;
    if (actual === null || expected === null || typeof actual !== 'object' || typeof expected !== 'object') return false;
    if (Array.isArray(actual) !== Array.isArray(expected)) return false;
    const keys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index] && same(actual[key], expected[key]));
  };
  const assert = {
    equal(actual, expected) {
      if (!Object.is(actual, expected)) throw new Error(`Очікується ${format(expected)}; отримано ${format(actual)}.`);
    },
    deepEqual(actual, expected) {
      if (!same(actual, expected)) throw new Error(`Структури даних відрізняються. Очікується ${format(expected)}; отримано ${format(actual)}.`);
    },
    throws(execute, expected) {
      let caught;
      try { execute(); }
      catch (error) { caught = error; }
      if (!caught) throw new Error('Очікувалася помилка, але операція виконалася успішно.');
      if (!expected) return;
      const matches = expected instanceof RegExp ? expected.test(caught.message)
        : expected === Error || expected.prototype instanceof Error ? caught instanceof expected
          : typeof expected === 'function' && expected(caught);
      if (!matches) throw new Error(`Отримано іншу помилку: ${caught.message}`);
    },
    doesNotThrow(execute) {
      try { execute(); }
      catch (error) { throw new Error(`Неочікувана помилка: ${error.message}`); }
    },
  };

const clock = () => new Date(2026, 9, 25, 10, 30);
const clone = value => JSON.parse(JSON.stringify(value));
const makeService = () => new WorkspaceService(new MemoryRepository(), { clock });
const isValidationFor = field => error => error instanceof ValidationError && Object.hasOwn(error.errors, field);

class FakeStorage {
  values = new Map();
  failWrites = false;

  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.values.set(key, value);
  }
}

test('Створення, редагування й видалення зберігають цілісність завдань та проєктів', () => {
  const service = makeService();
  let state = service.createProject({ name: '  Вебтехнології  ', color: '#112233' });
  const project = state.projects[0];
  assert.equal(project.name, 'Вебтехнології');
  state = service.createTask({ title: '  Лабораторна  ', projectId: project.id, dueDate: '2026-10-25' });
  const original = state.tasks[0];
  state = service.updateTask(original.id, { title: 'Готова лабораторна', status: 'done' });
  assert.equal(state.tasks[0].id, original.id);
  assert.equal(state.tasks[0].createdAt, original.createdAt);
  assert.equal(state.tasks[0].status, 'done');
  service.updateProject(project.id, { name: 'Новий курс' });
  state = service.deleteProject(project.id);
  assert.equal(state.projects.length, 0);
  assert.equal(state.tasks[0].projectId, '');
  assert.equal(state.tasks[0].title, 'Готова лабораторна');
  assert.equal(service.deleteTask(original.id).tasks.length, 0);
  assert.throws(() => service.deleteTask(original.id), isValidationFor('id'));
});

test('Некоректне редагування не змінює дані та зв’язки з проєктами', () => {
  const service = makeService();
  service.createTask({ title: 'Конспект' });
  const before = service.getState();
  const taskId = before.tasks[0].id;
  assert.throws(() => service.updateTask(taskId, { title: '   ' }), isValidationFor('title'));
  assert.throws(() => service.updateTask(taskId, { projectId: 'missing-project' }), isValidationFor('projectId'));
  assert.throws(() => service.createTask({ title: 'Інша', status: 'unknown' }), isValidationFor('status'));
  assert.throws(() => service.createTask({ title: 'Інша', priority: 'urgent' }), isValidationFor('priority'));
  assert.throws(() => service.createTask({ title: 'Інша', id: 'custom-id' }), isValidationFor('id'));
  assert.deepEqual(service.getState(), before);
});

test('Валідація перевіряє довжину, календарні дати та типи значень', () => {
  assert.throws(() => new Task({ title: 'a'.repeat(121) }), isValidationFor('title'));
  assert.throws(() => new Task({ title: 'Okay', description: 'a'.repeat(2001) }), isValidationFor('description'));
  assert.throws(() => new Task({ title: 'Okay', dueDate: '2025-02-29' }), isValidationFor('dueDate'));
  assert.throws(() => new Task({ title: 'Okay', dueDate: '2026-04-31' }), isValidationFor('dueDate'));
  assert.throws(() => new Task({ title: 'Okay', dueDate: '2026-1-01' }), isValidationFor('dueDate'));
  assert.throws(() => new Task({ title: 'Okay', dueDate: null }), isValidationFor('dueDate'));
  assert.throws(() => new Task({ title: 'Okay', projectId: 5 }), isValidationFor('projectId'));
  assert.throws(() => new Task({ title: 'Okay', description: 5 }), isValidationFor('description'));
  assert.throws(() => new Project({ name: 'a'.repeat(81) }), isValidationFor('name'));
  assert.throws(() => new Project({ name: 'Okay', description: 'a'.repeat(1001) }), isValidationFor('description'));
  assert.throws(() => new Project({ name: 'Okay', color: 'red' }), isValidationFor('color'));
  assert.equal(new Task({ title: 'Okay', dueDate: '2028-02-29' }).toJSON().dueDate, '2028-02-29');
});

test('Отримані копії даних не дозволяють змінювати внутрішній стан', () => {
  const service = makeService();
  const state = service.createTask({ title: 'Оригінал' });
  state.tasks[0].title = 'Зовнішня зміна';
  state.settings.name = 'Хтось';
  state.tasks.push({ id: 'fake' });
  service.listTasks()[0].title = 'Інша зовнішня зміна';
  assert.equal(service.getState().tasks[0].title, 'Оригінал');
  assert.equal(service.getState().tasks.length, 1);
  assert.equal(service.getState().settings.name, 'Студент');
  const repository = new MemoryRepository(service.getState());
  repository.load().tasks[0].title = 'Зміна сховища';
  assert.equal(repository.load().tasks[0].title, 'Оригінал');
});

test('Експорт та імпорт зберігають ідентифікатори, дані й налаштування', () => {
  const service = makeService();
  service.resetDemo();
  service.updateSettings({ name: 'Ілля', theme: 'dark', defaultView: 'tasks', showCompleted: false });
  const restored = makeService();
  const state = restored.importData(service.exportData());
  assert.deepEqual(state, service.getState());
  assert.equal(state.settings.theme, 'dark');
  assert.equal(state.settings.showCompleted, false);
  assert.equal(new Set([...state.projects, ...state.tasks].map(item => item.id)).size, state.projects.length + state.tasks.length);
});

test('Імпорт перевіряє структуру, повноту записів, унікальність і зв’язки', () => {
  const service = makeService();
  const baseline = service.resetDemo();
  const invalidCases = [
    state => { state.schemaVersion = 99; },
    state => { state.tasks = {}; },
    state => { delete state.tasks[0].createdAt; },
    state => { state.tasks[0].createdAt = undefined; },
    state => { state.tasks[0].id = state.tasks[1].id; },
    state => { state.tasks[0].id = state.projects[0].id; },
    state => { state.tasks[0].id = '<unsafe>'; },
    state => { state.tasks[0].projectId = 'missing-project'; },
    state => { state.tasks[0].dueDate = '2026-02-30'; },
    state => { state.tasks[0].dueDate = null; },
    state => { state.tasks[0].status = 'complete'; },
    state => { state.tasks[0].updatedAt = 'not-a-date'; },
    state => { state.tasks[0].createdAt = '2026-02-30T10:00:00.000Z'; },
    state => { state.settings.showCompleted = 'false'; },
    state => { state.settings.unknown = true; },
    state => { state.extra = true; },
  ];
  for (const mutate of invalidCases) {
    const malformed = clone(baseline);
    mutate(malformed);
    assert.throws(() => service.importData(malformed), ValidationError);
    assert.deepEqual(service.getState(), baseline);
  }
  assert.throws(() => service.importData('{broken'), isValidationFor('file'));
  assert.throws(() => service.importData(null), ValidationError);
  assert.throws(() => service.importData([]), ValidationError);
});

test('Помилка збереження скасовує всі види змін без втрати даних', () => {
  const storage = new FakeStorage();
  const repository = new LocalStorageRepository(storage);
  const service = new WorkspaceService(repository, { clock });
  const before = service.resetDemo();
  const savedBefore = repository.load();
  storage.failWrites = true;
  const operations = [
    () => service.createTask({ title: 'Нове завдання' }),
    () => service.updateTask(before.tasks[0].id, { title: 'Змінене завдання' }),
    () => service.deleteTask(before.tasks[0].id),
    () => service.createProject({ name: 'Новий проєкт' }),
    () => service.updateProject(before.projects[0].id, { name: 'Нова назва' }),
    () => service.deleteProject(before.projects[0].id),
    () => service.updateSettings({ theme: 'dark' }),
    () => service.clear(),
    () => service.resetDemo(),
    () => service.importData(createDemoData(clock())),
  ];
  for (const operation of operations) {
    assert.throws(operation, /Не вдалося зберегти зміни/);
    assert.deepEqual(service.getState(), before);
    assert.deepEqual(repository.load(), savedBefore);
  }
  storage.failWrites = false;
  assert.equal(service.createTask({ title: 'Успішне збереження' }).tasks.length, before.tasks.length + 1);
});

test('Адаптер сховища відновлює дані й повідомляє про помилки читання', () => {
  const storage = new FakeStorage();
  const first = new WorkspaceService(new LocalStorageRepository(storage), { clock });
  first.createTask({ title: 'Збережено' });
  const second = new WorkspaceService(new LocalStorageRepository(storage), { clock });
  assert.deepEqual(second.getState(), first.getState());
  storage.setItem('broken', '{invalid');
  assert.throws(() => new LocalStorageRepository(storage, 'broken').load(), /Не вдалося прочитати/);
  assert.throws(() => new LocalStorageRepository({ getItem() { throw new Error('disabled'); }, setItem() {} }).load(), /Не вдалося прочитати/);
  assert.throws(() => new LocalStorageRepository(null), /недоступне/);
});

test('Пошук і фільтри за статусом, пріоритетом та проєктом працюють разом', () => {
  const service = makeService();
  const state = service.createProject({ name: 'Вебтехнології' });
  const projectId = state.projects[0].id;
  service.createTask({ title: 'Альфа', description: 'Конспект JavaScript', projectId, priority: 'high', status: 'todo', dueDate: '2026-10-26' });
  service.createTask({ title: 'Бета', projectId, priority: 'low', status: 'done', dueDate: '2026-10-24' });
  service.createTask({ title: 'Гамма', priority: 'high', status: 'in_progress', dueDate: '' });
  assert.equal(service.listTasks({ query: 'JAVASCRIPT' }).length, 1);
  assert.equal(service.listTasks({ query: 'вебтехнології' }).length, 2);
  assert.equal(service.listTasks({ projectId, priority: 'high', status: 'todo', query: 'альфа' }).length, 1);
  assert.equal(service.listTasks({ projectId: 'none' })[0].title, 'Гамма');
  assert.equal(service.listTasks({ showCompleted: false }).length, 2);
  service.updateSettings({ showCompleted: false });
  assert.equal(service.listTasks().length, 2);
  assert.equal(service.listTasks({ showCompleted: true, status: 'done' }).length, 1);
});

test('Сортування враховує терміни, відсутні дати, пріоритети й українські назви', () => {
  const service = makeService();
  service.createTask({ title: 'В', dueDate: '', priority: 'medium' });
  service.createTask({ title: 'Б', dueDate: '2026-10-26', priority: 'low' });
  service.createTask({ title: 'А', dueDate: '2026-10-24', priority: 'high' });
  assert.deepEqual(service.listTasks().map(task => task.title), ['А', 'Б', 'В']);
  assert.deepEqual(service.listTasks({ sortDirection: 'desc' }).map(task => task.title), ['Б', 'А', 'В']);
  assert.deepEqual(service.listTasks({ sortBy: 'priority' }).map(task => task.title), ['А', 'В', 'Б']);
  assert.deepEqual(service.listTasks({ sortBy: 'title' }).map(task => task.title), ['А', 'Б', 'В']);
});

test('Статистика правильно рахує завершені, активні й прострочені завдання', () => {
  const service = makeService();
  service.createTask({ title: 'Прострочене', dueDate: '2026-10-24', status: 'todo' });
  service.createTask({ title: 'На сьогодні', dueDate: '2026-10-25', status: 'in_progress' });
  service.createTask({ title: 'Виконане сьогодні', dueDate: '2026-10-25', status: 'done' });
  service.createTask({ title: 'Виконане вчора', dueDate: '2026-10-24', status: 'done' });
  service.updateSettings({ showCompleted: false });
  const stats = service.getStats();
  assert.equal(stats.totalTasks, 4);
  assert.equal(stats.activeTasks, 2);
  assert.equal(stats.completedTasks, 2);
  assert.equal(stats.overdueTasks, 1);
  assert.equal(stats.dueTodayTasks, 1);
  assert.equal(stats.completionRate, 50);
  assert.deepEqual(stats.byStatus, { todo: 1, in_progress: 1, done: 2 });
  assert.equal(makeService().getStats().completionRate, 0);
});

test('Локальні та демонстраційні дати правильно обробляють межі дня й року', () => {
  const localMidnight = new Date(2026, 0, 1, 0, 15);
  const localLateEvening = new Date(2026, 0, 1, 23, 45);
  assert.equal(todayISO(localMidnight), '2026-01-01');
  assert.equal(todayISO(localLateEvening), '2026-01-01');
  const demo = createDemoData(localMidnight);
  assert.equal(demo.tasks[0].dueDate, '2026-01-01');
  assert.equal(demo.tasks[2].dueDate, '2025-12-31');
  assert.equal(demo.tasks[1].dueDate, '2026-01-02');
  assert.throws(() => todayISO(new Date('invalid')), /Некоректна дата/);
});

test('Налаштування перевіряються, очищення зберігає їх, демодані залишаються коректними', () => {
  const service = makeService();
  service.resetDemo();
  service.updateSettings({ name: 'Ілля', theme: 'system', defaultView: 'projects' });
  assert.throws(() => service.updateSettings({ theme: 'purple' }), isValidationFor('theme'));
  assert.throws(() => service.updateSettings({ showCompleted: 0 }), isValidationFor('showCompleted'));
  const cleared = service.clear();
  assert.equal(cleared.tasks.length, 0);
  assert.equal(cleared.projects.length, 0);
  assert.equal(cleared.settings.name, 'Ілля');
  const demo = service.resetDemo();
  assert.equal(demo.projects.length, 3);
  assert.equal(demo.tasks.length, 8);
  assert.doesNotThrow(() => makeService().importData(demo));
});

test('Ідентифікатори залишаються унікальними під час швидкого створення 1000 об’єктів', () => {
  const identifiers = new Set();
  for (let index = 0; index < 500; index += 1) {
    identifiers.add(new Task({ title: `Завдання ${index}` }).toJSON().id);
    identifiers.add(new Project({ name: `Проєкт ${index}` }).toJSON().id);
  }
  assert.equal(identifiers.size, 1000);
});

test('Редагування імпортованих майбутніх записів зберігає порядок часових міток', () => {
  const service = makeService();
  const futureData = createDemoData(new Date(2027, 0, 1));
  service.importData(futureData);
  service.updateTask(futureData.tasks[0].id, { status: 'done' });
  service.updateProject(futureData.projects[0].id, { name: 'Новий курс' });
  service.deleteProject(futureData.projects[0].id);
  assert.doesNotThrow(() => makeService().importData(service.exportData()));
});

  function runTests() {
    const list = document.getElementById('results');
    const summary = document.getElementById('summary');
    const started = performance.now();
    const results = [];
    list.replaceChildren();
    for (const entry of cases) {
      const row = document.createElement('li');
      const name = document.createElement('strong');
      let failure = null;
      try { entry.execute(); }
      catch (error) { failure = error; }
      row.className = failure ? 'fail' : 'pass';
      name.textContent = `${failure ? '✕' : '✓'} ${entry.name}`;
      row.append(name);
      if (failure) {
        const detail = document.createElement('pre');
        detail.textContent = failure.message || String(failure);
        row.append(detail);
      }
      list.append(row);
      results.push({ name: entry.name, passed: !failure, error: failure?.message || null });
    }
    const passed = results.filter(result => result.passed).length;
    const failed = results.length - passed;
    const duration = Math.round(performance.now() - started);
    summary.className = failed ? 'summary fail' : 'summary pass';
    summary.textContent = `${passed} / ${results.length} перевірок пройдено · Помилок: ${failed} · ${duration} мс`;
    document.title = `${failed ? '✕' : '✓'} ${passed}/${results.length} — Studyflow: перевірки`;
    window.StudyflowTestResults = { passed, failed, total: results.length, duration, results };
    document.documentElement.dataset.testStatus = failed ? 'failed' : 'passed';
  }

  document.getElementById('run-tests').addEventListener('click', runTests);
  runTests();
}());
