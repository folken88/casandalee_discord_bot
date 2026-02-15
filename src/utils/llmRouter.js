/**
 * LLM Router for Casandalee
 * Routes requests to the appropriate LLM backend:
 *   - Tier 1 (Background): Ollama qwen2.5:7b — compaction, parsing, dossier generation
 *   - Tier 2 (User-facing): Claude Haiku 3.5 — most interactive responses
 *   - Tier 3 (Complex): Claude Sonnet / GPT-4 — deep analysis, fallback
 */

const logger = require('./logger');

class LLMRouter {
    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:5080';
        this.ollamaModelFast = process.env.OLLAMA_MODEL_FAST || 'qwen2.5:7b';
        this.ollamaModelQuality = process.env.OLLAMA_MODEL_QUALITY || 'llama3.1:8b';
        this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || null;
        this.openaiApiKey = process.env.OPENAI_API_KEY || null;

        // Lazy-loaded clients
        this._anthropicClient = null;
        this._openaiClient = null;

        // Stats tracking
        this.stats = {
            ollama: { calls: 0, errors: 0, totalTokens: 0 },
            claude: { calls: 0, errors: 0, totalTokens: 0 },
            openai: { calls: 0, errors: 0, totalTokens: 0 }
        };
    }

    /**
     * Get or create the Anthropic client (lazy-loaded)
     * @returns {Object|null} - Anthropic SDK client
     */
    getAnthropicClient() {
        if (!this.anthropicApiKey) return null;
        if (!this._anthropicClient) {
            try {
                const Anthropic = require('@anthropic-ai/sdk');
                this._anthropicClient = new Anthropic({ apiKey: this.anthropicApiKey });
            } catch (err) {
                logger.error('Failed to load Anthropic SDK:', err.message);
                return null;
            }
        }
        return this._anthropicClient;
    }

    /**
     * Get or create the OpenAI client (lazy-loaded)
     * @returns {Object|null} - OpenAI SDK client
     */
    getOpenAIClient() {
        if (!this.openaiApiKey) return null;
        if (!this._openaiClient) {
            try {
                const OpenAI = require('openai');
                this._openaiClient = new OpenAI({ apiKey: this.openaiApiKey });
            } catch (err) {
                logger.error('Failed to load OpenAI SDK:', err.message);
                return null;
            }
        }
        return this._openaiClient;
    }

    /**
     * Send a request to Ollama (local LLM on RTX 5080)
     * Best for: background tasks, data parsing, compaction, dossier generation
     * @param {string} prompt - User/task prompt
     * @param {Object} options - Configuration options
     * @param {string} [options.system] - System prompt
     * @param {string} [options.model] - Override model (default: fast)
     * @param {number} [options.maxTokens=500] - Max output tokens
     * @param {number} [options.temperature=0.3] - Temperature
     * @returns {Promise<string>} - Generated text
     */
    async ollamaGenerate(prompt, options = {}) {
        const model = options.model || this.ollamaModelFast;
        const maxTokens = options.maxTokens || 500;
        const temperature = options.temperature ?? 0.3;

        try {
            const body = {
                model,
                prompt: options.system ? `${options.system}\n\n${prompt}` : prompt,
                stream: false,
                options: {
                    num_predict: maxTokens,
                    temperature
                }
            };

            const response = await fetch(`${this.ollamaUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(options.timeout || 60000)
            });

            if (!response.ok) {
                throw new Error(`Ollama HTTP ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();
            this.stats.ollama.calls++;
            this.stats.ollama.totalTokens += (data.eval_count || 0);

            logger.debug(`Ollama [${model}] responded`, {
                tokens: data.eval_count,
                duration: data.total_duration ? `${(data.total_duration / 1e9).toFixed(1)}s` : 'unknown'
            });

            return data.response?.trim() || '';
        } catch (err) {
            this.stats.ollama.errors++;
            logger.error(`Ollama error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send a chat request to Ollama (multi-turn format)
     * @param {Array} messages - Chat messages [{role, content}]
     * @param {Object} options - Configuration options
     * @returns {Promise<string>} - Generated text
     */
    async ollamaChat(messages, options = {}) {
        const model = options.model || this.ollamaModelFast;

        try {
            const body = {
                model,
                messages,
                stream: false,
                options: {
                    num_predict: options.maxTokens || 500,
                    temperature: options.temperature ?? 0.3
                }
            };

            const response = await fetch(`${this.ollamaUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(options.timeout || 60000)
            });

            if (!response.ok) {
                throw new Error(`Ollama chat HTTP ${response.status}: ${await response.text()}`);
            }

            const data = await response.json();
            this.stats.ollama.calls++;
            this.stats.ollama.totalTokens += (data.eval_count || 0);

            return data.message?.content?.trim() || '';
        } catch (err) {
            this.stats.ollama.errors++;
            logger.error(`Ollama chat error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send a request to Claude (Anthropic)
     * Best for: user-facing responses, personality-flavored content
     * @param {string} prompt - User prompt
     * @param {Object} options - Configuration options
     * @param {string} [options.system] - System prompt
     * @param {string} [options.model='claude-3-5-haiku-latest'] - Model name
     * @param {number} [options.maxTokens=300] - Max output tokens
     * @param {number} [options.temperature=0.7] - Temperature
     * @returns {Promise<string>} - Generated text
     */
    async claudeGenerate(prompt, options = {}) {
        const client = this.getAnthropicClient();
        if (!client) {
            throw new Error('Anthropic API not configured');
        }

        const model = options.model || 'claude-3-5-haiku-latest';
        const maxTokens = options.maxTokens || 300;
        const temperature = options.temperature ?? 0.7;

        try {
            const requestBody = {
                model,
                max_tokens: maxTokens,
                messages: [{ role: 'user', content: prompt }]
            };

            if (options.system) {
                requestBody.system = options.system;
            }

            if (temperature !== undefined) {
                requestBody.temperature = temperature;
            }

            const response = await client.messages.create(requestBody);

            this.stats.claude.calls++;
            this.stats.claude.totalTokens += (response.usage?.output_tokens || 0);

            logger.debug(`Claude [${model}] responded`, {
                inputTokens: response.usage?.input_tokens,
                outputTokens: response.usage?.output_tokens
            });

            return response.content?.[0]?.text?.trim() || '';
        } catch (err) {
            this.stats.claude.errors++;
            logger.error(`Claude error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send an image + prompt to Claude for vision analysis
     * Best for: character sheet parsing, image description
     * @param {string} prompt - Text prompt describing what to extract
     * @param {Buffer} imageBuffer - Image data as Buffer
     * @param {string} mediaType - MIME type (e.g., 'image/png', 'image/jpeg')
     * @param {Object} options - Configuration options
     * @param {string} [options.system] - System prompt
     * @param {string} [options.model='claude-3-5-haiku-latest'] - Model name
     * @param {number} [options.maxTokens=1000] - Max output tokens
     * @returns {Promise<string>} - Generated text
     */
    async claudeVision(prompt, imageBuffer, mediaType, options = {}) {
        const client = this.getAnthropicClient();
        if (!client) {
            throw new Error('Anthropic API not configured');
        }

        const model = options.model || 'claude-3-5-haiku-latest';
        const maxTokens = options.maxTokens || 1000;

        try {
            const base64Image = imageBuffer.toString('base64');

            const requestBody = {
                model,
                max_tokens: maxTokens,
                messages: [{
                    role: 'user',
                    content: [
                        {
                            type: 'image',
                            source: {
                                type: 'base64',
                                media_type: mediaType,
                                data: base64Image
                            }
                        },
                        {
                            type: 'text',
                            text: prompt
                        }
                    ]
                }]
            };

            if (options.system) {
                requestBody.system = options.system;
            }

            const response = await client.messages.create(requestBody);

            this.stats.claude.calls++;
            this.stats.claude.totalTokens += (response.usage?.output_tokens || 0);

            logger.debug(`Claude Vision [${model}] responded`, {
                inputTokens: response.usage?.input_tokens,
                outputTokens: response.usage?.output_tokens
            });

            return response.content?.[0]?.text?.trim() || '';
        } catch (err) {
            this.stats.claude.errors++;
            logger.error(`Claude Vision error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send a chat request to Claude (multi-turn)
     * @param {Array} messages - Chat messages [{role, content}]
     * @param {Object} options - Configuration options
     * @returns {Promise<string>} - Generated text
     */
    async claudeChat(messages, options = {}) {
        const client = this.getAnthropicClient();
        if (!client) {
            throw new Error('Anthropic API not configured');
        }

        const model = options.model || 'claude-3-5-haiku-latest';

        try {
            const requestBody = {
                model,
                max_tokens: options.maxTokens || 300,
                messages
            };

            if (options.system) {
                requestBody.system = options.system;
            }
            if (options.temperature !== undefined) {
                requestBody.temperature = options.temperature;
            }

            const response = await client.messages.create(requestBody);

            this.stats.claude.calls++;
            this.stats.claude.totalTokens += (response.usage?.output_tokens || 0);

            return response.content?.[0]?.text?.trim() || '';
        } catch (err) {
            this.stats.claude.errors++;
            logger.error(`Claude chat error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send a request to OpenAI GPT (fallback/complex analysis)
     * @param {string} prompt - User prompt
     * @param {Object} options - Configuration options
     * @param {string} [options.system] - System prompt
     * @param {string} [options.model='gpt-3.5-turbo'] - Model name
     * @param {number} [options.maxTokens=200] - Max output tokens
     * @param {number} [options.temperature=0.7] - Temperature
     * @returns {Promise<string>} - Generated text
     */
    async openaiGenerate(prompt, options = {}) {
        const client = this.getOpenAIClient();
        if (!client) {
            throw new Error('OpenAI API not configured');
        }

        const model = options.model || 'gpt-3.5-turbo';

        try {
            const messages = [];
            if (options.system) {
                messages.push({ role: 'system', content: options.system });
            }
            messages.push({ role: 'user', content: prompt });

            const response = await client.chat.completions.create({
                model,
                messages,
                max_tokens: options.maxTokens || 200,
                temperature: options.temperature ?? 0.7
            });

            this.stats.openai.calls++;
            this.stats.openai.totalTokens += (response.usage?.total_tokens || 0);

            return response.choices[0].message.content?.trim() || '';
        } catch (err) {
            this.stats.openai.errors++;
            logger.error(`OpenAI error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Smart routing: choose the best backend for the task
     * @param {string} prompt - The prompt
     * @param {Object} options - Options including task type
     * @param {string} options.task - Task type: 'background', 'user-facing', 'complex', 'personality'
     * @param {string} [options.system] - System prompt
     * @param {number} [options.maxTokens] - Max tokens
     * @param {number} [options.temperature] - Temperature
     * @returns {Promise<{text: string, provider: string}>} - Response and which provider was used
     */
    async route(prompt, options = {}) {
        const task = options.task || 'user-facing';

        // Tier 1: Background tasks -> Ollama (free, unlimited)
        if (task === 'background') {
            try {
                const text = await this.ollamaGenerate(prompt, options);
                return { text, provider: 'ollama' };
            } catch (err) {
                logger.warn('Ollama failed for background task, falling back to Claude Haiku');
                // Fall through to tier 2
            }
        }

        // Tier 2: User-facing / personality -> Claude Haiku (fast, cheap)
        if (task === 'user-facing' || task === 'personality') {
            if (this.anthropicApiKey) {
                try {
                    const text = await this.claudeGenerate(prompt, {
                        ...options,
                        model: options.model || 'claude-3-5-haiku-latest'
                    });
                    return { text, provider: 'claude-haiku' };
                } catch (err) {
                    logger.warn('Claude Haiku failed, falling back to OpenAI');
                    // Fall through to tier 3
                }
            }
        }

        // Tier 3: Complex analysis -> Claude Sonnet or GPT-4
        if (task === 'complex') {
            if (this.anthropicApiKey) {
                try {
                    const text = await this.claudeGenerate(prompt, {
                        ...options,
                        model: 'claude-3-5-sonnet-latest'
                    });
                    return { text, provider: 'claude-sonnet' };
                } catch (err) {
                    logger.warn('Claude Sonnet failed, falling back to GPT-4');
                }
            }

            if (this.openaiApiKey) {
                try {
                    const text = await this.openaiGenerate(prompt, {
                        ...options,
                        model: 'gpt-4'
                    });
                    return { text, provider: 'gpt-4' };
                } catch (err) {
                    logger.error('GPT-4 also failed:', err.message);
                }
            }
        }

        // Final fallback: try whatever is available
        if (this.openaiApiKey) {
            try {
                const text = await this.openaiGenerate(prompt, options);
                return { text, provider: 'openai-fallback' };
            } catch (err) {
                logger.error('OpenAI fallback failed:', err.message);
            }
        }

        // Try Ollama as absolute last resort
        try {
            const text = await this.ollamaGenerate(prompt, {
                ...options,
                model: this.ollamaModelQuality
            });
            return { text, provider: 'ollama-fallback' };
        } catch (err) {
            throw new Error('All LLM providers failed');
        }
    }

    /**
     * Check which providers are available
     * @returns {Promise<Object>} - Provider availability
     */
    async checkHealth() {
        const health = {
            ollama: false,
            claude: false,
            openai: false
        };

        // Check Ollama
        try {
            const response = await fetch(`${this.ollamaUrl}/api/tags`, {
                signal: AbortSignal.timeout(5000)
            });
            health.ollama = response.ok;
        } catch (err) {
            health.ollama = false;
        }

        // Check Claude
        health.claude = !!this.anthropicApiKey;

        // Check OpenAI
        health.openai = !!this.openaiApiKey;

        return health;
    }

    /**
     * Get usage statistics
     * @returns {Object} - Usage stats per provider
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset usage statistics
     */
    resetStats() {
        for (const key of Object.keys(this.stats)) {
            this.stats[key] = { calls: 0, errors: 0, totalTokens: 0 };
        }
    }
}

// Singleton instance
const llmRouter = new LLMRouter();

module.exports = llmRouter;
