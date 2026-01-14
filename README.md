# 🌌 Chatbot Platform (Deep Cosmos Edition)

A modern, full-stack AI project management and chat application featuring a stunning "Deep Cosmos" dark theme, seamless file context analysis, and support for multiple LLM providers (OpenAI, OpenRouter).

![Platform Preview](https://via.placeholder.com/800x400?text=Chatbot+Platform+Deep+Cosmos+Theme)

## ✨ Features

### 🎨 Deep Cosmos UI
- **Immersive Design**: A premium dark aesthetic with deep blue backgrounds, glassmorphism effects, and neon accents.
- **Dynamic Interactions**: Smooth animations, hover effects, and responsive layout.
- **Visual Consistency**: Polished components from dashboard to chat interface.

### 🧠 Smart AI Chat
- **Context-Aware**: Upload text-based files (Code, Markdown, logs, etc.) directly in the chat.
- **Intelligent Analysis**: The system injects file content into the AI's context window, allowing it to answer questions about your specific data.
- **Token Optimization**: Smart truncation ensures you stay within API limits (32k char limit) while maximizing context.

### 🚀 Project Management
- **Dashboard**: Organize your AI conversations into Projects.
- **Prompts Library**: Save and manage system prompts for consistent AI behavior.
- **History**: diverse chat history persistence using SQLite.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, React Router, Axios
- **Backend**: Node.js, Express.js
- **Database**: SQLite (Zero-config local database)
- **AI Integration**: OpenAI API / OpenRouter API

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/Shivarajkumar21/Chatbot_platform.git
    cd Chatbot_platform
    ```

2.  **Install Dependencies**
    ```bash
    # Install server dependencies
    cd server
    npm install

    # Install client dependencies
    cd ../client
    npm install
    ```

3.  **Environment Setup**
    - Copy `server/env.example` to `server/.env`.
    - Add your API Key (`OPENAI_API_KEY` or `OPENROUTER_API_KEY`).
    ```bash
    # server/.env
    PORT=3000
    JWT_SECRET=your_super_secret_key
    
    # Choose Provider: 'openai' or 'openrouter'
    LLM_PROVIDER=openrouter
    OPENROUTER_API_KEY=sk-...
    ```

4.  **Run the Application**
    You can run both client and server with a single command from the root (if configured) or separately:

    ```bash
    # terminal 1 (Server)
    cd server
    npm run dev

    # terminal 2 (Client)
    cd client
    npm run dev
    ```

5.  **Access the App**
    Open `http://localhost:5173` (or the port shown in your terminal).

## 📂 Project Structure

```
chatbot-platform/
├── client/                 # React Frontend
│   ├── src/
│   │   ├── pages/         # Dashboard, ProjectDetail, Auth
│   │   └── index.css      # Global "Deep Cosmos" Styles
├── server/                 # Express Backend
│   ├── routes/            # API Routes (chat, files, projects)
│   ├── db/                # SQLite Database
│   └── uploads/           # Secure local file storage
└── README.md
```

## 🔐 Security
- **Local Storage**: User files are stored locally on your server, not shared with third parties (except the AI provider for analysis).
- **JWT Auth**: Secure authentication for user sessions.
- **Env Protection**: API keys are managed via environment variables.

## 🤝 Contributing
Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License
This project is open source and available under the [MIT License](LICENSE).
