/**
 * LLM Router for Casandalee
 * Routes requests to the appropriate LLM backend:
 *   - Tier 1 (Background): Ollama — compaction, parsing, dossier generation
 *   - Tier 2 (Personality): Claude Haiku first, Ollama fallback
 *   - Tier 3 (Complex): Claude Sonnet, Ollama fallback
 * From Docker, OLLAMA_URL should be http://ollama:11434 (Docker network).
 */

const logger = require('./logger');

class LLMRouter {
    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://ollama:11434';
        this.ollamaModelFast = process.env.OLLAMA_MODEL_FAST || 'qwen2.5:14b';
        this.ollamaModelQuality = process.env.OLLAMA_MODEL_QUALITY || 'llama3.1:8b';
        this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || null;
        this.openrouterApiKey = process.env.OPENROUTER_API_KEY || null;
        this.openrouterBaseUrl = 'https://openrouter.ai/api/v1';
        this.openrouterModel = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4-5';

        // Lazy-loaded clients
        this._anthropicClient = null;

        // Stats tracking
        this.stats = {
            ollama: { calls: 0, errors: 0, totalTokens: 0 },
            claude: { calls: 0, errors: 0, totalTokens: 0 },
            openrouter: { calls: 0, errors: 0, totalTokens: 0 }
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
     * Send a request to Ollama (local LLM)
     * Best for: background tasks, data parsing, compaction, dossier generation
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
                think: false,  // Disable thinking mode (gemma4 defaults to thinking)
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
     */
    async ollamaChat(messages, options = {}) {
        const model = options.model || this.ollamaModelFast;

        try {
            const body = {
                model,
                messages,
                stream: false,
                think: false,  // Disable thinking mode (gemma4 defaults to thinking which eats tokens)
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
     */
    async claudeGenerate(prompt, options = {}) {
        const client = this.getAnthropicClient();
        if (!client) {
            throw new Error('Anthropic API not configured');
        }

        const model = options.model || 'claude-haiku-4-5';
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
     */
    async claudeVision(prompt, imageBuffer, mediaType, options = {}) {
        const client = this.getAnthropicClient();
        if (!client) {
            throw new Error('Anthropic API not configured');
        }

        const model = options.model || 'claude-haiku-4-5';
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

            return response.content?.[0]?.text?.trim() || '';
        } catch (err) {
            this.stats.claude.errors++;
            logger.error(`Claude Vision error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send a chat request to Claude (multi-turn)
     */
    async claudeChat(messages, options = {}) {
        const client = this.getAnthropicClient();
        if (!client) {
            throw new Error('Anthropic API not configured');
        }

        const model = options.model || 'claude-haiku-4-5';

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
     * Send a request to OpenRouter (OpenAI-compatible API)
     * Fallback when Claude is rate-limited or unavailable
     */
    async openrouterGenerate(prompt, options = {}) {
        if (!this.openrouterApiKey) {
            throw new Error('OpenRouter API not configured');
        }

        const model = options.model || this.openrouterModel;
        const maxTokens = options.maxTokens || 300;
        const temperature = options.temperature ?? 0.7;

        try {
            const messages = [];
            if (options.system) {
                messages.push({ role: 'system', content: options.system });
            }
            messages.push({ role: 'user', content: prompt });

            const response = await fetch(`${this.openrouterBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openrouterApiKey}`,
                    'HTTP-Referer': 'https://github.com/casandalee-discord-bot',
                    'X-Title': 'Casandalee Discord Bot'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    temperature,
                    messages
                }),
                signal: AbortSignal.timeout(options.timeout || 60000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            this.stats.openrouter.calls++;
            this.stats.openrouter.totalTokens += (data.usage?.completion_tokens || 0);

            logger.debug(`OpenRouter [${model}] responded`, {
                inputTokens: data.usage?.prompt_tokens,
                outputTokens: data.usage?.completion_tokens
            });

            return data.choices?.[0]?.message?.content?.trim() || '';
        } catch (err) {
            this.stats.openrouter.errors++;
            logger.error(`OpenRouter error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send a chat request to OpenRouter (multi-turn)
     */
    async openrouterChat(messages, options = {}) {
        if (!this.openrouterApiKey) {
            throw new Error('OpenRouter API not configured');
        }

        const model = options.model || this.openrouterModel;

        try {
            const chatMessages = [];
            if (options.system) {
                chatMessages.push({ role: 'system', content: options.system });
            }
            // Convert Anthropic-style messages to OpenAI format (they're compatible)
            chatMessages.push(...messages);

            const response = await fetch(`${this.openrouterBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openrouterApiKey}`,
                    'HTTP-Referer': 'https://github.com/casandalee-discord-bot',
                    'X-Title': 'Casandalee Discord Bot'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: options.maxTokens || 300,
                    temperature: options.temperature ?? 0.7,
                    messages: chatMessages
                }),
                signal: AbortSignal.timeout(options.timeout || 60000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter chat HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            this.stats.openrouter.calls++;
            this.stats.openrouter.totalTokens += (data.usage?.completion_tokens || 0);

            return data.choices?.[0]?.message?.content?.trim() || '';
        } catch (err) {
            this.stats.openrouter.errors++;
            logger.error(`OpenRouter chat error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Send an image + prompt to OpenRouter for vision analysis
     */
    async openrouterVision(prompt, imageBuffer, mediaType, options = {}) {
        if (!this.openrouterApiKey) {
            throw new Error('OpenRouter API not configured');
        }

        const model = options.model || this.openrouterModel;
        const maxTokens = options.maxTokens || 1000;

        try {
            const base64Image = imageBuffer.toString('base64');
            const messages = [];
            if (options.system) {
                messages.push({ role: 'system', content: options.system });
            }
            messages.push({
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:${mediaType};base64,${base64Image}`
                        }
                    },
                    {
                        type: 'text',
                        text: prompt
                    }
                ]
            });

            const response = await fetch(`${this.openrouterBaseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.openrouterApiKey}`,
                    'HTTP-Referer': 'https://github.com/casandalee-discord-bot',
                    'X-Title': 'Casandalee Discord Bot'
                },
                body: JSON.stringify({
                    model,
                    max_tokens: maxTokens,
                    messages
                }),
                signal: AbortSignal.timeout(options.timeout || 120000)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`OpenRouter Vision HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            this.stats.openrouter.calls++;
            this.stats.openrouter.totalTokens += (data.usage?.completion_tokens || 0);

            return data.choices?.[0]?.message?.content?.trim() || '';
        } catch (err) {
            this.stats.openrouter.errors++;
            logger.error(`OpenRouter Vision error [${model}]:`, err.message);
            throw err;
        }
    }

    /**
     * Smart routing: choose the best backend for the task
     * @param {string} prompt - The prompt
     * @param {Object} options - Options including task type
     * @param {string} options.task - Task type: 'background', 'user-facing', 'complex', 'personality'
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

        // Tier 2: Personality / user-facing — Claude Haiku first, OpenRouter fallback, then Ollama
        if (task === 'user-facing' || task === 'personality') {
            if (this.anthropicApiKey) {
                try {
                    const text = await this.claudeGenerate(prompt, {
                        ...options,
                        model: options.model || 'claude-haiku-4-5'
                    });
                    return { text, provider: 'claude-haiku' };
                } catch (err) {
                    logger.warn('Claude Haiku failed, falling back to OpenRouter:', err.message);
                }
            }
            // Fallback 1: OpenRouter (cloud, same model quality as Claude)
            if (this.openrouterApiKey) {
                try {
                    const text = await this.openrouterGenerate(prompt, options);
                    return { text, provider: 'openrouter' };
                } catch (err) {
                    logger.warn('OpenRouter failed, falling back to Ollama:', err.message);
                }
            }
            // Fallback 2: Ollama fast model (free, local, fits in VRAM)
            // Use fallbackSystem prompt if provided (structured facts instead of full vault dump)
            try {
                const ollamaOpts = {
                    ...options,
                    model: this.ollamaModelFast,
                    maxTokens: options.maxTokens || 250,
                    temperature: options.temperature ?? 0.7,
                    timeout: 60000
                };
                if (options.fallbackSystem) {
                    ollamaOpts.system = options.fallbackSystem;
                    logger.info('📋 Using structured fact sheet for Ollama fallback');
                }
                const text = await this.ollamaGenerate(prompt, ollamaOpts);
                if (text && text.trim().length > 0) {
                    return { text: text.trim(), provider: 'ollama-fallback' };
                }
            } catch (err) {
                logger.warn('Ollama fallback failed:', err.message);
            }
        }

        // Tier 3: Complex analysis -> Claude Sonnet, OpenRouter, then Ollama quality model
        if (task === 'complex') {
            if (this.anthropicApiKey) {
                try {
                    const text = await this.claudeGenerate(prompt, {
                        ...options,
                        model: 'claude-sonnet-4-6'
                    });
                    return { text, provider: 'claude-sonnet' };
                } catch (err) {
                    logger.warn('Claude Sonnet failed, falling back to OpenRouter');
                }
            }
            if (this.openrouterApiKey) {
                try {
                    const text = await this.openrouterGenerate(prompt, options);
                    return { text, provider: 'openrouter' };
                } catch (err) {
                    logger.warn('OpenRouter failed for complex task, falling back to Ollama');
                }
            }
        }

        // Final fallback: Ollama quality model, then OpenRouter as absolute last resort
        try {
            const text = await this.ollamaGenerate(prompt, {
                ...options,
                model: this.ollamaModelQuality
            });
            return { text, provider: 'ollama-fallback' };
        } catch (err) {
            if (this.openrouterApiKey) {
                try {
                    const text = await this.openrouterGenerate(prompt, options);
                    return { text, provider: 'openrouter-lastresort' };
                } catch (err2) {
                    throw new Error('All LLM providers failed (Claude + OpenRouter + Ollama)');
                }
            }
            throw new Error('All LLM providers failed (Claude + Ollama)');
        }
    }

    /**
     * Check which providers are available
     */
    async checkHealth() {
        const health = {
            ollama: false,
            claude: false,
            openrouter: false
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

        // Check OpenRouter
        health.openrouter = !!this.openrouterApiKey;

        return health;
    }

    /**
     * Get usage statistics
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
