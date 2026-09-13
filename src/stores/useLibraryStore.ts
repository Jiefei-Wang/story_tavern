import { create } from 'zustand';
import { storageService } from '../db/storage';
import { emptyLibrary, validateLibrary, type Library, type LibraryRecord } from '../engine/library/Library';

interface LibraryState {
  record: LibraryRecord;
  loaded: boolean;
  saving: boolean;
  load: () => Promise<void>;
  save: (data: Library, expectedRevision: number, signal?: AbortSignal) => Promise<void>;
  selectStory: (id: string) => Promise<void>;
}
export const useLibraryStore = create<LibraryState>((set, get) => ({
  record: { revision: -1, data: emptyLibrary() }, loaded: false, saving: false,
  load: async () => { const record = await storageService.getLibrary(); if (!record) throw new Error('配置库尚未初始化'); set({ record, loaded: true }); },
  save: async (data, expectedRevision, signal) => {
    if (get().saving || get().record.revision !== expectedRevision) throw new Error('配置已变化，请重新打开后编辑');
    validateLibrary(data); signal?.throwIfAborted();
    const candidate = { revision: expectedRevision + 1, data: structuredClone(data) };
    set({ saving: true });
    try { await storageService.commitLibrary(candidate, expectedRevision, signal); set({ record: candidate, loaded: true }); }
    finally { set({ saving: false }); }
  },
  selectStory: async id => { const { record, save } = get(); await save({ ...record.data, selectedStoryId: id }, record.revision); },
}));
