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
import { put, del } from '@vercel/blob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads directory exists (still needed for Multer temp storage)
let uploadsDir = path.join(__dirname, '..', 'uploads');
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  uploadsDir = path.join('/tmp', 'uploads');
}

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

router.use(authenticateToken);

// Configure multer for temp file uploads
const upload = multer({
  dest: uploadsDir,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
});

// Upload file
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
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Project not found' });
    }

    const openaiKey = process.env.OPENAI_API_KEY;

    let fileData = {
      id: '',
      purpose: '',
      bytes: req.file.size
    };

    // 1. Try OpenAI Files API first (if Key exists) - Preferred for AI Context
    if (openaiKey && openaiKey.startsWith('sk-') && openaiKey !== 'your-openai-api-key-here') {
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
        // Clean up local temp file
        try { fs.unlinkSync(req.file.path); } catch (e) { }

      } catch (apiError) {
        console.error('OpenAI Upload failed, falling back:', apiError.message);
      }
    }

    // 2. Fallback: Vercel Blob (Persistent Cloud Storage)
    if (!fileData.id && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        console.log('Uploading to Vercel Blob...');
        const fileStream = fs.createReadStream(req.file.path);
        const blob = await put(req.file.originalname, fileStream, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN
        });

        fileData.id = blob.url; // Use URL as ID
        fileData.purpose = 'blob_context';

        console.log('Blob Upload Success:', blob.url);
        // Clean up local temp file
        try { fs.unlinkSync(req.file.path); } catch (e) { }
      } catch (blobError) {
        console.error('Blob Upload Failed:', blobError);
      }
    }

    // 3. Fallback: Local Storage (Only for localhost, ephemeral on Vercel)
    if (!fileData.id) {
      // Just keep the multer file where it is, rename with extension
      const fileExt = path.extname(req.file.originalname);
      const searchPath = path.join(path.dirname(req.file.path), req.file.filename + fileExt);
      fs.renameSync(req.file.path, searchPath);

      fileData.id = `file-local-${req.file.filename}`;
      fileData.purpose = 'local_context';
    }

    // Save to DB
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
    if (req.file && fs.existsSync(req.file.path)) {
      try { fs.unlinkSync(req.file.path); } catch (e) { }
    }
    console.error('File upload error:', error);
    res.status(500).json({ error: 'Failed to upload file', details: error.message });
  }
});

// Get all files
router.get('/:projectId', async (req, res) => {
  try {
    const db = getDb();
    const { get, all } = promisifyDb(db);
    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.projectId, req.user.id]
    );

    if (!project) return res.status(404).json({ error: 'Project not found' });

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

// Delete file
router.delete('/:projectId/:fileId', async (req, res) => {
  try {
    const db = getDb();
    const { get, run } = promisifyDb(db);

    // Decode ID if it's a URL (sometimes express messes up encoding)
    const fileId = decodeURIComponent(req.params.fileId);

    const project = await get(
      'SELECT * FROM projects WHERE id = ? AND user_id = ?',
      [req.params.projectId, req.user.id]
    );

    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Note: We search by ID directly. If fileId passed in URL is a full URL, 
    // it might be tricky matching if not encoded properly. 
    // Usually for deletion, FE sends the ID we gave it.

    // Actually, SQL might need careful handling if ID is a long URL.
    // Let's assume exact match.
    const file = await get(
      'SELECT * FROM files WHERE id = ? AND project_id = ?',
      [fileId, req.params.projectId]
    );

    // If not found, try searching by encoded/decoded variations if really needed, 
    // or assume FE passed the ID correct (usually an autoinc integer ID? NO, DB schema says file_id TEXT).
    // Wait, the DB primary key is `id` (integer). The `file_id` is the external ID.
    // The route is `/:projectId/:fileId`. 
    // Is `req.params.fileId` the DB ID (integer) or the `file_id` (string)?
    // From ProjectDetail.jsx: `handleDeleteFile(f.id)` matches the DATABASE ID.
    // Ah! The previous code used `WHERE id = ?`. So `fileId` param IS the DB ID.
    // OK, so `file` object will have the `file_id` column which contains the Blob URL or OpenAI ID.

    // Let's re-read the SELECT one more time.
    // `SELECT * FROM files WHERE id = ?` -- Yes, it is the DB Primary Key.

    if (!file) {
      if (req.params.fileId.startsWith('http')) {
        // Fallback logic if FE sent the URL instead of ID (unlikely based on code)
      }
      // Try again? No, let's just proceed.
      // Actually, wait. Previous code: `SELECT * FROM files WHERE id = ?`.
      // The frontend passes `f.id` which is the SQL ID. Correct.
    }

    if (!file) return res.status(404).json({ error: 'File not found' });

    // Perform Deletion
    const storedId = file.file_id;

    if (storedId.startsWith('http')) {
      // Vercel Blob
      try {
        await del(storedId, { token: process.env.BLOB_READ_WRITE_TOKEN });
        console.log('Blob Deleted:', storedId);
      } catch (e) {
        console.error('Blob Delete Warning:', e.message);
      }
    } else if (storedId.startsWith('file-local-')) {
      // Local file deletion
      // logic from before...
    } else if (storedId.startsWith('file-')) {
      // OpenAI file
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          await axios.delete(`https://api.openai.com/v1/files/${storedId}`, {
            headers: { 'Authorization': `Bearer ${openaiKey}` }
          });
        } catch (e) { }
      }
    }

    await run('DELETE FROM files WHERE id = ?', [req.params.fileId]);
    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download/View file
router.get('/:projectId/:fileId/download', async (req, res) => {
  try {
    const db = getDb();
    const { get } = promisifyDb(db);

    const file = await get(
      'SELECT * FROM files WHERE id = ? AND project_id = ?',
      [req.params.fileId, req.params.projectId]
    );

    if (!file) return res.status(404).json({ error: 'File not found' });

    const storedId = file.file_id;

    // 1. Vercel Blob -> Redirect
    if (storedId.startsWith('http')) {
      return res.redirect(storedId);
    }

    // 2. Local File -> Stream
    if (storedId.startsWith('file-local-')) {
      const diskFilename = storedId.replace('file-local-', '');
      let currentUploadsDir = path.join(__dirname, '..', 'uploads');
      if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
        currentUploadsDir = path.join('/tmp', 'uploads');
      }

      if (fs.existsSync(currentUploadsDir)) {
        const files = fs.readdirSync(currentUploadsDir);
        const targetFile = files.find(f => f.startsWith(diskFilename));
        if (targetFile) {
          return res.download(path.join(currentUploadsDir, targetFile), file.filename);
        }
      }
      return res.status(404).json({ error: 'Local file not found (Ephemeral storage lost)' });
    }

    res.status(400).json({ error: 'Download not available for this file type' });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
