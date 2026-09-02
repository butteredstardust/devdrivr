export type Base64TransformResult = {
  text: string
  bytes: Uint8Array | null
  mimeType: string | null
  error: string | null
}

function imageMime(base64: string): string | null {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  if (base64.startsWith('UklGR')) return 'image/webp'
  if (base64.startsWith('PHN2Zy')) return 'image/svg+xml'
  return null
}

export function transformBase64(
  input: string,
  mode: 'encode' | 'decode',
  urlSafe: boolean,
  lineWrap: boolean
): Base64TransformResult {
  if (!input.trim()) return { text: '', bytes: null, mimeType: null, error: null }
  try {
    if (mode === 'encode') {
      const bytes = new TextEncoder().encode(input)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      let text = btoa(binary)
      if (urlSafe) text = text.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      if (lineWrap) text = text.match(/.{1,76}/g)?.join('\n') ?? text
      return { text, bytes: null, mimeType: null, error: null }
    }

    let encoded = input.replace(/\s/g, '')
    const dataUri = encoded.match(/^data:([^;]*);base64,(.*)$/)
    const declaredMime = dataUri?.[1] || null
    if (dataUri?.[2]) encoded = dataUri[2]
    if (urlSafe) {
      encoded = encoded.replace(/-/g, '+').replace(/_/g, '/')
      const padding = encoded.length % 4
      if (padding) encoded += '='.repeat(4 - padding)
    }
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0))
    return {
      text: new TextDecoder().decode(bytes),
      bytes,
      mimeType: declaredMime ?? imageMime(encoded) ?? 'application/octet-stream',
      error: null,
    }
  } catch (error) {
    return {
      text: '',
      bytes: null,
      mimeType: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
