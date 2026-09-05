# devdrivr Samples

Use these sample collections to import data into devdrivr tools. Each file is independent.

## JavaScript snippets

[`js-snippets.md`](js-snippets.md) contains **25 JavaScript utility functions** for Snippets Manager.

The collection includes deep clone, debounce, throttle, sleep/delay, UUID generation, array utilities, object utilities, string formatting, number formatting, URL utilities, async patterns, browser utilities, and JSON parsing.

To import the collection:

1. Open devdrivr → Snippets Manager (or press F10).
2. Click **[F10: IMP]** or the import button.
3. Copy the JSON array from the code block.
4. Paste it into the import dialog.
5. Check that the snippets appear in your collection.

## ThingWorx API collection

[`thingworx-api-collection.md`](thingworx-api-collection.md) contains a REST API collection with **42 endpoints** for ThingWorx platform operations.

The collection includes Thing operations, property history queries, ThingTemplates, ThingShapes, DataShapes, streams, ValueStreams, DataTables, users, groups, projects, repositories, alerts, permissions, and organizations.

To import the collection:

1. Open devdrivr → API Client (if available).
2. Click **Import Collection** or the equivalent control.
3. Copy the JSON array from the code block.
4. Paste it into the import dialog.
5. Check that the endpoints are available with template variables.

## ThingWorx JavaScript snippets

[`thingworx-snippets.md`](thingworx-snippets.md) contains JavaScript snippets for ThingWorx service development.

The snippets use ES5 syntax. They are compatible with Rhino 1.7.11 and do not use arrow functions or modern JavaScript.

The collection includes InfoTable creation, InfoTable updates, row operations, property queries, field queries, and ThingWorx API patterns.

To import the collection:

1. Open devdrivr → Snippets Manager (or press F10).
2. Click **[F10: IMP]** or the import button.
3. Copy the JSON array from the code block.
4. Paste it into the import dialog.
5. Check that the snippets appear in your collection.

## Import notes

- Each JSON array is inside a Markdown code fence.
- Copy the JSON only. Do not copy the Markdown backticks.
- Replace template variables such as `{{baseUrl}}` and `{{thingName}}` with actual values.
- Import each sample file independently.
