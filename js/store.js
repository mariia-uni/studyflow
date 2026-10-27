// Classic browser script; loaded in order by index.html, including from file://.
(function (Studyflow) {
  'use strict';

  /** Storage adapters have one synchronous contract: load a snapshot, save a snapshot. */
  const copy = value => value == null ? value : JSON.parse(JSON.stringify(value));

  class MemoryRepository {
    #state;

    constructor(initialState = null) {
      this.#state = copy(initialState);
    }

    load() {
      return copy(this.#state);
    }

    save(state) {
      this.#state = copy(state);
    }
  }

  class LocalStorageRepository {
    constructor(storage, key = 'studyflow.workspace.v1') {
      if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
        throw new Error('Локальне сховище недоступне.');
      }
      this.storage = storage;
      this.key = key;
    }

    load() {
      try {
        const raw = this.storage.getItem(this.key);
        return raw === null ? null : JSON.parse(raw);
      } catch (cause) {
        throw new Error('Не вдалося прочитати збережені дані. Перевірте доступ до сховища браузера.', { cause });
      }
    }

    save(state) {
      try {
        // Web Storage setItem is atomic: on failure the previous value is retained.
        this.storage.setItem(this.key, JSON.stringify(state));
      } catch (cause) {
        throw new Error('Не вдалося зберегти зміни. Можливо, сховище браузера переповнене або недоступне.', { cause });
      }
    }
  }

  Object.assign(Studyflow, { MemoryRepository, LocalStorageRepository });
})(window.Studyflow = window.Studyflow || {});
