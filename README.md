# mcp-funcheap

Funcheap (SF Bay Area) MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `search_events` | Search SF Bay Area free & cheap events/deals from Funcheap. Filter by keyword, facet tags (e.g. "free", "live-music", "comedy", "art", "family-friendly", "food"), and a published-date window. Returns newest first by default. Use the `tags`/`categories` tools to discover facet slugs. |
| `event` | Get a single Funcheap event by numeric post id or slug, with full cleaned body text (date/venue/price details live in the text). |
| `tags` | List Funcheap event facet tags (slug, name, count). These are the filterable facets like "free", "live-music", "comedy", neighborhoods. Sorted by usage. |
| `categories` | List Funcheap categories (slug, name, count) — broader groupings like neighborhoods, "fairs-festivals", "kids-families". Sorted by usage. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "funcheap": {
      "url": "https://gateway.pipeworx.io/funcheap/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Funcheap data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
