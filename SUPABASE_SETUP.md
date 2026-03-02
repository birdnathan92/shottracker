# Supabase Integration Setup Guide

This guide will help you set up Supabase to store your golf stats, rounds, and courses in the cloud.

## Step 1: Create Supabase Tables

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Click on **SQL Editor** in the left sidebar
3. Click **+ New Query**
4. Copy the entire contents of `supabase-setup.sql` from this project
5. Paste it into the SQL Editor
6. Click **Run** to create all the tables

## Step 2: Configure Environment Variables

The `.env` file has already been created with your Supabase credentials:

```
VITE_SUPABASE_URL="https://kqhebvcanrzvrvcvcmub.supabase.co"
VITE_SUPABASE_ANON_KEY="sb_publishable_VEN1QGXTli31Il7iICjiPQ_wzHOCyqP"
```

## Step 3: Install Dependencies

Run the following command to install the Supabase client:

```bash
npm install
```

The `@supabase/supabase-js` package has been added to your `package.json`.

## Data Syncing

Your app now automatically syncs the following data to Supabase:

### Courses
- Course names and locations
- Hole information (par, handicap, length)
- Automatically synced whenever you add or update a course

### Rounds
- Round dates and scores
- Total putts and score
- Automatically synced whenever you record a round

### Drives
- Individual drive data with GPS coordinates
- Distance and club information
- Associated with rounds

### Clubs
- Club names and average distances
- Your golf bag configuration

## How It Works

1. **Local First**: Data is first saved to localStorage (works offline)
2. **Cloud Sync**: When Supabase is available, data is automatically synced to the cloud (debounced every 1 second)
3. **Fallback**: If Supabase is unavailable, your app continues to work with local storage

## Security Notes

⚠️ **Important**: The current RLS (Row Level Security) policies allow all access. For production:

1. Go to **Authentication** > **Policies** in Supabase
2. Update the policies to restrict access to authenticated users only
3. Consider implementing user authentication in your app

## Accessing Your Data

You can view and manage your data directly in Supabase:

1. Go to https://app.supabase.com
2. Select your project
3. Click on **Table Editor** to view your data
4. Use **SQL Editor** to run custom queries

## Troubleshooting

### Tables not appearing
- Make sure you ran the SQL setup script
- Check that the SQL ran without errors

### Data not syncing
- Check the browser console (F12) for errors
- Make sure your `.env` file has the correct URLs and keys
- Verify your Supabase project is active

### CORS errors
- Go to **Project Settings** > **API** in Supabase
- Check your CORS configuration

## Next Steps

1. Start using your app - courses and rounds will sync automatically
2. Monitor the Supabase dashboard to see your data
3. (Optional) Set up authentication for multi-user support
