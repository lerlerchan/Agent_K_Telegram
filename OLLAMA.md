# Ollama Integration Guide — Free/Cheap LLM for Educators

This guide explains how to use Ollama (free, open-source LLMs) with Agent K to reduce API costs and enable offline operation.

---

## What is Ollama?

[Ollama](https://ollama.com) is a tool to run open-weight LLMs locally on your machine. Models like Llama 3.2, Mistral, Phi-3, and Qwen run without internet, API keys, or costs.

**Use cases:**
- Educators teaching with AI — free, privacy-respecting models
- Offline operation — no cloud dependencies
- Cost control — run simple Q&A locally, use expensive Claude for complex tasks
- Experimentation — test different models without committing to a provider

---

## Installation

### macOS & Linux

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### Windows

Download from [ollama.com/download](https://ollama.com/download) and run the installer.

### Docker

```bash
docker run -d --name ollama \
  -v ollama:/root/.ollama \
  -p 11434:11434 \
  ollama/ollama
```

Then: `docker exec ollama ollama pull llama3.2`

---

## Step 1: Pull a Model

Ollama's model library: [ollama.com/library](https://ollama.com/library)

**For educators (laptop-friendly):**

```bash
# Ultra-light (2-4 GB RAM)
ollama pull llama3.2:3b
ollama pull gemma3:1b
ollama pull phi3:mini

# General purpose (8 GB RAM+)
ollama pull llama3.1:8b
ollama pull mistral
ollama pull qwen2.5:7b

# Reasoning & coding (good for teaching)
ollama pull deepseek-r1:7b
ollama pull deepseek-coder

# OpenAI open-weight (best reasoning, 16 GB RAM)
ollama pull gpt-oss:20b
```

**Hardware guide:**
- **4 GB RAM**: `llama3.2:3b`, `gemma3:1b`, `phi3:mini` (quantized)
- **8 GB RAM**: `mistral`, `qwen2.5:7b`, `deepseek-r1:7b`
- **16 GB+ RAM**: `llama3.1:8b`, `qwen2.5:14b`, `gpt-oss:20b`
- **GPU (CUDA/Metal)**: Any model up to 70B parameters

**Cloud option** — If local models are too slow, use Ollama's cloud models (free tier):
```bash
ollama pull kimi-k2.5        # Moonshot AI (very fast)
ollama pull minimax-m2       # Top for coding
```

---

## Step 2: Start Ollama Server

**Background service (default):**

```bash
ollama serve
```

This runs on `http://localhost:11434` by default. The server starts automatically on system boot (if installed via installer).

**Verify it's running:**

```bash
curl http://localhost:11434/api/tags
```

Should return a list of available models in JSON.

---

## Step 3: Configure Agent K

Edit `.env`:

```bash
# Use Ollama for all simple messages (educator mode)
OLLAMA_DEFAULT=true

# Or use default routing: Ollama for simple Q&A, Claude for complex tasks
OLLAMA_DEFAULT=false

# Model to use
OLLAMA_MODEL=llama3.2

# Show which model answered
SHOW_MODEL_FOOTER=true

# (Optional) Remote Ollama server on different host
OLLAMA_BASE_URL=http://192.168.1.100:11434
```

**Restart Agent K:**

```bash
npm start
# or
npm run dev
```

---

## How It Works

### Default Routing (OLLAMA_DEFAULT=false)

Agent K automatically routes messages:

| Message | Routed to | Why |
|---------|-----------|-----|
| `hello` | Ollama | Simple greeting |
| `what time is it?` | Ollama | Factual lookup |
| `define serendipity` | Ollama | Definition |
| `translate hello to Spanish` | Ollama | Translation |
| `2+2=?` | Ollama | Simple math |
| `book a flight` | Claude | Complex (browser automation) |
| `fix this bug in my code` | Claude | Complex (code analysis) |
| `create invoice` | Claude | Complex (needs skills) |
| `use Playwright to check in` | Claude | Complex (MCP needed) |

**Manual override:**

```
/ollama what is the capital of France?
```

Forces Ollama routing, regardless of complexity.

### Educator Mode (OLLAMA_DEFAULT=true)

All messages route to Ollama **except:**
- Complex tasks (detected via keyword patterns)
- Playwright browser automation
- Skills invocation (`/skill-name`)
- File processing (uploads)

This minimizes Claude API usage while maintaining advanced functionality when needed.

---

## Monitoring

Check which model answered in responses (if `SHOW_MODEL_FOOTER=true`):

```
Why is the sky blue? ...

---
[Answered by: llama3.2 via Ollama]
```

Or without footer, track via logs:

```bash
tail -f logs/activity/2025-03-01.log | grep -i ollama
```

---

## Cost Comparison

### Claude 3.5 Sonnet (Cloud)

- Input: $3 / 1M tokens
- Output: $15 / 1M tokens
- **Average cost: $0.005 per message** (5K tokens)

### Ollama (Local)

- $0.00 per message
- $0 GPU cost (use existing machine)
- Data never leaves your device
- Privacy: No logs sent to Anthropic

**Savings for 100 students asking 10 questions each:**
- Claude only: 1000 messages × $0.005 = **$5 / day**
- Ollama + Claude (hybrid): ~50% Claude use = **$2.50 / day**
- Ollama only: **$0.00 / day**

---

## Model Selection by Use Case

| Use Case | Recommended Model | Why |
|----------|-------------------|-----|
| Teaching intro CS | `mistral:7b` | Fast, accurate, reliable |
| Math/reasoning | `deepseek-r1:7b` | Chain-of-thought |
| Coding assignments | `deepseek-coder:6.7b` | Trained on 87 languages |
| Non-English | `qwen2.5:7b` | Excellent Chinese, Malay, multilingual |
| Minimal laptop | `llama3.2:3b` | Only 2GB, surprisingly good |
| Best quality | `gpt-oss:20b` (if 16GB) | OpenAI open weights |
| Remote server | Cloud models (Kimi, MiniMax) | No local GPU needed |

---

## Troubleshooting

### "Connection refused" / Ollama not found

```bash
# Make sure Ollama is running
ollama serve

# Check if server is up
curl http://localhost:11434/api/tags
```

### Model too slow

Try a smaller model:
```bash
ollama pull llama3.2:3b      # (faster)
ollama pull mistral          # (faster than 7b variants)
```

Or enable GPU acceleration:
- **macOS**: Uses Metal GPU automatically
- **Linux/Windows with NVIDIA**: Install CUDA support
- **AMD**: Ollama supports ROCm (AMD GPUs)

### Out of memory errors

Reduce model size or increase swap:

```bash
# Linux — increase swap
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### "I want to use a cloud model"

Ollama supports cloud models via its registry. Sign in at [ollama.com](https://ollama.com), then:

```bash
ollama pull kimi-k2.5
```

These run on Ollama's servers, visible to your Agent K without code changes.

---

## Advanced: Remote Ollama Server

If your teacher machine is powerful but student machines are weak:

**Teacher machine:**
```bash
OLLAMA_BASE_URL=http://teacher-machine.local:11434 ollama serve
```

**Student Agent K:**
```bash
OLLAMA_BASE_URL=http://teacher-machine.local:11434
```

All students' requests go to the teacher's GPU.

---

## FAQ

**Q: Can I use both Claude and Ollama at the same time?**
A: Yes! That's the default (OLLAMA_DEFAULT=false). Simple tasks use Ollama, complex tasks use Claude.

**Q: What if Ollama is down?**
A: Agent K silently falls back to Claude. No error shown to users.

**Q: Can I use a different Ollama model per user?**
A: Currently no, but you can set `OLLAMA_MODEL` globally. For per-user models, request enhancement on GitHub.

**Q: Is my data private?**
A: Yes, completely. Local Ollama models keep all conversations on your machine.

**Q: Can I run Ollama in production (many users)?**
A: Yes, but you'll need a powerful GPU. Test with your hardware first. Cloud models (Kimi, MiniMax) scale better.

**Q: What models are best for teaching programming?**
A: `deepseek-coder:6.7b` (87 languages) or `llama3.1:8b` (good general coding).

---

## Resources

- [Ollama Library](https://ollama.com/library)
- [Cloud Models (free tier available)](https://ollama.com/search?c=cloud)
- [Ollama Documentation](https://docs.ollama.com)
- [Model Comparison (HuggingFace)](https://huggingface.co/blog/daya-shankar/open-source-llms)
- [Setting up Ollama in Docker](https://github.com/ollama/ollama#docker)
