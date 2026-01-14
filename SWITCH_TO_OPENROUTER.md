# Switching to OpenRouter API

## Quick Setup

### Step 1: Update server/.env file

Make sure your `server/.env` file has:

```env
PORT=5000
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES_IN=7d

# LLM Provider: 'openai' or 'openrouter'
LLM_PROVIDER=openrouter

# OpenAI Configuration (not needed if using OpenRouter)
# OPENAI_API_KEY=your-openai-api-key-here
# OPENAI_MODEL=gpt-3.5-turbo

# OpenRouter Configuration
OPENROUTER_API_KEY=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
OPENROUTER_MODEL=openai/gpt-3.5-turbo

# App URL (for OpenRouter)
APP_URL=http://localhost:3000
```

### Step 2: Restart Server

After updating `.env`, restart your server:
```bash
# Stop server (Ctrl+C)
# Then start again:
npm run dev
```

## Available OpenRouter Models

You can change `OPENROUTER_MODEL` to any of these:

### OpenAI Models:
- `openai/gpt-3.5-turbo` - Fast and affordable
- `openai/gpt-4` - More capable but expensive
- `openai/gpt-4-turbo` - Latest GPT-4

### Anthropic Claude:
- `anthropic/claude-3-opus` - Most capable
- `anthropic/claude-3-sonnet` - Balanced
- `anthropic/claude-3-haiku` - Fastest

### Google:
- `google/gemini-pro` - Google's model

### Others:
- `meta-llama/llama-3-70b-instruct`
- `mistralai/mistral-large`
- And many more!

See all models at: https://openrouter.ai/models

## Benefits of OpenRouter

1. **Multiple Providers** - Access to many LLM providers
2. **Often Cheaper** - Pay-as-you-go pricing
3. **Easy Switching** - Change models without changing code
4. **Free Credits** - New accounts get free credits

## Troubleshooting

### If you get "OPENROUTER_API_KEY not configured":
- Make sure `server/.env` exists (not just `env.example`)
- Verify `OPENROUTER_API_KEY` is set
- Make sure `LLM_PROVIDER=openrouter`
- Restart server after changing `.env`

### If API calls fail:
- Check your OpenRouter account has credits
- Verify API key is valid at https://openrouter.ai/keys
- Check server console for specific error messages

### Test OpenRouter API:
```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer YOUR_OPENROUTER_KEY"
```

If you get a list of models, your key is valid!

