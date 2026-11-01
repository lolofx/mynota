# ADR 0021: Optional Summary Server on the Local Network

**Status**: Proposed (Windows fork)
**Date**: 2026-11-01
**Builds on**: [ADR 0018: Optional, Selectable Summary Model](0018-optional-selectable-summary-model.md)
**Context**: The local summary model needs several GB of memory and a capable CPU, which a light Windows laptop may not have. The user already runs Ollama on another machine of their home network. Writing the summary there keeps the PC light, and lets a bigger model than the local catalogue be used. This is the one place where the text of a meeting leaves the machine, so it has to be narrow and explicit.

## Decision

Add an **optional summary server**: an Ollama server whose address and model the user enters in Settings. When it is switched on, it replaces the local model for every summary. When it is off, nothing changes.

- **Privacy exception, opt-in only.** Nothing is sent until the user enters an address, picks a model and switches the server on. Only the rendered summary prompt is sent (transcript text and instructions), never audio.
- **Private networks only.** The address must resolve to a loopback, private, link-local or shared (CGNAT/VPN) address. Anything else is refused *before* a connection is attempted, so a typo cannot send a transcript to the public internet. Checked when saving (shape) and again at each connection (resolution).
- **Plain `http://` only.** The crate has no TLS stack and none is added for a LAN feature. `https://` is refused with a clear message.
- **Ollama native `/api/chat`**, not the OpenAI-compatible route: only the native route pins `num_ctx` (Ollama's default context silently truncates long prompts) and switches off the "thinking" phase of Qwen3-class models (`think: false`).
- **No new dependency.** A small HTTP/1.1 client over `std::net` keeps the supply chain unchanged and lets a cancel close the socket, which stops generation on the server. Long transcripts are split and combined (map-reduce) exactly as the local engine does.
- **Storage.** The address, model and on/off switch live in `preferences.json` under `summary.server`, in the user's data folder. They are never in the repository, in tests or in documentation. Saving guidelines or the local model keeps the server (each save loads, changes and writes the whole `summary` object).
- **Settings screen.** One section: address field, a "Test and list models" button (the same call is the connection test and the source of the model list), a model picker, an on/off switch and a privacy note. A saved model stays selectable before the server is contacted.
- **Generous timeouts.** A server that sleeps needs seconds to load the model on wake; the idle timeout is 5 minutes.

## Consequences

- The summary no longer needs a local model: with the server on, no GGUF has to be downloaded.
- Server error messages are shown as the engine writes them (English); the interface only translates its own labels (ADR 0020).
- A summary written by the server is stored like any other (same files, same Markdown export).
- Out of scope: API keys, TLS, other server types, choosing a server per meeting.
