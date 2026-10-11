# CMIS Cloud Sync Specification

## Overview
This document specifies the requirements and implementation plan for adding cloud synchronization to the CMIS (Clinic Medicine Inventory System) desktop application using Cloudflare D1 and a SQLite sync service.

## Current State

### Application Architecture
- **Platform**: Tauri 2 desktop application (Rust backend + React frontend)
- **Database**: Local SQLite via `tauri-plugin-sql` (file: `cmis.db`)
- **Tech Stack**: React 19, TanStack Router, TypeScript, Rust
- **Current Data Model**: 13 SQLite migrations with the following tables:
  - `requests` - medication request queue
  - `request_history` - status change audit trail
  - `request_notes` - internal notes
  - `dispensing_records` - dispensing logs
  - `inventory_items` - inventory catalog
  - `inventory_batches` - batch/expiry tracking
  - `vocabulary_terms` - controlled vocabulary

### Current Database Access
- Frontend accesses SQLite via `@tauri-apps/plugin-sql`
- Database operations in TypeScript (e.g., `apps/desktop/src/features/requests/persistence.ts`)
- No backend API currently
- No authentication
- Local-first architecture (no cloud, no telemetry)

## Requirements

### 1. Architecture Goals
- **Keep desktop app** as primary interface (do not replace with web app)
- **Add bidirectional cloud sync** for multi-device access
- **Maintain offline-first** behavior - desktop must work without internet
- **Single-tenant** - one database for single clinic (no multi-tenancy isolation needed)
- **No authentication** - trusted environment, no login/logout required

### 2. Cloud Infrastructure
- **Database**: Cloudflare D1 (SQLite-compatible serverless database)
- **Backend**: Cloudflare Workers (for sync API endpoints)
- **Deployment**: Cloudflare Workers/Direct (free tier)
- **Configuration**: Wrangler CLI (device already authenticated)
- **Budget**: Free tier only (Workers + D1 free tiers)

### 3. Sync Requirements
- **Direction**: Bidirectional sync (desktop ↔ cloud)
- **Real-time**: Yes, real-time synchronization across devices
- **Offline Support**: Critical - desktop must work offline, sync when connection restored
- **Conflict Resolution**: Last-write-wins (timestamp-based)
- **Sync Protocol**: SQLite sync service (ElectricSQL or PowerSync)
- **Migration**: One-time migration script for existing local data
- **Sync Triggers**:
  - Throttled/scheduled (on save, app focus, periodic intervals)
  - Manual sync button for user control

### 4. Data Model Constraints
- Schema must remain compatible with existing SQLite migrations
- All 13 migrations must apply to D1 database
- Tables: requests, request_history, request_notes, dispensing_records, inventory_items, inventory_batches, vocabulary_terms
- Existing indexes must be preserved
- Foreign key relationships must be maintained

## Implementation Requirements

### 1. Environment Variables / Configuration
Via Wrangler (device already authenticated):

**Required for D1:**
- `CLOUDFLARE_ACCOUNT_ID` - Cloudflare account ID
- `D1_DATABASE_ID` - D1 database binding ID
- `D1_DATABASE_NAME` - D1 database name (e.g., `cmis-prod`)

**Required for Workers:**
- `WORKER_NAME` - Worker deployment name
- `API_ENDPOINT` - Production Worker URL (e.g., `https://cmis-sync.your-subdomain.workers.dev`)

**Optional:**
- `SYNC_INTERVAL_MS` - Sync polling interval (default: 30000ms)
- `OFFLINE_QUEUE_MAX_SIZE` - Max offline operations queued (default: 1000)

### 2. D1 Database Setup
**Before implementation:**
```bash
# Create D1 database
wrangler d1 create cmis-prod

# Get database ID from output, add to wrangler.toml
# Apply all migrations to D1
wrangler d1 execute cmis-prod --file=apps/desktop/src-tauri/migrations/0001_request_queue.sql
wrangler d1 execute cmis-prod --file=apps/desktop/src-tauri/migrations/0002_inventory.sql
# ... repeat for all 13 migrations
```

**wrangler.toml configuration needed:**
```toml
[[d1_databases]]
binding = "DB"
database_name = "cmis-prod"
database_id = "<YOUR_D1_DATABASE_ID>"
```

### 3. SQLite Sync Service Selection
**Option A: ElectricSQL**
- Pros: Open-source, PostgreSQL-focused with SQLite compatibility, active development
- Cons: Requires Electric Cloud service or self-hosted
- Integration: ElectricSQL client in TypeScript, sync server on Workers

**Option B: PowerSync**
- Pros: SQLite-native, excellent conflict resolution, offline-first
- Cons: Commercial service (free tier available)
- Integration: PowerSync SDK in TypeScript, PowerSync service

**Recommendation:** PowerSync (better SQLite compatibility, built for this use case)

### 4. Cloudflare Workers Backend
**Required endpoints:**
- `POST /sync/pull` - Client pulls changes from cloud
- `POST /sync/push` - Client pushes changes to cloud
- `GET /sync/status` - Check sync status/last synced timestamp
- `POST /migrate/initial` - One-time migration endpoint (optional, can be script)

**Worker implementation:**
- TypeScript (or Rust Workers for performance)
- D1 binding for database access
- CORS support for desktop app
- Request validation
- Error handling and retry logic

### 5. Desktop Client Changes

**New dependencies:**
- PowerSync SDK (or ElectricSQL client)
- WebSocket client for real-time sync (if needed)
- Offline queue for sync operations

**New modules to create:**
- `apps/desktop/src/lib/sync/` - Sync logic
  - `sync-client.ts` - Main sync client
  - `offline-queue.ts` - Queue operations when offline
  - `conflict-resolver.ts` - Timestamp-based conflict resolution
  - `migration-script.ts` - One-time data migration
- `apps/desktop/src/components/sync/` - UI components
  - `sync-status-indicator.tsx` - Show sync status
  - `sync-button.tsx` - Manual sync trigger
  - `sync-settings.tsx` - Sync configuration UI

**Modified modules:**
- `apps/desktop/src/features/requests/persistence.ts` - Add sync hooks
- `apps/desktop/src/features/inventory/` - Add sync hooks to inventory operations
- `apps/desktop/src-tauri/tauri.conf.json` - Add sync configuration

**Sync integration points:**
- After `saveRequest()` → queue for sync
- After inventory changes → queue for sync
- On app focus → trigger sync
- Periodic interval → trigger sync
- Manual button → trigger sync immediately

### 6. Data Migration Script
**One-time migration:**
- Export local SQLite data to JSON/SQLite dump
- Import to D1 database via Wrangler or API
- Verify data integrity
- Set initial sync timestamp
- Mark migration complete in local database

**Script location:** `scripts/migrate-to-cloud.ts`

**Usage:**
```bash
pnpm migrate-to-cloud
```

### 7. Offline Behavior
**When offline:**
- All operations write to local SQLite (unchanged)
- Sync operations queued in memory/persistent queue
- UI shows "Offline" status
- Periodic retry when connection restored

**When online:**
- Process queued sync operations
- Pull latest changes from cloud
- Apply changes with conflict resolution
- Update UI with sync status

### 8. Conflict Resolution
**Strategy:** Last-write-wins based on timestamps

**Implementation:**
- Each table needs `updated_at` column (already exists on `inventory_items`)
- For tables without `updated_at`, add migration
- On sync conflict: compare `updated_at`, keep newer record
- Log conflicts for audit trail (optional)

**Tables needing `updated_at` migration:**
- `requests` - add `updated_at` column
- `request_history` - add `updated_at` column
- `request_notes` - add `updated_at` column
- `dispensing_records` - add `updated_at` column
- `inventory_batches` - add `updated_at` column
- `vocabulary_terms` - add `updated_at` column

### 9. Testing Requirements
**Unit tests:**
- Sync client logic
- Conflict resolution
- Offline queue
- Migration script

**Integration tests:**
- End-to-end sync flow
- Offline/online transitions
- Conflict scenarios
- Multi-device sync (if possible)

**Manual testing:**
- Deploy to preview environment
- Test with real data
- Verify offline behavior
- Test sync button

## Migration Checklist

### Phase 1: Infrastructure Setup
- [ ] Create Cloudflare D1 database
- [ ] Apply all 13 migrations to D1
- [ ] Create Cloudflare Worker project
- [ ] Configure Wrangler with D1 binding
- [ ] Deploy basic Worker with health check endpoint
- [ ] Test D1 connectivity from Worker

### Phase 2: Backend API
- [ ] Implement `/sync/pull` endpoint
- [ ] Implement `/sync/push` endpoint
- [ ] Implement `/sync/status` endpoint
- [ ] Add CORS configuration
- [ ] Add error handling and logging
- [ ] Deploy to preview environment
- [ ] Test endpoints with curl/Postman

### Phase 3: Sync Service Integration
- [ ] Choose and install sync service SDK (PowerSync recommended)
- [ ] Initialize sync client in desktop app
- [ ] Implement offline queue
- [ ] Implement conflict resolver
- [ ] Add sync hooks to existing persistence layer
- [ ] Test sync with empty database

### Phase 4: Data Migration
- [ ] Create migration script
- [ ] Test migration with development data
- [ ] Run migration on production data
- [ ] Verify data integrity
- [ ] Set initial sync state

### Phase 5: UI Integration
- [ ] Create sync status indicator component
- [ ] Create manual sync button
- [ ] Add sync settings (optional)
- [ ] Integrate into main UI
- [ ] Test user experience

### Phase 6: Offline Behavior
- [ ] Implement offline detection
- [ ] Test offline queue
- [ ] Test reconnection sync
- [ ] Verify data consistency

### Phase 7: Testing & Deployment
- [ ] Write unit tests
- [ ] Write integration tests
- [ ] Manual testing on preview
- [ ] Deploy to production
- [ ] Monitor for issues
- [ ] Rollback plan ready

## Open Questions / Decisions Needed

1. **Sync Service Selection**: PowerSync vs ElectricSQL? (PowerSync recommended for SQLite compatibility)
2. **Sync Service Tier**: Free tier sufficient, or paid plan needed for production?
3. **Real-time Mechanism**: WebSocket for real-time, or polling with sub-minute intervals?
4. **Conflict Logging**: Should conflicts be logged for audit trail, or silently resolved?
5. **Migration Rollback**: If migration fails, how to recover local database state?
6. **Sync Scope**: Sync all tables, or subset (e.g., exclude vocabulary_terms)?

## Risks & Mitigations

### Risk 1: Sync Service Complexity
- **Risk**: SQLite sync services may be complex to integrate
- **Mitigation**: Start with simple polling-based sync before adding real-time WebSocket
- **Fallback**: Implement custom sync logic if service integration fails

### Risk 2: Offline Data Loss
- **Risk**: Offline queue overflow before sync
- **Mitigation**: Persistent queue on disk, limit queue size, warn user
- **Fallback**: Manual export/import for critical offline data

### Risk 3: D1 Schema Changes
- **Risk**: D1 schema diverges from local SQLite
- **Mitigation**: Use same migration files for both, version lock schema
- **Fallback**: Schema validation before sync

### Risk 4: Cost Overrun
- **Risk**: Free tier limits exceeded
- **Mitigation**: Monitor usage, implement rate limiting
- **Fallback**: Archive old data, implement data retention policy

### Risk 5: Migration Failure
- **Risk**: Data loss during migration
- **Mitigation**: Backup local database before migration, test on copy
- **Fallback**: Restore from backup, retry migration

## Success Criteria

1. Desktop app works offline without degradation
2. Sync completes successfully within 30 seconds of reconnection
3. No data loss during sync operations
4. Conflicts resolved automatically without user intervention
5. Free tier limits not exceeded under normal usage
6. Migration script completes without errors
7. Multi-device access works with last-write-wins semantics
8. Sync status visible and understandable to users

## Next Steps

1. **Decision**: Choose sync service (PowerSync vs ElectricSQL)
2. **Setup**: Create D1 database and apply migrations
3. **Proof of Concept**: Implement basic Worker with D1 connectivity
4. **Service Integration**: Integrate chosen sync service SDK
5. **Migration**: Develop and test migration script
6. **Integration**: Add sync hooks to existing code
7. **Testing**: Comprehensive testing of sync behavior
8. **Deployment**: Deploy to production with monitoring

## References

- Cloudflare D1 Documentation: https://developers.cloudflare.com/d1/
- Cloudflare Workers Documentation: https://developers.cloudflare.com/workers/
- PowerSync: https://www.powersync.com/
- ElectricSQL: https://electric-sql.com/
- Tauri SQL Plugin: https://github.com/tauri-apps/plugin-sql
- CMIS Repository: https://github.com/Drakaniia/cmis
