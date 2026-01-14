import express from 'express';
import multer from 'multer';
import { authenticateToken } from '../middleware/auth.js';
import { getDb } from '../db/database.js';
import { promisifyDb } from '../db/utils.js';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.use(authenticateToken);

// Configure multer for file uploads
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Upload file to OpenAI and associate with project
// Upload file to OpenAI or store locally if using OpenRouter
router.post('/:projectId/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { projectId } = req.params;
    const db = getDb();
    const { get, run } = promisifyDb(db);

    // Verify project belongs to user
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [projectId, req.user.id]
    );

    if (!project) {
      // Clean up uploaded file
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Project not found' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;

    let fileData = {
      id: '',
      purpose: '',
      bytes: 0
    };

    // Check if we can use OpenAI Files API
    if (openaiKey && openaiKey.startsWith('sk-') && openaiKey !== 'your-openai-api-key-here') {
      // ... existing OpenAI logic ...
      try {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path), req.file.originalname);
        formData.append('purpose', 'assistants');

        const response = await axios.post(
          'https://api.openai.com/v1/files',
          formData,
          {
            headers: {
              'Authorization': `Bearer ${openaiKey}`,
              ...formData.getHeaders(),
            },
          }
        );

        fileData = response.data;
        // Clean up local file since it's on OpenAI servers
        fs.unlinkSync(req.file.path);

      } catch (apiError) {
        console.error('OpenAI Upload failed, falling back to local storage:', apiError.message);
        // Fallback to local storage
      }
    }

    // If no OpenAI key or upload failed, check if we can store locally (OpenRouter case)
    if (!fileData.id) {
      if (openrouterKey || (openaiKey && openaiKey !== 'your-openai-api-key-here')) {
        // Store locally
        // NB: Multer already saved it to req.file.path. We just keep it there.
        // Rename it to have extension for easier viewing if needed
        const fileExt = path.extname(req.file.originalname);
        const searchPath = path.join(path.dirname(req.file.path), req.file.filename + fileExt);
        fs.renameSync(req.file.path, searchPath);

        fileData = {
          id: `file-local-${req.file.filename}`, // Mock ID
          purpose: 'local_context',
          bytes: req.file.size
        };
      } else {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(500).json({
          error: 'File uploads require an API key (OpenAI or OpenRouter). Please check your .env file.'
        });
      }
    }

    // Save file reference to database
    await run(
      'INSERT INTO files (project_id, file_id, filename, purpose) VALUES (?, ?, ?, ?)',
      [projectId, fileData.id, req.file.originalname, fileData.purpose]
    );

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileData.id,
        filename: req.file.originalname,
        purpose: fileData.purpose,
        bytes: fileData.bytes,
      },
    });
  } catch (error) {
    // Clean up local file if it exists and wasn't processed
    if (req.file && fs.existsSync(req.file.path)) {
      // Only delete if we didn't just rename it effectively
      // Simplified: just try/catch unlink
      try { fs.unlinkSync(req.file.path); } catch (e) { }
    }

    console.error('File upload error:', error);
    res.status(500).json({
      error: 'Failed to upload file',
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// Get all files for a project
router.get('/:projectId', async (req, res) => {
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

    const files = await all(
      'SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC',
      [req.params.projectId]
    );

    res.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a file
router.delete('/:projectId/:fileId', async (req, res) => {
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

    const file = await get(
      'SELECT * FROM files WHERE id = ? AND project_id = ?',
      [req.params.fileId, req.params.projectId]
    );

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Delete from OpenAI or Local Storage
    const apiKey = process.env.OPENAI_API_KEY;

    if (file.file_id.startsWith('file-local-')) {
      // It's a local file, delete from disk
      // Original filename was stored in filename, but we saved it with extension in upload
      // We can try to finding it by the id suffix (which is the filename)
      // The upload logic: searchPath = path.join(path.dirname(req.file.path), req.file.filename + fileExt);
      // And ID: `file-local-${req.file.filename}`
      // We don't easily know the extension here without storing it. 
      // Start simple: try to specific file if we can, but since we didn't store the exact path in DB, 
      // we might skip strict disk cleanup for now to avoid deleting wrong files, or just try to match.
      // Actually, the uploaded file on disk is named matches the `req.file.filename` which IS the ID suffix.
      // The upload renamed it to include extension.
      // Let's iterate directory to find the file starting with that ID suffix (the random filename).

      const uploadsDir = path.join(__dirname, '..', 'uploads');
      const filePrefix = file.file_id.replace('file-local-', '');

      if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        const targetFile = files.find(f => f.startsWith(filePrefix));
        if (targetFile) {
          fs.unlinkSync(path.join(uploadsDir, targetFile));
          console.log('Deleted local file:', targetFile);
        }
      }

    } else if (apiKey && apiKey.startsWith('sk-') && apiKey !== 'your-openai-api-key-here') {
      try {
        await axios.delete(`https://api.openai.com/v1/files/${file.file_id}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });
      } catch (error) {
        console.error('Error deleting file from OpenAI:', error.message);
        // Continue with database deletion
      }
    }

    // Delete from database
    await run(
      'DELETE FROM files WHERE id = ? AND project_id = ?',
      [req.params.fileId, req.params.projectId]
    );

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;

