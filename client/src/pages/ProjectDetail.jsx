import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import './ProjectDetail.css';

function ProjectDetail({ onLogout }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [prompts, setPrompts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);

  // Restored missing variables
  const [newPrompt, setNewPrompt] = useState({ content: '', is_system_prompt: false });
  const [files, setFiles] = useState([]);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // New variables for file upload
  const [pendingFile, setPendingFile] = useState(null);
  const chatInputFileRef = useRef(null);

  useEffect(() => {
    fetchProjectData();
    fetchChatHistory();
    fetchFiles();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchProjectData = async () => {
    try {
      const response = await api.get(`/projects/${id}`);
      setProject(response.data.project);
      setPrompts(response.data.prompts || []);
    } catch (error) {
      toast.error('Failed to fetch project');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchChatHistory = async () => {
    try {
      const response = await api.get(`/chat/${id}/history`);
      setMessages(response.data.messages || []);
    } catch (error) {
      console.error('Failed to fetch chat history');
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await api.get(`/files/${id}`);
      setFiles(response.data.files || []);
    } catch (error) {
      console.error('Failed to fetch files');
    }
  };

  const handleInputFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPendingFile(file);
    }
    // Reset input so same file can be selected again if needed
    e.target.value = '';
  };

  const clearPendingFile = () => {
    setPendingFile(null);
  };

  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if ((!inputMessage.trim() && !pendingFile) || sending) return;

    let attachmentMessage = '';

    setSending(true);

    try {
      // 1. Upload File if present
      if (pendingFile) {
        const formData = new FormData();
        formData.append('file', pendingFile);

        // Show a temporary loading toast or indicator if desired
        // const uploadToast = toast.loading('Uploading attachment...');

        const uploadResponse = await api.post(`/files/${id}/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        // toast.success('Attached!', { id: uploadToast });
        await fetchFiles(); // Refresh sidebar list
        setPendingFile(null); // Clear pending file

        // Optional context message
        attachmentMessage = `[Attached file: ${pendingFile.name}]\n`;
      }

      // 2. Send Message
      const textToSend = attachmentMessage + inputMessage;
      if (!textToSend.trim()) {
        setSending(false);
        return;
      }

      const userMessage = { role: 'user', content: textToSend, created_at: new Date().toISOString() };
      setMessages((prev) => [...prev, userMessage]);
      setInputMessage('');

      const response = await api.post(`/chat/${id}`, { message: textToSend });
      const assistantMessage = {
        role: 'assistant',
        content: response.data.message,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Failed to send message';
      console.error('Chat error:', error);
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  const handleAddPrompt = async (e) => {
    e.preventDefault();
    try {
      const response = await api.post(`/projects/${id}/prompts`, newPrompt);
      setPrompts([response.data.prompt, ...prompts]);
      setShowPromptModal(false);
      setNewPrompt({ content: '', is_system_prompt: false });
      toast.success('Prompt added successfully!');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to add prompt');
    }
  };

  const handleDeletePrompt = async (promptId) => {
    if (!window.confirm('Delete this prompt?')) return;
    try {
      await api.delete(`/projects/${id}/prompts/${promptId}`);
      setPrompts(prompts.filter((p) => p.id !== promptId));
      toast.success('Prompt deleted');
    } catch (error) {
      toast.error('Failed to delete prompt');
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    const toastId = toast.loading('Uploading file...');
    try {
      await api.post(`/files/${id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      toast.success('File uploaded!', { id: toastId });
      fetchFiles();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to upload', { id: toastId });
    }
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Delete this file?')) return;
    try {
      await api.delete(`/files/${id}/${fileId}`);
      setFiles(files.filter((f) => f.id !== fileId));
      toast.success('File deleted');
    } catch (error) {
      toast.error('Failed to delete file');
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading">Loading Project...</div>
      </div>
    );
  }

  return (
    <div className="project-detail-container">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <button className="btn-back-sidebar" onClick={() => navigate('/dashboard')} title="Back to Dashboard">
            ←
          </button>
          <div className="project-title" title={project?.name}>{project?.name}</div>
        </div>

        <div className="sidebar-content">
          {/* Prompts Section */}
          <div className="sidebar-section">
            <h3>
              System Prompts
              <button onClick={() => setShowPromptModal(true)} title="Add Prompt">+</button>
            </h3>
            <div className="sidebar-list">
              {prompts.length === 0 ? (
                <div className="empty-sidebar-text">No prompts defined</div>
              ) : (
                prompts.map((p) => (
                  <div key={p.id} className="sidebar-item">
                    <div className="item-content">
                      <div className="item-title">{p.content}</div>
                      <div className="item-subtitle">{p.is_system_prompt ? 'System' : 'User'}</div>
                    </div>
                    <button className="btn-delete-icon" onClick={() => handleDeletePrompt(p.id)}>×</button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Files Section */}
          <div className="sidebar-section">
            <h3>
              Context Files
              <button onClick={() => fileInputRef.current?.click()} title="Upload File">↑</button>
            </h3>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <div className="sidebar-list">
              {files.length === 0 ? (
                <div className="empty-sidebar-text">No files uploaded</div>
              ) : (
                files.map((f) => (
                  <div key={f.id} className="sidebar-item">
                    <div className="item-content">
                      <div className="item-title">{f.filename}</div>
                      <div className="item-subtitle">Context</div>
                    </div>
                    <button className="btn-delete-icon" onClick={() => handleDeleteFile(f.id)}>×</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <div className="chat-area">
          <div className="chat-wrapper">
            {messages.length === 0 ? (
              <div className="empty-chat">
                <p>Start a new conversation with <strong>{project?.name}</strong></p>
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} className={`message-group ${msg.role}`}>
                  <div className={`message-avatar ${msg.role === 'user' ? 'avatar-user' : 'avatar-assistant'}`}>
                    {msg.role === 'user' ? 'U' : 'AI'}
                  </div>
                  <div className="message-bubble">
                    <div className="message-content">{msg.content}</div>
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="message-group">
                <div className="message-avatar avatar-assistant">AI</div>
                <div className="message-bubble">
                  <span className="typing-indicator">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="input-area-wrapper">
          <form className="chat-input-container" onSubmit={handleSendMessage}>
            {/* Hidden Input for Chat Attachment */}
            <input
              type="file"
              ref={chatInputFileRef}
              onChange={handleInputFileSelect}
              style={{ display: 'none' }}
            />

            <button
              type="button"
              className="btn-attach"
              onClick={() => chatInputFileRef.current?.click()}
              title="Attach a file"
              disabled={sending}
            >
              📎
            </button>

            <div className="input-field-wrapper">
              {pendingFile && (
                <div className="attachment-chip">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{pendingFile.name}</span>
                  <button type="button" className="btn-remove-file" onClick={clearPendingFile}>×</button>
                </div>
              )}
              <input
                type="text"
                className="chat-input"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={pendingFile ? "Add a message..." : "Message your agent..."}
                disabled={sending}
              />
            </div>

            <button type="submit" className="btn-send" disabled={sending || (!inputMessage.trim() && !pendingFile)}>
              <span className="btn-send-icon">➤</span>
            </button>
          </form>
        </div>
      </main>

      {/* Modal - Kept same logic, just rendering conditionally */}
      {showPromptModal && (
        <div className="modal-overlay" onClick={() => setShowPromptModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Prompt</h2>
            <form onSubmit={handleAddPrompt}>
              <div className="form-group">
                <label>Content</label>
                <textarea
                  value={newPrompt.content}
                  onChange={(e) => setNewPrompt({ ...newPrompt, content: e.target.value })}
                  rows="5"
                  required
                  placeholder="Enter prompt..."
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={newPrompt.is_system_prompt}
                    onChange={(e) => setNewPrompt({ ...newPrompt, is_system_prompt: e.target.checked })}
                  />
                  System Prompt
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowPromptModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProjectDetail;

