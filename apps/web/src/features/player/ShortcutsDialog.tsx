import { Fragment } from 'react';
import type { ReactElement } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SHORTCUTS } from './shortcuts';

interface ShortcutsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Host or moderator: playback shortcuts work for them. */
  readonly canControl: boolean;
}

/** The player's keyboard shortcuts, rendered from the same table the keyboard hook uses. */
export function ShortcutsDialog({ open, onOpenChange, canControl }: ShortcutsDialogProps): ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* The list scrolls inside, so the dialog box itself keeps its NeoPOP edges (no clipping). */}
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {canControl
              ? 'Playback shortcuts change the video for everyone in the room.'
              : 'Playback shortcuts are for the host and moderators; the rest work for you.'}
          </DialogDescription>
        </DialogHeader>
        {/* Focusable so keyboard users can scroll the list (it has no other focusable content). */}
        <div className="min-h-0 overflow-y-auto" tabIndex={0} role="region" aria-label="Shortcut list">
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Keys</th>
              </tr>
            </thead>
            <tbody>
              {SHORTCUTS.map((s) => {
                const unavailable = s.scope === 'staff' && !canControl;
                return (
                  <tr
                    key={s.id}
                    className="border-b last:border-0"
                    data-unavailable={unavailable || undefined}
                  >
                    <td className={unavailable ? 'text-muted-foreground py-2' : 'py-2'}>
                      {s.label}
                      {unavailable && <span className="block text-xs">Host and moderators</span>}
                    </td>
                    <td className="py-2 text-right whitespace-nowrap">
                      {s.display.map((key, i) => (
                        <Fragment key={key}>
                          {i > 0 && key !== '…' && s.display[i - 1] !== '…' && (
                            <span className="text-muted-foreground px-1 text-xs">or</span>
                          )}
                          {key === '…' ? (
                            <span className="text-muted-foreground px-1">–</span>
                          ) : (
                            <kbd className="bg-card border-foreground border-2 border-b-4 px-1.5 py-0.5 font-mono text-xs font-bold">
                              {key}
                            </kbd>
                          )}
                        </Fragment>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
