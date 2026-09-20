# Capacinator

A comprehensive project capacity planning system that replaces Excel-based planning with a modern web application.

> 📖 **使用说明书 / User Manual**:[docs/USER_MANUAL_zh-CN.md](docs/USER_MANUAL_zh-CN.md)(中文,含快速上手、全部页面详解、典型流程与常见问题)

## Features

- **Project Management**: Track projects, phases, and timelines
- **Resource Allocation**: Assign people to projects with conflict detection
- **Capacity Planning**: Monitor utilization and availability
- **Excel Integration**: Import existing planning data from Excel templates
- **Dashboard Analytics**: Visual charts and metrics for project health
- **Conflict Detection**: Automatic detection of resource over-allocation and scheduling conflicts
- **Fiscal Week Support**: Import and manage data using fiscal week format (24FW36-25FW11)
- **Standalone Application**: Runs as a native desktop app with embedded SQLite database

## Quick Start

### Prerequisites

- Node.js 20+ 
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Capacinator
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Initialize database**
   ```bash
   npm run db:init
   npm run db:migrate
   npm run db:seed
   ```

4. **Start development servers**
   ```bash
   npm run dev
   ```

   This starts:
   - Backend server on http://localhost:3000
   - Frontend development server on http://localhost:3456
   - Electron app (optional)

### Usage

1. **Import Data**: Navigate to Import page and upload Excel files using the fiscal week template format
2. **View Dashboard**: Monitor project health, resource utilization, and key metrics
3. **Manage Projects**: Create, edit, and track project status and timelines
4. **Assign Resources**: Allocate team members to projects with automatic conflict detection
5. **Monitor Capacity**: Track team availability and workload distribution

## Excel Template Format

The system supports importing from Excel files with fiscal week columns (24FW36-25FW11). Key sheets include:

- **Master Data**: Locations, project types, phases, roles
- **People**: Team members and their roles
- **Projects**: Project details and timelines
- **Project Roadmap**: Phase assignments by fiscal week
- **Assignments**: Resource allocations

## Testing

### Unit Tests
```bash
npm test
```

### End-to-End Tests
```bash
# Run E2E tests
npm run test:e2e

# Run with UI mode
npm run test:e2e:ui

# Run in headed mode (visible browser)
npm run test:e2e:headed
```

E2E tests cover:
- Navigation and UI interactions
- Data table functionality
- Excel import workflows
- Form validation and CRUD operations
- Assignment conflict detection
- Dashboard charts and metrics
- Error handling and edge cases

## Build and Distribution

### Development Build
```bash
npm run build
```

### Standalone Executables
```bash
# All platforms
npm run dist

# Windows
npm run dist:win

# macOS
npm run dist:mac

# Linux
npm run dist:linux
```

## Architecture

- **Backend**: Node.js, Express, TypeScript, SQLite
- **Frontend**: React, Vite, TypeScript, React Query
- **Database**: SQLite with Knex.js ORM
- **Charts**: Recharts for data visualization
- **Testing**: Jest (unit), Playwright (E2E)
- **Packaging**: Electron for standalone executables

## API Endpoints

- `GET/POST/PUT/DELETE /api/projects` - Project management
- `GET/POST/PUT/DELETE /api/people` - Team member management  
- `GET/POST/PUT/DELETE /api/assignments` - Resource assignments
- `POST /api/import` - Excel file import
- `GET /api/dashboard/metrics` - Dashboard analytics
- `GET /api/assignments/conflicts` - Conflict detection

## Database Schema

Key tables:
- `projects` - Project details and metadata
- `people` - Team members and their information
- `roles` - Available roles and permissions
- `assignments` - Resource allocations to projects
- `project_phases` - Phase definitions and timelines
- `availability_overrides` - Time-off and availability changes

## Development Scripts

- `npm run dev` - Start all development servers
- `npm run dev:server` - Backend server only
- `npm run dev:client` - Frontend only
- `npm run lint` - Code linting
- `npm run typecheck` - TypeScript validation
- `npm run db:init` - Initialize database
- `npm run db:migrate` - Run database migrations
- `npm run db:seed` - Seed test data

## Project Structure

```
Capacinator/
├── src/
│   ├── server/           # Backend server code
│   │   ├── api/          # REST API endpoints
│   │   ├── database/     # Database migrations and models
│   │   ├── services/     # Business logic
│   │   └── utils/        # Utilities
│   └── electron/         # Electron main process
├── client/               # React frontend
├── e2e/                  # End-to-end tests
├── test-data/            # Sample Excel files
├── docs/                 # Documentation
└── assets/               # Icons and resources
```

## Data Storage

All data is stored locally in:
- Windows: `%APPDATA%/Capacinator/`
- Mac: `~/Library/Application Support/Capacinator/`
- Linux: `~/.config/Capacinator/`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Run `npm run lint` and `npm run typecheck`
5. Run test suite: `npm test && npm run test:e2e`
6. Submit pull request

## License

MIT License - see LICENSE file for details