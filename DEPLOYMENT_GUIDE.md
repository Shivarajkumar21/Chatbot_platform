# 🚀 Deployment Guide: Vercel & Render

This guide explains how to deploy your **Chatbot Platform** for free using **Vercel** (Frontend) and **Render** (Backend).

---

## Part 1: Backend on Render.com
Render will host your Node.js server and SQLite database.

1.  **Sign Up/Login**: Go to [render.com](https://render.com) and log in with GitHub.
2.  **New Service**: Click **"New +"** → **"Web Service"**.
3.  **Connect Repo**: Select your repository (`Shivarajkumar21/Chatbot_platform`).
4.  **Configure Settings**:
    *   **Name**: `chatbot-backend` (or similar)
    *   **Region**: Closest to you (e.g., Singapore, Frankfurt, Oregon)
    *   **Branch**: `main`
    *   **Root Directory**: `server` (Important! Type this in)
    *   **Runtime**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `npm start`
    *   **Plan**: Free
5.  **Environment Variables**:
    Scroll down to "Environment Variables" and add these:
    *   `PORT`: `10000`
    *   `JWT_SECRET`: (Paste a long random string)
    *   `LLM_PROVIDER`: `openai`
    *   `OPENAI_API_KEY`: (Paste your key start with sk-...)
    *   *(Or use OPENROUTER keys if preferred)*
6.  **Create Service**: Click **"Create Web Service"**.
7.  **Wait**: It will take a few minutes. Once live, copy your **onrender.com URL** (e.g., `https://chatbot-backend.onrender.com`).
    *   *Note: The first load might be slow as the free instance spins up.*

---

## Part 2: Frontend on Vercel
Vercel will host your React interface.

1.  **Sign Up/Login**: Go to [vercel.com](https://vercel.com) and log in with GitHub.
2.  **Add New**: Click **"Add New..."** → **"Project"**.
3.  **Import Repo**: Find `Chatbot_platform` and click **"Import"**.
4.  **Configure Project**:
    *   **Framework Preset**: Vite (should detect automatically)
    *   **Root Directory**: Click "Edit" and select `client`.
5.  **Environment Variables**:
    Expand the "Environment Variables" section and add:
    *   **Key**: `VITE_API_URL`
    *   **Value**: Your Render Backend URL + `/api` (e.g., `https://chatbot-backend.onrender.com/api`)
    *   *Make sure to include `/api` at the end!*
6.  **Deploy**: Click **"Deploy"**.

---

## Part 3: Verify
1.  Open your **Vercel app URL**.
2.  Wait a moment (Render backend sleeps when inactive).
3.  Try to **Sign Up** or **Log in**.
4.  Start chatting!

---

## ⚠️ Important Note on Data
On the **Render Free Tier**, your file system (where `database.sqlite` lives) is **ephemeral**. 
This means if the server restarts or redeploys, **your users and chats will be reset**.

To keep data permanently:
- **Option A**: Upgrade to a Render Paid Plan ("Disk" feature).
- **Option B**: Use an external database like **Turso** or **Neon** (requires code changes).
- **Option C**: Use **Vercel Postgres** (requires code changes, option 2 in the previous selection).

For a demo or portfolio project, the current setup is perfect! 🚀
