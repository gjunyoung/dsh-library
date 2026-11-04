/**
 * Render smoke test for the Client bundle.
 *
 * The browser bundle is a single file, so a bad hook order, a use-before-declare
 * or a missing component only shows up as a blank panel in the running app. This
 * test evaluates the bundle with tiny React and Cordis shims and renders every
 * registered slot entry — and, recursively, every function component it builds.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Minimal React: createElement, hooks that return their initial value, and a
 * renderer that walks the produced tree.
 * @param initialFor - optional override `(componentName, hookIndex, value) => value`.
 */
function createReact(initialFor) {
  let cursor = 0
  let currentName = ''

  const walk = (node) => {
    if (node === null || node === undefined) return
    if (Array.isArray(node)) {
      for (const child of node) walk(child)
      return
    }
    if (typeof node !== 'object') return
    if (typeof node.type === 'function') {
      currentName = node.type.name ?? ''
      cursor = 0
      node.rendered = node.type({ ...node.props, children: node.children })
      walk(node.rendered)
      return
    }
    for (const child of node.children ?? []) walk(child)
  }

  return {
    createElement(type, props, ...children) {
      assert.ok(
        typeof type === 'string' || typeof type === 'function',
        `createElement received ${String(type)} (a missing component?)`,
      )
      return { type, props: props ?? {}, children }
    },
    Fragment: 'Fragment',
    useState(initial) {
      const value = typeof initial === 'function' ? initial() : initial
      const index = cursor
      cursor += 1
      const override = initialFor === undefined ? undefined : initialFor(currentName, index, value)
      return [override === undefined ? value : override, () => {}]
    },
    useRef(initial) {
      cursor += 1
      return { current: initial }
    },
    useReducer(reducer, initial) {
      cursor += 1
      return [initial, () => {}]
    },
    useMemo(factory) {
      cursor += 1
      return factory()
    },
    useCallback(fn) {
      cursor += 1
      return fn
    },
    useEffect() {
      cursor += 1
    },
    useLayoutEffect() {
      cursor += 1
    },
    useContext() {
      cursor += 1
      return undefined
    },
    memo: (component) => component,
    forwardRef: (component) => component,
    createContext: () => ({ Provider: 'Provider', Consumer: 'Consumer' }),

    /** Render one component with a fresh hook cursor, then every function child. */
    render(component, props) {
      currentName = component.name ?? ''
      cursor = 0
      const tree = component(props)
      walk(tree)
      return tree
    },

    /** Every element in a produced tree with the given className. */
    findByClass(tree, className) {
      const found = []
      const visit = (node) => {
        if (node === null || node === undefined) return
        if (Array.isArray(node)) {
          for (const child of node) visit(child)
          return
        }
        if (typeof node !== 'object') return
        if (node.props?.className === className) found.push(node)
        if (node.rendered !== undefined) visit(node.rendered)
        for (const child of node.children ?? []) visit(child)
      }
      visit(tree)
      return found
    },

    /** Collect every element matching a predicate, following rendered output. */
    collect(tree, predicate) {
      const found = []
      const visit = (node) => {
        if (node === null || node === undefined) return
        if (Array.isArray(node)) {
          for (const child of node) visit(child)
          return
        }
        if (typeof node !== 'object') return
        if (predicate(node)) found.push(node)
        if (node.rendered !== undefined) visit(node.rendered)
        for (const child of node.children ?? []) visit(child)
      }
      visit(tree)
      return found
    },

    /** Invoke the first click handler in a produced tree. */
    clickFirst(tree) {
      let clicked = false
      const visit = (node) => {
        if (clicked || node === null || node === undefined) return
        if (Array.isArray(node)) {
          for (const child of node) visit(child)
          return
        }
        if (typeof node !== 'object') return
        if (typeof node.props?.onClick === 'function') {
          node.props.onClick()
          clicked = true
          return
        }
        if (node.rendered !== undefined) visit(node.rendered)
        for (const child of node.children ?? []) visit(child)
      }
      visit(tree)
      return clicked
    },
  }
}

async function loadBundle(initialFor) {
  const source = await readFile(path.join(root, 'client.js'), 'utf8')
  const React = createReact(initialFor)
  const registered = []
  let captured

  const window = {
    __ModuleLoader__: {
      load(definition) {
        captured = definition
      },
    },
  }

  const run = new Function('window', 'console', 'navigator', 'document', source)
  run(window, { log() {}, warn() {}, error() {} }, { plugins: [] }, undefined)

  assert.ok(captured !== undefined, 'the bundle never registered with the module loader')
  const exports = captured.factory((request) => {
    assert.equal(request, 'react', `unexpected require(${request})`)
    return React
  })
  assert.equal(typeof exports.apply, 'function', 'the bundle does not export apply()')

  const ctx = {
    slots: {
      inject(name, callback) {
        callback()
        return () => {}
      },
      register(options, component) {
        registered.push({ name: options.name, options, component })
        return () => {}
      },
    },
    locale: {
      bind: () => (key) => key,
      register: () => () => {},
      getSnapshot: () => ({ id: 'zh' }),
    },
    effect(fn) {
      const disposer = fn()
      return typeof disposer === 'function' ? disposer : () => {}
    },
    inject(deps, callback) {
      if (Array.isArray(deps) && deps.every((dep) => dep === 'slots' || dep === 'locale')) callback(ctx)
    },
    get: () => undefined,
    on: () => () => {},
    uiWorkspace: { openSession() {} },
  }

  exports.apply(ctx)
  return { registered, React }
}

const entryProps = {
  t: (key) => key,
  describeOrigin: () => 'workspace · session',
  jumpSource: async () => ({ ok: true }),
  closeTab: () => {},
  useTabInfo: () => ({ tab: { id: 'tab', contentId: 'dsh-resource://library/file/lic_ab12/x.txt' } }),
  sessionId: 'session-test',
  inputActions: { addAttachments() {} },
  useInput: () => ({ attachmentIds: [] }),
}

/** Render every registered slot entry. */
async function renderAll(initialFor) {
  const { registered, React } = await loadBundle(initialFor)
  assert.ok(registered.length > 0, 'no slot entries registered')
  for (const entry of registered) {
    assert.doesNotThrow(() => React.render(entry.component, entryProps), `${entry.name} threw while rendering`)
  }
}

test('every registered slot entry renders without throwing (default view)', async () => {
  await renderAll(undefined)
})

test('the favorites folder root renders without throwing', async () => {
  // LibraryPage hook order starts with `view`, then `category`.
  await renderAll((name, index, fallback) => (name === 'LibraryPage' && index === 1 ? 'favorite' : fallback))
})

test('the composer picker renders the favorites folder layer', async () => {
  // AttachPicker hook order: the open-state hook consumes two (reducer + effect),
  // then category 2, query 3, debounced 4, items 5, phase 6, error 7, selected 8,
  // busy 9, note 10, collectionFilter 11, folders 12.
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'AttachPicker') return fallback
    if (index === 2) return 'favorite'
    if (index === 6) return 'ready'
    if (index === 12) return [{ id: 'uncategorized', name: 'unfiled', count: 1 }]
    return fallback
  })

  const props = { t: (key) => key, sessionId: 'session-test', inputActions: { addAttachments() {} }, attach: async () => {} }
  const button = registered.find((entry) => entry.name === 'conversation.input.left')
  const overlay = registered.find((entry) => entry.name === 'conversation.input.overlay')
  assert.ok(button !== undefined && overlay !== undefined, 'composer entries are not registered')

  const buttonTree = React.render(button.component, props)
  assert.equal(React.clickFirst(buttonTree), true, 'the attach button has no click handler')

  const tree = React.render(overlay.component, props)
  assert.equal(React.findByClass(tree, 'dshlib-picker-folders').length, 1, 'the picker did not render its folder grid')
})

// LibraryPage hook order: view 0, category 1, source 2, sort 3, direction 4,
// query 5, debounced 6, items 7, total 8, nextOffset 9, phase 10, error 11,
// state 12, uploads 13, confirming 14, menuFor 15, toast 16, previewItem 17,
// collectionFilter 18 ... assetOrigin 23, selected 24, previewWidth 25.

const oneRecord = {
  id: 'lic_ab12',
  name: 'photo.png',
  ext: 'png',
  kind: 'image',
  mime: 'image/png',
  bytes: 2048,
  sha256: 'aa',
  blob: 'aa/aa.bin',
  source: 'upload-library',
  origin: null,
  createdAt: '2026-11-02T10:00:00Z',
  sourceMtime: null,
  displayDate: '2026-11-02T10:00:00Z',
  favorited: false,
  collectionId: null,
  thumb: { status: 'none' },
  broken: false,
  refs: 1,
  address: 'dsh-resource://library/file/lic_ab12/photo.png',
}

const readyState = { files: 1, bytes: 2048, broken: 0, blobs: 1, collections: [], unfiled: 0, failures: [], maxUploadBytes: 1 }

/** Render only LibraryPage, with a ready list of one image record. */
async function renderReadyPage(overrides) {
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'LibraryPage') return fallback
    if (index === 7) return [oneRecord]
    if (index === 8) return 1
    if (index === 10) return 'ready'
    if (index === 12) return readyState
    if (index === 23) return 'http://127.0.0.1:50257'
    return overrides(index, fallback)
  })
  const page = registered.find((entry) => entry.name === 'main')
  assert.ok(page !== undefined, 'the main panel is not registered')
  return { tree: React.render(page.component, entryProps), React }
}

test('the ready grid renders image thumbnails', async () => {
  const { tree, React } = await renderReadyPage((index, fallback) => fallback)
  const images = React.collect(tree, (node) => node.type === 'img' && node.props?.className === 'dshlib-thumb-img')
  assert.equal(images.length, 1, 'no thumbnail img in the grid')
  assert.ok(String(images[0].props.src).includes('/library/blob/lic_ab12'), 'thumbnail src is wrong')
})

test('the ready list view renders its rows', async () => {
  const { tree, React } = await renderReadyPage((index, fallback) => (index === 0 ? 'list' : fallback))
  const rows = React.collect(tree, (node) => node.type === 'tr')
  assert.ok(rows.length >= 2, `list view rendered ${rows.length} rows`)
})

test('searching inside favorites lists matching files, not folders', async () => {
  // Same ready page, but the favorites category with a live search term.
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'LibraryPage') return fallback
    if (index === 1) return 'favorite'
    if (index === 6) return 'photo'
    if (index === 7) return [oneRecord]
    if (index === 8) return 1
    if (index === 10) return 'ready'
    if (index === 12) return readyState
    if (index === 23) return 'http://127.0.0.1:50257'
    return fallback
  })
  const page = registered.find((entry) => entry.name === 'main')
  const tree = React.render(page.component, entryProps)

  assert.equal(React.findByClass(tree, 'dshlib-folders').length, 0, 'the folder grid must not render while searching')
  assert.equal(React.findByClass(tree, 'dshlib-grid').length, 1, 'search results did not render as files')
  assert.equal(React.findByClass(tree, 'dshlib-thumb-img').length, 1, 'search results lost their thumbnail')
})

test('inside a favorites folder the strip names the folder', async () => {
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'LibraryPage') return fallback
    if (index === 1) return 'favorite'
    if (index === 7) return [oneRecord]
    if (index === 8) return 1
    if (index === 10) return 'ready'
    if (index === 12) return readyState
    if (index === 18) return 'uncategorized'
    if (index === 23) return 'http://127.0.0.1:50257'
    return fallback
  })
  const page = registered.find((entry) => entry.name === 'main')
  const tree = React.render(page.component, entryProps)
  const labels = React.findByClass(tree, 'dshlib-collections-current')
  assert.equal(labels.length, 1, 'the strip does not show the current folder')
  assert.equal(React.findByClass(tree, 'dshlib-grid').length, 1, 'the folder contents did not render')
})

test('the picker renders inside a favorites folder', async () => {
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'AttachPicker') return fallback
    if (index === 2) return 'favorite'
    if (index === 6) return 'ready'
    if (index === 11) return 'uncategorized'
    if (index === 12) return [{ id: 'uncategorized', name: 'unfiled', count: 1 }]
    return fallback
  })
  const props = { t: (key) => key, sessionId: 'session-test', inputActions: { addAttachments() {} }, attach: async () => {} }
  const button = registered.find((entry) => entry.name === 'conversation.input.left')
  const overlay = registered.find((entry) => entry.name === 'conversation.input.overlay')
  React.clickFirst(React.render(button.component, props))
  const tree = React.render(overlay.component, props)
  assert.equal(React.findByClass(tree, 'dshlib-picker-back').length, 1, 'the picker has no back row inside a folder')
})

test('a selection renders the batch bar', async () => {
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'LibraryPage') return fallback
    if (index === 7) return [oneRecord]
    if (index === 8) return 1
    if (index === 10) return 'ready'
    if (index === 12) return readyState
    if (index === 23) return 'http://127.0.0.1:50257'
    if (index === 24) return new Map([[oneRecord.id, oneRecord]])
    return fallback
  })
  const page = registered.find((entry) => entry.name === 'main')
  const tree = React.render(page.component, entryProps)
  assert.equal(React.findByClass(tree, 'dshlib-batch').length, 1, 'the batch bar is missing')
  assert.equal(React.findByClass(tree, 'dshlib-card-check').length, 1, 'cards have no selection checkbox')
})

test('the preview drawer renders with a resize handle', async () => {
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name !== 'LibraryPage') return fallback
    if (index === 7) return [oneRecord]
    if (index === 8) return 1
    if (index === 10) return 'ready'
    if (index === 12) return readyState
    if (index === 17) return oneRecord
    if (index === 23) return 'http://127.0.0.1:50257'
    return fallback
  })
  const page = registered.find((entry) => entry.name === 'main')
  const tree = React.render(page.component, entryProps)
  const handles = React.findByClass(tree, 'dshlib-drawer-handle')
  assert.equal(handles.length, 1, 'the drawer has no resize handle')
  assert.equal(handles[0].props.role, 'separator')
  assert.equal(handles[0].props['aria-orientation'], 'vertical')
})

test('an open image lightbox renders its controls', async () => {
  // PreviewContent hook order: state 0, zoom 1, wrap 2, source 3, frameState 4,
  // lightbox 5, then effect 6, confirming 7, toast 8.
  const payload = {
    ok: true,
    item: oneRecord,
    address: oneRecord.address,
    root: 'C:\\lib',
    renderer: 'image',
    language: '',
    officeAvailable: false,
    media: { blob: `/library/blob/${oneRecord.id}`, download: `/library/download/${oneRecord.id}` },
  }
  const { registered, React } = await loadBundle((name, index, fallback) => {
    if (name === 'PreviewContent') {
      if (index === 0) return { phase: 'ready', payload, origin: 'http://127.0.0.1:50257' }
      if (index === 5) return true
    }
    if (name !== 'LibraryPage') return fallback
    if (index === 7) return [oneRecord]
    if (index === 8) return 1
    if (index === 10) return 'ready'
    if (index === 12) return readyState
    if (index === 17) return oneRecord
    if (index === 23) return 'http://127.0.0.1:50257'
    return fallback
  })
  const page = registered.find((entry) => entry.name === 'main')
  const tree = React.render(page.component, entryProps)
  assert.equal(React.findByClass(tree, 'dshlib-lightbox').length, 1, 'the lightbox did not render')
  assert.equal(React.findByClass(tree, 'dshlib-lightbox-bar').length, 1, 'the lightbox has no controls')
  const images = React.collect(tree, (node) => node.type === 'img' && node.props?.className === 'dshlib-lightbox-image')
  assert.equal(images.length, 1, 'the lightbox has no image')
})
