/*
  # Personal Dashboard Schema

  ## Overview
  Creates all necessary tables for a personal dashboard application with 7 modules.

  ## New Tables

  ### 1. quicklinks
  - `id` (uuid, primary key)
  - `title` (text) - Display name for the link
  - `url` (text) - Target URL
  - `icon` (text) - Optional icon name
  - `order_index` (integer) - For custom ordering
  - `created_at` (timestamptz)

  ### 2. projects
  - `id` (uuid, primary key)
  - `name` (text) - Project name
  - `description` (text) - Project description
  - `url` (text) - Optional project URL
  - `status` (text) - Project status (active, completed, archived)
  - `tags` (text array) - Project tags
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### 3. triggers
  - `id` (uuid, primary key)
  - `name` (text) - Trigger display name
  - `webhook_url` (text) - Webhook URL to call
  - `method` (text) - HTTP method (GET, POST)
  - `description` (text) - Optional description
  - `last_triggered_at` (timestamptz) - Last execution time
  - `created_at` (timestamptz)

  ### 4. short_urls
  - `id` (uuid, primary key)
  - `short_code` (text, unique) - The short URL identifier
  - `target_url` (text) - The destination URL
  - `clicks` (integer) - Click counter
  - `created_at` (timestamptz)

  ### 5. secrets
  - `id` (uuid, primary key)
  - `secret_code` (text, unique) - The secret identifier
  - `content` (text) - The encrypted/stored secret
  - `viewed` (boolean) - Whether it has been viewed
  - `expires_at` (timestamptz) - When the secret expires
  - `created_at` (timestamptz)

  ### 6. pastes
  - `id` (uuid, primary key)
  - `paste_code` (text, unique) - The paste identifier
  - `title` (text) - Optional paste title
  - `content` (text) - The paste content
  - `language` (text) - Syntax highlighting language
  - `expires_at` (timestamptz) - When the paste expires
  - `views` (integer) - View counter
  - `created_at` (timestamptz)

  ## Security
  All tables have RLS enabled. Since this is a personal dashboard, policies allow
  full access without authentication for simplicity. In production, you would add
  authentication and restrict access.

  ## Important Notes
  1. Using public access for simplicity - suitable for personal use
  2. All tables include standard timestamps
  3. Indexes added for frequently queried columns
  4. Default values set where appropriate
*/

-- Create quicklinks table
CREATE TABLE IF NOT EXISTS quicklinks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  url text NOT NULL,
  icon text DEFAULT 'link',
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create projects table
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text DEFAULT '',
  url text,
  status text DEFAULT 'active',
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create triggers table
CREATE TABLE IF NOT EXISTS triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  webhook_url text NOT NULL,
  method text DEFAULT 'POST',
  description text DEFAULT '',
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create short_urls table
CREATE TABLE IF NOT EXISTS short_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text UNIQUE NOT NULL,
  target_url text NOT NULL,
  clicks integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create secrets table
CREATE TABLE IF NOT EXISTS secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_code text UNIQUE NOT NULL,
  content text NOT NULL,
  viewed boolean DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create pastes table
CREATE TABLE IF NOT EXISTS pastes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paste_code text UNIQUE NOT NULL,
  title text DEFAULT 'Untitled',
  content text NOT NULL,
  language text DEFAULT 'plaintext',
  expires_at timestamptz,
  views integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE quicklinks ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastes ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (personal dashboard use)
-- Note: For production with multiple users, add authentication checks

CREATE POLICY "Allow all access to quicklinks"
  ON quicklinks FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to projects"
  ON projects FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to triggers"
  ON triggers FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to short_urls"
  ON short_urls FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to secrets"
  ON secrets FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all access to pastes"
  ON pastes FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_quicklinks_order ON quicklinks(order_index);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_short_urls_code ON short_urls(short_code);
CREATE INDEX IF NOT EXISTS idx_secrets_code ON secrets(secret_code);
CREATE INDEX IF NOT EXISTS idx_secrets_viewed ON secrets(viewed);
CREATE INDEX IF NOT EXISTS idx_pastes_code ON pastes(paste_code);
CREATE INDEX IF NOT EXISTS idx_pastes_expires ON pastes(expires_at);
CREATE INDEX IF NOT EXISTS idx_secrets_expires ON secrets(expires_at);