# Gemini Embedding 2 — Reference

> **This is the embedding model the project uses.** Do not substitute `text-embedding-004`, `multimodalembedding@001`, or any other model. The model ID is exactly `gemini-embedding-2`.

## Overview

Gemini Embedding 2 is Google's embedding generation model, ideal for complex retrieval and analytics tasks.

It accepts **multimodal inputs** and generates **3072-dimensional vectors**. It accepts images, text, documents, audio, and video inputs and semantically maps the generated vectors into a unified semantic space. This lets you perform tasks like searching for an image based on a text description — which is exactly what this project does.

## Features

- **Custom task instructions**: Specify task instructions (e.g., `task:code retrieval` or `task:search result`) to optimize embeddings for the intended relationship and retrieve more accurate results.
- **Adjustable result size**: Default output is a 3072-dimensional float vector. A smaller dimensional output can be retrieved by specifying the `output_dimensionality` parameter (MRL — Matryoshka Representation Learning).
- **Document OCR**: Reads OCR from document inputs.
- **Audio track extraction**: Extracts audio tracks from video inputs and interleaves them with video frames.

## Model card

| Field | Value |
|---|---|
| **Model ID** | `gemini-embedding-2` |
| **Inputs** | Text, Images, Audio, Video, PDF |
| **Outputs** | Embeddings |
| **Max input tokens** | 8,192 |
| **Max sequence length** | 8,192 tokens |
| **Output dimensions** | Up to 3,072 (with MRL support) |
| **Launch stage** | GA |
| **Release date** | April 22, 2026 |
| **Knowledge cutoff** | November 2025 |
| **Preview version** | `gemini-embedding-2-preview` (released March 10, 2026) |

## Consumption options

- ✅ Supported: Standard PayGo
- ❌ Not supported: Provisioned Throughput, Flex PayGo, Priority PayGo, Batch prediction

## Technical limits (important for chunking)

### Images
- Max images per prompt: **6**
- Max file size (inline data or direct upload): no limit
- Max file size from GCS: no limit
- Supported MIME types: `image/png`, `image/jpeg`

### Documents (PDFs)
- Max files per prompt: **1**
- Max pages per file: **6**
- Supported MIME types: `application/pdf`
- → Implication for v2: PDFs longer than 6 pages must be chunked client-side before embedding.

### Video
- Max length with audio: **80 seconds**
- Max length without audio: **120 seconds**
- Max videos per prompt: **1**
- Supported MIME types: `video/mpeg`, `video/mp4`
- → Implication for v2: longer videos must be split.

### Audio
- Max length per prompt: **180 seconds**
- Max files per prompt: **1**
- Supported MIME types: `audio/mp3`, `audio/wav`
- → Implication for v2: longer audio must be split.

## Supported regions

- `global` — Global
- `us` — United States multi-region
- `eu` — Europe multi-region

Default for this project: `us-central1` (set via `GOOGLE_VERTEX_LOCATION` env var).

## What this means for v1

v1 only handles images, so the relevant constraints are:
- One image per upload (well within the 6-image limit)
- `image/png` and `image/jpeg` only — reject other formats at upload time
- 3072-dim vectors — the `vec0` virtual table column must be `float[3072]`

## Implementation notes

- **Auth**: Vertex AI uses Google Cloud service account credentials. Set `GOOGLE_APPLICATION_CREDENTIALS` to point at the JSON key file. The `@ai-sdk/google-vertex` provider picks this up automatically, as does the `google-auth-library`.
- **Request shape**: The exact request shape for multimodal embedding calls on Vertex should be verified against current Google Cloud docs at implementation time. Do not assume the shape — fetch the docs.
- **Task instruction**: For this project, the appropriate task hint is likely `task:search result` or similar retrieval-oriented hint when embedding queries, and a different hint (or none) when embedding the corpus. Verify against current docs.
- **Dimension parameter**: Default (3072) is fine for v1. If query latency becomes an issue with larger corpora later, `output_dimensionality: 768` is a reasonable downgrade per MRL.