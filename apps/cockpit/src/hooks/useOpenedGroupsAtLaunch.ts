import { useRef } from 'react'
import { useSettingsStore } from '@/stores/settings.store'

/**
 * Whether the user had opened any sidebar group before this session started.
 *
 * Captured once, the first time settings report as loaded, and frozen for the
 * rest of the session. It gates the never-opened collapse default, and that
 * gate is the part that must not move: reading it live means the whole sidebar
 * flips from "everything expanded" to "only this group expanded" the instant a
 * first-run user clicks a tool, moving items out from under the pointer.
 *
 * Group membership itself stays live, so explicitly expanding a group — or
 * opening a tool inside it — takes effect immediately. Adding a group can only
 * ever expand that group; it can no longer collapse the others.
 *
 * Before settings load (and in tests that don't mark the store initialized) the
 * live value is used, which on a fresh store is the empty default.
 */
export function useHadOpenedGroupsAtLaunch(): boolean {
  const initialized = useSettingsStore((s) => s.initialized)
  const openedSidebarGroups = useSettingsStore((s) => s.openedSidebarGroups)
  const snapshot = useRef<boolean | null>(null)

  if (snapshot.current === null && initialized) {
    snapshot.current = openedSidebarGroups.length > 0
  }

  return snapshot.current ?? openedSidebarGroups.length > 0
}
