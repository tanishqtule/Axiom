/* ════════════════════════════════════════════════════════
   AXIOM — app.js
   Note management, editor, UI, canvas, search
════════════════════════════════════════════════════════ */

'use strict';

/* ─── Utility ─── */
const uuid = () => crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function fmtDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)   return 'Just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function fmtFullDate(ts) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ════════════════════════════════════════════════════════
   SUPABASE STORAGE MANAGER
   Cloud-first, localStorage as local cache / offline fallback
════════════════════════════════════════════════════════ */
class SupabaseManager {
  constructor() {
    this.client  = window.axiomSupabase || null;
    this.userId  = null;
    this.user    = null;
    this._lsKey  = 'axiom_vault';
    this._setKey = 'axiom_settings';
    this._bulkTimer = null;
  }

  /* ── DB row ↔ app note conversions ── */
  _fromDB(row) {
    return {
      id:         row.id,
      title:      row.title      || '',
      content:    row.content    || '',
      tags:       row.tags       || [],
      created:    new Date(row.created_at).getTime(),
      modified:   new Date(row.updated_at).getTime(),
      isFavorite: row.is_favorite || false
    };
  }

  _toDB(note) {
    return {
      id:         note.id,
      user_id:    this.userId,
      title:      note.title,
      content:    note.content,
      tags:       note.tags,
      is_favorite: note.isFavorite,
      created_at: new Date(note.created).toISOString(),
      updated_at: new Date(note.modified).toISOString()
    };
  }

  /* ── Load all notes (async, called once at boot) ── */
  async load() {
    if (this.client && this.userId) {
      try {
        const { data, error } = await this.client
          .from('notes')
          .select('*')
          .order('updated_at', { ascending: false });
        if (error) throw error;
        const notes = (data || []).map(r => this._fromDB(r));
        // Cache locally
        localStorage.setItem(this._lsKey, JSON.stringify(notes));
        return notes;
      } catch (e) {
        console.warn('[Axiom] Supabase load failed, using local cache:', e.message);
      }
    }
    // Offline / unconfigured fallback
    try { return JSON.parse(localStorage.getItem(this._lsKey) || '[]'); } catch { return []; }
  }

  /* ── Sync individual note to cloud (fire-and-forget) ── */
  async upsertNote(note) {
    if (!this.client || !this.userId) return;
    try {
      const { error } = await this.client.from('notes').upsert(this._toDB(note));
      if (error) console.warn('[Axiom] upsert error:', error.message);
    } catch (e) { console.warn('[Axiom] upsert error:', e.message); }
  }

  /* ── Delete a single note from cloud ── */
  async deleteNote(id) {
    if (!this.client || !this.userId) return;
    try {
      const { error } = await this.client.from('notes').delete().eq('id', id);
      if (error) console.warn('[Axiom] delete error:', error.message);
    } catch (e) { console.warn('[Axiom] delete error:', e.message); }
  }

  /* ── Bulk save — keeps localStorage in sync; debounces cloud sync ── */
  save(notes) {
    localStorage.setItem(this._lsKey, JSON.stringify(notes));
    // Debounced bulk upsert (covers _createSampleNotes and import)
    clearTimeout(this._bulkTimer);
    this._bulkTimer = setTimeout(() => this._bulkSync(notes), 4000);
  }

  async _bulkSync(notes) {
    if (!this.client || !this.userId) return;
    try {
      const rows = notes.map(n => this._toDB(n));
      const { error } = await this.client.from('notes').upsert(rows);
      if (error) console.warn('[Axiom] bulk sync error:', error.message);
    } catch (e) { console.warn('[Axiom] bulk sync error:', e.message); }
  }

  /* ── Settings (localStorage only, fast) ── */
  loadSettings() {
    try { return JSON.parse(localStorage.getItem(this._setKey) || '{}'); } catch { return {}; }
  }

  saveSettings(s) {
    localStorage.setItem(this._setKey, JSON.stringify(s));
  }

  /* ── Clear vault ── */
  clear() {
    localStorage.removeItem(this._lsKey);
    if (this.client && this.userId) {
      // Best-effort cloud delete
      this.client.from('notes').delete().eq('user_id', this.userId)
        .then(({ error }) => { if (error) console.warn('[Axiom] clear error:', error.message); });
    }
  }
}

/* ════════════════════════════════════════════════════════
   NOTE MANAGER
════════════════════════════════════════════════════════ */
class NoteManager {
  constructor(storage, preloaded = null) {
    this.storage = storage;
    this.notes = preloaded || [];
    this.activeId = null;
    this.filterTag = null;
    this.searchQuery = '';
    this.onNotesChange = null; // callback
    this.onActiveChange = null;

    if (this.notes.length === 0) this._createSampleNotes();
  }

  _createSampleNotes() {
    const samples = [
      {
        title: 'Welcome to Axiom ✦',
        content: `# Welcome to Axiom ✦

Axiom is your **3D knowledge universe** — a premium, local-first note-taking app where ideas form constellations.

## Getting Started

- **Create** notes with the \`+ New Note\` button
- **Link** notes using \`[[Note Name]]\` syntax
- **Organise** with \`#tags\`
- **Visualise** your knowledge in the 3D Graph view

## Core Features

### Bi-Directional Links
Type \`[[Quick Start Guide]]\` to link to another note. Axiom automatically tracks which notes reference each other.

### 3D Knowledge Graph
Click **Graph** in the sidebar to explore your notes as an interactive 3D constellation.

### Markdown Support
Full Markdown is supported: **bold**, *italic*, \`code\`, tables, blockquotes, and more.

> "The mind is not a vessel to be filled, but a fire to be kindled." — Plutarch

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| New Note | \`Ctrl+N\` |
| Search | \`Ctrl+K\` |
| Save | \`Ctrl+S\` |
| Focus Mode | \`Ctrl+Shift+F\` |
| Bold | \`Ctrl+B\` |
| Italic | \`Ctrl+I\` |

Happy thinking! 🚀`,
        tags: ['welcome', 'guide']
      },
      {
        title: 'Quick Start Guide',
        content: `# Quick Start Guide

This guide helps you get the most out of [[Welcome to Axiom ✦]].

## Creating Notes

1. Click **+ New Note** in the sidebar
2. Type your title in the large input at the top
3. Write your content in Markdown below

## Linking Notes

Use double brackets to link notes:
\`\`\`
[[Note Title]]
\`\`\`

When you type \`[[\` in the editor, Axiom will suggest existing notes automatically.

## Adding Tags

Add tags in the tag bar below the title, or type \`#tagname\` anywhere in your content.

## The 3D Graph

The **Knowledge Graph** shows your notes as glowing spheres in 3D space. Notes that link to each other are connected by beams of light.

- **Left-drag** to orbit
- **Scroll** to zoom
- **Click a node** to open that note

## The Canvas

Use the **Canvas** view for spatial thinking — drag note cards around an infinite whiteboard to organise your ideas visually.

## Tips

- Use the **Split** view to edit and preview simultaneously
- **Focus Mode** (\`Ctrl+Shift+F\`) hides the sidebars for distraction-free writing
- Your notes are stored **100% locally** — no account needed`,
        tags: ['guide', 'tips']
      },
      {
        title: 'My Ideas',
        content: `# My Ideas

A place to capture thoughts and connect them to [[Welcome to Axiom ✦]].

## Today's Thoughts

- What if knowledge could be visualised like a galaxy?
- Ideas that link together are stronger than isolated facts
- The best note-taking system is the one you actually use

## Projects

### Project Alpha
A new way to think about [[Quick Start Guide]] concepts.

### Reading List
- [ ] *How to Take Smart Notes* — Sönke Ahrens
- [ ] *Building a Second Brain* — Tiago Forte
- [ ] *Thinking, Fast and Slow* — Daniel Kahneman

## Code Snippet

\`\`\`javascript
// Axiom note linking
const linked = notes.filter(n =>
  n.content.includes(\`[[\${activeNote.title}]]\`)
);
\`\`\`

> The value of a network grows with the square of its nodes — Metcalfe's Law`,
        tags: ['ideas', 'projects']
      }
    ];

    samples.forEach(s => {
      const note = {
        id: uuid(),
        title: s.title,
        content: s.content,
        tags: s.tags,
        created: Date.now() - Math.random() * 86400000 * 3,
        modified: Date.now() - Math.random() * 3600000,
        isFavorite: false
      };
      this.notes.push(note);
    });

    this.storage.save(this.notes);
  }

  getAll() { return this.notes; }

  getById(id) { return this.notes.find(n => n.id === id) || null; }

  getFiltered() {
    let notes = this.notes;
    if (this.filterTag) {
      notes = notes.filter(n => n.tags.includes(this.filterTag));
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      notes = notes.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return [...notes].sort((a, b) => b.modified - a.modified);
  }

  create(title = 'Untitled Note') {
    const note = {
      id: uuid(),
      title,
      content: '',
      tags: [],
      created: Date.now(),
      modified: Date.now(),
      isFavorite: false
    };
    this.notes.unshift(note);
    this.storage.save(this.notes);
    this.storage.upsertNote?.(note);
    this.activeId = note.id;
    this.onNotesChange?.();
    return note;
  }

  update(id, patch) {
    const note = this.getById(id);
    if (!note) return;
    Object.assign(note, patch, { modified: Date.now() });
    this.storage.save(this.notes);
    this.storage.upsertNote?.(note);
  }

  delete(id) {
    this.storage.deleteNote?.(id);
    this.notes = this.notes.filter(n => n.id !== id);
    if (this.activeId === id) this.activeId = null;
    this.storage.save(this.notes);
    this.onNotesChange?.();
  }

  duplicate(id) {
    const note = this.getById(id);
    if (!note) return null;
    const copy = {
      ...note,
      id: uuid(),
      title: note.title + ' (Copy)',
      created: Date.now(),
      modified: Date.now()
    };
    const idx = this.notes.findIndex(n => n.id === id);
    this.notes.splice(idx + 1, 0, copy);
    this.storage.save(this.notes);
    this.storage.upsertNote?.(copy);
    this.onNotesChange?.();
    return copy;
  }

  getAllTags() {
    const tagMap = {};
    this.notes.forEach(n => {
      n.tags.forEach(t => { tagMap[t] = (tagMap[t] || 0) + 1; });
    });
    return tagMap;
  }

  getBacklinks(id) {
    const note = this.getById(id);
    if (!note) return [];
    return this.notes.filter(n =>
      n.id !== id &&
      n.content.includes(`[[${note.title}]]`)
    );
  }

  extractWikiLinks(content) {
    const matches = content.match(/\[\[([^\]]+)\]\]/g) || [];
    return [...new Set(matches.map(m => m.slice(2, -2)))];
  }

  exportAll() {
    return JSON.stringify({ version: 1, notes: this.notes, exported: Date.now() }, null, 2);
  }

  importAll(json) {
    try {
      const data = JSON.parse(json);
      const imported = data.notes || data;
      if (!Array.isArray(imported)) throw new Error('Invalid format');
      imported.forEach(n => {
        if (!this.notes.find(e => e.id === n.id)) {
          this.notes.push(n);
        }
      });
      this.storage.save(this.notes);
      this.onNotesChange?.();
      return imported.length;
    } catch (e) {
      throw new Error('Failed to import: ' + e.message);
    }
  }
}

/* ════════════════════════════════════════════════════════
   TOAST MANAGER
════════════════════════════════════════════════════════ */
class ToastManager {
  constructor() {
    this.container = $('#toast-container');
  }

  show(message, type = 'info', duration = 3000) {
    const icons = { success: '✓', error: '✕', info: '◆' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type]}</span>${message}`;
    this.container.appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 350);
    }, duration);
  }

  success(msg) { this.show(msg, 'success'); }
  error(msg)   { this.show(msg, 'error', 4000); }
  info(msg)    { this.show(msg, 'info'); }
}

/* ════════════════════════════════════════════════════════
   EDITOR MANAGER
════════════════════════════════════════════════════════ */
class EditorManager {
  constructor(noteManager, uiManager, toast) {
    this.nm = noteManager;
    this.ui = uiManager;
    this.toast = toast;
    this.saveTimer = null;
    this.currentTab = 'edit';

    this.titleEl   = $('#note-title');
    this.contentEl = $('#note-content');
    this.statusEl  = $('#save-status');
    this.wordEl    = $('#word-count');
    this.charEl    = $('#char-count');
    this.rtEl      = $('#read-time');

    this._bindEvents();
    this._bindToolbar();
    this._bindTabs();
    this._bindTagInput();
    this._bindWikiLinkSuggest();
  }

  _bindEvents() {
    this.titleEl.addEventListener('input', () => this._onEdit());
    this.contentEl.addEventListener('input', () => {
      this._onEdit();
      this._updateStats();
      this._checkWikiLink();
    });
    this.contentEl.addEventListener('keydown', e => this._handleKey(e));

    // Export
    $('#export-btn').addEventListener('click', () => this._export());

    // Delete
    $('#delete-note-btn').addEventListener('click', () => {
      if (!this.nm.activeId) return;
      if (confirm('Delete this note?')) {
        this.nm.delete(this.nm.activeId);
        this.ui.renderNoteList();
        this.ui.showWelcome();
        this.toast.success('Note deleted');
      }
    });

    // Focus mode
    $('#focus-btn').addEventListener('click', () => {
      document.body.classList.toggle('focus-mode');
      this.toast.info(document.body.classList.contains('focus-mode') ? 'Focus mode on' : 'Focus mode off');
    });
  }

  _bindToolbar() {
    $$('.tb').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        this._applyFormat(action);
        this.contentEl.focus();
      });
    });
  }

  _applyFormat(action) {
    const ta = this.activeTextarea();
    if (!ta) return;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = ta.value.slice(start, end);
    const pre   = ta.value.slice(0, start);
    const post  = ta.value.slice(end);

    const wrap = (o, c = o) => {
      const newVal = pre + o + sel + c + post;
      ta.value = newVal;
      ta.setSelectionRange(start + o.length, end + o.length);
    };
    const lineStart = (prefix) => {
      const lineBegin = pre.lastIndexOf('\n') + 1;
      const line = ta.value.slice(lineBegin, end);
      ta.value = ta.value.slice(0, lineBegin) + prefix + line + post;
      const np = start + prefix.length;
      ta.setSelectionRange(np, np + sel.length);
    };

    switch (action) {
      case 'bold':          wrap('**');  break;
      case 'italic':        wrap('*');   break;
      case 'strikethrough': wrap('~~');  break;
      case 'h1':            lineStart('# ');  break;
      case 'h2':            lineStart('## '); break;
      case 'h3':            lineStart('### '); break;
      case 'link': {
        const url = prompt('URL:');
        if (url) { ta.value = pre + `[${sel || 'Link text'}](${url})` + post; }
        break;
      }
      case 'wikilink': {
        const title = sel || 'Note Name';
        ta.value = pre + `[[${title}]]` + post;
        ta.setSelectionRange(start + 2, start + 2 + title.length);
        break;
      }
      case 'code':      wrap('`');   break;
      case 'codeblock': wrap('\n```\n', '\n```\n'); break;
      case 'ul':        lineStart('- ');  break;
      case 'ol':        lineStart('1. '); break;
      case 'checkbox':  lineStart('- [ ] '); break;
      case 'quote':     lineStart('> ');  break;
      case 'hr': {
        const hr = '\n---\n';
        ta.value = pre + hr + post;
        ta.setSelectionRange(start + hr.length, start + hr.length);
        break;
      }
      case 'tag': {
        const tag = prompt('Tag name:');
        if (tag) {
          ta.value = pre + `#${tag.replace(/\s/g, '-')} ` + post;
          ta.setSelectionRange(start + tag.length + 2, start + tag.length + 2);
        }
        break;
      }
    }

    ta.dispatchEvent(new Event('input'));
  }

  _handleKey(e) {
    const ta = e.currentTarget;
    // Tab → indent
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(s);
      ta.setSelectionRange(s + 2, s + 2);
      return;
    }
    // Enter after list item
    if (e.key === 'Enter') {
      const s = ta.selectionStart;
      const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
      const line = ta.value.slice(lineStart, s);
      const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s/);
      if (listMatch) {
        e.preventDefault();
        const prefix = listMatch[0];
        ta.value = ta.value.slice(0, s) + '\n' + prefix + ta.value.slice(s);
        ta.setSelectionRange(s + 1 + prefix.length, s + 1 + prefix.length);
        ta.dispatchEvent(new Event('input'));
      }
    }
    // Keyboard shortcuts
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); this._applyFormat('bold'); }
      if (e.key === 'i') { e.preventDefault(); this._applyFormat('italic'); }
      if (e.key === 's') { e.preventDefault(); this._forceSave(); }
    }
  }

  _bindTabs() {
    $$('.etab').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.etab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this._switchTab(tab);
      });
    });
  }

  _switchTab(tab) {
    this.currentTab = tab;
    // Use only the active-pane class — no inline style toggling
    $$('.editor-pane').forEach(p => p.classList.remove('active-pane'));
    $(`#${tab}-pane`).classList.add('active-pane');

    if (tab === 'preview') {
      this._renderPreview();
    } else if (tab === 'split') {
      const splitEd = $('#split-editor');
      splitEd.value = this.contentEl.value;
      // Only bind once using a named handler stored on the element
      if (!splitEd._axiomBound) {
        splitEd._axiomBound = true;
        splitEd.addEventListener('input', () => {
          this.contentEl.value = splitEd.value;
          this._onEdit();
          this._renderSplitPreview();
        });
      }
      this._renderSplitPreview();
    }
  }

  _renderPreview() {
    const note = this.nm.getById(this.nm.activeId);
    if (!note) return;
    $('#preview-title').textContent = note.title;
    $('#preview-body').innerHTML = this._parseMarkdown(note.content);
    this._highlightCode($('#preview-body'));
    this._makeWikiLinks($('#preview-body'));
  }

  _renderSplitPreview() {
    const content = $('#split-editor').value;
    const body = $('#split-preview');
    body.innerHTML = this._parseMarkdown(content);
    this._highlightCode(body);
    this._makeWikiLinks(body);
  }

  _parseMarkdown(text) {
    if (typeof marked === 'undefined') return `<pre>${text}</pre>`;
    marked.setOptions({ breaks: true, gfm: true });
    return marked.parse(text);
  }

  _highlightCode(container) {
    if (typeof hljs === 'undefined') return;
    container.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  }

  _makeWikiLinks(container) {
    // Convert [[Note Title]] in rendered HTML to clickable links
    const walk = (node) => {
      if (node.nodeType === 3) { // text node
        const text = node.textContent;
        if (!text.includes('[[')) return;
        const parts = text.split(/(\[\[[^\]]+\]\])/g);
        if (parts.length <= 1) return;
        const frag = document.createDocumentFragment();
        parts.forEach(p => {
          const m = p.match(/^\[\[(.+)\]\]$/);
          if (m) {
            const a = document.createElement('a');
            a.href = '#';
            a.className = 'wiki-link';
            a.textContent = m[1];
            a.dataset.title = m[1];
            a.addEventListener('click', e => {
              e.preventDefault();
              const target = this.nm.notes.find(n => n.title === m[1]);
              if (target) window.axiomApp.openNote(target.id);
            });
            frag.appendChild(a);
          } else {
            frag.appendChild(document.createTextNode(p));
          }
        });
        node.parentNode.replaceChild(frag, node);
      } else if (node.nodeType === 1 && node.tagName !== 'CODE' && node.tagName !== 'PRE') {
        [...node.childNodes].forEach(walk);
      }
    };
    walk(container);
  }

  _bindTagInput() {
    const input = $('#tag-input');
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = input.value.trim().replace(/^#/, '').replace(/\s/g, '-');
        if (tag && this.nm.activeId) {
          const note = this.nm.getById(this.nm.activeId);
          if (note && !note.tags.includes(tag)) {
            note.tags.push(tag);
            this.nm.update(this.nm.activeId, { tags: note.tags });
            this._renderNoteTags();
            this.ui.renderTagCloud();
          }
        }
        input.value = '';
      }
      if (e.key === 'Backspace' && !input.value) {
        const note = this.nm.getById(this.nm.activeId);
        if (note && note.tags.length) {
          note.tags.pop();
          this.nm.update(this.nm.activeId, { tags: note.tags });
          this._renderNoteTags();
          this.ui.renderTagCloud();
        }
      }
    });
  }

  _renderNoteTags() {
    const note = this.nm.getById(this.nm.activeId);
    const bar = $('#note-tags');
    if (!note) { bar.innerHTML = ''; return; }
    bar.innerHTML = note.tags.map(t => `
      <span class="note-tag-pill">
        #${t}
        <button onclick="window.axiomApp.removeTag('${t}')" title="Remove tag">×</button>
      </span>
    `).join('');
  }

  /* Wiki-link suggestion dropdown */
  _bindWikiLinkSuggest() {
    this.contentEl.addEventListener('keyup', () => this._checkWikiLink());
    this.contentEl.addEventListener('keydown', e => {
      const dropdown = $('#link-suggest');
      if (dropdown.classList.contains('hidden')) return;
      const items = $$('.ls-item', dropdown);
      const sel = dropdown.querySelector('.ls-item.selected');
      const idx = items.indexOf(sel);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[(idx + 1) % items.length];
        items.forEach(i => i.classList.remove('selected'));
        next?.classList.add('selected');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[(idx - 1 + items.length) % items.length];
        items.forEach(i => i.classList.remove('selected'));
        prev?.classList.add('selected');
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        const selItem = dropdown.querySelector('.ls-item.selected');
        if (selItem) {
          e.preventDefault();
          this._insertWikiLink(selItem.dataset.title);
        }
      } else if (e.key === 'Escape') {
        this._hideWikiSuggest();
      }
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#link-suggest') && !e.target.closest('#note-content')) {
        this._hideWikiSuggest();
      }
    });
  }

  _checkWikiLink() {
    const ta = this.contentEl;
    const pos = ta.selectionStart;
    const textBefore = ta.value.slice(0, pos);
    const match = textBefore.match(/\[\[([^\]]*?)$/);
    if (!match) { this._hideWikiSuggest(); return; }

    const query = match[1].toLowerCase();
    const matches = this.nm.notes.filter(n =>
      n.title.toLowerCase().includes(query) && n.id !== this.nm.activeId
    ).slice(0, 6);

    if (!matches.length) { this._hideWikiSuggest(); return; }

    const dropdown = $('#link-suggest');
    // Position below the cursor
    const coords = this._getCaretCoords(ta, pos);
    const rect = ta.getBoundingClientRect();
    dropdown.style.left = (rect.left + coords.left) + 'px';
    dropdown.style.top  = (rect.top + coords.top + 20) + 'px';

    dropdown.innerHTML = matches.map((n, i) => `
      <div class="ls-item ${i === 0 ? 'selected' : ''}" data-title="${n.title}">
        ${n.title}
      </div>
    `).join('');

    $$('.ls-item', dropdown).forEach(item => {
      item.addEventListener('click', () => this._insertWikiLink(item.dataset.title));
      item.addEventListener('mouseenter', () => {
        $$('.ls-item', dropdown).forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
      });
    });

    dropdown.classList.remove('hidden');
  }

  _insertWikiLink(title) {
    const ta = this.contentEl;
    const pos = ta.selectionStart;
    const textBefore = ta.value.slice(0, pos);
    const textAfter = ta.value.slice(pos);
    // Replace the partial [[... with [[title]]
    const replaced = textBefore.replace(/\[\[([^\]]*)$/, `[[${title}]]`);
    ta.value = replaced + textAfter;
    const newPos = replaced.length;
    ta.setSelectionRange(newPos, newPos);
    this._hideWikiSuggest();
    ta.dispatchEvent(new Event('input'));
  }

  _hideWikiSuggest() {
    $('#link-suggest').classList.add('hidden');
  }

  /* Approximate caret position in textarea */
  _getCaretCoords(ta, pos) {
    const div = document.createElement('div');
    const style = getComputedStyle(ta);
    ['font', 'fontSize', 'fontFamily', 'fontWeight', 'letterSpacing', 'lineHeight',
     'paddingTop', 'paddingLeft', 'paddingRight', 'paddingBottom', 'borderLeft',
     'borderTop', 'borderRight', 'borderBottom', 'width', 'boxSizing'].forEach(p => {
      div.style[p] = style[p];
    });
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak = 'break-word';
    document.body.appendChild(div);
    const textNode = document.createTextNode(ta.value.slice(0, pos));
    div.appendChild(textNode);
    const span = document.createElement('span');
    span.textContent = '|';
    div.appendChild(span);
    const rect = span.getBoundingClientRect();
    const divRect = div.getBoundingClientRect();
    document.body.removeChild(div);
    return { left: rect.left - divRect.left, top: rect.top - divRect.top };
  }

  activeTextarea() {
    if (this.currentTab === 'split') return $('#split-editor');
    return this.contentEl;
  }

  _onEdit() {
    if (!this.nm.activeId) return;
    this.statusEl.textContent = '● Unsaved';
    this.statusEl.className = 'save-status unsaved';

    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this._save(), 800);

    // Update right panel live
    this.ui.updateRightPanel();
  }

  _save() {
    if (!this.nm.activeId) return;
    this.statusEl.textContent = '● Saving…';
    this.statusEl.className = 'save-status saving';

    const title   = this.titleEl.value || 'Untitled Note';
    const content = this.contentEl.value;
    this.nm.update(this.nm.activeId, { title, content });

    // Update in note list
    this.ui.renderNoteList();
    this.ui.updateRightPanel();

    setTimeout(() => {
      this.statusEl.textContent = '● Saved';
      this.statusEl.className = 'save-status saved';
    }, 200);

    // Refresh graph
    window.graphManager?.refreshFromNotes();
  }

  _forceSave() {
    clearTimeout(this.saveTimer);
    this._save();
  }

  _updateStats() {
    const text = this.contentEl.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    const readTime = Math.max(1, Math.ceil(words / 200));
    this.wordEl.textContent = `${words} word${words !== 1 ? 's' : ''}`;
    this.charEl.textContent = `${chars} char${chars !== 1 ? 's' : ''}`;
    this.rtEl.textContent   = `${readTime} min read`;
  }

  loadNote(id) {
    const note = this.nm.getById(id);
    if (!note) return;

    this.titleEl.value   = note.title;
    this.contentEl.value = note.content;
    const splitEd = $('#split-editor');
    if (splitEd) splitEd.value = note.content;

    this._renderNoteTags();
    this._updateStats();

    this.statusEl.textContent = '● Saved';
    this.statusEl.className   = 'save-status saved';

    if (this.currentTab === 'preview') this._renderPreview();
    if (this.currentTab === 'split')   this._renderSplitPreview();

    // Show editor, hide welcome — class-only approach
    $('#welcome-screen').classList.add('hidden');
    $('#note-editor').classList.remove('hidden');
  }

  _export() {
    const note = this.nm.getById(this.nm.activeId);
    if (!note) return;
    const blob = new Blob([`# ${note.title}\n\n${note.content}`], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${note.title.replace(/[^a-z0-9]/gi, '-')}.md`;
    a.click();
    this.toast?.success('Exported as Markdown');
  }
}

/* ════════════════════════════════════════════════════════
   UI MANAGER
════════════════════════════════════════════════════════ */
class UIManager {
  constructor(noteManager, toast) {
    this.nm    = noteManager;
    this.toast = toast;
    this.ctxTargetId = null;
  }

  renderNoteList() {
    const list = $('#note-list');
    const notes = this.nm.getFiltered();
    const count = this.nm.notes.length;

    $('#note-count').textContent = count;

    if (!notes.length) {
      list.innerHTML = `
        <div class="no-notes-state">
          <p>${this.nm.searchQuery ? 'No results found.' : 'No notes yet — create one!'}</p>
        </div>`;
      return;
    }

    const q = this.nm.searchQuery.toLowerCase();

    list.innerHTML = notes.map(n => {
      const preview = n.content.replace(/#{1,6}\s/g, '').replace(/\*\*/g, '').slice(0, 60);
      const titleHtml = q ? this._highlight(n.title, q) : n.title;
      const isActive = n.id === this.nm.activeId;

      return `
        <div class="note-item ${isActive ? 'active' : ''}" data-id="${n.id}">
          <div class="note-item-title">${titleHtml}</div>
          <div class="note-item-preview">${preview || 'Empty note…'}</div>
          <div class="note-item-meta">
            <span class="note-item-date">${fmtDate(n.modified)}</span>
            ${n.tags.slice(0, 2).map(t => `<span class="note-item-tag">#${t}</span>`).join('')}
          </div>
        </div>`;
    }).join('');

    $$('.note-item').forEach(el => {
      el.addEventListener('click', () => window.axiomApp.openNote(el.dataset.id));
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        this.ctxTargetId = el.dataset.id;
        this._showCtxMenu(e.clientX, e.clientY);
      });
    });
  }

  _highlight(text, q) {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(re, '<mark class="search-highlight">$1</mark>');
  }

  renderTagCloud() {
    const cloud = $('#tags-cloud');
    const tags  = this.nm.getAllTags();
    if (!Object.keys(tags).length) {
      cloud.innerHTML = '<span style="font-size:11px;color:var(--text3);padding:0 4px">No tags yet</span>';
      return;
    }
    cloud.innerHTML = Object.entries(tags)
      .sort((a, b) => b[1] - a[1])
      .map(([t, c]) => `<span class="tag-chip ${this.nm.filterTag === t ? 'active' : ''}" data-tag="${t}">#${t} <small>${c}</small></span>`)
      .join('');

    $$('.tag-chip').forEach(el => {
      el.addEventListener('click', () => {
        const tag = el.dataset.tag;
        this.nm.filterTag = this.nm.filterTag === tag ? null : tag;
        this.renderTagCloud();
        this.renderNoteList();
      });
    });
  }

  updateRightPanel() {
    const id = this.nm.activeId;
    if (!id) return;

    const note = this.nm.getById(id);
    if (!note) return;

    // Backlinks
    const backlinks = this.nm.getBacklinks(id);
    const blCount   = $('#backlinks-count');
    const blList    = $('#backlinks-list');
    blCount.textContent = backlinks.length;

    if (!backlinks.length) {
      blList.innerHTML = '<div class="rp-empty">No backlinks yet</div>';
    } else {
      blList.innerHTML = backlinks.map(n => `
        <div class="backlink-item" data-id="${n.id}">${n.title}</div>
      `).join('');
      $$('.backlink-item').forEach(el => {
        el.addEventListener('click', () => window.axiomApp.openNote(el.dataset.id));
      });
    }

    // TOC
    const headings = [...note.content.matchAll(/^(#{1,3})\s+(.+)$/mg)];
    const tocList  = $('#toc-list');
    if (!headings.length) {
      tocList.innerHTML = '<div class="rp-empty">No headings</div>';
    } else {
      tocList.innerHTML = headings.map(h => `
        <div class="toc-item h${h[1].length}" data-text="${h[2]}">${h[2]}</div>
      `).join('');
    }

    // Properties
    const words = note.content.trim() ? note.content.trim().split(/\s+/).length : 0;
    const links = this.nm.extractWikiLinks(note.content).length;
    $('#prop-created').textContent  = fmtFullDate(note.created);
    $('#prop-modified').textContent = fmtFullDate(note.modified);
    $('#prop-words').textContent    = words;
    $('#prop-links').textContent    = links;
  }

  showWelcome() {
    $('#welcome-screen').classList.remove('hidden');
    $('#note-editor').classList.add('hidden');
    this.nm.activeId = null;
    this.renderNoteList();
  }

  _showCtxMenu(x, y) {
    const menu = $('#ctx-menu');
    menu.classList.remove('hidden');
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    // Clamp to viewport
    requestAnimationFrame(() => {
      const r = menu.getBoundingClientRect();
      if (r.right > window.innerWidth) menu.style.left = (x - r.width) + 'px';
      if (r.bottom > window.innerHeight) menu.style.top = (y - r.height) + 'px';
    });
  }

  hideCtxMenu() { $('#ctx-menu').classList.add('hidden'); }
}

/* ════════════════════════════════════════════════════════
   CANVAS MANAGER
════════════════════════════════════════════════════════ */
class CanvasManager {
  constructor() {
    this.board  = $('#canvas-board');
    this.world  = $('#canvas-world');
    this.tool   = 'pan';
    this.cards  = [];
    this.offset = { x: 0, y: 0 };
    this.scale  = 1;
    this.isPanning = false;
    this.panStart  = { x: 0, y: 0 };
    this.draggingCard = null;
    this.dragCardStart = { x: 0, y: 0 };
    this.dragMouseStart = { x: 0, y: 0 };

    this._bind();
  }

  open() {
    $('#canvas-modal').classList.remove('hidden');
    this._applyTransform();
  }

  close() { $('#canvas-modal').classList.add('hidden'); }

  _bind() {
    $('#close-canvas-btn').addEventListener('click', () => this.close());
    $('#canvas-clear').addEventListener('click', () => {
      if (confirm('Clear canvas?')) {
        this.cards = [];
        this.world.querySelectorAll('.canvas-card').forEach(e => e.remove());
      }
    });

    $$('.canvas-tool').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.canvas-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.tool = btn.dataset.tool;
        this.board.style.cursor = this.tool === 'pan' ? 'grab' : 'crosshair';
      });
    });

    // Pan
    this.board.addEventListener('mousedown', e => {
      if (e.target !== this.board && e.target !== this.world) return;
      if (this.tool === 'pan') {
        this.isPanning = true;
        this.panStart  = { x: e.clientX - this.offset.x, y: e.clientY - this.offset.y };
        this.board.style.cursor = 'grabbing';
      } else if (this.tool === 'note' || this.tool === 'text') {
        const rect  = this.world.getBoundingClientRect();
        const worldX = (e.clientX - rect.left) / this.scale;
        const worldY = (e.clientY - rect.top)  / this.scale;
        this._addCard(worldX, worldY, this.tool === 'text' ? 'text' : 'note');
      }
    });

    window.addEventListener('mousemove', e => {
      if (this.isPanning) {
        this.offset.x = e.clientX - this.panStart.x;
        this.offset.y = e.clientY - this.panStart.y;
        this._applyTransform();
      }
      if (this.draggingCard) {
        const dx = e.clientX - this.dragMouseStart.x;
        const dy = e.clientY - this.dragMouseStart.y;
        this.draggingCard.style.left = (this.dragCardStart.x + dx / this.scale) + 'px';
        this.draggingCard.style.top  = (this.dragCardStart.y + dy / this.scale) + 'px';
      }
    });

    window.addEventListener('mouseup', () => {
      this.isPanning    = false;
      this.draggingCard = null;
      if (this.tool === 'pan') this.board.style.cursor = 'grab';
    });

    // Zoom
    this.board.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.scale = Math.max(0.3, Math.min(3, this.scale * factor));
      this._applyTransform();
    }, { passive: false });
  }

  _applyTransform() {
    this.world.style.transform = `translate(${this.offset.x}px, ${this.offset.y}px) scale(${this.scale})`;
  }

  _addCard(x, y, type = 'note') {
    const card = document.createElement('div');
    card.className = 'canvas-card';
    card.style.left = x + 'px';
    card.style.top  = y + 'px';

    card.innerHTML = `
      <div class="canvas-card-title">${type === 'text' ? 'Text' : 'Note'}</div>
      <textarea placeholder="${type === 'text' ? 'Type text…' : 'Note content…'}" onclick="event.stopPropagation()"></textarea>
    `;

    // Drag card
    card.addEventListener('mousedown', e => {
      if (e.target.tagName === 'TEXTAREA') return;
      e.stopPropagation();
      this.draggingCard     = card;
      this.dragMouseStart   = { x: e.clientX, y: e.clientY };
      this.dragCardStart    = { x: parseInt(card.style.left), y: parseInt(card.style.top) };
      card.style.zIndex     = '10';
    });

    card.addEventListener('mouseup', () => { card.style.zIndex = '1'; });

    this.world.appendChild(card);
    const ta = card.querySelector('textarea');
    if (ta) { ta.focus(); }
  }
}

/* ════════════════════════════════════════════════════════
   SETTINGS MANAGER
════════════════════════════════════════════════════════ */
class SettingsManager {
  constructor(storage, noteManager, toast) {
    this.storage = storage;
    this.nm      = noteManager;
    this.toast   = toast;
    this.fontSize = 16;
    this.settings = storage.loadSettings();
    this._apply(this.settings);
    this._bind();
  }

  open()  { $('#settings-modal').classList.remove('hidden'); }
  close() { $('#settings-modal').classList.add('hidden'); }

  _apply(s) {
    if (s.theme) {
      document.body.classList.remove('theme-midnight', 'theme-aurora');
      if (s.theme !== 'cosmic') document.body.classList.add(`theme-${s.theme}`);
      $$('.theme-sw').forEach(b => b.classList.toggle('active', b.dataset.theme === s.theme));
    }
    if (s.fontSize) {
      this.fontSize = s.fontSize;
      document.documentElement.style.setProperty('--font-size-editor', s.fontSize + 'px');
      const el = $('#font-size-val');
      if (el) el.textContent = s.fontSize + 'px';
    }
    if (s.fontFamily) {
      document.documentElement.style.setProperty('--font-editor', s.fontFamily);
      const sel = $('#font-family-sel');
      if (sel) sel.value = s.fontFamily;
    }
  }

  _save() {
    this.storage.saveSettings(this.settings);
  }

  _bind() {
    $('#close-settings-btn').addEventListener('click', () => this.close());
    $('#settings-modal').addEventListener('click', e => {
      if (e.target === $('#settings-modal')) this.close();
    });

    $$('.theme-sw').forEach(btn => {
      btn.addEventListener('click', () => {
        this.settings.theme = btn.dataset.theme;
        this._apply(this.settings);
        this._save();
      });
    });

    $('#font-inc').addEventListener('click', () => {
      this.fontSize = Math.min(24, this.fontSize + 1);
      this.settings.fontSize = this.fontSize;
      this._apply(this.settings);
      this._save();
    });

    $('#font-dec').addEventListener('click', () => {
      this.fontSize = Math.max(12, this.fontSize - 1);
      this.settings.fontSize = this.fontSize;
      this._apply(this.settings);
      this._save();
    });

    $('#font-family-sel').addEventListener('change', e => {
      this.settings.fontFamily = e.target.value;
      this._apply(this.settings);
      this._save();
    });

    $('#export-all-btn').addEventListener('click', () => {
      const json = this.nm.exportAll();
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'axiom-vault.json';
      a.click();
      this.toast.success('Vault exported!');
    });

    $('#import-btn').addEventListener('click', () => $('#import-input').click());
    $('#import-input').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const count = this.nm.importAll(reader.result);
          this.toast.success(`Imported ${count} notes!`);
          window.axiomApp.uiManager.renderNoteList();
          window.axiomApp.uiManager.renderTagCloud();
        } catch (err) {
          this.toast.error(err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('#clear-vault-btn').addEventListener('click', () => {
      if (confirm('⚠️ This will permanently delete ALL notes. Are you sure?')) {
        this.nm.storage.clear();
        this.nm.notes = [];
        this.nm.activeId = null;
        window.axiomApp.uiManager.renderNoteList();
        window.axiomApp.uiManager.renderTagCloud();
        window.axiomApp.uiManager.showWelcome();
        this.toast.success('Vault cleared');
        this.close();
      }
    });
  }
}

/* ════════════════════════════════════════════════════════
   CURSOR GLOW
════════════════════════════════════════════════════════ */
function initCursorGlow() {
  const glow = $('#cursor-glow');
  let mx = 0, my = 0, cx = 0, cy = 0;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; });

  const raf = () => {
    cx += (mx - cx) * 0.12;
    cy += (my - cy) * 0.12;
    glow.style.left = cx + 'px';
    glow.style.top  = cy + 'px';
    requestAnimationFrame(raf);
  };
  raf();
}

/* ════════════════════════════════════════════════════════
   MAIN APP
════════════════════════════════════════════════════════ */
class App {
  constructor() {
    this.storage = new SupabaseManager();
    this.toast   = new ToastManager();
    window.axiomApp = this;
    this._initAsync();
  }

  /* ── Async boot: auth check → load notes → _boot() ── */
  async _initAsync() {
    let preloaded = null;
    const sb  = window.axiomSupabase;
    const cfg = (typeof AXIOM_CONFIG !== 'undefined') ? AXIOM_CONFIG : null;

    if (sb && cfg?.isConfigured) {
      try {
        const { data: { session }, error } = await sb.auth.getSession();
        if (error) throw error;
        if (session) {
          // Already logged in — preload data so the app is ready instantly
          this.storage.userId = session.user.id;
          this.storage.user   = session.user;
          preloaded = await this.storage.load();
        }
        // No session → don't redirect yet; let the splash show first
      } catch (e) {
        console.warn('[Axiom] Auth/load failed, offline mode:', e.message);
      }
    }

    this._boot(preloaded);
  }

  /* ── Fully initialise the app once data is available ── */
  _boot(preloaded) {
    this.noteManager     = new NoteManager(this.storage, preloaded);
    this.uiManager       = new UIManager(this.noteManager, this.toast);
    this.editorManager   = new EditorManager(this.noteManager, this.uiManager, this.toast);
    this.canvasManager   = new CanvasManager();
    this.settingsManager = new SettingsManager(this.storage, this.noteManager, this.toast);

    this.noteManager.onNotesChange = () => {
      this.uiManager.renderNoteList();
      this.uiManager.renderTagCloud();
    };

    this._renderUserProfile();
    this._bindGlobal();
    this._bindSplash();

    // Unlock the Enter button (it was disabled while data loaded)
    const btn  = $('#enter-btn');
    const span = btn?.querySelector('span');
    if (btn)  btn.disabled = false;
    if (span) span.textContent = 'Enter Your Universe';
    $('#splash-loading')?.classList.add('hidden');
  }

  /* ── Render signed-in user's avatar + name in sidebar ── */
  _renderUserProfile() {
    const user = this.storage.user;
    const el   = $('#user-profile');
    if (!user || !el) return;

    const name   = user.user_metadata?.full_name
                || user.email?.split('@')[0]
                || 'User';
    const avatar = user.user_metadata?.avatar_url;

    if (avatar) {
      el.innerHTML = `<img src="${avatar}" alt="${name}" class="user-avatar" />
                      <span class="sl-text user-name" title="${user.email}">${name.split(' ')[0]}</span>`;
    } else {
      el.innerHTML = `<div class="user-avatar-initials">${name.slice(0, 2).toUpperCase()}</div>
                      <span class="sl-text user-name" title="${user.email}">${name.split(' ')[0]}</span>`;
    }
    el.classList.remove('hidden');
  }

  _bindSplash() {
    $('#enter-btn').addEventListener('click', async () => {
      const sb  = window.axiomSupabase;
      const cfg = (typeof AXIOM_CONFIG !== 'undefined') ? AXIOM_CONFIG : null;

      // Auth gate: redirect to login if no valid session / offline approval
      if (sb && cfg?.isConfigured) {
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (!session) {
            window.location.replace(cfg.loginPage || 'login.html');
            return;
          }
        } catch (e) {
          console.warn('[Axiom] Session check failed:', e.message);
        }
      } else if (!sessionStorage.getItem('axiomOfflineMode')) {
        window.location.replace(cfg?.loginPage || 'login.html');
        return;
      }

      const splash = $('#splash');
      splash.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
      splash.style.opacity    = '0';
      splash.style.transform  = 'scale(1.05)';

      setTimeout(() => {
        splash.style.display = 'none';
        this._showApp();
      }, 800);
    });
  }

  _showApp() {
    const app = $('#app');
    app.classList.remove('hidden');
    app.classList.add('entering');
    setTimeout(() => app.classList.remove('entering'), 600);

    this.uiManager.renderNoteList();
    this.uiManager.renderTagCloud();

    // Init graph
    requestAnimationFrame(() => {
      window.graphManager?.init();
    });
  }

  _bindGlobal() {
    // New note
    $('#new-note-btn').addEventListener('click', () => this.createNote());
    $('#welcome-new-btn')?.addEventListener('click', () => this.createNote());
    $('#welcome-graph-btn')?.addEventListener('click', () => this.openGraph());

    // Search
    const searchEl = $('#search-input');
    searchEl.addEventListener('input', () => {
      this.noteManager.searchQuery = searchEl.value.trim();
      this.uiManager.renderNoteList();
    });

    // Graph
    $('#graph-btn').addEventListener('click', () => this.openGraph());
    $('#close-graph-btn').addEventListener('click', () => this.closeGraph());
    $('#expand-graph-btn').addEventListener('click', () => this.openGraph());

    // Canvas
    $('#canvas-btn').addEventListener('click', () => this.canvasManager.open());

    // Settings
    $('#settings-btn').addEventListener('click', () => this.settingsManager.open());

    // Close modals on overlay click
    $('#graph-modal').addEventListener('click', e => {
      if (e.target === $('#graph-modal')) this.closeGraph();
    });

    // Sidebar collapse
    $('#sidebar-collapse-btn').addEventListener('click', () => {
      $('#app').classList.toggle('sidebar-collapsed');
    });

    // Context menu
    $$('.ctx-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        const id = this.uiManager.ctxTargetId;
        if (!id) return;
        if (action === 'open') this.openNote(id);
        else if (action === 'duplicate') {
          const copy = this.noteManager.duplicate(id);
          if (copy) { this.openNote(copy.id); this.toast.success('Note duplicated'); }
        } else if (action === 'delete') {
          if (confirm('Delete this note?')) {
            this.noteManager.delete(id);
            if (this.noteManager.activeId === null) this.uiManager.showWelcome();
            this.toast.success('Note deleted');
          }
        }
        this.uiManager.hideCtxMenu();
      });
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#ctx-menu') && !e.target.closest('.note-item')) {
        this.uiManager.hideCtxMenu();
      }
    });

    // Guide
    $('#guide-btn')?.addEventListener('click', () => window.guideManager?.open());
    $('#welcome-guide-btn')?.addEventListener('click', () => window.guideManager?.open());

    // Sign out
    $('#signout-btn')?.addEventListener('click', async () => {
      if (window.axiomSupabase) await window.axiomSupabase.auth.signOut();
      const loginPage = (typeof AXIOM_CONFIG !== 'undefined')
        ? AXIOM_CONFIG.loginPage : 'login.html';
      window.location.replace(loginPage);
    });

    // Graph controls
    $('#g-zoom-in').addEventListener('click',  () => window.graphManager?.zoom(1.3));
    $('#g-zoom-out').addEventListener('click', () => window.graphManager?.zoom(0.77));
    $('#g-reset').addEventListener('click',    () => window.graphManager?.resetCamera());
    $('#graph-filter').addEventListener('input', e => window.graphManager?.filter(e.target.value));

    // Keyboard shortcuts
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.uiManager.hideCtxMenu();
        $('#link-suggest').classList.add('hidden');
        if (!$('#graph-modal').classList.contains('hidden')) this.closeGraph();
        if (!$('#canvas-modal').classList.contains('hidden')) this.canvasManager.close();
        if (!$('#settings-modal').classList.contains('hidden')) this.settingsManager.close();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        $('#search-input').focus();
        $('#search-input').select();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        this.createNote();
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        document.body.classList.toggle('focus-mode');
      }
    });
  }

  createNote() {
    const note = this.noteManager.create();
    this.uiManager.renderNoteList();
    this.editorManager.loadNote(note.id);
    this.uiManager.updateRightPanel();
    this.editorManager.titleEl.focus();
    this.editorManager.titleEl.select();
    window.graphManager?.refreshFromNotes();
    this.toast.success('New note created');
  }

  openNote(id) {
    if (this.noteManager.activeId === id) return;
    this.noteManager.activeId = id;
    this.uiManager.renderNoteList();
    this.editorManager.loadNote(id);
    this.uiManager.updateRightPanel();
    window.graphManager?.setActiveNode(id);
  }

  openGraph() {
    $('#graph-modal').classList.remove('hidden');
    window.graphManager?.openFullScreen();
  }

  closeGraph() {
    $('#graph-modal').classList.add('hidden');
    window.graphManager?.closeFullScreen();
  }

  removeTag(tag) {
    const id   = this.noteManager.activeId;
    const note = this.noteManager.getById(id);
    if (!note) return;
    note.tags = note.tags.filter(t => t !== tag);
    this.noteManager.update(id, { tags: note.tags });
    this.editorManager._renderNoteTags();
    this.uiManager.renderTagCloud();
  }
}

/* ════════════════════════════════════════════════════════
   GUIDE MANAGER
════════════════════════════════════════════════════════ */
class GuideManager {
  constructor() {
    this.currentChapter = 0;
    this.totalChapters  = 7;
    this.isOpen         = false;
    this._bind();
  }

  open() {
    this.isOpen = true;
    const modal = $('#guide-modal');
    modal.classList.remove('hidden');
    this.goTo(0);
    window.guideAnim?.start();
    // Trigger intersection observer re-check
    setTimeout(() => this._observeChapters(), 100);
  }

  close() {
    this.isOpen = false;
    $('#guide-modal').classList.add('hidden');
    window.guideAnim?.stop();
  }

  goTo(idx) {
    idx = Math.max(0, Math.min(this.totalChapters - 1, idx));
    this.currentChapter = idx;
    const scroller = $('#guide-scroller');
    const chapters  = $$('.guide-chapter', scroller);
    if (chapters[idx]) {
      chapters[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    this._updateDots(idx);
    window.guideAnim?.onChapter(idx);
  }

  _updateDots(idx) {
    $$('.gnd').forEach((d, i) => d.classList.toggle('active', i === idx));
  }

  _observeChapters() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          const idx = parseInt(entry.target.dataset.ch);
          if (!isNaN(idx)) {
            this.currentChapter = idx;
            this._updateDots(idx);
            window.guideAnim?.onChapter(idx);
          }
        }
      });
    }, { threshold: 0.5, root: $('#guide-scroller') });

    $$('.guide-chapter').forEach(ch => obs.observe(ch));
    this._obs = obs;
  }

  _bind() {
    $('#close-guide-btn')?.addEventListener('click', () => this.close());
    $('#guide-modal')?.addEventListener('click', e => {
      if (e.target === $('#guide-modal')) this.close();
    });

    // Nav dots
    $$('.gnd').forEach((d, i) => {
      d.addEventListener('click', () => this.goTo(i));
    });

    // Arrow buttons
    $('#guide-prev')?.addEventListener('click', () => this.goTo(this.currentChapter - 1));
    $('#guide-next')?.addEventListener('click', () => this.goTo(this.currentChapter + 1));

    // Keyboard
    document.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') this.goTo(this.currentChapter + 1);
      if (e.key === 'ArrowUp'   || e.key === 'ArrowLeft')  this.goTo(this.currentChapter - 1);
      if (e.key === 'Escape') this.close();
    });

    // "Start using Axiom" button inside guide
    $('#guide-start-btn')?.addEventListener('click', () => this.close());
  }
}

/* ─── Boot ─── */
document.addEventListener('DOMContentLoaded', () => {
  initCursorGlow();
  window.axiomApp = new App();
  window.guideManager = new GuideManager();
});
