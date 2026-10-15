// SPDX-License-Identifier: AGPL-3.0-only
// The "Your save" part of Settings (§B18 item 2): players, Save protected, Export and Import, and opt in save codes.
import { fmt, type StringKey } from '../game/text';
import { deleteSave, downloadSave, normalizeSaveCode, SAVE_CODE_RE, uploadSave } from '../net/saveCode';
import { exportSave, importSave, packSave, protectSave, unpackSave } from '../store/backup';
import { isGuest, load, remove, save } from '../store/persist';
import { button, el, toast } from './dom';

export interface SaveActions {
  players(): void;
  /** After Import or a restored code: the page reloads into the restored save. */
  restored(): void;
}

export function saveSection(a: SaveActions): HTMLElement {
  // A guest's game is never saved (§B22 item 4): no save tools then, only a line that says so (ux #14).
  if (isGuest()) {
    const note = el('p', 'save-note guest-note', 'save.guestNote');
    note.dataset.testid = 'guest-note';
    return note;
  }
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
  // Delete my save code (trust fix, 14 Oct): the server's copy goes at once, after one question; the save on this
  // device stays. Shown only while this save has a code.
  const del = el('div', 'save-row save-delete');
  const askDelete = () => {
    const q = el('p', 'save-note save-confirm', 'save.code.deleteAsk');
    const yes = button('profiles.yes', async () => {
      const code = load<string>('saveCode');
      yes.disabled = true;
      try {
        if (code) await deleteSave(code);
        remove('saveCode');
        showCode(null);
        toast('save.code.deleted');
      } catch (err) {
        // Nothing changed (15 Oct): the code still opens the save, so it stays, with a line that says so in the row
        // (a toast is gone in 1.6 s). Unreachable, a relay without DELETE, or a refusal: the line names no cause.
        console.warn('save code delete failed:', err instanceof Error ? err.message : err);
        showCode(code, 'save.code.notDeleted');
      }
    }, 'save-code-delete-yes', 'danger');
    del.replaceChildren(q, yes, button('profiles.no', () => showCode(load<string>('saveCode')), 'save-code-delete-no', 'secondary'));
  };
  const showCode = (code: string | null, note?: StringKey) => {
    codeOut.textContent = code ? fmt('save.code.yours', { code: `${code.slice(0, 4)}-${code.slice(4)}` }) : '';
    codeOut.hidden = !code;
    make.textContent = fmt(code ? 'save.code.update' : 'save.code.make');
    const said = el('p', 'save-note save-failed', note);
    said.setAttribute('role', 'status');
    said.dataset.testid = 'save-code-delete-failed';
    del.replaceChildren(...(code ? [...(note ? [said] : []), button('save.code.delete', askDelete, 'save-code-delete', 'secondary')] : []));
    del.hidden = !code;
  };
  const make = button('save.code.make', async () => {
    make.disabled = true;
    try {
      const code = await uploadSave(packSave(), load<string>('saveCode'));
      save('saveCode', code);
      showCode(code);
    } catch (err) {
      console.warn('save code upload failed:', err instanceof Error ? err.message : err);
      toast('relay.down');
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
      toast('relay.down');
    }
  }, 'save-code-restore', 'secondary');
  const restoreRow = el('div', 'save-row');
  restoreRow.append(input, restore);

  const files = el('div', 'save-row');
  files.append(button('save.export', exportSave, 'export-save'), button('save.import', () => file.click(), 'import-save', 'secondary'), file);
  box.append(el('h3', '', 'save.title'), prot, button('profiles.switch', a.players, 'players', 'secondary'), files, make, codeOut, del, el('p', 'save-note', 'save.code.note'), restoreRow);
  showCode(load<string>('saveCode'));
  return box;
}
