-- Migration 002: reminder recurrence
-- Adds 'recurrence' (kind) + 'recurrence_minutes' (custom interval) columns.
-- Run in Supabase SQL Editor after 001_init.sql.

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS recurrence TEXT NOT NULL DEFAULT 'once'
    CHECK (recurrence IN ('once', 'daily', 'weekly', 'monthly', 'interval')),
  ADD COLUMN IF NOT EXISTS recurrence_minutes INTEGER;

-- recurrence_minutes only meaningful when recurrence='interval'.
-- Examples:  recurrence='daily',         recurrence_minutes=NULL
--            recurrence='interval',      recurrence_minutes=30   (every 30 min)
--            recurrence='interval',      recurrence_minutes=120  (every 2 h)

-- The scheduler (PRD §13.5, post-MVP) computes the next firing using these.
-- 'scheduled_at' remains the FIRST scheduled time.
