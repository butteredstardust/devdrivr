export function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')

  return slug || 'heading'
}

export function nextHeadingId(text: string, counts: Map<string, number>): string {
  const slug = slugifyHeading(text)
  const count = counts.get(slug) ?? 0
  counts.set(slug, count + 1)
  return count === 0 ? slug : `${slug}-${count + 1}`
}
