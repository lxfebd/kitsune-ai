import { describe, expect, it } from 'vitest'

import { decodeEntities, extractBySelector, extractTitle, htmlToText, parseSelector, stripTags } from './html'

describe('decodeEntities', () => {
  it('decodes named entities', () => {
    expect(decodeEntities('a &amp; b &lt;tag&gt; &quot;x&quot;')).toBe('a & b <tag> "x"')
  })

  it('decodes decimal and hex numeric entities', () => {
    expect(decodeEntities('&#65;&#x42;')).toBe('AB')
  })

  it('keeps unknown entities as-is', () => {
    expect(decodeEntities('&notanentity;')).toBe('&notanentity;')
  })

  it('returns empty string for invalid code points instead of throwing', () => {
    expect(decodeEntities('&#99999999999;')).toBe('')
  })
})

describe('stripTags', () => {
  it('removes tags and decodes entities', () => {
    expect(stripTags('<div><b>bold&nbsp;text</b></div>')).toBe('bold text')
  })
})

describe('htmlToText', () => {
  it('drops script and style blocks', () => {
    const html = '<html><head><style>body{}</style></head><body><script>var x=1;</script><p>visible</p></body></html>'
    const text = htmlToText(html)
    expect(text).toContain('visible')
    expect(text).not.toContain('var x')
    expect(text).not.toContain('body{}')
  })

  it('turns block boundaries into newlines and collapses whitespace', () => {
    const html = '<div>a   b</div><p>c&nbsp;d</p><br><li>e</li>'
    expect(htmlToText(html)).toBe('a b\nc d\ne')
  })

  it('returns empty string for markup-only input', () => {
    expect(htmlToText('<div></div><script>x</script>')).toBe('')
  })
})

describe('extractTitle', () => {
  it('extracts the title text with entities decoded', () => {
    expect(extractTitle('<html><head><title>My &amp; Page</title></head></html>')).toBe('My & Page')
  })

  it('returns empty string when there is no title', () => {
    expect(extractTitle('<html><head></head></html>')).toBe('')
  })
})

describe('parseSelector', () => {
  it('parses id, class, and tag forms', () => {
    expect(parseSelector('#main')).toEqual({ kind: 'id', value: 'main' })
    expect(parseSelector('.content')).toEqual({ kind: 'class', value: 'content' })
    expect(parseSelector('ARTICLE')).toEqual({ kind: 'tag', value: 'article' })
  })

  it('rejects compound selectors with an actionable message', () => {
    expect(() => parseSelector('div .a')).toThrow('Unsupported CSS selector')
    expect(() => parseSelector('#')).toThrow('Invalid id selector')
  })
})

describe('extractBySelector', () => {
  const page = `
    <html>
      <head><title>t</title></head>
      <body>
        <div id="main">
          <h1>Title</h1>
          <div class="card"><div class="card">nested card</div></div>
          <ul>
            <li>one</li>
            <li>two</li>
            <li>three
          </ul>
          <img id="logo" alt="Logo Image">
          <script>var hidden = true;</script>
        </div>
      </body>
    </html>
  `

  it('extracts text of the element with the matching id', () => {
    const text = extractBySelector(page, '#main')
    expect(text).toContain('Title')
    expect(text).toContain('nested card')
    expect(text).not.toContain('var hidden')
  })

  it('matches all elements carrying the class and dedupes nested matches', () => {
    const text = extractBySelector(page, '.card')
    expect(text).toBe('nested card')
  })

  // ROOT CAUSE:
  //
  // The original scanner treated EVERY same-name opening tag as an implicit
  // close of the previous unclosed same-name element. div>div is legal HTML
  // nesting, so the outer element was truncated at the inner element's start
  // and any text after the inner close was lost.
  //
  // Implicit closing now applies only to tags that close on same-name open
  // in HTML5 (li, p, td, ...).
  it('keeps trailing text of same-name nested elements', () => {
    const html = '<div class="x">outer <div class="x">inner</div> tail</div>'
    // 块级 div 边界在 htmlToText 中转行，所以保留换行形态。
    expect(extractBySelector(html, '.x')).toBe('outer\ninner\ntail')
  })

  it('extracts every matching tag including implicitly closed elements', () => {
    const text = extractBySelector(page, 'li')
    expect(text).toContain('one')
    expect(text).toContain('two')
    expect(text).toContain('three')
  })

  it('exposes alt text for matching void elements', () => {
    expect(extractBySelector(page, '#logo')).toBe('Logo Image')
  })

  it('returns empty string when nothing matches', () => {
    expect(extractBySelector(page, '#missing')).toBe('')
    expect(extractBySelector(page, '.missing')).toBe('')
    expect(extractBySelector(page, 'table')).toBe('')
  })

  it('respects comments and CDATA without breaking the scan', () => {
    const html = '<!-- <div id="x">noise</div> --><div id="x">real</div><!-- </div> -->'
    expect(extractBySelector(html, '#x')).toBe('real')
  })

  it('reads single-quoted attributes', () => {
    expect(extractBySelector("<div class='item'>item text</div>", '.item')).toBe('item text')
  })
})
