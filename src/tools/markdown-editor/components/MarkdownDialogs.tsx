import type { Dispatch, SetStateAction } from 'react'
import { Button } from '@/components/shared/Button'
import { Dialog } from '@/components/shared/Dialog'
import {
  SelectionContextToolbar,
  type SelectionToolbarAction,
  type SelectionToolbarState,
} from '@/components/shared/SelectionContextToolbar'
import {
  type ActiveMarkdownModal,
  type PendingDocument,
} from '@/tools/markdown-editor/markdown-model'
import { CodeBlockModal } from '@/tools/markdown-editor/modals/CodeBlockModal'
import { ImageModal } from '@/tools/markdown-editor/modals/ImageModal'
import { LinkModal } from '@/tools/markdown-editor/modals/LinkModal'
import { TableModal } from '@/tools/markdown-editor/modals/TableModal'

type MarkdownDialogsProps = {
  pendingDocument: PendingDocument | null
  setPendingDocument: Dispatch<SetStateAction<PendingDocument | null>>
  applyDocument: (document: PendingDocument) => void
  activeModal: ActiveMarkdownModal
  setActiveModal: Dispatch<SetStateAction<ActiveMarkdownModal>>
  handleModalInsert: (text: string) => void
  editorSelection: SelectionToolbarState | null
  editorSelectionActions: SelectionToolbarAction[]
  clearEditorSelection: () => void
  previewSelection: SelectionToolbarState | null
  previewSelectionActions: SelectionToolbarAction[]
  clearPreviewSelection: () => void
}

export function MarkdownDialogs({
  pendingDocument,
  setPendingDocument,
  applyDocument,
  activeModal,
  setActiveModal,
  handleModalInsert,
  editorSelection,
  editorSelectionActions,
  clearEditorSelection,
  previewSelection,
  previewSelectionActions,
  clearPreviewSelection,
}: MarkdownDialogsProps) {
  return (
    <>
      {pendingDocument && (
        <Dialog
          title="Replace unsaved changes?"
          onClose={() => setPendingDocument(null)}
          size="md"
          footer={
            <>
              <Button type="button" variant="secondary" onClick={() => setPendingDocument(null)}>
                Keep editing
              </Button>
              <Button type="button" variant="danger" onClick={() => applyDocument(pendingDocument)}>
                Discard changes
              </Button>
            </>
          }
        >
          <p className="text-sm leading-6 text-[var(--color-text-muted)]">
            Your current document has changes that have not been saved to a file. Continuing will
            replace them.
          </p>
        </Dialog>
      )}

      {activeModal === 'link' && (
        <LinkModal
          initialText=""
          onInsert={handleModalInsert}
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === 'image' && (
        <ImageModal onInsert={handleModalInsert} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'code' && (
        <CodeBlockModal onInsert={handleModalInsert} onClose={() => setActiveModal(null)} />
      )}
      {activeModal === 'table' && (
        <TableModal onInsert={handleModalInsert} onClose={() => setActiveModal(null)} />
      )}
      <SelectionContextToolbar
        selection={editorSelection}
        actions={editorSelectionActions}
        onDismiss={clearEditorSelection}
      />
      <SelectionContextToolbar
        selection={editorSelection ? null : previewSelection}
        actions={previewSelectionActions}
        onDismiss={clearPreviewSelection}
      />
    </>
  )
}
