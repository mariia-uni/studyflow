# StudyFlow

A standalone study planner made only of plain HTML, CSS, and JavaScript.

Unzip the folder, then double-click `index.html` to open it in a modern browser. Keep `styles.css` and the `js/` folder beside it. No installation, internet connection, login, Node.js, npm, server, build step, framework, CDN, or external service is required. Fonts and icons are local system fonts and inline SVG.

To run the automated checks, open `tests/index.html` in the browser. The test page uses the same application scripts and displays each result. It uses isolated sample data and does not change your saved workspace.

The application has four screens (Overview, Tasks, Projects, and Settings), three dialogs (task editor, project editor, and confirmation), 45 static interface controls, and 27 unique named registered event handlers. It uses object-oriented separation between data models, storage, views, and controller logic. Workspace data persists in `localStorage` in this browser; there is no backend, account, or synchronization. The first run includes demonstration data. Import replaces the existing workspace after confirmation. Clearing data leaves an empty workspace without loading the demonstration data again.

## Interface inventory

The 45 elements marked `data-control` in `index.html` comprise 6 links, 19 buttons, 8 inputs, 10 selects, and 2 textareas. Controls generated for individual task and project records are additional.

There are four data containers: one task table, one upcoming-task list, and two project grids (`overview-projects` and `project-list`).

| Area | Count | Controls |
| --- | ---: | --- |
| Navigation | 7 | Skip link, brand, four screen links, add task |
| Overview | 3 | Add task, all tasks, all projects |
| Tasks | 7 | Add, search, status, priority, project, sort, clear filters |
| Projects | 2 | Add, search |
| Settings | 9 | Name, theme, default screen, completed visibility, save, export, import, demo, clear |
| Task dialog | 9 | Close, title, description, status, priority, project, deadline, cancel, save |
| Project dialog | 6 | Close, name, description, color, cancel, save |
| Confirmation | 2 | Cancel, accept |

The 27 controller handlers registered in `WorkspaceController.bindEvents()` are `onSkipToContent`, `onNavigate`, `onOpenTask`, `onCloseTask`, `onTaskSubmit`, `onTaskSearch`, `onTaskFilterChange`, `onClearFilters`, `onTaskListAction`, `onOpenProject`, `onCloseProject`, `onProjectSubmit`, `onProjectSearch`, `onProjectListAction`, `onSettingsSubmit`, `onExport`, `onImport`, `onResetDemo`, `onClearData`, `onConfirmAccept`, `onConfirmCancel`, `onGoTasks`, `onGoProjects`, `onDialogCancel`, `onHashChange`, `onStorageChange`, and `onThemeChange`.

## Source map

- `index.html` and `styles.css`: accessible interface and responsive layout.
- `js/domain.js`: `Task` and `Project` models, validation, and `WorkspaceService` operations.
- `js/store.js`: `LocalStorageRepository` and `MemoryRepository` storage adapters.
- `js/views.js`: `WorkspaceView` renders interface state.
- `js/app.js`: `WorkspaceController` connects named event handlers to services and views.
- `tests/index.html` and `tests/tests.js`: standalone browser checks for CRUD, validation, filtering, sorting, statistics, persistence rollback, import, export, and settings.

The four JavaScript files are ordinary scripts loaded with `defer` in dependency order. Each uses its own function scope; `window.Studyflow` shares the model, storage, and view classes without a module loader.

Saved data belongs to this browser and file location. Local-file storage policies vary between browsers; if storage is unavailable, the app shows a notice and keeps the workspace in memory until the tab closes. Use JSON export to keep a portable backup or move data between browsers or locations.
