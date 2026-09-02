import { useMemo, useState } from 'react'
import {
  CaretRightIcon,
  HeartIcon,
  PackageIcon,
  ScrollIcon,
  TextAaIcon,
} from '@phosphor-icons/react'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { SearchInput } from '@/components/shared/SearchInput'
import { EmptyState } from '@/components/shared/EmptyState'
import {
  CARGO_DEPENDENCIES,
  FONTS,
  NPM_DEPENDENCIES,
  licenseKeysFor,
  type Attribution,
} from '@/lib/acknowledgments'
import { LICENSE_TEXTS } from '@/lib/license-texts'

/**
 * Settings → Acknowledgments.
 *
 * Two jobs, and they are not the same job. *Attribution* is the credit — who wrote it and under
 * what terms — and that is the list. *Notice* is the legal obligation: Apache-2.0 § 4(a),
 * BSD-3-Clause § 1 and the SIL OFL all require the licence itself to be reproduced, not linked, so
 * the full texts are collapsed at the bottom rather than left to a URL the app cannot even open.
 */

const GROUPS: {
  id: string
  label: string
  icon: React.ReactNode
  items: readonly Attribution[]
}[] = [
  {
    id: 'npm',
    label: 'npm packages',
    icon: <PackageIcon size={12} />,
    items: NPM_DEPENDENCIES,
  },
  {
    id: 'cargo',
    label: 'Rust crates',
    icon: <PackageIcon size={12} />,
    items: CARGO_DEPENDENCIES,
  },
  { id: 'fonts', label: 'Typefaces', icon: <TextAaIcon size={12} />, items: FONTS },
]

const ALL_ITEMS = GROUPS.flatMap((group) => group.items)

/** Every licence named by anything we ship, in the order the texts are listed. */
const LICENSES_IN_USE = [...new Set(ALL_ITEMS.flatMap((item) => licenseKeysFor(item.license)))]
  .filter((key) => key in LICENSE_TEXTS)
  .sort()

export function AcknowledgmentsTab() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return GROUPS
    return GROUPS.map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.license.toLowerCase().includes(needle) ||
          (item.copyright?.toLowerCase().includes(needle) ?? false)
      ),
    })).filter((group) => group.items.length > 0)
  }, [query])

  const matchCount = filtered.reduce((total, group) => total + group.items.length, 0)

  return (
    <div className="space-y-4">
      <p className="text-2xs leading-relaxed text-[var(--color-text-muted)]">
        devdrivr is MIT licensed and built on the work below. Only direct dependencies are named;
        the full text of every licence they are offered under is reproduced at the bottom of this
        tab.
      </p>

      <SearchInput
        value={query}
        onValueChange={setQuery}
        placeholder="Filter by package, license or author…"
        aria-label="Filter acknowledgments"
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon={HeartIcon}
          size="sm"
          title="No matches"
          description={`Nothing in the ${ALL_ITEMS.length} credited packages matches “${query}”.`}
        />
      ) : (
        filtered.map((group) => (
          <div key={group.id}>
            <SectionLabel as="h4" className="mb-2" hint={`${group.items.length}`}>
              {group.icon}
              {group.label}
            </SectionLabel>
            <ul className="overflow-hidden rounded border border-[var(--color-border)]">
              {group.items.map((item) => (
                <li
                  key={`${group.id}-${item.name}`}
                  className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 last:border-b-0"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-xs text-[var(--color-text)]">{item.name}</span>{' '}
                    <span className="font-mono text-2xs text-[var(--color-text-muted)]">
                      {item.version}
                    </span>
                    {item.copyright && (
                      <div className="truncate text-2xs text-[var(--color-text-muted)]">
                        © {item.copyright}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 whitespace-nowrap rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-2xs text-[var(--color-text-muted)]">
                    {item.license}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {query.trim() !== '' && filtered.length > 0 && (
        <p className="text-2xs text-[var(--color-text-muted)]">
          {matchCount} of {ALL_ITEMS.length} packages shown.
        </p>
      )}

      <div>
        <SectionLabel as="h4" className="mb-2">
          <ScrollIcon size={12} />
          License texts
        </SectionLabel>
        <div className="space-y-1">
          {LICENSES_IN_USE.map((key) => (
            <LicenseDisclosure key={key} name={key} text={LICENSE_TEXTS[key] ?? ''} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * A collapsed licence.
 *
 * `<details>` rather than a `useState` toggle: it is keyboard- and screen-reader-operable for free,
 * and — the part that matters for a 15,000-character MPL — the browser keeps the closed content out
 * of the render tree, so five licences cost nothing until one is opened.
 */
function LicenseDisclosure({ name, text }: { name: string; text: string }) {
  return (
    <details className="group rounded border border-[var(--color-border)] bg-[var(--color-bg)]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2 py-1.5 text-xs text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]">
        <CaretRightIcon
          size={12}
          aria-hidden="true"
          className="shrink-0 transition-transform duration-[var(--duration-fast)] group-open:rotate-90"
        />
        <span className="font-mono">{name}</span>
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-[var(--color-border)] px-2 py-2 font-mono text-2xs leading-relaxed text-[var(--color-text-muted)]">
        {text}
      </pre>
    </details>
  )
}
