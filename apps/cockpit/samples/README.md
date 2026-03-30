# Cockpit Samples

Pre-built sample collections for importing into Cockpit tools.

## Available Samples

### JavaScript Snippets (`js-snippets.md`)

A curated collection of **25 JavaScript utility functions** ready to import into the Snippets Manager.

**Includes:**
- Deep clone, debounce, throttle, sleep/delay
- UUID generation, array utilities (flatten, unique, group, chunk)
- Object utilities (pick, omit, get nested values)
- String formatting (capitalize, truncate, case conversion)
- Number/currency formatting with Intl API
- URL/query string utilities
- Async patterns (retry, memoize)
- Browser utilities (clipboard copy)
- JSON parsing with error handling

**How to import:**
1. Open Cockpit → Snippets Manager (or press F10)
2. Click **[F10: IMP]** or the import button
3. Copy the entire JSON array from the code block
4. Paste into the import dialog
5. Snippets will be added to your collection

### ThingWorx API Collection (`thingworx-api-collection.md`)

A comprehensive **REST API collection** with **42 endpoints** for ThingWorx platform operations.

**Includes:**
- Thing operations (GET/PUT/POST/DELETE properties and services)
- Property history queries with date range filtering
- ThingTemplates, ThingShapes, DataShapes (CRUD)
- Stream and ValueStream operations
- DataTable queries
- User, Group, Project management
- Repository file operations (read/write/list)
- Alert management and permissions
- Organization queries

**How to import:**
1. Open Cockpit → API Client (if available)
2. Click **Import Collection** or similar
3. Copy the entire JSON array from the code block
4. Paste into the import dialog
5. All endpoints will be available with template variables ready for substitution

### ThingWorx JavaScript Snippets (`thingworx-snippets.md`)

A specialized collection of **JavaScript snippets** for ThingWorx service development.

**Uses ES5 syntax** (compatible with Rhino 1.7.11, no arrow functions or modern JS).

**Includes:**
- InfoTable creation and manipulation
- Row operations (add, find, iterate)
- Property and field queries
- Advanced patterns for ThingWorx-specific APIs

**How to import:**
1. Open Cockpit → Snippets Manager (or press F10)
2. Click **[F10: IMP]** or the import button
3. Copy the entire JSON array from the code block
4. Paste into the import dialog
5. Snippets will be added to your collection

## Notes

- All JSON arrays are wrapped in markdown code fences for easy viewing
- Copy only the JSON (not the markdown backticks) when importing
- Template variables like `{{baseUrl}}`, `{{thingName}}`, etc. should be replaced with actual values
- Each sample file is self-contained and can be imported independently
