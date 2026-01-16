import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { getDb } from '../db/database.js';
import { promisifyDb } from '../db/utils.js';
import axios from 'axios';

const router = express.Router();

router.use(authenticateToken);

// Send a chat message
router.post(
  '/:projectId',
  [
    body('message').trim().notEmpty().withMessage('Message is required'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { projectId } = req.params;
      const { message } = req.body;
      const db = getDb();
      const { get, all, run } = promisifyDb(db);

      // Verify project belongs to user
      const project = await get(
        'SELECT * FROM projects WHERE id = ? AND user_id = ?',
        [projectId, req.user.id]
      );

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Get system prompts for this project
      const prompts = await all(
        'SELECT content FROM prompts WHERE project_id = ? AND is_system_prompt = 1',
        [projectId]
      );

      // Get chat history (last 20 messages)
      const history = await all(
        'SELECT role, content FROM messages WHERE project_id = ? ORDER BY created_at DESC LIMIT 20',
        [projectId]
      );

      // Build messages array for API
      const messages = [];

      // Add system prompt if exists
      if (prompts.length > 0) {
        console.log('Using System Prompts:', prompts.map(p => p.content));
        messages.push({
          role: 'system',
          content: prompts.map(p => p.content).join('\n\n'),
        });
      } else {
        console.log('No System Prompts found for this project.');
      }

      // Add chat history (reverse to get chronological order)
      history.reverse().forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });

      // Add current user message
      messages.push({
        role: 'user',
        content: message,
      });

      // Save user message to database
      await run(
        'INSERT INTO messages (project_id, role, content) VALUES (?, ?, ?)',
        [projectId, 'user', message]
      );

      // Call LLM API
      const llmProvider = process.env.LLM_PROVIDER || 'openai';
      let assistantResponse;

      if (llmProvider === 'openrouter') {
        assistantResponse = await callOpenRouter(messages);
      } else {
        assistantResponse = await callOpenAI(messages);
      }

      // Save assistant response to database
      await run(
        'INSERT INTO messages (project_id, role, content) VALUES (?, ?, ?)',
        [projectId, 'assistant', assistantResponse]
      );

      res.json({
        message: assistantResponse,
      });
    } catch (error) {
      console.error('Chat error:', error);
      console.error('Error stack:', error.stack);

      // Provide more detailed error messages
      let errorMessage = 'Failed to get response';
      let statusCode = 500;

      if (error.message.includes('not configured')) {
        errorMessage = error.message;
        statusCode = 500;
      } else if (error.message.includes('API error')) {
        errorMessage = error.message;
        statusCode = 502; // Bad Gateway
      } else if (error.message.includes('No response')) {
        errorMessage = error.message;
        statusCode = 504; // Gateway Timeout
      } else {
        errorMessage = error.message || 'Failed to get response from LLM';
      }

      res.status(statusCode).json({
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
  }
);

// Get chat history for a project
router.get('/:projectId/history', async (req, res) => {
  try {
    const db = getDb();
    const { get, all } = promisifyDb(db);
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.projectId, req.user.id]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const messages = await all(
      'SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC',
      [req.params.projectId]
    );

    res.json({ messages });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear chat history for a project
router.delete('/:projectId/history', async (req, res) => {
  try {
    const db = getDb();
    const { get, run } = promisifyDb(db);
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.projectId, req.user.id]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await run(
      'DELETE FROM messages WHERE project_id = ?',
      [req.params.projectId]
    );

    res.json({ message: 'Chat history cleared successfully' });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function callOpenAI(messages) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey === 'your-openai-api-key-here') {
    throw new Error('OPENAI_API_KEY not configured. Please set it in server/.env file');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-3.5-turbo';

  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages,
        temperature: 0.7,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response format from OpenAI API');
    }

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      // API responded with error status
      const errorMessage = error.response.data?.error?.message || error.response.data?.error || 'OpenAI API error';
      const statusCode = error.response.status;
      throw new Error(`OpenAI API error (${statusCode}): ${errorMessage}`);
    } else if (error.request) {
      // Request made but no response
      throw new Error('No response from OpenAI API. Check your internet connection.');
    } else {
      // Error in request setup
      throw new Error(`OpenAI API request error: ${error.message}`);
    }
  }
}

async function callOpenRouter(messages) {
  let apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || apiKey === 'your-openrouter-api-key-here') {
    throw new Error('OPENROUTER_API_KEY not configured. Please set it in server/.env file');
  }

  // Clean the key (remove possible whitespace/newlines from copy-paste)
  apiKey = apiKey.trim();

  console.log('Using OpenRouter Key:', apiKey.substring(0, 15) + '...');

  const model = process.env.OPENROUTER_MODEL || 'openai/gpt-3.5-turbo';

  // Use dynamic APP_URL if valid, or fallback to localhost
  const siteUrl = (process.env.APP_URL && process.env.APP_URL.startsWith('http'))
    ? process.env.APP_URL
    : 'https://chatbot-platform.vercel.app';

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model,
        messages,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': siteUrl,
          'X-Title': 'Chatbot Platform',
        },
      }
    );

    if (!response.data || !response.data.choices || !response.data.choices[0]) {
      throw new Error('Invalid response format from OpenRouter API');
    }

    return response.data.choices[0].message.content;
  } catch (error) {
    if (error.response) {
      // API responded with error status
      const errorMessage = error.response.data?.error?.message || error.response.data?.error || 'OpenRouter API error';
      const statusCode = error.response.status;
      throw new Error(`OpenRouter API error (${statusCode}): ${errorMessage}`);
    } else if (error.request) {
      // Request made but no response
      throw new Error('No response from OpenRouter API. Check your internet connection.');
    } else {
      // Error in request setup
      throw new Error(`OpenRouter API request error: ${error.message}`);
    }
  }
}

export default router;

