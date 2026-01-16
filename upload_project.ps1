# Deploy/Upload Script
# Run this in PowerShell to upload your code to GitHub

Write-Host "Starting Upload..." -ForegroundColor Green

# 1. Add all changes
git add .

# 2. Commit
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "Final Update: $timestamp - Postgres, Blob, and Auth Fixes"

# 3. Push to Main
git push origin main

Write-Host "✅ Upload Complete!" -ForegroundColor Cyan
Pause
