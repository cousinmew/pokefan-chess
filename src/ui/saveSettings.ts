// SPDX-License-Identifier: AGPL-3.0-only
// The "Your save" part of Settings (§B18 item 2): players, Save protected, Export and Import, and opt in save codes.
import { fmt } from '../game/text';
import { downloadSave, normalizeSaveCode, SAVE_CODE_RE, uploadSave } from '../net/saveCode';
import { exportSave, importSave, packSave, protectSave, unpackSave } from '../store/backup';
import { load, save } from '../store/persist';
import { button, el, toast } from './dom';

export interface SaveActions {
  players(): void;
  /** After Import or a restored code: the page reloads into the restored save. */
  restored(): void;
}

export function saveSection(a: SaveActions): HTMLElement {
  const box = el('section', 'save-box');
  box.dataset.testid = 'save-box';
  const prot = el('p', 'save-protected');
  prot.dataset.testid = 'save-protected';
  const showProt = (ok: boolean) => (prot.textContent = fmt('save.protected', { state: fmt(ok ? 'save.yes' : 'save.no') }));
  showProt(false);
  void protectSave().then(showProt);

  const file = el('input');
  file.type = 'file';
  file.accept = 'application/json,.json';
  file.hidden = true;
  file.dataset.testid = 'import-file';
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    if (await importSave(f)) {
      toast('save.imported');
      a.restored();
    } else toast('save.badFile');
  };

  const codeOut = el('p', 'save-code');
  codeOut.dataset.testid = 'save-code';
  const showCode = (code: string | null) => {
    codeOut.textContent = code ? fmt('save.code.yours', { code: `${code.slice(0, 4)}-${code.slice(4)}` }) : '';
    codeOut.hidden = !code;
    make.textContent = fmt(code ? 'save.code.update' : 'save.code.make');
  };
  const make = button('save.code.make', async () => {
    make.disabled = true;
    try {
      const code = await uploadSave(packSave(), load<string>('saveCode'));
      save('saveCode', code);
      showCode(code);
    } catch (err) {
      console.warn('save code upload failed:', err instanceof Error ? err.message : err);
      toast('save.code.offline');
    }
    make.disabled = false;
  }, 'save-code-make');

  const input = el('input', 'save-code-input');
  input.dataset.testid = 'save-code-input';
  input.setAttribute('autocapitalize', 'characters');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.maxLength = 9;
  input.placeholder = fmt('save.code.enter');
  input.setAttribute('aria-label', fmt('save.code.enter'));
  const restore = button('save.code.restore', async () => {
    const code = normalizeSaveCode(input.value);
    if (!SAVE_CODE_RE.test(code)) return toast('save.code.bad');
    try {
      const got = await downloadSave(code);
      if (!unpackSave(got)) return toast('save.code.bad');
      save('saveCode', code);
      toast('save.imported');
      a.restored();
    } catch (err) {
      console.warn('save code restore failed:', err instanceof Error ? err.message : err);
      toast('save.code.offline');
    }
  }, 'save-code-restore', 'secondary');
  const restoreRow = el('div', 'save-row');
  restoreRow.append(input, restore);

  const files = el('div', 'save-row');
  files.append(button('save.export', exportSave, 'export-save'), button('save.import', () => file.click(), 'import-save', 'secondary'), file);
  box.append(el('h3', '', 'save.title'), prot, button('profiles.switch', a.players, 'players', 'secondary'), files, make, codeOut, el('p', 'save-note', 'save.code.note'), restoreRow);
  showCode(load<string>('saveCode'));
  return box;
}
