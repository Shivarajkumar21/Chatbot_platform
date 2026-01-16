import express from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken } from '../middleware/auth.js';
import { getDb } from '../db/database.js';
import { promisifyDb } from '../db/utils.js';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get all projects for the authenticated user
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { all } = promisifyDb(db);
    const projects = await all(
      'SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ projects });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get a specific project
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { get, all } = promisifyDb(db);
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get prompts for this project
    const prompts = await all(
      'SELECT * FROM prompts WHERE project_id = ? ORDER BY created_at DESC',
      [project.id]
    );

    res.json({ project, prompts });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new project
router.post(
  '/',
  [
    body('name').trim().notEmpty().withMessage('Project name is required'),
    body('description').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, description } = req.body;
      const db = getDb();
      const { get, run } = promisifyDb(db);

      const result = await run(
        'INSERT INTO projects (user_id, name, description) VALUES (?, ?, ?)',
        [req.user.id, name, description || null]
      );

      const project = await get('SELECT * FROM projects WHERE id = ?', [result.lastID]);

      res.status(201).json({
        message: 'Project created successfully',
        project,
      });
    } catch (error) {
      console.error('Error creating project:', error);
      res.status(500).json({
        error: 'Failed to create project',
        details: error.message,
        hint: 'Check server logs for PG Error'
      });
    }
  }
);

// Update a project
router.put(
  '/:id',
  [
    body('name').optional().trim().notEmpty(),
    body('description').optional().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { get, run } = promisifyDb(db);
      const project = await get(
        'SELECT * FROM projects WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const { name, description } = req.body;
      const updates = [];
      const params = [];

      if (name !== undefined) {
        updates.push('name = ?');
        params.push(name);
      }
      if (description !== undefined) {
        updates.push('description = ?');
        params.push(description);
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(req.params.id, req.user.id);

      await run(
        `UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
        params
      );

      const updatedProject = await get('SELECT * FROM projects WHERE id = ?', [req.params.id]);

      res.json({
        message: 'Project updated successfully',
        project: updatedProject,
      });
    } catch (error) {
      console.error('Error updating project:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Delete a project
router.delete('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { get, run } = promisifyDb(db);
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await run('DELETE FROM projects WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);

    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add/Update prompt for a project
router.post(
  '/:id/prompts',
  [
    body('content').trim().notEmpty().withMessage('Prompt content is required'),
    body('is_system_prompt').optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const db = getDb();
      const { get, run } = promisifyDb(db);
      const project = await get(
        'SELECT * FROM projects WHERE id = ? AND user_id = ?',
        [req.params.id, req.user.id]
      );

      if (!project) {
        return res.status(404).json({ error: 'Project not found' });
      }

      const { content, is_system_prompt } = req.body;

      const result = await run(
        'INSERT INTO prompts (project_id, content, is_system_prompt) VALUES (?, ?, ?)',
        [project.id, content, is_system_prompt ? 1 : 0]
      );

      const prompt = await get('SELECT * FROM prompts WHERE id = ?', [result.lastID]);

      res.status(201).json({
        message: 'Prompt added successfully',
        prompt,
      });
    } catch (error) {
      console.error('Error adding prompt:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Get all prompts for a project
router.get('/:id/prompts', async (req, res) => {
  try {
    const db = getDb();
    const { get, all } = promisifyDb(db);
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const prompts = await all(
      'SELECT * FROM prompts WHERE project_id = ? ORDER BY created_at DESC',
      [project.id]
    );

    res.json({ prompts });
  } catch (error) {
    console.error('Error fetching prompts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a prompt
router.delete('/:projectId/prompts/:promptId', async (req, res) => {
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
      'DELETE FROM prompts WHERE id = ? AND project_id = ?',
      [req.params.promptId, req.params.projectId]
    );

    res.json({ message: 'Prompt deleted successfully' });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

