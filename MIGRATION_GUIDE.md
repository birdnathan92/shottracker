# Data Persistence Fix - Migration Guide

## Overview
Your app now has a fixed database schema to ensure all your data (rounds, clubs, courses, shots) persists permanently across app redeployments. However, you need to run a migration on your existing Supabase database to add the new columns.

## Why This is Needed
The original database schema had columns that didn't match what the app was trying to save:
- `rounds` table had `course_id` (foreign key) but app saves `course_name` (text)
- `rounds` table had `total_putts` but app saves `total_par`
- Missing `hole_stats_data` column for complete hole stats
- Missing additional scoring fields in `hole_stats` table

This mismatch caused your data to fail silently - the app tried to save but Supabase rejected it.

## What's Fixed
✅ **Rounds** - Now persist with complete hole stats
✅ **Clubs** - Now persist with updated average distances
✅ **Courses** - Now persist with all course details
✅ **Drives** - Continue to persist (already working)
✅ **Hole Stats** - Now stored as part of rounds (no data loss)
✅ **Auto-Suggest Club** - New feature: suggests best club based on distance to green

## How to Migrate Your Database

### Option 1: Using Supabase Dashboard (Recommended for Beginners)

1. Go to https://app.supabase.com
2. Select your project
3. Click "SQL Editor" in the sidebar
4. Click "New Query"
5. Copy the contents of `supabase-migration.sql` from your project root
6. Paste the entire migration script into the SQL editor
7. Click "Run" (or press Ctrl+Enter)
8. You should see: "Query executed successfully"

### Option 2: Using Supabase CLI

```bash
# Navigate to your project directory
cd golf-drive-tracker

# Run the migration
supabase db push

# Or if you prefer to run the script directly:
# supabase migration up --file supabase-migration.sql
```

### Option 3: Manual Column Addition (If Script Fails)

If the automated migration doesn't work, add columns manually:

1. Go to Supabase Dashboard → SQL Editor
2. Run these queries one at a time:

```sql
-- Add columns to rounds table
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS course_name TEXT DEFAULT 'Unknown',
  ADD COLUMN IF NOT EXISTS total_par INTEGER DEFAULT 72,
  ADD COLUMN IF NOT EXISTS hole_stats_data JSONB DEFAULT '{}'::jsonb;

-- Add columns to hole_stats table
ALTER TABLE hole_stats
  ADD COLUMN IF NOT EXISTS up_and_down BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sand_save BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tee_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS approach_accuracy TEXT,
  ADD COLUMN IF NOT EXISTS par INTEGER DEFAULT 4,
  ADD COLUMN IF NOT EXISTS distance INTEGER DEFAULT 0;

-- Add updated_at to clubs table
ALTER TABLE clubs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
```

## After Migration

1. **Refresh your app** - The app will automatically detect the new schema
2. **Test the features**:
   - Add/edit clubs in "Edit Your Bag"
   - Complete a practice hole with measurements
   - End the round and check if it saves
   - Refresh the page and verify data is still there
   - Check Supabase dashboard to see data in new columns

3. **Verify Data is Saving**:
   - In Supabase Dashboard, go to "Table Editor"
   - Click on "rounds" table
   - Look for entries with `course_name`, `total_par`, and `hole_stats_data`
   - Click on "clubs" table and verify `avg_distance` values are there

## New Feature: Auto-Suggest Approach Club

Once data is persisting correctly, you'll get a new feature:

1. **How it Works**:
   - Measure your tee shot (click "Measure Tee Shot" and "Mark Ball")
   - The app calculates "Distance to Green" (hole distance - drive distance)
   - It automatically suggests the best club from your bag
   - The club selector auto-fills with the suggestion

2. **How Selection Works**:
   - Finds club whose average distance is closest to remaining distance
   - Always rounds DOWN to avoid overshooting green
   - Example: If you have 140 yards to green:
     - 9-iron: 130 yards ✅ (selected - highest without overshooting)
     - 8-iron: 160 yards ❌ (would overshoot)

3. **Manual Override**:
   - You can still manually select a different club
   - Just click the dropdown and choose another

## Troubleshooting

### Migration Failed
- Make sure you're logged into Supabase
- Check that the SQL syntax is correct
- Try running the manual option (Option 3 above)

### Data Still Not Saving After Migration
1. Clear browser cache:
   - Settings → Clear browsing data → localStorage
2. Hard refresh the app (Ctrl+F5 or Cmd+Shift+R)
3. Check browser console for errors (F12 → Console tab)
4. Check Supabase dashboard for any error logs

### Migration Completed But Still No Data
- The app only saves data when:
  - You complete a round (click "End Round & Post Score")
  - You edit your clubs and click "Save Bag"
  - You create courses
- Try creating new test data and check Supabase

## Data Backup
Before running the migration, your data in localStorage is safe:
- All clubs you added are in browser localStorage
- When you sync to Supabase, it will merge with any existing data
- No data should be lost

## Questions or Issues?
If the migration fails or data still isn't persisting:
1. Check the app's browser console (F12 → Console) for error messages
2. Verify Supabase credentials are correct (check `.env` file)
3. Make sure your Supabase project is active and not paused

---

**After successful migration, all your golf data will persist permanently across:**
✅ Browser refreshes
✅ App redeployments
✅ Vercel deploys
✅ Even if Supabase is temporarily unavailable (uses localStorage fallback)
