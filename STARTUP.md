# MTG Drafting App - Startup Guide

## Prerequisites

- Python 3.8+ (with venv)
- Node.js 18+ and npm
- Git

## Initial Setup (First Time Only)

### 1. Backend Setup

```bash
# Create and activate virtual environment (if not already created)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install Python dependencies
pip install django djangorestframework django-cors-headers \
    djangorestframework-simplejwt channels daphne requests

# Run database migrations
python manage.py migrate
```

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install

# Return to project root
cd ..
```

## Starting the Application

### Quick Start (From Project Root)

**Terminal 1 - Backend:**
```bash
source venv/bin/activate
python manage.py runserver 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

### Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:8000
- **Admin Panel:** http://localhost:8000/admin

## Tech Stack

### Backend
- Django 6.0.1
- Django REST Framework 3.16.1
- Django Channels (WebSocket support)
- JWT Authentication (djangorestframework-simplejwt)
- SQLite Database

### Frontend
- React 18
- Vite 5.4
- Tailwind CSS 4.1
- React Router 6.30
- Axios for API calls

## Project Structure

```
magic_app-2/
├── drafting/           # Main drafting app
├── puzzles/            # Puzzles app
├── mtg_drafting/       # Project settings
├── frontend/           # React frontend
├── venv/               # Python virtual environment
├── db.sqlite3          # SQLite database
└── manage.py           # Django management script
```

## Common Tasks

### Create Superuser (Admin Access)
```bash
source venv/bin/activate
python manage.py createsuperuser
```

### Load Sample Puzzles
```bash
source venv/bin/activate
python manage.py load_sample_puzzles
# Use --force to recreate existing puzzles
python manage.py load_sample_puzzles --force
```

### Run Migrations (After Model Changes)
```bash
source venv/bin/activate
python manage.py makemigrations
python manage.py migrate
```

### Install New Python Package
```bash
source venv/bin/activate
pip install <package-name>
```

### Install New Frontend Package
```bash
cd frontend
npm install <package-name>
```

## Configuration Notes

- Backend CORS is configured for `http://localhost:3000`
- Frontend proxies `/api` requests to backend at `http://localhost:8000`
- JWT tokens: 1 hour access token, 7 day refresh token
- WebSocket support via Django Channels (in-memory layer)
- **Tailwind CSS v4**: Uses `@tailwindcss/vite` plugin (configured in `vite.config.js`)

## Troubleshooting

### Backend won't start
- Ensure virtual environment is activated
- Check if port 8000 is already in use: `lsof -i :8000`
- Verify migrations are applied: `python manage.py migrate`

### Frontend won't start
- Ensure dependencies are installed: `cd frontend && npm install`
- Check if port 3000 is already in use: `lsof -i :3000`
- Clear Vite cache: `rm -rf frontend/node_modules/.vite`

### CORS errors
- Verify frontend is running on port 3000
- Check CORS settings in `mtg_drafting/settings.py`

## Development Notes

### Puzzle System
- See `PUZZLE_SYSTEM_OVERVIEW.md` for complete documentation
- Sample puzzles available via `python manage.py load_sample_puzzles`
- Interactive game engine with spell casting, combat, and targeting
- Access puzzles at `/puzzles` route in the frontend

### Recent Fixes
- **2026-01-28**: Fixed Tailwind CSS v4 configuration (PostCSS plugin conflict resolved)

---

**Last Updated:** 2026-01-28
