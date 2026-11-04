/**
 * Library — Client half.
 *
 * One main panel (`library`) plus its global sidebar entry. The panel talks to
 * the Host half over the loopback route prefix `/library`: the page runs on the
 * Electron custom scheme, so the Host origin is resolved once and every call
 * carries it.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-library',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'library'
    const PANEL = 'dsh-library'
    const PAGE_SIZE = 100
    const MAX_PARALLEL = 3
    const PREVIEW_TYPE = 'library-preview'
    const PREVIEW_KIND = 'library'
    const PREVIEW_PATTERN = 'dsh-resource://library/**'

    /** Cross-panel invalidation: an action in the preview updates the page behind it. */
    const libraryChanged = (() => {
      const listeners = new Set()
      return {
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        emit() {
          for (const listener of Array.from(listeners)) {
            try {
              listener()
            } catch {
              // A listener must never break the emitter.
            }
          }
        },
      }
    })()

    /** Split a preview address into its record id and display name. */
    function parseLibraryAddress(address) {
      const prefix = 'dsh-resource://library/file/'
      const text = String(address ?? '')
      if (!text.startsWith(prefix)) return null
      const rest = text.slice(prefix.length)
      const slash = rest.indexOf('/')
      try {
        return {
          id: decodeURIComponent(slash === -1 ? rest : rest.slice(0, slash)),
          name: slash === -1 ? '' : decodeURIComponent(rest.slice(slash + 1)),
        }
      } catch {
        return null
      }
    }

    /** Whether this Chromium build advertises its internal PDF viewer. */
    function pdfViewerLikely() {
      try {
        const plugins = navigator.plugins
        if (plugins === undefined || plugins === null) return false
        for (let index = 0; index < plugins.length; index += 1) {
          const name = plugins[index] === undefined ? '' : String(plugins[index].name ?? '')
          if (/pdf/i.test(name)) return true
        }
      } catch {
        // An unavailable plugins list means no advertised viewer.
      }
      return false
    }
    const MESSAGES = {
      zh: {
        panel: '资料库',
        title: '资料库',
        subtitle: '归档与复用文件',
        search: '搜索文件',
        clearSearch: '清除搜索',
        upload: '上传文件',
        viewGrid: '网格视图',
        viewList: '列表视图',
        sort: '排序',
        sortName: '名称',
        sortSize: '大小',
        sortDate: '修改日期',
        sortAsc: '正序',
        sortDesc: '反序',
        categoryAll: '全部',
        categoryDocument: '文件',
        categoryImage: '图片',
        categoryVideo: '视频',
        categoryAudio: '音频',
        categoryFavorite: '收藏',
        sourceLabel: '来源',
        sourceAll: '全部来源',
        sourceUser: '用户上传',
        sourceAgent: 'Agent 交付',
        emptyTitle: '上传文件，或让 Agent 交付文件',
        emptyAction: '上传第一个文件',
        searchEmpty: '没有找到匹配的文件',
        filterEmpty: '该分类下暂无文件',
        filterReset: '切回全部',
        loading: '正在加载…',
        loadMore: '加载更多',
        count: '共 {count} 个文件',
        size: '{size}',
        columnName: '文件名称',
        columnSize: '文件大小',
        columnDate: '修改日期',
        columnSource: '来源',
        columnActions: '操作',
        more: '更多操作',
        download: '下载',
        delete: '删除',
        deleteTitle: '删除文件',
        deleteBody: '将删除 {count} 个文件，释放 {size}。',
        deleteNote: '聊天中已发送的该文件副本不受影响。',
        cancel: '取消',
        confirmDelete: '删除',
        uploading: '正在上传 {name}',
        uploadingShort: '正在上传',
        uploadFailed: '上传失败：{reason}',
        uploadCancel: '取消上传',
        uploadQueued: '排队中',
        retry: '重试',
        actionFailed: '操作失败：{reason}',
        indexBroken: '资料库索引需要重建',
        rebuild: '重建索引',
        broken: '文件缺失',
        sourceUserShort: '用户上传',
        sourceAgentShort: 'Agent 交付',
        favorited: '已收藏',
        unbroken: '正常',
        preview: '预览',
        previewLoading: '正在加载预览…',
        previewFailed: '预览加载失败',
        retry: '重试',
        favorite: '收藏',
        unfavorite: '取消收藏',
        openInSystem: '在系统中打开',
        deleteRecord: '删除记录',
        fitWidth: '适应宽度',
        actualSize: '实际大小',
        wrapOn: '换行',
        rendered: '渲染',
        sourceView: '原文',
        missingTitle: '文件不在资料库中',
        missingBody: '记录还在，但库内字节已丢失。',
        tooLargeTitle: '文件过大，无法在应用内预览',
        tooLargeBody: '请下载到本地后再打开。',
        noEngineTitle: '当前环境不支持预览该文档',
        noEngineBody: '未安装文档转换组件；可下载后用本地应用打开。',
        unsupportedTitle: '该格式不支持应用内预览',
        unsupportedBody: '可以下载，或用系统中的应用打开。',
        pdfHint: '此处空白时，请下载或在系统中打开',
        corruptedTitle: '文件已损坏，无法预览',
        previewDeleted: '已从资料库删除',
        favoritedToast: '已收藏',
        unfavoritedToast: '已取消收藏',
        openFailed: '无法在系统中打开',
        sizeLabel: '大小',
        addedLabel: '添加',
        attachButton: '从资料库添加',
        pickerTitle: '从资料库添加文件',
        pickerSearch: '搜索文件',
        pickerEmpty: '资料库还没有文件',
        pickerEmptyHint: '先在「资料库」上传，或让 Agent 交付文件',
        pickerNoMatch: '没有匹配的文件',
        pickerSelected: '已选 {count}/20',
        pickerLimit: '单次最多 20 个文件',
        pickerAdd: '加入草稿',
        pickerAdding: '正在添加…',
        pickerFailed: '添加失败：{reason}',
        viewSource: '查看来源',
        originLabel: '来源',
        turnLabel: '第 {turn} 轮',
        originGone: '原始文件已不在原位置',
        sourceSessionGone: '原会话已删除。文件仍保留在资料库中。',
        sourceWorkspaceGone: '原工作区已删除。文件仍保留在资料库中。',
        sourceWorkspaceMoved: '原工作区位置已变化，无法定位到原消息。文件仍保留在资料库中。',
        failureBanner: '{count} 个交付文件未能入库',
        failureRetry: '重试',
        failureRetried: '已重试 {ok} 个，{failed} 个仍失败',
        favoritesUnfiled: '未分类',
        newCollection: '新建收藏夹',
        newFolder: '新建文件夹',
        folderCount: '{count} 个文件',
        favoriteTo: '收藏到',
        favoriteRemove: '取消收藏',
        favoriteMoved: '已收藏到「{name}」',
        favoriteUnfiledName: '未分类',
        back: '返回',
        batchBar: '批量操作',
        batchSelected: '已选 {count} 项',
        batchSelectAll: '全选当前',
        batchDownload: '下载',
        batchSend: '发送到当前聊天',
        batchClear: '取消选择',
        batchClearAll: '取消全选',
        resizePreview: '拖动或用左右方向键调整预览宽度',
        htmlBlockedHint: '这个页面没有渲染出来，可以切到源码，或下载后在浏览器中打开。',
        zoomIn: '放大',
        zoomOut: '缩小',
        rotate: '旋转',
        resetZoom: '适应窗口',
        closeViewer: '关闭放大预览',
        viewLarge: '点击放大查看',
        selectFile: '选择 {name}',
        sendNoChat: '还没有可发送的聊天，先打开一个会话',
        sendQueued: '已把 {count} 个文件发到当前聊天',
        settingsLabel: '资料库',
        settingsTitle: '资料库存储',
        settingsRoot: '存储位置',
        settingsMigrate: '迁移到',
        settingsMigrateAction: '迁移',
        settingsMigrateDone: '已迁移到 {root}',
        settingsMigrateHint: '填写一个绝对路径；迁移会把库内文件搬过去并删除旧目录下的库数据。',
        settingsRebuild: '重建索引',
        settingsRebuildHint: '用磁盘上的文件重建索引（index.json）。索引损坏、或库目录被手动改动后使用；仅凭文件内容重建的记录会失去原始文件名与收藏信息。',
        settingsTotals: '{files} 个文件 · {size}',
        settingsWorking: '处理中…',
        collectionName: '收藏夹名称',
        collectionCreate: '新建',
        collectionRename: '重命名',
        collectionDelete: '删除收藏夹',
        collectionDeleteBody: '收藏夹内的 {count} 个文件将回到「未分类」，文件不会被删除。',
        collectionMenu: '收藏夹操作',
        moveToCollection: '移到收藏夹…',
        moveToFolder: '移到文件夹…',
        removeFromCollection: '移出收藏夹',
        move: '移动',
        collectionEmpty: '这个收藏夹还是空的',
        collectionEmptyHint: '在文件「…」菜单里用「移到收藏夹…」把文件移到这里',
        collectionEmptyAction: '返回收藏夹',
        unfiledEmpty: '未分类里还没有收藏的文件',
        unfiledEmptyHint: '在文件「…」菜单里点「收藏」，或把文件移到收藏夹',
        collectionErrorEmpty: '名称不能为空',
        collectionErrorLong: '名称最多 40 个字',
        collectionErrorSlash: '名称不能包含「/」',
        collectionErrorDuplicate: '已有同名收藏夹',
        collectionCreated: '已新建收藏夹「{name}」',
        collectionRenamed: '已重命名为「{name}」',
        collectionDeleted: '已删除收藏夹，文件回到「未分类」',      },
      en: {
        panel: 'Library',
        title: 'Library',
        subtitle: 'Archive and reuse files',
        search: 'Search files',
        clearSearch: 'Clear search',
        upload: 'Upload',
        viewGrid: 'Grid view',
        viewList: 'List view',
        sort: 'Sort',
        sortName: 'Name',
        sortSize: 'Size',
        sortDate: 'Modified',
        sortAsc: 'Ascending',
        sortDesc: 'Descending',
        categoryAll: 'All',
        categoryDocument: 'Files',
        categoryImage: 'Images',
        categoryVideo: 'Video',
        categoryAudio: 'Audio',
        categoryFavorite: 'Favorites',
        sourceLabel: 'Source',
        sourceAll: 'All sources',
        sourceUser: 'Uploaded by you',
        sourceAgent: 'Delivered by an agent',
        emptyTitle: 'Upload a file, or let an agent deliver one',
        emptyAction: 'Upload the first file',
        searchEmpty: 'No files match your search',
        filterEmpty: 'No files in this category',
        filterReset: 'Back to all',
        loading: 'Loading…',
        loadMore: 'Load more',
        count: '{count} files',
        size: '{size}',
        columnName: 'Name',
        columnSize: 'Size',
        columnDate: 'Modified',
        columnSource: 'Source',
        columnActions: 'Actions',
        more: 'More actions',
        download: 'Download',
        delete: 'Delete',
        deleteTitle: 'Delete files',
        deleteBody: 'This deletes {count} file(s) and frees {size}.',
        deleteNote: 'Copies already sent in a chat are not affected.',
        cancel: 'Cancel',
        confirmDelete: 'Delete',
        uploading: 'Uploading {name}',
        uploadingShort: 'Uploading',
        uploadFailed: 'Upload failed: {reason}',
        uploadCancel: 'Cancel upload',
        uploadQueued: 'Queued',
        retry: 'Retry',
        actionFailed: 'Action failed: {reason}',
        indexBroken: 'The library index needs to be rebuilt',
        rebuild: 'Rebuild index',
        broken: 'Bytes missing',
        sourceUserShort: 'You',
        sourceAgentShort: 'Agent',
        favorited: 'Favorited',
        unbroken: 'OK',
        preview: 'Preview',
        previewLoading: 'Loading preview…',
        previewFailed: 'The preview could not be loaded',
        retry: 'Retry',
        favorite: 'Favorite',
        unfavorite: 'Remove from favorites',
        openInSystem: 'Open in system app',
        deleteRecord: 'Delete record',
        fitWidth: 'Fit width',
        actualSize: 'Actual size',
        wrapOn: 'Wrap',
        rendered: 'Rendered',
        sourceView: 'Source',
        missingTitle: 'This file is not in the library',
        missingBody: 'The record is here, but its stored bytes are gone.',
        tooLargeTitle: 'This file is too large to preview here',
        tooLargeBody: 'Download it and open it locally.',
        noEngineTitle: 'This environment cannot preview the document',
        noEngineBody: 'No document conversion engine is installed; download it to open locally.',
        unsupportedTitle: 'This format has no in-app preview',
        unsupportedBody: 'Download it, or open it with a system application.',
        pdfHint: 'Blank here? Download it, or open it in a system app.',
        corruptedTitle: 'The file is damaged and cannot be previewed',
        previewDeleted: 'Removed from the library',
        favoritedToast: 'Added to favorites',
        unfavoritedToast: 'Removed from favorites',
        openFailed: 'Could not open it in a system application',
        sizeLabel: 'Size',
        addedLabel: 'Added',
        attachButton: 'Add from library',
        pickerTitle: 'Add files from the library',
        pickerSearch: 'Search files',
        pickerEmpty: 'The library is empty',
        pickerEmptyHint: 'Upload in the Library panel first, or let an agent deliver files',
        pickerNoMatch: 'No files match',
        pickerSelected: '{count}/20 selected',
        pickerLimit: 'Up to 20 files at a time',
        pickerAdd: 'Add to message',
        pickerAdding: 'Adding…',
        pickerFailed: 'Could not add: {reason}',
        viewSource: 'View source',
        originLabel: 'Source',
        turnLabel: 'turn {turn}',
        originGone: 'The original file is no longer at its old location',
        sourceSessionGone: 'The original session was deleted. The file stays in the library.',
        sourceWorkspaceGone: 'The original workspace was deleted. The file stays in the library.',
        sourceWorkspaceMoved: 'The original workspace moved, so the message cannot be located. The file stays in the library.',
        failureBanner: '{count} delivered files could not be stored',
        failureRetry: 'Retry',
        failureRetried: 'Retried {ok}, still failing {failed}',
        favoritesUnfiled: 'Unfiled',
        newCollection: 'New collection',
        newFolder: 'New folder',
        folderCount: '{count} files',
        favoriteTo: 'Favorite to',
        favoriteRemove: 'Remove from favorites',
        favoriteMoved: 'Filed under “{name}”',
        favoriteUnfiledName: 'Unfiled',
        back: 'Back',
        batchBar: 'Batch actions',
        batchSelected: '{count} selected',
        batchSelectAll: 'Select all shown',
        batchDownload: 'Download',
        batchSend: 'Send to current chat',
        batchClear: 'Clear selection',
        batchClearAll: 'Clear all',
        resizePreview: 'Drag or use the arrow keys to resize the preview',
        htmlBlockedHint: 'This page did not render. Switch to the source, or download it and open it in a browser.',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        rotate: 'Rotate',
        resetZoom: 'Fit to window',
        closeViewer: 'Close the enlarged view',
        viewLarge: 'Click to enlarge',
        selectFile: 'Select {name}',
        sendNoChat: 'No chat is available yet; open one first',
        sendQueued: 'Sent {count} file(s) to the current chat',
        settingsLabel: 'Library',
        settingsTitle: 'Library storage',
        settingsRoot: 'Location',
        settingsMigrate: 'Move to',
        settingsMigrateAction: 'Move',
        settingsMigrateDone: 'Moved to {root}',
        settingsMigrateHint: 'Use an absolute path; moving transfers the archive and removes the old library data.',
        settingsRebuild: 'Rebuild index',
        settingsRebuildHint: 'Rebuilds index.json from the files on disk. Use it when the index is damaged or the archive was edited outside the app; records rebuilt from bytes alone lose their original names and favorites.',
        settingsTotals: '{files} files · {size}',
        settingsWorking: 'Working…',
        collectionName: 'Collection name',
        collectionCreate: 'Create',
        collectionRename: 'Rename',
        collectionDelete: 'Delete collection',
        collectionDeleteBody: '{count} file(s) in this collection return to Unfiled; no file is deleted.',
        collectionMenu: 'Collection actions',
        moveToCollection: 'Move to collection…',
        moveToFolder: 'Move to folder…',
        removeFromCollection: 'Remove from collection',
        move: 'Move',
        collectionEmpty: 'This collection is empty',
        collectionEmptyHint: 'Use “Move to collection…” in a file’s ⋯ menu to put files here',
        collectionEmptyAction: 'Back to folders',
        unfiledEmpty: 'No favorites outside a collection yet',
        unfiledEmptyHint: 'Use Favorite in a file menu, or move files into a collection',
        collectionErrorEmpty: 'A name is required',
        collectionErrorLong: 'Names are at most 40 characters',
        collectionErrorSlash: 'Names cannot contain “/”',
        collectionErrorDuplicate: 'A collection with that name already exists',
        collectionCreated: 'Created “{name}”',
        collectionRenamed: 'Renamed to “{name}”',
        collectionDeleted: 'Collection deleted; its files are now Unfiled',      },
    }

    function translate(locale, key, params) {
      const table = MESSAGES[locale] ?? MESSAGES.zh
      const template = table[key] ?? MESSAGES.zh[key] ?? key
      if (params === undefined) return template
      return template.replace(/\{(\w+)\}/g, (match, name) => (params[name] === undefined ? match : String(params[name])))
    }

    function formatSize(bytes) {
      const value = Number(bytes) || 0
      if (value < 1024) return `${value} B`
      const units = ['KB', 'MB', 'GB', 'TB']
      let size = value / 1024
      let unit = 0
      while (size >= 1024 && unit < units.length - 1) {
        size /= 1024
        unit += 1
      }
      return `${size >= 10 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`
    }

    function formatDate(value) {
      const time = Date.parse(value ?? '')
      if (!Number.isFinite(time)) return '—'
      const date = new Date(time)
      const pad = (input) => String(input).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    // --- Host bridge ---------------------------------------------------------

    let hostOrigin = null
    let hostProbe = null

    function candidateOrigins() {
      const list = []
      try {
        if (/^https?:$/.test(location.protocol)) list.push(location.origin)
      } catch {
        // No location: fall through to the fixed candidates.
      }
      try {
        const boot = typeof window === 'undefined' ? undefined : window.__DSH_BOOT__
        const text = boot === undefined ? '' : JSON.stringify(boot)
        for (const match of text.match(/https?:\/\/127\.0\.0\.1:\d+/g) ?? []) list.push(match)
        for (const match of text.match(/https?:\/\/localhost:\d+/g) ?? []) list.push(match)
      } catch {
        // A malformed boot payload is not fatal.
      }
      list.push('http://127.0.0.1:50257', 'http://localhost:50257')
      return Array.from(new Set(list))
    }

    async function resolveHost() {
      if (hostOrigin !== null) return hostOrigin
      hostProbe ??= (async () => {
        for (const origin of candidateOrigins()) {
          try {
            const response = await fetch(`${origin}/library/health`, { cache: 'no-store', mode: 'cors' })
            if (!response.ok) continue
            const body = await response.json()
            if (body?.ok === true) {
              hostOrigin = origin
              return origin
            }
          } catch {
            // Try the next candidate.
          }
        }
        throw new Error('library host unreachable')
      })()
      return hostProbe
    }

    async function api(path, options = {}) {
      const origin = await resolveHost()
      const init = { ...options, cache: 'no-store', mode: 'cors' }
      if (init.body !== undefined && !(init.body instanceof Blob) && typeof init.body !== 'string') {
        init.body = JSON.stringify(init.body)
      }
      if (init.body !== undefined && init.headers === undefined) {
        init.headers = { 'content-type': 'application/json' }
      }
      const response = await fetch(`${origin}${path}`, init)
      const text = await response.text()
      const payload = text === '' ? {} : JSON.parse(text)
      if (!response.ok || payload.ok === false) {
        const failure = new Error(payload?.error?.message ?? `HTTP ${response.status}`)
        failure.code = payload?.error?.code ?? `http-${response.status}`
        throw failure
      }
      return payload
    }

    // --- shared presentation ------------------------------------------------

    const ICONS = {
      document: 'M7 3.5h6.2L18 8.3v10.2a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5.5a2 2 0 0 1 2-2Z M13 3.8V9h5',
      image: 'M4.5 6.5h15v11h-15z M8 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z M5 17l5-5 3 3 2.5-2.5L20 17',
      video: 'M4.5 7.5h11v9h-11z M15.5 10.5l4-2.5v8l-4-2.5z',
      audio: 'M9 17V7l8-2v10 M9 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z M17 15a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z',
      other: 'M5 5.5h14v13H5z M8.5 9.5h7 M8.5 13h7',
    }

    function FileGlyph({ kind, size = 20 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { flex: 'none' },
        },
        h('path', { d: ICONS[kind] ?? ICONS.other }),
      )
    }

    /** Per-family badge colours and labels so each file type reads differently. */
    const BADGE_FAMILIES = [
      ['#c0392b', ['pdf']],
      ['#2b579a', ['doc', 'docx', 'odt', 'rtf']],
      ['#217346', ['xls', 'xlsx', 'csv', 'tsv', 'ods']],
      ['#d24726', ['ppt', 'pptx', 'odp']],
      ['#475569', ['md', 'markdown', 'mdx']],
      ['#64748b', ['txt', 'text', 'log', 'nfo', 'readme']],
      [
        '#7c3aed',
        [
          'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini',
          'conf', 'xml', 'html', 'htm', 'css', 'scss', 'less', 'sh', 'ps1', 'bat', 'cmd', 'py',
          'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sql', 'lua',
          'swift', 'dart', 'vue',
        ],
      ],
      ['#0ea5e9', ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'ico', 'avif', 'heic', 'tif', 'tiff']],
      ['#f59e0b', ['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v']],
      ['#ec4899', ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']],
      ['#92400e', ['zip', 'rar', '7z', 'gz', 'tar', 'bz2', 'xz']],
    ]
    const BADGE_COLOR = new Map()
    for (const [color, extensions] of BADGE_FAMILIES) {
      for (const extension of extensions) BADGE_COLOR.set(extension, color)
    }
    const BADGE_LABEL = {
      markdown: 'MD',
      mdx: 'MDX',
      json: '{ }',
      jsonl: '{ }',
      yaml: 'YML',
      yml: 'YML',
      jpeg: 'JPG',
      tiff: 'TIF',
      text: 'TXT',
      readme: 'TXT',
      nfo: 'TXT',
      image: 'IMG',
      video: 'VID',
      audio: 'AUD',
      document: 'DOC',
    }

    /** Label and colour for one record, from its stored extension. */
    function badgeOf(item) {
      const extension = String(item?.ext ?? '').toLowerCase()
      if (extension === '') {
        const kind = String(item?.kind ?? '')
        const label = BADGE_LABEL[kind] ?? 'FILE'
        return { label, color: kind === 'image' ? '#0ea5e9' : kind === 'video' ? '#f59e0b' : kind === 'audio' ? '#ec4899' : '#64748b' }
      }
      const mapped = BADGE_LABEL[extension]
      const label = mapped ?? (extension.length > 4 ? extension.slice(0, 3).toUpperCase() : extension.toUpperCase())
      return { label, color: BADGE_COLOR.get(extension) ?? '#64748b' }
    }

    /** One file-type badge: a rounded chip carrying the type's short label. */
    function FileBadge({ item, size = 20 }) {
      const { label, color } = badgeOf(item)
      return h(
        'svg',
        { viewBox: '0 0 32 32', width: size, height: size, 'aria-hidden': true, style: { flex: 'none' } },
        h('rect', { x: 2, y: 2, width: 28, height: 28, rx: 7, fill: color }),
        h(
          'text',
          {
            x: 16,
            y: 21,
            textAnchor: 'middle',
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, sans-serif',
            fontWeight: 700,
            fontSize: label.length >= 3 ? 9.5 : 11.5,
            fill: '#ffffff',
          },
          label,
        ),
      )
    }

    /**
     * Put a strict policy into a srcdoc document: inline styles and scripts only,
     * no network. A srcdoc frame cannot carry response headers, so the meta tag
     * is the only way to lock it down.
     */
    function withSandboxPolicy(html) {
      const meta =
        '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src data: blob:; media-src data: blob:; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; font-src data:">'
      if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (match) => match + meta)
      if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (match) => `${match}<head>${meta}</head>`)
      return `<!doctype html><html><head>${meta}</head><body>${html}</body></html>`
    }

    /** Real thumbnail for image records, falling back to the type badge. */
    function ThumbImage({ item, origin }) {
      const [failed, setFailed] = React.useState(false)
      if (failed || origin === null || origin === undefined) return h(FileBadge, { item, size: 34 })
      return h('img', {
        className: 'dshlib-thumb-img',
        src: `${origin}/library/blob/${encodeURIComponent(item.id)}`,
        alt: '',
        loading: 'lazy',
        decoding: 'async',
        onError: () => setFailed(true),
      })
    }

    /**
     * Full-window image viewer. Zoom is anchored at the image centre, panning
     * keeps the picture inside the stage, and rotation cycles by 90°.
     */
    function ImageLightbox({ tt, item, src, onClose, onDownload, onDelete }) {
      const MIN_SCALE = 0.1
      const MAX_SCALE = 8
      const [scale, setScale] = React.useState(1)
      const [rotation, setRotation] = React.useState(0)
      const [offset, setOffset] = React.useState({ x: 0, y: 0 })
      const [dragging, setDragging] = React.useState(false)
      const rootRef = React.useRef(null)
      const stageRef = React.useRef(null)
      const imageRef = React.useRef(null)
      const fittedRef = React.useRef(false)
      const movedRef = React.useRef(0)
      const dragRef = React.useRef(null)

      const stageSize = () => {
        const stage = stageRef.current
        const bounds = stage === null ? null : stage.getBoundingClientRect()
        return { width: bounds === null ? 800 : bounds.width, height: bounds === null ? 600 : bounds.height }
      }

      const renderedSize = (value) => {
        const image = imageRef.current
        const stage = stageSize()
        if (image === null || image.naturalWidth === 0) return { width: stage.width, height: stage.height }
        const width = image.naturalWidth * value
        const height = image.naturalHeight * value
        return rotation % 180 === 0 ? { width, height } : { width: height, height: width }
      }

      const clampOffset = (next, value) => {
        const stage = stageSize()
        const size = renderedSize(value)
        const maxX = Math.max(0, (size.width - stage.width) / 2)
        const maxY = Math.max(0, (size.height - stage.height) / 2)
        return {
          x: Math.min(maxX, Math.max(-maxX, next.x)),
          y: Math.min(maxY, Math.max(-maxY, next.y)),
        }
      }

      const applyScale = (next) => {
        const value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, next))
        setScale(value)
        setOffset((current) => clampOffset(current, value))
      }

      const fit = React.useCallback(() => {
        const image = imageRef.current
        if (image === null || image.naturalWidth === 0) return
        const stage = stageSize()
        const value = Math.min(1, stage.width / image.naturalWidth, stage.height / image.naturalHeight)
        fittedRef.current = true
        setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, value)))
        setOffset({ x: 0, y: 0 })
        setRotation(0)
      }, [])

      React.useEffect(() => {
        if (rootRef.current !== null && typeof rootRef.current.focus === 'function') rootRef.current.focus()
      }, [])

      React.useEffect(() => {
        const stage = stageRef.current
        if (stage === null) return undefined
        const onWheel = (event) => {
          event.preventDefault()
          const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
          setScale((current) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, current * factor)))
        }
        stage.addEventListener('wheel', onWheel, { passive: false })
        return () => stage.removeEventListener('wheel', onWheel)
      }, [])

      // Zoom and rotation change the rendered box, so re-clamp the offset.
      React.useEffect(() => {
        setOffset((current) => clampOffset(current, scale))
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [scale, rotation])

      const startPan = (event) => {
        if (event.button !== undefined && event.button !== 0) return
        // Every press starts a fresh gesture: a click that does not move is what
        // closes the viewer, so the distance must not survive from the last drag.
        movedRef.current = 0
        if (event.target === event.currentTarget) return
        event.preventDefault()
        const stage = event.currentTarget
        const pointerId = event.pointerId
        if (typeof stage.setPointerCapture === 'function' && pointerId !== undefined) {
          try {
            stage.setPointerCapture(pointerId)
          } catch {
            // Capture is best effort.
          }
        }
        dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y, active: true }
        setDragging(true)
      }

      const panMove = (event) => {
        const drag = dragRef.current
        if (drag === null || drag.active !== true) return
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        movedRef.current = Math.max(movedRef.current, Math.abs(dx), Math.abs(dy))
        setOffset(clampOffset({ x: drag.ox + dx, y: drag.oy + dy }, scale))
      }

      const endPan = (event) => {
        const stage = event.currentTarget
        const pointerId = event.pointerId
        if (typeof stage.releasePointerCapture === 'function' && pointerId !== undefined) {
          try {
            stage.releasePointerCapture(pointerId)
          } catch {
            // Already released.
          }
        }
        if (dragRef.current !== null) dragRef.current = { ...dragRef.current, active: false }
        setDragging(false)
      }

      const rotate = () => setRotation((current) => (current + 90) % 360)

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          applyScale(scale * 1.25)
          return
        }
        if (event.key === '-') {
          event.preventDefault()
          applyScale(scale / 1.25)
          return
        }
        if (event.key === '0') {
          event.preventDefault()
          fit()
          return
        }
        if (event.key === 'r' || event.key === 'R') {
          event.preventDefault()
          rotate()
          return
        }
        const step = 24
        const moves = {
          ArrowLeft: { x: step, y: 0 },
          ArrowRight: { x: -step, y: 0 },
          ArrowUp: { x: 0, y: step },
          ArrowDown: { x: 0, y: -step },
        }
        const move = moves[event.key]
        if (move !== undefined) {
          event.preventDefault()
          setOffset((current) => clampOffset({ x: current.x + move.x, y: current.y + move.y }, scale))
        }
      }

      return h(
        'div',
        {
          ref: rootRef,
          className: 'dshlib-lightbox',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': item.name,
          tabIndex: -1,
          onKeyDown,
        },
        h(
          'div',
          {
            ref: stageRef,
            className: 'dshlib-lightbox-stage',
            style: { cursor: dragging ? 'grabbing' : 'grab' },
            onPointerDown: startPan,
            onPointerMove: panMove,
            onPointerUp: endPan,
            onPointerCancel: endPan,
            onDoubleClick: () => (Math.abs(scale - 1) < 0.01 ? fit() : applyScale(1)),
            onClick: (event) => {
              if (event.target === event.currentTarget && movedRef.current < 4) onClose()
            },
          },
          h('img', {
            ref: imageRef,
            className: 'dshlib-lightbox-image',
            src,
            alt: item.name,
            draggable: false,
            style: { transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale}) rotate(${rotation}deg)` },
            onLoad: () => {
              if (!fittedRef.current) fit()
            },
          }),
        ),
        h(
          'div',
          { className: 'dshlib-lightbox-bar', role: 'toolbar', 'aria-label': tt('rotate') },
          h(
            'button',
            { type: 'button', className: 'dshlib-btn', onClick: () => applyScale(scale / 1.25), 'aria-label': tt('zoomOut'), title: tt('zoomOut') },
            '−',
          ),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn', onClick: fit, 'aria-label': tt('resetZoom'), title: tt('resetZoom') },
            `${Math.round(scale * 100)}%`,
          ),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn', onClick: () => applyScale(scale * 1.25), 'aria-label': tt('zoomIn'), title: tt('zoomIn') },
            '+',
          ),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn', onClick: rotate, 'aria-label': tt('rotate'), title: tt('rotate') },
            '⟳',
          ),
          h('button', { type: 'button', className: 'dshlib-btn', onClick: onDownload }, tt('download')),
          h(
            'button',
            {
              type: 'button',
              className: 'dshlib-btn dshlib-btn-danger',
              onClick: onDelete,
              'aria-label': tt('deleteRecord'),
              title: tt('deleteRecord'),
            },
            tt('delete'),
          ),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn dshlib-lightbox-bar-close', onClick: onClose, 'aria-label': tt('closeViewer'), title: tt('closeViewer') },
            '×',
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshlib-lightbox-close',
            onClick: onClose,
            'aria-label': tt('closeViewer'),
            title: tt('closeViewer'),
          },
          h(
            'svg',
            {
              viewBox: '0 0 24 24',
              width: 18,
              height: 18,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 2,
              strokeLinecap: 'round',
              'aria-hidden': true,
            },
            h('path', { d: 'M6 6l12 12M18 6L6 18' }),
          ),
        ),
      )
    }

    function LibraryIcon({ size = 20 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.5,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', { d: 'M4 6.2A1.7 1.7 0 0 1 5.7 4.5h4.1c.45 0 .88.18 1.2.5L12.7 6.7h5.6A1.7 1.7 0 0 1 20 8.4v9.4a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 17.8z' }),
        h('path', { d: 'M8 11.2h8M8 14.4h5.2' }),
      )
    }

    const STYLE_ID = 'dsh-library-styles'
    const CSS = `
.dshlib-root { display: flex; flex-direction: row; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); }
.dshlib-main { position: relative; display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; }
.dshlib-drawer { position: relative; display: flex; flex-direction: column; width: min(620px, 56%); min-width: 320px; min-height: 0; border-left: 1px solid var(--dsw-alias-border-l1); }
.dshlib-drawer-handle { position: absolute; left: -3px; top: 0; bottom: 0; width: 7px; z-index: 5; cursor: col-resize; touch-action: none; }
.dshlib-drawer-handle::after { content: ""; position: absolute; left: 2px; top: 42%; bottom: 42%; width: 3px; border-radius: 2px; background: var(--dsw-alias-border-l2); opacity: 0; transition: opacity 120ms ease; }
.dshlib-drawer-handle:hover::after, .dshlib-drawer-handle:focus-visible::after { opacity: 1; }
.dshlib-drawer-handle:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: -2px; }
.dshlib-drawer[data-resizing="true"] .dshlib-preview-frame { pointer-events: none; }
@media (prefers-reduced-motion: reduce) { .dshlib-drawer-handle::after { transition: none; } }
.dshlib-header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 14px 20px 8px; }
.dshlib-title { font-size: 17px; font-weight: 600; margin: 0 8px 0 0; }
.dshlib-sub { color: var(--dsw-alias-label-secondary); font-size: 12px; margin-right: auto; }
.dshlib-search { position: relative; display: flex; align-items: center; }
.dshlib-search input { width: 190px; height: 30px; padding: 0 26px 0 30px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); color: inherit; font-size: 13px; outline: none; }
.dshlib-search input:focus-visible { border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent); }
.dshlib-search .dshlib-search-icon { position: absolute; left: 9px; display: flex; color: var(--dsw-alias-label-secondary); pointer-events: none; }
.dshlib-search .dshlib-search-clear { position: absolute; right: 4px; width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; line-height: 1; }
.dshlib-search .dshlib-search-clear:hover { background: var(--dsw-alias-bg-layer-2); }
.dshlib-search input::-webkit-search-cancel-button, .dshlib-search input::-webkit-search-decoration { -webkit-appearance: none; appearance: none; display: none; }
.dshlib-btn { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.dshlib-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dshlib-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 1px; }
.dshlib-btn[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshlib-btn-primary { background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); }
.dshlib-btn-danger { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dshlib-attach-btn { color: var(--dsw-alias-label-secondary); }
.dshlib-attach-btn[aria-expanded="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshlib-picker-backdrop { position: fixed; inset: 0; z-index: 45; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / .32); }
.dshlib-picker { width: min(560px, calc(100vw - 48px)); height: min(72vh, 640px); max-height: calc(100vh - 48px); display: flex; flex-direction: column; border-radius: 14px; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 20px 54px rgb(0 0 0 / .28); overflow: hidden; }
.dshlib-picker-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshlib-picker-head h2 { margin: 0 auto 0 0; font-size: 14px; font-weight: 600; }
.dshlib-picker-tools { display: flex; align-items: center; gap: 8px; padding: 8px 14px; }
.dshlib-picker-tools .dshlib-search { flex: 1; }
.dshlib-picker-tools .dshlib-search input { width: 100%; }
.dshlib-picker-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 14px 8px; }
.dshlib-picker-list { flex: 1; min-height: 0; overflow: auto; padding: 0 8px 8px; }
.dshlib-picker-row { display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.dshlib-picker-row:hover { background: var(--dsw-alias-bg-layer-2); }
.dshlib-picker-row[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshlib-picker-row:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 1px; }
.dshlib-picker-check { width: 16px; height: 16px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 4px; border: 1px solid var(--dsw-alias-border-l2); font-size: 11px; }
.dshlib-picker-row[aria-pressed="true"] .dshlib-picker-check { background: var(--dsw-alias-label-primary); border-color: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-base); }
.dshlib-picker-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshlib-picker-meta { color: var(--dsw-alias-label-secondary); font-size: 12px; white-space: nowrap; }
.dshlib-picker-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 36px 20px; text-align: center; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.dshlib-picker-foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--dsw-alias-border-l1); }
.dshlib-picker-count { margin-right: auto; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshlib-picker-note { padding: 0 14px 8px; color: var(--dsw-alias-state-warn-primary); font-size: 12px; }
.dshlib-origin { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlib-origin-value { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshlib-origin-gone { color: var(--dsw-alias-state-warn-primary); }
.dshlib-origin .dshlib-btn { height: 24px; padding: 0 8px; font-size: 12px; }
.dshlib-collections { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 8px 20px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshlib-collection-chip { position: relative; display: inline-flex; align-items: center; }
.dshlib-collection-chip .dshlib-chip { padding-right: 8px; }
.dshlib-chip-menu { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 22px; margin-left: -4px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; line-height: 1; }
.dshlib-chip-menu:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshlib-chip-menu:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 1px; }
.dshlib-chip-menu-pop { top: 28px; right: 0; }
.dshlib-chip-add { border: 1px dashed var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.dshlib-chip-add:hover { border-style: solid; }
.dshlib-collections-current { margin-left: 6px; font-size: 13px; font-weight: 500; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshlib-source-btn { height: 28px; padding: 0 10px; font-size: 13px; color: var(--dsw-alias-label-primary); }
.dshlib-folders { display: grid; grid-template-columns: repeat(auto-fill, minmax(148px, 1fr)); gap: 14px; }
.dshlib-folder { position: relative; display: flex; flex-direction: column; padding: 4px 8px 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 14px; background: var(--dsw-alias-bg-layer-1); transition: border-color 120ms ease, box-shadow 120ms ease; }
.dshlib-folder-head { display: flex; justify-content: flex-end; height: 24px; }
.dshlib-folder-menu { top: 26px; right: 6px; }
.dshlib-folder:hover { border-color: var(--dsw-alias-border-l2); box-shadow: 0 6px 18px rgb(0 0 0 / 0.06); }
.dshlib-folder-open { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.dshlib-folder-open:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 4px; border-radius: 10px; }
.dshlib-folder-art { display: flex; align-items: center; justify-content: center; height: 46px; }
.dshlib-folder-name { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 500; }
.dshlib-folder-count { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshlib-batch { position: absolute; left: 50%; bottom: 76px; transform: translateX(-50%); z-index: 20; display: flex; flex-wrap: nowrap; align-items: center; gap: 10px; max-width: calc(100% - 32px); padding: 10px 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px rgb(0 0 0 / 0.22); overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.dshlib-batch::-webkit-scrollbar { display: none; }
.dshlib-batch-count { flex: none; font-size: 14px; font-weight: 500; color: var(--dsw-alias-label-primary); white-space: nowrap; margin-right: 4px; }
.dshlib-batch .dshlib-btn { flex: none; white-space: nowrap; height: 32px; padding: 0 12px; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; border: 1px solid var(--dsw-alias-border-l1); }
.dshlib-batch .dshlib-btn:hover { background: var(--dsw-alias-bg-layer-2); }
.dshlib-batch .dshlib-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 42%, transparent); }
@media (max-width: 760px) {
  .dshlib-batch { gap: 7px; padding: 8px 12px; bottom: 64px; }
  .dshlib-batch-count { font-size: 13px; }
  .dshlib-batch .dshlib-btn { height: 30px; font-size: 12px; padding: 0 10px; }
}
.dshlib-check { width: 18px; height: 18px; flex: none; accent-color: var(--dsw-alias-label-primary); cursor: pointer; }
.dshlib-card-check { position: absolute; top: 8px; left: 8px; display: flex; padding: 0; background: transparent; filter: drop-shadow(0 1px 2px rgb(0 0 0 / 0.35)); opacity: 0; transition: opacity 120ms ease; }
.dshlib-card:hover .dshlib-card-check, .dshlib-card-check:focus-within, .dshlib-card-check[data-on="true"] { opacity: 1; }
.dshlib-table th.dshlib-check-cell, .dshlib-table td.dshlib-check-cell { width: 34px; padding-right: 0; }
.dshlib-settings { display: flex; flex-direction: column; gap: 16px; max-width: 620px; }
.dshlib-settings h3 { margin: 0; font-size: 15px; }
.dshlib-settings section { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.dshlib-settings label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlib-settings input[type="text"] { height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: inherit; font-size: 13px; outline: none; }
.dshlib-settings input[type="text"]:focus-visible { border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
.dshlib-settings code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
.dshlib-settings-row { display: flex; gap: 8px; align-items: center; }
.dshlib-settings-note { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlib-settings-error { font-size: 12px; color: var(--dsw-alias-state-error-primary); }
.dshlib-folder .dshlib-icon-btn { opacity: 0; transition: opacity 120ms ease; }
.dshlib-folder:hover .dshlib-icon-btn, .dshlib-folder:focus-within .dshlib-icon-btn { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .dshlib-folder { transition: none; } }
.dshlib-picker-folders { display: flex; flex-direction: column; gap: 2px; padding: 2px 0 8px; }
.dshlib-picker-back { display: flex; align-items: center; gap: 8px; padding: 2px 6px 8px; }
.dshlib-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.dshlib-field label { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlib-field input { height: 32px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-base); color: inherit; font-size: 13px; outline: none; }
.dshlib-field input:focus-visible { border-color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
.dshlib-field-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
.dshlib-choice-list { display: flex; flex-direction: column; gap: 2px; max-height: 240px; overflow: auto; margin-bottom: 12px; }
.dshlib-choice { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.dshlib-choice:hover { background: var(--dsw-alias-bg-layer-2); }
.dshlib-choice[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshlib-btn-primary:hover { filter: brightness(0.92); background: var(--dsw-alias-label-primary); }
.dshlib-btn-ghost { border-color: transparent; }
.dshlib-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dshlib-icon-btn:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshlib-icon-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 1px; }
.dshlib-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 0 20px 10px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshlib-chip { height: 28px; padding: 0 12px; border-radius: 999px; border: 1px solid transparent; background: transparent; color: var(--dsw-alias-label-secondary); font-size: 13px; cursor: pointer; }
.dshlib-chip:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.dshlib-chip[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); font-weight: 500; }
.dshlib-chip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 1px; }
.dshlib-divider { width: 1px; height: 18px; background: var(--dsw-alias-border-l1); margin: 0 4px; }
.dshlib-source { height: 28px; padding: 0 8px; border-radius: 8px; border: 1px solid var(--dsw-alias-border-l1); background: transparent; color: inherit; font-size: 13px; }
.dshlib-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 20px 24px; }
.dshlib-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.dshlib-card { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); text-align: left; color: inherit; cursor: default; }
.dshlib-card:hover { border-color: var(--dsw-alias-border-l2); }
.dshlib-card-thumb { display: flex; align-items: center; justify-content: center; height: 84px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); overflow: hidden; }
.dshlib-card-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }
.dshlib-thumb-img { width: 100%; height: 100%; display: block; object-fit: cover; border-radius: 8px; }
.dshlib-card-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; }
.dshlib-card-name span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshlib-card-meta { display: flex; justify-content: space-between; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dshlib-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.dshlib-table th { text-align: left; font-weight: 500; color: var(--dsw-alias-label-secondary); font-size: 12px; padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); position: sticky; top: 0; background: var(--dsw-alias-bg-base); }
.dshlib-table td { padding: 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: middle; }
.dshlib-table tr:hover td { background: var(--dsw-alias-bg-layer-1); }
.dshlib-th-sort { display: inline-flex; align-items: center; gap: 4px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; user-select: none; }
.dshlib-th-sort:hover { color: var(--dsw-alias-label-primary); }
.dshlib-th-sort:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 2px; border-radius: 4px; }
.dshlib-sort-glyph { font-size: 11px; line-height: 1; opacity: .35; }
.dshlib-sort-active { opacity: 1; color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); }
.dshlib-name-cell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dshlib-name-cell span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshlib-num { color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.dshlib-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 64px 20px; color: var(--dsw-alias-label-secondary); text-align: center; }
.dshlib-empty strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 500; }
.dshlib-skeleton { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 12px; }
.dshlib-skeleton div { height: 132px; border-radius: 12px; background: linear-gradient(90deg, var(--dsw-alias-bg-layer-1), var(--dsw-alias-bg-layer-2), var(--dsw-alias-bg-layer-1)); background-size: 200% 100%; animation: dshlib-shimmer 1.4s ease-in-out infinite; }
@keyframes dshlib-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
@media (prefers-reduced-motion: reduce) { .dshlib-skeleton div { animation: none; } }
.dshlib-banner { display: flex; align-items: center; gap: 10px; margin: 0 20px 10px; padding: 8px 12px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, transparent); color: var(--dsw-alias-label-primary); font-size: 13px; }
.dshlib-banner .dshlib-btn { margin-left: auto; }
.dshlib-menu { position: absolute; top: 32px; right: 0; z-index: 20; min-width: 132px; padding: 4px; border-radius: 10px; border: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-overlay); box-shadow: 0 8px 24px rgb(0 0 0 / 0.14); }
.dshlib-menu button { display: flex; width: 100%; align-items: center; gap: 8px; padding: 7px 8px; border: 0; border-radius: 7px; background: transparent; color: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.dshlib-menu button:hover { background: var(--dsw-alias-bg-layer-2); }
.dshlib-menu button.dshlib-danger { color: var(--dsw-alias-state-error-primary); }
.dshlib-overlay { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 0.32); }
.dshlib-dialog { width: min(420px, calc(100vw - 40px)); padding: 18px; border-radius: 14px; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 18px 48px rgb(0 0 0 / 0.24); }
.dshlib-dialog h2 { margin: 0 0 8px; font-size: 15px; }
.dshlib-dialog p { margin: 0 0 8px; color: var(--dsw-alias-label-secondary); font-size: 13px; }
.dshlib-dialog ul { max-height: 160px; overflow: auto; margin: 0 0 12px; padding-left: 18px; font-size: 13px; }
.dshlib-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dshlib-danger-solid { background: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-bg-base); }
.dshlib-danger-solid:hover { background: var(--dsw-alias-state-error-primary); border-color: var(--dsw-alias-state-error-primary); filter: brightness(0.92); }
.dshlib-btn-primary:disabled, .dshlib-danger-solid:disabled { opacity: 0.55; cursor: default; }
.dshlib-progress { height: 4px; border-radius: 999px; background: var(--dsw-alias-bg-layer-2); overflow: hidden; }
.dshlib-progress i { display: block; height: 100%; background: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); transition: width 120ms linear; }
.dshlib-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 50; max-width: 70vw; padding: 8px 14px; border-radius: 10px; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 10px 30px rgb(0 0 0 / 0.2); font-size: 13px; }
.dshlib-sentinel { height: 1px; }
.dshlib-badge { padding: 1px 6px; border-radius: 999px; font-size: 11px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.dshlib-broken { color: var(--dsw-alias-state-error-primary); }
.dshlib-card-open { cursor: pointer; }
.dshlib-card-open:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 1px; }
.dshlib-row-open { cursor: pointer; }
.dshlib-preview { display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); }
.dshlib-preview-head { display: flex; align-items: center; gap: 6px; padding: 9px 12px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.dshlib-preview-title { font-size: 13px; font-weight: 500; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dshlib-preview-path { font-size: 11px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: auto; }
.dshlib-preview-controls { display: flex; align-items: center; gap: 2px; }
.dshlib-preview-controls .dshlib-btn { height: 26px; padding: 0 8px; font-size: 12px; }
.dshlib-preview-body { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; overflow: auto; }
.dshlib-preview-frame { width: 100%; height: 100%; border: 0; background: #fff; }
.dshlib-preview-image.dshlib-zoomable { cursor: zoom-in; }
.dshlib-lightbox { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; background: rgb(0 0 0 / 0.82); }
.dshlib-lightbox-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; touch-action: none; }
.dshlib-lightbox-image { max-width: none; max-height: none; transform-origin: center center; user-select: none; -webkit-user-drag: none; will-change: transform; }
.dshlib-lightbox-bar { position: absolute; left: 50%; bottom: 28px; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 999px; background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2); box-shadow: 0 14px 36px rgb(0 0 0 / 0.4); }
.dshlib-lightbox-bar .dshlib-btn { height: 36px; min-width: 44px; padding: 0 12px; font-size: 14px; justify-content: center; color: var(--dsw-alias-label-primary); }
.dshlib-lightbox-bar .dshlib-lightbox-bar-close { min-width: 40px; font-size: 18px; line-height: 1; }
.dshlib-lightbox-bar .dshlib-btn-danger { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, transparent); }
.dshlib-lightbox-bar .dshlib-btn-danger:hover { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); border-color: var(--dsw-alias-state-error-primary); }
.dshlib-lightbox-close { position: absolute; top: calc(18px + var(--dsh-frame-top-clearance, 0px)); right: 18px; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; padding: 0; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--dsw-alias-label-primary) 14%, transparent); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 88%, transparent); color: var(--dsw-alias-label-primary); cursor: pointer; backdrop-filter: blur(6px); transition: background 120ms ease, border-color 120ms ease; }
.dshlib-lightbox-close:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.dshlib-lightbox-close:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .dshlib-lightbox-close { transition: none; } }
.dshlib-preview-image { max-width: 100%; max-height: 100%; object-fit: contain; }
.dshlib-preview-image.dshlib-actual { max-width: none; max-height: none; }
.dshlib-preview-audio { width: 92%; }
.dshlib-preview-hint { display: flex; align-items: center; gap: 8px; padding: 6px 12px; font-size: 12px; background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 12%, transparent); }
.dshlib-preview-fallback { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 40px 24px; text-align: center; color: var(--dsw-alias-label-secondary); }
.dshlib-preview-fallback strong { color: var(--dsw-alias-label-primary); font-size: 14px; font-weight: 500; }
.dshlib-preview-meta { display: flex; flex-wrap: wrap; gap: 14px; justify-content: center; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dshlib-preview-toast { position: absolute; left: 50%; bottom: 18px; transform: translateX(-50%); padding: 6px 12px; border-radius: 8px; background: var(--dsw-alias-bg-overlay); border: 1px solid var(--dsw-alias-border-l1); box-shadow: 0 8px 20px rgb(0 0 0 / .18); font-size: 12px; }
.dshlib-pre { margin: 0; padding: 14px 16px; width: 100%; height: 100%; overflow: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px; line-height: 1.55; white-space: pre; tab-size: 2; }
.dshlib-pre.dshlib-wrap { white-space: pre-wrap; word-break: break-word; }
.dshlib-md { width: 100%; height: 100%; overflow: auto; padding: 18px 22px; font-size: 14px; line-height: 1.7; }
.dshlib-md > :first-child { margin-top: 0; }
.dshlib-md h1 { font-size: 22px; margin: 18px 0 10px; }
.dshlib-md h2 { font-size: 18px; margin: 16px 0 8px; }
.dshlib-md h3 { font-size: 16px; margin: 14px 0 8px; }
.dshlib-md h4, .dshlib-md h5, .dshlib-md h6 { font-size: 14px; margin: 12px 0 6px; }
.dshlib-md p { margin: 10px 0; }
.dshlib-md pre { background: var(--dsw-alias-bg-layer-2); padding: 12px; border-radius: 8px; overflow: auto; }
.dshlib-md code { background: var(--dsw-alias-bg-layer-2); padding: 1px 4px; border-radius: 4px; font-size: 12.5px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.dshlib-md pre code { background: transparent; padding: 0; }
.dshlib-md blockquote { margin: 10px 0; padding: 4px 12px; border-left: 3px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); }
.dshlib-md table { border-collapse: collapse; margin: 10px 0; }
.dshlib-md th, .dshlib-md td { border: 1px solid var(--dsw-alias-border-l1); padding: 5px 9px; font-size: 13px; }
.dshlib-md hr { border: 0; border-top: 1px solid var(--dsw-alias-border-l1); margin: 16px 0; }
.dshlib-md ul, .dshlib-md ol { padding-left: 22px; margin: 8px 0; }
.dshlib-md .dshlib-link { color: var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary)); text-decoration: underline; text-decoration-style: dotted; }
`

    function ensureStyles() {
      if (typeof document === 'undefined') return () => {}
      const existing = document.getElementById(STYLE_ID)
      if (existing !== null) return () => {}
      const element = document.createElement('style')
      element.id = STYLE_ID
      element.textContent = CSS
      document.head.appendChild(element)
      return () => element.remove()
    }

    // --- page ---------------------------------------------------------------


    /** Remembers the page's view state while the panel is unmounted. */
    const libraryViewMemory = {
      view: 'grid',
      category: 'all',
      source: 'all',
      sort: 'date',
      direction: 'desc',
      query: '',
      collectionFilter: null,
      scrollTop: 0,
      previewWidth: 0,
    }

    function LibraryPage(props) {
      const { t, describeOrigin, jumpSource, openChat } = props
      const tt = (key, params) => t(key, params)

      const [view, setView] = React.useState(libraryViewMemory.view)
      const [category, setCategory] = React.useState(libraryViewMemory.category)
      const [source, setSource] = React.useState(libraryViewMemory.source)
      const [sort, setSort] = React.useState(libraryViewMemory.sort)
      const [direction, setDirection] = React.useState(libraryViewMemory.direction)
      const [query, setQuery] = React.useState(libraryViewMemory.query)
      const [debounced, setDebounced] = React.useState(libraryViewMemory.query.trim())
      const [items, setItems] = React.useState([])
      const [total, setTotal] = React.useState(0)
      const [nextOffset, setNextOffset] = React.useState(null)
      const [phase, setPhase] = React.useState('loading')
      const [error, setError] = React.useState(null)
      const [state, setState] = React.useState(null)
      const [uploads, setUploads] = React.useState([])
      const [confirming, setConfirming] = React.useState(null)
      const [menuFor, setMenuFor] = React.useState(null)
      const [toast, setToast] = React.useState(null)
      const [previewItem, setPreviewItem] = React.useState(null)
      const [collectionFilter, setCollectionFilter] = React.useState(libraryViewMemory.collectionFilter)
      const [collectionDialog, setCollectionDialog] = React.useState(null)
      const [collectionMenu, setCollectionMenu] = React.useState(null)
      const [deletingCollection, setDeletingCollection] = React.useState(null)
      const [favoriteDialog, setFavoriteDialog] = React.useState(null)
      const [assetOrigin, setAssetOrigin] = React.useState(null)
      const [selected, setSelected] = React.useState(() => new Map())
      const [previewWidth, setPreviewWidth] = React.useState(libraryViewMemory.previewWidth)
      const [resizing, setResizing] = React.useState(false)
      const queryKey = JSON.stringify({ category, source, sort, direction, debounced, collectionFilter })
      React.useEffect(() => {
        let live = true
        resolveHost()
          .then((origin) => {
            if (live) setAssetOrigin(origin)
          })
          .catch(() => {
            // Thumbnails simply fall back to the type badge.
          })
        return () => {
          live = false
        }
      }, [])

      const lastSelectedIndex = React.useRef(-1)
      const rootRef = React.useRef(null)
      const bodyRef = React.useRef(null)
      const fileInput = React.useRef(null)
      const sentinel = React.useRef(null)
      const requestSeq = React.useRef(0)
      const aborts = React.useRef(new Map())
      const queue = React.useRef([])
      const jobs = React.useRef(new Map())
      const active = React.useRef(0)

      React.useEffect(() => {
        const timer = setTimeout(() => setDebounced(query.trim()), 250)
        return () => clearTimeout(timer)
      }, [query])

      React.useEffect(() => {
        if (toast === null) return undefined
        const timer = setTimeout(() => setToast(null), 4000)
        return () => clearTimeout(timer)
      }, [toast])
      React.useEffect(() => {
        libraryViewMemory.view = view
        libraryViewMemory.category = category
        libraryViewMemory.source = source
        libraryViewMemory.sort = sort
        libraryViewMemory.direction = direction
        libraryViewMemory.query = query
        libraryViewMemory.collectionFilter = collectionFilter
      }, [view, category, source, sort, direction, query, collectionFilter])

      const restoredScroll = React.useRef(false)
      React.useEffect(() => {
        if (restoredScroll.current || bodyRef.current === null) return
        if (phase === 'loading') return
        restoredScroll.current = true
        bodyRef.current.scrollTop = libraryViewMemory.scrollTop
      }, [phase, items])

      // A changed filter starts at the top; the remembered offset belongs to the
      // old view, so a remount must not be treated as a filter change.
      const lastQueryKey = React.useRef(null)
      React.useEffect(() => {
        if (lastQueryKey.current === null) {
          lastQueryKey.current = queryKey
          return
        }
        if (lastQueryKey.current === queryKey) return
        lastQueryKey.current = queryKey
        libraryViewMemory.scrollTop = 0
        if (bodyRef.current !== null) bodyRef.current.scrollTop = 0
        restoredScroll.current = true
      }, [queryKey])
      const reloadRef = React.useRef(() => {})


      const load = React.useCallback(
        async (mode) => {
          const seq = requestSeq.current + 1
          requestSeq.current = seq
          if (mode === 'replace') setPhase((current) => (current === 'ready' ? 'refreshing' : 'loading'))
          const params = new URLSearchParams({
            category,
            source,
            sort,
            direction,
            limit: String(PAGE_SIZE),
            offset: String(mode === 'append' ? (nextOffset ?? 0) : 0),
          })
          // Favorites open on a folder list: only the archive summary is needed.
          if (category === 'favorite' && collectionFilter === null && debounced === '') {
            try {
              const snapshot = await api('/library/api/state')
              if (requestSeq.current !== seq) return
              setItems([])
              setTotal(0)
              setNextOffset(null)
              setState(snapshot)
              setError(null)
              setPhase('ready')
            } catch (failure) {
              if (requestSeq.current !== seq) return
              setError(String(failure?.message ?? failure))
              setPhase('error')
            }
            return
          }
          if (debounced !== '') params.set('q', debounced)
          if (category === 'favorite' && collectionFilter !== null) params.set('collectionId', collectionFilter)
          try {
            const [page, snapshot] = await Promise.all([
              api(`/library/api/files?${params.toString()}`),
              api('/library/api/state'),
            ])
            if (requestSeq.current !== seq) return
            setItems((current) => (mode === 'append' ? [...current, ...page.items] : page.items))
            setTotal(page.total)
            setNextOffset(page.nextOffset)
            setState(snapshot)
            setError(null)
            setPhase('ready')
          } catch (failure) {
            if (requestSeq.current !== seq) return
            setError(String(failure?.message ?? failure))
            setPhase('error')
          }
        },
        [category, source, sort, direction, debounced, nextOffset, collectionFilter],
      )

      React.useEffect(() => {
        void load('replace')
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [queryKey])

      React.useEffect(() => {
        if (category !== 'favorite') setCollectionFilter(null)
      }, [category])

      // The preview (another tab in the same page) can change or delete records.
      React.useEffect(() => libraryChanged.subscribe(() => reloadRef.current()), [])
      React.useEffect(() => {
        reloadRef.current = () => {
          void load('replace')
        }
      }, [load])
      React.useEffect(() => {
        if (sentinel.current === null || nextOffset === null || phase === 'loading') return undefined
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) void load('append')
          },
          { rootMargin: '240px' },
        )
        observer.observe(sentinel.current)
        return () => observer.disconnect()
      }, [nextOffset, phase, load])

      // Uploads: at most three concurrent XHRs, each with progress and cancel.
      const updateUpload = (id, patch) => {
        setUploads((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)))
      }

      const sendOne = (job) => {
        void (async () => {
          let origin
          try {
            origin = await resolveHost()
          } catch (failure) {
            active.current -= 1
            updateUpload(job.id, { status: 'error', reason: String(failure?.message ?? failure) })
            pump()
            return
          }
          const request = new XMLHttpRequest()
          aborts.current.set(job.id, { abort: () => request.abort() })
          request.open('POST', `${origin}/library/api/files`)
          request.setRequestHeader('x-library-name', encodeURIComponent(job.file.name))
          request.setRequestHeader('x-library-source', 'upload-library')
          if (job.file.lastModified) {
            request.setRequestHeader('x-library-mtime', new Date(job.file.lastModified).toISOString())
          }
          request.upload.onprogress = (event) => {
            if (!event.lengthComputable) return
            updateUpload(job.id, { progress: Math.round((event.loaded / event.total) * 100) })
          }
          request.onload = () => {
            aborts.current.delete(job.id)
            active.current -= 1
            if (request.status >= 200 && request.status < 300) {
              setUploads((current) => current.filter((item) => item.id !== job.id))
              jobs.current.delete(job.id)
              void load('replace')
            } else {
              let reason = `HTTP ${request.status}`
              try {
                reason = JSON.parse(request.responseText)?.error?.message ?? reason
              } catch {
                // Keep the HTTP status as the reason.
              }
              updateUpload(job.id, { status: 'error', reason })
            }
            pump()
          }
          request.onerror = () => {
            aborts.current.delete(job.id)
            active.current -= 1
            updateUpload(job.id, { status: 'error', reason: 'network' })
            pump()
          }
          request.onabort = () => {
            aborts.current.delete(job.id)
            active.current -= 1
            setUploads((current) => current.filter((item) => item.id !== job.id))
            jobs.current.delete(job.id)
            pump()
          }
          updateUpload(job.id, { status: 'uploading', progress: 0 })
          request.send(job.file)
        })()
      }

      const pump = () => {
        while (active.current < MAX_PARALLEL && queue.current.length > 0) {
          const job = queue.current.shift()
          if (!jobs.current.has(job.id)) continue
          active.current += 1
          sendOne(job)
        }
      }

      const enqueue = (files) => {
        if (files.length === 0) return
        const jobsToAdd = files.map((file) => ({
          id: `up_${Math.random().toString(36).slice(2)}`,
          file,
        }))
        for (const job of jobsToAdd) jobs.current.set(job.id, job)
        setUploads((current) => [
          ...current,
          ...jobsToAdd.map((job) => ({ id: job.id, name: job.file.name, size: job.file.size, progress: 0, status: 'queued' })),
        ])
        queue.current.push(...jobsToAdd)
        pump()
      }

      const cancelUpload = (id) => {
        const index = queue.current.findIndex((job) => job.id === id)
        if (index >= 0) queue.current.splice(index, 1)
        jobs.current.delete(id)
        const controller = aborts.current.get(id)
        if (controller !== undefined) controller.abort()
        else setUploads((current) => current.filter((item) => item.id !== id))
      }

      const retryUpload = (id) => {
        const job = jobs.current.get(id)
        if (job === undefined) return
        updateUpload(id, { status: 'queued', progress: 0, reason: undefined })
        queue.current.push(job)
        pump()
      }

      React.useEffect(
        () => () => {
          for (const controller of aborts.current.values()) controller.abort()
          aborts.current.clear()
          queue.current.length = 0
          jobs.current.clear()
        },
        [],
      )

      const onFilesPicked = (event) => {
        const files = Array.from(event.target.files ?? [])
        event.target.value = ''
        enqueue(files)
      }

      const onDrop = (event) => {
        event.preventDefault()
        enqueue(Array.from(event.dataTransfer?.files ?? []))
      }
      const downloadItem = (item) => {
        void (async () => {
          try {
            const origin = await resolveHost()
            const response = await fetch(`${origin}/library/download/${encodeURIComponent(item.id)}`, {
              cache: 'no-store',
              mode: 'cors',
            })
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const blob = await response.blob()
            const url = URL.createObjectURL(blob)
            const anchor = document.createElement('a')
            anchor.href = url
            anchor.download = item.name
            anchor.rel = 'noopener'
            document.body.appendChild(anchor)
            anchor.click()
            anchor.remove()
            setTimeout(() => URL.revokeObjectURL(url), 4000)
          } catch (failure) {
            setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
          }
        })()
      }

      // A favorite made inside a collection lands in that collection; anywhere
      // else it stays unfiled (PRD 3.6).
      const collections = state === null || !Array.isArray(state.collections) ? [] : state.collections
      const favoritesRoot = category === 'favorite' && collectionFilter === null
      // Only a quiet root shows the folder layer; typing searches every favorite.
      const favoritesFolderView = favoritesRoot && debounced === ''
      const currentFolderName =
        collectionFilter === null
          ? ''
          : collectionFilter === 'uncategorized'
            ? tt('favoritesUnfiled')
            : collections.find((collection) => collection.id === collectionFilter)?.name ?? ''
      const activeCollection =
        category === 'favorite' && collectionFilter !== null && collectionFilter !== 'uncategorized'
          ? collectionFilter
          : null

      // 取消收藏 is immediate; 收藏 opens the folder chooser (未分类 by default).
      const toggleFavorite = (item) => {
        if (item.favorited === true) {
          void removeFavorite([item])
          return
        }
        setFavoriteDialog({ records: [item], mode: 'favorite' })
      }

      const openMoveFolder = (item) => setFavoriteDialog({ records: [item], mode: 'move' })

      const applyFavorite = async (records, collectionId) => {
        try {
          await api('/library/api/files', {
            method: 'PATCH',
            body: { ids: records.map((record) => record.id), favorited: true, collectionId },
          })
          setFavoriteDialog(null)
          await load('replace')
          libraryChanged.emit()
          const name =
            collectionId === null
              ? tt('favoritesUnfiled')
              : collections.find((collection) => collection.id === collectionId)?.name ?? tt('favoritesUnfiled')
          setToast(tt('favoriteMoved', { name }))
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const removeFavorite = async (records) => {
        try {
          await api('/library/api/files', {
            method: 'PATCH',
            body: { ids: records.map((record) => record.id), favorited: false },
          })
          setFavoriteDialog(null)
          await load('replace')
          libraryChanged.emit()
          setToast(tt('unfavoritedToast'))
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const submitCollection = async (name) => {
        const dialog = collectionDialog
        if (dialog === null) return
        if (dialog.mode === 'create') {
          const created = await api('/library/api/collections', { method: 'POST', body: { name } })
          setCollectionFilter(created.collection.id)
          await load('replace')
          setToast(tt('collectionCreated', { name: created.collection.name }))
        } else {
          const renamed = await api('/library/api/collections', { method: 'PATCH', body: { id: dialog.id, name } })
          await load('replace')
          setToast(tt('collectionRenamed', { name: renamed.collection.name }))
        }
        setCollectionDialog(null)
      }

      const performDeleteCollection = async () => {
        if (deletingCollection === null) return
        const target = deletingCollection
        setDeletingCollection(null)
        try {
          await api('/library/api/collections', { method: 'DELETE', body: { id: target.id } })
          if (collectionFilter === target.id) setCollectionFilter(null)
          await load('replace')
          setToast(tt('collectionDeleted'))
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const widthLimits = () => {
        const root = rootRef.current
        const bounds = root === null ? null : root.getBoundingClientRect()
        const total = bounds === null ? 1200 : bounds.width
        return { minimum: 320, maximum: Math.max(320, Math.round(total * 0.8)), total, right: bounds === null ? 0 : bounds.right }
      }

      const applyPreviewWidth = (next) => {
        const { minimum, maximum } = widthLimits()
        const clamped = Math.min(maximum, Math.max(minimum, Math.round(next)))
        setPreviewWidth(clamped)
        libraryViewMemory.previewWidth = clamped
        return clamped
      }

      const startPreviewResize = (event) => {
        if (event.button !== undefined && event.button !== 0) return
        event.preventDefault()
        // Pointer capture keeps the drag alive when the pointer crosses the preview
        // iframe, which would otherwise swallow the pointermove stream.
        const handle = event.currentTarget
        const pointerId = event.pointerId
        if (typeof handle.setPointerCapture === 'function' && pointerId !== undefined) {
          try {
            handle.setPointerCapture(pointerId)
          } catch {
            // Capture is best effort; the listeners below still cover the common case.
          }
        }
        setResizing(true)
        const { maximum, minimum, right } = widthLimits()
        const move = (pointer) => {
          const next = Math.min(maximum, Math.max(minimum, right - pointer.clientX))
          setPreviewWidth(next)
          libraryViewMemory.previewWidth = next
        }
        const onMove = (pointer) => move(pointer)
        const finish = () => {
          setResizing(false)
          handle.removeEventListener('pointermove', onMove)
          handle.removeEventListener('pointerup', finish)
          handle.removeEventListener('pointercancel', finish)
          document.removeEventListener('pointermove', onMove)
          document.removeEventListener('pointerup', finish)
          if (typeof handle.releasePointerCapture === 'function' && pointerId !== undefined) {
            try {
              handle.releasePointerCapture(pointerId)
            } catch {
              // Already released.
            }
          }
        }
        move(event)
        handle.addEventListener('pointermove', onMove)
        handle.addEventListener('pointerup', finish)
        handle.addEventListener('pointercancel', finish)
        document.addEventListener('pointermove', onMove)
        document.addEventListener('pointerup', finish)
      }

      const nudgePreviewWidth = (delta) => {
        const { minimum, maximum, total } = widthLimits()
        const current = previewWidth > 0 ? previewWidth : Math.round(total * 0.56)
        applyPreviewWidth(Math.min(maximum, Math.max(minimum, current + delta)))
      }

      const resetPreviewWidth = () => {
        setPreviewWidth(0)
        libraryViewMemory.previewWidth = 0
      }

      const selectionCount = selected.size
      const isSelected = (item) => selected.has(item.id)

      const toggleSelection = (item, index, extend) => {
        const next = new Map(selected)
        if (extend && lastSelectedIndex.current >= 0 && lastSelectedIndex.current !== index) {
          const start = Math.min(lastSelectedIndex.current, index)
          const end = Math.max(lastSelectedIndex.current, index)
          for (let cursor = start; cursor <= end; cursor += 1) {
            const entry = items[cursor]
            if (entry !== undefined) next.set(entry.id, entry)
          }
        } else if (next.has(item.id)) {
          next.delete(item.id)
        } else {
          next.set(item.id, item)
        }
        lastSelectedIndex.current = index
        setSelected(next)
      }

      const selectAllCurrent = () => setSelected(new Map(items.map((item) => [item.id, item])))
      const selectedRecords = () => Array.from(selected.values())

      const downloadSelection = async () => {
        const records = selectedRecords()
        if (records.length === 0) return
        try {
          const origin = await resolveHost()
          const response = await fetch(`${origin}/library/api/zip`, {
            method: 'POST',
            mode: 'cors',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ids: records.map((record) => record.id) }),
          })
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}))
            throw new Error(payload?.error?.message ?? `HTTP ${response.status}`)
          }
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = `library-${new Date().toISOString().slice(0, 10)}.zip`
          anchor.rel = 'noopener'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const sendSelectionToChat = () => {
        const records = selectedRecords()
        if (records.length === 0) return
        const sessionId = chatHandoff.lastSessionId
        if (typeof sessionId !== 'string') {
          setToast(tt('sendNoChat'))
          return
        }
        chatHandoff.requests.push({
          sessionId,
          items: records.map((record) => ({ id: record.id, name: record.name, mime: record.mime, bytes: record.bytes })),
        })
        setSelected(new Map())
        setToast(tt('sendQueued', { count: records.length }))
        if (typeof openChat === 'function') {
          try {
            openChat(sessionId)
          } catch {
            // Staying on the library panel is an acceptable outcome; the request is queued.
          }
        }
      }

      const batchMove = () => {
        const records = selectedRecords()
        if (records.length > 0) setFavoriteDialog({ records, mode: 'move' })
      }


      const askDelete = (records) => {
        const bytes = records.reduce((sum, record) => sum + ((record.refs ?? 1) <= 1 ? (record.bytes ?? 0) : 0), 0)
        setMenuFor(null)
        setConfirming({ records, bytes })
      }

      const performDelete = async () => {
        if (confirming === null) return
        const ids = confirming.records.map((record) => record.id)
        setConfirming(null)
        try {
          await api('/library/api/files', { method: 'DELETE', body: { ids } })
          setSelected(new Map())
          await load('replace')
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const retryFailures = async () => {
        try {
          const result = await api('/library/api/retry-failures', { method: 'POST' })
          await load('replace')
          setToast(tt('failureRetried', { ok: result.retried ?? 0, failed: (result.failed ?? []).length }))
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const rebuild = async () => {
        try {
          await api('/library/api/rebuild', { method: 'POST' })
          await load('replace')
        } catch (failure) {
          setToast(tt('actionFailed', { reason: String(failure?.message ?? failure) }))
        }
      }

      const resetFilters = () => {
        setCategory('all')
        setSource('all')
        setQuery('')
      }
      // Column-header sorting: a new column starts ascending for names and
      // descending for size and date; the active column toggles direction.
      const applySort = (field) => {
        if (sort === field) {
          setDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
          return
        }
        setSort(field)
        setDirection(field === 'name' ? 'asc' : 'desc')
      }

      const categories = [
        ['all', 'categoryAll'],
        ['document', 'categoryDocument'],
        ['image', 'categoryImage'],
        ['video', 'categoryVideo'],
        ['audio', 'categoryAudio'],
        ['favorite', 'categoryFavorite'],
      ]

      const isEmptyLibrary = total === 0 && items.length === 0 && debounced === '' && category === 'all' && source === 'all'
      const filtered = category !== 'all' || source !== 'all'

      const folders = [
        { id: 'uncategorized', name: tt('favoritesUnfiled'), count: state === null ? 0 : state.unfiled ?? 0 },
        ...collections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          count: collection.count ?? 0,
          collection,
        })),
      ]

      let content = null
      if (favoritesFolderView) {
        const visibleFolders = folders.filter(
          (folder) => debounced === '' || folder.name.toLowerCase().includes(debounced.toLowerCase()),
        )
        content =
          visibleFolders.length === 0
            ? h(
                'div',
                { className: 'dshlib-empty' },
                h('strong', null, tt('searchEmpty')),
                h('button', { type: 'button', className: 'dshlib-btn', onClick: () => setQuery('') }, tt('clearSearch')),
              )
            : h(
                'div',
                { className: 'dshlib-folders' },
                ...visibleFolders.map((folder) =>
                  h(FolderCard, {
                    key: folder.id,
                    tt,
                    folder,
                    onOpen: () => setCollectionFilter(folder.id),
                    menuOpen: collectionMenu === folder.id,
                    onToggleMenu: () =>
                      setCollectionMenu((current) => (current === folder.id ? null : folder.id)),
                    onRename:
                      folder.collection === undefined
                        ? undefined
                        : () => {
                            setCollectionMenu(null)
                            setCollectionDialog({ mode: 'rename', id: folder.collection.id, name: folder.collection.name })
                          },
                    onDelete:
                      folder.collection === undefined
                        ? undefined
                        : () => {
                            setCollectionMenu(null)
                            setDeletingCollection(folder.collection)
                          },
                  }),
                ),
              )
      } else if (phase === 'loading') {
        content = h('div', { className: 'dshlib-skeleton' }, ...Array.from({ length: 8 }, (_, index) => h('div', { key: index })))
      } else if (phase === 'error') {
        content = h(
          'div',
          { className: 'dshlib-empty' },
          h('strong', null, tt('actionFailed', { reason: error ?? '' })),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn', onClick: () => void load('replace') },
            tt('loadMore'),
          ),
        )
      } else if (items.length === 0) {
        if (debounced !== '') {
          content = h(
            'div',
            { className: 'dshlib-empty' },
            h('strong', null, tt('searchEmpty')),
            h('button', { type: 'button', className: 'dshlib-btn', onClick: () => setQuery('') }, tt('clearSearch')),
          )
        } else if (activeCollection !== null) {
          content = h(
            'div',
            { className: 'dshlib-empty' },
            h(LibraryIcon, { size: 40 }),
            h('strong', null, tt('collectionEmpty')),
            h('span', null, tt('collectionEmptyHint')),
            h(
              'button',
              { type: 'button', className: 'dshlib-btn', onClick: () => setCollectionFilter(null) },
              tt('collectionEmptyAction'),
            ),
          )
        } else if (category === 'favorite') {
          content = h(
            'div',
            { className: 'dshlib-empty' },
            h(LibraryIcon, { size: 40 }),
            h('strong', null, tt('unfiledEmpty')),
            h('span', null, tt('unfiledEmptyHint')),
          )
        } else if (filtered) {
          content = h(
            'div',
            { className: 'dshlib-empty' },
            h('strong', null, tt('filterEmpty')),
            h('button', { type: 'button', className: 'dshlib-btn', onClick: resetFilters }, tt('filterReset')),
          )
        } else {
          content = h(
            'div',
            { className: 'dshlib-empty' },
            h(LibraryIcon, { size: 40 }),
            h('strong', null, tt('emptyTitle')),
            h(
              'button',
              { type: 'button', className: 'dshlib-btn dshlib-btn-primary', onClick: () => fileInput.current?.click() },
              tt('emptyAction'),
            ),
          )
        }
      } else if (view === 'grid') {
        content = h(
          'div',
          { className: 'dshlib-grid' },
          ...items.map((item, index) =>
            h(Card, {
              key: item.id,
              item,
              index,
              checked: isSelected(item),
              onToggleSelect: (extend) => toggleSelection(item, index, extend),
              tt,
              menuOpen: menuFor === item.id,
              onToggleMenu: () => setMenuFor((current) => (current === item.id ? null : item.id)),
              onOpen: () => setPreviewItem(item),
              onDownload: () => downloadItem(item),
              onFavorite: () => toggleFavorite(item),
              onMoveFolder:
                item.favorited === true && collections.length > 0 ? () => openMoveFolder(item) : undefined,
              onDelete: () => askDelete([item]),
              hostOrigin: assetOrigin,
            }),
          ),
        )
      } else {
        content = h(
          'table',
          { className: 'dshlib-table' },
          h(
            'thead',
            null,
            h(
              'tr',
              null,
              h(
                'th',
                { className: 'dshlib-check-cell' },
                h('input', {
                  type: 'checkbox',
                  className: 'dshlib-check',
                  checked: items.length > 0 && items.every((entry) => isSelected(entry)),
                  'aria-label': tt('batchSelectAll'),
                  onChange: (event) => (event.target.checked ? selectAllCurrent() : setSelected(new Map())),
                }),
              ),
              h(SortableTh, { tt, sort, direction, field: 'name', label: tt('columnName'), onSort: applySort }),
              h(SortableTh, { tt, sort, direction, field: 'size', label: tt('columnSize'), width: 96, align: 'right', onSort: applySort }),
              h('th', { style: { width: 104 } }, tt('columnSource')),
              h(SortableTh, { tt, sort, direction, field: 'date', label: tt('columnDate'), width: 150, align: 'right', onSort: applySort }),
              h('th', { style: { width: 56, textAlign: 'right' } }, tt('columnActions')),
            ),
          ),
          h(
            'tbody',
            null,
            ...items.map((item, index) =>
              h(
                'tr',
                { key: item.id, className: 'dshlib-row-open', onClick: () => setPreviewItem(item) },
                h(
                  'td',
                  { className: 'dshlib-check-cell', onClick: (event) => event.stopPropagation() },
                  h('input', {
                    type: 'checkbox',
                    className: 'dshlib-check',
                    checked: isSelected(item),
                    'aria-label': tt('selectFile', { name: item.name }),
                    onChange: (event) => toggleSelection(item, index, event.nativeEvent?.shiftKey === true),
                  }),
                ),
                h(
                  'td',
                  null,
                  h(
                    'div',
                    { className: 'dshlib-name-cell' },
                    h(FileBadge, { item, size: 18 }),
                    h('span', { title: item.name }, item.name),
                    item.broken ? h('span', { className: 'dshlib-badge dshlib-broken' }, tt('broken')) : null,
                  ),
                ),
                h('td', { className: 'dshlib-num', style: { textAlign: 'right' } }, formatSize(item.bytes)),
                h('td', { className: 'dshlib-num' }, item.source === 'agent-deliverable' ? tt('sourceAgentShort') : tt('sourceUserShort')),
                h('td', { className: 'dshlib-num', style: { textAlign: 'right' } }, formatDate(item.displayDate)),
                h(
                  'td',
                  {
                    style: { position: 'relative', textAlign: 'right' },
                    onClick: (event) => event.stopPropagation(),
                  },
                  h(RowMenu, {
                    open: menuFor === item.id,
                    onToggle: () => setMenuFor((current) => (current === item.id ? null : item.id)),
                    onOpen: () => setPreviewItem(item),
                    onDownload: () => downloadItem(item),
                    onFavorite: () => toggleFavorite(item),
                    onMoveFolder:
                      item.favorited === true && collections.length > 0 ? () => openMoveFolder(item) : undefined,
                    onDelete: () => askDelete([item]),
                    tt,
                    item,
                  }),
                ),
              ),
            ),
          ),
        )
      }

      const activeUploads = uploads.length > 0

      return h(
        'div',
        { className: 'dshlib-root', ref: rootRef },
        h(
          'div',
          { className: 'dshlib-main' },
        h(
          'div',
          { className: 'dshlib-header' },
          h('h1', { className: 'dshlib-title' }, tt('title')),
          h('span', { className: 'dshlib-sub' }, state === null ? '' : tt('count', { count: state.files })),
          favoritesFolderView
            ? null
            : h(
            'div',
            { style: { display: 'flex', gap: 2 } },
            h(
              'button',
              {
                type: 'button',
                className: 'dshlib-icon-btn',
                'aria-label': tt('viewGrid'),
                'aria-pressed': view === 'grid',
                onClick: () => setView('grid'),
              },
              h(
                'svg',
                { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
                h('rect', { x: 4, y: 4, width: 7, height: 7, rx: 1 }),
                h('rect', { x: 13, y: 4, width: 7, height: 7, rx: 1 }),
                h('rect', { x: 4, y: 13, width: 7, height: 7, rx: 1 }),
                h('rect', { x: 13, y: 13, width: 7, height: 7, rx: 1 }),
              ),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshlib-icon-btn',
                'aria-label': tt('viewList'),
                'aria-pressed': view === 'list',
                onClick: () => setView('list'),
              },
              h(
                'svg',
                { viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 },
                h('path', { d: 'M4 7h16M4 12h16M4 17h16' }),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dshlib-search' },
            h(
              'span',
              { className: 'dshlib-search-icon', 'aria-hidden': true },
              h(
                'svg',
                { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
                h('circle', { cx: 11, cy: 11, r: 6 }),
                h('path', { d: 'M15.5 15.5 20 20' }),
              ),
            ),
            h('input', {
              type: 'search',
              value: query,
              placeholder: tt('search'),
              'aria-label': tt('search'),
              onChange: (event) => setQuery(event.target.value),
            }),
            query === ''
              ? null
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshlib-search-clear',
                    'aria-label': tt('clearSearch'),
                    onClick: () => setQuery(''),
                  },
                  '×',
                ),
          ),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn dshlib-btn-primary', onClick: () => fileInput.current?.click() },
            tt('upload'),
          ),
          h('input', {
            ref: fileInput,
            type: 'file',
            multiple: true,
            hidden: true,
            onChange: onFilesPicked,
          }),
        ),
        state !== null && state.indexError !== null && state.indexError !== undefined
          ? h(
              'div',
              { className: 'dshlib-banner', role: 'status' },
              h('span', null, tt('indexBroken')),
              h('button', { type: 'button', className: 'dshlib-btn', onClick: () => void rebuild() }, tt('rebuild')),
            )
          : null,
        state !== null && Array.isArray(state.failures) && state.failures.length > 0
          ? h(
              'div',
              { className: 'dshlib-banner', role: 'status' },
              h('span', null, tt('failureBanner', { count: state.failures.length })),
              h('button', { type: 'button', className: 'dshlib-btn', onClick: () => void retryFailures() }, tt('failureRetry')),
            )
          : null,
        h(
          'div',
          { className: 'dshlib-nav', role: 'toolbar' },
          ...categories.map(([value, key]) =>
            h(
              'button',
              {
                key: value,
                type: 'button',
                className: 'dshlib-chip',
                'aria-pressed': category === value,
                onClick: () => setCategory(value),
              },
              tt(key),
            ),
          ),
          h('span', { className: 'dshlib-divider', 'aria-hidden': true }),
          favoritesFolderView ? null : h(SourceMenu, { tt, source, onChange: setSource }),
        ),
        category === 'favorite'
          ? h(
              'div',
              { className: 'dshlib-collections', role: 'toolbar', 'aria-label': tt('categoryFavorite') },
              favoritesRoot
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      className: 'dshlib-btn',
                      onClick: () => setCollectionFilter(null),
                    },
                    `‹ ${tt('back')}`,
                  ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshlib-chip dshlib-chip-add',
                  onClick: () => setCollectionDialog({ mode: 'create' }),
                },
                `＋ ${tt('newFolder')}`,
              ),
              favoritesRoot
                ? null
                : h('span', { className: 'dshlib-collections-current', title: currentFolderName }, currentFolderName),
            )
          : null,        h(
          'div',
          {
            ref: bodyRef,
            className: 'dshlib-body',
            onDragOver: (event) => event.preventDefault(),
            onDrop,
            onScroll: (event) => {
              libraryViewMemory.scrollTop = event.currentTarget.scrollTop
            },
          },
          activeUploads
            ? h(
                'div',
                { className: 'dshlib-grid', style: { marginBottom: 12 } },
                ...uploads.map((item) =>
                  h(
                    'div',
                    { key: item.id, className: 'dshlib-card', role: 'status' },
                    h(
                      'div',
                      { className: 'dshlib-card-name' },
                      h(FileGlyph, { kind: 'other', size: 16 }),
                      h('span', { title: item.name }, item.name),
                    ),
                    item.status === 'error'
                      ? h('div', { className: 'dshlib-card-meta dshlib-broken' }, tt('uploadFailed', { reason: item.reason }))
                      : h(
                          'div',
                          { className: 'dshlib-card-meta' },
                          tt(item.status === 'queued' ? 'uploadQueued' : 'uploadingShort'),
                          h('span', null, `${item.progress}%`),
                        ),
                    item.status === 'error'
                      ? null
                      : h('div', { className: 'dshlib-progress' }, h('i', { style: { width: `${item.progress}%` } })),
                    h(
                      'div',
                      { style: { display: 'flex', gap: 6 } },
                      item.status === 'error'
                        ? h(
                            'button',
                            { type: 'button', className: 'dshlib-btn dshlib-btn-ghost', onClick: () => retryUpload(item.id) },
                            tt('retry'),
                          )
                        : null,
                      h(
                        'button',
                        {
                          type: 'button',
                          className: 'dshlib-btn dshlib-btn-ghost',
                          onClick: () => cancelUpload(item.id),
                        },
                        tt('uploadCancel'),
                      ),
                    ),
                  ),
                ),
              )
            : null,
          content,
          h('div', { ref: sentinel, className: 'dshlib-sentinel' }),
        ),
        selectionCount === 0
          ? null
          : h(
              'div',
              { className: 'dshlib-batch', role: 'toolbar', 'aria-label': tt('batchBar') },
              h('span', { className: 'dshlib-batch-count' }, tt('batchSelected', { count: selectionCount })),
              h('button', { type: 'button', className: 'dshlib-btn', onClick: selectAllCurrent }, tt('batchSelectAll')),
              h('button', { type: 'button', className: 'dshlib-btn', onClick: () => setSelected(new Map()) }, tt('batchClearAll')),
              h('button', { type: 'button', className: 'dshlib-btn', onClick: () => void downloadSelection() }, tt('batchDownload')),
              collections.length === 0
                ? null
                : h('button', { type: 'button', className: 'dshlib-btn', onClick: batchMove }, tt('moveToFolder')),
              h('button', { type: 'button', className: 'dshlib-btn', onClick: sendSelectionToChat }, tt('batchSend')),
              h(
                'button',
                { type: 'button', className: 'dshlib-btn dshlib-btn-danger', onClick: () => askDelete(selectedRecords()) },
                tt('delete'),
              ),
            ),
        ),
        previewItem === null
          ? null
          : h(
              'div',
              {
                className: 'dshlib-drawer',
                style: previewWidth > 0 ? { width: `${previewWidth}px` } : undefined,
                'data-resizing': resizing ? 'true' : undefined,
              },
              h('div', {
                className: 'dshlib-drawer-handle',
                role: 'separator',
                'aria-orientation': 'vertical',
                'aria-label': tt('resizePreview'),
                'aria-valuemin': 320,
                'aria-valuenow': previewWidth,
                tabIndex: 0,
                title: tt('resizePreview'),
                onPointerDown: startPreviewResize,
                onDoubleClick: resetPreviewWidth,
                onKeyDown: (event) => {
                  if (event.key === 'ArrowLeft') {
                    event.preventDefault()
                    nudgePreviewWidth(24)
                  } else if (event.key === 'ArrowRight') {
                    event.preventDefault()
                    nudgePreviewWidth(-24)
                  }
                },
              }),
              h(PreviewContent, {
                address: previewItem.address,
                t,
                onClose: () => setPreviewItem(null),
                describeOrigin,
                jumpSource,
              }),
            ),
        collectionDialog === null
          ? null
          : h(CollectionDialog, {
              tt,
              mode: collectionDialog.mode,
              initial: collectionDialog.name,
              onSubmit: submitCollection,
              onCancel: () => setCollectionDialog(null),
            }),
        deletingCollection === null
          ? null
          : h(CollectionDeleteDialog, {
              tt,
              collection: deletingCollection,
              onCancel: () => setDeletingCollection(null),
              onConfirm: () => void performDeleteCollection(),
            }),
        favoriteDialog === null
          ? null
          : h(FavoriteDialog, {
              tt,
              records: favoriteDialog.records,
              mode: favoriteDialog.mode,
              collections,
              onPick: (collectionId) => void applyFavorite(favoriteDialog.records, collectionId),
              onRemove: () => void removeFavorite(favoriteDialog.records),
              onCancel: () => setFavoriteDialog(null),
            }),        confirming === null
          ? null
          : h(ConfirmDelete, {
              tt,
              records: confirming.records,
              bytes: confirming.bytes,
              onCancel: () => setConfirming(null),
              onConfirm: () => void performDelete(),
            }),
        toast === null ? null : h('div', { className: 'dshlib-toast', role: 'status' }, toast),
      )
    }

    function Card({ item, tt, menuOpen, onToggleMenu, onOpen, onDownload, onFavorite, onMoveFolder, onDelete, hostOrigin, checked, onToggleSelect }) {
      return h(
        'div',
        {
          className: 'dshlib-card dshlib-card-open',
          role: 'button',
          tabIndex: 0,
          title: item.name,
          'aria-pressed': checked === true,
          onClick: onOpen,
          onKeyDown: (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            onOpen()
          },
        },
        h(
          'span',
          {
            className: 'dshlib-card-check',
            'data-on': checked === true ? 'true' : 'false',
            // The checkbox owns the toggle; the wrapper only keeps the click off the card.
            onClick: (event) => event.stopPropagation(),
            onKeyDown: (event) => event.stopPropagation(),
          },
          h('input', {
            type: 'checkbox',
            className: 'dshlib-check',
            checked: checked === true,
            'aria-label': tt('selectFile', { name: item.name }),
            onClick: (event) => event.stopPropagation(),
            onChange: (event) => {
              if (onToggleSelect !== undefined) onToggleSelect(event.nativeEvent?.shiftKey === true)
            },
          }),
        ),
        h(
          'div',
          { className: 'dshlib-card-thumb' },
          item.kind === 'image'
            ? h(ThumbImage, { item, origin: hostOrigin })
            : h(FileBadge, { item, size: 34 }),
        ),
        h(
          'div',
          { className: 'dshlib-card-name' },
          h('span', { title: item.name }, item.name),
          item.broken ? h('span', { className: 'dshlib-badge dshlib-broken' }, tt('broken')) : null,
        ),
        h(
          'div',
          { className: 'dshlib-card-meta' },
          h('span', null, formatSize(item.bytes)),
          h('span', null, formatDate(item.displayDate)),
        ),
        h(
          'div',
          {
            style: { position: 'absolute', top: 6, right: 6 },
            onClick: (event) => event.stopPropagation(),
            onKeyDown: (event) => event.stopPropagation(),
          },
          h(RowMenu, { open: menuOpen, onToggle: onToggleMenu, onOpen, onDownload, onFavorite, onMoveFolder, onDelete, tt, item }),
        ),
      )
    }

    function SortableTh({ tt, sort, direction, field, label, width, align = 'left', onSort }) {
      const active = sort === field
      const next = active ? (direction === 'asc' ? 'desc' : 'asc') : field === 'name' ? 'asc' : 'desc'
      return h(
        'th',
        {
          style: { width, textAlign: align },
          'aria-sort': active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none',
        },
        h(
          'button',
          {
            type: 'button',
            className: 'dshlib-th-sort',
            title: `${label} · ${next === 'asc' ? tt('sortAsc') : tt('sortDesc')}`,
            onClick: () => onSort(field),
          },
          h('span', null, label),
          h(
            'span',
            { className: active ? 'dshlib-sort-glyph dshlib-sort-active' : 'dshlib-sort-glyph', 'aria-hidden': true },
            active ? (direction === 'asc' ? '↑' : '↓') : '↕',
          ),
        ),
      )
    }
    function RowMenu({ open, onToggle, onOpen, onDownload, onFavorite, onMoveFolder, onDelete, tt, item }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (ref.current !== null && !ref.current.contains(event.target)) onToggle()
        }
        const onKey = (event) => {
          if (event.key === 'Escape') onToggle()
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open, onToggle])
      return h(
        'div',
        { ref, style: { position: 'relative' } },
        h(
          'button',
          {
            type: 'button',
            className: 'dshlib-icon-btn',
            'aria-label': tt('more'),
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            onClick: onToggle,
          },
          '⋯',
        ),
        open
          ? h(
              'div',
              { className: 'dshlib-menu', role: 'menu' },
              h(
                'button',
                {
                  type: 'button',
                  role: 'menuitem',
                  onClick: () => {
                    if (onOpen !== undefined) onOpen()
                    else onToggle()
                  },
                },
                tt('preview'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  role: 'menuitem',
                  onClick: () => {
                    onDownload()
                    onToggle()
                  },
                },
                tt('download'),
              ),
              onFavorite === undefined
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      role: 'menuitem',
                      onClick: () => {
                        onFavorite()
                        onToggle()
                      },
                    },
                    item !== undefined && item.favorited === true ? tt('unfavorite') : tt('favorite'),
                  ),
              onMoveFolder === undefined
                ? null
                : h(
                    'button',
                    {
                      type: 'button',
                      role: 'menuitem',
                      onClick: () => {
                        onMoveFolder()
                        onToggle()
                      },
                    },
                    tt('moveToFolder'),
                  ),
              h(
                'button',
                {
                  type: 'button',
                  role: 'menuitem',
                  className: 'dshlib-danger',
                  onClick: () => {
                    onDelete()
                    onToggle()
                  },
                },
                tt('delete'),
              ),
            )
          : null,
      )
    }

    function collectionErrorText(tt, code) {
      switch (code) {
        case 'collection-empty':
          return tt('collectionErrorEmpty')
        case 'collection-too-long':
          return tt('collectionErrorLong')
        case 'collection-slash':
          return tt('collectionErrorSlash')
        case 'collection-duplicate':
          return tt('collectionErrorDuplicate')
        default:
          return String(code ?? '')
      }
    }

    /** Source filter as a themed menu button, so its label matches the chips. */
    function SourceMenu({ tt, source, onChange }) {
      const [open, setOpen] = React.useState(false)
      const ref = React.useRef(null)
      const options = [
        ['all', 'sourceAll'],
        ['user', 'sourceUser'],
        ['agent', 'sourceAgent'],
      ]
      const current = options.find(([value]) => value === source) ?? options[0]

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          if (ref.current !== null && !ref.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])

      return h(
        'div',
        { ref, style: { position: 'relative' } },
        h(
          'button',
          {
            type: 'button',
            className: 'dshlib-btn dshlib-source-btn',
            'aria-haspopup': 'menu',
            'aria-expanded': open,
            'aria-label': tt('sourceLabel'),
            onClick: () => setOpen((value) => !value),
          },
          h('span', { style: { color: 'var(--dsw-alias-label-secondary)' } }, `${tt('sourceLabel')}：`),
          h('span', null, tt(current[1])),
          h('span', { 'aria-hidden': true, style: { opacity: 0.6, marginLeft: 2 } }, '▾'),
        ),
        open
          ? h(
              'div',
              { className: 'dshlib-menu', role: 'menu', 'aria-label': tt('sourceLabel') },
              ...options.map(([value, key]) =>
                h(
                  'button',
                  {
                    key: value,
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': source === value,
                    onClick: () => {
                      onChange(value)
                      setOpen(false)
                    },
                  },
                  h('span', { style: { width: 14, flex: 'none' } }, source === value ? '✓' : ''),
                  h('span', null, tt(key)),
                ),
              ),
            )
          : null,
      )
    }
    /** A soft two-tone folder, drawn with its own colours so it reads in both themes. */
    function FolderGlyph({ size = 52 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 64 54',
          width: size,
          height: (size * 54) / 64,
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', {
          d: 'M3 9.5A6.5 6.5 0 0 1 9.5 3h13.2c1.7 0 3.4.7 4.6 1.9L31 8.5h23.5A6.5 6.5 0 0 1 61 15v4H3z',
          fill: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 26%, transparent)',
        }),
        h('path', {
          d: 'M3 17h58v28.5A6.5 6.5 0 0 1 54.5 52h-45A6.5 6.5 0 0 1 3 45.5z',
          fill: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent)',
        }),
        h('path', {
          d: 'M3 17h58',
          stroke: 'color-mix(in srgb, var(--dsw-alias-label-secondary) 32%, transparent)',
          strokeWidth: 1.2,
          fill: 'none',
        }),
      )
    }

    function FolderCard({ tt, folder, onOpen, menuOpen, onToggleMenu, onRename, onDelete, compact }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        if (!menuOpen) return undefined
        const onPointerDown = (event) => {
          if (ref.current !== null && !ref.current.contains(event.target)) onToggleMenu()
        }
        const onKey = (event) => {
          if (event.key === 'Escape') onToggleMenu()
        }
        document.addEventListener('pointerdown', onPointerDown)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('pointerdown', onPointerDown)
          document.removeEventListener('keydown', onKey)
        }
      }, [menuOpen, onToggleMenu])

      // The picker lists folders as rows, matching the file rows below them.
      if (compact === true) {
        return h(
          'button',
          { type: 'button', className: 'dshlib-picker-row', onClick: onOpen, title: folder.name },
          h(FolderGlyph, { size: 20 }),
          h('span', { className: 'dshlib-picker-name' }, folder.name),
          h('span', { className: 'dshlib-picker-meta' }, tt('folderCount', { count: folder.count ?? 0 })),
        )
      }

      return h(
        'div',
        { ref, className: 'dshlib-folder' },
        h(
          'div',
          { className: 'dshlib-folder-head' },
          onRename === undefined
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'dshlib-icon-btn',
                  'aria-label': tt('collectionMenu'),
                  title: tt('collectionMenu'),
                  'aria-haspopup': 'menu',
                  'aria-expanded': menuOpen,
                  onClick: onToggleMenu,
                },
                '⋯',
              ),
        ),
        h(
          'button',
          {
            type: 'button',
            className: 'dshlib-folder-open',
            onClick: onOpen,
            title: folder.name,
          },
          h('span', { className: 'dshlib-folder-art' }, h(FolderGlyph, { size: 48 })),
          h('span', { className: 'dshlib-folder-name' }, folder.name),
          h('span', { className: 'dshlib-folder-count' }, tt('folderCount', { count: folder.count ?? 0 })),
        ),
        menuOpen && onRename !== undefined
          ? h(
              'div',
              { className: 'dshlib-menu dshlib-folder-menu', role: 'menu' },
              h('button', { type: 'button', role: 'menuitem', onClick: onRename }, tt('collectionRename')),
              h('button', { type: 'button', role: 'menuitem', className: 'dshlib-danger', onClick: onDelete }, tt('collectionDelete')),
            )
          : null,
      )
    }    function CollectionDialog({ tt, mode, initial, onSubmit, onCancel }) {
      const [name, setName] = React.useState(initial ?? '')
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const ref = React.useRef(null)

      React.useEffect(() => {
        ref.current?.focus()
        ref.current?.select()
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onCancel])

      const submit = async () => {
        const trimmed = name.trim()
        if (trimmed === '') return setError(tt('collectionErrorEmpty'))
        if (trimmed.length > 40) return setError(tt('collectionErrorLong'))
        if (trimmed.includes('/')) return setError(tt('collectionErrorSlash'))
        setError(null)
        setBusy(true)
        try {
          await onSubmit(trimmed)
        } catch (failure) {
          setError(collectionErrorText(tt, failure?.code))
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'dshlib-overlay', onPointerDown: (event) => event.target === event.currentTarget && onCancel() },
        h(
          'div',
          { className: 'dshlib-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': tt(mode === 'create' ? 'newCollection' : 'collectionRename') },
          h('h2', null, tt(mode === 'create' ? 'newCollection' : 'collectionRename')),
          h(
            'div',
            { className: 'dshlib-field' },
            h('label', { htmlFor: 'dshlib-collection-name' }, tt('collectionName')),
            h('input', {
              id: 'dshlib-collection-name',
              ref,
              value: name,
              maxLength: 80,
              onChange: (event) => {
                setName(event.target.value)
                setError(null)
              },
              onKeyDown: (event) => {
                if (event.key === 'Enter') void submit()
              },
            }),
          ),
          error === null ? null : h('div', { className: 'dshlib-field-error', role: 'status' }, error),
          h(
            'div',
            { className: 'dshlib-dialog-actions', style: { marginTop: 12 } },
            h('button', { type: 'button', className: 'dshlib-btn', onClick: onCancel }, tt('cancel')),
            h(
              'button',
              { type: 'button', className: 'dshlib-btn dshlib-btn-primary', disabled: busy, onClick: () => void submit() },
              tt(mode === 'create' ? 'collectionCreate' : 'collectionRename'),
            ),
          ),
        ),
      )
    }

    function CollectionDeleteDialog({ tt, collection, onCancel, onConfirm }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        ref.current?.focus()
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onCancel])
      return h(
        'div',
        { className: 'dshlib-overlay', onPointerDown: (event) => event.target === event.currentTarget && onCancel() },
        h(
          'div',
          { className: 'dshlib-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': tt('collectionDelete'), ref, tabIndex: -1 },
          h('h2', null, tt('collectionDelete')),
          h('p', null, collection.name),
          h('p', null, tt('collectionDeleteBody', { count: collection.count ?? 0 })),
          h(
            'div',
            { className: 'dshlib-dialog-actions' },
            h('button', { type: 'button', className: 'dshlib-btn', onClick: onCancel }, tt('cancel')),
            h('button', { type: 'button', className: 'dshlib-btn dshlib-danger-solid', onClick: onConfirm }, tt('collectionDelete')),
          ),
        ),
      )
    }

    /** One chooser behind the single "Favorite" action: folder or unfiled. */
    function FavoriteDialog({ tt, records, collections, mode, onPick, onRemove, onCancel }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        ref.current?.focus()
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onCancel])

      const current = records.length === 1 ? records[0].collectionId ?? null : undefined
      const anyFavorited = records.some((record) => record.favorited === true)

      return h(
        'div',
        { className: 'dshlib-overlay', onPointerDown: (event) => event.target === event.currentTarget && onCancel() },
        h(
          'div',
          { className: 'dshlib-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': tt(mode === 'move' ? 'moveToFolder' : 'favoriteTo'), ref, tabIndex: -1 },
          h('h2', null, tt(mode === 'move' ? 'moveToFolder' : 'favoriteTo')),
          h(
            'div',
            { className: 'dshlib-choice-list' },
            h(
              'button',
              { type: 'button', className: 'dshlib-choice', 'aria-pressed': current === null, onClick: () => onPick(null) },
              h('span', { style: { width: 14, flex: 'none' } }, current === null ? '✓' : ''),
              h('span', null, tt('favoritesUnfiled')),
            ),
            ...collections.map((collection) =>
              h(
                'button',
                {
                  key: collection.id,
                  type: 'button',
                  className: 'dshlib-choice',
                  'aria-pressed': current === collection.id,
                  onClick: () => onPick(collection.id),
                },
                h('span', { style: { width: 14, flex: 'none' } }, current === collection.id ? '✓' : ''),
                h('span', null, collection.name),
              ),
            ),
          ),
          h(
            'div',
            { className: 'dshlib-dialog-actions' },
            anyFavorited && mode !== 'move'
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshlib-btn dshlib-btn-danger',
                    style: { marginRight: 'auto' },
                    onClick: () => onRemove(),
                  },
                  tt('favoriteRemove'),
                )
              : null,
            h('button', { type: 'button', className: 'dshlib-btn', onClick: onCancel }, tt('cancel')),
          ),
        ),
      )
    }

    function ConfirmDelete({ tt, records, bytes, onCancel, onConfirm }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        ref.current?.focus()
        const onKey = (event) => {
          if (event.key === 'Escape') onCancel()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [onCancel])
      const names = records.length > 10 ? records.slice(0, 10).map((record) => record.name) : records.map((record) => record.name)
      return h(
        'div',
        { className: 'dshlib-overlay', onPointerDown: (event) => event.target === event.currentTarget && onCancel() },
        h(
          'div',
          { className: 'dshlib-dialog', role: 'dialog', 'aria-modal': true, 'aria-label': tt('deleteTitle'), ref },
          h('h2', null, tt('deleteTitle')),
          h('p', null, tt('deleteBody', { count: records.length, size: formatSize(bytes) })),
          h('ul', null, ...names.map((name) => h('li', { key: name }, name))),
          h('p', null, tt('deleteNote')),
          h(
            'div',
            { className: 'dshlib-dialog-actions' },
            h('button', { type: 'button', className: 'dshlib-btn', onClick: onCancel }, tt('cancel')),
            h('button', { type: 'button', className: 'dshlib-btn dshlib-danger-solid', onClick: onConfirm }, tt('confirmDelete')),
          ),
        ),
      )
    }

    // --- composer attach -----------------------------------------------------

    /**
     * Chat hand-off for the batch bar: the library panel has no composer of its
     * own, so a send request is queued for the last chat that showed one, and the
     * attach button consumes it when that chat is back on screen.
     */
    const chatHandoff = { lastSessionId: null, requests: [] }

    /** Open state of the attach picker; the button and the panel share it. */
    const pickerStore = (() => {
      let open = false
      const listeners = new Set()
      const notify = () => {
        for (const listener of Array.from(listeners)) listener()
      }
      return {
        isOpen: () => open,
        setOpen(next) {
          if (open === next) return
          open = next
          notify()
        },
        toggle() {
          this.setOpen(!open)
        },
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
      }
    })()

    function usePickerOpen() {
      const [, force] = React.useReducer((value) => value + 1, 0)
      React.useEffect(() => pickerStore.subscribe(force), [])
      return pickerStore.isOpen()
    }

    function AttachButton(props) {
      const { t, sessionId, inputActions, attach } = props
      const open = usePickerOpen()

      React.useEffect(() => {
        if (typeof sessionId === 'string') chatHandoff.lastSessionId = sessionId
      }, [sessionId])

      React.useEffect(() => {
        if (typeof sessionId !== 'string' || typeof attach !== 'function') return
        const request = chatHandoff.requests.find((entry) => entry.sessionId === sessionId)
        if (request === undefined) return
        chatHandoff.requests = chatHandoff.requests.filter((entry) => entry !== request)
        void attach(sessionId, request.items, inputActions).catch(() => {
          // A failed hand-off leaves the files in the library, nothing to repair.
        })
      }, [sessionId, attach, inputActions])
      return h(
        'button',
        {
          type: 'button',
          className: 'dshlib-icon-btn dshlib-attach-btn',
          title: t('attachButton'),
          'aria-label': t('attachButton'),
          'aria-expanded': open,
          'aria-haspopup': 'dialog',
          onClick: () => pickerStore.toggle(),
        },
        h(LibraryIcon, { size: 16 }),
      )
    }

    function AttachPicker(props) {
      const { t, sessionId, inputActions, attach } = props
      const open = usePickerOpen()
      const [category, setCategory] = React.useState('all')
      const [query, setQuery] = React.useState('')
      const [debounced, setDebounced] = React.useState('')
      const [items, setItems] = React.useState([])
      const [phase, setPhase] = React.useState('loading')
      const [error, setError] = React.useState(null)
      const [selected, setSelected] = React.useState([])
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [collectionFilter, setCollectionFilter] = React.useState(null)
      const [folders, setFolders] = React.useState([])
      const searchRef = React.useRef(null)

      React.useEffect(() => {
        const timer = setTimeout(() => setDebounced(query.trim()), 200)
        return () => clearTimeout(timer)
      }, [query])

      React.useEffect(() => {
        if (!open) return undefined
        let cancelled = false
        setPhase('loading')

        // Favorites open on the folder list, exactly like the library page.
        if (category === 'favorite' && collectionFilter === null && debounced === '') {
          api('/library/api/state')
            .then((snapshot) => {
              if (cancelled) return
              setFolders([
                { id: 'uncategorized', name: t('favoritesUnfiled'), count: snapshot.unfiled ?? 0 },
                ...(Array.isArray(snapshot.collections)
                  ? snapshot.collections.map((collection) => ({
                      id: collection.id,
                      name: collection.name,
                      count: collection.count ?? 0,
                    }))
                  : []),
              ])
              setItems([])
              setError(null)
              setPhase('ready')
            })
            .catch((failure) => {
              if (cancelled) return
              setError(String(failure?.message ?? failure))
              setPhase('error')
            })
          return () => {
            cancelled = true
          }
        }

        const params = new URLSearchParams({ limit: '60', sort: 'name', direction: 'asc', category })
        if (debounced !== '') params.set('q', debounced)
        if (category === 'favorite') params.set('collectionId', collectionFilter)
        api(`/library/api/files?${params.toString()}`)
          .then((page) => {
            if (cancelled) return
            setItems(page.items)
            setError(null)
            setPhase('ready')
          })
          .catch((failure) => {
            if (cancelled) return
            setError(String(failure?.message ?? failure))
            setPhase('error')
          })
        return () => {
          cancelled = true
        }
      }, [open, category, debounced, collectionFilter])

      React.useEffect(() => {
        setCollectionFilter(null)
      }, [category])

      React.useEffect(() => {
        if (open) return
        setCollectionFilter(null)
      }, [open])

      React.useEffect(() => {
        if (!open) return undefined
        const timer = setTimeout(() => searchRef.current?.focus(), 0)
        return () => clearTimeout(timer)
      }, [open])

      React.useEffect(() => {
        if (open) return
        setSelected([])
        setQuery('')
        setNote(null)
        setBusy(false)
      }, [open])

      React.useEffect(() => {
        if (!open) return undefined
        const onKey = (event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          pickerStore.setOpen(false)
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [open])

      if (!open) return null

      const isSelected = (item) => selected.some((entry) => entry.id === item.id)

      const toggleItem = (item) => {
        setNote(null)
        if (isSelected(item)) {
          setSelected(selected.filter((entry) => entry.id !== item.id))
          return
        }
        if (selected.length >= 20) {
          setNote(t('pickerLimit'))
          return
        }
        setSelected([...selected, item])
      }

      const submit = async () => {
        if (selected.length === 0 || busy) return
        setBusy(true)
        setNote(null)
        try {
          await attach(sessionId, selected, inputActions)
          pickerStore.setOpen(false)
        } catch (failure) {
          setNote(t('pickerFailed', { reason: String(failure?.message ?? failure) }))
          setBusy(false)
        }
      }

      const categories = [
        ['all', 'categoryAll'],
        ['document', 'categoryDocument'],
        ['image', 'categoryImage'],
        ['video', 'categoryVideo'],
        ['audio', 'categoryAudio'],
        ['favorite', 'categoryFavorite'],
      ]

      const favoritesRoot = category === 'favorite' && collectionFilter === null
      // Only a quiet root shows the folder layer; typing searches every favorite.
      const favoritesFolderView = favoritesRoot && debounced === ''

      const currentFolder = folders.find((folder) => folder.id === collectionFilter)

      let list = null
      if (favoritesFolderView && phase === 'loading') {
        list = h('div', { className: 'dshlib-picker-empty' }, h('span', null, t('loading')))
      } else if (favoritesFolderView) {
        list = h(
          'div',
          { className: 'dshlib-picker-folders' },
          ...folders.map((folder) =>
            h(FolderCard, {
              key: folder.id,
              tt: t,
              folder,
              compact: true,
              onOpen: () => setCollectionFilter(folder.id),
            }),
          ),
        )
      } else if (phase === 'loading') {
        list = h('div', { className: 'dshlib-picker-empty' }, h('span', null, t('loading')))
      } else if (phase === 'error') {
        list = h('div', { className: 'dshlib-picker-empty' }, h('strong', null, t('previewFailed')), h('span', null, error))
      } else if (items.length === 0) {
        const empty = debounced !== '' ? t('pickerNoMatch') : t('pickerEmpty')
        list = h(
          'div',
          { className: 'dshlib-picker-empty' },
          h(LibraryIcon, { size: 28 }),
          h('strong', null, empty),
          h('span', null, debounced !== '' ? t('clearSearch') : t('pickerEmptyHint')),
        )
      } else {
        list = items.map((item) =>
          h(
            'button',
            {
              key: item.id,
              type: 'button',
              className: 'dshlib-picker-row',
              'aria-pressed': isSelected(item),
              onClick: () => toggleItem(item),
            },
            h('span', { className: 'dshlib-picker-check', 'aria-hidden': true }, isSelected(item) ? '✓' : ''),
            h(FileBadge, { item, size: 18 }),
            h('span', { className: 'dshlib-picker-name', title: item.name }, item.name),
            h('span', { className: 'dshlib-picker-meta' }, formatSize(item.bytes)),
          ),
        )
      }

      return h(
        'div',
        {
          className: 'dshlib-picker-backdrop',
          onPointerDown: (event) => {
            if (event.target === event.currentTarget) pickerStore.setOpen(false)
          },
        },
        h(
          'div',
          { className: 'dshlib-picker', role: 'dialog', 'aria-modal': true, 'aria-label': t('pickerTitle') },
          h(
            'div',
            { className: 'dshlib-picker-head' },
            h('h2', null, t('pickerTitle')),
            h(
              'button',
              {
                type: 'button',
                className: 'dshlib-icon-btn',
                'aria-label': t('cancel'),
                title: t('cancel'),
                onClick: () => pickerStore.setOpen(false),
              },
              '×',
            ),
          ),
          h(
            'div',
            { className: 'dshlib-picker-tools' },
            h(
              'div',
              { className: 'dshlib-search' },
              h(
                'span',
                { className: 'dshlib-search-icon', 'aria-hidden': true },
                h(
                  'svg',
                  { viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 1.8 },
                  h('circle', { cx: 11, cy: 11, r: 6 }),
                  h('path', { d: 'M15.5 15.5 20 20' }),
                ),
              ),
              h('input', {
                ref: searchRef,
                type: 'search',
                value: query,
                placeholder: t('pickerSearch'),
                'aria-label': t('pickerSearch'),
                onChange: (event) => setQuery(event.target.value),
              }),
            ),
          ),
          h(
            'div',
            { className: 'dshlib-picker-chips' },
            ...categories.map(([value, key]) =>
              h(
                'button',
                {
                  key: value,
                  type: 'button',
                  className: 'dshlib-chip',
                  'aria-pressed': category === value,
                  onClick: () => setCategory(value),
                },
                t(key),
              ),
            ),
          ),
          category === 'favorite' && collectionFilter !== null
            ? h(
                'div',
                { className: 'dshlib-picker-back' },
                h(
                  'button',
                  { type: 'button', className: 'dshlib-btn', onClick: () => setCollectionFilter(null) },
                  `‹ ${t('back')}`,
                ),
                h('span', { className: 'dshlib-picker-meta' }, currentFolder === undefined ? '' : currentFolder.name),
              )
            : null,
          h('div', { className: 'dshlib-picker-list' }, ...(Array.isArray(list) ? list : [list])),
          note === null ? null : h('div', { className: 'dshlib-picker-note', role: 'status' }, note),
          h(
            'div',
            { className: 'dshlib-picker-foot' },
            h('span', { className: 'dshlib-picker-count' }, t('pickerSelected', { count: selected.length })),
            h(
              'button',
              { type: 'button', className: 'dshlib-btn', onClick: () => pickerStore.setOpen(false) },
              t('cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshlib-btn dshlib-btn-primary',
                disabled: selected.length === 0 || busy,
                onClick: () => void submit(),
              },
              busy ? t('pickerAdding') : t('pickerAdd'),
            ),
          ),
        ),
      )
    }
    // --- preview -------------------------------------------------------------

    const ICON_PATHS = {
      download: 'M12 4v10M12 14l4-4M12 14l-4-4M5 18h14',
      star: 'M12 4.6l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1L4.5 10l5.2-.8z',
      external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
      trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
      refresh: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4',
    }

    function PreviewIcon({ name, size = 15 }) {
      return h(
        'svg',
        {
          viewBox: '0 0 24 24',
          width: size,
          height: size,
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', { d: ICON_PATHS[name] ?? ICON_PATHS.external }),
      )
    }

    function PreviewFallback({ kind, title, body, meta, actions }) {
      return h(
        'div',
        { className: 'dshlib-preview-fallback' },
        h(FileGlyph, { kind, size: 40 }),
        h('strong', null, title),
        body === undefined || body === '' ? null : h('span', null, body),
        meta === undefined || meta.length === 0
          ? null
          : h('div', { className: 'dshlib-preview-meta' }, ...meta.map((entry, index) => h('span', { key: index }, entry))),
        h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' } }, ...actions),
      )
    }

    /** The right-Sidebar tab body: reads its file from the tab record. */
    function PreviewBody(props) {
      const { useTabInfo, t, closeTab } = props
      const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined
      const tab = info === undefined || info === null ? undefined : info.tab
      const address = tab === undefined ? undefined : tab.contentId ?? tab.address
      return h(PreviewContent, { address, t, tab, closeTab, describeOrigin: props.describeOrigin, jumpSource: props.jumpSource })
    }

    /**
     * One library file's preview. Shared by the right-Sidebar tab and the
     * in-page drawer the Library panel opens, so both render identically.
     */
    function PreviewContent(props) {
      const { address, t, tab, closeTab, onClose, describeOrigin, jumpSource } = props
      const tt = (key, params) => t(key, params)

      const [state, setState] = React.useState({ phase: 'loading' })
      const [zoom, setZoom] = React.useState('fit')
      const [wrap, setWrap] = React.useState(true)
      const [source, setSource] = React.useState(false)
      const [frameState, setFrameState] = React.useState('pending')
      const [lightbox, setLightbox] = React.useState(false)
      React.useEffect(() => {
        if (state.phase !== 'ready' || state.payload?.renderer !== 'html' || source === true) return undefined
        setFrameState('pending')
        const timer = setTimeout(() => {
          setFrameState((current) => (current === 'loaded' ? current : 'blocked'))
        }, 2000)
        return () => clearTimeout(timer)
      }, [state.phase, state.payload?.renderer, state.payload?.item?.id, source])
      const [confirming, setConfirming] = React.useState(false)
      const [toast, setToast] = React.useState(null)

      const load = React.useCallback(async () => {
        if (address === undefined) {
          setState({ phase: 'error', message: 'no address' })
          return
        }
        setState({ phase: 'loading' })
        try {
          const [payload, origin] = await Promise.all([
            api(`/library/api/preview?address=${encodeURIComponent(address)}`),
            resolveHost(),
          ])
          setState({ phase: 'ready', payload, origin })
        } catch (error) {
          setState({ phase: 'error', message: String(error?.message ?? error) })
        }
      }, [address])

      React.useEffect(() => {
        void load()
      }, [load])

      React.useEffect(() => {
        if (toast === null) return undefined
        const timer = setTimeout(() => setToast(null), 3200)
        return () => clearTimeout(timer)
      }, [toast])

      const payload = state.phase === 'ready' ? state.payload : undefined
      const item = payload === undefined ? undefined : payload.item
      const origin = state.phase === 'ready' ? state.origin : ''
      const parsed = parseLibraryAddress(address)

      const doJump = async () => {
        if (typeof jumpSource !== 'function' || item === undefined) return
        const outcome = await jumpSource(item.origin)
        if (outcome?.ok === true) return
        setToast(
          tt(
            outcome?.code === 'workspace-missing'
              ? 'sourceWorkspaceGone'
              : outcome?.code === 'workspace-moved'
                ? 'sourceWorkspaceMoved'
                : 'sourceSessionGone',
          ),
        )
      }

      const doDownload = async () => {
        if (item === undefined) return
        try {
          const host = await resolveHost()
          const response = await fetch(`${host}/library/download/${encodeURIComponent(item.id)}`, {
            cache: 'no-store',
            mode: 'cors',
          })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = item.name
          anchor.rel = 'noopener'
          document.body.appendChild(anchor)
          anchor.click()
          anchor.remove()
          setTimeout(() => URL.revokeObjectURL(url), 4000)
        } catch (error) {
          setToast(tt('actionFailed', { reason: String(error?.message ?? error) }))
        }
      }

      const doOpenInSystem = async () => {
        if (item === undefined) return
        try {
          await api('/library/api/open', { method: 'POST', body: { id: item.id } })
        } catch (error) {
          setToast(tt('openFailed'))
        }
      }

      const doToggleFavorite = async () => {
        if (item === undefined) return
        const next = item.favorited !== true
        try {
          await api('/library/api/files', { method: 'PATCH', body: { ids: [item.id], favorited: next } })
          setState((current) => ({
            ...current,
            payload: { ...current.payload, item: { ...current.payload.item, favorited: next } },
          }))
          libraryChanged.emit()
          setToast(tt(next ? 'favoritedToast' : 'unfavoritedToast'))
        } catch (error) {
          setToast(tt('actionFailed', { reason: String(error?.message ?? error) }))
        }
      }

      const doDelete = async () => {
        if (item === undefined) return
        setConfirming(false)
        try {
          await api('/library/api/files', { method: 'DELETE', body: { ids: [item.id] } })
          libraryChanged.emit()
          if (typeof onClose === 'function') onClose()
          else if (typeof closeTab === 'function' && tab !== undefined) closeTab(tab.id)
        } catch (error) {
          setToast(tt('actionFailed', { reason: String(error?.message ?? error) }))
        }
      }

      const title = item === undefined ? parsed === null || parsed.name === '' ? tt('preview') : parsed.name : item.name
      const pathLabel = item === undefined ? '' : `${payload.root ?? ''}${payload.root ? '\\' : ''}${String(item.blob ?? '').replace(/\//g, '\\')}`

      const header = h(
        'div',
        { className: 'dshlib-preview-head' },
        h('span', { className: 'dshlib-preview-title', title }, title),
        h('span', { className: 'dshlib-preview-path', title: pathLabel }, pathLabel),
        h(
          'div',
          { className: 'dshlib-preview-controls' },
          payload === undefined
            ? null
            : payload.renderer === 'image'
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshlib-btn',
                    'aria-pressed': zoom === 'actual',
                    onClick: () => setZoom((current) => (current === 'fit' ? 'actual' : 'fit')),
                  },
                  zoom === 'fit' ? tt('fitWidth') : tt('actualSize'),
                )
              : null,
          payload !== undefined && (payload.renderer === 'markdown' || payload.renderer === 'html')
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dshlib-btn',
                  'aria-pressed': source,
                  onClick: () => setSource((current) => !current),
                },
                source ? tt('sourceView') : tt('rendered'),
              )
            : null,
          payload !== undefined && (payload.renderer === 'text' || payload.renderer === 'code')
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dshlib-btn',
                  'aria-pressed': wrap,
                  onClick: () => setWrap((current) => !current),
                },
                tt('wrapOn'),
              )
            : null,
          payload === undefined
            ? null
            : h(
                'div',
                { style: { display: 'flex', gap: 1 } },
                h(
                  'button',
                  { type: 'button', className: 'dshlib-icon-btn', title: tt('download'), 'aria-label': tt('download'), onClick: () => void doDownload() },
                  h(PreviewIcon, { name: 'download' }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshlib-icon-btn',
                    title: item !== undefined && item.favorited === true ? tt('unfavorite') : tt('favorite'),
                    'aria-label': item !== undefined && item.favorited === true ? tt('unfavorite') : tt('favorite'),
                    'aria-pressed': item !== undefined && item.favorited === true,
                    style: item !== undefined && item.favorited === true ? { color: 'var(--dsw-alias-brand-primary, var(--dsw-alias-label-primary))' } : undefined,
                    onClick: () => void doToggleFavorite(),
                  },
                  h(PreviewIcon, { name: 'star' }),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dshlib-icon-btn', title: tt('openInSystem'), 'aria-label': tt('openInSystem'), onClick: () => void doOpenInSystem() },
                  h(PreviewIcon, { name: 'external' }),
                ),
                h(
                  'button',
                  { type: 'button', className: 'dshlib-icon-btn', title: tt('delete'), 'aria-label': tt('delete'), onClick: () => setConfirming(true) },
                  h(PreviewIcon, { name: 'trash' }),
                ),
              ),
          onClose === undefined
            ? null
            : h(
                'button',
                { type: 'button', className: 'dshlib-icon-btn', title: tt('cancel'), 'aria-label': tt('cancel'), onClick: onClose },
                '×',
              ),
        ),
      )

      const sourceOrigin = item === undefined ? null : item.origin ?? null
      const sourceStrip =
        sourceOrigin === null || sourceOrigin === undefined
          ? null
          : h(
              'div',
              { className: 'dshlib-origin' },
              h('span', null, tt('originLabel')),
              h(
                'span',
                { className: 'dshlib-origin-value', title: sourceOrigin.pathAtCapture ?? '' },
                typeof describeOrigin === 'function' ? describeOrigin(sourceOrigin) : '',
                payload !== undefined && payload.originFileExists === false
                  ? h('span', { className: 'dshlib-origin-gone' }, ` · ${tt('originGone')}`)
                  : null,
              ),
              h(
                'button',
                { type: 'button', className: 'dshlib-btn', onClick: () => void doJump() },
                tt('viewSource'),
              ),
            )

      let body = null
      if (state.phase === 'loading') {
        body = h('div', { className: 'dshlib-preview-fallback' }, h('span', null, tt('previewLoading')))
      } else if (state.phase === 'error') {
        body = h(
          'div',
          { className: 'dshlib-preview-fallback' },
          h('strong', null, tt('previewFailed')),
          h('span', null, state.message),
          h(
            'button',
            { type: 'button', className: 'dshlib-btn', onClick: () => void load() },
            h(PreviewIcon, { name: 'refresh' }),
            tt('retry'),
          ),
        )
      } else {
        const renderer = payload.renderer
        const blob = `${origin}${payload.media.blob}`
        const meta = item === undefined ? [] : [formatSize(item.bytes), formatDate(item.displayDate)]

        if (renderer === 'missing') {
          body = h(PreviewFallback, {
            kind: 'other',
            title: tt('missingTitle'),
            body: tt('missingBody'),
            meta,
            actions: [
              h('button', { key: 'delete', type: 'button', className: 'dshlib-btn dshlib-btn-danger', onClick: () => setConfirming(true) }, tt('deleteRecord')),
            ],
          })
        } else if (renderer === 'image') {
          body = h('img', {
            className: zoom === 'fit' ? 'dshlib-preview-image dshlib-zoomable' : 'dshlib-preview-image dshlib-actual dshlib-zoomable',
            src: blob,
            alt: item === undefined ? '' : item.name,
            title: tt('viewLarge'),
            role: 'button',
            tabIndex: 0,
            onClick: () => setLightbox(true),
            onKeyDown: (event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              setLightbox(true)
            },
            onError: () => setState((current) => ({ ...current, payload: { ...current.payload, renderer: 'corrupted' } })),
          })
        } else if (renderer === 'pdf' || renderer === 'office') {
          const converted = renderer === 'office'
          if (converted && payload.officeAvailable !== true) {
            body = h(PreviewFallback, {
              kind: 'document',
              title: tt('noEngineTitle'),
              body: tt('noEngineBody'),
              meta,
              actions: [
                h('button', { key: 'download', type: 'button', className: 'dshlib-btn dshlib-btn-primary', onClick: () => void doDownload() }, tt('download')),
                h('button', { key: 'open', type: 'button', className: 'dshlib-btn', onClick: () => void doOpenInSystem() }, tt('openInSystem')),
              ],
            })
          } else {
            const frameUrl = converted ? `${origin}/library/render/${encodeURIComponent(item.id)}` : blob
            const hint = pdfViewerLikely()
              ? null
              : h(
                  'div',
                  { className: 'dshlib-preview-hint' },
                  h('span', null, tt('pdfHint')),
                  h('button', { type: 'button', className: 'dshlib-btn', onClick: () => void doDownload() }, tt('download')),
                )
            body = h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 } },
              hint,
              h('iframe', {
                className: 'dshlib-preview-frame',
                src: frameUrl,
                title: item === undefined ? tt('preview') : item.name,
                style: { flex: 1, minHeight: 0 },
              }),
            )
          }
        } else if (renderer === 'markdown') {
          body = source
            ? h('pre', { className: 'dshlib-pre dshlib-wrap' }, payload.text ?? '')
            : h('div', { className: 'dshlib-md', dangerouslySetInnerHTML: { __html: payload.html ?? '' } })
        } else if (renderer === 'html') {
          // Rendered by default (like the conversation does): a srcdoc frame keeps the
          // document local, and the meta policy inside it forbids network access.
          body =
            source === true
              ? h(
                  'pre',
                  { className: wrap ? 'dshlib-pre dshlib-wrap' : 'dshlib-pre' },
                  payload.text ?? '',
                )
              : h('iframe', {
                  className: 'dshlib-preview-frame',
                  srcDoc: withSandboxPolicy(payload.text ?? ''),
                  sandbox: 'allow-scripts',
                  referrerPolicy: 'no-referrer',
                  title: item.name,
                  onLoad: () => setFrameState('loaded'),
                })
        } else if (renderer === 'code' || renderer === 'text') {
          body = h(
            'pre',
            { className: wrap ? 'dshlib-pre dshlib-wrap' : 'dshlib-pre', style: renderer === 'text' ? { whiteSpace: wrap ? 'pre-wrap' : 'pre' } : undefined },
            payload.text ?? '',
          )
        } else if (renderer === 'audio') {
          body = h(
            'div',
            { style: { width: '100%', padding: 16 } },
            h('audio', { className: 'dshlib-preview-audio', controls: true, src: blob }),
          )
        } else if (renderer === 'video') {
          body = h('video', { className: 'dshlib-preview-image', controls: true, src: blob })
        } else if (renderer === 'corrupted') {
          body = h(PreviewFallback, {
            kind: 'other',
            title: tt('corruptedTitle'),
            meta,
            actions: [
              h('button', { key: 'download', type: 'button', className: 'dshlib-btn', onClick: () => void doDownload() }, tt('download')),
            ],
          })
        } else {
          body = h(PreviewFallback, {
            kind: item === undefined ? 'other' : item.kind,
            title: payload.reason === 'too-large' ? tt('tooLargeTitle') : tt('unsupportedTitle'),
            body: payload.reason === 'too-large' ? tt('tooLargeBody') : tt('unsupportedBody'),
            meta,
            actions: [
              h('button', { key: 'download', type: 'button', className: 'dshlib-btn dshlib-btn-primary', onClick: () => void doDownload() }, tt('download')),
              h('button', { key: 'open', type: 'button', className: 'dshlib-btn', onClick: () => void doOpenInSystem() }, tt('openInSystem')),
            ],
          })
        }
      }

      return h(
        'div',
        { className: 'dshlib-preview', style: { position: 'relative' } },
        header,
        sourceStrip,
        payload !== undefined && payload.renderer === 'html' && source !== true && frameState === 'blocked'
          ? h(
              'div',
              { className: 'dshlib-preview-fallback', style: { flex: 'none' } },
              h('span', null, tt('htmlBlockedHint')),
              h(
                'button',
                { type: 'button', className: 'dshlib-btn', onClick: () => setSource(true) },
                tt('sourceView'),
              ),
            )
          : null,
        h('div', { className: 'dshlib-preview-body' }, body),
        lightbox && item !== undefined && payload !== undefined && payload.renderer === 'image'
          ? h(ImageLightbox, {
              key: `${item.id}-${item.version ?? ''}`,
              tt,
              item,
              src: `${origin}${payload.media.blob}`,
              onClose: () => setLightbox(false),
              onDownload: () => void doDownload(),
              onDelete: () => {
                setLightbox(false)
                setConfirming(true)
              },
            })
          : null,
        toast === null ? null : h('div', { className: 'dshlib-preview-toast', role: 'status' }, toast),
        confirming && item !== undefined
          ? h(ConfirmDelete, {
              tt,
              records: [item],
              bytes: (item.refs ?? 1) <= 1 ? item.bytes : 0,
              onCancel: () => setConfirming(false),
              onConfirm: () => void doDelete(),
            })
          : null,
      )
    }
    function LibrarySettings(props) {
      const { t } = props
      const tt = (key, params) => t(key, params)
      const [state, setState] = React.useState(null)
      const [target, setTarget] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState(null)
      const [error, setError] = React.useState(null)

      const load = React.useCallback(async () => {
        try {
          setState(await api('/library/api/state'))
          setError(null)
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const migrate = async () => {
        if (busy || target.trim() === '') return
        setBusy(true)
        setError(null)
        setNote(null)
        try {
          const result = await api('/library/api/migrate', { method: 'POST', body: { root: target.trim() } })
          setTarget('')
          setNote(tt('settingsMigrateDone', { root: result.root }))
          await load()
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      const rebuild = async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        setNote(null)
        try {
          await api('/library/api/rebuild', { method: 'POST' })
          await load()
        } catch (failure) {
          setError(String(failure?.message ?? failure))
        } finally {
          setBusy(false)
        }
      }

      return h(
        'div',
        { className: 'dshlib-settings' },
        h('h3', null, tt('settingsTitle')),
        h(
          'section',
          null,
          h('label', null, tt('settingsRoot')),
          h('code', null, state === null ? '…' : state.root),
          h(
            'span',
            { className: 'dshlib-settings-note' },
            state === null ? '' : tt('settingsTotals', { files: state.files, size: formatSize(state.bytes) }),
          ),
        ),
        h(
          'section',
          null,
          h('label', { htmlFor: 'dshlib-migrate-target' }, tt('settingsMigrate')),
          h(
            'div',
            { className: 'dshlib-settings-row' },
            h('input', {
              id: 'dshlib-migrate-target',
              type: 'text',
              value: target,
              placeholder: 'D:\\library',
              'aria-label': tt('settingsMigrate'),
              onChange: (event) => setTarget(event.target.value),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dshlib-btn dshlib-btn-primary',
                disabled: busy || target.trim() === '',
                onClick: () => void migrate(),
              },
              busy ? tt('settingsWorking') : tt('settingsMigrateAction'),
            ),
          ),
          h('span', { className: 'dshlib-settings-note' }, tt('settingsMigrateHint')),
        ),
        h(
          'section',
          null,
          h(
            'button',
            {
              type: 'button',
              className: 'dshlib-btn',
              style: { alignSelf: 'flex-start' },
              disabled: busy,
              onClick: () => void rebuild(),
            },
            tt('settingsRebuild'),
          ),
          h('span', { className: 'dshlib-settings-note' }, tt('settingsRebuildHint')),
        ),
        note === null ? null : h('div', { className: 'dshlib-settings-note', role: 'status' }, note),
        error === null ? null : h('div', { className: 'dshlib-settings-error', role: 'alert' }, error),
      )
    }

    // --- plugin -------------------------------------------------------------

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () =>
            ctx.locale.register(NS, {
              zh: Object.fromEntries(Object.keys(MESSAGES.zh).map((key) => [key, MESSAGES.zh[key]])),
              en: Object.fromEntries(Object.keys(MESSAGES.en).map((key) => [key, MESSAGES.en[key]])),
            }),
          'library: dictionaries',
        )
        ctx.effect(() => ensureStyles(), 'library: styles')

        const bound = ctx.locale.bind(NS)
        const t = (key, params) => {
          let value
          try {
            value = bound === undefined ? undefined : bound(key, params)
          } catch {
            value = undefined
          }
          if (typeof value === 'string' && value !== '' && value !== key) return value
          return translate('zh', key, params)
        }

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL, order: 20, locale: NS, label: () => t('panel') },
            LibraryIcon,
          ),
        )

        // Source navigation: the library surface is not a session surface, so the
        // jump resolves the origin's session first and reports the failure kinds
        // PRD 3.5 lists.
        const originTools = {
          describe: () => '',
          jump: async () => ({ ok: false, code: 'session-missing' }),
          openSession: () => undefined,
        }
        ctx.inject(['sessions', 'workspaces', 'uiWorkspace'], (scope) => {
          const snapshotOf = (service) => {
            try {
              return service.list.getSnapshot()
            } catch {
              return undefined
            }
          }
          const pick = (snapshot, id) => {
            if (snapshot === undefined || snapshot === null || id === null || id === undefined) return undefined
            const byId = snapshot.byId
            if (byId !== undefined && byId !== null && byId[id] !== undefined) return byId[id]
            if (Array.isArray(snapshot.items)) return snapshot.items.find((entry) => entry !== null && entry.id === id)
            if (Array.isArray(snapshot)) return snapshot.find((entry) => entry !== null && entry.id === id)
            return undefined
          }
          const label = (entry) => (entry === undefined ? null : entry.title ?? entry.name ?? null)

          originTools.describe = (origin) => {
            if (origin === undefined || origin === null) return ''
            const parts = []
            const workspace = label(pick(snapshotOf(scope.workspaces), origin.workspaceId))
            const session = label(pick(snapshotOf(scope.sessions), origin.sessionId))
            if (workspace !== null) parts.push(workspace)
            if (session !== null) parts.push(session)
            if (Number.isFinite(origin.turn)) parts.push(t('turnLabel', { turn: origin.turn }))
            return parts.join(' · ')
          }

          // Presence is only asserted when the projection really exposes the id.
          const presence = (snapshot, id) => {
            if (snapshot === undefined || snapshot === null || id === null || id === undefined) return 'unknown'
            if (Array.isArray(snapshot.ids)) return snapshot.ids.indexOf(id) === -1 ? 'absent' : 'present'
            const byId = snapshot.byId
            if (byId !== undefined && byId !== null) return byId[id] === undefined ? 'absent' : 'present'
            if (Array.isArray(snapshot.items)) {
              return snapshot.items.some((entry) => entry !== null && entry !== undefined && entry.id === id)
                ? 'present'
                : 'absent'
            }
            return 'unknown'
          }

          // Bring a chat back on screen; the queued attach request is consumed there.
          originTools.openSession = (sessionId) => {
            if (typeof sessionId !== 'string' || sessionId === '') return undefined
            try {
              return scope.uiWorkspace.openSession(sessionId)
            } catch {
              return undefined
            }
          }

          originTools.jump = async (origin) => {
            if (origin === undefined || origin === null) return { ok: false, code: 'session-missing' }
            // A live session is enough to navigate: the workspace only explains a
            // failure, it never blocks the jump.
            if (presence(snapshotOf(scope.sessions), origin.sessionId) === 'absent') {
              const workspaceState =
                origin.workspaceId === null || origin.workspaceId === undefined
                  ? 'unknown'
                  : presence(snapshotOf(scope.workspaces), origin.workspaceId)
              return { ok: false, code: workspaceState === 'absent' ? 'workspace-missing' : 'session-missing' }
            }
            try {
              scope.uiWorkspace.openSession(origin.sessionId)
              return { ok: true }
            } catch {
              return { ok: false, code: 'session-missing' }
            }
          }
        })

        // The preview is a right-Sidebar tab type of this plugin's own: the tab
        // chip names the file from the address, and the body renders it.
        ctx.inject(['sidebarRight', 'sidebarRightTabs'], (scope) => {
          scope.effect(
            () =>
              scope.sidebarRightTabs.register({
                id: PREVIEW_TYPE,
                kind: PREVIEW_KIND,
                priority: 'extension',
                patterns: [PREVIEW_PATTERN],
                canOpen: (address) => parseLibraryAddress(address) !== null,
                title: (address) => {
                  const parsed = parseLibraryAddress(address)
                  return parsed === null || parsed.name === '' ? t('preview') : parsed.name
                },
              }),
            'library: preview type',
          )
          scope.effect(
            () =>
              scope.slots.inject('sidebar.right.pane.tab', () =>
                scope.slots.register(
                  { name: 'sidebar.right.pane.tab', key: PREVIEW_TYPE, locale: NS },
                  (props) =>
                    h(PreviewBody, {
                      ...props,
                      t,
                      closeTab: (id) => scope.sidebarRight.close(id),
                      describeOrigin: (origin) => originTools.describe(origin),
                      jumpSource: (origin) => originTools.jump(origin),
                    }),
                ),
              ),
            'library: preview body',
          )
        })

        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL,
              locale: NS,
              inject: () => ({
                t,
                describeOrigin: (origin) => originTools.describe(origin),
                jumpSource: (origin) => originTools.jump(origin),
                openChat: (sessionId) => originTools.openSession(sessionId),
              }),
            },
            LibraryPage,
          ),
        )

        // Settings: storage location, totals, migration and a rebuild action.
        ctx.slots.inject('settings.section', () =>
          ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-library',
              order: 30,
              locale: NS,
              label: () => t('settingsLabel'),
              inject: () => ({ t }),
            },
            LibrarySettings,
          ),
        )

        // Chat entry: one composer button plus its picker. The Host validates the
        // selection again, then the bytes become ordinary draft attachments.
        const attachToDraft = async (sessionId, items, inputActions) => {
          const conversation = ctx.get('conversation')
          if (conversation === undefined || typeof conversation.createDrafts !== 'function') {
            throw new Error('the composer is unavailable')
          }
          if (inputActions === undefined || typeof inputActions.addAttachments !== 'function') {
            throw new Error('the composer is unavailable')
          }
          const validated = await api('/library/api/attach', {
            method: 'POST',
            body: { ids: items.map((item) => item.id) },
          })
          const origin = await resolveHost()
          const files = []
          for (const item of validated.items) {
            const response = await fetch(`${origin}/library/blob/${encodeURIComponent(item.id)}`, {
              cache: 'no-store',
              mode: 'cors',
            })
            if (!response.ok) throw new Error(`cannot read ${item.name}`)
            files.push(
              new File([await response.arrayBuffer()], item.name, { type: item.mime || 'application/octet-stream' }),
            )
          }
          const drafts = conversation.createDrafts(sessionId, files)
          inputActions.addAttachments(drafts.map((draft) => draft.id))
          return drafts.length
        }

        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: 'library-attach',
              order: 91,
              locale: NS,
              inject: () => ({ t, attach: attachToDraft }),
            },
            AttachButton,
          ),
        )
        ctx.slots.inject('conversation.input.overlay', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.overlay',
              id: 'library-picker',
              order: 10,
              locale: NS,
              inject: () => ({ t, attach: attachToDraft }),
            },
            AttachPicker,
          ),
        )
      },
    }
  },
})
