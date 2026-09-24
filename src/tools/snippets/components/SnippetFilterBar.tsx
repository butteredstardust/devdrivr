import { StarIcon } from '@phosphor-icons/react'
import { Button } from '@/components/shared/Button'
import { Select } from '@/components/shared/Input'
import { SearchInput } from '@/components/shared/SearchInput'
import type { useSnippetFilters } from '@/tools/snippets/hooks/useSnippetFilters'
import type { SortMode } from '@/tools/snippets/snippet-model'

type SnippetFilterBarProps = {
  filters: ReturnType<typeof useSnippetFilters>
}

export function SnippetFilterBar({ filters }: SnippetFilterBarProps) {
  const {
    search,
    setSearch,
    sortMode,
    setSortMode,
    filterTag,
    setFilterTag,
    favoritesOnly,
    setFavoritesOnly,
    searchInputRef,
    allTags,
    hasFilters,
    clearFilters,
  } = filters

  return (
    <div className="space-y-2 border-b border-[var(--color-border)] p-3">
      <SearchInput
        ref={searchInputRef}
        value={search}
        onValueChange={setSearch}
        placeholder="Search snippets"
        aria-label="Search snippets"
      />

      <div className="grid grid-cols-1 gap-2">
        <Select
          value={sortMode}
          onChange={(event) => setSortMode(event.target.value as SortMode)}
          aria-label="Sort snippets"
          title="Sort snippets"
        >
          <option value="updated">Recently edited</option>
          <option value="created">Recently created</option>
          <option value="title">Title A–Z</option>
          <option value="language">Language</option>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={favoritesOnly}
          onClick={() => setFavoritesOnly((current) => !current)}
          className={`gap-1.5 ${favoritesOnly ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : ''}`}
        >
          <StarIcon size={12} weight={favoritesOnly ? 'fill' : 'regular'} aria-hidden="true" />
          Favorites
        </Button>
        {allTags.length > 0 && (
          <Select
            value={filterTag}
            onChange={(event) => setFilterTag(event.target.value)}
            aria-label="Filter by tag"
            title="Filter by tag"
            className="min-w-0 flex-1"
          >
            <option value="">All tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                #{tag}
              </option>
            ))}
          </Select>
        )}
        {hasFilters && (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Clear
          </Button>
        )}
      </div>
    </div>
  )
}
