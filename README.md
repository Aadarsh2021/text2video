# ScriptLLM Studio — AI Model & API Playground

ScriptLLM Studio is an interactive AI Model Studio & API Playground designed for short video scriptwriting and structured LLM inference.

## Features
- **Model Selector**: Autodetects local Ollama models (`qwen2.5:7b`, `llama3.1:8b`, `gemma2:9b`, `mistral:7b`), OpenAI models (`gpt-4o-mini`), or built-in offline simulator.
- **Model Parameter Tuning**: System prompt editor, temperature slider (0.0 to 1.5), max tokens slider, and language selector (Hinglish, Hindi, English).
- **Model Inference Engine**: Real-time prompt testing with latency counter.
- **Multi-Tab Results Workspace**:
  1. **Formatted Script Card**: Clean, structured view of title, viral hook, scene lines, caption, and hashtags.
  2. **Raw Model JSON Output**: Direct JSON response payload from the LLM.
  3. **API Integration Exporter**: Ready-to-copy code snippets in cURL, Python (`requests`), and JavaScript (`fetch`) to call the API in your own projects.

## Getting Started

1. **Start the server**:
   ```bash
   npm start
   ```
2. **Open in browser**:
   Navigate to `http://localhost:4173`
