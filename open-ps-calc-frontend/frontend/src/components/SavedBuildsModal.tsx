import { useEffect, useState } from "react";
import { UrlEditorState } from "../types";
import { SavedBuild, listSavedBuilds, saveBuild, deleteSavedBuild, MAX_SAVED_BUILDS } from "../lib/savedBuilds";

interface Props {
  open: boolean;
  onClose: () => void;
  currentName: string;
  currentState: UrlEditorState;
  onLoad: (state: UrlEditorState) => void;
  onSave: (name: string) => void;
}

export default function SavedBuildsModal({ open, onClose, currentName, currentState, onLoad, onSave }: Props) {
  const [builds, setBuilds] = useState<SavedBuild[]>([]);
  const [nameInput, setNameInput] = useState(currentName);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setBuilds(listSavedBuilds());
    setNameInput(currentName);
    setError("");
  }, [open, currentName]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handleSave() {
    const name = nameInput.trim();
    if (!name) { setError("Name the build before saving."); return; }
    // Bake the typed name INTO the saved state. `currentState` was snapshotted from
    // the editor before `onSave` pushes the new name into `data`, so persisting it
    // as-is stored the OLD name inside the state while the list entry got the new
    // one. Loading then restored that stale name — a build saved once from a fresh
    // editor came back as "New Build". Re-saving masked it, which is why only the
    // builds saved exactly once were affected. Reported by a player.
    const result = saveBuild(name, { ...currentState, build: { ...currentState.build, name } });
    if (!result.ok) {
      setError(`You already have ${MAX_SAVED_BUILDS} saved builds — delete one first.`);
      return;
    }
    setBuilds(result.builds);
    setError("");
    onSave(name);
  }

  function handleDelete(id: string) {
    setBuilds(deleteSavedBuild(id));
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card saved-builds-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save / Load build</h2>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="field-row saved-builds-save-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Save current build as</label>
              <input value={nameInput} onChange={(e) => setNameInput(e.target.value)} placeholder="Build name" />
            </div>
            <button className="primary" onClick={handleSave}>Save</button>
          </div>
          {error && <p className="error-text">{error}</p>}
          <p className="hint-text">
            {builds.length}/{MAX_SAVED_BUILDS} slots used. Saving under an existing name overwrites it.
          </p>

          {builds.length === 0 ? (
            <p className="hint-text">No saved builds yet.</p>
          ) : (
            <ul className="saved-builds-list">
              {builds.slice().sort((a, b) => b.savedAt - a.savedAt).map((b) => (
                <li key={b.id} className="saved-builds-item">
                  <div className="saved-builds-item-info">
                    <span className="saved-builds-item-name">{b.name}</span>
                    <span className="saved-builds-item-date">{new Date(b.savedAt).toLocaleString()}</span>
                  </div>
                  <div className="saved-builds-item-actions">
                    <button
                      onClick={() => {
                        // The entry's own name is authoritative — it is what this row
                        // displays and what the user picked. Builds saved before the fix
                        // above still carry a stale name inside their state, so override
                        // it here rather than leaving those saves permanently wrong.
                        onLoad({ ...b.state, build: { ...b.state.build, name: b.name } });
                        onClose();
                      }}
                    >
                      Load
                    </button>
                    <button className="danger ghost" onClick={() => handleDelete(b.id)}>Delete</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
